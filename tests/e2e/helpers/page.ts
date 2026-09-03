import type { Page } from '@playwright/test'

/**
 * Browser-side probes shared by the specs.
 *
 * Everything here returns RAW measurements — computed colour strings, rectangles,
 * attribute values. No assertion and no WCAG maths happens inside the page, so
 * the judgement lives in Node where it is readable in a failure message and
 * testable on its own (helpers/color.ts).
 *
 * `collectTextSamples` and `findHorizontalOverflowers` are ported from the
 * reference repo (REF/tests/e2e/helpers/page.ts) with their hit-testing and
 * cheap-geometry-filter tricks intact; both were hard-won there and neither is
 * obvious. The ground-context probes below are new — they have no counterpart
 * in the reference, because the reference has no `[data-ground]` mechanism.
 */

/* ════════════════════════════════════════════════════════════════════════════
   Motion control
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Kills every transition and animation, and forces the `<Reveal>` end state.
 *
 * Without it a colour sweep can sample an element mid-transition and read an
 * interpolated colour no design token ever had — a flaky, unreproducible
 * contrast failure. And on a loaded CI runner hydration can finish AFTER the
 * scroll walk has already passed a band, so its IntersectionObserver never
 * fires and `.rv` content stays at `opacity: 0` — structure that exists but has
 * not revealed.
 *
 * Every caller of this asserts CONTENT, not animation. The reveal machinery has
 * its own coverage in reduced-motion.spec.ts, which deliberately does NOT use
 * this helper.
 */
export async function freezeMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition: none !important;
      animation: none !important;
      scroll-behavior: auto !important;
    }
    .rv { opacity: 1 !important; transform: none !important; }
    .drawline, .threshold-rule { transform: scaleX(1) !important; }`,
  })
  await page.waitForTimeout(50)
}

/**
 * Walks the page in viewport-sized steps so lazily-revealed content mounts,
 * then returns to the top.
 *
 * The whole walk happens inside ONE `evaluate`; a round-trip per step is what
 * turns this into a 45-second test on a tall 375px layout.
 */
export async function scrollThroughPage(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' })
  await page.evaluate(async () => {
    const pause = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, ms)
      })

    const step = Math.max(240, Math.floor(window.innerHeight * 0.9))
    const limit = Math.min(document.documentElement.scrollHeight, step * 40)

    for (let y = 0; y < limit; y += step) {
      window.scrollTo(0, y)
      await pause(40)
    }
    window.scrollTo(0, document.documentElement.scrollHeight)
    await pause(120)
    window.scrollTo(0, 0)
    await pause(80)
  })
}

/* ════════════════════════════════════════════════════════════════════════════
   Ground contexts — the design system's central mechanism
   ════════════════════════════════════════════════════════════════════════════ */

export interface GroundNode {
  /** The literal `data-ground` attribute value, exactly as authored. */
  ground: string
  tag: string
  /** True when this is a `<Band>` — the only thing that renders `<section data-ground>`. */
  isBand: boolean
  id: string
  /** A short CSS-ish path, for failure messages. */
  path: string
  /** The nine ground-dependent roles, as the browser resolved them HERE. */
  tokens: Record<string, string>
  /** The element's own painted background, for the token-vs-paint cross-check. */
  backgroundColor: string
}

/**
 * The nine roles every `[data-ground]` block in app/globals.css must define,
 * plus the three surface roles. A component reads exactly these and nothing
 * else; a ground that leaves one undefined resolves it to the INHERITED value
 * of whatever band it landed inside, which is not a visible failure — it is a
 * silently wrong colour that still passes the build.
 */
export const GROUND_ROLES = [
  '--ground',
  '--ground-sunk',
  '--surface-pressed',
  '--fg',
  '--fg-muted',
  '--fg-accent',
  '--fg-accent-display',
  '--fg-pressed',
  '--rule',
  '--edge',
  '--focus-ring',
  '--fg-error',
] as const

export async function collectGrounds(page: Page): Promise<GroundNode[]> {
  return page.evaluate((roles) => {
    const describe = (el: Element): string => {
      const bits: string[] = []
      let node: Element | null = el
      let depth = 0
      while (node && depth < 3) {
        const id = node.id ? `#${node.id}` : ''
        const cls =
          typeof node.className === 'string' && node.className.trim()
            ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        bits.unshift(`${node.tagName.toLowerCase()}${id}${cls}`)
        node = node.parentElement
        depth += 1
      }
      return bits.join(' > ')
    }

    return Array.from(document.querySelectorAll<HTMLElement>('[data-ground]')).map((el) => {
      const style = getComputedStyle(el)
      const tokens: Record<string, string> = {}
      for (const role of roles) tokens[role] = style.getPropertyValue(role).trim()
      return {
        ground: el.getAttribute('data-ground') ?? '',
        tag: el.tagName.toLowerCase(),
        isBand: el.tagName === 'SECTION',
        id: el.id,
        path: describe(el),
        tokens,
        backgroundColor: style.backgroundColor,
      }
    })
  }, GROUND_ROLES as unknown as string[])
}

export interface FormGround {
  path: string
  /** The ground in force at the form: its own, or the nearest ancestor's. */
  effectiveGround: string
  /** Which element supplied it. */
  suppliedBy: string
  fieldCount: number
}

/**
 * Every `<form>` on the page, with the ground actually in force at it.
 *
 * Addendum B ruling R-7: the recruiter panel sits on `paper`, because
 * spec-02 §12 forbids the form from sitting on ink or crimson and the panel
 * contains the form. Dark and coloured forms measurably reduce completion, and
 * that form is the commercial point of the page.
 *
 * The ground is resolved by walking ANCESTORS rather than by hit-testing,
 * because `[data-ground]` is inherited through the CSS cascade — a form nested
 * in an ink band is on ink no matter what is painted behind it.
 */
export async function collectFormGrounds(page: Page): Promise<FormGround[]> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : ''
      const cls =
        typeof el.className === 'string' && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : ''
      return `${el.tagName.toLowerCase()}${id}${cls}`
    }

    return Array.from(document.querySelectorAll<HTMLFormElement>('form')).map((form) => {
      let node: HTMLElement | null = form
      let ground = ''
      let suppliedBy = '(none — the document default, paper)'
      while (node) {
        const value = node.getAttribute('data-ground')
        if (value) {
          ground = value
          suppliedBy = describe(node)
          break
        }
        node = node.parentElement
      }
      return {
        path: describe(form),
        effectiveGround: ground || 'paper',
        suppliedBy,
        fieldCount: form.querySelectorAll('input, textarea, select, button').length,
      }
    })
  })
}

/* ════════════════════════════════════════════════════════════════════════════
   Painted-colour sweep
   ════════════════════════════════════════════════════════════════════════════ */

export interface TextSample {
  tag: string
  /** Trimmed, truncated text — only for failure messages. */
  text: string
  color: string
  /** Nearest opaque backdrop, resolved by hit testing the layer stack. */
  background: string
  /** True when the resolved backdrop came from an image or gradient layer. */
  backgroundIsImage: boolean
  fontSizePx: number
  fontWeight: number
  /** The ground in force at this element, from the nearest `[data-ground]`. */
  ground: string
  path: string
}

/**
 * Every visible element that renders its own text, with the colours actually
 * painted. Elements whose text comes only from children are skipped, so each
 * string is attributed to exactly one element.
 *
 * The backdrop is resolved by HIT TESTING (`document.elementsFromPoint`), not by
 * walking ancestors, because a `position: fixed` or absolutely-positioned layer
 * paints over its DOM ancestors and an ancestor walk reports the wrong backdrop
 * for everything above it.
 */
export async function collectTextSamples(page: Page): Promise<TextSample[]> {
  return page.evaluate(() => {
    interface Rgba {
      r: number
      g: number
      b: number
      a: number
    }

    const parse = (value: string): Rgba | null => {
      if (!value || value === 'transparent') return null
      const match = /rgba?\(([^)]+)\)/.exec(value)
      if (!match?.[1]) return null
      const parts = match[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map((p) => Number.parseFloat(p))
      const [r, g, b, a] = parts
      if (r === undefined || g === undefined || b === undefined) return null
      return { r, g, b, a: a === undefined || Number.isNaN(a) ? 1 : a }
    }

    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const a = top.a + bottom.a * (1 - top.a)
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
        a,
      }
    }

    const describe = (el: Element): string => {
      const bits: string[] = []
      let node: Element | null = el
      let depth = 0
      while (node && depth < 4) {
        const id = node.id ? `#${node.id}` : ''
        const cls =
          typeof node.className === 'string' && node.className.trim()
            ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        bits.unshift(`${node.tagName.toLowerCase()}${id}${cls}`)
        node = node.parentElement
        depth += 1
      }
      return bits.join(' > ')
    }

    const groundAt = (el: Element): string => {
      let node: Element | null = el
      while (node) {
        const value = node.getAttribute('data-ground')
        if (value) return value
        node = node.parentElement
      }
      return 'paper'
    }

    const out: TextSample[] = []

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()

      if (!ownText) continue

      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (Number.parseFloat(style.opacity || '1') < 0.05) continue

      let rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue

      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        rect = el.getBoundingClientRect()
      }

      const x = Math.min(
        Math.max(rect.left + Math.min(rect.width * 0.25, 24), 1),
        window.innerWidth - 2,
      )
      const y = Math.min(Math.max(rect.top + rect.height / 2, 1), window.innerHeight - 2)

      const stack = document.elementsFromPoint(x, y)
      let index = stack.indexOf(el)
      if (index === -1) index = 0

      let accumulated: Rgba | null = null
      let backgroundIsImage = false

      for (let i = index; i < stack.length; i += 1) {
        const layer = stack[i]
        if (!layer) continue
        const layerStyle = getComputedStyle(layer)
        if (layerStyle.backgroundImage && layerStyle.backgroundImage !== 'none') {
          backgroundIsImage = true
          break
        }
        const colour = parse(layerStyle.backgroundColor)
        if (!colour || colour.a === 0) continue
        accumulated = accumulated ? over(accumulated, colour) : colour
        if (accumulated.a >= 0.99) break
      }

      if (!accumulated || accumulated.a < 0.99) {
        const root = parse(getComputedStyle(document.documentElement).backgroundColor)
        const fallback: Rgba = root && root.a >= 0.99 ? root : { r: 255, g: 255, b: 255, a: 1 }
        accumulated = accumulated ? over(accumulated, fallback) : fallback
      }

      out.push({
        tag: el.tagName.toLowerCase(),
        text: ownText.slice(0, 80),
        color: style.color,
        background: `rgb(${Math.round(accumulated.r)}, ${Math.round(accumulated.g)}, ${Math.round(accumulated.b)})`,
        backgroundIsImage,
        fontSizePx: Number.parseFloat(style.fontSize || '16'),
        fontWeight: Number.parseInt(style.fontWeight || '400', 10) || 400,
        ground: groundAt(el),
        path: describe(el),
      })
    }

    window.scrollTo(0, 0)
    return out
  })
}

export interface BorderSample {
  path: string
  ground: string
  /** Which physical side carries the colour being reported. */
  side: string
  color: string
  widthPx: number
  background: string
}

/**
 * Borders and the `<Threshold>` rule: the GRAPHICAL objects that carry meaning.
 *
 * WCAG 1.4.11 applies to a graphical object required to understand the content
 * and to the part of a component that indicates its state — which on this page
 * is the `<Threshold>` 2px accent rule and the pressed-`<Chip>` border. Those
 * need 3:1. `--edge` deliberately does not (globals.css argues why: the records
 * it separates are also separated by space and by type hierarchy), so this
 * sampler reports width and lets the spec decide.
 */
export async function collectBorderSamples(page: Page): Promise<BorderSample[]> {
  return page.evaluate(() => {
    interface Rgba {
      r: number
      g: number
      b: number
      a: number
    }
    const parse = (value: string): Rgba | null => {
      if (!value || value === 'transparent') return null
      const match = /rgba?\(([^)]+)\)/.exec(value)
      if (!match?.[1]) return null
      const parts = match[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map((p) => Number.parseFloat(p))
      const [r, g, b, a] = parts
      if (r === undefined || g === undefined || b === undefined) return null
      return { r, g, b, a: a === undefined || Number.isNaN(a) ? 1 : a }
    }
    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : ''
      const cls =
        typeof el.className === 'string' && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : ''
      return `${el.tagName.toLowerCase()}${id}${cls}`
    }
    const groundAt = (el: Element): string => {
      let node: Element | null = el
      while (node) {
        const value = node.getAttribute('data-ground')
        if (value) return value
        node = node.parentElement
      }
      return 'paper'
    }
    /** Nearest opaque background walking up the tree — borders are painted on the box. */
    const backdropOf = (el: Element): string => {
      let node: Element | null = el.parentElement
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor)
        if (c && c.a >= 0.99) return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
        node = node.parentElement
      }
      return 'rgb(255, 255, 255)'
    }

    const out: BorderSample[] = []
    const sides = ['Top', 'Right', 'Bottom', 'Left'] as const

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 && rect.height < 1) continue

      for (const side of sides) {
        const width = Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`) || '0')
        if (!(width > 0)) continue
        if (style.getPropertyValue(`border-${side.toLowerCase()}-style`) === 'none') continue
        const colour = style.getPropertyValue(`border-${side.toLowerCase()}-color`)
        const parsed = parse(colour)
        if (!parsed || parsed.a === 0) continue
        out.push({
          path: describe(el),
          ground: groundAt(el),
          side: side.toLowerCase(),
          color: colour,
          widthPx: width,
          background: backdropOf(el),
        })
      }
    }
    return out.slice(0, 400)
  })
}

/* ════════════════════════════════════════════════════════════════════════════
   Layout
   ════════════════════════════════════════════════════════════════════════════ */

export interface Overflower {
  path: string
  right: number
  left: number
  width: number
  /**
   * True when the element carries text or is interactive. A decorative graphic
   * bleeding off the edge under `overflow-x: hidden` is a design choice; a
   * paragraph or a button doing it is a bug.
   */
  significant: boolean
}

export async function findHorizontalOverflowers(page: Page): Promise<Overflower[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth
    const out: Overflower[] = []

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      // Cheap geometric filter FIRST. Calling getComputedStyle on every element
      // (and again for every ancestor) is what makes the naive version take
      // tens of seconds on a long mobile layout.
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      /**
       * RIGHTWARD overflow only. Content parked off-screen to the left is the
       * standard visually-hidden idiom — `.skip` in app/globals.css is exactly
       * that — and in an LTR document it creates no horizontal scroll at all.
       * Flagging it would fail the build for doing accessibility correctly.
       */
      if (rect.right <= limit + 1) continue

      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue

      let clipped = false
      let parent: HTMLElement | null = el.parentElement
      while (parent && parent !== document.body) {
        const ps = getComputedStyle(parent)
        if (ps.overflowX === 'auto' || ps.overflowX === 'scroll' || ps.overflowX === 'hidden') {
          clipped = true
          break
        }
        parent = parent.parentElement
      }
      if (clipped) continue

      const describe = (node: Element): string => {
        const id = node.id ? `#${node.id}` : ''
        const cls =
          typeof node.className === 'string' && node.className.trim()
            ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        return `${node.tagName.toLowerCase()}${id}${cls}`
      }

      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim()
      const interactive = el.matches('a, button, input, select, textarea, [role="button"], [tabindex]')

      out.push({
        path: `${el.parentElement ? `${describe(el.parentElement)} > ` : ''}${describe(el)}`,
        right: Math.round(rect.right),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        significant: Boolean(ownText) || interactive,
      })
    }

    return out.slice(0, 20)
  })
}

export interface ScrollMetrics {
  documentScrollWidth: number
  documentClientWidth: number
  bodyScrollWidth: number
  innerWidth: number
}

export async function measureHorizontalScroll(page: Page): Promise<ScrollMetrics> {
  return page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }))
}

/** Reads CSS custom properties off `:root`. */
export async function readRootTokens(page: Page, names: string[]): Promise<Record<string, string>> {
  return page.evaluate((tokenNames) => {
    const style = getComputedStyle(document.documentElement)
    const result: Record<string, string> = {}
    for (const name of tokenNames) result[name] = style.getPropertyValue(name).trim()
    return result
  }, names)
}

/**
 * Visible text of the whole document, with `<script>`, `<style>` and comments
 * removed — the same projection `scripts/verify-corpus.mjs` uses for its C9
 * gate, so the two gates agree about what "on the page" means.
 */
export async function visibleDocumentText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement
    for (const node of Array.from(clone.querySelectorAll('script, style, template'))) {
      node.remove()
    }
    return (clone.textContent ?? '').replace(/\s+/g, ' ')
  })
}
