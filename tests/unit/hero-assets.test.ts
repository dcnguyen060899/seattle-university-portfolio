import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  GENERATOR_PATH,
  HERO_COMPONENT_PATH,
  HERO_DIR,
  HERO_README_PATH,
  MAX_HERO_FILE_BYTES,
  NON_RUNG_ALLOWLIST,
  SHARP_FILE,
  detectFormat,
  heroAssetFiles,
  heroPhotoHasLanded,
  heroSourcePath,
  heroSourceSize,
  imageSize,
  readDiskLadder,
} from '../e2e/helpers/hero-assets'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HERO ASSETS THEMSELVES — a file-level guard that needs no browser.
 *
 * All of this fails in `npm test`, in milliseconds, before anyone waits for a
 * Playwright run:
 *
 *   · the markup never names an asset that is not on disk (UNCONDITIONAL —
 *     the check that keeps the no-photo state honest);
 *   · the ladder is complete and closed, and every rung ships both codecs;
 *   · every filename width is honest — the width in the name IS the `w`
 *     descriptor the browser selects against, so a lying one makes it pick the
 *     wrong rendition and no runtime check can see it;
 *   · nothing was upscaled past the master it was cut from;
 *   · the two crops are genuinely different crops;
 *   · every file is inside the byte budget and is the codec its extension
 *     claims;
 *   · provenance notes sit beside the assets.
 *
 * ── WHERE THE GROUND TRUTH COMES FROM ────────────────────────────────────
 *
 * The reference repo pins its ladder as literals and parses the generator's
 * constants back out to keep the two honest. That works when one agent owns
 * both files. It does not work here: the generator belongs to another
 * territory and its constants were renamed once while this suite was being
 * written, at which point a name-keyed parser is asserting spelling rather
 * than shape. So the ground truth is the two things that cannot be renamed —
 * THE FILES ON DISK and THE MASTER THEY WERE CUT FROM. Every assertion below
 * is a property those two must have for the `<picture>` to be correct, and
 * none of them constrains a decision the pipeline territory owns (which rungs,
 * which crops, which breakpoint).
 *
 * GATING. The source photograph is the owner's to supply. Until it lands,
 * `heroPhotoHasLanded()` is false and the present-asset suite is SKIPPED,
 * never passed: a green that reads as coverage is exactly how a half-landed
 * ladder ships. One sharp variant on disk arms the whole contract.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const landed = heroPhotoHasLanded()
const files = heroAssetFiles()
const ladder = readDiskLadder()

const heroSourceRaw = existsSync(HERO_COMPONENT_PATH)
  ? readFileSync(HERO_COMPONENT_PATH, 'utf8')
  : ''

/**
 * Comments stripped before scanning — the same projection
 * `scripts/check-ground-tokens.mjs` uses on the stylesheet, and for the same
 * reason. `hero.tsx` documents the pipeline contract at length, so its header
 * legitimately writes out `public/brand/hero-source.png` and example srcsets.
 * Scanning the prose would report the documentation as the defect and teach
 * the next person to delete the comment instead of the bug.
 */
const heroSource = heroSourceRaw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Every `/brand/hero/<file>` the markup names as a LITERAL.
 *
 * `components/site/hero.tsx` builds its srcsets from the directory listing, so
 * in the healthy case this set holds only whatever appears in its prose. That
 * is the point: a literal filename in this file is a hard-coded rung that the
 * generator can prune out from under it, and the assertion below is what
 * catches the day someone adds one.
 */
const referenced = new Set(
  [...heroSource.matchAll(/\/brand\/hero\/([a-z0-9][\w-]*\.[a-z0-9]+)/gi)].map(
    (match) => match[1] ?? '',
  ),
)

describe('hero assets — the markup and the disk agree (unconditional)', () => {
  it('never names a hero asset that is not on disk', () => {
    const missing = [...referenced].filter((name) => !files.includes(name))
    expect(
      missing,
      `components/site/hero.tsx names ${missing.length} file(s) that do not exist in ` +
        `${HERO_DIR}:\n  ${missing.join('\n  ')}\n\n` +
        'Every one of these is a 404 for every visitor. THE NO-ASSET STATE IS A SHIPPING ' +
        'STATE: the photograph is progressive enhancement over a hero that already works on ' +
        'the flat ink ground, so the markup must emit no <picture> at all until the ladder ' +
        'exists. Derive the srcsets from the directory listing; do not declare them.',
    ).toEqual([])
  })

  it('never serves the raw source photograph', () => {
    const rawSource = /\/brand\/hero-source\.(?:png|jpe?g)/.exec(heroSource)
    expect(
      rawSource?.[0] ?? null,
      `components/site/hero.tsx serves the raw source file (${rawSource?.[0]}) directly. The ` +
        'source is the uncropped master; it exists to be cropped, graded, re-encoded and ' +
        `laddered by ${path.relative(process.cwd(), GENERATOR_PATH)} — never shipped.`,
    ).toBeNull()
  })
})

describe.runIf(landed)('hero assets — the shipped ladder', () => {
  it('ships a generator that can reproduce every file here', () => {
    expect(
      existsSync(GENERATOR_PATH),
      `Hero variants exist in ${HERO_DIR} but ${path.relative(process.cwd(), GENERATOR_PATH)} ` +
        'does not. Hand-cut assets cannot be re-derived when the master is re-exported, the ' +
        'crop is re-judged or a rung is added, and nothing records what they were cut from.',
    ).toBe(true)
  })

  it('contains only rungs, soft bitmaps and the three documented non-rung files', () => {
    expect(
      ladder.strays,
      `Files in ${HERO_DIR} that are neither a rung nor an allowed non-rung file:\n  ` +
        `${ladder.strays.join('\n  ')}\n` +
        `Allowed non-rung files: ${NON_RUNG_ALLOWLIST.join(', ')}.\n` +
        'A file the naming grammar does not recognise is one the markup will never serve — it ' +
        'is unreferenced bytes deploying to the CDN. If it is meant to be a rung, name it ' +
        '`hero-{p|l}-{width}.{avif|webp}`; if it is a new kind of artefact, add it to ' +
        'NON_RUNG_ALLOWLIST with the reason it earns its bytes.',
    ).toEqual([])
  })

  it('gives every sharp rung both an AVIF and a WebP encoding', () => {
    const incomplete = [...ladder.encodings.entries()]
      .filter(([, formats]) => !(formats.has('avif') && formats.has('webp')))
      .map(([stem, formats]) => `${stem}: only ${[...formats].join(', ')}`)
    expect(
      incomplete,
      `Sharp rungs missing an encoding:\n  ${incomplete.join('\n  ')}\n` +
        'AVIF is ~30% smaller at matched quality and is what almost every visitor receives; ' +
        'the WebP is the fallback <source> that keeps the <picture> honest on an engine that ' +
        'cannot decode AVIF. Ship both for every rung, or ship neither — a rung with only one ' +
        'codec is either a blank hero or bytes nobody downloads.',
    ).toEqual([])
  })

  it('bakes the blur into two files rather than leaving it to a CSS filter', () => {
    expect(
      ladder.soft,
      'The baked soft bitmaps are missing. Expected hero-soft-p.webp and hero-soft-l.webp in ' +
        `${HERO_DIR}, found: ${JSON.stringify(ladder.soft)}.\n` +
        'A CSS `filter: blur()` is evaluated at rasterisation, so every engine that re-rasters ' +
        'the layer pays for it again — the reference repo measured 2.6s of rasteriser time ' +
        'during a 1.3s scroll, and banding on WebKit’s tiled backing. The blur is a FILE. ' +
        'A crop whose soft bitmap is missing is also dropped outright by hero.tsx, so this is ' +
        'the difference between a photograph and a flat band.',
    ).toEqual(['hero-soft-l.webp', 'hero-soft-p.webp'])
  })

  it('keeps provenance notes beside the assets', () => {
    const readme = existsSync(HERO_README_PATH) ? statSync(HERO_README_PATH) : null
    expect(
      readme?.isFile() ?? false,
      `${path.relative(process.cwd(), HERO_README_PATH)} is missing. Hero assets without ` +
        'provenance are how the next agent re-derives the ladder wrong — and this particular ' +
        'photograph is a Seattle University campus image whose origin and permitted use belong ' +
        'in writing beside it, not in somebody’s memory. Document the source, the crop windows ' +
        'and the command that regenerates every variant.',
    ).toBe(true)
    expect(readme?.size ?? 0, 'the hero README exists but is empty').toBeGreaterThan(0)
  })

  it(`keeps every file inside the ${MAX_HERO_FILE_BYTES / 1024}KB byte budget`, () => {
    const overBudget = files
      .filter((name) => name.startsWith('hero-'))
      .map((name) => ({ name, size: statSync(path.join(HERO_DIR, name)).size }))
      .filter((file) => file.size > MAX_HERO_FILE_BYTES)
      .map((file) => `${file.name}: ${(file.size / 1024).toFixed(0)}KB`)
    expect(
      overBudget,
      `Hero files over budget:\n  ${overBudget.join('\n  ')}\n` +
        'This is a regression stop, not a target: re-encode harder or re-crop. Raising the ' +
        'budget to fit a heavy export is how a phone ends up downloading a megabyte before it ' +
        'can read a headline.',
    ).toEqual([])
  })

  it('names its widths honestly and never upscales past the master', () => {
    const master = heroSourceSize()
    const problems: string[] = []

    for (const name of files) {
      const match = SHARP_FILE.exec(name)
      if (!match?.[2]) continue
      const declared = Number.parseInt(match[2], 10)

      if (master && declared > master.width) {
        problems.push(
          `${name}: declares ${declared}px against a ${master.width}x${master.height} master — ` +
            'upscaled',
        )
        continue
      }

      const size = imageSize(path.join(HERO_DIR, name))
      if (!size) {
        problems.push(`${name}: could not be measured — the container header did not parse`)
        continue
      }
      if (size.width !== declared) {
        problems.push(`${name}: actual width ${size.width}px does not match its name`)
      }
    }

    expect(
      problems,
      `Variant widths are dishonest, unmeasurable or upscaled:\n  ${problems.join('\n  ')}\n` +
        (master
          ? `Master: ${master.width}x${master.height} (${path.relative(process.cwd(), heroSourcePath() ?? '')}).\n`
          : 'The master could not be measured, so only name-vs-pixels was checked.\n') +
        'The filename width IS the srcset `w` descriptor the browser selects against, so a ' +
        'mismatch makes it pick the wrong rendition — silently, and only on the device classes ' +
        'nobody tests on. Upscaling past the master invents detail the source does not have, ' +
        'costs bytes to encode, and still looks softer than letting the browser interpolate.',
    ).toEqual([])
  })

  it('encodes each file in the format its extension claims', () => {
    const wrong = files
      .filter((name) => name.startsWith('hero-'))
      .map((name) => ({
        name,
        ext: path.extname(name).slice(1),
        actual: detectFormat(path.join(HERO_DIR, name)),
      }))
      .filter((file) => file.actual !== null && file.actual !== file.ext)
      .map((file) => `${file.name}: decoded as ${file.actual}`)
    expect(
      wrong,
      `The extension lies about the codec:\n  ${wrong.join('\n  ')}\n` +
        'Static hosting serves Content-Type from the extension, so a WebP named .avif is sent ' +
        'as image/avif and fails to decode on exactly the browsers the AVIF source existed for.',
    ).toEqual([])
  })

  it('art-directs two genuinely different crops', () => {
    expect(
      ladder.widths.p.length > 0 && ladder.widths.l.length > 0,
      `The ladder ships only one crop (portrait rungs ${JSON.stringify(ladder.widths.p)}, ` +
        `landscape rungs ${JSON.stringify(ladder.widths.l)}). A 375x812 phone and a 1280x800 ` +
        'desktop are different shapes; serving one crop to both hands the framing decision to ' +
        'the browser’s object-fit instead of making it in the generator, where it can be seen.',
    ).toBe(true)

    const widestPortrait = Math.max(...ladder.widths.p)
    const widestLandscape = Math.max(...ladder.widths.l)
    const portrait = imageSize(path.join(HERO_DIR, `hero-p-${widestPortrait}.webp`))
    const landscape = imageSize(path.join(HERO_DIR, `hero-l-${widestLandscape}.webp`))
    expect(portrait, `could not measure hero-p-${widestPortrait}.webp`).not.toBeNull()
    expect(landscape, `could not measure hero-l-${widestLandscape}.webp`).not.toBeNull()
    if (!portrait || !landscape) return

    const portraitAspect = portrait.height / portrait.width
    const landscapeAspect = landscape.height / landscape.width
    expect(
      portraitAspect,
      `The "portrait" crop (${portrait.width}x${portrait.height}, aspect ` +
        `${portraitAspect.toFixed(2)}) is not meaningfully taller than the "landscape" crop ` +
        `(${landscape.width}x${landscape.height}, aspect ${landscapeAspect.toFixed(2)}). Art ` +
        'direction that ships the same framing twice is just a slower way to ship one image.',
    ).toBeGreaterThan(landscapeAspect)
  })

  it('gives the phone a rung it does not have to upscale past reason', () => {
    /**
     * A soft gate on the ONE resolution fact that is a defect rather than a
     * taste call. The hero is a full-bleed band, so the phone's crop is
     * displayed at the full viewport width; at DPR 2 a 375px viewport asks for
     * 750 device pixels and at DPR 3 for 1125. A portrait ladder whose widest
     * rung is below 750 is upscaled on EVERY modern phone, which is the device
     * class this page is most often opened on.
     *
     * It is expressed against the master, not as an absolute: if the owner
     * supplies a small photograph the ladder cannot invent pixels, and the
     * honest outcome is a warning about the master rather than a failing test
     * about the generator. So this only fails when the master HAD the pixels
     * and the ladder left them on the floor.
     */
    const master = heroSourceSize()
    const widestPortrait = Math.max(...ladder.widths.p)
    const PHONE_2X = 750
    if (!master || master.width < PHONE_2X) return

    expect(
      widestPortrait,
      `The widest portrait rung is ${widestPortrait}px, but a 375px viewport at DPR 2 needs ` +
        `${PHONE_2X} device pixels and the master is ${master.width}px wide — the pixels exist ` +
        'and the ladder is not emitting them. Every retina phone upscales this rung at paint ' +
        'time. If the portrait CROP is genuinely narrower than the master (a vertical slice), ' +
        'say so in public/brand/hero/README.md and re-anchor this expectation deliberately; ' +
        'do not delete it.',
    ).toBeGreaterThanOrEqual(PHONE_2X)
  })
})

describe.runIf(!landed)('hero assets — the photo round has not landed', () => {
  it('is consistent about the fact that it has not landed', () => {
    /* Not a placeholder: this asserts the facts that ARE true of the no-asset
       state, so the state is covered rather than merely waited on. The two
       unconditional tests above cover the important one — that nothing
       references what is not there. */
    expect(
      files.filter((name) => name.startsWith('hero-')),
      `${HERO_DIR} holds hero-* files but heroPhotoHasLanded() is false — the naming grammar ` +
        'and the presence probe disagree, which means the gating in every hero spec is wrong ' +
        'and all four of them are skipping a contract that should be armed.',
    ).toEqual([])

    const source = heroSourcePath()
    expect(
      source === null || existsSync(source),
      'The source-photograph probe disagrees with the filesystem.',
    ).toBe(true)
  })

  it.skip(
    'the ladder, byte budget, width honesty and crop separation are UNASSERTED until ' +
      'public/brand/hero-source.png exists and the generator has run — this skip is not coverage',
    () => {
      // Deliberately skipped, never passed.
    },
  )
})
