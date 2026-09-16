/* =============================================================================
 * Cook County Cooks — v4 "Alive"
 * assets/wallprint.js  ·  THE SHEET ON THE WALL
 * -----------------------------------------------------------------------------
 * The client, on the Commission Payouts tool:
 *
 *   "Move it out of the host stand and into the back office, as a graphic that
 *    looks like the HTML file was printed and hung on the wall to the left of
 *    the TV."
 *
 * So this is not a screen, not a label and not a card. It is ONE PIECE OF PAPER
 * someone ran off the office printer and taped to the navy wall — drawn, not
 * photographed, because a real printed page is what the tool IS. Drawing it
 * gives us live type at any viewport and saves re-shooting a room whose
 * square-on monitor took four attempts to get right.
 *
 * rooms.js owns where it hangs:
 *
 *     { slug:'commission-payouts', kind:'print', x:9.0, y:25.0,
 *       w:12.0, h:17.0, label:'Commission Payouts 2026', rotate:-1.4 }
 *
 * app.js dispatches `kind:'print'` here and nowhere else. Everything below is
 * composed from that box, the engine's published numbers, and the table in §2.
 *
 * ── AND THEN THE CLIENT ASKED FOR A SECOND ONE ──────────────────────────────
 *
 *   "One other quick edit. I want to post this as if it's a note hanging in the
 *    freezer."
 *
 * So there are two sheets now, and they are deliberately not the same sheet in
 * two places. The Back Office one is landscape, on warm stock, taped to navy
 * paint, lit by a pendant to its right. The walk-in's is PORTRAIT, on cool
 * stock, held to brushed steel by a magnet, lit from a ceiling fixture almost
 * directly above it, and it hangs in a room that goes eight times darker before
 * the lights come up. Every one of those is a measurement off its own plate,
 * and each one is argued where it is used:
 *
 *   the stock and the ink ......................... §1b
 *   what the note says, and where it came from .... §2b
 *   the shadow, the exposure floor, the cockle,
 *   the magnet, the document, the breakpoints ..... §5, "THE SECOND SURFACE"
 *   how it finds its tool, and why it does not
 *   exist at all while the walk-in is locked ...... §7
 *
 * That last one is the important one. The walk-in's tool is encrypted; its
 * slug, its name and its URL are not in this repository and must never be
 * written into it. Read §7 before touching anything about how this module
 * resolves a hotspot to a tool.
 *
 * ── WHY THE SHEET IS LANDSCAPE ──────────────────────────────────────────────
 * Because the measured box says so, and the box is right. .hotspots is sized to
 * the plate's COVER box (theme.css §06), whose aspect is the plate's own
 * 2400x1340 — so 12.0% of width by 17.0% of height is 288 x 227.8 PLATE PIXELS,
 * i.e. 1.264:1. Landscape US Letter is 11/8.5 = 1.294:1. That is a 2.3% match,
 * not a coincidence: the page being printed is a wide grid of six payout
 * tables, and landscape is how anybody would actually run it off. The sheet
 * therefore fills its box rather than being letterboxed inside it.
 *
 * ── WHAT IS BEHIND IT, MEASURED — AND WHY THE BOX MOVED ─────────────────────
 * plates/office.4e4c6d7172.webp has a wall CORNER — a dead-vertical seam at plate-x
 * 22.21% (re-traced for this pass by column-differencing the plate at fourteen
 * heights: 21.92 to 22.25 over the nine bands that are wall, mean 22.19, i.e.
 * it moves 0.33% over the height of the wall and the published figure holds).
 *
 * The first cut of this sheet ran 11.5 → 27.0, so 69% of it sat on the left
 * return wall and 31% on the lit back wall, and the client read exactly that:
 *
 *   "I also want to reduce the size of the Commission Report on the Back
 *    Office Page because it looks like it's taped to both walls on the screen."
 *
 * He was right. The seam is a soft tonal step rather than an architectural
 * line, which is why it was signed off the first time — but a sheet of paper
 * spanning it still reads as a page bent around a corner, because the light on
 * one side of it does not match the light on the other. rooms.js now runs the
 * box 9.0 → 21.0, ENTIRELY ON THE RETURN WALL, with 1.21% of plate width
 * between the sheet's box and the seam. MEASURED against the shipped plate,
 * the widest thing this module paints:
 *
 *     paper's own right edge, with the plane's -1.4deg  ...  plate-x 21.11
 *     the top-right tape tab, which overhangs it by 3.6cqw   plate-x 21.32
 *     the contact shadow, thrown down and LEFT                (further left)
 *
 * so the nearest painted pixel to the corner is 0.89% of the plate away from
 * it, at every viewport and at every point of the push-in (measured at 2560,
 * 1920, 1600, 1440, 1366 and 1024: max 21.114 for the box at all six).
 *
 * The wall the sheet now hangs on is FLATTER than the one it used to span:
 * mean rgb(18.9 16.6 31.8), std dev 2.9/2.5/2.2 per channel over the new box
 * against 6.8/8.5/11.1 over the old one — the old figure was carrying the
 * corner's own ambient occlusion, and this box has none of it. The paper's
 * sheen is still lit from the pendant at plate-x ~50%, i.e. up and to the
 * RIGHT, and its contact shadow is still thrown down and to the LEFT. Both are
 * derived from the plate, neither is guessed.
 *
 * ── WHAT MAKES IT READ AS PAPER AND NOT AS A PANEL ──────────────────────────
 * 1. IT IS NOT WHITE.  #f0ece2 — a warm off-white with the room's own cast in
 *    it. Pure #fff on a photograph is the single loudest "this is a div" tell.
 * 2. IT IS NOT FLAT.  Two crossed sheens (a broad one from the pendant, a
 *    narrow cool one from the wall bounce) and a bottom-left corner that has
 *    CURLED off the wall — the paper's silhouette is clipped there, so the
 *    contact shadow follows the curl instead of squaring it off.
 * 3. IT IS HELD UP.  Two tape tabs across the top corners, translucent and
 *    overhanging the paper onto the wall, which is where the client's word
 *    "hung" actually lives.
 * 4. THE SHADOW IS A CONTACT SHADOW.  Two drop-shadows, both sized in cqw of
 *    the sheet: a tight dark one at the edge and a wide soft one thrown down
 *    and left. Sized in cqw, so it is the same shadow at 1024 and at 2560.
 * 5. IT LIGHTS WITH THE ROOM.  §4 re-derives theme.css §06b's --lit from the
 *    engine's own --enter / --bloom / --p and grades the sheet with it, so the
 *    paper is a dim grey rectangle in a room that is still "before service"
 *    and comes up to full exposure exactly as the practicals do.
 * 6. THE TYPE IS SIZED IN cqw OF THE PAPER.  Not in px, not in viewport units.
 *    A caption is a fraction of THIS SHEET at every width and every point of
 *    the push-in.
 *
 * ── WHY THIS IS NOT labels.js ───────────────────────────────────────────────
 * labels.js is the right module for ink on a PHOTOGRAPHED object: it fits a
 * least-squares affine to four measured corners, samples that sheet's own lit
 * paper colour off the plate, derives the ink as paper x 0.255, and fits a
 * luminance ramp over it. Every one of those four inputs is a measurement of a
 * piece of paper that exists in the photograph.
 *
 * This piece of paper does not exist in the photograph. There is no quad to
 * fit (the sheet is frontal, with rooms.js's own 1.4 degrees of "taped up
 * slightly crooked"), no paper colour to sample (we are choosing it), and no
 * ramp to measure (the wall's ramp is the corner's, and the sheet is not in the
 * corner). What is more, labels.js prints a NAME — two or three words solved to
 * fill a writing area — and this is a DOCUMENT: a title, a rule, six tables and
 * a footer, which is a layout problem and not a type-fitting one.
 *
 * So the module is its own, and it keeps labels.js's ideas rather than its
 * code, deliberately and item for item:
 *   · ink is paper x a reflectance (0.255, labels.js §3's own constant), so the
 *     ink is a warm dark grey that came from the paper and never from a palette;
 *   · type is sized in cqw of the sheet, never in viewport units;
 *   · the arrival gate is the engine's numbers, with no rAF and no timer;
 *   · the drawing is aria-hidden and `.hotspot-label` remains the accessible
 *     name, so the tool is announced exactly once;
 *   · no mix-blend-mode (theme.css §06 forbids it and .hotspots is an isolated
 *     stacking context anyway, so it would be a no-op — see labels.js's note).
 *
 * ── WHAT THIS MODULE MAY NOT DO ─────────────────────────────────────────────
 *   · It must never write --p / --plate-scale / --plate-x / --plate-y /
 *     --enter / --bloom. It only reads them. In particular --plate-x and
 *     --plate-y are registered `<number>`: writing either with a `%` unit is
 *     rejected at parse and silently kills the parallax. This module writes
 *     neither, and nothing below interpolates them.
 *   · It must not carry a per-frame TRANSFORM. theme.css §06's contract gives
 *     that to .plate-wrap and .hotspots alone. The sheet's rotate is static.
 *   · It must not carry a blend mode.
 *   · Zero layout reads. Every number is resolved by the compositor from
 *     percentages and cqw.
 *
 * Plain ES module. No build step, no npm, no framework.
 * ========================================================================== */


/* ─────────────────────────────────────────────────────────────────────────────
 * 1 · THE PAPER, AS COLOUR
 * ─────────────────────────────────────────────────────────────────────────────
 * PAPER is the sheet's lit colour: a warm off-white, three points down from
 * white on red and fourteen on blue, so it carries the room's tungsten without
 * going cream. The MODEL for the ink is PAPER x INK_REFLECTANCE, which is
 * labels.js §3's model and its number — a printed mark is not a colour, it is
 * the same paper returning about a quarter of the light it was going to return
 * anyway. That model gives rgb(61 60 58), and it is not what ships; the note
 * on INK_CSS below says why, and it is the same argument §1b makes for the
 * walk-in's stock.
 *
 * The floor this build is held to is 7:1, measured on the PIXELS THAT SHIP and
 * not in the stylesheet — and measured as the FLOOR of several frames rather
 * than as one reading, because the sheet is rasterised under a moving scale.
 * The as-shipped table is at the end of this section.
 * The hairlines are rules, not type, and are not held to it.
 * ────────────────────────────────────────────────────────────────────────── */

const PAPER = [240, 236, 226];
const INK_REFLECTANCE = 0.255;

const rgb = (c) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
const inkFrom = (paper) =>
  paper.map((v) => Math.round(Math.max(0, Math.min(255, v * INK_REFLECTANCE))));

const PAPER_CSS = rgb(PAPER);

/* ⚠ THE MODEL IS NOT THE SHIPPED VALUE, and §1's note above says why. What
   inkFrom(PAPER) gives is rgb(61 60 58), and that is the DERIVATION — a printed
   mark returning a quarter of the light the paper returns. What ships is
   rgb(31 31 29), which is the same mark RASTERISED at 7.8 to 8.6 CSS px on a
   surface that is then scaled 1.12 to 1.22 by .hotspots' own transform. This is
   §1b's argument, run for the second time and on the other sheet, and it only
   became necessary when rooms.js moved this one off the wall corner and took
   41% of its area with it.

   MEASURED, the FLOOR of three lit frames (--p 0.45 / 0.50 / 0.55) at each of
   1024x768, 1366x768, 1440x900, 1920x1080 and 2560x1440, darkest painted pixel
   against the lightest paper pixel beside it, with every other element on the
   sheet set to visibility:hidden so no neighbouring row can bleed into the crop
   through the plane's 1.4 degrees:

       body ink at rgb(61 60 58) ..... 4.50 : 1   the model
       body ink at rgb(42 42 40) ..... 5.48 : 1
       body ink at rgb(31 31 29) ..... 7.68 : 1   with §5's weights and stroke

   Taking the FLOOR of several frames rather than one reading is the change of
   method that matters here, and it is forced by the same subpixel phase §1b
   documents: the identical string measured 5.46:1 and 9.59:1 two frames apart
   at 1920x1080 with nothing changed but where the sheet landed on the pixel
   grid. .hotspots is scaled by --overscan-k AND by --plate-scale, which is
   still moving while the room dollies, so a single frame proves nothing.

   ── AS SHIPPED ────────────────────────────────────────────────────────────
   The FLOOR, per class, over every element of that class at three lit frames
   (--p 0.45 / 0.47 / 0.53 — the window in which --wp-exp reaches 1 and the
   Back Office still owns the screen) at each of five widths:

                    2560   1920   1440   1366   1024      worst
       title       14.53  14.52  13.70  13.00  13.26      13.00
       kicker      11.10  11.61      —      —      —      11.10
       stamp       12.10  12.44  11.36  10.76      —      10.76
       section     11.24   9.81  11.87   9.18  10.24       9.18
       column head  7.86   9.48  11.00  11.31      —       7.86
       product     10.67  10.64  12.03  10.45  11.44      10.45
       GP figure    7.68   8.41      —      —      —       7.68
       payout       8.69   9.98  10.57   9.09   9.79       8.69
       footer      11.17  16.43  11.11  14.95   8.84       8.84

   ⚠ WITH ARCHIVO ACTUALLY LOADED. The face comes from Google Fonts and is the
   one thing on this page that is not in the repository; measured against the
   system fallback the same table floors at 7.83, and the difference is not
   noise — Archivo is a VARIABLE face on a wdth axis, so every font-stretch on
   this sheet is a real instance rather than a no-op, and a narrower instance
   is a thinner stem. Measure with the font, or you are measuring something
   else.

   The gaps are classes that are not on the page at that width rather than
   classes that failed: the GP column is off the sheet below 216px of container
   and the eyebrow below 180px (§5's ladder), and the stamp is off it inside
   the 4:3 crop band (§5's media block). Nothing that IS printed measures under
   7.68:1 at any width at any of the three frames. Before this pass, by the
   same method, the same sheet floored at 3.37:1.

   The hairlines are rules, not type, and are not held to this. */
const INK_CSS   = rgb([31, 31, 29]);
/* The commission column. The live page prints the rep's own number in green and
   the store's GP in black; keeping that distinction is the entire point of the
   sheet, so the green is kept and darkened until it clears 7:1 on this paper. */
const INK_PAY   = 'rgb(4 34 21)';
/* Secondary: kicker, date stamp, column heads, the GP column. It is only a
   shade off the body ink now, and that is deliberate — at this size the
   hierarchy is carried by SIZE and WIDTH, exactly as §1b argues for the cold
   sheet, because a secondary ink light enough to read as secondary is an ink
   that cannot reach the floor. */
const INK_SOFT  = 'rgb(38 38 35)';


/* ─── 1b · THE SECOND STOCK: THE SHEET IN THE WALK-IN ────────────────────────
 * The same model, one room over, and every number in it re-derived rather than
 * copied — because the wall it hangs on is a different wall.
 *
 * MEASURED off plates/freezer.01697f04b3.webp over the note's own box (plate-x 57.4-68.6,
 * plate-y 36-62): mean rgb(132 162 192), std 41/35/30. That is not the Back
 * Office's near-black navy paint (mean rgb 21 21 38); it is BRIGHT, SPECULAR,
 * BLUE-CAST brushed steel under a close ceiling fixture. Three consequences,
 * all of them visible:
 *
 * 1. THE PAPER IS COOLER, NOT WARMER. Office stock is rgb(240 236 226) — three
 *    points down from white on red, fourteen on blue, i.e. tungsten. This wall
 *    has no tungsten in it. COLD_PAPER runs the other way: rgb(230 236 243),
 *    thirteen down on red and twelve on green, so the sheet picks up the room's
 *    own blue instead of contradicting it. Paper that stays warm in a walk-in
 *    is the same tell as paper that is pure white on a photograph.
 * 2. THE INK IS THE SAME MODEL, RUN TO A DIFFERENT ANSWER. paper x 0.255 —
 *    labels.js §3's reflectance, and §1's — gives rgb(59 60 62). That is the
 *    DERIVATION. It is not the shipped value; see below.
 * 3. THE EXPOSURE FLOOR IS LOWER — see §5's "THE SECOND SURFACE" block.
 *
 * ── WHY THE SHIPPED INK IS DARKER THAN THE MODEL ────────────────────────────
 * The reflectance model describes a printed MARK. What ships is a RASTERISED
 * one, and at the sizes this document actually sets — 6.3 to 9.1 CSS px — the
 * two are a long way apart, because no pixel in a 6px stem ever reaches full
 * ink coverage.
 *
 * MEASURED, darkest painted pixel against the lightest paper pixel beside it,
 * on the shipped render at 1440x900, same colour, same size, three weights:
 *
 *     rgb(59 60 62) at font-weight 500 ...... 74% ink coverage ...... 3.4:1
 *     rgb(59 60 62) at font-weight 600 ...... 83% ink coverage ...... 6.2:1
 *     rgb(59 60 62) at font-weight 700 ...... 91% ink coverage ...... 8.0:1
 *
 * i.e. WEIGHT, not colour, is the dominant term. Two things moved as a result
 * and both are deliberate: every text class on this sheet is font-weight 600 or
 * 700 (the conditions were 500 and are now 700 — see .ccc-wp__cond in §5), and
 * the inks came down from the model's rgb(59 60 62) to rgb(40 42 45).
 *
 * THE THIRD TERM IS THE SUBPIXEL PHASE, and it is the reason for the margin.
 * The same string at the same size measured 6.20:1 at 1440x900 and 8.92:1 at
 * 1024x768 with nothing changed but where the sheet landed on the pixel grid —
 * .hotspots carries --overscan-k and the plane carries rooms.js's 1.1 degrees,
 * so no glyph is ever on a whole pixel, and the plate is still scaling under
 * both as --p runs. Everything below is therefore solved to a floor of about
 * 7.5 rather than to 7.0, and verified over the whole range rather than at one
 * frame.
 *
 * AS SHIPPED — the FLOOR of 123 measurements taken off the rendered page at
 * DPR 1: five widths (2560x1440, 1920x1080, 1440x900, 1366x768, 1024x768) x
 * three settle points each (--p 0.10 / 0.30 / 0.55) x every class visible at
 * that step. Darkest painted pixel against the lightest paper pixel beside it,
 * with every other element on the sheet set to visibility:hidden so that no
 * neighbouring row can bleed into the crop through the plane's 1.1 degrees:
 *
 *     title      rgb(40 42 45)  13.39:1      ghead      rgb(44 46 50)  10.29:1
 *     kicker     rgb(44 46 50)  12.03:1      srcline    rgb(44 46 50)   9.43:1
 *     money      rgb(6 42 31)    8.64:1      stamp      rgb(44 46 50)   8.44:1
 *     name       rgb(40 42 45)   8.08:1      footer     rgb(40 42 45)   7.63:1
 *     deduction  rgb(46 4 4)     7.51:1      condition  rgb(44 46 50)   7.18:1
 *
 * Every class clears 7:1 on the pixels that ship, at every width tested, at
 * every point of the arrival. The hairlines are rules, not type, and are not
 * held to that floor — the same exemption §1 takes.
 * ────────────────────────────────────────────────────────────────────────── */

const COLD_PAPER = [230, 236, 243];
/* ⚠ NOT paper x INK_REFLECTANCE, and the difference is the whole of §1b's
   note 3 below. The model gives rgb(59 60 62); the SHIPPED value is darker,
   because the model is about a printed mark and this is about a rasterised
   one. See the measurement table. */
const COLD_INK = [40, 42, 45];

const COLD_PAPER_CSS = rgb(COLD_PAPER);
const COLD_INK_CSS   = rgb(COLD_INK);
/* What the estimate pays. Same idea as INK_PAY and cooled to this stock. */
const COLD_INK_PAY   = 'rgb(6 42 31)';
/* What it takes away — the detractor cut and the floor write-back. The source
   page prints these in its own alert red and the distinction is the point. */
const COLD_INK_CUT   = 'rgb(46 4 4)';
/* Secondary: kicker, stamp, section heads, the condition line under every
   component. */
const COLD_INK_SOFT  = 'rgb(44 46 50)';


/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · THE DOCUMENTS
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO sheets now, in two orientations, keyed by what the hotspot names itself
 * with — `spot.slug` for a tool that ships in plaintext, `spot.object` for one
 * that does not (see §7). `layout` picks the renderer in §6:
 *
 *   'card'  the landscape rate card. Two columns of product tables.
 *   'doc'   the portrait document. One column of components, each with the
 *           condition it is paid under set underneath it.
 *
 * ── 2a · THE BACK OFFICE SHEET  ·  'commission-payouts' ─────────────────────
 * PROVENANCE. Every figure below was read off the live tool on 2026-08-27 —
 * https://blufoxmobile.github.io/Commission-Payouts/ — by fetching the page and
 * extracting its own tables. Nothing here is invented, and nothing is lorem.
 *
 * It is a SUMMARY of that page, not a transcription: the source prints 41 rows
 * across six product tables plus the multi-play and accessory blocks, and this
 * sheet is 288 x 228 plate pixels. What is kept is the top of every table — the
 * rows a rep actually quotes — in the source's own order and with the source's
 * own two columns, GP then commission. What is dropped is the tail of each
 * table (IE / IE Plus / NOW / prepaid on internet; tablets, watches and BAPIS
 * on mobile; NOW TV and NOW Latino; the add-on, protection and home blocks).
 * The footer says so in as many words and points at the full sheet, and the
 * whole object is a button that opens it.
 *
 * If the payouts change, change them HERE and nowhere else. The renderer in §6
 * has no knowledge of what any of these numbers mean.
 * ────────────────────────────────────────────────────────────────────────── */

const SHEET_CARD = {
  layout: 'card',
  kicker: 'Cook County Cooks · C³',
  title:  '2026 Commission Payouts',
  stamp:  'Updated Sept 1, 2026',
  /* Two columns of tables, laid out left then right.

     THREE THINGS CAN BE SHED, and they are shed from the BOTTOM of each table
     in the source's own order, so what survives is always the top of it — the
     rows a rep actually quotes:

       `opt`  on a BLOCK   the whole table goes  (Xfinity Mobile, Multi-Play)
       'opt'  on a ROW     the last row of a table goes   (300 Mbps, NOW TV)
       'opt2' on a ROW     the second-to-last goes too    (500 Mbps, TV Core)
       'opt3' on a ROW     the third-to-last goes too     (Gig, Sports & News)

     Every one of them is driven by a container query in §5, and every query
     spends what it frees on TYPE SIZE. See the ladder at the foot of §5 for
     what comes off at which width and why the trade is the right way round.

     ⚠ 'opt3' IS ALSO A CONTRAST DECISION AND NOT ONLY A SPACE ONE, and that is
     the one place the two arguments meet. "Sports & News" is the longest
     product name on the sheet by 20%, and while it is on the page it caps
     --wp-k at 1.93 (see §5's ceiling note) — which at 165px of container is
     7.96px of body type, and 7.96px of body type floors at 5.15:1. Taking that
     row off makes "TV Premium" the longest name, lifts the cap to 2.24, and is
     what pays for the 8.7px that clears the floor. Two rows of two tables set
     legibly beats three rows of two tables set grey. */
  columns: [
    [
      { head: 'Internet', rows: [
        ['2 Gig',        '$200', '$15'],
        ['1.2 Gig',      '$200', '$15'],
        ['Gig',          '$180', '$11', 'opt3'],
        ['500 Mbps',     '$155',  '$6', 'opt2'],
        ['300 Mbps',     '$110',  '$5', 'opt']
      ] },
      { head: 'Xfinity Mobile', opt: true, rows: [
        ['Mobile Plus',  '$185', '$23'],
        ['Premium',      '$180', '$22'],
        ['Unlimited',    '$140', '$12'],
        ['By the Gig',   '$125', '$10']
      ] }
    ],
    [
      { head: 'TV & Entertainment', rows: [
        ['TV Premium',   '$145', '$15'],
        ['TV Plus',      '$125', '$11'],
        ['Sports & News','$110',  '$7', 'opt3'],
        ['TV Core',       '$75',  '$6', 'opt2'],
        ['NOW TV',        '$25',  '$3', 'opt']
      ] },
      { head: 'Multi-Play Bonus', opt: true, rows: [
        ['Double Play',   '$30', '+$4.50'],
        ['Triple Play',   '$50', '+$7.50'],
        ['Quad Play',     '$70', '+$10.50'],
        /* ⚠ THE EMPTY GP CELL IS DELIBERATE. Accessories pay a percentage of
           the sale and have no fixed gross profit, so the source prints no
           figure for them and neither does this. It was an em dash until the
           contrast pass: an em dash is a bar 0.06em tall, it never reaches full
           ink coverage at 8.4px, and it floored at 5.29:1 — the only mark on
           the page under this build's 7:1. A mark that carries no reading and
           cannot be printed legibly is better not printed. */
        ['Accessories',       '', '20%']
      ] }
    ]
  ],
  colHead: ['GP', 'Comm'],
  foot:    'GP = store gross profit · green = yours',
  footEnd: 'Excerpt — tap for the full sheet'
};


/* ─── 2b · THE WALK-IN NOTE  ·  object 'note' ────────────────────────────────
 * PROVENANCE, same standard as 2a. Fetched 2026-08-28 from the live tool and
 * read out of its own engine — the CFG block, the estimate() function and the
 * strings the page itself prints in its "Where the money comes from" table.
 * Every rate, gate and dollar figure below is that page's own number:
 *
 *   RATE_GP 0.025 · RATE_EXCESS 0.08 · RATE_CR 0.0075 · RATE_NPS 0.0035
 *   CR_GOAL 0.1025 · GP_FLOOR 50000 · NPS_PCT_GATE 0.70 · NPS_DETRACTOR 0.68
 *   NPS_BONUS [[0.80,400],[0.75,200]] (exclusive, highest first)
 *   ELITE_TIERS [[0.05,100],[0.06,300],[0.07,200],[0.08,250]] (cumulative)
 *
 * and the wording of each `cond` is lifted from the row the tool prints for it
 * ("8% of … above the GP goal, paid only on business that clears", "half of all
 * commission is lost", "Stacks +$100 / +$300 / +$200 / +$250 past 5/6/7/8%").
 * Nothing here is invented, nothing is lorem, and no figure was rounded.
 *
 * WHAT IS DROPPED, and the footer says so: the per-store board itself — the
 * twenty-six Greater Chicago and Big South stores, each manager's own metrics,
 * the "closest money on the table" list and the what-if sliders. Those are a
 * live read of the daily sales report and cannot be a still. What survives is
 * the part that does not change between uploads: what the estimate is made of.
 * The whole sheet is a button that opens the live one.
 *
 * ⚠ NO TITLE. There is deliberately no `title` here and there must never be
 * one. The tool's name is a sealed string (rooms.js's note on this hotspot,
 * build/seal-freezer.mjs's leak check) — §6 takes it from the decrypted tool's
 * own `label` at render time, which is the only place it legitimately exists.
 * ────────────────────────────────────────────────────────────────────────── */

const SHEET_NOTE = {
  layout: 'doc',
  kicker: 'Greater Chicago · Big South',
  stamp:  'Estimate only',
  /* `pay` rows print their value in the money ink, `cut` rows in the deduction
     ink; `opt` marks a block or a row the container queries in §5 drop when the
     paper gets small. The renderer in §6 knows nothing about what any of these
     mean — it lays out name / value / condition and stops. */
  blocks: [
    { head: 'What it pays', tone: 'pay', rows: [
      ['Net profit commission', '2.5%',
       'of net GP trend, no ceiling'],
      ['Over-goal bonus', '8%',
       'of GP above goal — only once the store clears $50,000 net GP'],
      ['Close rate bonus', '0.75%',
       'of net GP if fiscal close rate beats 10.25%'],
      ['NPS percentage bonus', '0.35%',
       'of net GP if NPS beats 70.0%'],
      ['NPS flat bonus', '$200 / $400',
       'over 75.0% · over 80.0%, whichever is higher'],
      ['Elite mobile CR tiers', 'up to $850',
       '+$100 / +$300 / +$200 / +$250 past 5 / 6 / 7 / 8%, cumulative', 'opt']
    ] },
    { head: 'What takes it away', tone: 'cut', rows: [
      ['Detractor penalty', '−50%',
       'NPS under 68.0% — half of all commission is lost'],
      ['Floor adjustment', '$0',
       'a negative GP trend is written back, never billed to you', 'opt']
    ] }
  ],
  /* Where the figures come from, in the source's own words. First thing to go
     when the paper gets small: it is provenance, not a payout. */
  note: {
    head: 'Where the numbers come from',
    opt: true,
    lines: [
      'Daily Sales Report · sheet "Store Rank" · 26 stores',
      'Fiscal month runs the 22nd to the 21st'
    ]
  },
  foot:    'Estimate, not payroll',
  footEnd: 'Excerpt — tap for the full sheet'
};

/** Keyed by `spot.slug || spot.object`. §7 resolves; §6 renders. */
const SHEETS = {
  'commission-payouts': SHEET_CARD,
  note: SHEET_NOTE
};


/* ─────────────────────────────────────────────────────────────────────────────
 * 3 · GEOMETRY, SUCH AS IT IS
 * ─────────────────────────────────────────────────────────────────────────────
 * There is exactly one number to compute, and rooms.js supplies it: the tilt.
 * The sheet fills its hotspot box, so there is no fit to solve and no layout to
 * read. `rotate` is applied to the PLANE and not to the button, which is what
 * keeps the hit target axis-aligned (and therefore keeps theme.css §09's 44px
 * minimum meaningful) while the paper hangs crooked.
 * ────────────────────────────────────────────────────────────────────────── */

/** Percent geometry in the form theme.css §09 documents. Mirrors app.js. */
function boxVars(x, y, w, h) {
  return `--x:${x}%;--y:${y}%;--w:${w}%;--h:${h}%`;
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 4 · THE LIGHTS
 * ─────────────────────────────────────────────────────────────────────────────
 * theme.css §06b's --lit is the room's "lights come up" ramp, and it is exactly
 * the number this sheet's exposure wants. It cannot be inherited: --lit, --arr,
 * --hold and --lift are all declared on `.plate-wrap`, and `.hotspots` is
 * .plate-wrap's SIBLING, so a sheet in the hotspot layer resolves --lit to its
 * registered initial-value of 1 and would sit at full exposure in a dark room.
 * That is the defect the brief names, and re-deriving the ramp from the three
 * numbers the engine actually publishes on .stage is the fix. --enter, --bloom
 * and --p all inherit down to here.
 *
 * The re-derivation is theme.css's own, term for term (§06b):
 *
 *     --wp-arr  = clamp(0, (enter - 0.90) * 11, 1)      the arrival tail
 *     --wp-hold = clamp(0, (p - 0.55) * 4, 1)           the departing room
 *     --wp-lit  = clamp(0, 0.52*arr + 0.48*bloom³ + hold, 1)
 *
 * and the exposure is then 0.30 + 0.70 x that. 0.30 is not arbitrary: it is
 * solved from the ratio between the office's dark plate and its lit twin OVER
 * THE SHEET'S OWN BOX, and that box has moved — so the ratio was re-measured
 * for this pass rather than assumed:
 *
 *     old box, plate-x 11.5-27.0 / y 24-46 ... mean L8 8.15 vs 22.23 ... 0.366
 *     new box, plate-x  9.0-21.0 / y 25-42 ... mean L8 6.56 vs 18.17 ... 0.361
 *
 * i.e. the return wall falls off at very nearly the same rate as the pair of
 * walls the old box spanned, which is what you would expect of a room lit by
 * one pendant. Running §5's own f^2.2 / r = constant through the new number
 * gives f = 0.295 against the 0.300 that is here, so THE FLOOR STANDS TO TWO
 * DECIMALS and is left alone. §06's grade sits at 0.68 brightness at the dark
 * end, so the wall this paper hangs on arrives at about a quarter of its
 * service brightness, and paper at 0.30 keeps the same paper-to-wall ratio in
 * the dark room that it has in the lit one. Sheet and wall come up together
 * instead of the sheet glaring out of a room that has not been lit yet.
 *
 * (The published relative-luminance ratio over the same two boxes is 0.275 and
 * 0.314; the L8 figures above are the ones the original derivation used and
 * are quoted so the two are comparable.)
 *
 * ⚠ THREE THINGS THAT LOOK LIKE TIDYING AND ARE NOT.
 *
 * 1. THE THREE PROPERTIES ARE REGISTERED. An unregistered custom property
 *    substitutes as a TOKEN STREAM, and Chromium will not evaluate a clamp()
 *    that arrives that way into the middle of another calc(): the gate resolves
 *    to 1 at every value of --enter, which looks plausible and is wrong. This
 *    is the same trap labels.js §5 documents. Registering with syntax
 *    "<number>" makes each one compute to a NUMBER at its own declaration.
 *
 * 2. NO calc() WRAPPER INSIDE THE clamp()s. Bare infix, exactly as theme.css
 *    §05's own --cut does. Same reason.
 *
 * 3. EVERY INITIAL VALUE IS THE LIT END. A page whose engine.js never ran gets
 *    --enter 1, --bloom 1, --p 0 → --wp-lit 1 → full exposure, which is
 *    theme.css §01's guarantee (2) and this file honours it.
 * ────────────────────────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────────────────────────
 * 5 · STYLES — injected once, idempotent, namespaced under .ccc-wp
 * ─────────────────────────────────────────────────────────────────────────────
 * The stylesheet lives here rather than in theme.css for the same reason
 * screens.js's does: this module is self-contained and must run with no theme
 * at all. Every colour, face and curve is still read through
 * `var(--ccc-…, fallback)` so theme.css §13 can dress it.
 *
 * CLASS HOOKS — this is the contract, please style through it:
 *
 *   .hotspot--print         the hotspot button, marked. It is a normal
 *                           theme.css §09 .hotspot in every other respect:
 *                           same 44px floor, same ownership gate, same
 *                           suppression in §17's narrow band.
 *   .ccc-wp                 the plane. Carries the tilt and IS the container
 *                           every size below is a fraction of.
 *   .ccc-wp__sheet          carries the contact shadow and the exposure grade.
 *   .ccc-wp__paper          the paper itself: stock colour, sheens, and the
 *                           clip that curls the bottom-left corner.
 *   .ccc-wp__tape           the two tape tabs (the landscape sheet only).
 *   .ccc-wp__magnet         the one magnet (the portrait note only).
 *   .ccc-wp__head/__kicker/__title/__stamp/__rule
 *   .ccc-wp__cols/__col/__sect/__tbl/__row/__name/__gp/__pay   'card' layout
 *   .ccc-wp__doc/__grp/__ghead/__item/__line/__iname/__ival/__cond
 *   .ccc-wp__src/__srcline                                     'doc' layout
 *   .ccc-wp__foot/__curl
 *   .ccc-wp--card           the landscape rate card in the Back Office
 *   .ccc-wp--cold           the portrait note in the walk-in. EVERY breakpoint
 *                           block in this file names one or the other; an
 *                           unscoped one would re-set the type on the sheet it
 *                           was not solved for.
 *   .ccc-wp-defer           the stand-in for a sheet whose tool is still
 *                           encrypted — see §7.
 *
 *   --wp-rot                the tilt, from rooms.js's `rotate`
 *   --wp-k                  the type scale. 1 on a wide stage; raised by the
 *                           container queries at the foot of this sheet.
 *   --wp-paper/--wp-ink/--wp-pay/--wp-soft   the four colours
 *   --wp-gp-w / --wp-pay-w / --wp-hd-w       the two money columns and the
 *                           head over them, in em of the ROW's font — see the
 *                           @property note at the top of the stylesheet. They
 *                           are lengths, not numbers, and they are registered
 *                           so that "2.34em" resolves once, on the paper.
 *   --wp-lit / --wp-exp     the room's lights and this sheet's exposure (§4)
 *   --ccc-print-font        face override (defaults to --ccc-font-ui)
 *   --ccc-print-show        set to 0 from a media query to take the sheet off
 *                           a breakpoint without touching this file
 * ────────────────────────────────────────────────────────────────────────── */

const STYLE_ID = 'ccc-wallprint-css';

const CSS = `
/* The stand-in a deferred sheet leaves in the hotspot layer (§7). The "hidden"
   attribute already does this from the UA stylesheet; this is here because
   .hotspots > * in theme.css §09 is an author rule that positions and sizes
   every child, and a future edit to it that also set "display" would silently
   put an empty box on the wall of a locked room. */
.ccc-wp-defer { display: none !important; }

/* ⚠ REGISTERED, NOT DECORATION — see §4 note 1. */
@property --wp-arr  { syntax: "<number>"; inherits: false; initial-value: 1; }
@property --wp-hold { syntax: "<number>"; inherits: false; initial-value: 0; }
@property --wp-lit  { syntax: "<number>"; inherits: true;  initial-value: 1; }
@property --wp-exp  { syntax: "<number>"; inherits: true;  initial-value: 1; }

/* ── THE TWO MONEY COLUMNS, IN em OF THE ROW AND NOT IN cqw ────────────────
   REGISTERED AS <length>, and that is the whole point. A registered property
   COMPUTES AT ITS OWN DECLARATION, so "2.34em" written on .ccc-wp__paper is
   resolved there — against the paper's own font-size, which is the row font —
   and inherits down as an absolute pixel length. Both the figure and the
   column head it sits under therefore get the SAME box, even though the head
   sets at 0.68 of the row's size and an unregistered "2.34em" would resolve
   against each element's own font and hand them two different widths.

   THE BUG THIS KILLS. These two were 9.9cqw / 6.6cqw, re-solved by hand to
   7.2cqw in one breakpoint and left alone in the others — and cqw does not
   know about --wp-k. The moment the type scale moved, "$200" was 19px of
   figure in a 16.7px box: no clip on these (they are flex:0 0 auto with
   text-align:end and no overflow rule), so the digits simply painted LEFT,
   out of their box and into the product name beside them. MEASURED on the
   shipped build at 1920, 1600, 1440 and 1366: eight overflowing cells at
   every one of them, worst at "Sports & News $110" where the two strings met.
   In em they track --wp-k for nothing, at every step, for ever.

   THE NUMBERS, measured off the rendered page as multiples of the row's own
   font-size (widest string in each column, plus the head that sits over it):
       "$200"     2.222em      "GP"      1.112em   ->  --wp-gp-w  2.34em
       "+$10.50"  3.620em      "COMM"    2.390em   ->  --wp-pay-w 3.76em
   and once the Multi-Play table is off the sheet the widest payout is "$23"
   at 1.674em, so the figure box comes in to 1.85em while the HEAD's box stays
   at 2.50em — the head is justify-content:flex-end, so its right edge stays
   flush with the figures whatever its width, and "COMM" is the one string on
   the sheet that is wider than the numbers it heads. */
@property --wp-gp-w  { syntax: "<length>"; inherits: true; initial-value: 0px; }
@property --wp-pay-w { syntax: "<length>"; inherits: true; initial-value: 0px; }
@property --wp-hd-w  { syntax: "<length>"; inherits: true; initial-value: 0px; }

/* ── THE BUTTON ────────────────────────────────────────────────────────────
   It is a theme.css §09 .hotspot and stays one — that is what buys the
   ownership gate, the 44px floor, the delegated [data-tool] click in
   overlay.js, the coarse-pointer treatment in §17 and the narrow-band
   suppression, all without a line of code here.

   THREE OVERRIDES, ALL OF THEM BECAUSE THE OBJECT IS OPAQUE PAPER:

   1. THE CLIP. §09 gates a hotspot with "clip-path: inset((1 - --live) * 50%)",
      which is inset(0) when the room owns the page — i.e. it clips hard to the
      border box. A flat button does not care. This one does: the sheet is
      rotated, its tape overhangs, and its contact shadow is thrown outside the
      box on purpose, and all three would be sheared off at the box edge. So it
      takes theme.css §05's --cut-clip instead — inset(-24px) while the room
      owns the page, inset(50%) when it does not, which is the same binary gate
      by the same number, with room for the paper. This is the identical
      substitution screens.js makes on .ccc-scr__hit, for the identical reason.
   2. THE RESTING FILL. §09's inset hairline ring and amber centre glint are
      drawn UNDER an opaque sheet, where the ring lands as a stray line along
      the paper's edge (and at a different angle, because the paper is tilted).
      Both come off.
   3. THE RETICLE MOVES OUTBOARD. The four brass corner brackets are the site's
      "this is clickable" language and they stay — but at inset 0 they print ON
      the page, which is the one thing this sheet must never look like. At -7px
      they frame it instead, which is also what a bracket is for.            */
.hotspot--print {
  clip-path: inset(var(--cut-clip, -24px));
  background: none;
  box-shadow: none;
}
.hotspot--print::before { inset: -7px;  border-radius: 3px; }
.hotspot--print::after  { inset: -13px; }

.hotspot--print:is(:hover, :focus-visible) {
  background: none;
  /* light spilling onto the wall around the sheet — outside the paper, never
     across it. Ink does not glow and neither does paper. */
  box-shadow: 0 0 42px -8px color-mix(in oklab,
              var(--ccc-accent-hi, #ebce93) 46%, transparent);
}
.hotspot--print:active { background: none; }
.hotspot--print:focus-visible {
  outline: 2px solid var(--ccc-focus, #ebce93);
  outline-offset: 5px;
}

/* ── THE PLANE ─────────────────────────────────────────────────────────────
   Static rotate only. theme.css §06's contract gives the per-frame transform to
   .plate-wrap and .hotspots and to nothing else, and this obeys it: the tilt is
   written once, from rooms.js, and never again.

   container-type is HERE and the sizes are all on descendants, which is not a
   style choice — an element cannot query itself, so a cqw written on .ccc-wp
   would silently resolve against "stage" (the next container up) and the whole
   sheet would be sized to the viewport instead of to the paper. */
.ccc-wp {
  position: absolute;
  inset: 0;
  transform: rotate(var(--wp-rot, 0deg));
  transform-origin: 50% 50%;
  container-type: inline-size;
  pointer-events: none;                /* the button underneath owns every pixel */

  --wp-arr:  clamp(0, (var(--enter, 1) - 0.90) * 11, 1);
  --wp-hold: clamp(0, (var(--p, 0) - 0.55) * 4, 1);
  --wp-lit:  clamp(0, 0.52 * var(--wp-arr)
                    + 0.48 * var(--bloom, 1) * var(--bloom, 1) * var(--bloom, 1)
                    + var(--wp-hold), 1);
  --wp-exp:  calc(0.30 + 0.70 * var(--wp-lit));
  opacity: var(--ccc-print-show, 1);
}

/* ── THE CONTACT SHADOW, AND THE EXPOSURE ──────────────────────────────────
   Two shadows, because one is a blob and two is a contact: a tight, dark, almost
   un-offset one that pins the paper's edge to the wall, and a wide soft one
   thrown DOWN AND LEFT — away from the pendant at plate-x ~50%, which is the
   only real light above this wall. Both are in cqw of the sheet, so the same
   shadow renders at 1024 and at 2560 instead of a 4px shadow that is a third of
   a millimetre on one and a centimetre on the other.

   The grade is §4's. brightness carries the exposure; saturate keeps the paper
   from holding its warmth in a room that has not been lit, because an unlit
   surface loses chroma before it loses luminance. The filter is on THIS
   element and the clip is on .ccc-wp__paper below it — that order matters:
   clip-path is applied after filters, so a clip on the same element would cut
   the shadow off at the very corner the curl exists to soften. */
.ccc-wp__sheet {
  position: absolute;
  inset: 0;
  filter:
    drop-shadow(-0.35cqw 0.45cqw 0.55cqw rgb(2 4 9 / .55))
    drop-shadow(-1.6cqw 2.1cqw 2.6cqw rgb(2 4 9 / .42))
    brightness(var(--wp-exp))
    saturate(calc(0.68 + 0.32 * var(--wp-lit)));
}

/* ── THE PAPER ─────────────────────────────────────────────────────────────
   THE CURL. The bottom-left corner has lifted off the wall, so the sheet's
   SILHOUETTE is cut there — from 90.5% down the left edge to 19% along the
   bottom. Because the clip is on the paper and the shadow is on its parent, the
   shadow follows that cut: it pools under the diagonal instead of squaring the
   corner off, which is the whole reason the object stops reading as a
   rectangle. ::after then lays a soft dark wedge along the inside of the cut —
   paper bending away from the light loses it.

   THE TWO SHEENS. A broad one from the top right (the pendant), and a narrow
   cool one up the left edge (bounce off the navy return wall). Neither is more
   than 6% — a sheen you can see as a gradient is a gradient, not a sheen. */
.ccc-wp__paper {
  position: absolute;
  inset: 0;
  overflow: hidden;
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 16% 100%, 0% 92.5%);
  background:
    linear-gradient(112deg,
      rgb(196 206 230 / .10) 0%,
      rgb(255 255 255 / 0) 26%),
    radial-gradient(120% 96% at 88% 4%,
      rgb(255 250 236 / .34) 0%,
      rgb(255 250 236 / 0) 58%),
    linear-gradient(158deg,
      color-mix(in srgb, var(--wp-paper, ${PAPER_CSS}) 100%, white 0%) 0%,
      color-mix(in srgb, var(--wp-paper, ${PAPER_CSS}) 94%, #6f7488 6%) 100%);
  color: var(--wp-ink, ${INK_CSS});
  font-family: var(--ccc-print-font,
               var(--ccc-font-ui, var(--font-text, ui-sans-serif, system-ui, sans-serif)));
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
  /* NO -webkit-font-smoothing: antialiased HERE, and it was in the first draft.
     Grayscale-only smoothing thins every stem, and at the 6.6-10px this
     document actually sets that is the difference between a stem that reaches
     full ink coverage on at least one pixel and one that never does. MEASURED,
     darkest painted pixel vs the paper beside it, at 1440x900: 3.65:1 with it,
     7.6:1 without. The ink colour was never the problem. */
  /* ⚠ THE BASE SIZE HAS TO BE SET HERE, and it was the one thing missing.
     Without it the paper inherited the document's 18px and every block-level
     box in the sheet carried an 18px STRUT — so a section head set at 7.1px sat
     in a 22.5px line box and the two tables were 40px taller than the type in
     them. Measured: .ccc-wp__sect reported font-size 18px / line-height 22.5px
     with a 7.1px name inside it. Every size below is relative to this one. */
  font-size: calc(2.5cqw * var(--wp-k));
  line-height: 1.70;
  /* the two money columns, in em of THIS font-size — see the @property note */
  --wp-gp-w:  2.34em;
  --wp-pay-w: 3.76em;
  /* "COMM" at 86% width and 0.1em of tracking is 3.25em of the ROW's font. */
  --wp-hd-w:  3.76em;

  display: flex;
  flex-direction: column;
  /* --wp-k is declared HERE and not on .ccc-wp, and that is not tidiness: an
     element cannot be matched by a container query against its OWN container,
     so a --wp-k on .ccc-wp could never be re-set by the queries at the foot of
     this sheet. On the paper it can, and it inherits to every size below. */
  --wp-k: 1;
  padding: 5.4cqw 5.6cqw 4.6cqw;
  /* A <button> is text-align: center in every UA stylesheet, and the paper is
     inside one. Left-ranged type is not a preference here, it is what makes the
     object read as a printed document rather than as a poster. */
  text-align: start;

  /* The same optical footing labels.js §5 argues for: vector type is perfectly
     sharp and the photograph under it is not. A third of a pixel of blur at the
     size this actually renders costs nothing legible and removes the last tell. */
  filter: blur(0.022cqw);

  /* ── DOT GAIN ─────────────────────────────────────────────────────────────
     Toner spreads. A 0.18px stroke in the glyph's own colour is that, and it is
     the last term in §1's contrast argument rather than a decoration: at 8.4px
     a 700-weight stem covers about four fifths of the pixels it crosses, and
     four fifths of the way to the ink is not the ink. The stroke pushes the
     centre of each stem to full coverage without changing the letterform's
     colour, its width or its weight — the same thing a laser printer does to a
     6pt rule, and the reason a printed page reads darker than its PDF.

     MEASURED, the floor of three lit frames at 2560x1440, 1920x1080 and
     1366x768, every class on the sheet:
         no stroke ....... 6.43 : 1        0.10px ...... 6.43 : 1
         0.18px .......... 7.30 : 1        0.22px ...... 7.89 : 1
     0.22 and not 0.40, because past about a third of a pixel the counters in
     "8", "e" and "$" start to close at 6px and the page goes muddy — which is
     the same failure -webkit-font-smoothing caused from the other direction,
     and is why that one is still not here.

     ⚠ -webkit-text-stroke-COLOR is left alone deliberately: it defaults to
     currentColor, so the green payout column strokes green and the secondary
     ink strokes secondary. Setting it would flatten all four inks to one.

     ⚠ AND IT IS SCOPED TO THE LANDSCAPE SHEET, below, not declared here. The
     walk-in's note is a different stock at a different size with its own
     measured ink (§1b), it already clears the floor, and it is not this
     pass's to move. Declaring the stroke on .ccc-wp__paper would have changed
     every glyph on a sheet nobody asked about. */
}
.ccc-wp--card .ccc-wp__paper { -webkit-text-stroke: 0.22px; }

/* the paper bending away at the curl */
.ccc-wp__paper::after {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  inset-block-end: 0;
  inline-size: 26cqw;
  block-size: 14cqw;
  background: linear-gradient(29deg,
    rgb(88 84 76 / .46) 0%,
    rgb(88 84 76 / .18) 26%,
    rgb(88 84 76 / .05) 48%,
    rgb(88 84 76 / 0) 70%);
  pointer-events: none;
}

/* ── THE TAPE ──────────────────────────────────────────────────────────────
   Two tabs across the top corners, overhanging the paper onto the wall — which
   is where "hung on the wall" actually lives.

   They are siblings of .ccc-wp__sheet, not children of it, and that is not
   arrangement: the sheet's filter throws a 2.6cqw contact shadow, which is the
   right shadow for a sheet standing off a wall and completely wrong for a strip
   of tape lying flat on one. Out here the tape carries its own 0.3cqw shadow
   and nothing else. It is also unclipped, so it overhangs the paper's edge the
   way tape does.                                                            */
.ccc-wp__tape {
  position: absolute;
  inline-size: 12.5cqw;
  block-size: 4.4cqw;
  background: linear-gradient(178deg,
    rgb(246 244 236 / .62) 0%,
    rgb(246 244 236 / .40) 44%,
    rgb(246 244 236 / .52) 100%);
  box-shadow:
    0 0.25cqw 0.4cqw rgb(2 4 9 / .34),
    inset 0 0.22cqw 0 rgb(255 255 255 / .22),
    inset 0 -0.22cqw 0 rgb(255 255 255 / .12);
  filter: brightness(var(--wp-exp));
  pointer-events: none;
}
.ccc-wp__tape--tl {
  inset-block-start: -1.9cqw;
  inset-inline-start: -3.4cqw;
  transform: rotate(-41deg);
}
.ccc-wp__tape--tr {
  inset-block-start: -1.6cqw;
  inset-inline-end: -3.6cqw;
  transform: rotate(37deg);
}

/* ── THE DOCUMENT ──────────────────────────────────────────────────────────
   Everything from here down is set in cqw of the paper and multiplied by
   --wp-k, so one number at the foot of this sheet re-sets the whole document
   when the stage gets small. */
.ccc-wp__head {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 2cqw;
}
.ccc-wp__kicker,
.ccc-wp__stamp {
  color: var(--wp-soft, ${INK_SOFT});
  font-size: calc(2.0cqw * var(--wp-k));
  /* 700, and every 600 on this sheet went the same way in the same pass — see
     the contrast note at the foot of §1. On a page this size weight is the
     term that decides whether a stem ever reaches full ink coverage, and every
     class that measured under 7:1 was a 600. */
  font-weight: 700;
  font-stretch: 82%;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  white-space: nowrap;
}
.ccc-wp__title {
  display: block;
  margin-block-start: 0.3cqw;
  font-size: 4.7cqw;
  font-weight: 700;
  font-stretch: 88%;
  letter-spacing: -0.005em;
  line-height: 1.02;
}
.ccc-wp__rule {
  flex: 0 0 auto;
  border: 0;
  block-size: 0;
  margin: 1.25cqw 0 1.45cqw;
  border-block-start: max(0.5px, 0.22cqw) solid currentColor;
  opacity: .82;
}
.ccc-wp__rule--foot {
  margin: 1.1cqw 0 0.85cqw;
  border-block-start-width: max(0.5px, 0.11cqw);
  opacity: .40;
}

.ccc-wp__cols {
  flex: 1 1 auto;
  min-block-size: 0;
  /* A hard guard, not a layout mechanism. The tables are solved to fit at every
     width this sheet is ever drawn at (see the container queries below and the
     measurements in the report); this is here so that a future edit to §2's
     table can only ever lose a row off the bottom of the page, and can never
     paint one across the footer. */
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 5.2cqw;
  align-content: start;
}
.ccc-wp__col { min-inline-size: 0; }
.ccc-wp__col + .ccc-wp__col {
  /* The fold: a real printed two-up has a rule down the middle. The padding and
     the negative margin are EQUAL AND OPPOSITE on purpose — that puts the rule
     in the middle of the 5.2cqw gutter while leaving the column's content box
     exactly one grid track wide. They were 5.2 and -2.6, which quietly made the
     right column 2.6cqw narrower than the left and ellipsised "TV &
     ENTERTAINME…" and "Sports & N…" while the identical left column was fine. */
  padding-inline-start: 2.6cqw;
  margin-inline-start: -2.6cqw;
  border-inline-start: max(0.5px, 0.11cqw) solid currentColor;
  border-color: color-mix(in srgb, currentColor 34%, transparent);
}

/* The GP / Comm heads, printed once at the top of each column — the way a rate
   card heads a column and not a block. They were on the section rows and cost
   15.4cqw off every one of them, which ellipsised "TV & ENTERTAINMENT" and
   "MULTI-PLAY BONUS". A truncated product family is worse than an extra rule. */
.ccc-wp__colhead {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 1.2cqw;
  margin-block-end: 0.45cqw;
  padding-block-end: 0.35cqw;
  border-block-end: max(0.5px, 0.11cqw) solid
                    color-mix(in srgb, currentColor 30%, transparent);
}

.ccc-wp__sect {
  display: block;
  margin-block-end: 0.55cqw;
  font-size: calc(2.15cqw * var(--wp-k));
  line-height: 1.2;
  /* the clip lives HERE and not on the inline span inside it: overflow and
     text-overflow do nothing on a non-replaced inline box, so "TV &
     ENTERTAINMENT" was being sheared mid-word with no ellipsis at all */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ccc-wp__block + .ccc-wp__block { margin-block-start: 2.7cqw; }
.ccc-wp__sect-name {
  color: var(--wp-ink, ${INK_CSS});
  font-weight: 700;
  font-stretch: 80%;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.ccc-wp__colhead {
  /* THE FULL INK, not the secondary one, and it is the second place that rule
     is broken (the footer in §5 is the first). "GP" and "COMM" are the smallest
     type on the sheet — 6.3px at 165px of container — and at the secondary ink
     they floored at 3.76:1, which was not close. Size, weight and colour all
     moved; none of the three did it alone. */
  color: var(--wp-ink, ${INK_CSS});
  font-size: calc(2.1cqw * var(--wp-k));
  font-weight: 700;
  /* 86% and not 78%, and the eight points are the LAST of the four terms in
     §1's contrast argument. Archivo is a variable face on a wdth axis, so a
     narrower instance is a narrower STEM as well as a narrower letter, and at
     6.7px that is the difference between a stem that reaches full ink coverage
     and one that does not: MEASURED, "GP" at 2560x1440 floored at 7.04:1 at
     78% and 8.02:1 at 86%, with nothing else touched. The tracking is what
     keeps it reading as a column head. */
  font-stretch: 86%;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  /* Tight, because this is a head and not a line of body copy — and because
     the size bump above would otherwise have cost 4px of table box at every
     step, which at 193px of container is a whole row. */
  line-height: 1.25;
}
.ccc-wp__colhead span:first-child { inline-size: var(--wp-gp-w); text-align: end; }
.ccc-wp__colhead span:last-child  { inline-size: var(--wp-hd-w); text-align: end; }

.ccc-wp__row {
  display: flex;
  align-items: baseline;
  gap: 1.2cqw;
  /* 700 — the product name and the GP figure. At 600 "Gig" measured 5.62:1 on
     the shipped pixels at 1920 and "$180" 5.08:1; nothing else about either
     changed. */
  font-weight: 700;
  font-stretch: 90%;
}
/* the dotted leader a printed rate card actually has */
.ccc-wp__name {
  flex: 1 1 auto;
  min-inline-size: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ccc-wp__gp {
  flex: 0 0 auto;
  inline-size: var(--wp-gp-w);
  text-align: end;
  color: var(--wp-soft, ${INK_SOFT});
}
.ccc-wp__pay {
  flex: 0 0 auto;
  /* the widest cell on the sheet is the Quad Play bonus, "+$10.50", and the box
     is sized to it in em of the row — see the @property note above. A rate card
     that truncates a payout is worse than no rate card. */
  inline-size: var(--wp-pay-w);
  text-align: end;
  color: var(--wp-pay, ${INK_PAY});
  font-weight: 700;
}

.ccc-wp__foot {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 2cqw;
  /* The footer takes the FULL-STRENGTH ink, not the secondary one, and it is
     the only place that rule is broken. It is the smallest type on the sheet —
     2.3cqw is 6.9px at 1920 — and measured at rgb(66 64 60) its darkest painted
     pixel came in at 6.86:1, the one figure on the page under the floor. At the
     body ink it is 7.9:1. Size and colour both moved; neither alone did it. */
  color: var(--wp-ink, ${INK_CSS});
  font-size: calc(2.3cqw * var(--wp-k));
  font-weight: 700;
  font-stretch: 82%;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.ccc-wp__foot span {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* engaged: the paper firms up a little. Contrast, not a highlight. */
.hotspot--print:is(:hover, :focus-visible) .ccc-wp__sheet {
  filter:
    drop-shadow(-0.35cqw 0.45cqw 0.55cqw rgb(2 4 9 / .58))
    drop-shadow(-1.9cqw 2.5cqw 3.0cqw rgb(2 4 9 / .46))
    brightness(calc(var(--wp-exp) * 1.055))
    saturate(calc(0.68 + 0.32 * var(--wp-lit)));
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE SECOND SURFACE  ·  .ccc-wp--cold  ·  THE NOTE IN THE WALK-IN
   ═══════════════════════════════════════════════════════════════════════════
   Everything above this line is the Back Office sheet and is unchanged by it.
   The two surfaces share the plane, the shadow host, the paper host, the head
   and the footer; they share NOTHING below that, because they are not the same
   object. One is a landscape rate card someone ran off the office printer onto
   warm stock and taped to navy paint. This is a portrait note on cool stock,
   held to specular steel with a magnet, in a room that is 8x darker before the
   lights come up.

   THE TWO MODIFIERS. ".ccc-wp--card" and ".ccc-wp--cold" are on the PLANE, and
   every breakpoint block in this file now names one of them. That is not
   decoration either: the queries above were solved for a 1.262:1 sheet with two
   table columns in it, and an unscoped ".ccc-wp__paper { --wp-k: 1.42 }" would
   have re-set the type on a portrait document that has no columns to drop.

   ── WHY THE BOX IS PORTRAIT, AND WHY IT FILLS ──────────────────────────────
   Same argument as the landscape one, run the other way. .hotspots is the
   plate's COVER box (theme.css §06), so rooms.js's 11.2% x 26.0% is 268.8 x
   348.4 PLATE PIXELS — 0.7716:1. US Letter portrait is 8.5/11 = 0.7727:1. That
   is a 0.14% match. The sheet fills its box; there is no fit to solve.

   ── THE LIGHT, MEASURED ────────────────────────────────────────────────────
   The room's only practical is the ceiling fixture at plate-x ~60, plate-y
   5-15. The sheet's box runs 57.4 -> 68.6, so its centre is plate-x 63.0 and
   the fixture is 3 points to its LEFT and well above it. The contact shadow
   therefore falls DOWN and slightly RIGHT — the mirror of the office sheet,
   which is lit from a pendant at plate-x ~50 and throws down and LEFT.

   And it is TIGHTER AND HARDER than that one, for two reasons that are both in
   the photograph. The fixture is close (a shadow's penumbra grows with the
   angular size of the source over the distance to the receiver, and this source
   is one ceiling panel two metres up, not a room full of bounce), and the wall
   is polished stainless rather than matte paint — measured std dev over the
   note's box is 41/35/30 per channel against the office wall's 6.8/8.5/11.1,
   i.e. this surface has structure and specular roll-off and does not wash a
   shadow out. So the wide lobe comes in from 1.6cqw / 2.1cqw / 2.6cqw to
   0.5 / 1.25 / 0.95, and the tight one from 0.55cqw of blur to 0.26.

   ── THE EXPOSURE FLOOR, RE-DERIVED (§4's number is the office's) ───────────
   §4's --wp-exp is "0.30 + 0.70 x --wp-lit", and the 0.30 was solved from the
   BACK OFFICE's dark plate being 0.373x the luminance of its lit twin. This
   room is not that room. MEASURED over this sheet's own box, relative
   luminance of plates/freezer-dark.e3b8eb8f75.webp against plates/freezer.01697f04b3.webp: 0.0430 vs
   0.3455, i.e. 0.1245x — the walk-in goes far darker than the office does,
   which is the whole reason its reveal reads as a reveal.

   Keeping the paper's fall in step with the wall's means matching the office's
   own ratio between them: f^2.2 / r held constant, with f the brightness the
   paper takes at the dark end and r the wall's luminance ratio.

       office:   0.30^2.2 / 0.373  =  0.0703 / 0.373  =  0.1885
       walk-in:  f^2.2 = 0.1885 x 0.1245 = 0.02347   ->   f = 0.1816

   Rounded to 0.20, which is the same paper-to-wall relationship the Back Office
   sheet has and NOT a paler copy of its number. A sheet at 0.30 in here is a
   white rectangle glowing on a wall that has not been lit yet.

   (In practice the note is inserted the moment the door finishes opening, with
   the room already at --enter 1 / --bloom 1, so the floor is what you see when
   you scroll AWAY and back — which is exactly when it matters.)          */

.ccc-wp.ccc-wp--cold {
  --wp-paper: ${COLD_PAPER_CSS};
  --wp-ink:   ${COLD_INK_CSS};
  --wp-soft:  ${COLD_INK_SOFT};
  --wp-pay:   ${COLD_INK_PAY};
  --wp-cut:   ${COLD_INK_CUT};
  --wp-exp:   calc(0.20 + 0.80 * var(--wp-lit));
}

/* down and slightly right, tight and hard — see the note above */
.ccc-wp--cold .ccc-wp__sheet {
  filter:
    drop-shadow(0.14cqw 0.42cqw 0.26cqw rgb(6 14 24 / .58))
    drop-shadow(0.50cqw 1.25cqw 0.95cqw rgb(6 14 24 / .40))
    brightness(var(--wp-exp))
    saturate(calc(0.68 + 0.32 * var(--wp-lit)));
}
.hotspot--print:is(:hover, :focus-visible) .ccc-wp--cold .ccc-wp__sheet {
  filter:
    drop-shadow(0.14cqw 0.42cqw 0.26cqw rgb(6 14 24 / .62))
    drop-shadow(0.58cqw 1.45cqw 1.10cqw rgb(6 14 24 / .44))
    brightness(calc(var(--wp-exp) * 1.055))
    saturate(calc(0.68 + 0.32 * var(--wp-lit)));
}

/* ── THE PAPER, IN A WALK-IN ───────────────────────────────────────────────
   THE COCKLE. Paper in a cold room with a compressor cycling on it does not
   stay flat — it takes up moisture along the free edges and waves. That is one
   clip-path and two very soft bands, and neither is allowed to read as a
   gradient: the bands are 3.5% and 2.5%, i.e. under the 6% ceiling the office
   sheen works to.

   THE SILHOUETTE. Held at the top by ONE magnet, so the sheet's free corner is
   the bottom RIGHT — the far side from the fixture, and the mirror of the
   office sheet's bottom-left curl. The bottom edge itself bows very slightly
   (the 98.8% mid-point), which is the cockle showing in the outline rather than
   only in the shading. The clip is on the paper and the shadow is on its
   parent, exactly as above, so the contact shadow follows the cut.

   THE SHEENS run the other way too: the broad one comes from the TOP LEFT
   (fixture at plate-x 60 against a sheet centred at 63) and the narrow cool one
   licks the RIGHT edge, which is the steel's own specular bounce.           */
.ccc-wp--cold .ccc-wp__paper {
  /* HALF the landscape sheet's optical blur, and it was measured rather than
     halved for symmetry. §5's 0.022cqw is 0.0636px on a 289px sheet and 0.0396
     on a 180px one, and at those radii Chromium still runs the filter pass —
     which resamples every glyph in the subtree. MEASURED, darkest painted pixel
     at 1440x900: 6.20:1 with it and 9.30:1 without on the same string. This
     sheet's type is smaller than the Back Office sheet's at the same viewport
     (a portrait box is a narrower container), so it cannot afford the whole
     radius. 0.011cqw still takes the vector edge off against the photograph,
     which is the only thing the blur is for. */
  filter: blur(0.011cqw);
  clip-path: polygon(0% 0.7%, 100% 0%, 100% 93%, 89% 100%, 46% 98.8%, 0% 100%);
  background:
    /* the cockle: two soft cross-bands, no edge you can point at */
    linear-gradient(184deg,
      rgb(255 255 255 / 0) 24%,
      rgb(255 255 255 / .035) 38%,
      rgb(120 132 150 / .035) 52%,
      rgb(255 255 255 / 0) 66%),
    linear-gradient(176deg,
      rgb(255 255 255 / 0) 62%,
      rgb(120 132 150 / .025) 76%,
      rgb(255 255 255 / 0) 90%),
    /* the steel's own bounce, up the right edge */
    linear-gradient(256deg,
      rgb(206 222 240 / .13) 0%,
      rgb(255 255 255 / 0) 22%),
    /* the fixture, above and slightly left */
    radial-gradient(118% 78% at 14% 2%,
      rgb(250 253 255 / .42) 0%,
      rgb(250 253 255 / 0) 58%),
    linear-gradient(198deg,
      color-mix(in srgb, var(--wp-paper, ${COLD_PAPER_CSS}) 100%, white 0%) 0%,
      color-mix(in srgb, var(--wp-paper, ${COLD_PAPER_CSS}) 93%, #55637a 7%) 100%);
  /* Portrait paper is a NARROWER container than the landscape sheet at the same
     viewport — 318px of paper at 2560 against the office's 440 — so a cqw here
     buys fewer pixels and every size in this block is set larger in cqw to land
     on the same optical size. This is the base every one of them is relative
     to; §5's note on why it cannot be left to inherit applies unchanged. */
  font-size: calc(3.15cqw * var(--wp-k));
  line-height: 1.5;
  /* The bottom padding is 6.6cqw against the top's 5.6, and the difference is
     not a taste: the free corner is cut out of the paper's silhouette, and the
     footer — the one line on here that has to survive, because it is what says
     this is an excerpt — has to sit clear of that cut. MEASURED at 2560x1440:
     the cut crosses the footer's right end at 96.9% of the sheet's height and
     the footer's last painted row is at 94.8%. */
  padding: 8.9cqw 6.2cqw 6.6cqw;
}

/* the paper bending away at the free corner — mirrored to the bottom RIGHT */
.ccc-wp--cold .ccc-wp__paper::after {
  inset-inline-start: auto;
  inset-inline-end: 0;
  inline-size: 22cqw;
  block-size: 12cqw;
  background: linear-gradient(331deg,
    rgb(58 70 86 / .40) 0%,
    rgb(58 70 86 / .16) 26%,
    rgb(58 70 86 / .05) 48%,
    rgb(58 70 86 / 0) 70%);
}

/* ── THE MAGNET ────────────────────────────────────────────────────────────
   Tape does not stick to a cold, wet, stainless wall, and everybody who has
   ever worked a walk-in knows it. A magnet does. So the office sheet's two
   tabs become ONE disc at the top centre — which is also what makes the 1.1
   degrees rooms.js gives this sheet read as a note that has swung a little on
   its one fixing, instead of as a rectangle that was hung crooked.

   Same reasoning as the tape: it is a SIBLING of .ccc-wp__sheet, not a child,
   so it stays out of the sheet's contact shadow (which is the shadow of paper
   standing off a wall, and wrong for a 4mm disc lying on it) and carries its
   own tight one instead. It takes the same brightness(--wp-exp), so it comes up
   with the room. Graphite rather than brass: brass is this site's "you can
   click this" colour and theme.css §09's reticle is already using it 7px
   outboard — a second brass object on the same 40 pixels would read as UI. */
.ccc-wp--cold .ccc-wp__magnet {
  position: absolute;
  /* ON the paper, not over its edge. A magnet holding a note is a magnet you
     can see all of; one straddling the top edge reads as a bead or a punched
     hole, which is what the first draft looked like. The paper's top padding is
     8.9cqw for exactly this — the disc runs 1.2 to 7.6cqw and the kicker starts
     below it. */
  inset-block-start: 1.2cqw;
  inset-inline-start: 50%;
  inline-size: 6.4cqw;
  block-size: 6.4cqw;
  margin-inline-start: -3.2cqw;
  border-radius: 50%;
  /* A disc seen almost face on, not a sphere. The first draft's radial ran the
     full stop range and read as a ball bearing hanging on the wall; this one
     holds a flat mid-tone across most of the face and puts the modelling in the
     last 30% and in the two inset rims — which is what a 4mm magnet 27 pixels
     wide actually looks like. */
  background:
    radial-gradient(88% 88% at 36% 30%,
      rgb(112 122 137 / 1) 0%,
      rgb(96 105 119 / 1) 52%,
      rgb(58 66 78 / 1) 100%);
  box-shadow:
    0 0.24cqw 0.42cqw rgb(6 14 24 / .48),
    inset 0 0.18cqw 0.18cqw rgb(226 236 248 / .30),
    inset 0 -0.18cqw 0.24cqw rgb(4 10 18 / .30);
  filter: brightness(var(--wp-exp));
  pointer-events: none;
}

/* ── THE DOCUMENT ──────────────────────────────────────────────────────────
   A rate card is a table and a note is prose with numbers in it, so this is
   set as a document: one measure, a name and its figure on a line, and the
   CONDITION THE FIGURE IS PAID UNDER underneath it in the secondary ink. That
   second line is the whole reason the portrait box is the right box — it is
   what the source page prints in its own "Component / Estimate" table, and
   dropping it would leave six percentages with nothing to hold them up.     */
.ccc-wp--cold .ccc-wp__kicker,
.ccc-wp--cold .ccc-wp__stamp {
  font-size: calc(2.25cqw * var(--wp-k));
  font-weight: 700;
  letter-spacing: 0.115em;
}
.ccc-wp--cold .ccc-wp__title {
  font-size: 4.3cqw;
  line-height: 1.06;
  margin-block-start: 0.9cqw;
}
.ccc-wp--cold .ccc-wp__rule { margin: 1.4cqw 0 2.3cqw; border-block-start-width: max(0.5px, 0.26cqw); }
.ccc-wp--cold .ccc-wp__rule--foot { margin: 1.3cqw 0 1.0cqw; border-block-start-width: max(0.5px, 0.13cqw); }

.ccc-wp__doc {
  flex: 1 1 auto;
  min-block-size: 0;
  /* the same hard guard §5 puts on .ccc-wp__cols, for the same reason: a future
     edit to §2b can lose a row off the foot of the page and can never paint one
     across the footer */
  overflow: hidden;
}
.ccc-wp__grp + .ccc-wp__grp { margin-block-start: 2.4cqw; }
.ccc-wp__ghead {
  display: block;
  margin-block-end: 1.0cqw;
  padding-block-end: 0.5cqw;
  border-block-end: max(0.5px, 0.13cqw) solid
                    color-mix(in srgb, currentColor 30%, transparent);
  color: var(--wp-soft, ${COLD_INK_SOFT});
  font-size: calc(2.3cqw * var(--wp-k));
  font-weight: 700;
  font-stretch: 78%;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ccc-wp__item + .ccc-wp__item { margin-block-start: 1.15cqw; }
.ccc-wp__line {
  display: flex;
  align-items: baseline;
  gap: 1.6cqw;
  line-height: 1.28;
}
.ccc-wp__iname {
  flex: 1 1 auto;
  min-inline-size: 0;
  font-size: calc(3.0cqw * var(--wp-k));
  font-weight: 700;
  font-stretch: 90%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ccc-wp__ival {
  flex: 0 0 auto;
  font-size: calc(3.15cqw * var(--wp-k));
  font-weight: 700;
  white-space: nowrap;
  color: var(--wp-pay, ${COLD_INK_PAY});
}
/* the deduction column. Same model as the card's green: the source page prints
   these in its own alert red and the distinction is the information. */
.ccc-wp__grp[data-wp-tone="cut"] .ccc-wp__ival { color: var(--wp-cut, ${COLD_INK_CUT}); }
.ccc-wp__cond {
  display: block;
  color: var(--wp-soft, ${COLD_INK_SOFT});
  font-size: calc(2.5cqw * var(--wp-k));
  /* 700, the same weight as the name above it, and that is a contrast decision
     and not a typographic one — see §1b's note on the ink. At 6.4px a 600 stem
     reaches 74% ink coverage and a 700 stem reaches 87%, which is the whole
     difference between 5.7:1 and 8.6:1 on the shipped pixels. What carries the
     hierarchy instead is size (2.5cqw against 3.0), width (92% against 90%) and
     the secondary ink. */
  font-weight: 700;
  font-stretch: 92%;
  line-height: 1.3;
  /* Two lines maximum, and then it stops. A condition that runs to three lines
     on a 199px sheet pushes the footer off the page, and the footer is the one
     line on here that has to survive: it is what says this is an excerpt. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
/* 2.0cqw and not 2.9, and the 0.9 it gives back is head-room for a heading
   this file has never seen. The title comes from the decrypted tool at render
   time (§7) and can wrap: at 289px of container a 33-character one sets on one
   line, a 50-character one on two, and the second line costs 13px of a page
   that had 1px spare. With these three margins closed the page holds 9px, and
   .ccc-wp__doc's overflow:hidden takes the rest — so the worst a long name can
   do is cost the last line of the provenance block, which is the same block
   the first breakpoint drops anyway. It can never reach a payout row. */
.ccc-wp__src { margin-block-start: 2.0cqw; }
.ccc-wp__srcline {
  display: block;
  color: var(--wp-soft, ${COLD_INK_SOFT});
  font-size: calc(2.4cqw * var(--wp-k));
  font-weight: 600;
  font-stretch: 88%;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ccc-wp--cold .ccc-wp__foot {
  font-size: calc(2.45cqw * var(--wp-k));
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* ── WHEN THIS PAPER GETS SMALL ────────────────────────────────────────────
   Read §5's note on the landscape sheet first — the mechanism, the reason the
   queries are anonymous, and the ⚠ about LAYOUT pixels versus the pixels you
   measure on screen all apply here unchanged. Only the numbers are this
   sheet's own, because this sheet is a different shape.

   MEASURED on the shipped build. The first pair is the bounding rect on screen
   across --p 0.10 to 0.55 (the plate is still dollying under the sheet, so it
   is a range and not a number); the last figure is what the container query
   actually sees, which is the plane's LAYOUT width — smaller, because .hotspots
   is scaled by --overscan-k and the plane is rotated on top of that:
       2560x1440             326-344 x 418-441   -> 289px   --wp-k 1
       1920x1080             244-258 x 313-331   -> 217px   --wp-k 1.18
       1600x900 / 1440x900   204-214 x 261-275   -> 181px   --wp-k 1.44
       1366x768 / 1024x768   174-183 x 223-235   -> 154px   --wp-k 1.72

   A portrait sheet answers "the paper got small" differently from a landscape
   one: the card had a second COLUMN to drop, and this has none. What it has is
   a stack, so it sheds from the BOTTOM — first the provenance block (which is
   where the numbers came from, not what they pay), then the two rows §2b marks
   "opt", then the head's eyebrow, then the condition lines. The eight things
   the estimate is actually made of are the last to go, and they never do.

   MEASURED at each step, page height used against page height available, with
   a 33-character heading standing in for the runtime one (long enough to set on
   one line down to 181px of container and on two below that): 274/274 at 289,
   210/210 at 217, 160/160 at 181, 170/176 at 154 — no overflow at any of them,
   and the footer clear of the curl at all four.

   ⚠ The heading is NOT in this file and cannot be — it is the decrypted tool's
   own label, arriving at render time (§7). So every figure above has to hold
   for a heading this module has never seen: the title wraps rather than
   truncates, and .ccc-wp__doc's overflow:hidden is what guarantees that a
   longer one can only ever cost a row off the foot of the page. */
@container (max-width: 250px) {
  /* The top padding still has to clear the magnet (base: the disc runs 1.2 to
     7.6cqw), so only the side and foot margins close up here. Setting 5.4cqw
     put the kicker under the disc. */
  .ccc-wp--cold .ccc-wp__paper { --wp-k: 1.18; padding: 8.6cqw 5.8cqw 6.4cqw; }
  .ccc-wp--cold .ccc-wp__title { font-size: 4.7cqw; }
  .ccc-wp__src { display: none; }
}
@container (max-width: 195px) {
  .ccc-wp--cold .ccc-wp__paper { --wp-k: 1.44; }
  .ccc-wp--cold .ccc-wp__title { font-size: 5.2cqw; }
  .ccc-wp__item[data-wp-opt] { display: none; }
  /* The head is two nowrap strings in a space-between row, and it stops fitting
     before anything else on the page does: MEASURED at 180px of container,
     "GREATER CHICAGO · BIG SOUTH" sets 116px and "ESTIMATE ONLY" 56px against a
     158px measure, so the eyebrow crossed the stamp and ran off the sheet. The
     stamp is the one that has to stay — "estimate only" is the source page's
     own first line of small print and the reason this sheet is honest. */
  .ccc-wp--cold .ccc-wp__kicker { display: none; }
  /* The leading closes up with it. This is the step where the page is tightest
     — the conditions are all still set and the sheet is 181px of container —
     and the plate is still growing under it as --p runs, so the container drifts
     a few pixels across a room's own runway. MEASURED at --p 0.15 / 0.30 / 0.50:
     the untightened page overflowed by 4px at the top of that drift. These five
     numbers give it 7px of head-room without touching a single type size, which
     is what the contrast floor at this step could not afford to lose. */
  .ccc-wp--cold .ccc-wp__rule { margin: 1.2cqw 0 1.9cqw; }
  .ccc-wp__grp + .ccc-wp__grp { margin-block-start: 1.8cqw; }
  .ccc-wp__item + .ccc-wp__item { margin-block-start: 0.7cqw; }
  .ccc-wp__ghead { margin-block-end: 0.8cqw; }
  .ccc-wp__cond { line-height: 1.22; }
  .ccc-wp--cold .ccc-wp__foot span:first-child { display: none; }
}
@container (max-width: 168px) {
  .ccc-wp--cold .ccc-wp__paper { --wp-k: 1.72; }
  .ccc-wp--cold .ccc-wp__title { font-size: 5.7cqw; }
  /* THE LAST STEP TRADES THE EXPLANATIONS FOR THE LIST — and that is also why
     the two rows the step above dropped come back here.

     MEASURED, at 154px of container (1024x768 and 1366x768 are the same sheet):
     the six conditions cost 50.6px of a 176px column at this step's type size,
     and the column has 31px spare once they are off. There is no arrangement in
     which they survive: holding them would mean --wp-k 1.53, i.e. 5.8px
     conditions, which is under everything else on this page and under what the
     Back Office sheet was allowed to set. So they go — and the 31px that frees
     is more than the 26.4px the two "opt" rows cost (6px still spare after), so it
     closes back up to all eight. What was dropped at 195 was dropped to buy room
     for the conditions; with the conditions gone it fits again.

     Which leaves the smallest sheet as the complete list of what the estimate
     is made of, set larger, with nothing explained — and the medium one as a
     shorter list that explains itself. Both are things a printer does; a page
     of 5.8px grey is not. */
  .ccc-wp__cond { display: none; }
  .ccc-wp__item[data-wp-opt] { display: block; }
}

/* ── WHEN THE PAPER GETS SMALL ─────────────────────────────────────────────
   The sheet is a fixed fraction of the plate's COVER box, and that box is
   max(100cqw, 100svh x 1.791) x --overscan-k — so how many CSS pixels of paper
   there are is decided by the viewport's HEIGHT at least as often as by its
   width. It is also 41% less paper than it was: rooms.js moved this sheet off
   the wall corner (11.5 → 27.0 became 9.0 → 21.0, see §0) and 15.5% x 22.0% of
   the plate became 12.0% x 17.0%, i.e. 372 x 294.8 plate pixels became
   288 x 227.8. EVERY NUMBER BELOW WAS RE-SOLVED FOR THAT SHEET; none of them
   survived the move unchanged.

   Which is exactly why these queries are NOT on the stage. A stage-width query
   put 1366x768 and 1024x768 — the same paper — two steps apart and overflowed
   the smaller one by 49px. The queries below are anonymous, so they resolve
   against the nearest container, which is .ccc-wp: the sheet asks how many
   pixels of ITSELF there are and answers in its own terms.

   ⚠ THE THRESHOLDS ARE LAYOUT PIXELS, NOT THE PIXELS YOU MEASURE ON SCREEN.
   .hotspots is scaled by --overscan-k (1.10 by default, 1.06 at one breakpoint,
   1 under reduced motion) AND by --plate-scale, which runs 1.02 to 1.10 across
   a room's own runway. A container query resolves against the element's LAYOUT
   size, before any ancestor transform, so it does NOT move while the plate
   dollies — which is the one mercy in this: the step a viewport lands on is a
   constant, and only the pixels it renders at grow. MEASURED, layout container
   against bounding rect at --p 0.30 and at --p 1:

       2560x1440    309px container      347 → 376 on screen
       1920x1080    232px                260 → 282
       1600x900 / 1440x900   193px       217 → 235
       1366x768 / 1024x768   165px       185 → 201

   So a 165px container sets 8px type that renders at 9.1-9.7px. Do not
   "correct" the thresholds to the on-screen figures.

   ── THE LADDER, AND WHY IT TRADES THIS WAY ─────────────────────────────────
   A document that fits at 413 is grey mush at 165, and the answer a printer
   would give is not "set it smaller" — it is "print less of it". Every step
   below sheds from the BOTTOM of the tables and spends every pixel it frees on
   --wp-k, so the BODY SIZE STAYS FLAT while the CONTENT thins out:

     container   what is printed                          --wp-k   body px
     > 340       4 tables x 5 rows   (unchanged)           1.00     8.5+
     ≤ 340       4 tables x 4 rows                         1.08     8.36 @309
     ≤ 288       2 tables x 5 rows                         1.46     8.47 @232
     ≤ 216       2 tables x 4 rows, no GP column           1.78     8.61 @193
     ≤ 180       2 tables x 2 rows, no GP column           2.10     8.66 @165

   Before this pass the same four containers set 7.74 / 8.24 / 6.87 / 5.86px,
   i.e. the sheet got 41% smaller and the type came with it. Now it does not:
   the body holds 8.36-8.66px of LAYOUT type — 9.4 to 10.5 as rendered — at
   every desktop shape, and it is FLAT across all four of them. What moves
   instead is how many rows are on the page: sixteen, ten, eight, four.

   ── WHERE THE CEILINGS COME FROM, MEASURED ─────────────────────────────────
   Two of them, and they bind in different places.

   1. HEIGHT. The page is 79.29cqw tall (a 1.264:1 box) and everything on it is
      set in cqw, so WHETHER IT FITS DEPENDS ON --wp-k AND THE ROW COUNT ALONE
      and not on the container width at all. MEASURED, the --wp-k at which the
      content exactly fills the page:
          4 tables x 5 rows   1.01        2 tables x 5 rows   1.58
          4 tables x 4 rows   1.10        2 tables x 4 rows   1.84
                                          2 tables x 2 rows   2.40
      Every k above is set under its ceiling, and the slack that leaves is a
      few px of white above the footer rule — which is what the bottom of a
      printed excerpt looks like.

   2. THE WIDEST PRODUCT NAME, and this is the one that actually decides the
      ladder. "Sports & News" is 6.985em of the row's own font, and a column is
      a fixed fraction of the paper, so THAT ceiling is also width-independent:
      with both money columns on the row it caps --wp-k at about 1.50 no matter
      how much paper there is. That is why the last two steps drop the GP
      COLUMN rather than a row — dropping GP is worth 2.34em of measure and
      takes the ceiling to 1.93 — and why the last step then drops the row that
      holds the LONGEST NAME rather than the last row of the table: with
      "Sports & News" off the page "TV Premium" is the longest and the ceiling
      goes to 2.24. The commission is the number the sheet exists to print
      ("green = yours"); the store's gross profit is context, and the footer
      that explains it goes at the same step.

   ── WHAT IS NOT ALLOWED TO GO ──────────────────────────────────────────────
   The title, the stamp, the footer's right half and the top three rows of both
   surviving tables. The footer is what says the page is an excerpt, and the
   whole object is a button that opens the full sheet.

   theme.css §17 removes the object hotspots entirely below 900px and on any
   viewport narrower than 8:7, and this sheet is a ".hotspots > .hotspot", so it
   goes with them — the same handoff to the rail's full-width tap list that the
   printer, the two clipboards and the recipe cards already make. That is the
   right answer and not a limitation: at 390px the whole plate is 24% of its
   width and this sheet would be 53 pixels of paper. */

/* ── STEP 1 · ≤ 340px — the last row of every table goes ───────────────────
   340 and not 288, because 288 was solved for the old sheet and the new one is
   77% of its width: at k 1.00 the full page sets 0.025 x container, so a 309px
   container — a 2560x1440 desktop, the LARGEST shape this room is shot for —
   was setting 7.7px body. 340 is the container at which the full page still
   clears 8.5px, and below it the fourth row of each table buys the size back.
   All four product families survive here; that matters more at the top of the
   range than five rows of two of them does. */
@container (max-width: 340px) {
  .ccc-wp--card .ccc-wp__paper { --wp-k: 1.08; padding: 5.0cqw 4.8cqw 4.2cqw; }
  .ccc-wp--card .ccc-wp__cols  { column-gap: 4.4cqw; }
  .ccc-wp--card .ccc-wp__col + .ccc-wp__col { padding-inline-start: 2.2cqw; margin-inline-start: -2.2cqw; }
  .ccc-wp--card .ccc-wp__sect  { font-size: calc(2.05cqw * var(--wp-k)); letter-spacing: 0.085em; }
  .ccc-wp--card .ccc-wp__block + .ccc-wp__block { margin-block-start: 2.3cqw; }
  .ccc-wp--card .ccc-wp__row, .ccc-wp--card .ccc-wp__colhead { gap: 1.0cqw; }
  /* the tail row of each table — 300 Mbps and NOW TV, §2a's own order */
  .ccc-wp--card .ccc-wp__row[data-wp-opt] { display: none; }
  /* Both halves of the footer no longer fit on one line at this size: the two
     strings are 31.76em of the row font against 30.0em of measure. The left
     half is a legend for a column the page still prints, so it stays and the
     RULE that carries it is what closes up. MEASURED: at k 1.08 they set 265px
     against 274px of measure — 9px, which is inside the tolerance a font stack
     fallback can move, so the left half is clipped rather than trusted. */
  .ccc-wp--card .ccc-wp__foot span:first-child { min-inline-size: 0; }
}

/* ── STEP 2 · ≤ 288px — the second table in each column goes ───────────────
   The step where the page changes shape rather than density: Xfinity Mobile
   and the Multi-Play bonus come off, Internet and TV & Entertainment go back
   to five rows each, and --wp-k jumps from 1.08 to 1.48 — the largest single
   move on the ladder, and the one the client's "reduce the size" is paid for
   with. The money columns re-solve themselves (the @property note at the head
   of §5): with Multi-Play gone the widest payout is "$23", so the figure box
   comes in from 3.76em to 1.85em while the head's stays at 2.50em for "COMM".
   That 1.91em is exactly what buys "Sports & News" instead of "Sports & N…". */
@container (max-width: 288px) {
  .ccc-wp--card .ccc-wp__paper {
    --wp-k: 1.46; padding: 5.0cqw 4.0cqw 4.2cqw;
    --wp-pay-w: 1.85em; --wp-hd-w: 3.35em;
    /* The page runs SHORT here, not long: ten rows at k 1.46 leave 12.6px of a
       111px table box empty, which reads as a page that stopped rather than as
       a page that fits. The leading is what takes it — 1.80 against 1.70 puts
       0.85px back into each of the twelve lines in the column and lands the
       last row on the footer rule. Opening the leading is what a printer does
       with a short table; setting the type bigger is not, because the widest
       product name is already at its ceiling (see the note above). */
    line-height: 1.80;
  }
  .ccc-wp--card .ccc-wp__title { font-size: 5.9cqw; }
  .ccc-wp--card .ccc-wp__cols  { column-gap: 3.8cqw; }
  .ccc-wp--card .ccc-wp__col + .ccc-wp__col { padding-inline-start: 1.9cqw; margin-inline-start: -1.9cqw; }
    .ccc-wp--card .ccc-wp__row, .ccc-wp--card .ccc-wp__colhead { gap: 0.8cqw; }
  /* "TV & ENTERTAINMENT" is eighteen tracked uppercase characters and it is the
     widest string on the sheet; at 2.15cqw / 0.11em it ellipsises the moment
     the column stops growing. Closing the setting is what a printer does with a
     long heading. */
  .ccc-wp--card .ccc-wp__sect { font-size: calc(2.00cqw * var(--wp-k)); letter-spacing: 0.075em; }
  .ccc-wp--card .ccc-wp__block + .ccc-wp__block { margin-block-start: 2.3cqw; }
  /* the second table in each column goes; the rows that survive come back and
     take the size */
  .ccc-wp--card .ccc-wp__block[data-wp-opt] { display: none; }
  .ccc-wp--card .ccc-wp__row[data-wp-opt] { display: flex; }
  .ccc-wp--card .ccc-wp__foot span:first-child { display: none; }
}

/* ── STEP 3 · ≤ 216px — the GP column goes, and the fourth row with it ─────
   The ceiling that binds from here down is the product name, not the page
   height (see the note above), so this step spends a COLUMN rather than a row
   and gets 0.30 of --wp-k for it — nearly three times what dropping the fourth
   row of each table is worth. What is left on every line is the product and
   what it pays the rep, which is the sheet in one sentence.
   The footer's legend went at the step above, so nothing on the page is now
   explaining a column that is not there. */
@container (max-width: 216px) {
  /* The leading goes back to 1.70 from the 1.80 the step above opened it to:
     that step had a SHORT page to fill and this one does not — four rows and a
     two-line head in an 85px table box is 86.3px at 1.80 and 82.9 at 1.70, and
     the difference is the bottom row of the Internet table. */
  .ccc-wp--card .ccc-wp__paper { --wp-k: 1.78; line-height: 1.70; }
  .ccc-wp--card .ccc-wp__title { font-size: 6.4cqw; }
  .ccc-wp--card .ccc-wp__gp,
  .ccc-wp--card .ccc-wp__colhead span:first-child { display: none; }
  .ccc-wp--card .ccc-wp__row[data-wp-opt] { display: none; }
  .ccc-wp--card .ccc-wp__sect { font-size: calc(1.82cqw * var(--wp-k)); letter-spacing: 0.040em; }
  /* The head is two nowrap strings in a space-between row and it stops fitting
     before anything else on the page does. MEASURED at 193px of container:
     "COOK COUNTY COOKS · C³" sets 101px and "UPDATED SEPT 1, 2026" 87px against
     176px of measure, so the eyebrow crossed the stamp and ran off the sheet.
     The stamp is the one that has to stay — a rate card with no date on it is
     worse than one with no publisher on it. */
  .ccc-wp--card .ccc-wp__kicker { display: none; }
}

/* ── STEP 4 · ≤ 180px — two rows a table, and the longest name goes ────────
   The last step, and the one where the space argument and the contrast
   argument turn out to be the same argument.

   At the step above --wp-k is capped at 1.93 by "Sports & News" — 6.985em of a
   measure that holds 8.83em once the payout box and its gap are out of it —
   and 1.93 at 165px of container is 7.96px of body type, which floors at
   5.15:1. There is no arrangement in which that row survives AND the page
   clears 7:1. So 'opt3' takes it, and the Gig row with it so the two tables
   stay level; "TV Premium" becomes the longest name, the ceiling goes to 2.24
   and --wp-k to 2.10 — 8.66px, the LARGEST body type anywhere on this ladder,
   on the smallest sheet. Four payouts set legibly beats six set grey, and the
   footer has said the page is an excerpt the whole way down.

   The eyebrow goes here too, and for the older reason: the head is two nowrap
   strings in a space-between row and it stops fitting before anything else on
   the page does. At 165px "COOK COUNTY COOKS · C³" sets 97px and "UPDATED
   SEPT 1, 2026" 83px against 151px of measure, so the two cross. The stamp is
   the one that stays — a rate card with no date on it is worse than one with
   no publisher on it. */
@container (max-width: 180px) {
  /* Four rows in a 67px table box leave 4.5px of it empty, and the leading is
     what takes it back — 1.82 against the 1.70 of the step above. */
  .ccc-wp--card .ccc-wp__paper { --wp-k: 2.10; padding: 5.0cqw 4.0cqw 4.4cqw; line-height: 1.78; }
  .ccc-wp--card .ccc-wp__title { font-size: 7.2cqw; }
  .ccc-wp--card .ccc-wp__row[data-wp-opt2],
  .ccc-wp--card .ccc-wp__row[data-wp-opt3] { display: none; }
  /* THE SECTION HEAD SETS OVER TWO LINES HERE, at full size, instead of being
     shrunk until it fits one. "TV & ENTERTAINMENT" is eighteen tracked
     uppercase characters in a 72px column: the step above closes the tracking
     to 0.018em to hold it on one line, and at 5.5px the result floors at
     6.72:1 — under this build's floor, on a heading. Two lines at 6.6px is
     8.9:1 and is what a printer would set anyway.

     The min-block-size is what keeps the two tables level across the fold:
     "INTERNET" sets on one line and its neighbour on two, so both reserve two,
     and the rows below them start on the same baseline. */
  .ccc-wp--card .ccc-wp__sect {
    font-size: calc(1.88cqw * var(--wp-k));
    letter-spacing: 0.045em;
    white-space: normal;
    min-block-size: calc(2 * 1.2em);
  }
}

/* ── THE ROOM'S OWN CROP, AND THE THREE DESKTOP SHAPES WHERE IT REACHES US ─
   This is a MEDIA query and everything above it is a container query, and the
   difference is the point: what follows is not about how big the sheet is, it
   is about which part of the PHOTOGRAPH is on screen.

   theme.css §06 sizes .hotspots to the plate's cover box and §06d gives the
   Back Office --art-x .5, so at aspects below the plate's own 1.791 the frame
   throws away (1 - aspect / (1.791 x --overscan-k x --plate-scale)) of the
   plate's width, half off each side — and --plate-scale runs 1.02 to 1.10
   across the room's runway, so the crop TIGHTENS as you scroll. That algebra
   predicts the threshold and not the amount (there is a --plate-x parallax
   translate in the transform as well), so what follows is measured.

   ── WHY THIS BLOCK HAD TO BE RE-SOLVED ─────────────────────────────────────
   The sheet's left edge used to be at plate-x 11.5 and is now at 9.0. Every
   one of those 2.5 points is 2.5% of the plate's width closer to the frame
   edge, so the shapes that crop it changed and the amount they crop changed
   with them. MEASURED, worst clip of the sheet's own box while the Back Office
   still owns the screen (i.e. up to the last frame elementFromPoint puts this
   hotspot on top), across the whole runway:

       aspect 1.90 / 1.80          0%            1706x900, 1620x900
       aspect 1.778 / 1.779        0%            2560x1440, 1920x1080,
                                                 1600x900, 1366x768
       aspect 1.70                 7.5%          1530x900
       aspect 1.60                 4 - 30%       1440x900, 1680x1050
       aspect 1.50                16 - 48%       1350x900
       aspect 1.40                37 - 67%       1260x900
       aspect 1.333               52 - 80%       1024x768
       aspect 1.25                69 - 96%       1280x1024

   The old block covered aspect < 38/25 (1.52) and would have left 16:10 —
   1440x900, 1680x1050, 1920x1200, one of the commonest desktop shapes there
   is — with its product names sheared off at the frame edge. The band now runs
   to 5/3 (1.667), which is where the measurement says the sheet stops being
   whole, and it is cut in two because 16:10 and 4:3 need very different
   answers.

   THIS IS THE ROOM'S COMPOSITION, NOT THIS MODULE'S, and rooms.js's geometry is
   measured and not ours to move. The same crop treats the room's other four
   objects far worse: 'fall-off' sits at plate-x 91.5-97.5, and by the same
   algebra its right edge is outside the frame at every aspect below 1.872 —
   which includes 1920x1080. The site has always shipped that.

   ⚠ WHAT THIS BLOCK CANNOT DO. Below about 4:3 the crop takes more than half
   the sheet before the room has finished arriving, and no amount of moving the
   printing about on the paper puts a two-figure table into what is left: at
   1280x1024 the sheet is 69% out of frame at arrival and 96% out of it by the
   time the room hands over. The fix for that is not in this file — it is an
   --art-x for the Back Office at those aspects in theme.css §17, or a plate-x
   for this hotspot in rooms.js. Both are the room's business. What is below
   holds to 4:3 and degrades honestly under it.

   What this module CAN do is decide which part of its own paper the printing
   lands on. Inside the band it sets the page to ONE column, indented past the
   part of the paper the frame is eating, so the surviving frame carries a
   complete, aligned, readable table with its title over it instead of two
   tables sheared off at the frame edge. A printer setting a page for a narrow
   window does exactly this. What survives is the Internet table, which is the
   one a rep quotes first, and the footer still says the sheet is an excerpt
   and the button still opens the whole tool.                                */

/* 16:10 and 3:2 — 1440x900, 1680x1050, 1920x1200, 1350x900. The crop takes
   16-25% of the paper for most of the runway and 48% on the last frame before
   the Break Room takes the screen; 32cqw clears the first two thirds of that
   and is as far as the indent can go before the surviving measure stops
   holding "Sports & News". */
@media (min-aspect-ratio: 3 / 2) and (max-aspect-ratio: 5 / 3) {
  .ccc-wp--card .ccc-wp__paper { padding-inline-start: 30cqw; }
  .ccc-wp--card .ccc-wp__title { font-size: 5.0cqw; }
  .ccc-wp--card .ccc-wp__cols  { grid-template-columns: 1fr; }
  .ccc-wp--card .ccc-wp__col + .ccc-wp__col { display: none; }
  /* ONE COLUMN IS ONE TABLE, and the ladder's row count does not survive the
     fold. The container queries solve this page as TWO columns: at 344px of
     container — a 2560x1600 desktop, aspect 1.60, which is inside this band —
     the ladder prints four tables of five rows, and stacking half of them into
     a single column is 46cqw of content in a 40cqw box, which .ccc-wp__cols'
     own overflow:hidden would eat the bottom of, silently. So the fold takes
     the optional table and the optional row with it, and what is left is the
     Internet table's top four rows in whatever measure the crop has spared. */
  .ccc-wp--card .ccc-wp__block[data-wp-opt] { display: none; }
  .ccc-wp--card .ccc-wp__row[data-wp-opt]   { display: none; }
  /* The footer is the longest single line on the page and the indent is taken
     out of its measure too: MEASURED at 1440x900, "Excerpt — tap for the full
     sheet" set 122px against 123px and ellipsised on the last word. 2.2cqw
     against 2.3 is 117px in 127 — and it is the smallest move that clears it,
     because this line is also the lowest-contrast line on the sheet. */
  /* The footer's left half is a legend and the indent has taken a third of the
     measure it needs: at 344px of container (2560x1600) the two halves want
     273px of a 227px line and BOTH ellipsised. The ladder already drops the
     legend below 288px of container; inside this band it has to go at every
     container, because here it is the crop and not the paper that sets the
     measure. The right half — the one that says the page is an excerpt — is
     what the space buys. */
  .ccc-wp--card .ccc-wp__foot span:first-child { display: none; }
  .ccc-wp--card .ccc-wp__foot { font-size: calc(2.2cqw * var(--wp-k)); }
}

/* 4:3 and 5:4 — 1024x768, 1280x1024, 1152x864. The crop takes 52% of the paper
   at arrival, so the indent has to be nearly twice the one above and there is
   only about 40cqw of measure left on the other side of it. Three things move
   with it, all of them because of that measure:
     · the title comes down to 5.2cqw and is allowed to set over two lines —
       "Commission Payouts 2026" is 140px of type in 66px of column, and a
       heading that wraps is a heading, while one that ellipsises is a defect;
     · the footer wraps too, at 2.05cqw, because it is the one line on the page
       that has to survive: it is what says this is an excerpt;
     · the column heads go. "GP COMM" over a two-figure row is a legend, and a
       legend is the first thing off a page this narrow.
   MEASURED at 1024x768: the printing occupies the right 40cqw of the paper,
   which is 66 of 165 layout px, and the frame is showing 48% of the sheet at
   arrival — so the whole of it is inside the visible strip with 7% to spare. */
@media (min-aspect-ratio: 8 / 7) and (max-aspect-ratio: 3 / 2) {
  .ccc-wp--card .ccc-wp__paper { padding-inline-start: 66cqw; }
  .ccc-wp--card .ccc-wp__title { font-size: 5.0cqw; white-space: normal; }
  .ccc-wp--card .ccc-wp__rule  { margin: 0.9cqw 0 1.1cqw; }
  .ccc-wp--card .ccc-wp__cols  { grid-template-columns: 1fr; }
  .ccc-wp--card .ccc-wp__col + .ccc-wp__col { display: none; }
  /* one column is one table — see the note in the band above */
  .ccc-wp--card .ccc-wp__block[data-wp-opt] { display: none; }
  .ccc-wp--card .ccc-wp__row[data-wp-opt]   { display: none; }
  /* "GP COMM" over a two-figure row is a legend, and a legend is the first
     thing off a page this narrow — and so is the GP figure itself. The ladder
     already drops both below 216px of container; this band has to drop them
     one step earlier because the indent, not the paper, is what sets the
     measure here. MEASURED at 1280x1024 (220px of container, 66px of column):
     "500 Mbps" + GP + payout is 73px and ellipsised; without GP it is 53. */
  .ccc-wp--card .ccc-wp__colhead { display: none; }
  .ccc-wp--card .ccc-wp__gp      { display: none; }
  /* AND THE HEAD GOES WITH IT, which is the one place on the ladder the date
     stamp is allowed to go. 40cqw of measure is 50px: "UPDATED SEPT 1, 2026"
     needs 87 of it and would set over three lines, which costs 35px of a
     115px page — more than the table it is dated. This band is the emergency
     one (see the ⚠ above); what it prints is a title, one table and the line
     that says the sheet is an excerpt, and nothing else fits. */
  .ccc-wp--card .ccc-wp__head   { display: none; }
  /* The footer is the one line on the page that has to survive — it is what
     says this is an excerpt — so here it is allowed to set over as many lines
     as it needs instead of being clipped to one. */
  .ccc-wp--card .ccc-wp__foot {
    display: block;
    white-space: normal;
    font-size: calc(2.0cqw * var(--wp-k));
    line-height: 1.32;
  }
  .ccc-wp--card .ccc-wp__foot span { overflow: visible; }
}

/* Reduced motion: the room is already lit (theme.css §18 pins the plate), so
   the sheet is already lit too. No ramp, nothing to interpolate. */
@media (prefers-reduced-motion: reduce) {
  .ccc-wp { --wp-lit: 1; --wp-exp: 1; }
}

/* Forced colours: theme.css §18 repaints .hotspot as Canvas/CanvasText and the
   photograph — and therefore the wall this paper hangs on — is gone. The
   button's border and its accessible name carry it from there, exactly as
   labels.js hands off. */
@media (forced-colors: active) {
  .ccc-wp { display: none; }
}
`;

function ensureStyles(doc) {
  try {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  } catch (_) {
    /* a CSP-blocked <style> leaves a working, unpapered hotspot — the tool
       still opens, and that is the only thing that must never break. */
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 6 · BUILD
 * ────────────────────────────────────────────────────────────────────────── */

function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** One product table: a section head, then its rows. The GP / Comm heads are
 *  printed once at the top of the whole column — see .ccc-wp__colhead in §5. */
function buildBlock(doc, block) {
  const wrap = el(doc, 'div', 'ccc-wp__block');
  if (block.opt) wrap.dataset.wpOpt = '';

  const sect = el(doc, 'div', 'ccc-wp__sect');
  sect.appendChild(el(doc, 'span', 'ccc-wp__sect-name', block.head));
  wrap.appendChild(sect);

  for (const [name, gp, pay, flag] of block.rows) {
    const row = el(doc, 'div', 'ccc-wp__row');
    // Two shed tiers, not one: 'opt' is the last row of the table and goes
    // first, 'opt2' is the one above it and goes at the next step down. §5's
    // ladder spends both on type size; §2a says which rows they are.
    if (flag === 'opt')  row.dataset.wpOpt  = '';
    if (flag === 'opt2') row.dataset.wpOpt2 = '';
    if (flag === 'opt3') row.dataset.wpOpt3 = '';
    row.appendChild(el(doc, 'span', 'ccc-wp__name', name));
    row.appendChild(el(doc, 'span', 'ccc-wp__gp', gp));
    row.appendChild(el(doc, 'span', 'ccc-wp__pay', pay));
    wrap.appendChild(row);
  }
  return wrap;
}

/** One group of the portrait document: a head, then its components. Each
 *  component is a name and its figure on a line, with the condition it is paid
 *  under set underneath — see .ccc-wp__item in §5's cold block. */
function buildGroup(doc, block) {
  const wrap = el(doc, 'div', 'ccc-wp__grp');
  if (block.opt) wrap.dataset.wpOpt = '';
  if (block.tone) wrap.dataset.wpTone = block.tone;

  wrap.appendChild(el(doc, 'span', 'ccc-wp__ghead', block.head));

  for (const [name, value, cond, flag] of block.rows) {
    const item = el(doc, 'div', 'ccc-wp__item');
    if (flag === 'opt') item.dataset.wpOpt = '';
    const line = el(doc, 'span', 'ccc-wp__line');
    line.appendChild(el(doc, 'span', 'ccc-wp__iname', name));
    line.appendChild(el(doc, 'span', 'ccc-wp__ival', value));
    item.appendChild(line);
    if (cond) item.appendChild(el(doc, 'span', 'ccc-wp__cond', cond));
    wrap.appendChild(item);
  }
  return wrap;
}

/**
 * The drawn sheet.
 *
 * aria-hidden, and that is the whole accessibility story — the same call
 * labels.js makes. `.hotspot-label` remains the button's accessible name, so a
 * screen reader hears the tool's name exactly once instead of forty table cells
 * it cannot act on. The cells are not being withheld: the button opens the live
 * tool, which is the accessible route to all of them.
 *
 * @param {Document} doc
 * @param {object} spot   the rooms.js hotspot
 * @param {object} sheet  §2's document for this surface
 * @param {string} title  the heading. For the Back Office sheet this is the
 *                        document's own `title`; for the walk-in note there IS
 *                        no title in this file and there must never be one —
 *                        §7 passes the decrypted tool's own label instead.
 */
function buildSheet(doc, spot, sheet, title) {
  const cold = sheet.layout === 'doc';

  const plane = el(doc, 'span', `ccc-wp ${cold ? 'ccc-wp--cold' : 'ccc-wp--card'}`);
  plane.setAttribute('aria-hidden', 'true');
  const rot = Number(spot && spot.rotate);
  if (Number.isFinite(rot) && rot !== 0) {
    plane.style.setProperty('--wp-rot', `${rot}deg`);
  }

  const sheetEl = el(doc, 'span', 'ccc-wp__sheet');
  const paper = el(doc, 'span', 'ccc-wp__paper');

  const head = el(doc, 'span', 'ccc-wp__head');
  head.appendChild(el(doc, 'span', 'ccc-wp__kicker', sheet.kicker));
  head.appendChild(el(doc, 'span', 'ccc-wp__stamp', sheet.stamp));
  paper.appendChild(head);
  paper.appendChild(el(doc, 'span', 'ccc-wp__title', title));

  paper.appendChild(el(doc, 'hr', 'ccc-wp__rule'));

  if (cold) {
    const body = el(doc, 'span', 'ccc-wp__doc');
    for (const block of sheet.blocks) body.appendChild(buildGroup(doc, block));
    if (sheet.note) {
      const src = el(doc, 'div', 'ccc-wp__src');
      if (sheet.note.opt) src.dataset.wpOpt = '';
      src.appendChild(el(doc, 'span', 'ccc-wp__ghead', sheet.note.head));
      for (const line of sheet.note.lines) {
        src.appendChild(el(doc, 'span', 'ccc-wp__srcline', line));
      }
      body.appendChild(src);
    }
    paper.appendChild(body);
  } else {
    const cols = el(doc, 'span', 'ccc-wp__cols');
    for (const blocks of sheet.columns) {
      const col = el(doc, 'span', 'ccc-wp__col');
      const heads = el(doc, 'span', 'ccc-wp__colhead');
      heads.appendChild(el(doc, 'span', null, sheet.colHead[0]));
      heads.appendChild(el(doc, 'span', null, sheet.colHead[1]));
      col.appendChild(heads);
      for (const block of blocks) col.appendChild(buildBlock(doc, block));
      cols.appendChild(col);
    }
    paper.appendChild(cols);
  }

  paper.appendChild(el(doc, 'hr', 'ccc-wp__rule ccc-wp__rule--foot'));
  const foot = el(doc, 'span', 'ccc-wp__foot');
  foot.appendChild(el(doc, 'span', null, sheet.foot));
  foot.appendChild(el(doc, 'span', null, sheet.footEnd));
  paper.appendChild(foot);

  sheetEl.appendChild(paper);
  plane.appendChild(sheetEl);
  if (cold) {
    // one magnet, top centre — see .ccc-wp__magnet in §5's cold block
    plane.appendChild(el(doc, 'span', 'ccc-wp__magnet'));
  } else {
    plane.appendChild(el(doc, 'span', 'ccc-wp__tape ccc-wp__tape--tl'));
    plane.appendChild(el(doc, 'span', 'ccc-wp__tape ccc-wp__tape--tr'));
  }
  return plane;
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 7 · buildWallPrint  ·  THE SEAM
 * ─────────────────────────────────────────────────────────────────────────────
 * app.js's buildHotspot() dispatches here on `kind:'print'` and nowhere else.
 * What comes back is a real <button data-tool> — the same element every other
 * object hotspot in the building is, so overlay.js's delegated click handler,
 * its `#/tool/<slug>` deep link, its gate and its focus restore all apply with
 * nothing added; the sheet is a decoration inside it. Keeping the drawing INSIDE
 * the button rather than beside it is what guarantees the client's "clickable
 * the whole time the room is on screen": there is exactly one hit target, it is
 * the paper, and it opens the moment theme.css §05's --cut leaves zero — which
 * is roughly 740px of scroll BEFORE the room reaches its arrival position, and
 * it stays open for the whole of the room's runway.
 *
 * ── HOW A SHEET FINDS ITS TOOL, AND WHY THERE ARE TWO WAYS ─────────────────
 * The Back Office sheet names its tool with a SLUG, because that tool ships in
 * data/tools.1b9013b491.json in plaintext and always has. Resolution for it is a Map read
 * and it is unchanged, down to the label fallback order.
 *
 * The walk-in's note cannot do that. Its tool is one of the fourteen behind the
 * freezer's lock, and the whole point of that lock (app.js §2,
 * build/seal-freezer.mjs) is that the slug, the name and the URL ARE NOT IN THE
 * DEPLOYED TREE — they are AES-256-GCM ciphertext, and the sealing script fails
 * the build if any of the three survives into index.html or the envelope. A
 * `slug:'…'` in rooms.js would put all the effort back on the floor.
 *
 * So that hotspot names an OBJECT instead — the same `object` field every tool
 * in the index already carries ("clipboard-1", "recipe-card-2", "wall-print"),
 * which is a description of a thing in a photograph and not a key to anything.
 * The sheet then resolves LATE, against whatever tools exist by the time it is
 * asked:
 *
 *     spot.slug    -> data.bySlug.get(slug)                  the office sheet
 *     spot.object  -> data.tools.find(t => t.object === …)   the walk-in note
 *
 * ── AND THAT IS ALSO THE LOCK ──────────────────────────────────────────────
 * While the walk-in is shut there is no such tool. app.js's index literally
 * does not contain it — `data.tools` holds the 23 plaintext tools and nothing
 * else until ADOPT_COLD() folds in a decrypted payload. So the find() returns
 * nothing, and THIS FUNCTION BUILDS NOTHING: no button, no data-tool, no
 * accessible name, no paper, no reticle. What goes into the hotspot layer is an
 * empty `hidden` span, which is neither painted, hit-tested, announced, nor
 * focusable.
 *
 * That is deliberately the SAME predicate the rest of the room gates on, not a
 * second one that could drift out of step with it. app.js's rail chips ask
 * `isFreezerUnlocked()`, which is `COLD !== null` — and ADOPT_COLD(), the only
 * thing that can put a tool into `data.tools`, is called from exactly one place:
 * markFreezerUnlocked(), the function that sets COLD. One state, two readings of
 * it. There is no arrangement of this page in which the note is drawn and
 * isFreezerUnlocked() is false.
 *
 * It also means the note cannot be summoned by a URL. A `#/tool/<slug>` deep
 * link is answered by overlay.js's openTool() and app.js's watchSealedDeepLink()
 * — neither of which can reach this module — and the only thing that could make
 * this sheet appear is a decrypted payload, which needs the code.
 *
 * ── THE REVEAL ─────────────────────────────────────────────────────────────
 * revealWallPrints() re-resolves every deferred sheet and swaps it in place.
 * app.js calls it from playUnlockBeat(), beside revealFreezerInterior() — i.e.
 * as the door finishes opening and the room is handed over, the same beat the
 * fourteen rail chips ripple in on. Not at markFreezerUnlocked(): the code is
 * accepted about two seconds before the doorway clears, and a note that pops
 * into existence behind a door that is still swinging is a note you watched
 * appear.
 *
 * A session that was ALREADY unlocked never gets here at all — app.js restores
 * the payload before buildKitchen() runs, so the find() succeeds first time and
 * the note is simply part of the room, which is also how freezer.js treats the
 * door in that case.
 *
 * @param {object} spot  the rooms.js hotspot: x/y/w/h in plate %, rotate, and
 *                       either `slug` + `label` or `object`
 * @param {object} data  app.js's tool index — { tools, bySlug, … }. Live: it is
 *                       the same object ADOPT_COLD() mutates on unlock.
 * @param {Document} doc
 * @returns {HTMLElement}  a <button data-tool>, or an empty hidden <span>
 * ────────────────────────────────────────────────────────────────────────── */

/** Deferred sheets, keyed by the placeholder that is standing in for them. */
const DEFERRED = new WeakMap();

/** slug first, object second. Never both; never a guess. */
function resolveTool(spot, data) {
  if (!spot || !data) return null;
  if (spot.slug) return (data.bySlug && data.bySlug.get(spot.slug)) || null;
  if (spot.object) {
    const tools = data.tools || [];
    for (const tool of tools) if (tool && tool.object === spot.object) return tool;
  }
  return null;
}

/** Which document §2 holds for this surface. */
function sheetFor(spot) {
  return SHEETS[(spot && (spot.slug || spot.object)) || ''] || null;
}

function buildPrinted(spot, tool, doc) {
  const sheet = sheetFor(spot);
  const name = spot.label || (tool && tool.label) || spot.slug || '';

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'hotspot hotspot--print';
  button.setAttribute('data-tool', (tool && tool.slug) || spot.slug);
  if (spot.edge) button.setAttribute('data-edge', spot.edge);
  button.setAttribute('style', boxVars(spot.x, spot.y, spot.w, spot.h));

  // The brass glint bead and the named label, exactly as app.js builds them for
  // every other hotspot — same classes, same order, same accessible name.
  const dot = el(doc, 'span', 'dot');
  dot.setAttribute('aria-hidden', 'true');
  button.appendChild(dot);
  button.appendChild(el(doc, 'span', 'hotspot-label', name));

  // No document for this surface: the hotspot still works, it just has no paper
  // on it. A missing table must never cost the tool its click target.
  if (sheet) button.appendChild(buildSheet(doc, spot, sheet, name));
  return button;
}

/** The stand-in for a sheet whose tool does not exist yet. Carries no name, no
 *  slug, no data-tool and no geometry — it is a bookmark in the hotspot layer
 *  and nothing else. `hidden` keeps it out of the render tree, the tab order
 *  and the accessibility tree; the class is what revealWallPrints() finds. */
function buildDeferred(spot, data, doc) {
  const mark = el(doc, 'span', 'ccc-wp-defer');
  mark.hidden = true;
  DEFERRED.set(mark, { spot, data });
  return mark;
}

export function buildWallPrint(spot, data, doc = document) {
  ensureStyles(doc);
  const tool = resolveTool(spot, data);
  // A spot that names a SLUG builds either way — the slug is the tool, and the
  // office sheet has always drawn from spot.label with tools.json only as a
  // fallback. A spot that names an OBJECT has nothing at all until its tool
  // exists, so it waits.
  if (!tool && !spot.slug) return buildDeferred(spot, data, doc);
  return buildPrinted(spot, tool, doc);
}

/**
 * Re-resolve every deferred sheet in `doc` and swap the real one into its place.
 *
 * Idempotent, and safe to call when nothing has changed: a placeholder whose
 * tool still does not exist is left exactly where it is. Called by app.js from
 * playUnlockBeat().
 */
export function revealWallPrints(doc = document) {
  let marks;
  try { marks = doc.querySelectorAll('.ccc-wp-defer'); }
  catch (_) { return; }

  for (const mark of Array.from(marks)) {
    const rec = DEFERRED.get(mark);
    if (!rec) continue;
    const tool = resolveTool(rec.spot, rec.data);
    if (!tool) continue;
    DEFERRED.delete(mark);
    try { mark.replaceWith(buildPrinted(rec.spot, tool, doc)); }
    catch (err) { console.error('[wallprint] could not mount a deferred sheet:', err); }
  }
}

export default buildWallPrint;
