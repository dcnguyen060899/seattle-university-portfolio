import type { Metadata } from 'next';
import { Band, Btn, Eyebrow, Threshold } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

/**
 * A 404 in the system's own voice.
 *
 * `paper`, not `ink`: the ink ground is this site's PRODUCTION register — the
 * hero, and anything reporting what a running system is doing. A page that
 * failed to resolve is not a production readout, and borrowing the register
 * would make the darkest surface on the site the one a recruiter reaches by
 * accident. Paper is also the ground the site chrome is drawn for, and this
 * file cannot know what chrome is above it.
 *
 * The `<Threshold>` here is doing its actual job rather than decorating: the
 * response code IS the measurement, and stating it plainly is the same move
 * the rest of the page makes with every other number. It is the only figure
 * on the page, so the "at most three per page" rule is comfortably held.
 *
 * Every string below is either a fact about this HTTP response or a
 * navigation label. Nothing here asserts anything about Duy — this file has
 * no access to the corpus and must not invent a substitute.
 */
export default function NotFound() {
  return (
    <Band tone="paper" id="not-found">
      <Eyebrow as="h2">Error · 404</Eyebrow>

      <h1 className="mt-[14px] max-w-[18ch]">
        No record at this address.
      </h1>

      <p className="mt-[22px] max-w-[var(--container-prose)] text-lede text-[color:var(--fg-muted)]">
        The link is broken, or the page it pointed to has been retired. Nothing
        that was published at a permanent URL has moved — the research, the
        coursework and the contact details are all one click away.
      </p>

      <Threshold
        value="HTTP 404"
        label="no resource at the requested path"
        cleared="The request reached the site. The path did not resolve."
      />

      {/*
        ONE action, and the second one was deliberately removed rather than
        left in. The obvious candidates — /docs/news.html and
        /docs/Resume.pdf — are legacy surfaces that still carry figures the
        rebuild has retracted, and neither has been regenerated yet. Sending a
        recruiter from a 404 straight to a retracted number is worse than
        sending them one click further. When those surfaces are back under the
        gates, a second `<Btn variant="quiet">` belongs here.
      */}
      <div className="mt-[clamp(32px,5vw,52px)] flex flex-wrap items-center gap-x-8 gap-y-4">
        <Btn href="/">Back to the portfolio</Btn>
      </div>
    </Band>
  );
}
