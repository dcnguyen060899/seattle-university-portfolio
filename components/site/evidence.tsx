/**
 * components/site/evidence.tsx — the four objects every band on this page is
 * assembled from, and the only place page copy is allowed to reach the corpus.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * `lib/corpus` already refuses to hand out a figure that is not licensed for
 * the surface asking. What it cannot do is stop a band from asking for the
 * WRONG surface, or from rendering a claim while quietly dropping the sentence
 * that keeps it honest. So the bands never call `claimValue(id, surface)`
 * themselves: they call `pageValue(id)`, which pins the surface to the one
 * this route serves, and they render limits through `<Limit>`, which takes
 * claim ids rather than prose — you cannot soften a sentence you did not type.
 *
 * ── THE VOICE RULE, STATED ONCE ───────────────────────────────────────────
 *
 * The page speaks in the FIRST PERSON. It is Duy’s page and the owner asked
 * for his own claim about his own work (Addendum B, R-9).
 *
 * The LIMITS do not. They are rendered verbatim out of the evidence record,
 * in the record’s own third-person register, set apart under an accent rule.
 * That register shift is deliberate and it is the whole argument of the page
 * in one typographic move: the author writes the prose, and the record — which
 * the author cannot edit from here — writes the caveats. A reader who notices
 * that the limits are quoted rather than paraphrased has understood the point.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────
 *
 * No colour. Every element below reads a ground role (`--fg`, `--fg-muted`,
 * `--fg-accent`, `--edge`), so the same component is correct on paper, on ink
 * and on crimson. `scripts/check-ground-tokens.mjs` enforces it and its
 * allowlist is empty.
 */

import type { ReactNode } from 'react';
import { Btn } from '@/components/ui';
import { artifactById, claimById, claimShort, claimText, claimValue } from '@/lib/corpus';
import { artifactLink, formatPeriod } from '@/lib/corpus/surfaces';
import type { ArtifactId, ClaimId } from '@/lib/corpus';

/**
 * The surface this route serves. Pinned here rather than passed by each band,
 * because a band that could choose its own surface could choose one that
 * licenses a figure the page is not allowed to show.
 */
const SURFACE = 'page' as const;

/** A licensed figure, exactly as the corpus renders it. */
export const pageValue = (id: ClaimId): string => claimValue(id, SURFACE);

/** A licensed sentence, exactly as the corpus writes it. */
export const pageText = (id: ClaimId): string => claimText(id, SURFACE);

/** A licensed short form — chip and readout length. */
export const pageShort = (id: ClaimId): string => claimShort(id, SURFACE);

/**
 * HIS OWN WORDS, where the record kept them.
 *
 * Some claims carry a `quote` — the sentence the owner actually wrote, before
 * the corpus restated it in its third-person register. Where one exists, the
 * page prefers it: it is the same fact, in the voice the page is written in,
 * and it needs no rewriting to sit in a first-person paragraph.
 *
 * Throws when the claim has no quote, rather than falling back to the
 * statement, because a silent fallback is how a hand-written sentence quietly
 * becomes a paraphrase nobody reviewed.
 */
export function pageQuote(id: ClaimId): string {
  pageText(id);
  const quote = claimById(id).quote;
  if (!quote) throw new Error(`corpus: ${id} carries no quote to render`);
  return quote;
}

/**
 * The e-mail addresses, read out of the one record that carries them.
 *
 * The corpus keeps contact details inside a sentence rather than as fields, so
 * this lifts them back out with a pattern instead of restating them as
 * literals. Typing them again here would create a second place an address can
 * be wrong, which is the whole failure mode `lib/corpus` exists to close — and
 * a wrong address on a job-hunt page is the most expensive typo on the site.
 *
 * Throws rather than returning an empty list: no addresses means the record
 * changed shape, and a contact section that silently renders nothing is worse
 * than a build that stops.
 */
export function contactEmails(id: ClaimId): string[] {
  const found = pageText(id).match(/[\w.+-]+@[\w-]+\.[\w.-]*[\w-]/g) ?? [];
  if (found.length === 0) {
    throw new Error(`corpus: ${id} no longer contains an e-mail address to render`);
  }
  return found;
}

/**
 * The dates a licensed claim covers, formatted by the corpus’s own renderer.
 *
 * Goes through the licence gate first, so a rail cannot print a period for a
 * claim the page is not allowed to show. `formatPeriod` renders an open end as
 * “present” rather than as a guessed date — two of these positions are ongoing.
 */
export function pagePeriod(id: ClaimId): string {
  pageText(id);
  return formatPeriod(claimById(id).period);
}

/**
 * ONE number out of a metric claim's value block, by position.
 *
 * Some figures are compound — the retrieval result is a floor, a frozen score
 * and a fine-tuned score in one string — and the hero has to set them in three
 * different places in the threshold device. Splitting the rendered display
 * string with a regular expression would be a second, unversioned parser for
 * the corpus; reading `value.numbers` is reading the field the corpus already
 * keeps for exactly this, and which the post-build numeric gate licenses from.
 *
 * `expect` is not decoration. If the corpus grows or reorders that array, the
 * copy that reads position 2 is now reading a different number, and the only
 * safe outcome is a build that stops. The barn-owl figures in particular are
 * live (Addendum A.5) and are refreshed by `npm run corpus:refresh:fischer`.
 */
export function figureAt(id: ClaimId, index: number, expect: number): string {
  // The licence gate first: throws if the claim is unknown, unasserted, not a
  // metric, or not licensed for this surface. Everything below is then safe.
  pageValue(id);

  const value = claimById(id).value;
  if (!value) throw new Error(`corpus: ${id} is a metric with no value block`);

  if (value.numbers.length !== expect) {
    throw new Error(
      `corpus: ${id} now carries ${value.numbers.length} numbers, not ${expect}. ` +
        `Page copy reads position ${index} of that array by hand — re-check the copy ` +
        `in components/site/ before changing this expectation.`,
    );
  }

  const found = value.numbers[index];
  if (found === undefined) {
    throw new Error(`corpus: ${id} has no number at position ${index}`);
  }
  return found;
}

/* ── LIMITS ─────────────────────────────────────────────────────────────── */

export type LimitProps = {
  /**
   * Caveat claim ids. Every mandatory caveat of every claim the band renders
   * must appear here — corpus check C10 fails the build otherwise, which is
   * the mechanism that makes the BI-RADS majority-class sentence and the
   * “in flight, not shipped” rider impossible to drop by forgetting.
   */
  ids: readonly ClaimId[];
  /**
   * An extra limit the band authors itself. Used in exactly one place, and the
   * band that uses it says why in a comment beside the call.
   */
  children?: ReactNode;
  className?: string;
};

/**
 * The stated-limits block.
 *
 * A doubled 2px accent rule above it, not a tinted box: the system has one
 * accent and no error hue, and `--fg-accent` at full opacity clears 1.4.11 on
 * every ground (paper 7.43:1, ink 5.68:1, crimson 5.60:1). A coloured “warning
 * box” would need a second hue nothing has measured.
 */
export function Limit({ ids, children, className }: LimitProps) {
  return (
    <aside
      className={[
        'mt-[26px] border-t-2 border-[color:var(--fg-accent)] pt-[14px]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/*
        The label says where the sentences come from, because they are the one
        register shift on the page: the prose is his, in the first person; the
        limits are the evidence record’s, in its own third person, and they are
        quoted rather than restated so that softening one is not something this
        file can do.
      */}
      <p className="font-mono text-micro uppercase text-[color:var(--fg-accent)]">
        Stated limits — quoted from the record
      </p>
      <ul className="mt-[10px] grid gap-[8px]">
        {ids.map((id) => (
          <li
            key={id}
            className="text-[0.85rem] leading-[1.6] text-[color:var(--fg-muted)]"
          >
            {pageText(id)}
          </li>
        ))}
        {children}
      </ul>
    </aside>
  );
}

/* ── READOUT ────────────────────────────────────────────────────────────── */

export type ReadoutProps = {
  /** Pre-formatted, and from the corpus. Mono, because it is often long. */
  value: string;
  label: string;
  note?: string;
  className?: string;
};

/**
 * A measured figure and what it is a figure of.
 *
 * `<Stat>` sets its value in the display face at 32–48px, which is right for
 * a short number and wrong for `195 neurons · 1,325 passes · 30,147 raw files`
 * — a compound readout at 48px wraps to three lines and stops reading as one
 * fact. This is the same object in the mono register: same hairline, same
 * label treatment, same tabular figures, a value that can be a sentence long.
 */
export function Readout({ value, label, note, className }: ReadoutProps) {
  return (
    <div
      data-numeric
      className={[
        'border-t border-[color:var(--edge)] pt-[18px] pb-[4px]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="font-mono text-data text-[color:var(--fg-accent)]">{value}</p>
      <p className="mt-[10px] font-mono text-micro uppercase text-[color:var(--fg-muted)]">
        {label}
      </p>
      {note !== undefined && (
        <p className="mt-[8px] text-[0.8rem] leading-[1.55] text-[color:var(--fg-muted)]">
          {note}
        </p>
      )}
    </div>
  );
}

/* ── ARTIFACT ACTIONS ───────────────────────────────────────────────────── */

export type EvidenceLinkProps = {
  id: ArtifactId;
  /** Overrides the artifact's own title. Use it to make the verb explicit. */
  label?: string;
  className?: string;
};

/**
 * A link to a piece of evidence — or, where there is nothing to link, a plain
 * statement that it exists and why it is not public.
 *
 * `artifactLink()` returns no href for anything `under-review`, `on-request`
 * or `private`, and this component renders that state as text rather than as a
 * dead link. A manuscript under review at PSB cannot be linked; a 404 on a
 * portfolio is worse than a sentence saying so.
 *
 * External links get `rel="noopener noreferrer"` and `target="_blank"`;
 * anything under this origin opens in place.
 */
export function EvidenceLink({ id, label, className }: EvidenceLinkProps) {
  const link = artifactLink(id);
  const text = label ?? link.title;

  if (link.href === null) {
    return (
      <p
        className={['font-mono text-fine text-[color:var(--fg-muted)]', className ?? '']
          .filter(Boolean)
          .join(' ')}
      >
        {text} — {link.note}
      </p>
    );
  }

  const external = /^https?:\/\//.test(link.href) && !link.href.includes('duyng-portfolio.com');

  return (
    <Btn
      href={link.href}
      variant="quiet"
      className={className}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {text}
    </Btn>
  );
}

/** The bare URL of a public artifact, for prose that needs to print it. */
export function artifactUrl(id: ArtifactId): string {
  const artifact = artifactById(id);
  if (artifact.access !== 'public' || !artifact.url) {
    throw new Error(
      `corpus: ${id} is ${artifact.access} and has no public URL to print`,
    );
  }
  return artifact.url;
}
