/**
 * components/site/hero.tsx — band 1. The ink ground, and the first of the two
 * the page is allowed (see components/ui/system.ts for the budget).
 *
 * ── WHY THREE MEASURED FIGURES AND NOT THE GPA (Addendum B, R-8) ──────────
 *
 * The earlier copy deck put GPA 4.0 in the hero as its only number. Two things
 * are wrong with that. The owner’s own `Resume.pdf` — the artifact recruiters
 * actually download — contains no GPA at all, so his editorial judgment had
 * already made this call. And a grade is the weakest of the four signals the
 * brief asks the page to carry, sitting in the strongest slot on the page.
 *
 * So the hero carries the three figures a hiring manager can act on:
 *   1. the retrieval threshold and the one arm of twenty-four that cleared it,
 *   2. the blind-judged national win,
 *   3. the barn-owl database, in one line.
 * GPA and the Dean’s Honor Roll moved to the education credentials block.
 *
 * ── WHY THE THRESHOLD IS THE HERO OBJECT ──────────────────────────────────
 *
 * `<Threshold>` is not a decoration reused here. This portfolio’s headline
 * research result IS a threshold: a held-out majority-class retrieval floor,
 * and exactly one arm of a twenty-four-cell experiment above it. The device
 * encodes the claim’s shape — the clearing figure sits over the line, the
 * floor sits on it — which is why it is the single most important object on
 * the page and why the whole crimson budget is spent on it.
 *
 * ── WHY THE LIMITS ARE IN THE HERO ────────────────────────────────────────
 *
 * Because the page’s argument is that its numbers are checkable, and a page
 * that puts its figures first and its caveats last has already lost that
 * argument. Two lines of 13.6px is the entire cost.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── THE PHOTOGRAPH, AND THE ONE RULE IT HAS TO OBEY ───────────────────────
 *
 * A Seattle University campus photograph sits behind this band, ported from
 * the MAVTERRAS hero: two stacked copies of the same image, cross-faded by
 * --focus, with the blur BAKED INTO the soft copy because a live
 * `filter: blur()` cannot be rasterised fast enough on a flick. The perf
 * contract and its measured numbers are in hero.module.css; read that header
 * before touching either layer.
 *
 * THE CONSTRAINT THAT DOMINATES THE FEATURE: every ratio app/globals.css
 * publishes for the ink ground is measured against a FLAT #14161A. Put a
 * photograph behind the text and all of them become claims about a surface
 * that no longer exists — and this page's entire argument is that its claims
 * are checkable. The scrim is therefore not a decoration, it is the mechanism
 * that makes the published ratios true again, and it lives in its own module,
 * `hero-scrim.module.css`, because its alpha is a CHECKED number: it is
 * solved against a pure-white source pixel and re-derived on every build by
 * `npm run check:hero`.
 *
 * ── THE ABSENT-ASSET PATH IS THE DEFAULT PATH ─────────────────────────────
 *
 * `public/brand/hero-source.png` is not in the repository, so neither is
 * anything generated from it. This component therefore renders EXACTLY what
 * it rendered before the photograph existed — the flat ink band — whenever
 * the assets are missing, incomplete, unmeasured, or measured and failing.
 * No <img> tag is emitted, so there is no 404, no broken-image box, no layout
 * shift and no build error. The photograph is progressive enhancement over a
 * hero that already works, and every rejection path lands on the same
 * well-tested default.
 *
 * ── THE CONTRACT WITH THE ASSET PIPELINE ──────────────────────────────────
 *
 * `public/brand/hero/manifest.json` is the interface, and it is COMMITTED
 * even when there is no photograph — `{ present: false }` — so this component
 * never has to distinguish "the pipeline has not run" from "the pipeline ran
 * and there was nothing to process". `scripts/gen-hero-photo.mjs` writes it;
 * `scripts/verify-hero-assets.mjs` gates it; `scripts/check-hero-contrast.mjs`
 * gates the scrim against it.
 *
 * When `present` is true it carries, per orientation (`p` phone, `l`
 * desktop): the `media` query that selects it, `srcset.avif` / `srcset.webp`
 * already formatted with their `w` descriptors, `sizes`, the `fallback` WebP
 * for the bare `<img>`, `intrinsic` dimensions, and the baked-blur
 * `soft.publicPath`. Nothing here retypes any of it — the breakpoint in
 * particular is `artDirectionBreakpointPx`, read, never repeated, because a
 * breakpoint that exists in two places is a breakpoint that will disagree.
 *
 * ── THREE THINGS ARE CHECKED HERE, AT BUILD TIME ──────────────────────────
 *
 *   1. `present === true`. Anything else is the flat ink band, silently —
 *      that is the documented, shipping state, and a build that shouts about
 *      it every time teaches everyone to ignore its warnings.
 *
 *   2. EVERY FILE THE MARKUP WOULD REFERENCE EXISTS ON DISK. Both srcsets,
 *      both fallbacks, both soft bitmaps, resolved against `public/`. This is
 *      what makes "no 404 in the console" a property of the build rather than
 *      a thing somebody checked once — a manifest that has drifted from the
 *      directory drops the photograph instead of emitting a broken <img>.
 *
 *   3. THE SCRIM IS RELAYED THE PHOTOGRAPH'S OWN MEASUREMENT. The generator
 *      measures the brightest glyph-sized patch of every rung and publishes
 *      `scrim.requiredAlpha` — the veil at which the weakest ink foreground
 *      still clears 4.5:1 over it. That number is handed to the scrim as
 *      `--scrim-base`, and hero-scrim.module.css clamps it between its own
 *      `--scrim-floor-min` and 100%, so THE RELAY CAN ONLY EVER DARKEN THE
 *      VEIL. An absent, garbled or forgotten measurement therefore lands on
 *      the safe end (100% — flat ink, no photograph visible), never on the
 *      pretty one. This reads the floor out of the CSS and refuses to render
 *      at all if it cannot find it, because a guarantee nothing can read is
 *      not a guarantee.
 *
 * WHY THE ALPHA IS READ OUT OF CSS RATHER THAN DUPLICATED HERE: a component
 * that names the scrim's strength is a second source of truth for it, and the
 * first thing that happens to a second source of truth is that it disagrees.
 * The CSS owns the number; this reads it, relays a darker one when the image
 * needs it, and `npm run check:hero` proves the whole arrangement against
 * both pure white and the real pixels at build time.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CSSProperties } from 'react';

import { Band, Btn, Eyebrow, Reveal, Threshold } from '@/components/ui';
import { heroCaption } from '@/lib/corpus/hero-asset';
import { EvidenceLink, Limit, Readout, figureAt, pageShort } from './evidence';
import { ScrollDriver } from './scroll-driver';
import scrim from './hero-scrim.module.css';
import styles from './hero.module.css';

/**
 * Positions inside the corpus value blocks this band reads by hand.
 * `figureAt` asserts the array length, so a corpus edit that reorders or
 * extends either of these stops the build instead of silently renaming a
 * number. The comments are the contract; the assertion is the enforcement.
 */
const P1 = { FLOOR: 0, FROZEN: 1, FINE_TUNED: 2, COUNT: 3 } as const;
const CELLS = { TOTAL: 0, COUNT: 4 } as const;
const DB = { NEURONS: 0, PASSES: 3, COUNT: 5 } as const;
const ARCHIVE = { RAW: 0, COUNT: 2 } as const;

/* ══════════════════════════════════════════════════════════════════════════
   THE ASSET GATE
   ══════════════════════════════════════════════════════════════════════════ */

const PUBLIC_DIR = join(process.cwd(), 'public');
const MANIFEST_PATH = join(PUBLIC_DIR, 'brand', 'hero', 'manifest.json');
const SCRIM_CSS_PATH = join(process.cwd(), 'components', 'site', 'hero-scrim.module.css');

/** One art-directed crop, as the markup needs it. */
interface HeroCrop {
  /** The media query that selects it, or null for the default crop. */
  media: string | null;
  avif: string | null;
  webp: string;
  sizes: string;
  /** The WebP the bare <img> loads — the universal fallback. */
  fallback: string;
  /** The baked blur bitmap. Blur is a FILE, never a filter. */
  soft: string;
  width: number | null;
  height: number | null;
}

interface HeroPhoto {
  phone: HeroCrop;
  desktop: HeroCrop;
  /**
   * The generator's measured minimum veil for THIS photograph, relayed to the
   * scrim as `--scrim-base`. hero-scrim.module.css clamps it to its own
   * `--scrim-floor-min`, so this can only ever darken the veil.
   */
  requiredAlpha: number;
  /**
   * `.frame`'s own height bound, READ out of hero-scrim.module.css and relayed
   * to hero.module.css's pin as `--hero-frame-bound` — e.g. `132svh`.
   *
   * Null when that rule is not in the single form this and
   * scripts/check-hero-contrast.mjs both parse, in which case the pin falls
   * back to `100%`: the pin box becomes the band, its sticky travel is zero,
   * and the geometry is byte-for-byte the un-pinned hero. A photograph is
   * never dropped over it — a missing bound costs coverage, not the picture.
   */
  frameBound: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function warn(message: string): void {
  console.warn(`hero: ${message}`);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** `/brand/hero/a.avif 640w, /brand/hero/b.avif 898w` → the two public paths. */
function pathsIn(srcSet: string): string[] {
  return srcSet
    .split(',')
    .map((entry) => entry.trim().split(/\s+/)[0] ?? '')
    .filter((path) => path.length > 0);
}

/**
 * The scrim's own guaranteed floor, read out of the stylesheet that owns it.
 *
 * Returns null when `--scrim-floor-min` is not declared in the form both this
 * and scripts/check-hero-contrast.mjs parse — in which case the photograph
 * does not render, because a guarantee nothing can read is not a guarantee.
 * That is the point of reading it rather than repeating it: a component that
 * names the scrim's strength is a second source of truth for it, and the
 * first thing that happens to a second source of truth is that it disagrees.
 */
function scrimFloorMin(): number | null {
  let css: string;
  try {
    css = readFileSync(SCRIM_CSS_PATH, 'utf8');
  } catch {
    return null;
  }
  // The measured numbers are written into the header comment on purpose.
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const match = /--scrim-floor-min\s*:\s*([0-9.]+)%/.exec(code);
  if (match === null) return null;
  const percent = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(percent) ? percent / 100 : null;
}

/**
 * `.frame`'s height bound, read out of the stylesheet that owns it.
 *
 * THE PHOTO BOX'S SIZE IS NOT THIS COMPONENT'S DECISION AND NOT
 * hero.module.css's EITHER. hero-scrim.module.css declares
 * `block-size: min(100%, 132svh)` and scripts/check-hero-contrast.mjs parses
 * that same declaration to model `frameH`. The pin has to know the number so
 * it can size a box that resolves to exactly the same px — so it READS it,
 * with the same regex the gate uses, rather than repeating it. Three files,
 * one number, and it moves in one place.
 *
 * Returns null for any other form, which the CSS handles by falling back to
 * `100%` — an un-pinned, present-day hero rather than a missing photograph.
 */
function frameBoundCss(): string | null {
  let css: string;
  try {
    css = readFileSync(SCRIM_CSS_PATH, 'utf8');
  } catch {
    return null;
  }
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const match = /block-size:\s*min\(\s*100%\s*,\s*([0-9.]+)svh\s*\)/.exec(code);
  if (match === null) return null;
  const svh = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(svh) && svh > 0 ? `${svh}svh` : null;
}

/** One orientation of the manifest, validated into the shape the markup needs. */
function crop(value: unknown, media: string | null): HeroCrop | null {
  if (!isRecord(value)) return null;
  const srcset = isRecord(value.srcset) ? value.srcset : null;
  const soft = isRecord(value.soft) ? str(value.soft.publicPath) : null;
  const webp = srcset === null ? null : str(srcset.webp);
  const fallback = str(value.fallback);
  if (webp === null || fallback === null || soft === null) return null;

  const intrinsic = isRecord(value.intrinsic) ? value.intrinsic : null;

  return {
    media,
    avif: srcset === null ? null : str(srcset.avif),
    webp,
    sizes: str(value.sizes) ?? '100vw',
    fallback,
    soft,
    width: intrinsic === null ? null : num(intrinsic.width),
    height: intrinsic === null ? null : num(intrinsic.height),
  };
}

/** Every public path a crop would put on the wire. */
function filesOf(c: HeroCrop): string[] {
  return [...pathsIn(c.avif ?? ''), ...pathsIn(c.webp), c.fallback, c.soft];
}

/**
 * Resolves the photograph, or null for the flat ink band. NEVER THROWS: every
 * failure path in here is a hero that renders exactly as it did before the
 * photograph existed.
 */
function readHeroPhoto(): HeroPhoto | null {
  if (!existsSync(MANIFEST_PATH)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (error) {
    warn(`manifest.json is not valid JSON (${String(error)}) — rendering the flat ink ground`);
    return null;
  }
  if (!isRecord(parsed)) return null;

  // The documented, shipping state. Silent: it is not a defect.
  if (parsed.present !== true) return null;

  const reject = (why: string): null => {
    warn(
      `photograph NOT rendered — ${why}. The band falls back to the flat ink ground, which is ` +
        'correct and accessible. Run `npm run gen:hero` then `npm run verify:hero`.',
    );
    return null;
  };

  const breakpoint = num(parsed.artDirectionBreakpointPx);
  if (breakpoint === null) return reject('manifest.artDirectionBreakpointPx is missing');

  const orientations = isRecord(parsed.orientations) ? parsed.orientations : null;
  if (orientations === null) return reject('manifest.orientations is missing');

  // The phone crop carries the media query; the desktop crop is the default.
  // Both come from the manifest — a breakpoint retyped here is a breakpoint
  // that will one day disagree with the one the generator cropped against.
  const phoneMedia = str(isRecord(orientations.p) ? orientations.p.media : null);
  const phone = crop(orientations.p, phoneMedia ?? `(max-width: ${breakpoint}px)`);
  const desktop = crop(orientations.l, null);
  if (phone === null || desktop === null) {
    return reject('an orientation is missing its srcset, fallback or soft bitmap');
  }

  const missing = [...filesOf(phone), ...filesOf(desktop)].filter(
    (path) => !existsSync(join(PUBLIC_DIR, path.replace(/^\//, ''))),
  );
  if (missing.length > 0) {
    return reject(
      `the manifest has drifted from the directory — ${missing.length} file(s) it declares are ` +
        `not on disk: ${missing.join(', ')}`,
    );
  }

  const floorMin = scrimFloorMin();
  if (floorMin === null) {
    return reject(
      '--scrim-floor-min could not be read out of hero-scrim.module.css, so the contrast ' +
        'guarantee is unverifiable from here',
    );
  }

  /*
    `scrim.base` is the field named for the CSS knob and wins when the
    generator emits it; `scrim.requiredAlpha` is the measurement it is derived
    from and is the fallback. Both are read rather than one, because the
    pipeline territory owns that manifest and a consumer that hard-fails on a
    field rename would take the photograph down for a naming change — and
    because either value, relayed, can only DARKEN the veil.
  */
  const scrimBlock = isRecord(parsed.scrim) ? parsed.scrim : null;
  const required =
    num(scrimBlock?.base) ?? num(scrimBlock?.requiredAlpha);
  if (required === null) {
    return reject('manifest.scrim has neither `base` nor `requiredAlpha`');
  }
  if (!(required > 0 && required <= 1)) {
    return reject(`the manifest's scrim alpha is ${required}, which is not in (0, 1]`);
  }
  if (required > floorMin) {
    // Not a rejection: the relay below darkens the veil to exactly this, and
    // the CSS clamp is what makes that safe. Worth saying out loud, because it
    // means the shipped floor is no longer the binding number for this image.
    warn(
      `this photograph needs a veil of ${required} — darker than hero-scrim.module.css's ` +
        `--scrim-floor-min of ${floorMin}. The scrim is being relayed to ${required} via ` +
        '--scrim-base, which is exactly what that knob is for. If the photograph is meant to ' +
        'be more visible than that, it needs re-grading, not a lighter scrim.',
    );
  }

  const frameBound = frameBoundCss();
  if (frameBound === null) {
    warn(
      "`.frame`'s `block-size: min(100%, <n>svh)` could not be read out of " +
        'hero-scrim.module.css, so the photograph cannot be pinned to the viewport and falls ' +
        'back to being anchored to the top of the band. That is the pre-pin geometry: correct, ' +
        'just uncovered below one screenful. See THE PIN in hero.module.css.',
    );
  }

  return { phone, desktop, requiredAlpha: required, frameBound };
}

/**
 * Evaluated once per process. `readHeroPhoto` touches the filesystem, and this
 * band renders on a statically generated route — once at build, and once per
 * request in `next dev`.
 */
const PHOTO: HeroPhoto | null = readHeroPhoto();

/**
 * THE LINE THE BACKGROUND OWES, when there is a background.
 *
 * The image is an AI-generated composite of a place that exists, carrying an
 * institution's marks, on a page that claims a real affiliation with that
 * institution. The owner's answer to that was to state it, in the band's own
 * voice: "Background: an AI-generated composite, not a photograph of the
 * campus." It sits in the <Limit> block beside the BI-RADS caveat and the
 * Fischer live-figures caveat, at the same weight and in the same type,
 * because it is the same kind of object — a stated limit, on the largest
 * element on the page.
 *
 * Three properties of how it is wired, each deliberate:
 *
 *   · THE SENTENCE IS NOT IN THIS FILE. It is `captionText` on
 *     art:hero-photo, reached through lib/corpus/hero-asset.ts, exactly like
 *     every other sentence in that block. A disclosure hardcoded in a
 *     component is a disclosure that can be edited without touching the
 *     record it is supposed to be quoting.
 *   · IT IS CONDITIONAL ON THE PHOTOGRAPH, not on a flag. `PHOTO === null` is
 *     the same boolean that decides whether any of the picture markup exists,
 *     so the line cannot outlive the image or arrive before it. With no
 *     assets on disk there is no background, and a page disclosing a
 *     background it is not showing would be its own small untruth.
 *   · IT IS NOT OPTIONAL. verify-corpus.mjs --built greps the emitted HTML
 *     for this exact string whenever hero assets are present and fails when
 *     it is missing. Dropping the line while keeping the image turns the
 *     build red rather than shipping quietly.
 */
const HERO_DISCLOSURE = PHOTO === null ? null : heroCaption();

/* ══════════════════════════════════════════════════════════════════════════
   THE BAND
   ══════════════════════════════════════════════════════════════════════════ */

export function Hero() {
  const floor = figureAt('clm:yang-p1-floor', P1.FLOOR, P1.COUNT);
  const frozen = figureAt('clm:yang-p1-floor', P1.FROZEN, P1.COUNT);
  const fineTuned = figureAt('clm:yang-p1-floor', P1.FINE_TUNED, P1.COUNT);
  const cells = figureAt('clm:yang-design-24cells', CELLS.TOTAL, CELLS.COUNT);
  const neurons = figureAt('clm:fischer-db-scale', DB.NEURONS, DB.COUNT);
  const passes = figureAt('clm:fischer-db-scale', DB.PASSES, DB.COUNT);
  const rawFiles = figureAt('clm:fischer-raw-archive', ARCHIVE.RAW, ARCHIVE.COUNT);

  return (
    <Band tone="ink" id="top" bleed className={scrim.ground}>
      {/*
        THE PHOTOGRAPH. Absent from this repository, and therefore absent from
        the DOM — not hidden, not transparent, not a 1x1: `PHOTO` is null
        unless the manifest says `present: true`, every file it declares is on
        disk, and the shipped scrim covers what the generator measured. In the
        default state nothing below this line renders and the band is byte-for
        -byte the flat ink hero that shipped before the photograph existed.
      */}
      {PHOTO !== null && (
        <>
        {/*
          THE PIN. An absolutely-positioned box over the whole band holding one
          sticky child, which holds the frame. It exists because the frame is
          bounded to ONE SCREENFUL while this band runs 1.25-2.08 viewports —
          measured 2026-09-03, live: at 1280x800 the band is 1306px and the
          photo box 848px, so 458px of it (35%) had no photograph behind it at
          all, and at 375x812 that figure is 824px (49%). Anchoring the box to
          the viewport instead of to the top of the band covers 100% of the
          band at every scroll position without changing the box's size, its
          crop, its rung or its focal point. The whole argument, with the
          measurements and with what pinning does NOT fix, is THE PIN in
          hero.module.css.

          --hero-frame-bound is `.frame`'s own bound, parsed out of
          hero-scrim.module.css rather than retyped, exactly like
          --scrim-base above it: the design territory owns the number, this
          relays it, and the pin degrades to the un-pinned geometry when it
          cannot be read.

          THE aria-hidden LIVES ON THIS WRAPPER, not on .frame. It covers the
          whole subtree either way, and scripts/check-hero-blend.mjs finds the
          frame and the veil STRUCTURALLY — the band's two aria-hidden <div>
          children, the one holding an <img> being the picture. Marking both
          the wrapper and the frame would leave that unchanged; marking only
          the frame would hide the picture from that gate entirely.
        */}
        <div
          className={styles.pinWrap}
          aria-hidden="true"
          style={
            PHOTO.frameBound === null
              ? undefined
              : ({ '--hero-frame-bound': PHOTO.frameBound } as CSSProperties)
          }
        >
        <div className={styles.pin}>
        <div className={scrim.frame}>
          {/*
            The scaled, PROMOTED layer that holds both copies. Everything
            about why it is promoted, and why the hint names `transform`
            rather than `opacity`, is measured and written down in
            hero.module.css. Read that header before touching this.
          */}
          <div className={styles.bg}>
            {/*
              SOFT — a pre-baked blurred bitmap, never a live filter. WebKit
              gives a large composited layer a tiled backing and rasterises
              those tiles asynchronously, so a fast scroll outruns a filter and
              draws unpainted bands. Texture is a file. It is the EXIT veil
              under the departing band, hidden beneath the sharp copy at rest.

              Decorative: alt="" inside an aria-hidden wrapper. The band's copy
              carries every bit of the meaning, and a screen reader announcing
              a campus photograph before the h1 would bury it.
            */}
            <picture>
              {PHOTO.phone.media !== null && (
                <source media={PHOTO.phone.media} srcSet={PHOTO.phone.soft} />
              )}
              {/*
                A real <img>, not next/image, and the reason is the mechanism
                rather than convenience: this is an art-directed <picture> with
                a baked-blur companion layer, and the optimiser would route
                both copies through /_next/image — re-encoding files the
                generator already encoded to a byte budget, and putting an
                indirection between the preload scanner and the ladder. The
                assets are pre-generated and named for their widths; there is
                nothing left to optimise at request time.
              */}
              <img
                className={`${styles.photo} ${scrim.focal}`}
                src={PHOTO.desktop.soft}
                alt=""
                loading="eager"
                decoding="async"
                draggable={false}
              />
            </picture>

            {/*
              SHARP — the full ladder inside the promoted .sharp element. The
              <img> itself is never animated; .sharp's composited opacity does
              the cross-fade (1 at rest → 0 on exit), which is only cheap
              because the layer is promoted.

              ORDER IS THE SELECTION ALGORITHM, not a preference list: the
              browser takes the FIRST <source> whose media and type it
              supports, so the phone crop's media-scoped sources come first and
              AVIF precedes WebP within each crop. The bare <img> is the
              desktop crop, which is also the no-<picture>-support fallback.
            */}
            <div className={`${styles.layer} ${styles.sharp}`}>
              <picture>
                {PHOTO.phone.media !== null && PHOTO.phone.avif !== null && (
                  <source
                    media={PHOTO.phone.media}
                    type="image/avif"
                    srcSet={PHOTO.phone.avif}
                    sizes={PHOTO.phone.sizes}
                  />
                )}
                {PHOTO.phone.media !== null && (
                  <source
                    media={PHOTO.phone.media}
                    type="image/webp"
                    srcSet={PHOTO.phone.webp}
                    sizes={PHOTO.phone.sizes}
                  />
                )}
                {PHOTO.desktop.avif !== null && (
                  <source
                    type="image/avif"
                    srcSet={PHOTO.desktop.avif}
                    sizes={PHOTO.desktop.sizes}
                  />
                )}
                {/* A real <img> rather than next/image — see the soft copy above. */}
                <img
                  className={`${styles.photo} ${scrim.focal}`}
                  src={PHOTO.desktop.fallback}
                  srcSet={PHOTO.desktop.webp}
                  sizes={PHOTO.desktop.sizes}
                  width={PHOTO.desktop.width ?? undefined}
                  height={PHOTO.desktop.height ?? undefined}
                  alt=""
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  draggable={false}
                />
              </picture>
            </div>
          </div>

          {/*
            NO BLEND LAYER HERE. A second darkening ramp used to live at
            this position, a sibling of .bg inside .frame. It was removed
            once the veil's own ramp was widened to the full vertical
            aperture: two overlapping ramps of different lengths add their
            alphas and the SHORTER one then sets the edge, so the helper
            became the defect. Measured both ways before removing it — the
            numbers are in hero.module.css.
          */}
        </div>
        </div>
        </div>

          {/*
            THE VEIL — a SIBLING of the pinned frame, never a child of it: it
            spans the whole band and stays anchored to the BAND, because it is
            shaped to the TEXT. That asymmetry is the design and it is not an
            oversight — the veil's transparent crest is legal only because it
            is provably text-free, and a crest pinned to the viewport would
            slide under the headline the moment the reader scrolled.

            Its unmasked wash still dissolves to fully opaque --ground at
            `--frame-foot` (min(100%, 132svh)), so below one screenful of BAND
            the picture the pin now puts there is behind a closed curtain —
            measured by hiding the photograph and differencing the render, 65%
            of the last screenful at 375x812 and 18% at 1280x800 are veiled to
            within one sRGB level of flat ink. That is the other half of this
            fix and it belongs to the file that owns those stops, but it is a
            COORDINATE change rather than a depth change: the pin moved the
            picture's bottom edge into viewport coordinates, and 189 measured
            samples show it is never exposed inside the band. The full argument
            and the numbers are under THE PIN in hero.module.css.

            --scrim-base is the ONLY thing this component tells the scrim, and
            it is the generator's measurement, not a style: the alpha at which
            the brightest glyph-sized patch of THIS photograph still clears
            4.5:1 against the weakest ink foreground. hero-scrim.module.css
            clamps it to its own 93% floor, so the relay can only ever make
            the veil DARKER — an absent or garbled measurement lands on the
            safe end, never the pretty one.
          */}
          <div
            className={scrim.scrim}
            aria-hidden="true"
            style={{ '--scrim-base': PHOTO.requiredAlpha } as CSSProperties}
          />
        </>
      )}

      {/*
        The one rAF loop. Mounted here rather than in the root layout because
        the hero is its only consumer and the layout belongs to another
        territory; it is also the stricter placement, since a page with no hero
        never mounts a driver at all. It renders nothing.
      */}
      <ScrollDriver />

      <div className={`wrap ${styles.inner}`}>
        {/*
          ── TWO COLUMNS, AND WHAT THE SPLIT IS FOR ─────────────────────────

          The band used to run as one column: identity, then the threshold,
          then the two readouts, then the caveats, then the actions. Everything
          a recruiter came for sat BELOW the sentence explaining who he is, in
          the order it happened to be written.

          It is now identity on the left and EVIDENCE on the right, three
          blocks each opening with the kind of thing it is — research,
          recognition, research infrastructure. Two consequences, and the
          second is the one that matters:

            · the figures rise. On one column the readouts sat at the bottom of
              the band; beside the lede they are level with it, so the first
              screen carries the claim and its evidence at the same time
              instead of asking the reader to scroll for the second.
            · the blocks say WHAT THEY ARE before they say what they measure.
              "P@1 0.585" is a number until something calls it research; the
              eyebrow is the difference between a figure a reader has to
              interpret and one they can file.

          The CATEGORY EYEBROWS ARE THE ONLY NEW WORDS. Every figure, label,
          note and caveat below is the string it already was, from the accessor
          it already used — this is a reorganisation, not a rewrite, and the
          numeric licensing gate (C8) would fail the build if it were not.
        */}
        <div className={styles.split}>
          {/* ── LEFT: who, in his own words ──────────────────────────────── */}
          <div>
            {/*
              THE CITY IS DELIBERATELY NOT HERE. This line used to read
              "Seattle, Washington · M.S. Data Science, Seattle University",
              which put SEATTLE twice in one line and a third time in the nav
              directly above it. "Seattle University" already places him.

              The location signal is NOT lost: lib/seo.ts publishes
              homeLocation with addressLocality "Seattle" / addressRegion "WA"
              in the Person schema, which is what a search engine and an ATS
              actually read.
            */}
            <Eyebrow>M.S. Data Science · Seattle University</Eyebrow>

            {/*
              THE NAME IS MIST BLUE, THE LEDE IS NOT — and that split is the
              whole idea rather than a decoration.

              WHY COOL AND NOT WARM. This went through a warm cream first,
              matching the lockup, and the cream was the weaker answer: the
              photograph's lights are amber, so a warm name sits INSIDE the
              picture's own hue and has only luminance left to separate with.
              Mist blue sits across it. The name reads as a distinct object,
              and the sunset reads warmer by comparison.

              A ROLE, NOT THE HEX. --fg-brand is mist on ink and plain --fg on
              paper and crimson, where the same blue would be 1.48:1 and
              unreadable. IT IS DARKER THAN THE CREAM WAS (luminance 0.628
              against 0.690), so it has LESS headroom against the band's
              brightest sky; rule 5b's collar in hero-scrim.module.css is what
              carries it.
            */}
            {/*
              THE WEIGHT IS SET HERE BECAUSE THE SCALE HAD IT BACKWARDS.
              --text-h1--font-weight is 200 and the lede below sets font-[300],
              so the name was the THINNEST ink in the block while being the
              largest — big enough to be the heading, light enough to read as
              background, and at a glance weight wins. That is the whole reason
              it looked crammed in with the sentence under it rather than
              leading it. 400 puts it a full step above the lede instead of one
              below, which is the relationship every reference render of this
              page has and this one did not.

              SCOPED TO THE HERO, not to the scale. `h1, h2 { font-weight: 200 }`
              in app/globals.css is right for the band headings further down the
              page, which sit on paper at a smaller step and would go heavy and
              cheap at 400. This is the one h1 set at 64px over a photograph.
            */}
            <h1 className="mt-[20px] max-w-[14ch] font-[400] text-[color:var(--fg-brand)]">
              Duy Nguyen
            </h1>

            {/*
              THE MEASURE IS 32ch AND IT IS A COPY DECISION (browser-measured
              at 1280x800, 2026-09-03). At 26ch the balancer resolved this into
              FOUR display lines inside an 1088px wrap — a 176px slab with a
              third of its column empty. At 32ch it resolves into THREE.

              IT NOW BINDS DIFFERENTLY. The left column is narrower than the
              old full wrap, so the column — not this max-width — is usually
              the constraint. The value is kept because it still governs the
              one-column layout below the breakpoint, where the wrap is the
              measure again.
            */}
            <Reveal index={1}>
              <p className="mt-[30px] max-w-[32ch] font-display text-h2 font-[300] text-balance">
                I design experiments for machine-learning systems where being wrong has a
                cost — and I build the infrastructure they run on.
              </p>
            </Reveal>

          </div>

          {/* ── RIGHT: the evidence, filed ───────────────────────────────── */}
          <div className={styles.evidence}>
            <div>
              <Eyebrow>Research</Eyebrow>
              {/*
                FIGURE 1 — the threshold. The only <Threshold> in the hero, and
                one of two on the whole page: past three the device stops
                meaning "threshold" and starts meaning "line".
              */}
              <Threshold
                index={3}
                clearedValue={fineTuned}
                clearedLabel={`Mammo-CLIP, fine-tuned — the only arm of ${cells} to clear it`}
                value={`P@1 ${floor}`}
                label="held-out majority-class retrieval floor"
                cleared={`${frozen} frozen → ${fineTuned} fine-tuned, the decoder frozen throughout`}
              />
            </div>

            {/*
              FIGURES 2 and 3 — the award and the barn-owl database.

              THE NOTES ARE `pageShort`, NOT `pageText`, AND THAT IS THE
              ACCESSOR DOING WHAT IT SAYS. evidence.tsx documents pageShort as
              "a licensed short form — chip and READOUT length"; the corpus's
              full third-person sentences are two-line paragraphs under a
              device whose whole shape is figure / label / one line.

              Nothing left the page. clm:cause-blind-judging is still attached
              to clm:cause-win here, which its own corpus note requires ("Keep
              it attached to clm:cause-win in copy"), and clm:fischer-selfserve
              — the outcome claim for rol:fischer-rde — is still in short form.
            */}
            <div>
              <Eyebrow>Recognition</Eyebrow>
              <Readout
                className="mt-[14px]"
                value={pageShort('clm:cause-win')}
                label="Student Data Scrollytelling Contest"
                note={pageShort('clm:cause-blind-judging')}
              />
            </div>

            <div>
              <Eyebrow>Research infrastructure</Eyebrow>
              <Readout
                className="mt-[14px]"
                value={`${neurons} neurons · ${passes} passes · ${rawFiles} raw files`}
                label="one queryable database for the barn-owl lab"
                note={pageShort('clm:fischer-selfserve')}
              />
            </div>
          </div>

          {/*
            ── THE ACTIONS ARE A THIRD GRID CHILD, NOT A CHILD OF THE LEFT
               COLUMN, AND THAT IS A LEGIBILITY FIX RATHER THAN A LAYOUT ONE.

            They belong under the lede on desktop, which is where the reference
            render puts them and where a reader who has decided can act without
            passing every caveat first. Nesting them in the identity column got
            that — and, below the 900px split, pushed the whole evidence stack
            down by the height of three buttons.

            THAT MOVE BROKE A GLYPH. At 375 the "0.585" figure landed on a
            brighter patch of the photograph and measured 2.78:1 against its
            3:1 obligation, caught at the INK PIXELS by
            tests/e2e/hero-contrast.spec.ts — a real failure, not a sampling
            artefact, because that test differences the rendered frame against
            the same frame with the fill removed and so already credits the
            collar.

            As its own grid child placed by AREA, the actions sit under the
            lede on desktop and after the evidence in source order, so the
            phone gets the stacking it had before and the figure lands back on
            the ground it was solved against. No `order:` declaration is
            involved, so the DOM order, the tab order and the screen-reader
            order are the one order this comment describes.
          */}
          <div className={styles.actions}>
            <Btn href="#fit">Ask about a role</Btn>
            <Btn href="/docs/Resume.pdf" variant="ghost">
              Résumé (PDF)
            </Btn>
            <EvidenceLink id="art:github" label="GitHub" />
          </div>
        </div>

        {/*
          THE PAGE'S THESIS USED TO SIT HERE — "Every figure on this page is
          licensed by a record that names its source…" — and it now opens the
          research band instead. It started at y=890 against a fold of 800: it
          was ninety pixels below the fold of the viewport it was written for,
          so it did no hero work at all, and it sat BETWEEN the three figures
          and the caveats that qualify them. The brief's rule is that the
          caveats sit *with* the figures; deleting the paragraph that separated
          them is that rule enforced, not weakened.
        */}

        {/*
          The mandatory caveats of everything above. C10 fails the build if a
          claim is rendered without them, which is what makes this block
          structural rather than polite.

          IT SPANS BOTH COLUMNS, at the foot of the band, because it qualifies
          figures in one column and a claim in the other. Putting it under the
          evidence column alone would have implied it qualified only that.
        */}
        <Limit
          ids={['clm:yang-label-caveat', 'clm:fischer-live-caveat']}
          /*
            A READING MEASURE, not a decoration. These were the only lines of
            running prose on the site set to the full 1088px page measure —
            ~120 characters — while nine other bands already pull their prose
            to `--container-prose`. The rule and the measurement are THE
            QUOTED LIMITS GET A READING MEASURE in hero.module.css.
          */
          className={styles.limits}
        >
          {HERO_DISCLOSURE !== null && (
            /*
              Rendered verbatim from the corpus and never reformatted: C15
              matches this string against the built HTML. Same <li> shape as
              the ids above, because it is not a footnote about the page — it
              is one of the page's stated limits.
            */
            <li className="text-[0.85rem] leading-[1.6] text-[color:var(--fg-muted)]">
              {HERO_DISCLOSURE.text}
            </li>
          )}
        </Limit>
      </div>
    </Band>
  );
}
