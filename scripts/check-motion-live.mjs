/**
 * check-motion-live.mjs — why is the hero not moving on a DEPLOYED build?
 *
 *   node scripts/check-motion-live.mjs [url] [--width 1440] [--height 900] [--dpr 2]
 *
 * Defaults to https://duyng-portfolio.com. Exits 0 when the layer mounts and
 * plays, 1 when it does not, 2 when the page could not be reached.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * On 2026-09-08 the live site was still while localhost, built from the same
 * commit, animated. Every obvious explanation was wrong: the push had landed,
 * the deploy was current, the server rendered the motion config into the HTML,
 * the clip returned 200 with Range support and the right byte count, the media
 * query passed, Save-Data was off, and there were no console errors. The layer
 * simply never mounted, and a first input did not start it either.
 *
 * It took reading the minified gate out of both bundles to see it: the deployed
 * build had folded `!enabled && !forced` down to `!forced`, which is what a
 * compiler writes when it has proved `enabled` false. The switch was off in
 * that build and nothing on the page said so.
 *
 * That is a diagnosis nobody should have to repeat by hand, and it cannot be
 * caught by a local test, because the fold depends on the deploy host's own
 * environment. So this walks the gate's conditions in order against whatever
 * URL you give it and names the first one that fails. The order below mirrors
 * components/site/hero-motion.tsx; keep them in step.
 */
import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(k)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d
}
const positional = []
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) { i += 1; continue }
  positional.push(argv[i])
}
const URL_ = positional[0] ?? 'https://duyng-portfolio.com'
const WIDTH = Number(arg('--width', '1440'))
const HEIGHT = Number(arg('--height', '900'))
const DPR = Number(arg('--dpr', '2'))
const WAIT_MS = Number(arg('--wait', '14000'))

const ok = (s) => `  ok    ${s}`
const bad = (s) => `  FAIL  ${s}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: DPR })
/* A real visitor's browser does not announce automation, and the layer refuses
   plain automation on purpose. Spoofing it is what makes this measure the
   reader's experience rather than a robot's. */
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))
const page = await ctx.newPage()

const clipRequests = []
const errors = []
page.on('request', (r) => {
  if (r.url().includes('/brand/hero/motion/')) clipRequests.push(r.url().split('/').pop())
})
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`)
})

console.log(`\n  ${URL_}  at ${WIDTH}x${HEIGHT} dpr${DPR}, no input, ${(WAIT_MS / 1000).toFixed(0)}s\n`)
let html = ''
try {
  const res = await page.goto(URL_, { waitUntil: 'load', timeout: 45000 })
  html = await res.text().catch(() => '')
  console.log(ok(`the page loaded (${res.status()})`))
} catch (err) {
  console.error(bad(`could not load the page: ${String(err).slice(0, 140)}\n`))
  await browser.close()
  process.exit(2)
}

/* 1 — did the SERVER decide there is a clip? If not, the cause is the corpus
   record or the manifest, and it is a build-side problem, not a client one. */
/* The config travels inside the RSC payload, where every quote is backslash
   escaped, so match the clip's NAME rather than the JSON shape around it. */
const configuredMatch = html.match(/hero-loop-[0-9a-f]{8}\.(?:mp4|webm)/)
const configured = configuredMatch !== null
console.log(configured ? ok(`the server rendered a motion config into the page (${configuredMatch[0]})`) : bad('the server rendered NO motion config — the record or the manifest refused it, not the browser'))

await page.waitForFunction(() => !document.documentElement.dataset.intro, null, { timeout: 25000 }).catch(() => {})
await new Promise((r) => setTimeout(r, WAIT_MS))

const state = await page.evaluate(() => {
  const root = document.querySelector('[data-hero-motion]')
  const videos = [...document.querySelectorAll('[data-hero-motion] video')]
  const top = document.getElementById('top')
  const imgs = top ? [...top.querySelectorAll('img')] : []
  const sharp = imgs.length >= 2 ? imgs[1] : null
  const r = sharp ? sharp.getBoundingClientRect() : null
  return {
    media: matchMedia('(min-width: 1280px) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches,
    width: innerWidth,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    fine: matchMedia('(pointer: fine)').matches,
    saveData: navigator.connection?.saveData ?? false,
    effectiveType: navigator.connection?.effectiveType ?? null,
    offKey: (() => { try { return sessionStorage.getItem('duyng.motion.off') } catch { return null } })(),
    intro: document.documentElement.dataset.intro ?? null,
    sharpImages: imgs.length,
    covers: r ? r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight : null,
    mounted: !!root,
    on: root ? root.hasAttribute('data-on') : false,
    videos: videos.length,
    playing: videos.map((v) => ({ t: +v.currentTime.toFixed(1), paused: v.paused, err: v.error?.code ?? null })),
  }
})

console.log(state.media ? ok(`the media query passes (${state.width}px, fine pointer, motion allowed)`) : bad(`the media query REFUSES: width ${state.width}, fine pointer ${state.fine}, reduced motion ${state.reduced}`))
console.log(!state.saveData ? ok(`the connection is acceptable (${state.effectiveType ?? 'unknown'})`) : bad('Save-Data is on, so the clip is never fetched'))
console.log(state.offKey !== '1' ? ok('the off switch is not set in this browser') : bad("sessionStorage duyng.motion.off is '1' in this browser"))
console.log(state.intro === null ? ok('the intro finished') : bad(`the intro is still ${state.intro}, so the gate is still waiting`))
console.log(state.sharpImages >= 2 ? ok(`the hero band has its two images (the gate finds the sharp one)`) : bad(`the hero band has ${state.sharpImages} image(s); the gate needs two and gives up without them`))
console.log(state.covers === true ? ok('the picture covers the viewport, so the clip may auto-start') : bad(`the picture does NOT cover the viewport, so the clip waits for a click (covers: ${state.covers})`))

if (state.mounted && state.videos > 0 && state.playing.some((v) => !v.paused)) {
  console.log(ok(`the layer mounted and is playing (${state.videos} video, t=${state.playing[0].t}s)`))
  console.log(`\n  OK — the hero is moving on this build.\n`)
  await browser.close()
  process.exit(0)
}

console.log(bad(`the layer did NOT mount (root ${state.mounted}, videos ${state.videos}, clip requests ${clipRequests.length})`))
if (errors.length) console.log(`  page errors: ${errors.slice(0, 2).join(' | ')}`)

/* Everything above passed and it still did not mount. The remaining conditions
   live inside the bundle, and the one that has actually bitten is the switch. */
if (configured && state.media && !state.saveData && state.intro === null && state.covers === true && clipRequests.length === 0) {
  console.log(
    `\n  WHAT THIS MEANS. The server put a clip in the page, every condition the\n` +
      `  browser can see is satisfied, and the layer still never asked for the clip.\n` +
      `  That is the signature of the switch being OFF in this build:\n` +
      `  NEXT_PUBLIC_HERO_MOTION is set to "off" (or to a value an older build\n` +
      `  treated as off) in the deploy host's environment. lib/hero-motion.ts now\n` +
      `  refuses only the literal "off", so check the host's variables, delete it\n` +
      `  or set it to "on", and redeploy.\n`,
  )
}
console.log(`  NOT MOVING on this build.\n`)
await browser.close()
process.exit(1)
