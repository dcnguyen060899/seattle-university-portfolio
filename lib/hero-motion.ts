/**
 * lib/hero-motion.ts — the hero's "living background": constants, the config
 * shape, its validator, and the layer's stylesheet, in a dependency-free
 * module. PLAIN DATA, like lib/intro.ts: no `server-only`, no `node:fs`, no
 * DOM access at module scope. Imported by the server (components/site/hero.tsx
 * validates the manifest through `parseHeroMotion`), by the client controller
 * (components/site/hero-motion.tsx), and by the e2e spec.
 *
 * ── WHAT THIS IS, IN ONE PARAGRAPH ─────────────────────────────────────────
 *
 * A short, seamlessly looping clip — sky drifting, leaves in a breeze, the
 * fountain falling — registered pixel-for-pixel over the STILL photograph the
 * hero already paints, faded in only after the reader has started reading,
 * desktop only, and capped at an opacity a Chromium test solved so the
 * contrast numbers the repo publishes for the still stay true under it. The
 * still is never touched: with the flag below off, or with no clip on disk,
 * the page is byte-for-byte the still hero.
 *
 * ── THE SWITCH: ON BY DEFAULT SINCE 2026-09-06, `off` IS THE KILL SWITCH ───
 *
 * `HERO_MOTION_ENABLED` is inlined at build from NEXT_PUBLIC_HERO_MOTION.
 * Unset — the default — it is TRUE: the owner approved the disclosure line and
 * said "turn it on" on 2026-09-06 (src:hero-motion-disclosure-2026-09-06), the
 * record is verified and the clip that passed the harness is installed, so a
 * build of main animates. `off` is the one-word deploy-side kill switch: the
 * page is then byte-for-byte the still hero. `preview` exists for the NEXT
 * clip — it runs the layer on localhost with a record still open
 * (HERO_MOTION_PREVIEW, below; components/site/hero.tsx refuses a preview on
 * the deploy host). Nothing in the gate below is relaxed by any value of it:
 * the layer still refuses phones, coarse pointers, reduced motion, Save-Data,
 * plain automation and anything before the intro has left, the page has
 * settled and the LCP watch has gone quiet, and hero.tsx still hands it
 * nothing unless the corpus record may render. The first two Runway
 * candidates failed the harness; the third — Seedance 2, from the still padded
 * to the model's 4:3 so its crop fell on padding — passed it and is installed.
 * Read scripts/check-hero-motion.mjs's header before touching this.
 *
 * Under automation the flag is bypassed ONLY by `navigator.webdriver === true`
 * plus the force key in sessionStorage — the same shape as lib/intro.ts's
 * INTRO_FORCE_KEY, and for the same reason: every existing Playwright run must
 * stay byte-identical to a page with no motion whatever the constant's value
 * (it was false on every build until 2026-09-06, and an `off` build still is),
 * and the feature must stay testable under either.
 *
 * ── LCP: WHY IT STARTS ON ITS OWN, AND THE MEASUREMENT THAT ALLOWS IT ───────
 *
 * Chrome ≥116 counts a <video>'s first PRESENTED frame as a largest-
 * contentful-paint candidate, and the clip paints far more of the viewport
 * than the hero's lede, which is this page's LCP element. Until 2026-09-07 the
 * gate therefore waited for the first scroll, pointerdown or keydown, because
 * Chrome stops updating LCP at the first input. The owner asked for the motion
 * to start on its own. It now does, and the reason it costs nothing is
 * geometry, not timing — every clause below was measured on the production
 * build (headless Chromium 151, :3100, 1440x900 dpr 2 and 1600x900, on a fast
 * link and on 1.6 Mbit/s + 150 ms RTT, `navigator.webdriver` spoofed false):
 *
 *   · A PAINT THAT COVERS THE WHOLE VIEWPORT IS NOT AN LCP CANDIDATE AT ALL.
 *     The same late mount over a box that leaves a 1 px strip of still above it
 *     is recorded at 4068 ms and takes the metric with it; over a box that
 *     covers every pixel of the viewport, nothing is recorded. One pixel is
 *     the whole difference (1 px strip → candidate; 0 px → not).
 *   · THE INSTALLED CLIP IS REGISTERED TO THE WHOLE STILL (crop 0,0,1,1), so
 *     the `cover` arithmetic in HERO_MOTION_STYLE puts its box over every pixel
 *     of the layer's root, which is `inset: 0` in `.bg`. Measured at fourteen
 *     desktop window shapes from 1280x800 to 3440x1440, the clip's painted rect
 *     covers the viewport at every one and NO <video> entry is recorded at any.
 *     Final LCP with the layer auto-starting matches the still-only build to
 *     within the harness's own noise. Still-only → auto-start, at 1440x900
 *     dpr 2: first visit 3220 → 3196 ms, repeat visit 896 → 908, and on
 *     1.6 Mbit/s 4512 → 4496 and 4452 → 4460. At 1600x900: 3200 → 3212,
 *     888 → 900, 4492 → 4508 and 4452 → 4496. Every delta is ≤ 44 ms against a
 *     run-to-run spread of up to 40 ms on the SAME build, the LCP element is
 *     the hero's lede in every one of those runs, and CLS is unchanged (0 on
 *     the fast link, 0.000013 and 0.0056 throttled — the still-only build's own
 *     values). The clip is still fetched exactly once per page life.
 *   · AND THE SILENCE IS AN EXCLUSION, NOT A FINISHED METRIC. In the same run,
 *     with nothing scrolled or clicked, a 900x600 <img> injected AFTER the clip
 *     had faded all the way in is recorded at 9044 ms — six times the lede's
 *     area, and the observer took it. So LCP was live the whole time the clip
 *     was mounting, playing and fading, and it simply refused the clip.
 *     tests/e2e/hero-motion.spec.ts injects that control on every run, so this
 *     test can never pass by talking to a finished observer.
 *   · OPACITY 0 PROTECTS NOTHING. This header used to claim Chrome "records an
 *     element the moment its opacity leaves zero". Measured: a clip that
 *     presents its first frame inside an opacity-0 subtree and never fades in
 *     at all is still recorded, at that frame's own time. The fade is a look,
 *     not a shield.
 *   · A POSTER IS NOT A PAINT. The route of mounting early carrying the hero's
 *     own image as the poster, so the video's LCP paint coincides with the
 *     still's, does not work in this engine: a <video> with `preload="none"`
 *     and a visibly painted poster (screenshot taken) produces no LCP entry at
 *     all, and while it is up the blurred rung replaces the sharp still.
 *
 * So the gate's last step is a race. EITHER the first input — kept, as an
 * ACCELERATOR: a reader who scrolls should get the motion sooner, never later
 * — OR the auto-start: the LCP observer quiet for MOTION_LCP_QUIET_MS AND the
 * clip's box provably covering the viewport, measured at runtime against the
 * sharp <img>'s own box. A future clip registered to a SUB-RECTANGLE of the
 * still fails that check and the layer waits for the first input exactly as it
 * did before, which is why the old rule is still here rather than deleted.
 *
 * ── THE ENTRANCE: ONE MOVE, BECAUSE THE INTRO'S RESOLVE IS THE ENTRANCE ─────
 *
 * The owner watched the shipping build and said the page appears and then,
 * seconds later, something starts. He was right, and the timeline said so
 * (production build, :3100, headless Chromium 151, webdriver spoofed false,
 * 1440x900 dpr 2, fast link, first visit): html[data-intro] cleared at 3686 ms,
 * the layer mounted at 5206, the first frame presented at 5252, the fade began
 * at 5269 and ended at 8269. THREE staged reveals where a reader expects one,
 * and the last of them three seconds long over a picture that barely moves.
 *
 * The fix is ordering, not speed. During the intro the hero is held at
 * `--focus` INTRO_FOCUS_HOLD: the sharp copy contributes 22 % and a baked blur
 * carries the rest, under the overlay's own veil. MEASURED on rendered pixels
 * (1440x900, the live page, the layer's opacity transition neutralised so each
 * shot is an endpoint) the step the reader would see when the clip replaces the
 * still is:
 *
 *   | --focus | mean |Δ| sRGB | p95 | p99 |  max | under the copy |
 *   |---------|---------------|-----|-----|------|----------------|
 *   | 0.00    |     3.34      |11.7 |21.3 | 41.3 |     2.36       |
 *   | 0.50    |     2.55      | 7.7 |13.3 | 26.3 |     1.93       |
 *   | 0.78    |   **1.62**    | 4.7 | 7.7 | 15.0 |     1.21       |
 *
 * At the intro's hold the whole difference between the still and the clip is
 * 1.62 sRGB levels of mean — under a JND for a large-area step, and that is
 * BEFORE the overlay's veil, which can only shrink it. So a clip that arrives
 * while the intro is still up arrives invisibly, and the `--focus` ramp then
 * resolves the reader onto a picture that is ALREADY MOVING. The arrival stops
 * being an event of its own; the intro's own resolve is the entrance.
 *
 * Hence the gate's door is now a race of two (components/site/hero-motion.tsx):
 *
 *   EARLY — the intro is really running (html[data-intro] has advanced past
 *     `pending`, so the overlay mounted rather than yielding), the sharp <img>
 *     is ALREADY decoded (not awaited: the hero's own bytes must be in before
 *     the clip's go on the wire), and the clip's box covers the viewport. Then
 *     the layer mounts behind the overlay. No `load`, no MOTION_SETTLE_MS, no
 *     idle callback and no quiet window — every one of those is a wait for the
 *     page to finish arriving, and the intro playing at all is the evidence
 *     that it has.
 *   LATE — everything else, unchanged: `load`, the intro gone, the settle and
 *     the idle callback, then the quiet window and the coverage test, or the
 *     first input. A page whose intro yielded (slow hydration —
 *     INTRO_LATE_MOUNT_MS) or never ran (a repeat visit) takes this door, and a
 *     slow link takes it BECAUSE the intro yields there: the early door is
 *     self-calibrating, and needs no bandwidth guess.
 *
 * AND THE LCP HAZARD INVERTS WHEN THE MOUNT MOVES EARLIER. The measurement
 * above this one is about a LATE mount: a clip presenting at 4068 ms, after the
 * lede has painted at 3248, replaces the metric with its own later time. A clip
 * that presents BEFORE the current largest paint cannot do that — a candidate
 * at 2.8 s can only lower LCP, never raise it. The coverage test is kept on the
 * early door anyway, so the shipping clip produces no <video> entry at all and
 * the hero's lede stays the LCP element; but it is kept as a contract rather
 * than as protection, and a false positive from the intro's own 1.11x scale
 * (hero.module.css scales `.bg` by 1 + 0.14·--focus, so the box measured behind
 * the overlay is a superset of the box at rest) is harmless for that reason.
 * MEASURED after the change, same harness — see MOTION_FADE_BEHIND_MS.
 *
 * ── WHY THE STYLESHEET IS A STRING AND NOT A CSS MODULE ─────────────────────
 *
 * The one hard requirement on this feature wherever it is off — an `off`
 * build, and every visitor the gate refuses, which is every phone: the DOM and
 * the CSS the page ships must be BYTE-IDENTICAL to a tree without it. A CSS
 * module imported by the controller would be collected into the route's CSS
 * chunks at build time whether or not the component ever renders — Turbopack
 * collects stylesheets from the module graph, not from render output — so
 * the rules below live in this string and are emitted as a <style> element
 * INSIDE the layer's own markup, which exists only after the gate passes.
 * Nothing ships for a feature that is off, and nothing reaches a reader it is
 * off for. No colour is named in it
 * (scripts/check-ground-tokens.mjs would object, and rightly): the feather
 * mask reads `var(--ground)` for its opaque stop because a mask is read for
 * alpha only, exactly as hero-scrim.module.css argues for its own mask.
 */

import { INTRO_FOCUS_HOLD, INTRO_FOCUS_MS } from './intro';

/* ── The flag ──────────────────────────────────────────────────────────── */

/**
 * THE build-time switch, from NEXT_PUBLIC_HERO_MOTION: unset or `on` → on;
 * `off` → the still hero, byte-for-byte; `preview` → on, localhost only, with
 * the corpus record allowed to be pending. Any other value is a typo and is
 * treated as `off`, because a misspelled kill switch must still kill.
 */
const MOTION_ENV = process.env.NEXT_PUBLIC_HERO_MOTION ?? '';
export const HERO_MOTION_ENABLED = MOTION_ENV === '' || MOTION_ENV === 'on' || MOTION_ENV === 'preview';
/**
 * `preview`: the layer is on AND the server may hand it an installed clip whose
 * corpus record is still pending-owner — for looking at a candidate on
 * localhost before answering the record. components/site/hero.tsx throws at
 * build if this is set on the deploy host (process.env.VERCEL), so a preview
 * can never be the thing that ships.
 */
export const HERO_MOTION_PREVIEW = MOTION_ENV === 'preview';
/**
 * The one combination components/site/hero.tsx refuses at build: a preview on
 * the deploy host. Read here, in the module that owns the switch, because this
 * is the file eslint exempts for `process.env`; on the client `process.env.VERCEL`
 * is not inlined and this is simply false, which is right — the refusal is the
 * server's, at build.
 */
export const HERO_MOTION_PREVIEW_ON_DEPLOY_HOST =
  HERO_MOTION_PREVIEW && typeof process !== 'undefined' && Boolean(process.env.VERCEL);

/* ── Identity ──────────────────────────────────────────────────────────── */

/**
 * sessionStorage. The automation opt-in: under `navigator.webdriver` the layer
 * is inert unless this is '1'. It relaxes exactly two conditions — the
 * webdriver refusal and the build-time flag — and nothing else: the media
 * query, the connection, the intro, the settle and the first-input wait are
 * all still enforced, so a spec exercises the real gate.
 */
export const MOTION_FORCE_KEY = 'duyng.motion.force';

/** sessionStorage. The owner's A/B switch: '1' keeps the still, for comparing by eye. */
export const MOTION_OFF_KEY = 'duyng.motion.off';

/**
 * sessionStorage. A JSON `HeroMotion` that STANDS IN FOR the manifest, read
 * ONLY under `navigator.webdriver` AND the force key. It exists so the
 * controller can be tested against a candidate clip served from memory
 * without any clip in the repository — the repo held no clip until one
 * passed (the Seedance 2 transcode, installed 2026-09-06), and the next
 * candidate is tried the same way. A real browser never reports webdriver,
 * and sessionStorage is same-origin, so this is unreachable without already
 * running script on the page. Validated through `parseHeroMotion` like the
 * manifest.
 *
 * It REPLACES an installed config rather than only filling in for a missing
 * one (changed 2026-09-07, when `loop` arrived). A spec has to be able to
 * describe a registration the installed manifest does not carry — a one-shot
 * clip, a cropped one — and there is no other way in: the two keys it needs
 * are already the two the layer refuses automation without, so nothing new is
 * reachable. tests/e2e/hero-motion.spec.ts keeps one test that arms with the
 * force key and NO override, so "the server hands the client a config at all"
 * stays covered.
 */
export const MOTION_OVERRIDE_KEY = 'duyng.motion.override';

/* ── The gate's conditions ─────────────────────────────────────────────── */

/**
 * Desktop, a real pointer, and no motion preference. All three are refusals
 * the phone fails independently, on top of the SSR emitting no markup and the
 * phone e2e running under webdriver — see hero-motion.tsx for the rest.
 */
export const MOTION_MEDIA =
  '(min-width: 1280px) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

/** Effective connection types on which the clip is never fetched. */
export const MOTION_SLOW_CONNECTIONS: readonly string[] = ['slow-2g', '2g'];

/**
 * THE ACCELERATOR, AND THE FALLBACK. Chrome finalises LCP at the first of
 * these, so a layer that mounts after one cannot be the LCP element whatever
 * its geometry. That makes it two things at once: the way an impatient reader
 * starts the motion sooner than the auto-start's quiet window would, and the
 * only way it starts at all for a clip whose box does NOT cover the viewport
 * (a cropped registration, or a page restored mid-scroll). It was the whole
 * rule until 2026-09-07; see the header for what replaced it and why.
 *
 * ⚠ A PROGRAMMATIC scroll — a fragment jump, scroll restoration, any
 * `scrollTo` — fires the same event a reader's scroll does, and the DOM cannot
 * tell them apart. On this page that was measured to finalise LCP as well (the
 * control <img> above stops being recorded after a scripted `scrollTo`), but on
 * a synthetic page it did not, so nothing here rests on it: the coverage test
 * is what carries the guarantee, and a page that has scrolled at all fails it.
 * This listener has been here since the feature shipped; the auto-start neither
 * widens nor narrows it.
 */
export const MOTION_FIRST_INPUT_EVENTS: readonly string[] = ['scroll', 'pointerdown', 'keydown'];

/**
 * THE AUTO-START'S QUIET WINDOW: no new largest-contentful-paint entry for
 * this long before the clip is allowed to load.
 *
 * It is NOT what protects the metric — the coverage test in the controller is
 * (see the header) — it is what keeps 5.5 MB of clip off the wire while the
 * page is still landing big paints. The controller starts the watch when the
 * gate starts, so the window runs CONCURRENTLY with MOTION_SETTLE_MS and costs
 * nothing in the measured cases: the last entry lands at 3.2 s on a first
 * visit against a settle that ends at 5.1 s.
 *
 * 1200 ms because the window has to be longer than the gaps INSIDE a burst of
 * entries or it would call the middle of one "quiet": measured, the widest gap
 * between two entries of one load was 812 ms (1.6 Mbit/s, first visit — the h1
 * at 3700 ms, then the lede at 4512 ms). Anything under ~900 ms would fire in
 * that hole; much more than this and the reader waits for nothing.
 */
export const MOTION_LCP_QUIET_MS = 1200;

/* ── Timeline ──────────────────────────────────────────────────────────── */

/**
 * The whole layer's fade-in OVER THE SHARP PICTURE, wall-clock, linear. ≥ 1500
 * by requirement (asserted below): frame 0 of any clip differs from the still
 * by a few sRGB levels (the model re-renders it), and a slow linear dissolve is
 * what turns that difference into something the eye cannot catch as a pop.
 */
/* 3000, from 1800: the installed clip is a diffusion RE-RENDER of the still —
   frame 0 sits 17 sRGB levels from it, same composition, fine detail redrawn —
   so the fade-in is a morph between two drawings of one scene, and a slower one
   reads as the picture waking rather than changing. The harness reads this
   number from here and judges it as a per-frame step.

   IT STAYS 3000, and the entrance work of 2026-09-07 is the reason it can:
   this is now the LATE door's fade, performed over a picture that is already
   sharp and settled, where the step is 3.34 sRGB levels of mean and 21.3 of
   p99 (measured on rendered pixels — the header's table). That is the case
   that needs three seconds. The early door does not, and does not take them;
   see MOTION_FADE_BEHIND_MS. */
export const MOTION_FADE_IN_MS = 3000;

/**
 * The fade-in BEHIND THE INTRO — used only when the clip's first frame
 * presents while the hero is still held soft at INTRO_FOCUS_HOLD.
 *
 * Not a taste: the same rendered per-frame step, priced at the attenuation the
 * intro is already applying. Measured on the live page at 1440x900, mean |Δ|
 * between the layer on and the layer off is 3.34 sRGB levels at `--focus` 0 and
 * 1.62 at 0.78 — 0.48x — so a dissolve of 0.48 x MOTION_FADE_IN_MS = 1455 ms
 * moves the picture at the same rate the eye sees. Rounded up to 1500, which is
 * this module's own asserted floor for a fade and therefore the shortest
 * dissolve it will ever admit. Asserted below against the ratio, so the pair
 * cannot drift apart silently.
 *
 * The point of it is not speed for its own sake. It lets the fade FINISH while
 * the overlay is still up, so the `--focus` ramp resolves the reader onto a
 * picture that is already moving, instead of handing them a sharp still that
 * then spends three seconds turning into a clip.
 */
export const MOTION_FADE_BEHIND_MS = 1500;

/**
 * WHICH FADE, decided by what the reader can actually see at the moment the
 * first frame presents — not by which door the gate came through. A clip that
 * was let in early but only reached its first frame after the overlay had gone
 * is arriving over a sharp picture and gets the long dissolve; that is the same
 * rule, read at the only instant it matters.
 *
 * The threshold is INTRO_FOCUS_HOLD itself (with a hair of tolerance for the
 * property's own string round-trip): the intro HOLDS `--focus` there for the
 * whole reveal and only leaves it on the way down, so "still at the hold" is
 * exactly "the overlay is still up and the picture is still soft".
 */
export function motionFadeMsForFocus(focus: number): number {
  return focus >= INTRO_FOCUS_HOLD - 0.02 ? MOTION_FADE_BEHIND_MS : MOTION_FADE_IN_MS;
}

/**
 * The loop handoff: the incoming copy dissolves over the outgoing one across
 * this many MEDIA seconds (a function of the incoming clip's currentTime,
 * never of wall-clock). Raise to 1.5 if a seam ghosts; asserted ≤ 20% of the
 * clip's duration by `parseHeroMotion`.
 */
/* 1.5, from 2.0 (2026-09-07, with the breathing 30 s take). A dissolve does not
   get better by getting longer: it blends the clip's last X seconds with its
   first X, so a LONGER one reaches further back into material that is less like
   the opening. On a clip whose light dims and returns, the ends match closely
   (2.97 luma apart) while a few seconds earlier they do not, and the measured
   peak per-frame step at the loop runs 0.23 at 1.5 s, 1.52 at 2 s and 1.75 at
   4 s. 1.5 s is the measured minimum of that curve for this clip and spends 5%
   of the loop dissolving. The harness reads this number from here, so a future
   clip should be re-measured rather than assumed. */
export const MOTION_CROSS_S = 1.5;

/**
 * After html[data-intro] is removed, wait this long before loading anything —
 * it covers the intro's --focus tail (INTRO_FOCUS_MS), asserted below.
 */
/* IT IS THE LATE DOOR'S NUMBER NOW, AND IT IS NO LONGER WHAT THE READER WAITS
   FOR. It was measured as the binding constraint on a fast first visit — the
   intro cleared at 3686 ms and the layer mounted at 5206, which is this number
   plus an idle callback — and that wait is what the owner saw. The early door
   removed it from that path entirely rather than tuning it down: a clip that
   arrives behind the overlay does not need the ramp protected from it, because
   arriving before the ramp is the whole point.

   On the paths that still use it, it is no longer binding either. Measured on
   the same build: fast repeat visit, the intro is gone at 30 ms so the settle
   ends at 1530 while MOTION_LCP_QUIET_MS ends at 2100 (the last entry at 900) —
   the quiet window decides, and the mount landed at 2131. Throttled first
   visit, the settle ends at 5950 against a quiet window ending at 5732 — 218 ms,
   the only case where it still leads.

   So it is kept at 1500, unchanged, for the one job the assertion below names:
   on a LATE door reached while an intro DID play, it covers INTRO_FOCUS_MS so
   the clip's fetch and decode land outside the `--focus` ramp. Lowering it
   would buy at most that 218 ms and spend the guarantee. */
export const MOTION_SETTLE_MS = 1500;

/** requestIdleCallback's timeout, and the setTimeout stand-in where rIC is absent (Safari). */
export const MOTION_IDLE_TIMEOUT_MS = 4000;

/** A `stalled` this long before the first frame → the still, for this page life. */
export const MOTION_STALL_MS = 8000;

/**
 * Hidden this long → drop both decoders and ~10 MB of buffers; re-gate on
 * visible.
 *
 * ⚠ A LOOPING CLIP ONLY. Re-gating restarts a clip at its first frame, which
 * for a loop is the picture it was already showing — nothing is lost. For a
 * ONE-SHOT clip (`loop: false`) the first frame is where the light STARTED: a
 * reader who comes back after a minute would be thrown from the night they left
 * to the sunset they began with, which is the exact fault the one-shot mode
 * exists to remove. There is no resume that avoids it either — a remount fades
 * up from the still, and the still IS the sunset. So the one-shot layer is
 * never unmounted for being hidden; it holds, paused, at one decoder (half of
 * what the looping mode holds, since there is no standby copy), and the tab
 * discard the browser does for a long-hidden tab is the backstop.
 */
export const MOTION_HIDDEN_UNMOUNT_MS = 60_000;

/**
 * The clip's box dissolves into the still beneath it over this many px on every
 * edge — CONDITIONALLY: see `motionNeedsFeather`.
 */
export const MOTION_EDGE_FEATHER_PX = 32;

/**
 * DOES THIS REGISTRATION NEED THE EDGE FEATHER? Only if the clip is a
 * SUB-RECTANGLE of the still.
 *
 * The feather exists to hide the model's few-level re-render seam where the
 * clip's edge lands INSIDE the picture — a real interior edge, with the same
 * photograph on both sides of it. A clip registered to the whole frame
 * (crop 0,0,1,1) has no such edge: the `cover` arithmetic pushes two of its
 * sides outside the container on the overflowing axis, and puts the other two
 * exactly ON the viewport's own edge, where the mask does not hide a seam — it
 * MAKES one, fading the clip out over the outer 32 px so the still shows
 * through in a band around the frame.
 *
 * While the two are the same picture that band is invisible and the feather is
 * merely useless. With a clip whose light leaves the still's — a descent into
 * night — it paints a warm sunset rim around a blue picture, which a design
 * pass photographed. So the mask is emitted only for a crop that is actually a
 * sub-rectangle, and the shipping registration gets none.
 */
export function motionNeedsFeather(crop: MotionCrop): boolean {
  return crop.x > 0 || crop.y > 0 || crop.w < 1 || crop.h < 1;
}

/**
 * IntersectionObserver threshold: pause both copies when less than this
 * fraction of the frame is visible. --focus reaches 1 at scroll y = span
 * ≈ max(0.85·vh, 0.75·heroH), where roughly 15% of the frame is still in
 * view — so the clip is already at opacity 0 when it is paused, and it resumes
 * before it is visible again.
 */
export const MOTION_PAUSE_BELOW_RATIO = 0.15;

/** Where the sanctioned installer puts the clip; nothing else ever goes here. */
export const MOTION_PUBLIC_DIR = '/brand/hero/motion';

/** The only filename grammar the layer will load. The 8 hex are the file's own sha256 prefix. */
export const MOTION_FILE_NAME = /^hero-loop-[0-9a-f]{8}\.(?:mp4|webm)$/;

/* ── The config ────────────────────────────────────────────────────────── */

/** A sub-rectangle of the STILL's frame, as fractions of its width and height. */
export interface MotionCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeroMotion {
  /** Public path of the clip, e.g. `/brand/hero/motion/hero-loop-2ea72e48.mp4`. */
  src: string;
  /** `video/mp4` or `video/webm`. */
  type: string;
  /** The baked-blur soft rung (already in cache; never visible — the layer is at opacity 0 until its first frame). */
  poster: string;
  /** The clip's duration in seconds, as probed from the container; reconciled with `video.duration` at runtime. */
  durationS: number;
  /** Which part of the still the clip depicts — the registration. */
  crop: MotionCrop;
  /**
   * TRUE — the clip is a loop: two stacked copies, a MOTION_CROSS_S dissolve at
   * the wrap, forever. FALSE — the clip is a one-way move that must not wrap:
   * ONE copy, no standby, no dissolve, played through once and held on its last
   * frame for the rest of the page's life.
   *
   * It is the MANIFEST's word, defaulted to `true` when the key is absent, so
   * every clip installed before the flag existed keeps behaving exactly as it
   * did. A one-way clip cannot be detected from the file — the layer would have
   * to decide from the material whether the light is meant to come back — and
   * the one thing that must never happen is a descent into night wrapping to
   * sunset because a flag was missing. The installer writes it
   * (`check-hero-motion.mjs --install --once`).
   */
  loop: boolean;
  /** The still's width / height, from the desktop rung's intrinsic size — never retyped. */
  stillAspect: number;
  /** The measured opacity ceiling (tests/e2e/hero-motion.spec.ts solves it); (0, 1]. */
  opacityCap: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fraction(value: unknown): number | null {
  const n = finite(value);
  return n !== null && n >= 0 && n <= 1 ? n : null;
}

/**
 * Validates a config from EITHER source — the manifest on the server, the
 * webdriver override on the client — into the shape the layer trusts. Null on
 * anything short of a complete, sane record; the layer then simply does not
 * exist, which is the still hero.
 */
export function parseHeroMotion(value: unknown): HeroMotion | null {
  if (!isRecord(value)) return null;

  const src = typeof value.src === 'string' ? value.src : '';
  if (!src.startsWith(`${MOTION_PUBLIC_DIR}/`)) return null;
  const type = typeof value.type === 'string' ? value.type : '';
  if (type !== 'video/mp4' && type !== 'video/webm') return null;
  if ((type === 'video/mp4') !== src.endsWith('.mp4')) return null;
  const poster = typeof value.poster === 'string' ? value.poster : '';

  // Absent → true: every clip installed before the flag existed is a loop, and
  // a missing key must never turn a one-way clip into a wrapping one.
  const loop = value.loop === undefined ? true : value.loop === true;

  const durationS = finite(value.durationS);
  if (durationS === null || !(durationS > 0)) return null;
  // X ≤ 0.2·D: the handoff must be a small part of the loop, never half of it.
  // A one-shot clip performs no handoff, so the rule has nothing to constrain.
  if (loop && durationS < MOTION_CROSS_S * 5) return null;

  if (!isRecord(value.crop)) return null;
  const x = fraction(value.crop.x);
  const y = fraction(value.crop.y);
  const w = fraction(value.crop.w);
  const h = fraction(value.crop.h);
  if (x === null || y === null || w === null || h === null) return null;
  if (!(w > 0 && h > 0) || x + w > 1.0001 || y + h > 1.0001) return null;

  const stillAspect = finite(value.stillAspect);
  if (stillAspect === null || !(stillAspect > 0)) return null;

  const opacityCap = finite(value.opacityCap);
  if (opacityCap === null || !(opacityCap > 0 && opacityCap <= 1)) return null;

  return { src, type, poster, durationS, crop: { x, y, w, h }, loop, stillAspect, opacityCap };
}

/* ── The stylesheet ────────────────────────────────────────────────────── */

/**
 * Emitted as a <style> inside the layer's own root (see the header for why it
 * is not a CSS module). Every selector is scoped to `[data-hero-motion]`.
 *
 * THE GEOMETRY. The root is `inset: 0` inside `.bg`, so `100cqw`/`100cqh` are
 * the photo frame's box. `--sw`/`--sh`/`--sx`/`--sy` reproduce EXACTLY what
 * `object-fit: cover` + `object-position` do to the still (hero-scrim.module.css
 * `.focal`), then the crop fractions pick the sub-rectangle the clip depicts.
 * The video is `object-fit: fill` because the box IS the crop — there is
 * nothing left to fit. Exact at every viewport aspect, no JS on resize, and no
 * `object-fit: cover` on the video, which would scale a 16:9 clip by HEIGHT in
 * a 16:10 box (1.11x the still's scale) and push the picture in 11% as the
 * layer fades up — the camera drift the owner rejected, reproduced in CSS.
 *
 * `--m-px`/`--m-py` are read from the sharp <img>'s computed object-position by
 * the controller — the element that owns the number — never retyped from
 * hero-scrim.module.css, whose `--hero-pos-y: NN%` literal the contrast gate
 * parses.
 *
 * `[data-clips]` follows `.sharp`'s law exactly — `opacity: calc(1 - --focus)`
 * — so on exit the clip defocuses with the sharp copy and `.bg`'s scale
 * carries it. NO `will-change`: a <video> is already a compositor layer.
 *
 * THE FEATHER is on the box (a div), not on the <video>, for WebKit's sake; it
 * dissolves the clip's edge into the still beneath it, which is what hides the
 * model's few-level re-render seam wherever the crop's edge lands INSIDE the
 * picture. `var(--ground)` is the opaque stop — alpha 1 — and paints nothing.
 * It is emitted under `[data-feather]`, which the controller sets only for a
 * crop that is a real sub-rectangle: see `motionNeedsFeather` for why a
 * whole-frame registration is harmed rather than helped by it.
 */
export const HERO_MOTION_STYLE =
  `[data-hero-motion]{position:absolute;inset:0;container-type:size;overflow:clip;` +
  `pointer-events:none;opacity:0;transition:opacity var(--motion-fade,${MOTION_FADE_IN_MS}ms) linear}` +
  `[data-hero-motion][data-on]{opacity:var(--m-cap,1)}` +
  `[data-hero-motion]>[data-clips]{position:absolute;inset:0;opacity:calc(1 - var(--focus,0))}` +
  `[data-hero-motion] [data-role]{` +
  `--sw:max(100cqw,calc(100cqh * var(--m-ar,1.5)));--sh:calc(var(--sw) / var(--m-ar,1.5));` +
  `--sx:calc((100cqw - var(--sw)) * var(--m-px,0.5));--sy:calc((100cqh - var(--sh)) * var(--m-py,0.5));` +
  `position:absolute;left:calc(var(--sx) + var(--sw) * var(--m-cx,0));top:calc(var(--sy) + var(--sh) * var(--m-cy,0));` +
  `width:calc(var(--sw) * var(--m-cw,1));height:calc(var(--sh) * var(--m-ch,1));opacity:0}` +
  `[data-hero-motion][data-feather] [data-role]{` +
  `-webkit-mask-image:linear-gradient(to bottom,transparent,var(--ground) ${MOTION_EDGE_FEATHER_PX}px,var(--ground) calc(100% - ${MOTION_EDGE_FEATHER_PX}px),transparent),` +
  `linear-gradient(to right,transparent,var(--ground) ${MOTION_EDGE_FEATHER_PX}px,var(--ground) calc(100% - ${MOTION_EDGE_FEATHER_PX}px),transparent);` +
  `mask-image:linear-gradient(to bottom,transparent,var(--ground) ${MOTION_EDGE_FEATHER_PX}px,var(--ground) calc(100% - ${MOTION_EDGE_FEATHER_PX}px),transparent),` +
  `linear-gradient(to right,transparent,var(--ground) ${MOTION_EDGE_FEATHER_PX}px,var(--ground) calc(100% - ${MOTION_EDGE_FEATHER_PX}px),transparent);` +
  `-webkit-mask-composite:source-in;mask-composite:intersect}` +
  `[data-hero-motion] [data-role="active"]{opacity:1}` +
  `[data-hero-motion] [data-role="incoming"]{z-index:1}` +
  `[data-hero-motion] video{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}` +
  `@media (prefers-reduced-motion:reduce){[data-hero-motion]{display:none}}` +
  `@media (scripting:none){[data-hero-motion]{display:none}}`;

/* ── Assertions — relationships a comment cannot enforce ───────────────── */

if (MOTION_FADE_IN_MS < 1500) {
  throw new Error(
    'lib/hero-motion.ts: MOTION_FADE_IN_MS must be at least 1500 — the fade-in is what makes ' +
      "frame 0's difference from the still a dissolve rather than a pop.",
  );
}

if (MOTION_FADE_BEHIND_MS < 1500) {
  throw new Error(
    'lib/hero-motion.ts: MOTION_FADE_BEHIND_MS must be at least 1500 — the floor above applies to ' +
      'every fade the layer can perform, not only the long one.',
  );
}

/* The two fades are one rule read at two values of --focus, so they may not
   drift apart. 0.485 is the measured attenuation the intro's hold applies to
   the step (mean |Δ| 1.62 sRGB levels at --focus 0.78 against 3.34 at 0, on
   rendered pixels at 1440x900): a fade shorter than that fraction of the long
   one would move the picture FASTER, in what the eye sees, than the dissolve
   this module already calls the slowest it may go. */
if (MOTION_FADE_BEHIND_MS < 0.485 * MOTION_FADE_IN_MS) {
  throw new Error(
    'lib/hero-motion.ts: MOTION_FADE_BEHIND_MS is under 0.485 × MOTION_FADE_IN_MS — the fade behind ' +
      'the intro would present a larger per-frame step, in rendered pixels, than the fade over the ' +
      'sharp picture. Re-measure the attenuation before lowering either.',
  );
}

if (motionFadeMsForFocus(INTRO_FOCUS_HOLD) !== MOTION_FADE_BEHIND_MS || motionFadeMsForFocus(0) !== MOTION_FADE_IN_MS) {
  throw new Error(
    'lib/hero-motion.ts: motionFadeMsForFocus does not return the behind-the-intro fade at the ' +
      "intro's own hold, or the long fade at a sharp picture. Its threshold and INTRO_FOCUS_HOLD have drifted.",
  );
}

if (!(MOTION_CROSS_S > 0)) {
  throw new Error('lib/hero-motion.ts: MOTION_CROSS_S must be positive — a zero-length handoff is a hard cut.');
}

if (MOTION_SETTLE_MS < INTRO_FOCUS_MS) {
  throw new Error(
    'lib/hero-motion.ts: MOTION_SETTLE_MS must cover INTRO_FOCUS_MS, or the clip starts loading ' +
      "while the intro's --focus ramp is still resolving the photograph.",
  );
}

if (MOTION_LCP_QUIET_MS < 900) {
  throw new Error(
    'lib/hero-motion.ts: MOTION_LCP_QUIET_MS must exceed the widest measured gap between two ' +
      'largest-contentful-paint entries of one load (812 ms, 1.6 Mbit/s, first visit), or the ' +
      'auto-start reads the middle of a paint burst as quiet.',
  );
}

if (!(MOTION_PAUSE_BELOW_RATIO > 0 && MOTION_PAUSE_BELOW_RATIO < 1)) {
  throw new Error('lib/hero-motion.ts: MOTION_PAUSE_BELOW_RATIO must be a fraction in (0, 1).');
}
