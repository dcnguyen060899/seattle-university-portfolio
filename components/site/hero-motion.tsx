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
 *   6. html[data-intro] gone (MutationObserver; bounded by the intro's own
 *      dead-man switch)
 *   7. MOTION_SETTLE_MS elapsed AND an idle callback fired — both
 *   8. the sharp <img> has decoded: the clip may never precede the picture it
 *      registers to
 *   9. the first scroll / pointerdown / keydown — LCP is final after it
 *
 * ── WHAT IT NEVER DOES ─────────────────────────────────────────────────────
 *
 * It never writes a custom property on <html>: hooks/use-scroll-driver.ts is
 * the only writer of --focus/--exit/--page and this layer CONSUMES --focus in
 * CSS (`[data-clips]{opacity:calc(1 - var(--focus))}`) — same law, same
 * property, same element as `.sharp`. It never reads scroll position: pausing
 * comes from IntersectionObserver. It never adds a scroll listener beyond the
 * one-shot `once` wait for first input, which is not a scroll VALUE consumer.
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
  MOTION_MEDIA,
  MOTION_OFF_KEY,
  MOTION_OVERRIDE_KEY,
  MOTION_PAUSE_BELOW_RATIO,
  MOTION_SETTLE_MS,
  MOTION_SLOW_CONNECTIONS,
  MOTION_STALL_MS,
  parseHeroMotion,
} from '@/lib/hero-motion';
import type { HeroMotion } from '@/lib/hero-motion';
import { INTRO_DISSOLVE_MS, INTRO_FAILSAFE_MS } from '@/lib/intro';

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

/** `'50% 40%'` → `[0.5, 0.4]`; anything else → centre. */
function parseObjectPosition(value: string): [number, number] {
  const m = /^\s*([0-9.]+)%\s+([0-9.]+)%\s*$/.exec(value);
  if (m === null) return [0.5, 0.5];
  const px = Number.parseFloat(m[1] ?? '');
  const py = Number.parseFloat(m[2] ?? '');
  return [Number.isFinite(px) ? px / 100 : 0.5, Number.isFinite(py) ? py / 100 : 0.5];
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

    const run = async (): Promise<void> => {
      // 1 — a config, from the manifest or (webdriver + force only) the override.
      const forced = navigator.webdriver === true && readSession(MOTION_FORCE_KEY) === '1';
      let candidate = motion;
      if (candidate === null && forced) {
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

      // 5 — loaded and visible.
      await whenLoaded();
      if (cancelled) return;
      await whenVisible();
      if (cancelled) return;

      // 6 — the intro has left.
      await whenIntroGone();
      if (cancelled) return;

      // 7 — settled AND idle, whichever is later.
      await Promise.all([after(MOTION_SETTLE_MS), whenIdle()]);
      if (cancelled) return;

      // 8 — the picture the clip registers to has decoded.
      const decoded = await whenSharpDecoded();
      if (cancelled || !decoded) return;

      // 9 — LCP is final.
      await whenFirstInput();
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
    const root = rootRef.current;
    const boxA = boxARef.current;
    const boxB = boxBRef.current;
    const A = videoARef.current;
    const B = videoBRef.current;
    if (root === null || boxA === null || boxB === null || A === null || B === null) return;

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
    let standby = B;
    let activeBox = boxA;
    let standbyBox = boxB;
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

    /** Pause both, drop both sources, free both decoders. */
    const teardown = (): void => {
      clearAlarm();
      clearStall();
      clearHidden();
      cancelRaf();
      for (const v of [A, B]) {
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

    /* ── the loop ───────────────────────────────────────────────────────── */
    const armAlarm = (): void => {
      clearAlarm();
      if (!alive || suspended || handoff !== null) return;
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
        outgoing.currentTime = 0;
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

    /** The incoming copy could not start: keep the outgoing looping (one hard cut). */
    const abandonHandoff = (): void => {
      if (handoff === null) return;
      const { incomingBox } = handoff;
      cancelRaf();
      incomingBox.style.opacity = '';
      incomingBox.dataset.role = 'standby';
      handoff = null;
      armAlarm();
    };

    const step = (): void => {
      raf = 0;
      if (!alive || handoff === null || suspended) return;
      const { incoming, outgoing, incomingBox, span, outgoingAt } = handoff;
      const t = incoming.currentTime;
      incomingBox.style.opacity = smoothstep(clamp01(t / span)).toFixed(4);
      // The `loop` attribute wrapped the outgoing before the dissolve finished:
      // frame 0 has been shown once with a hard cut; continue from here.
      const wrapped = outgoing.currentTime < outgoingAt - 0.5;
      if (t >= span || outgoing.currentTime >= D - 0.05 || wrapped) {
        finalise();
        return;
      }
      raf = requestAnimationFrame(step);
    };

    const startHandoff = (): void => {
      if (!alive || handoff !== null || suspended) return;
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
      };
      try {
        if (incoming.currentTime !== 0) incoming.currentTime = 0;
      } catch {
        /* not seekable — it is at 0 already, having never played */
      }
      incomingBox.style.opacity = '0';
      incomingBox.dataset.role = 'incoming';
      incoming.play().catch(abandonHandoff);
      raf = requestAnimationFrame(step);
    };

    const check = (): void => {
      if (!alive || suspended || handoff !== null || !firstFrame) return;
      if (active.currentTime >= D - X) startHandoff();
      else if (alarm === null) armAlarm();
    };

    /* ── pause / resume — every clock here is a media clock ─────────────── */
    const pauseAll = (): void => {
      suspended = true;
      clearAlarm();
      cancelRaf();
      A.pause();
      B.pause();
    };

    const play = (v: HTMLVideoElement): void => {
      if (v.readyState >= 2) {
        v.play().catch(() => undefined);
      } else {
        listen(v, 'canplay', () => {
          if (alive && !suspended) v.play().catch(() => undefined);
        }, { once: true });
      }
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
    for (const v of [A, B]) {
      v.muted = true;
      v.defaultMuted = true;
      listen(v, 'error', toStill);
      listen(v, 'timeupdate', check);
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
    });
    // The two fetches of one URL serialise into a cache hit rather than a
    // doubled download: the standby loads only once the active can play through.
    listen(A, 'canplaythrough', () => {
      if (!alive) return;
      B.preload = 'auto';
      B.load();
    }, { once: true });
    listen(A, 'canplay', () => {
      if (!alive) return;
      A.play()
        .then(() => whenPresented(A, listen))
        .then(() => {
          if (!alive) return;
          firstFrame = true;
          clearStall();
          setPos();
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
    '--motion-fade': `${MOTION_FADE_IN_MS}ms`,
  } as CSSProperties;

  const video = (ref: typeof videoARef) => (
    <video
      ref={ref}
      muted
      playsInline
      loop
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
    <div ref={rootRef} data-hero-motion="" data-on={phase === 'playing' ? '' : undefined} style={style}>
      <style>{HERO_MOTION_STYLE}</style>
      <div data-clips="">
        <div ref={boxARef} data-role="active">
          {video(videoARef)}
        </div>
        <div ref={boxBRef} data-role="standby">
          {video(videoBRef)}
        </div>
      </div>
    </div>
  );
}
