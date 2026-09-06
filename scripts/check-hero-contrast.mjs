#!/usr/bin/env node
/**
 * check-hero-contrast — the analogue of check-ground-tokens.mjs for the
 * PHOTOGRAPHIC ground.
 *
 * Wire into package.json:
 *   "check:hero": "node scripts/check-hero-contrast.mjs"
 *   "verify": "... && npm run check:tokens && npm run check:hero && ..."
 *
 * Run `node scripts/check-hero-contrast.mjs --prove` to see the gate FAIL on a
 * synthetically thinned scrim. A gate that has never failed is a gate nobody
 * has tested; that mode is the standing proof that this one is not vacuous.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * app/globals.css publishes the hero's contrast ratios against a FLAT
 * #14161A: --fg 16.04:1, --fg-muted 7.15:1, --fg-accent 5.68:1. A photograph
 * behind the hero text makes every one of them false, because contrast is
 * then measured against whatever pixel sits behind each glyph.
 *
 * components/site/hero-scrim.module.css restores them with a veil. That
 * solution is only worth anything if it is CHECKED — a scrim alpha is exactly
 * the kind of number that gets nudged for looks, in a file whose failure mode
 * is invisible to the person nudging it. This is a page whose entire argument
 * is that its claims are checkable; a contrast guarantee it cannot check is
 * the one defect that disqualifies the argument.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── THE 2026-09-02 REWRITE: FROM ONE FLAT ALPHA TO AN ALPHA FIELD ─────────
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The version this replaces read ONE number out of the stylesheet —
 * `--scrim-floor-min` — and applied it to the whole frame. That was correct
 * for the scrim it was written against (five vertical stops, flat at the floor
 * across every row text can reach) and it becomes actively DANGEROUS the
 * moment the scrim is shaped.
 *
 * Concretely, against a pocket-plus-ramp scrim of the kind the reference repo
 * ships (`radial-gradient(...) , linear-gradient(...)`, two layers), the old
 * parser would have done one of two things, both of them silent:
 *
 *   1. found no `--scrim-floor-min` literal, returned null, and fallen back to
 *      `alphaFloor = floor ?? 1` — a fully opaque veil. Every ratio it then
 *      printed would have been the flat-ink ratio: green, and about a page
 *      nobody renders.
 *   2. found the literal and applied it EVERYWHERE, including in the corners
 *      the pocket does not reach, where the real composite alpha is a fraction
 *      of it.
 *
 * Both report a number that is not the number on screen. So the model changed:
 *
 *   THE SCRIM IS NOW RASTERISED. Every painted surface of the veil is parsed,
 *   evaluated as a function of (x, y) in the band's own box at a given
 *   viewport, and composited in CSS paint order. The result is an ALPHA FIELD
 *   — the effective density of --ground at each position — and every threshold
 *   in this file is evaluated against the field's value AT THAT POSITION,
 *   paired with the brightest source pixel that lands there.
 *
 *   "EVERY PAINTED SURFACE" MEANS THE PSEUDO-ELEMENTS TOO, and that sentence
 *   was written the hard way. The shipped veil is two surfaces: a full-width
 *   vertical FIELD on `.scrim` (24% -> 34%) and a POCKET on `.scrim::before`
 *   at the 93% clamp floor, ramped vertically and MASKED horizontally to the
 *   page measure so the picture survives in the outer gutters on wide screens.
 *   A parser that reads `.scrim { background-image: … }` and stops sees only
 *   the field, computes a 24% veil, and reports that every role in the hero
 *   fails by a factor of three. This gate did exactly that for one run.
 *
 *   Three consequences are baked in below:
 *     · `walkRules` walks braces instead of matching a regex. The regex it
 *       replaced consumed each rule's closing `}`, so the next rule could no
 *       longer match `(^|[},])` and `.scrim::before` was invisible to it.
 *     · masks are evaluated, not ignored. `mask-image` MULTIPLIES a surface's
 *       alpha, which is the only way to shape a layer on both axes (background
 *       layers can only ADD), so the pocket's horizontal edge — the exact
 *       place a glyph in the gutter would sit — is measured rather than
 *       assumed.
 *     · custom properties inherit into pseudo-elements, and `--container-wrap`
 *       is read out of app/globals.css rather than retyped, because the
 *       pocket's aperture is computed from the page measure and a measure that
 *       exists in two files will disagree with itself.
 *
 *   ANY CONSTRUCT THIS FILE CANNOT EVALUATE IS A HARD FAILURE, NEVER A
 *   FALLBACK. That is the single property that keeps the gate honest across a
 *   rewrite by somebody else: a scrim written in a form the rasteriser does
 *   not understand fails loudly, saying which token it choked on, instead of
 *   quietly measuring a scrim that does not exist.
 *
 * ── WHAT IT CHECKS ────────────────────────────────────────────────────────
 *
 *   A · THE ALGEBRA, always, photograph or not.
 *       Re-reads the ink ground's foreground roles out of app/globals.css,
 *       rasterises the scrim, takes the MINIMUM composite alpha anywhere a
 *       glyph can land, and re-derives the minimum alpha each role needs over
 *       a PURE WHITE source pixel. Fails if the field's weakest text-bearing
 *       point is under the binding role's floor. Nothing is hard-coded: a
 *       palette change, a role change or a scrim reshape all land here.
 *
 *       "Anywhere a glyph can land" is TEXT_EXTENT, below — the one layout
 *       assumption in this file, and the one a shaped scrim makes dangerous.
 *       It is not trusted: tests/e2e/hero-contrast.spec.ts imports it through
 *       `--emit-extent` and fails if a real glyph rectangle falls outside it.
 *
 *   B · THE CLEARANCE, always.
 *       The aperture — wherever the field runs below the text floor — is legal
 *       ONLY because it is text-free. This derives the topmost row at which
 *       the field first reaches the floor ACROSS ITS WHOLE WIDTH and asserts
 *       that row completes at least MIN_CLEARANCE px above the first glyph.
 *       It no longer parses named stops, so it holds for any shape.
 *
 *   C · THE PIXELS, when a photograph is present.
 *       Decodes every GRADED rung the manifest declares — never the ungraded
 *       master, which is not what the browser composites — maps it into the
 *       band under `object-fit: cover` at five reference viewports, and walks
 *       a grid over the band. In each cell it pairs the MINIMUM composite
 *       alpha of the scrim with the MAXIMUM luminance of the source pixels
 *       that land in it, which is the worst pairing that cell can produce.
 *       Cells inside the measured text extent are GATED; cells outside it are
 *       reported, so "is the photograph visible at all?" stays a measured
 *       question.
 *
 *   D · THE WIRING, when a photograph is present.
 *       components/site/hero.tsx must import the scrim module and apply its
 *       classes. A perfect scrim that nothing renders is not a guarantee.
 *
 *   E · THE SECOND SOURCE OF TRUTH.
 *       The manifest's declared alphas against the field's guaranteed floor.
 *
 *   G · THE PER-GLYPH TREATMENT, added 2026-09-03 and the reason this file
 *       grew a second measurement model. Everything above measures a veil
 *       painted UNDER the text; a text-shadow or a paint-order stroke is
 *       painted BY the text, so hiding the copy to photograph its backdrop
 *       hides the treatment with it and reports a bare photograph. See the
 *       long section "THE PER-GLYPH TREATMENT" below for the model, what it is
 *       stricter than, what it is more permissive than, and the Chromium
 *       calibration that keeps it from over-crediting. A treatment that
 *       reaches further than an em beyond the ink is a SHEET and fails; a
 *       treatment credited on a page that has not disclosed the method fails
 *       too, because the page's ratios would then be quoted as plain WCAG
 *       numbers that nobody measured.
 *
 * ── AND WHEN THERE IS NO PHOTOGRAPH ───────────────────────────────────────
 *
 * A and B still run — they are properties of the CSS, not of the asset. C and
 * D are skipped and the run passes, printing why. That is the repository's
 * normal state until `public/brand/hero-source.*` is dropped in and
 * `scripts/gen-hero-photo.mjs` is run: the scrim composites `--ground` over
 * `--ground`, which is `--ground`, so the hero renders exactly as it does
 * today and app/globals.css's published ratios apply unchanged.
 *
 * ── THE DIVISION OF LABOUR WITH THE BROWSER GATE ──────────────────────────
 *
 * This file names a ROLE and a POSITION. `tests/e2e/hero-contrast.spec.ts`
 * names a DOM ELEMENT: it screenshots the real page with the hero's own text
 * made transparent and measures the true painted backdrop under each glyph's
 * `Range.getClientRects()`. Neither subsumes the other:
 *
 *   - the browser gate is the ground truth and cannot run in `npm run verify`
 *     without a build and a browser;
 *   - this gate runs on every build, sees every RUNG (the browser only
 *     downloads one per viewport), and is the only place the algebra is
 *     re-derived from the palette rather than observed.
 *
 * They are joined by TEXT_EXTENT below, which this file exports and the
 * browser gate imports and VERIFIES against real glyph rectangles. That is
 * what stops this file's one layout assumption from rotting.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GLOBALS = join('app', 'globals.css');
const SCRIM = join('components', 'site', 'hero-scrim.module.css');
const HERO_TSX = join('components', 'site', 'hero.tsx');
const HERO_CSS = join('components', 'site', 'hero.module.css');
/** The brightest source pixel there can be — every worst case is solved over it. */
const WHITE_SRC = [255, 255, 255];
const PHOTO_DIR = join('public', 'brand', 'hero');
const SOURCE_STEM = join('public', 'brand', 'hero-source');
const SOURCE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.tif', '.tiff'];

/**
 * The engineering margin every threshold is multiplied by, matching the
 * reference repo's discipline. It pays for sRGB rounding, encoder drift
 * between the source and the shipped rung, and the fact that a glyph's
 * antialiased edge is lighter than its body.
 *
 * IT IS NOT A TUNING KNOB. Lowering it is the cheapest way to turn this file
 * green and the only one that changes nothing about the page. The 0.9% margin
 * that put the 11px eyebrow at 4.449:1 earlier in this project is exactly the
 * distance between 1.05 and 1.04.
 */
export const HEADROOM = 1.05;

/** Clearance the aperture's ramp must finish above the first glyph, in CSS px. */
const MIN_CLEARANCE = 12;

/**
 * Grid resolution for the rasteriser, in cells across the band's shorter axis.
 * 64 puts a cell at ~6px on a phone and ~20px at 1600 — finer than a glyph on
 * the axis that matters, and the cell takes the WORST pixel inside it, so a
 * coarser grid is conservative rather than blind.
 */
const GRID = 64;

/**
 * MEASURED, Chromium, built page, 2026-09-02: `#top`.getBoundingClientRect()
 * against `Range.getClientRects()` over every text node inside it. Two things
 * come out of that pass and both are load-bearing here.
 *
 * 1. THE FIRST GLYPH sits at `--spacing-band` PLUS `--hero-headroom`.
 *
 *    It used to sit at exactly `--spacing-band`, and this file hard-coded that.
 *    The vertical aperture broke the assumption on purpose: below the page
 *    measure the pocket spans the full width and has no horizontal aperture to
 *    give, so components/site/hero-scrim.module.css opens a window ABOVE the
 *    text instead and pads the hero's content down by the same distance its own
 *    ramps move. Check B resolves `--hero-headroom` off `.ground` at each
 *    viewport rather than trusting this table.
 *
 *      viewport      band box      first glyph y   --spacing-band + headroom
 *      375 x 812     375 x 1685     243            72 + 170.5
 *      390 x 844     390 x 1624     249            72 + 177.2
 *      768 x 1024    768 x 1285     277            76.8 + 200
 *      861 x 1000    861 x 1324     286            86.1 + 200
 *      1280 x 800   1280 x 1306     128           128 + 0   (jambs open instead)
 *      1600 x 900   1600 x 1338     140           140 + 0   (jambs open instead)
 *
 *    MEASURED, Chromium, built page, 2026-09-03, and reproduced to the pixel by
 *    check B's own arithmetic — the gate prints the clearance it derives and it
 *    agrees with this column at all six widths.
 *
 * 2. THE TEXT EXTENT — the fraction of the band's box any glyph reaches, on
 *    both axes. This is the geometry a SHAPED scrim has to be judged against:
 *    a pocket that darkens 30% of the frame is legal if and only if the other
 *    70% carries no glyphs.
 *
 * RE-MEASURED 2026-09-02 (late), by `tests/e2e/hero-contrast.spec.ts` ->
 * "TEXT_EXTENT row w=N still describes where the glyphs are", which attaches
 * exactly this table on every run. The extents were unchanged to within half a
 * percent; the BAND HEIGHTS had drifted 2.3-3.7% (the band grew when the
 * AI-disclosure line joined the <Limit> block), and those are corrected below.
 * The drift is why that test now checks the height as well as the extent: the
 * gate resolves %-based gradient stops against this box, so a stale height
 * displaces every position it evaluates.
 *
 * RE-MEASURED 2026-09-03, after the vertical aperture landed. The band grew by
 * the headroom at every viewport below the page measure and the text extent's
 * TOP moved down with it — 4.8% -> 14.4% at 375 — which is the whole point: the
 * top ninth of the band is now photograph rather than the first line of copy.
 * The two desktop rows are unchanged, because headroom is 0 there.
 *
 *      viewport      band box     text extent (x)   text extent (y)
 *      375           375 x 1685   5.3% .. 94.5%    14.4% .. 95.7%
 *      390           390 x 1624   5.1% .. 94.3%    15.3% .. 95.5%
 *      768           768 x 1285   4.5% .. 95.3%    21.5% .. 94.0%
 *      861           861 x 1324   4.5% .. 95.1%    21.6% .. 93.5%
 *      1280         1280 x 1306   10.9% .. 88.5%    9.8% .. 90.2%
 *      1600         1600 x 1338   18.8% .. 80.8%   10.5% .. 89.6%
 *
 * ⚠ THIS TABLE IS AN ASSUMPTION, AND IT IS THE ONLY ONE IN THIS FILE.
 * A copy edit that adds a line, a font swap, a container-width change — any of
 * them move these numbers, and a stale table would let a shaped scrim look
 * safe here while a glyph sits outside the pocket on the real page.
 *
 * So it is not trusted on its own: `tests/e2e/hero-contrast.spec.ts` imports
 * TEXT_EXTENT, measures the real glyph rectangles in Chromium at 375 / 768 /
 * 1280, and FAILS if any of them falls outside the box declared here. This
 * file states the geometry; the browser proves it. Keep both, or keep neither.
 *
 * The declared boxes are the measurements above INFLATED by EXTENT_MARGIN, in
 * the safe direction only (wider and taller than measured, never narrower).
 */
/**
 * The root font size every rem in this analysis is resolved against. The page
 * never sets one, so it is the UA default; it is named here because four
 * separate conversions used to spell it `16` and a breakpoint that disagrees
 * with a length by a factor of the root font size is not a thing you find by
 * reading.
 */
const ROOT_FONT_PX = 16;

const EXTENT_MARGIN = 0.02;

/**
 * viewport width -> the band-box fraction glyphs occupy. Interpolation is by
 * nearest declared width at or below the viewport, because the layout's
 * breakpoints are step changes and averaging across one would invent a box
 * that no viewport renders.
 */
/*
  RE-MEASURED 2026-09-06, when the band went to two columns. Chromium, the
  same rectangles tests/e2e/hero-contrast.spec.ts walks.

    width   band height          measured glyph box
    375     1527  (unchanged)    unchanged — still one column, same order
    390     1466  (unchanged)    unchanged
    768     1164 -> 1318         x  4.5% .. 74.3%   y 20.2% .. 93.9%
    861     1181 -> 1371         x  4.5% .. 73.6%   y 20.1% .. 93.4%
    1280    1162 -> 1018         x 10.9% .. 85.5%   y 12.6% .. 87.1%
    1600    1186 -> 1042         x 18.8% .. 78.4%   y 13.4% .. 86.2%

  THE BAND MOVED IN BOTH DIRECTIONS, which is the layout working. Above the
  900px split it is SHORTER — 144px at 1280 — because the evidence sets beside
  the lede instead of under it. Below the split it is TALLER, because the three
  category eyebrows are three new lines in a column that was already stacked.

  THE BOXES ARE NOT NARROWED TO MATCH. Every x/y here is the WIDER of the old
  declaration and the new measurement, per this file's own rule — "inflated in
  the safe direction only, never narrower". The glyph box genuinely shrank on
  the right at every desktop width (85.5% against 88.6% at 1280) because the
  quoted limits now set at --container-prose on the left instead of spanning
  the wrap, but declaring that would hand the build gate a smaller field to
  check for no gain. Only bandH is corrected to the measurement, because that
  is the number the drift assertion is about.
*/
/*
  RE-MEASURED 2026-09-06 (later), when the band was re-set in the serif: the
  name Newsreader 500 at --text-h1, three serif titles at --text-title in
  place of the category eyebrows, sentence-case body-face labels, and the
  readouts' full-width hairlines replaced by 32px dashes. Same instrument.

    width   band height          measured glyph box
    375     1527 -> 1524         x  5.3% .. 94.2%   y 17.2% .. 95.0%
    390     1466 -> 1452         x  5.1% .. 94.3%   y 18.0% .. 94.8%
    768     1318 -> 1310         x  4.5% .. 74.3%   y 20.4% .. 93.9%
    861     1371 -> 1355         x  4.5% .. 66.7%   y 20.4% .. 93.4%
    1280    1018 ->  987         x 10.9% .. 87.1%   y 13.1% .. 86.7%
    1600    1042 -> 1013         x 18.8% .. 80.4%   y 13.9% .. 85.8%

  The band is SHORTER at every width — an eyebrow line left each block and
  the serif titles set tighter than eyebrow-plus-readout did — and every
  measured box sits INSIDE the box already declared, on all four sides at all
  six widths. So, by the rule above, no box moves and only bandH is corrected.
*/
/*
  RE-MEASURED 2026-09-06 (the hybrid), when the band was brought under one
  screen on desktop (components/site/hero.module.css, ONE SCREEN: the
  evidence gap, the block margins, the limits' leading and the band's foot
  all tightened; the actions moved between the identity and the evidence in
  source order, so on the phone they sit under the lede; the Threshold's
  rule became a 32px stub). Same instrument, viewport height 900.

    width   band height          measured glyph box
    375     1524 -> 1403         x  5.3% .. 94.2%   y 18.7% .. 96.4%
    390     1452 -> 1361         x  5.1% .. 94.3%   y 19.2% .. 96.3%
    768     1310 -> 1214         x  4.5% .. 74.3%   y 22.0% .. 95.8%
    861     1355 -> 1246         x  4.5% .. 66.7%   y 22.2% .. 96.0%
    1280     987 ->  797         x 10.9% .. 87.1%   y 16.2% .. 93.7%
    1600    1013 ->  811         x 18.8% .. 80.4%   y 17.4% .. 93.8%

  THE BAND IS SHORTER AT EVERY WIDTH AND THE GLYPHS REACH LOWER IN IT. The
  band's foot went from --spacing-band to 48px, so the last caveat line now
  sits within 4-7% of the band's bottom edge at every width, and the
  measured y1 is OUTSIDE the declared box on the bottom at all six widths
  (96.4% against 95.8% at 375; 93.7% against 90.3% at 1280). By the rule
  above y1 is widened to the measurement — rounded up, never down — and
  every other side, where the measurement sits inside the declaration, is
  left at the wider of the two. bandH is corrected to the measurement.
*/
/*
  RE-MEASURED 2026-09-06 (the floor), when `.band` in
  components/site/hero.module.css took `min-block-size: 100svh` to close the
  2.8px of the next band's paper a 797.2px band left at the fold of an 800px
  viewport. Same instrument, BUT AT EACH GATE BOX'S OWN HEIGHT this time —
  375x812, 390x844, 768x1024, 861x1000, 1280x800, 1600x900, the VIEWPORT_BOXES
  below — because with a floor the desktop band's height IS the viewport's,
  and a row measured at 900 would declare 900 for the 1280x800 box the gate
  evaluates. The phone rows move for the same reason in the other direction:
  --hero-headroom is `clamp(7.5rem, 21svh, 12.5rem)`, so the band the previous
  900-tall instrument measured (1403 at 375) is 18px taller than the band in
  the 812px box the gate actually reasons about.

    width   box height   band height          measured glyph box
    375        812       1403 -> 1385         x  5.3% .. 94.2%   y 17.6% .. 96.4%
    390        844       1361 -> 1350         x  5.1% .. 94.3%   y 18.5% .. 96.3%
    768       1024       1214 -> 1225         x  4.5% .. 74.3%   y 22.7% .. 95.9%
    861       1000       1246 -> 1257         x  4.5% .. 66.7%   y 22.8% .. 96.0%
    1280       800        797 ->  800         x 10.9% .. 87.1%   y 16.1% .. 93.4%
    1600       900        811 ->  900         x 18.8% .. 80.4%   y 15.7% .. 84.6%

  The floor binds only on desktop (1280 and 1600 are now exactly the box),
  and every measured glyph box sits INSIDE the box already declared on all
  four sides at all six widths — on desktop the glyphs did not move and the
  band grew under them, so every fraction shrank. By the rule above no box
  moves and only bandH is corrected to the measurement.

  EACH ROW NOW CARRIES `h`, THE VIEWPORT HEIGHT IT WAS MEASURED IN. A band
  height used to be a function of width alone, so the browser gate could
  re-measure every row at one convenient height (900) and the table did not
  have to say. With `min-block-size: 100svh` the desktop band IS the viewport
  height, and a row that does not name its height is a row the gate cannot
  re-measure: at 1280x900 the band is 900 and "bandH 800" reads as 12.5%
  drift when it is the right number for the 1280x800 box this gate
  evaluates. `h` is the same height as VIEWPORT_BOXES below — asserted there
  — and tests/e2e/hero-contrast.spec.ts reads it through --emit-extent and
  sizes its viewport to it.
*/
export const TEXT_EXTENT = [
  { w: 375, h: 812, bandH: 1385, x0: 0.053, x1: 0.946, y0: 0.144, y1: 0.965 },
  { w: 390, h: 844, bandH: 1350, x0: 0.051, x1: 0.944, y0: 0.153, y1: 0.964 },
  { w: 768, h: 1024, bandH: 1225, x0: 0.045, x1: 0.954, y0: 0.202, y1: 0.959 },
  { w: 861, h: 1000, bandH: 1257, x0: 0.045, x1: 0.951, y0: 0.201, y1: 0.961 },
  { w: 1280, h: 800, bandH: 800, x0: 0.109, x1: 0.886, y0: 0.098, y1: 0.938 },
  { w: 1600, h: 900, bandH: 900, x0: 0.187, x1: 0.809, y0: 0.104, y1: 0.939 },
];

/** The declared box for a viewport width, inflated by EXTENT_MARGIN. */
export function textExtentFor(width) {
  let pick = TEXT_EXTENT[0];
  for (const row of TEXT_EXTENT) if (row.w <= width) pick = row;
  const m = EXTENT_MARGIN;
  return {
    ...pick,
    x0: Math.max(0, pick.x0 - m),
    x1: Math.min(1, pick.x1 + m),
    y0: Math.max(0, pick.y0 - m),
    y1: Math.min(1, pick.y1 + m),
  };
}

/**
 * Reference viewports for checks B, C and F.
 *
 * ⚠ THE BAND HEIGHT IS NOT TYPED HERE, AND THAT IS A CORRECTION.
 *
 * It used to be its own column, and it had drifted: every row below the page
 * measure was SHORT BY EXACTLY --hero-headroom (375: 1515 against 1685; 390:
 * 1446 against 1624; 768: 1085 against 1285; 861: 1124 against 1324), because
 * this table was written before the vertical aperture landed and TEXT_EXTENT
 * was re-measured afterwards while this one was not. The two desktop rows
 * agreed, which is exactly why nobody noticed.
 *
 * The cost of that drift was not cosmetic. `vp.bandH` is what the text
 * extent's FRACTIONS are resolved against, so an 11% short band moved every
 * gated y position up by 11% and left the bottom 170px of the phone's text
 * region unsampled — the same class of blind spot as the coverage hole this
 * file now checks for, in the gate's own coordinate table.
 *
 * So the band box has ONE source of truth: TEXT_EXTENT, which
 * tests/e2e/hero-contrast.spec.ts re-measures in Chromium and fails on. A
 * height nobody validates is a height that will be wrong again.
 */
const VIEWPORT_BOXES = [
  { name: '375x812', w: 375, h: 812 },
  { name: '390x844', w: 390, h: 844 },
  // 768 is one of the three widths tests/e2e/hero-contrast.spec.ts samples;
  // evaluating the same width here keeps the two gates arguing about one page.
  { name: '768x1024', w: 768, h: 1024 },
  { name: '861x1000', w: 861, h: 1000 },
  { name: '1280x800', w: 1280, h: 800 },
  { name: '1600x900', w: 1600, h: 900 },
];

const VIEWPORTS = VIEWPORT_BOXES.map((vp) => {
  const row = TEXT_EXTENT.find((r) => r.w === vp.w);
  if (!row) {
    throw new Error(
      `check-hero-contrast: viewport ${vp.name} has no TEXT_EXTENT row. The band box is ` +
        'derived from that table so the browser gate validates it; add the measured row ' +
        'rather than typing a height here.',
    );
  }
  if (row.h !== vp.h) {
    throw new Error(
      `check-hero-contrast: viewport ${vp.name} is ${vp.h}px tall but its TEXT_EXTENT row was ` +
        `measured in a ${row.h}px viewport. Since the band took a 100svh floor its desktop height ` +
        'IS the viewport height, so a row measured at another height describes another box; ' +
        're-measure the row at this box and record h with it.',
    );
  }
  return { ...vp, bandH: row.bandH };
});

/**
 * The ink ground's foreground roles and the threshold each one actually owes.
 *
 * `--edge` is absent on purpose and app/globals.css says why: it separates
 * one record from the next, those records are also separated by space and
 * type hierarchy, so it carries no unique information and 1.4.11 does not
 * reach it. It measures 1.37:1 on flat ink already, and the browser gate holds
 * it to a no-regression floor rather than to 3:1.
 *
 * `--ground`, `--ground-sunk` and `--surface-pressed` are absent because they
 * are opaque backgrounds: anything painted on them is measured against them,
 * not against the photograph.
 */
const ROLE_THRESHOLDS = {
  '--fg': 4.5,
  '--fg-muted': 4.5,
  /* The display name, and held to the SMALL-text bar on purpose. It is set at
     clamp() display sizes so 1.4.3 would allow 3:1, but it measures far above
     4.5 anyway — taking the exemption would buy nothing and would quietly
     licence a warmer, weaker cream later. */
  '--fg-brand': 4.5,
  '--fg-accent': 4.5,
  // Display-size role by definition (>=24px in this system), so 1.4.3 large.
  // Same hex as --fg-accent on ink, so it never sets the floor here.
  '--fg-accent-display': 3,
  '--fg-pressed': 4.5,
  '--fg-error': 4.5,
  // Graphical objects required to understand content — WCAG 1.4.11.
  '--rule': 3,
  '--focus-ring': 3,
};

/* ── colour maths ───────────────────────────────────────────────────────── */

const toLinear = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** Source-over of `fg` at `alpha` on top of `bg`, both opaque sRGB triples. */
const composite = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

function parseHex(value) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** Smallest alpha of `veil` over `backdrop` at which `fg` clears `need`. */
function minAlpha(fg, veil, backdrop, need) {
  if (contrast(fg, backdrop) >= need) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrast(fg, composite(veil, mid, backdrop)) >= need) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** sRGB triple whose luminance is `l` — the grey the composite maths needs. */
function greyOf(l) {
  let lo = 0;
  let hi = 255;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (luminance([mid, mid, mid]) < l) lo = mid;
    else hi = mid;
  }
  return [hi, hi, hi];
}

/* ════════════════════════════════════════════════════════════════════════════
   THE PER-GLYPH TREATMENT, AND THE ONE MEASUREMENT THAT MAKES IT CHECKABLE

   ── THE PROBLEM THIS SECTION EXISTS FOR ───────────────────────────────────

   Every round of this hero so far darkened the BACKGROUND to suit the text: a
   veil between the reader and the photograph. A veil has to be sized by the
   BRIGHTEST pixel anywhere under any glyph, so one lit window forces the whole
   region dark, and the picture dies. That is not a bug in the veil — it is
   what a veil IS.

   Legibility is a LOCAL property. A glyph needs contrast against the pixels
   immediately around THAT GLYPH. Moving the darkening onto the letterforms —
   a text-shadow halo, a paint-order stroke — makes the cost proportional to
   the ink rather than to the band.

   ── AND THE MEASUREMENT PROBLEM IT CREATES ────────────────────────────────

   THE GATE MUST NOT BE ABLE TO CONFUSE THE TWO. A treatment painted BY the
   text does not change what a naive backdrop sampler sees BEHIND the text:
   hide the copy to photograph its backdrop and you hide the halo with it, so
   a page that is genuinely legible reports as failing, and — far worse — the
   reverse is arrangeable. Everything below exists so that the number this
   file prints is the number a reader's eye receives.

   ── WHAT IS MEASURED, EXACTLY ─────────────────────────────────────────────

   For one role, at one position in the band:

     1. A GLYPH IS A STROKE. Model it as a straight bar of width `stem`, the
        real stem width of the real cut at the real size — MEASURED in
        Chromium, see STEM_EM. Not a guess: the halo a shadow can throw is
        bounded by how much glyph alpha there is to blur, and Montserrat 200
        (this page's display cut) has a 0.034em stem, a quarter of Inter 700's.
        A model that ignored that would credit the hero's thinnest, largest
        type with a halo it cannot physically produce.

     2. THE TREATMENT IS AN ALPHA PROFILE T(x), x measured OUTWARD from the
        stroke's edge in CSS px. Shadows are the bar convolved with a Gaussian
        (`shadowProfile`); a paint-order stroke is a hard rim (`strokeProfile`).
        Layers composite source-over exactly as the browser paints them.

     3. THE GROUND IS WHAT THE EYE INTEGRATES, NOT WHAT SITS AT ONE POINT.
        WCAG's ratio assumes a UNIFORM background. Against a photograph with a
        halo the background varies within a single letter, so "the background"
        has to be defined. It is defined here as

            the luminance of the visible ground, averaged over a half-Gaussian
            of width OBSERVER_SIGMA_PX centred on the stroke's edge and
            extending away from the ink.

        That is the observer's own point spread function restricted to the side
        the ground is on. It is the honest definition because it is the one
        that cannot be gamed from either end: a hairline rim washes out under
        it (a 1px rim does not deliver a 1px reader a dark surround), and a
        vast soft bloom is diluted by the photograph it fails to cover.

     4. THE INK IS TAKEN AT ITS NOMINAL COLOUR, unblurred — which is exactly
        what WCAG 1.4.3 does with the text colour, and what keeps every number
        this file prints continuous with the flat-ink ratios app/globals.css
        publishes. With no treatment and no photograph the whole apparatus
        collapses to `contrast(role, --ground)`, identically. That property is
        asserted below (`assertNeutrality`) rather than hoped for.

   ── WHAT THIS IS STRICTER THAN, AND WHAT IT IS MORE PERMISSIVE THAN ───────

   NOBODY MAY MISTAKE THIS FOR THE LITERAL WCAG PROCEDURE. Written out:

     STRICTER than WCAG 2.x, on two counts.
       · WCAG measures against a nominal flat background colour. This measures
         against the real composited photograph, and pairs each glyph with the
         BRIGHTEST source pixel in its neighbourhood rather than the average —
         the worst case that region can produce, at every one of six viewports
         and on every graded rung, not the one a screenshot happened to catch.
       · Every threshold carries the HEADROOM multiplier on top.

     MORE PERMISSIVE than WCAG 2.x, on exactly one count, and it is the whole
     point of the round:
       · WCAG 2.x DOES NOT FORMALLY CREDIT A TEXT-SHADOW OR A TEXT-STROKE.
         Its ratio is defined between a text colour and a background colour;
         a halo the text itself paints has no place in that formula, and the
         technique documents are silent on it. This file credits it, because a
         reader's eye does — but the credit is a departure from the letter of
         1.4.3 and it is named as one. A page that publishes a number derived
         here MUST NOT describe it as a plain WCAG contrast ratio. See
         `CONTRAST_DISCLOSURE`, which makes that a build failure rather than an
         editorial hope.

   ── THE MODEL IS CALIBRATED AGAINST CHROMIUM, NOT ASSUMED ─────────────────

   Every constant below was measured, and the model as a whole was validated
   against 28 rendered cases (7 cut x size combinations x 4 treatments) by
   rendering real glyphs in Chromium over a white page and comparing the
   observer-weighted ground the browser painted with the number this model
   predicts. THE MODEL NEVER REPORTS A DARKER GROUND THAN THE BROWSER PAINTS
   across that set — worst margin +0.0055 in relative luminance, mean +0.104.

   The binding rows, as relative luminance of the local ground (higher = a
   lighter ground = the stricter answer; `model - rendered` must be >= 0):

     cut / size / treatment                 rendered   model    margin
     Inter500       17px  core2+bloom16      0.6954    0.7008   +0.0055  <- worst
     Inter400       19px  core2+bloom16      0.6931    0.7013   +0.0082
     Inter700       24px  core2+bloom16      0.6086    0.6202   +0.0117
     Montserrat300  40px  core2+bloom16      0.6357    0.6552   +0.0195
     Montserrat200  92px  core2+bloom16      0.5681    0.5993   +0.0312
     Montserrat200  92px  stroke5            0.2962    0.3423   +0.0462
     Montserrat200  92px  stroke3            0.6556    0.7491   +0.0935
     IBMPlexMono400 13px  stroke3+bloom16    0.5181    0.7189   +0.2008  <- most

   At the calibration this file ships (SHADOW_CREDIT 0.85, raster loss 1.0px)
   every one of the 28 is non-negative. At the values the arithmetic alone
   would suggest — full shadow credit, and the nominal half-width for a stroke
   — the five shadow-only rows come out at -0.019 to -0.037 and the two
   Montserrat stroke rows at -0.0265 and -0.0215: the model would have been
   claiming a DARKER ground than the browser paints, on this page's own display
   cut, which is the one direction a contrast gate may never be wrong in.

   The slack is uneven and that is expected rather than sloppy: the rows with
   the most margin are the ones where a rim's inner edge is eaten by a
   light-on-dark fill's antialiasing, which is a per-cut, per-size effect this
   model does not attempt to resolve. It resolves it in the safe direction and
   says by how much.

   The two negative rows above are what set STROKE_RASTER_LOSS_PX to 1.0px;
   the Inter500 row is what set SHADOW_CREDIT to 0.85. The harness is
   reproducible: render "I" in the cut at 400px to get the stem by coverage
   integral, render it again at the target size with the treatment over a white
   page, and take the half-Gaussian-weighted mean luminance of the columns
   outward from the ink's coverage edge. `--emit-type` below prints exactly the
   inputs a browser-side gate needs to re-run it.

   The constants are on the conservative side of what was measured, and like
   HEADROOM they are NOT TUNING KNOBS. Raising SHADOW_CREDIT or lowering
   STROKE_RASTER_LOSS_PX is the cheapest possible way to turn a failing halo
   green and it changes nothing whatsoever about the page.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * THE OBSERVER, in CSS px.
 *
 * WCAG 2.x's 4.5:1 is calibrated for a reader of roughly 20/40 acuity — a
 * minimum angle of resolution of 2 arcmin. The CSS reference pixel is defined
 * as the visual angle of one device pixel at 96dpi seen from arm's length,
 * which is 0.0213deg = 1.278 arcmin. So 2 arcmin is 1.565 CSS px, and that is
 * taken as the STANDARD DEVIATION of the observer's point spread function.
 *
 * Using the whole MAR as sigma, rather than the usual sigma = MAR/2, is
 * deliberately the pessimistic direction: a wider observer washes more
 * photograph into the local ground and credits the treatment LESS.
 */
export const OBSERVER_SIGMA_PX = 1.565;

/**
 * A CSS text-shadow blur radius, as a Gaussian sigma.
 *
 * CSS Backgrounds 3 says a blur radius of B should look like a Gaussian of
 * standard deviation B/2. MEASURED in Chromium against a 60px bar, fitting
 * sigma to the rendered profile: 0.4285 (B=6), 0.4745 (B=12), 0.4670 (B=24),
 * 0.4700 (B=48), rms residual <= 0.017 in alpha. 0.45 is taken as the tight
 * end of that range, and tighter is the conservative direction — a tighter
 * shadow delivers less alpha across the observer's window.
 */
const SHADOW_SIGMA_PER_BLUR = 0.45;

/**
 * The fraction of a shadow layer's modelled alpha this gate credits.
 *
 * The bar model is one-dimensional and a glyph is not: a blur wide enough to
 * matter also loses mass off the cap and the baseline, and the glyph's own
 * rasterisation softens the edge the shadow is thrown from. `CAP_HEIGHT_EM`
 * below models the first of those exactly; 0.85 covers the rest. It is the
 * value at which the 28-case validation set became conservative EVERYWHERE
 * (at 0.90 the worst case still over-credited by 0.0086 in luminance).
 */
const SHADOW_CREDIT = 0.85;

/**
 * How much of a paint-order stroke's nominal half-width is NOT delivered.
 *
 * `-webkit-text-stroke: Npx` centres an N-wide stroke on the glyph outline, so
 * the arithmetic says N/2 sits outside. MEASURED, Chromium: a 5px stroke on
 * Montserrat 200 at 92px delivers an effective rim of 1.8px against the 2.5px
 * the arithmetic predicts, because the fill's antialiased edge — painted ON
 * TOP, that being what `paint-order: stroke fill` means — eats the rim's inner
 * margin. 1.0px is the loss at which every stroke case in the validation set
 * became conservative.
 *
 * The consequence is worth stating plainly: A TEXT-STROKE THINNER THAN 2px
 * DELIVERS ESSENTIALLY NOTHING at reading sizes, and this gate will say so.
 */
const STROKE_RASTER_LOSS_PX = 1.0;

/** Cap height as a fraction of the em — the vertical extent a shadow is thrown from. */
const CAP_HEIGHT_EM = 0.70;

/**
 * MEASURED STEM WIDTHS, in em, of the exact cuts app/layout.tsx loads.
 *
 * Chromium, 2026-09-03: the letter "I" rendered at 400px in each cut, black on
 * white, stem width taken as the COVERAGE INTEGRAL of one scanline through the
 * stem (so the antialiased edges are counted at their real weight rather than
 * thresholded away).
 *
 * These are not decoration. The alpha a shadow can throw is proportional to
 * the ink it is thrown from, and this page's display face is Montserrat 200 —
 * a 0.0336em stem, less than a QUARTER of Inter 700's. A halo that looks
 * generous on a bold sans is nearly invisible on this hero's headline, and no
 * amount of blur radius fixes that. That fact only exists in this file because
 * these numbers were measured rather than assumed.
 *
 * ── THE SERIF, AND WHY ITS ROW IS A MINIMUM RATHER THAN A NUMBER ──────────
 *
 * `serif` is Newsreader (app/layout.tsx), a VARIABLE font with an optical-size
 * axis (opsz 6–72) that `font-optical-sizing: auto` drives from the rendered
 * px size. So this cut does not have one stem width: it has one per size, and
 * the "I" measured by the harness above at 400px lands at the axis's 72 end,
 * which for this family is the THICKEST main stem — Newsreader's display cut
 * gains contrast by thickening stems and thinning hairlines, not the reverse.
 * Measured 2026-09-06, same harness (calibrated first against Montserrat 200
 * and Inter 400, which it reproduced to all five figures), stepping the axis
 * with `font-optical-sizing: none; font-variation-settings: 'opsz' N`:
 *
 *     opsz          6      12      16      20      23      28      36      48      64      72
 *     serif:400  .10901  .09451  .08483  .08087  .08214  .08427  .08769  .09279  .09960  .10301
 *     serif:500  .14102  .12202  .10934  .10414  .10579  .10861  .11307  .11979  .12875  .13322
 *
 * The page sets serif:500 at --text-h1 (36–64px) and serif:400 at
 * --text-title (20–23px), so a per-size table would credit the name at
 * 0.113–0.129 and the titles at 0.081–0.082. This file does not model the
 * axis; it takes the MINIMUM OVER THE WHOLE AXIS for each weight, which is the
 * one direction a contrast gate may be wrong in. Re-measure if the family,
 * the axes loaded, or either size step changes.
 */
const STEM_EM = {
  'display:200': 0.03357,
  'display:300': 0.05133,
  'body:400': 0.09277,
  'body:500': 0.11159,
  'body:600': 0.13038,
  'body:700': 0.14920,
  'body:800': 0.17219,
  'mono:400': 0.08401,
  'mono:500': 0.11201,
  'mono:600': 0.13000,
  'serif:400': 0.08087,
  'serif:500': 0.10414,
};

/**
 * MEASURED COUNTER WIDTHS, in em — the narrowest interior gap of each cut,
 * taken across the two stems of a lowercase "n" at mid x-height, same harness
 * and same day as STEM_EM.
 *
 * ── WHY A CONTRAST GATE MEASURES COUNTERS ─────────────────────────────────
 *
 * A paint-order stroke is the technique with real headroom here: a rim is
 * OPAQUE out to its own width where a text-shadow caps at about half coverage
 * at the stroke's edge. Left alone, the arithmetic below will therefore keep
 * recommending a fatter rim, and there is nothing in a contrast ratio to stop
 * it — the ratio is computed between the FILL colour and the ground, and a
 * 3px rim makes that ratio wonderful right up to the point where the letter
 * stops being a letter.
 *
 * A rim grows INWARD as well as outward. Two rims of half-width w/2 meet in
 * the middle of a counter when the stroke width reaches the counter's own
 * width, and past that the bowl of an "e", the eye of an "a" and the shoulder
 * of an "n" are solid ink. The ratio the gate prints is then a statement about
 * a shape the reader cannot resolve into a character.
 *
 * So counter closure is a HARD FAILURE, and its threshold is a measurement
 * rather than a taste: stroke width >= counter width. On this page's own body
 * cut that is 0.26em — 4.4px at the 17px lede, which is exactly the size of
 * the design space the glyph territory is working in and worth knowing before
 * anybody reaches for an 8px rim.
 */
const COUNTER_EM = {
  'display:200': 0.3875,
  'display:300': 0.3675,
  'body:400': 0.2600,
  'body:500': 0.2425,
  'body:600': 0.2225,
  'body:700': 0.2025,
  'body:800': 0.1800,
  'mono:400': 0.2500,
  'mono:500': 0.2200,
  'mono:600': 0.2000,
  /* Newsreader's counter also moves with the optical axis (serif:400 runs
     0.215–0.260em, serif:500 0.1975–0.2325em across opsz 6–72); the NARROWEST
     is taken, which is the strict direction for the counter-closure test. */
  'serif:400': 0.2150,
  'serif:500': 0.1975,
};

/**
 * THE SHEET TEST, in em.
 *
 * A per-glyph treatment earns its name by being LOCAL. One whose visible
 * influence reaches further than an em beyond the ink is no longer local: at
 * that radius the halos of every glyph in a paragraph merge, adjacent lines
 * fuse (line-height in this system is 1.02 to 1.65, so ink-to-ink leading is
 * well under an em on both sides), and what is painted is a continuous field
 * over the whole text column — a sheet, drawn a slower way.
 *
 * The owner is explicitly rejecting sheets. This is where a sheet in disguise
 * is caught, and it is a HARD failure rather than a note, because the
 * alternative is that the next round ships a 200px blur and calls it a halo.
 */
const HALO_REACH_EM_MAX = 1.0;

/**
 * The fraction of a BOX-SHADOW collar's modelled alpha this gate credits.
 *
 * SEPARATE FROM `SHADOW_CREDIT`, AND DELIBERATELY NOT THE SAME NUMBER REUSED.
 * The two physical reasons `SHADOW_CREDIT` is 0.85 are (a) the glyph's own
 * rasterisation softens the edge the shadow is thrown from and (b) a 1-D bar
 * model loses mass off the cap and the baseline. NEITHER APPLIES HERE: a
 * box-shadow is thrown from an axis-aligned border box with a hard edge, and
 * `boxExtentPx` below models the along-axis loss EXACTLY rather than
 * approximately. The arithmetic therefore says this constant should be 1.0.
 *
 * IT SHIPS AT 0.85 ANYWAY, and the reason is the honest one: "the arithmetic
 * says so" is not this file's standard for a constant. `SHADOW_CREDIT`'s 0.85
 * was set by 28 rendered Chromium cases (see the harness above). NO SUCH CASE
 * EXISTS FOR A BOX-SHADOW — the render-and-compare harness has never been
 * pointed at one. Until it is, the box branch is an uncalibrated model, and an
 * uncalibrated model is credited at the calibrated one's discount.
 *
 * WHAT MAKES THAT CHEAP RATHER THAN CAUTIOUS: it changes nothing that ships.
 * Measured through this gate, the bar clears its obligation at ZERO veil at
 * either value, and the ring's requirement moves by less than the width of the
 * floor's own rounding. The shipped answer is identical at 0.85 and at 1.0, so
 * the conservative choice costs no light. Raising it is not a way to make a
 * failing collar pass — it is a change that must be preceded by extending the
 * render-and-compare harness to the box case, and this comment is the place
 * that says so.
 */
const BOX_SHADOW_CREDIT = 0.85;

/**
 * THE SHEET TEST FOR A COLLAR, in px rather than em.
 *
 * `HALO_REACH_EM_MAX` cannot apply here: a 2px rule and a focus ring have no
 * em: they are not set in a font. The quantity that makes a collar LOCAL is
 * the same one either way, though — a darkening that reaches the next piece of
 * ink has stopped being a collar around this object and become a continuous
 * field over both.
 *
 * SO THIS IS THE MEASURED TIGHTEST INK-TO-INK GAP IN THE BAND, not a round
 * number chosen to clear the shipped geometry. Chromium, production build,
 * `.threshold-rule` and every transparent-background focusable in `#top`
 * against every text rectangle in the band (`Range.getClientRects()`), at all
 * six reference viewports, 2026-09-05:
 *
 *     .threshold-rule -> nearest ink    11.0px   at ALL SIX viewports  <- binds
 *     ghost Btn       -> nearest ink    32.0px   (32.4 at 375)
 *     inline link     -> nearest ink    52.0px   (32.4 at 390)
 *
 * The bar binds and it binds identically everywhere, because the space under
 * the Threshold's rule is a single spacing token rather than a computed gap.
 * A collar reaching further than 11.0px from the bar is touching the label
 * beneath it, and what is painted between them is a field.
 *
 * Measured reaches of everything this file credits today are printed in the G
 * section of the report; at the time of writing the bar reaches 9.0px and the
 * ring 7.0px, so the margin is 2.0px and it is the bar that holds it. A future
 * edit that tightens the band's vertical rhythm shrinks this limit BEFORE it
 * shrinks anything else — re-measure with the harness above before changing a
 * spacing step around the Threshold.
 */
const COLLAR_REACH_PX_MAX = 11.0;

/**
 * The roles a `--collar-role` may name.
 *
 * A box-shadow collar is painted around a NON-TEXT object, and the only two
 * this band has are the Threshold's rule and the focus ring. Restricting the
 * namespace is not tidiness: it is what makes the disjointness check below
 * enforceable. A role that could be claimed by both a text halo and a box
 * collar would be merged by the "two rules treating one role -> keep the
 * WEAKER" rule into a single treatment, and the survivor would be credited at
 * a place the other one does not paint — wrong in both directions.
 */
const COLLAR_ROLES = new Set(['--rule', '--focus-ring']);

/**
 * The wording app/globals.css must carry once any per-glyph treatment is
 * credited by this gate.
 *
 * The page's whole argument is that its published numbers are true. A ratio
 * derived with a halo in it is NOT the plain WCAG 1.4.3 quantity (see above),
 * so a page that keeps saying "16.04:1" and nothing else is publishing a
 * number it no longer measures. This gate refuses to credit a treatment that
 * the page has not disclosed.
 */
const CONTRAST_DISCLOSURE = 'CONTRAST-METHOD: local-composited-ground';

/** Standard normal CDF — Zelen & Severo 26.2.17, |error| < 7.5e-8. */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
    + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/**
 * One text-shadow layer's alpha at distance `x` outside the stroke's edge.
 *
 * A shadow is the glyph's own alpha mask convolved with a Gaussian, so for a
 * bar of width `stem` the profile is the difference of two normal CDFs. The
 * `vert` factor is the same convolution on the OTHER axis over a cap-height
 * bar, which is what stops a 40px blur on 13px type from being credited with
 * alpha the glyph is too short to supply. `off` is the shadow's own offset,
 * added to the distance, which is the worst direction it can be displaced in.
 */
function shadowAlphaAt(x, layer, stemPx, capPx) {
  const sigma = SHADOW_SIGMA_PER_BLUR * layer.blurPx;
  if (!(sigma > 0)) {
    // A zero-blur shadow is a hard copy of the glyph, displaced. Outside the
    // ink it covers exactly the offset distance.
    return x < layer.offsetPx ? layer.alpha : 0;
  }
  const d = x + layer.offsetPx;
  const horiz = normalCdf((stemPx + d) / sigma) - normalCdf(d / sigma);
  const vert = 2 * normalCdf(capPx / 2 / sigma) - 1;
  return SHADOW_CREDIT * layer.alpha * horiz * vert;
}

/**
 * One BOX-SHADOW layer's alpha at distance `x` outside the BORDER BOX's edge.
 *
 * The box counterpart of `shadowAlphaAt`, and deliberately the same three
 * factors in the same order, because it is the same convolution applied to a
 * different source rectangle. Two things make a box-shadow not a text-shadow:
 *
 * SPREAD IS AN OPAQUE DILATION OF THE SOURCE, APPLIED BEFORE THE BLUR (CSS
 * Backgrounds 3 §6.2). So along the cross axis the shadow is thrown from a bar
 * of width `W = boxThicknessPx + 2S` whose near edge sits S OUTSIDE the border
 * box, and the whole profile is the text case with `stemPx -> W` and the
 * origin translated by S. That is why spread cannot be inflated into alpha it
 * does not deliver: it widens the opaque core, but the Gaussian tail beyond
 * the core still decays at `SHADOW_SIGMA_PER_BLUR`, exactly as before.
 *
 * AN OUTER BOX-SHADOW IS CLIPPED AWAY INSIDE ITS OWN BORDER BOX. Hence the
 * unconditional zero for x < 0, and it is the one structural way this model is
 * unlike the text model: a glyph's halo surrounds its ink, while a box's
 * collar stops dead at the box's edge. It is what terminates the focus ring's
 * inward ray two pixels in and leaves everything inboard of that as bare
 * photograph — and therefore what stops a ring being credited as if it were a
 * solid pad.
 *
 * `boxExtentPx` is `capPx`'s counterpart and exists for the same reason: a
 * 6.09px blur on a 4px-long bar cannot deliver the alpha a 1-D model claims.
 * Both objects in this band run far past 10 sigma so the factor computes to
 * 1.0000 — it is computed anyway, because the thing that makes it 1 is the
 * element's real length, and R2c in tests/e2e/hero-contrast.spec.ts is what
 * verifies that length rather than trusting the declaration.
 */
function boxShadowAlphaAt(x, layer, boxThicknessPx, boxExtentPx) {
  /* Clipped to outside the border box. Unconditional, before anything else. */
  if (x < 0) return 0;
  const S = layer.spreadPx;
  const sigma = SHADOW_SIGMA_PER_BLUR * layer.blurPx;
  /* Signed distance outside the DILATED edge. The shadow's own offset is added
     to the distance, which is the worst direction it can be displaced in. */
  const d = x + layer.offsetPx - S;
  if (!(sigma > 0)) {
    /* No blur is no Gaussian: the layer is an exactly-known opaque rectangle
       dilated by S, so there is no model uncertainty to discount and nothing
       to integrate. Inside the dilation it covers fully; outside it, nothing.
       This is the "T(x) = 1 out to the spread" statement, and the CDF form
       below is its blurred generalisation — d well inside the dilated bar
       drives the bracket to 1.0 continuously, so the two agree at the seam. */
    return d < 0 ? layer.alpha : 0;
  }
  const cross = normalCdf((boxThicknessPx + 2 * S + d) / sigma) - normalCdf(d / sigma);
  const along = 2 * normalCdf((boxExtentPx + 2 * S) / 2 / sigma) - 1;
  return BOX_SHADOW_CREDIT * layer.alpha * cross * along;
}

/** A paint-order stroke's alpha at `x` outside the glyph's own edge. */
function strokeAlphaAt(x, stroke) {
  const outside = Math.max(0, stroke.widthPx / 2 - STROKE_RASTER_LOSS_PX);
  return x < outside ? stroke.alpha : 0;
}

/**
 * A resolved treatment: the composite alpha and colour of everything the text
 * paints for itself, at distance `x` outside its stroke.
 *
 * Paint order, bottom to top: the LAST-listed shadow, ... the FIRST-listed
 * shadow, then the stroke, then the fill. (CSS Text Decoration 4: "the first
 * shadow is on top". `paint-order: stroke fill` puts the stroke under the
 * fill, which is what makes it a rim rather than a glyph-eater.)
 */
function treatmentSampler(t) {
  return (x) => {
    let rgb = [0, 0, 0];
    let a = 0;
    const over = (s, sa) => {
      const outA = sa + a * (1 - sa);
      if (outA === 0) { rgb = [0, 0, 0]; a = 0; return; }
      rgb = [0, 1, 2].map((c) => (s[c] * sa + rgb[c] * a * (1 - sa)) / outA);
      a = outA;
    };
    for (let i = t.shadows.length - 1; i >= 0; i -= 1) {
      over(t.shadows[i].rgb, shadowAlphaAt(x, t.shadows[i], t.stemPx, t.capPx));
    }
    if (t.stroke) over(t.stroke.rgb, strokeAlphaAt(x, t.stroke));
    return { rgb, a };
  };
}

/**
 * A collar's composite colour and alpha at `dist` outward from ONE EDGE of the
 * ink band, along one of the two rays.
 *
 * THE INK IS NOT THE BOX THE SHADOW IS THROWN FROM. That is new here, and it
 * is the whole reason this needs its own sampler rather than a wider
 * `treatmentSampler`. A glyph's halo is thrown from the glyph, so "distance
 * from the ink" and "distance from the source" are one number. A focus ring is
 * INK AT `outline-offset` FROM A BOX THE SHADOW IS THROWN FROM, so the reader
 * looking outward from the ring's outer edge and the reader looking inward
 * from its inner edge are standing at two different places in the same
 * shadow's profile, and one of them is worse off.
 *
 * With x measured outward from the border-box edge and the ink band occupying
 * x in [inkOffsetPx, inkOffsetPx + inkThicknessPx]:
 *
 *     outward   x = inkOffsetPx + inkThicknessPx + dist
 *     inward    x = inkOffsetPx - dist        (only when inkOffsetPx > 0)
 *
 * Layer compositing is identical to `treatmentSampler` — LAST-listed layer
 * first, source-over — so the first-listed layer ends on top, which is what
 * CSS Backgrounds 3 says about box-shadow just as CSS Text Decoration 4 says
 * it about text-shadow.
 *
 * A NOTE ON THE BAR, because the mapping is exact for the ring and slightly
 * pessimistic for the bar. `.threshold-rule`'s ink IS its own border box
 * (`height: 2px; background: var(--fg-accent)`, no border), so its ink edge
 * and its border-box edge coincide and the honest outward mapping would be
 * x = dist. This function uses x = 0 + 2 + dist instead, placing every sample
 * 2px further out in the shadow's profile than the geometry requires. That is
 * the conservative direction — the profile decreases in x, so the bar is
 * credited with strictly less than it paints — and it keeps ONE mapping for
 * both objects rather than a special case that would have to be right.
 */
function collarSampler(t, ray) {
  const xOf = ray === 'inward'
    ? (dist) => t.inkOffsetPx - dist
    : (dist) => t.inkOffsetPx + t.inkThicknessPx + dist;
  return (dist) => {
    const x = xOf(dist);
    let rgb = [0, 0, 0];
    let a = 0;
    const over = (s, sa) => {
      const outA = sa + a * (1 - sa);
      if (outA === 0) { rgb = [0, 0, 0]; a = 0; return; }
      rgb = [0, 1, 2].map((c) => (s[c] * sa + rgb[c] * a * (1 - sa)) / outA);
      a = outA;
    };
    for (let i = t.layers.length - 1; i >= 0; i -= 1) {
      over(t.layers[i].rgb, boxShadowAlphaAt(x, t.layers[i], t.boxThicknessPx, t.boxExtentPx));
    }
    return { rgb, a };
  };
}

/**
 * THE LOCAL COMPOSITED GROUND, as a relative luminance.
 *
 * `base` is the backdrop the scrim and the photograph already produce at this
 * position — an opaque sRGB triple. `t` is the per-glyph treatment, or null.
 *
 * With no treatment this returns `luminance(base)` exactly, which is the
 * property that makes every pre-existing number in this file unchanged.
 */
const OBSERVER_QUADRATURE_N = 192;

/**
 * The observer quadrature for one treatment: the treatment's colour and alpha
 * at each abscissa, with the half-Gaussian weight there, NORMALISED.
 *
 * Computed once per treatment rather than per evaluation. That is not a
 * micro-optimisation: check C evaluates this for every role in every one of
 * ~7000 grid cells on every rung at every viewport, and re-walking the
 * treatment's layer stack inside that loop turned a ten-second gate into a
 * multi-minute one the first time a real halo landed.
 */
function observerQuadrature(t) {
  const span = 6 * OBSERVER_SIGMA_PX;
  const out = [];
  let den = 0;
  for (let i = 0; i < OBSERVER_QUADRATURE_N; i += 1) {
    const x = (span * (i + 0.5)) / OBSERVER_QUADRATURE_N;
    const k = Math.exp((-x * x) / (2 * OBSERVER_SIGMA_PX * OBSERVER_SIGMA_PX));
    const s = t.sampler(x);
    out.push({ rgb: s.rgb, a: s.a, w: k });
    den += k;
  }
  for (const q of out) q.w /= den;
  return out;
}

function localGroundLuminance(t, base) {
  if (t === null) return luminance(base);
  if (t.quadrature === undefined) t.quadrature = observerQuadrature(t);
  /* Memoised on the backdrop quantised to sRGB bytes — the grid walks a
     continuous field but lands on a few hundred distinct 8-bit colours, and
     the answer is a smooth function of them. */
  const key = ((Math.round(base[0]) * 256) + Math.round(base[1])) * 256 + Math.round(base[2]);
  if (t.cache === undefined) t.cache = new Map();
  const hit = t.cache.get(key);
  if (hit !== undefined) return hit;
  let num = 0;
  for (const q of t.quadrature) {
    if (q.a === 0) num += q.w * luminance(base);
    else num += q.w * luminance(composite(q.rgb, q.a, base));
  }
  t.cache.set(key, num);
  return num;
}

/** WCAG's ratio between an opaque foreground and a ground given as a luminance. */
function contrastToLuminance(fg, groundY) {
  const lf = luminance(fg);
  return (Math.max(lf, groundY) + 0.05) / (Math.min(lf, groundY) + 0.05);
}

/**
 * Smallest veil alpha at which `fg` clears `need` over `backdrop`, GIVEN its
 * per-glyph treatment. The treated counterpart of `minAlpha`, and identical to
 * it when `t` is null.
 */
function minAlphaTreated(fg, veil, backdrop, need, t) {
  const at = (alpha) => contrastToLuminance(fg, localGroundLuminance(t, composite(veil, alpha, backdrop)));
  if (at(0) >= need) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= need) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * How far the treatment's influence reaches, in px: the distance at which it
 * stops being distinguishable from no treatment at all, over the brightest
 * source pixel there can be. Uses the same 1 L* criterion the seal check uses
 * for "is this photograph still visible", because it is the same question
 * asked of a different surface.
 */
function treatmentReachPx(t) {
  const WHITE_ = [255, 255, 255];
  const toLstar_ = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);
  const bare = toLstar_(luminance(WHITE_));
  const sampler = t.sampler;
  let reach = 0;
  for (let x = 0; x <= 4000; x += 0.25) {
    const s = sampler(x);
    const l = toLstar_(luminance(composite(s.rgb, s.a, WHITE_)));
    if (bare - l > 1.0) reach = x + 0.25;
    else if (x > 8 && reach > 0 && x - reach > 4) break;
  }
  return reach;
}


/* ════════════════════════════════════════════════════════════════════════════
   READING THE TREATMENT OUT OF THE STYLESHEETS

   THE CONTRACT, IN FULL. A rule that paints a per-glyph treatment must also
   say who it is for, because this gate cannot see the DOM and a halo credited
   to the wrong role is worse than a halo credited to nobody:

       .someHeroText {
         --halo-role: --fg-muted;                  the foreground role painted
         --halo-type: var(--text-lede) 400 body;   size, weight, face
                                                  (face: display | body | mono | serif)
         text-shadow: 0 0 2px  color-mix(in srgb, var(--ground)  95%, transparent),
                      0 0 16px color-mix(in srgb, var(--ground)  85%, transparent);
         -webkit-text-stroke: 3px color-mix(in srgb, var(--ground) 100%, transparent);
         paint-order: stroke fill;
       }

   `--halo-type`'s size goes through the same length evaluator the gradients
   use, so `var(--text-lede)` resolves its clamp AT EACH VIEWPORT and a role
   set at 17px on a phone is not credited with the halo it throws at 19px on a
   desktop. The weight and face select a MEASURED stem out of STEM_EM.

   THREE RULES, AND ALL THREE ARE HARD FAILURES:

     · A treatment without both declarations is UNATTRIBUTABLE and fails. It
       is not silently ignored: a halo the gate cannot see is a halo that lets
       somebody thin the scrim on the strength of an effect nothing checked.
     · `-webkit-text-stroke` without `paint-order: stroke fill` fails. The
       default paint order draws the stroke OVER the fill, which eats half the
       glyph's own width and makes thin type LESS legible, not more — the
       opposite of the intent, and invisible in a diff.
     · A `text-shadow` with four lengths fails. text-shadow has no spread
       radius (that is box-shadow); a browser that parsed it would drop the
       whole declaration and paint nothing.
   ════════════════════════════════════════════════════════════════════════════ */

/** The `--text-<step>` scale, as raw expressions, read out of app/globals.css. */
function readTypeScale(globalsSrc) {
  const scale = new Map();
  for (const m of globalsSrc.matchAll(/(--text-[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    scale.set(m[1], m[2].trim());
  }
  return scale;
}

/** Every rule in the hero's stylesheets that paints a per-glyph treatment. */
function collectTreatmentRules(sources) {
  const out = [];
  for (const { file, src, requireHeroScope } of sources) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const rule of walkRules(code)) {
      if (rule.selector.startsWith('@')) continue;
      if (requireHeroScope
        && !/\.ground\b/.test(rule.selector)
        && !/\[data-ground="ink"\]/.test(rule.selector)) continue;
      const decls = new Map();
      for (const d of rule.body.matchAll(/(?:^|;)\s*(-?[-a-z0-9]+)\s*:\s*([^;]+)/gi)) {
        decls.set(d[1].trim().toLowerCase(), d[2].trim());
      }
      const shadow = decls.get('text-shadow');
      const strokeShorthand = decls.get('-webkit-text-stroke') ?? decls.get('text-stroke');
      const strokeWidth = decls.get('-webkit-text-stroke-width') ?? decls.get('text-stroke-width');
      const paints = (shadow !== undefined && shadow.trim().toLowerCase() !== 'none')
        || strokeShorthand !== undefined || strokeWidth !== undefined;
      if (!paints) continue;
      out.push({ file, selector: rule.selector, media: rule.media, decls });
    }
  }
  return out;
}

/**
 * One collected rule -> a treatment resolved at one viewport, or a named
 * failure. `ctx` is the same length-evaluation context the gradients use.
 */
function resolveTreatment(rule, ctx, typeScale) {
  const problems = [];
  const bad = (what, saw) => { problems.push(`${what}: ${saw}`); };

  const role = rule.decls.get('--halo-role');
  const typeDecl = rule.decls.get('--halo-type');
  if (!role || !typeDecl) {
    bad('a per-glyph treatment this gate cannot attribute',
      `${rule.selector} declares ${!role ? '--halo-role' : '--halo-type'} nowhere`);
    return { problems };
  }
  if (!/^--[a-z0-9-]+$/i.test(role.trim())) {
    bad('--halo-role is not a custom-property name', role);
    return { problems };
  }

  /* `<size> <weight> <face>` — parsed from the end, because the size may be a
     clamp() full of spaces and the other two are single tokens. */
  const parts = typeDecl.trim().split(/\s+/);
  if (parts.length < 3) {
    bad('--halo-type must be `<font-size> <font-weight> <display|body|mono|serif>`', typeDecl);
    return { problems };
  }
  const face = parts[parts.length - 1].toLowerCase();
  const weight = parts[parts.length - 2];
  const sizeExpr = parts.slice(0, parts.length - 2).join(' ');
  if (!['display', 'body', 'mono', 'serif'].includes(face)) {
    bad('--halo-type face must be display, body, mono or serif', face);
    return { problems };
  }
  if (!/^[1-9]00$/.test(weight)) {
    bad('--halo-type weight must be a numeric CSS weight', weight);
    return { problems };
  }
  const stemEm = STEM_EM[`${face}:${weight}`];
  const counterEm = COUNTER_EM[`${face}:${weight}`];
  if (stemEm === undefined) {
    bad('no MEASURED stem width for this cut — measure it before crediting a halo on it',
      `${face} ${weight}; this gate has ${Object.keys(STEM_EM).join(', ')}`);
    return { problems };
  }

  /* The size, through the gradients' own evaluator, so a clamp resolves at
     this viewport rather than at whatever width somebody typed in a comment. */
  const vars = new Map(ctx.vars);
  for (const [k, v] of typeScale) if (!vars.has(k)) vars.set(k, v);
  let fontPx = null;
  try {
    fontPx = lengthPx(sizeExpr, { ...ctx, vars, axis: ctx.boxW });
  } catch (err) {
    bad('--halo-type font size is a length this gate cannot evaluate',
      `${sizeExpr} — ${err && err.message ? err.message : String(err)}`);
    return { problems };
  }
  if (!(fontPx > 0)) {
    bad('--halo-type font size resolved to a non-positive length', `${sizeExpr} -> ${fontPx}`);
    return { problems };
  }

  const colourCtx = { vars, ground: ctx.ground };
  const shadows = [];
  const rawShadow = rule.decls.get('text-shadow');
  if (rawShadow !== undefined && rawShadow.trim().toLowerCase() !== 'none') {
    for (const layerSrc of splitTop(rawShadow)) {
      /* Space-separated top-level tokens; a color-mix() call counts as one. */
      const toks = [];
      let depth = 0;
      let buf = '';
      for (const ch of layerSrc.trim()) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (/\s/.test(ch) && depth === 0) { if (buf) toks.push(buf); buf = ''; continue; }
        buf += ch;
      }
      if (buf) toks.push(buf);
      const lengths = toks.filter((t) => /^-?[0-9.]/.test(t));
      const colours = toks.filter((t) => !/^-?[0-9.]/.test(t));
      if (lengths.length === 4) {
        bad('text-shadow with a spread radius', layerSrc.trim());
        continue;
      }
      if (lengths.length < 2 || lengths.length > 3 || colours.length !== 1) {
        bad('text-shadow layer this gate cannot read', layerSrc.trim());
        continue;
      }
      let px;
      try {
        px = lengths.map((l) => lengthPx(l, { ...ctx, vars, axis: ctx.boxW }));
      } catch (err) {
        bad('text-shadow length this gate cannot evaluate',
          `${layerSrc.trim()} — ${err && err.message ? err.message : String(err)}`);
        continue;
      }
      let colour;
      try {
        colour = stopColour(colours[0], colourCtx);
      } catch (err) {
        bad('text-shadow colour this gate cannot evaluate',
          `${colours[0]} — ${err && err.message ? err.message : String(err)}`);
        continue;
      }
      shadows.push({
        rgb: colour.rgb,
        alpha: colour.a,
        offsetPx: Math.hypot(px[0], px[1]),
        blurPx: px[2] ?? 0,
        source: layerSrc.trim(),
      });
    }
  }

  let stroke = null;
  const strokeSrc = rule.decls.get('-webkit-text-stroke') ?? rule.decls.get('text-stroke');
  const strokeWidthSrc = rule.decls.get('-webkit-text-stroke-width') ?? rule.decls.get('text-stroke-width');
  const strokeColourSrc = rule.decls.get('-webkit-text-stroke-color') ?? rule.decls.get('text-stroke-color');
  if (strokeSrc !== undefined || strokeWidthSrc !== undefined) {
    let wSrc = strokeWidthSrc ?? null;
    let cSrc = strokeColourSrc ?? null;
    if (strokeSrc !== undefined) {
      const t = strokeSrc.trim();
      const m = /^(\S+)\s+([\s\S]+)$/.exec(t);
      if (!m) { bad('-webkit-text-stroke shorthand this gate cannot read', t); }
      else { wSrc = wSrc ?? m[1]; cSrc = cSrc ?? m[2]; }
    }
    const paintOrder = (rule.decls.get('paint-order') ?? '').trim().toLowerCase();
    if (!/^stroke(\s|$)/.test(paintOrder)) {
      bad('a text-stroke without `paint-order: stroke fill`',
        `${rule.selector} — the default order paints the stroke OVER the fill, which eats half `
        + 'the glyph\'s own stem and makes thin type harder to read, not easier');
    }
    if (wSrc && cSrc) {
      try {
        const widthPx = lengthPx(wSrc, { ...ctx, vars, axis: ctx.boxW });
        const colour = stopColour(cSrc, colourCtx);
        stroke = { widthPx, rgb: colour.rgb, alpha: colour.a, source: `${wSrc} ${cSrc}` };
      } catch (err) {
        bad('text-stroke this gate cannot evaluate',
          `${wSrc} ${cSrc} — ${err && err.message ? err.message : String(err)}`);
      }
    }
  }

  if (problems.length) return { problems };
  if (shadows.length === 0 && stroke === null) return { problems: [] };

  const t = {
    role: role.trim(),
    selector: rule.selector,
    file: rule.file,
    face,
    weight,
    fontPx,
    stemPx: stemEm * fontPx,
    counterPx: counterEm * fontPx,
    capPx: CAP_HEIGHT_EM * fontPx,
    shadows,
    stroke,
  };
  t.sampler = treatmentSampler(t);
  return { problems: [], treatment: t };
}

/* ════════════════════════════════════════════════════════════════════════════
   THE COLLAR — THE SAME ARGUMENT FOR THE TWO THINGS IN THIS BAND THAT ARE NOT
   TEXT

   The Threshold's 2px rule and the focus ring are graphical objects under WCAG
   1.4.11, they owe 3:1, and they cannot wear the per-glyph treatment above: a
   text-shadow is thrown from glyph geometry and neither of them has any. Both
   are given a box-shadow collar instead — a pad of flat --ground outside their
   own border box — and until this section existed no gate in this repo could
   read it, so it bought the page legibility and bought the veil nothing. Rule
   7 of components/site/hero-scrim.module.css says so in its own words.

   THE CONTRACT, and it is the halo's contract with the font metrics replaced
   by painted geometry, because a bar has no cut and no size:

       .ground :global(.threshold-rule) {
         --collar-role: --rule;
         --collar-box: 2px 40px 0px 2px;   thickness extent ink-offset ink-thickness
         box-shadow: 0 0 1.47px 1.47px var(--ground), ... ;
       }

   WHAT IS GONE FROM THE TEXT VERSION, BY NAME, so a reader does not think it
   was forgotten:

     · face / weight / fontPx / STEM_EM / COUNTER_EM. There is no cut here, so
       there is no measured stem to look up. `boxThicknessPx` replaces the stem
       and it is the BORDER BOX's cross-axis size rather than the visible ink's,
       because the border box is what a box-shadow is thrown from. For the <hr>
       the two coincide at 2px. For `:focus-visible` they do not — the shadow is
       thrown from the control's ~45px block-size while the ink is a 2px outline
       sitting 2px off it — and using the ink's 2px there would understate the
       shadow by a lot.
     · THE COUNTER-CLOSURE HARD FAILURE. A rim grows inward and can close a
       bowl. An outer box-shadow is clipped to outside its own border box and
       cannot touch its own ink at any spread, so there is no counterpart and
       nothing to check.
     · THE `paint-order: stroke fill` HARD FAILURE. Same reason: there is no
       order in which a box-shadow paints over the thing it is collaring.
     · STROKE_RASTER_LOSS_PX. A box-shadow's edge is not rasterised from a
       glyph outline; it is an axis-aligned rectangle with a hard edge.

   WHAT IS NEW, with no text analogue: `inkOffsetPx` (border-box edge to the
   ink band's near edge — 0 for the hr, `outline-offset` for the ring) and
   `inkThicknessPx` (the ink band's own cross-axis size, 2px for both). They
   are what make the two rays in `collarSampler` necessary.

   ── WHY box-shadow IS COLLECTED DIFFERENTLY FROM text-shadow ─────────────
   A text-shadow inside this band is ALWAYS a per-glyph treatment; there is no
   other reason to paint one, which is why an unattributed one is a hard
   failure. `box-shadow` is a general-purpose property — the nav paints a 1px
   hairline with one — so an unattributed box-shadow is simply NOT CREDITED,
   which is the safe direction. The asymmetry runs the other way for the claim:
   a `--collar-role` with NO box-shadow in the same block is a hard failure,
   because that is a credit claimed for paint that is not there.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Every rule in the hero's stylesheets that CLAIMS a box-shadow collar, plus
 * the same window flattened in source order so the override scan can run.
 *
 * S1 (SAME-BLOCK) and S3 (OVERRIDE SCAN) are enforced here because both are
 * facts about the rule list rather than about one rule.
 */
function collectCollarRules(sources) {
  const all = [];
  for (const { file, src, requireHeroScope } of sources) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const rule of walkRules(code)) {
      if (rule.selector.startsWith('@')) continue;
      if (requireHeroScope
        && !/\.ground\b/.test(rule.selector)
        && !/\[data-ground="ink"\]/.test(rule.selector)) continue;
      const decls = new Map();
      for (const d of rule.body.matchAll(/(?:^|;)\s*(-?[-a-z0-9]+)\s*:\s*([^;]+)/gi)) {
        decls.set(d[1].trim().toLowerCase(), d[2].trim());
      }
      all.push({ file, selector: rule.selector, media: rule.media, decls });
    }
  }

  const out = [];
  const problems = [];
  for (let i = 0; i < all.length; i += 1) {
    const rule = all[i];
    const role = rule.decls.get('--collar-role');
    if (role === undefined) continue;
    const shadow = rule.decls.get('box-shadow');
    const paints = shadow !== undefined && shadow.trim().toLowerCase() !== 'none';
    /* S1 · SAME-BLOCK. The claim and the paint travel together or not at all,
       so deleting the box-shadow deletes the credit in the same edit. */
    if (!paints) {
      problems.push(`${rule.file} ${rule.selector}: a collar this gate cannot attribute — `
        + `--collar-role is ${role.trim()} but the same block declares `
        + `${shadow === undefined ? 'no box-shadow' : 'box-shadow: none'}`);
      continue;
    }
    /*
      S3 · THE OVERRIDE SCAN. A credit is worth what the LAST rule to touch the
      property says it is worth. Rule 6 of hero-scrim.module.css sets
      `text-shadow: none` on the solid Btn, so this file already contains a live
      example of a later rule taking a treatment away — and the text side has no
      such check today. Textual selector equality is deliberately the test: it
      is the case a human eye reads as "the same rule again", it is the shape an
      override actually takes in a module stylesheet, and anything cleverer
      would be a specificity engine this gate has no business containing. The
      browser gate (R2b) is what catches an override written any other way,
      because it reads getComputedStyle rather than the file.
    */
    for (let j = i + 1; j < all.length; j += 1) {
      const later = all[j];
      if (later.selector !== rule.selector) continue;
      const s = later.decls.get('box-shadow');
      if (s === undefined) continue;
      if (s.trim().toLowerCase() === 'none') {
        problems.push(`${later.file} ${later.selector}: a later rule sets box-shadow: none, `
          + `which takes away the collar ${rule.file} credits to ${role.trim()}`);
        continue;
      }
      const a = parseCollarLayers(shadow);
      const b = parseCollarLayers(s);
      if (b.problems.length) continue;
      if (b.layers.length < a.layers.length
        || b.layers.some((l, k) => a.layers[k] !== undefined
          && (l.blur < a.layers[k].blur || l.spread < a.layers[k].spread))) {
        problems.push(`${later.file} ${later.selector}: a later rule overrides the collar to a `
          + `strictly weaker profile (${s.trim().slice(0, 80)}), so ${role.trim()} would be `
          + 'credited with a shadow the cascade does not paint');
      }
    }
    out.push({ ...rule, index: i });
  }
  return { rules: out, problems };
}

/**
 * A `box-shadow` value -> its layers as raw numbers, for the override scan and
 * for `resolveCollar`. Lengths stay as source text here; only `resolveCollar`
 * has the viewport context needed to turn them into px.
 */
function parseCollarLayers(src) {
  const layers = [];
  const problems = [];
  for (const layerSrc of splitTop(src)) {
    const toks = [];
    let depth = 0;
    let buf = '';
    for (const ch of layerSrc.trim()) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (/\s/.test(ch) && depth === 0) { if (buf) toks.push(buf); buf = ''; continue; }
      buf += ch;
    }
    if (buf) toks.push(buf);
    /* S2 · AN INSET LAYER IS A HARD FAILURE. It paints inside the padding box
       and cannot darken the ground BESIDE the ink, so a model that credited one
       would be crediting paint that is not there. */
    if (toks.some((t) => t.toLowerCase() === 'inset')) {
      problems.push(`an inset layer (${layerSrc.trim()}) — an inset shadow paints inside the `
        + 'padding box and darkens nothing outside it');
      continue;
    }
    const lengths = toks.filter((t) => /^-?[0-9.]/.test(t));
    const colours = toks.filter((t) => !/^-?[0-9.]/.test(t));
    if (lengths.length < 2 || lengths.length > 4 || colours.length !== 1) {
      problems.push(`box-shadow layer this gate cannot read: ${layerSrc.trim()}`);
      continue;
    }
    layers.push({
      lengths,
      colour: colours[0],
      /* Numeric shadows of the same, for the override comparison only. A
         non-literal length compares as 0, i.e. as the weakest thing it could
         be, which is the conservative direction for a scan looking for
         WEAKENING. */
      blur: parseFloat(lengths[2] ?? '0') || 0,
      spread: parseFloat(lengths[3] ?? '0') || 0,
      source: layerSrc.trim(),
    });
  }
  return { layers, problems };
}

/**
 * One collected collar rule -> a collar resolved at one viewport, or a named
 * failure. Same signature and same posture as `resolveTreatment`.
 *
 * TWO RAYS, AND THE WEAKER ONE GOVERNS. Outward and inward are evaluated
 * separately through the existing `observerQuadrature`, and the credited ray is
 * the one whose `localGroundLuminance` over a #FFFFFF source pixel comes out
 * LIGHTEST — the side a reader would struggle on. That mirrors the "two rules
 * treating one role -> keep the WEAKER" merge already used above, and it
 * reports neither the average nor the better side.
 *
 * The inward ray EXISTS ONLY WHEN `inkOffsetPx > 0`. For the <hr> the ink sits
 * on the border-box edge, the two edges of the bar are symmetric, and one ray
 * is the whole answer — adding a phantom inward ray there would sample x < 0,
 * return bare ground, and silently destroy the credit.
 */
function resolveCollar(rule, ctx) {
  const problems = [];
  const bad = (what, saw) => { problems.push(`${what}: ${saw}`); };

  const role = (rule.decls.get('--collar-role') ?? '').trim();
  const boxDecl = rule.decls.get('--collar-box');
  if (!boxDecl) {
    bad('a collar this gate cannot attribute',
      `${rule.selector} declares --collar-role but no --collar-box`);
    return { problems };
  }
  if (!/^--[a-z0-9-]+$/i.test(role)) {
    bad('--collar-role is not a custom-property name', role);
    return { problems };
  }
  /*
    THE NAMESPACE IS THE CALLER'S, THE MODEL IS NOT. `COLLAR_ROLES` is the
    HERO band's list — the two non-text objects that band contains — and the
    disjointness argument above is about that band. scripts/check-nav-contrast
    .mjs borrows this resolver for a different surface whose one graphical
    object, the monogram, paints --fg through `.home`; it passes the roles its
    mark box paints as `ctx.collarRoles`, and keeps halo and collar disjoint by
    BOX KIND instead, because in that bar the same role is text in one box and
    an SVG fill in another. Nothing about the shadow arithmetic moves with the
    override; only which names may claim it.
  */
  const allowed = ctx.collarRoles ?? COLLAR_ROLES;
  if (!allowed.has(role)) {
    bad('--collar-role names a role that is not a collarable non-text object',
      `${role}; this gate collars ${[...allowed].join(', ')} — a TEXT role wears the `
      + 'per-glyph halo instead, and crediting one role with both would merge two treatments '
      + 'that are painted in different places');
    return { problems };
  }

  /* FOUR top-level tokens, parsed from the FRONT — unlike --halo-type, which is
     parsed from the end because its size may be a clamp() full of spaces. All
     four of these are lengths and none is a trailing keyword, so there is no
     ambiguity to resolve from the other direction. Each goes through the same
     evaluator the gradients use, so a var() or calc() resolves at THIS
     viewport. */
  const boxToks = splitTop(boxDecl.trim(), ' ').filter((s) => s !== '');
  if (boxToks.length !== 4) {
    bad('--collar-box must be four lengths: <box-thickness> <box-extent> <ink-offset> <ink-thickness>',
      `${boxDecl.trim()} — ${boxToks.length} token(s)`);
    return { problems };
  }
  let boxPx;
  try {
    boxPx = boxToks.map((tk) => lengthPx(tk, { ...ctx, axis: ctx.boxW }));
  } catch (err) {
    bad('--collar-box holds a length this gate cannot evaluate',
      `${boxDecl.trim()} — ${err && err.message ? err.message : String(err)}`);
    return { problems };
  }
  const [boxThicknessPx, boxExtentPx, inkOffsetPx, inkThicknessPx] = boxPx;
  if (!(boxThicknessPx > 0) || !(boxExtentPx > 0) || !(inkThicknessPx > 0) || !(inkOffsetPx >= 0)) {
    bad('--collar-box resolved to a non-positive geometry',
      `${boxDecl.trim()} -> ${boxPx.map((n) => n.toFixed(2)).join(' ')}`);
    return { problems };
  }

  const parsed = parseCollarLayers(rule.decls.get('box-shadow'));
  for (const p of parsed.problems) bad('box-shadow', p);
  if (problems.length) return { problems };

  const colourCtx = { vars: ctx.vars, ground: ctx.ground };
  const layers = [];
  for (const l of parsed.layers) {
    let px;
    try {
      px = l.lengths.map((s) => lengthPx(s, { ...ctx, axis: ctx.boxW }));
    } catch (err) {
      bad('box-shadow length this gate cannot evaluate',
        `${l.source} — ${err && err.message ? err.message : String(err)}`);
      continue;
    }
    let colour;
    try {
      /* Composited, not assumed. A collar in some colour other than --ground is
         not rejected here for the same reason the text path does not reject
         one: `localGroundLuminance` composites the actual colour over the
         actual backdrop, so a paler collar correctly makes the local ground
         LIGHTER and the role demand MORE veil. The model is right in both
         directions and needs no restriction to stay right. */
      colour = stopColour(l.colour, colourCtx);
    } catch (err) {
      bad('box-shadow colour this gate cannot evaluate',
        `${l.colour} — ${err && err.message ? err.message : String(err)}`);
      continue;
    }
    layers.push({
      rgb: colour.rgb,
      alpha: colour.a,
      offsetPx: Math.hypot(px[0], px[1]),
      blurPx: px[2] ?? 0,
      spreadPx: px[3] ?? 0,
      source: l.source,
    });
  }
  if (problems.length) return { problems };
  if (layers.length === 0) return { problems: [] };

  const base = {
    kind: 'collar',
    role,
    selector: rule.selector,
    file: rule.file,
    layers,
    boxThicknessPx,
    boxExtentPx,
    inkOffsetPx,
    inkThicknessPx,
  };
  /* One `t` per ray, of exactly the shape everything downstream already takes:
     `localGroundLuminance`, `observerQuadrature`, `minAlphaTreated`,
     `treatmentReachPx`, the check-C grid and `assertNeutrality` are all generic
     over `t.sampler` and none of them changes. */
  const rays = [{ ...base, ray: 'outward' }];
  if (inkOffsetPx > 0) rays.push({ ...base, ray: 'inward' });
  for (const r of rays) r.sampler = collarSampler(r, r.ray);
  const worst = rays.reduce((a, b) => (
    localGroundLuminance(b, WHITE_SRC) > localGroundLuminance(a, WHITE_SRC) ? b : a));
  worst.rays = rays.map((r) => ({
    ray: r.ray,
    groundY: localGroundLuminance(r, WHITE_SRC),
    edgeAlpha: r.sampler(0).a,
  }));
  return { problems: [], treatment: worst };
}

/**
 * THE NEUTRALITY ASSERTION.
 *
 * The whole apparatus above must be a strict GENERALISATION of what this file
 * did before it: with no treatment the local-ground measurement has to reduce
 * to `contrast(role, backdrop)` to the last digit, or every number this gate
 * has ever printed silently moved. Checked at run time rather than trusted,
 * because it costs microseconds and it is the one bug that would be invisible.
 */
function assertNeutrality() {
  const cases = [[[0xF2, 0xF1, 0xEE], [0x14, 0x16, 0x1A]], [[0xA3, 0xA2, 0xA8], [53, 53, 53]],
    [[0xFF, 0x52, 0x52], [255, 255, 255]]];
  for (const [fg, bg] of cases) {
    const plain = contrast(fg, bg);
    const viaGround = contrastToLuminance(fg, localGroundLuminance(null, bg));
    if (Math.abs(plain - viaGround) > 1e-12) {
      throw new Error(
        'check-hero-contrast: the local-ground measurement is not neutral with no treatment '
        + `(${plain} vs ${viaGround}). Every ratio this file prints would have moved.`);
    }
    /* And the solver that sizes the veil, on the same terms. */
    for (const need of [3, 4.5, 4.725, 7]) {
      const a = minAlpha(fg, [0x14, 0x16, 0x1a], [255, 255, 255], need);
      const b = minAlphaTreated(fg, [0x14, 0x16, 0x1a], [255, 255, 255], need, null);
      if (Math.abs(a - b) > 1e-6) {
        throw new Error(
          'check-hero-contrast: minAlphaTreated is not neutral with no treatment '
          + `(${a} vs ${b} at ${need}:1). The veil this gate demands would have moved.`);
      }
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   THE RASTERISER

   A CSS gradient stack, evaluated in Node. Everything it cannot evaluate is a
   named failure — see the header. `unsupported()` is the only exit from an
   unknown construct and it never returns a value the caller could mistake for
   a measurement.
   ════════════════════════════════════════════════════════════════════════════ */

class Unsupported extends Error {
  constructor(what, saw) {
    super(`${what}: ${saw}`);
    this.what = what;
    this.saw = saw;
  }
}
const unsupported = (what, saw) => {
  throw new Unsupported(what, String(saw).slice(0, 160).replace(/\s+/g, ' ').trim());
};

/** Splits `a, b(c, d), e` on top-level commas. */
function splitTop(src, sep = ',') {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === sep && depth === 0) {
      out.push(src.slice(start, i));
      start = i + 1;
    }
  }
  out.push(src.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

/** `name(...)` -> { name, args } for the outermost function call in `src`. */
function asCall(src) {
  const m = /^([a-z-]+)\(([\s\S]*)\)$/i.exec(src.trim());
  return m ? { name: m[1].toLowerCase(), args: m[2] } : null;
}

/**
 * A CSS <length-percentage> in px, in a context that knows its axis length,
 * the viewport, and `--spacing-band`.
 *
 * Supports the forms this scrim family actually uses — bare numbers, px, %,
 * svh/vh/dvh/lvh, vw, rem, and `calc()` over them with + - * / and
 * `var(--spacing-band)`. Anything else is a named failure.
 */
function lengthPx(expr, ctx) {
  const src = String(expr).trim();
  if (src === '') unsupported('empty length', expr);

  const call = asCall(src);
  if (call && call.name !== 'var') {
    if (call.name === 'calc') return lengthPx(call.args, ctx);
    if (call.name === 'min') return Math.min(...splitTop(call.args).map((a) => lengthPx(a, ctx)));
    if (call.name === 'max') return Math.max(...splitTop(call.args).map((a) => lengthPx(a, ctx)));
    if (call.name === 'clamp') {
      const [a, b, c] = splitTop(call.args).map((x) => lengthPx(x, ctx));
      return Math.min(Math.max(b, a), c);
    }
    unsupported('length function this gate cannot evaluate', src);
  }

  /*
    A recursive-descent evaluator over the calc() grammar, rather than a flat
    token loop. The flat loop was fine until the masked pocket landed, whose
    aperture is `max(0px, calc((100% - var(--container-wrap)) / 2))` — nested
    parentheses, which the loop refused. Refusing was correct behaviour (it
    failed loudly rather than guessing) but the construct is legitimate CSS and
    the number it produces decides where the pocket's edge sits relative to the
    first glyph in the gutter. That is worth a real parser.
  */
  const tokens = src.match(/var\(\s*--[a-z0-9-]+\s*(?:,[^()]*)?\)|[0-9.]+[a-z%]*|[-+*/()]/gi);
  if (!tokens) unsupported('unreadable length', src);

  const value = (tok) => {
    const v = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]*))?\)$/i.exec(tok);
    if (v) {
      if (v[1] === '--spacing-band') return ctx.spacingBand;
      const known = ctx.vars?.get(v[1]);
      if (known !== undefined) return lengthPx(known, ctx);
      if (v[2] !== undefined && v[2].trim() !== '') return lengthPx(v[2], ctx);
      unsupported('length references a custom property this gate cannot resolve', tok);
    }
    const n = /^([0-9.]+)([a-z%]*)$/i.exec(tok);
    if (!n) unsupported('length token', tok);
    const num = parseFloat(n[1]);
    switch (n[2].toLowerCase()) {
      case '':
      case 'px':
        return num;
      case '%':
        return (num / 100) * ctx.axis;
      case 'svh':
      case 'vh':
      case 'dvh':
      case 'lvh':
        return (num / 100) * ctx.vh;
      case 'svw':
      case 'vw':
      case 'dvw':
      case 'lvw':
        return (num / 100) * ctx.vw;
      case 'rem':
      case 'em':
        return num * ROOT_FONT_PX;
      default:
        return unsupported('length unit', tok);
    }
  };

  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function primary() {
    const tok = peek();
    if (tok === undefined) unsupported('length ended mid-expression', src);
    if (tok === '(') {
      eat();
      const v = sum();
      if (peek() !== ')') unsupported('unbalanced parentheses in a length', src);
      eat();
      return v;
    }
    if (tok === '-') {
      eat();
      return -primary();
    }
    if (tok === '+') {
      eat();
      return primary();
    }
    return value(eat());
  }

  function product() {
    let v = primary();
    while (peek() === '*' || peek() === '/') {
      const op = eat();
      const rhs = primary();
      v = op === '*' ? v * rhs : v / rhs;
    }
    return v;
  }

  function sum() {
    let v = product();
    while (peek() === '+' || peek() === '-') {
      const op = eat();
      const rhs = product();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  }

  const result = sum();
  if (pos !== tokens.length) unsupported('trailing tokens in a length', src);
  return result;
}

/**
 * A colour in a gradient stop -> { rgb, a }.
 *
 * The scrim writes every stop as `color-mix(in srgb, var(--ground) N%,
 * transparent)`, which is the anti-misuse form check-ground-tokens.mjs
 * requires. `rgb(r g b / N%)` is accepted too so a ported layer can be
 * measured before it is rewritten into the token form — and check-ground-
 * tokens.mjs will fail it separately, which is the correct division.
 */
function stopColour(expr, ctx) {
  const src = String(expr).trim();
  if (src === 'transparent') return { rgb: ctx.ground, a: 0 };
  /* Named colours, for MASK layers. A mask's alpha is what multiplies, so
     `black` and `white` are both alpha 1 there and the hue is irrelevant; they
     are given their real values anyway so a named colour in a BACKGROUND layer
     composites correctly rather than plausibly. Only these two are accepted:
     check-ground-tokens.mjs forbids literal colours in components/**.css, so
     anything else appearing here is a token violation that file should catch
     and this one should not quietly normalise. */
  if (src === 'black') return { rgb: [0, 0, 0], a: 1 };
  if (src === 'white') return { rgb: [255, 255, 255], a: 1 };

  const v = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(src);
  if (v) {
    if (v[1] === '--ground') return { rgb: ctx.ground, a: 1 };
    const known = ctx.vars?.get(v[1]);
    if (known !== undefined) return stopColour(known, ctx);
    unsupported('gradient stop references a custom property this gate cannot resolve', src);
  }

  const hex = parseHex(src);
  if (hex) return { rgb: hex, a: 1 };

  const call = asCall(src);
  if (!call) unsupported('gradient stop colour', src);

  if (call.name === 'color-mix') {
    const parts = splitTop(call.args);
    if (parts.length !== 3 || !/^in\s+srgb$/i.test(parts[0])) {
      unsupported('color-mix form this gate cannot evaluate', src);
    }
    // `color-mix(in srgb, <C> P%, transparent)` — P% of C, rest transparent.
    const [, first, second] = parts;
    const fm = /^([\s\S]+?)\s+([0-9.]+%|var\(\s*--[a-z0-9-]+\s*\)|clamp\([\s\S]+\)|calc\([\s\S]+\))$/.exec(first);
    if (!fm) unsupported('color-mix first component needs an explicit percentage', src);
    if (second.trim() !== 'transparent') {
      unsupported('color-mix second component must be `transparent` for this gate to read an alpha', src);
    }
    const base = stopColour(fm[1], ctx);
    const pct = percentage(fm[2], ctx);
    return { rgb: base.rgb, a: base.a * pct };
  }

  if (call.name === 'rgb' || call.name === 'rgba') {
    const bits = call.args.split('/');
    const nums = (bits[0].match(/[0-9.]+/g) ?? []).map(Number);
    if (nums.length < 3) unsupported('rgb() stop', src);
    const alpha = bits[1] ? percentage(bits[1].trim(), ctx) : nums[3] !== undefined ? nums[3] : 1;
    return { rgb: [nums[0], nums[1], nums[2]], a: alpha };
  }

  return unsupported('gradient stop colour function', src);
}

/**
 * A percentage in an ALPHA position, as a fraction.
 *
 * `clamp(var(--scrim-floor-min), calc(var(--scrim-base, 1) * 100%), 100%)` is
 * the shape the module ships and the reason this is not a plain parse: the
 * middle term arrives from a manifest at runtime, so the only value this gate
 * may assume is the one the clamp GUARANTEES — its lower bound. Reading the
 * middle term instead would let a manifest measured at 0.86 make this file
 * print ratios the stylesheet never renders.
 */
function percentage(expr, ctx) {
  const src = String(expr).trim();

  const call = asCall(src);
  if (call && call.name === 'clamp') {
    const [lo, mid, hi] = splitTop(call.args);
    // If the middle term depends on anything outside this stylesheet, the
    // guarantee is the floor. If it does not, evaluate it honestly.
    if (/var\(/.test(mid) && !ctx.vars?.has(/var\(\s*(--[a-z0-9-]+)/.exec(mid)?.[1] ?? '')) {
      ctx.sawExternalRelay = true;
      return percentage(lo, ctx);
    }
    return Math.min(Math.max(percentage(mid, ctx), percentage(lo, ctx)), percentage(hi, ctx));
  }
  if (call && call.name === 'calc') return percentage(call.args, ctx);
  if (call && call.name === 'min') return Math.min(...splitTop(call.args).map((a) => percentage(a, ctx)));
  if (call && call.name === 'max') return Math.max(...splitTop(call.args).map((a) => percentage(a, ctx)));

  const v = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i.exec(src);
  if (v) {
    const known = ctx.vars?.get(v[1]);
    if (known !== undefined) return percentage(known, ctx);
    if (v[2] !== undefined) {
      ctx.sawExternalRelay = true;
      return percentage(v[2], ctx);
    }
    unsupported('alpha references a custom property this gate cannot resolve', src);
  }

  const mul = src.split('*').map((s) => s.trim());
  if (mul.length === 2) return percentage(mul[0], ctx) * percentage(mul[1], ctx);

  const p = /^([0-9.]+)%$/.exec(src);
  if (p) return parseFloat(p[1]) / 100;
  const n = /^([0-9.]+)$/.exec(src);
  if (n) return parseFloat(n[1]);

  return unsupported('alpha value', src);
}

/**
 * One gradient layer, parsed into a form that can be sampled at (x, y).
 *
 * Returns { at(x, y) -> {rgb, a} }. Coordinates are CSS px inside the box the
 * gradient paints — for `.scrim` that is the whole band, because the module
 * declares `position: absolute; inset: 0` on the band's own stacking context.
 */
function parseGradient(src, ctx, depth = 0) {
  /* A layer written as `background: var(--scrim-pocket), var(--scrim-field)`
     — the form the reference repo uses to keep its two layers separately
     annotated. Resolve one level at a time so a cyclic definition runs out of
     depth instead of out of stack. */
  const indirect = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(src.trim());
  if (indirect) {
    if (depth > 8) unsupported('background layer var() nested more than 8 deep', src);
    const known = ctx.vars?.get(indirect[1]);
    if (known === undefined) {
      unsupported('background layer references a custom property this gate cannot resolve', src);
    }
    return parseGradient(known, ctx, depth + 1);
  }

  const call = asCall(src);
  if (!call) unsupported('background layer is not a gradient', src);

  const parts = splitTop(call.args);

  if (call.name === 'linear-gradient' || call.name === 'repeating-linear-gradient') {
    if (call.name.startsWith('repeating')) unsupported('repeating gradient', src);

    let angleDeg = 180;
    let rest = parts;
    const head = parts[0];
    const angleMatch = /^(-?[0-9.]+)deg$/.exec(head);
    const toMatch = /^to\s+(.+)$/.exec(head);
    if (angleMatch) {
      angleDeg = parseFloat(angleMatch[1]);
      rest = parts.slice(1);
    } else if (toMatch) {
      const side = toMatch[1].trim().toLowerCase();
      const map = { top: 0, right: 90, bottom: 180, left: 270 };
      if (!(side in map)) unsupported('linear-gradient `to <corner>` direction', src);
      angleDeg = map[side];
      rest = parts.slice(1);
    }

    const stops = parseStops(rest, ctx, 'linear');
    // The gradient line: angle 0deg points up, and grows clockwise.
    const rad = (angleDeg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const w = ctx.boxW;
    const h = ctx.boxH;
    // Length of the gradient line for this box, per CSS Images 3.
    const lineLen = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = w / 2;
    const cy = h / 2;
    // Stop offsets are resolved against the gradient line length.
    const resolved = resolveStopPositions(stops, lineLen, ctx);
    return {
      kind: `linear-gradient(${angleDeg}deg)`,
      at(x, y) {
        // Project onto the gradient line, then normalise: `resolved` holds
        // stop offsets as fractions of the line, so a raw px parameter here
        // would read every stop as "before the first one" and report the
        // first stop's alpha across the whole box. (It did, once.)
        const t = ((x - cx) * dx + (y - cy) * dy + lineLen / 2) / (lineLen || 1);
        return sampleStops(resolved, t);
      },
    };
  }

  if (call.name === 'radial-gradient' || call.name === 'repeating-radial-gradient') {
    if (call.name.startsWith('repeating')) unsupported('repeating gradient', src);

    let rest = parts;
    let rx = null;
    let ry = null;
    let px = ctx.boxW / 2;
    let py = ctx.boxH / 2;

    const head = parts[0];
    // A head is a position/size clause when it is not a colour stop. Colour
    // stops always start with a colour token; positions never do.
    if (head && !/^(#|rgb|color-mix|transparent|var\()/i.test(head.trim())) {
      rest = parts.slice(1);
      const atSplit = head.split(/\bat\b/);
      const sizePart = atSplit[0].trim();
      const posPart = (atSplit[1] ?? '').trim();

      if (posPart) {
        const [pxs, pys] = posPart.split(/\s+/);
        px = lengthPx(pxs, { ...ctx, axis: ctx.boxW });
        py = pys === undefined ? ctx.boxH / 2 : lengthPx(pys, { ...ctx, axis: ctx.boxH });
      }

      const sizeTokens = sizePart.split(/\s+/).filter(Boolean);
      const shape = sizeTokens.find((t) => t === 'circle' || t === 'ellipse') ?? 'ellipse';
      const extents = sizeTokens.filter((t) => t !== 'circle' && t !== 'ellipse');

      if (extents.length === 2) {
        rx = lengthPx(extents[0], { ...ctx, axis: ctx.boxW });
        ry = lengthPx(extents[1], { ...ctx, axis: ctx.boxH });
      } else if (extents.length === 1 && /^(closest|farthest)-(side|corner)$/.test(extents[0])) {
        const dxs = [Math.abs(px), Math.abs(ctx.boxW - px)];
        const dys = [Math.abs(py), Math.abs(ctx.boxH - py)];
        const pick = extents[0].startsWith('closest') ? Math.min : Math.max;
        if (extents[0].endsWith('side')) {
          rx = pick(...dxs);
          ry = pick(...dys);
        } else {
          rx = pick(...dxs);
          ry = pick(...dys);
          // corner: scale the ellipse so it passes through that corner.
          const k = Math.SQRT2;
          rx *= k;
          ry *= k;
        }
        if (shape === 'circle') {
          const r = extents[0].startsWith('closest')
            ? Math.min(...dxs, ...dys)
            : Math.max(...dxs, ...dys);
          rx = r;
          ry = r;
        }
      } else if (extents.length === 1) {
        rx = lengthPx(extents[0], { ...ctx, axis: ctx.boxW });
        ry = rx;
      } else {
        // No explicit size: CSS default is farthest-corner.
        rx = Math.max(Math.abs(px), Math.abs(ctx.boxW - px)) * Math.SQRT2;
        ry = Math.max(Math.abs(py), Math.abs(ctx.boxH - py)) * Math.SQRT2;
      }
    } else {
      rx = Math.max(px, ctx.boxW - px) * Math.SQRT2;
      ry = Math.max(py, ctx.boxH - py) * Math.SQRT2;
    }

    const stops = parseStops(rest, ctx, 'radial');
    const resolved = resolveStopPositions(stops, 1, ctx, true);
    return {
      kind: `radial-gradient(at ${Math.round(px)},${Math.round(py)} r ${Math.round(rx)}x${Math.round(ry)})`,
      at(x, y) {
        const u = rx === 0 ? 0 : (x - px) / rx;
        const v = ry === 0 ? 0 : (y - py) / ry;
        return sampleStops(resolved, Math.hypot(u, v));
      },
    };
  }

  return unsupported('background layer function', src);
}

/** `<colour> [<position>]` entries -> [{ colour, posExpr }]. */
function parseStops(entries, ctx, kind) {
  if (entries.length < 2) unsupported(`${kind}-gradient with fewer than two stops`, entries.join(', '));
  const out = [];
  for (const entry of entries) {
    // Split colour from position at the last top-level whitespace that is not
    // inside a function call.
    let depth = 0;
    let cut = -1;
    for (let i = 0; i < entry.length; i += 1) {
      const c = entry[i];
      if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      else if (depth === 0 && /\s/.test(c)) cut = i;
    }
    if (cut === -1) {
      out.push({ colour: entry, posExpr: null });
      continue;
    }
    const colour = entry.slice(0, cut).trim();
    const pos = entry.slice(cut).trim();
    // A trailing token is a position only if it parses as one; otherwise the
    // whitespace belonged inside the colour (e.g. `rgb(20 20 20 / 8%)` is a
    // single call and never reaches here, but `var(--x)` with no position does).
    if (/^-?[0-9.]/.test(pos) || /^calc\(|^var\(/.test(pos)) {
      out.push({ colour, posExpr: pos });
    } else {
      out.push({ colour: entry, posExpr: null });
    }
  }
  return out;
}

/**
 * Turns parsed stops into an ordered [{ t, rgb, a }] with every position
 * resolved to the gradient's own parameter space, filling implicit positions
 * the way CSS does (endpoints at 0 and 1, the rest evenly spaced between the
 * two nearest explicit ones), and making the sequence monotonic.
 */
function resolveStopPositions(stops, lineLen, ctx, normalised = false) {
  const out = stops.map((s) => ({
    ...stopColour(s.colour, ctx),
    t: s.posExpr === null
      ? null
      : normalised
        ? percentageOrLength(s.posExpr, ctx, 1)
        : lengthPx(s.posExpr, { ...ctx, axis: lineLen }) / (lineLen || 1),
  }));

  if (out[0].t === null) out[0].t = 0;
  if (out[out.length - 1].t === null) out[out.length - 1].t = 1;
  for (let i = 0; i < out.length; i += 1) {
    if (out[i].t !== null) continue;
    let j = i;
    while (out[j].t === null) j += 1;
    const span = j - (i - 1);
    for (let k = i; k < j; k += 1) {
      out[k].t = out[i - 1].t + ((out[j].t - out[i - 1].t) * (k - (i - 1))) / span;
    }
  }
  for (let i = 1; i < out.length; i += 1) out[i].t = Math.max(out[i].t, out[i - 1].t);
  return out;
}

/** A radial stop position: `%` of the radius, or a length against it. */
function percentageOrLength(expr, ctx, axis) {
  const src = String(expr).trim();
  const p = /^([0-9.]+)%$/.exec(src);
  if (p) return parseFloat(p[1]) / 100;
  return lengthPx(src, { ...ctx, axis });
}

/** Premultiplied interpolation, which is what CSS does across a transparent stop. */
function sampleStops(stops, t) {
  if (t <= stops[0].t) return { rgb: stops[0].rgb, a: stops[0].a };
  const last = stops[stops.length - 1];
  if (t >= last.t) return { rgb: last.rgb, a: last.a };
  for (let i = 1; i < stops.length; i += 1) {
    const b = stops[i];
    const a = stops[i - 1];
    if (t > b.t) continue;
    const span = b.t - a.t;
    const f = span === 0 ? 0 : (t - a.t) / span;
    const alpha = a.a + (b.a - a.a) * f;
    if (alpha === 0) return { rgb: a.rgb, a: 0 };
    const rgb = [0, 1, 2].map(
      (c) => (a.rgb[c] * a.a * (1 - f) + b.rgb[c] * b.a * f) / alpha,
    );
    return { rgb, a: alpha };
  }
  return { rgb: last.rgb, a: last.a };
}

/**
 * THE ALPHA FIELD.
 *
 * A veil is not one background any more. The shipped scrim is TWO painted
 * surfaces — `.scrim`'s own background (the full-width field) and
 * `.scrim::before` (the pocket, ramped vertically and MASKED horizontally to
 * the page measure) — and the pocket paints on top of the field because a
 * positioned pseudo-element is painted above its originating element's
 * background. Compositing only the first of those, which is what a
 * `.scrim { background-image: … }` parser does, reports the field's 24-34%
 * and misses the 93% pocket sitting on top of it across the whole measure.
 * That is not a small error: it is the difference between "this hero fails
 * every role" and "this hero passes".
 *
 * So the model is a STACK OF PAINT GROUPS, bottom to top. Each group is the
 * background layers of one surface plus, optionally, the mask that multiplies
 * its alpha. Within a group the FIRST listed background layer paints on top,
 * per CSS. Between groups, later groups paint on top.
 *
 * Returns { rgb, a } — the single translucent colour equivalent to the whole
 * stack at that point, so a caller can composite it over one photo pixel.
 */
function buildField(groups, elementOpacity) {
  return (x, y) => {
    // Bottom-up source-over. Start fully transparent.
    let rgb = [0, 0, 0];
    let a = 0;
    const over = (s, sa) => {
      const outA = sa + a * (1 - sa);
      if (outA === 0) {
        rgb = [0, 0, 0];
        a = 0;
        return;
      }
      rgb = [0, 1, 2].map((c) => (s.rgb[c] * sa + rgb[c] * a * (1 - sa)) / outA);
      a = outA;
    };
    for (const group of groups) {
      /*
        THE MASK MULTIPLIES, IT DOES NOT ADD — which is the whole reason the
        pocket is a masked pseudo-element rather than a third gradient. With
        `mask-mode: match-source` and a gradient source, what masks is the
        source's ALPHA channel, so `black` is 1 and `transparent` is 0 and the
        alphas this file already parses are exactly the right quantity.

        A group whose mask this gate cannot evaluate never reaches here: it
        raises Unsupported during parsing and fails the run by name.
      */
      const maskFactor = group.mask ? group.mask.at(x, y).a : 1;
      if (maskFactor <= 0) continue;
      for (let i = group.layers.length - 1; i >= 0; i -= 1) {
        const s = group.layers[i].at(x, y);
        over(s, s.a * maskFactor * elementOpacity);
      }
    }
    return { rgb, a };
  };
}

/* ── CSS structure: rules, pseudo-elements and media queries ────────────── */

/**
 * Every declaration block in a stylesheet, with its selector and the @media
 * condition it sits under.
 *
 * Hand-written rather than regex-matched because the regex it replaces had a
 * silent, consequential bug: a global `(^|[},])\s*\.scrim\b…` consumes the
 * closing brace of each match, so the NEXT rule can no longer see a `}` in
 * front of it and `.scrim::before` was never found at all. The gate read the
 * field, missed the pocket, and reported a hero that fails every role. A
 * parser that walks braces cannot make that mistake.
 */
function walkRules(css) {
  const out = [];
  const mediaStack = [];
  let buf = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      const head = buf.trim();
      buf = '';
      if (/^@media\b/i.test(head)) {
        mediaStack.push(head.replace(/^@media\s*/i, '').trim());
        i += 1;
        continue;
      }
      if (head.startsWith('@')) {
        // Some other at-rule with a block (@supports, @keyframes). Skip it
        // whole: nothing this gate measures is declared inside one, and
        // guessing at its semantics would be worse than ignoring it.
        let depth = 1;
        i += 1;
        while (i < css.length && depth > 0) {
          if (css[i] === '{') depth += 1;
          else if (css[i] === '}') depth -= 1;
          i += 1;
        }
        continue;
      }
      let depth = 1;
      const start = i + 1;
      i += 1;
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') depth -= 1;
        i += 1;
      }
      out.push({
        selector: head,
        body: css.slice(start, i - 1),
        media: mediaStack.length ? mediaStack[mediaStack.length - 1] : null,
      });
      continue;
    }
    if (ch === '}') {
      mediaStack.pop();
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  return out;
}

/**
 * Does an @media condition hold at this viewport?
 *
 * Only the features this stylesheet family uses are understood, and an
 * unknown one is treated as MATCHING — the conservative direction, because a
 * rule that might apply and is skipped is a veil the gate credits the page
 * with and the browser may not paint. It is also reported, so "the gate does
 * not understand this query" is visible rather than assumed.
 */
function mediaMatches(condition, vp, unknown) {
  if (!condition) return true;
  let matched = true;
  /* A media query cannot read a custom property, so a breakpoint that has to
     agree with one — `--container-wrap: 68rem` — is written in rem rather than
     retyped as 1088px. Both units, one root-relative conversion. */
  const px = (n, unit) => parseFloat(n) * (unit.toLowerCase() === 'rem' ? ROOT_FONT_PX : 1);
  for (const feature of condition.matchAll(/\(([^)]*)\)/g)) {
    const text = feature[1].trim();
    const minW = /^min-width\s*:\s*([0-9.]+)(px|rem)$/i.exec(text);
    const maxW = /^max-width\s*:\s*([0-9.]+)(px|rem)$/i.exec(text);
    const orient = /^orientation\s*:\s*(portrait|landscape)$/i.exec(text);
    if (minW) matched = matched && vp.w >= px(minW[1], minW[2]);
    else if (maxW) matched = matched && vp.w <= px(maxW[1], maxW[2]);
    else if (orient) {
      matched = matched && (orient[1].toLowerCase() === 'portrait' ? vp.h >= vp.w : vp.w > vp.h);
    } else unknown.add(text);
  }
  return matched;
}

/** Does `selector` name this class, optionally with this pseudo-element? */
function selectorNames(selector, className, pseudo) {
  return selector.split(',').some((part) => {
    const t = part.trim();
    if (pseudo === null) return t === `.${className}`;
    return t === `.${className}::${pseudo}` || t === `.${className}:${pseudo}`;
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   THE ANALYSIS

   One pure function over source text, so `--prove` can run it a second time
   against a deliberately weakened stylesheet and assert that it fails.
   ════════════════════════════════════════════════════════════════════════════ */

function analyse({ globalsSrc, scrimSrc, heroSrc, heroCss, assets, manifest, sourceFile, sharp }) {
  assertNeutrality();
  const failures = [];
  const notes = [];
  const fail = (where, message, detail, fix) =>
    failures.push({ where, message, detail, fix });

  /* ── app/globals.css ──────────────────────────────────────────────────── */

  const palette = new Map();
  for (const m of globalsSrc.matchAll(/(--color-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const rgb = parseHex(m[2].slice(0, 7));
    if (rgb) palette.set(m[1], rgb);
  }

  const inkBlock = /\[data-ground="ink"\]\s*\{([\s\S]*?)\n\}/.exec(globalsSrc);
  if (!inkBlock) {
    fail(GLOBALS, 'no [data-ground="ink"] block found',
      'the hero declares this ground; without it there is nothing to measure',
      'restore the ground context block, or update this gate if the grounds were renamed');
  }

  const inkRoles = new Map();
  if (inkBlock) {
    for (const m of inkBlock[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      inkRoles.set(m[1], m[2].trim());
    }
  }

  /*
    ── THE BAND MAY REMAP A ROLE, AND THE BROWSER OBEYS IT ───────────────────

    `[data-ground="ink"]` and `.ground` land on the SAME element (hero.tsx:
    `<Band tone="ink" className={scrim.ground}>`), so a role redeclared in
    `.ground` wins in the cascade — same specificity class, later origin. This
    gate previously read roles from globals.css alone, which made it blind to
    exactly that: it kept demanding the alpha a retired colour needed.

    That was not a hypothetical. The hero remaps `--fg-accent` and `--rule` to
    `--fg`, retiring every small crimson run so the scrim's floor can drop and
    the veil's edge can stop being visible. Without this overlay the gate went
    on requiring alpha >= 0.9297 for a colour the band no longer paints, and the
    floor could not move.

    Scoped deliberately: only the top-level `.ground` rule, only custom
    properties, and only roles the ink context already declares — so this can
    reveal a REMAP, never invent a role globals.css does not have. Media-query
    copies of `.ground` are ignored; a role that varies by viewport would need
    the per-viewport treatment the field evaluator already does for geometry.
  */
  const groundRule = /(?:^|\n)\.ground\s*\{([\s\S]*?)\n\}/.exec(
    scrimSrc.replace(/\/\*[\s\S]*?\*\//g, ' '),
  );
  const remapped = [];
  if (groundRule) {
    for (const m of groundRule[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      const [, role, value] = m;
      if (!inkRoles.has(role)) continue;
      if (inkRoles.get(role) === value.trim()) continue;
      remapped.push(`${role} -> ${value.trim()}`);
      inkRoles.set(role, value.trim());
    }
  }

  function resolveRole(role, seen = new Set()) {
    if (seen.has(role)) return null;
    seen.add(role);
    const raw = inkRoles.get(role);
    if (raw === undefined) return null;
    const direct = parseHex(raw);
    if (direct) return direct;
    const v = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(raw);
    if (!v) return null;
    if (palette.has(v[1])) return palette.get(v[1]);
    return resolveRole(v[1], seen);
  }

  const ground = resolveRole('--ground');
  if (!ground) {
    fail(GLOBALS, '--ground on the ink context does not resolve to a hex colour',
      `got: ${inkRoles.get('--ground') ?? '(absent)'}`,
      'the scrim is painted in --ground; this gate cannot proceed without its value');
  }

  const roles = [];
  for (const [role, need] of Object.entries(ROLE_THRESHOLDS)) {
    const rgb = resolveRole(role);
    if (!rgb) {
      fail(GLOBALS, `${role} on the ink context does not resolve to a hex colour`,
        `got: ${inkRoles.get(role) ?? '(absent)'}`,
        'every foreground role must resolve to a measurable colour, or this gate is blind to it');
      continue;
    }
    roles.push({ role, rgb, need });
  }

  let spacingBandMin = null;
  let spacingBandMax = null;
  {
    const m = /--spacing-band\s*:\s*clamp\(\s*([0-9.]+)(rem|px)\s*,[^,]+,\s*([0-9.]+)(rem|px)\s*\)/.exec(globalsSrc);
    if (m) {
      spacingBandMin = m[2] === 'rem' ? parseFloat(m[1]) * ROOT_FONT_PX : parseFloat(m[1]);
      spacingBandMax = m[4] === 'rem' ? parseFloat(m[3]) * ROOT_FONT_PX : parseFloat(m[3]);
    }
  }
  if (spacingBandMin === null) {
    fail(GLOBALS, '--spacing-band is not a clamp() this gate can read',
      'check B derives the aperture clearance from its bounds',
      'keep the clamp(<min>, <pref>, <max>) form, or teach this gate the new one');
  }

  /* ── the scrim module ─────────────────────────────────────────────────── */

  // Strip /* … */ so the measured numbers written into the header comment are
  // never mistaken for declarations. That file is full of them, on purpose.
  const scrimCode = scrimSrc.replace(/\/\*[\s\S]*?\*\//g, ' ');

  const allRules = walkRules(scrimCode);

  /**
   * Custom properties this stylesheet may read but does not declare — the
   * masked pocket's `--scrim-open` is written against `--container-wrap`,
   * which lives in app/globals.css. Read, never retyped: a page measure that
   * exists in two files is a page measure that will disagree with itself, and
   * the horizontal geometry of the pocket is exactly what decides whether a
   * glyph in the outer gutter is covered.
   */
  const globalVars = new Map();
  for (const m of globalsSrc.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    if (!globalVars.has(m[1])) globalVars.set(m[1], m[2].trim());
  }

  /**
   * The surfaces that paint the veil, BOTTOM TO TOP.
   *
   * `.scrim`'s own background is the bottom. Its positioned pseudo-elements
   * paint above it, in tree order, because a positioned descendant is painted
   * after its originating element's background. The shipped design uses
   * exactly this: a full-width field on `.scrim` and a masked pocket on
   * `.scrim::before`, and reading only the first of the two understates the
   * veil by the entire pocket.
   */
  const SURFACES = [
    { pseudo: null, label: '.scrim' },
    { pseudo: 'before', label: '.scrim::before' },
    { pseudo: 'after', label: '.scrim::after' },
  ];

  const unknownMedia = new Set();

  /**
   * Custom properties `.ground` declares, at one viewport.
   *
   * `.scrim` is a CHILD of `.ground` — see components/site/hero.tsx, where the
   * band carries `scrim.ground` and the veil is nested inside it — so every
   * custom property on `.ground` INHERITS into the veil and into both of its
   * pseudo-elements. This gate used to model only the `.scrim` -> `::before`
   * hop and start everything else from `globalVars`, which meant a length the
   * veil reads from its own parent resolved to "unknown" and the whole
   * rasterisation failed by name. That was safe but wrong: `.ground` is where
   * the hero's geometry knobs live (`--hero-pos-*`, `--hero-headroom`), and
   * the vertical aperture is written against one of them.
   */
  function groundVars(vp) {
    const vars = new Map();
    for (const rule of allRules) {
      if (!selectorNames(rule.selector, 'ground', null)) continue;
      if (!mediaMatches(rule.media, vp, unknownMedia)) continue;
      for (const d of rule.body.matchAll(/(--[-a-z0-9]+)\s*:\s*([^;]+);/gi)) {
        vars.set(d[1].trim(), d[2].trim());
      }
    }
    return vars;
  }

  /**
   * Declarations for one surface at one viewport, later rules overriding.
   *
   * Custom properties are layered in INHERITANCE ORDER, weakest first:
   *
   *     app/globals.css :root  ->  .ground  ->  .scrim  ->  .scrim::<pseudo>
   *
   * which is the real cascade for these elements (`.scrim` is a child of
   * `.ground`, and a pseudo-element inherits from its originating element).
   * Building it as one ordered chain rather than as a set of special cases is
   * what lets `.scrim::before`'s ramp read `--hero-headroom` off `.ground` and
   * `--scrim-floor` off `.scrim` in the same expression.
   */
  function surfaceDecls(pseudo, vp) {
    const decls = new Map();
    const vars = new Map(globalVars);
    for (const [k, v] of groundVars(vp)) vars.set(k, v);
    let found = false;

    /* `.scrim` itself: its custom properties inherit into every pseudo, so
       they are collected whichever surface is being read. Its OTHER
       declarations belong to `.scrim` alone. */
    for (const rule of allRules) {
      if (!selectorNames(rule.selector, 'scrim', null)) continue;
      if (!mediaMatches(rule.media, vp, unknownMedia)) continue;
      if (pseudo === null) found = true;
      for (const d of rule.body.matchAll(/([-a-z0-9]+)\s*:\s*([^;]+);/gi)) {
        const prop = d[1].trim();
        const value = d[2].trim();
        if (prop.startsWith('--')) vars.set(prop, value);
        else if (pseudo === null) decls.set(prop, value);
      }
    }

    /* The pseudo-element's own rules, strongest. */
    if (pseudo !== null) {
      for (const rule of allRules) {
        if (!selectorNames(rule.selector, 'scrim', pseudo)) continue;
        if (!mediaMatches(rule.media, vp, unknownMedia)) continue;
        found = true;
        for (const d of rule.body.matchAll(/([-a-z0-9]+)\s*:\s*([^;]+);/gi)) {
          const prop = d[1].trim();
          const value = d[2].trim();
          if (prop.startsWith('--')) vars.set(prop, value);
          else decls.set(prop, value);
        }
      }
    }
    return { decls, vars, found };
  }

  const baseSurface = surfaceDecls(null, VIEWPORTS[0]);
  if (!baseSurface.found) {
    fail(SCRIM, 'no `.scrim` rule found',
      "this gate rasterises that rule's background — and its pseudo-elements' — to derive the " +
      'alpha field; without it there is no veil to measure and every published ratio is unproven',
      'keep the veil in a class called `.scrim`, or teach this gate the new name');
  }

  const scrimVars = baseSurface.vars;
  let elementOpacity = 1;
  const opacityExpr = baseSurface.decls.get('opacity') ?? null;

  /*
    ELEMENT OPACITY. The reference repo multiplies its whole gradient stack by
    one — `opacity: calc(var(--scrim-rest) + 0.2 * var(--focus, 0))` — and that
    is precisely the construct that makes a contrast floor a function of scroll
    position. A CONSTANT opacity is fine and is folded into the field; anything
    that reads --focus, or any variable this gate cannot resolve, is a failure,
    because the guarantee would then depend on a value that is not in the file.
  */
  if (opacityExpr !== null) {
    if (/--focus\b/.test(opacityExpr)) {
      fail(SCRIM, "the scrim's opacity reads --focus",
        `opacity: ${opacityExpr}`,
        'the hero band is ~1.6 viewports tall and carries text at every scroll position ' +
        'inside it, so a scroll-linked veil is a contrast floor you can scroll out of. ' +
        'Put any scroll-linked density in an ADDITIVE gradient layer whose own minimum ' +
        'is still above the floor, never in an element opacity multiplying the guarantee');
    } else {
      try {
        elementOpacity = percentage(opacityExpr, { vars: scrimVars, ground: ground ?? [20, 22, 26] });
      } catch (err) {
        fail(SCRIM, 'the scrim carries an element opacity this gate cannot evaluate',
          `opacity: ${opacityExpr} — ${err.message}`,
          'an opacity multiplying the gradient makes every alpha in the file advisory; ' +
          'either make it a literal this gate can fold in, or move the density into the ' +
          'gradient stops');
      }
    }
  }

  /*
    THE RELAY DISCIPLINE. `--scrim-base` arrives from the manifest through an
    inline style on components/site/hero.tsx. It must only ever be able to make
    the veil DARKER, or a manifest measured at a lighter alpha silently ships
    unmeasurable contrast. The clamp is what makes the failure UNREACHABLE
    rather than merely caught.
  */
  if (/--scrim-base\b/.test(scrimCode)) {
    if (!/clamp\(\s*var\(\s*--scrim-[a-z-]*floor[a-z-]*\s*\)\s*,/.test(scrimCode)) {
      fail(SCRIM, 'the relayed --scrim-base is not clamped up to a floor literal',
        'an externally supplied alpha must only ever be able to make the veil DARKER; ' +
        'without the clamp the guarantee is advisory',
        'keep `clamp(var(--scrim-floor-min), calc(var(--scrim-base, 1) * 100%), 100%)`');
    }
    if (!/var\(\s*--scrim-base\s*,\s*1\s*\)/.test(scrimCode)) {
      fail(SCRIM, '--scrim-base has no `1` fallback',
        'with no photograph nothing sets it, and the veil must resolve to fully opaque ' +
        '--ground so the band is pixel-identical to the flat ink hero',
        'write `var(--scrim-base, 1)`');
    }
  }

  {
    const anyBackground = SURFACES.some((s2) => {
      const d = surfaceDecls(s2.pseudo, VIEWPORTS[0]).decls;
      return d.has('background-image') || d.has('background');
    });
    if (!anyBackground && baseSurface.found) {
      fail(SCRIM, '`.scrim` and its pseudo-elements paint no background',
        'the veil is the guarantee; a `.scrim` with nothing painted in it is a hero whose ' +
        'published ratios are claims about a photograph',
        'declare `background-image` on .scrim or on one of its pseudo-elements');
    }
  }

  /* ── the field, per viewport ──────────────────────────────────────────── */

  /** `--spacing-band` at one viewport. Hoisted: checks C and F both need it. */
  const spacingBandAt = (vp) =>
    spacingBandMin === null
      ? null
      : Math.min(Math.max(0.1 * vp.w, spacingBandMin), spacingBandMax);

  /*
    ════════════════════════════════════════════════════════════════════════
    ── THE PHOTOGRAPH'S BOX, AND WHY IT IS NOW EVALUATED RATHER THAN MATCHED
    ════════════════════════════════════════════════════════════════════════

    This used to be one regex — `/block-size:\s*min\(\s*100%\s*,\s*([0-9.]+)svh\s*\)/`
    — reaching into the whole stylesheet for a shape it already expected, and
    falling back to `?? 1.06` at every call site when it did not find one.

    Both halves of that were wrong, and together they are how a 458px hole
    stayed invisible through four rounds of work on this hero:

      1. IT MATCHED A SHAPE, NOT A RULE. Any other bound — `100%`, a clamp, a
         media-queried override, the same value written `min(106svh, 100%)` —
         reads as "absent", and absent silently became 1.06. A gate whose
         geometry has a DEFAULT is a gate that keeps reporting after the thing
         it measures has moved.
      2. IT PRODUCED A FRACTION OF THE VIEWPORT, so nothing in this file could
         express — let alone check — the one quantity that mattered: how much
         of the BAND the photograph covers. `min(100%, 106svh)` bounds the
         picture to about one screenful while the band is as tall as the copy
         makes it, and the two numbers are unrelated. At 1280x800 that is
         848px of photograph inside a 1306px band: THE BOTTOM 458px — 35% of
         the hero — is bare `--ground` with no photograph behind it at all.

    So `.frame`'s block-size is now resolved per viewport through the same
    evaluator the gradients use (px / % / svh / calc / min / max / clamp,
    against the real band box), and a bound this gate cannot evaluate is a
    hard failure rather than an assumption. `axis` is the band height, which
    is what `%` resolves against on this element: `.frame` is `position:
    absolute` inside `.ground`, so its containing block is the band.
  */
  function frameBoxAt(vp) {
    const spacingBand = spacingBandAt(vp);
    const ctx = {
      vars: new Map([...globalVars, ...groundVars(vp)]),
      ground: ground ?? [20, 22, 26],
      vw: vp.w,
      vh: vp.h,
      boxW: vp.w,
      boxH: vp.bandH,
      axis: vp.bandH,
      spacingBand: spacingBand ?? 0,
    };
    let expr = null;
    for (const rule of allRules) {
      if (!selectorNames(rule.selector, 'frame', null)) continue;
      if (!mediaMatches(rule.media, vp, unknownMedia)) continue;
      for (const d of rule.body.matchAll(/(?:^|;)\s*(block-size|height)\s*:\s*([^;]+)/gi)) {
        expr = d[2].trim();
      }
    }
    if (expr === null) return { expr: null, h: null };
    try {
      return { expr, h: lengthPx(expr, ctx) };
    } catch (err) {
      return { expr, h: null, error: err && err.message ? err.message : String(err) };
    }
  }

  /**
   * The band's vertical partition, per viewport. `frameH` is where the
   * photograph stops; everything below it is bare `--ground`.
   */
  const geometry = VIEWPORTS.map((vp) => {
    const box = frameBoxAt(vp);
    const frameH = box.h === null ? null : Math.min(vp.bandH, box.h);
    return {
      vp,
      expr: box.expr,
      error: box.error ?? null,
      frameH,
      bareH: frameH === null ? null : Math.max(0, vp.bandH - frameH),
      coverage: frameH === null ? null : Math.min(1, frameH / vp.bandH),
    };
  });
  const geometryFor = (name) => geometry.find((g) => g.vp.name === name) ?? null;

  if (baseSurface.found) {
    for (const g of geometry) {
      if (g.expr === null) {
        fail(SCRIM, '`.frame` declares no block-size this gate can find',
          `at ${g.vp.name}: no \`block-size\` or \`height\` on any \`.frame\` rule that applies here`,
          'the photograph\'s box is what decides how much of the band carries a picture at all. ' +
          'This gate refuses to assume a bound — an assumed 106svh is exactly how 35% of the ' +
          'band went unmeasured. Declare block-size on .frame, or teach this gate the new ' +
          'element that bounds the photograph');
      } else if (g.frameH === null) {
        fail(SCRIM, '`.frame`\'s block-size is a length this gate cannot evaluate',
          `at ${g.vp.name}: \`${g.expr}\` — ${g.error}`,
          'write it over px / % / rem / svh / calc / min / max / clamp, or teach the evaluator ' +
          'the new form in the same commit. A photo box whose height is unknown makes every ' +
          'number below a statement about a region this gate cannot locate');
      }
    }
  }

  /** The focal point, per breakpoint. */
  const focal = (() => {
    const decls = [...scrimCode.matchAll(/--hero-pos-y\s*:\s*([0-9.]+)%/g)].map((m) => parseFloat(m[1]) / 100);
    return { narrow: decls[0] ?? 0.5, wide: decls[decls.length - 1] ?? 0.5 };
  })();

  /**
   * Builds the alpha field for one viewport, or records why it could not.
   * `sawExternalRelay` reports whether a clamp floor stood in for a runtime
   * value — i.e. whether the numbers below are the GUARANTEE rather than the
   * likely render, which is the honest thing to print.
   */
  const fields = new Map();
  let fieldError = null;
  let sawExternalRelay = false;
  if (baseSurface.found && ground && spacingBandMin !== null) {
    for (const vp of VIEWPORTS) {
      const spacingBand = Math.min(Math.max(0.1 * vp.w, spacingBandMin), spacingBandMax);

      /*
        WHERE THE FIRST GLYPH ACTUALLY SITS.

        It used to be exactly `--spacing-band`, and this gate hard-coded that.
        It is now `--spacing-band + --hero-headroom`: below the page measure the
        pocket has no horizontal aperture to give, so components/site/
        hero-scrim.module.css opens a VERTICAL one and pushes the hero's content
        down by the same distance it pushes the veil's ramp.

        Read off `.ground` rather than assumed, at this viewport, through the
        same evaluator the gradients use — so the number here and the number the
        browser paints come from one expression. A stale copy of it would let
        the aperture open with glyphs inside it, which is the only way this
        design can be wrong.
      */
      const groups = [];
      let failedHere = false;

      const groundAtVp = groundVars(vp);
      let headroom = 0;
      try {
        headroom = lengthPx(groundAtVp.get('--hero-headroom') ?? '0px', {
          vars: groundAtVp, ground, vw: vp.w, vh: vp.h,
          boxW: vp.w, boxH: vp.bandH, axis: vp.bandH, spacingBand,
        });
      } catch (err) {
        fail(SCRIM, '`--hero-headroom` on .ground is not a length this gate can evaluate',
          `at ${vp.name}: ${err && err.message ? err.message : String(err)}`,
          'the hero content is padded by this value and the veil ramps from it, so a value ' +
          'this gate cannot resolve is an aperture whose position is unmeasured. Write it as ' +
          'a length over px / rem / svh / calc / clamp, or teach the evaluator the new form');
        failedHere = true;
      }
      const firstGlyphY = spacingBand + headroom;

      for (const surface of SURFACES) {
        const { decls, vars, found } = surfaceDecls(surface.pseudo, vp);
        if (!found) continue;
        const bg = decls.get('background-image') ?? decls.get('background') ?? null;
        if (bg === null) continue;

        const ctx = {
          vars,
          ground,
          vw: vp.w,
          vh: vp.h,
          boxW: vp.w,
          boxH: vp.bandH,
          axis: vp.bandH,
          spacingBand,
          sawExternalRelay: false,
        };

        try {
          const layers = splitTop(bg).map((layer) => parseGradient(layer, ctx));

          /*
            THE MASK. `mask-image` is how the shipped pocket is shaped on the
            horizontal axis without also darkening the aperture at the top —
            background layers only ever ADD alpha, so a horizontally shaped
            background could not be subtracted out of the crest. It has to be
            evaluated or the pocket's edge — the exact place a glyph in the
            outer gutter would sit — is unmeasured.

            `-webkit-mask-image` is accepted as a synonym; if both are present
            they must agree, because a browser that takes the prefixed one
            would then be rendering a veil this gate did not check.
          */
          const maskExpr = decls.get('mask-image') ?? decls.get('-webkit-mask-image') ?? null;
          const prefixed = decls.get('-webkit-mask-image') ?? null;
          const standard = decls.get('mask-image') ?? null;
          if (standard !== null && prefixed !== null
            && standard.replace(/\s+/g, ' ') !== prefixed.replace(/\s+/g, ' ')) {
            fail(SCRIM, `${surface.label} declares two different masks`,
              'mask-image and -webkit-mask-image do not match, so WebKit and Chromium shape ' +
              'the veil differently and only one of them is the veil this gate measured',
              'keep the two declarations byte-identical, or drop the prefixed one');
          }
          let mask = null;
          if (maskExpr !== null) {
            const maskLayers = splitTop(maskExpr).map((layer) => parseGradient(layer, ctx));
            if (maskLayers.length !== 1) {
              unsupported('mask with more than one layer', maskExpr);
            }
            mask = maskLayers[0];
          }

          groups.push({ label: surface.label, layers, mask });
          if (ctx.sawExternalRelay) sawExternalRelay = true;
        } catch (err) {
          if (!(err instanceof Unsupported)) throw err;
          fieldError = err;
          fail(SCRIM, `${surface.label} uses a construct this gate cannot evaluate`,
            `${err.what} — saw \`${err.saw}\``,
            'THIS IS A HARD FAILURE ON PURPOSE. A scrim the gate cannot rasterise is a scrim ' +
            'whose contrast is unmeasured, and the alternative — falling back to a single ' +
            'assumed alpha — is how a shaped scrim ships looking green. Either write the layer ' +
            'in a form this file evaluates (linear-gradient / radial-gradient, stops in %, px, ' +
            'svh or calc() over --spacing-band or --container-wrap, colours as ' +
            'color-mix(in srgb, var(--ground) N%, transparent)), or teach ' +
            'scripts/check-hero-contrast.mjs the new construct in the same commit that ' +
            'introduces it');
          failedHere = true;
          break;
        }
      }

      if (failedHere) break;
      if (groups.length === 0) continue;
      fields.set(vp.name, {
        vp,
        spacingBand,
        headroom,
        firstGlyphY,
        groups,
        field: buildField(groups, elementOpacity),
      });
    }
  }

  /*
    A @media condition scoping a `.scrim` rule that this gate cannot evaluate
    is a veil it may be crediting the page with at a viewport where the browser
    does not paint it. Reported as a failure rather than assumed either way:
    guessing "it applies" over-credits the veil, and guessing "it does not"
    under-credits it, and neither guess is a measurement.
  */
  if (unknownMedia.size > 0) {
    fail(SCRIM, 'a @media condition on the scrim uses a feature this gate cannot evaluate',
      `saw: ${[...unknownMedia].join('; ')}`,
      'this gate understands min-width, max-width and orientation. A rule it cannot place is ' +
      'a veil it may be crediting at a viewport that never paints it — teach the matcher the ' +
      'new feature, or scope the rule with one it already knows');
  }

  /**
   * The weakest composite alpha anywhere a glyph can land, per viewport, and
   * the position that produces it. THIS IS THE NUMBER THAT REPLACED
   * `--scrim-floor-min`: with a shaped scrim there is no single floor in the
   * stylesheet, so the floor is derived from the field over the text extent.
   */
  const floors = [];
  for (const [name, f] of fields) {
    const ext = textExtentFor(f.vp.w);
    let worst = { a: 2, x: 0, y: 0 };
    const x0 = ext.x0 * f.vp.w;
    const x1 = ext.x1 * f.vp.w;
    const y0 = Math.max(ext.y0 * f.vp.bandH, f.firstGlyphY);
    const y1 = ext.y1 * f.vp.bandH;
    const nx = GRID;
    const ny = Math.max(GRID, Math.round((GRID * (y1 - y0)) / Math.max(1, x1 - x0)));
    for (let iy = 0; iy <= ny; iy += 1) {
      const y = y0 + ((y1 - y0) * iy) / ny;
      for (let ix = 0; ix <= nx; ix += 1) {
        const x = x0 + ((x1 - x0) * ix) / nx;
        const a = f.field(x, y).a;
        if (a < worst.a) worst = { a, x, y };
      }
    }
    floors.push({ name, vp: f.vp, ...worst, spacingBand: f.spacingBand, firstGlyphY: f.firstGlyphY });
  }
  const guaranteedAlpha = floors.length ? Math.min(...floors.map((f) => f.a)) : null;
  const bindingFloor = floors.find((f) => f.a === guaranteedAlpha) ?? null;

  /* ── THE PER-GLYPH TREATMENT, RESOLVED ────────────────────────────────── */

  /*
    Per viewport, because a treatment's strength is a function of the type it
    is painted on and this system's type is a clamp() of the viewport width.
    The 48px display step on a phone is 40px, its stem is 1.34px rather than
    3.09px, and the halo it can throw is proportionally weaker. A gate that
    resolved the type once would credit the phone with the desktop's halo.
  */
  const typeScale = readTypeScale(globalsSrc);
  /*
    EVERY STYLESHEET THE HERO IMPORTS, not a hard-coded pair.

    `heroCss` is built in main() by reading components/site/hero.tsx's own
    `*.module.css` imports, so a treatment moved into a new module travels with
    the component instead of falling out of this gate's window. A halo in a
    file nobody opens is credited at zero — the safe direction — but "safe" is
    not the same as "correct", and an author who cannot see why their halo is
    being ignored will thin the veil to compensate.

    app/globals.css is scanned too, but ONLY for rules scoped to the hero's own
    ground: it is the site-wide sheet and a text-shadow on some other band is
    not this gate's business.
  */
  /*
    DEDUPED BY FILE, and that is not tidiness. `heroCss` is built from
    hero.tsx's own `*.module.css` imports, and hero.tsx imports the scrim — so
    hero-scrim.module.css arrives here TWICE, once as `scrimSrc` and once
    inside `heroCss`. For the halo that was harmless: two identical rules for
    one role merge to themselves under "keep the WEAKER". For the collar it is
    not, in two ways. The override scan (S3) would compare a rule against its
    own duplicate, and `--prove`'s controls mutate `scrimSrc` while the second
    copy travels through unmutated — which is exactly how the REMOVED control
    was found still carrying the collar it was supposed to have deleted.

    The first entry wins, so `scrimSrc` (the one the controls mutate) is the
    copy that is read.
  */
  const treatmentSources = [];
  for (const s of [
    { file: SCRIM, src: scrimSrc, requireHeroScope: false },
    ...(heroCss ?? []).map((c) => ({ file: c.file, src: c.src, requireHeroScope: false })),
    { file: GLOBALS, src: globalsSrc, requireHeroScope: true },
  ]) {
    if (!treatmentSources.some((x) => x.file === s.file)) treatmentSources.push(s);
  }
  const treatmentRules = collectTreatmentRules(treatmentSources);
  const collar = collectCollarRules(treatmentSources);
  /** viewport name -> (role -> treatment). */
  const treatments = new Map();
  const treatmentProblems = [...collar.problems];
  const treatmentIndex = [];
  const collarIndex = [];
  for (const vp of VIEWPORTS) {
    const byRole = new Map();
    const spacingBand = spacingBandAt(vp) ?? 0;
    const ctx = {
      vars: new Map([...globalVars, ...groundVars(vp)]),
      ground: ground ?? [20, 22, 26],
      vw: vp.w, vh: vp.h, boxW: vp.w, boxH: vp.bandH, axis: vp.w, spacingBand,
    };
    /* Two rules treating one role at one viewport: keep the WEAKER, because
       the gate cannot see which element a given glyph belongs to and a role
       is only as legible as its least-treated instance. */
    const keepWeaker = (treatment) => {
      const prev = byRole.get(treatment.role);
      if (prev === undefined
        || localGroundLuminance(treatment, WHITE_SRC) > localGroundLuminance(prev, WHITE_SRC)) {
        byRole.set(treatment.role, treatment);
      }
    };
    for (const rule of treatmentRules) {
      if (!mediaMatches(rule.media, vp, unknownMedia)) continue;
      const { problems, treatment } = resolveTreatment(rule, ctx, typeScale);
      for (const pr of problems) treatmentProblems.push(`${rule.file} ${rule.selector} @ ${vp.name}: ${pr}`);
      if (!treatment) continue;
      keepWeaker(treatment);
    }
    /*
      ── THE COLLAR, THROUGH THE SAME DOOR ──────────────────────────────────
      Resolved into the SAME per-role map, because from here down a role has
      one treatment and nothing downstream needs to know which kind it is.

      ROLE DISJOINTNESS, and it has real teeth. A role that carried both a
      text halo and a box collar would be merged by `keepWeaker` into ONE
      treatment, and whichever survived would then be credited everywhere the
      role is painted — including everywhere the other one is what is actually
      on the page. That is wrong in both directions at once, since neither
      treatment is painted where the other one is. Disjoint namespaces are what
      make this a one-line check instead of a judgement.
    */
    for (const rule of collar.rules) {
      if (!mediaMatches(rule.media, vp, unknownMedia)) continue;
      const { problems, treatment } = resolveCollar(rule, ctx);
      for (const pr of problems) treatmentProblems.push(`${rule.file} ${rule.selector} @ ${vp.name}: ${pr}`);
      if (!treatment) continue;
      const clash = byRole.get(treatment.role);
      if (clash !== undefined && clash.kind !== 'collar') {
        treatmentProblems.push(`${rule.file} ${rule.selector} @ ${vp.name}: ${treatment.role} carries `
          + `both a --halo-role (${clash.selector}) and a --collar-role. A role gets one kind of `
          + 'treatment: a text halo is painted around glyphs and a box collar around a border box, '
          + 'and crediting one role with both would let the weaker-of-the-two merge hand every '
          + 'instance of the role a treatment that is not painted on it');
        continue;
      }
      keepWeaker(treatment);
      collarIndex.push({ vp: vp.name, role: treatment.role, t: treatment });
    }
    treatments.set(vp.name, byRole);
    for (const [role, t] of byRole) treatmentIndex.push({ vp: vp.name, role, t });
  }

  if (treatmentProblems.length) {
    fail(HERO_CSS, 'a per-glyph text treatment this gate cannot evaluate',
      treatmentProblems.slice(0, 6).join(' | '),
      'THIS IS A HARD FAILURE ON PURPOSE, for the same reason an unparseable gradient is: a ' +
      'halo the gate cannot read is a halo nothing checks, and the whole point of moving the ' +
      'darkening onto the letterforms is that it lets the veil get thinner. Declare ' +
      '`--halo-role: <the foreground role>` and `--halo-type: <font-size> <weight> ' +
      '<display|body|mono|serif>` on the same rule, write the colours as ' +
      'color-mix(in srgb, var(--ground) N%, transparent), and pair any text-stroke with ' +
      '`paint-order: stroke fill`');
  }

  /**
   * The treatment a role gets at its WEAKEST viewport — the one where the
   * local composited ground over a white source pixel comes out lightest.
   * Check A is a single worst-case statement over the whole hero, so it has to
   * pair the weakest veil with the weakest halo, not with the average one.
   */
  const weakestTreatment = new Map();
  for (const { role, t } of treatmentIndex) {
    const prev = weakestTreatment.get(role);
    if (prev === undefined
      || localGroundLuminance(t, WHITE_SRC) > localGroundLuminance(prev, WHITE_SRC)) {
      weakestTreatment.set(role, t);
    }
  }
  const anyTreatment = treatmentIndex.length > 0;

  /*
    ── THE CLAIM THE PAGE MAKES HAS TO BE THE CLAIM THIS FILE MEASURES ──────

    A ratio with a halo in it is NOT the plain WCAG 1.4.3 quantity — 1.4.3's
    formula runs between a text colour and a background colour, and a halo the
    text paints for itself has no place in it. Crediting one is a departure
    from the letter of the success criterion, taken deliberately because a
    reader's eye credits it too, and it makes this measurement STRICTER than
    WCAG in two ways (real photographic pixels, worst case rather than
    nominal) and MORE PERMISSIVE in exactly that one.

    So: this gate will not credit a treatment on a page that has not said so.
    Not an editorial nicety — the page's entire argument is that its published
    numbers are checkable, and a number derived by a method the page does not
    name is a number nobody can check.
  */
  /*
    ── AND ONLY WHEN THE HALO IS ACTUALLY CARRYING THE CLAIM ────────────────

    A treatment that is belt-and-braces over a veil which already passes on its
    own changes no published number: strip it and every ratio still holds, so
    the page's plain-WCAG figures remain true statements and there is nothing
    to disclose. The disclosure is owed when the halo is LOAD-BEARING — when
    some role passes with it and fails without it — because that is exactly
    when a figure on the page is reachable only by a method the page does not
    name.

    So the roles that depend on the halo are named, and if none do, this is a
    note rather than a failure. That is a sharper gate, not a softer one: it
    fires precisely when the claim would otherwise be false.
  */
  const halolLoadBearing = [];
  if (ground && guaranteedAlpha !== null) {
    for (const { role, rgb, need } of roles) {
      const t = weakestTreatment.get(role);
      if (t === undefined) continue;
      const bare = contrastToLuminance(rgb, luminance(composite(ground, guaranteedAlpha, WHITE_SRC)));
      if (bare < need * HEADROOM) halolLoadBearing.push({ role, bare, need });
    }
  }

  if (anyTreatment && halolLoadBearing.length > 0 && !globalsSrc.includes(CONTRAST_DISCLOSURE)) {
    fail(GLOBALS, 'the hero credits a per-glyph treatment that the page does not disclose',
      `${halolLoadBearing.map((h) => `${h.role} is ${h.bare.toFixed(3)}:1 against ` +
        `${(h.need * HEADROOM).toFixed(3)} WITHOUT its halo`).join('; ')} — so ` +
      `${halolLoadBearing.length} published role(s) are reachable only through the treatment, ` +
      `and app/globals.css does not contain the string "${CONTRAST_DISCLOSURE}"`,
      'add that marker to the contrast commentary in app/globals.css, and say in the prose ' +
      'what it means: the hero\'s ratios are measured against the LOCAL COMPOSITED GROUND — ' +
      'the photograph, the veil and the text\'s own halo, averaged over the observer\'s point ' +
      'spread function beside each stroke. That is stricter than WCAG 2.x against a nominal ' +
      'flat background AND is not the literal 1.4.3 procedure, because 1.4.3 does not credit ' +
      'a halo at all. Publish both halves of that sentence or drop the halo');
  }

  /*
    ── THE SHEET TEST ───────────────────────────────────────────────────────
    A halo whose influence reaches further than an em beyond the ink is not a
    per-glyph treatment; it is a scrim with a slower renderer. Caught here.
  */
  const reaches = [];
  for (const { vp, role, t } of treatmentIndex) {
    /*
      ── COUNTER CLOSURE ────────────────────────────────────────────────────
      A rim grows inward too. When the stroke width reaches the cut's own
      counter, the two rims meet inside the letter and the bowls fill. The
      contrast ratio goes on improving all the way through that point and
      past it, which is precisely why it has to be checked separately: the
      number would be a true statement about a shape that is no longer a
      character.
    */
    /*
      A COLLAR TAKES THE SAME TEST AGAINST A DIFFERENT LIMIT. `treatmentReachPx`
      is used completely unmodified — it asks "how far out is this still
      distinguishable from no treatment at all over a #FFFFFF source pixel",
      which is the same question for a bar as for a glyph. Only the threshold
      changes, because a bar has no em: `COLLAR_REACH_PX_MAX` is the measured
      tightest ink-to-ink gap in the band. A spread-340 pad is rejected here by
      name, exactly as HALO_REACH_EM_MAX rejects a 200px blur.
    */
    if (t.kind === 'collar') {
      const reach = treatmentReachPx(t);
      reaches.push({ vp, role, reach, fontPx: null, em: null, selector: t.selector });
      if (reach > COLLAR_REACH_PX_MAX) {
        fail(t.file, `the ${role} collar is a sheet in disguise at ${vp}`,
          `its darkening is still above 1 L* over a #FFFFFF source pixel ${reach.toFixed(1)}px `
          + `from the ink, and the tightest measured gap between this band's ink and its `
          + `neighbouring ink is ${COLLAR_REACH_PX_MAX}px. At that radius the collar has reached `
          + 'the next piece of ink and what is painted between them is a continuous field, not a '
          + 'pad around one object.',
          `keep the visible reach under ${COLLAR_REACH_PX_MAX}px — tighten the blur radii, or cut `
          + 'the spread. Spread buys an opaque core without lengthening the tail, so it is the '
          + 'cheaper of the two here. If a full-column veil is genuinely wanted, put it in the '
          + 'scrim where checks A, B and C already govern it, and say so');
      }
      continue;
    }
    if (t.stroke && t.stroke.widthPx >= t.counterPx) {
      fail(t.file, `the ${role} rim closes the letterform's counters at ${vp}`,
        `-webkit-text-stroke is ${t.stroke.widthPx.toFixed(2)}px and this cut's narrowest ` +
        `counter at ${t.fontPx.toFixed(1)}px is ${t.counterPx.toFixed(2)}px (measured across ` +
        `the two stems of "n"). A rim grows inward as well as outward, so at this width the ` +
        'bowls and shoulders are solid --ground and the ratio below is a statement about a ' +
        'blob rather than a glyph.',
        `keep the stroke under ${t.counterPx.toFixed(2)}px at this size — or set the role in a ` +
        'cut with a wider counter, or larger, which moves the limit with it. This is the ' +
        'ceiling on how much a rim can do, and it is why a per-glyph treatment cannot take ' +
        'the veil to zero on small copy however the numbers are arranged.');
    }
    const reach = treatmentReachPx(t);
    reaches.push({ vp, role, reach, fontPx: t.fontPx, em: reach / t.fontPx, selector: t.selector });
    if (reach > HALO_REACH_EM_MAX * t.fontPx) {
      fail(t.file, `the ${role} treatment is a sheet in disguise at ${vp}`,
        `its darkening is still above 1 L* over a #FFFFFF source pixel ${reach.toFixed(1)}px ` +
        `from the stroke, which is ${(reach / t.fontPx).toFixed(2)}em at this viewport's ` +
        `${t.fontPx.toFixed(1)}px type. Line-height in this system runs 1.02 to 1.65, so at ` +
        'that radius the halos of adjacent lines merge and what is painted over the text ' +
        'column is a continuous field.',
        `keep the visible reach under ${HALO_REACH_EM_MAX}em — tighten the blur radii, or ` +
        'move the density into a paint-order stroke, whose reach is its own width and nothing ' +
        'more. If a full-column veil is genuinely wanted, put it in the scrim where checks A, ' +
        'B and C already govern it, and say so');
    }
  }

  /*
    ── THE SAME ALGEBRA, PER VIEWPORT ───────────────────────────────────────

    Check A below states ONE worst case over the whole hero, which is the right
    thing to gate on and the wrong thing to read. The veil's floor, the type's
    resolved size and therefore the halo's strength all move with the viewport,
    and a design that is comfortable at 1600 and marginal at 375 looks the same
    as one that is marginal everywhere if only the minimum is printed. So the
    binding role is resolved at each reference viewport and reported.
  */
  const perViewport = [];
  if (ground) {
    for (const f of floors) {
      const byRole = treatments.get(f.name) ?? new Map();
      let worst = null;
      for (const { role, rgb, need } of roles) {
        const t = byRole.get(role) ?? null;
        const ratio = contrastToLuminance(rgb, localGroundLuminance(t, composite(ground, f.a, WHITE_SRC)));
        const slack = ratio / (need * HEADROOM);
        if (worst === null || slack < worst.slack) worst = { role, need, ratio, slack, treated: t !== null };
      }
      perViewport.push({ name: f.name, alpha: f.a, ...worst });
    }
  }

  /* ── A · the algebra ──────────────────────────────────────────────────── */

  const WHITE = [255, 255, 255];
  const derived = [];
  /**
   * The alpha the WORST role needs over a #FFFFFF source pixel. Derived from
   * the palette, never read from the stylesheet — it is what the veil owes,
   * as opposed to what the veil currently delivers, and check B needs the
   * former. Using the field's own minimum there would be circular: a field
   * whose minimum sits exactly at the first glyph can never deliver that same
   * minimum twelve pixels higher, so every scrim would fail by construction.
   */
  let requiredAlphaWorstCase = 0;
  if (ground) {
    for (const { role, rgb, need } of roles) {
      requiredAlphaWorstCase = Math.max(
        requiredAlphaWorstCase,
        minAlphaTreated(rgb, ground, WHITE, need * HEADROOM, weakestTreatment.get(role) ?? null),
      );
    }
  }
  if (ground && guaranteedAlpha !== null) {
    for (const { role, rgb, need } of roles) {
      /*
        THE VEIL IS NO LONGER THE ONLY THING BETWEEN THE INK AND THE PICTURE.

        `required` is the veil alpha this role needs GIVEN its own treatment,
        and `actual` is the ratio it gets over the LOCAL COMPOSITED GROUND —
        the photograph's worst pixel, the veil at the field's weakest
        text-bearing point, and the text's own halo, integrated over the
        observer's point spread function beside the stroke.

        With no treatment declared for this role both lines are byte-identical
        to what they were before this section existed (`assertNeutrality`), so
        every number in the reports below is continuous across the change and
        an un-haloed role still owes the veil the whole of its contrast.
      */
      const t = weakestTreatment.get(role) ?? null;
      const required = minAlphaTreated(rgb, ground, WHITE, need * HEADROOM, t);
      const groundY = localGroundLuminance(t, composite(ground, guaranteedAlpha, WHITE));
      const actual = contrastToLuminance(rgb, groundY);
      derived.push({ role, need, required, actual, treated: t !== null, t });
      if (actual < need * HEADROOM) {
        fail(SCRIM, `the scrim's weakest text-bearing alpha ${guaranteedAlpha.toFixed(4)} is below what ${role} needs`,
          `${role} over the field at its worst point — ${bindingFloor.name}, ` +
          `(${Math.round(bindingFloor.x)}, ${Math.round(bindingFloor.y)}) in the band box — ` +
          `against a #FFFFFF source pixel is ${actual.toFixed(3)}:1` +
          `${t
            ? (t.kind === 'collar'
              ? ` WITH its own collar credited (${t.selector}, ${t.ray} ray, box `
                + `${t.boxThicknessPx.toFixed(0)}x${t.boxExtentPx.toFixed(0)}px)`
              : ` WITH its own halo credited (${t.selector}, stem ${t.stemPx.toFixed(2)}px)`)
            : ' (no per-glyph treatment declared for this role)'}; ` +
          `${need}:1 x${HEADROOM} headroom needs alpha >= ${required.toFixed(4)}`,
          `deepen the veil where the text is (alpha >= ${(Math.ceil(required * 1000) / 10).toFixed(1)}% ` +
          'at every point inside the text extent), STRENGTHEN THE PER-GLYPH TREATMENT on this ' +
          'role — a paint-order stroke in --ground is the technique with real headroom here, ' +
          'because a text-shadow caps at about half coverage at the stroke\'s own edge while a ' +
          'rim is opaque out to its own width — set the role in a heavier or larger cut so its ' +
          'stem has more ink to throw a halo from, grade the source darker so the worst-case ' +
          `pixel is no longer #FFFFFF, or take ${role} out of the hero. ` +
          'Do not lower HEADROOM, do not raise SHADOW_CREDIT, and do not narrow TEXT_EXTENT — ' +
          'the browser gate checks that one.');
      }
    }
  }

  /* ── B · the clearance ────────────────────────────────────────────────── */

  /*
    Derived from the field rather than from named stops, so it holds for any
    shape. Walk down the band from y = 0 and find the first row at which EVERY
    x across the band's full width already delivers the guaranteed alpha. Above
    that row the veil is lighter than the text floor somewhere, so a glyph
    landing there would not be covered — which is legal only because nothing is
    drawn there.
  */
  if (guaranteedAlpha !== null && requiredAlphaWorstCase > 0) {
    for (const [name, f] of fields) {
      /*
        THE X-RANGE IS THE TEXT EXTENT, NOT THE BAND'S FULL WIDTH.

        This used to sweep the whole width, which was right for a full-width
        vertical scrim and became wrong the moment the pocket was masked to the
        page measure: above 1088px the outer gutters are transparent BY DESIGN
        and never reach any floor, so a full-width sweep reported "the veil
        never reaches its own text floor" at 1280 and 1600 — a failure about a
        region that carries no glyphs. The gutters are covered by check C,
        which reports them as aperture rather than gating them.
      */
      const ext = textExtentFor(f.vp.w);
      const xa = ext.x0 * f.vp.w;
      const xb = ext.x1 * f.vp.w;
      let reached = null;
      const sweepTo = f.firstGlyphY * 1.6;
      for (let iy = 0; iy <= GRID * 4; iy += 1) {
        const y = (sweepTo * iy) / (GRID * 4);
        let ok = true;
        for (let ix = 0; ix <= GRID; ix += 1) {
          if (f.field(xa + ((xb - xa) * ix) / GRID, y).a + 1e-9 < requiredAlphaWorstCase) {
            ok = false;
            break;
          }
        }
        if (ok) {
          reached = y;
          break;
        }
      }
      if (reached === null) {
        fail(SCRIM, `the veil never reaches the alpha its own palette needs, above the first glyph at ${name}`,
          `swept y = 0 .. ${sweepTo.toFixed(0)}px across the text extent ` +
          `(x ${xa.toFixed(0)}..${xb.toFixed(0)}) and no row delivered alpha ` +
          `${requiredAlphaWorstCase.toFixed(4)}, which is what the weakest ink role needs over a ` +
          '#FFFFFF source pixel',
          'the aperture is legal only because it is text-free; it must close before ' +
          '--spacing-band + --hero-headroom, where the first glyph sits');
        continue;
      }
      const clearance = f.firstGlyphY - reached;
      if (clearance < MIN_CLEARANCE) {
        fail(SCRIM, `the aperture reaches within ${clearance.toFixed(1)}px of the first glyph at ${name}`,
          `the field first delivers alpha ${requiredAlphaWorstCase.toFixed(4)} at y = ` +
          `${reached.toFixed(1)}px and the hero's first glyph sits at --spacing-band + ` +
          `--hero-headroom = ${f.firstGlyphY.toFixed(1)}px. Above that row the veil is ` +
          'lighter than the palette ' +
          'needs somewhere across the text extent, and a glyph landing there is unprotected.',
          `close the aperture at least ${MIN_CLEARANCE}px above the first glyph`);
      }
      f.clearance = clearance;
      f.apertureClosesAt = reached;
    }
  }

  /* ── F · the seal ─────────────────────────────────────────────────────── */

  /*
    ════════════════════════════════════════════════════════════════════════
    WHERE THE PHOTOGRAPH ENDS, THE VEIL MUST ALREADY BE THE GROUND.
    ════════════════════════════════════════════════════════════════════════

    THE DEFECT THIS EXISTS FOR. Five gates and four rounds of gradient work
    all reported green while 35% of the hero band at 1280x800 — 458 CSS
    pixels — held no photograph at all. Every gate measured the region where
    the picture WAS. None of them asked whether the picture reached the bottom
    of the band, so the one region a reader scrolls through last, and the one
    the owner kept pointing at, was outside every instrument's window.

    The band below the photograph is not automatically a defect: this hero is
    1.6 viewports of copy and a photograph is a fixed rectangle, so a designed
    dissolve into flat ink is a legitimate answer (components/site/
    hero-scrim.module.css argues it at length, and the honesty of the ratios
    below the dissolve is a real benefit). What is NOT legitimate is for that
    region to be an ACCIDENT — `min(100%, 106svh)` is written in viewport
    units, the band's height is set by how much copy it happens to carry, and
    nothing anywhere records what the shortfall between them is supposed to
    be. Add a line of copy and it grows; nothing notices.

    So this check asserts the one property that separates a designed
    transition from an accidental hole, and it is a property of the RENDER
    rather than of the syntax — it holds for any shape:

        AT THE ROW WHERE THE PHOTOGRAPH ENDS INSIDE THE BAND, THE COMPOSITE
        VEIL MUST ALREADY BE FULLY OPAQUE `--ground`, ACROSS THE FULL WIDTH.

    Both directions are failures and they are different defects:

      VEIL LIGHTER THAN GROUND AT THE FRAME'S EDGE — the photograph stops
      while it is still visible. That is a horizontal cut across the picture
      at an arbitrary height: the purest form of "a black box pasted over the
      photograph", and the thing check-hero-blend.mjs would measure as a step
      if the step were inside its window.

      VEIL FULLY OPAQUE WELL ABOVE THE FRAME'S EDGE — the last rows of the
      photograph are painted, decoded, paid for in bytes, and invisible.

    ── ONLY THE FIRST OF THOSE IS GATED HERE, AND THE REASON IS ARITHMETIC ──

    The second is real — it measures 111px at 375x812 below — but its
    threshold does not belong in this file, and the first attempt at gating it
    here was measuring the wrong thing. Written out, because it is the kind of
    mistake that gets a gate deleted:

    This veil is TWO multiplying layers, `eff = 1 - (1-f)(1-p)`, and both
    ramps terminate at the same stop. Near that stop `1 - eff` therefore goes
    to zero as the SQUARE of the remaining distance, so the composite crosses
    any fixed "close enough to opaque" line strictly before the endpoint, by a
    margin that is a property of the algebra and not of the design. A
    half-sRGB-level line puts that crossing 40px early at 375; it would be
    early for ANY pair of smooth ramps meeting at one row. Gating it here
    would have been a gate no correct design can pass — the exact failure mode
    the header of this file warns about, arrived at from the other direction.

    And the honest perceptual criterion makes the number BIGGER, not smaller:
    at 1 JND of L* over a white source pixel the picture is already
    indistinguishable from flat ink 111px above the frame's edge at 375. That
    is a presence question, it is measured against a perceptual threshold
    derived in scripts/check-hero-blend.mjs, and it is gated there — over a
    rendered flat field, where "can this be seen" is what is actually being
    asked. Here it is REPORTED, per viewport, as `wasted`.

    So this check gates the cut, which is unambiguous and shape-independent:
    where the photograph stops inside the band, the veil must already be the
    ground.

    TOLERANCE. `SEAL_EPSILON` is one half of one sRGB level expressed as an
    alpha over this ground — the point below which the composite is
    indistinguishable from flat `--ground` after 8-bit quantisation. It is a
    quantisation limit, not a margin: nothing is being allowed through.

    `DEAD_JND_LSTAR` is CIE dE*ab = 1, the same published constant
    scripts/check-hero-blend.mjs derives its budget from, used here for the
    property it was actually defined for: distinguishability of two adjacent
    large uniform fields. A row of photograph whose brightest possible
    composite is within 1 L* of bare ground cannot be told from bare ground.
  */
  const SEAL_EPSILON = 0.5 / 255;
  const SEAL_LEAD_PX = 6;
  const DEAD_JND_LSTAR = 1.0;

  /* L* of a relative luminance, and its inverse — CIE 1976, including the toe. */
  const toLstar = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);

  /*
    The alpha at which this ground, over the brightest source pixel there can
    be (#FFFFFF), first becomes indistinguishable from the bare ground itself.
    Derived from the palette at run time rather than typed: change --ground and
    this moves with it.
  */
  const deadAlpha = (() => {
    if (!ground) return 1;
    const gY = luminance(ground);
    const target = gY;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      const y = luminance(composite(ground, mid, WHITE));
      if (toLstar(y) - toLstar(target) > DEAD_JND_LSTAR) lo = mid;
      else hi = mid;
    }
    return hi;
  })();

  if (baseSurface.found && ground) {
    for (const [name, f] of fields) {
      const g = geometryFor(name);
      if (!g || g.frameH === null) continue;

      /* The frame ending AT the band's own bottom edge is not a seam: the band
         ends there too, and the next section's own boundary is the edge a
         reader sees. Only a frame that stops INSIDE the band is a seam. */
      if (g.bareH <= SEAL_LEAD_PX) continue;

      /* The weakest point across the full width at the frame's last row — full
         width rather than the text extent, because a photograph cut short in
         the outer gutter is just as visible as one cut short under the copy. */
      const edgeY = Math.min(g.frameH, f.vp.bandH - 1e-6);
      let weakest = { a: 2, x: 0 };
      for (let ix = 0; ix <= GRID; ix += 1) {
        const x = (f.vp.w * ix) / GRID;
        const a = f.field(x, edgeY).a;
        if (a < weakest.a) weakest = { a, x };
      }
      f.sealAlphaAtFrameEdge = weakest.a;

      if (weakest.a < 1 - SEAL_EPSILON) {
        fail(SCRIM,
          `the photograph ends inside the band while the veil is still transparent at ${name}`,
          `\`.frame\` is bounded to ${g.frameH.toFixed(0)}px (\`${g.expr}\`) inside a ` +
          `${g.vp.bandH}px band, so the picture stops ${g.bareH.toFixed(0)}px above the band's ` +
          `bottom — but the composite veil at that row is only ${(weakest.a * 100).toFixed(2)}% ` +
          `at x=${Math.round(weakest.x)}, not 100%. Below that row there is no photograph and ` +
          'the backdrop is flat --ground, so the reader sees a horizontal cut across the ' +
          'picture at an arbitrary height.',
          'either extend `.frame` so the photograph reaches the bottom of the band, or move ' +
          'the veil\'s dissolve so it completes AT the frame\'s edge. The two numbers are one ' +
          'decision and they must be written as one — a photo box in viewport units against a ' +
          'band whose height is set by its copy is not a design, it is a coincidence');
      }

      /*
        And the other direction, REPORTED rather than gated (see above): how
        far above the frame's own edge the photograph has already become
        indistinguishable from flat ground. Swept upward from the edge, at the
        perceptual threshold rather than the quantisation one.
      */
      let deadFrom = edgeY;
      for (let dy = 1; dy <= Math.ceil(g.frameH); dy += 1) {
        const y = edgeY - dy;
        if (y < 0) break;
        let ok = true;
        for (let ix = 0; ix <= GRID; ix += 1) {
          if (f.field((f.vp.w * ix) / GRID, y).a < deadAlpha) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
        deadFrom = y;
      }
      f.deadFrom = deadFrom;
      f.deadPhotoPx = edgeY - deadFrom;
    }
  }

  /* ── C + D · the photograph ───────────────────────────────────────────── */

  const report = [];
  const cells = [];
  const havePhoto = assets.length > 0 || sourceFile !== null;

  /*
    E · THE OTHER SOURCE OF TRUTH.

    `--scrim-base` is relayed from the manifest and the stylesheet clamps it UP
    to a literal floor, so a manifest measured lighter than that floor cannot
    produce failing contrast — but it CAN mean the manifest claims a
    photograph is visible at an alpha the stylesheet silently overrides. Two
    sources of truth disagreeing about the one number this feature turns on is
    a defect whether or not it is currently harmful.

    COMPARED AGAINST THE CLAMP LITERAL, NOT AGAINST THE COMPOSITE FIELD. An
    earlier version of this check compared the manifest to the field's
    composite minimum, which after the pocket-plus-field rewrite is a strictly
    larger number (0.9473 against a 93% clamp floor) because a second layer
    paints on top. That reported the manifest as wrong for agreeing exactly
    with the stylesheet — two different quantities held to one threshold. The
    relay's counterpart is the literal it is clamped against.
  */
  const clampFloors = [];
  for (const m of scrimCode.matchAll(/clamp\(\s*var\(\s*(--[a-z0-9-]+)\s*\)\s*,([^;]*?--scrim-base[^;]*?)\)/g)) {
    const literal = scrimVars.get(m[1]);
    if (literal === undefined) continue;
    try {
      clampFloors.push({ name: m[1], value: percentage(literal, { vars: scrimVars, ground: ground ?? [20, 22, 26] }) });
    } catch { /* reported by the field parser, which reads the same value */ }
  }
  const relayFloor = clampFloors.length ? Math.min(...clampFloors.map((c) => c.value)) : null;

  if (manifest && manifest.scrim && relayFloor !== null) {
    for (const key of ['base', 'exit', 'requiredAlpha']) {
      const v = manifest.scrim[key];
      if (typeof v !== 'number') continue;
      if (v + 1e-9 < relayFloor) {
        fail(join(PHOTO_DIR, 'manifest.json'),
          `scrim.${key} is ${v}, below the ${clampFloors[0].name} literal of ${relayFloor.toFixed(4)} it is clamped against`,
          'components/site/hero-scrim.module.css clamps the relayed alpha up, so the ' +
          'photograph renders darker than this manifest says it does — and anyone reading the ' +
          'manifest is reading a number the page does not use',
          `re-measure at >= ${relayFloor.toFixed(4)}, or lower ${clampFloors[0].name} if the ` +
          'derivation genuinely changed (and re-run this gate, which will tell you if it did not)');
      }
    }
  }

  if (!havePhoto) {
    notes.push(
      'C + D skipped: no hero photograph is installed. The source is absent from',
      'public/brand/ and the generator manifest declares no rungs.',
      'This is the shipping state. With --scrim-base unset the veil resolves to fully',
      "opaque --ground, so the band is the flat ink hero and app/globals.css's published",
      'ratios apply unchanged. A and B above are properties of the CSS and still hold.',
    );
  } else if (!sharp) {
    fail('scripts/check-hero-contrast.mjs',
      'a hero photograph is present but no image decoder is installed',
      `found ${assets.length} generated asset(s)${sourceFile ? ` and the source ${sourceFile}` : ''}, ` +
      'but `sharp` could not be imported, so the pixels behind the hero text are unmeasured',
      'npm i -D sharp  (scripts/gen-hero-photo.mjs needs it too) — passing this gate ' +
      'without decoding the asset would make it a promise rather than a check');
  } else if (assets.length === 0) {
    /*
      SAMPLE THE GRADED RUNGS, NEVER THE MASTER. The browser composites the
      rung; the master is the ungraded input to the pipeline and grading it is
      the whole point of the tone hook. Measuring the master would report the
      luminance the page does NOT paint — flattering if the grade is a
      lightening pass, disastrously wrong if it is a darkening one.
    */
    fail(PHOTO_DIR,
      'a hero source exists but the generator has emitted no rungs to measure',
      `${sourceFile} is on disk and public/brand/hero/manifest.json declares no files. ` +
      'This gate deliberately refuses to fall back to the ungraded master: the browser ' +
      'composites the graded rung, and a ratio measured against a different image is not ' +
      'a measurement of this page.',
      'run `node scripts/gen-hero-photo.mjs`');
  } else {
    /* D · wiring */
    if (heroSrc !== null) {
      if (!/hero-scrim\.module\.css/.test(heroSrc)) {
        fail(HERO_TSX, 'the hero does not import the scrim module',
          'a photograph is shipped but nothing paints the veil that makes the published ratios true',
          "import scrim from './hero-scrim.module.css' and apply .ground, .frame, .focal and .scrim");
      } else {
        for (const cls of ['ground', 'frame', 'focal', 'scrim']) {
          if (!new RegExp(`\\.${cls}\\b`).test(heroSrc)) {
            fail(HERO_TSX, `the hero imports the scrim module but never applies .${cls}`,
              'every class in that module is load-bearing: .ground isolates the stacking context, ' +
              '.frame bounds the photo box, .focal carries the focal point, .scrim is the guarantee',
              `apply styles.${cls}`);
          }
        }
      }
    }

    /* C · pixels, cell by cell, against the field */
    for (const target of assets) {
      const file = target.path;
      let measured;
      try {
        measured = target.pixels;
      } catch {
        measured = null;
      }
      if (!measured) continue;
      const { lum, width, height, globalMin, globalMax } = measured;
      const name = basename(file);
      const wide = target.wide ?? (/-l-/.test(name) || (!/-p-/.test(name) && width >= height));

      if (target.declared && (target.declared.w !== width || target.declared.h !== height)) {
        fail(file, 'is not the size its manifest declares',
          `manifest says ${target.declared.w}x${target.declared.h}, the file decodes as ${width}x${height}`,
          'the declared width IS the `w` descriptor the browser selects against — re-run the generator');
      }

      if (globalMax - globalMin < 1e-9) {
        fail(file, 'is a single flat colour',
          'a placeholder or a failed export, not a photograph',
          're-run scripts/gen-hero-photo.mjs against a real source image');
      }

      for (const vp of VIEWPORTS) {
        const isWideVp = vp.w >= 861;
        if (isWideVp !== wide) continue;
        const f = fields.get(vp.name);
        if (!f) continue;

        // `.frame` box, then `object-fit: cover` into it.
        const geo = geometryFor(vp.name);
        if (!geo || geo.frameH === null) continue;
        const frameH = geo.frameH;
        const scale = Math.max(vp.w / width, frameH / height);
        const drawnW = width * scale;
        const drawnH = height * scale;
        const posY = isWideVp ? focal.wide : focal.narrow;
        const originY = (frameH - drawnH) * posY;
        const originX = (vp.w - drawnW) * 0.5;

        const ext = textExtentFor(vp.w);
        const gx = GRID;
        const vpTreatments = treatments.get(vp.name) ?? new Map();

        /*
          ══════════════════════════════════════════════════════════════════
          THE SWEEP IS THE WHOLE BAND. IT USED TO BE THE PHOTOGRAPH.
          ══════════════════════════════════════════════════════════════════

          Every loop in this block used to run `0 .. frameH`, and `frameH` is
          the PHOTOGRAPH's box, not the band's. At 1280x800 that is 848 of
          1306 rows: THE BOTTOM 458 PIXELS OF THE HERO WERE NEVER VISITED BY
          THIS GATE. Not measured and found acceptable — never looked at. The
          same hole is 824px at 375 (49% of the band) and 384px at 1600.

          That is the defect this file was blind to, and it is a blind spot of
          a specific and recognisable kind: the instrument's window was set to
          the extent of the thing being measured rather than to the extent of
          the thing being CLAIMED ABOUT. The claim is "the hero is legible and
          the photograph is visible"; the subject of that claim is the band.
          So the sweep is the band, and the photograph's absence below
          `frameH` is a MEASURED REGION with a name — see `REGIONS` — rather
          than the outside of a loop.

          Below `frameH` there is no source pixel to sample. The backdrop
          there is flat `--ground` and the composite is `--ground` exactly, so
          the cells are trivially the strongest in the band on contrast and
          the weakest possible on visibility. Both facts are now printed.
        */
        const sweepH = vp.bandH;
        const gy = Math.max(GRID, Math.round((GRID * sweepH) / vp.w));

        /*
          VISIBILITY, AS A MEASURED QUANTITY.

          "It looks like a black rectangle" is a real defect report and it
          deserves a number rather than an opinion. `screenMax` is the
          luminance of the BRIGHTEST PIXEL THE VISITOR ACTUALLY SEES in this
          rung at this viewport — the source peak carried through the veil.
          `screenSpread` is the difference between the brightest and darkest
          composited cell: the tonal range that survives. A veil that replaces
          the photograph rather than darkening it crushes that spread toward
          zero, which is exactly what a flat high-alpha scrim does and exactly
          what a tone grade plus a thinner veil is meant to avoid.

          REPORTED PER REGION, because one number for the whole band averages
          the answer over places with completely different jobs and hides
          exactly the defect the owner is describing. The four regions
          partition the band with no overlap and no gap:

            crest    above the first glyph, photograph present. Text-free by
                     construction, so it carries no contrast constraint at
                     all: this is where the picture is ALLOWED to be a
                     picture, and the number here is the one that decides
                     whether the hero reads as photographic.
            column   inside the text extent, photograph present. The veil's
                     floor lives here and so does every published ratio.
            gutter   outside the text extent horizontally, photograph
                     present — the jambs the mask opens above 1088px.
            bare     BELOW THE PHOTOGRAPH. No source pixel exists. Flat ink.

          None of it is gated. It is reported because the owner's complaint is
          about these numbers, and because the region that was invisible to
          this gate for four rounds is now a labelled row with a byte window
          of exactly one level.
        */
        const REGIONS = ['crest', 'column', 'gutter', 'bare'];
        const region = Object.fromEntries(REGIONS.map((k) => [k, {
          cells: 0, outMax: 0, outMin: 1, srcMax: 0,
        }]));
        let worstCell = null;
        let screenMax = 0;
        let screenMin = 1;
        let apertureOut = 0;
        let textOut = 0;
        let textOutMin = 1;

        for (let iy = 0; iy < gy; iy += 1) {
          const yA = (sweepH * iy) / gy;
          const yB = (sweepH * (iy + 1)) / gy;
          for (let ix = 0; ix < gx; ix += 1) {
            const xA = (vp.w * ix) / gx;
            const xB = (vp.w * (ix + 1)) / gx;

            /*
              IS THERE A PHOTOGRAPH BEHIND THIS CELL AT ALL?

              `.frame` is `overflow: clip` and bounded to `frameH`, so below
              that row the <img> is not painted and the backdrop is the band's
              own `--ground`. Modelling it as "a source pixel of luminance 0"
              would be wrong in the flattering direction — it would report the
              darkest possible photograph rather than NO photograph — so the
              two cases are kept distinct all the way through: `hasPhoto` is
              false, `lmax` is null, and the composite backdrop is the ground
              itself rather than the veil over a source pixel.
            */
            const hasPhoto = yA < frameH;

            // Source rows/cols that land in this cell.
            let lmax = 0;
            if (hasPhoto) {
              const yTop = Math.min(yA, frameH);
              const yBot = Math.min(yB, frameH);
              const r0 = Math.min(height - 1, Math.max(0, Math.floor((yTop - originY) / scale)));
              const r1 = Math.min(height - 1, Math.max(0, Math.ceil((yBot - originY) / scale)));
              const c0 = Math.min(width - 1, Math.max(0, Math.floor((xA - originX) / scale)));
              const c1 = Math.min(width - 1, Math.max(0, Math.ceil((xB - originX) / scale)));
              for (let r = r0; r <= r1; r += 1) {
                const row = r * width;
                for (let c = c0; c <= c1; c += 1) {
                  const l = lum[row + c];
                  if (l > lmax) lmax = l;
                }
              }
            }

            /*
              THE TEXT EXTENT, AS A RECTANGLE RATHER THAN A PREDICATE.

              A cell is gated when it OVERLAPS the extent, which is right — a
              glyph in the overlap has to clear its threshold. But the veil
              then has to be sampled over the OVERLAP, not over the whole cell.
              Sampling the whole cell takes the weakest alpha anywhere in it,
              including corners that sit out in the aperture where no glyph can
              land, and holds a glyph that cannot be there to a backdrop that
              is not behind it.

              That is not conservatism, it is a category error, and it has a
              cost: with a shaped scrim the cells along the pocket's edge
              straddle the mask's fade, so the gate reads the aperture's alpha
              and demands the APERTURE be veiled to text standard. Obeying it
              would close the aperture — the one region where the photograph
              can be seen — to protect glyphs that are 44px away.

              So the sample rectangle is CLIPPED to the extent. `lmax` is left
              unclipped, which keeps the pairing conservative in the direction
              that matters: the brightest source pixel anywhere in the cell,
              against the weakest veil anywhere a glyph in that cell can be.
            */
            const tx0 = ext.x0 * vp.w;
            const tx1 = ext.x1 * vp.w;
            const ty0 = Math.max(ext.y0 * vp.bandH, f.firstGlyphY);
            const ty1 = ext.y1 * vp.bandH;

            const sx0 = Math.max(xA, tx0);
            const sx1 = Math.min(xB, tx1);
            const sy0 = Math.max(yA, ty0);
            const sy1 = Math.min(yB, ty1);
            const inText = sx1 >= sx0 && sy1 >= sy0;

            // The veil's weakest point inside the gated part of the cell — the
            // corners and the centre bound any smooth gradient closely here.
            let amin = 2;
            let arep = null;
            for (const [px, py] of inText
              ? [[sx0, sy0], [sx1, sy0], [sx0, sy1], [sx1, sy1], [(sx0 + sx1) / 2, (sy0 + sy1) / 2]]
              : [[xA, yA], [xB, yA], [xA, yB], [xB, yB], [(xA + xB) / 2, (yA + yB) / 2]]) {
              const s = f.field(px, py);
              if (s.a < amin) {
                amin = s.a;
                arep = s;
              }
            }

            /*
              WITH NO PHOTOGRAPH THE BACKDROP IS THE GROUND, FULL STOP. Not
              the veil composited over a black source — that is the same
              number here only because this veil happens to be `--ground`
              itself, and it would quietly stop being the same number the
              moment anyone paints the veil in a colour that is not the
              ground. The region's own definition is what is modelled.
            */
            const backdrop = hasPhoto
              ? composite(arep.rgb, amin, greyOf(lmax))
              : (ground ?? [20, 22, 26]).slice();
            const out = luminance(backdrop);
            if (out > screenMax) screenMax = out;
            if (out < screenMin) screenMin = out;

            const bucket = !hasPhoto
              ? region.bare
              : yB <= f.firstGlyphY
                ? region.crest
                : inText
                  ? region.column
                  : region.gutter;
            bucket.cells += 1;
            if (out > bucket.outMax) bucket.outMax = out;
            if (out < bucket.outMin) bucket.outMin = out;
            if (hasPhoto && lmax > bucket.srcMax) bucket.srcMax = lmax;

            if (!inText) {
              if (out > apertureOut) apertureOut = out;
              continue;
            }
            if (out > textOut) textOut = out;
            if (out < textOutMin) textOutMin = out;

            for (const { role, rgb, need } of roles) {
              /*
                THE COMPOSITED RESULT, NOT A PROXY. `backdrop` is what a
                sampler that hid the copy would photograph: veil over
                photograph, and nothing the text paints for itself. The glyph
                that lands in this cell also paints its own halo, so the ground
                it is actually seen against is `backdrop` seen THROUGH that
                halo, averaged over the observer beside the stroke. Untreated
                roles get `localGroundLuminance(null, backdrop)`, which is
                `luminance(backdrop)` exactly.
              */
              const tCell = vpTreatments.get(role) ?? null;
              const ratio = contrastToLuminance(rgb, localGroundLuminance(tCell, backdrop));
              const slack = ratio / (need * HEADROOM);
              if (worstCell === null || slack < worstCell.slack) {
                worstCell = {
                  role, need, ratio, slack, lmax, alpha: amin, treated: tCell !== null,
                  x: (xA + xB) / 2, y: (yA + yB) / 2,
                };
              }
            }
          }
        }

        if (worstCell && worstCell.slack < 1) {
          fail(file, `${worstCell.role} fails over this photograph at ${vp.name}`,
            `worst cell is at (${Math.round(worstCell.x)}, ${Math.round(worstCell.y)}) in the ` +
            `band box: brightest source pixel there is L=${worstCell.lmax.toFixed(4)}, the scrim's ` +
            `composite alpha there is ${worstCell.alpha.toFixed(4)}, and ${worstCell.role} over ` +
            `that backdrop is ${worstCell.ratio.toFixed(3)}:1 against ${worstCell.need}:1 ` +
            `x${HEADROOM}`,
            'deepen the veil at that position, grade the source darker, or move the focal ' +
            'point off the bright region. Not: lower the target, widen the tolerance, or ' +
            'shrink TEXT_EXTENT');
        }

        if (worstCell) {
          cells.push({ file: name, vp: vp.name, ...worstCell });
          report.push({
            file: name,
            vp: vp.name,
            worst: worstCell,
            apertureOut,
            textOut,
            textOutMin,
            /* The sRGB byte window the photograph survives into under the
               text. This is the diagnosis, as a number: a 17-level window in
               a 256-level encoding is not a darkened picture, it is one ink
               value with rounding noise on it. */
            textByteLo: Math.round(greyOf(textOutMin)[0]),
            textByteHi: Math.round(greyOf(textOut)[0]),
            screenMax,
            screenSpread: screenMax - screenMin,
            peakL: globalMax,
            /*
              THE SAME WINDOW, PER REGION OF THE BAND — including the regions
              that carry no text, which is where a photograph is SUPPOSED to
              be visible and which no gate here used to look at. `cells` is
              the region's share of the band, so a row reading `bare 35.1%,
              1 of 256 levels` says both halves of the defect at once: how
              much of the hero has no picture, and how much picture survives
              where there is one.
            */
            regions: Object.fromEntries(REGIONS.map((k) => {
              const b = region[k];
              if (b.cells === 0) return [k, null];
              return [k, {
                share: b.cells / (gx * gy),
                byteLo: Math.round(greyOf(b.outMin)[0]),
                byteHi: Math.round(greyOf(b.outMax)[0]),
                srcPeak: b.srcMax,
              }];
            })),
          });
        }
      }
    }
  }

  return {
    failures, notes, report, cells, derived, floors, fields, geometry,
    ground, guaranteedAlpha, bindingFloor, elementOpacity, sawExternalRelay,
    spacingBandMin, spacingBandMax, focal, roles, fieldError,
    treatmentIndex, reaches, anyTreatment, perViewport, collarIndex,
    haloLoadBearing: halolLoadBearing,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   I/O and the CLI
   ════════════════════════════════════════════════════════════════════════════ */

/** Per-pixel relative luminance of an image, plus its dimensions. */
async function decodeLuminance(sharp, file) {
  const { data, info } = await sharp(file).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const lum = new Float32Array(width * height);
  let globalMin = 1;
  let globalMax = 0;
  for (let i = 0, p = 0; p < width * height; p += 1, i += channels) {
    const l = luminance([data[i], data[i + 1], data[i + 2]]);
    lum[p] = l;
    if (l < globalMin) globalMin = l;
    if (l > globalMax) globalMax = l;
  }
  return { lum, width, height, globalMin, globalMax };
}

/**
 * The rungs the page actually serves — read from the generator's own
 * manifest.json when it exists, so this gate measures exactly what
 * <picture> will select and nothing else. A directory scan is the fallback,
 * and it is strictly worse: it also picks up proof sheets and any orphan a
 * previous run left behind, which inflates the report without adding a
 * guarantee.
 */
function collectAssets(manifest) {
  if (manifest && manifest.orientations) {
    if (manifest.present === false) return [];
    const out = [];
    for (const o of Object.values(manifest.orientations)) {
      const wide = typeof o.media === 'string' ? /min-width/.test(o.media) : o.key !== 'p';
      for (const f of o.files ?? []) {
        const p = join(PHOTO_DIR, f.name);
        if (existsSync(p)) out.push({ path: p, wide, declared: { w: f.width, h: f.height } });
      }
    }
    return out;
  }
  if (!existsSync(PHOTO_DIR)) return [];
  return readdirSync(PHOTO_DIR)
    .filter((n) => ['.avif', '.webp', '.png', '.jpg', '.jpeg'].includes(extname(n).toLowerCase()))
    .filter((n) => /^hero-[pl]-\d+\./.test(n))
    .map((n) => ({ path: join(PHOTO_DIR, n), wide: null, declared: null }));
}

const pct = (a) => `${(a * 100).toFixed(1)}%`;

function printReport(r, { quiet = false } = {}) {
  if (quiet) return;
  /* The band's flat ink, as the sRGB grey of the same luminance — which is
     what every byte window below is quoted against. Derived, never typed: a
     legend that disagrees with the numbers under it is worse than no legend. */
  const groundByte = r.ground ? Math.round(greyOf(luminance(r.ground))[0]) : 20;
  console.log('check-hero-contrast — the photographic ground\n');
  if (r.ground) {
    console.log(`  ground            #${r.ground.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`);
  }
  if (r.elementOpacity !== 1) {
    console.log(`  element opacity   ${r.elementOpacity.toFixed(3)}  (folded into the field)`);
  }
  if (r.guaranteedAlpha !== null) {
    console.log(`  field floor       ${pct(r.guaranteedAlpha)}  weakest composite alpha anywhere a glyph can land`);
    if (r.bindingFloor) {
      console.log(`                    binding at ${r.bindingFloor.name} ` +
        `(${Math.round(r.bindingFloor.x)}, ${Math.round(r.bindingFloor.y)}) in the band box`);
    }
  }
  if (r.sawExternalRelay) {
    console.log('  relay             --scrim-base arrives at runtime; every alpha below is the');
    console.log('                    clamp FLOOR — the guarantee, not the likely render.');
  }

  if (r.geometry && r.geometry.some((g) => g.frameH !== null)) {
    console.log('\n  F · COVERAGE — how much of the band has a photograph behind it at all');
    console.log('     band       the hero band\'s box, from TEXT_EXTENT (browser-validated)');
    console.log('     photo      `.frame`\'s resolved block-size, clipped to the band');
    console.log('     bare       band below the photograph: flat --ground, no picture');
    console.log('     seal       composite veil alpha at the photograph\'s last row. Must be');
    console.log('                100% or the picture is cut off mid-frame — check F gates this.');
    console.log('     wasted     rows of photograph ABOVE that edge that are already within');
    console.log('                1 L* of bare ground over a #FFFFFF source pixel: painted,');
    console.log('                decoded, and indistinguishable from flat ink. Reported here,');
    console.log('                gated as presence by scripts/check-hero-blend.mjs.');
    for (const g of r.geometry) {
      if (g.frameH === null) {
        console.log(`     ${g.vp.name.padEnd(10)} band ${String(g.vp.bandH).padStart(5)}px   ` +
          `photo UNRESOLVED (\`${g.expr ?? 'absent'}\`)`);
        continue;
      }
      const f = r.fields.get(g.vp.name);
      const seal = f && f.sealAlphaAtFrameEdge !== undefined
        ? `${(f.sealAlphaAtFrameEdge * 100).toFixed(1)}%`
        : '  n/a';
      const wasted = f && f.deadPhotoPx !== undefined ? `${Math.round(f.deadPhotoPx)}px` : '—';
      console.log(`     ${g.vp.name.padEnd(10)} band ${String(g.vp.bandH).padStart(5)}px   ` +
        `photo ${String(Math.round(g.frameH)).padStart(5)}px = ${pct(g.coverage).padStart(6)}   ` +
        `bare ${String(Math.round(g.bareH)).padStart(4)}px = ${pct(g.bareH / g.vp.bandH).padStart(6)}   ` +
        `seal ${seal}   wasted ${wasted.padStart(5)}`);
    }
    const worstCov = r.geometry.filter((g) => g.coverage !== null)
      .sort((a, b) => a.coverage - b.coverage)[0];
    if (worstCov && worstCov.coverage < 1) {
      console.log(`     ⚠ worst coverage ${pct(worstCov.coverage)} at ${worstCov.vp.name} — ` +
        `${pct(1 - worstCov.coverage)} of that band is flat ink with no photograph in it.`);
      console.log('       Legal only if that is a DESIGNED value. It is currently a consequence of');
      console.log(`       \`${worstCov.expr}\` (viewport units) meeting a band whose height is set by`);
      console.log('       how much copy it carries. scripts/check-hero-blend.mjs gates it.');
    }
  }

  if (r.floors.length) {
    console.log('\n  the alpha field, per viewport');
    console.log('     binding    the tightest role AT THAT VIEWPORT, over a #FFFFFF source pixel');
    console.log('                and through its own treatment if it has one — the per-viewport');
    console.log('                form of check A, which gates only the minimum of this column');
    for (const f of r.floors) {
      const ff = r.fields.get(f.name);
      const clear = ff && ff.clearance !== undefined ? `${ff.clearance.toFixed(0)}px` : '—';
      const b = (r.perViewport ?? []).find((v) => v.name === f.name);
      console.log(`     ${f.name.padEnd(10)} text-region min alpha ${pct(f.a).padStart(6)}  ` +
        `at (${String(Math.round(f.x)).padStart(4)}, ${String(Math.round(f.y)).padStart(4)})  ` +
        `aperture closes ${clear} above the first glyph` +
        (b ? `\n${' '.repeat(16)}binding ${b.role} ${b.ratio.toFixed(3)}:1 / ` +
          `${(b.need * HEADROOM).toFixed(3)} = x${b.slack.toFixed(3)}` +
          `${b.treated ? ' (halo credited)' : ''}` : ''));
    }
  }

  if (r.derived.length) {
    console.log('\n  A · worst case — every role over a #FFFFFF source pixel, x1.05 headroom');
    console.log('     measured against the LOCAL COMPOSITED GROUND: the veil at the field\'s');
    console.log('     weakest text-bearing point, over the brightest source pixel there can be,');
    console.log('     seen through whatever the text paints for itself, averaged over the');
    console.log(`     observer's point spread function (sigma ${OBSERVER_SIGMA_PX}px = 20/40 acuity)`);
    console.log('     beside the stroke. With no treatment that is exactly WCAG against the');
    console.log('     composited backdrop; with one it is NOT the literal 1.4.3 procedure.');
    for (const d of r.derived) {
      const ok = d.actual >= d.need * HEADROOM;
      console.log(`     ${d.role.padEnd(20)} needs ${d.need}:1  alpha >= ${d.required.toFixed(4)}  ` +
        `at field floor ${d.actual.toFixed(3)}:1  ${ok ? 'PASS' : 'FAIL'}` +
        `${d.treated ? `  [halo: ${d.t.selector}]` : ''}`);
    }
  }

  if (r.anyTreatment) {
    console.log('\n  G · PER-GLYPH TREATMENT — the darkening the TEXT pays for, not the band');
    if (r.haloLoadBearing && r.haloLoadBearing.length) {
      console.log('     LOAD-BEARING. Strip the halo and these roles fail at the field floor:');
      for (const h of r.haloLoadBearing) {
        console.log(`       ${h.role.padEnd(20)} ${h.bare.toFixed(3)}:1 bare against ` +
          `${(h.need * HEADROOM).toFixed(3)} — the veil is thinner BECAUSE of the treatment`);
      }
    } else {
      console.log('     not load-bearing: every treated role also passes with the halo stripped,');
      console.log('     so the page\'s published plain-WCAG figures remain true as they stand.');
    }
    console.log('     stem      the MEASURED stem width of that cut at that size (STEM_EM)');
    console.log('     T(edge)   composite treatment alpha at the stroke\'s own edge');
    console.log('     ground    local composited ground over a #FFFFFF source pixel, as the');
    console.log('               single veil alpha that would produce the same luminance');
    console.log('     rim       paint-order stroke width / the cut\'s narrowest counter at that');
    console.log('               size. At 1.00 the counters close and the letterform is gone —');
    console.log('               the ceiling on what a rim can buy, and it is a hard failure.');
    console.log('     reach     distance at which the treatment stops being distinguishable');
    console.log(`               from no treatment at all. Over ${HALO_REACH_EM_MAX}em it is a SHEET and fails.`);
    for (const { vp, role, t } of r.treatmentIndex) {
      const reach = r.reaches.find((x) => x.vp === vp && x.role === role);
      const gY = localGroundLuminance(t, [255, 255, 255]);
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 50; i += 1) {
        const mid = (lo + hi) / 2;
        if (luminance(composite(r.ground ?? [20, 22, 26], mid, [255, 255, 255])) > gY) lo = mid;
        else hi = mid;
      }
      if (t.kind === 'collar') {
        /* A collar has no cut, no size and no rim, so those columns are struck
           through rather than filled with a plausible-looking number. What it
           has instead is the box it is thrown from and which of its two rays
           is the one being credited. */
        console.log(`     ${vp.padEnd(10)} ${role.padEnd(14)} collar/${t.ray.padEnd(7)} ` +
          `box ${t.boxThicknessPx.toFixed(0)}x${t.boxExtentPx.toFixed(0)}px  ` +
          `ink +${t.inkOffsetPx.toFixed(0)}/${t.inkThicknessPx.toFixed(0)}px  ` +
          `T(edge) ${t.sampler(0).a.toFixed(3)}  ground ${pct(hi).padStart(6)}  ` +
          `reach ${reach.reach.toFixed(1)}px / ${COLLAR_REACH_PX_MAX}px`);
        continue;
      }
      console.log(`     ${vp.padEnd(10)} ${role.padEnd(14)} ${t.face}/${t.weight} ` +
        `${t.fontPx.toFixed(1)}px  stem ${t.stemPx.toFixed(2)}px  ` +
        `T(edge) ${t.sampler(0).a.toFixed(3)}  ground ${pct(hi).padStart(6)}  ` +
        `rim ${t.stroke ? `${t.stroke.widthPx.toFixed(1)}/${t.counterPx.toFixed(1)}px = ` +
          `${(t.stroke.widthPx / t.counterPx).toFixed(2)}` : '—'}  ` +
        `reach ${reach.reach.toFixed(1)}px = ${reach.em.toFixed(2)}em`);
    }
  }

  if (r.report.length) {
    console.log('\n  C · measured pixels — the tightest GATED cell per rung x viewport');
    console.log('     src L    source peak luminance (the GRADED rung, not the master)');
    console.log('     cell     the worst gated cell: its source luminance and the veil there');
    console.log('     ratio    the binding role over that cell, against need x' + HEADROOM);
    for (const x of r.report) {
      console.log(`     ${x.file.padEnd(20)} ${x.vp.padEnd(9)} ` +
        `src L ${x.peakL.toFixed(3)}  cell L ${x.worst.lmax.toFixed(3)} a ${x.worst.alpha.toFixed(3)} ` +
        `-> ${x.worst.role} ${x.worst.ratio.toFixed(3)}:1 (needs ${x.worst.need})`);
    }
    console.log('\n  VISIBILITY — what a visitor actually sees, on the same cells. Not gated;');
    console.log('  reported because "it looks like a black rectangle" deserves a number.');
    console.log('     screen peak   luminance of the brightest pixel on screen, 0..1');
    console.log('     aperture      brightest composited cell OUTSIDE the text extent');
    console.log('     under text    the sRGB byte window the picture survives into where the');
    console.log('                   glyphs are. A veil that REPLACES the photograph rather than');
    console.log('                   darkening it collapses this window: every tonal difference');
    console.log('                   in the frame lands on one ink value, which is what reads as');
    console.log(`                   a black rectangle. Flat --ground is byte ${groundByte}.`);
    for (const x of r.report) {
      console.log(`     ${x.file.padEnd(20)} ${x.vp.padEnd(9)} ` +
        `screen peak ${x.screenMax.toFixed(4)}  aperture ${x.apertureOut.toFixed(4)}  ` +
        `under text sRGB ${x.textByteLo}..${x.textByteHi} ` +
        `(${x.textByteHi - x.textByteLo + 1} of 256 levels)`);
    }

    console.log('\n  DYNAMIC RANGE ON SCREEN, PER REGION OF THE BAND. The band is partitioned');
    console.log('  with no gap: crest (above the first glyph) + column (under the text) +');
    console.log('  gutter (the open jambs) + bare (BELOW THE PHOTOGRAPH — no picture exists).');
    console.log('  `share` is the region\'s fraction of the band; the window is the sRGB byte');
    console.log(`  range the picture survives into there. Flat --ground is byte ${groundByte}, so a`);
    console.log('  1-level window means the region is indistinguishable from flat ink.');
    for (const x of r.report) {
      const parts = ['crest', 'column', 'gutter', 'bare'].map((k) => {
        const g = x.regions?.[k];
        if (!g) return `${k} —`;
        const levels = g.byteHi - g.byteLo + 1;
        return `${k} ${(g.share * 100).toFixed(0).padStart(2)}% ${g.byteLo}..${g.byteHi} (${levels}L)`;
      });
      console.log(`     ${x.file.padEnd(20)} ${x.vp.padEnd(9)} ${parts.join('  ')}`);
    }
  }

  if (r.notes.length) {
    console.log('');
    for (const line of r.notes) console.log(`  ${line}`);
  }
}

function printFailures(failures) {
  console.error(`\n${failures.length} failure${failures.length === 1 ? '' : 's'}:\n`);
  for (const f of failures) {
    console.error(`  ${f.where}`);
    console.error(`    ${f.message}`);
    if (f.detail) console.error(`    ${f.detail}`);
    if (f.fix) console.error(`    fix: ${f.fix}`);
    console.error('');
  }
}

/**
 * ── THE NEGATIVE CONTROL ──────────────────────────────────────────────────
 *
 * `--prove` re-runs the entire analysis against a stylesheet whose every alpha
 * has been multiplied by PROVE_FACTOR, and asserts that the run FAILS naming a
 * role and a ratio. A gate that has never failed is a gate nobody has tested,
 * and this one is the only thing standing between two agents deliberately
 * lightening the hero and a page whose published accessibility numbers quietly
 * became false.
 *
 * It touches no file: the weakening is a string transform on the source text
 * held in memory.
 */
const PROVE_FACTOR = 0.9;

/**
 * ── THE SECOND NEGATIVE CONTROL: THE SEAM ─────────────────────────────────
 *
 * Thinning the alphas does not exercise check F, and that is correct rather
 * than a gap in the transform: the dissolve's last stop is a bare
 * `var(--ground)` with no percentage in it, so a veil that is 10% lighter
 * everywhere still seals to exactly opaque at exactly the same row. Check F
 * is about GEOMETRY, and geometry needs its own broken input.
 *
 * This is the defect in its purest form and it is the single most plausible
 * edit anyone will make to this design: `.frame`'s bound is pulled UP, so the
 * photograph stops early, while the veil's dissolve stays where it was. The
 * picture then ends mid-frame at full visibility — a horizontal cut across
 * the photograph at an arbitrary height, which is the class of defect that
 * left 458px of this hero unmeasured in the first place.
 *
 * The edit is made on `.frame`'s block-size WHATEVER FORM IT IS WRITTEN IN,
 * because the point of the control is to exercise the geometry resolver, not
 * to re-encode the shape it currently happens to have. If a future edit makes
 * this transform a no-op the proof reports PROOF FAILED rather than passing
 * quietly, which is the safe direction.
 *
 * A `--prove` run asserts BOTH controls fire. One that could only be shown to
 * catch a thin veil would have been a gate with a proven half.
 */
const PROVE_SEAM_BOUND = '40svh';

function unsealScrim(scrimSrc) {
  return scrimSrc.replace(
    /(\.frame\s*\{[^}]*?\b(?:block-size|height)\s*:\s*)([^;]+)/,
    (_, head) => `${head}${PROVE_SEAM_BOUND}`,
  );
}

/**
 * ── THE THIRD, FOURTH, FIFTH AND SIXTH NEGATIVE CONTROLS: THE HALO ────────
 *
 * The per-glyph machinery cannot be exercised by the two controls above,
 * because the shipped hero declares no treatment: with nothing to weaken,
 * `thinScrim` proves only the veil half of the file and the halo half would
 * ship having never once been run in anger. A gate with an unproven half is
 * exactly the situation the header of this file was written to prevent.
 *
 * So the halo controls SYNTHESISE a page: a scrim thinned to
 * `PROVE_HALO_FLOOR` — which on its own fails the binding role outright — plus
 * a per-glyph treatment on that role strong enough to make up the difference.
 * Six runs, and the whole argument of this round is in them:
 *
 *   POSITIVE   thinned veil + the treatment            must PASS
 *              (so the machinery can distinguish "legible by another means"
 *              from "illegible", rather than failing everything that is not a
 *              sheet, which would be a gate no per-glyph design could pass)
 *   REMOVED    thinned veil, treatment deleted         must FAIL on the role
 *   WEAK       thinned veil, rim below the raster loss must FAIL on the role
 *   SHEET      the treatment blurred until it covers   must FAIL BY NAME on
 *              the column                              the reach test
 *   FAT        the rim widened past the cut's counter  must FAIL BY NAME on
 *                                                      the counter test
 *
 * and a fifth, orthogonal one:
 *
 *   UNDISCLOSED  the positive control with the method marker removed from
 *                app/globals.css  ->  must FAIL, because a page may not
 *                publish a halo-derived ratio while describing it as a plain
 *                WCAG one.
 */
/*
  82% is not arbitrary and it is not a knob. It is a veil at which the binding
  TEXT role still fails on its own — `--fg-muted` needs a composite 0.8595 over
  a white source pixel and an 82% literal delivers 0.8269, giving 4.207:1
  against the 4.725 it owes — while every role a text halo CANNOT help still
  passes. `--fg-accent-display` and
  `--focus-ring` are the constraint from below: they are crimson-lift, their
  contrast against this ground is NON-MONOTONIC in the veil alpha (it dips as
  the backdrop passes through their own luminance and climbs out the other
  side), and they clear 3:1 x1.05 only above a composite 0.8172 — an 81%
  literal. A control thinner than that would fail for a reason that has nothing
  to do with the halo, and a control that "fails" for the wrong reason proves
  nothing. The usable window is therefore [81%, 86%) and 82% sits in it with
  margin at both ends:

      literal   field    --fg-accent-display   --fg-muted (untreated)
        80%     0.8074      3.112  FAIL           3.920  FAIL
        81%     0.8172      3.224  ok             4.062  FAIL
        82%     0.8269      3.339  ok             4.207  FAIL   <- the control
        84%     0.8462      3.580  ok             4.510  FAIL
        86%     0.8656      3.832  ok             4.827  ok     <- shipped
*/
const PROVE_HALO_FLOOR = '82%';
const PROVE_HALO_ROLES = ['--fg-muted', '--fg-pressed'];

/*
  The collar controls' floor, chosen the same way 82% was and for the same
  reason: a control that fails for the wrong reason proves nothing.

  Measured through this gate, the usable window is (0.2253, 0.5116) in
  composite alpha — above --fg-muted's collared requirement so the TEXT cannot
  be what fails, and below --rule's and --focus-ring's BARE requirement so the
  two non-text roles fail without their collar and pass with it:

      literal   --fg-muted (collared)   --rule / --focus-ring (bare)
        23%       0.2253  ok  <- shipped    0.5116  FAIL
        30%       0.2253  ok               0.5116  FAIL
        40%       0.2253  ok               0.5116  FAIL   <- the control
        52%       0.2253  ok               0.5116  ok
*/
const PROVE_COLLAR_FLOOR = '40%';

/**
 * A stylesheet with every per-glyph treatment REMOVED.
 *
 * The controls below are only controls if the page they run against carries no
 * halo except the one they inject. The first time a real treatment landed in
 * hero-scrim.module.css this was not true: REMOVED, SHEET and FAT all inherited
 * the shipped halo, all three passed, and `--prove` correctly reported that the
 * gate had stopped discriminating. That failure is the reason this function
 * exists, and it is worth keeping the story: a control that silently stops
 * controlling is the exact failure mode every gate in this file is written
 * against, and it happened here first.
 *
 * Only the five declarations that MAKE a treatment are removed. The gradients,
 * masks and geometry in the same file are untouched, because the controls are
 * about the halo and the veil has its own two controls above.
 */
/*
  `box-shadow`, `--collar-role` and `--collar-box` are in this list for exactly
  the reason the five above it are, and the reason is the story in the paragraph
  above: the first time a real treatment landed in the shipped stylesheet the
  controls silently inherited it and stopped discriminating. The collar is the
  second time a real treatment has landed. Leaving it out of this regex would
  reproduce that failure precisely — REMOVED, SHEET and FAT would all inherit
  the shipped bar-and-ring collar and all three would pass while proving
  nothing.
*/
function stripTreatments(src) {
  return src.replace(
    /(?:^|;|\{)\s*(?:-webkit-)?(?:text-shadow|text-stroke|text-stroke-width|text-stroke-color|paint-order|box-shadow|--halo-role|--halo-type|--collar-role|--collar-box)\s*:[^;}]*;/gi,
    (m) => (m.trimStart().startsWith('{') ? '{' : ';'),
  );
}

/** The scrim, with its floor literal replaced — the veil the halo has to cover for. */
function withScrimFloor(scrimSrc, floor) {
  return scrimSrc.replace(/(--scrim-floor-min\s*:\s*)[0-9.]+%/, `$1${floor}`);
}

/**
 * A synthetic hero stylesheet carrying a per-glyph treatment on the binding
 * roles. `variant` selects which control this is.
 */
function withSyntheticHalo(heroCss, variant) {
  if (variant === 'removed') return heroCss;
  const strokes = { positive: '6px', weak: '1.6px', sheet: '340px', fat: '16px' };
  const blooms = {
    positive: '0 0 14px color-mix(in srgb, var(--ground) 85%, transparent)',
    weak: '0 0 14px color-mix(in srgb, var(--ground) 85%, transparent)',
    sheet: '0 0 14px color-mix(in srgb, var(--ground) 85%, transparent)',
    fat: '0 0 14px color-mix(in srgb, var(--ground) 85%, transparent)',
  };
  const rules = PROVE_HALO_ROLES.map((role, i) => `
.proofHalo${i} {
  --halo-role: ${role};
  --halo-type: var(--text-stat) 200 display;
  -webkit-text-stroke: ${strokes[variant]} color-mix(in srgb, var(--ground) 100%, transparent);
  paint-order: stroke fill;
  text-shadow: ${blooms[variant]};
}`).join('\n');
  return [...heroCss, { file: join('components', 'site', 'proof-halo.module.css'), src: rules }];
}

/** app/globals.css with the method disclosure present. */
function withDisclosure(globalsSrc) {
  return globalsSrc.includes(CONTRAST_DISCLOSURE)
    ? globalsSrc
    : `/* ${CONTRAST_DISCLOSURE} */\n${globalsSrc}`;
}

/**
 * app/globals.css with the method disclosure REMOVED — the UNDISCLOSED control.
 *
 * THIS FUNCTION IS THE FIX FOR A CONTROL THAT HAD SILENTLY STOPPED
 * CONTROLLING, which is the failure mode this whole section is written against
 * and the second time it has happened here. The UNDISCLOSED run used to be
 * built by simply NOT calling `withDisclosure`, on the assumption that the
 * marker would then be absent. It is not absent: the marker lives in a COMMENT
 * in the shipped app/globals.css, `stripTreatments` removes declarations and
 * not comments, so the "undisclosed" page arrived at the gate still carrying
 * the disclosure and passed for that reason rather than because the gate was
 * failing to notice an undisclosed halo. `--prove` reported PROOF FAILED, and
 * correctly — the control could not fail.
 *
 * Removing the marker is therefore an explicit operation, and it asserts that
 * it actually removed something, because a control that cannot be shown to
 * have modified its input is the same defect one layer further out.
 */
function withoutDisclosure(globalsSrc) {
  const out = globalsSrc.split(CONTRAST_DISCLOSURE).join('CONTRAST-METHOD: (removed by --prove)');
  if (out === globalsSrc && globalsSrc.includes(CONTRAST_DISCLOSURE)) {
    throw new Error('check-hero-contrast --prove: the UNDISCLOSED control could not remove the '
      + 'disclosure marker from app/globals.css, so it would have tested nothing.');
  }
  return out;
}

function thinScrim(scrimSrc) {
  // Every percentage that sits in an alpha position: the `--scrim-*-min`
  // literals and any bare `N%` inside a color-mix's first component.
  return scrimSrc
    .replace(/(--scrim-[a-z-]*(?:min|rest|crest|floor|pocket-a|field-a)[a-z-]*\s*:\s*)([0-9.]+)%/gi,
      (_, head, n) => `${head}${(parseFloat(n) * PROVE_FACTOR).toFixed(3)}%`)
    .replace(/(color-mix\(in srgb,\s*[^,]*?\s)([0-9.]+)%/gi,
      (_, head, n) => `${head}${(parseFloat(n) * PROVE_FACTOR).toFixed(3)}%`)
    .replace(/(rgb\([^)]*\/\s*)([0-9.]+)%/gi,
      (_, head, n) => `${head}${(parseFloat(n) * PROVE_FACTOR).toFixed(3)}%`);
}

async function main() {
  const argv = process.argv.slice(2);
  const prove = argv.includes('--prove');

  /*
    `--emit-extent` prints TEXT_EXTENT as JSON and exits.
    tests/e2e/hero-contrast.spec.ts reads it through this flag rather than by
    importing this module, so the browser gate depends on ONE stable interface
    instead of on Playwright's TS/ESM interop — and so the two gates cannot
    drift into holding two different copies of the same table.
  */
  /*
    `--emit-type` prints the ONE assumption the per-glyph machinery rests on
    that this file cannot check for itself: that the stem widths in STEM_EM are
    the stem widths the browser rasterises, and that `--halo-type` names the
    cut a role is actually set in.

    TEXT_EXTENT has exactly this shape of risk and it is handled exactly this
    way — declared here, proved in Chromium by tests/e2e/hero-contrast.spec.ts,
    read across the boundary through a flag rather than an import. A browser
    gate that renders each treated selector, measures its computed font-size,
    weight and family and its real stem by coverage integral, and fails on a
    disagreement with this output, closes the last hole in the chain. Until it
    exists, the stem table is a MEASUREMENT that nothing re-measures, and this
    comment is the place that says so.
  */
  if (argv.includes('--emit-type')) {
    process.stdout.write(JSON.stringify({
      observerSigmaPx: OBSERVER_SIGMA_PX,
      shadowSigmaPerBlur: SHADOW_SIGMA_PER_BLUR,
      shadowCredit: SHADOW_CREDIT,
      strokeRasterLossPx: STROKE_RASTER_LOSS_PX,
      capHeightEm: CAP_HEIGHT_EM,
      haloReachEmMax: HALO_REACH_EM_MAX,
      disclosure: CONTRAST_DISCLOSURE,
      stemEm: STEM_EM,
    }, null, 2));
    return;
  }

  if (argv.includes('--emit-extent')) {
    process.stdout.write(JSON.stringify({
      margin: EXTENT_MARGIN,
      rows: TEXT_EXTENT,
      inflated: TEXT_EXTENT.map((r) => ({ w: r.w, ...textExtentFor(r.w) })),
    }, null, 2));
    return;
  }

  if (!existsSync(GLOBALS)) {
    console.error(`check-hero-contrast: ${GLOBALS} not found — run from the repo root.`);
    process.exit(2);
  }
  if (!existsSync(SCRIM)) {
    console.error(`check-hero-contrast: ${SCRIM} not found.`);
    process.exit(2);
  }

  const globalsSrc = readFileSync(GLOBALS, 'utf8');
  const scrimSrc = readFileSync(SCRIM, 'utf8');
  const heroSrc = existsSync(HERO_TSX) ? readFileSync(HERO_TSX, 'utf8') : null;
  /* The hero's own type styles — where a per-glyph treatment naturally lives.
     Read, never assumed: a halo declared in a file this gate does not open is
     a halo it would silently fail to credit, and the first thing that happens
     then is that somebody thins the veil to compensate. */
  const heroCss = [];
  {
    const seen = new Set();
    const add = (file) => {
      if (seen.has(file) || !existsSync(file)) return;
      seen.add(file);
      heroCss.push({ file, src: readFileSync(file, 'utf8') });
    };
    add(HERO_CSS);
    /* Whatever else the component imports — read from the component, so a
       stylesheet split out tomorrow is inside this gate's window today. */
    for (const m of (heroSrc ?? '').matchAll(/from\s+'(\.[^']*\.module\.css)'/g)) {
      add(join('components', 'site', basename(m[1])));
    }
  }

  let manifest = null;
  const manifestPath = join(PHOTO_DIR, 'manifest.json');
  let manifestError = null;
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      manifestError = String(err && err.message ? err.message : err);
    }
  }

  const sourceFile = SOURCE_EXTS.map((e) => SOURCE_STEM + e).find((p) => existsSync(p)) ?? null;
  const assets = collectAssets(manifest);

  let sharp = null;
  if (assets.length > 0 || sourceFile !== null) {
    try {
      ({ default: sharp } = await import('sharp'));
    } catch {
      sharp = null;
    }
  }

  // Decode once; both the real run and the --prove run reuse the pixels.
  if (sharp) {
    for (const a of assets) {
      try {
        a.pixels = await decodeLuminance(sharp, a.path);
      } catch (err) {
        a.pixels = null;
        a.decodeError = String(err && err.message ? err.message : err);
      }
    }
  }

  const input = { globalsSrc, scrimSrc, heroSrc, heroCss, assets, manifest, sourceFile, sharp };
  const result = analyse(input);

  /*
    `--emit-collar` prints every collar this gate CREDITED, as JSON, so
    tests/e2e/hero-contrast.spec.ts can hold Chromium to it.

    IT IS THE MOST IMPORTANT OF THE THREE EMIT FLAGS, because a collar is the
    first thing this gate credits that it cannot verify from the text it reads.
    A halo is attributed to a role and the role's colour is in the palette; a
    collar is attributed to a SELECTOR, and a selector that matches nothing in
    the DOM is worse than no collar at all — it is a credit taken against paint
    that reaches no pixel. The node gate reads text and text can lie about the
    DOM. So the browser gate asserts the element exists, that it is reachable by
    keyboard where the selector says `:focus-visible`, that its background is
    transparent where the inward ray assumes photograph, and that
    `getComputedStyle().boxShadow` — the CASCADE's answer, not the file's —
    still carries every credited layer at or above the credited blur and spread.

    Same boundary discipline as `--emit-extent` and `--emit-type`: a flag, not
    an import, so the two gates cannot drift into two copies of one table.
  */
  if (argv.includes('--emit-collar')) {
    process.stdout.write(JSON.stringify({
      boxShadowCredit: BOX_SHADOW_CREDIT,
      collarReachPxMax: COLLAR_REACH_PX_MAX,
      collarRoles: [...COLLAR_ROLES],
      collars: (result.collarIndex ?? []).map((c) => ({
        selector: c.t.selector,
        file: c.t.file,
        role: c.role,
        viewport: c.vp,
        ray: c.t.ray,
        layers: c.t.layers.map((l) => ({
          offsetPx: l.offsetPx,
          blurPx: l.blurPx,
          spreadPx: l.spreadPx,
          rgb: l.rgb,
          alpha: l.alpha,
          source: l.source,
        })),
        boxThicknessPx: c.t.boxThicknessPx,
        boxExtentPx: c.t.boxExtentPx,
        inkOffsetPx: c.t.inkOffsetPx,
        inkThicknessPx: c.t.inkThicknessPx,
        localGroundLuminanceOverWhite: localGroundLuminance(c.t, WHITE_SRC),
      })),
    }, null, 2));
    return;
  }

  if (manifestError) {
    result.failures.unshift({
      where: manifestPath,
      message: 'is not readable JSON',
      detail: manifestError,
      fix: 're-run scripts/gen-hero-photo.mjs',
    });
  }
  for (const a of assets) {
    if (a.decodeError) {
      result.failures.push({
        where: a.path,
        message: 'could not be decoded',
        detail: a.decodeError,
        fix: 'regenerate the hero assets, or remove the unreadable file',
      });
    }
  }

  printReport(result);

  if (prove) {
    console.log('\n  ── NEGATIVE CONTROL ────────────────────────────────────────────────');
    console.log(`  Re-running the whole analysis with every scrim alpha x${PROVE_FACTOR}.`);
    console.log('  A gate that has never failed is a gate nobody has tested.\n');
    const weak = analyse({ ...input, scrimSrc: thinScrim(scrimSrc) });
    if (weak.failures.length === 0) {
      console.error('  PROOF FAILED: the thinned scrim passed.');
      console.error('  This gate is VACUOUS — it cannot distinguish the shipped veil from one');
      console.error(`  that is ${((1 - PROVE_FACTOR) * 100).toFixed(0)}% lighter. Do not trust a green run until this prints failures.`);
      process.exit(1);
    }
    console.log(`  the thinned scrim produces ${weak.failures.length} failure(s); the first three:\n`);
    for (const f of weak.failures.slice(0, 3)) {
      console.log(`    ${f.where}`);
      console.log(`      ${f.message}`);
      if (f.detail) console.log(`      ${f.detail}`);
    }

    console.log(`\n  Re-running with \`.frame\` bounded to ${PROVE_SEAM_BOUND} while the veil's dissolve stays`);
    console.log('  where it is — the seam check F exists for.\n');
    const seam = analyse({ ...input, scrimSrc: unsealScrim(scrimSrc) });
    const seamHits = seam.failures.filter((f) => /ends inside the band/.test(f.message));
    if (seamHits.length === 0) {
      console.error('  PROOF FAILED: a photograph cut off mid-frame passed.');
      console.error('  Check F is VACUOUS — it cannot see a photograph that stops while it is');
      console.error('  still visible, which is the whole defect it was written for.');
      process.exit(1);
    }
    console.log(`  the unsealed scrim produces ${seamHits.length} coverage failure(s); the first:\n`);
    console.log(`    ${seamHits[0].where}`);
    console.log(`      ${seamHits[0].message}`);
    if (seamHits[0].detail) console.log(`      ${seamHits[0].detail}`);

    /* ── THE HALO CONTROLS ────────────────────────────────────────────── */
    console.log(`\n  ── PER-GLYPH CONTROLS ─────────────────────────────────────────────`);
    console.log(`  A synthetic page: the veil thinned to ${PROVE_HALO_FLOOR} (which alone fails the binding`);
    console.log(`  role) plus a treatment on ${PROVE_HALO_ROLES.join(' and ')}. Six runs.\n`);

    /* One rung per orientation. The halo controls exercise checks A, G and the
       disclosure gate; check C is already proven twice over by the shipped run
       above and by the thinned scrim, and sweeping twelve rungs five more times
       costs a minute of wall clock to re-prove something that is not in
       question. The rungs are kept rather than dropped so the controls still
       run the whole pipeline end to end. */
    const proofAssets = [
      assets.find((a) => a.wide === false && a.pixels),
      assets.find((a) => a.wide === true && a.pixels),
    ].filter(Boolean);

    /* Every real treatment is stripped first — see stripTreatments. */
    const bareScrim = stripTreatments(scrimSrc);
    const bareHeroCss = heroCss.map((c) => ({ ...c, src: stripTreatments(c.src) }));
    const bareGlobals = stripTreatments(globalsSrc);

    const haloInput = (variant, { disclose = true } = {}) => ({
      ...input,
      assets: proofAssets,
      globalsSrc: disclose ? withDisclosure(bareGlobals) : withoutDisclosure(bareGlobals),
      scrimSrc: withScrimFloor(bareScrim, PROVE_HALO_FLOOR),
      heroCss: withSyntheticHalo(bareHeroCss, variant),
    });

    const scoreOf = (res) => {
      const row = res.derived.find((d) => d.role === PROVE_HALO_ROLES[0]);
      const reach = res.reaches && res.reaches.length ? res.reaches[0] : null;
      return `${PROVE_HALO_ROLES[0]} ${row ? `${row.actual.toFixed(3)}:1 (needs ${(row.need * HEADROOM).toFixed(3)})` : 'n/a'}` +
        `${reach ? `, reach ${reach.reach.toFixed(1)}px = ${reach.em.toFixed(2)}em` : ', no treatment'}` +
        `, ${res.failures.length} failure(s)`;
    };

    const positive = analyse(haloInput('positive'));
    const removed = analyse(haloInput('removed'));
    const feeble = analyse(haloInput('weak'));
    const sheet = analyse(haloInput('sheet'));
    const fat = analyse(haloInput('fat'));
    const undisclosed = analyse(haloInput('positive', { disclose: false }));

    console.log(`    POSITIVE     ${scoreOf(positive)}`);
    console.log(`    REMOVED      ${scoreOf(removed)}`);
    console.log(`    WEAK         ${scoreOf(feeble)}`);
    console.log(`    SHEET        ${scoreOf(sheet)}`);
    console.log(`    FAT          ${scoreOf(fat)}`);
    console.log(`    UNDISCLOSED  ${scoreOf(undisclosed)}`);

    const bindsOn = (res) => res.failures.some((f) => new RegExp(PROVE_HALO_ROLES[0]).test(`${f.message} ${f.detail}`));
    const problems = [];
    if (positive.failures.length !== 0) {
      problems.push(`POSITIVE control FAILED (${positive.failures.length}): "${positive.failures[0].message}". ` +
        'A gate that cannot pass a legible per-glyph design is a gate that forces the sheet ' +
        'back, which is the whole thing this round exists to stop.');
    }
    if (!bindsOn(removed)) {
      problems.push('REMOVED control PASSED: the same thinned veil with NO treatment at all was ' +
        'accepted. The gate is crediting something other than the halo, or the halo is not ' +
        'load-bearing in the positive control — either way the positive result means nothing.');
    }
    if (!bindsOn(feeble)) {
      problems.push('WEAK control PASSED: a rim thinner than the measured raster loss — which ' +
        'delivers nothing at all on screen — was credited.');
    }
    const sheetHits = sheet.failures.filter((f) => /sheet in disguise/.test(f.message));
    if (sheetHits.length === 0) {
      problems.push('SHEET control was not DETECTED: a treatment whose darkening reaches across ' +
        'the whole column was not reported as a sheet. The owner is rejecting sheets ' +
        'explicitly; a gate that cannot tell one from a halo licenses the next one.');
    }
    const fatHits = fat.failures.filter((f) => /closes the letterform's counters/.test(f.message));
    if (fatHits.length === 0) {
      problems.push('FAT control PASSED: a rim wider than the cut\'s own counter — which fills the ' +
        'bowls and turns the type into blobs — was credited on the strength of the contrast ' +
        'ratio it produces. A rim is the strongest technique here and nothing in a contrast ' +
        'number stops it growing; the counter is what stops it.');
    }
    const disclosureHits = undisclosed.failures.filter((f) => /does not disclose/.test(f.message));
    if (disclosureHits.length === 0) {
      problems.push('UNDISCLOSED control PASSED: a halo-derived ratio was credited on a page that ' +
        'still describes its numbers as plain WCAG ratios.');
    }

    if (problems.length) {
      console.error('\n  PROOF FAILED — the per-glyph measurement does not discriminate:\n');
      for (const pr of problems) console.error(`    ${pr}\n`);
      process.exit(1);
    }
    console.log(`\n    REMOVED binds on ${PROVE_HALO_ROLES[0]}: "${removed.failures.find((f) => new RegExp(PROVE_HALO_ROLES[0]).test(`${f.message} ${f.detail}`)).message}"`);
    console.log(`    SHEET  detected: "${sheetHits[0].message}"`);
    for (const line of sheetHits[0].detail.replace(/\s+/g, ' ').match(/.{1,86}(\s|$)/g) ?? []) {
      console.log(`               ${line.trim()}`);
    }
    console.log(`    FAT    detected: "${fatHits[0].message}"`);
    console.log(`    UNDISCLOSED: "${disclosureHits[0].message}"`);

    /*
      ── THE COLLAR CONTROLS ──────────────────────────────────────────────

      The box-shadow collar is a code path with the same problem the halo had
      before the six runs above existed: it can only be shown to work by
      showing it FAILS when the paint is gone. And it needs its own controls
      rather than a seventh halo variant, because the halo controls run at an
      82% floor where the two non-text roles pass with or without a collar —
      a floor that cannot distinguish them proves nothing about them.

      SO THE FLOOR IS 40%, AND IT IS PICKED THE SAME WAY 82% WAS. Measured
      through this gate: --fg-muted needs 0.2253 collared, so at 40% the TEXT
      still passes and cannot be the thing that fails; --rule and --focus-ring
      need 0.5116 BARE, so at 40% they fail outright without their collar and
      pass with it (0.0489 and 0.0000). The window is therefore (0.2253,
      0.5116) in composite alpha and 40% sits near the middle of it, which
      means a control that fails does so for the collar's reason and no other.

        POSITIVE      thin veil + the shipped collar   must PASS
        REMOVED       collar declarations stripped     must FAIL on --rule
        UNATTRIBUTED  --collar-role kept, box-shadow   must FAIL BY NAME (S1)
                      deleted
        INSET         an `inset` layer added           must FAIL BY NAME (S2)
        SHEET         spreads blown out to 340px       must FAIL BY NAME on
                                                       the reach test
    */
    console.log('\n  ── COLLAR CONTROLS ────────────────────────────────────────────────');
    console.log('  A synthetic page: the veil thinned to 40%, which alone fails the two');
    console.log('  non-text roles (0.5116 bare) while leaving the text passing. Five runs.\n');

    /* The mutation is applied to EVERY hero stylesheet, not just to `scrimSrc`.
       hero.tsx imports the scrim, so `heroCss` carries a second copy of the
       same file; a control that mutated only one of them would be testing a
       page that still had the collar in it. `analyse` dedupes by file so the
       mutated `scrimSrc` is the copy that is read, and mutating both is the
       belt to that braces. */
    const collarInput = (mutate) => ({
      ...input,
      assets: proofAssets,
      scrimSrc: withScrimFloor(mutate(scrimSrc), PROVE_COLLAR_FLOOR),
      heroCss: heroCss.map((c) => ({ ...c, src: withScrimFloor(mutate(c.src), PROVE_COLLAR_FLOOR) })),
    });
    const cPositive = analyse(collarInput((s) => s));
    const cRemoved = analyse(collarInput(stripTreatments));
    const cUnattributed = analyse(collarInput((s) => s.replace(
      /(--collar-role\s*:[^;]*;)([\s\S]*?)box-shadow\s*:[^;]*;/g, '$1$2')));
    const cInset = analyse(collarInput((s) => s.replace(
      /(--collar-role\s*:[^;]*;[\s\S]*?box-shadow\s*:\s*)/g, '$1inset ')));
    const cSheet = analyse(collarInput((s) => s.replace(
      /(--collar-role\s*:[^;]*;[\s\S]*?box-shadow\s*:)([^;]*);/g,
      (_, head, layers) => `${head}${layers.replace(/(\d[\d.]*)px(\s+var\(--ground\))/g, '340px$2')};`)));

    const collarScore = (res) => {
      const rows = ['--rule', '--focus-ring']
        .map((role) => {
          const d = res.derived.find((x) => x.role === role);
          return `${role} ${d ? `${d.actual.toFixed(2)}:1${d.treated ? ` [${d.t.selector}]` : ' bare'}` : 'n/a'}`;
        }).join('  ');
      /* The field floor is printed because it is the thing that has to be the
         same across all five runs for the comparison to mean anything: these
         controls vary the COLLAR, and a variant that also moved the veil would
         be answering a different question. */
      return `field ${res.guaranteedAlpha === null ? 'n/a' : pct(res.guaranteedAlpha)}  ${rows}, `
        + `${res.failures.length} failure(s)`;
    };
    console.log(`    POSITIVE      ${collarScore(cPositive)}`);
    console.log(`    REMOVED       ${collarScore(cRemoved)}`);
    console.log(`    UNATTRIBUTED  ${collarScore(cUnattributed)}`);
    console.log(`    INSET         ${collarScore(cInset)}`);
    console.log(`    SHEET         ${collarScore(cSheet)}`);

    const cProblems = [];
    const hits = (res, re) => res.failures.filter((f) => re.test(`${f.message} ${f.detail}`));
    if (cPositive.failures.length !== 0) {
      cProblems.push(`COLLAR POSITIVE control FAILED (${cPositive.failures.length}): `
        + `"${cPositive.failures[0].message}". At ${PROVE_COLLAR_FLOOR} the collar is supposed to `
        + 'carry both non-text roles on its own; if it cannot, the credit this round takes is '
        + 'not the credit this gate measures.');
    }
    if (hits(cRemoved, /--rule|--focus-ring/).length === 0) {
      cProblems.push('COLLAR REMOVED control PASSED: the same thinned veil with NO box-shadow at '
        + 'all was accepted. The gate is crediting something other than the collar, or the collar '
        + 'is not load-bearing in the positive control — either way the positive result means '
        + 'nothing. This is the exact failure stripTreatments was extended to prevent.');
    }
    if (hits(cUnattributed, /cannot attribute/).length === 0) {
      cProblems.push('COLLAR UNATTRIBUTED control PASSED: a --collar-role left behind with no '
        + 'box-shadow in the same block was not reported. That is a credit claimed for paint '
        + 'that is not there, and it is the shape a half-finished deletion leaves.');
    }
    if (hits(cInset, /inset/).length === 0) {
      cProblems.push('COLLAR INSET control PASSED: an inset layer was credited. An inset shadow '
        + 'paints inside the padding box and darkens nothing beside the ink, so crediting one is '
        + 'crediting paint that reaches no pixel the reader is looking at.');
    }
    if (hits(cSheet, /sheet in disguise/).length === 0) {
      cProblems.push('COLLAR SHEET control was not DETECTED: a 340px spread — a pad covering the '
        + 'whole column — was not reported as a sheet. The owner is rejecting sheets explicitly, '
        + 'and spread is the cheapest way to draw one.');
    }
    if (cProblems.length) {
      console.error('\n  PROOF FAILED — the collar measurement does not discriminate:\n');
      for (const pr of cProblems) console.error(`    ${pr}\n`);
      process.exit(1);
    }
    console.log(`\n    REMOVED binds: "${hits(cRemoved, /--rule|--focus-ring/)[0].message}"`);
    console.log(`    UNATTRIBUTED:  "${hits(cUnattributed, /cannot attribute/)[0].detail.slice(0, 96)}"`);
    console.log(`    INSET:         "${hits(cInset, /inset/)[0].detail.slice(0, 96)}"`);
    console.log(`    SHEET:         "${hits(cSheet, /sheet in disguise/)[0].message}"`);

    console.log('\n  PROOF OK — the gate discriminates on depth, on geometry, and on the');
    console.log('  per-glyph treatment: it passes a halo that works, fails one that is absent');
    console.log('  or too weak, names one that is a sheet and one that has eaten the letterform,');
    console.log('  and refuses to credit any of them on a page that has not disclosed the method.');
    console.log('  It does the same for the collar: it passes the shipped bar and ring, fails');
    console.log('  them when the box-shadow is gone, names a claim with no paint under it, names');
    console.log('  an inset layer, and names a spread wide enough to be a sheet.');
    console.log('  The shipped scrim result stands above.');
  }

  if (result.failures.length) {
    printFailures(result.failures);
    process.exit(1);
  }

  console.log('\n  OK\n');
}

/* Importable for its constants (tests/e2e/hero-contrast.spec.ts reads
   TEXT_EXTENT and proves it against real glyph rectangles), executable as a
   gate. Only the second path runs the analysis. */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}

export { analyse, luminance, contrast, composite, minAlpha, fileURLToPath };
