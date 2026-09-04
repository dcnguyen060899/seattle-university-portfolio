import 'server-only';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { INTRO_LOGO_CANDIDATES, isRenderableLogo } from '@/lib/intro';

import type { LogoSource } from '@/lib/intro';

/**
 * Does the brand lockup exist on disk, and can anything actually draw it?
 *
 * ONE ANSWER, READ BY BOTH ENDS. app/layout.tsx asks before emitting the gate
 * script and app/page.tsx asks before mounting the overlay; if they could
 * disagree, a document could be stamped `pending` with no overlay in it — the
 * hero would sit soft behind nothing for four seconds until the gate's
 * dead-man's switch cleaned up. Whoever owns the reveal reads the same
 * function for the href it draws, so the file the gate opened on is always
 * the file the mark comes from.
 *
 * ── WHY A FILESYSTEM CHECK AND NOT A CONSTANT ─────────────────────────────
 *
 * Because the shipping state is "the file is not here yet", and the absent
 * path has to be the one that cannot rot. A boolean in a config file is a
 * boolean somebody has to remember to flip, and the failure mode of
 * forgetting is an intro that plays an empty stage over the hero. Asking the
 * disk means dropping the artwork in `public/brand/` is the entire
 * integration step, and deleting it is the entire rollback.
 *
 * ── WHEN THIS RUNS ────────────────────────────────────────────────────────
 *
 * At module scope, so it is evaluated ONCE — at build time for the statically
 * prerendered homepage, which is where the answer is baked into the HTML. It
 * is `server-only`, so it can never be pulled into a client bundle by an
 * import that looked harmless.
 *
 * `process.cwd()` is the project root under `next build`, `next dev` and
 * `next start` alike. If a future deployment target ever renders this page at
 * request time from a bundle that does not carry `public/`, the honest
 * failure is "no intro", which is the same thing this whole module is built
 * to make safe.
 */
function resolve(): LogoSource | null {
  const root = process.cwd();
  for (const candidate of INTRO_LOGO_CANDIDATES) {
    if (existsSync(join(root, 'public', candidate.href.replace(/^\//, '')))) return candidate;
  }
  return null;
}

const RESOLVED: LogoSource | null = resolve();

/**
 * The winning candidate, or null. `vector-source` (a PDF master nothing can
 * draw yet) is reported here so a caller can say so, but it is NOT enough to
 * turn the intro on — see `introLogo()`.
 */
export function logoSource(): LogoSource | null {
  return RESOLVED;
}

/**
 * The intro's enable switch: the source that exists AND can be drawn, or
 * null. Null means no gate script, no overlay markup, no attribute, no
 * behaviour change of any kind.
 */
export function introLogo(): LogoSource | null {
  return isRenderableLogo(RESOLVED) ? RESOLVED : null;
}
