import { expect, test } from '@playwright/test'

import {
  FROZEN_PAGE_QUARANTINE,
  RETRACTIONS,
  findRetractions,
  formatHits,
  summariseHits,
} from './helpers/corpus'
import { legacyCleanUrls, legacyHtmlUrls } from './helpers/surfaces'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RETRACTED CONTENT NEVER RENDERS — asserted at the HTTP layer.
 *
 * `scripts/verify-corpus.mjs --built` already scans emitted HTML and the
 * résumé PDF's extracted text. This is belt and braces over it, one layer
 * further out: it asks the SERVER what a browser gets, so it also covers
 * anything the build emits somewhere the file scan does not walk, anything a
 * rewrite substitutes, and the response bodies of the routes themselves.
 *
 * The matchers are built independently in tests/e2e/helpers/corpus.ts rather
 * than imported from lib/corpus — see the note there. A double-check that
 * shares its machinery with the thing it double-checks can be switched off in
 * one place neither gate looks at.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ONE HONEST CORRECTION TO THE BRIEF'S TEST SPEC.
 *
 * The spec for this territory says: crawl the homepage AND every page under
 * /docs/, and assert none contains any retracted string. Measured against the
 * tree, that assertion is FALSE BY DESIGN, and `verify-corpus.mjs` says so in
 * its own header — `public/docs/**` is excluded because those pages are frozen
 * byte-for-byte, their URLs are on a résumé and on LinkedIn, and they are full
 * of exactly the figures this corpus retracts. Addendum B R-4 keeps the URLs
 * alive and forbids editing the bytes; the `legacy-guard` job in ci.yml
 * enforces that.
 *
 * So this file asserts the strongest TRUE thing instead: an exact quarantine.
 * Two named frozen pages carry a named set of retractions and no others; every
 * other served surface — the new pages, the generated résumé HTML, the agent's
 * responses — carries none at all. It fails when a page gains a retraction AND
 * when a quarantined page loses one, because a quarantine nobody has to shrink
 * is an exemption that quietly becomes permanent.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** The same projection `verify-corpus.mjs` uses, so the two gates agree. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
}

test('the retraction list is non-trivial — this gate is guarding something', async () => {
  expect(
    RETRACTIONS.length,
    'data/corpus/retractions.json shrank below the 20 records the corpus was built ' +
      'with. A retraction is a permanent enforcement obligation, not a lesser ' +
      'claim: removing one un-forbids a string that was retracted for a reason.',
  ).toBeGreaterThanOrEqual(20)

  const rules = RETRACTIONS.flatMap((r) => [
    ...r.forbiddenPhrases,
    ...(r.forbiddenPatterns ?? []).map((p) => p.source),
  ])
  expect(rules.length, 'forbidden phrase/pattern count').toBeGreaterThan(60)
})

/* ══════════════════════════════════════════════════════════════════════════
   THE NEW SURFACES — zero tolerance
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `/docs/resume_content.html` is here rather than in the quarantine on purpose:
 * Addendum B R-6 makes it a GENERATED file, produced from the corpus by
 * `scripts/gen-resume.mjs` and gated by `npm run gen:resume -- --check`. It
 * lives under public/docs but it is a new surface, and it is the source the
 * résumé PDF is rendered from.
 */
const NEW_SURFACES = ['/', '/not-a-real-page-404', '/docs/resume_content.html'] as const

for (const path of NEW_SURFACES) {
  test(`no retracted content on ${path}`, async ({ request }) => {
    const response = await request.get(path, { failOnStatusCode: false })
    // The 404 route is expected to 404; what matters is what it renders.
    expect([200, 404]).toContain(response.status())

    const hits = findRetractions(visibleText(await response.text()))

    expect(
      summariseHits(hits),
      `${path} renders retracted content:\n${formatHits(path, hits)}`,
    ).toEqual([])
  })
}

/**
 * The agent's own output is a served surface too — arguably the most dangerous
 * one, because it is generated rather than authored. Its content is asserted in
 * depth in agent-injection.spec.ts; this is the blanket sweep.
 */
test('no retracted content in the agent health payload', async ({ request }) => {
  const response = await request.get('/api/agent/health', { failOnStatusCode: false })
  test.skip(
    response.status() === 404,
    'GET /api/agent/health is not implemented yet — see agent-demo.spec.ts, which ' +
      'fails rather than skips on that.',
  )
  const hits = findRetractions(await response.text())
  expect(summariseHits(hits), formatHits('/api/agent/health', hits)).toEqual([])
})

/* ══════════════════════════════════════════════════════════════════════════
   THE FROZEN PAGES — an exact quarantine
   ══════════════════════════════════════════════════════════════════════════ */

test('every frozen legacy page matches the retraction quarantine exactly', async ({ request }) => {
  const pages = legacyHtmlUrls().filter((url) => !NEW_SURFACES.includes(url as never))

  const unexpected: string[] = []
  const resolved: string[] = []

  for (const path of pages) {
    const response = await request.get(path, { failOnStatusCode: false })
    expect(response.status(), `${path} did not return 200 — it is a live URL`).toBe(200)

    const hits = findRetractions(visibleText(await response.text()))
    const found = new Set(hits.map((hit) => hit.retractionId))
    const allowed = new Set(FROZEN_PAGE_QUARANTINE[path] ?? [])

    for (const hit of hits) {
      if (!allowed.has(hit.retractionId)) {
        unexpected.push(
          `${path}\n    ${hit.retractionId} matched "${hit.matched}" (rule: ${hit.rule})\n` +
            `    …${hit.context}…`,
        )
      }
    }
    for (const id of allowed) {
      if (!found.has(id)) resolved.push(`${path} no longer carries ${id}`)
    }
  }

  expect(
    unexpected,
    'A frozen legacy page gained retracted content that the quarantine in\n' +
      'tests/e2e/helpers/corpus.ts does not list. Since public/docs is byte-frozen ' +
      'outside the R-4 allowlist (enforced by the legacy-guard job in ci.yml), the ' +
      'likely causes are, in order: a new page was added to public/docs; one of the ' +
      'three allow-listed files was edited; or a NEW retraction record was added to ' +
      'the corpus whose phrases match text that was already there. The third is the ' +
      'interesting one — it means the corpus has just decided something on a live ' +
      'URL is wrong, and R-4 does not let you edit the page. Escalate it; do not ' +
      'widen the quarantine to make this green.\n' +
      unexpected.join('\n'),
  ).toEqual([])

  expect(
    resolved,
    'Good news, and still a failure: a quarantined page no longer carries a ' +
      'retraction the list says it does. Remove the entry from ' +
      'FROZEN_PAGE_QUARANTINE in tests/e2e/helpers/corpus.ts. A quarantine that ' +
      'nobody is ever forced to shrink is how a temporary exemption becomes ' +
      'permanent.\n' +
      resolved.join('\n'),
  ).toEqual([])
})

/**
 * The Jekyll clean URL and the `.html` URL must be the SAME document.
 *
 * `next.config.ts` serves `/docs/news` through a `fallback` rewrite to
 * `/docs/news.html`. If that rewrite ever pointed somewhere else, one of the two
 * URLs would be scanned by the quarantine above and the other would not — and
 * the un-scanned one is the one on LinkedIn.
 */
test('clean URLs serve the same bytes as their .html twins', async ({ request }) => {
  const mismatched: string[] = []

  for (const clean of legacyCleanUrls()) {
    const withExtension = `${clean}.html`
    const [a, b] = await Promise.all([
      request.get(clean, { failOnStatusCode: false }),
      request.get(withExtension, { failOnStatusCode: false }),
    ])

    if (a.status() !== 200) {
      mismatched.push(`${clean} returned ${a.status()} — GitHub Pages answers it with 200 today`)
      continue
    }
    const [textA, textB] = await Promise.all([a.text(), b.text()])
    if (textA !== textB) {
      mismatched.push(
        `${clean} and ${withExtension} differ (${textA.length} vs ${textB.length} bytes)`,
      )
    }
  }

  expect(
    mismatched,
    'Jekyll answers BOTH /docs/news.html and /docs/news today; Next.js answers only ' +
      'the first without the fallback rewrite in next.config.ts. Every extensionless ' +
      'name in FROZEN_PAGES is a live 200 right now, and dropping one breaks a URL ' +
      'that is on a résumé and on LinkedIn.\n' +
      mismatched.join('\n'),
  ).toEqual([])
})
