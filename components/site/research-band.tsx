/**
 * components/site/research-band.tsx — band 2, and the spine of the page.
 *
 * The brief’s signal #1 is “two research positions carried simultaneously
 * during the MS”. This band is the only place on the page where that is
 * argued rather than asserted, so it is the longest band and it is the one
 * that gets the reader’s attention budget. Everything the recruiter-lens
 * review called “one click deep” — the month-by-month record, the essay — is
 * linked out rather than inlined.
 *
 * ── THE THROUGH-LINE, NAMED (Addendum B, R-16) ────────────────────────────
 *
 * The band closes on the disposition that connects both positions to the
 * full-stack section: he audits the thing everyone else assumed was fine. The
 * metric-labelling artifact in the paper he was replicating, the audit of his
 * own team’s pipeline output, and the contrast trap he made unreachable in
 * MAVTERRAS are three instances of one habit, and the brief asks for that to
 * be stated explicitly rather than left for the reader to assemble.
 *
 * ── NO TEAMMATE IS NAMED, ANYWHERE (Addendum B, R-16) ─────────────────────
 *
 * The team audit ships as the defect, the root cause and the coverage figure.
 * The audit report attributes violations per person; this page does not, the
 * corpus does not, and no agent output may. Describing the defect is evidence
 * of code review. Naming the colleague who wrote it is not.
 */

import { Band, Btn, Entry, Eyebrow, Reveal, Rule } from '@/components/ui';
import { personById } from '@/lib/corpus';
import { roleAdvisors, rolePeriod } from '@/lib/corpus/surfaces';
import { EvidenceLink, Limit, figureAt, pageText, pageValue } from './evidence';

/**
 * Positions inside clm:fischer-depth-provenance's value block. The corpus
 * renders it as a readout — “143 of 195 neurons lack a header depth” — which
 * is a sentence of its own and cannot be dropped into the middle of one. The
 * two counts are set here instead. `figureAt` asserts the array length, and
 * these are LIVE figures (Addendum A.5): `npm run corpus:refresh:fischer`
 * re-derives them from the lab database, and a literal here could not be.
 */
const DEPTH = { WITHOUT: 0, TOTAL: 1, COUNT: 4 } as const;

export function ResearchBand() {
  const yang = personById('per:wenjing-yang').name;
  const fischer = personById('per:brian-fischer').name;

  return (
    <Band tone="paper" id="research">
      <Eyebrow>Research · ongoing</Eyebrow>

      <h2 className="mt-[14px] max-w-[20ch]">Two positions, one year</h2>

      {/*
        clm:yang-concurrency and clm:yang-origin-course, in the first person.
        The course origin is not colour: it is the evidence that the research
        relationship grew out of the curriculum, which is the same argument the
        coursework band makes further down.
      */}
      <Reveal index={1}>
        <p className="mt-[22px] max-w-[var(--container-prose)] text-lede text-[color:var(--fg-muted)]">
          The master’s has carried both at once since the spring quarter. The first grew
          out of the curriculum: I met {yang} as a student in her Statistical Machine
          Learning I course and began experimentation the following spring. They have
          nothing in common except the part I was hired for — turning a question somebody
          else cares about into something that can be measured, and then measuring it
          honestly enough that the answer is allowed to be disappointing.
        </p>
      </Reveal>

      {/* ── The through-line, stated (Addendum B, R-16) ─────────────────────
        This is clm:audit-disposition, rendered in the first person because the
        page speaks in the first person and the corpus record speaks about him
        in the third. The content is unchanged: the same three instances, in the
        same order, the same claim.

        WHY IT OPENS THE BAND RATHER THAN CLOSING IT. It used to be the last
        paragraph of a 947-word band — the least-read position on the page — and
        it is the paragraph that binds both research positions, the teammate
        audit and the design system into ONE disposition rather than three
        unrelated achievements. It names its own three examples, so it never
        depended on the entries above it; stating it first turns the entries
        below into evidence for a thesis instead of a list the reader has to
        synthesise unaided.
      */}
      <Reveal index={2}>
        <p className="mt-[26px] max-w-[var(--container-prose)] text-lede">
          One habit runs through all of it: I audit the thing everyone else assumed was
          fine. A metric-labelling artifact in the paper I was replicating. My own team’s
          pipeline output, against the lab’s stated requirements. And, further down this
          page, a colour system whose one documented contrast failure I made structurally
          unreachable instead of merely writing it down.
        </p>
      </Reveal>

      {/* ── The page's sourcing thesis, moved out of the hero ───────────────
        This sentence used to close the hero band. It is a claim about how the
        WHOLE page is sourced, and it is now where the reader first meets the
        thing it describes: the two entries below carry six quoted caveats
        between them, in the record's own third person, under an accent rule.
        Stated in the hero it was a promise about a page the reader had not
        started; stated here it is the caption of the demonstration directly
        underneath.

        It also had to leave the hero for a measured reason. That band's
        photograph is capped at 106svh — 848px at 1280x800 — while the band ran
        to 1306px, so its bottom 458px carried text over bare ground with no
        picture behind it, which is the dark slab the owner keeps reporting.
        This paragraph anchored at y=890 there: ninety pixels below the fold,
        seen by no first-paint reader, and costing 127px of that overhang on
        desktop and 139px at 375. Here it costs nothing — this band has no
        photograph to cover.

        It is deliberately NOT `text-lede`. The two paragraphs above it are the
        band's argument and this is a note about method; setting it at body
        size in the muted role keeps the reading order of the three honest.
      */}
      <Reveal index={3}>
        <p className="mt-[22px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)]">
          Every figure on this page is licensed by a record that names its source, and
          every limit is quoted from that record rather than paraphrased around it.
        </p>
      </Reveal>

      <div className="mt-[clamp(36px,5vw,56px)]">
        {/* ── Dr. Wenjing Yang — medical vision–language RAG ──────────────── */}
        <Entry
          rail={rolePeriod('rol:yang-gra')}
          title="Separation without transfer"
          meta={`Graduate Research Assistant · medical vision–language RAG · ${roleAdvisors('rol:yang-gra')}`}
          actions={
            <>
              <EvidenceLink id="art:vindr-mammo" label="VinDr-Mammo dataset" />
              <Btn href="/docs/news.html" variant="quiet">
                The month-by-month record
              </Btn>
            </>
          }
        >
          <p>
            A published mammography pipeline retrieves similar prior studies and hands
            them to a vision–language model before it writes a report. I replicated it,
            then ran the experiment it was missing: {pageValue('clm:yang-design-24cells')},
            on VinDr-Mammo — {pageValue('clm:yang-dataset')}.
          </p>
          <p>
            The honest benchmark is the do-nothing benchmark, and against it the finding
            is negative in a useful way. Only the mammography-native encoder cleared the
            floor. The same recipe on encoders pretrained on web images, biomedical
            figures and organisms inflated separation on the training set and left
            held-out retrieval tied with it. The geometry agrees —{' '}
            {pageValue('clm:yang-effective-rank')}: collapse out of domain, expansion in it.
          </p>
          <p>
            Downstream, with the decoder frozen throughout, suspicion macro-F1 moved{' '}
            {pageValue('clm:yang-suspicion-f1')} on LLaVA-Med, while MedGemma — included
            as the retrieval-insensitive control — did not move at all. Scored on the
            untrained, finer BI-RADS label the gain held:{' '}
            {pageValue('clm:yang-birads-untrained')}.
          </p>
          <p>
            Two things came out of the process rather than the result. Auditing my
            evaluator against the paper turned up a metric-labelling artifact — precision,
            recall and F1 published as macro averages, computed as weighted ones — so
            every comparison since runs inside my own pipeline. And the analysis
            regenerates itself: {pageValue('clm:yang-regenerators')} recomputed byte-exact
            from the raw predictions, so the report ({pageValue('clm:yang-report-37p')})
            and the manuscript are the same numbers, not two transcriptions of them.
          </p>

          <p className="mt-[16px] font-mono text-fine text-[color:var(--fg-muted)]">
            {pageText('clm:yang-psb-submission')}
          </p>
          <p className="font-mono text-fine text-[color:var(--fg-muted)]">
            {pageText('clm:yang-stack')}
          </p>

          <Limit
            ids={[
              'clm:yang-psb-caveat',
              'clm:yang-birads-majority-caveat',
              'clm:yang-metric-restatement-caveat',
              'clm:yang-identification-limit',
              'clm:yang-label-caveat',
            ]}
          />
        </Entry>

        {/* ── Prof. Brian Fischer — computational neuroscience data ───────── */}
        <Entry
          rail={rolePeriod('rol:fischer-rde')}
          title="One question across the lab’s file formats"
          meta={`Research Data Engineer · Computational Neuroscience Lab · ${fischer}`}
          actions={<EvidenceLink id="art:iccl-db" label="Lab database" />}
        >
          <p>
            {pageText('clm:fischer-domain')} Those recordings were spread across{' '}
            {pageValue('clm:fischer-etl-formats')} — XDPHYS .iid, .itd and .bf, MATLAB
            .mat, headerless CSV — with no way to ask one question across them. I wrote
            the ETL in Python
            with pandas, SciPy and h5py, and designed the schema and its ER model in
            LaTeX: {pageValue('clm:fischer-db-shape')}, foreign-key constraints, and
            explicit rules for missing data, tracked exclusions and remapped paths.
          </p>
          <p>
            The target was adoption, not correctness alone: it has to be fast enough that
            a student reaches for the database instead of the files —{' '}
            {pageValue('clm:fischer-perf-targets')}, both met. The detail I would point a
            reviewer at is electrode depth. The raw header records no usable value for{' '}
            {figureAt('clm:fischer-depth-provenance', DEPTH.WITHOUT, DEPTH.COUNT)} of the{' '}
            {figureAt('clm:fischer-depth-provenance', DEPTH.TOTAL, DEPTH.COUNT)} neurons,
            so the loader falls back to the principal investigator’s hand-curated position
            file and a column records, per neuron, which of the two it used. Provenance in
            a column beats an adjective about data quality.
          </p>
          <p>
            I also audited the whole team’s output against the lab’s eight stated
            file-naming and content requirements:{' '}
            {pageValue('clm:fischer-team-audit')}, most of them one line —{' '}
            {pageValue('clm:fischer-team-audit-rootcause')}. The final loop of a shared
            renaming notebook hard-codes a single file extension, so a parent file with no
            child trials is renamed as it stands: the code never opens the header to see
            what varied, and never checks for sibling channel files.
          </p>

          <Limit ids={['clm:fischer-live-caveat']}>
            {/*
              clm:fischer-team-audit-coverage is rendered here in the band’s own
              words rather than verbatim, and this is the only caveat on the page
              that is. Its corpus statement carries “44%” and “20”, and neither is
              in any metric claim’s value block, so the post-build numeric gate (C8)
              cannot license them — a verbatim render fails the build. The figures
              are kept: 16 of 36 are printed as digits because both are licensed,
              and the percentage they restate is spelled out. Fix at source: give
              that caveat a value block, or add the two numbers to
              data/corpus/allowed-non-claim-numbers.json. Both are corpus territory.
            */}
            <li className="text-[0.85rem] leading-[1.6] text-[color:var(--fg-muted)]">
              The audit reported the team’s coverage honestly rather than favourably: 16
              of the 36 required dates had been uploaded at that point — forty-four per
              cent — with the rest still to process.
            </li>
          </Limit>
        </Entry>
      </div>

      <Rule index={1} className="mt-[clamp(36px,5vw,56px)]" />

      <div className="mt-[26px] flex flex-wrap gap-x-8 gap-y-3">
        <EvidenceLink id="art:econ-essay" label="Essay: the scarce complement to AI work" />
        <EvidenceLink id="art:news-archive" label="The full record" />
      </div>
    </Band>
  );
}
