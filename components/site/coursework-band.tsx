/**
 * components/site/coursework-band.tsx — band 6. The curriculum, and the one
 * course the brief names.
 *
 * ── WHY THIS BAND CHANGED SHAPE (Addendum C.1) ────────────────────────────
 *
 * The earlier copy deck built this band on the university catalog’s
 * description of CPSC 5330 and hedged the tense, because nothing in either
 * repository evidenced that the course had been taken. Read by a recruiter
 * under a data-engineering posting, that band was an ANTI-signal: it quoted a
 * course description and then conceded that everything else on the page runs
 * on data that fits in memory.
 *
 * The owner then supplied the coursework directory. The course is confirmed —
 * spring quarter 2026, section 26SQ — and it produced dated, inspectable code.
 * So the band is built on the ARTIFACT, never on the catalog: a two-stage
 * Hadoop Streaming pipeline and a Hive query, with a driver script that runs
 * both jobs, executes the HiveQL through Beeline over JDBC, merges the
 * part-files and cleans up after itself.
 *
 * The honest caveat stays and is not softened: this is coursework on a
 * single-node lab cluster and a teaching AWS account, not distributed
 * processing at production scale. The page’s whole ethos is stating limits,
 * and a band that dropped this one to look stronger would cost more than it
 * gained.
 *
 * ── WHERE THE GPA LIVES (Addendum B, R-8) ─────────────────────────────────
 *
 * Here, in the credentials block, and nowhere else. It is a credential, not a
 * result, and the hero carries measured results instead.
 */

import { Band, Entry, Eyebrow, Reveal, Rule } from '@/components/ui';
import { rolePeriod } from '@/lib/corpus/surfaces';
import { EvidenceLink, Limit, pagePeriod, pageText, pageValue } from './evidence';

export function CourseworkBand() {
  return (
    <Band tone="paper" id="coursework">
      <Eyebrow>Coursework</Eyebrow>

      <h2 className="mt-[14px] max-w-[22ch]">A curriculum read as an argument</h2>

      {/*
        The course list is clm:msds-stats-sequence and clm:msds-capstone, set in
        the first person as an arc rather than quoted as a transcript. The
        credits figure and the shape of the programme are clm:msds-structure,
        rendered verbatim because it is a fact about the university, not a claim
        about him, and it reads the same in either voice.
      */}
      <Reveal index={1}>
        <p className="mt-[22px] max-w-[var(--container-prose)] text-lede text-[color:var(--fg-muted)]">
          {pageText('clm:msds-structure')} Taken in order it makes one argument. Learn to
          compute — CPSC 5070, CPSC 5071. Learn what a claim is — DATA 5111 Probability,
          DATA 5300 Applied Statistical Inference and Experimental Design, DATA 5321 and
          DATA 5322 Statistical Machine Learning I and II. Learn to say it — DATA 5310
          Data Visualization. Learn where it is not allowed to go — DATA 5120 Data
          Science, Law and Ethics. It finishes in DATA 5901 and DATA 5902, two quarters
          of capstone with an industry partner.
        </p>
      </Reveal>

      <div className="mt-[clamp(36px,5vw,56px)]">
        <Entry
          rail={pagePeriod('clm:cpsc5330-enrolled')}
          title="CPSC 5330 Big Data Analytics"
          meta="Seattle University · section 26SQ"
          actions={<EvidenceLink id="art:cpsc5330-tf" label="Term-frequency pipeline" />}
        >
          <p>This is the course I went looking for. {pageText('clm:cpsc5330-stack')}</p>
          <p>
            What it produced is inspectable and dated —{' '}
            {pageValue('clm:cpsc5330-tf-artifact')}. One job emits per-document term
            counts, a second emits per-document totals, a HiveQL script declares an
            external table over each job’s HDFS output directory and joins them on
            document id, and a driver script runs both jobs, executes the query through
            Beeline over JDBC, merges the part-files and cleans up after itself.
          </p>
          <p>
            It matters where it sits in the year as much as what it covers.{' '}
            {pageText('clm:spring-2026-load')}
          </p>

          <Limit ids={['clm:cpsc5330-caveat']} />
        </Entry>
      </div>

      {/* clm:cpsc5330-enrolled is the rail, the title and the section above. */}

      <Rule index={1} className="mt-[clamp(36px,5vw,56px)]" />

      {/* ── Credentials. Three rows, no logos, no seals. ─────────────────── */}
      <h3 className="mt-[clamp(28px,4vw,40px)]">Credentials</h3>

      <dl className="mt-[18px] grid gap-0">
        {/*
          clm:msds-enrolment · clm:msds-gpa · clm:msds-honor-roll ·
          clm:berkeley-cert · clm:sfu-economics-ba. The dates come from the role
          records and the grade from the claim; the sentences are set in the
          first person, like the rest of the page, because the record’s own
          third-person register is reserved for the limits.
        */}
        <CredentialRow
          period={rolePeriod('rol:msds')}
          title="M.S. Data Science"
          org="Seattle University"
          detail={`Expected June 2027. GPA ${pageValue('clm:msds-gpa')}, and the College of Science and Engineering Dean’s Graduate Student Honor Roll for winter 2026.`}
        />
        <CredentialRow
          period={rolePeriod('rol:berkeley-cert')}
          title="Professional Certificate, Machine Learning and AI"
          org="UC Berkeley College of Engineering"
          detail="Completed July 2024."
        />
        <CredentialRow
          period={rolePeriod('rol:sfu-ba')}
          title="B.A. Economics, Data Analysis concentration"
          org="Simon Fraser University"
          detail="Completed May 2023. It is where the experimental design and the causal reasoning started."
        />
      </dl>
    </Band>
  );
}

/**
 * One credential. A definition list rather than a table: three rows of two
 * facts is a description, not tabular data, and a `<table>` here would make a
 * screen reader announce column and row positions that carry no meaning.
 */
function CredentialRow({
  period,
  title,
  org,
  detail,
}: {
  period: string;
  title: string;
  org: string;
  detail: string;
}) {
  return (
    <div className="grid gap-x-8 gap-y-2 border-t border-[color:var(--edge)] py-[22px] sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline">
      <dt
        data-numeric
        className="font-mono text-eyebrow uppercase text-[color:var(--fg-muted)]"
      >
        {period}
      </dt>
      <dd className="m-0">
        <p className="text-h3">{title}</p>
        <p className="mt-[4px] font-mono text-fine text-[color:var(--fg-muted)]">{org}</p>
        <p className="mt-[10px] text-[0.9rem] leading-[1.6] text-[color:var(--fg-muted)]">
          {detail}
        </p>
      </dd>
    </div>
  );
}
