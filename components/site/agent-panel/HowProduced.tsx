'use client';

/**
 * components/site/agent-panel/HowProduced.tsx — the one disclosure.
 *
 * Closed by default. Native `<details>`/`<summary>`: real semantics, keyboard
 * operable for free, no ARIA reimplementation of a control the platform already
 * ships. It renders BELOW the brief and never above it.
 *
 * Three blocks, in this order and for these reasons:
 *
 *   (a) THE TRACE. What actually ran, with measured milliseconds and a plain
 *       English detail per row. It is the same array the stream sent, so it
 *       cannot be a prettier version of a different run.
 *   (b) THREE SENTENCES OF DESIGN. A recruiter who reads this far is the one
 *       who will ask about it in an interview, so the argument is written out
 *       in words rather than implied by a diagram.
 *   (c) THE RANKING. The records the retriever surfaced, with the score and the
 *       concepts that matched — so the retrieval is inspectable rather than
 *       asserted. Nested inside its own second-level disclosure, because it is
 *       the only part here that is genuinely for engineers.
 */

import type { BriefEnvelope } from '@/lib/agent/contracts';

function statusWord(status: string): string {
  switch (status) {
    case 'ok':
      return 'ok';
    case 'skipped':
      return 'skipped';
    case 'degraded':
      return 'fell back';
    default:
      return 'failed';
  }
}

const STAGE_LABEL: Readonly<Record<string, string>> = {
  validate: 'Read the request',
  retrieve: 'Searched the evidence',
  generate: 'Wrote the brief',
  tools: 'Fetched more evidence',
  factcheck: 'Checked every claim',
  render: 'Rendered',
};

export function HowProduced({ envelope }: { envelope: BriefEnvelope }) {
  const t = envelope.telemetry;
  const live = !envelope.degraded && t.model !== null;

  return (
    <details className="group mt-[14px]">
      <summary className="cursor-pointer list-none font-mono text-micro uppercase text-[color:var(--fg-accent)] underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-[color:var(--fg-accent)] motion-reduce:transition-none">
        How this was produced
        <span aria-hidden="true" className="ml-[8px] group-open:hidden">
          ▾
        </span>
        <span aria-hidden="true" className="ml-[8px] hidden group-open:inline">
          ▴
        </span>
      </summary>

      <div className="mt-[18px] grid gap-[24px]">
        {/* (a) the trace */}
        <div className="overflow-x-auto">
          <table data-numeric className="w-full min-w-[36rem] border-collapse text-left font-mono text-fine">
            <caption className="sr-only">What the system did, in order, with measured timings</caption>
            <thead>
              <tr className="text-[color:var(--fg-muted)]">
                <th scope="col" className="border-b border-[color:var(--edge)] py-[8px] pr-[16px] font-[500]">
                  Step
                </th>
                <th scope="col" className="border-b border-[color:var(--edge)] py-[8px] pr-[16px] font-[500]">
                  Result
                </th>
                <th scope="col" className="border-b border-[color:var(--edge)] py-[8px] pr-[16px] font-[500]">
                  Time
                </th>
                <th scope="col" className="border-b border-[color:var(--edge)] py-[8px] font-[500]">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {envelope.trace.map((row, i) => (
                <tr key={`${row.stage}-${i}`} className="align-top">
                  <td className="border-b border-[color:var(--edge)] py-[8px] pr-[16px]">
                    {STAGE_LABEL[row.stage] ?? row.stage}
                  </td>
                  <td className="border-b border-[color:var(--edge)] py-[8px] pr-[16px] text-[color:var(--fg-muted)]">
                    {statusWord(row.status)}
                  </td>
                  <td className="border-b border-[color:var(--edge)] py-[8px] pr-[16px] text-[color:var(--fg-muted)]">
                    {row.ms} ms
                  </td>
                  <td className="border-b border-[color:var(--edge)] py-[8px] text-[color:var(--fg-muted)]">
                    {row.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* (b) the three sentences */}
        <div className="grid max-w-[var(--container-prose)] gap-[14px] text-[0.9rem] leading-[1.65] text-[color:var(--fg-muted)]">
          <p>
            <em className="not-italic text-[color:var(--fg)]">
              Nothing was shown to you until it had been checked.
            </em>{' '}
            The model writes the brief as structured data, not as text. Every claim has to quote a
            record on this site word for word, every figure has to already appear in that record,
            and every link has to be one this site actually has. Statements that fail are removed
            before they reach you — that is what the count above refers to.
          </p>
          <p>
            <em className="not-italic text-[color:var(--fg)]">
              Nothing you paste can give this system instructions.
            </em>{' '}
            A pasted description is treated as data inside a fence it cannot close, and the agent
            has no tool that can send mail, write to a database or fetch a URL. The worst a hostile
            paste can do is produce a worse brief.
          </p>
          <p>
            <em className="not-italic text-[color:var(--fg)]">
              If any of this fails, you still get an answer.
            </em>{' '}
            A missing key, a model outage, a rate limit, or a brief that fails the check — every one
            of those falls back to a pre-built brief rather than an error page.{' '}
            {live
              ? 'This brief was produced live.'
              : 'What you are reading now is that fallback path, working.'}
          </p>
        </div>

        {/* (c) the ranking */}
        {t.ranking.length > 0 ? (
          <details>
            <summary className="cursor-pointer list-none font-mono text-micro uppercase text-[color:var(--fg-muted)]">
              What the retriever surfaced, and why
            </summary>
            <div className="mt-[12px] overflow-x-auto">
              <table
                data-numeric
                className="w-full min-w-[32rem] border-collapse text-left font-mono text-fine"
              >
                <thead>
                  <tr className="text-[color:var(--fg-muted)]">
                    <th scope="col" className="border-b border-[color:var(--edge)] py-[8px] pr-[16px] font-[500]">
                      Record
                    </th>
                    <th scope="col" className="border-b border-[color:var(--edge)] py-[8px] pr-[16px] font-[500]">
                      Score
                    </th>
                    <th scope="col" className="border-b border-[color:var(--edge)] py-[8px] font-[500]">
                      Matched on
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {t.ranking.map((row) => (
                    <tr key={row.evidence_id}>
                      <td className="border-b border-[color:var(--edge)] py-[8px] pr-[16px]">
                        {row.evidence_id}
                      </td>
                      <td className="border-b border-[color:var(--edge)] py-[8px] pr-[16px] text-[color:var(--fg-muted)]">
                        {row.score}
                      </td>
                      <td className="border-b border-[color:var(--edge)] py-[8px] text-[color:var(--fg-muted)]">
                        {row.matched.join(', ') || row.via}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}

        {/* the raw counters, for anyone who wants them */}
        <p data-numeric className="font-mono text-fine text-[color:var(--fg-muted)]">
          corpus {t.corpus_version} · {t.corpus_size} records · request {envelope.request_id}
          {live
            ? ` · ${t.usage.input_tokens} in / ${t.usage.output_tokens} out · ${t.usage.cache_read_input_tokens} read from cache`
            : ''}
        </p>
      </div>
    </details>
  );
}
