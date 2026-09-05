import { expect, test, type Page } from '@playwright/test'

import {
  contrastRatio,
  parseColor,
  relativeLuminance,
  requiredRatio,
  round2,
} from './helpers/color'
import { NOT_LANDED_MESSAGE, heroPhotoHasLanded } from './helpers/hero-assets'
import { decodePng, sampleRects, type DecodedImage, type Rect } from './helpers/pixels'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE NAV SITS IN THE PHOTOGRAPH, NOT ON A WHITE BAR ABOVE IT.
 *
 * ── THE DEFECT THIS FILE EXISTS TO STOP RECURRING ────────────────────────
 *
 * The owner's report, verbatim:
 *
 *     "why do we have a white back separate from the background image in the
 *      back, like mavterras page, the white back only appear when we start to
 *      scroll down, but for us, the opposite, as we scroll down the white bar
 *      with navigation is gone"
 *
 * That is one sentence containing two independent defects, and both are
 * measurable:
 *
 *   1. AT REST there is a hard horizontal edge where the paper nav stops and
 *      the photograph starts. It is the same class of defect hero-blend.spec
 *      .ts already guards inside the band ("it feel like it just cut of
 *      overlap on top the background image") — a perceptible geometric
 *      boundary — except this one is at the band's top instead of its bottom.
 *      §2 measures it.
 *
 *   2. THE STATE MACHINE IS INVERTED. The reference is transparent at rest and
 *      grows a frosted bar on scroll; this page was opaque at rest and had no
 *      bar at all after scroll, because the header did not stick. §3 pins the
 *      machine in the correct orientation so it cannot silently flip back.
 *
 * ── THE BASELINE, MEASURED 2026-09-03 BEFORE ANY FIX LANDED ──────────────
 *
 * Chromium, deviceScaleFactor 1, `/` at scrollY 0:
 *
 *   width  header position  header height  own background   step at its foot
 *    375   static           138px          rgb(251,250,248)  0.8326
 *    768   static            61px          rgb(251,250,248)  0.8228
 *   1280   static            61px          rgb(251,250,248)  0.7278
 *   1600   static            61px          rgb(251,250,248)  0.7284
 *
 * The same measurement taken against the live reference (demo.mavterras.com,
 * identical widths, identical code path) reads 0.0330 / 0.0348 / 0.0417 /
 * 0.0334 — that residue is the photograph's own content, because the reference
 * paints no bar there at all. The two populations are twenty times apart, and
 * MAX_EDGE_STEP below sits between them with margin on both sides. Neither
 * number is a preference; both were read off pixels.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ──────────────────────────────
 *
 * It never names the mechanism. There is no assertion that the header carries
 * `position: fixed`, no assertion on a class name, no assertion that a
 * particular hook supplies the boolean. Every check here reads a PROPERTY a
 * visitor experiences — where the bar is, what colour is actually composited
 * under each glyph, whether the page jumped, whether the trademark was
 * altered. A design territory that finds a better mechanism should be able to
 * ship it against a green suite; a design territory that reintroduces the
 * white bar should not.
 *
 * ── THE 97% TRAP, WHICH IS THE REASON §4 SAMPLES PIXELS ──────────────────
 *
 * The reference's own stylesheet records what happens to a translucent bar:
 * at 82% bone its effective ground fell to ~#CFCDC8 with the zone track behind
 * it, dropping its links to 3.50:1 and its accent to 3.99:1 — "both below AA,
 * and both invisible to any check that reads the declared colour instead of
 * the composited one." A translucent nav has no background of its own; it has
 * whatever is behind it, blended. So §4 screenshots the page and reads the
 * pixels under each glyph, exactly as hero-contrast.spec.ts does, rather than
 * asking getComputedStyle what colour it intended.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const photoLanded = heroPhotoHasLanded()

const VIEWPORTS = [
  { width: 375, height: 812, note: 'the narrowest supported width' },
  { width: 768, height: 1024, note: 'tablet portrait' },
  { width: 1280, height: 800, note: 'the design width' },
  { width: 1600, height: 900, note: 'a wide desktop' },
] as const

/** The design width, and the only viewport the above-the-fold budget is stated for. */
const DESIGN = { width: 1280, height: 800 } as const

/**
 * A scroll position PAST THE HERO, derived rather than assumed.
 *
 * The first draft used a flat 700px, borrowed from the reference's 70px stuck
 * threshold plus headroom, and it was wrong about this page: the hero band runs
 * 1306px at 1280x800 (hero.tsx records the measurement), so 700 is still deep
 * inside the photograph and the bar is correctly still wearing it. Three tests
 * failed for asserting the paper face at a position where the picture is what
 * a visitor actually sees.
 *
 * The bar's job is to stop wearing the photograph once it is no longer over
 * one, so the position that matters is the hero's own bottom edge — whatever
 * that is at this viewport, on this build, with this corpus.
 */
async function pastHero(page: Page): Promise<number> {
  const y = await page.evaluate(() => {
    const hero = document.getElementById('top')
    if (!hero) return 400
    const box = hero.getBoundingClientRect()
    return Math.round(box.bottom + window.scrollY)
  })
  return y + 160
}

/**
 * Mean |ΔL| across the full width, between the 8 rows above a boundary and the
 * 8 rows below it. Reference population maxes at 0.0417; the pre-fix bar read
 * 0.7278–0.8326. 0.12 is ~2.9x the worst honest reading and ~6x below the
 * defect, which is as clean a separation as a perceptual gate ever gets.
 */
const MAX_EDGE_STEP = 0.12

/** Rows either side of the boundary the step is averaged over. */
const STEP_BAND = 8

/**
 * How far either side of the nav's foot to hunt for the worst step.
 *
 * WHY A WINDOW AND NOT THE WHOLE STRIP. This hero is a skyline at sunset: a
 * bright sky over a dark city with a real horizon in it, and the horizon is a
 * genuine photographic step the page is entitled to have. Scanning the top
 * 200 rows would eventually charge the picture for being a picture. The
 * assertion is specifically "is there a manufactured step where the chrome
 * ends", so the search is anchored to where the chrome ends.
 */
const STEP_WINDOW = 24

/**
 * Effective opacity at or above which the bar counts as a SURFACE rather than
 * a tint over what is behind it.
 *
 * 0.85, not 0.5. The reference's frosted bar is 97% bone and the whole point of
 * that measured 97% is that a translucent-LOOKING bar must be nearly solid to
 * keep its text legal; a gate that accepted 0.6 would accept the 82% bar the
 * reference has already measured into an AA failure.
 */
const OPAQUE_ALPHA = 0.85

/** The complement, as the leak ratio §3 actually measures. */
const MAX_LEAK = 1 - OPAQUE_ALPHA

/**
 * Painted mean luminance the nav band must stay BELOW at rest over the hero.
 *
 * Paper (#FBFAF8) is 0.933 and the pre-fix bar sat within a hair of it across
 * the whole band. 0.35 is comfortably above anything a legibility ramp over
 * this photograph produces and far below anything that reads as a light slab.
 */
const MAX_REST_LUMINANCE = 0.35

/** …and must stay ABOVE once it is the paper face. Bone/paper sit near 0.93. */
const MIN_PAPER_LUMINANCE = 0.6

/**
 * How far the no-JS test wheels down. It cannot call pastHero() — that needs
 * page script — so it uses a flat distance and treats "the bar left with the
 * hero" as the pass it is.
 */
const NO_JS_WHEEL = 900

/* ══════════════════════════════════════════════════════════════════════════
   RESOLUTION — how this file finds the nav, and why it is not a data hook
   ══════════════════════════════════════════════════════════════════════════

   The page renders exactly one <header>, from app/layout.tsx, and it has
   done since the rebuild started. A `[data-nav]` hook would be a second
   contract to keep in sync for no gain, and — worse — it would let a future
   edit satisfy this suite by moving the attribute rather than by fixing the
   bar. `header` is the semantic the markup already commits to.
   ═══════════════════════════════════════════════════════════════════════════ */

const NAV = 'header'

interface NavGeometry {
  found: boolean
  count: number
  position: string
  /** Viewport-relative. A fixed bar reads 0 here at any scroll position. */
  top: number
  bottom: number
  height: number
  /** DIAGNOSTIC ONLY — the header's own declared fill. Never assert on it. */
  background: string
  backdropFilter: string
  /** Viewport-relative top of the hero band. */
  heroTop: number | null
  heroGround: string | null
  zIndex: string
}

async function readNav(page: Page): Promise<NavGeometry> {
  return page.evaluate((selector) => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const nav = nodes[0]
    const hero = document.getElementById('top')
    const heroBox = hero?.getBoundingClientRect() ?? null

    if (!nav) {
      return {
        found: false,
        count: 0,
        position: '',
        top: 0,
        bottom: 0,
        height: 0,
        background: '',
        backdropFilter: '',
        heroTop: heroBox ? heroBox.top : null,
        heroGround: hero?.getAttribute('data-ground') ?? null,
        zIndex: '',
      }
    }

    const style = getComputedStyle(nav)
    const box = nav.getBoundingClientRect()

    return {
      found: true,
      count: nodes.length,
      position: style.position,
      top: box.top,
      bottom: box.bottom,
      height: box.height,
      /*
        DIAGNOSTIC ONLY — never assert on this. See PAINTED, NOT DECLARED
        below; the bar's ground is not required to live on the <header>'s own
        `background-color`, and on this page it does not.
      */
      background: style.backgroundColor,
      backdropFilter: style.backdropFilter || 'none',
      heroTop: heroBox ? heroBox.top : null,
      heroGround: hero?.getAttribute('data-ground') ?? null,
      zIndex: style.zIndex,
    }
  }, NAV)
}

/* ══════════════════════════════════════════════════════════════════════════
   PAINTED, NOT DECLARED — and the mistake this replaced

   The first version of this file asserted on `getComputedStyle(header)
   .backgroundColor`. It was wrong twice over on the first page it met, and
   both ways are instructive enough to write down.

     · The shipped nav paints its ground on a SIBLING (`.veil`) rather than on
       the <header>, because the two faces are different background SHAPES — a
       vertical ramp over the photograph, a flat frosted fill on paper — and
       one element cannot cross-fade between two shapes without one of them
       being wrong for the length of the transition. The header's own
       background-color is `rgba(0,0,0,0)` in BOTH states, so the probe read
       "transparent" for a bar that is plainly a solid bone slab on screen.
     · On the 404 the same probe read `color(srgb 0.984 0.980 0.973 / 0.97)`
       and reported alpha 0.00, because its regex only understood `rgba()`.
       That is `parseColor`'s job and it already handles the `color(srgb …)`
       form; hand-rolling it a second time is how a check quietly stops
       checking.

   Which is the same trap the reference's stylesheet describes at 82% bone —
   "invisible to any check that reads the declared colour instead of the
   composited one" — arrived at from the other direction. So the ground is
   measured the only way that cannot be fooled: off the pixels.
   ═══════════════════════════════════════════════════════════════════════════ */

interface BandStats {
  meanLuminance: number
  darkest: number
  lightest: number
  box: Rect
}

/** The nav's own band, sampled with its glyphs neutralised. */
async function navBand(page: Page, image?: DecodedImage): Promise<BandStats | null> {
  const nav = await readNav(page)
  if (!nav.found || nav.height <= 0) return null

  const viewport = page.viewportSize()
  if (!viewport) return null

  const box: Rect = {
    x: 1,
    y: Math.max(0, nav.top + 1),
    width: viewport.width - 2,
    height: Math.max(1, Math.min(nav.height - 2, viewport.height - nav.top - 2)),
  }

  const shot = image ?? decodePng(await screenshotWithNavTextHidden(page))
  const scale = shot.width / viewport.width
  const stats = sampleRects(shot, [box], scale)
  if (stats === null) return null

  return {
    meanLuminance: stats.meanLuminance,
    darkest: relativeLuminance(stats.p05),
    lightest: relativeLuminance(stats.p95),
    box,
  }
}

/** Hides `next dev`'s fixed overlays, which are not part of the page. */
async function hideDevChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button],
      #__next-build-watcher, #__next-prerender-indicator { display: none !important; }`,
  })
}

/** Two rAFs — long enough for a style write to have been painted. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

/**
 * Scrolls, then waits out the nav's own transition before measuring.
 *
 * The reference eases its ground over 400ms and this page is expected to do
 * something similar. Sampling mid-transition reads an interpolated colour no
 * token ever had — the exact flake freezeMotion() exists to prevent elsewhere.
 * Here the transition is the thing under test, so it is waited out rather than
 * killed.
 */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((target) => window.scrollTo(0, target), y)
  await page.waitForTimeout(700)
  await settle(page)
}

interface StepReading {
  boundary: number
  step: number
  /** Row means either side, for the failure message. */
  above: number
  below: number
}

/**
 * The worst full-width luminance step within ±STEP_WINDOW of `boundary`.
 *
 * Runs in Node over a decoded screenshot rather than in the page, because it
 * is arithmetic over pixels and a failure message needs to show its working.
 */
function worstStep(
  image: DecodedImage,
  boundary: number,
  scale: number,
): StepReading | null {
  const { width, height } = image
  const rowMean = new Float64Array(height)
  for (let y = 0; y < height; y += 1) {
    let sum = 0
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      sum += relativeLuminance({
        r: image.data[i] ?? 0,
        g: image.data[i + 1] ?? 0,
        b: image.data[i + 2] ?? 0,
        a: 1,
      })
    }
    rowMean[y] = sum / width
  }

  const centre = Math.round(boundary * scale)
  const lo = Math.max(STEP_BAND, centre - Math.round(STEP_WINDOW * scale))
  const hi = Math.min(height - STEP_BAND, centre + Math.round(STEP_WINDOW * scale))
  if (hi <= lo) return null

  let best: StepReading | null = null
  for (let y = lo; y < hi; y += 1) {
    let above = 0
    let below = 0
    for (let k = 1; k <= STEP_BAND; k += 1) {
      above += rowMean[y - k] ?? 0
      below += rowMean[y + k - 1] ?? 0
    }
    above /= STEP_BAND
    below /= STEP_BAND
    const step = Math.abs(above - below)
    if (best === null || step > best.step) {
      best = { boundary: y / scale, step, above, below }
    }
  }
  return best
}

interface GlyphRun {
  text: string
  color: string
  fontSizePx: number
  fontWeight: number
  path: string
  rects: Rect[]
}

/**
 * Every text run inside the nav, with the rectangles its glyphs occupy.
 *
 * Range rects, not element boxes: an element box for a nav link includes its
 * padding, and averaging the padding in dilutes whatever the glyphs are
 * actually sitting on. The same choice hero-contrast.spec.ts makes, for the
 * same reason.
 */
async function collectNavRuns(page: Page): Promise<GlyphRun[]> {
  return page.evaluate((selector) => {
    const nav = document.querySelector<HTMLElement>(selector)
    if (!nav) return []

    const describe = (el: Element): string => {
      const bits: string[] = []
      let node: Element | null = el
      let depth = 0
      while (node && depth < 3) {
        const cls =
          typeof node.className === 'string' && node.className.trim()
            ? `.${node.className.trim().split(/\s+/)[0]}`
            : ''
        bits.unshift(`${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${cls}`)
        node = node.parentElement
        depth += 1
      }
      return bits.join(' > ')
    }

    const vw = window.innerWidth
    const vh = window.innerHeight
    const out: GlyphRun[] = []

    for (const el of Array.from(nav.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (Number.parseFloat(style.opacity || '1') < 0.05) continue

      const ownText = Array.from(el.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
      )
      if (ownText.length === 0) continue

      const rects: Rect[] = []
      for (const node of ownText) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of Array.from(range.getClientRects())) {
          if (r.width < 2 || r.height < 2) continue
          const x0 = Math.max(0, r.left)
          const y0 = Math.max(0, r.top)
          const x1 = Math.min(vw, r.right)
          const y1 = Math.min(vh, r.bottom)
          if (x1 - x0 < 2 || y1 - y0 < 2) continue
          rects.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
        }
      }
      if (rects.length === 0) continue

      out.push({
        text: (el.textContent ?? '').trim().slice(0, 40),
        color: style.color,
        fontSizePx: Number.parseFloat(style.fontSize || '16'),
        fontWeight: Number.parseFloat(style.fontWeight || '400'),
        path: describe(el),
        rects,
      })
    }
    return out
  }, NAV)
}

/**
 * A screenshot with the nav's glyph FILL removed and everything else intact.
 *
 * Shared by the contrast sampler and the band probe so both look at the same
 * frame. `color: transparent` rather than `visibility: hidden` — the glyphs go
 * and every background, veil, ramp, halo and stroke stays, which is the ground
 * both callers are asking about. hero-contrast.spec.ts documents at length why
 * `text-shadow` and `-webkit-text-stroke` must survive: a sampler that erases
 * per-glyph treatment forbids the only fix available over a photograph, and
 * the nav lands on the brightest strip of one.
 */
async function screenshotWithNavTextHidden(page: Page): Promise<Buffer> {
  const handle = await page.addStyleTag({
    content: `${NAV} *, ${NAV} *::before, ${NAV} *::after {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
        text-decoration-color: transparent !important;
        caret-color: transparent !important;
      }`,
  })
  await settle(page)
  const shot = await page.screenshot({ animations: 'disabled' })
  await handle.evaluate((node: Element) => node.remove())
  await settle(page)
  return shot
}

interface RunVerdict {
  run: GlyphRun
  /** Worst of the two shoulders — the conservative reading. */
  ratio: number
  required: number
  backdrop: string
}

/**
 * WCAG over rendered pixels for every nav text run.
 *
 * The glyphs are made transparent first so the sample is the GROUND under the
 * text and not the text itself. `text-shadow` and `-webkit-text-stroke` are
 * deliberately left alone — hero-contrast.spec.ts documents at length why a
 * sampler that erases per-glyph treatment forbids the only fix available over
 * a photograph, and the same argument applies verbatim to a bar sitting on the
 * hero's brightest strip.
 */
async function measureNavContrast(page: Page): Promise<RunVerdict[]> {
  const runs = await collectNavRuns(page)
  if (runs.length === 0) return []

  const image = decodePng(await screenshotWithNavTextHidden(page))
  const viewport = page.viewportSize()
  const scale = viewport ? image.width / viewport.width : 1

  const out: RunVerdict[] = []
  for (const run of runs) {
    const colour = parseColor(run.color)
    if (!colour) continue
    const stats = sampleRects(image, run.rects, scale)
    if (stats === null) continue
    const low = contrastRatio(colour, stats.p05)
    const high = contrastRatio(colour, stats.p95)
    out.push({
      run,
      ratio: Math.min(low, high),
      required: requiredRatio(run.fontSizePx, run.fontWeight),
      backdrop:
        `p05 rgb(${Math.round(stats.p05.r)},${Math.round(stats.p05.g)},${Math.round(stats.p05.b)}) ` +
        `p95 rgb(${Math.round(stats.p95.r)},${Math.round(stats.p95.g)},${Math.round(stats.p95.b)})`,
    })
  }
  return out
}

/* ══════════════════════════════════════════════════════════════════════════
   §1  GEOMETRY — the nav is IN the photograph, and the picture starts at y=0
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('§1 the nav sits in the photograph', () => {
  for (const { width, height, note } of VIEWPORTS) {
    test(`the hero band starts at the top of the viewport at ${width}px (${note})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await hideDevChrome(page)
      await settle(page)

      const nav = await readNav(page)

      expect(nav.found, `No <header> in the document at ${width}px.`).toBe(true)
      expect(
        nav.count,
        'app/layout.tsx renders exactly one <header>. More than one means this ' +
          'file, and every other spec that resolves the nav, is measuring an ' +
          'arbitrary member of a set.',
      ).toBe(1)

      expect(
        nav.heroGround,
        'The hero band must still declare `ink`. Every published ratio for the ' +
          'band, and the whole hero-contrast gate, is keyed to it.',
      ).toBe('ink')

      /*
        THE CORE GEOMETRIC CLAIM. The owner's "white back separate from the
        background image" is, geometrically, the photograph starting BELOW the
        chrome. When the nav is in the picture, the picture owns row zero.

        1px of tolerance, not 0: sub-pixel layout on a fractional device scale
        can put a border box at 0.5. A 61px offset — the pre-fix reading at
        768/1280/1600 — is a bar, not a rounding error.
      */
      expect(
        nav.heroTop,
        `The hero band's top edge is ${nav.heroTop}px below the viewport top at ` +
          `${width}px. Anything above 1px is chrome occupying flow space in ` +
          'front of the photograph, which is the white bar this whole change ' +
          'removes. BASELINE FOR CONTEXT: 61px at 768/1280/1600, 138px at 375. ' +
          'Territory: components/site/nav.tsx + app/layout.tsx.',
      ).toBeLessThanOrEqual(1)

      expect(
        nav.top,
        `The nav's own top edge is at ${nav.top}px rather than the top of the viewport.`,
      ).toBeLessThanOrEqual(1)

      expect(
        nav.zIndex === 'auto' ? 0 : Number.parseInt(nav.zIndex, 10),
        'A bar drawn over the photograph needs a stacking order of its own; the ' +
          'hero promotes a composited layer for its cross-fade and an auto ' +
          'z-index puts the nav underneath it.',
      ).toBeGreaterThan(0)
    })
  }

  test('the nav stays at the top of the viewport after scrolling', async ({ page }) => {
    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await hideDevChrome(page)
    await scrollTo(page, await pastHero(page))

    const nav = await readNav(page)
    expect(
      nav.top,
      `After scrolling past the hero the nav's top edge is at ${nav.top}px. ` +
        'BASELINE: the header did not stick at all — at this scroll position it ' +
        'was entirely off-screen, which is the second half of the owner\'s ' +
        'report ("as we scroll down the white bar with navigation is gone").',
    ).toBeLessThanOrEqual(1)
    expect(nav.height, 'The nav collapsed to nothing after scrolling.').toBeGreaterThan(20)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   §2  THE STEP — no manufactured edge where the chrome ends
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('§2 no hard edge under the nav at rest', () => {
  for (const { width, height, note } of VIEWPORTS) {
    test(`the nav's foot does not step at ${width}px (${note})`, async ({ page }) => {
      test.skip(!photoLanded, NOT_LANDED_MESSAGE)

      await page.setViewportSize({ width, height })
      await page.goto('/', { waitUntil: 'networkidle' })
      await hideDevChrome(page)
      await settle(page)
      await page.waitForTimeout(400)

      const nav = await readNav(page)
      const image = decodePng(await page.screenshot({ animations: 'disabled' }))
      const scale = image.width / width

      const reading = worstStep(image, nav.bottom, scale)
      expect(
        reading,
        `Could not measure a step around the nav's foot (${nav.bottom}px) at ` +
          `${width}px. A null reading is "did not measure", never "measured clean".`,
      ).not.toBeNull()
      if (reading === null) return

      expect(
        reading.step,
        `A full-width luminance step of ${reading.step.toFixed(4)} sits at ` +
          `y=${reading.boundary.toFixed(0)}px, ${(reading.boundary - nav.bottom).toFixed(0)}px ` +
          `from the nav's foot (${nav.bottom.toFixed(0)}px): mean L ` +
          `${reading.above.toFixed(4)} above, ${reading.below.toFixed(4)} below.\n` +
          `This is the owner's "white back separate from the background image". ` +
          `MEASURED ENDPOINTS: the reference (demo.mavterras.com, same widths, ` +
          `nav transparent over its hero) reads 0.033-0.042 — that is a ` +
          `photograph with no bar in front of it. This page read ` +
          `0.728-0.833 before the fix. The gate is ${MAX_EDGE_STEP}.\n` +
          'Territory: components/site/nav.tsx and its stylesheet.',
      ).toBeLessThan(MAX_EDGE_STEP)
    })
  }
})

/* ══════════════════════════════════════════════════════════════════════════
   §3  THE STATE MACHINE — transparent on the hero, paper everywhere else
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('§3 the state machine', () => {
  test('at rest on the homepage the nav band is not a light bar', async ({ page }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)

    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'networkidle' })
    await hideDevChrome(page)
    await settle(page)
    await page.waitForTimeout(400)

    const nav = await readNav(page)
    const band = await navBand(page)
    expect(band, 'Could not sample the nav band at rest.').not.toBeNull()
    if (band === null) return

    expect(
      band.meanLuminance,
      `At scrollY 0 the nav band's painted mean luminance is ` +
        `${band.meanLuminance.toFixed(4)} (darkest ${band.darkest.toFixed(4)}, ` +
        `lightest ${band.lightest.toFixed(4)}; the header itself declares ` +
        `${nav.background}, which is diagnostic only).\n` +
        `Paper is #FBFAF8 at luminance 0.933 and the pre-fix bar measured within ` +
        `a hair of it across the whole band. Over the photograph the band must ` +
        `read as picture — darkened by a ramp if it needs to be, but not as a ` +
        `light slab. The gate is ${MAX_REST_LUMINANCE}.\n` +
        '§2 is what stops the ramp from having an edge; §4 is what stops it ' +
        'from being too thin to read against.',
    ).toBeLessThan(MAX_REST_LUMINANCE)
  })

  test('scrolled past the hero the nav band is a light ground', async ({ page }) => {
    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'networkidle' })
    await hideDevChrome(page)
    await scrollTo(page, await pastHero(page))

    const band = await navBand(page)
    expect(band, 'Could not sample the nav band after scrolling.').not.toBeNull()
    if (band === null) return

    expect(
      band.meanLuminance,
      `After scrolling past the hero the nav band's painted mean luminance is ` +
        `${band.meanLuminance.toFixed(4)}. The bands under it are paper; the bar ` +
        'has to be a light ground standing between the reader and the page, ' +
        'not a window onto it. BASELINE: the header did not stick at all here.',
    ).toBeGreaterThan(MIN_PAPER_LUMINANCE)
  })

  /*
    ── THE 97% TRAP, MEASURED AS OPACITY RATHER THAN AS A DECLARED ALPHA ────

    The reference's stylesheet records the whole failure: at 82% bone, with the
    zone track scrolling underneath, its composited ground fell to ~#CFCDC8 and
    its links dropped to 3.50:1 — "invisible to any check that reads the
    declared colour instead of the composited one".

    A declared alpha cannot be read here anyway (the ground is painted by a
    sibling, and by two different background SHAPES), so the property is
    measured directly instead: MOVE THE CONTENT UNDER THE BAR AND SEE HOW MUCH
    OF THE MOVEMENT COMES THROUGH.

      leak = Δ(band luminance) / Δ(luminance of an uncovered strip just below)

    That ratio IS one-minus-the-effective-opacity, and it is self-calibrating —
    it does not care how much the content happened to change, only what
    fraction of it survived the bar. At the reference's rejected 82% it would
    read ~0.18; at its measured 97% it reads ~0.03. The gate is 0.15, i.e. at
    least 85% effective opacity, which is the same floor OPAQUE_ALPHA states
    and the same one the reference's own history says is the safe side.
  */
  test('the scrolled bar does not leak the content moving under it', async ({ page }) => {
    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'networkidle' })
    await hideDevChrome(page)

    const sampleAt = async (y: number): Promise<{ band: number; below: number } | null> => {
      await scrollTo(page, y)
      const nav = await readNav(page)
      const image = decodePng(await screenshotWithNavTextHidden(page))
      const scale = image.width / DESIGN.width
      const bandRect: Rect = {
        x: 1,
        y: nav.top + 1,
        width: DESIGN.width - 2,
        height: Math.max(1, nav.height - 2),
      }
      /* An uncovered strip immediately under the bar: the same content, with
         nothing in front of it, so it reports how much the page moved. */
      const belowRect: Rect = {
        x: 1,
        y: nav.bottom + 4,
        width: DESIGN.width - 2,
        height: 48,
      }
      const band = sampleRects(image, [bandRect], scale)
      const below = sampleRects(image, [belowRect], scale)
      if (band === null || below === null) return null
      return { band: band.meanLuminance, below: below.meanLuminance }
    }

    /* Several positions, all well past the flip, so the pair with the largest
       honest movement underneath is the one the ratio is taken from. A pair
       where nothing moved would divide by ~0 and prove nothing. */
    const readings: Array<{ y: number; band: number; below: number }> = []
    const floor = await pastHero(page)
    for (const y of [floor, floor + 220, floor + 440, floor + 660]) {
      const r = await sampleAt(y)
      if (r) readings.push({ y, ...r })
    }
    expect(readings.length, 'Could not sample the scrolled bar.').toBeGreaterThan(1)

    let best: { deltaBelow: number; deltaBand: number; a: number; b: number } | null = null
    for (let i = 0; i < readings.length; i += 1) {
      for (let j = i + 1; j < readings.length; j += 1) {
        const a = readings[i]
        const b = readings[j]
        if (!a || !b) continue
        const deltaBelow = Math.abs(a.below - b.below)
        if (best === null || deltaBelow > best.deltaBelow) {
          best = { deltaBelow, deltaBand: Math.abs(a.band - b.band), a: a.y, b: b.y }
        }
      }
    }
    expect(best, 'No usable pair of scroll positions.').not.toBeNull()
    if (best === null) return

    /* Below 0.02 the denominator is noise and the ratio is meaningless. Say so
       rather than reporting a number that looks like a measurement. */
    test.skip(
      best.deltaBelow < 0.02,
      `The page content under the bar barely changed between the sampled ` +
        `positions (Δ ${best.deltaBelow.toFixed(4)}), so the leak ratio has no ` +
        'denominator. Not a pass — a non-measurement.',
    )

    const leak = best.deltaBand / best.deltaBelow
    expect(
      leak,
      `Between scrollY ${best.a} and ${best.b} the page under the bar moved by ` +
        `Δ L ${best.deltaBelow.toFixed(4)} and the bar itself moved by ` +
        `Δ L ${best.deltaBand.toFixed(4)} — a leak of ${round2(leak * 100)}%, i.e. ` +
        `an effective opacity of ${round2((1 - leak) * 100)}%.\n` +
        'THE MEASURED PRECEDENT: the reference shipped this bar at 82% bone, ' +
        'watched its composited ground fall to ~#CFCDC8 with the zone track ' +
        'behind it, and measured its links at 3.50:1 and its accent at 3.99:1 — ' +
        'both below AA. It moved to 97% and holds ~#F0EDE9 (4.76:1 / 5.43:1). ' +
        `The gate here is ${MAX_LEAK} leak, i.e. ${OPAQUE_ALPHA} effective ` +
        'opacity. DO NOT RAISE IT. §4 is the check that catches the ' +
        'consequence, and it should never be the one that fires first.',
    ).toBeLessThan(MAX_LEAK)
  })

  test('a page with no hero shows the paper bar immediately', async ({ page }) => {
    await page.setViewportSize(DESIGN)
    await page.goto('/not-a-real-page-404', { waitUntil: 'networkidle' })
    await hideDevChrome(page)
    await settle(page)

    const nav = await readNav(page)
    expect(
      nav.heroGround,
      'app/not-found.tsx is `paper` and has no #top band. If this ever reads ' +
        '"ink" the 404 grew a hero and this test is measuring the wrong thing.',
    ).not.toBe('ink')

    const band = await navBand(page)
    expect(band, 'Could not sample the nav band on the 404.').not.toBeNull()
    if (band === null) return

    expect(
      band.meanLuminance,
      `The 404 has no photograph to sit in, so the bar must be the paper face ` +
        `from scrollY 0. Its painted mean luminance is ` +
        `${band.meanLuminance.toFixed(4)}.\n` +
        'This must hold with NO JavaScript — a route with no ink hero is a fact ' +
        'about the document, and CSS can read it. A nav that needed a scroll ' +
        'listener to work this out would show a transparent bar over paper for ' +
        'the first frames of every 404.',
    ).toBeGreaterThan(MIN_PAPER_LUMINANCE)
  })

  test('the ground does not flicker at the threshold', async ({ page }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)

    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'networkidle' })
    await hideDevChrome(page)

    /*
      Finds the flip point by bisection rather than assuming one. The reference
      uses a flat 70px; this page is free to use the hero's own bottom edge, a
      sentinel, or anything else, and a gate that hard-coded a number would
      fail a better answer for being different.
    */
    const luminanceAt = async (y: number): Promise<number> => {
      await scrollTo(page, y)
      const band = await navBand(page)
      return band?.meanLuminance ?? 0
    }

    let lo = 0
    let hi = 1600
    expect(
      await luminanceAt(lo),
      'Bisection needs the bar dark at the top; the first test in §3 asserts it.',
    ).toBeLessThan(MAX_REST_LUMINANCE)
    expect(
      await luminanceAt(hi),
      'Bisection needs the bar light well down the page; §3 asserts it.',
    ).toBeGreaterThan(MIN_PAPER_LUMINANCE)

    for (let i = 0; i < 7; i += 1) {
      const mid = Math.round((lo + hi) / 2)
      if ((await luminanceAt(mid)) > MIN_PAPER_LUMINANCE) hi = mid
      else lo = mid
    }
    const threshold = hi

    /*
      ── DEFECT ONE: OSCILLATION WITH THE PAGE STANDING STILL ──────────────
      Park exactly on the boundary and watch. Anything that changes here is a
      feedback loop — the classic one being a bar whose state changes the
      document height, which moves the scroll position, which changes the
      state. That is the flicker a visitor sees as a strobing bar.
    */
    await scrollTo(page, threshold)
    const settled = (await navBand(page))?.meanLuminance ?? 0
    for (let i = 0; i < 4; i += 1) {
      await page.waitForTimeout(200)
      const now = (await navBand(page))?.meanLuminance ?? 0
      expect(
        Math.abs(now - settled),
        `Parked at scrollY ${threshold} with no input, the bar's painted ground ` +
          `moved from ${settled.toFixed(4)} to ${now.toFixed(4)}. Nothing ` +
          'scrolled; the bar is driving itself. The usual cause is the state ' +
          'changing the document height — a spacer appearing or disappearing — ' +
          'which moves the scroll position, which re-triggers the state.',
      ).toBeLessThan(0.05)
    }

    /*
      ── DEFECT TWO: LATCHING IN THE WRONG GROUND ──────────────────────────
      Jitter across the boundary the way a trackpad does, then stop, and assert
      the resting state MATCHES THE RESTING POSITION. A bar left transparent
      while parked below its own threshold is worse than a flicker, because it
      is silent.
    */
    const jitter = async (): Promise<void> => {
      for (let i = 0; i < 10; i += 1) {
        await page.evaluate((y) => window.scrollTo(0, y), threshold + (i % 2 === 0 ? -3 : 3))
        await page.waitForTimeout(40)
      }
    }

    await jitter()
    await scrollTo(page, threshold + 120)
    expect(
      (await navBand(page))?.meanLuminance ?? 0,
      'After jittering across the boundary and settling 120px BELOW it, the bar ' +
        'is not on its paper face. Rapid crossings must not be able to leave ' +
        'the machine latched in the wrong ground.',
    ).toBeGreaterThan(MIN_PAPER_LUMINANCE)

    await jitter()
    await scrollTo(page, 0)
    expect(
      (await navBand(page))?.meanLuminance ?? 0,
      'After the same jitter and a return to the top, the bar has not gone back ' +
        'into the photograph. The first thing a returning visitor sees is the ' +
        'white bar that was supposed to have gone.',
    ).toBeLessThan(MAX_REST_LUMINANCE)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   §4  COMPOSITED CONTRAST — the 97% trap, read off pixels
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('§4 every nav glyph is legible against what is actually behind it', () => {
  for (const { width, height, note } of VIEWPORTS) {
    for (const state of ['rest', 'scrolled'] as const) {
      test(`${state}: nav text clears AA at ${width}px (${note})`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await page.goto('/', { waitUntil: 'networkidle' })
        await hideDevChrome(page)
        await settle(page)
        if (state === 'scrolled') await scrollTo(page, await pastHero(page))
        else await page.waitForTimeout(400)

        const verdicts = await measureNavContrast(page)
        expect(
          verdicts.length,
          'No nav text was measurable. Either the nav rendered no glyphs, or ' +
            'the sampler failed — both are findings, neither is a pass.',
        ).toBeGreaterThan(0)

        const failures = verdicts.filter((v) => v.ratio < v.required)
        expect(
          failures.map(
            (v) =>
              `${v.run.path} "${v.run.text}" ${v.run.color} at ` +
              `${v.run.fontSizePx}px/${v.run.fontWeight} — ${round2(v.ratio)}:1, ` +
              `needs ${v.required}:1 (backdrop ${v.backdrop})`,
          ),
          `${failures.length} nav text run(s) fail AA against the pixels actually ` +
            `composited under them, ${state} at ${width}px.\n` +
            'READ THIS BEFORE CHANGING A THRESHOLD. At rest these glyphs sit on ' +
            "the hero's crest strip, which is the BRIGHTEST part of the " +
            'photograph — the same problem the hero text solved with per-glyph ' +
            'treatment rather than with a darker sheet, and this sampler is ' +
            'built to credit that (glyph fill is neutralised; text-shadow and ' +
            '-webkit-text-stroke are left painting). Scrolled, a failure here ' +
            'means the translucent bar is too thin, and the reference has ' +
            'already measured that road: 82% took it to 3.50:1.\n' +
            'Territory: components/site/nav.tsx and its stylesheet.',
        ).toEqual([])
      })
    }
  }
})

/* ══════════════════════════════════════════════════════════════════════════
   §5  THE TRADEMARK — someone else's mark, and no white box either
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('§5 the Seattle University affiliation', () => {
  /*
    ── WHAT THIS SECTION IS AND IS NOT ──────────────────────────────────────

    It was written expecting a raster lockup over the photograph and the
    argument about how to make a fixed black wordmark read on the crest strip.
    That argument has been settled elsewhere and in the other direction:
    components/ui/Mark.tsx now renders the affiliation as TYPE unless
    `art:su-mark`'s provenance is verified, on trademark grounds, and records
    its own sweep showing the raster never reached 1.4.11's 3:1 at any veil
    alpha at any viewport anyway.

    So these tests assert the PROPERTY that survives either outcome: the
    affiliation is stated, exactly once, legibly, in both grounds — and if a
    raster ever comes back, it comes back unaltered. None of them requires an
    <img>, and none of them permits one to be recoloured.
  */

  /*
    ── THE AFFILIATION LEFT THE CHROME ON 2026-09-05 ───────────────────────

    This test used to assert the opposite: that the nav states "Seattle
    University", because it was "the one credential the chrome carries". That
    was a real design intent and it was deliberately reversed, so the test is
    rewritten rather than deleted — and it now guards the reversal, so nobody
    reinstates the words by accident.

    WHY. The bar read "Duy Nguyen · SEATTLE UNIVERSITY" directly above a hero
    whose eyebrow read "SEATTLE, WASHINGTON · M.S. DATA SCIENCE, SEATTLE
    UNIVERSITY" and whose h1 read "Duy Nguyen". Three "Seattle"s and two of
    his name in the first two lines of the page. The chrome now carries the DN
    monogram instead, and the affiliation is stated where it is a CLAIM about
    him — the hero eyebrow, the coursework band, the footer — rather than as
    decoration repeated a few hundred pixels away.

    WHAT SURVIVES UNCHANGED is the property the old test actually protected:
    the affiliation is announced EXACTLY ONCE in the first viewport. It used
    to be once in the nav; it is now once in the eyebrow. Two visible copies
    is still two announcements to a screen reader, whichever elements carry
    them.
  */
  test('the affiliation is out of the chrome and stated once above the fold', async ({ page }) => {
    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'networkidle' })
    await settle(page)

    const found = await page.evaluate((selector) => {
      const shown = (el: Element): boolean => {
        let node: Element | null = el
        while (node) {
          const style = getComputedStyle(node)
          if (style.display === 'none' || style.visibility === 'hidden') return false
          node = node.parentElement
        }
        return true
      }
      const hits: Array<{ inNav: boolean; aboveFold: boolean; text: string }> = []
      for (const el of Array.from(document.querySelectorAll('*'))) {
        if (!shown(el)) continue
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.textContent ?? '').trim())
          .join(' ')
        const alt = el.getAttribute('alt') ?? ''
        if (!/seattle\s+university/i.test(own) && !/seattle\s+university/i.test(alt)) continue
        const rect = el.getBoundingClientRect()
        hits.push({
          inNav: Boolean(el.closest(selector)),
          aboveFold: rect.top < window.innerHeight,
          text: (own || alt).slice(0, 80),
        })
      }
      return hits
    }, NAV)

    expect(
      found.filter((h) => h.inNav).map((h) => h.text),
      'The nav states the affiliation again. It was moved out of the chrome ' +
        'on purpose: the bar sits directly above a hero eyebrow that already ' +
        'says "Seattle University", and carrying it in both put the same words ' +
        'twice in the first two lines of the page. The bar carries the DN ' +
        'monogram now. If the affiliation genuinely has to return to the ' +
        'chrome, take it out of the eyebrow in the same commit.',
    ).toEqual([])

    const aboveFold = found.filter((h) => h.aboveFold)
    expect(
      aboveFold.map((h) => h.text),
      'The affiliation is not stated anywhere in the first viewport. It is a ' +
        'credential a recruiter should not have to scroll for, and removing it ' +
        'from the nav was supposed to move it, not delete it.',
    ).not.toEqual([])

    expect(
      aboveFold.map((h) => h.text),
      `"Seattle University" is visible ${aboveFold.length} times above the ` +
        'fold at once. Two copies is the affiliation announced twice to a ' +
        'screen reader and printed twice on screen — the stutter this layout ' +
        'was changed to remove.',
    ).toHaveLength(1)
  })

  test('no raster mark in the nav is ever recoloured, inverted or blended', async ({ page }) => {
    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'networkidle' })
    await settle(page)

    const marks = await page.evaluate((selector) => {
      const nav = document.querySelector<HTMLElement>(selector)
      if (!nav) return []
      return Array.from(nav.querySelectorAll('img')).map((img) => {
        const style = getComputedStyle(img)
        return {
          src: img.getAttribute('src') ?? '',
          filter: style.filter,
          mixBlendMode: style.mixBlendMode,
        }
      })
    }, NAV)

    /*
      An empty list is a PASS here, and deliberately so: the shipped answer is
      that no raster is rendered at all. This assertion is a tripwire for the
      day one returns — nothing about it says a mark must exist. The count is
      covered by the affiliation test above, which does not care which form
      carries it.
    */
    const altered = marks.filter(
      (m) =>
        /invert|hue-rotate|sepia|saturate|brightness|contrast/i.test(m.filter) ||
        (m.mixBlendMode !== 'normal' && m.mixBlendMode !== ''),
    )
    expect(
      altered.map((m) => `${m.src} — filter: ${m.filter}, mix-blend-mode: ${m.mixBlendMode}`),
      'A raster mark in the nav is being repainted by CSS. Both files in ' +
        'public/brand/ are Seattle University\'s registered seal-and-signature, ' +
        'and the 2024 brand guidelines carry "Do not alter or attempt to ' +
        'recreate these elements in any way" verbatim. components/ui/Mark.tsx ' +
        'says the same thing about the mechanism: inverting turns the seal\'s ' +
        'red cyan. A blend mode gets there by another route. If the mark ' +
        'cannot read where it is, change what is behind it or set the ' +
        'affiliation in type — do not repaint somebody else\'s trademark.',
    ).toEqual([])
  })

  test('at rest the nav contains no opaque plate', async ({ page }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)

    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'networkidle' })
    await hideDevChrome(page)
    await settle(page)
    await page.waitForTimeout(400)

    const plates = await page.evaluate(
      ([selector, alpha]) => {
        const nav = document.querySelector<HTMLElement>(selector as string)
        if (!nav) return []
        const out: Array<{ path: string; background: string; area: number; box: string }> = []
        for (const el of Array.from(nav.querySelectorAll<HTMLElement>('*'))) {
          const style = getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden') continue
          const match = /rgba?\(([^)]+)\)/.exec(style.backgroundColor || '')
          if (!match?.[1]) continue
          const parts = match[1]
            .split(/[\s,/]+/)
            .filter(Boolean)
            .map((p) => Number.parseFloat(p))
          const a = parts.length >= 4 ? (parts[3] ?? 1) : 1
          if (a < (alpha as number)) continue
          const box = el.getBoundingClientRect()
          const area = box.width * box.height
          if (area < 900) continue
          out.push({
            path: `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0] ?? ''}`,
            background: style.backgroundColor,
            area: Math.round(area),
            box: `${Math.round(box.width)}x${Math.round(box.height)}`,
          })
        }
        return out
      },
      [NAV, OPAQUE_ALPHA] as const,
    )

    expect(
      plates.map((p) => `${p.path} — ${p.background} over ${p.box} (${p.area}px²)`),
      'Something inside the nav paints an opaque rectangle over the photograph ' +
        'while the bar itself is showing the picture.\n' +
        'THIS IS THE DEFECT IN MINIATURE. Plating the lockup is the obvious way ' +
        'to make a black wordmark read on a photograph, and Mark.tsx used to do ' +
        'it. But a white plate on the picture is the same white box the owner ' +
        'has rejected for seven rounds, scaled down — and the brand guidelines ' +
        'price it exactly: p.16 sets the isolation area at the logo\'s own ' +
        'height, so a 28px lockup wants an 84px white rectangle, taller than ' +
        'the bar containing it.\n' +
        'Territory: components/site/nav.tsx, components/ui/Mark.tsx.',
    ).toEqual([])
  })

  /*
    ── THE MARK IS A GRAPHIC NOW, SO THIS IS A PIXEL TEST ──────────────────

    This asserted that the affiliation TEXT cleared AA on both faces. The
    chrome no longer carries text at all — it carries the DN monogram — so the
    same property is measured on the thing that is actually there.

    THE STANDARD IS 3:1, NOT 4.5:1, and that is not a relaxation. A logotype is
    exempt from 1.4.3 outright (src:wcag-logotype-exemption in the corpus);
    what still applies is 1.4.11, non-text contrast, which asks 3:1 of a
    graphical object needed to understand the content. The cream D and N are
    that object. The crimson flourish is not — it is a swash, it crosses over
    the D and under the N so most of its length lies on cream rather than on
    the photograph, and the mark reads as DN without it.

    MEASURED ON COMPOSITED PIXELS, not on declared colours: the bar is
    translucent over a photograph on one face and frosted over paper on the
    other, so what the mark is actually drawn against is a blend that no
    stylesheet states. p95 is the mark's own ink, p05 the darkest ground inside
    the same box.
  */
  test('the brand mark reads against both grounds', async ({ page }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)

    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'networkidle' })
    await hideDevChrome(page)
    await settle(page)
    await page.waitForTimeout(400)

    for (const [state, scrolled] of [
      ['over the photograph', false],
      ['on the paper face', true],
    ] as const) {
      if (scrolled) await scrollTo(page, await pastHero(page))
      await page.waitForTimeout(300)

      const box = await page.evaluate((selector) => {
        const svg = document.querySelector(`${selector} svg`)
        if (!svg) return null
        const r = svg.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }, NAV)

      expect(
        box,
        `No brand mark is rendered in the nav ${state}. The bar carries the ` +
          'monogram as its only brand element; with it gone the link to the ' +
          'homepage is an empty box.',
      ).not.toBeNull()

      const rect = box as Rect
      expect(
        rect.width > 8 && rect.height > 8,
        `The brand mark measures ${round2(rect.width)}x${round2(rect.height)} ` +
          `CSS px ${state} — too small to be the mark rather than a collapsed box.`,
      ).toBe(true)

      const image: DecodedImage = decodePng(await page.screenshot({ animations: 'disabled' }))
      const scale = image.width / DESIGN.width
      const stats = sampleRects(image, [rect], scale)

      expect(stats, `The mark's box decoded no pixels ${state}.`).not.toBeNull()

      const ratio = contrastRatio(stats!.p95, stats!.p05)
      expect(
        `${round2(ratio)}:1`,
        `The brand mark does not separate from its ground ${state}: ` +
          `${round2(ratio)}:1 between its own ink (p95 rgb ${stats!.p95.r},${stats!.p95.g},${stats!.p95.b}) ` +
          `and the darkest ground inside its box (p05 rgb ${stats!.p05.r},${stats!.p05.g},${stats!.p05.b}). ` +
          'WCAG 1.4.11 asks 3:1 of a graphical object. This is the failure the ' +
          "nav veil exists to prevent — the bar has to paint a ground at rest, " +
          'and no foreground survives an unpainted one over a photograph.',
      ).toBe(`${round2(ratio)}:1`)
      expect(ratio).toBeGreaterThanOrEqual(3)
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   §6  NO LAYOUT SHIFT — going fixed must cost nothing
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('§6 the page does not jump', () => {
  for (const { width, height, note } of VIEWPORTS) {
    test(`cumulative layout shift is zero at ${width}px (${note})`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.addInitScript(() => {
        ;(window as unknown as { __cls: number }).__cls = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
            if (!shift.hadRecentInput) {
              ;(window as unknown as { __cls: number }).__cls += shift.value
            }
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await page.goto('/', { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)

      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
      expect(
        cls,
        `CLS ${cls.toFixed(4)} at ${width}px. It was 0.0000 at every viewport ` +
          'before the nav moved out of flow, measured 2026-09-03. Taking a bar ' +
          'out of flow removes its height from the document; if anything below ' +
          'it moves on hydration — a spacer appearing, a stuck class arriving ' +
          'late — this is where it shows up.',
      ).toBeLessThan(0.001)
    })
  }

  /*
    THE ABOVE-THE-FOLD BUDGET, and why it is stated only at 1280x800.

    Measured 2026-09-03 with the nav still in flow, `/` at 1280x800: the three
    [data-numeric] blocks in #top ran 494-632, 688-784 and 688-784. The last
    bottom was 784 against a fold of 800 — SIXTEEN PIXELS of headroom for the
    page's entire numeric argument.

    Moving the nav out of flow gives 61px back, so this assertion should have
    become easy. It is here for the opposite case: if the fix compensates for
    the missing flow height by padding the hero — which is the obvious way to
    "avoid layout shift" and also the way to reinstate the white gap — the
    figures go straight back under the fold and this fires.
  */
  test('the three hero figures are above the fold at 1280x800', async ({ page }) => {
    await page.setViewportSize(DESIGN)
    await page.goto('/', { waitUntil: 'networkidle' })
    await hideDevChrome(page)
    await page.evaluate(() => {
      // The figures arrive via <Reveal>; assert placement, not animation.
      const style = document.createElement('style')
      style.textContent = `*, *::before, *::after {
        animation: none !important; transition: none !important;
      }
      .rv, [class*="rv"] { opacity: 1 !important; transform: none !important; }`
      document.head.appendChild(style)
    })
    await settle(page)

    const figures = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#top [data-numeric]')).map((el) => {
        const b = el.getBoundingClientRect()
        return { top: Math.round(b.top), bottom: Math.round(b.bottom) }
      }),
    )

    expect(
      figures.length,
      'The hero carries three measured figures: one <Threshold> and two ' +
        '<Readout>s, all marked [data-numeric]. A different count means the ' +
        'hero changed and this budget needs re-deriving, not relaxing.',
    ).toBe(3)

    const below = figures.filter((f) => f.bottom > DESIGN.height)
    expect(
      below.map((f) => `top ${f.top} bottom ${f.bottom} (fold ${DESIGN.height})`),
      'A hero figure is below the fold at the design width. BASELINE, with the ' +
        'nav still in flow: 494-632, 688-784, 688-784 — 16px of headroom. ' +
        'Taking the nav out of flow returns 61px, so this should now be ' +
        'comfortable; if it is failing, something is padding the top of the ' +
        'page back in.',
    ).toEqual([])
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   §7  DEGRADATION — no JavaScript, and reduced motion
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('§7 degradation', () => {
  /*
    ── WHY NO-JS IS A REAL CASE HERE AND NOT A PURITY EXERCISE ─────────────

    The ground switch comes off the shared rAF loop, which means with scripting
    off the bar keeps whatever ground it declared at first paint, forever. On
    the homepage that would be the transparent face — and "forever" means while
    the reader is at scrollY 700 looking at paper bands, with hero-tuned link
    colours over them.

    Only two shapes are safe, and the page may pick either:
      · the bar keeps a legible ground wherever it ends up, or
      · with scripting off the bar is not fixed at all, so it scrolls away with
        the hero it was drawn for and the reader never meets the bad state.

    THE MECHANICS OF THIS TEST. Nothing here calls page.evaluate, because in a
    javaScriptEnabled:false context every evaluate hangs until the test times
    out — which is exactly how the first draft of this file burned 60 seconds
    and reported the wrong thing. Geometry comes from Locator.boundingBox()
    and colour comes from pixels, both of which are driven over CDP and need
    no page script.
  */
  test('with JavaScript off the reader never gets an illegible bar', async ({ browser }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)

    const context = await browser.newContext({ javaScriptEnabled: false, viewport: DESIGN })
    const page = await context.newPage()
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)

    const header = page.locator(NAV)
    await expect(header, 'The nav did not render without JavaScript.').toHaveCount(1)

    const links = await page.locator(`${NAV} a`).count()
    expect(
      links,
      'The nav rendered no links with scripting off. Every href in it is a ' +
        'plain anchor; if they vanished, the bar is being built client-side.',
    ).toBeGreaterThan(2)

    const bandAt = async (): Promise<{ top: number; mean: number } | null> => {
      const box = await header.boundingBox()
      if (!box) return null
      const image = decodePng(await page.screenshot({ animations: 'disabled' }))
      const scale = image.width / DESIGN.width
      const y = Math.max(0, box.y + 1)
      const height = Math.min(box.height - 2, DESIGN.height - y - 1)
      if (height < 4) return { top: box.y, mean: Number.NaN }
      const stats = sampleRects(
        image,
        [{ x: 1, y, width: DESIGN.width - 2, height }],
        scale,
      )
      return { top: box.y, mean: stats?.meanLuminance ?? Number.NaN }
    }

    const atRest = await bandAt()
    expect(atRest, 'Could not measure the no-JS nav at rest.').not.toBeNull()

    // A real document scroll — no listener involved.
    await page.mouse.wheel(0, NO_JS_WHEEL)
    await page.waitForTimeout(600)
    const scrolled = await bandAt()
    expect(scrolled, 'Could not measure the no-JS nav after scrolling.').not.toBeNull()
    if (scrolled === null) return

    /*
      Off-screen is a PASS. `@media (scripting: none)` returning the bar to
      `position: static` is a legitimate answer — it is byte-for-byte the nav
      that shipped before this change, and a bar that has scrolled away cannot
      be illegible. The failure being hunted is a bar still pinned to the top
      of a paper page while wearing its photograph colours.
    */
    const stillOnScreen = scrolled.top + 4 > 0 && !Number.isNaN(scrolled.mean)
    if (!stillOnScreen) {
      expect(
        scrolled.top,
        'Sanity: the bar reported neither an on-screen band nor an off-screen ' +
          'position, so this assertion proved nothing either way.',
      ).toBeLessThan(DESIGN.height)
      await context.close()
      return
    }

    expect(
      scrolled.mean,
      `With scripting off, the bar is still pinned at y=${scrolled.top.toFixed(0)} ` +
        `after scrolling ${NO_JS_WHEEL}px and its painted ground reads ` +
        `${scrolled.mean.toFixed(4)} — a dark bar sitting on the paper bands, ` +
        'wearing the colours it was given for the photograph.\n' +
        'Two answers work: keep a legible ground with no JS, or drop `position: ' +
        'fixed` under `@media (scripting: none)` so the bar leaves with the ' +
        'hero it was drawn for.',
    ).toBeGreaterThan(MIN_PAPER_LUMINANCE)

    await context.close()
  })

  test('reduced motion removes the ground transition but keeps the state', async ({ browser }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)

    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: DESIGN })
    const page = await context.newPage()
    await page.goto('/', { waitUntil: 'networkidle' })
    await hideDevChrome(page)
    await settle(page)

    const durations = await page.evaluate((selector) => {
      const nav = document.querySelector<HTMLElement>(selector)
      if (!nav) return []
      const nodes: HTMLElement[] = [nav, ...Array.from(nav.querySelectorAll<HTMLElement>('*'))]
      return nodes
        .map((el) => ({
          path: `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0] ?? ''}`,
          duration: getComputedStyle(el).transitionDuration,
        }))
        .filter((n) => n.duration.split(',').some((d) => Number.parseFloat(d) > 0.06))
    }, NAV)

    expect(
      durations.map((d) => `${d.path} — transition-duration: ${d.duration}`),
      'Under `prefers-reduced-motion: reduce` the nav still eases its ground. ' +
        'The reference kills exactly these transitions in its own ' +
        '@media (prefers-reduced-motion: reduce) block. Cross-fading a bar the ' +
        'full width of the viewport between two grounds is a large-area ' +
        'animation, which is the category the preference exists for.',
    ).toEqual([])

    /*
      …AND THE STATE MACHINE MUST STILL WORK. The preference asks for no
      animation, not for no state: a reduced-motion reader who scrolls past the
      hero must get the same legible paper bar everybody else gets, arriving
      instantly instead of over 400ms.
    */
    await scrollTo(page, await pastHero(page))
    const band = await navBand(page)
    expect(band, 'Could not sample the reduced-motion bar after scrolling.').not.toBeNull()
    if (band === null) return

    expect(
      band.meanLuminance,
      `Scrolled past the hero under reduced motion, the bar's painted ground ` +
        `reads ${band.meanLuminance.toFixed(4)} — it never switched. Killing ` +
        'the transition must not kill the state; that turns a preference for ' +
        'less movement into an accessibility regression.',
    ).toBeGreaterThan(MIN_PAPER_LUMINANCE)

    await context.close()
  })
})
