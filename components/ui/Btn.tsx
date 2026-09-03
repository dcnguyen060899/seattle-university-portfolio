import type { ReactNode } from 'react';
import { cx } from './system';

export type BtnProps = {
  children: ReactNode;
  /** Renders an `<a>`. Mutually exclusive with `type`/`onClick`. */
  href?: string;
  /** Present only when this is a real button. */
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'ghost' | 'quiet';
  /** Forwarded verbatim — a link out of the site should say so. */
  target?: string;
  rel?: string;
  className?: string;
};

/**
 * The site's action, in three weights:
 *
 *   solid  the primary action. Fills with the ground's own FOREGROUND, so it
 *          comes out ink-on-paper, paper-on-ink and crimson-on-white without
 *          the caller choosing anything.
 *   ghost  a hairline outline. Secondary actions and nav.
 *   quiet  a bare accent label that underlines on hover — the "read the
 *          paper" / "view the repo" idiom this page needs a dozen times. The
 *          reference open-codes it twice in CSS modules; here it is a variant.
 *
 * THE TRAP THIS CLOSES: a filled button inverts the contrast relationship, so
 * a hand-picked fill colour has to be re-measured against the label rather
 * than against the page. Resolving the fill from `--fg` and the label from
 * `--ground` means the pair is always a ground/foreground pair that has
 * already been measured. On hover the fill becomes `--fg-accent`, and every
 * resulting pair still clears AA at 10.5px:
 *
 *   paper   ground #FBFAF8 on crimson fill #AA0000  7.43:1
 *   ink     ground #14161A on lift fill    #FF5252  5.68:1
 *   crimson ground #AA0000 on rose fill    #F3D4D4  5.60:1
 *   crimson at rest: crimson on white fill #FFFFFF  7.75:1
 *
 * Accent appears only on hover for solid/ghost, which keeps a page full of
 * actions well under the accent budget at rest.
 */
export function Btn({
  children,
  href,
  type,
  onClick,
  disabled,
  variant = 'solid',
  target,
  rel,
  className,
}: BtnProps) {
  const shared = cx(
    'font-mono text-micro uppercase no-underline',
    'transition-[background-color,color,border-color,text-decoration-color] duration-200 ease-brand',
    'motion-reduce:transition-none',
  );

  const skin =
    variant === 'solid'
      ? cx(
          'inline-block rounded-brand px-[22px] py-[14px]',
          'bg-[var(--fg)] text-[color:var(--ground)]',
          'hover:bg-[var(--fg-accent)]',
        )
      : variant === 'ghost'
        ? cx(
            'inline-block rounded-brand px-[22px] py-[14px]',
            'border border-[color:var(--edge)] text-[color:var(--fg)]',
            'hover:border-[color:var(--fg-accent)] hover:text-[color:var(--fg-accent)]',
          )
        : cx(
            'inline-block text-[color:var(--fg-accent)]',
            'underline decoration-transparent decoration-1 underline-offset-4',
            'hover:decoration-[color:var(--fg-accent)]',
            'focus-visible:decoration-[color:var(--fg-accent)]',
          );

  if (href !== undefined) {
    return (
      <a href={href} target={target} rel={rel} className={cx(shared, skin, className)}>
        {children}
      </a>
    );
  }

  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'cursor-pointer disabled:cursor-not-allowed disabled:opacity-55',
        shared,
        skin,
        className,
      )}
    >
      {children}
    </button>
  );
}
