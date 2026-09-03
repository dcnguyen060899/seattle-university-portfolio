/**
 * lib/corpus/index.ts — the ONLY doorway between the evidence store and anything
 * that renders.
 *
 * Two rules make this file worth having:
 *
 *  1. NOTHING DOWNSTREAM HOLDS A LITERAL. Copy, the résumé, the JSON-LD and the
 *     agent all reach a number through `claimValue(id, surface)`. There is no
 *     second fact store: `lib/facts.ts` and `content/facts.ts` do not exist, by
 *     ruling (brief Addendum B, R-5).
 *
 *  2. EVERY ACCESSOR THROWS RATHER THAN RETURNS EMPTY. A typo in a claim id, a
 *     claim that is not licensed for the surface asking, a disputed figure reached
 *     by accident — each is a thrown Error at build time, not a silently missing
 *     number on a live page. A page that fails to build is a bug; a page that
 *     quietly drops a citation is a lie.
 *
 * Data is loaded by STATIC IMPORT and frozen at module scope. Not `fs.readFile`:
 * static import means the whole selection policy works unchanged in a React Server
 * Component, in a route handler, and in a unit test with no filesystem and no keys
 * — which is what makes it testable from a fresh clone.
 */

import claimsJson from '../../data/corpus/claims.json'
import conceptsJson from '../../data/corpus/concepts.json'
import skillsJson from '../../data/corpus/skills.json'
import rolesJson from '../../data/corpus/roles.json'
import artifactsJson from '../../data/corpus/artifacts.json'
import sourcesJson from '../../data/corpus/sources.json'
import orgsJson from '../../data/corpus/orgs.json'
import peopleJson from '../../data/corpus/people.json'
import gapsJson from '../../data/corpus/gaps.json'
import disputesJson from '../../data/corpus/disputes.json'
import retractionsJson from '../../data/corpus/retractions.json'
import roleProfilesJson from '../../data/corpus/role-profiles.json'
import metaJson from '../../data/corpus/meta.json'

import type {
  Artifact,
  ArtifactId,
  Claim,
  ClaimId,
  Concept,
  ConceptId,
  CorpusMeta,
  Dispute,
  DisputeId,
  Gap,
  GapId,
  Org,
  OrgId,
  Person,
  PersonId,
  Retraction,
  Role,
  RoleId,
  RoleProfile,
  RoleProfileId,
  Skill,
  SkillId,
  Source,
  SourceId,
  SubjectId,
  Surface,
} from './types'

/* ── the frozen store ──────────────────────────────────────────────────────── */

export const CLAIMS: readonly Claim[] = Object.freeze(claimsJson as unknown as Claim[])
export const CONCEPTS: readonly Concept[] = Object.freeze(conceptsJson as unknown as Concept[])
export const SKILLS: readonly Skill[] = Object.freeze(skillsJson as unknown as Skill[])
export const ROLES: readonly Role[] = Object.freeze(rolesJson as unknown as Role[])
export const ARTIFACTS: readonly Artifact[] = Object.freeze(artifactsJson as unknown as Artifact[])
export const SOURCES: readonly Source[] = Object.freeze(sourcesJson as unknown as Source[])
export const ORGS: readonly Org[] = Object.freeze(orgsJson as unknown as Org[])
export const PEOPLE: readonly Person[] = Object.freeze(peopleJson as unknown as Person[])
export const GAPS: readonly Gap[] = Object.freeze(gapsJson as unknown as Gap[])
export const DISPUTES: readonly Dispute[] = Object.freeze(disputesJson as unknown as Dispute[])
export const RETRACTIONS: readonly Retraction[] = Object.freeze(
  retractionsJson as unknown as Retraction[]
)
export const ROLE_PROFILES: readonly RoleProfile[] = Object.freeze(
  roleProfilesJson as unknown as RoleProfile[]
)
export const META: CorpusMeta = Object.freeze(metaJson as unknown as CorpusMeta)

const CLAIM_BY_ID = new Map(CLAIMS.map((c) => [c.id, c]))
const CONCEPT_BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]))
const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]))
const ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r]))
const ARTIFACT_BY_ID = new Map(ARTIFACTS.map((a) => [a.id, a]))
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]))
const ORG_BY_ID = new Map(ORGS.map((o) => [o.id, o]))
const PERSON_BY_ID = new Map(PEOPLE.map((p) => [p.id, p]))
const GAP_BY_ID = new Map(GAPS.map((g) => [g.id, g]))
const DISPUTE_BY_ID = new Map(DISPUTES.map((d) => [d.id, d]))
const PROFILE_BY_ID = new Map(ROLE_PROFILES.map((p) => [p.id, p]))

export const corpusHash = (): string | null => META.corpusHash

/* ── lookups that throw ────────────────────────────────────────────────────── */

function must<T>(map: Map<string, T>, id: string, kind: string): T {
  const found = map.get(id)
  if (!found) throw new Error(`corpus: unknown ${kind} "${id}"`)
  return found
}

export const claimById = (id: ClaimId): Claim => must(CLAIM_BY_ID, id, 'claim')
export const conceptById = (id: ConceptId): Concept => must(CONCEPT_BY_ID, id, 'concept')
export const skillById = (id: SkillId): Skill => must(SKILL_BY_ID, id, 'skill')
export const roleById = (id: RoleId): Role => must(ROLE_BY_ID, id, 'role')
export const artifactById = (id: ArtifactId): Artifact => must(ARTIFACT_BY_ID, id, 'artifact')
export const sourceById = (id: SourceId): Source => must(SOURCE_BY_ID, id, 'source')
export const orgById = (id: OrgId): Org => must(ORG_BY_ID, id, 'org')
export const personById = (id: PersonId): Person => must(PERSON_BY_ID, id, 'person')
export const gapById = (id: GapId): Gap => must(GAP_BY_ID, id, 'gap')
export const disputeById = (id: DisputeId): Dispute => must(DISPUTE_BY_ID, id, 'dispute')
export const roleProfileById = (id: RoleProfileId): RoleProfile =>
  must(PROFILE_BY_ID, id, 'role profile')

/* ── the licence check every read passes through ───────────────────────────── */

/**
 * The single gate. It refuses, in order:
 *   - an id that does not exist            (a typo, caught at build)
 *   - a claim that is not asserted         (disputed figures, reached by accident)
 *   - a surface the claim is not licensed for
 *
 * `internal` is not a renderable surface and is rejected outright: it exists so a
 * record can be kept without ever being shown.
 */
function licensed(id: ClaimId, surface: Surface): Claim {
  const claim = claimById(id)
  if (!claim.asserted) {
    throw new Error(
      `corpus: ${id} is status "${claim.status}" and asserted:false — it must not be rendered. ` +
        (claim.disputeId ? `See dispute ${claim.disputeId} for what to say instead.` : '')
    )
  }
  if (surface === 'internal') {
    throw new Error(`corpus: "internal" is bookkeeping, not a renderable surface`)
  }
  if (!claim.surfaces.includes(surface)) {
    throw new Error(
      `corpus: ${id} is not licensed for surface "${surface}" (licensed for: ${claim.surfaces.join(', ') || 'nothing'})`
    )
  }
  return claim
}

/**
 * THE ONLY WAY COPY TOUCHES A NUMBER.
 *
 * Throws on an unknown id, on a non-metric claim, on a claim that is not asserted,
 * and on any surface the claim is not licensed for.
 */
export function claimValue(id: ClaimId, surface: Surface): string {
  const claim = licensed(id, surface)
  if (claim.kind !== 'metric') {
    throw new Error(`corpus: ${id} is kind "${claim.kind}", not metric — use claimText()`)
  }
  if (!claim.value) throw new Error(`corpus: ${id} is a metric with no value block`)
  return claim.value.display
}

/** The full licensed sentence. */
export function claimText(id: ClaimId, surface: Surface): string {
  return licensed(id, surface).statement
}

/** The chip / stat-label form. */
export function claimShort(id: ClaimId, surface: Surface): string {
  return licensed(id, surface).short
}

/**
 * A claim together with every caveat it drags along.
 *
 * A surface that renders the claim MUST render these too — that is what makes the
 * BI-RADS majority-class caveat and the "in flight, not shipped" rider impossible
 * to drop by accident rather than merely impolite to drop on purpose. Check C10
 * verifies it after the fact.
 */
export function claimWithCaveats(
  id: ClaimId,
  surface: Surface
): { claim: Claim; caveats: Claim[] } {
  const claim = licensed(id, surface)
  const caveats = (claim.caveats ?? []).map((cid) => {
    const caveat = claimById(cid)
    if (!caveat.surfaces.includes(surface)) {
      throw new Error(
        `corpus: ${id} requires caveat ${cid}, but ${cid} is not licensed for surface "${surface}". ` +
          `A claim may never be renderable somewhere its mandatory caveat is not.`
      )
    }
    return caveat
  })
  return { claim, caveats }
}

/** Every mandatory caveat id for a set of claims, de-duplicated, order-stable. */
export function mandatoryCaveatsFor(ids: readonly ClaimId[]): ClaimId[] {
  const out: ClaimId[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    for (const cid of claimById(id).caveats ?? []) {
      if (!seen.has(cid)) {
        seen.add(cid)
        out.push(cid)
      }
    }
  }
  return out
}

/* ── bulk reads ────────────────────────────────────────────────────────────── */

export interface RecordFilter {
  surface?: Surface
  subject?: SubjectId
  concepts?: ConceptId[]
  /** Default true: unasserted claims are excluded unless explicitly asked for. */
  assertedOnly?: boolean
}

/**
 * The bulk accessor the agent layer consumes.
 *
 * `assertedOnly` defaults to TRUE, so the safe result is what you get when you do
 * not think about it. Passing false is a deliberate act, and the only legitimate
 * reason is an audit that needs to see the disputed records too.
 */
export function getRecords(filter: RecordFilter = {}): Claim[] {
  const { surface, subject, concepts, assertedOnly = true } = filter
  return CLAIMS.filter((c) => {
    if (assertedOnly && !c.asserted) return false
    if (surface && !c.surfaces.includes(surface)) return false
    if (subject && c.subject !== subject) return false
    if (concepts?.length && !concepts.some((k) => c.concepts.includes(k))) return false
    return true
  })
}

/** Claims about one role, in corpus order. */
export const claimsForRole = (roleId: RoleId, surface: Surface): Claim[] =>
  getRecords({ subject: roleId, surface })

/** Skills whose level is above `familiar`, for JSON-LD `knowsAbout`. */
export const assertedSkills = (): Skill[] => SKILLS.filter((s) => s.level !== 'familiar')

/** Artifact URLs, skipping anything that is not public. */
export function artifactUrls(ids: readonly ArtifactId[]): string[] {
  return ids
    .map(artifactById)
    .filter((a) => a.access === 'public' && a.url)
    .map((a) => a.url as string)
}

/**
 * The retraction list, as regexes ready to scan a rendered surface.
 *
 * Exported so that the agent layer can apply the same list to model output before
 * it reaches a reader — the build gate catches what is committed, this catches
 * what is generated. Same source of truth, two enforcement points.
 */
export function forbiddenMatchers(): Array<{ id: string; label: string; re: RegExp }> {
  const out: Array<{ id: string; label: string; re: RegExp }> = []
  for (const r of RETRACTIONS) {
    for (const phrase of r.forbiddenPhrases) {
      out.push({
        id: r.id,
        label: phrase,
        re: new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      })
    }
    for (const p of r.forbiddenPatterns ?? []) {
      out.push({ id: r.id, label: p.source, re: new RegExp(p.source, p.flags || 'i') })
    }
  }
  return out
}

/** First retraction hit in a string, or null. Cheap enough to run on every output. */
export function findRetractedPhrase(
  text: string
): { retractionId: string; matched: string } | null {
  for (const m of forbiddenMatchers()) {
    const hit = m.re.exec(text)
    if (hit) return { retractionId: m.id, matched: hit[0] }
  }
  return null
}

export * from './types'
