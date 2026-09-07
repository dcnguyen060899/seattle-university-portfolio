import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Browser, BrowserContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  HERO_DIR,
  HERO_MOTION_DIR,
  HERO_MOTION_URL_PREFIX,
  MOTION_NOT_LANDED_MESSAGE,
  heroMotionCandidatePath,
  heroMotionHasLanded,
  heroMotionManifest,
  heroPhotoHasLanded,
  NOT_LANDED_MESSAGE,
} from './helpers/hero-assets'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HERO'S LIVING BACKGROUND — the layer, the gate, the loop, the fallback,
 * and the two things it must never do: mount where it is refused, and become
 * the page's largest contentful paint.
 *
 * ── THE CONTRACT CHANGED ON 2026-09-07: IT STARTS ON ITS OWN ──────────────
 *
 * The layer used to wait for the first scroll, pointerdown or keydown, because
 * Chrome finalises LCP there. It no longer does: a paint that covers the WHOLE
 * viewport is not an LCP candidate at all, the installed clip is registered to
 * the whole still and therefore covers it, and the controller checks that
 * coverage at runtime before it starts itself (lib/hero-motion.ts's header
 * carries the measurements). So the tests below assert the rule in three
 * pieces: it DOES mount with no input whatever; nothing mounts early on a page
 * with no intro running; and no <video> is ever recorded as a
 * largest-contentful-paint candidate on that no-input path. The first input
 * survives as an accelerator, and as the only way in for a clip whose box
 * cannot cover the viewport.
 *
 * ── AND AGAIN LATER THE SAME DAY: THE ENTRANCE, AND A CLIP THAT MAY NOT WRAP
 *
 * Three more contracts, each with its own test below:
 *
 *   THE EARLY DOOR. While the intro is actually PLAYING the layer mounts
 *   behind it, and its fade — MOTION_FADE_BEHIND_MS, not MOTION_FADE_IN_MS —
 *   finishes before the overlay leaves, so the intro's own `--focus` resolve
 *   reveals a picture that is already moving. The old "nothing mounts while
 *   html[data-intro] is set" assertion is GONE, deliberately: it was the
 *   defect the owner reported. What replaces it is "nothing mounts early on a
 *   page whose intro never ran", which is the late door and is still true.
 *
 *   PLAY ONCE AND HOLD. `loop: false` in the config — one <video>, the
 *   element's own `loop` attribute OFF, no standby copy, and an `ended` clip
 *   that stays ended across a tab flip rather than restarting from its first
 *   frame.
 *
 *   THE FEATHER IS CONDITIONAL. The 32 px edge mask is emitted only for a crop
 *   that is a real sub-rectangle of the still; a whole-frame registration gets
 *   no mask at all.
 *
 * ── TWO HALVES, GATED DIFFERENTLY ─────────────────────────────────────────
 *
 * §1 NEVER MOUNTS is UNCONDITIONAL. It needs no clip: a config is injected
 * that points at a URL routed to 404, and if the gate ever passed where it
 * must refuse — the phone, reduced motion, plain automation, the owner's off
 * switch, Save-Data — a <video> would appear and a request would go out. Those
 * are the refusals the shipping build makes for every reader it does not
 * animate for (the switch has been on by default since 2026-09-06); the
 * still-only page — no clip, or a build with the switch `off`, the shipping
 * state until then — is a subset of them, refused by the same gate one line
 * earlier.
 *
 * §2 THE MOUNT PATH needs a decodable clip and SKIPS LOUDLY without one. It
 * arms on an INSTALLED clip (public/brand/hero/motion/manifest.json
 * present:true) or on HERO_MOTION_CLIP, an absolute path the spec serves from
 * memory with Range support, so the controller is exercised against a real
 * candidate without any clip in the repository — the state the repo was in
 * until the Seedance 2 transcode passed scripts/check-hero-motion.mjs and was
 * installed (2026-09-06), and the way the next candidate is tried.
 *
 * ── HOW THE LAYER IS REACHED UNDER AUTOMATION ─────────────────────────────
 *
 * lib/hero-motion.ts: under `navigator.webdriver` the layer is inert unless
 * sessionStorage carries the force key, and only then may a sessionStorage
 * override stand in for the manifest. Both are set by an init script, so
 * every OTHER spec in this suite runs against a page with no motion at all —
 * the same shape as the intro's opt-in, for the same reason.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* Mirrors of lib/hero-motion.ts. Typed here rather than imported so this spec
   does not pull app code through Playwright's transpiler; the drift guard in
   §0 reads the source and fails if any of them stops appearing there. */
const MOTION_FORCE_KEY = 'duyng.motion.force'
const MOTION_OFF_KEY = 'duyng.motion.off'
const MOTION_OVERRIDE_KEY = 'duyng.motion.override'
const MOTION_CROSS_S = 1.5
const MOTION_FADE_IN_MS = 3000
const MOTION_FADE_BEHIND_MS = 1500
const MOTION_SETTLE_MS = 1500
const MOTION_LCP_QUIET_MS = 1200

const INTRO_FORCE_KEY = 'duyng.intro.force'
const INTRO_SEEN_KEY = 'duyng.intro.seen'

const LIB_PATH = path.join(process.cwd(), 'lib', 'hero-motion.ts')
const ROOT_SELECTOR = '#top [data-hero-motion]'
const VIDEO_SELECTOR = '#top video'

const photoLanded = heroPhotoHasLanded()
const installed = heroMotionHasLanded()
const candidate = heroMotionCandidatePath()
const armed = photoLanded && (installed || candidate !== null)

interface MotionConfig {
  src: string
  type: string
  poster: string
  durationS: number
  crop: { x: number; y: number; w: number; h: number }
  /** Absent → a loop, exactly as `parseHeroMotion` defaults it. */
  loop?: boolean
  stillAspect: number
  opacityCap: number
}

/* ── the still's numbers, read from its manifest rather than typed ──────── */

interface HeroManifest {
  present: boolean
  orientations?: { l?: { intrinsic?: { width: number; height: number }; soft?: { publicPath?: string } } }
}

function heroManifest(): HeroManifest | null {
  try {
    return JSON.parse(readFileSync(path.join(HERO_DIR, 'manifest.json'), 'utf8')) as HeroManifest
  } catch {
    return null
  }
}

/** mvhd duration and tkhd size, enough to describe a candidate to the layer. No decode. */
function probeMp4(b: Buffer): { width: number; height: number; durationS: number } | null {
  let width = 0
  let height = 0
  let durationS = 0
  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl'])
  const walk = (off: number, end: number): void => {
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
      if (type === 'mvhd') {
        const v = b[off + hdr] ?? 0
        const ts = v ? b.readUInt32BE(off + hdr + 20) : b.readUInt32BE(off + hdr + 12)
        const dur = v ? Number(b.readBigUInt64BE(off + hdr + 24)) : b.readUInt32BE(off + hdr + 16)
        if (ts > 0) durationS = dur / ts
      }
      if (type === 'tkhd' && width === 0) {
        const w = b.readUInt32BE(off + size - 8) / 65536
        const h = b.readUInt32BE(off + size - 4) / 65536
        if (w > 0 && h > 0) {
          width = w
          height = h
        }
      }
      if (containers.has(type)) walk(off + hdr, off + size)
      off += size
    }
  }
  walk(0, b.length)
  return width > 0 && durationS > 0 ? { width, height, durationS } : null
}

/**
 * The clip the mount path plays, and the config that describes it to the
 * layer: the installed clip and its manifest when one has landed, else the
 * candidate served from memory and registered as the still's centre crop.
 */
function loadClip(): { bytes: Buffer | null; config: MotionConfig; served: boolean } | null {
  const hero = heroManifest()
  const l = hero?.orientations?.l
  if (!l?.intrinsic || !l.soft?.publicPath) return null
  const stillAspect = l.intrinsic.width / l.intrinsic.height

  if (installed) {
    const m = heroMotionManifest()
    if (!m || typeof m.file !== 'string' || !m.crop || typeof m.durationS !== 'number') return null
    return {
      bytes: null,
      served: false,
      config: {
        src: `${HERO_MOTION_URL_PREFIX}${m.file}`,
        type: m.file.endsWith('.webm') ? 'video/webm' : 'video/mp4',
        poster: l.soft.publicPath,
        durationS: m.durationS,
        crop: m.crop,
        stillAspect,
        opacityCap: typeof m.opacityCap === 'number' ? m.opacityCap : 1,
      },
    }
  }
  if (candidate === null) return null
  const bytes = readFileSync(candidate)
  const probe = probeMp4(bytes)
  if (!probe) return null
  /* The candidate is a same-width crop of the 3:2 still, centred: the harness
     finds the same row (66 of 853 for a 1280x720 clip). */
  const h = Math.min(1, probe.height / probe.width / (1 / stillAspect))
  const crop = { x: 0, y: (1 - h) / 2, w: 1, h }
  return {
    bytes,
    served: true,
    config: {
      src: `${HERO_MOTION_URL_PREFIX}hero-loop-e2e00000.mp4`,
      type: 'video/mp4',
      poster: l.soft.publicPath,
      durationS: probe.durationS,
      crop,
      stillAspect,
      opacityCap: 1,
    },
  }
}

/** A config for the refusal tests: shaped like a real one, pointing at nothing. */
function phantomConfig(): MotionConfig {
  const hero = heroManifest()
  const l = hero?.orientations?.l
  return {
    src: `${HERO_MOTION_URL_PREFIX}hero-loop-00000000.mp4`,
    type: 'video/mp4',
    poster: l?.soft?.publicPath ?? '',
    durationS: 10,
    crop: { x: 0, y: 0.078, w: 1, h: 0.844 },
    stillAspect: l?.intrinsic ? l.intrinsic.width / l.intrinsic.height : 1.5,
    opacityCap: 1,
  }
}

/* ── arming ─────────────────────────────────────────────────────────────── */

interface ArmOptions {
  force?: boolean
  off?: boolean
  intro?: boolean
  saveData?: boolean
  refusePlay?: boolean
  /** Arm with the force key and NO override, so the config can only be the server's. */
  noOverride?: boolean
}

async function arm(page: Page, config: MotionConfig, opts: ArmOptions = {}): Promise<void> {
  await page.addInitScript(
    ({ config, opts, keys }) => {
      try {
        if (opts.force !== false) sessionStorage.setItem(keys.force, '1')
        if (opts.noOverride) sessionStorage.removeItem(keys.override)
        else sessionStorage.setItem(keys.override, JSON.stringify(config))
        if (opts.off) sessionStorage.setItem(keys.off, '1')
        if (opts.intro) {
          sessionStorage.removeItem(keys.introSeen)
          sessionStorage.setItem(keys.introForce, '1')
        }
      } catch {
        /* a locked-down storage: the gate fails closed, which the assertions then see */
      }
      if (opts.saveData) {
        Object.defineProperty(navigator, 'connection', {
          configurable: true,
          value: { saveData: true, effectiveType: '4g' },
        })
      }
      if (opts.refusePlay) {
        HTMLMediaElement.prototype.play = () =>
          Promise.reject(new DOMException('play() refused by the test', 'NotAllowedError'))
      }
    },
    {
      config,
      opts,
      keys: {
        force: MOTION_FORCE_KEY,
        override: MOTION_OVERRIDE_KEY,
        off: MOTION_OFF_KEY,
        introForce: INTRO_FORCE_KEY,
        introSeen: INTRO_SEEN_KEY,
      },
    },
  )
}

/** Serves `bytes` at every motion URL with Range (206) support, the way `next start` does. */
async function serve(page: Page, bytes: Buffer | null): Promise<string[]> {
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes(HERO_MOTION_URL_PREFIX)) requests.push(request.url())
  })
  await page.route(`**${HERO_MOTION_URL_PREFIX}**`, async (route) => {
    if (bytes === null) {
      await route.fulfill({ status: 404, body: 'no clip' })
      return
    }
    const range = route.request().headers()['range']
    const m = range ? /bytes=(\d+)-(\d*)/.exec(range) : null
    if (m) {
      const a = Number(m[1])
      const b = m[2] ? Number(m[2]) : bytes.length - 1
      await route.fulfill({
        status: 206,
        body: bytes.subarray(a, b + 1),
        headers: {
          'content-type': 'video/mp4',
          'accept-ranges': 'bytes',
          'content-range': `bytes ${a}-${b}/${bytes.length}`,
          'content-length': String(b - a + 1),
        },
      })
      return
    }
    await route.fulfill({
      status: 200,
      body: bytes,
      headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': String(bytes.length) },
    })
  })
  return requests
}

/** The first input the gate waits for, without moving the page. */
async function firstInput(page: Page): Promise<void> {
  await page.keyboard.press('Shift')
}

async function introGone(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'), undefined, {
    timeout: 15_000,
  })
}

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function videoCount(page: Page): Promise<number> {
  return page.evaluate((selector) => document.querySelectorAll(selector).length, VIDEO_SELECTOR)
}

/* ══════════════════════════════════════════════════════════════════════════
   §0 — the spec's mirrors of the module have not drifted
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('hero motion: the contract this spec mirrors', () => {
  test('lib/hero-motion.ts still declares every constant this spec relies on', () => {
    const src = readFileSync(LIB_PATH, 'utf8')
    const wanted = [
      `'${MOTION_FORCE_KEY}'`,
      `'${MOTION_OFF_KEY}'`,
      `'${MOTION_OVERRIDE_KEY}'`,
      `MOTION_CROSS_S = ${MOTION_CROSS_S.toFixed(1)}`,
      `MOTION_FADE_IN_MS = ${MOTION_FADE_IN_MS}`,
      `MOTION_FADE_BEHIND_MS = ${MOTION_FADE_BEHIND_MS}`,
      `MOTION_SETTLE_MS = ${MOTION_SETTLE_MS}`,
      `MOTION_LCP_QUIET_MS = ${MOTION_LCP_QUIET_MS}`,
      /* the three functions the contracts below are written against */
      'export function motionFadeMsForFocus',
      'export function motionNeedsFeather',
      'loop: boolean',
      'navigator.webdriver',
    ]
    const missing = wanted.filter((w) => !src.includes(w))
    expect(
      missing,
      `lib/hero-motion.ts no longer contains: ${missing.join(', ')}. This spec mirrors those values; ` +
        'update both in one commit.',
    ).toEqual([])
    /* `navigator.webdriver` is the controller's refusal, not the module's. */
    const controller = readFileSync(path.join(process.cwd(), 'components', 'site', 'hero-motion.tsx'), 'utf8')
    expect(controller.includes('navigator.webdriver'), 'the controller no longer refuses plain automation').toBe(true)
  })

  test('the built page ships no <video> and no motion markup', async ({ request }) => {
    const html = await (await request.get('/')).text()
    const start = html.indexOf('id="top"')
    expect(start, 'the hero band (#top) is not in the served HTML').toBeGreaterThan(-1)
    const band = html.slice(start, html.indexOf('</section>', html.lastIndexOf('</section>', start + 60_000)))
    expect(
      /<video[\s>]/i.test(band) || /data-hero-motion/.test(band),
      'The server-rendered hero carries a <video> or the motion root. The layer must render nothing on the ' +
        'server and nothing before its gate passes, so every structural gate that reads the built HTML sees ' +
        'an unchanged tree.',
    ).toBe(false)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   §1 — never mounts (unconditional)
   ══════════════════════════════════════════════════════════════════════════ */

interface Refusal {
  name: string
  viewport: { width: number; height: number }
  context?: Parameters<Browser['newContext']>[0]
  arm: ArmOptions
  why: string
}

const REFUSALS: Refusal[] = [
  {
    name: 'on the phone (375x812), even when forced',
    viewport: { width: 375, height: 812 },
    arm: { force: true },
    why: 'the media query (min-width: 1280px) and (pointer: fine) refuses the phone regardless of any key',
  },
  {
    name: 'under prefers-reduced-motion at 1280x800, even when forced',
    viewport: { width: 1280, height: 800 },
    context: { reducedMotion: 'reduce' },
    arm: { force: true },
    why: 'the media query carries (prefers-reduced-motion: no-preference); the CSS display:none stands as well',
  },
  {
    name: 'under plain automation at 1280x800 without the force key',
    viewport: { width: 1280, height: 800 },
    arm: { force: false },
    why: 'navigator.webdriver refuses unless the force key is set — every other spec in this suite runs here',
  },
  {
    name: "with the owner's off switch at 1280x800",
    viewport: { width: 1280, height: 800 },
    arm: { force: true, off: true },
    why: 'sessionStorage duyng.motion.off = 1 keeps the still, for comparing by eye',
  },
  {
    name: 'with Save-Data at 1280x800',
    viewport: { width: 1280, height: 800 },
    arm: { force: true, saveData: true },
    why: 'navigator.connection.saveData refuses the fetch before it starts',
  },
]

test.describe('hero motion: never mounts', () => {
  for (const refusal of REFUSALS) {
    test(`no <video> and no clip request ${refusal.name}`, async ({ browser }, testInfo) => {
      testInfo.setTimeout(60_000)
      const context: BrowserContext = await browser.newContext({ viewport: refusal.viewport, ...refusal.context })
      const page = await context.newPage()
      try {
        await arm(page, phantomConfig(), refusal.arm)
        const requests = await serve(page, null)
        await page.goto('/', { waitUntil: 'load' })
        await introGone(page)
        /* Past every timed step of the gate, and past the first input. */
        await settle(MOTION_SETTLE_MS + 1500)
        await firstInput(page)
        await page.mouse.wheel(0, 4)
        await settle(1500)

        expect(
          await videoCount(page),
          `A <video> mounted in the hero ${refusal.name}. Refusal: ${refusal.why}.`,
        ).toBe(0)
        expect(
          requests,
          `The page requested a motion clip ${refusal.name}:\n  ${requests.join('\n  ')}\nRefusal: ${refusal.why}.`,
        ).toEqual([])
      } finally {
        await context.close()
      }
    })
  }

  test('does not mount before the page has settled, with no input at all', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(60_000)
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await arm(page, phantomConfig(), { force: true })
      const requests = await serve(page, null)
      await page.goto('/', { waitUntil: 'load' })
      await introGone(page)
      /* NO INTRO RUNS HERE — the intro's own gate is inert under webdriver and
         this test does not force it — so the early door is shut and the LATE
         one applies: MOTION_SETTLE_MS, an idle callback, the sharp <img>'s
         decode and MOTION_LCP_QUIET_MS of quiet. Half a settle in, with no
         scroll, pointer or key, none of that can have happened yet. */
      await settle(Math.round(MOTION_SETTLE_MS / 2))
      expect(
        await videoCount(page),
        'The layer mounted before MOTION_SETTLE_MS had elapsed on a page with no intro running. The early ' +
          'door needs html[data-intro] to reach "playing"; with no overlay there is nothing to arrive behind, ' +
          "and the settle covers the intro's own --focus tail on every path that still uses it.",
      ).toBe(0)
      expect(requests, 'a clip was requested before the settle had elapsed').toEqual([])
    } finally {
      await context.close()
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   §2 — the mount path (armed on the installed clip since 2026-09-06; skips loudly without one)
   ══════════════════════════════════════════════════════════════════════════ */

const clip = armed ? loadClip() : null

/**
 * Boots a 1280x800 page with the clip armed and leaves it to start ITSELF —
 * no scroll, no pointer, no key. `input: true` presses one instead, which is
 * the accelerator path; nothing here waits for input any more.
 */
async function mountLayer(
  browser: Browser,
  opts: ArmOptions & { input?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page; requests: string[] }> {
  if (clip === null) throw new Error('mountLayer called without a clip')
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await arm(page, clip.config, { force: true, ...opts })
  const requests = clip.served ? await serve(page, clip.bytes) : []
  await page.goto('/', { waitUntil: 'load' })
  await introGone(page)
  if (opts.input === true) {
    await settle(MOTION_SETTLE_MS + 500)
    await firstInput(page)
  }
  return { context, page, requests }
}

/** Every request the page makes for a clip, whether it is served from memory or from disk. */
function watchClipRequests(page: Page): string[] {
  const seen: string[] = []
  page.on('request', (request) => {
    if (request.url().includes(HERO_MOTION_URL_PREFIX)) seen.push(request.url())
  })
  return seen
}

async function waitForFirstFrame(page: Page): Promise<void> {
  await page.waitForSelector(`${ROOT_SELECTOR}[data-on]`, { state: 'attached', timeout: 30_000 })
}

test.describe('hero motion: the mount path', () => {
  test.skip(!photoLanded, NOT_LANDED_MESSAGE)
  test.skip(!armed || clip === null, MOTION_NOT_LANDED_MESSAGE)

  test('mounts BEHIND the intro and is at its cap before the overlay leaves; two muted, looping, inline copies', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await arm(page, clip.config, { force: true, intro: true })
      if (clip.served) await serve(page, clip.bytes)
      await page.goto('/', { waitUntil: 'commit' })

      /* THE EARLY DOOR. The overlay is up; the layer mounts under it and is
         asked to be at its opacity cap before it leaves, so what the intro's
         `--focus` resolve reveals is a picture that is ALREADY moving. This is
         the assertion that replaced "nothing mounts while html[data-intro] is
         set" — the wait that made the owner see the page arrive, and then,
         seconds later, something start. */
      await page.waitForSelector(ROOT_SELECTOR, { state: 'attached', timeout: 20_000 })
      const behind = await page.evaluate((selector) => ({
        intro: document.documentElement.getAttribute('data-intro'),
        focus: getComputedStyle(document.documentElement).getPropertyValue('--focus').trim(),
        mounted: document.querySelector(selector) !== null,
      }), ROOT_SELECTOR)
      expect(
        behind.intro,
        'the layer mounted only after the intro had gone. The early door is meant to let it in while ' +
          'html[data-intro] is still "playing", so the overlay hides the arrival and the reveal IS the entrance.',
      ).not.toBeNull()
      expect(
        Number(behind.focus),
        'the picture was already sharp when the layer mounted — the whole licence for arriving early is that ' +
          'the intro is still holding it soft, where the step from still to clip measures 1.62 sRGB levels.',
      ).toBeGreaterThan(0)
      expect(behind.mounted, 'the motion root vanished between the wait and the read').toBe(true)

      await waitForFirstFrame(page)
      const fade = await page.evaluate((selector) => {
        const root = document.querySelector<HTMLElement>(selector)
        return root === null ? '' : getComputedStyle(root).transitionDuration
      }, ROOT_SELECTOR)
      expect(
        fade,
        `the fade behind the intro is ${fade}, not the ${MOTION_FADE_BEHIND_MS} ms the module measured for a ` +
          'picture held soft at INTRO_FOCUS_HOLD. motionFadeMsForFocus chose the wrong one.',
      ).toBe(`${MOTION_FADE_BEHIND_MS / 1000}s`)

      /* The fade must be OVER before the overlay is. */
      await settle(MOTION_FADE_BEHIND_MS + 200)
      const atReveal = await page.evaluate((selector) => {
        const root = document.querySelector<HTMLElement>(selector)
        return {
          opacity: root === null ? -1 : Number(getComputedStyle(root).opacity),
          intro: document.documentElement.getAttribute('data-intro'),
        }
      }, ROOT_SELECTOR)
      expect(
        atReveal.opacity,
        'the layer had not reached its opacity cap one fade after its first frame',
      ).toBeCloseTo(clip.config.opacityCap, 1)

      await introGone(page)

      const shape = await page.evaluate((selector) => {
        const root = document.querySelector<HTMLElement>(selector)
        if (root === null) return null
        const videos = Array.from(root.querySelectorAll('video'))
        const sharp = document.querySelectorAll('#top img')[1] ?? null
        const bg = root.parentElement
        return {
          videos: videos.map((v) => ({
            muted: v.muted,
            loop: v.loop,
            playsInline: v.hasAttribute('playsinline'),
            pip: v.hasAttribute('disablepictureinpicture'),
            tabIndex: v.tabIndex,
            sources: Array.from(v.querySelectorAll('source')).map((s) => s.getAttribute('src') ?? ''),
          })),
          roles: Array.from(root.querySelectorAll('[data-role]')).map((el) => el.getAttribute('data-role')),
          hasStyle: root.querySelector('style') !== null,
          insideBg: bg !== null && sharp !== null && bg.contains(sharp),
          afterSharp: sharp !== null && Boolean(root.compareDocumentPosition(sharp) & Node.DOCUMENT_POSITION_PRECEDING),
          px: root.style.getPropertyValue('--m-px'),
          py: root.style.getPropertyValue('--m-py'),
          objectPosition: sharp === null ? '' : getComputedStyle(sharp).objectPosition,
          ariaHiddenAncestor: root.closest('[aria-hidden="true"]') !== null,
        }
      }, ROOT_SELECTOR)

      expect(shape, 'the motion root disappeared after its first frame').not.toBeNull()
      if (shape === null) return
      expect(shape.videos, 'the loop is two stacked copies, no more, no fewer').toHaveLength(2)
      for (const v of shape.videos) {
        expect(v.muted, 'a copy is not muted — autoplay policy would refuse it and it must never make a sound').toBe(true)
        expect(v.loop, 'a copy has no `loop` — the missed-handoff fallback (one hard cut beats a frozen frame)').toBe(true)
        expect(v.playsInline, 'a copy is not playsinline — iOS would go full-screen').toBe(true)
        expect(v.pip, 'a copy allows picture-in-picture').toBe(true)
        expect(v.tabIndex, 'a copy is focusable').toBe(-1)
        expect(v.sources, 'a copy names a source outside the motion directory').toEqual([clip.config.src])
      }
      expect(shape.roles, 'one active and one standby copy').toEqual(['active', 'standby'])
      expect(shape.hasStyle, 'the layer carries its own <style> (no CSS module ships for a feature that is off)').toBe(true)
      expect(shape.insideBg, 'the layer is not inside the promoted .bg beside the sharp copy').toBe(true)
      expect(shape.afterSharp, 'the layer must come AFTER the sharp layer so it composites above it').toBe(true)
      expect(shape.ariaHiddenAncestor, 'the layer is not under the aria-hidden picture wrapper').toBe(true)

      /* --m-px/--m-py are the sharp <img>'s computed object-position, read, never retyped. */
      const m = /^([0-9.]+)% ([0-9.]+)%$/.exec(shape.objectPosition)
      expect(m, `the sharp <img> has an object-position this spec cannot parse: ${shape.objectPosition}`).not.toBeNull()
      if (m) {
        expect(Number(shape.px)).toBeCloseTo(Number(m[1]) / 100, 3)
        expect(Number(shape.py)).toBeCloseTo(Number(m[2]) / 100, 3)
      }
    } finally {
      await context.close()
    }
  })

  test('over a SHARP picture the fade is the long one, and it reaches the opacity cap', async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    /* No intro on this path: the layer arrives over a picture that is already
       sharp and settled, where the measured step is 3.34 sRGB levels of mean
       and 21.3 of p99 — the case MOTION_FADE_IN_MS was sized for. */
    const { context, page } = await mountLayer(browser)
    try {
      await waitForFirstFrame(page)
      const fade = await page.evaluate((selector) => {
        const root = document.querySelector<HTMLElement>(selector)
        return root === null ? '' : getComputedStyle(root).transitionDuration
      }, ROOT_SELECTOR)
      expect(
        fade,
        `the fade over a sharp picture is ${fade}, not MOTION_FADE_IN_MS. The short fade is only licensed ` +
          "behind the intro, where the intro's own hold attenuates the step by half.",
      ).toBe(`${MOTION_FADE_IN_MS / 1000}s`)
      const sample = (): Promise<number> =>
        page.evaluate((selector) => {
          const root = document.querySelector<HTMLElement>(selector)
          return root === null ? -1 : Number(getComputedStyle(root).opacity)
        }, ROOT_SELECTOR)
      const early = await sample()
      await settle(300)
      const mid = await sample()
      await settle(MOTION_FADE_IN_MS)
      const late = await sample()
      expect(early, 'the layer is not near opacity 0 at its first frame').toBeLessThan(0.35)
      expect(mid, 'the layer reached its cap within 300 ms — the fade-in is meant to be slow enough to be a dissolve').toBeLessThan(0.6)
      expect(late, 'the layer never reached its opacity cap').toBeCloseTo(clip.config.opacityCap, 1)
    } finally {
      await context.close()
    }
  })

  test('registers to the still: the box is where the crop lands, and frame 0 is the still\'s pixels', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const { context, page } = await mountLayer(browser)
    try {
      await waitForFirstFrame(page)
      const result = await page.evaluate(
        async ({ selector, crop, stillAspect }) => {
          const root = document.querySelector<HTMLElement>(selector)
          const sharp = document.querySelectorAll<HTMLImageElement>('#top img')[1] ?? null
          if (root === null || sharp === null) return null
          const box = root.querySelector<HTMLElement>('[data-role="active"]')
          const video = box?.querySelector('video') ?? null
          if (box === null || video === null) return null

          /* The still under object-fit: cover + object-position, in frame coordinates. */
          const frame = sharp.getBoundingClientRect()
          const pos = /^([0-9.]+)% ([0-9.]+)%$/.exec(getComputedStyle(sharp).objectPosition)
          const px = pos ? Number(pos[1]) / 100 : 0.5
          const py = pos ? Number(pos[2]) / 100 : 0.5
          const sw = Math.max(frame.width, frame.height * stillAspect)
          const sh = sw / stillAspect
          const ox = (frame.width - sw) * px
          const oy = (frame.height - sh) * py
          const expected = {
            left: frame.left + ox + crop.x * sw,
            top: frame.top + oy + crop.y * sh,
            width: crop.w * sw,
            height: crop.h * sh,
          }
          const got = box.getBoundingClientRect()

          /* Frame 0 of the clip against the same rows of the still, both drawn to canvases. */
          video.pause()
          await new Promise<void>((resolve) => {
            video.onseeked = () => resolve()
            video.currentTime = 0.02
          })
          await sharp.decode()
          const w = video.videoWidth
          const h = video.videoHeight
          const a = document.createElement('canvas')
          a.width = w
          a.height = h
          const b = document.createElement('canvas')
          b.width = w
          b.height = h
          const ca = a.getContext('2d', { willReadFrequently: true })
          const cb = b.getContext('2d', { willReadFrequently: true })
          if (ca === null || cb === null) return null
          ca.drawImage(video, 0, 0, w, h)
          const nw = sharp.naturalWidth
          const nh = sharp.naturalHeight
          cb.drawImage(sharp, crop.x * nw, crop.y * nh, crop.w * nw, crop.h * nh, 0, 0, w, h)
          const da = ca.getImageData(0, 0, w, h).data
          const db = cb.getImageData(0, 0, w, h).data
          let acc = 0
          let n = 0
          for (let k = 0; k < da.length; k += 16) {
            acc += Math.abs(da[k]! - db[k]!) + Math.abs(da[k + 1]! - db[k + 1]!) + Math.abs(da[k + 2]! - db[k + 2]!)
            n += 3
          }
          void video.play().catch(() => undefined)
          return { expected, got: { left: got.left, top: got.top, width: got.width, height: got.height }, meanDiff: acc / n, frame: { width: frame.width, height: frame.height } }
        },
        { selector: ROOT_SELECTOR, crop: clip.config.crop, stillAspect: clip.config.stillAspect },
      )
      expect(result, 'the layer, its active box or the sharp <img> could not be found').not.toBeNull()
      if (result === null) return
      await testInfo.attach('hero-motion-registration.txt', {
        body:
          `frame ${result.frame.width}x${result.frame.height}\n` +
          `expected box ${JSON.stringify(result.expected)}\n` +
          `got box      ${JSON.stringify(result.got)}\n` +
          `mean |frame0 - still| over the box: ${result.meanDiff.toFixed(2)} sRGB levels`,
        contentType: 'text/plain',
      })
      for (const key of ['left', 'top', 'width', 'height'] as const) {
        expect(
          Math.abs(result.got[key] - result.expected[key]),
          `the active box's ${key} is ${result.got[key].toFixed(1)}px but the crop registered to the still lands at ` +
            `${result.expected[key].toFixed(1)}px — the clip is not where the still's pixels are`,
        ).toBeLessThanOrEqual(1.5)
      }
      expect(
        result.meanDiff,
        `frame 0 differs from the still by ${result.meanDiff.toFixed(2)} sRGB levels over the box: the fade-in would ` +
          'reveal a different picture, not the same one breathing. The harness bounds this at 20 — the SAME PICTURE ' +
          'cap: a diffusion re-render of the still measures 6–17, the still 20 px off measures 22.7 — and judges the ' +
          'dissolve to frame 0 per frame; this browser check mirrors the cap so a wrongly registered clip is caught ' +
          'even when the harness was bypassed.',
      ).toBeLessThanOrEqual(20)
    } finally {
      await context.close()
    }
  })

  test('hands off between the two copies as a dissolve, never a cut', async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const { context, page } = await mountLayer(browser)
    try {
      await waitForFirstFrame(page)
      /* Let the standby preload (the active reaches canplaythrough first). */
      await settle(2500)
      const D = clip.config.durationS
      const during = await page.evaluate(
        async ({ selector, seekTo }) => {
          const root = document.querySelector<HTMLElement>(selector)
          if (root === null) return null
          const activeBox = root.querySelector<HTMLElement>('[data-role="active"]')
          const standbyBox = root.querySelector<HTMLElement>('[data-role="standby"]')
          const active = activeBox?.querySelector('video') ?? null
          const standby = standbyBox?.querySelector('video') ?? null
          if (activeBox === null || standbyBox === null || active === null || standby === null) return null
          activeBox.dataset.e2eWas = 'active'
          standbyBox.dataset.e2eWas = 'standby'
          await new Promise<void>((resolve) => {
            active.onseeked = () => resolve()
            active.currentTime = seekTo
          })
          await new Promise((resolve) => setTimeout(resolve, 450))
          return {
            standbyRole: standbyBox.dataset.role,
            standbyPlaying: !standby.paused,
            standbyTime: standby.currentTime,
            standbyOpacity: Number(standbyBox.style.opacity || '0'),
            activeTime: active.currentTime,
            activeOpacity: getComputedStyle(activeBox).opacity,
          }
        },
        { selector: ROOT_SELECTOR, seekTo: D - MOTION_CROSS_S - 0.1 },
      )
      expect(during, 'the two copies could not be found').not.toBeNull()
      if (during === null) return
      expect(during.standbyRole, 'the standby did not become the incoming copy at D − X').toBe('incoming')
      expect(during.standbyPlaying, 'the incoming copy is not playing during the handoff').toBe(true)
      expect(during.standbyOpacity, 'the incoming copy is still at opacity 0 mid-handoff').toBeGreaterThan(0)
      expect(during.standbyOpacity, 'the incoming copy jumped to opacity 1 — a cut, not a dissolve').toBeLessThan(1)
      expect(during.activeOpacity, 'the outgoing copy must stay at opacity 1 for the whole dissolve').toBe('1')

      await settle((MOTION_CROSS_S + 0.8) * 1000)
      const after = await page.evaluate((selector) => {
        const root = document.querySelector<HTMLElement>(selector)
        if (root === null) return null
        const was = (which: string) => root.querySelector<HTMLElement>(`[data-e2e-was="${which}"]`)
        const a = was('active')
        const s = was('standby')
        const av = a?.querySelector('video') ?? null
        const sv = s?.querySelector('video') ?? null
        if (a === null || s === null || av === null || sv === null) return null
        return {
          formerActiveRole: a.dataset.role,
          formerActivePaused: av.paused,
          formerActiveTime: av.currentTime,
          formerActiveOpacity: a.style.opacity,
          formerStandbyRole: s.dataset.role,
          formerStandbyPlaying: !sv.paused,
          formerStandbyOpacity: s.style.opacity,
        }
      }, ROOT_SELECTOR)
      expect(after).not.toBeNull()
      if (after === null) return
      expect(after.formerStandbyRole, 'the incoming copy did not become the active one').toBe('active')
      expect(after.formerStandbyPlaying, 'the new active copy is not playing').toBe(true)
      expect(after.formerStandbyOpacity, 'the inline fade opacity was not cleared after the handoff').toBe('')
      expect(after.formerActiveRole, 'the outgoing copy did not become the standby').toBe('standby')
      expect(after.formerActivePaused, 'the outgoing copy is still playing after the handoff').toBe(true)
      expect(after.formerActiveTime, 'the outgoing copy was not rewound to 0 for the next handoff').toBeLessThan(0.25)
    } finally {
      await context.close()
    }
  })

  test('pauses both copies when the tab is hidden and when the frame leaves the viewport', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const { context, page } = await mountLayer(browser)
    try {
      await waitForFirstFrame(page)
      const states = (): Promise<{ paused: boolean[]; roles: (string | undefined)[] } | null> =>
        page.evaluate((selector) => {
          const root = document.querySelector<HTMLElement>(selector)
          if (root === null) return null
          const boxes = Array.from(root.querySelectorAll<HTMLElement>('[data-role]'))
          return {
            paused: boxes.map((b) => b.querySelector('video')?.paused ?? true),
            roles: boxes.map((b) => b.dataset.role),
          }
        }, ROOT_SELECTOR)

      /* hidden → both paused; visible → the active plays again */
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await settle(200)
      const hidden = await states()
      expect(hidden?.paused, 'both copies must pause when the document is hidden').toEqual([true, true])
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await settle(600)
      const visible = await states()
      expect(visible, 'the layer unmounted on a visibility round-trip').not.toBeNull()
      if (visible) {
        const active = visible.roles.indexOf('active')
        expect(visible.paused[active], 'the active copy did not resume when the document became visible').toBe(false)
      }

      /* off-screen → both paused; back → the active plays again */
      await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.5))
      await settle(800)
      const away = await states()
      expect(away?.paused, 'both copies must pause once the frame has left the viewport').toEqual([true, true])
      await page.evaluate(() => window.scrollTo(0, 0))
      await settle(800)
      const back = await states()
      if (back) {
        const active = back.roles.indexOf('active')
        expect(back.paused[active], 'the active copy did not resume when the frame came back into view').toBe(false)
      }
    } finally {
      await context.close()
    }
  })

  test('falls back to the still, for the page life, when playback is refused', async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const { context, page, requests } = await mountLayer(browser, { refusePlay: true })
    try {
      /* The gate passes, the markup mounts, play() rejects, the layer unmounts. */
      await settle(12_000)
      expect(await videoCount(page), 'the layer must remove itself when play() is refused').toBe(0)
      const mounted = await page.evaluate((selector) => document.querySelector(selector) !== null, ROOT_SELECTOR)
      expect(mounted, 'the motion root is still in the DOM after the still fallback').toBe(false)
      /* No retry: another input must not remount. */
      await firstInput(page)
      await page.mouse.wheel(0, 4)
      await settle(MOTION_SETTLE_MS + 3000)
      expect(await videoCount(page), 'the layer retried after the still fallback — it must not, in this page life').toBe(0)
      void requests
    } finally {
      await context.close()
    }
  })

  test('starts on its own — no scroll, no pointerdown, no keydown — and fetches the clip once', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await arm(page, clip.config, { force: true })
      const seen = watchClipRequests(page)
      if (clip.served) await serve(page, clip.bytes)
      await page.goto('/', { waitUntil: 'load' })
      await introGone(page)

      /* Nothing is touched from here on: no keyboard, no mouse, no wheel. */
      await waitForFirstFrame(page)
      const state = await page.evaluate((selector) => {
        const root = document.querySelector(selector)
        const video = root === null ? null : root.querySelector('video')
        return {
          on: root !== null && root.hasAttribute('data-on'),
          paused: video === null ? true : video.paused,
        }
      }, ROOT_SELECTOR)

      expect(
        state.on,
        'The layer never reached its first frame without an input. Since 2026-09-07 it must start ' +
          'itself: the reader should never have to know to scroll to make the picture move.',
      ).toBe(true)
      expect(state.paused, 'the auto-started copy is not playing').toBe(false)
      expect(
        seen.length,
        `The clip was requested ${seen.length} times in one page life:\n  ${seen.join('\n  ')}\n` +
          'Exactly one fetch is the contract — the standby copy loads only once the active one can ' +
          'play through, so the second element takes the cache rather than the network.',
      ).toBe(1)
    } finally {
      await context.close()
    }
  })

  test('a hero that does not cover the viewport does not auto-start; the first input still starts it', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await arm(page, clip.config, { force: true })
      const seen = watchClipRequests(page)
      if (clip.served) await serve(page, clip.bytes)
      await page.goto('/', { waitUntil: 'load' })
      /* THE GEOMETRY IS FORCED, on purpose and with a stylesheet rather than a
         scroll, because a scroll is also the accelerator and would prove
         nothing. The controller's auto-start reads the sharp <img>'s own box:
         shrink it and the clip can no longer promise to cover the viewport, so
         the layer must refuse to start itself and wait for an input, exactly as
         it did before 2026-09-07. The live shapes this stands for are a clip
         registered to a sub-rectangle of the still and a page restored
         mid-scroll. */
      await page.addStyleTag({ content: '#top img { height: 60vh !important; }' })
      await introGone(page)
      await settle(MOTION_SETTLE_MS + MOTION_LCP_QUIET_MS + 4000)

      const box = await page.evaluate(() => {
        const img = document.querySelectorAll('#top img')[1]
        return img === undefined ? null : { bottom: img.getBoundingClientRect().bottom, vh: window.innerHeight }
      })
      expect(box, 'the hero has no sharp <img> to shrink, so this test is not testing anything').not.toBeNull()
      expect(
        box === null ? 0 : box.bottom,
        'the forced stylesheet did not actually stop the picture covering the viewport',
      ).toBeLessThan(box === null ? 0 : box.vh)

      expect(
        await videoCount(page),
        'The layer auto-started over a hero that does not cover the viewport. There the <video> is a ' +
          'largest-contentful-paint candidate again — one uncovered pixel is enough — so the auto-start ' +
          'must refuse and the first input must be the only way in.',
      ).toBe(0)
      expect(seen, 'a clip was fetched on a page that must not auto-start').toEqual([])

      await firstInput(page)
      await page.waitForSelector(ROOT_SELECTOR, { state: 'attached', timeout: 20_000 })
      expect(
        await videoCount(page),
        'the first input no longer starts the layer — it is the accelerator AND the fallback',
      ).toBe(2)
    } finally {
      await context.close()
    }
  })

  test('reduced motion flipped at RUNTIME unmounts the layer, and flipping back re-gates it', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const { context, page } = await mountLayer(browser)
    try {
      await waitForFirstFrame(page)
      expect(await videoCount(page), 'the layer never started, so there is nothing to unmount').toBe(2)

      /* The refusal is not only a load-time one: MOTION_MEDIA carries
         (prefers-reduced-motion: no-preference) and the controller listens for
         `change`. A reader who turns the preference on mid-visit must get the
         still back, with both decoders released. */
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect
        .poll(async () => videoCount(page), { timeout: 10_000 })
        .toBe(0)

      /* And back: the gate re-runs from the top — settle, idle, decode, the LCP
         quiet window and the coverage test — with no input anywhere. */
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await expect
        .poll(async () => videoCount(page), { timeout: 30_000 })
        .toBe(2)
    } finally {
      await context.close()
    }
  })

  test('auto-started with no input, the clip is never the largest contentful paint', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await arm(page, clip.config, { force: true })
      if (clip.served) await serve(page, clip.bytes)
      await page.goto('/', { waitUntil: 'load' })
      await introGone(page)
      /* No input at all: LCP is still LIVE while the clip mounts, plays and
         fades in. That is the whole point of the test. */
      await waitForFirstFrame(page)
      await settle(MOTION_FADE_IN_MS + 500)

      /* The structural reason there is no candidate: the clip paints over every
         pixel of the viewport, and Chrome does not make a full-viewport paint an
         LCP candidate. One pixel of anything else is enough to break it. */
      const cover = await page.evaluate((selector) => {
        const video = document.querySelector(`${selector} video`)
        if (video === null) return null
        const box = video.getBoundingClientRect()
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          vw: window.innerWidth,
          vh: window.innerHeight,
        }
      }, ROOT_SELECTOR)
      expect(cover, 'the clip is not on the page at all').not.toBeNull()
      if (cover) {
        expect(
          cover.left <= 0 && cover.top <= 0 && cover.right >= cover.vw && cover.bottom >= cover.vh,
          `The clip's painted rect (${cover.left}, ${cover.top}) → (${cover.right}, ${cover.bottom}) does ` +
            `not cover the ${cover.vw}x${cover.vh} viewport. That coverage is the ONLY reason the layer ` +
            'may start before the first input; without it the <video> is an LCP candidate.',
        ).toBe(true)
      }

      const entries = await page.evaluate(
        () =>
          new Promise<Array<{ tag: string; startTime: number; size: number; inHero: boolean }>>((resolve) => {
            const seen: Array<{ tag: string; startTime: number; size: number; inHero: boolean }> = []
            try {
              const hero = document.getElementById('top')
              const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries() as Array<PerformanceEntry & { element?: Element | null; size?: number }>) {
                  seen.push({
                    tag: entry.element?.tagName ?? '(none)',
                    startTime: entry.startTime,
                    size: entry.size ?? 0,
                    inHero: Boolean(entry.element && hero?.contains(entry.element)),
                  })
                }
              })
              observer.observe({ type: 'largest-contentful-paint', buffered: true })
              setTimeout(() => {
                observer.disconnect()
                resolve(seen)
              }, 1500)
            } catch {
              resolve(seen)
            }
          }),
      )
      test.skip(entries.length === 0, 'no largest-contentful-paint entry was observable in this browser')

      /* THE CONTROL, so a silent observer cannot pass this test. Nothing here
         has scrolled, clicked or typed, so LCP must still be LIVE — and the way
         to prove it is to give it something to record: a 900x600 <img>, six
         times the lede's area, injected after the clip has faded all the way
         in. If THAT is not recorded, the metric was already final and the
         absence of a <video> entry above proves nothing. */
      const control = await page.evaluate(
        () =>
          new Promise<{ recorded: boolean; at: number }>((resolve) => {
            const img = document.createElement('img')
            img.id = 'lcp-control'
            img.src = '/brand/hero/hero-p-640.avif'
            img.style.cssText =
              'position:fixed;left:0;top:0;width:900px;height:600px;object-fit:cover;z-index:9999'
            let recorded = false
            let at = 0
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries() as Array<PerformanceEntry & { element?: Element | null }>) {
                if (entry.element?.id === 'lcp-control') {
                  recorded = true
                  at = entry.startTime
                }
              }
            })
            observer.observe({ type: 'largest-contentful-paint' })
            document.body.appendChild(img)
            setTimeout(() => {
              observer.disconnect()
              img.remove()
              resolve({ recorded, at })
            }, 3_000)
          }),
      )
      expect(
        control.recorded,
        'The control element was not recorded, so largest-contentful-paint was already final and this ' +
          'test cannot see what it claims to. Nothing in it scrolls, clicks or types, so if this fires ' +
          'the page is finalising LCP some other way and the assertion below is vacuous.',
      ).toBe(true)

      await testInfo.attach('hero-motion-lcp.txt', {
        body:
          entries.map((e) => `${e.startTime.toFixed(0)}ms <${e.tag}> ${e.size}px² inHero=${e.inHero}`).join('\n') +
          `\ncontrol <img> recorded at ${control.at.toFixed(0)}ms — the observer was still live`,
        contentType: 'text/plain',
      })
      const videos = entries.filter((e) => e.tag === 'VIDEO')
      expect(
        videos,
        'A <video> was recorded as a largest-contentful-paint candidate on the no-input path. The clip is ' +
          'allowed to start by itself ONLY because a paint that covers the whole viewport is not a ' +
          'candidate; if this fires, either that geometry has changed or Chrome has stopped excluding ' +
          'full-viewport paints, and the first-input rule has to come back.',
      ).toEqual([])
      const last = entries[entries.length - 1]
      expect(last?.inHero, 'the final LCP element is not inside the hero').toBe(true)
    } finally {
      await context.close()
    }
  })

  /* ════════════════════════════════════════════════════════════════════════
     PLAY ONCE AND HOLD — `loop: false`
     ════════════════════════════════════════════════════════════════════════ */

  test('a one-shot clip renders ONE copy with the loop attribute off, and no standby', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await arm(page, { ...clip.config, loop: false }, { force: true })
      if (clip.served) await serve(page, clip.bytes)
      await page.goto('/', { waitUntil: 'load' })
      await introGone(page)
      await waitForFirstFrame(page)

      const shape = await page.evaluate((selector) => {
        const root = document.querySelector<HTMLElement>(selector)
        if (root === null) return null
        const videos = Array.from(root.querySelectorAll('video'))
        return {
          videos: videos.length,
          loops: videos.map((v) => v.loop),
          roles: Array.from(root.querySelectorAll('[data-role]')).map((el) => el.getAttribute('data-role')),
        }
      }, ROOT_SELECTOR)
      expect(shape, 'the motion root disappeared after its first frame').not.toBeNull()
      if (shape === null) return
      expect(
        shape.videos,
        'a one-shot clip mounted more than one <video>. There is no handoff to prepare for: the second copy ' +
          'is a second decoder and a second buffer for nothing.',
      ).toBe(1)
      expect(
        shape.loops,
        "the element's own `loop` attribute is ON for a clip that must not wrap. That attribute is the " +
          'missed-handoff fallback for a real loop; here it is the fault — it would carry the picture back ' +
          'to the sunset it started from, with no event the controller could see.',
      ).toEqual([false])
      expect(shape.roles, 'a one-shot clip rendered a standby box').toEqual(['active'])
    } finally {
      await context.close()
    }
  })

  test('a one-shot clip plays to its end and HOLDS there — a tab flip does not restart it', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await arm(page, { ...clip.config, loop: false }, { force: true })
      if (clip.served) await serve(page, clip.bytes)
      await page.goto('/', { waitUntil: 'load' })
      await introGone(page)
      await waitForFirstFrame(page)

      /* Seek to just before the end rather than waiting out a 30 s clip. The
         controller schedules nothing here, so a seek is not skipping a step —
         there are no steps. */
      await page.evaluate((selector) => {
        const v = document.querySelector<HTMLVideoElement>(`${selector} video`)
        if (v !== null && Number.isFinite(v.duration)) v.currentTime = Math.max(0, v.duration - 0.4)
      }, ROOT_SELECTOR)
      await page.waitForFunction(
        (selector) => document.querySelector<HTMLVideoElement>(`${selector} video`)?.ended === true,
        ROOT_SELECTOR,
        { timeout: 20_000 },
      )

      const held = await page.evaluate((selector) => {
        const v = document.querySelector<HTMLVideoElement>(`${selector} video`)
        return v === null ? null : { ended: v.ended, paused: v.paused, t: v.currentTime, d: v.duration }
      }, ROOT_SELECTOR)
      expect(held, 'the one-shot clip left the DOM when it ended').not.toBeNull()
      if (held === null) return
      expect(held.paused, 'the ended clip is not paused').toBe(true)
      expect(
        held.d - held.t,
        'the ended clip is not sitting on its last frame — it wrapped, which is the whole thing this mode forbids',
      ).toBeLessThan(0.5)

      /* A tab flip. `play()` on an ENDED element seeks it to 0 and plays it
         again, so this is the ordinary event that would silently restart the
         descent. The visibility is overridden in-page rather than through CDP
         because the controller listens for the EVENT and reads
         document.visibilityState, which is exactly what this replaces. */
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await settle(400)
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await settle(800)

      const after = await page.evaluate((selector) => {
        const v = document.querySelector<HTMLVideoElement>(`${selector} video`)
        return v === null ? null : { ended: v.ended, t: v.currentTime, count: document.querySelectorAll(`${selector} video`).length }
      }, ROOT_SELECTOR)
      expect(after, 'the layer unmounted across the tab flip').not.toBeNull()
      if (after === null) return
      expect(
        after.ended,
        'the clip restarted when the tab came back. play() on an ended element seeks it to 0 — the controller ' +
          'has to refuse that, or a reader who changes tabs is thrown from the night back to the sunset.',
      ).toBe(true)
      expect(after.count, 'a second copy appeared after the tab flip').toBe(1)
    } finally {
      await context.close()
    }
  })

  /* ════════════════════════════════════════════════════════════════════════
     THE FEATHER — only for a crop that is a real sub-rectangle
     ════════════════════════════════════════════════════════════════════════ */

  test('the edge feather follows the crop: none for a whole-frame registration, 32 px for a sub-rectangle', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    if (clip === null) return
    const whole = clip.config.crop.x === 0 && clip.config.crop.y === 0 && clip.config.crop.w === 1 && clip.config.crop.h === 1

    const read = async (config: MotionConfig): Promise<{ attr: string | null; mask: string } | null> => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
      const page = await context.newPage()
      try {
        await arm(page, config, { force: true })
        if (clip.served) await serve(page, clip.bytes)
        await page.goto('/', { waitUntil: 'load' })
        await introGone(page)
        /* A CROPPED registration cannot promise to cover the viewport, so it
           never auto-starts — that refusal is the whole reason the first-input
           rule survived. Press one, after the late door's settle, so this test
           measures the mask rather than re-measuring the gate. */
        await settle(MOTION_SETTLE_MS + 500)
        await firstInput(page)
        await waitForFirstFrame(page)
        return await page.evaluate((selector) => {
          const root = document.querySelector<HTMLElement>(selector)
          const box = root?.querySelector<HTMLElement>('[data-role="active"]') ?? null
          if (root === null || box === null) return null
          const style = getComputedStyle(box)
          return { attr: root.getAttribute('data-feather'), mask: style.maskImage || style.webkitMaskImage || 'none' }
        }, ROOT_SELECTOR)
      } finally {
        await context.close()
      }
    }

    const installedRead = await read(clip.config)
    expect(installedRead, 'the layer never reached its first frame with the installed registration').not.toBeNull()
    if (installedRead !== null && whole) {
      expect(
        installedRead.attr,
        'the whole-frame registration carries data-feather. There is no interior edge for the mask to hide: ' +
          "two of the box's sides sit outside the container and the other two land ON the viewport's own edge, " +
          'where the mask does not hide a seam, it makes one — a band of still around the clip. Harmless while ' +
          'the two are the same picture; a warm sunset rim around a blue one as soon as they are not.',
      ).toBeNull()
      expect(installedRead.mask, 'a mask is still being applied to a whole-frame registration').toBe('none')
    }

    /* The same clip, declared as a sub-rectangle: the mask must come back. */
    const cropped = await read({ ...clip.config, crop: { x: 0, y: 0.06, w: 1, h: 0.88 } })
    expect(cropped, 'the layer never reached its first frame with a cropped registration').not.toBeNull()
    if (cropped === null) return
    expect(
      cropped.attr,
      'a crop that IS a sub-rectangle of the still lost its feather. That edge falls inside the picture, with ' +
        "the same photograph on both sides of it, and the mask is what hides the model's re-render seam there.",
    ).toBe('')
    expect(cropped.mask, 'the sub-rectangle registration has no mask').toContain('gradient')
  })

  test('with no override at all, the config the layer mounts on is the SERVER\'s', async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000)
    test.skip(!installed, 'no installed clip — there is no server-side config to hand over')
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      /* Force key only. sessionStorage carries no config, so anything that
         mounts came from components/site/hero.tsx's readHeroMotion. */
      await arm(page, phantomConfig(), { force: true, noOverride: true })
      await page.goto('/', { waitUntil: 'load' })
      await introGone(page)
      await waitForFirstFrame(page)
      const src = await page.evaluate((selector) => {
        const source = document.querySelector<HTMLSourceElement>(`${selector} video source`)
        return source?.getAttribute('src') ?? ''
      }, ROOT_SELECTOR)
      const m = heroMotionManifest()
      expect(src, 'the layer mounted on something other than the installed clip').toBe(`${HERO_MOTION_URL_PREFIX}${String(m?.file)}`)
    } finally {
      await context.close()
    }
  })

  test('the installed clip, when there is one, lives under the motion directory and nowhere else', async () => {
    test.skip(!installed, 'no installed clip — the candidate is served from memory')
    const m = heroMotionManifest()
    expect(m?.file && /^hero-loop-[0-9a-f]{8}\.(?:mp4|webm)$/.test(m.file), 'the installed file is not hero-loop-<sha8>.{mp4,webm}').toBe(true)
    expect(path.join(HERO_MOTION_DIR, m?.file ?? '')).toContain(HERO_MOTION_DIR)
  })
})
