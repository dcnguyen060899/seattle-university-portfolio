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
 * No phone number, and no portrait. Neither is in the corpus.
 */

import { Band, Btn, Eyebrow, Reveal } from '@/components/ui';
import { EvidenceLink, contactEmails, pageQuote } from './evidence';

export function ContactBand() {
  const emails = contactEmails('clm:identity-contact');

  return (
    <Band tone="paper" id="contact">
      <Eyebrow>Contact</Eyebrow>

      <h2 className="mt-[14px] max-w-[20ch]">What I’m looking for</h2>

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

      {/* clm:resume-reporting-note, in his own words — the record kept the quote. */}
      <Reveal index={2}>
        <p className="mt-[18px] max-w-[var(--container-prose)] text-[color:var(--fg-muted)]">
          {pageQuote('clm:resume-reporting-note')} If you have a description in hand, the
          fastest thing you can do with this page is paste it into the box further up.
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
        <Btn href="/docs/resume_content.html" variant="ghost">
          Résumé (web)
        </Btn>
      </div>
    </Band>
  );
}
