/**
 * lib/corpus/retrieve.ts — evidence selection. PURE: no I/O, no model, no key.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not a fit brief. Composing prose is the agent's job (brief Addendum B,
 * ruling R-2); this file decides WHICH EVIDENCE the agent is allowed to use, and
 * says so in ids that can be checked afterwards. The split matters: because the
 * selection policy takes no model call, the whole thing is unit-testable on a
 * fresh clone with no keys, and two recruiters pasting the same posting get the
 * same evidence.
 *
 * THE THREE THINGS RETRIEVAL BUYS HERE
 * ------------------------------------
 * The entire corpus fits in one model context, so recall is not the problem this
 * solves. What it solves is:
 *   CITATION    which claim licensed which sentence
 *   DETERMINISM the same posting produces the same selection
 *   NEGATIVES   a requirement with no hit is REPORTED as having no hit, with a
 *               human-written answer, rather than quietly going missing
 */

import {
  CLAIMS,
  DISPUTES,
  GAPS,
  ROLE_PROFILES,
  claimById,
  conceptById,
  corpusHash,
  gapById,
  roleProfileById,
} from './index'
import { analyseJd, lexicalOverlap } from './jd'
import type {
  Claim,
  ClaimId,
  ConceptId,
  Coverage,
  Dispute,
  Gap,
  Hit,
  JdAnalysis,
  Requirement,
  RequirementId,
  RequirementResult,
  RetrievalResult,
  RoleProfile,
  RoleProfileId,
} from './types'

/**
 * A claim below this contributes nothing to a requirement.
 *
 * Named rather than inlined because it is the boundary between "we have evidence"
 * and "we do not", and a reviewer has to be able to find it and argue with it.
 *
 * Calibrated so an ADJACENT-ONLY match cannot clear it on coursework:
 *   best adjacent   = W_ADJACENT 1.5 × max edge weight 0.9 = 1.35
 *   + coursework    = 0.5
 *   + recent        = 1.0
 *                   = 2.85  →  below the floor, correctly
 * but CAN clear it on recent production work (1.35 + 1.5 + 1.0 = 3.85), which is
 * the intended asymmetry: an adjacency is worth surfacing when the underlying work
 * was real and shipped, and is not worth surfacing when it was a class.
 */
export const MIN_HIT_SCORE = 3.0

const W_PINNED = 6.0 // a human decided this claim answers this requirement
const W_DIRECT = 4.0 // the claim carries a concept the requirement names
const W_ADJACENT = 1.5 // × the edge weight, which is always below 1
const W_LEXICAL = 2.0 // × normalised token overlap, in [0,1]

const STRENGTH_BONUS: Record<Claim['evidenceStrength'], number> = {
  production: 1.5,
  research: 1.25,
  'personal-project': 0.75,
  coursework: 0.5,
  credential: 0.25,
}

const MONTH_MS = 1000 * 60 * 60 * 24 * 30.44

/** Months since the work ended, or 0 while it is ongoing. */
export function monthsSince(claim: Claim, now: Date = new Date()): number {
  const period = claim.period
  if (!period) return 0
  if (period.end === null) return 0 // ongoing: as recent as it gets
  const [y, m] = period.end.split('-')
  const end = new Date(Number(y), m ? Number(m) - 1 : 11, 1)
  return Math.max(0, (now.getTime() - end.getTime()) / MONTH_MS)
}

/** Pre-master's work is de-weighted, never excluded. */
export function recencyBonus(monthsAgo: number): number {
  if (monthsAgo <= 18) return 1.0
  if (monthsAgo <= 48) return 0.0
  return -0.5
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Score one claim against one requirement.
 *
 * GATE 0 runs BEFORE any scoring and is a hard exclusion, never a term in a
 * weighted sum. That distinction is the whole lesson: a soft penalty on a
 * categorical fact does not act as a gate, it acts as a discount, and a large
 * enough bonus elsewhere buys straight through it. A disputed figure must be
 * unreachable, not merely unlikely.
 */
export function scoreClaim(claim: Claim, req: Requirement, jd: JdAnalysis): Hit | null {
  // GATE 0 — hard exclusions.
  if (claim.status === 'disputed') return null
  if (!claim.asserted) return null
  if (!claim.surfaces.includes('agent')) return null

  let score = 0
  const matched: ConceptId[] = []
  const pinned = req.pinned.includes(claim.id)

  if (pinned) {
    score += W_PINNED
    for (const c of req.concepts) if (!matched.includes(c)) matched.push(c)
  }

  let sawDirect = false
  for (const c of req.concepts) {
    if (claim.concepts.includes(c)) {
      score += W_DIRECT
      sawDirect = true
      if (!matched.includes(c)) matched.push(c)
      continue
    }
    for (const edge of conceptById(c).adjacent) {
      if (claim.concepts.includes(edge.id)) {
        score += W_ADJACENT * edge.weight
        if (!matched.includes(edge.id)) matched.push(edge.id)
      }
    }
  }

  // No concept path at all → not a hit, and the lexical term is never reached.
  // Deliberate: word overlap between any two CVs is high and meaningless, and a
  // brief that cites a claim because it shares the word "data" is worse than one
  // that cites nothing.
  if (score === 0) return null

  score += W_LEXICAL * lexicalOverlap(jd.tokens, `${claim.statement} ${claim.short}`)
  score += STRENGTH_BONUS[claim.evidenceStrength]
  score += recencyBonus(monthsSince(claim))

  if (score < MIN_HIT_SCORE) return null

  return {
    claim,
    score: round2(score),
    matchedConcepts: matched,
    via: pinned ? 'pinned' : sawDirect ? 'concept' : 'adjacent',
  }
}

/**
 * Four values, and `none` is a RESULT that gets rendered, not a silence.
 *
 * `coursework-only` exists because "he has done this, in a class" and "he has done
 * this, in production" are different answers to a hiring manager, and collapsing
 * them into one is the single most common way a CV misleads without lying.
 */
export function coverageFor(hits: readonly Hit[]): Coverage {
  if (hits.length === 0) return 'none'
  const strong = hits.some(
    (h) =>
      h.score >= 6 &&
      (h.claim.evidenceStrength === 'production' || h.claim.evidenceStrength === 'research')
  )
  if (strong) return 'strong'
  if (hits.every((h) => h.claim.evidenceStrength === 'coursework')) return 'coursework-only'
  return 'partial'
}

/** The gap to surface for a requirement with no evidence, if the concepts map to one. */
function gapForRequirement(req: Requirement): Gap | null {
  for (const conceptId of req.concepts) {
    const gapId = conceptById(conceptId).negativeGapId
    if (gapId) return gapById(gapId)
  }
  return null
}

/**
 * A gap is also worth showing when coverage is `coursework-only`: the honest
 * answer written for "he has not done this in production" is exactly the sentence
 * a coursework-only result needs, and withholding it until coverage reaches zero
 * would let a class quietly stand in for a job.
 */
function shouldAttachGap(coverage: Coverage): boolean {
  return coverage === 'none' || coverage === 'coursework-only'
}

function evaluateRequirement(req: Requirement, jd: JdAnalysis): RequirementResult {
  const hits: Hit[] = []
  for (const claim of CLAIMS) {
    const hit = scoreClaim(claim, req, jd)
    if (hit) hits.push(hit)
  }
  // Score descending, then corpus order — stable, so the same input orders the
  // same way on every run and a diff of two briefs is readable.
  const indexOf = new Map(CLAIMS.map((c, i) => [c.id, i]))
  hits.sort(
    (a, b) => b.score - a.score || (indexOf.get(a.claim.id)! - indexOf.get(b.claim.id)!)
  )

  const coverage = coverageFor(hits)
  const gap = shouldAttachGap(coverage) ? gapForRequirement(req) : null

  const top = hits[0]
  const note = !top
    ? gap
      ? `No claim cleared the ${MIN_HIT_SCORE} floor. Answering from ${gap.id}.`
      : `No claim cleared the ${MIN_HIT_SCORE} floor and no gap is mapped to these concepts.`
    : `${hits.length} claim(s) cleared the ${MIN_HIT_SCORE} floor; top score ${top.score} via ${top.via}.` +
      (gap ? ` Coursework only — ${gap.id} attached so the limit travels with the answer.` : '')

  return {
    requirementId: req.id,
    label: req.label,
    weight: req.weight,
    coverage,
    hits,
    gap,
    fallback: req.fallback ?? null,
    note,
  }
}

/**
 * Disputes whose subject matter a requirement touched.
 *
 * A disputed figure never becomes a silent absence; it becomes a stated
 * uncertainty. That is the difference between a corpus that hides a problem and
 * one that surfaces it. Only UNRESOLVED disputes are surfaced: a reconciled or
 * owner-resolved one has an answer, and the answer is in the claims.
 */
function disputesFor(req: Requirement): Dispute[] {
  const out: Dispute[] = []
  for (const dispute of DISPUTES) {
    if (dispute.resolution !== 'unresolved') continue
    const blocked = dispute.blocksClaims.map((id) => claimById(id))
    const touches = blocked.some((c) => c.concepts.some((k) => req.concepts.includes(k)))
    if (touches) out.push(dispute)
  }
  return out
}

/** Pick a profile by concept overlap; a clear win needs a two-concept lead. */
export function pickProfile(
  jd: JdAnalysis,
  explicit?: RoleProfileId
): { profile: RoleProfile | null; confidence: 'matched' | 'custom' } {
  if (explicit) return { profile: roleProfileById(explicit), confidence: 'matched' }
  if (!jd.concepts.length) return { profile: null, confidence: 'custom' }

  const scored = ROLE_PROFILES.map((profile) => {
    const conceptSet = new Set(profile.requirements.flatMap((r) => r.concepts))
    const overlap = jd.concepts.filter((c) => conceptSet.has(c)).length
    return { profile, overlap }
  }).sort((a, b) => b.overlap - a.overlap)

  const [best, runnerUp] = scored
  if (!best || best.overlap === 0) return { profile: null, confidence: 'custom' }
  if (runnerUp && best.overlap - runnerUp.overlap < 2) {
    return { profile: null, confidence: 'custom' }
  }
  return { profile: best.profile, confidence: 'matched' }
}

/**
 * When no profile wins cleanly, run the requirement loop over the union of every
 * requirement whose concepts intersect the posting. A recruiter with a hybrid role
 * gets the hybrid answer rather than the nearest-fitting template.
 */
function customRequirements(jd: JdAnalysis): Requirement[] {
  const out: Requirement[] = []
  const seen = new Set<RequirementId>()
  for (const profile of ROLE_PROFILES) {
    for (const req of profile.requirements) {
      if (seen.has(req.id)) continue
      if (req.concepts.some((c) => jd.concepts.includes(c))) {
        seen.add(req.id)
        out.push(req)
      }
    }
  }
  return out
}

export interface RetrieveInput {
  jdText?: string
  profileId?: RoleProfileId
  now?: Date
}

/**
 * The one entry point. Give it a pasted posting, a chosen role chip, or both.
 *
 * The renderer downstream may assert NOTHING outside `citedClaims`, and MUST emit
 * every id in `mandatoryCaveats`. Both are ids, so both are checkable after the
 * fact — which is what makes this an evidence system rather than a prompt.
 */
export function retrieve(input: RetrieveInput = {}): RetrievalResult {
  const jd = analyseJd(input.jdText ?? '')
  const { profile, confidence } = pickProfile(jd, input.profileId)

  const requirements = profile
    ? [...profile.requirements].sort((a, b) => b.weight - a.weight)
    : customRequirements(jd).sort((a, b) => b.weight - a.weight)

  const results: RequirementResult[] = requirements.map((req) => evaluateRequirement(req, jd))

  const citedClaims: ClaimId[] = []
  const seenClaims = new Set<string>()
  for (const r of results) {
    for (const h of r.hits) {
      if (!seenClaims.has(h.claim.id)) {
        seenClaims.add(h.claim.id)
        citedClaims.push(h.claim.id)
      }
    }
    for (const id of r.gap?.nearestEvidence ?? []) {
      if (!seenClaims.has(id)) {
        seenClaims.add(id)
        citedClaims.push(id)
      }
    }
  }

  // Mandatory caveats are added to citedClaims too: a renderer that must emit a
  // caveat must also be licensed to quote it, or the two rules contradict.
  const mandatoryCaveats: ClaimId[] = []
  for (const id of citedClaims) {
    for (const cid of claimById(id).caveats ?? []) {
      if (!mandatoryCaveats.includes(cid)) mandatoryCaveats.push(cid)
    }
  }
  for (const cid of mandatoryCaveats) {
    if (!seenClaims.has(cid)) {
      seenClaims.add(cid)
      citedClaims.push(cid)
    }
  }

  const disputesTouched: Array<{ dispute: Dispute; requirementId: RequirementId }> = []
  for (const req of requirements) {
    for (const dispute of disputesFor(req)) {
      disputesTouched.push({ dispute, requirementId: req.id })
    }
  }

  return {
    profile: profile ? profile.id : 'custom',
    profileConfidence: confidence,
    requirements: results,
    unmatchedJdTerms: jd.unmatchedTerms,
    disputesTouched,
    mandatoryCaveats,
    citedClaims,
    corpusHash: corpusHash(),
    generatedAt: (input.now ?? new Date()).toISOString(),
  }
}

/**
 * Free-form question → the evidence that may answer it.
 *
 * Same gates, no requirement scaffolding: the question is treated as a bag of
 * concepts, and gaps whose concepts it names come back alongside the claims so
 * that "no" is available as an answer with a sentence already written for it.
 */
export function answerContext(question: string): {
  claims: Claim[]
  caveats: Claim[]
  disputes: Dispute[]
  gaps: Gap[]
  corpusHash: string | null
} {
  const jd = analyseJd(question)
  const concepts = new Set(jd.concepts)

  const claims = CLAIMS.filter(
    (c) =>
      c.asserted &&
      c.status !== 'disputed' &&
      c.surfaces.includes('agent') &&
      c.kind !== 'caveat' &&
      c.concepts.some((k) => concepts.has(k))
  ).sort((a, b) => {
    const aScore =
      STRENGTH_BONUS[a.evidenceStrength] +
      recencyBonus(monthsSince(a)) +
      lexicalOverlap(jd.tokens, `${a.statement} ${a.short}`)
    const bScore =
      STRENGTH_BONUS[b.evidenceStrength] +
      recencyBonus(monthsSince(b)) +
      lexicalOverlap(jd.tokens, `${b.statement} ${b.short}`)
    return bScore - aScore
  })

  const caveatIds = new Set<ClaimId>()
  for (const c of claims) for (const id of c.caveats ?? []) caveatIds.add(id)

  const gaps = GAPS.filter((g) => g.concepts.some((c) => concepts.has(c)))

  const disputes = DISPUTES.filter(
    (d) =>
      d.resolution === 'unresolved' &&
      d.blocksClaims.some((id) => claimById(id).concepts.some((k) => concepts.has(k)))
  )

  return {
    claims,
    caveats: [...caveatIds].map(claimById),
    disputes,
    gaps,
    corpusHash: corpusHash(),
  }
}
