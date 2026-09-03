import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { ANY_SHARP_REQUEST, NOT_LANDED_MESSAGE, heroPhotoHasLanded } from './helpers/hero-assets'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HERO'S FRAME BUDGET.
 *
 * ── THE BUG THIS GUARDS, as measured in the reference repo ───────────────
 *
 * Scrolling down and quickly back up over a photographic hero made the
 * background stutter and repaint in horizontal bands. The cause was a per-frame
 * full repaint of the background layer: the scroll driver writes `--focus`
 * every frame, the sharp copy of the photograph read it as `opacity`, and
 * because that element was not composited each change repainted its whole
 * containing layer — re-running a 34px blur and two generated noise layers
 * across a 1634x1021 box, every frame. Measured there: 2.6s of rasteriser time
 * during a 1.3s scroll, 95% of scroll-up frames over budget, a median of four
 * vsync intervals per frame — 15fps.
 *
 * The specific mechanism is NOT the invariant. The invariant is that scrolling
 * back up over the hero must not cost materially more per frame than scrolling
 * anywhere else on the same page. Any way of reintroducing heavy per-frame
 * rasterisation into the hero trips this test: a filter inside a repainted
 * subtree, a promoted filtered layer whose composite scale changes every frame,
 * a large procedurally generated background.
 *
 * ── WHY THE ASSERTION IS A RATIO AND NOT A STOPWATCH ─────────────────────
 *
 * An absolute "frames must be under 16.7ms" gate measures the machine, not the
 * page. In the reference's calibration the same scroll measured 26ms/frame idle
 * and 43ms/frame under a load average of 26 — a 1.6x swing from neighbouring
 * work alone, on a page that had not changed.
 *
 * So the measurement is PAIRED. The identical scripted scroll — same distance,
 * same per-frame step, same direction — runs twice against the same document in
 * the same browser: once across the hero, once over a hero-free stretch of the
 * same page. Background load, CPU speed and thermal state hit both legs, so the
 * RATIO between them is a property of the page. The legs are INTERLEAVED rather
 * than run in blocks, so drift during the run cancels instead of accumulating
 * in whichever leg happened to go second.
 *
 * The measurement is a rAF period, so it is quantised to the compositor's frame
 * interval: a healthy leg reports ~16.7ms, a leg needing two frames of work per
 * frame reports ~33ms. `medianRatio` therefore reads directly as "vsync
 * intervals spent per frame" — 1.0x is 60fps, 4.0x is 15fps.
 *
 * ── THIS TEST IS NOT GATED ON THE PHOTOGRAPH ─────────────────────────────
 *
 * The frame-budget assertion runs today, against the flat ink hero, and it
 * should: it establishes the baseline the photograph will be measured against,
 * and it is the gate that turns red the day a background layer lands
 * un-promoted. Only the STRUCTURAL half — where the promotion hint sits — is
 * gated, because a hint on a layer that does not exist is not a thing to
 * assert.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const photoLanded = heroPhotoHasLanded()

const CONFIG = {
  /**
   * One sweep's distance. 0.85 viewports is the span the reference's `--focus`
   * animates over, and it is the right shape here for the same reason: it is
   * the stretch where a scroll-linked hero effect does its work.
   */
  spanViewports: 0.85,
  /** ~2700px/s at 60Hz — a brisk flick. The reference found the artefact from 45px/frame up. */
  stepPx: 45,
  pairs: 4,
  /** A hero-leg frame is "long" past this multiple of what the control leg achieved. */
  budgetMultiple: 1.5,
}

/**
 * Ceiling on the fraction of hero-leg frames allowed past the budget.
 *
 * CALIBRATION BASIS. The reference repo swept this by injecting CSS over its
 * real production build and measuring each arm (n=64 hero frames, headless
 * Chromium 1280x800 DPR 1):
 *
 *   hero background removed entirely .......... 0.00   <- the floor
 *   cross-fade copy given its own layer ....... 0.00   <- a complete fix
 *   blur filter removed ....................... 0.51–0.86
 *   noise layers replaced with a flat colour .. 0.71
 *   terrain gradients replaced with a flat .... 0.75
 *   as shipped (the bug) ...................... 0.71–0.95
 *
 * There is no calibrated arm anywhere between 0.00 and 0.51, which is what
 * makes a threshold in that gap safe to pick. 0.25 sits ~2.8x below the
 * weakest configuration that still exhibits the bug, and two fixed
 * configurations reach 0.00 — so a correctly composited hero has the entire
 * budget to itself.
 *
 * MEASURED HERE, on this tree with the flat ink hero and no photograph: see
 * the attachment on every run. The margin is expected to be enormous now and
 * to stay large after the photograph lands; if it does not, the photograph
 * landed un-promoted and that is precisely the finding.
 */
const MAX_LONG_FRAME_RATIO = 0.25

/**
 * If even the hero-free control leg cannot hold this, the box is not in a state
 * where any frame measurement means anything, and failing would be reporting on
 * the runner rather than on the page.
 */
const CONTROL_SANITY_MS = 50

interface LegStats {
  frames: number[]
  median: number
  mean: number
  p95: number
  max: number
}

interface PairedScrollResult {
  hero: LegStats
  control: LegStats
  budgetMs: number
  longFrameRatio: number
  medianRatio: number
  perPairRatios: number[]
  controlFromPx: number
  spanPx: number
  stepPx: number
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function summarise(frames: number[]): LegStats {
  const sorted = [...frames].sort((a, b) => a - b)
  return {
    frames,
    median: median(frames),
    mean: +(frames.reduce((a, b) => a + b, 0) / (frames.length || 1)).toFixed(2),
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  }
}

/**
 * One down-then-up sweep starting at `from`. Only the UP phase is timed: that
 * is the direction the artefact was reported in, and the direction where a
 * scroll-linked effect has to re-render content the compositor has already
 * discarded.
 *
 * The whole sweep runs inside ONE `evaluate`. A round trip per step would cap
 * scroll velocity at the CDP round-trip time, and the fast flick — the thing
 * being tested — would never happen.
 */
async function sweep(page: Page, from: number, span: number, step: number): Promise<number[]> {
  return page.evaluate(
    async ({ from: start, span: distance, step: pitch }) => {
      const raf = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

      window.scrollTo(0, start)
      // Settle, so raster kicked off by the jump is not charged to frame one.
      for (let i = 0; i < 12; i += 1) await raf()

      for (let y = start; y <= start + distance; y += pitch) {
        window.scrollTo(0, y)
        await raf()
      }

      const up: number[] = []
      let last = performance.now()
      for (let y = start + distance; y >= start; y -= pitch) {
        window.scrollTo(0, y)
        await raf()
        const now = performance.now()
        up.push(+(now - last).toFixed(2))
        last = now
      }
      return up
    },
    { from, span, step },
  )
}

async function measurePairedScroll(page: Page): Promise<PairedScrollResult> {
  await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' })

  const geometry = await page.evaluate(() => {
    const hero = document.getElementById('top')
    const rect = hero?.getBoundingClientRect()
    return {
      vh: window.innerHeight,
      docScroll: document.documentElement.scrollHeight - window.innerHeight,
      heroBottom: rect ? rect.bottom + window.scrollY : 0,
    }
  })

  const span = Math.round(geometry.vh * CONFIG.spanViewports)
  // Start the control leg a full viewport clear of the hero, so the hero is not
  // merely off-screen but outside the compositor's prepaint region too.
  const controlFrom = Math.round(geometry.heroBottom + geometry.vh)

  if (controlFrom + span > geometry.docScroll) {
    throw new Error(
      `Page is too short for a paired measurement: the control leg needs ${controlFrom + span}px ` +
        `of scroll below the hero and the document offers ${geometry.docScroll}px. Either the ` +
        'page lost most of its bands or the hero grew to fill it; both are worth knowing.',
    )
  }

  const heroSweeps: number[][] = []
  const controlSweeps: number[][] = []
  for (let i = 0; i < CONFIG.pairs; i += 1) {
    heroSweeps.push(await sweep(page, 0, span, CONFIG.stepPx))
    controlSweeps.push(await sweep(page, controlFrom, span, CONFIG.stepPx))
  }

  const hero = summarise(heroSweeps.flat())
  const control = summarise(controlSweeps.flat())
  const budgetMs = +(control.median * CONFIG.budgetMultiple).toFixed(2)

  return {
    hero,
    control,
    budgetMs,
    longFrameRatio: +(hero.frames.filter((d) => d > budgetMs).length / hero.frames.length).toFixed(3),
    medianRatio: +(hero.median / (control.median || 1)).toFixed(2),
    perPairRatios: heroSweeps.map(
      (frames, i) => +(median(frames) / (median(controlSweeps[i] ?? []) || 1)).toFixed(2),
    ),
    controlFromPx: controlFrom,
    spanPx: span,
    stepPx: CONFIG.stepPx,
  }
}

function describe(result: PairedScrollResult): string {
  return [
    `hero leg:    median ${result.hero.median}ms  mean ${result.hero.mean}ms  p95 ${result.hero.p95}ms  max ${result.hero.max}ms  (n=${result.hero.frames.length})`,
    `control leg: median ${result.control.median}ms  mean ${result.control.mean}ms  p95 ${result.control.p95}ms  max ${result.control.max}ms  (n=${result.control.frames.length})`,
    `budget ${result.budgetMs}ms  longFrameRatio ${result.longFrameRatio}  medianRatio ${result.medianRatio}x  perPair ${JSON.stringify(result.perPairRatios)}`,
    `control sampled from y=${result.controlFromPx}px, span ${result.spanPx}px, step ${result.stepPx}px/frame`,
  ].join('\n')
}

test.describe('hero scroll performance', () => {
  test('scrolling back up over the hero holds its frame budget', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000)

    /* A GitHub-hosted runner has no GPU: xvfb software raster on two shared
       cores. A frame-budget ratio measured there reports on the runner, not on
       the page. The gate is enforced by the local run on real hardware, which
       is where the verification protocol for this repo actually happens. */
    test.skip(
      process.env['GITHUB_ACTIONS'] === 'true',
      'Frame-budget measurement is meaningless on a GPU-less shared CI runner; this gate runs ' +
        'on real hardware in the local production run.',
    )

    /* Under `reduce` the hero is deliberately static and finished, so the cost
       being measured would be vacuously zero. Pin the media state rather than
       inheriting whatever the config defaults to. */
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/', { waitUntil: 'load' })
    await expect(page.locator('#top')).toBeVisible()
    await page.waitForLoadState('networkidle').catch(() => undefined)

    const result = await measurePairedScroll(page)
    const report = describe(result)
    await testInfo.attach('paired-scroll-frame-timing.txt', {
      body: `photo landed: ${photoLanded}\n${report}`,
      contentType: 'text/plain',
    })

    test.skip(
      result.control.median > CONTROL_SANITY_MS,
      `The runner cannot hold a frame budget even with no hero on screen (control median ` +
        `${result.control.median}ms > ${CONTROL_SANITY_MS}ms). Nothing measured here would be ` +
        'about the page.',
    )

    expect(
      result.longFrameRatio,
      `The hero's scroll-up blew its frame budget.\n${report}\n\n` +
        `${(result.longFrameRatio * 100).toFixed(0)}% of scroll-up frames took longer than ` +
        `${result.budgetMs}ms, against a ceiling of ${MAX_LONG_FRAME_RATIO * 100}%. The hero is ` +
        `spending ${result.medianRatio}x the compositor's frame interval per frame ` +
        `(1.0x = 60fps, 2.0x = 30fps).\n\n` +
        'This is the signature of the hero background repainting every frame instead of ' +
        'compositing. Check that anything reading a per-frame custom property (--focus) sits on ' +
        'its own composited layer via `will-change: transform`, and that no filtered or ' +
        'procedurally generated layer sits inside a subtree that gets repainted. ' +
        `Photograph on disk for this run: ${photoLanded}.`,
    ).toBeLessThanOrEqual(MAX_LONG_FRAME_RATIO)
  })

  /**
   * The structural half of the same invariant, and the reason it is a separate
   * test: when the behavioural gate above goes red it says "the hero is slow";
   * this one says WHICH property on WHICH layer is wrong.
   *
   * THE TRAP, and it cost the reference a rewrite of its stylesheet to find: a
   * will-change hint on the WRONG property makes things worse, not better.
   *
   *   sharp layer, will-change: transform   1.00x / 0.000  <- correct
   *   sharp layer, will-change: opacity     1.03x / 0.104
   *   soft  layer, will-change: transform   2.54x / 0.667  <- unstable
   *
   * `transform` promotes the layer, which is all the opacity cross-fade needs
   * in order to composite. `opacity` additionally tells the compositor to keep
   * the picture LIVE, so a multi-megapixel photograph is rasterised even while
   * it sits invisible.
   */
  test('the promotion hint sits on transform, and on the layer that reads --focus', async ({
    page,
  }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/', { waitUntil: 'load' })
    await page.waitForLoadState('networkidle').catch(() => undefined)

    const hints = await page.evaluate((sharpPattern) => {
      const pattern = new RegExp(sharpPattern)
      const root = document.getElementById('top')
      if (!root) return []
      const describeNode = (el: Element): string => {
        const cls =
          typeof (el as HTMLElement).className === 'string'
            ? String((el as HTMLElement).className).trim().split(/\s+/).slice(0, 2).join('.')
            : ''
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`
      }
      return Array.from(root.querySelectorAll('*'))
        .map((el) => {
          const style = getComputedStyle(el)
          const img = el instanceof HTMLImageElement ? el : null
          const match = /url\("?([^")]+)"?\)/.exec(style.backgroundImage || '')
          return {
            path: describeNode(el),
            willChange: style.willChange || 'auto',
            url: img ? img.currentSrc || img.src : (match?.[1] ?? ''),
            /** Does this subtree contain a sharp photo variant? */
            holdsPhoto:
              pattern.test(img ? img.currentSrc || img.src : (match?.[1] ?? '')) ||
              Array.from(el.querySelectorAll('img')).some((child) =>
                pattern.test(child.currentSrc || child.src),
              ),
          }
        })
        .filter((probe) => probe.willChange !== 'auto' || probe.holdsPhoto)
    }, ANY_SHARP_REQUEST.source)

    const promotedOnOpacity = hints.filter(
      (probe) => /opacity/.test(probe.willChange) && !/transform/.test(probe.willChange),
    )
    expect(
      promotedOnOpacity.map((probe) => `${probe.path} (will-change: ${probe.willChange})`),
      'A hero layer carries `will-change: opacity` without `transform`:\n  ' +
        promotedOnOpacity.map((p) => `${p.path} — ${p.willChange}`).join('\n  ') +
        '\nThat hint keeps the full-size photograph rasterised while it is invisible. Promote ' +
        'with `will-change: transform`; the opacity cross-fade composites for free once the ' +
        'layer exists. Measured in the reference: 1.03x/0.104 on `opacity` vs 1.00x/0.000 on ' +
        '`transform`.',
    ).toEqual([])

    const photoLayers = hints.filter((probe) => probe.holdsPhoto)
    expect(
      photoLayers.map((probe) => probe.path),
      'No element in the hero holds a sharp photo variant, yet the ladder is on disk — the ' +
        'markup and the pipeline disagree about what shipped.',
    ).not.toEqual([])
    expect(
      photoLayers.some((probe) => /transform/.test(probe.willChange)),
      'Neither the photograph nor any ancestor of it inside the hero is promoted with ' +
        '`will-change: transform`. Layers found:\n  ' +
        photoLayers.map((p) => `${p.path} — will-change: ${p.willChange}`).join('\n  ') +
        '\nUn-promoted, every per-frame --focus write repaints the whole background subtree.',
    ).toBe(true)
  })
})
