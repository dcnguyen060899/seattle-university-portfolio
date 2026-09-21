import type { Metadata } from 'next';
import {
  EssayBody,
  EssayHeader,
  EssayHeading,
  EssayLinks,
  EssayList,
  EssayListItem,
  EssayNote,
  EssayParagraph,
  InlineLink,
} from '@/components/site/essay';
import { pageText } from '@/components/site/evidence';
import { Rule } from '@/components/ui';

/**
 * app/essays/the-scarce-complement/page.tsx — the first essay, August 2026.
 *
 * ── WHERE THIS CAME FROM ───────────────────────────────────────────────────
 *
 * It was published as public/docs/blog_econometrics_of_ai.html, a legacy page
 * set in the old Seattle University stylesheet (Helvetica, white, the SU
 * wordmark header), while the second essay was built on the design system.
 * The owner asked for the two to look the same (2026-09-21), and the way to do
 * that honestly was to move the essay onto the same primitives rather than to
 * restyle the legacy file to imitate them — an imitation in static CSS would
 * have been a second copy of the type scale and the grounds, drifting from the
 * real one on the first edit to either.
 *
 * Same shape as the web résumé's retirement on 2026-09-11: the content moves,
 * the file leaves public/docs, and both old URLs — with and without `.html` —
 * are 301s in next.config.ts to this route, so a link on a résumé, on LinkedIn
 * or in the news archive still lands on the essay.
 *
 * ── THE TEXT IS VERBATIM ──────────────────────────────────────────────────
 *
 * Every sentence was extracted from the legacy file by script, not retyped,
 * and only the markup changed: HTML entities became the typographic
 * characters the rest of the site uses, the h3 section headings became the
 * display-face h2s every band uses, and the "essay-lede" first paragraph is
 * set as body text like every other paragraph. It is published writing under
 * his name; editing its wording is his call, not a styling decision.
 *
 * Claims about Duy it carries, all already licensed on the page elsewhere:
 * clm:yang-psb-submission and clm:yang-psb-oral (accepted, proceedings, oral,
 * the design in words, the co-author) and clm:cause-win (the Graduate Division
 * win).
 *
 * ONE LINE WAS ADDED, AND IT IS NOT HIS: the mandatory caveat on the PSB
 * claims, clm:yang-psb-caveat, rendered under the paragraph that states the
 * acceptance, through pageText so it is the record's sentence and not a
 * retyped one. The legacy file never carried it because public/docs is outside
 * the gates; the moment the essay became a gated surface, C10 required it.
 * It is set as fine print (<EssayNote>), exactly as the highlights band sets
 * the same caveat, so his paragraph above it is untouched.
 *
 * The design is stated in words — four encoders, three decoders — and no
 * numeral from the paper appears, per his standing rule for public essays. The
 * only digits in the emitted text are years and the caveat's due date (the 1st,
 * 2026, 2027), all already on the numeric allowlist; C8 checks that.
 */

export const metadata: Metadata = {
  title: 'AI Didn’t Take Your Job. It Created One Nobody Is Trained For.',
  description:
    'An essay by Duy Nguyen: why the slow entry-level hiring market is a skills mismatch rather than a disappearance, and why experimental design and causal inference are becoming the scarce complement to AI work in high-stakes domains.',
  alternates: { canonical: '/essays/the-scarce-complement' },
};

export default function ScarceComplementEssay() {
  return (
    <>
      <EssayHeader
        date="August 2026"
        title="AI Didn’t Take Your Job. It Created One Nobody Is Trained For."
        lede="Why I think the slow entry-level market is a mismatch rather than a disappearance, what my own research taught me about the skill that is actually scarce, and a plan you can start this year."
      />

      <EssayBody>
        <EssayParagraph>
          If you graduated this year into a market that felt shut, I understand the conclusion
          you probably drew. Listings thin out. Replies stop coming. In the quiet a story fills
          the gap: AI took the jobs, and everyone told to learn to code, or to model, or to
          analyze arrived a few years too late.
        </EssayParagraph>

        <EssayParagraph>
          I do not read it that way. AI is not taking work away from people so much as it is
          changing which work is scarce, and it is doing that faster than any curriculum can
          follow.
        </EssayParagraph>

        <EssayParagraph>
          Here is the mechanism as I understand it. In the short run AI has driven down the cost
          of a large block of routine cognitive work, and when the cost of something falls you
          need fewer hands for it, so firms hire more slowly into those roles and retire the
          older versions. That part is real. If your training pointed at that work, so is the
          pain. But the same capability is quietly creating a job that barely existed a few years
          ago and that almost nobody has been trained for. Demand climbs. Supply is close to
          nothing. And from the outside, a shortage of qualified people is hard to tell apart
          from a shortage of jobs. The slow hiring is the short-run story. The shortage is the
          long-run one, and it is the one you are graduating into.
        </EssayParagraph>

        <EssayHeading>In a million years</EssayHeading>

        <EssayParagraph>
          In a million years, would anyone have guessed that an econometrician’s training would
          have anything to do with a computer scientist building AI?
        </EssayParagraph>

        <EssayParagraph>
          For most of the history of both fields it did not. The economist had the
          identification tools: how to tell a real effect from a confounded one, how to design a
          comparison that settles a question instead of decorating it. What she lacked was a way
          into the systems worth asking about. The computer scientist had the opposite problem:
          the systems, and a benchmark culture that treats a higher number as a finding.
        </EssayParagraph>

        <EssayParagraph>
          AI knocked that wall down from the economist’s side first. Coding is easier now than it
          has ever been. Someone who can state what she wants measured can stand up a working
          pipeline in days rather than quarters. The barrier that kept her out of the machine
          room is the one that fell fastest.
        </EssayParagraph>

        <EssayParagraph>
          That matters because of where AI is going next: fields where being right is not a
          leaderboard question. Radiology, lending, child welfare, drug safety. There the
          question stops being “does the model score higher” and becomes “does this system, on
          these patients, improve the decision, and how would we know if it quietly did not.”
          That is an experiment, and designing one is econometrics.
        </EssayParagraph>

        <EssayHeading>
          The hard parts of my own project were econometric problems in ML clothing
        </EssayHeading>

        <EssayParagraph>
          I can say that concretely because I spent this year inside it. I am a graduate student
          at Seattle University, and my research is a controlled experiment on a
          retrieval-augmented mammography report-generation pipeline: a system that pulls up
          similar prior studies and hands them to a vision-language model before it writes its
          report. It crosses four retrieval encoders, each evaluated frozen and again after
          contrastive fine-tuning, against three frozen decoders, and it was accepted at the
          Pacific Symposium on Biocomputing 2027, for the proceedings and an oral presentation,
          with my advisor, Dr. Wenjing Yang.
        </EssayParagraph>
        <EssayNote>{pageText('clm:yang-psb-caveat')}</EssayNote>

        <EssayParagraph>
          Almost none of the difficulty lived in the model code. It lived in the parts an
          economist would recognize on sight.
        </EssayParagraph>

        <EssayParagraph>
          Start with the null. If most studies in a screening population fall into one category,
          a system that ignores the query and returns that category every time will look
          accurate. So the honest benchmark is the do-nothing one, built from nothing but how
          common the labels are. Clear that first, then talk. Naming the counterfactual is
          roughly the first thing an economics course teaches, and still not standard in machine
          learning benchmarking.
        </EssayParagraph>

        <EssayParagraph>
          Then identification. My encoders differ in the image domain they were pretrained on,
          the thing I set out to study. They also differ in input resolution. The two are
          entangled, so a difference between encoders cannot be pinned on pretraining domain
          alone. The right move was not to bury that but to state it in the paper and mark the
          claim as provisional. Reporting the limit of what your design can identify is not a
          weakness. It is most of the discipline.
        </EssayParagraph>

        <EssayParagraph>
          Then heterogeneity, which mattered most. Aggregate accuracy went up. But when I broke
          the gain out by category, nearly all of it landed on routine screening cases, not on
          the band where a radiologist decides whether to biopsy. An average that improves while
          the decisive subgroup does not is a familiar object in program evaluation: a headline
          effect carried by the group that needed it least. Reporting the aggregate alone would
          have been true and misleading at once, in a domain where that is how someone gets hurt.
        </EssayParagraph>

        <EssayParagraph>
          None of that is exotic. It is the standard equipment of a field that spent decades
          being told its effects were not real.
        </EssayParagraph>

        <EssayHeading>Why the pair is scarce</EssayHeading>

        <EssayParagraph>
          Economists have a word for what is happening: complementarity. A technology that
          substitutes for one skill raises the value of the skills it cannot perform. AI writes
          the code. AI does not decide what the comparison should be, which subgroup the effect
          has to show up in, or which confound sinks the result. Those judgments are the
          complement. The market is short of people who can build a system and interrogate it
          with equal seriousness, because the two halves have never been taught in the same
          building.
        </EssayParagraph>

        <EssayParagraph>
          I came at this from the other side too. Alongside the clinical work I built a
          nested-CES general-equilibrium model of AI and cognitive labor and turned it into an
          interactive data story,{' '}
          <InlineLink href="https://www.cheap-as-electricity.com">
            “Will AI Make Human Work Worthless — or Priceless?”
          </InlineLink>
          , which won the Graduate Division of the{' '}
          <InlineLink href="https://www.causeweb.org/cause/contests/data-scrollytelling">
            CAUSE Student Data Scrollytelling Contest
          </InlineLink>
          . The two projects look unrelated. They ask one question twice: what happens to human
          judgment when the mechanical part of thinking gets cheap.
        </EssayParagraph>

        <EssayHeading>What I would actually do, starting now</EssayHeading>

        <EssayParagraph>
          If you want something more useful than encouragement, here is the plan I would hand
          myself twelve months back. It is a year of work, not a life sentence.
        </EssayParagraph>

        <EssayList>
          <EssayListItem lead="Pick one high-stakes domain and learn its stakes.">
            One, and stay in it. Learn what a missed case costs a real person, in that person’s
            terms. Stakes are what turn a metric into a decision, and you cannot borrow them from
            someone else’s paper.
          </EssayListItem>
          <EssayListItem lead="Take the causal sequence seriously, and take it for the grade.">
            Econometrics, causal inference, design of experiments, applied regression, panel data
            and difference-in-differences, instrumental variables, program evaluation. Pair it
            with the machine learning and statistical computing sequence. The pairing is the
            scarce good. Either half alone is common.
          </EssayListItem>
          <EssayListItem lead="Let AI close the coding gap instead of fearing it.">
            This hybrid is newly possible because the implementation barrier collapsed. Hand the
            model your boilerplate and your plotting, and spend the hours you get back on the
            design, which is the part it cannot do for you.
          </EssayListItem>
          <EssayListItem lead="Build one rigorous project end to end, and publish how you did it.">
            Not five demos. One study, with the question stated up front, the analysis committed
            to before you look, an honest null model, a subgroup breakdown, and a limitations
            paragraph you did not enjoy writing. Then write it up in public, including what
            failed. One project defended honestly says more than a portfolio of things that
            always worked.
          </EssayListItem>
          <EssayListItem lead="If you cannot be the hybrid, go find the other half.">
            A statistician who walks into the ML lab, or an engineer who brings an economist into
            the design meeting before the experiment runs instead of after it fails, produces the
            same scarce good. Collaboration is the fast path, and it is open to you now.
          </EssayListItem>
        </EssayList>

        <EssayHeading>The part I want you to keep</EssayHeading>

        <EssayParagraph>
          I am not going to promise you a market. I cannot see anyone’s hiring plans, and I will
          not pretend the next year is easy. Hiring has slowed, and saying otherwise would be a
          comfortable lie.
        </EssayParagraph>

        <EssayParagraph>
          Here is what I keep running into. Every time this research got hard, the hard part was
          not the model. It was a question about design, about what we are entitled to claim.
          Those questions multiply as AI moves into places where being wrong is expensive, and
          nobody is producing the people who can answer them fast enough.
        </EssayParagraph>

        <EssayParagraph>
          So the silence you are hearing is not the market telling you it does not need people.
          It is the market not yet knowing how to ask for what it needs. Go learn to be the
          answer to a question no one has finished writing down.
        </EssayParagraph>

        <Rule className="mt-[clamp(44px,6vw,72px)]" />

        <EssayLinks
          links={[
            {
              href: '/essays/what-it-can-reach',
              label: 'Newer essay: what a language model is actually for',
            },
            { href: '/docs/news.html', label: 'The month-by-month record' },
          ]}
        />
      </EssayBody>
    </>
  );
}
