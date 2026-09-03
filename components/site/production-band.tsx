/**
 * components/site/production-band.tsx — band 3. Short on purpose.
 *
 * ── THE TENSE IS THE POINT ────────────────────────────────────────────────
 *
 * Every claim in this band has `status: "in-progress"` and
 * `tense: "present-progressive"` in the corpus, and every one of them drags
 * clm:mlops-caveat along with it — “in flight and not shipped”. The band is
 * written in the present progressive throughout and states, in the status
 * line, that there is no public endpoint. A recruiter who reads this as
 * shipped has been misled by this page, so the honest tense is not a
 * politeness here; it is the reason the band is allowed to exist at all.
 *
 * Deliberately absent: a percentage complete, a target date, and a repository
 * link. None of the three exists, and a portfolio that invents a date for
 * unfinished work has just told the reader what its other dates are worth.
 *
 * It sits directly after the research band because it is the same work one
 * step further on: the retrieval result, wrapped in something a team could run.
 */

import { Band, Eyebrow, Reveal } from '@/components/ui';
import { Limit } from './evidence';

export function ProductionBand() {
  return (
    <Band tone="paper" id="production" prose>
      <Eyebrow>In progress</Eyebrow>

      <h2 className="mt-[14px] max-w-[22ch]">A result in a notebook is not yet a system</h2>

      <Reveal index={1}>
        <p className="mt-[22px] text-lede">
          I am wrapping the retrieval work in the deployment workflow the industry
          actually runs on: a containerised FastAPI evaluation service on AWS, shipped
          through GitHub Actions, with MLflow tracking every run against the paper’s
          frozen splits, Airflow re-scoring on a schedule, and ragas and Evidently being
          wired in to watch retrieval quality drift after release.
        </p>
      </Reveal>

      <Reveal index={2}>
        <p className="mt-[18px] text-[color:var(--fg-muted)]">
          The standard is the same as the research — every claim checkable — but on
          infrastructure a team could operate without me. That is the gap I care about,
          and it is the reason the recruiter agent above runs as a deployed service
          rather than as a screenshot of one.
        </p>
      </Reveal>

      {/*
        clm:mlops-thesis · clm:mlops-fastapi-aws · clm:mlops-gha · clm:mlops-mlflow ·
        clm:mlops-airflow · clm:mlops-drift-watch · clm:mlops-standard — all rendered
        above in the first person and the present progressive, which is the tense
        those records carry. The mandatory caveat follows.
      */}
      <p
        data-numeric
        className="mt-[26px] font-mono text-micro uppercase text-[color:var(--fg-accent)]"
      >
        Status — building · no public endpoint yet
      </p>

      <Limit ids={['clm:mlops-caveat']} />
    </Band>
  );
}
