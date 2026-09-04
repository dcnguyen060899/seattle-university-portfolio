/**
 * The intro's public surface. Three exports, and the split between them is
 * the territory boundary:
 *
 *   Intro          the overlay: the gate's client half, the veil, the
 *                  timeline and the `--focus` hand-off. Takes the mark as
 *                  `children` and has no opinion about it.
 *   LogoReveal     the mark itself. Owned by whoever draws the lockup;
 *                  currently a placeholder (read its header before using it).
 *   introLogo      `server-only`. The one answer to "is there artwork on
 *                  disk, and can anything draw it?" — read by app/layout.tsx
 *                  before it emits the gate script and by app/page.tsx before
 *                  it mounts anything. Not re-exported from a barrel a client
 *                  component might import; see below.
 *
 * `introLogo` is deliberately NOT re-exported here. This file is imported by
 * app/page.tsx, a Server Component, but a barrel that pulled a `node:fs`
 * module in alongside a `'use client'` one is a build break waiting for the
 * first person who imports `Intro` from the barrel in a client file. Import
 * it from './source' directly, which is also where its reasoning lives.
 */

import { INTRO_REVEAL_MS } from '@/lib/intro';

import { LOGO_REVEAL_MS } from './LogoReveal';

export { Intro } from './Intro';
export { LogoReveal } from './LogoReveal';

/**
 * THE ONE THING THE TWO TERRITORIES CAN GET WRONG, ASSERTED AT BUILD TIME.
 *
 * The controller starts its dissolve at INTRO_REVEAL_MS. The mark finishes
 * drawing at LOGO_REVEAL_MS. If the second is larger, the dissolve begins
 * over a mark caught mid-stroke — a defect that looks like a rendering bug
 * and that neither file can see on its own, because each is correct in
 * isolation. Two constants in two territories with a required inequality
 * between them is exactly the thing a comment does not enforce.
 *
 * This runs at module scope in a Server Component's import graph, so it fails
 * `next build`, not a page view.
 */
if (LOGO_REVEAL_MS > INTRO_REVEAL_MS) {
  throw new Error(
    `components/site/intro: the mark draws for ${LOGO_REVEAL_MS}ms but the controller starts ` +
      `its dissolve at ${INTRO_REVEAL_MS}ms, so the dissolve would begin over a half-drawn ` +
      'mark. Raise INTRO_REVEAL_MS in lib/intro.ts, or shorten the draw — and note that ' +
      'INTRO_REVEAL_MS is very nearly this page\'s first-visit LCP, so raising it is not free.',
  );
}
