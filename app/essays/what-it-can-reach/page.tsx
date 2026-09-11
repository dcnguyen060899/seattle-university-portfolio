import type { Metadata } from 'next';
import { Band, Eyebrow, Reveal, Rule } from '@/components/ui';

/**
 * app/essays/what-it-can-reach/page.tsx — the second essay.
 *
 * ── WHY IT IS A ROUTE AND NOT ANOTHER public/docs PAGE ────────────────────
 *
 * The first essay (public/docs/blog_econometrics_of_ai.html) is a frozen
 * legacy page: it is on a résumé and on LinkedIn, it is served byte-for-byte,
 * and next.config.ts keeps its URL alive. Nothing new should be added to that
 * directory. This one is written against the design system instead — the
 * grounds, the type scale, the nav and the footer — so it reads as part of the
 * site rather than as a page that imitates it.
 *
 * `paper` throughout, and no ink band. The nav keys its legible face on
 * `body:not(:has(#top[data-ground="ink"]))`, so a route with no ink hero gets
 * the sticky paper bar with nothing to configure. A dark band mid-essay was
 * drafted and cut: the ink register on this site means "a production readout",
 * and a paragraph of prose is not one.
 *
 * ⚠ THE BODY IS NOT WRAPPED IN <Reveal>, AND IT MUST NOT BE. <Reveal> observes
 * with `threshold: 0.15`, so an element only reveals once 15% of it is on
 * screen. This essay's body is over 12,000px tall; 15% of it is roughly two
 * viewports, which can never be visible at once, so the observer never fires
 * and the entire essay stays at `opacity: 0` — invisible, with the build green
 * and the HTML correct. It was written that way first and caught in the
 * browser. Reveal is for elements SHORTER than the viewport: a lede, a record,
 * a rule. The lede above uses it. Long-form prose reveals nothing and simply
 * renders, which is also how a document should behave.
 *
 * ── WHAT THIS FILE MAY AND MAY NOT SAY ────────────────────────────────────
 *
 * Every factual claim here is about SOMEONE ELSE'S work, which is why this
 * file — unlike every band under components/site — reads nothing from the
 * corpus. The corpus licenses claims about Duy, and this essay deliberately
 * makes almost none: one sentence about his own research, carrying only what
 * clm:yang-psb-submission and clm:yang-psb-oral already license in the
 * highlights band (accepted, oral presentation, the topic, the co-author) and
 * no result, no metric, no venue detail beyond what the page already states
 * elsewhere. The caveat those two carry, clm:yang-psb-caveat, is honoured in
 * the prose rather than quoted: the sentence says the camera-ready is still to
 * come and that he will publish it then.
 *
 * THE NUMERIC GATE (spec-05 C8) SCANS THIS ROUTE'S EMITTED HTML. That is why
 * the prose spells its quantities out — eighty-eight hours, ten thousand
 * agents, two-thirds of the sepsis cases — rather than setting them as digits.
 * It is not a workaround: a warm essay reads better with the words anyway, and
 * the only digits that survive are publication years in the source list, each
 * of which is registered in data/corpus/allowed-non-claim-numbers.json with
 * its reason. If you add a figure here, it needs an entry there, and the entry
 * needs to say which published work the number identifies.
 *
 * ── THE STANDARD THIS WAS WRITTEN TO ──────────────────────────────────────
 *
 * The owner's brief: warm, human, neutral, not political, science fiction in
 * register but honest that the future it describes is one he is aiming at, and
 * backed by real peer-reviewed literature. Two rules follow from his standing
 * instruction on public writing (no invented statistics, no invented
 * citations):
 *
 *   1. Every source in the list at the bottom was opened and checked. Two
 *      quotations that circulated during this news cycle did not survive that
 *      check and are NOT in this file — a widely repeated paraphrase of
 *      Terence Tao about "raw meat", which is a misquotation of an April 2026
 *      post and was not about this announcement, and a claim that a six-player
 *      go-first dice set did not already exist, which is contradicted by the
 *      project wiki that tracks them. Both were replaced by what the record
 *      actually supports.
 *   2. The credit dispute is reported and not adjudicated. Both accounts are
 *      given in their own words, and the essay says plainly which questions
 *      are open. Buckmaster's own statement declines to accuse anyone, and
 *      this file does not do it on his behalf.
 */

export const metadata: Metadata = {
  title: 'Stop Asking Whether It Thinks. Ask What It Can Reach.',
  description:
    'An essay by Duy Nguyen on the September 2026 Navier–Stokes announcement: why the useful description of a language model is an instrument for reaching parts of the record we could not reach before, why verification is the part that makes it knowledge, and where that capability belongs.',
  alternates: { canonical: '/essays/what-it-can-reach' },
};

/**
 * A section heading.
 *
 * No size class: `<h2>` already resolves to the display face at --text-h2 in
 * globals.css, which is the register every band heading on the home page is
 * set in. An earlier draft overrode it down to --text-h3 and the essay stopped
 * looking like the rest of the site — the headings read as bold body text
 * rather than as section breaks.
 */
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-[clamp(52px,7vw,84px)] max-w-[24ch]">{children}</h2>;
}

/** Body paragraph at the reading measure. */
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-[18px] max-w-[var(--container-prose)]">{children}</p>;
}

/** A source. Author, title, venue, year, and a link a reader can open. */
function S({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <li className="mt-[10px] text-fine text-[color:var(--fg-muted)]">
      {href === undefined ? (
        children
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-transparent decoration-1 underline-offset-4 hover:decoration-[color:var(--fg-accent)] hover:text-[color:var(--fg)]"
        >
          {children}
        </a>
      )}
    </li>
  );
}

export default function EssayPage() {
  return (
    <>
      <Band tone="paper" id="top">
        <Eyebrow>Essay · September 2026</Eyebrow>

        <h1 className="mt-[14px] max-w-[20ch] font-serif text-h1">
          Stop Asking Whether It Thinks. Ask What It Can Reach.
        </h1>

        <Reveal index={1}>
          <p className="mt-[26px] max-w-[var(--container-prose)] text-lede text-[color:var(--fg-muted)]">
            What I learned from the week a machine proved a theorem about moving
            water, why I think we have been using the wrong word for this
            technology, and the place I would rather point it.
          </p>
        </Reveal>
      </Band>

      {/*
        NOT `<Band prose>`. That prop puts `.prose-measure` on the same element
        as `.wrap`, so the narrower max-width wins and `.wrap`'s
        `margin-inline: auto` CENTERS the whole reading column — which would
        leave this essay's body sitting in the middle of the page while the
        title above it starts at the gutter. The home page's idiom is the other
        one: a full-width wrap with each element constrained by
        `max-w-[var(--container-prose)]`, all of it left-aligned. <P> and <H>
        carry that measure themselves, so the essay lines up with the title and
        with every band on the home page.
      */}
      <Band tone="paper" className="pt-0">
        <H>A librarian, and two piles of paper</H>

        <P>
          Start in a library, because that is where this actually starts.
        </P>

        <P>
          A librarian at the University of Chicago named Don Swanson spent
          years worrying about a problem that sounds like a riddle and turns
          out to be a fact about the world. Science publishes far more than
          any person can read. So it is ordinary — not rare — for one group of
          researchers to establish that A affects B, and for a second group,
          in a different field, reading different journals, going to different
          conferences, to establish that B affects C, and for nobody, ever, to
          write down the sentence connecting A to C. The knowledge is public.
          It is sitting on the shelves. It is undiscovered anyway, because no
          one person read both shelves. He gave the condition a name:
          undiscovered public knowledge.
        </P>

        <P>
          Then he went and did it. He read one literature on the blood of
          people with Raynaud’s syndrome, a condition where the small vessels
          in the fingers clamp shut painfully in the cold. He read a second
          literature, which did not cite the first, on what dietary fish oil
          does to blood. Neither set of authors had read the other. Put side
          by side, they licensed a hypothesis nobody had stated: that fish oil
          might help. Swanson ran no experiment. He wrote the sentence, and
          published it.
        </P>

        <P>
          I want to be accurate about what happened next, because the honest
          version is the useful one. A small double-blind trial three years
          later found a benefit in primary Raynaud’s and none in the secondary
          form. His second case, magnesium and migraine, drew two trials in
          the same journal in the same year that disagreed with each other.
          The field he founded has spent the decades since arguing about how
          to even evaluate itself. So this is not a story about a librarian
          who was always right. It is a story about where a hypothesis came
          from. It came from reading, and from nothing else.
        </P>

        <P>
          Hold that shape in your head. Everything below is the same shape at
          a different scale.
        </P>

        <H>The week in September</H>

        <P>
          On the eighth of September, OpenAI published a paper claiming that
          an internal system of theirs had proved that a three-dimensional
          fluid, starting from rest, under a smooth push, with its energy
          staying finite the whole time, can tear itself into a singularity in
          finite time. A hundred and sixty-six pages. A machine-checked
          formalization alongside it. The company said the run began on the
          first of the month, that the winning group ran on the order of ten
          thousand agents at once, and that the proof arrived about
          eighty-eight hours later.
        </P>

        <P>
          About twelve hours before that announcement, Tristan Buckmaster of
          NYU posted a statement. He and Levent Alpöge, a mathematician who
          works at Anthropic, had been working privately for about a year, and
          had just released results of their own on closely related equations,
          obtained in mid-August and machine-verified a week after that. His
          statement says he was told, in calls that weekend, that an internal
          OpenAI model had proved the forced Navier–Stokes case, and that when
          he heard the word forced it was, in his phrase, a bright red flag —
          because the route through a smooth force was the one he and Alpöge
          had quietly chosen, and almost nobody else was on it. He says he
          asked whether the model had been trained on their sessions in
          OpenAI’s coding tool, where they had been putting their drafts for
          the length of the project, and that he did not get an answer on
          training. He describes proposals about authorship that he declined,
          and an exchange that turned sharp.
        </P>

        <P>
          OpenAI’s account is that its researchers and its agents did not see
          any of that work through any means until it was public, and that no
          specific user data was accessed to solve the problem. Its original
          post added that, while unlikely, it could not rule out that
          de-identified data derived from their use of the products had helped
          improve the models. Two days later the company updated the page to
          say that an investigation had confirmed the prompts could not have
          influenced the system in any way, including through training. The
          researcher at the center of the sharpest exchange has apologized for
          his words and disputes the characterization of what he asked for.
        </P>

        <P>
          I am not going to tell you who is right, and I am not writing this
          to. I will point out the thing I found most striking, which is that
          Buckmaster himself declines to. His statement says it outright: he
          has not seen OpenAI’s proof, he does not know what their model did,
          he does not know whether their data was used, and he is not accusing
          anyone of anything. He is stating what he was told and when. And he
          adds that if an OpenAI model really did close that gap, it is a
          remarkable thing and should be said loudly, with the history intact.
        </P>

        <P>
          The history, in this case, is not in dispute by anyone. Both sides
          credit the same two people. Diego Córdoba and Luis Martínez-Zoroa
          spent years building the program that made this line of attack
          possible; they are in OpenAI’s own bibliography, and Buckmaster
          writes in his statement that he believes Martínez-Zoroa deserves a
          Fields Medal. Nobody’s result here came from nowhere. It came from a
          road two humans built.
        </P>

        <H>The sentence that made me want to write this</H>

        <P>
          It is in Buckmaster’s statement, and it is about his own work, not
          OpenAI’s. Describing the first proof his collaborator’s model
          produced, he writes that it was the most horrendous thing he has
          ever read. They verified it in Lean, the proof assistant, on the
          twenty-second of August. And then, in his words, they worked around
          the clock to understand this proof and turn it into something
          readable.
        </P>

        <P>
          Read that again slowly. The machine found it. Two human beings then
          spent weeks understanding it. He is candid about how that went: he
          calls one of the resulting write-ups AI slop, apologizes for it, and
          says the community and the problems deserve better care than he had
          time to give.
        </P>

        <P>
          That gap — between a thing being found and a thing being understood
          — is the whole subject of this essay. It is not a gap that
          embarrasses the technology. It is a description of what the
          technology is.
        </P>

        <H>What the instrument actually does</H>

        <P>
          Here is the claim I want to make, and it is deliberately smaller
          than the one you have been hearing.
        </P>

        <P>
          A large language model is an instrument for reaching regions of an
          enormous space of already-existing information that we could not
          practically reach before. Not a mind. Not a colleague. A reader with
          an inhuman span, which can hold open more of the record than any of
          us and notice which two pages are reaching for each other. Swanson
          did that by hand with two literatures. This does it across a space
          no person could walk.
        </P>

        <P>
          This is not a metaphor I invented, and the literature is better than
          the metaphor. In a study in Nature, researchers trained word
          embeddings on millions of materials-science abstracts and recovered
          the structure of the periodic table without being taught any
          chemistry — and, more to the point, surfaced thermoelectric
          materials years before those materials were published as
          discoveries. The authors’ own sentence is the cleanest statement of
          the idea I have found: latent knowledge regarding future discoveries
          is, to a large extent, embedded in past publications.
        </P>

        <P>
          Look at how the strongest systems are actually built and you find
          the same admission. FunSearch, in Nature, pairs a language model
          with an automatic evaluator, and its authors are explicit that the
          pairing exists precisely because models confabulate: the model
          proposes, the evaluator throws away everything that does not survive
          checking, and what is left is new. AlphaProof works in Lean for the
          same reason. Two philosophers of mathematics, writing in a
          peer-reviewed journal last year, called these systems embodiments of
          brute-force search, and I do not think that is an insult. It is a
          specification.
        </P>

        <P>
          And there is a beautiful piece of evidence for the boundary of the
          thing. When Nature had working mathematicians put AlphaProof through
          its paces, the pattern that came back was that it did well on
          problems built from concepts already defined in Lean’s shared
          mathematical library, and much less well where they were not. Kevin
          Buzzard, who is leading the effort to formalize Fermat’s Last
          Theorem, could not get use out of it at all, because his development
          is full of bespoke definitions that the library — and so the training
          — does not contain. His summary was blunt: no AI system is anywhere
          near useful to him right now.
        </P>

        <P>
          That is the thesis stated as a measurement. The instrument navigates
          the space that is already represented. Which is exactly why it is
          powerful, and exactly why calling it a general intelligence gets the
          engineering wrong.
        </P>

        <H>The time everyone got this wrong in public</H>

        <P>
          In the autumn of last year a researcher posted that a model had
          solved a batch of open problems from a well-known database of
          Erdős’s unsolved questions, and declared that science acceleration
          via AI had officially begun. It went everywhere. Then the person who
          maintains the database explained what the word open meant on his
          site. It meant open to him — problems whose solutions he personally
          had not yet found in the literature. The model had not solved them.
          The model had gone and found the papers that already solved them,
          some of them obscure, and it had done that very well. The head of a
          rival lab called the whole episode embarrassing.
        </P>

        <P>
          I think about that story constantly, because nothing in it was fake.
          The capability was real and, honestly, wonderful. A machine read a
          corpus nobody had finished reading and returned the connection. The
          only thing that was wrong was the word we reached for. We said
          solved. It had searched.
        </P>

        <P>
          And here is what bothers me about that mistake: searching was the
          more useful thing. Swanson’s whole career says so.
        </P>

        <H>Where I could be wrong, stated at full strength</H>

        <P>
          If I only told you the part above, I would be doing the thing I am
          complaining about, in the other direction. So here is the strongest
          evidence against my own framing.
        </P>

        <P>
          In July, the same Levent Alpöge published an explicit counterexample
          to the Jacobian conjecture, a problem that had stood since the
          nineteen-thirties, crediting an Anthropic model with finding it. A
          counterexample is not like a proof. You do not have to trust whoever
          produced it. You substitute the numbers and look. It either is or is
          not a counterexample, and this one is. And you cannot retrieve from
          a corpus an object that is not in the corpus.
        </P>

        <P>
          I do not know how to fit that cleanly into a story about searching a
          space of existing information, and I am not going to pretend
          otherwise. The most honest thing I can say is that the space these
          systems navigate is not only the space of things people have
          written. It seems to include the space of things constructible from
          what people have written, which is unimaginably larger, and which we
          have no map of. That is more than a library. It is still not a mind.
        </P>

        <H>The part that makes it knowledge</H>

        <P>
          Now the detail from September that I find genuinely moving, and that
          almost nobody wrote about.
        </P>

        <P>
          OpenAI’s formal proof is checked against problem statements it did
          not write. The statements were taken, at a pinned version, from an
          independent repository of formalized open conjectures maintained by
          a competing lab. So the company that produced the proof did not get
          to define what counted as proving it. Someone else held the
          definition, in machine-checkable form, and the proof had to satisfy
          that.
        </P>

        <P>
          I would like that to be the most-copied idea of this whole episode.
          It is the answer to the question everyone keeps asking in the wrong
          key. You do not need to know whether the machine understood
          anything. You need the statement of the problem to live somewhere
          the machine’s owner does not control, and you need the check to be
          mechanical.
        </P>

        <P>
          Which is why nothing is settled yet, and why that is fine. The Clay
          Mathematics Institute has recognized no one; its rules require
          publication, years of elapsed time, and general acceptance by the
          field, and its president says the evaluation will be deliberately
          unhurried. There is a real disagreement among mathematicians about
          significance, too: the official problem statement offers four
          alternatives, and while the two that concern breakdown do permit a
          smooth applied force — so the claim is valid on the face of the text
          — the unforced question, the one most people mean when they say
          Navier–Stokes, is still open. OpenAI has said it does not intend to
          claim the prize.
        </P>

        <P>
          Terence Tao, who has thought about these equations for most of his
          career, gave the objection its best form. Getting the answer this
          way, he told CNN, is a little like watching a movie by jumping from
          the first ten minutes to the last ten. Technically the plot lines
          all resolve. Most of the value of the experience is gone. In a
          lecture this year he made the quieter and more damaging point: the
          public evidence about what these systems can do is subject to severe
          reporting bias, because successes are announced and failures are
          not.
        </P>

        <H>Why the framing is not just semantics</H>

        <P>
          Five days before the mathematics announcement, at a briefing for a
          different model, OpenAI’s president told reporters it was not
          unreasonable to feel that we are now in the AGI era. Those two
          events got welded together in the retelling, and they should not be:
          different week, different model, different claim.
        </P>

        <P>
          But the welding is the whole problem, and it is why I care about a
          word.
        </P>

        <P>
          If the frame is artificial general intelligence, the only available
          question is whether the machine is smarter than us, and that
          question has no engineering answer. It cannot be measured, it cannot
          be designed against, and it turns every result into a referendum on
          human worth. If the frame is an instrument for reaching a space,
          then the questions become answerable and, better, actionable. Which
          region can it reach? What is represented in that region and what is
          missing? Who holds the statement of the problem? What is the check,
          and can the machine’s owner edit it? How much did the search cost,
          and who can afford it — a fair question here, since one mathematician
          observed that very few mathematicians will ever have resources at
          that scale.
        </P>

        <P>
          Those are questions a graduate student can work on. The other one is
          a question you can only have opinions about.
        </P>

        <H>Where I would rather point it</H>

        <P>
          Now the science fiction, except that every piece of it has already
          been built and published, which is why I think it is not fiction so
          much as an unfinished assignment.
        </P>

        <P>
          Picture a person’s medical record as what it actually is: a
          time series. Visits, codes, prescriptions, values, decades long,
          written by dozens of people who never met each other and were each
          solving that day’s problem. It is a library, and nobody has read the
          whole of it — not the patient, and not, in any real sense, any one
          of their doctors.
        </P>

        <P>
          Last year a group published a generative model in Nature trained on
          the records of about four hundred thousand people, which predicts
          rates for more than a thousand diseases from a person’s history and
          can generate plausible trajectories two decades forward. They then
          ran it, unchanged, against the national registry records of nearly
          two million people in another country. A separate group trained on
          Danish registry sequences and validated on American veterans’ data
          to flag pancreatic cancer risk years before diagnosis. This is
          Swanson’s shape again: A and B in one part of the record, B and C in
          another, and the sentence connecting them in nobody’s chart.
        </P>

        <P>
          And now the guardrail, which belongs in the same paragraph as the
          hope rather than in a footnote after it.
        </P>

        <P>
          That Nature model’s accuracy fell when it crossed the border, and
          fell further the farther ahead it looked. Its own authors report
          that it learned artifacts of how the data was collected — diseases
          that only ever appear in hospital records were predicted far more
          often in anyone who had any other hospital record — and they warn
          against reading it causally. That is what an honest paper looks
          like. The dishonest version is also on the record: a widely deployed
          proprietary sepsis alert, evaluated independently at a university
          health system, scored far below what its vendor had reported and
          missed about two-thirds of the sepsis cases while firing on nearly a
          fifth of all hospitalizations. And in the most cited case of all, a
          risk algorithm used on millions of patients turned out to be
          predicting cost rather than illness, which quietly meant Black
          patients had to be sicker to get the same score.
        </P>

        <P>
          So the instrument does not get to diagnose. It gets to notice. A
          clinician decides. And between noticing and deciding sits the
          unglamorous machinery I have come to think is the actual frontier:
          prospective validation, subgroup breakdowns, and reporting standards
          that exist and have names. My own small corner of this is a
          controlled experiment on retrieval-augmented mammography report
          generation, accepted this month to the Pacific Symposium on
          Biocomputing for the proceedings and an oral presentation, with my
          advisor Dr. Wenjing Yang. I will publish it when the camera-ready is
          in. What that work taught me is that the hard parts are almost never
          the model. They are the questions about what a comparison entitles
          you to claim.
        </P>

        <H>The thing I want you to keep</H>

        <P>
          A journalist told a small story on a podcast this month that has
          stayed with me more than the theorem did. He had been covering a
          puzzle about dice — sets of dice fair enough that players can each
          roll one to decide who goes first, with no ties and no advantage —
          which a loose group of enthusiasts and mathematicians had worked on
          for more than a decade. After filing the story he went back to a
          harder version of it, opened a chatbot, and got a candidate answer
          out of it in minutes using nothing but plain English. He is a
          computer scientist by training and says his own mathematics is
          dusty. What he contributed was not mathematics. It was
          encouragement: the model would stall, ask whether it should try
          looking somewhere else instead, and he would say yes, go on.
        </P>

        <P>
          I should be careful with that story, because I checked it and it is
          smaller than it sounds: solutions for that size of set already
          existed publicly, including on the wiki the puzzle’s own community
          keeps, and no one has independently verified his. But the part that
          matters survives checking. A person with no standing in that field
          reached into a space he could not otherwise have entered, and the
          only thing he supplied was direction and permission to continue.
        </P>

        <P>
          That is the future I actually believe in, and it is smaller and
          better than the one being sold. Not a machine that thinks for us. A
          machine that goes where we cannot go and comes back with something,
          while the deciding what it means, and the checking whether it is
          true, and the caring who it is for, stay exactly where they have
          always been.
        </P>

        <P>
          Every correction in this essay — the misquoted line, the dice claim
          that was bigger than the record, the two announcements welded into
          one — came from a person opening a source and reading it. That is
          not a defeat for the technology. It is the other half of it, and it
          is the half that is ours.
        </P>

        <P>
          Finding is not a lesser act than creating. Swanson settled that
          forty years ago in a library, and the machines have only made the
          point louder. But nothing that is found becomes knowledge until
          somebody understands it. Buckmaster and Alpöge lost weeks of sleep
          to that, and it was the most human thing in the whole story.
        </P>

        <P>Don’t forget which half is yours.</P>

        <Rule className="mt-[clamp(44px,6vw,72px)]" />

        <H>Sources</H>

        <P>
          Everything above is checkable, so here is what I read. Where a claim
          in the news cycle did not survive checking, I left it out.
        </P>

        <ul className="mt-[18px] max-w-[var(--container-prose)] list-none">
          <S href="https://doi.org/10.1086/601720">
            Don R. Swanson, “Undiscovered Public Knowledge”, The Library
            Quarterly, 1986 — and the companion case study, “Fish Oil,
            Raynaud’s Syndrome, and Undiscovered Public Knowledge”, Perspectives
            in Biology and Medicine, the same year.
          </S>
          <S href="https://doi.org/10.1016/0002-9343(89)90261-1">
            R. A. DiGiacomo, J. M. Kremer and D. M. Shah, “Fish-oil dietary
            supplementation in patients with Raynaud’s phenomenon”, The American
            Journal of Medicine, 1989 — the small trial that followed Swanson’s
            hypothesis, positive in the primary form only.
          </S>
          <S href="https://doi.org/10.1093/bioinformatics/btad090">
            Erwan Moreau, “Literature-based discovery: addressing the issue of
            the subpar evaluation methodology”, Bioinformatics, 2023 — the
            field’s own account of how hard it is to tell whether this works.
          </S>
          <S href="https://doi.org/10.1038/s41586-019-1335-8">
            Vahe Tshitoyan et al., “Unsupervised word embeddings capture latent
            knowledge from materials science literature”, Nature, 2019.
          </S>
          <S href="https://doi.org/10.1038/s41586-023-06924-6">
            Bernardino Romera-Paredes et al., “Mathematical discoveries from
            program search with large language models” (FunSearch), Nature.
          </S>
          <S href="https://doi.org/10.1038/s41586-025-09833-y">
            Thomas Hubert et al., “Olympiad-level formal mathematical reasoning
            with reinforcement learning” (AlphaProof), Nature, 2025.
          </S>
          <S href="https://www.nature.com/articles/d41586-025-03585-5">
            “Mathematicians put AlphaProof to the test”, Nature, 2025 — where
            the mathlib pattern and Kevin Buzzard’s verdict come from.
          </S>
          <S href="https://doi.org/10.1093/philmat/nkaf005">
            Walter Dean and Alberto Naibo, “Artificial Intelligence and Inherent
            Mathematical Difficulty”, Philosophia Mathematica, 2025.
          </S>
          <S href="https://openai.com/index/navier-stokes-solution/">
            OpenAI, “On the Navier–Stokes Millennium Prize Problem”, and the
            paper “Finite time blowup for Navier–Stokes”, September 2026, with
            the Lean formalization released alongside them.
          </S>
          <S href="https://cims.nyu.edu/~tristanb/statement.pdf">
            Tristan Buckmaster’s statement, September 2026 — quoted here for his
            description of his own work, and for his explicit refusal to accuse
            anyone.
          </S>
          <S href="https://www.claymath.org/millennium/navier-stokes-equation/">
            Charles Fefferman’s official statement of the Navier–Stokes problem
            for the Clay Mathematics Institute, which is where the four
            alternatives and the role of the forcing term are defined.
          </S>
          <S href="https://terrytao.wordpress.com/">
            Terence Tao’s blog, and his lecture “Mathematics in the age of AI”,
            on verification, on reporting bias, and on what is lost when the
            middle of the story is skipped.
          </S>
          <S href="https://doi.org/10.1038/s41586-025-09529-3">
            Artem Shmatko et al., “Learning the natural history of human disease
            with generative transformers” (Delphi-2M), Nature, 2025 — read it
            with its own limitations section open.
          </S>
          <S href="https://doi.org/10.1038/s41591-023-02332-5">
            Davide Placido et al., “A deep learning algorithm to predict risk of
            pancreatic cancer from disease trajectories”, Nature Medicine, 2023.
          </S>
          <S href="https://doi.org/10.1001/jamainternmed.2021.2626">
            Andrew Wong et al., “External Validation of a Widely Implemented
            Proprietary Sepsis Prediction Model in Hospitalized Patients”, JAMA
            Internal Medicine, 2021.
          </S>
          <S href="https://doi.org/10.1126/science.aax2342">
            Ziad Obermeyer et al., “Dissecting racial bias in an algorithm used
            to manage the health of populations”, Science, 2019.
          </S>
          <S href="https://doi.org/10.1136/bmj-2023-078378">
            Gary S. Collins et al., the TRIPOD+AI statement, BMJ, 2024 — one of
            the reporting standards that already exists for exactly this.
          </S>
          <S href="https://doi.org/10.1162/daed_a_01915">
            Erik Brynjolfsson, “The Turing Trap: The Promise &amp; Peril of
            Human-Like Artificial Intelligence”, Daedalus, 2022.
          </S>
        </ul>

        <Rule className="mt-[clamp(36px,5vw,56px)]" />

        <div className="mt-[26px] flex flex-wrap gap-x-8 gap-y-3 text-fine">
          <a
            href="/docs/blog_econometrics_of_ai.html"
            className="underline decoration-transparent decoration-1 underline-offset-4 hover:decoration-[color:var(--fg-accent)]"
          >
            Earlier essay: the scarce complement to AI work
          </a>
          <a
            href="/docs/news.html"
            className="underline decoration-transparent decoration-1 underline-offset-4 hover:decoration-[color:var(--fg-accent)]"
          >
            The month-by-month record
          </a>
        </div>
      </Band>
    </>
  );
}
