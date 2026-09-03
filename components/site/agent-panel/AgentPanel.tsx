'use client';

/**
 * components/site/agent-panel/AgentPanel.tsx — the recruiter agent.
 *
 * ── THE ONE PRODUCT DECISION THAT SHAPES THIS FILE ────────────────────────
 *
 * A ROLE CHIP RENDERS INSTANTLY. It fetches a pre-built brief in one round
 * trip: no model call, no cost, no waiting. Pasting the actual job description
 * is the live path, and it is the one worth waiting seven seconds for.
 *
 * That inversion is deliberate. A live run costs a recruiter seven seconds at
 * the median and twenty-two at the tail, and this page's promise is the most
 * efficient possible route to a qualification. Spending a fifth of a
 * ninety-second visit watching progress rows for one of four roles that already
 * has an answer is the wrong trade — and the pre-built answer is not a mock: it
 * comes from the same evidence records, through the same fact check, and the
 * strip under it says which composer wrote it.
 *
 * ── WHAT IS NOT HERE, AND WHY ─────────────────────────────────────────────
 *
 * No floating chat bubble. A bubble reads as a widget bolted onto a page; a
 * band reads as a section of the argument. No "technical mode" toggle: the
 * machinery is one line at rest and one disclosure below it, so nobody has to
 * classify themselves before they have read anything.
 *
 * ── ACCESSIBILITY DECISIONS THAT ARE LOAD-BEARING ─────────────────────────
 *
 * The chips are a labelled group of toggles carrying `aria-pressed`, not a
 * fake radio group. The submit state is announced through one `aria-live`
 * region in plain English, not raw JSON. The disclosure is a native
 * `<details>`. The form field carries `aria-invalid` and a described-by error;
 * there is no error hue anywhere on this site, and `<Field>` is what enforces
 * that.
 *
 * ── WHY THERE IS NO DIGIT IN THE RESTING MARKUP ───────────────────────────
 *
 * The post-build gate scans the emitted HTML for any number no claim licenses.
 * Everything numeric this panel shows — the counter, the coverage line, the run
 * strip — appears only after a person has typed or clicked, which is after the
 * page was rendered. That is not a workaround: a resting panel has nothing
 * measured to say, and saying nothing is the correct thing for it to do.
 */

import { useCallback, useId, useMemo, useState } from 'react';

import { Btn, Chip, Eyebrow, Field, fieldDescribedBy, Rule } from '@/components/ui';
import { MAX_JD_CHARS, MAX_QUESTION_CHARS, MIN_JD_CHARS, ROLE_CHIP_LABEL, ROLE_IDS } from '@/lib/agent/limits';
import type { AgentRoleId } from '@/lib/agent/limits';
import { BriefView } from './BriefView';
import { HowProduced } from './HowProduced';
import { RunStrip } from './RunStrip';
import { useAgentStream } from './useAgentStream';
import { useAsk } from './useAsk';

const STAGE_SENTENCE: Readonly<Record<string, string>> = {
  validate: 'Read the job description.',
  retrieve: 'Searched the evidence records.',
  generate: 'Writing the brief.',
  tools: 'Fetching more evidence.',
  factcheck: 'Checking every claim against a record.',
  render: 'Done.',
};

export function AgentPanel() {
  const jdFieldId = useId();
  const askFieldId = useId();

  const [role, setRole] = useState<AgentRoleId | null>(null);
  const [jd, setJd] = useState('');
  const [jdTrimmed, setJdTrimmed] = useState(false);
  const [question, setQuestion] = useState('');

  const { state, runBrief, loadCanned, reset } = useAgentStream();
  const ask = useAsk();

  const running = state.status === 'running';
  const canRunLive = jd.trim().length >= MIN_JD_CHARS;

  const jdError = useMemo(() => {
    if (state.status !== 'error') return undefined;
    if (state.error?.code === 'invalid_request') return state.error.message;
    return undefined;
  }, [state.status, state.error]);

  const onChip = useCallback(
    (next: AgentRoleId) => {
      setRole(next);
      void loadCanned(next);
    },
    [loadCanned],
  );

  const onSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!canRunLive) return;
      void runBrief({ role, jd: jd.trim() });
    },
    [canRunLive, jd, role, runBrief],
  );

  const onJdChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    if (value.length > MAX_JD_CHARS) {
      // Hard stop at the cap the server enforces, with a visible note. Being
      // told afterwards that a paste was too long is worse than being stopped.
      setJd(value.slice(0, MAX_JD_CHARS));
      setJdTrimmed(true);
      return;
    }
    setJd(value);
    setJdTrimmed(false);
  }, []);

  const liveMessage = running
    ? state.stages.length
      ? (STAGE_SENTENCE[state.stages[state.stages.length - 1]!.stage] ??
        'Working on the brief.')
      : 'Building the brief. This normally takes about seven seconds.'
    : state.envelope
      ? 'The brief is ready below.'
      : '';

  return (
    <div className="grid gap-[clamp(28px,4vw,40px)]">
      {/* ── the controls ────────────────────────────────────────────────── */}
      <form onSubmit={onSubmit} className="grid gap-[22px]">
        <div role="group" aria-labelledby={`${jdFieldId}-roles`}>
          <span
            id={`${jdFieldId}-roles`}
            className="block font-mono text-eyebrow uppercase text-[color:var(--fg-muted)]"
          >
            Pick a role for the pre-built brief
          </span>
          <div className="mt-[12px] flex flex-wrap gap-[8px]">
            {ROLE_IDS.map((id) => (
              <Chip key={id} pressed={role === id} onClick={() => onChip(id)} disabled={running}>
                {ROLE_CHIP_LABEL[id]}
              </Chip>
            ))}
          </div>
          <p className="mt-[10px] max-w-[var(--container-prose)] text-[0.85rem] leading-[1.6] text-[color:var(--fg-muted)]">
            A chip answers instantly from a brief built in advance against the same evidence
            records. Paste the actual description below to run it live against your own
            requirements.
          </p>
        </div>

        <Field
          id={jdFieldId}
          label="Or paste the job description"
          hint={
            jdTrimmed
              ? `Trimmed to the first ${MAX_JD_CHARS.toLocaleString('en-US')} characters — that is enough for any requirements section.`
              : 'The requirements section is enough. Nothing you paste is stored or logged.'
          }
          error={jdError}
        >
          <textarea
            id={jdFieldId}
            name="jd"
            rows={6}
            value={jd}
            onChange={onJdChange}
            disabled={running}
            aria-invalid={jdError !== undefined || undefined}
            aria-describedby={fieldDescribedBy(jdFieldId, {
              hint: true,
              error: jdError !== undefined,
            })}
            placeholder="Paste a job description…"
            className="w-full resize-y bg-transparent py-[10px] leading-[1.6] outline-none placeholder:text-[color:var(--fg-muted)] disabled:opacity-60"
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-[14px]">
          {/* The counter renders only once there is something to count, so the
              resting page carries no figure the corpus has not licensed. */}
          {jd.length > 0 ? (
            <span data-numeric className="font-mono text-fine text-[color:var(--fg-muted)]">
              {jd.length.toLocaleString('en-US')} / {MAX_JD_CHARS.toLocaleString('en-US')}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}

          <div className="flex flex-wrap items-center gap-[12px]">
            {state.envelope || state.status === 'error' ? (
              <Btn
                type="button"
                variant="ghost"
                onClick={() => {
                  reset();
                  setRole(null);
                }}
              >
                Start again
              </Btn>
            ) : null}
            <Btn type="submit" disabled={!canRunLive || running}>
              {running ? 'Building…' : 'Build the fit brief'}
            </Btn>
          </div>
        </div>
      </form>

      {/* ── live region: plain English, never raw JSON ──────────────────── */}
      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {/* ── progress, while a live run is in flight ─────────────────────── */}
      {running && state.stages.length > 0 ? (
        <ol className="grid gap-[6px] font-mono text-fine text-[color:var(--fg-muted)]">
          {state.stages.map((stage, i) => (
            <li key={`${stage.stage}-${i}`} className="flex flex-wrap gap-x-[14px]">
              <span className="min-w-[16rem]">{STAGE_SENTENCE[stage.stage] ?? stage.stage}</span>
              <span data-numeric>{stage.detail}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {/* ── a pre-stream refusal: never a dead end ──────────────────────── */}
      {state.status === 'error' && state.error && state.error.code !== 'invalid_request' ? (
        <div className="border-l-2 border-[color:var(--fg-accent)] pl-[14px]">
          <p className="font-mono text-micro uppercase text-[color:var(--fg-accent)]">
            Not this time
          </p>
          <p className="mt-[8px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)]">
            {state.error.message}
          </p>
          <div className="mt-[14px] flex flex-wrap gap-[8px]">
            {ROLE_IDS.map((id) => (
              <Chip key={id} pressed={false} onClick={() => onChip(id)}>
                {ROLE_CHIP_LABEL[id]}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── the brief ───────────────────────────────────────────────────── */}
      {state.envelope ? (
        <div>
          <BriefView envelope={state.envelope} />
          <RunStrip envelope={state.envelope}>
            <HowProduced envelope={state.envelope} />
          </RunStrip>
        </div>
      ) : null}

      <Rule />

      {/* ── the free-form question ──────────────────────────────────────── */}
      <section>
        <Eyebrow as="h2">Or ask a question</Eyebrow>

        <form
          className="mt-[14px] flex flex-wrap items-end gap-[12px]"
          onSubmit={(event) => {
            event.preventDefault();
            const q = question.trim();
            if (q.length < 3) return;
            setQuestion('');
            void ask.ask(q);
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <Field id={askFieldId} label="One short question about the work">
              <input
                id={askFieldId}
                name="question"
                type="text"
                value={question}
                maxLength={MAX_QUESTION_CHARS}
                onChange={(event) => setQuestion(event.target.value)}
                disabled={ask.status === 'running'}
                placeholder="Has he run Spark on real data?"
                className="w-full bg-transparent py-[10px] outline-none placeholder:text-[color:var(--fg-muted)] disabled:opacity-60"
              />
            </Field>
          </div>
          <Btn type="submit" variant="ghost" disabled={ask.status === 'running' || question.trim().length < 3}>
            {ask.status === 'running' ? 'Asking…' : 'Ask'}
          </Btn>
        </form>

        <p aria-live="polite" className="sr-only">
          {ask.status === 'running' ? 'Looking for an answer.' : ''}
        </p>

        {ask.error ? (
          <p className="mt-[14px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)]">
            {ask.error}
          </p>
        ) : null}

        {ask.turns.length > 0 ? (
          <ul className="mt-[18px] grid gap-[18px]">
            {ask.turns.map((turn, i) => (
              <li key={`${i}-${turn.question}`} className="border-t border-[color:var(--edge)] pt-[16px]">
                <p className="font-mono text-fine text-[color:var(--fg-muted)]">{turn.question}</p>
                <p className="mt-[8px] max-w-[var(--container-prose)]">{turn.answer}</p>
                {turn.envelope.answer.citations.length > 0 ? (
                  <ul className="mt-[10px] grid gap-[4px] font-mono text-fine">
                    {turn.envelope.answer.citations.map((citation) => (
                      <li key={citation.evidence_id}>
                        {citation.artifact_url ? (
                          <a
                            href={citation.artifact_url}
                            target={citation.artifact_url.startsWith('http') ? '_blank' : undefined}
                            rel={
                              citation.artifact_url.startsWith('http')
                                ? 'noreferrer noopener'
                                : undefined
                            }
                            className="text-[color:var(--fg-accent)] underline decoration-transparent underline-offset-4 hover:decoration-[color:var(--fg-accent)]"
                          >
                            <span aria-hidden="true">{'→ '}</span>
                            {citation.artifact_label}
                          </a>
                        ) : (
                          <span className="text-[color:var(--fg-muted)]">
                            <span aria-hidden="true">{'· '}</span>
                            {citation.artifact_label}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

export default AgentPanel;
