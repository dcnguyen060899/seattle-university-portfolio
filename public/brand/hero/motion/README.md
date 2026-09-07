# Hero motion — the living background's asset directory

Everything in this directory except this file and `manifest.json`'s absent state
is **written by one command and nothing else**:

```sh
node scripts/check-hero-motion.mjs --install --clip <master.mp4>   # npm run gen:hero:motion -- <master.mp4>
```

It refuses any clip that fails the harness, copies a passing one to
`hero-loop-<sha8>.mp4` (the eight hex are the file's own sha256 prefix — the
only thing that makes an `immutable` cache header honest), and rewrites
`manifest.json` with `present: true`, the file's bytes and hash, its probed
dimensions, duration, codec and faststart state, the registration crop, the
opacity cap and the harness verdict.

**Nothing here is ever deleted by a script.** `scripts/verify-hero-assets.mjs`
reports a stray or an orphan and fails the build; a human removes it.
`scripts/gen-hero-photo.mjs`'s sweep is regex-scoped to the still's own rungs
and does not see this directory — do not "fix" that sweep into a wildcard.

The whole argument — the layer, the loop, the gates, the record — is in
`public/brand/hero/README.md` under **The motion layer**, and the code is
`lib/hero-motion.ts` and `components/site/hero-motion.tsx`.

`manifest.json` was committed in the absent state (`present: false`) so the
component can read it unconditionally and branch on one boolean, exactly like
the still's manifest one directory up. Right now it is `present: true`:
`hero-loop-2a6d26e4.mp4` is a ONE-WAY clip WITH A NIGHT TAIL: 44.63 s of
sunset falling into a deep blue Seattle night, made from three Seedance 2
masters under `brand-masters/` (git LFS) dissolved together and graded in a
single pass — see the hero README, **Round six** for why the nightfall is a
colour grade and not something the model was asked for, and **Round seven**
for the water, the four-second pop that was our own encoder, and the tail.
`manifest.json` records `loop: false` with `loopFrom: 29.8333`, so the layer
plays it through once and then loops its last 14.79 s of night for ever,
starting at the sunset again only on the next page life; SEAM is judged at
that wrap rather than at frame 0. It passed all eleven checks. Since 2026-09-06 the clip
renders on every build of main: the owner approved the disclosure line and the
corpus record is verified, so `NEXT_PUBLIC_HERO_MOTION` unset is `on`, `off`
is the deploy-side kill switch, and `preview` (localhost-only) exists for a
next clip whose record is still open. An installed clip and a shipping one are
still different states on purpose — the record, not the installer, is what
makes the second.
