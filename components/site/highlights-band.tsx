/**
 * components/site/highlights-band.tsx — band 2. The three things 2026
 * produced, in the order the owner ranked them, and nothing else.
 *
 * ── WHY THIS BAND EXISTS, AND WHAT IT REPLACED (2026-09-08) ───────────────
 *
 * Until 2026-09-08 the page argued its case across nine bands and roughly
 * 4,000 words: a 250-line research band, an award band, a coursework arc, the
 * MAVTERRAS thesis, three rows of earlier work. Every one of those bands was
 * right about something, and the owner's verdict on the whole was the one a
 * recruiter would give: "no recruiter would actually read that much words…
 * as recruiter scroll down just highlight three main things".
 *
 * So this is the page's second screen: three records, one per achievement,
 * each a rail, a title, one line, one link — and, where the corpus attaches a
 * caveat to the claim, that caveat in one line of fine print beside it. The
 * unmounted bands are still in this directory (see app/page.tsx) and the
 * month-by-month record is linked from the footer; nothing was deleted, it
 * was demoted below the fold of a reader's attention.
 *
 * ── THE ORDER IS THE OWNER'S ──────────────────────────────────────────────
 *
 *   1. the PSB 2027 paper — accepted for the proceedings AND an oral
 *      presentation; the oral slot is the line he wants a recruiter to see
 *   2. the barn-owl database for Prof. Brian Fischer's lab
 *   3. the CAUSE scrollytelling win, and the university's interview about it
 *
 * ── WHAT THE PSB ITEM DOES NOT SAY ────────────────────────────────────────
 *
 * Any result. The owner: "not need to go into detail of that research
 * paper, I will publish it later when I revised it for camera ready". The
 * item names the venue, the status, the slot, the co-author and the topic in
 * one phrase. The caveat under it — accepted, not yet published, camera-ready
 * due — is the record's own sentence (clm:yang-psb-caveat), which C10 makes
 * impossible to drop.
 *
 * ── THE SERIF, ONE BAND DOWN ──────────────────────────────────────────────
 *
 * The three titles are set in the serif, at --text-title, as the hero's
 * evidence titles were. app/layout.tsx argues the face: a serif is the
 * register in which the title of a person's work is set, and these are the
 * titles of his. The band's own h2 stays in the display face — that is a
 * section heading, and the university's register — so the rule that the
 * serif never reaches a band heading still holds.
 *
 * ── NO TEAMMATE, NO INTERVIEWER, IS NAMED ─────────────────────────────────
 *
 * The Graduate Studies interview is stated as the office that asked and the
 * fact that it happened (clm:cause-su-interview). The person who wrote is
 * not named on any surface, and the story's publication is not asserted —
 * when it has a URL it enters the corpus as an artifact and gets a link.
 *
 * Claims rendered here in the first person, with their ids recorded so the
 * licensing and caveat gates can see them: clm:yang-psb-submission ·
 * clm:yang-psb-oral · clm:fischer-role · clm:fischer-domain ·
 * clm:fischer-etl-formats · clm:fischer-selfserve · clm:cause-win ·
 * clm:cause-blind-judging · clm:cause-build · clm:cause-story ·
 * clm:cause-su-interview · clm:mav-live · clm:mav-sole-author.
 */

import type { ReactNode } from 'react';

import { Band, Eyebrow, Reveal, Rule } from '@/components/ui';
import { personById } from '@/lib/corpus';
import { rolePeriod } from '@/lib/corpus/surfaces';
import { EvidenceLink, figureAt, pageText, pageValue } from './evidence';

/**
 * Positions inside the two Fischer value blocks. `figureAt` asserts the array
 * length, so a corpus edit that reorders either stops the build instead of
 * silently renaming a number. These are LIVE figures (Addendum A.5):
 * `npm run corpus:refresh:fischer` re-derives them from the lab database.
 */
const DB = { NEURONS: 0, PASSES: 3, COUNT: 5 } as const;
const ARCHIVE = { RAW: 0, COUNT: 2 } as const;

/**
 * One record. The same grid as <Entry> — a mono rail, a title, a body, a
 * hairline above — with the title in the serif rather than the body face,
 * which is the one thing <Entry> does not offer and the reason this is not
 * <Entry>. An `<li>` because the three are an ordered list: the owner ranked
 * them, and a screen reader should say "one of three".
 */
function Highlight({
  index,
  rail,
  title,
  meta,
  children,
  links,
}: {
  index: number;
  rail: string;
  title: string;
  meta: string;
  children: ReactNode;
  /** The record's public links. Omitted where there is nothing a reader can open. */
  links?: ReactNode;
}) {
  return (
    <Reveal
      as="li"
      index={index}
      className="grid grid-cols-1 gap-x-8 gap-y-2 border-t border-[color:var(--edge)] py-[clamp(26px,3.5vw,36px)] sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline"
    >
      <div
        data-numeric
        className="font-mono text-eyebrow uppercase text-[color:var(--fg-muted)]"
      >
        {rail}
      </div>
      <div>
        <h3 className="font-serif text-title text-[color:var(--fg)]">
          {title}
        </h3>
        <p className="mt-[6px] font-mono text-fine text-[color:var(--fg-muted)]">{meta}</p>
        <div className="mt-[12px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)] [&>p+p]:mt-[10px]">
          {children}
        </div>
        {links !== undefined && (
          <div className="mt-[14px] flex flex-wrap gap-x-6 gap-y-2">{links}</div>
        )}
      </div>
    </Reveal>
  );
}

/**
 * A caveat, quoted from the record. One line of fine print rather than the
 * paper bands' <Limit> block: the sentence is the same and is still the
 * record's own (pageText, never retyped), but a titled aside under each of
 * three short records would out-weigh the records. The register shift — his
 * prose, the record's caveat — is carried by size and colour here.
 */
function Fine({ children }: { children: ReactNode }) {
  return <p className="mt-[10px] text-fine text-[color:var(--fg-muted)]">{children}</p>;
}

export function HighlightsBand() {
  const yang = personById('per:wenjing-yang').name;
  const fischer = personById('per:brian-fischer').name;
  const neurons = figureAt('clm:fischer-db-scale', DB.NEURONS, DB.COUNT);
  const passes = figureAt('clm:fischer-db-scale', DB.PASSES, DB.COUNT);
  const rawFiles = figureAt('clm:fischer-raw-archive', ARCHIVE.RAW, ARCHIVE.COUNT);

  return (
    <Band tone="paper" id="highlights">
      <Eyebrow>2026</Eyebrow>

      <h2 className="mt-[14px] max-w-[30ch]">A paper, a database, an award</h2>

      {/*
        THE COPY BELOW WAS WRITTEN BY FIVE DRAFTS, THREE JUDGES AND THREE
        ADVERSARIAL CHECKS (2026-09-08), against a fact sheet drawn from the
        corpus, with the owner's brief as the standard: "straight to the
        point, elegantly, minimalistically, for a recruiter". Every sentence
        is his, in the first person; every number is the corpus's, through
        figureAt; every caveat is the record's, through pageText.
      */}
      <Reveal index={1}>
        <p className="mt-[22px] max-w-[var(--container-prose)] text-lede text-[color:var(--fg-muted)]">
          Three outcomes this year. Everything else is on the résumé.
        </p>
      </Reveal>

      {/* role="list": WebKit drops the list role from a `list-style: none`
          list, and the whole point of the <ol> is that VoiceOver says "one of
          three". */}
      <ol role="list" className="mt-[clamp(32px,4.5vw,48px)] list-none">
        {/* ── 1 · PSB 2027 ──────────────────────────────────────────────────
          clm:yang-psb-submission and clm:yang-psb-oral, in the first person;
          the caveat is the record's. No result is stated, by the owner's
          instruction. */}
        {/*
          THE TITLE CARRIES BOTH HALVES the owner asked a recruiter to see —
          accepted, and the oral slot — so the body carries only what is new
          (who, what) and the record's caveat carries the status, the deadline
          and the date. Earlier drafts said "accepted … oral presentation" in
          the title, the body AND the caveat; the 2026-09-08 review counted it.
          No link: the caveat already says the manuscript is not public.
        */}
        <Highlight
          index={2}
          rail="PSB 2027"
          title="First-author paper, accepted for the proceedings and an oral presentation"
          meta="Pacific Symposium on Biocomputing · January 2027 · Big Island of Hawaii"
        >
          <p>With {yang}, on retrieval-augmented mammography report generation.</p>
          <Fine>{pageText('clm:yang-psb-caveat')}</Fine>
        </Highlight>

        {/* ── 2 · the barn-owl database ─────────────────────────────────────
          clm:fischer-role, clm:fischer-domain, clm:fischer-selfserve in the
          first person; the three figures are clm:fischer-db-scale and
          clm:fischer-raw-archive; the caveat is theirs. */}
        <Highlight
          index={3}
          rail="SU CNS"
          title="Research Data Engineer, Computational Neuroscience Research Group"
          meta={`${fischer} · Seattle University · NIH CRCNS-funded · ${rolePeriod('rol:fischer-rde')}`}
        >
          {/* art:iccl-db is on-request; saying so in the sentence beats a
              muted "Database — available on request" line under the record. */}
          <p>
            I designed the schema and wrote the Python ETL that loads XDPHYS, MATLAB, and
            CSV files into one SQLite database. Lab students now run neuron-level queries
            themselves; the database is available on request.
          </p>
          <p
            data-numeric
            className="flex flex-wrap gap-x-[18px] gap-y-[2px] font-mono text-data text-[color:var(--fg)]"
          >
            <span>{neurons} neurons</span>
            <span>{passes} recording passes</span>
            <span>{rawFiles} raw files</span>
          </p>
          <Fine>{pageText('clm:fischer-live-caveat')}</Fine>
        </Highlight>

        {/* ── 3 · CAUSE 2026 ───────────────────────────────────────────────
          clm:cause-win, clm:cause-blind-judging, clm:cause-story and
          clm:cause-su-interview in the first person. None carries a caveat. */}
        <Highlight
          index={4}
          rail="CAUSE 2026"
          title="Graduate Division winner, CAUSE data-story contest"
          meta={`CAUSE Student Data Scrollytelling Contest · ${pageValue('clm:cause-build')}`}
          links={
            <>
              <EvidenceLink id="art:cause-story" label="Read the story" />
              <EvidenceLink id="art:cause-contest" label="The contest" />
            </>
          }
        >
          <p>
            Judged blind on narrative, data interpretation, scrollytelling, and visual
            design. Seattle University Graduate Studies interviewed me for a story on the
            win.
          </p>
        </Highlight>
      </ol>

      <Rule index={5} className="mt-[clamp(8px,1.5vw,16px)]" />

      {/* clm:mav-live and clm:mav-sole-author, in one clause. The full-stack
          band this replaced is unmounted, not deleted — see app/page.tsx. */}
      <Reveal index={6}>
        <p className="mt-[22px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)]">
          Also live: <EvidenceLink id="art:mavterras-site" label="mavterras.com" face="body" />, my
          brother’s construction company. I turned two founders’ requirements into a scope,
          wrote the code with AI, and I deployed it and operate it in production: every
          customer brief and photo set is saved on arrival, sent to the company, and given an
          AI-drafted pre-call brief. It runs on Vercel, Neon Postgres and Cloudflare R2, the
          Anthropic API calls sit behind a demo-mode lock that defaults on, and when that pipeline
          fails or the database is cold, that is mine. Next, and mine to design and build: the
          company’s own job and agent system for internal operations, built in-house instead
          of another third-party service, so every lead is qualified and the homework done
          before anyone drives to a site.
        </p>
        {/*
          Every fact above is an existing verified record, in the record’s own
          words where it has them: clm:mav-requirements-elicited (two founders,
          a scope), clm:mav-ai-division-of-labour (wrote it with AI, drew the
          line himself), clm:mav-operating (deployed and still operates it;
          Vercel, Neon, R2, the pipeline as background work; owns the
          failures — NOT Inngest: the code has no such dependency, see the
          record's note), clm:mav-demo-mode (the lock defaults on). The last
          sentence is roadmap stated as roadmap — "next", "to design and
          build" — never as a thing that exists. The intake path — saved on arrival, a fixed
          company recipient, an AI-drafted pre-call brief — is what
          MAVTERRAS’s app/api/leads and app/api/leads/[id]/brief do, and its
          public health endpoint reported demo mode OFF with AI, email, database
          and storage live on 2026-09-09. None of the four carries a caveat.
          "Sole engineer" was the earlier line; in 2026 it reads as "prompted
          an app into existence" and says nothing a data-science recruiter
          scans for, so the line now says what was decided, shipped and owned.
        */}
      </Reveal>
    </Band>
  );
}
