/**
 * app/page.tsx — the portfolio.
 *
 * A Server Component that composes four bands and nothing else. All the copy,
 * and every reach into the evidence store, lives in `components/site/*`; this
 * file is the running order and the argument it makes.
 *
 * ── THE ORDER, AND WHY IT IS THIS ORDER (2026-09-08) ──────────────────────
 *
 *  1  hero          ink      the name, the statement, three actions
 *  2  highlights    paper    the three things this year — the whole argument
 *  3  fit           paper    the recruiter agent (Addendum B, R-7: paper)
 *  4  contact       paper    availability, and three ways to reach him
 *
 * FOUR BANDS, NOT NINE. Until 2026-09-08 this file mounted nine: research,
 * fit, production, award, coursework, full-stack, selected work, contact,
 * behind a hero carrying three evidence blocks and their caveats. The owner's
 * verdict — "no recruiter would actually read that much words… just highlight
 * three main things" — is the running order above. The first screen is who;
 * the second is the three results of 2026; the third is the thing a recruiter
 * can DO with the page; the fourth is how to reach him.
 *
 * THE OTHER BANDS ARE UNMOUNTED, NOT DELETED. components/site/research-band,
 * production-band, award-band, coursework-band, mavterras-band and
 * selected-work-band are still in the tree, still pass the corpus gates
 * (C7/C10 scan every file under components/), and any one of them is an
 * import and a line here away from returning. They are kept because each one
 * argues something the highlights compress — the through-line, the full-stack
 * thesis, the coursework arc — and because the month-by-month record they
 * link to is still served and linked from the footer.
 *
 * RESEARCH BEFORE THE AGENT, STILL. The agent is a delivery mechanism, not a
 * signal: a recruiter's first interaction should be reading three lines of
 * human-written evidence, not waiting on a model. The highlights band is
 * those three lines.
 *
 * ── THE GROUND BUDGET, SPENT ──────────────────────────────────────────────
 *
 * One `ink` band (the hero) and NO `crimson` band. The award band used to be
 * the second ink band; with the win now one of three records on paper, the
 * page has one held breath, at the top, and three paper bands after it. The
 * Seattle colourway is carried by the accent — every eyebrow, every hairline,
 * the focus ring — which is 7.43:1 on paper. The nav and footer declare
 * `paper` explicitly so nothing in the page chrome inherits a ground it did
 * not paint.
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

import { ContactBand } from '@/components/site/contact-band';
import { FitBand } from '@/components/site/fit-band';
import { Hero } from '@/components/site/hero';
import { HighlightsBand } from '@/components/site/highlights-band';
import { Intro, LogoReveal } from '@/components/site/intro';
import { introLogo } from '@/components/site/intro/source';

/**
 * ── THE INTRO, AND WHY IT IS MOUNTED HERE AND NOT IN THE LAYOUT ───────────
 *
 * The overlay renders LAST, after every band, and only when brand artwork
 * exists on disk. Three reasons, in order of how much they matter:
 *
 *  1. ABSENT ARTWORK MUST MEAN NOTHING AT ALL. `introLogo()` is the single
 *     answer the layout's gate script and this mount both read, so a document
 *     can never be stamped `pending` with no overlay in it. With no file
 *     there is no script, no attribute, no markup — the page as it ships
 *     today.
 *  2. The root layout wraps app/not-found.tsx too, and a 404 must never get a
 *     brand reveal. The gate script is inert off "/" as well; this is the
 *     second, structural half of the same guarantee.
 *  3. Last in document order so every word of the hero — the LCP copy, the
 *     name and the statement — is parsed and painted before the overlay's
 *     markup is even reached. The intro is an overlay on a page that has
 *     already rendered; it is never the reason the hero is late.
 *
 * The mark is passed as `children` rather than imported by <Intro>: the
 * artwork and its keyframes belong to whoever draws the lockup, and this line
 * is the only place in the app that knows their component's shape.
 */
export default function HomePage() {
  const logo = introLogo();

  return (
    <>
      <Hero />
      <HighlightsBand />
      <FitBand />
      <ContactBand />
      {logo !== null && (
        <Intro>
          <LogoReveal src={logo.href} />
        </Intro>
      )}
    </>
  );
}
