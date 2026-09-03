/**
 * components/site/award-band.tsx — band 5, and the second and last `ink` band
 * the page is allowed.
 *
 * ── WHY THIS ONE GETS THE DARK GROUND ─────────────────────────────────────
 *
 * The ground budget is two `ink` and one `crimson`. The crimson band is not
 * spent at all: a full-bleed #AA0000 section pulls the page toward a
 * collegiate-athletics register, which is the opposite of the “elegant,
 * minimal, straight to the point” the owner asked for. The Seattle colourway
 * is carried instead by the accent — every eyebrow, every threshold rule,
 * every hairline — which is 7.43:1 on paper and never leaves the page.
 *
 * That leaves two dark bands for the two moments that want a held breath: the
 * hero, and this. It is the shortest band on the page and the only unqualified
 * win on it, and it is dark because the seven paper bands around it need one
 * place to stop.
 *
 * ── WHAT THE BAND IS ACTUALLY ARGUING ─────────────────────────────────────
 *
 * Not “I won something”. Blind judging is the load-bearing fact — the entry
 * was assessed on narrative, data interpretation, scrollytelling and visual
 * design without the judges knowing whose it was — and the second load-bearing
 * fact is when it was built. It went in at the end of the quarter that also
 * carried both research positions and the Hadoop coursework.
 */

import { Band, Eyebrow, Reveal } from '@/components/ui';
import { EvidenceLink, Readout, artifactUrl, pageText, pageValue } from './evidence';

export function AwardBand() {
  return (
    <Band tone="ink" id="award">
      <Eyebrow>Award</Eyebrow>

      <h2 className="mt-[14px] max-w-[24ch]">
        Winner, Graduate Division — CAUSE Student Data Scrollytelling Contest
      </h2>

      <Reveal index={1}>
        <p className="mt-[22px] max-w-[var(--container-prose)] text-lede text-[color:var(--fg-muted)]">
          “Will AI Make Human Work Worthless — or Priceless?” is{' '}
          {pageValue('clm:cause-build')} of scroll-driven D3.js and Scrollama.js, with a
          widget that lets the reader move the model’s parameters and watch the
          conclusion move with them. {pageText('clm:cause-blind-judging')}
        </p>
      </Reveal>

      <Reveal index={2}>
        <p className="mt-[18px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)]">
          I submitted it in June, at the end of the spring quarter. Building the model and
          writing it for people who do not work in economics are separable skills; that
          quarter was where I had to schedule both against everything else and still ship.
        </p>
      </Reveal>

      <div className="mt-[clamp(32px,4.5vw,48px)] max-w-[var(--container-prose)]">
        <Readout
          value={artifactUrl('art:cause-story')}
          label="the entry, live"
          note={pageText('clm:cause-ces-model')}
        />
      </div>

      {/*
        clm:cause-win is the heading, clm:cause-story is the title and the live
        URL, clm:cause-concurrency is the June-submission sentence. None of them
        carries a mandatory caveat, so this is the one band on the page with no
        <Limit> block — which is itself the reason it is the band that gets to
        be loud.
      */}
      <div className="mt-[clamp(28px,4vw,40px)] flex flex-wrap gap-x-8 gap-y-3">
        <EvidenceLink id="art:cause-story" label="Read the story" />
        <EvidenceLink id="art:cause-contest" label="The contest" />
      </div>
    </Band>
  );
}
