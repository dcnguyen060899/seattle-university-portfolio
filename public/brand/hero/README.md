# Hero photograph

Everything in this directory except this file and `.gitkeep` is **generated**
from one supplied photograph by `scripts/gen-hero-photo.mjs`. Nothing here is
hand-edited. A file edited by hand fails `scripts/verify-hero-assets.mjs` on the
next run, because the manifest records every byte count.

---

## The one-line instruction

1. Drop the photograph at **`public/brand/hero-source.png`** (`.jpg` and
   `.jpeg` also work — exactly one of the three, never two).
2. Run **`node scripts/gen-hero-photo.mjs`**.
3. **Look at `hero-proof.webp`** (see [Check the crops](#check-the-crops)).
4. Commit the result — the source, and everything this directory now holds.

That is the whole flow. The script prints a size table, a ladder report and the
measured scrim requirement, enforces its own byte budgets, and sweeps away any
variant it no longer emits so a dropped width cannot leave an orphan behind for
a `<picture>` tag to keep pointing at.

To check the result at any time, or in CI:

```sh
node scripts/verify-hero-assets.mjs
```

---

## Right now there is no photograph, and that is a supported state

The repo currently ships **no `hero-source.*` and no generated variants**, and
`manifest.json` says so:

```json
{ "present": false, … }
```

The hero renders as the flat ink ground — exactly what is deployed today. No
build error, no broken layout, no 404, no missing-image box. **The photograph is
progressive enhancement over a hero that already works**, and it has to stay
that way: `verify-hero-assets.mjs` passes cleanly in this state, deliberately,
because a gate that failed here would be asserting that the shipping repo is
broken and the first thing anyone would do is delete it.

`manifest.json` is committed in the absent state — rather than only appearing
after a run — so a consumer can static-import it unconditionally and branch on
one boolean. There is no import that can fail to resolve and no filesystem probe
for a file that may not be there.

To go back to the flat ink hero: delete `hero-source.*` and run
`node scripts/gen-hero-photo.mjs --allow-missing`. That restores the
`present: false` manifest and sweeps every generated file.

---

## ⚠ The scrim is not decoration. It is the mechanism.

This is the most important paragraph in this file.

The hero is `[data-ground="ink"]`. Every colour in it is measured in
`app/globals.css` against a **flat `#14161A`**:

| token | value | ratio on flat ink |
|---|---|---|
| `--fg` | `#F2F1EE` | 16.04 : 1 |
| `--fg-muted` | `#A3A2A8` | 7.15 : 1 |
| `--fg-accent` | `#FF5252` | 5.68 : 1 |

`--fg-accent` resolves to the crimson-lift rather than the brand crimson because
`#AA0000` on ink is **2.34 : 1 and fails everything, including 1.4.11**
(Addendum B, R-7).

**Put a photograph behind that text and not one of those numbers is true any
more.** The scrim is what makes them true again, and it has to be sized against
the photograph's actual brightest region, in sampled pixels — never assumed,
because axe-core cannot see a photograph and no test in this repo would catch a
hero whose eyebrow fails contrast over a bright sky.

`scripts/gen-hero-photo.mjs` is the only thing in the repo that decodes the
master, so it does the measurement and writes the answer into the manifest:

```jsonc
"grade": {                      // the tone baked into the pixels, applied BEFORE the veil
  "brightness": 0.222,          // solved at build time — a multiplier on CIE L*
  "saturation": 0.8,
  "solvedAgainst": 0.45         // the scrim alpha the solve aimed at
},
"scrim": {
  "requiredAlpha": 0.448,       // THE FLOOR. Measured, on the GRADED pixels. Nothing may go under it.
  "base": 0.448,                // at-rest scrim — the lightest legal veil
  "exit": 0.508,                // deeper as the hero scrolls away; legal by construction
  "bindingForeground": "--fg-accent",
  "targetRatio": 4.5
}
```

⚠ **`grade` and `scrim` are one mechanism and have to be read together.**
`requiredAlpha` is only this low *because* of the grade above it; reading the
scrim alone would suggest a photograph under a light veil rather than a *graded*
photograph under a light veil. A consumer needs nothing from `grade` — that tone
is already in the bytes it fetches — but the claim is not auditable without it.

Only `requiredAlpha` is a measurement. `base` and `exit` are **defaults derived
from it** — a design knob the consumer may override, whose one hard rule is that
neither may fall below the floor. Deriving them rather than typing them means
the error can only ever be *too much* scrim, which is a look problem rather than
an accessibility one. `verify-hero-assets.mjs` fails if either drops under the
floor.

**The consumer must read this number from the manifest, not retype it.** A scrim
whose opacity was typed by hand is a number nothing re-derives when the
photograph changes, and the whole point of hashing the source into the manifest
is that a changed photograph fails the gate instead of silently invalidating the
ratios.

### What `requiredAlpha` honestly claims

**It claims:** composite the photograph under an ink scrim at this alpha, and
every **glyph-sized patch** of the result still clears 4.5 : 1 against the
weakest of the three ink foregrounds. `--fg-accent` at 5.68 : 1 has the least
headroom of the three, so it is the binding constraint and the other two clear
by construction. The manifest's `achieved` block prints what all three actually
measure over the brightest patch.

**It does not claim anything about individual pixels**, and the reason is worth
writing down because a per-pixel maximum *looks* more rigorous. A dusk
photograph with lit lamps contains near-white specular pixels, and a single one
of those would drive the requirement to ~1.0 — a scrim that makes the whole
photograph invisible in order to protect text from a highlight smaller than a
glyph stem. The background a glyph actually sits on is the *area* behind it, so
the measure is the **maximum local mean over a box of frame-width ÷ 80** (sized
for the smallest type in the band, the 11px eyebrow). The per-pixel maximum and
the 99.9th percentile are measured too, and printed as `diagnostics`, next to
`alphaIfGatedOnMaxPixel` so the gap between the two claims is visible rather
than argued.

**It carries a x1.05 engineering margin, and that margin is load-bearing.**
The solve is done at 4.5 x 1.05 = 4.725 : 1, not at a bare 4.5, which is the
same margin `components/site/hero-scrim.module.css` uses to derive its
`--scrim-floor-min: 93%`. It pays for sRGB rounding in the compositor, for
encoder drift between this master and the AVIF rung a browser actually paints,
and for the fact that an antialiased glyph edge is lighter than the glyph it
belongs to. It is not padding: measured on rendered pixels over a deliberately
brutal stand-in master, the 11px eyebrow came out at **4.688 : 1** with the
margin and **4.449 : 1** without it — a real AA failure. Solving here at a bare
4.5 also put a number in this manifest (0.914) that the CSS clamp then silently
raised to 0.930 on the page, so the manifest was publishing an alpha the page
did not use; `scripts/check-hero-contrast.mjs` check E fails the build on
exactly that, which is how it was caught. `targetRatio` in the manifest stays
4.5 because 4.5 : 1 is the requirement being met; the margin is the headroom the
solve is done with.

**It is a floor, not a design.** It is the minimum for a *flat* scrim over the
*whole* frame. `scrim.perRegion` in each orientation gives the same requirement
per ninth of the frame, so a gradient scrim — or copy pinned to the dark corner
— can be lighter where the photograph is darker. Anything built on a region is
only true if the text is pinned to that region **in CSS, at every width**. A
hero whose copy reflows out of the dark corner at some viewport has quietly
traded its contrast for a look.

**If `requiredAlpha` comes back above 0.85**, the script warns and so does the
verifier. That is legal and still accessible, but it means very little of the
photograph survives. The honest fixes are **a darker grade** (lower
`TARGET_SCRIM_ALPHA` — see *The grade* below, and note the grade is what keeps
this number off 0.93 in the first place), a darker crop (drop more sky), or a
different frame. **Never a thinner scrim** — that does not make the hero look
better, it makes its published ratios false.

On this master the grade moves the requirement from **0.926 to 0.448**
(portrait) and **0.916 to 0.320** (landscape). The per-ninth figures move
further still: ungraded they sat at 0.80–0.93 across every cell, so there was no
dark pocket anywhere for a shaped scrim to exploit; graded they run **0.00–0.45**,
with several ninths needing no veil at all. A localised scrim only becomes a
real option after the grade.

---

## Check the crops

`hero-proof.webp` is the master, downscaled, with both crop windows drawn on it:

| outline | window |
|---|---|
| **solid crimson** `#AA0000` | the landscape crop — desktop, `hero-l-*` |
| **dashed pale** `#FBFAF8` | the portrait crop — mobile, `hero-p-*` |

It is not shipped to users; it exists so re-tuning a crop is "look at this and
move one number" rather than a guess. **Look at it after the first run**, because
the two focal points in the generator are the only numbers in this pipeline that
are *judgement rather than measurement* — they were chosen from a verbal
description of a photograph nobody had yet seen.

The crops are expressed as a **target aspect plus a focal point**, and the
script solves for the largest window of that aspect that fits, centred on the
focus and clamped to the frame. That is a deliberate divergence from the
reference pipeline, whose crops are literal `{top, bottom, left, right}`
fractions — those only mean anything if you already know the master's aspect
ratio, and this pipeline was written before the master existed.

| | target | focus | what it is for |
|---|---|---|---|
| `LANDSCAPE_CROP` | 16 : 9 | x 0.50, **y 0.62** | A wide band, **biased low**. The subject sits low in the frame and the upper half is sky, so biasing the window down spends the entire cut on sky. On most landscape masters it lands flush to the bottom edge — that is the intent, not an artefact of the clamp. |
| `PORTRAIT_CROP` | 4 : 5 | **x 0.42**, y full | A tall slice taken **left of centre**, and this is the choice the photograph forced: the browser's default centre-weighted crop of a landscape frame would keep the sky and lose the sign. `focusY` is null — take *every* row, because every row taken is a row the phone ladder does not have to invent. |

**Cropping sky is also a contrast decision.** The brightest region of a dusk
campus photograph is the sky, so every row of sky the landscape crop drops
lowers `scrim.requiredAlpha`, which is how much of the photograph survives the
scrim. It is the cheapest contrast headroom available here and it costs nothing
anyone will miss.

If the crops are wrong, either move a focal point (values-only, re-run) or set
the `window` override on that crop to an explicit `{top, bottom, left, right}`
fraction, which wins outright. Both are edits to the constants block at the top
of the generator; nothing below that block needs to change.

---

## What each file is

Two crops of the same photograph, each with its own ladder. The
`artDirectionBreakpointPx` in the manifest — **861** — is where `<picture>`
switches between them; a `<picture>` whose media query disagrees with the crop
the generator made is the failure that number exists to prevent, so read it from
the manifest rather than retyping it.

| file | what it is |
|---|---|
| `hero-p-<w>.avif` / `.webp` | portrait crop, phones and portrait tablets (≤ 861px) |
| `hero-l-<w>.avif` / `.webp` | landscape crop, everything wider |
| `hero-soft-p.webp` / `hero-soft-l.webp` | the **baked soft copy** — a few KB each |
| `hero-proof.webp` | the crop proof sheet; not shipped to users |
| `manifest.json` | the contract: srcsets, dimensions, budgets, the scrim requirement, the source hash |

**AVIF and WebP for every rung** so `<picture>` can fall back. AVIF is roughly
30% smaller at matched quality and is what almost every visitor receives; WebP
is the fallback for the shrinking minority without AVIF.

### The baked soft copy — the load-bearing trick

`filter: blur()` is **never animated**. It is evaluated at rasterisation, so
every engine that re-rasters the layer pays for it again; in the reference
implementation that measured **4.0–6.0× the frame budget with 96% of frames
over**. Instead, two stacked copies of the same background cross-fade by
**opacity alone** — GPU-composited and effectively free — and the blurred copy
is a bitmap baked here at build time.

`hero-soft-{p,l}.webp` are that bitmap. They reproduce
`blur(34px) saturate(.78) brightness(1)`; the manifest carries the exact filter
string as `soft.cssEquivalentFilter`. Note that `sigma` in the generator is
**half** the CSS pixel radius (a `blur(34px)` is a Gaussian of stdDeviation 17)
— desynchronising that pair is the obvious way to make the baked file stop
matching the filter it stands in for.

**Brightness is 1.0 here, where the reference ships 0.82.** That 0.82 was chosen
when the blurred layer was the *entry* state and its darkening was part of what
carried the copy's legibility; the reference's own header records that the duty
later moved to the scrim and 0.82 survives only as a vestige. Here, **legibility
is the job of the scrim and the grade, and nothing else** — both of which are
measured. A soft layer that quietly contributes darkening of its own would be a
third, unmeasured legibility mechanism, and the first time somebody re-tuned it
for looks the contrast would go with it.

1.0 does **not** mean "no tone". The soft copy is built from the **already-graded
pixels**, so it carries the same grade as every sharp rung; 1.0 means this layer
adds nothing further. That matters twice over:

- **The cross-fade stays a cross-fade.** If the sharp ladder carried the grade
  and the soft copy did not, the hero would visibly change brightness mid-scroll
  as one layer took over from the other.
- **One scrim still covers both layers.** Blurring is averaging, and an average
  over a window cannot exceed the maximum of the smaller-window averages inside
  it, so **the soft copy's brightest patch is bounded by the sharp copy's** and
  the scrim sized against the sharp frame is automatically sufficient for the
  soft one — whichever a given scroll state has on top.

⚠ That second guarantee depends on the grade being applied **before** the blur,
and that ordering is not free. **sharp does not honour call order** — it applies
geometry and blur first and colour operations last, so `.modulate().blur()` and
`.blur().modulate()` produce byte-identical output. Written as one pipeline you
get `grade(blur(F))`, the *wrong* order: the grade is a concave shoulder, so by
Jensen `grade(mean) ≥ mean(grade)` and the soft layer's patch can rise **above**
the sharp frame's, breaking the bound. The generator therefore **materialises
the graded frame to a raw buffer** before anything else touches it. The
generator also measures both patches and warns if the bound is ever violated, so
it is checked rather than argued.

---

## The ladder, and why rungs go missing

Candidate rungs are filtered against **the crop's own native width**, and the
script prints every deletion with its reason:

```
DROPPED  p-828   above the 640px native width of this crop — emitting it would upscale
DROPPED  l-1600  above the 1200px native width of this crop — emitting it would upscale
```

**Native width is the ceiling, and it is never crossed.** Upscaling invents
detail the master does not have, costs bytes to encode it, and still looks
softer than letting the browser interpolate for free. `buildVariant()` refuses
outright, and `verify-hero-assets.mjs` re-checks every emitted file against both
the crop's native width and the source's.

A separate **cap** (portrait 1280, landscape 1920) stops a very large master
producing rungs no box can use — a different rule pointing the same way.

Each orientation's **native rung** carries a mild edge-biased unsharp mask,
because that is the rung a retina display upscales at paint time; the smaller
rungs are downsamples and are already sharp for their box. The trigger is "this
rung was not resized", not a comparison against a constant, because the two
crops do not share a native width.

**The filename width is a promise.** `hero-p-640.avif 640w` in a srcset is what
the browser selects against, and it is taken from the filename. A file whose
pixels disagree with its name makes the browser pick the wrong rendition, and
nothing about it looks wrong in a diff — so the verifier decodes every file and
asserts declared width equals actual width.

---

## Byte budgets — enforced, not reported

Exceeding one **stops the run**. An asset pipeline that quietly ships a 500KB
hero is worse than no pipeline, because it looks like a gate.

| file class | budget | why |
|---|---|---|
| smallest portrait AVIF | 120 KB | low-DPR phones and data-saver clients |
| **any other portrait AVIF** | **200 KB** | **the file a DPR-2/3 phone actually paints — the LCP byte** |
| landscape AVIF | 280 KB | desktop: larger box, wider link, usually not the LCP element |
| any WebP | 380 KB | the fallback codec; ~a second of slow 4G, the whole LCP error budget |
| baked soft layer | 16 KB | not a budget, a tripwire for a mistyped `SOFT_LONG_EDGE` |

The middle row **fixes a flaw the reference pipeline's own header confesses**:
there, one tight budget was pinned to a single filename, `hero-p-640.avif`, and
the header admits that file is only selected at DPR ≤ ~1.5, so "the name has
been wrong about its own scope since it was written" — leaving the file a modern
phone actually downloads under a desktop-sized 380KB cap. Here the budget is a
function of what a file **is** (orientation, format, position in the ladder),
never of what it is called, and the phone's real LCP file has an LCP-shaped
number.

Quality ladders are walked **highest first** and the first rung that fits wins,
so "quality is as high as the budget allows" is a property of the run rather
than a number somebody typed. Dropping below the sanctioned floor (AVIF q55,
WebP q75) prints a warning naming the file: it means the master is heavier than
the ladder expects, and the real fix is a tighter crop or a smaller top rung.

**A passing run is not a measurement of LCP.** A byte budget is a necessary
condition; LCP is measured in a browser, on the deployed page.

---

## The contour check — a gate that was crying wolf, and why

The report's last column reads `contour (clean..gross, alarm)`. It is the
banding check, and it is worth explaining because **the version before it was
measuring the wrong quantity**, warned on four rungs of every run, and had been
cleared by eye twice — which is exactly how a team learns to ignore warnings.

It reported the **maximum** absolute per-channel encode error over the flattest
patch. Re-encoding this master's landscape crop across a quality sweep and
reading the whole error distribution over that same patch (184×104 px, 57 408
channel samples):

| quality | bytes | max\|d\| | p99\|d\| | mean\|d\| | **low-passed max\|d\|** |
|---|---|---|---|---|---|
| q85 | 295 KB | 40 | 8 | 1.56 | **2.73** |
| q75 | 195 KB | 42 | 10 | 1.87 | **4.97** |
| q60 | 158 KB | 43 | 11 | 2.01 | **5.48** |
| q40 | 120 KB | 60 | 11 | 2.18 | **5.89** |
| q20 | 78 KB | 75 | 13 | 2.42 | **7.84** |

Read the `max|d|` column. Collapsing quality from the sanctioned q85 to a q20
that visibly destroys the frame moves it by **1.9×**, and its value at *best*
quality is already **3.3× its own 12-level alarm**. It was not mis-tuned. A
maximum over 57 408 samples reads the **tail** of the codec's error
distribution, and that tail grows with patch area, not with banding — mean 1.56
and p99 8 against a max of 40 is one ringing pixel beside one edge.

**What banding actually is** is a low-frequency, spatially *correlated* error:
the encoder lands a region on one value and steps to the next a few pixels over.
So the statistic is the largest absolute 8×8 mean of the **signed** error.
Signed-then-averaged is the mechanism: contour errors reinforce, ringing and
quantisation noise cancel. That column spreads 2.73 → 7.84 over the same sweep —
monotone, 2.9×, clean floor. It also settles the question the old warnings
raised: at 2.73 on the shipped rungs, **there is no meaningful banding in this
frame, and all four warnings were false.**

**The threshold is calibrated per rung, not typed.** The numbers above are
calibration against *this* photograph, and hard-coding them would re-create the
same trap for the next one. Instead each rung is encoded twice more — once at a
quality that cannot band, once at one that certainly does — and the alarm sits
60% of the way from the first to the second. Per rung *and* per format, because
an 8×8 window covers more scene at 960px than at 1536px, the resample that made
the smaller rung has already low-passed it, and AVIF and WebP quantise
differently. If the two controls fail to separate, the check reports the frame
as **unjudgeable and stands down** rather than guessing.

This costs about 20s of the run (10 rungs × 2 control encodes). `gen:hero` is
on-demand and is not in `npm run verify` or the build, so the honesty is worth
the seconds.

⚠ **It still warns rather than fails** — divergence D in the generator header.
Calibration makes the number trustworthy; it does not make a wrong reading worth
blocking a build over.

**No dither is applied to the shipped rungs**, and that is now a measurement
rather than an omission: at 2.73 there is no contour to break up. Dither would
be warranted if a future master banded, or if a wide shallow ramp were ever
baked in — see the section on the plate edge for why one is not.

---

## Regenerating, and the determinism promise

```sh
node scripts/gen-hero-photo.mjs
```

**Deterministic** — the same source through the same sharp/libvips produces
byte-identical files, verified by running it twice and diffing. So a re-run
shows up in `git status` only when something actually changed, and re-running to
check is free. Two consequences of keeping that promise, both deliberate:

- `manifest.json` carries **no timestamp**. A `generatedAt` field would make
  every run produce different bytes. The commit carries the date.
- The proof sheet is drawn with **rectangles and no text**, because text would
  rasterise through whatever fonts the machine happens to have.

Re-run after changing the source, or after tuning any constant in the block at
the top of the generator: the crop windows, the candidate widths and caps, the
quality ladders, the sharpen, the byte budgets, the soft recipe, the grade, or
the art-direction breakpoint. Those constants are where the decisions live;
everything below them is mechanism.

⚠ **Changing the grade moves the scrim, in both directions.** `SHARP_TONE.warmth`
is a per-channel gain and red carries 21% of relative luminance, so a warm grade
on a photograph full of sodium lamplight *raises* `requiredAlpha` and eats the
headroom the brightness solve bought. The scrim is measured on the *graded*
pixels precisely so this cannot be missed — change anything in the grade, re-run,
and read the new number off the report.

---

## The grade — reversed, and pinned to identity

> ⚠ **READ THIS BEFORE THE SECTION BELOW.** The grade this section argues for
> **was built, shipped, measured and then removed.** `SHARP_TONE.brightness` is
> pinned to `1.0`; the generator prints `sharp tone: IDENTITY` and the manifest
> carries `grade.identity: true`. The arithmetic below is correct and worth
> keeping — it is why a *lighter scrim* is not available as a fix — but its
> conclusion is wrong, and the rest of this box is the correction.
>
> The solve minimises `requiredAlpha`, the veil the photograph *demands* under
> text. Contrast constrains the **composite**, not the source: the backdrop
> under a glyph may not exceed sRGB 38.28, and that ceiling does not move when
> the source moves. So the picture's surviving range under the text is
> `18.28 · g_max / (g_max − 20)`, which barely moves:
>
> | source peak `g_max` | 255 | 208 | 180 | 150 | 120 | 99 |
> |---|---|---|---|---|---|---|
> | minimum alpha | .922 | .903 | .886 | .859 | .817 | .769 |
> | **under text** (sRGB levels) | 19.8 | 20.2 | 20.6 | 21.1 | 21.9 | 22.9 |
> | **aperture peak** (sRGB) | 199 | 163 | 142 | 119 | 96 | 80 |
>
> The shipped solve landed `brightness: 0.222` — `g_max` 99. It bought **three
> levels** under the text and cost **119** in the aperture: the text-free
> margins and top strip that are the only place a photograph can actually be
> seen at AA. A net loss of about 40×, and on mobile, where there is no
> horizontal aperture at all, a pure loss.
>
> **The lever is the aperture, not the grade.** Do not re-enable the solve to
> chase `requiredAlpha`; size any future grade against the *aperture* row.

The cause of the original complaint is arithmetic, and it is worth stating
because it rules out the obvious fix in the other direction.

For `--fg-accent` #FF5252 to clear 4.5:1 (with the ×1.05 margin, 4.725:1) the
backdrop behind a glyph may not exceed relative luminance **0.019638** — a
neutral sRGB value of **38.3/255**. That ceiling is fixed by WCAG and by the
accent colour. No scrim alpha and no grade can raise it: **the brightest
glyph-sized patch of this hero is 38/255, always.**

Compositing is `C(V) = (1−a)·G(V) + a·22`. Pin the top to 38.3 and the whole
thing collapses to one identity:

```
C(V) = 22 + 16.3 · (G(V) − 22) / (G(Vpeak) − 22)
```

The available band is `[a·22, 38.3]`. Its **top is nailed down**; only its floor
moves, and the floor is `a·22`:

| scrim alpha | band | width |
|---|---|---|
| 0.93 | 20.5 – 38.3 | **17.8 levels** |
| 0.45 | 9.9 – 38.3 | **28.4 levels** |
| 0.00 | 0.0 – 38.3 | 38.3 levels |

At alpha 0.93 this master's entire 1st-to-99th percentile range — sky,
stonework, lamps, fountain — was compressed into **12.5 sRGB levels**. The veil
did not darken the picture; **it replaced it.**

**A lighter scrim is not available as a fix.** Alpha is not an input — it is
*solved* from the photograph's brightest patch. You cannot choose a lighter
scrim; you can only supply a photograph that *demands* one. Moving the darkening
into the image is the only lever:

```
grade the frame down -> its brightest patch falls
                     -> the solved alpha falls
                     -> the band's floor falls
                     -> the photograph's own structure survives
```

### What is applied

`.modulate({ brightness, saturation })`, once, to each native crop, **before any
resample** — the ladder and the baked soft copy both derive from those pixels,
so every rung and both scroll states carry the same tone. The manifest publishes
it under `grade`, and per-orientation under `orientations.{p,l}.grade`.

**`brightness` is solved at build time, not typed.** It is a multiplier on CIE
L*, bisected until the requirement *measured on the graded, sharpened, shipped
pixels* lands at or under `TARGET_SCRIM_ALPHA`. The solve runs on the exact path
the manifest is measured on, sharpen included — the retina sharpen raises local
maxima by design and moves the answer from 0.451 to 0.468 on this master, so
solving on an unsharpened proxy would publish a number about pixels nobody
paints. Set `SHARP_TONE.brightness` to a literal to pin it and skip the solve.

**Why `modulate` and not `linear` or `gamma`.** Measured on this master, both
crops, at a matched alpha of 0.50, scoring the *composited* result in CIE L*:

| grade | RMS contrast | local detail |
|---|---|---|
| none (shipped, a=0.925) | 1.79 | 0.272 |
| `.linear(m, 0)` | 2.37 | 0.343 |
| `.modulate({brightness:k})` | **2.55** | **0.425** |
| `.modulate(k)` + lift +6 | 2.42 | 0.412 |
| `.modulate(k)` + lift +12 | 2.25 | 0.390 |

`.linear()` is a straight multiply on *encoded* sRGB — it scales highlights and
shadows alike, so shadows go to mud. `.modulate({brightness})` multiplies CIE
L*, which in encoded terms is a **shoulder** (measured gain 0.30 at V=20 falling
to 0.236 at V=242): highlights pulled down harder than mids, which is what a
dusk scene wants. A lift was tested and rejected — against a pinned ceiling,
affine-in-L* trades lift for slope, and the band is 28 levels wide.

⚠ **`.gamma()` is unusable, and not a near miss.** sharp's `gamma(g)` defaults
`gammaOut` to `g`, so it darkens by `1/g` and re-brightens by `g` — a round trip
that is identity *except that it clips shadows to zero*. Verified on a 0..255
ramp: `.gamma(3.0)` maps both 20 and 40 to 0.

**Saturation is bounded by measurement and settled by eye.** `modulate` scales
L* and leaves chroma alone, so darkening inflates colour. Averaging chroma per
lightness over the *whole* composited frame is the wrong metric — the near-black
majority of a dusk frame carries no visible colour and drags any whole-frame
mean toward agreement. Restricted to the brightest half, against the master's
own 0.801: saturation 1.00 is ×1.73 (visibly maroon), 0.80 is ×1.44, 0.60 is
×1.12 (visibly washed out). It is not driven to ×1.00 because a colorimetric
match at a fraction of the lightness reads as drained (the Hunt effect) — some
inflation is the correct compensation. 0.80 is where the ivy stops reading
maroon while the brick stays crimson.

### Turning it

**Only if the grade is unpinned first**, which the box at the top of this
section says not to do. `TARGET_SCRIM_ALPHA` is then the one number to turn.
Structure improves monotonically as it falls, with sharply diminishing returns
(RMS contrast vs the flat veil):

```
a=0.80  x1.14      a=0.50  x1.43
a=0.70  x1.25      a=0.45  x1.46   <- shipped
a=0.60  x1.35      a=0.40  x1.51
a=0.55  x1.38      a=0.30  x1.60
```

⚠ **`--scrim-floor-min` can override the whole thing, silently.** The floor in
`components/site/hero-scrim.module.css` is a clamp *floor*, so it can only
darken the veil — which is why raising it can never invalidate the measurement,
and why the manifest publishes the clamped value. But a floor above the measured
requirement throws the grade away: the page paints a graded-dark photograph
under a veil sized for an ungraded one, which is the black rectangle again, with
every gate still green because darker always passes. **The generator warns when
this happens** — it is the only place both numbers are in scope.

---

## Why the plate edge is not an asset problem

> *"why does it still has this black part around the text? … it feel like it
> just cut of overlap on top the background image … look square over"*

He is right, and the rectangle is real. This section is the measurement of it,
the local grade that was built to fix it, and why that grade is **not shipped**.

### The rectangle, located

The composite was reproduced offline from the shipped rungs plus the literal
stops in `components/site/hero-scrim.module.css` — the two gradients, the mask,
the `cover` mapping and the flattening `A = a_pocket + a_field(1 − a_pocket)`.
It agrees with `check-hero-contrast`'s VISIBILITY table (*under text sRGB
22..34*), so it is the same surface both are talking about.

At 1600×900 the dark region has three straight edges, and each one is a stop in
that stylesheet, not a property of the photograph:

| edge | at | what puts it there |
|---|---|---|
| left | x = 256 | `--scrim-open`, where the mask reaches full opacity |
| right | x = 1344 | `100% − --scrim-open` |
| top | y = 122 | `--hero-headroom + --spacing-band − 18px` |

Below **1088px** `--scrim-open` is `0`, so the left and right edges do not
exist — the pocket is full-bleed and the only edge is the top one. That is why
the complaint reads as *square* on a laptop and as a *horizon line* on a phone.

### The plate is two cues, and only one is luminance

**Luminance.** The step the mask reveals is `|∂A/∂x| · (P − G)` — the alpha's own
gradient times how much brighter the photograph is than the ground. This is the
cue an image can attack, by lowering `P` toward `G` before the mask gets to it.

**Texture.** Local RMS contrast scales as `(1 − A)`, and `A` runs 0.24 → 0.9468
across the mask. The photograph's texture is therefore **divided by 14 in about
a hundred pixels**, measured across the 1600px frame in sixteen bands (plate
edges fall at bands 2.6 and 13.4):

```
13.0 16.7  2.8  1.2  1.1  1.1  0.9  1.3  1.5  1.5  1.5  1.0  1.1  2.5 10.9 13.7
          ^^^^ ^^^^                                          ^^^^ ^^^^
```

**`(1 − A)` is a multiplier, and nothing in an image file can change a
multiplier.** This pipeline can lower texture further; it cannot soften the
ratio. That single sentence is the whole finding.

### What was built, and what it bought

A baked veil — a mix toward `--ground`, not a brightness multiply, so it is a
third term in the same additive stack (`A = a + (1 − a)m ≥ a`, so it can only
ever *raise* contrast and no gate can be broken by it). Quintic smootherstep, so
it has zero first **and** second derivative at both ends and cannot Mach-band.
Ordered dither. Geometry in crop fractions: vertical for the portrait crop,
both axes for the landscape one.

On the luminance cue it works:

| viewport | edge_x before → after | edge_y before → after | aperture peak |
|---|---|---|---|
| 1600×900 | 0.55 → **0.21** (−62%) | 1.38 → 1.23 (−11%) | 148 → 145 |
| 1280×800 | 1.35 → **0.53** (−61%) | 1.56 → 1.37 (−12%) | 145 → 143 |
| 1088×800 | *no horizontal aperture* | 1.91 → 1.73 (−9%) | 141 → 140 |
| 861×1000 | *no horizontal aperture* | 1.29 → **0.13** (−90%) | 136 → 130 |
| 375×812 | *no horizontal aperture* | 1.53 → **0.26** (−83%) | 116 → 104 |

Real reductions, and — unlike the global grade — the aperture's **peak** is
almost untouched (−2% to −9%, against the grade's −60%).

### Why it is not shipped

The metric was measuring half the cue. Re-measure the texture bands with the
veil applied:

```
shipped   13.0 16.7  2.8  1.2 ... 1.1  2.5 10.9 13.7
veiled    11.2  8.8  1.0  0.4 ... 0.4  0.9  5.7 11.8
```

The cliff is still there — 8.8 → 1.0 instead of 16.7 → 2.8 — the **ratio across
it got slightly worse**, and the absolute texture inside the pocket fell by 3×.
Rendered side by side the veiled frame is plainly worse: it trades a visible
luminance step for flat ink beside a lit tree, which is also an edge, and one no
luminance metric can see. **The veil buys a smaller step by deleting the detail
whose disappearance is the other half of what the eye reads.**

So the pipeline ships identity on this axis too, and the finding is recorded
rather than the code.

### Independently confirmed by `scripts/check-hero-blend.mjs`

That gate landed separately and reaches the same conclusion from the opposite
direction. It measures the veil **over a flat neutral field with the hero's
content hidden**, so every gradient it sees belongs to the veil alone — and it
still fails at all four viewports (3.0× to 3.8× over its limit). Two
consequences, and both matter here:

- **The edge is entirely the stylesheet's.** A gate that cannot see the
  photograph still finds the edge.
- **Nothing in this pipeline can move that gate**, in either direction. A baked
  veil would be invisible to it — which is also why the veil rejected above
  cannot have broken it, and why "bake something to make §2 pass" is not a
  request this pipeline can honour. ⚠ It would also make the *page* worse while
  the gate went green, because that gate measures luminance and the texture
  cliff is the other half of the cue. Do not ask for it.

Its requirement is a span: a smoothstep carrying `dL*` needs `10.5 × dL*` CSS
pixels, and the floor-to-crest transition is `dL* = 33.4`, so **about 350px** —
outside the text extent, or `check-hero-contrast` takes it back. Set against the
span this layout actually has (text extents measured on the rendered page,
`--spacing-band` 72→140px, `--hero-headroom` 120→200px below the page measure
and **0 above it**):

| viewport | horizontal, to the last glyph | vertical, `headroom + band` |
|---|---|---|
| 1600×900 | **300px** | 140px |
| 1280×800 | 140px | 140px |
| 1088×800 | ~44px (the gutter) | 109px |
| 768×1024 | ~35px (the gutter) | **277px** |
| 375×812 | 20px (the gutter) | 243px |

**Nothing reaches 350px.** The span is not constructible from the current
tokens, which is why this is a geometry problem and not a tuning one.

### The contract this hands to `hero-scrim.module.css`

The blend is owned by the pocket's geometry. Three things, in order of measured
value:

1. **The pocket is a masked rectangle.** Its mask is a *linear* alpha ramp, so
   it has a corner at each end — a second-derivative discontinuity, which is
   precisely the Mach-band cue. A quintic ease over the same distance costs
   nothing and removes the corners. A **radial or elliptical** pocket, the way
   the reference does it, removes the straight edges as well; the owner's word
   was *square*, and an ellipse is not square. The opaque core must still cover
   every glyph — softness lives outside the text extent, never inside it.

2. **`--hero-headroom: 0px` above 1088px is expensive, and this is measured.**
   Setting it to 140px at desktop moves the plate's top edge onto a darker part
   of the frame:

   | | 1600×900 | 1280×800 | 1088×800 |
   |---|---|---|---|
   | edge_y today | 1.38 | 1.56 | 1.91 |
   | + desktop headroom | 0.77 | 0.87 | 1.06 |
   | + headroom **and** the baked veil | **0.12** | **0.13** | **0.16** |

   and the aperture's peak goes **up**, not down (148 → 150, 145 → 147,
   141 → 145). Neither half gets there alone: the veil alone buys ~10% on this
   edge, headroom alone ~45%, together **91%**. If headroom lands at desktop,
   re-open the baked veil — the numbers above are the ones to re-measure
   against, and the harness that produced them is described below.

3. **Below 1088px there is no horizontal dead space at all**, so no horizontal
   falloff is constructible at any width a phone or small laptop uses. The
   vertical axis is the only lever there, which is what `--hero-headroom`
   already is. This is a fact about `.wrap`, not a gap in this pipeline.

Only two tokens can supply the missing span, and both cost something this
pipeline can price:

- **`--hero-headroom`.** It is the only span in the table with room to grow, and
  at ~350px it supplies the whole requirement on the *vertical* axis at every
  viewport — the one axis that exists at all widths. It costs layout, not
  picture: the aperture's peak went **up** in the desktop measurement above.
- **A lighter crest, which shortens the transition instead of lengthening the
  span.** The span needed scales with `dL*`, so a shallower floor-to-crest drop
  needs less room. At 1600 horizontal the available span is 300px against 350
  needed — closing that needs `dL*` 33.4 → 28.6, i.e. the crest at about **43%**
  rather than 24%. That is a real cost in aperture peak (roughly sRGB 199 → 155
  on a white pixel) but it is a fifth of what the reversed global grade spent,
  and unlike the grade it buys something. The aperture peaks this pipeline
  measures per viewport — 148 / 145 / 141 / 136 / 116 — are the currency to
  price it in.

### Reproducing the numbers

For the **luminance** cue, use `scripts/check-hero-blend.mjs`; it is the
committed instrument, it proves itself against a synthetic plate and a synthetic
radial, and its numbers are the ones to argue with.

The **texture** cue has no committed script, deliberately. It is a diagnostic of
the *composite* — the stylesheet's surface, not the asset's — and putting layout
geometry into this generator is the coupling the baked veil was rejected for. It
needs four things: the shipped rungs, the literal stops from
`hero-scrim.module.css`, `cover` with `object-position: 50% var(--hero-pos-y)`,
and the flattening `A = a_pocket + a_field(1 − a_pocket)`. Then measure windowed
RMS contrast in bands across the plate edge. Do **not** use a raw per-pixel
derivative of the composite for either cue: it maxes out on a street lamp and
reports nothing about the veil.

---

## Round six: the edge is not where anyone was measuring it

> *"i still feel that there is a blurry dark black box around the text that is
> cover over the background image in the back"*

Five rounds sized the falloff against the **mean** luminance step across the
pocket boundary. That number is small — about 10 L\* — and it is the wrong
number, because

```
step(P) = L*(P, α_gutter) − L*(P, α_core)
```

is strongly **convex in the source pixel P**. A mid-grey pixel crossing the
boundary barely moves; a lit window moves five times as far. Measured down the
landscape crop's boundary column, core 0.8656 → gutter 0.25:

| statistic over the column | dL\* |
|---|---|
| mean | 2.1 … 9.8 |
| p50 | −2.1 … 4.7 |
| **p95** | **24.1 … 44.4** |
| max | 50.2 … 51.8 |

An edge is found by the eye wherever it is strongest, not on average. **The p95
is the design number.** Under the round-five result — a smoothstep carrying
dL\* over span *S* peaks at `1.75 · 6 · dL* / S`, so one JND needs
`S ≥ 10.5 · dL*` — the requirement is four to five times what any previous round
believed.

### Two findings, and the second is the constraint

**The two boundaries are not symmetric, and nobody had said so.** At 1280 the
left jamb costs p95 24.1 and the right costs 44.4 — the right edge is nearly
twice the left, because the right half of this crop is the bright half.
Per-column p90 source luma, sixteen bands across the landscape crop:

```
band    0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15
p90    63  124  101   89  101   90   79  123  130  153  161  149  144  145   86  139
```

The plate the owner sees is **lopsided**. Its right edge is the loud one.

**And the asymmetry cannot be crop-solved away.** At 1280 there are 597px of
horizontal overflow to spend on `--hero-pos-x`, so the obvious move is to slide
the frame until a dark column sits under each boundary. Swept from 20% to 80%,
the worst boundary cost moves from **4.62× its budget to 4.86×** — a 5% range
over the entire travel, with 50% neither the best nor the worst. There is no
framing of this photograph that puts dark material under both edges at once.

**So the span is the only variable left**, and that lives in the stylesheet.

### What the manifest now publishes: `orientations[k].washRelay`

Per crop, per candidate gutter alpha, the p95 L\* step along sixteen columns (a
**vertical** boundary) and sixteen rows (a **horizontal** one), plus
`spanAtOneJndPx = 10.5 × the worst of both`:

| gutter α | worst dL\* (l) | span needed | gutter at 1280 | at 1600 | ≤1088 |
|---|---|---|---|---|---|
| 0.25 | 45.8 | 482px | 96px | 256px | 0px |
| 0.35 | 38.8 | 408px | 96px | 256px | 0px |
| 0.45 | 31.7 | 333px | 96px | 256px | 0px |
| 0.55 | 24.4 | 256px | 96px | 256px | 0px |
| 0.65 | 16.8 | 177px | 96px | 256px | 0px |
| 0.75 | 9.0 | 95px | 96px | 256px | 0px |

Both axes are published because below 1088px `--scrim-open` is zero: the pocket
is full-bleed and **every edge a phone can show is horizontal**. A relay of
columns alone would be silent about most viewports. On the landscape crop the
worst *row* is row 0 — 46 dL\* at α 0.25 — which is the crest seam, so the crest
is as expensive as either jamb and has 122px of headroom to spend rather than 96.

Indices are **crop fractions**, not CSS pixels. Mapping a CSS coordinate into a
crop column is `object-fit: cover` arithmetic that changes with every viewport,
and it belongs to the stylesheet; this pipeline must not guess where the
boundary is.

### `requiredAlpha` is now measured on the bytes a browser downloads

It used to be measured on `working` — the graded, sharpened, downsampled **raw**
frame, one step before the encoder. A lossy codec is free to move a patch mean:
ringing around a specular highlight lands energy in neighbouring pixels, and a
glyph-sized box mean is exactly the statistic that integrates it.

| rung | pre-encode | shipped | drift |
|---|---|---|---|
| `hero-l-960.avif` | 0.832 | **0.834** | +0.002 |
| `hero-l-960.webp` | 0.832 | 0.833 | +0.001 |
| `hero-l-1280.avif` | 0.832 | 0.833 | +0.001 |
| `hero-l-1280.webp` | 0.832 | 0.833 | +0.001 |
| `hero-l-1536.*` | 0.832 | 0.832 | 0.000 |
| `hero-p-640.avif` | 0.852 | 0.850 | −0.002 |
| `hero-p-819.*` | 0.852 | 0.852 | 0.000 |

Two thousandths, and small in the **wrong direction**: the published number was
a claim about a file nobody downloads, and it understated what the downloaded
file needs. It is also not uniform — the *smallest* landscape rung drifts most,
because it carries the most resampling and the fewest bits, and it is the rung a
960px viewport actually gets.

Nothing was ever unsafe: `--scrim-floor-min` clamps the relay up to 0.86, above
both numbers. But this drift is exactly what the ×1.05 engineering margin exists
to absorb, and a margin silently spending itself on a measurement error is a
margin nobody can size. The solve now decodes **every emitted rung** and
publishes the worst; `scrim.preEncode.drift` keeps the gap visible.

### A baked luminance roll-off: **no**, and this time on geometry

Round three rejected a baked local grade on the texture argument — local RMS
contrast scales as `(1 − A)`, so an image-side veil can only *lower* texture,
never soften the ratio across the boundary. That argument still holds and is
still the deepest one. Round six adds an independent and simpler one, which
matters because it kills the idea even for a frame where the texture argument
did not apply.

**A baked shape cannot track the reading measure, because `object-fit: cover`
moves the image relative to the text.** One crop fraction is `dispW` CSS px, and
both `dispW` and its origin change with the box aspect:

| viewport | crop | frame box | `dispW` | x-overflow | measure edges as crop fractions |
|---|---|---|---|---|---|
| 375×812 | p | 375×1072 | 857 | 482 | 0.2813 … 0.7187 |
| 390×844 | p | 390×1114 | 891 | 501 | 0.2812 … 0.7188 |
| 768×1024 | p | 768×1285 | 1028 | 260 | 0.1264 … 0.8736 |
| 861×1000 | l | 861×1320 | 2347 | 1486 | 0.3165 … 0.6835 |
| 1280×800 | l | 1280×1056 | 1877 | 597 | 0.2102 … 0.7898 |
| 1600×900 | l | 1600×1188 | 2112 | 512 | 0.2424 … 0.7576 |

Bake the left edge at the one fraction that is correct at 1600 (0.2424) and it
lands **60px inside the gutter at 1280 — 17px past the first glyph** — and at
**−174px at 861**, off the screen. Author it for 1280 instead and it misses by
68px at 1600 and by 249px at 861. There is no fraction that is right at more
than one viewport, and authoring per rung does not help: `srcset` picks a rung by
**density**, not by viewport, so a 1.5× screen at 861 downloads the 1280 rung.

Three further nails, each independently fatal:

- **The scroll zoom.** `.bg` runs `scale(1 + 0.14 · --focus)` about `50% 36%`
  while the copy does not scale. At 1280 the left measure edge is 544px from
  the origin, so a baked edge there **slides 76px outward** across the scroll
  while the text stays put.
- **The photograph does not reach the text.** `.frame` is `min(100%, 132svh)`.
  At 375×812 the picture stops at y = 1072 and the copy runs to y = 1614 —
  **542px of text with no photograph under it at all** (438px at 390, 123px at
  1280). A baked vertical ramp physically cannot cover the lower copy on a
  phone.
- **It would couple the asset to the layout.** Every future change to
  `--container-wrap`, `--spacing-gutter`, `--hero-headroom` or the art-direction
  breakpoint would silently invalidate the bytes, with no gate able to see it.

The wash is the stylesheet's, entirely. This pipeline's contribution is the
measurement it is designed against, which is what `washRelay` now is.

### Dither in the encoder: **no**, and the codec is why

A wide shallow ramp in 8-bit bands, so the standing suggestion was ordered or
blue-noise dither at encode time. Measured on the flattest 48×48 patch of each
shipped rung — the region most able to band — the source already carries
**2.4 … 3.0 sRGB levels of standard deviation**, most of it codec noise. Under
the veil that becomes:

| rung | source sd | α 0.45 | α 0.60 | α 0.75 | α 0.8656 |
|---|---|---|---|---|---|
| `hero-l-1536.webp` | 2.88 | 1.62 | 1.16 | 0.75 | 0.43 |
| `hero-l-1536.avif` | 2.98 | 1.67 | 1.22 | 0.77 | 0.43 |
| `hero-l-1280.avif` | 2.42 | 1.35 | 0.99 | 0.63 | 0.31 |
| `hero-p-819.avif` | 2.60 | 1.48 | 1.10 | 0.65 | 0.52 |

Breaking a one-level contour needs roughly half a level of noise. Across the
whole range the new wash would occupy — α 0.45 to 0.75 — the composite carries
0.63 to 1.67, so **the quantiser is already dithered by the encoder's own
noise**. The only region that drops under half a level is the fully-dark core at
0.8656, which is under the text and is not looked at. Adding dither would cost
bytes on every rung to fix a defect that is not there.

The CSS gradient's own alpha quantisation cannot band either, and the arithmetic
is worth writing down because it is the number to re-check if the wash grows: a
gradient carrying Δα over span *S* steps every `S / (255·Δα)` px. At 1280 that
is 0.9px per step over the 140px frame-scoped span, at 1600 1.9px. Mach banding
needs treads of roughly ten pixels, so **banding becomes possible only once the
span exceeds about `255 · Δα` px** — around 150px per 0.6 of alpha. Every
geometry currently on the table is an order of magnitude clear of it.

### The contour check is calibrated, and the four warnings are gone

The four uncalibrated banding warnings were retired when the statistic was
replaced (see *The contour check — a gate that was crying wolf*). It now
calibrates **per rung and per format** at build time, between a clean control
and a gross one, and alarms only when a shipped rung sits closer to the broken
end. On this master every rung reads 1.83 … 4.00 against alarms of 3.46 … 6.38.
It fires on nothing, and it would fire on something.

### Reproducing round six

The wash relay is in the manifest and printed by the generator. The three
verdicts above were reached with throwaway harnesses over the shipped rungs plus
`TEXT_EXTENT` from `scripts/check-hero-contrast.mjs`, and each is one short
script: the cover mapping needs only `.frame`'s `min(100%, 132svh)` and
`.focal`'s `object-position`; the dither table needs only the flattest patch and
the composite; the `--hero-pos-x` sweep needs the cover mapping plus the p95
step per column, which `washRelay` already publishes.


---

## Round seven: the veil is priced by its maximum and paid for by its area

The owner's own words, pointing at his hero: *"this top part is clear but then
the rest is black out dark see through sheet over the text"*, and then the
question six rounds never asked — *"why can't we design the text so it blends
into the background, instead?"*

He is right, and the reason he is right is now a measurement rather than an
argument.

### The number that settles it

`gen-hero-photo.mjs` publishes one figure for the veil: `scrim.requiredAlpha`,
the brightest glyph-sized patch anywhere in the crop, solved to 4.5:1. On this
master that is **0.834** (landscape) / **0.838** (portrait). It is correctly
derived and it has never been wrong.

It is also a MAXIMUM, and nothing in this repo has ever said how many places
attain it. Now something does — the DEMAND PROFILE, measured inside the text
extent, in the band box's own CSS pixels, at the cover scale the browser
actually paints:

| viewport | p50 | p75 | p90 | p99 | max | needs nothing | >0.60 | >0.80 |
|---|---|---|---|---|---|---|---|---|
| 375x1685 | 0.000 | 0.017 | 0.642 | 0.740 | 0.838 | 74.6% | 11.7% | 0.1% |
| 390x1624 | 0.000 | 0.000 | 0.627 | 0.743 | 0.838 | 75.3% | 11.0% | 0.1% |
| 768x1285 | 0.000 | 0.000 | 0.476 | 0.760 | 0.844 | 76.9% | 6.1% | 0.2% |
| 861x1324 | 0.000 | 0.000 | 0.532 | 0.778 | 0.844 | 75.4% | 8.0% | 0.4% |
| 1280x1306 | 0.000 | 0.000 | 0.481 | 0.763 | 0.834 | 75.4% | 6.2% | 0.2% |
| 1600x1338 | 0.000 | 0.000 | 0.479 | 0.758 | 0.832 | 75.8% | 6.0% | 0.1% |

**Three quarters of the text region needs no darkening at all.** Six per cent
needs more than 0.60. **Between one and four parts in a thousand need more than
0.80** — and that is the part the whole band is currently being darkened for.

That is the complaint, in numbers. `check-hero-contrast`'s own VISIBILITY table
says the same thing from the other side: at 1280 the crest strip spans **137
sRGB levels** and the text column spans **33**. The crest strip is not better
photographed. It is the same photograph with a quarter of the veil on it.

### What this does and does not license

It does NOT license thinning the flat scrim. 0.834 is still the honest price of
a flat sheet, because a sheet is priced by its worst patch, and the worst patch
is real. **`requiredAlpha` remains the floor and nothing may go under it.**

It licenses not using a sheet. A treatment whose cost follows the INK — a
per-glyph halo, a paint-order stroke — pays the same 0.834 over a few hundred
square pixels per glyph instead of over 1280x1306. The distribution is what
makes that a provable trade rather than a hopeful one, which is why it is in
`manifest.json` under `<orientation>.demand` and not only in this file.

That work lives in `components/` and in the gate, not here. **The gate must be
taught to measure the composited result including any per-glyph treatment** —
a shadow painted BY the text does not change what a sampler sees behind it, so
a naive backdrop sample would report failure on a page that is genuinely
legible. Until it can, this pipeline's numbers are the evidence, not the
permission.

### Three image-side levers, evaluated and all three declined

**The crop — declined, it is already optimal.** `focusY` has only 160px of
travel on this master (16:9 of 1536x1024 leaves 160 rows spare), and 0.62 is
already saturated against the bottom stop. Sweeping it toward more sky — which
is what the crest strip is, and so the intuitive move — makes it **four times
worse**: the share above 0.60 goes 6.2% → 24.6% while the maximum does not move
and the aperture does not improve. The sky is the bright part; the crest strip
reads clean because the veil there is 0.25, not because the sky is kind. On
portrait, `focusX` 0.267 would buy p99 0.743 → 0.702 and cost the aperture
0.310 → 0.212 and clip the illuminated sign, which is the subject. **No change.**

**Baked local smoothing under the text — declined, it is a sheet by another
name.** A treatment baked at encode time must cover the UNION of where the copy
lands across viewports, because the pixels ship once and the layout does not:

| crop | union | intersection | of the treated area, not text at some viewport |
|---|---|---|---|
| landscape 1536x864 | 39.5% of crop | 24.9% | 37% |
| portrait 819x1024 | **60.6% of crop** | 19.9% | **67%** |

The portrait text extent swings from x 0.36..0.64 at 390 to x 0.15..0.85 at 768,
so de-texturing "where the copy sits" de-textures 61% of the phone crop, two
thirds of which is open picture at some other width — permanently, in the bytes,
where no stylesheet can lift it. That is strictly worse than the sheet it
replaces. **No change.**

**Dither and the banding warnings — nothing to do; already calibrated.** The
contour check is self-calibrating from two control encodes per rung, and every
rung now reads inside its own derived alarm (worst margin: `hero-l-1536.webp` at
4.00 against 5.89, clean control 3.38). The four warnings this file used to
carry are gone because the statistic was fixed, not because a threshold moved.
No wide shallow ramp survives that would need dither. **No change.**

### One dial that is free, published rather than chosen

At every reference viewport, on both crops, `object-fit: cover` lands the crop's
HEIGHT exactly on the band and overflows on WIDTH — 1042px of slack at 1280,
909px at 390. So vertical framing is already fully determined and
`object-position` X is a real, previously unmeasured parameter that costs no
bytes and no re-encode.

It is a trade, not a win, and it is published (`demand.viewports[].positions`)
so the stylesheet can choose with numbers. The landscape crop at 1600x1338,
which has 779px of horizontal slack and none vertical:

| object-position X | p90 | p99 | max | share >0.60 | aperture p99 |
|---|---|---|---|---|---|
| 0% | 0.325 | 0.726 | 0.821 | 3.5% | 0.4239 |
| 25% | 0.415 | 0.749 | 0.832 | 4.5% | 0.4965 |
| 50% (cover default) | 0.479 | 0.758 | 0.832 | 6.0% | 0.5417 |
| 75% | 0.513 | 0.761 | 0.837 | 7.0% | 0.5677 |
| 100% | 0.529 | 0.761 | 0.836 | 7.3% | 0.6113 |

Left lowers the demand and darkens the picture; right does the reverse; the
maximum barely moves. **The generator does not pick — `object-position` lives in
the stylesheet.** A generator that silently assumed one would be publishing a
crop that does not exist.

### The summary a future round should not have to rediscover

The photograph is not the problem and re-framing it is not the fix. The pixels
under the copy are already dark — median local ground **L\* 14** against a
ceiling of **L\* 24.4**. The hero is dim because a flat veil is sized by its
worst patch and charged over its whole area, and on this master that ratio is
about **500:1**. Move the darkening onto the letterforms and the same contrast
is bought for a five-hundredth of the picture.

---

## What the verifier checks

`node scripts/verify-hero-assets.mjs`

| source | manifest | result |
|---|---|---|
| absent | `present: false` | **pass** — the shipping state |
| absent | missing | **pass**, with a note on how to commit the placeholder |
| absent | `present: true` | **pass** with a warning — freshness unverifiable, everything else still checked |
| present | missing | **fail** — a master nobody has processed |
| present | `present: false` | **fail** — the manifest ignores a photograph sitting next to it |
| present | hash mismatch | **fail** — *the staleness case*, invisible by eye |
| present | hash match | every file checked: exists, byte size, byte budget, declared-vs-actual width, no-upscale, no orphans, srcsets reference files that exist |

The staleness case is the one that matters. When the source changes, every
variant, both crops, both baked soft layers **and the measured scrim alpha** all
describe the old image — and nothing about that is visible in a diff or on the
page until someone reads an eyebrow against a bright sky.

---

## Provenance

Record it here when the photograph is installed — what it depicts, who took it,
and whether the repo has the right to publish it. A Seattle University campus
photograph is not automatically the owner's to use: if it was taken by someone
else, or is university marketing material, that is a licensing question and not
a technical one. The reference pipeline's directory carries the same section for
the same reason.

| | |
|---|---|
| **Source file** | *(none installed)* |
| **Depicts** | — |
| **Photographer / origin** | — |
| **Rights / licence** | **UNRECORDED** |

Seattle University's own marks (`seattle_university*.png`) live one directory up
and are covered by `public/brand/README.md`; they are institutional marks and are
not to be regenerated, resampled or re-cropped.

---

## `.gitkeep`

Belt and braces. This README and `manifest.json` already keep the directory
present in git, but the generator writes here on a clean checkout and `.gitkeep`
means that stays true even if both of those are ever moved.
