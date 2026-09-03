import { execFileSync } from 'node:child_process'

import type { Browser } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { NOT_LANDED_MESSAGE, heroPhotoHasLanded } from './helpers/hero-assets'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HERO'S VEIL MUST HAVE NO VISIBLE EDGE.
 *
 * ── THE DEFECT THIS EXISTS TO STOP RECURRING ─────────────────────────────
 *
 * Twice now the hero has shipped with a veil that reads as a black rectangle
 * pasted over the photograph, twice it has been fixed by eye, and twice it has
 * come back. The owner's description of it is precise and it is not about
 * darkness:
 *
 *     "it doesn't feel like it blend in the background image, it feel like it
 *      just cut of overlap on top the background image in the back ... look
 *      square over"
 *
 * That is an EDGE — a perceptible geometric boundary where the veil starts and
 * stops. It is a spatial-derivative property of the rendered pixels, which
 * means it is measurable, which means it can be held. `scripts/
 * check-hero-blend.mjs` is the measurement; this file is the part that runs in
 * CI against the page a visitor actually gets.
 *
 * ── WHY THE MEASUREMENT LIVES IN A SCRIPT AND NOT IN THIS FILE ───────────
 *
 * Two consumers need the identical arithmetic: `npm run verify`, which has no
 * server and must be able to answer the question from the stylesheet alone,
 * and this spec, which has a server and should answer it from the real DOM.
 * Two implementations of one threshold is how a threshold drifts.
 *
 * So the script owns the metric and this file shells out to it, which is the
 * same arrangement `hero-contrast.spec.ts` uses for `--emit-extent` and for
 * the same reason: `tsconfig.json` sets `allowJs: false` and excludes
 * `scripts/`, so a `.mjs` gate cannot be imported into a `.ts` spec. The
 * process boundary is the type boundary.
 *
 * ── THE THREE ASSERTIONS, AND WHY EACH IS SEPARATE ──────────────────────
 *
 * 1. THE INSTRUMENT WORKS. Renders a synthetic hard-edged plate and a
 *    synthetic reference-shaped soft radial, and requires the gate to fail the
 *    first and pass the second. A gate that has never been shown to fail is a
 *    gate nobody has tested; a gate that has never been shown to PASS is a
 *    gate that gets deleted the first time it is inconvenient. This runs
 *    whether or not the photograph is on disk, because it is a statement about
 *    the measurement rather than about the page.
 *
 * 2. THE PAGE HOLDS THE PROPERTY. The real hero, at four viewports, with its
 *    content hidden and the photograph replaced by a flat neutral field so
 *    that every gradient in the frame belongs to the veil alone.
 *
 * 3. THE FAST GATE IS HONEST. `npm run verify` runs the script's server-free
 *    harness — the real stylesheet injected into a bare page — and everyone
 *    will trust its number. So the harness's answer is required to match the
 *    real page's, and this is the assertion that notices the day it stops
 *    doing so (a token that only exists in a Tailwind layer, a wrapper that
 *    changes the band's box, a scrim that starts reading something the harness
 *    does not provide).
 *
 * ── THE THRESHOLD IS PINNED HERE ON PURPOSE ──────────────────────────────
 *
 * §0 asserts the constants the script reports. The one predictable way this
 * gate dies is somebody raising `MAX_WINDOW_DELTA_LSTAR` until the page passes
 * — the threshold is derived from the CSS reference pixel, the peak of the
 * contrast sensitivity function and the CIE JND, and none of those are
 * negotiable by this repository. Loosening any of them has to fail a test, not
 * merely be impolite.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/*
  The gate launches its own browser and renders twelve frames in --calibrate
  mode; on a cold shared runner that is not a ten-second job.

  NOT `mode: 'serial'`, deliberately, even though serial would share one gate
  run across all four tests. Serial stops at the first failure, and the first
  failure here will normally be §2 — the page — which would then hide §1 and §3,
  the two assertions that say whether the measurement can be believed at all.
  When a gate is red the diagnostics are the whole value; paying for an extra
  browser launch to keep them is the right trade.
*/
test.describe.configure({ timeout: 180_000 })

const photoLanded = heroPhotoHasLanded()

/* ════════════════════════════════════════════════════════════════════════════
   The gate's JSON, typed at the boundary
   ════════════════════════════════════════════════════════════════════════════ */

interface Hotspot {
  x: number
  y: number
  windowDelta: number
  perPixel: number
  perDegree: number
  curvature: number
  axis: 'horizontal' | 'vertical'
  lstarLo: number
  lstarHi: number
}

interface ViewportResult {
  width: number
  height: number
  pass: boolean
  worst: Hotspot | null
  hotspots: Hotspot[]
  worstCurvature: number
}

interface GateReport {
  threshold: {
    maxWindowDeltaLstar: number
    edgeWindowPx: number
    pxPerDegree: number
    flatFieldSrgb: number
  }
  mode: 'harness' | 'page'
  pass: boolean
  viewports: ViewportResult[]
  calibration: Record<string, { pass: boolean }>
}

/**
 * Runs the gate and returns its report.
 *
 * A non-zero exit is a RESULT here, not a crash: exit 1 means the veil has a
 * visible edge, and the JSON that says where is on stdout either way. Only an
 * exit with no parsable JSON is a genuine failure of the tool, and that is
 * re-thrown with whatever it managed to say on stderr.
 */
function runGate(args: string[]): GateReport {
  let stdout: string
  try {
    stdout = execFileSync('node', ['scripts/check-hero-blend.mjs', ...args, '--json'], {
      encoding: 'utf8',
      cwd: process.cwd(),
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    if (typeof failure.stdout !== 'string' || failure.stdout.trim() === '') {
      throw new Error(
        `scripts/check-hero-blend.mjs produced no JSON (exit ${String(failure.status)}).\n` +
          `${failure.stderr ?? '(no stderr)'}`,
      )
    }
    stdout = failure.stdout
  }
  return JSON.parse(stdout) as GateReport
}

/* One run of each mode per worker process. Tests that happen to land in the
   same worker share the report; tests that do not pay for their own run, which
   is the price of §1 and §3 still reporting when §2 is red. */
let harnessReport: GateReport | null = null
let pageReport: GateReport | null = null

function harness(): GateReport {
  harnessReport ??= runGate(['--calibrate'])
  return harnessReport
}

function realPage(baseURL: string): GateReport {
  pageReport ??= runGate(['--page', baseURL])
  return pageReport
}

/** A failure message that names the geometry, not just the number. */
function describe(report: GateReport, label: string): string {
  const lines = [`${label} — limit ${report.threshold.maxWindowDeltaLstar} L* across ${report.threshold.edgeWindowPx}px`]
  for (const v of report.viewports) {
    const worst = v.worst
    if (worst === null) {
      lines.push(`  ${v.width}x${v.height}  no measurable gradient`)
      continue
    }
    lines.push(
      `  ${v.pass ? 'PASS' : 'FAIL'} ${v.width}x${v.height}  ` +
        `${worst.windowDelta.toFixed(2)} L* across ${report.threshold.edgeWindowPx}px ` +
        `(${worst.perDegree.toFixed(1)} L* per degree) — a ${worst.axis} boundary at ` +
        `(${worst.x}, ${worst.y}) in the band, moving L* ${worst.lstarLo.toFixed(1)} to ` +
        `${worst.lstarHi.toFixed(1)}`,
    )
  }
  return lines.join('\n')
}

/* ════════════════════════════════════════════════════════════════════════════
   §0 · The threshold itself
   ════════════════════════════════════════════════════════════════════════════ */

test('§0 the threshold is the derived one, and has not been loosened', () => {
  const { threshold } = harness()

  /* One CIE JND across the half-cycle of the contrast sensitivity function's
     peak. Both halves are published constants; neither is this repo's to move.
     A gate may be made STRICTER without failing here — only weakening trips. */
  expect(threshold.maxWindowDeltaLstar).toBeLessThanOrEqual(1.0)
  expect(threshold.edgeWindowPx).toBeLessThanOrEqual(6)

  /* The CSS reference pixel: arctan(1 / (96 x 28)) per pixel. This is what
     lets one threshold cover a 375px phone and a 1600px desktop. */
  expect(threshold.pxPerDegree).toBeGreaterThan(46)
  expect(threshold.pxPerDegree).toBeLessThan(48)

  /* The veil is judged over a field brighter than ~92% of the shipped rungs.
     Judging it over something DARKER would flatter every edge, because an
     edge's visibility scales with what is behind it. */
  expect(threshold.flatFieldSrgb).toBeGreaterThanOrEqual(128)
})

/* ════════════════════════════════════════════════════════════════════════════
   §1 · The instrument
   ════════════════════════════════════════════════════════════════════════════ */

test('§1 the gate fails a hard-edged plate and passes a soft radial', () => {
  const report = harness()

  expect(
    report.calibration.plate,
    'the --calibrate mode did not report the synthetic plate; the gate cannot prove itself',
  ).toBeDefined()
  expect(
    report.calibration.soft,
    'the --calibrate mode did not report the synthetic radial; the gate cannot prove itself',
  ).toBeDefined()

  expect(
    report.calibration.plate?.pass,
    'A HARD-EDGED PLATE PASSED. The measurement is blind — every green run of this ' +
      'gate since it was written means nothing. Fix scripts/check-hero-blend.mjs.',
  ).toBe(false)

  expect(
    report.calibration.soft?.pass,
    'A REFERENCE-SHAPED SOFT RADIAL FAILED. The threshold is unachievable by any veil, ' +
      'which makes it a threshold nobody can satisfy and therefore one somebody will ' +
      'delete. Either the shape is wrong or the arithmetic is; do NOT raise the limit.',
  ).toBe(true)
})

/* ════════════════════════════════════════════════════════════════════════════
   §2 · The page
   ════════════════════════════════════════════════════════════════════════════ */

test('§2 the shipped veil has no perceptible boundary at any viewport', async ({ baseURL }) => {
  test.skip(!photoLanded, NOT_LANDED_MESSAGE)
  expect(baseURL, 'no baseURL — playwright.config.ts should always supply one').toBeTruthy()

  const report = realPage(baseURL as string)

  /* All four rungs of the viewport ladder must have been measured. Two sit
     below --container-wrap, where the pocket's horizontal aperture is
     identically zero and the vertical ramps are the only shaping there is, and
     two sit above it. A report that quietly measured three is a report about a
     different page. */
  expect(report.viewports.map((v) => v.width)).toEqual([375, 768, 1280, 1600])

  const failing = report.viewports.filter((v) => !v.pass)
  expect(
    failing.length,
    `${describe(report, 'THE VEIL HAS A VISIBLE EDGE')}\n\n` +
      'This is not fixed by lightening the scrim — check-hero-contrast.mjs owns the ' +
      'per-glyph ceiling and must stay green. It is fixed by widening the FALLOFF: a ' +
      'smoothstep carrying dL* needs about 10.5 x dL* pixels of span, and that span has ' +
      'to live outside the text extent. Run `node scripts/check-hero-blend.mjs --page ' +
      `${baseURL ?? ''} --shots ./test-results/blend` + '` to look at the frames.',
  ).toBe(0)
})

/* ════════════════════════════════════════════════════════════════════════════
   §3 · The fast gate and the real page must agree
   ════════════════════════════════════════════════════════════════════════════ */

test('§3 the server-free harness measures the same veil as the page', async ({ baseURL }) => {
  test.skip(!photoLanded, NOT_LANDED_MESSAGE)

  const fromHarness = harness()
  const fromPage = realPage(baseURL as string)

  expect(fromHarness.mode).toBe('harness')
  expect(fromPage.mode).toBe('page')

  for (const [index, harnessViewport] of fromHarness.viewports.entries()) {
    const pageViewport = fromPage.viewports[index]
    expect(pageViewport?.width).toBe(harnessViewport.width)

    const a = harnessViewport.worst?.windowDelta ?? 0
    const b = pageViewport?.worst?.windowDelta ?? 0

    /* 15% and 0.25 L*: the two renders are the same stylesheet over the same
       flat field, so they agree to within rasteriser noise and the handful of
       pixels the real page's own compositing touches. The absolute floor
       matters because a ratio between two near-zero numbers is meaningless
       once the veil is actually smooth. */
    const tolerance = Math.max(0.25, 0.15 * Math.max(a, b))
    expect(
      Math.abs(a - b),
      'THE SERVER-FREE HARNESS NO LONGER MEASURES THE REAL PAGE.\n' +
        `  ${harnessViewport.width}px: harness ${a.toFixed(2)}, page ${b.toFixed(2)} ` +
        `(tolerance ${tolerance.toFixed(2)})\n` +
        '  `npm run verify` trusts the harness, so a harness that has drifted is worse ' +
        'than no gate at all. Something the scrim reads is no longer being reproduced by ' +
        'scripts/check-hero-blend.mjs — most likely a custom property that moved out of ' +
        "app/globals.css's :root / @theme / [data-ground=\"ink\"] blocks, or a wrapper " +
        "that changed the band's box.",
    ).toBeLessThanOrEqual(tolerance)
  }
})

/* ════════════════════════════════════════════════════════════════════════════
   §4 · THE VEIL MUST NOT BE DEEPER THAN LEGIBILITY REQUIRES
   ════════════════════════════════════════════════════════════════════════════

   ── A DIFFERENT DEFECT FROM §2, AND BOTH ARE LIVE ─────────────────────────

   §1–§3 ask whether the veil has a visible EDGE. This section asks whether it
   has any picture left underneath it, which is the other half of the owner's
   complaint and is not implied by a smooth ramp: a perfectly smooth ramp to
   opaque black is still opaque black.

       "the text is integrated elegantly blend into the background image ...
        for our page currently that the black part around the text still blur
        the background image"

   MEASURED on the live page (Chromium, dpr 1, `--focus` pinned to 0,
   2026-09-03). Effective veil alpha recovered exactly from a black-field /
   white-field probe pair — no assumption about stops, masks or flattening
   order, because a is read off the composited framebuffer:

       c_black = a·g                 c_white = (1-a)·255 + a·g
       =>  a = 1 - (c_white - c_black) / 255

       region                                     alpha      picture survives
       reading measure, over the photograph       0.902      25 sRGB levels
       outer margin, 1280 and 1600 (aperture)     0.659      87 sRGB levels
       outer margin, 375 and 768 (no aperture)    0.902      25 sRGB levels
       below the photograph's box                 1.000       0 sRGB levels

   The reference, measured the same way from its own stylesheet's declarations
   (/Users/dcnguyen060899/Downloads/MAVTERRAS, read-only — read, reproduced in an isolated harness,
   never run in place): a flat 0.6797 over its copy, 0.094–0.20 away from it,
   and 81.7 surviving sRGB levels under every glyph it carries.

   ── THE BUDGET IS DERIVED, NOT CHOSEN ─────────────────────────────────────

   A veil over a photograph exists for exactly one reason: to make the ratios
   `app/globals.css` publishes for the ink ground true again against arbitrary
   pixels. So the deepest it may legitimately be is the deepest ANY foreground
   role in the band actually needs, worst case, against a #FFFFFF source pixel:

       role                 4.5:1 ×1.05    3:1 ×1.05    survives at 4.5:1
       --fg       #F2F1EE     a ≥ 0.6353    a ≥ 0.5116     93.0 levels
       --fg-muted #A3A2A8     a ≥ 0.8595    a ≥ 0.7478     35.8 levels
       --fg-accent #FF5252    a ≥ 0.9297    a ≥ 0.8108     17.9 levels

   The band remaps `--fg-accent` to `--fg`, so `--fg-muted` binds today and the
   budget is 0.8595. Anything deeper than that buys no legibility at all; it
   only removes picture. THAT is what this section measures, and it is the
   exact complement of `scripts/check-hero-contrast.mjs`, which owns the floor.
   The two together pin the veil from both sides, and NEITHER may be loosened:
   raising this budget is how the hero goes black again, and lowering the
   contrast floor is how it goes illegible.

   The ×1.05 is the same headroom convention the contrast gate uses. The
   budget is computed AT RUNTIME from the colours actually painted in the band,
   so it follows the copy: if a future round drops `--fg-muted` off the
   photographic region — which is what the reference does, and what its own
   `.eyebrow` rule says it does — the budget falls to 0.6353 on its own and
   this gate starts demanding the wider picture that change earns.

   ── WHY THIS PROBE IS DUPLICATED FROM hero-photo.spec.ts ──────────────────

   That file's `readPhotoExtent` reads the same geometry. It is not shared,
   because the shared thing would have to live in `tests/e2e/helpers/`, which
   this territory does not own. What is deliberately NOT duplicated is any
   threshold: every number below is computed from tokens read out of the page.
   ════════════════════════════════════════════════════════════════════════════ */

import { decodePng } from './helpers/pixels'
import { parseColor, relativeLuminance, requiredRatio, type Rgb } from './helpers/color'

/** Band geometry, the photograph's painted extent, and every text run in it. */
interface BandProbe {
  band: { top: number; height: number; width: number }
  /** Painted extent of the photograph, band-relative, after every clip. */
  photo: { top: number; bottom: number } | null
  runs: {
    text: string
    top: number
    left: number
    width: number
    height: number
    color: string
    fontSizePx: number
    fontWeight: number
    /**
     * False when the run sits on its own opaque background — a filled button,
     * a card — rather than on the veil. Such a run says nothing about the veil
     * and its colour must not be allowed to set the veil's budget: the primary
     * CTA's label is ink-on-bone and would demand alpha 1.0 forever.
     */
    onVeil: boolean
  }[]
  ground: string
}

const readBand = (): BandProbe => {
  const band = document.querySelector('#top')
  if (band === null) throw new Error('#top is not in the document')
  const rect = band.getBoundingClientRect()

  let photoTop: number | null = null
  let photoBottom: number | null = null
  for (const img of band.querySelectorAll('img')) {
    if (img.naturalWidth === 0) continue
    let box = img.getBoundingClientRect()
    for (let node = img.parentElement; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (!/clip|hidden|auto|scroll/.test(style.overflow + style.overflowY)) continue
      const clip = node.getBoundingClientRect()
      box = new DOMRect(
        box.left,
        Math.max(box.top, clip.top),
        box.width,
        Math.max(0, Math.min(box.bottom, clip.bottom) - Math.max(box.top, clip.top)),
      )
    }
    if (box.height <= 0) continue
    photoTop = photoTop === null ? box.top : Math.min(photoTop, box.top)
    photoBottom = photoBottom === null ? box.bottom : Math.max(photoBottom, box.bottom)

    /* Mark the box the flat-field probe must repaint: the outermost ancestor
       of this <img> that is still a descendant of the band. It is tagged here,
       from the element that actually carries pixels, rather than matched by a
       selector — `#top > [aria-hidden="true"]` also selects the SCRIM, and
       painting a flat `background` over that element destroys the very
       gradient the probe exists to measure (it silently reports the pocket
       alone and drops the field, which reads as a plausible-looking number).
       This bug was live in an earlier draft of this file; do not reintroduce a
       selector here. */
    let box_owner: Element = img
    while (box_owner.parentElement !== null && box_owner.parentElement !== band) {
      box_owner = box_owner.parentElement
    }
    box_owner.setAttribute('data-hero-photo-box', '')
  }

  /** True when nothing between the text and the band paints an opaque field. */
  const onVeil = (from: Element): boolean => {
    for (let node: Element | null = from; node !== null && node !== band; node = node.parentElement) {
      const paint = getComputedStyle(node).backgroundColor
      const alpha = /rgba?\(([^)]+)\)/.exec(paint)
      if (alpha === null) continue
      const parts = alpha[1]?.split(/[,/]/).map((n) => Number.parseFloat(n)) ?? []
      if (parts.length < 4 || (parts[3] ?? 0) > 0.01) {
        if (paint !== 'rgba(0, 0, 0, 0)' && paint !== 'transparent') return false
      }
    }
    return true
  }

  const runs: BandProbe['runs'] = []
  const walker = document.createTreeWalker(band, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim()
    if (text === '') continue
    const parent = node.parentElement
    if (parent === null) continue
    const style = getComputedStyle(parent)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const box of range.getClientRects()) {
      if (box.width < 1 || box.height < 1) continue
      runs.push({
        text: text.slice(0, 44),
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        color: style.color,
        fontSizePx: Number.parseFloat(style.fontSize),
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
        onVeil: onVeil(parent),
      })
    }
  }

  return {
    band: { top: rect.top, height: rect.height, width: rect.width },
    photo: photoTop === null || photoBottom === null ? null : { top: photoTop, bottom: photoBottom },
    runs,
    ground: getComputedStyle(band).getPropertyValue('--ground').trim() || '#14161A',
  }
}

/**
 * The minimum veil alpha at which `fg` clears `ratio` over the worst source
 * pixel the photograph can contain (#FFFFFF), when the veil is `ground`.
 *
 * Bisection rather than algebra: the sRGB transfer function is piecewise and
 * the composite is per-channel, so the closed form is three cases and a
 * quadratic. 60 halvings resolves to well under a thousandth of an alpha step.
 */
function minimumAlphaFor(fg: Rgb, ground: Rgb, ratio: number, headroom = 1.05): number {
  const yf = relativeLuminance(fg)
  const need = ratio * headroom
  let lo = 0
  let hi = 1
  for (let i = 0; i < 60; i += 1) {
    const a = (lo + hi) / 2
    const backdrop: Rgb = {
      r: (1 - a) * 255 + a * ground.r,
      g: (1 - a) * 255 + a * ground.g,
      b: (1 - a) * 255 + a * ground.b,
      a: 1,
    }
    const yb = relativeLuminance(backdrop)
    if ((yf + 0.05) / (yb + 0.05) >= need) hi = a
    else lo = a
  }
  return hi
}

/** Median effective alpha inside a box of the recovered alpha field. */
function medianAlpha(
  field: { width: number; height: number; alpha: Float32Array },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number | null {
  const left = Math.max(0, Math.round(x0))
  const top = Math.max(0, Math.round(y0))
  const right = Math.min(field.width, Math.round(x1))
  const bottom = Math.min(field.height, Math.round(y1))
  if (right <= left || bottom <= top) return null
  const values: number[] = []
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) values.push(field.alpha[y * field.width + x] as number)
  }
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)] as number
}

const DEPTH_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1600, height: 900 },
] as const

/** The repo's standing headroom on every published contrast ratio. */
const HEADROOM = 1.05

/**
 * One measurement, shared by the two tests below.
 *
 * NOT `mode: 'serial'` and not one test with two assertions, for the reason
 * §1–§3 already give: the first `expect` to fail aborts the test, and these two
 * findings are independent — the veil can be too deep without extinguishing a
 * single row, and it can extinguish rows while every glyph sits inside budget.
 * A red gate whose second diagnostic never printed is a gate that gets fixed
 * halfway.
 */
interface DepthMeasurement {
  probe: BandProbe
  photo: NonNullable<BandProbe['photo']>
  field: { width: number; height: number; alpha: Float32Array }
  budget: number
  bindingRole: string
  /** Runs painted on the veil AND on the photograph, with their veil alpha. */
  rows: { run: BandProbe['runs'][number]; alpha: number }[]
}

async function measureDepth(
  browser: Browser,
  viewport: { width: number; height: number },
): Promise<DepthMeasurement> {
  const context = await browser.newContext({ viewport: { ...viewport } })
  const page = await context.newPage()
  try {
    await page.goto('/', { waitUntil: 'load' })
    await page.waitForLoadState('networkidle').catch(() => undefined)
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--focus', '0')
    })

    const probe = await page.evaluate(readBand)
    if (probe.photo === null) {
      throw new Error(
        'No hero <img> decoded to any pixels — there is no veil over a photograph to measure.',
      )
    }
    const photo = probe.photo
    const ground: Rgb = parseColor(probe.ground) ?? { r: 20, g: 22, b: 26, a: 1 }

    const clip = {
      x: 0,
      y: probe.band.top + (await page.evaluate(() => scrollY)),
      width: Math.round(probe.band.width),
      height: Math.ceil(probe.band.height),
    }

    /* The photograph replaced by a flat field, the copy hidden. Two shots at
       the two extremes of the source range recover alpha exactly. */
    const shots: Record<string, ReturnType<typeof decodePng>> = {}
    for (const [name, colour] of [
      ['black', '#000000'],
      ['white', '#ffffff'],
    ] as const) {
      const style = await page.addStyleTag({
        content:
          `#top picture, #top img { visibility: hidden !important; }\n` +
          `#top [data-hero-photo-box] { background: ${colour} !important; }\n` +
          `#top .wrap { visibility: hidden !important; }`,
      })
      shots[name] = decodePng(await page.screenshot({ fullPage: true, clip }))
      await style.evaluate((el: Element) => {
        el.remove()
      })
    }
    const black = shots.black as ReturnType<typeof decodePng>
    const white = shots.white as ReturnType<typeof decodePng>

    const alpha = new Float32Array(black.width * black.height)
    for (let p = 0, i = 0; p < alpha.length; p += 1, i += 4) {
      const c0 =
        ((black.data[i] as number) + (black.data[i + 1] as number) + (black.data[i + 2] as number)) / 3
      const c1 =
        ((white.data[i] as number) + (white.data[i + 1] as number) + (white.data[i + 2] as number)) / 3
      alpha[p] = 1 - (c1 - c0) / 255
    }
    const field = { width: black.width, height: black.height, alpha }

    /* THE BUDGET. The deepest veil any role painted on the veil actually needs. */
    let budget = 0
    let bindingRole = '(none)'
    for (const run of probe.runs) {
      if (!run.onVeil) continue
      const fg = parseColor(run.color)
      if (fg === null) continue
      const need = minimumAlphaFor(fg, ground, requiredRatio(run.fontSizePx, run.fontWeight), HEADROOM)
      /* A foreground DARKER than the ground can never clear its ratio over a
         darkening veil, so the bisection saturates at 1. That is not a budget,
         it is a run this probe should not have been given — either `onVeil`
         missed an opaque chip, or a genuinely illegible colour shipped, and
         `scripts/check-hero-contrast.mjs` owns the second. */
      if (need >= 1) {
        throw new Error(
          `${run.color} at ${run.fontSizePx.toFixed(1)}px ("${run.text}") cannot reach ` +
            `${requiredRatio(run.fontSizePx, run.fontWeight)}:1 over ANY veil of ${probe.ground}. ` +
            'It is reported as painted directly on the veil. If it sits on a filled control, ' +
            'the `onVeil` walk in readBand needs to see that background; if it does not, this ' +
            'is a contrast defect and belongs to check-hero-contrast.mjs.',
        )
      }
      if (need > budget) {
        budget = need
        bindingRole = `${run.color} at ${run.fontSizePx.toFixed(1)}px ("${run.text}")`
      }
    }

    const onPhoto: BandProbe['runs'] = probe.runs.filter(
      (run) => run.onVeil && run.top >= photo.top && run.top + run.height <= photo.bottom,
    )
    const rows = onPhoto
      .map((run) => ({
        run,
        alpha: medianAlpha(
          field,
          run.left,
          run.top - probe.band.top,
          run.left + run.width,
          run.top - probe.band.top + run.height,
        ),
      }))
      .filter((row): row is { run: BandProbe['runs'][number]; alpha: number } => row.alpha !== null)

    return { probe, photo, field, budget, bindingRole, rows }
  } finally {
    await context.close()
  }
}

test.describe('hero veil: no deeper than legibility requires', () => {
  for (const viewport of DEPTH_VIEWPORTS) {
    const label = `${viewport.width}x${viewport.height}`

    test(`the photograph survives under every glyph at ${label}`, async ({ browser }) => {
      test.skip(!photoLanded, NOT_LANDED_MESSAGE)

      const { probe, budget, bindingRole, rows } = await measureDepth(browser, viewport)
      expect(budget, 'no text run in the band carried a parsable colour').toBeGreaterThan(0)

      const tooDeep = rows.filter((row: DepthMeasurement['rows'][number]) => row.alpha > budget * HEADROOM)
      const table = rows
        .map(
          (row) =>
            `    a ${row.alpha.toFixed(4)}  survives ${((1 - row.alpha) * 255).toFixed(1)} levels  ` +
            `y ${(row.run.top - probe.band.top).toFixed(0)}  ${row.run.fontSizePx.toFixed(1)}px ` +
            `${row.run.color}  "${row.run.text}"`,
        )
        .join('\n')

      expect(
        tooDeep.map(
          (row) =>
            `${row.alpha.toFixed(4)} @ y${(row.run.top - probe.band.top).toFixed(0)} "${row.run.text}"`,
        ),
        'THE VEIL IS DEEPER THAN ANY FOREGROUND IN THIS BAND NEEDS.\n' +
          `  ${label} — budget ${budget.toFixed(4)} x${HEADROOM} = ${(budget * HEADROOM).toFixed(4)}, ` +
          `set by ${bindingRole}\n` +
          `  at that budget the photograph survives into ${((1 - budget) * 255).toFixed(1)} sRGB levels; ` +
          `the reference (/Users/dcnguyen060899/Downloads/MAVTERRAS) runs 0.6797 over its copy and survives into 81.7.\n` +
          `  every run over the photograph:\n${table}\n\n` +
          'Veil deeper than the budget buys nothing — it removes picture and returns no ' +
          'legibility. DO NOT fix this by raising the budget: it is computed from the colours ' +
          'this band actually paints, so raising it means repainting the copy in a weaker ' +
          'role, which is the opposite of the intent.\n' +
          'Two real levers, in order of what they are worth:\n' +
          '  1. Drop --fg-muted off the photographic region (budget 0.8595 -> 0.6353, ' +
          '35.8 -> 93.0 surviving levels — which beats the reference). components/site/hero.tsx.\n' +
          '  2. Stop the scrim ramping to a bare --ground stop while a photograph is still ' +
          'behind it. components/site/hero-scrim.module.css.',
      ).toEqual([])
    })
  }
})

test.describe('hero veil: never fully opaque over the photograph', () => {
  for (const viewport of DEPTH_VIEWPORTS) {
    const label = `${viewport.width}x${viewport.height}`

    test(`no row of the photograph is extinguished at ${label}`, async ({ browser }) => {
      test.skip(!photoLanded, NOT_LANDED_MESSAGE)

      const { probe, photo, field } = await measureDepth(browser, viewport)

      /* Stated over the photograph's whole painted AREA rather than over the
         runs, because the worst of it is BETWEEN them: at 375x812 the veil
         reaches 1.000 at y 824 while the picture runs to y 861, and no glyph
         happens to sit in those 37 rows. A row is "extinguished" when its
         median alpha is >= 0.999 — under a quarter of one sRGB level left. */
      const top = Math.max(0, Math.round(photo.top - probe.band.top))
      const bottom = Math.min(field.height, Math.round(photo.bottom - probe.band.top))
      const extinguished: number[] = []
      for (let y = top; y < bottom; y += 1) {
        const median = medianAlpha(field, 0, y, field.width, y + 1)
        if (median !== null && median >= 0.999) extinguished.push(y)
      }

      /* One row of slack for the rasteriser at the picture's own bottom edge. */
      const SLACK_ROWS = 1
      expect(
        Math.max(0, extinguished.length - SLACK_ROWS),
        'THE VEIL IS FULLY OPAQUE OVER A REGION THAT HAS A PHOTOGRAPH IN IT.\n' +
          `  ${label} — the photograph is painted from y ${top} to y ${bottom} of a ` +
          `${probe.band.height.toFixed(0)}px band, and ${extinguished.length} of those ` +
          `${bottom - top} rows composite at alpha >= 0.999` +
          (extinguished.length === 0
            ? ''
            : ` (y ${extinguished[0] as number} .. ${extinguished[extinguished.length - 1] as number})`) +
          '.\n' +
          '  Those rows are downloaded, decoded, composited and then completely covered — the ' +
          'visitor pays for them and never sees them, and the seam where they begin is a ' +
          'horizontal edge across the full width of the band.\n' +
          '  Territory: components/site/hero-scrim.module.css — the field and the pocket both ' +
          "ramp to a bare `var(--ground)` stop, and that stop lands inside the picture's box.",
      ).toBe(0)
    })
  }
})
