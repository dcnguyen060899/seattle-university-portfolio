import type { Browser, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  ANY_HERO_ASSET,
  ANY_SHARP_REQUEST,
  ANY_SOFT_REQUEST,
  HERO_URL_PREFIX,
  LANDSCAPE_REQUEST,
  NOT_LANDED_MESSAGE,
  PORTRAIT_REQUEST,
  SOFT_LANDSCAPE_REQUEST,
  SOFT_PORTRAIT_REQUEST,
  heroAssetFiles,
  heroPhotoHasLanded,
  pinFocus,
} from './helpers/hero-assets'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HERO PHOTOGRAPH — structure, delivery and the no-asset fallback.
 *
 * §1 is the PRIMARY case and it is UNCONDITIONAL: the hero must render
 * correctly with no photograph on disk. That is the state this repository is
 * in today, the state it ships in until the owner drops his file at
 * `public/brand/hero-source.png`, and the state it returns to if the image is
 * ever pulled over a rights question. The photograph is progressive enhancement over
 * a hero that already works — so "works without it" is not a fallback test,
 * it is the baseline the enhancement is measured against.
 *
 * §2–§5 assert the present-asset contract and SKIP LOUDLY until it lands.
 * They arm on the files, not on a flag: one `hero-p-*`/`hero-l-*` variant on
 * disk and the whole contract is enforced, because a half-landed ladder is a
 * defect, not an intermediate state.
 *
 * The behavioural twin of §3 is `tests/e2e/hero-scroll-perf.spec.ts` (does the
 * hero hold its frame budget); the legibility twin is
 * `tests/e2e/hero-contrast.spec.ts` (is the text still readable over it). This
 * file asserts the STRUCTURE, so that when either of those fails there is a
 * test that names the broken part.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const photoLanded = heroPhotoHasLanded()

/** The three widths the round is specified at. */
const VIEWPORTS = [
  { key: '375', width: 375, height: 812 },
  { key: '768', width: 768, height: 1024 },
  { key: '1280', width: 1280, height: 800 },
] as const

function decoded(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

interface PageLog {
  /** Decoded URLs of every hero-asset request, in order. */
  heroRequests: string[]
  /** `status url` for anything hero-shaped that came back >= 400. */
  badResponses: string[]
  /** Non-aborted load failures for hero assets, or for ANY image on the page. */
  failures: string[]
  /** Console messages at error level, and uncaught page errors. */
  consoleErrors: string[]
  /** Every request that touched the hero asset directory, hit or miss. */
  brandHeroRequests: string[]
}

/** Attach BEFORE goto — the hero assets load with the document. */
function recordPage(page: Page): PageLog {
  const log: PageLog = {
    heroRequests: [],
    badResponses: [],
    failures: [],
    consoleErrors: [],
    brandHeroRequests: [],
  }

  page.on('request', (request) => {
    const url = decoded(request.url())
    if (ANY_HERO_ASSET.test(url)) log.heroRequests.push(url)
    if (url.includes(HERO_URL_PREFIX)) log.brandHeroRequests.push(url)
  })
  page.on('response', (response) => {
    const url = decoded(response.url())
    if ((ANY_HERO_ASSET.test(url) || url.includes(HERO_URL_PREFIX)) && response.status() >= 400) {
      log.badResponses.push(`${response.status()} ${url}`)
    }
  })
  page.on('requestfailed', (request) => {
    const url = decoded(request.url())
    const reason = request.failure()?.errorText ?? 'unknown'
    // An aborted request is the browser choosing not to finish a speculative
    // fetch — wasteful perhaps, but not a broken asset.
    if (/abort/i.test(reason)) return
    if (ANY_HERO_ASSET.test(url) || url.includes(HERO_URL_PREFIX) || request.resourceType() === 'image') {
      log.failures.push(`${request.resourceType()} ${url} — ${reason}`)
    }
  })
  page.on('console', (message) => {
    if (message.type() === 'error') log.consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => {
    log.consoleErrors.push(`uncaught: ${error.message}`)
  })

  return log
}

/**
 * Cumulative layout shift ATTRIBUTABLE TO THE HERO, plus the whole-document
 * figure for context.
 *
 * Installed with `addInitScript` so the observer exists before the first paint;
 * a PerformanceObserver constructed after `goto` misses the shifts that matter
 * (`buffered: true` helps but the source attribution is what we need, and that
 * is only reliable on live entries).
 */
async function installShiftObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface ShiftRecord {
      value: number
      inHero: boolean
      paths: string[]
    }
    const shifts: ShiftRecord[] = []
    ;(window as unknown as { __heroShifts: ShiftRecord[] }).__heroShifts = shifts

    try {
      const observer = new PerformanceObserver((list) => {
        for (const raw of list.getEntries()) {
          const entry = raw as PerformanceEntry & {
            value: number
            hadRecentInput: boolean
            sources?: Array<{ node?: Node | null }>
          }
          if (entry.hadRecentInput) continue
          const hero = document.getElementById('top')
          const nodes = (entry.sources ?? [])
            .map((source) => source.node)
            .filter((node): node is Element => node instanceof Element)
          shifts.push({
            value: entry.value,
            inHero: nodes.some((node) => hero?.contains(node) ?? false),
            paths: nodes.map((node) => {
              const cls =
                typeof node.className === 'string' && node.className.trim()
                  ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}`
                  : ''
              return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${cls}`
            }),
          })
        }
      })
      observer.observe({ type: 'layout-shift', buffered: true })
    } catch {
      // A browser without layout-shift entries leaves the array empty; the
      // assertion below reports "not measured" rather than a false green.
    }
  })
}

async function readShifts(page: Page): Promise<{
  heroShift: number
  documentShift: number
  detail: string[]
  observed: boolean
}> {
  return page.evaluate(() => {
    const shifts =
      (window as unknown as { __heroShifts?: Array<{ value: number; inHero: boolean; paths: string[] }> })
        .__heroShifts ?? []
    return {
      heroShift: shifts.filter((s) => s.inHero).reduce((a, s) => a + s.value, 0),
      documentShift: shifts.reduce((a, s) => a + s.value, 0),
      detail: shifts.map((s) => `${s.value.toFixed(4)} ${s.inHero ? '[hero] ' : ''}${s.paths.join(', ')}`),
      observed: typeof PerformanceObserver !== 'undefined',
    }
  })
}

/** Everything the hero subtree paints, with the properties the contract is written in. */
interface HeroLayer {
  path: string
  tag: string
  /** An <img>'s currentSrc, or the first url() in background-image. */
  url: string
  filter: string
  willChange: string
  opacity: number
  transform: string
  /** <img> only: 0 while loading, 0 forever if the file 404s. */
  naturalWidth: number
  complete: boolean
  fetchPriority: string
  loading: string
}

async function probeHeroLayers(page: Page): Promise<HeroLayer[]> {
  return page.evaluate(() => {
    const root = document.getElementById('top')
    if (!root) return []

    const describe = (el: Element): string => {
      const cls =
        typeof (el as HTMLElement).className === 'string'
          ? String((el as HTMLElement).className).trim().split(/\s+/).slice(0, 2).join('.')
          : ''
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`
    }

    const nodes = [root, ...Array.from(root.querySelectorAll('*'))]
    return nodes.map((node) => {
      const style = getComputedStyle(node)
      const img = node instanceof HTMLImageElement ? node : null
      const match = /url\("?([^")]+)"?\)/.exec(style.backgroundImage || '')
      return {
        path: describe(node),
        tag: node.tagName.toLowerCase(),
        url: img ? img.currentSrc || img.src : (match?.[1] ?? ''),
        filter: style.filter || 'none',
        willChange: style.willChange || 'auto',
        opacity: Number.parseFloat(style.opacity || '1'),
        transform: style.transform || 'none',
        naturalWidth: img?.naturalWidth ?? -1,
        complete: img?.complete ?? true,
        fetchPriority: img?.getAttribute('fetchpriority') ?? '',
        loading: img?.getAttribute('loading') ?? '',
      }
    })
  })
}

/* ════════════════════════════════════════════════════════════════════════════
   §1 · THE ABSENT-ASSET PATH — unconditional, and the primary case
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('hero: renders correctly with the photograph absent', () => {
  for (const viewport of VIEWPORTS) {
    test(`no missing asset, no console error, no hero layout shift at ${viewport.key}`, async ({
      browser,
    }, testInfo) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      const page = await context.newPage()
      try {
        const log = recordPage(page)
        await installShiftObserver(page)
        await page.goto('/', { waitUntil: 'load' })
        await page.waitForLoadState('networkidle').catch(() => undefined)

        /* The hero exists, is visible, and is on the ink ground it publishes
           every one of its contrast ratios against. */
        const hero = page.locator('#top')
        await expect(hero, 'the hero (#top) is missing from the page').toBeVisible()
        await expect(
          hero,
          'the hero must stay on the ink ground — every colour in it is measured against ' +
            '#14161A, and a ground change silently invalidates all of them',
        ).toHaveAttribute('data-ground', 'ink')

        const heading = page.getByRole('heading', { level: 1 })
        await expect(heading, 'the hero H1 did not render').toBeVisible()

        /* No 404s, no failed loads. THE assertion for this section: with no
           photograph on disk, the page must not ask for one. */
        expect(
          log.badResponses,
          `Hero-shaped requests came back >= 400 at ${viewport.key}:\n  ${log.badResponses.join('\n  ')}`,
        ).toEqual([])
        expect(
          log.failures,
          `Image requests failed outright at ${viewport.key}:\n  ${log.failures.join('\n  ')}`,
        ).toEqual([])

        if (!photoLanded) {
          expect(
            log.brandHeroRequests,
            `The photograph is not on disk, but the page requested ${log.brandHeroRequests.length} ` +
              `asset(s) from ${HERO_URL_PREFIX}:\n  ${log.brandHeroRequests.join('\n  ')}\n` +
              'With no assets present the hero must reference none — a <picture> emitted ' +
              'unconditionally 404s for every visitor until the owner drops his file in.',
          ).toEqual([])
        }

        /* No broken-image element: every <img> in the hero decoded to real
           pixels. `naturalWidth === 0` on a completed image IS the grey
           broken-image box. */
        const layers = await probeHeroLayers(page)
        const broken = layers.filter(
          (layer) => layer.tag === 'img' && layer.complete && layer.naturalWidth === 0,
        )
        expect(
          broken.map((layer) => `${layer.path} <- ${layer.url || '(no src)'}`),
          `Broken <img> inside the hero at ${viewport.key} — loaded but zero pixels wide:\n  ` +
            broken.map((layer) => `${layer.path} <- ${layer.url}`).join('\n  '),
        ).toEqual([])

        if (!photoLanded) {
          const heroAssetLayers = layers.filter((layer) => layer.url.includes(HERO_URL_PREFIX))
          expect(
            heroAssetLayers.map((layer) => `${layer.path} <- ${layer.url}`),
            `The hero paints ${HERO_URL_PREFIX} assets that do not exist on disk. The no-asset ` +
              'state must be the flat ink ground, with no image layer at all.',
          ).toEqual([])
        }

        /* No console errors. */
        expect(
          log.consoleErrors,
          `Console errors on load at ${viewport.key}:\n  ${log.consoleErrors.join('\n  ')}`,
        ).toEqual([])

        /* No layout shift attributable to the hero. A hero that reserves no
           box for a picture it is about to paint is the classic CLS source,
           and it is invisible in every other assertion here. */
        const shifts = await readShifts(page)
        await testInfo.attach(`layout-shift-${viewport.key}.txt`, {
          body:
            `hero-attributed CLS ${shifts.heroShift.toFixed(4)}, document CLS ` +
            `${shifts.documentShift.toFixed(4)}\n${shifts.detail.join('\n')}`,
          contentType: 'text/plain',
        })
        expect(
          shifts.heroShift,
          `Layout shift attributable to the hero at ${viewport.key}: ` +
            `${shifts.heroShift.toFixed(4)}. The hero occupies the first viewport, so any shift ` +
            `there is the first thing a recruiter sees move.\nShifts observed:\n  ` +
            `${shifts.detail.join('\n  ')}`,
          // 0.01 is a hundredth of the 0.1 "good" CLS threshold: room for a
          // sub-pixel reflow, none at all for an unreserved image box.
        ).toBeLessThanOrEqual(0.01)
      } finally {
        await context.close()
      }
    })
  }
})

/* ════════════════════════════════════════════════════════════════════════════
   §2 · ART DIRECTION — the bandwidth contract
   ════════════════════════════════════════════════════════════════════════════ */

interface ViewportSelection {
  key: string
  sharp: string[]
  soft: string[]
  bad: string[]
  failures: string[]
}

async function selectionAt(
  browser: Browser,
  viewport: (typeof VIEWPORTS)[number],
): Promise<ViewportSelection> {
  // A FRESH context per viewport: reloading the same page after a resize
  // serves every variant from the memory cache, and the network log would then
  // report the first viewport's choice three times.
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  try {
    const log = recordPage(page)
    await page.goto('/', { waitUntil: 'load' })
    await page.waitForLoadState('networkidle').catch(() => undefined)
    return {
      key: viewport.key,
      sharp: [...new Set(log.heroRequests.filter((url) => ANY_SHARP_REQUEST.test(url)))],
      soft: [...new Set(log.heroRequests.filter((url) => ANY_SOFT_REQUEST.test(url)))],
      bad: log.badResponses,
      failures: log.failures,
    }
  } finally {
    await context.close()
  }
}

const cropOf = (url: string): 'p' | 'l' | null =>
  PORTRAIT_REQUEST.test(url) || SOFT_PORTRAIT_REQUEST.test(url)
    ? 'p'
    : LANDSCAPE_REQUEST.test(url) || SOFT_LANDSCAPE_REQUEST.test(url)
      ? 'l'
      : null

const widthOf = (url: string): number => {
  const match = /hero-[pl]-(\d+)\./.exec(url)
  return match?.[1] ? Number.parseInt(match[1], 10) : 0
}

test.describe('hero photo: art direction', () => {
  test('each viewport downloads exactly one rendition of exactly one crop', async ({
    browser,
  }, testInfo) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)
    testInfo.setTimeout(120_000)

    const selections: ViewportSelection[] = []
    for (const viewport of VIEWPORTS) selections.push(await selectionAt(browser, viewport))

    await testInfo.attach('hero-variant-selection.txt', {
      body: selections
        .map((s) => `${s.key}: sharp ${JSON.stringify(s.sharp)}  soft ${JSON.stringify(s.soft)}`)
        .join('\n'),
      contentType: 'text/plain',
    })

    for (const selection of selections) {
      expect(
        selection.bad,
        `Hero asset requests came back >= 400 at ${selection.key}:\n  ${selection.bad.join('\n  ')}`,
      ).toEqual([])
      expect(
        selection.failures,
        `Hero asset requests failed outright at ${selection.key}:\n  ${selection.failures.join('\n  ')}`,
      ).toEqual([])

      /* ONE rendition, once. Two distinct sharp URLs means the page paid for
         the same picture twice — both formats, or two rungs, or both crops.
         This is the bandwidth defect the art-directed ladder exists to prevent
         and computed style cannot see it. */
      expect(
        selection.sharp,
        `${selection.key} downloaded ${selection.sharp.length} distinct sharp renditions; ` +
          `exactly one is correct:\n  ${selection.sharp.join('\n  ')}`,
      ).toHaveLength(1)
      expect(
        selection.soft,
        `${selection.key} downloaded ${selection.soft.length} distinct soft bitmaps; exactly ` +
          `one is correct:\n  ${selection.soft.join('\n  ')}\nThe soft copy is the baked blur ` +
          'the cross-fade resolves from — one per crop, and the viewport takes only its own.',
      ).toHaveLength(1)

      /* The two copies must be the SAME crop. A landscape sharp under a
         portrait blur cross-fades between two different framings. */
      const sharpCrop = cropOf(selection.sharp[0] ?? '')
      const softCrop = cropOf(selection.soft[0] ?? '')
      expect(
        sharpCrop,
        `${selection.key}: the sharp and soft copies are different crops — sharp ` +
          `${selection.sharp[0]} (${sharpCrop}) vs soft ${selection.soft[0]} (${softCrop}). ` +
          'The cross-fade would resolve one framing into another.',
      ).toBe(softCrop)
    }

    /* AVIF FIRST. Chromium supports AVIF, so if the ladder ships one and the
       browser still took the WebP, the <source type="image/avif"> ordering is
       wrong and every visitor pays ~30% more bytes than the ladder cost to
       build. Gated on an AVIF existing at all: a WebP-only ladder is a
       legitimate (if worse) pipeline decision, and this test must report the
       ordering defect, not relitigate the format choice. */
    const shipsAvif = heroAssetFiles().some((name) => name.endsWith('.avif'))
    if (shipsAvif) {
      const notAvif = selections.filter((s) => !(s.sharp[0] ?? '').endsWith('.avif'))
      expect(
        notAvif.map((s) => `${s.key} -> ${s.sharp[0]}`),
        'The ladder ships AVIF but Chromium selected a different format:\n  ' +
          `${notAvif.map((s) => `${s.key} -> ${s.sharp[0]}`).join('\n  ')}\n` +
          'The AVIF <source> must precede the WebP <source> inside each <picture>; a browser ' +
          'takes the first source it can decode.',
      ).toEqual([])
    }

    /* MONOTONIC LADDER. Whatever breakpoint the design picked, a narrower
       viewport must never download MORE pixels than a wider one. This is the
       phone-pays-for-the-desktop-file bug stated in a form that does not
       hard-code a breakpoint the design territory owns. */
    const widths = selections.map((s) => ({ key: s.key, width: widthOf(s.sharp[0] ?? '') }))
    for (let i = 1; i < widths.length; i += 1) {
      const narrow = widths[i - 1]
      const wide = widths[i]
      if (!narrow || !wide) continue
      expect(
        narrow.width,
        `A ${narrow.key}px viewport downloaded a ${narrow.width}px rendition while ${wide.key}px ` +
          `took ${wide.width}px. The narrower viewport is paying for more pixels than the wider ` +
          'one — the srcset width descriptors or the sizes attribute are inverted.',
      ).toBeLessThanOrEqual(wide.width)
    }

    /* THE EXTREMES ARE ART-DIRECTED. The middle rung (768) is left to the
       design territory: whether a tablet takes the portrait or the landscape
       crop is a composition judgement. The ends are not a judgement — a
       375x812 box is portrait and a 1280x800 box is landscape, and serving one
       crop to both is art direction that only pretends to exist. */
    const shipsBothCrops =
      heroAssetFiles().some((name) => /^hero-p-\d+\./.test(name)) &&
      heroAssetFiles().some((name) => /^hero-l-\d+\./.test(name))
    if (shipsBothCrops) {
      const phone = selections.find((s) => s.key === '375')
      const desktop = selections.find((s) => s.key === '1280')
      expect(
        cropOf(phone?.sharp[0] ?? ''),
        `A 375x812 phone took ${phone?.sharp[0]} — not the portrait crop. Two crops are shipped; ` +
          'serving the landscape band into a tall box lets the browser choose the framing with ' +
          'object-fit instead of the design choosing it.',
      ).toBe('p')
      expect(
        cropOf(desktop?.sharp[0] ?? ''),
        `A 1280x800 desktop took ${desktop?.sharp[0]} — not the landscape crop.`,
      ).toBe('l')
    }
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §3 · THE TWO-COPY CONTRACT
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('hero photo: the sharp/soft two-copy contract', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)
    // The contract under test is the MOTION path; under `reduce` the sharp
    // copy is pinned and none of this would measure anything.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/', { waitUntil: 'load' })
    await page.waitForLoadState('networkidle').catch(() => undefined)
  })

  test('the soft copy is a baked bitmap and nothing in the hero runs a live blur', async ({
    page,
  }) => {
    const layers = await probeHeroLayers(page)

    const soft = layers.filter((layer) => ANY_SOFT_REQUEST.test(layer.url))
    expect(
      soft.map((layer) => `${layer.path} <- ${layer.url}`),
      'No hero layer paints a baked hero-soft-*.webp bitmap. Layers carrying an image: ' +
        JSON.stringify(layers.filter((l) => l.url).map((l) => `${l.path} <- ${l.url}`)) +
        '. The soft copy must be a pre-blurred FILE emitted by scripts/gen-hero-photo.mjs.',
    ).not.toEqual([])

    /* NOTHING in the hero may run a blur at runtime. `filter: blur()` is
       evaluated at rasterisation, so every engine that re-rasters the layer
       pays for it again — the stutter the reference repo measured at 2.6s of
       rasteriser time during a 1.3s scroll, and the banding artefact on
       WebKit's tiled backing. The blur is baked into the file precisely so
       this can be asserted as an absolute. */
    const filtered = layers.filter((layer) => /blur\(/.test(layer.filter))
    expect(
      filtered.map((layer) => `${layer.path} — filter: ${layer.filter}`),
      'A live blur() runs inside the hero:\n  ' +
        filtered.map((layer) => `${layer.path} — ${layer.filter}`).join('\n  ') +
        '\nThe blur must stay baked into hero-soft-*.webp. A runtime filter is the exact ' +
        'rasterisation cost the two-copy architecture exists to avoid, and ' +
        'tests/e2e/hero-scroll-perf.spec.ts is the behavioural gate over the same invariant.',
    ).toEqual([])
  })

  test('the sharp copy is fetched at high priority and eagerly', async ({ page }) => {
    const layers = await probeHeroLayers(page)
    const sharpImages = layers.filter(
      (layer) => layer.tag === 'img' && ANY_SHARP_REQUEST.test(layer.url),
    )

    expect(
      sharpImages.map((layer) => layer.path),
      'No <img> inside the hero paints a sharp hero-p-*/hero-l-* variant. A CSS background ' +
        'cannot carry fetchpriority and is invisible to the preload scanner, so the picture ' +
        'starts downloading only after the stylesheet resolves. It must be a real <img>.',
    ).not.toEqual([])

    const highPriority = sharpImages.filter((layer) => layer.fetchPriority.toLowerCase() === 'high')
    expect(
      highPriority.map((layer) => layer.path),
      'The sharp hero photo does not carry fetchPriority="high". Found: ' +
        JSON.stringify(
          sharpImages.map((l) => `${l.path} fetchpriority="${l.fetchPriority}" loading="${l.loading}"`),
        ) +
        '\nWithout it the picture queues behind the page\'s other subresources at default ' +
        'priority — it is the largest byte in the first viewport and it should be first.',
    ).not.toEqual([])

    const lazy = sharpImages.filter((layer) => layer.loading.toLowerCase() === 'lazy')
    expect(
      lazy.map((layer) => layer.path),
      `The sharp hero photo is loading="lazy":\n  ${lazy.map((l) => l.path).join('\n  ')}\n` +
        'It is above the fold by construction; lazy-loading it defers the one image the ' +
        'visitor is guaranteed to see.',
    ).toEqual([])
  })

  test('the sharp copy cross-fades with --focus on a layer promoted via transform', async ({
    page,
  }) => {
    const primed = await pinFocus(page, 0)
    expect(
      primed,
      'Nothing ever wrote --focus onto <html>. The photo ladder shipped but the scroll driver ' +
        'that cross-fades the two copies did not, so the soft bitmap is dead weight and the ' +
        'hero is a static picture. (If the design deliberately dropped the cross-fade, this ' +
        'test and the soft half of the ladder should be retired together — not left green.)',
    ).toBe(true)

    const atZero = await probeHeroLayers(page)
    await pinFocus(page, 1)
    const atOne = await probeHeroLayers(page)
    expect(atZero.length, 'the hero subtree changed shape between the two probes').toBe(atOne.length)

    /* The cross-fading element: opaque at --focus 0 (the state the visitor
       arrives in and dwells in), hidden at --focus 1. */
    const fading = atZero
      .map((zero, index) => ({ zero, one: atOne[index] }))
      .filter((pair): pair is { zero: HeroLayer; one: HeroLayer } => pair.one !== undefined)
      .filter(({ zero, one }) => zero.opacity >= 0.99 && one.opacity <= 0.05)

    expect(
      fading.map(({ zero }) => zero.path),
      'No hero element cross-fades with --focus (opacity ~1 at --focus:0, ~0 at --focus:1). ' +
        'Either the sharp copy no longer reads --focus, or the fade runs in the other ' +
        'direction — arriving on the blur, which is the murk state the reference repo ' +
        'measured, had rejected by its client, and inverted.',
    ).not.toEqual([])

    /* The fader must be, or contain, the sharp photograph. */
    const indexOf = new Map(atZero.map((layer, index) => [layer, index]))
    const showsPhoto = fading.some(({ zero }) => {
      const start = indexOf.get(zero) ?? 0
      // Probes are in document order, so a container's descendants follow it.
      return (
        ANY_SHARP_REQUEST.test(zero.url) ||
        atZero.slice(start).some((layer) => ANY_SHARP_REQUEST.test(layer.url))
      )
    })
    expect(
      showsPhoto,
      'The --focus cross-fader exists but no sharp hero variant is painted by it or below it. ' +
        `The fade is hiding something other than the photograph. Fading: ${JSON.stringify(
          fading.map(({ zero }) => `${zero.path} <- ${zero.url || '(no image)'}`),
        )}`,
    ).toBe(true)

    /* PROMOTED, and promoted on `transform`.
       `transform` promotes the layer, which is all the opacity cross-fade
       needs to composite. `opacity` additionally tells the compositor to keep
       the picture LIVE, so a multi-megapixel photograph is rasterised even
       while it sits invisible — the reference repo measured that arm at 1.03x
       against 1.00x, and the hint on the soft layer at 2.54x, catastrophically
       unstable. The behavioural gate is hero-scroll-perf.spec.ts; this is the
       structural assertion that names the property when it fails. */
    const promoted = fading.filter(({ zero }) => /transform/.test(zero.willChange))
    expect(
      promoted.map(({ zero }) => zero.path),
      'The --focus-reading sharp layer is not promoted with will-change: transform. Found: ' +
        JSON.stringify(fading.map(({ zero }) => `${zero.path} (will-change: ${zero.willChange})`)) +
        '\nUn-promoted, every per-frame --focus write repaints the whole background subtree. ' +
        'The hint must be on `transform`, not `opacity`.',
    ).not.toEqual([])
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §4 · REDUCED MOTION
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('hero: prefers-reduced-motion', () => {
  // Set on the CONTEXT rather than via page.emulateMedia, so the preference is
  // in force for the document's very first frame — the same idiom
  // reduced-motion.spec.ts uses, and for the same reason: a preference applied
  // after navigation would let the un-reduced path run once before it bites.
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('the scroll driver never writes --focus under reduce', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' })
    await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' })

    /* Scroll the whole hero span. Under `reduce` the driver must either not
       write --focus at all or hold it at 0 — the CSS fallback var(--focus, 0)
       then pins the hero in its finished, sharp state without a cross-fade. */
    const observed = await page.evaluate(async () => {
      const raf = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))
      const seen: string[] = []
      for (let i = 0; i <= 12; i += 1) {
        window.scrollTo(0, Math.round((window.innerHeight * i) / 12))
        await raf()
        await raf()
        seen.push(document.documentElement.style.getPropertyValue('--focus').trim())
      }
      window.scrollTo(0, 0)
      return seen
    })

    const moved = observed.filter((value) => value !== '' && Number.parseFloat(value) > 0.001)
    expect(
      moved,
      `--focus moved under prefers-reduced-motion: reduce. Values seen while scrolling the ` +
        `hero span: ${JSON.stringify(observed)}.\nThe cross-fade and the background zoom are ` +
        'both driven by this property; writing it under `reduce` animates the page for exactly ' +
        'the visitors who asked it not to.',
    ).toEqual([])
  })

  test('nothing in the hero zooms or cross-fades while scrolling under reduce', async ({
    page,
  }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)

    await page.goto('/', { waitUntil: 'load' })
    await page.waitForLoadState('networkidle').catch(() => undefined)
    await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' })

    const sample = async (): Promise<string[]> =>
      (await probeHeroLayers(page)).map(
        (layer) => `${layer.path}|${layer.transform}|${layer.opacity.toFixed(3)}`,
      )

    const atTop = await sample()
    await page.evaluate(async () => {
      const raf = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))
      window.scrollTo(0, Math.round(window.innerHeight * 0.85))
      await raf()
      await raf()
    })
    const scrolled = await sample()

    const changed = atTop
      .map((before, index) => ({ before, after: scrolled[index] ?? '(gone)' }))
      .filter((pair) => pair.before !== pair.after)

    expect(
      changed.map((pair) => `${pair.before}  ->  ${pair.after}`),
      'Hero layers changed transform or opacity while scrolling under ' +
        'prefers-reduced-motion: reduce:\n  ' +
        changed.map((pair) => `${pair.before}\n     -> ${pair.after}`).join('\n  ') +
        '\nUnder `reduce` the hero must be static and finished: no cross-fade, no background ' +
        'zoom. Both are scroll-linked, and a scroll-linked zoom behind text is a vestibular ' +
        'trigger, not a flourish.',
    ).toEqual([])
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §5 · LARGEST CONTENTFUL PAINT
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * ── LCP BUDGETS ──────────────────────────────────────────────────────────
 *
 * THE PROFILE is Lighthouse's mobile default, applied rather than simulated:
 * 375x812, 4x CPU throttling, 1.6Mbit down / 150ms RTT. Applied throttling
 * measures worse than Lantern's simulation, so these numbers are NOT
 * comparable to a Lighthouse score and the 2.5s field threshold is not the
 * right ceiling for them.
 *
 * WHAT THIS GATE IS FOR. It is a regression gate on the PHOTOGRAPH, anchored
 * on the measured no-photo baseline: the picture may cost the first paint some
 * time, and it may not cost it much. Anchoring on the baseline is what makes
 * the number mean something specific; anchoring on 2.5s would have made this
 * test red on the day it was written, for a page with no photograph in it,
 * which is a gate about the throttling profile rather than about the feature.
 *
 * CALIBRATION (this tree, 2026-09-02, photo absent, `next start`, n=5):
 *   2628 · 2636 · 2640 · 2664 · 2668 ms — a 40ms spread, 1.5%.
 * The LCP element was the hero statement `<p>` in every run (see below).
 * Budget 3000ms ≈ the worst baseline + 12%: a 200KB AVIF is about one second
 * of transfer on this link, so a photograph that pushes the TEXT past three
 * seconds is one that preempted the text — exactly the defect worth catching.
 *
 * DEVELOPMENT (same profile, `next dev`, n=3): 7200 · 7256 · 8004 ms. Dev
 * compiles on demand and ships an unminified bundle; the number says nothing
 * about production, but asserting a calibrated ceiling still catches a change
 * that makes the page an order of magnitude slower, which is the only thing
 * worth catching in a dev run. Budget 10000ms ≈ the worst run + 25%, the
 * wider margin reflecting the wider spread (11% vs 1.5%).
 *
 * Both are asserted; neither is a placeholder. Re-calibrate deliberately when
 * the photograph lands — record the new baseline here, do not raise the number
 * to green a run.
 */
const LCP_BUDGET_MS = {
  production: 3_000,
  development: 10_000,
} as const

test.describe('hero: largest contentful paint on a throttled phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the LCP element is in the hero and lands inside its budget', async ({
    page,
    context,
  }, testInfo) => {
    testInfo.setTimeout(120_000)

    const client = await context.newCDPSession(page)
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })

    try {
      await page.goto('/', { waitUntil: 'load' })

      const entry = await page.evaluate(
        () =>
          new Promise<{
            startTime: number
            url: string
            tag: string
            inHero: boolean
            path: string
            size: number
          } | null>((resolve) => {
            try {
              let latest: (PerformanceEntry & { url?: string; element?: Element | null; size?: number }) | undefined
              const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries()
                latest = (entries[entries.length - 1] as typeof latest) ?? latest
              })
              observer.observe({ type: 'largest-contentful-paint', buffered: true })
              setTimeout(() => {
                observer.disconnect()
                if (!latest) {
                  resolve(null)
                  return
                }
                const hero = document.getElementById('top')
                const element = latest.element ?? null
                const cls =
                  element && typeof element.className === 'string' && element.className.trim()
                    ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}`
                    : ''
                resolve({
                  startTime: latest.startTime,
                  url: latest.url ?? '',
                  tag: element?.tagName.toLowerCase() ?? '(none)',
                  inHero: Boolean(element && hero?.contains(element)),
                  path: element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${cls}` : '(none)',
                  size: latest.size ?? 0,
                })
              }, 4_000)
            } catch {
              resolve(null)
            }
          }),
      )

      /* An unobservable LCP is a browser fact, not a page fact. Skipping is
         honest; asserting on a guess is not. */
      test.skip(entry === null, 'no largest-contentful-paint entry was observable in this browser')
      if (!entry) return

      /* WHICH ELEMENT IS THE LCP — measured, never assumed. Chrome excludes
         images that cover the whole viewport from LCP candidacy (M112), which
         is exactly the geometry a full-bleed hero photograph has. So the
         photograph very probably is NOT the LCP even once it lands, and the
         hero's H1 is. This attachment is the empirical record of which it
         actually was on this run; the assertion below only requires that the
         LCP is something in the first viewport. */
      await testInfo.attach('hero-lcp.txt', {
        body:
          `LCP ${entry.startTime.toFixed(0)}ms — <${entry.tag}> ${entry.path}` +
          `${entry.url ? ` (${entry.url})` : ''}\n` +
          `area ${entry.size}px², inside the hero: ${entry.inHero}\n` +
          `photo landed: ${photoLanded}\n` +
          'Note: Chrome excludes full-viewport images from LCP candidacy, so a hero photograph ' +
          'that covers the viewport will not appear here even when it is the heaviest byte.',
        contentType: 'text/plain',
      })

      expect(
        entry.inHero,
        `The LCP element is <${entry.tag}> ${entry.path}, which is NOT inside the hero. ` +
          'Something below the first viewport is painting larger than everything in it — worth ' +
          'a real investigation, not a threshold tweak.',
      ).toBe(true)

      /* WHICH SERVER IS THIS. Verified by inspection against both, on this
         tree: `next dev` emits the dev-tools chunk and serves node_modules
         un-bundled (`node_modules_next_dist_client_….js`), while `next start`
         hashes every chunk name to an opaque string. The two script lists have
         no overlap in shape, which is what makes this cheap and stable. */
      const isDevServer = await page.evaluate(() =>
        Array.from(document.querySelectorAll('script[src]')).some((script) =>
          /next-devtools|node_modules_next_dist/.test((script as HTMLScriptElement).src),
        ),
      )
      const budget = isDevServer ? LCP_BUDGET_MS.development : LCP_BUDGET_MS.production

      expect(
        entry.startTime,
        `LCP was ${entry.startTime.toFixed(0)}ms against a ${budget}ms budget for the ` +
          `${isDevServer ? 'development' : 'production'} server, on a 4x-throttled CPU over a ` +
          `1.6Mbit/150ms link at 375x812. The LCP element was <${entry.tag}> ${entry.path}.\n` +
          'If a hero photograph landed in this run, the first thing to check is whether the ' +
          'sharp copy is competing with the text for bandwidth: it should carry ' +
          'fetchPriority="high" and the ladder should be serving the phone its own crop.',
      ).toBeLessThanOrEqual(budget)
    } finally {
      await client.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined)
      await client.detach().catch(() => undefined)
    }
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   §6 · THE PHOTOGRAPH MUST COVER THE BAND IT IS THE BACKGROUND OF
   ════════════════════════════════════════════════════════════════════════════

   ── THE DEFECT, MEASURED RATHER THAN DESCRIBED ────────────────────────────

   Four rounds of gradient work went into this hero against one complaint that
   never went away:

       "it still feel very black and dark ... i can still feel like there is a
        dark blur background around the text that is cover over the background
        image in the back ... for our page currently still that the black part
        around the text still blur the background image"

   Every one of those four rounds tuned the VEIL. None of them could have
   worked, because in the region the owner is pointing at there is no
   photograph for a veil to be tuned against. Measured on the live page,
   Chromium, dpr 1, `--focus` pinned to 0 (2026-09-03):

       viewport    band       photo box   bare region        veil alpha
                                                             in the bare region
       375x812     1685.2px    860.7px    824px  48.9%       1.0000
       768x1024    1285.2px   1085.4px    200px  15.6%       1.0000
       1280x800    1306.2px    848.0px    458px  35.1%       1.0000
       1600x900    1338.5px    954.0px    384px  28.7%       1.0000

   The alpha is not "high". It is EXACTLY ONE, recovered from a black-field /
   white-field probe pair, and the mean composited pixel in that region is
   22.67 sRGB — which is #14161A to the byte. It is not a veil over a
   photograph. It is the flat ink ground, because the photograph's box stops
   at `min(100%, 106svh)` while the band goes on for another half viewport of
   copy. At 375px the photograph covers 51% of its own band and 23 of the 43
   text runs in the hero have nothing but ground behind them.

   ── WHY THE REFERENCE DOES NOT HAVE THIS PROBLEM ──────────────────────────

   /Users/dcnguyen060899/Downloads/MAVTERRAS's hero is `height: 100svh` and its photograph's box is
   `position: absolute; inset: 0`. Band and picture are THE SAME BOX, by
   construction, at every viewport — measured 812/812, 1024/1024, 800/800,
   900/900, hole 0px, four times out of four. It cannot develop this defect,
   and no amount of gradient work on our side reproduces a property that comes
   from the geometry rather than from the paint.

   ── THE CONTRACT, AND WHY IT IS STATED THIS WAY ───────────────────────────

   A background image is a background OF something. If the band is taller than
   the picture, the remainder is not "less photographic" — it is a different
   design, and the seam between the two is exactly what the owner keeps
   describing as a plate.

   The assertion is written against the UNION OF THE HERO'S <img> RECTS,
   clipped by every `overflow: clip|hidden|auto|scroll` ancestor, rather than
   against a class name. That is deliberate: the fix for this belongs to
   `components/site/hero-scrim.module.css` (`.frame`) and/or
   `components/site/hero.tsx`, and either of them may restructure the wrapper.
   What may NOT change is where photograph pixels actually land, and that is
   what this measures.

   THIS SECTION IS EXPECTED TO BE RED UNTIL THE COVERAGE FIX LANDS. It is not
   a stub and it has no tolerance to be widened: 1px of slack for subpixel
   layout is the whole allowance. Do not "fix" it by shrinking the band —
   deleting the copy is not a design.
   ════════════════════════════════════════════════════════════════════════════ */

/** The extent, in document coordinates, that photograph pixels actually reach. */
interface PhotoExtent {
  band: { top: number; bottom: number; height: number; width: number }
  /** Union of the hero <img> rects after every clipping ancestor is applied. */
  photo: { top: number; bottom: number; height: number } | null
  /** Text runs inside the band, with the role colour they are painted in. */
  runs: {
    text: string
    top: number
    bottom: number
    left: number
    width: number
    color: string
    fontSizePx: number
  }[]
}

/**
 * Reads the band's box, the photograph's painted extent and every text run.
 *
 * The clip walk matters: `.frame` sets `overflow: clip`, so an <img> sized to
 * its parent reports the parent's rect anyway — but a future wrapper that
 * oversizes the image (an exit zoom, a parallax inset) would report an extent
 * the visitor never sees. Intersecting with each clipping ancestor is what
 * keeps this measuring PAINT rather than layout.
 */
const readPhotoExtent = (): PhotoExtent => {
  const band = document.querySelector('#top')
  if (band === null) throw new Error('#top is not in the document')
  const bandRect = band.getBoundingClientRect()

  const clips = (el: Element): DOMRect => {
    let rect = el.getBoundingClientRect()
    for (let node = el.parentElement; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node)
      const clipped = /clip|hidden|auto|scroll/.test(style.overflow + style.overflowY)
      if (!clipped) continue
      const box = node.getBoundingClientRect()
      const top = Math.max(rect.top, box.top)
      const bottom = Math.min(rect.bottom, box.bottom)
      const left = Math.max(rect.left, box.left)
      const right = Math.min(rect.right, box.right)
      rect = new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
    }
    return rect
  }

  let top = Infinity
  let bottom = -Infinity
  let seen = false
  for (const img of band.querySelectorAll('img')) {
    // A <picture> whose <source>s all failed still leaves an <img> with no
    // decoded pixels; it paints nothing and must not count as coverage.
    if (img.naturalWidth === 0) continue
    const rect = clips(img)
    if (rect.height <= 0 || rect.width <= 0) continue
    seen = true
    top = Math.min(top, rect.top)
    bottom = Math.max(bottom, rect.bottom)
  }

  const runs: PhotoExtent['runs'] = []
  const walker = document.createTreeWalker(band, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim()
    if (text === '') continue
    const parent = node.parentElement
    if (parent === null) continue
    const style = getComputedStyle(parent)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) {
      if (rect.width < 1 || rect.height < 1) continue
      runs.push({
        text: text.slice(0, 48),
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        color: style.color,
        fontSizePx: Math.round(Number.parseFloat(style.fontSize) * 10) / 10,
      })
    }
  }

  return {
    band: {
      top: bandRect.top,
      bottom: bandRect.bottom,
      height: bandRect.height,
      width: bandRect.width,
    },
    photo: seen ? { top, bottom, height: bottom - top } : null,
    runs,
  }
}

/** Every viewport the coverage contract is asserted at. */
const COVERAGE_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1600, height: 900 },
] as const

/**
 * Subpixel slack, and nothing more.
 *
 * `100svh` against a fractional band height rounds differently in layout and
 * in paint; one CSS pixel absorbs that. It does NOT absorb a design decision,
 * and raising it is how this gate stops meaning anything — the smallest hole
 * measured on the shipped page is 200px.
 */
const COVERAGE_SLACK_PX = 1

test.describe('hero photo: the photograph covers the band', () => {
  for (const viewport of COVERAGE_VIEWPORTS) {
    const label = `${viewport.width}x${viewport.height}`

    test(`no region of the hero band is without photograph at ${label}`, async ({ browser }) => {
      test.skip(!photoLanded, NOT_LANDED_MESSAGE)

      const context = await browser.newContext({ viewport: { ...viewport } })
      const page = await context.newPage()
      try {
        await page.goto('/', { waitUntil: 'load' })
        await page.waitForLoadState('networkidle').catch(() => undefined)
        /* Pin the scroll-linked cross-fade so the extent is the entry state
           rather than whatever frame the driver happened to leave behind. */
        await pinFocus(page, 0)

        const extent = await page.evaluate(readPhotoExtent)

        expect(
          extent.photo,
          'No hero <img> decoded to any pixels, so there is no photograph to measure. ' +
            'That is either a broken ladder (see §2) or the absent-asset path having armed ' +
            'this section wrongly.',
        ).not.toBeNull()

        const photo = extent.photo as NonNullable<PhotoExtent['photo']>
        const hole = extent.band.bottom - photo.bottom
        const runsWithoutPhoto = extent.runs.filter((run) => run.top >= photo.bottom)

        const summary =
          `${label}\n` +
          `  band          ${extent.band.height.toFixed(1)}px  ` +
          `(${(extent.band.height / viewport.height).toFixed(3)} viewports)\n` +
          `  photograph    ${photo.height.toFixed(1)}px  ` +
          `(${(photo.height / viewport.height).toFixed(3)} viewports, ` +
          `${((photo.height / extent.band.height) * 100).toFixed(1)}% of the band)\n` +
          `  BARE REGION   ${hole.toFixed(1)}px  ` +
          `(${((hole / extent.band.height) * 100).toFixed(1)}% of the band)\n` +
          `  text runs with no photograph behind them: ` +
          `${runsWithoutPhoto.length} of ${extent.runs.length}` +
          (runsWithoutPhoto.length === 0
            ? ''
            : `\n    ${runsWithoutPhoto
                .slice(0, 6)
                .map((run) => `"${run.text}" at y ${(run.top - extent.band.top).toFixed(0)}`)
                .join('\n    ')}`)

        expect(
          hole,
          'THE HERO BAND IS TALLER THAN ITS PHOTOGRAPH, AND THE REMAINDER IS BARE GROUND.\n' +
            `${summary}\n\n` +
            'The veil in that region composites at alpha 1.0 over #14161A — there is nothing ' +
            'behind it to make visible, so no gradient change can affect it. This is the ' +
            '"black part around the text" the owner has reported four times.\n' +
            'Territory: components/site/hero-scrim.module.css `.frame` bounds the picture to ' +
            '`min(100%, 106svh)`. The reference hero (/Users/dcnguyen060899/Downloads/MAVTERRAS, read-only) is ' +
            '`height: 100svh` with the picture at `inset: 0` — one box, measured hole 0px at ' +
            'all four viewports.\n' +
            'DO NOT raise COVERAGE_SLACK_PX. Do not shorten the band by deleting copy.',
        ).toBeLessThanOrEqual(COVERAGE_SLACK_PX)

        expect(
          runsWithoutPhoto.map(
            (run) => `"${run.text}" at y ${(run.top - extent.band.top).toFixed(0)} (${run.color})`,
          ),
          'TEXT IN THE HERO IS SITTING ON BARE GROUND RATHER THAN ON THE PHOTOGRAPH.\n' +
            `${summary}\n\n` +
            'Every colour in this band is published against a flat #14161A AND against the ' +
            'photograph; a run that has neither is a run in a third, undesigned state. ' +
            'Territory: components/site/hero.tsx and components/site/hero-scrim.module.css.',
        ).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
})

/* ════════════════════════════════════════════════════════════════════════════
   §7 · REGRESSION GUARDS FROM THE EARLIER ROUNDS
   ════════════════════════════════════════════════════════════════════════════

   Four rounds of veil work have already been reverted once each. These are the
   properties that were bought in those rounds and that a coverage or depth fix
   is most likely to take back out, held here so that "the photo reads better
   now" cannot quietly mean "and the evidence moved below the fold".

   MEASURED ON THE SHIPPED PAGE at 1280x800 (2026-09-03), y relative to the top
   of the band, which is also the top of the document:

       0.585                         y  472   48px   --fg-accent, remapped
       P@1 0.487                     y  571   13px   --fg
       Winner … / 195 neurons …      y  690   13px   --fg

   All three clear the 800px fold with 110px to spare. The AI-disclosure line
   ("an AI-generated composite, not a photograph of the campus") sits at y 1062
   and is REQUIRED whenever the photograph renders — it is the honesty claim
   the whole page is built on, and it is generated from the corpus, so it
   disappears silently if the caption record is dropped.
   ════════════════════════════════════════════════════════════════════════════ */

test.describe('hero: the evidence the earlier rounds bought', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('all three hero figures render above the fold at 1280x800', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' })
    await page.waitForLoadState('networkidle').catch(() => undefined)

    const extent = await page.evaluate(readPhotoExtent)
    /* The figures are matched on the numerals themselves rather than on a
       component class: they come from the corpus (`figureAt`), so the exact
       strings are the contract the corpus gate already enforces, and a
       component rename must not silently drop this guard. */
    const wanted = [
      { name: 'the P@1 headline figure', match: /^0\.585$/ },
      { name: 'the retrieval floor', match: /P@1\s+0\.487/ },
      { name: 'the CAUSE / barn-owl readouts', match: /(Winner, Graduate Division|neurons ·)/ },
    ]

    const missing: string[] = []
    const belowFold: string[] = []
    for (const { name, match } of wanted) {
      const hits = extent.runs.filter((run) => match.test(run.text))
      if (hits.length === 0) {
        missing.push(name)
        continue
      }
      const top = Math.min(...hits.map((run) => run.top - extent.band.top))
      if (top >= 800) belowFold.push(`${name} at y ${top.toFixed(0)}`)
    }

    expect(
      missing,
      'A hero figure stopped rendering. These are corpus-backed numbers, not decoration — ' +
        'if one is gone the corpus record behind it was dropped or renamed. ' +
        'Territory: components/site/hero.tsx and the corpus.',
    ).toEqual([])

    expect(
      belowFold,
      'A HERO FIGURE FELL BELOW THE FOLD at 1280x800.\n  ' +
        belowFold.join('\n  ') +
        '\nAll three were above it before this change (y 472 / 571 / 690 against an 800px ' +
        'fold). Growing the band — extra headroom, a taller photograph box, more padding — ' +
        'pushes the evidence out of the first screen, which is the one thing this hero is ' +
        'for. Territory: components/site/hero-scrim.module.css and components/site/hero.tsx.',
    ).toEqual([])
  })

  test('the AI-disclosure line renders whenever the photograph does', async ({ page }) => {
    test.skip(!photoLanded, NOT_LANDED_MESSAGE)

    await page.goto('/', { waitUntil: 'load' })
    await page.waitForLoadState('networkidle').catch(() => undefined)

    const extent = await page.evaluate(readPhotoExtent)
    const disclosure = extent.runs.filter((run) =>
      /AI-generated|AI generated|not a photograph/i.test(run.text),
    )

    expect(
      disclosure.length,
      'THE AI-DISCLOSURE LINE IS MISSING WHILE THE PHOTOGRAPH IS RENDERING.\n' +
        'The hero background is an AI-generated composite and the page says so, in the hero, ' +
        'next to the picture. That line is generated from the corpus caption record ' +
        '(`lib/corpus/hero-asset`), so it vanishes silently if the record is dropped or the ' +
        'manifest stops reporting `present`. Every text run currently in the band:\n  ' +
        extent.runs.map((run) => run.text).join('\n  ') +
        '\nTerritory: components/site/hero.tsx and lib/corpus/hero-asset.',
    ).toBeGreaterThan(0)
  })
})
