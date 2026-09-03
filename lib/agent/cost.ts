/**
 * lib/agent/cost.ts — what one run actually cost, in dollars, measured.
 *
 * The figure this computes is rendered on the page. That is the point: a cost
 * the page displays is a cost that cannot quietly drift, and it is the cheapest
 * possible demonstration that the thing a recruiter is using is metered
 * production infrastructure rather than a mock.
 *
 * BILLING SHAPE, so the arithmetic below is readable:
 *   input_tokens                 full price
 *   output_tokens                full price
 *   cache_read_input_tokens      0.1x input
 *   cache_creation_input_tokens  2x input at the 1-hour TTL this agent uses
 *                                (1.25x is the 5-minute rate; prompts.ts asks
 *                                for ttl "1h", so the 1h rate is the honest one)
 * All four are reported separately in `usage`, so summing them is correct and
 * is not double-counting.
 *
 * Rates are Anthropic first-party API rates, USD per million tokens. UPDATE
 * THIS TABLE ALONGSIDE `AGENT_MODEL`: a stale rate here is a wrong number on a
 * page whose entire argument is that its numbers are checkable.
 */

import type { AgentUsage } from './contracts'

export interface Rate {
  /** USD per million input tokens. */
  in: number
  /** USD per million output tokens. */
  out: number
  /** USD per million tokens written to a 1-hour cache entry. */
  cacheWrite1h: number
  /** USD per million tokens read from cache. */
  cacheRead: number
}

export const PRICING: Readonly<Record<string, Rate>> = Object.freeze({
  'claude-opus-5': { in: 5.0, out: 25.0, cacheWrite1h: 10.0, cacheRead: 0.5 },
  'claude-opus-4-8': { in: 5.0, out: 25.0, cacheWrite1h: 10.0, cacheRead: 0.5 },
  'claude-sonnet-5': { in: 2.0, out: 10.0, cacheWrite1h: 4.0, cacheRead: 0.2 },
  'claude-haiku-4-5': { in: 1.0, out: 5.0, cacheWrite1h: 2.0, cacheRead: 0.1 },
})

export const DEFAULT_RATE: Rate = PRICING['claude-opus-5'] as Rate

export function rateFor(model: string): Rate {
  return PRICING[model] ?? DEFAULT_RATE
}

export function zeroUsage(): AgentUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  }
}

/** Accumulate one turn's usage into the run total. Mutates `total`, by design:
 *  the loop needs a running figure that survives a mid-run failure. */
export function accumulate(
  total: AgentUsage,
  turn: {
    input_tokens?: number | null
    output_tokens?: number | null
    cache_read_input_tokens?: number | null
    cache_creation_input_tokens?: number | null
  } | null,
): AgentUsage {
  if (!turn) return total
  total.input_tokens += turn.input_tokens ?? 0
  total.output_tokens += turn.output_tokens ?? 0
  total.cache_read_input_tokens += turn.cache_read_input_tokens ?? 0
  total.cache_creation_input_tokens += turn.cache_creation_input_tokens ?? 0
  return total
}

/** USD, rounded to the cent-thousandth so the strip can print four decimals. */
export function costUsd(model: string, u: AgentUsage): number {
  const p = rateFor(model)
  const usd =
    (u.input_tokens * p.in +
      u.output_tokens * p.out +
      u.cache_creation_input_tokens * p.cacheWrite1h +
      u.cache_read_input_tokens * p.cacheRead) /
    1_000_000
  return Math.round(usd * 1e5) / 1e5
}

/**
 * "$0.0118" — never "about", never rounded down to a prettier number.
 *
 * Four decimals under a dollar, because a brief costs about a tenth of a cent
 * and `$0.01` would be BOTH imprecise and, at these magnitudes, wrong in the
 * flattering direction. Two decimals above a dollar, where the fourth is noise.
 * A page that prints a measured cost has to print the measurement.
 */
export function formatUsd(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 1) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}
