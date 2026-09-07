#!/usr/bin/env node
/**
 * check-hero-motion.mjs — the gate on the hero's living background, and the
 * ONLY writer of public/brand/hero/motion/.
 *
 *     node scripts/check-hero-motion.mjs                          # npm run check:motion
 *     node scripts/check-hero-motion.mjs --clip <master.mp4> [--still <rung>] [--crop x,y,w,h]
 *                                        [--crossfade <s>] [--fade <s>] [--sample-fps 4] [--json <out>]
 *                                        [--prove] [--quiet]
 *     node scripts/check-hero-motion.mjs --install --clip <master.mp4> [--cap 0.85]
 *     node scripts/check-hero-motion.mjs --cap 0.85                # write a solved cap to the manifest
 *
 * With no `--clip` it reads public/brand/hero/motion/manifest.json: `present:
 * false` — the state the manifest was first committed in — is a no-op that
 * exits 0, exactly as scripts/verify-hero-assets.mjs treats the absent still;
 * `present: true` — where main has stood since the Seedance 2 transcode was
 * installed, and what ships since the switch went on by default on
 * 2026-09-06 — runs every check below against the installed clip. In
 * `npm run verify` this was therefore free until a clip existed, and is a
 * gate now that one does.
 *
 * ── WHAT A STILL CANNOT BE WRONG ABOUT, AND A CLIP CAN ─────────────────────
 *
 * The still already has a contrast gate (scripts/check-hero-contrast.mjs). This
 * is the same discipline applied to EVERY FRAME of a clip that would be laid
 * over it, plus the three things a still has no notion of:
 *
 *   1 HANDOFF      does the clip BEGIN where the still ends? The layer
 *                  dissolves the clip in over the still, so frame 0 must be the
 *                  SAME PICTURE (a re-render of the still passes; a displacement
 *                  or another picture does not) and the dissolve, per frame,
 *                  must be no larger a step than the loop's own seam.
 *   2 SEAM         does the clip END where it begins? The loop is a dissolve of
 *                  the last X seconds into the first, and a dissolve can only
 *                  hide a cut between frames whose content is already in the
 *                  same place: the SPAN rule catches a double exposure the
 *                  per-frame peak cannot.
 *   3 CAMERA LOCK  did the camera move? The clip is registered to the still
 *                  pixel-for-pixel; a drifting clip slides against the still at
 *                  the feathered edges and reads as a double image. Global
 *                  motion of the STATIC content is estimated as a similarity
 *                  (translation + zoom) with a median over blocks, so leaves
 *                  and water — local, zero-mean — drop out.
 *   4 LEGIBILITY   the still gate's own statistic, per frame, per viewport:
 *                  cover-fit geometry, the 64-wide cell grid over TEXT_EXTENT,
 *                  each cell the MAX source luminance under it, read across the
 *                  boundary through `check-hero-contrast.mjs --emit-geometry`
 *                  rather than retyped. Pass = the gate's published HEADROOM
 *                  holds against the still's own numbers for the worst cell,
 *                  the p95 and the mean. The worst cell is a consistency proof
 *                  only (the still's worst text cell is already L ≈ 0.99); the
 *                  p95 and the mean are the discriminating statistics — they
 *                  are what "reads as premium / busy" is made of.
 *   5 MOTION       how much moves per frame, whole frame and under the desktop
 *                  text box. A calm loop is one a reader can read over.
 *
 * Every threshold carries its reason beside it in `T`. `--prove` drives the
 * estimators through known inputs — synthetic camera warps, a lifted still, an
 * identical loop — in the repo's standing discipline: a gate that has never
 * been shown to fail has never been shown to work.
 *
 * ── DECODING WITHOUT FFMPEG ────────────────────────────────────────────────
 *
 * There is no ffmpeg on the build machine and sharp decodes no video. The clip
 * is decoded by Playwright's Chromium (the bundled build reports
 * canPlayType('avc1') = "probably"), served on a synthetic http origin from
 * memory WITH Range (206) support — a file: page taints the canvas and
 * getImageData throws. Every frame is seeked to (i + 0.5)/fps, drawn to a
 * canvas and reduced in-page: mean |ΔRGB| against the previous frame at full
 * resolution, a half-resolution Rec.709 luma for every frame, full RGB for the
 * sampled frames only. About 90 s for a 10 s clip; acceptable for `verify`
 * because it runs only once a clip exists.
 *
 * ── INSTALLING — the one write, and what it refuses ────────────────────────
 *
 * `--install` runs every check first and refuses on any FAIL: a failing clip
 * never lands. It then probes the container (mvhd duration, tkhd size, stsd
 * codec, moov-before-mdat, an audio trak, a colr box), refuses a codec the
 * layer cannot play or a file over budget, copies the clip to
 * hero-loop-<sha8>.mp4 — the eight hex are the file's own sha256 prefix, which
 * is what makes next.config.ts's `immutable` header honest — and writes the
 * manifest with everything scripts/verify-hero-assets.mjs re-checks. IT NEVER
 * DELETES: another hero-loop-* already in the directory is a refusal with the
 * file named, and a human removes it. Container rules the machine cannot
 * satisfy (faststart, no audio, bt709 tags) are WARNED and recorded, because
 * nothing on this machine can re-encode H.264.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HERO_DIR = join(ROOT, 'public', 'brand', 'hero')
const MOTION_DIR = join(HERO_DIR, 'motion')
const MOTION_MANIFEST = join(MOTION_DIR, 'manifest.json')
const HERO_MANIFEST = join(HERO_DIR, 'manifest.json')
const GATE = join(ROOT, 'scripts', 'check-hero-contrast.mjs')
/* the still to register against: by default the WIDEST landscape rung on disk —
   the one a Retina viewport paints, and the one a clip is sized to match
   (never wider). A narrower clip registers against it resampled; --still
   overrides. */
const STILL_DEFAULT = (() => {
  try {
    const widths = readdirSync(HERO_DIR)
      .map((n) => /^hero-l-(\d+)\.webp$/.exec(n))
      .filter(Boolean)
      .map((m) => Number(m[1]))
    if (widths.length) return join(HERO_DIR, `hero-l-${Math.max(...widths)}.webp`)
  } catch {
    /* no rungs: fall through to the historical default, which then stops with a clear message */
  }
  return join(HERO_DIR, 'hero-l-1280.webp')
})()
const MOTION_FILE = /^hero-loop-[0-9a-f]{8}\.(?:mp4|webm)$/

/* ── budgets — mirrored into the manifest so the verifier re-derives them ─ */
const BUDGETS = {
  /* 6 MiB for up to 15.5 s at 1536 wide. The first figures (2 MB, 10.5 s,
     1280 wide) assumed a 10 s 720p loop; the second (3 MB) fitted Seedance 2's
     15 s 1112-wide take; the third fits the calm 1080p-class take shipped at
     the still's own widest rung, 1536x1024 (5.51 MiB at CRF 24, GOP 96, with
     the sharpen the still's Retina rung already carries). It is fetched on
     desktop only, after the page has settled, and off the LCP path — the clip
     covers the whole viewport, which Chrome does not count as a
     largest-contentful-paint candidate (lib/hero-motion.ts's header). */
  mp4Bytes: 6 * 1024 * 1024,
  webmBytes: 3 * 1024 * 1024,
  totalPerOrientationBytes: 9 * 1024 * 1024,
  maxDurationS: 15.5,
  /* a MASTER over this is refused before a frame is decoded: a verifier
     crashed Chromium mid-decode on an 85 MB clip and got a crash, not a refusal */
  masterCeilingBytes: 64 * 1024 * 1024,
  maxFps: 30,
  /* the still's widest rung is 1536; a clip may match it, never exceed it */
  maxWidth: 1536,
  requireFaststart: true,
  requireNoAudio: true,
  requireColourTags: 'bt709',
}

/* ── thresholds, each with its reason ──────────────────────────────────── */
const T = {
  /* HANDOFF — two rules, because the layer never cuts to frame 0: it
     DISSOLVES to it over MOTION_FADE_IN_MS (read from lib/hero-motion.ts).
     (1) SAME PICTURE. sRGB levels, mean |frame0 − still| over the aligned
     crop. A re-ENCODE of the still measures 3.3 (the shipped rung against a
     resampled master, same crop). A diffusion re-RENDER — the same
     composition, registered to the pixel, fine detail redrawn — measures 6
     (gen4.5) to 17 (Seedance 2, whose frame 0 sits at shift (0,0) of the
     still: by region 12 sky / 21 skyline / 17 campus / 16 ground). The same
     still displaced 20 px measures 25; a different frame of the same scene
     18, p99 > 30 (measured on the installed clip: registered 16.1, 20 px
     sideways 22.4). 20 admits a re-render and refuses a displacement or a
     different picture; it is NOT a registration check (CAMERA LOCK is).
     (2) THE FADE. What the eye gets per frame is that distance divided by
     the fade's frames, in the same half-res luma as the seam, held to the
     seam's own per-frame rule below: the loop's dissolve and the one-time
     fade-in are the same kind of event and are judged by the same number.
     The old rule (mean ≤ 3.0) could pass nothing but a re-encode of the
     still — nothing that moves; it stays as the report's yardstick. */
  handoffSamePicture: 20,
  handoffReencodeRef: 3.0,
  /* SEAM — the crossfaded loop's peak per-frame luma step, as a multiple of
     the clip's own p95 native step, and an absolute cap in luma levels */
  seamPeakRatio: 1.5,
  seamPeakAbs: 4.0,
  /* THE FLOOR under both per-frame rules. A step this small is under the
     codec noise between consecutive frames of any real clip (native p95
     steps measured 0.6–2.4 on the candidates) and a still-only loop's drift
     lands near 0.01. Without it the ratio rules divide by the clip's own
     calm: the calmer the clip, the harder its seam is to pass — the inverse
     of the ask — and a bit-identical loop divides by zero. A verifier found
     exactly that on a still-only clip: 0.09 luma of codec drift read as
     "4.27× a visible seam". */
  stepFloor: 0.5,
  /* the SPAN — how far apart the loop's two ends are, against any two frames
     one crossfade apart inside the clip. REPORTED, no longer a verdict: the
     layer never hard-cuts, and the crossfade it actually performs is what
     the rule above judges. --prove uses the span to show that rule still
     bites on a real cut. */
  seamSpanRatio: 1.5,
  /* full-res px of static-content displacement at the frame's EDGE, max over
     the clip. The clip is registered to the still; half a pixel is under the
     feather's ability to hide. --prove recovers a 0.15 px warp to 0.002. */
  cameraEdgePx: 0.5,
  /* mean |ΔRGB| per native frame step, whole frame, and its p95. PROVISIONAL:
     calibrated on two clips (codec floor 1.2–1.6); re-derive from the first
     passing clip. */
  motionMean: 2.5,
  motionP95: 4.0,
  /* the same, on half-res luma, inside the desktop 1280x800 text box */
  motionTextMean: 2.0,
  motionTextP95: 3.0,
  /* SKY DRIFT — how fast the sky band translates, as a percentage of the
     frame's width per second (scale-free). Measured 2026-09-06: the first
     shipped clip's clouds crossed at 30 px/s of 1112 (2.7%/s, the whole sky
     in 37 s) and that — not the water, which fell at ~real speed — is what
     the owner read as "a really strong wind"; real clouds at this framing are
     ~0.2%/s. The calm take measures 0.45%/s (a crossing every ~2.5 min). 0.8
     admits the calm take with margin and refuses the windy one three times
     over. Lag 1 s.

     ⚠ JUDGED ON THE WORST WINDOW, NOT ON THE WHOLE-CLIP MEDIAN, since
     2026-09-07. A median over every row-pair of the clip only means anything
     for a clip whose sky does ONE thing. The round-four night cycle was two
     takes joined — one drifting left at 2.4%/s, one with no coherent motion
     at all — and the pooled median landed either side of this limit depending
     on nothing but which frames the sampling stride happened to hit: measured
     on that material at four adjacent strides (3, 4, 5, 6 frames) the pooled
     verdict read PASS, FAIL, PASS, FAIL, while each half judged alone was
     stable at −2.2..−2.4%/s (refuse) and 0.0%/s (admit). A gate whose answer
     is a coin flip is not a gate. On a single-take clip the window statistic
     costs nothing: the installed calm clip reads −0.37%/s in all four of its
     quarters. */
  skyDriftPctPerS: 0.8,
  /* the window each drift median is taken over, and its hop. 4 s because the
     estimator's lag is 1 s and a median over fewer than ~4 independent lags
     is noise rather than a speed; the hop is half the window so a junction
     between two takes cannot fall between two windows and escape both. */
  skyWindowS: 4.0,
  skyWindowHopS: 2.0,
  /* THE REVERSAL RULE's dead band, in units of the estimator's own quantum.
     The owner's ask is explicit that clouds must never change direction, so
     windows that disagree on sign are refused — but a textureless night sky
     "reverses" at random, and judging noise would refuse good clips. One
     quantum is one half-res pixel per lag second = 2 full px/s = 0.13% of a
     1536-wide frame; a window under TWO of them has not measurably moved and
     is excluded from the sign test. Derived from VW at runtime, never typed,
     so a narrower clip gets the wider dead band it deserves. The installed
     clip's 0.37%/s sits at ~3 quanta — comfortably inside "moving". */
  skyStillQuanta: 2,
  /* the gate's own margin: 1.05 on (ground luminance + 0.05). Read, not typed. */
  legibilityHeadroom: null,
}

/* ── args ───────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(k)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d
}
const has = (k) => argv.includes(k)
const QUIET = has('--quiet')
const INSTALL = has('--install')
const PROVE = has('--prove')
const CROSSFADE_ARG = arg('--crossfade', null)
const FADE_ARG = arg('--fade', null)
const SAMPLE_FPS = Number(arg('--sample-fps', '4'))
const JSON_OUT = arg('--json', null)
const CAP_ARG = arg('--cap', null)
const CROP_ARG = arg('--crop', null)

const log = (...s) => {
  if (!QUIET) console.log(...s)
}
const stop = (msg, code = 2) => {
  console.error(`\n  check-hero-motion stopped:\n\n    ${msg}\n`)
  process.exit(code)
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

/* ── the layer's own numbers — read from lib/hero-motion.ts, never retyped ──
   The harness models what the layer DOES: a MOTION_FADE_IN_MS dissolve from
   the still to frame 0, and a MOTION_CROSS_S dissolve at the loop. Both can be
   overridden on the command line for a what-if run; the manifest records the
   values a verdict was reached with. */
const LAYER = (() => {
  const src = readFileSync(join(ROOT, 'lib', 'hero-motion.ts'), 'utf8')
  const num = (re, name) => {
    const m = src.match(re)
    if (!m) stop(`lib/hero-motion.ts no longer declares ${name}; the harness models the layer and will not guess it.`, 1)
    return Number(m[1])
  }
  return {
    fadeInMs: num(/export const MOTION_FADE_IN_MS\s*=\s*(\d+)/, 'MOTION_FADE_IN_MS'),
    crossS: num(/export const MOTION_CROSS_S\s*=\s*([\d.]+)/, 'MOTION_CROSS_S'),
    /* the mount media query: below this width the layer never exists */
    minWidthPx: num(/\(min-width:\s*(\d+)px\)/, 'the mount media query (min-width)'),
  }
})()
const CROSSFADE_S = CROSSFADE_ARG === null ? LAYER.crossS : Number(CROSSFADE_ARG)
const FADE_S = FADE_ARG === null ? LAYER.fadeInMs / 1000 : Number(FADE_ARG)

/* ══════════════════════════════════════════════════════════════════════════
   The manifest — the absent state is a pass, and --cap is the second writer
   ══════════════════════════════════════════════════════════════════════════ */

function readMotionManifest() {
  if (!existsSync(MOTION_MANIFEST)) return null
  try {
    return readJson(MOTION_MANIFEST)
  } catch (err) {
    stop(`public/brand/hero/motion/manifest.json is not valid JSON (${err.message}).`, 1)
  }
  return null
}

let clipPath = arg('--clip', null)
let manifestCrop = null
const installed = readMotionManifest()

if (clipPath === null && CAP_ARG !== null && !INSTALL) {
  /* Write a solved opacity cap into an installed manifest and nothing else. */
  if (!installed || installed.present !== true) stop('--cap needs an installed clip (manifest present:true) to write to.', 1)
  const cap = Number(CAP_ARG)
  if (!(cap > 0 && cap <= 1)) stop(`--cap ${CAP_ARG} is not an opacity in (0, 1].`, 1)
  installed.opacityCap = cap
  installed.opacityCapSolvedBy = 'tests/e2e/hero-motion.spec.ts'
  writeFileSync(MOTION_MANIFEST, `${JSON.stringify(installed, null, 2)}\n`)
  log(`\n  wrote opacityCap ${cap} to public/brand/hero/motion/manifest.json\n`)
  process.exit(0)
}

if (clipPath === null) {
  if (!installed || installed.present !== true) {
    log('\n  check-hero-motion — no motion asset installed (public/brand/hero/motion/manifest.json says present:false).')
    log('  The hero is the still photograph; there is nothing to check. That was the shipping state until 2026-09-06; it is still a legal one.\n')
    process.exit(0)
  }
  if (typeof installed.file !== 'string' || !MOTION_FILE.test(installed.file)) {
    stop(`manifest present:true but file ${JSON.stringify(installed.file)} is not hero-loop-<sha8>.{mp4,webm}.`, 1)
  }
  clipPath = join(MOTION_DIR, installed.file)
  if (!existsSync(clipPath)) stop(`${installed.file} is declared by the manifest but is not on disk.`, 1)
  manifestCrop = installed.crop ?? null
} else {
  clipPath = resolve(clipPath)
  if (!existsSync(clipPath)) stop(`no clip at ${clipPath}`)
}

const stillPath = resolve(arg('--still', STILL_DEFAULT))
if (!existsSync(stillPath)) stop(`no still rung at ${stillPath} — the clip has nothing to register against.`, 1)
if (!(CROSSFADE_S > 0)) stop('--crossfade must be positive.')
if (!(FADE_S > 0)) stop('--fade must be positive.')
if (!(SAMPLE_FPS > 0)) stop('--sample-fps must be positive.')

const clipBytes = readFileSync(clipPath)
const clipSha = sha256(clipBytes)
if (clipBytes.length > BUDGETS.masterCeilingBytes) {
  stop(
    `${(clipBytes.length / 1024 / 1024).toFixed(1)} MB master is over the ${BUDGETS.masterCeilingBytes / 1024 / 1024} MB ceiling ` +
      'the harness will decode. Encode it down first (public/brand/hero/README.md, The motion layer).',
    1,
  )
}
if (installed && installed.present === true && arg('--clip', null) === null && installed.sha256 !== clipSha) {
  stop(`${installed.file} hashes to ${clipSha} but the manifest records ${installed.sha256}. Re-install the clip.`, 1)
}

/* ══════════════════════════════════════════════════════════════════════════
   The container — mvhd, tkhd, stsd, moov/mdat order, audio, colr
   ══════════════════════════════════════════════════════════════════════════ */

/** Minimal ISOBMFF walk, enough for the fields the manifest records. No decode. */
function probeMp4(b) {
  const out = { width: null, height: null, durationS: null, frames: null, codec: [], handlers: [], fastStart: null, colr: null, c2pa: false }
  const top = []
  const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'meta'])
  function walk(off, end, depth) {
    while (off + 8 <= end) {
      let size = b.readUInt32BE(off)
      const type = b.toString('latin1', off + 4, off + 8)
      let hdr = 8
      if (size === 1) {
        size = Number(b.readBigUInt64BE(off + 8))
        hdr = 16
      }
      if (size === 0) size = end - off
      if (size < hdr) return
      if (depth === 0) top.push(type)
      try {
        if (type === 'mvhd') {
          const v = b[off + hdr]
          const ts = v ? b.readUInt32BE(off + hdr + 20) : b.readUInt32BE(off + hdr + 12)
          const dur = v ? Number(b.readBigUInt64BE(off + hdr + 24)) : b.readUInt32BE(off + hdr + 16)
          if (ts > 0) out.durationS = dur / ts
        }
        if (type === 'tkhd') {
          const w = b.readUInt32BE(off + size - 8) / 65536
          const h = b.readUInt32BE(off + size - 4) / 65536
          if (w > 0 && h > 0 && out.width === null) {
            out.width = w
            out.height = h
          }
        }
        if (type === 'stts' && out.frames === null) {
          const n = b.readUInt32BE(off + hdr + 4)
          let frames = 0
          for (let i = 0; i < n; i += 1) frames += b.readUInt32BE(off + hdr + 8 + i * 8)
          out.frames = frames
        }
        if (type === 'stsd') out.codec.push(b.toString('latin1', off + hdr + 12, off + hdr + 16))
        if (type === 'hdlr') out.handlers.push(b.toString('latin1', off + hdr + 8, off + hdr + 12))
        if (type === 'uuid' && b.toString('hex', off + 8, off + 24) === 'd8fec3d61b0e483c92975828877ec481') out.c2pa = true
      } catch {
        /* a truncated box: leave the field null and let the caller decide */
      }
      if (CONTAINERS.has(type)) walk(off + hdr + (type === 'meta' ? 4 : 0), off + size, depth + 1)
      off += size
    }
  }
  walk(0, b.length, 0)
  out.fastStart = top.indexOf('moov') >= 0 && top.indexOf('mdat') >= 0 ? top.indexOf('moov') < top.indexOf('mdat') : null
  /* colr/nclx anywhere in the file: primaries, transfer, matrix. Best effort. */
  const colr = b.indexOf('colrnclx')
  if (colr >= 0 && colr + 14 <= b.length) {
    out.colr = { primaries: b.readUInt16BE(colr + 8), transfer: b.readUInt16BE(colr + 10), matrix: b.readUInt16BE(colr + 12) }
  }
  return out
}

const isMp4 = clipPath.toLowerCase().endsWith('.mp4')
const container = isMp4 ? probeMp4(clipBytes) : { width: null, height: null, durationS: null, frames: null, codec: [], handlers: [], fastStart: null, colr: null, c2pa: false }
const PLAYABLE = new Set(['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp09'])
if (isMp4 && container.codec.length > 0 && !container.codec.some((c) => PLAYABLE.has(c))) {
  stop(`the clip's sample entry is ${container.codec.join('/')}, which the layer cannot play (needs one of ${[...PLAYABLE].join(', ')}).`, 1)
}

/* ══════════════════════════════════════════════════════════════════════════
   The gate's geometry — read across the boundary, never retyped
   ══════════════════════════════════════════════════════════════════════════ */

let G
try {
  G = JSON.parse(execFileSync(process.execPath, [GATE, '--emit-geometry'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
} catch (err) {
  stop(`scripts/check-hero-contrast.mjs --emit-geometry failed: ${err.message}`, 1)
}
T.legibilityHeadroom = G.headroom
const GRID = G.grid
const GROUND = G.ground
const FOCAL = G.focal
const BREAKPOINT = G.breakpoint ?? 861
const VIEWPORTS = G.viewports.map((v) => {
  const row = G.rows.find((r) => r.w === v.w && r.h === v.h)
  if (!row || v.frameH === null || v.firstGlyphY === null || v.floorAlpha === null) {
    stop(`the gate emitted no usable geometry for ${v.name} (frameH ${v.frameH}, firstGlyphY ${v.firstGlyphY}, floor ${v.floorAlpha}).`, 1)
  }
  return { ...v, row }
})
const textExtentFor = (w) => {
  let pick = G.rows[0]
  for (const row of G.rows) if (row.w <= w) pick = row
  const m = G.extentMargin
  return { x0: Math.max(0, pick.x0 - m), x1: Math.min(1, pick.x1 + m), y0: Math.max(0, pick.y0 - m), y1: Math.min(1, pick.y1 + m) }
}

/* ── colour maths, identical to the gate ───────────────────────────────── */
const toLinear = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const toSrgb = (l) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055)
const lumRgb = (r, g, b) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
/** luminance of the veil at alpha `a` over a grey source of luminance L */
function groundOver(L, a) {
  const g = toSrgb(L)
  const r = a * GROUND[0] + (1 - a) * g
  const gg = a * GROUND[1] + (1 - a) * g
  const b = a * GROUND[2] + (1 - a) * g
  return lumRgb(r, gg, b)
}
/** the brightest source luminance the gate's headroom still tolerates over a still statistic, under the field floor */
function allowedOver(Lstill, a) {
  const target = (groundOver(Lstill, a) + 0.05) * T.legibilityHeadroom - 0.05
  if (groundOver(1, a) <= target) return 1
  let lo = Lstill
  let hi = 1
  for (let i = 0; i < 40; i += 1) {
    const m = (lo + hi) / 2
    if (groundOver(m, a) <= target) lo = m
    else hi = m
  }
  return lo
}
const pct = (arr, q) => {
  const s = Float64Array.from(arr).sort()
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] : NaN
}
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1)
const b64 = (s) => Buffer.from(s, 'base64')

/* ══════════════════════════════════════════════════════════════════════════
   The still, and the clip decoded in Chromium
   ══════════════════════════════════════════════════════════════════════════ */

const sharp = (await import('sharp')).default
const { chromium } = await import('playwright')

const stillImg = await sharp(stillPath).removeAlpha().raw().toBuffer({ resolveWithObject: true })
let SW = stillImg.info.width
let SH = stillImg.info.height
let still = new Uint8Array(stillImg.data)
const STILL_ASPECT = SW / SH

const browser = await chromium.launch()
const page = await browser.newPage()
const ORIGIN = 'http://hero-motion.test'
const MIME = isMp4 ? 'video/mp4' : 'video/webm'
await page.route(`${ORIGIN}/**`, (route) => {
  const url = new URL(route.request().url())
  if (url.pathname === '/') {
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>decode</title>' })
  }
  const range = route.request().headers().range
  const m = range && /bytes=(\d+)-(\d*)/.exec(range)
  if (m) {
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : clipBytes.length - 1
    return route.fulfill({
      status: 206,
      body: clipBytes.subarray(a, b + 1),
      headers: { 'content-type': MIME, 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${clipBytes.length}`, 'content-length': String(b - a + 1) },
    })
  }
  return route.fulfill({ status: 200, body: clipBytes, headers: { 'content-type': MIME, 'accept-ranges': 'bytes', 'content-length': String(clipBytes.length) } })
})
await page.goto(`${ORIGIN}/`)

const meta = await page.evaluate(async (url) => {
  const v = document.createElement('video')
  v.src = url
  v.muted = true
  v.preload = 'auto'
  v.playsInline = true
  await new Promise((res, rej) => {
    v.onloadedmetadata = res
    v.onerror = () => rej(new Error(`Chromium cannot decode ${url}`))
  })
  let n = 0
  let first = null
  let last = null
  await new Promise((res) => {
    const cb = (_, md) => {
      n += 1
      if (first === null) first = md.mediaTime
      last = md.mediaTime
      if (md.mediaTime < Math.min(2, v.duration / 2)) v.requestVideoFrameCallback(cb)
      else res()
    }
    v.requestVideoFrameCallback(cb)
    v.play()
  })
  v.pause()
  const fps = Math.round((n - 1) / (last - first))
  window.__v = v
  const c = document.createElement('canvas')
  c.width = v.videoWidth
  c.height = v.videoHeight
  window.__ctx = c.getContext('2d', { willReadFrequently: true })
  window.__prev = null
  return { w: v.videoWidth, h: v.videoHeight, duration: v.duration, fps }
}, `${ORIGIN}/clip${isMp4 ? '.mp4' : '.webm'}`).catch((err) => stop(err.message, 1))

const VW = meta.w
const VH = meta.h
const FPS = meta.fps
const N = Math.round(meta.duration * FPS)
const STEP = Math.max(1, Math.round(FPS / SAMPLE_FPS))
const LW = VW >> 1
const LH = VH >> 1

/* A clip NARROWER than the rung, at the rung's aspect, registers against the
   rung resampled to the clip's width (lanczos3, the kernel gen-hero-photo
   uses between rungs): the layer stretches the clip over the box the rung
   paints, so this is the comparison the reader's eye makes. Wider than the
   rung, or another aspect, is a different crop and is refused. */
let stillResampled = null
if (VW < SW && Math.abs(VW / VH - SW / SH) <= 0.01) {
  const re = await sharp(stillPath)
    .resize(VW, Math.round((SH * VW) / SW), { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  stillResampled = { from: [SW, SH], to: [re.info.width, re.info.height], kernel: 'lanczos3' }
  still = new Uint8Array(re.data)
  SW = re.info.width
  SH = re.info.height
}
if (VW !== SW || VH > SH) {
  await browser.close()
  stop(
    `the clip is ${VW}x${VH} and the still rung is ${SW}x${SH}: the clip must be a same-width crop of the ` +
      `rung it registers to, or a narrower one at the rung's aspect (generate it from the still's own crop, or pass --still <rung> of the right width).`,
    1,
  )
}

const CHUNK = 12
const lumas = new Array(N)
const deltas = new Float64Array(N)
const rgbAt = new Map()
const sampled = new Set([0, N - 1])
for (let i = 0; i < N; i += STEP) sampled.add(i)
for (let start = 0; start < N; start += CHUNK) {
  const idx = []
  for (let i = start; i < Math.min(N, start + CHUNK); i += 1) idx.push(i)
  const out = await page.evaluate(
    async ({ idx, fps, want, LW, LH }) => {
      const v = window.__v
      const ctx = window.__ctx
      const W = v.videoWidth
      const H = v.videoHeight
      const res = []
      const toB64 = (u8) => {
        let s = ''
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
        return btoa(s)
      }
      for (const i of idx) {
        const t = Math.min(v.duration - 1e-4, (i + 0.5) / fps)
        await new Promise((r) => {
          v.onseeked = r
          v.currentTime = t
        })
        ctx.drawImage(v, 0, 0, W, H)
        const d = ctx.getImageData(0, 0, W, H).data
        let delta = null
        if (window.__prev) {
          let acc = 0
          const q = window.__prev
          for (let k = 0; k < d.length; k += 4) acc += Math.abs(d[k] - q[k]) + Math.abs(d[k + 1] - q[k + 1]) + Math.abs(d[k + 2] - q[k + 2])
          delta = acc / ((d.length / 4) * 3)
        }
        const luma = new Uint8Array(LW * LH)
        for (let y = 0; y < LH; y += 1) {
          for (let x = 0; x < LW; x += 1) {
            let acc = 0
            for (let dy = 0; dy < 2; dy += 1) {
              for (let dx = 0; dx < 2; dx += 1) {
                const k = ((2 * y + dy) * W + 2 * x + dx) * 4
                acc += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]
              }
            }
            luma[y * LW + x] = Math.round(acc / 4)
          }
        }
        let rgb = null
        if (want.includes(i)) {
          const u = new Uint8Array(W * H * 3)
          for (let k = 0, j = 0; k < d.length; k += 4, j += 3) {
            u[j] = d[k]
            u[j + 1] = d[k + 1]
            u[j + 2] = d[k + 2]
          }
          rgb = toB64(u)
        }
        window.__prev = d
        res.push({ i, delta, luma: toB64(luma), rgb })
      }
      return res
    },
    { idx, fps: FPS, want: idx.filter((i) => sampled.has(i)), LW, LH },
  )
  for (const f of out) {
    lumas[f.i] = new Uint8Array(b64(f.luma))
    if (f.delta !== null) deltas[f.i] = f.delta
    if (f.rgb) rgbAt.set(f.i, new Uint8Array(b64(f.rgb)))
  }
  if (!QUIET) process.stderr.write(`\r  decoded ${Math.min(N, start + CHUNK)}/${N} frames`)
}
if (!QUIET) process.stderr.write('\n')
await browser.close()

/* ══════════════════════════════════════════════════════════════════════════
   1 · HANDOFF — where frame 0 sits in the still, and how far off it is
   ══════════════════════════════════════════════════════════════════════════ */

function meanDiffAt(frame, dy, stride = 2) {
  let acc = 0
  let n = 0
  for (let y = 0; y < VH; y += stride) {
    for (let x = 0; x < VW; x += stride) {
      const a = (y * VW + x) * 3
      const b = ((y + dy) * SW + x) * 3
      acc += Math.abs(frame[a] - still[b]) + Math.abs(frame[a + 1] - still[b + 1]) + Math.abs(frame[a + 2] - still[b + 2])
      n += 3
    }
  }
  return acc / n
}
const f0 = rgbAt.get(0)
let handoff = { dy: 0, mean: Infinity, declared: null }
const cropArg = CROP_ARG ? CROP_ARG.split(',').map(Number) : manifestCrop ? [manifestCrop.x, manifestCrop.y, manifestCrop.w, manifestCrop.h] : null
if (cropArg) {
  /* A declared crop: the row is given, and the clip's size must agree with it. */
  const [cx, cy, cw, ch] = cropArg
  if (!(cx === 0 && cw === 1)) stop(`crop ${cropArg.join(',')} is not full-width; the harness registers same-width crops only.`, 1)
  const dy = Math.round(cy * SH)
  if (Math.abs(Math.round(ch * SH) - VH) > 1) stop(`crop height ${ch} of a ${SH}px still is ${Math.round(ch * SH)}px, but the clip is ${VH}px tall.`, 1)
  handoff = { dy, mean: meanDiffAt(f0, dy, 1), declared: { x: cx, y: cy, w: cw, h: ch } }
} else {
  for (let dy = 0; dy <= SH - VH; dy += 1) {
    const m = meanDiffAt(f0, dy, 4)
    if (m < handoff.mean) handoff = { dy, mean: m, declared: null }
  }
  handoff.mean = meanDiffAt(f0, handoff.dy, 1)
}
{
  const diffs = new Float64Array(Math.ceil(VH / 3) * Math.ceil(VW / 3))
  let k = 0
  for (let y = 0; y < VH; y += 3) {
    for (let x = 0; x < VW; x += 3) {
      const a = (y * VW + x) * 3
      const b = ((y + handoff.dy) * SW + x) * 3
      diffs[k++] = (Math.abs(f0[a] - still[b]) + Math.abs(f0[a + 1] - still[b + 1]) + Math.abs(f0[a + 2] - still[b + 2])) / 3
    }
  }
  handoff.p99 = pct(diffs.subarray(0, k), 0.99)
}
/* the noise reference: the shipped rung against the master, same crop = one encode generation */
handoff.encodeGenerationRef = null
{
  const masterPath = ['png', 'jpg', 'jpeg'].map((e) => join(ROOT, 'public', 'brand', `hero-source.${e}`)).find((p) => existsSync(p))
  if (masterPath) {
    const master = await sharp(masterPath).resize(SW, SH, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer()
    let acc = 0
    let n = 0
    for (let y = handoff.dy; y < handoff.dy + VH; y += 2) {
      for (let x = 0; x < SW; x += 2) {
        const b = (y * SW + x) * 3
        for (let c = 0; c < 3; c += 1) {
          acc += Math.abs(master[b + c] - still[b + c])
          n += 1
        }
      }
    }
    handoff.encodeGenerationRef = acc / n
  }
}
const CROP = { x: 0, y: handoff.dy / SH, w: 1, h: VH / SH }

/* ══════════════════════════════════════════════════════════════════════════
   2 · SEAM
   ══════════════════════════════════════════════════════════════════════════ */

const lumaDelta = (a, b) => {
  let acc = 0
  for (let k = 0; k < a.length; k += 1) acc += Math.abs(a[k] - b[k])
  return acc / a.length
}
const nativeSteps = []
for (let i = 1; i < N; i += 1) nativeSteps.push(lumaDelta(lumas[i], lumas[i - 1]))
const stepP95 = pct(nativeSteps, 0.95)
const stepMed = pct(nativeSteps, 0.5)
const seam = { hardCutLuma: lumaDelta(lumas[0], lumas[N - 1]), hardCutRgb: null, stepP95, stepMed }
{
  const a = rgbAt.get(0)
  const b = rgbAt.get(N - 1)
  let acc = 0
  for (let k = 0; k < a.length; k += 1) acc += Math.abs(a[k] - b[k])
  seam.hardCutRgb = acc / a.length
}
{
  const K = Math.max(1, Math.round(CROSSFADE_S * FPS))
  const blend = (j) => {
    const w = (j + 1) / (K + 1)
    const t = lumas[N - K + j]
    const h = lumas[j]
    const o = new Float32Array(t.length)
    for (let k = 0; k < o.length; k += 1) o[k] = (1 - w) * t[k] + w * h[k]
    return o
  }
  const steps = []
  let prev = lumas[N - K - 1]
  for (let j = 0; j < K; j += 1) {
    const o = blend(j)
    steps.push(lumaDelta(o, prev))
    prev = o
  }
  steps.push(lumaDelta(lumas[K], prev))
  seam.crossfadeFrames = K
  seam.crossfadePeak = Math.max(...steps)
  seam.crossfadeRatio = ratioOf(seam.crossfadePeak, stepP95)
  const spans = []
  for (let i = K; i < N; i += 1) spans.push(lumaDelta(lumas[i], lumas[i - K]))
  seam.spanP95 = pct(spans, 0.95)
  seam.spanRatio = ratioOf(seam.hardCutLuma, seam.spanP95)
}

/* THE TWO PER-FRAME VERDICTS — one function each, called by the checks below
   AND by --prove, so what --prove proves is the division the verdict makes
   (an earlier proof asserted `0 <= 1.5 × spanP95`, which is true of every
   clip, and printed "ok" on the run that refused a still-only loop). */
function ratioOf(step, ref) {
  return ref > 0 ? step / ref : step === 0 ? 0 : Infinity
}
function perFrameOk(step, ref) {
  return step <= T.stepFloor || (step <= T.seamPeakRatio * ref && step <= T.seamPeakAbs)
}
function seamVerdict(s, ref) {
  return perFrameOk(s.crossfadePeak, ref)
}
function handoffVerdict(h, ref) {
  return h.mean <= T.handoffSamePicture && perFrameOk(h.fadeStep, ref)
}

/* frame 0 against the still in the seam's own units — the still's crop as
   half-res luma, boxed 2x2 exactly as the decode boxes every frame — and
   then spread over the fade the layer performs */
{
  const s = new Uint8Array(LW * LH)
  for (let y = 0; y < LH; y += 1) {
    for (let x = 0; x < LW; x += 1) {
      let acc = 0
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const b = ((2 * y + dy + handoff.dy) * SW + 2 * x + dx) * 3
          acc += 0.2126 * still[b] + 0.7152 * still[b + 1] + 0.0722 * still[b + 2]
        }
      }
      s[y * LW + x] = Math.round(acc / 4)
    }
  }
  handoff.lumaMean = lumaDelta(lumas[0], s)
  handoff.fadeS = FADE_S
  handoff.fadeFrames = Math.max(1, Math.round(FADE_S * FPS))
  handoff.fadeStep = handoff.lumaMean / handoff.fadeFrames
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · CAMERA LOCK — global translation + scale of the STATIC content
   ══════════════════════════════════════════════════════════════════════════ */

function downsample(src, w, h, f) {
  const ow = Math.floor(w / f)
  const oh = Math.floor(h / f)
  const o = new Float32Array(ow * oh)
  for (let y = 0; y < oh; y += 1) {
    for (let x = 0; x < ow; x += 1) {
      let a = 0
      for (let dy = 0; dy < f; dy += 1) for (let dx = 0; dx < f; dx += 1) a += src[(y * f + dy) * w + x * f + dx]
      o[y * ow + x] = a / (f * f)
    }
  }
  return { d: o, w: ow, h: oh }
}
function coarseShift(ref, tgt, R = 8) {
  let best = { sx: 0, sy: 0, sad: Infinity }
  for (let sy = -R; sy <= R; sy += 1) {
    for (let sx = -R; sx <= R; sx += 1) {
      let acc = 0
      let n = 0
      for (let y = R; y < ref.h - R; y += 2) {
        for (let x = R; x < ref.w - R; x += 2) {
          acc += Math.abs(tgt.d[(y + sy) * ref.w + x + sx] - ref.d[y * ref.w + x])
          n += 1
        }
      }
      const sad = acc / n
      if (sad < best.sad) best = { sx, sy, sad }
    }
  }
  return best
}
/** bilinear sample of src at x + tx + s·(x − c): undoes a similarity (translation + zoom about the centre) */
function warpSim(src, w, h, tx, ty, s) {
  const o = new Float32Array(w * h)
  const cx = w / 2
  const cy = h / 2
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const fx = Math.min(w - 1.001, Math.max(0, x + tx + s * (x - cx)))
      const fy = Math.min(h - 1.001, Math.max(0, y + ty + s * (y - cy)))
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const ax = fx - x0
      const ay = fy - y0
      const i = y0 * w + x0
      o[y * w + x] = (1 - ay) * ((1 - ax) * src[i] + ax * src[i + 1]) + ay * ((1 - ax) * src[i + w] + ax * src[i + w + 1])
    }
  }
  return o
}
/**
 * Global motion of the STATIC content between two half-res luma frames, as a
 * similarity (tx, ty, zoom−1): coarse integer SAD, then iterated per-block
 * Lucas–Kanade with the median block vector as the translation update and a
 * least-squares radial fit of the residual vectors as the zoom update. The
 * median is what makes leaves and water — local, zero-mean motion — drop out;
 * a camera moves every block the same way and a push-in moves them radially.
 */
function globalMotion(refU8, tgtU8, w, h) {
  const ref = Float32Array.from(refU8)
  const tgt0 = Float32Array.from(tgtU8)
  const c = coarseShift(downsample(ref, w, h, 4), downsample(tgt0, w, h, 4))
  let gtx = c.sx * 4
  let gty = c.sy * 4
  let gs = 0
  const BX = 8
  const BY = 6
  const bw = Math.floor(w / BX)
  const bh = Math.floor(h / BY)
  let vec = []
  for (let iter = 0; iter < 5; iter += 1) {
    const tgt = warpSim(tgt0, w, h, gtx, gty, gs)
    vec = []
    for (let by = 0; by < BY; by += 1) {
      for (let bx = 0; bx < BX; bx += 1) {
        let sxx = 0
        let sxy = 0
        let syy = 0
        let sxt = 0
        let syt = 0
        for (let y = by * bh + 2; y < (by + 1) * bh - 2; y += 1) {
          for (let x = bx * bw + 2; x < (bx + 1) * bw - 2; x += 1) {
            const i = y * w + x
            const ix = (ref[i + 1] - ref[i - 1] + (tgt[i + 1] - tgt[i - 1])) / 4
            const iy = (ref[i + w] - ref[i - w] + (tgt[i + w] - tgt[i - w])) / 4
            const it = tgt[i] - ref[i]
            sxx += ix * ix
            sxy += ix * iy
            syy += iy * iy
            sxt += ix * it
            syt += iy * it
          }
        }
        const det = sxx * syy - sxy * sxy
        if (det < 1e-3) continue
        const dx = -(syy * sxt - sxy * syt) / det
        const dy = -(sxx * syt - sxy * sxt) / det
        vec.push({ x: (bx + 0.5) * bw - w / 2, y: (by + 0.5) * bh - h / 2, dx, dy })
      }
    }
    if (!vec.length) break
    const mx = pct(vec.map((v) => v.dx), 0.5)
    const my = pct(vec.map((v) => v.dy), 0.5)
    const sBlocks = vec
      .filter((v) => v.x * v.x + v.y * v.y > (w / 8) ** 2)
      .map((v) => (v.x * (v.dx - mx) + v.y * (v.dy - my)) / (v.x * v.x + v.y * v.y))
    const ds = sBlocks.length ? pct(sBlocks, 0.5) : 0
    gtx += mx
    gty += my
    gs += ds
    if (Math.hypot(mx, my) < 0.002 && Math.abs(ds) < 1e-5) break
  }
  return { tx: gtx, ty: gty, scaleMed: gs, blocks: vec.length }
}
const camera = { drift: [], jitter: [] }
for (let i = 1; i < N; i += 1) {
  if (i % STEP === 0 || i === N - 1) camera.drift.push({ i, ...globalMotion(lumas[0], lumas[i], LW, LH) })
  camera.jitter.push({ i, ...globalMotion(lumas[i - 1], lumas[i], LW, LH) })
}
/** full-res px of static-content displacement at the frame's edge */
const edgePx = (m) => 2 * (Math.hypot(m.tx, m.ty) + Math.abs(m.scaleMed) * (LW / 2))
camera.maxDriftEdgePx = Math.max(...camera.drift.map(edgePx))
camera.worstDrift = camera.drift.reduce((a, b) => (edgePx(b) > edgePx(a) ? b : a))
camera.jitterP95EdgePx = pct(camera.jitter.map(edgePx), 0.95)
camera.netScale = camera.drift[camera.drift.length - 1].scaleMed

/* ══════════════════════════════════════════════════════════════════════════
   3b · SKY DRIFT — the sky band's horizontal speed, on the half-res lumas
   ══════════════════════════════════════════════════════════════════════════ */

/** one row of the sky as a high-passed 1-D signal: the row minus its own wide
    moving average, so the sunset's smooth left-to-right gradient — which is
    static and would pin every shift to zero — drops out and only the clouds'
    texture is matched */
function skySlit(l, row, x0, x1) {
  const n = x1 - x0
  const raw = new Float32Array(n)
  for (let x = 0; x < n; x += 1) raw[x] = l[row * LW + x0 + x]
  const R = 20
  const o = new Float32Array(n)
  for (let x = 0; x < n; x += 1) {
    let acc = 0
    let c = 0
    for (let k = -R; k <= R; k += 1) {
      const xx = x + k
      if (xx >= 0 && xx < n) {
        acc += raw[xx]
        c += 1
      }
    }
    o[x] = raw[x] - acc / c
  }
  return o
}
/** the shift (half-res px, + = rightward) that best maps signal a onto signal b */
function slitShift(a, b, maxS) {
  let best = 0
  let bestV = Infinity
  for (let sh = -maxS; sh <= maxS; sh += 1) {
    let v = 0
    let c = 0
    for (let x = maxS; x < a.length - maxS; x += 1) {
      v += Math.abs(a[x] - b[x + sh])
      c += 1
    }
    v /= c
    if (v < bestV) {
      bestV = v
      best = sh
    }
  }
  return best
}
/* The rows: 4–12% of the height, above the tallest tower (which tops out near
   8% of this picture; the chapel at the right edge is excluded by x1). The
   columns: 20–91% of the width. Each (row, pair of frames one second apart)
   yields one shift; the statistic is the median of all of them, which a
   static row or a sky with no texture cannot drag away from the clouds. */
const SKY_ROWS = [0.04, 0.06, 0.08, 0.1, 0.12]
const SKY_X = [0.2, 0.91]
function skyDriftOf(frames, lagFrames, stepFrames) {
  const x0 = Math.round(SKY_X[0] * LW)
  const x1 = Math.round(SKY_X[1] * LW)
  const rows = SKY_ROWS.map((f) => Math.min(LH - 1, Math.round(f * LH)))
  const maxS = Math.max(8, Math.round(0.055 * LW))
  const shifts = []
  const stamped = [] /* the same shifts, each keeping the time it was measured at */
  for (let i = 0; i + lagFrames < frames.length; i += stepFrames) {
    if (!frames[i] || !frames[i + lagFrames]) continue
    for (const r of rows) {
      const sh = slitShift(skySlit(frames[i], r, x0, x1), skySlit(frames[i + lagFrames], r, x0, x1), maxS)
      shifts.push(sh)
      stamped.push({ t: i / FPS, sh })
    }
  }
  const medOf = (a) => (a.length ? [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)] : 0)
  const toPct = (halfPx) => (100 * ((2 * halfPx * FPS) / lagFrames)) / VW
  const sorted = [...shifts].sort((a, b) => a - b)
  const med = medOf(shifts)
  const pxPerS = (2 * med * FPS) / lagFrames /* full-res px/s */
  /* THE JUDGED STATISTIC — the same median, per overlapping window (see
     T.skyDriftPctPerS). A clip cut from two takes has two skies, and only a
     per-window read can refuse the fast one or notice that they disagree. */
  const durS = frames.length / FPS
  const windows = []
  for (let t0 = 0; t0 < durS; t0 += T.skyWindowHopS) {
    const t1 = Math.min(t0 + T.skyWindowS, durS)
    const sub = stamped.filter((p) => p.t >= t0 && p.t < t1).map((p) => p.sh)
    /* two pairs per row is the fewest a median may be taken over here */
    if (sub.length >= 2 * rows.length) windows.push({ t0, t1, pairs: sub.length, medianShiftHalfPx: medOf(sub), pctPerS: toPct(medOf(sub)) })
    if (t1 >= durS) break
  }
  /* a clip too short to window is judged exactly as it was before: one window,
     the whole clip. Recorded as such rather than silently unjudged. */
  if (!windows.length) windows.push({ t0: 0, t1: durS, pairs: shifts.length, medianShiftHalfPx: med, pctPerS: toPct(med), wholeClipFallback: true })
  return { rows, x: [x0, x1], lagFrames, pairs: shifts.length, medianShiftHalfPx: med, pxPerS, pctPerS: (100 * pxPerS) / VW, min: sorted[0] ?? 0, max: sorted[sorted.length - 1] ?? 0, windows, ...skySummarise(windows) }
}

/* THE SKY VERDICT, as two functions the checks below AND --prove both call —
   the same discipline the seam and handoff verdicts are held to. summarise()
   turns per-window medians into the two facts that decide it; verdict() is the
   decision. Split so --prove can drive the decision with window sets whose
   right answer is known, which a real clip can never supply. */
function skySummarise(windows) {
  const stillPctPerS = (T.skyStillQuanta * 200) / VW
  const moving = windows.filter((w) => Math.abs(w.pctPerS) >= stillPctPerS)
  const worstWindow = windows.reduce((a, b) => (Math.abs(b.pctPerS) > Math.abs(a.pctPerS) ? b : a), windows[0])
  const signs = new Set(moving.map((w) => (w.pctPerS > 0 ? 1 : -1)))
  return { stillPctPerS, movingWindows: moving.length, worstWindow, reverses: signs.size > 1 }
}
function skyVerdict(s) {
  return Math.abs(s.worstWindow.pctPerS) <= T.skyDriftPctPerS && !s.reverses
}
const sky = skyDriftOf(lumas, Math.max(1, Math.round(FPS)), Math.max(1, Math.round(FPS / 2)))

/* ══════════════════════════════════════════════════════════════════════════
   4 · LEGIBILITY UNDER TEXT — the gate's cell statistic, per frame
   ══════════════════════════════════════════════════════════════════════════ */

/** the still with the clip's rows replaced by a frame: what the registered layer shows */
function composite(frame) {
  const o = new Uint8Array(still)
  if (frame) o.set(frame, handoff.dy * SW * 3)
  return o
}
function luminanceOf(rgb, w, h) {
  const l = new Float32Array(w * h)
  for (let i = 0, k = 0; i < l.length; i += 1, k += 3) l[i] = lumRgb(rgb[k], rgb[k + 1], rgb[k + 2])
  return l
}
/* the portrait rung's window on the master, scaled to the landscape rung's width */
const PORTRAIT = G.portraitCrop && G.source?.width
  ? { left: Math.round((G.portraitCrop.left * SW) / G.source.width), width: Math.round((G.portraitCrop.width * SW) / G.source.width) }
  : { left: 0, width: SW }
/** cell maxima over the gated text cells at one viewport; `lum` is the full landscape composite */
function textCells(lum, vp) {
  const wide = vp.w >= BREAKPOINT
  const cropL = wide ? 0 : PORTRAIT.left
  const width = wide ? SW : PORTRAIT.width
  const height = SH
  const scale = Math.max(vp.w / width, vp.frameH / height)
  const drawnW = width * scale
  const drawnH = height * scale
  const originY = (vp.frameH - drawnH) * (wide ? FOCAL.wide : FOCAL.narrow)
  const originX = (vp.w - drawnW) * 0.5
  const ext = textExtentFor(vp.w)
  const gx = GRID
  const gy = Math.max(GRID, Math.round((GRID * vp.bandH) / vp.w))
  const tx0 = ext.x0 * vp.w
  const tx1 = ext.x1 * vp.w
  const ty0 = Math.max(ext.y0 * vp.bandH, vp.firstGlyphY)
  const ty1 = ext.y1 * vp.bandH
  const cells = []
  for (let iy = 0; iy < gy; iy += 1) {
    const yA = (vp.bandH * iy) / gy
    const yB = (vp.bandH * (iy + 1)) / gy
    if (yA >= vp.frameH) continue
    for (let ix = 0; ix < gx; ix += 1) {
      const xA = (vp.w * ix) / gx
      const xB = (vp.w * (ix + 1)) / gx
      if (Math.min(xB, tx1) < Math.max(xA, tx0) || Math.min(yB, ty1) < Math.max(yA, ty0)) continue
      const r0 = Math.min(height - 1, Math.max(0, Math.floor((yA - originY) / scale)))
      const r1 = Math.min(height - 1, Math.max(0, Math.ceil((Math.min(yB, vp.frameH) - originY) / scale)))
      const c0 = Math.min(width - 1, Math.max(0, Math.floor((xA - originX) / scale)))
      const c1 = Math.min(width - 1, Math.max(0, Math.ceil((xB - originX) / scale)))
      let lmax = 0
      for (let r = r0; r <= r1; r += 1) {
        const row = r * SW + cropL
        for (let c = c0; c <= c1; c += 1) {
          const l = lum[row + c]
          if (l > lmax) lmax = l
        }
      }
      cells.push(lmax)
    }
  }
  return { worst: Math.max(...cells), p95: pct(cells, 0.95), mean: mean(cells), n: cells.length }
}
const stillLum = luminanceOf(still, SW, SH)
const stillStats = Object.fromEntries(VIEWPORTS.map((vp) => [vp.name, textCells(stillLum, vp)]))
const legibility = { still: stillStats, frames: [], worstByVp: {} }
for (const i of [...sampled].sort((a, b) => a - b)) {
  const lum = luminanceOf(composite(rgbAt.get(i)), SW, SH)
  const row = { i, t: i / FPS, vp: {} }
  for (const vp of VIEWPORTS) row.vp[vp.name] = textCells(lum, vp)
  legibility.frames.push(row)
}
for (const vp of VIEWPORTS) {
  const s = stillStats[vp.name]
  const allow = { worst: allowedOver(s.worst, vp.floorAlpha), p95: allowedOver(s.p95, vp.floorAlpha), mean: allowedOver(s.mean, vp.floorAlpha) }
  const w = { worst: 0, p95: 0, mean: 0, tWorst: 0, tP95: 0, tMean: 0 }
  for (const f of legibility.frames) {
    const c = f.vp[vp.name]
    if (c.worst > w.worst) {
      w.worst = c.worst
      w.tWorst = f.t
    }
    if (c.p95 > w.p95) {
      w.p95 = c.p95
      w.tP95 = f.t
    }
    if (c.mean > w.mean) {
      w.mean = c.mean
      w.tMean = f.t
    }
  }
  legibility.worstByVp[vp.name] = {
    still: s,
    allow,
    floorAlpha: vp.floorAlpha,
    clip: w,
    pass: w.worst <= allow.worst && w.p95 <= allow.p95 && w.mean <= allow.mean,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · MOTION BUDGET
   ══════════════════════════════════════════════════════════════════════════ */

const steps = Array.from(deltas.subarray(1))
const motion = { mean: mean(steps), p95: pct(steps, 0.95), max: Math.max(...steps), tMax: (steps.indexOf(Math.max(...steps)) + 1) / FPS }
{
  const vp = VIEWPORTS.find((v) => v.name === '1280x800') ?? VIEWPORTS[VIEWPORTS.length - 1]
  const ext = textExtentFor(vp.w)
  const scale = Math.max(vp.w / SW, vp.frameH / SH)
  const originY = (vp.frameH - SH * scale) * FOCAL.wide
  const originX = (vp.w - SW * scale) * 0.5
  const toClip = (x, y) => [(x - originX) / scale, (y - originY) / scale - handoff.dy]
  const [x0, y0] = toClip(ext.x0 * vp.w, Math.max(ext.y0 * vp.bandH, vp.firstGlyphY))
  const [x1, y1] = toClip(ext.x1 * vp.w, ext.y1 * vp.bandH)
  const bx0 = Math.max(0, Math.floor(x0 / 2))
  const bx1 = Math.min(LW, Math.ceil(x1 / 2))
  const by0 = Math.max(0, Math.floor(y0 / 2))
  const by1 = Math.min(LH, Math.ceil(y1 / 2))
  const box = []
  for (let i = 1; i < N; i += 1) {
    let acc = 0
    let n = 0
    for (let y = by0; y < by1; y += 1) {
      for (let x = bx0; x < bx1; x += 1) {
        const k = y * LW + x
        acc += Math.abs(lumas[i][k] - lumas[i - 1][k])
        n += 1
      }
    }
    box.push(n ? acc / n : 0)
  }
  motion.textBox = { viewport: vp.name, clipRect: [bx0 * 2, by0 * 2, bx1 * 2, by1 * 2], mean: mean(box), p95: pct(box, 0.95), max: Math.max(...box), frameMeanLuma: mean(nativeSteps), frameP95Luma: stepP95 }
}

/* ══════════════════════════════════════════════════════════════════════════
   --prove — the estimators against known inputs
   ══════════════════════════════════════════════════════════════════════════ */

if (PROVE) {
  const proofs = []
  const ref = lumas[0]
  for (const [tx, ty, s] of [[0.15, -0.1, 0], [1.3, 0.7, 0], [0, 0, 0.003], [0.4, 0.2, -0.002]]) {
    const src = Float32Array.from(ref)
    const o = new Uint8Array(ref.length)
    const cx = LW / 2
    const cy = LH / 2
    for (let y = 0; y < LH; y += 1) {
      for (let x = 0; x < LW; x += 1) {
        const fx = Math.min(LW - 1.001, Math.max(0, x - tx - s * (x - cx)))
        const fy = Math.min(LH - 1.001, Math.max(0, y - ty - s * (y - cy)))
        const x0 = Math.floor(fx)
        const y0 = Math.floor(fy)
        const ax = fx - x0
        const ay = fy - y0
        const i = y0 * LW + x0
        o[y * LW + x] = Math.round((1 - ay) * ((1 - ax) * src[i] + ax * src[i + 1]) + ay * ((1 - ax) * src[i + LW] + ax * src[i + LW + 1]))
      }
    }
    const m = globalMotion(ref, o, LW, LH)
    const expect = 2 * (Math.hypot(tx, ty) + (Math.abs(s) * LW) / 2)
    const ok = Math.abs(m.tx - tx) < 0.1 && Math.abs(m.ty - ty) < 0.1 && Math.abs(m.scaleMed - s) < 0.0007 && Math.abs(edgePx(m) - expect) < 0.7
    proofs.push({ k: `camera: t(${tx},${ty}) zoom ${(100 * s).toFixed(2)}%`, ok, got: `t(${m.tx.toFixed(3)},${m.ty.toFixed(3)}) zoom ${(100 * m.scaleMed).toFixed(3)}% → ${edgePx(m).toFixed(2)} px at edge (expect ${expect.toFixed(2)})` })
  }
  {
    const vp = VIEWPORTS.find((v) => v.name === '1280x800') ?? VIEWPORTS[VIEWPORTS.length - 1]
    const s0 = stillStats[vp.name]
    const lifted = new Uint8Array(still)
    for (let k = 0; k < lifted.length; k += 1) lifted[k] = Math.min(255, lifted[k] + 12)
    const st = textCells(luminanceOf(lifted, SW, SH), vp)
    proofs.push({ k: 'legibility: still +12 levels fails', ok: st.mean > allowedOver(s0.mean, vp.floorAlpha), got: `mean ${st.mean.toFixed(3)} vs allowed ${allowedOver(s0.mean, vp.floorAlpha).toFixed(3)} (still ${s0.mean.toFixed(3)})` })
    const st2 = textCells(stillLum, vp)
    proofs.push({ k: 'legibility: the still itself passes', ok: st2.mean <= allowedOver(s0.mean, vp.floorAlpha) && st2.p95 <= allowedOver(s0.p95, vp.floorAlpha), got: 'passes its own gate' })
  }
  /* the seam and handoff verdicts, driven through the functions the checks call */
  proofs.push({ k: 'seam: a bit-identical loop passes (0 / 0)', ok: seamVerdict({ crossfadePeak: 0 }, 0), got: 'peak 0, p95 step 0' })
  {
    const K = Math.max(1, Math.round(CROSSFADE_S * FPS))
    const drift = 0.09 / K
    proofs.push({
      k: 'seam: a still-only loop passes',
      ok: seamVerdict({ crossfadePeak: drift }, 0.01),
      got: `0.09 luma of codec drift across the crossfade vs p95 step 0.01 → ${drift.toFixed(4)}/frame (${(drift / 0.01).toFixed(1)}×: the ratio alone refused it)`,
    })
  }
  {
    /* a hard cut is the two ends dissolved in one frame; the rule must refuse it when it is visible */
    const bites = seam.hardCutLuma > Math.max(T.stepFloor, Math.min(T.seamPeakAbs, T.seamPeakRatio * stepP95))
    proofs.push({
      k: "seam: this clip's ends as a hard cut",
      ok: seamVerdict({ crossfadePeak: seam.hardCutLuma }, stepP95) === !bites,
      got: `${seam.hardCutLuma.toFixed(2)} luma in one frame → ${bites ? 'refused' : 'passes (the ends are within one native step)'}`,
    })
  }
  {
    const mid = lumaDelta(lumas[0], lumas[Math.floor(N / 2)])
    proofs.push({ k: 'seam: ends = frame 0 vs mid-clip', ok: ratioOf(mid, seam.spanP95) > 1.2 || mid <= T.stepFloor, got: `${mid.toFixed(2)} = ${ratioOf(mid, seam.spanP95).toFixed(2)}× span p95` })
  }
  {
    /* sky drift: shift one sky row of frame 0 by a known amount and recover it */
    const x0 = Math.round(SKY_X[0] * LW)
    const x1 = Math.round(SKY_X[1] * LW)
    const row = Math.min(LH - 1, Math.round(SKY_ROWS[1] * LH))
    const a = skySlit(lumas[0], row, x0, x1)
    const b = new Float32Array(a.length)
    for (let x = 0; x < a.length; x += 1) b[x] = a[Math.min(a.length - 1, Math.max(0, x - 7))]
    const got = slitShift(a, b, Math.max(8, Math.round(0.055 * LW)))
    proofs.push({ k: 'sky: a 7 half-px shift is recovered', ok: got === 7, got: `${got} half-px` })
  }
  {
    /* THE WINDOW RULE, driven by window sets whose right answer is known. The
       whole-clip median it replaced would admit the third of these — a cycle
       whose halves run at equal speed in OPPOSITE directions medians to zero —
       and would decide the second by which frames the stride happened to hit. */
    const W = (...v) => v.map((p, i) => ({ t0: 2 * i, t1: 2 * i + T.skyWindowS, pairs: 40, medianShiftHalfPx: 0, pctPerS: p }))
    const q = (200 / VW) * T.skyStillQuanta
    const cases = [
      ['a calm sky, one direction, every window', W(-0.37, -0.37, -0.37, -0.37), true],
      ['one fast window among calm ones', W(-0.37, -2.4, -0.37, -0.37), false],
      ['two halves, equal and OPPOSITE (medians to zero)', W(-0.5, -0.5, 0.5, 0.5), false],
      ['the round-four cycle: left half, then a still half', W(-3.05, -1.85, -2.22, -0.92, 0, 0, 0, 0), false],
      ['a still sky whose sign is noise under the dead band', W(q * 0.9, -q * 0.9, q * 0.5, -q * 0.5), true],
      ['every window exactly at the limit', W(-T.skyDriftPctPerS, -T.skyDriftPctPerS), true],
    ]
    for (const [name, ws, want] of cases) {
      const got = skyVerdict({ ...skySummarise(ws), windows: ws })
      proofs.push({ k: `sky: ${name}`, ok: got === want, got: `${got ? 'passes' : 'refused'} (wanted ${want ? 'passes' : 'refused'})` })
    }
  }
  {
    /* the same-picture cap: the still 20 px off must fail it (sideways, so a full-height clip can be proved too) */
    const dx = 20
    let acc = 0
    let n = 0
    for (let y = 0; y < VH; y += 2) {
      for (let x = 0; x < VW - dx; x += 2) {
        const a = (y * VW + x) * 3
        const b = ((y + handoff.dy) * SW + x + dx) * 3
        acc += Math.abs(f0[a] - still[b]) + Math.abs(f0[a + 1] - still[b + 1]) + Math.abs(f0[a + 2] - still[b + 2])
        n += 3
      }
    }
    const shifted = acc / n
    proofs.push({ k: 'handoff: the still 20 px off fails the cap', ok: !handoffVerdict({ mean: shifted, fadeStep: 0 }, stepP95), got: `${shifted.toFixed(2)} lv vs cap ${T.handoffSamePicture} (registered: ${handoff.mean.toFixed(2)})` })
  }
  log('\n  --prove')
  for (const q of proofs) log(`  ${q.ok ? 'ok  ' : 'BAD '} ${q.k.padEnd(44)} ${q.got}`)
  if (proofs.some((q) => !q.ok)) {
    console.error('\n  PROOF FAILED — an estimator did not recover a known input.\n')
    process.exit(1)
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   The verdict
   ══════════════════════════════════════════════════════════════════════════ */

const checks = [
  {
    k: 'HANDOFF',
    pass: handoffVerdict(handoff, stepP95),
    value:
      `mean |frame0 − still| ${handoff.mean.toFixed(2)} lv (p99 ${handoff.p99.toFixed(1)}) at row ${handoff.dy}${handoff.declared ? ' (declared crop)' : ''}; ` +
      `${handoff.lumaMean.toFixed(2)} luma dissolved over the layer's ${FADE_S}s fade (${handoff.fadeFrames} frames) = ${handoff.fadeStep.toFixed(3)}/frame = ${ratioOf(handoff.fadeStep, stepP95).toFixed(2)}× clip p95 step`,
    limit:
      `same picture ≤ ${T.handoffSamePicture} lv (a re-encode of the still measures ${handoff.encodeGenerationRef !== null ? handoff.encodeGenerationRef.toFixed(2) : T.handoffReencodeRef}); ` +
      `fade step ≤ ${T.stepFloor}, or ≤ ${T.seamPeakRatio}× step p95 and ≤ ${T.seamPeakAbs}`,
  },
  {
    k: 'SEAM',
    pass: seamVerdict(seam, stepP95),
    value:
      `crossfade ${CROSSFADE_S}s peak step ${seam.crossfadePeak.toFixed(2)} = ${seam.crossfadeRatio.toFixed(2)}× clip p95 step (${stepP95.toFixed(2)}, median ${stepMed.toFixed(2)}); ` +
      `ends ${seam.hardCutLuma.toFixed(2)} luma apart = ${seam.spanRatio.toFixed(2)}× the clip's p95 distance across ${CROSSFADE_S}s (${seam.spanP95.toFixed(2)}, reported)`,
    limit: `peak ≤ ${T.stepFloor} lv, or ≤ ${T.seamPeakRatio}× step p95 and ≤ ${T.seamPeakAbs} lv`,
  },
  {
    k: 'CAMERA LOCK',
    pass: camera.maxDriftEdgePx <= T.cameraEdgePx,
    value: `max static-content drift ${camera.maxDriftEdgePx.toFixed(2)} px at edge (t${(camera.worstDrift.i / FPS).toFixed(1)}: Δ${(2 * camera.worstDrift.tx).toFixed(2)},${(2 * camera.worstDrift.ty).toFixed(2)} px, zoom ${(100 * camera.worstDrift.scaleMed).toFixed(3)}%); net zoom ${(100 * camera.netScale).toFixed(3)}%; jitter p95 ${camera.jitterP95EdgePx.toFixed(2)} px`,
    limit: `≤ ${T.cameraEdgePx} px`,
  },
  {
    k: 'MOTION BUDGET',
    pass: motion.mean <= T.motionMean && motion.p95 <= T.motionP95 && motion.textBox.mean <= T.motionTextMean && motion.textBox.p95 <= T.motionTextP95,
    value: `frame: mean |Δ| ${motion.mean.toFixed(2)} lv rgb, p95 ${motion.p95.toFixed(2)}, max ${motion.max.toFixed(2)} at t${motion.tMax.toFixed(1)} · under desktop text (clip x${motion.textBox.clipRect[0]}-${motion.textBox.clipRect[2]} y${motion.textBox.clipRect[1]}-${motion.textBox.clipRect[3]}): mean ${motion.textBox.mean.toFixed(2)} luma, p95 ${motion.textBox.p95.toFixed(2)} (whole frame ${motion.textBox.frameMeanLuma.toFixed(2)} / ${motion.textBox.frameP95Luma.toFixed(2)})`,
    limit: `frame mean ≤ ${T.motionMean}, p95 ≤ ${T.motionP95}; text mean ≤ ${T.motionTextMean}, p95 ≤ ${T.motionTextP95}`,
  },
]
const dirOf = (v) => (v < 0 ? 'right-to-left' : v > 0 ? 'left-to-right' : 'still')
checks.push({
  k: 'SKY DRIFT',
  pass: skyVerdict(sky),
  value:
    `worst ${T.skyWindowS}s window ${Math.abs(sky.worstWindow.pctPerS).toFixed(2)}%/s ${dirOf(sky.worstWindow.pctPerS)} at t${sky.worstWindow.t0.toFixed(1)}–${sky.worstWindow.t1.toFixed(1)}` +
    ` (${sky.windows.length} window${sky.windows.length === 1 ? '' : 's'}: ${sky.windows.map((w) => w.pctPerS.toFixed(2)).join(', ')})` +
    `; ${sky.reverses ? `REVERSES — ${sky.movingWindows} moving windows do not agree on a direction` : sky.movingWindows ? `one direction throughout (${sky.movingWindows} moving, ${sky.windows.length - sky.movingWindows} still)` : 'no window moves measurably'}` +
    `; whole clip ${Math.abs(sky.pctPerS).toFixed(2)}%/s ${dirOf(sky.pctPerS)} = ${Math.abs(sky.pxPerS).toFixed(1)} px/s (median of ${sky.pairs} row-pairs, ${SKY_ROWS.length} rows at 4–12% of the height, lag ${sky.lagFrames} frames; shifts ${sky.min}..${sky.max} half-px, reported)`,
  limit: `every ${T.skyWindowS}s window ≤ ${T.skyDriftPctPerS}%/s (a crossing no faster than every ${Math.round(100 / T.skyDriftPctPerS)} s) AND no reversal between windows over ${sky.stillPctPerS.toFixed(2)}%/s`,
})
/* LEGIBILITY is a verdict only where the layer can mount. The layer's media
   query is (min-width: <minWidthPx>px) and (pointer: fine): below that width
   there is no <video>, the hero is the still, and the still's own gate has
   already passed. Those viewports are measured and REPORTED — the number says
   what the clip would do there — but a clip is not refused for a viewport it
   never renders on. */
for (const vp of VIEWPORTS) {
  const r = legibility.worstByVp[vp.name]
  const mounts = vp.w >= LAYER.minWidthPx
  checks.push({
    k: mounts ? `LEGIBILITY ${vp.name}` : `LEGIBILITY ${vp.name} (never mounts under ${LAYER.minWidthPx}px — reported)`,
    pass: mounts ? r.pass : true,
    value: `worst cell ${r.clip.worst.toFixed(3)} (still ${r.still.worst.toFixed(3)}) · p95 ${r.clip.p95.toFixed(3)} @t${r.clip.tP95.toFixed(1)} (still ${r.still.p95.toFixed(3)}) · mean ${r.clip.mean.toFixed(3)} @t${r.clip.tMean.toFixed(1)} (still ${r.still.mean.toFixed(3)})`,
    limit: `worst ≤ ${r.allow.worst.toFixed(3)} · p95 ≤ ${r.allow.p95.toFixed(3)} · mean ≤ ${r.allow.mean.toFixed(3)} at field floor ${(r.floorAlpha * 100).toFixed(1)}%`,
  })
}
/* ── THE RECORD OF THE JUDGEMENT, against the judgement ──────────────────
   The manifest's sha256 anchors the BYTES, and `--install` is the only writer,
   so the clip cannot drift. What could drift silently until 2026-09-07 is the
   RECORD of why it passed: change a threshold in T, and manifest.json goes on
   quoting the limit that no longer exists — which is what happened when SKY
   DRIFT stopped being a whole-clip median. A record that outlives the rule it
   records is exactly the defect this repo refuses everywhere else, so the
   no-argument run (the one `npm run verify` makes) now re-derives the block and
   compares it. Only on the installed clip: a candidate on the command line has
   no record to be stale. */
if (INSTALL === false && arg('--clip', null) === null && installed && installed.present === true) {
  const rec = installed.harness ?? null
  const drift = []
  if (rec === null) drift.push('the manifest records no harness block at all')
  else {
    const want = checks.map((c) => `${c.k} | ${c.limit}`).join('\n')
    const got = (rec.checks ?? []).map((c) => `${c.check} | ${c.limit}`).join('\n')
    if (want !== got) drift.push('the recorded checks and limits are not the ones this gate now applies')
    if (rec.verdict !== (checks.some((c) => !c.pass) ? 'FAIL' : 'PASS')) drift.push(`the recorded verdict is ${rec.verdict}`)
    if (JSON.stringify(rec.thresholds ?? null) !== JSON.stringify(T)) drift.push('the recorded thresholds are not this gate\'s thresholds')
    if (rec.crossfadeS !== CROSSFADE_S) drift.push(`the record was reached at a ${rec.crossfadeS}s crossfade and the layer now dissolves for ${CROSSFADE_S}s`)
    if (rec.fadeS !== FADE_S) drift.push(`the record was reached at a ${rec.fadeS}s fade-in and the layer now fades for ${FADE_S}s`)
  }
  if (drift.length) {
    log('')
    for (const d of drift) log(`  RECORD DRIFT — ${d}`)
    stop(
      `public/brand/hero/motion/manifest.json records a judgement this gate no longer makes (${drift.length} difference(s) above). ` +
        'The bytes are fine — the record is stale. Re-run `node scripts/check-hero-motion.mjs --install --clip <the master>` to rewrite it, ' +
        'or revert the threshold change.',
      1,
    )
  }
}

const failed = checks.filter((c) => !c.pass)

log('')
log(`  check-hero-motion — ${basename(clipPath)}  ${VW}x${VH} ${FPS}fps ${meta.duration.toFixed(2)}s (${N} frames), still ${relative(ROOT, stillPath)} ${SW}x${SH}, sampled every ${STEP} frames`)
if (isMp4) {
  log(
    `  container  ${container.codec.join('/') || '?'} · ${container.fastStart === null ? 'moov/mdat order unknown' : container.fastStart ? 'faststart' : 'moov AFTER mdat (not faststart)'} · ` +
      `${container.handlers.includes('soun') ? 'HAS AUDIO' : 'no audio'} · colr ${container.colr ? `${container.colr.primaries}/${container.colr.transfer}/${container.colr.matrix}` : 'untagged'} · ` +
      `${container.c2pa ? 'C2PA manifest embedded' : 'no C2PA manifest'} · ${(clipBytes.length / 1024 / 1024).toFixed(2)} MB`,
  )
}
log('')
for (const c of checks) log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.k.padEnd(20)} ${c.value}\n        ${''.padEnd(20)} limit: ${c.limit}`)
log(`\n  ${failed.length ? `FAIL — ${failed.length} of ${checks.length} checks` : `OK — ${checks.length} of ${checks.length} checks`}\n`)

const report = {
  clip: relative(ROOT, clipPath),
  sha256: clipSha,
  bytes: clipBytes.length,
  meta,
  container,
  N,
  STEP,
  crossfadeS: CROSSFADE_S,
  thresholds: T,
  crop: CROP,
  handoff,
  seam,
  camera: { maxDriftEdgePx: camera.maxDriftEdgePx, jitterP95EdgePx: camera.jitterP95EdgePx, netScale: camera.netScale, drift: camera.drift },
  motion,
  legibility,
  checks,
  verdict: failed.length ? 'FAIL' : 'PASS',
}
if (JSON_OUT) {
  writeFileSync(resolve(JSON_OUT), JSON.stringify(report, null, 1))
  log(`  wrote ${JSON_OUT}\n`)
}

/* ══════════════════════════════════════════════════════════════════════════
   --install — the one write
   ══════════════════════════════════════════════════════════════════════════ */

if (INSTALL) {
  const refuse = (why) => stop(`NOT INSTALLED — ${why}`, 1)
  if (failed.length) refuse(`the clip fails ${failed.length} check(s): ${failed.map((c) => c.k).join(', ')}. A failing clip never lands.`)
  if (!isMp4) refuse('only an .mp4 master can be installed today (the container probe reads ISOBMFF).')
  if (container.width === null || container.durationS === null) refuse('the container\'s tkhd/mvhd could not be read.')
  if (clipBytes.length > BUDGETS.mp4Bytes) {
    refuse(`${(clipBytes.length / 1024 / 1024).toFixed(2)} MB is over the ${(BUDGETS.mp4Bytes / 1024 / 1024).toFixed(2)} MB budget. Re-encode (see public/brand/hero/README.md, The motion layer) before installing.`)
  }
  if (container.durationS > BUDGETS.maxDurationS) refuse(`${container.durationS.toFixed(2)}s is over the ${BUDGETS.maxDurationS}s budget.`)
  if (FPS > BUDGETS.maxFps) refuse(`${FPS} fps is over the ${BUDGETS.maxFps} fps budget.`)
  if (VW > BUDGETS.maxWidth) refuse(`${VW}px wide is over the ${BUDGETS.maxWidth}px budget (never upscale; never ship wider than the still).`)
  const cap = CAP_ARG === null ? 1 : Number(CAP_ARG)
  if (!(cap > 0 && cap <= 1)) refuse(`--cap ${CAP_ARG} is not an opacity in (0, 1].`)

  const warnings = []
  if (container.fastStart === false) warnings.push('moov follows mdat (not faststart): playable through Range, but the first frame waits for the whole file. Re-mux when an encoder is available.')
  if (container.handlers.includes('soun')) warnings.push('the clip carries an audio track nobody hears; strip it when an encoder is available.')
  if (!container.colr) warnings.push('no colr box: browsers may guess bt601 vs bt709 and shift luminance 2–4%. Tag bt709 when an encoder is available.')
  else if (container.colr.primaries !== 1 || container.colr.transfer !== 1 || container.colr.matrix !== 1) {
    warnings.push(
      `colr box is ${container.colr.primaries}/${container.colr.transfer}/${container.colr.matrix}, not bt709 1/1/1 (2 = unspecified): the H.264 VUI may still say bt709, ` +
        'but a container that reads differently from its bitstream is a guess left to the browser. Re-mux with the colr written when an encoder is available.',
    )
  }

  const name = `hero-loop-${clipSha.slice(0, 8)}.mp4`
  mkdirSync(MOTION_DIR, { recursive: true })
  const others = readdirSync(MOTION_DIR).filter((n) => MOTION_FILE.test(n) && n !== name)
  if (others.length) {
    refuse(`public/brand/hero/motion/ already holds ${others.join(', ')}. This script never deletes — remove it by hand, then re-run.`)
  }
  const dest = join(MOTION_DIR, name)
  if (existsSync(dest) && sha256(readFileSync(dest)) !== clipSha) {
    refuse(`${name} exists with different bytes than the clip being installed — a hash collision on the name, which should not happen; remove it by hand.`)
  }
  if (!existsSync(dest)) copyFileSync(clipPath, dest)

  let heroManifest = null
  try {
    heroManifest = readJson(HERO_MANIFEST)
  } catch {
    heroManifest = null
  }
  const manifest = {
    present: true,
    generator: 'scripts/check-hero-motion.mjs --install',
    file: name,
    publicPath: `/brand/hero/motion/${name}`,
    bytes: clipBytes.length,
    sha256: clipSha,
    width: VW,
    height: VH,
    durationS: Number(meta.duration.toFixed(3)),
    fps: FPS,
    frames: N,
    codec: container.codec[0] ?? null,
    fastStart: container.fastStart,
    hasAudio: container.handlers.includes('soun'),
    colour: container.colr,
    c2paInMaster: container.c2pa,
    crop: CROP,
    stillAspect: STILL_ASPECT,
    madeFrom: {
      still: relative(ROOT, stillPath),
      stillRungSha256: sha256(readFileSync(stillPath)),
      stillResampledTo: stillResampled,
      stillSha256: heroManifest?.source?.sha256 ?? G.source?.sha256 ?? null,
      master: basename(clipPath),
      masterSha256: clipSha,
    },
    opacityCap: cap,
    opacityCapSolvedBy: CAP_ARG === null ? null : 'tests/e2e/hero-motion.spec.ts',
    harness: {
      verdict: 'PASS',
      crossfadeS: CROSSFADE_S,
      fadeS: FADE_S,
      sampleFps: SAMPLE_FPS,
      thresholds: T,
      checks: checks.map((c) => ({ check: c.k, pass: c.pass, value: c.value, limit: c.limit })),
      handoff: { dy: handoff.dy, mean: handoff.mean, p99: handoff.p99, lumaMean: handoff.lumaMean, fadeS: handoff.fadeS, fadeStep: handoff.fadeStep },
      sky,
      seam: { hardCutLuma: seam.hardCutLuma, spanRatio: seam.spanRatio, crossfadePeak: seam.crossfadePeak },
      camera: { maxDriftEdgePx: camera.maxDriftEdgePx, jitterP95EdgePx: camera.jitterP95EdgePx, netScale: camera.netScale },
      motion: { mean: motion.mean, p95: motion.p95, textBox: motion.textBox },
    },
    warnings,
    budgets: BUDGETS,
    note:
      'Written by scripts/check-hero-motion.mjs --install and by nothing else; read by components/site/hero.tsx, gated by ' +
      'scripts/verify-hero-assets.mjs and re-checked by `npm run check:motion` on every verify. opacityCap is the layer\'s ' +
      'opacity ceiling: 1 until tests/e2e/hero-motion.spec.ts solves a lower one, written back with --cap. The clip ' +
      'renders when NEXT_PUBLIC_HERO_MOTION is not "off" at build (lib/hero-motion.ts HERO_MOTION_ENABLED, on by default since 2026-09-06) AND data/corpus/artifacts.json art:hero-motion ' +
      'is verified. No timestamp: the commit carries the date, and a generatedAt makes every run produce different bytes.',
  }
  writeFileSync(MOTION_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  log(`  installed ${name} (${(clipBytes.length / 1024 / 1024).toFixed(2)} MB) and wrote public/brand/hero/motion/manifest.json`)
  for (const w of warnings) log(`  warning  ${w}`)
  log('')
}

process.exit(failed.length ? 1 : 0)
