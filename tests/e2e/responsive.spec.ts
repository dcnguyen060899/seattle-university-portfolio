import { expect, test } from '@playwright/test'

import {
  findHorizontalOverflowers,
  freezeMotion,
  measureHorizontalScroll,
  scrollThroughPage,
} from './helpers/page'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NO HORIZONTAL OVERFLOW AT 375 / 768 / 1280.
 *
 * A page that scrolls sideways on a phone reads as broken before a word of it
 * is read, and the recruiter this page is built for is as likely to open it on
 * a phone between meetings as at a desk.
 *
 * TWO MEASUREMENTS, BOTH NEEDED. `document.scrollWidth` is the symptom and it
 * is what a visitor experiences; the element sweep is the cause and it is what
 * a developer can fix. A test that reported only the first would say "the page
 * is 412px wide at 375px" and leave somebody bisecting CSS.
 *
 * The sweep ignores content parked off-screen to the LEFT — the `.skip` link in
 * app/globals.css sits at `left: -9999px` until focused, which is the correct
 * visually-hidden idiom and creates no horizontal scroll in an LTR document.
 * Flagging it would fail the build for doing accessibility properly.
 *
 * 375px is the narrowest supported width (iPhone SE / mini). 768px is where a
 * two-column grid is under the most pressure — `<Entry>` switches its rail from
 * above the title to beside it at 640px, so 768 is the first width where the
 * side-by-side layout has to actually fit. 1280px is the design width.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const WIDTHS = [
  { width: 375, height: 812, note: 'the narrowest supported width' },
  { width: 768, height: 1024, note: "<Entry>'s two-column grid, at its tightest" },
  { width: 1280, height: 800, note: 'the design width' },
] as const

const ROUTES = ['/', '/not-a-real-page-404'] as const

for (const route of ROUTES) {
  for (const { width, height, note } of WIDTHS) {
    test(`${route} does not scroll horizontally at ${width}px (${note})`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await scrollThroughPage(page)
      await freezeMotion(page)

      const overflowers = await findHorizontalOverflowers(page)
      const significant = overflowers.filter((element) => element.significant)

      expect(
        significant.map(
          (element) => `${element.path} — ${element.width}px wide, right edge at ${element.right}px`,
        ),
        `${significant.length} text-bearing or interactive element(s) overflow the ` +
          `${width}px viewport. A decorative graphic bleeding off the edge under ` +
          '`overflow-x: hidden` is a design choice; a paragraph or a button doing it ' +
          'is a bug.\n' +
          (overflowers.length > significant.length
            ? `(${overflowers.length - significant.length} decorative overflower(s) ignored.)\n`
            : ''),
      ).toEqual([])

      const metrics = await measureHorizontalScroll(page)
      expect(
        metrics.documentScrollWidth,
        `The document scrolls horizontally at ${width}px: scrollWidth ` +
          `${metrics.documentScrollWidth} vs clientWidth ${metrics.documentClientWidth}. ` +
          'The element sweep above found no culprit, which usually means a margin, ' +
          'a `100vw` (which includes the scrollbar gutter), or a negative offset on ' +
          'a container the sweep treats as decorative.',
      ).toBeLessThanOrEqual(metrics.documentClientWidth + 1)
    })
  }
}

/**
 * The one width-dependent behaviour worth asserting beyond overflow: the page
 * measure. `.wrap` is capped at `--container-wrap` (1088px) and `<Band prose>`
 * narrows to `--container-prose` inside it, because research prose set at
 * 1088px is unreadable. A capped measure that stops being capped is invisible
 * on a laptop and obvious on a 27-inch monitor, which is where nobody tests.
 */
test('the page measure stays capped on a wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1000 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await freezeMotion(page)

  const wraps = await page.locator('.wrap').count()
  test.skip(wraps === 0, 'no .wrap on the page yet — <Band> renders it when not `bleed`')

  const widths = await page
    .locator('.wrap')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: Math.round(node.getBoundingClientRect().width),
        prose: node.classList.contains('prose-measure'),
      })),
    )

  const tooWide = widths.filter((row) => row.width > 1090)
  expect(
    tooWide,
    `A .wrap is ${tooWide.map((r) => r.width).join(', ')}px wide on a 2200px ` +
      'viewport. The page measure is 1088px and it is not a preference: a line of ' +
      'body text 2000px long has no reliable return sweep, which is a legibility ' +
      'failure that only appears on the monitors nobody tests on.',
  ).toEqual([])

  const prose = widths.filter((row) => row.prose)
  if (prose.length > 0) {
    const widestProse = Math.max(...prose.map((row) => row.width))
    expect(
      widestProse,
      `A <Band prose> measure is ${widestProse}px. The reading measure is ~544px ` +
        '(~66ch) and it exists because the research bands run to paragraphs; at the ' +
        'full page measure they are unreadable.',
    ).toBeLessThanOrEqual(600)
  }
})
