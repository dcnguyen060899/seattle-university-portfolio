import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The retraction matchers, read straight off `data/corpus/retractions.json`.
 *
 * WHY THIS RE-IMPLEMENTS `lib/corpus/index.ts#findRetractedPhrase` INSTEAD OF
 * IMPORTING IT: this file is the independent witness. The point of the HTTP-layer
 * crawl (retracted-content.spec.ts) is belt-and-braces over
 * `scripts/verify-corpus.mjs --built`, and a gate that shares its matcher
 * construction with the thing it is double-checking can be switched off by one
 * edit in a place neither gate looks. 40 lines of duplication buys an
 * independent reading of the same source of truth. If the two ever disagree
 * about what "retracted" means, that disagreement is itself the finding.
 *
 * The construction is deliberately identical to `verify-corpus.mjs`'s: phrases
 * are matched as case-insensitive literal substrings (regex-escaped), patterns
 * are compiled with their own declared flags.
 */

const ROOT = process.cwd()

export interface ForbiddenPattern {
  source: string
  flags?: string
  why?: string
}

export interface RetractionRecord {
  id: string
  short: string
  statement: string
  forbiddenPhrases: string[]
  forbiddenPatterns?: ForbiddenPattern[]
  supersededBy?: string[]
}

export interface RetractionMatcher {
  /** `ret:…` */
  id: string
  /** The literal phrase, or `/source/` for a pattern. */
  label: string
  re: RegExp
  sayInstead: string[]
}

export const RETRACTIONS: RetractionRecord[] = JSON.parse(
  readFileSync(join(ROOT, 'data', 'corpus', 'retractions.json'), 'utf8'),
) as RetractionRecord[]

function escapeLiteral(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const RETRACTION_MATCHERS: RetractionMatcher[] = RETRACTIONS.flatMap((r) => [
  ...r.forbiddenPhrases.map((phrase) => ({
    id: r.id,
    label: phrase,
    re: new RegExp(escapeLiteral(phrase), 'i'),
    sayInstead: r.supersededBy ?? [],
  })),
  ...(r.forbiddenPatterns ?? []).map((p) => ({
    id: r.id,
    label: `/${p.source}/`,
    re: new RegExp(p.source, p.flags || 'i'),
    sayInstead: r.supersededBy ?? [],
  })),
])

export interface RetractionHit {
  retractionId: string
  /** The phrase or pattern that fired. */
  rule: string
  /** What was actually matched in the text. */
  matched: string
  /** ~50 characters either side, whitespace-collapsed. */
  context: string
  sayInstead: string[]
}

/** Every distinct retraction rule that fires anywhere in `text`. */
export function findRetractions(text: string): RetractionHit[] {
  const hits: RetractionHit[] = []
  for (const m of RETRACTION_MATCHERS) {
    const hit = m.re.exec(text)
    if (!hit) continue
    const at = text.indexOf(hit[0])
    hits.push({
      retractionId: m.id,
      rule: m.label,
      matched: hit[0],
      context: text
        .slice(Math.max(0, at - 50), at + hit[0].length + 50)
        .replace(/\s+/g, ' ')
        .trim(),
      sayInstead: m.sayInstead,
    })
  }
  return hits
}

/** A one-line-per-hit projection, so a failure diff is readable. */
export function summariseHits(hits: RetractionHit[]): string[] {
  return hits.map((h) => `${h.retractionId} · "${h.rule}"`)
}

export function formatHits(where: string, hits: RetractionHit[]): string {
  return hits
    .map(
      (h) =>
        `  ${where}\n    ${h.retractionId} matched "${h.matched}" (rule: ${h.rule})\n` +
        `    …${h.context}…\n` +
        (h.sayInstead.length
          ? `    Say ${h.sayInstead.join(' / ')} instead.`
          : '    There is no replacement: it does not ship.'),
    )
    .join('\n')
}

/* ══════════════════════════════════════════════════════════════════════════
   THE FROZEN-PAGE QUARANTINE

   The brief's test spec says "crawl every served surface — the homepage AND
   every page under /docs/ — and assert none contains any retracted string".
   Measured against the tree as it stands, that assertion is FALSE BY DESIGN,
   and `scripts/verify-corpus.mjs` says so in its own header:

     "public/docs/** is deliberately EXCLUDED. Those are frozen legacy pages,
      byte-identical to what GitHub Pages serves today; their URLs are on a
      résumé and on LinkedIn, and they are full of exactly the figures this
      corpus retracts."

   Deleting them was considered and rejected (Addendum B, R-4: the URLs stay
   alive because a résumé domain should not 404 on an inbound link), and
   REWRITING them is forbidden by the same ruling and enforced by the
   `legacy-guard` job in .github/workflows/ci.yml.

   So the honest gate is not "zero hits anywhere". It is an EXACT SNAPSHOT:
   these two files carry these retractions and no others, and every other
   served surface carries none. That fails in both directions —

     · a NEW retracted string appearing on any page fails, which is the
       regression the brief actually wants caught;
     · a quarantined page being cleaned up ALSO fails, with a message saying to
       shrink this list. A quarantine that silently outlives its reason is how
       an exemption becomes permanent.

   The list is keyed by served path and holds retraction IDS, not phrases: the
   individual phrases within one retraction record are free to be re-worded by
   the corpus territory without churning this file, but a whole new class of
   retracted content appearing on a frozen page is exactly what should churn it.
   ══════════════════════════════════════════════════════════════════════════ */

export const FROZEN_PAGE_QUARANTINE: Record<string, string[]> = {
  /**
   * The MOSAIC project page carries the bare "660K" figure. Addendum C.2
   * resolved what that number actually is — MOSAIC's own recorded annual
   * website visits from its 2022 annual report, not anything Duy's system
   * served — and `clm:mosaic-reach` licenses exactly one framing of it on the
   * new surfaces. This page predates that framing.
   */
  '/docs/index_mosaic_chatbot.html': ['ret:mosaic-reach-misuse'],

  /**
   * The April 2026 news entry is the single densest concentration of stale
   * barn-owl figures on the domain: the engine (MySQL, superseded by SQLite),
   * the scale (110 neurons / 8 owls, superseded by 195 / 7), the archive size
   * ("14,000+", an UNDERCOUNT — the real figure is 30,147), the pass count
   * (261, really 1,325), the unsourced "228 file loads" and the uncorroborated
   * "6-phase" pipeline. Every one of them is superseded by a `clm:fischer-*`
   * claim that carries a verification date and a re-derivation command.
   */
  '/docs/news.html': [
    'ret:fischer-mysql',
    'ret:fischer-110-neurons',
    'ret:fischer-8-owls',
    'ret:fischer-14000-files',
    'ret:fischer-261-experiments',
    'ret:fischer-228-loads',
    'ret:fischer-6-phase',
  ],
}
