/**
 * lib/corpus/jd.ts — job description text → the concepts it named.
 *
 * PURE. No I/O, no model call, no key. Which is the point: two recruiters who
 * paste the same job description get the same evidence selected, every time, and
 * the whole policy can be unit-tested on a fresh clone.
 *
 * The matcher is an alias table, not an embedding, and that is a deliberate
 * choice rather than a shortcut. A job description and a CV are the same genre in
 * the same register: "distributed data processing", "Spark" and "large-scale ETL"
 * are lexically reachable from each other through a synonym list a human can read
 * and argue with. When this matcher is wrong, the fix is one line in concepts.json
 * and the reviewer can see exactly what changed in the diff. When an embedding is
 * wrong, the fix is a re-embed and a hope.
 *
 * What the alias table guarantees is the FLOOR, not the ceiling: unmatched spans
 * are returned rather than dropped, so a phrasing the vocabulary does not know
 * about becomes a reported blind spot instead of a silent miss.
 */

import { CONCEPTS } from './index'
import type { ConceptId, JdAnalysis } from './types'

/** Words that carry no selection signal. Kept short on purpose: an aggressive
 *  stoplist hides misses, and a miss we can see is worth more than a miss we cannot. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'for', 'from',
  'has', 'have', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'that', 'the',
  'their', 'this', 'to', 'we', 'will', 'with', 'you', 'your', 'they', 'them', 'must',
  'should', 'would', 'able', 'work', 'working', 'role', 'team', 'teams', 'experience',
  'years', 'year', 'strong', 'excellent', 'good', 'plus', 'nice', 'required', 'preferred',
])

/**
 * Lowercase, collapse whitespace, turn punctuation into spaces — but keep the
 * characters that live INSIDE technical tokens: hyphens, dots, slashes and the
 * plus sign, so "scikit-learn", "node.js", "ci/cd" and "c++" survive normalisation
 * instead of being shredded into meaningless fragments.
 */
export function normalise(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9+./#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `
}

/** Alias index, longest-first, so "big data analytics" is consumed before "big data". */
type AliasEntry = { alias: string; conceptId: ConceptId }

let ALIAS_INDEX: AliasEntry[] | null = null

function aliasIndex(): AliasEntry[] {
  if (ALIAS_INDEX) return ALIAS_INDEX
  const entries: AliasEntry[] = []
  for (const concept of CONCEPTS) {
    for (const alias of concept.aliases) entries.push({ alias, conceptId: concept.id })
  }
  entries.sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias))
  ALIAS_INDEX = entries
  return entries
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Sentinel written over a consumed alias span. It must be a character `normalise`
 * can never emit (it keeps only [a-z0-9+./#-] and spaces), so it can never be
 * mistaken for text from the posting. It is deliberately NOT a control character:
 * a NUL here trips `no-control-regex` at the split site below, and a lint error
 * inside the matcher is a lint error nobody reads.
 */
const MASK = '~'

/**
 * Match on word boundaries and CONSUME the matched span, so a long alias cannot
 * be double-counted by the short one nested inside it. Consumption is what makes
 * "big data analytics" resolve to the ecosystem concept rather than also firing
 * the generic "data" family — a bug the first version of this had, and the reason
 * the loop replaces rather than merely records.
 */
export function matchConcepts(text: string): {
  concepts: ConceptId[]
  consumed: string
} {
  let working = normalise(text)
  const found: ConceptId[] = []
  const seen = new Set<string>()

  for (const { alias, conceptId } of aliasIndex()) {
    const needle = normalise(alias).trim()
    if (!needle) continue
    const re = new RegExp(`(?<=[^a-z0-9]) ?${escapeRe(needle)} ?(?=[^a-z0-9])`, 'g')
    if (!re.test(working)) continue
    working = working.replace(new RegExp(escapeRe(needle), 'g'), ` ${MASK} `)
    if (!seen.has(conceptId)) {
      seen.add(conceptId)
      found.push(conceptId)
    }
  }
  return { concepts: found, consumed: working }
}

/**
 * Spans the vocabulary did not recognise, reported so the brief can say
 * "these did not map to anything in the evidence base". Over time this is also
 * the maintenance queue for concepts.json.
 *
 * Only multi-word or clearly technical-looking leftovers are reported: a list of
 * every ordinary English word in the posting would drown the signal.
 */
function unmatchedTerms(consumed: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const token of consumed.split(new RegExp(`[\\s${MASK}]+`))) {
    const t = token.trim()
    if (t.length < 3) continue
    if (STOPWORDS.has(t)) continue
    if (/^\d+$/.test(t)) continue
    // Technical-looking: carries an internal separator, or is a long single word.
    const technical = /[-./+#]/.test(t) || t.length >= 8
    if (!technical) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out.slice(0, 24)
}

export function analyseJd(text: string): JdAnalysis {
  const { concepts, consumed } = matchConcepts(text)
  const tokens = normalise(text)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  return { tokens, concepts, unmatchedTerms: unmatchedTerms(consumed) }
}

/** Normalised token overlap between a job description and a claim, in [0,1]. */
export function lexicalOverlap(jdTokens: readonly string[], text: string): number {
  if (!jdTokens.length) return 0
  const claimTokens = new Set(
    normalise(text)
      .split(' ')
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  )
  if (!claimTokens.size) return 0
  let shared = 0
  const jdSet = new Set(jdTokens)
  for (const t of jdSet) if (claimTokens.has(t)) shared += 1
  return Math.min(1, shared / Math.min(jdSet.size, claimTokens.size))
}
