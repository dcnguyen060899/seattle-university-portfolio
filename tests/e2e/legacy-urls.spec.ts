import { expect, test } from '@playwright/test'

import {
  DELETED_PAGE_REDIRECTS,
  PDF_PATHS,
  PRIVATE_PATHS,
  ROOT_REDIRECTS,
  dsStoreUrls,
  frozenPagesFromConfig,
  legacyCleanUrls,
  legacyFileUrls,
  legacyHtmlUrls,
} from './helpers/surfaces'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LEGACY URL PRESERVATION
 *
 * duyng-portfolio.com is served by GitHub Pages today. The rebuild is a DNS
 * cutover, which means every URL that answers 200 right now must still answer
 * after the switch — and these are not ordinary URLs. They are on a résumé, in
 * a LinkedIn profile, and in whatever emails have already been sent. A 404 on
 * one of them is not a broken link; it is a recruiter deciding the candidate
 * cannot keep a website up.
 *
 * `scripts/verify-urls.sh` covers the same ground from the shell using
 * `git ls-files`. This runs at the HTTP layer against the real server and
 * derives its inventory from DISK, which is strictly wider — an untracked file
 * under public/docs is still deployed and still served.
 * ═══════════════════════════════════════════════════════════════════════════
 */

test('every file under public/docs is served', async ({ request }) => {
  const urls = legacyFileUrls()
  expect(
    urls.length,
    'public/docs is empty. That directory is the entire pre-migration site.',
  ).toBeGreaterThan(50)

  const broken: string[] = []
  // Batched rather than sequential: ~110 files against `next dev` is otherwise
  // the longest test in the suite by an order of magnitude.
  const BATCH = 12
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async (url) => {
        const response = await request.get(url, { failOnStatusCode: false })
        return { url, status: response.status() }
      }),
    )
    for (const result of results) {
      if (result.status !== 200) broken.push(`${result.status}  ${result.url}`)
    }
  }

  expect(
    broken,
    `${broken.length} legacy URL(s) no longer serve. Each of these is a live 200 on ` +
      'GitHub Pages today.\n' + broken.join('\n'),
  ).toEqual([])
})

test('the clean-URL allow-list in next.config.ts matches the pages on disk', async () => {
  const configured = [...frozenPagesFromConfig()].sort()
  const onDisk = legacyHtmlUrls()
    .map((url) => url.replace(/^\/docs\//, '').replace(/\.html$/, ''))
    .sort()

  expect(
    configured,
    'FROZEN_PAGES in next.config.ts is the clean-URL allow-list, and it is a ' +
      'CONTRACT WITH GITHUB PAGES rather than a convenience. A page added to ' +
      'public/docs without being added there gets a 404 on its extensionless name — ' +
      'quietly, in production, on a URL somebody has already shared. A name left ' +
      'there after the page is deleted is a rewrite to a file that does not exist.',
  ).toEqual(onDisk)
})

test('every Jekyll clean URL still answers 200', async ({ request }) => {
  const broken: string[] = []
  for (const url of legacyCleanUrls()) {
    const response = await request.get(url, { failOnStatusCode: false })
    if (response.status() !== 200) broken.push(`${response.status()}  ${url}`)
  }
  expect(
    broken,
    'Jekyll serves both /docs/news.html and /docs/news. Next.js needs the fallback ' +
      'rewrite in next.config.ts to do the same.\n' + broken.join('\n'),
  ).toEqual([])
})

/* ══════════════════════════════════════════════════════════════════════════
   REDIRECTS — exact status codes, because R-4 distinguishes them
   ══════════════════════════════════════════════════════════════════════════ */

for (const { from, to, status } of [...DELETED_PAGE_REDIRECTS, ...ROOT_REDIRECTS]) {
  test(`${from} → ${status} → ${to}`, async ({ request }) => {
    const response = await request.get(from, { maxRedirects: 0, failOnStatusCode: false })

    expect(
      response.status(),
      `${from} returned ${response.status()}.\n` +
        'The status codes here are measured, not chosen: next.config.ts documents ' +
        'that `permanent: true` emits 308 on next@16.3.4, so the two pages Addendum ' +
        'B R-4 specifies as literal 301s carry `statusCode: 301` explicitly. A test ' +
        'that accepted "any 3xx" would not notice the config swapping them.',
    ).toBe(status)

    const location = response.headers()['location']
    expect(
      location,
      `${from} redirected to "${location}" instead of "${to}". The fragment matters: ` +
        'R-4 sends the independent-research URL to /#research, not to the top of the ' +
        'homepage, because the reader clicked a link about research.',
    ).toBe(to)
  })
}

test('the deleted pages are gone from disk, not merely redirected', async () => {
  const stillThere = legacyFileUrls().filter((url) =>
    /index_(portfolio|gpa_analysis|independent_research)\.html$/.test(url),
  )
  expect(
    stillThere,
    'Addendum B decision 4 is "delete the content outright". The redirect keeps the ' +
      'URL alive because a résumé domain should not 404 on an inbound link — it is ' +
      'not a substitute for removing the bytes. A file left in public/docs is still ' +
      'deployed, and a redirect is one config edit away from being gone.\n' +
      stillThere.join('\n'),
  ).toEqual([])
})

/* ══════════════════════════════════════════════════════════════════════════
   ASSETS
   ══════════════════════════════════════════════════════════════════════════ */

for (const path of PDF_PATHS) {
  test(`${path} serves as a PDF`, async ({ request }) => {
    const response = await request.get(path, { failOnStatusCode: false })
    expect(response.status(), `${path} did not return 200`).toBe(200)

    const contentType = response.headers()['content-type'] ?? ''
    expect(
      contentType,
      `${path} was served as "${contentType}". A résumé served as ` +
        'application/octet-stream downloads instead of previewing, and a browser ' +
        'that will not preview it is a recruiter who does not read it.',
    ).toContain('application/pdf')

    const body = await response.body()
    expect(
      body.subarray(0, 5).toString('latin1'),
      `${path} does not begin with the %PDF- magic number — a 200 with the right ` +
        'content type over the wrong bytes is worse than a 404.',
    ).toBe('%PDF-')
    expect(body.byteLength, `${path} is suspiciously small`).toBeGreaterThan(10_000)
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   🔴 THE PRIVATE FILES — this was a real leak, not a hypothetical
   ══════════════════════════════════════════════════════════════════════════ */

test('nothing under /docs/.claude/ is served', async ({ request }) => {
  const leaked: string[] = []

  for (const path of PRIVATE_PATHS) {
    const response = await request.get(path, { failOnStatusCode: false })
    if (response.status() === 200) {
      const body = (await response.text()).slice(0, 120).replace(/\s+/g, ' ')
      leaked.push(`200  ${path}  →  "${body}…"`)
    }
  }

  expect(
    leaked,
    'PRIVATE WORKING FILES ARE BEING SERVED.\n' +
      'public/docs/.claude/agent-memory/psb-polish/ held three of them. Jekyll ' +
      'silently excludes dot-directories, so they are 404 on GitHub Pages today — ' +
      'NEXT.JS DOES NOT. Measured on next@16.3.4: a file at ' +
      'public/docs/.claude/agent-memory/MEMORY.md is served with 200 and its full ' +
      'contents. A plain `git mv docs public/docs` publishes them, on the site whose ' +
      'entire purpose is controlling what a recruiter sees.\n' +
      'Three guards exist and all three have to hold: the files moved to the repo ' +
      'root, next.config.ts rewrites /docs/.claude/:path* to a non-route, and ' +
      '.vercelignore excludes the directory from the deployment.\n' +
      leaked.join('\n'),
  ).toEqual([])
})

test('no .DS_Store is served', async ({ request }) => {
  const served: string[] = []
  for (const url of dsStoreUrls()) {
    const response = await request.get(url, { failOnStatusCode: false })
    if (response.status() === 200) served.push(url)
  }
  expect(
    served,
    'A .DS_Store is not a secret, but it enumerates every filename a directory has ' +
      'ever held — including the ones that were deleted for a reason — and it is the ' +
      'cheapest possible information leak.\n' + served.join('\n'),
  ).toEqual([])
})

/* ══════════════════════════════════════════════════════════════════════════
   The one rewrite that is a trap
   ══════════════════════════════════════════════════════════════════════════ */

test('/docs resolves in one hop and does not loop', async ({ request }) => {
  const bare = await request.get('/docs', { maxRedirects: 0, failOnStatusCode: false })
  expect(
    bare.status(),
    '/docs must be a REWRITE to /docs/index.html (200), not a redirect to /docs/.\n' +
      'Measured: with trailingSlash:false, Next 308s /docs/ back to /docs, so a ' +
      '/docs → /docs/ redirect loops until curl gives up at 50 hops. A rewrite ' +
      'terminates.',
  ).toBe(200)

  const slash = await request.get('/docs/', { maxRedirects: 0, failOnStatusCode: false })
  expect([200, 308]).toContain(slash.status())
  if (slash.status() === 308) {
    expect(slash.headers()['location'], '/docs/ must 308 to /docs, and stop there').toBe('/docs')
  }

  const followed = await request.get('/docs', { failOnStatusCode: false })
  expect(followed.status()).toBe(200)
  expect(
    await followed.text(),
    '/docs should serve the UC Berkeley capstone index — that is what GitHub Pages ' +
      'has resolved it to all along.',
  ).toContain('<html')
})
