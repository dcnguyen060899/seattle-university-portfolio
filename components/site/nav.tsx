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
 * THE BAR CARRIES THE DN MONOGRAM, AND NOTHING ELSE. Until 2026-09-05 it read
 * "Duy Nguyen · SEATTLE UNIVERSITY" in type: <Mark> rendered the affiliation
 * because `art:su-mark` is unverified and type was the only form that could
 * follow a ground swap. That reasoning was sound and it answered a question
 * this bar no longer asks — because the words are gone from the chrome
 * entirely, and <Mark> with them. The trademark argument still lives in
 * components/ui/Mark.tsx, which the footer still uses; it simply no longer
 * governs anything here.
 *
 * WHY THE WORDS WENT. This bar sits directly above a hero whose eyebrow reads
 * "M.S. DATA SCIENCE · SEATTLE UNIVERSITY" and whose h1 reads "Duy Nguyen".
 * Carrying both here put his name on screen twice and the university twice
 * before a reader had scrolled a pixel — and with the intro's lockup, the name
 * three times inside four seconds. The monogram is the same mark the intro
 * draws, compressed: identity resolving into its shorthand rather than the
 * same string set three ways.
 *
 * IT IS A GRAPHIC, SO 1.4.11 IS THE STANDARD, NOT 1.4.3. A logotype is exempt
 * from text contrast (src:wcag-logotype-exemption); what applies is the 3:1
 * that WCAG asks of a graphical object needed to understand the content. That
 * object is the cream D and N, which resolve `--fg` through `.home` and
 * measure 5.99:1 at their worst viewport over the composited crest. The
 * crimson flourish is a swash rather than a load-bearing form — it crosses
 * OVER the D and UNDER the N, so most of its length lies on cream at 7.08:1,
 * and the mark still reads as DN if a viewer never resolves it at all.
 *
 * scripts/check-nav-contrast.mjs measures this box; see the note on
 * `.markSlot` in the stylesheet for why the class name is load-bearing to that
 * gate and why the colour is declared on `.home` rather than on the SVG.
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
import { BrandMonogram } from '@/components/site/intro/LogoReveal';
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
          {/*
            THE MARK, NOT THE NAME IN TYPE — and the affiliation is gone from
            this bar entirely.

            What stood here was "Duy Nguyen · Seattle University", which put
            the name on screen twice before a reader had scrolled (here and in
            the hero's h1, with the intro's lockup making three inside four
            seconds) and "Seattle University" twice (here and in the hero's
            eyebrow). Both were the same word set in the same mono face a few
            hundred pixels apart, which reads as a stutter rather than as
            identity.

            The monogram breaks the repetition instead of hiding it: the intro
            draws the full lockup, this is that same mark compressed, and the
            h1 below is the document's heading rather than a third piece of
            branding. The affiliation is still stated where it is a claim
            about him — the hero eyebrow and the footer — rather than as
            chrome.

            IT STAYS INSIDE `.home`. That class is what
            scripts/check-nav-contrast.mjs measures for this box, and it
            declares `color: var(--fg)`; the monogram fills with
            `currentColor`, so it paints the role the gate already holds this
            element to, on both faces, with nothing new for the gate to learn.
            Swapping in an element that painted its own fill would have made
            the one graphical object in this bar invisible to the one script
            that checks it.

            The link keeps an accessible name in `aria-label`: the monogram is
            aria-hidden, so without it the only link to the homepage would
            announce as empty.
          */}
          <Link href="/" className={styles.home} aria-label="Duy Nguyen — home">
            <BrandMonogram height={26} className={styles.markSlot} />
          </Link>
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
