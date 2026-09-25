/* =============================================================================
 * Cook County Cooks — v4 "Alive"
 * assets/freezer.js  ·  THE WALK-IN DOOR
 * -----------------------------------------------------------------------------
 * The client's centrepiece, in his words:
 *
 *   "I want to actually see a freezer door that is CLOSED. When someone types in
 *    the password, it will open the freezer door to this screen … animations and
 *    even a sound effect … like a deep freezer opening with a whoosh of cold air
 *    blowing out on the person opening it."
 *   "Just one sound when you open the freezer doors, nothing when you go inside."
 *
 * WHAT THIS MODULE IS
 *   Presentation only. It replaces what the locked freezer LOOKS like. It does
 *   not authenticate anything and it must never be allowed to.
 *
 * WHAT THIS MODULE IS NOT — read before editing
 *   · It does not own the gate. `isFreezerUnlocked()`, the `c3f-unlocked`
 *     sessionStorage key, the `c3f` cookie, the POST to /api/freezer-unlock and
 *     the canOpen / onRefused predicate wired into initOverlay all stay in
 *     app.js §2, untouched. This file READS unlock state and never writes it.
 *   · A deep link to a freezer tool while locked still refuses, because that
 *     refusal happens inside overlay.js's openTool() and this module is not on
 *     that path at all.
 *   · The door is a set piece in front of the room, not the way into it. While
 *     the gate is shut all three surfaces — the room's rail, the C³ menu and
 *     the footer index — show the same locked row, and every one of them opens
 *     the same keypad without going near this module; the moment the gate is
 *     open all three list the fourteen. If freezer.js never loads — no art, a
 *     404, a thrown error — nothing about that changes.
 *   · It never writes --p, --plate-scale, --plate-x, --plate-y, --enter or
 *     --bloom. It READS them (SPEC.md §"CSS custom properties") so the door
 *     rides the engine's existing dolly and parallax. There is no second rAF
 *     loop in here and no rAF loop at all: the whole sequence is CSS animation.
 *
 * GEOMETRY
 *   Every position comes from FREEZER_DOOR in rooms.js, in plate percent. There
 *   is not one pixel coordinate in this file. Re-measure the art, edit rooms.js,
 *   done.
 *
 * PERFORMANCE
 *   Only transform and opacity animate. No animated blur, no blend modes, no
 *   filters on the moving layers — the same rules theme.css §06 arrived at the
 *   hard way. `will-change` is applied at the first frame of the sequence and
 *   cleared at the last, never at rest. The whole assembly is torn out of the
 *   DOM once the door is open, so an unlocked page pays nothing.
 *
 * REDUCED MOTION
 *   Under `prefers-reduced-motion: reduce` the door is simply open: no latch, no
 *   swing, no vapour, no light change, and no sound — not a quieter sound, none.
 *   Honoured live, not just at load.
 *
 * Plain ES module. No build step, no npm, no framework, no external JS.
 * ========================================================================== */


/* ─────────────────────────────────────────────────────────────────────────────
 * 0 · THE TIMELINE
 *
 * A heavy insulated door does not slide open on a linear ease, and the beats it
 * is made of are not decoration — they are the reason it reads as mass instead
 * of as a CSS transition. In order:
 *
 *   LATCH    the bolt lets go. The slab strikes the frame, rocks, and pulls out
 *            of the gasket along Z before it rotates at all. Nothing swings yet.
 *   SWING    1.6s of rotateY on a hand-authored mass curve: almost nothing for
 *            the first sixth (inertia), then it gets away from you, then the arm
 *            arrests it with a few degrees of overtravel and a settle.
 *   APERTURE the doorway behind the leaf fades up as the leaf clears it, with
 *            the interior easing out of a slight over-scale — depth, not a hole.
 *   VAPOUR   cold air falls out of the opening and rolls along the floor. Five
 *            puffs, staggered, each on its own drift.
 *   LIGHT    blue-white spills into the warm kitchen and cools it, peaks as the
 *            door reaches full travel, then settles.
 *   THROUGH  the whole assembly scales up past the camera and dissolves — you
 *            walk through the doorway into the room plate underneath.
 *   BLAST    one last surge of cold air that fills the frame and passes you.
 *            This is the "blowing out on the person opening it" beat.
 *
 * The numbers below are the envelope. The SHAPE inside each phase is authored in
 * the @keyframes — percentages there, milliseconds here.
 * ────────────────────────────────────────────────────────────────────────── */

const T = {
  latch:      380,        // 0 → 380      bolt, strike, seal peel, Z pull-out
  swing:     1600,        // 380 → 1980   the slab
  apertureAt: 460, apertureDur: 900,
  vapourAt:   560, vapourDur: 2000,
  spillAt:    420, spillDur: 2200,
  throughAt: 1900, throughDur: 780,
  blastAt:   1680, blastDur: 1080,
  total:     2760         // sequence end: teardown, focus, `is-open`
};

/** The refusal. Short, blunt, and it does not give. */
const T_REFUSE = 440;


/* ─────────────────────────────────────────────────────────────────────────────
 * 1 · SMALL HELPERS
 * ────────────────────────────────────────────────────────────────────────── */

const STYLE_ID = 'ccc-freezer-css';
const SOUND_KEY = 'ccc-freezer-sound';        // '0' muted · anything else = on

/** theme.css §17's takeover condition, verbatim. One string, one owner. */
const NARROW_MEDIA = '(max-width: 900px), (max-aspect-ratio: 8 / 7)';

const REDUCE_MEDIA = '(prefers-reduced-motion: reduce)';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.setAttribute('style', v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

/** A {x,y,w,h} box in plate %, defaulted so a half-written rooms.js cannot throw. */
function box(b, d) {
  b = b || {};
  return {
    x: num(b.x, d.x), y: num(b.y, d.y),
    w: Math.max(0.01, num(b.w, d.w)), h: Math.max(0.01, num(b.h, d.h))
  };
}

/** Read-only mirror of app.js §2's unlock predicate. Writes nothing, ever. */
/* Same one-character hole as coldgate.js's freezerSessionHint(), same fix:
   `document.cookie` throws too (sandboxed frame, cookies disabled), and it was
   outside the try in a boot-critical path. See the note there. */
function defaultIsUnlocked() {
  try { if (sessionStorage.getItem('c3f-unlocked') === '1') return true; }
  catch { /* private mode — fall through to the cookie, same as app.js */ }
  try { return document.cookie.split('; ').some((c) => c.startsWith('c3f=')); }
  catch { return false; }
}

function prefersReduced() {
  try { return window.matchMedia(REDUCE_MEDIA).matches; } catch { return false; }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · STYLES — injected once, idempotent, namespaced under .frz-*
 *
 * Every colour reads a theme.css token with a literal fallback, the way
 * chefwall.js and overlay.js do, so the module still stands up with no theme.
 * The cold ramp (--ice-*, --lcd) is the one theme.css §15 already uses for the
 * keypad: this door and that keypad are the same piece of hardware.
 * ────────────────────────────────────────────────────────────────────────── */

const CSS = `
.frz, .frz-ground, .frz-spill, .frz-blast {
  /* cold storage — theme.css §02's ice ramp, with fallbacks */
  --frz-900:  var(--ice-900, #0a1016);
  --frz-800:  var(--ice-800, #121a22);
  --frz-700:  var(--ice-700, #1d2831);
  --frz-600:  var(--ice-600, #2b3a45);
  --frz-300:  var(--ice-300, #9fb6c4);
  --frz-100:  var(--ice-100, #dbe8ef);
  --frz-lcd:  var(--lcd, #8ef0d0);
  --frz-alert:var(--alert, #ff6f57);
  --frz-brass:var(--ccc-accent, var(--brass, #c8973f));
  --frz-ink:  var(--ink-950, #05070a);
  --frz-shade:var(--shade, 3 5 9);
  --frz-cine: var(--ccc-ov-ease, var(--ease-cine, cubic-bezier(.16,1,.3,1)));
  --frz-out:  var(--ease-out, cubic-bezier(.22,.61,.24,1));
  --frz-font: var(--ccc-font-ui, var(--font-text, system-ui, sans-serif));

  /* the plates' native ratio — same number theme.css §06 uses */
  --frz-ar: 1.79104;
  --frz-cw: max(100cqw, calc(100svh * var(--frz-ar)));
  --frz-ch: max(100svh, calc(100cqw / var(--frz-ar)));
}

/* ── the assembly ─────────────────────────────────────────────────────────
   WIDE: exactly .plate-wrap's cover box, offset and transform — same box,
   same units, same origin. The door is welded to the photograph and rides the
   engine's dolly and parallax with it. Nothing here writes an engine var. */
.frz {
  position: absolute;
  z-index: 6;
  pointer-events: none;
  inline-size: var(--frz-cw);
  block-size: var(--frz-ch);
  inset-inline-start: calc((100cqw - var(--frz-cw)) * var(--focus-x, .5));
  inset-block-start:  calc((100svh - var(--frz-ch)) * var(--focus-y, .5));
  /* v29: theme.css §01 registers the dolly numbers inherits:false (the
     engine's fine tier), so the door takes them from the stage explicitly,
     as .plate-wrap and .hotspots do. */
  --plate-x: inherit;
  --plate-y: inherit;
  --plate-scale: inherit;
  /* 2D, and no backface-visibility: a 3D transform promoted the whole door
     assembly for the session whether the walk-in was on screen or not. The
     sequence buys its own will-change while it runs (see promote()). */
  transform:
    translate(calc(var(--plate-x) * 1cqw), calc(var(--plate-y) * 1svh))
    scale(calc(var(--plate-scale) * var(--overscan-k, 1.10)));
  transform-origin: 50% 50%;
}

/* the ground the narrow fit floats on — see §"THE NARROW FIT" in the module */
.frz-ground {
  position: absolute;
  inset: 0;
  z-index: 5;
  opacity: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 92% at 50% 38%,
      color-mix(in oklab, var(--frz-800) 70%, transparent) 0%,
      transparent 68%),
    var(--frz-ink);
}

/* everything that moves in the reveal lives in here */
.frz-scene {
  position: absolute;
  inset: 0;
  transform-origin: calc(var(--frz-ocx) * 1%) calc(var(--frz-ocy) * 1%);
}

/* ── the jamb: the closed-door plate, whole and still ─────────────────── */
.frz-jamb {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  /* theme.css §03 resets img to max-width: 100%. Both door images are sized
     deliberately — the leaf's is the WHOLE plate inside a 26%-wide window — so
     the clamp has to be lifted or the crop silently collapses to its frame and
     the leaf paints nothing at all. */
  max-inline-size: none;
  max-block-size: none;
  object-fit: cover;
  object-position: 50% 50%;
  user-select: none;
  -webkit-user-drag: none;
}

/* a soft inner edge so the letterboxed narrow fit does not end on a hard cut */
.frz-edge {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  box-shadow: inset 0 0 130px 44px rgb(var(--frz-shade) / .92);
}

/* ── the aperture: the freezer, seen through the doorway ──────────────── */
.frz-ap {
  position: absolute;
  overflow: hidden;
  opacity: 0;
  inset-inline-start: calc(var(--frz-ox) * 1%);
  inset-block-start:  calc(var(--frz-oy) * 1%);
  inline-size: calc(var(--frz-ow) * 1%);
  block-size:  calc(var(--frz-oh) * 1%);
  background: var(--frz-900);
}
.frz-ap__img {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  transform: scale(1.2);
  transform-origin: 50% 46%;
}
/* the reveal of the jamb's depth, plus the cold light living in the box */
.frz-ap__cold {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg,
      rgb(var(--frz-shade) / .82) 0%, rgb(var(--frz-shade) / .18) 14%,
      transparent 34%, transparent 78%, rgb(var(--frz-shade) / .5) 100%),
    linear-gradient(to bottom,
      color-mix(in oklab, var(--frz-100) 26%, transparent) 0%,
      transparent 34%,
      transparent 62%,
      color-mix(in oklab, var(--frz-100) 16%, transparent) 100%);
}

/* the frost seal, cracking */
.frz-seal {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  inset-inline-start: calc(var(--frz-ox) * 1%);
  inset-block-start:  calc(var(--frz-oy) * 1%);
  inline-size: calc(var(--frz-ow) * 1%);
  block-size:  calc(var(--frz-oh) * 1%);
  box-shadow:
    0 0 0 2px color-mix(in oklab, var(--frz-100) 74%, transparent),
    0 0 30px 6px color-mix(in oklab, var(--frz-100) 34%, transparent);
}

/* ── the leaf ─────────────────────────────────────────────────────────────
   Three nested elements, and the nesting is the point: the latch jitters on
   ONE transform and the swing rotates on ANOTHER, so neither has to share a
   property with the other. Two animations racing one single transform is how this
   effect gets built wrong.                                                  */
.frz-leafwrap {
  position: absolute;
  inset-inline-start: calc(var(--frz-lx) * 1%);
  inset-block-start:  calc(var(--frz-ly) * 1%);
  inline-size: calc(var(--frz-lw) * 1%);
  block-size:  calc(var(--frz-lh) * 1%);
  perspective: 74cqw;
  perspective-origin: calc(var(--frz-vpx) * 1%) calc(var(--frz-vpy) * 1%);
}
.frz-latch { position: absolute; inset: 0; transform-style: preserve-3d; }
.frz-leaf {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transform-origin: var(--frz-pivot) 50%;
}
/* the face is flat and clipped — a flattened child of a preserve-3d parent is
   fine, and it is what lets the slab carry a photograph instead of a colour */
.frz-leaf__face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  backface-visibility: hidden;
}
.frz-leaf__img {
  position: absolute;
  /* see .frz-jamb — this is the element the max-width reset actually breaks */
  max-inline-size: none;
  max-block-size: none;
  inline-size: calc(100% * 100 / var(--frz-lw));
  block-size:  calc(100% * 100 / var(--frz-lh));
  inset-inline-start: calc(-100% * var(--frz-lx) / var(--frz-lw));
  inset-block-start:  calc(-100% * var(--frz-ly) / var(--frz-lh));
  object-fit: cover;
  object-position: 50% 50%;
  user-select: none;
  -webkit-user-drag: none;
}
/* light rakes across the face as it turns out of the doorway */
.frz-leaf__lit {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: linear-gradient(100deg,
    transparent 0%,
    color-mix(in oklab, var(--frz-100) 30%, transparent) 46%,
    transparent 82%);
}
/* the insulated slab's side face — 90° off the leaf, so it comes into view as
   the door swings toward the camera and reads as real thickness */
.frz-leaf__edge {
  position: absolute;
  inset-block: 0;
  inline-size: calc(var(--frz-th) * 1cqw);
  inset-inline-start: var(--frz-edge-x);
  transform-origin: var(--frz-edge-o) 50%;
  transform: rotateY(var(--frz-edge-r));
  background: linear-gradient(90deg, var(--frz-600), var(--frz-800) 62%, var(--frz-900));
  box-shadow: inset 0 1px 0 rgb(219 232 239 / .18), inset 0 -1px 0 rgb(0 0 0 / .6);
}

/* ── cold air ─────────────────────────────────────────────────────────────
   Radial gradients, transform + opacity only. No animated blur: theme.css §06
   spent the whole blur budget on the rail glass and this is the heaviest
   effect on the site.                                                       */
.frz-vapour {
  position: absolute;
  pointer-events: none;
  inset-inline-start: calc(var(--frz-vx) * 1%);
  inset-block-start:  calc(var(--frz-vy) * 1%);
  inline-size: calc(var(--frz-vw) * 1%);
  block-size:  calc(var(--frz-vh) * 1%);
}
.frz-puff {
  position: absolute;
  inset-inline-start: var(--px);
  inset-block-start: var(--py);
  inline-size: var(--pw);
  block-size: var(--ph);
  opacity: 0;
  border-radius: 50%;
  transform: translate3d(0, 6%, 0) scale(.3);
  background: radial-gradient(closest-side,
    color-mix(in oklab, var(--frz-100) 82%, transparent) 0%,
    color-mix(in oklab, var(--frz-300) 40%, transparent) 46%,
    transparent 76%);
}

/* the light change: cold spilling into a warm room */
.frz-spill {
  position: absolute;
  inset: 0;
  z-index: 7;
  opacity: 0;
  pointer-events: none;
  background:
    radial-gradient(58% 62% at 50% var(--frz-lit-y),
      color-mix(in oklab, var(--frz-100) 40%, transparent) 0%,
      color-mix(in oklab, var(--frz-300) 16%, transparent) 38%,
      transparent 72%),
    linear-gradient(to bottom,
      color-mix(in oklab, #7fb3d8 8%, transparent) 0%,
      color-mix(in oklab, #7fb3d8 15%, transparent) 100%);
}

/* the air arriving at the camera */
.frz-blast {
  position: absolute;
  inset: 0;
  z-index: 8;
  opacity: 0;
  pointer-events: none;
  transform: scale(.42);
  transform-origin: 50% var(--frz-lit-y);
  background: radial-gradient(closest-side at 50% var(--frz-lit-y),
    color-mix(in oklab, var(--frz-100) 66%, transparent) 0%,
    color-mix(in oklab, var(--frz-300) 26%, transparent) 42%,
    transparent 74%);
}

/* ── the tap target on the art ────────────────────────────────────────────
   The industrial keypad in the photograph, made real. It carries
   data-freezer-lock, so app.js's ONE delegated handler opens the same dialog
   it always did — this module adds no second route to the lock.

   It is NOT a .hotspot on purpose: theme.css §17 hides .hotspot below 900px,
   and the whole point of a door is that you can open it on a phone.          */
.frz-pad {
  position: absolute;
  pointer-events: auto;
  inset-inline-start: calc(var(--frz-kx) * 1%);
  inset-block-start:  calc(var(--frz-ky) * 1%);
  inline-size: calc(var(--frz-kw) * 1%);
  block-size:  calc(var(--frz-kh) * 1%);
  padding: 0;
  border: 0;
  background: none;
  color: var(--frz-100);
  font: inherit;
  cursor: pointer;
  border-radius: var(--r-xs, 2px);
  /* v29 (design audit P1-7): no hairline rectangle at rest. The pad and its
     ring used to draw two concentric 1px teal boxes round the keypad, which
     read as debug outlines on the one control in the room. At rest the pad
     now only glows, the way a lit LCD does; the ring (below) carries the
     "this is a control" mark as corner brackets, the same reticle language as
     every other object on the site (theme.css §09). */
  box-shadow: 0 0 26px -4px color-mix(in oklab, var(--frz-lcd) 46%, transparent);
  transition: box-shadow var(--dur-2, 190ms) var(--frz-out);
}
/* 44px minimum, kept centred on the object however small the art draws it */
.frz-pad::before {
  content: "";
  position: absolute;
  inset: min(0px, calc((100% - 44px) / 2)) min(0px, calc((100% - 44px) / 2));
}
.frz-pad:hover, .frz-pad:focus-visible {
  box-shadow:
    0 0 0 2px var(--frz-lcd),
    0 0 40px -2px color-mix(in oklab, var(--frz-lcd) 80%, transparent);
}
.frz-pad:focus-visible {
  outline: 2.5px solid var(--ccc-focus, var(--frz-lcd));
  outline-offset: 4px;
}
/* the breathing mark — transform + opacity, and it is the ONE idle animation
   in this module, so it stops the moment the sequence starts */
.frz-pad__ring {
  position: absolute;
  inset: -12%;
  border-radius: var(--r-xs, 2px);
  /* corner brackets, not a box: a 1px border masked to four 12px corners */
  border: 1px solid color-mix(in oklab, var(--frz-lcd) 70%, transparent);
  -webkit-mask:
    linear-gradient(#000, #000) 0    0    / 12px 12px no-repeat,
    linear-gradient(#000, #000) 100% 0    / 12px 12px no-repeat,
    linear-gradient(#000, #000) 0    100% / 12px 12px no-repeat,
    linear-gradient(#000, #000) 100% 100% / 12px 12px no-repeat;
          mask:
    linear-gradient(#000, #000) 0    0    / 12px 12px no-repeat,
    linear-gradient(#000, #000) 100% 0    / 12px 12px no-repeat,
    linear-gradient(#000, #000) 0    100% / 12px 12px no-repeat,
    linear-gradient(#000, #000) 100% 100% / 12px 12px no-repeat;
  /* v29 (design audit M6/G1): it breathes only while the walk-in owns the page
     (engine.js's .is-owned, contract C2) and never under an open tool — at
     rest it is one still ring, not a loop running seven rooms away. */
  animation: frz-breathe 3.6s var(--ease-in-out, cubic-bezier(.65,0,.35,1)) infinite paused;
}
.room.is-owned .frz-pad__ring { animation-play-state: running; }
html.is-viewing .room.is-owned .frz-pad__ring,
html.ccc-locked .room.is-owned .frz-pad__ring { animation-play-state: paused; }
.frz-pad__led {
  position: absolute;
  inset-block-start: -18%;
  inset-inline-start: 50%;
  inline-size: 7px;
  block-size: 7px;
  margin-inline-start: -3.5px;
  border-radius: 50%;
  background: var(--frz-brass);
  box-shadow: 0 0 10px 1px color-mix(in oklab, var(--frz-brass) 70%, transparent);
  transition: background var(--dur-1, 110ms) linear, box-shadow var(--dur-1, 110ms) linear;
}
.frz-pad__label {
  position: absolute;
  inset-block-start: calc(100% + 10px);
  inset-inline-start: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-family: var(--frz-font);
  font-size: var(--t--2, .75rem);
  font-weight: 600;
  letter-spacing: var(--track-caps, .1em);
  text-transform: uppercase;
  color: var(--frz-100);
  background: rgb(var(--frz-shade) / .72);
  padding: 6px 10px;
  border-radius: var(--r-xs, 2px);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--frz-300) 26%, transparent);
  text-shadow: 0 1px 0 rgb(var(--frz-shade) / .8);
  opacity: .9;
}

/* ── the mute control ─────────────────────────────────────────────────────
   It lives in the keypad dialog, which is the only place and the only moment
   it can matter: the sound plays once, on the door, and you are standing at
   the keypad when it does. Nowhere else on the site makes a noise.           */
.frz-mute {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2, .5rem);
  margin-inline-end: auto;
  min-block-size: 44px;
  min-inline-size: 44px;
  padding: 0 var(--sp-3, .75rem);
  border: 0;
  border-radius: var(--r-xs, 2px);
  cursor: pointer;
  font-family: var(--frz-font);
  font-size: var(--t--2, .75rem);
  font-weight: 600;
  letter-spacing: var(--track-caps, .1em);
  text-transform: uppercase;
  color: var(--frz-300);
  background: rgb(159 182 196 / .06);
  box-shadow: inset 0 0 0 1px rgb(159 182 196 / .18);
  transition: color var(--dur-1, 110ms) linear, background var(--dur-1, 110ms) linear;
}
.frz-mute:hover, .frz-mute:focus-visible { color: var(--frz-100); background: rgb(159 182 196 / .12); }
.frz-mute:focus-visible { outline: 2.5px solid var(--frz-lcd); outline-offset: 2px; }
.frz-mute svg { flex: none; }
.frz-mute [data-off] { display: none; }
.frz-mute[aria-pressed="false"] [data-off] { display: block; }
.frz-mute[aria-pressed="false"] [data-on]  { display: none; }
.frz-mute[aria-pressed="false"] { color: color-mix(in oklab, var(--frz-300) 62%, transparent); }

/* ── the door replaces the old lock hotspot, it does not duplicate it ───── */
[data-freezer-door] .hotspots > .hotspot[data-freezer-lock] { display: none !important; }

/* ═══════════════════════════════════════════════════════════════════════════
   THE SEQUENCE
   ═══════════════════════════════════════════════════════════════════════════ */

.frz.is-opening .frz-pad { pointer-events: none; }
.frz.is-opening .frz-latch   { animation: frz-latch  var(--t-latch)  cubic-bezier(.34,0,.18,1) both; }
.frz.is-opening .frz-leaf    { animation: frz-swing  var(--t-swing)  linear var(--t-latch) both; }
.frz.is-opening .frz-leaf__lit { animation: frz-rake var(--t-swing)  var(--frz-out) var(--t-latch) both; }
.frz.is-opening .frz-seal    { animation: frz-seal   620ms           var(--frz-out) both; }
.frz.is-opening .frz-ap      { animation: frz-ap     var(--t-ap)     var(--frz-out) var(--t-ap-at) both; }
.frz.is-opening .frz-ap__img { animation: frz-dolly  1900ms          var(--frz-cine) var(--t-ap-at) both; }
/* .frz.is-opening .frz-puff--N — one generated rule per puff, see buildKeyframes */
.frz.is-opening .frz-scene   { animation: frz-through var(--t-thr)   var(--frz-cine) var(--t-thr-at) both; }

.frz-spill.is-opening  { animation: frz-spill  var(--t-spill) var(--frz-out) var(--t-spill-at) both; }
.frz-blast.is-opening  { animation: frz-blast  var(--t-blast) var(--frz-out) var(--t-blast-at) both; }

/* the latch does not give */
.frz.is-refused .frz-latch  { animation: frz-strain ${T_REFUSE}ms var(--ease-in-out, cubic-bezier(.65,0,.35,1)) both; }
.frz.is-refused .frz-seal   { animation: frz-seal-no ${T_REFUSE}ms var(--frz-out) both; }
.frz.is-refused .frz-pad__led { background: var(--frz-alert); box-shadow: 0 0 14px 2px var(--frz-alert); }
.frz.is-accepted .frz-pad__led { background: var(--frz-lcd); box-shadow: 0 0 16px 3px var(--frz-lcd); }
.frz.is-opening .frz-pad__ring { animation: none; }

@keyframes frz-breathe {
  0%, 100% { opacity: .34; transform: scale(.985); }
  50%      { opacity: .9;  transform: scale(1.02); }
}

/* frz-latch · frz-swing · frz-strain · frz-puff-N are GENERATED — see
   §"COMPOSITING" in the module. They are the four that carry geometry, and
   geometry in a keyframe means var(), and var() in a keyframe means the main
   thread. They are written out with their numbers already substituted. */

@keyframes frz-rake {
  0%   { opacity: 0; transform: translate3d(-14%, 0, 0); }
  30%  { opacity: .5; }
  70%  { opacity: .22; }
  100% { opacity: 0; transform: translate3d(26%, 0, 0); }
}

@keyframes frz-seal {
  0%   { opacity: 0; }
  12%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes frz-seal-no {
  0%, 100% { opacity: 0; }
  22%      { opacity: .7; }
}

@keyframes frz-ap { from { opacity: 0; } to { opacity: 1; } }

@keyframes frz-dolly {
  from { transform: scale(1.2); }
  to   { transform: scale(1); }
}

@keyframes frz-spill {
  0%   { opacity: 0; }
  22%  { opacity: .12; }
  52%  { opacity: .34; }
  72%  { opacity: .46; }
  100% { opacity: 0; }
}

@keyframes frz-blast {
  0%   { opacity: 0;   transform: scale(.42); }
  26%  { opacity: .44; }
  100% { opacity: 0;   transform: scale(3.1); }
}

/* through the doorway */
@keyframes frz-through {
  0%   { opacity: 1; transform: scale(1); }
  42%  { opacity: .44; }
  100% { opacity: 0; transform: scale(1.2); }
}
@keyframes frz-fade-out { from { opacity: 1; } to { opacity: 0; } }

/* ═══════════════════════════════════════════════════════════════════════════
   THE NARROW FIT  ·  phones and iPad portrait
   ═══════════════════════════════════════════════════════════════════════════
   SPEC-v4: "a 16:9 plate cover-cropped into a 3:4 viewport throws away a third
   of the frame … Mobile needs its own presentation. Design it; do not just
   shrink the desktop layout."

   Cover-cropping this plate on a phone is not a compromise, it is a failure:
   at 390x844 only 25.8% of the plate's width is on screen, and the door alone
   is 26% wide with its keypad out at 62%. Half the door and the entire lock
   would be off-frame. There is no --focus-x that fixes that.

   So on narrow viewports the door stops being a crop of a photograph and
   becomes a COMPOSED OBJECT: the plate is scaled so the region of interest —
   the leaf and the keypad, plus rooms.js's fitPad — exactly fills the stage,
   centred horizontally and sat at fitY vertically so it clears the chip
   drawer theme.css §17 puts across the bottom. Whatever is left of the plate
   spills past the edges; whatever is left of the STAGE is .frz-ground.

   Same door, same geometry, same sequence — a different camera. And because
   the fit is solved from the same plate percentages, it needs no second set
   of measurements when the art changes.
   ═══════════════════════════════════════════════════════════════════════════ */
@media ${NARROW_MEDIA} {
  .frz {
    --frz-fw: min(
      calc(100cqw * 100 / var(--frz-roi-w)),
      calc(100svh * 100 / var(--frz-roi-h) * var(--frz-ar)));
    inline-size: var(--frz-fw);
    block-size: calc(var(--frz-fw) / var(--frz-ar));
    inset-inline-start: calc(50cqw - var(--frz-fw) * var(--frz-roi-cx) / 100);
    inset-block-start:
      calc(100svh * var(--frz-fit-y) - (var(--frz-fw) / var(--frz-ar)) * var(--frz-roi-cy) / 100);
    /* a damped parallax: enough life that it belongs to the room, not enough
       to walk the fit off the edge of the stage */
    transform:
      translate(calc(var(--plate-x) * .32cqw), calc(var(--plate-y) * .32svh))
      scale(calc(1 + (var(--plate-scale) - 1) * .5));
  }
  /* the ground and the soft inner edge exist only for the letterboxed fit */
  .frz-ground { opacity: 1; }
  .frz-ground.is-opening { animation: frz-fade-out var(--t-thr) var(--frz-cine) var(--t-thr-at) both; }
  /* THE BOTTOM EDGE IS THE ONLY ONE ON SCREEN, AND IT NEEDED MORE THAN THE
     RING. .frz-edge's inset ring feathers all four edges equally, which is
     right for the wide fit and wrong here: the narrow fit blows the plate up to
     ~2.7x the stage, so the left and right edges are hundreds of pixels off
     frame and only the horizon at the foot of the door is visible — where the
     plate's brightest large field, the lit concrete floor, meets .frz-ground's
     ink. Measured at 390x844: the ring took that floor from 113 to 39 and the
     ground below it sits at 12, so it still ended on a step you could see, and
     ended it across the middle of the phone. Winding the ring up instead would
     have darkened the top edge by the same amount, and the top edge is the head
     of the door.

     So the foot gets its own ramp, in the one place it is needed. Gradient
     stops on a layer that is already in the tree: no element, no blend mode, no
     opacity of its own — .frz-edge fades with the assembly it belongs to. */
  .frz-edge   {
    opacity: 1;
    background: linear-gradient(to bottom,
      transparent 56%,
      rgb(var(--frz-shade) / .22) 76%,
      rgb(var(--frz-shade) / .60) 90%,
      rgb(var(--frz-shade) / .88) 100%);
  }
  /* THE PERSPECTIVE HAS TO BE MEASURED AGAINST THE PLATE, NOT THE CONTAINER.
     Everywhere else in this module cqw and the plate are interchangeable, because
     the WIDE rule sizes .frz to the cover box and that is within ~12% of 100cqw.
     The narrow fit breaks that equivalence deliberately: it blows the plate up to
     --frz-fw so the region of interest fills the stage, which on a 390px phone
     is ~1046px — 2.7x the container. A perspective quoted in cqw therefore stays
     small while the leaf it has to project grows, and at 390x844 the door came
     out 250px wide inside a 242px perspective. Rotating that past ~75 degrees
     drives the leading edge THROUGH the camera plane: measured, the leaf's box
     reached 83584x754746px at t=1800 and its hinge edge left the jamb entirely.
     iPad portrait (1024x1366) did the same thing, x80.8 at full travel.

     This is not a consequence of the re-measure. The provisional stand-in
     geometry blew up to x52.9 at 390x844 in exactly the same way; it is the one
     line in this file that reads a length from the wrong basis.

     So: express the distance as a multiple of the LEAF, which is what the wide
     rule effectively does. 2.85 leaf-widths is what 74cqw works out to against
     the cover box at a desktop viewport, and the leaf is --frz-lw percent of
     --frz-fw, so 0.0285 x --frz-fw x --frz-lw is the same camera at every
     viewport. Measured after: x1.51 at full travel on the phone and x1.51 on
     iPad portrait against x1.52 wide — one door, one lens. Still not one pixel
     coordinate in this file: both numbers it reads come from rooms.js. */
  .frz-leafwrap { perspective: calc(var(--frz-fw) * var(--frz-lw) * 0.0285); }
  /* the label cannot centre under a keypad that is against the frame edge */
  .frz-pad__label { inset-inline-start: auto; inset-inline-end: 0; transform: none; }
}

/* very short landscape phones: the drawer takes the bottom, lift the door */
@media (max-height: 480px) and (orientation: landscape) {
  .frz { --frz-fit-y: .42; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   REDUCED MOTION — the door is simply open.
   No swing, no vapour, no light change, no sound. The module still mounts the
   CLOSED door (a photograph is not motion, and the client's portal has to be
   there), but the moment it is unlocked the assembly is gone.
   ═══════════════════════════════════════════════════════════════════════════ */
@media ${REDUCE_MEDIA} {
  .frz { transform: none !important; }
  .frz-pad__ring { animation: none !important; opacity: .8 !important; }
  .frz.is-opening, .frz-ground.is-opening,
  .frz-spill.is-opening, .frz-blast.is-opening { display: none !important; }
  .frz *, .frz-ground, .frz-spill, .frz-blast { animation: none !important; }
}

@media (forced-colors: active) {
  .frz-pad { forced-color-adjust: none; box-shadow: 0 0 0 2px Highlight; }
  .frz-pad__label { background: Canvas; color: CanvasText; }
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
 * COMPOSITING — why four of the keyframes are written by JavaScript
 * ═══════════════════════════════════════════════════════════════════════════
 * Blink will only run a transform/opacity animation on the compositor if it can
 * resolve the keyframe values without a style recalculation. A keyframe whose
 * value contains `var()` cannot be: the custom property has to be substituted
 * every time style is resolved, so the animation is demoted to the main thread
 * and every frame of it costs a recalc.
 *
 * Measured on the door, 6x CPU throttle, phone viewport: the var() version ran
 * ~52 style recalcs per second through the whole 2.76s sequence against ~20/s
 * for the same page sitting still. That is the entire budget for the heaviest
 * effect on the site, spent on re-substituting numbers that never change.
 *
 * The four animations that carry geometry — the latch, the swing, the strain
 * and the five puffs — are therefore written out with their numbers already
 * in them. Everything else (opacity ramps, plain percentage translates, scales)
 * has no var() in it and stays in the static sheet.
 *
 * Percentages and cqw survive: they resolve to a length at style time like any
 * other unit and do not block compositing. It is specifically var() that does.
 * If you add a keyframe here, keep var() out of its VALUES.
 * ══════════════════════════════════════════════════════════════════════════ */

const KEYS_ID = 'ccc-freezer-keys';

/** THE MASS CURVE. Slow to leave (inertia), quick through the middle, arrested
 *  hard at the end with two degrees of overtravel and a settle. A cubic-bezier
 *  cannot hold this shape — that is why it is a stop list. */
const SWING_CURVE = [
  [0, 0], [6, .010], [16, .052], [30, .168], [46, .372],
  [62, .598], [76, .792], [88, .938], [95, 1.020], [100, 1]
];

function buildKeyframes({ swing, thickness, puffs }) {
  const deg = (k) => (swing * k).toFixed(3);
  const swingKf = SWING_CURVE
    .map(([at, k]) => `  ${at}% { transform: rotateY(${deg(k)}deg); }`).join('\n');

  /* The latch travel is a PERCENTAGE of the leaf, so it scales with the door at
     every viewport without measuring anything, and it composites. */
  const puffKf = puffs.map((p, i) => `
@keyframes frz-puff-${i} {
  0%   { opacity: 0; transform: translate3d(0, 6%, 0) scale(.3); }
  18%  { opacity: ${p.o}; }
  62%  { opacity: ${(p.o * 0.62).toFixed(3)}; }
  100% { opacity: 0; transform: translate3d(${p.dx}, ${p.dy}, 0) scale(${p.s}); }
}
.frz.is-opening .frz-puff--${i} {
  animation: frz-puff-${i} ${p.dur}ms var(--frz-out) ${p.at}ms both;
}`).join('');

  return `
/* the bolt lets go, the slab strikes the frame, then pulls out of the gasket */
@keyframes frz-latch {
  0%   { transform: translate3d(0, 0, 0); }
  13%  { transform: translate3d(1.15%, -.3%, 0); }
  27%  { transform: translate3d(-.62%, .14%, 0); }
  41%  { transform: translate3d(.3%, 0, 0); }
  55%  { transform: translate3d(0, 0, 0); }
  100% { transform: translate3d(0, 0, ${thickness}cqw); }
}

@keyframes frz-swing {
${swingKf}
}

/* it does not give */
@keyframes frz-strain {
  0%, 100% { transform: translate3d(0, 0, 0); }
  18%      { transform: translate3d(1.5%, 0, 0); }
  36%      { transform: translate3d(-.8%, 0, 0); }
  54%      { transform: translate3d(.52%, 0, 0); }
  74%      { transform: translate3d(-.24%, 0, 0); }
}
${puffKf}
`;
}

function ensureKeyframes(css) {
  try {
    let node = document.getElementById(KEYS_ID);
    if (!node) {
      node = el('style', { id: KEYS_ID });
      document.head.append(node);
    }
    if (node.textContent !== css) node.textContent = css;
  } catch { /* non-fatal, same as ensureStyles */ }
}

function ensureStyles() {
  try {
    if (document.getElementById(STYLE_ID)) return;
    document.head.append(el('style', { id: STYLE_ID, text: CSS }));
  } catch { /* a CSP-blocked <style> means no door, not a broken page */ }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 3 · THE SOUND
 *
 * One cue, on the opening, and nothing after it — the client's own correction.
 *
 *   · The file may not exist. A 404 disables the audio and nothing else.
 *   · play() returns a promise that CAN reject even after a gesture (a locked
 *     iOS device, a policy we did not predict). It is caught and dropped. The
 *     animation never waits on it and never branches on it.
 *   · It plays at most once per unlock, guarded by a flag that only reset()
 *     clears.
 *   · It never plays under prefers-reduced-motion, and that is checked at PLAY
 *     time, not at load time, so toggling the OS setting takes effect at once.
 *   · Muting is remembered in localStorage and is read on every play, so a
 *     choice made in one tab holds in the next.
 * ────────────────────────────────────────────────────────────────────────── */

function createSound(src) {
  let audio = null;
  let dead = !src;
  let played = false;

  const wanted = () => {
    try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; }
  };
  const setWanted = (on) => {
    try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* noop */ }
  };

  /** Called when the keypad opens: intent is now obvious, so buy the bytes. */
  function arm() {
    if (dead || audio) return;
    try {
      audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('error', () => { dead = true; audio = null; }, { once: true });
      audio.src = src;
      audio.load();
    } catch { dead = true; audio = null; }
  }

  function play() {
    if (dead || played || !wanted() || prefersReduced()) return;
    played = true;                      // set BEFORE the await path, never twice
    arm();
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* policy said no */ });
    } catch { /* nothing about the door depends on this */ }
  }

  function stop() {
    if (!audio) return;
    try { audio.pause(); audio.currentTime = 0; } catch { /* noop */ }
  }

  return { arm, play, stop, wanted, setWanted, reset: () => { played = false; } };
}

const SPEAKER_ON =
  '<svg data-on width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" aria-hidden="true" focusable="false">' +
  '<path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor" stroke-linejoin="round"/>' +
  '<path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.7 3.5a6.4 6.4 0 0 1 0 9"/></svg>';
const SPEAKER_OFF =
  '<svg data-off width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" aria-hidden="true" focusable="false">' +
  '<path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor" stroke-linejoin="round"/>' +
  '<path d="M11 6l4 4M15 6l-4 4" stroke-linecap="round"/></svg>';


/* ─────────────────────────────────────────────────────────────────────────────
 * 4 · initFreezer
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Mount the walk-in door over the freezer room.
 *
 * @param {object}   [opts]
 * @param {Element|string} [opts.room='#room-freezer']
 * @param {object}   [opts.geometry]     FREEZER_DOOR from rooms.js
 * @param {string}   [opts.interior]     the plate the door opens onto
 * @param {string}   [opts.sound='assets/freezer-open.mp3']
 * @param {() => boolean} [opts.isUnlocked]  app.js's isFreezerUnlocked
 * @param {(cb:Function) => void} [opts.onUnlock]  app.js's onFreezerUnlock
 * @param {() => void} [opts.onRevealed]  run when the room is handed over —
 *        pass app.js's playUnlockBeat here so the fourteen chips ripple as the
 *        door finishes opening rather than while it is still shut.
 * @returns {{open, refuse, reset, destroy, whenOpen, isOpen, state, mounted}}
 */
export function initFreezer(opts = {}) {
  const isUnlocked = typeof opts.isUnlocked === 'function' ? opts.isUnlocked : defaultIsUnlocked;
  const onRevealed = typeof opts.onRevealed === 'function' ? opts.onRevealed : null;
  const g = opts.geometry || {};

  const room = typeof opts.room === 'string' || !opts.room
    ? document.querySelector(opts.room || '#room-freezer')
    : opts.room;
  const stage = room && room.querySelector('.stage');

  const sound = createSound(opts.sound === null ? null
    : (opts.sound || 'assets/freezer-open.mp3'));

  /* ---- geometry, normalised once ---------------------------------------- */
  const leaf    = box(g.leaf,    { x: 26, y: 8, w: 26, h: 86 });
  const opening = box(g.opening, { x: leaf.x + 1, y: leaf.y + 1,
                                   w: Math.max(1, leaf.w - 2), h: Math.max(1, leaf.h - 2) });
  const keypad  = box(g.keypad,  { x: leaf.x + leaf.w + 4.5, y: 38, w: 5.2, h: 13.5 });
  const vanish  = { x: num(g.vanish && g.vanish.x, 50), y: num(g.vanish && g.vanish.y, 46) };
  const swing   = num(g.swing, -78);
  const thick   = Math.max(0.1, num(g.thickness, 1.15));
  const hingeL  = String(g.hinge || 'left').toLowerCase() !== 'right';
  const plate   = g.plate || 'plates/freezer-door.webp';
  const srcset  = g.srcset || '';
  /* app.js owns this string (PLATE_SIZES) and hands it over, so the door and
     the room plate behind it can never resolve to different candidates. The
     literal is only the fallback for a caller that passes nothing. */
  const sizes   = opts.sizes || '(min-aspect-ratio: 2400/1340) 110vw, 197vh';
  const interior = opts.interior || 'plates/freezer.webp';
  /* The interior's candidate list, handed over by app.js from PLATES.freezer so
     the aperture resolves to the SAME cut the room plate behind it will take
     when revealFreezerInterior() swaps it in. Without it the aperture pinned the
     raw 2400 file — 12.3 MB of bitmap on a phone that takes the 1400 cut for
     everything else, i.e. the interior resident twice, once at each size. */
  const interiorSrcset = opts.interiorSrcset || '';

  /** Point an <img> at the interior, at whatever cut this viewport wants.
   *  sizes before srcset before src: all three land in the same task, so the
   *  first and only selection the browser runs is the correct one. */
  function pointAtInterior(img) {
    if (!img || img.getAttribute('src')) return;
    if (interiorSrcset) {
      img.setAttribute('sizes', sizes);
      img.setAttribute('srcset', interiorSrcset);
    }
    img.setAttribute('src', interior);
  }

  /* Cold air falls out of the bottom of the aperture and rolls outward. */
  const vapour = box(g.vapour, {
    x: opening.x - opening.w * 0.42,
    y: opening.y + opening.h * 0.44,
    w: opening.w * 1.84,
    h: Math.max(12, 100 - (opening.y + opening.h * 0.44))
  });

  /* THE NARROW FIT's region of interest: leaf ∪ keypad, padded. Derived, so a
     re-measure of the art needs no second set of numbers. */
  const pad = num(g.fitPad, 3.5);
  const roi = (() => {
    const x0 = Math.max(0, Math.min(leaf.x, keypad.x) - pad);
    const x1 = Math.min(100, Math.max(leaf.x + leaf.w, keypad.x + keypad.w) + pad);
    const y0 = Math.max(0, Math.min(leaf.y, keypad.y) - pad);
    const y1 = Math.min(100, Math.max(leaf.y + leaf.h, keypad.y + keypad.h) + pad);
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  })();

  /* ---- state ------------------------------------------------------------- */
  let state = 'idle';           // idle · shut · opening · open
  let frz = null, ground = null, spill = null, blast = null, padBtn = null, led = null;
  let apImg = null;             // the interior, seen through the doorway
  let timers = [];
  let openResolvers = [];
  let modalObserver = null, panelObserver = null;
  let artOk = false;                     // the door plate decoded — see the probe
  let reduceMQ = null, reduceHandler = null;
  let destroyed = false;

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
  const settleOpen = () => { openResolvers.splice(0).forEach((r) => r()); };

  /* ---- build ------------------------------------------------------------- */

  function styleVars() {
    return [
      `--frz-lx:${leaf.x}`, `--frz-ly:${leaf.y}`, `--frz-lw:${leaf.w}`, `--frz-lh:${leaf.h}`,
      `--frz-ox:${opening.x}`, `--frz-oy:${opening.y}`, `--frz-ow:${opening.w}`, `--frz-oh:${opening.h}`,
      `--frz-ocx:${opening.x + opening.w / 2}`, `--frz-ocy:${opening.y + opening.h / 2}`,
      `--frz-kx:${keypad.x}`, `--frz-ky:${keypad.y}`, `--frz-kw:${keypad.w}`, `--frz-kh:${keypad.h}`,
      `--frz-vx:${vapour.x}`, `--frz-vy:${vapour.y}`, `--frz-vw:${vapour.w}`, `--frz-vh:${vapour.h}`,
      `--frz-th:${thick}`,
      `--frz-pivot:${hingeL ? '0%' : '100%'}`,
      // the slab's side face: on the leading edge, folded 90° back toward the jamb
      `--frz-edge-x:${hingeL ? '100%' : `calc(var(--frz-th) * -1cqw)`}`,
      `--frz-edge-o:${hingeL ? 'left' : 'right'}`,
      `--frz-edge-r:${hingeL ? '90deg' : '-90deg'}`,
      // perspective-origin: the camera's centre expressed inside the leaf's box
      `--frz-vpx:${((vanish.x - leaf.x) / leaf.w) * 100}`,
      `--frz-vpy:${((vanish.y - leaf.y) / leaf.h) * 100}`,
      `--frz-roi-w:${roi.w}`, `--frz-roi-h:${roi.h}`,
      `--frz-roi-cx:${roi.x + roi.w / 2}`, `--frz-roi-cy:${roi.y + roi.h / 2}`,
      `--frz-fit-y:${num(g.fitY, 0.38)}`,
      `--frz-lit-y:${opening.y + opening.h * 0.52}%`,
      `--t-latch:${T.latch}ms`, `--t-swing:${T.swing}ms`,
      `--t-ap:${T.apertureDur}ms`, `--t-ap-at:${T.apertureAt}ms`,
      `--t-spill:${T.spillDur}ms`, `--t-spill-at:${T.spillAt}ms`,
      `--t-blast:${T.blastDur}ms`, `--t-blast-at:${T.blastAt}ms`,
      `--t-thr:${T.throughDur}ms`, `--t-thr-at:${T.throughAt}ms`
    ].join(';');
  }

  /* Five puffs, deterministic, each on its own drift so none of them twin.
     Position and size stay as custom properties (they are static, and static
     custom properties are free); the DRIFT is baked into a generated keyframe
     per puff, because that is the half that animates. */
  const PUFFS = [
    { px: '4%',  py: '22%', pw: '46%', ph: '58%', dx: '-26%', dy: '38%', s: 2.0, o: .62, d: 0,   dur: T.vapourDur },
    { px: '30%', py: '10%', pw: '40%', ph: '52%', dx: '6%',   dy: '52%', s: 2.3, o: .74, d: 150, dur: T.vapourDur + 260 },
    { px: '52%', py: '26%', pw: '44%', ph: '54%', dx: '30%',  dy: '34%', s: 2.1, o: .58, d: 300, dur: T.vapourDur + 120 },
    { px: '16%', py: '40%', pw: '58%', ph: '46%', dx: '-14%', dy: '26%', s: 2.6, o: .5,  d: 460, dur: T.vapourDur + 420 },
    { px: '38%', py: '48%', pw: '62%', ph: '44%', dx: '18%',  dy: '18%', s: 2.8, o: .42, d: 640, dur: T.vapourDur + 520 }
  ].map((p) => ({ ...p, at: T.vapourAt + p.d }));

  function buildPuffs() {
    return PUFFS.map((p, i) => el('div', {
      class: `frz-puff frz-puff--${i}`,
      style: `--px:${p.px};--py:${p.py};--pw:${p.pw};--ph:${p.ph}`
    }));
  }

  function buildDoorImg(cls) {
    return el('img', {
      class: cls,
      // ⚠ srcset AND sizes BEFORE src — the same rule the art probe below is
      // written to, and it applies to the element beside it just as much. el()
      // applies props in literal order, so `src` first would make the element
      // choose a candidate and then choose again.
      srcset: srcset || null,
      // identical to the room plates (cinema.js buildPlate) so the browser picks
      // the same candidate for the jamb and the leaf and fetches it once —
      // handed over as opts.sizes so there is exactly one copy of the string.
      sizes: srcset ? sizes : null,
      src: plate,
      alt: '',
      decoding: 'async',
      loading: 'lazy',
      fetchpriority: 'low'
    });
  }

  function build() {
    padBtn = el('button', {
      type: 'button',
      class: 'frz-pad',
      'data-freezer-lock': '',              // app.js §"the freezer gate" owns this
      'aria-haspopup': 'dialog',
      'aria-label': 'Walk-in freezer keypad — enter the manager code to open the door'
    }, [
      el('span', { class: 'frz-pad__ring', 'aria-hidden': 'true' }),
      (led = el('span', { class: 'frz-pad__led', 'aria-hidden': 'true' })),
      el('span', { class: 'frz-pad__label', 'aria-hidden': 'true', text: 'Enter code' })
    ]);

    const scene = el('div', { class: 'frz-scene' }, [
      buildDoorImg('frz-jamb'),
      el('div', { class: 'frz-ap' }, [
        /* NO `src` YET, AND THAT IS THE POINT.
         *
         * "I don't want the other employees to have access to what's behind the
         * freezer door." A locked freezer that quietly fetches its own interior
         * is a freezer that tells you what is inside it in the network tab. So
         * the aperture ships empty and is pointed at the plate in open(), i.e.
         * only ever after a code has decrypted the room. The .frz-ap box is
         * already filled with --frz-900, so a late decode reads as depth rather
         * than as a hole. (This hides the REQUEST, not the file: the interior
         * plate is a static asset at a guessable path, and nothing in a static
         * site can change that.) */
        (apImg = el('img', { class: 'frz-ap__img', alt: '', decoding: 'async' })),
        el('div', { class: 'frz-ap__cold' })
      ]),
      el('div', { class: 'frz-seal', 'aria-hidden': 'true' }),
      el('div', { class: 'frz-leafwrap' }, [
        el('div', { class: 'frz-latch' }, [
          el('div', { class: 'frz-leaf' }, [
            el('div', { class: 'frz-leaf__face' }, [
              buildDoorImg('frz-leaf__img'),
              el('div', { class: 'frz-leaf__lit' })
            ]),
            el('div', { class: 'frz-leaf__edge' })
          ])
        ])
      ]),
      el('div', { class: 'frz-vapour', 'aria-hidden': 'true' }, buildPuffs()),
      padBtn,
      el('div', { class: 'frz-edge', 'aria-hidden': 'true' })
    ]);

    // Rebuilt after an unlock (api.reset()): there is nothing left to hide.
    if (isUnlocked()) pointAtInterior(apImg);

    frz    = el('div', { class: 'frz', style: styleVars() }, [scene]);
    ground = el('div', { class: 'frz-ground', 'aria-hidden': 'true', style: styleVars() });
    spill  = el('div', { class: 'frz-spill',  'aria-hidden': 'true', style: styleVars() });
    blast  = el('div', { class: 'frz-blast',  'aria-hidden': 'true', style: styleVars() });

    // Behind .hotspots (z 10) and the rail (z 20): the door must never sit on
    // top of the room's own affordances, and the C³ menu must stay reachable.
    const plateWrap = stage.querySelector('.plate-wrap');
    if (plateWrap && plateWrap.nextSibling) {
      stage.insertBefore(ground, plateWrap.nextSibling);
    } else {
      stage.append(ground);
    }
    ground.after(frz);
    frz.after(spill);
    spill.after(blast);

    room.dataset.freezerDoor = '';
    setState('shut');
  }

  function setState(s) {
    state = s;
    if (room) room.dataset.freezerState = s;
    try { document.documentElement.dataset.freezerState = s; } catch { /* noop */ }
  }

  /* will-change is bought for the sequence and sold at the end of it.
   *
   * ⚠ THE LEAF IS PROMOTED FOR `transform` AND NOTHING ELSE, AND THAT IS NOT A
   * MICRO-OPTIMISATION. Per CSS Transforms 2, `transform-style: preserve-3d`
   * computes to `flat` on any element carrying a grouping property — opacity,
   * filter, mask, clip-path — INCLUDING via `will-change`. A blanket
   * `will-change: transform, opacity` on the leaf therefore flattens the 3D
   * context, the perspective stops applying, and rotateY degrades into a plain
   * horizontal squash: the door narrows instead of swinging out at you. It
   * still animates, it still looks like something is happening, and it is
   * completely wrong. Keep opacity off these two elements.
   */
  const PROMOTE = [
    ['.frz-scene', 'transform, opacity'],
    ['.frz-leaf', 'transform'],          // preserve-3d: transform ONLY
    ['.frz-ap__img', 'transform'],
    ['.frz-puff', 'transform, opacity']
  ];

  function promote(on) {
    if (!frz) return;
    for (const [sel, v] of PROMOTE) {
      frz.querySelectorAll(sel).forEach((n) => { n.style.willChange = on ? v : ''; });
    }
    [spill, blast, ground].forEach((n) => { if (n) n.style.willChange = on ? 'opacity' : ''; });
  }

  function teardown() {
    promote(false);
    [frz, ground, spill, blast].forEach((n) => { if (n && n.parentNode) n.remove(); });
    frz = ground = spill = blast = padBtn = led = apImg = null;
    if (room) delete room.dataset.freezerDoor;
  }

  /* ---- is the door even on screen? --------------------------------------
     One layout read, once, outside any animation frame — never in a loop.
     If the manager unlocked from the footer index three screens away there is
     nothing to watch, so the door just opens: no swing, and no sound fired at
     someone looking at a different room. */
  function onScreen() {
    if (!stage) return false;
    try {
      const r = stage.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      return visible > vh * 0.55 && r.width > 0;
    } catch { return false; }
  }

  /* ---- the sequence ------------------------------------------------------ */

  function snapOpen() {
    clearTimers();
    setState('open');
    teardown();
    if (onRevealed) { try { onRevealed(); } catch (e) { console.error(e); } }
    settleOpen();
  }

  function open({ silent = false } = {}) {
    if (destroyed || state === 'open' || state === 'opening') return whenOpen();
    if (!frz) { snapOpen(); return whenOpen(); }

    // The door is simply open: reduced motion, or nobody is looking at it.
    if (prefersReduced() || !onScreen()) { snapOpen(); return whenOpen(); }

    setState('opening');
    // The code was accepted, so the room is allowed to load now. That leaves the
    // APERTURE beat (+460ms) and the THROUGH dissolve (+1900ms) to decode it in.
    pointAtInterior(apImg);
    frz.classList.add('is-accepted');
    // The keypad's LED goes green and stays on screen for the beat — but the
    // button is done. `disabled` blurs it and takes it out of the tab order in
    // one move, which is also what leaves document.activeElement on <body> for
    // restFocus() to claim at the end.
    if (padBtn) padBtn.disabled = true;
    promote(true);

    // Read the class on the next frame so `both`-filled animations start from
    // their real first keyframe rather than from whatever was on screen.
    requestAnimationFrame(() => {
      if (!frz) return;
      frz.classList.add('is-opening');
      ground.classList.add('is-opening');
      spill.classList.add('is-opening');
      blast.classList.add('is-opening');
      if (!silent) sound.play();          // ONE cue, here, and nowhere else
    });

    // The reward beat lands with the through-the-doorway move, not with the
    // keypad dismissal: the chips come up as the room is handed over.
    later(() => {
      if (onRevealed) { try { onRevealed(); } catch (e) { console.error(e); } }
      else announceOpen();
    }, T.throughAt + 120);

    later(() => {
      setState('open');
      teardown();
      restFocus();
      settleOpen();
    }, T.total);

    return whenOpen();
  }

  /** The latch does not give. Visual only — the one sound is the door opening. */
  function refuse() {
    if (!frz || state !== 'shut') return;
    frz.classList.remove('is-refused');
    // one deliberate reflow, off the engine's loop, to re-arm the animation
    void frz.offsetWidth;
    frz.classList.add('is-refused');
    later(() => { if (frz) frz.classList.remove('is-refused'); }, T_REFUSE + 40);
  }

  /** Only used when nothing was handed an onRevealed to announce for us. */
  function announceOpen() {
    try {
      const r = el('div', {
        role: 'status', 'aria-live': 'polite', class: 'visually-hidden',
        style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)'
      });
      document.body.append(r);
      setTimeout(() => { r.textContent = 'Cold storage open. Manager tools are unlocked.'; }, 60);
      setTimeout(() => r.remove(), 4000);
    } catch { /* noop */ }
  }

  /** Somewhere sensible: the first of the fourteen tools that just unlocked. */
  function restFocus() {
    try {
      const active = document.activeElement;
      if (active && active !== document.body && document.contains(active)) return;
      const chip = document.querySelector('[data-room-chips="freezer"] .chip');
      if (chip) chip.focus({ preventScroll: true });
    } catch { /* noop */ }
  }

  function whenOpen() {
    if (state === 'open') return Promise.resolve();
    return new Promise((resolve) => openResolvers.push(resolve));
  }

  /* ---- the keypad dialog, observed rather than owned ----------------------
     app.js builds and owns the dialog. This watches #modal-root for it and
     does three things that belong to the DOOR, not to the lock:
       1. arms the audio — the manager has declared intent, so buy the bytes
          now instead of at the moment we need to play them;
       2. drops the mute control into the dialog's action row, which is the one
          place and the one moment it can matter;
       3. mirrors `.is-wrong` onto the door, so a refused code strains the
          latch in the photograph and not only in the dialog.
     No app.js edit is required for any of it. ------------------------------ */

  function watchKeypad() {
    const root = document.getElementById('modal-root');
    if (!root || typeof MutationObserver !== 'function') return;

    modalObserver = new MutationObserver(() => {
      const panel = root.querySelector('.keypad');
      if (!panel) {
        if (panelObserver) { panelObserver.disconnect(); panelObserver = null; }
        if (led) led.style.cssText = '';
        return;
      }
      // The keypad is up: warm the door art now (see the art-probe note), so
      // the 600,000 rounds of PBKDF2 behind the Unlock button are also the
      // download window for a plate this room has not needed until now.
      startProbe();
      if (panel.dataset.frzWired) return;
      panel.dataset.frzWired = '1';

      sound.arm();
      mountMute(panel);

      panelObserver = new MutationObserver(() => {
        if (panel.classList.contains('is-wrong')) refuse();
      });
      panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
    });
    modalObserver.observe(root, { childList: true, subtree: true });
  }

  function mountMute(panel) {
    const row = panel.querySelector('.keypad-actions');
    if (!row || row.querySelector('.frz-mute')) return;
    const on = sound.wanted();
    const btn = el('button', {
      type: 'button',
      class: 'frz-mute',
      'aria-pressed': on ? 'true' : 'false',
      /* THE NAME IS AN aria-label, NOT THE title. The title carries the one
         sentence of explanation and is a tooltip — it is never read reliably
         (JAWS and NVDA both make it optional and both default it off for
         controls that have any other name source) and it does not exist at all
         on touch, which is most of this site's traffic. The label is the SAME
         WORDS as the visible <span> below, deliberately: that keeps
         label-in-name intact, so "click Door sound" still works in Voice
         Control and Voice Access. */
      'aria-label': 'Door sound',
      title: 'The door makes one sound when it opens. Nothing else on this site does.'
    });
    btn.insertAdjacentHTML('afterbegin', SPEAKER_ON + SPEAKER_OFF);
    btn.append(el('span', { text: 'Door sound' }));
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();              // app.js's scrim delegate must not see it
      const next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      sound.setWanted(next);
      if (!next) sound.stop();
    });
    row.prepend(btn);
  }

  /* ---- reduced motion, live ---------------------------------------------- */
  function watchReduce() {
    try {
      reduceMQ = window.matchMedia(REDUCE_MEDIA);
      reduceHandler = () => {
        if (reduceMQ.matches && state === 'opening') { clearTimers(); snapOpen(); }
      };
      if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', reduceHandler);
      else if (reduceMQ.addListener) reduceMQ.addListener(reduceHandler);
    } catch { /* noop */ }
  }

  /* ---- mount ------------------------------------------------------------- */

  const api = {
    open, refuse, whenOpen,
    isOpen: () => state === 'open',
    get state() { return state; },
    get mounted() { return !!frz; },
    reset() {
      clearTimers();
      teardown();
      sound.reset();
      // artOk guards the rebuild: without it, reset() on a page whose plate
      // 404'd would mount four empty boxes over the photograph.
      if (artOk && !isUnlocked()) { try { build(); } catch (e) { console.error('[freezer]', e); } }
      else setState(isUnlocked() ? 'open' : 'shut');
    },
    destroy() {
      destroyed = true;
      clearTimers();
      teardown();
      if (modalObserver) modalObserver.disconnect();
      if (panelObserver) panelObserver.disconnect();
      try {
        if (reduceMQ && reduceHandler) {
          if (reduceMQ.removeEventListener) reduceMQ.removeEventListener('change', reduceHandler);
          else if (reduceMQ.removeListener) reduceMQ.removeListener(reduceHandler);
        }
      } catch { /* noop */ }
      settleOpen();
      setState('open');
    }
  };

  if (!room || !stage) return api;                 // no freezer room: no door
  ensureStyles();
  ensureKeyframes(buildKeyframes({ swing, thickness: thick, puffs: PUFFS }));
  watchKeypad();
  watchReduce();

  // Unlocked from earlier in this session: nothing happened, so nothing plays.
  // The room is simply the room, exactly as it was before this module existed.
  if (isUnlocked()) { setState('open'); settleOpen(); return api; }

  /* The art may not be there — it is new, and a 404 must not leave four empty
     boxes floating over the photograph. Probe first; if it does not decode,
     this module does nothing at all and the freezer behaves as it did in v3:
     the keypad hotspot on the interior plate, the gated chips, the same lock. */
  /* THE ART PROBE, WHICH USED TO COST A WHOLE SECOND COPY OF THE DOOR.
     It only ever answers one question — "is plates/freezer-door.webp there?" —
     and it answered it by setting `src` alone, i.e. by fetching and DECODING
     the full 2400x1340 cut on every device, including the phone whose jamb and
     leaf then take the 1400 cut. Measured at 390x844 DPR 3: 12.3 MB of bitmap
     for an <img> that is never in the document, on top of the 4.2 MB the door
     itself costs — the single largest item left on the phone after the plates
     were cut, and one nobody can see.

     Giving it the door's own `sizes` and `srcset` makes it warm the SAME URL
     the jamb and the leaf will ask for, so the decode is shared instead of
     duplicated and the probe costs nothing at all. It still answers the same
     question the same way: a candidate that 404s fires `error`, and `build()`
     is still gated on `load`. sizes/srcset before src, so the first selection
     is already the right one. */
  let probed = false;
  function startProbe() {
    if (probed || destroyed) return;
    probed = true;
    const probe = new Image();
    probe.decoding = 'async';
    if (srcset) { probe.sizes = sizes; probe.srcset = srcset; }
    probe.addEventListener('load', () => {
      artOk = true;
      if (destroyed || isUnlocked()) return;
      try { build(); } catch (e) { console.error('[freezer] could not mount the door:', e); }
    }, { once: true });
    probe.addEventListener('error', () => {
      console.warn(`[freezer] ${plate} is missing — the walk-in stays as it was.`);
    }, { once: true });
    probe.src = plate;
  }

  /* AND IT DOES NOT RUN AT FIRST PAINT ANY MORE.
     The walk-in is the LAST room in the building. This probe was firing during
     the first paint of the FIRST room, which put a 2400x1340 (or 1800w) copy of
     plates/freezer-door.webp on the critical path of a load that is otherwise
     the hero, theme.css and the modules. Measured cold at 1440x900 with GitHub
     Pages-shaped cache headers: freezer-door@1800 is 134 KiB of the 1856 KiB
     first load — 7% of the bytes, for a room nobody has scrolled to, competing
     with the LCP image. At 1180x820 DPR 2 it is the full cut: 240 KiB.

     Two triggers, whichever comes first, because the door MUST be built before
     anyone can reach it and neither trigger is guaranteed on its own:
       · the freezer room coming within one and a half viewports — the normal
         path, and 1.5 screens is several seconds of scrolling at any speed;
       · the KEYPAD appearing in #modal-root — the C³ menu's lock chip opens it
         without anyone having scrolled the building, and a manager typing a
         code is about two seconds of PBKDF2 away from wanting a door. That is
         the same MutationObserver watchKeypad() already runs.
     Both call the same idempotent starter, so the door is probed exactly once.

     THERE IS DELIBERATELY NO TIMED FLOOR under those two. A `load`-plus-a-few-
     seconds fallback was tried and removed: it fired on every desktop visit and
     put the 134 KiB (240 KiB at DPR 2) back on the wire for a room nobody had
     gone near, which is the whole cost this is here to avoid. If neither
     trigger ever fires, nobody has looked at the walk-in and nobody has touched
     the keypad, so the door is not needed; and a browser with no
     IntersectionObserver probes immediately, exactly as before.

     Nothing else moved: `build()` is still gated on the probe's `load`, a 404
     still fires `error` and still leaves the walk-in exactly as v3 had it. */
  if (typeof IntersectionObserver === 'function') {
    try {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.disconnect();
          startProbe();
        }
      }, { rootMargin: '150% 0px 150% 0px' });
      io.observe(room);
    } catch { startProbe(); }
  } else {
    startProbe();                                   // no observer: as before
  }

  /* Two ways in, so the module works whether or not app.js is wired to it:
       · opts.onUnlock(cb)                — the explicit hook (preferred)
       · document 'ccc:freezer-unlock'    — a plain event, for anything else
     and one safety net below. */
  if (typeof opts.onUnlock === 'function') opts.onUnlock(() => open());
  document.addEventListener('ccc:freezer-unlock', () => open());

  /* THE SAFETY NET. If nothing above is wired, the door still opens: the
     keypad dialog leaving #modal-root while the gate now reads unlocked IS the
     unlock moment, and app.js's openKeypad() only removes that dialog after
     submitFreezerCode() has resolved. Polling nothing, watching one node. */
  if (typeof MutationObserver === 'function') {
    const root = document.getElementById('modal-root');
    if (root) {
      new MutationObserver(() => {
        if (state === 'shut' && !root.querySelector('.keypad') && isUnlocked()) open();
      }).observe(root, { childList: true });
    }
  }

  return api;
}

export default initFreezer;
