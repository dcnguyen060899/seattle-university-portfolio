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
 * plain automation and anything before the first input, and hero.tsx still
 * hands it nothing unless the corpus record may render. The first two Runway
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
 * ── LCP: THE STRICT VARIANT, CHOSEN ON PURPOSE ──────────────────────────────
 *
 * Chrome ≥116 counts a <video>'s first painted frame as a largest-contentful-
 * paint candidate, records an element the moment its opacity leaves zero, and
 * the registered clip paints 90–98% of the viewport — more than the h1. The
 * full-viewport exclusion does not apply because the clip never covers the
 * whole viewport (a still-only strip of 17–51 px sits above it at every
 * desktop aspect). The ONLY construction under which the clip can never be
 * the LCP is to mount it after LCP is final, and LCP stops being updated at
 * the first scroll, pointerdown or keydown. So the gate waits for that input
 * (MOTION_FIRST_INPUT_EVENTS). A visitor who reads for a while without
 * touching anything sees the still; the moment they scroll, the picture comes
 * alive. The IDLE variant — mount at idle without input — would report the
 * fade-in as the page's LCP for every non-scrolling session and was rejected.
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

import { INTRO_FOCUS_MS } from './intro';

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
 * sessionStorage. A JSON `HeroMotion` that stands in for the manifest, read
 * ONLY under `navigator.webdriver` AND the force key. It exists so the
 * controller can be tested against a candidate clip served from memory
 * without any clip in the repository — the repo held no clip until one
 * passed (the Seedance 2 transcode, installed 2026-09-06), and the next
 * candidate is tried the same way. A real browser never reports webdriver,
 * and sessionStorage is same-origin, so this is unreachable without already
 * running script on the page. Validated through `parseHeroMotion` like the
 * manifest.
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

/** The first of these finalises LCP (see the header); the layer mounts after it. */
export const MOTION_FIRST_INPUT_EVENTS: readonly string[] = ['scroll', 'pointerdown', 'keydown'];

/* ── Timeline ──────────────────────────────────────────────────────────── */

/**
 * The whole layer's fade-in, wall-clock, linear. ≥ 1500 by requirement
 * (asserted below): frame 0 of any clip differs from the still by a few sRGB
 * levels (the model re-renders it), and a slow linear dissolve is what turns
 * that difference into something the eye cannot catch as a pop.
 */
/* 3000, from 1800: the installed clip is a diffusion RE-RENDER of the still —
   frame 0 sits 17 sRGB levels from it, same composition, fine detail redrawn —
   so the fade-in is a morph between two drawings of one scene, and a slower one
   reads as the picture waking rather than changing. The harness reads this
   number from here and judges it as a per-frame step. */
export const MOTION_FADE_IN_MS = 3000;

/**
 * The loop handoff: the incoming copy dissolves over the outgoing one across
 * this many MEDIA seconds (a function of the incoming clip's currentTime,
 * never of wall-clock). Raise to 1.5 if a seam ghosts; asserted ≤ 20% of the
 * clip's duration by `parseHeroMotion`.
 */
export const MOTION_CROSS_S = 1.0;

/**
 * After html[data-intro] is removed, wait this long before loading anything —
 * it covers the intro's --focus tail (INTRO_FOCUS_MS), asserted below.
 */
export const MOTION_SETTLE_MS = 1500;

/** requestIdleCallback's timeout, and the setTimeout stand-in where rIC is absent (Safari). */
export const MOTION_IDLE_TIMEOUT_MS = 4000;

/** A `stalled` this long before the first frame → the still, for this page life. */
export const MOTION_STALL_MS = 8000;

/** Hidden this long → drop both decoders and ~10 MB of buffers; re-gate on visible. */
export const MOTION_HIDDEN_UNMOUNT_MS = 60_000;

/** The clip's box dissolves into the identical still beneath it over this many px on every edge. */
export const MOTION_EDGE_FEATHER_PX = 32;

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

  const durationS = finite(value.durationS);
  // X ≤ 0.2·D: the handoff must be a small part of the loop, never half of it.
  if (durationS === null || durationS < MOTION_CROSS_S * 5) return null;

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

  return { src, type, poster, durationS, crop: { x, y, w, h }, stillAspect, opacityCap };
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
 * dissolves the clip's edge into the identical still beneath it, which is what
 * hides the model's few-level re-render seam wherever the crop's edge lands.
 * `var(--ground)` is the opaque stop — alpha 1 — and paints nothing.
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
  `width:calc(var(--sw) * var(--m-cw,1));height:calc(var(--sh) * var(--m-ch,1));opacity:0;` +
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

if (!(MOTION_CROSS_S > 0)) {
  throw new Error('lib/hero-motion.ts: MOTION_CROSS_S must be positive — a zero-length handoff is a hard cut.');
}

if (MOTION_SETTLE_MS < INTRO_FOCUS_MS) {
  throw new Error(
    'lib/hero-motion.ts: MOTION_SETTLE_MS must cover INTRO_FOCUS_MS, or the clip starts loading ' +
      "while the intro's --focus ramp is still resolving the photograph.",
  );
}

if (!(MOTION_PAUSE_BELOW_RATIO > 0 && MOTION_PAUSE_BELOW_RATIO < 1)) {
  throw new Error('lib/hero-motion.ts: MOTION_PAUSE_BELOW_RATIO must be a fraction in (0, 1).');
}
