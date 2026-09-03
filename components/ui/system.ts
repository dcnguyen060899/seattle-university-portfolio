/**
 * Shared vocabulary for the portfolio UI primitives.
 *
 * The only colour decision a caller ever makes is which GROUND they are on.
 * Everything downstream — text colour, muted colour, which of the three
 * crimson tokens is safe on this surface — is resolved by CSS from
 * `[data-ground]`. See the ground-context block in app/globals.css.
 *
 * Measured with scratchpad/wcag.py (WCAG 2.1, sRGB relative luminance):
 *   --color-crimson       #AA0000 on paper    7.43:1  ok at any size
 *   --color-crimson       #AA0000 on ink      2.34:1  FAILS EVERYTHING —
 *                                             text, rules, borders, icons and
 *                                             focus rings alike. The trap.
 *   --color-crimson-lift  #FF5252 on ink      5.68:1  ok at any size
 *   --color-crimson-lift  #FF5252 on paper    3.06:1  the mirror trap:
 *                                             >=24px display and UI only
 *   --color-rose          #F3D4D4 on crimson  5.60:1  ok at any size
 *   --color-on-ink-muted  #A3A2A8 on crimson  3.06:1  fails body — which is
 *                                             why the crimson ground has its
 *                                             own muted token
 *
 * Neither red is universal and neither may be hand-picked. That is the whole
 * reason this module exports a GROUND type and no colour at all.
 */

import type { CSSProperties } from 'react';

/** The three grounds the site is built from. There is no `bone`. */
export type Ground = 'paper' | 'ink' | 'crimson';

/**
 * `<Band tone>`. Names the ground the section paints.
 *
 * BUDGET, per page: at most TWO `ink` bands and ONE `crimson` band, and the
 * recruiter form is never on either — dark and coloured forms measurably
 * reduce completion, and that form is the commercial point of the page.
 */
export type BandTone = Ground;

/**
 * `<Eyebrow tone>` and friends. `'light'` is the text-side name for the paper
 * ground, so a caller thinking "this label is on a light thing" does not have
 * to know the ground's proper name.
 */
export type SurfaceTone = 'light' | 'ink' | 'crimson';

/**
 * Maps a text-side tone onto its ground.
 *
 * Omitting the tone is the SAFE default: the element then inherits the ground
 * of its nearest `<Band>`, which is always correct. Pass a tone only when the
 * element sits on a ground `<Band>` did not paint — the mark plate, an
 * inverted panel, a nav over a dark hero.
 */
export function groundFor(tone: SurfaceTone | undefined): Ground | undefined {
  if (tone === undefined) return undefined;
  if (tone === 'ink') return 'ink';
  if (tone === 'crimson') return 'crimson';
  return 'paper';
}

/** Joins class names, dropping anything falsy. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * The inline style that carries a stagger position into CSS.
 *
 * `.rv`, `.drawline` and `.threshold-rule` all compute their delay as
 * `calc(var(--i, 0) * var(--stagger))`. Publishing the index as a custom
 * property rather than writing `transitionDelay` directly keeps ONE delay
 * mechanism in the system: a caller cannot set a stagger that the stylesheet
 * then silently overrides, and changing the rhythm is one edit in globals.css.
 */
export function staggerStyle(index: number | undefined): CSSProperties | undefined {
  if (index === undefined || index === 0) return undefined;
  return { '--i': index } as CSSProperties;
}
