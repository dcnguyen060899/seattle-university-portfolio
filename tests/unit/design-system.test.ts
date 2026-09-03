/**
 * tests/unit/design-system.test.ts
 *
 * The design system's guarantees, checked without a browser.
 *
 * These run on a fresh clone with no keys, no network and no rendering engine.
 * The primitives are Server Components with no hooks and no effects, so
 * `renderToStaticMarkup` is enough to exercise them for real — the two client
 * components (`<Reveal>`, `<Chip>`) are exercised for their server output,
 * which is the markup a recruiter with a slow connection actually sees first.
 *
 * The tests are grouped by the promise each one keeps:
 *   1. arithmetic  — every contrast ratio written into globals.css is TRUE
 *   2. grounds     — each ground resolves every role, to the right token
 *   3. mechanism   — the trap is unreachable from the component API
 *   4. primitives  — each one renders the structure its docblock promises
 *   5. scale       — the type and geometry rules hold as written
 *
 * ── WHY GROUP 1 IS FIRST, AND WHY IT IS NOT PEDANTRY ──────────────────────
 *
 * Addendum B ruling R-7 exists because a spec asserted #AA0000 measures 8.15:1
 * on white and 7.83:1 on #F8F9FA. Both were invented; the real figures are
 * 7.75 and 7.35. On a page whose entire thesis is "every claim traces to a
 * source", a fabricated contrast ratio in the stylesheet is the one defect that
 * disqualifies the argument — the page would be making, about itself, exactly
 * the error its own research band flags in somebody else's paper.
 *
 * So this file recomputes the whole table from the hexes in globals.css and
 * asserts the documented figures. It does not trust the comment; it audits it.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import {
  Band,
  Btn,
  Chip,
  Entry,
  Eyebrow,
  Field,
  Figure,
  Reveal,
  Rule,
  Stat,
  Threshold,
  cx,
  fieldDescribedBy,
  groundFor,
  staggerStyle,
} from '../../components/ui'

const ROOT = process.cwd()
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8')

/**
 * globals.css with its CSS block comments blanked out.
 *
 * Every measured ratio in this system is written into the source beside the
 * thing it measures, so the file is full of hexes, token names and — crucially —
 * the names of things that must NOT exist, quoted in the comment that explains
 * why. `[data-ground="bone"]` and `--fg-warn` both appear, as the thing being
 * forbidden. A naive scan for them finds the documentation and calls it the
 * violation, which is exactly the mistake scripts/check-ground-tokens.mjs was
 * written to avoid (see its "WHAT IT DELIBERATELY DOES NOT CHECK" section).
 * Replacing with spaces rather than deleting keeps offsets stable.
 */
const GLOBALS_CODE = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
const CHECK_TOKENS = readFileSync(join(ROOT, 'scripts', 'check-ground-tokens.mjs'), 'utf8')

const COMPONENT_FILES = [
  'Band', 'Btn', 'Chip', 'Entry', 'Eyebrow', 'Field', 'Figure', 'Mark', 'Reveal', 'Rule', 'Stat',
  'Threshold', 'system', 'index',
] as const

function componentSource(name: string): string {
  const ext = name === 'system' || name === 'index' ? 'ts' : 'tsx'
  return readFileSync(join(ROOT, 'components', 'ui', `${name}.${ext}`), 'utf8')
}

/**
 * Builds an element from a component and its props. No DOM, no jsdom, no act().
 *
 * `(Component, props)` rather than JSX, and the props bag carries `children`.
 * That shape is forced, and the reason is worth writing down so nobody "tidies"
 * it back:
 *
 *   · this file is `.ts`, not `.tsx`, because more than half of it asserts about
 *     the design system's SOURCE — globals.css, the check-tokens allowlist, the
 *     component files as text — and never renders anything at all;
 *   · without JSX, children have to travel inside the props object: React's
 *     `createElement` overload that takes variadic children does not satisfy a
 *     REQUIRED `children` prop, and `BandProps`, `EyebrowProps`, `BtnProps` and
 *     `FieldProps` all require one;
 *   · `react/no-children-prop` fires on a `children` key written directly at a
 *     `createElement` call site.
 *
 * Passing the bag through this helper satisfies both rules without weakening
 * either. It is also the ordinary testing idiom — `render(Component, props)` —
 * rather than a workaround pretending to be one.
 */
function el<P extends object>(Component: (props: P) => ReactNode, props: P): ReactElement {
  return createElement(Component, props)
}

function render<P extends object>(Component: (props: P) => ReactNode, props: P): string {
  return renderToStaticMarkup(el(Component, props))
}

/* ══ WCAG maths ═══════════════════════════════════════════════════════════ */

interface Rgb {
  r: number
  g: number
  b: number
}

function hex(value: string): Rgb {
  const clean = value.replace('#', '')
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  }
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number): number => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(a: string, b: string): number {
  const la = luminance(hex(a))
  const lb = luminance(hex(b))
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

/** Pulls a `--color-*` token's hex value straight out of the @theme block. */
function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(GLOBALS)
  if (!match?.[1]) {
    throw new Error(
      `--color-${name} is not defined in app/globals.css with a literal hex. ` +
        'Every ratio in this file is computed FROM those hexes; a token that has ' +
        'moved or become a var() chain makes the audit vacuous rather than wrong, ' +
        'which is worse.',
    )
  }
  return match[1].toUpperCase()
}

/* ══ 1. arithmetic ════════════════════════════════════════════════════════ */

describe('every contrast ratio written into globals.css is true', () => {
  /**
   * The table, transcribed from the comments in app/globals.css and
   * components/ui/system.ts. If a comment there changes, this fails — which is
   * the point: the comment is a CLAIM about a measurement, and this is the
   * measurement.
   */
  const TABLE: Array<[string, string, number, string]> = [
    // ── the trap, both directions ──────────────────────────────────────────
    ['crimson', 'ink', 2.34, 'THE TRAP. Fails AA body, AA large and 1.4.11 simultaneously.'],
    ['crimson', 'ink-raised', 2.13, 'and it gets worse on the inset'],
    ['crimson-lift', 'paper', 3.06, 'THE MIRROR TRAP. >=24px display and UI only.'],

    // ── paper ──────────────────────────────────────────────────────────────
    ['text', 'paper', 17.3, 'body on paper'],
    ['text', 'paper-sunk', 15.71, 'body on the paper inset'],
    ['text-muted', 'paper', 6.34, 'muted on paper'],
    ['text-muted', 'paper-sunk', 5.76, 'muted on the paper inset'],
    ['crimson', 'paper', 7.43, 'the accent on paper — AA at any size'],
    ['crimson', 'paper-sunk', 6.75, 'the accent on the paper inset'],
    ['crimson', 'crimson-wash', 6.39, 'the pressed chip label keeps the accent'],
    ['crimson-deep', 'paper', 9.84, ':active on paper'],
    ['crimson-deep', 'paper-sunk', 8.93, ':active on the paper inset'],

    // ── ink ────────────────────────────────────────────────────────────────
    ['on-ink', 'ink', 16.04, 'body on ink'],
    ['on-ink', 'ink-raised', 14.63, 'body on the ink inset'],
    ['on-ink-muted', 'ink', 7.15, 'muted on ink'],
    ['on-ink-muted', 'ink-raised', 6.52, 'muted on the ink inset'],
    ['crimson-lift', 'ink', 5.68, 'the only red legal on ink'],
    ['crimson-lift', 'ink-raised', 5.18, 'and on the ink inset'],

    // ── crimson ────────────────────────────────────────────────────────────
    ['on-crimson', 'crimson', 7.75, 'white on the crimson ground'],
    ['on-crimson', 'crimson-deep', 10.26, 'white on the crimson inset'],
    ['rose', 'crimson', 5.6, 'the crimson ground needs its OWN muted token'],
    ['rose', 'crimson-deep', 7.42, 'and on its inset'],
    ['on-ink-muted', 'crimson', 3.06, 'which is why reusing the ink muted here is wrong'],
  ]

  for (const [fg, bg, expected, why] of TABLE) {
    it(`#${token(fg)} on #${token(bg)} is ${expected}:1 — ${why}`, () => {
      expect(ratio(token(fg), token(bg))).toBe(expected)
    })
  }

  /**
   * Ruling R-5 of the palette rules: the SU wordmark carries #A2192B, not
   * #AA0000, and every ratio above is identical to two decimals for either hex
   * (L = 0.085460 vs 0.085511). That claim is what makes a brand correction a
   * one-token edit rather than a scheduled accessibility re-audit — so it is
   * worth actually checking rather than believing.
   */
  it('swapping the anchor to the wordmark red #A2192B changes no measured value', () => {
    const anchor = token('crimson')
    const wordmark = '#A2192B'
    for (const ground of ['paper', 'paper-sunk', 'ink', 'ink-raised'] as const) {
      expect(
        ratio(wordmark, token(ground)),
        `#A2192B on ${ground} differs from #AA0000 — the "one-token edit" claim in ` +
          'globals.css rule 5 no longer holds and a brand correction becomes a ' +
          'full re-audit.',
      ).toBe(ratio(anchor, token(ground)))
    }
    expect(ratio(token('on-crimson'), wordmark)).toBe(ratio(token('on-crimson'), anchor))
    expect(ratio(token('rose'), wordmark)).toBe(ratio(token('rose'), anchor))
  })

  it('paper is not #FFFFFF and ink is not pure black', () => {
    expect(
      token('paper'),
      'Pure white next to the white mark plate is 1.04:1 — not a contrast failure, ' +
        'a visible seam.',
    ).not.toBe('#FFFFFF')
    expect(
      token('ink'),
      'A warm black pulls crimson toward brown; this ground is faintly blue-slate.',
    ).not.toBe('#000000')
  })

  it('crimson-lift is the anchor under a light, not a second red', () => {
    /**
     * globals.css claims #FF5252 is "derived, not chosen: hue 0deg and
     * saturation 100%, bit-identical to the anchor; only HSL lightness moves
     * (33% -> 66%)". Both are hue 0 with G === B, which is the checkable half
     * of that claim — and it is the half that matters, because a red with a
     * different hue would be a SECOND accent on a one-hue brand.
     */
    const anchor = hex(token('crimson'))
    const lift = hex(token('crimson-lift'))
    expect(anchor.g).toBe(anchor.b)
    expect(lift.g).toBe(lift.b)
    expect(lift.r).toBe(255)
    expect(anchor.r).toBeGreaterThan(anchor.g)
  })
})

/* ══ 2. grounds ═══════════════════════════════════════════════════════════ */

const REQUIRED_ROLES = [
  '--ground', '--ground-sunk', '--surface-pressed',
  '--fg', '--fg-muted', '--fg-accent', '--fg-accent-display', '--fg-pressed',
  '--rule', '--edge', '--focus-ring', '--fg-error',
] as const

/** The body of one `[data-ground="X"]` block, including the `:root` alias. */
function groundBlock(ground: string): string {
  const pattern =
    ground === 'paper'
      ? /:root,\s*\[data-ground="paper"\]\s*\{([\s\S]*?)\n\}/
      : new RegExp(`\\[data-ground="${ground}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`)
  const match = pattern.exec(GLOBALS)
  if (!match?.[1]) throw new Error(`no [data-ground="${ground}"] block in app/globals.css`)
  return match[1]
}

describe('each ground resolves every role', () => {
  for (const ground of ['paper', 'ink', 'crimson'] as const) {
    it(`${ground} defines all twelve roles`, () => {
      const block = groundBlock(ground)
      const missing = REQUIRED_ROLES.filter((role) => !new RegExp(`${role}:`).test(block))
      expect(
        missing,
        `A ground that omits a role does not fail loudly — the var() falls through ` +
          'to whatever the ancestor ground set. On this palette that can silently ' +
          'resolve --fg-accent to #AA0000 over #14161A.',
      ).toEqual([])
    })
  }

  it('paper resolves its accent to the anchor and never to the lift', () => {
    const block = groundBlock('paper')
    expect(block).toMatch(/--fg-accent:\s*var\(--color-crimson\)/)
    expect(
      block,
      '#FF5252 is 3.06:1 on paper. --fg-accent is read by the 11px <Eyebrow>, ' +
        'which has no large-text allowance available to it.',
    ).not.toMatch(/--fg-accent(?:-display)?:\s*var\(--color-crimson-lift\)/)
  })

  it('ink resolves its accent to the lift and never to the anchor', () => {
    const block = groundBlock('ink')
    expect(block).toMatch(/--fg-accent:\s*var\(--color-crimson-lift\)/)
    expect(
      block,
      'This is THE trap: #AA0000 on #14161A is 2.34:1 and is illegal as text of ' +
        'any size, as a rule, as a border, as an icon and as a focus ring.',
    ).not.toMatch(/--(?:fg-accent|fg-accent-display|rule|focus-ring|fg-pressed):\s*var\(--color-crimson\)\s*;/)
  })

  it('crimson gives its muted role its own token, not the ink one', () => {
    const block = groundBlock('crimson')
    expect(block).toMatch(/--fg-muted:\s*var\(--color-rose\)/)
    expect(
      block,
      '--color-on-ink-muted on crimson is 3.06:1 and fails body text. Reusing the ' +
        'ink muted here is the obvious shortcut and it is wrong.',
    ).not.toMatch(/--fg-muted:\s*var\(--color-on-ink-muted\)/)
  })

  it('there is no fourth ground and no --fg-warn', () => {
    const grounds = [...GLOBALS_CODE.matchAll(/\[data-ground="([a-z-]+)"\]/g)].map((m) => m[1])
    expect(
      [...new Set(grounds)].sort(),
      'A fourth ground needs its own measured column and would break the band ' +
        'budget. `bone` in particular resolves to nothing and silently inherits.',
    ).toEqual(['crimson', 'ink', 'paper'])

    expect(
      GLOBALS_CODE,
      'Addendum B R-7: --fg-warn does not exist here and must not be added. A ' +
        'second red on a one-hue brand cannot be distinguished from the first by a ' +
        'protanopic reader, so colour is not permitted to carry failure state at all.',
    ).not.toContain('--fg-warn')
  })

  it('--fg-error resolves to --fg on every ground — there is no error hue', () => {
    for (const ground of ['paper', 'ink', 'crimson'] as const) {
      expect(groundBlock(ground)).toMatch(/--fg-error:\s*var\(--fg\)/)
    }
  })
})

/* ══ 3. mechanism ═════════════════════════════════════════════════════════ */

describe('the trap is unreachable from the component API', () => {
  it('the ground-token allowlist is EMPTY, and stays empty', () => {
    const match = /const ALLOW = new Set\(\[([\s\S]*?)\]\)/.exec(CHECK_TOKENS)
    expect(match?.[1], 'could not find the ALLOW set in scripts/check-ground-tokens.mjs').toBeDefined()
    expect(
      (match?.[1] ?? '').trim(),
      'Every entry in that allowlist is a place the ground mechanism does not ' +
        'reach, and the correct fix for such a place is a NEW ground-resolved role ' +
        'in globals.css — not an exemption. An empty allowlist is a stronger ' +
        'guarantee than a one-line one, and the design spec proposed the one-line ' +
        'version for the pressed chip; --surface-pressed / --fg-pressed solved it ' +
        'without an exception.',
    ).toBe('')
  })

  it('no primitive names a palette token or a colour literal', () => {
    const offenders: string[] = []
    for (const name of COMPONENT_FILES) {
      // Strip block comments: every measured ratio in this system is written
      // into the source beside the thing it measures, so the source is full of
      // hexes in comments. That is the project's truth rule, not a violation.
      const source = componentSource(name).replace(/\/\*[\s\S]*?\*\//g, ' ')
      for (const pattern of [
        /--color-[a-z-]+/g,
        /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g,
        /\brgba?\(/g,
      ]) {
        for (const hit of source.matchAll(pattern)) {
          offenders.push(`${name}: ${hit[0]}`)
        }
      }
    }
    expect(
      offenders,
      'A component that writes a palette token is correct on one ground and broken ' +
        'on another, and it fails SILENTLY — the page renders, the build is green, ' +
        'and the defect is a colour a reviewer has to notice.',
    ).toEqual([])
  })

  it('groundFor maps every tone, and undefined means "inherit"', () => {
    expect(groundFor('ink')).toBe('ink')
    expect(groundFor('crimson')).toBe('crimson')
    expect(groundFor('light')).toBe('paper')
    expect(
      groundFor(undefined),
      'Omitting the tone must produce NO attribute, so the element inherits the ' +
        "band's ground. Defaulting to paper would silently paint crimson text on " +
        'an ink band — which is the exact failure the type exists to prevent.',
    ).toBeUndefined()
  })

  it('cx drops falsy parts rather than emitting "false" or "undefined"', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b')
    expect(cx()).toBe('')
  })

  it('staggerStyle publishes --i, and emits nothing at position 0', () => {
    expect(
      staggerStyle(0),
      'Position 0 must produce no inline style at all, or every un-staggered ' +
        'element carries a redundant custom property.',
    ).toBeUndefined()
    expect(staggerStyle(undefined)).toBeUndefined()
    expect(
      staggerStyle(3),
      'The stagger travels as --i, never as an inline transitionDelay: globals.css ' +
        'owns the delay formula calc(var(--i) * var(--stagger)) so there is exactly ' +
        'one of it, and a caller cannot set a rhythm the stylesheet then overrides.',
    ).toEqual({ '--i': 3 })
  })
})

/* ══ 4. primitives ════════════════════════════════════════════════════════ */

describe('Band', () => {
  it('renders a section that declares its ground', () => {
    const html = render(Band, { tone: 'ink', id: 'hero', children: 'x' })
    expect(html).toContain('<section')
    expect(html).toContain('data-ground="ink"')
    expect(html).toContain('id="hero"')
  })

  it('defaults to paper', () => {
    expect(render(Band, { children: 'x' })).toContain('data-ground="paper"')
  })

  it('wraps content in the page measure unless bleeding', () => {
    expect(render(Band, { children: 'x' })).toContain('class="wrap"')
    expect(render(Band, { bleed: true, children: 'x' })).not.toContain('class="wrap"')
  })

  it('narrows to the reading measure with `prose`', () => {
    expect(render(Band, { prose: true, children: 'x' })).toContain('prose-measure')
  })
})

describe('Eyebrow', () => {
  it('emits NO data-ground when no tone is given', () => {
    const html = render(Eyebrow, { children: 'Label' })
    expect(
      html,
      'The safe default is inheritance. An <Eyebrow> is the most accent-bearing ' +
        'element on the page — every band opens with one — so it is the single most ' +
        'likely place to get the 2.34:1 failure wrong, and it therefore names no ' +
        'colour and declares no ground of its own.',
    ).not.toContain('data-ground')
    expect(html).toContain('var(--fg-accent)')
  })

  it('declares a ground only when the caller states one', () => {
    expect(render(Eyebrow, { tone: 'crimson', children: 'x' })).toContain('data-ground="crimson"')
  })

  it('can be the band heading', () => {
    expect(render(Eyebrow, { as: 'h2', children: 'x' })).toContain('<h2')
  })
})

describe('Threshold — the signature element', () => {
  const html = render(Threshold, {
    value: 'P@1 0.487',
    label: 'held-out majority-class floor',
    clearedValue: '0.585',
    clearedLabel: 'the only arm of 24 to clear it',
    cleared: '0.513 frozen → 0.585 fine-tuned',
  })

  it('draws the rule as an <hr> carrying .threshold-rule', () => {
    expect(html).toContain('threshold-rule')
    expect(html).toContain('<hr')
  })

  it('never fades the rule', () => {
    /**
     * The rule is a graphical object REQUIRED to understand the content, so
     * WCAG 1.4.11 applies at 3:1. At full opacity --fg-accent measures paper
     * 7.43, ink 5.68, crimson 7.75 — all clear. Adding opacity, the way <Rule>
     * legitimately does, breaks all three at once, and it is the obvious visual
     * "improvement".
     */
    const rule = /<hr[^>]*threshold-rule[^>]*>/.exec(html)?.[0] ?? ''
    expect(rule).not.toMatch(/opacity/)
    expect(rule).not.toContain('drawline')
    expect(GLOBALS).toMatch(/\.threshold-rule\s*\{[^}]*background:\s*var\(--fg-accent\)/)
    const ruleCss = /\.threshold-rule\s*\{([^}]*)\}/.exec(GLOBALS)?.[1] ?? ''
    expect(ruleCss, '.threshold-rule must not declare an opacity').not.toContain('opacity')
  })

  it('sets the cleared figure above the line and the floor on it', () => {
    expect(html).toContain('0.585')
    expect(html).toContain('P@1 0.487')
    expect(html.indexOf('0.585')).toBeLessThan(html.indexOf('threshold-rule'))
    expect(html.indexOf('threshold-rule')).toBeLessThan(html.indexOf('P@1 0.487'))
  })

  it('renders a bare threshold with nothing above the line', () => {
    const bare = render(Threshold, { value: '<200 ms', label: 'query target' })
    expect(bare).toContain('threshold-rule')
    expect(bare).toContain('&lt;200 ms')
  })
})

describe('Rule is the divider, and is allowed to fade', () => {
  it('draws left to right and carries .drawline', () => {
    const html = render(Rule, {})
    expect(html).toContain('drawline')
    expect(html).not.toContain('threshold-rule')
  })

  it('the fade is declared once, in CSS, on .drawline only', () => {
    const drawline = /\.drawline\s*\{([^}]*)\}/.exec(GLOBALS)?.[1] ?? ''
    expect(
      drawline,
      'The 32% opacity is legal on .drawline because the records it separates are ' +
        'ALSO separated by space and by type hierarchy, so 1.4.11 does not apply. ' +
        'That reasoning does not transfer to .threshold-rule.',
    ).toContain('opacity')
  })
})

describe('Entry — the page repeats records, not cards', () => {
  const html = render(Entry, {
    rail: 'Mar 2026 —',
    title: 'Research Data Engineer',
    meta: 'Computational Neuroscience Lab',
    actions: el(Btn, { variant: 'quiet', href: '/x', children: 'Read' }),
    children: createElement('p', null, 'body'),
  })

  it('renders an article with a hairline, no fill and no shadow', () => {
    expect(html).toContain('<article')
    expect(html).toContain('border-t')
    expect(
      html,
      'The reference repo\'s Card is a 3:2 photograph tile. Porting it would have ' +
        'imported a photo grid this content cannot fill — and an evidence page ' +
        'built from card components ends up padding each card with an image it does ' +
        'not have. Entry has no fill, no border box and no shadow.',
    ).not.toMatch(/shadow|rounded-(?:2xl|3xl)/)
  })

  it('defaults its title to h3 and can nest at h4', () => {
    expect(html).toContain('<h3')
    expect(render(Entry, { rail: 'a', title: 'b', as: 'h4' })).toContain('<h4')
  })

  it('marks the rail as numeric so a column of dates aligns', () => {
    expect(html).toContain('data-numeric')
  })
})

describe('Field — the no-error-hue decision, made unavoidable', () => {
  it('associates the label with the control the caller owns', () => {
    const html = render(Field, {
      id: 'jd',
      label: 'Job description',
      children: createElement('textarea', { id: 'jd' }),
    })
    expect(html).toContain('for="jd"')
  })

  it('carries failure state without colour', () => {
    const html = render(Field, {
      id: 'jd',
      label: 'Job description',
      error: 'Paste at least 40 characters.',
      children: createElement('textarea', { id: 'jd' }),
    })

    expect(html, 'the doubled 2px accent rule').toContain('border-b-2')
    expect(html, 'the mono ERROR prefix').toMatch(/>Error</)
    expect(html, 'role=status announces the message').toContain('role="status"')
    expect(html).toContain('id="jd-error"')
    expect(html).toContain('data-invalid="true"')
    expect(
      html,
      'There is no error hue: --fg-error resolves to --fg on every ground, which ' +
        'is full contrast and always legible. Someone reaching for a red error ' +
        'colour and measuring it against nothing is the trap this closes — the red ' +
        'is already here, and it is the rule.',
    ).toContain('var(--fg-error)')
  })

  it('fieldDescribedBy assembles the ids the control needs', () => {
    expect(fieldDescribedBy('jd', { hint: true, error: true })).toBe('jd-hint jd-error')
    expect(fieldDescribedBy('jd', { hint: true })).toBe('jd-hint')
    expect(
      fieldDescribedBy('jd', {}),
      'No hint and no error means no attribute at all — an empty ' +
        'aria-describedby is worse than none.',
    ).toBeUndefined()
  })
})

describe('Btn', () => {
  it('renders an anchor when given href and a button otherwise', () => {
    expect(render(Btn, { href: '/x', children: 'Go' })).toContain('<a href="/x"')
    const button = render(Btn, { children: 'Go' })
    expect(button).toContain('<button')
    expect(button, 'a button inside a form defaults to submit — always be explicit').toContain(
      'type="button"',
    )
  })

  it('resolves fill from --fg and label from --ground, so the pair is pre-measured', () => {
    const html = render(Btn, { children: 'Go' })
    expect(html).toContain('bg-[var(--fg)]')
    expect(html).toContain('text-[color:var(--ground)]')
  })

  it('suppresses its hover transition under reduced motion', () => {
    expect(render(Btn, { children: 'Go' })).toContain('motion-reduce:transition-none')
  })
})

describe('Chip', () => {
  const pressed = render(Chip, { pressed: true, onClick: () => {}, children: 'ML Engineer' })

  it('carries state in aria-pressed and in the border, not in the fill alone', () => {
    expect(pressed).toContain('aria-pressed="true"')
    expect(
      pressed,
      'The pressed fill measures only 1.16:1 (wash on paper), 1.10:1 (raised on ' +
        'ink) and 1.32:1 (deep on crimson) against its own ground — well under ' +
        "1.4.11's 3:1. The BORDER is what makes the state perceivable. Do not " +
        '"simplify" this by dropping it.',
    ).toContain('aria-pressed:border-[color:var(--fg-accent)]')
    expect(pressed).toContain('aria-pressed:bg-[var(--surface-pressed)]')
    expect(pressed).toContain('aria-pressed:text-[color:var(--fg-pressed)]')
  })

  it('opts into the WebKit tab order explicitly', () => {
    expect(
      pressed,
      'Without tabIndex={0}, chips are mouse-only in Safari for users who have not ' +
        'turned on "press Tab to highlight each item" — which is the default.',
    ).toContain('tabindex="0"')
  })
})

describe('Reveal', () => {
  it('server-renders its content, never a hidden shell', () => {
    const html = render(Reveal, { children: 'Visible copy' })
    expect(
      html,
      'Reveal only ever ADDS the .in class from the client. If it rendered a hidden ' +
        'state itself, a recruiter behind a script blocker would get a blank page ' +
        'and never know it.',
    ).toContain('Visible copy')
    expect(html).toContain('class="rv"')
    expect(html).not.toContain('opacity')
  })

  it('the hidden state is scoped to @media (scripting: enabled)', () => {
    const scoped = /@media \(scripting: enabled\)\s*\{([\s\S]*?)\n\s{2}\}/.exec(GLOBALS)?.[1] ?? ''
    expect(scoped, '.rv { opacity: 0 } must live inside the scripting query').toMatch(
      /\.rv\s*\{\s*opacity:\s*0/,
    )
    expect(GLOBALS).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.rv\s*\{[\s\S]*?opacity:\s*1\s*!important/)
  })

  it('supplies no motion of its own when asked not to', () => {
    expect(render(Reveal, { motion: 'none', as: 'hr' })).not.toContain('rv')
  })
})

describe('Stat and Figure keep a place for the caveat', () => {
  it('Stat renders its note', () => {
    const html = render(Stat, {
      value: '1,325',
      label: 'recording passes',
      note: 'Coursework scale, not production.',
    })
    expect(
      html,
      'A number with nowhere to put its caveat invites the caveat to be dropped. ' +
        "This portfolio's figures are load-bearing and most of them carry a limit " +
        'that is part of the signal.',
    ).toContain('Coursework scale, not production.')
    expect(html).toContain('data-numeric')
  })

  it('Figure renders a caption when given one', () => {
    const html = render(Figure, { caption: 'Confusion matrix, held-out split.' })
    expect(html).toContain('Confusion matrix, held-out split.')
  })
})

/* ══ 5. scale ═════════════════════════════════════════════════════════════ */

describe('the type and geometry rules hold as written', () => {
  it('the display face never sets type below 26px', () => {
    /**
     * Rule 2. Montserrat's weakest register is 16-20px, where a geometric sans
     * is wide and undifferentiated — so --text-h3, the record title, is set in
     * the BODY face at 500. The trap is a record title arriving in the display
     * face by omission.
     */
    const h3 = /--text-h3:\s*clamp\(([^)]*)\)/.exec(GLOBALS)?.[1] ?? ''
    expect(h3, '--text-h3 should top out at 20px').toContain('1.25rem')
    expect(
      componentSource('Entry'),
      'Entry titles use text-h3, which is the body face. A font-display on the ' +
        'record title is the weakest thing this system can produce.',
    ).not.toMatch(/<Heading[^>]*font-display/)
  })

  it('the radius scale is clamped and the shadow namespaces are cleared', () => {
    expect(GLOBALS).toContain('--radius-*: initial')
    expect(GLOBALS).toContain('--shadow-*: initial')
    expect(GLOBALS).toContain('--drop-shadow-*: initial')
    const radii = [...GLOBALS.matchAll(/--radius-(?!\*)[a-z0-9]+:\s*(\d+)px/g)].map((m) =>
      Number.parseInt(m[1] as string, 10),
    )
    expect(radii.length).toBeGreaterThan(4)
    expect(
      Math.max(...radii),
      "This page's objects are RECORDS separated by hairlines, and a record has no " +
        'corner. 4px is the ceiling; `rounded-3xl shadow-lg` must not be able to ' +
        'produce a pill-shaped floating card.',
    ).toBeLessThanOrEqual(4)
  })

  it('the reading measure is narrower than the page measure', () => {
    const wrap = /--container-wrap:\s*([\d.]+)rem/.exec(GLOBALS)?.[1]
    const prose = /--container-prose:\s*([\d.]+)rem/.exec(GLOBALS)?.[1]
    expect(wrap).toBeDefined()
    expect(prose).toBeDefined()
    expect(
      Number(prose),
      'Research prose set to the full 1088px page measure is unreadable — there is ' +
        'no reliable return sweep. That is why this system has two measures where ' +
        'the reference has one.',
    ).toBeLessThan(Number(wrap))
  })

  it('the skip link is styled for the ground it cannot know about', () => {
    const skip = /\.skip\s*\{([\s\S]*?)\}/.exec(GLOBALS)?.[1] ?? ''
    expect(
      skip,
      'The skip link renders above everything and cannot know what is underneath ' +
        'it, so it paints its own paper ground and its own crimson — 7.43:1 — ' +
        "rather than reading the band's roles. A keyboard user's first Tab must not " +
        'land on something invisible over the dark hero.',
    ).toMatch(/background:\s*var\(--color-paper\)/)
    expect(skip).toMatch(/color:\s*var\(--color-crimson\)/)
    expect(GLOBALS, 'and it must actually come on screen when focused').toMatch(
      /\.skip:focus\s*\{[^}]*left:\s*\d+px/,
    )
  })
})
