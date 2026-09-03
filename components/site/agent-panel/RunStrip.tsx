'use client';

/**
 * components/site/agent-panel/RunStrip.tsx — the demonstration layer, at rest.
 *
 * THE TENSION, AND HOW IT IS RESOLVED. A non-technical recruiter must not have
 * to read machinery to get the brief; a technical one must be able to satisfy
 * themselves that this is a deployed system and not a mock. Those pull in
 * opposite directions, and a "technical mode" toggle resolves them badly —
 * it makes the reader self-classify before they have read anything, and
 * whichever they pick the page has told them the other view was the real one.
 *
 * So: hierarchy plus plain language. The brief above is complete and useful
 * with all of this collapsed. The machinery is ONE LINE at rest, in plain
 * English with real numbers, which a non-technical reader parses as *fast,
 * thorough, checked, cheap* and a technical reader parses as *model, tokens,
 * measured latency, unit cost*. The same sentence does both jobs. Detail lives
 * behind one disclosure, closed by default, and never renders above the brief.
 *
 * ON THE ONE ACCENTED NUMBER. It is the count of statements the fact check
 * deleted or repaired — not, deliberately, the loudest number on the page. The
 * loudest number on a portfolio is a research result; a telemetry counter about
 * the portfolio's own plumbing belongs here, at eyebrow scale, under the brief
 * (brief Addendum B, ruling R-8). It earns its accent because it is the one
 * figure that reads in both directions: this thing checks itself, and it is
 * willing to delete its own work.
 *
 * EVERY VALUE IS MEASURED. Nothing here is estimated, rounded up, or padded. A
 * page that displays a fabricated latency has made its own argument worthless,
 * which is exactly why the code path this replaces — one that slept for three
 * seconds to look busy — is deleted rather than ported.
 */

import type { BriefEnvelope } from '@/lib/agent/contracts';
// The same formatter the server uses to compute the figure. Two implementations
// of "how do we print money" is how a page ends up displaying a number that
// disagrees with the one it logged.
import { formatUsd } from '@/lib/agent/cost';
import { Eyebrow } from '@/components/ui';

function formatSeconds(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function guardrailTotal(g: BriefEnvelope['guardrails']): number {
  return (
    g.citations_dropped +
    g.claims_redacted +
    g.numbers_rejected.length +
    g.urls_rejected.length +
    g.verdicts_downgraded.length +
    g.caveats_restored.length
  );
}

export function RunStrip({
  envelope,
  children,
}: {
  envelope: BriefEnvelope;
  children?: React.ReactNode;
}) {
  const t = envelope.telemetry;
  const changed = guardrailTotal(envelope.guardrails);
  const live = !envelope.degraded && t.model !== null;

  const facts: string[] = [];

  if (live) {
    facts.push(`Answered in ${formatSeconds(t.ms)}`);
    facts.push(
      `searched ${t.corpus_size} evidence records, surfaced ${t.surfaced}` +
        (t.tool_calls.length ? `, fetched more on demand ${t.tool_calls.length}×` : ''),
    );
  } else {
    // No timing for a pre-built brief. It renders in a couple of milliseconds
    // and "0 ms" reads as a broken counter rather than as speed; what a reader
    // needs here is where it came from, which is the next clause and the
    // provenance sentence below.
    facts.push(`Answered from the same ${t.corpus_size} evidence records`);
  }

  facts.push(
    changed === 0
      ? 'every statement matched a source on this site'
      : `${changed} statement${changed === 1 ? '' : 's'} changed or dropped by the check`,
  );

  if (live) facts.push(formatUsd(t.cost_usd));
  facts.push(
    live
      ? `${t.model}, Node runtime on ${t.region}`
      : `no model call, Node runtime on ${t.region}`,
  );

  return (
    <div className="mt-[clamp(28px,4vw,40px)] border-t border-[color:var(--edge)] pt-[18px]">
      <Eyebrow>How this was built</Eyebrow>

      <p
        data-numeric
        className="mt-[10px] max-w-[70ch] font-mono text-fine leading-[1.7] text-[color:var(--fg-muted)]"
      >
        {facts.map((fact, i) => (
          <span key={fact}>
            {i > 0 ? <span aria-hidden="true"> · </span> : null}
            <span
              className={
                i === 2 ? 'text-[color:var(--fg-accent)]' : undefined
              }
            >
              {fact}
            </span>
          </span>
        ))}
      </p>

      {envelope.message ? (
        <p className="mt-[10px] max-w-[70ch] text-[0.9rem] leading-[1.6] text-[color:var(--fg-muted)]">
          {envelope.message}
        </p>
      ) : null}

      {envelope.guardrails.overclaim_flagged ? (
        // A flagged brief is still served — discarding it silently would be
        // worse — but the page says so, and the coverage line above already
        // reads as all-direct, which is self-indicting.
        <p className="mt-[10px] max-w-[70ch] text-[0.9rem] leading-[1.6] text-[color:var(--fg-accent)]">
          Flagged: every requirement in this brief came back as a direct match. That is unusual and
          worth reading sceptically.
        </p>
      ) : null}

      {children}
    </div>
  );
}
