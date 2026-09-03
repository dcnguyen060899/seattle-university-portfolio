/**
 * components/site/mavterras-band.tsx — band 7. The full-stack closer, and the
 * one the owner asked for in his own words.
 *
 * ── THE CLAIM MUST BE HIS, IN THE FIRST PERSON (Addendum B, R-9) ──────────
 *
 * The earlier copy deck opened this band by asserting a general proposition —
 * “AI writes the code, it does not decide what to build” — and never said he
 * used AI to build this site. That makes the thesis a slogan anyone could have
 * written. Paragraph one therefore names his own division of labour with the
 * model, in the first person, before anything else: what AI produced, and what
 * he decided.
 *
 * ── PARAGRAPH ORDER IS RULED, NOT CHOSEN (Addendum B, R-9) ────────────────
 *
 *   1. stack + the AI division of labour
 *   2. elicitation — how the requirements came out of two founders
 *   3. decisions cut on founder instruction, recorded in the code
 *   4. legal and operational — §7030.5, and the demo-mode lock
 *
 * The design system does NOT get a paragraph. It was the fourth paragraph in
 * the earlier deck, and it is the one thing on this page that needs no
 * paragraph: the reader is looking at it. It appears as a single readout
 * instead, tied to the through-line the research band named.
 *
 * ── NAMES AND QUOTES ──────────────────────────────────────────────────────
 *
 * Victor (Founder) and Medkham (Co-Founder) are named with the owner’s
 * explicit approval (2026-09-02): it is his brother’s and sister-in-law’s
 * company, he built and shipped it, and both are already public as founders on
 * mavterras.com. Two memo lines are quoted verbatim. The third — the one that
 * replaced the deposit terms — is described rather than quoted, because it
 * carries figures that no claim licenses and the post-build numeric gate would
 * reject it; the decision it produced is in clm:mav-scope-cuts either way.
 *
 * The framing is a tight feedback loop, and that is not spin: a founder gave a
 * direction, it shipped within days, and the code records why. It is NOT
 * “my stakeholder kept changing their mind” — that reading is both wrong about
 * them and weaker for a reader, because what it actually demonstrates is a
 * team that could decide quickly and an engineer who kept the decisions
 * auditable.
 *
 * ── WHAT IS NOT ON THIS PAGE ──────────────────────────────────────────────
 *
 * The licence NUMBER. clm:mav-legal-compliance states that the contractor
 * licence number renders in that site’s footer because §7030.5 requires it in
 * all advertising; the digits themselves are that company’s, not evidence
 * about him, and they are not in this corpus. No repository link either — the
 * code is a client’s.
 */

import { Band, Eyebrow, Reveal, Rule } from '@/components/ui';
import { rolePeriod } from '@/lib/corpus/surfaces';
import { EvidenceLink, Readout, figureAt, pageText, pageValue } from './evidence';

/**
 * Positions inside clm:mav-sole-author's value block. The corpus renders it as
 * “29 commits, all his, 17-26 Aug 2026”, which is the record’s third-person
 * voice; this band is first person, so it sets the same three numbers into its
 * own sentence. `figureAt` asserts the array length, so a corpus edit that
 * changes that block stops the build rather than renaming a figure here.
 */
const COMMITS = { COUNT_OF: 0, FIRST_DAY: 1, LAST_DAY: 2, COUNT: 3 } as const;

export function MavterrasBand() {
  const commits = figureAt('clm:mav-sole-author', COMMITS.COUNT_OF, COMMITS.COUNT);
  const firstDay = figureAt('clm:mav-sole-author', COMMITS.FIRST_DAY, COMMITS.COUNT);
  const lastDay = figureAt('clm:mav-sole-author', COMMITS.LAST_DAY, COMMITS.COUNT);

  return (
    <Band tone="paper" id="full-stack">
      <Eyebrow>Full stack · {rolePeriod('rol:mavterras-eng')}</Eyebrow>

      <h2 className="mt-[14px] max-w-[24ch]">
        I used AI to write it. Deciding what to build was still engineering.
      </h2>

      <div className="mt-[22px] grid max-w-[var(--container-prose)] gap-[18px] text-[color:var(--fg-muted)]">
        <Reveal index={1} as="p">
          <span className="text-lede text-[color:var(--fg)]">
            mavterras.com is my brother’s construction company, and it is live. I designed
            it, built it and deployed it: all {commits} commits, between {firstDay} and{' '}
            {lastDay} August 2026, are mine. I used AI heavily to write that code, and I
            drew the line myself — the model produced
            implementations, and I decided what the product was, what came out of scope,
            how the data was shaped, what the legal surface had to say, and what had to be
            true before it went in front of an investor.
          </span>
        </Reveal>

        <Reveal index={2} as="p">
          {pageText('clm:mav-stack')}
        </Reveal>

        <Reveal index={3} as="p">
          None of that answered the first question, which was what to build. I got that
          out of two people: Victor, the founder, on construction and project delivery,
          and Medkham, the co-founder, on finance and operations. What they wanted arrived
          as opinions about a business, not as a specification. Turning it into a scope —
          and recording each decision in the code, dated, beside the thing it changed —
          was the part no model did for me.
        </Reveal>

        <Reveal index={4} as="p">
          Features came out on their instruction, and the source says so. A zone selector
          I had already built was removed on a memo asking to{' '}
          <q>keep it simple and minimalist, drop this</q>; a leadership section was cut
          back to <q>Just Leadership, simple, minimalistic</q>; a deposit-terms block was
          replaced on a dated memo from the co-founder responsible for finance. Each
          removal is annotated with who asked, in what role and when, and a test asserts
          that the retired values may not reappear. A direction, shipped within days, with
          the reason still readable months later — that is the loop I want to be in.
        </Reveal>

        {/*
          clm:mav-legal-compliance and clm:mav-operating, in the first person.
          The licence NUMBER is deliberately not printed: the corpus states that
          the number renders in that company’s footer because the statute
          requires it, and the digits belong to the company rather than to any
          claim about him. clm:mav-demo-mode is rendered verbatim — its record
          is already voice-neutral and it is the sharpest sentence in the group.
        */}
        <Reveal index={5} as="p">
          Two requirements I found rather than was handed. California Business and
          Professions Code section 7030.5 requires a contractor’s licence number in all
          advertising, and a website is advertising — so it renders in the footer, and a
          test fails the build if it does not. A provenance rule in the matching corpus
          stops another company’s project from ever being shown as this company’s own work
          under section 7027. Both are asserted by end-to-end tests.
        </Reveal>

        <Reveal index={6} as="p">
          The operational half of the same instinct: {pageText('clm:mav-demo-mode')}
        </Reveal>

        <Reveal index={7} as="p">
          I deployed it and I still operate it: Vercel for hosting, Neon serverless
          Postgres for the data written at runtime, Cloudflare R2 for photo storage and
          Inngest for background jobs — which means I own what happens when a background
          job fails, when a photo upload does not land, and when a serverless database is
          cold.
        </Reveal>
      </div>

      <Rule index={1} className="mt-[clamp(32px,4.5vw,48px)]" />

      <div className="mt-[clamp(28px,4vw,40px)] grid gap-[28px] sm:grid-cols-3">
        <Readout
          value={pageValue('clm:mav-ground-contexts')}
          label="the contrast failure this system inherits"
          note="Components read a ground role instead of naming a colour, so the documented failure is unreachable rather than written down. This page is built the same way, in Seattle University red — where the trap points the other way."
        />
        <Readout
          value="npm run verify"
          label="one command, four gates"
          note={pageText('clm:mav-quality-gates')}
        />
        <Readout
          value="no keys · no accounts · no spend"
          label="what a fresh clone needs"
          note={pageText('clm:mav-clone-and-run')}
        />
      </div>

      {/*
        clm:mav-live · clm:mav-thesis · clm:mav-ai-division-of-labour ·
        clm:mav-requirements-elicited · clm:mav-scope-cuts — argued above in the
        first person. None of the MAVTERRAS claims carries a mandatory caveat,
        so there is no <Limit> block here.
      */}
      <div className="mt-[clamp(28px,4vw,40px)] flex flex-wrap gap-x-8 gap-y-3">
        <EvidenceLink id="art:mavterras-site" label="mavterras.com" />
      </div>
    </Band>
  );
}
