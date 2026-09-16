/* ============================================================================
   rooms.js — room composition + hotspot geometry
   ----------------------------------------------------------------------------
   Every box is expressed in PERCENT OF THE PLATE (x, y = top-left corner;
   w, h = size).  These numbers were measured off the actual 5504x3072 renders
   with a percentage grid, not guessed — see /root/ccc-build/grid.py.

   kind:
     'tool'   -> a clickable object that opens the tool full-screen
     'screen' -> a screen surface owned by assets/screens.js
     'chefs'  -> the head chef wall (owned by chefwall.js)
     'lock'   -> the freezer keypad
     'print'  -> a sheet of paper drawn onto the wall by assets/wallprint.js.
                 It becomes an ordinary .hotspot button with the printed page
                 rendered inside it, so it clicks, focuses and gates exactly
                 like a 'tool'. `rotate` (degrees) tilts the paper on the wall;
                 the button itself stays axis-aligned.
                 It names its tool with `slug` (a tool that ships in plaintext)
                 OR with `object` (a tool that does not — see the note on the
                 walk-in's sheet below). With `object` the hotspot resolves at
                 RUNTIME against whatever tools exist by then, and builds
                 nothing at all until one does.
   `quad` (TL, TR, BR, BL in plate %) is supplied where the object sits on a
   wall at an angle, so the mounted screen is warped to the screen's plane
   instead of floating in front of it.

   `mode` (screens only) picks what screens.js renders on the glass:
     'title'  a title card — the tool's name, auto-fitted. For surfaces too
              small to render a readable web page at any zoom (the tablets).
     'image'  the daily promo card straight from the Daily Sales Report repo.
     'feed'   the detractor-streak board, one district per slide.
     'live'   a real iframe of the tool, rendered wide and scaled down.
     'report' the Daily Sales Report's numbers, composed natively and cycled.
              For a screen too small to iframe the deck legibly — see the note
              on the break-room television below.
   ========================================================================== */

/* THE ORDER MOVED, THE DEFINITION DID NOT DOUBLE. It now lives in
   assets/roomorder.js — a 200-byte module — so the phone's pocket list can
   import the order without dragging this file's 24 KB of hotspot geometry
   down the wire with it. Everything that imports ROOM_ORDER from here is
   unchanged; this is a re-export, so the binding is the same one. */
export { ROOM_ORDER } from './assets/roomorder.564575b388.js';

export const HOTSPOTS = {
  pass: [
    /* The three counter tablets, RE-MEASURED against the v4 `pass.webp` (the
       one with the much larger tablets across the lower third). Each glass was
       found by thresholding the plate and tracing the run of near-black pixels
       column by column, not eyeballed: all three come out axis-aligned to
       within a pixel and share a top edge at plate-Y 57.3% and a bottom at
       73.9%, so none of them carries a quad any more — the old tilt quads were
       fitted to the previous, smaller art and would now shear a flat screen.
       That shared 57.3% top edge is also the line theme.css §08a hangs the
       room's title card off (--rail-foot: 53).
       They render TITLE CARDS, not live pages: 14.8% of frame width still
       cannot show a readable web page, and the client's ask is that people can
       see what to click. */
    /* THE THREE TABLETS ON THE PASS.
       These were plain x/y/w/h boxes, which is why the panels overlapped their
       own bezels: the tablets are tilted back on their stands, so each screen
       is a TRAPEZOID, not a rectangle — the bottom edge is wider than the top
       and shifted outward from the frame's centre. Corners below are traced off
       the glass on plates/pass.96df41e5e3.webp (luminance < 30 on the 2400x1340 file):
         left    top 21.25→36.29   bottom 18.42→34.71   (bottom 1.9% wider)
         centre  top 42.71→57.21   bottom 42.25→57.96   (bottom 1.2% wider)
         right   top 62.88→77.75   bottom 64.12→80.54   (bottom 1.5% wider)
       With a quad, screens.js warps the panel onto the screen's own plane and
       it lands inside the bezel instead of across it. */
    { slug:'quote-6th-gen',  kind:'screen', mode:'title',
      x:18.42, y:57.24, w:17.91, h:16.64, label:'6th Gen Quote Sheet',
      quad:[[21.25,57.31],[36.29,57.39],[34.71,73.66],[18.42,73.66]] },
    { slug:'quote-upgrade',  kind:'screen', mode:'title',
      x:42.00, y:57.24, w:16.00, h:16.64, label:'Upgrade Quote Sheet',
      quad:[[42.71,57.24],[57.21,57.24],[57.96,73.06],[42.25,73.66]] },
    { slug:'quote-internet', kind:'screen', mode:'title',
      x:62.75, y:57.24, w:17.79, h:16.57, label:'Internet Quote Sheet',
      quad:[[62.88,57.31],[77.75,57.31],[80.54,73.58],[64.12,72.91]] },
    { slug:'tsheet-submissions', kind:'tool', x:76.0, y:76.0, w:14.5, h: 8.0, label:'T-Sheet Submissions', edge:'right bottom' },
  ],
  host: [
    /* The Host Stand TV hangs at an angle — this is the quad the homography in
       screens.js is solved against. It shows the daily promo card, held frozen. */
    { slug:'daily-sales', kind:'screen', mode:'image', x:47.0, y:5.6, w:37.0, h:53.0,
      label:'Daily Sales Report', name:'Daily Promo Card',
      quad:[[47.6,21.4],[82.0,11.2],[82.0,57.8],[47.3,55.8]] },
    { slug:'yesterdays-conversion', kind:'tool', x:14.0, y:68.0, w:24.0, h:14.0, label:"Yesterday's Conversion", edge:'bottom' },
  ],
  dining: [
    /* The two menu boards are near-frontal, so no quad. RE-MEASURED against the
       v4 `dining.webp`, where both boards are roughly twice the size they were:
       each glass is now 21.6% of the plate wide (was 15.8 / 14.4) and both sit
       on a shared top edge at plate-Y 24.33% and a shared bottom at 46.19%,
       which is the line theme.css §08a hangs the title card under.
       `width` is the VIRTUAL viewport the deck is rendered at before being
       scaled into the glass: the decks size their type in vw against a 1400px
       column, so 960 makes the content itself come out about a third larger
       than the old 1280 did, while still clearing the deck's own 900px compact
       breakpoint. */
    { slug:'wtw-chicago',   kind:'screen', mode:'live', width:960,
      x:26.96, y:24.33, w:21.66, h:21.86, label:'Win the Weekend — Chicago' },
    { slug:'wtw-big-south', kind:'screen', mode:'live', width:960,
      x:51.38, y:24.33, w:21.58, h:21.86, label:'Win the Weekend — Big South' },
    { slug:'nps',           kind:'tool',   x:77.5, y:25.5, w:18.5, h:25.0, label:'NPS Report', edge:'right' },
  ],
  prep: [
    { slug:'porting-guide', kind:'tool', x:24.0, y:33.5, w:9.0, h:12.0, label:'PortPro — Porting Guide' },
    { slug:'credit-limit',  kind:'tool', x:35.0, y:33.5, w:7.5, h:11.0, label:'Credit Limit Increase' },
    { slug:'bapis',         kind:'tool', x:43.5, y:34.5, w:6.5, h:10.0, label:'Online Order Processing' },
    { slug:'bp-access',     kind:'tool', x:51.0, y:35.0, w:5.0, h: 9.0, label:'Report BP Access Issues' },
  ],
  office: [
    /* THE BACK OFFICE MONITOR — days since the last detractor, one district per
       slide, from the Daily Sales Report's own nps-detractor-streaks.json.

       ── RE-SHOT 2026-08-27, THIRD COMPOSITION ────────────────────────────
       The client: "I love the TV screen but it's crooked. Also, it's still
       kind of small. I would love for it to be larger if possible since the
       information is important."

       Both were true and both were in the photograph, not the code. The room
       is now shot in symmetrical one-point perspective with the camera square
       to the back wall, so the display is a genuine rectangle:
         glass  x 35.50 → 64.46,  y 22.39 → 51.79
         left edge 29.10 tall, right edge 29.03  →  0.3% skew (was 23.3%)
         area 8.51% of frame (was 7.2%) — 18% bigger, 29% wider
       At 0.3% there is nothing to correct, so `quad` is GONE and this is a
       plain box. That matters: screens.js only applies its homography when a
       quad is present, so a flat panel now renders flat instead of being
       warped onto a plane it doesn't need. Inset ~0.5% off the traced glass so
       the mount sits inside the bezel. */
    { slug:'daily-sales', kind:'screen', mode:'feed',
      x:36.0, y:22.9, w:28.0, h:28.4,
      label:'Days Since The Last Bad NPS Survey' },

    /* The right-hand brick wall was re-measured against the same new plate.
       Its objects are larger and closer than in the previous composition,
       which is what keeps their printed labels legible — see labels.js. */
    /* The commission payout sheet, printed off and taped to the empty navy wall
       to the LEFT of the monitor — the client asked for it to read as a page
       someone actually ran off and stuck up. It is drawn rather than
       photographed: a real printed page is what the tool IS, so rendering it
       gives us live type at any size, and it keeps us from re-shooting a room
       whose square-on monitor took four attempts to get right. Sits above the
       bottom-left rail card with clear air between them. */
    /* ⚠ IT MUST STAY LEFT OF PLATE-X 22.2.
       This plate has a wall corner — a dead-vertical seam at plate-x 22.21%
       (traced by column-differencing at 14 heights; it moves 0.17% over the
       full frame). The first cut of this sheet ran 11.5 → 27.0, so 69% of it
       sat on the left return wall and 31% on the back wall, and the client
       read exactly that: "it looks like it's taped to both walls on the
       screen." Now 9.0 → 21.0, entirely on the return wall with 1.2% of
       clearance, and smaller as he asked. 12.0% x 17.0% of a 2400x1340 plate
       is 288 x 227.8 plate px = 1.264:1; landscape US Letter is 1.294:1, so
       the page still fills its box rather than being letterboxed in it. */
    { slug:'commission-payouts', kind:'print', x:9.0, y:25.0, w:12.0, h:17.0,
      label:'Commission Payouts 2026', rotate:-1.4 },

    /* ⚠ THE TWO CLIPBOARDS ARE 1.2% FROM THE PLATE'S RIGHT EDGE AND THAT IS
       NOT A MEASURING ERROR. Traced against plates/office.4e4c6d7172.webp: board 1 spans
       x 85.4 → 90.8, board 2 spans 91.3 → 98.8. The boxes below sit on them.
       Whether they are ON SCREEN is the room's framing, not these numbers —
       theme.css §06d ("THE CLIPBOARD WALL") gives the office a 1.04 bleed and
       an --art-x of .70 / .90 for exactly this, with the measurements. If a
       width still cannot show `fall-off` (1180x820 cannot: the tools span
       88.5% of the plate and that frame shows 77%), fix the crop or accept
       the chip — do not slide this box off its clipboard to make it fit. */
    { slug:'printouts',        kind:'tool', x:78.1, y:35.0, w:7.9, h:17.2, label:'Print Outs', edge:'right' },
    { slug:'exception-report', kind:'tool', x:85.6, y:36.8, w:4.4, h:20.0, label:'Exception Report', edge:'right' },
    { slug:'fall-off',         kind:'tool', x:91.5, y:34.4, w:6.0, h:24.2, label:'Fall-Off Summary', edge:'right' },
  ],
  breakroom: [
    /* THE DAILY SALES REPORT, ON THE BREAK-ROOM WALL.
       The plate was re-shot (2026-08-28) for two client asks at once: SIX chef
       frames instead of five, and "move the TV down to cover the gold plate
       above the Head Chef of the week... the header of the website covers the
       tv, so that's why I want to move it down."  Both are in the art now: the
       brass plaque is gone, the television hangs lower and is 24% wider, and
       the frame row grew to six.

       Glass traced by connected component at four thresholds (14/16/18/20 all
       agree, fill 0.99 — a clean rectangle):
         x 39.92 -> 62.71,  y 13.28 -> 35.90     (was 40.54 -> 59.83, 11.12 -> 30.60)
       Inset ~0.4% so the mount sits inside the bezel.

       Mode is `live`, not `report`: the client saw the native board and chose
       the real deck — "the slides are altered to match the aesthetic of the
       restaurant, but these can just stay the same as they appear on the actual
       slides. I'm good with that."  The Daily Sales Report is a fixed 1920x1080
       canvas, so it fits this 16:9-ish panel without the fluid-deck height
       problem the Dining boards have. */
    { slug:'daily-sales', kind:'screen', mode:'live',
      x:40.3, y:13.6, w:22.0, h:22.0, label:'Daily Sales Report' },

    { kind:'chefs' },

    /* The locker bank is four doors, seams read off a 6x crop of the new plate.
       It runs x 17.4 -> 30.4 and the sofa occludes it below y 68.

       HEIGHT IS 22, NOT 26, AND THE FOUR PERCENT IS NOT SPARE. The Break Room
       used to keep the v3 z-order with its hotspot layer BELOW .rail; §09 has
       the full story of why that was retired (the wash was capping the chef
       wall at 2.94:1 and painting through the new television). The cost of
       retiring it is that these brackets now paint ABOVE the rail card, and on
       a SHORT window they reached down into the chip rows — measured across the
       whole runway at five sizes, only 1512x751 clashed and it needed 3.29% of
       plate height. 22 gives it 4%. The doors still run y 42 -> 64 against art
       that is unoccluded to 68, so nothing was lost but the overlap. */
    { slug:'training-xfinity',      kind:'tool', x:18.2, y:42.0, w:3.1, h:22.0, label:'Xfinity Product Mastery' },
    { slug:'training-straight-line',kind:'tool', x:21.6, y:42.0, w:3.3, h:22.0, label:'Sales Process 101' },
    { slug:'training-tsheet',       kind:'tool', x:25.1, y:42.0, w:3.3, h:22.0, label:'The Plus-First Playbook' },
    { slug:'training-pos',          kind:'tool', x:28.5, y:42.0, w:1.9, h:22.0, label:'Celestial Point of Sale' },

    /* THE ARCADE CABINET — and it opens the ARCADE now, not one game.
       The client asked for "a Cook County Cooks Arcade section in the breakroom
       that has the games listed on there", chose the page-behind-the-cabinet
       option, and then said the thing that decides the rest: "I want it to be
       abundantly clear that there are games there … The reps won't notice it if
       we don't just point it out."

       ⚠ THIS BOX CANNOT BE THE SIGNPOST, AND THAT IS MEASURED, NOT ASSUMED.
       The cabinet sits at plate-x 89.5 -> 100.0, i.e. hard against the plate's
       right edge, and the room is cover-cropped. The share of this hotspot's
       OWN WIDTH that is actually on screen, measured at the runway sizes:

         1180x820 (the store iPads, his primary device)      0%
         1366x768                                           47%
         1440x900                                           14%
         1512x770                                           62%
         1920x1080                                          63%
         2560x1440                                          64%


       RE-CHECKED INDEPENDENTLY, WITH THE ROOM SCROLLED TO ITS OWN CENTRE, the
       numbers come out LOWER still — 0% at 1180x820, 0% at 1440x900 and 39% at
       2560x1440 — because the cover crop moves with --plate-x as the room is
       scrubbed, so "how much of the cabinet is on screen" is a function of
       where you are in the room as well as of the viewport. Which way the
       parallax happens to sit does not change the conclusion: at his device
       this object is never a signpost, and at the widths where it is visible it
       is a bonus.

       At his own device the cabinet is not on screen AT ALL. Re-framing the
       room to bring it in would push the training binders (plate-x 18.2 -> 30.4)
       out the other side — the identical trade theme.css §06d documents for the
       Back Office clipboards, and the binders are the room's actual job. So the
       room is NOT re-framed. The always-visible rail chip carries the
       discoverability (see buildRail()/armArcadeChips() in cinema.js and §08b in
       theme.css, which is why that one chip wears a marquee); this hotspot is a
       bonus at wide sizes and nothing depends on it.

       The box itself is unchanged — it is still traced to the same cabinet —
       only the slug moved, from `fox-run` to `arcade`. At the widths where it IS
       visible, clicking the cabinet now opens the arcade and the rep chooses a
       game, instead of being dropped into whichever game happened to be first. */
    { slug:'arcade',                kind:'tool', x:89.5, y:30.0, w:10.5, h:62.0, label:'C\u00b3 Arcade \u00b7 Games', edge:'right' },
  ],
  freezer: [
    { kind:'lock', x:34.3, y:47.0, w:2.6, h:8.0, label:'Manager access' },

    /* THE NOTE ON THE BACK WALL OF THE WALK-IN.
       The client: "I want to post this as if it's a note hanging in the
       freezer."  So: one sheet, printed off and stuck to the steel with a
       magnet — the same drawn-paper object the Back Office uses, in the
       opposite orientation and in this room's own light.

       MEASURED off plates/freezer.01697f04b3.webp (2400x1340). The back wall is clear
       brushed steel from plate-x 55 -> 71 and plate-y 30 -> 72, with faint
       panel seams near y 44 and y 58 and a vertical seam near x 68. The box
       below is centred on that panel and clears every seam but the last by a
       wide margin. 11.2% x 26.0% of the plate's cover box is 269 x 348 plate
       px, i.e. 0.773:1 — US Letter PORTRAIT is 8.5/11 = 0.773:1, an exact
       match, so the sheet fills its box with no letterboxing. (The Back
       Office sheet is the other way up: 1.262:1, landscape.)

       LIGHT. The room's only practical is the ceiling fixture at plate-x ~60,
       plate-y 5-15 — above the sheet and very slightly to its left, since the
       sheet's centre is plate-x 63.0. So wallprint.js throws this contact
       shadow DOWN and slightly RIGHT, and keeps it tighter and harder than
       the Back Office sheet's: the fixture is close and the wall is specular
       steel, not matte navy paint.

       ⚠ NO slug AND NO label, ON PURPOSE, AND DO NOT ADD THEM.
       This tool lives behind the walk-in's lock, which means it is not in the
       deployed tree at all — it is AES-256-GCM ciphertext in
       data/freezer.sealed.6eaa4f60f0.json (see build/seal-freezer.mjs and the gate note
       in app.js §2). Writing its slug, its name or its URL here would put in
       plaintext exactly the three strings the seal exists to remove, and
       build/seal-freezer.mjs's own leak check would fail the next build.

       `object` is how the sheet finds its tool instead: wallprint.js matches
       this string against the `object` field of the tools that EXIST at the
       moment it builds, which — for a sealed tool — is only ever after a
       correct code has decrypted them. While the walk-in is shut there is no
       match, so nothing is built: no button, no paper, no accessible name.
       That is also the gate. See wallprint.js §7. */
    { kind:'print', object:'note', x:57.4, y:36.0, w:11.2, h:26.0, rotate:1.1 },
  ],
};

/* The SIX picture-frame mat openings on the break-room wall (the plate was
   re-shot 2026-08-28 to add the sixth), measured off the render rather than
   estimated: each frame's centre row and column was profiled, and the mat
   opening is the flat 153-grey plateau between the white border strips —
   x 33.71/40.90/48.10/55.29/62.49/69.68, pitch 7.194, every one 3.92 x 10.97
   and all six sharing y 41.98. Frames 1-5 were read directly; frame 6 sits
   next to the espresso machine's highlight so its profile is contaminated —
   it is placed on the measured pitch and confirmed by sampling its interior
   (flat, std ~1.0, i.e. a real empty mat).
   chefwall.js drops chefs[i] into frames[i] — order is the contract, and that
   order is the district order in headchefs.json: Big South, West Side,
   East Side, North Side, South Side, Xfinity. */
export const CHEF_FRAMES = [
  { x:33.71, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:40.90, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:48.10, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:55.29, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:62.49, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:69.68, y:41.98, w:3.92, h:10.97, rotate:0 },
];


/* ═══════════════════════════════════════════════════════════════════════════
   THE WALK-IN DOOR  ·  geometry for assets/freezer.js
   ═══════════════════════════════════════════════════════════════════════════
   `plates/freezer-door.833492497b.webp` is the CLOSED state of the freezer room: the
   insulated door head-on, frost around the seal, cold vapour at the floor, an
   industrial keypad on the wall to its right.  `plates/freezer.01697f04b3.webp` (the room
   plate above) is the interior it opens onto.

   Every box below is PERCENT OF THE DOOR PLATE, exactly like HOTSPOTS — x/y is
   the top-left corner, w/h the size.  freezer.js reads nothing else; there is
   not one pixel value in that module.

     leaf     the swinging slab.  Its own box, not the frame's.
     opening  the aperture behind the leaf — the hole you see the freezer
              through.  Normally the leaf inset by the jamb reveal.
     keypad   the industrial keypad on the wall.  Becomes the tap target, so it
              is padded out to 44px by freezer.js if the art draws it smaller.
     handle   the lever, in plate % — the latch beat plays here.
     hinge    'left' | 'right' — which edge the leaf pivots on.
     swing    degrees of rotateY at full open.  NEGATIVE swings the leading
              edge TOWARD the camera on a left hinge (a walk-in door pulls
              out); flip the sign for a door that opens away.
     thickness the insulated slab's depth, in plate % of WIDTH.  Drawn as the
              leaf's side face once it is off the jamb.
     vanish   where the camera's optical centre sits in the plate, in plate %.
              Drives perspective-origin so the leaf rotates about the right
              vanishing point instead of about its own middle.
     fitPad   extra plate % around (leaf ∪ keypad) that the portrait/narrow
              presentation keeps in frame.  See freezer.js §"THE NARROW FIT".
     fitY     0..1 — where the vertical centre of that region sits in the
              stage on narrow viewports.  0.38 lifts the door clear of the
              chip drawer theme.css §17 puts across the bottom.

   ── MEASURED AGAINST THE FINAL ART ────────────────────────────────────────
   `plates/freezer-door.833492497b.webp` (2400x1340) is the real generated plate now, not
   the stand-in, and every number below was traced off its pixels rather than
   eyeballed. Method: for each candidate seam, walk the plate row by row (or
   column by column) and take the position of the strongest luminance gradient
   inside a +/-14px window, then take the mean of the run and reject outliers.
   The four leaf edges came out with a standard deviation of 0.8-2.4px across
   100+ samples each, i.e. better than 0.1% of the plate:

     leaf left seam    923.2px  38.47%   (sd 2.4 - the hinge straps nudge it)
     leaf right seam  1478.9px  61.62%   (sd 0.8)
     leaf top           144.0px 10.75%   (sd 1.7)
     leaf bottom       1250.1px 93.29%   (sd 2.3)
     frame outer L/R   28.10% / 71.52%   jamb stop L/R  35.35% / 64.65%

   THE HINGE IS ON THE LEFT, and this is observation, not inheritance: there
   are two chrome strap hinges on the leaf's left edge, at plate-Y 15% and 82%,
   each with its barrel sitting on the jamb at x 36.9-37.9% and its strap
   bolted across the leaf. The long chrome pull runs down the leaf's RIGHT side
   at x 59.2-59.8%, and the latch lever's keeper is bolted to the jamb strip at
   x 61.6-64.7% — hardware on the right, pivot on the left. So `hinge: 'left'`
   with a NEGATIVE swing stands: the leading edge is the latch edge and it
   comes out at the camera, which is what a walk-in door does.

   THE PLATE IS FRONTAL AND THE DOOR IS DEAD CENTRE, so `vanish` is the plate's
   own optical centre. The evidence: the leaf's midline is 50.05%, the jamb
   stops straddle 50.00%, the frame's outer edges straddle 49.81%, and the two
   jamb reveals either side of the leaf are 3.12% and 3.03% wide — equal to
   within a pixel and a half, which puts the camera axis at x 50.2%. Every
   horizontal in the shot (the brick band's foot at 54.9%, the floor line at
   97.0%) is flat to within 0.1% right across the frame, so there is no
   vertical convergence to read and no reason to offset the centre either way.
   vanish is therefore (50, 50) — the middle of the picture — where it used to
   be pulled to (50, 46) against a stand-in whose door sat left of centre.

   THE MAGNIFICATION STILL LANDS. `vanish` aims the projection; the SIZE of the
   leading edge at full travel is set by the leaf's width against the
   leafwrap's `perspective: 74cqw`. At swing -78 the leading edge ends up at
   z = leaf.w * sin(78) = 0.978 * leaf.w, so it magnifies by d / (d - z):

     1440x900   plate 1611.9px   leaf 374.1px   z 365.9   d 1065.6   x1.52
     1280x800   plate 1432.8px   leaf 332.6px   z 325.3   d  947.2   x1.52
     1920x1080  plate 1934.3px   leaf 448.9px   z 439.1   d 1420.8   x1.45

   which is the ~1.5x the swing curve and the through-the-doorway beat were
   authored around. The stand-in's 26%-wide leaf gave 1.63x, so the new,
   correctly narrower leaf brings it back rather than pushing it off; `swing`
   does not need re-tuning and is left at -78.

   `thickness` is the one number the art cannot show, because the slab's edge
   is hidden while the door is shut. It is derived instead: the leaf is 82.55%
   of a 1340px plate, and a walk-in leaf is about 1.98m tall, which puts the
   whole plate at 2.40m x 4.30m — and independently makes the leaf 1.00m wide,
   a standard 39" walk-in door, so the scale is consistent. A 4" insulated
   slab is 0.102m, i.e. 2.4% of the plate's width. freezer.js applies this in
   cqw rather than plate %, which at a desktop viewport is within ~10% of the
   same thing, so 2.3 is the value that draws a believable 3.5-4" edge.
   ⚠ `handle` is measured (the latch lever's centre, where the bolt lets go)
   but nothing reads it today — freezer.js drives the latch beat off the leaf
   as a whole. It is kept because it is the right place for that beat to land
   if the strain is ever localised, and because it documents the art.
   ═══════════════════════════════════════════════════════════════════════════ */
export const FREEZER_DOOR = {
  plate:     'plates/freezer-door.833492497b.webp',
  srcset:    'plates/freezer-door@1400.2c18d7f0b7.webp 1400w, '
           + 'plates/freezer-door@1800.5d976c9501.webp 1800w, '
           + 'plates/freezer-door.833492497b.webp 2400w',
  /* the slab: 38.45 -> 61.65 across, 10.75 -> 93.30 down */
  leaf:      { x: 38.45, y: 10.75, w: 23.20, h: 82.55 },
  /* the leaf inset by the jamb reveal, so it stays hidden behind the slab */
  opening:   { x: 39.55, y: 11.85, w: 21.00, h: 80.35 },
  /* the industrial keypad on the frame pilaster, chest height, right of the
     door: housing 65.30 -> 68.75 across, 39.20 -> 47.15 down */
  keypad:    { x: 65.30, y: 39.20, w:  3.45, h:  7.95 },
  /* the latch lever, where it meets its keeper */
  handle:    { x: 60.90, y: 52.80 },
  hinge:     'left',
  swing:     -78,
  thickness: 2.3,
  vanish:    { x: 50.0, y: 50.0 },
  fitPad:    3.5,
  fitY:      0.38
};
