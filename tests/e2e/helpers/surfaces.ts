import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * The served surface inventory, DERIVED rather than typed out.
 *
 * Every list in this file is computed from the tree at run time. A hand-written
 * list of legacy URLs is a list that goes stale the first time somebody adds a
 * file, and the whole reason these URLs are tested is that they are on a résumé
 * and on LinkedIn — the failure mode is silent.
 *
 * `scripts/verify-urls.sh` does the same job from `git ls-files` at the shell
 * level. This derives from DISK, which is strictly wider: a file that is
 * untracked but present is still deployed by Vercel and still served by
 * `next start`, and it would be invisible to a git-index walk.
 */

const ROOT = process.cwd()
const PUBLIC_DOCS = join(ROOT, 'public', 'docs')

function walk(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** Every file under `public/docs`, as the URL path it is served at. */
export function legacyFileUrls(): string[] {
  return walk(PUBLIC_DOCS)
    .map((file) => `/docs/${relative(PUBLIC_DOCS, file).split(sep).join('/')}`)
    .sort()
}

/** Just the HTML pages: `/docs/news.html`, … */
export function legacyHtmlUrls(): string[] {
  return legacyFileUrls().filter((url) => url.endsWith('.html'))
}

/**
 * The Jekyll clean-URL parity set: `/docs/news` as well as `/docs/news.html`.
 *
 * GitHub Pages answers BOTH today. Next.js answers only the first, which is why
 * `next.config.ts` carries a `fallback` rewrite with an explicit allow-list.
 * Every one of these is a live 200 on the current site; dropping one breaks a
 * URL somebody has already published.
 */
export function legacyCleanUrls(): string[] {
  return legacyHtmlUrls().map((url) => url.replace(/\.html$/, ''))
}

/**
 * `FROZEN_PAGES` as written in `next.config.ts`, parsed out of the source.
 *
 * Read from the config rather than imported, because importing a Next config in
 * a Playwright worker drags the whole `next` module graph in for one array. The
 * parse is anchored on the exact declaration so a rename fails loudly here
 * rather than silently returning `[]` and making the cross-check vacuous.
 */
export function frozenPagesFromConfig(): string[] {
  const source = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
  const match = /const FROZEN_PAGES = \[([\s\S]*?)\] as const/.exec(source)
  if (!match?.[1]) {
    throw new Error(
      'Could not find `const FROZEN_PAGES = [...] as const` in next.config.ts. ' +
        'That array is the clean-URL allow-list; if it was renamed, this parser and ' +
        'scripts/verify-urls.sh both need updating — do not delete the assertion.',
    )
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1] as string)
}

/**
 * The three pages Addendum B ruling R-4 DELETES, with the redirect each keeps.
 *
 * The status codes are not interchangeable and are not guesses. `next.config.ts`
 * documents the measurement: `permanent: true` emits **308**, not 301, on
 * next@16.3.4 — so `index_portfolio` is 308 and the other two, which R-4
 * specifies as literal 301s, use `statusCode: 301` explicitly. A test that
 * accepted "any 3xx" would not notice the config silently swapping them.
 */
export const DELETED_PAGE_REDIRECTS = [
  { from: '/docs/index_portfolio.html', to: '/', status: 308 },
  { from: '/docs/index_portfolio', to: '/', status: 308 },
  { from: '/docs/index_gpa_analysis.html', to: '/', status: 301 },
  { from: '/docs/index_gpa_analysis', to: '/', status: 301 },
  { from: '/docs/index_independent_research.html', to: '/#research', status: 301 },
  { from: '/docs/index_independent_research', to: '/#research', status: 301 },
] as const

/**
 * The old repo root. `index.html` was a 530-byte `<meta refresh>` to
 * `docs/index_portfolio.html`; `/index` existed because Jekyll served clean URLs.
 */
export const ROOT_REDIRECTS = [
  { from: '/index.html', to: '/', status: 308 },
  { from: '/index', to: '/', status: 308 },
] as const

/**
 * 🔴 PRIVACY, NOT ROUTING.
 *
 * `public/docs/.claude/agent-memory/psb-polish/` held three private working
 * files. Jekyll silently excludes dot-directories, so they are 404 on GitHub
 * Pages today. NEXT.JS DOES NOT — measured on next@16.3.4, a file at
 * `public/docs/.claude/…/MEMORY.md` is served with 200 and its full contents.
 * A plain `git mv docs public/docs` therefore PUBLISHES them, on the site whose
 * entire purpose is controlling what a recruiter sees.
 *
 * Three independent guards exist: the files were moved to the repo root, a
 * `beforeFiles` rewrite in next.config.ts points the path at a non-route, and
 * `.vercelignore` keeps the directory out of the deployment. This list asserts
 * the OUTCOME at the HTTP layer, which is the only check that stays true if
 * somebody restores the directory and only two of the three guards are in place.
 */
export const PRIVATE_PATHS = [
  '/docs/.claude/agent-memory/psb-polish/MEMORY.md',
  '/docs/.claude/agent-memory/psb-polish/user_career_thesis.md',
  '/docs/.claude/agent-memory/psb-polish/feedback_public_writing_no_fabrication.md',
  '/docs/.claude/agent-memory/psb-polish/',
  '/docs/.claude/',
] as const

/** PDFs recruiters actually download. Content type matters as much as the status. */
export const PDF_PATHS = [
  '/docs/Resume.pdf',
  '/docs/professional_certificate_in_mlai.pdf',
] as const

/**
 * macOS turds. `.DS_Store` is not a secret, but it enumerates every filename in
 * a directory — including ones that were deleted for a reason — and it is the
 * cheapest possible information leak.
 */
export function dsStoreUrls(): string[] {
  const known = ['/.DS_Store', '/docs/.DS_Store', '/docs/images/.DS_Store', '/docs/css/.DS_Store', '/docs/js/.DS_Store']
  const found = legacyFileUrls().filter((url) => url.endsWith('.DS_Store'))
  return [...new Set([...known, ...found])]
}
