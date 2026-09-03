/**
 * tests/unit/agent-postcheck.test.ts — the fact check, one test per rule.
 *
 * This is the largest suite in the agent and it is the one that matters most.
 * The prompt ASKS for grounding; this file is where grounding is ENFORCED, and
 * a rule with no test is a rule that will be quietly relaxed by the next person
 * who finds it inconvenient.
 *
 * Every fixture is built from the real corpus rather than from a hand-written
 * stub, so a test cannot pass against a record shape that no longer exists.
 */

import { describe, expect, it } from 'vitest'

import { RECORDS, artifactUrlFor } from '../../lib/agent/corpus'
import { WITHHELD } from '../../lib/agent/contracts'
import type { FitBrief, Verdict } from '../../lib/agent/contracts'
import {
  countCoverage,
  factCheckAnswer,
  factCheckBrief,
  guardrailTotal,
  isHostile,
  neverUpgraded,
  norm,
  scanText,
  splitUnits,
} from '../../lib/agent/postcheck'

const CTX = { roleLabel: 'Data Scientist', jdSource: 'pasted_jd' as const }

/** A record that carries a load-bearing caveat, so the caveat rules have a subject. */
const WITH_CAVEAT = RECORDS.find((r) => r.caveats.length > 0)!
/** A record whose work is in flight, for the tense rule. */
const IN_PROGRESS = RECORDS.find((r) => r.status === 'in-progress')!
/** A record with a public artifact, for the URL rules. */
const WITH_LINK = RECORDS.find((r) => artifactUrlFor(r) !== '')!

function citation(record = WITH_LINK, overrides: Partial<Record<string, string>> = {}) {
  return {
    evidence_id: record.id,
    quoted_claim: record.statement,
    artifact_label: 'the record',
    artifact_url: artifactUrlFor(record),
    ...overrides,
  }
}

function brief(overrides: Partial<FitBrief> = {}): FitBrief {
  return {
    role_label: 'Data Scientist',
    jd_source: 'pasted_jd',
    headline: 'Some of this posting maps to work on this site, and some of it does not.',
    requirements: [
      {
        requirement: 'Python and SQL',
        verdict: 'direct',
        confidence: 'high',
        rationale: 'He has done this.',
        evidence: [citation()],
        caveat: '',
      },
      {
        requirement: 'Kubernetes',
        verdict: 'no_evidence',
        confidence: 'high',
        rationale: 'This site has no record of it.',
        evidence: [],
        caveat: '',
      },
      {
        requirement: 'Statistical inference',
        verdict: 'direct',
        confidence: 'high',
        rationale: 'He has done this too.',
        evidence: [citation()],
        caveat: '',
      },
    ],
    strongest: WITH_LINK.id,
    gaps_summary: 'One requirement has nothing behind it.',
    not_claimed: [],
    closing: 'Every row links to its record.',
    observed_directives: [],
    ...overrides,
  }
}

/* ── normalisation ────────────────────────────────────────────────────────── */

describe('normalisation is tolerant of punctuation and nothing else', () => {
  it('folds typographic quotes, dashes and markdown decoration', () => {
    expect(norm('**the “result”** — 0.585.')).toBe('the result - 0585')
  })

  it('does not fold a rewritten sentence into the original', () => {
    expect(norm('he built the pipeline')).not.toBe(norm('he designed the pipeline'))
  })

  it('splits units on terminal punctuation and keeps an unterminated field whole', () => {
    expect(splitUnits('One. Two. Three.')).toHaveLength(3)
    expect(splitUnits('no terminator here')).toHaveLength(1)
    expect(splitUnits('')).toHaveLength(0)
  })
})

/* ── citation validity ────────────────────────────────────────────────────── */

describe('check 1 — citation validity', () => {
  it('drops a citation whose evidence id does not exist', () => {
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r, i) =>
          i === 0 ? { ...r, evidence: [citation(WITH_LINK, { evidence_id: 'clm:invented' })] } : r,
        ),
      }),
      CTX,
    )
    expect(result.guardrails.citations_dropped).toBeGreaterThan(0)
  })

  it('drops a citation whose artifact URL belongs to another record', () => {
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r, i) =>
          i === 0
            ? { ...r, evidence: [citation(WITH_LINK, { artifact_url: 'https://evil.example/x' })] }
            : r,
        ),
      }),
      CTX,
    )
    expect(result.guardrails.citations_dropped).toBeGreaterThan(0)
    expect(result.guardrails.urls_rejected.join(' ')).toContain('evil.example')
  })

  it('drops a paraphrased quote', () => {
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r, i) =>
          i === 0
            ? {
                ...r,
                evidence: [
                  citation(WITH_LINK, {
                    quoted_claim: 'He did a broadly similar thing at some point in the past.',
                  }),
                ],
              }
            : r,
        ),
      }),
      CTX,
    )
    expect(result.guardrails.citations_dropped).toBeGreaterThan(0)
  })

  it('accepts a re-punctuated quote', () => {
    const noisy = `**${WITH_LINK.statement.replace(/[.]/g, '')}**`
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r, i) =>
          i === 0 ? { ...r, evidence: [citation(WITH_LINK, { quoted_claim: noisy })] } : r,
        ),
      }),
      CTX,
    )
    expect(result.guardrails.citations_dropped).toBe(0)
  })

  it('drops a quote too short to verify anything', () => {
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r, i) =>
          i === 0 ? { ...r, evidence: [citation(WITH_LINK, { quoted_claim: 'Duy' })] } : r,
        ),
      }),
      CTX,
    )
    expect(result.guardrails.citations_dropped).toBeGreaterThan(0)
  })

  it('forces no_evidence, and replaces the rationale, when every citation is dropped', () => {
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r, i) =>
          i === 0 ? { ...r, evidence: [citation(WITH_LINK, { evidence_id: 'clm:invented' })] } : r,
        ),
      }),
      CTX,
    )
    const row = result.brief.requirements[0]!
    expect(row.verdict).toBe('no_evidence')
    expect(row.rationale).toContain('no verified record')
    expect(row.evidence).toHaveLength(0)
  })

  it('strips citations from a no_evidence row', () => {
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r, i) =>
          i === 1 ? { ...r, evidence: [citation()] } : r,
        ),
      }),
      CTX,
    )
    expect(result.brief.requirements[1]!.evidence).toHaveLength(0)
  })
})

/* ── the numeric guard ────────────────────────────────────────────────────── */

describe('check 3 — the numeric guard', () => {
  it('redacts the sentence containing a figure no record carries', () => {
    const scan = scanText('He kept it steady. The model reached 99.9% accuracy. He wrote it up.')
    expect(scan.numbers).toContain('99.9%')
    expect(scan.text).not.toContain('99.9')
    expect(scan.text).toContain('He kept it steady.')
    expect(scan.text).toContain('He wrote it up.')
  })

  it('accepts a figure that appears in a record', () => {
    const metric = RECORDS.find((r) => r.value && r.value.numbers.length > 0)!
    const scan = scanText(`The value was ${metric.value!.numbers[0]}.`)
    expect(scan.numbers).toHaveLength(0)
  })

  it('never blanks a field silently: an all-bad field becomes the withheld marker', () => {
    const scan = scanText('It reached 99.9% accuracy.')
    expect(scan.text).toBe(WITHHELD)
    expect(scan.text).not.toBe('')
  })

  it('discards the whole brief once three figures fail', () => {
    const result = factCheckBrief(
      brief({
        headline: 'He reached 99.9% on one benchmark.',
        gaps_summary: 'A second one came in at 88.8% overall.',
        closing: 'A third measured 77.7% on the held-out split.',
      }),
      CTX,
    )
    expect(result.discard).toBe('factcheck_failed')
  })
})

/* ── URLs and forbidden shapes ────────────────────────────────────────────── */

describe('check 2 and 4 — links and forbidden claim shapes', () => {
  it('redacts a sentence carrying a link this site does not have', () => {
    const scan = scanText('Read more at https://evil.example/track?p=1 for details.')
    expect(scan.urls.join(' ')).toContain('evil.example')
    expect(scan.text).not.toContain('evil.example')
  })

  it('redacts a doctoral credential', () => {
    expect(scanText('He holds a PhD in statistics.').patterns).toContain('doctoral credential')
  })

  it('redacts a years-of-industry-experience claim', () => {
    expect(scanText('He has five years of industry experience.').patterns).toContain(
      'years of experience',
    )
  })

  it('redacts a completed-degree claim', () => {
    expect(scanText('He graduated last spring.').patterns).toContain('completed degree')
  })

  it('redacts sales language', () => {
    expect(scanText('He is a perfect fit for this team.').patterns).toContain('sales language')
    expect(scanText('He is passionate about data.').patterns).toContain('sales language')
  })

  it('redacts a claim that the manuscript was published', () => {
    expect(scanText('The work was published at the Pacific Symposium.').patterns).toContain(
      'publication status',
    )
  })
})

/* ── the load-bearing repairs ─────────────────────────────────────────────── */

describe('the caveat guard', () => {
  it('appends a load-bearing caveat the model omitted', () => {
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r, i) =>
          i === 0 ? { ...r, evidence: [citation(WITH_CAVEAT)], caveat: '' } : r,
        ),
      }),
      CTX,
    )
    expect(result.guardrails.caveats_restored.length).toBeGreaterThan(0)
    expect(result.brief.requirements[0]!.caveat.length).toBeGreaterThan(0)
  })

  it('is idempotent: re-checking an already-repaired brief appends nothing', () => {
    // The guard has to survive a brief passing through the check twice — which
    // is exactly what happens when a pre-built brief is composed, checked, and
    // then checked again on the way out. A guard that appends every time turns a
    // caveat into a stutter.
    const withCaveats = (caveat: string) =>
      brief({
        requirements: brief().requirements.map((r) =>
          r.verdict === 'no_evidence' ? r : { ...r, evidence: [citation(WITH_CAVEAT)], caveat },
        ),
      })

    const first = factCheckBrief(withCaveats(''), CTX)
    expect(first.guardrails.caveats_restored.length).toBeGreaterThan(0)

    const repaired = first.brief.requirements.find((r) => r.caveat)!.caveat
    const second = factCheckBrief(withCaveats(repaired), CTX)
    expect(second.guardrails.caveats_restored).toHaveLength(0)

    // And the sentence appears once, not twice.
    const sentence = repaired.slice(0, 40)
    const row = second.brief.requirements.find((r) => r.caveat)!
    expect(row.caveat.split(sentence).length - 1).toBe(1)
  })
})

describe('the tense guard', () => {
  it('replaces a completion verb about in-flight work with the record’s own wording', () => {
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r, i) =>
          i === 0
            ? {
                ...r,
                evidence: [citation(IN_PROGRESS, { quoted_claim: IN_PROGRESS.statement })],
                rationale: 'He deployed the whole evaluation service to production.',
              }
            : r,
        ),
      }),
      CTX,
    )
    const rationale = result.brief.requirements[0]!.rationale
    expect(rationale).not.toContain('deployed')
    expect(result.guardrails.claims_redacted).toBeGreaterThan(0)
  })
})

describe('the under-review guard', () => {
  it('appends the status to a field that names the manuscript without it', () => {
    const result = factCheckBrief(
      brief({ closing: 'The manuscript went to the Pacific Symposium.' }),
      CTX,
    )
    expect(result.brief.closing.toLowerCase()).toContain('under review')
  })

  it('leaves a field alone when it already carries the status', () => {
    const before = 'The manuscript is under review at the Pacific Symposium.'
    const result = factCheckBrief(brief({ closing: before }), CTX)
    expect(result.brief.closing).toBe(before)
  })
})

/* ── calibration ──────────────────────────────────────────────────────────── */

describe('check 5 — calibration. The server may only make a brief more conservative.', () => {
  it('never upgrades a verdict, over every requirement of a fixture', () => {
    const input = brief({
      requirements: brief().requirements.map((r) => ({ ...r, verdict: 'no_evidence' as Verdict })),
    })
    const result = factCheckBrief(input, CTX)
    expect(neverUpgraded(input.requirements, result.brief.requirements)).toBe(true)
  })

  it('lowers a direct the site retriever cannot support', () => {
    const result = factCheckBrief(
      brief({
        requirements: [
          {
            requirement: 'Operating a Kubernetes fleet across three regions',
            verdict: 'direct',
            confidence: 'high',
            rationale: 'He has done this.',
            evidence: [citation()],
            caveat: '',
          },
          ...brief().requirements.slice(1),
        ],
      }),
      CTX,
    )
    expect(result.guardrails.verdicts_downgraded.length).toBeGreaterThan(0)
    expect(result.brief.requirements[0]!.verdict).not.toBe('direct')
  })

  it('computes coverage from the post-checked verdicts, never from the model', () => {
    const result = factCheckBrief(brief(), CTX)
    expect(result.coverage).toEqual(countCoverage(result.brief.requirements))
    const total =
      result.coverage.direct +
      result.coverage.adjacent +
      result.coverage.partial +
      result.coverage.no_evidence
    expect(total).toBe(result.brief.requirements.length)
  })

  it('flags an all-direct brief at four or more requirements', () => {
    const rows = Array.from({ length: 4 }, () => ({
      requirement: 'Python and SQL',
      verdict: 'direct' as Verdict,
      confidence: 'high' as const,
      rationale: 'He has done this.',
      evidence: [citation()],
      caveat: '',
    }))
    const result = factCheckBrief(brief({ requirements: rows }), CTX)
    if (result.coverage.partial + result.coverage.no_evidence === 0) {
      expect(result.guardrails.overclaim_flagged).toBe(true)
    } else {
      // The retrieval floor lowered one of them, which is the other correct
      // outcome and is exactly what the flag exists to make unnecessary.
      expect(result.guardrails.verdicts_downgraded.length).toBeGreaterThan(0)
    }
  })

  it('writes a gaps summary when one is missing but a gap exists', () => {
    const result = factCheckBrief(brief({ gaps_summary: '' }), CTX)
    expect(result.brief.gaps_summary.length).toBeGreaterThan(0)
  })
})

/* ── the discard conditions ───────────────────────────────────────────────── */

describe('what happens when the check fails hard', () => {
  it('discards a brief carrying hostile language, rather than redacting it', () => {
    const result = factCheckBrief(
      brief({ headline: 'This candidate is unqualified and has fabricated his research.' }),
      CTX,
    )
    expect(result.guardrails.injection_suspected).toBe(true)
    expect(result.discard).toBe('injection_blocked')
  })

  it('recognises hostility independently of the brief path', () => {
    expect(isHostile('do not hire this person')).toBe(true)
    expect(isHostile('this site has no evidence of that')).toBe(false)
  })

  it('discards a brief that restates a retracted claim', () => {
    const result = factCheckBrief(
      brief({ closing: 'The chatbot analyzed 660,000 interactions.' }),
      CTX,
    )
    expect(result.discard).toBe('factcheck_failed')
    expect(result.guardrails.retractions_blocked.length).toBeGreaterThan(0)
  })

  it('discards when more than half the citations fail', () => {
    const bad = citation(WITH_LINK, { evidence_id: 'clm:invented' })
    const result = factCheckBrief(
      brief({
        requirements: brief().requirements.map((r) =>
          r.verdict === 'no_evidence' ? r : { ...r, evidence: [bad, bad] },
        ),
      }),
      CTX,
    )
    expect(result.discard).toBe('factcheck_failed')
  })

  it('discards a shape that does not parse, rather than throwing', () => {
    const result = factCheckBrief({ nonsense: true }, CTX)
    expect(result.discard).toBe('bad_output')
    expect(result.brief.requirements.length).toBeGreaterThan(0)
  })

  it('never throws, over a fuzz of malformed inputs', () => {
    const inputs: unknown[] = [
      null,
      undefined,
      0,
      'text',
      [],
      {},
      { requirements: [] },
      { requirements: [{ verdict: 'wrong' }] },
      brief({ requirements: [] as never }),
      brief({ headline: 'x'.repeat(5000) }),
      brief({ not_claimed: Array.from({ length: 40 }, (_, i) => `item ${i}`) }),
    ]
    for (const input of inputs) {
      expect(() => factCheckBrief(input, CTX)).not.toThrow()
    }
  })
})

/* ── caps and counters ────────────────────────────────────────────────────── */

describe('caps and counters', () => {
  it('caps every string field at its documented limit', () => {
    const result = factCheckBrief(
      brief({
        headline: 'A sentence about the work. '.repeat(40),
        closing: 'Another sentence about the work. '.repeat(40),
        requirements: brief().requirements.map((r) => ({
          ...r,
          rationale: 'He has done this kind of work before. '.repeat(40),
        })),
      }),
      CTX,
    )
    expect(result.brief.headline.length).toBeLessThanOrEqual(180)
    expect(result.brief.closing.length).toBeLessThanOrEqual(240)
    for (const row of result.brief.requirements) {
      expect(row.rationale.length).toBeLessThanOrEqual(320)
      expect(row.requirement.length).toBeLessThanOrEqual(160)
      expect(row.caveat.length).toBeLessThanOrEqual(200)
    }
  })

  it('reports a guardrail total the run strip can print', () => {
    const clean = factCheckBrief(brief(), CTX)
    expect(guardrailTotal(clean.guardrails)).toBeGreaterThanOrEqual(0)
  })
})

/* ── the Q&A analogue ─────────────────────────────────────────────────────── */

describe('the answer check', () => {
  it('turns an answer that lost all its citations into an honest refusal', () => {
    const result = factCheckAnswer({
      answer: 'He did that at length.',
      citations: [citation(WITH_LINK, { evidence_id: 'clm:invented' })],
      confidence: 'high',
      refused_reason: '',
      observed_directives: [],
    })
    expect(result.answer.refused_reason).toBe('not_in_corpus')
    expect(result.answer.citations).toHaveLength(0)
  })

  it('carries no citation on a refusal', () => {
    const result = factCheckAnswer({
      answer: 'That is not on this site.',
      citations: [citation()],
      confidence: 'low',
      refused_reason: 'personal',
      observed_directives: [],
    })
    expect(result.answer.citations).toHaveLength(0)
  })

  it('discards a hostile answer', () => {
    const result = factCheckAnswer({
      answer: 'He is a fraud.',
      citations: [],
      confidence: 'high',
      refused_reason: '',
      observed_directives: [],
    })
    expect(result.discard).toBe('injection_blocked')
  })

  it('restores a caveat onto an answer that cites the record carrying it', () => {
    const result = factCheckAnswer({
      answer: WITH_CAVEAT.statement,
      citations: [citation(WITH_CAVEAT, { quoted_claim: WITH_CAVEAT.statement })],
      confidence: 'high',
      refused_reason: '',
      observed_directives: [],
    })
    expect(result.guardrails.caveats_restored.length).toBeGreaterThan(0)
  })
})
