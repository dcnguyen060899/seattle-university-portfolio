'use client';

/**
 * components/site/hero-motion.tsx — the controller for the hero's living
 * background: the gate, the mount, the two-copy loop, pause/resume and the
 * still fallback. Rendered by hero.tsx inside `.bg`, AFTER the sharp layer.
 *
 * ── WHAT IT RENDERS, AND WHEN ──────────────────────────────────────────────
 *
 * Nothing on the server and nothing on the first client render. The markup —
 * a root, a <style>, two feathered boxes each holding a <video> — appears only
 * after every condition of the gate below has held, and it goes away again
 * (with both decoders released) when the media query stops matching, when the
 * tab has been hidden for a minute, or, terminally for this page life, when
 * playback is refused or the stream errors. Every structural gate that reads
 * the built HTML or counts <img> therefore sees an unchanged tree, and with
 * lib/hero-motion.ts's flag off the DOM is byte-identical to a page without
 * this file.
 *
 * ── THE GATE, IN ORDER — any failure is no mount and no request ────────────
 *
 *   1. a config exists: the manifest's (server prop), or, under webdriver +
 *      the force key only, the sessionStorage override (see lib/hero-motion.ts)
 *   2. HERO_MOTION_ENABLED, or webdriver + force; never webdriver alone;
 *      never with the owner's off key
 *   3. matchMedia(MOTION_MEDIA) — desktop, fine pointer, no motion preference;
 *      a `change` to false unmounts, a change back re-runs the gate
 *   4. not Save-Data, not a 2G-class connection
 *   5. document loaded and visible
 *   6. THE DOOR — a race of three, and the whole of the entrance work:
 *      · EARLY: html[data-intro] has reached `playing` (or `done`), so the
 *        overlay really mounted rather than yielding; the sharp <img> is
 *        ALREADY decoded, tested not awaited; and the clip's box covers the
 *        viewport. Then the layer mounts BEHIND the overlay, its fade finishes
 *        while the picture is still held soft, and the intro's own `--focus`
 *        ramp resolves the reader onto a picture that is already moving. No
 *        `load`, no settle, no idle callback, no quiet window: the intro
 *        playing at all is the evidence those waits were waiting for.
 *      · RETURN: the intro's own seen flag is set, so this tab has already
 *        rendered this page and the reader is looking at a REFRESH — the case
 *        the owner named. There is no overlay to arrive behind and none is
 *        coming, and every wait the late door performs was a wait for a page
 *        that has already been here. `load`, and then the same two reads as the
 *        early door. See `whenReturning`.
 *      · LATE: `load`, then html[data-intro] gone (MutationObserver; bounded by
 *        the intro's own dead-man switch), then MOTION_SETTLE_MS elapsed AND an
 *        idle callback fired — both.
 *      A first visit whose intro yielded (slow hydration —
 *      INTRO_LATE_MOUNT_MS), a page whose storage is locked and a
 *      reduced-motion intro all take the late door without being asked to:
 *      neither of the other two doors' preconditions is met. That is why there
 *      is no bandwidth guess anywhere in this file.
 *   7. the sharp <img> has decoded: the clip may never precede the picture it
 *      registers to (required at the door on the early path, awaited on the
 *      late one)
 *   8. LCP is out of the way — the LATE door only. Two ways to be: EITHER the
 *      first scroll / pointerdown / keydown (Chrome finalises LCP at it), OR —
 *      the auto-start, since 2026-09-07 — the LCP observer quiet for
 *      MOTION_LCP_QUIET_MS AND the clip's box covering every pixel of the
 *      viewport, which is a paint Chrome does not make an LCP candidate at all
 *      (measured; the argument and the numbers are in lib/hero-motion.ts's
 *      header). Whichever comes first. No input is required; where the
 *      geometry cannot promise coverage, one still is. The early door keeps the
 *      coverage test and drops the quiet window, because a paint that lands
 *      BEFORE the current largest one cannot take the metric — it can only
 *      lower it.
 *
 * ── WHAT IT NEVER DOES ─────────────────────────────────────────────────────
 *
 * It never writes a custom property on <html>: hooks/use-scroll-driver.ts is
 * the only writer of --focus/--exit/--page and this layer CONSUMES --focus in
 * CSS (`[data-clips]{opacity:calc(1 - var(--focus))}`) — same law, same
 * property, same element as `.sharp`. It never reads scroll position: pausing
 * comes from IntersectionObserver. It never adds a scroll listener beyond the
 * one-shot `once` wait for the first input, which is not a scroll VALUE
 * consumer and is now an accelerator rather than a requirement.
 * It never touches the intro: `data-intro` is observed, not written. And it
 * never refers to Date.now()/performance.now(): the loop is scheduled by
 * MEDIA time, so a tab suspend leaves nothing to reconcile.
 *
 * ── THE LOOP: two stacked <video>, no baked loop ───────────────────────────
 *
 * Roles: ACTIVE (playing, opacity 1) and STANDBY (paused at 0, preloaded,
 * opacity 0). At D − X of media time the standby starts and dissolves in
 * ABOVE the active over X media-seconds — opacity = smoothstep(t / X) on the
 * incoming only; the outgoing stays at 1, so source-over gives
 * incoming·α + outgoing·(1 − α): the still never bleeds through and nothing
 * double-exposes. At t ≥ X the roles swap, the outgoing pauses and seeks to 0
 * (Range is honoured, and the whole clip is buffered by then). The wake-up is
 * a setTimeout alarm PLUS a 4 Hz `timeupdate` backstop, so a throttled timer
 * delays a handoff by ≤250 ms and cannot skip it; and `loop` stays on each
 * element as the missed-handoff fallback — one hard cut beats a frozen frame.
 *
 * ── OR ONE <video> THAT PLAYS ONCE AND HOLDS: `config.loop === false` ───────
 *
 * A clip whose light goes one way — a descent into night — has no seam to
 * dissolve, because its last frame is nowhere near its first. Everything above
 * is therefore switched OFF by the manifest, not by a guess: one <video>, no
 * standby, no dissolve, no alarm, no media-time bookkeeping at all, and — the
 * one that matters — **the element's own `loop` attribute is off**. That
 * attribute is the missed-handoff fallback for a real loop; on a one-way clip
 * it is the fault, wrapping the picture back to sunset behind the layer's back.
 * The clip plays through once and the element holds its last frame for the rest
 * of the page's life.
 *
 * Two consequences, both deliberate. `play()` on an ENDED element seeks it to 0
 * and plays it again, so every resume path checks `ended` first — a tab flip
 * must not restart the descent. And the hidden-tab unmount does not apply:
 * MOTION_HIDDEN_UNMOUNT_MS's own comment carries the argument.
 *
 * ── OR ONCE, AND THEN THE NIGHT FOR EVER: `loop: false` + `loopFrom` ────────
 *
 * The third shape, and the owner's own description of it: the lapse plays once,
 * and after it gets dark the picture must not stop and must not go back to the
 * sunset — it keeps moving until the reader refreshes. So the clip runs 0 → D
 * once and then loops [loopFrom, D] for ever.
 *
 * IT IS THE SAME HANDOFF, NOT A SECOND MECHANISM. Two copies, the alarm and the
 * `timeupdate` backstop, the media-time dissolve, the role swap — every line of
 * it is the loop's, with exactly two numbers changed: the incoming copy is
 * seeded at `loopFrom` instead of 0, and the outgoing rewinds to `loopFrom`
 * instead of 0 (so it is already parked where it next enters, and a seek at the
 * handoff is a no-op). The dissolve's own clock is the incoming copy's time
 * SINCE IT ENTERED — `currentTime - incomingFrom` — because at a tail its
 * currentTime is 25-odd seconds, and dividing that by the crossfade would put
 * the incoming at opacity 1 on its first frame, which is a cut.
 *
 * AND THE ELEMENT'S OWN `loop` ATTRIBUTE STAYS OFF. On a real loop it is the
 * missed-handoff fallback — one hard cut beats a frozen frame. Here it would
 * wrap to frame 0, which is the sunset, which is the one thing the owner asked
 * to never see again; a fallback that performs the fault is not a fallback. The
 * fallback for a tail is the `ended` handler below: if the handoff is somehow
 * missed, the copy that ran off the end re-enters the TAIL with one hard cut.
 * Same principle, same cost, and it can only ever land in the night.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  HERO_MOTION_ENABLED,
  HERO_MOTION_STYLE,
  MOTION_CROSS_S,
  MOTION_FADE_IN_MS,
  MOTION_FIRST_INPUT_EVENTS,
  MOTION_FORCE_KEY,
  MOTION_HIDDEN_UNMOUNT_MS,
  MOTION_IDLE_TIMEOUT_MS,
  MOTION_LCP_QUIET_MS,
  MOTION_MEDIA,
  MOTION_OFF_KEY,
  MOTION_OVERRIDE_KEY,
  MOTION_PAUSE_BELOW_RATIO,
  MOTION_SETTLE_MS,
  MOTION_SLOW_CONNECTIONS,
  MOTION_STALL_MS,
  MOTION_TAIL_MIN_S,
  motionFadeMsForFocus,
  motionNeedsFeather,
  parseHeroMotion,
} from '@/lib/hero-motion';
import type { HeroMotion } from '@/lib/hero-motion';
import { INTRO_DISSOLVE_MS, INTRO_FAILSAFE_MS, INTRO_STORAGE_KEY } from '@/lib/intro';

/**
 * idle     nothing rendered; the gate may be running
 * gated    the markup is rendered and the active copy is loading
 * playing  the first frame has presented; `data-on` is set and the fade-in runs
 * still    terminal for this page life: playback was refused or the stream
 *          errored; nothing rendered, no retry
 */
type Phase = 'idle' | 'gated' | 'playing' | 'still';

interface Props {
  /** The manifest's validated config, or null when the repo ships no clip. */
  motion: HeroMotion | null;
}

/* ── small helpers, none of them touching module scope ─────────────────── */

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The sharp <img> — hero.tsx renders the soft copy's <picture> first and the
 * sharp one second, so it is the band's second <img>. Found structurally, the
 * way scripts/check-hero-blend.mjs finds the frame, because CSS-module class
 * names are hashed and this file must not know hero.module.css's.
 */
function findSharpImg(): HTMLImageElement | null {
  const band = document.getElementById('top');
  if (band === null) return null;
  const imgs = band.querySelectorAll('img');
  return imgs.length >= 2 ? (imgs[1] ?? null) : null;
}

/**
 * WOULD THE CLIP PAINT OVER EVERY PIXEL OF THE VIEWPORT? This is the whole
 * licence for starting without an input: Chrome does not make a paint that
 * covers the entire viewport a largest-contentful-paint candidate, and a 1 px
 * strip of anything else is enough to put it back in the running (both
 * measured — lib/hero-motion.ts's header). Two conditions, both read rather
 * than assumed:
 *
 *   · The clip is registered to the WHOLE still (crop 0, 0, 1, 1). Then the
 *     `cover` arithmetic in HERO_MOTION_STYLE puts the clip's box over every
 *     pixel of the layer's root, exactly as `object-fit: cover` does for the
 *     still. A cropped registration leaves a still-only strip somewhere and
 *     this returns false.
 *   · The root's own box covers the viewport. The root is `inset: 0` in `.bg`
 *     and so is the sharp <img>, so the img's border box IS the root's box —
 *     measured on the element that owns it, never retyped from
 *     hero.module.css, the same way `--m-px`/`--m-py` are. A page restored
 *     mid-scroll fails here, which is right: there the hero is no longer the
 *     whole viewport.
 *
 * Strict comparisons, no tolerance: a false negative costs this reader the
 * auto-start and nothing else (the first input still starts the layer), while
 * a false positive costs the page its LCP.
 *
 * The one gap left open, honestly: the check is made before the clip loads, so
 * a window resize between it and the first presented frame could invalidate
 * it. A resize is not an input, so LCP would still be live. It is a fraction
 * of a second of exposure for a reader who is resizing rather than reading,
 * and closing it would mean re-checking at a moment when the frame has already
 * presented — which is too late to matter.
 */
function clipCoversViewport(config: HeroMotion): boolean {
  const { x, y, w, h } = config.crop;
  if (x > 0 || y > 0 || w < 1 || h < 1) return false;
  const img = findSharpImg();
  if (img === null) return false;
  const box = img.getBoundingClientRect();
  return (
    box.left <= 0 &&
    box.top <= 0 &&
    box.right >= window.innerWidth &&
    box.bottom >= window.innerHeight
  );
}

/**
 * The hero's picture is ALREADY here — not "will be": no await, no decode()
 * promise. The early door asks this rather than waiting on it, because the
 * question it is really asking is "are the hero's own bytes off the wire?",
 * and a reader whose photograph has not arrived yet must not have a clip
 * fetched over the top of it.
 */
function sharpDecodedNow(): boolean {
  const img = findSharpImg();
  return img !== null && img.complete && img.naturalWidth > 0;
}

/**
 * `--focus` right now, as the layer's own CSS reads it: 0 is the sharp
 * photograph, INTRO_FOCUS_HOLD is the intro holding it soft. Read off <html>,
 * which is where both the intro and hooks/use-scroll-driver.ts publish it, and
 * never written here.
 */
function currentFocus(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--focus').trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** `'50% 40%'` → `[0.5, 0.4]`; anything else → centre. */
function parseObjectPosition(value: string): [number, number] {
  const m = /^\s*([0-9.]+)%\s+([0-9.]+)%\s*$/.exec(value);
  if (m === null) return [0.5, 0.5];
  const px = Number.parseFloat(m[1] ?? '');
  const py = Number.parseFloat(m[2] ?? '');
  return [Number.isFinite(px) ? px / 100 : 0.5, Number.isFinite(py) ? py / 100 : 0.5];
}

/**
 * Does this TimeRanges actually hold second `t`? The standby's park-seek asks,
 * because seeking a second decoder into bytes the first has not fetched yet
 * costs a range request, and Chromium abandons the in-flight whole-file
 * response to serve it — which throws away the clip's entire HTTP cache entry.
 * A small margin, so the seek lands inside a range rather than on its edge.
 */
function covers(ranges: TimeRanges, t: number): boolean {
  for (let i = 0; i < ranges.length; i += 1) {
    if (ranges.start(i) <= t && t + 0.25 <= ranges.end(i)) return true;
  }
  return false;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

function connectionRefuses(): boolean {
  const conn = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  if (conn === undefined) return false;
  if (conn.saveData === true) return true;
  return MOTION_SLOW_CONNECTIONS.includes(conn.effectiveType ?? '4g');
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

/** Resolves once the element has PRESENTED a frame — rVFC where it exists, else `playing` + one rAF. */
function whenPresented(video: HTMLVideoElement, listen: Listen): Promise<void> {
  const v = video as VideoWithFrameCallback;
  if (typeof v.requestVideoFrameCallback === 'function') {
    return new Promise((resolve) => {
      v.requestVideoFrameCallback(() => resolve());
    });
  }
  return new Promise((resolve) => {
    const after = (): void => {
      requestAnimationFrame(() => resolve());
    };
    if (!video.paused && video.readyState >= 2) after();
    else listen(video, 'playing', after, { once: true });
  });
}

type Listen = (
  target: EventTarget,
  type: string,
  handler: (event: Event) => void,
  options?: AddEventListenerOptions,
) => void;

/* ══════════════════════════════════════════════════════════════════════════
   The component
   ══════════════════════════════════════════════════════════════════════════ */

export function HeroMotionLayer({ motion }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [config, setConfig] = useState<HeroMotion | null>(null);
  /** Bumped to re-run the gate (media query back to matching; unmounted after a long hide). */
  const [generation, setGeneration] = useState(0);
  /**
   * The fade-in the layer will actually perform, chosen at the moment the first
   * frame presents from what the reader can see then (lib/hero-motion.ts's
   * `motionFadeMsForFocus`). It starts at the long one so that a layer which
   * never reaches that moment cannot be left holding a short dissolve.
   */
  const [fadeMs, setFadeMs] = useState<number>(MOTION_FADE_IN_MS);

  const rootRef = useRef<HTMLDivElement>(null);
  const boxARef = useRef<HTMLDivElement>(null);
  const boxBRef = useRef<HTMLDivElement>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  /** True once the still fallback has fired: no retry in this page life. */
  const terminalRef = useRef(false);

  /* ── THE GATE ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (terminalRef.current) return;

    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const listen: Listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    };
    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(fn, ms);
      cleanups.push(() => clearTimeout(id));
    };
    const after = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        later(resolve, ms);
      });

    const whenLoaded = (): Promise<void> =>
      new Promise((resolve) => {
        if (document.readyState === 'complete') resolve();
        else listen(window, 'load', () => resolve(), { once: true });
      });

    const whenVisible = (): Promise<void> =>
      new Promise((resolve) => {
        if (document.visibilityState === 'visible') {
          resolve();
          return;
        }
        const check = (): void => {
          if (document.visibilityState === 'visible') resolve();
        };
        listen(document, 'visibilitychange', check);
      });

    /*
      The intro's attribute ladder is pending → playing → done → removed, and
      the gate script's dead-man removes a stuck `pending` at INTRO_FAILSAFE_MS.
      Observed, never written. The timeout below is belt and braces over that
      guarantee: past the failsafe plus one dissolve, nothing legitimate can
      still be holding the attribute.
    */
    const whenIntroGone = (): Promise<void> =>
      new Promise((resolve) => {
        const html = document.documentElement;
        if (!html.hasAttribute('data-intro')) {
          resolve();
          return;
        }
        const observer = new MutationObserver(() => {
          if (!html.hasAttribute('data-intro')) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(html, { attributes: true, attributeFilter: ['data-intro'] });
        cleanups.push(() => observer.disconnect());
        later(() => {
          observer.disconnect();
          resolve();
        }, INTRO_FAILSAFE_MS + INTRO_DISSOLVE_MS + 1000);
      });

    /*
      THE EARLY DOOR'S EVIDENCE, and it is the only new condition in this gate.

      The attribute ladder is pending → playing → done → removed. `pending` is
      stamped by the inline gate script before first paint and proves nothing:
      the dead-man removes it if the overlay never arrives. `playing` is written
      by the overlay itself, in a layout effect, once it has mounted and taken
      the reveal — so it is proof that hydration beat INTRO_LATE_MOUNT_MS on
      THIS device over THIS link, which is exactly the page-is-healthy signal
      `load`, the settle and the idle callback were each approximating. `done`
      counts too: the dissolve has started but the picture is still soft.

      If the attribute is absent (a repeat visit, reduced motion, an intro that
      never ran) or leaves without ever reaching `playing` (slow hydration),
      this NEVER RESOLVES, and the late door wins the race untouched. That is
      the whole self-calibration: no connection sniffing, no timing guess.
    */
    const whenIntroPlaying = (): Promise<void> =>
      new Promise((resolve) => {
        const html = document.documentElement;
        const playing = (): boolean => {
          const value = html.getAttribute('data-intro');
          return value === 'playing' || value === 'done';
        };
        if (playing()) {
          resolve();
          return;
        }
        if (!html.hasAttribute('data-intro')) return;
        const observer = new MutationObserver(() => {
          if (playing()) {
            observer.disconnect();
            resolve();
          } else if (!html.hasAttribute('data-intro')) {
            observer.disconnect();
          }
        });
        observer.observe(html, { attributes: true, attributeFilter: ['data-intro'] });
        cleanups.push(() => observer.disconnect());
      });

    /*
      THE RETURN DOOR'S EVIDENCE — and it is the intro's own seen flag, read and
      never written.

      The owner watched a refresh and said the page must go "smoothly straight
      in the animation, don't just static background then wait couple second".
      MEASURED on the production build before this door existed (:3100, headless
      Chromium 151, 1280x800, second document in one context): the layer mounted
      at 2117 ms and presented its first frame at 2197, on a page whose own load
      event fired at 37 ms. Two seconds of a still picture, and then a three
      second dissolve. The binding constraint was not the settle (which ended at
      ~1530) but MOTION_LCP_QUIET_MS: the lede's paint landed at 900 ms and the
      quiet window ran to 2100.

      Every one of those waits is a wait for the page to arrive. On a repeat
      visit it has already arrived — and the evidence is exactly the flag that
      SUPPRESSED the intro, which is why the early door is shut here at all:
      `duyng.intro.seen` means this tab has rendered this page to completion
      before. The bytes are in the HTTP cache, the clip included — MEASURED
      through CDP on the same build: on the second document the clip's own
      response comes back `fromDiskCache: true`, 0 bytes on the wire (the still
      revalidates for 244), because next.config.ts serves the hashed clip
      `immutable`. So the quiet window's own stated job — keeping megabytes off
      the wire while the page is still landing big paints — is void here.

      WHAT IS NOT RELAXED: `load` still has to have fired, the sharp <img> must
      already be decoded, and the clip's box must still cover the viewport, so
      the LCP contract is the same contract (and a clip that presents BEFORE the
      current largest paint can only lower LCP anyway — lib/hero-motion.ts's
      header). A cold first visit never opens this door: the flag is unset, and
      it stays unset for a spec that never forces an intro, which is why
      "does not mount before the page has settled" still holds unchanged.
    */
    const whenReturning = (): Promise<void> =>
      new Promise((resolve) => {
        if (document.documentElement.hasAttribute('data-intro')) return;
        const seen = readSession(INTRO_STORAGE_KEY);
        if (seen === null || seen === '') return;
        void whenLoaded().then(resolve);
      });

    const whenIdle = (): Promise<void> =>
      new Promise((resolve) => {
        const ric = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
          .requestIdleCallback;
        if (typeof ric === 'function') {
          const id = ric(() => resolve(), { timeout: MOTION_IDLE_TIMEOUT_MS });
          cleanups.push(() => cancelIdleCallback(id));
        } else {
          later(resolve, MOTION_IDLE_TIMEOUT_MS);
        }
      });

    const whenSharpDecoded = async (): Promise<boolean> => {
      const img = findSharpImg();
      if (img === null) return false;
      if (img.complete && img.naturalWidth > 0) return true;
      try {
        await img.decode();
        return img.naturalWidth > 0;
      } catch {
        return false;
      }
    };

    const whenFirstInput = (): Promise<void> =>
      new Promise((resolve) => {
        const fire = (): void => resolve();
        for (const type of MOTION_FIRST_INPUT_EVENTS) {
          listen(type === 'scroll' ? window : document, type, fire, { once: true, passive: true });
        }
      });

    /**
     * The auto-start's other half: no new largest-contentful-paint entry for
     * MOTION_LCP_QUIET_MS. Every entry RE-ARMS the timer, so this is "the page
     * has stopped landing big paints", not a fixed delay, and `buffered: true`
     * means the entries that landed before the observer existed re-arm it too.
     * Started (not awaited) before the gate waits on anything timed, so the
     * window overlaps MOTION_SETTLE_MS instead of following it. Where the entry
     * type is unsupported it resolves on the first arm: only Chrome reports LCP
     * at all, and the coverage test is what protects the metric anyway.
     */
    const whenLcpQuiet = (): Promise<void> =>
      new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let observer: PerformanceObserver | null = null;
        const stop = (): void => {
          if (timer !== null) clearTimeout(timer);
          timer = null;
          if (observer !== null) observer.disconnect();
          observer = null;
        };
        const arm = (): void => {
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(() => {
            stop();
            resolve();
          }, MOTION_LCP_QUIET_MS);
        };
        cleanups.push(stop);
        try {
          observer = new PerformanceObserver(arm);
          observer.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch {
          /* an engine without the entry type: there is nothing to be quiet about */
        }
        arm();
      });

    const run = async (): Promise<void> => {
      // 1 — a config, from the manifest or (webdriver + force only) the override.
      //     The override WINS where it exists, rather than only filling a gap:
      //     a spec has to be able to describe a clip the installed manifest does
      //     not — a one-shot registration, a cropped one — and the two keys it
      //     needs are already the two the layer refuses automation without.
      //     Malformed JSON leaves it null and the layer does not exist, which is
      //     the still hero: failing closed, as everywhere else in this gate.
      const forced = navigator.webdriver === true && readSession(MOTION_FORCE_KEY) === '1';
      let candidate = motion;
      if (forced) {
        const raw = readSession(MOTION_OVERRIDE_KEY);
        if (raw !== null) {
          try {
            candidate = parseHeroMotion(JSON.parse(raw));
          } catch {
            candidate = null;
          }
        }
      }
      if (candidate === null) return;

      // 2 — the flag, the automation refusal, the owner's off switch.
      if (!HERO_MOTION_ENABLED && !forced) return;
      if (navigator.webdriver === true && !forced) return;
      if (readSession(MOTION_OFF_KEY) === '1') return;

      // 3 — the media query, live.
      if (typeof window.matchMedia !== 'function') return;
      const mql = window.matchMedia(MOTION_MEDIA);
      listen(mql, 'change', () => {
        if (mql.matches) setGeneration((g) => g + 1);
        else setPhase('idle');
      });
      if (!mql.matches) return;

      // 4 — the connection.
      if (connectionRefuses()) return;

      // The LCP watch starts HERE, before the gate waits on anything timed, so
      // its quiet window runs alongside the settle rather than after it.
      const lcpQuiet = whenLcpQuiet();

      // 5 — visible. `load` is the LATE door's condition and lives inside it:
      //     the early door's evidence that the page has arrived is the intro.
      await whenVisible();
      if (cancelled) return;

      // 6 — THE DOOR. Both are started now and raced; the late one keeps
      //     running under the early one, so a failed early check falls back to
      //     it without restarting anything.
      const lateDoor = (async (): Promise<void> => {
        await whenLoaded();
        await whenIntroGone();
        await Promise.all([after(MOTION_SETTLE_MS), whenIdle()]);
      })();
      const door = await Promise.race([
        whenIntroPlaying().then(() => 'early' as const),
        whenReturning().then(() => 'return' as const),
        lateDoor.then(() => 'late' as const),
      ]);
      if (cancelled) return;

      // 7/8, the two fast doors — both conditions are read, not awaited. The
      //      picture must already be here, and the clip's box must cover the
      //      viewport. Coverage is kept as the contract it always was, though
      //      on these doors it is no longer what protects the metric: a paint
      //      that lands before the current largest one cannot replace its time.
      if (door !== 'late' && sharpDecodedNow() && clipCoversViewport(candidate)) {
        setConfig(candidate);
        setPhase('gated');
        return;
      }

      // 7 — the late door: the picture the clip registers to has decoded.
      await lateDoor;
      if (cancelled) return;
      const decoded = await whenSharpDecoded();
      if (cancelled || !decoded) return;

      // 8 — LCP is out of the way: the auto-start, or the first input, whichever
      //     arrives first. The auto-start needs the watch to be quiet AND the
      //     clip's box to cover the viewport; a clip that cannot promise that
      //     coverage never resolves this half, and the layer waits for an input
      //     exactly as it did before 2026-09-07.
      const autoStart = lcpQuiet.then((): Promise<void> | undefined =>
        clipCoversViewport(candidate) ? undefined : new Promise<void>(() => undefined),
      );
      await Promise.race([whenFirstInput(), autoStart]);
      if (cancelled) return;

      setConfig(candidate);
      setPhase('gated');
    };

    void run();

    return () => {
      cancelled = true;
      for (const fn of cleanups) fn();
    };
  }, [motion, generation]);

  /* ── PLAYBACK: the loop, pause/resume, the still fallback ─────────────── */
  const mounted = phase === 'gated' || phase === 'playing';

  useEffect(() => {
    if (!mounted || config === null) return;
    /* ONE COPY OR TWO, AND WHERE THE SECOND ONE ENTERS. Three shapes, one
       flag each, read from the manifest and never guessed:

         loop: true                 → wraps to 0, for ever      (two copies)
         loop: false, no loopFrom   → plays once, holds the end (one copy)
         loop: false, loopFrom: F   → plays once, then loops    (two copies)
                                      [F, D] for ever

       A clip that performs no handoff renders no standby box at all, so B is
       null here by construction rather than by accident, and every branch below
       that would have used it is switched off by the same flag. */
    const tailFrom = config.loop ? null : config.loopFrom;
    const wraps = config.loop || tailFrom !== null;
    /* Where an incoming copy enters: the tail's head, or the clip's own start. */
    const loopStart = tailFrom ?? 0;
    /* Mutable because the container's duration is authoritative over the
       manifest's: a tail the real duration cannot support is dropped at
       runtime, and the clip then plays once and holds. See `loadedmetadata`. */
    let wrapping = wraps;
    const root = rootRef.current;
    const boxA = boxARef.current;
    const boxB = boxBRef.current;
    const A = videoARef.current;
    const B = videoBRef.current;
    if (root === null || boxA === null || A === null) return;
    if (wraps && (boxB === null || B === null)) return;
    const copies = B === null ? [A] : [A, B];

    let alive = true;
    const cleanups: Array<() => void> = [];
    const listen: Listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    };

    /* ── the registration numbers, read from the element that owns them ── */
    const sharp = findSharpImg();
    const setPos = (): void => {
      const [px, py] = parseObjectPosition(sharp === null ? '' : getComputedStyle(sharp).objectPosition);
      root.style.setProperty('--m-px', px.toFixed(4));
      root.style.setProperty('--m-py', py.toFixed(4));
    };
    setPos();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(setPos);
      ro.observe(root);
      cleanups.push(() => ro.disconnect());
    }

    /* ── media-time bookkeeping ─────────────────────────────────────────── */
    const X = MOTION_CROSS_S;
    let D = config.durationS;
    let active = A;
    let standby = B ?? A;
    let activeBox = boxA;
    let standbyBox = boxB ?? boxA;
    let firstFrame = false;
    let suspended = false;
    let hidden = document.visibilityState === 'hidden';
    let offscreen = false;
    let raf = 0;
    let alarm: ReturnType<typeof setTimeout> | null = null;
    let stall: ReturnType<typeof setTimeout> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let handoff: {
      incoming: HTMLVideoElement;
      outgoing: HTMLVideoElement;
      incomingBox: HTMLDivElement;
      outgoingBox: HTMLDivElement;
      span: number;
      outgoingAt: number;
      /** Where the incoming copy entered — 0 for a loop, `loopFrom` for a tail. */
      incomingFrom: number;
    } | null = null;

    const clearAlarm = (): void => {
      if (alarm !== null) clearTimeout(alarm);
      alarm = null;
    };
    const clearStall = (): void => {
      if (stall !== null) clearTimeout(stall);
      stall = null;
    };
    const clearHidden = (): void => {
      if (hiddenTimer !== null) clearTimeout(hiddenTimer);
      hiddenTimer = null;
    };
    const cancelRaf = (): void => {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    };

    /** Pause every copy, drop every source, free every decoder. */
    const teardown = (): void => {
      clearAlarm();
      clearStall();
      clearHidden();
      cancelRaf();
      for (const v of copies) {
        try {
          v.pause();
        } catch {
          /* a media element with nothing loaded */
        }
        for (const source of v.querySelectorAll('source')) source.removeAttribute('src');
        v.removeAttribute('src');
        try {
          v.load();
        } catch {
          /* ditto */
        }
      }
    };

    /** The still, for this page life. */
    const toStill = (): void => {
      if (!alive) return;
      alive = false;
      teardown();
      terminalRef.current = true;
      setPhase('still');
    };

    /* ── the loop — every function here is inert on a clip that never wraps ─ */
    const armAlarm = (): void => {
      clearAlarm();
      if (!wrapping || !alive || suspended || handoff !== null) return;
      const rate = active.playbackRate > 0 ? active.playbackRate : 1;
      const ms = ((D - X - active.currentTime) / rate) * 1000 - 120;
      alarm = setTimeout(() => {
        alarm = null;
        check();
      }, Math.max(0, ms));
    };

    const finalise = (): void => {
      if (handoff === null) return;
      const { incoming, outgoing, incomingBox, outgoingBox } = handoff;
      incomingBox.style.opacity = '';
      incomingBox.dataset.role = 'active';
      outgoing.pause();
      try {
        /* Parked where it next ENTERS, which for a tail is `loopFrom` and not 0:
           the seek is done here, at leisure, so the next handoff starts on a
           decoder that is already sitting on the frame it has to show. */
        outgoing.currentTime = loopStart;
      } catch {
        /* not seekable yet — the next handoff seeks again */
      }
      outgoingBox.style.opacity = '';
      outgoingBox.dataset.role = 'standby';
      active = incoming;
      activeBox = incomingBox;
      standby = outgoing;
      standbyBox = outgoingBox;
      handoff = null;
      armAlarm();
    };

    /**
     * The incoming copy could not start. For a LOOP the outgoing's own `loop`
     * attribute carries it round with one hard cut; for a NIGHT TAIL there is no
     * such attribute, and the outgoing simply runs to its end, where the `ended`
     * handler below re-enters the tail. Either way the layer keeps moving and
     * this hands the roles back unchanged.
     */
    const abandonHandoff = (): void => {
      if (handoff === null) return;
      const { incomingBox } = handoff;
      cancelRaf();
      incomingBox.style.opacity = '';
      incomingBox.dataset.role = 'standby';
      handoff = null;
      /* NOT armAlarm(). At the moment of an abandon the active is at or past
         D − X, so armAlarm's own arithmetic yields a negative delay, clamps to
         0, fires immediately, and `check()` starts the same handoff again — a
         spin for as long as the incoming stays stuck. The outgoing is the copy
         still playing and it is about to reach its end, where `ended` re-enters
         the tail; that is the fallback this function's doc describes, so let it
         happen rather than racing it. */
    };

    const step = (): void => {
      raf = 0;
      if (!alive || handoff === null || suspended) return;
      const { incoming, outgoing, incomingBox, span, outgoingAt, incomingFrom } = handoff;
      /* SINCE IT ENTERED, not since the file began: at a tail the incoming
         copy's currentTime is `loopFrom`-plus-a-little, and t/span would be far
         past 1 on the first frame — a cut wearing a dissolve's name. */
      const t = incoming.currentTime - incomingFrom;
      incomingBox.style.opacity = smoothstep(clamp01(t / span)).toFixed(4);
      // The `loop` attribute wrapped the outgoing before the dissolve finished:
      // frame 0 has been shown once with a hard cut; continue from here.
      const wrapped = outgoing.currentTime < outgoingAt - 0.5;
      /* THE INCOMING MUST ACTUALLY BE THERE. Promotion sets its opacity to 1,
         so promoting a copy that has not reached `incomingFrom` paints whatever
         frame it is sitting on — for a tail that is frame 0, the SUNSET, at full
         opacity, and the whole lapse then replays. It was reachable: the
         outgoing running out is a disjunct on its own, and the dissolve's own
         maths hides the fault by clamping the incoming to opacity 0 until it
         arrives. Measured before this guard: promoted at t = 0.040 s and
         replayed the lapse from the sunset. A copy that has not arrived is not
         a copy to hand over to — abandon instead, and the `ended` handler
         re-enters the tail with one cut, which is the honest fallback. */
      const arrived = incoming.currentTime >= incomingFrom - 0.25;
      const outgoingSpent = outgoing.currentTime >= D - 0.05;
      if (t >= span || wrapped || (outgoingSpent && arrived)) {
        finalise();
        return;
      }
      if (outgoingSpent) {
        abandonHandoff();
        return;
      }
      raf = requestAnimationFrame(step);
    };

    const startHandoff = (): void => {
      if (!wrapping || !alive || handoff !== null || suspended) return;
      clearAlarm();
      // Late wake (timer throttling): still finish the fade before the outgoing wraps.
      const span = Math.max(0.3, Math.min(X, D - active.currentTime));
      const incoming = standby;
      const incomingBox = standbyBox;
      handoff = {
        incoming,
        outgoing: active,
        incomingBox,
        outgoingBox: activeBox,
        span,
        outgoingAt: active.currentTime,
        incomingFrom: loopStart,
      };
      try {
        /* A tolerance rather than an equality: `finalise` and the standby's own
           preload have already parked it here, and a decoder that lands a frame
           either side of the seek must not be seeked again mid-handoff. */
        if (Math.abs(incoming.currentTime - loopStart) > 0.05) incoming.currentTime = loopStart;
      } catch {
        /* not seekable — it is where it needs to be already, having never played */
      }
      incomingBox.style.opacity = '0';
      incomingBox.dataset.role = 'incoming';
      incoming.play().catch(abandonHandoff);
      raf = requestAnimationFrame(step);
    };

    const check = (): void => {
      if (!wrapping || !alive || suspended || handoff !== null || !firstFrame) return;
      if (active.currentTime >= D - X) startHandoff();
      else if (alarm === null) armAlarm();
    };

    /* ── pause / resume — every clock here is a media clock ─────────────── */
    const pauseAll = (): void => {
      suspended = true;
      clearAlarm();
      cancelRaf();
      for (const v of copies) v.pause();
    };

    /*
      ⚠ `play()` on an ENDED element seeks it to 0 and plays it again. On a
      one-shot clip that is the descent starting over from the sunset, fired by
      something as ordinary as a tab flip, so `ended` is refused here — the one
      place every resume path goes through.
    */
    const play = (v: HTMLVideoElement): void => {
      if (v.ended) return;
      if (v.readyState >= 2) {
        v.play().catch(() => undefined);
      } else {
        listen(v, 'canplay', () => {
          if (alive && !suspended) v.play().catch(() => undefined);
        }, { once: true });
      }
    };

    /**
     * THE TAIL'S MISSED-HANDOFF FALLBACK. A copy that reaches the end without a
     * handoff having started — a timer throttled past both the alarm and the
     * 4 Hz backstop, a decoder that stalled through the whole crossfade window —
     * re-enters the TAIL with one hard cut. That is the same trade the element's
     * own `loop` attribute makes for a real loop (a cut beats a frozen frame),
     * made by hand because the attribute would land on frame 0, and frame 0 is
     * the sunset.
     */
    const reenterTail = (v: HTMLVideoElement): void => {
      if (!alive || !wrapping || tailFrom === null) return;
      if (v !== active || handoff !== null || suspended) return;
      try {
        v.currentTime = loopStart;
      } catch {
        return;
      }
      play(v);
      armAlarm();
    };

    const resumeAll = (): void => {
      if (!alive || hidden || offscreen || !suspended) return;
      suspended = false;
      play(active);
      if (handoff !== null) {
        play(handoff.incoming);
        if (raf === 0) raf = requestAnimationFrame(step);
      }
      armAlarm();
    };

    listen(document, 'visibilitychange', () => {
      hidden = document.visibilityState === 'hidden';
      if (hidden) {
        pauseAll();
        clearHidden();
        /*
          A LOOP may be dropped and re-gated after a minute hidden, because it
          would come back on the frame it left. A ONE-WAY clip may not — held at
          the end or looping a night tail, both: re-gating restarts it at frame
          0, and there is no resume either, since a remount fades up from the
          still and the still is where the light BEGAN. So it holds, paused, on
          the decoders it has. See MOTION_HIDDEN_UNMOUNT_MS.
        */
        if (!config.loop) return;
        hiddenTimer = setTimeout(() => {
          hiddenTimer = null;
          if (!alive) return;
          alive = false;
          teardown();
          setPhase('idle');
          setGeneration((g) => g + 1);
        }, MOTION_HIDDEN_UNMOUNT_MS);
      } else {
        clearHidden();
        resumeAll();
      }
    });
    listen(window, 'pagehide', pauseAll);
    listen(window, 'pageshow', resumeAll);
    listen(document, 'freeze', pauseAll);
    listen(document, 'resume', resumeAll);

    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry === undefined) return;
          offscreen = entry.intersectionRatio < MOTION_PAUSE_BELOW_RATIO;
          if (offscreen) pauseAll();
          else resumeAll();
        },
        { threshold: [0, MOTION_PAUSE_BELOW_RATIO] },
      );
      io.observe(root);
      cleanups.push(() => io.disconnect());
    }

    /* ── loading — the active first, the standby only once it is safe ───── */
    for (const v of copies) {
      v.muted = true;
      v.defaultMuted = true;
      listen(v, 'error', toStill);
      if (wraps) listen(v, 'timeupdate', check);
      if (tailFrom !== null) listen(v, 'ended', () => reenterTail(v));
    }
    listen(A, 'stalled', () => {
      if (firstFrame || stall !== null) return;
      stall = setTimeout(() => {
        stall = null;
        toStill();
      }, MOTION_STALL_MS);
    });
    listen(A, 'progress', clearStall);
    listen(A, 'loadedmetadata', () => {
      if (Number.isFinite(A.duration) && A.duration > 0) D = A.duration;
      /* THE CONTAINER OUTRANKS THE MANIFEST on duration, and a tail the real
         duration cannot support is DROPPED rather than clamped: the clip then
         plays once and holds its last frame, which is this layer's own
         documented fallback, instead of crossfading over itself for ever on a
         tail two frames long. `parseHeroMotion` has already applied
         MOTION_TAIL_MIN_S to the manifest's number, so this only fires when the
         two disagree by seconds — a mis-installed clip. */
      if (tailFrom !== null && D - loopStart < MOTION_TAIL_MIN_S) {
        wrapping = false;
        clearAlarm();
      }
    });
    /* ONE FETCH PER PAGE LIFE, AND THE SEEK IS WHAT NEARLY COST IT.
       The standby loads only once the active can play through, so its request
       takes the cache rather than the network. For a LOOP it then sits at frame
       0, where it already is, and nothing else is needed.
       For a TAIL the standby must end up parked at `loopFrom` — but seeking a
       second decoder to a byte range the first has not reached yet issues a
       RANGE REQUEST, and Chromium abandons the in-flight whole-file response to
       serve it (`net::ERR_ABORTED` partway through). Nothing complete is ever
       written to the HTTP cache, so EVERY page life re-downloads the clip; on a
       1.6 Mbit/s link that measured 38 freezes and 10.4 s of frozen picture in
       the first 32 s, which is the "stutter" this round exists to remove. It
       also voided the return door's premise, which is that a refresh puts no
       megabytes on the wire.
       So the park-seek waits for the bytes to be LOCAL. `buffered` covering
       `loopStart` means the range is already in memory and the seek costs no
       request. If that never happens the standby simply stays at 0 and
       `startHandoff` seeks it then, on a file that has by definition finished
       arriving, because the active has played to its end. */
    if (B !== null) {
      const standbyCopy = B;
      listen(A, 'canplaythrough', () => {
        if (!alive) return;
        standbyCopy.preload = 'auto';
        standbyCopy.load();
      }, { once: true });
      if (tailFrom !== null) {
        let parked = false;
        const parkWhenLocal = (): void => {
          if (parked || !alive || handoff !== null) return;
          if (!covers(A.buffered, loopStart)) return;
          if (standbyCopy.readyState < 1) return;
          parked = true;
          try {
            standbyCopy.currentTime = loopStart;
          } catch {
            parked = false; /* not seekable yet — startHandoff seeks again */
          }
        };
        listen(A, 'progress', parkWhenLocal);
        listen(A, 'timeupdate', parkWhenLocal);
        listen(standbyCopy, 'loadeddata', parkWhenLocal);
      }
    }
    listen(A, 'canplay', () => {
      if (!alive) return;
      A.play()
        .then(() => whenPresented(A, listen))
        .then(() => {
          if (!alive) return;
          firstFrame = true;
          clearStall();
          setPos();
          /*
            THE FADE IS CHOSEN HERE, at the only instant that can answer the
            question: what can the reader see right now? Behind the intro the
            picture is held soft and the step is 1.62 sRGB levels; over a sharp
            one it is 3.34 with a p99 of 21. Written to the element as well as
            to state so the duration is on the node before the attribute that
            starts the transition, whichever order React commits them in.
          */
          const ms = motionFadeMsForFocus(currentFocus());
          root.style.setProperty('--motion-fade', `${ms}ms`);
          setFadeMs(ms);
          setPhase('playing');
          armAlarm();
        })
        .catch(toStill);
    }, { once: true });
    A.preload = 'auto';
    A.load();

    return () => {
      alive = false;
      teardown();
      for (const fn of cleanups) fn();
    };
  }, [mounted, config]);

  if (!mounted || config === null) return null;

  const style = {
    '--m-ar': config.stillAspect.toFixed(5),
    '--m-cx': config.crop.x.toFixed(5),
    '--m-cy': config.crop.y.toFixed(5),
    '--m-cw': config.crop.w.toFixed(5),
    '--m-ch': config.crop.h.toFixed(5),
    '--m-cap': config.opacityCap.toFixed(3),
    '--motion-fade': `${fadeMs}ms`,
  } as CSSProperties;

  /*
    `loop` is the ELEMENT's attribute and it is the missed-handoff fallback for
    a real loop — one hard cut beats a frozen frame. On any ONE-WAY clip it is
    the exact fault being designed out: it would wrap the picture back to the
    sunset it started from, behind the controller's back, with no event the
    controller could even see. That is true of a clip that holds its last frame
    AND of one that loops a night tail — the tail's own fallback is the `ended`
    handler, which re-enters at `loopFrom`. So the attribute follows `loop` and
    nothing else.
  */
  const video = (ref: typeof videoARef) => (
    <video
      ref={ref}
      muted
      playsInline
      loop={config.loop}
      preload="none"
      poster={config.poster === '' ? undefined : config.poster}
      disablePictureInPicture
      disableRemotePlayback
      tabIndex={-1}
    >
      <source src={config.src} type={config.type} />
    </video>
  );

  return (
    <div
      ref={rootRef}
      data-hero-motion=""
      data-on={phase === 'playing' ? '' : undefined}
      /* The edge feather is emitted only for a crop that is a real sub-
         rectangle of the still; see motionNeedsFeather for what it does to a
         whole-frame registration. */
      data-feather={motionNeedsFeather(config.crop) ? '' : undefined}
      style={style}
    >
      <style>{HERO_MOTION_STYLE}</style>
      <div data-clips="">
        <div ref={boxARef} data-role="active">
          {video(videoARef)}
        </div>
        {/* The standby exists wherever a handoff does: a loop, or a night tail. */}
        {config.loop || config.loopFrom !== null ? (
          <div ref={boxBRef} data-role="standby">
            {video(videoBRef)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
