'use client';

/**
 * components/site/nav.tsx — the page chrome, rendered ONCE in app/layout.tsx.
 *
 * ── WHY IT IS IN THE LAYOUT AND NOT IN THE PAGE ───────────────────────────
 *
 * So that app/not-found.tsx inherits it. A 404 on a résumé domain with no way
 * back is the one navigational failure this site cannot afford, and a nav that
 * each page renders for itself is a nav the 404 route will eventually forget.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── WHY IT NOW STICKS, AND WHAT THAT ARGUMENT ACTUALLY PROTECTED ──────────
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file used to carry the opposite instruction, and it is worth restating
 * before it is overturned, because it was right about the thing it was
 * defending:
 *
 *     "It does not stick. A sticky bar over three alternating grounds needs
 *      either a ground of its own painted over the content (which costs the
 *      top of every band) or a scroll listener that re-resolves its tokens
 *      (which is a colour decision made at runtime, exactly what this system
 *      forbids)."
 *
 * The thing being defended is the invariant in scripts/check-ground-tokens.mjs:
 * NO COMPONENT PICKS A COLOUR. That invariant is untouched by what follows.
 * What changed is the premise underneath it — "three alternating grounds".
 *
 * WHAT CHANGED. The hero's photograph now reaches the very top of the band
 * (components/site/hero.module.css, THE PIN). A bar in flow above it is a
 * separate opaque object sitting ON the picture, which is the defect the owner
 * reported: "why do we have a white back separate from the background image in
 * the back". At rest the nav has to be ON the photograph, not above it.
 *
 * WHY THAT IS NOT THE FORBIDDEN MOVE. The nav is not over three alternating
 * grounds. It is over exactly TWO situations, and both are DECLARED:
 *
 *   1. inside the ink hero        → `data-ground="ink"`, declared right here
 *   2. anywhere else             → the document's own ground, declared at
 *                                  `:root` in app/globals.css (paper)
 *
 * The switch between them is `data-nav`, an ATTRIBUTE. No JavaScript computes
 * a colour, resolves a token, or reads a pixel. nav.module.css expresses the
 * second case by setting the twelve ground roles to `inherit` — i.e. by
 * *stopping* declaring ink and letting the page's own ground through. That is
 * a ground switch, not a colour decision, and it names no colour at all: the
 * grep in scripts/check-ground-tokens.mjs still passes on this file and on its
 * stylesheet, which is the mechanical form of the same claim.
 *
 * AND THE COST THE OLD ARGUMENT PRICED — "a ground of its own painted over
 * the content, which costs the top of every band" — is not paid, because the
 * paper face only ever exists where the page is already paper. It costs the
 * top of ONE band, the hero, which is the band that asked for it.
 *
 * ── THE STATE IS STRUCTURAL BEFORE IT IS DYNAMIC ──────────────────────────
 *
 * Three mechanisms, in order of how early they are true:
 *
 *   CSS, no JS   `body:not(:has(#top[data-ground="ink"]))` → paper face.
 *                A route with no ink hero — app/not-found.tsx today, anything
 *                added later — gets the legible bar with nothing to remember
 *                and no route list to maintain. The page already declares the
 *                only fact involved; the nav reads it.
 *   CSS, no JS   `@media (scripting: none)` → paper face AND `position:
 *                static`, i.e. byte-for-byte the nav that shipped before this
 *                change. With scripting off nothing can ever write `data-nav`,
 *                so a fixed transparent bar would be permanent.
 *   JS           `data-nav="paper"`, from useNavGround() below, once the
 *                nav's bottom edge passes the hero's. Hysteretic — see the
 *                dead band in hooks/use-scroll-driver.ts.
 *
 * `over` is the server snapshot because it is what the first two rules
 * already paint, so hydration writes the same attribute the server sent. The
 * one residual is a reload that RESTORES a deep scroll position on a page
 * that does have an ink hero: for the frames between paint and hydration the
 * bar is transparent below the hero. `subscribeScroll` primes on subscribe,
 * so that is corrected in the first effect rather than on the first scroll.
 *
 * ── THE VEIL, AND THE GATE IT IS ANSWERING ────────────────────────────────
 *
 * THIS IS THE PART THAT IS NOT COSMETIC. scripts/check-hero-contrast.mjs
 * check B proves the hero's scrim only has to reach its text floor ABOVE THE
 * FIRST GLYPH — "the aperture is legal only because it is text-free". The
 * first glyph sits at `--spacing-band + --hero-headroom`: 128px at 1280 wide,
 * 242px at 375. A fixed nav puts type at y≈0–110px, which is INSIDE that
 * aperture, over the brightest strip of the photograph, and the hero's veil is
 * deliberately transparent there.
 *
 * So the nav cannot borrow the hero's guarantee. It brings its own: `.veil`
 * below is an aria-hidden ramp owned by nav.module.css, and it exists for the
 * same reason hero-scrim.module.css exists — to make the ratios app/globals.css
 * publishes for the ink ground true again over a photograph.
 *
 * THE ALPHA IS NOT A TASTE DECISION AND IT IS NOT GUESSED. Mark.tsx's sweep
 * (2026-09-03) measured both ink text roles over this photograph as the veil
 * deepens, and states the conclusion this bar acts on:
 *
 *     veil alpha →   0.2500   0.5000   0.8656
 *     --fg  @1280      2.28     4.21    11.87     (needs 4.5)
 *     --fg-muted       1.02     1.88     5.29
 *
 * "AT THE HERO'S OWN POCKET FLOOR — 0.8656, the alpha this page already paints
 * under every glyph in the band — both roles clear AA at every viewport…
 * That is an INK bar over the hero's ink band: a deepening of the picture, not
 * a separate white object sitting on it… Whether to take it is the sibling
 * territory's call."
 *
 * THIS FILE IS THAT TERRITORY AND IT TAKES IT. The veil's plateau is the
 * hero's own floor, and it agrees with the number from the other direction
 * too: public/brand/hero/manifest.json publishes scrim.requiredAlpha = 0.86 —
 * the alpha at which EVERY glyph-sized patch of every emitted rung clears
 * 4.5:1 against --fg-muted. The nav's strip is inside that frame, so the
 * hero's own measurement covers it. nav.module.css rounds up, and says why.
 *
 * WHAT IS STILL UNMEASURED, PLAINLY: nothing has measured the RAMP — the
 * 64px below the plateau where the veil decays to nothing. No glyph is drawn
 * there, which is the same argument the hero's aperture makes, but no gate
 * asserts it for this element the way check-hero-contrast.mjs check B asserts
 * it for the hero's. That extension is written down in the report; it belongs
 * to scripts/, which is not this territory.
 *
 * ── THE MARK ──────────────────────────────────────────────────────────────
 *
 * THIS SECTION USED TO ARGUE THE TRADEMARK PROBLEM AND IT NO LONGER HAS TO.
 * components/ui/Mark.tsx was rewritten on 2026-09-03 and answers it upstream:
 * the raster variants are GATED on `art:su-mark` being `verified` in the
 * corpus, permission has not been given, and until it is, <Mark> renders the
 * affiliation as TYPE. That is the only form compatible with what this bar is
 * doing — a raster cannot follow a ground, type resolves `--fg-muted` from
 * `[data-ground]` and so follows the swap for free.
 *
 * So there is ONE brand element here, not two variants: `<Mark>` is correct on
 * both faces without this file knowing which face it is on. The plate is gone,
 * and with it the small white box on the photograph.
 *
 * ⚠ THE ONE THING THIS FILE OWES IF PERMISSION ARRIVES. The moment
 * `art:su-mark` flips to `verified`, <Mark> starts rendering a BLACK raster
 * here, and Mark.tsx's own sweep measured that raster at 1.03–1.27:1 over this
 * photograph at every veil alpha and every viewport — it never reaches the 3:1
 * that WCAG 1.4.11 asks of a graphical object, and it gets WORSE as the veil
 * deepens. Whoever flips that flag must either have obtained the reverse
 * variant Mark.tsx says to ask for, or pass a tone here. It is not a change
 * this bar absorbs silently.
 *
 * ── THE LINKS ─────────────────────────────────────────────────────────────
 *
 * The hrefs are root-relative (`/#research`, not `#research`) so the same nav
 * works from app/not-found.tsx, which has no such sections of its own. The
 * page is nine bands long, the sections are anchored, and the footer repeats
 * every destination — so the bar is a convenience, and nothing here is the
 * only route to anything.
 */

import Link from 'next/link';
import { useRef } from 'react';
import { Mark } from '@/components/ui';
import { useNavGround } from '@/hooks/use-scroll-driver';
import styles from './nav.module.css';

const SECTIONS = [
  { href: '/#research', label: 'Research' },
  { href: '/#fit', label: 'For recruiters' },
  { href: '/#full-stack', label: 'Full stack' },
  { href: '/#contact', label: 'Contact' },
] as const;

export function SiteNav() {
  const navRef = useRef<HTMLElement>(null);
  /*
    The ONLY client state in this file, and it is a ground name rather than a
    boolean on purpose: `stuck`/`unstuck` describes the bar's decoration,
    `over`/`paper` describes what it is standing on, and the second is the
    thing every rule in nav.module.css actually branches on.
  */
  const ground = useNavGround(navRef);

  return (
    <header
      ref={navRef}
      id="site-nav"
      data-ground="ink"
      data-nav={ground}
      className={styles.nav}
    >
      {/*
        The nav's own legibility ramp — see THE VEIL above. It is a sibling of
        the content rather than a background on .nav because the paper face
        needs a flat frosted fill and the ink face needs a vertical ramp, and
        one element cannot cross-fade between two different background shapes
        without one of them being wrong for 400ms. nav.module.css fades this
        out as the frosted fill comes in.
      */}
      <div className={styles.veil} aria-hidden="true" />

      <div className={`wrap ${styles.inner}`}>
        <div className={styles.brand}>
          <Link href="/" className={styles.home}>
            Duy Nguyen
          </Link>
          <span aria-hidden="true" className={styles.sep}>
            ·
          </span>

          {/*
            ONE element on both faces. No `tone`: passing one would DECLARE a
            ground under the mark, and the whole point is that it inherits the
            one this header is currently on and follows the swap. See THE MARK.
          */}
          <Mark height={28} alt="Seattle University" className={styles.markSlot} />
        </div>

        <nav aria-label="Portfolio sections">
          <ul className={styles.links}>
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <a href={section.href} className={styles.link}>
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
