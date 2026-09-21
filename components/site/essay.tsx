/**
 * components/site/essay.tsx — the long-form register, shared by every essay
 * under app/essays/.
 *
 * An essay is not a band. The home page's bands each argue one short thing in
 * a few sentences; an essay is thousands of words of continuous prose. So
 * these primitives set type the home page already sets — the serif for the
 * title (the title of his work, per app/layout.tsx), the display face for
 * section headings, Inter at the reading measure for the body — and add only
 * what long-form needs: a paragraph rhythm, an ordered list, an inline link
 * that is visible before it is hovered, and a source list.
 *
 * Every colour below is a ground ROLE (--fg, --fg-muted, --fg-accent), never a
 * palette token, so scripts/check-ground-tokens.mjs passes and the essays are
 * correct on any ground. They are only ever set on `paper` today.
 *
 * ── TWO TRAPS, BOTH HIT ONCE ALREADY ───────────────────────────────────────
 *
 * 1. <EssayBody> DOES NOT WRAP ITS CHILDREN IN <Reveal>, AND MUST NOT.
 *    <Reveal> observes with `threshold: 0.15`, so an element only reveals once
 *    15% of it is on screen at the same time. An essay body is over 12,000px
 *    tall; 15% of that is about two viewports, which can never be visible at
 *    once, so the observer never fires and the whole essay stays at
 *    `opacity: 0` — invisible, with the build green and the HTML correct. It
 *    was written that way first and caught in the browser. <Reveal> is for
 *    things SHORTER than the viewport; the lede in <EssayHeader> uses it.
 *
 * 2. <EssayBody> IS NOT `<Band prose>`. That prop puts `.prose-measure` on the
 *    same element as `.wrap`; the narrower max-width wins and `.wrap`'s
 *    `margin-inline: auto` CENTRES the reading column, so the body would sit
 *    in the middle of the page while the title above it starts at the gutter.
 *    The home page's idiom is a full-width wrap with each element carrying
 *    `max-w-[var(--container-prose)]`, left-aligned. Every primitive here
 *    carries that measure itself.
 */

import type { ReactNode } from 'react';

import { Band, Eyebrow, Reveal } from '@/components/ui';

/** The paragraph and heading measure, in one place. */
const MEASURE = 'max-w-[var(--container-prose)]';

/**
 * The inline link, for a link that sits inside a sentence.
 *
 * NOT the footer's `decoration-transparent`: a link in running prose has to be
 * distinguishable from the words around it before anyone hovers it (WCAG
 * 1.4.1 — colour alone is not enough, and here the colour does not even
 * change at rest). So the underline is always drawn, in the muted role, and
 * takes the accent on hover.
 */
const LINK =
  'underline decoration-1 underline-offset-4 decoration-[color:var(--fg-muted)] hover:decoration-[color:var(--fg-accent)] hover:text-[color:var(--fg)]';

/** The title band: eyebrow, the title in the serif, and one sentence of lede. */
export function EssayHeader({
  date,
  title,
  lede,
}: {
  /** Month and year, as the reader should see it: `September 2026`. */
  date: string;
  title: string;
  lede: ReactNode;
}) {
  return (
    <Band tone="paper" id="top">
      <Eyebrow>Essay · {date}</Eyebrow>

      <h1 className="mt-[14px] max-w-[20ch] font-serif text-h1">{title}</h1>

      <Reveal index={1}>
        <p className={`mt-[26px] ${MEASURE} text-lede text-[color:var(--fg-muted)]`}>{lede}</p>
      </Reveal>
    </Band>
  );
}

/** The body band. Read the two traps at the top of this file before editing. */
export function EssayBody({ children }: { children: ReactNode }) {
  return (
    <Band tone="paper" className="pt-0">
      {children}
    </Band>
  );
}

/**
 * A section heading. No size class: `<h2>` already resolves to the display face
 * at --text-h2 in globals.css, the register every band heading on the home page
 * is set in. A draft that overrode it down to --text-h3 made the headings read
 * as bold body text rather than as section breaks.
 */
export function EssayHeading({ children }: { children: ReactNode }) {
  return <h2 className="mt-[clamp(52px,7vw,84px)] max-w-[24ch]">{children}</h2>;
}

/** A body paragraph at the reading measure. */
export function EssayParagraph({ children }: { children: ReactNode }) {
  return <p className={`mt-[18px] ${MEASURE}`}>{children}</p>;
}

/**
 * A record's caveat, attached to the paragraph above it.
 *
 * Pass it `pageText(...)` — the corpus's own sentence, never a retyped one.
 * Set as fine print in the muted role, the same treatment the highlights band
 * gives the same caveats: the register shift between his prose and the
 * record's qualification is carried by size and colour, so the essay's wording
 * is untouched and the caveat is still impossible to miss.
 */
export function EssayNote({ children }: { children: ReactNode }) {
  return <p className={`mt-[10px] ${MEASURE} text-fine text-[color:var(--fg-muted)]`}>{children}</p>;
}

/** A link inside a sentence. Off-site links open in a new tab. */
export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      className={LINK}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

/**
 * A numbered list — the one list an essay is allowed. Tailwind's preflight
 * strips list markers, so they are restored here, in the muted role.
 */
export function EssayList({ children }: { children: ReactNode }) {
  return (
    <ol className={`mt-[18px] ${MEASURE} list-decimal pl-[1.4rem] marker:text-[color:var(--fg-muted)]`}>
      {children}
    </ol>
  );
}

/** One item: a bold lead-in that states the step, then the reasoning. */
export function EssayListItem({ lead, children }: { lead: string; children: ReactNode }) {
  return (
    <li className="mt-[14px] pl-[0.25rem] first:mt-0">
      <strong className="font-medium text-[color:var(--fg)]">{lead}</strong> {children}
    </li>
  );
}

/** The source list: fine print, one entry per work, each a link a reader can open. */
export function SourceList({ children }: { children: ReactNode }) {
  return <ul className={`mt-[18px] ${MEASURE} list-none`}>{children}</ul>;
}

export function Source({ href, children }: { href?: string; children: ReactNode }) {
  return (
    <li className="mt-[10px] text-fine text-[color:var(--fg-muted)]">
      {href === undefined ? children : <InlineLink href={href}>{children}</InlineLink>}
    </li>
  );
}

/** The closing row of links to the other essay and the record. */
export function EssayLinks({ links }: { links: ReadonlyArray<{ href: string; label: string }> }) {
  return (
    <div className="mt-[26px] flex flex-wrap gap-x-8 gap-y-3 text-fine">
      {links.map((link) => (
        <InlineLink key={link.href} href={link.href}>
          {link.label}
        </InlineLink>
      ))}
    </div>
  );
}
