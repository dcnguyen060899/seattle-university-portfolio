#!/usr/bin/env node
/**
 * corpus-refresh-fischer.mjs — re-derive every published barn-owl figure from the
 * lab's own database, and write a dated snapshot into the corpus.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Fischer-lab role is ongoing (brief Addendum A.5): new recordings land, the
 * counts move, and a number that was true in September is not automatically true
 * in December. A portfolio whose entire argument is "every claim is checkable"
 * cannot carry a figure nobody can re-check. So: one command re-runs the queries,
 * writes what it found with today's date, and tells you which published claims no
 * longer match.
 *
 *   node scripts/corpus-refresh-fischer.mjs            # refresh the snapshot
 *   node scripts/corpus-refresh-fischer.mjs --check    # compare only; exit 1 on drift
 *   node scripts/corpus-refresh-fischer.mjs --db PATH  # point at a different copy
 *
 * READ-ONLY, ABSOLUTELY
 * ---------------------
 * The database is the lab's working system of record and lives OUTSIDE this
 * repository. It is opened through a `file:...?mode=ro` URI so SQLite itself
 * refuses a write, and this script issues nothing but SELECTs. If you are ever
 * tempted to add a write here, don't: put it in the lab's own ETL, where it
 * belongs.
 *
 * WHY THIS IS NOT A CI GATE
 * -------------------------
 * CI cannot reach that path. Making the build depend on a file that only exists
 * on one laptop would produce a build that fails for everyone else, and a gate
 * that fails for everyone gets deleted. So the division is:
 *   - THIS script (run locally) is the only thing that talks to the database.
 *   - verify-corpus.mjs check C11 reads the snapshot this script writes and WARNS
 *     when it has aged past the claims' reviewEvery window. It never fails the build.
 * The freshness signal survives; the build stays green on a machine that has never
 * seen the database.
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { resolve, dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CORPUS = join(ROOT, 'data', 'corpus')
const SNAPSHOT = join(CORPUS, 'fischer-snapshot.json')

const DEFAULT_DB =
  '/Users/dcnguyen060899/Downloads/data_manager/database_nerology_design/demo_db/iccl_demo.db'
const DEFAULT_RAW_ARCHIVE =
  "/Users/dcnguyen060899/Downloads/data_manager/database_nerology_design/Brian Fischer's files - all_owl_data"
const DEFAULT_STAGED =
  '/Users/dcnguyen060899/Downloads/data_manager/database_nerology_design/cleaning_raw_files/iccl_staged'

const argv = process.argv.slice(2)
const CHECK_ONLY = argv.includes('--check')
const dbFlag = argv.indexOf('--db')
const DB_PATH = dbFlag !== -1 && argv[dbFlag + 1] ? argv[dbFlag + 1] : DEFAULT_DB

const today = new Date().toISOString().slice(0, 10)

/* ── the queries, written out so the claim and the query sit side by side ───── */

const QUERIES = {
  owls: "SELECT COUNT(*) AS n FROM owl WHERE source_dataset = 'fischer'",
  owlIds:
    "SELECT GROUP_CONCAT(owl_id) AS v FROM (SELECT owl_id FROM owl WHERE source_dataset = 'fischer' ORDER BY owl_id)",
  sessions: 'SELECT COUNT(*) AS n FROM recording_session',
  neurons: 'SELECT COUNT(*) AS n FROM neuron',
  curatedNeurons: 'SELECT COUNT(*) AS n FROM neuron WHERE analyzed_by_brian = 1',
  experiments: 'SELECT COUNT(*) AS n FROM experiment',
  paradigmTypes: 'SELECT COUNT(DISTINCT experiment_type) AS n FROM experiment',
  tuningRows: 'SELECT COUNT(*) AS n FROM tuning_parameters',
  spikeReliabilityRows: 'SELECT COUNT(*) AS n FROM spike_reliability',
  ildConditionRows: 'SELECT COUNT(*) AS n FROM ild_condition_tested',
  tables:
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  views: "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'view'",
}

const GROUPED = {
  paradigms:
    'SELECT experiment_type AS k, COUNT(*) AS n FROM experiment GROUP BY experiment_type ORDER BY n DESC',
  depthSource:
    "SELECT COALESCE(depth_source, 'unrecorded') AS k, COUNT(*) AS n FROM neuron GROUP BY depth_source",
}

/* ── opening the database ───────────────────────────────────────────────────── */

/** Two ways in, both read-only. node:sqlite when the runtime has it, the sqlite3
 *  CLI otherwise. Neither adds an npm dependency, which matters: this script has
 *  to run from a fresh clone with nothing installed. */
async function openReadOnly(path) {
  const uri = `file:${encodeURI(path)}?mode=ro`

  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(uri, { readOnly: true, open: true, enableForeignKeyConstraints: false })
    return {
      via: 'node:sqlite',
      uri,
      all: (sql) => db.prepare(sql).all(),
      close: () => db.close(),
    }
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
      const { execFileSync } = await import('node:child_process')
      try {
        execFileSync('sqlite3', ['-version'], { stdio: 'ignore' })
      } catch {
        throw new Error(
          'Neither node:sqlite nor the sqlite3 CLI is available. Install sqlite3, or run this on Node 22 or newer.'
        )
      }
      return {
        via: 'sqlite3 CLI',
        uri,
        all: (sql) => {
          const out = execFileSync('sqlite3', ['-json', uri, sql], { encoding: 'utf8' }).trim()
          return out ? JSON.parse(out) : []
        },
        close: () => {},
      }
    }
    throw err
  }
}

/* ── counting the raw archive ───────────────────────────────────────────────── */

/** The instrument and analysis formats the ETL actually reads. Deliberately a
 *  closed list: counting every extension in the tree would inflate the number
 *  with .DS_Store, .txt and .py, which is the kind of quiet inflation this whole
 *  corpus exists to prevent. */
const SCIENTIFIC_EXTENSIONS = new Set(['itd', 'iid', 'bf', 'abi', 'gen', 'mat'])

function countFiles(dir) {
  if (!existsSync(dir)) return null
  let total = 0
  const byExt = {}
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(cur, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.isFile()) {
        total += 1
        const ext = extname(e.name).slice(1).toLowerCase()
        if (ext) byExt[ext] = (byExt[ext] || 0) + 1
      }
    }
  }
  return { total, byExt }
}

/* ── comparing against what the corpus currently publishes ──────────────────── */

/** Every published Fischer figure, and where in the snapshot its truth lives.
 *  Adding a Fischer metric to claims.json without adding a row here is caught
 *  by verify-corpus.mjs check C13, so this table cannot silently fall behind. */
const PUBLISHED = [
  { claimId: 'clm:fischer-db-scale', token: '195', path: 'counts.neurons' },
  { claimId: 'clm:fischer-db-scale', token: '7', path: 'counts.owls' },
  { claimId: 'clm:fischer-db-scale', token: '38', path: 'counts.sessions' },
  { claimId: 'clm:fischer-db-scale', token: '1,325', path: 'counts.experiments' },
  { claimId: 'clm:fischer-db-scale', token: '1,265', path: 'counts.tuningRows' },
  { claimId: 'clm:fischer-db-shape', token: '7', path: 'counts.tables' },
  { claimId: 'clm:fischer-db-shape', token: '5', path: 'counts.views' },
  { claimId: 'clm:fischer-curated-subset', token: '77', path: 'counts.curatedNeurons' },
  { claimId: 'clm:fischer-curated-subset', token: '195', path: 'counts.neurons' },
  { claimId: 'clm:fischer-paradigms', token: '1,325', path: 'counts.experiments' },
  { claimId: 'clm:fischer-paradigms', token: '13', path: 'counts.paradigmTypes' },
  { claimId: 'clm:fischer-raw-archive', token: '30,147', path: 'rawArchive.total' },
  { claimId: 'clm:fischer-raw-archive', token: '1,579', path: 'rawArchive.stagedTotal' },
  // "5+ formats" is a floor, not an equality, so it is compared with >= rather
  // than =. Checking it at all is the point: the résumé asserts the number, and
  // the archive is what makes it re-derivable rather than merely restated.
  { claimId: 'clm:fischer-etl-formats', token: '5', path: 'rawArchive.scientificExtensions', atLeast: true },
  { claimId: 'clm:fischer-depth-provenance', token: '195', path: 'counts.neurons' },
  { claimId: 'clm:fischer-depth-provenance', token: '52', path: 'depthSource.header' },
  { claimId: 'clm:fischer-depth-provenance', token: '53', path: 'depthSource.curated_csv' },
]

const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
const denumber = (t) => Number(String(t).replace(/,/g, ''))

function compare(snapshot) {
  const claims = JSON.parse(readFileSync(join(CORPUS, 'claims.json'), 'utf8'))
  const byId = new Map(claims.map((c) => [c.id, c]))
  const drift = []
  for (const row of PUBLISHED) {
    const claim = byId.get(row.claimId)
    if (!claim) {
      drift.push({ ...row, problem: 'claim no longer exists in claims.json' })
      continue
    }
    const live = dig(snapshot, row.path)
    if (live === undefined || live === null) {
      drift.push({ ...row, problem: `snapshot has no value at ${row.path}` })
      continue
    }
    if (row.atLeast) {
      if (Number(live) < denumber(row.token)) {
        drift.push({ ...row, problem: `published "${row.token}+", source now yields only ${live}` })
        continue
      }
    } else if (denumber(row.token) !== Number(live)) {
      drift.push({ ...row, problem: `published ${row.token}, source now says ${live}` })
      continue
    }
    // For an equality row the claim must carry the live value; for a floor row it
    // must carry the floor. Either way the point is the same: the digit the page
    // prints has to be in the claim's own number list, or the C8 gate cannot see it.
    const expect = row.atLeast ? denumber(row.token) : Number(live)
    const carried = (claim.value?.numbers || []).some((n) => denumber(n) === expect)
    if (!carried) {
      drift.push({
        ...row,
        problem: `${row.claimId} does not carry ${expect} in value.numbers`,
      })
    }
  }
  return drift
}

/* ── main ───────────────────────────────────────────────────────────────────── */

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`\nFischer refresh: database not found at\n  ${DB_PATH}\n`)
    console.error(
      'This database lives outside the repository, on the owner\'s machine. That is expected:\n' +
        'CI never runs this script, and check C11 in verify-corpus.mjs only warns when the\n' +
        'committed snapshot is stale. Pass --db PATH if your copy is elsewhere.\n'
    )
    process.exit(2)
  }

  const db = await openReadOnly(DB_PATH)
  console.log(`Fischer refresh — reading ${DB_PATH}`)
  console.log(`  opened READ-ONLY via ${db.via} as ${db.uri}\n`)

  const counts = {}
  let owlIds = null
  try {
    for (const [key, sql] of Object.entries(QUERIES)) {
      const rows = db.all(sql)
      if (key === 'owlIds') owlIds = rows[0]?.v ?? null
      else counts[key] = Number(rows[0]?.n ?? 0)
    }
    var grouped = {}
    for (const [key, sql] of Object.entries(GROUPED)) {
      grouped[key] = Object.fromEntries(db.all(sql).map((r) => [r.k, Number(r.n)]))
    }
  } finally {
    db.close()
  }

  const raw = countFiles(DEFAULT_RAW_ARCHIVE)
  const staged = countFiles(DEFAULT_STAGED)

  const snapshot = {
    generatedAt: today,
    databasePath: DB_PATH,
    databaseMtime: statSync(DB_PATH).mtime.toISOString().slice(0, 10),
    readOnly: true,
    counts,
    paradigms: grouped.paradigms || {},
    depthSource: grouped.depthSource || {},
    rawArchive: {
      total: raw ? raw.total : null,
      byExtension: raw ? raw.byExt : {},
      /** Distinct instrument/analysis formats present, ignoring housekeeping files.
       *  This is what makes the résumé's "5+ proprietary formats" re-derivable. */
      scientificExtensions: raw
        ? Object.keys(raw.byExt).filter((e) => SCIENTIFIC_EXTENSIONS.has(e)).length
        : null,
      stagedTotal: staged ? staged.total : null,
      archivePath: DEFAULT_RAW_ARCHIVE,
      stagedPath: DEFAULT_STAGED,
    },
    note:
      'Written by scripts/corpus-refresh-fischer.mjs. Every number here came from a SELECT against ' +
      'the lab database or from counting files on disk. Re-run the script to refresh it; check C11 ' +
      'in verify-corpus.mjs warns when this snapshot has aged past the claims it backs.',
  }

  console.log('  owls (source_dataset=fischer) ', counts.owls, `  [${owlIds}]`)
  console.log('  recording sessions            ', counts.sessions)
  console.log('  neurons                       ', counts.neurons, `(${counts.curatedNeurons} in the curated set)`)
  console.log('  experiments / passes          ', counts.experiments, `across ${counts.paradigmTypes} paradigm types`)
  console.log('  tuning-parameter rows         ', counts.tuningRows)
  console.log('  tables / views                ', `${counts.tables} / ${counts.views}`)
  console.log('  staged-but-unloaded rows      ', `spike_reliability ${counts.spikeReliabilityRows}, ild_condition_tested ${counts.ildConditionRows}`)
  console.log('  depth provenance              ', JSON.stringify(snapshot.depthSource))
  console.log('  raw archive                   ', raw ? `${raw.total} files` : '(archive not found)')
  console.log('  curated / staged set          ', staged ? `${staged.total} files` : '(staged set not found)')
  console.log()

  const drift = compare(snapshot)
  if (drift.length) {
    console.error('DRIFT — the corpus publishes figures the database no longer returns:\n')
    for (const d of drift) console.error(`  ${d.claimId}  ${d.problem}`)
    console.error(
      '\nFix claims.json (statement, value.display and value.numbers), bump verifiedOn and\n' +
        'lastReviewed on each affected claim, then re-run. Do not edit the snapshot by hand.\n'
    )
  } else {
    console.log('No drift: every published Fischer figure still matches the database.\n')
  }

  if (CHECK_ONLY) {
    if (drift.length) process.exit(1)
    console.log('--check: snapshot not written.')
    return
  }

  writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`Snapshot written to data/corpus/fischer-snapshot.json (generatedAt ${today}).`)
  if (drift.length) process.exit(1)
}

main().catch((err) => {
  console.error('Fischer refresh failed:', err.message)
  process.exit(2)
})
