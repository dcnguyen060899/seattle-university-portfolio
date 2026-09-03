import type { ReactNode } from 'react';
import { cx } from './system';

export type FigureProps = {
  /** The media that fills the 16:9 frame — usually a `next/image`. */
  children?: ReactNode;
  /** Wraps the whole figure in a link. */
  href?: string;
  /** Set when `href` leaves the site. */
  target?: string;
  rel?: string;
  caption?: string;
  /** A source line. `"cheap-as-electricity.com · D3.js + Scrollama.js"`. Mono. */
  credit?: string;
  /** Placeholder text shown when no media has been supplied yet. */
  label?: string;
  className?: string;
};

/**
 * A screen capture in a locked 16:9 frame.
 *
 * THE TRAP THIS CLOSES: a mixed-aspect image row. The reference's `Card` is a
 * 3:2 architectural-photography crop; every image on this site is a picture
 * of a screen — the scrollytelling piece, the D3 acts, the ER diagram, the
 * DATA 5100 charts — and screens are 16:9. Locking the crop on the primitive
 * is what makes a row of them read as one system rather than as a folder of
 * screenshots at whatever size they were taken.
 *
 * `Figure` owns the FRAME, not the loader: the caller passes its own
 * `next/image` so sizing, priority and remote patterns stay where the page
 * can see them.
 *
 * No shadow, no border, 3px radius, and the only treatment is a hover scale
 * that `motion-reduce:` cancels. The caption is body text; the credit is mono,
 * because a credit is a label.
 *
 * A plain `<a>`, not `next/link`, and deliberately: most of what this page
 * links to is a legacy static page under /docs/ or an external site, neither
 * of which is a Next route. `next/link` would prefetch a route that does not
 * exist and then hard-navigate anyway.
 */
export function Figure({
  children,
  href,
  target,
  rel,
  caption,
  credit,
  label = 'Screen capture — 16:9',
  className,
}: FigureProps) {
  const content = (
    <>
      <figure className="relative aspect-[16/9] overflow-hidden rounded-brand bg-[var(--ground-sunk)]">
        <div
          className={cx(
            'absolute inset-0 transition-transform duration-700 ease-brand',
            'group-hover:scale-[1.03]',
            'motion-reduce:transition-none motion-reduce:group-hover:scale-100',
          )}
        >
          {children}
        </div>
        {children === undefined && (
          <figcaption className="absolute inset-0 grid place-items-center font-mono text-micro uppercase text-[color:var(--fg-muted)]">
            {label}
          </figcaption>
        )}
      </figure>
      {caption !== undefined && <p className="mt-[14px] text-h3">{caption}</p>}
      {credit !== undefined && (
        <p
          data-numeric
          className="mt-[4px] font-mono text-fine text-[color:var(--fg-muted)]"
        >
          {credit}
        </p>
      )}
    </>
  );

  if (href === undefined) {
    return <div className={cx('group block', className)}>{content}</div>;
  }

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={cx('group block text-inherit no-underline', className)}
    >
      {content}
    </a>
  );
}
