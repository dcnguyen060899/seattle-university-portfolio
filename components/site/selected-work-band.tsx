/**
 * components/site/selected-work-band.tsx — band 8. Older evidence, compressed
 * on purpose.
 *
 * Three rows, not six. The earlier deck ran a six-row table that gave the
 * algorithm tutor the longest entry on it — a second AI evaluation system,
 * described in more engineering detail than everything else combined, on a
 * page whose owner decided there would be one agent and no second demo. It
 * competes with the recruiter agent for the same credit and pulls the reader
 * toward a page built for students. It is linked from the footer instead.
 *
 * ── MOSAIC: WHAT THE NUMBER IS, AND WHAT IT IS NOT (Addendum C.2) ─────────
 *
 * 660,000 is MOSAIC’s own recorded website traffic for 2022, quoted from its
 * annual report. It is the size of the problem, not a measurement of anything
 * this system served, and the mandatory caveat says exactly that in the words
 * the corpus keeps.
 *
 * The accuracy figure this project used to carry on this site is RETRACTED. It
 * was an industry statistic about other organisations’ complaint resolution,
 * lifted from a magazine and reattributed to this chatbot. There is no
 * accuracy measurement for it, and this band does not soften that into “high
 * accuracy” or any other adjective. If a real evaluation turns up, it enters
 * the corpus as a sourced claim and can be said then.
 *
 * MOSAIC earns its place here for a different reason: it is the EARLIER
 * instance of the disposition the full-stack band argues — a product
 * definition, a design sprint, a documented handoff and a cost estimate, done
 * for a real client two years before MAVTERRAS. One clause says so.
 *
 * ── R² IS NOT ACCURACY (Addendum B, R-20) ─────────────────────────────────
 *
 * The NASA figure is variance explained. A page whose research band flags a
 * macro-versus-weighted mislabel in someone else’s paper cannot make the same
 * class of error about its own number, so the caveat is not optional and is
 * rendered with the claim.
 *
 * Claims argued here in the first person, with their ids recorded so the
 * licensing and caveat gates can see them: clm:mosaic-role · clm:mosaic-graph ·
 * clm:mosaic-award · clm:faisal-rag.
 */

import { Band, Entry, Eyebrow, Reveal } from '@/components/ui';
import { rolePeriod } from '@/lib/corpus/surfaces';
import { EvidenceLink, Limit, figureAt, pageValue } from './evidence';

/**
 * Positions inside clm:nasa-anova's value block — the corpus renders it as
 * “64.4% · 2.2×”, which is a readout and not a sentence, and this band needs
 * the two figures in different clauses. `figureAt` asserts the array length.
 */
const ANOVA = { SHARE: 1, RATIO: 3, COUNT: 4 } as const;

export function SelectedWorkBand() {
  return (
    <Band tone="paper" id="selected-work">
      <Eyebrow>Selected earlier work</Eyebrow>

      <h2 className="mt-[14px] max-w-[20ch]">Compressed on purpose</h2>

      <Reveal index={1}>
        <p className="mt-[22px] max-w-[var(--container-prose)] text-lede text-[color:var(--fg-muted)]">
          All of this predates the research above. It is here because it is evidence, not
          because it is the argument.
        </p>
      </Reveal>

      <div className="mt-[clamp(32px,4.5vw,48px)]">
        <Entry
          rail={rolePeriod('rol:blueprint')}
          title="MOSAIC settlement assistant"
          meta="AI Engineer · SFU Blueprint"
          actions={<EvidenceLink id="art:mosaic-page" label="Project write-up" />}
        >
          {/*
            TEAM ATTRIBUTION. The owner flagged the earlier draft — "I built an
            assistant for MOSAIC's…" — on 2026-09-02: "this just made it feel
            like i built this alone but i build with other student engineer".
            He is right, and on a page arguing that its claims are checkable,
            over-claiming credit is the most expensive possible error.

            SFU Blueprint builds in interdisciplinary student teams by
            construction (src:blueprint-site). So the team is named first and
            Duy's own role second — "I was the AI Engineer on it" is both more
            honest AND more specific than "I built it", because it says which
            part was his.

            The award sentence carried a second error, now fixed: the letter is
            NOT from Simon Fraser University. It is from the Director of
            Business Technology and Operations at MOSAIC BC — the client —
            addressed to the SFU award committee, and it endorses "the students'
            project" in the plural throughout, naming no individual. See the
            note on src:sfu-rec-letter.
          */}
          <p>
            SFU Blueprint builds software pro bono for BC non-profits, in interdisciplinary
            student teams. I was the AI Engineer on the team that built MOSAIC’s immigration
            and settlement assistant: it runs on a Neo4j knowledge graph modelling programmes
            against locations, client needs, age groups, immigration status and other
            services, with multi-language handling over the top.
          </p>
          <p>
            The team’s project was shortlisted in the top four for the SFU Computing Science
            Diversity Award, backed by a signed letter from MOSAIC’s Director of Business
            Technology and Operations endorsing the students’ work to the committee.
          </p>
          <p>
            The client was MOSAIC, a settlement-services organisation recording{' '}
            {pageValue('clm:mosaic-reach')}.
          </p>
          {/*
            Same attribution rule as the paragraph above: the artifacts were the
            team's, and the thing that is Duy's own is what he took from them.
            Saying "we produced" and then "what I took from it" keeps the credit
            honest without giving up the MAVTERRAS through-line, which is the
            reason this entry earns its place on the page at all.
          */}
          <p>
            It is also where the stakeholder work further up this page starts. We produced a
            product definition, a design sprint, a documented developer handoff and a cost
            estimate — working to a real client rather than to a brief — two years before I
            did the same, alone, for a real business.
          </p>

          <Limit ids={['clm:mosaic-reach-caveat']} />
        </Entry>

        <Entry
          rail={rolePeriod('rol:faisal-lab')}
          title="Natural language into structured scan retrieval"
          meta="AI Research Engineer · SFU Faisal Lab"
          actions={<EvidenceLink id="art:faisal-repo" label="Repository" />}
        >
          <p>
            At the SFU Faisal Lab I built a retrieval-augmented pipeline in Python and
            LlamaIndex that translates a natural-language request into the structured
            query that retrieves the matching CT and MRI scans.
          </p>
        </Entry>

        {/*
          The rail is the course code rather than a date. clm:nasa-scale's period
          is recorded at quarter precision starting in September, which the
          corpus's quarter mapping renders as “summer 2025 – autumn 2025” — an
          artefact of a calendar mapping, not a fact about the project, and this
          page does not print figures it would have to explain away.
        */}
        <Entry
          rail="DATA 5100"
          title="NASA flight-recorder analysis"
          meta="Foundations of Data Science · Seattle University"
          actions={<EvidenceLink id="art:nasa-page" label="Analysis write-up" />}
        >
          <p>
            For my DATA 5100 final project I analysed NASA cruise-phase flight-recorder
            data — {pageValue('clm:nasa-scale')}. Using ANOVA, nested F-tests, variance
            decomposition and interaction analysis, engine performance explains{' '}
            {figureAt('clm:nasa-anova', ANOVA.SHARE, ANOVA.COUNT)} of the fuel variance,{' '}
            {figureAt('clm:nasa-anova', ANOVA.RATIO, ANOVA.COUNT)} times more than flight
            planning — which cuts against the conventional prioritisation.
          </p>

          <Limit ids={['clm:nasa-r2-caveat']} />
        </Entry>
      </div>
    </Band>
  );
}
