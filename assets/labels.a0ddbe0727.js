/* =============================================================================
 * Cook County Cooks — v4 "Alive"
 * assets/labels.js  ·  INK ON THE PAPER
 * -----------------------------------------------------------------------------
 * Jeff, twice, in his own words:
 *
 *   "On the prep station, I want to see what each hanging receipt has on it…
 *    I want people to see what the link represents so they would know what they
 *    are clicking, BUT I WANT IT TO LOOK LIKE IT IS WRITTEN ON THE RECEIPT
 *    HANGING THERE."
 *
 * Eight objects in the photographs are blank paper: four recipe cards on the
 * prep station's ticket rail, two clipboards on the back-office hooks, the sheet
 * standing in the printer's output tray, and the printed card lying on the pass.
 * Each is already a `[data-tool]` hotspot. This module letters them.
 *
 * ── WHAT MAKES IT READ AS PRINT AND NOT AS A WEB LABEL ──────────────────────
 * 1. THE PLANE.  Every sheet was measured off the 2400x1340 plate as a quad
 *    (TL,TR,BR,BL in plate %) and the type is mapped onto it with a CSS affine
 *    solved from those four corners. Lines of type run parallel to the sheet's
 *    own printed rules, not to the viewport.
 * 2. THE INK COLOUR.  Not black, and not a token. Each sheet's own lit paper
 *    colour was sampled off the plate and the ink is that colour x 0.235 — the
 *    reflectance of a printed mark. A card in shadow therefore gets a lighter
 *    ink than a card under the lamp, automatically, because its paper is darker.
 * 3. THE LIGHT ACROSS IT.  A luminance ramp was fitted over each sheet (du/dv,
 *    in the sheet's own axes) and becomes a mask gradient: the ink fades where
 *    that sheet falls into shadow. The printer sheet loses 28% of its light left
 *    to right; the pass card loses 25% front to back; you can see both.
 * 4. THE SIZE.  Type is sized in `cqw` of the WRITING AREA, so it is a fraction
 *    of that piece of paper at every viewport and every point of the push-in —
 *    never a viewport-relative size floating over a photograph.
 * 5. THE LIGHTS.  Opacity rides --enter (the gate) and --bloom (the density),
 *    so the writing resolves out of the paper as the room finishes lighting.
 *    No second animation loop, no rAF, no timers.
 *
 * ── WHY NOT mix-blend-mode: multiply ────────────────────────────────────────
 * Multiply is the textbook way to sit ink IN paper, and it does nothing here.
 * MEASURED, not assumed: the prep station's first card was screenshotted with
 * and without `mix-blend-mode: multiply` on the ink, at 2x, mid-room. The two
 * images are identical — maximum channel difference 0 over the whole card.
 * Two independent reasons:
 *   · theme.css §06 puts `transform` on `.hotspots`, and §09 puts
 *     `opacity: var(--own)` on it as well. Either alone makes that layer an
 *     isolated stacking context, so a blend mode on a descendant NEVER sees
 *     `.plate-wrap` behind it — it composites against transparent black, which
 *     for `multiply` is a no-op. Hence the identical screenshots.
 *   · SPEC.md §06 forbids it anyway: "NO LAYER OVER THE PLATE MAY CARRY A BLEND
 *     MODE" — a blend mode forces the compositor to read the backdrop back every
 *     frame, and these eight elements sit on a layer that transforms on scroll.
 * The physical model in (2) + (3) is what buys the effect instead, and it is
 * free: a solid colour, one alpha, one mask gradient.
 *
 * ── NARROW VIEWPORTS: THE INK GOES WITH THE PAPER ───────────────────────────
 * theme.css §17 already removes the object hotspots below 900px and on any
 * viewport narrower than 8:7 — iPad portrait and every phone — because a 16:9
 * plate cover-cropped into a 3:4 frame throws away a third of its width and
 * shrinks what is left. The ink is a CHILD of those buttons, so it goes with
 * them, and that is the right answer rather than a limitation worked around:
 * the smallest of these sheets is 4.8% of the plate, which on a 390px phone is
 * 19 CSS PIXELS OF PAPER. There is no type size, no reflow and no zoom that
 * makes a tool's name legible on 19px of a photograph — putting one there
 * would be the "AI slop" the client already rejected once. What the client
 * actually asked for on mobile is served by the layout that replaces it: the
 * rail's chip list becomes a full-width tap list of every tool in the room, at
 * 52px a row, and every row is the same name this module prints.
 *
 * One step up from that — a stage under ~1180px, where the hotspots are still
 * shown but the smallest writing area is down to ~70px — the ink drops its
 * furniture (kicker, "Tap to open", form rules) and gives the whole area back
 * to the tool's name. See §5's `@container stage` block.
 *
 * That decision is theme.css's to revisit, not this file's, and the hooks in §5
 * are what it should be revisited through: set `--ccc-label-show: 0` to take
 * ink off a breakpoint, or style `.hotspot--lettered` / `.ccc-ink` directly.
 * Nothing here fights a media query.
 *
 * ── WHAT THIS MODULE MAY NOT DO ─────────────────────────────────────────────
 *   · It must never build a second element over a lettered object. The ink is a
 *     CHILD of the existing hotspot button, so the click target, the reticle,
 *     the focus ring, the hover state and the 44px minimum are all untouched.
 *   · The ink is `aria-hidden`. `.hotspot-label` remains the accessible name and
 *     a screen reader hears the tool named exactly once.
 *   · It must never write --p / --plate-scale / --plate-x / --plate-y / --enter
 *     / --bloom. It only reads them.
 *   · Zero layout reads. Every number below is resolved by the compositor from
 *     percentages, `cqw`, and the plate's fixed 2400x1340 aspect.
 *
 * Plain ES module. No build step, no npm, no framework.
 * ========================================================================== */

import { HOTSPOTS } from '../rooms.5ce51f6d22.js';


/* ─────────────────────────────────────────────────────────────────────────────
 * 1 · THE ONE CONSTANT
 *
 * theme.css §06 sizes `.hotspots` to the plate's COVER BOX, whose aspect ratio
 * is the plate's own and therefore fixed at every viewport. That is the fact
 * this whole file rests on: a hotspot box has a CONSTANT pixel aspect ratio, so
 * an affine expressed as unitless matrix() terms plus a translate() in percent
 * is correct at 390px and at 2560px with nothing measured and nothing to
 * recompute on resize.
 * ────────────────────────────────────────────────────────────────────────── */

const PLATE_AR = 2400 / 1340;          // 1.79104 — must match theme.css --plate-ar


/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · THE SURFACES
 * ─────────────────────────────────────────────────────────────────────────────
 * `quad`   TL, TR, BR, BL of the sheet, in PERCENT OF THE PLATE — the same
 *          coordinate space rooms.js uses, and measured the same way: a colour
 *          mask over plates/<room>.webp, then the four extreme corners of the
 *          component, checked against a 1%-grid overlay of the crop. TL/TR is
 *          the sheet's own TOP edge, so type set on it runs the way the sheet's
 *          pre-printed rules run.
 *
 * `zone`   [u0, v0, u1, v1] — the writing area inside that sheet, in the
 *          sheet's own fractions. This is the part that keeps the ink off the
 *          art: on the prep cards it lands inside the ruled field between the
 *          header rule and the last rule; on the pass card it lands on the
 *          card's own heading line; on the clipboards it is the top half of an
 *          otherwise blank form.
 *
 * `paper`  the sheet's LIT paper colour, sampled as the mean of the top 40% of
 *          a 17x17 grid inside the quad (the top 40% so pre-printed marks and
 *          the shadowed edge do not drag it down). The ink colour is derived
 *          from it — see §3.
 *
 * `ramp`   [du, dv] — d(luminance)/d(u) and /d(v) across the sheet, RELATIVE to
 *          the sheet's own mean luminance, from a least-squares plane fit over
 *          the same grid. Negative du = the sheet darkens to the right.
 *
 * `lines`  the tool's name, broken by hand. Two short lines beat one long one
 *          on a card 150px wide.
 * `rules`  the pitch, in em of the title, of faint pre-printed form rules drawn
 *          UNDER the block — for the two clipboards only. Their sheets are
 *          blank stock in the photograph and a bare title on blank stock reads
 *          as a sticker someone put there. The prep cards need none: the plate
 *          already prints six ruled lines on each of them and the type sits in
 *          among those.
 * ────────────────────────────────────────────────────────────────────────── */

const SURFACES = [
  /* ── PREP STATION · four cream recipe cards on a stainless ticket rail ──────
     The rail rises to the right, so every card's top edge runs about 3.6° down
     from horizontal while its bottom edge is nearly level — a real keystone,
     which the four-corner fit picks up as a shear. The cards also step down in
     size and in light from left to right; the sampled paper colours below carry
     that (217,204,186 on the first card, 228,219,210 on the fourth), so the
     fourth card's ink is measurably lighter than the first's. */
  { slug: 'porting-guide',  room: 'prep',   surface: 'card',
    quad: [[24.58, 33.36], [33.20, 34.35], [33.26, 46.82], [24.60, 47.06]],
    zone: [0.07, 0.285, 0.93, 0.715],  align: 'start',
    paper: [217, 204, 186], ramp: [-0.020, 0.073],
    lines: ['PortPro', 'Porting Guide'], meta: 'Tap to open' },

  { slug: 'credit-limit',   room: 'prep',   surface: 'card',
    quad: [[34.45, 34.68], [41.60, 35.52], [41.62, 46.88], [34.56, 46.95]],
    zone: [0.10, 0.260, 0.93, 0.740],  align: 'start',
    paper: [224, 213, 198], ramp: [0.007, 0.024],
    lines: ['Credit Limit', 'Increase'], meta: 'Tap to open' },

  { slug: 'bapis',          room: 'prep',   surface: 'card',
    quad: [[43.12, 35.75], [49.05, 36.42], [49.12, 46.72], [43.48, 46.80]],
    zone: [0.10, 0.26, 0.93, 0.73],    align: 'start',
    paper: [228, 219, 209], ramp: [-0.019, 0.044],
    kicker: 'BAPIS', lines: ['Online Order', 'Processing'], meta: 'Tap to open' },

  { slug: 'bp-access',      room: 'prep',   surface: 'card',
    quad: [[50.50, 36.79], [55.26, 37.31], [55.30, 46.80], [50.54, 46.88]],
    zone: [0.11, 0.24, 0.96, 0.71],    align: 'start',
    paper: [228, 219, 210], ramp: [-0.030, 0.018],
    /* The smallest sheet in the building: 4.8% of the plate, and the hotspot
       around it is narrower still, so the writing area is ~65px on a 1600px
       desktop. Three short lines and no rule is what fits at a size that is
       still ink rather than grey mush. */
    lines: ['Report BP', 'Access', 'Issues'], rule: false },

  /* ── BACK OFFICE · two clipboards on wall hooks ────────────────────────────
     The camera is off to the left of this wall, so horizontals converge hard:
     both sheets' top edges fall ~9° (left board) and ~12° (right board) while
     their side edges stay within 1.5° of vertical. That is a shear, not a
     rotation, and the four-corner fit resolves it as one. Blank white stock, so
     these two get faint pre-printed form rules of their own under the title. */
  { slug: 'exception-report', room: 'office', surface: 'clipboard',
    quad: [[85.92, 37.91], [89.96, 36.79], [88.54, 56.72], [85.58, 56.34]],
    zone: [0.11, 0.09, 0.89, 0.60],    align: 'start',
    paper: [226, 181, 151], ramp: [-0.017, 0.074],
    lines: ['Exception', 'Report'], meta: 'Tap to open', rules: 0.62 },

  { slug: 'fall-off',        room: 'office', surface: 'clipboard',
    quad: [[91.54, 36.19], [97.46, 34.4], [97.12, 58.58], [91.46, 50.97]],
    /* The writing area is pulled left of centre on purpose. This clipboard is
       the right-most object in the plate; at 1280x800 its outer third is
       already outside the frame, and the push-in takes another 30px of it at
       every desktop width. Setting on u 0.06-0.82 keeps the words on the part
       of the sheet that stays in shot — and the ink is cropped with the paper
       rather than independently of it, which is the only version of this that
       does not look like a bug. */
    zone: [0.06, 0.09, 0.82, 0.60],    align: 'start',
    paper: [222, 181, 155], ramp: [-0.066, -0.068],
    lines: ['Fall-Off', 'Summary'], meta: 'Tap to open', rules: 0.5 },

  /* The sheet standing in the printer's output tray. It is tipped back and lit
     hard from the upper left — it loses 28% of its light across its width and
     19% down its height, the steepest ramp of the eight, and the mask makes the
     right-hand end of the word visibly softer than the left. */
  { slug: 'printouts',       room: 'office', surface: 'printout',
    quad: [[78.12, 38.06], [85.96, 35.0], [81.5, 52.09], [78.96, 51.79]],
    zone: [0.10, 0.15, 0.90, 0.62],    align: 'start',
    paper: [252, 231, 200], ramp: [-0.285, -0.190],
    lines: ['Print Outs'], meta: 'Tap to open' },

  /* ── THE PASS · the printed card lying on the counter ──────────────────────
     A genuine ground plane: the sheet is nearly 40° off frontal, its far edge
     level and its side edges raked ~35°. It already carries a printed heading
     rule and a body of faint type, so the ink goes exactly where a heading
     goes — on the top quarter, centred on the card's own axis — and the plate's
     existing body copy stays as the body copy underneath it. */
  /* The printed card on the pass now points at T-Sheet Submissions: the client
     moved that tool here and sent The Mobile Discount Close to the host stand.
     The surface is unchanged — same piece of paper, same measured quad, same
     sampled paper colour and luminance ramp — only the slug and the words on
     it move. Two short lines set better on this card than one long one. */
  { slug: 'tsheet-submissions',  room: 'pass',   surface: 'counter-card',
    quad: [[76.62, 76.40], [83.80, 76.44], [89.74, 81.95], [81.62, 82.55]],
    zone: [0.12, 0.05, 0.88, 0.40],    align: 'center',
    paper: [250, 219, 192], ramp: [-0.011, -0.254],
    lines: ['T-Sheet', 'Submissions'] }
];


/* ─────────────────────────────────────────────────────────────────────────────
 * 3 · INK
 * ─────────────────────────────────────────────────────────────────────────────
 * A printed mark is not a colour, it is a reflectance: the same paper, returning
 * roughly a fifth of the light it was going to return anyway. So the ink for a
 * sheet is that sheet's own sampled paper colour scaled down — which is why the
 * result is a dark WARM grey on the cream cards (55,52,47), a dark neutral one
 * on the office's cool white stock (54,54,57), and warmest of all on the pass
 * card under the brass downlights (64,56,49). None of them is black, none of
 * them came from a palette, and a card in shadow gets a lighter ink than a card
 * under the lamp without a single hand-tuned number.
 *
 * 0.255 is about a laser toner's reflectance on office stock, and it was moved
 * up from 0.235 after looking at magnified crops: at 0.235 the ink read blacker
 * than anything the plates themselves print, which is its own kind of wrong. It
 * lands every one of these eight at better than 8:1 against its own paper.
 * ────────────────────────────────────────────────────────────────────────── */

const INK_REFLECTANCE = 0.255;

function inkColour(paper) {
  const c = paper.map((v) => Math.round(Math.max(0, Math.min(255, v * INK_REFLECTANCE))));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 4 · GEOMETRY
 * ────────────────────────────────────────────────────────────────────────── */

/** Bilinear point inside a quad given in TL, TR, BR, BL order. */
function atUV(quad, u, v) {
  const [TL, TR, BR, BL] = quad;
  const topX = TL[0] + (TR[0] - TL[0]) * u;
  const topY = TL[1] + (TR[1] - TL[1]) * u;
  const botX = BL[0] + (BR[0] - BL[0]) * u;
  const botY = BL[1] + (BR[1] - BL[1]) * u;
  return [topX + (botX - topX) * v, topY + (botY - topY) * v];
}

/** The writing area's own quad, in plate %. */
function zoneQuad(quad, [u0, v0, u1, v1]) {
  return [atUV(quad, u0, v0), atUV(quad, u1, v0), atUV(quad, u1, v1), atUV(quad, u0, v1)];
}

/**
 * Fit the plane.
 *
 * ── THE SOURCE RECTANGLE IS THE SHEET, UNFOLDED ────────────────────────────
 * The obvious construction — lay the element over the quad's bounding box and
 * warp — is wrong for exactly the reason this module exists. The pass card's
 * quad is raked 35°, so its bounding box is half again as wide as the card and
 * the type laid out inside it comes out squashed by the shear on the way onto
 * the paper. Instead the element is built at the sheet's OWN dimensions: as
 * wide as its top edge really is and as tall as its left edge really is, both
 * measured in the plate, both converted to hotspot-box percentages. The affine
 * is then a rotation and a shear with unit scale, so a cap set at 14cqw is 14%
 * of that sheet's width on the paper — at any viewport, at any point of the
 * push-in, on any of the eight surfaces.
 *
 * ── WHY AFFINE AND NOT A HOMOGRAPHY ────────────────────────────────────────
 * Four corners, six degrees of freedom, so this is the least-squares affine
 * over the unit square rather than an exact fit. Deliberate. An exact fit needs
 * a projective homography solved against MEASURED PIXELS — overlay.js does that
 * for the three TV screens and pays a getBoundingClientRect per screen on mount
 * and on every resize. These eight sheets do not earn it: the worst keystone
 * among them is the pass card, whose near edge is 14% longer than its far edge,
 * and across the ~50px a line of type actually occupies the residual is under a
 * pixel. The affine buys the whole effect — rotation, shear, taper direction —
 * for zero layout reads and zero resize work.
 *
 * The normal equations for the design matrix [(0,0),(1,0),(1,1),(0,1)] invert to
 * a constant, so the solve is three vector adds. With S the sum of the four
 * target corners:
 *
 *     a = e1 + e2 - S/2
 *     b = e2 + e3 - S/2
 *     c = 0.75 S - (e1 + 2 e2 + e3) / 2
 *
 * Checked against the identity square: a = (1,0), b = (0,1), c = (0,0).
 *
 * @param {number[][]} q     the target quad, in plate %
 * @param {{x,y,w,h}}  spot  its hotspot's box, in plate %
 * @returns {{left,top,width,height,transform,ratio}} all resolution-independent
 */
function fitPlane(q, spot) {
  const [TL, TR, , BL] = q;

  // 1 ── the sheet's real edge lengths. A plate % of WIDTH and a plate % of
  //      HEIGHT are different lengths on screen, so the cross terms carry the
  //      plate's aspect ratio. Both results stay in plate-% units and therefore
  //      stay resolution-independent.
  const wPct = Math.hypot(TR[0] - TL[0], (TR[1] - TL[1]) / PLATE_AR);
  const hPct = Math.hypot((BL[0] - TL[0]) * PLATE_AR, BL[1] - TL[1]);
  if (!(wPct > 0) || !(hPct > 0)) return null;

  // 2 ── as fractions of the hotspot box, which is the element's containing
  //      block. The element is anchored at the sheet's own top-left corner.
  const wf = wPct / spot.w;
  const hf = hPct / spot.h;
  const ox = (TL[0] - spot.x) / spot.w;
  const oy = (TL[1] - spot.y) / spot.h;

  // 3 ── the four target corners, in units of that element box
  const e = q.map(([x, y]) => [(x - TL[0]) / wPct, (y - TL[1]) / hPct]);

  const S = [e[0][0] + e[1][0] + e[2][0] + e[3][0],
             e[0][1] + e[1][1] + e[2][1] + e[3][1]];
  const a = [e[1][0] + e[2][0] - S[0] / 2, e[1][1] + e[2][1] - S[1] / 2];
  const b = [e[2][0] + e[3][0] - S[0] / 2, e[2][1] + e[3][1] - S[1] / 2];
  const c = [0.75 * S[0] - 0.5 * (e[1][0] + 2 * e[2][0] + e[3][0]),
             0.75 * S[1] - 0.5 * (e[1][1] + 2 * e[2][1] + e[3][1])];

  // 4 ── the element's pixel aspect ratio. Constant, because theme.css §06
  //      sizes .hotspots to the plate's cover box and that box's ratio is fixed.
  const ratio = (wf * spot.w) / (hf * spot.h) * PLATE_AR;

  // 5 ── normalised affine -> CSS matrix(). matrix() is in pixels, and one unit
  //      of the element's x is `ratio` units of its y, so the cross terms scale.
  const m = [a[0], a[1] / ratio, b[0] * ratio, b[1]];
  const n = (v) => Number(v.toPrecision(8));

  // matrix() forbids percentages; translate() needs them for the offset to stay
  // tied to the element's own size. Hence the two-function chain.
  return {
    left:   ox * 100,
    top:    oy * 100,
    width:  wf * 100,
    height: hf * 100,
    ratio,
    transform: `translate(${n(c[0] * 100)}%, ${n(c[1] * 100)}%) `
             + `matrix(${n(m[0])}, ${n(m[1])}, ${n(m[2])}, ${n(m[3])}, 0, 0)`
  };
}

/**
 * The light falling across the sheet, as a mask.
 *
 * `ramp` is d(luminance)/du and /dv relative to the sheet's mean, measured off
 * the plate. The mask is a single linear gradient pointing up that slope, from
 * (1 - amplitude) alpha at the sheet's dark end to full alpha at its lit end, so
 * the ink thins out into the shadow exactly where the paper does.
 *
 * The angle has to be computed in the element's PRE-TRANSFORM box (a mask is
 * applied before the transform), and CSS gradient angles are measured from "to
 * top" clockwise, so the direction of increasing light (du/W, dv/H) becomes
 * atan2(du / ratio, -dv).
 */
function lightMask(ramp, ratio) {
  const [du, dv] = ramp;
  const amp = Math.min(0.55, Math.hypot(du, dv) * 1.15);
  if (amp < 0.03) return null;                       // an even sheet: no mask
  const deg = Math.atan2(du / ratio, -dv) * 180 / Math.PI;
  const lo = Math.round((1 - amp) * 100) / 100;
  return `linear-gradient(${deg.toFixed(1)}deg, rgb(0 0 0 / ${lo}) 0%, rgb(0 0 0 / 1) 100%)`;
}

/**
 * Type size, in cqw of the writing area.
 *
 * The whole point is that the type belongs to the piece of paper, so it is
 * sized as a fraction of that paper and never in viewport units. The estimate
 * is a weighted character count rather than a measurement, because measuring
 * means a layout read and this runs before the engine caches its geometry —
 * uppercase Archivo at wdth 78 / wght 700 with §5's tracking runs a shade under
 * 0.6em per average character (calibrated in the browser against all eight
 * sheets, worst case 0.61), with I/J/L/T/F and the punctuation well under that and
 * M/W well over.
 *
 * Clamped at both ends: a two-word name must not balloon to fill a clipboard,
 * and a long one must not shrink past the point where ink stops being ink and
 * starts being grey mush. The lower clamp is what the narrow-mode note in the
 * header is about — see §5's container query.
 */
const NARROW = new Set([...'IJLTF1.,-()\'’ ']);
const WIDE   = new Set([...'MW']);

/* ── THE SETTING, DECLARED ONCE ────────────────────────────────────────────
   These four numbers describe what a line of this type actually occupies, and
   §5 INTERPOLATES the first three into the stylesheet rather than repeating
   them. That is the fix for the defect this section carried: the solve below
   fitted the glyph ADVANCES to 100% of the writing area, and §5 then added
   0.015em of tracking to every character, 0.08em to every space and a 0.02em
   blur to the whole run — none of which the estimate knew about. The longest
   line therefore came out 2–4% wider than the sheet it had been solved for, and
   `.ccc-ink` is `overflow: hidden`, so the last glyph was sheared off: EXCEPTIO
   REPORT on the left clipboard, PRINT OU on the printer sheet. An estimator that
   does not measure its own output's tracking is not an estimator.

   CHAR_EM   mean advance of an uppercase character, Archivo wdth 78 / wght 700,
             calibrated in the browser against all eight sheets.
   TRACK_EM  §5's letter-spacing. Paid once per character, INCLUDING the last.
   WORD_EM   §5's word-spacing. Paid once per space.
   BLUR_EM   §5's `filter: blur(0.02em)` spreads the final stroke past the
             advance width; the clip edge does not care that it is soft. */
const CHAR_EM  = 0.62;
const TRACK_EM = 0.015;
const WORD_EM  = 0.08;
const BLUR_EM  = 0.02;

/* Even with the tracking modelled, a character-count estimate is an estimate:
   measured across ten desktop widths the residual runs ±2% either way, because
   Chromium quantises glyph advances at the 12–20px these sheets actually render
   at. FILL is the margin that swallows it. The longest line is set to 95% of the
   writing area and never to 100%, which is also simply how a printer sets a
   heading — type that runs dead into the edge of the paper reads as an accident
   even when it technically fits. */
const FILL = 0.95;

/* Below MIN_FS the ink stops being ink and starts being grey mush; above MAX_FS
   a two-word name balloons to fill a clipboard. */
const MIN_FS = 9.5;
const MAX_FS = 20;

/** One line's width, in em of the title size, with the setting paid for. */
function measure(line, track = TRACK_EM) {
  const text = line.toUpperCase();
  let em = 0;
  let spaces = 0;
  for (const ch of text) {
    em += (NARROW.has(ch) ? 0.62 : WIDE.has(ch) ? 1.34 : 1) * CHAR_EM;
    if (ch === ' ') spaces++;
  }
  return em + text.length * track + spaces * WORD_EM + BLUR_EM;
}

/**
 * Solve the title size, in cqw of the writing area, from the longest line.
 *
 * Returns `{ fs, track }`. `track` is normally §5's own 0.015em; it is tightened
 * — once, and never past −0.005em — only when a name would otherwise have to be
 * set below MIN_FS to fit its paper. Closing up the setting on a narrow measure
 * is what a printer does with a long word; shrinking the type until it stops
 * being legible is not, and clipping it is worse than either.
 *
 * None of the eight surfaces needs the tightening today: the tightest, the pass
 * card's "DISCOUNT CLOSE", solves to just under 12cqw. It is here so that a
 * renamed tool degrades to tight-but-whole instead of to a sheared last glyph.
 */
function fitType(lines) {
  const longestAt = (track) => lines.reduce((n, s) => Math.max(n, measure(s, track)), 0.001);

  let track = TRACK_EM;
  let fs = (FILL * 100) / longestAt(track);

  if (fs < MIN_FS) {
    track = -0.005;
    fs = (FILL * 100) / longestAt(track);
  }

  return { fs: Math.max(MIN_FS, Math.min(MAX_FS, fs)), track };
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 5 · STYLES — injected once, idempotent, namespaced under .ccc-ink
 * ─────────────────────────────────────────────────────────────────────────────
 * Every colour, face and curve is read through `var(--ccc-…, fallback)` so
 * theme.css §13 can dress this module the way it dresses overlay.js and
 * chefwall.js, and so this file still stands alone with no theme at all.
 *
 * CLASS HOOKS FOR THE CSS AGENT — this is the contract, please style through it
 * rather than around it:
 *
 *   .hotspot--lettered        the hotspot button, marked. Nothing else changes
 *                             about it; the reticle, dot, label and 44px floor
 *                             are all still theme.css §09's.
 *   .ccc-ink                  the sheet plane. Carries the transform and IS the
 *                             container the type is sized against. Do not put a
 *                             second transform on it — compose with --lbl-*.
 *   .ccc-ink__sheet           the flow box; carries the light mask.
 *   .ccc-ink__kicker          the small pre-printed word above the title.
 *   .ccc-ink__title           the tool's name.
 *   .ccc-ink__line            one line of it.
 *   .ccc-ink__rule            the ink rule under the title.
 *   .ccc-ink__meta            "Tap to open".
 *   .ccc-ink__form            the faint pre-printed form rules (clipboards).
 *   [data-ink-surface]        card | clipboard | printout | counter-card
 *   [data-ink-room]           prep | office | pass
 *
 *   --lbl-x/-y/-w/-h          the sheet's box, in % of the hotspot. Written
 *   --lbl-transform           inline by §6 from the measured quad. Read only —
 *                             a second transform on .ccc-ink destroys the fit.
 *   --lbl-ink                 the sampled ink colour for THIS sheet
 *   --lbl-alpha               its resting alpha (default .94; 1 on engage)
 *   --lbl-fs                  title size, in cqw of the writing area
 *   --lbl-track               tracking, in em. Written only when §4 had to close
 *                             the setting up to keep a long name whole.
 *   --lbl-reveal              0..1, the arrival gate, off --enter
 *   --lbl-light               0.7..1, the density, off --bloom
 *   --lbl-mask                the sheet's own light ramp, as a mask gradient
 *   --ccc-label-font          face override (defaults to --ccc-font-ui)
 *   --ccc-label-show          set to 0 from a media query to take the ink off a
 *                             breakpoint without touching this file. This is
 *                             the switch to reach for on mobile if the decision
 *                             about narrow viewports is ever revisited —
 *                             see §5's container query and the header note.
 * ────────────────────────────────────────────────────────────────────────── */

const STYLE_ID = 'ccc-labels-css';

const CSS = `
/* ⚠ THESE THREE REGISTRATIONS ARE LOAD-BEARING, NOT DECORATION.
   An UNREGISTERED custom property substitutes as a token stream, and Chromium
   will not evaluate a clamp() that arrives that way into the middle of another
   calc(): --lbl-reveal came out as 1 at every value of --enter, the gate
   vanished, and the ink was simply always on — which looks plausible and is
   wrong. Registering the property with syntax "<number>" makes it compute to a
   NUMBER at its own declaration, before anything multiplies it. It also makes
   the three interpolatable, which is what gives the reveal a real curve instead
   of a step. theme.css §01 registers the engine's six for the first reason and
   names the third. Do not "simplify" these away. */
@property --lbl-alpha  { syntax: "<number>"; inherits: true;  initial-value: 0.94; }
@property --lbl-reveal { syntax: "<number>"; inherits: false; initial-value: 1; }
@property --lbl-light  { syntax: "<number>"; inherits: false; initial-value: 1; }

.hotspot--lettered { --lbl-alpha: .94; }

.ccc-ink {
  position: absolute;
  left:   var(--lbl-x);
  top:    var(--lbl-y);
  inline-size: var(--lbl-w);
  block-size:  var(--lbl-h);

  /* The plane. transform-origin 0 0 is what makes the fit in §4 valid — the
     affine is solved for a source rectangle whose own top-left is the origin. */
  transform: var(--lbl-transform);
  transform-origin: 0 0;

  /* The writing area is its own container, so every size below is a fraction of
     THIS PIECE OF PAPER. That is the difference between type that was printed
     on the card and type that happens to be lying over it. */
  container-type: inline-size;

  pointer-events: none;          /* the button underneath owns every pixel */
  overflow: hidden;

  /* ── INK COMES UP WITH THE LIGHTS ────────────────────────────────────────
     Two of the engine's own numbers, no rAF, no timer, no second animation.

       --lbl-reveal  the gate — now literally the same number theme.css §05
                     declares on .stage for the chips, the hotspot layer and
                     the screen band, so ink and object appear together by
                     construction rather than by two formulas agreeing. Its own
                     copy of that window used to open at --enter 0.58 and not
                     finish until 0.78, which put the writing on the paper
                     LATER than the paper itself; --cut settles the pair.
       --lbl-light   the density. --bloom is the engine's lights-come-up ramp
                     (easeOutQuint over the first 55% of the room's scrub), so
                     the writing starts at 82% and darkens to full as the room
                     finishes lighting. That is the beat: the paper brightens,
                     and what is written on it resolves out of it. The floor
                     was 70%, which was a legibility cost paid for a beat you
                     cannot see: the ink is already paper-colour x 0.235, and
                     the whole point of the label is that it can be READ before
                     the lights are up.

     ⚠ NO NESTED calc() INSIDE THE clamp(). Written with the middle argument
     wrapped as calc((var(--enter) - .52) * 3.1), the whole expression silently
     evaluates to 1 at every value of --enter in Chromium — the gate is gone and
     the ink is simply always on, which looks fine and is wrong. Use the bare
     infix form, exactly as theme.css §09's own --own clamp does. */
  --lbl-reveal: var(--cut, 1);
  --lbl-light:  calc(0.82 + 0.18 * var(--bloom, 1));
  opacity: calc(var(--ccc-label-show, 1) * var(--lbl-alpha)
                * var(--lbl-reveal) * var(--lbl-light));
  transition: opacity 220ms var(--ease-out, cubic-bezier(.22,.61,.36,1));
}

.ccc-ink__sheet {
  block-size: 100%;
  display: flex;
  flex-direction: column;
  align-items: var(--lbl-align, flex-start);
  justify-content: flex-start;
  text-align: var(--lbl-text-align, start);

  color: var(--lbl-ink, #4a453f);
  font-family: var(--ccc-label-font, var(--ccc-font-ui, var(--font-text, system-ui, sans-serif)));
  font-size: calc(var(--lbl-fs, 14) * 1cqw);
  font-weight: 700;
  font-stretch: 78%;
  line-height: 1.02;
  /* ⚠ §4 SOLVES AGAINST THESE. They are interpolated from TRACK_EM / WORD_EM so
     the estimator and the stylesheet cannot drift apart — that drift is what
     clipped the two narrowest sheets. Change them there, not here. */
  letter-spacing: var(--lbl-track, ${TRACK_EM}em);
  word-spacing: ${WORD_EM}em;
  text-transform: uppercase;
  -webkit-font-smoothing: antialiased;

  /* THE LAST TELL. Everything above can be right and the ink still reads as an
     overlay, because vector type is perfectly sharp and the photograph it is
     printed on is not: these plates are soft, and each card's own pre-printed
     heading is softer still. A blur of 0.02em — a third of a pixel at the size
     this actually renders — puts the ink on the same optical footing as the
     paper without costing a single point of legibility. It is a static filter,
     so it rasters once and never again; nothing here animates but opacity. */
  filter: blur(${BLUR_EM}em);

  /* the light falling across this sheet */
  -webkit-mask-image: var(--lbl-mask, none);
          mask-image: var(--lbl-mask, none);
}

.ccc-ink__kicker {
  font-size: 0.42em;
  font-weight: 600;
  font-stretch: 70%;
  letter-spacing: 0.2em;
  opacity: .72;
  margin-block-end: 0.12em;
}

.ccc-ink__title { display: block; }
.ccc-ink__line  { display: block; white-space: nowrap; }

.ccc-ink__rule {
  inline-size: 100%;
  block-size: 0;
  margin-block-start: 0.34em;
  border-block-start: max(0.5px, 0.05em) solid currentColor;
  opacity: .6;
}

.ccc-ink__meta {
  font-size: 0.38em;
  font-weight: 600;
  font-stretch: 68%;
  letter-spacing: 0.26em;
  opacity: .62;
  margin-block-start: 0.7em;
  white-space: nowrap;
}

/* Pre-printed form rules, for the two clipboards and the printer sheet: their
   stock is blank in the photograph, and a title alone on a blank sheet reads as
   a sticker stuck to it rather than as something the sheet was printed with. */
.ccc-ink__form {
  inline-size: 100%;
  /* leftover space only — 1 1 0 with no minimum means that on a short sheet
     the form rules simply are not printed rather than pushing the title off the
     paper. Everything above is flex: 0 0 auto, so the title always wins. */
  flex: 1 1 0;
  min-block-size: 0;
  margin-block-start: 0.55em;
  opacity: .3;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--lbl-form-gap, 0.62em) - max(0.5px, 0.04em)),
    currentColor calc(var(--lbl-form-gap, 0.62em) - max(0.5px, 0.04em)),
    currentColor var(--lbl-form-gap, 0.62em));
}

/* Engaged: the sheet is under the reticle, so the ink firms up a little. Ink
   does not glow — this is contrast, not a highlight. */
.hotspot--lettered:is(:hover, :focus-visible) .ccc-ink { --lbl-alpha: 1; }

/* ── the writing area gets too small to be writing ──────────────────────────
   Below roughly a 1180px stage the smallest of these sheets is ~70px of paper.
   The title survives that; the furniture around it does not, so it goes, and
   the title takes the room back. */
@container stage (max-width: 1180px) {
  .ccc-ink__meta,
  .ccc-ink__form,
  .ccc-ink__kicker { display: none; }
  .ccc-ink__rule   { margin-block-start: 0.26em; }
  /* No size bump here, tempting as it is. §4's FILL is a 5% margin over an
     estimate whose own residual is ±2%; a 1.06 multiplier spends all of it and
     three of the four prep cards start clipping their longest line again. The
     furniture coming off is what gives the title its room. */
}

/* Reduced motion: the ink is simply already dry. No reveal, no transition. */
@media (prefers-reduced-motion: reduce) {
  .ccc-ink {
    --lbl-reveal: 1;
    --lbl-light: 1;
    opacity: calc(var(--ccc-label-show, 1) * var(--lbl-alpha));
    transition: none;
  }
}

/* Forced colours: theme.css §18 repaints .hotspot as Canvas/CanvasText, so the
   photograph — and therefore the paper this ink is printed on — is gone. The
   button's border and its accessible name carry it from there. */
@media (forced-colors: active) {
  .ccc-ink { display: none; }
}
`;

function ensureStyles(doc) {
  try {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  } catch (_) { /* a CSP-blocked <style> leaves working, unlettered hotspots */ }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 6 · BUILD
 * ────────────────────────────────────────────────────────────────────────── */

function spotFor(room, slug) {
  return (HOTSPOTS[room] || []).find((s) => s.slug === slug) || null;
}

function buildInk(rec, spot, doc) {
  const plane = fitPlane(zoneQuad(rec.quad, rec.zone), spot);
  if (!plane) return null;                 // a degenerate quad letters nothing
  const mask  = lightMask(rec.ramp, plane.ratio);
  const type  = fitType(rec.lines);

  const ink = doc.createElement('div');
  ink.className = 'ccc-ink';
  // aria-hidden is the whole a11y story: `.hotspot-label` is still the button's
  // accessible name, so the tool is announced once, not twice.
  ink.setAttribute('aria-hidden', 'true');
  ink.dataset.inkRoom = rec.room;
  ink.dataset.inkSurface = rec.surface;

  const style = [
    `--lbl-x:${plane.left.toFixed(3)}%`,
    `--lbl-y:${plane.top.toFixed(3)}%`,
    `--lbl-w:${plane.width.toFixed(3)}%`,
    `--lbl-h:${plane.height.toFixed(3)}%`,
    `--lbl-transform:${plane.transform}`,
    `--lbl-ink:${inkColour(rec.paper)}`,
    `--lbl-fs:${type.fs.toFixed(2)}`
  ];
  // Only written when §4 had to close the setting up to keep a name whole; the
  // stylesheet's own TRACK_EM default stands for every sheet that did not.
  if (type.track !== TRACK_EM) style.push(`--lbl-track:${type.track.toFixed(4)}em`);
  if (mask) style.push(`--lbl-mask:${mask}`);
  if (rec.align === 'center') style.push('--lbl-align:center', '--lbl-text-align:center');
  ink.setAttribute('style', style.join(';'));

  const sheet = doc.createElement('div');
  sheet.className = 'ccc-ink__sheet';

  if (rec.kicker) {
    const k = doc.createElement('span');
    k.className = 'ccc-ink__kicker';
    k.textContent = rec.kicker;
    sheet.appendChild(k);
  }

  const title = doc.createElement('span');
  title.className = 'ccc-ink__title';
  rec.lines.forEach((text) => {
    const line = doc.createElement('span');
    line.className = 'ccc-ink__line';
    line.textContent = text;
    title.appendChild(line);
  });
  sheet.appendChild(title);

  if (rec.rule !== false) {
    const rule = doc.createElement('span');
    rule.className = 'ccc-ink__rule';
    sheet.appendChild(rule);
  }

  if (rec.meta) {
    const meta = doc.createElement('span');
    meta.className = 'ccc-ink__meta';
    meta.textContent = rec.meta;
    sheet.appendChild(meta);
  }

  if (rec.rules) {
    const form = doc.createElement('span');
    form.className = 'ccc-ink__form';
    form.style.setProperty('--lbl-form-gap', `${rec.rules.toFixed(2)}em`);
    sheet.appendChild(form);
  }

  ink.appendChild(sheet);
  return ink;
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 7 · initLabels
 * ─────────────────────────────────────────────────────────────────────────────
 * Called by app.js once #kitchen exists and before the engine measures — this
 * appends children to existing buttons and changes no document height, so the
 * order is a courtesy rather than a requirement.
 *
 * Idempotent: a second call replaces the ink instead of stacking a second copy.
 * ────────────────────────────────────────────────────────────────────────── */

export function initLabels(options = {}) {
  const root = options.root || document;
  const doc  = root.ownerDocument || document;

  ensureStyles(doc);

  let lettered = 0;
  for (const rec of SURFACES) {
    const spot = spotFor(rec.room, rec.slug);
    if (!spot || !Number.isFinite(spot.w) || !Number.isFinite(spot.h)) {
      // rooms.js moved the object out from under us. Not fatal: the hotspot,
      // its reticle and its label are untouched and still open the tool.
      console.warn(`[labels] no hotspot geometry for ${rec.room}/${rec.slug}`);
      continue;
    }

    const button = root.querySelector(
      `#room-${rec.room} .hotspot[data-tool="${rec.slug}"]`
    );
    if (!button) continue;

    const existing = button.querySelector(':scope > .ccc-ink');
    if (existing) existing.remove();

    const ink = buildInk(rec, spot, doc);
    if (!ink) continue;
    button.classList.add('hotspot--lettered');
    button.appendChild(ink);
    lettered++;
  }

  return { lettered, surfaces: SURFACES.length };
}

export default initLabels;
