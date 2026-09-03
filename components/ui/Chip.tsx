'use client';

import type { ReactNode } from 'react';
import { cx } from './system';

export type ChipProps = {
  children: ReactNode;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

/**
 * A toggle in the eyebrow's voice — 10.5px mono, 500, uppercase, 0.14em, 3px
 * radius. The recruiter agent's role selector (Research Scientist / Data
 * Scientist / ML Engineer / Data Engineer) is built from these.
 *
 * THE TRAP THIS CLOSES — and this is the one place the Seattle palette comes
 * out ahead of the reference. A pressed chip fills, which makes the chip its
 * own light surface, and the label then has to be re-measured against that
 * fill rather than against the band. In the reference, brass on brass-wash is
 * 4.39:1, so the pressed label had to fall back to plain ink and the accent
 * was carried by the fill alone. Here the fill and the pressed foreground are
 * BOTH ground-resolved (`--surface-pressed` / `--fg-pressed`), so the pressed
 * label keeps the accent on every ground and nothing is hand-picked:
 *
 *   paper    crimson #AA0000 on wash    #F5E6E4   6.39:1
 *   ink      lift    #FF5252 on raised  #1C1F24   5.18:1
 *   crimson  white   #FFFFFF on deep    #880000  10.26:1
 *
 * That is why this component is NOT an exception to the "name no colour" rule
 * the way the design spec proposed. `scripts/check-ground-tokens.mjs` has an
 * empty allowlist, which is a stronger guarantee than a one-line one.
 *
 * STATE IS NEVER COLOUR ALONE, and the fill is not the state carrier: the
 * pressed fill measures only 1.16:1 (wash on paper), 1.10:1 (raised on ink)
 * and 1.32:1 (deep on crimson) against its own ground, well under 1.4.11's
 * 3:1. The BORDER is what makes the state perceivable — `--fg-accent` at
 * 7.43:1 / 5.68:1 / 5.60:1 against the ground — and `aria-pressed` carries it
 * for assistive technology. Do not "simplify" this by dropping the border.
 */
export function Chip({ children, pressed, onClick, disabled, className }: ChipProps) {
  return (
    <button
      type="button"
      // WebKit Tab-order opt-in — without this, chips are mouse-only in Safari
      // for users who have not turned on "press Tab to highlight each item".
      tabIndex={0}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'cursor-pointer rounded-brand border px-[14px] py-3 text-left',
        'font-mono text-micro uppercase',
        'border-[color:var(--edge)] bg-transparent text-[color:var(--fg)]',
        'transition-[background-color,color,border-color] duration-200 ease-brand',
        'hover:border-[color:var(--fg-accent)]',
        'aria-pressed:border-[color:var(--fg-accent)]',
        'aria-pressed:bg-[var(--surface-pressed)]',
        'aria-pressed:text-[color:var(--fg-pressed)]',
        'disabled:cursor-not-allowed disabled:opacity-55',
        'motion-reduce:transition-none',
        className,
      )}
    >
      {children}
    </button>
  );
}
