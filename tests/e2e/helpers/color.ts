/**
 * WCAG 2.x contrast maths, in Node.
 *
 * Ported from the reference repo (REF/tests/e2e/helpers/color.ts). The maths is
 * identical — it is the WCAG formula and there is only one of it. What changed
 * is the palette knowledge at the bottom, and the direction of the trap it
 * guards.
 *
 * THE TRAP THIS FILE EXISTS FOR, stated once:
 *
 *   --color-crimson #AA0000 on paper #FBFAF8  = 7.43:1  safe at any size
 *   --color-crimson #AA0000 on ink   #14161A  = 2.34:1  fails AA body (4.5),
 *                                               AA large (3) AND the 1.4.11
 *                                               non-text minimum (3), all at
 *                                               once — so on ink it is illegal
 *                                               as text, as a rule, as a
 *                                               border, as an icon and as a
 *                                               focus ring.
 *   --color-crimson-lift #FF5252 on ink       = 5.68:1  the only red legal on ink
 *   --color-crimson-lift #FF5252 on paper     = 3.06:1  the MIRROR trap:
 *                                               >=24px display and UI only
 *
 * It points the OPPOSITE way from the reference's brass trap (which was safe on
 * dark and marginal on light), which is exactly why an engineer porting by
 * muscle memory would guard the wrong ground. The whole `[data-ground]`
 * mechanism in app/globals.css exists to make the 2.34:1 combination
 * unreachable from the component API; this module is how the rendered page is
 * asked to prove it.
 */

export interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

/** Parses `rgb(r, g, b)`, `rgba(r, g, b, a)`, `color(srgb …)`, `#rgb`, `#rrggbb`, `#rrggbbaa`. */
export function parseColor(value: string): Rgb | null {
  const input = value.trim().toLowerCase()

  if (input === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(input)
  if (hex?.[1]) {
    const digits = hex[1]
    const expand = (s: string): number => Number.parseInt(s.length === 1 ? s + s : s, 16)
    if (digits.length === 3) {
      return {
        r: expand(digits[0] as string),
        g: expand(digits[1] as string),
        b: expand(digits[2] as string),
        a: 1,
      }
    }
    return {
      r: expand(digits.slice(0, 2)),
      g: expand(digits.slice(2, 4)),
      b: expand(digits.slice(4, 6)),
      a: digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
    }
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(input)
  if (fn?.[1]) {
    const parts = fn[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((p) => Number.parseFloat(p))
    const [r, g, b, a] = parts
    if (r === undefined || g === undefined || b === undefined) return null
    return { r, g, b, a: a === undefined || Number.isNaN(a) ? 1 : a }
  }

  /**
   * `color(srgb 0.666 0 0)`. Chromium serialises `color-mix(in srgb, …)` this
   * way, and `--edge` on all three grounds is a color-mix. Without this branch
   * every edge sample parses as null and silently drops out of the sweep —
   * which is how a contrast test quietly stops testing anything.
   */
  const srgb = /^color\(\s*srgb\s+([^)]+)\)$/.exec(input)
  if (srgb?.[1]) {
    const parts = srgb[1]
      .split(/[\s/]+/)
      .filter(Boolean)
      .map((p) => Number.parseFloat(p))
    const [r, g, b, a] = parts
    if (r === undefined || g === undefined || b === undefined) return null
    return { r: r * 255, g: g * 255, b: b * 255, a: a === undefined || Number.isNaN(a) ? 1 : a }
  }

  return null
}

/** Composites a possibly-translucent colour over an opaque backdrop. */
export function flatten(fg: Rgb, backdrop: Rgb): Rgb {
  const a = fg.a
  return {
    r: fg.r * a + backdrop.r * (1 - a),
    g: fg.g * a + backdrop.g * (1 - a),
    b: fg.b * a + backdrop.b * (1 - a),
    a: 1,
  }
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number): number => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * WCAG "large text": >= 24px, or >= 18.66px when bold (>= 700).
 *
 * NOTE FOR THIS PALETTE: the display face is set at weight 200-300, never 700,
 * so the 18.66px-bold branch is effectively dead here and the only route to the
 * 3:1 allowance is a genuine 24px. That is deliberate on the design side —
 * globals.css rule 2 gives the display face a 26px floor — and it means a
 * 19px crimson-lift heading on paper (3.06:1) is a REAL failure, not a
 * rounding argument.
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  if (fontSizePx >= 24) return true
  return fontSizePx >= 18.66 && fontWeight >= 700
}

export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5
}

/** The palette, as measured in app/globals.css. Values, not vibes. */
export const GROUND_TOKENS = {
  paper: '#FBFAF8',
  paperSunk: '#F1EFEB',
  ink: '#14161A',
  inkRaised: '#1C1F24',
  crimson: '#AA0000',
  crimsonDeep: '#880000',
} as const

export const CRIMSON_TOKENS = {
  /** Legal on light only. 2.34:1 on ink — the trap. */
  crimson: '#AA0000',
  crimsonDeep: '#880000',
  /** Legal on ink only. 3.06:1 on paper — the mirror trap. */
  crimsonLift: '#FF5252',
  /** The crimson ground's muted AND accent role. */
  rose: '#F3D4D4',
} as const

/** Euclidean distance in sRGB. Good enough to say "this IS the token". */
export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)
}

export function isSameColor(a: Rgb, b: Rgb, tolerance = 6): boolean {
  return colorDistance(a, b) <= tolerance
}

/**
 * True for the crimson hue family — red dominant, meaningfully saturated, and
 * not a near-black or near-white.
 *
 * Used to decide whether a painted colour "is the accent" WITHOUT pinning it to
 * one of the four exact tokens. That matters because the token that is correct
 * depends on the ground: pinning to `#AA0000` would let `#FF5252` sail past on
 * paper (3.06:1) and pinning to both would let a hand-tinted third red through.
 * The family test catches every red the page can paint, and then the contrast
 * assertion — not the identity — decides whether it is legal where it landed.
 */
export function isCrimsonFamily(color: Rgb): boolean {
  const { r, g, b } = color
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === 0) return false
  const saturation = (max - min) / max
  // Red dominant by a clear margin, and green/blue near each other (hue ~0deg).
  return (
    r > g &&
    r > b &&
    saturation >= 0.35 &&
    max >= 60 &&
    r - Math.max(g, b) >= 40 &&
    Math.abs(g - b) <= 60
  )
}

/**
 * Rose (#F3D4D4) is in the crimson family by hue but is a near-white TINT: it is
 * the crimson ground's muted role, and on paper it would be invisible. Separated
 * out so a failure message can say which of the four reds it actually found.
 */
export function nearestCrimsonToken(color: Rgb): string {
  let best = 'unknown'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [name, hex] of Object.entries(CRIMSON_TOKENS)) {
    const token = parseColor(hex)
    if (!token) continue
    const d = colorDistance(color, token)
    if (d < bestDistance) {
      bestDistance = d
      best = `${name} ${hex}`
    }
  }
  return bestDistance <= 24 ? best : `an unlisted red rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`
}

/** `contrast(fg over bg)`, for a foreground that may be translucent. */
export function ratioOver(foreground: string, background: string): number | null {
  const fg = parseColor(foreground)
  const bg = parseColor(background)
  if (!fg || !bg) return null
  const opaqueBg = bg.a >= 0.99 ? bg : flatten(bg, { r: 255, g: 255, b: 255, a: 1 })
  return contrastRatio(flatten(fg, opaqueBg), opaqueBg)
}
