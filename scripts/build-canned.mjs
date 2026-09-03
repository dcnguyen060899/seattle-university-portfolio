#!/usr/bin/env node
/**
 * npm run build:canned — write the four pre-built role briefs.
 *
 *   node scripts/build-canned.mjs            deterministic; no key, no network, $0
 *   node scripts/build-canned.mjs --live     the real agent, real tool loop, real cost
 *   node scripts/build-canned.mjs --check    exit 1 if a committed file is stale
 *
 * WHY THESE FILES EXIST
 * ---------------------
 * They are what a recruiter sees when they click a role chip — instantly, with
 * no model call — and what every degraded path falls back to. The page's claim
 * about them is specific: built from the same evidence records, through the
 * same fact check. `provenance.composer` records WHICH composer produced each
 * one so the run strip can say the true thing rather than a flattering one, and
 * `provenance.corpusVersion` makes a stale file DETECTABLE: the routes refuse
 * to serve one and compose a fresh brief instead.
 *
 * WHY IT LOADS TYPESCRIPT THROUGH VITE
 * ------------------------------------
 * The composer, the retriever and the fact check are the ones the routes use.
 * Re-implementing them here in plain Node — the pattern the résumé generator
 * uses, because it only needs the corpus JSON — would create a second
 * implementation of the calibration rules, and two implementations of a
 * calibration rule is exactly how a pre-built brief comes to disagree with a
 * live one. So this script runs the real modules through Vite's SSR loader,
 * which resolves TypeScript, extensionless imports and JSON imports the same
 * way the app's bundler does. Vite is already in the tree as the test runner's
 * own dependency; see CONTRACTS in the accompanying report for the request to
 * name it explicitly in devDependencies.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'data', 'corpus', 'canned')

const LIVE = process.argv.includes('--live')
const CHECK = process.argv.includes('--check')

const ROLES = ['research-scientist', 'data-scientist', 'ml-engineer', 'data-engineer']
const PROFILE_FOR_ROLE = {
  'research-scientist': 'rp:research-scientist',
  'data-scientist': 'rp:data-scientist',
  'ml-engineer': 'rp:ml-engineer',
  'data-engineer': 'rp:data-engineer',
}

const isTty = process.stdout.isTTY === true
const ESC = String.fromCharCode(27)
const colour = (code, text) => (isTty ? `${ESC}[${code}m${text}${ESC}[0m` : text)
const green = (t) => colour('32', t)
const red = (t) => colour('31', t)
const dim = (t) => colour('2', t)

async function loadModules() {
  let createServer
  try {
    ;({ createServer } = await import('vite'))
  } catch {
    console.error(
      red('build:canned needs `vite` to load the TypeScript agent modules.') +
        '\n  It normally arrives with the test runner. Run `npm install`, or add vite to devDependencies.',
    )
    process.exit(1)
  }

  const server = await createServer({
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true },
    logLevel: 'error',
    root: ROOT,
  })

  try {
    const degraded = await server.ssrLoadModule('/lib/agent/degraded.ts')
    const corpus = await server.ssrLoadModule('/lib/agent/corpus.ts')
    const postcheck = await server.ssrLoadModule('/lib/agent/postcheck.ts')
    const run = LIVE ? await server.ssrLoadModule('/lib/agent/run.ts') : null
    return { server, degraded, corpus, postcheck, run }
  } catch (err) {
    await server.close()
    throw err
  }
}

/** Everything except the timestamp. A rebuild that changes nothing must not churn git. */
function contentKey(file) {
  const { provenance, ...rest } = file
  const stableProvenance = { ...provenance }
  delete stableProvenance.builtAt
  return JSON.stringify({ ...rest, provenance: stableProvenance })
}

async function buildOne({ role, degraded, corpus, postcheck, run }) {
  const profileId = PROFILE_FOR_ROLE[role]

  if (!LIVE) {
    const checked = degraded.composeDeterministicBrief(profileId)
    if (checked.discard) {
      throw new Error(
        `the deterministic brief for ${role} was discarded by its own fact check (${checked.discard}: ${checked.detail}). ` +
          'That is a corpus problem, not a script problem — the same brief would be refused at runtime.',
      )
    }
    return {
      role,
      profile: profileId,
      provenance: {
        composer: 'deterministic',
        model: null,
        builtAt: new Date().toISOString(),
        corpusVersion: corpus.CORPUS_VERSION,
        corpusSize: corpus.CORPUS_SIZE,
        guardrailTotal: postcheck.guardrailTotal(checked.guardrails),
      },
      brief: checked.brief,
      coverage: checked.coverage,
      guardrails: checked.guardrails,
    }
  }

  // Live: the real agent, the real tool loop, the real fact check.
  const controller = new AbortController()
  let envelope = null
  for await (const ev of run.runBriefEvents({
    requestId: `canned-${role}`,
    role,
    jd: '',
    signal: controller.signal,
  })) {
    if (ev.event === 'brief') envelope = ev.data
  }
  if (!envelope) throw new Error(`no brief was produced for ${role}`)
  if (envelope.degraded) {
    throw new Error(
      `the live run for ${role} degraded (${envelope.reason}). A pre-built brief must not be a ` +
        'recording of a fallback. Check AGENT_DEMO_MODE=0, the key and the balance, then retry.',
    )
  }
  return {
    role,
    profile: profileId,
    provenance: {
      composer: 'live-model',
      model: envelope.telemetry.model,
      builtAt: new Date().toISOString(),
      corpusVersion: corpus.CORPUS_VERSION,
      corpusSize: corpus.CORPUS_SIZE,
      guardrailTotal: postcheck.guardrailTotal(envelope.guardrails),
    },
    brief: envelope.brief,
    coverage: envelope.coverage,
    guardrails: envelope.guardrails,
  }
}

/**
 * The property that makes a pre-built brief worth reading: it must contain at
 * least one verdict that is not `direct`.
 *
 * A brief claiming a perfect match for every requirement of a whole role
 * profile is worthless, and a hiring manager sees through it on sight. If this
 * ever fails, the corpus has started overclaiming and the fix is in the
 * evidence, not here.
 */
function assertHonest(file) {
  const verdicts = file.brief.requirements.map((r) => r.verdict)
  if (!verdicts.some((v) => v !== 'direct')) {
    throw new Error(
      `every requirement in the ${file.role} brief came back as a direct match. A brief that claims a ` +
        'perfect fit for an entire role profile is not credible; check the retrieval floors and the corpus.',
    )
  }
  if (!file.brief.requirements.length) throw new Error(`${file.role} produced no requirements`)
}

async function main() {
  const { server, degraded, corpus, postcheck, run } = await loadModules()
  let failures = 0
  let changed = 0

  try {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

    console.log('')
    console.log(
      `  build:canned  ${dim(LIVE ? 'live model' : 'deterministic, no model')}  corpus ${corpus.CORPUS_VERSION} · ${corpus.CORPUS_SIZE} records`,
    )
    console.log('')

    for (const role of ROLES) {
      const target = join(OUT_DIR, `${role}.json`)
      let file
      try {
        file = await buildOne({ role, degraded, corpus, postcheck, run })
        assertHonest(file)
      } catch (err) {
        failures += 1
        console.log(`  ${red('FAIL')}  ${role}: ${err.message}`)
        continue
      }

      const previous = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : null
      if (previous && contentKey(previous) === contentKey(file)) {
        // Identical apart from the timestamp: keep the old one so a rebuild
        // that changes nothing does not show up as a diff.
        console.log(`  ${dim('same')}  ${role}.json`)
        continue
      }

      if (CHECK) {
        failures += 1
        console.log(
          `  ${red('STALE')} ${role}.json differs from what the corpus produces now. Run \`npm run build:canned\`.`,
        )
        continue
      }

      writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`)
      changed += 1
      const counts = file.coverage
      console.log(
        `  ${green('ok')}    ${role}.json  ` +
          `${counts.direct} direct · ${counts.adjacent} adjacent · ${counts.partial} partial · ${counts.no_evidence} no evidence` +
          `  ${dim(`${file.provenance.guardrailTotal} changed by the check`)}`,
      )
    }
  } finally {
    await server.close()
  }

  console.log('')
  if (failures) {
    console.log(`  ${red(`${failures} problem(s).`)}`)
    process.exit(1)
  }
  console.log(`  ${green('all four pre-built briefs are current.')} ${dim(`${changed} written`)}`)
  console.log('')
}

await main()
