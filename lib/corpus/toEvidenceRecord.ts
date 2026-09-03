/**
 * lib/corpus/toEvidenceRecord.ts — the thin projection the agent layer consumes.
 *
 * WHY A PROJECTION AND NOT A SECOND STORE
 * ---------------------------------------
 * There was a plan for a second, flatter record shape living beside this one under
 * the same directory. It is deleted (brief Addendum B, ruling R-1): two stores for
 * one set of facts is exactly the defect this corpus exists to remove, and the flat
 * shape could not express `sources`, `verificationPath`, `status` or the review
 * cadence — the four fields the ongoing barn-owl work makes mandatory.
 *
 * So there is one store, and this is a VIEW of it. The projection is lossy on
 * purpose: it drops maintainer notes, review cadence and provenance internals that
 * a model has no business reasoning about, and keeps the citation trail a model
 * must never lose. Nothing here is cached or mutated; call it as often as you like.
 *
 * THE ID NAMESPACE IS THE ONE THIS FILE PRESERVES.
 * `clm:` `art:` `skl:` `rol:` `cpt:` `dsp:` `ret:` — these exact strings are what
 * the agent's tool schemas enumerate. There is no second namespace and no alias
 * map, because an alias map is a place for two spellings of the same id to drift.
 */

import {
  CLAIMS,
  GAPS,
  RETRACTIONS,
  artifactById,
  claimById,
  disputeById,
  roleById,
  sourceById,
} from './index'
import type {
  Claim,
  ClaimId,
  EvidenceStrength,
  Surface,
} from './types'

/** What a source looks like to a model: enough to cite, not enough to confuse. */
export interface EvidenceCitation {
  sourceId: string
  label: string
  trust: 'primary' | 'self-reported' | 'derived'
  /** Where a skeptic goes. May be a URL, a repo path, or a git-object locator. */
  locator: string
}

export interface EvidenceRecord {
  id: ClaimId
  kind: Claim['kind']
  /** The sentence the agent may assert, verbatim or lightly re-cased. Nothing else. */
  statement: string
  short: string
  /** Present only for metrics. The single source of every digit the agent may emit. */
  value: { display: string; numbers: string[]; unit: string | null; baseline: string | null } | null
  subject: string
  subjectLabel: string
  status: Claim['status']
  tense: Claim['tense']
  confidence: Claim['confidence']
  evidenceStrength: EvidenceStrength
  concepts: string[]
  /** Ids the agent MUST also emit whenever it emits this record. */
  caveats: ClaimId[]
  citations: EvidenceCitation[]
  verificationPath: string
  verifiedOn: string | null
  period: { start: string | null; end: string | null } | null
  /** Public artifact links a reader can open. Non-public artifacts are described, not linked. */
  links: Array<{ id: string; title: string; url: string | null; access: string }>
}

function subjectLabel(subject: string): string {
  if (subject.startsWith('rol:')) return roleById(subject as `rol:${string}`).title
  if (subject.startsWith('art:')) return artifactById(subject as `art:${string}`).title
  if (subject === 'per:duy') return 'Duy Nguyen'
  return subject
}

export function toEvidenceRecord(claim: Claim): EvidenceRecord {
  return {
    id: claim.id,
    kind: claim.kind,
    statement: claim.statement,
    short: claim.short,
    value: claim.value
      ? {
          display: claim.value.display,
          numbers: claim.value.numbers,
          unit: claim.value.unit,
          baseline: claim.value.baseline,
        }
      : null,
    subject: claim.subject,
    subjectLabel: subjectLabel(claim.subject),
    status: claim.status,
    tense: claim.tense,
    confidence: claim.confidence,
    evidenceStrength: claim.evidenceStrength,
    concepts: [...claim.concepts],
    caveats: [...(claim.caveats ?? [])],
    citations: claim.sources.map((id) => {
      const s = sourceById(id)
      return { sourceId: s.id, label: s.label, trust: s.trust, locator: s.locator }
    }),
    verificationPath: claim.verificationPath,
    verifiedOn: claim.verifiedOn ?? null,
    period: claim.period ? { start: claim.period.start, end: claim.period.end } : null,
    links: (claim.artifacts ?? []).map((id) => {
      const a = artifactById(id)
      return { id: a.id, title: a.title, url: a.url, access: a.access }
    }),
  }
}

export const toEvidenceRecords = (ids: readonly ClaimId[]): EvidenceRecord[] =>
  ids.map((id) => toEvidenceRecord(claimById(id)))

/**
 * Every record the agent is allowed to see, in one call.
 *
 * Note what is NOT here: disputed and unasserted claims are filtered out before
 * the model ever sees them. The agent cannot be tempted by a figure it was never
 * shown, which is a stronger guarantee than instructing it not to use one.
 */
export function agentEvidence(): EvidenceRecord[] {
  return CLAIMS.filter(
    (c) => c.asserted && c.status !== 'disputed' && c.surfaces.includes('agent')
  ).map(toEvidenceRecord)
}

/** Every claim id the agent may cite — the exact enum for a tool schema. */
export const agentClaimIds = (): ClaimId[] => agentEvidence().map((r) => r.id)

/** The written-in-advance answers for the things Duy has not done. */
export function agentGaps() {
  return GAPS.map((g) => ({
    id: g.id,
    label: g.label,
    concepts: [...g.concepts],
    severity: g.severity,
    disclose: g.disclose,
    /** Say this. Do not improvise around it, and do not offer the nearest evidence first. */
    honestAnswer: g.honestAnswer,
    nearestEvidence: [...g.nearestEvidence],
  }))
}

/**
 * The retraction list in the shape an output filter wants.
 *
 * The build gate catches what is committed; this catches what is generated. Same
 * records, two enforcement points, because a model can produce a sentence no
 * committed file contains.
 */
export function agentForbidden() {
  return RETRACTIONS.map((r) => ({
    id: r.id,
    short: r.short,
    reason: r.reason,
    phrases: [...r.forbiddenPhrases],
    patterns: (r.forbiddenPatterns ?? []).map((p) => ({ source: p.source, flags: p.flags })),
    sayInstead: [...(r.supersededBy ?? [])],
  }))
}

/** What to say when an unresolved dispute is touched. Never a number, ever. */
export function agentDisputeGuidance(disputeId: string): string {
  return disputeById(disputeId as `dsp:${string}`).agentGuidance
}

/** Convenience for a surface-scoped projection, e.g. the résumé generator. */
export const recordsForSurface = (surface: Surface): EvidenceRecord[] =>
  CLAIMS.filter((c) => c.asserted && c.status !== 'disputed' && c.surfaces.includes(surface)).map(
    toEvidenceRecord
  )
