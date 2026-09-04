/**
 * components/site/intro/LogoReveal.tsx — the brand mark, as geometry, and the
 * one gesture the intro exists to show.
 *
 * The timing, the paint and the legibility argument are in
 * ./logo-reveal.module.css. THIS FILE IS ABOUT WHERE THE SHAPES CAME FROM.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── PROVENANCE ────────────────────────────────────────────────────────────
 *
 * TRACED FROM `public/brand/personal_brand.png` (2046x769, RGBA, transparent,
 * untracked at the time of writing) on 2026-09-03.
 *
 * THAT IS NOT THE PATH THE FEATURE WAS SPECIFIED AGAINST. The brief asks for
 * `public/brand/logo-source.{svg,pdf,png}`; there is no such file, and the real
 * artwork is sitting next to it under a different name. `lib/intro.ts` already
 * carries `/brand/personal_brand.png` as a gate candidate, so the switch finds
 * it. What is left is the part no code can fix:
 *
 *   `personal_brand.png` IS UNTRACKED. A clean checkout does not have it, so
 *   `introLogo()` returns null on CI and on Vercel and THE INTRO IS OFF IN
 *   PRODUCTION until the file is committed. That is the designed absent path
 *   behaving correctly, not a defect — but it means shipping the feature is a
 *   `git add public/brand/personal_brand.png` away, and nobody should read a
 *   green build as evidence that the intro ran.
 *
 * NOTHING IN THIS FILE DEPENDS ON THE PNG AT RUNTIME. Every path below is
 * baked into the module, so the component renders identically with the PNG
 * deleted: no fetch, no decode, no 404, no layout shift. The source is a
 * build-time input to the trace and never a runtime one.
 *
 * THE SOURCE IS A RASTER, NOT A VECTOR. The brief asks for the vector source
 * and says to trace a raster only as a fallback and to say so. This is that
 * fallback, and here is the loss, measured rather than asserted — the traced
 * outlines were rendered back at the source's own resolution and differenced
 * against the source alpha:
 *
 *     mean absolute error over the mark's box     0.018
 *     pixels disagreeing by more than half        1.27%
 *     ink area                                   +1.65%
 *
 * That residual is an edge band roughly one source pixel wide around a very
 * long perimeter — i.e. it is the antialiasing, not the shapes. What a raster
 * trace CANNOT recover is what was never in the PNG: the designer's true
 * control points, the exact optical curve of the D's bowl, and hinting for the
 * serif. IF THE VECTOR ORIGINAL SURFACES, RE-RUN THE TRACE AGAINST IT AND
 * REPLACE THE FOUR ARRAYS BELOW. Nothing else in the feature has to change —
 * the grouping, the pen strokes and the timing are all keyed to the run names,
 * not to the point data.
 *
 * ── HOW THE MARK WAS DECOMPOSED, AND THE THING THAT FOUND ─────────────────
 *
 * Pixels were split into a cream layer and a crimson layer by hue, then
 * 8-connected components were taken per layer. The component map is the whole
 * design, so it is worth stating what it returned:
 *
 *     cream     12 components — D, N, one 15x48 sliver, and 9 wordmark glyphs
 *     crimson   12 components — TWO pieces of one flourish, and 10 tagline
 *                               glyphs
 *
 * THE FLOURISH IS ONE STROKE THAT ARRIVES AS TWO COMPONENTS, AND THE D
 * ARRIVES WITH A PIECE MISSING. Those two facts are the same fact, and they
 * are the mark:
 *
 *     the crimson flourish is cut in half at y 172-186 by the cream N
 *         -> the N is painted OVER the flourish
 *     the D's bowl is cut at x 229-244, y 132-180 by the flourish
 *         -> the flourish is painted OVER the D
 *
 * So the painting order is forced: D, then flourish, then N. The crimson
 * crosses over the D and disappears under the N. That interlock is not a
 * decoration on the mark, it IS the mark, and it is the reason the reveal
 * draws the flourish while the N is still resolving instead of afterwards.
 * (The brief described the crossing element as a crimson N over a cream D.
 * The artwork has a cream D AND a cream N, crossed by a separate crimson
 * calligraphic flourish. Same gesture, different parts; the geometry is what
 * is implemented.)
 *
 * ── THE TRACE ─────────────────────────────────────────────────────────────
 *
 * Marching squares at alpha 0.5 over the antialiased alpha channel — so the
 * contours are sub-pixel and follow the artwork's own edge rather than the
 * pixel grid — then Ramer-Douglas-Peucker at 0.35 px, then Schneider
 * least-squares cubic fitting at 0.9 px tolerance with corner detection at
 * 58 degrees. Contours are chained UNDIRECTED, because the marching-squares
 * case table's segment orientation is not consistent across cases and a
 * directed walk silently drops whole glyphs. Holes fall out for free under
 * `fill-rule: evenodd`, which is why every path below carries it.
 *
 * 11.2 KB of path data for the entire mark, against 3.4 MB for the
 * reference's film.
 *
 * ── THE PEN STROKES ───────────────────────────────────────────────────────
 *
 * The reveal draws the monogram, so it needs centrelines, which a fill trace
 * does not produce. The flourish's was computed — the mean x of its crimson
 * pixels per scanline, smoothed, then fitted — and the maximum perpendicular
 * distance from that centreline to any flourish pixel is 18.3 units, so a pen
 * 46 wide covers it with margin.
 *
 * The D's and the N's are hand-authored from the letterforms' own per-row
 * run structure, and each was checked against every sampled row:
 *
 *     stroke                 pen   covers                       widest run
 *     D  stem + foot          62   x 5-67 down, then the foot   26 / 129
 *     D  top arm + bowl       54   arm x 2-155, bowl to y 196   40
 *     N  left stem            50   x 118-168                    32
 *     N  diagonal             46   x 154-200 at y132 ...        33
 *                                  ... 290-337 at y286
 *     N  right stem           46   x 300-346                    25
 *     FL flourish             46   computed centreline          17
 *
 * These are approximations and they are allowed to be, because the masks in
 * logo-reveal.module.css also carry a full-bleed coverage rect that closes
 * behind the pen. The pen owns the motion; the rect owns the correctness. See
 * THE COVERAGE GUARANTEE there.
 *
 * ── COORDINATES ───────────────────────────────────────────────────────────
 *
 * The source's ink box is x 155-1884, y 221-528. Everything below is
 * translated by (-150, -216) and rounded to 0.1, which at the ~560 CSS px the
 * mark occupies at a 1280 viewport is a rounding error of 0.03 px. The
 * viewBox is inset by a further 10 units on every side so the halo stroke
 * cannot clip against the edge.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { CSSProperties } from "react";

import s from "./logo-reveal.module.css";

/**
 * The mark's own running time, for whoever schedules the dissolve. The last
 * tagline glyph lands at 2.50s and the mark then holds still for 0.10s, so a
 * cut taken at or after LOGO_REVEAL_MS is guaranteed a static frame.
 *
 * Under `prefers-reduced-motion: reduce` the mark is composed and at rest the
 * instant it renders — LOGO_REVEAL_REDUCED_MS is 0, not a shortened sequence.
 * There is no drawing, no movement and no fade to wait for, so the shell may
 * cut whenever it likes without ever catching the mark half-formed. (It had a
 * 0.4s fade here once; the shell's own reduced-motion path takes the overlay
 * down by ~150ms, so the mark was invisible for its entire life. A resting
 * state that needs the shell to wait is not a resting state.)
 */
export const LOGO_REVEAL_MS = 2600;
export const LOGO_REVEAL_REDUCED_MS = 0;

/**
 * Every href known to carry the artwork these paths were traced from.
 *
 * `app/page.tsx` hands this component the href its gate actually opened on,
 * and the two can drift: if a vector export ever lands at
 * `/brand/logo-source.svg`, `INTRO_LOGO_CANDIDATES` prefers it, the gate turns
 * the intro on for THAT file, and this module keeps drawing the old raster
 * trace — a silent, correct-looking staleness.
 *
 * TWO ENTRIES, NOT ONE, BECAUSE THEY ARE THE SAME BYTES. The owner dropped the
 * lockup at `personal_brand.png`; it was then also published under the
 * canonical `logo-source.png`. Verified identical 2026-09-03:
 *
 *     md5  a93bc6d70c35cf0b652f995489fc43f1   228,158 bytes   2046 x 769
 *
 * for BOTH files. The trace is valid for whichever one the gate happens to
 * prefer, and flagging the alias as drift would be a false alarm — which is
 * how a gate gets trained out of people. If they ever stop being identical,
 * one of these entries is a lie and the md5 above is how to find out which.
 *
 * The href is otherwise never fetched. It is compared, published on the
 * element as `data-src` / `data-stale`, and warned about. There is
 * deliberately no runtime fallback to drawing the passed file: an <img> of the
 * lockup cannot be revealed stroke by stroke, and substituting a still image
 * on drift would hide exactly the thing that needs fixing.
 */
export const TRACED_SOURCES: readonly string[] = [
  "/brand/logo-source.png",
  "/brand/personal_brand.png",
];

/* ── geometry ─────────────────────────────────────────────────────────── */

/** The cream D, plus the 15x48 sliver of its bowl that the flourish cuts off. */
const D_PATHS = [
  "M5.6 250.5C10 254.4 6.2 251.4 20.5 251.4C58.2 251.4 95.8 251.2 133.5 251.1C134.2 211.9 61.8 263.4 51.9 236.5C50.3 232.1 51.2 227.2 51.2 222.5C51.1 170.8 50.9 119.2 50.9 67.5C50.9 66.9 50.7 40.9 51.8 33.5C53.4 21.4 76.2 32.6 88.5 32.6C111.9 32.6 128.9 33.5 150.5 41.9C182 54.3 205.1 89.8 212.2 121.5C213.6 127.8 214.7 134.1 215.5 140.5C217.3 155.1 214.1 147.7 216.5 153C222.4 151 223 138.3 225 133.5C226.4 129.9 235.4 106.7 235.7 104.5C236.3 99.7 232.7 95.2 230.5 90.8C221.7 73.4 209.4 58.9 193.5 47.4C143.7 11.5 56.5 24.8 6.5 25.4C5.2 25.4 5.3 27.7 6.5 27.9C13.6 29 14.9 27.7 20.5 32.2C28.6 38.6 26.5 52.2 26.5 60.5C26.6 112.2 26.5 163.8 26.4 215.5C26.4 225.7 28 234 22.6 242.5C18.2 249.5 8.2 246.6 5.6 250.5Z",
  "M242.5 132.2C242.9 137.8 242.9 151.5 235.3 152.5C235.6 162.1 219.6 173.8 240.5 179.9C243.5 167.3 248.3 144.3 242.5 132.2Z",
];

/** The cream N. Painted last of the three, because it occludes the flourish. */
const N_PATHS = [
  "M118.6 101.5C120.7 104.4 131.6 102.2 137.5 111.5C145.2 123.6 139.4 247.1 140.2 296.5C156.1 298.8 148.4 268.9 148.4 259.5C148.3 217.8 148.3 176.2 148.3 134.5C148.4 124.2 145.9 126.5 149.5 123.7C208.9 186.5 267 249.9 327.5 311.8C327.8 311.7 328.1 311.6 328.4 311.5C328.6 249.2 328.5 186.8 329 124.5C329 118.1 331.9 110.3 337.5 106.8C341.1 104.6 353.7 103.4 352.9 100.5C340.4 99.9 301 96.8 297.6 101.5C300.5 105.8 308 103.9 312.5 107.2C321.6 113.9 319.2 132.9 319.2 141.5C319.3 184 355 247.2 318.5 268.9C267.9 215.4 218 163.5 167.5 110.7C153.7 96.3 159.6 100 136.5 99.8C119.4 99.6 122.6 95.5 118.6 101.5Z",
];

/** The crimson flourish: ONE stroke, two components, split by the N. */
const FLOURISH_PATHS = [
  "M208.5 186.2C202.2 189.7 203.8 199.8 201.1 206.5C191.4 231.2 181.4 258 165.1 279.5C159 287.5 141 309.9 127.5 304.2C122.7 302.1 127.7 292.6 119.5 293.8C114.4 294.6 113.4 300.9 117.5 303.7C146 324.1 180.8 273.4 191.8 255.5C194.6 251 197.1 246.2 199.5 241.5C203.1 234.6 206.6 227.6 209.8 220.5C213 213.3 215.8 205.9 218.6 198.5C218.9 197.9 219.4 197 219 196.5C215.9 192.7 212.8 183.8 208.5 186.2Z",
  "M216.2 161.5C221.3 168 206.1 152.5 226.5 173C230.1 171.7 237.1 145.9 238.8 140.5C239.8 137.4 242.1 134.7 242.8 131.5C247.9 105.2 267.1 50.5 282.9 26.5C288.1 18.7 298 7.7 308.5 8.3C316.2 8.8 312.4 13.9 316.5 17.5C319.4 20 323.3 20.2 325.2 16.5C330.9 5.8 306.3 5.2 301.5 6.5C287.6 10.1 277 20.9 269.2 32.5C249.5 61.4 238.2 97.2 228 127.5C227.1 130.3 224.8 133.6 224 136.5C222 144.6 220.2 153.3 216.2 161.5Z",
];

/** DUY NGUYEN, left to right. */
const WORDMARK_PATHS = [
  "M475.3 96.5C475.4 96.9 475.4 97.4 475.5 97.8C487.5 100.9 488.7 101.6 488.8 114.5C489 137.5 488.9 160.5 488.7 183.5C488.6 196.7 487.9 199.1 475.6 201.5C475.1 202.8 475.1 202.2 475.6 203.5C500 204.6 508.7 205.3 540.5 203.5C579 201.3 608.8 155.9 585.7 121.5C573.9 103.9 554.2 96 533.5 95.7C518.8 95.4 504.2 95.5 489.5 95.5C476.5 95.5 480.2 93.6 475.3 96.5ZM511 100.5C533.5 98.5 555.6 102.1 568.1 122.5C586.2 152 568.4 198.5 531.5 199.7C512.1 200.3 504.7 202.2 504.7 181.5C504.7 168.3 480.7 103.2 511 100.5Z",
  "M625.3 102.5C627.8 105.6 634.1 103.1 636.2 108.5C645.3 132.4 624.6 171.9 646.4 193.5C666 212.8 711.4 210.2 722.7 182.5C729.9 164.9 725.7 126.7 725.9 116.5C726 113.7 726.5 107.7 729.5 105.8C731.6 104.4 738.7 104.5 737.6 101.5C727.9 101.4 708.5 93.2 708.5 102.9C711.6 104.7 705.9 101.6 713.5 103.8C726.7 107.7 721.1 137.2 721.1 142.5C721.1 155.6 721.4 161.8 720.1 174.5C717.7 197.2 686.7 204 669.5 195.2C654.9 187.8 653 173.5 652.9 158.5C652.8 142.8 653 127.2 653.3 111.5C653.4 109.4 654.1 107 655.7 105.5C657.8 103.3 660.7 103.5 663.5 103C663.5 102.5 663.5 102 663.5 101.5C625.9 101.3 634.9 92.3 625.3 102.5Z",
  "M800.5 201.2C800.5 201.9 800.5 202.6 800.5 203.2C807.2 203.8 833.8 205.5 839.5 203C839.5 202.5 839.5 202 839.5 201.5C837.3 201.1 832.7 200.9 830.5 199.2C828.6 197.8 827 194.8 826.9 192.5C826.5 179.8 825.6 167.1 826.8 154.5C827 152.7 856 105.2 870.5 103.5C871.1 102.2 871.1 102.8 870.5 101.5C860.9 101.5 851.2 101.5 841.5 101.5C839.3 107.1 860.6 98.8 847.5 117.2C840.1 127.6 832.2 137.6 824.5 147.8C815.7 135.9 804.6 123.6 799.9 109.5C797.8 103.1 806.9 104.1 806.9 102.5C806.9 96 769.1 96.2 769.1 102.5C769.1 104.8 773.4 104.1 775.5 104.8C777.7 105.6 780 107.9 781.1 109.5C781.2 109.7 810.4 151.9 811.2 155.5C813.9 167.5 811.5 180.2 811.2 192.5C811 199.3 806 200.2 800.5 201.2Z",
  "M983.5 98.2C983.3 98.7 983 99.1 982.8 99.5C984.5 102.3 993.2 100.3 995.8 108.5C998.2 116.1 996.8 124.5 996.8 132.5C996.8 150.5 996.8 168.5 996.6 186.5C996.6 190.9 995.5 195.3 992.3 198.5C990 200.9 986.4 200.7 983.5 201.1C983 202.8 982.8 202.1 983.5 203.3C984.7 203.3 1012 205.1 1014.3 202.5C1012.3 198.6 1006.5 201.6 1003.3 195.5C993.8 177.2 1001.6 154.2 1001.6 133.5C1001.6 117.6 998.9 121.9 1002.5 116.6C1026.4 143.9 1050.2 171.3 1074.2 198.5C1080.2 205.3 1077.5 204.4 1083.5 204.7C1092.3 175.4 1083.1 206.5 1083.9 115.5C1083.9 111.8 1084.5 105.8 1087.5 102.8C1090.5 99.9 1094.5 102.1 1097.1 99.5C1097 99.2 1096.8 98.8 1096.7 98.5C1086.9 98.4 1077.2 98.2 1067.5 98.2C1065.9 98.2 1066.1 98.3 1065.7 99.5C1069.3 102.9 1072.1 99.5 1076.5 104.7C1080 108.9 1079.1 116.9 1079.1 121.5C1079.4 174.3 1082.6 157.3 1078.5 178C1041.2 159.9 1095.5 99.9 1008.5 98.2C1000.2 98 991.8 98.2 983.5 98.2Z",
  "M1224.5 196.6C1224.6 185.5 1221.8 173.7 1225.9 163.5C1227.7 158.9 1234.1 159.4 1233.8 156.5C1223.7 151.9 1207.8 155.7 1196 156.5C1195.9 156.8 1195.8 157.2 1195.7 157.5C1199 160.3 1203.4 157.7 1206.5 161.6C1211.4 167.8 1214 193.2 1201.5 198.1C1168.2 211 1140 181.7 1141.9 149.5C1143.9 117.5 1168.5 93.4 1201.5 105.8C1208.2 108.4 1214.6 113.2 1218.2 119.5C1218.5 120 1220.2 129.4 1222.5 128.5C1229.6 125.6 1224.1 111.5 1223.1 104.5C1211.2 103.1 1234.6 106 1204.5 100.3C1188.6 97.2 1170.3 97.2 1155.5 104.5C1118.4 122.8 1112 175.7 1150 197.5C1173.4 210.9 1200.6 204.6 1224.5 196.6Z",
  "M1368.5 101.6C1358.9 101.6 1344.9 94.4 1339.9 102.5C1342.8 106.8 1351.6 101.1 1352.1 114.5C1352.7 131.5 1352.5 148.5 1352.2 165.5C1351.7 197.1 1313.3 211.3 1292.9 187.5C1278.9 171.3 1286.8 118.4 1286.9 110.5C1287 102.8 1295.7 106.1 1298.4 102.5C1291.3 93.3 1259.1 98 1259.1 102.5C1259.1 104 1270 103.3 1270.2 110.5C1270.5 121.6 1262 174.2 1279.4 192.5C1299.2 213.3 1345.3 209.4 1354.7 179.5C1360.9 159.9 1356.7 126.6 1356.9 114.5C1357.1 103.3 1369.7 104.3 1368.5 101.6Z",
  "M1395.7 102.5C1396.4 103.8 1405.1 105.6 1409.1 111.5C1415.5 121.1 1421.9 130.7 1428.1 140.5C1442.4 163.1 1437.9 153.8 1437 189.5C1436.8 197.7 1432.9 199.9 1425.5 200.9C1425 202.8 1424.8 202 1425.5 203.3C1455.2 203.8 1442.2 204.1 1464.5 203C1464.5 202.4 1464.5 201.7 1464.5 201.1C1459 200.3 1453.1 199.5 1452.9 192.5C1452.6 179.2 1449.4 165.4 1452.9 152.5C1453.5 150.6 1478.1 116.2 1482.9 110.5C1486 106.9 1496.4 103.4 1495.5 101.5C1486.5 101.6 1477.5 101.6 1468.5 101.6C1467.9 102.8 1468 102.2 1468.5 103.5C1476.9 104.5 1477.7 108.5 1473 115.5C1466.9 124.7 1460.4 133.5 1454 142.5C1450.5 147.5 1452.2 146.4 1449.5 147.8C1443 138.5 1421.7 112.5 1426.9 105.5C1429 102.7 1431.4 104.5 1433.5 102.5C1424.8 93.7 1403.2 93.6 1395.7 102.5Z",
  "M1521.5 101.9C1521.5 102.4 1521.5 102.8 1521.5 103.2C1555.3 109.1 1532.9 179.2 1532.8 191.5C1532.8 199 1527.8 200.1 1521.5 201.3C1521.5 201.9 1521.5 202.5 1521.5 203.1C1526.1 205.3 1522.5 203.8 1534.5 203.7C1555.5 203.7 1576.5 203.6 1597.5 203.6C1599.6 200.1 1603.8 185.7 1602.5 179.3C1602 179.4 1601.4 179.4 1600.9 179.5C1593.7 195.2 1589.1 198.6 1571.5 199.3C1565.8 199.5 1548.4 202.6 1548.3 191.5C1548.2 179.2 1542.1 165 1548.6 154.5C1551.7 149.4 1575.2 149.9 1580.2 158.5C1582.1 161.8 1582 163.7 1582.5 167.1C1583.1 167.2 1584.3 167.7 1584.7 166.5C1587.1 157.1 1584.6 147.1 1584.5 137.4C1583.7 137.4 1583 137.5 1582.2 137.5C1580 145.3 1577.3 148.7 1568.5 148.9C1561.8 149 1548.7 154.3 1548.5 147.6C1548.1 137.2 1548.3 126.9 1548.3 116.5C1548.4 106.8 1547.4 106.1 1556.5 105.9C1562.5 105.7 1568.5 105.6 1574.5 105.9C1577.3 106 1581.1 107.2 1583.5 108.9C1588.4 112.4 1589.5 120.6 1592.5 122.5C1596.1 118.7 1595.5 102.6 1591.5 101.4C1569.9 95.2 1544.3 97.8 1521.5 101.9Z",
  "M1627.7 103.5C1634.3 104.5 1641 108.9 1641.1 116.5C1641.4 140.8 1641.2 165.2 1641.2 189.5C1641.2 197.9 1636.1 200.1 1628.5 201C1628.5 201.7 1628.5 202.5 1628.5 203.2C1636.2 203.4 1643.8 203.7 1651.5 203.7C1656.5 203.7 1655.6 204.5 1657.1 202.5C1655.5 198.9 1649.1 200.4 1647.2 195.5C1640.1 177.2 1646.1 156.2 1645.9 136.5C1645.8 121.3 1643.6 125.9 1646.5 120.5C1701.9 181.1 1641.8 114.3 1671.5 149.2C1692.2 173.4 1723.6 225 1723.7 197.5C1723.8 178.5 1723.4 159.5 1723.5 140.5C1723.5 138.1 1718.2 107.7 1730.5 103.9C1735.4 102.3 1732.4 104.7 1734.8 102.5C1734.7 102.3 1734.6 102.1 1734.5 101.9C1707 101.4 1714 95.1 1706.3 102.5C1706.5 102.8 1706.7 103.2 1706.8 103.5C1731.9 105.6 1718.2 158.8 1718.2 165.5C1718.2 175.7 1719.2 172.4 1717.5 177.2C1695.8 154 1673.7 118.7 1651.5 101.5C1645.2 96.6 1626.8 95.6 1627.7 103.5Z",
];

/** PROVABLE AI, left to right. */
const TAGLINE_PATHS = [
  "M823.5 273.1C823.5 281 818.9 300.9 826.5 298.4C829.3 297.4 827.7 292.5 827.8 289.5C831.5 289.3 837 290 840.4 287.5C845.5 283.8 844.1 275.6 838.5 273.3C834.9 271.8 824.9 273 823.5 273.1ZM827.9 285.5C826.1 285.2 822.3 274.5 833.5 275.9C843.2 277.1 842.1 287.7 827.9 285.5Z",
  "M888.5 288.8C893 296.5 891.1 297.9 897.5 298.5C899.1 294.3 898 297.8 892.9 288.5C897.7 284.9 900.7 273.8 891.5 272.9C887.2 272.4 882.8 272.4 878.5 272.6C872.4 272.9 871.5 296.1 878.5 298.2C887.4 300.9 871.3 288.4 888.5 288.8ZM882.5 285.7C881.8 285.6 874.6 274.5 889.5 275.9C897 276.6 896.5 287.2 882.5 285.7Z",
  "M942.5 272.5C924.6 276.6 930.8 302.2 948.5 298.5C965.4 295 959.8 268.6 942.5 272.5ZM941.1 276.5C951.3 270.2 960.7 287.2 950.5 293.8C939.3 300.9 928.9 284.1 941.1 276.5Z",
  "M991.5 273.1C997.6 288.7 993.6 299.1 1005.5 298.2C1009.1 290 1012.7 281.7 1016.3 273.5C1014.8 272 1015.9 272.7 1012.5 272.7C1009.5 279.4 1006.5 286.1 1003.5 292.8C998.9 281.2 1001.5 271.5 991.5 273.1Z",
  "M1045.8 297.5C1049.2 301.2 1051.6 294 1052.5 292.4C1075.4 292.3 1059.4 298 1070.5 298.5C1072.6 290.4 1070.7 298.4 1061.9 277.5C1061.9 277.5 1061.3 272.8 1059.5 272.7C1049 272 1046.6 295.6 1045.8 297.5ZM1058.5 277.7C1060 279.4 1062.7 286.7 1062.5 288.6C1054.2 289.2 1056.5 290.9 1053.7 288.5C1057.6 278.1 1054.5 280.6 1058.5 277.7Z",
  "M1105.5 298.3C1108.8 298.3 1126 300.9 1125.8 291.5C1125.7 287.4 1124.7 287.5 1122 285.5C1123.1 283.4 1125.3 281.1 1124.7 278.5C1123.1 272.1 1105.2 266.8 1105.1 273.5C1104.7 296.9 1101.7 290.3 1105.5 298.3ZM1109.5 283.5C1100.8 276.2 1116.3 272.1 1120.2 277.5C1124.4 283.4 1112.3 285.9 1109.5 283.5ZM1109.3 287.5C1120 283.9 1132.8 295.4 1109.5 294.9C1108 291.7 1108.8 294 1109.3 287.5Z",
  "M1160.5 273.4C1160.5 281.4 1160.2 289.5 1160.5 297.6C1160.6 299 1163.1 298.6 1164.5 298.6C1169 298.6 1177.8 301 1177.8 296.5C1177.8 292.3 1167.8 296.3 1164.5 294.5C1164.5 284.6 1168 268.9 1160.5 273.4Z",
  "M1211.5 272.9C1210.9 288.4 1211 280 1211.5 298.2C1212.8 298.4 1214.2 298.6 1215.5 298.6C1220.2 298.7 1227.8 301.9 1229.4 297.5C1231.5 291.7 1218.5 295.8 1215.1 294.5C1214.8 288 1213.9 290.3 1215.5 287.2C1219.2 287.2 1222.8 287.2 1226.5 287.1C1231.1 278.1 1209.3 291.5 1215.5 276C1220.1 275.2 1225.1 277.6 1229.3 275.5C1230 267.5 1216.9 272.8 1211.5 272.9Z",
  "M1302.5 298.3C1307.3 298.4 1306.4 297.8 1308.5 292.8C1317.4 291.7 1320.1 290.5 1323.5 298.3C1324.7 298.4 1325.9 298.4 1327.1 298.5C1330.7 291.3 1327.5 298.3 1319 278.5C1318.3 276.9 1317.9 275.1 1317.2 273.5C1315.1 268.6 1294.8 282.4 1302.5 298.3ZM1314.5 277.8C1317.3 280.6 1319.3 284.5 1319.2 288.5C1316.4 289.9 1313 289.8 1310.3 288.5C1311.8 285 1312.2 280.8 1314.5 277.8Z",
  "M1362.5 272.8C1358.7 273.7 1361.9 280.6 1361.9 284.5C1361.9 291.1 1358.9 299.8 1364.5 298.3C1369.2 297 1371.9 270.5 1362.5 272.8Z",
];

/**
 * Each tagline glyph's distance from the run's centre (x 1094), times 0.34.
 * The reveal starts every glyph at this offset and settles it to zero, which
 * is a tracking animation done on the compositor.
 */
const TAGLINE_DX = [
  -88.7, -70.4, -50.8, -30.8, -12.4, 7.1, 25.3, 42.8, 75.0, 91.5,
];

/* ── the pen strokes, in the order a hand would make them ─────────────── */

const PEN = {
  dStem: "M36 12 L36 251 L138 251",
  dBowl:
    "M2 26C60 26 100 26 128 30C170 38 214 66 228 108C238 140 234 168 224 196",
  nLeft: "M143 92 L143 296",
  nDiag: "M152 104 L326 300",
  nRight: "M323 92 L323 314",
  flourish:
    "M307.2 9.5C301.9 18.7 283 12.5 265.4 47C249 79.5 237.4 117.7 226.8 152C225.7 155.6 226.3 159.5 224.9 163C220.5 174 214 184 209.6 195C208.4 197.8 209.2 201.1 208.3 204C202.4 223.4 192.4 243.8 181.6 261C176.8 268.6 172.8 277.1 166.1 283C158.5 289.7 148.6 293.2 139.6 298C132.4 301.9 135.9 297.6 132.7 302.5",
} as const;

type PenProps = { d: string; width: number; at: string; dur: string };

function Pen({ d, width, at, dur }: PenProps) {
  return (
    <path
      className={s.pen}
      d={d}
      pathLength={1}
      strokeWidth={width}
      style={{ "--at": at, "--dur": dur } as CSSProperties}
    />
  );
}

export type LogoRevealProps = {
  className?: string;
  /**
   * The href the intro gate resolved. Optional, and never fetched — the
   * geometry is baked. It exists so drift from TRACED_SOURCES is visible
   * rather than silent; see that constant.
   */
  src?: string;
  /** Ids are namespaced so a second instance cannot steal the first's masks. */
  idPrefix?: string;
  /**
   * The mark is the page's own name. When the shell already labels the
   * overlay, pass `decorative` so the name is not announced twice.
   */
  decorative?: boolean;
};

export function LogoReveal({
  className,
  src,
  idPrefix = "dn-mark",
  decorative = false,
}: LogoRevealProps) {
  /*
    DRIFT, MADE VISIBLE TWO WAYS.

    `stale` is true when the gate opened on a file these paths did not come
    from. It is published as `data-stale` so a Playwright assertion can fail
    on it, and warned once so a human notices in the console.

    THE WARNING IS NOT GATED ON NODE_ENV. eslint's no-restricted-syntax rule
    forbids reading the environment directly here, and tests/unit forbids even
    naming it outside lib/agent/env.ts (config has one home), and
    the gate would be wrong anyway: this fires only when the mark on screen is
    provably the wrong artwork, which is a defect in production exactly as
    much as in development. Silence in the environment where it matters most
    is the failure mode this codebase already refuses elsewhere.
  */
  const stale = src !== undefined && !TRACED_SOURCES.includes(src);
  if (stale) {
    console.warn(
      `LogoReveal: the intro gate opened on ${src}, but these paths were ` +
        `traced from ${TRACED_SOURCES.join(" or ")}. The mark on screen is ` +
        `the OLD artwork. Re-run the trace against the new source and replace ` +
        `the path arrays in components/site/intro/LogoReveal.tsx.`,
    );
  }

  const maskD = `${idPrefix}-d`;
  const maskN = `${idPrefix}-n`;
  const maskF = `${idPrefix}-f`;

  return (
    <svg
      className={[s.mark, className].filter(Boolean).join(" ")}
      viewBox="-10 -10 1760 340"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Duy Nguyen — Provable AI"}
      focusable="false"
      data-traced-from={TRACED_SOURCES[0]}
      data-src={src}
      data-stale={stale || undefined}
    >
      <defs>
        {/*
          WHITE REVEALS. A mask is an alpha channel encoded as luminance, so
          the white here is not a palette choice and there is no ground role
          that would be correct instead — see the note in the stylesheet.
        */}
        <mask
          id={maskD}
          maskUnits="userSpaceOnUse"
          x="-10"
          y="-10"
          width="1760"
          height="340"
        >
          <Pen d={PEN.dStem} width={62} at="0.12s" dur="0.34s" />
          <Pen d={PEN.dBowl} width={54} at="0.34s" dur="0.52s" />
          <rect
            className={s.cover}
            x="-10"
            y="-10"
            width="1760"
            height="340"
            style={{ "--at": "0.69s" } as CSSProperties}
          />
        </mask>

        <mask
          id={maskF}
          maskUnits="userSpaceOnUse"
          x="-10"
          y="-10"
          width="1760"
          height="340"
        >
          <Pen d={PEN.flourish} width={46} at="0.92s" dur="0.74s" />
          <rect
            className={s.cover}
            x="-10"
            y="-10"
            width="1760"
            height="340"
            style={{ "--at": "1.53s" } as CSSProperties}
          />
        </mask>

        <mask
          id={maskN}
          maskUnits="userSpaceOnUse"
          x="-10"
          y="-10"
          width="1760"
          height="340"
        >
          <Pen d={PEN.nLeft} width={50} at="0.58s" dur="0.24s" />
          <Pen d={PEN.nDiag} width={46} at="0.74s" dur="0.34s" />
          <Pen d={PEN.nRight} width={46} at="0.98s" dur="0.22s" />
          <rect
            className={s.cover}
            x="-10"
            y="-10"
            width="1760"
            height="340"
            style={{ "--at": "1.07s" } as CSSProperties}
          />
        </mask>
      </defs>

      {/*
        THE ORDER OF THESE THREE GROUPS IS THE MARK. D under flourish under N.
        Swapping any two of them unpicks the interlock the artwork is built on.
      */}
      <g mask={`url(#${maskD})`}>
        {D_PATHS.map((d) => (
          <path
            key={d.slice(0, 24)}
            className={`${s.cream} ${s.mono}`}
            fillRule="evenodd"
            d={d}
          />
        ))}
      </g>

      <g mask={`url(#${maskF})`}>
        {FLOURISH_PATHS.map((d) => (
          <path
            key={d.slice(0, 24)}
            className={`${s.red} ${s.mono}`}
            fillRule="evenodd"
            d={d}
          />
        ))}
      </g>

      <g mask={`url(#${maskN})`}>
        {N_PATHS.map((d) => (
          <path
            key={d.slice(0, 24)}
            className={`${s.cream} ${s.mono}`}
            fillRule="evenodd"
            d={d}
          />
        ))}
      </g>

      <g>
        {WORDMARK_PATHS.map((d, i) => (
          <path
            key={d.slice(0, 24)}
            className={`${s.cream} ${s.word} ${s.wordGlyph}`}
            fillRule="evenodd"
            d={d}
            style={{ "--i": i } as CSSProperties}
          />
        ))}
      </g>

      <g>
        {TAGLINE_PATHS.map((d, i) => (
          <path
            key={d.slice(0, 24)}
            className={`${s.red} ${s.tag} ${s.tagGlyph}`}
            fillRule="evenodd"
            d={d}
            style={{ "--i": i, "--dx": `${TAGLINE_DX[i]}px` } as CSSProperties}
          />
        ))}
      </g>
    </svg>
  );
}
