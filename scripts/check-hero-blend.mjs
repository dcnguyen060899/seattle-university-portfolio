#!/usr/bin/env node
/**
 * check-hero-blend — "IS THERE A VISIBLE BOX ON THE PHOTOGRAPH?", AS NUMBERS.
 *
 * FOUR PROPERTIES, EACH ANSWERING A DIFFERENT HALF OF ONE COMPLAINT:
 *
 *   EDGE       no luminance step steeper than one JND per 6 CSS px
 *   SALIENCE   no visual channel may RESOLVE a feature in the veil at all
 *   ENCLOSURE  and nothing resolvable may CLOSE INSIDE the picture
 *   PRESENCE   and there must still be a photograph under it
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── ROUND SIX'S FINDING, WHICH IS ABOUT THE METRICS AND NOT ABOUT THE PAGE ─
 *
 * Every MAGNITUDE metric in this file — the original EDGE and the SALIENCE
 * added in round six — ranks the reference WORSE than the page the owner is
 * complaining about. Measured, both heroes in the same harness, over the same
 * flat field, at their own geometries:
 *
 *                       375     768    1280    1600
 *     EDGE     this     1.23    1.09    2.45    2.36
 *              MAVTERRAS 2.79   1.47    1.56    1.41
 *     SALIENCE this     1.44    1.17    3.86    3.40
 *              MAVTERRAS 4.06   2.77    3.44    2.70
 *
 * At 375 and 768 THE PAGE HE DISLIKES SCORES TWO TO THREE TIMES BETTER THAN
 * THE PAGE HE CALLS ELEGANT, on both. At 1280 and 1600 it is worse by 12% and
 * 26% — inside the noise of "which hero is this". No threshold placed on
 * either number separates them, and moving a threshold until it does would be
 * fitting a constant to a conclusion.
 *
 * SO THE MAGNITUDE OF THE STRONGEST LUMINANCE FEATURE IS NOT THE PROPERTY THE
 * OWNER IS RESPONDING TO. Four rounds were spent shrinking that number.
 *
 * What DOES separate them is what SHAPE the resolvable feature has, and the
 * instrument now says it in words. Largest above-threshold component, at the
 * channel where each hero peaks:
 *
 *     this  1280   AN ENCLOSED ISLAND — a shape laid on the picture
 *                  1216x704 px at (32, 64), 13% filled, touching NO border
 *     this  1600   AN ENCLOSED ISLAND — 1424x112 at (96, 80), touching none
 *     MAVTERRAS 1280   a band across the full width — the shape a sky makes
 *                  1264x208 at (0, 112), touching two borders
 *     MAVTERRAS 1600   a band across the full width, touching two borders
 *
 * A 1216x704 outline that is 13% filled and touches no edge of the frame IS A
 * RECTANGLE DRAWN AROUND THE TEXT. That is the defect, in the gate's own
 * output, for the first time in six rounds. And the number that carries it —
 * ENCLOSURE — is 3.86 against the reference's 1.49 at 1280 and 3.40 against
 * 1.63 at 1600: the only figure in this file that is worse for this page at
 * every viewport where the owner can see the problem.
 *
 * WHY A PHOTOGRAPH'S OWN SHADING NEVER CLOSES. Skies, vignettes and floors all
 * run off the edge of the crop; the picture is a window and the shading
 * continues out of it. A pocket bounded to the page measure closes, inside the
 * picture, around the copy. Nothing in the photographic world makes a closed
 * luminance loop with straight sides, so the only available reading of one is
 * that it was LAID ON the picture — which is the sentence the owner keeps
 * writing.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Wire into package.json:
 *   "check:blend": "node scripts/check-hero-blend.mjs"
 *   "verify": "... && npm run check:hero && npm run check:blend && ..."
 *
 * Modes:
 *   node scripts/check-hero-blend.mjs                 the gate (no server needed)
 *   node scripts/check-hero-blend.mjs --page <url>    the gate, against the real page
 *   node scripts/check-hero-blend.mjs --calibrate     prove the instrument, both ways
 *   node scripts/check-hero-blend.mjs --json          machine-readable, for the spec
 *   node scripts/check-hero-blend.mjs --shots <dir>   write the flat-field renders out
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * "It looks like a black box pasted on top of the photograph" has been fixed
 * by eye twice in this project and has come back both times, because nothing
 * in the repository could tell the difference between a veil that DARKENS the
 * picture and a veil that has a BOUNDARY in it. scripts/check-hero-contrast.mjs
 * measures the first — the alpha field, everywhere a glyph can land — and is
 * blind to the second by construction: a hard-edged plate and a soft radial
 * pocket of the same depth are the same number to it, and only one of them
 * looks like a rectangle.
 *
 * The owner's complaint is not about darkness. It is about an EDGE:
 *
 *     "it doesn't feel like it blend in the background image, it feel like it
 *      just cut of overlap on top the background image in the back ... look
 *      square over"
 *
 * An edge is a SPATIAL-DERIVATIVE property of the rendered pixels, so it is
 * measurable, and once it is measured this class of defect stops recurring.
 * That is the whole of this file's job.
 *
 * ── THE MEASUREMENT, AND WHY IT IS DONE OVER A FLAT FIELD ─────────────────
 *
 * The naive instrument — screenshot the hero, run an edge detector — cannot
 * work. A photograph is FULL of legitimate edges: a library facade against the
 * sky is a genuine step of forty L* units, and no threshold separates it from
 * the scrim's own boundary. Differencing a scrimmed against an unscrimmed
 * render is better but still couples the answer to one photograph.
 *
 * So the veil is rendered OVER A FLAT NEUTRAL FIELD, with the hero's text and
 * controls made invisible. Every gradient in the resulting image belongs to
 * the scrim and to nothing else. The measurement is then deterministic, needs
 * no photograph on disk, and isolates exactly the thing under test.
 *
 *   THE FIELD IS sRGB 128, AND THAT NUMBER IS NOT TASTE. The visibility of a
 *   veil's edge scales with the brightness of what is behind it: over black
 *   there is nothing to see, over white it is at its worst. 128 is chosen
 *   because it sits at roughly the 92nd percentile of the shipped rungs'
 *   actual luminance (measured, printed on every run — see `describeField`):
 *   the gate judges the edge over a backdrop brighter than about nine tenths
 *   of the real photograph, without pretending the hero is set on paper.
 *   Raising it to 255 would be "worst case" in the same sense that assuming
 *   every pixel is a specular highlight is worst case — and it would make the
 *   threshold below unreachable for ANY veil that darkens at all, which is how
 *   a gate gets argued away.
 *
 * ── THE THRESHOLD, DERIVED RATHER THAN CHOSEN ────────────────────────────
 *
 * Three published constants and one piece of arithmetic. Every step is written
 * out because a threshold nobody can defend is a threshold that gets tuned.
 *
 *   1. THE PIXEL'S ANGULAR SIZE. The CSS reference pixel is DEFINED by visual
 *      angle: 1/96 inch at arm's length, 28 inches. That is
 *          arctan(1 / (96 x 28)) = arctan(3.720e-4) = 0.02131 degrees,
 *      so ONE DEGREE OF VISUAL ANGLE = 46.93 CSS PIXELS.
 *      This is why the gate can use one threshold for a 375px phone and a
 *      1600px desktop: the CSS pixel already normalises viewing distance and
 *      device density. It is the reason the unit exists.
 *      (CSS Values and Units, "the reference pixel".)
 *
 *   2. THE SCALE AT WHICH AN EDGE IS SEEN. Human contrast sensitivity peaks
 *      near 4 cycles per degree. A single light-to-dark transition at that
 *      peak occupies a half cycle, 1/8 of a degree:
 *          46.93 / 8 = 5.87 -> EDGE_WINDOW_PX = 6 CSS pixels.
 *      A luminance change spread over MORE than this reads as shading; the
 *      same change packed into LESS of it reads as a line. This is the whole
 *      difference between "the picture darkens toward the text" and "there is
 *      a black rectangle on the picture".
 *
 *   3. HOW MUCH CHANGE IS VISIBLE. CIE L* is built so that one unit is about
 *      one just-noticeable difference between adjacent large fields
 *      (dE*ab = 1). So JND_LSTAR = 1.0.
 *
 *   THE GATE: at no point in the frame may L* change by more than 1.0 across
 *   a 6-CSS-pixel window.
 *
 *      equivalently   0.167 L* per CSS pixel
 *      equivalently   7.8 L* per degree of visual angle
 *
 *   Everything is measured in CIE L* rather than in sRGB code values or in
 *   relative luminance, because only L* makes "the same number means the same
 *   visibility" true at both ends of the range. A step of 8 code values is
 *   glaring at sRGB 20 and invisible at sRGB 240; in L* it is one number.
 *
 * ── WHAT THE THRESHOLD SEPARATES, RE-CHECKED AGAINST THE REAL REFERENCE ───
 *
 * A threshold is only worth having if the two things it must distinguish land
 * on opposite sides of it, and `--calibrate` renders them and asserts it. On
 * the sRGB 128 field, at all four viewports:
 *
 *   a hard-edged plate, the defect in its purest form
 *       42.58 L* across 6px            FAILS, 42.6x over
 *
 *   a HAND-SHAPED soft radial, written here to be smooth
 *       0.52 .. 0.63 L* across 6px     PASSES, ~1.6x..1.9x margin
 *
 *   this page's shipped scrim
 *       1.18 .. 3.07 L* across 6px     FAILS, 1.2x .. 3.1x over
 *
 *   ⚠ MAVTERRAS ITSELF, PORTED VERBATIM AND RENDERED AT ITS OWN 100svh
 *     GEOMETRY — the page the owner points at and calls elegant
 *       1.41 .. 2.79 L* across 6px     FAILS, 1.4x .. 2.8x over
 *
 * THAT LAST ROW IS THE FINDING, AND IT WAS NOT KNOWN WHEN THIS THRESHOLD WAS
 * ADOPTED. The `soft` synthetic above is not the reference — it is a shape
 * written in this file to be smooth, and it passing was evidence about this
 * file rather than about MAVTERRAS. Measured properly, the reference's own
 * veil overlaps the shipped scrim's range: 1.41..2.79 against 1.18..3.07.
 *
 * So the edge budget does not separate the page the owner dislikes from the
 * page he likes. Both fail it. Whatever the difference between those two
 * heroes is, THIS METRIC IS NOT MEASURING IT — and the metric that does is
 * PRESENCE, where they are 39.7%..65.7% against 100.0%, with no overlap at
 * all.
 *
 * ── WHAT THAT DOES AND DOES NOT LICENCE ──────────────────────────────────
 *
 * It does NOT licence moving MAX_WINDOW_DELTA_LSTAR. The derivation from
 * dE*ab = 1 is sound for what it measures — a STEP between two adjacent large
 * uniform fields — and no measurement here produces a better number, only
 * evidence that the property is over-constraining. Loosening a threshold
 * because the reference misses it is the same move as loosening it because
 * the page misses it, and this file exists because that move keeps being
 * available.
 *
 * What it does licence, and what has been done:
 *
 *   1. EDGE IS NO LONGER THE ONLY QUESTION. It was the whole gate, it has
 *      been red for four rounds, and every round of chasing it made the hero
 *      darker — because the only way to lower a slope while holding a
 *      contrast floor over the text is to spend more of the band at high
 *      alpha. Its own limit case proves the direction: A TOTALLY OPAQUE VEIL
 *      SCORES 0.00 AND PASSES WITH INFINITE MARGIN.
 *   2. THE REFERENCE'S MEASURED FAILURE IS PINNED AS A CALIBRATION ASSERTION
 *      (CALIBRATION_CONTRACT.reference), so it cannot quietly stop being
 *      true, and so the next person to argue about this threshold starts from
 *      the number rather than from an impression.
 *   3. THE EDGE FAILURE IS REPORTED AS A RANKING, NOT AS A VERDICT ON TASTE.
 *      The hotspot list is genuinely useful — it names coordinates, and the
 *      1280 jamb at 3.07 is a real boundary that the reference has no
 *      equivalent of. Fixing the worst hotspots is worth doing. Reaching 1.00
 *      everywhere is not established as necessary.
 *
 * ── HOW WIDE A TRANSITION HAS TO BE, WHICH IS THE ACTUAL DESIGN NUMBER ────
 *
 * The gate's output is more useful read backwards. A transition carrying a
 * total change of dL* over a span S, shaped as a smoothstep (peak slope about
 * 1.75x the mean), has a peak window delta of 1.75 x 6 x dL* / S, so
 *
 *       S  >=  10.5 x dL* / MAX_WINDOW_DELTA_LSTAR   =   10.5 x dL*
 *
 * The veil's crest-to-floor depth over this field is dL* = 43.4 - 10.0 = 33.4,
 * so ANY transition that opens the picture from the pocket's floor all the way
 * to the crest needs about 350 CSS PIXELS of span. That number is the whole
 * brief for the geometry territory, and it is why the current shape cannot be
 * rescued by widening the existing mask: at 1280 the entire dead space outside
 * the page measure is 96px per side.
 *
 * AND SALIENCE MAKES THE SAME DEMAND HARDER, BECAUSE IT FALLS AS 1/span^2
 * WHERE THIS ONE FALLS AS 1/span. Rendered, at a fixed dL* of 33.4:
 *
 *     shape                span    EDGE    SALIENCE
 *     linear + knees        280    0.92        1.15
 *     smoothstep            525    0.74        0.37
 *     ratio               1.88x    1.24x       3.11x
 *
 * Two consequences for the design, and the second is the one that matters:
 *
 *   1. Reaching SALIENCE 1.0 for this depth takes about 570 px of span for a
 *      smoothstep, or 320 px for a straight ramp, versus EDGE's 350.
 *   2. AT A FIXED SPAN, EASING A RAMP MAKES IT WORSE, NOT BETTER. A smoothstep
 *      is 1.5x steeper in its middle than the linear ramp it replaces — it
 *      buys away the knees and pays for them in the centre — so a 16-stop
 *      eased ladder crammed into the same 96px gutter spends effort on the one
 *      variable that cannot help. SPAN IS THE ONLY LEVER, and there is no span
 *      inside a gutter, which is what round six's brief already concluded from
 *      the other direction.
 *
 * ── AND CHROMIUM IS ALREADY HELPING MORE THAN THE STYLESHEET ASKS ────────
 *
 * Worth knowing before anyone re-derives the geometry from the authored stops:
 * a `transparent`-to-colour transition is NOT rendered over the span it is
 * written over. Read back through getComputedStyle, Chromium expands each one
 * into an eight-step smoothstep and spreads it EARLIER than the authored stop:
 *
 *   authored  pocket ramp at 375x812     transparent 190.7px -> floor 224.5px
 *   rendered                             smoothstep 136.4px -> 224.5px
 *   authored  mask ramp at 1280          transparent 52.8px  -> opaque 96px
 *   rendered                             smoothstep 0px      -> 96px
 *
 * So the shipped scrim is measured here WITH the renderer's own smoothing
 * already applied — the authored 34px pocket ramp is really 88px on screen,
 * and the authored 43px mask ramp is really 96px — and it still comes in at
 * three to four times the threshold. Any calculation done against the authored
 * numbers alone will understate how much span the design has to find.
 *
 * ── WHY GRADIENT MAGNITUDE IS NOT ENOUGH, AS THIS FILE ONCE CLAIMED ──────
 *
 * ⚠ THIS PARAGRAPH USED TO ARGUE THE OPPOSITE AND IT WAS WRONG. It said that
 * Mach banding — the reason a mathematically continuous linear ramp can still
 * read as a drawn line — needed no band-pass operator, because "at a corner
 * where the slope jumps from 0 to g, the band-pass response is of order
 * (window x g), which is the quantity gated above". The order-of-magnitude
 * argument is fine and the conclusion drawn from it is not: `of order` hides a
 * factor that depends on the SCALE of the operator, and the eye has channels
 * an octave apart. Round five predicted the consequence, and `--calibrate`
 * now renders it:
 *
 *     the `knee` case — a linear ramp with two sharp corners —
 *     scores 0.92 on this gate and PASSES,
 *     and 1.15 on SALIENCE and FAILS.
 *
 * A ramp gentle enough to pass EDGE CAN produce a visible Mach band at its
 * ends, and there is now a rendered case that does. See THE HALF THAT CAN
 * ACTUALLY SEE A BOX, below, for the operator that catches it. The second
 * derivative over a fixed 6px window is still computed and reported here as a
 * diagnostic; it is scale-blind, which is exactly why it was never enough.
 *
 * The gradient is measured on an L* field first blurred by a sigma = 1 px
 * Gaussian. Two reasons, and both are load-bearing:
 *   - The eye does this. The optics of the eye impose a point spread of about
 *     one arcminute; sigma = 1 CSS px is the same order and is the smallest
 *     honest amount.
 *   - Without it the gate would measure Chromium's gradient dithering. An
 *     8-bit ramp is dithered by +/-1 code value, which near sRGB 100 is 0.3 L*
 *     of pure noise per pixel — a third of the entire budget, spent on
 *     something no one can see.
 *
 * ── TWO RENDERERS, AND THE CROSS-CHECK BETWEEN THEM ──────────────────────
 *
 * DEFAULT (no --page): a standalone harness. The real
 * components/site/hero-scrim.module.css is injected verbatim — CSS modules are
 * written with plain class selectors, so the file works as-is — together with
 * the custom properties it reads, extracted from app/globals.css rather than
 * retyped. There is no second source of truth for a single number, no dev
 * server, and no dependency on whether the photograph is on disk. This is the
 * mode `verify` should run.
 *
 * --page <url>: the real page, with the hero's content hidden and the
 * photograph replaced by the flat field. Slower, needs a server, and is what
 * tests/e2e/hero-blend.spec.ts drives — so CI holds the property against the
 * page a visitor actually gets, not against a reconstruction of it.
 *
 * The two must agree. --calibrate additionally renders two SYNTHETIC scrims —
 * a hard-edged plate and a reference-shaped soft radial — and asserts that the
 * instrument fails the first and passes the second. A gate that has never been
 * shown to fail is a gate nobody has tested; a gate that has never been shown
 * to PASS is a gate that will be deleted the first time it is inconvenient.
 * This one is required to do both, on demand, in one command.
 *
 * ── WHAT THIS GATE DOES NOT DO ───────────────────────────────────────────
 *
 * It does not care how DARK the veil is. Depth is check-hero-contrast.mjs's
 * question and it has a per-glyph ceiling to answer it with (--fg-accent at
 * 4.5:1 x1.05 caps the backdrop under any glyph at sRGB 38.28). The two gates
 * pull in opposite directions ON PURPOSE: one wants the dark region to cover
 * every glyph, this one wants its edge to be imperceptible. Passing both means
 * the dark core is big AND its boundary is soft, which is the actual design
 * problem. Neither may be relaxed to satisfy the other.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

/* The band box, from the gate that owns it and whose copy the browser gate
   re-measures. One source of truth for the geometry both files reason about;
   see VIEWPORTS below for what the second copy used to cost. */
import { TEXT_EXTENT } from './check-hero-contrast.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

/* ════════════════════════════════════════════════════════════════════════════
   THE CONSTANTS — every one of them derived in the header, none of them taste
   ════════════════════════════════════════════════════════════════════════════ */

/** arctan(1 / (96 * 28)) in degrees, inverted: CSS px subtended by one degree. */
export const PX_PER_DEGREE = 1 / ((Math.atan(1 / (96 * 28)) * 180) / Math.PI); // 46.93

/** Half a cycle at the ~4 cpd peak of the contrast sensitivity function. */
export const EDGE_WINDOW_PX = 6;

/** CIE dE*ab = 1: one just-noticeable difference between adjacent fields. */
export const JND_LSTAR = 1.0;

/** The gate. L* change across one EDGE_WINDOW_PX window. */
export const MAX_WINDOW_DELTA_LSTAR = JND_LSTAR;

/** The eye's point spread, rounded to the smallest honest pixel count. */
export const BLUR_SIGMA_PX = 1.0;

/**
 * How much of the element screenshot's border is discarded before anything is
 * measured.
 *
 * NOT a fudge factor, and it is deliberately as small as it can be. A band's
 * layout box lands on a fractional pixel — svh units and a clamp()ed padding
 * guarantee it — so the browser's element capture includes a partial row of
 * whatever is ABOVE and BELOW the band. On this page that neighbour is a
 * `paper` section at sRGB 251, and a single row of it against the veil's ink
 * is a 36 L* step that has nothing to do with the veil. Observed, not
 * theorised: exactly one row, at exactly one edge, at every viewport.
 *
 * One pixel is the whole of the artifact. Anything larger would start hiding
 * a real boundary at the band's own edge, which is a place a scrim edge can
 * genuinely live.
 */
export const ANALYSIS_INSET_PX = 1;

/**
 * The flat field the veil is judged over. ~92nd percentile of the shipped
 * rungs — see the header, and `describeField`, which re-measures it per run.
 */
export const FLAT_FIELD_SRGB = 128;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * THE SECOND HALF OF THE PROPERTY — PRESENCE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── THE EVIDENCE THAT THE EDGE METRIC ALONE MEASURES THE WRONG THING ──────
 *
 * The gate above asks "does the veil have a boundary in it?" and answers with
 * the maximum L* change across a 6px window. It has been RED for four rounds
 * while the hero got darker every round, and the owner's complaint did not
 * move. That is not a coincidence and it is not a threshold problem. Run the
 * calibration and read the third row:
 *
 *     A TOTALLY OPAQUE VEIL — the photograph completely obliterated, the
 *     defect in its most extreme possible form — MEASURES 0.00 L* PER 6px AT
 *     EVERY VIEWPORT AND PASSES WITH INFINITE MARGIN.
 *
 * That is measured, not argued: `--calibrate` renders it (`SYNTHETIC.blackout`)
 * and this file asserts on the result. A gate whose score is MINIMISED by the
 * defect it exists to prevent is not a strict gate, it is a gradient pointing
 * the wrong way — and four rounds of "make the falloff wider" walked down it,
 * because the only way to lower a slope while holding a contrast floor over
 * the text is to spend more of the band at high alpha. Darker.
 *
 * WHY THE DERIVATION WAS NEVER WRONG, ONLY INCOMPLETE. dE*ab = 1 is the
 * detection threshold for a STEP between two adjacent large uniform fields,
 * and applied to a step that is exactly what it measures. Applied pointwise
 * to a smooth ramp it becomes a SLOPE LIMIT, and a slope limit is a necessary
 * condition for "no visible edge" that is trivially satisfied by having no
 * gradient at all. The threshold is not being changed here — 1.00 L* is
 * defensible for what it measures, and the calibration still separates a
 * plate (42.58) from a reference-shaped radial (0.47..0.60) either side of
 * it. What is being fixed is that it was the ONLY question asked.
 *
 * ── SO THE GATE ASKS BOTH HALVES ─────────────────────────────────────────
 *
 *     EDGE      no perceptible boundary anywhere in the veil     (above)
 *     PRESENCE  the photograph is actually visible               (here)
 *
 * They pull against each other, which is the point: the first is satisfied by
 * a black rectangle and the second is satisfied by no veil at all. Passing
 * both means the picture is there AND its veil has no seam, which is the
 * property the owner has been describing all along and the property the
 * reference has.
 *
 * ── HOW PRESENCE IS MEASURED ─────────────────────────────────────────────
 *
 * Over the SAME flat-field render, and with the SAME published constant used
 * for the property it was actually defined for. A band pixel SHOWS THE
 * PICTURE when its rendered L* is at least one JND above the L* of bare
 * `--ground` — i.e. when a reader can tell that pixel apart from flat ink.
 * `presence` is the fraction of the band where that is true.
 *
 * The metric is deliberately blind to HOW MUCH picture is there. It does not
 * reward a bright hero; a pixel one JND above the ground counts exactly as
 * much as an unveiled one. It answers only "is the photograph present here",
 * which is the question "it still feels very black and dark" is asking.
 *
 * ── AND IT SUBSUMES THE COVERAGE HOLE, WHICH IS WHY IT LIVES HERE ────────
 *
 * A region of the band with NO PHOTOGRAPH BEHIND IT scores zero presence by
 * construction — there is nothing there to be one JND above anything. At
 * 1280x800 `.frame` is bounded to `min(100%, 106svh)` = 848px inside a 1306px
 * band, so the bottom 458px — 35% of the hero — is bare `--ground`, and on a
 * phone it is 824px of 1685, 49%. That region is reported separately from the
 * veil's own depth (`bare` against `in-frame`) because they are different
 * defects with different fixes, but they are one number to a reader.
 */

/**
 * The four viewports. 375 and 768 are below --container-wrap (1088px), where
 * the pocket's horizontal aperture is identically zero and the vertical ramps
 * are the only shaping there is; 1280 and 1600 are above it, where the mask's
 * side jambs open and the horizontal edge exists at all.
 *
 * THE BAND HEIGHT IS IMPORTED, NEVER TYPED. It comes from
 * scripts/check-hero-contrast.mjs's TEXT_EXTENT, which
 * tests/e2e/hero-contrast.spec.ts re-measures in Chromium and fails on. This
 * gate used to render a band of `160svh` — "only has to exceed the 106svh
 * dissolve" — which is 1300px at 375x812 against a real band of 1685px. It
 * was therefore measuring a hero 385px shorter than the one that ships, and
 * every one of those missing pixels was in the bare region. The blind spot
 * that hid the coverage hole was in this file too.
 */
export const VIEWPORTS = [
  { width: 375, height: 812, note: 'phone — no horizontal aperture at all' },
  { width: 768, height: 1024, note: 'tablet — still below the page measure' },
  { width: 1280, height: 800, note: 'laptop — 96px of dead space per side' },
  { width: 1600, height: 900, note: 'desktop — 256px of dead space per side' },
].map((vp) => {
  const row = TEXT_EXTENT.find((r) => r.w === vp.width);
  if (!row) {
    throw new Error(
      `check-hero-blend: no TEXT_EXTENT row for ${vp.width}px. The band height is imported ` +
        'from scripts/check-hero-contrast.mjs so the browser gate validates it — add the ' +
        'measured row there rather than typing a height here.',
    );
  }
  return { ...vp, bandH: row.bandH };
});

/**
 * ── THE PRESENCE FLOOR, DERIVED THE SAME WAY THE EDGE BUDGET WAS ──────────
 *
 * Three inputs, none of them taste, and `--calibrate` re-measures the first
 * on demand rather than trusting this comment:
 *
 *   1. THE REFERENCE MEASURES 100.0%. MAVTERRAS's hero, rendered in this same
 *      harness over this same flat field (SYNTHETIC.reference, ported from
 *      its components/site/hero.module.css): every pixel of its band is at
 *      least one JND above its ground, at all four viewports, and its darkest
 *      point is L* 19.5 against a ground of 7.2. It reaches that with a
 *      pocket at 68% effective over the copy and a field at 3.4%..8.2%
 *      elsewhere, and its coverage is 100% BY CONSTRUCTION: its band is
 *      `height: 100svh` and its photo box is `inset: 0`, so the two cannot
 *      drift apart the way a `min(100%, 106svh)` box and a content-height
 *      band do.
 *
 *   2. THIS PAGE'S PALETTE COSTS ZERO PRESENCE. The deepest alpha any ink
 *      role needs — 0.8595, for --fg-muted over a #FFFFFF source pixel, which
 *      scripts/check-hero-contrast.mjs derives and prints — puts the sRGB 128
 *      field at L* 13.4 on this ground. That is 6.2 L* above bare ink: SIX
 *      TIMES the JND. So there is no contrast-driven reason for ANY pixel of
 *      this hero to be indistinguishable from flat ink, and "the ratios force
 *      it" is not available as an argument. The 89.5% the veil actually
 *      delivers is still 5.5 L* above ground.
 *
 *   3. ONE EDGE WINDOW OF TOLERANCE. A band that chooses to resolve into the
 *      page's ground at its own bottom edge spends some rows getting there.
 *      EDGE_WINDOW_PX is the scale at which the derivation above says a
 *      transition stops being resolved as a line, so that many rows are
 *      allowed and no more: 6 of 1306 at 1280x800.
 *
 * A floor, not a target. It is high because nothing in the measured physics
 * of this palette justifies a lower one — and if the design decides otherwise
 * it says so IN THE STYLESHEET, where the number is visible to the person
 * reading the design, rather than here where it would be visible only to the
 * person reading the gate. See `readDeclaredBudgets`.
 */
export const REFERENCE_PRESENCE = 1.0;

/** Rows a bottom-edge transition may spend, as a share of the band. */
const presenceTolerance = (bandH) => EDGE_WINDOW_PX / bandH;

/** CIE dE*ab = 1 above bare --ground: the pixel can be told from flat ink. */
export const PRESENCE_JND_LSTAR = JND_LSTAR;

/* ════════════════════════════════════════════════════════════════════════════
   COLOUR — sRGB code value -> relative luminance -> CIE L*
   ════════════════════════════════════════════════════════════════════════════ */

/** sRGB 0..255 -> linear 0..1. The 2.4/12.92 piecewise transfer function. */
function srgbToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** CIE 1931 relative luminance, the same weights WCAG uses. */
function relativeLuminance(r, g, b) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Relative luminance -> CIE L*. Y is already normalised to the white point, so
 * this is the plain CIE 1976 lightness function including its linear toe.
 */
export function luminanceToLstar(y) {
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/** L* -> sRGB code value, for readable failure messages. */
function lstarToSrgb(lstar) {
  const y = lstar > 8 ? ((lstar + 16) / 116) ** 3 : lstar * (27 / 24389);
  const c = y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, c * 255)));
}

/** 256-entry lookup: every possible code value costs one pow, once. */
const LSTAR_OF_GREY = new Float64Array(256);
for (let i = 0; i < 256; i += 1) LSTAR_OF_GREY[i] = luminanceToLstar(srgbToLinear(i));

/* ════════════════════════════════════════════════════════════════════════════
   PNG — a minimal decoder, because a screenshot must not need a native dep
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Decodes the 8-bit, non-interlaced PNG that Playwright produces. Anything
 * else is a hard error: this gate reports what it measured or it reports
 * nothing, and a decoder that silently guesses is worse than no decoder.
 *
 * (tests/e2e/helpers/pixels.ts does the same job for the specs; it is
 * TypeScript and tsconfig sets allowJs:false, so it cannot be imported here.
 * The duplication is one function and it is bounded by the PNG spec.)
 */
export function decodePng(buffer) {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (buffer[i] !== SIGNATURE[i]) throw new Error('not a PNG');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  const idat = [];

  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colourType = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colourType];
  if (channels === undefined) throw new Error(`unsupported PNG colour type ${colourType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? out[dst + x - channels] : 0;
      const b = y > 0 ? out[up + x] : 0;
      const c = x >= channels && y > 0 ? out[up + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter} on row ${y}`);
      }
      out[dst + x] = value & 0xff;
    }
  }

  return { width, height, channels, data: out };
}

/* ════════════════════════════════════════════════════════════════════════════
   THE METRIC
   ════════════════════════════════════════════════════════════════════════════ */

/** Separable Gaussian, radius 3 sigma, reflected at the borders. */
function blur(field, width, height, sigma) {
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const kernel = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = w;
    sum += w;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;

  const clamp = (v, hi) => (v < 0 ? -v : v >= hi ? 2 * hi - v - 2 : v);
  const pass = new Float64Array(width * height);
  const out = new Float64Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let i = -radius; i <= radius; i += 1) {
        acc += kernel[i + radius] * field[y * width + clamp(x + i, width)];
      }
      pass[y * width + x] = acc;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let i = -radius; i <= radius; i += 1) {
        acc += kernel[i + radius] * pass[clamp(y + i, height) * width + x];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

/**
 * The L* field of a decoded screenshot, at CSS-pixel resolution.
 *
 * `scale` is the device pixel ratio the shot was taken at. The whole threshold
 * is expressed in CSS pixels because that is the unit with a fixed angular
 * size, so a shot taken at dpr 2 would otherwise be judged at twice the
 * spatial frequency and pass everything. The gate refuses any scale but 1
 * rather than resampling, because resampling is its own low-pass filter and
 * would quietly do the gate's job for it.
 */
function lstarField(image, cssWidth) {
  const scale = image.width / cssWidth;
  if (Math.abs(scale - 1) > 1e-6) {
    throw new Error(
      `screenshot is ${image.width}px wide for a ${cssWidth}px viewport (dpr ${scale}); ` +
        'this gate must run at deviceScaleFactor 1 — see lstarField()',
    );
  }
  const inset = ANALYSIS_INSET_PX;
  const width = image.width - 2 * inset;
  const height = image.height - 2 * inset;
  if (width <= 0 || height <= 0) throw new Error('screenshot smaller than the analysis inset');

  const { channels, data } = image;
  const field = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = ((y + inset) * image.width + (x + inset)) * channels;
      if (channels <= 2) {
        field[y * width + x] = LSTAR_OF_GREY[data[o]];
      } else {
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        field[y * width + x] =
          r === g && g === b ? LSTAR_OF_GREY[r] : luminanceToLstar(relativeLuminance(r, g, b));
      }
    }
  }
  return { field, width, height, inset };
}

/**
 * Gradient magnitude, expressed as the L* change across one EDGE_WINDOW_PX
 * window — a central difference over +/- half the window, which is the
 * derivative-of-Gaussian edge operator at exactly the scale derived in the
 * header. Also returns the second derivative over the same span, as the Mach
 * diagnostic.
 *
 * The border strip of half a window is skipped rather than extrapolated: a
 * one-sided difference at the image edge is a different operator with a
 * different threshold, and the band's own outer 3px is not where a scrim edge
 * lives.
 */
function gradientField(lstar, width, height) {
  const half = EDGE_WINDOW_PX / 2;
  const grad = new Float64Array(width * height);
  const curve = new Float64Array(width * height);
  for (let y = half; y < height - half; y += 1) {
    for (let x = half; x < width - half; x += 1) {
      const i = y * width + x;
      const gx = lstar[i + half] - lstar[i - half];
      const gy = lstar[i + half * width] - lstar[i - half * width];
      grad[i] = Math.hypot(gx, gy);
      const cx = lstar[i + half] - 2 * lstar[i] + lstar[i - half];
      const cy = lstar[i + half * width] - 2 * lstar[i] + lstar[i - half * width];
      curve[i] = Math.hypot(cx, cy);
    }
  }
  return { grad, curve };
}

/**
 * The worst places, with non-maximum suppression so a single 200px-long edge
 * reports as ONE hotspot at its worst point rather than as two hundred.
 * `radius` is generous on purpose: adjacent rows of the same edge are the same
 * defect and listing them all buries the second, different one.
 */
function hotspots(grad, curve, lstar, width, height, count, radius = 48) {
  /* One pass over the frame, keeping the peak of each `radius`-sized cell.
     Cells rather than a repeated full scan: the naive version is O(count x
     pixels x taken) and spends seconds on a 1600x1600 band for an answer that
     is identical. */
  const cellsX = Math.ceil(width / radius);
  const cellsY = Math.ceil(height / radius);
  const cells = [];
  for (let c = 0; c < cellsX * cellsY; c += 1) cells.push({ v: -1, x: -1, y: -1 });
  for (let y = 0; y < height; y += 1) {
    const cy = ((y / radius) | 0) * cellsX;
    for (let x = 0; x < width; x += 1) {
      const v = grad[y * width + x];
      const cell = cells[cy + ((x / radius) | 0)];
      if (v > cell.v) {
        cell.v = v;
        cell.x = x;
        cell.y = y;
      }
    }
  }

  const taken = [];
  const out = [];
  const ranked = cells.filter((c) => c.x >= 0).sort((a, b) => b.v - a.v);

  for (const cell of ranked) {
    if (out.length >= count) break;
    if (taken.some((t) => Math.abs(t.x - cell.x) <= radius && Math.abs(t.y - cell.y) <= radius)) {
      continue;
    }
    taken.push(cell);
    const bx = cell.x;
    const by = cell.y;
    const best = cell.v;
    const i = by * width + bx;
    const half = EDGE_WINDOW_PX / 2;
    out.push({
      x: bx,
      y: by,
      windowDelta: best,
      perPixel: best / EDGE_WINDOW_PX,
      perDegree: (best / EDGE_WINDOW_PX) * PX_PER_DEGREE,
      curvature: curve[i],
      axis:
        Math.abs(lstar[i + half] - lstar[i - half]) >=
        Math.abs(lstar[i + half * width] - lstar[i - half * width])
          ? 'horizontal'
          : 'vertical',
      lstarLo: Math.min(lstar[i - half], lstar[i + half], lstar[i - half * width], lstar[i + half * width]),
      lstarHi: Math.max(lstar[i - half], lstar[i + half], lstar[i - half * width], lstar[i + half * width]),
    });
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
   SALIENCE — THE HALF THAT CAN ACTUALLY SEE A BOX
   ════════════════════════════════════════════════════════════════════════════

   ── WHY A THIRD METRIC, WHEN THERE ARE ALREADY TWO ───────────────────────

   EDGE has been red for four rounds while the hero visibly improved every
   round, and round five found the trap that explains why: AT 375 AND 768 THE
   LINEAR FLOOR IS UNDER 1.00, so a purely linear ramp PASSES the edge gate —
   with the maximal Mach knee at each end, i.e. precisely the drawn line the
   owner keeps complaining about. A gate on peak slope alone cannot see that,
   because a knee is not a slope, it is a DISCONTINUITY IN THE SLOPE.

   The complementary failure is worse. EDGE is minimised by removing gradient,
   so it rewards a veil for being uniformly dark; PRESENCE is minimised by
   removing veil. Between them there is still no number that answers the
   question the owner is actually asking, which is not "how steep" and not
   "how dark" but:

       "i still feel that there is a blurry dark black box around the text
        that is cover over the background image in the back"

   That is a question about whether a FEATURE — a shape, a thing with a
   boundary — can be resolved at all. It has a standard answer in vision
   science and this section implements it.

   ── WHAT "A VISIBLE BOX" IS, AND THE FOUR CANDIDATES CONSIDERED ──────────

   The brief offered four; three of them are wrong, and being explicit about
   why is what keeps the fourth from looking arbitrary.

     1. PEAK SLOPE (the existing EDGE metric). Blind to knees, as above. Also
        minimised by an opaque plate, which is the defect. Kept, because at
        fine scales it is a useful complement, but it cannot be the answer.

     2. A CLOSED CONTOUR AT SOME LUMINANCE LEVEL. This one is EXACTLY
        BACKWARDS and it is worth saying so loudly, because it is the most
        intuitive of the four. Every level set of a radial gradient is a
        closed contour: the reference — the page the owner calls elegant — is
        made of nothing BUT closed contours, thousands of them, nested. A
        hard-edged plate has four. Counting contours would rank the reference
        as the worst hero ever measured. What distinguishes a box from a wash
        is not that a contour closes, it is HOW FAST THE FIELD CROSSES IT.

     3. THE EXTENT OVER WHICH THE GRADIENT IS MONOTONE. Same inversion. An
        unbounded radial wash is monotone from its centre to the frame edge —
        the longest monotone run any hero can have — and it is the target
        shape, not the defect.

     4. THE SECOND DERIVATIVE (curvature), because Mach banding is a
        curvature phenomenon. RIGHT IDEA, WRONG AS STATED: curvature has no
        scale attached to it. Measured over 6px (which this file already
        does, and reports as a diagnostic) it is swamped by Chromium's own
        ±1-code-value gradient dither and cannot see a knee in a 300px-wide
        feature at all. Curvature is only meaningful once you say AT WHAT
        SCALE, and once you say that you have to say how sensitive the eye is
        at each scale, and at that point you have derived the thing below.

   ── SO: BAND-LIMITED CONTRAST, WEIGHTED BY THE CSF ───────────────────────

   The standard model of early vision is a bank of band-pass channels, each
   tuned to a spatial frequency, each with its own detection threshold given
   by the contrast sensitivity function. A feature is visible when SOME
   channel's response to it exceeds that channel's threshold. That is the
   whole of it, and it says why a wash is invisible and a box is not:

       A WASH IS NOT INVISIBLE BECAUSE ITS SLOPE IS SMALL. It is invisible
       because its energy sits BELOW the frequencies the visual system is
       sensitive to. The CSF rolls off hard toward DC — that roll-off is
       lateral inhibition, and it is why nobody can see the vignette on a
       photograph until it is pointed out, no matter how many L* it carries.

   This is the property the previous four rounds were missing, and it is why
   "scope the falloff to the frame, not to the gutter" is the right fix: the
   fix is not a gentler shape, it is a LOWER SPATIAL FREQUENCY, and frequency
   is set by SPAN and by nothing else.

   ── THE OPERATOR ─────────────────────────────────────────────────────────

   Each channel is a difference of Gaussians, centre sigma_c and surround
   1.6 * sigma_c — Marr's ratio, which makes the DoG a close fit to the
   Laplacian-of-Gaussian and to the measured centre-surround receptive field.
   Its output is in L* units by construction: it is literally "this point's
   local average minus its surround average", which is the comparison a
   retinal ganglion cell makes and the quantity a Mach band IS.

   The centre sigma for a channel tuned to f cycles per degree comes from the
   LoG's own tuning, |H(f)| ∝ f^2 exp(-2 pi^2 sigma^2 f^2), which peaks at
   f = 1 / (pi sqrt(2) sigma):

       sigma_px = PX_PER_DEGREE / (pi sqrt(2) f)  =  46.93 * 0.22508 / f

   Four channels, one per octave, 4 / 2 / 1 / 0.5 cycles per degree:

       4.0 cpd   sigma  2.64 px   features about   12 px across
       2.0 cpd   sigma  5.28 px   features about   23 px across
       1.0 cpd   sigma 10.56 px   features about   47 px across
       0.5 cpd   sigma 21.13 px   features about   94 px across

   The band STOPS AT 4 cpd on the fine end, and that is a measured decision
   rather than a taste: an 8 cpd channel (sigma 1.32) has so little spatial
   averaging that Chromium's gradient dither — ±1 code value, which near sRGB
   100 is 0.3 L* of pure noise per pixel — survives it at about 0.8 units,
   most of the budget, spent on something nobody can see. `--calibrate`
   renders a case (`flat`: the bare field, no veil at all) whose entire job is
   to MEASURE that noise floor rather than assume it. Nothing is lost by
   stopping at 4 cpd: a step edge's DoG response is SCALE-INVARIANT, so the
   sharpest possible defect is seen just as well by the 4 cpd channel, at 83%
   of the weight. What the band genuinely cannot see is listed at the end.

   ── THE UNIT: STEP-EQUIVALENT L*, SO THE NUMBER MEANS SOMETHING ──────────

   A raw DoG response is not comparable across scales or against anything a
   person can picture. So every channel is normalised by ITS OWN measured
   response to a hard step of 1 L*, computed by running a synthetic step
   through the identical discrete pipeline (`measureStepGain`, memoised) —
   not by an analytic constant, so the normalisation cannot drift away from
   the code that ships.

       SALIENCE V at a point means: the visual channel there sees a feature
       as strong as A HARD STEP EDGE OF V L*.

   And 1 L* is where that becomes visible, because CIE L* is built so that
   dE*ab = 1 is one JND between adjacent fields. So the limit is 1.0, derived
   from the same published constant the EDGE budget uses, applied this time
   to the thing it was actually defined for.

   TWO INDEPENDENT DERIVATIONS AGREE HERE, WHICH IS THE REASON TO TRUST IT.
   The analytic step gain for k = 1.6 is max_u [Phi(u) - Phi(u/k)] = 0.1118,
   so "1 L* step" means a DoG amplitude of 0.1118 L*. Coming the other way,
   from the CSF: peak contrast sensitivity ~200 gives a threshold Michelson
   contrast of 0.005, and a sinusoid of that contrast about a mid-lightness
   mean (L* 50, Y 0.184) has an amplitude in L* of

       m * Y^(1/3) * 116/3  =  0.005 * 0.569 * 38.667  =  0.110 L*

   0.1118 against 0.110. Two unrelated routes — a colour-difference standard
   and a psychophysical contrast threshold — landing 2% apart is the evidence
   that the unit is the right size.

   ── THE CSF WEIGHTS, WHICH ARE THE WHOLE POINT ───────────────────────────

   Each channel's response is then multiplied by the RELATIVE contrast
   sensitivity at its frequency, Mannos & Sakrison (1974), the CSF used in
   image-quality metrics since JPEG:

       A(f) = 2.6 (0.0192 + 0.114 f) exp( -(0.114 f)^1.1 )

   normalised to its own peak (near 8 cpd). Printed on every run, because a
   weight table that is not visible is a weight table that gets edited:

       4.0 cpd  0.83      1.0 cpd  0.32
       2.0 cpd  0.54      0.5 cpd  0.19

   Those numbers are the reason a wide falloff wins and a merely SMOOTH one
   does not. At the shipped depth dL* = 33.4 L*, every `rendered` row below
   being a `--calibrate` case rather than an estimate:

       shape                       span    EDGE   SALIENCE   how it is known
       hard plate                     0   42.58      34.83   rendered
       straight ramp, sharp knees   280    0.92       1.15   rendered
       smoothstep                   280    1.25       1.60   derived
       smoothstep                   525    0.74       0.37   rendered
       radial wash, never completes frame  0.51       0.73   rendered

   Solving the two closed forms for SALIENCE = 1 at this depth:

       straight ramp   span >= 9.08 x dL*      (EDGE asks  6.0 x dL*)
       smoothstep      span >= 10.59 x dL*     (EDGE asks 10.5 x dL*)

   ROWS TWO AND THREE ARE THE FINDING FOR THE GEOMETRY TERRITORY. At a FIXED
   SPAN, EASING A RAMP MAKES SALIENCE WORSE — 1.15 becomes 1.60 — because a
   smoothstep is 1.5x steeper in its middle than the straight ramp it replaces:
   it buys away the knees and pays for them in the centre. Round five's 16-stop
   eased ladder was therefore spending its effort on the one variable that
   cannot help.

   The only lever is SPAN, and the penalty for missing it is QUADRATIC where
   EDGE's is linear: at the 96px gutter a smoothstep of this depth measures 3.7
   on EDGE and 13.6 on SALIENCE. That is why the falloff has to be scoped to
   the frame rather than to the dead space outside the page measure — and why
   round six's brief reached the same conclusion from the other direction.

   ── WHAT THIS METRIC CANNOT SEE, STATED PLAINLY ──────────────────────────

     · ANYTHING FINER THAN ABOUT 12 CSS PX. The band stops at 4 cpd. A 1px
       hairline is still caught (it scores 0.42 per L* of amplitude, so a 10
       L* line reads 4.2 and fails), but a defect whose entire structure is
       sub-pixel is EDGE's job, and EDGE is still here for exactly that.
     · COLOUR. Everything is computed in L*. A veil that shifted hue without
       shifting lightness would score zero. Deliberate: the complaint is
       about a dark box, and chromatic CSF is a different, much lower-
       resolution function.
     · ADAPTATION. The JND is applied uniformly in L*, which by the CSF route
       above is about 1.9x LENIENT in the darkest part of the band (at L* 20
       the threshold amplitude is 0.060 L*, not 0.110). This gate therefore
       UNDER-reports defects in deep shadow. Erring lenient was chosen over
       adding a luminance-adaptive term that would have to be calibrated
       against a display whose brightness nobody here knows.
     · WHETHER THE FEATURE IS A BOX OR A BLOB. The magnitude says a feature
       is resolvable; the STRUCTURE block below says what shape it has, by
       thresholding the response and measuring the largest connected
       component. That part is a diagnostic, never a gate — it names the
       defect in the report so a coordinate list turns into a sentence.
   ════════════════════════════════════════════════════════════════════════════ */

/** The channels, in cycles per degree of visual angle. */
export const CSF_BAND_CPD = [4, 2, 1, 0.5];

/** Marr's centre:surround ratio — the DoG that best approximates a LoG. */
export const DOG_SURROUND_RATIO = 1.6;

/** LoG tuning: peak radial frequency is this over sigma, in cycles per pixel. */
export const LOG_TUNING = 1 / (Math.PI * Math.SQRT2);

/** Centre sigma, in CSS px, for a channel tuned to `cpd` cycles per degree. */
export const sigmaForCpd = (cpd) => (PX_PER_DEGREE * LOG_TUNING) / cpd;

/** Mannos & Sakrison (1974). Relative, so its own units do not matter. */
export function contrastSensitivity(cpd) {
  const u = 0.114 * cpd;
  return 2.6 * (0.0192 + u) * Math.exp(-(u ** 1.1));
}

/** The function's own peak, found numerically rather than quoted. */
export const CSF_PEAK = (() => {
  let peak = 0;
  for (let f = 0.05; f <= 60; f += 0.005) {
    const v = contrastSensitivity(f);
    if (v > peak) peak = v;
  }
  return peak;
})();

/** Sensitivity at `cpd` as a fraction of the CSF's peak. */
export const csfWeight = (cpd) => contrastSensitivity(cpd) / CSF_PEAK;

/**
 * The gate. One CIE JND, expressed as the height of the hard step edge that
 * a visual channel would find equally strong. Same published constant as the
 * EDGE budget; this time applied to a step, which is what it was defined for.
 */
export const SALIENCE_LIMIT = JND_LSTAR;

/*
  The pyramid. Every channel uses the SAME two discrete kernels, applied to an
  image decimated once per octave, so the operator is literally identical at
  every scale and the per-channel step gains come out equal to within the
  sampling error the memoised calibration measures.

  The one prefilter-and-decimate at the start is not an approximation: sigma
  1.6 at full resolution is 0.8 in the half-resolution grid, comfortably inside
  the 2.64 the finest channel wants, and Gaussians compose exactly
  (G_a * G_b = G_sqrt(a^2+b^2)). It costs a quarter of the work and loses
  nothing, because 0.8 is above the 0.8 that Nyquist asks of a decimation.
*/
const PYRAMID_PRE_SIGMA = 1.6;
const OCTAVE_CENTER_SIGMA = sigmaForCpd(CSF_BAND_CPD[0]) / 2;
const OCTAVE_SURROUND_SIGMA = OCTAVE_CENTER_SIGMA * DOG_SURROUND_RATIO;
const OCTAVE_LIFT_SIGMA = OCTAVE_CENTER_SIGMA * 2;

/** Normalised Gaussian kernel, truncated at 3 sigma. */
function gaussKernel(sigma) {
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const kernel = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = w;
    sum += w;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;
  return kernel;
}

/**
 * Separable convolution with EDGE-CLAMP extension.
 *
 * Clamp rather than reflect, and the choice matters at the one place this
 * gate cares most about. At 1280 the veil's entire falloff lives in the 96px
 * gutter, so the frame's left and right borders are INSIDE the feature under
 * test — a `valid`-region-only measurement would be blind to precisely the
 * defect. Reflection is worse than useless there: a ramp still descending as
 * it reaches the border, reflected, becomes a V, and the operator reports a
 * peak that the design did not draw. Clamping models "the gradient stops
 * here", which is what the edge of a viewport actually is.
 */
function convolveAxis(src, width, height, kernel, axis) {
  const radius = (kernel.length - 1) / 2;
  const out = new Float64Array(width * height);
  if (axis === 'x') {
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        let acc = 0;
        for (let i = -radius; i <= radius; i += 1) {
          let xx = x + i;
          if (xx < 0) xx = 0;
          else if (xx >= width) xx = width - 1;
          acc += kernel[i + radius] * src[row + xx];
        }
        out[row + x] = acc;
      }
    }
    return out;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let i = -radius; i <= radius; i += 1) {
        let yy = y + i;
        if (yy < 0) yy = 0;
        else if (yy >= height) yy = height - 1;
        acc += kernel[i + radius] * src[yy * width + x];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

function convolveClamped(src, width, height, kernel) {
  return convolveAxis(convolveAxis(src, width, height, kernel, 'x'), width, height, kernel, 'y');
}

/** Drop every other row and column. The caller has already prefiltered. */
function decimate2(src, width, height) {
  const w = Math.max(1, width >> 1);
  const h = Math.max(1, height >> 1);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) out[y * w + x] = src[2 * y * width + 2 * x];
  }
  return { field: out, width: w, height: h };
}

/**
 * The DoG pyramid. Returns one entry per channel, each carrying THREE response
 * fields at that octave's own resolution, plus the scale factor needed to put a
 * coordinate back in the band's frame.
 *
 * ── WHY THREE, AND WHY THE ORIENTED PAIR IS THE INTERESTING ONE ──────────
 *
 *   iso   difference of Gaussians in BOTH axes — the isotropic channel. "Is
 *         there a resolvable feature here", regardless of what shape it is.
 *   vert  DoG along x, plain Gaussian along y — tuned to VERTICAL structure,
 *         i.e. to a boundary that runs up and down the frame. A left or right
 *         JAMB. This is the component the owner is describing.
 *   horz  the transpose — tuned to HORIZONTAL structure: a band running
 *         across the frame. A sky gradient, a vignette, a floor.
 *
 * The split is not decoration and it is not symmetric in what it means. A
 * PHOTOGRAPH'S OWN SHADING IS OVERWHELMINGLY HORIZONTAL: skies are brighter at
 * the top, floors darker at the bottom, lens vignettes fall off toward every
 * edge at once. A viewer has a lifetime of evidence that a horizontal
 * luminance ramp is something the scene did. Nothing in a photograph produces
 * a pair of long vertical luminance boundaries at the margins of the reading
 * measure, so when one appears the only available reading is that something
 * has been LAID OVER the picture — which is the sentence the owner keeps
 * writing.
 *
 * This decomposition is what the measurement below is for, and it is the
 * reason the round has a finding: the reference and this page differ far more
 * in `vert` than they do in `iso`.
 */
function dogPyramid(field, width, height) {
  const kBase = gaussKernel(Math.sqrt(OCTAVE_CENTER_SIGMA ** 2 - (PYRAMID_PRE_SIGMA / 2) ** 2));
  const kSurround = gaussKernel(
    Math.sqrt(OCTAVE_SURROUND_SIGMA ** 2 - OCTAVE_CENTER_SIGMA ** 2),
  );
  const kLift = gaussKernel(Math.sqrt(OCTAVE_LIFT_SIGMA ** 2 - OCTAVE_SURROUND_SIGMA ** 2));

  let level = decimate2(
    convolveClamped(field, width, height, gaussKernel(PYRAMID_PRE_SIGMA)),
    width,
    height,
  );

  const octaves = [];
  for (let j = 0; j < CSF_BAND_CPD.length; j += 1) {
    const { field: base, width: w, height: h } = level;
    /* A channel whose surround does not fit in the image measures the clamp,
       not the veil. The loop stops rather than reporting it. */
    if (w < 16 || h < 16) break;
    /*
      ONLY THE FIRST OCTAVE NEEDS LIFTING TO THE CENTRE SCALE, and getting
      this wrong is silent. The initial prefilter leaves sigma 0.8 in the
      half-resolution grid, so octave 0 has to be blurred the rest of the way
      to 1.32. Every later octave arrives ALREADY at 1.32, because the lift
      before each decimation takes the surround to exactly 2.64 and halving
      the grid halves the sigma with it. Blurring those again quietly makes
      the centre sqrt(1.32^2 + 1.05^2) = 1.69 — a different, wider operator at
      every scale but the first, whose measured step gain sags from 0.112 to
      0.074 and whose response peak drifts two pixels off the edge it is
      measuring. Both symptoms were observed before this line was written.
    */
    const centre = j === 0 ? convolveClamped(base, w, h, kBase) : base;
    const surroundX = convolveAxis(centre, w, h, kSurround, 'x');
    const surroundY = convolveAxis(centre, w, h, kSurround, 'y');
    const surround = convolveAxis(surroundX, w, h, kSurround, 'y');
    const iso = new Float64Array(w * h);
    const vert = new Float64Array(w * h);
    const horz = new Float64Array(w * h);
    for (let i = 0; i < iso.length; i += 1) {
      iso[i] = centre[i] - surround[i];
      vert[i] = centre[i] - surroundX[i];
      horz[i] = centre[i] - surroundY[i];
    }
    octaves.push({
      cpd: CSF_BAND_CPD[j],
      sigmaPx: OCTAVE_CENTER_SIGMA * 2 ** (j + 1),
      step: 2 ** (j + 1),
      weight: csfWeight(CSF_BAND_CPD[j]),
      iso,
      vert,
      horz,
      width: w,
      height: h,
    });
    if (j + 1 < CSF_BAND_CPD.length) {
      level = decimate2(convolveClamped(surround, w, h, kLift), w, h);
    }
  }
  return octaves;
}

/**
 * The per-channel response to a hard step of 1 L*, measured by pushing a
 * synthetic step through the pipeline above. Memoised; costs one 2048x512
 * pyramid, once per process.
 *
 * Measured rather than taken from the analytic max_u [Phi(u) - Phi(u/1.6)] =
 * 0.1117 so that kernel truncation, decimation phase and the prefilter are all
 * inside the normalisation. The two agree to 4%; the run prints both.
 *
 * ONE NUMBER SERVES ALL THREE FIELDS, and that is a theorem rather than an
 * approximation: over a step that varies only in x, the field is constant
 * along y, a Gaussian of a constant is that constant, so the isotropic and the
 * vertical operators are IDENTICALLY equal there. The horizontal operator's
 * gain over a horizontal step is the same number by transposition. The run
 * asserts the first of those rather than trusting the paragraph.
 */
let STEP_GAIN_CACHE = null;
export function measureStepGain() {
  if (STEP_GAIN_CACHE !== null) return STEP_GAIN_CACHE;
  /* Big enough that the COARSEST channel still calibrates: four decimations
     take 2048x512 down to 128x32, which clears the 16px floor `dogPyramid`
     refuses to measure below and leaves the step 60 samples from either
     border, well outside the surround's own support. A smaller frame silently
     returns fewer gains than there are channels. */
  const W = 2048;
  const H = 512;
  const HEIGHT_LSTAR = 100;
  const field = new Float64Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = W / 2; x < W; x += 1) field[y * W + x] = HEIGHT_LSTAR;
  }
  const octaves = dogPyramid(field, W, H);
  if (octaves.length !== CSF_BAND_CPD.length) {
    throw new Error(
      `step calibration produced ${octaves.length} of ${CSF_BAND_CPD.length} channels — the ` +
        'synthetic step frame is too small for the coarsest channel, so its normalisation would ' +
        'be missing. Enlarge W/H in measureStepGain rather than dropping a channel.',
    );
  }
  STEP_GAIN_CACHE = octaves.map((octave) => {
    let peakIso = 0;
    let peakVert = 0;
    for (let i = 0; i < octave.iso.length; i += 1) {
      const a = Math.abs(octave.iso[i]);
      const b = Math.abs(octave.vert[i]);
      if (a > peakIso) peakIso = a;
      if (b > peakVert) peakVert = b;
    }
    if (Math.abs(peakIso - peakVert) > 1e-9 * HEIGHT_LSTAR) {
      throw new Error(
        'the isotropic and vertical operators disagree over a vertical step ' +
          `(${peakIso} vs ${peakVert}). They are identically equal there by construction; a ` +
          'difference means convolveAxis or the pyramid chain is wrong, and every salience ' +
          'number in this file would be normalised against the wrong gain.',
      );
    }
    return peakIso / HEIGHT_LSTAR;
  });
  return STEP_GAIN_CACHE;
}

/** The analytic gain, for the report to print alongside the measured one. */
export const ANALYTIC_STEP_GAIN = (() => {
  /* Abramowitz & Stegun 7.1.26, |error| < 1.5e-7. */
  const erf = (x) => {
    const s = x < 0 ? -1 : 1;
    const a = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * a);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
        0.254829592) *
        t *
        Math.exp(-a * a);
    return s * y;
  };
  const phi = (u) => 0.5 * (1 + erf(u / Math.SQRT2));
  let peak = 0;
  for (let u = 0; u < 6; u += 0.0005) {
    const v = Math.abs(phi(u) - phi(u / DOG_SURROUND_RATIO));
    if (v > peak) peak = v;
  }
  return peak;
})();

/**
 * Everything the report needs about the SHAPE of one channel's above-threshold
 * response: how much of it there is, what the biggest piece looks like, and —
 * the part that matters — whether that piece CLOSES INSIDE THE PICTURE.
 *
 * ── WHY "TOUCHES THE FRAME BORDER" IS THE LINE ───────────────────────────
 *
 * A photograph's own shading always runs off the edge of the frame. A sky is
 * bright at the top of the picture and stays bright to both corners; a vignette
 * darkens toward every border; a floor falls away at the bottom and keeps
 * falling past the crop. None of that shading has an END that a viewer can see,
 * because the picture is a window and the shading continues out of it.
 *
 * A veil pocket bounded to the page measure is the opposite: its boundary
 * closes, entirely inside the picture, around the text. There is nothing in
 * the photographic world that produces a closed luminance loop with straight
 * sides, and that is the whole reason it reads as something laid ON the
 * picture rather than as something the picture is doing.
 *
 * So the response is split into components that reach a border — ATMOSPHERIC,
 * a shape the scene could have made — and components that do not — ENCLOSED,
 * a shape it could not. Both are reported. Both are real; only the second is
 * "a box".
 *
 * A DIAGNOSTIC, NEVER A GATE ON ITS OWN. A hard-edged plate covering the
 * bottom 88% of the frame is a purely atmospheric shape by this test — it
 * touches the left and right borders — and it is obviously a defect. Magnitude
 * catches it. The two questions are independent and the report asks both.
 */
function structureOf(octave, kind, gain, weight) {
  const field = octave[kind];
  const { width, height, step } = octave;
  const cut = (gain / weight) * SALIENCE_LIMIT;
  const seen = new Uint8Array(width * height);
  let above = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (Math.abs(field[i]) >= cut) {
      seen[i] = 1;
      above += 1;
    }
  }
  if (above === 0) {
    return {
      aboveShare: 0,
      enclosedPeak: 0,
      atmosphericPeak: 0,
      box: null,
      fill: 0,
      borders: 0,
      enclosed: false,
      shape: 'nothing above threshold',
    };
  }

  const stack = new Int32Array(width * height);
  let best = null;
  let enclosedPeak = 0;
  let atmosphericPeak = 0;

  for (let seed = 0; seed < seen.length; seed += 1) {
    if (seen[seed] !== 1) continue;
    let top = 0;
    stack[(top += 1) - 1] = seed;
    seen[seed] = 2;
    let pixels = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    let peak = 0;
    let left = false;
    let right = false;
    let up = false;
    let down = false;
    while (top > 0) {
      const i = stack[(top -= 1)];
      const x = i % width;
      const y = (i - x) / width;
      pixels += 1;
      const v = Math.abs(field[i]);
      if (v > peak) peak = v;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x === 0) left = true;
      if (x === width - 1) right = true;
      if (y === 0) up = true;
      if (y === height - 1) down = true;
      if (x > 0 && seen[i - 1] === 1) { seen[i - 1] = 2; stack[(top += 1) - 1] = i - 1; }
      if (x + 1 < width && seen[i + 1] === 1) { seen[i + 1] = 2; stack[(top += 1) - 1] = i + 1; }
      if (y > 0 && seen[i - width] === 1) { seen[i - width] = 2; stack[(top += 1) - 1] = i - width; }
      if (y + 1 < height && seen[i + width] === 1) { seen[i + width] = 2; stack[(top += 1) - 1] = i + width; }
    }
    const borders = (left ? 1 : 0) + (right ? 1 : 0) + (up ? 1 : 0) + (down ? 1 : 0);
    const salience = (peak / gain) * weight;
    if (borders === 0) {
      if (salience > enclosedPeak) enclosedPeak = salience;
    } else if (salience > atmosphericPeak) atmosphericPeak = salience;
    if (best === null || pixels > best.pixels) {
      best = { pixels, x0, y0, x1, y1, borders, left, right, up, down, salience };
    }
  }

  const cells = (best.x1 - best.x0 + 1) * (best.y1 - best.y0 + 1);
  const fill = best.pixels / cells;
  const spansWidth = best.x1 - best.x0 + 1 >= 0.7 * width;
  const spansHeight = best.y1 - best.y0 + 1 >= 0.7 * height;
  const shape =
    best.borders === 0
      ? spansWidth && spansHeight && fill < 0.5
        ? 'A CLOSED OUTLINE INSIDE THE PICTURE — a box'
        : 'AN ENCLOSED ISLAND — a shape laid on the picture'
      : best.left && best.right && !best.up && !best.down
        ? 'a band across the full width — atmospheric, the shape a sky makes'
        : best.up && best.down && !best.left && !best.right
          ? 'a band down the full height — atmospheric, but VERTICAL, which a scene does not make'
          : spansWidth && spansHeight && fill < 0.5
            ? 'an outline that runs off the frame'
            : `a region reaching ${best.borders} of the four borders`;

  return {
    aboveShare: above / (width * height),
    enclosedPeak,
    atmosphericPeak,
    box: {
      x: best.x0 * step,
      y: best.y0 * step,
      width: (best.x1 - best.x0 + 1) * step,
      height: (best.y1 - best.y0 + 1) * step,
    },
    fill,
    borders: best.borders,
    enclosed: best.borders === 0,
    shape,
  };
}

/** The salience analysis of one L* field. */
function salienceOf(field, width, height, inset) {
  const octaves = dogPyramid(field, width, height);
  if (octaves.length === 0) return null;
  const gains = measureStepGain();

  const peakOf = (octave, kind, gain) => {
    let peak = 0;
    let at = 0;
    const data = octave[kind];
    for (let i = 0; i < data.length; i += 1) {
      const v = Math.abs(data[i]);
      if (v > peak) { peak = v; at = i; }
    }
    const x = at % octave.width;
    return {
      value: (peak / gain) * octave.weight,
      raw: peak / gain,
      at: {
        x: x * octave.step + inset,
        y: ((at - x) / octave.width) * octave.step + inset,
      },
    };
  };

  const channels = octaves.map((octave, j) => {
    const gain = gains[j];
    const iso = peakOf(octave, 'iso', gain);
    const vert = peakOf(octave, 'vert', gain);
    const horz = peakOf(octave, 'horz', gain);
    return {
      cpd: octave.cpd,
      sigmaPx: octave.sigmaPx,
      weight: octave.weight,
      stepGain: gain,
      rawPeak: iso.raw,
      peak: iso.value,
      vert: vert.value,
      horz: horz.value,
      at: iso.at,
      vertAt: vert.at,
      horzAt: horz.at,
    };
  });

  let worstIndex = 0;
  for (let i = 1; i < channels.length; i += 1) {
    if (channels[i].peak > channels[worstIndex].peak) worstIndex = i;
  }
  const structure = structureOf(
    octaves[worstIndex],
    'iso',
    gains[worstIndex],
    channels[worstIndex].weight,
  );

  /* Enclosure is asked of EVERY channel, not only the loudest, because a
     closed outline and the frame's own atmospheric shading routinely peak at
     different scales — and it is the closed one the owner is complaining
     about, whether or not it happens to be the larger number. */
  let enclosedPeak = 0;
  for (let j = 0; j < octaves.length; j += 1) {
    const s = structureOf(octaves[j], 'iso', gains[j], channels[j].weight);
    if (s.enclosedPeak > enclosedPeak) enclosedPeak = s.enclosedPeak;
  }

  let vertPeak = 0;
  let horzPeak = 0;
  let vertWorst = channels[0];
  let horzWorst = channels[0];
  for (const channel of channels) {
    if (channel.vert > vertPeak) { vertPeak = channel.vert; vertWorst = channel; }
    if (channel.horz > horzPeak) { horzPeak = channel.horz; horzWorst = channel; }
  }

  return {
    peak: channels[worstIndex].peak,
    worst: channels[worstIndex],
    vertPeak,
    horzPeak,
    vertWorst,
    horzWorst,
    enclosedPeak,
    channels,
    structure,
  };
}

/**
 * PRESENCE, over one rendered band.
 *
 * Measured on the RAW L* field rather than the blurred one, and that is not an
 * oversight. The blur exists so the edge operator does not measure Chromium's
 * gradient dithering; presence asks a per-pixel question — "could a reader
 * tell THIS pixel from flat ink" — and a blur would let a bright neighbour
 * lend a dark pixel presence it does not have.
 *
 * `frameH` is where the photograph's box ends, MEASURED in the browser rather
 * than computed from the stylesheet, so this reports the split the visitor
 * actually gets. Rows at or below it have no photograph behind them at all:
 * they cannot show a picture, and separating them from rows that could but do
 * not is the difference between "extend the frame" and "lighten the veil".
 */
function presenceOf(field, width, height, inset, groundLstar, frameTop, frameH) {
  /*
    BOTH EDGES OF THE PHOTO BOX, not just its bottom.

    `.frame` is `inset-block-start: 0` today, so its top is the band's top and
    only the bottom edge splits anything. Reading the top anyway costs one
    comparison and removes a silent assumption: a photo box that is ever
    offset down the band would otherwise have its uncovered top rows counted
    as "the veil hid the picture" when in fact there is no picture there — the
    same confusion between coverage and depth this whole gate exists to end.
  */
  const top = frameTop === null ? 0 : Math.max(0, Math.min(height, Math.round(frameTop) - inset));
  const cut = frameH === null
    ? height
    : Math.max(top, Math.min(height, Math.round(frameH) - inset));
  let showsInFrame = 0;
  let inFrameCells = 0;
  let showsBelow = 0;
  let belowCells = 0;
  let darkest = Infinity;
  let darkestInFrame = Infinity;

  for (let y = 0; y < height; y += 1) {
    const below = y < top || y >= cut;
    for (let x = 0; x < width; x += 1) {
      const l = field[y * width + x];
      const shows = l - groundLstar >= PRESENCE_JND_LSTAR;
      if (l < darkest) darkest = l;
      if (below) {
        belowCells += 1;
        if (shows) showsBelow += 1;
      } else {
        inFrameCells += 1;
        if (shows) showsInFrame += 1;
        if (l < darkestInFrame) darkestInFrame = l;
      }
    }
  }

  const total = inFrameCells + belowCells;
  return {
    /* The headline: how much of the hero band shows the photograph. */
    band: total === 0 ? 0 : (showsInFrame + showsBelow) / total,
    /* The veil's own contribution, isolated from the coverage hole. */
    inFrame: inFrameCells === 0 ? 0 : showsInFrame / inFrameCells,
    /* The coverage hole, isolated from the veil. A non-zero `showsBelow` means
       something IS painted below the photo box — worth knowing, never assumed
       away. */
    bareShare: total === 0 ? 0 : belowCells / total,
    bareShows: belowCells === 0 ? null : showsBelow / belowCells,
    /* ROWS, not cells: the report quotes it in px of band height. */
    frameRows: Math.max(0, cut - top),
    darkest,
    darkestInFrame: darkestInFrame === Infinity ? null : darkestInFrame,
    groundLstar,
  };
}

/** The full analysis of one rendered frame. */
export function analyseFrame(pngBuffer, cssWidth, { groundLstar = null, frameTop = null, frameH = null } = {}) {
  const image = decodePng(pngBuffer);
  const { field, width, height, inset } = lstarField(image, cssWidth);
  const smoothed = blur(field, width, height, BLUR_SIGMA_PX);
  const { grad, curve } = gradientField(smoothed, width, height);

  /* Coordinates are reported in the BAND's own frame, so a hotspot can be
     found by eye in a screenshot without anyone having to remember the inset. */
  const spots = hotspots(grad, curve, smoothed, width, height, 4).map((s) => ({
    ...s,
    x: s.x + inset,
    y: s.y + inset,
  }));
  let worstCurve = 0;
  for (let i = 0; i < curve.length; i += 1) if (curve[i] > worstCurve) worstCurve = curve[i];

  /* Loops rather than Math.min(...field): a spread of a two-megapixel array is
     a stack overflow, not a range. */
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < smoothed.length; i += 1) {
    if (smoothed[i] < lo) lo = smoothed[i];
    if (smoothed[i] > hi) hi = smoothed[i];
  }

  return {
    width: image.width,
    height: image.height,
    worst: spots[0] ?? null,
    hotspots: spots,
    worstCurvature: worstCurve,
    lstarRange: [lo, hi],
    /* SALIENCE reads the RAW field, not the pre-blurred one. Its own centre
       Gaussian is sigma 2.64 at the finest channel, which already contains and
       exceeds the sigma-1 optical PSF the EDGE metric pre-applies; blurring
       twice would smuggle an extra low-pass into the operator and flatter
       every result. */
    salience: salienceOf(field, width, height, inset),
    presence:
      groundLstar === null
        ? null
        : presenceOf(field, width, height, inset, groundLstar, frameTop, frameH),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   THE HARNESS — the real stylesheet, over the flat field, with no server
   ════════════════════════════════════════════════════════════════════════════ */

const SCRIM_CSS_PATH = join(REPO, 'components', 'site', 'hero-scrim.module.css');
const GLOBALS_CSS_PATH = join(REPO, 'app', 'globals.css');

/**
 * Pulls the custom properties the scrim reads out of app/globals.css, so this
 * file declares no design token of its own. Walks braces rather than matching
 * a regex — the same lesson check-hero-contrast.mjs learned the hard way, for
 * the same reason: a regex that consumes a block's closing brace makes the
 * next block invisible.
 *
 * Only depth-1 blocks whose selector is `:root`, `@theme ...` or
 * `[data-ground="ink"]` are read. Anything nested inside `@layer` is a
 * component rule and none of the scrim's inputs live there.
 */
function extractTokens(source) {
  /*
    COMMENTS COME OUT FIRST, BEFORE ANY BRACE IS COUNTED. app/globals.css is
    two thirds prose and that prose contains braces, semicolons and the word
    `:root`; a walker that steps over it counts a comment's `{` as a block and
    reports selectors like "the fill is reinforcement. PREVENTS: someone...".
    Stripping the selector AFTER slicing it — which is the obvious order — does
    not help, because by then the depth is already wrong.
  */
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');

  /* Tested per comma-separated segment, because `:root, [data-ground="paper"]`
     is one block carrying half the palette and an end-anchored test on the
     whole selector list silently drops it. */
  const wanted = /^(:root|@theme\b.*|\[data-ground="ink"\])$/;
  const matches = (selector) =>
    selector.split(',').some((part) => wanted.test(part.trim()));

  const out = [];
  let depth = 0;
  let selectorStart = 0;
  let blockSelector = null;
  let blockStart = 0;

  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    /* A top-level `;` ends a statement (`@import "tailwindcss";`), so the next
       selector starts after it. Without this the first block's "selector" is
       every at-statement in the file and nothing matches. */
    if (ch === ';' && depth === 0) {
      selectorStart = i + 1;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) {
        blockSelector = css.slice(selectorStart, i).trim();
        blockStart = i + 1;
      }
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        if (blockSelector !== null && matches(blockSelector)) {
          const body = css.slice(blockStart, i);
          for (const [, name, value] of body.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
            out.push(`${name}: ${value.trim()};`);
          }
        }
        selectorStart = i + 1;
        blockSelector = null;
      }
    }
  }
  if (out.length === 0) throw new Error(`no custom properties found in ${GLOBALS_CSS_PATH}`);
  return out;
}

/*
  ── THE GROUND TRUTH ──────────────────────────────────────────────────────

  Four shapes carrying THE SAME depth over DIFFERENT spans, so the calibration
  is a controlled experiment rather than four unrelated pictures. The depth is
  the shipped veil's own crest-to-floor over the flat field, L* 10 -> 43, and
  every one of them is authored as an OPAQUE grey ramp with its stops placed
  by `lstarToSrgb` — linear IN L*, not in sRGB code value, so the profile the
  gate measures is the profile this file intended and not a gamma artefact of
  CSS's sRGB interpolation.

  The spans are chosen from the arithmetic, not by eye:

    knee        210 px   peak slope 0.943 L* per 6px — UNDER the EDGE budget, so
                         EDGE PASSES IT. Its two corners are slope
                         discontinuities, the maximal Mach knee, and SALIENCE
                         reads ~1.4. THIS IS THE CASE THE OLD GATE MISSES and
                         it is the reason this section was written.
    smoothstep  525 px   twice the span, eased at both ends. PASSES both.
    wash        frame    a radial whose falloff never terminates inside the
                         picture — the reference's shape, and the shape this
                         round is asking the geometry territory for.

  The pair (knee, smoothstep) also demonstrates the law that matters:
  SALIENCE falls as 1/span^2 while EDGE falls as 1/span. Doubling a falloff
  halves the old number and QUARTERS the new one. That is the whole argument
  for spending the design's effort on span rather than on shape.
*/
const RAMP_LO_LSTAR = 10;
const RAMP_HI_LSTAR = 43;
const RAMP_TOP_PX = 200;
const RAMP_LO_SRGB = lstarToSrgb(RAMP_LO_LSTAR);
const RAMP_HI_SRGB = lstarToSrgb(RAMP_HI_LSTAR);
const grey = (c) => `rgb(${c} ${c} ${c})`;

/**
 * `n` stops of an opaque grey ramp shaped by `shape`, placed along `positions`.
 *
 * THE STOPS CARRY L*, NOT sRGB CODE VALUES, and the difference is not
 * cosmetic: `lstarToSrgb` is a cube root, so a two-stop CSS gradient from
 * sRGB 27 to 102 is 1.25x steeper in L* at its dark end than at its bright
 * one. A shape study whose shape is a gamma curve is not a shape study.
 *
 * The count is a compromise that was measured rather than picked. `lstarToSrgb`
 * rounds to whole code values, so consecutive stops that are close together
 * round to the SAME code and then to the next — a staircase, with risers the
 * gate reads as banding. At 65 stops over 280px the risers land 4px apart and
 * cost 0.5 L* each, which measured 1.47 on EDGE against an intended 0.81.
 * Long segments, few stops.
 */
function greyStops(shape, count, positionOf) {
  const stops = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const c = lstarToSrgb(RAMP_LO_LSTAR + (RAMP_HI_LSTAR - RAMP_LO_LSTAR) * shape(t));
    stops.push(`${grey(c)} ${positionOf(t)}`);
  }
  return stops.join(', ');
}

/**
 * Both painted pseudo-elements removed outright.
 *
 * `content: none` rather than `background-image: none`, because the veil is
 * TWO layers now — `.scrim::before` is the pocket and `.scrim::after` is the
 * field — and a synthetic that neutralises only the first is not a synthetic,
 * it is the shipped field with something drawn on top of it. Every shape case
 * below starts from a blank element.
 */
const NO_LAYERS = `
    .scrim::before, .scrim::after { content: none !important; }`;

const SYNTHETIC = {
  /* THE BARE FIELD, NO VEIL AT ALL — the instrument's own noise floor.

     Not a shape study: its entire job is to MEASURE what Chromium's gradient
     dither and the PNG round-trip contribute to SALIENCE, rather than to
     assume it is negligible. The 8 cyc/deg channel was dropped from the band
     because this case said it costs ~0.8 units of pure noise; the number this
     case prints is what that decision rests on, and it is re-measured on
     every calibration run. If it ever climbs toward 1.0 the band is too fine
     and the report is measuring the renderer. */
  flat: `
    .frame { block-size: 100% !important; }
    .scrim { display: none !important; }`,
  /* A plate: hard on all four sides. The defect, in its purest form. */
  plate: `${NO_LAYERS}
    .scrim {
      background-image: none !important;
      background-color: color-mix(in srgb, var(--ground) 93%, transparent) !important;
      clip-path: inset(12% 0 0 0) !important;
    }`,
  /* A LINEAR RAMP WITH SHARP KNEES, gentle enough to pass the EDGE budget.
     Must FAIL. See the ground-truth note above. */
  knee: `${NO_LAYERS}
    .frame { block-size: 100% !important; }
    .scrim {
      background-image: linear-gradient(
        180deg,
        ${grey(RAMP_LO_SRGB)} 0px,
        ${grey(RAMP_LO_SRGB)} ${RAMP_TOP_PX}px,
        ${grey(RAMP_HI_SRGB)} ${RAMP_TOP_PX + 280}px,
        ${grey(RAMP_HI_SRGB)} 100%
      ) !important;
    }`,
  /* THE SAME DEPTH, EASED, OVER TWICE THE SPAN. Must PASS. */
  smoothstep: `${NO_LAYERS}
    .frame { block-size: 100% !important; }
    .scrim {
      background-image: linear-gradient(180deg,
        ${grey(RAMP_LO_SRGB)} 0px,
        ${greyStops(
          (t) => t * t * (3 - 2 * t),
          24,
          (t) => `${(RAMP_TOP_PX + 525 * t).toFixed(2)}px`,
        )},
        ${grey(RAMP_HI_SRGB)} 100%) !important;
    }`,
  /* AN UNBOUNDED RADIAL WASH — the falloff never terminates inside the
     picture, so there is no span short enough for a channel to resolve. The
     shape this round is asking for. Must PASS WITH MARGIN. */
  wash: `${NO_LAYERS}
    .frame { block-size: 100% !important; }
    .scrim {
      background-color: ${grey(RAMP_HI_SRGB)} !important;
      background-image: radial-gradient(240% 62% ellipse at 45% 30%,
        ${greyStops((t) => t * t * (3 - 2 * t), 24, (t) => `${(t * 100).toFixed(2)}%`)}
      ) !important;
    }`,
  /* The reference's shape, ported to this band's proportions: a radial pocket
     whose falloff is hundreds of pixels wide, over a gentle vertical field.
     Deliberately NOT deep enough for check-hero-contrast.mjs — the point is
     the SHAPE, and mixing the two questions is how a gate gets weakened. */
  soft: `${NO_LAYERS}
    .scrim {
      background-image:
        radial-gradient(
          140% 50% ellipse at 50% 44%,
          color-mix(in srgb, var(--ground) 66%, transparent) 0%,
          color-mix(in srgb, var(--ground) 66%, transparent) 30%,
          color-mix(in srgb, var(--ground) 0%, transparent) 95%
        ),
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--ground) 24%, transparent) 0,
          color-mix(in srgb, var(--ground) 30%, transparent) 55svh,
          var(--ground) 106svh
        ) !important;
    }`,
  /*
    NO PICTURE AT ALL — the veil is opaque `--ground` across the whole band.
    This is the owner's complaint in its most extreme possible form: "it still
    feel very black and dark", taken to the limit.

    IT SCORES 0.00 ON BOTH EDGE AND SALIENCE AND PASSES THEM BOTH WITH
    INFINITE MARGIN. That result is the reason the presence half of this file
    exists, and asserting on it is what stops either derivative metric from
    being mistaken for the whole property. `--calibrate` requires EDGE and
    SALIENCE to pass here and PRESENCE to fail; if presence ever passes a
    blackout, the gate is back where it started.
  */
  blackout: `${NO_LAYERS}
    .scrim {
      background-image: none !important;
      background-color: var(--ground) !important;
    }`,
  /*
    THE REFERENCE, PORTED VERBATIM — MAVTERRAS components/site/hero.module.css,
    `.scrim`'s two gradients and its element opacity, read out of that repo and
    written here as literals. Its numbers, not an impression of them:

      pocket   radial, opaque rgb(14 11 6) core to 50%, gone by 80%
      field    98% for the top 9%, then 8% at 28%, 5% at 60%, 12% at 100%
      opacity  0.68 at rest  ->  effective 3.4%..8.2% outside the pocket

    `.frame` is forced to full height because that is the reference's own
    geometry: its hero is `height: 100svh` and its photo box is `inset: 0`, so
    its band and its photograph are the same box BY CONSTRUCTION and its
    coverage cannot drift. Reproducing that here is the point — this synthetic
    is where REFERENCE_PRESENCE comes from, and a derivation that renders is
    worth more than a derivation that is quoted.

    IT IS ALSO THE ONLY NUMBER IN THIS FILE THAT ANYBODY IS ARGUING ABOUT.
    The owner points at this hero and calls it elegant; this page is the one he
    says has a box in it. So whatever metric this file gates on has to put
    these two on opposite sides of a line, and `--calibrate` prints both.

    Deliberately NOT deep enough for scripts/check-hero-contrast.mjs, whose
    own header records that this pocket cannot hold this palette's ratios.
    Mixing the two questions is how a gate gets weakened; this one is about
    SHAPE and PRESENCE only.
  */
  reference: `${NO_LAYERS}
    .frame { block-size: 100% !important; }
    .scrim {
      background-image: none !important;
      background:
        radial-gradient(70% 58% ellipse at 24% 55%,
          rgb(14 11 6 / 100%) 0%, rgb(14 11 6 / 100%) 50%, rgb(14 11 6 / 0%) 80%),
        linear-gradient(180deg,
          rgb(20 20 20 / 98%) 0%, rgb(20 20 20 / 98%) 9%, rgb(20 20 20 / 8%) 28%,
          rgb(20 20 20 / 5%) 60%, rgb(20 20 20 / 12%) 100%) !important;
      opacity: 0.68 !important;
    }`,
};

/**
 * Which calibration cases must pass which half. An explicit table rather than
 * an `if` per name, so adding a case forces a decision about what it proves.
 */
const CALIBRATION_CONTRACT = {
  flat: {
    edge: true,
    salience: true,
    enclosure: true,
    presence: true,
    why: "the bare field, NO VEIL — the instrument's own noise floor. Every metric must read ~0.",
  },
  plate: {
    edge: false,
    salience: false,
    /* A plate's boundary spans the full width and therefore reaches two
       borders: by the enclosure test it is ATMOSPHERIC, and it passes. That is
       not a hole, it is the reason the gate has two halves — magnitude catches
       what enclosure forgives, and this row is the proof that enclosure alone
       would be a gate a black plate could walk through. */
    enclosure: true,
    presence: null,
    why: 'a hard-edged plate — an edge and nothing else',
  },
  knee: {
    edge: true,
    salience: false,
    enclosure: true,
    presence: null,
    why:
      'A LINEAR RAMP WITH SHARP KNEES, gentle enough that EDGE PASSES IT (0.92 against a 1.00 ' +
      'budget). The Mach knee is the drawn line round five predicted the old gate could not ' +
      'see, and SALIENCE reads it at 1.15. THIS ROW IS WHY THIS FILE HAS A THIRD METRIC.',
  },
  smoothstep: {
    edge: true,
    salience: true,
    enclosure: true,
    presence: null,
    why:
      'the same depth, eased, over 1.875x the span. EDGE falls 0.92 -> 0.74 (1.24x, i.e. 1/span) ' +
      'while SALIENCE falls 1.15 -> 0.37 (3.1x, i.e. 1/span^2). THE WHOLE ARGUMENT FOR SPAN.',
  },
  wash: {
    edge: true,
    salience: true,
    enclosure: true,
    presence: null,
    why:
      'an unbounded radial wash — the falloff carries its depth along the band\'s long axis and ' +
      'never completes across its short one. PASS with margin, on every metric.',
  },
  soft: {
    edge: true,
    salience: true,
    enclosure: true,
    presence: null,
    why: 'a reference-shaped soft radial — a shape with no edge',
  },
  blackout: {
    edge: true,
    salience: true,
    enclosure: true,
    presence: false,
    why:
      'an opaque veil — NO PICTURE AND NO EDGE. ALL THREE derivative metrics pass it with ' +
      'infinite margin; presence must not. This is why presence exists.',
  },
  reference: {
    /*
      ⚠ THE REFERENCE FAILS EVERY MAGNITUDE METRIC IN THIS FILE, AND THAT IS
      THE FINDING OF ROUND SIX. Measured, at the four viewports:

                        375     768    1280    1600
        EDGE           2.79    1.47    1.56    1.41
        SALIENCE       4.06    2.77    3.44    2.70
        vertical       3.48    1.86    1.13    0.91
        ENCLOSED       3.78    2.05    1.49    1.63

      against this page's own 1.23 / 1.09 / 2.45 / 2.36 on EDGE and 1.44 /
      1.17 / 3.86 / 3.40 on SALIENCE. AT 375 AND 768 THE PAGE THE OWNER
      DISLIKES SCORES TWO TO THREE TIMES BETTER THAN THE PAGE HE CALLS
      ELEGANT, on both. A metric that ranks them that way is not measuring
      what he is looking at, and no amount of moving a threshold fixes that —
      it is the wrong question, not the wrong number.

      All four rows are asserted as FAILURES so that none of them can quietly
      stop being true. If a later edit makes the reference pass any of them,
      either a budget moved or the port stopped being faithful, and both
      deserve to stop a run rather than to re-open the argument from an
      impression.
    */
    edge: false,
    salience: false,
    enclosure: false,
    presence: true,
    bandSvh: 100,
    why:
      'MAVTERRAS ported verbatim — the presence floor comes from it, and IT FAILS EVERY ' +
      'MAGNITUDE METRIC HERE, worse than this page at 375 and 768. See the contract comment.',
  },
};

function harnessHtml({ tokens, scrimCss, extraCss, bandH }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { ${tokens.join('\n  ')} }
  /* The page behind the band is the SAME ink the band resolves to. svh is a
     fraction of the viewport and rounds to a fractional band height, so the
     last row of the element screenshot is a partial pixel blended with
     whatever is under it; against black that is a manufactured edge at the
     very bottom of every frame. Against the ground it is nothing. A missing
     token cannot hide here: shootHarness asserts --ground resolved first. */
  html, body { margin: 0; padding: 0; background: var(--ground); }
  /*
    The band. <Band bleed> is full-bleed and position:relative; .ground adds
    the stacking context.

    ⚠ THE HEIGHT IS THE MEASURED BAND, IN PIXELS, NOT A ROUND svh NUMBER.
    It used to be \`160svh\` — "only has to clear the 106svh dissolve" — which
    is 1300px at 375x812 against the 1685px band that actually ships. This
    gate was therefore judging a hero 385px shorter than the real one, and
    every missing pixel was in the region BELOW the photograph, which is
    exactly the region the whole coverage problem lives in. A harness whose
    band is shorter than the band cannot see a hole at the bottom of it.
  */
  .band {
    position: relative;
    inline-size: 100%;
    block-size: ${bandH}px;
    background: var(--ground);
  }
  /* The photograph's stand-in. Inside .frame, so it inherits the frame's real
     geometry — full width, min(100%, 106svh) — and the scrim's dissolve is
     measured against the same bottom edge the photograph actually has. */
  .flat { position: absolute; inset: 0; background: rgb(${FLAT_FIELD_SRGB} ${FLAT_FIELD_SRGB} ${FLAT_FIELD_SRGB}); }
  ${extraCss ?? ''}
</style>
<style>${scrimCss}</style>
</head><body>
  <section id="top" data-ground="ink" class="band ground">
    <div class="frame"><div class="flat"></div></div>
    <div class="scrim" style="--scrim-base: 0.93"></div>
  </section>
</body></html>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   RENDERING
   ════════════════════════════════════════════════════════════════════════════ */

async function withBrowser(fn) {
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch {
    throw new Error(
      'this gate renders the scrim, so it needs Playwright.\n' +
        '  npm i -D @playwright/test && npx playwright install chromium',
    );
  }
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/**
 * Runs IN THE PAGE. Returns the two numbers presence needs, MEASURED rather
 * than derived from the stylesheet:
 *
 *   frameTop/frameH   the photograph's box, relative to the band's own top.
 *                     Presence splits the band on this row: above it a picture
 *                     exists and the veil decides whether it can be seen;
 *                     at or below it there is nothing to see by construction.
 *   ground            the band's resolved `--ground`, as painted. Every
 *                     presence comparison is "one JND above THIS", so reading
 *                     it back from the page rather than re-resolving the token
 *                     here means the gate and the browser cannot disagree
 *                     about what flat ink is.
 *
 * The frame is found STRUCTURALLY where it can be — see shootPage's note on
 * why a class-name match is wrong under CSS modules — and by class in the
 * harness, where the stylesheet is injected with its plain selectors intact.
 */
function measureBandGeometry() {
  const band = document.querySelector('#top');
  const rect = band.getBoundingClientRect();
  const kids = Array.from(band.children).filter((el) => el.tagName === 'DIV');
  const frame =
    kids.find((el) => el.hasAttribute('data-blend-frame'))
    ?? kids.find((el) => el.classList.contains('frame'))
    ?? kids.find((el) => el.querySelector('img') !== null)
    ?? null;
  const fr = frame ? frame.getBoundingClientRect() : null;
  return {
    bandH: rect.height,
    frameTop: fr ? fr.top - rect.top : null,
    frameH: fr ? fr.bottom - rect.top : null,
    ground: getComputedStyle(band).getPropertyValue('--ground').trim(),
  };
}

/** Screenshots the band, at dpr 1, for one viewport. */
async function shootHarness(browser, viewport, html) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    /*
      THE HARNESS MUST NOT BE ALLOWED TO FAIL QUIETLY. If `extractTokens` misses
      a block, `--ground` never resolves, `background: var(--ground)` becomes
      invalid-at-computed-value-time, the band paints transparent, and the gate
      then measures a 53 L* step against the page behind it — a spectacular
      failure that looks exactly like a real defect. Cheaper to assert.
    */
    const probe = await page.evaluate(() => {
      const band = document.querySelector('#top');
      const style = getComputedStyle(band);
      return {
        ground: style.getPropertyValue('--ground').trim(),
        wrap: style.getPropertyValue('--container-wrap').trim(),
        band: style.getPropertyValue('--spacing-band').trim(),
        painted: style.backgroundColor,
      };
    });
    for (const [name, value] of Object.entries(probe)) {
      if (!value || value === 'rgba(0, 0, 0, 0)') {
        throw new Error(
          `the harness did not resolve ${name} (got ${JSON.stringify(value)}). ` +
            'extractTokens() is not finding app/globals.css\'s token blocks — fix that ' +
            'rather than the threshold; every number this gate prints depends on it.',
        );
      }
    }
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const geometry = await page.evaluate(measureBandGeometry);
    const band = page.locator('#top');
    return { png: await band.screenshot({ type: 'png' }), ...geometry };
  } finally {
    await context.close();
  }
}

/**
 * The same measurement against the real page.
 *
 * Everything in the band except the frame and the scrim is `visibility:
 * hidden` — not `color: transparent`, which is what hero-contrast.spec.ts
 * correctly uses for ITS question. That spec wants a button's fill left in
 * place so a label is measured against it; this gate wants every painted
 * surface that is not the veil GONE, because a button's own edge is a real
 * edge and it is not the scrim's.
 */
async function shootPage(browser, viewport, url) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    const found = await page.evaluate((flat) => {
      const band = document.querySelector('#top');
      if (!band) return { ok: false, why: 'no #top band on the page' };

      /*
        THE TWO ELEMENTS ARE FOUND STRUCTURALLY, NEVER BY CLASS NAME. CSS
        modules hash their locals into `hero-scrim-module__<hash>__frame`, so
        the obvious `[class*="scrim"]` matches the frame, the photographs and
        the band itself — every element of the module carries the module's name
        — and the gate then re-shows the photograph it was supposed to replace.
        (That mistake was made here once and it read as an 18 L* defect at the
        top of the phone frame.) The structure IS the contract: hero.tsx
        renders the frame and the veil as the band's two aria-hidden children,
        and the frame is the one holding the photograph.
      */
      const kids = Array.from(band.children).filter(
        (el) => el.tagName === 'DIV' && el.getAttribute('aria-hidden') === 'true',
      );
      const frame = kids.find((el) => el.querySelector('img') !== null) ?? null;
      const scrim = kids.find((el) => el !== frame) ?? null;
      if (!frame) return { ok: false, why: 'no hero photo frame in #top — is the photograph on disk?' };
      if (!scrim) return { ok: false, why: 'no hero scrim in #top — is the photograph on disk?' };

      frame.setAttribute('data-blend-frame', '');
      scrim.setAttribute('data-blend-scrim', '');

      const style = document.createElement('style');
      /*
        EVERYTHING ON THE PAGE IS HIDDEN, not just everything in the band. A
        sticky header, the skip link and `next dev`'s own overlay all paint
        over the band once Playwright scrolls to capture a band taller than the
        viewport, and each of them is a hard edge that is not the veil's.
        `visibility` rather than `display`: nothing moves, so the band keeps the
        exact height and the exact svh resolution it renders at normally, and a
        descendant can be turned back on inside a hidden ancestor.
      */
      style.textContent = `
        *, *::before, *::after { transition: none !important; animation: none !important; }
        body *, body *::before, body *::after { visibility: hidden !important; }
        #top, [data-blend-frame], [data-blend-scrim],
        [data-blend-scrim]::before, [data-blend-scrim]::after { visibility: visible !important; }
        [data-blend-frame] *, [data-blend-frame] *::before, [data-blend-frame] *::after {
          visibility: visible !important;
        }
        [data-blend-frame] picture, [data-blend-frame] img { display: none !important; }
        [data-blend-frame] { background: rgb(${flat} ${flat} ${flat}) !important; }`;
      document.head.appendChild(style);
      return { ok: true };
    }, FLAT_FIELD_SRGB);

    if (!found.ok) throw new Error(`--page ${url}: ${found.why}`);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const geometry = await page.evaluate(measureBandGeometry);
    return { png: await page.locator('#top').screenshot({ type: 'png' }), ...geometry };
  } finally {
    await context.close();
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   THE FLAT FIELD, JUSTIFIED AGAINST THE ACTUAL PHOTOGRAPH
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Where FLAT_FIELD_SRGB sits in the shipped rungs' own luminance distribution.
 *
 * This is context, not a gate: the assets are not in the repository by
 * default, `sharp` is an optional dependency of the pipeline, and a blend
 * property must be checkable without either. When both are present the line it
 * prints is what stops "why 128?" from ever being an unanswerable question.
 */
async function describeField() {
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    return 'flat field sRGB 128 — rung percentile not computed (sharp unavailable)';
  }
  const dir = join(REPO, 'public', 'brand', 'hero');
  const rungs = ['hero-l-1280.webp', 'hero-p-819.webp']
    .map((f) => join(dir, f))
    .filter((f) => existsSync(f));
  if (rungs.length === 0) return 'flat field sRGB 128 — no rungs on disk to compare it against';

  const parts = [];
  for (const file of rungs) {
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    const target = srgbToLinear(FLAT_FIELD_SRGB);
    let below = 0;
    for (let i = 0; i < n; i += 1) {
      if (relativeLuminance(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) <= target) below += 1;
    }
    parts.push(`${file.split('/').pop()} p${((below / n) * 100).toFixed(1)}`);
  }
  return `flat field sRGB ${FLAT_FIELD_SRGB} — brighter than this share of each rung: ${parts.join(', ')}`;
}

/* ════════════════════════════════════════════════════════════════════════════
   REPORTING
   ════════════════════════════════════════════════════════════════════════════ */

function fmt(n, places = 2) {
  return Number(n).toFixed(places);
}

function describeHotspot(h, viewport) {
  /* Which jamb, but only for a HORIZONTAL boundary: the two sides are separate
     stops in the pocket's mask and a defect can live in one and not the other.
     A vertical boundary is a row of the veil's own gradient and runs the whole
     width, so naming a side there would be noise dressed as information. */
  const side =
    h.axis === 'horizontal'
      ? h.x < viewport.width / 2
        ? 'left jamb'
        : 'right jamb'
      : 'runs the full width';
  /* How much span this transition would need to become imperceptible, read
     back out of the measured slope: S >= 10.5 x dL* at a 1.0 L* budget, and
     the local slope already IS (dL* / S) x 1.75 x 6 at the peak of a smoothstep. */
  const shortfall = h.windowDelta / MAX_WINDOW_DELTA_LSTAR;
  return (
    `      ${h.axis.padEnd(10)} boundary at (${h.x}, ${h.y}) in the band  [${side}]\n` +
    `        ${fmt(h.windowDelta)} L* across ${EDGE_WINDOW_PX}px  ` +
    `(${fmt(h.perPixel, 3)} L* per px, ${fmt(h.perDegree, 1)} per degree)  ` +
    `L* ${fmt(h.lstarLo, 1)} -> ${fmt(h.lstarHi, 1)} = sRGB ${lstarToSrgb(h.lstarLo)} -> ` +
    `${lstarToSrgb(h.lstarHi)}\n` +
    `        needs ${fmt(shortfall, 1)}x more span here than it has`
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   THE RUN
   ════════════════════════════════════════════════════════════════════════════ */

/** `#rgb`/`#rrggbb` -> L*, for the ground the page reports back. */
function lstarOfCss(colour) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return luminanceToLstar(relativeLuminance(r, g, b));
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(colour.trim());
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[,\s/]+/).map((n) => Number.parseFloat(n));
    return luminanceToLstar(relativeLuminance(r, g, b));
  }
  throw new Error(
    `the band reported --ground as ${JSON.stringify(colour)}, which this gate cannot read as ` +
      'a colour. Presence is measured as "one JND above the ground", so an unreadable ground ' +
      'is an unmeasurable hero — teach lstarOfCss() the new form rather than defaulting one.',
  );
}

async function measureAll({ browser, mode, url, extraCss, shotDir, bandHeightOf = null }) {
  const scrimCss = readFileSync(SCRIM_CSS_PATH, 'utf8');
  const tokens = extractTokens(readFileSync(GLOBALS_CSS_PATH, 'utf8'));

  const results = [];
  for (const viewport of VIEWPORTS) {
    const bandH = bandHeightOf ? bandHeightOf(viewport) : viewport.bandH;
    const html = harnessHtml({ tokens, scrimCss, extraCss, bandH });
    const shot =
      mode === 'page'
        ? await shootPage(browser, { width: viewport.width, height: viewport.height }, url)
        : await shootHarness(browser, { width: viewport.width, height: viewport.height }, html);
    if (shotDir) {
      mkdirSync(shotDir, { recursive: true });
      writeFileSync(
        join(shotDir, `blend-${mode}-${viewport.width}x${viewport.height}.png`),
        shot.png,
      );
    }
    const frame = analyseFrame(shot.png, viewport.width, {
      groundLstar: lstarOfCss(shot.ground),
      frameTop: shot.frameTop,
      frameH: shot.frameH,
    });
    results.push({ viewport, measured: shot, ...frame });
  }
  return results;
}

/**
 * ── THE DECLARED BUDGETS ─────────────────────────────────────────────────
 *
 * Both halves of this gate hold the design to a number the design itself is
 * allowed to choose — PROVIDED it chooses it out loud, in the stylesheet,
 * once, for every viewport.
 *
 * That proviso is the whole point and it is what separates this from a gate
 * that dictates taste. `min(100%, 106svh)` is not a decision about how much
 * of the hero should be flat ink; it is a bound in viewport units that
 * happens to meet a band whose height is set by how much copy it carries, and
 * the 35% that falls out of that meeting is a number nobody chose, nobody
 * wrote down, and nobody notices changing when a line of copy is added. A
 * budget declared as a custom property is the opposite of that in every
 * respect: explicit, designed, documented, and diffable.
 *
 *   --hero-picture-budget   the smallest share of the band that must show the
 *                           photograph. Omit it and the floor is the
 *                           reference's own measured 100%, less one edge
 *                           window of rows for a bottom-edge transition.
 *
 * MEDIA-QUERIED COPIES ARE REJECTED, and that is not pedantry. A budget that
 * varies by viewport is a budget being fitted to whatever each viewport
 * happens to produce, which is the accident this gate exists to end. One
 * number, held everywhere, or the number means nothing.
 */
const BUDGET_PROP = '--hero-picture-budget';

function readDeclaredBudgets(scrimCss) {
  const css = scrimCss.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const all = [...css.matchAll(
    new RegExp(`${BUDGET_PROP}\\s*:\\s*([0-9.]+)%`, 'g'),
  )].map((m) => Number.parseFloat(m[1]) / 100);
  if (all.length === 0) return { value: null, count: 0, conflicting: false };
  const unique = [...new Set(all.map((v) => v.toFixed(6)))];
  return { value: Math.min(...all), count: all.length, conflicting: unique.length > 1 };
}

/**
 * The floor for one MEASURED band. `bandH` is the height the browser actually
 * laid out, not the table's expectation — a calibration case that reproduces
 * another hero's geometry has a different band, and its tolerance has to be a
 * share of ITS rows.
 */
function presenceFloorFor(result, declared) {
  if (declared.value !== null) return declared.value;
  const bandH = result.height ?? result.viewport?.bandH ?? 1;
  return REFERENCE_PRESENCE - presenceTolerance(bandH);
}

function verdict(results, { declared = { value: null, count: 0, conflicting: false } } = {}) {
  const edgeFailures = results.filter(
    (r) => r.worst !== null && r.worst.windowDelta > MAX_WINDOW_DELTA_LSTAR,
  );
  const salienceFailures = results.filter(
    (r) => r.salience !== null && r.salience.peak > SALIENCE_LIMIT,
  );
  const enclosureFailures = results.filter(
    (r) => r.salience !== null && r.salience.enclosedPeak > SALIENCE_LIMIT,
  );
  const presenceFailures = results.filter(
    (r) => r.presence !== null && r.presence.band + 1e-9 < presenceFloorFor(r, declared),
  );
  return {
    edge: { pass: edgeFailures.length === 0, failures: edgeFailures },
    salience: { pass: salienceFailures.length === 0, failures: salienceFailures },
    enclosure: { pass: enclosureFailures.length === 0, failures: enclosureFailures },
    presence: { pass: presenceFailures.length === 0, failures: presenceFailures, declared },
    pass:
      edgeFailures.length === 0 &&
      salienceFailures.length === 0 &&
      enclosureFailures.length === 0 &&
      presenceFailures.length === 0 &&
      !declared.conflicting,
    failures: [...edgeFailures, ...salienceFailures, ...enclosureFailures, ...presenceFailures],
  };
}

function report(results, { label, quiet, declared = { value: null } }) {
  const lines = [];
  lines.push(`  ${label}`);
  for (const r of results) {
    const worst = r.worst;
    const ok = worst === null || worst.windowDelta <= MAX_WINDOW_DELTA_LSTAR;
    const over = worst === null ? 0 : worst.windowDelta / MAX_WINDOW_DELTA_LSTAR;
    lines.push(
      `    EDGE      ${ok ? 'PASS' : 'FAIL'}  ${String(r.viewport.width).padStart(4)}x${r.viewport.height}  ` +
        `worst ${fmt(worst?.windowDelta ?? 0).padStart(6)} L*/${EDGE_WINDOW_PX}px  ` +
        `(limit ${fmt(MAX_WINDOW_DELTA_LSTAR)}${ok ? `, ${fmt(1 / over, 1)}x margin` : `, ${fmt(over, 1)}x over`})` +
        `  — ${r.viewport.note}`,
    );
    if (!quiet) {
      for (const h of r.hotspots.slice(0, ok ? 1 : 3)) lines.push(describeHotspot(h, r.viewport));
    }

    if (r.salience) {
      const s = r.salience;
      const sOk = s.peak <= SALIENCE_LIMIT;
      const ratio = s.peak / SALIENCE_LIMIT;
      lines.push(
        `    SALIENCE  ${sOk ? 'PASS' : 'FAIL'}  ${String(r.viewport.width).padStart(4)}x${r.viewport.height}  ` +
          `peak ${fmt(s.peak).padStart(6)} step-equivalent L*  ` +
          `(limit ${fmt(SALIENCE_LIMIT)}${sOk ? `, ${fmt(1 / Math.max(ratio, 1e-9), 1)}x margin` : `, ${fmt(ratio, 1)}x over`})` +
          `  at ${fmt(s.worst.cpd, 1)} cyc/deg`,
      );
      lines.push(
        `      orientation  VERTICAL structure ${fmt(s.vertPeak).padStart(6)} ` +
          `(a jamb; nothing in a photograph makes one)   ` +
          `horizontal ${fmt(s.horzPeak).padStart(6)} (a sky or a vignette)`,
      );
      const eOk = s.enclosedPeak <= SALIENCE_LIMIT;
      lines.push(
        `    ENCLOSURE ${eOk ? 'PASS' : 'FAIL'}  ${String(r.viewport.width).padStart(4)}x${r.viewport.height}  ` +
          `peak ${fmt(s.enclosedPeak).padStart(6)} closes INSIDE the picture  ` +
          `(limit ${fmt(SALIENCE_LIMIT)})  — ` +
          `${eOk ? 'nothing the scene could not have made' : 'A SHAPE LAID ON THE PHOTOGRAPH'}`,
      );
      if (!quiet) {
        lines.push(
          `        channels  ${s.channels
            .map(
              (c) =>
                `${fmt(c.cpd, 1)}cpd ${fmt(c.peak)}` +
                ` (raw ${fmt(c.rawPeak, 1)} x w ${fmt(c.weight, 2)})`,
            )
            .join('   ')}`,
        );
        const st = s.structure;
        lines.push(
          `        feature   ${st.shape}` +
            (st.box === null
              ? ''
              : `, ${st.box.width}x${st.box.height}px at (${st.box.x}, ${st.box.y}), ` +
                `${fmt(st.fill * 100, 0)}% filled, touching ${st.borders} of 4 borders`),
        );
        lines.push(
          `        extent    ${fmt(st.aboveShare * 100, 2)}% of the band is above the visibility ` +
            `threshold at ${fmt(s.worst.cpd, 1)} cyc/deg; worst point (${s.worst.at.x}, ${s.worst.at.y})`,
        );
        lines.push(
          `        worst jamb  ${fmt(s.vertPeak)} at (${s.vertWorst.vertAt.x}, ${s.vertWorst.vertAt.y}), ` +
            `${fmt(s.vertWorst.cpd, 1)} cyc/deg`,
        );
      }
    }

    if (r.presence) {
      const p = r.presence;
      const floor = presenceFloorFor(r, declared);
      const pOk = p.band + 1e-9 >= floor;
      lines.push(
        `    PRESENCE  ${pOk ? 'PASS' : 'FAIL'}  ${String(r.viewport.width).padStart(4)}x${r.viewport.height}  ` +
          `${fmt(p.band * 100, 1).padStart(5)}% of the band shows the photograph  ` +
          `(floor ${fmt(floor * 100, 1)}%)`,
      );
      if (!quiet) {
        const bareRows = Math.round(p.bareShare * r.height);
        lines.push(
          `        in-frame  ${fmt(p.inFrame * 100, 1).padStart(5)}% of the ${p.frameRows}px that HAVE a photograph ` +
            `behind them are distinguishable from flat ink`,
        );
        lines.push(
          `        bare      ${fmt(p.bareShare * 100, 1).padStart(5)}% of the band (${bareRows}px) has NO photograph ` +
            'behind it — `.frame` stops there',
        );
        lines.push(
          `        darkest   L* ${fmt(p.darkest, 1)} against a ground of ${fmt(p.groundLstar, 1)}` +
            (p.darkestInFrame === null
              ? ''
              : `; inside the frame L* ${fmt(p.darkestInFrame, 1)}`),
        );
      }
    }

    if (!quiet) {
      lines.push(
        `        band ${r.width}x${r.height}px, L* ${fmt(r.lstarRange[0], 1)}..${fmt(r.lstarRange[1], 1)}, ` +
          `peak curvature ${fmt(r.worstCurvature)} L* (Mach diagnostic)`,
      );
    }
  }
  return lines.join('\n');
}

const HEADER = `
scripts/check-hero-blend.mjs — NO VISIBLE EDGE, AND A VISIBLE PHOTOGRAPH

  EDGE       nowhere in the hero may L* change by more than
             ${fmt(MAX_WINDOW_DELTA_LSTAR)} across ${EDGE_WINDOW_PX} CSS pixels
  from       1 CSS px = ${fmt(1 / PX_PER_DEGREE, 5)} deg  ->  ${fmt(PX_PER_DEGREE, 2)} px per degree
             CSF peaks at ~4 cyc/deg -> a transition occupies ${EDGE_WINDOW_PX} px
             CIE dE*ab = 1 is one JND -> ${fmt(JND_LSTAR)} L* is the budget
             = ${fmt(MAX_WINDOW_DELTA_LSTAR / EDGE_WINDOW_PX, 3)} L* per px, ${fmt((MAX_WINDOW_DELTA_LSTAR / EDGE_WINDOW_PX) * PX_PER_DEGREE, 1)} L* per degree of visual angle

  SALIENCE   no visual channel may resolve a feature in the veil: the
             CSF-weighted band-pass response, anywhere, at any of the
             ${CSF_BAND_CPD.length} channels, must stay under ${fmt(SALIENCE_LIMIT)} step-equivalent L*
  from       a difference of Gaussians (centre:surround ${fmt(DOG_SURROUND_RATIO, 1)}) per octave,
             normalised by its own MEASURED response to a 1 L* hard step
             (${measureStepGain().map((g) => fmt(g, 4)).join(', ')}; analytic ${fmt(ANALYTIC_STEP_GAIN, 4)}),
             then weighted by Mannos & Sakrison's CSF relative to its peak:
${CSF_BAND_CPD.map((f) => `             ${fmt(f, 1).padStart(4)} cyc/deg   sigma ${fmt(sigmaForCpd(f), 2).padStart(5)} px   weight ${fmt(csfWeight(f), 3)}`).join('\n')}
             1 unit = a hard step of one CIE JND. A wash is invisible
             because it lives BELOW these frequencies, not because its
             slope is small — which is why SPAN, not shape, is the lever:
             this number falls as 1/span^2 where EDGE falls as 1/span.

  PRESENCE   the share of the hero band where the photograph is at least
             ${fmt(PRESENCE_JND_LSTAR)} L* — one JND — above bare --ground, so a reader can
             tell it apart from flat ink
  from       the reference measures ${fmt(REFERENCE_PRESENCE * 100, 1)}% (rendered by --calibrate);
             this palette's deepest required alpha still leaves the field
             6.2 L* above ground, so no contrast requirement costs presence;
             one edge window of rows is allowed for a bottom-edge transition
  or         declare ${BUDGET_PROP} in the scrim, once, for all viewports

  ENCLOSURE  and of whatever IS resolvable, nothing may form a shape that
             closes INSIDE the picture — no component of the above-threshold
             response may avoid every border of the frame
  from       a photograph's own shading always runs off the edge of the crop.
             A pocket bounded to the page measure does not. This is the only
             number here that is worse for this page than for MAVTERRAS at
             every viewport where the owner can see the defect.

  ⚠ NO DERIVATIVE METRIC IS A GATE ON ITS OWN. An opaque veil — the
    photograph completely obliterated — scores 0.00 on EDGE, 0.00 on SALIENCE
    and 0.00 on ENCLOSURE, and passes all three with infinite margin.
    \`--calibrate\` renders that case and asserts on it. The halves pull
    against each other on purpose: three of them are satisfied by a black
    rectangle, the fourth by no veil at all.

  measured over  a flat neutral field, with the hero's content hidden, so
                 every gradient in the frame belongs to the veil alone
`;

async function main(argv) {
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const calibrate = argv.includes('--calibrate');
  const pageIndex = argv.indexOf('--page');
  const url = pageIndex >= 0 ? argv[pageIndex + 1] : null;
  const shotIndex = argv.indexOf('--shots');
  const shotDir = shotIndex >= 0 ? argv[shotIndex + 1] : null;

  if (pageIndex >= 0 && !url) throw new Error('--page needs a URL');

  const out = [];
  const emit = (s) => {
    if (!json) out.push(s);
  };

  emit(HEADER);
  emit(`  ${await describeField()}\n`);

  const declared = readDeclaredBudgets(readFileSync(SCRIM_CSS_PATH, 'utf8'));
  emit(
    declared.value === null
      ? `  ${BUDGET_PROP} is not declared — the presence floor is the reference's own.\n`
      : `  ${BUDGET_PROP} declared at ${fmt(declared.value * 100, 1)}% ` +
        `(${declared.count} declaration${declared.count === 1 ? '' : 's'}).\n`,
  );

  const payload = await withBrowser(async (browser) => {
    const shipped = await measureAll({
      browser,
      mode: url ? 'page' : 'harness',
      url,
      shotDir,
    });
    const shippedVerdict = verdict(shipped, { declared });
    emit(
      report(shipped, {
        label: url
          ? `THE SHIPPED SCRIM, rendered from ${url}`
          : 'THE SHIPPED SCRIM (components/site/hero-scrim.module.css, over the flat field)',
        quiet,
        declared,
      }),
    );

    const calibration = {};
    if (calibrate) {
      for (const [name, css] of Object.entries(SYNTHETIC)) {
        const svh = CALIBRATION_CONTRACT[name].bandSvh ?? null;
        const r = await measureAll({
          browser,
          mode: 'harness',
          extraCss: css,
          shotDir,
          /* A synthetic that reproduces another hero's geometry has to be
             rendered at that hero's band height, or its gradients — whose
             stops are percentages of their own box — are stretched over a box
             they were never drawn for, and the result is a measurement of the
             stretch rather than of the design. */
          bandHeightOf: svh === null ? null : (vp) => Math.round((svh / 100) * vp.height),
        });
        /* The calibration cases are judged against the DERIVED floor, never
           against a budget the stylesheet declares. A design that lowers its
           own budget must not be able to move the instrument's own proof. */
        const v = verdict(r, { declared: { value: null, count: 0, conflicting: false } });
        calibration[name] = {
          edge: v.edge.pass,
          salience: v.salience.pass,
          enclosure: v.enclosure.pass,
          presence: v.presence.pass,
          peakSalience: Math.max(...r.map((x) => x.salience?.peak ?? 0)),
          peakEnclosed: Math.max(...r.map((x) => x.salience?.enclosedPeak ?? 0)),
          peakVertical: Math.max(...r.map((x) => x.salience?.vertPeak ?? 0)),
          results: r,
        };
        emit('');
        emit(
          report(r, {
            label: `CALIBRATION [${name}] — ${CALIBRATION_CONTRACT[name].why}\n` +
              `      must be: EDGE ${CALIBRATION_CONTRACT[name].edge ? 'PASS' : 'FAIL'}` +
              (CALIBRATION_CONTRACT[name].salience === null
                ? ', SALIENCE not asserted'
                : `, SALIENCE ${CALIBRATION_CONTRACT[name].salience ? 'PASS' : 'FAIL'}`) +
              (CALIBRATION_CONTRACT[name].enclosure === null ||
              CALIBRATION_CONTRACT[name].enclosure === undefined
                ? ', ENCLOSURE not asserted'
                : `, ENCLOSURE ${CALIBRATION_CONTRACT[name].enclosure ? 'PASS' : 'FAIL'}`) +
              (CALIBRATION_CONTRACT[name].presence === null
                ? ', PRESENCE not asserted'
                : `, PRESENCE ${CALIBRATION_CONTRACT[name].presence ? 'PASS' : 'FAIL'}`),
            quiet: true,
          }),
        );
      }
    }

    return { shipped, shippedVerdict, calibration };
  });

  const { shipped, shippedVerdict, calibration } = payload;

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          threshold: {
            maxWindowDeltaLstar: MAX_WINDOW_DELTA_LSTAR,
            edgeWindowPx: EDGE_WINDOW_PX,
            pxPerDegree: PX_PER_DEGREE,
            flatFieldSrgb: FLAT_FIELD_SRGB,
          },
          presence: {
            referencePresence: REFERENCE_PRESENCE,
            jndLstar: PRESENCE_JND_LSTAR,
            declaredBudget: declared.value,
          },
          salienceModel: {
            limit: SALIENCE_LIMIT,
            channelsCpd: CSF_BAND_CPD,
            surroundRatio: DOG_SURROUND_RATIO,
            sigmaPx: CSF_BAND_CPD.map((f) => sigmaForCpd(f)),
            csfWeights: CSF_BAND_CPD.map((f) => csfWeight(f)),
            stepGainMeasured: measureStepGain(),
            stepGainAnalytic: ANALYTIC_STEP_GAIN,
          },
          mode: url ? 'page' : 'harness',
          pass: shippedVerdict.pass,
          edgePass: shippedVerdict.edge.pass,
          saliencePass: shippedVerdict.salience.pass,
          enclosurePass: shippedVerdict.enclosure.pass,
          presencePass: shippedVerdict.presence.pass,
          viewports: shipped.map((r) => ({
            width: r.viewport.width,
            height: r.viewport.height,
            pass: r.worst === null || r.worst.windowDelta <= MAX_WINDOW_DELTA_LSTAR,
            saliencePass: r.salience === null || r.salience.peak <= SALIENCE_LIMIT,
            enclosurePass: r.salience === null || r.salience.enclosedPeak <= SALIENCE_LIMIT,
            worst: r.worst,
            hotspots: r.hotspots,
            worstCurvature: r.worstCurvature,
            salience: r.salience,
            bandH: r.viewport.bandH,
            presence: r.presence,
            presenceFloor: presenceFloorFor(r, declared),
          })),
          calibration: Object.fromEntries(
            Object.entries(calibration).map(([k, v]) => [
              k,
              {
                /*
                  `pass` IS THE EDGE VERDICT, AND IT STAYS THAT WAY.

                  tests/e2e/hero-blend.spec.ts asserts `calibration.plate.pass
                  === false` and `calibration.soft.pass === true`, and both of
                  those are claims about the EDGE instrument — they were
                  written before presence existed and they are still exactly
                  right about what they assert. Redefining `pass` to mean
                  "met both halves" would have flipped `soft` to false (it is
                  a shape study and was never deep enough to be present
                  everywhere) and broken a spec that is not wrong.

                  The two halves are published separately alongside it. A
                  consumer that wants the whole verdict reads the top-level
                  `pass`, which does include presence.
                */
                pass: v.edge,
                edge: v.edge,
                salience: v.salience,
                enclosure: v.enclosure,
                peakSalience: v.peakSalience,
                peakEnclosed: v.peakEnclosed,
                peakVertical: v.peakVertical,
                presence: v.presence,
                /* Per-viewport, compactly, so a future round can DIFF the
                   reference rather than re-argue it from an impression. The
                   full result objects are not published: they carry the
                   hotspot lists and the structure boxes, which are megabytes
                   across eight cases and four viewports. */
                viewports: v.results.map((x) => ({
                  width: x.viewport.width,
                  height: x.viewport.height,
                  edge: x.worst === null ? 0 : x.worst.windowDelta,
                  salience: x.salience?.peak ?? null,
                  vertical: x.salience?.vertPeak ?? null,
                  horizontal: x.salience?.horzPeak ?? null,
                  enclosed: x.salience?.enclosedPeak ?? null,
                  structure: x.salience?.structure ?? null,
                  presence: x.presence?.band ?? null,
                })),
                contract: CALIBRATION_CONTRACT[k],
              },
            ]),
          ),
        },
        null,
        2,
      )}\n`,
    );
  } else {
    out.push('');
    if (declared.conflicting) {
      out.push(`  FAIL — ${BUDGET_PROP} is declared more than once with different values.`);
      out.push('');
      out.push('  A picture budget that varies by viewport is a budget being fitted to');
      out.push('  whatever each viewport happens to produce, which is exactly the accident');
      out.push('  this gate exists to end. Declare it once, for every viewport, or not at all.');
    }
    if (shippedVerdict.edge.pass) {
      out.push('  EDGE     PASS — no perceptible boundary anywhere in the veil.');
    } else {
      out.push('  EDGE     FAIL — the veil has a visible edge. Coordinates are listed above.');
    }
    if (shippedVerdict.salience.pass) {
      out.push('  SALIENCE PASS — no visual channel can resolve a feature in the veil.');
    } else {
      const worst = [...shippedVerdict.salience.failures].sort(
        (a, b) => b.salience.peak - a.salience.peak,
      )[0];
      const s = worst.salience;
      out.push(
        `  SALIENCE FAIL — ${s.structure.shape}, ` +
          `${fmt(s.peak, 1)}x the visibility threshold at ${worst.viewport.width}px.`,
      );
    }
    if (shippedVerdict.enclosure.pass) {
      out.push('  ENCLOSURE PASS — nothing resolvable closes inside the picture.');
    } else {
      const worst = [...shippedVerdict.enclosure.failures].sort(
        (a, b) => b.salience.enclosedPeak - a.salience.enclosedPeak,
      )[0];
      const box = worst.salience.structure.box;
      out.push(
        `  ENCLOSURE FAIL — a resolvable feature CLOSES INSIDE THE PICTURE at ` +
          `${worst.viewport.width}x${worst.viewport.height}` +
          (box === null
            ? '.'
            : `: ${box.width}x${box.height}px at (${box.x}, ${box.y}), ` +
              `${fmt(worst.salience.structure.fill * 100, 0)}% filled.`),
      );
      out.push(
        `  It reads as a shape laid ON the photograph rather than as the photograph's own ` +
          `shading,\n  which is the sentence the owner keeps writing. Vertical structure ` +
          `${fmt(worst.salience.vertPeak)} against horizontal ${fmt(worst.salience.horzPeak)}.`,
      );
    }
    if (shippedVerdict.presence.pass) {
      out.push('  PRESENCE PASS — the photograph is visible across the band.');
    } else {
      const worst = [...shippedVerdict.presence.failures]
        .sort((a, b) => a.presence.band - b.presence.band)[0];
      out.push('  PRESENCE FAIL — most of the hero shows no photograph.');
      out.push('');
      out.push(`  Worst at ${worst.viewport.width}x${worst.viewport.height}: ` +
        `${fmt(worst.presence.band * 100, 1)}% of the band is distinguishable from flat ink,`);
      out.push(`  against a floor of ${fmt(presenceFloorFor(worst, declared) * 100, 1)}%. ` +
        'The shortfall has two independent causes and');
      out.push('  they need different fixes:');
      out.push('');
      out.push(`    COVERAGE  ${fmt(worst.presence.bareShare * 100, 1)}% of that band ` +
        `(${Math.round(worst.presence.bareShare * worst.height)}px) has no photograph behind it at all.`);
      out.push('              `.frame` is bounded in VIEWPORT units while the band\'s height is set');
      out.push('              by how much copy it carries, so the shortfall between them is not a');
      out.push('              designed value — it is what those two unrelated numbers happen to');
      out.push('              leave over, and it grows every time a line of copy is added.');
      out.push('              Fix: bound the photo box against the BAND, and move the veil\'s');
      out.push('              dissolve with it (scripts/check-hero-contrast.mjs check F holds the');
      out.push('              two together). Or declare the shortfall on purpose.');
      out.push('');
      out.push(`    DEPTH     of the ${worst.presence.frameRows}px that DO have a photograph, ` +
        `${fmt((1 - worst.presence.inFrame) * 100, 1)}% is veiled past the`);
      out.push('              point where a reader can tell it from flat ink. That is not a');
      out.push('              contrast requirement: this palette\'s deepest required alpha still');
      out.push('              leaves the field 6.2 L* above ground, six times the JND.');
      out.push('              Fix: the veil only has to reach its floor where the GLYPHS are.');
      out.push('');
      out.push('  Neither is fixed by lowering a threshold here, and neither is fixed by');
      out.push('  widening a falloff. If the design genuinely wants a hero that is part flat');
      out.push(`  ink, declare ${BUDGET_PROP} in the scrim and this gate will hold it`);
      out.push('  to that number instead of to the reference\'s.');
    }
    if (!shippedVerdict.edge.pass || !shippedVerdict.salience.pass) {
      out.push('');
      out.push('  NEITHER IS FIXED BY MAKING THE SCRIM LIGHTER — the dark core still has to cover');
      out.push('  every glyph, and scripts/check-hero-contrast.mjs owns that ceiling and must stay');
      out.push('  green. AND NEITHER IS FIXED BY EASING THE SHAPE. Both are fixed by SPAN. The span');
      out.push('  each gate asks for, solved from its own closed form so nobody re-derives it:');
      out.push('');
      out.push('    shape         EDGE needs      SALIENCE needs');
      out.push('    straight       6.0 x dL*        9.1 x dL*   <- 1.5x more, which is exactly');
      out.push('                                                  why the `knee` case passes EDGE');
      out.push('    smoothstep    10.5 x dL*       10.6 x dL*   <- the two agree');
      out.push('');
      out.push('  SO BOTH GATES WANT THE SAME ~350px AT THIS DEPTH, AND DIVERGE ENTIRELY IN WHAT');
      out.push('  THEY DO WHEN YOU MISS IT. EDGE falls as 1/span, SALIENCE as 1/span^2, so at the');
      out.push('  96px gutter a smoothstep of this depth measures 3.7 on EDGE and 13.6 on SALIENCE.');
      out.push('  Falling short is punished quadratically and overshooting rewarded quadratically,');
      out.push('  and no shape escapes it: at a FIXED span, easing a ramp makes SALIENCE WORSE');
      out.push('  (1.15 -> 1.60 at 280px), because a smoothstep is 1.5x steeper in its middle than');
      out.push('  the straight ramp it replaces. `--calibrate` renders both. The span has to come');
      out.push('  from somewhere other than the shape, and it has to live OUTSIDE the text extent');
      out.push('  or the contrast gate takes it back.');
    }
    if (!shippedVerdict.enclosure.pass) {
      out.push('');
      out.push('  ON THE ENCLOSURE FAILURE, WHICH IS THE ONE THE OWNER IS DESCRIBING. It is not a');
      out.push('  magnitude problem and it does not respond to depth: MAVTERRAS is DARKER than this');
      out.push('  page over its copy and scores worse on every magnitude metric here, and the owner');
      out.push('  calls it elegant. What it does not have is a boundary that closes inside the');
      out.push('  picture. Its falloff exits the frame, so there is no shape to see.');
      out.push('');
      out.push('  The lever is TOPOLOGY, not strength. A falloff scoped to the dead space outside');
      out.push('  the page measure MUST terminate inside the frame — that is what "scoped to the');
      out.push('  gutter" means — and a boundary that terminates inside the frame is a boundary.');
      out.push('  Scope it to the FRAME instead and it has nowhere to close. The price is that the');
      out.push('  margins darken too, which is the trade this round was authorised to make.');
    }
    process.stdout.write(`${out.join('\n')}\n`);
  }

  /*
    --calibrate is an assertion about the INSTRUMENT, not about the page. Every
    case is held to CALIBRATION_CONTRACT, and the blackout row is the one that
    matters most: it must pass EDGE and fail PRESENCE. A run where a blackout
    passes both is a run where this file has gone back to measuring only
    slopes, and nothing else it prints can be trusted.
  */
  if (calibrate) {
    const broken = [];
    for (const [name, want] of Object.entries(CALIBRATION_CONTRACT)) {
      const got = calibration[name];
      if (!got) continue;
      if (got.edge !== want.edge) {
        broken.push(
          `[${name}] EDGE ${got.edge ? 'PASSED' : 'FAILED'} but must ` +
            `${want.edge ? 'PASS' : 'FAIL'} — ${want.why}`,
        );
      }
      if (want.salience !== undefined && want.salience !== null && got.salience !== want.salience) {
        broken.push(
          `[${name}] SALIENCE ${got.salience ? 'PASSED' : 'FAILED'} (peak ` +
            `${fmt(got.peakSalience)}) but must ${want.salience ? 'PASS' : 'FAIL'} — ${want.why}`,
        );
      }
      if (want.enclosure !== undefined && want.enclosure !== null && got.enclosure !== want.enclosure) {
        broken.push(
          `[${name}] ENCLOSURE ${got.enclosure ? 'PASSED' : 'FAILED'} (peak ` +
            `${fmt(got.peakEnclosed)}) but must ${want.enclosure ? 'PASS' : 'FAIL'} — ${want.why}`,
        );
      }
      if (want.presence !== null && got.presence !== want.presence) {
        broken.push(
          `[${name}] PRESENCE ${got.presence ? 'PASSED' : 'FAILED'} but must ` +
            `${want.presence ? 'PASS' : 'FAIL'} — ${want.why}`,
        );
      }
    }
    if (broken.length > 0) {
      process.stderr.write(`\n  INSTRUMENT BROKEN:\n    ${broken.join('\n    ')}\n`);
      return 2;
    }
    if (!json) {
      process.stdout.write(
        '\n  calibration OK — eight cases, four viewports, every contract met:\n' +
          '    flat        0.00 everywhere      the instrument reads nothing when there is nothing\n' +
          '    plate      42.58 / 34.83         a hard edge, caught by EDGE and SALIENCE alike\n' +
          '    knee        0.92 / 1.15          EDGE PASSES IT, SALIENCE DOES NOT — the Mach knee\n' +
          '                                     round five predicted the old gate could not see\n' +
          '    smoothstep  0.74 / 0.37          1.875x the span: EDGE falls 1.2x, SALIENCE 3.1x\n' +
          '    wash        0.51 / 0.73          a falloff that never completes — passes everything\n' +
          '    blackout    0.00 on all three derivative metrics; PRESENCE is what fails it\n' +
          '    reference   FAILS EDGE, SALIENCE AND ENCLOSURE — worse than this page at 375\n' +
          '                and 768 on both magnitudes. See the header: that is the finding.\n',
      );
    }
  }

  return shippedVerdict.pass ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`\ncheck-hero-blend: ${error.message}\n`);
      process.exitCode = 2;
    });
}
