import { inflateSync } from 'node:zlib'

import { relativeLuminance, type Rgb } from './color'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RENDERED-PIXEL SAMPLING, with no image dependency.
 *
 * WHY THIS EXISTS. `tests/e2e/crimson-contrast.spec.ts` resolves a text
 * element's backdrop by hit-testing the layer stack and reading
 * `background-color`. That is the correct tool for flat grounds and it is
 * structurally unable to see through a background IMAGE — it says so itself
 * (`backgroundIsImage`) and skips those samples. The moment a photograph goes
 * behind the hero, every contrast ratio published in `app/globals.css` for the
 * ink ground is a claim about a colour that is no longer painted there.
 *
 * The only way to close that gap is to read the pixels the browser actually
 * put on screen. Playwright hands back a PNG; the reference repo decodes it
 * with `sharp`. This repo has no `sharp` and adding a native toolchain to
 * decode four screenshots is a poor trade, so the decoder is here: it handles
 * exactly what Chromium's screenshot encoder emits — 8-bit, non-interlaced,
 * colour types 0/2/4/6 — and throws a named error on anything else rather than
 * returning plausible garbage.
 *
 * NOTHING HERE JUDGES ANYTHING. It returns luminance statistics; the specs do
 * the WCAG arithmetic, in Node, where a failure message can show its working.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface DecodedImage {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8Array
}

/** PNG filter reconstruction, per RFC 2083 §6. */
function unfilter(raw: Buffer, width: number, height: number, bytesPerPixel: number): Buffer {
  const stride = width * bytesPerPixel
  const out = Buffer.alloc(stride * height)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const target = y * stride
    const previous = target - stride

    for (let x = 0; x < stride; x += 1) {
      const value = line[x] ?? 0
      const a = x >= bytesPerPixel ? (out[target + x - bytesPerPixel] ?? 0) : 0
      const b = y > 0 ? (out[previous + x] ?? 0) : 0
      const c = y > 0 && x >= bytesPerPixel ? (out[previous + x - bytesPerPixel] ?? 0) : 0

      let reconstructed: number
      switch (filter) {
        case 0:
          reconstructed = value
          break
        case 1:
          reconstructed = value + a
          break
        case 2:
          reconstructed = value + b
          break
        case 3:
          reconstructed = value + ((a + b) >> 1)
          break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          reconstructed = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default:
          throw new Error(`Unsupported PNG filter type ${String(filter)} on row ${y}`)
      }
      out[target + x] = reconstructed & 0xff
    }
  }
  return out
}

/**
 * Decodes a PNG screenshot to RGBA.
 *
 * Deliberately narrow: 8-bit depth, no interlace, colour types 0 (grey),
 * 2 (RGB), 4 (grey+alpha) and 6 (RGBA). Chromium emits type 6 (or 2 when the
 * capture is fully opaque); anything else means the capture path changed and
 * the caller should find out rather than measure noise.
 */
export function decodePng(buffer: Buffer): DecodedImage {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('Not a PNG: screenshot buffer has the wrong signature')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colourType = 0
  let interlace = 0
  const idat: Buffer[] = []

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const body = buffer.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      bitDepth = body[8] ?? 0
      colourType = body[9] ?? 0
      interlace = body[12] ?? 0
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth ${bitDepth} (only 8 is handled)`)
  }
  if (interlace !== 0) {
    throw new Error('Unsupported interlaced PNG (Adam7)')
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colourType as 0 | 2 | 4 | 6]
  if (!channels) {
    throw new Error(`Unsupported PNG colour type ${colourType}`)
  }

  const raw = inflateSync(Buffer.concat(idat))
  const planar = unfilter(raw, width, height, channels)

  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    const s = i * channels
    if (channels === 1) {
      const g = planar[s] ?? 0
      rgba[p] = g
      rgba[p + 1] = g
      rgba[p + 2] = g
      rgba[p + 3] = 255
    } else if (channels === 2) {
      const g = planar[s] ?? 0
      rgba[p] = g
      rgba[p + 1] = g
      rgba[p + 2] = g
      rgba[p + 3] = planar[s + 1] ?? 255
    } else {
      rgba[p] = planar[s] ?? 0
      rgba[p + 1] = planar[s + 1] ?? 0
      rgba[p + 2] = planar[s + 2] ?? 0
      rgba[p + 3] = channels === 4 ? (planar[s + 3] ?? 255) : 255
    }
  }

  return { width, height, data: rgba }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PatchStats {
  meanLuminance: number
  pixels: number
  /**
   * Representative PIXELS, not just luminances — the caller needs full RGB to
   * composite a translucent foreground (`--edge` is a `color-mix` with
   * `transparent`) over the exact backdrop it was measured against.
   *
   * Ordered by luminance: `min` and `max` are the two extremes actually
   * present, `p05` and `p95` the shoulders. A photograph speckles, so the
   * shoulders are what the patch "is" and the extremes bound what any single
   * glyph can land on.
   */
  min: Rgb
  p05: Rgb
  p95: Rgb
  max: Rgb
}

export type { Rgb }

/**
 * Pixel statistics over a set of rectangles of one decoded screenshot.
 *
 * Rects are in CSS pixels; `scale` converts to device pixels (1 under this
 * repo's Playwright config, but computed by the caller from the image width so
 * a DPR change cannot silently offset every sample by a factor of two).
 *
 * Returns null when the rects cover no decodable pixels at all — the caller
 * must treat that as "did not measure", never as "measured clean".
 */
export function sampleRects(
  image: DecodedImage,
  rects: readonly Rect[],
  scale = 1,
): PatchStats | null {
  const pixels: Array<{ l: number; rgb: Rgb }> = []

  for (const rect of rects) {
    const x0 = Math.max(0, Math.floor(rect.x * scale))
    const y0 = Math.max(0, Math.floor(rect.y * scale))
    const x1 = Math.min(image.width, Math.ceil((rect.x + rect.width) * scale))
    const y1 = Math.min(image.height, Math.ceil((rect.y + rect.height) * scale))

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * image.width + x) * 4
        const rgb: Rgb = {
          r: image.data[i] ?? 0,
          g: image.data[i + 1] ?? 0,
          b: image.data[i + 2] ?? 0,
          a: 1,
        }
        pixels.push({ l: relativeLuminance(rgb), rgb })
      }
    }
  }

  if (pixels.length === 0) return null

  pixels.sort((a, b) => a.l - b.l)
  const at = (q: number): Rgb =>
    (pixels[Math.min(pixels.length - 1, Math.floor(q * pixels.length))] ?? pixels[0])?.rgb ?? {
      r: 0,
      g: 0,
      b: 0,
      a: 1,
    }

  return {
    meanLuminance: pixels.reduce((a, p) => a + p.l, 0) / pixels.length,
    pixels: pixels.length,
    min: pixels[0]?.rgb ?? { r: 0, g: 0, b: 0, a: 1 },
    p05: at(0.05),
    p95: at(0.95),
    max: pixels[pixels.length - 1]?.rgb ?? { r: 0, g: 0, b: 0, a: 1 },
  }
}

/** A short, paste-into-an-issue rendering of a sampled patch. */
export function describePatch(stats: PatchStats): string {
  const show = (rgb: Rgb): string =>
    `rgb(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)}) L ${relativeLuminance(rgb).toFixed(4)}`
  return (
    `${stats.pixels}px, mean L ${stats.meanLuminance.toFixed(4)} · ` +
    `min ${show(stats.min)} · p05 ${show(stats.p05)} · p95 ${show(stats.p95)} · max ${show(stats.max)}`
  )
}
