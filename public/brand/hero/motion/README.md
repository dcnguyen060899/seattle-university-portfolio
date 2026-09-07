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

`manifest.json` is committed in the absent state (`present: false`) so the
component can read it unconditionally and branch on one boolean, exactly like
the still's manifest one directory up. Right now it is `present: true`:
`hero-loop-1813504d.mp4` is a transcode of the Seedance 2 master under
`brand-masters/` (git LFS), made with the ffmpeg recipe in the hero README
(**Round two**), and it passed all ten checks. The clip still renders only when
`NEXT_PUBLIC_HERO_MOTION` is set at build (`on` needs the corpus record
verified; `preview` is localhost-only) — an installed clip and a shipped one
are different states on purpose.
