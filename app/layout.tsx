import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter, Montserrat } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site/footer';
import { introLogo } from '@/components/site/intro/source';
import { SiteNav } from '@/components/site/nav';
import { INTRO_GATE_SCRIPT } from '@/lib/intro';
import { buildSiteMetadata, personSchema } from '@/lib/seo';
import './globals.css';

/**
 * DISPLAY FACE — Montserrat, and it is not a taste decision.
 *
 * Montserrat is Seattle University's OWN published free alternate for
 * Neutraface 2 (seattleu.edu · Brand Identity · Typography, which also names
 * Oswald for Knockout and Roboto Slab for Neutraface Slab). Using the
 * university's sanctioned stand-in rather than a face the designer liked is
 * the same class of move as the CSLB licence in the MAVTERRAS footer: a
 * requirement elicited from the stakeholder and implemented, visibly.
 *
 * `--font-display` in globals.css names "Neutraface 2 Display" FIRST, so if
 * the licence is ever obtained it is a zero-diff upgrade — one font file, no
 * change to the scale, the weights or any measured value.
 *
 * Not Oswald: it is the Knockout stand-in, heavy condensed all-caps, which on
 * a crimson site reads as athletics. Not Roboto Slab: a fourth family on a
 * page whose whole argument is restraint is one accessory too many.
 *
 * Honest caveat, carried in the scale rather than hidden: Montserrat's
 * x-height is noticeably larger than Neutraface's, so it reads less airy at
 * the same size. globals.css compensates with tighter tracking and a hard
 * floor — the display face never sets type below 26px.
 */
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['200', '300'],
  variable: '--font-montserrat',
  display: 'swap',
});

/**
 * BODY — Inter, chosen to be invisible. This is the one place the system
 * deliberately does not trace to the brand guide, and the reason is
 * legibility: SU's guideline is a PRINT guideline, and none of its three
 * faces sets 16px screen body text well. Montserrat at 16px is wide and low
 * in colour.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * UTILITY — IBM Plex Mono. The eyebrow, every label, every figure readout.
 * Two reasons that agree: docs/css/news.css on the current site already sets
 * its eyebrow in mono, and this portfolio's vernacular IS monospaced — P@1,
 * CPSC 5330, macro-F1, .iid/.itd/.bf, a latency readout.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

/*
 * Static weight instances, not the variable axes. The scale in globals.css
 * uses exactly these six cuts (Montserrat 200/300, Inter 400/500, Plex Mono
 * 400/500); shipping the full weight axis of three variable families to save
 * request count costs far more bytes than it saves.
 */

/**
 * Every search and social surface comes from `lib/seo.ts`, which builds them
 * out of the evidence store rather than out of copy kept here. That is why
 * this file carries no factual string about Duy at all: a description typed in
 * the layout is a description nothing gates, on the one surface where an
 * unsourced claim is invisible to its author and legible to a machine.
 */
export const metadata: Metadata = buildSiteMetadata();

/**
 * `colorScheme: 'light'` is load-bearing, not boilerplate. This system has
 * three grounds and all three are authored: the dark register is a band the
 * page chooses, not a preference the browser applies. Declaring `light` stops
 * a forced-dark browser mode from recolouring #FBFAF8 and #AA0000 into
 * something no ratio in globals.css describes.
 *
 * No `themeColor` here on purpose: it takes a literal hex, and this system
 * has exactly one home for a hex (app/globals.css). A theme-colour meta is
 * worth less than that invariant. If it is wanted, it should come from the
 * same module that owns the rest of the head — see the metadata contract above.
 */
export const viewport: Viewport = {
  colorScheme: 'light',
};

/**
 * The document shell: fonts, the skip link, the site chrome and
 * `<main id="main">`.
 *
 * THE CHROME IS RENDERED HERE, ONCE, AND NOT BY THE PAGES. `app/not-found.tsx`
 * inherits it that way: a 404 on a résumé domain with no nav and no footer is
 * the one navigational failure this site cannot afford, and chrome that each
 * page renders for itself is chrome the error route will eventually forget.
 * <SiteFooter> declares `paper` explicitly rather than inheriting a ground
 * from whatever scrolls under it.
 *
 * <SiteNav> IS FIXED, AND THAT IS THE ONE THING THIS FILE HAS TO GET RIGHT.
 * It is `position: fixed` in CSS from the first paint — never promoted by
 * JavaScript after hydration — so it is out of flow before the first frame and
 * NOTHING BELOW IT EVER MOVES. That is the whole no-layout-shift argument: a
 * nav that goes fixed in an effect shifts the document by its own height at
 * hydration time and books the full amount as CLS. There is deliberately no
 * spacer element and no `padding-top` on <main> here: the hero's photograph is
 * supposed to reach y=0 and the bar is supposed to sit on it. Routes that have
 * no ink hero get their clearance from nav.module.css, keyed on the same
 * `:has(#top[data-ground="ink"])` fact everything else about the bar is keyed
 * on, so it is a property of the document rather than a rule per route.
 *
 * The <html> element is where `--nav-h` lands (hooks/use-scroll-driver.ts
 * measures the bar and publishes it) and where `scroll-padding-block-start`
 * reads it, so an in-page anchor does not scroll its target under the bar.
 *
 * The skip link is the first focusable thing in the document and it is styled
 * in globals.css as crimson-on-paper regardless of what it lands over —
 * 7.43:1 — because it renders above everything and cannot know what is
 * underneath it. A keyboard user's first Tab must not land on something
 * invisible over the dark hero.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  /*
    THE HOMEPAGE INTRO'S GATE, and the two conditions it is under.

    (1) It is only emitted when brand artwork actually exists on disk
    (components/site/intro/source.ts). Absent artwork means no script, no
    attribute, no overlay markup and no behaviour change of any kind — the
    homepage as it ships today. That is the shipping state until the owner
    lands a file, so it is the well-tested path rather than an afterthought.

    (2) The script itself is inert off "/" — it checks location.pathname — so
    app/not-found.tsx and every future route pay these ~600 bytes of <head>
    and nothing else. It is in the layout rather than the page because a
    blocking inline script in <head> is the only thing that runs before ANY
    body content is parsed, let alone painted, and that position is what makes
    two guarantees structural rather than a race: no flash of the overlay on a
    repeat visit, and no flash of the SHARP photograph before the soft one
    (the script sets `--focus` to 1, which is the hero's own cross-fade).

    Reading a cookie with cookies() instead would opt the whole app out of
    static prerendering; a client component cannot run before hydration. The
    idiom is next/docs 01-app/02-guides/preventing-flash-before-hydration.md,
    themes section. Repo-controlled constants, no user input — the same
    dangerouslySetInnerHTML shape as the JSON-LD below.
  */
  const intro = introLogo();

  return (
    // suppressHydrationWarning: the gate script adds data-intro and inline
    // custom properties to this element during parsing, before React sees it.
    <html
      lang="en"
      className={`${montserrat.variable} ${inter.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>{intro !== null && <script dangerouslySetInnerHTML={{ __html: INTRO_GATE_SCRIPT }} />}</head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SiteNav />
        <main id="main">{children}</main>
        <SiteFooter />
        {/*
          The Person node, built from the same records the page renders. It is
          emitted here rather than per route so the structured data cannot
          disagree with the meta tags above it — both come from lib/seo.ts.
          JSON-LD is invisible to the post-build numeric gate (which reads
          visible text only), which is exactly why it must be generated rather
          than typed.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema()) }}
        />
      </body>
    </html>
  );
}
