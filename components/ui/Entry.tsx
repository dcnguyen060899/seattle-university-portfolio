import type { ReactNode } from 'react';
import { cx } from './system';

export type EntryProps = {
  /**
   * The left rail. A date (`"Mar 2026 —"`), a course code (`"CPSC 5330"`), a
   * venue. Set in mono with tabular figures so a column of dates aligns.
   */
  rail: string;
  title: string;
  /** One line under the title. `"Graduate Research Assistant · Seattle University"`. */
  meta?: string;
  children?: ReactNode;
  /** Foot of the entry — usually one or two `<Btn variant="quiet">`. */
  actions?: ReactNode;
  /** Heading level. Default `h3`; use `h4` for a nested list of entries. */
  as?: 'h3' | 'h4';
  className?: string;
};

/**
 * A RECORD: a mono rail, a title, a body, separated from the next record by a
 * hairline. This — not a photo card — is the page's repeating object, because
 * the content is a list of dated, cited work rather than a portfolio of
 * images.
 *
 * THE TRAP THIS CLOSES: the reference's `Card` is a 3:2 photograph tile, and
 * porting it would have imported a photo grid this content cannot fill. An
 * evidence page built out of card components ends up padding each card with
 * an image it does not have, or shipping empty frames. `Entry` has no fill,
 * no border and no shadow; the hairline and the rail do all the work, and an
 * entry with nothing but a rail and a title still looks deliberate.
 *
 * The two-column grid, the rail collapsing above the title under 640px, and
 * the "rule between rows, none above the first" behaviour are lifted from
 * docs/css/news.css, which already solved this on the current site. Keeping
 * that shape means the rebuilt page and the surviving legacy news.html read
 * as one site instead of two.
 */
export function Entry({
  rail,
  title,
  meta,
  children,
  actions,
  as = 'h3',
  className,
}: EntryProps) {
  const Heading = as;

  return (
    <article
      className={cx(
        'grid gap-x-8 gap-y-2 border-t border-[color:var(--edge)] py-[26px]',
        'grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline',
        className,
      )}
    >
      <div
        data-numeric
        className="font-mono text-eyebrow uppercase text-[color:var(--fg-muted)]"
      >
        {rail}
      </div>
      <div>
        <Heading className="text-h3">{title}</Heading>
        {meta !== undefined && (
          <p className="mt-[4px] font-mono text-fine text-[color:var(--fg-muted)]">
            {meta}
          </p>
        )}
        {children !== undefined && (
          <div className="mt-[12px] text-[color:var(--fg-muted)] [&>p+p]:mt-[10px]">
            {children}
          </div>
        )}
        {actions !== undefined && (
          <div className="mt-[14px] flex flex-wrap gap-x-6 gap-y-2">{actions}</div>
        )}
      </div>
    </article>
  );
}
