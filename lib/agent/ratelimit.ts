/**
 * lib/agent/ratelimit.ts — a token bucket, and an honest statement of what it
 * is not.
 *
 * THE RATE LIMITER IS NOT A SPEND CONTROL. It is in-memory, therefore
 * per-serverless-instance, and a fleet is what the platform gives you. The
 * effective limit is (limit x instances). It raises the cost of abuse; it does
 * not cap it. The real control is a prepaid balance at the API console with
 * auto-reload OFF — when that runs out the API returns a typed error, the agent
 * degrades to a pre-built brief, and the site keeps working. That sentence is
 * in the runbook because a reader who takes one thing from it should take that
 * one.
 *
 * WHY A TOKEN BUCKET AND NOT A FIXED WINDOW. A recruiter who tries two roles in
 * a row is the normal case, not abuse. A bucket tolerates that burst and still
 * throttles a loop, and — the reason that actually decides it — a bucket can
 * compute a CORRECT `Retry-After`, where a fixed window can only guess at one.
 *
 * WHY THE KEY IS THE LAST `X-Forwarded-For` ENTRY. The first entry is
 * client-supplied and trivially spoofed; the last is written by the platform's
 * own proxy. Keying on the first would make the limiter opt-out.
 */

export interface RateLimitDecision {
  allowed: boolean
  /** Seconds until one token is available again. Integer, at least 1 when denied. */
  retryAfter: number
  remaining: number
}

interface Bucket {
  tokens: number
  updated: number
}

export interface RateLimiterOptions {
  /** Sustained rate, tokens per minute. */
  perMin: number
  /** Bucket capacity: how many requests may arrive back to back. */
  burst: number
  /** Hard cap on tracked keys, so a spray of addresses cannot grow the map. */
  maxKeys?: number
}

export class RateLimiter {
  private readonly perMin: number
  private readonly burst: number
  private readonly maxKeys: number
  private readonly buckets = new Map<string, Bucket>()

  constructor(options: RateLimiterOptions) {
    this.perMin = Math.max(0.01, options.perMin)
    this.burst = Math.max(1, options.burst)
    this.maxKeys = options.maxKeys ?? 5_000
  }

  /** Refill rate in tokens per millisecond. */
  private get ratePerMs(): number {
    return this.perMin / 60_000
  }

  take(key: string, now: number = Date.now()): RateLimitDecision {
    this.evictIfNeeded(now)
    const bucket = this.buckets.get(key) ?? { tokens: this.burst, updated: now }
    const elapsed = Math.max(0, now - bucket.updated)
    const tokens = Math.min(this.burst, bucket.tokens + elapsed * this.ratePerMs)

    if (tokens >= 1) {
      this.buckets.set(key, { tokens: tokens - 1, updated: now })
      return { allowed: true, retryAfter: 0, remaining: Math.floor(tokens - 1) }
    }

    this.buckets.set(key, { tokens, updated: now })
    const msUntilOne = (1 - tokens) / this.ratePerMs
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil(msUntilOne / 1000)),
      remaining: 0,
    }
  }

  /**
   * Bounded by construction. When the map is full the OLDEST-TOUCHED half goes,
   * not the whole map: dropping everything would hand a full burst back to every
   * active client at once, which is the moment a limiter is least useful.
   */
  private evictIfNeeded(now: number): void {
    if (this.buckets.size < this.maxKeys) return
    const entries = [...this.buckets.entries()].sort((a, b) => a[1].updated - b[1].updated)
    for (let i = 0; i < Math.floor(entries.length / 2); i += 1) {
      const entry = entries[i]
      if (entry) this.buckets.delete(entry[0])
    }
    void now
  }

  /** Tests only. */
  reset(): void {
    this.buckets.clear()
  }
}

/**
 * A per-instance daily counter, reset on UTC date change. Same caveat as the
 * limiter: per instance, not per fleet. It exists so that a single warm
 * instance cannot run a bill up overnight, not because it is a real ceiling.
 */
export class DailyCounter {
  private day = ''
  private count = 0

  constructor(private readonly limit: number) {}

  /** Returns false when the ceiling is already reached; does not increment then. */
  tryConsume(now: Date = new Date()): boolean {
    const today = now.toISOString().slice(0, 10)
    if (today !== this.day) {
      this.day = today
      this.count = 0
    }
    if (this.limit <= 0) return false
    if (this.count >= this.limit) return false
    this.count += 1
    return true
  }

  get used(): number {
    return this.count
  }

  reset(): void {
    this.day = ''
    this.count = 0
  }
}

/**
 * 3 briefs immediately, then 1 a minute. Q&A is cheaper and shorter, so it gets
 * a wider bucket: a recruiter reading a brief and asking three follow-ups is
 * the behaviour the page is trying to produce, not the behaviour it defends
 * against.
 */
export const briefLimiter = new RateLimiter({ perMin: 1, burst: 3, maxKeys: 5_000 })
export const qaLimiter = new RateLimiter({ perMin: 3, burst: 6, maxKeys: 5_000 })

/**
 * The client key.
 *
 * LAST entry of `X-Forwarded-For`, then `x-real-ip`, then a constant. The last
 * entry is the one the platform's proxy wrote; the first is whatever the client
 * claimed. Getting this backwards is how a limiter becomes decorative.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const last = parts[parts.length - 1]
    if (last) return last
  }
  const real = headers.get('x-real-ip')
  if (real && real.trim()) return real.trim()
  return 'unknown'
}
