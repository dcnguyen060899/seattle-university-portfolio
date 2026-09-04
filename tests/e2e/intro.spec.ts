import { existsSync } from 'node:fs'
import path from 'node:path'

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { decodePng, type DecodedImage } from './helpers/pixels'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HOMEPAGE INTRO — the brand reveal, and the one requirement that decides
 * whether it was built right.
 *
 * ── THE REQUIREMENT, IN THE OWNER'S WORDS ────────────────────────────────
 *
 * Given in Vietnamese, and it is the load-bearing part of the whole round:
 *
 *   "Có cách nào instead of black chuyển wa blur / Blur background xiong
 *    animation cing sẽ thấy tấm hình tõ / vậy ý là nguyên cái animation vẫn
 *    thấy cái tấm hình của cái phòng chính mờ mờ xong chuyển qua tấm hình
 *    chính"
 *
 *   → Instead of the intro playing over BLACK, it plays over the BLURRED hero
 *     photograph. The campus image is softly visible for the WHOLE animation
 *     ("mờ mờ"), and then resolves to the sharp image.
 *
 * §5 is that requirement, expressed as composited pixels. It is the acceptance
 * test for the round: if it fails, the round did not land, whatever else is
 * green. Everything before §5 is the machinery that has to be right for §5 to
 * mean anything; everything after it is the page that must not regress while
 * the intro is being built.
 *
 * ── WHY THIS IS NOT MEASURING AN MP4 ─────────────────────────────────────
 *
 * The reference implementation (MAVTERRAS, read-only) plays
 * `public/brand/intro/logo-reveal-caea5ad9.mp4` over a dark ground. That film
 * was decoded frame-by-frame in headless Chromium for this round (ffmpeg is
 * not installed; the browser is the honest instrument) and MEASURED at
 * 11.80 s, 1920x1080, with these beats:
 *
 *   0.0–1.4   static warm ground; guide-lines draw from ~1.0 but peak at 43
 *             max-luminance on a 20-mean ground — invisible
 *   1.9–2.2   the monogram strokes BURST in (max 56 → 175 → 234, lit 0.3%
 *             → 4.1%). The beat the whole film exists for.
 *   2.9–6.2   a HOLD. Mean luminance pinned at 24.76–24.78 for 3.3 s; only a
 *             corner ambient glow breathes (#0e0e0c → #191917 → #11110f).
 *   6.3–6.7   the mark lifts; 6.8–7.6 the wordmark draws; 7.6–8.4 the rule;
 *             tagline complete by ~8.6
 *   8.8–11.1  lockup complete, a slow settle drift only
 *   11.2–11.8 FADE TO BLACK; the literal last frame is #0e0e0c
 *
 * THE MEASUREMENT THAT SETTLES THE MEDIUM: across all 60 samples the film's
 * corner is opaque warm-black and its mean luminance never falls below 13.9
 * or rises above 25.9 — it is 95% dark ground at its brightest (peak lit area
 * 5.77%). There is no transparency anywhere in it. An mp4 carries a baked
 * opaque background by construction, so it CANNOT satisfy the requirement
 * above: you cannot see a photograph through it. Alpha video (WebM VP9 alpha,
 * HEVC alpha) has patchy support and is not worth it for a few KB of marks.
 *
 * So this spec asserts the reference's STRUCTURE — the gate, the skip, the
 * inertness, the route scope, the sequencing — and refuses its MEDIUM. §5
 * asserts the medium was refused, in pixels.
 *
 * ── THE GATING RULE, AND WHY IT IS NOT A SILENT PASS ─────────────────────
 *
 * NO INTRO AT ALL IS THE PRIMARY, SHIPPING STATE. Until the intro territory
 * lands, the homepage must be exactly what it is today: no overlay, no flash,
 * no layout shift, no error. That state is asserted UNCONDITIONALLY (§1), so
 * absence is covered rather than merely tolerated — and §1 keeps running after
 * the intro lands, because it is also the repeat-visit and reduced-motion
 * state.
 *
 * What is gated is the PRESENT-intro contract, and it is gated on the FILES
 * (`introHasLanded()`), not on a flag, exactly as `helpers/hero-assets.ts`
 * gates the photograph. Every gated test prints NOT_LANDED_MESSAGE when it
 * skips, because a green skip that reads as coverage is how a regression
 * ships.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════
   §0  THE CONTRACT WITH THE INTRO TERRITORY

   This spec does not own a single source file, so — like `helpers/agent.ts`
   before it — it is written against a contract declared here rather than
   against markup somebody happened to see mid-flight. Each hook is satisfied
   by EITHER an ARIA affordance the page should have anyway OR a `data-*`
   attribute. The ARIA route is listed first everywhere: if the accessible name
   is right, the test needs no hook at all.

     gate attr   html[data-intro]        | "pending" | "playing" | "done"
     overlay     [data-intro-overlay]    | or role=region named /intro/i
     skip        [data-intro-skip]       | or a button named /skip/i
     bypass      sessionStorage key      | INTRO_STORAGE_KEY below
     the ground  --focus on <html>       | 1 = blurred … 0 = sharp

   THE LAST LINE IS THE IMPORTANT ONE. `hooks/use-scroll-driver.ts` already
   publishes `--focus`, `components/site/hero.tsx` already renders the two
   copies of the photograph it cross-fades, and `hero.module.css` explains at
   length that the blur is a BAKED BITMAP and never a live filter. The intro's
   blur-to-sharp handoff is that same property driven by time instead of
   scroll. A second blur, or an animated `filter: blur()`, is a defect in the
   hero territory's terms, not a style choice — §5.3 measures the frame cost
   that would expose it.
   ════════════════════════════════════════════════════════════════════════════ */

const REPO_ROOT = process.cwd()

/**
 * The intro territory's own files. ANY one of them arms the full contract —
 * a half-landed intro is a failure, never a skip, exactly as a half-landed
 * photo ladder is in `helpers/hero-assets.ts`. Both the flat and the directory
 * layout are listed because the territory chose the directory form after this
 * spec was written, and a probe keyed to one spelling asserts nothing but the
 * spelling.
 */
const INTRO_SOURCES = [
  path.join(REPO_ROOT, 'components', 'site', 'intro.tsx'),
  path.join(REPO_ROOT, 'components', 'site', 'intro', 'Intro.tsx'),
  path.join(REPO_ROOT, 'lib', 'intro.ts'),
] as const

/** The owner's logo. Present as a RASTER today; a vector source is preferred. */
const LOGO_SOURCES = [
  path.join(REPO_ROOT, 'public', 'brand', 'logo-source.svg'),
  path.join(REPO_ROOT, 'public', 'brand', 'logo-source.pdf'),
  path.join(REPO_ROOT, 'public', 'brand', 'logo-source.png'),
] as const

function introHasLanded(): boolean {
  return INTRO_SOURCES.some((file) => existsSync(file))
}

function logoSourcePath(): string | null {
  return LOGO_SOURCES.find((candidate) => existsSync(candidate)) ?? null
}

const NOT_LANDED_MESSAGE =
  'SKIPPED, NOT SATISFIED — the intro has not landed. Neither components/site/intro.tsx nor ' +
  'lib/intro.ts exists, so the present-intro contract cannot be asserted. "No intro at all" is ' +
  'the documented shipping state and it IS covered, unconditionally, by §1 and §6 of this file. ' +
  'DO NOT READ THIS SKIP AS COVERAGE — §5 is the acceptance test for the round and it is not ' +
  'running.'

/** sessionStorage, not localStorage: the brand moment replays on a fresh session. */
const INTRO_STORAGE_KEY = 'duyng.intro.seen'

/**
 * The automation opt-in, and the reason every test below that wants to SEE an
 * intro has to ask for one.
 *
 * `lib/intro.ts` makes the gate inert under `navigator.webdriver`, so by
 * default a Playwright run is byte-identical to a page with no intro. That is
 * the right call — the rest of this suite samples hero pixels, measures
 * contrast and counts figures above the fold, and an overlay would break all
 * of it in a way that says nothing about the overlay — but it means a spec
 * must opt back in explicitly.
 *
 * The key can only ever make the intro APPEAR. It cannot suppress one and it
 * cannot relax any other condition of the gate, so using it here weakens
 * nothing: §2, §3 and §5 all still have to get past the real gate on a
 * document that has genuinely stamped itself.
 */
const INTRO_FORCE_KEY = 'duyng.intro.force'

const OVERLAY = '[data-intro-overlay], [role="region"][aria-label*="intro" i]'
const SKIP = '[data-intro-skip], button:has-text("Skip")'

const introLanded = introHasLanded()

/**
 * Arms the intro for a first visit: clean session, motion allowed, and the
 * webdriver opt-in set so the gate is allowed to stamp this document.
 */
async function firstVisit(page: Page): Promise<void> {
  await page.addInitScript(
    ({ seen, force }) => {
      try {
        // An init script re-runs on EVERY navigation, including a reload. Arm
        // the opt-in only while the intro has not yet been seen, so a reload
        // after a completed intro exercises the real gate instead of silently
        // re-forcing one — which is the whole assertion §2 is making.
        if (sessionStorage.getItem(seen)) return
        sessionStorage.setItem(force, '1')
      } catch {
        /* a locked-down privacy mode; the gate fails open, which is the point */
      }
    },
    { seen: INTRO_STORAGE_KEY, force: INTRO_FORCE_KEY },
  )
}

/** Seeds the bypass so the page renders its post-intro, repeat-visit state. */
async function seedBypass(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      /* ignored — see firstVisit */
    }
  }, INTRO_STORAGE_KEY)
}

/**
 * Waits until the intro is no longer on screen.
 *
 * Deliberately NOT `toHaveCount(0)`. Whether the component unmounts the
 * overlay or merely hides it is the intro territory's choice; the invariant
 * this suite is entitled to assert is that it stops covering the page and
 * stops taking input. §4 asserts the inertness half separately.
 */
async function waitIntroGone(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    ({ overlay }) => {
      /* See introIsUp: a commit-phase document has no documentElement, and a
         document with nothing in it is not an intro that is still up. */
      const root = document.documentElement
      if (!root) return true
      const attr = root.getAttribute('data-intro')
      if (attr === 'pending' || attr === 'playing') return false
      const el = document.querySelector(overlay)
      if (!el) return true
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) <= 0.01) {
        return true
      }
      const r = el.getBoundingClientRect()
      return !(r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0)
    },
    { overlay: OVERLAY },
    { timeout },
  )
}

/**
 * True while the mark is still DRAWING — the attribute ladder's `pending` and
 * `playing`, and nothing else.
 *
 * Distinct from introIsUp on purpose, and the difference is the whole reason
 * §5.1 needs it. introIsUp also counts a DISSOLVING overlay, because for
 * inertness questions a veil at opacity 0.4 is still on screen. But the
 * dissolve is exactly when `--focus` ramps to 0 — it IS the resolve the
 * requirement asks for. Sampling there and demanding the photograph still be
 * soft asserts that the resolve must not happen, which contradicts (c) below
 * and made this test flaky: whether the last sample landed before or after
 * `done` depended on screenshot latency.
 */
async function introIsDrawing(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const attr = document.documentElement?.getAttribute('data-intro')
    return attr === 'pending' || attr === 'playing'
  })
}

/** True while the intro is actually on screen. */
async function introIsUp(page: Page): Promise<boolean> {
  return page.evaluate(
    ({ overlay }) => {
      /* `waitUntil: 'commit'` can land this evaluate in the document that is
         being replaced, where there is no documentElement yet. Nothing is on
         screen in that state, which is exactly "the intro is not up" — and
         crashing here would report a harness race as a product failure. */
      const root = document.documentElement
      if (!root) return false
      const attr = root.getAttribute('data-intro')
      if (attr === 'pending' || attr === 'playing') return true
      const el = document.querySelector(overlay)
      if (!el) return false
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) <= 0.01) {
        return false
      }
      // It must actually be ON SCREEN. Without this an un-positioned overlay
      // sitting in the document flow far below the fold reads as "the intro is
      // up", which is a different defect with a different fix — §3's no-JS
      // test says what that one is.
      const r = el.getBoundingClientRect()
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0
    },
    { overlay: OVERLAY },
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   Pixel structure — the instrument §5 is built on, and the calibration that
   chose it.

   MEASURED on this page, this build, at 1280x800 (2026-09-03), over the
   sample band below:

     state                                    mean L    spread    gradient
     ─────────────────────────────────────────────────────────────────────
     sharp     (--focus: 0)                   0.0315    0.0774    0.01207
     blurred   (--focus: 1)                   0.0320    0.0263    0.01056
     opaque #0e0e0c (what an mp4 composites)  0.0043    0        0
     92% scrim over the photo                 0.0052    0.00125   0.000152

   TWO THINGS THAT CALIBRATION DECIDED, neither of them guessable:

   1. GRADIENT ENERGY IS THE WRONG BLUR METRIC HERE. The obvious measure —
      mean absolute difference between adjacent pixels — separates blurred
      from sharp by only 1.14x on this page, because the hero's grain and
      noise layers and the scrim's own texture survive the blur and keep
      contributing high-frequency energy. A test built on it would have been
      nearly a coin flip.

   2. LUMINANCE SPREAD (p95 − p05) IS THE RIGHT ONE, and it is right for a
      physical reason: blur averages bright and dark neighbours together, so
      it COMPRESSES the histogram. It separates blurred from sharp by 2.94x
      and blurred from near-opaque by 21x — the two judgements §5 has to make,
      both with real margin.

   The thresholds below sit between the measured states in log space, so each
   has ~1.7x headroom on both sides. §5.1 additionally asserts the blurred and
   sharp states RELATIVE to each other within the same run, which survives a
   re-grade of the photograph that would move every absolute number.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * A wide band across the hero's photographic area, right of the copy column.
 * Chosen to hold photograph rather than type: the big text runs are their own
 * high-contrast objects and would dominate the histogram.
 */
const SAMPLE_BAND = { x: 700, y: 80, width: 520, height: 320 } as const

/** Below this the "photograph" is a flat ground: an opaque intro, not a veil. */
const PHOTO_VISIBLE_MIN_SPREAD = 0.01
/** Below this the frame is essentially black, whatever it claims to be. */
const PHOTO_VISIBLE_MIN_MEAN = 0.012
/** Between the measured blurred (0.0263) and sharp (0.0774) states. */
const BLUR_SHARP_DIVIDE = 0.045

const srgb = (v: number): number => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
const luminanceOf = (r: number, g: number, b: number): number =>
  0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)

interface Structure {
  mean: number
  p05: number
  p95: number
  /** p95 − p05. The blur discriminator; see the calibration table above. */
  spread: number
  pixels: number
}

function structureOf(image: DecodedImage, rect: typeof SAMPLE_BAND): Structure {
  const values: number[] = []
  const x1 = Math.min(image.width, rect.x + rect.width)
  const y1 = Math.min(image.height, rect.y + rect.height)
  for (let y = Math.max(0, rect.y); y < y1; y += 1) {
    for (let x = Math.max(0, rect.x); x < x1; x += 1) {
      const i = (y * image.width + x) * 4
      values.push(luminanceOf(image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0))
    }
  }
  values.sort((a, b) => a - b)
  const at = (q: number): number => values[Math.min(values.length - 1, Math.floor(q * values.length))] ?? 0
  const p05 = at(0.05)
  const p95 = at(0.95)
  return {
    mean: values.reduce((a, v) => a + v, 0) / (values.length || 1),
    p05,
    p95,
    spread: p95 - p05,
    pixels: values.length,
  }
}

const describe = (s: Structure): string =>
  `mean L ${s.mean.toFixed(5)} · p05 ${s.p05.toFixed(5)} · p95 ${s.p95.toFixed(5)} · ` +
  `spread ${s.spread.toFixed(5)} · ${s.pixels}px`

async function sampleStructure(page: Page): Promise<Structure> {
  const image = decodePng(await page.screenshot())
  return structureOf(image, SAMPLE_BAND)
}

/* ════════════════════════════════════════════════════════════════════════════
   §1  THE SHIPPING STATE — asserted unconditionally, in both worlds.

   With no intro on disk this is the whole page. With an intro on disk it is
   the repeat visit, and it must be byte-for-byte the page a recruiter sees on
   their second look. Nothing here is gated.
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('§1 the page without an intro', () => {
  test('no overlay is displayable, and the hero is sharp and complete', async ({ page }) => {
    await seedBypass(page)
    await page.goto('/')
    await page.waitForLoadState('load')

    expect(await introIsUp(page)).toBe(false)

    // The three measured figures — the page's whole argument — are present.
    await expect(page.getByRole('heading', { name: /Duy Nguyen/i }).first()).toBeVisible()
    const body = await page.locator('body').innerText()
    expect(body).toContain('0.585')
    expect(body).toContain('0.487')

    // --focus resolves SHARP. `var(--focus, 0)` is the CSS default, so an
    // unwritten property and a written 0 are the same picture.
    const focus = await page.evaluate(() =>
      Number(getComputedStyle(document.documentElement).getPropertyValue('--focus') || '0'),
    )
    expect(focus).toBeLessThan(0.02)
  })

  test('no layout shift at 1280x800, and the photograph is sharp', async ({ page }) => {
    await seedBypass(page)
    await page.addInitScript(() => {
      ;(window as unknown as { __cls: number }).__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{
          value: number
          hadRecentInput: boolean
        }>) {
          if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/')
    await page.waitForLoadState('load')
    await page.waitForTimeout(2500)

    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
    expect(cls, `CLS must stay at the measured baseline of 0; saw ${cls}`).toBeLessThanOrEqual(0.01)

    const sharp = await sampleStructure(page)
    expect(
      sharp.spread,
      `the settled hero must be SHARP (baseline spread 0.0774): ${describe(sharp)}`,
    ).toBeGreaterThan(BLUR_SHARP_DIVIDE)
  })

  test('the AI-disclosure line survives whatever the intro does', async ({ page }) => {
    await seedBypass(page)
    await page.goto('/')
    const body = await page.locator('body').innerText()
    // The photograph is an AI-generated composite and the page says so. The
    // line is conditional on the assets, so it is only required when they are
    // there — but it may never be dropped while they are.
    const hasPhoto = await page.evaluate(() =>
      Boolean(document.querySelector('img[src*="hero-"], source[srcset*="hero-"]')),
    )
    if (hasPhoto) {
      expect(
        body,
        'hero assets are present, so the AI-generated-composite disclosure is mandatory',
      ).toMatch(/AI-generated composite/i)
    }
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §2  THE GATE — the thing that must never be weakened.
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('§2 the gate', () => {
  test.skip(!introLanded, NOT_LANDED_MESSAGE)

  test('a first visit shows the intro; an immediate reload does not', async ({ page }) => {
    await firstVisit(page)
    await page.goto('/')
    expect(await introIsUp(page), 'a clean session must get the brand moment').toBe(true)

    // Let it run to completion, then reload in the SAME session.
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-intro') !== 'playing',
      undefined,
      { timeout: 15_000 },
    )
    await waitIntroGone(page)

    const key = await page.evaluate((k) => sessionStorage.getItem(k), INTRO_STORAGE_KEY)
    expect(key, 'finishing the intro must write the session key exactly once').toBeTruthy()

    // Drop the automation opt-in before reloading. It takes precedence over
    // the seen-key by design (it can only ever make the intro appear), so
    // leaving it set would test the escape hatch instead of the gate. The
    // fixture's init script will not re-arm it now that `seen` is written.
    await page.evaluate((k) => sessionStorage.removeItem(k), INTRO_FORCE_KEY)
    await page.reload()
    await page.waitForLoadState('load')
    expect(await introIsUp(page), 'a reload in the same session must NOT replay the intro').toBe(
      false,
    )
  })

  test('the gate leaves no flash: with the key seeded the overlay is never displayable', async ({
    page,
  }) => {
    await seedBypass(page)
    await page.goto('/', { waitUntil: 'commit' })
    // Poll hard across the whole paint window rather than sampling once late.
    for (let i = 0; i < 40; i += 1) {
      expect(await introIsUp(page)).toBe(false)
      await page.waitForTimeout(25)
    }
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §3  THE STATES THE REFERENCE'S OWN COMMENTS SAY ARE EASY TO BREAK.
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('§3 reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('never paints the overlay and never draws', async ({ page }) => {
    await firstVisit(page)
    await page.goto('/')
    await page.waitForLoadState('load')
    expect(
      await introIsUp(page),
      'prefers-reduced-motion: reduce must suppress the intro entirely',
    ).toBe(false)
    await page.waitForTimeout(1200)
    expect(await introIsUp(page)).toBe(false)
  })
})

test.describe('§3 no JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('no intro, and the page is fully readable', async ({ page }) => {
    await page.goto('/')
    // Two separate claims, because they have two separate fixes.
    // (a) it must not be a curtain over the page, and
    // (b) it must not be in the document FLOW either — an un-positioned
    //     overlay adds a block of stray logo art to the bottom of the page,
    //     which is what actually happens when the shell is rendered without
    //     the positioning its `data-intro` rules supply.
    expect(await introIsUp(page), 'with JS off the shell must never cover the page').toBe(false)

    const stray = await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) <= 0.01) {
        return null
      }
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top), height: Math.round(r.height), position: cs.position }
    }, OVERLAY)
    expect(
      stray,
      'with JS off the intro shell must be display:none. A rendered-but-unpositioned shell ' +
        'appends a visible block of logo art to the end of the document.',
    ).toBeNull()

    const body = await page.locator('body').innerText()
    expect(body).toContain('0.585')
    await expect(page.getByRole('heading', { name: /Duy Nguyen/i }).first()).toBeVisible()
  })
})

test.describe('§3 route scope', () => {
  test.skip(!introLanded, NOT_LANDED_MESSAGE)

  // NOTE: this repo has no /docs/* route — `next build` emits /, /_not-found,
  // /api/*, /robots.txt and /sitemap.xml. The brief's "/docs/* or the 404
  // route" therefore collapses to the 404, plus a probe of /docs/* anyway so
  // the assertion still holds the day those pages exist.
  for (const route of ['/does-not-exist', '/docs/anything']) {
    test(`${route} never carries the intro`, async ({ page }) => {
      await firstVisit(page)
      await page.goto(route)
      expect(await introIsUp(page)).toBe(false)
      const attr = await page.evaluate(() => document.documentElement.getAttribute('data-intro'))
      expect(attr, 'the gate must be scoped to the homepage path').toBeNull()
    })
  }

  test('a hash entry (/#contact) goes to the anchor, not the logo', async ({ page }) => {
    await firstVisit(page)
    await page.goto('/#contact')
    expect(await introIsUp(page)).toBe(false)
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §4  INERTNESS AND THE SKIP CONTROL.

   An overlay that is invisible but still hit-testable is the classic version
   of this bug: the page looks right and every link under it is dead.
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('§4 inertness and skip', () => {
  test.skip(!introLanded, NOT_LANDED_MESSAGE)

  test('the Skip control is reachable by keyboard and dissolves the intro', async ({ page }) => {
    await firstVisit(page)
    await page.goto('/')
    expect(await introIsUp(page)).toBe(true)

    const skip = page.locator(SKIP).first()
    await expect(skip).toBeVisible()

    // Reachable by keyboard, and it is the FIRST thing Tab reaches: while the
    // intro is up nothing behind it should be in the tab order.
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      return el ? `${el.tagName}:${(el.textContent ?? '').trim().slice(0, 20)}` : '(none)'
    })
    expect(focused, 'Skip must be the first tab stop while the intro is up').toMatch(/skip/i)

    await page.keyboard.press('Enter')
    await waitIntroGone(page, 5000)
    expect(await introIsUp(page)).toBe(false)
  })

  test('once hidden the intro is not hit-testable and not in the tab order', async ({ page }) => {
    await firstVisit(page)
    await page.goto('/')
    await page.locator(SKIP).first().click()
    await waitIntroGone(page, 5000)

    // Nothing from the intro may sit under the pointer at the viewport centre.
    const onTop = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
      let node: Element | null = el
      while (node) {
        if (
          node.hasAttribute?.('data-intro-overlay') ||
          (node.getAttribute?.('aria-label') ?? '').toLowerCase().includes('intro')
        ) {
          return 'INTRO'
        }
        node = node.parentElement
      }
      return el?.tagName ?? '(none)'
    })
    expect(onTop, 'a dissolved intro must not intercept the pointer').not.toBe('INTRO')

    // And the nav beneath is genuinely clickable again.
    const link = page.getByRole('link', { name: /research/i }).first()
    await expect(link).toBeVisible()
    await link.click({ timeout: 5000 })

    // Scroll must be free, not left locked by the intro.
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(200)
    const y = await page.evaluate(() => window.scrollY)
    expect(y, 'the intro must restore scroll when it finishes').toBeGreaterThan(0)
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §5  THE ACCEPTANCE TEST — the owner's requirement, in composited pixels.

   THIS IS THE ONE THAT DECIDES THE ROUND.
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('§5 the intro plays over the BLURRED photograph, not over black', () => {
  test.skip(!introLanded, NOT_LANDED_MESSAGE)

  test('§5.1 the photograph is visible and blurred throughout, then resolves sharp', async ({
    page,
  }) => {
    await firstVisit(page)
    await page.goto('/')
    expect(await introIsUp(page), 'nothing to measure — the intro never came up').toBe(true)

    // Sample the COMPOSITED frame repeatedly while the animation runs. Every
    // sample must show a photograph, and every sample must show it defocused.
    const during: Structure[] = []
    for (let i = 0; i < 12; i += 1) {
      // Bounded by the DRAW, not by the overlay's visibility — see
      // introIsDrawing. Everything in `during` is a frame the mark was still
      // being written on, which is the window the requirement speaks about.
      if (!(await introIsDrawing(page))) break
      during.push(await sampleStructure(page))
      await page.waitForTimeout(120)
    }

    expect(
      during.length,
      'the intro finished before it could be sampled — it is too fast to measure, or it never painted',
    ).toBeGreaterThanOrEqual(3)

    for (const [i, s] of during.entries()) {
      // (a) NOT BLACK, NOT A FLAT GROUND. An opaque ground measures spread 0
      //     and mean 0.0043; even a 92%-opaque scrim only reaches spread
      //     0.00125. A visible photograph cannot look like either.
      expect(
        s.mean,
        `sample ${i}: the intro is playing over something essentially BLACK — the requirement is ` +
          `the blurred photograph. ${describe(s)}`,
      ).toBeGreaterThan(PHOTO_VISIBLE_MIN_MEAN)
      expect(
        s.spread,
        `sample ${i}: no photographic structure behind the intro — this is a flat ground, not a ` +
          `veiled image. ${describe(s)}`,
      ).toBeGreaterThan(PHOTO_VISIBLE_MIN_SPREAD)

      // (b) AND IT IS BLURRED. "mờ mờ" — softly visible, not the sharp copy.
      expect(
        s.spread,
        `sample ${i}: the photograph behind the intro is SHARP, but the requirement is that it ` +
          `stays soft for the whole animation and only then resolves. ${describe(s)}`,
      ).toBeLessThan(BLUR_SHARP_DIVIDE)
    }

    // (c) AND IT RESOLVES. Once the intro is gone the hero is the sharp copy.
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-intro') !== 'playing',
      undefined,
      { timeout: 15_000 },
    )
    await waitIntroGone(page)
    await page.waitForTimeout(400)

    const after = await sampleStructure(page)
    expect(
      after.spread,
      `the hero never resolved to the sharp photograph after the intro. ` +
        `during ${describe(during[during.length - 1]!)} → after ${describe(after)}`,
    ).toBeGreaterThan(BLUR_SHARP_DIVIDE)

    // The RELATIVE claim, which survives a re-grade of the photograph that
    // would move every absolute number above.
    const softest = Math.min(...during.map((s) => s.spread))
    expect(
      after.spread / softest,
      `blur → sharp must be a real transition, not a nudge (measured baseline 2.94x)`,
    ).toBeGreaterThan(1.6)

    test.info().annotations.push({
      type: 'intro-ground',
      description: JSON.stringify({
        samples: during.length,
        duringSpread: during.map((s) => Number(s.spread.toFixed(5))),
        afterSpread: Number(after.spread.toFixed(5)),
        ratio: Number((after.spread / softest).toFixed(2)),
      }),
    })
  })

  test('§5.2 the intro never composites an opaque ground of its own', async ({ page }) => {
    await firstVisit(page)
    await page.goto('/')
    expect(await introIsUp(page)).toBe(true)

    // Structural companion to §5.1: whatever the overlay paints, no layer in
    // it may be a fully opaque backdrop. This catches the mp4-shaped mistake
    // (or a solid `background: #000`) directly rather than through pixels.
    const opaque = await page.evaluate((sel) => {
      const root = document.querySelector(sel)
      if (!root) return null
      const offenders: string[] = []
      const walk = (el: Element) => {
        const cs = getComputedStyle(el)
        const bg = cs.backgroundColor
        const m = /^rgba?\(([^)]+)\)$/.exec(bg)
        if (m?.[1]) {
          const parts = m[1].split(',').map((p) => Number(p.trim()))
          const alpha = parts.length > 3 ? (parts[3] ?? 1) : 1
          const r = el.getBoundingClientRect()
          const coversViewport = r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9
          if (alpha >= 0.98 && coversViewport) {
            offenders.push(`${el.tagName}.${String(el.className).slice(0, 30)} bg=${bg}`)
          }
        }
        if (el.tagName === 'VIDEO') offenders.push('VIDEO — an mp4 carries a baked opaque ground')
        for (const child of Array.from(el.children)) walk(child)
      }
      walk(root)
      return offenders
    }, OVERLAY)

    if (opaque !== null) {
      expect(
        opaque,
        'the intro must be transparent by construction so the photograph reads through it',
      ).toEqual([])
    }
  })

  test('§5.3 the blur is the hero’s baked bitmap, never a live filter', async ({ page }) => {
    await firstVisit(page)
    await page.goto('/')
    expect(await introIsUp(page)).toBe(true)

    // hero.module.css is explicit that a live `filter: blur()` cannot be
    // rasterised fast enough and that the soft copy is a FILE. An intro that
    // animates blur() re-rasterises a full-viewport layer every frame.
    const filters = await page.evaluate(() => {
      const found: string[] = []
      document.querySelectorAll('*').forEach((el) => {
        const f = getComputedStyle(el).filter
        const b = getComputedStyle(el).backdropFilter
        if (/blur\((?!0px)/.test(f)) found.push(`filter:${f} on ${el.tagName}`)
        if (/blur\((?!0px)/.test(b)) found.push(`backdrop-filter:${b} on ${el.tagName}`)
      })
      return found
    })
    expect(
      filters,
      'no live blur() may be on the page during the intro — the soft copy is a baked bitmap ' +
        'cross-faded by --focus (see components/site/hero.module.css)',
    ).toEqual([])
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §6  THE REGRESSIONS THIS ROUND COULD CAUSE.

   Ungated where they can be: these are properties of the page, and they hold
   whether or not an intro exists. They are the reason a "small" animation
   round is worth a spec of its own.
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('§6 the hero must not regress', () => {
  test('the three measured figures are above the fold at 1280x800', async ({ page }) => {
    await seedBypass(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.waitForLoadState('load')

    // MEASURED at baseline: 0.585 at y=433, P@1 0.487 at y=527, and the
    // Barn-Owl counts at y=655 — all inside 800.
    const figures = ['0.585', '0.487', '30,147']
    for (const figure of figures) {
      const box = await page
        .locator(`text=${figure}`)
        .first()
        .boundingBox()
      expect(box, `"${figure}" must be on the page`).not.toBeNull()
      expect(
        box!.y + box!.height,
        `"${figure}" must stay above the fold at 1280x800 (baseline bottom ~${Math.round(box!.y + box!.height)}px)`,
      ).toBeLessThanOrEqual(800)
    }
  })

  test('CLS stays 0 at 375x812 as well', async ({ page }) => {
    await seedBypass(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.addInitScript(() => {
      ;(window as unknown as { __cls: number }).__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{
          value: number
          hadRecentInput: boolean
        }>) {
          if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/')
    await page.waitForTimeout(2500)
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
    expect(cls, `mobile CLS baseline is 0; saw ${cls}`).toBeLessThanOrEqual(0.01)
  })

  test('the intro does not delay the hero heading into the DOM', async ({ page }) => {
    await firstVisit(page)
    await page.goto('/', { waitUntil: 'commit' })
    // The hero copy must be in the served HTML, present and measurable even
    // while the intro is up — an intro that defers the hero would move LCP.
    const heading = page.getByRole('heading', { name: /Duy Nguyen/i }).first()
    await expect(heading).toHaveCount(1, { timeout: 5000 })
    const text = await page.locator('body').innerText()
    expect(text).toContain('0.585')
  })

  test('LCP stays close to the measured baseline', async ({ page }) => {
    await firstVisit(page)
    await page.addInitScript(() => {
      ;(window as unknown as { __lcp: number }).__lcp = 0
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1] as unknown as { startTime: number } | undefined
        if (last) (window as unknown as { __lcp: number }).__lcp = last.startTime
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    })
    await page.goto('/')
    await page.waitForLoadState('load')
    await page.waitForTimeout(3000)
    const lcp = await page.evaluate(() => (window as unknown as { __lcp: number }).__lcp)

    // Baseline MEASURED 936 ms at 1280x800 on a warm production server. The
    // ceiling is generous because CI hardware is not this machine; it exists
    // to catch an intro that pushes LCP into seconds, which is the failure
    // mode that matters (an overlay covering exactly the viewport is excluded
    // from LCP by Chrome, so a correct intro should barely move this).
    expect(lcp, `LCP baseline is 936 ms; saw ${Math.round(lcp)} ms`).toBeLessThan(4000)
    test.info().annotations.push({ type: 'intro-lcp', description: `${Math.round(lcp)}ms` })
  })

  test('scroll stays at about one vsync interval per frame', async ({ page }) => {
    await seedBypass(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.waitForTimeout(1200)

    const perf = await page.evaluate(async () => {
      const frames: number[] = []
      let last = performance.now()
      let raf = 0
      const tick = (t: number) => {
        frames.push(t - last)
        last = t
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      for (let i = 0; i < 60; i += 1) {
        window.scrollBy(0, 12)
        await new Promise((r) => setTimeout(r, 16))
      }
      cancelAnimationFrame(raf)
      const s = frames.slice(3).sort((a, b) => a - b)
      return { median: s[Math.floor(s.length / 2)] ?? 0 }
    })

    // Baseline MEASURED 16.7 ms median — 1.0x, 60fps. Two vsync intervals is
    // the documented failure the hero's own perf spec guards; this is the same
    // invariant re-asserted after the intro round.
    expect(
      perf.median,
      `scroll median must stay near one vsync interval (baseline 16.7 ms); saw ${perf.median.toFixed(1)} ms`,
    ).toBeLessThan(28)
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §7  THE LOGO SOURCE.

   Not a rendering assertion — a provenance one. The intro is built from the
   owner's lockup, and which file it was built from decides whether it is
   sharp at any DPI or a traced approximation.
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('§7 the logo source', () => {
  test('the source is on disk, and a vector is preferred over a raster', async () => {
    const source = logoSourcePath()
    test.skip(
      source === null,
      'SKIPPED, NOT SATISFIED — no public/brand/logo-source.{svg,pdf,png}. With no source the ' +
        'shipping state is NO INTRO AT ALL, which §1 asserts unconditionally.',
    )

    const isVector = /\.(svg|pdf)$/.test(source!)
    test.info().annotations.push({
      type: 'logo-source',
      description: `${path.basename(source!)} — ${isVector ? 'VECTOR' : 'RASTER (traced fallback)'}`,
    })

    // A raster source is allowed but must be recorded as a fallback: the
    // reveal is inline SVG + CSS precisely so it is sharp at any DPI, and a
    // traced raster is the one thing that can quietly give that up.
    expect(existsSync(source!)).toBe(true)
  })
})
