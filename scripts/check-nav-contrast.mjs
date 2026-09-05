#!/usr/bin/env node
/**
 * check-nav-contrast — the analogue of check-hero-contrast.mjs for the PAGE
 * CHROME, which is the one surface on this site that has TWO grounds.
 *
 * Wire into package.json:
 *   "check:nav": "node scripts/check-nav-contrast.mjs"
 *   "verify": "... && npm run check:hero && npm run check:nav && ..."
 *
 * `--prove`        run the negative controls (see THE NEGATIVE CONTROLS).
 * `--emit-extent`  print NAV_BOXES as JSON, for a browser gate to prove.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * components/site/nav.tsx used to carry an argument for NOT sticking, and the
 * argument was right about the thing it was defending:
 *
 *     "A sticky bar over three alternating grounds needs either a ground of
 *      its own painted over the content or a scroll listener that re-resolves
 *      its tokens (which is a colour decision made at runtime, exactly what
 *      this system forbids)."
 *
 * The legitimate form — the one that file now ships — is TWO DECLARED GROUNDS
 * swapped by an attribute. `data-nav="paper"` selects between `ink` (declared
 * on the element) and the document's own `:root` paper (reached by setting the
 * twelve roles to `inherit`). No colour is computed; a ground is selected.
 * scripts/check-ground-tokens.mjs still passes, which is the mechanical form
 * of that claim.
 *
 * BUT THAT GATE PROVES THE WRONG HALF. It proves the FOREGROUND resolves from
 * a ground. It says nothing about what is BEHIND the foreground, and behind a
 * fixed translucent bar is:
 *
 *   at rest    a campus photograph, through the hero's scrim, through the
 *              nav's own veil;
 *   stuck      whatever band is passing under it — five different opaque
 *              surfaces on this page — through a 97% fill.
 *
 * Neither is a declared colour. Both are composites. And the second gate this
 * repo already has cannot see them either: scripts/check-hero-contrast.mjs
 * gates only cells inside TEXT_EXTENT, and the nav sits in the CREST — the
 * strip above the hero's first glyph that gate deliberately leaves ungated
 * ("this is where the picture is ALLOWED to be a picture"). The crest is the
 * BRIGHTEST region of the frame: measured on the shipped rungs it reaches
 * sRGB 196 at 1600x900, and it also contains sRGB 23 at 861x1000.
 *
 * So the strip the nav occupies was, until this file, the one part of this
 * page that no instrument looked at. components/site/nav.module.css says so
 * itself, twice, in its own words: "The measurement this file still owes is
 * the composited ratio of --fg-muted and --fg-accent against the WORST
 * backdrop this bar can have, at this alpha", and "WHAT IS NOT MEASURED: the
 * 64px ramp below the plateau". This file is the instrument both notes are
 * waiting for.
 *
 * ── THE TRAP, NAMED BY THE REFERENCE ITSELF ───────────────────────────────
 *
 * MAVTERRAS/components/site/nav.module.css ships a 97% fill and its comment
 * gives the specification for this file in one clause:
 *
 *     "A translucent bar does not have one background — it has whatever is
 *      behind it, blended … at 82% the effective ground fell to ~#CFCDC8.
 *      Against that, the nav links drop to 3.50:1 and the wordmark accent to
 *      3.99:1 — both below AA, and both INVISIBLE TO ANY CHECK THAT READS THE
 *      DECLARED COLOUR INSTEAD OF THE COMPOSITED ONE."
 *
 * Every ratio below is computed against a COMPOSITED ground.
 *
 * ── AND WHY 97% IS DERIVED HERE RATHER THAN INHERITED ─────────────────────
 *
 * components/site/nav.module.css is honest about where its 97% came from:
 * "97% IS COPIED HERE, AND COPYING IT IS NOT THE SAME AS MEASURING IT … The
 * number is a starting point that is known to be in the right neighbourhood,
 * not a result."
 *
 * This file makes it a result. It bisects the minimum fill this palette needs
 * against every opaque surface the page paints and prints it beside the
 * shipped value. On the palette in app/globals.css the binding case is
 * --fg-muted #5E5C60 over the ink band, and the answer is materially below
 * the reference's 0.97 — because our muted role is DARKER than theirs, so our
 * bar tolerates a darker effective ground. Two repos, two palettes, two
 * numbers; the report prints both so the difference is visible instead of
 * assumed away.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── WHAT IT CHECKS ────────────────────────────────────────────────────────
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   R · AT REST, OVER THE PHOTOGRAPH.
 *       Decodes every graded rung the hero manifest declares, maps it into the
 *       band under `object-fit: cover` at six reference viewports exactly the
 *       way check-hero-contrast.mjs does, and walks a grid over each of the
 *       nav's own element boxes. In every cell it pairs the EXTREMES of the
 *       source luminance with the EXTREMES of the hero scrim's composite
 *       alpha, composites the nav's own veil on top, applies the element's
 *       per-glyph treatment through the shared observer model, and takes the
 *       worst ratio the four corners can produce.
 *
 *       BOTH EXTREMES, NOT JUST THE BRIGHTEST. check-hero-contrast.mjs takes
 *       only the maximum, correctly: every hero foreground is LIGHT on ink, so
 *       the brightest pixel is always the worst pairing. That stops being true
 *       here the moment anything dark lands in the bar — and something dark
 *       nearly did: the Seattle University lockup is a DARK silhouette (see
 *       MARK, measured), whose worst case is the DARKEST backdrop. A gate that
 *       inherited the hero's one-sided sampling would have reported it safe
 *       over the one region where it vanishes.
 *
 *       AND THE VEIL'S RAMP IS INSIDE THE WINDOW. nav.module.css names the
 *       64px decay below its plateau as the thing nothing measures. The boxes
 *       here are positioned in the bar's own coordinates and the veil is
 *       rasterised over its own box — `calc(100% + 64px)`, ramp included — so
 *       a glyph that ever lands in the decay is measured in the decay.
 *
 *   S · STUCK, OVER THE PAGE.
 *       The paper face's fill composited over EVERY opaque surface any band on
 *       this page paints — paper, paper-sunk, crimson-wash, ink, ink-raised,
 *       crimson, crimson-deep. The worst is the gate.
 *
 *       BLUR IS NOT MODELLED, AND THAT IS SOUND RATHER THAN LAZY.
 *       `backdrop-filter: blur()` averages the backdrop over its kernel. An
 *       average of samples drawn from a set is bounded by that set's extremes,
 *       and the extremes ARE the flat grounds enumerated above; a blurred
 *       ground can only fall BETWEEN two of them, never outside. So gating
 *       both endpoints bounds every intermediate the kernel can produce,
 *       including the seam where a paper band meets an ink one. `saturate()`
 *       is a chroma operation on an all-but-neutral composite and moves
 *       relative luminance by less than the HEADROOM margin.
 *
 *   M · THE MARK, WHICH IS TYPE TODAY AND A TRADEMARK TOMORROW.
 *       components/ui/Mark.tsx renders the affiliation as TYPE while
 *       `art:su-mark` is unverified in data/corpus/artifacts.json, so today
 *       the mark slot is a --fg-muted string and is measured as text at 4.5:1.
 *
 *       THE RASTER IS MEASURED ANYWAY, AS A LATENT CASE. nav.tsx ends with a
 *       warning that the day the flag flips, a BLACK raster starts rendering
 *       over this photograph, and "it is not a change this bar absorbs
 *       silently". A warning in a comment is not a gate. This file measures
 *       the raster's real silhouette against the real composited crest on
 *       every run and FAILS THE BUILD the moment the corpus says the raster
 *       is live and the ratio is under 1.4.11's 3:1. The latent number is
 *       printed even while it is latent, so the person who obtains permission
 *       can see what they are about to ship before they ship it.
 *
 *       The silhouette is MEASURED OUT OF THE PNG, and specifically out of the
 *       pixels that touch transparency — the only ones that ever meet the
 *       page. Interior white (27.98% of the lockup's opaque area) is enclosed
 *       by the seal's crimson and never touches the backdrop, so holding it to
 *       3:1 against the photograph would be measuring an adjacency that does
 *       not exist.
 *
 *   W · THE WIRING. The nav must have TWO recognisable faces, both resolving
 *       from a declared ground. One face is a bar whose second ground is
 *       unmeasured; a fixed bar with no faces at all is the failure nav.tsx's
 *       old comment predicted, and it fails by that name.
 *
 * ── AND WHEN THE TWO-FACE NAV IS NOT PRESENT ──────────────────────────────
 *
 * A nav that is in flow and opaque has one ground, it is measured by
 * app/globals.css, and there is nothing here to fail. The gate says so and
 * prints the FORECAST instead: what each role WOULD measure if the bar were
 * fixed over the crest at the derived height. That is the number a design
 * decision needs before it is written. The forecast is never a pass and is
 * printed under a banner that says so, because a forecast that could be
 * mistaken for a guarantee is worse than no forecast.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── HOW THE STATES ARE RECOGNISED, AND WHY NOT BY A NEW CONTRACT ──────────
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The first draft of this file demanded `--nav-state` / `--nav-ground` /
 * `--nav-height` custom properties, mirroring check-hero-contrast.mjs's
 * `--halo-role`. That was wrong, and worth recording as wrong: the hero needs
 * `--halo-role` because a text-shadow genuinely does not say who it is for,
 * so there is no way to attribute it without a declaration. THE NAV'S STATES
 * ALREADY SAY WHAT THEY ARE. `[data-nav='paper']` is in the selector.
 * `data-ground="ink"` is on the element. `--fg: inherit` is the ground switch,
 * spelled out. Adding a parallel set of properties would have created a second
 * source of truth for facts the stylesheet already states — and a second
 * source of truth that can disagree is the defect this repo keeps finding.
 *
 * So the recogniser reads the structure, by NAMED tokens, and hard-fails when
 * it cannot find them rather than guessing:
 *
 *     REST   rules on the nav root that carry none of the paper tokens.
 *            Ground: the `data-ground` attribute on the element in nav.tsx.
 *     PAPER  rules whose selector carries `[data-nav='paper']` or the
 *            structural `:not(:has(#top[data-ground='ink']))` fallback.
 *            Ground: the document root's, because the rule sets the roles to
 *            `inherit` and `:root` in app/globals.css IS the paper context.
 *     STATIC `@media (scripting: none)` — in flow, opaque, on paper. Reported
 *            rather than gated: it composites over nothing, so app/globals.css
 *            already publishes its ratios and re-deriving them here would be
 *            this file claiming credit for a measurement it did not make.
 *
 * Per-glyph treatments, if any appear, reuse check-hero-contrast.mjs's
 * contract VERBATIM and its own resolver, imported here. There is exactly one
 * halo model in this repository and this file does not add a second.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── THE DIVISION OF LABOUR ────────────────────────────────────────────────
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   check-ground-tokens.mjs   no component names a colour.
 *   check-hero-contrast.mjs   the band BELOW the nav, from the hero's first
 *                             glyph down. Crest ungated by design.
 *   THIS FILE                 the crest strip the nav occupies, in both of the
 *                             nav's faces, plus the page grounds the stuck bar
 *                             composites over, plus the latent raster mark.
 *   a browser gate            NAV_BOXES, proved against real client rects.
 *                             Does not exist yet — see CONTRACTS I NEED.
 *                             Until it does, NAV_BOXES is the one assumption
 *                             in this file and every run says so.
 *
 * The two node gates share ONE model. Everything below that computes a colour,
 * a length, a gradient, an observer window or a halo is IMPORTED from
 * scripts/check-hero-contrast.mjs rather than re-implemented — see
 * `loadHeroModel()`. Two files measuring one page with two copies of the
 * arithmetic is how they come to disagree, and the day they disagree neither
 * is evidence.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const NAV_TSX = join('components', 'site', 'nav.tsx');
const NAV_CSS = join('components', 'site', 'nav.module.css');
const COMPONENTS = join('components', 'site');
const MARK_TSX = join('components', 'ui', 'Mark.tsx');
const BRAND = join('public', 'brand');
const CORPUS = join('data', 'corpus', 'artifacts.json');

/* ════════════════════════════════════════════════════════════════════════════
   THE SHARED MODEL

   scripts/check-hero-contrast.mjs exports five things. It CONTAINS about
   thirty that this file needs: the CSS length evaluator, the colour resolver,
   the gradient rasteriser, the observer quadrature, the treatment resolver,
   the measured stem and counter tables, the calibration constants, the
   viewport table, the role thresholds, the asset collector and the decoder.

   That file is not this territory's to edit, and it should not be: adding
   exports to a 4000-line gate to satisfy a second gate gives the first one a
   second reason to change. So it is loaded verbatim with an export list
   appended — no edit, no copy, one source of truth. If somebody renames an
   internal there tomorrow this file fails LOUDLY on the next run rather than
   drifting into its own private copy of the maths.

   The module has no relative imports (only `node:` builtins), so it evaluates
   correctly from a data: URL, and `import.meta.url` there never equals
   process.argv[1], so its own `main()` does not run.
   ════════════════════════════════════════════════════════════════════════════ */

const HERO_GATE = join('scripts', 'check-hero-contrast.mjs');

const BORROWED = [
  'greyOf', 'contrastToLuminance',
  'localGroundLuminance', 'resolveTreatment', 'collectTreatmentRules',
  'treatmentReachPx', 'assertNeutrality',
  'lengthPx', 'stopColour', 'parseGradient', 'buildField', 'splitTop',
  'walkRules', 'readTypeScale', 'mediaMatches',
  'decodeLuminance', 'collectAssets',
  'VIEWPORTS', 'ROLE_THRESHOLDS', 'HALO_REACH_EM_MAX', 'CONTRAST_DISCLOSURE',
  'GRID', 'ROOT_FONT_PX',
  'GLOBALS', 'SCRIM', 'HERO_TSX', 'HERO_CSS', 'PHOTO_DIR',
  'SOURCE_STEM', 'SOURCE_EXTS',
];

async function loadHeroModel() {
  if (!existsSync(HERO_GATE)) {
    console.error(`check-nav-contrast: ${HERO_GATE} not found — run from the repo root.`);
    process.exit(2);
  }
  const src = readFileSync(HERO_GATE, 'utf8');
  const already = new Set(
    [...src.matchAll(/^export\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
  );
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const n of m[1].split(',')) already.add(n.trim().split(/\s+as\s+/)[0]);
  }
  const add = BORROWED.filter((n) => !already.has(n));
  const missing = add.filter((n) => !new RegExp(`(?:function|const|class)\\s+${n}\\b`).test(src));
  if (missing.length) {
    console.error(
      `check-nav-contrast: ${HERO_GATE} no longer defines ${missing.join(', ')}.\n`
      + '  This gate borrows that file\'s model rather than keeping a second copy of it, so a\n'
      + '  rename there surfaces here. Update BORROWED in this file — do NOT re-implement the\n'
      + '  missing piece locally, which is how the two gates come to disagree about one page.',
    );
    process.exit(2);
  }
  const url = 'data:text/javascript;base64,'
    + Buffer.from(`${src}\nexport { ${add.join(', ')} };\n`, 'utf8').toString('base64');
  return import(url);
}

/* ════════════════════════════════════════════════════════════════════════════
   CONSTANTS THIS FILE OWNS
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * IBM Plex Mono's advance width, in em. A published metric of the face
 * (600 units of a 1000-unit em), not a measurement of a screenshot. It is what
 * makes every box width below arithmetic rather than a guess: a monospaced
 * label of n characters at tracking t occupies exactly n * (0.600 + t) em, and
 * CSS letter-spacing adds after the final character too, which makes that a
 * hair generous — the safe direction.
 */
const MONO_ADVANCE_EM = 0.600;

/**
 * Line box height as a multiple of the font size, where the stylesheet
 * declares none. `--text-micro--line-height: 1.4` in app/globals.css is the
 * companion the type scale ships, and the bar's own height follows from it.
 * Over-estimating this samples MORE photograph than the bar covers, which is
 * conservative; under-estimating misses rows a glyph can reach. It is
 * therefore taken from the token and then inflated by BOX_MARGIN, never
 * shrunk.
 */
const FALLBACK_LINE_HEIGHT = 1.4;

/**
 * Inflation on every derived box, as a fraction of its own size, OUTWARD ONLY.
 * Pays for the difference between an advance box and an ink box, for hinting,
 * and for the underline a hovered link puts below the baseline. Same role and
 * same direction as check-hero-contrast.mjs's EXTENT_MARGIN.
 */
const BOX_MARGIN = 0.04;

/**
 * Share of the mark's silhouette a colour must hold to be a DEFINING colour.
 *
 * Below this it is rasteriser fringe — the antialiased ramp between the ink
 * and the page, which every glyph and every logo has and which no contrast
 * procedure has ever been evaluated against.
 */
const MARK_DEFINING_SHARE = 0.01;
/** Alpha above which a mark pixel counts as ink. */
const MARK_INK_ALPHA = 0.9;
/** Alpha below which a neighbour counts as page rather than mark. */
const MARK_VOID_ALPHA = 0.10;

/**
 * How far a light plate may sit from its surround before it reads as a box,
 * in CIE L*.
 *
 * NOT A WCAG NUMBER — there is no success criterion here, and every line that
 * prints it says so. It is the owner's seven-round rejection, quantified: L*
 * is the perceptual lightness axis, one L* is about one JND on a large flat
 * field, and this repo already uses exactly 1.0 L* as its "is the photograph
 * still visible" criterion (check-hero-contrast.mjs's `treatmentReachPx`). Ten
 * of those is not a subtle edge, it is a rectangle.
 *
 * REPORTED, NEVER GATED. Hard-failing a design decision on a number with no
 * standard behind it would be this file overreaching; the owner decides
 * whether a plate is acceptable. What he has not had until now is the number.
 * It stays in the file because <Mark> can still be asked for a plate, and the
 * day somebody does, this is what it will cost.
 */
const PLATE_SEAM_ADVISORY_LSTAR = 10;

/** CIE L* from relative luminance — the axis the plate seam is quoted in. */
const toLstar = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);

/* ════════════════════════════════════════════════════════════════════════════
   RECOGNISING THE TWO FACES

   Named tokens, so "how did you decide this rule was the paper face" has an
   answer in the file rather than in somebody's head. A nav that carries none
   of them is not silently assumed to be single-faced: `readNavShape` returns
   `unattributed` and check W fails.
   ════════════════════════════════════════════════════════════════════════════ */

/** A selector carrying any of these paints the SECOND (light) face. */
const PAPER_SELECTOR_TOKENS = [
  "[data-nav='paper']",
  '[data-nav="paper"]',
  /* The structural, JS-free fallback: this document has no ink hero, so there
     was never anything to be transparent over. */
  ":not(:has(#top[data-ground='ink']))",
  ':not(:has(#top[data-ground="ink"]))',
];

/** The at-rest ground is read off the element itself, never assumed. */
const GROUND_ATTR = /data-ground=["']([a-z]+)["']/;

/**
 * The properties this gate actually reads. A rule that declares none of them
 * cannot move a single number here.
 *
 * IT EXISTS TO SCOPE THE UNKNOWN-@MEDIA FAILURE, and the distinction is worth
 * stating because it looks like a loophole and is not one.
 * check-hero-contrast.mjs hard-fails on a @media condition it cannot evaluate,
 * correctly: every rule in the scrim paints the veil, so a query it cannot
 * place is an alpha it may be crediting at a viewport that never renders it.
 *
 * The nav's stylesheet is not like that. It carries rules that exist purely to
 * turn animation off — `@media (prefers-reduced-motion: reduce) { .nav, .veil
 * { transition: none } }` — and a transition cannot change a composited
 * ground, a box, or a colour. Failing the build on it would be the gate
 * reporting a defect it has itself proved impossible.
 *
 * So the failure is scoped to rules that COULD move a measurement, and the
 * scope is a list of properties rather than a list of queries: a query nobody
 * has taught the matcher still fails the moment somebody paints under it.
 */
const MEASURED_PROPS = new Set([
  'background', 'background-image', 'background-color', 'opacity', 'color',
  'display', 'position', 'padding', 'padding-block', 'padding-inline', 'gap',
  'row-gap', 'column-gap', 'font-size', 'letter-spacing', 'line-height',
  'block-size', 'height', 'inline-size', 'width', 'box-shadow', 'border-block-end',
  'text-shadow', '-webkit-text-stroke', 'paint-order',
]);

/* ════════════════════════════════════════════════════════════════════════════
   READING THE STYLESHEETS
   ════════════════════════════════════════════════════════════════════════════ */

/** Every `--name: value` inside the first block whose header matches. */
function blockVars(src, headerRe) {
  const m = headerRe.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index);
  if (i < 0) return null;
  let depth = 1;
  const start = i + 1;
  i += 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    i += 1;
  }
  const body = src.slice(start, i - 1).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = new Map();
  for (const d of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    out.set(d[1].trim(), d[2].trim());
  }
  return out;
}

/** A rule body -> Map of declarations, lower-cased property names. */
function declsOf(body) {
  const out = new Map();
  for (const d of body.matchAll(/(?:^|;)\s*(-{0,2}[-a-z0-9]+)\s*:\s*([^;]+)/gi)) {
    out.set(d[1].trim().toLowerCase(), d[2].trim());
  }
  return out;
}

/**
 * The palette, the role set each ground resolves, and the opaque surfaces each
 * ground paints.
 *
 * `--ground` is resolved FIRST and injected as `ctx.ground`, because the hero
 * gate's colour resolver special-cases `var(--ground)` to that field — which
 * is right for a veil painted in the band's own colour, and would otherwise
 * leave every ground's own definition unresolvable here.
 */
function readGrounds(globalsSrc, M) {
  const theme = blockVars(globalsSrc, /@theme\b[^{]*/) ?? new Map();
  const grounds = new Map();
  for (const m of globalsSrc.matchAll(/\[data-ground\s*=\s*"([a-z]+)"\s*\]\s*\{/gi)) {
    const name = m[1];
    const decls = blockVars(
      globalsSrc.slice(m.index),
      new RegExp(`\\[data-ground\\s*=\\s*"${name}"\\s*\\]\\s*`),
    );
    if (!decls) continue;
    const vars = new Map([...theme, ...decls]);
    let ground;
    try {
      ground = M.stopColour(decls.get('--ground') ?? '', { vars, ground: [0, 0, 0] }).rgb;
    } catch { continue; }
    const ctx = { vars, ground };
    const roles = new Map();
    for (const [role, need] of Object.entries(M.ROLE_THRESHOLDS)) {
      const expr = decls.get(role);
      if (expr === undefined) continue;
      try {
        const c = M.stopColour(expr, ctx);
        if (c.a >= 0.999) roles.set(role, { rgb: c.rgb, need });
      } catch { /* an unresolvable role is check-ground-tokens.mjs's failure */ }
    }
    /* The opaque surfaces a band actually paints. Enumerated rather than
       assumed to be `--ground` alone: an inset card is a different colour and
       a fixed bar passes over both. */
    const surfaces = new Map();
    for (const key of ['--ground', '--ground-sunk', '--surface-pressed']) {
      const expr = decls.get(key);
      if (expr === undefined) continue;
      try {
        const c = M.stopColour(expr, ctx);
        if (c.a >= 0.999) surfaces.set(key, c.rgb);
      } catch { /* ditto */ }
    }
    grounds.set(name, { name, ground, roles, surfaces, vars, decls });
  }
  return { theme, grounds };
}

/** Every stylesheet the nav component pulls in, plus the component itself. */
function readNavSources() {
  const out = { tsx: null, css: [] };
  if (existsSync(NAV_TSX)) out.tsx = readFileSync(NAV_TSX, 'utf8');
  const seen = new Set();
  const add = (file) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    out.css.push({ file, src: readFileSync(file, 'utf8') });
  };
  /* Read from the component, so a stylesheet split out tomorrow is inside this
     gate's window today — the rule check-hero-contrast.mjs applies to the hero. */
  for (const m of (out.tsx ?? '').matchAll(/from\s+'(\.[^']*\.module\.css)'/g)) {
    add(join(COMPONENTS, basename(m[1])));
  }
  add(NAV_CSS);
  return out;
}

/**
 * The nav's faces, derived from the landed structure.
 *
 * Returns `{ shape, faces, rules, fixed, problems }` where `faces` maps
 * 'rest' | 'paper' | 'static' to the rules that paint it.
 */
function readNavShape(nav, M) {
  const problems = [];
  const rules = [];
  for (const { file, src } of nav.css) {
    for (const rule of M.walkRules(src.replace(/\/\*[\s\S]*?\*\//g, ' '))) {
      if (rule.selector.startsWith('@')) continue;
      rules.push({
        file,
        selector: rule.selector,
        media: rule.media,
        decls: declsOf(rule.body),
      });
    }
  }

  /*
    WHICH FACE PAINTS THIS RULE.

    Two signals, in this order, and the order is the point:

      1. `--nav-state: rest | stuck`, if the rule declares it. The stylesheet
         saying so outright beats anything inferred, and components/site/
         nav.module.css does declare it.
      2. The structural tokens, otherwise — `[data-nav='paper']` and the
         JS-free `:not(:has(#top[data-ground='ink']))` fallback. These are the
         SELECTOR, so they are not a guess either: a rule that only applies
         when that attribute is present paints the face that attribute names.

    A rule matching neither paints the rest face, which is the one that is true
    with no attribute and no JS.
  */
  const faceOf = (rule) => {
    if (rule.media && /scripting\s*:\s*none/.test(rule.media)) return 'static';
    const declared = (rule.decls.get('--nav-state') ?? '').trim().toLowerCase();
    if (declared === 'stuck' || declared === 'paper') return 'paper';
    if (declared === 'rest') return 'rest';
    const sel = rule.selector.replace(/\s+/g, '');
    for (const tok of PAPER_SELECTOR_TOKENS) {
      if (sel.includes(tok.replace(/\s+/g, ''))) return 'paper';
    }
    return 'rest';
  };
  for (const r of rules) r.face = faceOf(r);

  const code = nav.css.map((c) => c.src).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const fixed = /position\s*:\s*(fixed|sticky)/.test(code);
  const translucent = /color-mix\([^)]*transparent/.test(code);

  const hasPaper = rules.some((r) => r.face === 'paper');
  const hasRest = rules.some((r) => r.face === 'rest');

  let shape;
  if (hasPaper && hasRest && (fixed || translucent)) shape = 'two-face';
  else if (fixed || translucent) shape = 'unattributed';
  else shape = 'flow-opaque';

  /* The at-rest ground, off the element itself. */
  let restGroundName = null;
  const tsx = nav.tsx ?? '';
  const headerBlock = /<header[\s\S]*?>/.exec(tsx);
  if (headerBlock) {
    const g = GROUND_ATTR.exec(headerBlock[0]);
    if (g) restGroundName = g[1];
  }

  return { shape, rules, fixed, translucent, restGroundName, problems };
}

/**
 * Which face a collected TREATMENT rule paints, by the same two signals
 * `faceOf` uses. `collectTreatmentRules` hands back {file, selector, media,
 * decls}, which is exactly what those signals read.
 */
function treatmentFace(rule) {
  if (rule.media && /scripting\s*:\s*none/.test(rule.media)) return 'static';
  const declared = (rule.decls.get('--nav-state') ?? '').trim().toLowerCase();
  if (declared === 'stuck' || declared === 'paper') return 'paper';
  if (declared === 'rest') return 'rest';
  const sel = String(rule.selector).replace(/\s+/g, '');
  for (const tok of PAPER_SELECTOR_TOKENS) {
    if (sel.includes(tok.replace(/\s+/g, ''))) return 'paper';
  }
  return 'rest';
}

/**
 * Resolved declarations for one class at one viewport: every rule mentioning
 * `.cls` whose face is `face` (or is face-agnostic) and whose @media matches,
 * in source order so the cascade's later-wins holds for equal specificity.
 */
function resolveClass(rules, cls, face, vp, M, unknownMedia) {
  const out = new Map();
  const re = new RegExp(`\\.${cls}(?![\\w-])`);
  for (const r of rules) {
    if (!re.test(r.selector)) continue;
    if (r.face !== face && !(face === 'rest' && r.face === 'rest')) {
      if (r.face !== face) continue;
    }
    if (/:hover|:focus|:active/.test(r.selector)) continue;
    if (r.media && !M.mediaMatches(r.media, vp, mediaSink(r, unknownMedia))) continue;
    for (const [k, v] of r.decls) out.set(k, v);
  }
  return out;
}

/**
 * The set `mediaMatches` records an unrecognised query into — the real one for
 * a rule that declares something this gate reads, and a throwaway for a rule
 * that cannot move any number here. See MEASURED_PROPS.
 */
function mediaSink(rule, unknownMedia) {
  for (const k of rule.decls.keys()) if (MEASURED_PROPS.has(k)) return unknownMedia;
  return new Set();
}

/** Every role token any rule for `.cls` paints, hover states included. */
function rolesOfClass(rules, cls, face, vp, M, unknownMedia, ROLE_THRESHOLDS) {
  const found = new Set();
  const re = new RegExp(`\\.${cls}(?![\\w-])`);
  for (const r of rules) {
    if (!re.test(r.selector)) continue;
    if (r.face !== face) continue;
    if (r.media && !M.mediaMatches(r.media, vp, mediaSink(r, unknownMedia))) continue;
    for (const v of r.decls.values()) {
      for (const m of String(v).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        if (m[1] in ROLE_THRESHOLDS) found.add(m[1]);
      }
    }
  }
  return found;
}

/* ════════════════════════════════════════════════════════════════════════════
   GEOMETRY — NAV_BOXES, THE ONE ASSUMPTION IN THIS FILE

   Same shape of risk as check-hero-contrast.mjs's TEXT_EXTENT and handled the
   same way: DERIVED from constants that are themselves derivable, emitted
   through `--emit-extent`, and to be PROVED in Chromium against real
   `Range.getClientRects()` by a browser gate that does not exist yet.

   ── WHY BOXES AND NOT ONE STRIP ───────────────────────────────────────────

   The tempting simplification is to gate the whole bar: x across the page
   measure, y from 0 to the bar's height, every role over every cell. It needs
   no layout knowledge and cannot be wrong in the unsafe direction.

   IT IS STILL WRONG, and check-hero-contrast.mjs already documents why in the
   same words: "that is not conservatism, it is a category error". The middle
   of this bar carries no glyphs. A bright window there would fail the gate,
   and the only way to satisfy it would be to darken the picture across the
   full width — which is the solid bar the owner is rejecting, arrived at from
   the other end. The instrument's window has to be the extent of the thing
   being CLAIMED ABOUT, and the claim is about the glyphs.

   ── AND WHY THE ROLES ARE PER BOX ─────────────────────────────────────────

   Each box's roles are read from the CLASS THAT PAINTS IT: `.home` resolves
   --fg, `.sep` and `.link` resolve --fg-muted, `.link:hover` resolves
   --fg-accent, the mark slot's own component resolves --fg-muted. Holding
   every role over every box would be a superset — safe, and needlessly
   strict in exactly the direction that would force the picture darker. The
   stylesheet already says which colour lands where; this reads it.
   ════════════════════════════════════════════════════════════════════════════ */

/** `.wrap`'s content box at a viewport: [x0, x1] in CSS px. */
function wrapBox(vp, vars, M) {
  const ctx = { vars, ground: [0, 0, 0], vw: vp.w, vh: vp.h, boxW: vp.w, boxH: vp.h, axis: vp.w };
  const measure = M.lengthPx(vars.get('--container-wrap') ?? '68rem', ctx);
  const gutter = M.lengthPx(vars.get('--spacing-gutter') ?? '20px', ctx);
  const w = Math.min(vp.w, measure);
  return {
    x0: (vp.w - w) / 2 + gutter,
    x1: (vp.w - w) / 2 + w - gutter,
    measure,
    gutter,
  };
}

/** Advance width of a monospaced string, in CSS px. */
const monoWidth = (text, fontPx, trackingEm) =>
  text.length * (MONO_ADVANCE_EM + trackingEm) * fontPx;

/** First length in a `gap`-style shorthand pair, resolved to px. */
function gapPair(expr, ctx, M, fallback) {
  if (expr === undefined) return fallback;
  const parts = String(expr).trim().split(/\s+/);
  try {
    const row = M.lengthPx(parts[0], ctx);
    const col = parts[1] !== undefined ? M.lengthPx(parts[1], ctx) : row;
    return { row, col };
  } catch { return fallback; }
}

/**
 * The nav's element boxes and the bar's height at one viewport, derived from
 * the stylesheet that shipped.
 *
 * Everything here is read: the bar's padding, the flex gaps, the type size and
 * tracking, which elements are hidden at this width. The only quantities NOT
 * read are the two that CSS does not state — the line box's height, taken from
 * the type scale's own `--text-micro--line-height` companion, and the label
 * advances, which follow from IBM Plex Mono being monospaced.
 */
function deriveNavBoxes(vp, rootVars, model, M) {
  const {
    rules, labels, wordmark, separator, markText, markHeightPx, face, unknownMedia,
    markWidthPx = null, markClass = 'markSlot', hasSeparator = true,
  } = model;
  const ctx = {
    vars: rootVars, ground: [0, 0, 0], vw: vp.w, vh: vp.h, boxW: vp.w, boxH: vp.h, axis: vp.w,
  };
  const wrap = wrapBox(vp, rootVars, M);
  const contentW = wrap.x1 - wrap.x0;

  const nav = resolveClass(rules, 'nav', face, vp, M, unknownMedia);
  const inner = resolveClass(rules, 'inner', face, vp, M, unknownMedia);
  const brand = resolveClass(rules, 'brand', face, vp, M, unknownMedia);
  const links = resolveClass(rules, 'links', face, vp, M, unknownMedia);
  const type = resolveClass(rules, 'link', face, vp, M, unknownMedia);
  const sepC = resolveClass(rules, 'sep', face, vp, M, unknownMedia);
  const markC = resolveClass(rules, 'markSlot', face, vp, M, unknownMedia);
  const veilC = resolveClass(rules, 'veil', face, vp, M, unknownMedia);

  const padExpr = nav.get('padding-block') ?? nav.get('padding') ?? '16px';
  const padY = M.lengthPx(String(padExpr).trim().split(/\s+/)[0], ctx);

  const fontExpr = type.get('font-size') ?? rootVars.get('--text-micro') ?? '10.5px';
  const fontPx = M.lengthPx(fontExpr, ctx);
  const trackExpr = type.get('letter-spacing') ?? '0.16em';
  const trackingEm = parseFloat(trackExpr) || 0;
  /* The mark slot is set by components/ui/Mark.tsx with the TOKEN's own
     tracking rather than the nav's, because it uses the `text-micro` utility
     and not this stylesheet's `.home, .link` rule. Two different numbers, and
     conflating them would mis-size the one box whose contents are longest. */
  const markTrackExpr = rootVars.get('--text-micro--letter-spacing') ?? '0.14em';
  const markTrackingEm = parseFloat(markTrackExpr) || 0;

  const lhExpr = type.get('line-height') ?? rootVars.get('--text-micro--line-height');
  const lineHMul = lhExpr !== undefined ? (parseFloat(lhExpr) || FALLBACK_LINE_HEIGHT)
    : FALLBACK_LINE_HEIGHT;
  const lineH = fontPx * lineHMul;

  const innerGap = gapPair(inner.get('gap'), ctx, M, { row: 12, col: 32 });
  const brandGap = gapPair(brand.get('gap'), ctx, M, { row: 16, col: 16 });
  const linkGap = gapPair(links.get('gap'), ctx, M, { row: 8, col: 24 });

  /* `hasSeparator` is about the MARKUP, `display` about the stylesheet. Both
     have to be true. Reading only the stylesheet is what left a separator box
     in the model after the element was deleted from nav.tsx: with no `.sep`
     rule left to say `display: none`, the old expression evaluated to true and
     the gate kept a phantom in the layout — and warned it could find no role
     for it, which was the symptom rather than the cause. */
  const sepShown = hasSeparator && (sepC.get('display') ?? '').trim() !== 'none';
  const markShown = (markC.get('display') ?? '').trim() !== 'none';

  /* ── the two clusters ─────────────────────────────────────────────── */
  /* An empty wordmark is not a zero-width string to measure — it is a box that
     is not there. A graphic mark carries its own width; only a TYPE mark is
     measured from its glyphs. */
  const wmW = wordmark ? monoWidth(wordmark, fontPx, trackingEm) : 0;
  const sepW = sepShown ? monoWidth(separator, fontPx, trackingEm) : 0;
  const markW = markShown
    ? (markWidthPx ?? monoWidth(markText, fontPx, markTrackingEm))
    : 0;
  const brandLead = wordmark ? 1 : 0;
  const brandW = wmW
    + (sepShown ? brandGap.col + sepW : 0)
    + (markShown ? (brandLead || sepShown ? brandGap.col : 0) + markW : 0);
  const brandH = Math.max(wordmark ? lineH : 0, markShown ? markHeightPx : 0);

  const linkW = labels.map((l) => monoWidth(l, fontPx, trackingEm));
  const linksW = linkW.reduce((a, b) => a + b, 0) + linkGap.col * Math.max(0, linkW.length - 1);

  /* Does the link row itself wrap? Rows are packed greedily, which is what a
     flex line-breaker does. */
  const linkRows = [];
  {
    let row = [];
    let w = 0;
    linkW.forEach((width, i) => {
      const add = row.length ? linkGap.col + width : width;
      if (row.length && w + add > contentW) {
        linkRows.push(row);
        row = [i];
        w = width;
      } else {
        row.push(i);
        w += add;
      }
    });
    if (row.length) linkRows.push(row);
  }
  const linksH = linkRows.length * lineH + (linkRows.length - 1) * linkGap.row;

  const innerWraps = brandW + innerGap.col + linksW > contentW;
  const innerH = innerWraps ? brandH + innerGap.row + linksH : Math.max(brandH, linksH);
  const navH = (padY * 2 + innerH) * (1 + BOX_MARGIN);

  const rows = innerWraps
    ? [{ y0: padY, y1: padY + brandH }, { y0: padY + brandH + innerGap.row, y1: padY + innerH }]
    : [{ y0: padY, y1: padY + innerH }, { y0: padY, y1: padY + innerH }];

  const boxes = [];
  const push = (name, cls, kind, x0, x1, rowIdx, h) => {
    const r = rows[Math.min(rowIdx, rows.length - 1)];
    const cy = (r.y0 + r.y1) / 2;
    const w = x1 - x0;
    boxes.push({
      name,
      cls,
      kind,
      x0: Math.max(0, x0 - w * BOX_MARGIN),
      x1: Math.min(vp.w, x1 + w * BOX_MARGIN),
      y0: Math.max(0, cy - (h / 2) * (1 + BOX_MARGIN * 2)),
      y1: Math.min(navH, cy + (h / 2) * (1 + BOX_MARGIN * 2)),
    });
  };

  let x = wrap.x0;
  if (wordmark) {
    push('wordmark', 'home', 'text', x, x + wmW, 0, lineH);
    x += wmW;
  }
  if (sepShown) {
    x += brandGap.col;
    push('separator', 'sep', 'text', x, x + sepW, 0, lineH);
    x += sepW;
  }
  if (markShown) {
    if (wordmark || sepShown) x += brandGap.col;
    /* `markClass`, not a literal: the monogram sits INSIDE `.home` and takes
       its colour from that rule via `currentColor`, so resolving the box
       against `.markSlot` — which declares layout only — would find no role
       and measure the box against a default the bar does not paint. */
    push('mark', markClass, 'mark', x, x + markW, 0, markHeightPx);
  }

  /* The link cluster. Unwrapped it is flush right (justify-content:
     space-between with two items); wrapped, the second line starts at the
     content box's left edge, which is what a wrapped flex line does. */
  const linkRowY = innerWraps ? 1 : 0;
  linkRows.forEach((row, ri) => {
    const rowW = row.reduce((a, i) => a + linkW[i], 0) + linkGap.col * (row.length - 1);
    let lx = (innerWraps || linkRows.length > 1) ? wrap.x0 : wrap.x1 - rowW;
    for (const i of row) {
      const r = rows[Math.min(linkRowY, rows.length - 1)];
      const yTop = r.y0 + (linkRows.length > 1
        ? ((r.y1 - r.y0) - linksH) / 2 + ri * (lineH + linkGap.row) : ((r.y1 - r.y0) - lineH) / 2);
      const w = linkW[i];
      boxes.push({
        name: `link:${labels[i]}`,
        cls: 'link',
        kind: 'text',
        x0: Math.max(0, lx - w * BOX_MARGIN),
        x1: Math.min(vp.w, lx + w * (1 + BOX_MARGIN)),
        y0: Math.max(0, yTop - lineH * BOX_MARGIN),
        y1: Math.min(navH, yTop + lineH * (1 + BOX_MARGIN)),
      });
      lx += w + linkGap.col;
    }
  });

  /*
    THE VEIL'S OWN BOX, WHICH IS NOT THE BAR'S — AND ITS OWN ORIGIN.

    This element has moved once already. It began as a full-height ramp over
    the bar (`block-size: calc(100% + 64px)`, `inset-block-start: 0`) and is
    now the TAIL BELOW the bar's foot (`inset-block-start: 100%`,
    `block-size: 64px`) with the plateau moved onto `.nav`'s own background.

    Both forms have to be measured correctly by the same code, so the offset
    and the height are READ rather than assumed. A gate that assumed the
    origin was the bar's top would, in the current form, evaluate the tail's
    stops across the glyph rows and credit every link with a 74%→transparent
    ramp that is painted 62px below it. The number would be wrong in the
    flattering direction, which is the one direction this file may not be
    wrong in.
  */
  let veilH = navH;
  const veilSize = veilC.get('block-size') ?? veilC.get('height') ?? null;
  if (veilSize !== null) {
    try {
      veilH = M.lengthPx(veilSize, { ...ctx, boxH: navH, axis: navH, boxW: vp.w });
    } catch { veilH = navH; }
  }
  let veilTop = 0;
  const veilOffset = veilC.get('inset-block-start') ?? veilC.get('top') ?? null;
  if (veilOffset !== null) {
    try {
      veilTop = M.lengthPx(veilOffset, { ...ctx, boxH: navH, axis: navH, boxW: vp.w });
    } catch { veilTop = 0; }
  }

  return {
    navH,
    veilH,
    veilTop,
    innerWraps,
    linkRows: linkRows.length,
    fontPx,
    lineH,
    padY,
    wrap,
    contentW,
    brandW,
    linksW,
    sepShown,
    markShown,
    boxes,
    veilDecls: veilC,
    navDecls: nav,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   THE MARK'S SILHOUETTE
   ════════════════════════════════════════════════════════════════════════════ */

async function markSilhouette(sharp, file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const alphaAt = (x, y) => data[(y * width + x) * channels + 3] / 255;
  const bins = new Map();
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) < MARK_INK_ALPHA) continue;
      let onEdge = false;
      for (let dy = -1; dy <= 1 && !onEdge; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) { onEdge = true; break; }
          if (alphaAt(nx, ny) < MARK_VOID_ALPHA) { onEdge = true; break; }
        }
      }
      if (!onEdge) continue;
      total += 1;
      const o = (y * width + x) * channels;
      const key = [data[o], data[o + 1], data[o + 2]].map((v) => Math.round(v / 16) * 16).join(',');
      const cur = bins.get(key);
      if (cur) cur.n += 1;
      else bins.set(key, { rgb: [data[o], data[o + 1], data[o + 2]], n: 1 });
    }
  }
  const defining = [...bins.values()]
    .filter((b) => b.n / total >= MARK_DEFINING_SHARE)
    .sort((a, b) => b.n - a.n)
    .map((b) => ({ rgb: b.rgb, share: b.n / total }));
  return { file, width, height, total, defining };
}

/** Is the Seattle University raster permitted to render? Read, never assumed. */
function markIsLive() {
  if (!existsSync(CORPUS)) return { live: false, status: '(no corpus)' };
  try {
    const raw = JSON.parse(readFileSync(CORPUS, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.artifacts ?? []);
    const rec = list.find((a) => a && a.id === 'art:su-mark');
    const status = rec?.provenance?.status ?? '(absent)';
    return { live: status === 'verified', status };
  } catch (err) {
    return { live: false, status: `(unreadable: ${err && err.message ? err.message : err})` };
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   THE MEASUREMENT
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Worst ratio for one foreground over one cell.
 *
 * `lo`/`hi` are the extremes of the SOURCE luminance in the cell; `aLo`/`aHi`
 * the extremes of the hero scrim's composite alpha over the same rectangle.
 * The composited luminance is monotone in each, so the four corners bound the
 * whole rectangle exactly — no interior sample can produce a worse pair.
 *
 * Pairing the darkest source with the thinnest veil (and so on) is the same
 * conservatism check-hero-contrast.mjs applies when it pairs a cell's
 * brightest pixel with its weakest alpha: the pair need not co-occur at one
 * pixel, and a bound that assumes it might is a bound.
 */
function worstOverCell(M, fg, cell, navFill, t, need, navGroundRgb) {
  let worst = Infinity;
  let at = null;
  let needAlpha = 0;
  for (const l of [cell.lo, cell.hi]) {
    for (const a of [cell.aLo, cell.aHi]) {
      const src = cell.hasPhoto ? M.greyOf(l) : cell.bare;
      const scrimmed = cell.hasPhoto ? M.composite(a.rgb, a.a, src) : src;
      const backdrop = navFill === null
        ? scrimmed
        : M.composite(navFill.rgb, navFill.a, scrimmed);
      const ground = M.localGroundLuminance(t, backdrop);
      const r = M.contrastToLuminance(fg, ground);
      if (r < worst) {
        worst = r;
        at = {
          l, alpha: a.a, backdrop: backdrop.map((v) => Math.round(v)), ground,
          navAlpha: navFill === null ? 0 : navFill.a,
        };
      }
      /*
        AND THE NUMBER THAT TURNS A VERDICT INTO A BRIEF.

        A failing ratio says the bar is illegible here; it does not say by how
        much, and "deepen the veil" with no target is how the next round
        arrives at a value by nudging. So the smallest fill alpha at which THIS
        role clears its threshold over THIS backdrop is solved at every corner
        of every cell, and the maximum over all of them is the plateau the rest
        face actually needs.

        Solved with check-hero-contrast.mjs's own `minAlpha`, over the nav's
        own ground colour — the same bisection that sizes the hero's scrim, so
        the two numbers are commensurable rather than merely similar.

        THE TREATMENT IS NOT CREDITED IN THIS SOLVE, on purpose: a halo changes
        the answer, and a halo sized against a veil that was itself sized
        against the halo is circular. The alpha printed is what a BARE role
        needs — the honest target when no treatment is declared, and a
        conservative one when there is.
      */
      if (need !== undefined && navGroundRgb) {
        const req = M.minAlpha(fg, navGroundRgb, scrimmed, need);
        if (req > needAlpha) needAlpha = req;
      }
    }
  }
  return { ratio: worst, at, needAlpha };
}

/**
 * The scrim's alpha extremes over a rectangle, sampled at its corners and
 * centre — the same five-point rule check-hero-contrast.mjs uses, and for the
 * same reason: these bound any smooth gradient closely at cell size.
 */
function alphaExtremes(field, x0, y0, x1, y1) {
  let lo = null;
  let hi = null;
  for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]]) {
    const s = field(px, py);
    if (lo === null || s.a < lo.a) lo = s;
    if (hi === null || s.a > hi.a) hi = s;
  }
  return { aLo: lo, aHi: hi };
}

/**
 * Minimum fill alpha at which every painted role clears its threshold over
 * every opaque page surface. Bisected, never typed. This is the number
 * MAVTERRAS arrived at as 0.97 for ITS palette; ours is ours.
 */
function minStuckFill(M, fillRgb, roles, surfaces, headroom, treatments) {
  const ok = (alpha) => {
    for (const bg of surfaces) {
      const composited = M.composite(fillRgb, alpha, bg.rgb);
      for (const [role, def] of roles) {
        const t = treatments.get(role) ?? null;
        const g = M.localGroundLuminance(t, composited);
        if (M.contrastToLuminance(def.rgb, g) < def.need * headroom) return false;
      }
    }
    return true;
  };
  if (ok(0)) return 0;
  if (!ok(1)) return null;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * THE ANALYSIS.
 *
 * Pure: everything it reads arrives in `input`, so `--prove` can hand it a
 * synthetic stylesheet and get a real answer about a page nobody shipped.
 */
/* ── the brand cluster, read from what shipped ──────────────────────────────
   THE BRAND BOX CHANGED SHAPE ON 2026-09-05 and this reader is why the change
   is visible here instead of silent. The bar used to hold "Duy Nguyen · SEATTLE
   UNIVERSITY" as three type boxes; it now holds ONE graphic, the DN monogram,
   inside the same `.home` link.

   THE OLD READER DID NOT FAIL — IT FELL BACK, which is worse. Its wordmark
   regex `/>\s*([^<>{}]+?)\s*<\/Link>/` cannot match a Link whose child is an
   element, and `<Mark height={…}>` is simply gone, so every field defaulted:
   "Duy Nguyen", 28px, "Seattle University". The gate went on modelling a
   180px-wide cluster of type that is not in the bar, and sampled the
   photograph under boxes that do not exist. It still said OK. A gate that
   describes the previous version of the page is not a weaker gate, it is a
   false one.

   So: if the nav renders <BrandMonogram>, the cluster is one graphic box whose
   width follows the monogram's own ink-box aspect, there is no wordmark and no
   separator, and the box carries class `.home` because that is the rule that
   declares its colour — the monogram fills with `currentColor`. */
const MONOGRAM_ASPECT = 350 / 310;

function readBrandCluster(tsx) {
  const monoH = Number(/<BrandMonogram[^>]*\bheight=\{(\d+)\}/.exec(tsx)?.[1] ?? 0);
  if (monoH > 0) {
    return {
      wordmark: '',
      separator: '',
      markText: '',
      markHeightPx: monoH,
      markWidthPx: monoH * MONOGRAM_ASPECT,
      markClass: 'home',
      hasSeparator: false,
    };
  }
  return {
    wordmark: (/>\s*([^<>{}]+?)\s*<\/Link>/.exec(tsx)?.[1] ?? 'Duy Nguyen').trim(),
    separator: '\u00b7',
    markText: (/<Mark[^>]*alt="([^"]*)"/.exec(tsx)?.[1] ?? 'Seattle University').toUpperCase(),
    markHeightPx: Number(/<Mark[^>]*height=\{(\d+)\}/.exec(tsx)?.[1] ?? 28),
    markWidthPx: null,
    markClass: 'markSlot',
    hasSeparator: true,
  };
}

function analyseNav(input) {
  const { M, globalsSrc, nav, hero, assets, headroom, marks, markState } = input;
  if (!input.markRoles) input.markRoles = ['--fg-muted'];

  const failures = [];
  const notes = [];
  const geometryOut = [];
  const markGround = [];
  const fail = (where, message, detail, fix) => failures.push({ where, message, detail, fix });

  const { theme, grounds } = readGrounds(globalsSrc, M);
  const rootVars = new Map([...theme, ...(blockVars(globalsSrc, /:root\s*/) ?? new Map())]);
  const typeScale = M.readTypeScale(globalsSrc);
  for (const [k, v] of typeScale) if (!rootVars.has(k)) rootVars.set(k, v);

  const shape = readNavShape(nav, M);
  const unknownMedia = new Set();

  /* ── W · the wiring ─────────────────────────────────────────────────── */
  if (shape.shape === 'unattributed') {
    fail(NAV_TSX,
      'the nav is out of flow or translucent and has only one recognisable face',
      'position/opacity says the bar composites over page content, and no rule carries any of '
      + `the tokens that name a second face: ${PAPER_SELECTOR_TOKENS.join(' | ')}`,
      'THIS IS THE FAILURE components/site/nav.tsx\'s old comment predicted — "a scroll '
      + 'listener that re-resolves its tokens ... is a colour decision made at runtime". The '
      + 'legitimate form is TWO DECLARED GROUNDS swapped by an attribute; declare the second '
      + 'face with one of those tokens and this gate measures both. Until then the composited '
      + 'ground under every nav glyph is unmeasured');
  }
  const forecast = shape.shape !== 'two-face';

  const restGroundName = shape.restGroundName;
  if (!forecast && !restGroundName) {
    fail(NAV_TSX, 'the nav element declares no `data-ground`',
      'the at-rest face resolves its roles from a ground this gate cannot name',
      'declare data-ground on the <header>. Reading it off the element is what keeps the '
      + 'ground a DECLARED fact rather than something this gate guesses from the band below');
  }
  const restGround = grounds.get(restGroundName ?? 'ink') ?? [...grounds.values()][0];
  /* The paper face sets the twelve roles to `inherit`, and `:root` in
     app/globals.css IS the paper context — the selector is literally
     `:root, [data-ground="paper"]`. So the second face's ground is the
     document's, resolved here rather than assumed. */
  const paperGround = grounds.get('paper') ?? restGround;

  /* ── treatments, through the hero gate's own resolver ────────────────── */
  const treatmentRules = M.collectTreatmentRules(
    nav.css.map(({ file, src }) => ({ file, src, requireHeroScope: false })),
  );
  const disclosed = new RegExp(M.CONTRAST_DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .test(globalsSrc);
  if (treatmentRules.length && !disclosed) {
    fail(M.GLOBALS,
      'a per-glyph treatment on the nav is credited on a page that has not disclosed the method',
      `${treatmentRules.length} treated rule(s) in the nav, and app/globals.css does not carry `
      + `"${M.CONTRAST_DISCLOSURE}"`,
      'a ratio derived with a halo in it is not the plain WCAG 1.4.3 quantity. Disclose the '
      + 'method or drop the treatment — the rule check-hero-contrast.mjs already applies');
  }

  /* ── the layout model, read from what shipped ────────────────────────── */
  const tsx = nav.tsx ?? '';
  const labels = [...tsx.matchAll(/label:\s*'([^']*)'/g)].map((m) => m[1]);
  const brand0 = readBrandCluster(tsx);
  if (labels.length === 0) {
    fail(NAV_TSX, 'no section labels could be read out of the nav',
      'NAV_BOXES positions one box per label; with none, the link cluster is unmeasured',
      'this gate reads `label: \'...\'` out of the SECTIONS array. If that array moved, teach '
      + 'the reader its new form in the same commit — do not let the boxes go quiet');
  }

  const model = {
    rules: shape.rules,
    labels,
    ...brand0,
    face: 'rest',
    unknownMedia,
  };

  /* ── R · at rest, over the photograph ────────────────────────────────── */
  const rows = [];
  const rasterRows = [];

  for (const vp of M.VIEWPORTS) {
    const f = hero.fields.get(vp.name);
    const geo = hero.geometry.find((g) => g.vp.name === vp.name) ?? null;

    let g;
    try {
      g = deriveNavBoxes(vp, rootVars, model, M);
    } catch (err) {
      fail(NAV_CSS, 'the nav\'s geometry could not be derived',
        `at ${vp.name}: ${err && err.message ? err.message : String(err)}`,
        'the bar\'s padding, its flex gaps and --text-micro are what position every box this '
        + 'gate samples');
      continue;
    }

    /*
      Treatments resolved at THIS viewport — a clamp()ed size throws a
      different halo on a phone than on a desktop, which is why the hero gate
      resolves them per viewport too.

      AND ATTRIBUTED TO A FACE, by the same recogniser the paint rules go
      through. components/site/nav.module.css declares `--halo-role: --fg`
      twice — once for the bar over the photograph and once for the paper bar —
      and crediting the paper one at rest would hand every glyph over the
      picture a collar the browser paints somewhere else entirely. That is the
      precise shape of over-crediting this file exists to prevent, so it is
      filtered rather than trusted.
    */
    const restT = new Map();
    for (const rule of treatmentRules) {
      if (treatmentFace(rule) !== 'rest') continue;
      if (rule.media && !M.mediaMatches(rule.media, vp, unknownMedia)) continue;
      const res = M.resolveTreatment(rule, {
        vars: new Map([...rootVars, ...rule.decls]),
        ground: restGround.ground,
        vw: vp.w, vh: vp.h, boxW: vp.w, boxH: vp.h, axis: vp.w,
      }, typeScale);
      for (const p of res.problems) {
        fail(rule.file, 'a per-glyph treatment on the nav could not be resolved',
          `at ${vp.name}: ${p}`,
          'the treatment contract is check-hero-contrast.mjs\'s, verbatim — see its '
          + '"READING THE TREATMENT OUT OF THE STYLESHEETS" section');
      }
      if (!res.treatment) continue;
      const reach = M.treatmentReachPx(res.treatment);
      if (reach > M.HALO_REACH_EM_MAX * res.treatment.fontPx) {
        fail(rule.file, 'a nav treatment reaches further than an em beyond its ink',
          `at ${vp.name}: ${reach.toFixed(1)}px on ${res.treatment.fontPx.toFixed(1)}px type`,
          'that is a SHEET drawn a slower way — at that radius the halos of adjacent glyphs '
          + 'merge into a continuous field across the bar, which is the solid bar this round '
          + 'exists to remove');
      }
      if (res.treatment.stroke && res.treatment.stroke.widthPx >= res.treatment.counterPx) {
        fail(rule.file, 'a nav text-stroke is at least as wide as the cut\'s own counter',
          `at ${vp.name}: ${res.treatment.stroke.widthPx.toFixed(2)}px rim against a `
          + `${res.treatment.counterPx.toFixed(2)}px counter`,
          'the rims meet in the middle of the bowl and the letterform closes. The ratio stays '
          + 'wonderful and the word stops being a word');
      }
      restT.set(res.treatment.role, res.treatment);
    }

    /*
      THE NAV'S OWN PAINT AT REST, rasterised.

      Two surfaces, composited bottom-up exactly as the browser paints them:
      the `.veil` element (which is BELOW `.inner`, z-index 0 against 1), then
      any background on `.nav` itself. The veil is evaluated in ITS OWN box —
      `calc(100% + 64px)` — because that is what its `calc(100% - 64px)` stops
      resolve against, and reading them against the bar instead would place
      the plateau's end 64px too high and credit the glyphs with an alpha the
      browser paints below them.
    */
    const paints = [];
    const pushPaint = (decls, boxTop, boxH, label, groundRgb) => {
      if ((decls.get('display') ?? '').trim() === 'none') return;
      const op = parseFloat(decls.get('opacity') ?? '1');
      if (!(op > 0)) return;
      /* `background-color` sits UNDER `background-image`; both may be present
         and the shorthand sets both. Collected as separate layers, painted in
         that order, which is what the browser does. */
      const stack = [];
      const colour = decls.get('background-color') ?? null;
      const image = decls.get('background-image') ?? decls.get('background') ?? null;
      if (colour !== null) stack.push(colour);
      if (image !== null) stack.push(image);
      for (const bg of stack) {
        const t = bg.trim().toLowerCase();
        if (t === 'none' || t === 'transparent') continue;
        const ctx = {
          vars: new Map([...rootVars, ...decls]),
          ground: groundRgb,
          vw: vp.w, vh: vp.h, boxW: vp.w, boxH, axis: boxH, spacingBand: 0,
        };
        try {
          const layers = M.splitTop(bg).map((layer) => M.parseGradient(layer, ctx));
          const field = M.buildField([{ label, layers, mask: null }], op);
          paints.push({
            label,
            /* In the ELEMENT's own coordinates, offset by where the element
               sits in the bar, and empty outside it. */
            at: (x, y) => (y < boxTop || y > boxTop + boxH
              ? { rgb: [0, 0, 0], a: 0 }
              : field(x, y - boxTop)),
          });
        } catch (err) {
          fail(NAV_CSS, `${label} is a construct this gate cannot rasterise`,
            `at ${vp.name}: \`${bg}\` — ${err && err.message ? err.message : String(err)}`,
            'THIS IS A HARD FAILURE ON PURPOSE. A fill the gate cannot evaluate is a fill whose '
            + 'composited ground is unmeasured, and falling back to "assume none" under-credits '
            + 'it while "assume opaque" turns the bar back into the box this round removed. '
            + 'Write it as a layer stack check-hero-contrast.mjs already evaluates');
        }
      }
    };
    /* Bottom-up, in paint order: the bar's own background is behind its
       children, and `.veil` is a child. Reversing these would put the tail's
       ramp OVER the plateau instead of under it. */
    pushPaint(g.navDecls, 0, g.navH, 'the nav\'s own background', restGround.ground);
    pushPaint(g.veilDecls, g.veilTop, g.veilH, 'the veil', restGround.ground);

    const navPaintAt = (x, y) => {
      let rgb = [0, 0, 0];
      let a = 0;
      for (const p of paints) {
        const s = p.at(x, y);
        const outA = s.a + a * (1 - s.a);
        if (outA === 0) { rgb = [0, 0, 0]; a = 0; continue; }
        rgb = [0, 1, 2].map((c) => (s.rgb[c] * s.a + rgb[c] * a * (1 - s.a)) / outA);
        a = outA;
      }
      return a === 0 ? null : { rgb, a };
    };

    const isWideVp = vp.w >= 861;
    const rungs = assets.filter((a) => {
      const wide = a.wide ?? /-l-/.test(basename(a.path));
      return wide === isWideVp && a.pixels;
    });
    const havePhoto = rungs.length > 0;

    for (const box of g.boxes) {
      const nx = Math.max(8, Math.round((M.GRID * (box.x1 - box.x0)) / vp.w));
      const ny = Math.max(4, Math.round((M.GRID * (box.y1 - box.y0)) / vp.w));

      const cells = [];
      for (let iy = 0; iy < ny; iy += 1) {
        const yA = box.y0 + ((box.y1 - box.y0) * iy) / ny;
        const yB = box.y0 + ((box.y1 - box.y0) * (iy + 1)) / ny;
        for (let ix = 0; ix < nx; ix += 1) {
          const xA = box.x0 + ((box.x1 - box.x0) * ix) / nx;
          const xB = box.x0 + ((box.x1 - box.x0) * (ix + 1)) / nx;
          const alphas = f
            ? alphaExtremes(f.field, xA, yA, xB, yB)
            : { aLo: { rgb: hero.ground ?? [20, 22, 26], a: 1 }, aHi: { rgb: hero.ground ?? [20, 22, 26], a: 1 } };
          cells.push({ xA, yA, xB, yB, ...alphas });
        }
      }

      /*
        THE BOX'S OWN BACKDROP WINDOW, computed once before any foreground.

        This is the number a designer can act on and a ratio is not. "1.02:1"
        says the bar is illegible; "the ground under this box runs sRGB 41..190"
        says how illegible, where, and how far a veil or a placement change has
        to move it. It is the same quantity check-hero-contrast.mjs prints as
        its per-region byte window — one page, one vocabulary.
      */
      const win = { lo: 1, hi: 0 };

      /*
        Roles this box's own class paints.

        Read from the stylesheet rather than declared: `.home` resolves --fg,
        `.sep` and `.link` resolve --fg-muted, `.link:hover` resolves
        --fg-accent. Holding EVERY role over EVERY box would be a superset —
        safe, and needlessly strict in exactly the direction that would force
        the picture darker to protect a colour that never lands there.

        The mark slot's colour is not in this stylesheet at all: <Mark>'s text
        form carries its own utility class, so the role is read out of
        components/ui/Mark.tsx. Hard-coding it here would be a second source of
        truth for a fact that file already states.
      */
      const roleNames = box.kind === 'mark'
        ? new Set(input.markRoles)
        : rolesOfClass(shape.rules, box.cls, 'rest', vp, M, unknownMedia, M.ROLE_THRESHOLDS);
      if (box.cls === 'link') {
        for (const r of rolesOfClass(shape.rules, 'link', 'rest', vp, M, unknownMedia, M.ROLE_THRESHOLDS)) {
          roleNames.add(r);
        }
      }
      if (roleNames.size === 0) {
        /* A box nothing colours is a box whose foreground this gate would be
           inventing. Named, not skipped. */
        notes.push(`⚠ no role token found for .${box.cls} at ${vp.name}; `
          + `the ${box.name} box carries no measured foreground`);
      }

      for (const rung of (havePhoto ? rungs : [null])) {
        let lumAt = null;
        if (rung) {
          const { lum, width, height } = rung.pixels;
          const frameH = geo && geo.frameH !== null ? geo.frameH : vp.bandH;
          const scale = Math.max(vp.w / width, frameH / height);
          const originY = (frameH - height * scale) * (isWideVp ? hero.focal.wide : hero.focal.narrow);
          const originX = (vp.w - width * scale) * 0.5;
          lumAt = (xA, yA, xB, yB) => {
            const r0 = Math.min(height - 1, Math.max(0, Math.floor((yA - originY) / scale)));
            const r1 = Math.min(height - 1, Math.max(0, Math.ceil((yB - originY) / scale)));
            const c0 = Math.min(width - 1, Math.max(0, Math.floor((xA - originX) / scale)));
            const c1 = Math.min(width - 1, Math.max(0, Math.ceil((xB - originX) / scale)));
            let lo = 1;
            let hi = 0;
            for (let r = r0; r <= r1; r += 1) {
              const off = r * width;
              for (let c = c0; c <= c1; c += 1) {
                const l = lum[off + c];
                if (l < lo) lo = l;
                if (l > hi) hi = l;
              }
            }
            return { lo, hi };
          };
        }

        /* the window, foreground-independent */
        for (const c of cells) {
          const src = lumAt ? lumAt(c.xA, c.yA, c.xB, c.yB) : { lo: 0, hi: 0 };
          const fill = navPaintAt((c.xA + c.xB) / 2, (c.yA + c.yB) / 2);
          for (const l of [src.lo, src.hi]) {
            for (const a of [c.aLo, c.aHi]) {
              const base = rung ? M.greyOf(l) : (hero.ground ?? [20, 22, 26]);
              const scrimmed = rung ? M.composite(a.rgb, a.a, base) : base;
              const out = M.luminance(fill ? M.composite(fill.rgb, fill.a, scrimmed) : scrimmed);
              if (out < win.lo) win.lo = out;
              if (out > win.hi) win.hi = out;
            }
          }
        }

        const fgs = [...roleNames].map((role) => {
          const def = restGround.roles.get(role);
          return {
            label: role,
            rgb: def?.rgb ?? [255, 255, 255],
            need: def?.need ?? 4.5,
            rule: (def?.need ?? 4.5) === 3 ? 'WCAG 1.4.11 non-text' : 'WCAG 1.4.3 text',
            t: restT.get(role) ?? null,
          };
        });

        /*
          AND THE LATENT RASTER. components/ui/Mark.tsx renders TYPE while
          `art:su-mark` is unverified; the day it flips, a BLACK raster starts
          rendering in this exact box. nav.tsx warns about that in a comment.
          A comment is not a gate, so the raster's real silhouette is measured
          here on every run — reported while latent, FAILING once live.
        */
        if (box.kind === 'mark') {
          for (const mk of marks) {
            for (const d of mk.defining) {
              fgs.push({
                label: `raster #${d.rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
                rgb: d.rgb,
                need: 3,
                rule: 'WCAG 1.4.11 non-text (a logo is not text)',
                t: null,
                raster: true,
                share: d.share,
                mark: basename(mk.file),
              });
            }
          }
        }

        for (const fg of fgs) {
          let worst = { ratio: Infinity };
          let needAlpha = 0;
          for (const c of cells) {
            const src = lumAt ? lumAt(c.xA, c.yA, c.xB, c.yB) : { lo: 0, hi: 0 };
            const fill = navPaintAt((c.xA + c.xB) / 2, (c.yA + c.yB) / 2);
            const r = worstOverCell(M, fg.rgb, {
              lo: src.lo,
              hi: src.hi,
              aLo: c.aLo,
              aHi: c.aHi,
              hasPhoto: rung !== null,
              bare: hero.ground ?? [20, 22, 26],
            }, fill, fg.t, fg.need * headroom, restGround.ground);
            if (r.needAlpha > needAlpha) needAlpha = r.needAlpha;
            if (r.ratio < worst.ratio) worst = { ...r, x: (c.xA + c.xB) / 2, y: (c.yA + c.yB) / 2 };
          }
          const row = {
            state: 'rest',
            forecast,
            vp: vp.name,
            rung: rung ? basename(rung.path) : '(no photograph)',
            box: box.name,
            cls: box.cls,
            kind: box.kind,
            role: fg.label,
            rule: fg.rule,
            raster: fg.raster === true,
            share: fg.share ?? null,
            treated: fg.t !== null,
            need: fg.need * headroom,
            plain: fg.need,
            ratio: worst.ratio,
            at: worst.at,
            needAlpha,
            x: worst.x,
            y: worst.y,
            navH: g.navH,
            win,
          };
          (fg.raster ? rasterRows : rows).push(row);
        }
      }

      if (box.kind === 'mark') markGround.push({ vp: vp.name, win, box });
    }

    geometryOut.push({
      vp: vp.name,
      navH: g.navH,
      veilH: g.veilH,
      innerWraps: g.innerWraps,
      linkRows: g.linkRows,
      fontPx: g.fontPx,
      padY: g.padY,
      contentW: g.contentW,
      brandW: g.brandW,
      linksW: g.linksW,
      sepShown: g.sepShown,
      markShown: g.markShown,
      boxes: g.boxes,
      paints: paints.map((p) => p.label),
    });
  }

  /* Gate the at-rest text rows. */
  if (!forecast) {
    const worstRest = new Map();
    for (const x of rows) {
      const k = `${x.vp}|${x.box}|${x.role}`;
      if (!worstRest.has(k) || x.ratio < worstRest.get(k).ratio) worstRest.set(k, x);
    }
    for (const x of worstRest.values()) {
      if (x.ratio >= x.need) continue;
      fail(NAV_CSS,
        `the at-rest bar fails ${x.role} in the ${x.box} box at ${x.vp}`,
        `the composited ground under that box runs sRGB ${Math.round(M.greyOf(x.win.lo)[0])}..`
        + `${Math.round(M.greyOf(x.win.hi)[0])}; the worst backdrop a glyph there can land on is `
        + `sRGB ${x.at ? x.at.backdrop.join(',') : '?'} (rung ${x.rung}, hero scrim alpha `
        + `${x.at ? x.at.alpha.toFixed(4) : '?'}), and ${x.role} over it is ${x.ratio.toFixed(3)}:1 `
        + `against ${x.need.toFixed(3)}:1 (${x.plain}:1 x${headroom})`,
        `the rest face currently paints ${((x.at?.navAlpha ?? 0) * 100).toFixed(1)}% there; this `
        + `role needs ${(x.needAlpha * 100).toFixed(1)}% of --ground over that backdrop, DERIVED `
        + 'by the same bisection that sizes the hero\'s scrim. Deepen the plateau to that, move '
        + 'the box off the bright region, or give the role a per-glyph treatment (the contract '
        + 'is check-hero-contrast.mjs\'s). Not: lower the target, shrink NAV_BOXES, or quote the '
        + 'declared colour instead of the composited one');
    }
  }

  /* The plateau the rest face would need for EVERY role it paints — one
     number, so the fix is a value rather than a direction. */
  const restNeedAlpha = rows.length ? Math.max(...rows.map((x) => x.needAlpha ?? 0)) : null;
  const restNeedBy = rows.length
    ? rows.reduce((a, b) => ((b.needAlpha ?? 0) > (a.needAlpha ?? 0) ? b : a))
    : null;

  /* The latent raster: reported always, gated only once the corpus says the
     raster renders. */
  const worstRaster = [...rasterRows].sort((a, b) => a.ratio - b.ratio)[0] ?? null;
  if (markState.live && worstRaster && worstRaster.ratio < worstRaster.need) {
    fail(MARK_TSX,
      'the Seattle University raster is now permitted and does not clear 1.4.11 over the photograph',
      `data/corpus/artifacts.json says art:su-mark is "${markState.status}", so components/ui/`
      + `Mark.tsx renders the raster. Its silhouette is ${worstRaster.role} and over the `
      + `composited crest at ${worstRaster.vp} it measures ${worstRaster.ratio.toFixed(3)}:1 `
      + `against ${worstRaster.need.toFixed(3)}:1`,
      'components/site/nav.tsx already names this: "Whoever flips that flag must either have '
      + 'obtained the reverse variant Mark.tsx says to ask for, or pass a tone here. It is not '
      + 'a change this bar absorbs silently." This is that gate. Obtain the reverse lockup, or '
      + 'pass a tone, or leave the affiliation as type');
  }

  /* ── S · stuck, over the page ────────────────────────────────────────── */
  const stuckRows = [];
  let derivedMinFill = null;
  let shippedFill = null;
  let paperRoles = new Set();
  if (!forecast) {
    /* The face's own fill: the background painted by any paper-face rule on
       the nav root. */
    const paperNav = shape.rules.filter((r) => r.face === 'paper' && /\.nav(?![\w-])/.test(r.selector));
    const fillExpr = paperNav.map((r) => r.decls.get('background')
      ?? r.decls.get('background-color') ?? r.decls.get('background-image'))
      .filter((v) => v !== undefined && v !== null).pop() ?? null;

    /* Which roles does the paper face actually paint? The type classes are
       shared between the faces — `.home`, `.link`, `.sep` are declared once —
       so their roles carry over, and the mark's --fg-muted with them. */
    for (const cls of ['home', 'link', 'sep']) {
      for (const r of rolesOfClass(shape.rules, cls, 'rest', M.VIEWPORTS[M.VIEWPORTS.length - 1], M, unknownMedia, M.ROLE_THRESHOLDS)) {
        paperRoles.add(r);
      }
    }
    paperRoles.add('--fg-muted');
    /* And anything the paper-face rules themselves paint — the hairline. */
    for (const r of shape.rules) {
      if (r.face !== 'paper') continue;
      for (const v of r.decls.values()) {
        for (const m of String(v).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
          if (m[1] in M.ROLE_THRESHOLDS) paperRoles.add(m[1]);
        }
      }
    }

    if (fillExpr === null) {
      fail(NAV_CSS, 'the paper face paints no background',
        'a face that declares a ground and paints nothing is a transparent bar with an '
        + 'attribute on it — its roles resolve against a ground that is not there',
        'paint the face, or drop it and let the bar stay on the ink face');
    } else {
      const ctx = { vars: new Map([...rootVars, ...paperGround.decls]), ground: paperGround.ground };
      try {
        shippedFill = M.stopColour(fillExpr.trim(), ctx);
      } catch (err) {
        fail(NAV_CSS, 'the paper face\'s fill is a colour this gate cannot evaluate',
          `\`${fillExpr}\` — ${err && err.message ? err.message : String(err)}`,
          'write it as color-mix(in srgb, var(--ground) N%, transparent), which is the form '
          + 'both this gate and the reference repo use');
      }
    }

    const surfaces = [];
    for (const [name, def] of grounds) {
      for (const [key, rgb] of def.surfaces) surfaces.push({ name: `${name} ${key}`, rgb });
    }
    const roleDefs = new Map();
    for (const role of paperRoles) {
      const def = paperGround.roles.get(role);
      if (def) roleDefs.set(role, def);
    }

    /*
      Treatments the PAPER face paints, resolved at the widest viewport, where
      a clamp()ed size is largest and the halo strongest. A treatment credited
      here is therefore credited at its most flattering, which makes the
      derived minimum fill the LOOSEST this gate will ever quote — and the
      report says so rather than leaving the basis implicit.
    */
    const wideVp = M.VIEWPORTS[M.VIEWPORTS.length - 1];
    const stuckT = new Map();
    for (const rule of treatmentRules) {
      if (treatmentFace(rule) !== 'paper') continue;
      const res = M.resolveTreatment(rule, {
        vars: new Map([...rootVars, ...paperGround.decls, ...rule.decls]),
        ground: paperGround.ground,
        vw: wideVp.w, vh: wideVp.h, boxW: wideVp.w, boxH: wideVp.h, axis: wideVp.w,
      }, typeScale);
      if (res.treatment) stuckT.set(res.treatment.role, res.treatment);
    }

    if (shippedFill && roleDefs.size) {
      derivedMinFill = minStuckFill(M, shippedFill.rgb, roleDefs, surfaces, headroom, stuckT);
      for (const bgs of surfaces) {
        const composited = M.composite(shippedFill.rgb, shippedFill.a, bgs.rgb);
        for (const [role, def] of roleDefs) {
          const ground = M.localGroundLuminance(stuckT.get(role) ?? null, composited);
          const ratio = M.contrastToLuminance(def.rgb, ground);
          stuckRows.push({
            state: 'stuck',
            over: bgs.name,
            role,
            rule: def.need === 3 ? 'WCAG 1.4.11 non-text' : 'WCAG 1.4.3 text',
            ratio,
            need: def.need * headroom,
            plain: def.need,
            backdrop: composited.map((v) => Math.round(v)),
          });
          if (ratio < def.need * headroom) {
            fail(NAV_CSS,
              `the stuck bar fails ${role} over the ${bgs.name} band`,
              `fill is ${(shippedFill.a * 100).toFixed(1)}% of sRGB `
              + `${shippedFill.rgb.map((v) => Math.round(v)).join(',')}, the composited ground over `
              + `${bgs.name} is sRGB ${composited.map((v) => Math.round(v)).join(',')}, and ${role} `
              + `over it is ${ratio.toFixed(3)}:1 against ${(def.need * headroom).toFixed(3)}:1 `
              + `(${def.need}:1 x${headroom})`,
              `raise the fill to at least ${derivedMinFill === null ? 'opaque'
                : `${(derivedMinFill * 100).toFixed(1)}%`} — DERIVED here by bisection against `
              + 'this palette, not copied from MAVTERRAS, whose 0.97 is a fact about a lighter '
              + 'muted role. Not: lower the target, or quote the declared colour instead of the '
              + 'composited one');
          }
        }
      }
    }
  }

  if (unknownMedia.size) {
    fail(NAV_CSS, 'a @media condition on the nav uses a feature this gate cannot evaluate',
      `saw: ${[...unknownMedia].join('; ')}`,
      'a rule this gate cannot place is a face it may be crediting at a viewport that never '
      + 'paints it. Teach the matcher the feature, or scope the rule with one it knows');
  }

  return {
    failures,
    notes,
    shape,
    grounds,
    rows,
    rasterRows,
    stuckRows,
    derivedMinFill,
    restNeedAlpha,
    restNeedBy,
    shippedFill,
    paperRoles,
    restGroundName: restGroundName ?? '(forecast: ink)',
    paperGroundName: paperGround.name,
    treatmentRules,
    disclosed,
    geometry: geometryOut,
    markGround,
    markState,
    marks,
    forecast,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   REPORTING
   ════════════════════════════════════════════════════════════════════════════ */

function printReport(M, r, { headroom }) {
  const byte = (y) => Math.round(M.greyOf(y)[0]);

  console.log('\n  ── check-nav-contrast ───────────────────────────────────────────────');
  console.log(`  shape: ${r.shape.shape}   fixed/sticky: ${r.shape.fixed}   translucent: ${r.shape.translucent}`);
  console.log(`  faces: rest on [data-ground="${r.restGroundName}"] -> paper on the document's own ground`);
  console.log(`  headroom x${headroom} on every threshold`);
  console.log(`  art:su-mark provenance: ${r.markState.status}`
    + ` — <Mark> renders ${r.markState.live ? 'the RASTER' : 'TYPE'}`);

  if (r.forecast) {
    console.log('\n  ╔══════════════════════════════════════════════════════════════════╗');
    console.log('  ║ FORECAST ONLY — THERE IS NO SECOND FACE, SO NOTHING BELOW IS A   ║');
    console.log('  ║ GUARANTEE. These are the ratios a fixed bar WOULD measure over    ║');
    console.log('  ║ the crest at the derived height. Read them as a design brief.     ║');
    console.log('  ╚══════════════════════════════════════════════════════════════════╝');
  }

  console.log('\n  GEOMETRY — the strip of photograph the bar covers, per viewport.');
  console.log('    ⚠ NAV_BOXES IS THIS FILE\'S ONE ASSUMPTION. Every length is READ from');
  console.log('      nav.module.css (padding, gaps, font-size, tracking, what is hidden);');
  console.log('      the two that CSS does not state are the line box, taken from the type');
  console.log('      scale\'s own line-height companion, and the label advances, which');
  console.log('      follow from IBM Plex Mono being monospaced at 600/1000 em. NOT yet');
  console.log('      proved against real client rects — see CONTRACTS I NEED.');
  for (const g of r.geometry) {
    console.log(`     ${g.vp.padEnd(9)} bar ${String(Math.round(g.navH)).padStart(3)}px  veil box `
      + `${String(Math.round(g.veilH)).padStart(3)}px  content ${String(Math.round(g.contentW)).padStart(4)}px`
      + `  brand ${String(Math.round(g.brandW)).padStart(3)} + links ${String(Math.round(g.linksW)).padStart(3)}`
      + `${g.innerWraps ? '  WRAPS' : '       '}`
      + `${g.markShown ? '' : '  mark hidden'}`);
  }
  if (r.geometry[0]) {
    console.log(`     paint stack at rest, bottom-up: ${r.geometry[0].paints.join(' -> ') || '(nothing)'}`);
  }

  const rest = r.rows;
  if (rest.length) {
    console.log('\n  AT REST — every nav glyph over the composited photograph.');
    console.log('    The ratio is against the LOCAL COMPOSITED GROUND: source pixel -> hero');
    console.log('    scrim -> the nav\'s own veil -> per-glyph treatment, integrated over the');
    console.log('    observer window. Both extremes of the source luminance are paired with');
    console.log('    both extremes of the scrim alpha and the worst of the four is printed.');
    console.log('    The veil is rasterised over ITS OWN box, ramp included — which is the');
    console.log('    64px nav.module.css names as the thing nothing measures.');

    const worst = new Map();
    for (const x of rest) {
      const k = `${x.vp}|${x.box}|${x.role}`;
      if (!worst.has(k) || x.ratio < worst.get(k).ratio) worst.set(k, x);
    }
    const list = [...worst.values()].sort((a, b) => a.ratio - b.ratio);

    console.log('\n     THE GROUND UNDER EACH BOX — the composited sRGB window a glyph there');
    console.log('     can land on, and the worst role over it.');
    console.log('     viewport  box                ground     role          ratio    need');
    const perBox = new Map();
    for (const x of list) if (!perBox.has(`${x.vp}|${x.box}`)) perBox.set(`${x.vp}|${x.box}`, x);
    for (const x of perBox.values()) {
      const flag = x.ratio >= x.need ? ' ' : '!';
      console.log(`   ${flag} ${x.vp.padEnd(9)} ${x.box.padEnd(18)} `
        + `${String(byte(x.win.lo)).padStart(3)}..${String(byte(x.win.hi)).padStart(3)}   `
        + `${x.role.padEnd(13)} ${x.ratio.toFixed(3).padStart(7)}:1 ${x.need.toFixed(2).padStart(5)}`);
    }

    console.log('\n     WORST PER ROLE, across every box, viewport and shipped rung.');
    console.log('     role            ratio    need   at                            rule');
    const perRole = new Map();
    for (const x of list) if (!perRole.has(x.role)) perRole.set(x.role, x);
    for (const x of [...perRole.values()].sort((a, b) => a.ratio - b.ratio)) {
      const flag = x.ratio >= x.need ? ' ' : '!';
      console.log(`   ${flag} ${x.role.padEnd(15)} ${x.ratio.toFixed(3).padStart(7)}:1 ${x.need.toFixed(2).padStart(5)}  `
        + `${`${x.vp} ${x.box}`.padEnd(29)} ${x.rule}`);
    }

    const bind = list[0];
    if (bind) {
      console.log(`\n     BINDING: ${bind.role} in the ${bind.box} box at ${bind.vp} — `
        + `${bind.ratio.toFixed(3)}:1 against ${bind.need.toFixed(3)}:1`);
      console.log(`              rule applied: ${bind.rule}`);
      console.log(`              worst backdrop there: sRGB ${bind.at ? bind.at.backdrop.join(',') : '—'}`
        + `  (rung ${bind.rung}, hero scrim alpha ${bind.at ? bind.at.alpha.toFixed(4) : '—'})`);
      console.log(`              treatment credited: ${bind.treated ? 'yes' : 'no — this is the role\'s own colour'}`);
    }

    if (r.restNeedAlpha !== null && r.restNeedBy) {
      console.log('\n     DERIVED MINIMUM REST FILL');
      console.log(`       ${(r.restNeedAlpha * 100).toFixed(1)}% of --ground, set by ${r.restNeedBy.role} in the `
        + `${r.restNeedBy.box} box at ${r.restNeedBy.vp}.`);
      console.log(`       The face paints ${((r.restNeedBy.at?.navAlpha ?? 0) * 100).toFixed(1)}% there today.`);
      console.log('       Bisected with check-hero-contrast.mjs\'s own minAlpha, over the nav\'s own');
      console.log('       ground colour, against the worst composited backdrop any glyph in any box');
      console.log('       at any viewport on any shipped rung can land on. No treatment credited —');
      console.log('       a halo sized against a veil that was sized against the halo is circular.');
      console.log('');
      console.log('       ⚠ WHICH ROLE BINDS IS ITSELF A FINDING. nav.module.css derives its');
      console.log('       plateau from --fg-muted and says so: "The links resolve --fg-muted, which');
      console.log('       is the binding role in both derivations — so if a future edit puts a');
      console.log('       lighter role in this bar, the number moves and this comment is where to');
      console.log('       start." `.link:hover` resolves --fg-accent, which is 5.68:1 on flat ink');
      console.log('       against --fg-muted\'s 7.15:1. The edit that moved the number has already');
      console.log('       happened, and it is a hover state, which is exactly the kind of thing a');
      console.log('       screenshot never catches.');
    }
  }

  /* ── the mark ── */
  if (r.marks.length) {
    console.log('\n  THE MARK — TYPE TODAY, A TRADEMARK TOMORROW.');
    console.log(`    data/corpus/artifacts.json: art:su-mark is "${r.markState.status}", so`);
    console.log(`    components/ui/Mark.tsx renders ${r.markState.live ? 'the RASTER' : 'the affiliation as TYPE'}`
      + `${r.markState.live ? ' — the rows below are GATED.' : ' and the rows below are LATENT.'}`);
    for (const mk of r.marks) {
      console.log(`\n     ${basename(mk.file)} — ${mk.total} silhouette px, i.e. the opaque pixels`);
      console.log('       that touch transparency and so are the only ones that meet the page.');
      console.log('       Interior colour is NOT held to 1.4.11 against the photograph: it is');
      console.log('       enclosed by the mark and never adjacent to the backdrop.');
      for (const d of mk.defining) {
        console.log(`         #${d.rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`
          + `  ${(d.share * 100).toFixed(2).padStart(6)}% of the outline`);
      }
    }
    console.log('\n     THE LOCKUP IS A DARK SILHOUETTE — every colour on its outline, the');
    console.log('     crimson fringe included. It is a third party\'s trademark and a fixed');
    console.log('     dark asset, so it may not be recoloured or inverted. Unplated it reads');
    const need = 3 * headroom;
    const minY = 0.05 * need - 0.05;
    console.log(`     only where the local ground exceeds relative luminance ${minY.toFixed(4)} —`);
    console.log(`     sRGB grey ${byte(minY)}. What the composited crest delivers in that box:`);
    for (const mg of r.markGround) {
      console.log(`       ${mg.vp.padEnd(9)} sRGB ${String(byte(mg.win.lo)).padStart(3)}..${String(byte(mg.win.hi)).padStart(3)}`
        + `   ${mg.win.lo >= minY ? 'clears unplated everywhere in the box'
          : `falls ${((minY - mg.win.lo) / minY * 100).toFixed(0)}% short at its darkest point`}`);
    }
    if (r.rasterRows.length) {
      const w = [...r.rasterRows].sort((a, b) => a.ratio - b.ratio)[0];
      console.log(`\n     WORST RASTER CASE: ${w.role} at ${w.vp} — ${w.ratio.toFixed(3)}:1 against `
        + `${w.need.toFixed(3)}:1`);
      console.log(`     ${r.markState.live ? 'GATED — this is a build failure above.'
        : 'LATENT — this becomes a build failure the moment art:su-mark is verified.'}`);
      console.log('     Three legitimate answers, and the numbers choose between them:');
      console.log('       (a) obtain the reverse lockup Mark.tsx says to ask for;');
      console.log('       (b) lift the local ground with a soft, EDGELESS gradient — a veil');
      console.log('           shaped like a spotlight, which this gate rasterises like any');
      console.log('           other background layer and which has no box to see;');
      console.log('       (c) a plate — and note the guidelines\' own isolation rule makes a');
      console.log(`           28px lockup need an 84px plate, taller than the ${Math.round(r.geometry[0]?.navH ?? 0)}px bar.`);
      const plate = r.plate ?? null;
      if (plate && r.markGround.length) {
        const py = M.luminance(plate);
        const seam = Math.max(...r.markGround.map((mg) => Math.max(
          Math.abs(toLstar(py) - toLstar(mg.win.lo)),
          Math.abs(toLstar(py) - toLstar(mg.win.hi)),
        )));
        console.log(`       THE PLATE'S OWN EDGE against the photograph: up to ${seam.toFixed(1)} L*.`);
        console.log(`       NO WCAG CRITERION APPLIES HERE — advisory threshold ${PLATE_SEAM_ADVISORY_LSTAR} L*,`);
        console.log('       reported and never gated. It is the white box, as a number.');
      }
    }
  }

  /* ── stuck ── */
  if (r.stuckRows.length) {
    console.log('\n  STUCK — the paper face\'s fill over every opaque surface this page paints.');
    console.log('    backdrop-filter blur is NOT modelled and does not need to be: a blurred');
    console.log('    ground is an average of these grounds and is bounded by them, so gating');
    console.log('    the endpoints bounds every seam the kernel can straddle.');
    console.log('     over                       role            ratio    need   composited ground');
    for (const x of [...r.stuckRows].sort((a, b) => a.ratio - b.ratio)) {
      const flag = x.ratio >= x.need ? ' ' : '!';
      console.log(`   ${flag} ${x.over.padEnd(26)} ${x.role.padEnd(15)} ${x.ratio.toFixed(3).padStart(7)}:1 `
        + `${x.need.toFixed(2).padStart(5)}  sRGB ${x.backdrop.join(',')}`);
    }
    if (r.shippedFill) {
      console.log(`\n     SHIPPED FILL     ${(r.shippedFill.a * 100).toFixed(1)}% of sRGB `
        + `${r.shippedFill.rgb.map((v) => Math.round(v)).join(',')}`);
    }
    if (r.derivedMinFill !== null) {
      console.log(`     DERIVED MINIMUM  ${(r.derivedMinFill * 100).toFixed(1)}% — bisected against THIS palette,`);
      console.log('     against every opaque surface above, on every role the bar paints.');
      console.log('     nav.module.css says of its own value: "97% IS COPIED HERE, AND COPYING');
      console.log('     IT IS NOT THE SAME AS MEASURING IT". This is the measurement. The two');
      console.log('     repos differ because --fg-muted #5E5C60 is darker than the reference\'s');
      console.log('     muted role, so this bar tolerates a darker effective ground.');
    }
  }

  if (r.notes.length) {
    console.log('');
    for (const n of [...new Set(r.notes)]) console.log(`  ${n}`);
  }
}

function printFailures(failures) {
  console.log('\n  ── FAILURES ─────────────────────────────────────────────────────────\n');
  for (const f of failures) {
    console.log(`  ${f.where}`);
    console.log(`    ${f.message}`);
    if (f.detail) console.log(`      ${f.detail}`);
    if (f.fix) console.log(`      FIX: ${f.fix}`);
    console.log('');
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   THE NEGATIVE CONTROLS

   A gate that has never failed is a gate nobody has tested, and the failures
   have to be the RIGHT ones. Four, and each reproduces a documented defect
   rather than an invented one:

     1 VEIL REMOVED     the at-rest bar with its own veil deleted. This is
                        "put the nav on the photograph" with nobody doing the
                        work, and it is exactly the state this round started
                        from.
     2 VEIL THINNED     the veil's plateau dropped to the 25% the hero's crest
                        already paints — the alpha components/ui/Mark.tsx
                        measured the lockup against at 1.04:1. Reproduces that
                        measurement from a different direction.
     3 FILL AT 82%      the exact number MAVTERRAS records as ITS OWN failure.
                        The report prints our composited ground beside their
                        #CFCDC8 so the two can be compared rather than assumed
                        equivalent.
     4 FILL SWEPT       the fill walked down until the first role breaks, so
                        the derived minimum is shown to BE a minimum. A
                        threshold nothing has ever crossed is a threshold
                        nobody has located.
   ════════════════════════════════════════════════════════════════════════════ */

/*
  The perturbations act on the SHIPPED text, and the shipped text moves: the
  veil began as a full-height ramp on `.veil` and is now a plateau on `.nav`
  with a tail below it. So none of these name a class or a stop position. They
  rewrite by KIND — every rest-face background, every ground percentage, the
  one fill inside the stuck rule — and `--prove` reports how many
  substitutions each made, so a control that silently matched nothing is
  visible as a control that proved nothing.
*/

/** Delete every background the REST face paints, wherever it now lives. */
function stripRestPaint(src) {
  let n = 0;
  const out = src.replace(
    /background(?:-image|-color)?\s*:\s*(?:(?!;|\}).)*;/gs,
    (m, offset) => {
      /* Leave the stuck rule alone; this control is about the at-rest bar. */
      const before = src.slice(0, offset);
      const lastState = before.lastIndexOf('--nav-state');
      const lastBrace = before.lastIndexOf('}');
      const inStuck = lastState > lastBrace
        && /--nav-state\s*:\s*(stuck|paper)/.test(before.slice(lastState));
      if (inStuck) return m;
      n += 1;
      return 'background: none;';
    },
  );
  return { src: out, n };
}

/** Scale every `var(--ground) N%` in the rest face to `alpha`. */
function withRestAlpha(src, alpha) {
  let n = 0;
  const out = src.replace(
    /color-mix\(\s*in\s+srgb\s*,\s*var\(--ground\)\s+([0-9.]+)%\s*,\s*transparent\s*\)/g,
    (m, pct, offset) => {
      const before = src.slice(0, offset);
      const lastState = before.lastIndexOf('--nav-state');
      const lastBrace = before.lastIndexOf('}');
      if (lastState > lastBrace && /--nav-state\s*:\s*(stuck|paper)/.test(before.slice(lastState))) {
        return m;
      }
      n += 1;
      return `color-mix(in srgb, var(--ground) ${(alpha * 100).toFixed(0)}%, transparent)`;
    },
  );
  return { src: out, n };
}

/**
 * Delete every per-glyph treatment. The counterpart of control 1: that one
 * removes the SHEET under the text, this one removes what the text paints for
 * ITSELF, so the two together say which of the pair each role is actually
 * standing on. `--fg` at rest passes only with its collar credited, and a
 * control that never separated them could not have shown that.
 */
function stripTreatments(src) {
  let n = 0;
  const out = src
    .replace(/text-shadow\s*:\s*(?:(?!;|\}).)*;/gs, () => { n += 1; return 'text-shadow: none;'; })
    .replace(/-webkit-text-stroke[a-z-]*\s*:\s*(?:(?!;|\}).)*;/gs, () => { n += 1; return ''; });
  return { src: out, n };
}

/** Set the stuck face's fill percentage. */
function withStuckFill(src, alpha) {
  let n = 0;
  const out = src.replace(
    /(--nav-state\s*:\s*(?:stuck|paper)[\s\S]{0,600}?background-color\s*:\s*color-mix\(\s*in\s+srgb\s*,\s*[^,]+?\s+)([0-9.]+%)/,
    (_, head) => { n += 1; return `${head}${(alpha * 100).toFixed(1)}%`; },
  );
  if (n === 0) {
    /* The declaration may be spelled `background:` rather than
       `background-color:`; try that before reporting nothing matched. */
    return {
      src: src.replace(
        /(--nav-state\s*:\s*(?:stuck|paper)[\s\S]{0,600}?background\s*:\s*color-mix\(\s*in\s+srgb\s*,\s*[^,]+?\s+)([0-9.]+%)/,
        (_, head) => { n += 1; return `${head}${(alpha * 100).toFixed(1)}%`; },
      ),
      n,
    };
  }
  return { src: out, n };
}

/* ════════════════════════════════════════════════════════════════════════════
   CLI
   ════════════════════════════════════════════════════════════════════════════ */

async function buildHeroInput(M) {
  const globalsSrc = readFileSync(M.GLOBALS, 'utf8');
  const scrimSrc = existsSync(M.SCRIM) ? readFileSync(M.SCRIM, 'utf8') : '';
  const heroSrc = existsSync(M.HERO_TSX) ? readFileSync(M.HERO_TSX, 'utf8') : null;
  const heroCss = [];
  {
    const seen = new Set();
    const add = (file) => {
      if (seen.has(file) || !existsSync(file)) return;
      seen.add(file);
      heroCss.push({ file, src: readFileSync(file, 'utf8') });
    };
    add(M.HERO_CSS);
    for (const m of (heroSrc ?? '').matchAll(/from\s+'(\.[^']*\.module\.css)'/g)) {
      add(join(COMPONENTS, basename(m[1])));
    }
  }
  let manifest = null;
  const manifestPath = join(M.PHOTO_DIR, 'manifest.json');
  if (existsSync(manifestPath)) {
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { manifest = null; }
  }
  const sourceFile = M.SOURCE_EXTS.map((e) => M.SOURCE_STEM + e).find((p) => existsSync(p)) ?? null;
  const assets = M.collectAssets(manifest);
  let sharp = null;
  try { ({ default: sharp } = await import('sharp')); } catch { sharp = null; }
  if (sharp) {
    for (const a of assets) {
      try { a.pixels = await M.decodeLuminance(sharp, a.path); } catch { a.pixels = null; }
    }
  }
  return { globalsSrc, scrimSrc, heroSrc, heroCss, assets, manifest, sourceFile, sharp };
}

async function main() {
  const argv = process.argv.slice(2);
  const M = await loadHeroModel();

  /* The shared model must be neutral with no treatment before anything here
     quotes a number out of it. Microseconds, and it catches the one bug that
     would move every ratio in both gates at once. */
  M.assertNeutrality();
  const headroom = M.HEADROOM;

  if (!existsSync(M.GLOBALS)) {
    console.error(`check-nav-contrast: ${M.GLOBALS} not found — run from the repo root.`);
    process.exit(2);
  }

  const nav = readNavSources();
  const globalsSrc = readFileSync(M.GLOBALS, 'utf8');

  if (argv.includes('--emit-extent')) {
    const theme = blockVars(globalsSrc, /@theme\b[^{]*/) ?? new Map();
    const root = new Map([...theme, ...(blockVars(globalsSrc, /:root\s*/) ?? new Map()),
      ...M.readTypeScale(globalsSrc)]);
    const shape = readNavShape(nav, M);
    const tsx = nav.tsx ?? '';
    const model = {
      rules: shape.rules,
      labels: [...tsx.matchAll(/label:\s*'([^']*)'/g)].map((m) => m[1]),
      ...readBrandCluster(tsx),
      face: 'rest',
      unknownMedia: new Set(),
    };
    process.stdout.write(`${JSON.stringify({
      margin: BOX_MARGIN,
      monoAdvanceEm: MONO_ADVANCE_EM,
      fallbackLineHeight: FALLBACK_LINE_HEIGHT,
      model: { ...model, rules: undefined, unknownMedia: undefined },
      viewports: M.VIEWPORTS.map((vp) => {
        const g = deriveNavBoxes(vp, root, model, M);
        return {
          name: vp.name, w: vp.w, h: vp.h, navH: g.navH, veilH: g.veilH, boxes: g.boxes,
        };
      }),
    }, null, 2)}\n`);
    return;
  }

  const heroInput = await buildHeroInput(M);
  const hero = M.analyse(heroInput);

  const marks = [];
  if (heroInput.sharp) {
    for (const f of ['seattle_university_logo.png']) {
      const p = join(BRAND, f);
      if (existsSync(p)) marks.push(await markSilhouette(heroInput.sharp, p));
    }
  } else if (existsSync(join(BRAND, 'seattle_university_logo.png'))) {
    console.error('check-nav-contrast: the Seattle University lockup is on disk but `sharp` could '
      + 'not be imported, so its silhouette is unmeasured. `npm i -D sharp`. Passing this gate '
      + 'without decoding the asset would make it a promise rather than a check.');
    process.exit(2);
  }

  const markState = markIsLive();

  /*
    The role <Mark>'s TEXT form paints, read out of components/ui/Mark.tsx.
    That component is not this territory's, and it is not the nav's stylesheet
    either — so the colour of the one box in this bar that neither file styles
    is read from the file that does style it, and a change there surfaces here
    on the next run instead of being carried in a constant nobody re-checks.
  */
  const markRoles = [];
  if (existsSync(MARK_TSX)) {
    const src = readFileSync(MARK_TSX, 'utf8');
    /* The text form is the branch above the raster return; read the whole
       component and keep every role token it mentions on a text node, which is
       the conservative superset.

       THE CLASS MAY BE A FALLBACK CHAIN, NOT A BARE ROLE. <Mark> writes
       `var(--mark-fg,var(--fg-muted))`: muted is only the DEFAULT, and a
       consumer that has a reason to override it sets --mark-fg. The old
       pattern here required a closing paren immediately after the token, so a
       chain matched NOTHING and fell through to the hard-coded '--fg-muted'
       below — the gate then measured a colour the bar does not paint and
       reported a floor 26 points too high. Capture every var() token in the
       declaration, in source order, which is fallback order. */
    for (const m of src.matchAll(/text-\[color:([^\]]+)\]/g)) {
      for (const v of m[1].matchAll(/var\(\s*(--[a-z0-9-]+)/g)) markRoles.push(v[1]);
    }
  }

  /*
    RESOLVE THE CHAIN AGAINST THE STYLESHEET THAT OVERRIDES IT.

    `markRoles` is consumed in the REST pass only (the one place it is read
    resolves every other box with state 'rest'). At rest the bar is over the
    photograph, and nav.module.css sets --mark-fg there. So: walk the chain in
    fallback order and stop at the first token this stylesheet actually defines
    for that state; only if none is defined does the trailing default stand.

    Deliberately narrow. It resolves ONE level, it only accepts a value that is
    itself a known role, and anything it cannot resolve leaves the conservative
    default in place — a gate that guesses generously about its own subject is
    worse than one that is merely strict.
  */
  const navSrc = existsSync(NAV_CSS) ? readFileSync(NAV_CSS, 'utf8') : '';
  /* EVERY rest-state block, not the first one. This selector appears several
     times in the stylesheet — focus rings, foregrounds, the veil — and the
     custom property may be declared in any of them. Matching only the first
     silently resolved nothing and left the strict default standing, which
     looks identical to "correctly strict" from the outside. */
  const restBodies = [
    ...navSrc
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .matchAll(/\.nav\[data-nav='over'\][^{]*\{([^}]*)\}/g),
  ].map((m) => m[1]);
  const resolved = [];
  for (const tok of markRoles) {
    if (tok in M.ROLE_THRESHOLDS) { resolved.push(tok); break; }
    let hit = null;
    for (const body of restBodies) {
      const set = new RegExp(`${tok}\\s*:\\s*var\\(\\s*(--[a-z0-9-]+)`).exec(body);
      if (set && set[1] in M.ROLE_THRESHOLDS) { hit = set[1]; break; }
    }
    if (hit) { resolved.push(hit); break; }
  }
  markRoles.length = 0;
  markRoles.push(...resolved);
  if (markRoles.length === 0) markRoles.push('--fg-muted');

  const mkInput = (overrides = {}) => ({
    markRoles: [...new Set(markRoles)],
    M,
    globalsSrc,
    nav: overrides.nav ?? nav,
    hero,
    assets: heroInput.assets,
    headroom,
    marks,
    markState: overrides.markState ?? markState,
  });

  const result = analyseNav(mkInput());
  /* The plate, for the seam number, resolved once out of app/globals.css. */
  const plateExpr = /\.mark-plate\s*\{[^}]*background\s*:\s*(#[0-9a-fA-F]{3,8}|[a-z-]+\([^)]*\)|[a-z]+)/
    .exec(globalsSrc);
  if (plateExpr) {
    try {
      result.plate = M.stopColour(plateExpr[1], {
        vars: new Map(), ground: [255, 255, 255],
      }).rgb;
    } catch { result.plate = null; }
  }

  printReport(M, result, { headroom });

  if (argv.includes('--prove')) {
    console.log('\n  ── NEGATIVE CONTROLS ────────────────────────────────────────────────');
    const navCss = nav.css.find((c) => c.file === NAV_CSS) ?? nav.css[0] ?? null;
    let subs = 0;
    const variant = (fn) => {
      subs = 0;
      return {
        ...nav,
        css: nav.css.map((c) => {
          if (c !== navCss) return c;
          const r = fn(c.src);
          subs += r.n;
          return { ...c, src: r.src };
        }),
      };
    };
    const worstText = (res) => [...res.rows].sort((a, b) => a.ratio - b.ratio)[0] ?? null;
    const matched = (n) => (n > 0 ? `${n} substitution(s)` : '⚠ MATCHED NOTHING — this control proved nothing');

    if (!navCss) {
      console.log('\n  skipped: no nav stylesheet to perturb.');
    } else {
      /* 1 · every rest-face background removed */
      const v1 = variant(stripRestPaint);
      const n1 = subs;
      const bare = analyseNav(mkInput({ nav: v1 }));
      const bw = worstText(bare);
      const bn = bare.rows.filter((x) => x.ratio < x.need).length;
      console.log('\n  1 · REST-FACE PAINT REMOVED — the bar\'s roles, bare, over the crest.');
      console.log('      This is the state this round started from: a nav ON the photograph');
      console.log(`      with nobody doing the work. ${matched(n1)}`);
      if (bw) {
        console.log(`      worst: ${bw.role} in ${bw.box} at ${bw.vp} — ${bw.ratio.toFixed(3)}:1 `
          + `against ${bw.need.toFixed(3)}:1, ground sRGB ${Math.round(M.greyOf(bw.win.lo)[0])}..`
          + `${Math.round(M.greyOf(bw.win.hi)[0])}`);
      }
      console.log(`      ${bn} row(s) below threshold — ${bn > 0 ? 'CONTROL FAILS AS IT MUST' : '⚠ CONTROL DID NOT FAIL'}`);

      /* 1b · the per-glyph treatment removed, the sheet left alone */
      const v1b = variant(stripTreatments);
      const n1b = subs;
      const noHalo = analyseNav(mkInput({ nav: v1b }));
      const hw = worstText(noHalo);
      const hn = noHalo.rows.filter((x) => x.ratio < x.need).length;
      console.log('\n  1b · PER-GLYPH TREATMENT REMOVED — the veil left in place, the collar');
      console.log(`      taken away. Separates what each role stands on. ${matched(n1b)}`);
      if (hw) {
        console.log(`      worst: ${hw.role} in ${hw.box} at ${hw.vp} — ${hw.ratio.toFixed(3)}:1 `
          + `against ${hw.need.toFixed(3)}:1`);
      }
      console.log(`      ${hn} row(s) below threshold — ${hn > 0
        ? 'the collar is LOAD-BEARING, and the shipped ratios say so'
        : 'the collar is NOT load-bearing: every role clears without it. A treatment that '
          + 'changes no verdict is a claim the page should not be making.'}`);

      /* 2 · thinned to the alpha the hero's crest already paints */
      const v2 = variant((s) => withRestAlpha(s, 0.25));
      const n2 = subs;
      const thin = analyseNav(mkInput({ nav: v2 }));
      const tw = worstText(thin);
      const tn = thin.rows.filter((x) => x.ratio < x.need).length;
      const trast = [...thin.rasterRows].sort((a, b) => a.ratio - b.ratio)[0] ?? null;
      console.log('\n  2 · REST FACE AT 25% — the alpha the hero\'s crest already paints, and');
      console.log('      the one components/ui/Mark.tsx measured the lockup against at 1.04:1.');
      console.log(`      ${matched(n2)}`);
      if (tw) {
        console.log(`      worst text: ${tw.role} in ${tw.box} at ${tw.vp} — ${tw.ratio.toFixed(3)}:1 `
          + `against ${tw.need.toFixed(3)}:1`);
      }
      if (trast) {
        console.log(`      worst raster: ${trast.role} at ${trast.vp} — ${trast.ratio.toFixed(3)}:1`
          + '  (Mark.tsx measured 1.04:1 at 1280 and 1600 — same order, arrived at independently)');
      }
      console.log(`      ${tn} row(s) below threshold — ${tn > 0 ? 'CONTROL FAILS AS IT MUST' : '⚠ CONTROL DID NOT FAIL'}`);

      /* 3 · the reference's own documented failure */
      const v3 = variant((s) => withStuckFill(s, 0.82));
      const n3 = subs;
      const weak = analyseNav(mkInput({ nav: v3 }));
      const bad = weak.stuckRows.filter((x) => x.ratio < x.need).sort((a, b) => a.ratio - b.ratio);
      console.log('\n  3 · STUCK FILL AT 82% — the exact number MAVTERRAS records as its own');
      console.log('      failure ("the nav links drop to 3.50:1 ... against ~#CFCDC8").');
      console.log(`      ${matched(n3)}`);
      if (bad.length) {
        const w = bad[0];
        console.log(`      worst: ${w.role} over ${w.over} — ${w.ratio.toFixed(3)}:1 against `
          + `${w.need.toFixed(3)}:1, composited ground sRGB ${w.backdrop.join(',')}`);
        console.log('      Different palette, different colour, different ratio — AND BOTH FAIL.');
        console.log(`      ${bad.length} row(s) below threshold — CONTROL FAILS AS IT MUST`);
      } else {
        console.log('      ⚠ CONTROL DID NOT FAIL. Our palette would tolerate 82% where the');
        console.log('      reference does not — a real difference, not a bug. The sweep below');
        console.log('      then has to locate a failing alpha or this gate has no demonstrated');
        console.log('      threshold at all.');
      }

      /* 4 · locate the threshold */
      console.log('\n  4 · STUCK FILL SWEPT — walked down until the first role breaks.');
      let firstFail = null;
      for (let a = 1.0; a >= 0.30; a -= 0.02) {
        const s = analyseNav(mkInput({ nav: variant((src) => withStuckFill(src, a)) }));
        if (subs === 0) break;
        const b = s.stuckRows.filter((x) => x.ratio < x.need);
        if (b.length) { firstFail = { a, row: b.sort((p, q) => p.ratio - q.ratio)[0] }; break; }
      }
      if (firstFail) {
        console.log(`      first failure at ${(firstFail.a * 100).toFixed(0)}%: ${firstFail.row.role} over `
          + `${firstFail.row.over}, ${firstFail.row.ratio.toFixed(3)}:1`);
        console.log(`      derived minimum reported above: ${result.derivedMinFill === null ? 'n/a'
          : `${(result.derivedMinFill * 100).toFixed(1)}%`} — the sweep brackets it, so the`);
        console.log('      threshold is LOCATED rather than asserted.');
      } else {
        console.log('      ⚠ no alpha down to 30% failed. Either every role has enormous');
        console.log('      headroom on this palette, or the stuck rows are not being measured.');
      }

      /* 5 · the latent raster, made live */
      const live = analyseNav(mkInput({ markState: { live: true, status: 'verified (SYNTHETIC)' } }));
      const rf = live.failures.filter((x) => x.where === MARK_TSX);
      console.log('\n  5 · art:su-mark FLIPPED TO verified — the latent raster made live.');
      console.log(`      ${rf.length} failure(s) — ${rf.length > 0
        ? 'CONTROL FAILS AS IT MUST: the gate catches the flag flip.'
        : '⚠ CONTROL DID NOT FAIL. The raster would ship unmeasured.'}`);
      if (rf.length) console.log(`      "${rf[0].message}"`);
    }

    console.log(`\n  6 · THE SHIPPING DESIGN — the report above. ${result.failures.length === 0
      ? 'PASSES.' : `${result.failures.length} FAILURE(S).`}`);
  }

  if (result.failures.length) {
    printFailures(result.failures);
    process.exit(1);
  }

  console.log('\n  OK\n');
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}

export {
  MONO_ADVANCE_EM, BOX_MARGIN, FALLBACK_LINE_HEIGHT, PLATE_SEAM_ADVISORY_LSTAR,
  PAPER_SELECTOR_TOKENS, deriveNavBoxes, markSilhouette, analyseNav, loadHeroModel,
};
