#!/usr/bin/env node
/**
 * npm run check:env — the pre-deploy gate.
 *
 * Prints one line per capability: LIVE (real credentials, real calls) or SEEDED
 * (canned data, no network). The point is that nobody deploys believing a
 * capability is live when it is serving a fixture, and nobody demos believing
 * the opposite.
 *
 * ── WHY AGENT_DEMO_MODE GETS ITS OWN ROW (Addendum B, ruling R-13) ──────────
 *
 * The reference project's DEMO_MODE defaults ON and WINS OVER A PRESENT KEY.
 * That is exactly right there: the demo is driven by the owner in front of an
 * investor, and a live API call must not be able to fail on stage.
 *
 * Here the audience is different. This agent serves strangers, unattended,
 * 24/7, on a job-hunt site. A production deploy that sets ANTHROPIC_API_KEY and
 * forgets AGENT_DEMO_MODE=0 serves canned briefs FOREVER while cheerfully
 * announcing "the live model is switched off on this deploy" to every recruiter
 * who visits. Nothing else in the stack detects that state — a key-presence
 * check reports the agent live while it is canned.
 *
 * So AGENT_DEMO_MODE is reported first, on its own terms, before the table.
 *
 * Exit codes:
 *   0 — demo mode, whatever the key situation. A fresh clone with no .env.local
 *       must pass; that is the zero-paid-accounts constraint.
 *   0 — AGENT_DEMO_MODE=0 and every enabled capability has its keys.
 *   1 — AGENT_DEMO_MODE=0 and a capability that is partially configured is
 *       missing a required key. Half-configured is the dangerous state.
 *
 * Plain Node ESM. No TypeScript, no dependencies — it has to run before install
 * is guaranteed and before the app compiles.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// ── Load .env.local the way Next.js would, without pulling in dotenv ─────────

function loadEnvFile(file) {
  let raw
  try {
    raw = readFileSync(path.join(process.cwd(), file), 'utf8')
  } catch {
    return
  }
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) continue
    const key = match[1]
    let value = match[2] ?? ''
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const present = (key) => {
  const value = process.env[key]
  return typeof value === 'string' && value.trim().length > 0
}

/** Fail safe, not fail open. Defaults ON; only the literal string '0' turns it off. */
const AGENT_DEMO_MODE = process.env.AGENT_DEMO_MODE !== '0'

// ── The capability table — must mirror lib/agent/env.ts ─────────────────────

const CAPABILITIES = [
  {
    name: 'agent',
    keys: ['ANTHROPIC_API_KEY'],
    demoGated: true,
    live: 'Claude, structured outputs — real fit briefs and Q&A (/api/agent/*)',
    seeded:
      'pre-built canned brief per role from data/corpus/canned/*.json (built by the ' +
      'real agent through the real fact check — `npm run build:canned`)',
  },
  {
    name: 'evaluation',
    keys: ['ANTHROPIC_API_KEY'],
    // The Python side has its own switch and does NOT read AGENT_DEMO_MODE.
    disableKey: 'EVAL_AI_DISABLED',
    demoGated: false,
    live: 'AI judge + tutor for /evaluate-challenge (Python, api/index.py)',
    seeded: 'deterministic rule-based path in backend/src/evaluation/degraded.py',
  },
]

// ── Rendering ────────────────────────────────────────────────────────────────

const isTty = process.stdout.isTTY === true
const ESC = String.fromCharCode(27)
const colour = (code, text) => (isTty ? `${ESC}[${code}m${text}${ESC}[0m` : text)
const green = (text) => colour('32', text)
const amber = (text) => colour('33', text)
const red = (text) => colour('31', text)
const dim = (text) => colour('2', text)

const pad = (text, width) => (text.length >= width ? text : text + ' '.repeat(width - text.length))
const stateWidth = isTty ? 18 : 9

const failures = []
const warnings = []
let failed = false

console.log('')
console.log(`  duyng-portfolio — capability check   ${dim(new Date().toISOString())}`)
console.log('')

/* ── R-13: the demo-mode row, before anything else ──────────────────────────
 *
 * This is the state that silently degrades a job-hunt site, so it is reported
 * loudly whichever way it is set — an unset variable and a deliberate `1` look
 * identical to the runtime and must not look identical here.
 */
{
  const explicit = process.env.AGENT_DEMO_MODE
  const how =
    explicit === undefined
      ? 'UNSET, so the default applies'
      : explicit === '0'
        ? 'explicitly 0'
        : `explicitly "${explicit}" (anything but "0" means on)`
  if (AGENT_DEMO_MODE) {
    console.log(`  ${amber('AGENT_DEMO_MODE is ON')} — ${how}.`)
    console.log(
      '  The recruiter agent serves canned briefs and makes NO model call, even with a key present.',
    )
    console.log(
      `  ${amber('On production this is almost certainly wrong.')} Going live is an explicit AGENT_DEMO_MODE=0,`,
    )
    console.log('  then assert GET /api/agent/health returns mode === "live".')
    if (present('ANTHROPIC_API_KEY') && process.env.VERCEL_ENV === 'production') {
      failures.push(
        'AGENT_DEMO_MODE is on in a PRODUCTION deploy while ANTHROPIC_API_KEY is set. ' +
          'That combination serves canned briefs to every recruiter while the page says the ' +
          'model is switched off. Set AGENT_DEMO_MODE=0.',
      )
    } else if (present('ANTHROPIC_API_KEY')) {
      warnings.push(
        'agent: ANTHROPIC_API_KEY is set but AGENT_DEMO_MODE is on, so the key is unused. ' +
          'Demo mode wins over a present key, by design.',
      )
    }
  } else {
    console.log(`  ${green('AGENT_DEMO_MODE is OFF')} — ${how}. The agent will make real model calls.`)
    if (!present('ANTHROPIC_API_KEY')) {
      // The "you meant to go live and did not" case. Turning demo mode off is a
      // deliberate act; doing it without a key produces a deploy that is neither
      // honestly canned nor actually live.
      failures.push(
        'agent: AGENT_DEMO_MODE=0 with no ANTHROPIC_API_KEY. Set the key, or leave demo mode on ' +
          'so the canned path is a deliberate choice rather than an accident.',
      )
    }
  }
}
console.log('')

console.log(`  ${dim(pad('CAPABILITY', 12) + pad('STATE', 9) + 'RUNNING ON')}`)
console.log(`  ${dim('-'.repeat(78))}`)

for (const capability of CAPABILITIES) {
  const missing = capability.keys.filter((key) => !present(key))
  const found = capability.keys.filter(present)
  const fullyKeyed = missing.length === 0
  const disabled =
    capability.disableKey !== undefined &&
    ['1', 'true', 'yes', 'on'].includes((process.env[capability.disableKey] ?? '').trim().toLowerCase())
  const demoBlocked = capability.demoGated && AGENT_DEMO_MODE
  const live = fullyKeyed && !demoBlocked && !disabled

  const state = live ? green('LIVE') : amber('SEEDED')
  console.log(
    `  ${pad(capability.name, 12)}${pad(state, stateWidth)}${live ? capability.live : capability.seeded}`,
  )

  if (!live && !demoBlocked) {
    if (disabled) {
      warnings.push(
        `${capability.name}: ${capability.disableKey} is set, so it runs degraded even with a key.`,
      )
    } else if (found.length > 0 && missing.length > 0) {
      failures.push(
        `${capability.name}: partially configured — missing ${missing.join(', ')} ` +
          `(found ${found.join(', ')}). It will silently fall back to: ${capability.seeded}`,
      )
    } else {
      warnings.push(`${capability.name}: not configured — running on ${capability.seeded}`)
    }
  }
}

/* ── The corpus is a filesystem fact, not an env key ────────────────────────
 *
 * Every number on the page and every claim the agent can make comes from
 * data/corpus/*.json (Addendum B, ruling R-5 — lib/facts.ts and
 * content/facts.ts are both deleted). Adding a fake env key so the corpus fit
 * the table above would make demo mode "seed" something that is either on disk
 * or not, which is exactly the kind of lie this screen exists to prevent. So it
 * gets its own probe.
 */
const CORPUS_FILES = [
  'claims.json',
  'concepts.json',
  'skills.json',
  'roles.json',
  'artifacts.json',
  'gaps.json',
  'disputes.json',
  'retractions.json',
  'meta.json',
]
console.log('')
console.log(`  ${dim(pad('EVIDENCE', 12) + pad('STATE', 9) + 'THE ONE SOURCE OF TRUTH FOR NUMBERS')}`)
console.log(`  ${dim('-'.repeat(78))}`)
{
  const dir = path.join(process.cwd(), 'data', 'corpus')
  if (!existsSync(dir)) {
    console.log(`  ${pad('corpus', 12)}${pad(amber('ABSENT'), stateWidth)}data/corpus/ does not exist yet`)
    warnings.push('corpus: data/corpus/ is absent. `npm run verify:corpus` is the gate that owns it.')
  } else {
    const have = new Set(readdirSync(dir))
    const missing = CORPUS_FILES.filter((f) => !have.has(f))
    const state = missing.length === 0 ? green('OK') : amber('PARTIAL')
    console.log(
      `  ${pad('corpus', 12)}${pad(state, stateWidth)}` +
        (missing.length === 0
          ? `all ${CORPUS_FILES.length} files present — run \`npm run verify:corpus\` for the content gates`
          : `missing ${missing.join(', ')}`),
    )
    if (missing.length > 0) warnings.push(`corpus: missing ${missing.join(', ')}`)
  }

  const canned = path.join(process.cwd(), 'data', 'corpus', 'canned')
  const cannedCount = existsSync(canned) ? readdirSync(canned).filter((f) => f.endsWith('.json')).length : 0
  const cannedOk = cannedCount >= 4
  console.log(
    `  ${pad('canned', 12)}${pad(cannedOk ? green('OK') : red('MISSING'), stateWidth)}` +
      (cannedOk
        ? `${cannedCount} pre-built briefs — the degraded path has something honest to serve`
        : `${cannedCount}/4 role briefs. With AGENT_DEMO_MODE on this is what visitors GET. \`npm run build:canned\``),
  )
  if (!cannedOk && AGENT_DEMO_MODE) {
    warnings.push(
      'canned: fewer than 4 pre-built briefs while AGENT_DEMO_MODE is on — the demo path has ' +
        'nothing to serve. Run `npm run build:canned`.',
    )
  }
}

console.log('')

if (warnings.length > 0) {
  console.log(`  ${amber('Running on canned data:')}`)
  for (const warning of warnings) console.log(`    - ${warning}`)
  console.log('')
}

if (failures.length > 0) {
  console.log(`  ${red('BLOCKING:')}`)
  for (const failure of failures) console.log(`    - ${failure}`)
  console.log('')
  console.log('  Set the missing keys, or unset the partial ones so the fallback is deliberate.')
  console.log('')
  // `process.exitCode`, never `process.exit()`. See the note at the tail of
  // this file: exiting hard while stdout writes are still queued to a PIPE is
  // what made `npm run verify` die with SIGSEGV on roughly one run in four.
  process.exitCode = 1
  failed = true
}

if (!failed) {
  if (AGENT_DEMO_MODE) {
    console.log(`  ${green('OK')} — demo mode. A fresh clone with no .env.local is expected to look like this.`)
  } else {
    console.log(`  ${green('OK')} — no half-configured capabilities.`)
    if (warnings.length > 0) {
      console.log('  Capabilities above are deliberately seeded; confirm that is what you intend to deploy.')
    }
  }
  console.log('')
}

/**
 * NO `process.exit()` IN THIS FILE. It is deliberate and it is load-bearing.
 *
 * MEASURED 2026-09-02, node v24.7.0 / npm 11.5.1 on darwin: this script ends
 * with several hundred bytes still queued on stdout. Run from a TTY that queue
 * drains synchronously and `process.exit(0)` is harmless — which is why
 * `node scripts/check-env.mjs` never once failed in 3 consecutive runs. Run
 * under `npm run`, stdout is a PIPE, the writes are asynchronous, and tearing
 * the process down on top of them crashed it: `npm run check:env` exited 139
 * (SIGSEGV) on 2 of 3 and then 1 of 6 attempts, and `npm run verify` — where
 * this is the FIRST step — inherited the crash and died before it reached a
 * single content gate.
 *
 * That is the worst possible failure shape for a gate: intermittent, silent
 * about its cause, and indistinguishable from the check having genuinely
 * failed. Setting `process.exitCode` lets node finish flushing and exit on its
 * own with the code we asked for.
 */
