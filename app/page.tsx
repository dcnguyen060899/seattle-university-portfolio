/**
 * app/page.tsx — the portfolio.
 *
 * A Server Component that composes nine bands and nothing else. All the copy,
 * and every reach into the evidence store, lives in `components/site/*`; this
 * file is the running order and the argument it makes.
 *
 * ── THE ORDER, AND WHY IT IS THIS ORDER ───────────────────────────────────
 *
 *  1  hero          ink      the three measured figures, and the honesty rule
 *  2  research      paper    two positions at once — signal #1, the spine
 *  3  fit           paper    the recruiter agent (Addendum B, R-7: paper)
 *  4  production    paper    the same work, one step further on. In progress.
 *  5  award         ink      blind-judged win — signal #2, and the one loud band
 *  6  coursework    paper    the curriculum, and CPSC 5330 — signal #3
 *  7  full-stack    paper    MAVTERRAS — signal #4, the closer
 *  8  selected      paper    older evidence, compressed
 *  9  contact       paper    availability, and four ways to reach him
 *
 * RESEARCH BEFORE THE AGENT. The agent is a delivery mechanism, not a signal:
 * putting it above the research band makes a recruiter’s first interaction a
 * wait before they have read any human-written evidence. Putting it directly
 * after means the spine has been read and the reader now knows what to ask.
 *
 * THE AWARD IS BAND 5, NOT BAND 2. It is the most legible credential on the
 * page and it would win a race to the top of it — but a blind-judged
 * scrollytelling prize read before the research reframes the whole page as a
 * design portfolio. It lands after the reader knows what the research is.
 *
 * ── THE GROUND BUDGET, SPENT ──────────────────────────────────────────────
 *
 * Two `ink` bands (hero, award) and NO `crimson` band. The budget allows one
 * crimson ground and this page declines it: a full-bleed #AA0000 section reads
 * as collegiate athletics, which is the opposite of what the owner asked for.
 * The Seattle colourway is carried instead by the accent — every eyebrow,
 * every threshold rule, every hairline, the focus ring — which is 7.43:1 on
 * paper and present on every band. The nav and footer declare `paper`
 * explicitly so nothing in the page chrome inherits a ground it did not paint.
 *
 * ── WHAT IS NOT ON THIS PAGE, AND WHERE IT WENT ───────────────────────────
 *
 * The ten-entry news list → /docs/news.html, linked from the research band and
 * from the footer. The algorithm tutor → the footer; it is a second AI
 * evaluation system on a page whose owner decided there would be one agent and
 * no second demo. Percentage skill bars, a metric-card band, a portrait
 * flip-card and the admin-panel link → deleted outright.
 *
 * ── WHERE THE NUMBERS COME FROM ───────────────────────────────────────────
 *
 * Nowhere in this subtree is a figure about Duy written as a literal. Every
 * one is `claimValue(id, 'page')` through `components/site/evidence.tsx`, and
 * three gates hold that: `claimValue` throws on an unlicensed read, ESLint
 * bans the known figure strings in `app/**` and `components/**`, and
 * `verify-corpus --built` scans the emitted HTML for any number no claim
 * licenses. The third is the one that matters, because it reads what shipped.
 */

import { AwardBand } from '@/components/site/award-band';
import { ContactBand } from '@/components/site/contact-band';
import { CourseworkBand } from '@/components/site/coursework-band';
import { FitBand } from '@/components/site/fit-band';
import { Hero } from '@/components/site/hero';
import { MavterrasBand } from '@/components/site/mavterras-band';
import { ProductionBand } from '@/components/site/production-band';
import { ResearchBand } from '@/components/site/research-band';
import { SelectedWorkBand } from '@/components/site/selected-work-band';

export default function HomePage() {
  return (
    <>
      <Hero />
      <ResearchBand />
      <FitBand />
      <ProductionBand />
      <AwardBand />
      <CourseworkBand />
      <MavterrasBand />
      <SelectedWorkBand />
      <ContactBand />
    </>
  );
}
