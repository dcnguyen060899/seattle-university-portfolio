#!/usr/bin/env node
/**
 * gen-hero-photo.mjs — derives every hero image variant from ONE supplied
 * photograph.
 *
 *     node scripts/gen-hero-photo.mjs            # generate
 *     node scripts/gen-hero-photo.mjs --allow-missing   # no-op when no source
 *
 * Reads   public/brand/hero-source.{png,jpg,jpeg}
 * Writes  public/brand/hero/                     (and nothing else, ever)
 *
 * Deterministic: the same source through the same sharp/libvips produces
 * byte-identical output, so a re-run shows up in `git status` only when
 * something actually changed. Verified by running it twice and diffing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * One file cannot serve the hero on its own, for four separate reasons. The
 * first three are the reference pipeline's (MAVTERRAS `scripts/gen-hero-photo.mjs`,
 * which this is ported from); the fourth is specific to THIS page and it
 * outranks the other three.
 *
 *   1. IT IS THE WRONG SHAPE ON ONE END OR THE OTHER. The master is a
 *      LANDSCAPE campus scene. Dropped into a tall phone hero with
 *      `object-fit: cover`, a landscape frame is cropped to a narrow centre
 *      strip chosen by the browser's centre-weighted default — and on THIS
 *      photograph the centre strip is sky. Each orientation gets its own crop,
 *      decided here rather than by the browser. See PORTRAIT_CROP.
 *
 *   2. IT IS THE WRONG WEIGHT ON MOBILE. The hero image is the Largest
 *      Contentful Paint candidate on a phone. A multi-hundred-KB file on a slow
 *      link is the single worst byte in the page, so the small end gets its own
 *      hard budget that this script ENFORCES rather than reports. See BUDGETS.
 *
 *   3. IT IS THE WRONG FORMAT. A multi-MB PNG or a camera JPEG is an archival
 *      master, not a web asset. AVIF and WebP are emitted for every rung so
 *      `<picture>` can fall back.
 *
 *   4. ⚠ IT INVALIDATES EVERY PUBLISHED CONTRAST RATIO ON THE HERO, AND THAT
 *      IS THE CONSTRAINT THAT DOMINATES THIS FEATURE.
 *
 *      The hero is `[data-ground="ink"]`. Every colour in it is measured
 *      against a FLAT `#14161A`: `--fg` #F2F1EE at 16.04:1, `--fg-muted`
 *      #A3A2A8 at 7.15:1, and `--fg-accent` resolving to the crimson-lift
 *      #FF5252 at 5.68:1 — because the brand crimson #AA0000 is 2.34:1 on ink
 *      and fails everything including 1.4.11 (Addendum B, R-7).
 *
 *      Put a photograph behind that text and none of those numbers is true any
 *      more. A scrim is therefore NOT a decoration here; it is the mechanism
 *      that makes the published ratios true again, and it has to be sized
 *      against the photograph's ACTUAL BRIGHTEST REGION, measured in sampled
 *      pixels, never assumed.
 *
 *      Nothing else in the repo can do that measurement: this script is the
 *      only thing that decodes the master. So it measures, and it writes the
 *      answer into `public/brand/hero/manifest.json` as `scrim.requiredAlpha`
 *      — the minimum opacity of an ink scrim at which EVERY glyph-sized patch
 *      of the photograph still clears 4.5:1 for the weakest of the three ink
 *      foregrounds. See THE SCRIM CALCULATION below for what that claim
 *      honestly covers and what it does not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MASTER IS NOT ON DISK, AND THAT SHAPED THE WHOLE DESIGN
 *
 * The reference pipeline was written against a master it could measure: its
 * crops, its ladder rungs, its sharpen and its banding patch are all literal
 * numbers derived from a specific 1402x1122 image. That is the right shape for
 * a pipeline whose source is in the repo.
 *
 * This one's source is not in the repo yet. The owner will drop a Seattle
 * University campus photograph at `public/brand/hero-source.png` and run one
 * command. Its dimensions, aspect ratio and tonal range are all unknown here.
 * Four consequences, each of which is a deliberate DIVERGENCE from the
 * reference and is marked as such where it appears:
 *
 *   A. THE CROPS ARE SOLVED, NOT TYPED. The reference's crops are
 *      `{top, bottom, left, right}` fractions, which only mean anything if you
 *      know the source's aspect ratio. Here each crop is a TARGET ASPECT plus a
 *      FOCAL POINT, and the script solves for the largest window of that aspect
 *      that fits, centred on the focus and clamped to the frame. A literal
 *      `window` override is still accepted for when the master exists and a
 *      human wants to hand-place the frame.
 *
 *   B. THE LADDER IS DERIVED, NOT LISTED. Candidate rungs are filtered against
 *      the crop's own native width, and the script says loudly which rungs that
 *      deleted and why. It never invents pixels. See ladderFor().
 *
 *   C. THE ARTIFACT REPAIR IS GONE. The reference clone-patches two render
 *      glitches out of its master. Those are facts about that file. Repairing
 *      rectangles of an image nobody has seen would be vandalism, so there is
 *      no repair stage here — and there is a proof sheet instead (see E).
 *
 *   D. THE BANDING GATE CALIBRATES ITSELF, AND STILL ONLY WARNS. The reference
 *      calibrated its threshold against its own master and its own
 *      over-compressed controls. An uncalibrated hard gate on an unseen image
 *      would fire on the owner's first run and teach him to ignore it — and the
 *      reference's own header says it best: a gate that cries wolf gets
 *      switched off, and then nothing is watching.
 *
 *      That is exactly what happened here, and it is worth recording as a
 *      result rather than a tidy-up. The first version of this check reported
 *      the MAXIMUM per-channel encode error over a 57408-sample patch against a
 *      typed alarm of 12. On this master it read 40 at the sanctioned quality
 *      and 75 at a quality that destroys the frame: a statistic whose clean
 *      value is already triple its own threshold, warning on four rungs of
 *      every run, cleared by eye twice. It was not mis-tuned, it was measuring
 *      the tail of the codec's error distribution — which grows with patch
 *      area, not with banding.
 *
 *      It now measures the low-passed SIGNED error, which is what a contour
 *      band actually is, and it derives its threshold at build time from two
 *      control encodes of the same rung. So the scale belongs to whatever
 *      photograph is on disk, no constant is carried over from this one, and a
 *      frame whose controls do not separate is reported as unjudgeable rather
 *      than guessed at. It still warns rather than fails, for the reason above.
 *      See THE BANDING CHECK for the measurements.
 *
 *   E. IT EMITS A PROOF SHEET. `hero-proof.webp` is the master with both crop
 *      windows outlined on it. The crop constants below are REASONED DEFAULTS
 *      chosen from a verbal description of a photograph, which is the weakest
 *      kind of evidence in this repo. The proof sheet turns "re-tune the crop
 *      blind" into "look at this and move one number".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HERO STILL HAS TO WORK WITH NO PHOTOGRAPH AT ALL
 *
 * Absent assets is not a broken state, it is the CURRENT state, and it must
 * render as exactly what ships today: the flat ink ground, no build error, no
 * layout shift, no 404. That is why `public/brand/hero/manifest.json` is
 * COMMITTED with `"present": false` rather than only existing after a run. A
 * consumer can static-import it unconditionally and branch on one boolean; it
 * never has to probe the filesystem for a file that may not be there, and there
 * is no import that can fail to resolve.
 *
 * Running this script overwrites that placeholder with the real manifest.
 * Deleting the source and the generated files is a supported state: restore the
 * placeholder (`scripts/verify-hero-assets.mjs` tells you how) and the hero is
 * flat ink again.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* The hero band's measured box, from the gate that owns it. Imported rather
   than retyped so this pipeline cannot hold a stale opinion about how tall the
   hero is — see COVER LOSS. tests/e2e/hero-contrast.spec.ts re-measures these
   rows in Chromium and fails on them. */
import { TEXT_EXTENT, textExtentFor } from './check-hero-contrast.mjs'

const HERO_BAND_BOXES = TEXT_EXTENT.map((r) => ({ w: r.w, bandH: r.bandH }))

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEST = path.join(ROOT, 'public/brand/hero')
const PUBLIC_PREFIX = '/brand/hero'

/**
 * Accepted source names, in probe order. Exactly one may exist — two masters
 * with different extensions is an ambiguity, not a preference, and guessing
 * would make the output depend on readdir order.
 */
const SOURCE_CANDIDATES = [
  'public/brand/hero-source.png',
  'public/brand/hero-source.jpg',
  'public/brand/hero-source.jpeg',
]

/* ══════════════════════════════════════════════════════════════════════════
   TUNABLE CONSTANTS
   Everything in this block is a framing, weight or tone decision. Nothing
   below it needs to change to re-frame, re-size or re-weight the hero.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ── THE ART-DIRECTION BREAKPOINT ────────────────────────────────────────────
 *
 * The width at which `<picture>` switches from the portrait crop to the
 * landscape one. Ported from the reference, and re-justified for this repo
 * rather than inherited:
 *
 *   - It sits ABOVE 768px, which `tests/e2e/responsive.spec.ts` tests as a
 *     768x1024 portrait tablet. That box is taller than it is wide, so it wants
 *     the portrait crop, and 861 gives it one.
 *   - It sits BELOW 1024px, so a landscape tablet (1024x768) gets the wide
 *     band, which is the shape its box actually is.
 *   - It sits INSIDE the landscape-phone band (667..932 CSS px), which cannot
 *     be cleanly separated from portrait tablets by any single number. 861
 *     puts the widest landscape phones (iPhone 11/XR at 896, Pro Max at 926)
 *     on the landscape crop and the narrower ones (iPhone 12/13/14 at 844) on
 *     the portrait crop. That residue is real and is handled downstream by
 *     `object-position`, not here.
 *   - It is deliberately NOT one of Tailwind's breakpoints. This is an
 *     ART-DIRECTION breakpoint — which crop of the photograph is the truthful
 *     one — and it is a different question from where the layout reflows.
 *     Giving it a number that looks like a layout breakpoint invites somebody
 *     to "tidy" the two into one.
 *
 * The consumer MUST read this from the manifest rather than retyping it. A
 * `<picture>` whose media query disagrees with the crop the generator made is
 * the failure this constant exists to prevent.
 */
const ART_DIRECTION_BREAKPOINT = 861

/**
 * ── THE CROP WINDOWS ────────────────────────────────────────────────────────
 *
 * Each orientation is `{ aspect, focusX, focusY, window }`:
 *
 *   aspect   target width/height of the crop. The script takes the LARGEST
 *            window of this aspect that fits inside the master.
 *   focusX   0..1, where the window's horizontal centre wants to sit.
 *   focusY   0..1, vertical. Both are clamped so the window never leaves the
 *            frame — a focus near an edge simply lands the window flush.
 *   window   an explicit `{top, bottom, left, right}` fraction override, or
 *            null. When set it WINS outright and aspect/focus are ignored.
 *            This is the escape hatch for hand-placing a frame once the master
 *            exists; `hero-proof.webp` is what you place it against.
 *
 * ⚠⚠ THE FOCAL POINTS BELOW ARE REASONED DEFAULTS, NOT MEASUREMENTS. The
 * master is not on disk. They were chosen from the owner's description of the
 * photograph — a campus at dusk: the illuminated SEATTLE UNIVERSITY sign, a lit
 * fountain and sculpture LOW AND CENTRE-LEFT, the downtown skyline behind, sky
 * filling the upper half — and from one hard requirement: A CENTRE-WEIGHTED
 * PHONE CROP WOULD KEEP THE SKY AND LOSE THE SIGN. Every other number in this
 * file is derived or measured; these two are judgement, and they are the first
 * thing to check against `hero-proof.webp` after the first run.
 */

/**
 * THE DESKTOP CROP — a wide band, biased low.
 *
 * ASPECT 16:9. Two reasons, and they agree. It is the shape a full-bleed
 * desktop hero band actually is, so `object-fit: cover` has almost nothing to
 * throw away at the design width; and it lands within 0.4% of the reference
 * hero's shipped 1.784:1, so the geometry that pipeline's `object-position`
 * notes were measured against carries over.
 *
 * FOCUS Y 0.62 — BELOW CENTRE, WHICH IS THE WHOLE POINT. The subject sits low
 * in this frame and the upper half is sky. A centred 16:9 band would spend its
 * cut equally on sky and on ground; biasing the window down spends the entire
 * cut on sky. For any master wider than 16:9 the window is shorter than the
 * frame and a 0.62 focus lands it flush to the bottom edge — which is the
 * intent, not an accident of the clamp.
 *
 * AND IT IS A CONTRAST DECISION, NOT ONLY A COMPOSITION ONE. The brightest
 * region of a dusk campus photograph is the sky. Every row of sky the crop
 * drops lowers the frame's brightest glyph-sized patch, which lowers
 * `scrim.requiredAlpha`, which is how much of the photograph survives the
 * scrim. Cropping sky out is the cheapest contrast headroom available here,
 * and it costs nothing anyone will miss.
 *
 * FOCUS X 0.50 — the desktop band is full width on most masters, so X only
 * bites when the master is TALLER than 16:9 and the window has to be narrower
 * than the frame. Centre is the right default for that rare case.
 */
const LANDSCAPE_CROP = { aspect: 16 / 9, focusX: 0.5, focusY: 0.62, window: null }

/**
 * THE MOBILE CROP — a tall slice, taken LEFT of centre.
 *
 * ASPECT 4:5. The standard tall-image aspect, and the reference's. The
 * trade-off is worth stating because it is the one lever here that can be moved
 * without new information: a TALLER target (3:4 = 0.75, or 9:16 = 0.5625) means
 * less browser-side cropping on a tall phone box, but a NARROWER slice out of a
 * landscape master, and the slice's width is the portrait ladder's native
 * ceiling. On a 3:2 master, 4:5 yields a slice 53.3% of the master's width;
 * 9:16 yields 37.5%. That is a ~30% loss of horizontal resolution on the phone
 * rung, which is the rung a DPR-3 phone paints. 4:5 is the default because the
 * hero band is content-height rather than `100svh`, so the box it lands in is
 * not extreme. Changing it is one number and a re-run; the ladder report will
 * tell you immediately what it cost.
 *
 * FULL HEIGHT, ALWAYS. `focusY` is null, which means "take every row". This is
 * the reference's argument and it transfers exactly: every row taken is a row
 * the phone ladder does not have to invent. Cropping vertically as well would
 * shrink the slice on both axes and cost ladder rungs for nothing — the phone
 * box is tall, so vertical extent is the scarcest thing in a landscape master.
 *
 * FOCUS X 0.42 — LEFT OF CENTRE, AND THIS IS THE ONE CHOICE THE BRIEF FORCED.
 * The subject sits low and CENTRE-LEFT. The browser's default centre-weighted
 * crop would take the middle of a landscape frame, which on this photograph is
 * sky above and the gap between the sign and the skyline below. 0.42 pulls the
 * slice toward the illuminated sign and the fountain, which are what a visitor
 * has to be able to recognise for the photograph to be doing any work at all.
 *
 * 0.42 rather than 0.35 or 0.30 because "centre-left" is a description, not a
 * coordinate: it is a modest, reversible bias that keeps the composition's
 * centre inside the slice instead of pushing the frame off the subject in the
 * other direction. VERIFY IT AGAINST `hero-proof.webp` ON THE FIRST RUN. If
 * the sign is clipped at the right edge of the portrait rectangle, raise it; if
 * there is dead campus at the left, lower it. It is a values-only edit.
 */
const PORTRAIT_CROP = { aspect: 4 / 5, focusX: 0.42, focusY: null, window: null }

/**
 * ── THE LADDER ──────────────────────────────────────────────────────────────
 *
 * Candidate rungs per orientation. These are CANDIDATES, not the emitted
 * ladder: ladderFor() filters them against the crop's own native width and
 * against the per-orientation cap below, then appends the surviving ceiling as
 * the top rung. Every deletion is printed with its reason and recorded in the
 * manifest's `droppedWidths`.
 *
 * WHY THE CAP IS SEPARATE FROM THE CEILING, because they are different rules
 * pointing the same way:
 *
 *   the CEILING is the crop's native width. Emitting above it would UPSCALE —
 *   inventing detail the master does not have, paying bytes to encode it, and
 *   still looking softer than letting the browser interpolate for free. This is
 *   enforced in buildVariant(), which refuses outright.
 *
 *   the CAP is the widest rendition the biggest plausible box can use. A
 *   6000px master would otherwise produce a 6000px rung — not an upscale, just
 *   waste, and one that no byte budget could absorb.
 *
 * PORTRAIT cap 1280. A 430pt phone at DPR 3 is 1290 device px wide, and that is
 * the widest phone in circulation. LANDSCAPE cap 1920. Past that the AVIF
 * budget below is the binding constraint anyway, and a hero is not the place to
 * spend a megabyte proving a point about 4K displays.
 */
const PORTRAIT_CANDIDATE_WIDTHS = [640, 828, 1080]
const LANDSCAPE_CANDIDATE_WIDTHS = [960, 1280, 1600]
const PORTRAIT_MAX_WIDTH = 1280
const LANDSCAPE_MAX_WIDTH = 1920

/**
 * Two rungs closer together than this in width are one rung with two names.
 * The browser picks between them on the `w` descriptor, so a 5% gap buys at
 * most ~10% of bytes — less than the AVIF quality ladder moves — for a whole
 * extra file in the srcset. The NEARER rung is dropped and the native ceiling
 * is kept, because the ceiling is the rung a retina display upscales and the
 * one that carries the sharpen.
 */
const LADDER_MIN_GAP = 0.05

/** A master this small is not a hero photograph; it is a thumbnail by mistake. */
const MIN_USABLE_FRAME_WIDTH = 480

/**
 * Mild edge-biased unsharp mask, applied ONLY to a rung that was NOT resized —
 * i.e. this crop's native rung, when the crop fits under its cap.
 *
 * WHY ONLY THERE. The native rung is the one a retina display BROWSER-UPSCALES
 * at paint time, and that interpolation is a low-pass filter: it softens. We
 * cannot ship more pixels, so we put a little acutance back before the browser
 * takes it away. Every smaller rung is a DOWNSAMPLE of a larger frame and is
 * already sharp for its box; sharpening those adds halos and bytes.
 *
 * m1 (flat areas) is held at or below m2 (edges) so the mask works on
 * architecture and lettering and mostly leaves flat sky alone. Amplifying noise
 * in a shallow gradient is how you manufacture the banding the check below
 * watches for — and a dusk sky is exactly such a gradient.
 *
 * ⚠ NOT TUNED FOR THIS MASTER, because there is no master to tune against.
 * These are the reference's shipped values, chosen for timber and stonework
 * under a large sky. A dusk campus photograph is a different acutance problem
 * and probably a noisier one. Retuning is a values-only edit plus a re-run.
 */
const RETINA_SHARPEN = { sigma: 1.0, m1: 0.9, m2: 1.0 }

/**
 * Quality ladders, tried HIGHEST FIRST; the first rung that fits the file's
 * byte budget wins. A descending ladder rather than a binary search on purpose:
 * it is deterministic, it is auditable from the printed table, and it makes
 * "quality is as high as the budget allows" a property of the run rather than a
 * number somebody once typed.
 *
 * The SANCTIONED FLOOR is where the reference's ladders stop (AVIF 55, WebP
 * 75). The extra rungs below it exist so an unexpectedly large or noisy master
 * does not strand the owner on his first run — but dropping below the floor is
 * a finding, not a shrug, so it prints a warning naming the file. If a file
 * needs q50 to fit, the honest fix is a tighter crop or a smaller top rung, not
 * a quieter script.
 */
const AVIF_QUALITY_LADDER = [65, 63, 61, 59, 57, 55, 52, 50]
const WEBP_QUALITY_LADDER = [85, 83, 82, 81, 80, 79, 78, 77, 76, 75, 72]
const AVIF_SANCTIONED_FLOOR = 55
const WEBP_SANCTIONED_FLOOR = 75

/**
 * AVIF encoder effort. Sharp's default. The reference measured effort 6 saving
 * 1.0% of bytes for 2.4x the runtime on its largest variant — not a trade worth
 * making on a script people re-run while tuning a crop. WebP's scale tops out
 * at 6 and there it is genuinely worth it.
 */
const AVIF_EFFORT = 4
const WEBP_EFFORT = 6

/**
 * ── BYTE BUDGETS. Exceeding one STOPS THE RUN. ──────────────────────────────
 *
 * An asset pipeline that quietly ships a 500KB hero is worse than no pipeline,
 * because it looks like a gate.
 *
 * ⚠ THIS TABLE FIXES A FLAW THE REFERENCE'S OWN HEADER CONFESSES. There, one
 * tight budget (`BUDGET_LCP_AVIF_BYTES`) was pinned to a single filename,
 * `hero-p-640.avif` — and the header admits, in as many words, that the file is
 * only selected at DPR <= ~1.5, so "the name has been wrong about its own scope
 * since it was written". The file a MODERN phone actually downloads and paints
 * sat under the general 380KB cap, which is four times looser than the number
 * that was supposed to be protecting the LCP.
 *
 * So the budget here is a function of what the file IS, not of what it is
 * called, and the phone's real LCP file gets a real budget:
 *
 *   smallest portrait AVIF   120KB   low-DPR phones and data-saver clients.
 *                                    Roughly a third of the desktop cap,
 *                                    because a phone is where the slow link
 *                                    almost always is.
 *   any other portrait AVIF  200KB   THE FILE A DPR-2/3 PHONE PAINTS. This is
 *                                    the LCP byte, and it now has an LCP-shaped
 *                                    number instead of a desktop one.
 *   landscape AVIF           280KB   Desktop: a larger box, a wider link, and
 *                                    not usually the LCP element.
 *   any WebP                 380KB   The fallback codec. Only browsers without
 *                                    AVIF ever see it, and AVIF is ~30% smaller
 *                                    at matched quality, so this cap governs a
 *                                    shrinking minority. 380KB is about a
 *                                    second of a slow 4G link — the whole error
 *                                    budget for an LCP element.
 *   baked soft layer          16KB   These should land near 2-3KB. 16KB is not
 *                                    a budget, it is a tripwire for a mistyped
 *                                    SOFT_LONG_EDGE.
 *
 * A passing run is NOT a measurement of LCP. A byte budget is a necessary
 * condition; LCP is measured in a browser, on the deployed page.
 */
const BUDGETS = {
  lcpAvif: 120 * 1024,
  portraitAvif: 200 * 1024,
  landscapeAvif: 280 * 1024,
  webp: 380 * 1024,
  soft: 16 * 1024,
  proof: 300 * 1024,
}

/**
 * ── THE BAKED SOFT COPY ─────────────────────────────────────────────────────
 *
 * THE LOAD-BEARING TRICK, ported verbatim in spirit from the reference's
 * `hero.module.css`: `filter: blur()` IS NEVER ANIMATED. A CSS blur is
 * evaluated at rasterisation, so every engine that re-rasters the layer pays
 * for it again — which is what made the reference hero stutter in Safari, at a
 * measured 4.0-6.0x the frame budget with 96% of frames over. Instead, TWO
 * STACKED COPIES of the same background cross-fade by OPACITY ALONE, which is
 * GPU-composited and effectively free, and the blurred copy is a BITMAP baked
 * here at build time.
 *
 * These three numbers ARE a CSS filter string, baked to a file:
 *
 *     filter: blur(34px) saturate(.78) brightness(1)
 *              └─ sigma 17   └─ saturate  └─ brightness
 *
 * `sigma` IS HALF THE CSS PIXEL RADIUS — a CSS `blur(34px)` is a Gaussian of
 * stdDeviation 17, which is what sharp's `.blur()` takes. `saturate` is fed to
 * sharp's `modulate({ saturation })`; the names differ because the SOURCE of
 * the number is the CSS function and the sink is the libvips one. Neither is a
 * typo, and desynchronising the pair is the obvious way to make the baked file
 * stop matching the filter it is standing in for.
 *
 * A 34px Gaussian carries no detail above ~1/34 cycles per pixel, so a 320px
 * long edge upsampled by the compositor is visually identical to a full-size
 * blur and costs single-digit KB.
 *
 * ⚠ BRIGHTNESS IS 1.0 HERE, WHERE THE REFERENCE SHIPS 0.82 — a deliberate
 * divergence. That 0.82 was chosen when the blurred layer was the ENTRY state
 * and its darkening was part of what carried the copy's legibility; the
 * reference's own header now records that the hero was inverted, that the duty
 * moved to the scrim, and that 0.82 survives only so the inversion landed
 * without a tone change confounding it.
 *
 * This hero starts from that lesson rather than that number. LEGIBILITY IS THE
 * SCRIM'S JOB AND ONLY THE SCRIM'S JOB (see THE SCRIM CALCULATION). A soft
 * layer that quietly contributes darkening is a second, undocumented
 * legibility mechanism, and the first time somebody re-tunes it for looks the
 * contrast goes with it. At 1.0 this layer changes only blur and chroma, and
 * `modulate` scales lightness in LCh so saturation alone leaves luminance
 * alone — which is what makes the bound in the next paragraph hold.
 *
 * THE USEFUL CONSEQUENCE: blurring is averaging, and an average over a window
 * cannot exceed the maximum of the smaller-window averages inside it. With
 * brightness at 1.0, the soft copy's brightest patch is therefore BOUNDED BY
 * the sharp copy's brightest patch — so the scrim sized against the sharp frame
 * is automatically sufficient for the soft one, whichever of the two a given
 * scroll state has on top. The script measures both anyway and prints them, so
 * the bound is checked rather than argued.
 */
const SOFT_RECIPE = { sigma: 17, saturate: 0.78, brightness: 1.0 }
const SOFT_LONG_EDGE = 320
const SOFT_WEBP_QUALITY = 92

/**
 * ══ THE SHARP GRADE — TONE BAKED INTO THE PHOTOGRAPH ════════════════════════
 *
 * ⚠ THIS IS THE MECHANISM THAT MAKES THE PHOTOGRAPH VISIBLE AT ALL. Read this
 * before touching TARGET_SCRIM_ALPHA, and read it before concluding the grade
 * is a look decision. It is not; it is the other half of the scrim calculation.
 *
 * ── THE PROBLEM THE GRADE SOLVES ────────────────────────────────────────────
 *
 * This shipped at identity, and the hero rendered as a BLACK RECTANGLE. The
 * cause is arithmetic, not taste, and it is worth writing out because it is the
 * reason a "just lighten the scrim" fix cannot work.
 *
 * The binding foreground is --fg-accent #FF5252. For it to clear 4.5:1 (with
 * the engineering margin, 4.725:1) the backdrop behind a glyph may not exceed
 * relative luminance 0.019638 — a NEUTRAL sRGB VALUE OF 38.3/255. That ceiling
 * is fixed by WCAG and by the accent colour. No scrim alpha and no grade can
 * raise it. THE BRIGHTEST GLYPH-SIZED PATCH OF THIS HERO IS 38/255, ALWAYS.
 *
 * Now composite: C(V) = (1 - a)·G(V) + a·22, where G is the grade, a the scrim
 * alpha and 22 the scrim's own mid-channel value. Pin the top of that range to
 * 38.3 and the whole thing collapses to one identity:
 *
 *     C(V) = 22 + 16.3 · (G(V) − 22) / (G(Vpeak) − 22)
 *
 * The available tonal band is [a·22, 38.3]. Its TOP is nailed down; only its
 * FLOOR moves, and the floor is a·22. So:
 *
 *     a = 0.93  ->  band [20.5, 38.3]  =  17.8 levels of the 255 available
 *     a = 0.45  ->  band [ 9.9, 38.3]  =  28.4 levels
 *     a = 0.00  ->  band [ 0.0, 38.3]  =  38.3 levels
 *
 * THAT is why the ungraded hero is a black rectangle. At alpha 0.93 the master's
 * entire 1st-to-99th percentile range — sky, stonework, lamps, fountain — is
 * compressed into 12.5 sRGB levels. Every tonal difference in the photograph is
 * crushed toward one ink value. The veil does not darken the picture; IT
 * REPLACES IT.
 *
 * ── WHY THE GRADE IS THE FIX, AND A LIGHTER SCRIM ALONE IS NOT ──────────────
 *
 * Alpha is not an input. It is SOLVED from the photograph's brightest patch —
 * that is the whole point of the scrim calculation above. You cannot choose a
 * lighter scrim; you can only make a photograph that DEMANDS a lighter scrim.
 * Moving the darkening into the image is the only lever there is:
 *
 *     grade the frame down  ->  its brightest patch falls
 *                           ->  the solved alpha falls
 *                           ->  the band's floor falls
 *                           ->  the photograph's own structure survives
 *
 * A flat veil crushes the frame toward a single ink value. A tone grade lowers
 * peak luminance while KEEPING the frame's internal ratios, so what reaches the
 * screen is a dark picture rather than flat ink.
 *
 * ── WHY modulate({brightness}) AND NOT linear() OR gamma() ──────────────────
 *
 * Measured on this master, both crops, at a matched alpha of 0.50, scoring the
 * COMPOSITED result in CIE L* (RMS contrast, and mean |gradient| for local
 * detail — see the scratch solver referenced in the README):
 *
 *     shipped, no grade,   a=0.925    RMS 1.79   detail 0.272
 *     .linear(m, 0)        a=0.50     RMS 2.37   detail 0.343
 *     .modulate({brightness:k})       RMS 2.55   detail 0.425   <- winner
 *     .modulate(k) + lift +6          RMS 2.42   detail 0.412
 *     .modulate(k) + lift +12         RMS 2.25   detail 0.390
 *
 * `.linear()` is a straight multiply on ENCODED sRGB: it scales highlights and
 * shadows by the same factor, so shadows go to mud and it loses to modulate on
 * every metric. `.modulate({brightness})` multiplies CIE L*, which in encoded
 * terms is a SHOULDER — measured gain 0.30 at V=20 falling to 0.236 at V=242,
 * i.e. highlights pulled down harder than mids. That is exactly the curve a
 * dusk scene wants, and it is why it beats the alternatives here.
 *
 * A lift (raising the black floor) was tested and rejected: it brightens the
 * mids but costs slope everywhere, because affine-in-L* trades lift for
 * contrast against a pinned ceiling. The band is 28 levels wide; none of it can
 * be spent on a floor.
 *
 * `.gamma()` IS NOT USABLE AND IS NOT A NEAR MISS. sharp's `gamma(g)` defaults
 * gammaOut to g, so it darkens by 1/g and re-brightens by g — a round trip that
 * is identity except for CLIPPING THE SHADOWS TO ZERO. Verified on a 0..255
 * ramp: `.gamma(3.0)` maps 20 and 40 both to 0. It is strictly destructive here.
 *
 * ── THE SATURATION, AND THE METRIC THAT FIRST GOT IT WRONG ──────────────────
 *
 * `modulate` scales L* and LEAVES CHROMA ALONE, so darkening in L* inflates the
 * chroma-to-lightness ratio. Left uncorrected the ivy in this frame goes
 * MAROON and the wet pavement goes red — a lurid, neon dusk that is not the
 * photograph anybody supplied.
 *
 * ⚠ THE OBVIOUS METRIC IS THE WRONG ONE, AND IT IS WRONG BY A LOT. Averaging
 * C* per L* over the WHOLE composited frame says saturation 0.95 already
 * matches the master (0.94 vs 0.94). It looks nothing like it. The average is
 * swamped by the near-black majority of a dusk frame — pixels that carry no
 * visible colour at all and cannot be off, so they drag any whole-frame mean
 * toward agreement no matter what the visible pixels are doing.
 *
 * Restricting the same measure to THE BRIGHTEST HALF OF THE FRAME — the pixels
 * that actually carry colour to the eye — shows what is really happening,
 * against the master's own 0.801:
 *
 *     saturation 1.00   1.387   x1.73 the master      <- visibly maroon
 *     saturation 0.95   1.329   x1.66
 *     saturation 0.85   1.216   x1.52
 *     saturation 0.80   1.157   x1.44                 <- shipped
 *     saturation 0.75   1.096   x1.37
 *     saturation 0.60   0.899   x1.12                 <- visibly washed out
 *
 * SO WHY NOT DRIVE IT TO x1.00? Because a colorimetric match would be
 * perceptually WRONG here. The composited hero is far darker than the master,
 * and colourfulness falls with luminance (the Hunt effect) — an image that
 * matches C* per L* at a fraction of the lightness reads as drained. Some
 * inflation is the correct compensation for the darkening, not an error in it.
 *
 * 0.80 removes about 40% of the inflation the grade introduced (x1.73 -> x1.44)
 * and is where the frame stops reading maroon: checked against the master on
 * the ivy, the brick and the wet pavement, which are the surfaces the cast
 * shows on. The metric brackets the answer — below ~0.65 washed out, above
 * ~0.85 maroon — and the eye picks inside the bracket. That is the honest
 * description of this number: bounded by measurement, settled by looking.
 *
 * The shipped hero still carries roughly twice the on-screen colour of the flat
 * veil it replaces, which turned the whole frame grey (C* per L* 0.30).
 *
 * ── WARMTH ─────────────────────────────────────────────────────────────────
 *
 * A signed scalar w applied as the per-channel gain [1+w, 1, 1-w]: red up, blue
 * down, green fixed. Positive is warmer. Held to |w| <= 0.15 — past that it is
 * a colour cast, not a temperature shift. DEFAULT 0: this master is already a
 * sodium-and-sunset frame and does not need help being warm.
 *
 * ⚠ GRADING MOVES THE SCRIM, IN BOTH DIRECTIONS. Warmth is a per-channel gain
 * and red carries 21% of relative luminance, so a positive warmth RAISES the
 * required alpha and eats the headroom the brightness solve just bought. The
 * scrim is measured on the GRADED pixels precisely so this cannot be missed:
 * change anything here, re-run, and read the new alpha off the report.
 */

/**
 * THE DESIGN TARGET, AND THE ONE NUMBER TO TURN.
 *
 * The scrim alpha this grade is solved to produce. Everything else about the
 * grade is derived from it — GRADE_BRIGHTNESS is bisected at build time until
 * the measured requirement lands here.
 *
 * 0.45 rather than something lower, and the trade is measured. Structure in the
 * composited result improves monotonically as alpha falls, but with sharply
 * diminishing returns (RMS contrast vs the shipped flat veil, portrait crop):
 *
 *     a=0.80  x1.14      a=0.50  x1.43
 *     a=0.70  x1.25      a=0.45  x1.46      <- here
 *     a=0.60  x1.35      a=0.40  x1.51
 *     a=0.55  x1.38      a=0.30  x1.60
 *
 * Below ~0.40 the curve is nearly flat and the scrim stops being able to do its
 * OTHER jobs — carrying the nav under the sky and grounding the base of the
 * band. 0.45 takes essentially all of the available structure (x1.46 of a
 * x1.60 ceiling) while leaving the scrim a real presence, and it leaves
 * headroom above the 0.35 end of the design range for a master that measures
 * worse than this one.
 *
 * ⚠ THIS IS A TARGET, NOT A PUBLISHED GUARANTEE. What lands in the manifest is
 * the RE-MEASUREMENT on the graded pixels, clamped up to `--scrim-floor-min`
 * from the CSS. The solve aims here; the measurement is what is true. If the
 * two disagree, the report says so and the measurement wins.
 */
const TARGET_SCRIM_ALPHA = 0.45

/**
 * The grade. `brightness` is SOLVED AT BUILD TIME (see solveGrade) and is null
 * here on purpose — a typed brightness would be a number about the master that
 * happened to be installed the day somebody typed it, and this pipeline's whole
 * premise is that it does not know which master it will be handed.
 *
 * Set `brightness` to a literal number to pin the grade and skip the solve.
 * That is the escape hatch for a hand-graded master; the solve report will
 * still print what the pinned value achieved.
 */
/*
 * ⚠ PINNED TO IDENTITY, AND THE ARITHMETIC BELOW IS WHY. Read it before
 * unpinning; the solve above is not wrong, it optimises the wrong quantity.
 *
 * The solve minimises `requiredAlpha` — the veil the photograph DEMANDS under
 * text. But contrast constrains the COMPOSITE, not the source: for --fg-accent
 * #FF5252 to clear 4.5:1 x1.05 the backdrop under a glyph may not exceed a
 * neutral sRGB 38.28, and that ceiling does not move when the source moves.
 * Compositing at C(g) = (1-a)g + 20a with `a` at its minimum gives a surviving
 * range of 18.28 * g_max / (g_max - 20), i.e.
 *
 *     g_max      255    208    180    150    120     99     60
 *     a_min     .922   .903   .886   .859   .817   .769   .543
 *     UNDER TEXT 19.8   20.2   20.6   21.1   21.9   22.9   27.4   sRGB levels
 *     APERTURE    199    163    142    119     96     80     50   sRGB peak @24%
 *
 * Grading the master to a quarter brightness (the solve landed 0.222, g_max 99)
 * therefore bought THREE sRGB levels under the text and cost ONE HUNDRED AND
 * NINETEEN in the aperture — the text-free margins and top strip that are the
 * only place a photograph can actually be seen at AA. Net loss of ~40x.
 *
 * Measured on the graded rungs it shipped: channel max 99,67,76 and channel
 * MEAN 25,9,5 against the master's 73,53,39 — a 16x drop in mean luminance.
 * That is not a dusk grade, it is an erasure, and it is what made the page a
 * black rectangle on mobile where there is no aperture to spend the loss in.
 *
 * The veil is the mechanism that buys accessibility; the grade cannot help it
 * and can only darken what the veil has already let through. So: identity.
 * If a future master genuinely needs taming, set `brightness` to a literal —
 * but size it against the APERTURE column above, not against requiredAlpha.
 */
/*
 * ── AND A *LOCAL* GRADE DOES NOT WORK EITHER. MEASURED, 2026-09-03. ─────────
 *
 * The obvious next move, once the GLOBAL grade above is settled, is a LOCAL
 * one: bake a soft, wide darkening into the shipped rungs under the text
 * column only, leave the margins alone, and let the CSS pocket's hard-edged
 * rectangle stop being visible because the photograph has already dimmed into
 * it. It is a good idea and it does not survive measurement. Do not re-attempt
 * it without reading this.
 *
 * WHAT WAS BUILT. The right operation is not a multiply but a mix toward
 * --ground, because that makes the baked layer a THIRD term in the same
 * additive stack the stylesheet already flattens: with a baked veil `m` under a
 * CSS alpha `a`, the effective alpha is a + (1-a)m, which is >= a everywhere.
 * So it can only ever RAISE contrast — no gate can be broken by it, and that
 * is what made it worth testing at all. Shape: quintic smootherstep (zero
 * first AND second derivative at both ends, so it cannot Mach-band), ordered
 * dither, geometry in crop fractions, vertical for the portrait crop and both
 * axes for the landscape one. The composite was then reproduced offline from
 * the shipped rungs plus the literal stops in hero-scrim.module.css, and
 * agrees with check-hero-contrast's VISIBILITY table (under text sRGB 22..34).
 *
 * WHAT IT BOUGHT, on the luminance step the CSS mask reveals — |dA/dx|x(P-G),
 * the veil's own contribution, isolated from photographic detail:
 *
 *     viewport     edge_x  before -> after     edge_y  before -> after
 *     1600x900      0.55 -> 0.21  (-62%)        1.38 -> 1.23   (-11%)
 *     1280x800      1.35 -> 0.53  (-61%)        1.56 -> 1.37   (-12%)
 *     1088x800      none (no horizontal aperture) 1.91 -> 1.73  (-9%)
 *      375x812      none                        1.53 -> 0.26   (-83%)
 *
 * Real reductions, at a cost of only 2-9% of the aperture's peak luminance.
 * By the metric it was designed against, it works.
 *
 * WHY IT SHIPS ANYWAY AS IDENTITY. The metric was measuring half the cue. The
 * plate is visible for TWO reasons, and only the first is luminance. The
 * second is TEXTURE: local RMS contrast scales as (1 - A), and A runs 0.24 ->
 * 0.9468 across the mask, so the photograph's texture is divided by 14 across
 * roughly a hundred pixels. Measured across the 1600px frame in sixteen bands,
 * plate edges at bands 2.6 and 13.4:
 *
 *     shipped     13.0 16.7  2.8  1.2 ... 1.1  2.5 10.9 13.7
 *     veiled      11.2  8.8  1.0  0.4 ... 0.4  0.9  5.7 11.8
 *
 * The cliff is still there — 8.8 to 1.0 instead of 16.7 to 2.8 — and the
 * RATIO across it got slightly WORSE, while the absolute texture inside the
 * pocket fell by 3x. The baked veil buys a smaller luminance step by deleting
 * the very detail whose disappearance is the other half of what the eye reads.
 * Rendered side by side it is plainly worse: flat ink beside a lit tree is an
 * edge too, and no luminance metric can see it.
 *
 * THE GENERAL RESULT, WHICH IS THE PART WORTH KEEPING. Texture is multiplied by
 * (1 - A), and A belongs entirely to the stylesheet. NOTHING IN THE IMAGE CAN
 * CHANGE A MULTIPLIER — this pipeline can only lower texture further, never
 * soften the ratio. The blend is not an asset problem. It is the geometry of
 * the pocket, and it is fixed where the pocket is defined.
 *
 * See public/brand/hero/README.md, "Why the plate edge is not an asset
 * problem", for the full tables and the contract this hands to the scrim.
 */
const SHARP_TONE = { brightness: 1.0, saturation: 1.0, warmth: 0 }

/** Bisection bounds and depth for the brightness solve. See solveGrade. */
const GRADE_BRIGHTNESS_MIN = 0.02
const GRADE_SOLVE_STEPS = 22

/**
 * Below this the grade has taken the photograph apart rather than darkened it.
 * A multiplier this small means the master's peak was so far above the ceiling
 * that nothing recognisable survives being pulled under it — at which point the
 * honest answer is a different frame, not a heavier grade. Warns; the hero is
 * still correct and still accessible, it is just no longer a photograph.
 */
const GRADE_BRIGHTNESS_WARN = 0.08

/**
 * ══ THE SCRIM CALCULATION ═══════════════════════════════════════════════════
 *
 * THE THREE INK FOREGROUNDS, copied from `app/globals.css`'s
 * `[data-ground="ink"]` block, with the ratios that block publishes against a
 * FLAT #14161A. Those ratios are what the photograph invalidates.
 *
 * The scrim colour is the ink ground itself, which gives the whole mechanism a
 * property worth having: at alpha 1 the hero IS the flat ink ground the page
 * ships today, so the photograph is a continuous enhancement over a state that
 * already passes, and there is no alpha at which the hero is unstyled.
 *
 * WHAT `requiredAlpha` HONESTLY CLAIMS, and what it does not:
 *
 *   IT CLAIMS: composite the photograph under an ink scrim at this alpha, and
 *   every GLYPH-SIZED patch of the result clears 4.5:1 against the weakest of
 *   the three ink foregrounds. The binding foreground is #FF5252 at 5.68:1 on
 *   flat ink — the accent has the least headroom of the three, so it decides
 *   the number and the other two clear by construction.
 *
 *   IT DOES NOT CLAIM anything about individual pixels. A per-pixel maximum is
 *   the wrong measure and it is worth writing down why, because it looks more
 *   rigorous: a dusk photograph with lit lamps and a lit fountain contains
 *   near-white specular pixels, and a single such pixel would drive the
 *   required alpha to ~1.0 — a scrim that makes the photograph invisible in
 *   order to protect text from a highlight smaller than a glyph stem. The
 *   background a glyph actually sits on is the AREA behind it, so the measure
 *   is the maximum LOCAL MEAN over a glyph-sized box (frame width / 80, floored
 *   at 6px — sized for the smallest type in the band, the 11px eyebrow, which
 *   is the hardest case). The per-pixel maximum and the 99.9th percentile are
 *   measured too and PRINTED, as diagnostics, so nobody mistakes one claim for
 *   the other.
 *
 *   IT IS A FLOOR, NOT A DESIGN. It is the minimum for a FLAT scrim over the
 *   WHOLE frame. A gradient scrim, or text confined to one region, can be
 *   lighter where the photograph is darker — which is why the manifest also
 *   carries a 3x3 grid of per-region requirements. Anything built on those must
 *   pin the text to that region for real, in CSS, at every width.
 *
 *   IT IS NOT A SUBSTITUTE FOR AXE. axe-core samples computed colours; it
 *   cannot see a photograph. This number is what makes the ratios axe cannot
 *   check actually true.
 */
const INK_FOREGROUND_CATALOG = [
  { token: '--fg', hex: '#F2F1EE', flatRatio: 16.04 },
  { token: '--fg-muted', hex: '#A3A2A8', flatRatio: 7.15 },
  { token: '--fg-accent', hex: '#FF5252', flatRatio: 5.68 },
]

/**
 * ── A ROLE THE BAND HAS REMAPPED IS NOT A ROLE THIS SOLVE MUST SERVE ────────
 *
 * `[data-ground="ink"]` (app/globals.css) and `.ground`
 * (components/site/hero-scrim.module.css) land on the SAME element, so a role
 * redeclared in `.ground` wins in the cascade and the band never paints the
 * globals value. Solving against a colour the hero does not use publishes a
 * `requiredAlpha` for nothing — and because the CSS clamps the relay UP, that
 * over-solve silently becomes the floor the page actually paints.
 *
 * That is not hypothetical. The hero remaps --fg-accent to --fg, retiring every
 * small crimson run so the veil can be shallower and its edge stop being
 * visible. Left unfiltered, this list went on solving for #FF5252 at 4.5:1,
 * published 0.93, and the whole change achieved nothing on screen.
 *
 * Conservative by construction: a role is dropped ONLY when `.ground` points it
 * at another role that is itself in this catalog — so the constraint is
 * inherited, never discarded. An unreadable stylesheet, a remap to something
 * unrecognised, or no remap at all all leave the catalog intact, which is the
 * darker and therefore safe direction. `scripts/check-hero-contrast.mjs` runs
 * the same overlay against the rendered page and is the independent check.
 */
function inkForegrounds() {
  let css
  try {
    css = readFileSync(new URL('../components/site/hero-scrim.module.css', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
  } catch {
    return INK_FOREGROUND_CATALOG
  }
  const rule = /(?:^|\n)\.ground\s*\{([\s\S]*?)\n\}/.exec(css)
  if (!rule) return INK_FOREGROUND_CATALOG
  const known = new Set(INK_FOREGROUND_CATALOG.map((f) => f.token))
  const retired = new Set()
  for (const m of rule[1].matchAll(/(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)\s*;/g)) {
    const [, role, target] = m
    if (known.has(role) && known.has(target) && role !== target) retired.add(role)
  }
  const kept = INK_FOREGROUND_CATALOG.filter((f) => !retired.has(f.token))
  if (retired.size) {
    console.log(`  scrim: ${[...retired].join(', ')} remapped by .ground — solving for ${kept.map((f) => f.token).join(', ')}`)
  }
  return kept.length ? kept : INK_FOREGROUND_CATALOG
}

const INK_FOREGROUNDS = inkForegrounds()
const SCRIM_COLOR = '#14161A'
const SCRIM_TARGET_RATIO = 4.5
/**
 * THE ENGINEERING MARGIN, AND WHY THIS NUMBER IS NOT OPTIONAL.
 *
 * `components/site/hero-scrim.module.css` solves the same problem analytically
 * — ink over a pure-white source pixel — and it solves it at 4.5 x 1.05,
 * landing on `--scrim-floor-min: 93%`. It pays for three things the flat
 * arithmetic does not model: sRGB rounding on the way through the compositor,
 * encoder drift between this master and the AVIF/WebP rung a browser actually
 * paints, and the fact that an antialiased glyph edge is lighter than the glyph
 * it belongs to.
 *
 * Solving here at a bare 4.5 produced 0.914 while the CSS shipped 0.930 — the
 * SAME derivation, differing by nothing but the margin, and the CSS clamp then
 * silently raised the photograph's veil to 0.930 while this manifest went on
 * publishing 0.914. Two files, two numbers, one property: exactly the drift
 * `scripts/check-hero-contrast.mjs` check E exists to catch, and it did (it
 * fails the build on it, which is how this was found).
 *
 * So the margin lives here too, and the two derivations now agree by
 * CONSTRUCTION rather than by one clamping the other. `targetRatio` in the
 * manifest stays 4.5, because 4.5:1 is the requirement being met; this is the
 * headroom above it that the solve is done with.
 */
const SCRIM_ENGINEERING_MARGIN = 1.05
/** What the bisection actually solves against. See the note above. */
const SCRIM_SOLVE_RATIO = SCRIM_TARGET_RATIO * SCRIM_ENGINEERING_MARGIN
/** Glyph box = frame width / this, floored at 6px. See the note above. */
const GLYPH_BOX_DIVISOR = 80
/** Analysis runs on a working copy no longer than this on its long edge. */
const ANALYSIS_LONG_EDGE = 1400
/**
 * Above this, the scrim is dark enough that the photograph is barely a
 * photograph any more. Not a failure — the hero is still correct and still
 * accessible — but a finding the owner should see, because the honest fix is a
 * darker photograph or a tighter crop, not a thinner scrim.
 */
const SCRIM_ALPHA_WARN = 0.85

/**
 * How much deeper the EXIT scrim sits than the at-rest one.
 *
 * The manifest publishes three numbers, and only the first is a measurement:
 *
 *   requiredAlpha  THE FLOOR. Measured. Below it the hero's published contrast
 *                  ratios are false. Nothing may go under it.
 *   base           the at-rest scrim = requiredAlpha exactly, i.e. THE LIGHTEST
 *                  LEGAL SCRIM — as much photograph as the ratios allow.
 *   exit           the scrim as the hero scrolls away = base + this, clamped to
 *                  1. Deeper, and therefore still legal by construction.
 *
 * `base` and `exit` are DEFAULTS, not verdicts: they are a design knob the
 * consumer may override, and the only hard rule is that neither may fall below
 * `requiredAlpha`. Both are derived from the floor rather than typed, so the
 * error can only ever be in the direction of too much scrim — which is a look
 * problem, not an accessibility one.
 */
const SCRIM_EXIT_DELTA = 0.06

/**
 * ── THE BANDING CHECK ───────────────────────────────────────────────────────
 *
 * ⚠ THE PREVIOUS VERSION OF THIS CHECK MEASURED THE WRONG THING, AND HERE IS
 * THE PROOF. It reported the MAXIMUM absolute per-channel deviation between the
 * encoded-then-decoded flattest patch and the raw reference, alarming over 12.
 * Re-encoding this master's landscape crop and reading both that statistic and
 * the whole error distribution over the same patch (184x104 px, 57408 channel
 * samples):
 *
 *     quality   bytes   max|d|   p99|d|   mean|d|   LOW-PASSED max|d|
 *     q85       295KB      40        8      1.56       2.73
 *     q75       195KB      42       10      1.87       4.97
 *     q60       158KB      43       11      2.01       5.48
 *     q40       120KB      60       11      2.18       5.89
 *     q20        78KB      75       13      2.42       7.84
 *
 * Read the max|d| column. Collapsing quality from the sanctioned q85 to a q20
 * that visibly destroys the frame moves it by 1.9x — and its value at BEST
 * quality, 40, is already 3.3x the 12-level alarm. A statistic whose clean
 * reading is triple its own threshold cannot separate clean from broken; it can
 * only fire. That is exactly what it did: four warnings on every run, cleared
 * by eye twice, which is the training regime for ignoring warnings.
 *
 * The reason is structural rather than a bad constant. A maximum over 57408
 * samples reads the TAIL of the codec's error distribution, and that tail grows
 * with patch area, not with banding — mean 1.56 and p99 8 against a max of 40
 * is one ringing pixel beside one edge inside the patch. No threshold rescues
 * it, because the quantity does not carry the signal.
 *
 * ── WHAT BANDING ACTUALLY IS, AND SO WHAT TO MEASURE ────────────────────────
 *
 * A contour band is a LOW-FREQUENCY, SPATIALLY CORRELATED error: the encoder
 * lands a whole region on one value and steps to the next a few pixels over.
 * Averaging over a small window therefore PRESERVES banding and DESTROYS
 * uncorrelated codec noise — a +-45 ringing pixel becomes +-0.7 under an 8x8
 * mean, while a +-3 contour across forty pixels survives intact.
 *
 * So the statistic is the maximum absolute 8x8 MEAN of the SIGNED error. Its
 * column above spreads 2.73 -> 7.84 over the same sweep: monotone, 2.9x, and
 * with a clean floor well under any useful alarm. That is a discriminator.
 * It also settles the open question — at 2.73 on the shipped rungs, THERE IS NO
 * MEANINGFUL BANDING IN THIS FRAME, and the four warnings were false.
 *
 * ── AND THE THRESHOLD IS CALIBRATED PER MASTER, NOT TYPED ───────────────────
 *
 * Divergence D in the header is the reason this check warned rather than
 * failed: the reference calibrated its threshold against its own master, and an
 * uncalibrated constant on an unseen image fires on the owner's first run. The
 * numbers above are calibration — but they are calibration against THIS
 * photograph, and hard-coding them re-creates the same trap for the next one.
 *
 * So the generator calibrates at build time instead. For each crop and each
 * format it encodes the same patch twice more, at a control quality that cannot
 * band and one that certainly does, and alarms only when a shipped rung sits
 * closer to the broken end than to the clean one. A frame whose two controls
 * are too close together cannot be discriminated at all, and the check says so
 * and stands down rather than guessing.
 */
const BANDING_PATCH_FRACTION = 0.12
const BANDING_SEARCH_STEPS = 8
/** Window of the low-pass, in px. Big enough to kill ringing, small enough to keep a contour. */
const BANDING_LOWPASS = 8
/** The two control encodes the alarm is calibrated between, per master, per format. */
const BANDING_CONTROL_CLEAN = 95
const BANDING_CONTROL_GROSS = 15
/** Alarm at this fraction of the way from the clean control to the gross one. */
const BANDING_ALARM_FRACTION = 0.6
/**
 * Below this spread the two controls have not separated, so there is nothing to
 * calibrate against — a frame with no flat region large enough to band in, or a
 * codec that treats both controls alike. Report and stand down; a threshold
 * derived from noise is worse than no threshold.
 */
const BANDING_MIN_SPREAD = 1

/**
 * ══ THE WASH RELAY ═════════════════════════════════════════════════════════
 *
 * WHAT THE OWNER IS ACTUALLY COMPLAINING ABOUT, MEASURED — and the one number
 * the stylesheet cannot compute for itself, because it depends on the pixels.
 *
 * Six rounds of "the dark box still hovers over the photograph" have been
 * treated as a question about the veil's SHAPE. It is not; it is a question
 * about the veil's shape AND the photograph's brightness where that shape has
 * its edge, because
 *
 *     step = L*(P, alpha_gutter) - L*(P, alpha_core)
 *
 * is strongly CONVEX in the source pixel P. Over this master's landscape crop,
 * across the pocket boundary at 0.8656 -> 0.25:
 *
 *     statistic over the boundary column      dL*
 *     mean                                    2.1 .. 9.8
 *     p50                                    -2.1 .. 4.7
 *     p95                                    24.1 .. 44.4
 *     max                                    50.2 .. 51.8
 *
 * The MEAN says 10 and the bright fifth says 44. An edge is found by the eye
 * wherever it is strongest, not on average, so the p95 is the number that has
 * to be designed against — and every previous round sized the falloff against
 * something closer to the mean.
 *
 * From the round-five result — a smoothstep carrying dL* over span S peaks at
 * 1.75 * 6 * dL* / S, so one JND of peak slope needs S >= 10.5 * dL* — this
 * table converts directly into the span the stylesheet must find:
 *
 *     gutter alpha   worst p95 dL*   span needed   gutter available @1280
 *     0.25               44.4            466px            96px
 *     0.45               30.8            323px            96px
 *     0.60               20.2            212px            96px
 *     0.75                9.0             95px            96px
 *
 * TWO THINGS FOLLOW, and they are the whole finding of this round.
 *
 * FIRST, the two boundaries are NOT symmetric. Left costs 24.1, right costs
 * 44.4 — the right edge is nearly twice the left, because the right half of
 * this crop is the bright one (per-column p90 source luma runs 63..101 across
 * bands 0-6 and 144..161 across bands 9-13). The plate the owner sees is
 * lopsided, and nobody has said so.
 *
 * SECOND, and this is the part that constrains the fix: the asymmetry cannot
 * be crop-solved away. Sweeping `--hero-pos-x` from 20% to 80% — 597px of
 * horizontal overflow to spend at 1280 — moves the worst boundary cost from
 * 4.62x its budget to 4.86x. A 5% range over the entire travel. There is no
 * framing of this photograph that puts a dark column under both edges, so the
 * span, not the framing, is the only variable left.
 *
 * ⚠ THIS IS DATA, NOT A DESIGN. It is published per COLUMN OF THE CROP, in
 * crop fractions, because the mapping from a CSS x to a crop column is
 * `object-fit: cover` arithmetic that belongs to the stylesheet and changes
 * with every viewport. The consumer maps its own boundary in and reads the
 * cost off; this file must not guess where the boundary is.
 */
const WASH_COLUMNS = 16
const WASH_ROWS = 16
const WASH_GUTTER_ALPHAS = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75]
/** Rows are sampled at this stride; the p95 is stable well before every row. */
const WASH_ROW_STRIDE = 2
/**
 * S >= WASH_JND_SPAN * dL*, from the round-five derivation: a smoothstep
 * carrying dL* over S peaks at 1.75 * 6 * dL* / S, and one JND is dL* = 1.
 */
const WASH_JND_SPAN = 10.5

/** CIE L* from relative luminance. */
function lstarOf(y) {
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y
}

const pctOf = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))]
/** A 0..1 share as a percentage string, for the demand tables. */
const pctOf1 = (v) => `${(v * 100).toFixed(1)}%`

/**
 * The step profile along ONE axis. `axis: 'x'` samples columns and describes
 * what a VERTICAL boundary (the pocket's side jambs) costs where it is placed;
 * `axis: 'y'` samples rows and describes a HORIZONTAL one (the crest ramp and
 * the sill).
 *
 * BOTH ARE NEEDED, and the reason is the page measure. Below 1088px the wrap
 * fills the viewport, `--scrim-open` is 0, and the pocket has NO vertical
 * boundary on screen at all — every edge a phone can show is horizontal. A
 * relay that published only columns would be silent about every viewport at
 * or under the breakpoint, which is most of them.
 */
function stepProfile(data, info, coreAlpha, axis) {
  const { width: W, height: H, channels: C } = info
  const n = axis === 'x' ? WASH_COLUMNS : WASH_ROWS
  const extent = axis === 'x' ? W : H
  const across = axis === 'x' ? H : W
  const step = {}
  for (const a of WASH_GUTTER_ALPHAS) step[a.toFixed(2)] = []
  for (let c = 0; c < n; c += 1) {
    const fixed = Math.min(extent - 1, Math.round(((c + 0.5) * extent) / n))
    const px = []
    for (let t = 0; t < across; t += WASH_ROW_STRIDE) {
      const i = (axis === 'x' ? t * W + fixed : fixed * W + t) * C
      px.push([data[i], data[i + 1], data[i + 2]])
    }
    const core = px.map((p) => lstarOf(compositeLuma(p, coreAlpha)))
    for (const a of WASH_GUTTER_ALPHAS) {
      const d = px.map((p, k) => lstarOf(compositeLuma(p, a)) - core[k]).sort((m, n2) => m - n2)
      step[a.toFixed(2)].push(round2(pctOf(d, 0.95)))
    }
  }
  return step
}

function washRelayFor(data, info, coreAlpha) {
  const byColumn = stepProfile(data, info, coreAlpha, 'x')
  const byRow = stepProfile(data, info, coreAlpha, 'y')
  const worst = {}
  const span = {}
  for (const a of WASH_GUTTER_ALPHAS) {
    const k = a.toFixed(2)
    worst[k] = round2(Math.max(...byColumn[k], ...byRow[k]))
    span[k] = Math.ceil(WASH_JND_SPAN * worst[k])
  }
  return {
    coreAlpha: round4(coreAlpha),
    columns: WASH_COLUMNS,
    rows: WASH_ROWS,
    sampleStride: WASH_ROW_STRIDE,
    jndSpanFactor: WASH_JND_SPAN,
    gutterAlphas: WASH_GUTTER_ALPHAS,
    stepP95ByColumn: byColumn,
    stepP95ByRow: byRow,
    worstStepP95: worst,
    spanAtOneJndPx: span,
    claim:
      'For a veil that steps from `coreAlpha` inside the text column to the listed gutter alpha outside it: ' +
      'the 95th percentile, along each of `columns` evenly spaced columns (a VERTICAL boundary) and each of ' +
      '`rows` evenly spaced rows (a HORIZONTAL one), of the CIE L* difference between the two composites. ' +
      `\`spanAtOneJndPx\` is ${WASH_JND_SPAN} x the worst of both — the CSS px a smoothstep needs to carry ` +
      'that step with its peak gradient under one JND. Indices are crop fractions: column i spans ' +
      '[i/columns, (i+1)/columns] of the crop WIDTH, row j the same of its HEIGHT, and mapping a CSS ' +
      'coordinate into one of them is `object-fit: cover` arithmetic the consumer owns.',
  }
}

/** Proof sheet: the master, downscaled, with both crop windows outlined. */
const PROOF_WIDTH = 900
const PROOF_QUALITY = 80
/** Landscape window outline: SU crimson. Portrait window outline: paper. */
const PROOF_STROKE_LANDSCAPE = '#AA0000'
const PROOF_STROKE_PORTRAIT = '#FBFAF8'

/* ══════════════════════════════════════════════════════════════════════════
   MECHANISM — nothing below here is a design decision.
   ══════════════════════════════════════════════════════════════════════════ */

const args = new Set(process.argv.slice(2))
const ALLOW_MISSING = args.has('--allow-missing')

/**
 * Every `throw` in this file is a message written for the person who ran it —
 * a mistyped constant, two masters at once, a crop that would upscale. A
 * V8 stack trace under one of those is noise that hides the sentence. The
 * script is top-level `await`, so a throw surfaces as an unhandled rejection;
 * registering a handler for it suppresses Node's own report.
 */
const stopCleanly = (err) => {
  console.error(`\n  gen-hero-photo stopped:\n\n    ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
process.on('unhandledRejection', stopCleanly)
process.on('uncaughtException', stopCleanly)

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error(
    '\n  gen-hero-photo: `sharp` is not installed.\n' +
      '  It is the only dependency this script has. Install it as a devDependency:\n\n' +
      '      npm i -D sharp\n',
  )
  process.exit(1)
}

const results = []
const failures = []
const warnings = []
const fail = (file, why) => failures.push({ file, why })
const warn = (scope, why) => warnings.push({ scope, why })

/* ── Colour maths ─────────────────────────────────────────────────────────── */

/** sRGB 8-bit -> linear light, precomputed. WCAG 2.x relative luminance. */
const LINEAR = new Float64Array(256)
for (let i = 0; i < 256; i += 1) {
  const s = i / 255
  LINEAR[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const linearOf = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const lumaOf = (r, g, b) => 0.2126 * linearOf(r) + 0.7152 * linearOf(g) + 0.0722 * linearOf(b)
const lumaOfInt = (r, g, b) => 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b]
const contrastOf = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const SCRIM_RGB = hexToRgb(SCRIM_COLOR)

/**
 * Composite `rgb` under an alpha-`a` scrim of SCRIM_COLOR, in sRGB space —
 * which is what the browser does for a solid overlay — and return the result's
 * relative luminance. Kept in float; rounding to 8-bit here would make the
 * bisection below jitter at the last decimal for no gain in truth.
 */
function compositeLuma(rgb, a) {
  const r = (1 - a) * rgb[0] + a * SCRIM_RGB[0]
  const g = (1 - a) * rgb[1] + a * SCRIM_RGB[1]
  const b = (1 - a) * rgb[2] + a * SCRIM_RGB[2]
  return lumaOf(r, g, b)
}

/**
 * The maximum background luminance at which `hex` still clears `ratio`.
 * Light-on-dark, so the foreground is the lighter term:
 * CR = (Lfg + 0.05) / (Lbg + 0.05).
 */
function maxBackgroundLuma(hex, ratio) {
  const [r, g, b] = hexToRgb(hex)
  return (lumaOf(r, g, b) + 0.05) / ratio - 0.05
}

/**
 * Smallest alpha (3 dp, rounded UP) at which `rgb` composited under the scrim
 * sits at or below `limit`. Bisection over a monotone function — compositing
 * toward a darker colour can only lower luminance — so 40 halvings is exact to
 * far more precision than 3 dp, and the result is deterministic.
 */
function alphaFor(rgb, limit) {
  if (compositeLuma(rgb, 0) <= limit) return 0
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    if (compositeLuma(rgb, mid) <= limit) hi = mid
    else lo = mid
  }
  return Math.min(1, Math.ceil(hi * 1000) / 1000)
}

/* ── Tone ─────────────────────────────────────────────────────────────────── */

function assertTone() {
  const { brightness, saturation, warmth } = SHARP_TONE
  if (brightness !== null && !(brightness > 0 && brightness <= 1)) {
    throw new Error(
      `SHARP_TONE.brightness ${brightness} is outside 0..1. It is a darkening multiplier on CIE L*; ` +
        `null means "solve it against TARGET_SCRIM_ALPHA", and above 1 would BRIGHTEN the master, ` +
        `which raises the scrim requirement instead of lowering it.`,
    )
  }
  if (!(saturation > 0 && saturation <= 2)) {
    throw new Error(`SHARP_TONE.saturation ${saturation} is outside 0..2 — 1.0 is identity.`)
  }
  if (!(Math.abs(warmth) <= 0.15)) {
    throw new Error(
      `SHARP_TONE.warmth ${warmth} exceeds ±0.15. Warmth is a per-channel gain of [1+w, 1, 1-w]; ` +
        `past ±0.15 that is a colour cast, not a temperature shift.`,
    )
  }
  if (!(TARGET_SCRIM_ALPHA > 0 && TARGET_SCRIM_ALPHA < 1)) {
    throw new Error(`TARGET_SCRIM_ALPHA ${TARGET_SCRIM_ALPHA} is not an opacity strictly between 0 and 1.`)
  }
}

/**
 * ⚠ THE GRADE IS MATERIALISED TO A RAW BUFFER, AND THAT IS LOAD-BEARING.
 *
 * SHARP DOES NOT HONOUR CALL ORDER. It collects operations onto a baton and
 * applies them in ITS OWN fixed order — geometry and blur FIRST, colour
 * operations LAST — so inside one pipeline `.modulate().blur()` and
 * `.blur().modulate()` produce byte-identical output. Verified on this sharp
 * (0.35.4 / libvips 8.18.6) by hashing both.
 *
 * Two consequences, and both are bugs if the grade is left inside a pipeline:
 *
 *   1. THE SOFT LAYER'S SAFETY BOUND WOULD BREAK. SOFT_RECIPE's whole argument
 *      is that blurring is averaging, so the soft copy's brightest patch cannot
 *      exceed the sharp copy's, so one scrim covers both. That holds for
 *      blur(grade(F)). It does NOT hold for grade(blur(F)) — the grade is a
 *      CONCAVE shoulder, so by Jensen grade(mean) >= mean(grade), and grading
 *      after the blur can push the soft layer's patch ABOVE the sharp frame's.
 *      Written as one pipeline, sharp gives us exactly that wrong order.
 *
 *   2. EVERY RUNG WOULD CARRY A DIFFERENT GRADE. Colour-last means each rung
 *      gets graded after its own resample, and the grade is non-linear, so the
 *      640px rung and the 819px rung would not agree.
 *
 * Materialising is therefore not an optimisation and not a style: it is the
 * only way the stated order is the order that runs. It costs one full-res raw
 * buffer per orientation and every later stage — ladder, soft copy, analysis —
 * starts from these pixels.
 *
 * Order within the grade is saturate-and-darken THEN warm, and warmth gets its
 * own materialised stage for the same reason: `.linear()` and `.modulate()` in
 * one pipeline would be resolved in sharp's order, not in ours. Warming first
 * would push the image off the neutral axis and the saturation pass would then
 * amplify the cast it just made.
 */
async function applyGrade(frame, brightness) {
  const { saturation, warmth } = SHARP_TONE
  if (brightness === 1 && saturation === 1 && warmth === 0) return frame

  let out = await fromRaw(frame)
    .modulate({ brightness, saturation })
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (warmth !== 0) {
    out = await fromRaw(out)
      .linear([1 + warmth, 1, 1 - warmth], [0, 0, 0])
      .raw()
      .toBuffer({ resolveWithObject: true })
  }
  return out
}

/**
 * The luminance a glyph-sized patch may reach on the GRADED frame if a scrim at
 * `alpha` is to hold the binding foreground at SCRIM_SOLVE_RATIO.
 *
 * This is the inverse of the scrim calculation, and it is what makes the grade
 * a solve rather than a guess: `scrimFor()` asks "given these pixels, how much
 * veil?"; this asks "given this much veil, how bright may the pixels be?".
 * Bisected on the neutral axis because the answer is reported as a tone ceiling
 * — the real solve below works on the patch's actual colour.
 */
function maxGradedPatchLuma(alpha) {
  const limit = maxBackgroundLuma(INK_FOREGROUNDS.at(-1).hex, SCRIM_SOLVE_RATIO)
  let lo = 0
  let hi = 255
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    if (compositeLuma([mid, mid, mid], alpha) <= limit) lo = mid
    else hi = mid
  }
  return { neutralValue: lo, luma: lumaOf(lo, lo, lo), limit }
}

/**
 * Solve the brightness multiplier: the LARGEST grade (i.e. the least darkening,
 * so the most photograph) whose measured scrim requirement still lands at or
 * under `target`.
 *
 * Bisection over a monotone function — darkening can only lower the brightest
 * patch, which can only lower the required alpha — so the result is exact to
 * far more precision than the 3 dp it is rounded to, and it is deterministic.
 *
 * ⚠ `measure` MUST BE THE EXACT PATH THE MANIFEST IS MEASURED ON, sharpen and
 * all. The retina sharpen raises local maxima by design, and on this master it
 * moves the requirement from 0.451 to 0.468 — solving on an unsharpened proxy
 * would publish a number about pixels nobody paints. It costs ~46ms an
 * iteration here, which buys exactness for about a second per orientation.
 */
async function solveBrightness(measure, target) {
  /* Only the NUMBERS are kept from the ungraded probe. Holding its raw buffers
     would pin a full-resolution frame per orientation in memory for the whole
     run, for two floats. */
  const probe = await measure(1)
  const atFull = { alpha: probe.alpha, patchLuma: probe.analysis.brightest.luma }
  if (atFull.alpha <= target) return { brightness: 1, solved: false, atFull }

  let lo = GRADE_BRIGHTNESS_MIN
  let hi = 1
  for (let i = 0; i < GRADE_SOLVE_STEPS; i += 1) {
    const mid = (lo + hi) / 2
    const { alpha } = await measure(mid)
    if (alpha > target) hi = mid
    else lo = mid
  }
  /* Round DOWN to 3 dp. Rounding up would be a slightly lighter grade than the
     bisection proved, i.e. an alpha slightly above target — the wrong direction
     for a number whose whole job is to buy contrast headroom. */
  return { brightness: Math.max(GRADE_BRIGHTNESS_MIN, Math.floor(lo * 1000) / 1000), solved: true, atFull }
}

/* ── Source ───────────────────────────────────────────────────────────────── */

async function findSource() {
  const found = []
  for (const rel of SOURCE_CANDIDATES) {
    const abs = path.join(ROOT, rel)
    try {
      const s = await stat(abs)
      if (s.isFile()) found.push({ rel, abs, bytes: s.size })
    } catch {
      /* not there — the normal case */
    }
  }
  if (found.length > 1) {
    throw new Error(
      `More than one hero source is present (${found.map((f) => f.rel).join(', ')}). ` +
        `Two masters is an ambiguity, not a preference — delete all but one and re-run.`,
    )
  }
  return found[0] ?? null
}

/**
 * The committed no-photograph manifest. Written when there is no source, so the
 * absent state is a FILE THAT EXISTS AND SAYS SO rather than a missing import.
 * See "THE HERO STILL HAS TO WORK WITH NO PHOTOGRAPH AT ALL" in the header.
 */
function placeholderManifest() {
  return {
    present: false,
    note:
      'No hero photograph is installed. Drop one at public/brand/hero-source.png and run ' +
      '`node scripts/gen-hero-photo.mjs`. Consumers must render the flat ink ground when ' +
      'present is false — no <picture>, no background image, no request.',
    generator: 'scripts/gen-hero-photo.mjs',
    artDirectionBreakpointPx: ART_DIRECTION_BREAKPOINT,
  }
}

/* ── Geometry ─────────────────────────────────────────────────────────────── */

/**
 * Solve one crop into pixel coordinates against the master's real dimensions.
 *
 * An explicit `window` wins outright. Otherwise: take the largest rectangle of
 * `aspect` that fits, centre it on (focusX, focusY), clamp it inside the frame.
 * A null focus on an axis means "take the full extent of that axis", which the
 * aspect solve then honours by fitting the other axis to it.
 */
function solveCrop(crop, W, H, label) {
  if (crop.window) {
    const f = (v, d) => (v === null || v === undefined ? d : v)
    const topF = f(crop.window.top, 0)
    const bottomF = f(crop.window.bottom, 1)
    const leftF = f(crop.window.left, 0)
    const rightF = f(crop.window.right, 1)
    if (!(topF >= 0 && bottomF <= 1 && topF < bottomF) || !(leftF >= 0 && rightF <= 1 && leftF < rightF)) {
      throw new Error(`${label}: window override ${JSON.stringify(crop.window)} is not a valid 0..1 rectangle`)
    }
    const top = Math.round(topF * H)
    const left = Math.round(leftF * W)
    return { left, top, width: Math.round(rightF * W) - left, height: Math.round(bottomF * H) - top, source: 'window' }
  }

  // Largest rectangle of the target aspect that fits inside WxH.
  let width = W
  let height = Math.round(W / crop.aspect)
  if (height > H) {
    height = H
    width = Math.round(H * crop.aspect)
  }
  width = Math.min(width, W)
  height = Math.min(height, H)

  // `focus === null` means "full extent", which the fit above has already
  // produced on the axis that was not the binding one; centring on 0.5 is then
  // a no-op. Where the axis IS shorter than the frame, the focus decides.
  const fx = crop.focusX === null ? 0.5 : crop.focusX
  const fy = crop.focusY === null ? 0.5 : crop.focusY
  const left = Math.max(0, Math.min(W - width, Math.round(fx * W - width / 2)))
  const top = Math.max(0, Math.min(H - height, Math.round(fy * H - height / 2)))

  return { left, top, width, height, source: 'aspect+focus' }
}

/* ══════════════════════════════════════════════════════════════════════════
   COVER LOSS — WHAT THE BROWSER THROWS AWAY, AS A NUMBER
   ══════════════════════════════════════════════════════════════════════════

   ── WHY THIS EXISTS ─────────────────────────────────────────────────────

   This pipeline knew the aspect ratio of every crop it emitted and knew
   nothing at all about the BOX those crops land in. `object-fit: cover`
   discards whatever does not fit, and the amount discarded is a function of
   both — so a generator that never sees the box cannot tell anyone what its
   crop choices cost, and a 16:9 rung dropped into a 0.98:1 band looks in
   every report here exactly like a 16:9 rung dropped into a 16:9 band.

   That mattered the moment the hero's photo box stopped being about one
   screenful. `.frame` used to be bounded to `min(100%, 106svh)`, which at
   1280x800 is 848px — near enough 1.51:1 against a 16:9 crop, a 15%
   horizontal trim, and the stylesheet says so. If the coverage work uncaps
   that box to the band, the target becomes 1280x1306 = 0.98:1, and the same
   crop loses 45% of its width. Neither number was computable here before.

   ── THE BAND BOXES ARE IMPORTED, NOT TYPED ──────────────────────────────

   From scripts/check-hero-contrast.mjs's TEXT_EXTENT, which
   tests/e2e/hero-contrast.spec.ts re-measures in Chromium and fails on. This
   file therefore cannot hold a stale opinion about how tall the hero is, and
   the generator, the contrast gate and the blend gate all reason about one
   band box.
*/

/**
 * `object-fit: cover` of a `srcW x srcH` image into a `boxW x boxH` box.
 * Returns what survives and what is discarded, on each axis.
 */
function coverLoss(srcW, srcH, boxW, boxH) {
  const scale = Math.max(boxW / srcW, boxH / srcH)
  const drawnW = srcW * scale
  const drawnH = srcH * scale
  return {
    box: { w: Math.round(boxW), h: Math.round(boxH) },
    boxAspect: round4(boxW / boxH),
    srcAspect: round4(srcW / srcH),
    /* Share of the crop's own width and height the browser never paints. */
    lostX: round4(Math.max(0, (drawnW - boxW) / drawnW)),
    lostY: round4(Math.max(0, (drawnH - boxH) / drawnH)),
    /* Share of the crop's AREA that survives — the single number worth
       ranking candidate aspects by. */
    kept: round4((boxW * boxH) / (drawnW * drawnH)),
    /*
      THE MAGNIFICATION, WHICH IS THE COST NOBODY EXPECTS FROM A TALLER CROP.

      `cover` scales by `max(boxW/srcW, boxH/srcH)`, so a crop that fits the
      box's SHAPE better can still be a worse rendition: taking a taller
      window out of a landscape master makes the window NARROWER, and a
      narrower window has to be blown up further to fill the same box. At this
      master, the 0.98:1 candidate keeps 100% of its area at 1280 and is still
      only 1004px wide, so a 1600px band magnifies it 1.59x at DPR 1 alone.

      Flagged on `scale > 1` rather than on a width comparison. An earlier
      version compared `boxW / scale` against `srcW`, which is algebraically
      `srcW` whenever the width is the binding axis — i.e. it could never fire
      in the exact case it was written to catch.
    */
    magnification: round4(scale),
    upscales: scale > 1,
  }
}

/**
 * The hero band's box at each reference viewport, and which orientation's crop
 * the <picture> serves there. `frameFraction` is how much of the band the
 * photograph is allowed to fill: 1 once the photo box covers the band, and
 * less while it is bounded in viewport units.
 */
function bandBoxes(frameFraction = null) {
  return HERO_BAND_BOXES.map((b) => ({
    ...b,
    orientation: b.w >= ART_DIRECTION_BREAKPOINT ? 'l' : 'p',
    boxH: frameFraction === null ? b.bandH : Math.min(b.bandH, frameFraction * b.bandH),
  }))
}

/**
 * Derive the emitted ladder from a frame width, and say what was deleted.
 *
 * NEVER UPSCALES: anything above the frame's own width is dropped, not resized
 * up. The surviving ceiling (frame width, or the orientation cap, whichever is
 * smaller) is always emitted as the top rung.
 */
function ladderFor(frameWidth, candidates, cap, label) {
  if (frameWidth < MIN_USABLE_FRAME_WIDTH) {
    throw new Error(
      `${label}: the crop is only ${frameWidth}px wide, under the ${MIN_USABLE_FRAME_WIDTH}px minimum. ` +
        `Either the master is far too small for a hero, or the crop aspect is cutting a sliver out of it.`,
    )
  }

  const ceiling = Math.min(frameWidth, cap)
  const widths = []
  const dropped = []

  for (const w of candidates) {
    // A candidate that IS the ceiling is not a second rung; it is the top rung,
    // which is appended unconditionally below.
    if (w === ceiling) continue
    if (w > frameWidth) {
      dropped.push({ width: w, why: `above the ${frameWidth}px native width of this crop — emitting it would upscale` })
    } else if (w > ceiling) {
      dropped.push({ width: w, why: `above the ${cap}px emitted cap for this orientation` })
    } else if (ceiling - w <= ceiling * LADDER_MIN_GAP) {
      dropped.push({ width: w, why: `within ${(LADDER_MIN_GAP * 100).toFixed(0)}% of the ${ceiling}px top rung` })
    } else {
      widths.push(w)
    }
  }

  widths.push(ceiling)
  return { widths, dropped, ceiling, native: frameWidth }
}

/* ── Analysis ─────────────────────────────────────────────────────────────── */

/**
 * The brightest glyph-sized patch of a raw RGB buffer, plus per-pixel
 * diagnostics and a 3x3 region grid.
 *
 * The local mean is computed from summed-area tables — one pass to build, O(1)
 * per window — so a full step-1 scan of every box position is affordable and
 * there is no sampling stride to argue about.
 */
function analyseLuminance(data, info, box) {
  const { width: W, height: H, channels: C } = info
  const stride = W + 1

  const sums = [new Float64Array(stride * (H + 1)), new Float64Array(stride * (H + 1)), new Float64Array(stride * (H + 1))]
  let maxPixel = 0
  let maxPixelRgb = [0, 0, 0]
  const hist = new Float64Array(1001)

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * C
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      for (let c = 0; c < 3; c += 1) {
        const v = data[i + c]
        sums[c][(y + 1) * stride + (x + 1)] = v + sums[c][y * stride + (x + 1)] + sums[c][(y + 1) * stride + x] - sums[c][y * stride + x]
      }
      const L = lumaOfInt(r, g, b)
      if (L > maxPixel) {
        maxPixel = L
        maxPixelRgb = [r, g, b]
      }
      hist[Math.min(1000, Math.round(L * 1000))] += 1
    }
  }

  // 99.9th percentile of per-pixel luminance, from the histogram.
  const total = W * H
  let seen = 0
  let p999 = 0
  for (let i = 0; i <= 1000; i += 1) {
    seen += hist[i]
    if (seen >= total * 0.999) {
      p999 = i / 1000
      break
    }
  }

  const bw = Math.min(box, W)
  const bh = Math.min(box, H)
  const area = bw * bh
  const mean = (c, x, y) =>
    (sums[c][(y + bh) * stride + (x + bw)] -
      sums[c][y * stride + (x + bw)] -
      sums[c][(y + bh) * stride + x] +
      sums[c][y * stride + x]) /
    area

  const scanRegion = (x0, y0, x1, y1) => {
    let best = { luma: -1, rgb: [0, 0, 0], x: x0, y: y0 }
    const maxX = Math.min(x1, W - bw)
    const maxY = Math.min(y1, H - bh)
    for (let y = y0; y <= maxY; y += 1) {
      for (let x = x0; x <= maxX; x += 1) {
        const r = mean(0, x, y)
        const g = mean(1, x, y)
        const b = mean(2, x, y)
        const L = lumaOf(r, g, b)
        if (L > best.luma) best = { luma: L, rgb: [r, g, b], x, y }
      }
    }
    return best
  }

  const whole = scanRegion(0, 0, W - bw, H - bh)

  const grid = []
  for (let gy = 0; gy < 3; gy += 1) {
    for (let gx = 0; gx < 3; gx += 1) {
      const x0 = Math.round((gx * W) / 3)
      const y0 = Math.round((gy * H) / 3)
      const x1 = Math.round(((gx + 1) * W) / 3) - bw
      const y1 = Math.round(((gy + 1) * H) / 3) - bh
      const cell = x1 >= x0 && y1 >= y0 ? scanRegion(x0, y0, x1, y1) : null
      grid.push({
        cell: `${['top', 'middle', 'bottom'][gy]}-${['left', 'centre', 'right'][gx]}`,
        maxLocalLuma: cell ? round4(cell.luma) : null,
        rgb: cell ? cell.rgb : null,
      })
    }
  }

  return { box: bw, maxPixelLuma: maxPixel, maxPixelRgb, p999PixelLuma: p999, brightest: whole, grid }
}

const round4 = (n) => Math.round(n * 10000) / 10000
const round2 = (n) => Math.round(n * 100) / 100

/**
 * Turn a luminance analysis into the scrim requirement: the binding foreground,
 * the alpha it demands, and the ratios all three foregrounds actually achieve
 * once that alpha is applied.
 */
function scrimFor(analysis) {
  const limits = INK_FOREGROUNDS.map((fg) => ({
    ...fg,
    maxBgLuma: maxBackgroundLuma(fg.hex, SCRIM_SOLVE_RATIO),
    alpha: alphaFor(analysis.brightest.rgb, maxBackgroundLuma(fg.hex, SCRIM_SOLVE_RATIO)),
  }))
  const binding = limits.reduce((a, b) => (b.alpha > a.alpha ? b : a))
  const alpha = binding.alpha

  const achieved = INK_FOREGROUNDS.map((fg) => {
    const [r, g, b] = hexToRgb(fg.hex)
    return {
      token: fg.token,
      hex: fg.hex,
      flatInkRatio: fg.flatRatio,
      ratioOverBrightestPatch: round2(contrastOf(lumaOf(r, g, b), compositeLuma(analysis.brightest.rgb, alpha))),
    }
  })

  return {
    requiredAlpha: alpha,
    /* Derived defaults, never below the floor. See SCRIM_EXIT_DELTA. */
    base: alpha,
    exit: Math.min(1, Math.round((alpha + SCRIM_EXIT_DELTA) * 1000) / 1000),
    bindingForeground: binding.token,
    scrimColor: SCRIM_COLOR,
    targetRatio: SCRIM_TARGET_RATIO,
    glyphBoxPx: analysis.box,
    brightestPatchLuma: round4(analysis.brightest.luma),
    brightestPatchAt: { x: analysis.brightest.x, y: analysis.brightest.y },
    diagnostics: {
      maxPixelLuma: round4(analysis.maxPixelLuma),
      p999PixelLuma: round4(analysis.p999PixelLuma),
      /* What a naive per-pixel gate would have demanded. Printed so the gap
         between the two claims is visible rather than asserted: on a photograph
         with lit lamps this is usually close to 1.0, i.e. a black hero. */
      alphaIfGatedOnMaxPixel: alphaFor(analysis.maxPixelRgb, maxBackgroundLuma(binding.hex, SCRIM_SOLVE_RATIO)),
    },
    /**
     * The same requirement, per ninth of the frame. `requiredAlpha` above is a
     * FLAT scrim over the WHOLE frame; a gradient scrim, or copy pinned to one
     * corner, can be lighter where the photograph is darker, and this is that
     * number so nobody has to redo the compositing maths to find it.
     *
     * Anything built on a cell is only true if the text is pinned to that cell
     * IN CSS, AT EVERY WIDTH. A hero whose copy reflows out of the dark corner
     * at some viewport has silently traded its contrast for a look.
     */
    perRegion: analysis.grid.map((g) => ({
      cell: g.cell,
      maxLocalLuma: g.maxLocalLuma,
      requiredAlpha: g.rgb ? alphaFor(g.rgb, maxBackgroundLuma(binding.hex, SCRIM_SOLVE_RATIO)) : null,
    })),
    achieved,
  }
}

/* ── Banding ──────────────────────────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════════════════
   THE DEMAND PROFILE — WHAT SHARE OF THE TEXT REGION ACTUALLY NEEDS THE VEIL
   ══════════════════════════════════════════════════════════════════════════

   ── WHY THIS EXISTS, AND WHY IT IS THE MOST IMPORTANT THING THIS FILE
      MEASURES ───────────────────────────────────────────────────────────

   Everything above publishes ONE number for the veil: `requiredAlpha`, the
   brightest glyph-sized patch ANYWHERE in the crop, solved to 4.5:1. That
   number is correct, it is honestly derived, and on its own it is profoundly
   misleading — because a maximum says nothing about how many places attain
   it, and the hero has been treating it as though every square pixel of the
   band demanded it.

   It does not. On this master, sampled inside the text extent, in the band
   box's own CSS pixels:

       p50   0.000      p90  ~0.48      p99  ~0.76      max  ~0.834
       p75   0.000

   THREE QUARTERS OF THE TEXT REGION NEEDS NO DARKENING AT ALL. Between 6%
   and 12% of it needs more than 0.60, and between 0.1% and 0.4% needs more
   than 0.80. The band currently carries a flat 0.83-0.85 sheet, which is to
   say IT IS DARKENING THE WHOLE PHOTOGRAPH TO SERVE ABOUT A FIFTH OF ONE
   PERCENT OF IT. That is the entire reason the picture keeps dying, and no
   amount of re-crop, re-grade or gradient shaping addresses it, because the
   problem is not where the veil is — it is that a veil is priced by its
   maximum and paid for by its area.

   A treatment whose cost is proportional to the INK rather than to the BAND
   — a per-glyph halo, a paint-order stroke — is priced by the same maximum
   but pays for it over a few hundred square pixels per glyph instead of over
   1280x1306. The distribution below is what makes that trade provable rather
   than plausible, which is why it is published in the manifest rather than
   printed and forgotten.

   ── WHAT IS MEASURED, AND IN WHICH COORDINATE SYSTEM ────────────────────

   In the BAND BOX'S CSS PIXELS, not the crop's. The crop is painted exactly
   as `object-fit: cover` paints it — scaled by max(boxW/cropW, boxH/cropH),
   centred, and clipped to the box — and only then sampled. This matters: the
   cover scale is ~1.5x at every reference viewport, so a glyph-sized patch in
   the band box is a SMALLER patch on the crop, and measuring on the crop
   would report the demand at the wrong spatial frequency.

   Samples are taken only inside `textExtentFor(vp.w)` — the same inflated box
   the contrast gate uses — because the demand outside it is the APERTURE, and
   the aperture's job is to be bright.

   ── THE ONE FRAMING PARAMETER `cover` LEAVES FREE ───────────────────────

   At every reference viewport, on both crops, cover lands the crop's HEIGHT
   exactly on the band and overflows on WIDTH — by 1042px at 1280, 909px at
   390. So vertical framing is fully determined and `object-position` X is a
   real, unmeasured dial. It is swept here because it is free: it costs no
   bytes, no pixels and no re-encode, and it moves the demand.

   It is a TRADE, not a win, and the numbers say so plainly: sliding left
   lowers the demand and darkens the aperture, sliding right does the reverse,
   roughly monotonically, while the MAXIMUM barely moves. It is published so
   the consumer can choose with numbers instead of taste. This file does not
   pick for it — `object-position` lives in the stylesheet, and a generator
   that silently assumed one would be publishing a crop that does not exist.
*/

/** Object-position X values swept. 0 = left edge of the crop shown, 1 = right. */
const DEMAND_POSITIONS = [0, 0.25, 0.5, 0.75, 1]
/** The at-rest assumption, and the only column whose full percentile curve is published. */
const DEMAND_DEFAULT_POSITION = 0.5
/** Sample stride inside the text extent, in band-box px. 2 is ~290k samples at 1280. */
const DEMAND_STRIDE = 2
/** Coarser stride for the aperture, which is a whole-frame statistic. */
const DEMAND_APERTURE_STRIDE = 6

const percentileOf = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))]

/**
 * Summed-area tables over a raw RGB buffer, returning an O(1) mean-RGB reader
 * for any rectangle. Same technique as analyseLuminance(), reused here because
 * the demand profile slides a window over one painted frame many times.
 */
function meanReaderFor(data, info) {
  const { width: W, height: H, channels: C } = info
  const stride = W + 1
  const S = [0, 1, 2].map(() => new Float64Array(stride * (H + 1)))
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * C
      for (let c = 0; c < 3; c += 1) {
        S[c][(y + 1) * stride + x + 1] =
          data[i + c] + S[c][y * stride + x + 1] + S[c][(y + 1) * stride + x] - S[c][y * stride + x]
      }
    }
  }
  return (x0, y0, x1, y1) => {
    const n = (x1 - x0) * (y1 - y0)
    return [0, 1, 2].map(
      (c) => (S[c][y1 * stride + x1] - S[c][y0 * stride + x1] - S[c][y1 * stride + x0] + S[c][y0 * stride + x0]) / n,
    )
  }
}

/**
 * The demand profile for one crop, across every reference viewport that crop
 * serves. `frame` is the graded native crop, as raw RGB.
 *
 * The crop is painted ONCE per viewport at the cover scale, and the
 * object-position sweep then slides the sampling window over that one painted
 * frame — so the sweep costs table lookups, not resamples, and every column of
 * it is measured on identical pixels.
 */
async function demandProfile(frame, orientationKey, limit) {
  const rows = TEXT_EXTENT.filter((r) => (r.w >= ART_DIRECTION_BREAKPOINT ? 'l' : 'p') === orientationKey)
  const viewports = []

  for (const row of rows) {
    const boxW = row.w
    const boxH = row.bandH
    const scale = Math.max(boxW / frame.info.width, boxH / frame.info.height)
    const drawnW = Math.max(boxW, Math.round(frame.info.width * scale))
    const drawnH = Math.max(boxH, Math.round(frame.info.height * scale))

    const painted = await fromRaw(frame)
      .resize(drawnW, drawnH, { fit: 'fill', kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const mean = meanReaderFor(painted.data, painted.info)
    const box = Math.max(6, Math.round(boxW / GLYPH_BOX_DIVISOR))
    const ext = textExtentFor(boxW)

    /* Vertical placement is whatever cover chose; only X is free. */
    const offY = Math.round((drawnH - boxH) / 2)
    const slackX = drawnW - boxW

    const positions = DEMAND_POSITIONS.map((pos) => {
      const offX = Math.round(pos * slackX)
      const tx0 = offX + Math.round(ext.x0 * boxW)
      const tx1 = Math.min(drawnW - box, offX + Math.round(ext.x1 * boxW))
      const ty0 = offY + Math.round(ext.y0 * boxH)
      const ty1 = Math.min(drawnH - box, offY + Math.round(ext.y1 * boxH))

      const demand = []
      for (let y = ty0; y <= ty1; y += DEMAND_STRIDE) {
        for (let x = tx0; x <= tx1; x += DEMAND_STRIDE) {
          demand.push(alphaFor(mean(x, y, x + box, y + box), limit))
        }
      }
      demand.sort((a, b) => a - b)

      /* The aperture: the brightest glyph patch the reader gets to see with no
         text over it. Sampled over the visible box only, text extent excluded. */
      const aperture = []
      const vx1 = Math.min(drawnW - box, offX + boxW)
      const vy1 = Math.min(drawnH - box, offY + boxH)
      for (let y = offY; y <= vy1; y += DEMAND_APERTURE_STRIDE) {
        for (let x = offX; x <= vx1; x += DEMAND_APERTURE_STRIDE) {
          if (x >= tx0 && x <= tx1 && y >= ty0 && y <= ty1) continue
          const m = mean(x, y, x + box, y + box)
          aperture.push(lumaOf(m[0], m[1], m[2]))
        }
      }
      aperture.sort((a, b) => a - b)

      const share = (t) => round4(demand.filter((v) => v > t).length / demand.length)
      /* The sweep's rows carry only what the sweep is FOR — the trade between
         demand and aperture. The full percentile curve is published once, on
         `atDefault`, rather than five times; this manifest is declared to be
         the consumer's interface and it is not the place for redundant copies
         of the same distribution. */
      const full = {
        objectPositionX: pos,
        p50: percentileOf(demand, 0.5),
        p75: percentileOf(demand, 0.75),
        p90: percentileOf(demand, 0.9),
        p99: percentileOf(demand, 0.99),
        p999: percentileOf(demand, 0.999),
        max: demand[demand.length - 1],
        /* share() counts patches ABOVE a threshold, so "needs nothing" is its complement. */
        shareNeedingNothing: round4(1 - share(0)),
        shareOver60: share(0.6),
        shareOver80: share(0.8),
        apertureP99: round4(percentileOf(aperture, 0.99)),
        samples: demand.length,
      }
      const compact = {
        objectPositionX: pos,
        p90: full.p90,
        p99: full.p99,
        max: full.max,
        shareOver60: full.shareOver60,
        apertureP99: full.apertureP99,
      }
      return { full, compact }
    })

    viewports.push({
      viewport: `${boxW}x${boxH}`,
      width: boxW,
      bandHeight: boxH,
      glyphBoxPx: box,
      coverScale: round4(scale),
      /* Published because it is the fact that makes object-position a dial at
         all: cover pins the height and overflows the width, everywhere. */
      slack: { x: slackX, y: drawnH - boxH },
      textExtent: { x0: ext.x0, x1: ext.x1, y0: ext.y0, y1: ext.y1 },
      positions: positions.map((p) => p.compact),
      atDefault: positions.find((p) => p.compact.objectPositionX === DEMAND_DEFAULT_POSITION).full,
    })
  }

  return { viewports }
}

/** Mean absolute horizontal+vertical gradient over a rectangle. Lower is flatter. */
function flatnessOf(data, info, rect) {
  const { width: W, channels: C } = info
  let sum = 0
  let n = 0
  for (let y = rect.top; y < rect.top + rect.height - 1; y += 2) {
    for (let x = rect.left; x < rect.left + rect.width - 1; x += 2) {
      const i = (y * W + x) * C
      const ix = (y * W + x + 1) * C
      const iy = ((y + 1) * W + x) * C
      for (let c = 0; c < 3; c += 1) {
        sum += Math.abs(data[i + c] - data[ix + c]) + Math.abs(data[i + c] - data[iy + c])
        n += 2
      }
    }
  }
  return n === 0 ? Infinity : sum / n
}

/**
 * Find the flattest candidate rectangle in a frame — where banding would show
 * if it were going to. Deterministic: a fixed grid of candidates, first-wins on
 * a tie.
 */
function findBandingPatch(data, info) {
  const { width: W, height: H } = info
  const pw = Math.max(48, Math.round(W * BANDING_PATCH_FRACTION))
  const ph = Math.max(48, Math.round(H * BANDING_PATCH_FRACTION))
  if (pw >= W || ph >= H) return null

  let best = null
  for (let gy = 0; gy < BANDING_SEARCH_STEPS; gy += 1) {
    for (let gx = 0; gx < BANDING_SEARCH_STEPS; gx += 1) {
      const rect = {
        left: Math.round((gx * (W - pw)) / (BANDING_SEARCH_STEPS - 1)),
        top: Math.round((gy * (H - ph)) / (BANDING_SEARCH_STEPS - 1)),
        width: pw,
        height: ph,
      }
      const flatness = flatnessOf(data, info, rect)
      if (best === null || flatness < best.flatness) best = { ...rect, flatness }
    }
  }
  return best
}

/**
 * The contour statistic: the largest absolute BANDING_LOWPASS-square mean of
 * the SIGNED encode error over a patch.
 *
 * Signed and averaged, in that order, is the whole mechanism. A contour band is
 * a run of pixels the encoder pushed the SAME way, so its errors reinforce
 * under the mean; ringing and quantisation noise carry both signs and cancel.
 * Taking absolute values first — which is what a max-of-|d| does — throws that
 * discrimination away before the averaging can use it. See THE BANDING CHECK.
 *
 * Windows step by half their width so a contour cannot hide by straddling two
 * of them, and the arithmetic is integer sums over a fixed grid, so the result
 * is exactly reproducible.
 */
async function measureContour(encoded, reference, patch) {
  const decodedBuf = await sharp(encoded).raw().toBuffer()
  const { width: W, channels: C } = reference.info
  const win = BANDING_LOWPASS
  const step = Math.max(1, win >> 1)
  const area = win * win
  let worst = 0
  for (let y = patch.top; y + win <= patch.top + patch.height; y += step) {
    for (let x = patch.left; x + win <= patch.left + patch.width; x += step) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0
        for (let dy = 0; dy < win; dy += 1) {
          for (let dx = 0; dx < win; dx += 1) {
            const i = ((y + dy) * W + x + dx) * C + c
            sum += decodedBuf[i] - reference.data[i]
          }
        }
        const v = Math.abs(sum) / area
        if (v > worst) worst = v
      }
    }
  }
  return Math.round(worst * 100) / 100
}

/**
 * Two control encodes of the SAME frame, measured the same way: one at a
 * quality that cannot band and one that certainly does. The pair is this
 * master's own scale, so the alarm below is a position on it rather than a
 * constant carried over from a different photograph.
 *
 * Both controls encode the whole frame, not the patch alone, because the
 * shipped rungs are measured that way and a crop gives the codec a different
 * context — and a calibration taken under different conditions from the
 * measurement is not a calibration.
 */
async function calibrateContour(raw, format, patch) {
  const encode = (quality) =>
    format === 'avif'
      ? fromRaw(raw).avif({ quality, effort: AVIF_EFFORT }).toBuffer()
      : fromRaw(raw).webp({ quality, effort: WEBP_EFFORT }).toBuffer()
  const clean = await measureContour(await encode(BANDING_CONTROL_CLEAN), raw, patch)
  const gross = await measureContour(await encode(BANDING_CONTROL_GROSS), raw, patch)
  const spread = gross - clean
  return {
    cleanQuality: BANDING_CONTROL_CLEAN,
    grossQuality: BANDING_CONTROL_GROSS,
    clean,
    gross,
    usable: spread >= BANDING_MIN_SPREAD,
    alarm: spread >= BANDING_MIN_SPREAD ? Math.round((clean + BANDING_ALARM_FRACTION * spread) * 100) / 100 : null,
  }
}

/* ── Encode ───────────────────────────────────────────────────────────────── */

const fromRaw = (raw) => sharp(raw.data, { raw: raw.info })

/**
 * ══ THE MEASUREMENT MUST BE MADE ON THE BYTES THE BROWSER PAINTS ════════════
 *
 * `requiredAlpha` used to be measured on `working` — the graded, sharpened,
 * downsampled RAW frame, one step BEFORE the encoder. That is the input to the
 * pipeline, not its output, and a lossy codec is free to move a patch mean:
 * ringing around a specular highlight lands energy in neighbouring pixels, and
 * a glyph-sized box mean is exactly the statistic that integrates it.
 *
 * MEASURED, this master, every shipped rung re-decoded and re-analysed along
 * the identical path (binding role --fg-muted, 4.5:1 x1.05):
 *
 *     rung                pre-encode   shipped   drift
 *     hero-l-960.avif        0.832      0.834    +0.002   <- the worst
 *     hero-l-960.webp        0.832      0.833    +0.001
 *     hero-l-1280.avif       0.832      0.833    +0.001
 *     hero-l-1280.webp       0.832      0.833    +0.001
 *     hero-l-1536.avif       0.832      0.832     0.000
 *     hero-l-1536.webp       0.832      0.832     0.000
 *     hero-p-640.avif        0.852      0.850    -0.002
 *     hero-p-819.avif        0.852      0.852     0.000
 *
 * Two thousandths. Small, and it is small in the WRONG DIRECTION: the published
 * number was a claim about a file nobody downloads, and it understated what the
 * downloaded file needs. It is also not uniform — the SMALLEST landscape rung
 * drifts most, because it carries the most resampling and the fewest bits, and
 * it is the rung a 960px viewport actually gets.
 *
 * Nothing was ever unsafe on the page: `--scrim-floor-min` clamps the relay up
 * to 0.86, well above both numbers. But the drift is exactly the quantity the
 * x1.05 engineering margin exists to absorb, and a margin that is silently
 * spending itself on a measurement error is a margin nobody can size.
 *
 * So the solve runs on the decoded rung, per format, and the orientation
 * publishes the MAXIMUM over every file it emits — the worst thing any browser
 * can be handed. The pre-encode number survives as `scrim.preEncode` so the
 * drift stays visible rather than being absorbed.
 */
async function solveOnShippedBytes(buf) {
  const decoded = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const s = Math.min(1, ANALYSIS_LONG_EDGE / Math.max(decoded.info.width, decoded.info.height))
  const working =
    s === 1
      ? decoded
      : await fromRaw(decoded)
          .resize(Math.round(decoded.info.width * s), null, { kernel: 'lanczos3' })
          .raw()
          .toBuffer({ resolveWithObject: true })
  const box = Math.max(6, Math.round(working.info.width / GLYPH_BOX_DIVISOR))
  return scrimFor(analyseLuminance(working.data, working.info, box))
}

/**
 * Resize ONE ALREADY-GRADED frame to one output width, sharpening the native
 * rung.
 *
 * The resize is SKIPPED when the target equals the frame width: that rung is
 * already at native resolution and resampling it 1:1 would be a pure softening
 * pass. The same test selects the RETINA_SHARPEN rung — "not resized" and "this
 * crop's native rung" are the same condition, and the two crops do not share a
 * native width, so it cannot be spelled as a comparison against a constant.
 *
 * ⚠ `frame` IS THE GRADED BUFFER, NOT THE CROP. The grade is applied ONCE, at
 * the crop's native resolution, by applyGrade(), and every rung is a resample
 * of those pixels. It cannot be applied here: sharp reorders colour operations
 * after geometry regardless of call order, so a grade in this pipeline would be
 * applied to each rung AFTER its own resample, and a non-linear tone curve
 * over differently-resampled pixels does not give the rungs a common grade.
 * See applyGrade for the measurement behind that.
 */
async function buildVariant(frame, width, label) {
  const frameW = frame.info.width
  if (width > frameW) {
    throw new Error(
      `${label}: refusing to emit ${width}px from a ${frameW}px frame. The crop's native width is the ` +
        `ceiling — upscaling invents detail the master does not have, costs bytes to encode it, and still ` +
        `looks softer than letting the browser interpolate for free.`,
    )
  }

  let pipeline = fromRaw(frame)
  if (width !== frameW) pipeline = pipeline.resize(width, null, { kernel: 'lanczos3' })
  else pipeline = pipeline.sharpen(RETINA_SHARPEN)
  return pipeline.raw().toBuffer({ resolveWithObject: true })
}

/**
 * Encode one variant, walking the quality ladder down until it fits its budget.
 * Returns the buffer verbatim — running an encoded buffer back through sharp to
 * "check" it would re-encode it at default quality, which is the classic way to
 * silently lose 1.5% of every file.
 */
async function encodeToBudget({ raw, format, budget }) {
  const ladder = format === 'avif' ? AVIF_QUALITY_LADDER : WEBP_QUALITY_LADDER
  let last = null
  for (const quality of ladder) {
    const buf =
      format === 'avif'
        ? await fromRaw(raw).avif({ quality, effort: AVIF_EFFORT }).toBuffer()
        : await fromRaw(raw).webp({ quality, effort: WEBP_EFFORT }).toBuffer()
    last = { buf, quality }
    if (buf.length <= budget) break
  }
  return last
}

/**
 * Blur, desaturate and shrink ONE ALREADY-GRADED frame into its baked soft
 * layer.
 *
 * ⚠ `frame` IS THE GRADED BUFFER, AND THE CROSS-FADE DEPENDS ON IT. The two
 * copies stack and cross-fade by opacity; if the sharp ladder carried the grade
 * and this did not, the hero would visibly change brightness mid-scroll as one
 * layer took over from the other. Both copies come off the same graded pixels,
 * so the fade is a fade and nothing else.
 *
 * ⚠ AND IT IS WHAT KEEPS THE SCRIM SUFFICIENT FOR BOTH LAYERS. Because the
 * grade is materialised BEFORE this function is called, what happens here is
 * blur(grade(F)) — the order the SOFT_RECIPE bound is argued for. Blurring is
 * averaging, and an average over a window cannot exceed the maximum of the
 * smaller-window averages inside it, so the soft copy's brightest patch is
 * bounded by the sharp copy's and one scrim covers whichever layer is on top.
 * Grading AFTER the blur would invert that (see applyGrade); the check after
 * the call site verifies the bound rather than trusting this paragraph.
 *
 * SOFT_RECIPE.brightness stays 1.0. It is not "no tone" — the grade is already
 * baked into these pixels — it is "this layer adds no darkening of its own",
 * which is what keeps legibility a property of the scrim and the grade alone,
 * both of which are measured, instead of a third undocumented contributor.
 */
async function buildSoft(frame) {
  const { width, height } = frame.info
  const scale = SOFT_LONG_EDGE / Math.max(width, height)
  return fromRaw(frame)
    // Blur at full resolution, THEN downsample. Blurring after the resize would
    // need a scaled sigma and would compound resampling error.
    .blur(SOFT_RECIPE.sigma)
    .modulate({ saturation: SOFT_RECIPE.saturate, brightness: SOFT_RECIPE.brightness })
    .resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), {
      fit: 'fill',
      kernel: 'lanczos3',
    })
    .webp({ quality: SOFT_WEBP_QUALITY, effort: WEBP_EFFORT })
    .toBuffer()
}

async function emit(name, buf, budget, extra = {}) {
  await writeFile(path.join(DEST, name), buf)
  const meta = await sharp(buf).metadata()
  if (buf.length > budget) {
    fail(name, `${(buf.length / 1024).toFixed(1)}KB exceeds its ${(budget / 1024).toFixed(0)}KB budget`)
  }
  const record = { name, width: meta.width, height: meta.height, bytes: buf.length, budget, ...extra }
  results.push(record)
  return record
}

/* ══════════════════════════════════════════════════════════════════════════
   RUN
   ══════════════════════════════════════════════════════════════════════════ */

assertTone()
await mkdir(DEST, { recursive: true })

const src = await findSource()

if (!src) {
  const manifest = placeholderManifest()
  await writeFile(path.join(DEST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await sweep(new Set())
  console.log('')
  console.log('  No hero photograph found. Looked for:')
  for (const rel of SOURCE_CANDIDATES) console.log(`    ${rel}`)
  console.log('')
  console.log('  Wrote the no-photograph manifest, so the hero renders as the flat ink ground.')
  console.log('  This is a supported state, not a failure.')
  console.log('')
  console.log('  To install a photograph: drop it at public/brand/hero-source.png and re-run.')
  console.log('')
  if (!ALLOW_MISSING) {
    console.error('  (Exiting 1 because you ran the generator explicitly. Pass --allow-missing to exit 0.)\n')
    process.exit(1)
  }
  process.exit(0)
}

const sourceBytes = await readFile(src.abs)
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex')

/**
 * Decode the source EXACTLY ONCE, to raw pixels. Every frame and every variant
 * derives from this buffer; passing an ENCODED buffer between stages instead is
 * a silent quality leak (`sharp(x).toBuffer()` re-encodes at default quality).
 *
 * `.rotate()` with no argument applies the EXIF orientation tag and then drops
 * it. This matters far more here than in the reference, whose master was a
 * synthetic PNG: a camera or phone JPEG routinely carries orientation 6 or 8,
 * and without this the crops would be solved against a sideways frame.
 *
 * `.flatten()` is a no-op on an image with no alpha channel and composites onto
 * the ink ground on one that has it, so a PNG exported with transparency cannot
 * produce variants with undefined pixels under them.
 */
const probe = await sharp(src.abs).metadata()
const decoded = await sharp(src.abs)
  .rotate()
  .flatten({ background: SCRIM_COLOR })
  .toColorspace('srgb')
  .raw()
  .toBuffer({ resolveWithObject: true })

const SRC_W = decoded.info.width
const SRC_H = decoded.info.height

/**
 * A non-sRGB master is a real trap and it is silent: raw pixel values from a
 * Display P3 export get written as if they were sRGB, so everything shifts —
 * including the luminance the scrim is sized from. sharp does no ICC transform
 * on a raw extraction, so warn rather than pretend.
 */
if (probe.icc && probe.space && probe.space !== 'srgb') {
  warn(
    'source',
    `the master declares colour space "${probe.space}" and carries an ICC profile. Its pixels are being ` +
      `read as sRGB, so colours — and the luminance the scrim is sized from — will be off. Re-export the ` +
      `master as sRGB and re-run.`,
  )
}
if (src.bytes > 12 * 1024 * 1024) {
  warn(
    'source',
    `the master is ${(src.bytes / 1024 / 1024).toFixed(1)}MB and lives under public/, so it is served at ` +
      `${PUBLIC_PREFIX.replace('/hero', '')}/hero-source${path.extname(src.rel)}. Nothing links to it, but it ` +
      `is in the deployment. Consider a smaller archival export.`,
  )
}

const ORIENTATIONS = [
  {
    key: 'p',
    label: 'portrait  (mobile)',
    crop: PORTRAIT_CROP,
    candidates: PORTRAIT_CANDIDATE_WIDTHS,
    cap: PORTRAIT_MAX_WIDTH,
    media: `(max-width: ${ART_DIRECTION_BREAKPOINT}px)`,
  },
  {
    key: 'l',
    label: 'landscape (desktop)',
    crop: LANDSCAPE_CROP,
    candidates: LANDSCAPE_CANDIDATE_WIDTHS,
    cap: LANDSCAPE_MAX_WIDTH,
    media: null,
  },
]

/* ══════════════════════════════════════════════════════════════════════════
   --evaluate-crops — THE DESKTOP BAND IS NO LONGER 16:9, SO PRICE THE ANSWER
   ══════════════════════════════════════════════════════════════════════════

   ── THE QUESTION ────────────────────────────────────────────────────────

   The desktop crop is 16:9 (1.778:1) and its header argues for that against a
   band that was "a full-bleed desktop hero band", i.e. about one screenful.
   That was true while `.frame` was bounded in viewport units. It stops being
   true the moment the photo box covers the BAND, because the band is as tall
   as its copy: 1280x1306 is 0.980:1 and 1600x1338 is 1.196:1. A 1.778:1 crop
   dropped into a 0.980:1 box loses 45% of its width to `cover`.

   That is a real cost and so is every alternative, so this mode measures all
   of them rather than arguing. It WRITES NOTHING: it solves each candidate
   crop out of the master, encodes its top rung for real at the same quality
   ladder and budgets the shipped rungs use, and prints bytes and geometry.
   An estimate would have been worthless here — AVIF's rate curve against
   resolution is not something to guess at.

   ── HOW TO READ IT ──────────────────────────────────────────────────────

     native      the crop the master can actually yield at that aspect. This
                 is the ladder's ceiling, and it is the number that decides
                 whether a 1600px band gets real pixels or an upscale.
     kept        share of the crop's AREA that survives `cover` in the band
                 box. Rank candidates by the WORST of these, not the mean —
                 the worst is a viewport somebody has.
     bytes       measured, at the top rung, both formats.

   ── AND WHAT IT CANNOT TELL YOU ─────────────────────────────────────────

   Composition. `kept` counts pixels, and a crop that keeps 80% of the area
   while cutting the illuminated SEATTLE UNIVERSITY sign in half is worse than
   one that keeps 60% and holds it. `hero-proof.webp` is where that judgement
   is made; this table is what narrows the candidates before anyone looks.
*/
const EVALUATE_CROPS = args.has('--evaluate-crops')

/**
 * Candidate aspects per orientation, and why each is on the list. The focal
 * point is held at the shipped crop's, so the only variable is shape.
 *
 * BOTH ORIENTATIONS, because the phone is where the loss is worst and it is
 * the easiest one to forget: the portrait band box at 375x812 is 375x1685 =
 * 0.22:1, and the shipped 4:5 slice loses 72% of its width to `cover` there.
 * The desktop question was the one asked; the phone answer is the one that
 * turned out to be larger.
 */
const CROP_CANDIDATES = {
  l: {
    base: LANDSCAPE_CROP,
    candidates: LANDSCAPE_CANDIDATE_WIDTHS,
    cap: LANDSCAPE_MAX_WIDTH,
    avifBudget: () => BUDGETS.landscapeAvifBytes,
    list: [
      { aspect: 16 / 9, why: 'shipped — the band as it was when it was one screenful' },
      { aspect: 3 / 2, why: 'the master\'s own aspect: the largest crop that exists, no cut at all' },
      { aspect: 4 / 3, why: 'a step taller; still a conventional landscape frame' },
      { aspect: 1.196, why: 'the 1600x900 band box exactly — the WIDEST band a desktop gets' },
      { aspect: 1, why: 'square; brackets the 1280 band from above' },
      { aspect: 0.98, why: 'the 1280x800 band box exactly — the NARROWEST band a desktop gets' },
    ],
  },
  p: {
    base: PORTRAIT_CROP,
    candidates: PORTRAIT_CANDIDATE_WIDTHS,
    cap: PORTRAIT_MAX_WIDTH,
    avifBudget: () => BUDGETS.portraitAvifBytes,
    list: [
      { aspect: 4 / 5, why: 'shipped — the standard tall-image aspect, and the reference\'s' },
      { aspect: 3 / 4, why: 'a step taller; the crop the stylesheet header suggests trying first' },
      { aspect: 9 / 16, why: 'phone-screen aspect' },
      { aspect: 0.46, why: '~9:19.5 — the crop the scrim module names as landing "almost exactly"' },
      { aspect: 0.30, why: 'the 375x812 band box is 0.22:1; this is as narrow as the master allows' },
    ],
  },
}

if (EVALUATE_CROPS) {
  console.log('')
  console.log('  CROP EVALUATION — nothing is written; this is a measurement.')
  console.log(`  master ${SRC_W}x${SRC_H} (${round4(SRC_W / SRC_H)}:1)`)

  for (const [key, group] of Object.entries(CROP_CANDIDATES)) {
  const boxes = bandBoxes().filter((b) => b.orientation === key)
  console.log('')
  console.log(`  ── ${key === 'l' ? 'LANDSCAPE (desktop)' : 'PORTRAIT (mobile)'} ` +
    '— band boxes, once the photo box covers the band:')
  for (const b of boxes) {
    console.log(`     ${String(b.w).padStart(4)}px viewport -> ${b.w}x${b.bandH} = ${round4(b.w / b.bandH)}:1`)
  }
  console.log('')
  console.log(
    `  ${'aspect'.padEnd(8)} ${'native'.padEnd(11)} ${'ceiling'.padEnd(8)} ` +
      `${boxes.map((b) => `kept@${b.w}`.padEnd(10)).join('')} ${'avif'.padEnd(10)} ` +
      `${'webp'.padEnd(10)} scrim a`,
  )

  for (const cand of group.list) {
    /*
      A CANDIDATE THAT CANNOT BE CUT IS A RESULT, NOT A CRASH.

      `ladderFor` throws below MIN_USABLE_FRAME_WIDTH, which is right for a
      build — emitting a 307px hero rung would be a mistake, loudly. In an
      evaluation it is the ANSWER: it is how the table says "this master
      cannot yield that shape", which is the most useful thing it can say
      about the phone. A 0.46:1 slice out of a 1536x1024 master is 471px
      wide, and no amount of re-framing changes that.
    */
    let rect
    try {
      rect = solveCrop(
        { ...group.base, aspect: cand.aspect },
        SRC_W,
        SRC_H,
        `candidate ${round4(cand.aspect)}`,
      )
      ladderFor(rect.width, group.candidates, group.cap, `candidate ${round4(cand.aspect)}`)
    } catch (err) {
      console.log(
        `  ${round4(cand.aspect).toFixed(3).padEnd(8)} ` +
          `${`${rect ? `${rect.width}x${rect.height}` : '—'}`.padEnd(11)} ` +
          'NOT VIABLE FROM THIS MASTER',
      )
      console.log(`           ${cand.why}`)
      console.log(`           ${err.message}`)
      continue
    }
    const frame = await fromRaw(decoded).extract(rect).raw().toBuffer({ resolveWithObject: true })
    const ladder = ladderFor(
      frame.info.width,
      group.candidates,
      group.cap,
      `candidate ${round4(cand.aspect)}`,
    )
    /* The SHIPPED grade, not a re-solve. The point of the table is to compare
       shapes; re-solving the brightness per candidate would move two variables
       and make the byte column incomparable. */
    const graded = await applyGrade(frame, SHARP_TONE.brightness)
    const top = await buildVariant(graded, ladder.ceiling, `candidate ${round4(cand.aspect)}`)
    const avif = await encodeToBudget({ raw: top, format: 'avif', budget: group.avifBudget() })
    const webp = await encodeToBudget({ raw: top, format: 'webp', budget: BUDGETS.webpBytes })

    /*
      AND WHAT THE SHAPE COSTS THE VEIL, which is the column that decides this.

      LANDSCAPE_CROP's header argues 16:9 partly as a CONTRAST decision: "the
      brightest region of a dusk campus photograph is the sky. Every row of sky
      the crop drops lowers the frame's brightest glyph-sized patch, which
      lowers scrim.requiredAlpha." That argument is exactly right, and it cuts
      against every taller candidate here — a taller window out of a landscape
      master is a FULL-HEIGHT window, so it takes the sky back.

      So the alpha is measured, on the same path the manifest is measured on,
      at the shipped grade. A candidate that keeps more of the frame and needs
      a deeper veil has not necessarily won.
    */
    const s = Math.min(1, ANALYSIS_LONG_EDGE / Math.max(top.info.width, top.info.height))
    const working =
      s === 1
        ? top
        : await fromRaw(top)
            .resize(Math.round(top.info.width * s), null, { kernel: 'lanczos3' })
            .raw()
            .toBuffer({ resolveWithObject: true })
    const alpha = scrimFor(
      analyseLuminance(working.data, working.info, Math.max(6, Math.round(working.info.width / GLYPH_BOX_DIVISOR))),
    ).requiredAlpha

    const kept = boxes.map((b) =>
      coverLoss(frame.info.width, frame.info.height, b.w, b.bandH),
    )
    console.log(
      `  ${round4(cand.aspect).toFixed(3).padEnd(8)} ` +
        `${`${frame.info.width}x${frame.info.height}`.padEnd(11)} ` +
        `${String(ladder.ceiling).padEnd(8)} ` +
        `${kept.map((k) => `${(k.kept * 100).toFixed(1)}%`.padEnd(10)).join('')} ` +
        `${`${(avif.buf.length / 1024).toFixed(0)}KB q${avif.quality}`.padEnd(10)} ` +
        `${`${(webp.buf.length / 1024).toFixed(0)}KB q${webp.quality}`.padEnd(10)} ` +
        `${alpha.toFixed(3)}`,
    )
    console.log(`           ${cand.why}`)
    for (const [i, k] of kept.entries()) {
      console.log(
        `           @${boxes[i].w}: loses ${(k.lostX * 100).toFixed(1)}% of width, ` +
          `${(k.lostY * 100).toFixed(1)}% of height; ` +
          (k.upscales
            ? `MAGNIFIED ${k.magnification.toFixed(2)}x at DPR 1 ` +
              `(${frame.info.width}px crop into a ${k.box.w}x${k.box.h} box)`
            : `no magnification (${k.magnification.toFixed(2)}x)`),
      )
    }
  }
  }
  console.log('')
  console.log('  Composition is not in this table. Check every shortlisted candidate against')
  console.log('  hero-proof.webp before changing LANDSCAPE_CROP — `kept` counts pixels, and a')
  console.log('  crop that keeps more area while cutting the illuminated sign in half is worse')
  console.log('  than one that keeps less and holds it.')
  console.log('')
  process.exit(0)
}

const manifestOrientations = {}
const allDropped = []
const geometry = {}

/* ── Pass 1: geometry, ladders, and the grade solve ───────────────────────────
 *
 * THE GRADE MUST BE SOLVED BEFORE ANYTHING IS BUILT, AND IT MUST BE ONE GRADE.
 *
 * Each crop demands its own brightness to reach TARGET_SCRIM_ALPHA — the
 * portrait slice keeps more of the sunset, so it needs a darker grade than the
 * landscape band. Grading them differently would make the photograph visibly
 * change brightness as a browser window crosses ART_DIRECTION_BREAKPOINT, which
 * is a worse artefact than either grade alone.
 *
 * So both crops are solved, and the DARKEST answer wins for both. The other
 * crop then lands comfortably UNDER the target, which is the safe direction:
 * the published alpha is the max over orientations, so it is set by the crop
 * that was solved to the target, and the other one simply has headroom.
 */
const plans = []
for (const o of ORIENTATIONS) {
  const rect = solveCrop(o.crop, SRC_W, SRC_H, o.label)
  geometry[o.key] = rect

  const frame =
    rect.left === 0 && rect.top === 0 && rect.width === SRC_W && rect.height === SRC_H
      ? decoded
      : await fromRaw(decoded).extract(rect).raw().toBuffer({ resolveWithObject: true })

  const ladder = ladderFor(frame.info.width, o.candidates, o.cap, o.label)
  for (const d of ladder.dropped) allDropped.push({ orientation: o.key, ...d })

  /**
   * One measurement of the requirement at a candidate brightness, along the
   * EXACT path the manifest is measured on: grade the native crop, sharpen it
   * as the top rung is sharpened, downscale to the analysis size, find the
   * brightest glyph-sized patch. Used both by the solve and, once, for real.
   */
  const measureAt = async (brightness) => {
    const graded = await applyGrade(frame, brightness)
    const native = await buildVariant(graded, ladder.ceiling, o.label)
    const s = Math.min(1, ANALYSIS_LONG_EDGE / Math.max(native.info.width, native.info.height))
    const working =
      s === 1
        ? native
        : await fromRaw(native)
            .resize(Math.round(native.info.width * s), null, { kernel: 'lanczos3' })
            .raw()
            .toBuffer({ resolveWithObject: true })
    const box = Math.max(6, Math.round(working.info.width / GLYPH_BOX_DIVISOR))
    const analysis = analyseLuminance(working.data, working.info, box)
    return { graded, native, working, analysis, alpha: scrimFor(analysis).requiredAlpha }
  }

  let solve
  if (SHARP_TONE.brightness === null) {
    solve = await solveBrightness((b) => measureAt(b), TARGET_SCRIM_ALPHA)
  } else {
    const probe = await measureAt(1)
    solve = {
      brightness: SHARP_TONE.brightness,
      solved: false,
      pinned: true,
      atFull: { alpha: probe.alpha, patchLuma: probe.analysis.brightest.luma },
    }
  }

  plans.push({ o, rect, frame, ladder, measureAt, solve })
}

/**
 * The grade that ships. `Math.min` over the crops: the darkest solve, so BOTH
 * crops are at or under the target rather than one of them over it.
 */
const GRADE_BRIGHTNESS = Math.min(...plans.map((p) => p.solve.brightness))
const GRADE_IS_IDENTITY = GRADE_BRIGHTNESS === 1 && SHARP_TONE.saturation === 1 && SHARP_TONE.warmth === 0

if (GRADE_BRIGHTNESS < GRADE_BRIGHTNESS_WARN) {
  warn(
    'grade',
    `reaching a scrim alpha of ${TARGET_SCRIM_ALPHA} needs the master pulled to ${GRADE_BRIGHTNESS.toFixed(3)} of its ` +
      `lightness, under the ${GRADE_BRIGHTNESS_WARN} alarm. A grade that heavy does not darken a photograph, it ` +
      `dismantles one — the master's brightest region is so far above the contrast ceiling that nothing ` +
      `recognisable survives being pulled under it. The honest fixes are a darker frame or a tighter crop, not ` +
      `a heavier grade and not a thinner scrim.`,
  )
}

/* ── Pass 2: grade, build, measure, encode ─────────────────────────────────── */

for (const { o, rect, ladder, measureAt, solve } of plans) {
  /* Re-measured on the SHIPPED grade, which may be darker than this crop's own
     solve if the other crop was the binding one. The manifest publishes this
     measurement, never the target. */
  const measured = await measureAt(GRADE_BRIGHTNESS)
  const { graded, native: gradedNative, working, analysis } = measured
  const frame = graded
  const scrim = scrimFor(analysis)
  solve.achieved = scrim.requiredAlpha
  solve.ungradedAlpha = solve.atFull.alpha
  solve.ungradedPatchLuma = solve.atFull.patchLuma
  if (scrim.requiredAlpha > SCRIM_ALPHA_WARN) {
    warn(
      `scrim/${o.key}`,
      `the ${o.label.trim()} crop needs an ink scrim at alpha ${scrim.requiredAlpha.toFixed(3)} for ` +
        `${scrim.bindingForeground} to clear ${SCRIM_TARGET_RATIO}:1, so UNDER THE TEXT this frame is barely ` +
        `visible — above ${SCRIM_ALPHA_WARN} it always is, and no grade changes that (the composite ceiling ` +
        `under a glyph is fixed; see SHARP_TONE for the arithmetic). What decides whether the hero reads as a ` +
        `photograph is the APERTURE — the text-free regions where the veil is thin — not this number. Check it ` +
        `in components/site/hero-scrim.module.css and in check-hero-contrast's VISIBILITY table before ` +
        `reaching for a darker crop or a heavier grade.`,
    )
  }

  /* The demand profile, measured on the SHIPPED graded crop and against the
     SAME limit the flat scrim was solved against, so the two numbers are
     directly comparable: `scrim.requiredAlpha` is this distribution's maximum
     over the whole crop, and the percentiles say what that maximum costs. */
  const demand = await demandProfile(
    frame,
    o.key,
    maxBackgroundLuma(INK_FOREGROUNDS.find((f) => f.token === scrim.bindingForeground).hex, SCRIM_SOLVE_RATIO),
  )

  const bandingPatch = findBandingPatch(working.data, working.info)

  /* The worst shipped rung, and which file it was. See solveOnShippedBytes. */
  let shippedScrim = null
  let shippedBoundFile = null

  const files = []
  for (const width of ladder.widths) {
    const raw = width === ladder.ceiling ? gradedNative : await buildVariant(frame, width, o.label)
    const isSmallestPortraitAvif = o.key === 'p' && width === ladder.widths[0]

    for (const format of ['avif', 'webp']) {
      const name = `hero-${o.key}-${width}.${format}`
      const budget =
        format === 'webp'
          ? BUDGETS.webp
          : o.key === 'l'
            ? BUDGETS.landscapeAvif
            : isSmallestPortraitAvif
              ? BUDGETS.lcpAvif
              : BUDGETS.portraitAvif

      const { buf, quality } = await encodeToBudget({ raw, format, budget })

      const onBytes = await solveOnShippedBytes(buf)
      if (!shippedScrim || onBytes.requiredAlpha > shippedScrim.requiredAlpha) {
        shippedScrim = onBytes
        shippedBoundFile = name
      }

      const floor = format === 'avif' ? AVIF_SANCTIONED_FLOOR : WEBP_SANCTIONED_FLOOR
      if (quality < floor) {
        warn(
          name,
          `encoded at q${quality}, below the sanctioned ${format.toUpperCase()} floor of q${floor}, to fit its ` +
            `${(budget / 1024).toFixed(0)}KB budget. The master is heavier than this ladder expects — a tighter ` +
            `crop or a smaller top rung is the real fix.`,
        )
      }

      /* The contour check runs against the FULL-RESOLUTION raw of this rung, so
         the patch has to be mapped out of the analysis frame and back. Only the
         top rung shares the analysis frame's geometry exactly; smaller rungs
         are rescaled, which is fine — the patch is a region, not a pixel.

         Calibration is per RUNG and per FORMAT, not once per crop, because both
         change what the statistic means: an 8x8 window covers more of the scene
         at 960px than at 1536px, the resample that produced the smaller rung has
         already low-passed it, and AVIF and WebP quantise differently. A scale
         borrowed across any of those is not this rung's scale. */
      let contour = null
      let contourAlarm = null
      if (bandingPatch) {
        /* ⚠ THE MAPPED RECT IS CLAMPED, NOT BOUNDS-TESTED, and that is a fix
           rather than a tidy-up. Rounding each edge independently can push
           `left + width` one pixel past the frame when the patch sits against
           the right or bottom edge — which is exactly where findBandingPatch's
           fixed grid puts it whenever the flattest region is a corner. The
           previous code dropped the rung on that test, so hero-l-1280 was never
           checked in either format, silently, and its dash in the report read
           as "no patch" rather than "off by one". Clamping keeps the region
           inside the frame and one pixel narrower; skipping keeps nothing. */
        const s = raw.info.width / working.info.width
        const left = Math.min(Math.round(bandingPatch.left * s), Math.max(0, raw.info.width - 32))
        const top = Math.min(Math.round(bandingPatch.top * s), Math.max(0, raw.info.height - 32))
        const mapped = {
          left,
          top,
          width: Math.min(Math.round(bandingPatch.width * s), raw.info.width - left),
          height: Math.min(Math.round(bandingPatch.height * s), raw.info.height - top),
        }
        if (mapped.width >= 32 && mapped.height >= 32) {
          contour = await measureContour(buf, raw, mapped)
          const cal = await calibrateContour(raw, format, mapped)
          contourAlarm = cal
          if (!cal.usable) {
            warn(
              name,
              `the contour check stood down: this rung's clean control (q${cal.cleanQuality}) reads ${cal.clean} and its ` +
                `gross control (q${cal.grossQuality}) reads ${cal.gross}, a spread of ${(cal.gross - cal.clean).toFixed(2)} under the ` +
                `${BANDING_MIN_SPREAD} needed to tell them apart. Either this frame has no flat region big enough to band in, ` +
                `or the codec treats both controls alike here. Nothing is asserted about banding in this file — an alarm ` +
                `derived from that spread would be reading noise.`,
            )
          } else if (contour > cal.alarm) {
            warn(
              name,
              `the flattest patch of this rung reads ${contour} on the contour statistic, over the ${cal.alarm} alarm ` +
                `calibrated on THIS rung between q${cal.cleanQuality} (${cal.clean}, cannot band) and q${cal.grossQuality} (${cal.gross}, ` +
                `certainly does). It is ${Math.round((100 * (contour - cal.clean)) / (cal.gross - cal.clean))}% of the way to the broken ` +
                `end of its own scale, so this is not the check crying wolf on a dusk gradient — open the file and look at ` +
                `the flat regions. The honest fixes are a higher quality floor or a bigger byte budget, not a smaller patch.`,
            )
          }
        }
      }

      const record = await emit(name, buf, budget, {
        quality,
        contour,
        contourAlarm,
        orientation: o.key,
        format,
        ladderWidth: width,
      })
      files.push({
        name,
        publicPath: `${PUBLIC_PREFIX}/${name}`,
        format,
        width: record.width,
        height: record.height,
        bytes: record.bytes,
        quality,
      })
    }
  }

  const softName = `hero-soft-${o.key}.webp`
  const softRecord = await emit(softName, await buildSoft(frame), BUDGETS.soft, { orientation: o.key, format: 'webp' })

  /* Check the bound claimed on SOFT_RECIPE rather than asserting it: the soft
     layer's brightest patch must not exceed the sharp frame's, or the scrim
     sized above is not sufficient for whichever layer is on top. */
  const softRaw = await sharp(path.join(DEST, softName)).raw().toBuffer({ resolveWithObject: true })
  const softBox = Math.max(3, Math.round(softRaw.info.width / GLYPH_BOX_DIVISOR))
  const softAnalysis = analyseLuminance(softRaw.data, softRaw.info, softBox)
  if (softAnalysis.brightest.luma > analysis.brightest.luma + 1e-6) {
    warn(
      softName,
      `the baked soft layer's brightest patch (${round4(softAnalysis.brightest.luma)}) is BRIGHTER than the sharp ` +
        `frame's (${round4(analysis.brightest.luma)}), so the scrim sized against the sharp copy is not sufficient ` +
        `for it. That should be impossible at SOFT_RECIPE.brightness <= 1 — check that constant.`,
    )
  }

  /**
   * What the orientation PUBLISHES: the solve on the worst shipped rung, with
   * the pre-encode solve kept beside it so the codec's drift stays visible.
   * `shippedScrim` cannot be null here — the ladder always emits at least one
   * rung in each format — but if a future ladder could emit none, falling back
   * to the pre-encode number is the same claim this file made before, not a
   * silent hole.
   */
  const publishedScrim = shippedScrim
    ? {
        ...shippedScrim,
        measuredOn: shippedBoundFile,
        preEncode: {
          requiredAlpha: scrim.requiredAlpha,
          brightestPatchLuma: scrim.brightestPatchLuma,
          drift: round4(shippedScrim.requiredAlpha - scrim.requiredAlpha),
        },
      }
    : { ...scrim, measuredOn: null, preEncode: null }

  const byFormat = (fmt) =>
    files
      .filter((f) => f.format === fmt)
      .map((f) => `${f.publicPath} ${f.width}w`)
      .join(', ')

  const largestWebp = files.filter((f) => f.format === 'webp').at(-1)

  manifestOrientations[o.key] = {
    key: o.key,
    label: o.label.trim(),
    media: o.media,
    crop: {
      mode: rect.source,
      targetAspect: o.crop.window ? null : round4(o.crop.aspect),
      focusX: o.crop.focusX,
      focusY: o.crop.focusY,
      pixels: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      fractionOfSource: {
        left: round4(rect.left / SRC_W),
        top: round4(rect.top / SRC_H),
        right: round4((rect.left + rect.width) / SRC_W),
        bottom: round4((rect.top + rect.height) / SRC_H),
      },
    },
    nativeWidth: ladder.native,
    emittedWidths: ladder.widths,
    srcset: { avif: byFormat('avif'), webp: byFormat('webp') },
    sizes: '100vw',
    fallback: largestWebp ? largestWebp.publicPath : null,
    intrinsic: largestWebp ? { width: largestWebp.width, height: largestWebp.height } : null,
    files,
    soft: {
      name: softName,
      publicPath: `${PUBLIC_PREFIX}/${softName}`,
      width: softRecord.width,
      height: softRecord.height,
      bytes: softRecord.bytes,
      cssEquivalentFilter: `blur(${SOFT_RECIPE.sigma * 2}px) saturate(${SOFT_RECIPE.saturate}) brightness(${SOFT_RECIPE.brightness})`,
      maxLocalLuma: round4(softAnalysis.brightest.luma),
    },
    /* What the grade bought THIS crop, so the two halves of the mechanism can
       be read side by side rather than inferred from one number. */
    grade: {
      brightness: GRADE_BRIGHTNESS,
      ownSolvedBrightness: solve.brightness,
      binding: solve.brightness === GRADE_BRIGHTNESS,
      ungraded: {
        maxLocalLuma: round4(solve.ungradedPatchLuma),
        requiredAlpha: solve.ungradedAlpha,
      },
      graded: {
        maxLocalLuma: round4(analysis.brightest.luma),
        requiredAlpha: scrim.requiredAlpha,
      },
    },
    scrim: publishedScrim,
    /* See THE DEMAND PROFILE. `scrim.requiredAlpha` is one number — this is
       the distribution behind it, which is what says whether a veil is the
       right instrument at all. */
    demand,
  }
}

/* ── The proof sheet ──────────────────────────────────────────────────────── */

{
  const scale = Math.min(1, PROOF_WIDTH / SRC_W)
  const pw = Math.max(1, Math.round(SRC_W * scale))
  const ph = Math.max(1, Math.round(SRC_H * scale))
  const r = (key, stroke, dash) => {
    const g = geometry[key]
    const x = g.left * scale
    const y = g.top * scale
    const w = g.width * scale
    const h = g.height * scale
    return (
      `<rect x="${(x + 1.5).toFixed(2)}" y="${(y + 1.5).toFixed(2)}" ` +
      `width="${Math.max(1, w - 3).toFixed(2)}" height="${Math.max(1, h - 3).toFixed(2)}" ` +
      `fill="none" stroke="${stroke}" stroke-width="3"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
    )
  }
  /* Rectangles only — no text. Text would rasterise through whatever fonts the
     machine happens to have, which would make this file non-deterministic and
     break the byte-identity promise the README makes. The legend is in the
     README instead. */
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">` +
      r('l', PROOF_STROKE_LANDSCAPE, null) +
      r('p', PROOF_STROKE_PORTRAIT, '10 7') +
      `</svg>`,
  )
  const proof = await fromRaw(decoded)
    .resize(pw, ph, { fit: 'fill', kernel: 'lanczos3' })
    .composite([{ input: svg, top: 0, left: 0 }])
    .webp({ quality: PROOF_QUALITY, effort: WEBP_EFFORT })
    .toBuffer()
  await emit('hero-proof.webp', proof, BUDGETS.proof, { format: 'webp', orientation: null })
}

/**
 * Reads `--scrim-floor-min` out of the scrim stylesheet — the SAME literal form
 * `check-hero-contrast.mjs` parses, and for the same reason: the guarantee has
 * to be a number a script can see, so a `var()` there would make it invisible
 * to both of us. If the declaration is missing or not a literal percentage this
 * returns 0, which makes the clamp below a no-op and leaves the raw measurement
 * published — the contrast gate then fails loudly rather than this script
 * silently inventing a floor.
 */
function readScrimFloorMin() {
  const css = readFileSync(new URL('../components/site/hero-scrim.module.css', import.meta.url), 'utf8')
  const m = /--scrim-floor-min\s*:\s*([0-9.]+)%/.exec(css)
  return m ? parseFloat(m[1]) / 100 : 0
}

/* ── Manifest ─────────────────────────────────────────────────────────────── */

/**
 * NO TIMESTAMP, DELIBERATELY. A `generatedAt` field would make every run
 * produce different bytes and quietly destroy the determinism claim — which is
 * the whole reason a re-run is safe. The commit carries the date.
 */
/*
 * THE MANIFEST MUST DESCRIBE WHAT THE PAGE PAINTS, NOT WHAT THE SOLVER WANTED.
 *
 * `hero-scrim.module.css` clamps the relayed alpha up to `--scrim-floor-min`
 * (93%) — the floor it derived independently, and which is deliberately the
 * safe end of the clamp: the relay can only ever DARKEN the veil. So whenever a
 * master measures BELOW that floor, the CSS silently paints the floor instead,
 * and a manifest publishing the raw measurement describes a surface that does
 * not exist.
 *
 * This is not hypothetical: the first real master measured 0.926 / 0.916 and
 * `check-hero-contrast.mjs` failed on exactly this — "anyone reading the
 * manifest is reading a number the page does not use". Publishing the effective
 * value fixes the disagreement at its source rather than by loosening the gate.
 *
 * Read out of the CSS rather than retyped, for the same reason the component
 * reads it: a second copy of this number is a number that will disagree.
 * Raising the alpha is always contrast-SAFE — a darker veil can only increase
 * the ratios — so clamping up can never invalidate the measurement above.
 */
const scrimFloorMin = readScrimFloorMin()
const measuredAlpha = Math.max(
  manifestOrientations.p.scrim.requiredAlpha,
  manifestOrientations.l.scrim.requiredAlpha,
)
const heroAlpha = Math.max(measuredAlpha, scrimFloorMin)

/* The wash relay, per crop, against the alpha the page ACTUALLY paints in the
   text column — heroAlpha, i.e. after the CSS floor has had its say, not the
   raw measurement. Measured on the largest shipped WebP of each orientation:
   the boundary is a property of the photograph, and the rung that carries the
   most of it is the honest place to read it. */
for (const o of ORIENTATIONS) {
  const m = manifestOrientations[o.key]
  const decodedRung = await sharp(path.join(DEST, path.basename(m.fallback)))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  m.washRelay = {
    measuredOn: path.basename(m.fallback),
    ...washRelayFor(decodedRung.data, decodedRung.info, heroAlpha),
  }
}

/**
 * ⚠ THE CSS FLOOR CAN OVERRIDE THE GRADE, AND SILENTLY.
 *
 * `--scrim-floor-min` is a clamp FLOOR, so it can only ever DARKEN the veil —
 * which is why the manifest publishes the clamped value and why raising it can
 * never invalidate the contrast measurement. But a floor far ABOVE what this
 * master measures means the page is darkening a photograph twice: once here
 * and once in the stylesheet, with every gate still green, because darker
 * always passes.
 *
 * That failure is invisible from either side alone. It is only visible here,
 * where the measured requirement and the CSS floor are both in scope, so this
 * is where it gets said out loud.
 *
 * ⚠ AND THE OBVIOUS READING OF IT IS WRONG. "The floor is too high, grade the
 * master darker until it agrees" is exactly the reasoning that once shipped a
 * brightness of 0.222 and a hero nobody could see. Under a glyph the composite
 * ceiling is FIXED — a neutral sRGB 38.28, the most --fg-accent can sit over —
 * so at the minimum legal alpha the picture survives into
 * 18.28 * g_max / (g_max - 20) levels, which BARELY MOVES: 19.8 levels at
 * g_max 255, 22.9 at 99. Grading to a quarter brightness buys three levels
 * under the text and throws away a hundred and nineteen in the aperture.
 *
 * So this gap is not closed by darkening the master. It is closed by the
 * APERTURE — the text-free regions where the veil is allowed to be thin. See
 * components/site/hero-scrim.module.css: side jambs above the page measure,
 * and `--hero-headroom` below it.
 */
const FLOOR_GAP_WARN = 0.03
if (scrimFloorMin > measuredAlpha + FLOOR_GAP_WARN) {
  warn(
    'scrim/floor',
    `this master needs a veil at ${measuredAlpha.toFixed(3)}, but components/site/` +
      `hero-scrim.module.css sets --scrim-floor-min to ${(scrimFloorMin * 100).toFixed(1)}%. The clamp wins, ` +
      `so the page paints ${heroAlpha.toFixed(3)} and the photograph is darkened twice over. ` +
      `Every gate stays green because darker always passes; only this line can see it. The fix is to lower ` +
      `--scrim-floor-min toward ${measuredAlpha.toFixed(3)} — NOT to grade this master darker until it ` +
      `agrees, which costs the aperture ~40x what it wins under the text (see SHARP_TONE).`,
  )
}

const manifest = {
  present: true,
  generator: 'scripts/gen-hero-photo.mjs',
  source: {
    path: src.rel,
    bytes: src.bytes,
    sha256: sourceHash,
    /* Dimensions AFTER the EXIF orientation tag has been applied — i.e. the
       image as a human sees it, which is the frame the crops were solved
       against. A phone JPEG with orientation 6 is stored sideways, so these
       can legitimately differ from what an image viewer's file inspector
       reports for the same file. */
    width: SRC_W,
    height: SRC_H,
    aspect: round4(SRC_W / SRC_H),
    exifOrientation: probe.orientation ?? 1,
  },
  artDirectionBreakpointPx: ART_DIRECTION_BREAKPOINT,
  /* Same value under the shorter name the hero component reads. One writer,
     two keys, written in the same statement — they cannot drift. It exists so
     no consumer has to retype 861, because a breakpoint that lives in two
     places is a breakpoint that will disagree with its own crop. */
  breakpoint: ART_DIRECTION_BREAKPOINT,
  budgets: {
    smallestPortraitAvifBytes: BUDGETS.lcpAvif,
    portraitAvifBytes: BUDGETS.portraitAvif,
    landscapeAvifBytes: BUDGETS.landscapeAvif,
    webpBytes: BUDGETS.webp,
    softBytes: BUDGETS.soft,
  },
  /**
   * THE TONE BAKED INTO EVERY SHIPPED PIXEL.
   *
   * Published because the scrim alpha below is only half of what the page
   * paints, and reading it alone would make the hero look like a photograph
   * under a light veil rather than a GRADED photograph under a light veil.
   * `scrim.requiredAlpha` is only this low BECAUSE of these numbers; the two
   * fields are one mechanism and have to be read together.
   *
   * A consumer needs nothing from this block — the grade is already in the
   * bytes it fetches. It is here so the claim is auditable: re-run the
   * generator on the same master and these are the numbers you must get back.
   */
  grade: {
    op: 'sharp .modulate({ brightness, saturation })',
    brightness: GRADE_BRIGHTNESS,
    saturation: SHARP_TONE.saturation,
    warmth: SHARP_TONE.warmth,
    identity: GRADE_IS_IDENTITY,
    solvedAgainst: SHARP_TONE.brightness === null ? TARGET_SCRIM_ALPHA : null,
    pinned: SHARP_TONE.brightness !== null,
    appliedTo: 'the native crop, once, before every resample — the ladder and the baked soft copy both derive from the graded pixels',
    claim:
      'Brightness is a multiplier on CIE L*, bisected at build time until the scrim requirement measured on ' +
      'the graded, sharpened, shipped pixels lands at or under ' +
      (SHARP_TONE.brightness === null ? `${TARGET_SCRIM_ALPHA}` : 'the pinned value') +
      '. Darkening in L* holds chroma constant and so inflates colour; saturation pulls that back, measured ' +
      'over the brightest half of the composited frame (the pixels that carry visible colour) rather than ' +
      'the whole frame, whose near-black majority hides the cast. The scrim below is measured after this ' +
      'grade, never before it.',
  },
  scrim: {
    /* The whole-hero requirement: the larger of the two crops' demands, because
       one hero serves both and a flat scrim cannot know which crop it is over. */
    requiredAlpha: heroAlpha,
    base: heroAlpha,
    exit: Math.min(1, Math.round((heroAlpha + SCRIM_EXIT_DELTA) * 1000) / 1000),
    scrimColor: SCRIM_COLOR,
    targetRatio: SCRIM_TARGET_RATIO,
    bindingForeground: INK_FOREGROUNDS.at(-1).token,
    claim:
      `Minimum opacity of a solid ${SCRIM_COLOR} scrim at which every glyph-sized patch of the photograph ` +
      `still clears ${SCRIM_TARGET_RATIO}:1 against the weakest ink foreground the hero actually paints ` +
      `(${INK_FOREGROUNDS.at(-1).token} ${INK_FOREGROUNDS.at(-1).hex}, ` +
      `${INK_FOREGROUNDS.at(-1).flatRatio}:1 on flat ink). Measured by DECODING EVERY EMITTED RUNG and ` +
      'taking the worst, so it is a claim about the bytes a browser downloads rather than about the raw ' +
      'frame that went into the encoder; per orientation, `orientations[k].scrim.preEncode.drift` records ' +
      'how far the codec moved it. Not a per-pixel guarantee — see the generator header.',
  },
  /*
    ── WHAT THE BROWSER THROWS AWAY, RECORDED ──────────────────────────────

    For every reference viewport: the band box, which crop the <picture>
    serves there, and what `object-fit: cover` discards of it. This pipeline
    used to publish the aspect of each crop and nothing about the box those
    crops land in, so "the desktop crop is 16:9" was the whole story and
    "which means the browser drops 45% of its width at 1280" was not
    computable from anything in the manifest.

    RECORDED, NOT GATED. A crop that loses width to `cover` is a framing
    decision, and the right place to judge it is `hero-proof.webp` plus the
    `--evaluate-crops` table. What this block prevents is the decision being
    invisible: scripts/verify-hero-assets.mjs reads it back, and a shape that
    starts throwing away most of the frame now shows up in a diff.

    The band boxes come from scripts/check-hero-contrast.mjs's TEXT_EXTENT,
    which the browser gate re-measures — so this is the box that ships.
  */
  coverage: bandBoxes().map((b) => {
    const o = manifestOrientations[b.orientation]
    const crop = o?.crop?.pixels ?? null
    return {
      viewport: b.w,
      band: { w: b.w, h: b.bandH, aspect: round4(b.w / b.bandH) },
      orientation: b.orientation,
      ...(crop
        ? coverLoss(crop.width, crop.height, b.w, b.bandH)
        : { note: 'orientation not emitted' }),
    }
  }),
  droppedWidths: allDropped,
  orientations: manifestOrientations,
  proof: { publicPath: `${PUBLIC_PREFIX}/hero-proof.webp` },
  warnings: warnings.map((w) => ({ scope: w.scope, why: w.why })),
}

await writeFile(path.join(DEST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

/* ── Sweep ────────────────────────────────────────────────────────────────── */

/**
 * A re-tune that drops a width must not leave the old file behind for a
 * `<picture>` tag to keep pointing at. Only this script's own naming is swept —
 * README.md, .gitkeep and anything a human added are left alone.
 */
async function sweep(written) {
  const OWNED = /^hero-(?:[pl]-\d+\.(?:avif|webp)|soft-[pl]\.webp|proof\.webp)$/
  for (const name of await readdir(DEST)) {
    if (!OWNED.test(name)) continue
    if (written.has(name)) continue
    await unlink(path.join(DEST, name))
    console.log(`  swept  ${name}  (no longer emitted)`)
  }
}

await sweep(new Set(results.map((r) => r.name)))

/* ── Report ───────────────────────────────────────────────────────────────── */

console.log('')
console.log(`  Hero photograph — ${SRC_W}x${SRC_H} source (${src.rel}), ${results.length} files`)
console.log('  ────────────────────────────────────────────────────────────────────────────────')
console.log('  file                  dimensions      bytes   budget      q   contour (clean..gross, alarm)')
for (const r of results) {
  /* The contour reading is meaningless without the two controls it is judged
     against — that was the whole defect in the statistic it replaced — so the
     scale is printed beside every number rather than in a footnote. */
  const cal = r.contourAlarm
  const n = (v) => v.toFixed(2)
  const delta =
    r.contour === null || r.contour === undefined
      ? '—'
      : cal && cal.usable
        ? `${n(r.contour)}  (${n(cal.clean)}..${n(cal.gross)}, alarm ${n(cal.alarm)})`
        : cal
          ? `${n(r.contour)}  (controls ${n(cal.clean)}..${n(cal.gross)} — too close to judge)`
          : n(r.contour)
  console.log(
    `  ${r.name.padEnd(20)} ${`${r.width}x${r.height}`.padEnd(13)} ` +
      `${`${(r.bytes / 1024).toFixed(1)}KB`.padStart(9)} ${`${(r.budget / 1024).toFixed(0)}KB`.padStart(7)}  ` +
      `${String(r.quality ?? '—').padStart(3)}   ${delta}`,
  )
}
const total = results.reduce((n, r) => n + r.bytes, 0)
console.log('  ────────────────────────────────────────────────────────────────────────────────')
console.log(`  ${'total'.padEnd(20)} ${''.padEnd(13)} ${`${(total / 1024).toFixed(1)}KB`.padStart(9)}`)

console.log('')
console.log('  LADDER')
for (const o of ORIENTATIONS) {
  const m = manifestOrientations[o.key]
  console.log(
    `    ${o.label}  crop ${m.crop.pixels.width}x${m.crop.pixels.height} ` +
      `at (${m.crop.pixels.left},${m.crop.pixels.top}) — rungs ${m.emittedWidths.join(', ')}`,
  )
}
if (allDropped.length === 0) {
  console.log('    no candidate rungs were dropped')
} else {
  for (const d of allDropped) console.log(`    DROPPED  ${d.orientation}-${d.width}  ${d.why}`)
}

console.log('')
console.log('  GRADE — the tone baked into the photograph, and the solve behind it')
console.log('  ────────────────────────────────────────────────────────────────────────────────')
{
  const ceiling = maxGradedPatchLuma(TARGET_SCRIM_ALPHA)
  console.log(
    `    target scrim alpha ${TARGET_SCRIM_ALPHA}  =>  a glyph-sized patch of the GRADED frame may reach at most`,
  )
  console.log(
    `    L=${ceiling.luma.toFixed(4)} (neutral sRGB ${ceiling.neutralValue.toFixed(1)}/255), so that under an ink veil at ` +
      `${TARGET_SCRIM_ALPHA}`,
  )
  console.log(
    `    the backdrop lands at or under L=${ceiling.limit.toFixed(6)} — where ${INK_FOREGROUNDS.at(-1).token} still clears ` +
      `${SCRIM_TARGET_RATIO}:1 x${SCRIM_ENGINEERING_MARGIN}.`,
  )
  console.log('')
  for (const { o, solve } of plans) {
    const tag = solve.brightness === GRADE_BRIGHTNESS ? 'BINDING' : 'headroom'
    console.log(
      `    ${o.label}  own solve ${solve.brightness.toFixed(3)}  [${tag}]` +
        (solve.solved ? '' : solve.pinned ? '  (pinned, not solved)' : '  (already under target ungraded)'),
    )
    console.log(
      `        ungraded  brightest patch L=${solve.ungradedPatchLuma.toFixed(4)}  ->  needs alpha ${solve.ungradedAlpha.toFixed(3)}`,
    )
    console.log(
      `        graded    brightest patch L=${manifestOrientations[o.key].grade.graded.maxLocalLuma.toFixed(4)}  ->  ` +
        `needs alpha ${solve.achieved.toFixed(3)}`,
    )
  }
  console.log('')
  console.log(
    `    SHIPPED GRADE: .modulate({ brightness: ${GRADE_BRIGHTNESS}, saturation: ${SHARP_TONE.saturation} })` +
      `${SHARP_TONE.warmth !== 0 ? ` then warmth ${SHARP_TONE.warmth}` : ''}`,
  )
  console.log(
    `    Applied ONCE to each native crop before any resample. The ladder and the baked soft copy both`,
  )
  console.log(`    derive from those pixels, so every rung and both scroll states carry the same tone.`)
}

console.log('')
console.log('  SCRIM — what makes the hero\'s published contrast ratios true again')
console.log('  ────────────────────────────────────────────────────────────────────────────────')
for (const o of ORIENTATIONS) {
  const s = manifestOrientations[o.key].scrim
  console.log(
    `    ${o.label}  alpha ${s.requiredAlpha.toFixed(3)}  ` +
      `(brightest ${s.glyphBoxPx}px patch L=${s.brightestPatchLuma.toFixed(4)}, binding ${s.bindingForeground})`,
  )
  if (s.preEncode) {
    const d = s.preEncode.drift
    console.log(
      `        measured on ${s.measuredOn} — the worst of the ${manifestOrientations[o.key].files.length} rungs this ` +
        `crop emits. Pre-encode it read ${s.preEncode.requiredAlpha.toFixed(3)}, so the codec moved the ` +
        `requirement by ${d >= 0 ? '+' : ''}${d.toFixed(3)}.`,
    )
  }
  console.log(
    `        per-pixel max L=${s.diagnostics.maxPixelLuma.toFixed(4)} (would demand alpha ` +
      `${s.diagnostics.alphaIfGatedOnMaxPixel.toFixed(3)}), p99.9 L=${s.diagnostics.p999PixelLuma.toFixed(4)} ` +
      `— diagnostics, NOT the gate (see the header)`,
  )
  for (const a of s.achieved) {
    console.log(
      `        ${a.token.padEnd(11)} ${a.hex}  ${String(a.flatInkRatio).padStart(5)}:1 flat ink  →  ` +
        `${String(a.ratioOverBrightestPatch).padStart(5)}:1 over the brightest patch`,
    )
  }
}
console.log('')
console.log(`    HERO REQUIREMENT: solid ${SCRIM_COLOR} at alpha ${manifest.scrim.requiredAlpha.toFixed(3)} or darker.`)
console.log('    The consumer must read this from manifest.json, not retype it.')

console.log('')
console.log('  DEMAND PROFILE — how much of the text region actually needs the veil')
console.log('  ────────────────────────────────────────────────────────────────────────────────')
console.log('    Required alpha per glyph-sized patch, sampled INSIDE the text extent, in the band')
console.log('    box’s own CSS pixels, at object-position 50%. The flat scrim above is this')
console.log('    distribution’s MAXIMUM; these columns are what paying it everywhere costs.')
console.log('')
for (const key of Object.keys(manifestOrientations)) {
  const o = manifestOrientations[key]
  console.log(`    ${o.label}`)
  console.log('      viewport      box   p50    p75    p90    p99   p99.9    max  | needs 0  >0.60  >0.80')
  console.log('      ' + '─'.repeat(84))
  for (const vp of o.demand.viewports) {
    const d = vp.atDefault
    console.log(
      `      ${vp.viewport.padEnd(13)}${String(vp.glyphBoxPx).padStart(3)}  ` +
        `${d.p50.toFixed(3)}  ${d.p75.toFixed(3)}  ${d.p90.toFixed(3)}  ${d.p99.toFixed(3)}  ` +
        `${d.p999.toFixed(3)}  ${d.max.toFixed(3)} | ${pctOf1(d.shareNeedingNothing).padStart(6)} ` +
        `${pctOf1(d.shareOver60).padStart(6)} ${pctOf1(d.shareOver80).padStart(6)}`,
    )
  }
  console.log('')
}
console.log('    READ THIS BEFORE REACHING FOR A DARKER SCRIM. A flat veil is priced by the max and')
console.log('    paid for over the whole band; the p50 column says most of that payment buys nothing.')
console.log('    A treatment whose cost follows the INK — a per-glyph halo, a paint-order stroke —')
console.log('    pays the same max over a few hundred px per glyph instead of over the whole band.')
console.log('')
console.log('  OBJECT-POSITION — the one framing dial `cover` leaves free, and what it trades')
console.log('  ────────────────────────────────────────────────────────────────────────────────')
console.log('    At every reference viewport cover lands the crop’s HEIGHT exactly on the band and')
console.log('    overflows on WIDTH, so vertical framing is already determined and X is free. This')
console.log('    is a TRADE and the columns show it: left lowers the demand and darkens the picture,')
console.log('    right does the reverse, and the MAX barely moves. The generator does not pick —')
console.log('    object-position lives in the stylesheet.')
console.log('')
for (const key of Object.keys(manifestOrientations)) {
  const o = manifestOrientations[key]
  const vp = o.demand.viewports.reduce((a, b) => (b.width > a.width ? b : a))
  console.log(`    ${o.label} at ${vp.viewport}  (${vp.slack.x}px of horizontal slack, ${vp.slack.y}px vertical)`)
  console.log('      object-position X     p90    p99    max  | share >0.60 | aperture p99')
  console.log('      ' + '─'.repeat(72))
  for (const p of vp.positions) {
    const mark = p.objectPositionX === 0.5 ? '   ← cover default' : ''
    console.log(
      `           ${String(Math.round(p.objectPositionX * 100) + '%').padStart(4)}          ` +
        `${p.p90.toFixed(3)}  ${p.p99.toFixed(3)}  ${p.max.toFixed(3)} |    ${pctOf1(p.shareOver60).padStart(6)}   |   ` +
        `${p.apertureP99.toFixed(4)}${mark}`,
    )
  }
  console.log('')
}

console.log('')
console.log('  WASH RELAY — what a veil EDGE costs on this photograph, and where')
console.log('  ────────────────────────────────────────────────────────────────────────────────')
console.log(
  `    p95 of the CIE L* step from the text column (alpha ${heroAlpha.toFixed(4)}) out to each gutter alpha,`,
)
console.log(
  `    along ${WASH_COLUMNS} columns (a vertical edge) and ${WASH_ROWS} rows (a horizontal one). ` +
    `Span at one JND = ${WASH_JND_SPAN} x dL*.`,
)
for (const o of ORIENTATIONS) {
  const r = manifestOrientations[o.key].washRelay
  console.log('')
  console.log(`    ${o.label}  ${r.measuredOn}`)
  const header = '      gutter α  ' + r.stepP95ByColumn['0.25'].map((_, i) => String(i).padStart(4)).join('')
  console.log(`${header}   | vertical boundary at crop column i`)
  for (const a of WASH_GUTTER_ALPHAS) {
    const k = a.toFixed(2)
    console.log(`        ${k}    ` + r.stepP95ByColumn[k].map((v) => v.toFixed(0).padStart(4)).join(''))
  }
  console.log(`${header.replace('gutter α', '        ')}   | horizontal boundary at crop row j`)
  for (const a of WASH_GUTTER_ALPHAS) {
    const k = a.toFixed(2)
    console.log(`        ${k}    ` + r.stepP95ByRow[k].map((v) => v.toFixed(0).padStart(4)).join(''))
  }
  console.log('      worst / span at one JND:')
  console.log(
    '        ' +
      WASH_GUTTER_ALPHAS.map((a) => {
        const k = a.toFixed(2)
        return `α${k} → ${r.worstStepP95[k].toFixed(1)} dL*, ${r.spanAtOneJndPx[k]}px`
      }).join('   '),
  )
}
console.log('')
console.log('    The horizontal gutter is 96px at 1280, 256px at 1600 and ZERO at every width <= 1088, so a')
console.log('    span above those is an edge the eye can find — and below the breakpoint the only edge a')
console.log('    phone can show is the horizontal one, which is why both axes are here. See THE WASH RELAY')
console.log('    in this file for why no framing of this master shrinks these numbers.')

console.log('')
console.log(
  `  soft recipe: blur σ${SOFT_RECIPE.sigma} (CSS ${SOFT_RECIPE.sigma * 2}px), saturate ${SOFT_RECIPE.saturate}, ` +
    `brightness ${SOFT_RECIPE.brightness} — a baked bitmap, never an animated filter`,
)
console.log(
  `  sharp tone: ${
    GRADE_IS_IDENTITY
      ? 'IDENTITY (no colour op in the pipeline — output is byte-identical to the ungraded build)'
      : `brightness ${GRADE_BRIGHTNESS} on CIE L*, saturation ${SHARP_TONE.saturation}, warmth ${SHARP_TONE.warmth}` +
        ` — materialised before every resample, not left to sharp's pipeline order`
  }`,
)
console.log(`  proof sheet: hero-proof.webp — crimson solid = landscape crop, pale dashed = portrait crop`)
console.log('')

if (warnings.length > 0) {
  console.warn(`  ⚠ ${warnings.length} warning${warnings.length === 1 ? '' : 's'}:\n`)
  for (const { scope, why } of warnings) console.warn(`    ${scope}\n      ${why}\n`)
}

if (failures.length > 0) {
  console.error(`  ✗ ${failures.length} file${failures.length === 1 ? '' : 's'} did not meet the gates:\n`)
  for (const { file, why } of failures) console.error(`    ${file}\n      ${why}\n`)
  process.exitCode = 1
}
