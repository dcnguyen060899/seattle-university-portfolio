#!/usr/bin/env node
/**
 * gen-resume.mjs — generate public/docs/resume_content.html from the corpus.
 *
 *   node scripts/gen-resume.mjs           write the file
 *   node scripts/gen-resume.mjs --check   exit 1 if the committed file is stale
 *
 * WHY GENERATE IT AT ALL
 * ----------------------
 * That URL is on LinkedIn and on a printed résumé, so it has to keep resolving.
 * The version committed before this rebuild carried three things the corpus now
 * retracts: a start date for the research assistantship that predates enrolment by
 * a year, a usage denomination of a client's website traffic, and an accuracy
 * figure that turned out to be a third-party industry statistic about other
 * organisations. Hand-editing it would fix those three and leave the next three to
 * chance. Generating it means the résumé a recruiter opens from LinkedIn cannot
 * contradict the page, because neither of them holds a fact: both read the corpus.
 *
 * The committed output embeds the corpus hash, so a stale file is DETECTABLE
 * rather than merely likely — `--check` in CI is what turns that into a gate.
 *
 * NOT GENERATED, AND THIS MATTERS: public/docs/Resume.pdf.
 * That is the file recruiters actually download, and as committed it still says
 * "Winter 2025 – Present" and closes the barn-owl role in July 2026. This script
 * cannot fix it. What the corpus does instead is run the retraction scan over the
 * PDF's extracted text (verify-corpus.mjs --built, check C9), so the problem
 * fails a build rather than sitting quietly on the highest-traffic résumé surface
 * on the domain. The accompanying report proposes how to close it properly.
 */

import { readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import * as nodeChildProcess from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CORPUS = join(ROOT, 'data', 'corpus')
const OUT = join(ROOT, 'public', 'docs', 'resume_content.html')

const CHECK = process.argv.includes('--check')
const PDF = process.argv.includes('--pdf')

/** Synchronous sleep, so the PDF poll loop below needs no async plumbing. */
const execFileSyncSleep = (ms) => {
  const until = Date.now() + ms
  while (Date.now() < until) { /* spin briefly */ }
}

const read = (f) => JSON.parse(readFileSync(join(CORPUS, f), 'utf8'))

const claims = read('claims.json')
const roles = read('roles.json')
const orgs = read('orgs.json')
const people = read('people.json')
const skills = read('skills.json')
const retractions = read('retractions.json')
const meta = read('meta.json')

const claimById = new Map(claims.map((c) => [c.id, c]))
const roleById = new Map(roles.map((r) => [r.id, r]))
const orgById = new Map(orgs.map((o) => [o.id, o]))
const personById = new Map(people.map((p) => [p.id, p]))

/* ── the licence gate, again, because a generator is a surface ─────────────── */

const SURFACE = 'resume'

function licensed(id) {
  const c = claimById.get(id)
  if (!c) throw new Error(`gen-resume: unknown claim ${id}`)
  if (!c.asserted) throw new Error(`gen-resume: ${id} is asserted:false and must not be rendered`)
  if (!c.surfaces.includes(SURFACE)) {
    throw new Error(`gen-resume: ${id} is not licensed for the résumé (licensed: ${c.surfaces.join(', ')})`)
  }
  return c
}

/** Claims for a role, licensed for the résumé, in corpus order, caveats last. */
function bulletsFor(roleId) {
  const own = claims.filter(
    (c) => c.subject === roleId && c.asserted && c.surfaces.includes(SURFACE)
  )
  const main = own.filter((c) => c.kind !== 'caveat')
  const caveatIds = new Set()
  for (const c of main) for (const id of c.caveats ?? []) caveatIds.add(id)
  // Every mandatory caveat travels with its claim, whether or not it happens to
  // hang off the same subject. This is the whole point of the caveats array.
  const caveats = [...caveatIds]
    .map((id) => claimById.get(id))
    .filter((c) => c && c.surfaces.includes(SURFACE))
  return { main, caveats }
}

/* ── formatting ────────────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const QUARTER = ['Winter', 'Winter', 'Winter', 'Spring', 'Spring', 'Spring',
  'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn']

function formatPeriod(period, { expected = false } = {}) {
  if (!period) return ''
  const one = (iso) => {
    if (!iso) return ''
    const [y, m] = iso.split('-')
    if (!m) return y
    const idx = Number(m) - 1
    if (period.precision === 'year') return y
    if (period.precision === 'quarter') return `${QUARTER[idx]} ${y}`
    return `${MONTHS[idx]} ${y}`
  }
  const start = one(period.start)
  // A null end renders as "Present", never as a guessed date. Two of the
  // positions here are ongoing, and a résumé that closes them is wrong in the
  // direction that costs an interview.
  const end = period.end === null ? 'Present' : `${expected ? 'Expected ' : ''}${one(period.end)}`
  if (!start) return end
  if (start === end) return start
  return `${start} &ndash; ${end}`
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/—/g, '&mdash;')
    .replace(/–/g, '&ndash;')
    .replace(/\u2019/g, '&rsquo;')
    .replace(/\u2018/g, '&lsquo;')
    .replace(/\u201C/g, '&ldquo;')
    .replace(/\u201D/g, '&rdquo;')

const li = (text) => `                    <li>${esc(text)}</li>`

function entry({ title, date, subtitle, location, bullets }) {
  const parts = [
    '            <div class="entry">',
    '                <div class="entry-header">',
    `                    <span class="entry-title">${esc(title)}</span>`,
    `                    <span class="entry-date">${date}</span>`,
    '                </div>',
  ]
  if (subtitle || location) {
    parts.push(
      '                <div class="entry-subtitle">',
      `                    <span>${esc(subtitle ?? '')}</span>`,
      `                    <span class="entry-location">${esc(location ?? '')}</span>`,
      '                </div>'
    )
  }
  if (bullets.length) {
    parts.push('                <ul class="bullets">', ...bullets.map(li), '                </ul>')
  }
  parts.push('            </div>')
  return parts.join('\n')
}

function section(title, body) {
  return [
    '        <section class="section">',
    `            <h2 class="section-title">${esc(title)}</h2>`,
    body,
    '        </section>',
  ].join('\n')
}

/* ── the document ──────────────────────────────────────────────────────────── */

const STYLE = `:root {
    --seattle-red: #AA0000;
    --text-dark: #333333;
    --text-gray: #666666;
    --border-gray: #cccccc;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 11pt;
    line-height: 1.4;
    color: var(--text-dark);
    background: #f5f5f5;
    padding: 20px;
}

.resume-container {
    max-width: 8.5in;
    margin: 0 auto;
    background: white;
    padding: 0.6in 0.7in;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.resume-header { text-align: center; margin-bottom: 15px; }

.resume-header h1 {
    font-size: 28pt;
    color: var(--seattle-red);
    font-weight: normal;
    margin-bottom: 8px;
    letter-spacing: 1px;
}

.contact-line { font-size: 10pt; color: var(--text-dark); }
.contact-line a { color: var(--text-dark); text-decoration: underline; }
.contact-line a:hover { color: var(--seattle-red); }

.section { margin-bottom: 12px; }

.section-title {
    font-size: 11pt;
    font-weight: normal;
    color: var(--seattle-red);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    border-bottom: 1px solid var(--seattle-red);
    padding-bottom: 3px;
    margin-bottom: 10px;
    font-variant: small-caps;
}

.entry { margin-bottom: 10px; }

.entry-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 2px;
}

.entry-title {
    font-weight: bold;
    color: var(--seattle-red);
    font-size: 11pt;
    text-decoration: none;
}

.entry-date {
    font-style: italic;
    color: var(--text-dark);
    font-size: 10pt;
    white-space: nowrap;
}

.entry-subtitle {
    display: flex;
    justify-content: space-between;
    font-style: italic;
    color: var(--text-dark);
    font-size: 10pt;
    margin-bottom: 4px;
}

.entry-location { font-style: italic; }

.bullets { padding-left: 18px; margin-top: 4px; }
.bullets li { margin-bottom: 3px; text-align: justify; font-size: 10.5pt; }

.skills-content { font-size: 10.5pt; }
.skills-content p { margin-bottom: 4px; }
.skill-category { font-weight: bold; }

.provenance {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px solid var(--border-gray);
    font-size: 8.5pt;
    color: var(--text-gray);
}

@media print {
    body { background: white; padding: 0; }
    .resume-container { box-shadow: none; padding: 0.5in; }
    .provenance { display: none; }
}

@media (max-width: 768px) {
    body { padding: 10px; }
    .resume-container { padding: 0.4in 0.3in; }
    .entry-header, .entry-subtitle { flex-direction: column; }
    .entry-date, .entry-location { margin-top: 2px; }
}`

function build() {
  const out = []

  out.push('<!DOCTYPE html>')
  out.push('<html lang="en">')
  out.push('<head>')
  out.push('    <meta charset="UTF-8">')
  out.push('    <meta name="viewport" content="width=device-width, initial-scale=1.0">')
  out.push('    <title>Resume - Duy Nguyen</title>')
  out.push('    <!--')
  out.push('      GENERATED FILE — do not hand-edit.')
  out.push('      Source: data/corpus/*.json · Generator: scripts/gen-resume.mjs')
  out.push(`      corpusHash: ${meta.corpusHash}`)
  out.push('      Regenerate with `node scripts/gen-resume.mjs`. CI runs')
  out.push('      `node scripts/gen-resume.mjs --check` and fails when this file is stale,')
  out.push('      which is what stops the résumé and the site from disagreeing.')
  out.push('    -->')
  out.push('    <style>')
  out.push(STYLE.split('\n').map((l) => (l ? `        ${l}` : '')).join('\n'))
  out.push('    </style>')
  out.push('</head>')
  out.push('<body>')
  out.push('    <div class="resume-container">')

  /* header */
  out.push('        <header class="resume-header">')
  out.push('            <h1>Duy Nguyen</h1>')
  out.push('            <p class="contact-line">')
  out.push('                <a href="mailto:dnguyen44@seattleu.edu">dnguyen44@seattleu.edu</a> |')
  out.push('                <a href="https://www.linkedin.com/in/duwe-ng/" target="_blank" rel="noopener">LinkedIn</a> |')
  out.push('                <a href="https://github.com/dcnguyen060899" target="_blank" rel="noopener">GitHub</a> |')
  // Deliberately "/" and not index_portfolio.html: that page is deleted in this
  // rebuild, and a résumé that links to a 404 is worse than one that links home.
  out.push('                <a href="/">Portfolio</a> |')
  out.push('                Seattle, WA')
  out.push('            </p>')
  out.push('        </header>')

  /* summary */
  out.push(
    section(
      'Summary',
      [
        '            <div class="skills-content">',
        `                <p>${esc(licensed('clm:identity-name').statement)} ${esc(licensed('clm:yang-role').statement)} ${esc(licensed('clm:resume-reporting-note').statement)}</p>`,
        '            </div>',
      ].join('\n')
    )
  )

  /* education */
  {
    const msds = roleById.get('rol:msds')
    const entries = [
      entry({
        title: 'M.S. in Data Science',
        date: formatPeriod(msds.period, { expected: true }),
        subtitle: orgById.get(msds.orgId).name,
        location: 'Seattle, WA',
        bullets: [
          `${licensed('clm:msds-gpa').short} — ${licensed('clm:msds-honor-roll').statement}`,
          licensed('clm:msds-structure').statement,
        ],
      }),
      entry({
        title: 'Certificate, Machine Learning & AI',
        date: 'Jul 2024',
        subtitle: orgById.get('org:uc-berkeley').name,
        location: 'Online',
        bullets: [],
      }),
      entry({
        title: 'B.A. in Economics, Data Analysis Concentration',
        date: 'May 2023',
        subtitle: orgById.get('org:sfu').name,
        location: 'Burnaby, BC, Canada',
        bullets: [],
      }),
    ]
    out.push(section('Education', entries.join('\n')))
  }

  /* experience — research first, in narrative-weight order */
  {
    const order = ['rol:yang-gra', 'rol:fischer-rde', 'rol:mavterras-eng']
    const entries = order.map((roleId) => {
      const role = roleById.get(roleId)
      const { main, caveats } = bulletsFor(roleId)
      const advisors = (role.advisorIds ?? []).map((id) => personById.get(id).name)
      const subtitle = [orgById.get(role.orgId).name, advisors.length ? `Advisor: ${advisors[0]}` : null]
        .filter(Boolean)
        .join(' | ')
      return entry({
        title: role.title,
        date: formatPeriod(role.period),
        subtitle,
        location: role.commitment === 'full-time' ? 'Full-time' : '',
        bullets: [...main.map((c) => c.statement), ...caveats.map((c) => c.statement)],
      })
    })
    out.push(section('Experience', entries.join('\n')))
  }

  /* honours and projects */
  {
    const entries = [
      entry({
        title: licensed('clm:cause-win').short,
        date: '2026',
        subtitle: orgById.get('org:cause').name,
        location: '',
        bullets: [
          licensed('clm:cause-story').statement,
          licensed('clm:cause-build').statement,
          licensed('clm:cause-ces-model').statement,
          licensed('clm:cause-blind-judging') && claimById.get('clm:cause-blind-judging').surfaces.includes(SURFACE)
            ? claimById.get('clm:cause-blind-judging').statement
            : null,
        ].filter(Boolean),
      }),
      entry({
        title: 'CPSC 5330 Big Data Analytics',
        date: formatPeriod(claimById.get('clm:cpsc5330-enrolled').period),
        subtitle: orgById.get('org:seattle-u').name,
        location: '',
        bullets: [
          licensed('clm:cpsc5330-enrolled').statement,
          licensed('clm:cpsc5330-caveat').statement,
        ],
      }),
    ]
    out.push(section('Honors & Projects', entries.join('\n')))
  }

  /* earlier experience */
  {
    const order = ['rol:blueprint', 'rol:faisal-lab']
    const entries = order.map((roleId) => {
      const role = roleById.get(roleId)
      const { main, caveats } = bulletsFor(roleId)
      return entry({
        title: role.title,
        date: formatPeriod(role.period),
        subtitle: orgById.get(role.orgId).name,
        location: '',
        bullets: [...main.map((c) => c.statement), ...caveats.map((c) => c.statement)],
      })
    })
    out.push(section('Earlier Experience', entries.join('\n')))
  }

  /* skills — from skills.json, which cannot list a tool with no claim behind it */
  {
    const families = [
      ['language', 'Programming'],
      ['ml', 'ML / AI'],
      ['data', 'Data'],
      ['infra', 'Infrastructure'],
      ['frontend', 'Front-end'],
      ['practice', 'Practice'],
    ]
    const lines = families
      .map(([family, label]) => {
        const items = skills.filter((s) => s.family === family).map((s) => s.label)
        if (!items.length) return null
        return `                <p><span class="skill-category">${esc(label)}:</span> ${esc(items.join(', '))}</p>`
      })
      .filter(Boolean)
    out.push(
      section(
        'Skills',
        ['            <div class="skills-content">', ...lines, '            </div>'].join('\n')
      )
    )
  }

  /* provenance — the page's own argument, applied to itself */
  // The corpus talking about itself. Marked so the numeric gate skips it — these
  // digits are corpus metadata, not claims about Duy, and they change on every
  // edit. The retraction gate still reads it.
  out.push('        <!-- corpus:no-scan -->')
  out.push('        <p class="provenance">')
  out.push(
    `            Every figure on this résumé is generated from a committed evidence corpus ` +
      `(${meta.counts.claims} claims, ${meta.counts.sources} sources), each carrying the file or ` +
      `URL that verifies it. Corpus ${esc(meta.corpusHash)}, generated ${esc(meta.generatedAt)}. ` +
      `${meta.counts.retractions} superseded claims are recorded and scanned for on every build ` +
      `so they cannot reappear.`
  )
  out.push('        </p>')
  out.push('        <!-- /corpus:no-scan -->')

  out.push('    </div>')
  out.push('</body>')
  out.push('</html>')

  return out.join('\n') + '\n'
}

/* ── run ───────────────────────────────────────────────────────────────────── */

let html
try {
  html = build()
} catch (err) {
  console.error(`gen-resume failed: ${err.message}`)
  process.exit(1)
}

// A generator that can emit a retracted phrase is a generator that will. Check
// its own output before it reaches disk, using the same records as the build gate.
for (const r of retractions) {
  const patterns = [
    ...r.forbiddenPhrases.map((p) => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')),
    ...(r.forbiddenPatterns ?? []).map((p) => new RegExp(p.source, p.flags || 'i')),
  ]
  for (const re of patterns) {
    const hit = re.exec(html)
    if (hit) {
      console.error(
        `gen-resume: refusing to write — output contains retracted content "${hit[0]}" (${r.id}).`
      )
      process.exit(1)
    }
  }
}

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error('gen-resume --check: public/docs/resume_content.html does not exist. Run `node scripts/gen-resume.mjs`.')
    process.exit(1)
  }
  const committed = readFileSync(OUT, 'utf8')
  if (committed !== html) {
    const a = committed.split('\n')
    const b = html.split('\n')
    let line = 0
    while (line < Math.max(a.length, b.length) && a[line] === b[line]) line += 1
    console.error('gen-resume --check: public/docs/resume_content.html is STALE.\n')
    console.error(`  first difference at line ${line + 1}`)
    console.error(`    committed: ${(a[line] ?? '(end of file)').trim().slice(0, 120)}`)
    console.error(`    generated: ${(b[line] ?? '(end of file)').trim().slice(0, 120)}`)
    console.error('\n  Run `node scripts/gen-resume.mjs` and commit the result.')
    console.error('  Do not edit that file by hand: the corpus is the source, and a hand-edit is')
    console.error('  a fact that exists in exactly one place, which is the defect this replaced.\n')
    process.exit(1)
  }
  console.log('gen-resume --check: public/docs/resume_content.html is current.')
} else {
  writeFileSync(OUT, html)
  console.log(`gen-resume: wrote public/docs/resume_content.html (${html.length} bytes, corpus ${meta.corpusHash}).`)
  if (PDF) renderPdf()
}

/**
 * NO `process.exit(0)` ON THE SUCCESS PATH, DELIBERATELY.
 *
 * Measured 2026-09-02 (node v24.7.0 / npm 11.5.1, darwin): under `npm run`,
 * stdout is a PIPE and its writes are asynchronous. Exiting hard on top of a
 * just-printed line intermittently crashed the process — `npm run verify`
 * exited 139 (SIGSEGV) with no diagnostic, on runs where every gate had
 * actually PASSED. `--check` therefore falls off the end of the script with
 * exit code 0 rather than forcing it, and the `else` above is what keeps a
 * `--check` run from writing the file it was only supposed to compare.
 */

/**
 * Render the generated HTML to a PDF through headless Chrome.
 *
 * This is the second half of closing the loop on the résumé: the HTML is already
 * generated from the corpus, and the PDF is the file recruiters actually download.
 * As committed, that PDF still carries a start date the corpus retracts, which is
 * why `verify-corpus.mjs --built` extracts its text and scans it — the defect
 * fails a build instead of sitting quietly on a résumé domain.
 *
 * NOT run by default, and that is deliberate. Overwriting public/docs/Resume.pdf
 * changes a file the migration's URL harness asserts a byte size for, so the two
 * have to land together. Run it explicitly once that assertion is updated:
 *
 *   node scripts/gen-resume.mjs --pdf
 *   node scripts/gen-resume.mjs --pdf --pdf-out /tmp/preview.pdf   (dry run)
 */
function renderPdf() {
  const outFlag = process.argv.indexOf('--pdf-out')
  const target = outFlag !== -1 && process.argv[outFlag + 1]
    ? resolve(process.argv[outFlag + 1])
    : join(ROOT, 'public', 'docs', 'Resume.pdf')

  const CANDIDATES = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  const chrome = CANDIDATES.find((p) => existsSync(p))
  if (!chrome) {
    console.error(
      'gen-resume --pdf: no headless Chrome found. Set CHROME_PATH, or install Chrome/Chromium.\n' +
        '  Without it the PDF stays hand-maintained, and verify-corpus.mjs --built keeps scanning\n' +
        '  its extracted text so a stale figure fails the build rather than shipping quietly.'
    )
    process.exit(1)
  }

  const { spawn } = nodeChildProcess
  const profile = join(tmpdir(), `gen-resume-profile-${process.pid}`)
  if (existsSync(target)) rmSync(target)

  const child = spawn(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=4000',
      '--no-pdf-header-footer',
      `--print-to-pdf=${target}`,
      `file://${OUT}`,
    ],
    { stdio: 'ignore', detached: false }
  )

  // Chrome writes the file and then, in some sandboxed environments, declines to
  // exit. Waiting on the process would hang on a job that already succeeded, so
  // wait on the ARTIFACT instead: poll until it exists and has stopped growing,
  // then stop the browser. Fail only if nothing appears inside the budget.
  const deadline = Date.now() + 90000
  let lastSize = -1
  let stableFor = 0
  let done = false
  while (Date.now() < deadline) {
    execFileSyncSleep(400)
    if (child.exitCode !== null) {
      done = existsSync(target)
      break
    }
    if (!existsSync(target)) continue
    const size = statSync(target).size
    if (size > 0 && size === lastSize) {
      stableFor += 1
      if (stableFor >= 3) {
        done = true
        break
      }
    } else {
      stableFor = 0
    }
    lastSize = size
  }
  try {
    child.kill('SIGKILL')
  } catch {
    /* already gone */
  }
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* best effort */
  }

  if (!done || !existsSync(target)) {
    console.error('gen-resume --pdf: Chrome produced no PDF inside the time budget.')
    process.exit(1)
  }
  console.log(`gen-resume --pdf: wrote ${target} via ${chrome.split('/').pop()}.`)
  console.log(
    '  Now run `node scripts/verify-corpus.mjs --built` to confirm the PDF passes the\n' +
      '  retraction scan, and update any byte-size assertion the URL harness holds for it.'
  )
}
