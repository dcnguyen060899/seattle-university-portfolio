/**
 * components/site/hero.tsx — band 1. The ink ground, and the first of the two
 * the page is allowed (see components/ui/system.ts for the budget).
 *
 * ── THE BAND IS THE NAME AND THE SLOGAN, AND NOTHING ELSE (2026-09-08) ────
 *
 * Until 2026-09-08 this band carried three titled evidence blocks beside the
 * name — the retrieval threshold, the contest win, the barn-owl database —
 * and the quoted caveats under them: roughly 1,000 characters of copy on the
 * first screen. The owner's verdict on it was the one every recruiter-lens
 * review had already given: "text is a bit too lengthy, no recruiter would
 * actually read those… in the first page just highlight my name and slogan".
 *
 * So the first screen is now four things: the programme line, the name, the
 * statement, and the three actions. The three claims did not leave the page;
 * they moved one scroll down into components/site/highlights-band.tsx, where
 * each has a title, one line and one link, and where the caveats the corpus
 * attaches to them are rendered beside them (check C10 still holds that).
 *
 * WHAT THIS BAND STILL OWES. One line of fine print at its foot: the
 * AI-disclosure for the picture behind it, which is a property of the image
 * and stays with the image. It is the only thing on the first screen that is
 * not the owner's own words, and it keeps the 32px dash every block on this
 * page opens with — that dash is also the element scripts/check-hero-contrast
 * .mjs credits the `--rule` collar on (`.threshold-rule`), and
 * tests/e2e/hero-contrast.spec.ts holds that the selector still matches
 * something inside the band.
 *
 * GPA and the Dean’s Honor Roll stay where Addendum B R-8 put them: out of
 * the hero. They are credentials, not results, and the résumé carries them.
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

import { Band, Btn, Reveal } from '@/components/ui';
import { heroCaption, heroMotionPolicy } from '@/lib/corpus/hero-asset';
import {
  HERO_MOTION_PREVIEW,
  HERO_MOTION_PREVIEW_ON_DEPLOY_HOST,
  MOTION_FILE_NAME,
  MOTION_PUBLIC_DIR,
  parseHeroMotion,
} from '@/lib/hero-motion';
import type { HeroMotion } from '@/lib/hero-motion';
import { artifactUrl } from './evidence';
import { HeroMotionLayer } from './hero-motion';
import { ScrollDriver } from './scroll-driver';
import scrim from './hero-scrim.module.css';
import styles from './hero.module.css';

/* ══════════════════════════════════════════════════════════════════════════
   THE ASSET GATE
   ══════════════════════════════════════════════════════════════════════════ */

const PUBLIC_DIR = join(process.cwd(), 'public');
const MANIFEST_PATH = join(PUBLIC_DIR, 'brand', 'hero', 'manifest.json');
const MOTION_DIR = join(PUBLIC_DIR, 'brand', 'hero', 'motion');
const MOTION_MANIFEST_PATH = join(MOTION_DIR, 'manifest.json');
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
  /**
   * The looping motion clip registered over the still, or null for the still
   * hero — the shipping state until 2026-09-06, and still what an absent clip,
   * a failed verdict or a record that may not render resolves to. Resolved by
   * `readHeroMotion`: the motion manifest, the file on disk, a passing harness
   * verdict, and the provenance record all have to agree, and
   * lib/hero-motion.ts's switch — on by default since 2026-09-06, `off` the
   * kill — still gates the client, which is where an `off` build stops. Null
   * here means the layer's component is rendered with nothing to play; its
   * SSR output is nothing either way.
   */
  motion: HeroMotion | null;
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

  return { phone, desktop, requiredAlpha: required, frameBound, motion: readHeroMotion(desktop) };
}

/**
 * Resolves the motion clip, or null for the still hero. NEVER THROWS on an
 * absent or malformed manifest: every failure path here is a hero that renders
 * exactly the still it rendered on every build until 2026-09-06 (and still
 * renders on every phone), and `present: false` — the state the manifest was
 * first committed in — is a documented, legal state, silent like the
 * photograph's.
 *
 * WHAT HAS TO AGREE BEFORE A CLIP IS EVEN OFFERED TO THE CLIENT (the client
 * then applies lib/hero-motion.ts's flag and its own nine-step gate):
 *
 *   1. `public/brand/hero/motion/manifest.json` says `present: true` and names
 *      ONE file in the only grammar the layer loads, `hero-loop-<sha8>.{mp4,webm}`.
 *   2. That file is on disk — the same existsSync discipline as the rungs, so a
 *      manifest that drifted from the directory drops the clip instead of
 *      emitting a <video> that 404s.
 *   3. The manifest records a PASSING verdict from scripts/check-hero-motion.mjs.
 *      The still's contrast numbers were solved against the still; a clip that
 *      has not been proved against them is not a clip this page plays.
 *   4. The provenance record (art:hero-motion, through lib/corpus/hero-asset.ts)
 *      may render — i.e. the owner has answered it and approved the line the
 *      moving picture owes the reader. He did, verbatim, on 2026-09-06
 *      (src:hero-motion-disclosure-2026-09-06), and the record is verified.
 *      The accessor throws on a missing or broken record, and that is a build
 *      failure on purpose.
 *   5. The numbers the layer registers with — duration, crop, opacity cap, and
 *      whether the clip loops at all — are a config `parseHeroMotion` trusts.
 *      The still's aspect comes from the desktop rung's own intrinsic size,
 *      never retyped.
 */
function readHeroMotion(desktop: HeroCrop): HeroMotion | null {
  if (!existsSync(MOTION_MANIFEST_PATH)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(MOTION_MANIFEST_PATH, 'utf8'));
  } catch (error) {
    warn(`motion/manifest.json is not valid JSON (${String(error)}) — the hero stays still`);
    return null;
  }
  if (!isRecord(parsed)) return null;

  // present:false — the state the manifest was first committed in, and a
  // documented, legal one. Silent: it is not a defect.
  if (parsed.present !== true) return null;

  const reject = (why: string): null => {
    warn(
      `motion clip NOT rendered — ${why}. The hero stays still, which is correct. ` +
        'Run `npm run check:motion` then `npm run verify:hero`.',
    );
    return null;
  };

  const file = str(parsed.file);
  if (file === null || !MOTION_FILE_NAME.test(file)) {
    return reject('manifest.file is missing or is not named hero-loop-<sha8>.{mp4,webm}');
  }
  if (!existsSync(join(MOTION_DIR, file))) {
    return reject(`the manifest declares ${file} but it is not on disk`);
  }

  const harness = isRecord(parsed.harness) ? parsed.harness : null;
  if (harness === null || harness.verdict !== 'PASS') {
    return reject('the manifest records no passing verdict from scripts/check-hero-motion.mjs');
  }

  if (desktop.width === null || desktop.height === null || !(desktop.height > 0)) {
    return reject('the desktop rung has no intrinsic size for the clip to register against');
  }

  const policy = heroMotionPolicy();
  if (!policy.mayRender) {
    if (!HERO_MOTION_PREVIEW) {
      return reject(
        `art:hero-motion is "${policy.status}" — the moving picture may not ship until the ` +
          'owner has resolved its provenance record and approved the disclosure line',
      );
    }
    // A preview is a localhost build and nothing else: the record is still open,
    // so the line the moving picture owes the reader is not on the page yet.
    if (HERO_MOTION_PREVIEW_ON_DEPLOY_HOST) {
      throw new Error(
        'NEXT_PUBLIC_HERO_MOTION=preview on the deploy host: a preview renders an installed clip ' +
          `while art:hero-motion is "${policy.status}", which is exactly what may not ship. ` +
          'Unset it, or verify the record and use "on".',
      );
    }
    warn(`motion PREVIEW — art:hero-motion is "${policy.status}"; the clip renders on this localhost build only`);
  }

  const motion = parseHeroMotion({
    src: `${MOTION_PUBLIC_DIR}/${file}`,
    type: file.endsWith('.webm') ? 'video/webm' : 'video/mp4',
    poster: desktop.soft,
    durationS: parsed.durationS,
    crop: parsed.crop,
    /* The manifest's word on whether the clip wraps. Passed through UNTOUCHED,
       including `undefined` — `parseHeroMotion` is the one place the default
       (true, a loop) is written, so a clip installed before the flag existed
       and a clip that declares itself a loop cannot disagree. */
    loop: parsed.loop,
    stillAspect: desktop.width / desktop.height,
    opacityCap: parsed.opacityCap,
  });
  if (motion === null) {
    return reject("the manifest's durationS, crop or opacityCap is not a config the layer trusts");
  }
  return motion;
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
 * campus." Since 2026-09-08 it is the only fine print in the band — the
 * figures and their caveats moved to the highlights band — and it sits at
 * the band's foot under the same 32px dash every block on this page opens
 * with, because it is the same kind of object: a stated limit, on the
 * largest element on the page.
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
  return (
    <Band tone="ink" id="top" bleed className={`${scrim.ground} ${styles.band}`}>
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

            {/*
              MOTION — the living background, after the sharp layer so it sits
              above it in the same promoted `.bg` (it inherits the exit scale
              and the frame's clip). A client component that renders NOTHING
              on the server and nothing until its gate has passed, so the HTML
              here is byte-identical to a hero without it, and every gate that
              counts this band's <img> sees an unchanged tree. What it may
              play is `PHOTO.motion` — the installed Seedance 2 loop on every
              build since 2026-09-06; null with no clip, a failed verdict or
              a record that may not render — and the build-time switch in
              lib/hero-motion.ts still has to be on, which it is unless a
              deploy sets it `off`. The whole argument is in
              components/site/hero-motion.tsx.
            */}
            <HeroMotionLayer motion={PHOTO.motion} />
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
          ── ONE COLUMN, FOUR THINGS ─────────────────────────────────────────

          The programme line, the name, the statement, the actions. The band
          used to split into identity-left / evidence-right at 900px; the
          evidence is one band down now, so the grid, the areas and the
          `order` argument that went with them are gone with it. What is left
          is the reading order and the tab order, which are the same order.
        */}
        <div className={styles.copy}>
          {/*
            THE CITY IS DELIBERATELY NOT HERE. "Seattle University" already
            places him, and lib/seo.ts publishes the locality in the Person
            schema, which is what a search engine and an ATS actually read.
            Sentence case, body face, a comma: the first thing on the page and
            the first tell of a template if it were a tracked mono eyebrow.

            --fg, NOT --fg-muted (2026-09-08). The one-screen band puts the
            portrait crop's lit windows under this line at 768x1024, and the
            brightest pixel there measured 2.62:1 against the muted role
            (tests/e2e/hero-contrast.spec.ts, the 3:1 ink-pixel floor); the
            same pixel is 6.3:1 against --fg. hero.module.css's type essay
            already names --fg-muted as the residual failure in this band and
            says the fix is to retire it from the photographic region — for
            this line only, because the foot's disclosure sits where the veil
            dissolves to ground and its muted colour is what keeps
            hero-blend.spec.ts's "no deeper than legibility requires" budget
            honest. Hierarchy here is size and weight, not tone.
          */}
          <p className="font-body text-[0.9375rem] leading-[1.4] text-[color:var(--fg)]">
            M.S. Data Science, Seattle University{'\u00a0'}·{'\u00a0'}second year
          </p>

          {/*
            THE NAME IS MIST BLUE, THE STATEMENT IS NOT — and that split is the
            whole idea. The photograph's lights are amber, so a warm name sits
            inside the picture's own hue; mist blue sits across it. --fg-brand
            is mist on ink and plain --fg elsewhere; rule 5b's collar in
            hero-scrim.module.css carries it over the band's brightest sky.

            THE ONE h1 ON THE PAGE SET IN THE SERIF, at 500 against the
            statement's 300, so at a glance the name outweighs the sentence
            beside it by a full step. app/layout.tsx carries the argument for
            why a personal name may leave the university's display face.
          */}
          <h1 className="mt-[16px] max-w-[14ch] font-serif font-[500] tracking-[-0.01em] text-[color:var(--fg-brand)]">
            Duy Nguyen
          </h1>

          {/*
            THE STATEMENT IS 18→28px, NOT --text-h2: at --text-h2 it was 0.63 of
            the name and wrapped to six two-word lines. clamp(1.125rem, 2.2vw,
            1.75rem) is 0.50 of the name at 375 and 0.44 at 1280 — a sentence
            under a heading that is clearly the heading. The owner approved
            these words verbatim; this file does not restate them.
          */}
          <Reveal index={1}>
            <p className="mt-[30px] max-w-[32ch] font-display text-[length:clamp(1.125rem,2.2vw,1.75rem)] leading-[1.3] tracking-[-0.01em] font-[300] text-balance">
              I find out whether a machine-learning result is real, build the data it
              depends on, and explain it to the people who decide.
            </p>
          </Reveal>

          {/*
            `face="body"`: sentence-case Inter 500 at 14px. With every tracked
            cap gone from the band, mono-caps buttons would be the last thing
            on it still shaped like a form control. The Btn default is
            unchanged, so the contact band and the agent panel keep the mono
            idiom. tests/e2e/hero-contrast.spec.ts samples the ghost button's
            border by name; keep the résumé button a ghost.
          */}
          <div className={styles.actions}>
            <Btn href="#fit" face="body">
              Ask about a role
            </Btn>
            <Btn href="/docs/Resume.pdf" variant="ghost" face="body">
              Résumé (PDF)
            </Btn>
            {/*
              A ghost BUTTON, not a quiet link (2026-09-08 review). At 375 the
              three actions cannot share a row (148 + 137 + 46px in a 335px
              column), so the third wraps — and a bare word under two boxed
              buttons read as a stray label. Boxed, the wrapped row reads as a
              third action. The URL is the corpus's, not typed.
            */}
            <Btn
              href={artifactUrl('art:github')}
              variant="ghost"
              face="body"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </Btn>
          </div>
        </div>

        {/*
          THE FOOT. The disclosure the picture owes, rendered verbatim from the
          corpus and never reformatted: C15 matches this string against the
          built HTML whenever hero assets are on disk. It sits at the band's
          foot — `.foot` takes the flex column's remaining height — so the
          first screen reads name, statement, actions, and then, at the bottom
          edge where the photograph dissolves into the ground, one line saying
          what the photograph is.

          THE DASH ABOVE IT IS `.threshold-rule`, NOT DECORATION. The scrim's
          `--rule` collar is credited on that selector
          (hero-scrim.module.css rule 7) and hero.module.css shortens it to the
          32px stub every block on the page opens with. It is the one element
          of that class left in the band, and it renders only WITH the
          disclosure — i.e. only when a photograph is on disk, which is the
          only state in which the browser gate samples this band's collars.
        */}
        {HERO_DISCLOSURE !== null && (
          /*
            `data-hero-caption` is for tests/e2e/nav.spec.ts, which counts how
            many times the first screen states the affiliation and must not
            count a caption that names the campus in a picture. An attribute,
            nothing visual; nothing in the cascade reads it.
          */
          <div className={styles.foot} data-hero-caption="">
            <Reveal as="hr" motion="none" index={2} className="threshold-rule" />
            <p className="mt-[8px] text-[0.8rem] leading-[1.55] text-[color:var(--fg-muted)]">
              {HERO_DISCLOSURE.text}
            </p>
          </div>
        )}
      </div>
    </Band>
  );
}
