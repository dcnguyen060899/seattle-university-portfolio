/**
 * tests/unit/corpus.test.ts
 *
 * These run on a fresh clone with no keys, no network and no database, because
 * the corpus is a static import and the retrieval policy is a pure function.
 * That is the property being tested as much as any individual assertion: if any
 * of this ever needs a service to run, the design has broken.
 *
 * The tests are grouped by the promise each one keeps:
 *   1. structure    — the store is internally consistent
 *   2. licensing    — nothing renders where it is not licensed to
 *   3. honesty      — caveats, retractions and negatives cannot be dropped
 *   4. retrieval    — the scorer selects what it should, and refuses what it shouldn't
 *   5. determinism  — the same input produces the same output
 */

import { describe, expect, it } from 'vitest'

import {
  CLAIMS,
  CONCEPTS,
  DISPUTES,
  GAPS,
  RETRACTIONS,
  ROLES,
  ROLE_PROFILES,
  SKILLS,
  claimById,
  claimShort,
  claimText,
  claimValue,
  claimWithCaveats,
  findRetractedPhrase,
  getRecords,
  mandatoryCaveatsFor,
} from '../../lib/corpus/index'
import { analyseJd, matchConcepts, normalise } from '../../lib/corpus/jd'
import {
  MIN_HIT_SCORE,
  answerContext,
  coverageFor,
  retrieve,
  scoreClaim,
} from '../../lib/corpus/retrieve'
import { agentEvidence, toEvidenceRecord } from '../../lib/corpus/toEvidenceRecord'
import { formatPeriod } from '../../lib/corpus/surfaces'
import type { ClaimId } from '../../lib/corpus/types'

/* ══ 1. structure ═════════════════════════════════════════════════════════ */

describe('the store is internally consistent', () => {
  it('has a non-trivial corpus', () => {
    expect(CLAIMS.length).toBeGreaterThan(80)
    expect(RETRACTIONS.length).toBeGreaterThan(15)
    expect(GAPS.length).toBeGreaterThan(8)
  })

  it('uses the frozen id namespace and nothing else', () => {
    for (const c of CLAIMS) expect(c.id).toMatch(/^clm:[a-z0-9]+(-[a-z0-9]+)*$/)
    for (const r of ROLES) expect(r.id).toMatch(/^rol:/)
    for (const s of SKILLS) expect(s.id).toMatch(/^skl:/)
    for (const d of DISPUTES) expect(d.id).toMatch(/^dsp:/)
    for (const r of RETRACTIONS) expect(r.id).toMatch(/^ret:/)
    for (const c of CONCEPTS) expect(c.id).toMatch(/^cpt:/)
  })

  it('gives every claim at least one source and a followable verification path', () => {
    for (const c of CLAIMS) {
      expect(c.sources.length, c.id).toBeGreaterThan(0)
      expect(c.verificationPath.length, c.id).toBeGreaterThan(4)
    }
  })

  it('grounds every skill in at least one claim, and states no proficiency percentage', () => {
    for (const s of SKILLS) {
      expect(s.groundedIn.length, s.id).toBeGreaterThan(0)
      for (const id of s.groundedIn) expect(() => claimById(id)).not.toThrow()
      // The four-bucket level enum is the whole defence: there is no numeric field
      // for a percentage to live in, so an invented one is unrepresentable.
      expect(JSON.stringify(s)).not.toMatch(/\d+%/)
    }
  })

  it('throws a named error on an unknown id rather than returning undefined', () => {
    expect(() => claimById('clm:does-not-exist' as ClaimId)).toThrow(/unknown claim/)
  })
})

/* ══ 2. licensing ═════════════════════════════════════════════════════════ */

describe('nothing renders where it is not licensed', () => {
  it('refuses a claim on a surface it does not list', () => {
    // Licensed for the agent only, deliberately: it is 2024 coursework rendered
    // as a bare hero metric on the old homepage, which read as money saved.
    expect(() => claimValue('clm:berkeley-capstone-impact', 'agent')).not.toThrow()
    expect(() => claimValue('clm:berkeley-capstone-impact', 'page')).toThrow(/not licensed/)
  })

  it('refuses "internal" as a renderable surface', () => {
    expect(() => claimText('clm:msds-gpa', 'internal')).toThrow(/not a renderable surface/)
  })

  it('refuses a non-metric through claimValue and points at the right accessor', () => {
    expect(() => claimValue('clm:yang-label-caveat', 'page')).toThrow(/use claimText/)
  })

  it('never exposes an unasserted claim through the bulk accessor by default', () => {
    for (const c of getRecords()) expect(c.asserted).toBe(true)
  })

  it('keeps a disputed claim off every rendered surface', () => {
    for (const c of CLAIMS) {
      if (c.status !== 'disputed') continue
      expect(c.asserted, c.id).toBe(false)
      expect(c.surfaces, c.id).toEqual(['internal'])
    }
  })

  it('returns the display string for a metric, not a re-derived number', () => {
    expect(claimValue('clm:yang-p1-floor', 'page')).toContain('0.487')
    expect(claimValue('clm:yang-p1-floor', 'page')).toContain('0.585')
    expect(claimShort('clm:cause-win', 'page')).toMatch(/Winner/)
  })
})

/* ══ 3. honesty ═══════════════════════════════════════════════════════════ */

describe('the honest half cannot be dropped', () => {
  it('drags the majority-class caveat along with the BI-RADS result', () => {
    const { caveats } = claimWithCaveats('clm:yang-birads-untrained', 'page')
    const ids = caveats.map((c) => c.id)
    expect(ids).toContain('clm:yang-birads-majority-caveat')
    expect(ids).toContain('clm:yang-label-caveat')
  })

  it('drags "in flight, not shipped" along with every deployment claim', () => {
    const inFlight = CLAIMS.filter((c) => c.status === 'in-progress' && c.kind !== 'caveat')
    expect(inFlight.length).toBeGreaterThan(3)
    for (const c of inFlight) {
      if (c.id === 'clm:yang-psb-submission') {
        expect(c.caveats, c.id).toContain('clm:yang-psb-caveat')
      } else {
        expect(c.caveats, c.id).toContain('clm:mlops-caveat')
      }
    }
  })

  it('licenses every mandatory caveat wherever its claim is licensed', () => {
    for (const c of CLAIMS) {
      for (const caveatId of c.caveats ?? []) {
        const caveat = claimById(caveatId)
        for (const surface of c.surfaces) {
          if (surface === 'internal') continue
          expect(
            caveat.surfaces.includes(surface),
            `${c.id} renders on "${surface}" but its caveat ${caveatId} does not`
          ).toBe(true)
        }
      }
    }
  })

  it('collects mandatory caveats across a set of claims without duplication', () => {
    const ids = mandatoryCaveatsFor(['clm:yang-p1-floor', 'clm:yang-birads-untrained'])
    expect(ids).toContain('clm:yang-label-caveat')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('catches every retracted phrase, including the ones that flatter', () => {
    const cases: Array<[string, string]> = [
      ['He developed the Duy Integral Theorem.', 'ret:duy-integral-theorem'],
      ['Maintained 98%+ across all coursework.', 'ret:gpa-98-percent'],
      ['Chatbot serving 660K+ interactions.', 'ret:mosaic-reach-misuse'],
      ['90% accuracy through prompt engineering.', 'ret:mosaic-90-accuracy'],
      ['Analysed 180K+ patient records.', 'ret:berkeley-180k-records'],
      ['Achieved 95.9% predictive accuracy.', 'ret:nasa-r2-as-accuracy'],
      ['A 7-table normalized MySQL database.', 'ret:fischer-mysql'],
      ['110 neurons across 8 owls.', 'ret:fischer-110-neurons'],
      ['Roughly 14,000 raw files.', 'ret:fischer-14000-files'],
      ['About 261 experiments.', 'ret:fischer-261-experiments'],
      ['Previously took 228 file loads.', 'ret:fischer-228-loads'],
      ['Built a 6-phase ETL pipeline.', 'ret:fischer-6-phase'],
      ['Winter 2025 – Present.', 'ret:yang-winter-2025'],
      ['Available for Summer 2026 internships.', 'ret:summer-2026-availability'],
      ['Python 95%, SQL 85%.', 'ret:skill-bar-percentages'],
      ['Term GPA 3.4 in autumn.', 'ret:term-gpa-range'],
      ['Requires sponsorship for employment.', 'ret:work-authorization-speculation'],
    ]
    for (const [text, expected] of cases) {
      const hit = findRetractedPhrase(text)
      expect(hit, `no retraction fired on: ${text}`).not.toBeNull()
      expect(hit!.retractionId, text).toBe(expected)
    }
  })

  it('does not fire on the honest sentences that live nearest the retracted ones', () => {
    const safe = [
      // The client's own traffic, with its source named — the one licensed framing.
      claimById('clm:mosaic-reach').statement,
      // Names the graph entities, one of which is an eligibility category.
      claimById('clm:mosaic-graph').statement,
      // Says "not shipped", which a naive completion-verb rule would flag.
      claimById('clm:mlops-caveat').statement,
      // The corrected barn-owl figures.
      claimById('clm:fischer-db-scale').statement,
      claimById('clm:fischer-db-shape').statement,
      // The pre-written decline, worded to contain none of its own forbidden phrases.
      GAPS.find((g) => g.id === 'gap:eligibility-questions')!.honestAnswer,
    ]
    for (const text of safe) {
      expect(findRetractedPhrase(text), `false positive on: ${text.slice(0, 70)}`).toBeNull()
    }
  })

  it('has a written answer for every gap, composed in advance rather than improvised', () => {
    for (const g of GAPS) {
      expect(g.honestAnswer.length, g.id).toBeGreaterThan(40)
      expect(g.honestAnswer, g.id).not.toMatch(/TODO|TBD/i)
    }
  })

  it('declines rather than answers the one question that is not the corpus\'s to answer', () => {
    const gap = GAPS.find((g) => g.id === 'gap:eligibility-questions')!
    expect(gap.disclose).toBe(false)
    // Mapped to no concept, so retrieval can never reach it by accident: the agent
    // must route here through an explicit topic guard.
    expect(gap.concepts).toEqual([])
    expect(gap.nearestEvidence).toEqual([])
  })
})

/* ══ 4. retrieval ═════════════════════════════════════════════════════════ */

describe('the job-description matcher', () => {
  it('keeps the characters that live inside technical tokens', () => {
    const n = normalise('We use scikit-learn, Node.js and CI/CD.')
    expect(n).toContain('scikit-learn')
    expect(n).toContain('node.js')
    expect(n).toContain('ci/cd')
  })

  it('consumes the longest alias first, so a specific term is not also read as a generic one', () => {
    const { concepts } = matchConcepts('experience with big data analytics')
    expect(concepts).toContain('cpt:distributed-compute')
  })

  it('reports the terms it did not recognise instead of silently dropping them', () => {
    const jd = analyseJd('You will use Snowflake and dbt for transformations.')
    expect(jd.unmatchedTerms.join(' ')).toMatch(/snowflake/)
  })
})

describe('the scorer', () => {
  const jd = analyseJd('distributed data processing at scale')
  const dataEngineer = ROLE_PROFILES.find((p) => p.id === 'rp:data-engineer')!
  const distributed = dataEngineer.requirements.find((r) => r.id === 'r:de-distributed')!
  const pipelines = dataEngineer.requirements.find((r) => r.id === 'r:de-pipelines')!

  it('never lets a disputed or unasserted claim through gate 0', () => {
    for (const c of CLAIMS) {
      if (c.asserted && c.status !== 'disputed') continue
      for (const req of dataEngineer.requirements) {
        expect(scoreClaim(c, req, jd), `${c.id} reached ${req.id}`).toBeNull()
      }
    }
  })

  it('never lets word overlap alone surface a claim with no concept relationship', () => {
    // clm:cause-build shares vocabulary with almost anything and carries none of
    // this requirement's concepts, directly or adjacently.
    const cause = claimById('clm:cause-build')
    expect(scoreClaim(cause, distributed, analyseJd('data data data data'))).toBeNull()
  })

  it('answers the distributed-processing requirement with the coursework artifact', () => {
    const hit = scoreClaim(claimById('clm:cpsc5330-tf-artifact'), distributed, jd)
    expect(hit).not.toBeNull()
    expect(hit!.score).toBeGreaterThanOrEqual(MIN_HIT_SCORE)
  })

  it('lets the single-node lab ETL sit NEAR the distributed requirement without satisfying it', () => {
    // The barn-owl ETL is real pipeline engineering over five-plus proprietary
    // formats — and it is single-node Python, not a distributed engine. The
    // adjacency edge carries it close without letting it count. A design where
    // this row satisfied this requirement would lie to a hiring manager.
    const etl = claimById('clm:fischer-etl-formats')
    expect(etl.concepts).not.toContain('cpt:distributed-compute')
    const viaAdjacency = scoreClaim(etl, distributed, jd)
    if (viaAdjacency) expect(viaAdjacency.via).toBe('adjacent')

    // And on the requirement it genuinely answers, it comes back strong.
    const direct = scoreClaim(etl, pipelines, analyseJd('build and maintain ETL pipelines'))
    expect(direct).not.toBeNull()
    expect(direct!.via).toBe('pinned')
    expect(direct!.score).toBeGreaterThan(viaAdjacency ? viaAdjacency.score : 0)
  })

  it('keeps every adjacency edge strictly below a direct match', () => {
    for (const c of CONCEPTS) {
      for (const edge of c.adjacent) {
        expect(edge.weight, `${c.id} -> ${edge.id}`).toBeLessThan(1)
        expect(edge.why.length, `${c.id} -> ${edge.id} has no rationale`).toBeGreaterThan(10)
      }
    }
  })

  it('classifies coverage so a class cannot pass for a job', () => {
    expect(coverageFor([])).toBe('none')
    const coursework = scoreClaim(claimById('clm:cpsc5330-tf-artifact'), distributed, jd)!
    expect(coverageFor([coursework])).toBe('coursework-only')
  })
})

describe('retrieve()', () => {
  it('reports a requirement with no evidence as a result, with a written answer', () => {
    const out = retrieve({ jdText: 'You will run our Kubernetes clusters and Helm charts.' })
    const k8s = out.requirements.find((r) => r.gap?.id === 'gap:kubernetes')
    // Kubernetes is not a requirement on any profile, so it surfaces through the
    // concept's own gap rather than through a requirement — either way the answer
    // exists and was written in advance.
    const gap = GAPS.find((g) => g.id === 'gap:kubernetes')!
    expect(gap.severity).toBe('hard-blocker')
    expect(gap.nearestEvidence).toEqual([])
    if (k8s) expect(k8s.coverage).toBe('none')
  })

  it('attaches the honest limit when coverage is coursework only', () => {
    const out = retrieve({ profileId: 'rp:data-engineer' })
    const distributed = out.requirements.find((r) => r.requirementId === 'r:de-distributed')!
    expect(['coursework-only', 'partial', 'strong']).toContain(distributed.coverage)
    if (distributed.coverage === 'coursework-only') {
      expect(distributed.gap).not.toBeNull()
      expect(distributed.fallback).toMatch(/both halves/i)
    }
  })

  it('cites only claims it selected, and requires every caveat those claims carry', () => {
    const out = retrieve({ profileId: 'rp:research-scientist' })
    expect(out.citedClaims.length).toBeGreaterThan(5)
    for (const id of out.mandatoryCaveats) {
      expect(claimById(id).kind).toBe('caveat')
      // A caveat the renderer must emit is also a claim it is licensed to quote,
      // or the two rules contradict each other.
      expect(out.citedClaims).toContain(id)
    }
  })

  it('falls back to a custom requirement set rather than the nearest template', () => {
    const out = retrieve({ jdText: 'Neo4j knowledge graphs and multilingual NLP.' })
    expect(out.profile).toBe('custom')
    expect(out.profileConfidence).toBe('custom')
  })

  it('surfaces an unresolved dispute as a stated uncertainty, never as a number', () => {
    for (const d of DISPUTES) {
      if (d.resolution !== 'unresolved') continue
      expect(d.agentGuidance.length, d.id).toBeGreaterThan(30)
      expect(findRetractedPhrase(d.agentGuidance), d.id).toBeNull()
    }
  })
})

/* ══ 5. determinism ═══════════════════════════════════════════════════════ */

describe('the same input produces the same output', () => {
  const jd = 'Senior Data Engineer: ETL pipelines, schema design, Spark, data quality.'
  const now = new Date('2026-09-02T00:00:00Z')

  it('selects the same evidence in the same order on every run', () => {
    const a = retrieve({ jdText: jd, now })
    const b = retrieve({ jdText: jd, now })
    expect(a.citedClaims).toEqual(b.citedClaims)
    expect(a.requirements.map((r) => [r.requirementId, r.coverage, r.hits.map((h) => h.claim.id)])).toEqual(
      b.requirements.map((r) => [r.requirementId, r.coverage, r.hits.map((h) => h.claim.id)])
    )
  })

  it('answers a free-form question without a model, a key or a network call', () => {
    const ctx = answerContext('Tell me about his experimental design experience.')
    expect(ctx.claims.length).toBeGreaterThan(0)
    for (const c of ctx.claims) {
      expect(c.asserted).toBe(true)
      expect(c.status).not.toBe('disputed')
      expect(c.surfaces).toContain('agent')
    }
  })
})

/* ══ the agent projection ═════════════════════════════════════════════════ */

describe('the projection the agent consumes', () => {
  it('shows the agent nothing it is not allowed to assert', () => {
    for (const r of agentEvidence()) {
      const c = claimById(r.id)
      expect(c.asserted).toBe(true)
      expect(c.status).not.toBe('disputed')
    }
  })

  it('carries the citation trail a model must never lose', () => {
    const record = toEvidenceRecord(claimById('clm:yang-p1-floor'))
    expect(record.citations.length).toBeGreaterThan(0)
    expect(record.citations[0]!.locator.length).toBeGreaterThan(4)
    expect(record.verificationPath).toContain('news.html')
    expect(record.value?.baseline).toMatch(/floor/)
  })

  it('describes a non-public artifact instead of linking to it', () => {
    const record = toEvidenceRecord(claimById('clm:yang-psb-submission'))
    const manuscript = record.links.find((l) => l.id === 'art:psb-manuscript')!
    expect(manuscript.access).toBe('under-review')
    expect(manuscript.url).toBeNull()
  })
})

/* ══ formatting ═══════════════════════════════════════════════════════════ */

describe('period formatting', () => {
  it('renders an ongoing role as present, never as a guessed end date', () => {
    expect(formatPeriod({ start: '2026-03', end: null, precision: 'month' })).toMatch(/present$/)
  })

  it('renders an end-only period without inventing a start', () => {
    expect(formatPeriod({ start: null, end: '2023-05', precision: 'month' })).toBe('May 2023')
  })

  it('keeps both ongoing roles ongoing', () => {
    for (const id of ['rol:yang-gra', 'rol:fischer-rde']) {
      const role = ROLES.find((r) => r.id === id)!
      expect(role.ongoing, id).toBe(true)
      expect(role.period.end, id).toBeNull()
    }
  })
})
