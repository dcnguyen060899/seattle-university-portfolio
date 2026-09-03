/**
 * lib/agent/run.ts — the orchestrator. One generator, six stages, and ONE
 * structural guarantee:
 *
 *   THE RUN CANNOT END WITHOUT EMITTING A BRIEF.
 *
 * Not "every error path emits one" — that is a promise about branches somebody
 * has to remember. The emission sits after the try/catch, outside every branch,
 * and runs whether the body succeeded, threw, or degraded. The only way past it
 * is the consumer closing the stream, which means nobody is listening anyway.
 *
 * WHY A GENERATOR RATHER THAN A RESPONSE WRITER. The same generator drives the
 * SSE stream and the non-streaming JSON reply. One code path produces both, so
 * the `curl` answer and the browser answer cannot disagree — the contract test
 * asserts they agree byte for byte apart from the measured milliseconds.
 *
 * WHY STAGES AND NOT TOKENS. The brief is a structured object that must pass
 * the fact check before any of it reaches a human. Streaming tokens would put
 * an unverified claim about a real person's real credentials on screen and then
 * have to retract it — the exact failure this whole design exists to prevent.
 * You cannot stream a claim you have not checked yet. So what streams is
 * progress that is real, and the brief arrives in one paint.
 */

import { retrieve } from '../corpus/retrieve'
import type { RoleProfileId } from '../corpus/types'
import { cannedBrief, provenanceSentence } from './canned'
import type { AgentRoleId, BriefEnvelope, Coverage, DegradedReason, FitBrief, Guardrails, MetaEvent, Telemetry, TraceStage } from './contracts'
import { classifyError, levelForReason, messageForReason, resolveModelFn } from './client'
import { CORPUS_SIZE, CORPUS_VERSION } from './corpus'
import { costUsd, zeroUsage } from './cost'
import { composeDeterministicBrief, nearestRole, profileForRole } from './degraded'
import { agentEnv, agentMode, capabilities } from './env'
import { runLoop } from './loop'
import { buildLogLine, emitLog } from './log'
import { emptyGuardrails, factCheckBrief, factCheckAnswer, guardrailTotal } from './postcheck'
import type { CheckedBrief } from './postcheck'
import { AGENT_CORE, QA_CORE, buildBriefTurn, buildQaTurn, roleLabelFor, systemBlocks, FORCE_ANSWER_MESSAGE, FORCE_EMIT_MESSAGE, REPAIR_MESSAGE } from './prompts'
import { caveatRecordsFor, gapsForQuestion, searchForQuestion, shortlistFrom } from './retrieval'
import { BRIEF_TOOLS, QA_TOOLS } from './schemas'
import { looksLikeDirective, sanitiseUntrusted, sanitiseUntrustedLine } from './untrusted'
import type { AnswerEnvelope, QaTurn } from './contracts'

export type RunEvent =
  | { event: 'meta'; data: MetaEvent }
  | { event: 'stage'; data: TraceStage }
  | { event: 'brief'; data: BriefEnvelope }
  | { event: 'answer'; data: AnswerEnvelope }
  | { event: 'done'; data: { ms: number; cost_usd: number } }

export interface BriefRunInput {
  requestId: string
  role: AgentRoleId | null
  jd: string
  signal: AbortSignal
  /** For the rate-limit key and the log line only. Never used for anything else. */
  ip?: string
  /** Set when the caller has already decided this run must not touch the model. */
  forceReason?: DegradedReason | null
}

/**
 * What the run strip prints as the model.
 *
 * The in-process test stand-in must never be reported as the real model. A page
 * that prints "claude-opus-5" while no model call happened has fabricated the
 * one number the whole demonstration layer rests on — the same defect as the
 * code path that slept for three seconds to look busy. env.ts already refuses
 * the stand-in in production; this makes it visible everywhere else.
 */
const reportedModel = (live: boolean): string | null => {
  if (!live) return null
  const env = agentEnv()
  return env.fakeModel ? 'in-process test stand-in (no model call)' : env.model
}

const stage = (
  name: TraceStage['stage'],
  status: TraceStage['status'],
  started: number,
  detail: string,
): TraceStage => ({ stage: name, status, ms: Math.max(0, Math.round(Date.now() - started)), detail })

function baseTelemetry(overrides: Partial<Telemetry> = {}): Telemetry {
  return {
    model: null,
    runtime: 'nodejs',
    region: agentEnv().region,
    mode: agentMode(),
    corpus_version: CORPUS_VERSION,
    corpus_size: CORPUS_SIZE,
    retrieved: CORPUS_SIZE,
    surfaced: 0,
    ranking: [],
    tool_calls: [],
    usage: zeroUsage(),
    cost_usd: 0,
    ms: 0,
    ...overrides,
  }
}

/* ── the pre-built path ────────────────────────────────────────────────────── */

/**
 * A pre-built brief, with the truthful sentence about where it came from.
 *
 * The committed canned file is preferred, because it carries a provenance
 * record saying which composer produced it. If it is missing or stale for the
 * current corpus, the brief is composed on the spot from the same records — the
 * page must never be worse than the last time somebody remembered to run a
 * script.
 */
export function prebuiltEnvelope(input: {
  requestId: string
  role: AgentRoleId
  reason: DegradedReason
  trace: TraceStage[]
  telemetry: Telemetry
  jdText?: string | null
  /** Passed straight through to the composer. See ComposeOptions in degraded.ts. */
  directiveSuspected?: boolean
}): BriefEnvelope {
  let brief: FitBrief
  let coverage: Coverage
  let guardrails: Guardrails
  let provenance: string

  try {
    // A PASTED POSTING IS NEVER ANSWERED FROM A FILE. The pre-built brief is for
    // a role chip; when a recruiter has taken the trouble to paste their own
    // requirements, the deterministic composer answers those requirements from
    // the same records, which costs nothing and is a materially better answer
    // than the nearest template.
    if (input.jdText) throw new Error('compose from the posting')
    const canned = cannedBrief(input.role)
    if (canned.provenance.corpusVersion !== CORPUS_VERSION) throw new Error('stale')
    // DEEP COPY, DELIBERATELY. `cannedBrief()` hands back the parsed JSON module
    // object, which is process-wide and shared by every request this instance
    // serves. Callers legitimately annotate the envelope after it is built (the
    // injection flag below; the guardrail counters on the fact-check discard
    // path), and a single mutation of the shared object would persist into every
    // later recruiter's brief. The briefs are a few KB; the copy is free next to
    // the request that carries it.
    brief = structuredClone(canned.brief)
    coverage = structuredClone(canned.coverage)
    guardrails = structuredClone(canned.guardrails)
    provenance = provenanceSentence(canned.provenance)
  } catch {
    const composed = composeDeterministicBrief(profileForRole(input.role) as RoleProfileId, {
      jdText: input.jdText ?? undefined,
      directiveSuspected: input.directiveSuspected,
    })
    brief = composed.brief
    coverage = composed.coverage
    guardrails = composed.guardrails
    provenance = input.jdText
      ? "Composed just now against the requirements you pasted, directly from the same evidence records by this site's own retriever — no model wrote it — and it passed the same checks."
      : "Composed just now, directly from the same evidence records by this site's own retriever — no model wrote it — and it passed the same checks."
  }

  return {
    ok: true,
    request_id: input.requestId,
    degraded: true,
    reason: input.reason,
    message: `${messageForReason(input.reason)} ${provenance}`,
    brief,
    coverage,
    guardrails,
    trace: input.trace,
    telemetry: input.telemetry,
  }
}

/* ── the brief run ─────────────────────────────────────────────────────────── */

export async function* runBriefEvents(input: BriefRunInput): AsyncGenerator<RunEvent, void> {
  const t0 = Date.now()
  const trace: TraceStage[] = []
  const pushStage = (s: TraceStage): TraceStage => {
    trace.push(s)
    return s
  }

  const env = agentEnv()
  const live = capabilities().agent && !input.forceReason

  yield {
    event: 'meta',
    data: {
      request_id: input.requestId,
      runtime: 'nodejs',
      region: env.region,
      model: reportedModel(live),
      corpus_version: CORPUS_VERSION,
      corpus_size: CORPUS_SIZE,
      mode: agentMode(),
    },
  }

  // ── 1. validate ────────────────────────────────────────────────────────────
  const tValidate = Date.now()
  const rawJd = input.jd.trim()
  const jd = rawJd ? sanitiseUntrusted(rawJd) : null
  const role = nearestRole(jd, input.role)
  const roleLabel = roleLabelFor(role)
  const directiveSuspected = jd ? looksLikeDirective(jd) : false
  yield {
    event: 'stage',
    data: pushStage(
      stage(
        'validate',
        'ok',
        tValidate,
        jd
          ? `read ${jd.length} characters of pasted text${directiveSuspected ? '; it contained an instruction, which was read as data' : ''}`
          : `role selected: ${roleLabel}`,
      ),
    ),
  }

  // ── 2. retrieve ────────────────────────────────────────────────────────────
  const tRetrieve = Date.now()
  const retrieval = retrieve({
    profileId: input.role ? (profileForRole(input.role) as RoleProfileId) : undefined,
    jdText: jd ?? undefined,
  })
  const shortlist = shortlistFrom(retrieval, 9)
  const caveatRecords = caveatRecordsFor(shortlist)
  const writtenGaps = retrieval.requirements
    .filter((r) => r.gap)
    .map((r) => ({ requirement: r.label, sentence: r.gap!.honestAnswer }))

  const telemetry = baseTelemetry({
    model: reportedModel(live),
    surfaced: shortlist.length,
    ranking: shortlist.map((r) => ({
      evidence_id: r.record.id,
      score: r.score,
      matched: r.matched,
      via: r.via,
    })),
  })

  yield {
    event: 'stage',
    data: pushStage(
      stage(
        'retrieve',
        'ok',
        tRetrieve,
        `${CORPUS_SIZE} records ranked; top ${shortlist.length} sent` +
          (shortlist.length
            ? `; matched on ${[...new Set(shortlist.flatMap((r) => r.matched))].slice(0, 4).join(', ')}`
            : ''),
      ),
    ),
  }

  let envelope: BriefEnvelope | null = null
  let modelMsTotal = 0

  if (!live) {
    // The deliberate pre-built path, or a deploy that is not calling the model.
    //
    // THE DETERMINISTIC HALF OF THE INJECTION DEFENCE REPORTS ITSELF HERE.
    // `looksLikeDirective()` does not need a model, so it holds in demo mode —
    // which is the mode a stranger actually gets. Without this line the
    // containment is real (the pasted text never reaches a prompt) and entirely
    // INVISIBLE: the recruiter who pasted an injection would be handed an
    // ordinary-looking brief with nothing said. spec-04 §1.6 names this case
    // for the canned path specifically, and `injection_blocked` already carries
    // the exact sentence. On this page, showing the mechanism IS the
    // deliverable; a defence that works silently teaches the reader nothing.
    const reason: DegradedReason =
      input.forceReason ??
      (directiveSuspected
        ? 'injection_blocked'
        : agentMode() === 'demo'
          ? 'demo_mode'
          : 'not_configured')
    yield {
      event: 'stage',
      data: pushStage(
        stage(
          'generate',
          'skipped',
          Date.now(),
          reason === 'prebuilt'
            ? 'served the pre-built brief for this role; no model call was made'
            : 'this deploy is not calling the model; served the pre-built brief',
        ),
      ),
    }
    telemetry.ms = Date.now() - t0
    envelope = prebuiltEnvelope({
      requestId: input.requestId,
      role,
      reason,
      trace,
      telemetry,
      jdText: jd,
      directiveSuspected,
    })
    if (directiveSuspected) {
      envelope.guardrails.injection_suspected = true
      if (!envelope.brief.observed_directives.length) {
        envelope.brief.observed_directives.push(
          'the pasted text contained an instruction rather than a requirement',
        )
      }
    }
  } else {
    try {
      const modelFn = await resolveModelFn()
      const userTurn = buildBriefTurn({
        role: input.role,
        roleLabel,
        jd,
        shortlist,
        caveatRecords,
        writtenGaps,
        corpusSize: CORPUS_SIZE,
      })

      let emitted: unknown = null
      for await (const ev of runLoop({
        system: systemBlocks(AGENT_CORE),
        userTurn,
        tools: BRIEF_TOOLS,
        emitToolName: 'emit_fit_brief',
        forceMessage: FORCE_EMIT_MESSAGE,
        repairMessage: REPAIR_MESSAGE,
        maxTokens: env.briefMaxTokens,
        deadlineMs: env.briefDeadlineMs,
        signal: input.signal,
        modelFn,
      })) {
        if (ev.type === 'stage') {
          yield { event: 'stage', data: pushStage(ev.stage) }
        } else {
          emitted = ev.result.emitted
          telemetry.usage = ev.result.usage
          telemetry.tool_calls = ev.result.toolCalls
          modelMsTotal = ev.result.modelMs
        }
      }
      telemetry.cost_usd = costUsd(env.model, telemetry.usage)

      // ── 3. the fact check. Exactly one call site, and it is here. ──────────
      const tCheck = Date.now()
      const checked: CheckedBrief = factCheckBrief(emitted, {
        roleLabel,
        jdSource: jd ? 'pasted_jd' : 'role_chip',
      })
      if (directiveSuspected) {
        // The two halves of the defence are OR-ed, never overwritten. postcheck
        // sets this from what the MODEL reported seeing; `looksLikeDirective()`
        // is what the deterministic scanner saw. A model that quietly declined
        // to mention the directive must not be able to clear the flag.
        checked.guardrails.injection_suspected = true
        if (!checked.brief.observed_directives.length) {
          checked.brief.observed_directives.push(
            'the pasted text contained an instruction rather than a requirement',
          )
        }
      }

      yield {
        event: 'stage',
        data: pushStage(
          stage('factcheck', checked.discard ? 'degraded' : 'ok', tCheck, checked.detail),
        ),
      }

      if (checked.discard) {
        telemetry.ms = Date.now() - t0
        const degraded = prebuiltEnvelope({
          requestId: input.requestId,
          role,
          reason: checked.discard,
          trace,
          telemetry,
          jdText: jd,
          directiveSuspected,
        })
        // The guardrail counters from the DISCARDED run are what make the
        // refusal legible. Losing them would leave the page saying it discarded
        // something without being able to say what.
        degraded.guardrails = checked.guardrails
        envelope = degraded
      } else {
        telemetry.ms = Date.now() - t0
        envelope = {
          ok: true,
          request_id: input.requestId,
          degraded: false,
          reason: null,
          message: null,
          brief: checked.brief,
          coverage: checked.coverage,
          guardrails: checked.guardrails,
          trace,
          telemetry,
        }
      }
    } catch (err) {
      const reason = classifyError(err)
      yield {
        event: 'stage',
        data: pushStage(stage('generate', 'error', Date.now(), messageForReason(reason))),
      }
      telemetry.ms = Date.now() - t0
      telemetry.cost_usd = costUsd(env.model, telemetry.usage)
      envelope = prebuiltEnvelope({
        requestId: input.requestId,
        role,
        reason,
        trace,
        telemetry,
        jdText: jd,
        directiveSuspected,
      })
    }
  }

  // ── 4. render. Unconditional: the run cannot end without a brief. ──────────
  const tRender = Date.now()
  const final =
    envelope ??
    prebuiltEnvelope({
      requestId: input.requestId,
      role,
      reason: 'internal_error',
      trace,
      telemetry,
      jdText: jd,
      directiveSuspected,
    })

  final.trace = trace
  final.trace.push(
    stage(
      'render',
      'ok',
      tRender,
      `${final.brief.requirements.length} requirements, ` +
        `${final.brief.requirements.reduce((n, r) => n + r.evidence.filter((e) => e.artifact_url).length, 0)} links, ` +
        `${guardrailTotal(final.guardrails)} statements changed by the check`,
    ),
  )
  final.telemetry.ms = Date.now() - t0

  // ── the one log line ───────────────────────────────────────────────────────
  // One JSON object, one request, every field greppable. Never the pasted text:
  // a posting may be confidential and unposted, and a portfolio has no business
  // keeping one. Length and a short hash are enough to spot a loop and not
  // enough to reconstruct anything.
  emitLog(levelForReason(final.reason), buildLogLine({
    event: 'agent.brief',
    requestId: input.requestId,
    ip: input.ip ?? 'unknown',
    mode: agentMode(),
    role,
    jdText: jd,
    telemetry: final.telemetry,
    coverage: final.coverage,
    requirements: final.brief.requirements.length,
    guardrails: final.guardrails,
    degraded: final.degraded,
    reason: final.reason,
    turns: final.telemetry.tool_calls.length + 1,
    msModel: modelMsTotal,
  }))

  yield { event: 'brief', data: final }
  yield { event: 'done', data: { ms: final.telemetry.ms, cost_usd: final.telemetry.cost_usd } }
}

/* ── the Q&A run ───────────────────────────────────────────────────────────── */

export interface QaRunInput {
  requestId: string
  question: string
  history: QaTurn[]
  signal: AbortSignal
  ip?: string
}

export async function* runQaEvents(input: QaRunInput): AsyncGenerator<RunEvent, void> {
  const t0 = Date.now()
  const trace: TraceStage[] = []
  const env = agentEnv()
  const live = capabilities().agent

  yield {
    event: 'meta',
    data: {
      request_id: input.requestId,
      runtime: 'nodejs',
      region: env.region,
      model: reportedModel(live),
      corpus_version: CORPUS_VERSION,
      corpus_size: CORPUS_SIZE,
      mode: agentMode(),
    },
  }

  const tValidate = Date.now()
  const question = sanitiseUntrustedLine(input.question, 400)
  const history = input.history.slice(-3).map((t) => ({
    question: sanitiseUntrustedLine(t.question),
    answer: sanitiseUntrustedLine(t.answer),
  }))
  const validate = stage('validate', 'ok', tValidate, `read a ${question.length}-character question`)
  trace.push(validate)
  yield { event: 'stage', data: validate }

  const tRetrieve = Date.now()
  const shortlist = searchForQuestion(question, 6)
  const telemetry = baseTelemetry({
    model: reportedModel(live),
    surfaced: shortlist.length,
    ranking: shortlist.map((r) => ({
      evidence_id: r.record.id,
      score: r.score,
      matched: r.matched,
      via: r.via,
    })),
  })
  const retrieveStage = stage(
    'retrieve',
    'ok',
    tRetrieve,
    `${CORPUS_SIZE} records ranked; top ${shortlist.length} sent`,
  )
  trace.push(retrieveStage)
  yield { event: 'stage', data: retrieveStage }

  const gapSentences = gapsForQuestion(question)

  let envelope: AnswerEnvelope | null = null

  if (!live) {
    const reason: DegradedReason = agentMode() === 'demo' ? 'demo_mode' : 'not_configured'
    const skipped = stage(
      'generate',
      'skipped',
      Date.now(),
      'this deploy is not calling the model; answered from the evidence records directly',
    )
    trace.push(skipped)
    yield { event: 'stage', data: skipped }
    telemetry.ms = Date.now() - t0
    envelope = deterministicAnswerEnvelope(input.requestId, shortlist, gapSentences, reason, trace, telemetry)
  } else {
    try {
      const modelFn = await resolveModelFn()
      const userTurn = buildQaTurn({
        question,
        history,
        shortlist,
        writtenGaps: gapSentences,
        corpusSize: CORPUS_SIZE,
      })
      let emitted: unknown = null
      for await (const ev of runLoop({
        system: systemBlocks(QA_CORE),
        userTurn,
        tools: QA_TOOLS,
        emitToolName: 'emit_answer',
        forceMessage: FORCE_ANSWER_MESSAGE,
        repairMessage: REPAIR_MESSAGE,
        maxTokens: env.qaMaxTokens,
        deadlineMs: env.qaDeadlineMs,
        signal: input.signal,
        modelFn,
      })) {
        if (ev.type === 'stage') {
          trace.push(ev.stage)
          yield { event: 'stage', data: ev.stage }
        } else {
          emitted = ev.result.emitted
          telemetry.usage = ev.result.usage
          telemetry.tool_calls = ev.result.toolCalls
        }
      }
      telemetry.cost_usd = costUsd(env.model, telemetry.usage)

      const tCheck = Date.now()
      const checked = factCheckAnswer(emitted)
      const checkStage = stage(
        'factcheck',
        checked.discard ? 'degraded' : 'ok',
        tCheck,
        checked.detail,
      )
      trace.push(checkStage)
      yield { event: 'stage', data: checkStage }

      telemetry.ms = Date.now() - t0
      envelope = {
        ok: true,
        request_id: input.requestId,
        degraded: Boolean(checked.discard),
        reason: checked.discard ?? null,
        message: checked.discard ? messageForReason(checked.discard) : null,
        answer: checked.answer,
        guardrails: checked.guardrails,
        trace,
        telemetry,
      }
    } catch (err) {
      const reason = classifyError(err)
      const errorStage = stage('generate', 'error', Date.now(), messageForReason(reason))
      trace.push(errorStage)
      yield { event: 'stage', data: errorStage }
      telemetry.ms = Date.now() - t0
      telemetry.cost_usd = costUsd(env.model, telemetry.usage)
      envelope = deterministicAnswerEnvelope(input.requestId, shortlist, gapSentences, reason, trace, telemetry)
    }
  }

  const final = envelope
  final.telemetry.ms = Date.now() - t0

  emitLog(levelForReason(final.reason), buildLogLine({
    event: 'agent.qa',
    requestId: input.requestId,
    ip: input.ip ?? 'unknown',
    mode: agentMode(),
    role: '-',
    jdText: null,
    telemetry: final.telemetry,
    coverage: null,
    requirements: 0,
    guardrails: final.guardrails,
    degraded: final.degraded,
    reason: final.reason,
    turns: final.telemetry.tool_calls.length + 1,
    msModel: 0,
  }))

  yield { event: 'answer', data: final }
  yield { event: 'done', data: { ms: final.telemetry.ms, cost_usd: final.telemetry.cost_usd } }
}

/**
 * An answer with no model involved: the strongest record's own sentence, or the
 * written-in-advance sentence for a gap, or an honest "not here".
 *
 * The gap sentences come first deliberately. When a question is about something
 * Duy has not done, the correct answer is the one a human wrote in advance for
 * exactly that question — not the nearest positive record dressed up to look
 * like one.
 */
function deterministicAnswerEnvelope(
  requestId: string,
  shortlist: ReturnType<typeof searchForQuestion>,
  gapSentences: string[],
  reason: DegradedReason,
  trace: TraceStage[],
  telemetry: Telemetry,
): AnswerEnvelope {
  const guardrails = emptyGuardrails()
  const first = shortlist[0]
  const gap = gapSentences[0]

  const answer = gap
    ? { text: gap, citations: [] as never[] }
    : first
      ? {
          text: first.record.statement,
          citations: [],
        }
      : { text: '', citations: [] }

  const raw = answer.text
    ? {
        answer: answer.text,
        citations: first && !gap
          ? [
              {
                evidence_id: first.record.id,
                quoted_claim: first.record.statement,
                artifact_label: first.record.links[0]?.title ?? first.record.subjectLabel,
                artifact_url:
                  first.record.links.find((l) => l.access === 'public' && l.url)?.url ?? '',
              },
            ]
          : [],
        confidence: 'medium' as const,
        refused_reason: '' as const,
        observed_directives: [],
      }
    : {
        answer:
          'That is not something this site has a record for. dnguyen44@seattleu.edu is the fastest way to ask Duy directly.',
        citations: [],
        confidence: 'low' as const,
        refused_reason: 'not_in_corpus' as const,
        observed_directives: [],
      }

  const checked = factCheckAnswer(raw)

  return {
    ok: true,
    request_id: requestId,
    degraded: true,
    reason,
    message: messageForReason(reason),
    answer: checked.answer,
    guardrails: checked.discard ? guardrails : checked.guardrails,
    trace,
    telemetry,
  }
}
