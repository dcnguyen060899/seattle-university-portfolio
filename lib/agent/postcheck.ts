/**
 * lib/agent/postcheck.ts — THE FACT CHECK. Between the model and every byte a
 * recruiter sees. Not optional, not sampled, not skippable by config, and there
 * is exactly one call site.
 *
 * THE ORGANISING PRINCIPLE, ported from the Python evaluation package this
 * replaces:
 *
 *   Where the server has independent evidence, the SERVER'S VALUE WINS and the
 *   model's is recorded as adjusted. Where it does not, the model's value is
 *   filtered, capped or redacted AT SENTENCE GRANULARITY — never blanked
 *   silently, and never left as an empty string that reads like an omission.
 *
 * WHY THIS FILE IS THE DEMONSTRATION
 * ----------------------------------
 * The page's argument is that a result which lives in a notebook is not yet a
 * system anyone can run. The difference is not a deployment diagram; it is that
 * a deployed system knows when its own output is not trustworthy and refuses to
 * publish it. Every counter this file increments is shown to the reader.
 *
 * THE ONE-WAY RULE. Every transformation here makes the brief MORE
 * conservative. A verdict may be lowered and may never be raised; a citation
 * may be dropped and may never be added; a caveat may be appended and may never
 * be removed. `neverUpgraded()` is asserted as a property test over randomised
 * inputs, not just checked by reading.
 */

import { claimById } from '../corpus/index'
import type { ClaimId } from '../corpus/types'
import type {
  BriefRequirement,
  Citation,
  Coverage as CoverageCounts,
  DegradedReason,
  FitBrief,
  Guardrails,
  Verdict,
} from './contracts'
import {
  CAPS,
  VERDICT_RANK,
  WITHHELD,
  agentAnswerSchema,
  fitBriefSchema,
} from './contracts'
import type { AgentAnswer } from './contracts'
import {
  NUMBER_TOKEN,
  URL_TOKEN,
  findRetracted,
  isAllowedUrl,
  isLicensedNumber,
  normaliseUrl,
  recordById,
} from './corpus'
import { coverageForQuery } from './retrieval'

/* ── normalisation ─────────────────────────────────────────────────────────── */

/**
 * What makes the verbatim test robust to the model re-punctuating a quote while
 * still catching a rewritten one. Strips sentence punctuation and inline
 * markdown decoration, collapses whitespace, lowercases, and folds the
 * typographic quotes and dashes a model reaches for when it "tidies" a quote.
 */
export function norm(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[`*_"']/g, '')
    .replace(/[.!?,;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Sentence split for unit-level redaction. Deliberately crude: it splits on
 * terminal punctuation followed by a space, and treats a whole field with no
 * terminator as one unit. A cleverer splitter would occasionally merge two
 * sentences, and merging is the failure that silently keeps a bad claim.
 */
export function splitUnits(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/).filter((p) => p.trim().length > 0)
  return parts.length ? parts : text.trim() ? [text.trim()] : []
}

/**
 * A requirement's framing note, reduced to the part a RECRUITER should read.
 *
 * Some of those notes end with an instruction addressed to whoever is writing
 * the brief — "Say 'under review', never 'published'." That instruction is
 * correct and it is not a sentence to show a hiring manager, who did not ask
 * for a style guide. So an imperative sentence aimed at the writer is dropped
 * and the substantive half is kept.
 *
 * The rule is deliberately narrow: a small set of leading verbs, matched at the
 * start of a sentence only. It cannot swallow a claim, because a claim about
 * Duy is in the third person and never begins with one of these.
 */
const WRITER_INSTRUCTION = /^(?:say|never say|do not|don't|avoid|use|write|mark|state)\b/i

export function framingNote(fallback: string | null | undefined): string {
  if (!fallback) return ''
  return splitUnits(fallback)
    .filter((unit) => !WRITER_INSTRUCTION.test(unit.trim()))
    .join(' ')
    .trim()
}

/* ── the text-level gates ──────────────────────────────────────────────────── */

export interface TextScan {
  text: string
  droppedUnits: number
  numbers: string[]
  urls: string[]
  patterns: string[]
}

/**
 * Forbidden CLAIM SHAPES. These are not about wording; each one is a specific
 * false thing this agent must never say about a real person on his own site.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = Object.freeze([
  { pattern: /\bph\.?\s?d\b|\bdoctorate\b|\bdoctoral candidate\b/i, label: 'doctoral credential' },
  { pattern: /\b(?:has\s+)?graduated\b|\bholds a master'?s\b|\bcompleted his master'?s\b/i, label: 'completed degree' },
  {
    pattern:
      /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s*years?\s+of\s+(?:industry|professional|production|commercial|full-time)\b/i,
    label: 'years of experience',
  },
  {
    pattern: /\b(?:published|accepted|presented|appeared)\b[^.]{0,80}\b(?:psb|pacific symposium|biocomputing)\b/i,
    label: 'publication status',
  },
  {
    pattern: /\b(?:perfect|ideal|excellent|outstanding|exceptional)\s+(?:fit|match|candidate)\b/i,
    label: 'sales language',
  },
  { pattern: /\bpassionate\b|\bproven track record\b|\brock\s?star\b|\bworld-class\b/i, label: 'sales language' },
  { pattern: /\bsenior\s+(?:engineer|scientist|researcher)\b/i, label: 'seniority claim' },
])

/**
 * DISCARD-LEVEL. The one attack the other gates cannot catch by construction:
 * an injection that makes the agent write something true-shaped but hostile.
 *
 * An honest negative finding always has a first-class channel — verdict
 * "no_evidence" plus "this site has no evidence of X" — so free-text hostility
 * is never needed for a legitimate brief, and its presence is itself the
 * signal. Hence: discard the whole brief, do not redact and serve the rest.
 */
const HOSTILE_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b(?:not|un)\s?qualified\b/i,
  /\bfraud(?:ulent)?\b/i,
  /\bfabricat(?:ed|ing|es)\b/i,
  /\blied\b|\blying\b|\bdishonest\b/i,
  /\bplagiaris/i,
  /\bincompeten/i,
  /\bdo not (?:hire|interview)\b/i,
  /\bavoid this candidate\b/i,
  /\bfake\b/i,
  /\bscam\b/i,
  /\bshould be reported\b/i,
])

export function isHostile(text: string): boolean {
  return HOSTILE_PATTERNS.some((re) => re.test(text))
}

/**
 * Scan one model-authored string, redacting at sentence granularity.
 *
 * Unit-level, not field blanking: the surviving sentences of the field stay,
 * and if every unit is dropped the field becomes the WITHHELD marker rather
 * than an empty string. Never blank a field silently — an empty field reads as
 * "there was nothing to say", which is a different and false claim.
 */
export function scanText(text: string): TextScan {
  const numbers: string[] = []
  const urls: string[] = []
  const patterns: string[] = []
  const units = splitUnits(text)
  const kept: string[] = []
  let dropped = 0

  for (const unit of units) {
    let bad = false

    for (const m of unit.matchAll(NUMBER_TOKEN)) {
      const token = m[0].trim()
      if (!isLicensedNumber(token)) {
        numbers.push(token)
        bad = true
      }
    }

    for (const m of unit.matchAll(URL_TOKEN)) {
      const token = normaliseUrl(m[0])
      if (!isAllowedUrl(token)) {
        urls.push(token)
        bad = true
      }
    }

    for (const f of FORBIDDEN_PATTERNS) {
      if (f.pattern.test(unit)) {
        patterns.push(f.label)
        bad = true
      }
    }

    if (bad) dropped += 1
    else kept.push(unit)
  }

  const out = kept.join(' ').trim()
  return {
    text: units.length > 0 && kept.length === 0 ? WITHHELD : out,
    droppedUnits: dropped,
    numbers,
    urls,
    patterns,
  }
}

function cap(text: string, limit: number): string {
  if (text.length <= limit) return text
  // Cut at a word boundary and mark it, rather than slicing mid-word and
  // pretending the sentence ended.
  const slice = text.slice(0, limit - 1)
  const lastSpace = slice.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`
}

/* ── the checked result ────────────────────────────────────────────────────── */

export interface CheckedBrief {
  brief: FitBrief
  coverage: CoverageCounts
  guardrails: Guardrails
  /** Set when the brief must be thrown away entirely and a pre-built one served. */
  discard: DegradedReason | null
  /** What the trace row says. Plain English, not JSON. */
  detail: string
}

export function emptyGuardrails(): Guardrails {
  return {
    citations_dropped: 0,
    claims_redacted: 0,
    numbers_rejected: [],
    urls_rejected: [],
    verdicts_downgraded: [],
    caveats_restored: [],
    overclaim_flagged: false,
    injection_suspected: false,
    retractions_blocked: [],
  }
}

/** The number the run strip renders. Everything the check deleted or repaired. */
export function guardrailTotal(g: Guardrails): number {
  return (
    g.citations_dropped +
    g.claims_redacted +
    g.numbers_rejected.length +
    g.urls_rejected.length +
    g.verdicts_downgraded.length +
    g.caveats_restored.length
  )
}

/* ── citation validity ─────────────────────────────────────────────────────── */

interface CitationCheck {
  kept: Citation[]
  dropped: number
}

function checkCitations(citations: readonly Citation[], g: Guardrails): CitationCheck {
  const kept: Citation[] = []
  let dropped = 0

  for (const c of citations) {
    const record = recordById(c.evidence_id)
    if (!record) {
      dropped += 1
      continue
    }

    // The URL must be one this record actually carries, or empty. Never a URL
    // from another record, and never one that was constructed.
    const url = normaliseUrl(c.artifact_url.trim())
    const recordUrls = record.links
      .filter((l) => l.access === 'public' && l.url)
      .map((l) => normaliseUrl(l.url as string))
    if (url !== '' && !recordUrls.includes(url)) {
      g.urls_rejected.push(url)
      dropped += 1
      continue
    }

    // The quote must be a verbatim substring of something this record says.
    const haystack = norm(
      [record.statement, record.short, record.value?.display ?? '', record.value?.baseline ?? '']
        .filter(Boolean)
        .join('  '),
    )
    const needle = norm(c.quoted_claim)
    if (needle.length < 12) {
      dropped += 1
      continue
    }
    if (!haystack.includes(needle)) {
      dropped += 1
      continue
    }

    kept.push({
      evidence_id: c.evidence_id,
      quoted_claim: cap(c.quoted_claim.trim(), CAPS.quoted_claim),
      artifact_label: cap(c.artifact_label.trim(), CAPS.artifact_label),
      artifact_url: url,
    })
    if (kept.length >= 3) break
  }

  g.citations_dropped += dropped
  return { kept, dropped }
}

/* ── the calibration ceiling ───────────────────────────────────────────────── */

/**
 * The verdict the SERVER's own retrieval supports. The model's verdict is
 * lowered to this when it is stronger; it is never raised to it.
 *
 * The mapping is the corpus's own coverage vocabulary, not a second set of
 * thresholds invented here — `coursework-only` exists in that vocabulary
 * precisely so "he has done this, in a class" and "he has done this, in
 * production" cannot collapse into one answer.
 *
 * THE ONE SOFTENING, and the reason for it: when the retriever finds nothing
 * but the model's citations SURVIVED the verbatim check, the ceiling is
 * `partial` rather than `no_evidence`. The retriever's vocabulary is an alias
 * table, and a requirement phrased in words it does not know is a gap in the
 * table, not proof that the cited record does not exist. Disagreeing with the
 * model is a reason to be more conservative, not a licence to erase a record
 * that was quoted correctly.
 */
export function verdictCeiling(coverage: Coverage, hasSurvivingCitations: boolean): Verdict {
  switch (coverage) {
    case 'strong':
      return 'direct'
    case 'partial':
      return 'adjacent'
    case 'coursework-only':
      return 'partial'
    case 'none':
      return hasSurvivingCitations ? 'partial' : 'no_evidence'
  }
}

type Coverage = 'strong' | 'partial' | 'coursework-only' | 'none'

const CEILING_REASON: Readonly<Record<Coverage, string>> = Object.freeze({
  strong: 'the site retriever found strong evidence for this wording',
  partial: 'the site retriever found related but not matching evidence',
  'coursework-only': 'the only evidence the site retriever found for this is coursework',
  none: 'the site retriever found no match for this wording',
})

/* ── the load-bearing repairs ──────────────────────────────────────────────── */

/**
 * Append every load-bearing caveat of every surviving citation.
 *
 * This is why the corpus models caveats as claim ids rather than as prose: a
 * caveat that is a field on a record can be dropped by omission, and a caveat
 * that is an id the code looks up cannot. Dropping one becomes a state this
 * function repairs rather than a rule the prompt asks for.
 */
function restoreCaveats(req: BriefRequirement, g: Guardrails): string {
  let caveat = req.caveat.trim()
  for (const citation of req.evidence) {
    const record = recordById(citation.evidence_id)
    if (!record) continue
    for (const caveatId of record.caveats) {
      const claim = claimById(caveatId as ClaimId)
      const needle = norm(claim.statement).slice(0, 40)
      if (needle && norm(caveat).includes(needle)) continue
      caveat = caveat ? `${caveat} ${claim.statement}` : claim.statement
      g.caveats_restored.push(caveatId)
    }
  }
  return caveat
}

const COMPLETION_VERBS =
  /\b(?:built|shipped|deployed|delivered|launched|ran|operated|completed|productionis[ez]d|productionali[sz]ed)\b/i

/**
 * Work that is in flight is described in the present progressive. If a sentence
 * about an in-progress record uses a completion verb, that sentence is REPLACED
 * by the record's own wording — replacement, not redaction, because the fact is
 * worth stating and only its tense was wrong.
 */
function enforceTense(text: string, citations: readonly Citation[], g: Guardrails): string {
  const inProgress = citations
    .map((c) => recordById(c.evidence_id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r) && r!.status === 'in-progress')
  if (!inProgress.length) return text

  const replacement = inProgress[0]!.statement
  const units = splitUnits(text)
  let changed = false
  const out = units.map((unit) => {
    if (!COMPLETION_VERBS.test(unit)) return unit
    if (unit.trim() === replacement.trim()) return unit
    changed = true
    g.claims_redacted += 1
    return replacement
  })
  return changed ? out.join(' ') : text
}

const UNDER_REVIEW_TOPIC = /\b(?:psb|pacific symposium|biocomputing|manuscript)\b/i

/**
 * A field that mentions the manuscript and nowhere says "under review" has the
 * corpus record's own sentence APPENDED, which does say it.
 *
 * Appending, not replacing, and checked over the WHOLE field rather than
 * sentence by sentence — for one reason worth writing down: a corpus statement
 * quoted correctly often carries the status in its LAST sentence, so a
 * per-sentence rule would "repair" the site's own wording into something it did
 * not say. The falsehood this guards against — "published at PSB" — is already
 * a discard-free redaction under FORBIDDEN_PATTERNS above. Two gates, one for
 * the false claim and one for the missing status, and neither mangles a quote.
 */
function enforceUnderReview(text: string, g: Guardrails): string {
  if (!UNDER_REVIEW_TOPIC.test(text)) return text
  if (/under review/i.test(text)) return text
  const canonical = findUnderReviewRecord()
  if (!canonical) return text
  g.claims_redacted += 1
  return `${text.trim()} ${canonical}`.trim()
}

let underReviewCache: string | null | undefined
function findUnderReviewRecord(): string | null {
  if (underReviewCache !== undefined) return underReviewCache
  // The caveat record is the short one and is the sentence a reader needs.
  const candidates = ['clm:yang-psb-caveat', 'clm:yang-psb-submission']
  for (const id of candidates) {
    const record = recordById(id)
    if (record && /under review/i.test(record.statement)) {
      underReviewCache = record.statement
      return underReviewCache
    }
  }
  underReviewCache = null
  return null
}

/* ── the whole check ───────────────────────────────────────────────────────── */

export interface FactCheckContext {
  /** Used only to decide which pre-built brief replaces a discarded one. */
  roleLabel: string
  jdSource: 'role_chip' | 'pasted_jd'
}

export function factCheckBrief(raw: unknown, ctx: FactCheckContext): CheckedBrief {
  const g = emptyGuardrails()

  const parsed = fitBriefSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      brief: emptyBrief(ctx),
      coverage: { direct: 0, adjacent: 0, partial: 0, no_evidence: 0 },
      guardrails: g,
      discard: 'bad_output',
      detail: 'the generated brief did not match the required shape',
    }
  }

  const input = parsed.data
  const requirements: BriefRequirement[] = []
  let totalCitations = 0

  for (const [index, req] of input.requirements.entries()) {
    totalCitations += req.evidence.length

    // 1. citations first — everything downstream depends on which survive.
    const { kept } = checkCitations(req.evidence, g)

    // 2. the model's own strings.
    const requirementScan = scanText(req.requirement)
    let rationale = req.rationale
    const rationaleScan = scanText(rationale)
    rationale = rationaleScan.text
    const caveatScan = scanText(req.caveat)

    for (const s of [requirementScan, rationaleScan, caveatScan]) {
      g.numbers_rejected.push(...s.numbers)
      g.urls_rejected.push(...s.urls)
      g.claims_redacted += s.droppedUnits
    }

    // 3. tense and publication status, repaired rather than deleted.
    rationale = enforceTense(rationale, kept, g)
    rationale = enforceUnderReview(rationale, g)

    // 4. the verdict.
    let verdict: Verdict = req.verdict
    const requirementText = requirementScan.text === WITHHELD ? req.requirement : requirementScan.text
    const { coverage, fallback } = coverageForQuery(requirementText)
    let ceiling = verdictCeiling(coverage, kept.length > 0)
    let ceilingReason = CEILING_REASON[coverage]

    // A framing note on this requirement means a human already decided the
    // evidence reads stronger than it is. "Peer-reviewed publication record" is
    // the case that matters: the retrieval is strong, the manuscript is real,
    // and it is under review rather than published — so a direct match would be
    // the single most damaging overclaim this brief could make. The note caps
    // the verdict at adjacent, and the note itself is appended as the caveat.
    if (fallback && VERDICT_RANK[ceiling] > VERDICT_RANK.adjacent) {
      ceiling = 'adjacent'
      ceilingReason = "this site's own note on this requirement qualifies the evidence"
    }

    if (kept.length === 0 && verdict !== 'no_evidence') {
      g.verdicts_downgraded.push({
        index,
        from: verdict,
        to: 'no_evidence',
        reason: 'nothing was cited that could be matched to a record on this site',
      })
      verdict = 'no_evidence'
      rationale = `This site has no verified record supporting "${requirementText}". Nothing was cited that could be matched.`
    } else if (VERDICT_RANK[verdict] > VERDICT_RANK[ceiling]) {
      g.verdicts_downgraded.push({ index, from: verdict, to: ceiling, reason: ceilingReason })
      verdict = ceiling
    }

    // 5. a no_evidence row cites nothing. Ever. That is what makes it readable.
    const evidence = verdict === 'no_evidence' ? [] : kept
    if (verdict === 'no_evidence' && kept.length > 0) {
      g.citations_dropped += kept.length
    }

    // 6. caveats, restored after the verdict is final so a dropped citation
    //    cannot drag a caveat in with it.
    let caveat = caveatScan.text === WITHHELD ? '' : caveatScan.text
    const note = framingNote(fallback)
    if (note && verdict !== 'no_evidence' && !norm(caveat).includes(norm(note).slice(0, 30))) {
      caveat = caveat ? `${caveat} ${note}` : note
      g.caveats_restored.push(`requirement-note:${index}`)
    }
    if (evidence.length) {
      caveat = restoreCaveats({ ...req, evidence, caveat }, g)
    }
    caveat = enforceUnderReview(caveat, g)

    requirements.push({
      requirement: cap(requirementText, CAPS.requirement),
      verdict,
      confidence: req.confidence,
      rationale: cap(rationale.trim() || WITHHELD, CAPS.rationale),
      evidence,
      caveat: cap(caveat.trim(), CAPS.caveat),
    })
  }

  // ── whole-brief strings ────────────────────────────────────────────────────
  const headlineScan = scanText(input.headline)
  const gapsScan = scanText(input.gaps_summary)
  const closingScan = scanText(input.closing)
  const notClaimed: string[] = []
  for (const item of input.not_claimed.slice(0, 4)) {
    const scan = scanText(item)
    g.numbers_rejected.push(...scan.numbers)
    g.urls_rejected.push(...scan.urls)
    g.claims_redacted += scan.droppedUnits
    if (scan.text && scan.text !== WITHHELD) notClaimed.push(cap(scan.text, CAPS.not_claimed_item))
  }
  const directives: string[] = []
  for (const item of input.observed_directives.slice(0, 3)) {
    const scan = scanText(item)
    if (scan.text && scan.text !== WITHHELD) {
      directives.push(cap(scan.text, CAPS.observed_directive))
    }
  }
  for (const s of [headlineScan, gapsScan, closingScan]) {
    g.numbers_rejected.push(...s.numbers)
    g.urls_rejected.push(...s.urls)
    g.claims_redacted += s.droppedUnits
  }

  const coverage = countCoverage(requirements)

  // gaps_summary is non-empty whenever anything is less than direct. A brief
  // with a gap and no sentence about it is the shape of a brief that hides one.
  let gapsSummary = enforceUnderReview(gapsScan.text === WITHHELD ? '' : gapsScan.text, g)
  if (!gapsSummary && coverage.direct < requirements.length) {
    gapsSummary = deterministicGapsSummary(requirements)
  }

  const strongest = recordById(input.strongest) ? input.strongest : firstCitedId(requirements)

  const brief: FitBrief = {
    role_label: cap(scanText(input.role_label).text || ctx.roleLabel, CAPS.role_label),
    jd_source: ctx.jdSource,
    headline: cap(
      enforceUnderReview(headlineScan.text, g) || deterministicHeadline(coverage, ctx.roleLabel),
      CAPS.headline,
    ),
    requirements,
    strongest,
    gaps_summary: cap(gapsSummary, CAPS.gaps_summary),
    not_claimed: notClaimed,
    closing: cap(
      enforceUnderReview(closingScan.text === WITHHELD ? '' : closingScan.text, g) ||
        'Every claim above links to the record it came from.',
      CAPS.closing,
    ),
    observed_directives: directives,
  }

  // ── the discard conditions ─────────────────────────────────────────────────
  const authored = collectAuthoredText(brief)

  if (isHostile(authored)) {
    g.injection_suspected = true
    return {
      brief,
      coverage,
      guardrails: g,
      discard: 'injection_blocked',
      detail: 'the generated text carried a hostile claim rather than an absence of evidence',
    }
  }

  const retracted = findRetracted(authored)
  if (retracted) {
    g.retractions_blocked.push(retracted.id)
    return {
      brief,
      coverage,
      guardrails: g,
      discard: 'factcheck_failed',
      detail: 'the generated text restated a claim this site has retracted',
    }
  }

  if (totalCitations > 0 && g.citations_dropped > totalCitations / 2) {
    return {
      brief,
      coverage,
      guardrails: g,
      discard: 'factcheck_failed',
      detail: 'more than half of the citations could not be matched to a record',
    }
  }
  // A thin brief that still ASSERTS something is a brief that collapsed, and it
  // is discarded. A thin brief that asserts NOTHING is the honest answer to a
  // paste with no role in it — "no job requirements were found" is one row, and
  // discarding it would replace a true sentence with a template.
  if (requirements.length < 3 && requirements.some((r) => r.verdict !== 'no_evidence')) {
    return {
      brief,
      coverage,
      guardrails: g,
      discard: 'factcheck_failed',
      detail: 'too few requirements survived the check to be worth reading',
    }
  }
  if (g.numbers_rejected.length >= 3) {
    return {
      brief,
      coverage,
      guardrails: g,
      discard: 'factcheck_failed',
      detail: 'three or more figures could not be found in any record on this site',
    }
  }

  // ── the overclaim flag ─────────────────────────────────────────────────────
  // A flagged brief is still SERVED — silently discarding it would be worse —
  // but the coverage line renders as all-direct, which is self-indicting, and
  // the strip says so.
  if (requirements.length >= 4 && coverage.partial + coverage.no_evidence === 0) {
    g.overclaim_flagged = true
  }

  return {
    brief,
    coverage,
    guardrails: g,
    discard: null,
    detail: describeCheck(totalCitations, g),
  }
}

/* ── the Q&A analogue ──────────────────────────────────────────────────────── */

export interface CheckedAnswer {
  answer: AgentAnswer
  guardrails: Guardrails
  discard: DegradedReason | null
  detail: string
}

export function factCheckAnswer(raw: unknown): CheckedAnswer {
  const g = emptyGuardrails()
  const parsed = agentAnswerSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      answer: refusalAnswer(),
      guardrails: g,
      discard: 'bad_output',
      detail: 'the generated answer did not match the required shape',
    }
  }

  const input = parsed.data
  const { kept } = checkCitations(input.citations, g)

  const scan = scanText(input.answer)
  g.numbers_rejected.push(...scan.numbers)
  g.urls_rejected.push(...scan.urls)
  g.claims_redacted += scan.droppedUnits

  let text = enforceTense(scan.text, kept, g)
  text = enforceUnderReview(text, g)

  // A refusal carries no citations; an answer that lost all of its citations
  // becomes an honest "not on this site" rather than an uncited assertion.
  let refused = input.refused_reason
  let citations = refused ? [] : kept
  if (!refused && kept.length === 0 && input.citations.length > 0) {
    refused = 'not_in_corpus'
    citations = []
    text =
      'That is not something this site has a record for. dnguyen44@seattleu.edu is the fastest way to ask Duy directly.'
  }

  // Restore the caveats of everything still cited.
  for (const citation of citations) {
    const record = recordById(citation.evidence_id)
    if (!record) continue
    for (const caveatId of record.caveats) {
      const claim = claimById(caveatId as ClaimId)
      const needle = norm(claim.statement).slice(0, 40)
      if (needle && norm(text).includes(needle)) continue
      text = `${text} ${claim.statement}`.trim()
      g.caveats_restored.push(caveatId)
    }
  }

  const answer: AgentAnswer = {
    answer: cap(text.trim() || WITHHELD, CAPS.answer),
    citations,
    confidence: input.confidence,
    refused_reason: refused,
    observed_directives: input.observed_directives
      .slice(0, 3)
      .map((d) => cap(scanText(d).text, CAPS.observed_directive))
      .filter((d) => d && d !== WITHHELD),
  }

  if (isHostile(answer.answer)) {
    g.injection_suspected = true
    return {
      answer: refusalAnswer(),
      guardrails: g,
      discard: 'injection_blocked',
      detail: 'the generated answer carried a hostile claim',
    }
  }
  const retracted = findRetracted(answer.answer)
  if (retracted) {
    g.retractions_blocked.push(retracted.id)
    return {
      answer: refusalAnswer(),
      guardrails: g,
      discard: 'factcheck_failed',
      detail: 'the generated answer restated a claim this site has retracted',
    }
  }
  if (g.numbers_rejected.length >= 3) {
    return {
      answer: refusalAnswer(),
      guardrails: g,
      discard: 'factcheck_failed',
      detail: 'three or more figures could not be found in any record on this site',
    }
  }

  return { answer, guardrails: g, detail: describeCheck(input.citations.length, g), discard: null }
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

export function countCoverage(requirements: readonly BriefRequirement[]): CoverageCounts {
  const out = { direct: 0, adjacent: 0, partial: 0, no_evidence: 0 }
  for (const r of requirements) out[r.verdict] += 1
  return out
}

function firstCitedId(requirements: readonly BriefRequirement[]): string {
  for (const r of requirements) {
    const first = r.evidence[0]
    if (first) return first.evidence_id
  }
  return ''
}

function collectAuthoredText(brief: FitBrief): string {
  const parts = [
    brief.role_label,
    brief.headline,
    brief.gaps_summary,
    brief.closing,
    ...brief.not_claimed,
    ...brief.observed_directives,
  ]
  for (const r of brief.requirements) {
    parts.push(r.requirement, r.rationale, r.caveat)
    for (const c of r.evidence) parts.push(c.artifact_label)
  }
  return parts.join('\n')
}

function deterministicGapsSummary(requirements: readonly BriefRequirement[]): string {
  const weak = requirements.filter((r) => r.verdict === 'partial' || r.verdict === 'no_evidence')
  if (!weak.length) return ''
  const names = weak.map((r) => r.requirement.replace(/\.$/, '')).slice(0, 3)
  return `This site does not fully evidence ${names.join('; ')}. The rows above say which half is missing in each case.`
}

function deterministicHeadline(coverage: CoverageCounts, roleLabel: string): string {
  const strong = coverage.direct + coverage.adjacent
  const weak = coverage.partial + coverage.no_evidence
  if (weak === 0) return `Every requirement in this ${roleLabel} posting maps to work on this site.`
  if (strong === 0) return `This site does not evidence what this ${roleLabel} posting asks for.`
  return `Some of this ${roleLabel} posting maps to work on this site, and some of it does not.`
}

function describeCheck(totalCitations: number, g: Guardrails): string {
  const total = guardrailTotal(g)
  if (total === 0) return `${totalCitations} citations checked; every statement matched a record`
  const bits: string[] = []
  if (g.citations_dropped) bits.push(`${g.citations_dropped} citation(s) dropped`)
  if (g.numbers_rejected.length) bits.push(`${g.numbers_rejected.length} figure(s) rejected`)
  if (g.urls_rejected.length) bits.push(`${g.urls_rejected.length} link(s) rejected`)
  if (g.claims_redacted) bits.push(`${g.claims_redacted} statement(s) repaired or removed`)
  if (g.verdicts_downgraded.length) bits.push(`${g.verdicts_downgraded.length} verdict(s) lowered`)
  if (g.caveats_restored.length) bits.push(`${g.caveats_restored.length} caveat(s) restored`)
  return `${totalCitations} citations checked; ${bits.join(', ')}`
}

function emptyBrief(ctx: FactCheckContext): FitBrief {
  return {
    role_label: ctx.roleLabel,
    jd_source: ctx.jdSource,
    headline: '',
    requirements: [
      {
        requirement: 'No brief could be produced from this run',
        verdict: 'no_evidence',
        confidence: 'low',
        rationale: WITHHELD,
        evidence: [],
        caveat: '',
      },
    ],
    strongest: '',
    gaps_summary: '',
    not_claimed: [],
    closing: '',
    observed_directives: [],
  }
}

function refusalAnswer(): AgentAnswer {
  return {
    answer:
      'That is not something this site has a record for. dnguyen44@seattleu.edu is the fastest way to ask Duy directly.',
    citations: [],
    confidence: 'low',
    refused_reason: 'not_in_corpus',
    observed_directives: [],
  }
}

/**
 * The property the whole file exists to keep, exported so a test can assert it
 * over randomised inputs rather than over the two cases someone thought of.
 */
export function neverUpgraded(
  before: readonly { verdict: Verdict }[],
  after: readonly { verdict: Verdict }[],
): boolean {
  return after.every((r, i) => {
    const prev = before[i]
    if (!prev) return true
    return VERDICT_RANK[r.verdict] <= VERDICT_RANK[prev.verdict]
  })
}
