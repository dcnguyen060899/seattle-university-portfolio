/**
 * lib/agent/retrieval.ts — the deterministic retriever, in two shapes.
 *
 *   retrieve()      (from lib/corpus) runs a whole ROLE PROFILE: eight
 *                   human-authored requirements, each with pinned evidence and
 *                   a written gap. That is what builds the shortlist.
 *   scoreQuery()    (here) runs ONE arbitrary requirement string. That is what
 *                   the `search_evidence` tool exposes to the model, and — far
 *                   more importantly — what the server uses to CHECK the
 *                   model's verdicts against evidence it fetched itself.
 *
 * Both go through the same `scoreClaim` in lib/corpus/retrieve.ts, so there is
 * exactly one scoring function on this site. A second scorer would be a second
 * opinion about what counts as evidence, and the whole point of §4.6 is that
 * the server's opinion is the one that wins.
 *
 * WHY LEXICAL AND NOT EMBEDDINGS
 * ------------------------------
 * (a) Reproducible: the same posting gives the same shortlist forever, so the
 *     numbers on the run strip mean something and the tests are deterministic.
 * (b) Explainable: the panel shows `matched: retrieval, evaluation, PyTorch`
 *     rather than a cosine a recruiter cannot interpret.
 * (c) Zero infrastructure: no account, no key, no cold start — the same
 *     $0-from-a-fresh-clone property the whole page argues for.
 *
 * THE ONE ASYMMETRY WORTH UNDERSTANDING
 * -------------------------------------
 * `scoreQuery` seeds its ad-hoc requirement with the PINNED claims of any
 * profile requirement that shares a concept with the query. Without that seed
 * the server's check would be systematically harsher than the shortlist the
 * server itself handed the model, and it would punish the model for using the
 * evidence it was given. The server may be more conservative than the model
 * about a verdict; it must not be more conservative than itself.
 */

import {
  CLAIMS,
  GAPS,
  ORGS,
  PEOPLE,
  ROLE_PROFILES,
  orgById,
  personById,
  roleById,
} from '../corpus/index'
import { analyseJd, normalise } from '../corpus/jd'
import { MIN_HIT_SCORE, coverageFor, scoreClaim } from '../corpus/retrieve'
import type {
  ClaimId,
  Coverage,
  Hit,
  Requirement,
  RequirementResult,
  RetrievalResult,
} from '../corpus/types'
import { recordById } from './corpus'
import type { EvidenceRecord } from '../corpus/toEvidenceRecord'

export { MIN_HIT_SCORE }

export interface RankedRecord {
  record: EvidenceRecord
  score: number
  matched: string[]
  via: Hit['via']
}

/** Concept ids → the pinned claims a human already decided answer them. */
const PINNED_BY_CONCEPT: ReadonlyMap<string, readonly ClaimId[]> = (() => {
  const map = new Map<string, ClaimId[]>()
  for (const profile of ROLE_PROFILES) {
    for (const req of profile.requirements) {
      for (const concept of req.concepts) {
        const bucket = map.get(concept) ?? []
        for (const id of req.pinned) if (!bucket.includes(id)) bucket.push(id)
        map.set(concept, bucket)
      }
    }
  }
  return map
})()

/**
 * Requirements a HUMAN wrote, indexed by their exact label.
 *
 * When a requirement string is one of the corpus's own role-profile labels —
 * which is the case for every row of a pre-built brief — the server's check
 * uses that requirement object, pinned evidence and all, rather than
 * re-deriving concepts from the label's wording.
 *
 * This is not circular and it is worth being clear about why: the match is
 * against labels the CORPUS authored, never against the citations the model
 * chose. Without it, a row whose label happens to use vocabulary the alias
 * table does not carry ("Stating the limits of a result") would be downgraded
 * for a gap in the vocabulary rather than for a gap in the evidence — which
 * would make the calibration mechanism look busy while measuring nothing.
 */
const REQUIREMENT_BY_LABEL: ReadonlyMap<string, Requirement> = (() => {
  const map = new Map<string, Requirement>()
  for (const profile of ROLE_PROFILES) {
    for (const req of profile.requirements) {
      const key = req.label.trim().toLowerCase()
      if (!map.has(key)) map.set(key, req)
    }
  }
  return map
})()

/** An ad-hoc requirement built from one line of a job description. */
export function requirementFromQuery(query: string): { requirement: Requirement; concepts: string[] } {
  const authored = REQUIREMENT_BY_LABEL.get(query.trim().toLowerCase())
  if (authored) return { requirement: authored, concepts: [...authored.concepts] }

  const jd = analyseJd(query)
  const pinned: ClaimId[] = []
  for (const concept of jd.concepts) {
    for (const id of PINNED_BY_CONCEPT.get(concept) ?? []) {
      if (!pinned.includes(id)) pinned.push(id)
    }
  }
  return {
    requirement: {
      id: 'r:adhoc',
      label: query.slice(0, 160),
      weight: 1,
      concepts: jd.concepts,
      pinned,
      fallback: null,
    },
    concepts: jd.concepts,
  }
}

/**
 * Rank the whole corpus against one requirement string.
 *
 * Ties break by corpus order, so the result is byte-stable across runs and a
 * diff of two briefs is readable. Scores are already rounded by `scoreClaim`.
 */
export function scoreQuery(query: string, k = 8): RankedRecord[] {
  const { requirement } = requirementFromQuery(query)
  const jd = analyseJd(query)
  const indexOf = new Map(CLAIMS.map((c, i) => [c.id, i]))

  const hits: Hit[] = []
  for (const claim of CLAIMS) {
    const hit = scoreClaim(claim, requirement, jd)
    if (hit) hits.push(hit)
  }
  hits.sort((a, b) => b.score - a.score || (indexOf.get(a.claim.id)! - indexOf.get(b.claim.id)!))

  const out: RankedRecord[] = []
  for (const hit of hits) {
    const record = recordById(hit.claim.id)
    if (!record) continue // not licensed for the agent surface
    out.push({ record, score: hit.score, matched: [...hit.matchedConcepts], via: hit.via })
    if (out.length >= k) break
  }
  return out
}

/* ── the name-and-word fallback, for questions rather than postings ──────── */

/**
 * A searchable blob per record: what it says, and WHO AND WHERE it is about.
 *
 * The concept scorer is right for a job description, where the vocabulary is
 * technical and shared. It is wrong for a question, where a recruiter asks
 * "what did he do for Professor Fischer?" — a sentence with no technical
 * concept in it at all and an obvious correct answer. Advisor names, the
 * organisation and the role title appear in no claim's text, so they are joined
 * on here, once, at module scope.
 */
const SEARCH_BLOB: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>()
  for (const claim of CLAIMS) {
    if (!claim.asserted || !claim.surfaces.includes('agent')) continue
    const extra: string[] = []
    if (claim.subject.startsWith('rol:')) {
      const role = roleById(claim.subject as `rol:${string}`)
      extra.push(role.title, orgById(role.orgId).name)
      for (const id of role.advisorIds ?? []) extra.push(personById(id).name)
    } else if (claim.subject.startsWith('per:')) {
      extra.push(personById(claim.subject as `per:${string}`).name)
    } else if (claim.subject.startsWith('org:')) {
      extra.push(orgById(claim.subject as `org:${string}`).name)
    }
    map.set(claim.id, normalise([claim.statement, claim.short, ...extra].join(' ')))
  }
  return map
})()

/**
 * How many records each word appears in.
 *
 * This is what lets a SINGLE word be enough to answer a question. "gpa" appears
 * in one record and is a complete question on its own; "data" appears in most
 * of them and answers nothing. Counting is the difference between the two, and
 * it is a property of this corpus rather than a list somebody has to maintain.
 */
const DOC_FREQUENCY: ReadonlyMap<string, number> = (() => {
  const counts = new Map<string, number>()
  for (const blob of SEARCH_BLOB.values()) {
    for (const word of new Set(blob.split(' '))) {
      if (word.length < 3) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return counts
})()

/** Words that carry no selection signal in a question. Short on purpose. */
const QUESTION_STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'his', 'her', 'him', 'has', 'have', 'had', 'did', 'does', 'done',
  'what', 'who', 'why', 'how', 'when', 'where', 'are', 'was', 'were', 'you', 'your',
  'its', 'not', 'but', 'can', 'all', 'any', 'one', 'two', 'out', 'off', 'get', 'got',
  'use', 'new', 'old', 'now', 'see', 'say', 'tell', 'about', 'with', 'from', 'into',
  'this', 'that', 'they', 'them', 'than', 'then', 'there', 'here', 'work', 'worked',
  'ever', 'much', 'many', 'more', 'most', 'some', 'been', 'being', 'would', 'could',
  'should', 'really', 'actually', 'please',
])

/** Proper nouns the corpus knows: advisors, colleagues, organisations. */
const KNOWN_NAMES: ReadonlySet<string> = new Set(
  [...PEOPLE.map((person) => person.name), ...ORGS.map((org) => org.name)]
    .flatMap((name) => normalise(name).split(' '))
    .map((word) => word.trim())
    .filter((word) => word.length >= 4),
)

/**
 * The fallback used when the concept scorer finds nothing at all.
 *
 * Deliberately narrow, because a loose word match is how an answer ends up
 * citing a record for sharing the word "data": a hit needs either TWO distinct
 * content words in common, or ONE word the corpus knows to be a proper noun.
 * Anything weaker returns nothing — and returning nothing is a correct answer
 * that this site already has a written sentence for.
 */
export function lexicalFallback(question: string, k = 4): RankedRecord[] {
  const words = [
    ...new Set(
      normalise(question)
        .split(' ')
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !QUESTION_STOPWORDS.has(w)),
    ),
  ]
  if (!words.length) return []

  const scored: Array<{ id: string; score: number; matched: string[] }> = []
  for (const [id, blob] of SEARCH_BLOB) {
    const matched = words.filter((w) => blob.includes(w))
    if (!matched.length) continue
    const namedHit = matched.some((w) => KNOWN_NAMES.has(w))
    // One word is enough when it is RARE. "gpa" appears in one record and is a
    // whole question; "data" appears in most of them and answers nothing.
    const rareHit = matched.some((w) => (DOC_FREQUENCY.get(w) ?? 99) <= 3)
    if (matched.length < 2 && !namedHit && !rareHit) continue
    scored.push({
      id,
      score: matched.length + (namedHit ? 2 : 0) + (rareHit ? 1 : 0),
      matched,
    })
  }

  const indexOf = new Map(CLAIMS.map((c, i) => [c.id, i]))
  scored.sort(
    (a, b) => b.score - a.score || indexOf.get(a.id as ClaimId)! - indexOf.get(b.id as ClaimId)!,
  )

  const out: RankedRecord[] = []
  for (const hit of scored) {
    const record = recordById(hit.id)
    if (!record) continue
    out.push({ record, score: hit.score, matched: hit.matched.slice(0, 4), via: 'adjacent' })
    if (out.length >= k) break
  }
  return out
}

/**
 * Written gaps a question reaches by CONCEPT first, then by word.
 *
 * The word path matters because a question is written in a recruiter's own
 * language: "has he deployed a model to production?" names no concept the alias
 * table carries, and the corpus holds a sentence written for exactly it. The
 * word path is held to the same two-word floor as the record fallback, so it
 * cannot pull in a gap for sharing one common word.
 */
export function gapsForQuestion(question: string, k = 2): string[] {
  const named = analyseJd(question).concepts
  const byConcept = GAPS.filter(
    (g) => g.disclose && g.concepts.some((c) => named.includes(c)),
  )
  if (byConcept.length) return byConcept.slice(0, k).map((g) => g.honestAnswer)

  const words = new Set(
    normalise(question)
      .split(' ')
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !QUESTION_STOPWORDS.has(w)),
  )
  // Two matches AND one of them in the gap's LABEL. Without the label
  // condition, "what did he build for the barn owl lab?" reaches two gaps on
  // the words "build" and "lab", which appear in half the written answers — and
  // a question about work he HAS done comes back as a gap. The label is the
  // gap's subject; the answer is its prose.
  const byWord = GAPS.filter((g) => {
    if (!g.disclose) return false
    const label = normalise(g.label)
    const blob = normalise(`${g.label} ${g.honestAnswer}`)
    let hits = 0
    let labelHit = false
    for (const word of words) {
      if (!blob.includes(word)) continue
      hits += 1
      if (label.includes(word)) labelHit = true
    }
    return hits >= 2 && labelHit
  })
  return byWord.slice(0, k).map((g) => g.honestAnswer)
}

/**
 * How many evidence records mention a word at all.
 *
 * The alias table not knowing a word and this site not mentioning it are two
 * different facts, and only the second licenses the sentence "nothing on this
 * site mentions X". "production" is the case that proves it: it is not a
 * concept alias, and it appears in several records.
 */
export const corpusMentions = (term: string): number =>
  DOC_FREQUENCY.get(normalise(term).trim()) ?? 0

/** Concepts first; words only when concepts found nothing. */
export function searchForQuestion(question: string, k = 6): RankedRecord[] {
  const byConcept = scoreQuery(question, k)
  if (byConcept.length) return byConcept
  return lexicalFallback(question, k)
}


/**
 * The coverage the SERVER believes one requirement has, and the verdict ceiling
 * that follows from it.
 *
 * `fallback` is the corpus author's own framing note for this requirement — the
 * sentence a human wrote for when the evidence needs qualifying ("one
 * first-author manuscript under review; no accepted publication yet"). Its mere
 * PRESENCE is information: somebody looked at this requirement, decided the
 * evidence would read as stronger than it is, and wrote the correction down.
 * The caller uses it to cap the verdict, which is why it is returned here
 * rather than left inside the retrieval result nobody downstream reads.
 */
export function coverageForQuery(query: string): {
  coverage: Coverage
  top: RankedRecord | null
  fallback: string | null
} {
  const { requirement } = requirementFromQuery(query)
  const jd = analyseJd(query)
  const hits: Hit[] = []
  for (const claim of CLAIMS) {
    const hit = scoreClaim(claim, requirement, jd)
    if (hit) hits.push(hit)
  }
  hits.sort((a, b) => b.score - a.score)
  const ranked = scoreQuery(query, 1)
  return {
    coverage: coverageFor(hits),
    top: ranked[0] ?? null,
    fallback: requirement.fallback ?? null,
  }
}

/**
 * The shortlist: the strongest evidence for the WHOLE posting, de-duplicated
 * across requirements and capped, as full records.
 *
 * Ordering is by best score across requirements, so the model reads the
 * strongest evidence first; ties break by corpus order for stability.
 */
export function shortlistFrom(result: RetrievalResult, k = 9): RankedRecord[] {
  const best = new Map<string, { score: number; matched: string[]; via: Hit['via'] }>()
  for (const req of result.requirements) {
    for (const hit of req.hits) {
      const prev = best.get(hit.claim.id)
      if (!prev || hit.score > prev.score) {
        best.set(hit.claim.id, {
          score: hit.score,
          matched: [...hit.matchedConcepts],
          via: hit.via,
        })
      }
    }
  }

  const indexOf = new Map(CLAIMS.map((c, i) => [c.id, i]))
  const out: RankedRecord[] = []
  for (const [id, meta] of [...best.entries()].sort(
    (a, b) => b[1].score - a[1].score || (indexOf.get(a[0] as ClaimId)! - indexOf.get(b[0] as ClaimId)!),
  )) {
    const record = recordById(id)
    if (!record) continue
    out.push({ record, score: meta.score, matched: meta.matched, via: meta.via })
    if (out.length >= k) break
  }
  return out
}

/**
 * Every mandatory caveat the shortlist drags along, as full records.
 *
 * They are appended to the shortlist rather than left to be fetched, because a
 * caveat that has to be fetched is a caveat that can be missed, and two of
 * these — the majority-category limit on the untrained label, and the "in
 * flight, not shipped" rider — are load-bearing by the corpus's own ruling.
 */
export function caveatRecordsFor(shortlist: readonly RankedRecord[]): EvidenceRecord[] {
  const out: EvidenceRecord[] = []
  const seen = new Set<string>(shortlist.map((r) => r.record.id))
  for (const item of shortlist) {
    for (const caveatId of item.record.caveats) {
      if (seen.has(caveatId)) continue
      const record = recordById(caveatId)
      if (!record) continue
      seen.add(caveatId)
      out.push(record)
    }
  }
  return out
}

/** Requirement results that found nothing, with the sentence written for them. */
export function unmetRequirements(result: RetrievalResult): RequirementResult[] {
  return result.requirements.filter((r) => r.coverage === 'none' || r.coverage === 'coursework-only')
}
