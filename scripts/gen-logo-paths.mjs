#!/usr/bin/env node
/**
 * gen-logo-paths.mjs — the brand mark's outlines, derived from the artwork
 * rather than typed.
 *
 *     node scripts/gen-logo-paths.mjs            # retrace and write
 *     node scripts/gen-logo-paths.mjs --check    # exit 1 if the mark has drifted
 *     node scripts/gen-logo-paths.mjs --verbose  # per-glyph measurement table
 *
 * Reads   public/brand/logo-source.png             (2046x769, RGBA, straight alpha)
 * Writes  components/site/intro/LogoReveal.tsx     (ONE fenced block — see BOUNDARY)
 *         components/site/intro/logo-trace.json    (the manifest)
 *
 * Deterministic: integer-keyed contour chaining, a fixed fit order and a fixed
 * rounding, so the same PNG through the same libvips produces byte-identical
 * output. `--check` is that property turned into a gate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS — A SMUDGED N, AND A TRACER THAT DID NOT
 *
 * The owner's complaint was specific and correct: "the letter after the
 * animation a bit smudges … the logo-source.png looks clear but after render at
 * the end of the animation it looks a bit smudged." The letter is the N of
 * NGUYEN, and it was not the animation, the halo, the masks or the veil. It was
 * the path data. THE FIRST N'S UPPER-RIGHT COUNTER WAS FILLED IN — the outline
 * ran straight across the top from the left serif to the right stem, so the
 * triangle between the diagonal and the right stem was enclosed by the contour
 * and painted solid.
 *
 * Measured on that glyph alone, shipped trace against the source alpha:
 *
 *     max inscribed disc      18.4 -> 41.6 units   (a 42-unit disc only fits
 *                                                   if the counter is solid)
 *     ink area                +43.7%
 *     5th-pct row run          4.70 -> 2.23 px     (the hairlines went with it)
 *     thin/thick ratio         5.1  -> 23.8
 *
 * The LAST N of the same word, same letter, same file, was correct. One glyph
 * good, one blobbed — which is the signature of a tracer that lost a run of
 * contour points, not of a resolution limit.
 *
 * AND NOTHING IN THE REPOSITORY COULD REGENERATE EITHER OF THEM. The paths came
 * from a one-off process that no longer existed; `LogoReveal.tsx` said "IF THE
 * VECTOR ORIGINAL SURFACES, RE-RUN THE TRACE" about a trace that could not be
 * re-run. That is the defect this file actually fixes. The smudge is the
 * symptom; an ungenerated generated artifact is the disease, and hand-repairing
 * one cubic would have left it in place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROOT CAUSE, REPRODUCED
 *
 * The old trace's own provenance note records its parameters: "Ramer-Douglas-
 * Peucker at 0.35 px, then Schneider least-squares cubic fitting at 0.9 px
 * tolerance with corner detection at 58 degrees."
 *
 * Set this pipeline to those three numbers and it reproduces the whole defect,
 * signature by signature — 35 gate failures, curve deviations to 10.06 px, and
 * on the wordmark specifically:
 *
 *     the first N   max inscribed disc  18.4 -> 21.3 units, the counter closing
 *     the last N    ink topology        1 connected part -> 3
 *     the last N    thick/thin ratio    4.9 -> 14.6   (the typeface, destroyed)
 *     the monogram N thick/thin ratio   3.8 -> 17.0
 *     the D of DUY  thick/thin ratio    1.6 -> 3.2
 *     whole mark    added 3.55%, removed 6.06%
 *
 * ⚠ AND THE BLAME DOES NOT FALL WHERE IT FIRST APPEARED TO. The obvious suspect
 * is the 58-degree corner threshold, and an early bisection here seemed to
 * convict it: holding RDP at 0.05 px, the D of DUY's bowl counter was open at 44
 * degrees and FILLED SOLID at 46 (+148% ink, max inscribed disc 19.0 -> 104.0).
 * A clean cliff, two degrees wide, with the shipped value sitting past it.
 *
 * That conclusion was an artefact of the other parameter. Isolate them:
 *
 *     rdp 0.35, tol 0.9, ang 58   35 gate failures, dev 10.06 px  (as shipped)
 *     rdp 0.35, tol 0.3, ang 36   11 gate failures, dev  2.06 px
 *     rdp 0.05, tol 0.3, ang 46    2 gate failures, dev  1.38 px
 *     rdp 0,    tol 0.3, ang 58    2 gate failures, dev  0.40 px
 *     rdp 0,    tol 0.3, ang 36    0 gate failures, dev  0.40 px  (shipped now)
 *
 * A LOOSE CORNER THRESHOLD ON ITS OWN IS ALMOST HARMLESS — 58 degrees with no
 * decimation costs two hairline warnings and nothing else. THE DECIMATION IS THE
 * CAUSE, and the corner threshold is how it becomes a filled counter.
 *
 * The mechanism, once the two are put together, is simple. A counter's outline
 * turns through a hairpin where it enters and leaves. RDP keeps the points that
 * are FAR FROM THE CHORD of a run, which is exactly the wrong criterion at a
 * hairpin: the tip's own points sit close to the chord back out, so they are the
 * first thing thrown away. The corner detector then reads a polyline in which
 * the corner is no longer represented, misses it at any threshold it could
 * plausibly use, and hands the fitter both sides of the hairpin as one smooth
 * run. The least-squares cubic through a hairpin is the chord across its mouth.
 * The counter is then inside the contour and `fill-rule: evenodd` paints it.
 *
 * So the fix is not a better threshold. It is to stop deciding, before the
 * fitter runs, which points matter. See RDP_EPSILON.
 *
 * Whole-mark disagreement against the source alpha, both traces rendered by the
 * same code into the same box at the source's own resolution:
 *
 *     shipped trace     added 8.48%   removed 7.44%
 *     this trace        added 0.64%   removed 0.79%
 *
 * FOUR THINGS THAT HAD TO BE TRUE, AND HOW EACH IS ENFORCED
 *
 * They are the gates in the SCORE and GATES sections, and every one is measured
 * per glyph on the RENDERED result. None of them is asserted.
 *
 *   1. COUNTERS STAY OPEN. Every enclosed background region of the source
 *      survives, and no new one appears. Counted as 4-connected background
 *      components inside each glyph's own box that do not touch its border,
 *      before and after. Backed by the MAXIMUM INSCRIBED DISC, which is the
 *      statistic that actually catches a fill: a closed counter is a large empty
 *      space with ink all round it, so the largest disc that fits inside the ink
 *      jumps. On the shipped N it jumped 2.3x. The gate is +15%; the defect is
 *      +126%, so there is a factor of eight between the alarm and the fault.
 *
 *      Counting holes alone would NOT have caught this mark's own worst glyph:
 *      an N's counters are open bays, not enclosed holes, so the source and the
 *      broken trace agree at zero. The disc is what sees a bay close.
 *
 *   2. HAIRLINES DO NOT GROW. Stroke width is the SUB-PIXEL run length along
 *      every row and every column: a maximal run of the half-coverage mask,
 *      integrated over its own antialiased shoulders, which is exact for a
 *      straight edge. The 5th percentile of that distribution is the glyph's
 *      hairline. It may not grow more than 15%; measured worst here is +8.4%.
 *
 *   3. THE THICK/THIN CONTRAST SURVIVES. This is a high-contrast serif —
 *      hairline verticals, heavy diagonals — and a trace that fattens the thin
 *      strokes destroys the typeface while leaving the ink area almost right.
 *      p95/p5 of the same run distribution, per glyph, against the source's.
 *
 *   4. CORNERS ARE NOT ROUNDED. Serif brackets and the N's apex are high
 *      curvature. Every raw marching-squares point must lie within
 *      FIT_MAX_DEVIATION of the emitted curve, sampled at eight points per
 *      source pixel of arc — not at the fitter's own parameter values, which is
 *      how a fitter grades its own homework.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE MEASUREMENT TRAPS, ALL OF WHICH THIS PIPELINE FELL INTO FIRST
 *
 * Each produced a confident wrong answer, and the next person to touch these
 * numbers will meet all three.
 *
 *   A. THE HALF PIXEL. The alpha grid is sampled at PIXEL CENTRES, so the level
 *      set marching squares returns lives in centre coordinates — while SVG user
 *      space puts pixel (x,y) on the square [x,x+1]x[y,y+1]. Emit without the
 *      half-pixel and the whole mark lands up and left by half a source pixel.
 *      It looks like a fidelity problem and it reads as one: the tagline E
 *      measured +23.0%/-13.8% of its ink without the offset and +0.0%/-0.8%
 *      with it. See PIXEL_CENTRE.
 *
 *   B. COMPARING A GLYPH TO ITS NEIGHBOURS. The D, the N and the flourish
 *      OVERLAP in x and y — that interlock IS the mark. Crop a whole-mark render
 *      to the D's box and you have measured the D plus a slice of the N plus a
 *      slice of the flourish: the first run of this comparison reported the
 *      monogram D at +63% ink with seven phantom counters. Every glyph is
 *      therefore rendered ALONE and scored against a source coverage masked to
 *      its own connected component. See `sourceCoverage` and `renderOne`.
 *
 *   C. LETTERBOXING. Rendering the 1760x340 viewBox into a box of a different
 *      aspect makes `preserveAspectRatio` centre it, and then every pixel is
 *      offset and the difference image is meaningless — it produced an 88%
 *      disagreement on an earlier pass. Everything here renders at 1 unit = 1
 *      source pixel into the source's own 2046x769 frame.
 *
 * A fourth, from the same family, is worth naming even though this file cannot
 * hit it: NEVER COMPARE THE SOURCE IN ITS OWN CREAM AGAINST A TRACE IN BLACK.
 * #F2DBBC on white is barely above the paper and every stroke reads thin. All
 * comparison here is alpha against coverage, one ink, one box.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A RASTER SOURCE CANNOT GIVE BACK, STATED WITH ITS NUMBER
 *
 * THE ARTWORK IS BARELY ANTIALIASED. Its opaque plateau is alpha 253 and the
 * transition to zero is usually ONE pixel wide — often none, where an edge falls
 * on a pixel boundary. So the sub-pixel edge position marching squares recovers
 * carries roughly +-0.3 px of quantisation noise along a straight edge, and THAT
 * sets a floor on how tight the curve fit can usefully be. Below it the fitter
 * stops following the letterform and starts following the noise:
 *
 *     fit tol   bytes   added   removed   whiskers   topology breaks
 *     0.15 px   42197   0.74%    0.42%       67            2
 *     0.20 px   37691   0.65%    0.53%       26            1
 *     0.30 px   32455   0.70%    0.70%        2            0    <- shipped
 *     0.45 px   28774   1.06%    1.00%        2            1
 *     0.80 px   24788   1.84%    1.87%        2            1
 *
 * ("whiskers" counts traced runs materially thinner than the source's own
 * thinnest — hairline slivers that exist in no letterform. They are the fitter
 * tracking the ragged, sub-pixel seam where the crimson flourish occludes the
 * cream D.) TIGHTER IS NOT BETTER HERE, and 0.30 is chosen on that table.
 *
 * AND ONE FEATURE IS GENUINELY BELOW THE RESOLUTION FLOOR. The 16x49 fragment of
 * the D's bowl that the flourish cuts off tapers to a tip ONE PIXEL WIDE, and a
 * one-pixel ridge never reaches the opaque plateau — its peak alpha is 170, so
 * the 50%-of-plateau level set through it is 0.62 px wide where the artwork's
 * own coverage says 0.87 px. That fragment's 5th-percentile run comes out 13%
 * thin and its tip drops under half coverage for three rows. It is 342 px of the
 * mark's 52,589 (0.65%), at 0.32 CSS px per source pixel, underneath the
 * flourish crossing. THE FIX WOULD BE TO THRESHOLD ON A LOCAL PEAK RATHER THAN
 * THE GLOBAL PLATEAU, AND THAT DILATES EVERY STROKE IN THE MARK to recover a
 * feature nobody can see. It is left as a measured, named exception in the
 * manifest instead — see `subPixel` there and RESOLUTION_EXEMPT below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOUNDARY — WHAT THIS DOES NOT TOUCH, AND WHY THE LINE IS WHERE IT IS
 *
 * `LogoReveal.tsx` carries far more than geometry: the mask order that encodes
 * the artwork's paint order (D under flourish under N), the pen strokes that
 * drive the drawing animation, the class assignments that resolve cream and
 * crimson against the ground, and the timing. NONE of that is generated. This
 * script owns exactly one fenced block — the five path arrays and the tagline
 * tracking offsets — and writes nothing outside it. See BEGIN GENERATED
 * GEOMETRY in that file.
 *
 * The pen strokes are CENTRELINES, hand-authored, and a retrace moves the
 * outlines under them. They are therefore CHECKED here rather than regenerated:
 * each run's pens are stroked at their shipped widths and the fraction of that
 * run's ink they cover is measured and published. It warns rather than fails,
 * because the masks also carry a full-bleed coverage rect that closes behind the
 * pen — the pen owns the motion, the rect owns the correctness — but a retrace
 * that walked the geometry out from under a pen shows up here as a number
 * falling instead of as a shrug in review.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'public/brand/logo-source.png')
const COMPONENT = join(ROOT, 'components/site/intro/LogoReveal.tsx')
const MANIFEST = join(ROOT, 'components/site/intro/logo-trace.json')

const CHECK = process.argv.includes('--check')
const VERBOSE = process.argv.includes('--verbose')

/* ══════════════════════════════════════════════════════════════════════════
   TUNABLE CONSTANTS
   Everything below this block is derived. Nothing in it may be moved without
   re-reading the tables in the header — two of these have a cliff on one side.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE INK / NO-INK SPLIT, as a fraction of the artwork's OWN opaque plateau.
 *
 * Not of 255. This PNG's solid interior sits at alpha 253, so a fixed 128 would
 * be 50.6% of the plateau — a small bias in the eroding direction that grows as
 * the plateau falls. The plateau is measured per run (see `inkPlateau`) and the
 * level follows it, so a re-export of the artwork at a different opacity cannot
 * silently change every stroke width in the mark.
 *
 * 0.5 IS THE GEOMETRIC EDGE and it is not a taste knob. For an antialiased
 * render alpha IS area coverage, so the half-coverage contour is the shape's
 * boundary; a lower cutoff dilates every stroke and a higher one erodes it. The
 * single place this is visibly imperfect is a feature narrower than one pixel,
 * whose peak never reaches the plateau — see the resolution floor above.
 */
const LEVEL_FRACTION = 0.5

/**
 * Ramer-Douglas-Peucker decimation before fitting, in source px.
 *
 * ⚠ ZERO, AND THAT IS THE FIX. RDP here does nothing but drop points that are
 * EXACTLY collinear with their neighbours; it never moves a point and never
 * trades error for size.
 *
 * A curve fitter checks its error AT THE POINTS IT IS GIVEN, and a corner
 * detector reads the polyline it is given. Decimate first and both are working
 * from an edited transcript: a long straight edge collapses to its two
 * endpoints so the fitter is free to bow anywhere in between and reports zero
 * error because nothing is left in the middle to disagree with, and a hairpin
 * loses precisely the points that make it a hairpin (see THE ROOT CAUSE).
 * Neither is a thought experiment — at RDP 0.05 the G of NGUYEN's left stem,
 * 20 px of dead-straight edge whose interior points RDP had removed, bowed
 * 0.87 px out, three times the fit tolerance that had just passed it.
 *
 *     RDP eps   cubics   bytes    added    removed   worst dev   gate failures
 *     0.35        647    23717    1.39%     1.67%     2.06 px         11
 *     0.15        796    29225    0.93%     0.92%     1.11 px          5
 *     0.05        901    33131    0.66%     0.68%     0.87 px          1
 *     0           1058   38866    0.64%     0.79%     0.40 px          0
 *
 * 5,700 more bytes buys the fitter and the corner detector every point the
 * raster has, and then the tolerance below means what it says. Simplification
 * belongs IN the fit, where the error is measured against every original point,
 * and nowhere before it.
 */
const RDP_EPSILON = 0

/**
 * CORNER DETECTION. The turn angle at a vertex, measured over this much
 * arclength either side; a turn sharper than the threshold splits the contour so
 * the fitter may not smooth across it.
 *
 * The old trace used 58 degrees. With RDP_EPSILON at zero that is survivable —
 * it costs two hairline warnings and no topology — but it is still the loosest
 * value this artwork tolerates, and the two failure modes it enables are the
 * expensive ones. 36 sits below every threshold at which anything moves, and
 * costs 2,000 bytes against 44:
 *
 *     corner angle   cubics   bytes    added   removed   gate failures
 *     30             1130     41515    0.62%    0.78%          0
 *     36             1058     38866    0.64%    0.79%          0   <- shipped
 *     44             1005     36866    0.64%    0.79%          0
 *     46              993     36429    0.63%    0.80%          0
 *     58              895     32809    0.73%    0.78%          2
 *
 * ⚠ THAT TABLE IS ONLY TRUE WITH NO DECIMATION. Re-run it at RDP 0.05 and a
 * cliff appears between 44 and 46 degrees where the D of DUY's bowl fills solid.
 * The angle is not independently safe; it is safe because the polyline under it
 * is complete. The protection that actually travels is the per-glyph counter and
 * inscribed-disc gate, which fails the build outright.
 *
 * The window is ARCLENGTH rather than a vertex count because marching-squares
 * output is dense along a diagonal and sparse along an axis-aligned edge; a
 * fixed vertex count would measure a different physical angle depending on which
 * way the stroke happened to run.
 */
const CORNER_WINDOW = 2.0
const CORNER_ANGLE_DEG = 36

/**
 * SCHNEIDER FIT TOLERANCE, in source px, and the independent cap on the result.
 *
 * There is an IRREDUCIBLE FLOOR under any answer here, and it is worth measuring
 * before arguing about tolerances. Emit the marching-squares polyline itself —
 * no curve fitting at all, 12,046 segments and 433 KB — and score it the same
 * way, and it still disagrees with the source by added 0.27% / removed 0.12%.
 * That residual is thresholding and re-rasterisation, not the fit. Against it:
 *
 *     fit tol   cubics   bytes    gzip     added   removed   total vs 0.39% floor
 *     0.10      (fails the alpha guard's own gate — not a candidate)
 *     0.15      1376     50255   16670    0.31%    0.48%     0.79%   2.0x floor
 *     0.20      1222     44751   14759    0.44%    0.61%     1.05%   2.7x
 *     0.30      1058     38866   12661    0.64%    0.79%     1.43%   3.7x  <- here
 *     0.45       942     34769           0.91%    1.26%     2.17%   5.6x
 *     0.80       811     30144           1.53%    2.80%     4.33%  11.1x
 *
 * ⚠ AND THEN THE ONLY QUESTION THAT SETTLES IT: does any of that reach the
 * screen? The mark is painted at about 560 CSS px, so one source pixel is 0.32
 * CSS px and the tolerance is a fraction of that. Rendering the source and each
 * candidate AT THE PAINTED SIZE and differencing them there — mean absolute
 * coverage difference, x1000:
 *
 *     device px            tol 0.15   tol 0.20   tol 0.30
 *      560  (DPR 1)          30.88      30.91      30.97
 *     1120  (DPR 2)           3.82       3.95       4.16
 *     1680  (DPR 3)           8.63       8.63       8.77
 *
 * At the size it is shown, 0.15 and 0.30 are the same picture — the columns
 * differ by 0.3% at DPR 1 and 8% at DPR 2, of a residual that is itself
 * dominated by resampling. Tightening to 0.15 costs 4.0 KB gzipped on the
 * landing page's server-rendered HTML to buy a difference no display can
 * resolve. 0.30 it is, and if the mark is ever shown much larger the table
 * above is how to move it.
 *
 * FIT_MAX_DEVIATION is checked afterwards, symmetrically, on densely sampled
 * curves against every raw contour point — see `curveDeviation`.
 */
const FIT_TOLERANCE = 0.3
const FIT_MAX_DEVIATION = 0.75

/**
 * ⚠ THE LEAST-SQUARES SOLVE NEEDS AN UPPER BOUND ON ITS OWN ANSWER, AND
 * SCHNEIDER'S PUBLISHED GUARD ONLY HAS A LOWER ONE.
 *
 * `generateBezier` solves for the two tangent magnitudes that best fit the run.
 * The classic code rejects a NEGATIVE or near-zero magnitude and falls back to
 * the chord/3 heuristic; nothing rejects an absurdly LARGE one. On a short run
 * whose two end tangents are nearly antiparallel the normal equations are close
 * to singular, and the solution that minimises squared error at a handful of
 * sample points is a cubic that shoots away and loops back through them.
 *
 * This artwork produced exactly one: in the upper flourish, a cubic spanning
 * TWO units of chord with control points EIGHTY units out, whose curve leaves
 * its own chord by 21.4 units. It rendered correctly only by luck — the loop
 * sits entirely inside the filled region, so under `fill-rule: evenodd` it adds
 * two crossings to every ray and parity is unchanged. Move it a few units and
 * it is a hole; and the halo stroke in logo-reveal.module.css strokes the whole
 * path, loop included.
 *
 * A tangent magnitude larger than this multiple of the chord is rejected the
 * same way a negative one is. 3 is well clear of anything legitimate: a
 * half-circle arc fitted as one cubic wants 0.67 of its chord, and a
 * three-quarter arc about 1.4.
 */
const FIT_ALPHA_MAX_FACTOR = 3

/**
 * COORDINATE TRANSFORM from source pixels to viewBox units.
 *
 * The mark is emitted at 1 unit = 1 source pixel, translated so the artwork's
 * ink box lands where the shipped viewBox ("-10 -10 1760 340") already expects
 * it. ORIGIN is that shipped translate and must not move: the pen strokes, the
 * mask rects and the tagline tracking are all expressed in these units.
 *
 * PIXEL_CENTRE is trap (A) from the header. It is a fact about sampling, not a
 * fudge factor, and removing it moves the entire mark half a source pixel.
 */
const PIXEL_CENTRE = 0.5
const ORIGIN_X = -150
const ORIGIN_Y = -216

/**
 * Emitted coordinate precision. At the ~560 CSS px the mark occupies on a 1280
 * viewport one viewBox unit is 0.32 CSS px, so 0.1 units is a 0.03 px rounding —
 * a third of a device pixel on a 3x phone. Another decimal costs ~10% of the
 * path bytes to buy precision below the raster's own +-0.3 px noise.
 */
const COORD_DECIMALS = 1

/**
 * TAGLINE TRACKING. Each tagline glyph starts this many units offset per unit of
 * distance from the run's centre and settles to zero, which is the letter-
 * spacing animation done on the compositor. Regenerated rather than retyped, so
 * a retrace cannot leave the offsets pointing at the old glyph centres; on this
 * artwork it reproduces the shipped values to within 0.2 units.
 */
const TAGLINE_TRACKING = 0.34

/**
 * THE LAYER SPLIT. Reference colours are this artwork's own modal opaque values,
 * and every ink pixel goes to whichever is nearer in RGB.
 *
 * The split is what makes the interlock traceable at all: the crimson flourish
 * is painted OVER the cream D and UNDER the cream N, so in the cream layer the D
 * arrives with a piece missing and in the crimson layer the flourish arrives as
 * two components. Those are not defects to repair — they ARE the mark, and the
 * reveal's three-mask order is built on them.
 *
 * ⚠ NAMING TWO COLOURS HERE IS NOT A GROUND-TOKEN VIOLATION. This is a build
 * script, not a component: these are MEASUREMENTS OF AN IMAGE — the values the
 * artwork's own pixels carry, used to classify them — and not paint. Nothing
 * here reaches a stylesheet, and the paths this emits carry no colour at all;
 * the component resolves cream and crimson through --fg roles on its ground.
 */
const CREAM_RGB = [242, 219, 188]
const CRIMSON_RGB = [136, 17, 25]

/**
 * A connected component smaller than this is a blend speck on the occlusion
 * seam, not artwork: one antialiased pixel where cream meets crimson that landed
 * a few levels over the threshold. Two exist on this artwork, at (386,364) and
 * (378,387), each 1 px, each with all eight neighbours below the level. Every
 * one dropped is printed and recorded in the manifest.
 */
const MIN_COMPONENT_PX = 8

/**
 * A traced contour enclosing less area than this is a sub-pixel pinhole in the
 * raster, not a counter. This artwork has exactly one — a single pixel at
 * (381,382) inside the D fragment whose alpha lands a hair under the level. The
 * trace reproduces it faithfully as a 0.04 px^2 loop, which renders as nothing
 * at any scale and costs path bytes, so it is dropped and reported.
 */
const MIN_CONTOUR_AREA = 0.5

/**
 * An enclosed background region smaller than this is that same pinhole seen from
 * the other side, and it is excluded from the COUNTER count so the topology gate
 * measures letterforms rather than raster noise. A real counter here runs from
 * 5,995 px (the D of DUY) down to 20 px (the tagline A), so 2 px separates them
 * from noise by three orders of magnitude.
 */
const COUNTER_MIN_PX = 2

/**
 * RUN BOXES, in SOURCE PIXELS, tried IN ORDER. A component is assigned to the
 * first box that fully contains its bounding box, and every component must match
 * one or the run fails.
 *
 * ⚠ THE ORDER IS LOAD-BEARING AND THE BOXES DELIBERATELY OVERLAP. The D spans
 * x 156..394 and the N spans x 269..502: they interleave, so no pair of disjoint
 * rectangles can separate them. First-match does, because the D fits inside the
 * narrower box and the N does not. Sorting by area, or by x, would not.
 *
 * `expect` is a hard assertion, not documentation. It is what turns "the artwork
 * changed" into a failed build rather than a silently different mark: 12 cream
 * components (the D, the fragment of its bowl the flourish cuts off, the N, and
 * nine wordmark glyphs) and 12 crimson (two pieces of one flourish, ten tagline
 * glyphs).
 */
const RUN_BOXES = [
  { name: 'D', layer: 'cream', box: [150, 215, 400, 535], expect: 2 },
  { name: 'N', layer: 'cream', box: [150, 215, 510, 535], expect: 1 },
  { name: 'FLOURISH', layer: 'crimson', box: [150, 215, 510, 535], expect: 2 },
  { name: 'WORDMARK', layer: 'cream', box: [600, 215, 1900, 535], expect: 9 },
  { name: 'TAGLINE', layer: 'crimson', box: [600, 215, 1900, 535], expect: 10 },
]

/** Human labels, left to right within each run. Reporting only. */
const GLYPH_LABELS = {
  D: ['D', 'D-fragment'],
  N: ['N'],
  FLOURISH: ['flourish-lower', 'flourish-upper'],
  WORDMARK: ['D', 'U', 'Y', 'N', 'G', 'U', 'Y', 'E', 'N'],
  TAGLINE: ['P', 'R', 'O', 'V', 'A', 'B', 'L', 'E', 'A', 'I'],
}

/**
 * ── THE FIDELITY GATES ──────────────────────────────────────────────────────
 *
 * Each is calibrated at BOTH ends: the margin over what this trace measures, and
 * the separation from the defect it exists to catch.
 *
 *   disc growth      gate +15%.  This trace's worst is +4.7%. The shipped N's
 *                    filled counter was +126% — eight times the alarm.
 *   hairline growth  gate +15%.  This trace's worst is +8.4%.
 *   contrast drift   gate  0.40 of the source's own p95/p5, either way. The
 *                    shipped N read 23.8 against the source's 5.1, a 4.7x error,
 *                    so the gate has a factor of ten of separation.
 *
 * COUNTERS AND INK PARTS ARE EXACT. There is no tolerance on topology: a
 * letterform either has its counter or it does not.
 */
const GATE_DISC_GROWTH = 0.15
const GATE_HAIRLINE_GROWTH = 0.15
const GATE_CONTRAST_DRIFT = 0.4

/**
 * ⚠ TWO FLOORS, BOTH OF WHICH EXIST BECAUSE A PERCENTILE IS ONLY AS GOOD AS THE
 * SAMPLE UNDER IT. Both were added after the gates above fired on measurement
 * artefacts rather than on defects, and both are calibrated on the metric's own
 * resolution rather than on what would make the run pass.
 *
 * HAIRLINE_MIN_RUN_PX — a run shorter than this is not a stroke. It is the
 * antialiased edge column at a glyph's extremity: the tagline I is a four-pixel
 * stem, so it has exactly FIVE column runs, [1.2, 6.7, 23.2, 24.1, 24.9], and
 * the 5th percentile of five samples IS the minimum — 1.2 px of edge sliver.
 * Comparing that against the trace's equivalent reported a 694% hairline
 * "growth" on a glyph whose row statistic, the one that actually crosses its
 * stem, moved 3.49 -> 3.64. Worse, the source and the trace do not produce the
 * SAME NUMBER of these slivers, so the percentile index lands on a different
 * physical feature in each and the comparison is not like for like. Excluding
 * them first is what makes the two distributions comparable.
 *
 * HAIRLINE_MIN_SAMPLES — below this the filtered percentile is still the
 * minimum, and the axis is reported rather than gated.
 */
const HAIRLINE_MIN_RUN_PX = 1.5
const HAIRLINE_MIN_SAMPLES = 12

/**
 * ⚠ AND THE DISC GATE NEEDS AN ABSOLUTE FLOOR, because the distance transform is
 * quantised. Its values are 2·sqrt(k) for integer k, so near the tagline's scale
 * the attainable readings are 4.00, 4.47, 5.66, 6.00 — ONE STEP is 1.19 units,
 * or 27% of a 4.47 reading, which is already wider than the 15% gate. The
 * tagline O moved exactly one step and failed a gate it could not have passed.
 *
 * 2.0 units is comfortably above one step at that scale and eleven times below
 * the defect this gate exists for: the shipped N's filled counter moved the disc
 * by 23.2 units.
 */
const GATE_DISC_ABS_UNITS = 2.0

/**
 * The one glyph exempted from the HAIRLINE gate, with its reason and its number.
 * See the resolution floor in the header: this fragment's tip is one source
 * pixel wide, below what a 50%-of-plateau level set can carry. Its topology and
 * its inscribed disc are still gated exactly like every other glyph.
 */
const RESOLUTION_EXEMPT = new Set(['D[1]'])

/** Pen coverage below this is reported as a finding. See BOUNDARY. */
const PEN_COVERAGE_WARN = 0.9

/** The fence this script may write inside, and nowhere else. */
const BEGIN = '/* ── BEGIN GENERATED GEOMETRY — scripts/gen-logo-paths.mjs ─────────────── */'
const END = '/* ── END GENERATED GEOMETRY ───────────────────────────────────────────── */'

const fail = (msg) => { console.error(`gen-logo-paths: ${msg}`); process.exit(1) }

/* ══ RASTER ════════════════════════════════════════════════════════════════ */

if (!existsSync(SOURCE)) fail(`${relative(ROOT, SOURCE)} does not exist.`)

const img = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = img.info.width
const H = img.info.height
const CHAN = img.info.channels
const px = img.data

/**
 * The artwork's opaque plateau: the modal alpha over its solid interior. On this
 * PNG it is 253, not 255 — see LEVEL_FRACTION for why that matters.
 */
function inkPlateau() {
  const hist = new Uint32Array(256)
  for (let i = 0; i < W * H; i++) hist[px[i * CHAN + 3]]++
  let best = 255
  let bestN = 0
  for (let a = 200; a < 256; a++) if (hist[a] > bestN) { bestN = hist[a]; best = a }
  return best
}

const PLATEAU = inkPlateau()
const LEVEL = PLATEAU * LEVEL_FRACTION

const dist2 = (r, g, b, ref) => (r - ref[0]) ** 2 + (g - ref[1]) ** 2 + (b - ref[2]) ** 2

/** One scalar alpha field per ink layer. Straight alpha, so hue is readable. */
function layerFields() {
  const cream = new Float32Array(W * H)
  const crimson = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const a = px[i * CHAN + 3]
    if (a === 0) continue
    const r = px[i * CHAN], g = px[i * CHAN + 1], b = px[i * CHAN + 2]
    if (dist2(r, g, b, CREAM_RGB) <= dist2(r, g, b, CRIMSON_RGB)) cream[i] = a
    else crimson[i] = a
  }
  return { cream, crimson }
}

const FIELDS = layerFields()

/* ══ CONNECTED COMPONENTS ══════════════════════════════════════════════════ */

/**
 * 8-connected components of `field > LEVEL`.
 *
 * Ink 8-connected and background 4-connected is the only topologically
 * consistent pairing, and the marching-squares saddle rule below is chosen to
 * agree with it — so the contours cannot disagree with the labels about how many
 * pieces and how many counters the mark has.
 */
function components(field) {
  const label = new Int32Array(W * H).fill(-1)
  const list = []
  const stack = []
  for (let s = 0; s < W * H; s++) {
    if (field[s] <= LEVEL || label[s] !== -1) continue
    const id = list.length
    const c = { id, area: 0, minX: W, minY: H, maxX: -1, maxY: -1 }
    label[s] = id
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()
      const x = p % W, y = (p - x) / W
      c.area++
      if (x < c.minX) c.minX = x
      if (x > c.maxX) c.maxX = x
      if (y < c.minY) c.minY = y
      if (y > c.maxY) c.maxY = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const q = ny * W + nx
        if (field[q] > LEVEL && label[q] === -1) { label[q] = id; stack.push(q) }
      }
    }
    list.push(c)
  }
  return { label, list }
}

/* ══ MARCHING SQUARES ══════════════════════════════════════════════════════ */

/**
 * Crossing points live on GRID EDGES, and every grid edge has one integer id, so
 * chaining is exact integer bookkeeping.
 *
 *   horizontal edge between (x,y)-(x+1,y)   id = 2·(y·W + x)
 *   vertical   edge between (x,y)-(x,y+1)   id = 2·(y·W + x) + 1
 *
 * ⚠ THIS IS THE OTHER HALF OF WHY THE OLD TRACE LOST A GLYPH'S OUTLINE. Its
 * provenance records that "contours are chained UNDIRECTED, because the
 * marching-squares case table's segment orientation is not consistent across
 * cases and a directed walk silently drops whole glyphs" — a true observation
 * about a table that was wrong, fixed by abandoning the property that makes the
 * walk safe. An undirected chain matched on floating-point proximity can take
 * the wrong branch wherever two boundary strands pass close, and a counter's
 * mouth is exactly that. Below, the table IS orientation-consistent (inside
 * always on the left), each edge id is an exit for exactly one cell and an entry
 * for exactly one other, and the walk is a deterministic integer lookup with no
 * tolerance and no branch to take.
 */
const EH = (x, y) => 2 * (y * W + x)
const EV = (x, y) => 2 * (y * W + x) + 1

/**
 * Directed segment table, INSIDE ON THE LEFT in screen coordinates (y down).
 * Bits: 1 = top-left inside, 2 = top-right, 4 = bottom-right, 8 = bottom-left.
 * Edge codes: 0 = top, 1 = right, 2 = bottom, 3 = left.
 *
 * The two saddle cases (5 and 10) ALWAYS JOIN THE INK. That is not cosmetic: it
 * makes contour topology agree by construction with the 8-connected ink /
 * 4-connected background labelling above, so every component yields exactly one
 * outer contour plus one contour per enclosed hole. Deciding the other way at a
 * saddle would connect a background diagonal that the labeller calls two
 * regions, and the two halves of this file would then disagree.
 */
const MS_TABLE = [
  [],                //  0  empty
  [[3, 0]],          //  1  TL
  [[0, 1]],          //  2  TR
  [[3, 1]],          //  3  TL TR
  [[1, 2]],          //  4  BR
  [[1, 0], [3, 2]],  //  5  TL BR — saddle, ink joined
  [[0, 2]],          //  6  TR BR
  [[3, 2]],          //  7  all but BL
  [[2, 3]],          //  8  BL
  [[2, 0]],          //  9  TL BL
  [[0, 3], [2, 1]],  // 10  TR BL — saddle, ink joined
  [[2, 1]],          // 11  all but BR
  [[1, 3]],          // 12  BR BL
  [[1, 0]],          // 13  all but TR
  [[0, 3]],          // 14  all but TL
  [],                // 15  full
]

/** Sub-pixel crossing on one cell edge, by linear interpolation of the field. */
function crossing(read, code, cx, cy) {
  let x0, y0, x1, y1, id
  if (code === 0) { x0 = cx; y0 = cy; x1 = cx + 1; y1 = cy; id = EH(cx, cy) }
  else if (code === 1) { x0 = cx + 1; y0 = cy; x1 = cx + 1; y1 = cy + 1; id = EV(cx + 1, cy) }
  else if (code === 2) { x0 = cx; y0 = cy + 1; x1 = cx + 1; y1 = cy + 1; id = EH(cx, cy + 1) }
  else { x0 = cx; y0 = cy; x1 = cx; y1 = cy + 1; id = EV(cx, cy) }
  const a = read(x0, y0)
  const b = read(x1, y1)
  let t = (LEVEL - a) / (b - a)
  if (!Number.isFinite(t)) t = 0.5
  if (t < 0) t = 0
  if (t > 1) t = 1
  return { id, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t }
}

/**
 * Every closed contour of one component, largest first.
 *
 * The field is masked to that component, so a NEIGHBOUR'S ink reads as
 * background. Components are 8-separated above the level, so nothing of the
 * neighbour can leak into this walk — and that is what lets the D be traced
 * without the flourish that crosses it, and the flourish without the N that
 * crosses that.
 */
function contoursOf(field, label, comp) {
  const pad = 2
  const cx0 = Math.max(0, comp.minX - pad), cx1 = Math.min(W - 2, comp.maxX + pad)
  const cy0 = Math.max(0, comp.minY - pad), cy1 = Math.min(H - 2, comp.maxY + pad)
  const read = (x, y) => {
    const i = y * W + x
    const v = field[i]
    return v > LEVEL && label[i] !== comp.id ? 0 : v
  }
  const from = new Map()
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const b =
        (read(cx, cy) > LEVEL ? 1 : 0) |
        (read(cx + 1, cy) > LEVEL ? 2 : 0) |
        (read(cx + 1, cy + 1) > LEVEL ? 4 : 0) |
        (read(cx, cy + 1) > LEVEL ? 8 : 0)
      for (const [a, z] of MS_TABLE[b]) {
        const p = crossing(read, a, cx, cy)
        const q = crossing(read, z, cx, cy)
        from.set(p.id, { p, q })
      }
    }
  }
  const contours = []
  const used = new Set()
  for (const startId of from.keys()) {
    if (used.has(startId)) continue
    const pts = []
    let id = startId
    while (from.has(id) && !used.has(id)) {
      used.add(id)
      const seg = from.get(id)
      pts.push([seg.p.x, seg.p.y])
      id = seg.q.id
    }
    if (pts.length >= 3) contours.push(pts)
  }
  return contours.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))
}

/** Shoelace area in screen coordinates. */
function signedArea(pts) {
  let a = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % n]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

/* ══ SIMPLIFY, CORNERS, FIT ════════════════════════════════════════════════ */

function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice()
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()
    if (j <= i + 1) continue
    const [ax, ay] = pts[i]
    const [bx, by] = pts[j]
    const dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy)
    let best = -1, bestD = -1
    for (let k = i + 1; k < j; k++) {
      const [cx, cy] = pts[k]
      const d = len < 1e-12
        ? Math.hypot(cx - ax, cy - ay)
        : Math.abs(dy * (cx - ax) - dx * (cy - ay)) / len
      if (d > bestD) { bestD = d; best = k }
    }
    if (bestD > eps) { keep[best] = 1; stack.push([i, best], [best, j]) }
  }
  return pts.filter((_, i) => keep[i])
}

/**
 * Corner flags. The tangent either side of a vertex is taken to the first point
 * at least CORNER_WINDOW of arclength away, so the measured angle is a property
 * of the letterform rather than of how densely marching squares happened to
 * sample that stretch of edge.
 */
function cornerFlags(pts) {
  const n = pts.length
  const flags = new Uint8Array(n)
  const at = (i) => pts[((i % n) + n) % n]
  const thresh = Math.cos((180 - CORNER_ANGLE_DEG) * Math.PI / 180)
  for (let i = 0; i < n; i++) {
    let bx = 0, by = 0, d = 0
    for (let k = 1; k < n; k++) {
      const a = at(i - k + 1), b = at(i - k)
      d += Math.hypot(a[0] - b[0], a[1] - b[1])
      bx = b[0]; by = b[1]
      if (d >= CORNER_WINDOW) break
    }
    let fx = 0, fy = 0
    d = 0
    for (let k = 1; k < n; k++) {
      const a = at(i + k - 1), b = at(i + k)
      d += Math.hypot(a[0] - b[0], a[1] - b[1])
      fx = b[0]; fy = b[1]
      if (d >= CORNER_WINDOW) break
    }
    const [cx, cy] = pts[i]
    const ux = bx - cx, uy = by - cy, vx = fx - cx, vy = fy - cy
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy)
    if (lu < 1e-9 || lv < 1e-9) continue
    if ((ux * vx + uy * vy) / (lu * lv) > thresh) flags[i] = 1
  }
  return flags
}

/* Schneider (Graphics Gems, 1990) least-squares cubic fitting. */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const mul = (a, s) => [a[0] * s, a[1] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1]
const norm = (a) => { const l = Math.hypot(a[0], a[1]); return l < 1e-12 ? [0, 0] : [a[0] / l, a[1] / l] }

const B0 = (u) => (1 - u) ** 3
const B1 = (u) => 3 * u * (1 - u) ** 2
const B2 = (u) => 3 * u * u * (1 - u)
const B3 = (u) => u ** 3

const bezierAt = (b, u) => [
  B0(u) * b[0][0] + B1(u) * b[1][0] + B2(u) * b[2][0] + B3(u) * b[3][0],
  B0(u) * b[0][1] + B1(u) * b[1][1] + B2(u) * b[2][1] + B3(u) * b[3][1],
]

function chordLengthParameterize(pts) {
  const u = [0]
  for (let i = 1; i < pts.length; i++) {
    u.push(u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  const last = u[u.length - 1]
  if (last < 1e-12) return pts.map((_, i) => i / (pts.length - 1))
  return u.map((v) => v / last)
}

function generateBezier(pts, u, t1, t2) {
  const n = pts.length
  const first = pts[0], last = pts[n - 1]
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0
  for (let i = 0; i < n; i++) {
    const a0 = mul(t1, B1(u[i]))
    const a1 = mul(t2, B2(u[i]))
    c00 += dot(a0, a0)
    c01 += dot(a0, a1)
    c11 += dot(a1, a1)
    const base = add(mul(first, B0(u[i]) + B1(u[i])), mul(last, B2(u[i]) + B3(u[i])))
    const tmp = sub(pts[i], base)
    x0 += dot(a0, tmp)
    x1 += dot(a1, tmp)
  }
  const det = c00 * c11 - c01 * c01
  let alphaL = 0, alphaR = 0
  if (Math.abs(det) > 1e-12) {
    alphaL = (x0 * c11 - x1 * c01) / det
    alphaR = (c00 * x1 - c01 * x0) / det
  }
  const segLen = Math.hypot(last[0] - first[0], last[1] - first[1])
  const cap = FIT_ALPHA_MAX_FACTOR * segLen
  if (alphaL < 1e-6 * segLen || alphaR < 1e-6 * segLen || alphaL > cap || alphaR > cap) {
    const d = segLen / 3
    return [first, add(first, mul(t1, d)), add(last, mul(t2, d)), last]
  }
  return [first, add(first, mul(t1, alphaL)), add(last, mul(t2, alphaR)), last]
}

function reparameterize(bez, p, u) {
  const d1 = [mul(sub(bez[1], bez[0]), 3), mul(sub(bez[2], bez[1]), 3), mul(sub(bez[3], bez[2]), 3)]
  const d2 = [mul(sub(d1[1], d1[0]), 2), mul(sub(d1[2], d1[1]), 2)]
  const q = bezierAt(bez, u)
  const qu = [
    (1 - u) ** 2 * d1[0][0] + 2 * (1 - u) * u * d1[1][0] + u * u * d1[2][0],
    (1 - u) ** 2 * d1[0][1] + 2 * (1 - u) * u * d1[1][1] + u * u * d1[2][1],
  ]
  const quu = [(1 - u) * d2[0][0] + u * d2[1][0], (1 - u) * d2[0][1] + u * d2[1][1]]
  const num = (q[0] - p[0]) * qu[0] + (q[1] - p[1]) * qu[1]
  const den = qu[0] ** 2 + qu[1] ** 2 + (q[0] - p[0]) * quu[0] + (q[1] - p[1]) * quu[1]
  if (Math.abs(den) < 1e-12) return u
  return u - num / den
}

function maxFitError(pts, bez, u) {
  let max = 0, index = Math.floor(pts.length / 2)
  for (let i = 1; i < pts.length - 1; i++) {
    const q = bezierAt(bez, u[i])
    const d = (q[0] - pts[i][0]) ** 2 + (q[1] - pts[i][1]) ** 2
    if (d > max) { max = d; index = i }
  }
  return { error: Math.sqrt(max), index }
}

function fitCubic(pts, t1, t2, depth, out) {
  if (pts.length === 2) {
    const d = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / 3
    out.push([pts[0], add(pts[0], mul(t1, d)), add(pts[1], mul(t2, d)), pts[1]])
    return
  }
  let u = chordLengthParameterize(pts)
  let bez = generateBezier(pts, u, t1, t2)
  let { error, index } = maxFitError(pts, bez, u)
  if (error < FIT_TOLERANCE) { out.push(bez); return }
  /* Schneider's condition: reparameterise only when the fit is already close
     enough that Newton on the projection converges. */
  if (error < FIT_TOLERANCE * FIT_TOLERANCE * 16) {
    for (let it = 0; it < 6; it++) {
      const nu = pts.map((p, i) => reparameterize(bez, p, u[i]))
      bez = generateBezier(pts, nu, t1, t2)
      const r = maxFitError(pts, bez, nu)
      u = nu
      error = r.error
      index = r.index
      if (error < FIT_TOLERANCE) { out.push(bez); return }
    }
  }
  if (depth > 40) { out.push(bez); return }
  if (index <= 0) index = 1
  if (index >= pts.length - 1) index = pts.length - 2
  const centre = norm(sub(pts[index - 1], pts[index + 1]))
  fitCubic(pts.slice(0, index + 1), t1, centre, depth + 1, out)
  fitCubic(pts.slice(index), mul(centre, -1), t2, depth + 1, out)
}

/** Fit one closed contour: split at its corners, fit each open run between. */
function fitContour(raw) {
  let pts = rdp(raw, RDP_EPSILON)
  if (pts.length > 2) {
    const [fx, fy] = pts[0]
    const [lx, ly] = pts[pts.length - 1]
    if (Math.hypot(fx - lx, fy - ly) < 1e-9) pts = pts.slice(0, -1)
  }
  const n = pts.length
  if (n < 4) return []
  const flags = cornerFlags(pts)
  const idx = []
  for (let i = 0; i < n; i++) if (flags[i]) idx.push(i)
  const out = []
  /* Fewer than two corners is a smooth closed loop with nothing to split at — a
     bowl, an O — so it is fitted as one periodic run rather than dropped.
     Dropping it is how a whole glyph disappears. */
  if (idx.length < 2) {
    const run = pts.concat([pts[0]])
    const t = norm(sub(run[1], run[run.length - 2]))
    fitCubic(run, t, mul(t, -1), 0, out)
    return out
  }
  for (let k = 0; k < idx.length; k++) {
    const a = idx[k], b = idx[(k + 1) % idx.length]
    const run = []
    let i = a
    for (;;) { run.push(pts[i]); if (i === b) break; i = (i + 1) % n }
    if (run.length < 2) continue
    fitCubic(run, norm(sub(run[1], run[0])), norm(sub(run[run.length - 2], run[run.length - 1])), 0, out)
  }
  return out
}

/* ══ EMIT ══════════════════════════════════════════════════════════════════ */

const SCALE = 10 ** COORD_DECIMALS
const r1 = (v) => String(Math.round(v * SCALE) / SCALE)
const tx = (p) => [p[0] + PIXEL_CENTRE + ORIGIN_X, p[1] + PIXEL_CENTRE + ORIGIN_Y]

function toPathData(contours) {
  const parts = []
  for (const beziers of contours) {
    if (!beziers.length) continue
    const s = tx(beziers[0][0])
    parts.push(`M${r1(s[0])} ${r1(s[1])}`)
    for (const b of beziers) {
      const c1 = tx(b[1]), c2 = tx(b[2]), e = tx(b[3])
      parts.push(`C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(e[0])} ${r1(e[1])}`)
    }
    parts.push('Z')
  }
  return parts.join('')
}

/* ══ MEASUREMENT ═══════════════════════════════════════════════════════════
   Everything below scores the RENDERED result. No metric here reads path data;
   every one reads pixels, and every one is applied identically to the source and
   to the trace. That symmetry is the point — see trap (B).
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Render ONE path alone into the source's own frame at 1 unit = 1 pixel.
 * Alone, because the monogram's glyphs overlap each other; at 1:1 into the
 * source's frame, because any other box letterboxes the viewBox.
 */
async function renderOne(d) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `viewBox="${ORIGIN_X} ${ORIGIN_Y} ${W} ${H}">` +
    `<rect x="${ORIGIN_X}" y="${ORIGIN_Y}" width="${W}" height="${H}" fill="#fff"/>` +
    `<path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`
  const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true })
  const cov = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) cov[i] = 1 - data[i] / 255
  return cov
}

/** The source's own coverage for one glyph, masked to its own component. */
function sourceCoverage(g) {
  const [x0, y0, x1, y1] = g.box
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const cov = new Float32Array(bw * bh)
  const field = FIELDS[g.layer]
  const label = LAYERS[g.layer].label
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x
    if (field[i] > LEVEL && label[i] !== g.comp.id) continue
    cov[(y - y0) * bw + (x - x0)] = Math.min(1, field[i] / PLATEAU)
  }
  return { cov, bw, bh }
}

function cropTo(full, box) {
  const [x0, y0, x1, y1] = box
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const cov = new Float32Array(bw * bh)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cov[(y - y0) * bw + (x - x0)] = full[y * W + x]
  return { cov, bw, bh }
}

/** Enclosed background regions: 4-connected, not touching the glyph's box. */
function counters({ cov, bw, bh }) {
  const seen = new Uint8Array(bw * bh)
  const out = []
  const st = []
  for (let s = 0; s < bw * bh; s++) {
    if (cov[s] > 0.5 || seen[s]) continue
    let touches = false
    let area = 0
    seen[s] = 1
    st.push(s)
    while (st.length) {
      const p = st.pop()
      const x = p % bw, y = (p - x) / bw
      area++
      if (x === 0 || y === 0 || x === bw - 1 || y === bh - 1) touches = true
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
        const q = ny * bw + nx
        if (cov[q] <= 0.5 && !seen[q]) { seen[q] = 1; st.push(q) }
      }
    }
    if (!touches && area >= COUNTER_MIN_PX) out.push(area)
  }
  return out.sort((a, b) => b - a)
}

/** 8-connected ink regions. A letterform that has broken in two shows here. */
function inkParts({ cov, bw, bh }) {
  const seen = new Uint8Array(bw * bh)
  const out = []
  const st = []
  for (let s = 0; s < bw * bh; s++) {
    if (cov[s] <= 0.5 || seen[s]) continue
    let area = 0
    seen[s] = 1
    st.push(s)
    while (st.length) {
      const p = st.pop()
      const x = p % bw, y = (p - x) / bw
      area++
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
        const q = ny * bw + nx
        if (cov[q] > 0.5 && !seen[q]) { seen[q] = 1; st.push(q) }
      }
    }
    out.push(area)
  }
  return out.sort((a, b) => b - a)
}

/**
 * SUB-PIXEL STROKE WIDTH. Each maximal run of the half-coverage mask, along rows
 * and along columns, integrated over its own antialiased shoulders.
 *
 * Exact for a straight edge: a boundary pixel at coverage c places the edge c of
 * a pixel outside the mask, so summing coverage from one pixel before the run to
 * one after recovers the true length. A binary run count cannot — it reads every
 * stroke as an integer number of pixels, which on a 4 px tagline stem is a 25%
 * quantisation and makes any hairline claim unfalsifiable.
 */
function runLengths({ cov, bw, bh }) {
  const rows = []
  const cols = []
  const scan = (outer, inner, get, into) => {
    for (let a = 0; a < outer; a++) {
      let i = 0
      while (i < inner) {
        if (get(a, i) <= 0.5) { i++; continue }
        const s = i
        while (i < inner && get(a, i) > 0.5) i++
        let len = 0
        for (let k = s - 1; k <= i; k++) if (k >= 0 && k < inner) len += get(a, k)
        if (len > 0.2) into.push(len)
      }
    }
  }
  scan(bh, bw, (y, x) => cov[y * bw + x], rows)
  scan(bw, bh, (x, y) => cov[y * bw + x], cols)
  rows.sort((a, b) => a - b)
  cols.sort((a, b) => a - b)
  return { rows, cols }
}

/**
 * The hairline statistic: the 5th percentile of the runs that are actually
 * strokes. See HAIRLINE_MIN_RUN_PX for why the filter comes first.
 */
function hairline(sorted) {
  const kept = sorted.filter((v) => v >= HAIRLINE_MIN_RUN_PX)
  return { value: pct(kept, 5), samples: kept.length }
}

const pct = (sorted, p) => {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[i]
}

/** Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt({ cov, bw, bh }) {
  const INF = 1e12
  const f = new Float64Array(bw * bh)
  for (let i = 0; i < bw * bh; i++) f[i] = cov[i] > 0.5 ? INF : 0
  const m = Math.max(bw, bh)
  const d = new Float64Array(m)
  const v = new Int32Array(m)
  const z = new Float64Array(m + 1)
  const pass = (get, set, n) => {
    let k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for (let q = 1; q < n; q++) {
      let s
      for (;;) {
        s = ((get(q) + q * q) - (get(v[k]) + v[k] * v[k])) / (2 * q - 2 * v[k])
        if (s <= z[k]) k--
        else break
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++
      d[q] = (q - v[k]) * (q - v[k]) + get(v[k])
    }
    for (let q = 0; q < n; q++) set(q, d[q])
  }
  for (let x = 0; x < bw; x++) pass((y) => f[y * bw + x], (y, val) => { f[y * bw + x] = val }, bh)
  for (let y = 0; y < bh; y++) pass((x) => f[y * bw + x], (x, val) => { f[y * bw + x] = val }, bw)
  return f
}

/**
 * THE LARGEST DISC THAT FITS INSIDE THE INK, in units.
 *
 * The statistic that actually catches a filled counter. A letterform is strokes,
 * so the biggest disc it can hold is a little wider than its heaviest stroke;
 * fill a counter and the disc jumps to the size of the hole. On the shipped N it
 * read 41.6 against the source's 18.4 — a 42-unit disc only fits if the counter
 * is solid — while the ink area moved 43.7%, which is the kind of number that
 * can be argued away.
 */
function maxInscribed(c) {
  const f = edt(c)
  let m = 0
  for (let i = 0; i < f.length; i++) if (f[i] > m) m = f[i]
  return 2 * Math.sqrt(m)
}

function inkArea({ cov }) {
  let a = 0
  for (let i = 0; i < cov.length; i++) if (cov[i] > 0.5) a++
  return a
}

function disagreement(a, b) {
  let added = 0, removed = 0
  for (let i = 0; i < a.cov.length; i++) {
    const s = a.cov[i] > 0.5, t = b.cov[i] > 0.5
    if (t && !s) added++
    else if (s && !t) removed++
  }
  return { added, removed }
}

/** Densely sampled points on one bezier, ~8 per source pixel of arc. */
function sampleBezier(b) {
  const chord =
    Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) +
    Math.hypot(b[2][0] - b[1][0], b[2][1] - b[1][1]) +
    Math.hypot(b[3][0] - b[2][0], b[3][1] - b[2][1])
  const n = Math.max(16, Math.ceil(chord * 8))
  const out = []
  for (let i = 0; i <= n; i++) out.push(bezierAt(b, i / n))
  return out
}

/** A point set indexed on a 2 px grid, for nearest-neighbour queries. */
function pointGrid(points) {
  const cell = 2
  const grid = new Map()
  for (const p of points) {
    const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`
    let arr = grid.get(k)
    if (!arr) { arr = []; grid.set(k, arr) }
    arr.push(p)
  }
  return (p) => {
    let best = Infinity
    for (let r = 1; r <= 12 && !Number.isFinite(best); r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        const arr = grid.get(`${Math.floor(p[0] / cell) + dx},${Math.floor(p[1] / cell) + dy}`)
        if (!arr) continue
        for (const q of arr) {
          const dd = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
          if (dd < best) best = dd
        }
      }
    }
    return Math.sqrt(best)
  }
}

/** Resample a polyline so no two consecutive points are further apart than d. */
function densify(pts, d) {
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    out.push(a)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.ceil(len / d)
    for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n])
  }
  return out
}

/**
 * THE SYMMETRIC (HAUSDORFF) DISTANCE between the raw marching-squares contour
 * and the curve that replaced it. This is the CORNER gate: a rounded serif
 * bracket or a cut apex is a raw point left far from the curve.
 *
 * ⚠ IT MUST BE MEASURED IN BOTH DIRECTIONS, and the one-way version is what let
 * the degenerate cubic described at FIT_ALPHA_MAX_FACTOR through. Asking only
 * "is every source point near the curve?" cannot see a curve that leaves the
 * letterform and comes back, because the excursion has no source point near it
 * to complain. That cubic scored 0.30 px one-way and 21.4 px both ways.
 *
 * ⚠ AND SAMPLE DENSELY. An earlier version sampled 40 points per cubic and
 * reported 31,622 px deviations on the monogram — the signature of a
 * nearest-neighbour search finding nothing, not of a broken fit. The same
 * contours at eight samples per pixel of arc came out at 0.43 px.
 */
function curveDeviation(contours, beziers) {
  const fit = beziers.flat().flatMap(sampleBezier)
  if (!fit.length) return Infinity
  const raw = contours.flatMap((c) => densify(c, 0.25))
  const nearFit = pointGrid(fit)
  const nearRaw = pointGrid(raw)
  let worst = 0
  for (const p of contours.flat()) worst = Math.max(worst, nearFit(p))
  for (const p of fit) worst = Math.max(worst, nearRaw(p))
  return worst
}

/* ══ ASSEMBLE ══════════════════════════════════════════════════════════════ */

const LAYERS = { cream: components(FIELDS.cream), crimson: components(FIELDS.crimson) }

const specks = []
for (const layer of ['cream', 'crimson']) {
  LAYERS[layer].list = LAYERS[layer].list.filter((c) => {
    if (c.area >= MIN_COMPONENT_PX) return true
    specks.push({ layer, x: c.minX, y: c.minY, px: c.area })
    return false
  })
}

const contains = (c, [bx0, by0, bx1, by1]) =>
  c.minX >= bx0 && c.minY >= by0 && c.maxX <= bx1 && c.maxY <= by1

const runs = new Map(RUN_BOXES.map((r) => [r.name, []]))
const claimed = new Set()
for (const spec of RUN_BOXES) {
  for (const c of LAYERS[spec.layer].list) {
    const key = `${spec.layer}#${c.id}`
    if (claimed.has(key)) continue
    if (contains(c, spec.box)) { claimed.add(key); runs.get(spec.name).push(c) }
  }
}

for (const layer of ['cream', 'crimson']) {
  for (const c of LAYERS[layer].list) {
    if (!claimed.has(`${layer}#${c.id}`)) {
      fail(`${layer} component at x${c.minX}..${c.maxX} y${c.minY}..${c.maxY} (${c.area}px) matched no run box. ` +
        'The artwork has changed shape; widen a box in RUN_BOXES or add a run.')
    }
  }
}
for (const spec of RUN_BOXES) {
  const got = runs.get(spec.name).length
  if (got !== spec.expect) {
    fail(`run ${spec.name} expected ${spec.expect} components, found ${got}. The artwork has changed; see RUN_BOXES.`)
  }
  runs.get(spec.name).sort((a, b) => a.minX - b.minX || a.minY - b.minY)
}

const droppedContours = []
const glyphs = []
for (const spec of RUN_BOXES) {
  runs.get(spec.name).forEach((comp, idx) => {
    const kept = []
    for (const c of contoursOf(FIELDS[spec.layer], LAYERS[spec.layer].label, comp)) {
      const area = Math.abs(signedArea(c))
      if (area < MIN_CONTOUR_AREA) {
        droppedContours.push({
          run: spec.name,
          idx,
          area: +area.toFixed(4),
          at: [Math.round(c[0][0]), Math.round(c[0][1])],
        })
        continue
      }
      kept.push(c)
    }
    const beziers = kept.map(fitContour).filter((b) => b.length)
    glyphs.push({
      run: spec.name,
      idx,
      key: `${spec.name}[${idx}]`,
      label: GLYPH_LABELS[spec.name][idx],
      layer: spec.layer,
      comp,
      contours: kept,
      beziers,
      d: toPathData(beziers),
      box: [
        Math.max(0, comp.minX - 3), Math.max(0, comp.minY - 3),
        Math.min(W - 1, comp.maxX + 3), Math.min(H - 1, comp.maxY + 3),
      ],
    })
  })
}

const byRun = (name) => glyphs.filter((g) => g.run === name)

/* Tagline tracking, from the traced glyph centres rather than retyped. */
const tagline = byRun('TAGLINE')
const tagCentre = (Math.min(...tagline.map((g) => g.comp.minX)) + Math.max(...tagline.map((g) => g.comp.maxX))) / 2
const TAGLINE_DX = tagline.map(
  (g) => +(((g.comp.minX + g.comp.maxX) / 2 - tagCentre) * TAGLINE_TRACKING).toFixed(1),
)

/* ══ SCORE ═════════════════════════════════════════════════════════════════ */

const scored = []
for (const g of glyphs) {
  const src = sourceCoverage(g)
  const out = cropTo(await renderOne(g.d), g.box)
  const stat = (c) => {
    const r = runLengths(c)
    return {
      ink: inkArea(c),
      counters: counters(c),
      parts: inkParts(c).length,
      p5: pct(r.rows, 5),
      p95: pct(r.rows, 95),
      hair: {
        row: hairline(r.rows),
        column: hairline(r.cols),
      },
      disc: maxInscribed(c),
    }
  }
  scored.push({
    g,
    src: stat(src),
    out: stat(out),
    diff: disagreement(src, out),
    deviation: curveDeviation(g.contours, g.beziers),
    cubics: g.beziers.flat().length,
  })
}

/* ══ GATES ═════════════════════════════════════════════════════════════════ */

const findings = []
for (const s of scored) {
  const name = `${s.g.key} ${s.g.label}`
  if (s.src.counters.length !== s.out.counters.length) {
    findings.push(`${name}: COUNTER TOPOLOGY — source has ${s.src.counters.length} enclosed counter(s) ` +
      `[${s.src.counters.join(', ')}], the trace has ${s.out.counters.length} [${s.out.counters.join(', ')}]. ` +
      'A counter that closes is painted solid under fill-rule evenodd; that is the smudge.')
  }
  if (s.src.parts !== s.out.parts) {
    findings.push(`${name}: INK TOPOLOGY — source is ${s.src.parts} connected part(s), the trace is ${s.out.parts}.`)
  }
  const discGrowth = (s.out.disc - s.src.disc) / s.src.disc
  if (discGrowth > GATE_DISC_GROWTH && s.out.disc - s.src.disc > GATE_DISC_ABS_UNITS) {
    findings.push(`${name}: MAX INSCRIBED DISC grew ${(100 * discGrowth).toFixed(1)}% ` +
      `(${s.src.disc.toFixed(1)} -> ${s.out.disc.toFixed(1)} units, +${(s.out.disc - s.src.disc).toFixed(1)}), ` +
      `over the ${(100 * GATE_DISC_GROWTH).toFixed(0)}% / ${GATE_DISC_ABS_UNITS}-unit gate. ` +
      'A disc that grows is a counter or an open bay filling in.')
  }
  if (!RESOLUTION_EXEMPT.has(s.g.key)) {
    for (const axis of ['row', 'column']) {
      const a = s.src.hair[axis]
      const b = s.out.hair[axis]
      if (a.samples < HAIRLINE_MIN_SAMPLES || b.samples < HAIRLINE_MIN_SAMPLES) continue
      const growth = (b.value - a.value) / a.value
      if (growth > GATE_HAIRLINE_GROWTH) {
        findings.push(`${name}: HAIRLINE (5th-pct ${axis} run over ${a.samples} stroke runs) grew ` +
          `${(100 * growth).toFixed(1)}% (${a.value.toFixed(2)} -> ${b.value.toFixed(2)} px), ` +
          `over the ${(100 * GATE_HAIRLINE_GROWTH).toFixed(0)}% gate.`)
      }
    }
  }
  const srcRatio = s.src.p95 / s.src.p5
  const outRatio = s.out.p95 / s.out.p5
  const drift = Math.abs(outRatio - srcRatio) / srcRatio
  if (drift > GATE_CONTRAST_DRIFT) {
    findings.push(`${name}: THICK/THIN CONTRAST moved ${(100 * drift).toFixed(0)}% ` +
      `(${srcRatio.toFixed(1)} -> ${outRatio.toFixed(1)}). This is a high-contrast serif; that ratio is the typeface.`)
  }
  if (s.deviation > FIT_MAX_DEVIATION) {
    findings.push(`${name}: CORNERS — the source contour and the fitted curve differ by ${s.deviation.toFixed(2)} px ` +
      `(symmetric), over the ${FIT_MAX_DEVIATION} px cap. Lower CORNER_ANGLE_DEG or FIT_TOLERANCE, or check ` +
      'FIT_ALPHA_MAX_FACTOR if the curve is looping rather than the corner being cut.')
  }
}

/* ══ PEN COVERAGE ══════════════════════════════════════════════════════════ */

const componentSource = readFileSync(COMPONENT, 'utf8')

/**
 * The pens are hand-authored centrelines for the drawing animation, and a
 * retrace moves the outlines under them. Read them out of the component, stroke
 * them at their shipped widths, and measure how much of each run's ink they
 * still cover. See BOUNDARY for why this warns rather than fails.
 */
async function penCoverage() {
  const block = /const PEN = \{([\s\S]*?)\n\} as const/.exec(componentSource)
  if (!block) return null
  const pens = {}
  for (const m of block[1].matchAll(/(\w+):\s*\n?\s*"([^"]+)"/g)) pens[m[1]] = m[2]
  const widths = {}
  for (const m of componentSource.matchAll(/<Pen d=\{PEN\.(\w+)\} width=\{(\d+)\}/g)) widths[m[1]] = Number(m[2])
  const groups = { D: ['dStem', 'dBowl'], N: ['nLeft', 'nDiag', 'nRight'], FLOURISH: ['flourish'] }
  const out = {}
  for (const [run, names] of Object.entries(groups)) {
    const strokes = names
      .filter((n) => pens[n] && widths[n])
      .map((n) => `<path fill="none" stroke="#000" stroke-width="${widths[n]}" stroke-linecap="round" ` +
        `stroke-linejoin="round" d="${pens[n]}"/>`)
      .join('')
    if (!strokes) continue
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
      `viewBox="${ORIGIN_X} ${ORIGIN_Y} ${W} ${H}">` +
      `<rect x="${ORIGIN_X}" y="${ORIGIN_Y}" width="${W}" height="${H}" fill="#fff"/>${strokes}</svg>`
    const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true })
    let ink = 0, covered = 0
    for (const g of byRun(run)) {
      const [x0, y0, x1, y1] = g.box
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x
        if (FIELDS[g.layer][i] <= LEVEL || LAYERS[g.layer].label[i] !== g.comp.id) continue
        ink++
        if (data[i] < 128) covered++
      }
    }
    out[run] = { pens: names, ink, covered, fraction: +(ink ? covered / ink : 0).toFixed(4) }
  }
  return out
}

const pens = await penCoverage()
const penWarnings = []
if (pens) {
  for (const [run, p] of Object.entries(pens)) {
    if (p.fraction < PEN_COVERAGE_WARN) {
      penWarnings.push(`${run}: the pen strokes cover ${(100 * p.fraction).toFixed(1)}% of the run's ink ` +
        `(floor ${(100 * PEN_COVERAGE_WARN).toFixed(0)}%). The drawing animation will visibly miss part of the ` +
        "letterform; the mask's coverage rect still closes behind it, so the resting frame is correct.")
    }
  }
}

/* ══ REPORT ════════════════════════════════════════════════════════════════ */

const totals = scored.reduce((t, s) => ({
  src: t.src + s.src.ink,
  out: t.out + s.out.ink,
  added: t.added + s.diff.added,
  removed: t.removed + s.diff.removed,
  cubics: t.cubics + s.cubics,
}), { src: 0, out: 0, added: 0, removed: 0, cubics: 0 })

const pathBytes = glyphs.reduce((n, g) => n + g.d.length, 0)
const worstDeviation = Math.max(...scored.map((s) => s.deviation))

console.log(`\ngen-logo-paths — ${relative(ROOT, SOURCE)}  ${W}x${H}`)
console.log(`  opaque plateau alpha ${PLATEAU}; ink level ${LEVEL} (${(100 * LEVEL_FRACTION).toFixed(0)}% of plateau)`)
console.log(`  fit tolerance ${FIT_TOLERANCE} px; corner angle ${CORNER_ANGLE_DEG} deg; RDP ${RDP_EPSILON} px`)
console.log(`  ${glyphs.length} glyphs, ${totals.cubics} cubics, ${pathBytes} bytes of path data`)
for (const s of specks) {
  console.log(`  dropped speck: ${s.layer} ${s.px}px at (${s.x},${s.y}) — a blend pixel on the occlusion seam`)
}
for (const c of droppedContours) {
  console.log(`  dropped contour: ${c.run}[${c.idx}] area ${c.area} px² at (${c.at}) — a sub-pixel raster pinhole`)
}

if (VERBOSE) {
  console.log('\n  glyph              counters    parts    hairline (row)      thin/thick       max disc         net ink        fit dev')
  console.log(`  ${'-'.repeat(118)}`)
  for (const s of scored) {
    console.log(
      `  ${`${s.g.key} ${s.g.label}`.padEnd(19)}` +
      `${`${s.src.counters.length} -> ${s.out.counters.length}`.padEnd(12)}` +
      `${`${s.src.parts} -> ${s.out.parts}`.padEnd(9)}` +
      `${`${s.src.hair.row.value.toFixed(2)} -> ${s.out.hair.row.value.toFixed(2)}`.padEnd(20)}` +
      `${`${(s.src.p95 / s.src.p5).toFixed(1)} -> ${(s.out.p95 / s.out.p5).toFixed(1)}`.padEnd(17)}` +
      `${`${s.src.disc.toFixed(1)} -> ${s.out.disc.toFixed(1)}`.padEnd(17)}` +
      `${`+${(100 * s.diff.added / s.src.ink).toFixed(1)}% / -${(100 * s.diff.removed / s.src.ink).toFixed(1)}%`.padEnd(16)}` +
      `${s.deviation.toFixed(2)}`,
    )
  }
}

console.log('\n  WHOLE MARK — trace against source alpha, each glyph rendered alone at 1:1')
console.log(`    source ink ${totals.src} px, traced ${totals.out} px (${((100 * (totals.out - totals.src)) / totals.src).toFixed(2)}%)`)
console.log(`    added ${totals.added} px (${(100 * totals.added / totals.src).toFixed(2)}%), removed ${totals.removed} px (${(100 * totals.removed / totals.src).toFixed(2)}%)`)
console.log(`    worst curve deviation ${worstDeviation.toFixed(2)} px (cap ${FIT_MAX_DEVIATION})`)
if (pens) {
  for (const [run, p] of Object.entries(pens)) {
    console.log(`    pen coverage ${run.padEnd(9)} ${(100 * p.fraction).toFixed(1)}% of ${p.ink} ink px  (${p.pens.join(', ')})`)
  }
}
for (const w of penWarnings) console.log(`\n  ⚠ PEN ${w}`)

if (findings.length) {
  console.error('\ngen-logo-paths: FIDELITY GATE FAILED\n')
  for (const f of findings) console.error(`  ✗ ${f}`)
  console.error('\n  Nothing was written. The gates are calibrated in the TUNABLE CONSTANTS block.')
  process.exit(1)
}
console.log('\n  ✓ counters, hairlines, thick/thin contrast and corners are within gate on every glyph.')

/* ══ WRITE ═════════════════════════════════════════════════════════════════ */

const arr = (name, doc, list) =>
  `${doc}\nconst ${name} = [\n${list.map((d) => `  "${d}",`).join('\n')}\n];\n`

const generatedBlock = [
  BEGIN,
  '/*',
  ' * Traced from public/brand/logo-source.png by scripts/gen-logo-paths.mjs.',
  ' *',
  ' * DO NOT HAND-EDIT. `npm run gen:logo -- --check` fails on any drift and the',
  ' * next run overwrites whatever is here. To change the mark, change the PNG.',
  ' *',
  ` * ${totals.cubics} cubics, ${pathBytes} bytes. Against the source alpha, each glyph rendered`,
  ` * alone at 1 unit = 1 source pixel: added ${(100 * totals.added / totals.src).toFixed(2)}%, removed ${(100 * totals.removed / totals.src).toFixed(2)}%, worst curve`,
  ` * deviation ${worstDeviation.toFixed(2)} px. Every counter, every hairline, the thick/thin ratio`,
  ' * and every corner is gated per glyph by that script; its header says how.',
  ' */',
  '',
  arr('D_PATHS', '/** The cream D, plus the fragment of its bowl the flourish cuts off. */', byRun('D').map((g) => g.d)),
  arr('N_PATHS', '/** The cream N. Painted last of the three, because it occludes the flourish. */', byRun('N').map((g) => g.d)),
  arr('FLOURISH_PATHS', '/** The crimson flourish: ONE stroke, two components, split by the N. */', byRun('FLOURISH').map((g) => g.d)),
  arr('WORDMARK_PATHS', '/** DUY NGUYEN, left to right. */', byRun('WORDMARK').map((g) => g.d)),
  arr('TAGLINE_PATHS', '/** PROVABLE AI, left to right. */', byRun('TAGLINE').map((g) => g.d)),
  '/**',
  ` * Each tagline glyph's distance from the run's centre (x ${(tagCentre + PIXEL_CENTRE + ORIGIN_X).toFixed(1)}), times ${TAGLINE_TRACKING}.`,
  ' * The reveal starts every glyph at this offset and settles it to zero, which',
  ' * is a tracking animation done on the compositor.',
  ' */',
  `const TAGLINE_DX = [\n  ${TAGLINE_DX.join(', ')},\n];`,
  '',
  END,
].join('\n')

const manifest = {
  generator: 'scripts/gen-logo-paths.mjs',
  source: relative(ROOT, SOURCE),
  sourceSize: { width: W, height: H },
  plateauAlpha: PLATEAU,
  inkLevel: LEVEL,
  params: {
    levelFraction: LEVEL_FRACTION,
    rdpEpsilon: RDP_EPSILON,
    cornerWindow: CORNER_WINDOW,
    cornerAngleDeg: CORNER_ANGLE_DEG,
    fitTolerance: FIT_TOLERANCE,
    fitMaxDeviation: FIT_MAX_DEVIATION,
    fitAlphaMaxFactor: FIT_ALPHA_MAX_FACTOR,
    pixelCentre: PIXEL_CENTRE,
    origin: [ORIGIN_X, ORIGIN_Y],
    coordDecimals: COORD_DECIMALS,
    taglineTracking: TAGLINE_TRACKING,
  },
  gates: {
    discGrowth: GATE_DISC_GROWTH,
    discAbsUnits: GATE_DISC_ABS_UNITS,
    hairlineGrowth: GATE_HAIRLINE_GROWTH,
    hairlineMinRunPx: HAIRLINE_MIN_RUN_PX,
    hairlineMinSamples: HAIRLINE_MIN_SAMPLES,
    contrastDrift: GATE_CONTRAST_DRIFT,
    counterMinPx: COUNTER_MIN_PX,
    resolutionExempt: [...RESOLUTION_EXEMPT],
  },
  totals: {
    glyphs: glyphs.length,
    cubics: totals.cubics,
    pathBytes,
    sourceInkPx: totals.src,
    tracedInkPx: totals.out,
    addedPct: +(100 * totals.added / totals.src).toFixed(3),
    removedPct: +(100 * totals.removed / totals.src).toFixed(3),
    worstCurveDeviationPx: +worstDeviation.toFixed(3),
  },
  dropped: { specks, contours: droppedContours },
  pens,
  /**
   * The one feature below the raster's resolution floor, named with its number
   * so it is a known exception rather than a gate nobody looked at.
   */
  subPixel: scored.filter((s) => RESOLUTION_EXEMPT.has(s.g.key)).map((s) => ({
    glyph: s.g.key,
    label: s.g.label,
    note: "tip is one source pixel wide; a 1 px ridge never reaches the opaque plateau, so the 50%-of-plateau level set is narrower than the artwork's own coverage",
    sourceHairlinePx: +s.src.hair.row.value.toFixed(3),
    tracedHairlinePx: +s.out.hair.row.value.toFixed(3),
  })),
  glyphs: scored.map((s) => ({
    key: s.g.key,
    label: s.g.label,
    layer: s.g.layer,
    sourceBox: [s.g.comp.minX, s.g.comp.minY, s.g.comp.maxX, s.g.comp.maxY],
    cubics: s.cubics,
    counters: { source: s.src.counters, traced: s.out.counters },
    inkParts: { source: s.src.parts, traced: s.out.parts },
    hairlinePx: {
      row: { source: +s.src.hair.row.value.toFixed(3), traced: +s.out.hair.row.value.toFixed(3), samples: s.src.hair.row.samples },
      column: { source: +s.src.hair.column.value.toFixed(3), traced: +s.out.hair.column.value.toFixed(3), samples: s.src.hair.column.samples },
    },
    contrastRatio: { source: +(s.src.p95 / s.src.p5).toFixed(2), traced: +(s.out.p95 / s.out.p5).toFixed(2) },
    maxInscribedUnits: { source: +s.src.disc.toFixed(2), traced: +s.out.disc.toFixed(2) },
    inkPx: { source: s.src.ink, traced: s.out.ink },
    addedPct: +(100 * s.diff.added / s.src.ink).toFixed(2),
    removedPct: +(100 * s.diff.removed / s.src.ink).toFixed(2),
    curveDeviationPx: +s.deviation.toFixed(3),
  })),
}

const manifestText = `${JSON.stringify(manifest, null, 2)}\n`

const b = componentSource.indexOf(BEGIN)
const e = componentSource.indexOf(END)
if (b === -1 || e === -1) {
  fail(`${relative(ROOT, COMPONENT)} has no generated-geometry fence. ` +
    'Add the BEGIN and END marker comments around the path arrays.')
}
const nextComponent = componentSource.slice(0, b) + generatedBlock + componentSource.slice(e + END.length)

if (CHECK) {
  const problems = []
  if (nextComponent !== componentSource) {
    const a = componentSource.split('\n')
    const c = nextComponent.split('\n')
    let line = 0
    while (line < Math.max(a.length, c.length) && a[line] === c[line]) line += 1
    problems.push(
      `${relative(ROOT, COMPONENT)} is STALE inside the generated fence.\n` +
      `      first difference at line ${line + 1}\n` +
      `        committed: ${(a[line] ?? '(end of file)').trim().slice(0, 96)}\n` +
      `        generated: ${(c[line] ?? '(end of file)').trim().slice(0, 96)}`)
  }
  if (!existsSync(MANIFEST) || readFileSync(MANIFEST, 'utf8') !== manifestText) {
    problems.push(`${relative(ROOT, MANIFEST)} is STALE or missing.`)
  }
  if (problems.length) {
    console.error('\ngen-logo-paths --check: FAILED\n')
    for (const p of problems) console.error(`  ✗ ${p}`)
    console.error('\n  Run `node scripts/gen-logo-paths.mjs` and commit the result.')
    process.exit(1)
  }
  console.log(`  ✓ ${relative(ROOT, COMPONENT)} and its manifest match the artwork.`)
} else {
  writeFileSync(COMPONENT, nextComponent)
  writeFileSync(MANIFEST, manifestText)
  console.log(`\n  wrote ${relative(ROOT, COMPONENT)} (inside the generated fence only)`)
  console.log(`  wrote ${relative(ROOT, MANIFEST)}`)
}
