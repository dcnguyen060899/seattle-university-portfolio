'use client';

import { useScrollDriver } from '@/hooks/use-scroll-driver';

/**
 * Mounts the one rAF loop for the whole document. Everything else on the page
 * reads the custom properties it writes; no other component may add a scroll
 * listener.
 *
 * IT RENDERS NOTHING. The reference pairs this with a 2px brass progress rule
 * across the top of the viewport; that is page chrome, it belongs to whoever
 * owns the nav, and inventing it here would put a second unmeasured accent on
 * the one screen whose accent budget is already spent on the <Threshold>.
 * `--page` is published regardless, so adding the rule later is a component
 * that reads a property, not a change to this file.
 *
 * WHERE IT IS MOUNTED, and why it is STILL not the root layout: it is
 * rendered by <Hero>, because the hero is the only consumer of --focus and
 * --exit. That placement is also the stricter one — a page with no hero
 * (app/not-found.tsx) never mounts a writer at all, on top of the null-check
 * the hook already carries.
 *
 * THE FIXED NAV DID NOT CHANGE THAT, and it is worth saying why, because the
 * obvious guess is wrong. <SiteNav> is in the root layout and needs a scroll
 * value, so it looks like the driver has to move up with it. It does not:
 * useNavGround() subscribes to the SHARED listener directly (subscribeScroll →
 * the same single rAF), and that listener exists independently of who is
 * writing --page. The nav therefore works on app/not-found.tsx, where this
 * component is never mounted, without a second loop and without moving the
 * writer to a route that has nothing for it to write.
 *
 * Moving it to the layout remains a one-line change whenever the layout wants
 * --page site-wide: useScrollDriver() null-checks the hero element, and a
 * duplicate mount is a no-op rather than a second writer (see `writerClaimed`
 * in the hook).
 */
export function ScrollDriver() {
  useScrollDriver('top');
  return null;
}
