import AxeBuilder from '@axe-core/playwright'
import type { Result } from 'axe-core'
import { expect, test } from '@playwright/test'

import {
  CONTRACT_NOTE,
  findSubmit,
  readVerdictRows,
  selectChip,
  waitForPanel,
} from './helpers/agent'
import { freezeMotion, scrollThroughPage } from './helpers/page'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AXE — WCAG 2.1 AA over every surface a recruiter reaches.
 *
 * ZERO violations at AA, not "zero serious". The reference repo blocks on
 * serious/critical only, which is the right call for a marketing site with a
 * photographic hero. It is the wrong call here: this page's entire argument is
 * that its claims are checkable, and a page arguing that while shipping a
 * moderate-impact label association failure is arguing against itself. The
 * `best-practice` tag is excluded — those are axe's opinions, not WCAG.
 *
 * THE AGENT PANEL IS SCANNED IN ITS RESULT STATE, not just its empty one. An
 * empty form is the easy half; the brief that renders after submission carries
 * the coverage line, the verdict markers and the citation links, and it is the
 * part a recruiter actually reads.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

function summarise(violations: Result[]): string[] {
  return violations.map(
    (violation) =>
      `${violation.impact ?? 'unknown'}: ${violation.id} @ ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  )
}

function format(violations: Result[]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 4)
        .map((node) => `      ${node.target.join(' ')}\n        ${node.failureSummary?.replace(/\n/g, '\n        ') ?? ''}`)
        .join('\n')
      return `  [${violation.impact}] ${violation.id} — ${violation.help}\n${targets}\n      ${violation.helpUrl}`
    })
    .join('\n')
}

/**
 * Reveal transitions are 1s with a 60ms stagger, and axe composites the colour
 * it actually sees — scanning mid-transition measures a faded value and reports
 * contrast failures that do not exist in the settled state. Mount everything,
 * then freeze, then scan. In that order.
 */
async function settle(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await scrollThroughPage(page)
  await freezeMotion(page)
}

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const

for (const viewport of VIEWPORTS) {
  test(`axe: the homepage has zero WCAG AA violations at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' })
    expect(response?.status(), '/ did not return 200').toBe(200)
    await settle(page)

    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA]).analyze()

    expect(
      summarise(results.violations),
      `${results.violations.length} WCAG AA violation(s) at ${viewport.width}px:\n${format(results.violations)}`,
    ).toEqual([])
  })
}

/**
 * BOTH COLOUR SCHEMES — and the honest finding first.
 *
 * `app/layout.tsx` declares `viewport.colorScheme = 'light'`, and that is
 * load-bearing rather than boilerplate: this system has three grounds and all
 * three are AUTHORED. The dark register is a band the page chooses, not a
 * preference the browser applies. Declaring `light` stops a forced-dark browser
 * mode from recolouring #FBFAF8 and #AA0000 into something no ratio in
 * globals.css describes.
 *
 * So there is no "dark mode" to scan — and that is precisely why the dark
 * emulation below is worth running. It asserts the DESIGNED behaviour: under
 * `prefers-color-scheme: dark` the page must render identically, because a
 * palette that quietly shifts under a media query has left the measured
 * ground-context table behind. A future territory adding a dark variant will
 * fail here, which is the correct moment to have that conversation.
 */
for (const scheme of ['light', 'dark'] as const) {
  test(`axe: zero violations under prefers-color-scheme: ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await settle(page)

    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA]).analyze()

    expect(
      summarise(results.violations),
      `${results.violations.length} violation(s) under ${scheme}:\n${format(results.violations)}`,
    ).toEqual([])
  })
}

test('the palette does not shift under prefers-color-scheme: dark', async ({ page }) => {
  const read = async (): Promise<Record<string, string>> =>
    page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      const body = getComputedStyle(document.body)
      return {
        ground: style.getPropertyValue('--ground').trim(),
        fg: style.getPropertyValue('--fg').trim(),
        accent: style.getPropertyValue('--fg-accent').trim(),
        bodyBackground: body.backgroundColor,
        bodyColor: body.color,
      }
    })

  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const light = await read()

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const dark = await read()

  expect(
    dark,
    'The page rendered differently under prefers-color-scheme: dark. Every ratio in ' +
      'app/globals.css is measured against the three authored grounds; a fourth, ' +
      'media-query-derived palette has none of those measurements behind it. If a ' +
      'dark register is genuinely wanted, it needs its own measured column in the ' +
      'ground-context table and `colorScheme: light` in app/layout.tsx has to go — ' +
      'this assertion is the place to have that argument, not a silent shift.',
  ).toEqual(light)
})

/**
 * THE AGENT PANEL, IN ITS RESULT STATE.
 *
 * Scanning the empty form proves the labels are associated. Scanning the
 * rendered brief proves the part a recruiter reads is reachable: the coverage
 * line, the verdict markers (which must not be colour-only — WCAG 1.4.1), the
 * citation links and the live region that announced the result.
 */
/**
 * The context gets its own X-Forwarded-For for the same reason the agent specs
 * do: a request the PAGE makes carries the browser's address, every worker
 * shares it, and `{ perMin: 1, burst: 3 }` is exhausted in seconds. A panel
 * parked on a rate-limit state is not the state this test means to scan.
 */
test.describe('the rendered brief', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '2001:db8:a11y::1' } })

  test('axe: the agent panel is clean once a brief has RENDERED', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await settle(page)

    // The empty panel is already inside the three whole-page scans above. What
    // those cannot reach is the state that only exists after a submission.
    const panel = await waitForPanel(page)
    expect(panel, CONTRACT_NOTE).not.toBeNull()
    if (!panel) return

    // `selectChip` retries until aria-pressed flips, which is the only reliable
    // proof that the client bundle has hydrated — a click on an un-hydrated
    // <Chip> is a click on a plain button with no handler.
    const chosen = await selectChip(page)
    expect(chosen.ok, `${chosen.reason ?? ''}. ${CONTRACT_NOTE}`).toBe(true)

    // And only if the chip did not already start the run: selecting a chip is
    // the zero-typing path and may submit on its own, and clicking a control
    // that is already mid-flight waits for something that will not happen.
    const submit = await findSubmit(page)
    expect(submit, CONTRACT_NOTE).not.toBeNull()
    if (!submit) return
    if (await submit.isEnabled()) await submit.click()

    // Wait for the brief's own rows, not for a wrapper: a panel that paints an
    // empty shell would otherwise be scanned as though it had rendered.
    await expect
      .poll(async () => (await readVerdictRows(page))?.length ?? 0, {
        timeout: 30_000,
        message: `no requirement rows rendered after submitting. ${CONTRACT_NOTE}`,
      })
      .toBeGreaterThan(0)
    await freezeMotion(page)

    const rendered = await new AxeBuilder({ page }).withTags([...WCAG_AA]).analyze()

    expect(
      summarise(rendered.violations),
      'The empty form scans clean and the RENDERED BRIEF does not. This is the state ' +
        'a recruiter actually reads — the coverage line, the verdict markers, the ' +
        'citation links.\n' + format(rendered.violations),
    ).toEqual([])
  })
})

/**
 * The skip link is the first focusable thing in the document and globals.css
 * styles it crimson-on-paper regardless of what it lands over, precisely
 * because it renders above everything and cannot know what is underneath it.
 * axe cannot see it: it is `left: -9999px` until focused, and an off-screen
 * element is out of scope for a colour-contrast rule.
 */
test('the first Tab lands on a visible skip link', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.keyboard.press('Tab')

  const focused = page.locator('a.skip')
  await expect(
    focused,
    'The first Tab stop must be the skip link. A keyboard user whose first stop ' +
      'is something invisible over the dark hero has no way back.',
  ).toBeFocused()

  const box = await focused.boundingBox()
  expect(
    box && box.x > -1000,
    `The focused skip link is still parked off-screen (${JSON.stringify(box)}). ` +
      'It moves on :focus in app/globals.css; if that rule is gone the link exists ' +
      'for screen readers and not for keyboards.',
  ).toBe(true)
})
