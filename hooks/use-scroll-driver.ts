'use client';

/**
 * ONE rAF loop for every scroll-linked value on the page.
 *
 * Ported from MAVTERRAS hooks/use-scroll-driver.ts. The alternative — a
 * scroll listener per component — produces N style writes and N layout reads
 * per frame and stutters on a phone. There is exactly one listener, one
 * requestAnimationFrame per scroll burst, and one component that writes
 * styles.
 *
 * Consumers:
 *   useScrollDriver()   writes --page / --focus / --exit  (the ONLY style writer)
 *   useNavGround()      'over' | 'paper' — the fixed nav's declared ground,
 *                       hysteretic, one re-render per transition
 *   useTrackProgress()  0->1 over a tall element
 *   subscribeScroll()   imperative escape hatch
 *
 * Everything below the subscription layer is allocation-free per frame apart
 * from the single frame object.
 *
 * NO OTHER COMPONENT MAY ADD A SCROLL LISTENER. If you need a scroll value,
 * add a hook here.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';

export interface ScrollFrame {
  /** window.scrollY */
  y: number;
  /** window.innerHeight */
  vh: number;
  /** Total scrollable distance; 0 on a page shorter than the viewport. */
  docH: number;
}

type Listener = (frame: ScrollFrame) => void;

const listeners = new Set<Listener>();
let queued = false;
let attached = false;

function measure(): ScrollFrame {
  return {
    y: window.scrollY,
    vh: window.innerHeight,
    docH: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  };
}

function tick(): void {
  queued = false;
  const frame = measure();
  for (const listener of listeners) listener(frame);
}

function schedule(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(tick);
}

function attach(): void {
  if (attached) return;
  attached = true;
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
}

function detach(): void {
  if (!attached) return;
  attached = false;
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
}

/**
 * Force one more frame. For the rare consumer whose CACHED GEOMETRY has been
 * invalidated by something that is not a scroll, a resize or a document-height
 * change — a font swap moving the nav's height, say. It queues the same single
 * rAF the scroll path does; it never adds a listener.
 */
export function pokeScroll(): void {
  if (listeners.size > 0) schedule();
}

/** Imperative escape hatch; prefer the hooks below. */
export function subscribeScroll(listener: Listener): () => void {
  listeners.add(listener);
  attach();
  // Prime immediately so a component mounted mid-page is correct on frame 1.
  listener(measure());
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach();
  };
}

/**
 * Subscribe with a callback that may change identity every render without
 * re-subscribing (and therefore without tearing down the shared listener).
 */
function useFrame(onFrame: Listener): void {
  const ref = useRef<Listener>(onFrame);
  useEffect(() => {
    ref.current = onFrame;
  });
  useEffect(() => subscribeScroll((frame) => ref.current(frame)), []);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE FOCUS OVERRIDE — the homepage intro's one hook into this module
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `--focus` is the hero's blur→sharp cross-fade (0 = sharp). Normally it is a
 * pure function of scroll position. The homepage intro
 * (components/site/intro/Intro.tsx) needs the SAME property driven by TIME
 * instead: held at 1 while the logo reveal plays, ramped to 0 as the intro
 * dissolves, so the photograph resolving from blur to sharp IS the transition
 * into the page.
 *
 * IT IS AN OVERRIDE RATHER THAN A SECOND WRITER, and that distinction is the
 * whole reason it lives here. This file's contract — "exactly one component
 * writes styles" — is not a style preference; two writers racing for one
 * custom property on <html> is a property whose value depends on which rAF
 * won, which is exactly the class of bug this module was extracted to
 * prevent. So the intro publishes a NUMBER and the driver keeps writing.
 *
 * `null` releases it. Release is not "stop writing": it must force the driver
 * to re-publish the scroll-derived value, because the skip-redundant-writes
 * cache would otherwise hold whatever it last wrote and the hero would stay
 * out of focus. Hence the invalidator set.
 */
let focusOverride: number | null = null;

/** Registered by the claiming driver; resets its `lastFocus` memo. */
const focusInvalidators = new Set<() => void>();

/**
 * Set (or, with `null`, release) the time-driven value of `--focus`.
 *
 * With a driver mounted this goes through the shared rAF like every other
 * scroll-linked write, one frame later. With NO driver mounted — a route with
 * no hero, or the vanishingly small window before <ScrollDriver /> has run its
 * effect — it writes the property directly, because a hand-off that silently
 * did nothing would leave the hero soft forever. Same property, same element,
 * so the two paths cannot disagree; only one of them is ever live.
 */
export function setIntroFocus(value: number | null): void {
  focusOverride = value === null ? null : clamp01(value);
  for (const invalidate of focusInvalidators) invalidate();

  if (focusInvalidators.size > 0) {
    pokeScroll();
    return;
  }

  const root = document.documentElement;
  if (focusOverride === null) root.style.removeProperty('--focus');
  else root.style.setProperty('--focus', focusOverride.toFixed(4));
}

/* ══════════════════════════════════════════════════════════════════════════
   prefers-reduced-motion
   ══════════════════════════════════════════════════════════════════════════ */

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(MOTION_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function motionSnapshot(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOTION_QUERY).matches;
}

/**
 * Server snapshot is `false` — motion-on. Deliberate: the CSS
 * `@media (prefers-reduced-motion: reduce)` blocks in hero.module.css already
 * neutralise every animation before hydration, so the server never needs to
 * guess. This hook exists only for the JS-side behaviour CSS cannot express —
 * here, not writing the custom properties at all.
 */
function motionServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, motionSnapshot, motionServerSnapshot);
}

/* ══════════════════════════════════════════════════════════════════════════
   The driver
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Only the first mounted driver writes styles. <ScrollDriver /> is rendered by
 * the hero today and belongs in the root layout the day the layout's owner
 * takes it; if it ends up mounted in both places, the second instance is a
 * no-op rather than a second writer racing the first for the same three
 * properties.
 */
let writerClaimed = false;

/**
 * The single style writer. Mount once.
 *
 *   --page   (html) 0->1 document scroll progress
 *   --focus  (html) 0->1 as the hero scrolls away — drives the hero's
 *                   sharp->soft cross-fade, the background scale and the
 *                   scrim's deepening
 *   --exit   (hero) 0->1, published for any component whose content is
 *                   genuinely finished by then. The hero copy deliberately
 *                   does NOT consume it (see hero.module.css).
 *
 * THE SPAN IS THE HERO'S OWN HEIGHT, not a viewport. The reference maps
 * --focus over the first 85% of one viewport because its hero IS one
 * viewport. This hero is a band of natural height that runs about two
 * viewports on a phone, and mapping over a viewport would leave the
 * photograph fully defocused and the scrim at its deepest while half the copy
 * is still on screen. The height is read on mount and re-read only when the
 * viewport or the document height changes, so the per-frame path stays free
 * of layout reads it does not already make.
 *
 * `--focus` HAS ONE OTHER INPUT, and it is declared rather than smuggled in:
 * `setIntroFocus()` above lets the homepage intro drive the same property from
 * time instead of scroll for about three and a half seconds after a first
 * load. It is an
 * override read by this loop, not a second writer — see that function.
 *
 * `--focus` and `--exit` are never written under prefers-reduced-motion; the
 * CSS defaults (`var(--focus, 0)`) and the `reduce` block already put the
 * hero in its sharp, still, resting state.
 *
 * NULL-SAFE ON A PAGE WITH NO HERO. `app/not-found.tsx` renders no hero: the
 * element lookup returns null, --exit is never written, and --page still is.
 */
export function useScrollDriver(heroElementId = 'top'): void {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (writerClaimed) return;
    writerClaimed = true;

    const root = document.documentElement;
    const hero = document.getElementById(heroElementId);

    // Skip redundant writes — a style write on an unchanged value still costs
    // a style recalc.
    let lastPage = -1;
    let lastFocus = -1;
    let lastExit = -1;

    // Cached geometry. Recomputed only when the viewport or the document
    // height moves, which is where a hero's height can have changed too.
    let lastVh = -1;
    let lastDocH = -1;
    let span = 0;

    // Release must be able to force a write past the redundancy cache above.
    const invalidateFocus = (): void => {
      lastFocus = -1;
    };
    focusInvalidators.add(invalidateFocus);

    const unsubscribe = subscribeScroll(({ y, vh, docH }) => {
      if (vh !== lastVh || docH !== lastDocH) {
        lastVh = vh;
        lastDocH = docH;
        const heroH = hero === null ? 0 : hero.offsetHeight;
        span = Math.max(vh * 0.85, heroH * 0.75);
      }

      const page = docH > 0 ? clamp01(y / docH) : 0;
      if (page !== lastPage) {
        lastPage = page;
        root.style.setProperty('--page', page.toFixed(4));
      }

      // The intro's time-driven value wins over both the scroll mapping and
      // the `reduce` early-return. It is only ever non-null while the intro
      // is on screen, and the intro cannot start under `reduce` — the gate
      // script refuses — so in practice these two never meet. Ordering them
      // anyway means a preference toggled MID-INTRO ends with --focus at 0
      // rather than stuck at 1.
      if (focusOverride !== null) {
        if (focusOverride !== lastFocus) {
          lastFocus = focusOverride;
          root.style.setProperty('--focus', focusOverride.toFixed(4));
        }
      } else if (!reduced) {
        const focus = clamp01(span > 0 ? y / span : 1);
        if (focus !== lastFocus) {
          lastFocus = focus;
          root.style.setProperty('--focus', focus.toFixed(4));
        }
      }

      if (reduced) return;

      if (hero !== null) {
        const exit = clamp01((y - span * 0.55) / Math.max(1, vh * 0.5));
        if (exit !== lastExit) {
          lastExit = exit;
          hero.style.setProperty('--exit', exit.toFixed(4));
        }
      }
    });

    return () => {
      unsubscribe();
      focusInvalidators.delete(invalidateFocus);
      root.style.removeProperty('--page');
      root.style.removeProperty('--focus');
      hero?.style.removeProperty('--exit');
      writerClaimed = false;
    };
  }, [heroElementId, reduced]);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE NAV'S GROUND
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The two grounds the fixed nav is allowed to be on. Both are DECLARED — see
 * the header of components/site/nav.tsx for why swapping between two declared
 * grounds is not the runtime colour decision this system forbids.
 *
 *   'over'   the nav is still inside the ink hero and paints nothing of its
 *            own beyond its own legibility veil
 *   'paper'  the hero is behind us (or there was never one): the frosted bar
 */
export type NavGround = 'over' | 'paper';

/**
 * THE DEAD BAND, and why a bare threshold is a defect rather than a
 * simplification.
 *
 * `y > T` with no hysteresis flips on every frame in which y crosses T. A
 * trackpad resting on the boundary, a rubber-band overscroll on iOS and the
 * ±1px jitter of a momentum scroll all sit exactly there, and each flip is a
 * React render plus a 400ms background/backdrop-filter transition that
 * restarts mid-flight. The visible result is a bar that strobes.
 *
 * 24px is roughly one line of the nav's own type: large enough that no input
 * device lands inside it accidentally, small enough that a deliberate scroll
 * never feels like the bar is late. The band is applied on the way BACK only
 * (paper→over needs y < T - 24), so the bar arrives exactly at the threshold
 * and leaves a little after it — the asymmetry a reader reads as "it waited",
 * not as "it is wrong".
 */
const NAV_HYSTERESIS_PX = 24;

/**
 * Which ground the fixed nav is standing on, from the shared rAF loop. One
 * re-render per transition, two per full page scroll.
 *
 * THE THRESHOLD IS THE HERO'S BOTTOM EDGE MINUS THE NAV'S OWN HEIGHT, not a
 * constant. The reference (MAVTERRAS) uses a flat 70px because its nav goes
 * frosted almost immediately; here the ink hero runs 1.25–2.08 viewports and
 * the nav is legitimately over ink for all of it. The flip has to happen at
 * the moment the nav's bottom edge would leave the ink band, because that is
 * the moment its declared ground stops being true.
 *
 * BOTH MEASUREMENTS ARE CACHED, and re-taken only when the viewport or the
 * document height changes — the same invalidation `useScrollDriver` already
 * uses — plus a ResizeObserver on the nav itself, because a font swap or a
 * label change moves the nav's height without moving either. The per-frame
 * path is two number comparisons and no layout read.
 *
 * NO HERO ⇒ 'paper', ALWAYS. app/not-found.tsx and any future route without
 * an ink hero get the legible state, from the same code path rather than from
 * a route list somebody has to maintain. (nav.module.css asserts the same
 * thing structurally with `:has()`, so it also holds before this hook has
 * ever run — this is the belt to that file's braces, and the two cannot
 * disagree because both read the same fact: does the document contain
 * `#top[data-ground="ink"]`.)
 *
 * IT ALSO PUBLISHES `--nav-h` ON <html>. That is a second style writer, and
 * it is declared here rather than smuggled in: it writes ONE property, one
 * time per layout change (never per frame), and the property is the nav's own
 * measured height — the number `scroll-padding-block-start` needs so an
 * in-page anchor does not land underneath a fixed bar. Hard-coding it in CSS
 * would be a second source of truth for a height that four different type
 * settings can change.
 */
export function useNavGround(
  navRef: RefObject<HTMLElement | null>,
  heroElementId = 'top',
): NavGround {
  /*
    'over' IS THE SERVER SNAPSHOT and it must stay that way: it is the state
    nav.module.css paints with no JS at all, so hydrating into it means the
    attribute React writes on the first client render is identical to the one
    the server sent. The correction to 'paper' — on a 404, or on a reload that
    restored a deep scroll position — lands in the effect below, before paint.
  */
  const [ground, setGround] = useState<NavGround>('over');

  const geom = useRef({ vh: -1, docH: -1, navH: -1, threshold: 0 });

  const remeasure = (y: number): void => {
    const g = geom.current;
    const nav = navRef.current;
    const navH = nav === null ? 0 : Math.round(nav.getBoundingClientRect().height);
    if (navH !== g.navH) {
      g.navH = navH;
      document.documentElement.style.setProperty('--nav-h', `${navH}px`);
    }
    const hero = document.getElementById(heroElementId);
    // -Infinity means "already past it" for every finite y, which is exactly
    // the no-hero answer, and it needs no second branch below.
    g.threshold =
      hero === null ? Number.NEGATIVE_INFINITY : hero.getBoundingClientRect().bottom + y - navH;
  };

  useFrame(({ y, vh, docH }) => {
    const g = geom.current;
    if (vh !== g.vh || docH !== g.docH) {
      g.vh = vh;
      g.docH = docH;
      remeasure(y);
    }
    setGround((prev) =>
      prev === 'paper'
        ? y < g.threshold - NAV_HYSTERESIS_PX
          ? 'over'
          : 'paper'
        : y > g.threshold
          ? 'paper'
          : 'over',
    );
  });

  /*
    ONE effect owns the whole lifecycle of the cache and of `--nav-h`, and
    that is not tidiness — it is a bug fix.

    MEASURED 2026-09-03 in `next dev`: with the invalidation and the teardown
    in two effects, `--nav-h` was MISSING from <html> on every page. React
    StrictMode mounts, unmounts and remounts; the teardown removed the
    property, and on the remount the cache still held the height it had
    already published, so the frame callback's `navH !== g.navH` guard skipped
    the write and nothing ever put it back. A cache that survives its own
    cleanup is a cache that lies.

    So: reset the cache to its "never measured" state on BOTH edges, and poke
    one frame on the way in — `subscribeScroll` has already primed by the time
    this runs (useFrame's effect is declared above this one), so without the
    poke nothing would schedule a re-measure until the next real scroll.

    The ResizeObserver is here for the same cache: the nav's height is not a
    function of the viewport or the document height, so neither of the frame
    callback's invalidations catches a font swap landing 300ms after first
    paint. It is not a scroll listener — it observes one element's box — and
    it feeds the same cache rather than opening a second measurement path.
  */
  useEffect(() => {
    const g = geom.current;
    const invalidate = (): void => {
      g.vh = -1;
      g.docH = -1;
      g.navH = -1;
    };

    invalidate();
    pokeScroll();

    const nav = navRef.current;
    let observer: ResizeObserver | null = null;
    if (nav !== null && typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => {
        invalidate();
        pokeScroll();
      });
      observer.observe(nav);
    }

    return () => {
      observer?.disconnect();
      invalidate();
      document.documentElement.style.removeProperty('--nav-h');
    };
  }, [navRef]);

  return ground;
}

/**
 * Progress 0->1 as a tall element passes the viewport. Fires every frame; the
 * caller collapses it to whatever discrete state it needs.
 */
export function useTrackProgress(
  ref: RefObject<HTMLElement | null>,
  onProgress: (progress: number) => void,
): void {
  useFrame(({ vh }) => {
    const el = ref.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const total = rect.height - vh;
    if (total <= 0) return;
    onProgress(clamp01(-rect.top / total));
  });
}
