'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { setIntroFocus } from '@/hooks/use-scroll-driver';
import {
  INTRO_DISSOLVE_MS,
  INTRO_DISSOLVE_QUICK_MS,
  INTRO_FOCUS_HOLD,
  INTRO_POINTER_GUARD_MS,
  INTRO_FOCUS_MS,
  INTRO_LATE_MOUNT_MS,
  INTRO_REVEAL_MS,
  INTRO_SCROLL_TOLERANCE_PX,
  INTRO_STORAGE_KEY,
} from '@/lib/intro';

import styles from './intro.module.css';

import type { ReactNode } from 'react';

/**
 * The homepage intro overlay: the brand lockup drawing itself over the hero
 * photograph, softly out of focus, then resolving into the sharp photograph
 * and the live page.
 *
 * Ported from MAVTERRAS components/site/intro.tsx — its STRUCTURE, not its
 * medium. See lib/intro.ts for why an mp4 cannot satisfy this brief and what
 * that deletes.
 *
 * ── WHO DECIDES WHAT ──────────────────────────────────────────────────────
 *
 *   · The gate script in app/layout.tsx is the ONLY thing that can start an
 *     intro. It stamps html[data-intro="pending"] and holds `--focus` at
 *     INTRO_FOCUS_HOLD during HTML parsing, before paint. This component NEVER writes the
 *     attribute from nothing — it only ADVANCES it (pending → playing on
 *     hydration → done at the dissolve → removed when the overlay goes), so a
 *     soft navigation to "/" never plays and a repeat visit never flashes.
 *   · The SSR shell — veil, mark, Skip — is complete in the HTML, so a first
 *     visit has no gap between paint and hydration. It costs about a
 *     kilobyte, is display:none without the attribute, and downloads nothing.
 *   · Everything after that is one controller effect with ONE exit,
 *     finish(reason): every path — the reveal completing, Skip, a key, a
 *     restored scroll position, late hydration, a hidden tab, pagehide —
 *     funnels through it, so the dissolve runs once and sessionStorage is
 *     written once by construction.
 *   · UNMOUNT IS A CANCEL, NOT A FINISH. It stops the work and hands `--focus`
 *     back, but it does not mark the intro seen: React's dev strict-mode
 *     remount runs the same cleanup, and marking there would make the intro
 *     invisible in `next dev`.
 *
 * ── THE MARK IS A CHILD, NOT AN IMPORT ────────────────────────────────────
 *
 * The reveal is passed in as `children` from app/page.tsx. That is a
 * deliberate seam: the artwork, its markup and its keyframes belong to
 * whoever draws the lockup, and this file must not have an opinion about
 * their props or even their existence. What this file owns is the gate, the
 * ground, the timeline and the hand-off — the parts that are the same
 * whatever the mark turns out to be.
 *
 * The contract in the other direction is three things, all published rather
 * than passed: html[data-intro="playing"] is the "go" signal, `--intro-reveal`
 * is the wall-clock the draw must fit inside, and the ground's measured
 * contrast (intro.module.css, THE VEIL) is what the artwork's colours have to
 * clear.
 */

/**
 * `pending` is deliberately NOT a phase here: it is the gate's pre-hydration
 * value, and hydrating is what advances it to `playing` — which is also what
 * cancels the CSS failsafe keyed on it.
 */
type Phase = 'shell' | 'off' | 'playing' | 'done' | 'gone';

/**
 * Smoothstep. The overlay's opacity runs on --ease-brand in CSS; this drives
 * `--focus` from JS over a slightly longer window, and the two only have to
 * agree in FEEL, not in the exact curve — one is a fade of a veil, the other
 * is a photograph pulling into focus behind it. An eased ramp rather than a
 * linear one, because a linear defocus reads as a wipe.
 */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/** Keys that would scroll the page under an overlay that is holding it still. */
const SCROLL_KEYS = new Set([
  ' ',
  'PageDown',
  'PageUp',
  'Home',
  'End',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
]);

export function Intro({ children }: { children?: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('shell');
  const [quick, setQuick] = useState(false);
  /*
    Whether the dissolving overlay has stopped intercepting pointers. It is a
    separate flag from `phase` because the two happen at different times: the
    veil is still fading long after there is anything left to guard. See
    INTRO_POINTER_GUARD_MS for the measurement that separated them.
  */
  const [released, setReleased] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /*
    Read once. React's dev strict-mode remount clears attributes it does not
    manage from JSX off <html>; the decision the gate script made has to
    survive that.
  */
  const gateRef = useRef<boolean | null>(null);
  const finishRef = useRef<(reason: string, animate?: boolean) => void>(() => {});
  const goneRef = useRef<() => void>(() => {});

  /*
    BEFORE PAINT: read the gate's verdict, take over, and claim `--focus`.

    THE ORDER HERE IS LOAD-BEARING and it is guaranteed by React, not by luck.
    <ScrollDriver /> claims `--focus` in a passive effect (useEffect), and
    React runs EVERY layout effect in a commit before ANY passive effect. So
    this runs first regardless of where either component sits in the tree, and
    the driver's very first write is already the override's 1 rather than the
    scroll-derived 0. Without that, the hero would flick sharp for one frame
    at hydration — the exact flash the gate script exists to prevent.

    Off the play path the shell unmounts, leaving nothing in the a11y tree.
  */
  useLayoutEffect(() => {
    if (gateRef.current !== null) return;
    const playing = document.documentElement.getAttribute('data-intro') === 'pending';
    gateRef.current = playing;
    if (playing) setIntroFocus(INTRO_FOCUS_HOLD);
    setPhase(playing ? 'playing' : 'off');
  }, []);

  /*
    Mirror the phase onto <html>. This is also what re-applies the attribute
    after the dev remount resets it (a no-op in production), and what CSS keys
    the overlay's display, the dissolve, and the nav's and hero copy's
    visibility on.
  */
  useLayoutEffect(() => {
    const html = document.documentElement;
    if (phase === 'playing' || phase === 'done') html.setAttribute('data-intro', phase);
    else if (phase === 'gone') html.removeAttribute('data-intro');
  }, [phase]);

  useEffect(() => {
    if (gateRef.current !== true) return;
    const root = rootRef.current;
    if (root === null) return;

    let finished = false;
    let goneOnce = false;
    let rafHandle = 0;
    let focusReleased = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribers: Array<() => void> = [];

    const mountAt = performance.now();

    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const on = <E extends Event>(
      target: EventTarget,
      type: string,
      handler: (event: E) => void,
      options?: AddEventListenerOptions,
    ): void => {
      const listener = handler as (event: Event) => void;
      target.addEventListener(type, listener, options);
      unsubscribers.push(() => target.removeEventListener(type, listener, options));
    };

    const stop = (): void => {
      timers.forEach(clearTimeout);
      timers.clear();
      if (rafHandle !== 0) cancelAnimationFrame(rafHandle);
      rafHandle = 0;
      unsubscribers.forEach((fn) => fn());
      unsubscribers.length = 0;
    };

    /*
      Hand `--focus` back to the scroll driver. Idempotent, and called from
      exactly three places: the end of the ramp, the first real input during
      the ramp's tail, and unmount. The driver re-publishes the scroll-derived
      value on release (see setIntroFocus), so there is no jump — at the top
      of the page that value is 0, which is where the ramp was heading anyway.
    */
    const releaseFocus = (): void => {
      if (focusReleased) return;
      focusReleased = true;
      setIntroFocus(null);
    };

    /*
      Cancel, not finish: stop the work and hand everything back WITHOUT
      marking the intro seen. This is the unmount path and the early-exit
      cleanup, and it is the one place a strict-mode dev remount lands.
    */
    const cancel = (): void => {
      stop();
      releaseFocus();
      document.documentElement.removeAttribute('data-intro');
    };


    /*
      The photograph resolving from blur to sharp. This IS the transition into
      the page — there is no second layer and no filter; it is the hero's own
      cross-fade, driven by time instead of scroll.

      It runs a beat longer than the overlay's fade on purpose, so the last
      thing the visitor sees is the picture finishing its resolve on a page
      that is otherwise already live. Any real input during that tail abandons
      it immediately: a visitor who has started scrolling has stopped watching
      the intro, and `--focus` belongs to the scroll driver from that moment.
    */
    const resolvePhoto = (): void => {
      const startedAt = performance.now();
      const step = (): void => {
        const t = Math.min(1, (performance.now() - startedAt) / INTRO_FOCUS_MS);
        /* From the HELD softness, not from 1 — the ramp's job is to finish
           the resolve the gate started, and starting it above where the
           picture already sits would snap the photograph blurrier for one
           frame at the exact moment it is meant to come into focus. */
        setIntroFocus(INTRO_FOCUS_HOLD * (1 - ease(t)));
        if (t < 1) {
          rafHandle = requestAnimationFrame(step);
          return;
        }
        rafHandle = 0;
        releaseFocus();
      };
      rafHandle = requestAnimationFrame(step);

      const abort = (): void => {
        if (rafHandle !== 0) cancelAnimationFrame(rafHandle);
        rafHandle = 0;
        releaseFocus();
      };
      const once: AddEventListenerOptions = { once: true, passive: true };
      on(window, 'wheel', abort, once);
      on(window, 'touchstart', abort, once);
      on(window, 'keydown', abort, once);
    };

    const gone = (): void => {
      if (goneOnce) return;
      goneOnce = true;
      /*
        Imperative as well as via the phase effect: pagehide and a bfcache
        freeze do not wait for React to flush, and while the attribute is
        stamped the nav and the hero copy are held at opacity 0 site-wide.
      */
      document.documentElement.removeAttribute('data-intro');
      setPhase('gone');
    };
    goneRef.current = gone;

    const finish = (reason: string, animate = true): void => {
      if (finished) return;
      finished = true;
      stop();
      /*
        FOCUS HAS TO GO SOMEWHERE SENSIBLE. If the visitor tabbed to Skip and
        pressed it, the button is about to be removed from the DOM; blurring
        it first drops focus to the document body, so the next Tab starts from
        the top and lands on "Skip to content" — the correct first stop on a
        page that has just become readable. Focus is NOT moved anywhere when
        it was never inside the overlay, which is the common case: the intro
        does not steal it on the way in, so it must not place it on the way
        out.
      */
      const active = document.activeElement;
      if (active instanceof HTMLElement && root.contains(active)) active.blur();
      try {
        sessionStorage.setItem(INTRO_STORAGE_KEY, '1');
      } catch {
        // Storage blocked: the gate will simply decide again next time.
      }
      performance.mark('intro:dissolve', { detail: { reason } });

      if (!animate) {
        releaseFocus();
        gone();
        return;
      }

      resolvePhoto();
      setQuick(reason.startsWith('skip'));
      setPhase('done');
      /*
        Stop swallowing clicks once the guard window is over, rather than at
        unmount. Uses the same `later` as every other timer here, so a cancel
        clears it along with the rest.
      */
      later(() => setReleased(true), INTRO_POINTER_GUARD_MS);
      // transitionend is the primary trigger (onTransitionEnd below); this is
      // the fallback for an engine that never fires it on a fixed layer.
      later(gone, (reason.startsWith('skip') ? INTRO_DISSOLVE_QUICK_MS : INTRO_DISSOLVE_MS) + 200);
    };
    finishRef.current = finish;

    /* ── Exits that need no animation at all ───────────────────────────── */

    if (document.visibilityState === 'hidden') {
      finish('hidden-at-mount', false);
      return cancel;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish('reduced-motion', false);
      return cancel;
    }
    /*
      A reload that restored a deep scroll position. Scroll restoration lands
      after the gate script has already stamped the document, so this is the
      first moment the answer is knowable — and an overlay over the middle of
      the page is not a brand moment, it is an obstruction.
    */
    if (window.scrollY > INTRO_SCROLL_TOLERANCE_PX) {
      finish('restored-scroll', false);
      return cancel;
    }
    /*
      Hydration arrived too late to be worth it. The visitor has been looking
      at a soft photograph for nearly three seconds; starting a 2.6 s reveal now
      punishes them for a slow device.
    */
    if (mountAt > INTRO_LATE_MOUNT_MS) {
      finish('late-mount', false);
      return cancel;
    }

    /* ── Live ─────────────────────────────────────────────────────────── */

    on(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') finish('hidden', false);
    });
    // Written before a reload or a close, so a reload mid-intro does not replay.
    on(window, 'pagehide', () => finish('pagehide', false));

    on(document, 'keydown', (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        /*
          Always preventDefault, Enter included. The page beneath stays in the
          tab order (this is a region, not a focus trap), so Tab from Skip can
          land on a link under the veil; without this, Enter there would skip
          AND follow the link mid-dissolve — the keyboard twin of the
          double-tap the pointer-events note in intro.module.css guards
          against. Skip's own Enter is covered: finish() is the click's whole
          effect.
        */
        event.preventDefault();
        finish('skip-key');
        return;
      }
      if (SCROLL_KEYS.has(event.key)) event.preventDefault();
    });

    /*
      Hold the page still WITHOUT touching layout. The reference locks
      `overflow: hidden` on the root and the body; that removes the desktop
      scrollbar, reflows the document by its width, and hides the reflow under
      an opaque overlay. This overlay is see-through by requirement, so the
      same trick would be visible layout shift on the one screen whose CLS
      must be 0. preventDefault on a non-passive wheel/touchmove costs no
      layout at all.
    */
    on(root, 'wheel', (event: WheelEvent) => event.preventDefault(), { passive: false });
    on(root, 'touchmove', (event: TouchEvent) => event.preventDefault(), { passive: false });

    later(() => finish('complete'), INTRO_REVEAL_MS);

    /*
      Unmount is a cancel: stop the work, hand `--focus` back, and un-stamp
      <html> — a soft navigation away mid-intro must not leave the nav hidden
      on the next route. (React's dev remount re-runs the phase effect, which
      re-stamps it.) No storage write; see the header.
    */
    return cancel;
  }, []);

  if (phase === 'off' || phase === 'gone') return null;

  const className = [
    styles.overlay,
    phase === 'done' ? styles.done : '',
    quick ? styles.quick : '',
    released ? styles.released : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    /*
      A plain region, not a dialog: no focus trap, nothing announced, the whole
      page stays in the accessibility tree beneath it. Skip is the only
      focusable descendant and it is NOT auto-focused — a first Tab should
      still reach "Skip to content", which is what a keyboard visitor is
      actually looking for.

      data-ground="ink" is what resolves --ground, --fg, --fg-muted and --edge
      for the veil and the Skip control. The reveal inherits it, which is how
      the artwork gets ground-correct colours without naming one.
    */
    <div
      ref={rootRef}
      className={className}
      role="region"
      aria-label="Introduction"
      /*
        Two ways to find this element, on purpose. `role="region"` with an
        accessible name is the affordance the overlay should have anyway;
        `data-intro-overlay` is the explicit hook, so a test that asserts the
        requirement is not also asserting an aria-label's wording. Same for
        the Skip control below.
      */
      data-intro-overlay=""
      data-ground="ink"
      onClick={() => finishRef.current('skip-click')}
      onTransitionEnd={(event) => {
        if (event.target === rootRef.current && event.propertyName === 'opacity') goneRef.current();
      }}
    >
      <div className={styles.stage}>
        <div className={styles.mark}>{children}</div>
      </div>
      {/*
        HIDDEN MEANS INERT, NOT MERELY TRANSPARENT. At `done` the Skip control
        is removed from the DOM rather than faded with the rest: an
        opacity-0 button is still in the tab order and still hit-testable, and
        the overlay deliberately keeps its pointer-events for the whole
        dissolve. Removing it leaves nothing focusable behind while the veil
        still swallows the impatient second tap.
      */}
      {phase !== 'done' && (
        <div className={styles.bar}>
          <button
            type="button"
            // WebKit tab-order opt-in, the same as every other button here.
            tabIndex={0}
            className={styles.skip}
            aria-label="Skip introduction"
            data-intro-skip=""
            onClick={() => finishRef.current('skip-button')}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
