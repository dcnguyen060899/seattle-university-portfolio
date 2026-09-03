import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * prefers-reduced-motion: reduce
 *
 * `<Reveal>` honours it THREE times on purpose, and the redundancy is the
 * design: in CSS (so it holds before hydration and with JavaScript off), in the
 * component (so the IntersectionObserver is never even constructed), and
 * through `motion-reduce:` on every hover transition in Btn, Chip and Figure. A
 * vestibular trigger that only fires "sometimes" is worse than one that always
 * fires, because the person who needs the setting cannot tell whether it works.
 *
 * EVERY ASSERTION HERE IS PAIRED with its opposite under default motion. That
 * pairing is not ceremony. A reduced-motion suite with no pair passes perfectly
 * on a page that has no animation at all — which is exactly the state this page
 * would be in if `<Reveal>` silently stopped observing, and then the reduce
 * branch would be "working" for the same reason a broken clock is right.
 *
 * NOTE ON THE FIRST TRAP `<Reveal>` CLOSES, which this file also covers: the
 * hidden `.rv` state in app/globals.css is scoped to `@media (scripting:
 * enabled)`. A scroll-reveal that hides content in CSS and reveals it in JS
 * shows a recruiter a blank page whenever the script is blocked, deferred
 * behind a slow network, or still hydrating. `javascriptEnabled: false` below
 * asserts that, and it is not a hypothetical: it is the single most expensive
 * failure a portfolio can have, because the visitor never knows they saw
 * nothing.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Headings whose effective opacity is below 0.9, with their text. */
async function hiddenHeadings(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, p'))
      .filter((el) => {
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        let node: HTMLElement | null = el
        let opacity = 1
        while (node) {
          opacity *= Number.parseFloat(getComputedStyle(node).opacity || '1')
          node = node.parentElement
        }
        return opacity < 0.9
      })
      .map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent ?? '').trim().slice(0, 60)}`)
      .slice(0, 15),
  )
}

/** Elements still carrying a non-`none` transform, i.e. mid- or pre-animation. */
async function transformedReveals(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.rv, .drawline, .threshold-rule'))
      .filter((el) => {
        const transform = getComputedStyle(el).transform
        return transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)'
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className.split(/\s+/)[0]} → ${getComputedStyle(el).transform}`)
      .slice(0, 15),
  )
}

test.describe('prefers-reduced-motion: reduce', () => {
  // Set on the CONTEXT, not via page.emulateMedia, so the preference is in
  // force for the very first paint of every navigation — which is where the CSS
  // branch does its work, before any client code has run.
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('content is visible immediately, without scrolling', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const hidden = await hiddenHeadings(page)
    expect(
      hidden,
      'Content is still held at opacity 0 under reduced motion. app/globals.css ' +
        'sets `.rv { opacity: 1 !important }` inside the reduce media query ' +
        'precisely so this holds at first paint, before hydration.\n' +
        hidden.join('\n'),
    ).toEqual([])
  })

  test('the reveal transform is suppressed, not merely completed', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const transformed = await transformedReveals(page)
    expect(
      transformed,
      'A `.rv` / `.drawline` / `.threshold-rule` still carries a transform under ' +
        'reduced motion. `transform: none !important` is the reduce branch; a value ' +
        'here means the element is either mid-transition or waiting to be revealed, ' +
        'and either way the motion is about to happen.\n' + transformed.join('\n'),
    ).toEqual([])
  })

  test('no transition duration is left running on a revealed element', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const durations = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.rv, .drawline, .threshold-rule'))
        .map((el) => ({
          cls: el.className.split(/\s+/).slice(0, 2).join('.'),
          duration: getComputedStyle(el).transitionDuration,
        }))
        .filter((row) => row.duration !== '' && !/^0s(, 0s)*$/.test(row.duration))
        .slice(0, 10),
    )

    expect(
      durations.map((row) => `${row.cls} → ${row.duration}`),
      'A reveal element still declares a transition duration under reduced motion. ' +
        'globals.css sets `transition: none` in the reduce branch. Leaving the ' +
        'duration in place means a later class change still animates.\n' +
        durations.map((r) => JSON.stringify(r)).join('\n'),
    ).toEqual([])
  })

  test('no looping decorative animation is left running', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(400)

    // Only INFINITELY repeating animations. A one-shot transition that happens
    // to be mid-flight is not a reduced-motion violation; a permanent loop is.
    const looping = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === 'running')
        .filter((animation) => animation.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY)
        .map((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target
          if (!target || !('tagName' in target)) return 'unknown'
          return `${target.tagName.toLowerCase()}.${String(target.className).slice(0, 30)}`
        })
        .slice(0, 10),
    )

    expect(looping, `looping animations still running: ${JSON.stringify(looping)}`).toEqual([])
  })
})

test.describe('default motion — the assertions above are not vacuous', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  /**
   * THE PAIR. With motion allowed and JavaScript running, content BELOW the
   * fold must start hidden — that is what `<Reveal>` does, and it is what makes
   * "visible immediately under reduce" a meaningful statement rather than a
   * description of a page with no animation in it.
   *
   * Deliberately sampled before any scroll: `<Reveal>` unobserves at first
   * intersection, so anything already in the viewport is legitimately revealed
   * and only the off-screen elements can testify.
   */
  test('with motion allowed, off-screen reveals start hidden', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // Give hydration a beat; the hidden state itself comes from CSS, but the
    // `.in` class that clears it comes from the observer.
    await page.waitForTimeout(600)

    const offScreenHidden = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.rv'))
        .filter((el) => el.getBoundingClientRect().top > window.innerHeight * 1.2)
        .map((el) => ({
          revealed: el.classList.contains('in'),
          opacity: Number.parseFloat(getComputedStyle(el).opacity || '1'),
        }))
      return { total: rows.length, hidden: rows.filter((r) => !r.revealed && r.opacity < 0.9).length }
    })

    test.skip(
      offScreenHidden.total === 0,
      'No `.rv` element is below the fold on this page. Nothing to pair against — ' +
        'once the content territory lands its bands this should stop skipping. If ' +
        'it never does, the reduced-motion assertions above are describing a page ' +
        'with no reveal animation, and they are worth nothing.',
    )

    expect(
      offScreenHidden.hidden,
      `${offScreenHidden.total} reveal elements are below the fold and ` +
        `${offScreenHidden.hidden} of them are hidden. With motion allowed at least ` +
        'one must be, or <Reveal> is not revealing anything and the reduce branch ' +
        'is trivially satisfied.',
    ).toBeGreaterThan(0)
  })

  /**
   * THE OTHER TRAP. Content must never be trapped at opacity 0 when JavaScript
   * is off, blocked, or still loading — which is why the hidden `.rv` state in
   * globals.css lives inside `@media (scripting: enabled)`.
   */
  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false })

    test('nothing is trapped at opacity 0', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      const hidden = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, p, .rv'))
          .filter((el) => {
            const style = getComputedStyle(el)
            if (style.display === 'none' || style.visibility === 'hidden') return false
            return Number.parseFloat(style.opacity || '1') < 0.9
          })
          .map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent ?? '').trim().slice(0, 50)}`)
          .slice(0, 15),
      )

      expect(
        hidden,
        'Content is hidden with JavaScript off. The `.rv` hidden state is scoped to ' +
          '@media (scripting: enabled) exactly so this cannot happen — a ' +
          'scroll-reveal that hides content in CSS and reveals it in JS shows a ' +
          'recruiter behind a script blocker a blank page, and they never find out ' +
          'they saw nothing.\n' + hidden.join('\n'),
      ).toEqual([])
    })
  })
})
