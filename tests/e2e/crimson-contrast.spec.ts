import { expect, test } from '@playwright/test'

import {
  CRIMSON_TOKENS,
  isCrimsonFamily,
  nearestCrimsonToken,
  parseColor,
  ratioOver,
  requiredRatio,
  round2,
} from './helpers/color'
import {
  collectBorderSamples,
  collectGrounds,
  collectTextSamples,
  freezeMotion,
  scrollThroughPage,
} from './helpers/page'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CRIMSON PROOF
 *
 * The whole design system exists to prevent one specific failure:
 *
 *     --color-crimson #AA0000 on the ink ground #14161A  =  2.34:1
 *
 * which fails AA body (4.5:1), AA large (3:1) AND the WCAG 1.4.11 non-text
 * minimum (3:1) simultaneously — so on ink it is illegal as text of any size,
 * as a rule, as a border, as an icon and as a focus ring. Every `[data-ground]`
 * block in app/globals.css, every "declare a ground, never a colour" rule in
 * components/ui, and the empty allowlist in scripts/check-ground-tokens.mjs
 * exist to make that combination unreachable.
 *
 * axe would catch the text half of it. It would NOT catch the rule, the border,
 * the focus ring, or a token that resolves wrongly in a context nothing
 * currently paints — and it reports what is on screen rather than proving the
 * mechanism holds. This file proves the mechanism.
 *
 * IT MEASURES THE ACTUAL COMPUTED BACKGROUND, never the intended one. A test
 * that asserted "#AA0000 is 7.43:1 on #FBFAF8" would be re-checking arithmetic
 * that app/globals.css already shows its working for. The question worth asking
 * is what the accent is painted ON, once the cascade, the hit-test stack and
 * whatever the content territory nested inside a band have had their say.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ROUTES = ['/', '/not-a-real-page-404'] as const

/* ══════════════════════════════════════════════════════════════════════════
   1. THE TOKENS, AS EACH GROUND RESOLVES THEM
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The floor each role has to clear against its own `--ground`, and why.
 *
 * `--edge` is deliberately absent: globals.css argues it down to a decorative
 * hairline (1.28 / 1.37 / 1.40:1) on the grounds that the records it separates
 * are ALSO separated by space and by type hierarchy, so it carries no unique
 * information and 1.4.11 does not apply. That argument is sound and this file
 * accepts it — but see the border sweep below, which checks that nothing
 * MEANINGFUL is drawn in `--edge`.
 */
const ROLE_FLOORS: Array<{ role: string; floor: number; why: string }> = [
  { role: '--fg', floor: 4.5, why: 'body text' },
  { role: '--fg-muted', floor: 4.5, why: 'secondary body text — muted is not an excuse' },
  { role: '--fg-accent', floor: 4.5, why: 'the eyebrow sets at 11px; there is no large-text allowance' },
  { role: '--fg-accent-display', floor: 3, why: 'display face only, >=26px by globals.css rule 2' },
  { role: '--focus-ring', floor: 3, why: 'WCAG 1.4.11 — a focus indicator is a non-text UI component' },
  { role: '--rule', floor: 3, why: 'the <Threshold> line is required to understand the content' },
  { role: '--fg-error', floor: 4.5, why: 'there is no error hue; --fg-error resolves to --fg' },
]

for (const route of ROUTES) {
  test(`every ground resolves every role to a legal ratio on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await scrollThroughPage(page)
    await freezeMotion(page)

    const nodes = await collectGrounds(page)
    expect(
      nodes.length,
      'No [data-ground] anywhere. Either this route is not built from <Band>, or ' +
        'the attribute stopped being emitted — and every assertion below is then ' +
        'measuring an empty set.',
    ).toBeGreaterThan(0)

    /**
     * Resolve every token pair through the browser so `color-mix()`, `var()`
     * chains and hex all normalise identically, then do the WCAG maths in Node
     * where the failure message can carry it.
     */
    const resolved = await page.evaluate(
      ({ roles }) => {
        const probe = document.createElement('span')
        probe.style.display = 'none'
        document.body.appendChild(probe)
        const resolve = (value: string): string => {
          probe.style.color = ''
          probe.style.color = value
          return getComputedStyle(probe).color
        }
        const out: Array<{ ground: string; path: string; ground_rgb: string; roles: Record<string, string> }> = []
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-ground]'))) {
          const style = getComputedStyle(el)
          const groundToken = style.getPropertyValue('--ground').trim()
          if (!groundToken) continue
          const values: Record<string, string> = {}
          for (const role of roles) {
            const raw = style.getPropertyValue(role).trim()
            values[role] = raw ? resolve(raw) : ''
          }
          out.push({
            ground: el.getAttribute('data-ground') ?? '',
            path: `${el.tagName.toLowerCase()}#${el.id || '(no id)'}`,
            ground_rgb: resolve(groundToken),
            roles: values,
          })
        }
        probe.remove()
        return out
      },
      { roles: ROLE_FLOORS.map((r) => r.role) },
    )

    const failures: string[] = []
    // De-duplicate: the three grounds repeat across bands and nested labels.
    const seen = new Set<string>()

    for (const context of resolved) {
      for (const { role, floor, why } of ROLE_FLOORS) {
        const value = context.roles[role]
        if (!value) continue
        const key = `${context.ground}|${role}|${value}|${context.ground_rgb}`
        if (seen.has(key)) continue
        seen.add(key)

        const ratio = ratioOver(value, context.ground_rgb)
        if (ratio === null) {
          failures.push(`${context.ground}: ${role} = "${value}" could not be parsed`)
          continue
        }
        if (ratio + 0.005 < floor) {
          const colour = parseColor(value)
          const named = colour && isCrimsonFamily(colour) ? ` (${nearestCrimsonToken(colour)})` : ''
          failures.push(
            `${context.ground} ground [${context.path}]: ${role} resolves to ${value}${named} ` +
              `on ${context.ground_rgb} = ${round2(ratio)}:1, below the ${floor}:1 floor for ${why}`,
          )
        }
      }
    }

    expect(
      failures,
      'A ground-dependent role resolved to an illegal ratio against its own ground.\n' +
        'This is the failure the whole [data-ground] mechanism exists to make ' +
        'unreachable — the canonical instance is --fg-accent resolving to ' +
        `${CRIMSON_TOKENS.crimson} on ink, which measures 2.34:1 and fails AA body, ` +
        'AA large and 1.4.11 at once.\n' +
        failures.join('\n'),
    ).toEqual([])
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   2. THE TRAP, NAMED — both directions
   ══════════════════════════════════════════════════════════════════════════ */

test('#AA0000 is never resolved on ink, and #FF5252 is never resolved on paper', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const crossed = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.display = 'none'
    document.body.appendChild(probe)
    const resolve = (value: string): string => {
      probe.style.color = ''
      probe.style.color = value
      return getComputedStyle(probe).color
    }
    const roles = ['--fg-accent', '--fg-accent-display', '--fg-pressed', '--rule', '--focus-ring']
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-ground]'))) {
      const ground = el.getAttribute('data-ground')
      if (ground !== 'ink' && ground !== 'paper') continue
      const style = getComputedStyle(el)
      for (const role of roles) {
        const raw = style.getPropertyValue(role).trim()
        if (!raw) continue
        const rgb = resolve(raw)
        if (ground === 'ink' && rgb === 'rgb(170, 0, 0)') {
          out.push(`ink ground resolves ${role} to #AA0000 — 2.34:1, illegal at any size`)
        }
        if (ground === 'paper' && rgb === 'rgb(255, 82, 82)') {
          out.push(
            `paper ground resolves ${role} to #FF5252 — 3.06:1, legal only at >=24px ` +
              'display, and --fg-accent is used by the 11px eyebrow',
          )
        }
      }
    }
    probe.remove()
    return [...new Set(out)]
  })

  expect(
    crossed,
    'One of the two crimson traps is reachable from a ground context.\n' +
      '  #AA0000 on ink   2.34:1 — the trap this system was built around.\n' +
      '  #FF5252 on paper 3.06:1 — the MIRROR trap, which points the other way ' +
      'and is the one an engineer porting the reference repo by muscle memory ' +
      'gets wrong.\n' +
      'Neither red is universal and neither may be hand-picked; that is why the ' +
      'component API exports a Ground type and no colour at all.\n' +
      crossed.join('\n'),
  ).toEqual([])
})

/* ══════════════════════════════════════════════════════════════════════════
   3. WHAT IS ACTUALLY PAINTED
   ══════════════════════════════════════════════════════════════════════════ */

test('every red actually painted on the page clears its required ratio', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await scrollThroughPage(page)
  await freezeMotion(page)

  const samples = await collectTextSamples(page)
  expect(samples.length, 'no text samples collected').toBeGreaterThan(10)

  const reds = samples.filter((sample) => {
    if (sample.backgroundIsImage) return false
    const colour = parseColor(sample.color)
    return colour !== null && isCrimsonFamily(colour)
  })

  const failures = reds
    .map((sample) => {
      const ratio = ratioOver(sample.color, sample.background)
      const need = requiredRatio(sample.fontSizePx, sample.fontWeight)
      const colour = parseColor(sample.color)
      return { sample, ratio, need, token: colour ? nearestCrimsonToken(colour) : 'unparseable' }
    })
    .filter(({ ratio, need }) => ratio !== null && ratio + 0.005 < need)
    .map(
      ({ sample, ratio, need, token }) =>
        `${round2(ratio as number)}:1 (needs ${need}:1) — ${token} on ${sample.background}\n` +
        `    ${sample.fontSizePx}px/${sample.fontWeight} · ground="${sample.ground}" · ${sample.path}\n` +
        `    "${sample.text}"`,
    )

  expect(
    failures,
    `${reds.length} elements paint a crimson-family colour; ${failures.length} of them ` +
      'fail against the background they are actually painted on.\n' +
      failures.join('\n'),
  ).toEqual([])
})

/**
 * NON-VACUITY. If the accent is never painted at all, the sweep above passes on
 * an empty set and this file proves nothing.
 */
test('the accent is actually used: the page paints crimson somewhere', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await scrollThroughPage(page)
  await freezeMotion(page)

  const samples = await collectTextSamples(page)
  const reds = samples.filter((sample) => {
    const colour = parseColor(sample.color)
    return colour !== null && isCrimsonFamily(colour)
  })

  expect(
    reds.length,
    'Not one element on the page paints a crimson-family colour. Either the accent ' +
      'is unused — in which case the ground mechanism is guarding nothing — or the ' +
      'sampler stopped seeing it and the sweep above is passing for free.',
  ).toBeGreaterThan(0)
})

/**
 * THE SIGNATURE ELEMENT.
 *
 * `.threshold-rule` is a 2px `--fg-accent` bar and it is a graphical object
 * REQUIRED to understand the content — the whole point of the device is that the
 * geometry states the claim, one number over the line and the floor on it. WCAG
 * 1.4.11 therefore applies at 3:1. `<Threshold>`'s own docblock names the exact
 * edit that breaks it: adding `opacity`, the way `<Rule>` legitimately does,
 * fails all three grounds at once. `<Rule>` is faded on purpose and is exempt,
 * because the records it separates are also separated by space and type.
 */
test('the threshold rule holds 3:1 — it is a graphical object, not a divider', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await scrollThroughPage(page)
  await freezeMotion(page)

  const rules = await page.evaluate(() => {
    interface Rgba { r: number; g: number; b: number; a: number }
    const parse = (value: string): Rgba | null => {
      const match = /rgba?\(([^)]+)\)/.exec(value)
      if (!match?.[1]) return null
      const parts = match[1].split(/[\s,/]+/).filter(Boolean).map((p) => Number.parseFloat(p))
      const [r, g, b, a] = parts
      if (r === undefined || g === undefined || b === undefined) return null
      return { r, g, b, a: a === undefined || Number.isNaN(a) ? 1 : a }
    }
    const backdrop = (el: Element): string => {
      let node: Element | null = el.parentElement
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor)
        if (c && c.a >= 0.99) return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
        node = node.parentElement
      }
      return 'rgb(255, 255, 255)'
    }
    const groundAt = (el: Element): string => {
      let node: Element | null = el
      while (node) {
        const v = node.getAttribute('data-ground')
        if (v) return v
        node = node.parentElement
      }
      return 'paper'
    }
    return Array.from(document.querySelectorAll<HTMLElement>('.threshold-rule')).map((el) => {
      const style = getComputedStyle(el)
      return {
        ground: groundAt(el),
        color: style.backgroundColor,
        opacity: Number.parseFloat(style.opacity || '1'),
        heightPx: Number.parseFloat(style.height || '0'),
        backdrop: backdrop(el),
      }
    })
  })

  test.skip(
    rules.length === 0,
    'No <Threshold> on the page yet. It is the signature element and Addendum B ' +
      'ruling R-8 puts the P@1 0.487 → 0.585 threshold in the hero, so this should ' +
      'not stay skipped — but it belongs to the content territory, not this one.',
  )

  const failures = rules
    .map((rule) => {
      const ratio = ratioOver(rule.color, rule.backdrop)
      return { rule, ratio }
    })
    .filter(({ rule, ratio }) => ratio === null || ratio + 0.005 < 3 || rule.opacity < 0.99)
    .map(
      ({ rule, ratio }) =>
        `ground="${rule.ground}" ${rule.color} on ${rule.backdrop} = ` +
        `${ratio === null ? 'unparseable' : `${round2(ratio)}:1`}, opacity ${rule.opacity}`,
    )

  expect(
    failures,
    'The threshold rule must hold 3:1 at FULL opacity on every ground (paper 7.43, ' +
      'ink 5.68, crimson 7.75). Fading it is the obvious visual "improvement" and ' +
      'it is the single edit that turns the signature element into an ' +
      'accessibility failure. <Rule> is the divider; this is not.\n' +
      failures.join('\n'),
  ).toEqual([])
})

/**
 * Nothing MEANINGFUL is drawn in `--edge`.
 *
 * globals.css argues `--edge` down to a decorative hairline at ~1.3:1, and the
 * argument is sound for a 1px record separator. It is not sound for a 2px
 * border, which in this system means exactly one thing — the doubled rule under
 * an invalid `<Field>`, whose whole job is to carry failure state without a
 * colour. A 2px border painted in `--edge` is state rendered at 1.3:1.
 */
test('no 2px border is drawn in the decorative edge colour', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await scrollThroughPage(page)
  await freezeMotion(page)

  const borders = await collectBorderSamples(page)
  const heavy = borders.filter((border) => border.widthPx >= 1.5)

  const failures = heavy
    .map((border) => ({ border, ratio: ratioOver(border.color, border.background) }))
    .filter(({ ratio }) => ratio !== null && ratio + 0.005 < 3)
    .map(
      ({ border, ratio }) =>
        `${border.path} border-${border.side} ${border.widthPx}px ${border.color} on ` +
        `${border.background} = ${round2(ratio as number)}:1 (ground="${border.ground}")`,
    )

  expect(
    failures,
    'A >=2px border below 3:1. In this system a doubled border means STATE — the ' +
      'invalid <Field> rule — and state is never carried by colour here, so it has ' +
      'to be visible as a shape. There is no --fg-warn and there is no error hue; ' +
      'the red is already here, and it is the rule.\n' +
      failures.join('\n'),
  ).toEqual([])
})
