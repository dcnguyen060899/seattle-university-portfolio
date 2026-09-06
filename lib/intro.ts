/**
 * lib/intro.ts — the homepage intro's constants and its one inline script, in
 * a dependency-free module.
 *
 * Imported by the root layout (which emits the gate), by the client overlay,
 * and by the server-side source check. It must therefore stay PLAIN DATA: no
 * `server-only`, no `node:fs`, no DOM access at module scope.
 *
 * ── WHY THIS IS NOT AN MP4 (the one decision the whole file follows from) ──
 *
 * The reference implementation this is ported from (MAVTERRAS
 * components/site/intro.tsx + lib/intro.ts) plays a 3.4 MB H.264 film over an
 * opaque near-black ground, and roughly two thirds of that module is the
 * machinery an opaque film needs: a bandwidth gate, a readiness budget, a
 * frame-accurate planner, a playbackRate ceiling proven by
 * requestVideoFrameCallback, a cut across a still hold, a stall watchdog.
 *
 * NONE OF IT SURVIVES THE REQUIREMENT HERE, which was given in one sentence:
 * the intro must play OVER THE HERO PHOTOGRAPH, softly out of focus, and then
 * resolve into the sharp photograph. An mp4 carries an opaque baked
 * background, so it cannot sit over a photograph at all; alpha video (WebM
 * VP9 alpha, HEVC alpha) has patchy support and would double the asset. So
 * the reveal is inline markup and CSS — a few KB, sharp at any DPI, nothing
 * to decode before first paint, transparent by construction.
 *
 * What that deletes, and it is worth being explicit because their absence is
 * a design decision rather than an omission:
 *
 *   · no connection gate — there is no multi-megabyte fetch to save anybody
 *   · no readiness budget, no planner, no rate ceiling — there is no media
 *     clock, so the timeline is wall-clock and cannot stall
 *   · no `ended`/`waiting`/`stalled` handling, no `release()` abort path
 *
 * What is ported EXACTLY, because it is the part most implementations get
 * wrong and none of it is about video:
 *
 *   · the blocking gate script in <head> (see INTRO_GATE_SCRIPT)
 *   · the attribute ladder on <html>: pending → playing → done → removed
 *   · one exit, `finish(reason)`, so the dissolve runs once by construction
 *   · unmount is a CANCEL, not a finish — it must not mark the intro seen
 *   · the overlay goes on swallowing pointer events into the dissolve
 *     (INTRO_POINTER_GUARD_MS — for a guard window, not for the whole of it)
 *
 * ── THE HAND-OFF: `--focus` IS THE TRANSITION ─────────────────────────────
 *
 * components/site/hero.tsx already renders two stacked copies of the
 * photograph — a baked-blur soft copy and a sharp copy — and cross-fades them
 * with `--focus` on <html> (0 = sharp, 1 = soft). hooks/use-scroll-driver.ts
 * publishes it from scroll position.
 *
 * The intro drives THE SAME PROPERTY from time instead of scroll: held at
 * INTRO_FOCUS_HOLD while the reveal plays, ramped to 0 as the overlay
 * dissolves. The photograph resolving from blur to sharp IS the transition
 * into the page.
 * There is no second blurred layer and no animated `filter: blur()` — see the
 * header of components/site/hero.module.css for the measurements that make
 * both of those a defect rather than a shortcut.
 *
 * A free consequence worth knowing about: hero.module.css also scales the
 * photograph by `1 + 0.14 * --focus`, so holding it at INTRO_FOCUS_HOLD means
 * the picture is ~11% in during the reveal and settles back to native as the
 * intro resolves. That settle costs nothing and was not designed here; it
 * falls out of reusing the existing property rather than inventing one.
 */

/* ── Identity ──────────────────────────────────────────────────────────── */

/**
 * sessionStorage, not localStorage: a brand moment is meant to replay on a
 * fresh session, and one constant is the only place to change that.
 * Written by the component's finish(), never by the gate — so a reload
 * mid-intro counts as seen while a hydration failure does not.
 */
export const INTRO_STORAGE_KEY = 'duyng.intro.seen';

/**
 * The automation escape hatch, and it only ever makes the intro APPEAR.
 *
 * The gate is inert under `navigator.webdriver`, which keeps every Playwright
 * run byte-identical to a page with no intro — the e2e suite samples hero
 * pixels, measures contrast and counts figures above the fold, and an overlay
 * would break all of it in a way that says nothing about the overlay. That
 * would also make the intro untestable, so a spec can opt back in with
 * `sessionStorage.setItem(INTRO_FORCE_KEY, '1')` in an init script.
 *
 */
export const INTRO_FORCE_KEY = 'duyng.intro.force';

/** The `data-intro` attribute on <html>. Absent means "no intro on this document". */
export type IntroAttr = 'pending' | 'playing' | 'done';

/* ── Timeline (milliseconds) ───────────────────────────────────────────── */

/**
 * How long the mark has to draw itself, from the overlay's first paint to the
 * start of the dissolve. Published to CSS as `--intro-reveal` (see the gate
 * script) so the reveal's own keyframes and this module cannot disagree.
 *
 * IT IS THE MARK'S NUMBER, NOT THIS MODULE'S. It equals LOGO_REVEAL_MS in
 * components/site/intro/LogoReveal.tsx, whose own comment states that the
 * last tagline glyph lands at 2.50 s and the mark then holds still for
 * 0.10 s, so a cut at or after 2600 ms is guaranteed a static frame and a cut
 * before it is a mark caught mid-stroke. components/site/intro/index.ts
 * asserts the relationship at build time rather than trusting this comment.
 *
 * IT IS ALSO THE PAGE'S LCP, AND THAT TRADE SHOULD BE MADE ON PURPOSE.
 * MEASURED (production build, headless Chromium 1280x800, warm cache,
 * 2026-09-03): a repeat visit's LCP is 964 ms; a first visit with the intro
 * is 3204 ms, and this constant is very nearly the whole difference. A brand moment that withholds the page for 2.6 s HAS an LCP of
 * about 2.6 s on the first view of a session, and no amount of CSS changes
 * that — every 100 ms cut from the draw is 100 ms off the metric. See the
 * LCP note in intro.module.css for the part that WAS recoverable and was.
 */
export const INTRO_REVEAL_MS = 2600;

/**
 * The dissolve. "Slowly fade into the main page" — the overlay's opacity and
 * the nav's and the hero copy's return all run on exactly this.
 */
export const INTRO_DISSOLVE_MS = 900;

/** Skip: the visitor has said they are done, so the same move, faster. */
export const INTRO_DISSOLVE_QUICK_MS = 450;

/**
 * HOW LONG THE DISSOLVING OVERLAY GOES ON SWALLOWING POINTER EVENTS.
 *
 * The overlay must not become click-through on the FIRST frame of the
 * dissolve: the reference measured a real bug where an impatient second tap
 * went through a nearly-opaque overlay to a link and navigated the visitor
 * away mid-fade. That is why there is no blanket `pointer-events: none`.
 *
 * But holding them for the WHOLE dissolve was measured to be wrong in the
 * other direction. MEASURED (production build, Chromium 1280x800,
 * 2026-09-03), sampling `elementFromPoint` at the viewport centre every 40 ms
 * after a Skip click: the overlay reaches opacity 0.017 at 266 ms and 0.0002
 * at 397 ms, but stays hit-testable until it unmounts at ~460 ms. So for
 * roughly a quarter of a second the visitor is looking at a live page whose
 * clicks are being eaten by something they cannot see. On the natural
 * 900 ms dissolve that window is about half a second.
 *
 * WHAT IS ACTUALLY BEING GUARDED, ONCE THE ATTRIBUTE REACHES `done`: nothing
 * the visitor can aim at. Intro.tsx removes the Skip button from the DOM at
 * `done`, and the overlay's own onClick is finish(), which is idempotent and
 * has already run. The only thing left worth intercepting is the synthetic
 * click a touch device may still deliver after the touchend that dismissed
 * the intro — a sub-100 ms concern on any browser with a device-width
 * viewport. 200 ms covers it with room to spare and ends well before the
 * veil is invisible on either dissolve length.
 *
 * Must stay below INTRO_DISSOLVE_QUICK_MS so the guard is over before the
 * shorter dissolve finishes; asserted below.
 */
export const INTRO_POINTER_GUARD_MS = 200;

/**
 * HOW SOFT THE PHOTOGRAPH IS HELD WHILE THE MARK DRAWS. 1 = the fully blurred
 * copy, 0 = sharp.
 *
 * THIS IS THE NUMBER THAT DECIDES WHETHER THE REQUIREMENT IS MET, and it was
 * originally 1, which failed. The owner asked for the photograph to stay
 * visible, softly out of focus, for the whole animation. At `--focus: 1` it
 * is not visible: the only thing on screen is the mark on a near-black warm
 * field, which is the mp4's failure mode reached by a different route.
 *
 * MEASURED, production build, headless Chromium 1280x800 dpr 1, 2026-09-03.
 * Rec.709 luma over the decoded screenshot; `range` is p98 - p2 over a
 * 1160x200 band of open picture (x 60-1220, y 100-300) that is clear of the
 * lockup. The sharp photograph on that band reads 182:
 *
 *     focus  veil        range   what it looks like
 *     1.00   82% / 32%      14   near-black; no campus. THE FAILING STATE.
 *     1.00   none           23   still no campus — so the veil was never the
 *                                whole story, and lightening it alone does
 *                                not rescue this
 *     0.85   50% / 12%      18   present but murky
 *     0.78   50% / 12%      19   the buildings, the trees and the SEATTLE
 *                                UNIVERSITY sign all read, clearly soft
 *     0.70   none           32   reads as barely-defocused; too sharp to be
 *                                the "before" half of a resolve
 *
 * WHY THE BLUR AND NOT ONLY THE VEIL. hero.module.css cross-fades two baked
 * copies with `opacity: calc(1 - var(--focus))`, so at 1 the sharp copy
 * contributes NOTHING and all that is left is a low-pass-filtered image under
 * the hero scrim's 0.86 veil. Backing off to 0.78 lets 22% of the sharp copy
 * through, which restores the large masses — the building, the tree line, the
 * sign — without restoring edges. The picture still reads unmistakably as out
 * of focus, and the resolve to 0 is still a resolve.
 *
 * IT IS ALSO WHY THE VEIL COULD BE LIGHTENED. Once the ground is a picture
 * rather than a flat field, the veil no longer has to carry legibility on its
 * own; see intro.module.css, where 82/32 became 50/12 and the mark's measured
 * worst-case contrast moved only 15.2:1 -> 13.4:1.
 *
 * Consumed in three places, all of which must agree: the gate script below
 * (before first paint), the overlay's `--focus` claim, and the top of its
 * resolve ramp.
 */
export const INTRO_FOCUS_HOLD = 0.78;

/**
 * The `--focus` ramp runs a beat LONGER than the overlay's fade, so the last
 * thing the visitor sees is the photograph finishing its resolve on a page
 * that is otherwise already live. Any real input during that tail abandons
 * the ramp immediately and hands `--focus` back to the scroll driver.
 */
export const INTRO_FOCUS_MS = 1100;

/**
 * Hydration later than this and the intro yields: the visitor has been
 * looking at a soft photograph for nearly three seconds already, and starting
 * a 2.6 s reveal on top of that is punishing them for a slow device.
 *
 * IT MUST STAY BELOW INTRO_CSS_FAILSAFE_DELAY_MS. Past that moment the
 * pure-CSS failsafe has already begun fading the overlay, and taking over
 * then would flip a half-faded overlay back to fully opaque before removing
 * it — a flash, and the exact trap the reference documents.
 */
export const INTRO_LATE_MOUNT_MS = 2800;

/**
 * THE DEAD-MAN'S SWITCH, and it lives in the gate script itself rather than
 * in CSS.
 *
 * The reference solves the same problem with a CSS animation on
 * html[data-intro="pending"], because the only thing it has to undo is an
 * overlay's opacity. Here the gate ALSO holds `--focus` off 0, and an
 * unregistered custom property cannot be reliably reverted by an animation in
 * every engine. A hero photograph stuck out of focus forever, because a JS
 * chunk 404'd, is a far worse failure than a stuck overlay.
 *
 * So the gate arms its own timeout. It is inline in the HTML: if the gate ran
 * at all, this runs too — the only way to lose it is JavaScript being
 * disabled, in which case the gate never stamped anything either. It is a
 * no-op once the component has advanced the attribute to `playing`, exactly
 * the way the reference's CSS failsafe stops matching.
 *
 * Must exceed INTRO_REVEAL_MS + INTRO_DISSOLVE_MS; asserted below.
 */
export const INTRO_FAILSAFE_MS = 4000;

/**
 * THE PURE-CSS HALF OF THE DEAD-MAN'S SWITCH: when the fade of a stuck
 * `pending` overlay STARTS. It must equal the animation-delay in
 * intro.module.css — there is no way to publish a number into a CSS animation
 * shorthand without a custom property, and spending gate bytes on a path that
 * only exists when the client bundle is already broken is the wrong trade.
 * The assertions below hold the relationships that actually matter.
 *
 * The two halves are deliberately staggered rather than simultaneous: CSS
 * fades the veil out over INTRO_DISSOLVE_MS ending exactly at
 * INTRO_FAILSAFE_MS, and the gate's own timeout then removes the attribute
 * and `--focus`. Fire them together and a broken page snaps rather than
 * dissolves.
 */
export const INTRO_CSS_FAILSAFE_DELAY_MS = 3100;

/**
 * A reload that restores a deep scroll position must not get an overlay over
 * the middle of the page. Small enough that a browser's 1px restoration
 * jitter does not trip it.
 */
export const INTRO_SCROLL_TOLERANCE_PX = 8;

/* ── The logo source ───────────────────────────────────────────────────── */

/**
 * `svg` inline-able / renderable vector · `raster` renderable bitmap ·
 * `vector-source` a print master that still has to be traced before anything
 * can render it.
 */
export type LogoSourceKind = 'svg' | 'raster' | 'vector-source';

export interface LogoSource {
  /** Public href, e.g. `/brand/logo-source.svg`. */
  readonly href: string;
  readonly kind: LogoSourceKind;
}

/**
 * Ordered by preference; the first that exists on disk wins.
 *
 * ABSENT MEANS NO INTRO AT ALL — not a placeholder, not an empty overlay, not
 * a fade from nothing. The homepage renders exactly as it ships today, the
 * gate script is not even emitted, and the overlay's markup is not in the
 * HTML. That is the well-tested path, because it is the shipping state until
 * the owner lands a file.
 *
 * `logo-source.pdf` is deliberately `vector-source`: a PDF is a master, not
 * something an <img> can draw, so landing only a PDF means "traced artwork is
 * still owed" and the intro stays off rather than playing an empty stage.
 * components/site/intro/source.ts is where that rule is applied.
 *
 * `personal_brand.png` is the horizontal DN lockup the owner put in
 * public/brand on 2026-09-03. It is listed LAST so a later vector export at
 * any of the `logo-source.*` names takes over with no code change.
 */
export const INTRO_LOGO_CANDIDATES: readonly LogoSource[] = [
  { href: '/brand/logo-source.svg', kind: 'svg' },
  { href: '/brand/logo-source.png', kind: 'raster' },
  { href: '/brand/logo-source.pdf', kind: 'vector-source' },
  { href: '/brand/personal_brand.png', kind: 'raster' },
];

/** Only these can actually be drawn; a `vector-source` alone keeps the intro off. */
export function isRenderableLogo(source: LogoSource | null): source is LogoSource {
  return source !== null && source.kind !== 'vector-source';
}

/* ── The gate ──────────────────────────────────────────────────────────── */

/**
 * Rendered as a blocking inline <script> in <head> by app/layout.tsx, so it
 * runs during HTML parsing — before any body markup exists, let alone paints.
 *
 * That position is the whole point, and it is what makes three separate
 * things structural rather than a race:
 *
 *   1. no flash of the overlay on a repeat visit — the overlay's CSS is
 *      display:none without the attribute, and the attribute is decided
 *      before the body is parsed;
 *   2. no flash of the SHARP photograph before the soft one — `--focus` is
 *      already INTRO_FOCUS_HOLD when the hero's first pixel is painted, so
 *      the picture is never sharp-then-soft;
 *   3. the whole thing is inert off "/" — it checks location.pathname, so
 *      /docs/* (static files that never see this layout anyway) and
 *      app/not-found.tsx pay ~600 bytes of head and nothing else.
 *
 * Reading a cookie server-side instead would opt the homepage out of static
 * prerendering, and a client component cannot run before hydration. The Next
 * 16 idiom is `docs/01-app/02-guides/preventing-flash-before-hydration.md`,
 * themes section — the same shape.
 *
 * EVERY GATE IS A FAIL-OPEN. One try/catch around the lot: any throw
 * (sessionStorage unavailable in a locked-down privacy mode) leaves the
 * attribute unset, `--focus` untouched, and the page exactly as it is today.
 * The hash check is for a /#contact visitor, who should reach their anchor
 * rather than a logo reveal; a query string is allowed so a utm-tagged link
 * still gets the brand moment.
 *
 * Repo-controlled constants, no user input — every interpolation below is a
 * number or a JSON.stringify of a literal defined in this file.
 */
export const INTRO_GATE_SCRIPT =
  '(function(){try{' +
  'var h=document.documentElement;' +
  'if(location.pathname!=="/"||location.hash)return;' +
  'if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;' +
  'if(document.visibilityState==="hidden")return;' +
  // Reading storage first means a blocked storage throws here, into the outer
  // catch, and the intro simply does not happen.
  `var f=sessionStorage.getItem(${JSON.stringify(INTRO_FORCE_KEY)})==="1";` +
  // The opt-in relaxes EXACTLY ONE condition — the automation check — and
  // nothing else. In particular "already seen" is still checked, so a spec
  // can force an intro and still exercise the repeat-visit path.
  'if(navigator.webdriver&&!f)return;' +
  `if(sessionStorage.getItem(${JSON.stringify(INTRO_STORAGE_KEY)}))return;` +
  'h.setAttribute("data-intro","pending");' +
  // The hero's own cross-fade property, held soft from before first paint.
  // NOT 1: see INTRO_FOCUS_HOLD. At 1 the sharp copy contributes nothing and
  // the photograph is not visible at all, which is the one thing the
  // requirement forbids.
  `h.style.setProperty("--focus","${INTRO_FOCUS_HOLD}");` +
  // Durations published to CSS from the same constants JS uses, so the
  // stylesheet and the timers cannot drift apart.
  `h.style.setProperty("--intro-reveal","${INTRO_REVEAL_MS}ms");` +
  `h.style.setProperty("--intro-dissolve","${INTRO_DISSOLVE_MS}ms");h.style.setProperty("--intro-focus","${INTRO_FOCUS_MS}ms");` +
  'setTimeout(function(){' +
  // No-op the moment the component has taken over (pending → playing).
  'if(h.getAttribute("data-intro")!=="pending")return;' +
  'h.removeAttribute("data-intro");' +
  'h.style.removeProperty("--focus");' +
  'h.style.removeProperty("--intro-reveal");' +
  'h.style.removeProperty("--intro-dissolve");h.style.removeProperty("--intro-focus")' +
  `},${INTRO_FAILSAFE_MS})` +
  '}catch(e){}})()';

/**
 * A module-scope assertion rather than a comment, because the relationship is
 * the one thing that makes the failsafe safe: it must not fire while a
 * legitimate intro is still running.
 */
if (INTRO_FAILSAFE_MS <= INTRO_REVEAL_MS + INTRO_DISSOLVE_MS) {
  throw new Error(
    'lib/intro.ts: INTRO_FAILSAFE_MS must exceed INTRO_REVEAL_MS + INTRO_DISSOLVE_MS, ' +
      'or the dead-man\'s switch cuts a playing intro off at the knees.',
  );
}

if (INTRO_POINTER_GUARD_MS >= INTRO_DISSOLVE_QUICK_MS) {
  throw new Error(
    'lib/intro.ts: INTRO_POINTER_GUARD_MS must be below INTRO_DISSOLVE_QUICK_MS, or a skipped ' +
      'intro stays hit-testable for its whole dissolve and swallows clicks on a page the ' +
      'visitor can already see.',
  );
}

if (INTRO_LATE_MOUNT_MS >= INTRO_CSS_FAILSAFE_DELAY_MS) {
  throw new Error(
    'lib/intro.ts: INTRO_LATE_MOUNT_MS must be below INTRO_CSS_FAILSAFE_DELAY_MS, or a ' +
      'late hydration flips a half-faded overlay back to opaque before removing it.',
  );
}

if (INTRO_CSS_FAILSAFE_DELAY_MS + INTRO_DISSOLVE_MS > INTRO_FAILSAFE_MS) {
  throw new Error(
    'lib/intro.ts: the CSS failsafe must have finished fading by INTRO_FAILSAFE_MS, or the ' +
      'gate\'s timeout snaps away an overlay that is still visible.',
  );
}
