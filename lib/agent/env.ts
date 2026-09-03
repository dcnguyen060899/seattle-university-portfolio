/**
 * lib/agent/env.ts — the ONLY module in this repository permitted to read
 * `process.env`. `eslint.config.mjs` exempts exactly this path and bans the
 * member expression everywhere else.
 *
 * WHY THE BAN IS WORTH A LINT RULE
 * --------------------------------
 * `AGENT_DEMO_MODE` defaults ON and WINS OVER A PRESENT KEY. That is the right
 * default — it is ported from the reference project, where a live API call
 * failing in front of an investor is the one unrecoverable outcome — but it
 * makes the "forgot the env var" state INVISIBLE unless every read funnels
 * through one place. A second module reading `process.env.ANTHROPIC_API_KEY`
 * directly would report the agent live while it was serving canned briefs
 * forever to every recruiter who visited (brief Addendum B, ruling R-13).
 *
 * So: one module, one lock, and three independent detectors of the wrong state:
 *   1. `npm run check:env` prints the demo-mode row before anything else and
 *      FAILS a production deploy that has a key and no `AGENT_DEMO_MODE=0`.
 *   2. `GET /api/agent/health` reports `mode: "live" | "demo"`, asserted as a
 *      numbered step in the cutover checklist.
 *   3. `getAnthropic()` in client.ts THROWS while demo mode is on, so the demo
 *      path cannot make a network call even if a branch is forgotten.
 *
 * WHY NOT `import 'server-only'`
 * ------------------------------
 * The `server-only` package resolves to a module that throws under any
 * condition except React's `react-server`, which includes Vitest. Importing it
 * here would make every unit test that touches the agent pipeline fail at
 * import time, and the vitest config is owned by another territory and cannot
 * be given an alias. The guarantee is kept by other means, all of which hold:
 * the `assertServerOnly()` call below throws if this module is ever evaluated
 * in a browser, `tests/unit/agent-boundary.test.ts` asserts that no file under
 * `components/` imports it, and Next.js never inlines a non-`NEXT_PUBLIC_`
 * variable into a client bundle, so the key cannot travel even if it did.
 */

/* This module IS the process.env exemption: eslint.config.mjs turns the
 * `no-restricted-syntax` selector off for exactly this path, so no inline
 * disable comment is needed — and an unused one would be a lint warning of its
 * own. If that config block is ever narrowed, this line is where it breaks. */

const raw = process.env

/**
 * Belt to `server-only`'s braces. Cheap, and it fires at module evaluation
 * rather than at the first read, so a mistake surfaces on the first render
 * instead of on the first recruiter.
 */
function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      'lib/agent/env.ts was evaluated in a browser. It reads process.env and must ' +
        'only ever be imported from a route handler or a Server Component.',
    )
  }
}
assertServerOnly()

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

function present(key: string): boolean {
  const value = raw[key]
  return typeof value === 'string' && value.trim().length > 0
}

function clampInt(value: string | undefined, fallback: number, lo: number, hi: number): number {
  const n = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Fail safe, not fail open. Defaults ON; ONLY the literal string '0' turns it
 * off. Not `=== '1'` — a typo in the variable must leave the safety net up,
 * never take it down. (spec-04 §9.1)
 */
function readDemoMode(): boolean {
  return raw.AGENT_DEMO_MODE !== '0'
}

/**
 * A key alone is NOT enough: live requires demo mode OFF and a key present.
 *
 * `AGENT_FAKE_MODEL=1` also satisfies it, and that is deliberate. The
 * deterministic in-process model exists so the ENTIRE live path — loop, tool
 * execution, fact check, rendering, the envelope — is exercised on a fresh
 * clone with no key and no network. If it did not satisfy the capability, the
 * route would fall through to a pre-built brief and the live path would only
 * ever run in production. The hole that opens is closed immediately below: it
 * is a hard error in a production deploy, and the health endpoint names it.
 */
function readCapabilities(demo: boolean) {
  return Object.freeze({
    /** The fit-brief and Q&A model calls. Everything else on the page works without this. */
    agent: !demo && (present('ANTHROPIC_API_KEY') || raw.AGENT_FAKE_MODEL === '1'),
  })
}

function readAgentEnv() {
  const effortRaw = raw.AGENT_EFFORT
  return Object.freeze({
    /**
     * Default `claude-opus-5`. Calibration — the honest partial / no-evidence
     * judgement — is the hardest thing this agent does and is where model
     * quality shows. One env var moves it; `lib/agent/cost.ts` already carries
     * the rows for the alternatives.
     */
    model: (raw.AGENT_MODEL ?? 'claude-opus-5').trim(),
    effort: EFFORTS.includes(effortRaw as Effort) ? (effortRaw as Effort) : ('medium' as Effort),
    briefMaxTokens: clampInt(raw.AGENT_BRIEF_MAX_TOKENS, 3000, 1000, 8000),
    qaMaxTokens: clampInt(raw.AGENT_QA_MAX_TOKENS, 1200, 400, 4000),
    /** Inside vercel.json's maxDuration, so the function always finishes on its own terms. */
    briefDeadlineMs: clampInt(raw.AGENT_DEADLINE_MS, 45_000, 5_000, 55_000),
    qaDeadlineMs: clampInt(raw.AGENT_QA_DEADLINE_MS, 20_000, 5_000, 28_000),
    dailyBriefCeiling: clampInt(raw.AGENT_DAILY_BRIEF_CEILING, 60, 0, 5_000),
    dailyQaCeiling: clampInt(raw.AGENT_DAILY_QA_CEILING, 200, 0, 20_000),
    /** Never logged, never returned by any route, never rendered. Presence only. */
    apiKey: raw.ANTHROPIC_API_KEY ?? '',
    region: raw.VERCEL_REGION ?? 'local',
    vercelEnv: raw.VERCEL_ENV ?? 'development',
    /**
     * Test-only escape hatch: a deterministic in-process model that exercises
     * the ENTIRE live path — loop, tool execution, fact check, rendering —
     * with no key and no network. Without it the live path would only ever be
     * tested in production.
     */
    fakeModel: raw.AGENT_FAKE_MODEL === '1',
    /**
     * Under the test runner the one-line-per-request log is noise that buries
     * the assertion output. The line itself is still BUILT and still asserted on
     * — `tests/unit/agent-boundaries.test.ts` checks its shape and that it
     * carries no pasted text — so what is suppressed is the printing, not the
     * accounting.
     */
    quietLogs: raw.VITEST === 'true' || raw.VITEST === '1' || raw.NODE_ENV === 'test',
  })
}

/**
 * The test model must never be reachable in production. This is the one place
 * that can see both facts at once, so this is where it refuses.
 */
function assertFakeModelIsNotProduction(env: ReturnType<typeof readAgentEnv>): void {
  if (env.fakeModel && env.vercelEnv === 'production') {
    throw new Error(
      'AGENT_FAKE_MODEL is set in a production deploy. That variable selects a deterministic ' +
        'in-process stand-in for the model and exists only for tests. Unset it.',
    )
  }
}

let demoMode = readDemoMode()
let caps = readCapabilities(demoMode)
let env = readAgentEnv()
assertFakeModelIsNotProduction(env)

/** Read through the getters, never captured at import time — see `reloadAgentEnv`. */
export const AGENT_DEMO_MODE = (): boolean => demoMode
export const capabilities = (): { agent: boolean } => caps
export const agentEnv = (): ReturnType<typeof readAgentEnv> => env

/** `mode` as the health endpoint and the run strip report it (ruling R-13). */
export const agentMode = (): 'live' | 'demo' => (caps.agent ? 'live' : 'demo')

/**
 * Re-read the environment. The analogue of `evaluation/config.py::reload()`:
 * tests set env vars and need the module to notice, and a module that captured
 * its config in a top-level const cannot be tested for the very branch that
 * matters most.
 */
export function reloadAgentEnv(): void {
  demoMode = readDemoMode()
  caps = readCapabilities(demoMode)
  env = readAgentEnv()
  assertFakeModelIsNotProduction(env)
}

/** Why the agent is not live, in the vocabulary the envelope's `reason` uses. */
export function degradedReasonFromEnv(): 'demo_mode' | 'not_configured' | null {
  if (demoMode) return 'demo_mode'
  if (!caps.agent) return 'not_configured'
  return null
}

/** Presence only. Never the key, never part of it, never its length. */
export const aiConfigured = (): boolean => present('ANTHROPIC_API_KEY')
