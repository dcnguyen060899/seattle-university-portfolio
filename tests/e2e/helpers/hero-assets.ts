import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Type-only: erased at compile time, so `tests/unit/hero-assets.test.ts` can
// import this module under Vitest without pulling Playwright into the run.
import type { Page } from '@playwright/test'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HERO PHOTOGRAPH CONTRACT — pinned in one place, imported by four gates.
 *
 *   tests/e2e/hero-photo.spec.ts      runtime: which rung each viewport
 *                                     downloads, AVIF-before-WebP, the two-copy
 *                                     sharp/soft contract, fetchPriority.
 *   tests/e2e/hero-contrast.spec.ts   the legibility floor over real pixels.
 *   tests/e2e/hero-scroll-perf.spec.ts the promotion hint + the frame budget.
 *   tests/unit/hero-assets.test.ts    the files themselves.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────
 *
 * The source photograph is NOT in the repository and cannot be put there by
 * any agent: the owner drops it at `public/brand/hero-source.{png,jpg}` and
 * runs one command. Every test that needs pixels therefore has to be written
 * against a contract rather than against files, and the contract has to be
 * readable by both runners without either of them reverse-engineering whatever
 * eventually shows up on disk.
 *
 * ── THE GATING RULE, AND WHY IT IS NOT A SILENT PASS ─────────────────────
 *
 * ABSENT ASSETS IS THE PRIMARY, SHIPPING STATE — not a degraded one. The hero
 * is `data-ground="ink"` and every colour in it is measured against a flat
 * #14161A; with no photograph it must render exactly what ships today. That
 * state is asserted UNCONDITIONALLY (hero-photo.spec.ts §1), so the absence of
 * the photo is covered, not merely tolerated.
 *
 * What IS gated is the present-asset contract, and it is gated on the FILES,
 * not on a flag: `heroPhotoHasLanded()` flips true the moment ONE sharp
 * variant appears, and from that instant the whole ladder is asserted. A
 * half-landed ladder is a failure, never a skip. Every gated test prints
 * NOT_LANDED_MESSAGE when it skips, because a green skip that reads as
 * coverage is how a contrast regression ships.
 *
 * ── WHAT IS PINNED AND WHAT IS DERIVED (deliberate) ──────────────────────
 *
 * PINNED: the directory, the filename grammar, both formats per rung, the two
 * baked soft bitmaps, the byte budget, the generator path, the README.
 *
 * DERIVED: the rung WIDTHS and the art-direction breakpoint. The reference
 * repo pins its widths because its master is committed and its design is
 * finished; here the master does not exist yet, so its native width — and
 * therefore every rung above which upscaling would begin — is unknowable at
 * the time these tests are written. Pinning a guessed ladder would produce a
 * gate that fails for being wrong rather than for the page being wrong. So the
 * widths are read from the generator's own constants (double-entry: the unit
 * layer fails loudly if the generator and the shipped files disagree), and the
 * runtime layer asserts the PROPERTIES a ladder must have — one rendition per
 * viewport, no crop mixing, no phone paying for the desktop file — which hold
 * for any honest ladder.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════
   Paths — the contract with the pipeline territory
   ════════════════════════════════════════════════════════════════════════════ */

export const REPO_ROOT = process.cwd()

/** Where the generated ladder lives. Brand assets are at `/brand/` (Addendum B, R-14). */
export const HERO_DIR = path.join(REPO_ROOT, 'public', 'brand', 'hero')

/** The public URL prefix the markup must use for every variant. */
export const HERO_URL_PREFIX = '/brand/hero/'

/**
 * The owner's drop point. He supplies ONE file here and runs the generator;
 * nothing else about the pipeline is his problem. Extensions in preference
 * order — the first that exists wins.
 */
export const HERO_SOURCE_CANDIDATES = [
  path.join(REPO_ROOT, 'public', 'brand', 'hero-source.png'),
  path.join(REPO_ROOT, 'public', 'brand', 'hero-source.jpg'),
  path.join(REPO_ROOT, 'public', 'brand', 'hero-source.jpeg'),
] as const

/** The generator that turns the source into the ladder. */
export const GENERATOR_PATH = path.join(REPO_ROOT, 'scripts', 'gen-hero-photo.mjs')

/** The markup that wires the ladder into the page. */
export const HERO_COMPONENT_PATH = path.join(REPO_ROOT, 'components', 'site', 'hero.tsx')

/** Provenance notes must sit beside the assets. */
export const HERO_README_PATH = path.join(HERO_DIR, 'README.md')

/* ════════════════════════════════════════════════════════════════════════════
   The filename grammar, and the request matchers derived from it
   ════════════════════════════════════════════════════════════════════════════ */

/** A sharp rung: `hero-p-898.avif`, `hero-l-1402.webp`. */
export const SHARP_FILE = /^hero-([pl])-(\d+)\.(avif|webp)$/
/** A baked soft bitmap: `hero-soft-p.webp`. Blur is a FILE, never a filter. */
export const SOFT_FILE = /^hero-soft-([pl])\.webp$/

/**
 * Matched against DECODED request URLs, so they also hit a
 * `/_next/image?url=%2Fbrand%2Fhero%2F…` indirection if the pipeline routes
 * through the Next image optimiser.
 */
export const PORTRAIT_REQUEST = /hero-p-\d+\.(?:avif|webp)/
export const LANDSCAPE_REQUEST = /hero-l-\d+\.(?:avif|webp)/
export const SOFT_PORTRAIT_REQUEST = /hero-soft-p\.webp/
export const SOFT_LANDSCAPE_REQUEST = /hero-soft-l\.webp/
export const ANY_SHARP_REQUEST = /hero-[pl]-\d+\.(?:avif|webp)/
export const ANY_SOFT_REQUEST = /hero-soft-[pl]\.webp/
/** Anything the hero round is allowed to put on the wire. */
export const ANY_HERO_ASSET = /hero-(?:[pl]-\d+|soft-[pl])\.(?:avif|webp)/

/**
 * Byte-budget regression stop. 400KB matches the reference's ceiling, whose
 * largest shipped file uses two thirds of it — so this is a stop, not a target.
 * It applies per FILE, and it exists to stop a heavy export shipping, never to
 * be raised so one can.
 */
export const MAX_HERO_FILE_BYTES = 400 * 1024

/* ════════════════════════════════════════════════════════════════════════════
   Presence probes
   ════════════════════════════════════════════════════════════════════════════ */

/** Files currently in the hero asset directory ([] before the round lands). */
export function heroAssetFiles(): string[] {
  if (!existsSync(HERO_DIR)) return []
  return readdirSync(HERO_DIR).filter((name) => !name.startsWith('.'))
}

/** True once ANY sharp variant exists. One file arms the full contract. */
export function heroPhotoHasLanded(): boolean {
  return heroAssetFiles().some((name) => SHARP_FILE.test(name))
}

/** The owner's source photograph, if he has dropped it in. */
export function heroSourcePath(): string | null {
  return HERO_SOURCE_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null
}

export const NOT_LANDED_MESSAGE =
  'SKIPPED, NOT SATISFIED — the hero photograph has not landed. No hero-p-*/hero-l-* files ' +
  `exist in ${HERO_DIR}, so the present-asset contract cannot be asserted. The flat ink ground ` +
  'is the documented no-asset state and it IS covered, unconditionally, by ' +
  'tests/e2e/hero-photo.spec.ts §1. Drop the photograph at public/brand/hero-source.png and run ' +
  '`node scripts/gen-hero-photo.mjs` to arm this. DO NOT READ THIS SKIP AS COVERAGE.'

/* ════════════════════════════════════════════════════════════════════════════
   The ladder, as it exists on disk
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Files that legitimately sit in the asset directory without being a rung.
 *
 * The list is short and each entry earns its place, because everything here
 * deploys to the CDN whether or not the page can reference it:
 *
 *   README.md      provenance and regeneration notes. Assets without them are
 *                  how the next agent re-derives the ladder wrong.
 *   manifest.json  read by `components/site/hero.tsx` at build time — the
 *                  breakpoint and the measured scrim. It is data the markup
 *                  genuinely consumes, not a build artefact left behind.
 *   hero-proof.webp a contact sheet of the master with both crop windows drawn
 *                  on it, so the crop constants can be judged by eye against
 *                  the actual frame instead of by re-running the generator.
 *
 * Anything else in this directory is a stray: unreferenced bytes shipping to
 * production, or — worse — a rung the naming grammar does not recognise, which
 * the markup will silently never serve.
 */
export const NON_RUNG_ALLOWLIST = ['README.md', 'manifest.json', 'hero-proof.webp'] as const

/** The ladder actually on disk, grouped the way the assertions read it. */
export interface DiskLadder {
  /** `p` / `l` -> sorted widths that have at least one encoding present. */
  widths: { p: number[]; l: number[] }
  /** `hero-p-898` -> the extensions found for it. */
  encodings: Map<string, Set<string>>
  soft: string[]
  strays: string[]
}

export function readDiskLadder(): DiskLadder {
  const files = heroAssetFiles()
  const widths = { p: new Set<number>(), l: new Set<number>() }
  const encodings = new Map<string, Set<string>>()
  const soft: string[] = []
  const strays: string[] = []

  for (const name of files) {
    if ((NON_RUNG_ALLOWLIST as readonly string[]).includes(name)) continue
    const sharp = SHARP_FILE.exec(name)
    if (sharp?.[1] && sharp[2] && sharp[3]) {
      const crop = sharp[1] as 'p' | 'l'
      const width = Number.parseInt(sharp[2], 10)
      widths[crop].add(width)
      const stem = `hero-${crop}-${width}`
      const set = encodings.get(stem) ?? new Set<string>()
      set.add(sharp[3])
      encodings.set(stem, set)
      continue
    }
    if (SOFT_FILE.test(name)) {
      soft.push(name)
      continue
    }
    strays.push(name)
  }

  return {
    widths: {
      p: [...widths.p].sort((a, b) => a - b),
      l: [...widths.l].sort((a, b) => a - b),
    },
    encodings,
    soft: soft.sort(),
    strays: strays.sort(),
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   Image dimensions, without a decoding dependency

   The reference reads sizes with `sharp`. This repo does not depend on sharp
   and adding a native image toolchain to a portfolio's devDependencies to
   measure four files is a poor trade, so the three container formats the
   pipeline can emit are parsed directly from their headers. Each parser reads
   only the fields it needs and returns null rather than guessing — a null is
   reported as "could not measure", never silently skipped.
   ════════════════════════════════════════════════════════════════════════════ */

export interface Dimensions {
  width: number
  height: number
}

function pngSize(buf: Buffer): Dimensions | null {
  if (buf.length < 24) return null
  if (buf.readUInt32BE(0) !== 0x89504e47) return null
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function jpegSize(buf: Buffer): Dimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buf[offset + 1] ?? 0
    // SOF0..SOF15 minus the non-frame markers DHT(c4), JPGA(c8), DAC(cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
    }
    const length = buf.readUInt16BE(offset + 2)
    if (length < 2) return null
    offset += 2 + length
  }
  return null
}

function webpSize(buf: Buffer): Dimensions | null {
  if (buf.length < 30) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null
  const fourcc = buf.toString('ascii', 12, 16)

  if (fourcc === 'VP8X') {
    // 4 bytes of flags/reserved, then canvas width-1 and height-1 as 24-bit LE.
    const base = 20 + 4
    const width = 1 + (buf.readUIntLE(base, 3) & 0xffffff)
    const height = 1 + (buf.readUIntLE(base + 3, 3) & 0xffffff)
    return { width, height }
  }
  if (fourcc === 'VP8 ') {
    // 3-byte frame tag, then the 3-byte start code 9d 01 2a, then 14-bit sizes.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
  }
  if (fourcc === 'VP8L') {
    if (buf[20] !== 0x2f) return null
    const bits = buf.readUInt32LE(21)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  return null
}

/**
 * AVIF is ISOBMFF. The authoritative size lives in the primary item's `ispe`
 * box; a file may carry several (an alpha auxiliary item, a thumbnail), all
 * with the same or smaller extents, so the LARGEST is the picture. Scanning
 * for the fourcc rather than walking the box tree is deliberate: the tree walk
 * would need meta/iprp/ipco/ipma parsing to say the same thing, and the fourcc
 * is unambiguous inside an ISOBMFF file.
 */
function avifSize(buf: Buffer): Dimensions | null {
  if (buf.length < 16) return null
  if (buf.toString('ascii', 4, 8) !== 'ftyp') return null
  let best: Dimensions | null = null
  for (let i = 0; i + 20 <= buf.length; i += 1) {
    if (buf[i] !== 0x69 || buf[i + 1] !== 0x73 || buf[i + 2] !== 0x70 || buf[i + 3] !== 0x65) continue
    // 'ispe': 4 bytes version+flags, then width and height as uint32be.
    const width = buf.readUInt32BE(i + 8)
    const height = buf.readUInt32BE(i + 12)
    if (width === 0 || height === 0 || width > 100_000 || height > 100_000) continue
    if (!best || width * height > best.width * best.height) best = { width, height }
  }
  return best
}

/**
 * The master's native size — the real ceiling on every rung.
 *
 * THE DOUBLE ENTRY LIVES HERE, not in a parsed constant. The reference repo
 * pins the ceiling as a literal in its generator and has a test parse it back
 * out; that works when one agent owns both sides. Here the generator is
 * another territory's file and has already renamed its constants once
 * mid-flight, so a parser keyed to their names asserts nothing but their
 * spelling. The master itself cannot be renamed away: whatever the pipeline
 * calls its variables, no rung may be wider than the file it was cut from.
 */
export function heroSourceSize(): Dimensions | null {
  const source = heroSourcePath()
  return source ? imageSize(source) : null
}

/** Effective pixel size of an image file, by container. Null when unreadable. */
export function imageSize(filePath: string): Dimensions | null {
  const buf = readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return pngSize(buf)
  if (ext === '.jpg' || ext === '.jpeg') return jpegSize(buf)
  if (ext === '.webp') return webpSize(buf)
  if (ext === '.avif') return avifSize(buf)
  return null
}

/* ════════════════════════════════════════════════════════════════════════════
   Runtime: the scroll-linked property the cross-fade is written in
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Waits for the scroll driver to prime `--focus` on `<html>`, then pins it to
 * one extreme and lets the compositor present it.
 *
 * Setting the property BEFORE the driver's first write would be silently
 * overwritten by its priming write, and the test would be measuring a race.
 *
 * Returns false when nothing ever writes `--focus` — the caller decides
 * whether that is a contract failure (the cross-fade is missing) or simply the
 * no-photo state, and says so in its own message.
 */
export async function pinFocus(page: Page, focus: 0 | 1, timeout = 10_000): Promise<boolean> {
  const primed = await page
    .waitForFunction(
      () => document.documentElement.style.getPropertyValue('--focus') !== '',
      undefined,
      { timeout },
    )
    .then(() => true)
    .catch(() => false)
  if (!primed) return false

  await page.evaluate((value) => {
    document.documentElement.style.setProperty('--focus', String(value))
  }, focus)
  // Two rAFs: one for the style recalc, one for the compositor to present it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
  return true
}

/** The container a file actually is, judged by its magic bytes. */
export function detectFormat(filePath: string): string | null {
  const buf = readFileSync(filePath, { flag: 'r' })
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp'
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12)
    return brand.startsWith('avi') || brand === 'mif1' || brand === 'msf1' ? 'avif' : brand
  }
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png'
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg'
  return null
}
