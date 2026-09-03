/**
 * lib/agent/corpus.ts — the agent's VIEW of the evidence store.
 *
 * There is one store, `data/corpus/*.json` behind `lib/corpus/`, and this file
 * does not add a second one (brief Addendum B, ruling R-1). What it adds is the
 * four derived structures the fact check needs, each computed once at module
 * scope from the frozen corpus:
 *
 *   ID ENUM         every claim id the model may cite. It goes into the tool
 *                   schemas as a JSON-Schema `enum`, so a fabricated project
 *                   name is rejected by the API before the response is even
 *                   returned to us.
 *   URL ALLOWLIST   every URL the model may emit. A fabricated link is the most
 *                   dangerous single hallucination on a portfolio, because it is
 *                   the one a recruiter CLICKS.
 *   NUMERIC LEXICON every numeric token that appears anywhere a claim licenses.
 *                   Fabricated credentials are, overwhelmingly, fabricated
 *                   numbers.
 *   FORBIDDEN LIST  the retraction records, compiled to matchers. The build gate
 *                   catches what is committed; this catches what is GENERATED.
 *                   Same source of truth, two enforcement points.
 *
 * The id namespace is the corpus's own prefixed form — `clm:`, `art:`, `skl:`,
 * `rol:`, `cpt:`, `ret:`. There is no second namespace and no alias map, because
 * an alias map is a place for two spellings of one id to drift.
 */

import { createHash } from 'node:crypto'

import {
  ARTIFACTS,
  CLAIMS,
  DISPUTES,
  GAPS,
  ROLE_PROFILES,
  ROLES,
  claimById,
  corpusHash,
  forbiddenMatchers,
} from '../corpus/index'
import { agentEvidence } from '../corpus/toEvidenceRecord'
import type { EvidenceRecord } from '../corpus/toEvidenceRecord'
import type { ClaimId } from '../corpus/types'
import { esc } from './untrusted'

/* ── the records ───────────────────────────────────────────────────────────── */

/** Asserted, undisputed, agent-licensed. Sorted by id so the prompt prefix is
 *  byte-stable across processes — a cached prefix that reorders is not cached. */
export const RECORDS: readonly EvidenceRecord[] = Object.freeze(
  [...agentEvidence()].sort((a, b) => a.id.localeCompare(b.id)),
)

const RECORD_BY_ID = new Map(RECORDS.map((r) => [r.id as string, r]))

export const recordById = (id: string): EvidenceRecord | undefined => RECORD_BY_ID.get(id)

/** The tool-schema enum. Sorted, frozen; a rename invalidates the prompt cache. */
export const EVIDENCE_ID_ENUM: readonly string[] = Object.freeze(RECORDS.map((r) => r.id))

export const CORPUS_SIZE = RECORDS.length

/**
 * A short, stable version string for the run strip and the log line.
 *
 * `meta.json` carries a `sha256:`-prefixed hash written by the corpus gate; the
 * strip wants twelve hex characters. When the field is absent (a fresh corpus
 * that has not been through the gate yet) we hash the ids we actually loaded,
 * which is still a fingerprint of what the model was shown.
 */
export const CORPUS_VERSION: string = (() => {
  const stated = corpusHash()
  if (stated) return stated.replace(/^sha256:/, '').slice(0, 12)
  return createHash('sha256').update(RECORDS.map((r) => r.id).join('|')).digest('hex').slice(0, 12)
})()

/* ── the URL allowlist ─────────────────────────────────────────────────────── */

/**
 * Fixed entries: the owner's own public handles. Everything else comes from the
 * corpus's artifacts, and ONLY from artifacts marked `public` — a manuscript
 * under review has no URL and must not acquire one here.
 */
const FIXED_URLS: readonly string[] = Object.freeze([
  'https://github.com/dcnguyen060899',
  'https://www.linkedin.com/in/duwe-ng/',
  'https://duyng-portfolio.com',
  'mailto:dnguyen44@seattleu.edu',
])

export const ALLOWED_URLS: ReadonlySet<string> = new Set<string>([
  ...FIXED_URLS,
  ...ARTIFACTS.filter((a) => a.access === 'public' && a.url).map((a) => a.url as string),
])

/** A URL-shaped token, in any of the three shapes a model tends to emit. */
export const URL_TOKEN = /\b(?:https?:\/\/|mailto:|www\.)[^\s<>()[\]"']+/gi

/** Trailing sentence punctuation is not part of a URL. */
export function normaliseUrl(token: string): string {
  return token.replace(/[.,;:!?)\]]+$/, '')
}

export function isAllowedUrl(token: string): boolean {
  const t = normaliseUrl(token)
  if (ALLOWED_URLS.has(t)) return true
  // Trailing-slash tolerance in both directions; nothing else.
  if (t.endsWith('/') && ALLOWED_URLS.has(t.slice(0, -1))) return true
  return ALLOWED_URLS.has(`${t}/`)
}

/* ── the numeric lexicon ───────────────────────────────────────────────────── */

/**
 * Matches the numeric-token shape the corpus's own post-build gate uses, so the
 * agent and the build gate agree on what counts as "a number on this site".
 */
export const NUMBER_TOKEN = /(?<![\w.])[+-]?\$?\d[\d,]*(?:\.\d+)?\s*(?:%|k\b|m\b|\+)?/gi

export function normNum(token: string): string {
  let t = String(token).replace(/[$,+%\s]/g, '').toLowerCase()
  if (/^\d+(\.\d+)?k$/.test(t)) t = String(parseFloat(t) * 1000)
  else if (/^\d+(\.\d+)?m$/.test(t)) t = String(parseFloat(t) * 1_000_000)
  if (/^\d+\.0+$/.test(t)) t = String(parseFloat(t))
  return t
}

/**
 * Every numeric token the agent is licensed to write.
 *
 * Sources, all of them trusted corpus text the agent may legitimately restate:
 * every claim's statement, short form and metric value; every gap's written
 * answer; every unresolved dispute's guidance; every role-profile fallback;
 * every artifact title; every role period. Plus the calendar years, which a
 * brief may reference without a metric behind them.
 *
 * This one check makes it structurally impossible for the agent to restate a
 * coefficient of determination as an accuracy, or to invent a percentage — the
 * exact defects the corpus retracted from the system this replaces.
 */
export const NUMERIC_LEXICON: ReadonlySet<string> = (() => {
  const out = new Set<string>()
  const add = (text: string | null | undefined) => {
    if (!text) return
    for (const m of text.matchAll(NUMBER_TOKEN)) out.add(normNum(m[0]))
  }
  for (const c of CLAIMS) {
    if (!c.asserted || !c.surfaces.includes('agent')) continue
    add(c.statement)
    add(c.short)
    if (c.value) {
      add(c.value.display)
      for (const n of c.value.numbers) out.add(normNum(n))
      add(c.value.baseline)
      add(c.value.n)
    }
    if (c.period) {
      add(c.period.start)
      add(c.period.end)
    }
  }
  for (const g of GAPS) add(g.honestAnswer)
  for (const d of DISPUTES) if (d.resolution === 'unresolved') add(d.agentGuidance)
  for (const p of ROLE_PROFILES) for (const r of p.requirements) add(r.fallback)
  for (const a of ARTIFACTS) add(a.title)
  for (const r of ROLES) {
    add(r.summary)
    add(r.period.start)
    add(r.period.end)
  }
  // Calendar years the brief may reference without a metric behind them.
  for (const y of ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028']) {
    out.add(normNum(y))
  }
  // Small ordinals used structurally ("one of the two roles", "the third").
  for (const n of ['1', '2', '3', '4', '5']) out.add(n)
  return out
})()

export const isLicensedNumber = (token: string): boolean => NUMERIC_LEXICON.has(normNum(token))

/* ── the retraction matchers ───────────────────────────────────────────────── */

/**
 * Compiled from `data/corpus/retractions.json` through the corpus's own
 * exported helper — NOT re-typed here. A retracted string re-typed into this
 * file to be banned would itself be a retracted string in a served source file,
 * which the build gate would (correctly) fail on.
 */
export const RETRACTION_MATCHERS: ReadonlyArray<{ id: string; label: string; re: RegExp }> =
  Object.freeze(forbiddenMatchers())

export function findRetracted(text: string): { id: string; matched: string } | null {
  for (const m of RETRACTION_MATCHERS) {
    const hit = m.re.exec(text)
    if (hit) return { id: m.id, matched: hit[0] }
  }
  return null
}

/* ── rendering, for the prompt ─────────────────────────────────────────────── */

const CACHE_SAFE = (s: string) => esc(s).replace(/\s+/g, ' ').trim()

/**
 * ONE LINE PER RECORD. This is system block 2 and it is cached for an hour, so
 * it must be a pure function of frozen data: no timestamps, no request id, no
 * unsorted iteration. `RECORDS` is sorted by id above for exactly that reason.
 * (spec-04 §3.1, §9.6)
 */
export const CORPUS_INDEX: string = (() => {
  const lines: string[] = []
  lines.push('<corpus_index>')
  lines.push(
    'Every evidence record on this site. These ids are the complete list of things you may cite.',
  )
  lines.push(
    'This is an index: it carries the one-line claim, not the numbers, the caveats or the detail.',
  )
  lines.push('Use fetch_evidence before citing anything.')
  for (const r of RECORDS) {
    const period = r.period
      ? `${r.period.start ?? '?'}${r.period.end === null ? ' to present' : r.period.end ? ` to ${r.period.end}` : ''}`
      : ''
    const bits = [
      `id="${r.id}"`,
      `kind="${r.kind}"`,
      `strength="${r.evidenceStrength}"`,
      `status="${r.status}"`,
      `tense="${r.tense}"`,
      period ? `period="${period}"` : '',
      `subject="${CACHE_SAFE(r.subjectLabel)}"`,
      r.caveats.length ? `caveats="${r.caveats.join(' ')}"` : '',
    ]
      .filter(Boolean)
      .join(' ')
    lines.push(`<record ${bits}>${CACHE_SAFE(r.short)}</record>`)
  }
  lines.push('</corpus_index>')
  return lines.join('\n')
})()

/**
 * The FULL record, as the tool result and the shortlist render it.
 *
 * The `<verbatim>` elements are the strings `quoted_claim` must copy. They are
 * given their own elements rather than left inside prose precisely so that
 * "copy this" is a structural instruction and not a stylistic request.
 */
export function renderFullRecord(record: EvidenceRecord, extra?: { score?: number; matched?: readonly string[] }): string {
  const lines: string[] = []
  const attrs = [
    `id="${record.id}"`,
    `kind="${record.kind}"`,
    `strength="${record.evidenceStrength}"`,
    `status="${record.status}"`,
    `tense="${record.tense}"`,
    `confidence="${record.confidence}"`,
    extra?.score !== undefined ? `score="${extra.score}"` : '',
    extra?.matched?.length ? `matched="${esc(extra.matched.join(', '))}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  lines.push(`<evidence ${attrs}>`)
  lines.push(`<verbatim>${esc(record.statement)}</verbatim>`)
  lines.push(`<verbatim>${esc(record.short)}</verbatim>`)
  if (record.value) {
    lines.push(
      `<metric unit="${esc(record.value.unit ?? '')}"><verbatim>${esc(record.value.display)}</verbatim></metric>`,
    )
    if (record.value.baseline) {
      lines.push(`<baseline>${esc(record.value.baseline)}</baseline>`)
    }
  }
  if (record.period) {
    const end = record.period.end === null ? 'present (ongoing)' : (record.period.end ?? 'unknown')
    lines.push(`<period start="${esc(record.period.start ?? 'unknown')}" end="${esc(end)}"/>`)
  }
  for (const caveatId of record.caveats) {
    const caveat = claimById(caveatId as ClaimId)
    lines.push(
      `<caveat load_bearing="true" id="${caveatId}"><verbatim>${esc(caveat.statement)}</verbatim></caveat>`,
    )
  }
  for (const link of record.links) {
    if (link.access === 'public' && link.url) {
      lines.push(`<artifact url="${esc(link.url)}" label="${esc(link.title)}"/>`)
    } else {
      lines.push(`<artifact url="" label="${esc(link.title)}" access="${esc(link.access)}" note="describe it; there is no link to give"/>`)
    }
  }
  lines.push(`<verification>${esc(record.verificationPath)}</verification>`)
  lines.push('</evidence>')
  return lines.join('\n')
}

/** The written-in-advance sentence for a thing Duy has not done. */
export function renderGap(gapId: string): string | null {
  const gap = GAPS.find((g) => g.id === gapId)
  if (!gap) return null
  return `<gap id="${gap.id}" severity="${gap.severity}"><verbatim>${esc(gap.honestAnswer)}</verbatim></gap>`
}

/** The public artifact url for a record, or "" when it has none. */
export function artifactUrlFor(record: EvidenceRecord): string {
  const link = record.links.find((l) => l.access === 'public' && l.url)
  return link?.url ?? ''
}

/**
 * How to NAME a citation to a reader.
 *
 * A public artifact gives its own title, and that is the best answer: it is what
 * the link says. Without one, the record's own short form is used rather than
 * the subject's name — otherwise four citations drawn from one role all render
 * as the same words, and a reader cannot tell which record said what.
 */
export function artifactLabelFor(record: EvidenceRecord): string {
  const link = record.links.find((l) => l.access === 'public' && l.url)
  if (link) return link.title
  const named = record.links[0]
  if (named) return named.title
  return record.short.length > 4 ? record.short : record.subjectLabel
}
