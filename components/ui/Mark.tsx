import Image from 'next/image';
// Relative, not `@/lib/corpus`: tests/unit/design-system.test.ts imports this
// primitive through `../../components/ui`, and vitest.config.ts declares no
// path aliases. A `@/` specifier here fails the whole suite at import time —
// which is a worse trade than one relative path, and not this file's config
// to change.
import { artifactById, orgById } from '../../lib/corpus';
import { cx, groundFor, type SurfaceTone } from './system';

export type MarkVariant = 'text' | 'lockup' | 'seal';

export type MarkProps = {
  /**
   * `'text'`   — the affiliation set in type. THE DEFAULT, and the only form
   *              that reaches a page today. See THE PERMISSION QUESTION.
   * `'lockup'` — the seal + SEATTLE UNIVERSITY signature raster.
   * `'seal'`   — the academic seal alone.
   *
   * The two raster variants are RETAINED BUT GATED: they render only once
   * `art:su-mark` is `verified` in data/corpus/artifacts.json. Until then a
   * caller asking for either gets the text form, silently and on purpose —
   * see WHY THE FALLBACK IS SILENT.
   */
  variant?: MarkVariant;
  /**
   * Box height in px. Honoured by BOTH forms: the text form reserves exactly
   * this height so swapping the raster out cannot move anything around it.
   */
  height?: number;
  /**
   * The ground this sits on. `'light'` or omitted means "inherit"; anything
   * else declares that ground so the text form's colours resolve against the
   * surface it actually lands on rather than the one above it.
   */
  tone?: SurfaceTone;
  /**
   * DOUBLE DUTY, and the empty string is the load-bearing value.
   *
   * For the raster it is the image's accessible name. For the text form it is
   * the visible words. In both forms `alt=""` means "the affiliation is
   * already stated in adjacent text" — and the text form then renders NOTHING,
   * because a line of type repeating the line of type beside it is not a mark,
   * it is a stutter. That is what makes the footer correct without the footer
   * having to change: it already says "M.S. Data Science, Seattle University"
   * two elements away.
   */
  alt?: string;
  className?: string;
};

/* ═══════════════════════════════════════════════════════════════════════════
   THE SEATTLE UNIVERSITY MARK

   ── THE PERMISSION QUESTION, WHICH CAME FIRST ─────────────────────────────

   This file used to open with a paragraph about a white plate. That paragraph
   answered the wrong question. It asked how to make a black mark visible on a
   dark photograph, and the prior question — MAY WE SHOW THIS AT ALL — had
   never been put.

   It has now, and the answer is not ours to give. Three published rules, all
   quoted verbatim in data/corpus/sources.json (src:su-brand-guidelines-2024,
   src:su-trademark-permission), read on 2026-09-03:

     · Seattle University's licensing FAQ: "Any trademark that identifies or
       is associated with Seattle University may not be used without prior,
       expressed, written permission from Marketing Communications."
     · Its licensed-content policy enumerates the covered channels, and the
       list includes "Web sites and pages (commercial and personal)". A
       personal portfolio is named, not merely implied.
     · The 2024 brand guidelines, p.17: the academic seal "is not intended for
       general use... Its use by anyone other than the offices of the
       President, Provost, Deans, Board of Trustees and official staff is not
       permitted. Do not alter or attempt to recreate these elements in any
       way."

   AND public/brand/seattle_university_logo.png IS THAT SEAL. Rendered on
   white it is the ringed academic seal — eagle, shield, IHS, the 1891 banner
   — followed by the wordmark: precisely the composite the guidelines name
   "SEATTLE UNIVERSITY SEAL AND SIGNATURE". It is not the wordmark alone. So
   both files this repo ships are the restricted mark, and the old `variant`
   prop was offering a choice between two forms of the same one.

   None of that is a finding of fact about THIS site. The owner may hold a
   permission this repo has never seen, and the university itself refers fair
   use to counsel rather than answering it in a FAQ. So `art:su-mark` records
   the doubt at full strength as `pending-owner` with the exact questions, and
   THE SHIPPING CHOICE IS MADE SAFE UNDER THE DOUBT INSTEAD: the affiliation
   is set in type, which reproduces no mark. Naming an institution to state a
   true fact about yourself is the ordinary form, and it is the same argument
   this file already made about the College of Science & Engineering lockup —
   the fact belongs next to the words, not inside a logo.

   ── THE MEASUREMENT, SO NOBODY RE-OPENS THE DESIGN ARGUMENT WITHOUT IT ────

   The nav now sits over the hero photograph. It lands on the CREST, where
   components/site/hero-scrim.module.css paints an effective scrim alpha of
   0.2500 across the full width — the 0.8656 column only begins after the
   ease, 18px above the first glyph. The wordmark half of the raster is pure
   #000000 on transparency (sampled every second pixel: 100% of opaque pixels
   right of x=156 fall below luminance 60; the mean is 0).

   Compositing the shipped hero variants under that veil and taking the WORST
   pixel inside a 28px lockup box at the wrap's left gutter. THE SWEEP MATTERS
   MORE THAN ANY SINGLE ROW: the veil is a knob the sibling territory may
   move, so the mark was measured across the whole range it could land in,
   from the published crest to the pocket floor.

       veil alpha →     0.2188    0.2500    0.5000    0.8656
       1600 x 900        1.03      1.04      1.07      1.13
       1280 x 800        1.03      1.04      1.07      1.13
        861 x 1000       2.43      2.33      1.79      1.27
        390 x 844        2.46      2.38      1.81      1.27
        375 x 812        2.46      2.38      1.81      1.27

   WCAG 1.4.11 asks 3:1 of a graphical object. THE BLACK MARK NEVER REACHES IT
   AT ANY ALPHA, AT ANY VIEWPORT — and it gets worse as the veil deepens,
   because deepening the ground is the one move that helps light foregrounds
   and hurts dark ones. It is worst on desktop, where the left gutter is the
   dark ivy arch. So the raster was never available here on contrast grounds
   either, and a reviewer reading only the declared asset colour would not
   have seen it — the same class of trap as the 82%-bone bar in the reference.

   THE PLATE IS NOT THE ESCAPE. A white plate fixes the ratio and is roughly
   what the guidelines imply, but p.16 sets the isolation area at "the height
   (x) of the corresponding logo" with no "typography, rules or photography"
   inside it. At 28px that is an 84px-tall white rectangle — taller than the
   bar it sits in — laid on the top of the photograph, which is the object
   the owner has spent seven rounds removing. Both arms are closed. That is
   what sent this to the permission question rather than to a nicer plate.

   ── WHY TEXT IS THE RIGHT ANSWER MECHANICALLY, NOT ONLY LEGALLY ──────────

   The nav needs two declared grounds swapped by a data attribute: over the
   picture at rest, on paper once stuck. A raster cannot follow a ground —
   that is the entire reason the plate ever existed. Type resolves `--fg` and
   `--fg-muted` from `[data-ground]`, so it follows the swap for free and
   arrives already measured on both sides. The text form is the only form
   COMPATIBLE with the thing the nav is being asked to do.

   ⚠ WHAT THIS FILE DOES NOT FIX, STATED PLAINLY. Type is not a contrast fix
   for a bar with no ground of its own. Over the bare crest the ink tokens
   measure `--fg` 2.28:1 and `--fg-muted` 1.02:1 at 1280 — both fail, exactly
   as the raster did, because NO foreground survives an unpainted ground over
   a photograph. The nav must declare and paint a ground at rest.

   But the same sweep says what that ground needs to be, and the answer is not
   a white bar. Worst pixel in the same box, as the veil deepens:

       veil alpha →     0.2500    0.5000    0.8656
       --fg  @1280       2.28      4.21     11.87        (needs 4.5)
       --fg-muted        1.02      1.88      5.29        (needs 4.5)
       --fg  @375        5.16      7.75     13.71
       --fg-muted        2.30      3.45      6.11

   AT THE HERO'S OWN POCKET FLOOR — 0.8656, the alpha this page already paints
   under every glyph in the band — both roles clear AA at every viewport, the
   binding case being `--fg-muted` at 1280 with 5.29:1. That is an INK bar over
   the hero's ink band: a deepening of the picture, not a separate white object
   sitting on it, which is the thing the owner has been asking for. Whether to
   take it is the sibling territory's call; the numbers are here so it does not
   have to re-derive them.

   ── WHY THE FALLBACK IS SILENT ────────────────────────────────────────────

   `variant="lockup"` does not throw when permission is unresolved. Throwing
   would fail the build of a page whose only defect is a mark it must not show
   anyway, and the fix under deadline is to delete the guard. Rendering the
   safe form and leaving C15 to warn — loudly, with the owner's questions, on
   every single build — keeps the pressure on the question instead of on the
   mechanism. `npm run verify` prints it; nobody has to remember.

   ── IF PERMISSION ARRIVES ─────────────────────────────────────────────────

   Set `art:su-mark`'s provenance to `verified` and the raster returns; no
   code changes. Ask Marketing Communications for the WORDMARK or the SU
   INTERLOCK rather than these files — the guidelines encourage community use
   of the interlock and reserve the seal — and for the white/reverse variant,
   which could not be verified from the public web because the asset library
   is behind the Redhawk Hub login. NEVER `filter: invert()` and never
   hand-recolour: the seal carries "Do not alter or attempt to recreate these
   elements in any way", and inverting turns its red cyan besides.

   Intrinsic sizes, measured from the files:
     seattle_university_logo.png  673 × 165  PNG, alpha
     seattle_university_seal.png  360 × 364  PNG, alpha

   Minimum sizes if they ever ship: lockup 28px (below it the `1891` in the
   seal is lost and `UNIVERSITY` breaks up), seal 24px (below it the ring
   lettering turns to mud). Below those, the text form is the only option.

   STILL DELIBERATELY UNUSED: seattle_university.png, the College of Science &
   Engineering sub-brand. A JPEG wearing a .png extension, no alpha, ~8–12px
   of baked white padding, so it can only render as a brighter rectangle on
   the paper ground. It is listed in `art:su-mark`'s sourcePaths so C15 counts
   it, and it is not in ASSETS.
   ═══════════════════════════════════════════════════════════════════════════ */

const ASSETS = {
  lockup: { src: '/brand/seattle_university_logo.png', w: 673, h: 165 },
  seal: { src: '/brand/seattle_university_seal.png', w: 360, h: 364 },
} as const;

/**
 * The one artifact record that decides whether a mark may be drawn.
 *
 * Read through `artifactById`, which throws on a missing id — so deleting the
 * record is a build failure rather than a silent return of the raster. The
 * `provenance` shape is not on `Artifact` in lib/corpus/types.ts (only
 * hero-asset.ts needed it until now), so it is narrowed here to the single
 * field this file reads. Widening that interface belongs to lib/, not to a
 * primitive.
 */
const MARK_ARTIFACT_ID = 'art:su-mark';

function markIsPermitted(): boolean {
  const record = artifactById(MARK_ARTIFACT_ID) as { provenance?: { status?: string } };
  return record.provenance?.status === 'verified';
}

export function Mark({
  variant = 'text',
  height = 34,
  tone,
  alt = orgById('org:seattle-u').name,
  className,
}: MarkProps) {
  const raster = variant !== 'text' && markIsPermitted() ? ASSETS[variant] : null;

  /* ── THE TEXT FORM ────────────────────────────────────────────────────── */

  if (!raster) {
    // Empty alt means the words are already beside us. Say nothing twice.
    if (!alt) return null;

    return (
      <span
        data-ground={groundFor(tone)}
        style={{ height, lineHeight: 1 }}
        className={cx(
          'inline-flex items-center whitespace-nowrap font-mono text-micro uppercase',
          'text-[color:var(--fg-muted)]',
          className
        )}
      >
        {alt}
      </span>
    );
  }

  /* ── THE RASTER FORMS, once permission is recorded ────────────────────── */

  const img = (
    <Image
      src={raster.src}
      alt={alt}
      width={raster.w}
      height={raster.h}
      style={{ height, width: 'auto' }}
      priority={false}
    />
  );

  if (tone === undefined || tone === 'light') {
    return <span className={cx('inline-flex', className)}>{img}</span>;
  }

  // The plate is its own light surface, so anything nested in it (a caption,
  // a focus ring) resolves against paper rather than against the dark band.
  return (
    <span data-ground={groundFor('light')} className={cx('mark-plate', className)}>
      {img}
    </span>
  );
}
