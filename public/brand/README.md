# public/brand — Seattle University marks

Copied byte-for-byte from `public/docs/images/` on 2026-09-02 (Addendum B, ruling
R-14). They live here because `public/docs/**` is the frozen legacy site and the
new site must not reach into it for a shared asset — a URL that both the archive
and the live homepage depend on cannot be frozen and current at the same time.

Do not regenerate, resample or re-crop these. They are institutional marks.

| file | served at | pixels | bytes | md5 | what it is |
|---|---|---|---|---|---|
| `seattle_university.png` | `/brand/seattle_university.png` | **381 × 132** | 8,481 | `c11119b6ac4d944a719856af391db70f` | wordmark, wide |
| `seattle_university_logo.png` | `/brand/seattle_university_logo.png` | **673 × 165** | 34,902 | `8a58624e3873aa0424743e6f8ff670ad` | horizontal lockup — widest of the three, aspect ≈ 4.08 : 1 |
| `seattle_university_seal.png` | `/brand/seattle_university_seal.png` | **360 × 364** | 71,464 | `9534142f7bd8c7e0638a227d3b087b0d` | seal, effectively square (aspect ≈ 0.989 : 1) |

**The aspect ratios are the thing to check before writing `Mark.tsx`.** They are
not interchangeable: the lockup is 4.08:1 and the seal is 0.989:1. A component
that renders both through one fixed box will distort one of them, and `next/image`
will warn about a missing dimension either way. Give each rendition its own
intrinsic `width`/`height` from the table above.

## Favicon

`public/favicon.ico` — 16,408 bytes, 128 × 128, md5 `b75b566b464a4ce802c23d9e2a07ffc5`.

Verified 2026-09-02: `public/docs/seattleu_2.ico`, `public/docs/seattleu.ico`,
`public/docs/favicon.ico` and the old repo-root `favicon.ico` are **all the same
file** — one md5, one byte count. So "keep the `seattleu_2.ico` lineage" and
"keep the existing favicon" are the same instruction, and `/favicon.ico` is
byte-identical to what the domain has always served. Nothing was regenerated.

`public/favicon_2.ico` — 56,556 bytes, a different icon, copied from the repo
root so `/favicon_2.ico` keeps resolving (it is a live 200 on GitHub Pages today).

## What is NOT here

The portrait (`Duy_Nguyen_3.jpg`) and every project image are still under
`public/docs/images/` and are served at `/docs/images/…`. Only the institutional
marks were promoted, because only they are referenced by the new site chrome.
