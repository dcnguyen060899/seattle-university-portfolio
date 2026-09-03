/**
 * components/site/footer.tsx — the colophon and the record, rendered ONCE in
 * app/layout.tsx so the 404 route inherits it.
 *
 * ── WHAT IS GONE FROM THE OLD FOOTER, AND WHY ─────────────────────────────
 *
 * “© 2025 Seattle University. All rights reserved.” — the current site’s
 * footer asserts a copyright the university does not hold over this page. It
 * is false, and a page arguing that its claims are checkable cannot open its
 * footer with one that is not. The affiliation is real and is stated as an
 * affiliation, in text, beside the mark.
 *
 * The Admin Panel link — a maintenance surface, advertised to recruiters.
 *
 * ── WHAT SURVIVES ─────────────────────────────────────────────────────────
 *
 * The legacy pages that are on a résumé and on LinkedIn and must keep
 * resolving: the month-by-month record, both résumés, the essay, the earlier
 * project write-ups. They are listed from the corpus’s artifact table rather
 * than typed here, so a link on this page and a path the URL harness asserts
 * cannot drift apart.
 *
 * ── GROUND ────────────────────────────────────────────────────────────────
 *
 * `paper`, on the sunk surface. The page spends both of its dark bands on the
 * hero and the award; a third would break the budget, and the closing register
 * this page wants is austere rather than loud. `--ground-sunk` is a
 * ground-resolved role, so this is still a ground declaration and not a colour.
 */

import { Eyebrow, Mark, Rule } from '@/components/ui';
import { artifactById, personById } from '@/lib/corpus';
import type { ArtifactId } from '@/lib/corpus';

/**
 * The legacy surfaces worth a footer link, in reading order. Each is resolved
 * through `artifactById`, so an id that stops existing fails the build instead
 * of shipping a dead link.
 */
const RECORD: ReadonlyArray<{ id: ArtifactId; label: string }> = [
  { id: 'art:news-archive', label: 'The month-by-month record' },
  { id: 'art:resume-page', label: 'Résumé (web)' },
  { id: 'art:resume-pdf', label: 'Résumé (PDF)' },
  { id: 'art:econ-essay', label: 'Essay: the scarce complement to AI work' },
];

const PROJECTS: ReadonlyArray<{ id: ArtifactId; label: string }> = [
  { id: 'art:mosaic-page', label: 'MOSAIC settlement assistant' },
  { id: 'art:nasa-page', label: 'NASA flight-recorder analysis' },
  { id: 'art:garbage-page', label: 'Waste-image classification' },
  { id: 'art:cert-page', label: 'Machine Learning and AI certificate' },
  { id: 'art:learning-algorithm', label: 'Algorithm tutor (for students)' },
];

const ELSEWHERE: ReadonlyArray<{ id: ArtifactId; label: string }> = [
  { id: 'art:github', label: 'GitHub' },
  { id: 'art:linkedin', label: 'LinkedIn' },
  { id: 'art:cause-story', label: 'cheap-as-electricity.com' },
  { id: 'art:mavterras-site', label: 'mavterras.com' },
];

function href(id: ArtifactId): string {
  const artifact = artifactById(id);
  if (!artifact.url) throw new Error(`corpus: ${id} has no URL to link from the footer`);
  // Legacy pages on this domain are linked by path, not by absolute URL: the
  // site is served from two hostnames and an absolute link would send a visitor
  // on one of them to the other mid-session.
  const local = artifact.legacyPath?.replace(/^public/, '');
  return local ?? artifact.url;
}

function FooterList({
  title,
  items,
}: {
  title: string;
  items: ReadonlyArray<{ id: ArtifactId; label: string }>;
}) {
  return (
    <div>
      <Eyebrow as="h2">{title}</Eyebrow>
      <ul className="mt-[14px] grid gap-[10px]">
        {items.map((item) => {
          const url = href(item.id);
          const external = url.startsWith('http');
          return (
            <li key={item.id}>
              <a
                href={url}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-[0.85rem] leading-[1.5] text-[color:var(--fg-muted)] underline decoration-transparent decoration-1 underline-offset-4 hover:decoration-[color:var(--fg-accent)] hover:text-[color:var(--fg)]"
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const name = personById('per:duy').name;

  return (
    <footer
      data-ground="paper"
      className="bg-[var(--ground-sunk)] text-[color:var(--fg)]"
    >
      <div className="wrap py-[clamp(48px,7vw,88px)]">
        <div className="grid gap-[clamp(32px,5vw,56px)] sm:grid-cols-3">
          <FooterList title="The record" items={RECORD} />
          <FooterList title="Earlier projects" items={PROJECTS} />
          <FooterList title="Elsewhere" items={ELSEWHERE} />
        </div>

        <Rule index={1} className="mt-[clamp(36px,5vw,56px)]" />

        <div className="mt-[26px] flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
          <div className="flex items-center gap-[16px]">
            <Mark height={28} alt="" />
            <p className="font-mono text-fine text-[color:var(--fg-muted)]">
              M.S. Data Science, Seattle University
            </p>
          </div>
          <p data-numeric className="font-mono text-fine text-[color:var(--fg-muted)]">
            © 2026 {name}. Built with Next.js, deployed on Vercel.
          </p>
        </div>
      </div>
    </footer>
  );
}
