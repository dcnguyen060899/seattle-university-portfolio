import type { ReactNode } from 'react';
import { cx, groundFor, type SurfaceTone } from './system';

export type EyebrowProps = {
  children: ReactNode;
  /**
   * The ground this label sits on. OMIT IT inside a `<Band>` — the label then
   * inherits the band's ground and picks the AA-safe crimson automatically.
   * Pass it only when the label sits on a ground `<Band>` did not paint.
   */
  tone?: SurfaceTone;
  /** `'h2'` is for a band whose ONLY heading is the eyebrow itself. */
  as?: 'div' | 'span' | 'p' | 'h2';
  className?: string;
};

/**
 * Wide-tracked uppercase small caps: 11px / 500 / 0.16em, in the MONO face.
 * The cheapest premium signal in the system.
 *
 * THE TRAP THIS CLOSES: this is the most accent-bearing element on the page —
 * every band opens with one — so it is the single most likely place to get the
 * 2.34:1 crimson-on-ink failure wrong. It therefore names no colour at all.
 * It reads `--fg-accent`, and the ground resolves that to crimson on paper
 * (7.43:1), crimson-lift on ink (5.68:1) or rose on crimson (5.60:1). Every
 * one of those clears AA at 11px.
 *
 * WHY MONO, where the reference sets this in its body sans: two reasons that
 * agree. docs/css/news.css on the current site already sets its eyebrow in
 * mono, so the rebuilt page and the surviving legacy pages read as one site;
 * and this portfolio's vernacular IS monospaced — P@1, CPSC 5330, macro-F1,
 * .iid/.itd/.bf. Mono is already wide, so the tracking drops from the
 * reference's 0.18em to 0.16em.
 */
export function Eyebrow({ children, tone, as = 'div', className }: EyebrowProps) {
  const Tag = as as 'div';

  return (
    <Tag
      data-ground={groundFor(tone)}
      className={cx(
        'font-mono text-eyebrow uppercase text-[color:var(--fg-accent)]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
