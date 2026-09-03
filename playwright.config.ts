import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE E2E SUITE FOR duyng-portfolio.com
 *
 * Modelled on the reference repo's config (REF/playwright.config.ts) with
 * three deliberate divergences, each of which is a property of THIS project.
 *
 * 1. NO SECRETS, AND THE SERVER IS STARTED WITHOUT ANY.
 *    `AGENT_DEMO_MODE` defaults ON (brief Addendum B, ruling R-13) and the
 *    recruiter agent serves pre-built canned briefs with no ANTHROPIC_API_KEY.
 *    That default IS the configuration this suite asserts about, so nothing is
 *    passed through `webServer.env`. A suite that needed a key could not run on
 *    a fork's pull request, and the whole degradation story would be untested.
 *
 * 2. CHROMIUM ONLY, WITH THE REASON WRITTEN DOWN.
 *    The reference carries a WebKit project because a hero scroll stutter was
 *    fixed against Chromium and reported still broken in Safari — a real,
 *    engine-specific compositing bug. This page has no scroll-driven
 *    compositing: `<Reveal>` is a one-shot IntersectionObserver + opacity /
 *    transform, which both engines handle identically. Adding WebKit here
 *    would double the CI minutes to re-run the same assertions. It is a
 *    one-line addition (`{ name: 'webkit', use: devices['Desktop Safari'] }`)
 *    the day a Safari-specific defect is actually observed. `.github/
 *    workflows/ci.yml` installs `chromium` only, which is the other half of
 *    this decision.
 *
 * 3. THE CI SERVER COMMAND BUILDS IF, AND ONLY IF, THERE IS NO BUILD.
 *    The reference's CI builds in the same job that runs Playwright, so
 *    `next start` always has output to serve. Here `ci.yml` runs `verify` and
 *    `e2e` as SEPARATE jobs with no artifact hand-off, so the e2e runner
 *    starts from a clean checkout with no `.next/`. Hard-coding `next start`
 *    in CI would fail with "Could not find a production build"; hard-coding
 *    `next build && next start` would pay for a second build whenever the job
 *    IS given one. The BUILD_ID probe below picks correctly in both worlds and
 *    keeps the local path on `next dev`, which is what makes iterating fast.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PORT = Number(process.env.PORT ?? 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`
const isCI = Boolean(process.env.CI)

/** A production build already on disk. `next start` refuses to run without it. */
const hasBuild = existsSync(join(process.cwd(), '.next', 'BUILD_ID'))

const serverCommand = isCI
  ? hasBuild
    ? `npx next start -p ${PORT}`
    : `npx next build && npx next start -p ${PORT}`
  : `npx next dev -p ${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,

  /**
   * The legacy-URL spec probes ~40 frozen pages and the retraction crawl reads
   * every one of them; under `next dev` each is a cold compile of the static
   * file server. 90 s locally, doubled on GitHub's shared runners, which have
   * no GPU and a cold npm cache.
   */
  timeout: process.env['GITHUB_ACTIONS'] === 'true' ? 120_000 : 60_000,
  expect: { timeout: 10_000 },

  reporter: isCI
    ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    /**
     * Redirect assertions in legacy-urls.spec.ts read the Location header and
     * the exact status (301 vs 308 — Addendum B R-4 distinguishes them, and
     * `next.config.ts` documents that `permanent: true` emits 308, not 301).
     * A following request would collapse both into the destination's 200.
     * Individual navigations opt back in where they want the full chain.
     */
    extraHTTPHeaders: {},
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],

  webServer: {
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: !isCI,
    // A cold `next build` on a shared runner is the long pole here.
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
