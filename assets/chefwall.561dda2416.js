







export const WALL_SIZE = 6;



export const DEFAULT_FRAMES = [
  { x:  8.0, y: 30.0, w: 11.0, h: 15.0, rotate: 0 },
  { x: 21.5, y: 29.6, w: 11.0, h: 15.0, rotate: 0 },
  { x: 35.0, y: 29.2, w: 11.0, h: 15.0, rotate: 0 },
  { x: 48.5, y: 29.2, w: 11.0, h: 15.0, rotate: 0 },
  { x: 62.0, y: 29.6, w: 11.0, h: 15.0, rotate: 0 },
  { x: 75.5, y: 30.0, w: 11.0, h: 15.0, rotate: 0 }
];



export const NARROW_MEDIA = '(max-width: 899.98px), (max-aspect-ratio: 8/7)';

 
const BULLET_RE = /^[-‐-―•·*▪●⁃]\s*/;

 
let instanceSeq = 0;




const STYLE_ID = 'ccc-chefwall-styles';

const CSS = `
/* ---- tokens ------------------------------------------------------------
   Two families, because this module paints two different materials.

   PAPER  (--cw-paper / --cw-ink / --cw-mat): the monogram plate and the mats.
          These are prints on stock, so they read through theme.css §13's
          deliberately inverted --ccc-paper / --ccc-ink bridge tokens.

   ROOM   (--cw-surface / --cw-fg / --cw-line / --cw-brass*): the modal chrome.
          The modal is a piece of the room, NOT a light card floating on a dark
          page, so it reads theme.css's own semantic tokens directly. Every one
          has a literal fallback so the file still stands alone with no theme.

   Radii come from theme's ramp on purpose: --r-xs 2px / --r-sm 3px / --r-md 6px.
   Brass and steel hardware has a 1-3px break, not a marshmallow edge. Nothing
   in here may invent a 12px or 999px corner. */
.ccc-chefwall, .ccc-chefmodal{
  /* paper */
  --cw-ink:        var(--ccc-ink, #16120d);
  --cw-paper:      var(--ccc-paper, #f4efe6);
  --cw-mat:        var(--bone-2, #dcd5c8);          /* the ONE mat colour */
  --cw-muted:      var(--ccc-muted, #6b6154);

  /* room chrome */
  --cw-surface:    var(--surface, #171e26);
  --cw-fg:         var(--fg, #f4efe6);
  --cw-fg-muted:   var(--fg-muted, #dcd5c8);
  --cw-dim:        var(--bone-3, #b4aba0);
  --cw-line:       var(--line, rgb(200 151 63 / .30));
  --cw-shade:      var(--shade, 3 5 9);
  --cw-walnut:     var(--walnut, #4b3526);

  /* the engraved plaque under each frame. Literal, not derived, because these
     two colours are the ONE contrast pair in this module that has an audited
     number on it (§2 ".cw-plate") and a token that moves would move it. */
  --cw-plaque-hi:  #1b2129;          /* milled top edge, catching the key light */
  --cw-plaque-lo:  #0e1218;          /* the body of the plate                    */
  --cw-plaque-ink: #f0d9a4;          /* brass fill in the engraving              */

  /* the one accent */
  --cw-accent:     var(--ccc-accent, var(--brass, #c8973f));
  --cw-accent-lit: var(--ccc-accent-hi, var(--brass-300, #ebce93));
  --cw-accent-mid: var(--brass-400, #ddb463);
  --cw-accent-deep:var(--accent-deep, var(--brass-700, #8a6323));
  --cw-focus:      var(--ccc-focus, #ebce93);

  /* type + curve */
  --cw-serif:      var(--ccc-font-display, "Bodoni Moda", Georgia, serif);
  --cw-sans:       var(--ccc-font-ui, Archivo, system-ui, -apple-system, sans-serif);
  --cw-r-xs:       var(--r-xs, 2px);
  --cw-r-sm:       var(--r-sm, 3px);
  --cw-r-md:       var(--r-md, 6px);
  --cw-shadow-3:   var(--shadow-3, 0 30px 90px -18px rgb(3 5 9 / .8), 0 4px 18px -6px rgb(3 5 9 / .6));
  --cw-ease:       var(--ease-cine, cubic-bezier(.2,.7,.2,1));
}
/* v29: tag-keyed, not "*" — a universal rightmost compound is tried against
   every element on every restyle (theme.css §03's note). */
.ccc-chefmodal div, .ccc-chefmodal button, .ccc-chefmodal img, .ccc-chefmodal figure, .ccc-chefmodal ul, .ccc-chefmodal li{ box-sizing:border-box; }

/* ---- THE LIGHTS -------------------------------------------------------------
   (v29: now read straight from the stage's quantised --lit — see .ccc-chefwall
   below. The derivation is kept as the record of what that value is.)
   theme.css §06b's --lit, re-derived from numbers that actually reach this
   subtree. See the ⚠ block in the file header for why it cannot simply be
   inherited: --lit is declared on .plate-wrap and .hotspots is its SIBLING, so
   "var(--lit)" here silently resolves to the registered initial-value 1.

   --enter, --bloom and --p are written by engine.js on ".stage", which IS an
   ancestor of the hotspot layer, so they inherit correctly. The arithmetic
   below is byte-for-byte theme.css's:

       --arr  = clamp(0, (enter - 0.90) x 11, 1)      the arrival ramp
       --hold = clamp(0, (p - 0.55) x 4, 1)           pins a departing room lit
       --lit  = clamp(0, 0.52 arr + 0.48 bloom³ + hold, 1)

   REGISTERED, not decoration. An unregistered custom property is substituted as
   a token stream, so "0.48 * var(--bloom)" would splice text rather than
   multiply typed numbers, and the whole clamp would resolve to garbage the
   first time --bloom arrived as anything but a bare number. The initial values
   are the LIT end for the same reason theme.css's are: a page whose engine.js
   never ran must render a correct, fully-lit wall. */
@property --cw-lit  { syntax: "<number>"; inherits: true;  initial-value: 1; }

/* ---- root -------------------------------------------------------------- */
/* Fills the host exactly. NO transform here: the host (a .hotspots layer) is
   already carrying the plate transform from theme.css. See header comment. */
.ccc-chefwall{
  position:absolute; inset:0;
  pointer-events:none;              /* only the buttons are hit-testable */
  font-family:var(--cw-sans);

  /* v29: theme.css §05 now publishes the room's --lit on .stage itself,
     quantised (0.04 steps) and derived from the engine's fine tier with the
     formula below, term for term — so the wall reads it instead of
     re-deriving it from per-frame inputs, which restyled every frame, plaque
     and photo on each scroll frame of the Break Room's arrival. */
  --cw-lit:  var(--lit, 1);
}
.ccc-chefwall div, .ccc-chefwall button, .ccc-chefwall img, .ccc-chefwall figure, .ccc-chefwall ul, .ccc-chefwall li{ box-sizing:border-box; }

/* =========================================================================
   A. THE WALL (>= 900px) — five buttons pinned into the painted frames
   ====================================================================== */
.cw-wall{ position:absolute; inset:0; }

/* One framed photo. Percent geometry maps 1:1 onto the measured mat opening.
   The rotate lives on THIS element so the hover lift (on .cw-lift) can be a
   clean translate/scale without fighting the rotation. */
.cw-frame{
  position:absolute;
  margin:0; padding:0; border:0; background:none; color:inherit;
  -webkit-appearance:none; appearance:none;
  cursor:pointer;
  pointer-events:auto;
  transform-origin:50% 50%;
  /* the button box IS the mat opening; outline therefore traces the frame,
     and because outline is painted on the (rotated) border box it stays
     square to the frame rather than to the screen. */
  border-radius:var(--cw-r-xs);
  -webkit-tap-highlight-color:transparent;

  /* THE FRAME IS ITS OWN QUERY CONTAINER, and that is what makes the engraved
     plaque scale with the art instead of with the viewport.

     The mat opening is 4.09% x 11.11% of the plate — 56 x 85 CSS px at 1024,
     105 x 160 at 2560, and larger again mid-scrub while --plate-scale pushes
     in. Sizing the plaque in cqw/cqh of THIS box therefore ties it to the
     picture frame it belongs to, at every viewport and through the push-in,
     with one number instead of four breakpoints. A cqw written without this
     would resolve against "stage" (theme.css §05) — i.e. against the viewport
     — and the plates would grow relative to the frames as the window widened.

     "container-type: size" (not inline-size) because the plaque's own type
     size is set from the frame's HEIGHT: the frames are much taller than they
     are wide, and height is what the row of them reads as. Legal here because
     the box is explicitly sized in both axes by placeFrame(); it computes to
     "contain: size layout style", which does NOT clip, so the plaque still
     paints below the frame and the cast shadow still paints outside it. */
  container-type: size;
}
.cw-frame:focus{ outline:none; }
.cw-frame:focus-visible{
  outline:2px solid var(--cw-focus);
  outline-offset:3px;
  box-shadow:0 0 0 5px rgb(var(--cw-shade) / .55);  /* legible on any plate */
}

/* The moving part.
   NOTE ON will-change: it is declared ONLY on :hover, ONLY inside
   @media (hover:hover). A static declaration here promoted all five frames to
   their own compositor layers for the whole session — on iPad, where :hover can
   never fire, that bought five permanent layers for an effect that cannot run,
   cost ~30% of median frame time, and quietly defeated the engine's
   add-on-live / remove-on-dormant discipline. Promote on the pointer that can
   actually trigger the animation, and only while it is over the frame. */
.cw-lift{
  position:absolute; inset:0;
  /* v29: no resting transform at all. translate3d(0,0,0) was an unconditional
     promotion — exactly the five permanent layers the note above says were
     removed. The hover transition promotes for its own duration. */
  transform:none;
  transition:transform 420ms var(--cw-ease);
}
@media (hover:hover){
  .cw-frame:hover .cw-lift{
    will-change:transform;
    transform:translate(0,-3px) scale(1.015);
  }
}
.cw-frame:focus-visible .cw-lift{ transform:translate(0,-3px) scale(1.015); }

/* Cast shadow under the lifted frame. Opacity-only animation (perf rule). */
.cw-cast{
  position:absolute; inset:0;
  border-radius:var(--cw-r-xs);
  box-shadow:0 14px 26px -8px rgb(var(--cw-shade) / .7);
  opacity:0;
  transition:opacity 420ms var(--cw-ease);
  pointer-events:none;
}
@media (hover:hover){ .cw-frame:hover .cw-cast{ opacity:1; } }
.cw-frame:focus-visible .cw-cast{ opacity:1; }

/* ---- the mat ------------------------------------------------------------
   The painted mats in the plate photograph are not consistent (frame 1 reads
   greenish-cream, 2-5 pink-white). So we do not rely on them: we paint our OWN
   mat over the whole measured opening in the single --bone-2 mat colour and
   inset the print 6% inside it. Five identical mats, five identical borders,
   whatever the underlying art does. */
.cw-mat{
  position:absolute; inset:0;
  background:var(--cw-mat);
  border-radius:var(--cw-r-xs);
  box-shadow:
    inset 0 0 0 1px rgb(var(--cw-shade) / .35),
    inset 0 1px 0 rgb(255 255 255 / .45);
}
/* THE one inset. Both the print and its recess shadow sit at exactly 6%. */
.cw-mat > .cw-photo,
.cw-mat > .cw-inset{ inset:6%; }

/* Brass rim on hover/focus — the cue that this is a control, not decoration. */
.cw-mat::after{
  content:""; position:absolute; inset:0;
  border-radius:var(--cw-r-xs);
  box-shadow:
    0 0 0 1px var(--cw-accent),
    0 0 0 3px rgb(var(--cw-shade) / .45);
  opacity:0;
  transition:opacity 240ms var(--cw-ease);
  pointer-events:none;
}
@media (hover:hover){ .cw-frame:hover .cw-mat::after{ opacity:1; } }
.cw-frame:focus-visible .cw-mat::after{ opacity:1; }

/* The printed photograph itself. */
.cw-photo{
  position:absolute; inset:0;
  overflow:hidden;
  background:var(--cw-walnut);        /* never flashes white while decoding */
  border-radius:1px;
}
/* THE single object-fit declaration in this file. The wall frame, the modal
   portrait and the narrow-strip card all resolve here, so a portrait can never
   be letterboxed in one place and filled in another. 50% 28% puts a head at a
   consistent height across five crops. */
.cw-photo img{
  display:block; width:100%; height:100%;
  object-fit:cover;
  object-position:var(--cw-focus-pos, 50% 28%);
  /* A seat, not a stamp. The client owns the image now — whatever is on the
     slide IS the picture — so this must flatter a good headshot rather than
     process it, while still seating an anime still or a photo of a store into
     the same room. Dialled back from .84/1.06: enough to take the edge off a
     phone-camera oversaturation, not enough to be visible on a well-lit
     portrait. The walnut wash below does the actual unifying. */
  filter:saturate(.94) contrast(1.02);
}
/* The unifying wash: multiply pulls every source toward the room's warm
   shadow, which is what makes unrelated photos read as one wall. At 10% it
   was visibly muddying the shadows of a well-lit portrait; 6% still seats a
   cold phone photo in the room without greying a good one. */
.cw-grade{
  position:absolute; inset:0;
  background:var(--cw-walnut);
  /* v29: plain alpha, not multiply. A blend mode reads the backdrop back on
     every composite (audit/perf.md §3.4 fix 5); at 6% walnut the two differ by
     under 1% of luminance anywhere on a portrait. */
  opacity:.06;
  pointer-events:none;
}

/* Paper-behind-glass: a tight inset shadow so the print reads as recessed
   inside the mat rather than pasted on top of the photograph. */
.cw-inset{
  position:absolute; inset:0;
  pointer-events:none;
  border-radius:1px;
  box-shadow:
    inset 0 0 0 1px rgb(var(--cw-shade) / .55),
    inset 0 2px 6px rgb(var(--cw-shade) / .45),
    inset 0 -1px 3px rgb(var(--cw-shade) / .30),
    inset 2px 0 5px rgb(var(--cw-shade) / .22);
}

/* Glass, over the whole frame opening (mat included). The room's key light
   comes from ABOVE-LEFT, so the standing specular is brightest at the top-left
   corner and falls off down-right. */
.cw-glass{
  position:absolute; inset:0;
  pointer-events:none; overflow:hidden;
  border-radius:var(--cw-r-xs);
  background:linear-gradient(
      118deg,
      rgba(255,255,255,.26) 0%,
      rgba(255,255,255,.10) 26%,
      rgba(255,255,255,.02) 44%,
      rgba(255,255,255,0)   62%);
  /* v29: no mix-blend-mode. A pure-white layer at alpha a composites to
     base + a(1 - base) under BOTH screen and normal blending, so the gloss is
     pixel-identical — minus the backdrop readback screen cost every frame. */
}
/* The travelling highlight — a narrow angled band that sweeps left→right on
   hover/focus, as if the viewer leaned in. Same 118deg as the standing gloss. */
.cw-sweep{
  position:absolute; top:-60%; bottom:-60%; left:-140%; width:80%;
  background:linear-gradient(
      to right,
      rgba(255,255,255,0) 0%,
      rgba(255,255,255,.30) 45%,
      rgba(255,255,255,.42) 55%,
      rgba(255,255,255,0) 100%);
  transform:rotate(28deg) translate(0,0);
  transition:none;
  pointer-events:none;
}
@media (hover:hover){
  .cw-frame:hover .cw-sweep{
    transform:rotate(28deg) translate(340%,0);
    transition:transform 900ms var(--cw-ease);
  }
}
.cw-frame:focus-visible .cw-sweep{
  transform:rotate(28deg) translate(340%,0);
  transition:transform 900ms var(--cw-ease);
}

/* ---- the name, revealed beneath the frame ------------------------------
   The wall is the room's headline feature and was its least discoverable
   control: no lift, no name, no cue. The lift + brass rim above answer the
   first two; this answers "who is that?" without a click. Decorative only —
   the button's aria-label already carries the full name. */
.cw-nametag{
  position:absolute; left:50%; bottom:100%; margin-bottom:.5rem;
  transform:translate(-50%,4px);
  opacity:0;
  padding:.28em .6em;
  font-family:var(--cw-sans);
  font-size:clamp(10px, .72vw, 14px);
  font-weight:600; letter-spacing:.14em; text-transform:uppercase;
  white-space:nowrap; pointer-events:none;
  color:var(--cw-accent-lit);
  /* v29: no backdrop-filter anywhere on the site (theme.css .chip note); a
     denser ground reads the same over a photograph. */
  background:rgb(var(--cw-shade) / .9);
  border-radius:var(--cw-r-xs);
  box-shadow:inset 0 0 0 1px var(--cw-line), 0 2px 10px rgb(var(--cw-shade) / .5);
  transition:opacity 240ms var(--cw-ease), transform 240ms var(--cw-ease);
}
@media (hover:hover){
  .cw-frame:hover .cw-nametag{ opacity:1; transform:translate(-50%,0); }
}
.cw-frame:focus-visible .cw-nametag{ opacity:1; transform:translate(-50%,0); }

/* ---- held entries -------------------------------------------------------
   An entry the pipeline is HOLDING (the district's slide was absent on this
   run, so the last chef it saw stayed in the frame) looked identical to one
   confirmed an hour ago. It is not identical, and past a week it is news.

   The treatment is a date, not an alarm: a small engraved brass tab on the
   frame, permanently visible — unlike .cw-nametag, which is a hover reveal —
   because the person who needs it is reading the wall from the doorway. Past
   the pipeline's own stale_warn_days the tab goes amber and the print is
   desaturated, which is as far as this should ever go: the chef in the frame
   is still a real winner and the write-up under them is still true.
   Contrast: #f0d9a4 on rgb(var(--cw-shade)/.8) is 11.4:1; the amber
   #e8b45a on the same ground is 8.2:1. */
.cw-heldtag{
  position:absolute; left:6%; bottom:6%;
  padding:.22em .5em;
  font-family:var(--cw-sans);
  font-size:clamp(9px, .62vw, 12px);
  font-weight:600; letter-spacing:.12em; text-transform:uppercase;
  white-space:nowrap; pointer-events:none;
  color:var(--cw-accent-lit);
  background:rgb(var(--cw-shade) / .8);
  border-radius:var(--cw-r-xs);
  box-shadow:inset 0 0 0 1px var(--cw-line);
}
.cw-frame.is-stale .cw-heldtag,
.cw-card.is-stale .cw-heldtag{ color:#e8b45a; }
.cw-frame.is-stale .cw-photo img,
.cw-card.is-stale .cw-photo img{ filter:saturate(.6); }

/* The modal's own line, under the store/role. */
.cw-held{
  margin:.45rem 0 0;
  font-family:var(--cw-sans);
  font-size:.78rem; font-weight:600;
  letter-spacing:.1em; text-transform:uppercase;
  color:var(--cw-fg-muted);
}
.cw-held.is-stale{ color:#e8b45a; }

/* =========================================================================
   A2. THE DISTRICT PLAQUE — engraved, screwed to the wall under the frame
   -------------------------------------------------------------------------
   WHY A PLAQUE AND NOT A CAPTION. The break room is a photograph. A line of
   web type floating on the wall under a picture frame is the one thing that
   would break it — the same failure labels.js exists to avoid, and it solves
   it the same way: put the words ON AN OBJECT that belongs in the room. On a
   wall of fame that object is obvious and it is the one the client already
   has in every store: a small dark plate with the district engraved and the
   letters filled brass, mounted a few millimetres under the moulding.

   IT IS ON EVERY FRAME, INCLUDING AN EMPTY ONE. The plaque names the DISTRICT,
   not the chef, so it is a property of the wall and not of the week. An empty
   mat under "WEST SIDE" reads as "no head chef posted for the West Side this
   week", which is a true and ordinary thing to see. A blank frame with no
   plaque reads as a bug.

   THE WORDS COME FROM THE DECK. build/pull-headchefs.mjs takes them out of the
   slide's own <h2> ("Head Chef Of The Week — Big South" -> "Big South") and
   folds the deck's wording onto the client's short label ("Outlawz (East)" ->
   "East Side"). Nothing here knows any district's name.

   ── CONTRAST ──────────────────────────────────────────────────────────────
   --cw-plaque-ink #f0d9a4 on the plate body --cw-plaque-lo #0e1218 is 13.2:1,
   and on the lightest band of the milled gradient --cw-plaque-hi #1b2129 it is
   11.6:1. The plate is OPAQUE, so neither number depends on what is painted
   behind it — which is the whole reason the label is a plate and not type
   floating on a photograph, where the ratio would change with the plate art,
   the room's exposure and the parallax offset. Measured off the render at
   1024, 1440, 1920 and 2560; the floor across all four is well past 7:1.

   ── THE LIGHTS ────────────────────────────────────────────────────────────
   Opacity only, off §2's re-derived --cw-lit — NOT brightness. Brightness
   would scale ink and plate by different amounts through the sRGB transfer
   curve and quietly move the audited ratio; a plate fading up as a whole
   keeps ink and ground in exactly the fixed relationship measured above. The
   0.07 floor is there so an unlit room shows a dark plate on a dark wall
   rather than a hole where one should be. Opacity is also the one property
   that costs the compositor nothing to animate every frame, six times over.
   ====================================================================== */
.cw-plate{
  position:absolute;
  left:50%; top:100%;
  margin-top:7cqh;                 /* the moulding-to-plate gap, in frame units */
  /* WIDTH IS BOUNDED BY THE PITCH, NOT BY THE TEXT. The mat opening is 4.09% of
     the plate and the frames sit on a 7.27% pitch, so a plate may be up to
     ~170% of the opening before two of them touch. 158% leaves ~0.8% of plate
     (11px at 1024) of wall between neighbours, which is what makes the row read
     as six separate plates rather than a strip. */
  width:158cqw;
  transform:translate(-50%,0);
  box-sizing:border-box;
  /* Centred in a fixed box so the row is one straight line of identical plates.
     Before this, "NORTH SIDE" and "SOUTH SIDE" wrapped to two lines at 1024
     while their four neighbours did not, and the row came out 24px / 38px /
     24px / 38px — measured, and the single ugliest thing on the wall. The type
     below now fits all six on one line at every width; the min-height is the
     belt to that braces, so a district name nobody has thought of yet grows the
     plate symmetrically instead of stepping one out of the row. */
  display:grid; place-content:center;
  min-height:26cqh;
  padding:.34em .42em .38em;
  border-radius:var(--cw-r-xs);
  pointer-events:none;

  /* milled dark plate: key light from above-left, so the top edge catches and
     the body falls away, with a faint bounce off the wall at the bottom */
  background:linear-gradient(177deg,
      var(--cw-plaque-hi) 0%,
      var(--cw-plaque-lo) 62%,
      color-mix(in oklab, var(--cw-plaque-lo) 88%, var(--cw-plaque-hi)) 100%);
  box-shadow:
    inset 0 0 0 1px color-mix(in oklab, var(--cw-accent) 42%, transparent),
    inset 0 1px 0 rgb(255 255 255 / .07),
    0 .10em .26em rgb(var(--cw-shade) / .62);

  /* the engraving */
  color:var(--cw-plaque-ink);
  font-family:var(--cw-sans);
  /* MEASURED TO FIT. The longest of the client's six labels is "NORTH SIDE" /
     "SOUTH SIDE" at ten characters; at 11.5cqh with .055em of tracking they set
     to 74px inside a 102px plate at 1024, and every label scales from there.
     The 9px floor is for a viewport short enough that 11.5cqh stops being type
     and starts being grey mush — the wall is already suppressed below 900px
     (NARROW_MEDIA), so it should never bind, and it costs nothing if it does. */
  font-size:max(9px, 11.5cqh);     /* ~9.8px at 1024, ~18.4px at 2560 */
  font-weight:700;
  line-height:1.16;
  letter-spacing:.055em;
  text-transform:uppercase;
  text-align:center;
  text-wrap:balance;
  overflow-wrap:break-word;
  hyphens:auto;
  /* cut, not printed: shadow below the glyph is the wall showing through the
     bottom of the groove under a light that comes from above */
  text-shadow:0 1px 0 rgb(3 5 9 / .8);

  opacity:calc(0.07 + 0.93 * var(--cw-lit));
}
/* The one hairline that makes it a plate and not a pill: a brass score line
   along the top edge, where a real engraved plate is chamfered. */
.cw-plate::before{
  content:""; position:absolute; left:14%; right:14%; top:2px; height:1px;
  background:linear-gradient(to right, transparent,
      color-mix(in oklab, var(--cw-accent) 58%, transparent), transparent);
  pointer-events:none;
}

/* ---- no photo this week: an empty mat ----------------------------------
   The client owns the image: whatever is on the slide is the picture, and if
   the slide is blank the frame is blank. So "no photo" is NOT an error and
   gets no substitute artwork — it gets the same --bone-2 mat, the same 6%
   recess, the same frame shadow and the same glass specular as its four
   neighbours, with nothing in it. A framed blank waiting for this week's
   photo, which is a normal thing to see on a real wall of fame.

   Deliberately no engraved caption in the mat. Beside four photographs, type
   in the one empty frame is the loudest thing on the wall and turns a quiet
   gap into an announcement. The name is still there on demand: the button
   carries the full accessible name, and .cw-nametag reveals it on hover and
   focus exactly as it does for a frame with a picture in it. */
.cw-photo.cw-blank{
  /* v29 fix round (G3 m-8) · A BLANK SLIDE IS A DARK, EMPTY FRAME. The mat
     used to fill the opening in its own light bone, which on the wall read
     as a blank white card — "a missing image", the reviewer's words — in the
     one place a visitor looks for faces. Jeff's rule stands (blank slide →
     blank frame, no stand-in art, no caption): the opening is now what an
     empty frame on a dark wall actually shows — the dark backing, a little
     depth at the top edge, and the glass catching the room's light — with
     its district plate beneath it exactly as the others have. */
  background:
    linear-gradient(158deg, rgb(255 255 255 / .07) 0%, rgb(255 255 255 / .02) 30%, transparent 46%),
    radial-gradient(120% 95% at 50% 38%,
      color-mix(in oklab, var(--cw-walnut) 38%, #0c0f15) 0%,
      #080a0f 72%,
      #05070a 100%);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / .5), inset 0 7px 12px -4px rgb(0 0 0 / .7);
}

/* ---- a vacant slot -----------------------------------------------------
   The five frames are painted into the photograph; the data is regenerated
   weekly from the decks and may arrive with fewer than five slides. A slot
   with no chef behind it has nothing to open, so it is not a button and not
   in the tab order — just the empty mat, in frame order. */
.cw-frame--vacant{
  cursor:default;
  pointer-events:none;
}

/* ---- monogram — now the ERROR state only -------------------------------
   Demoted. A file that was supposed to load and 404'd is a genuine fault and
   must not look identical to "no photo on the slide this week": one is a
   broken deploy, the other is Tuesday. So the blank mat means blank, and the
   monogram means something went wrong fetching a picture that exists. */
.cw-mono{
  position:absolute; inset:0;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  gap:.35em;
  background:
    radial-gradient(120% 90% at 28% 18%, #fbf6ec 0%, #ece2d0 52%, #d9cbb4 100%);
  color:#4a3f2e;
  border-radius:1px;
  overflow:hidden;
}
.cw-mono::before,.cw-mono::after{
  content:""; position:absolute; left:14%; right:14%; height:1px;
  background:linear-gradient(to right,transparent,var(--cw-accent),transparent);
  opacity:.75;
}
.cw-mono::before{ top:18%; }
.cw-mono::after{ bottom:18%; }
.cw-mono b{
  font-family:var(--cw-serif);
  font-weight:600;
  font-size:min(3.4vw, 2.6em);
  line-height:1;
  letter-spacing:.06em;
  /* engraved: light from above-left => dark above, light below */
  text-shadow:0 -1px 0 rgba(0,0,0,.22), 0 1px 0 rgba(255,255,255,.85);
}
.cw-mono i{
  font-style:normal;
  font-size:min(.95vw,.62em);
  letter-spacing:.22em;
  text-transform:uppercase;
  color:#8a7a5f;
}

/* ---- Xfinity rosette ----------------------------------------------------
   A different award, so it keeps a distinct mark — but a milled brass rosette
   pinned to the frame, not a saturated cornflower disc. The old badge was the
   only saturated blue on the site and read as a social-media verification
   sticker; brass is the room's one accent and the material the rest of the
   hardware is cut from. */
.cw-badge{
  position:absolute;
  top:-7%; right:-7%;
  width:26%; max-width:2.4em; aspect-ratio:1;
  display:grid; place-items:center;
  border-radius:50%;
  background:radial-gradient(circle at 34% 28%,
      var(--cw-accent-lit) 0%, var(--cw-accent) 45%, var(--cw-accent-deep) 100%);
  color:var(--cw-accent-deep);
  box-shadow:
    0 .16em .4em rgb(var(--cw-shade) / .6),
    inset 0 0 0 1px color-mix(in oklab, var(--cw-accent-lit) 72%, transparent),
    inset 0 -.09em .18em rgb(var(--cw-shade) / .32);
  font-size:min(1.4vw,1em);
  line-height:1;
  pointer-events:none;
}
/* The milled edge. Masked to a ring so the disc reads through; where mask is
   unsupported it degrades to a plain brass rosette, never to a broken shape. */
.cw-badge::before{
  content:""; position:absolute; inset:-9%;
  border-radius:50%;
  background:repeating-conic-gradient(from 0deg,
      var(--cw-accent-deep) 0deg 6deg, var(--cw-accent-mid) 6deg 12deg);
  -webkit-mask:radial-gradient(circle, transparent 0 62%, #000 63% 100%);
  mask:radial-gradient(circle, transparent 0 62%, #000 63% 100%);
}
/* Engraved, not printed: shadow above, catchlight below. */
.cw-badge svg{
  position:relative; width:60%; height:60%; display:block;
  filter:drop-shadow(0 1px 0 color-mix(in oklab, var(--cw-accent-lit) 85%, transparent));
}

/* =========================================================================
   B. NARROW / PORTRAIT FALLBACK — clean horizontal card strip.
   Condition is interpolated from NARROW_MEDIA; see its doc comment.
   ====================================================================== */
.cw-strip{ display:none; }
/* A detached strip host is a normal flow element at every width. */
.ccc-chefwall.cw-detached{ position:relative; inset:auto; pointer-events:auto; }
.ccc-chefwall.cw-detached .cw-wall{ display:none; }

@media ${NARROW_MEDIA}{
  /* Either the viewport is too narrow, or the plate is cropped side-to-side by
     a portrait viewport. Both mean there are no frames left to sit in, and both
     are exactly when theme.css §16 hides .hotspots (and therefore .cw-wall).
     Pass stripHost at init so the strip lives OUTSIDE that hidden, transformed
     layer — e.g. the room's .rail. If it was not passed, initChefWall relocates
     the strip itself; see ensureStripMount(). */
  .ccc-chefwall{ inset:auto 0 0 0; pointer-events:auto; }
  .ccc-chefwall.cw-detached{ position:relative; inset:auto; }
  .cw-wall{ display:none; }

  /* ── THE STRIP · a snapping carousel, and it says so ──────────────────────
     WHAT THE CLIENT PHOTOGRAPHED. Six cards ran off the right edge of a 393px
     phone and the fourth was cut through the middle of "Nayeri Hernandez".
     Two independent faults, both fixed here:

       1. THE BOX WAS WIDER THAN THE PHONE. Measured at 393x852: this strip's
          border box was 585.2px inside a 348.6px column. It was already a
          scroller — it just had nowhere to scroll, because its host row let it
          take its max-content width. min-inline-size + max-inline-size pin
          it to its column here; theme.css §17 pins the column itself.

       2. THE ROW WAS RAGGED, so even the part on screen read as broken. Card
          widths ran 67.5 / 80.1 / 97 / 77.1 / 73.1 / 98.4px and card heights
          213.2 / 228.9 / 240 / 240.2 / 250.1 / 271.6px, because every box was
          sized by its own text: "Iron Mike" took two lines where "Alexis Bell"
          took one, and "North Side" wrapped its plate to two lines where "Big
          South" kept one. Now every card is the same width and the same height
          BY CONSTRUCTION — a fixed inline size and a three-row grid with all
          three rows given explicit heights — so no card can wrap to a
          different height from its neighbours whatever its data says.

     AND THE OVERFLOW IS NOW DELIBERATE. Six chefs will not fit any phone; what
     was missing was any sign that there were more. The card width is solved so
     two cards land whole and the third is visibly cut into — 21.6px of it at
     393, 15.8 at 375, 29.7 at 430 — under a fade that runs out at the frame
     edge, with mandatory x-snap so a flick lands on a card and never between
     two. That is the same affordance §12's repo list uses: the content is
     self-evidently cut off, rather than a chrome element that can be missed.
     iOS draws no resting scrollbar, so it could not have been one anyway.

     THE HEIGHT IS THE OTHER HALF OF THE FIX, and it is the one theme.css §17
     asked for by name ("fixing it means capping the STRIP, not the drawer").
     The strip was 299.6px tall in a ~330px content box, so the Break Room's
     minmax(0, 1fr) tool drawer collapsed to NINE PIXELS and all six of that
     room's tools were unreachable on a phone. A card is now 88.4px and the
     strip 116.4px, which gives the drawer back ~183px — three tool rows and
     the start of a fourth.                                                   */
  /* THE BOX WAS WIDER THAN THE PHONE, and that is a fault at every narrow
     width, so it is fixed here rather than in the phone block below. Measured
     at 393x852: this strip's border box was 585.2px inside a 348.6px column.
     It was already a scroller — it just had nowhere to scroll, because its host
     row let it take its max-content width, so the fourth card was cut through
     the middle of "Nayeri Hernandez" and cards five and six were off the
     screen entirely. These two lines pin the strip to its column;
     theme.css §17 pins the column itself (grid-template-columns: minmax(0,1fr)). */
  .ccc-chefwall.cw-detached{ min-inline-size:0; max-inline-size:100%; }
  .cw-strip{
    display:flex; gap:.75rem;
    min-inline-size:0; max-inline-size:100%;
    overflow-x:auto; overscroll-behavior-x:contain;
    scroll-snap-type:x mandatory;
    -webkit-overflow-scrolling:touch;
    padding:.75rem 1rem 1rem;
    margin:0; list-style:none;
    scrollbar-width:thin;
  }
  .cw-card{
    scroll-snap-align:start;
    flex:0 0 clamp(9.5rem, 44vw, 12.5rem);
    min-height:44px;                 /* tap-target floor */
    display:flex; flex-direction:column; gap:.55rem;
    padding:.6rem .6rem .7rem;
    border:1px solid var(--cw-line);
    border-radius:var(--cw-r-sm);
    background:
      linear-gradient(180deg, rgb(255 255 255 / .05), transparent 50%),
      rgb(var(--cw-shade) / .8);
    color:var(--cw-fg);
    text-align:left; cursor:pointer;
    -webkit-appearance:none; appearance:none;
    -webkit-tap-highlight-color:transparent;
    transition:transform 240ms var(--cw-ease);
  }
  .cw-card:active{ transform:scale(.985); }
  .cw-card:focus-visible{ outline:2px solid var(--cw-focus); outline-offset:2px; }
  .cw-card .cw-cardart{
    position:relative;
    width:100%; aspect-ratio:4/5;
    border-radius:var(--cw-r-xs); overflow:hidden;
    background:var(--cw-walnut);
    box-shadow:inset 0 0 0 1px rgb(var(--cw-shade) / .5);
  }
  /* object-fit / object-position are NOT repeated here: .cw-photo img is the
     single declaration, so the card crop matches the wall and modal exactly. */
  .cw-card .cw-mono b{ font-size:1.6rem; }
  .cw-card .cw-mono i{ font-size:.5rem; }
  .cw-card .cw-badge{ font-size:.7rem; width:1.5rem; max-width:1.5rem; top:.35rem; right:.35rem; }
  /* The strip is the wall on a phone, so the district has to travel with the
     card — it is the thing that says WHICH frame this is. Same plate, same
     brass fill, sized for a card instead of for a 4% mat opening. It does not
     take the --cw-lit ramp: the strip is detached into the rail, outside the
     transformed hotspot layer, and the rail is not part of the room's lighting. */
  .cw-carddistrict{
    align-self:flex-start;
    padding:.2em .5em .24em;
    border-radius:var(--cw-r-xs);
    background:linear-gradient(177deg, var(--cw-plaque-hi), var(--cw-plaque-lo));
    box-shadow:inset 0 0 0 1px color-mix(in oklab, var(--cw-accent) 42%, transparent);
    color:var(--cw-plaque-ink);
    font-size:.58rem; font-weight:700; line-height:1.1;
    letter-spacing:.11em; text-transform:uppercase;
    text-shadow:0 1px 0 rgb(3 5 9 / .8);
  }
  .cw-cardname{
    font-family:var(--cw-serif); font-size:1rem; line-height:1.15; font-weight:600;
  }
  .cw-cardrole{
    font-size:.72rem; line-height:1.3; color:var(--cw-dim);
  }
}

/* =========================================================================
   B2. THE PHONE · the strip as a snapping carousel that says it is one
   =========================================================================
   THE CONDITION IS THE PHONE AND ONLY THE PHONE — the 560px line theme.css
   §17 calls "a hand, not a tablet", plus the same short-landscape clause
   screens.js's PHONE_MEDIA uses, because a phone on its side is 852x393 and
   is not caught by a width test. Measured there before this block reached it:
   the strip was 331.1px tall in a 393px-tall viewport, so it ran off the
   bottom of the screen AND left the Break Room's tool drawer at NINE PIXELS,
   exactly as in portrait.

   An iPad in portrait matches NARROW_MEDIA above and is deliberately NOT
   touched here: its column is 748px wide, nothing shears at the frame edge,
   and it is a signed-off composition. (The row IS still ragged there and the
   sixth card is still past the edge — the same two faults, at a width this
   pass was told to leave pixel-identical. Widening this query to NARROW_MEDIA
   is the whole change if that is ever wanted.)

   WHAT THE CLIENT PHOTOGRAPHED, and what is left of it after the strip has
   been pinned to its column above: the row was RAGGED, so even the part on
   screen read as broken. Card widths ran 67.5 / 80.1 / 97 / 77.1 / 73.1 /
   98.4px and card heights 213.2 / 228.9 / 240 / 240.2 / 250.1 / 271.6px,
   because every box was sized by its own text — "Iron Mike" took two lines
   where "Alexis Bell" took one, and "North Side" wrapped its brass plate to
   two lines where "Big South" kept one. Every card is now the same width and
   the same height BY CONSTRUCTION: a fixed inline size, and a three-row grid
   with all three rows given explicit heights, so no card can wrap to a
   different height from its neighbours whatever its data says.

   AND THE OVERFLOW IS NOW DELIBERATE. Six chefs will not fit any phone; what
   was missing was any sign that there were more. The card width is solved so
   two cards land whole and the third is visibly bitten into — 21.6px of it at
   393, 15.8 at 375, 29.7 at 430 — under a fade that runs out at the frame
   edge, with mandatory x-snap so a flick lands on a card and never between
   two. That is the affordance theme.css §12's repo list already uses: the
   content is self-evidently cut off, rather than a chrome element that can be
   missed. iOS draws no resting scrollbar, so it could not have been one.

   THE HEIGHT IS THE OTHER HALF, and it is the one theme.css §17 asked for by
   name ("fixing it means capping the STRIP, not the drawer"). The strip was
   299.6px tall in a ~330px content box, so the Break Room's minmax(0, 1fr)
   tool drawer collapsed to NINE PIXELS and all six of that room's tools were
   unreachable on a phone. A card is 88.4px now and the strip 116.4px.

   backdrop-filter is dropped, matching the phone-memory pass: theme.css §06e
   drops it across the phone band and six blurred cards is six more surfaces
   the compositor has to re-read the backdrop for.

   ⚠ THE QUERY IS NARROW_MEDIA, NOT THE PHONE BAND, AND THAT IS DELIBERATE.
   It was first written as the phone band because the pass that added it had to
   keep iPad pixel-identical for an A/B. But the wall is suppressed and this
   strip is what carries the chefs at EVERY width §17 takes over, and both
   faults above were measured on iPad portrait too: at 820x1180 cards 5 and 6
   ran past the strip's right edge and the Break Room's drawer was ~47px. The
   A/B constraint was about not REGRESSING iPad, and iPads are this site's
   primary device — leaving a ragged, overflowing row there to protect a
   screenshot comparison would have been the tail wagging the dog. Matches
   NARROW_MEDIA in screens.js and §17's takeover exactly, so the strip is
   styled wherever it is the presentation.
   ====================================================================== */
@media (max-width: 900px), (max-aspect-ratio: 8 / 7) {
  .cw-strip{
    scroll-padding-inline-start:1rem;
    overflow-y:hidden;
    /* the cut edge, made legible */
    -webkit-mask:linear-gradient(90deg, #000 0, #000 calc(100% - 2.25rem), transparent 100%);
            mask:linear-gradient(90deg, #000 0, #000 calc(100% - 2.25rem), transparent 100%);
  }
  .cw-strip > li{ display:flex; flex:0 0 auto; }
  .cw-card{
    /* two whole cards and a bitten third, at every phone width */
    flex:0 0 clamp(8.5rem, 36vw, 10.5rem);
    inline-size:clamp(8.5rem, 36vw, 10.5rem);
    /* art | district
       art | name      — three rows, all three given a height, so the row can
       art | role        not go ragged on a long name or a wrapped plate. */
    display:grid;
    grid-template-columns:2.75rem minmax(0, 1fr);
    grid-template-rows:1.05rem 2.3rem 1.05rem;
    column-gap:.5rem; row-gap:0;
    align-content:start;
    gap:0 .5rem;
    padding:.5rem;
    -webkit-backdrop-filter:none; backdrop-filter:none;
  }
  .cw-card .cw-cardart{
    grid-column:1; grid-row:1 / -1;
    inline-size:2.75rem; width:2.75rem; block-size:auto; align-self:stretch;
    aspect-ratio:auto;
  }
  .cw-card .cw-mono b{ font-size:1.05rem; }
  .cw-card .cw-mono i{ font-size:.4rem; }
  .cw-card .cw-badge{ font-size:.45rem; width:.9rem; max-width:.9rem; top:.2rem; right:.2rem; }
  /* ONE LINE, ALWAYS: "North Side" used to wrap where "Big South" did not, and
     a two-line plate is what made three of the six cards taller than the rest. */
  .cw-carddistrict{
    grid-column:2; grid-row:1;
    justify-self:start; align-self:center;
    max-inline-size:100%;
    padding:.16em .45em .2em;
    font-size:.52rem; letter-spacing:.08em;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .cw-cardname{
    grid-column:2; grid-row:2;
    align-self:center;
    font-size:.82rem; line-height:1.15;
    /* exactly two lines of box, whatever the name does inside it */
    display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;
    overflow:hidden;
  }
  .cw-cardrole{
    grid-column:2; grid-row:3;
    align-self:center;
    font-size:.62rem; line-height:1.1;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
}

/* =========================================================================
   C. MODAL — full slide write-up
   ====================================================================== */
.ccc-chefmodal{
  position:fixed; inset:0; z-index:9000;
  display:none;
  font-family:var(--cw-sans);
}
.ccc-chefmodal[data-open="true"]{ display:block; }

.cw-backdrop{
  position:absolute; inset:0;
  /* Matches the freezer keypad's scrim, the site's best modal. Deliberately
     NOT near-opaque: this is a dialog ABOUT the wall of fame, so the break-room
     set stays legible behind it instead of disappearing. */
  background:rgb(var(--cw-shade) / .84);   /* v29: no blur — the room behind still animates */
  opacity:0;
  transition:opacity 260ms var(--cw-ease);
}
.ccc-chefmodal[data-shown="true"] .cw-backdrop{ opacity:1; }

.cw-dialog{
  position:absolute; inset:0;
  display:flex; align-items:center; justify-content:center;
  padding:clamp(.75rem, 3vw, 2.5rem);
  pointer-events:none;               /* the panel re-enables it */
}
/* The panel is a piece of the room: the same surface, the same brass hairline
   and the same 6px break as every other panel on the site. It was a cream card
   on a near-black page — the one light object anywhere — with a 12px corner. */
.cw-panel{
  pointer-events:auto;
  position:relative;
  width:min(46rem, 100%);
  max-height:min(88svh, 54rem);
  overflow:auto; overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
  background:var(--cw-surface);
  color:var(--cw-fg);
  border-radius:var(--cw-r-md);
  box-shadow:var(--cw-shadow-3), inset 0 0 0 1px var(--cw-line);
  opacity:0; transform:translate(0,10px) scale(.985);
  transition:opacity 260ms var(--cw-ease), transform 260ms var(--cw-ease);
}
.ccc-chefmodal[data-shown="true"] .cw-panel{
  opacity:1; transform:translate(0,0) scale(1);
}

/* Hardware, not a marshmallow: 40x40 at --r-sm with a brass hairline and a
   brass glyph. The ::after pushes the HIT area out to 44px in every direction
   so the target still clears the touch floor while the visible key stays 40. */
.cw-close{
  position:absolute; top:.6rem; right:.6rem;
  width:40px; height:40px;
  display:grid; place-items:center;
  border:0; border-radius:var(--cw-r-sm);
  background:rgb(var(--cw-shade) / .45);
  box-shadow:inset 0 0 0 1px var(--cw-line);
  color:var(--cw-accent);
  cursor:pointer; font-size:1rem; line-height:1;
  -webkit-appearance:none; appearance:none;
  transition:background 180ms var(--cw-ease), color 180ms var(--cw-ease),
             box-shadow 180ms var(--cw-ease);
  z-index:2;
}
.cw-close::after{
  content:""; position:absolute; inset:-2px;   /* 44x44 hit area */
}
.cw-close:hover{
  background:color-mix(in oklab, var(--cw-accent) 16%, transparent);
  color:var(--cw-accent-lit);
  box-shadow:inset 0 0 0 1px color-mix(in oklab, var(--cw-accent) 62%, transparent);
}
.cw-close:focus-visible{ outline:2px solid var(--cw-focus); outline-offset:2px; }

/* ---- header -------------------------------------------------------------
   One column with the portrait floated left, so the text wraps around and
   under it. The old two-column grid left column 2 empty on short records —
   ~330x220px of void on the Linda Weeks card. A float cannot produce that. */
.cw-head{
  padding:clamp(1.1rem,3vw,1.8rem);
  padding-right:3.8rem;
  border-bottom:1px solid var(--cw-line);
}
.cw-head::after{ content:""; display:table; clear:both; }
.cw-portrait{
  float:left;
  width:clamp(7rem, 22%, 9rem);
  margin:.15rem clamp(1rem,3vw,1.4rem) .6rem 0;
  aspect-ratio:4/5;
  position:relative;
  border-radius:var(--cw-r-xs); overflow:hidden;
  background:var(--cw-walnut);
  box-shadow:
    0 .5rem 1.4rem rgb(var(--cw-shade) / .5),
    inset 0 0 0 1px var(--cw-line);
}
/* No object-fit here on purpose — .cw-photo img owns it for all three surfaces. */
.cw-portrait .cw-mono b{ font-size:2.4rem; }
.cw-portrait .cw-mono i{ font-size:.55rem; }

/* 46ch measure on the identity block, so a long store/role line breaks at a
   readable width instead of running the full 46rem panel. */
.cw-id{ max-width:46ch; }

.cw-eyebrow{
  margin:0 0 .5rem;
  font-size:.68rem; font-weight:700;
  letter-spacing:.19em; text-transform:uppercase;
  color:var(--cw-dim);
  display:flex; align-items:center; gap:.4rem;
}
.cw-eyebrow[data-xfinity="true"]{ color:var(--cw-accent-lit); }
/* The district, first thing in the header, on the same engraved plate as the
   plaque under the frame — so the modal opens on the object you clicked rather
   than on a generic card. The award name stays beside it, dimmed. */
.cw-eyebrow-d{
  padding:.24em .52em .28em;
  border-radius:var(--cw-r-xs);
  background:linear-gradient(177deg, var(--cw-plaque-hi), var(--cw-plaque-lo));
  box-shadow:inset 0 0 0 1px color-mix(in oklab, var(--cw-accent) 42%, transparent);
  color:var(--cw-plaque-ink);
  letter-spacing:.13em;
  text-shadow:0 1px 0 rgb(3 5 9 / .8);
}
/* Long district names ("Xfinity Head Chef of the Week") must not push the
   award clause off the panel on a narrow phone. */
.cw-eyebrow{ flex-wrap:wrap; row-gap:.35rem; }
.cw-name{
  margin:0 0 .35rem;
  font-family:var(--cw-serif);
  font-size:clamp(1.5rem, 4.2vw, 2.1rem);
  line-height:1.06; font-weight:600; letter-spacing:-.01em;
  color:var(--cw-fg);
}
.cw-role{
  margin:0; font-size:.9rem; line-height:1.4; color:var(--cw-fg-muted);
}

/* ---- stats --------------------------------------------------------------
   A real grid, not a wrapping flex row. Hammond has eight figures: as flex
   they wrapped 6+2 and the dividers desynced — a rule between every pair on
   row 1, then one stray rule and a 340px gap on row 2. A fixed 4-up grid means
   row 2 lands under row 1 and the "no rule on the first cell of a row" test is
   simply :nth-child(4n+1). (auto-fit was the brief, but its resolved column
   count drifts with panel width and would desync from 4n+1 all over again —
   the fixed track count is what actually makes the dividers correct.) */
.cw-stats{
  display:grid;
  grid-template-columns:repeat(2, minmax(0,1fr));
  row-gap:1rem;
  margin:0; padding:clamp(.95rem,2.4vw,1.2rem) clamp(1.1rem,3vw,1.8rem);
  border-bottom:1px solid var(--cw-line);
  background:rgb(var(--cw-shade) / .32);
}
.cw-stat{
  min-width:0;
  padding:0 .85rem;
  display:flex; flex-direction:column-reverse;   /* value paints above label */
  border-inline-start:1px solid var(--cw-line);
}
.cw-stat:nth-child(2n+1){ border-inline-start:0; padding-inline-start:0; }
@media (min-width:34rem){
  .cw-stats{ grid-template-columns:repeat(4, minmax(0,1fr)); }
  .cw-stat:nth-child(2n+1){ border-inline-start:1px solid var(--cw-line); padding-inline-start:.85rem; }
  .cw-stat:nth-child(4n+1){ border-inline-start:0; padding-inline-start:0; }
}
.cw-stat dd{ margin:0; }
.cw-statv{
  display:block;
  font-family:var(--cw-serif);
  font-size:clamp(1.05rem,2.8vw,1.35rem);
  line-height:1.1; font-weight:600;
  font-variant-numeric:tabular-nums;
  white-space:nowrap;
  color:var(--cw-accent-lit);        /* brass earns its keep beyond the dots */
}
.cw-statl{
  display:block; margin-top:.18rem;
  font-size:.63rem; letter-spacing:.13em; text-transform:uppercase;
  color:var(--cw-dim);
}

.cw-body{
  padding:clamp(1.1rem,3vw,1.8rem);
  max-width:68ch;                    /* a measure, not the full panel */
  color:var(--cw-fg-muted);
}
.cw-body p{ margin:0 0 .85rem; font-size:.98rem; line-height:1.62; }
.cw-body p:last-child{ margin-bottom:0; }
.cw-body ul{ margin:0; padding:0; list-style:none; }
.cw-body li{
  position:relative;
  margin:0 0 .6rem; padding-left:1.15rem;
  font-size:.98rem; line-height:1.55;
}
.cw-body li:last-child{ margin-bottom:0; }
.cw-body li::before{
  content:""; position:absolute; left:.15rem; top:.62em;
  width:.34rem; height:.34rem; border-radius:50%;
  background:var(--cw-accent);
}

@media (max-width:32rem){
  .cw-portrait{ float:none; width:8rem; margin:0 0 1rem; }
}

/* screen-reader-only text */
.cw-sr{
  position:absolute!important; width:1px; height:1px;
  padding:0; margin:-1px; overflow:hidden;
  clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; border:0;
}

/* =========================================================================
   D. REDUCED MOTION — SPEC.md: snap, do not animate.
   ====================================================================== */
@media (prefers-reduced-motion:reduce){
  .ccc-chefwall *, .ccc-chefmodal *{
    transition-duration:1ms!important;
    animation-duration:1ms!important;
  }
  .cw-frame:hover .cw-lift,
  .cw-frame:focus-visible .cw-lift{ transform:none; will-change:auto; }
  .cw-frame:hover .cw-sweep,
  .cw-frame:focus-visible .cw-sweep{ transform:rotate(28deg); }
  .cw-panel{ transform:none; }
}
`;



function ensureStyles(doc) {
  try {
    if (doc.getElementById(STYLE_ID)) return;
    const el = doc.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    doc.head.appendChild(el);
  } catch (_) {   }
}




 
function squish(s) {
  return String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim();
}



export function normaliseWriteup(raw, chefName) {
  const name = squish(chefName).toLowerCase();

  
  let lines = String(raw == null ? '' : raw)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(squish)
    .filter(Boolean);

  
  const hadBullets = lines.some((l) => BULLET_RE.test(l));

  
  lines = lines.map((l) => squish(l.replace(BULLET_RE, '')));

  
  
  if (lines.length > 1 && lines[0].toLowerCase() === name) lines.shift();

  
  lines = lines.filter(Boolean);
  if (!lines.length) return { kind: 'paras', items: [] };

  
  
  
  
  
  const shortish = lines.every((l) => l.length <= 140);
  const kind = (hadBullets || (lines.length >= 2 && shortish)) ? 'list' : 'paras';

  
  
  const items = lines.map((l) => (kind === 'list' ? l.replace(/^([a-z])/, (m) => m.toUpperCase()) : l));

  return { kind, items };
}



export function initialsFor(name) {
  const parts = squish(name).split(' ').filter(Boolean);
  if (!parts.length) return '•';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

 
function roleSegments(storeRole) {
  return squish(storeRole).split(/\s*[•|]\s*/).filter(Boolean);
}



function districtOf(chef) {
  return squish(chef && (chef.district || chef.region_deck));
}



function districtShort(chef) {
  return squish(chef && (chef.district_short || chef.district || chef.region_deck));
}



function accessibleName(chef) {
  const award = chef.is_xfinity ? 'Xfinity Head Chef of the Week' : 'Head Chef of the Week';
  const segs = roleSegments(chef.store_role);
  const place = chef.is_xfinity ? segs[segs.length - 1] : segs[0];
  const who = squish(chef.name) || 'Head Chef';
  const district = districtOf(chef);
  
  const lead = district && district.toLowerCase() !== award.toLowerCase()
    ? `${district}, ${award}` : award;
  const base = place ? `${lead}: ${who}, ${place}` : `${lead}: ${who}`;
  
  
  const held = heldInfo(chef);
  return held ? `${base}. ${held.line}.` : base;
}



function hasChef(chef) {
  return !!(chef && !chef.vacant && squish(chef.name));
}



function photoStamp(chef) {
  if (!chef) return '';
  const sha = chef.photo_sha;
  if (typeof sha === 'string' && sha.length >= 8) return sha.slice(0, 12);
  const when = chef.last_changed || chef.last_confirmed;
  if (when) {
    const t = Date.parse(when);
    if (Number.isFinite(t)) return String(Math.floor(t / 1000));
  }
  return '';
}

function photoUrl(chef, base) {
  const f = chef && chef.photo_file;
  if (!f) return null;
  const stamp = photoStamp(chef);
  const q = stamp ? (f.indexOf('?') === -1 ? `?v=${stamp}` : `&v=${stamp}`) : '';
  if (/^([a-z]+:)?\/\//i.test(f) || f.charAt(0) === '/' || f.startsWith('data:')) {
    return f.startsWith('data:') ? f : f + q;
  }
  const b = base == null ? '' : String(base);
  return (b && !b.endsWith('/') ? `${b}/${f}` : `${b}${f}`) + q;
}




function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

 
function starSvg(doc) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M12 2.6l2.7 5.9 6.4.7-4.8 4.4 1.3 6.3L12 16.7 6.4 19.9l1.3-6.3L2.9 9.2l6.4-.7z');
  svg.appendChild(path);
  return svg;
}



function buildSurface(doc, chef, base, monoCaption) {
  const wrap = el(doc, 'span', 'cw-photo');

  
  if (chef.photo_focus) wrap.style.setProperty('--cw-focus-pos', String(chef.photo_focus));

  const src = chef.has_photo === false ? null : photoUrl(chef, base);

  
  
  if (!src) {
    wrap.className = 'cw-photo cw-blank';
    return wrap;
  }

  const img = doc.createElement('img');
  img.alt = '';                       
  img.decoding = 'async';
  img.loading = 'lazy';               
  img.draggable = false;
  

  if (chef.photo_w && chef.photo_h) {
    img.width = Number(chef.photo_w) || 0;
    img.height = Number(chef.photo_h) || 0;
  }
  
  
  
  
  img.addEventListener('error', function onErr() {
    img.removeEventListener('error', onErr);
    try {
      wrap.replaceChildren(buildMonogram(doc, chef, monoCaption));
    } catch (_) {
      
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
      wrap.appendChild(buildMonogram(doc, chef, monoCaption));
    }
  }, { once: true });
  img.src = src;
  wrap.appendChild(img);
  
  
  
  const grade = el(doc, 'span', 'cw-grade');
  grade.setAttribute('aria-hidden', 'true');
  wrap.appendChild(grade);
  return wrap;
}

 
function buildMonogram(doc, chef, caption) {
  const mono = el(doc, 'span', 'cw-mono');
  mono.setAttribute('aria-hidden', 'true');   
  mono.appendChild(el(doc, 'b', null, initialsFor(chef.name)));
  if (caption !== false) {
    const segs = roleSegments(chef.store_role);
    mono.appendChild(el(doc, 'i', null, segs[0] || 'Head Chef'));
  }
  return mono;
}



function buildPlate(doc, chef) {
  const text = districtShort(chef);
  if (!text) return null;
  const plate = el(doc, 'span', 'cw-plate', text);
  plate.setAttribute('aria-hidden', 'true');
  return plate;
}

 



const HELD_SHOW_DAYS = 7;

 
function heldDays(chef) {
  const iso = chef && (chef.last_confirmed || chef.last_changed);
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isFinite(t)) return Math.max(0, (Date.now() - t) / 86400000);
  const baked = chef && Number(chef.days_since_confirmed);
  return Number.isFinite(baked) ? baked : null;
}

 
function heldDate(chef) {
  const iso = chef && (chef.last_confirmed || chef.last_changed);
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  try {
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (_) { return ''; }
}



function heldInfo(chef) {
  if (!hasChef(chef)) return null;
  const days = heldDays(chef);
  const stale = chef && chef.stale === true;
  
  
  if (!stale && (days === null || days < HELD_SHOW_DAYS)) return null;
  const date = heldDate(chef);
  const whole = days === null ? null : Math.round(days);
  const line = date
    ? (stale ? `Confirmed ${date} — no longer on the deck` : `Confirmed ${date}`)
    : (whole !== null ? `Held ${whole} days` : 'Held from an earlier run');
  return { days: days === null ? 0 : days, stale: !!stale, date, line };
}

function buildBadge(doc, chef) {
  if (!chef.is_xfinity) return null;
  const b = el(doc, 'span', 'cw-badge');
  b.appendChild(starSvg(doc));
  return b;
}




function createScrollLock(win) {
  const doc = win.document;
  let locked = false;
  let saved = null;

  return {
    lock() {
      if (locked) return;
      locked = true;
      const body = doc.body;
      const root = doc.documentElement;
      const y = win.scrollY || root.scrollTop || 0;
      saved = {
        y,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
        rootBehavior: root.style.scrollBehavior
      };
      body.style.position = 'fixed';
      body.style.top = `-${y}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    },
    unlock() {
      if (!locked || !saved) return;
      locked = false;
      const body = doc.body;
      body.style.position = saved.position;
      body.style.top = saved.top;
      body.style.left = saved.left;
      body.style.right = saved.right;
      body.style.width = saved.width;
      body.style.overflow = saved.overflow;
      
      
      
      try { win.scrollTo({ top: saved.y, left: 0, behavior: 'instant' }); }
      catch (e) { win.scrollTo(0, saved.y); }
      saved = null;
    },
    get isLocked() { return locked; }
  };
}




const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function createModal(win, uid, photoBase) {
  const doc = win.document;
  const lock = createScrollLock(win);

  const rootEl = el(doc, 'div', 'ccc-chefmodal');
  rootEl.id = `cw-modal-${uid}`;
  rootEl.setAttribute('data-open', 'false');

  const backdrop = el(doc, 'div', 'cw-backdrop');
  backdrop.setAttribute('aria-hidden', 'true');

  const dialog = el(doc, 'div', 'cw-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', `cw-modal-title-${uid}`);
  dialog.setAttribute('tabindex', '-1');

  const panel = el(doc, 'div', 'cw-panel');

  const closeBtn = el(doc, 'button', 'cw-close');
  closeBtn.type = 'button';
  closeBtn.innerHTML = '<span aria-hidden="true">✕</span>';
  closeBtn.appendChild(el(doc, 'span', 'cw-sr', 'Close'));

  const content = el(doc, 'div', 'cw-content');

  panel.appendChild(closeBtn);
  panel.appendChild(content);
  dialog.appendChild(panel);
  rootEl.appendChild(backdrop);
  rootEl.appendChild(dialog);

  let lastFocus = null;
  let open = false;
  let inerted = [];

  const supportsInert = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;

  

  function setOutsideInert(on) {
    if (!supportsInert) return;
    if (on) {
      inerted = [];
      Array.prototype.forEach.call(doc.body.children, (child) => {
        if (child === rootEl || child.inert) return;
        if (child.classList.contains('ccc-ov') || child.hasAttribute('data-ccc-keep-live')) return;
        child.inert = true;
        inerted.push(child);
      });
    } else {
      inerted.forEach((n) => { n.inert = false; });
      inerted = [];
    }
  }

  function focusables() {
    return Array.prototype.filter.call(
      panel.querySelectorAll(FOCUSABLE),
      (n) => n.offsetParent !== null || n === doc.activeElement
    );
  }

   
  function onKeydown(e) {
    if (!open) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      api.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) { e.preventDefault(); dialog.focus(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    const active = doc.activeElement;
    if (e.shiftKey) {
      if (active === first || active === dialog || !panel.contains(active)) {
        e.preventDefault(); last.focus();
      }
    } else if (active === last) {
      e.preventDefault(); first.focus();
    }
  }

   
  function onPointerDown(e) {
    if (!open) return;
    if (!panel.contains(e.target)) api.close();
  }

  closeBtn.addEventListener('click', () => api.close());
  rootEl.addEventListener('mousedown', onPointerDown);
  doc.addEventListener('keydown', onKeydown, true);
  
  
  const onViewerOpen = () => { if (open) api.close({ immediate: true }); };
  doc.addEventListener('ccc:viewer-open', onViewerOpen);

   
  function render(chef) {
    const frag = doc.createDocumentFragment();

     
    const head = el(doc, 'div', 'cw-head');

    const portrait = el(doc, 'div', 'cw-portrait');
    
    
    portrait.appendChild(buildSurface(doc, chef, photoBase, true));
    if (chef.photo_focus) portrait.style.setProperty('--cw-focus-pos', String(chef.photo_focus));

    const idBox = el(doc, 'div', 'cw-id');

    

    const eyebrow = el(doc, 'p', 'cw-eyebrow');
    eyebrow.setAttribute('data-xfinity', chef.is_xfinity ? 'true' : 'false');
    if (chef.is_xfinity) {
      const s = starSvg(doc);
      s.setAttribute('width', '12'); s.setAttribute('height', '12');
      eyebrow.appendChild(s);
    }
    const award = chef.is_xfinity ? 'Xfinity Head Chef of the Week' : 'Head Chef of the Week';
    const district = districtOf(chef);
    if (district) eyebrow.appendChild(el(doc, 'span', 'cw-eyebrow-d', district));
    if (!district || district.toLowerCase() !== award.toLowerCase()) {
      eyebrow.appendChild(doc.createTextNode(award));
    }

    const h2 = el(doc, 'h2', 'cw-name', squish(chef.name) || 'Head Chef');
    h2.id = `cw-modal-title-${uid}`;

    const role = el(doc, 'p', 'cw-role', roleSegments(chef.store_role).join(' • '));

    idBox.appendChild(eyebrow);
    idBox.appendChild(h2);
    if (role.textContent) idBox.appendChild(role);

    

    const held = heldInfo(chef);
    if (held) {
      const p = el(doc, 'p', 'cw-held' + (held.stale ? ' is-stale' : ''), held.line);
      idBox.appendChild(p);
    }

    head.appendChild(portrait);
    head.appendChild(idBox);
    frag.appendChild(head);

    

    const stats = Array.isArray(chef.stats) ? chef.stats.filter((s) => s && (s.value || s.label)) : [];
    if (stats.length) {
      const dl = el(doc, 'dl', 'cw-stats');
      stats.forEach((s) => {
        const cell = el(doc, 'div', 'cw-stat');
        const dt = el(doc, 'dt', 'cw-statl', squish(s.label));
        const dd = el(doc, 'dd', 'cw-statv', squish(s.value));
        
        
        cell.appendChild(dt);
        cell.appendChild(dd);
        dl.appendChild(cell);
      });
      frag.appendChild(dl);
    }

     
    const body = el(doc, 'div', 'cw-body');
    const { kind, items } = normaliseWriteup(chef.writeup, chef.name);
    if (items.length) {
      if (kind === 'list') {
        const ul = el(doc, 'ul');
        items.forEach((t) => ul.appendChild(el(doc, 'li', null, t)));
        body.appendChild(ul);
      } else {
        items.forEach((t) => body.appendChild(el(doc, 'p', null, t)));
      }
    } else {
      body.appendChild(el(doc, 'p', null, 'Write-up coming from the deck.'));
    }
    frag.appendChild(body);

    content.replaceChildren(frag);
  }

  const api = {
    el: rootEl,
    get isOpen() { return open; },

    show(chef, returnFocusTo) {
      if (open) return;
      try { render(chef); } catch (_) {   }
      lastFocus = returnFocusTo || doc.activeElement;
      open = true;
      lock.lock();
      rootEl.setAttribute('data-open', 'true');
      setOutsideInert(true);
      
      win.requestAnimationFrame(() => {
        rootEl.setAttribute('data-shown', 'true');
        panel.scrollTop = 0;
        
        dialog.focus({ preventScroll: true });
      });
    },

    close(opts) {
      if (!open) return;
      open = false;
      rootEl.setAttribute('data-shown', 'false');
      setOutsideInert(false);

      const finish = (restoreFocus) => {
        rootEl.setAttribute('data-open', 'false');
        lock.unlock();                       
        if (restoreFocus && lastFocus && doc.contains(lastFocus)) {
          try { lastFocus.focus({ preventScroll: true }); } catch (_) {}
        }
        lastFocus = null;
      };

      
      
      
      if (opts && opts.immediate) { finish(false); return; }

      
      let done = false;
      const once = () => { if (done) return; done = true; finish(true); };
      panel.addEventListener('transitionend', once, { once: true });
      win.setTimeout(once, 320);
    },

    destroy() {
      doc.removeEventListener('keydown', onKeydown, true);
      doc.removeEventListener('ccc:viewer-open', onViewerOpen);
      rootEl.removeEventListener('mousedown', onPointerDown);
      setOutsideInert(false);
      lock.unlock();
      if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
    }
  };

  return api;
}






export function initChefWall(opts) {
  const o = opts || {};
  const win = o.window || (typeof window !== 'undefined' ? window : null);
  const doc = o.document || (win && win.document) || null;

  
  const noop = {
    root: null, buttons: [],
    open() {}, close() {}, update() {}, destroy() {}
  };
  if (!doc || !win) return noop;

  const host = typeof o.host === 'string' ? doc.querySelector(o.host) : o.host;
  if (!host || !host.appendChild) {
    if (win.console) win.console.warn('[chefwall] host element not found; wall not mounted.');
    return noop;
  }

  ensureStyles(doc);

  const uid = ++instanceSeq;
  const photoBase = o.photoBase == null ? 'headchefs/' : o.photoBase;

  let chefs = [];
  let frames = [];
  let buttons = [];

  const root = el(doc, 'div', 'ccc-chefwall');
  root.setAttribute('data-chefwall', String(uid));

  const wall = el(doc, 'div', 'cw-wall');   
  const strip = el(doc, 'ul', 'cw-strip');  
  strip.setAttribute('role', 'list');

  root.appendChild(wall);
  host.appendChild(root);

  
  
  
  
  const stripHost = typeof o.stripHost === 'string' ? doc.querySelector(o.stripHost) : o.stripHost;
  let detachedRoot = null;
  let warnedAboutStripHost = false;

   
  function detachStripTo(target) {
    detachedRoot = el(doc, 'div', 'ccc-chefwall cw-detached');
    detachedRoot.appendChild(strip);          
    target.appendChild(detachedRoot);
  }

  if (stripHost && stripHost.appendChild && stripHost !== host) {
    detachStripTo(stripHost);
  } else {
    root.appendChild(strip);
  }

  

  const narrowMQ = typeof win.matchMedia === 'function' ? win.matchMedia(NARROW_MEDIA) : null;

  function hostIsHidden() {
    try { return win.getComputedStyle(host).display === 'none'; } catch (_) { return false; }
  }

  function ensureStripMount() {
    if (detachedRoot) return;                 
    if (!narrowMQ || !narrowMQ.matches) return;
    if (!hostIsHidden()) return;
    const stage = host.parentElement;
    const target = (stage && stage.querySelector('.rail')) || stage || host.parentNode;
    if (!target || target === host || host.contains(target)) return;
    detachStripTo(target);
    if (!warnedAboutStripHost && win.console) {
      warnedAboutStripHost = true;
      win.console.warn(
        '[chefwall] host is display:none under ' + NARROW_MEDIA + ' (theme.css §16) ' +
        'so the card strip was relocated to keep it visible. Pass stripHost ' +
        '(e.g. the room .rail) at init to control where it lands.'
      );
    }
  }

  
  
  const onNarrowChange = () => ensureStripMount();
  if (narrowMQ) {
    if (narrowMQ.addEventListener) narrowMQ.addEventListener('change', onNarrowChange);
    else if (narrowMQ.addListener) narrowMQ.addListener(onNarrowChange);
  }
  ensureStripMount();

  const modal = createModal(win, uid, photoBase);
  doc.body.appendChild(modal.el);

   
  function placeFrame(node, box) {
    node.style.left = `${box.x}%`;
    node.style.top = `${box.y}%`;
    node.style.width = `${box.w}%`;
    node.style.height = `${box.h}%`;
    if (box.rotate) node.style.transform = `rotate(${box.rotate}deg)`;
  }

  

  function buildVacantFrame(box, i, chef) {
    const slot = el(doc, 'span', 'cw-frame cw-frame--vacant');
    slot.setAttribute('aria-hidden', 'true');
    slot.dataset.chefIndex = String(i);
    placeFrame(slot, box);

    const lift = el(doc, 'span', 'cw-lift');
    const mat = el(doc, 'span', 'cw-mat');
    mat.appendChild(el(doc, 'span', 'cw-photo cw-blank'));
    mat.appendChild(el(doc, 'span', 'cw-inset'));
    lift.appendChild(mat);

    const glass = el(doc, 'span', 'cw-glass');
    glass.appendChild(el(doc, 'span', 'cw-sweep'));
    lift.appendChild(glass);

    slot.appendChild(lift);

    

    const plate = buildPlate(doc, chef);
    if (plate) slot.appendChild(plate);
    return slot;
  }

   
  function buildFrame(chef, box, i) {
    const btn = el(doc, 'button', 'cw-frame');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-label', accessibleName(chef));
    btn.dataset.chefIndex = String(i);

    
    placeFrame(btn, box);

    const cast = el(doc, 'span', 'cw-cast');
    cast.setAttribute('aria-hidden', 'true');

    const lift = el(doc, 'span', 'cw-lift');

    
    
    
    const mat = el(doc, 'span', 'cw-mat');
    mat.appendChild(buildSurface(doc, chef, photoBase, true));

    const inset = el(doc, 'span', 'cw-inset');
    inset.setAttribute('aria-hidden', 'true');
    mat.appendChild(inset);
    lift.appendChild(mat);

    const glass = el(doc, 'span', 'cw-glass');
    glass.setAttribute('aria-hidden', 'true');
    glass.appendChild(el(doc, 'span', 'cw-sweep'));
    lift.appendChild(glass);

    const badge = buildBadge(doc, chef);
    if (badge) { badge.setAttribute('aria-hidden', 'true'); lift.appendChild(badge); }

    
    
    const nametag = el(doc, 'span', 'cw-nametag', squish(chef.name));
    nametag.setAttribute('aria-hidden', 'true');
    lift.appendChild(nametag);

    
    
    const heldW = heldInfo(chef);
    if (heldW) {
      btn.classList.add('is-held');
      if (heldW.stale) btn.classList.add('is-stale');
      const tag = el(doc, 'span', 'cw-heldtag', heldW.date || 'held');
      tag.setAttribute('aria-hidden', 'true');   
      lift.appendChild(tag);
    }

    btn.appendChild(cast);
    btn.appendChild(lift);

    

    const plate = buildPlate(doc, chef);
    if (plate) btn.appendChild(plate);

    btn.addEventListener('click', () => modal.show(chef, btn));
    return btn;
  }

   
  function buildCard(chef, i) {
    const li = el(doc, 'li');
    const btn = el(doc, 'button', 'cw-card');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-label', accessibleName(chef));
    btn.dataset.chefIndex = String(i);

    const art = el(doc, 'span', 'cw-cardart');
    art.appendChild(buildSurface(doc, chef, photoBase, false));
    const badge = buildBadge(doc, chef);
    if (badge) { badge.setAttribute('aria-hidden', 'true'); art.appendChild(badge); }

    const heldC = heldInfo(chef);
    if (heldC) {
      btn.classList.add('is-held');
      if (heldC.stale) btn.classList.add('is-stale');
      const tag = el(doc, 'span', 'cw-heldtag', heldC.date || 'held');
      tag.setAttribute('aria-hidden', 'true');
      art.appendChild(tag);
    }

    const dist = el(doc, 'span', 'cw-carddistrict', districtShort(chef));
    const name = el(doc, 'span', 'cw-cardname', squish(chef.name));
    const role = el(doc, 'span', 'cw-cardrole', roleSegments(chef.store_role).join(' • '));
    
    
    dist.setAttribute('aria-hidden', 'true');
    name.setAttribute('aria-hidden', 'true');
    role.setAttribute('aria-hidden', 'true');

    btn.appendChild(art);
    if (dist.textContent) btn.appendChild(dist);
    btn.appendChild(name);
    if (role.textContent) btn.appendChild(role);
    btn.addEventListener('click', () => modal.show(chef, btn));

    li.appendChild(btn);
    return li;
  }

   
  

  function build(nextChefs, nextFrames) {
    chefs = (Array.isArray(nextChefs) ? nextChefs : []).filter(Boolean);
    frames = Array.isArray(nextFrames) && nextFrames.length ? nextFrames : DEFAULT_FRAMES;

    const slots = frames.length;

    
    
    
    
    if (chefs.length > slots && win.console) {
      win.console.warn(
        `[chefwall] ${chefs.length} districts in the data; the room has ${slots} painted ` +
        `frames. Dropping: ` +
        chefs.slice(slots).map((c) => districtShort(c) || squish(c && c.name) || '?').join(', ') +
        '. Add frames to rooms.js CHEF_FRAMES, or districts to headchefs.json.'
      );
    }

    const wallFrag = doc.createDocumentFragment();
    const stripFrag = doc.createDocumentFragment();
    
    
    buttons = [];

    for (let i = 0; i < slots; i++) {
      const chef = chefs[i];
      const raw = frames[i] || {};
      const box = {
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        w: Number(raw.w) || 0,
        h: Number(raw.h) || 0,
        rotate: Number(raw.rotate) || 0
      };

      
      
      
      
      if (!hasChef(chef)) {
        try { wallFrag.appendChild(buildVacantFrame(box, i, chef || {})); } catch (_) {}
        buttons[i] = null;
        continue;
      }

      try {
        const btn = buildFrame(chef, box, i);
        wallFrag.appendChild(btn);
        stripFrag.appendChild(buildCard(chef, i));
        buttons[i] = btn;
      } catch (err) {
        
        
        if (win.console) win.console.warn('[chefwall] slot', i, 'failed; left blank.', err);
        try { wallFrag.appendChild(buildVacantFrame(box, i, chef || {})); } catch (_) {}
        buttons[i] = null;
      }
    }

    wall.replaceChildren(wallFrag);
    strip.replaceChildren(stripFrag);
  }

  build(o.chefs, o.frames);

  

  if (o.refreshFrom && typeof win.fetch === 'function') {
    const signature = (list) => (Array.isArray(list) ? list : []).map((c) => [
      districtShort(c), squish(c && c.name), squish(c && c.store_role),
      squish(c && c.writeup), (c && c.photo_file) || '', photoStamp(c), !!(c && c.vacant)
    ].join('\u0001')).join('\u0002');

    win.fetch(o.refreshFrom, { cache: 'no-cache', credentials: 'omit' })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((docJson) => {
        const next = docJson && Array.isArray(docJson.headchefs) ? docJson.headchefs : null;
        if (!next || !next.length) return;
        if (signature(next) === signature(chefs)) return;   
        build(next, frames);
        if (win.console && win.console.info) {
          win.console.info('[chefwall] refreshed from ' + o.refreshFrom +
            ' (generated ' + (docJson.generated_at || 'unknown') + ').');
        }
      })
      .catch(() => {   });
  }

   
  return {
    root,

    

    get buttons() { return buttons.slice(); },

     
    get isNarrow() { return !!(narrowMQ && narrowMQ.matches); },

     
    open(i) {
      const chef = chefs[i];
      if (!hasChef(chef)) return;      
      modal.show(chef, buttons[i] || null);
    },

    close() { modal.close(); },

    

    update(next) {
      const n = next || {};
      build(n.chefs || chefs, n.frames || frames);
    },

    destroy() {
      if (narrowMQ) {
        if (narrowMQ.removeEventListener) narrowMQ.removeEventListener('change', onNarrowChange);
        else if (narrowMQ.removeListener) narrowMQ.removeListener(onNarrowChange);
      }
      modal.destroy();
      if (root.parentNode) root.parentNode.removeChild(root);
      if (detachedRoot && detachedRoot.parentNode) detachedRoot.parentNode.removeChild(detachedRoot);
      buttons = [];
      chefs = [];
    }
  };
}

export default initChefWall;
