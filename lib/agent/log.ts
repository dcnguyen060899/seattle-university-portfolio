/**
 * lib/agent/log.ts — one JSON object per line, one line per request.
 *
 * Every field greppable, no free prose. That discipline is what makes the
 * runbook's alert conditions actual greps rather than "look at the logs":
 *
 *   reason:"budget_exhausted"        the prepaid balance is out. Page the owner.
 *   overclaim:1 rate above ~10%      calibration is failing; the prompt needs work,
 *                                    not the code.
 *   degraded:1 while mode:"live"     the model path is unhealthy.
 *   injection:1                      inspect, but expect a nonzero baseline. It is
 *                                    a public text box.
 *   citations_dropped above 2        corpus and prompt have drifted apart.
 *
 * NEVER LOGGED: the pasted job description, the question, the answer text, any
 * key or any part of one. A pasted posting may be confidential and unposted,
 * and a portfolio has no business keeping one. What is logged instead is its
 * LENGTH and a short hash, which is enough to tell two runs apart and to spot a
 * loop, and not enough to reconstruct anything.
 */

import { createHash } from 'node:crypto'

import type { Coverage, DegradedReason, Guardrails, Telemetry } from './contracts'
import { agentEnv } from './env'

export type LogLevel = 'info' | 'warn' | 'error'

export interface AgentLogLine {
  event: 'agent.brief' | 'agent.qa' | 'agent.canned' | 'agent.health'
  request_id: string
  ip: string
  mode: 'live' | 'demo'
  role: string
  jd_chars: number
  jd_sha: string
  corpus_version: string
  retrieved: number
  surfaced: number
  retrieved_ids: string
  tool_calls: string
  turns: number
  model: string | null
  in: number
  out: number
  cache_read: number
  cache_write: number
  cost_usd: number
  requirements: number
  direct: number
  adjacent: number
  partial: number
  no_evidence: number
  citations_dropped: number
  claims_redacted: number
  numbers_rejected: string
  urls_rejected: string
  verdicts_downgraded: string
  caveats_restored: string
  retractions_blocked: string
  overclaim: 0 | 1
  injection: 0 | 1
  degraded: 0 | 1
  reason: string
  ms_total: number
  ms_model: number
}

/** A short, non-reversible fingerprint. Enough to correlate, not to reconstruct. */
export function shortHash(text: string): string {
  if (!text) return '-'
  return createHash('sha256').update(text).digest('hex').slice(0, 8)
}

export function buildLogLine(input: {
  event: AgentLogLine['event']
  requestId: string
  ip: string
  mode: 'live' | 'demo'
  role: string
  jdText: string | null
  telemetry: Telemetry
  coverage: Coverage | null
  requirements: number
  guardrails: Guardrails
  degraded: boolean
  reason: DegradedReason | null
  turns: number
  msModel: number
}): AgentLogLine {
  const g = input.guardrails
  return {
    event: input.event,
    request_id: input.requestId,
    ip: input.ip,
    mode: input.mode,
    role: input.role,
    jd_chars: input.jdText?.length ?? 0,
    jd_sha: shortHash(input.jdText ?? ''),
    corpus_version: input.telemetry.corpus_version,
    retrieved: input.telemetry.retrieved,
    surfaced: input.telemetry.surfaced,
    retrieved_ids: input.telemetry.ranking.map((r) => r.evidence_id).join(','),
    tool_calls: input.telemetry.tool_calls.map((c) => `${c.name}(${c.args_summary})`).join(';'),
    turns: input.turns,
    model: input.telemetry.model,
    in: input.telemetry.usage.input_tokens,
    out: input.telemetry.usage.output_tokens,
    cache_read: input.telemetry.usage.cache_read_input_tokens,
    cache_write: input.telemetry.usage.cache_creation_input_tokens,
    cost_usd: input.telemetry.cost_usd,
    requirements: input.requirements,
    direct: input.coverage?.direct ?? 0,
    adjacent: input.coverage?.adjacent ?? 0,
    partial: input.coverage?.partial ?? 0,
    no_evidence: input.coverage?.no_evidence ?? 0,
    citations_dropped: g.citations_dropped,
    claims_redacted: g.claims_redacted,
    numbers_rejected: g.numbers_rejected.join(','),
    urls_rejected: g.urls_rejected.join(','),
    verdicts_downgraded: g.verdicts_downgraded.map((v) => `${v.index}:${v.from}->${v.to}`).join(';'),
    caveats_restored: g.caveats_restored.join(','),
    retractions_blocked: g.retractions_blocked.join(','),
    overclaim: g.overclaim_flagged ? 1 : 0,
    injection: g.injection_suspected ? 1 : 0,
    degraded: input.degraded ? 1 : 0,
    reason: input.reason ?? '-',
    ms_total: input.telemetry.ms,
    ms_model: input.msModel,
  }
}

export function emitLog(level: LogLevel, line: AgentLogLine): void {
  if (agentEnv().quietLogs) return
  const payload = JSON.stringify({ ts: new Date().toISOString(), level, ...line })
  if (level === 'error') console.error(payload)
  else if (level === 'warn') console.warn(payload)
  // `info` goes to stdout, which the platform captures. `no-console` allows
  // warn and error only, so the info path uses the same stream explicitly.
  else process.stdout.write(`${payload}\n`)
}
