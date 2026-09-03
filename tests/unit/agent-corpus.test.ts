/**
 * tests/unit/agent-corpus.test.ts
 *
 * The four derived structures the fact check rests on. If any of these is
 * wrong, every downstream guarantee is decoration: the id enum is what stops a
 * fabricated project name, the URL allowlist is what stops a fabricated link,
 * the numeric lexicon is what stops a fabricated figure, and the retraction
 * matchers are what stop a claim the site has withdrawn from coming back out of
 * a model instead of out of a file.
 *
 * Everything here runs with no key, no network and no filesystem, because the
 * corpus is a static import and every derivation is pure.
 */

import { describe, expect, it } from 'vitest'

import { CLAIMS, GAPS } from '../../lib/corpus/index'
import {
  ALLOWED_URLS,
  CORPUS_INDEX,
  CORPUS_SIZE,
  CORPUS_VERSION,
  EVIDENCE_ID_ENUM,
  NUMERIC_LEXICON,
  RECORDS,
  findRetracted,
  isAllowedUrl,
  isLicensedNumber,
  normNum,
  recordById,
  renderFullRecord,
} from '../../lib/agent/corpus'

describe('the agent sees exactly what it is licensed to see', () => {
  it('exposes only asserted, undisputed, agent-licensed claims', () => {
    expect(RECORDS.length).toBeGreaterThan(80)
    for (const record of RECORDS) {
      const claim = CLAIMS.find((c) => c.id === record.id)
      expect(claim).toBeDefined()
      expect(claim!.asserted).toBe(true)
      expect(claim!.status).not.toBe('disputed')
      expect(claim!.surfaces).toContain('agent')
    }
  })

  it('uses the corpus id namespace and no second one', () => {
    for (const id of EVIDENCE_ID_ENUM) expect(id).toMatch(/^clm:[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('sorts the enum, so the cached prompt prefix is byte-stable', () => {
    const sorted = [...EVIDENCE_ID_ENUM].sort((a, b) => a.localeCompare(b))
    expect(EVIDENCE_ID_ENUM).toEqual(sorted)
  })

  it('reports a corpus size and version the run strip can print', () => {
    expect(CORPUS_SIZE).toBe(RECORDS.length)
    expect(CORPUS_VERSION).toMatch(/^[0-9a-f]{12}$/)
  })
})

describe('the numeric lexicon', () => {
  it('licenses every digit of every metric the agent may cite', () => {
    for (const record of RECORDS) {
      if (!record.value) continue
      for (const n of record.value.numbers) {
        expect(isLicensedNumber(n), `${record.id} number ${n}`).toBe(true)
      }
    }
  })

  it('licenses every number inside a written gap answer', () => {
    // The agent is told to use these sentences verbatim. If a figure inside one
    // were not licensed, the fact check would redact the sentence a human wrote
    // on purpose — the worst possible false positive.
    for (const gap of GAPS) {
      for (const m of gap.honestAnswer.matchAll(/(?<![\w.])[+-]?\$?\d[\d,]*(?:\.\d+)?\s*(?:%|k\b|m\b|\+)?/gi)) {
        expect(isLicensedNumber(m[0]), `${gap.id} number ${m[0]}`).toBe(true)
      }
    }
  })

  it('refuses a figure that appears nowhere in the corpus', () => {
    expect(isLicensedNumber('99.9%')).toBe(false)
    expect(isLicensedNumber('47231')).toBe(false)
  })

  it('normalises the shapes a model reaches for', () => {
    expect(normNum('660,000')).toBe(normNum('660000'))
    expect(normNum('1.5k')).toBe('1500')
    expect(normNum('$30.4M')).toBe('30400000')
    expect(normNum('+20.7%')).toBe('20.7')
  })
})

describe('the URL allowlist', () => {
  it('contains only public artifact URLs and the owner’s own handles', () => {
    for (const url of ALLOWED_URLS) {
      expect(url.startsWith('http') || url.startsWith('mailto:')).toBe(true)
    }
  })

  it('refuses a URL the corpus does not carry', () => {
    expect(isAllowedUrl('https://evil.example/?p=1')).toBe(false)
    expect(isAllowedUrl('http://duyng-portfolio.com.attacker.test')).toBe(false)
  })

  it('tolerates a trailing slash in either direction and nothing else', () => {
    const first = [...ALLOWED_URLS].find((u) => u.startsWith('https://'))!
    expect(isAllowedUrl(first)).toBe(true)
    expect(isAllowedUrl(`${first}/`)).toBe(true)
    expect(isAllowedUrl(`${first}x`)).toBe(false)
  })

  it('never contains a URL for a non-public artifact', () => {
    // A manuscript under review has no link to give. If one appeared here, the
    // agent could emit a link to something that does not exist publicly.
    expect([...ALLOWED_URLS].some((u) => u.includes('under-review'))).toBe(false)
  })
})

describe('the retraction matchers catch what a model could generate', () => {
  it('catches a claim the site has withdrawn', () => {
    expect(findRetracted('He analyzed 660,000 interactions on the graph.')).not.toBeNull()
    expect(findRetracted('the chatbot ran at 90% accuracy')).not.toBeNull()
    expect(findRetracted('a normalized MySQL database of the lab recordings')).not.toBeNull()
  })

  it('does not fire on ordinary text', () => {
    expect(findRetracted('He built an ETL pipeline in Python over five formats.')).toBeNull()
  })
})

describe('the rendered prompt blocks', () => {
  it('names every record in the index exactly once', () => {
    for (const record of RECORDS) {
      const occurrences = CORPUS_INDEX.split(`id="${record.id}"`).length - 1
      expect(occurrences, record.id).toBe(1)
    }
  })

  it('carries no timestamp or request-shaped value in the cached index', () => {
    // A volatile byte here silently destroys the prompt cache for every run.
    expect(CORPUS_INDEX).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
    expect(CORPUS_INDEX).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('renders identical text on repeated calls', () => {
    const record = RECORDS[0]!
    expect(renderFullRecord(record)).toBe(renderFullRecord(record))
  })

  it('marks a non-public artifact as unlinkable rather than inventing a link', () => {
    const withPrivate = RECORDS.find((r) =>
      r.links.some((l) => l.access !== 'public' || !l.url),
    )
    if (!withPrivate) return
    const rendered = renderFullRecord(withPrivate)
    expect(rendered).toContain('there is no link to give')
  })

  it('puts every mandatory caveat inside the record that drags it along', () => {
    const withCaveat = RECORDS.find((r) => r.caveats.length > 0)!
    const rendered = renderFullRecord(withCaveat)
    for (const caveatId of withCaveat.caveats) {
      expect(rendered).toContain(`id="${caveatId}"`)
    }
  })
})

describe('lookups', () => {
  it('returns undefined for an unknown id rather than throwing', () => {
    // The tool path depends on this: an unknown id must become a correctable
    // is_error result, not a crashed run.
    expect(recordById('clm:does-not-exist')).toBeUndefined()
  })

  it('resolves every id in the tool enum', () => {
    for (const id of EVIDENCE_ID_ENUM) expect(recordById(id)).toBeDefined()
  })

  it('never exposes a lexicon entry with no source', () => {
    expect(NUMERIC_LEXICON.size).toBeGreaterThan(40)
  })
})
