import { expect, test } from '@playwright/test'

import {
  GROUND_ROLES,
  collectFormGrounds,
  collectGrounds,
  freezeMotion,
  scrollThroughPage,
} from './helpers/page'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GROUND-CONTEXT INVARIANTS
 *
 * The design system's central mechanism is that a caller declares a GROUND and
 * never a colour. `scripts/check-ground-tokens.mjs` enforces the source half —
 * no component may name `--color-crimson` — and its allowlist is deliberately
 * EMPTY. What a static scan cannot see is the RENDERED result: how many ink
 * bands a page actually composed, what ground a form ended up inside, whether a
 * `[data-ground]` value survives a typo.
 *
 * That is this file. It is the other half of the same guarantee, and the two do
 * not overlap: a page could pass the source gate perfectly and still ship three
 * ink bands with the recruiter form in the middle of one.
 *
 * THE BUDGET IS NOT A STYLE PREFERENCE. app/globals.css states it as a rule:
 *   paper    everything that is READ. Default. Most of the page.
 *   ink      the production register — the hero. MAX 2 BANDS per page.
 *   crimson  the institution — the identity close + footer. MAX 1 BAND.
 * A third dark band means removing one, not adding a ground. And Addendum B
 * ruling R-7 puts the recruiter panel on paper, because spec-02 §12 forbids the
 * form from sitting on ink or crimson and the panel contains the form — dark
 * and coloured forms measurably reduce completion, and that form is the
 * commercial point of the page.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const GROUNDS = new Set(['paper', 'ink', 'crimson'])

/**
 * Every route this suite considers "a page". `/not-a-real-page` renders
 * `app/not-found.tsx`, which is a real surface a recruiter can land on from a
 * stale link and which composes bands of its own.
 */
const ROUTES = ['/', '/not-a-real-page-404'] as const

for (const route of ROUTES) {
  test.describe(`ground contexts on ${route}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await scrollThroughPage(page)
      await freezeMotion(page)
    })

    test('every [data-ground] names one of the three real grounds', async ({ page }) => {
      const nodes = await collectGrounds(page)

      const bad = nodes
        .filter((node) => !GROUNDS.has(node.ground))
        .map((node) => `${node.path} → data-ground="${node.ground}"`)

      expect(
        bad,
        'A [data-ground] value outside paper|ink|crimson matches no block in ' +
          'app/globals.css, so all twelve roles resolve to the INHERITED value of ' +
          'whatever band it landed inside. That is not a visible failure — it is a ' +
          'silently wrong colour that still passes the build. (globals.css rule 6: ' +
          'there is no `bone`.)\n' +
          bad.join('\n'),
      ).toEqual([])
    })

    test('every ground context defines all twelve roles', async ({ page }) => {
      const nodes = await collectGrounds(page)
      test.skip(nodes.length === 0, 'no [data-ground] on this route')

      const missing: string[] = []
      for (const node of nodes) {
        for (const role of GROUND_ROLES) {
          if (!node.tokens[role]) missing.push(`${node.path} (${node.ground}) is missing ${role}`)
        }
      }

      expect(
        missing,
        'A ground that leaves a role undefined does not fail loudly — the var() ' +
          'falls through to whatever the ancestor ground set, which on this palette ' +
          'can silently resolve --fg-accent to #AA0000 over #14161A: 2.34:1, failing ' +
          'AA body, AA large and the 1.4.11 non-text minimum simultaneously.\n' +
          missing.slice(0, 20).join('\n'),
      ).toEqual([])
    })

    test('the band budget holds: at most two ink, at most one crimson', async ({ page }) => {
      const nodes = await collectGrounds(page)
      const bands = nodes.filter((node) => node.isBand)

      const ink = bands.filter((band) => band.ground === 'ink')
      const crimson = bands.filter((band) => band.ground === 'crimson')

      expect(
        ink.length,
        `${ink.length} ink bands: ${ink.map((b) => b.path).join(', ')}. The budget is ` +
          'TWO. Ink is the production register — the hero — and a third dark band ' +
          'means removing one, not adding a ground. (app/globals.css, the ' +
          'ground-contexts header.)',
      ).toBeLessThanOrEqual(2)

      expect(
        crimson.length,
        `${crimson.length} crimson bands: ${crimson.map((b) => b.path).join(', ')}. ` +
          'The budget is ONE. Crimson is the institution — the identity close and the ' +
          'footer — and it is where the entire accent budget of the page is spent.',
      ).toBeLessThanOrEqual(1)
    })

    /**
     * NON-VACUITY. Without this, a page that used a single ground everywhere
     * would sail through both budget assertions above by never spending
     * anything, and the suite would report green on a design system that had
     * stopped being used.
     */
    test('the budget assertions are not free: the page composes real bands', async ({ page }) => {
      const bands = (await collectGrounds(page)).filter((node) => node.isBand)
      expect(
        bands.length,
        'No <section data-ground> on the page at all. <Band> is the only thing that ' +
          'renders one, so either the page is not built from the design system or ' +
          'Band stopped setting the attribute — and every ground assertion in this ' +
          'file is then passing on an empty set.',
      ).toBeGreaterThan(0)
    })

    test('each band actually paints the ground it declares', async ({ page }) => {
      const bands = (await collectGrounds(page)).filter((node) => node.isBand)
      test.skip(bands.length === 0, 'no bands on this route')

      /**
       * The comparison happens IN the page. `background-color` is serialised as
       * `rgb(…)` while `--ground` is whatever the token file wrote (a hex, or a
       * `var()` chain); resolving the token through a throwaway element makes
       * the browser normalise both through the same pipeline, so this is an
       * exact equality test rather than a re-implementation of CSS colour
       * parsing that would have to be kept in step with the palette.
       */
      const wrong = await page.evaluate(() => {
        const out: string[] = []
        const probe = document.createElement('span')
        probe.style.display = 'none'
        document.body.appendChild(probe)
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('section[data-ground]'))) {
          const style = getComputedStyle(el)
          const token = style.getPropertyValue('--ground').trim()
          if (!token) continue
          probe.style.backgroundColor = ''
          probe.style.backgroundColor = token
          const expected = getComputedStyle(probe).backgroundColor
          const painted = style.backgroundColor
          if (expected && painted && expected !== painted) {
            out.push(
              `${el.tagName.toLowerCase()}#${el.id || '(no id)'} [${el.getAttribute('data-ground')}] ` +
                `paints ${painted} but its --ground token resolves to ${expected}`,
            )
          }
        }
        probe.remove()
        return out
      })

      expect(
        wrong,
        'A band that declares a ground and paints something else is the worst of ' +
          'both worlds: the nested components pick their colours for the declared ' +
          'ground while the reader sees the painted one. Every measured ratio in ' +
          'globals.css is then describing a pairing that is not on screen.\n' +
          wrong.join('\n'),
      ).toEqual([])
    })

    /**
     * ADDENDUM B, RULING R-7. The one invariant in this file that is about
     * conversion rather than contrast — and it is still a contrast decision
     * underneath, because spec-02 §12 forbids the form from sitting on ink or
     * crimson and the panel contains the form.
     */
    test('no form sits on ink or crimson', async ({ page }) => {
      const forms = await collectFormGrounds(page)
      const dark = forms.filter(
        (form) => form.effectiveGround === 'ink' || form.effectiveGround === 'crimson',
      )

      expect(
        dark.map((form) => `${form.path} is on "${form.effectiveGround}" (from ${form.suppliedBy})`),
        'Addendum B ruling R-7: the recruiter-agent panel sits on PAPER. The ' +
          'original spec put it on ink while also forbidding the form from sitting ' +
          'on ink — and the panel contains the form. Paper resolves the ' +
          'contradiction, and it is the right answer independently: dark and ' +
          'coloured forms measurably reduce completion, and that form is the ' +
          'commercial point of the page.',
      ).toEqual([])
    })
  })
}

/**
 * NON-VACUITY FOR R-7, and the reason it is a test of its own.
 *
 * "No form sits on ink or crimson" is trivially true on a page with no form,
 * and it would stay trivially true forever if the recruiter panel were built
 * out of `<div>`s and a click handler instead of a `<form>`. That is not a
 * hypothetical preference: a real `<form>` is what gives the panel implicit
 * submission (Enter in a field), a native `required`/`aria-invalid` story, and
 * a working control for someone with JavaScript still loading. Losing it would
 * disable the R-7 assertion and degrade the panel in the same edit.
 */
test('the recruiter panel is built on a real <form>', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await scrollThroughPage(page)

  const forms = await collectFormGrounds(page)

  expect(
    forms.length,
    'There is no <form> on the homepage, so the R-7 assertion above ("no form sits ' +
      'on ink or crimson") is passing on an empty set and will keep passing no ' +
      'matter where the panel is put. The recruiter panel is the commercial point ' +
      'of the page; it needs a real form element. ' +
      'See "CONTRACTS I NEED" in the test territory report.',
  ).toBeGreaterThan(0)

  expect(
    forms.some((form) => form.fieldCount >= 2),
    `Found ${forms.length} form(s), none with two or more controls: ` +
      `${JSON.stringify(forms)}. The panel carries a JD textarea, four role chips ` +
      'and a submit button.',
  ).toBe(true)
})
