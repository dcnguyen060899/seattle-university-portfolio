'use client';

/**
 * components/site/agent-panel/BriefView.tsx — the brief itself.
 *
 * TWO RULES THAT ARE NOT NEGOTIABLE, because the honesty of the whole page
 * rests on them:
 *
 *   1. REQUIREMENTS RENDER IN THE ORDER THEY CAME. Never sorted by verdict.
 *      A brief that leads with its strong rows and buries its gaps is exactly
 *      what a hiring manager has learned to discount, and sorting is the
 *      easiest possible way to do it by accident.
 *
 *   2. A `no_evidence` ROW IS FULL WEIGHT AND FULL SIZE. Not dimmed, not
 *      smaller, not collapsed. Dimming a gap is hiding it. The only visual
 *      difference between a gap row and a match row is the marker, the label,
 *      and the absence of a link.
 *
 * VERDICT IS NEVER CARRIED BY COLOUR ALONE (WCAG 1.4.1). Each row carries a
 * marker glyph, a text label, and — only as the third cue — a foreground role.
 * The glyph is `aria-hidden`; the label is real text a screen reader announces
 * in order with the requirement.
 *
 * NAMES NO COLOUR. Every value here is a ground role: `--fg`, `--fg-muted`,
 * `--fg-accent`, `--edge`. `scripts/check-ground-tokens.mjs` fails the build on
 * a palette token, and its allowlist is empty.
 */

import type { BriefEnvelope, BriefRequirement, Verdict } from '@/lib/agent/contracts';
import { Eyebrow, Rule } from '@/components/ui';

const VERDICT_MARKER: Readonly<Record<Verdict, string>> = {
  direct: '▍', // ▍ filled bar
  adjacent: '▏', // ▏ thin bar
  partial: '▕', // ▕ hollow bar
  no_evidence: '—', // — em dash
};

const VERDICT_LABEL: Readonly<Record<Verdict, string>> = {
  direct: 'Direct',
  adjacent: 'Adjacent',
  partial: 'Partial',
  no_evidence: 'No evidence',
};

/** Accent for the two that assert something; muted for the two that qualify. */
function markerClass(verdict: Verdict): string {
  return verdict === 'direct' || verdict === 'adjacent'
    ? 'text-[color:var(--fg-accent)]'
    : 'text-[color:var(--fg-muted)]';
}

function CoverageLine({ coverage }: { coverage: BriefEnvelope['coverage'] }) {
  // The first thing a hiring manager's eye lands on, and the sentence that
  // makes the rest credible. Server-computed from the post-checked verdicts —
  // the model never reports a coverage, so it cannot report one that disagrees
  // with its own rows.
  const parts = [
    coverage.direct > 0 ? `${coverage.direct} direct` : null,
    coverage.adjacent > 0 ? `${coverage.adjacent} adjacent` : null,
    coverage.partial > 0 ? `${coverage.partial} partial` : null,
    `${coverage.no_evidence} with no evidence on this site`,
  ].filter(Boolean);

  return (
    <p
      data-numeric
      className="mt-[14px] font-mono text-eyebrow uppercase text-[color:var(--fg-muted)]"
    >
      {parts.join(' · ')}
    </p>
  );
}

function Row({ requirement, index }: { requirement: BriefRequirement; index: number }) {
  const marker = VERDICT_MARKER[requirement.verdict];
  const label = VERDICT_LABEL[requirement.verdict];

  return (
    <li className="border-t border-[color:var(--edge)] py-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-[18px] gap-y-[4px]">
        <h4 className="flex items-baseline gap-[10px] text-h3">
          <span aria-hidden="true" className={markerClass(requirement.verdict)}>
            {marker}
          </span>
          <span>{requirement.requirement}</span>
        </h4>
        <span
          className={`shrink-0 font-mono text-micro uppercase ${markerClass(requirement.verdict)}`}
        >
          {label}
        </span>
      </div>

      <p className="mt-[10px] text-[color:var(--fg-muted)]">{requirement.rationale}</p>

      {requirement.caveat ? (
        <p className="mt-[8px] border-l border-[color:var(--edge)] pl-[12px] text-[0.9rem] leading-[1.6] text-[color:var(--fg-muted)]">
          {requirement.caveat}
        </p>
      ) : null}

      {requirement.evidence.length > 0 ? (
        <ul className="mt-[12px] grid gap-[6px]">
          {requirement.evidence.map((citation) => (
            <li key={`${index}-${citation.evidence_id}`} className="font-mono text-fine">
              {citation.artifact_url ? (
                <a
                  href={citation.artifact_url}
                  target={citation.artifact_url.startsWith('http') ? '_blank' : undefined}
                  rel={
                    citation.artifact_url.startsWith('http') ? 'noreferrer noopener' : undefined
                  }
                  className="text-[color:var(--fg-accent)] underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-[color:var(--fg-accent)] focus-visible:decoration-[color:var(--fg-accent)] motion-reduce:transition-none"
                >
                  <span aria-hidden="true">{'→ '}</span>
                  {citation.artifact_label}
                </a>
              ) : (
                // A record with no public artifact is still cited. It is named,
                // and it is not dressed up as a link that goes nowhere.
                //
                // NO OPACITY HERE, EVER. Every ratio in globals.css's token
                // table is measured at FULL opacity: --fg-muted #5E5C60 is
                // 6.34:1 on paper, but at opacity .8 it composites to #7D7C7E
                // = 3.98:1, under the 4.5:1 body minimum at this size. Fading a
                // foreground silently invalidates the measurement that licensed
                // it, which is the exact class of failure the ground-context
                // mechanism exists to make unreachable. If this parenthetical
                // ever needs to recede further, that is a new MEASURED token,
                // not an opacity.
                <span className="text-[color:var(--fg-muted)]">
                  <span aria-hidden="true">{'· '}</span>
                  {citation.artifact_label} (no public link)
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function BriefView({ envelope }: { envelope: BriefEnvelope }) {
  const { brief, coverage } = envelope;

  return (
    <article className="mt-[clamp(28px,4vw,40px)]">
      <h3 className="max-w-[34ch] text-[length:clamp(20px,2.2vw,28px)] font-[300] leading-[1.25]">
        {brief.headline}
      </h3>
      <CoverageLine coverage={coverage} />

      {brief.observed_directives.length > 0 ? (
        <p className="mt-[16px] border-l-2 border-[color:var(--fg-accent)] pl-[14px] text-[0.9rem] leading-[1.6] text-[color:var(--fg-muted)]">
          The pasted text contained instructions rather than requirements. They were read as data
          and not followed
          {': '}
          {brief.observed_directives.join('; ')}.
        </p>
      ) : null}

      <ul className="mt-[24px]">
        {brief.requirements.map((requirement, index) => (
          <Row key={`${index}-${requirement.requirement}`} requirement={requirement} index={index} />
        ))}
      </ul>

      {brief.gaps_summary ? (
        <>
          <Rule className="mt-[8px]" />
          <div className="mt-[22px]">
            <Eyebrow>Where the evidence stops</Eyebrow>
            <p className="mt-[10px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)]">
              {brief.gaps_summary}
            </p>
          </div>
        </>
      ) : null}

      {brief.not_claimed.length > 0 ? (
        <div className="mt-[22px]">
          <Eyebrow>Not claimed here</Eyebrow>
          <ul className="mt-[10px] grid gap-[6px] text-[color:var(--fg-muted)]">
            {brief.not_claimed.map((item) => (
              <li key={item} className="text-[0.95rem] leading-[1.6]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.closing ? (
        <p className="mt-[22px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)]">
          {brief.closing}
        </p>
      ) : null}
    </article>
  );
}
