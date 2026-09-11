#!/usr/bin/env node
/**
 * check-resume-pdf.mjs — the one artifact this repository serves but does not
 * generate, and the drift it is prone to.
 *
 * `public/docs/Resume.pdf` is the highest-traffic résumé surface on the domain:
 * it is on a résumé, it is on LinkedIn, and it is the first button in the hero.
 * It is generated OUTSIDE this repository, on the owner's machine, and it lands
 * here by being copied. That copy is a human step, so it is a step that gets
 * forgotten. The failure is silent and expensive: the source says one thing,
 * the file recruiters download says an older thing, and nothing in the build
 * has any opinion about it. This script is that opinion.
 *
 * ── THE SOURCE MOVED ON 2026-09-10 ────────────────────────────────────────
 *
 * It used to be a LaTeX document compiled with latexmk. It is now
 * `ats_version/build_resume.py`, a ReportLab generator that emits one PDF per
 * target role from a single body of content. The owner made that switch for
 * machine readability: an applicant tracking system parses a single-column PDF
 * in a standard face, and that is what this file has to be first. The LaTeX
 * résumé still exists and is still the better-looking document; it is simply no
 * longer what the domain serves, and nothing here reads it any more.
 *
 * ── WHY IT COMPARES TEXT AND NOT BYTES ────────────────────────────────────
 *
 * Both generators stamp a creation time into the file, so two builds of a
 * byte-identical source are never byte-identical PDFs. A checksum comparison
 * would fail every time and would therefore be switched off. What actually
 * matters is the words a reader sees, so that is what is compared: the
 * extracted text of the generator's output against the extracted text of the
 * committed file.
 *
 * ── WHY IT ASSERTS THE PAGE SHAPE ─────────────────────────────────────────
 *
 * Because that is the bug this file was written after. The LaTeX résumé carried
 * a hard page break and a first page full to its last line, so any edit that
 * grew a paragraph by one line pushed a lone bullet onto page 2 and the rest
 * onto page 3. It happened on 2026-09-09 and it is invisible unless somebody
 * opens the PDF. The generator reflows rather than breaking hard, so the same
 * defect now wears different clothes — a third page — and the same assertion
 * catches it. Two pages, with page 2 opening on SKILLS, is the shape.
 *
 * ── THE CI PATH IS "WARN AND PASS", AND THAT IS DELIBERATE ────────────────
 *
 * The generator is not in this repository and CI cannot see it, exactly as CI
 * cannot see the barn-owl database behind check C11. A gate that fails for a
 * reason nobody can fix is a gate that gets deleted, so an absent generator (or
 * an absent `pdftotext`) warns and exits 0. On the owner's machine, where the
 * source IS present, it is a real check with teeth.
 *
 *   node scripts/check-resume-pdf.mjs             check
 *   node scripts/check-resume-pdf.mjs --install   regenerate, verify, copy in
 *   node scripts/check-resume-pdf.mjs --dir PATH  a generator somewhere else
 *
 * `RESUME_ATS_DIR` in the environment does the same job as `--dir`.
 *
 * THE OTHER VARIANT IS NOT SERVED. `build_resume.py` also emits an ML-engineer
 * cut, which differs from this one only in its summary paragraph. The domain
 * has one résumé URL and it carries the data-scientist cut; the other is for
 * applying with, not for publishing.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(ROOT, 'public', 'docs', 'Resume.pdf')

/**
 * The owner's machine, and the only place this file has ever been generated.
 * Named here rather than discovered, for the same reason the Fischer database
 * path is named in corpus-refresh-fischer.mjs: a wrong guess about which résumé
 * is authoritative is worse than no guess at all.
 */
const DEFAULT_DIR = '/Users/dcnguyen060899/Downloads/prep_intern_interview/ats_version'

const argv = process.argv.slice(2)
const INSTALL = argv.includes('--install')
const dirFlag = argv.indexOf('--dir')
const SRC_DIR = resolve(
  dirFlag !== -1 && argv[dirFlag + 1] ? argv[dirFlag + 1] : process.env.RESUME_ATS_DIR || DEFAULT_DIR
)
const GENERATOR = join(SRC_DIR, 'build_resume.py')

/**
 * The served cut, found by PATTERN rather than by name: the generator stamps
 * the month into its filenames, so a name pinned here would go stale the first
 * time the résumé is regenerated in a new month — and silently, because the
 * check would then skip for want of a file rather than fail.
 */
const VARIANT = /^Resume_Duy_Nguyen_Data_Scientist_.*\.pdf$/

/** Page 2 has to open on this. See WHY IT ASSERTS THE PAGE SHAPE above. */
const PAGE_TWO_OPENER = 'SKILLS'
const EXPECTED_PAGES = 2

const problems = []
const notes = []

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...opts })
}

function has(cmd) {
  try {
    run('which', [cmd])
    return true
  } catch {
    return false
  }
}

/** The newest emitted data-scientist cut, or null if the generator never ran. */
function builtVariant() {
  if (!existsSync(SRC_DIR)) return null
  const found = readdirSync(SRC_DIR)
    .filter((f) => VARIANT.test(f))
    .map((f) => ({ path: join(SRC_DIR, f), m: statSync(join(SRC_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  return found.length ? found[0].path : null
}

/** Extracted text, whitespace-normalised so a reflow is not a false positive. */
function textOf(pdf, first = null, last = null) {
  const args = []
  if (first !== null) args.push('-f', String(first), '-l', String(last ?? first))
  args.push(pdf, '-')
  return run('pdftotext', args).replace(/\s+/g, ' ').trim()
}

function pageCount(pdf) {
  const m = /^Pages:\s+(\d+)$/m.exec(run('pdfinfo', [pdf]))
  return m ? Number(m[1]) : null
}

/** The layout trap, as an assertion. Returns a list of problems. */
function checkShape(pdf, label) {
  const found = []
  const pages = pageCount(pdf)
  if (pages !== EXPECTED_PAGES) {
    found.push(
      `${label} is ${pages} pages, expected ${EXPECTED_PAGES}. Something grew: shorten a ` +
        `sentence rather than letting the résumé spill onto a third page.`
    )
    return found
  }
  const opensWith = textOf(pdf, 2).slice(0, PAGE_TWO_OPENER.length)
  if (opensWith !== PAGE_TWO_OPENER) {
    found.push(
      `${label} page 2 opens on ${JSON.stringify(opensWith)}, expected ` +
        `${JSON.stringify(PAGE_TWO_OPENER)} — the page break has moved.`
    )
  }
  return found
}

function report() {
  for (const n of notes) console.log(`  ${n}`)
  if (problems.length === 0) {
    console.log('\nRESUME PDF — OK\n')
    return 0
  }
  console.error('\nRESUME PDF — FAILED\n')
  for (const p of problems) console.error(`  ✗ ${p}\n`)
  console.error(
    '  FIX: `npm run gen:resume:pdf` re-runs the generator, re-checks the page shape,\n' +
      '  and copies the data-scientist cut over public/docs/Resume.pdf.\n'
  )
  return 1
}

function warnAndPass(why) {
  console.log(`\nRESUME PDF — SKIPPED\n\n  ${why}\n`)
  console.log(
    "  The generator lives outside this repository, on the owner's machine, so CI\n" +
      '  cannot see it. That is expected and this check warns rather than failing.\n'
  )
  process.exit(0)
}

/* ── main ─────────────────────────────────────────────────────────────────── */

if (!existsSync(TARGET)) {
  console.error(`\nRESUME PDF — FAILED\n\n  ✗ ${TARGET} is missing. It is a live URL on a résumé.\n`)
  process.exit(1)
}

if (!has('pdftotext') || !has('pdfinfo')) {
  warnAndPass('`pdftotext`/`pdfinfo` are not on PATH (install poppler-utils).')
}

if (!existsSync(GENERATOR)) {
  warnAndPass(`No résumé generator at ${GENERATOR}.`)
}

if (INSTALL) {
  if (!has('python3')) {
    console.error('\nRESUME PDF — FAILED\n\n  ✗ `python3` is not on PATH; cannot run the generator.\n')
    process.exit(1)
  }
  console.log(`\nRESUME PDF — running ${GENERATOR}\n`)
  try {
    run('python3', [GENERATOR], { cwd: SRC_DIR, stdio: 'pipe' })
  } catch (err) {
    console.error('\nRESUME PDF — FAILED\n\n  ✗ the generator did not complete:\n')
    console.error(String(err.stderr ?? err.stdout ?? err.message).trim().split('\n').slice(-6).join('\n'))
    process.exit(1)
  }
  const rebuilt = builtVariant()
  if (rebuilt === null) {
    console.error(
      `\nRESUME PDF — FAILED\n\n  ✗ the generator ran but emitted nothing matching ${VARIANT}\n    in ${SRC_DIR}\n`
    )
    process.exit(1)
  }
  // The shape is checked BEFORE the copy: a three-page résumé must never reach
  // public/docs, because the next thing that happens to it is a deploy.
  const shape = checkShape(rebuilt, 'the regenerated résumé')
  if (shape.length) {
    problems.push(...shape, 'Nothing was copied — the build is still at the source, uninstalled.')
    process.exit(report())
  }
  const before = statSync(TARGET).size
  copyFileSync(rebuilt, TARGET)
  notes.push(`installed ${rebuilt}`)
  notes.push(`${before} → ${statSync(TARGET).size} bytes, ${EXPECTED_PAGES} pages`)
  notes.push('run `node scripts/verify-corpus.mjs --built` to re-scan its text for retracted claims')
  process.exit(report())
}

/* check mode */

const BUILT = builtVariant()

if (BUILT === null) {
  warnAndPass(`The generator has never been run: nothing matching ${VARIANT} in ${SRC_DIR}.`)
}

if (statSync(GENERATOR).mtimeMs > statSync(BUILT).mtimeMs) {
  problems.push(
    `${GENERATOR} is newer than the PDF it emits. The generator was edited and not re-run, ` +
      `so everything below is comparing against a stale build.`
  )
}

problems.push(...checkShape(TARGET, 'public/docs/Resume.pdf'))

if (textOf(BUILT) !== textOf(TARGET)) {
  problems.push(
    'public/docs/Resume.pdf does not carry the same text as the generator output at\n' +
      `    ${BUILT}\n` +
      '    The file recruiters download is behind the source.'
  )
} else {
  notes.push(`text matches ${BUILT}`)
  notes.push(`${EXPECTED_PAGES} pages, page 2 opens on "${PAGE_TWO_OPENER}"`)
}

process.exit(report())
