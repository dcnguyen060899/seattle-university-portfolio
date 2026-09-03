#!/usr/bin/env node
/**
 * verify-hero-assets.mjs — the gate on the hero photograph pipeline.
 *
 *     node scripts/verify-hero-assets.mjs
 *
 * Exits 0 when the hero assets are absent-and-declared-absent, or present and
 * consistent with the source they were generated from. Exits 1 otherwise.
 * Reads only; it never writes and never regenerates.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE ABSENT STATE IS A PASS, AND WHY THAT IS THE INTERESTING PART
 *
 * The photograph is progressive enhancement over a hero that already works. The
 * repo ships today with no `public/brand/hero-source.png` and no generated
 * variants, and the hero renders as the flat ink ground — which is correct,
 * accessible, and exactly what is deployed. A gate that failed on that state
 * would be asserting that the CURRENT, SHIPPING repo is broken, and the first
 * thing anyone would do is delete the gate.
 *
 * So absent is a pass. What is NOT a pass is DRIFT: a source that has changed
 * since the variants were built, a variant listed in the manifest that is not on
 * disk, a file over its byte budget, a rung whose filename claims a width its
 * pixels do not have, or a stray `hero-*` file no run would have produced.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATE TABLE — every combination, and what it means
 *
 *   source   manifest        result
 *   ──────   ─────────────   ────────────────────────────────────────────────
 *   absent   present:false   PASS. The shipping state. The hero is flat ink.
 *   absent   missing         PASS, with a note. Equivalent to the above for a
 *                            consumer that guards its import, but the committed
 *                            placeholder is what makes an unguarded static
 *                            import safe, so it says how to restore it.
 *   absent   present:true    PASS with a WARNING. Variants are committed but
 *                            the master is not in the tree, so freshness cannot
 *                            be checked. Everything checkable is still checked.
 *   present  missing         FAIL. A master nobody has processed.
 *   present  present:false   FAIL. The manifest says "no photograph" while a
 *                            photograph sits next to it.
 *   present  hash mismatch   FAIL. THE STALENESS CASE. The variants on disk
 *                            were built from a different image than the one in
 *                            the tree, and that is invisible by eye.
 *   present  hash match      Check every file: existence, byte size, byte
 *                            budget, declared-vs-actual width, and the
 *                            no-upscale rule against both the crop's native
 *                            width and the source's.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE FILENAME'S WIDTH IS CHECKED AGAINST THE FILE'S PIXELS
 *
 * `hero-p-640.avif 640w` in a srcset is a PROMISE to the browser: the `w`
 * descriptor is what it selects against, and it is taken from the filename by
 * every consumer here. A file whose pixels disagree with its name makes the
 * browser pick the wrong rendition — larger than it needs on a small screen, or
 * too small on a large one — and nothing about it looks wrong in a diff. This is
 * the reference pipeline's rule ("names its widths honestly and never upscales")
 * and it is cheap to enforce, so it is enforced.
 */

import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEST = path.join(ROOT, 'public/brand/hero')
const MANIFEST = path.join(DEST, 'manifest.json')
const GENERATE = 'node scripts/gen-hero-photo.mjs'

const SOURCE_CANDIDATES = [
  'public/brand/hero-source.png',
  'public/brand/hero-source.jpg',
  'public/brand/hero-source.jpeg',
]

/** Only these names belong to the generator. Anything else here is a stray. */
const OWNED = /^hero-(?:[pl]-\d+\.(?:avif|webp)|soft-[pl]\.webp|proof\.webp)$/
/** Files a human owns in this directory. Never swept, never flagged. */
const HUMAN_OWNED = new Set(['README.md', '.gitkeep', 'manifest.json', '.DS_Store'])

/**
 * Scrim alphas above this are legal but mean the photograph is nearly gone.
 * Mirrors the generator's own warning threshold so the two cannot drift apart
 * silently — if one moves, this comment is the reason to move the other.
 */
const SCRIM_ALPHA_WARN = 0.85

const problems = []
const notes = []
const bad = (why) => problems.push(why)
const note = (why) => notes.push(why)

let sharp = null
async function loadSharp() {
  if (sharp) return sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    sharp = null
  }
  return sharp
}

async function fileInfo(abs) {
  try {
    const s = await stat(abs)
    return s.isFile() ? s : null
  } catch {
    return null
  }
}

async function findSource() {
  const found = []
  for (const rel of SOURCE_CANDIDATES) {
    const abs = path.join(ROOT, rel)
    const s = await fileInfo(abs)
    if (s) found.push({ rel, abs, bytes: s.size })
  }
  if (found.length > 1) {
    bad(
      `More than one hero source is present (${found.map((f) => f.rel).join(', ')}). ` +
        `The generator refuses to guess between two masters — delete all but one.`,
    )
  }
  return found[0] ?? null
}

async function readManifest() {
  const s = await fileInfo(MANIFEST)
  if (!s) return { state: 'missing', manifest: null }
  let manifest
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  } catch (err) {
    bad(`public/brand/hero/manifest.json is not valid JSON (${err.message}). Re-run \`${GENERATE}\`.`)
    return { state: 'invalid', manifest: null }
  }
  if (typeof manifest.present !== 'boolean') {
    bad(
      `public/brand/hero/manifest.json has no boolean \`present\` field. That field is the whole contract ` +
        `with the hero component: it branches on it to decide whether to render a <picture> at all.`,
    )
    return { state: 'invalid', manifest: null }
  }
  return { state: manifest.present ? 'present' : 'absent', manifest }
}

/** Every generated file actually sitting in the directory right now. */
async function onDisk() {
  const names = []
  const strays = []
  let entries
  try {
    entries = await readdir(DEST)
  } catch {
    return { names, strays, exists: false }
  }
  for (const name of entries) {
    if (HUMAN_OWNED.has(name)) continue
    if (OWNED.test(name)) names.push(name)
    else strays.push(name)
  }
  return { names: names.sort(), strays: strays.sort(), exists: true }
}

/* ── Run ──────────────────────────────────────────────────────────────────── */

const source = await findSource()
const { state: manifestState, manifest } = await readManifest()
const disk = await onDisk()

if (disk.strays.length > 0) {
  bad(
    `public/brand/hero/ holds ${disk.strays.length} file(s) the generator does not own and did not write: ` +
      `${disk.strays.join(', ')}. Either they belong somewhere else, or a naming convention changed and the ` +
      `sweep in gen-hero-photo.mjs no longer recognises its own output.`,
  )
}

if (!source && manifestState === 'missing') {
  if (disk.names.length > 0) {
    bad(
      `There is no hero source and no manifest, but ${disk.names.length} generated file(s) are still on disk ` +
        `(${disk.names.slice(0, 4).join(', ')}${disk.names.length > 4 ? ', …' : ''}). Orphaned assets: nothing ` +
        `records what they were made from. Run \`${GENERATE}\` to rebuild or sweep them.`,
    )
  } else {
    note(
      `No hero photograph and no manifest — the hero renders as the flat ink ground. That is correct, but ` +
        `commit a placeholder manifest so a consumer can static-import it unconditionally: run ` +
        `\`${GENERATE} --allow-missing\`.`,
    )
  }
} else if (!source && manifestState === 'absent') {
  if (disk.names.length > 0) {
    bad(
      `manifest.json says present:false, but ${disk.names.length} generated file(s) are on disk ` +
        `(${disk.names.slice(0, 4).join(', ')}${disk.names.length > 4 ? ', …' : ''}). A consumer reading the ` +
        `manifest renders the flat ink ground while these sit in the deployment unreferenced. Run \`${GENERATE}\`.`,
    )
  } else {
    note('No hero photograph installed; manifest declares present:false. The hero is the flat ink ground.')
  }
} else if (source && manifestState === 'missing') {
  bad(
    `${source.rel} exists but public/brand/hero/manifest.json does not. The photograph has never been ` +
      `processed. Run \`${GENERATE}\`.`,
  )
} else if (source && manifestState === 'absent') {
  bad(
    `${source.rel} exists but manifest.json declares present:false, so the hero renders as flat ink and ` +
      `ignores the photograph entirely. Run \`${GENERATE}\`.`,
  )
} else if (manifestState === 'present') {
  await verifyPresent()
}

async function verifyPresent() {
  /* ── Freshness ────────────────────────────────────────────────────────── */
  if (source) {
    const hash = createHash('sha256').update(await readFile(source.abs)).digest('hex')
    if (!manifest.source || typeof manifest.source.sha256 !== 'string') {
      bad(
        `manifest.json declares present:true but records no source sha256, so staleness cannot be detected ` +
          `at all. Re-run \`${GENERATE}\` with the current generator.`,
      )
    } else if (manifest.source.sha256 !== hash) {
      bad(
        `STALE. ${source.rel} has changed since the hero assets were generated.\n` +
          `      manifest sha256  ${manifest.source.sha256}\n` +
          `      on-disk sha256   ${hash}\n` +
          `      Every variant, both crops, the baked soft layers and — most importantly — the measured scrim ` +
          `alpha all describe the OLD image. Run \`${GENERATE}\`.`,
      )
    } else if (manifest.source.path !== source.rel) {
      bad(
        `manifest.json was generated from ${manifest.source.path} but the source in the tree is ${source.rel}. ` +
          `Same bytes, different name — re-run \`${GENERATE}\` so the manifest matches.`,
      )
    }
  } else {
    note(
      `manifest.json declares present:true but no source is in the tree, so freshness cannot be verified. ` +
        `Everything else below is still checked. If the master is kept outside the repo, that is fine; if it ` +
        `was deleted by accident, the variants cannot be regenerated.`,
    )
  }

  /* ── The manifest's own shape ─────────────────────────────────────────── */
  const orientations = manifest.orientations ?? {}
  for (const key of ['p', 'l']) {
    if (!orientations[key]) bad(`manifest.json has no "${key}" orientation. Both crops are required.`)
  }
  if (typeof manifest.artDirectionBreakpointPx !== 'number') {
    bad(
      `manifest.json carries no artDirectionBreakpointPx. The <picture> media query is generated from it; ` +
        `without it a consumer has to retype the breakpoint, which is how a crop and its media query drift apart.`,
    )
  }
  if (!manifest.scrim || typeof manifest.scrim.requiredAlpha !== 'number') {
    bad(
      `manifest.json carries no scrim.requiredAlpha. That number is what makes the hero's published contrast ` +
        `ratios true over a photograph — it is not optional metadata.`,
    )
  } else {
    const a = manifest.scrim.requiredAlpha
    if (!(a >= 0 && a <= 1)) {
      bad(`scrim.requiredAlpha is ${a}, which is not an opacity.`)
    } else if (['base', 'exit'].some((k) => typeof manifest.scrim[k] === 'number' && manifest.scrim[k] < a)) {
      /* base and exit are design knobs derived from the floor. Neither may fall
         under it: a scrim lighter than requiredAlpha does not make the hero
         look better, it makes its published contrast ratios false. */
      bad(
        `manifest.scrim has base ${manifest.scrim.base} / exit ${manifest.scrim.exit} against a measured floor ` +
          `of ${a}. A scrim below the floor makes the hero's published contrast ratios false.`,
      )
    } else if (a > SCRIM_ALPHA_WARN) {
      note(
        `scrim.requiredAlpha is ${a.toFixed(3)} — legal, and that dark a scrim leaves very little of the ` +
          `photograph visible UNDER THE TEXT. That part is not fixable: the composite ceiling beneath a glyph ` +
          `is fixed by the palette, so a darker crop or a heavier grade changes it by a couple of sRGB levels ` +
          `while costing the aperture far more. Whether the hero reads as a photograph is decided by the ` +
          `APERTURE instead — see components/site/hero-scrim.module.css, and the VISIBILITY table that ` +
          `check-hero-contrast prints.`,
      )
    }
  }

  /* ── Coverage: what `object-fit: cover` throws away ──────────────────── */

  /*
    ── WHY A GATE HERE AT ALL, WHEN THE NUMBERS ARE A FRAMING DECISION ─────

    It is not the LOSS that is checked — that is a design choice, and the
    right place to judge it is hero-proof.webp and `gen-hero-photo
    --evaluate-crops`. What is checked is that the loss is RECORDED, and that
    the record is internally consistent with the crop it claims to describe.

    The reason is the defect this whole pass came out of. `.frame` was bounded
    to `min(100%, 106svh)` while the band's height was set by how much copy it
    carried, and the 35% of the hero that fell out of the gap between those
    two numbers was invisible to every gate in the repo — because no gate held
    the crop's shape and the box's shape in the same hand. This pipeline knew
    the aspect of every rung it emitted and nothing about the box those rungs
    land in.

    So the manifest now records the pairing, and this checks it is there and
    that it describes THIS build. A `coverage` block that survives a crop
    change would be worse than none: it would be a number that looks measured
    and is stale.
  */
  if (!Array.isArray(manifest.coverage)) {
    bad(
      `manifest.json carries no \`coverage\` array. That block pairs each emitted crop with the hero ` +
        `band box it is \`object-fit: cover\`-ed into, and it exists because a crop's aspect on its own ` +
        `says nothing about how much of it a reader ever sees. Run \`${GENERATE}\`.`,
    )
  } else {
    for (const row of manifest.coverage) {
      const o = orientations[row.orientation]
      const crop = o?.crop?.pixels
      if (!crop) {
        bad(
          `manifest.coverage has a row for the "${row.orientation}" orientation at ${row.viewport}px, but ` +
            `the manifest declares no such orientation. Run \`${GENERATE}\`.`,
        )
        continue
      }
      if (typeof row.kept !== 'number' || !(row.kept > 0 && row.kept <= 1)) {
        bad(`manifest.coverage row for ${row.viewport}px has no usable \`kept\` fraction (${row.kept}).`)
        continue
      }
      /* Re-derive it from the crop the manifest itself declares. A mismatch
         means the coverage block and the crop came from different runs. */
      const scale = Math.max(row.band.w / crop.width, row.band.h / crop.height)
      const kept = (row.band.w * row.band.h) / (crop.width * scale * crop.height * scale)
      if (Math.abs(kept - row.kept) > 0.001) {
        bad(
          `manifest.coverage for ${row.viewport}px records kept=${row.kept}, but the ${row.orientation} crop ` +
            `it names (${crop.width}x${crop.height}) into that band box (${row.band.w}x${row.band.h}) keeps ` +
            `${kept.toFixed(4)}. The coverage block describes a different crop than the one on disk — it ` +
            `survived a re-frame. Run \`${GENERATE}\`.`,
        )
      }
    }
    const worst = manifest.coverage.reduce(
      (a, b) => (a === null || b.kept < a.kept ? b : a),
      null,
    )
    if (worst && worst.kept < 0.5) {
      note(
        `at ${worst.viewport}px the ${worst.orientation} crop keeps only ${(worst.kept * 100).toFixed(1)}% of its ` +
          `area once \`object-fit: cover\` fits it to the ${worst.band.w}x${worst.band.h} band ` +
          `(${(worst.lostX * 100).toFixed(0)}% of its width, ${(worst.lostY * 100).toFixed(0)}% of its height), and ` +
          `magnifies it ${worst.magnification}x at DPR 1. Not a failure — a hero band this much taller than it is ` +
          `wide cannot be covered by any crop this master can yield. Run \`${GENERATE} --evaluate-crops\` for the ` +
          `full table before re-framing; on this master the tallest viable portrait slice is 9:16.`,
      )
    }
  }

  /* ── Every file the manifest promises ─────────────────────────────────── */
  const promised = new Set()
  const s = await loadSharp()
  if (!s) {
    note('sharp is not installed, so declared-vs-actual pixel widths could not be checked. Byte checks still ran.')
  }

  for (const [key, o] of Object.entries(orientations)) {
    const entries = [...(o.files ?? [])]
    if (o.soft) entries.push({ ...o.soft, format: 'webp', soft: true })

    for (const f of entries) {
      promised.add(f.name)
      const abs = path.join(DEST, f.name)
      const st = await fileInfo(abs)
      if (!st) {
        bad(`${f.name} is listed in the manifest but is not on disk. Run \`${GENERATE}\`.`)
        continue
      }
      if (st.size !== f.bytes) {
        bad(
          `${f.name} is ${st.size} bytes on disk but the manifest records ${f.bytes}. The file was edited, ` +
            `re-compressed or partially written after generation. Run \`${GENERATE}\`.`,
        )
        continue
      }

      /* Budgets. Re-derived from the manifest's own budget table rather than
         re-typed here, so a budget change in the generator cannot leave this
         gate enforcing an old number. */
      const budget = budgetFor(f, key, o, manifest.budgets)
      if (budget !== null && st.size > budget) {
        bad(
          `${f.name} is ${(st.size / 1024).toFixed(1)}KB, over its ${(budget / 1024).toFixed(0)}KB budget. ` +
            `The generator enforces this at write time, so a file over budget here means the budget was lowered ` +
            `after these assets were built. Run \`${GENERATE}\`.`,
        )
      }

      /* Declared vs actual width, and the no-upscale rule. */
      if (s && !f.soft) {
        const meta = await s(abs).metadata()
        const declared = declaredWidthOf(f.name)
        if (declared !== null && meta.width !== declared) {
          bad(
            `${f.name} is ${meta.width}px wide but its name claims ${declared}px. The filename width IS the \`w\` ` +
              `descriptor the browser selects against, so this makes it pick the wrong rendition.`,
          )
        }
        if (meta.width !== f.width || meta.height !== f.height) {
          bad(`${f.name} is ${meta.width}x${meta.height} but the manifest records ${f.width}x${f.height}.`)
        }
        if (typeof o.nativeWidth === 'number' && meta.width > o.nativeWidth) {
          bad(
            `${f.name} is ${meta.width}px wide, above the ${o.nativeWidth}px native width of the ${key} crop. ` +
              `That is an upscale: pixels invented by the pipeline rather than present in the master.`,
          )
        }
        if (manifest.source && typeof manifest.source.width === 'number' && meta.width > manifest.source.width) {
          bad(
            `${f.name} is ${meta.width}px wide, above the ${manifest.source.width}px master. The source is the ` +
              `ceiling — nothing may be wider than the photograph it came from.`,
          )
        }
      }
    }

    /* The srcset a consumer will paste must name files that exist. */
    for (const fmt of ['avif', 'webp']) {
      const srcset = o.srcset?.[fmt]
      if (typeof srcset !== 'string' || srcset.length === 0) {
        bad(`orientation "${key}" has no ${fmt} srcset in the manifest.`)
        continue
      }
      for (const part of srcset.split(',')) {
        const [url] = part.trim().split(/\s+/)
        const name = path.basename(url)
        if (!promised.has(name)) {
          bad(`the ${key} ${fmt} srcset references ${name}, which is not among the files the manifest lists.`)
        }
      }
    }
  }

  if (manifest.proof?.publicPath) {
    const name = path.basename(manifest.proof.publicPath)
    promised.add(name)
    if (!(await fileInfo(path.join(DEST, name)))) {
      note(`${name} (the crop proof sheet) is missing. Not shipped to users; re-run \`${GENERATE}\` to restore it.`)
    }
  }

  /* ── Orphans: on disk, promised by nobody ─────────────────────────────── */
  for (const name of disk.names) {
    if (!promised.has(name)) {
      bad(
        `${name} is on disk but no longer listed in the manifest. The generator sweeps its own orphans, so this ` +
          `file survived a rename or was committed by hand. It is dead weight in the deployment at best, and a ` +
          `stale rendition something still links to at worst.`,
      )
    }
  }
}

function declaredWidthOf(name) {
  const m = /^hero-[pl]-(\d+)\.(?:avif|webp)$/.exec(name)
  return m ? Number(m[1]) : null
}

/**
 * Which budget governs a file, mirroring the generator's classification:
 * by what the file IS (orientation, format, and whether it is the smallest
 * portrait AVIF), never by a hardcoded filename.
 */
function budgetFor(f, key, o, budgets) {
  if (!budgets) return null
  if (f.soft) return budgets.softBytes ?? null
  if (f.format === 'webp') return budgets.webpBytes ?? null
  if (key === 'l') return budgets.landscapeAvifBytes ?? null
  const smallest = Array.isArray(o.emittedWidths) ? Math.min(...o.emittedWidths) : null
  return f.width === smallest ? (budgets.smallestPortraitAvifBytes ?? null) : (budgets.portraitAvifBytes ?? null)
}

/* ── Report ───────────────────────────────────────────────────────────────── */

console.log('')
console.log('  hero assets')
console.log('  ──────────────────────────────────────────────────────────────────────────────')
console.log(`  source     ${source ? `${source.rel}  (${(source.bytes / 1024 / 1024).toFixed(2)}MB)` : 'none installed'}`)
console.log(
  `  manifest   ${
    manifestState === 'present'
      ? `present:true  — ${disk.names.length} generated file(s)`
      : manifestState === 'absent'
        ? 'present:false — the hero is the flat ink ground'
        : manifestState
  }`,
)
if (manifestState === 'present' && manifest?.scrim) {
  console.log(
    `  scrim      ${manifest.scrim.scrimColor} at alpha ${Number(manifest.scrim.requiredAlpha).toFixed(3)} ` +
      `for ${manifest.scrim.bindingForeground} at ${manifest.scrim.targetRatio}:1`,
  )
}
console.log('')

for (const n of notes) console.log(`  note  ${n}\n`)

if (problems.length > 0) {
  console.error(`  ✗ ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`)
  for (const p of problems) console.error(`    ${p}\n`)
  process.exit(1)
}

console.log('  ✓ hero assets are consistent.\n')
