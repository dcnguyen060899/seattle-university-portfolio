/**
 * components/site/fit-band.tsx — band 3. The recruiter agent’s home.
 *
 * ── THE TERRITORY CONTRACT ────────────────────────────────────────────────
 *
 * This file owns WHERE the agent sits and the copy around it. It does not own
 * the agent. `<AgentPanel />` — the role chips, the job-description field, the
 * brief, the run strip and every degraded state — is the agent territory’s
 * component, imported from `@/components/site/agent-panel`. The contract this
 * band relies on, and nothing more:
 *
 *   • a default export or named export `AgentPanel`
 *   • it renders its own form, its own results and its own status strip
 *   • it takes no props and needs no ground of its own; it inherits `paper`
 *     from this band and therefore reads `--fg`, `--fg-muted`, `--fg-accent`,
 *     `--edge`, `--surface-pressed` and `--fg-pressed` like everything else
 *   • it degrades to something readable with no key, no network and no JS
 *
 * ── WHY THE PANEL IS ON PAPER, AND MAY NEVER MOVE (Addendum B, R-7) ───────
 *
 * The panel contains the only form on the site, and a form is the commercial
 * point of this page. Dark and coloured form surfaces measurably reduce
 * completion, so the design system forbids the form from sitting on `ink` or
 * `crimson`. Two specs disagreed about this and R-7 settled it: paper.
 * `<Band tone="paper">` below is that ruling, and it is not a style choice
 * anyone should “improve” by matching the hero.
 *
 * ── WHY IT SITS HERE AND NOT AT THE TOP ───────────────────────────────────
 *
 * The recruiter agent is a delivery mechanism, not a signal. Putting it above
 * the research band means a recruiter’s first interaction is a wait before any
 * human-written evidence has been read; putting it directly after means the
 * spine has been read and the reader now knows what to ask it.
 */

import { Band, Eyebrow, Reveal } from '@/components/ui';
import { AgentPanel } from '@/components/site/agent-panel';

export function FitBand() {
  return (
    <Band tone="paper" id="fit">
      <Eyebrow>For recruiters</Eyebrow>

      <h2 className="mt-[14px] max-w-[22ch]">Paste a job description or pick a role</h2>

      <Reveal index={1}>
        {/*
          Two sentences, since 2026-09-08. The earlier paragraph explained the
          brief's shape, its source and its refusal to inflate; the panel below
          demonstrates all three in the time it takes to read them.
        */}
        <p className="mt-[22px] max-w-[var(--container-prose)] text-lede text-[color:var(--fg-muted)]">
          You get a short brief: which of your requirements I can evidence, which only
          partly, and which I cannot, each tied to a specific piece of work. It reads the
          same record this page renders from, and where there is no evidence it says so.
        </p>
      </Reveal>

      <div className="mt-[clamp(32px,4.5vw,48px)]">
        <AgentPanel />
      </div>
    </Band>
  );
}
