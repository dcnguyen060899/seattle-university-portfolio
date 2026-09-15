/**
 * components/site/contact-band.tsx — band 9. What he is looking for, and four
 * ways to reach him.
 *
 * ── AVAILABILITY IS BOTH, AND MUST NOT CONTRADICT ITSELF (Addendum B, B.1) ─
 *
 * The owner is open to internships in the summer of 2027 AND to new-graduate
 * research, data-science and machine-learning-engineering roles starting
 * mid-2027, graduating in June 2027 after the credits and the two-quarter
 * capstone. The current live site asks for one thing while stating a
 * graduation date that contradicts it, and a recruiter reads that as a
 * mistake. clm:availability holds both halves in one sentence, sourced, and is
 * rendered verbatim here for exactly that reason: this is the sentence most
 * likely to be rewritten carelessly, and rewriting it is how the contradiction
 * comes back.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────
 *
 * Anything about immigration or eligibility status. It exists on the current
 * site only inside a JavaScript payload, it is decision-relevant to a
 * recruiter, and it is the owner’s to publish or not — so it is not carried
 * over silently, and the corpus retracts every speculative form of it.
 *
 * No phone number; it is not in the corpus.
 *
 * ── THE PORTRAIT (added 2026-09-14, as a preview) ─────────────────────────
 *
 * This band used to say "no portrait". The owner asked for one, and it lands
 * here rather than in the hero: the hero was cut to a name and a hook on
 * purpose and is already a photograph with an animated clip over it, and a
 * face belongs at the moment a reader decides to reach out. The image is an
 * AI edit of a photograph of him — clothing, pose and backdrop were changed —
 * so its caption discloses that, the way the hero's foot discloses its
 * painting.
 */

import { Band, Btn, Eyebrow, Reveal } from '@/components/ui';
import { portraitCaption } from '@/lib/corpus/hero-asset';
import { EvidenceLink, contactEmails } from './evidence';

export function ContactBand() {
  const emails = contactEmails('clm:identity-contact');
  /*
    The disclosure is READ from art:portrait, never typed here: C15 greps the
    built page for that record's captionText, and a retyped copy is a copy that
    drifts. Null means the record does not (yet) oblige a line — and then the
    image does not render either.
  */
  const portrait = portraitCaption();

  return (
    <Band tone="paper" id="contact">
      {/*
        One grid, two children, and the portrait comes FIRST in source order:
        on a phone it sits above the heading as a small byline image, and from
        md up it is placed in the right-hand column by explicit column/row —
        not by `order:` — so the tab order, the screen-reader order and the DOM
        stay one order. Same construction the hero uses for its actions.
      */}
      <div className="grid gap-x-[clamp(40px,7vw,96px)] gap-y-[28px] md:grid-cols-[minmax(0,1fr)_auto]">
        {portrait !== null && (
        <figure className="m-0 md:col-start-2 md:row-start-1 md:w-[208px]">
          {/*
            A real <img> with a width ladder, not next/image: the three rungs
            are pre-encoded WebP at 320/480/640, which covers 128px at up to
            DPR 3 and 208px at up to DPR 3, and width/height give the box its
            aspect before a byte arrives, so nothing below it shifts.

            THE CAPTION IS NOT HELD TO THE IMAGE'S WIDTH ON A PHONE. At 128px it
            wrapped to three lines and stranded "me." on the last one; the
            figure runs full width below md so the caption sets on one line,
            and from md up the 208px column holds it to two.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a pre-encoded WebP ladder with fixed intrinsic size; next/image would re-encode files already encoded to size */}
          <img
            src="/brand/portrait/portrait-480.webp"
            srcSet="/brand/portrait/portrait-320.webp 320w, /brand/portrait/portrait-480.webp 480w, /brand/portrait/portrait-640.webp 640w"
            sizes="(min-width: 768px) 208px, 128px"
            width={640}
            height={640}
            alt="Portrait of Duy Nguyen"
            loading="lazy"
            decoding="async"
            className="block h-auto w-[128px] rounded-brand border border-[color:var(--edge)] md:w-full"
          />
          {/* The disclosure, from art:portrait's captionText. */}
          <figcaption className="mt-[10px] text-fine leading-[1.45] text-[color:var(--fg-muted)]">
            {portrait.text}
          </figcaption>
        </figure>
        )}

        <div className="md:col-start-1 md:row-start-1">
          <Eyebrow>Contact</Eyebrow>

          <h2 className="mt-[14px] max-w-[20ch]">Hiring for 2027?</h2>

          {/*
            clm:availability, and it is the single most dangerous sentence on the
            page to re-word: the current live site asks for one season while stating
            a graduation date that contradicts it, and a recruiter reads that as a
            mistake. Both halves are here — the summer internship AND the new-graduate
            role — with the one graduation date that makes them consistent. Anyone
            editing this must keep all three facts together.
          */}
          <Reveal index={1}>
            <p className="mt-[22px] max-w-[var(--container-prose)] text-lede">
              I graduate in June 2027, after all 45 credits and the two-quarter capstone. I am
              open to both: an internship in the summer of 2027, and new-graduate research,
              data-science and machine-learning-engineering roles starting mid-2027.
            </p>
          </Reveal>

          {/*
            One line, since 2026-09-08: the résumé is the artifact a recruiter
            actually downloads, and the box above is the fastest thing to do with a
            description in hand. clm:resume-reporting-note still licenses the
            résumé buttons below.
          */}
          <Reveal index={2}>
            <p className="mt-[18px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)]">
              The résumé has the timeline; the fit brief above has the evidence.
            </p>
          </Reveal>

          <ul className="mt-[clamp(32px,4.5vw,48px)] grid max-w-[var(--container-prose)] gap-0">
            {emails.map((address) => (
              <li
                key={address}
                className="border-t border-[color:var(--edge)] py-[16px] font-mono text-data"
              >
                <a href={`mailto:${address}`} className="text-[color:var(--fg-accent)]">
                  {address}
                </a>
              </li>
            ))}
            <li className="border-t border-[color:var(--edge)] py-[16px]">
              <EvidenceLink id="art:linkedin" label="linkedin.com/in/duwe-ng" />
            </li>
            <li className="border-t border-[color:var(--edge)] py-[16px]">
              <EvidenceLink id="art:github" label="github.com/dcnguyen060899" />
            </li>
          </ul>

          {/*
            clm:identity-name and clm:identity-contact are the two records behind
            the addresses above; clm:econ-to-ds-bridge is the one-line positioning
            the metadata and the JSON-LD also render, kept in one voice across all
            three surfaces. None carries a mandatory caveat.
          */}
          <div className="mt-[clamp(28px,4vw,40px)] flex flex-wrap items-center gap-x-8 gap-y-4">
            <Btn href="/docs/Resume.pdf">Résumé (PDF)</Btn>
          </div>
        </div>
      </div>
    </Band>
  );
}
