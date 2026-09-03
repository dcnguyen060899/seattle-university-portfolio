/**
 * tests/unit/agent-boundaries.test.ts — the module boundaries, the rate limiter
 * and the money.
 *
 * These are the properties nobody notices breaking until it is expensive:
 * a client component that imports the environment module, a limiter keyed on a
 * header a client controls, a cost table that has drifted from the price the
 * page prints.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { costUsd, formatUsd, rateFor, zeroUsage, accumulate, PRICING } from '../../lib/agent/cost'
import { DailyCounter, RateLimiter, clientKey } from '../../lib/agent/ratelimit'
import { buildLogLine, shortHash } from '../../lib/agent/log'
import { emptyGuardrails } from '../../lib/agent/postcheck'

const ROOT = join(import.meta.dirname, '..', '..')

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()!
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) stack.push(full)
      else if (exts.some((e) => entry.endsWith(e))) out.push(full)
    }
  }
  return out
}

describe('the server/client boundary', () => {
  it('keeps lib/agent/env.ts out of every component', () => {
    // env.ts reads process.env. It has a runtime guard of its own, but the point
    // of a boundary is that it is checked before anyone hits the guard.
    for (const file of walk(join(ROOT, 'components'), ['.ts', '.tsx'])) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/from ['"][^'"]*lib\/agent\/env['"]/)
    }
  })

  it('keeps node built-ins out of the module the panel imports for its limits', () => {
    const limits = readFileSync(join(ROOT, 'lib', 'agent', 'limits.ts'), 'utf8')
    expect(limits).not.toContain('node:')
    expect(limits).not.toContain('import ')
  })

  it('keeps the schema module out of the browser bundle by keeping limits separate', () => {
    // The panel reads its caps from limits.ts, not from contracts.ts, so a
    // validation library does not travel to the browser to supply four integers.
    for (const file of walk(join(ROOT, 'components', 'site', 'agent-panel'), ['.ts', '.tsx'])) {
      const source = readFileSync(file, 'utf8')
      const importsContractsAtRuntime = /^import\s+\{[^}]*\}\s+from\s+['"][^'"]*agent\/contracts['"]/m.test(
        source,
      )
      expect(importsContractsAtRuntime, file).toBe(false)
    }
  })

  it('never reads process.env outside the one module licensed to', () => {
    const files = [
      ...walk(join(ROOT, 'lib', 'agent'), ['.ts']),
      ...walk(join(ROOT, 'components'), ['.ts', '.tsx']),
    ]
    for (const file of files) {
      if (file.endsWith(join('lib', 'agent', 'env.ts'))) continue
      expect(readFileSync(file, 'utf8'), file).not.toContain('process.env')
    }
  })
})

describe('the rate limiter', () => {
  it('allows a burst, then throttles to the sustained rate', () => {
    const limiter = new RateLimiter({ perMin: 1, burst: 3 })
    const now = 1_000_000
    expect(limiter.take('a', now).allowed).toBe(true)
    expect(limiter.take('a', now).allowed).toBe(true)
    expect(limiter.take('a', now).allowed).toBe(true)
    expect(limiter.take('a', now).allowed).toBe(false)
  })

  it('reports a Retry-After a client can actually act on', () => {
    const limiter = new RateLimiter({ perMin: 1, burst: 1 })
    const now = 1_000_000
    limiter.take('b', now)
    const denied = limiter.take('b', now)
    expect(denied.retryAfter).toBeGreaterThan(0)
    expect(denied.retryAfter).toBeLessThanOrEqual(60)
    // And after that long, the caller is allowed again.
    expect(limiter.take('b', now + denied.retryAfter * 1000).allowed).toBe(true)
  })

  it('keys separate callers separately', () => {
    const limiter = new RateLimiter({ perMin: 1, burst: 1 })
    const now = 1_000_000
    expect(limiter.take('one', now).allowed).toBe(true)
    expect(limiter.take('two', now).allowed).toBe(true)
  })

  it('stays bounded under a spray of keys', () => {
    const limiter = new RateLimiter({ perMin: 1, burst: 1, maxKeys: 50 })
    for (let i = 0; i < 500; i += 1) limiter.take(`key-${i}`)
    // No assertion on internals; the property is that this does not grow without
    // bound and does not throw. A leak here is a memory leak on a warm instance.
    expect(limiter.take('key-final').allowed).toBe(true)
  })

  it('takes the LAST forwarded-for entry, which the proxy wrote', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.1' })
    expect(clientKey(headers)).toBe('203.0.113.1')
  })

  it('falls back through x-real-ip to a constant, never to a client-supplied value', () => {
    expect(clientKey(new Headers({ 'x-real-ip': '203.0.113.2' }))).toBe('203.0.113.2')
    expect(clientKey(new Headers())).toBe('unknown')
  })
})

describe('the daily counter', () => {
  it('stops at the ceiling and resets on the date change', () => {
    const counter = new DailyCounter(2)
    const day = new Date('2026-09-02T10:00:00Z')
    expect(counter.tryConsume(day)).toBe(true)
    expect(counter.tryConsume(day)).toBe(true)
    expect(counter.tryConsume(day)).toBe(false)
    expect(counter.tryConsume(new Date('2026-09-03T00:01:00Z'))).toBe(true)
  })

  it('treats a ceiling of zero as closed, not as unlimited', () => {
    expect(new DailyCounter(0).tryConsume()).toBe(false)
  })
})

describe('the cost table', () => {
  it('matches a hand-computed figure', () => {
    // 13,460 input + 2,100 output on the default model, no cache:
    //   13460 / 1e6 * 5.00  = 0.0673
    //    2100 / 1e6 * 25.00 = 0.0525
    //                         ------
    //                         0.1198
    const usage = {
      input_tokens: 13_460,
      output_tokens: 2_100,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    }
    expect(costUsd('claude-opus-5', usage)).toBeCloseTo(0.1198, 4)
  })

  it('prices a cache read at a tenth of input and a 1-hour write at twice it', () => {
    const rate = rateFor('claude-opus-5')
    expect(rate.cacheRead).toBeCloseTo(rate.in * 0.1, 6)
    expect(rate.cacheWrite1h).toBeCloseTo(rate.in * 2, 6)
  })

  it('counts all four token buckets, which are reported separately and are not double counted', () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    }
    const rate = rateFor('claude-opus-5')
    expect(costUsd('claude-opus-5', usage)).toBeCloseTo(
      rate.in + rate.cacheRead + rate.cacheWrite1h,
      4,
    )
  })

  it('falls back to the default rate for an unknown model rather than reporting zero', () => {
    const usage = { ...zeroUsage(), input_tokens: 1_000_000 }
    expect(costUsd('some-future-model', usage)).toBeGreaterThan(0)
  })

  it('accumulates across turns', () => {
    const total = zeroUsage()
    accumulate(total, { input_tokens: 10, output_tokens: 5 })
    accumulate(total, { input_tokens: 7, cache_read_input_tokens: 3 })
    expect(total).toEqual({
      input_tokens: 17,
      output_tokens: 5,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 0,
    })
  })

  it('prints a figure small enough to be honest about', () => {
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(0.0118)).toBe('$0.0118')
    expect(formatUsd(1.5)).toBe('$1.50')
  })

  it('carries a row for every model this deploy could be pointed at', () => {
    expect(Object.keys(PRICING)).toContain('claude-opus-5')
    expect(Object.keys(PRICING)).toContain('claude-sonnet-5')
  })
})

describe('the log line', () => {
  it('records the length and a hash of a pasted posting, never the text', () => {
    const jd = 'Confidential unposted role at a company that has not announced it.'
    const line = buildLogLine({
      event: 'agent.brief',
      requestId: 'r',
      ip: '203.0.113.1',
      mode: 'demo',
      role: 'data-scientist',
      jdText: jd,
      telemetry: {
        model: null,
        runtime: 'nodejs',
        region: 'local',
        mode: 'demo',
        corpus_version: 'abc',
        corpus_size: 1,
        retrieved: 1,
        surfaced: 0,
        ranking: [],
        tool_calls: [],
        usage: zeroUsage(),
        cost_usd: 0,
        ms: 1,
      },
      coverage: { direct: 1, adjacent: 0, partial: 0, no_evidence: 1 },
      requirements: 2,
      guardrails: emptyGuardrails(),
      degraded: true,
      reason: 'demo_mode',
      turns: 1,
      msModel: 0,
    })
    const serialised = JSON.stringify(line)
    expect(serialised).not.toContain('Confidential')
    expect(line.jd_chars).toBe(jd.length)
    expect(line.jd_sha).toMatch(/^[0-9a-f]{8}$/)
  })

  it('hashes nothing to a marker rather than to a hash of the empty string', () => {
    expect(shortHash('')).toBe('-')
  })

  it('is one flat object, so every field is greppable', () => {
    const line = buildLogLine({
      event: 'agent.brief',
      requestId: 'r',
      ip: 'x',
      mode: 'live',
      role: 'ml-engineer',
      jdText: null,
      telemetry: {
        model: 'claude-opus-5',
        runtime: 'nodejs',
        region: 'iad1',
        mode: 'live',
        corpus_version: 'abc',
        corpus_size: 116,
        retrieved: 116,
        surfaced: 9,
        ranking: [],
        tool_calls: [],
        usage: zeroUsage(),
        cost_usd: 0.12,
        ms: 7000,
      },
      coverage: { direct: 3, adjacent: 1, partial: 2, no_evidence: 1 },
      requirements: 7,
      guardrails: emptyGuardrails(),
      degraded: false,
      reason: null,
      turns: 2,
      msModel: 6800,
    })
    for (const value of Object.values(line)) {
      expect(['string', 'number']).toContain(typeof value)
    }
  })
})
