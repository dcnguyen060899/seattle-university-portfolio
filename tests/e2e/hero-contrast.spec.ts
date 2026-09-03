import { execFileSync } from 'node:child_process'

import AxeBuilder from '@axe-core/playwright'
import type { Result } from 'axe-core'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  GROUND_TOKENS,
  contrastRatio,
  flatten,
  isLargeText,
  relativeLuminance,
  parseColor,
  requiredRatio,
  round2,
  type Rgb,
} from './helpers/color'
import { heroPhotoHasLanded, pinFocus } from './helpers/hero-assets'
import { freezeMotion } from './helpers/page'
import { decodePng, describePatch, sampleRects, type PatchStats, type Rect } from './helpers/pixels'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HERO'S LEGIBILITY OVER A PHOTOGRAPH — the gate that protects the page's
 * whole argument.
 *
 * ── WHY THIS FILE HAS TO EXIST SEPARATELY ────────────────────────────────
 *
 * The hero is `data-ground="ink"`. Every colour in it is published in
 * `app/globals.css` as a measured ratio against a FLAT #14161A — `--fg` at
 * 16.04:1, `--fg-muted` at 7.15:1, `--fg-accent` resolving to #FF5252 at
 * 5.68:1 because the brand crimson #AA0000 is 2.34:1 there and fails AA body,
 * AA large AND the 1.4.11 non-text minimum simultaneously.
 *
 * PUTTING A PHOTOGRAPH BEHIND THAT TEXT INVALIDATES EVERY ONE OF THOSE
 * MEASUREMENTS. They describe a colour that is no longer painted there.
 *
 * Neither of the existing gates can see it:
 *   - axe cannot evaluate contrast through a background image. It reports
 *     `incomplete`, not `violation`, and this suite (correctly) asserts on
 *     violations. A hero whose H1 sits on a sunlit sky passes axe.
 *   - `crimson-contrast.spec.ts` resolves backdrops by hit-testing
 *     `background-color` and explicitly skips samples whose backdrop is an
 *     image (`backgroundIsImage`), because an image has no single colour.
 *
 * So this file reads the pixels the browser actually painted, with the hero's
 * own text and borders made invisible, and does the WCAG arithmetic against
 * them. It is the only gate in the repository that can fail when a bright
 * region of a photograph slides under a headline.
 *
 * ── THE TWO ASSERTIONS, AND WHY THERE ARE TWO ────────────────────────────
 *
 * 1. TEXT — the absolute WCAG floor, no exceptions. 4.5:1 for body, 3:1 for
 *    large (>=24px, or >=18.66px bold — and the display face here is set at
 *    200–300 weight, so in practice only a genuine 24px earns the allowance).
 *    Judged at the patch's SHOULDER (p05/p95, whichever is worse) because a
 *    photograph speckles and one stray pixel is not a legibility fact; and at
 *    the EXTREMES against a hard 3:1 floor, because a hot pixel directly under
 *    a glyph is.
 *
 * 2. NON-TEXT (borders, rules) — `shoulder >= min(3, baseline * 0.85)`, where
 *    `baseline` is what the same colour measures over the FLAT ink ground.
 *    One expression carrying both intents:
 *      · a graphical object that carries meaning — the `<Threshold>` rule at
 *        `--fg-accent`, 5.68:1 on ink — has to clear the real 1.4.11 minimum
 *        of 3:1 over the photograph.
 *      · `--edge`, the decorative hairline, measures 1.37:1 on ink and
 *        `globals.css` waives 1.4.11 for it with a written argument (the
 *        records it separates are also separated by space and by type
 *        hierarchy, so it carries no unique information). Relitigating that
 *        waiver is not this file's job — but the photograph must not make it
 *        WORSE than the flat ground it was waived on.
 *    The rule cannot be satisfied by weakening it: the only way to lower a
 *    baseline is to change the ink palette, and `scripts/check-ground-tokens.mjs`
 *    already guards that.
 *
 * ── THIS FILE IS NOT GATED ON THE PHOTOGRAPH ─────────────────────────────
 *
 * With no photograph the backdrop is the flat ink ground, every measurement
 * lands exactly on its published value, and the gate is a tautology that
 * proves the instrument works. That is the point: it is calibrated on the
 * known-good state before it is ever asked about an unknown one. Only the
 * `--focus`-extreme states are gated, because they do not exist until the
 * cross-fade does.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const photoLanded = heroPhotoHasLanded()

const VIEWPORTS = [
  { key: '375', width: 375, height: 812 },
  { key: '768', width: 768, height: 1024 },
  { key: '1280', width: 1280, height: 800 },
] as const

/** The flat ink ground every published hero ratio was measured against. */
const INK = parseColor(GROUND_TOKENS.ink) as Rgb

/**
 * How far a non-text object may fall below its flat-ink baseline before the
 * photograph counts as having damaged it. 15% is roughly the spread a
 * photographic backdrop produces across a hairline's own length; below that
 * the object is measurably fainter than the design system says it is.
 */
const REGRESSION_TOLERANCE = 0.85

/** WCAG 1.4.11 — the floor for a graphical object that carries information. */
const NON_TEXT_MINIMUM = 3

/* ════════════════════════════════════════════════════════════════════════════
   THE GEOMETRY CONTRACT WITH THE BUILD GATE

   `scripts/check-hero-contrast.mjs` rasterises the scrim into an alpha field
   and evaluates every threshold at a POSITION. To do that without a browser it
   has to know where the glyphs are, and it declares that in one table —
   TEXT_EXTENT — as the fraction of the band's box any glyph reaches.

   THAT TABLE IS THE ONLY ASSUMPTION IN THAT FILE, AND IT IS THE ONE A SHAPED
   SCRIM MAKES DANGEROUS. A pocket that darkens 30% of the frame is legal if
   and only if the other 70% carries no glyphs; a stale extent table would let
   that pocket look green in `npm run verify` while a line of 10.5px muted type
   sits outside it on the real page.

   So the table is not trusted, it is PROVEN — here, in Chromium, against the
   glyph rectangles the browser actually laid out. The build gate states the
   geometry; this file measures it. Keep both, or keep neither.

   Read through the script's own `--emit-extent` flag rather than by importing
   it: one stable interface, no Playwright TS/ESM interop, and no second copy
   of the table that could drift from the first.
   ════════════════════════════════════════════════════════════════════════════ */

interface ExtentRow {
  w: number
  bandH: number
  x0: number
  x1: number
  y0: number
  y1: number
}

const EXTENT: { margin: number; rows: ExtentRow[]; inflated: ExtentRow[] } = JSON.parse(
  execFileSync('node', ['scripts/check-hero-contrast.mjs', '--emit-extent'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  }),
)

/** The declared box for a viewport width — nearest row at or below it. */
function declaredExtent(width: number): ExtentRow {
  let pick = EXTENT.inflated[0] as ExtentRow
  for (const row of EXTENT.inflated) if (row.w <= width) pick = row
  return pick
}

/* ════════════════════════════════════════════════════════════════════════════
   THE ROSTER — every text-bearing thing the hero renders, named.

   WHY A ROSTER AND NOT A COUNT. The version of this file that shipped before
   asserted `textTargets.length >= 6`. That is an "is the instrument plugged
   in" check and it is genuinely useful, but it cannot tell the difference
   between sampling the six easiest runs and sampling the six that matter. The
   11px crimson eyebrow is historically the binding case in this hero — it
   measured 4.449:1 at one point in this project, a real AA failure that read
   as green everywhere — and a count-based floor would pass a run that never
   looked at it.

   Each entry is matched against the sampled targets by its own text. An entry
   that is never found ANYWHERE across the three sampled scroll states fails
   the run: either the copy changed (update this roster in the same commit) or
   the sampler stopped reaching it, and both are things somebody has to know.

   `optional` marks the two entries that legitimately may not exist: the
   AI-disclosure line only renders when a photograph landed, and the ghost
   button's border only exists as a border.
   ════════════════════════════════════════════════════════════════════════════ */

interface RosterEntry {
  id: string
  /** What this thing is, for the failure message. */
  what: string
  /** Matched against the sampled target's trimmed text, case-insensitively. */
  match: RegExp
  optional?: boolean
}

const ROSTER: RosterEntry[] = [
  {
    id: 'eyebrow',
    what: '11px --fg-accent eyebrow — the historically binding case in this band',
    match: /seattle,\s*washington/i,
  },
  { id: 'h1', what: 'the h1', match: /^duy nguyen$/i },
  {
    id: 'statement',
    what: 'the display statement',
    match: /i design experiments/i,
  },
  {
    id: 'threshold-cleared',
    what: "the Threshold's cleared value",
    match: /the only arm of/i,
  },
  {
    id: 'threshold-floor',
    what: "the Threshold's floor line",
    match: /held-out majority-class retrieval floor/i,
  },
  {
    id: 'threshold-value',
    what: "the Threshold's P@1 value",
    match: /p@1/i,
  },
  {
    id: 'readout-award',
    what: 'the award Readout label',
    match: /student data scrollytelling contest/i,
  },
  {
    id: 'readout-db',
    what: 'the barn-owl database Readout label',
    match: /queryable database for the barn-owl lab/i,
  },
  /*
    WAS `thesis`, matching /every figure on this page is licensed/. That
    sentence is no longer in this band — it is rendered by
    components/site/research-band.tsx, a different band with a different
    ground — so the entry named an element the hero cannot produce and the
    roster check failed at every sampled viewport for a copy move, not a
    contrast defect. Verified against the live band's text runs (2026-09-03,
    1280x800): 21 runs, none matching the old pattern.

    It is replaced rather than deleted, and by the one text-bearing thing in
    this band the roster had never named: the AI-disclosure line. It is
    foreground copy over the photograph like everything else here, it is the
    line hero-photo.spec.ts requires to render whenever the picture does, and
    until now nothing asserted that the CONTRAST sampler was still reaching
    it. Naming it makes this gate strictly stronger than the one that shipped.
  */
  {
    id: 'ai-disclosure',
    what: 'the AI-disclosure line under the photograph',
    match: /ai-generated composite/i,
  },
  {
    id: 'cta-primary',
    what: 'the primary call to action',
    match: /ask about a role/i,
  },
  {
    id: 'cta-ghost',
    what: "the ghost button's label",
    match: /r[eé]sum[eé]/i,
  },
  { id: 'evidence-link', what: 'the GitHub evidence link', match: /github/i },
]

/**
 * The <Limit> block. Its lines come from the corpus at runtime, so matching
 * them by literal text would be matching a copy deck this file does not own.
 * They are asserted as a GROUP instead: at least two limits always, and a
 * third — the AI-disclosure line — once a photograph has landed, because that
 * line exists only when there is a generated image to disclose.
 */
const LIMIT_LINES_MINIMUM = photoLanded ? 3 : 2

/* ════════════════════════════════════════════════════════════════════════════
   axe — the half of the problem a scanner CAN see
   ════════════════════════════════════════════════════════════════════════════ */

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

function summariseViolations(violations: Result[]): string[] {
  return violations.map(
    (violation) =>
      `${violation.impact ?? 'unknown'}: ${violation.id} @ ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  )
}

test.describe('hero: axe over the band that carries the photograph', () => {
  for (const viewport of VIEWPORTS) {
    test(`zero WCAG AA violations in the hero at ${viewport.key}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/', { waitUntil: 'load' })
      await freezeMotion(page)

      const results = await new AxeBuilder({ page })
        .include('#top')
        .withTags([...WCAG_AA])
        .analyze()

      expect(
        summariseViolations(results.violations),
        `axe found WCAG AA violations inside the hero at ${viewport.key}:\n  ` +
          summariseViolations(results.violations).join('\n  ') +
          '\n\nNOTE: axe cannot evaluate contrast through a background image — it reports those ' +
          'as `incomplete`, never as violations. A green run here is necessary and NOT ' +
          'sufficient; the pixel sampler below is what covers text over the photograph.',
      ).toEqual([])
    })
  }
})

/* ════════════════════════════════════════════════════════════════════════════
   The pixel sampler
   ════════════════════════════════════════════════════════════════════════════ */

/** One thing whose contrast has to hold: a run of text, or a painted object. */
interface Target {
  id: string
  kind: 'text' | 'border' | 'rule'
  /** The element's own tag, so the <Limit> list items can be counted as a group. */
  tag: string
  /** Short DOM path, for the failure message. */
  path: string
  /** Trimmed text, for the failure message. Empty for non-text. */
  text: string
  /** The colour the browser paints, possibly translucent. */
  color: string
  fontSizePx: number
  fontWeight: number
  /** Rectangles whose PIXELS are the backdrop of this target. Viewport coords. */
  rects: Rect[]
}

/**
 * SAMPLING BASIS — glyph extents, not block boxes.
 *
 * An H1's block box spans the page measure, most of which is textless. Gating
 * on it measures pixels no glyph ever sits on: the reference repo measured the
 * same scrim at 5.84:1 on glyph rects and 3.46:1 on the block box, and gating
 * on the block box forced a full-width scrim plateau that the design did not
 * want and did not need. So: per text node, `Range.getClientRects()`, zero-size
 * rects dropped, each inflated by 2px to catch the anti-aliasing halo. The
 * basis auto-tracks copy reflow, which no hard-coded rectangle can.
 *
 * For a BORDER the backdrop is the border strip itself — with `border-color`
 * neutralised, those pixels are whatever is painted underneath, which is
 * exactly what the border has to be distinguishable from.
 *
 * For a RULE (a thin filled bar, like `<Threshold>`'s 2px accent rule) the
 * backdrop is a band immediately OUTSIDE the bar on its long sides: a filled
 * object is distinguished from what surrounds it, not from what is under it.
 */
async function collectTargets(page: Page): Promise<Target[]> {
  return page.evaluate(() => {
    const root = document.getElementById('top')
    if (!root) return []

    const describeNode = (el: Element): string => {
      const bits: string[] = []
      let node: Element | null = el
      let depth = 0
      while (node && depth < 3) {
        const cls =
          typeof (node as HTMLElement).className === 'string' && (node as HTMLElement).className.trim()
            ? `.${(node as HTMLElement).className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        bits.unshift(`${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${cls}`)
        node = node.parentElement
        depth += 1
      }
      return bits.join(' > ')
    }

    const visible = (el: Element): boolean => {
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') return false
      if (Number.parseFloat(style.opacity || '1') < 0.05) return false
      const rect = el.getBoundingClientRect()
      return rect.width >= 1 && rect.height >= 1
    }

    interface Rect {
      x: number
      y: number
      width: number
      height: number
    }

    /*
      CLIP TO THE VIEWPORT, NEVER TRANSLATE INTO IT.

      This used to be `y: Math.max(0, r.y - pad)` with the height left alone,
      which for anything scrolled off the top MOVED the sample window instead
      of shrinking it: an <h1> at y = -500 became a 78px-tall window at y = 0,
      and the pixels it then read belonged to whatever the page happened to
      have parked at the top of the screen. In the `hero-bottom` state at 1280
      that is the <Threshold>'s crimson display value, so the gate reported
      #FF5252 as "the backdrop behind Duy Nguyen" and failed the hero at
      2.83:1 — a number about two foregrounds, with no photograph in it
      anywhere. The screenshot is viewport-sized, so a rect outside it has no
      pixels; the honest answer is to sample none, not to sample someone
      else's.
    */
    const vw = window.innerWidth
    const vh = window.innerHeight
    const clip = (r: { x: number; y: number; width: number; height: number }, pad = 0): Rect | null => {
      const x0 = Math.max(0, r.x - pad)
      const y0 = Math.max(0, r.y - pad)
      const x1 = Math.min(vw, r.x + r.width + pad)
      const y1 = Math.min(vh, r.y + r.height + pad)
      if (x1 - x0 < 1 || y1 - y0 < 1) return null
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
    }
    const out: Array<{
      id: string
      kind: 'text' | 'border' | 'rule'
      tag: string
      path: string
      text: string
      color: string
      fontSizePx: number
      fontWeight: number
      rects: Rect[]
    }> = []

    let counter = 0
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      if (!visible(el)) continue
      const style = getComputedStyle(el)

      /* ── TEXT ─────────────────────────────────────────────────────────── */
      const ownTextNodes = Array.from(el.childNodes).filter(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
      )
      if (ownTextNodes.length > 0) {
        const rects: Rect[] = []
        for (const node of ownTextNodes) {
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const rect of Array.from(range.getClientRects())) {
            if (rect.width <= 0 || rect.height <= 0) continue
            const clipped = clip(rect, 2)
            if (clipped) rects.push(clipped)
          }
        }
        if (rects.length > 0) {
          counter += 1
          out.push({
            id: `t${counter}`,
            kind: 'text',
            tag: el.tagName.toLowerCase(),
            path: describeNode(el),
            text: ownTextNodes
              .map((n) => n.textContent ?? '')
              .join('')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 60),
            color: style.color,
            fontSizePx: Number.parseFloat(style.fontSize || '16'),
            fontWeight: Number.parseInt(style.fontWeight || '400', 10) || 400,
            rects,
          })
        }
      }

      const box = el.getBoundingClientRect()

      /* ── BORDERS ──────────────────────────────────────────────────────── */
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`) || '0')
        if (!(width > 0)) continue
        if (style.getPropertyValue(`border-${side}-style`) === 'none') continue
        const colour = style.getPropertyValue(`border-${side}-color`)
        if (!colour || colour === 'transparent') continue

        const strip: Rect =
          side === 'top'
            ? { x: box.x, y: box.y, width: box.width, height: width }
            : side === 'bottom'
              ? { x: box.x, y: box.bottom - width, width: box.width, height: width }
              : side === 'left'
                ? { x: box.x, y: box.y, width, height: box.height }
                : { x: box.right - width, y: box.y, width, height: box.height }
        if (strip.width < 1 || strip.height < 1) continue
        const clippedStrip = clip(strip)
        if (!clippedStrip) continue

        counter += 1
        out.push({
          id: `b${counter}`,
          kind: 'border',
          tag: el.tagName.toLowerCase(),
          path: `${describeNode(el)} [border-${side}]`,
          /* The element's own label, so a border can be NAMED in a failure and
             asserted on individually — the ghost button's outline is the one
             object in this band with a written 1.4.11 waiver behind it, and a
             waiver you cannot point at is a waiver nobody can re-examine. */
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          color: colour,
          fontSizePx: 0,
          fontWeight: 0,
          rects: [clippedStrip],
        })
      }

      /* ── RULES: thin filled bars that carry meaning ───────────────────── */
      const background = style.backgroundColor
      const parsedBackground = /rgba?\(([^)]+)\)/.exec(background || '')
      const alpha = parsedBackground
        ? Number.parseFloat(parsedBackground[1]?.split(/[\s,/]+/).filter(Boolean)[3] ?? '1')
        : 0
      const thin = box.height > 0 && box.height <= 6 && box.width >= 12
      if (thin && parsedBackground && alpha > 0.05) {
        const bands = [
          clip({ x: box.x, y: box.y - 5, width: box.width, height: 4 }),
          clip({ x: box.x, y: box.bottom + 1, width: box.width, height: 4 }),
        ].filter((r): r is Rect => r !== null)
        if (bands.length === 0) continue
        counter += 1
        // The band immediately above and below the bar: what it must be
        // distinguishable FROM.
        out.push({
          id: `r${counter}`,
          kind: 'rule',
          tag: el.tagName.toLowerCase(),
          path: describeNode(el),
          text: '',
          color: background,
          fontSizePx: 0,
          fontWeight: 0,
          rects: bands,
        })
      }
    }

    return out
  })
}

/**
 * THE GLYPH EXTENT, in fractions of the band's own box.
 *
 * Deliberately NOT the clipped rects `collectTargets` returns: those are cut
 * to the viewport, so a hero taller than the screen would report an extent
 * that stops at the fold and "prove" a geometry contract that only covers the
 * part currently visible. These are the raw `Range.getClientRects()`,
 * translated into the band's coordinate space, which is the same space
 * `scripts/check-hero-contrast.mjs` reasons in.
 *
 * Returns null when the band is missing or carries no text at all — the caller
 * must treat that as "did not measure", never as "measured clean".
 */
async function collectGlyphExtent(
  page: Page,
): Promise<{ x0: number; x1: number; y0: number; y1: number; bandW: number; bandH: number; count: number } | null> {
  return page.evaluate(() => {
    const root = document.getElementById('top')
    if (!root) return null
    const band = root.getBoundingClientRect()
    if (band.width < 1 || band.height < 1) return null

    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    let count = 0

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? '').trim() === '') continue
      const parent = node.parentElement
      if (!parent) continue
      const style = getComputedStyle(parent)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width <= 0 || rect.height <= 0) continue
        count += 1
        x0 = Math.min(x0, rect.left - band.left)
        x1 = Math.max(x1, rect.right - band.left)
        y0 = Math.min(y0, rect.top - band.top)
        y1 = Math.max(y1, rect.bottom - band.top)
      }
    }
    if (count === 0) return null
    return {
      x0: x0 / band.width,
      x1: x1 / band.width,
      y0: y0 / band.height,
      y1: y1 / band.height,
      bandW: band.width,
      bandH: band.height,
      count,
    }
  })
}

/** Makes the hero's own text and borders invisible without moving anything. */
const NEUTRALISE_ID = 'hero-contrast-neutralise'

async function neutraliseHeroForeground(page: Page): Promise<void> {
  await page.evaluate((id) => {
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    /* `color: transparent` rather than `visibility: hidden`: it removes the
       glyphs while leaving every BACKGROUND in place, so a label inside a
       filled button is still measured against that button's fill and not
       against whatever is behind the button. Same reasoning for border-color —
       the box keeps its geometry and its background, and the strip we sample
       is what the border is drawn on top of. */
    /*
      ── WHY `text-shadow` IS *NOT* NEUTRALISED (2026-09-03) ────────────────

      It used to be. `text-shadow: none !important` sat in this block, and it
      was the single line that made this gate unable to measure the design the
      owner actually asked for.

      Legibility is a LOCAL property. A glyph needs contrast against the pixels
      immediately around THAT GLYPH — a few hundred square pixels. A veil is a
      sheet between the reader and the photograph, and a sheet has to be sized
      by the brightest pixel anywhere under any glyph, so one lit window forces
      the whole band dark. That is why this hero measured a veil alpha of 0.86
      flat under the text while the crest strip above the first glyph sits at
      0.26 — 20.5x more of the photograph survives up there (measured at 1280
      and 1600 on 2026-09-03). The owner's report is that the band looks like a
      black see-through sheet over the picture, and the sheet is the mechanism.

      The alternative is to move the darkening onto the LETTERFORMS: a layered
      text-shadow halo, or a `paint-order: stroke fill` stroke in the ground
      colour. Cost then scales with the ink rather than with the band, and the
      photograph survives everywhere no glyph is.

      A sampler that sets `text-shadow: none` cannot see any of that. It
      erases the halo, samples the naked photograph, and asserts the flat
      foreground token against it — so a page that a reader finds genuinely
      legible reports as a failure the moment the veil is thinned, and no
      per-glyph treatment can ever earn back a single point of ratio. The gate
      would have forbidden the only fix.

      So the ink goes and the GROUND STAYS. `color` / `-webkit-text-fill-color:
      transparent` removes the glyph fill; a `text-shadow` is painted from the
      glyph outline in its own colour and survives a transparent fill, as does
      `-webkit-text-stroke`. What this samples is therefore the LOCAL GROUND
      each glyph actually sits on — veil plus halo plus stroke — which is the
      thing the reader's eye receives and the only thing the WCAG arithmetic
      below is entitled to be run against.

      THIS IS NOT A RELAXATION, in either direction:
        - Nothing about the thresholds moved. `requiredRatio` is untouched.
        - A halo painted DARK lowers the sampled backdrop, and the leniency
          that buys is earned — those dark pixels are on screen, under the
          glyph, for every reader.
        - A halo painted LIGHT raises the sampled backdrop and makes this gate
          STRICTER, which is correct: it would be a real defect.
        - With no per-glyph treatment anywhere in the hero — the state on the
          day this changed; all 21 hero text nodes measured `text-shadow: none`,
          `-webkit-text-stroke-width: 0px`, `paint-order: normal` — this line
          changes not one sampled pixel. It is a capability the gate did not
          have, not a threshold it stopped enforcing.

      The RECT sampler below still averages over the whole glyph rect, so a
      halo is only partly credited: inter-word gaps inside the rect keep the
      veil's own brightness and the p95 shoulder still binds on them. That is
      the conservative direction. The per-INK-PIXEL gate at the foot of this
      file is the measurement that credits a halo exactly, and it is additive.
    */
    style.textContent = `#top, #top *, #top *::before, #top *::after {
      color: transparent !important;
      -webkit-text-fill-color: transparent !important;
      text-decoration-color: transparent !important;
      border-color: transparent !important;
      caret-color: transparent !important;
    }
    /*
      THE DEV-TOOLS OVERLAY IS NOT PART OF THE PAGE. \`next dev\` mounts a
      fixed-position <nextjs-portal> at the bottom-left of the viewport; at
      375x812 it lands directly under the second <Readout>'s note, and its
      near-white chrome shows up in the sample as a pure-white pixel behind a
      10.5px muted line — 2.53:1, a hard failure of an assertion the page has
      nothing to do with. Confirmed by hit-testing the failing rect:
      elementsFromPoint returned \`nextjs-portal\` above the paragraph.
      Production emits none of these elements, so hiding them makes the dev run
      measure the same page the production run does.
    */
    nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button],
    #__next-build-watcher, #__next-prerender-indicator { display: none !important; }`
    document.head.appendChild(style)
  }, NEUTRALISE_ID)
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

async function restoreHeroForeground(page: Page): Promise<void> {
  await page.evaluate((id) => {
    document.getElementById(id)?.remove()
  }, NEUTRALISE_ID)
}

interface Measurement {
  target: Target
  state: string
  stats: PatchStats
  /** Worst of the two shoulders — the ratio the patch as a whole delivers. */
  shoulder: number
  /** Worst of the two extremes — the ratio a single pixel can force. */
  extreme: number
  /** What the same colour measures over the flat ink ground. */
  baseline: number
  required: number
}

/** `contrast(colour composited over this pixel, against that same pixel)`. */
function ratioOverPixel(colour: Rgb, backdrop: Rgb): number {
  return contrastRatio(flatten(colour, backdrop), backdrop)
}

function measure(target: Target, state: string, stats: PatchStats): Measurement | null {
  const colour = parseColor(target.color)
  if (!colour) return null

  const shoulder = Math.min(ratioOverPixel(colour, stats.p05), ratioOverPixel(colour, stats.p95))
  const extreme = Math.min(ratioOverPixel(colour, stats.min), ratioOverPixel(colour, stats.max))
  const baseline = ratioOverPixel(colour, INK)
  const required =
    target.kind === 'text' ? requiredRatio(target.fontSizePx, target.fontWeight) : NON_TEXT_MINIMUM

  return { target, state, stats, shoulder, extreme, baseline, required }
}

function describeMeasurement(m: Measurement): string {
  const size =
    m.target.kind === 'text'
      ? ` ${m.target.fontSizePx}px/${m.target.fontWeight}${isLargeText(m.target.fontSizePx, m.target.fontWeight) ? ' [large]' : ''}`
      : ''
  return (
    `${m.state} · ${m.target.kind} ${m.target.path}${size} colour ${m.target.color}` +
    `${m.target.text ? ` — "${m.target.text}"` : ''}\n` +
    `      shoulder ${round2(m.shoulder)}:1  extreme ${round2(m.extreme)}:1  ` +
    `flat-ink baseline ${round2(m.baseline)}:1  required ${m.required}:1\n` +
    `      backdrop ${describePatch(m.stats)}`
  )
}

/**
 * Screenshots the viewport with the hero's foreground neutralised and returns
 * the per-target backdrop statistics for everything currently on screen.
 */
async function sampleState(
  page: Page,
  state: string,
  viewportWidth: number,
): Promise<Map<string, Measurement>> {
  const targets = await collectTargets(page)
  await neutraliseHeroForeground(page)
  const shot = await page.screenshot()
  await restoreHeroForeground(page)

  const image = decodePng(shot)
  const scale = image.width / viewportWidth

  const out = new Map<string, Measurement>()
  for (const target of targets) {
    // Only what is genuinely on screen: a rect clipped to nothing produces no
    // pixels, and a partially visible one would average in a hard edge.
    const onScreen = target.rects.filter(
      (rect) =>
        rect.y >= 0 &&
        (rect.y + rect.height) * scale <= image.height &&
        rect.x >= 0 &&
        (rect.x + rect.width) * scale <= image.width,
    )
    if (onScreen.length === 0) continue
    const stats = sampleRects(image, onScreen, scale)
    if (!stats) continue
    const measurement = measure(target, state, stats)
    if (measurement) out.set(`${target.kind}:${target.path}:${target.text}:${target.color}`, measurement)
  }
  return out
}

/* ════════════════════════════════════════════════════════════════════════════
   The gate
   ════════════════════════════════════════════════════════════════════════════ */

for (const viewport of VIEWPORTS) {
  test.describe(`hero contrast over rendered pixels at ${viewport.key}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('every hero foreground clears its threshold against the pixels actually painted behind it', async ({
      page,
    }, testInfo) => {
      testInfo.setTimeout(120_000)

      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto('/', { waitUntil: 'load' })
      await page.waitForLoadState('networkidle').catch(() => undefined)
      await freezeMotion(page)
      await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' })

      /**
       * THE STATES SAMPLED, and why each one is necessary.
       *
       *   entry        scroll 0. Where a visitor lands and dwells. With the
       *                cross-fade in place this is the SHARP photograph — the
       *                brightest, least forgiving backdrop the design produces.
       *   focus:1      scroll 0 with --focus pinned to its far end. The
       *                cross-fade's other extreme. Mid-scroll frames paint
       *                partially-faded text over a partially-faded photograph,
       *                and the two extremes bound every frame between them.
       *                Only exists once a scroll driver does.
       *   hero-bottom  the hero scrolled so its lower half is on screen. At
       *                375px the hero is far taller than the viewport, so the
       *                buttons and readouts are never measured at `entry` at
       *                all — and sampling only what happens to be above the
       *                fold is how a contrast gate quietly covers half a band.
       */
      const measurements = new Map<string, Measurement[]>()
      const record = (found: Map<string, Measurement>): void => {
        for (const [key, value] of found) {
          measurements.set(key, [...(measurements.get(key) ?? []), value])
        }
      }

      record(await sampleState(page, 'entry', viewport.width))

      /* ── 0 · THE GEOMETRY CONTRACT ───────────────────────────────────────
         Measured before anything is scrolled, because the band's own box is
         the frame the build gate reasons in and it does not move. */
      const glyphExtent = await collectGlyphExtent(page)

      if (photoLanded) {
        const pinned = await pinFocus(page, 1, 5_000)
        if (pinned) {
          record(await sampleState(page, 'focus:1', viewport.width))
          await pinFocus(page, 0, 5_000)
        }
      }

      /* ── THE BAND IS TILED, NOT SPOT-CHECKED ─────────────────────────────
         This used to be two states: `entry` at scroll 0 and `hero-bottom` with
         the band's foot on the viewport's foot. On a phone the hero is more
         than twice the viewport tall, so those two windows do not meet — and
         anything in the gap between them was never measured by anything.

         It was not a theoretical hole. The vertical aperture made the band
         170px taller at 375px, the gap widened with it, and the award
         Readout's label fell into it: the ROSTER check caught a named element
         that had silently stopped being sampled. That is the roster doing its
         job, and this is the fix — cover the band by CONSTRUCTION, in
         overlapping viewport-sized steps, so no future copy edit can open the
         hole again.

         The step is 80% of the viewport height, so consecutive windows overlap
         by a fifth and an element straddling a boundary is fully inside at
         least one of them (sampleState drops partially-visible rects, which is
         right — a clipped rect would average in a hard edge — so overlap is
         what makes coverage complete rather than nearly-complete). */
      const scrollStops = await page.evaluate(async () => {
        const hero = document.getElementById('top')
        if (!hero) return []
        const box = hero.getBoundingClientRect()
        const top = box.top + window.scrollY
        const bottom = box.bottom + window.scrollY
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight
        const step = Math.max(1, window.innerHeight * 0.8)
        const stops: number[] = []
        for (let y = top; y < bottom; y += step) {
          const target = Math.min(Math.max(0, y), maxScroll)
          if (target > 0 && !stops.includes(target)) stops.push(target)
        }
        const foot = Math.min(Math.max(0, bottom - window.innerHeight), maxScroll)
        if (foot > 0 && !stops.includes(foot)) stops.push(foot)
        return stops
      })

      for (const stop of scrollStops) {
        const landed = await page.evaluate(async (y: number) => {
          window.scrollTo(0, y)
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          )
          return window.scrollY
        }, stop)
        record(await sampleState(page, `hero-y${Math.round(landed)}`, viewport.width))
      }

      const all = [...measurements.values()].flat()

      await testInfo.attach(`hero-contrast-${viewport.key}.txt`, {
        body:
          `photo landed: ${photoLanded}\n` +
          `flat-ink reference ground: ${GROUND_TOKENS.ink}\n` +
          `${all.length} measurements over ${measurements.size} distinct targets\n\n` +
          all.map((m) => `  ${describeMeasurement(m)}`).join('\n'),
        contentType: 'text/plain',
      })

      /* COVERAGE FLOOR. A sampler that silently stops finding targets is worse
         than no sampler: it reports green forever. These numbers are not a
         design assertion — the hero carries an eyebrow, an H1, a statement, a
         threshold with three labels, two readouts and three actions — they are
         the "is the instrument still plugged in" check. */
      const textTargets = all.filter((m) => m.target.kind === 'text')
      const objectTargets = all.filter((m) => m.target.kind !== 'text')
      expect(
        textTargets.length,
        `Only ${textTargets.length} text runs were sampled inside the hero at ${viewport.key}. ` +
          'The sampler found almost nothing, which means it is measuring nothing — check that ' +
          '#top still exists and that the reveal states are unfrozen.',
      ).toBeGreaterThanOrEqual(6)
      expect(
        objectTargets.length,
        `No border or rule was sampled inside the hero at ${viewport.key}. The hero carries a ` +
          "<Threshold> rule and a ghost button's outline; finding neither means the object " +
          'sweep broke.',
      ).toBeGreaterThanOrEqual(1)

      /* ── 0 · THE GEOMETRY THE BUILD GATE ASSUMES ──────────────────────

         `scripts/check-hero-contrast.mjs` evaluates the scrim's alpha field at
         a position and gates only the cells inside its declared TEXT_EXTENT.
         Everything outside that box it treats as text-free and reports rather
         than gates — which is exactly the licence a shaped scrim needs, and
         exactly the licence that becomes a hole if the box is wrong.

         This is where the box is proven. A glyph outside it is not a styling
         nit: it is a glyph the build gate never checked. */
      expect(
        glyphExtent,
        `No glyph rectangles were found inside #top at ${viewport.key}. The build gate's ` +
          'TEXT_EXTENT table cannot be verified against nothing, so this run proves nothing ' +
          'about the geometry it assumes.',
      ).not.toBeNull()

      if (glyphExtent) {
        const declared = declaredExtent(viewport.width)
        const outside = (
          [
            ['left', glyphExtent.x0, declared.x0, glyphExtent.x0 >= declared.x0],
            ['right', glyphExtent.x1, declared.x1, glyphExtent.x1 <= declared.x1],
            ['top', glyphExtent.y0, declared.y0, glyphExtent.y0 >= declared.y0],
            ['bottom', glyphExtent.y1, declared.y1, glyphExtent.y1 <= declared.y1],
          ] as const
        ).filter(([, , , ok]) => !ok)

        await testInfo.attach(`hero-geometry-${viewport.key}.txt`, {
          body:
            `band box ${round2(glyphExtent.bandW)} x ${round2(glyphExtent.bandH)}\n` +
            `${glyphExtent.count} glyph rectangles\n` +
            `measured  x ${(glyphExtent.x0 * 100).toFixed(1)}% .. ${(glyphExtent.x1 * 100).toFixed(1)}%  ` +
            `y ${(glyphExtent.y0 * 100).toFixed(1)}% .. ${(glyphExtent.y1 * 100).toFixed(1)}%\n` +
            `declared  x ${(declared.x0 * 100).toFixed(1)}% .. ${(declared.x1 * 100).toFixed(1)}%  ` +
            `y ${(declared.y0 * 100).toFixed(1)}% .. ${(declared.y1 * 100).toFixed(1)}%  ` +
            `(TEXT_EXTENT row w=${declared.w}, inflated by ${(EXTENT.margin * 100).toFixed(0)}%)`,
          contentType: 'text/plain',
        })

        expect(
          outside.map(
            ([side, measured, bound]) =>
              `${side}: glyphs reach ${(measured * 100).toFixed(1)}% of the band box, ` +
              `TEXT_EXTENT declares ${(bound * 100).toFixed(1)}%`,
          ),
          `Hero glyphs fall OUTSIDE the text extent that scripts/check-hero-contrast.mjs ` +
            `assumes at ${viewport.key}. That script rasterises the scrim into an alpha field ` +
            'and gates only the cells inside this box; a glyph outside it is a glyph the build ' +
            'gate never measured, and with a SHAPED scrim that is precisely where the veil is ' +
            'thinnest.\n\nFix by updating TEXT_EXTENT in scripts/check-hero-contrast.mjs to the ' +
            'measured numbers in the attached hero-geometry report — in the same commit as the ' +
            'layout change that moved them. Do NOT widen EXTENT_MARGIN to absorb this: the ' +
            'margin pays for measurement noise, not for a table that is out of date.',
        ).toEqual([])
      }

      /* ── 0b · THE ROSTER: every named thing was actually looked at ────── */
      const sampledText = all.filter((m) => m.target.kind === 'text')
      const missing = ROSTER.filter(
        (entry) => !entry.optional && !sampledText.some((m) => entry.match.test(m.target.text)),
      )
      expect(
        missing.map((entry) => `${entry.id} — ${entry.what} (matcher ${String(entry.match)})`),
        `The sampler never measured these hero elements at ${viewport.key}:\n\n  ` +
          missing.map((entry) => `${entry.id} — ${entry.what}`).join('\n  ') +
          '\n\nEither the copy changed (update ROSTER in the same commit) or the sampler stopped ' +
          'reaching them. A contrast gate that silently stops looking at the 11px crimson eyebrow ' +
          'reports green forever — that element measured 4.449:1 at one point in this project and ' +
          'every agent called it green.\n\nSampled runs were:\n  ' +
          [...new Set(sampledText.map((m) => m.target.text))].join('\n  '),
      ).toEqual([])

      /* The <Limit> block, as a group. Its lines come from the corpus, so they
         are counted rather than matched — including the AI-disclosure line,
         which exists only once a generated photograph has landed. */
      const limitLines = new Set(
        sampledText.filter((m) => m.target.tag === 'li').map((m) => m.target.text),
      )
      expect(
        limitLines.size,
        `Only ${limitLines.size} <Limit> line(s) were measured inside the hero at ` +
          `${viewport.key}; ${LIMIT_LINES_MINIMUM} were expected` +
          (photoLanded
            ? ' (two corpus limits plus the AI-disclosure line, which renders because a ' +
              'generated photograph landed).'
            : ' (the two corpus limits; the AI-disclosure line only renders with a photograph).') +
          "\n\nThe caveats are in the hero because the page's argument is that its numbers are " +
          'checkable. A caveat nobody can read is a caveat that is not there.\n\nMeasured:\n  ' +
          [...limitLines].join('\n  '),
      ).toBeGreaterThanOrEqual(LIMIT_LINES_MINIMUM)

      /* ── 1 · TEXT: the absolute WCAG floor ─────────────────────────────── */
      const textFailures = textTargets.filter((m) => m.shoulder < m.required)
      expect(
        textFailures.map(describeMeasurement),
        `Hero text does not clear its WCAG minimum against the pixels painted behind it at ` +
          `${viewport.key}:\n\n  ${textFailures.map(describeMeasurement).join('\n\n  ')}\n\n` +
          'The ink ground publishes 16.04:1 for --fg, 7.15:1 for --fg-muted and 5.68:1 for ' +
          '--fg-accent. Those are measurements against a FLAT #14161A; a photograph behind the ' +
          'text makes them claims about a colour that is no longer there. The fix is a scrim ' +
          "designed against the photograph's brightest region — never a dimmer text colour, " +
          'which would put the hero outside the ground-context system that makes these ' +
          'failures unreachable everywhere else on the page.',
      ).toEqual([])

      const hotPixels = textTargets.filter((m) => m.extreme < NON_TEXT_MINIMUM)
      expect(
        hotPixels.map(describeMeasurement),
        `At least one pixel directly under a hero glyph falls below even 3:1 at ` +
          `${viewport.key}:\n\n  ${hotPixels.map(describeMeasurement).join('\n\n  ')}\n\n` +
          'The patch as a whole may pass while a specular highlight sits behind one word. This ' +
          'is the assertion that catches a scrim tuned against a mean instead of against a ' +
          'maximum.',
      ).toEqual([])

      /* ── 1b · THE GHOST BUTTON'S OUTLINE, AGAINST ITS WRITTEN WAIVER ──

         `components/ui/Btn.tsx` draws the ghost variant as
         `border border-[color:var(--edge)]`, and app/globals.css waives WCAG
         1.4.11 for `--edge` with an argument rather than an exception:

           "--edge separates one record from the next; those records are ALSO
            separated by space and by type hierarchy, so the hairline carries
            no unique information." Measured 1.37:1 on ink.

         That waiver was argued over a FLAT ink ground. It says nothing about a
         photograph, and it cannot be stretched to cover one — so the outline is
         held to the waiver's own terms: no worse than the flat ground the
         waiver was granted on. Relitigating the waiver is not this file's job;
         noticing that the photograph quietly voided it is exactly this file's
         job.

         Asserted BY NAME rather than left to the general object sweep, because
         the sweep passes vacuously if it never finds this border — and a
         hairline is the easiest target in the band to lose. */
      const ghostBorders = objectTargets.filter(
        (m) => m.target.kind === 'border' && /r[eé]sum[eé]/i.test(m.target.text),
      )
      expect(
        ghostBorders.length,
        `The ghost button's border was never sampled inside the hero at ${viewport.key}. ` +
          'components/ui/Btn.tsx draws the ghost variant with `border border-[color:var(--edge)]`, ' +
          'and app/globals.css waives WCAG 1.4.11 for --edge on the argument that it carries no ' +
          'unique information over a FLAT ink ground. A photograph is not that ground. If the ' +
          'border is gone, the waiver has nothing to attach to; if the sampler simply stopped ' +
          'finding it, this gate is reporting green about an object it never looked at.\n\n' +
          'Borders and rules that WERE sampled:\n  ' +
          objectTargets.map((m) => `${m.target.kind} ${m.target.path} — "${m.target.text}"`).join('\n  '),
      ).toBeGreaterThan(0)

      const ghostRegressions = ghostBorders.filter(
        (m) => m.shoulder < Math.min(NON_TEXT_MINIMUM, m.baseline * REGRESSION_TOLERANCE),
      )
      expect(
        ghostRegressions.map(describeMeasurement),
        `The ghost button's outline is fainter over the photograph than the flat ink ground its ` +
          `1.4.11 waiver was argued on, at ${viewport.key}:\n\n  ` +
          ghostRegressions.map(describeMeasurement).join('\n\n  ') +
          '\n\nThe waiver in app/globals.css is a statement about --edge on #14161A — 1.37:1, ' +
          'carrying no unique information because space and type hierarchy already separate the ' +
          'records. It is not a licence for the border to disappear into a photograph. Either the ' +
          'veil covers this control, or the control needs a border that carries its own contrast.',
      ).toEqual([])

      /* ── 2 · NON-TEXT: 3:1 where it means something, no regression where
            the design system has already argued the waiver ───────────────── */
      const objectFailures = objectTargets.filter(
        (m) => m.shoulder < Math.min(NON_TEXT_MINIMUM, m.baseline * REGRESSION_TOLERANCE),
      )
      expect(
        objectFailures.map(describeMeasurement),
        `A hero border or rule fell below its floor at ${viewport.key}:\n\n  ` +
          objectFailures.map(describeMeasurement).join('\n\n  ') +
          '\n\nThe floor is min(3:1, flat-ink baseline x ' +
          `${REGRESSION_TOLERANCE}). An object that carries information — the <Threshold> rule ` +
          'at --fg-accent, 5.68:1 on ink — owes the real 1.4.11 minimum of 3:1 over the ' +
          'photograph. A decorative hairline (--edge, 1.37:1 on ink, waived with an argument in ' +
          'globals.css) owes no more than it already delivered on the flat ground — but the ' +
          'photograph may not make it fainter than that.',
      ).toEqual([])
    })
  })
}

/* ════════════════════════════════════════════════════════════════════════════
   THE NEGATIVE CONTROL — proof that the sampler above can actually fail.

   Everything before this point is an instrument. An instrument that has never
   registered a reading nobody wanted is not an instrument, it is a decoration,
   and this repository has already shipped one: a 0.9% margin difference put
   the 11px crimson eyebrow at 4.449:1 — a real AA failure — and every gate in
   the tree reported green, because the asset was absent and there was nothing
   behind the text to be wrong about.

   So the veil is deliberately thinned here, in the browser, and the SAME
   sampling code is asked to judge the result. Two things must happen, in this
   order, and the first is as important as the second:

     1. THE CONTROL MUST BITE. If overriding the scrim's own custom properties
        does not measurably lighten the pixels behind the hero text, then this
        control is testing nothing — the properties were renamed, or the veil
        no longer reads them — and that is reported as a failure of the CONTROL
        rather than quietly passing. A negative control that has silently
        stopped controlling is worse than none.

     2. THE GATE MUST NOTICE. With the veil thinned, at least one hero
        foreground has to fall below its WCAG threshold. If none does, the
        thresholds above cannot distinguish the shipped page from one with
        essentially no scrim, and every green run in this file means nothing.

   `scripts/check-hero-contrast.mjs --prove` is the same argument for the build
   gate, run against the stylesheet instead of against the browser. Both exist
   because two other territories are, right now, deliberately making this hero
   lighter, and the only thing that makes "lighter" safe is a gate that has
   demonstrably said no to something.

   Gated on the photograph: with no asset the scrim composites --ground over
   --ground, so thinning it changes nothing and there is no control to run.
   The skip prints why, at length, because a green skip that reads as coverage
   is how the failure above happened the first time.
   ════════════════════════════════════════════════════════════════════════════ */

const CONTROL_ID = 'hero-contrast-negative-control'

/**
 * The properties the veil's strength is written in. Overridden with
 * `!important` on `#top *`, which matches the scrim element itself, so a
 * locally declared value loses to this one.
 *
 * IF THE SCRIM IS REWRITTEN AND THESE NAMES CHANGE, THIS LIST IS WHAT NEEDS
 * UPDATING — and assertion 1 below is what will tell you, by name, that it
 * does. Do not delete the assertion to make the run green.
 */
const CONTROL_OVERRIDES = [
  '--scrim-floor-min: 4%',
  '--scrim-crest-min: 4%',
  '--scrim-sill-min: 4%',
  '--scrim-base: 0.04',
  '--scrim-alpha: 4%',
]

test.describe('hero contrast: the negative control', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('thinning the scrim makes this gate fail — so a green run means something', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    test.skip(
      !photoLanded,
      'SKIPPED, NOT SATISFIED — no hero photograph has landed, so the scrim composites ' +
        '--ground over --ground and thinning it changes no pixel. There is nothing for a ' +
        'negative control to control. This skip is NOT coverage: it means the sampler in this ' +
        'file has not been shown to be capable of failing on this checkout.',
    )

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/', { waitUntil: 'load' })
    await page.waitForLoadState('networkidle').catch(() => undefined)
    await freezeMotion(page)

    /*
      BOTH ENDS OF THE BAND, for the same reason the main test samples three
      states: at 375 the hero is nearly twice the viewport's height, so
      everything from the readouts down is off screen at entry. A control that
      only ever looks above the fold can only ever prove the gate works above
      the fold — and the brightest region of this photograph sits low in the
      portrait crop, which is exactly where a thinned veil does its damage.
    */
    const scrollToHeroBottom = async (): Promise<void> => {
      await page.evaluate(async () => {
        const hero = document.getElementById('top')
        if (!hero) return
        const target = Math.min(
          Math.max(0, hero.getBoundingClientRect().bottom + window.scrollY - window.innerHeight),
          document.documentElement.scrollHeight - window.innerHeight,
        )
        window.scrollTo(0, target)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )
      })
    }

    const before = new Map<string, Measurement>()
    for (const [k, v] of await sampleState(page, 'shipped:entry', 375)) before.set(k, v)
    await scrollToHeroBottom()
    for (const [k, v] of await sampleState(page, 'shipped:bottom', 375)) {
      if (!before.has(k)) before.set(k, v)
    }
    await page.evaluate(() => window.scrollTo(0, 0))

    await page.evaluate(
      ({ id, decls }) => {
        const style = document.createElement('style')
        style.id = id
        style.textContent = `#top * { ${decls.map((d) => `${d} !important;`).join(' ')} }`
        document.head.appendChild(style)
      },
      { id: CONTROL_ID, decls: CONTROL_OVERRIDES },
    )
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }),
    )

    const after = new Map<string, Measurement>()
    for (const [k, v] of await sampleState(page, 'thinned:entry', 375)) after.set(k, v)
    await scrollToHeroBottom()
    for (const [k, v] of await sampleState(page, 'thinned:bottom', 375)) {
      if (!after.has(k)) after.set(k, v)
    }

    /* ── 1 · THE CONTROL MUST BITE ─────────────────────────────────────────

       Measured as a DROP IN THE CONTRAST RATIO, not as a rise in backdrop
       luminance. The first version of this assertion used mean luminance and
       was wrong twice over: over a region of the photograph that happens to be
       dark, thinning the veil barely moves the mean even though it has removed
       the entire guarantee; and mean luminance is not the quantity any
       threshold in this file is expressed in. The ratio is what the gate
       judges, so the ratio is what the control has to move. */
    let degraded = 0
    let worstDrop = 0
    let worstDropId = ''
    for (const [key, shipped] of before) {
      const thinned = after.get(key)
      if (!thinned) continue
      const drop = (shipped.shoulder - thinned.shoulder) / shipped.shoulder
      if (drop > 0.02) degraded += 1
      if (drop > worstDrop) {
        worstDrop = drop
        worstDropId = `${shipped.target.kind} "${shipped.target.text}" ${round2(shipped.shoulder)}:1 -> ${round2(thinned.shoulder)}:1`
      }
    }

    const thinnedText = [...after.values()].filter((m) => m.target.kind === 'text')
    const nowFailing = thinnedText.filter((m) => m.shoulder < m.required)

    await testInfo.attach('negative-control-375.txt', {
      body:
        `overrides: ${CONTROL_OVERRIDES.join('; ')}\n` +
        `${before.size} targets sampled before, ${after.size} after\n` +
        `${degraded} targets lost more than 2% of their contrast ratio\n` +
        `largest drop: ${worstDropId || '(none)'}\n` +
        `${nowFailing.length} text runs now below their WCAG threshold\n\n` +
        [...after.values()].map((m) => `  ${describeMeasurement(m)}`).join('\n'),
      contentType: 'text/plain',
    })

    expect(
      degraded,
      'THE NEGATIVE CONTROL DID NOT BITE. Overriding ' +
        CONTROL_OVERRIDES.join(', ') +
        ' on #top cost no sampled target more than 2% of its contrast ratio, so this test ' +
        'proves nothing about the sampler and the green runs in the rest of this file are ' +
        'unverified.\n\nAlmost certainly the scrim was rewritten and its custom properties are ' +
        'now called something else — CONTROL_OVERRIDES has to name every variable the veil ' +
        "reads, including any the pocket's mask uses. Update it in the same commit as the " +
        'rewrite. DO NOT delete this assertion and do not lower the 2% threshold: both turn ' +
        'the only proof that this gate works into a formality.\n\n' +
        `Largest drop observed: ${worstDropId || '(none)'}`,
    ).toBeGreaterThan(0)

    /* ── 2 · THE GATE MUST NOTICE A BAD BACKDROP ───────────────────────────

       NOT "must notice a thinned scrim". The difference is the whole reason
       this assertion is written the way it is, and it was found by running it.

       On the build this was written against, thinning the veil to 4% left
       EVERY hero foreground above its WCAG threshold — the tightest was the
       11px eyebrow at 5.08:1 with essentially no scrim at all. That is not the
       instrument failing; it is a true statement about the page: the source
       photograph has been graded so dark that the picture is itself an ink
       field, and the veil is no longer what is protecting the text. Making
       THAT a test failure would be gating one territory's grade from inside
       another territory's contrast gate, and it would break the moment the
       grade is (rightly) lightened again.

       So non-vacuity is proven against a backdrop this file controls
       completely: a white surface, injected at the scrim's own z-index so it
       covers the photograph and the veil and nothing else. --fg is #F2F1EE;
       on white it is 1.06:1. If the sampler cannot see that, it cannot see
       anything, and no green run in this file means a thing.

       The thinned-scrim result above is kept and reported rather than
       asserted, because "the veil is currently redundant" is a finding the
       people tuning the grade need, not a defect in this gate. */
    await page.evaluate((id) => document.getElementById(id)?.remove(), CONTROL_ID)

    const WHITE_ID = 'hero-contrast-white-backdrop'
    const injected = await page.evaluate((id) => {
      const root = document.getElementById('top')
      if (!root) return false
      const el = document.createElement('div')
      el.id = id
      el.setAttribute('aria-hidden', 'true')
      /* z-index -1 is the scrim's own layer, and this element is appended
         after it, so it paints over the veil and the photograph while staying
         underneath the band's content (which is `position: relative`, z-index
         auto, and therefore above every negative layer). */
      el.style.cssText =
        'position:absolute;inset:0;z-index:-1;background:#ffffff;pointer-events:none'
      root.appendChild(el)
      return true
    }, WHITE_ID)

    expect(
      injected,
      'Could not inject the white backdrop: #top was not found. The non-vacuity proof for this ' +
        'entire file depends on it, so a green run without it is not evidence.',
    ).toBe(true)

    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }),
    )
    await page.evaluate(() => window.scrollTo(0, 0))

    const onWhite = await sampleState(page, 'control:white', 375)
    const whiteText = [...onWhite.values()].filter((m) => m.target.kind === 'text')
    const whiteFailing = whiteText.filter((m) => m.shoulder < m.required)

    await testInfo.attach('negative-control-375.txt', {
      body:
        `── 1 · did the control bite? ──────────────────────────────────────\n` +
        `overrides: ${CONTROL_OVERRIDES.join('; ')}\n` +
        `${before.size} targets sampled before, ${after.size} after\n` +
        `${degraded} targets lost more than 2% of their contrast ratio\n` +
        `largest drop: ${worstDropId || '(none)'}\n\n` +
        `── 2 · is the VEIL what is protecting the text? ───────────────────\n` +
        `with the scrim thinned to 4%, ${nowFailing.length} of ${thinnedText.length} text runs ` +
        `fall below their WCAG threshold.\n` +
        (nowFailing.length === 0
          ? 'ZERO. The veil is not currently load-bearing: the photograph as graded is dark\n' +
            'enough on its own that the hero would pass with essentially no scrim. That is a\n' +
            'finding about the GRADE, not about this gate — the picture has been darkened past\n' +
            'the point where the veil does any work, which is also the point where it stops\n' +
            'reading as a photograph. Run `node scripts/check-hero-contrast.mjs` for the source\n' +
            'peak luminance per rung and the sRGB window the picture survives into.\n'
          : `The veil is load-bearing. Tightest without it:\n  ` +
            thinnedText
              .slice()
              .sort((a, b) => a.shoulder / a.required - b.shoulder / b.required)
              .slice(0, 5)
              .map((m) => `${round2(m.shoulder)}:1 vs ${m.required}:1 — "${m.target.text}"`)
              .join('\n  ') +
            '\n') +
        `\n── 3 · non-vacuity, against a white backdrop ──────────────────────\n` +
        `${whiteFailing.length} of ${whiteText.length} text runs fail on white.\n\n` +
        [...onWhite.values()].map((m) => `  ${describeMeasurement(m)}`).join('\n'),
      contentType: 'text/plain',
    })

    expect(
      whiteFailing.length,
      'THE SAMPLER DID NOT FAIL ON A WHITE BACKDROP. A solid #FFFFFF surface was painted over ' +
        'the photograph and the veil, directly behind the hero text. --fg is #F2F1EE, which is ' +
        `1.06:1 on white, yet none of the ${whiteText.length} sampled text runs was reported ` +
        'below its threshold.\n\n' +
        'This is not a finding about the page. It means the instrument in this file is not ' +
        'measuring what it claims to measure — the neutralise step, the screenshot, the rect ' +
        'basis or the WCAG arithmetic — and every green run above is meaningless. Fix the ' +
        'sampler; do not relax this.\n\n' +
        'Tightest ratios measured on white:\n  ' +
        whiteText
          .slice()
          .sort((a, b) => a.shoulder / a.required - b.shoulder / b.required)
          .slice(0, 5)
          .map((m) => `${round2(m.shoulder)}:1 vs ${m.required}:1 — "${m.target.text}"`)
          .join('\n  '),
    ).toBeGreaterThan(0)

    await page.evaluate((id) => document.getElementById(id)?.remove(), WHITE_ID)
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   THE GEOMETRY TABLE, AT EVERY ROW IT DECLARES.

   The per-viewport contrast tests above prove TEXT_EXTENT at the three
   viewports they sample. The build gate reasons at six. This closes the other
   three, and it is cheap: no screenshot, no decode, one layout read.

   BAND HEIGHT IS CHECKED TOO, and it is not a formality. The build gate
   resolves `%`-based gradient stops and the text extent against the band's own
   box; if the band has grown since the table was recorded — one more line of
   copy will do it — then every position the gate evaluates is displaced by
   that fraction. On a flat scrim that is harmless. On a shaped one it moves
   the pocket relative to the glyphs, which is the entire question.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * How far the real band may differ from the height TEXT_EXTENT records before
 * the table counts as stale. Generous, because the band height is a
 * consequence of copy and fonts rather than a designed number — but finite,
 * because "the gate evaluates the scrim at the wrong rows" has no upper bound
 * on how wrong it can be.
 */
const BAND_HEIGHT_TOLERANCE = 0.08

test.describe('hero: the geometry the build gate assumes', () => {
  for (const row of EXTENT.rows) {
    test(`TEXT_EXTENT row w=${row.w} still describes where the glyphs are`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: row.w, height: 900 })
      await page.goto('/', { waitUntil: 'load' })
      await freezeMotion(page)

      const measured = await collectGlyphExtent(page)
      expect(measured, `No glyphs found inside #top at width ${row.w}.`).not.toBeNull()
      if (!measured) return

      const declared = declaredExtent(row.w)
      const heightDrift = Math.abs(measured.bandH - row.bandH) / row.bandH

      await testInfo.attach(`extent-row-${row.w}.txt`, {
        body:
          `viewport width ${row.w}\n` +
          `band box ${round2(measured.bandW)} x ${round2(measured.bandH)} ` +
          `(TEXT_EXTENT records ${row.bandH}, drift ${(heightDrift * 100).toFixed(1)}%)\n` +
          `${measured.count} glyph rectangles\n` +
          `measured  x ${(measured.x0 * 100).toFixed(1)}% .. ${(measured.x1 * 100).toFixed(1)}%  ` +
          `y ${(measured.y0 * 100).toFixed(1)}% .. ${(measured.y1 * 100).toFixed(1)}%\n` +
          `recorded  x ${(row.x0 * 100).toFixed(1)}% .. ${(row.x1 * 100).toFixed(1)}%  ` +
          `y ${(row.y0 * 100).toFixed(1)}% .. ${(row.y1 * 100).toFixed(1)}%\n` +
          `gated on  x ${(declared.x0 * 100).toFixed(1)}% .. ${(declared.x1 * 100).toFixed(1)}%  ` +
          `y ${(declared.y0 * 100).toFixed(1)}% .. ${(declared.y1 * 100).toFixed(1)}%  ` +
          `(after the ${(EXTENT.margin * 100).toFixed(0)}% margin)`,
        contentType: 'text/plain',
      })

      const outside = (
        [
          ['left', measured.x0, declared.x0, measured.x0 >= declared.x0],
          ['right', measured.x1, declared.x1, measured.x1 <= declared.x1],
          ['top', measured.y0, declared.y0, measured.y0 >= declared.y0],
          ['bottom', measured.y1, declared.y1, measured.y1 <= declared.y1],
        ] as const
      ).filter(([, , , ok]) => !ok)

      expect(
        outside.map(
          ([side, m, bound]) =>
            `${side}: glyphs reach ${(m * 100).toFixed(1)}%, TEXT_EXTENT gates ${(bound * 100).toFixed(1)}%`,
        ),
        `Glyphs fall outside the TEXT_EXTENT row for width ${row.w} in ` +
          'scripts/check-hero-contrast.mjs. Cells outside that box are REPORTED by the build ' +
          'gate, not gated — so a glyph out there is a glyph nothing checked. Update the row ' +
          'from the attached measurement.',
      ).toEqual([])

      expect(
        heightDrift,
        `The hero band is ${round2(measured.bandH)}px tall at width ${row.w}, but ` +
          `TEXT_EXTENT records ${row.bandH}px — ${(heightDrift * 100).toFixed(1)}% drift.\n\n` +
          "scripts/check-hero-contrast.mjs resolves the scrim's %-based stops and the text " +
          'extent against that height. A stale value displaces every position it evaluates by ' +
          'the same fraction, which on a SHAPED scrim moves the pocket relative to the glyphs ' +
          'it is supposed to be carrying.\n\nUpdate bandH in the TEXT_EXTENT row (and the ' +
          'matching VIEWPORTS row) from the attached measurement.',
      ).toBeLessThan(BAND_HEIGHT_TOLERANCE)
    })
  }
})

/* ════════════════════════════════════════════════════════════════════════════
   THE PER-INK-PIXEL GATE — measuring the composite the eye actually receives
   ════════════════════════════════════════════════════════════════════════════

   ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────

   Everything above samples the backdrop over a glyph's RECT and reduces it to
   percentiles. That is the right instrument for a VEIL, because a veil is
   uniform across the rect: every pixel in the rect gets the same treatment, so
   the rect's shoulder is the glyph's shoulder.

   It is the wrong instrument for a PER-GLYPH treatment. A halo is darkest
   exactly where the ink is and has decayed to nothing by the middle of a word
   space. Averaged over the rect, most of the sampled pixels are gaps the halo
   never reached, and the p95 shoulder lands on one of them. The gate then
   reports the veil's own brightness for a glyph that is in fact sitting in a
   dark pool of its own — it under-credits, badly, and a design that thinned
   the veil and paid for legibility per-glyph would read as a regression.

   Under-crediting is the safe direction, which is why the rect gate above
   stays exactly as it is. But "safe" is not "true", and a gate that cannot
   distinguish a genuinely legible page from an illegible one in the direction
   the design is moving is a gate that will be argued with until it is
   weakened. So this measures the real thing instead.

   ── THE METHOD ────────────────────────────────────────────────────────────

   Two screenshots of the same frame:

     INK     the page as it ships — glyphs painted, halo painted, veil painted.
     GROUND  the same frame with the glyph FILL removed and everything else
             left alone (`neutraliseHeroForeground`, whose note explains why it
             no longer kills `text-shadow`). Halo and stroke still painted.

   Differencing them recovers the GLYPH COVERAGE MASK: a pixel where the two
   frames disagree is a pixel where ink was laid down, and the size of the
   disagreement is that pixel's coverage. Anti-aliased edges disagree a little;
   stem centres disagree a lot. No font metrics, no guessing at glyph outlines,
   no assumption about the typeface — the browser's own rasteriser draws the
   mask for us.

   Then, for every pixel in that mask, the local ground is GROUND at THAT
   pixel, and the ratio is `contrast(foreground, localGround)`. The shoulder is
   taken over ink pixels only. Word gaps, line gaps and the empty right-hand
   end of a ragged line contribute nothing, because no glyph is there and no
   reader is trying to read them.

   ── WHY THIS CANNOT BECOME A LOOPHOLE ────────────────────────────────────

   The obvious worry is that restricting the sample to ink pixels is a way to
   sample less and therefore fail less. Three things prevent that:

     1. THE MASK IS DERIVED, NOT DECLARED. It comes from differencing two
        renders of the page. There is no knob on it. Copy, font, size, weight
        and treatment all move it automatically, and a design cannot shrink it
        without literally painting fewer glyph pixels.

     2. THE THRESHOLD IS THE SAME `requiredRatio` the rect gate uses. Nothing
        here is graded on a curve.

     3. IT RUNS *IN ADDITION TO* the rect gate, never instead of it. Both must
        pass. A design can only ship by satisfying the conservative instrument
        AND the exact one. If a future round genuinely needs the rect gate's
        p95-over-gaps behaviour relaxed, that is a separate, argued change to
        the rect gate — it is not something this file grants by the back door.

   ── THE CONTROL ───────────────────────────────────────────────────────────

   A gate that has never failed is a gate nobody has tested. The control below
   thins the veil with NO per-glyph treatment and asserts this gate fails, then
   confirms the same measurement RESPONDS to a halo — the sampled local ground
   under the ink must get measurably darker when a halo is painted. If that
   second assertion ever stops holding, the sampler has gone blind again in
   exactly the way it was blind before 2026-09-03, and the message says so.
*/

/** Sum of absolute per-channel difference above which a pixel counts as inked. */
const INK_COVERAGE_DELTA = 36

/** Ink pixels a target must contribute before its shoulder means anything. */
const MIN_INK_PIXELS = 40

interface InkSample {
  target: Target
  /** Ratio at the worse of the two shoulders, over INK pixels only. */
  shoulder: number
  inkPixels: number
  rectPixels: number
  /** Mean luminance of the local ground under the ink. */
  groundMeanL: number
  required: number
}

/** Screenshots INK and GROUND and returns the per-ink-pixel shoulder per target. */
async function sampleInkPixels(page: Page, viewportWidth: number): Promise<InkSample[]> {
  const targets = (await collectTargets(page)).filter((t) => t.kind === 'text')

  /* The dev overlay is not part of the page — same reasoning as the rect
     sampler's note. Hidden in BOTH frames so it never enters the mask. */
  const hideOverlay =
    'nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button], ' +
    '#__next-build-watcher, #__next-prerender-indicator { display: none !important; }'
  const overlayTag = await page.addStyleTag({ content: hideOverlay })

  const inkShot = decodePng(await page.screenshot())
  await neutraliseHeroForeground(page)
  const groundShot = decodePng(await page.screenshot())
  await restoreHeroForeground(page)
  await overlayTag.evaluate((node: Element) => node.remove())

  const scale = inkShot.width / viewportWidth
  const out: InkSample[] = []

  for (const target of targets) {
    const colour = parseColor(target.color)
    if (!colour) continue

    const onScreen = target.rects.filter(
      (rect) =>
        rect.y >= 0 &&
        rect.x >= 0 &&
        (rect.y + rect.height) * scale <= inkShot.height &&
        (rect.x + rect.width) * scale <= inkShot.width,
    )
    if (onScreen.length === 0) continue

    const grounds: Array<{ l: number; rgb: Rgb }> = []
    let rectPixels = 0

    for (const rect of onScreen) {
      const x0 = Math.max(0, Math.floor(rect.x * scale))
      const y0 = Math.max(0, Math.floor(rect.y * scale))
      const x1 = Math.min(inkShot.width, Math.ceil((rect.x + rect.width) * scale))
      const y1 = Math.min(inkShot.height, Math.ceil((rect.y + rect.height) * scale))

      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          rectPixels += 1
          const i = (y * inkShot.width + x) * 4
          const delta =
            Math.abs((inkShot.data[i] ?? 0) - (groundShot.data[i] ?? 0)) +
            Math.abs((inkShot.data[i + 1] ?? 0) - (groundShot.data[i + 1] ?? 0)) +
            Math.abs((inkShot.data[i + 2] ?? 0) - (groundShot.data[i + 2] ?? 0))
          if (delta < INK_COVERAGE_DELTA) continue
          const rgb: Rgb = {
            r: groundShot.data[i] ?? 0,
            g: groundShot.data[i + 1] ?? 0,
            b: groundShot.data[i + 2] ?? 0,
            a: 1,
          }
          grounds.push({ l: relativeLuminance(rgb), rgb })
        }
      }
    }

    if (grounds.length < MIN_INK_PIXELS) continue
    grounds.sort((a, b) => a.l - b.l)
    const at = (q: number): Rgb =>
      (grounds[Math.min(grounds.length - 1, Math.floor(q * grounds.length))] ?? grounds[0])!.rgb

    const shoulder = Math.min(
      contrastRatio(flatten(colour, at(0.05)), at(0.05)),
      contrastRatio(flatten(colour, at(0.95)), at(0.95)),
    )

    out.push({
      target,
      shoulder,
      inkPixels: grounds.length,
      rectPixels,
      groundMeanL: grounds.reduce((a, p) => a + p.l, 0) / grounds.length,
      required: requiredRatio(target.fontSizePx, target.fontWeight),
    })
  }
  return out
}

for (const viewport of VIEWPORTS) {
  test.describe(`hero contrast at the ink pixels themselves at ${viewport.key}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('every glyph clears its threshold against the ground painted under that glyph', async ({
      page,
    }, testInfo) => {
      testInfo.setTimeout(120_000)

      await page.goto('/', { waitUntil: 'load' })
      await page.waitForLoadState('networkidle').catch(() => undefined)
      await freezeMotion(page)
      await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' })
      // `heroPhotoHasLanded` reads the manifest on disk; it takes no page.

      /* Tiled down the band in 80%-viewport steps, for the reason the rect
         gate tiles: on a phone the band is more than twice the viewport tall
         and two spot checks do not meet. */
      const bandHeight = await page.evaluate(
        () => document.getElementById('top')?.getBoundingClientRect().height ?? 0,
      )
      const step = Math.round(viewport.height * 0.8)
      const samples: InkSample[] = []
      for (let y = 0; y < Math.max(1, bandHeight - viewport.height * 0.5); y += step) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y)
        await page.evaluate(
          () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
        )
        samples.push(...(await sampleInkPixels(page, viewport.width)))
      }

      const failures = samples.filter((s) => s.shoulder < s.required)

      testInfo.attach(`ink-pixel-contrast-${viewport.key}`, {
        body: samples
          .sort((a, b) => a.shoulder / a.required - b.shoulder / b.required)
          .map(
            (s) =>
              `${round2(s.shoulder)}:1 / ${s.required}:1  ` +
              `${s.target.fontSizePx}px/${s.target.fontWeight}  ` +
              `${s.inkPixels}/${s.rectPixels}px inked (${((100 * s.inkPixels) / s.rectPixels).toFixed(1)}%)  ` +
              `ground mean L ${s.groundMeanL.toFixed(4)}  ` +
              `${s.target.color}  "${s.target.text.slice(0, 48)}"`,
          )
          .join('\n'),
        contentType: 'text/plain',
      })

      expect(
        samples.length,
        'No glyph produced a usable ink mask at all. Either the hero rendered no text, or ' +
          'neutraliseHeroForeground has stopped removing the glyph fill — in which case the ' +
          'INK and GROUND frames are identical, the mask is empty, and this gate is measuring ' +
          'nothing. Check that `-webkit-text-fill-color: transparent` still takes effect.',
      ).toBeGreaterThan(4)

      expect(
        failures.map(
          (s) =>
            `${round2(s.shoulder)}:1 against ${s.required}:1 — ${s.target.fontSizePx}px ` +
            `${s.target.color} "${s.target.text.slice(0, 40)}" ` +
            `(ground under the ink: mean L ${s.groundMeanL.toFixed(4)}, ${s.inkPixels}px)`,
        ),
        'A hero glyph fails WCAG against the ground actually painted under it.\n\n' +
          'This is measured at the INK PIXELS — the mask recovered by differencing the ' +
          'rendered frame against the same frame with the glyph fill removed — so it already ' +
          'credits any per-glyph halo or stroke the design paints. A failure here is a real ' +
          'legibility failure, not an artefact of sampling empty rect.\n\n' +
          'Fix it by deepening the per-glyph treatment under that role, raising the type\'s ' +
          'weight or size, or darkening the veil at that position. Not by raising ' +
          'INK_COVERAGE_DELTA, lowering MIN_INK_PIXELS, or touching requiredRatio.',
      ).toEqual([])
    })
  })
}

test.describe('the ink-pixel gate: the negative control', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('it fails on a thinned veil, and it can SEE a per-glyph halo', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000)

    await page.goto('/', { waitUntil: 'load' })
    await page.waitForLoadState('networkidle').catch(() => undefined)
    await freezeMotion(page)
    const photoLanded = heroPhotoHasLanded()
    test.skip(!photoLanded, 'No photograph is present; there is nothing for a veil to hide.')

    /* ── 1 · A THINNED VEIL WITH NO PER-GLYPH TREATMENT MUST FAIL ──────────

       THE CONTROL MUST BUILD THE UNTREATED PAGE, NOT INHERIT THE TREATED ONE.

       This block used to thin the veil and nothing else, and on 2026-09-03 it
       went VACUOUS the moment a real collar shipped: the 36-layer text-shadow
       in components/site/hero-scrim.module.css stayed painted, carried every
       glyph on its own, and zero targets failed at a 35% veil. The control
       reported "cannot fail" and was right — about itself.

       So the treatment is stripped HERE, where the whole point is to describe
       a page that has none. That is the opposite of the defect the comment in
       `neutraliseHeroForeground` warns about: there, stripping the shadow
       falsified a measurement of the SHIPPED page; here, not stripping it
       falsifies a measurement of a page that is defined as untreated.

       `scripts/check-hero-contrast.mjs --prove` learned the same lesson in
       the same week and answers it with `stripTreatments()`. If a future
       treatment arrives that a text-shadow reset does not remove — a
       `paint-order` stroke, a background painted per run — add it to this
       reset, and do not reach for the assertion at the bottom. */
    const thin = await page.addStyleTag({
      content:
        '[class$="scrim"], [class*="scrim "], [class*="scrim__"] { opacity: 0.35 !important; }' +
        '#top div[aria-hidden="true"] ~ div[aria-hidden="true"] { opacity: 0.35 !important; }' +
        '#top, #top * { text-shadow: none !important; -webkit-text-stroke: 0 !important;' +
        ' paint-order: normal !important; }',
    })
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    )
    const thinned = await sampleInkPixels(page, 1280)
    await thin.evaluate((node: Element) => node.remove())

    /* ── 2 · THE SAME MEASUREMENT MUST RESPOND TO A HALO ───────────────────

       The baseline here is the STRIPPED page, not the shipped one. Comparing
       an injected 3-layer halo against a page that already wears a 36-layer
       collar does not ask "can the sampler see a halo?" — it asks "is this
       halo deeper than the one already there?", and the honest answer for a
       deliberately modest control halo is no. Measured that way on
       2026-09-03 the ground under three targets got BRIGHTER (0.0066 ->
       0.0099 on the eyebrow), because the injected rule REPLACED the shipped
       collar. Strip first, and the comparison is the one the assertion's
       message claims it is: no treatment, then treatment. */
    const bare = await page.addStyleTag({
      content:
        '#top, #top * { text-shadow: none !important; -webkit-text-stroke: 0 !important;' +
        ' paint-order: normal !important; }',
    })
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    )
    const shipped = await sampleInkPixels(page, 1280)
    await bare.evaluate((node: Element) => node.remove())

    const halo = await page.addStyleTag({
      content: `#top .wrap, #top .wrap * { text-shadow:
        0 0 2px rgba(20,22,26,0.95), 0 0 6px rgba(20,22,26,0.88),
        0 0 16px rgba(20,22,26,0.75) !important; }`,
    })
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    )
    const haloed = await sampleInkPixels(page, 1280)
    await halo.evaluate((node: Element) => node.remove())

    const key = (s: InkSample): string => `${s.target.path}:${s.target.text}`
    const shippedBy = new Map(shipped.map((s) => [key(s), s]))
    const paired = haloed
      .map((h) => ({ h, s: shippedBy.get(key(h)) }))
      .filter((p): p is { h: InkSample; s: InkSample } => p.s !== undefined)

    const darkened = paired.filter((p) => p.h.groundMeanL < p.s.groundMeanL * 0.98)

    testInfo.attach('control-halo-response', {
      body: paired
        .map(
          (p) =>
            `${p.s.groundMeanL.toFixed(4)} -> ${p.h.groundMeanL.toFixed(4)}  ` +
            `(${round2(p.s.shoulder)}:1 -> ${round2(p.h.shoulder)}:1)  ` +
            `"${p.h.target.text.slice(0, 44)}"`,
        )
        .join('\n'),
      contentType: 'text/plain',
    })

    expect(
      paired.length,
      'The control could not pair a single target between the shipped and haloed renders.',
    ).toBeGreaterThan(3)

    expect(
      darkened.length,
      'THE SAMPLER IS BLIND TO PER-GLYPH TREATMENT.\n\n' +
        'A dark text-shadow halo was painted over every hero glyph and the ground measured ' +
        'UNDER THE INK did not get darker for any target. That is precisely the defect this ' +
        'gate was rewritten on 2026-09-03 to remove: `neutraliseHeroForeground` used to carry ' +
        '`text-shadow: none !important`, which erased the halo before sampling, so the one ' +
        'design that can open this photograph up — moving the darkening off the band and onto ' +
        'the letterforms — could never be measured as working.\n\n' +
        'If that line (or an equivalent) has come back, remove it. Do not delete this test.',
    ).toBeGreaterThan(0)

    const thinFailures = thinned.filter((s) => s.shoulder < s.required)
    expect(
      thinFailures.length,
      'Thinning the veil to 35% with NO per-glyph treatment did not fail the ink-pixel gate ' +
        'at any glyph. A gate that cannot fail is not evidence of anything. Either the veil ' +
        'selector in this control has stopped matching the shipped scrim — check it against ' +
        'components/site/hero-scrim.module.css — or the photograph behind the text is now so ' +
        'dark that it is not a photograph any more.',
    ).toBeGreaterThan(0)
  })
})
