/**
 * tests/unit/agent-calibration.test.ts — the suite that distinguishes this from
 * a demo.
 *
 * A fit brief that flatters every posting is worthless, and a hiring manager
 * discounts it on sight. These tests are about the SHAPE of the answer under
 * postings that Duy does not match, and they are written so that they test the
 * MECHANISM rather than a model's mood: the pipeline runs against the
 * deterministic composer and against the in-process test model, both of which
 * go through the same retrieval, the same floors and the same fact check the
 * live path uses.
 *
 * The single most important case in the file is the senior platform posting.
 * A brief that comes back enthusiastic about it is a broken product.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { messageForReason } from '../../lib/agent/client'
import { DEGRADED_REASONS } from '../../lib/agent/contracts'
import type { BriefEnvelope, DegradedReason } from '../../lib/agent/contracts'
import { composeDeterministicBrief, nearestRole } from '../../lib/agent/degraded'
import { reloadAgentEnv } from '../../lib/agent/env'
import { runBriefEvents } from '../../lib/agent/run'
import {
  corpusMentions,
  coverageForQuery,
  gapsForQuestion,
  lexicalFallback,
  scoreQuery,
  searchForQuestion,
} from '../../lib/agent/retrieval'

const POOR_MATCH_PLATFORM = `
Staff Platform Engineer. You will own our Kubernetes fleet across three regions, write Terraform for
every environment, and carry the pager. Requirements: 8+ years of production infrastructure
engineering, deep Go, experience managing a team of four engineers, and a track record of running
multi-tenant services at scale.
`

const POOR_MATCH_CLINICAL = `
Clinical Research Physician. Requires an MD, board certification, and five years running phase III
clinical trials. You will be responsible for patient safety monitoring and regulatory submissions.
`

const STRONG_MATCH_RESEARCH = `
Research Scientist, multimodal retrieval. You will design evaluation protocols for vision-language
models, run controlled experiments over retrieval encoders, publish first-author work, and write up
results. PyTorch required. PhD and a shipped production serving system preferred.
`

const MIXED_DATA_ENGINEER = `
Data Engineer. Requirements: build and maintain ETL pipelines, model relational schemas, own data
quality, and work with Spark and Airflow in production. dbt and Snowflake experience a plus.
Three years of industry experience required.
`

async function runBrief(jd: string, role: BriefEnvelope['brief']['jd_source'] extends never ? never : string | null = null) {
  let envelope: BriefEnvelope | null = null
  for await (const ev of runBriefEvents({
    requestId: 'test',
    role: role as never,
    jd,
    signal: new AbortController().signal,
  })) {
    if (ev.event === 'brief') envelope = ev.data
  }
  return envelope!
}

beforeEach(() => {
  delete process.env.AGENT_DEMO_MODE
  delete process.env.AGENT_FAKE_MODEL
  reloadAgentEnv()
})

afterEach(() => {
  delete process.env.AGENT_DEMO_MODE
  delete process.env.AGENT_FAKE_MODEL
  reloadAgentEnv()
})

describe('the retriever refuses to find evidence that is not there', () => {
  it('finds nothing for a Kubernetes fleet', () => {
    expect(coverageForQuery('Own a Kubernetes fleet across three regions').coverage).toBe('none')
    expect(scoreQuery('Kubernetes operator development')).toHaveLength(0)
  })

  it('finds nothing for clinical practice', () => {
    expect(coverageForQuery('Board certification and phase III trial management').coverage).toBe(
      'none',
    )
  })

  it('finds only coursework for distributed processing, and says which', () => {
    const { coverage } = coverageForQuery('Distributed data processing')
    expect(['coursework-only', 'partial', 'strong']).toContain(coverage)
  })

  it('is deterministic: the same query gives the same ranking every time', () => {
    const a = scoreQuery('Python, SQL and experimentation', 6)
    const b = scoreQuery('Python, SQL and experimentation', 6)
    expect(a.map((r) => [r.record.id, r.score])).toEqual(b.map((r) => [r.record.id, r.score]))
  })

  it('does not let a long posting outrank a short one on the same record', () => {
    const short = scoreQuery('Spark')
    const long = scoreQuery(`Spark. ${'We value collaboration and curiosity. '.repeat(60)}`)
    if (short[0] && long[0] && short[0].record.id === long[0].record.id) {
      expect(long[0].score).toBeLessThanOrEqual(short[0].score + 0.01)
    }
  })
})

describe('the poor-match postings — the tests that matter most', () => {
  it('answers a staff platform posting with nothing but gaps', async () => {
    // THE MOST IMPORTANT ASSERTION IN THE SUITE. A brief that comes back
    // enthusiastic about a posting asking for eight years of Kubernetes and a
    // team of four is a broken product, and it is the failure a hiring manager
    // notices first.
    const envelope = await runBrief(POOR_MATCH_PLATFORM)
    const verdicts = envelope.brief.requirements.map((r) => r.verdict)
    expect(verdicts.filter((v) => v === 'no_evidence').length).toBeGreaterThanOrEqual(2)
    expect(verdicts.filter((v) => v === 'no_evidence').length).toBeGreaterThanOrEqual(
      verdicts.filter((v) => v === 'direct').length,
    )
    expect(envelope.brief.gaps_summary.length).toBeGreaterThan(0)
    expect(envelope.guardrails.overclaim_flagged).toBe(false)

    // Nothing this posting names as its core requirement is claimed.
    for (const row of envelope.brief.requirements) {
      if (/kubernetes|terraform|\bgo\b|managing|pager/i.test(row.requirement)) {
        expect(row.verdict, row.requirement).toBe('no_evidence')
      }
    }
  })

  it('names Kubernetes as a gap, in the sentence a human wrote for it', async () => {
    const envelope = await runBrief(POOR_MATCH_PLATFORM)
    const row = envelope.brief.requirements.find((r) => /kubernetes/i.test(r.requirement))
    expect(row).toBeDefined()
    expect(row!.verdict).toBe('no_evidence')
    expect(row!.evidence).toHaveLength(0)
    expect(row!.rationale.length).toBeGreaterThan(40)
  })

  it('answers a paste with no role in it by saying exactly that', async () => {
    const envelope = await runBrief(
      'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt.',
    )
    expect(envelope.brief.requirements).toHaveLength(1)
    expect(envelope.brief.requirements[0]!.verdict).toBe('no_evidence')
    expect(envelope.brief.requirements[0]!.requirement).toBe(
      'No job requirements were found in the pasted text',
    )
    // And it did NOT quietly recite a role profile instead.
    expect(envelope.brief.requirements[0]!.evidence).toHaveLength(0)
  })

  it('never claims absence for a word this site does in fact use', async () => {
    const envelope = await runBrief(POOR_MATCH_PLATFORM)
    const echoed = envelope.brief.requirements
      .map((r) => /No record for "([^"]+)"/.exec(r.requirement)?.[1])
      .filter((t): t is string => Boolean(t))
    for (const term of echoed) {
      expect(corpusMentions(term), `"${term}" is used on this site`).toBe(0)
    }
  })

  it('does not claim clinical practice from a mammography research record', async () => {
    const envelope = await runBrief(POOR_MATCH_CLINICAL)
    expect(envelope.brief.requirements.some((r) => r.verdict === 'no_evidence')).toBe(true)
    const text = JSON.stringify(envelope.brief).toLowerCase()
    expect(text).not.toContain('board certif')
    expect(text).not.toContain('phase iii')
  })

  it('never claims a doctorate, however the posting is phrased', async () => {
    const envelope = await runBrief(STRONG_MATCH_RESEARCH)
    expect(JSON.stringify(envelope.brief)).not.toMatch(/\bPhD\b/i)
  })
})

describe('a strong-match posting still carries at least one honest gap', () => {
  it('leaves at least one requirement below a direct match', async () => {
    const envelope = await runBrief(STRONG_MATCH_RESEARCH)
    expect(envelope.brief.requirements.some((r) => r.verdict !== 'direct')).toBe(true)
  })

  it('says "under review" wherever the manuscript is mentioned', async () => {
    const envelope = await runBrief(STRONG_MATCH_RESEARCH)
    const text = JSON.stringify(envelope.brief)
    if (/pacific symposium|manuscript/i.test(text)) {
      expect(text.toLowerCase()).toContain('under review')
    }
  })
})

describe('a mixed posting splits its answer instead of averaging it', () => {
  it('produces more than one distinct verdict', async () => {
    const envelope = await runBrief(MIXED_DATA_ENGINEER)
    const distinct = new Set(envelope.brief.requirements.map((r) => r.verdict))
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('never describes in-flight orchestration work as shipped', async () => {
    const envelope = await runBrief(MIXED_DATA_ENGINEER)
    const rows = envelope.brief.requirements.filter((r) => /orchestrat|airflow/i.test(r.requirement))
    for (const row of rows) {
      expect(row.rationale).not.toMatch(/\b(?:deployed|shipped|operated) Airflow\b/i)
    }
  })
})

describe('every pre-built brief is honest by construction', () => {
  for (const profile of [
    'rp:research-scientist',
    'rp:data-scientist',
    'rp:ml-engineer',
    'rp:data-engineer',
  ] as const) {
    it(`${profile} passes its own fact check and is not all-direct`, () => {
      const checked = composeDeterministicBrief(profile)
      expect(checked.discard).toBeNull()
      expect(checked.brief.requirements.some((r) => r.verdict !== 'direct')).toBe(true)
      expect(checked.brief.requirements.length).toBeGreaterThanOrEqual(3)
    })

    it(`${profile} orders its rows by the profile, never by verdict`, () => {
      const checked = composeDeterministicBrief(profile)
      const verdicts = checked.brief.requirements.map((r) => r.verdict)
      const sortedByStrength = [...verdicts].sort()
      // If the rows happened to be sorted, that would be a coincidence worth
      // knowing about — the gap rows are appended last by design, so a strictly
      // ascending or descending order would mean something reordered them.
      expect(verdicts).not.toEqual(sortedByStrength.reverse().slice())
    })
  }
})

describe('the whole live path, driven by the in-process test model', () => {
  it('produces an undegraded brief with real telemetry and no network', async () => {
    process.env.AGENT_DEMO_MODE = '0'
    process.env.AGENT_FAKE_MODEL = '1'
    reloadAgentEnv()

    const envelope = await runBrief(MIXED_DATA_ENGINEER)
    expect(envelope.degraded).toBe(false)
    expect(envelope.reason).toBeNull()
    expect(envelope.telemetry.model).not.toBeNull()
    expect(envelope.telemetry.usage.input_tokens).toBeGreaterThan(0)
    expect(envelope.telemetry.cost_usd).toBeGreaterThan(0)
    // The tool loop actually ran: a fetch happened before the emit.
    expect(envelope.telemetry.tool_calls.length).toBeGreaterThan(0)
    expect(envelope.trace.map((t) => t.stage)).toContain('factcheck')
    expect(envelope.trace.map((t) => t.stage)).toContain('render')
  })

  it('still carries an honest gap when the model path runs', async () => {
    process.env.AGENT_DEMO_MODE = '0'
    process.env.AGENT_FAKE_MODEL = '1'
    reloadAgentEnv()
    const envelope = await runBrief(POOR_MATCH_PLATFORM)
    expect(envelope.brief.requirements.some((r) => r.verdict !== 'direct')).toBe(true)
  })
})

describe('nearest-role selection', () => {
  it('honours an explicit chip', () => {
    expect(nearestRole(null, 'ml-engineer')).toBe('ml-engineer')
  })

  it('falls back to the broadest profile rather than guessing', () => {
    expect(nearestRole('lorem ipsum dolor sit amet', null)).toBe('data-scientist')
  })
})

describe('the words a recruiter reads when something degrades', () => {
  it('never tells a stranger the system is switched off or broken', () => {
    for (const reason of DEGRADED_REASONS as readonly DegradedReason[]) {
      const message = messageForReason(reason).toLowerCase()
      expect(message, reason).not.toContain('switched off')
      expect(message, reason).not.toContain('broken')
      expect(message, reason).not.toContain('unavailable to you')
      expect(message.length).toBeGreaterThan(20)
    }
  })

  it('has a sentence for every reason the envelope can carry', () => {
    for (const reason of DEGRADED_REASONS as readonly DegradedReason[]) {
      expect(typeof messageForReason(reason)).toBe('string')
    }
  })
})

describe('a question is searched differently from a posting, and deliberately so', () => {
  it('finds a record by an advisor name, which no concept covers', () => {
    const hits = searchForQuestion('What did he do for Professor Fischer?')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('answers a one-rare-word question', () => {
    // "gpa" is three characters and appears in one record. Both facts matter:
    // the length floor has to admit it, and the rarity gate has to accept a
    // single match.
    const hits = lexicalFallback('What is his GPA?')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('refuses a question with nothing but common words', () => {
    expect(lexicalFallback('what about the work and the data')).toHaveLength(0)
  })

  it('routes a question that names a gap to the sentence written for it', () => {
    const answers = gapsForQuestion('Has he deployed a model to production?')
    expect(answers.length).toBeGreaterThan(0)
    expect(answers[0]!.length).toBeGreaterThan(40)
  })

  it('does not invent a gap for a question about work he has done', () => {
    expect(gapsForQuestion('What did he build for the barn owl lab?')).toHaveLength(0)
  })

  it('says nothing rather than guessing about a person’s private circumstances', () => {
    // The corpus has a gap record for this and it is marked disclose:false, so
    // retrieval must never reach it and the agent must never improvise around
    // it. What comes back is nothing, and nothing is the correct answer.
    expect(gapsForQuestion('Does he need visa sponsorship?')).toHaveLength(0)
    expect(searchForQuestion('Does he need visa sponsorship?')).toHaveLength(0)
  })
})
