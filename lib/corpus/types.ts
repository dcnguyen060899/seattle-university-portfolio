/**
 * lib/corpus/types.ts — the TypeScript mirror of data/corpus/schemas/*.schema.json.
 *
 * The JSON Schemas are the runtime gate (verify-corpus.mjs check C1); these types
 * are the compile-time one. They are hand-kept in sync, and check C14 asserts that
 * every enum below still matches its schema, so the two cannot drift silently.
 */

export type ClaimId = `clm:${string}`
export type SourceId = `src:${string}`
export type ArtifactId = `art:${string}`
export type ConceptId = `cpt:${string}`
export type SkillId = `skl:${string}`
export type RoleId = `rol:${string}`
export type OrgId = `org:${string}`
export type PersonId = `per:${string}`
export type GapId = `gap:${string}`
export type DisputeId = `dsp:${string}`
export type RetractionId = `ret:${string}`
export type RoleProfileId = `rp:${string}`
export type RequirementId = `r:${string}`

export type SubjectId = RoleId | ArtifactId | OrgId | PersonId | SkillId

/** Where a claim is licensed to appear. `internal` means corpus bookkeeping only. */
export type Surface = 'page' | 'resume' | 'jsonld' | 'agent' | 'internal'

export type ClaimKind = 'metric' | 'fact' | 'narrative' | 'caveat'

/**
 * verified        happened, sourced, current.
 * in-progress     underway and NOT shipped; copy stays present-progressive.
 * historical      true and sourced but from a superseded phase; assertable, de-weighted.
 * disputed        two sources of Duy's own disagree; NOT assertable.
 *
 * There is deliberately no `retracted` member. A retraction is not a lesser claim,
 * it is a different kind of record with different fields and a permanent enforcement
 * obligation, so it lives in retractions.json with its own shape.
 */
export type ClaimStatus = 'verified' | 'in-progress' | 'historical' | 'disputed'

export type Tense = 'past' | 'present' | 'present-progressive'
export type Confidence = 'high' | 'medium' | 'low'

/** WHAT KIND of experience this is — the axis that lets a brief say "coursework,
 *  not production" instead of letting a course sit silently next to a job. */
export type EvidenceStrength =
  | 'production'
  | 'research'
  | 'coursework'
  | 'personal-project'
  | 'credential'

export interface Period {
  start: string | null
  /** null means ongoing. */
  end: string | null
  precision: 'month' | 'quarter' | 'year'
}

export interface ClaimValue {
  /** Exactly as rendered. */
  display: string
  /** Every numeric token in `display`, as written. Feeds the C8 numeric gate. */
  numbers: string[]
  unit: string | null
  baseline: string | null
  n: string | null
}

export interface Claim {
  id: ClaimId
  kind: ClaimKind
  subject: SubjectId
  statement: string
  short: string
  value?: ClaimValue
  period?: Period | null
  status: ClaimStatus
  tense: Tense
  confidence: Confidence
  evidenceStrength: EvidenceStrength
  sources: SourceId[]
  verificationPath: string
  verifiedOn?: string | null
  quote?: string | null
  caveats?: ClaimId[]
  concepts: ConceptId[]
  skills?: SkillId[]
  artifacts?: ArtifactId[]
  derivedFrom?: ClaimId[]
  surfaces: Surface[]
  asserted: boolean
  disputeId?: DisputeId | null
  lastReviewed: string
  reviewEvery: number
  note?: string | null
}

export interface Source {
  id: SourceId
  kind:
    | 'repo-file'
    | 'repo-git'
    | 'url'
    | 'owner-statement'
    | 'institutional-catalog'
    | 'owner-archive'
    | 'artifact-private'
  label: string
  locator: string
  repo?: 'target' | 'reference' | null
  custodian: string
  trust: 'primary' | 'self-reported' | 'derived'
  firstRecorded: string
  lastChecked?: string | null
  note?: string | null
}

export interface Org {
  id: OrgId
  name: string
  kind: string
  parentOrgId?: OrgId | null
  url?: string | null
  note?: string | null
}

export interface Person {
  id: PersonId
  name: string
  title: string
  orgId: OrgId
  url?: string | null
  note?: string | null
}

export interface Role {
  id: RoleId
  title: string
  orgId: OrgId
  advisorIds?: PersonId[]
  period: Period
  kind: 'research' | 'engineering' | 'study' | 'volunteer' | 'self-directed'
  commitment: 'full-time' | 'part-time' | 'concurrent-with-study' | 'unknown'
  status: 'verified' | 'disputed'
  ongoing?: boolean
  weight: number
  summary: string
  note?: string | null
}

export interface Artifact {
  id: ArtifactId
  kind: string
  title: string
  url: string | null
  access: 'public' | 'on-request' | 'under-review' | 'private'
  roleId?: RoleId | null
  /** A path under public/ that must keep resolving. Checked by C12. */
  legacyPath?: string | null
  note?: string | null
}

export interface AdjacentEdge {
  id: ConceptId
  /** Strictly below 1: an adjacent hit can never outscore a direct one. */
  weight: number
  why: string
}

export interface Concept {
  id: ConceptId
  label: string
  family: string
  aliases: string[]
  adjacent: AdjacentEdge[]
  /** The gap to surface when a JD names this concept and nothing matches. */
  negativeGapId: GapId | null
  note?: string | null
}

export interface Skill {
  id: SkillId
  label: string
  family: 'language' | 'ml' | 'data' | 'infra' | 'frontend' | 'practice'
  /** Four ordered buckets. There is no numeric field, by design. */
  level:
    | 'applied-in-production'
    | 'applied-in-research'
    | 'applied-in-coursework'
    | 'familiar'
  concepts: ConceptId[]
  /** Non-empty by schema. A skill with no claim behind it cannot be written down. */
  groundedIn: ClaimId[]
  note?: string | null
}

export interface Gap {
  id: GapId
  label: string
  concepts: ConceptId[]
  /** The sentence the agent says. Written in advance, by a human, on a good day. */
  honestAnswer: string
  nearestEvidence: ClaimId[]
  severity: 'hard-blocker' | 'trainable' | 'adjacent-experience'
  /** false = decline and defer to Duy. Reserved for protected-status questions. */
  disclose: boolean
  lastReviewed: string
  reviewEvery?: number
  note?: string | null
}

export interface DisputePosition {
  sourceId: SourceId
  value: string
  sourceDate: string
  locator: string
}

export interface Dispute {
  id: DisputeId
  question: string
  positions: DisputePosition[]
  resolution: 'unresolved' | 'reconciled' | 'owner-resolved'
  reconciledAs: string | null
  resolvedValue: string | null
  resolvedOn: string | null
  leaning: string | null
  /** What the agent says when the topic comes up. The only speakable field here. */
  agentGuidance: string
  raisedOn: string
  blocksClaims: ClaimId[]
}

export interface ForbiddenPattern {
  source: string
  flags: string
  why: string
}

export interface Retraction {
  id: RetractionId
  subject: SubjectId
  statement: string
  short: string
  reason: string
  /** Case-insensitive substrings. C9 fails the build on a hit in a new surface. */
  forbiddenPhrases: string[]
  forbiddenPatterns?: ForbiddenPattern[]
  retractedOn: string
  previouslyAt: string[]
  supersededBy?: ClaimId[]
  note?: string | null
}

export interface Requirement {
  id: RequirementId
  label: string
  weight: number
  concepts: ConceptId[]
  /** Claims a human decided are the strongest evidence; they get a scoring floor. */
  pinned: ClaimId[]
  /** The honest framing to keep when this requirement is weak. Not model output. */
  fallback?: string | null
}

export interface RoleProfile {
  id: RoleProfileId
  label: string
  blurb: string
  requirements: Requirement[]
}

export interface CorpusMeta {
  version: number
  generatedAt: string | null
  corpusHash: string | null
  counts: Record<string, number>
  note: string
}

/* ── retrieval ─────────────────────────────────────────────────────────────── */

export interface JdAnalysis {
  /** Normalised tokens, for the lexical tiebreaker. */
  tokens: string[]
  /** Concepts the JD named, by alias match. */
  concepts: ConceptId[]
  /** Alias-shaped spans that matched no concept: the corpus's own blind spots. */
  unmatchedTerms: string[]
}

export interface Hit {
  claim: Claim
  score: number
  matchedConcepts: ConceptId[]
  via: 'pinned' | 'concept' | 'adjacent'
}

export type Coverage = 'strong' | 'partial' | 'coursework-only' | 'none'

export interface RequirementResult {
  requirementId: RequirementId
  label: string
  weight: number
  coverage: Coverage
  hits: Hit[]
  gap: Gap | null
  fallback: string | null
  /** One line naming the gate that ran, so a result can be read back afterwards. */
  note: string
}

/**
 * What retrieve() returns. Deliberately NOT called a "fit brief": composing the
 * brief is the agent's job (brief Addendum B, ruling R-2). This is evidence
 * selection and nothing more — a pure function of the corpus and the input.
 */
export interface RetrievalResult {
  profile: RoleProfileId | 'custom'
  profileConfidence: 'matched' | 'custom'
  requirements: RequirementResult[]
  unmatchedJdTerms: string[]
  /** Disputes whose topic the requirements touched. A stated uncertainty, never a silence. */
  disputesTouched: Array<{ dispute: Dispute; requirementId: RequirementId }>
  /** Union of the caveats of every cited claim. The renderer MUST emit all of them. */
  mandatoryCaveats: ClaimId[]
  /** Every claim the renderer is licensed to assert from. Nothing else. */
  citedClaims: ClaimId[]
  corpusHash: string | null
  generatedAt: string
}
