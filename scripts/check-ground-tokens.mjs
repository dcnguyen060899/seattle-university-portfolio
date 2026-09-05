#!/usr/bin/env node
/**
 * check-ground-tokens — the mechanism that makes the 2.34:1 failure
 * UNREACHABLE rather than merely documented.
 *
 * Wire into package.json:
 *   "check:tokens": "node scripts/check-ground-tokens.mjs"
 *   "verify": "npm run check:env && npm run check:tokens && npm run lint && npm run typecheck && npm run test"
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * app/globals.css publishes three grounds. Each resolves `--fg-accent` to the
 * red that is AA-safe ON THAT GROUND: #AA0000 on paper (7.43:1), #FF5252 on
 * ink (5.68:1), #F3D4D4 on crimson (5.60:1). The mechanism works only if
 * components read the ROLE and never the palette token, because the palette
 * token is a live trap in both directions:
 *
 *   #AA0000 on ink   2.34:1  fails AA body, AA large AND 1.4.11 — so on ink
 *                            it is illegal as text, rule, border, icon and
 *                            focus ring alike
 *   #FF5252 on paper 3.06:1  the mirror: >=24px display and UI only
 *
 * Neither red is universal. A component that writes `text-crimson` or
 * `var(--color-crimson)` is correct on one ground and broken on another, and
 * it fails SILENTLY — the page renders, the build is green, and the defect is
 * a colour a reviewer has to notice.
 *
 * The reference repo documented the equivalent rule and relied on review. One
 * grep is cheaper than one late accessibility rework, and this is the single
 * most transferable idea in that repo.
 *
 * ── WHAT IT CHECKS ────────────────────────────────────────────────────────
 *
 *   1. No component names a palette token, a Tailwind colour utility built
 *      from one, or a raw colour literal. The allowlist is EMPTY, on purpose:
 *      the pressed-chip case that forced an exception in the design spec is
 *      solved instead by the ground-resolved --surface-pressed / --fg-pressed
 *      pair, so there is nothing left to exempt.
 *   2. Every `data-ground` literal names one of the three real grounds. This
 *      catches `bone`, which does not exist here and would resolve to
 *      nothing — inheriting whatever ground happened to be above it.
 *   3. app/globals.css actually defines the full role set for each of the
 *      three grounds. A ground missing one role is the same silent-inherit
 *      failure, introduced from the other end.
 *
 * ── WHAT IT DELIBERATELY DOES NOT CHECK ───────────────────────────────────
 *
 * Comments. Every measured ratio in this system is written into the source
 * beside the thing it measures, which means the source is full of hexes in
 * comments — that is the project's own truth rule, not a violation of it. The
 * scanner therefore strips comments before matching. A naive line grep (which
 * is what the design spec proposed) would fail on its own documentation.
 *
 * Known limit of the stripper: it tracks quoted strings and template
 * literals, but an unquoted `//` in JSX text will end a line early. That can
 * only ever hide a violation on that one line, never invent one, and no
 * primitive in this system has JSX text containing a bare `//`.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['components', 'app'];
const GLOBALS = join('app', 'globals.css');
const GROUNDS = ['paper', 'ink', 'crimson'];

/**
 * Files exempt from rule 1. Keep this EMPTY. Every entry here is a place the
 * ground mechanism does not reach, and the correct fix for such a place is a
 * new ground-resolved role in globals.css, not an exemption.
 */
const ALLOW = new Set([]);

/** The twelve roles every ground must resolve. */
const REQUIRED_ROLES = [
  'ground',
  'ground-sunk',
  'surface-pressed',
  'fg',
  'fg-muted',
  'fg-brand',
  'fg-accent',
  'fg-accent-display',
  'fg-pressed',
  'rule',
  'edge',
  'focus-ring',
  'fg-error',
];

const VIOLATIONS = [
  {
    name: 'palette custom property',
    re: /--color-(?:paper|ink|text|on-ink|on-crimson|rose|crimson|brand-cream)(?:-[a-z-]+)?\b/g,
    fix: 'read a ground role: --fg / --fg-muted / --fg-brand / --fg-accent / --fg-accent-display / --fg-pressed / --rule / --edge / --focus-ring / --fg-error / --ground / --ground-sunk / --surface-pressed',
  },
  {
    name: 'bare palette alias',
    re: /var\(\s*--(?:paper|paper-sunk|ink|ink-raised|text|text-muted-c|on-ink|on-ink-muted|on-crimson|rose|crimson|crimson-deep|crimson-lift|crimson-wash)\s*[,)]/g,
    fix: 'the bare aliases are for legacy CSS modules, not for components — read a ground role instead',
  },
  {
    name: 'Tailwind colour utility',
    re: /\b(?:bg|text|border|ring|outline|fill|stroke|decoration|caret|accent|divide|placeholder|from|via|to)-(?:paper|ink|crimson|rose|on-ink|on-crimson)(?:-(?:sunk|raised|deep|lift|wash|muted))?\b/g,
    fix: 'use the arbitrary-value form over a ground role, e.g. text-[color:var(--fg-accent)]',
  },
  {
    name: 'raw colour literal',
    re: /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/gi,
    fix: 'a component never names a colour — the palette has exactly one home, app/globals.css',
  },
];

/**
 * Removes comments, replacing them with spaces so line and column numbers are
 * unchanged. Tracks single quotes, double quotes and template literals so a
 * URL inside a string is never mistaken for a line comment.
 */
function stripComments(src, { lineComments }) {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  let state = 'code';

  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (state === 'code') {
      if (c === '"' || c === "'" || c === '`') {
        state = c;
        i += 1;
        continue;
      }
      if (c === '/' && next === '*') {
        const end = src.indexOf('*/', i + 2);
        const stop = end === -1 ? n : end + 2;
        blank(i, stop);
        i = stop;
        continue;
      }
      // `://` is a URL, not a comment — the only place a bare // survives in
      // unquoted source.
      if (lineComments && c === '/' && next === '/' && src[i - 1] !== ':') {
        let end = src.indexOf('\n', i);
        if (end === -1) end = n;
        blank(i, end);
        i = end;
        continue;
      }
      i += 1;
      continue;
    }

    // Inside a string or template literal.
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === state) {
      state = 'code';
    }
    i += 1;
  }

  return out.join('');
}

function* walk(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(?:tsx?|jsx?|css)$/.test(p)) yield p;
  }
}

const rel = (p) => relative(process.cwd(), p).split(sep).join('/');

/** Reports a failure and keeps going, so one run surfaces every problem. */
const failures = [];
function fail(where, message, detail, fix) {
  failures.push({ where, message, detail, fix });
}

/* ── 1 + 2 · scan every component ─────────────────────────────────────── */

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const path = rel(file);
    if (path === GLOBALS.split(sep).join('/')) continue;

    const raw = readFileSync(file, 'utf8');
    const code = stripComments(raw, { lineComments: !file.endsWith('.css') });
    const lines = code.split('\n');
    const isAllowed = ALLOW.has(path);

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;

      if (!isAllowed) {
        for (const v of VIOLATIONS) {
          v.re.lastIndex = 0;
          const hit = v.re.exec(line);
          if (hit !== null) {
            fail(
              `${path}:${lineNo}`,
              `names a colour (${v.name}): ${hit[0]}`,
              line.trim(),
              v.fix,
            );
            break;
          }
        }
      }

      // Ground literals, in JSX (data-ground="x") and in CSS ([data-ground="x"]).
      const groundRe = /data-ground\s*=\s*["']([^"']*)["']/g;
      let g;
      while ((g = groundRe.exec(line)) !== null) {
        if (!GROUNDS.includes(g[1])) {
          fail(
            `${path}:${lineNo}`,
            `unknown ground "${g[1]}"`,
            line.trim(),
            `the three grounds are ${GROUNDS.join(' | ')} — an unknown value resolves to nothing and silently inherits the ground above it`,
          );
        }
      }
    });
  }
}

/* ── 3 · every ground in globals.css resolves the full role set ───────── */

if (!existsSync(GLOBALS)) {
  fail(GLOBALS, 'missing', 'the ground contexts live here', 'nothing to enforce without it');
} else {
  const css = stripComments(readFileSync(GLOBALS, 'utf8'), { lineComments: false });

  for (const ground of GROUNDS) {
    const marker = `[data-ground="${ground}"]`;
    const at = css.indexOf(marker);
    if (at === -1) {
      fail(GLOBALS, `no ground context for "${ground}"`, marker, 'declare it, or remove the ground from this script');
      continue;
    }

    const open = css.indexOf('{', at);
    if (open === -1) {
      fail(GLOBALS, `ground "${ground}" has no block`, marker, 'the selector is never opened');
      continue;
    }

    let depth = 0;
    let close = -1;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) {
      fail(GLOBALS, `ground "${ground}" block is unterminated`, marker, 'unbalanced braces');
      continue;
    }

    const block = css.slice(open, close);
    for (const role of REQUIRED_ROLES) {
      if (!new RegExp(`--${role}\\s*:`).test(block)) {
        fail(
          GLOBALS,
          `ground "${ground}" does not resolve --${role}`,
          marker,
          'every ground resolves every role, or a component reading it inherits the ground above',
        );
      }
    }
  }
}

/* ── report ───────────────────────────────────────────────────────────── */

/**
 * NEITHER BRANCH CALLS `process.exit()`, AND THAT IS DELIBERATE.
 *
 * Measured 2026-09-02 (node v24.7.0 / npm 11.5.1, darwin): under `npm run`,
 * stdout is a PIPE and its writes are asynchronous. Tearing the process down on
 * top of a just-printed line intermittently crashed it — `npm run verify`
 * exited 139 (SIGSEGV) with no diagnostic, on runs where every gate had
 * actually PASSED. A gate that fails intermittently, silently, and ON SUCCESS
 * is worse than no gate: it trains everyone to re-run CI until it goes green.
 *
 * `process.exitCode` sets the same code and lets node flush and exit on its
 * own. Nothing follows this block, so the exit code is the whole contract.
 */
if (failures.length === 0) {
  console.log(
    'check-ground-tokens: OK — no component names a colour, every data-ground is real, '
      + `all three grounds resolve all ${REQUIRED_ROLES.length} roles.`,
  );
} else {
  console.error(`check-ground-tokens: ${failures.length} problem(s)\n`);
  for (const f of failures) {
    console.error(`  ${f.where}`);
    console.error(`    ${f.message}`);
    if (f.detail) console.error(`    > ${f.detail}`);
    console.error(`    fix: ${f.fix}\n`);
  }
  console.error(
    'The ground mechanism in app/globals.css makes the 2.34:1 crimson-on-ink failure\n' +
    'unreachable ONLY IF components read roles instead of colours. Fix the above; do\n' +
    'not add an entry to ALLOW.',
  );
  process.exitCode = 1;
}
