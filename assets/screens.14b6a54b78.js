





 
import { freshUrl } from './overlay.dbf3839ea2.js';


import { preflight, preflightCopy } from './preflight.3928c43470.js';   

export const PROMO_CARD_URL =
  'https://raw.githubusercontent.com/BlufoxMobile/Daily-Sales-Report/main/data/promo-card.jpg';
export const STREAKS_URL =
  'https://raw.githubusercontent.com/BlufoxMobile/Daily-Sales-Report/main/data/nps-detractor-streaks.json';


export const EXCEL_URL =
  'https://raw.githubusercontent.com/BlufoxMobile/Daily-Sales-Report/main/data/Sales%20Report.xlsx';



const BUCKET_MS = 600000;



const PROMO_CHECK_MS = 10 * 60 * 1000;



const SETTLE_MS = 180;
const RESUME_MS = 1500;
const IDLE_TIMEOUT_MS = 1000;



const IO_MARGIN = {
  title: '150% 0px 150% 0px',
  live: '40% 0px 40% 0px',
  image: '50% 0px 50% 0px',
  feed: '50% 0px 50% 0px',
  report: '50% 0px 50% 0px'
};



const LIVE_RENDER_WIDTH = 960;



const LIVE_MIN_VIRTUAL_H = 960;



const LIVE_MIN_VIRTUAL_H_BY_SLUG = {
  'wtw-chicago':   880,   
  'wtw-big-south': 935    
};



const MAX_LIVE_FRAMES = 2;
const MAX_LIVE_FRAMES_PHONE = 1;

 
const FEED_SLIDE_MS = 9000;

 
const FEED_TTL_MS = 10 * 60 * 1000;



const FEED_RETRY_MS = 20 * 1000;



const FEED_TIMEOUT_MS = 10 * 1000;
const IMAGE_TIMEOUT_MS = 10 * 1000;



const BOOK_TIMEOUT_MS = 25 * 1000;
const SHEETJS_TIMEOUT_MS = 15 * 1000;



const REPORT_SLIDE_MS = 10 * 1000;



const PROMO_EVERY_N = 4;



const RETRY_EVERY_MS = 20 * 1000;
const RETRY_LIMIT = 5;



const RETRY_MAX_MS = 5 * 60 * 1000;
const retryDelay = (attempt) =>
  Math.min(RETRY_MAX_MS, RETRY_EVERY_MS * Math.pow(2, Math.max(0, attempt)));



export const NARROW_MEDIA = '(max-width: 900px), (max-aspect-ratio: 8 / 7)';



export const PHONE_MEDIA =
  '(max-width: 500px), (max-width: 1000px) and (max-height: 500px)';

 
export const SCREEN_MODES = {
  'quote-6th-gen':  'title',
  'quote-upgrade':  'title',
  'quote-internet': 'title',
  'daily-sales':    'image',
  'wtw-chicago':    'live',
  'wtw-big-south':  'live'
};

const MODES = new Set(['title', 'image', 'feed', 'live', 'report']);

 




const NARROW_AR = { title: 4, image: 2000 / 1429, feed: 6 / 5, live: 16 / 9, report: 4 / 3 };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];




const noop = () => {};

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

let reduceMQ = null;
function reduceMotion() {
  try {
    if (!reduceMQ) reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    return reduceMQ.matches;
  } catch { return false; }
}



function motionTier() {
  if (reduceMotion()) return 'off';
  const t = document.documentElement.getAttribute('data-motion');
  return t === 'lite' || t === 'off' ? t : 'full';
}

 
let viewerOpen = false;



function pageViewing() {
  if (viewerOpen) return true;
  const root = document.documentElement;
  if (root.classList.contains('is-viewing') || root.classList.contains('ccc-locked')) return true;
  return !!(document.body && document.body.classList.contains('ccc-locked'));
}



function onIdle(fn, timeout = IDLE_TIMEOUT_MS) {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 32);
  return () => window.clearTimeout(id);
}






function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : '';
}







const registry = new Map();

export function registerTools(tools) {
  const list = Array.isArray(tools) ? tools : (tools && tools.tools) || [];
  for (const tool of list) if (tool && tool.slug) registry.set(tool.slug, tool);
  for (const rec of records) applyMeta(rec);
}

function getTool(slug) {
  if (registry.has(slug)) return registry.get(slug);
  const inline = (window.CCC && window.CCC.data && window.CCC.data.bySlug) || null;
  if (inline && inline.get && inline.get(slug)) return inline.get(slug);
  return null;
}




const STYLES = `
/* ── the panel ───────────────────────────────────────────────────────────── */
.ccc-scr {
  position: absolute; inset: 0;
  pointer-events: none;
  -webkit-tap-highlight-color: transparent;

  /* THE POWER-ON. The engine publishes --enter on .stage (0 off-screen, 1 fully
     arrived, registered @property so it is 1 even if engine.js never loads).
     Everything below is a function of this one number: no timers, no second
     loop, and a screen that is cold and dark in a room's "before" state.

     RE-TIMED 2026-08-27. It ran 0.74 → 0.922, i.e. it did not FINISH until the
     room had completely arrived — so the largest, most obviously clickable
     things in the building were black glass for the whole approach. That is
     half of the client's "the clickable links are only available when you
     scroll down far enough". theme.css §08 now hands a room's affordances over
     at 55-60% coverage, and the power-on is moved to finish in the same frame:
     0.42 → 0.6123, which is --enter 0.6123 = coverage 0.56. The beat is not
     lost, it is EARLIER — the hairline opens and the panel comes up while the
     plate is still dissolving in, so a room arrives with its screens already
     alive rather than acquiring them a viewport later. */
  --scr-on: clamp(0, calc((var(--enter, 1) - 0.42) * 5.2), 1);
  --scr-ar: 1.7778;

  /* M2's power-on scales about the middle of the GLASS, not of the host box —
     a quad screen's host is the whole plate. applyGeometry() writes both. */
  transform-origin: var(--scr-ox, 50%) var(--scr-oy, 50%);
}

/* ── M2 · THE POWER-ON, KEYED TO OWNERSHIP (v29) ─────────────────────────
   A screen whose room does not own the page yet is OFF; the moment the room
   becomes owned (C2: .room.is-owned) it comes up — opacity 0 -> 1 and a
   scaleY(.985 -> 1) settle, 240 ms, 200 ms behind the room's own arrival.
   Time-based on a BINARY state, never on a per-frame custom property (G3),
   and only transform/opacity move.

   FAIL-OPEN. data-power is written by JS and ONLY once the ownership
   contract has actually spoken (see onOwnership() in §9). No attribute — no
   engine, no C2, reduced motion, motion tier 'off' — means no pre-state at
   all: the screen is simply on, exactly as before v29.

   A screen is NOT switched off when its room loses the page. It stays on and
   leaves with its photograph (M3: the stage's --dissolve carries it out), and
   it is only reset to OFF, instantly and unseen, once the owner is two or more
   rooms away — so walking back into a room you just left does not replay it. */
.ccc-scr[data-power] {
  /* With the ownership power-on in charge, the scroll-driven ramp above stands
     down: theme.css derives --enter in 0.1 steps since v29, so --scr-on off
     --enter stepped the glass through ~4 visible levels while the room came
     in. The panel is at opacity 0 until its room is owned anyway. */
  --scr-on: 1;
  transition:
    opacity   var(--m-t-3, 240ms) var(--m-ease-out, cubic-bezier(.22,.61,.24,1)) 200ms,
    transform var(--m-t-3, 240ms) var(--m-ease-cine, cubic-bezier(.16,1,.3,1)) 200ms;
}
.ccc-scr[data-power="off"] {
  opacity: 0;
  transform: scaleY(.985);
  transition: none;                  /* going OFF is always instant, and unseen */
}
/* lite: opacity only. off / reduced motion never gets a data-power at all, and
   this is the belt to that pair of braces. */
:root[data-motion="lite"] .ccc-scr[data-power] { transition-property: opacity; }
:root[data-motion="lite"] .ccc-scr[data-power="off"] { transform: none; }
:root[data-motion="off"] .ccc-scr[data-power] { opacity: 1; transform: none; transition: none; }
/* off: no scroll-driven ramp either (it steps on the quantised --enter) —
   the screen is simply on, as under reduced motion below. */
:root[data-motion="off"] .ccc-scr { --scr-on: 1; }

.ccc-scr__plane {
  position: absolute; inset: 0;
  transform-origin: 0 0;          /* the homography is solved for this origin */
  overflow: visible;              /* the glow spills; the glass clips */
  pointer-events: none;
}
/* Perspective mode: JS writes width/height in px and a matrix3d here. */
.ccc-scr--quad .ccc-scr__plane { inset: auto; top: 0; left: 0; }

/* the halo the panel throws onto the wall behind it.
   PRE-PAINTED (v29). It was this gradient under a filter: blur(12px), i.e. an
   offscreen render pass per screen, re-rastered every frame its --scr-on or
   --bloom moved. The blur only ever did one thing — soften the gradient's
   last stops and the 40% corner radius — so the softening is now IN the
   gradient: the old two stops, plus an eased tail that reaches transparent
   inside the box (80% of a 58% radius is 46% < the box's 50% half-width), so
   no corner radius is needed to hide an edge. Opacity is still the only thing
   that moves. */
.ccc-scr__glow {
  position: absolute; inset: -18%;
  z-index: 0; pointer-events: none;
  background: radial-gradient(58% 58% at 50% 50%,
    rgba(154,196,255,.42) 0%,
    rgba(140,180,255,.29) 22%,
    rgba(120,158,255,.16) 44%,
    rgba(120,158,255,.08) 57%,
    rgba(120,158,255,.03) 68%,
    rgba(120,158,255,0) 80%);
  opacity: calc(var(--scr-on) * (0.30 + 0.55 * var(--bloom, 0)));
}

/* the black glass itself.
   v29: no translateZ(0) — it promoted every glass to its own layer for the
   whole session, on every breakpoint but the phone (the phone had already
   dropped it; that rule is now the rule). And no filter: the power-on dim was
   brightness()/saturate() on the glass, a filter pass per screen that moved
   every frame of an arrival. It is now the ::after below — a black sheet
   whose OPACITY is 0.84 x (1 - --scr-on), which is what brightness(0.16 ->
   1) was, drawn without a render pass. Identical at rest (--scr-on 1: the
   sheet is fully transparent). */
.ccc-scr__glass {
  position: absolute; inset: 0;
  z-index: 1; overflow: hidden;
  pointer-events: none;
  background: linear-gradient(163deg, #0b0e14 0%, #04060a 55%, #080a10 100%);
}
.ccc-scr__glass::after {
  content: ""; position: absolute; inset: 0;
  pointer-events: none;
  background: #000;
  opacity: calc(0.84 * (1 - var(--scr-on)));
}

.ccc-scr__content {
  position: absolute; inset: 0;
  color: var(--ccc-scr-ink, var(--ccc-ov-ink, #f4efe6));
  font-family: var(--ccc-font-ui, system-ui, -apple-system, "Segoe UI", sans-serif);
  opacity: calc(0.06 + 0.94 * var(--scr-on));
}

/* ── the CRT power-on: a hairline that opens into a full panel ───────────── */
.ccc-scr__crt {
  position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background: linear-gradient(180deg,
    rgba(0,0,0,0) 47.5%, rgba(232,244,255,.95) 50%, rgba(0,0,0,0) 52.5%);
  transform: scaleY(calc(0.05 + 0.95 * clamp(0, calc(var(--scr-on) * 2.4), 1)));
  opacity: calc(
    clamp(0, calc(var(--scr-on) * 9), 1) *
    clamp(0, calc((0.42 - var(--scr-on)) * 5), 1));
}

/* ── scanlines + the slow refresh bar ────────────────────────────────────── */
.ccc-scr__scan {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  overflow: hidden;
  opacity: calc(0.34 * var(--scr-on));
  background: repeating-linear-gradient(0deg,
    rgba(0,0,0,.20) 0 1px, rgba(0,0,0,0) 1px 3px);
}
/* The slow refresh bar. M6 (v29): it runs ONLY on the screens of the room
   that owns the page (.ccc-scr--owned, written by §9 from C2 or, without
   it, from the settled scroll), and never under the tool viewer. Everywhere
   else it is display:none — no layer, no loop. It used to run on all eight
   screens for the whole session, 7,000 px from the reader and under an open
   tool alike. */
.ccc-scr__scan::after {
  content: ""; position: absolute; inset: -60% 0;
  display: none;
  background: linear-gradient(180deg,
    rgba(0,0,0,0) 0%, rgba(178,214,255,.13) 47%, rgba(0,0,0,0) 100%);
}
.ccc-scr--owned .ccc-scr__scan::after {
  display: block;
  animation: ccc-scr-refresh 7.5s linear infinite;
}
:root.is-viewing .ccc-scr__scan::after,
:root.ccc-locked .ccc-scr__scan::after,
:root[data-motion="lite"] .ccc-scr__scan::after,
:root[data-motion="off"] .ccc-scr__scan::after { display: none; animation: none; }
@keyframes ccc-scr-refresh {
  from { transform: translate3d(0, -34%, 0); }
  to   { transform: translate3d(0,  68%, 0); }
}

/* ── glass reflection + bezel ────────────────────────────────────────────── */
.ccc-scr__sheen {
  position: absolute; inset: 0; z-index: 4; pointer-events: none;
  opacity: calc(0.35 + 0.65 * var(--scr-on));
  background:
    linear-gradient(196deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 17%, rgba(255,255,255,0) 41%),
    linear-gradient(12deg,  rgba(150,190,255,.06) 0%, rgba(255,255,255,0) 45%);
}
.ccc-scr__bezel {
  position: absolute; inset: 0; z-index: 5; pointer-events: none;
  box-shadow:
    inset 0 0 0 1px rgba(0,0,0,.62),
    inset 0 0 16px 5px rgba(0,0,0,.5),
    inset 0 1px 0 rgba(255,255,255,.05);
}

/* ── the control ─────────────────────────────────────────────────────────── */
.ccc-scr__hit {
  position: absolute; inset: 0; z-index: 6;
  -webkit-appearance: none; appearance: none;
  border: 0; margin: 0; padding: 0;
  min-block-size: 44px;
  background: rgba(0,0,0,0); color: inherit;
  cursor: pointer;
  pointer-events: auto;

  /* THE OWNERSHIP GATE. theme.css §05 declares --cut-clip on .stage: it is
     inset(-24px) — nothing clipped, focus ring included — while that room owns
     the page, and inset(50%) otherwise, which is the one declaration that makes
     an element neither painted nor hit-tested. Without it this button goes on
     swallowing taps through a stage that is at opacity 0 but still covering the
     viewport: measured at 390x844, the Pass's own chip drawer was returning
     BUTTON.ccc-scr__hit in #room-host from elementFromPoint while the Pass
     filled the screen. It is applied HERE, on the button, and not on the panel
     or the layer, because reconcileScreens() observes the PANEL and clipping an
     ancestor of an IntersectionObserver target can empty its intersection rect
     — which would tear these iframes down and rebuild them at every hand-off.
     A descendant is safe. The fallback keeps a page with no theme.css exactly
     as it was. */
  clip-path: inset(var(--cut-clip, -24px));
}
/* HOVER IS A PRE-PAINTED GLOW, FADED (v29 fix round, G3 m-11). It used to
   ease box-shadow and background-color over 250 ms — paint properties, and a
   cool blue glow at 42% that barely read — on the site's primary CTAs, while
   every other object fades a brass bloom in on opacity. The same bloom is
   painted here once, on ::before, and only its opacity moves (--m-t-2).
   Pointer-only, like the hotspots: a tap on an iPad leaves no stuck hover. */
.ccc-scr__hit::before {
  content: ""; position: absolute; inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: rgba(255,255,255,.045);
  box-shadow:
    inset 0 0 0 1px color-mix(in oklab, var(--ccc-accent-hi, #ebce93) 62%, transparent),
    0 0 0 1px color-mix(in oklab, var(--ccc-accent, #c8973f) 30%, transparent),
    0 0 22px 2px color-mix(in oklab, var(--ccc-accent, #c8973f) 46%, transparent);
  opacity: 0;
  transition: opacity var(--m-t-2, 160ms) var(--m-ease-out, cubic-bezier(.22,.61,.24,1));
}
@media (hover: hover) {
  .ccc-scr__hit:hover::before { opacity: 1; }
}
.ccc-scr__hit:focus-visible {
  outline: 2px solid var(--ccc-focus, #ebce93);
  outline-offset: 2px;
  box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--ccc-focus, #ebce93) 55%, transparent);
}
.ccc-sr-only {
  position: absolute !important; inline-size: 1px; block-size: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap; border: 0;
}

/* ══ MODE: title — THE PASS TERMINALS ═══════════════════════════════════
   A POINT-OF-SALE TERMINAL, NOT A NAME PLATE.

   The client, on the three Pass tablets: "the graphics for the screens that we
   created to overlay the screen looks kind of weak. I want the screens to light
   up and look like an actual POS system in the restaurant, just with our links
   as something we can click on the page."

   The card he was looking at was a name set on a lifted slate rectangle. It was
   lit — that part was solved earlier and is kept — but a lit rectangle with a
   word on it is a SIGN. Nobody has ever walked past a till and seen a sign. The
   difference between a sign and a terminal is not decoration, it is three
   structural things, and this layout is those three things and nothing else:

     1 · CHROME. A running application owns a strip of its own screen before it
         shows you anything: which station you are standing at, and whether it
         is talking to the back office. That is the header rail — station id on
         the left, a live pip and ONLINE on the right, hairline underneath. It
         is the single strongest "this is one screen of something bigger" cue
         available, and it costs 11% of the glass.
     2 · ONE SUBJECT. A POS shows exactly one thing at a time and shows it big:
         the order, the item, the tender. Here that is the tool's name, still
         set in the site's display face and still auto-fitted to whatever the
         glass gives it after the chrome is paid for. It remains the accessible
         name and the thing you can read across the kitchen.
     3 · A PRIMARY ACTION, PRESENTED AS A KEY. Every POS puts its commit action
         in the same place — a filled, unmissable key across the foot of the
         screen. That is the brass key: bone-on-brass, a chevron at its end,
         sized past 44px wherever the glass allows. It is what turns "a screen
         with a name on it" into "a screen you are meant to press".

   WHAT IT IS NOT. It is not a second design language. Every colour is the site's
   own — brass for the key and the pip, bone for the type, the same cool slate
   the lit panel already used. There is no second typeface: display for the
   subject, the UI face in small caps for the chrome, which is exactly how the
   rest of the site sets a label. Nothing here is a screenshot of somebody
   else's POS.

   WHAT KEEPS IT INSIDE THE PHOTOGRAPH. Unchanged, and deliberately so: the
   bezel rim, the sheen, the scanlines, the downward spill onto the counter and
   the CRT power-on all still ride --scr-on. They are what welds a rectangle
   into a plate. The panel is still CAPPED — the brightest pixel any glyph can
   land on is held near relative luminance 0.075 — because the name has to clear
   7:1 against its own panel. That cap is why the backlight radial is .06, why
   the key sits in the bottom row where no glyph of the name can reach it, and
   why the slate tops out at #364258 rather than the #46566f that looks better
   in isolation and measures 5.3:1.

   The treatment is on the MODE, not on the Pass, so any 'title' panel gets it —
   including the narrow-viewport band, where the same terminal is re-laid as a
   full-width strip: chrome across the top, subject and key side by side. */
.ccc-scr-title {
  position: absolute; inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 4% 0;
  padding: 4.5% 5.5%;
  text-align: start;
  /* the chrome unit: JS solves it from the glass, everything small is an em */
  --pos-u: var(--scr-pos-fs, 9px);
  background:
    /* the backlight. Held low and pushed above the type: this is the one layer
       that can put a bright pixel under a glyph, so it is the one layer the
       7:1 cap is spent on. */
    radial-gradient(104% 84% at 18% 6%,
      rgba(226,240,255,.06), rgba(226,240,255,0) 72%),
    /* the counter's warm bounce along the bottom edge of the glass */
    linear-gradient(0deg,
      color-mix(in oklab, var(--ccc-accent, #c8973f) 15%, transparent) 0%,
      transparent 32%),
    /* the panel */
    linear-gradient(158deg, #3d4a64 0%, #313e58 46%, #232c3e 100%);
}

/* ── 1 · the chrome rail ─────────────────────────────────────────────────── */
.ccc-scr-title__bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1em;
  min-inline-size: 0;
  font-family: var(--ccc-font-ui, system-ui, sans-serif);
  font-size: var(--pos-u);
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  line-height: 1;
  color: #cfd8e6;
  padding-block-end: .62em;
  border-block-end: 1px solid color-mix(in oklab, var(--ccc-accent, #c8973f) 40%, transparent);
  /* the rail is chrome: it fades in a touch behind the subject so the name
     stays the first thing read at distance */
  opacity: calc(0.55 + 0.45 * var(--scr-on));
}
.ccc-scr-title__term {
  min-inline-size: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ccc-scr-title__stat {
  display: flex; align-items: center; gap: .55em;
  flex: 0 0 auto;
  color: var(--ccc-accent-hi, #ebce93);
  white-space: nowrap;
}
/* the connection light. HELD LIT (v29, M6). It used to blink on a 3.4 s
   infinite loop on all three tablets — three more compositor animations that
   ran whether or not anyone was in The Pass. The owned room's refresh sweep
   already says "this screen is running"; a second loop saying it again was
   redundant, so the pip is simply on. */
.ccc-scr-title__pip {
  inline-size: .62em; block-size: .62em;
  border-radius: 50%;
  background: var(--ccc-accent-hi, #ebce93);
  box-shadow: 0 0 .5em color-mix(in oklab, var(--ccc-accent-hi, #ebce93) 70%, transparent);
}

/* ── 2 · the subject ─────────────────────────────────────────────────────── */
.ccc-scr-title__body {
  display: grid; align-content: center; justify-items: start;
  gap: .34em;
  min-block-size: 0;
  overflow: hidden;
}
.ccc-scr-title__name {
  margin: 0;
  font-family: var(--ccc-font-display, "Bodoni Moda", Didot, serif);
  font-weight: 600;
  font-size: var(--scr-title-fs, 20px);
  line-height: 1.02;
  letter-spacing: -0.018em;
  /* Near-white, not bone: this is emitted light, not printed ink. */
  color: var(--ccc-scr-ink, #fcfbf8);
  text-wrap: balance;
  /* The halo is mixed FROM currentColor on purpose. It is part of the type, so
     it vanishes with the type — which keeps the "erase the glyphs and sample
     what is underneath" contrast measurement honest instead of letting the
     glow inflate its own background. The black drop stays a fixed colour: it
     only ever lowers the ground, so it cannot flatter the number. */
  text-shadow:
    0 0 15px color-mix(in oklab, currentColor 34%, transparent),
    0 1px 2px rgba(0,0,0,.55);
}

/* ── 3 · the primary key ─────────────────────────────────────────────────── */
.ccc-scr-title__key {
  display: flex; align-items: center; justify-content: space-between;
  gap: .8em;
  padding: .70em .9em .66em;
  border-radius: calc(var(--pos-u) * 0.34);
  background: linear-gradient(180deg,
    var(--ccc-accent-hi, #ebce93) 0%,
    var(--ccc-accent, #c8973f) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.55),
    inset 0 0 0 1px color-mix(in oklab, var(--ccc-accent-hi, #ebce93) 70%, transparent),
    0 2px 0 color-mix(in oklab, #000 42%, transparent);
  /* it comes up with the terminal rather than being painted on a dead screen */
  opacity: calc(0.18 + 0.82 * var(--scr-on));
}
.ccc-scr-title__cta {
  margin: 0;
  font-family: var(--ccc-font-ui, system-ui, sans-serif);
  font-size: calc(var(--pos-u) * 1.06);
  font-weight: 800;
  letter-spacing: .155em;
  text-transform: uppercase;
  line-height: 1;
  /* ink on brass — the highest-contrast pair the site owns */
  color: var(--ccc-accent-ink, #05070a);
  min-inline-size: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ccc-scr-title__chev {
  flex: 0 0 auto;
  font-family: var(--ccc-font-ui, system-ui, sans-serif);
  font-size: calc(var(--pos-u) * 1.85);
  font-weight: 700;
  line-height: 1;
  color: var(--ccc-accent-ink, #05070a);
  opacity: .82;
}

/* The hovered / focused terminal presses its own key, the way a real one lights
   the button under your finger. It has to be :has() on the panel: the key
   lives inside .ccc-scr__glass, which comes BEFORE the button in the DOM, so no
   sibling combinator can reach it. Where :has() is missing the key simply does
   not press — the panel's own :hover / :focus-visible states are untouched and
   the focus ring is unaffected. Transform + filter only, per the perf contract. */
.ccc-scr-title__key {
  transition: transform .22s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1));
}
.ccc-scr--title:has(.ccc-scr__hit:is(:hover, :focus-visible)) .ccc-scr-title__key {
  transform: translate(0, 1px);
}
/* The key brightens under the finger by a pre-painted plate faded on opacity
   (was filter: brightness(1.09) eased over 220 ms — a paint property, G3
   m-11). The label and chevron sit above the plate (position: relative), so
   the ink type is not washed. */
.ccc-scr-title__key::before {
  content: ""; position: absolute; inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.06));
  opacity: 0;
  transition: opacity var(--m-t-2, 160ms) var(--m-ease-out, cubic-bezier(.22,.61,.24,1));
}
.ccc-scr-title__cta, .ccc-scr-title__chev { position: relative; }
.ccc-scr--title:has(.ccc-scr__hit:focus-visible) .ccc-scr-title__key::before { opacity: 1; }
@media (hover: hover) {
  .ccc-scr--title:has(.ccc-scr__hit:hover) .ccc-scr-title__key::before { opacity: 1; }
}
/* v29 · S6 · the shared press (theme.css §16): the key goes down under a
   finger, .98 in 90 ms, and comes back on the press ease. */
.ccc-scr--title:has(.ccc-scr__hit:active) .ccc-scr-title__key {
  transform: translate(0, 1px) scale(var(--m-press, .98));
  transition-duration: var(--m-t-1, 90ms);
}

/* v29 · S6 · M6 — THE KEY CATCHES THE LIGHT.
   A bar of light crosses each "Tap to open" key, and because the three
   terminals start 300 ms apart (data-station, written from the station
   number in makeTitle) it travels across the Pass left to right: ~300 ms on
   each key, then stillness, on a 7 s cycle. It is a transform + opacity
   on one pre-painted pseudo-element per key — compositor work — and it runs
   only on the terminals of the room that owns the page, in the full tier,
   with no tool open. Everywhere else it is display:none: no layer, no loop.
   Lite, off, reduced motion and the phone band never draw it.

   NO CLIP (v29 fix round, G1 D3). The bar used to start and end OUTSIDE the
   key, hidden by overflow:hidden on the rounded key — and a rounded clip
   around an animated composited layer costs the compositor a mask pass per
   key: 8.1-8.9 render passes per frame at The Pass, 2.0-2.2 without the clip,
   on every frame a rep stands there. Now the bar never leaves the key: its
   lit band is the middle 28% of a key-sized box, travelling from -36% to
   +36% so the band runs from the key's left edge to its right edge, and it
   fades in over the first sixth of the run and out over the last. The same
   bar crossing the same key at the same pace, with nothing to clip. */
.ccc-scr-title__key { position: relative; }
.ccc-scr-title__key::after {
  content: "";
  position: absolute; inset: 0;
  pointer-events: none;
  display: none;
  background: linear-gradient(105deg,
    rgba(255,255,255,0) 36%, rgba(255,255,255,.46) 48%,
    rgba(255,250,236,.16) 55%, rgba(255,255,255,0) 64%);
  opacity: 0;
  transform: translate(-36%, 0);
}
:root[data-motion="full"] .ccc-scr--owned .ccc-scr-title__key::after {
  display: block;
  animation: ccc-scr-key-sheen 7s var(--m-ease-inout, cubic-bezier(.65,0,.35,1)) infinite;
}
/* an attribute, not a custom property: a custom property declared on the key
   would be re-created whenever the key is restyled and drag its subtree along
   (theme.css §09b's note on the stagger) */
.ccc-scr-title__key[data-station="2"]::after { animation-delay: 300ms; }
.ccc-scr-title__key[data-station="3"]::after { animation-delay: 600ms; }
.ccc-scr-title__key[data-station="4"]::after { animation-delay: 900ms; }
:root.is-viewing .ccc-scr-title__key::after,
:root.ccc-locked .ccc-scr-title__key::after { display: none; animation: none; }
/* 315 ms on the key (4.5% of 7 s): the old bar spent 900 ms travelling but
   was over the key for only ~200 ms of it, so this keeps its tempo. */
@keyframes ccc-scr-key-sheen {
  0%         { transform: translate(-36%, 0); opacity: 0; }
  0.7%       { opacity: 1; }
  3.8%       { opacity: 1; }
  4.5%, 100% { transform: translate(36%, 0); opacity: 0; }
}
/* One "this screen is live" signal per terminal: on the Pass it is the key's
   sheen, so the slow refresh bar stands down on the title panels (the TVs in
   the other rooms keep theirs). Three fewer loops in the room with the most. */
.ccc-scr--title .ccc-scr__scan::after,
.ccc-scr--owned.ccc-scr--title .ccc-scr__scan::after { display: none; animation: none; }

/* ── the panel chrome, re-weighted for a screen that is ON ────────────────
   Everything below overrides a shared rule further up this sheet. Each one is
   here because the default was tuned for black glass and reads wrong on a lit
   panel — not because the effect is unwanted. */

/* THE SPILL. 'inset' is asymmetric: more room below the glass than above it,
   because the counter is below and that is where the light actually lands.
   Pre-painted like the shared glow above (v29): the blur(15px) that softened
   these two gradients is now an eased tail on each of them, so the spill
   costs no render pass. The lower one's 76% x 64% ellipse centred at 64%
   meets the box's bottom edge at 56% of its radius — the blur and the 46%
   corner radius used to hide that edge — so it now reaches transparent by 54%
   and never draws one. */
.ccc-scr--title .ccc-scr__glow {
  inset: -24% -19% -38% -19%;
  background:
    radial-gradient(48% 42% at 50% 40%,
      rgba(206,230,255,.46) 0%,
      rgba(206,230,255,.24) 30%,
      rgba(206,230,255,.08) 54%,
      rgba(206,230,255,0) 74%),
    radial-gradient(76% 64% at 50% 64%,
      rgba(146,186,255,.26) 0%,
      rgba(146,186,255,.14) 24%,
      rgba(120,158,255,.05) 40%,
      rgba(120,158,255,0) 54%);
  opacity: calc(var(--scr-on) * (0.40 + 0.46 * var(--bloom, 0)));
}

/* A bright screen mirrors much less of the room than a dead one. At full
   strength the shared sheen put ~.12 white across the top of the glass, which
   on its own cost the name 2 points of contrast. */
.ccc-scr--title .ccc-scr__sheen {
  opacity: calc(0.30 - 0.10 * var(--scr-on));
}

/* Scanlines are texture, not shading. Halved so they read as structure on a
   lit panel instead of greying it back down. */
.ccc-scr--title .ccc-scr__scan {
  opacity: calc(0.17 * var(--scr-on));
}

/* The bezel keeps its dark outer line — that is the edge that sits the panel
   in the photograph — but the 16px inner vignette that used to swallow the
   corners is cut back, and a cool hairline just inside it reads as the glass
   edge catching the backlight. */
.ccc-scr--title .ccc-scr__bezel {
  box-shadow:
    inset 0 0 0 1px rgba(0,0,0,.68),
    inset 0 0 0 2px rgba(206,230,255,.26),
    inset 0 0 20px 2px rgba(0,0,0,.24),
    inset 0 1px 0 rgba(226,240,255,.20);
}

/* ── the narrow band: the same terminal, re-laid as a strip ──────────────── */
.ccc-scr--narrow.ccc-scr--title .ccc-scr-title {
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto minmax(0, 1fr);
  align-items: center;
  gap: 3% 4%;
  padding: 4% 4.5%;
}
.ccc-scr--narrow.ccc-scr--title .ccc-scr-title {
  /* THE COUNTER BOUNCE COMES OFF IN THE BAND. On a tablet standing on the
     Pass it is the strongest "this screen is on, in this room" cue there is —
     the steel throws warm light back up at the bottom of the glass. In the
     narrow band there is no counter, the strip is a fifth of the height, and
     that same gradient therefore reaches much further up the panel: measured
     at 390x844 it put a brass wash under the name and took its contrast from
     7.9:1 to 5.9:1. Nothing else about the terminal changes. */
  background:
    radial-gradient(104% 84% at 18% 6%,
      rgba(226,240,255,.06), rgba(226,240,255,0) 72%),
    linear-gradient(158deg, #3d4a64 0%, #313e58 46%, #232c3e 100%);
}
.ccc-scr--narrow.ccc-scr--title .ccc-scr-title__bar { grid-column: 1 / -1; }
.ccc-scr--narrow.ccc-scr--title .ccc-scr-title__body { align-content: center; }
.ccc-scr--narrow.ccc-scr--title .ccc-scr-title__key {
  /* the strip is short; the key becomes a right-hand pill, still past 44px */
  align-self: center;
  min-block-size: 44px;
  padding-inline: 1.05em;
}


/* ══ MODE: image ═════════════════════════════════════════════════════════ */
.ccc-scr-art { position: absolute; inset: 0; overflow: hidden; }
/* THE BACKDROP IS A 24 x 17 THUMBNAIL, NOT A SECOND COPY OF THE CARD (v29).
   It was a second <img> of the same 2000 x 1429 JPEG at 116% under
   filter: blur(22px) saturate(1.15) brightness(.62): a second decode (at
   1000 x 715 on an iPad, measured, beside the card's own 500 x 358) and a
   blur pass, to paint two slivers of ambient colour either side of the card.
   makeImage() now decodes the card's bytes off the main thread straight to
   24 x 17, once per new card, pre-darkened, and the browser's own bilinear
   upscale does the blurring. No filter, no second bitmap. */
.ccc-scr-art__bg {
  position: absolute; inset: -8%;
  inline-size: 116%; block-size: 116%;
  object-fit: cover;
  opacity: .85;
}
.ccc-scr-art__fg {
  position: absolute; inset: 0;
  inline-size: 100%; block-size: 100%;
  object-fit: contain;
  object-position: 50% 50%;
}
.ccc-scr-art img { display: block; }

/* ══ MODE: live ══════════════════════════════════════════════════════════ */
.ccc-scr__frame {
  position: absolute; top: 0; left: 0;
  border: 0; display: block;
  transform-origin: top left;
  background: #0b0b0d;
  opacity: 0;
  transition: opacity .6s ease;
  pointer-events: none;
}
.ccc-scr.is-live .ccc-scr__frame { opacity: 1; }
/* OUT OF RENDERING, STILL MOUNTED (v29). While a tool is up, or once the
   board's room has handed the page on, an arrived board's frame is
   display:none until it is woken or unmounted. MEASURED in Chromium with the
   frames in-process (the iPad model), 5 s windows, the board's own rAF count
   and the renderer main thread:
                           Win the Weekend          Daily Sales Report
     on screen             14 rAF/s   18 ms/s       81 rAF/s  102 ms/s
     under an opaque cover 16         20            75        101
     opacity: 0            71         82            72        106
     visibility: hidden    68         38            71         69
     display: none          0          0.1           0          4.6
     parent content-visibility:hidden   0 / 0.1       0 / 1.5
   Covering it (the viewer's scrim) saves nothing, and neither does opacity or
   visibility. display:none stops it outright, keeps the document, fires no
   resize at it (its viewport stays 1561x880 / 1920x1080) and works in every
   engine this site supports; content-visibility would too but is Safari 18+. */
.ccc-scr-live.is-suspended .ccc-scr__frame { display: none; }

/* ── THE HOLDING CARD AS A LID, NOT AS AN ALTERNATIVE ─────────────────────
   THE DEFECT. On a 393x852 phone the Break Room's Daily Sales Report panel
   showed the DECK'S OWN loading screen at full panel size: a white rectangle
   with a spinner reading "Loading Sales Report..." in the middle of a dark
   restaurant. The Dining Room's Big South board did the same. The branded
   card that exists for exactly this — holdingCard(), "Tap to open this board
   full screen." — was never on screen, and it is worth being precise about
   why, because the mechanism reads as if it should have been:

     · hold() covers the boards that are RATIONED. MAX_LIVE_FRAMES is 1 on a
       phone, so two of the three live boards get the card and look right. The
       one that WINS the frame went straight to mount(), which did
       node.replaceChildren(frame) — the card was not replaced by the deck,
       it was replaced by an EMPTY iframe.
     · the frame was then held at opacity 0 until is-live, which was added on
       the iframe's load event. But load fires when the deck's own document
       and subresources are done — BEFORE it has fetched a 1.15 MB workbook
       from raw.githubusercontent.com and rendered a slide from it. Its
       #loading overlay (position:fixed, inset:0, a near-white gradient) is
       still up, and that is what faded in.

   So the card was never wrong; it was simply not in the DOM at the one moment
   it was needed. It now stays there, ON TOP of the frame, and is faded off
   only once the deck has had time to paint — see LIVE_REVEAL_MS. Two
   absolutely-positioned children of a box that already exists: no new layer
   while it is opaque, nothing animating but one opacity, and it is removed
   from the DOM when it is done. */
.ccc-scr-holding--cover {
  z-index: 3;
  opacity: 1;
  transition: opacity .55s ease;
}
.ccc-scr-holding--cover.is-gone { opacity: 0; pointer-events: none; }

/* ══ MODE: feed — the Back Office board ══════════════════════════════════ */
.ccc-scr-feed {
  position: absolute; inset: 0;
  font-size: var(--scr-u, 16px);   /* every size below is in em of this */
  background:
    radial-gradient(130% 90% at 82% 4%,
      color-mix(in oklab, var(--ccc-accent, #c8973f) 13%, transparent), transparent 58%),
    linear-gradient(162deg, #0d1219 0%, #05080d 58%, #0a0e15 100%);
}
.ccc-scr-feed__stage { position: absolute; inset: 0; }
.ccc-scr-feed__slide {
  position: absolute; inset: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: .5em;
  padding: .85em 1em .7em;
  min-block-size: 0;
  opacity: 0;
  /* 2D, on every breakpoint (v29) — see the phone block at the foot of this
     sheet for the measurement that first moved it off translate3d. */
  transform: translate(0, .45em);
  transition: opacity .62s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1)),
              transform .62s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1));
  pointer-events: none;
}
.ccc-scr-feed__slide.is-current { opacity: 1; transform: none; }

.ccc-scr-feed__head {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: .2em .8em;
  border-block-end: 1px solid color-mix(in oklab, var(--ccc-accent, #c8973f) 34%, transparent);
  padding-block-end: .38em;
}
.ccc-scr-feed__eyebrow {
  grid-column: 1 / -1;
  margin: 0;
  font-size: .62em; font-weight: 700;
  letter-spacing: .2em; text-transform: uppercase;
  color: var(--ccc-accent-hi, #ebce93);
}
.ccc-scr-feed__district {
  margin: 0;
  font-family: var(--ccc-font-display, "Bodoni Moda", Didot, serif);
  font-weight: 600;
  font-size: 1.72em;
  line-height: 1;
  letter-spacing: -0.02em;
  color: #f6f2ea;
}
.ccc-scr-feed__goal {
  margin: 0;
  font-size: .64em; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase;
  color: #a9a094;
  white-space: nowrap;
}

.ccc-scr-feed__grid {
  display: grid;
  grid-template-columns: repeat(var(--scr-cols, 3), minmax(0, 1fr));
  /* minmax(0,1fr) is load-bearing: plain 1fr has an auto MINIMUM, so a third
     row of tiles pushes the footer off the glass instead of sharing the space
     the slide actually has. */
  grid-auto-rows: minmax(0, 1fr);
  gap: .5em;
  min-block-size: 0;
  overflow: hidden;
}
.ccc-scr-feed__store {
  position: relative;
  display: grid;
  grid-auto-rows: auto;
  align-content: center;
  justify-items: center;
  gap: .1em;
  padding: .3em .35em .4em;
  border-radius: 3px;
  background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.07);
  min-inline-size: 0; min-block-size: 0;
  overflow: hidden;
}
.ccc-scr-feed__days {
  display: block;
  font-family: var(--ccc-font-display, "Bodoni Moda", Didot, serif);
  font-weight: 600;
  /* JS writes --scr-num from the row count: the numeral is as big as the board
     can carry and no bigger. */
  font-size: calc(var(--scr-num, 3.05) * 1em);
  line-height: .88;
  letter-spacing: -0.035em;
  color: #f7f3ec;
  font-variant-numeric: tabular-nums lining-nums;
}
.ccc-scr-feed__unit {
  font-size: .54em; font-weight: 700;
  letter-spacing: .18em; text-transform: uppercase;
  color: #8f877c;
}
.ccc-scr-feed__name {
  max-inline-size: 100%;
  font-size: .78em; font-weight: 600;
  letter-spacing: .012em;
  color: #ded6c9;
  text-align: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ccc-scr-feed__meter {
  position: relative;
  inline-size: 76%; block-size: 2px;
  margin-block-start: .3em;
  border-radius: 2px;
  background: rgba(255,255,255,.12);
  overflow: hidden;
}
.ccc-scr-feed__meter i {
  position: absolute; inset-block: 0; inset-inline-start: 0;
  inline-size: 100%;
  transform-origin: 0 50%;
  transform: scaleX(var(--fill, 0));
  background: linear-gradient(90deg,
    color-mix(in oklab, var(--ccc-accent, #c8973f) 62%, transparent),
    var(--ccc-accent-hi, #ebce93));
}
.ccc-scr-feed__flag {
  position: absolute; inset-block-start: .25em; inset-inline-end: .3em;
  font-size: .46em; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase;
  color: var(--ccc-accent-ink, #05070a);
  background: var(--ccc-accent-hi, #ebce93);
  padding: .18em .4em;
  border-radius: 2px;
}
/* goal met — the whole tile lights */
.ccc-scr-feed__store.is-goal {
  background: linear-gradient(180deg,
    color-mix(in oklab, var(--ccc-accent, #c8973f) 30%, transparent),
    color-mix(in oklab, var(--ccc-accent, #c8973f) 8%, transparent));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ccc-accent, #c8973f) 62%, transparent);
}
.ccc-scr-feed__store.is-goal .ccc-scr-feed__days { color: var(--ccc-accent-hi, #ebce93); }
.ccc-scr-feed__store.is-record .ccc-scr-feed__days { color: var(--ccc-accent-hi, #ebce93); }
.ccc-scr-feed__store.is-dark .ccc-scr-feed__days { color: #5d5850; }
.ccc-scr-feed__store.is-dark .ccc-scr-feed__unit { color: #5d5850; }

.ccc-scr-feed__foot {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: .6em;
  font-size: .6em; font-weight: 600;
  letter-spacing: .09em; text-transform: uppercase;
  color: #857d72;
}
/* keyed to a class, not '> :last-child' (universal bucket, theme.css §03) */
.ccc-scr-feed__stamp { text-align: end; }

/* STALE — the board is showing the last good data because the feed is not
   answering. loadStreaks() resolves to cached data on failure on purpose
   ("stale beats blank"), and this is the half that was missing: the age has to
   be legible from across a break room, not inferable from a date. Amber rather
   than red — the numbers are still the last true numbers, they are just not
   today's — and the tiles are dimmed so the big figures stop reading as live.
   Contrast: #e0a341 on the panel ground is 7.1:1. */
.ccc-scr-feed__stale { color: #e0a341; }
.ccc-scr-feed__slide.is-stale .ccc-scr-feed__grid { opacity: .72; }
.ccc-scr-feed__slide.is-stale .ccc-scr-feed__eyebrow::after {
  content: " · holding";
  color: #e0a341;
}
.ccc-scr-feed__dots { display: flex; gap: .5em; justify-content: center; }
.ccc-scr-feed__dots span {
  inline-size: .5em; block-size: .5em; border-radius: 50%;
  background: rgba(255,255,255,.22);
  transition: background-color .4s ease, transform .4s ease;
}
.ccc-scr-feed__dots span.is-current {
  background: var(--ccc-accent-hi, #ebce93);
  transform: scale(1.35);
}

/* ══ MODE: report — THE BREAK-ROOM TELEVISION ════════════════════════════
   THE DAILY SALES REPORT, COMPOSED. NOT IFRAMED.

   The client: "above the head chef of the week photos, I would like to have
   another tv mounted on the wall that scrolls through the daily sales report
   (all slides)… I want the tv to be the correct size and the scrolling
   information to be the correct size."

   ⚠ WHY THIS MODE EXISTS — the arithmetic that killed 'live' on this wall.

   The break-room television is 18.4% of the plate's width (rooms.js, traced
   off the glass and not to be moved). Measured on the shipped page, the
   panel's LAYOUT box comes out

       1024 viewport   253 x 143 CSS px
       1440            297 x 167
       1920            356 x 201
       2560            475 x 268

   (the ON-SCREEN box is ~1.10x each of those again, because .hotspots carries
   --plate-scale * --overscan-k; the layout box is the smaller, safer number
   and is the one every figure in this block is quoted against).

   The Daily Sales Report is a FIXED 1920x1080 canvas that scales ITSELF by
   Math.min(innerWidth/1920, innerHeight/1080). Inside an iframe its type
   therefore lands at panelWidth/1920 of its authored size WHATEVER virtual
   viewport we hand it — the one lever the two Dining boards still have (a
   SHORTER virtual viewport, because those decks are fluid and their scale is
   panelW / (H * aspect)) does nothing at all here. At 297px of glass the
   factor is 0.155: the deck's
   28-42px store names arrive at 4.3-6.5 CSS px and its 16px table rows at
   2.5. Putting a 12px floor under the deck's smallest type needs a
   television ~75% of the plate wide. Re-shooting the room does not rescue it
   either — at 45% of plate width the store names still only reach 7.2px.

   So this panel stops being a PICTURE of the deck and becomes the deck's
   DATA, composed for a 297px screen: the same lever 'feed' already pulls for
   the Back Office, reading the same three files the deck reads.

   THE TYPE SCALE, AND WHY IT IS A CONTAINER QUERY.
   Every size on this board is a multiple of ONE unit:

       --rpt-u: max(11.2px, 3.8cqw)

   3.8% of the panel's own width, floored at 11.2px. The percentage is what
   makes the board hold its proportions from 253px of glass to 475px and into
   the narrow band with one set of numbers instead of four; the floor is what
   stops the 1024 viewport — the only width where this panel falls below
   295px — from taking the smallest label under the readability line.
   Measured computed font-size, smallest text anywhere on the board:

       1024  11.20px        1920  13.53px
       1440  11.29px        2560  18.05px

   and every card's primary subject (store name, rank, headline number) is
   1.62em of the unit — 18.1 / 18.3 / 21.9 / 29.2px. Nothing on the glass is
   smaller than the unit itself, so the unit IS the floor.

   The first --rpt-u declaration is the fallback for an engine with no
   container queries: --scr-w is the plane's measured width, which §8 writes
   on every layout anyway, so the board comes out the same size either way.

   HOW MANY ROWS is the one thing a percentage cannot decide, because it
   depends on the panel's height IN UNITS — and at 1024 the floored unit
   makes the box relatively shorter (12.8 units tall against 14.8 everywhere
   else). JS solves it in reportRows(), exactly as makeFeed() solves its
   column count from the measured glass.

   WHAT IT IS NOT. It is not the Back Office board. The office runs
   district-by-district "days since last detractor" over every store; this is
   the SALES cut — profit-goal tracking, yesterday's conversion, national
   standings — and where it touches the streak feed at all it takes a
   different slice of it (one market-wide leaderboard, top N only). */
.ccc-scr-rpt {
  position: absolute; inset: 0;
  /* THE QUERY CONTAINER IS THE PANEL — and the unit is declared one level IN.
     A container query unit resolves against the nearest ANCESTOR container, so
     '3.8cqw' written here would have measured the next container out (in
     practice the viewport: 54.7px at a 1440 window, measured). --rpt-u is
     therefore declared on __stage, which is inside this box. */
  container-type: size;
  container-name: ccc-rpt;
  background:
    radial-gradient(128% 92% at 84% 2%,
      color-mix(in oklab, var(--ccc-accent, #c8973f) 14%, transparent), transparent 56%),
    linear-gradient(163deg, #0d1219 0%, #05080d 60%, #0a0e15 100%);
}
.ccc-scr-rpt__stage {
  position: absolute; inset: 0;

  /* fallback first (no container queries), preferred second */
  --rpt-u: max(11.2px, calc(var(--scr-w, 300) * 0.038px));
  --rpt-u: max(11.2px, 3.8cqw);

  font-size: var(--rpt-u);
  line-height: 1.06;
  font-variant-numeric: tabular-nums lining-nums;
}

.ccc-scr-rpt__slide {
  position: absolute; inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  /* THE SAME minmax(0,1fr) LESSON, one level up and load-bearing twice over.
     Without an explicit column the slide gets ONE implicit column of 'auto',
     whose minimum is max-content — so the header rail's nowrap kicker sized
     the whole card and every row inherited that width: measured, the streak
     card laid out 418px wide inside 326px of glass and its store names never
     reached their own ellipsis. Pinning the column to the card is what makes
     'overflow:hidden; text-overflow:ellipsis' mean anything below. */
  grid-template-columns: minmax(0, 1fr);
  gap: .42em;
  padding: .72em .8em .5em;
  min-block-size: 0;
  opacity: 0;
  transform: translate(0, .4em);     /* 2D everywhere (v29), see the phone block */
  transition: opacity .55s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1)),
              transform .55s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1));
  pointer-events: none;              /* the hit button above owns every tap */
}
.ccc-scr-rpt__slide.is-current { opacity: 1; transform: none; }
/* v29 final (verifier V2 m2): the lite tier cross-fades slides on opacity only —
   two animations per change instead of four, inside lite's budget of 2. */
html[data-motion="lite"] .ccc-scr-feed__slide,
html[data-motion="lite"] .ccc-scr-rpt__slide {
  transform: none;
  transition: opacity .62s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1));
}
/* the promo card is a photograph: it goes edge to edge, no chrome, no padding */
.ccc-scr-rpt__slide.is-art { padding: 0; grid-template-rows: minmax(0, 1fr); }

/* ── the header rail ─────────────────────────────────────────────────────── */
.ccc-scr-rpt__head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: .8em;
  padding-block-end: .34em;
  border-block-end: 1px solid color-mix(in oklab, var(--ccc-accent, #c8973f) 34%, transparent);
}
.ccc-scr-rpt__kick {
  min-inline-size: 0;
  font-size: 1.15em; font-weight: 700;
  letter-spacing: .085em; text-transform: uppercase;
  color: var(--ccc-accent-hi, #ebce93);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ccc-scr-rpt__meta {
  flex: 0 0 auto;
  font-size: 1em; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase;
  color: #8f877c;
  white-space: nowrap;
}

/* ── the body ────────────────────────────────────────────────────────────── */
.ccc-scr-rpt__body {
  display: grid;
  /* minmax(0,1fr), for the same reason the feed's grid carries it one block
     up: a bare implicit column is 'auto', whose MINIMUM is max-content — so a
     long store name refuses to shrink, the row stops honouring its own
     overflow:hidden and the card lays out 389px wide inside 297px of glass
     (measured, streak card, 1440). This pins the column to the card. */
  grid-template-columns: minmax(0, 1fr);
  /* CENTRED, not top-aligned. Balanced pagination means a set's pages are
     often one row short of full (9 regions over a 4-row card is 3+3+3), and a
     three-row card hard against the header rule with an empty row of space
     under it reads as a card that failed to finish loading. Centred, it reads
     as a card with three things on it. A full card is unaffected. */
  align-content: center;
  gap: .34em;
  min-block-size: 0;
  overflow: hidden;                 /* a row too many is clipped, never scrolls */
}

/* ── a data row: the goal meter is the row's own ground ──────────────────── */
.ccc-scr-rpt__row {
  position: relative;
  display: flex; align-items: baseline;
  gap: .5em;
  padding: .22em .45em;
  border-radius: 3px;
  background: rgba(255,255,255,.045);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
  min-inline-size: 0;
  overflow: hidden;
}
/* The meter is BEHIND the type rather than a bar under it. At this size a 2px
   bar plus its own row of leading costs a whole extra store on the card, and
   a filled ground reads further across a break room than a hairline does. */
.ccc-scr-rpt__fill {
  position: absolute; inset: 0;
  transform-origin: 0 50%;
  transform: scaleX(var(--fill, 0));
  background: linear-gradient(90deg,
    color-mix(in oklab, var(--ccc-accent, #c8973f) 40%, transparent),
    color-mix(in oklab, var(--ccc-accent, #c8973f) 14%, transparent));
  pointer-events: none;
}
/* keyed to the four text classes rptRow() makes, not '> :not(__fill)' */
.ccc-scr-rpt__rank, .ccc-scr-rpt__name,
.ccc-scr-rpt__sub, .ccc-scr-rpt__val { position: relative; z-index: 1; }

.ccc-scr-rpt__rank {
  flex: 0 0 auto;
  font-size: 1.62em; font-weight: 700;
  letter-spacing: -.02em;
  color: #b9b1a4;
}
.ccc-scr-rpt__row.is-podium .ccc-scr-rpt__rank { color: var(--ccc-accent-hi, #ebce93); }
.ccc-scr-rpt__name {
  flex: 1 1 auto; min-inline-size: 0;
  font-size: 1.62em; font-weight: 600;
  letter-spacing: .004em;
  color: #f7f3ec;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ccc-scr-rpt__sub {
  flex: 0 0 auto;
  font-size: 1.24em; font-weight: 600;
  color: #a49b8e;
  white-space: nowrap;
}
.ccc-scr-rpt__val {
  flex: 0 0 auto;
  font-size: 1.62em; font-weight: 700;
  letter-spacing: -.02em;
  color: #f0e8da;
  white-space: nowrap;
}
.ccc-scr-rpt__row.is-hit  .ccc-scr-rpt__val { color: var(--ccc-accent-hi, #ebce93); }
.ccc-scr-rpt__row.is-miss .ccc-scr-rpt__val { color: #c98f6f; }
/* the market/district total, in the deck's own idiom */
.ccc-scr-rpt__row.is-total {
  background: rgba(255,255,255,.10);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ccc-accent, #c8973f) 44%, transparent);
}
.ccc-scr-rpt__row.is-total .ccc-scr-rpt__name {
  font-size: 1.24em; letter-spacing: .12em; text-transform: uppercase; color: #cfc6b7;
}
.ccc-scr-rpt__row.is-mine .ccc-scr-rpt__name { color: var(--ccc-accent-hi, #ebce93); }

/* ── the hero card ───────────────────────────────────────────────────────── */
.ccc-scr-rpt__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);   /* see the slide, above */
  align-content: center; justify-items: start;
  gap: .12em;
  min-block-size: 0;
}
.ccc-scr-rpt__num {
  font-family: var(--ccc-font-display, "Bodoni Moda", Didot, serif);
  font-weight: 600;
  font-size: 3.1em;
  line-height: .92;
  letter-spacing: -.03em;
  color: #f7f3ec;
}
.ccc-scr-rpt__cap {
  font-size: 1em; font-weight: 700;
  letter-spacing: .14em; text-transform: uppercase;
  color: #8f877c;
}
.ccc-scr-rpt__line {
  max-inline-size: 100%;
  font-size: 1.24em; font-weight: 600;
  color: #ded6c9;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ── the promo card, borrowed whole from 'image' ─────────────────────────── */
.ccc-scr-rpt__slide.is-art .ccc-scr-art { position: absolute; inset: 0; }

/* ── the slide clock ─────────────────────────────────────────────────────
   The Back Office board can afford a row of dots because it has five slides.
   This one has fourteen or more, and fourteen dots at 11px is a grey smear —
   so the "it is still running" cue is a 2px hairline that empties over one
   slide. It costs two pixels of a 167px-tall panel and it is the single thing
   that says TELEVISION rather than POSTER. */
.ccc-scr-rpt__tick {
  position: absolute; inset-inline: 0; inset-block-end: 0;
  block-size: 2px;
  overflow: hidden;
  background: rgba(255,255,255,.10);
  z-index: 2;
}
.ccc-scr-rpt__tick i {
  position: absolute; inset: 0;
  transform-origin: 0 50%;
  transform: scaleX(0);
  background: linear-gradient(90deg,
    color-mix(in oklab, var(--ccc-accent, #c8973f) 70%, transparent),
    var(--ccc-accent-hi, #ebce93));
}
.ccc-scr-rpt__slide.is-current .ccc-scr-rpt__tick i {
  animation: ccc-rpt-tick var(--rpt-slide, 10s) linear forwards;
}
@keyframes ccc-rpt-tick {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* ══ the calm holding card — every mode's failure state ══════════════════ */
.ccc-scr-holding {
  position: absolute; inset: 0;
  display: grid; align-content: center; justify-items: center;
  gap: .6em;
  padding: 8%;
  text-align: center;
  font-size: var(--scr-u, 16px);
  background:
    radial-gradient(120% 100% at 50% 0%,
      color-mix(in oklab, var(--ccc-accent, #c8973f) 10%, transparent), transparent 60%),
    linear-gradient(160deg, #0c1017 0%, #06080d 100%);
}
.ccc-scr-holding__mark {
  font-family: var(--ccc-font-ui, system-ui, sans-serif);
  font-size: .62em; font-weight: 700;
  letter-spacing: .26em; text-transform: uppercase;
  color: var(--ccc-accent, #c8973f);
}
.ccc-scr-holding__title {
  margin: 0;
  font-family: var(--ccc-font-display, "Bodoni Moda", Didot, serif);
  font-weight: 600; font-size: 1.5em; line-height: 1.05;
  color: #f2ece2;
}
.ccc-scr-holding__note {
  margin: 0;
  font-size: .72em; line-height: 1.4;
  color: #9d958a;
  max-inline-size: 26ch;
}

/* ══ the narrow band ═════════════════════════════════════════════════════ */
.ccc-scr-layer {
  position: absolute;
  z-index: 12;
  inset-inline: 0;
  inset-block-start: calc(var(--topbar-h, 60px) + var(--sp-3, .75rem));
  display: grid;
  justify-items: center;
  align-content: start;
  gap: var(--scr-gap, .75rem);
  padding-inline: var(--gut, 1.25rem);
  pointer-events: none;

  --scr-gap: var(--sp-3, .75rem);
  --scr-band-h: min(52svh, 560px);
  --scr-max-h: calc(
    (var(--scr-band-h) - (var(--scr-count, 1) - 1) * var(--scr-gap)) / var(--scr-count, 1));

  /* The same window .rail and .hotspots use, and now genuinely the same value:
     theme.css §05 declares --cut on .stage, which is this layer's parent, so
     the band, the chips and the objects change hands on one number instead of
     three copies of it. The fallback is 1 — a page with no theme.css still
     shows its panels. */
  opacity: var(--cut, 1);
}
.ccc-scr-layer:empty { display: none; }

.ccc-scr--narrow {
  position: relative;
  inset: auto;
  inline-size: min(100%, calc(var(--scr-max-h, 40svh) * var(--scr-ar, 1.7778)));
  block-size: auto;
  aspect-ratio: var(--scr-ar, 1.7778);
  border-radius: 3px;
  /* A box-shadow, not filter: drop-shadow() (v29). The panel is an opaque
     rounded rectangle, so the two draw the same shadow — but the filter was an
     offscreen pass re-rendered every time a slide turned inside the panel,
     on the iPad-portrait band that shows these panels all day. */
  box-shadow: 0 14px 34px rgba(0,0,0,.55);
}
.ccc-scr--narrow .ccc-scr__plane { inset: 0; transform: none; }
.ccc-scr--narrow .ccc-scr__glow { inset: -14%; }

/* THE CAPTION RAIL. Only the narrow band has one, and a title card never does
   — it already IS its own caption.

   It is a RAIL, not an overlay. An overlay bar sat on top of the bottom eighth
   of the promo card and the bottom row of the streak board, which on the one
   presentation that exists to be readable is the worst place to put anything.
   So the glass and every layer that dresses it stop short of it. */
.ccc-scr__cap { display: none; }
.ccc-scr--narrow .ccc-scr__plane { --scr-cap-h: calc(var(--scr-u, 12px) * 2); }
.ccc-scr--narrow .ccc-scr__glass, .ccc-scr--narrow .ccc-scr__scan,
.ccc-scr--narrow .ccc-scr__crt, .ccc-scr--narrow .ccc-scr__sheen,
.ccc-scr--narrow .ccc-scr__bezel {
  inset-block-end: var(--scr-cap-h);
}
.ccc-scr--narrow .ccc-scr__cap {
  position: absolute;
  inset-block-end: 0; inset-inline: 0;
  block-size: var(--scr-cap-h);
  z-index: 7;
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem;
  padding-inline: .55rem;
  font-family: var(--ccc-font-ui, system-ui, sans-serif);
  font-size: calc(var(--scr-u, 12px) * 0.86);
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: #e8e1d5;
  background: linear-gradient(180deg, #0c1119, #070a0f);
  box-shadow: inset 0 1px 0 color-mix(in oklab, var(--ccc-accent, #c8973f) 34%, transparent);
  pointer-events: none;
}
.ccc-scr--narrow.ccc-scr--title .ccc-scr__plane { --scr-cap-h: 0px; }
/* A title card is already its own caption — and a zero-height flex row does not
   hide its text, it spills it into the panel below. */
.ccc-scr--narrow.ccc-scr--title .ccc-scr__cap { display: none; }
/* The name WRAPS to a second line rather than losing its end to an ellipsis
   ("DAYS SINCE THE LAST BAD NPS SUR…" at 820x1180; v29 fix round, G3 m-4).
   Two lines of .86u caps at line-height 1 fit the 2u rail with air above
   and below; balanced, so a long name breaks in the middle instead of
   leaving one word on the second line. */
.ccc-scr__cap b {
  font-weight: 600; min-inline-size: 0;
  white-space: normal; overflow-wrap: anywhere;
  line-height: 1; text-wrap: balance;
  max-block-size: 2em; overflow: hidden;
}
.ccc-scr__cap i {
  font-style: normal; flex: 0 0 auto;
  color: var(--ccc-accent-hi, #ebce93); white-space: nowrap;
}

/* ══ reduced motion ══════════════════════════════════════════════════════ */
@media (prefers-reduced-motion: reduce) {
  /* Spelled with the owned-room selector too: that rule is more specific than
     a bare .ccc-scr__scan::after and would otherwise win here. */
  .ccc-scr__scan::after,
  .ccc-scr--owned .ccc-scr__scan::after { display: none; animation: none; }
  .ccc-scr__crt { display: none; }
  .ccc-scr-title__key, .ccc-scr-title__key::before, .ccc-scr__hit::before { transition: none; }
  .ccc-scr-title__key::after,
  .ccc-scr--owned .ccc-scr-title__key::after { display: none; animation: none; }
  /* M2's power-on is a state switch here, never a fade — and §9 never writes a
     data-power under reduced motion at all; this holds even if one lingers. */
  .ccc-scr[data-power] { opacity: 1; transform: none; transition: none; }
  /* No power-on ramp, and no scroll-driven fade on the band — theme.css §18
     pins .hotspots to opacity 1 for exactly this reason and the band is that
     layer's narrow-viewport counterpart. */
  .ccc-scr { --scr-on: 1; }
  .ccc-scr-layer { opacity: 1; }
  .ccc-scr-feed__slide { transition: none; transform: none; }
  /* The break-room board keeps advancing — a TV that stops is a broken TV —
     but it stops MOVING: no cross-fade and no emptying slide clock. Exactly
     what the feed does one line above. */
  .ccc-scr-rpt__slide { transition: none; transform: none; }
  .ccc-scr-rpt__slide.is-current .ccc-scr-rpt__tick i {
    animation: none; transform: scaleX(1);
  }
  .ccc-scr__frame,
  .ccc-scr__hit,
  .ccc-scr-holding--cover,
  .ccc-scr-feed__dots span { transition: none; }
}

/* ══ the phone, and the two layers a screen does not need there ═══════════
   ADDED 2026-08-28. Measured off Chromium's layer tree at 393x852 DPR 3, with
   theme.css §06e's curtain already drawn, six screen panels on the viewport:

     .ccc-scr__scan::after ... 6 composited layers, 21.2 MB of backing store
     .ccc-scr__glass ......... 6 composited layers,  9.9 MB

   __scan::after is the slow refresh bar. It is an INFINITE transform animation,
   which is an unconditional promotion — the layer exists and is backed for the
   whole session whether the sweep is visible or not, and it is inset -60% so
   the layer is 2.2x the height of the panel it decorates. On a 349px-wide phone
   panel the sweep it buys is roughly one perceptible highlight crossing a
   thumbnail every 7.5 seconds. The scanline texture on __scan itself — the
   thing that actually reads as a screen — is a static background and stays.

   __glass carried a transform of translateZ(0), which promoted it to hold a flat
   two-stop gradient and a filter that only moved when a board powered on. It
   was thought worth having on an iPad; the v29 perf audit measured it (layer
   tree + render passes, iPad 1180x820 @2x) and it was not, so since v29 the
   glass carries neither the transform nor the filter on ANY breakpoint and the
   line that used to live here is the rule in the sheet above.

   The reduced-motion block above already switches the sweep off by exactly this
   route, and has since v3; this is the same concession spent on a different
   constraint. THE CONDITION IS THE PHONE BAND (PHONE_MEDIA), not the narrow
   band — an iPad Pro portrait matches the narrow band and must not be touched
   here. Keep it identical to PHONE_MEDIA, theme.css §06b TIER 0 and §06e. */
@media (max-width: 500px), (max-width: 1000px) and (max-height: 500px) {
  .ccc-scr__scan::after,
  .ccc-scr--owned .ccc-scr__scan::after { display: none; animation: none; }
  .ccc-scr-title__key::after,
  .ccc-scr--owned .ccc-scr-title__key::after { display: none; animation: none; }

  /* AND THE BAND OF A ROOM THAT DOES NOT OWN THE PAGE.
     .ccc-scr-layer's opacity is var(--cut), which theme.css §05 resolves to
     EXACTLY 0 for every room that is not the one the visitor is standing in —
     and --live-cut is the binary form of the same number, registered with
     initial-value 1 so this query cannot match a page without theme.css. The
     band is therefore already invisible AND already un-hittable (--cut-clip
     puts its buttons at inset(50%)) in the state this hides it in; all that is
     left to remove is the compositor layer, which an opacity of 0 does not.
     Measured: 5.7 MB of backing store per band, two bands resident at the
     worst scroll position on a phone.

     .stage is the style container (theme.css §05 names it), and this layer is
     its child, so the query resolves against the room this band belongs to. */
  @container style(--live-cut: 0) {
    .ccc-scr-layer { visibility: hidden; }
  }

  /* AND THE SLIDE CAROUSELS, WHICH WERE PROMOTING THE WHOLE DECK.
     Both rotators stack every slide absolutely and cross-fade one to the next,
     and both give the resting state a translate3d(0, .4em, 0). A 3D transform is
     an unconditional promotion, so EVERY slide in the rotation carried a
     composited layer with a backing store for the whole session, not just the
     one on screen. Measured at 393x852 DPR 3, the Break Room board mid-scroll:
     NINE .ccc-scr-rpt__slide layers at 349x236, 25.4 MB of backing store, to
     show one card. It was the second largest item on the page at its worst
     scroll position, behind the plates themselves.

     The 2D form of the same offset renders identically and promotes nothing.
     The cross-fade is unaffected: a transform/opacity TRANSITION is composited
     while it runs whether or not the resting value was 3D, so the incoming and
     outgoing slide are promoted for the 0.55s they are moving and then let go —
     which is what the promotion was worth in the first place. Layer count for a
     nine-card rotation: 9 always, to at most 2 while a card is turning.

     The .is-current rule above needs no change: a transform of none is not a
     3D transform and was never promoting anything.

     v29: this was phone-only and is now the base rule of both rotators on
     every breakpoint (the perf audit measured the same promotion on iPad and
     desktop). The two declarations that lived here are gone — they had also
     been quietly out-ranking the reduced-motion block's transform: none on a
     phone, because they came later in the sheet. */
}

/* ══ forced colours ══════════════════════════════════════════════════════ */
@media (forced-colors: active) {
  .ccc-scr__glass { background: Canvas; forced-color-adjust: none; }
  .ccc-scr__hit:focus-visible { outline: 2px solid Highlight; }
}
`;

function injectStyles() {
  if (document.getElementById('ccc-screens-css')) return;
  document.head.append(el('style', { id: 'ccc-screens-css', text: STYLES }));
}






function solveLinearSystem(A, b) {
  const n = b.length;

  
  
  let magnitude = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = Math.abs(A[r][c]);
    if (v > magnitude) magnitude = v;
  }
  const tol = 1e-12 * (magnitude || 1);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (!(Math.abs(A[pivot][col]) > tol)) return null;
    if (pivot !== col) {
      const rowTmp = A[pivot]; A[pivot] = A[col]; A[col] = rowTmp;
      const bTmp = b[pivot]; b[pivot] = b[col]; b[col] = bTmp;
    }
    const p = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / p;
      if (!f) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }

  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < n; c++) sum -= A[r][c] * x[c];
    x[r] = sum / A[r][r];
    if (!Number.isFinite(x[r])) return null;
  }
  return x;
}

 
function computeHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
  }
  const h = solveLinearSystem(A, b);
  if (!h || h.some((n) => !Number.isFinite(n))) return null;
  h.push(1);
  return h;
}



function homographyToMatrix3d(h) {
  const m = [h[0], h[3], 0, h[6],
             h[1], h[4], 0, h[7],
             0,    0,    1, 0,
             h[2], h[5], 0, h[8]];
  if (m.some((n) => !Number.isFinite(n))) return null;
  return `matrix3d(${m.map((n) => Number(n.toPrecision(10))).join(',')})`;
}

function validQuad(quad) {
  if (!Array.isArray(quad) || quad.length !== 4) return false;
  return quad.every((pt) =>
    Array.isArray(pt) && pt.length >= 2 &&
    Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])));
}

 
function isSaneQuad(pts) {
  let area = 0;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    area += a[0] * b[1] - b[0] * a[1];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-6) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return Math.abs(area / 2) > 16;
}

const dist2d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

 
function parseQuadAttr(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return validQuad(parsed) ? parsed : null;
    } catch { return null; }
  }
  const nums = text.split(/[\s,]+/).filter(Boolean).map(Number);
  if (nums.length !== 8 || nums.some((n) => !Number.isFinite(n))) return null;
  return [[nums[0], nums[1]], [nums[2], nums[3]], [nums[4], nums[5]], [nums[6], nums[7]]];
}




let feedCache = { at: 0, promise: null, data: null, failed: false, inflight: false };



function loadStreaks({ force = false } = {}) {
  const now = Date.now();

  if (!force && feedCache.promise) {
    const age = now - feedCache.at;
    const window_ = feedCache.inflight ? FEED_TIMEOUT_MS + 2000
                  : feedCache.failed   ? FEED_RETRY_MS
                                       : FEED_TTL_MS;
    if (age < window_) return feedCache.promise;
  }

  feedCache.at = now;
  feedCache.inflight = true;

  
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const deadline = ctrl
    ? window.setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS)
    : 0;

  feedCache.promise = fetch(`${STREAKS_URL}?t=${Math.floor(now / BUCKET_MS)}`, {
    credentials: 'omit',
    cache: 'no-store',
    signal: ctrl ? ctrl.signal : undefined
  })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((json) => {
      if (!json || !Array.isArray(json.stores)) throw new Error('unexpected shape');
      if (deadline) window.clearTimeout(deadline);
      feedCache.data = json;
      feedCache.failed = false;
      feedCache.inflight = false;
      return json;
    })
    .catch((err) => {
      if (deadline) window.clearTimeout(deadline);
      console.warn('[screens] detractor streaks unavailable:', err && err.message);
      feedCache.failed = true;
      feedCache.inflight = false;
      
      return feedCache.data;
    });

  return feedCache.promise;
}



function groupByDistrict(data) {
  const goal = num(data.goalDays) || 30;
  const meta = new Map();
  if (Array.isArray(data.districts)) {
    for (const d of data.districts) {
      if (d && (d.key || d.label)) meta.set(d.label || d.key, d);
    }
  }

  const order = [];
  const bucket = new Map();
  for (const store of data.stores) {
    if (!store) continue;
    const key = store.district || store.districtKey || 'Other';
    if (!bucket.has(key)) { bucket.set(key, []); order.push(key); }
    bucket.get(key).push(store);
  }

  
  const declared = Array.isArray(data.districts)
    ? data.districts.map((d) => d && (d.label || d.key)).filter((k) => bucket.has(k))
    : [];
  const keys = declared.length === order.length ? declared : order;

  return keys.map((key) => {
    const stores = bucket.get(key).slice().sort((a, b) => {
      const da = num(a.days), db = num(b.days);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return db - da;
    });
    return { key, label: key, goal, meta: meta.get(key) || null, stores };
  });
}






const RSD_SURNAME = 'Bilbrey';



const REPORT_DISTRICTS = [
  { key: 'north',     label: 'Chicago North', dmMatch: ['dhorajiwala'], storeMatch: ['cicero'] },
  { key: 'south',     label: 'Chicago South', dmMatch: ['carrillo'] },
  { key: 'east',      label: 'Chicago East',  dmMatch: ['cabrales'], storeExclude: ['cicero'] },
  { key: 'west',      label: 'Chicago West',  dmMatch: ['chowdhury'] },
  { key: 'big-south', label: 'Big South',     dmMatch: ['brooks'] }
];



const OUR_REGIONS = ['Greater Chicago', 'Big South'];

 
const SHEET_STORE  = 'Store Rank';
const SHEET_ZERO   = 'Zero';
const SHEET_DM     = 'District Rank';
const SHEET_REGION = 'Region Rank';

 

 
const fmtMoney = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
 
const pctStr = (v) => `${(v * 100).toFixed(1)}%`;
 
const pctWhole = (v) => `${Math.round(v * 100)}%`;

 
function storeInDistrict(store, dist) {
  const name = String(store.name || '').toLowerCase();
  if (dist.storeExclude && dist.storeExclude.some((m) => name.includes(m))) return false;
  if (dist.storeMatch && dist.storeMatch.some((m) => name.includes(m))) return true;
  const dm = String(store.dm || '').toLowerCase();
  return dist.dmMatch.some((m) => dm.includes(m));
}

 



const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

let sheetJsPromise = null;



function ensureSheetJS() {
  if (window.XLSX && typeof window.XLSX.read === 'function') {
    return Promise.resolve(window.XLSX);
  }
  if (sheetJsPromise) return sheetJsPromise;

  sheetJsPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(deadline);
      const lib = ok && window.XLSX && typeof window.XLSX.read === 'function' ? window.XLSX : null;
      if (!lib) {
        
        sheetJsPromise = null;
        const dead = document.getElementById('ccc-sheetjs');
        if (dead) dead.remove();
        console.warn('[screens] SheetJS unavailable; the report board falls back to its no-workbook cards');
      }
      resolve(lib);
    };
    const deadline = window.setTimeout(() => finish(false), SHEETJS_TIMEOUT_MS);

    let tag = document.getElementById('ccc-sheetjs');
    if (!tag) {
      tag = el('script', {
        id: 'ccc-sheetjs',
        src: SHEETJS_URL,
        async: true,
        crossorigin: 'anonymous',
        referrerpolicy: 'no-referrer'
      });
      document.head.append(tag);
    }
    tag.addEventListener('load', () => finish(true), { once: true });
    tag.addEventListener('error', () => finish(false), { once: true });
  });

  return sheetJsPromise;
}

 

let bookCache = { at: 0, promise: null, data: null, failed: false, inflight: false };

 
function sheetRows(XLSX, wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
}



function parseStoreRank(aoa) {
  let headerRow = -1;
  for (let i = 0; i < Math.min(15, aoa.length); i++) {
    const row = aoa[i];
    if (row && row.some((c) => c && String(c).trim() === 'Rank')
            && row.some((c) => c && String(c).includes('Store'))) { headerRow = i; break; }
  }
  if (headerRow < 0) return [];

  const headers = aoa[headerRow].map((h) => (h ? String(h).trim() : ''));
  const col = (name) => headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
  const iRank   = col('Rank'),   iRegion = col('Region'), iStore = col('Store'),
        iRSD    = col('RSD'),    iDM     = col('DM'),     iSM    = col('SM'),
        iTarget = col('Net Target GP'), iVar = col('Var Target GP');
  const iTrend  = headers.findIndex((h) => h === 'GP $ Trend');
  const iMobCR  = headers.findIndex((h) => h.toLowerCase().includes('mobile close rate'));
  const iFisCR  = headers.findIndex((h) => h.toLowerCase().includes('fiscal close rate'));
  const iNPS    = headers.findIndex((h) => h.toLowerCase().includes('fiscal nps')
                                        && !h.toLowerCase().includes('last'));

  const out = [];
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || !row[iRank]) break;                 
    if (!String(row[iRSD] || '').includes(RSD_SURNAME)) continue;
    out.push({
      rank:   Number(row[iRank]) || 0,
      region: String(row[iRegion] || ''),
      name:   String(row[iStore] || ''),
      dm:     String(row[iDM] || ''),
      sm:     String(row[iSM] || ''),
      gpTrend: iTrend  >= 0 ? Number(row[iTrend])  || 0 : 0,
      target:  iTarget >= 0 ? Number(row[iTarget]) || 0 : 0,
      varTarget: iVar  >= 0 ? Number(row[iVar])    || 0 : 0,
      mobileCR:  iMobCR >= 0 ? Number(row[iMobCR]) || 0 : 0,
      fiscalCR:  iFisCR >= 0 ? Number(row[iFisCR]) || 0 : 0,
      nps:       iNPS   >= 0 ? Number(row[iNPS])   || 0 : 0
    });
  }
  out.sort((a, b) => a.rank - b.rank);
  return out;
}



function parseZeroSheet(aoa) {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, aoa.length); i++) {
    if (aoa[i] && aoa[i][0] && String(aoa[i][0]).trim().toLowerCase() === 'store name') {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) return {};
  const out = {};
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || !r[0]) continue;
    const name = String(r[0]).trim();
    const mcrRaw = r[7];
    out[name] = {
      store: name,
      mobile:  Number(r[2]) || 0,
      traffic: Number(r[8]) || 0,
      mcr: typeof mcrRaw === 'number' ? (mcrRaw <= 1 ? mcrRaw * 100 : mcrRaw) : null
    };
  }
  return out;
}



function parseRankSheet(aoa) {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 6); i++) {
    if (aoa[i] && String(aoa[i][0] || '').trim() === 'Rank') { headerIdx = i; break; }
  }
  if (headerIdx < 0) return [];
  const rows = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r[0] == null) continue;
    const name = String(r[1] || '').trim();
    if (!name) continue;
    rows.push({
      rank: Number(r[0]) || 0,
      name,
      avgGpTrend: Number(r[2]) || 0,
      nps: Number(r[32]) || 0
    });
  }
  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

 
function buildSalesModel(XLSX, wb) {
  const storeAoa = sheetRows(XLSX, wb, SHEET_STORE);
  const stores = storeAoa ? parseStoreRank(storeAoa) : [];
  if (!stores.length) throw new Error('no stores for this market');

  const zeroAoa = sheetRows(XLSX, wb, SHEET_ZERO);
  const dmAoa = sheetRows(XLSX, wb, SHEET_DM);
  const regionAoa = sheetRows(XLSX, wb, SHEET_REGION);

  const zero = zeroAoa ? parseZeroSheet(zeroAoa) : {};
  const dmRanks = dmAoa ? parseRankSheet(dmAoa) : [];
  const regionRanks = regionAoa ? parseRankSheet(regionAoa) : [];

  
  
  
  
  const districts = REPORT_DISTRICTS.map((d) => {
    const own = stores.filter((s) => storeInDistrict(s, d));
    const y = own.reduce((acc, s) => {
      const z = zero[s.name];
      if (z) { acc.traffic += z.traffic; acc.mobile += z.mobile; }
      return acc;
    }, { traffic: 0, mobile: 0 });
    const gp = own.reduce((acc, s) => {
      acc.trend += s.gpTrend; acc.target += s.target; return acc;
    }, { trend: 0, target: 0 });
    return { key: d.key, label: d.label, stores: own, ...y, gp };
  }).filter((d) => d.stores.length);

  const market = districts.reduce((acc, d) => {
    acc.traffic += d.traffic; acc.mobile += d.mobile;
    acc.trend += d.gp.trend;  acc.target += d.gp.target;
    return acc;
  }, { traffic: 0, mobile: 0, trend: 0, target: 0 });
  market.stores = stores.length;
  market.atGoal = stores.filter((s) => s.target > 0 && s.gpTrend >= s.target).length;

  
  
  
  
  const ourDMs = new Set(stores.map((s) => String(s.dm || '').toLowerCase().trim()).filter(Boolean));
  const isOurDM = (name) => {
    const n = String(name).toLowerCase().trim();
    if (ourDMs.has(n)) return true;
    for (const dm of ourDMs) if (dm.includes(n) || n.includes(dm)) return true;
    return false;
  };
  const dmMine = dmRanks.filter((r) => isOurDM(r.name));
  const dmTotal = dmRanks.length;

  const regionMine = (name) =>
    OUR_REGIONS.some((r) => String(name).toLowerCase().includes(r.toLowerCase()));

  return { stores, zero, districts, market, dmRanks, dmMine, dmTotal, regionRanks, regionMine };
}



function loadWorkbook({ force = false } = {}) {
  const now = Date.now();

  if (!force && bookCache.promise) {
    const age = now - bookCache.at;
    const window_ = bookCache.inflight ? BOOK_TIMEOUT_MS + SHEETJS_TIMEOUT_MS + 2000
                  : bookCache.failed   ? FEED_RETRY_MS
                                       : FEED_TTL_MS;
    if (age < window_) return bookCache.promise;
  }

  bookCache.at = now;
  bookCache.inflight = true;

  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const deadline = ctrl ? window.setTimeout(() => ctrl.abort(), BOOK_TIMEOUT_MS) : 0;

  
  
  bookCache.promise = Promise.all([
    ensureSheetJS(),
    fetch(freshUrl(EXCEL_URL, BUCKET_MS), {
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then((res) => (res.ok ? res.arrayBuffer()
                             : Promise.reject(new Error(`HTTP ${res.status}`))))
  ])
    .then(([XLSX, buf]) => {
      if (deadline) window.clearTimeout(deadline);
      if (!XLSX) throw new Error('SheetJS unavailable');
      
      
      
      
      
      
      
      
      
      
      const model = buildSalesModel(XLSX, XLSX.read(buf, {
        type: 'array',
        sheets: [SHEET_STORE, SHEET_ZERO, SHEET_DM, SHEET_REGION]
      }));
      bookCache.data = model;
      bookCache.failed = false;
      bookCache.inflight = false;
      return model;
    })
    .catch((err) => {
      if (deadline) window.clearTimeout(deadline);
      console.warn('[screens] sales workbook unavailable:', err && err.message);
      bookCache.failed = true;
      bookCache.inflight = false;
      return bookCache.data;             
    });

  return bookCache.promise;
}






function holdingCard(title, note) {
  return el('div', { class: 'ccc-scr-holding' }, [
    el('span', { class: 'ccc-scr-holding__mark', text: 'Cook County Cooks' }),
    el('p', { class: 'ccc-scr-holding__title', text: title || 'Board offline' }),
    el('p', { class: 'ccc-scr-holding__note', text: note || 'Live data is not reachable right now. Tap to open the full report.' })
  ]);
}

 



const ROOM_TITLES = {
  pass: 'The Pass', host: 'Host Stand', dining: 'Dining Room', prep: 'Prep',
  office: 'Back Office', breakroom: 'Break Room', freezer: 'Walk-In'
};



function stationNumber(rec) {
  const { room } = roomOf(rec.host);
  const scope = room || document;
  let n = 1;
  try {
    const hosts = Array.from(scope.querySelectorAll('[data-screen]'));
    const i = hosts.indexOf(rec.host);
    if (i >= 0) n = i + 1;
  } catch {   }
  return n;
}

function stationLabel(rec) {
  const { roomId } = roomOf(rec.host);
  const place = ROOM_TITLES[roomId] || 'Cook County Cooks';
  return `${place} · ${String(stationNumber(rec)).padStart(2, '0')}`;
}

function makeTitle(rec) {
  

  const name = el('p', { class: 'ccc-scr-title__name', text: rec.headline });

  

  const bar = el('div', { class: 'ccc-scr-title__bar', 'aria-hidden': 'true' }, [
    el('span', { class: 'ccc-scr-title__term', text: stationLabel(rec) }),
    el('span', { class: 'ccc-scr-title__stat' }, [
      el('i', { class: 'ccc-scr-title__pip' }),
      el('span', { text: 'Online' })
    ])
  ]);

   
  

  const body = el('div', { class: 'ccc-scr-title__body' }, [name]);

  

  const key = el('div', { class: 'ccc-scr-title__key', 'aria-hidden': 'true' }, [
    el('span', { class: 'ccc-scr-title__cta', text: 'Tap to open' }),
    el('span', { class: 'ccc-scr-title__chev', text: '›' })
  ]);
  
  key.setAttribute('data-station', String(stationNumber(rec)));

  const node = el('div', { class: 'ccc-scr-title' }, [bar, body, key]);

  return {
    node,
    resize(r) {
      
      
      
      
      
      
      
      
      
      
      
      
      const w = r.planeW, h = r.planeH;
      if (!w || !h) return;
      const narrow = r.narrow;

      
      
      
      const u = Math.max(7, Math.min(h * (narrow ? 0.13 : 0.093), w * 0.040));

      
      
      
      const railH = u * 1.0 + u * 0.62 + 1;
      const keyH  = Math.max(narrow ? 44 : 0, u * 1.06 + u * 1.36 + 2);
      const padY  = h * (narrow ? 0.08 : 0.09);
      const gaps  = h * (narrow ? 0.03 : 0.08);

      
      
      const bw = (w - w * (narrow ? 0.09 : 0.11)) * (narrow ? 0.62 : 1);
      const bh = narrow
        ? Math.max(14, h - railH - padY - gaps)
        : Math.max(14, h - railH - keyH - padY - gaps);

      const text = (rec.headline || '').replace(/\s+/g, ' ').trim();
      const chars = Math.max(8, text.length);
      let fs = Math.sqrt((bw * bh * 0.42) / chars) * 1.42;
      
      
      fs = Math.min(fs, bh * 0.46, bw * 0.34);
      fs = Math.max(fs, 10);

      r.plane.style.setProperty('--scr-pos-fs', `${u.toFixed(2)}px`);
      r.plane.style.setProperty('--scr-title-fs', `${fs.toFixed(2)}px`);
    },
    activate: noop,
    deactivate: noop,
    destroy: noop
  };
}

 



const PROMO_FETCH_TIMEOUT_MS = 30 * 1000;



async function fingerprint(blob) {
  const buf = await blob.arrayBuffer();
  try {
    if (window.crypto && window.crypto.subtle) {
      const d = new Uint8Array(await window.crypto.subtle.digest('SHA-1', buf));
      let s = '';
      for (let i = 0; i < d.length; i++) s += d[i].toString(16).padStart(2, '0');
      return `sha1:${s}`;
    }
  } catch {   }
  const b = new Uint8Array(buf);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
  return `fnv:${b.length}:${(h >>> 0).toString(16)}`;
}

function makeImage(rec) {
  const node = el('div', { class: 'ccc-scr-art' });
  let timer = 0;          
  let deadline = 0;       
  let retries = 0;
  let ok = false;         
  let holding = null;
  let inflight = false;
  let lastCheck = 0;      
  let shownPrint = '';    
  let objUrl = '';        
  let prevUrl = '';       

  
  
  const bg = el('canvas', { class: 'ccc-scr-art__bg', width: '24', height: '17', 'aria-hidden': 'true' });
  const fg = el('img', { class: 'ccc-scr-art__fg', alt: '', 'aria-hidden': 'true', decoding: 'async' });

  const NOTE = 'Today’s promo card has not landed yet. Tap to open the Daily Sales Report.';

  

  function showHolding() {
    if (holding) return;
    holding = holdingCard(rec.title || 'Daily promo card', NOTE);
    node.append(holding);
    rec.panel.classList.remove('is-live');
  }

  function clearHolding() {
    if (!holding) return;
    holding.remove();
    holding = null;
  }

  function stopDeadline() {
    if (deadline) { window.clearTimeout(deadline); deadline = 0; }
  }

  

  function paintBackdrop(blob) {
    if (typeof window.createImageBitmap !== 'function') return;
    window.createImageBitmap(blob, { resizeWidth: bg.width, resizeHeight: bg.height, resizeQuality: 'low' })
      .then((bmp) => {
        try {
          if (rec.destroyed) return;
          const ctx = bg.getContext('2d', { alpha: false });
          if (!ctx) return;
          ctx.drawImage(bmp, 0, 0, bg.width, bg.height);
          ctx.fillStyle = 'rgba(0,0,0,.38)';
          ctx.fillRect(0, 0, bg.width, bg.height);
        } finally {
          if (bmp && bmp.close) bmp.close();
        }
      })
      .catch(() => {   });
  }

  

  function check({ force = false } = {}) {
    if (inflight || rec.destroyed) return;
    const now = Date.now();
    if (ok && !force && now - lastCheck < PROMO_CHECK_MS) return;
    lastCheck = now;
    inflight = true;

    stopDeadline();
    
    
    if (!ok) {
      deadline = window.setTimeout(() => {
        deadline = 0;
        if (!ok) showHolding();
      }, IMAGE_TIMEOUT_MS);
    }

    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const stop = ctrl ? window.setTimeout(() => ctrl.abort(), PROMO_FETCH_TIMEOUT_MS) : 0;

    fetch(PROMO_CARD_URL, {
      credentials: 'omit',
      mode: 'cors',
      cache: retries > 0 && !ok ? 'no-cache' : 'default',
      signal: ctrl ? ctrl.signal : undefined
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(async (blob) => {
        if (stop) window.clearTimeout(stop);
        if (!blob || !blob.size) throw new Error('empty card');
        const print = await fingerprint(blob);
        inflight = false;
        if (rec.destroyed) return;
        if (ok && print === shownPrint) return;   
        shownPrint = print;
        if (objUrl) prevUrl = objUrl;
        objUrl = URL.createObjectURL(blob);
        fg.src = objUrl;                          
        paintBackdrop(blob);
      })
      .catch((err) => {
        if (stop) window.clearTimeout(stop);
        inflight = false;
        if (rec.destroyed) return;
        console.warn('[screens] promo card unavailable:', err && err.message);
        if (!ok) { stopDeadline(); showHolding(); }
        
      });
  }

  fg.addEventListener('error', () => {
    stopDeadline();
    if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = ''; }
    ok = false;
    shownPrint = '';
    showHolding();
  });
  fg.addEventListener('load', () => {
    stopDeadline();
    ok = true;
    retries = 0;
    if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = ''; }
    clearHolding();
    rec.panel.classList.add('is-live');
  });

  node.append(bg, fg);

  function stopTimer() {
    if (timer) { window.clearInterval(timer); timer = 0; }
  }

  return {
    node,
    resize: noop,
    activate() {
      check({ force: !ok });
      
      
      
      
      
      
      if (!timer) {
        timer = window.setInterval(() => {
          if (document.visibilityState === 'hidden' || pageViewing()) return;
          if (!ok) {
            if (retries >= RETRY_LIMIT) return;
            retries++;
            check({ force: true });
          } else {
            check();
          }
        }, RETRY_EVERY_MS);
      }
    },
    deactivate() {
      stopDeadline();
      stopTimer();
    },
     
    refresh() {
      retries = 0;
      check({ force: true });
    },
    destroy() {
      stopDeadline();
      stopTimer();
      fg.removeAttribute('src');
      if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = ''; }
      if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = ''; }
    }
  };
}

 

function buildStoreTile(store, goal) {
  const days = num(store.days);
  const dark = store.status === 'no-data' || days === null;
  const capped = store.capped === true;
  const goalMet = store.goalMet === true || store.atGoal === true;
  const record = store.newRecord === true;

  const tile = el('div', {
    class: 'ccc-scr-feed__store' +
      (goalMet ? ' is-goal' : '') +
      (record ? ' is-record' : '') +
      (dark ? ' is-dark' : '')
  });

  const value = dark ? '—' : (capped ? `${days}+` : String(days));
  tile.append(
    el('span', { class: 'ccc-scr-feed__days', text: value }),
    el('span', {
      class: 'ccc-scr-feed__unit',
      text: dark ? 'no surveys' : (days === 1 ? 'day clean' : 'days clean')
    }),
    el('span', { class: 'ccc-scr-feed__name', text: store.store || store.storeFull || '' })
  );

  const fill = dark ? 0 : Math.max(0, Math.min(1, days / (goal || 30)));
  tile.append(el('span', { class: 'ccc-scr-feed__meter', 'aria-hidden': 'true' }, [
    el('i', { style: `--fill:${fill.toFixed(3)}` })
  ]));

  
  if (goalMet) tile.append(el('span', { class: 'ccc-scr-feed__flag', text: 'Goal met' }));
  else if (record) tile.append(el('span', { class: 'ccc-scr-feed__flag', text: 'Record' }));

  return tile;
}

function buildSlide(district, data, index, total) {
  const goal = district.goal;
  const best = district.stores.find((s) => num(s.days) !== null);
  const meta = district.meta || {};

  const head = el('div', { class: 'ccc-scr-feed__head' }, [
    el('p', { class: 'ccc-scr-feed__eyebrow', text: 'Days since the last bad NPS survey' }),
    

    el('p', { class: 'ccc-scr-feed__district', text: district.label }),
    el('p', { class: 'ccc-scr-feed__goal', text: `Goal ${goal} days` })
  ]);

  const grid = el('div', { class: 'ccc-scr-feed__grid' },
    district.stores.map((store) => buildStoreTile(store, goal)));

  const bestLabel = best
    ? `Leading: ${best.store} · ${best.capped ? `${best.days}+` : best.days}`
    : `${district.stores.length} stores`;
  const avg = num(meta.avgDays);
  const dots = el('div', { class: 'ccc-scr-feed__dots', 'aria-hidden': 'true' },
    Array.from({ length: total }, (_, i) =>
      el('span', { class: i === index ? 'is-current' : '' })));

  

  const fresh = streaksFresh(data);
  const stamp = shortDate(data.asOf);
  const foot = el('div', { class: 'ccc-scr-feed__foot' }, [
    el('span', { text: bestLabel }),
    dots,
    el('span', {
      class: fresh ? 'ccc-scr-feed__stamp' : 'ccc-scr-feed__stamp ccc-scr-feed__stale',
      text: fresh
        ? (avg !== null ? `District avg ${avg} · ${stamp}` : stamp)
        : `Last updated ${stamp} — not today's numbers`
    })
  ]);

  return el('div', { class: `ccc-scr-feed__slide${fresh ? '' : ' is-stale'}` }, [head, grid, foot]);
}

function makeFeed(rec) {
  const node = el('div', { class: 'ccc-scr-feed' });
  const stage = el('div', { class: 'ccc-scr-feed__stage' });
  node.append(stage);

  let slides = [];
  let districts = [];
  let index = 0;
  let timer = 0;
  let retryTimer = 0;
  let retries = 0;
  let active = false;
  let loaded = false;
  let pending = false;

  const TITLE = () => rec.title || 'Days since the last bad NPS survey';
  const WAITING = 'Bringing up the streak board\u2026 tap to open the Daily Sales Report.';
  const OFFLINE = 'The streak board is not reachable right now. Tap to open the Daily Sales Report.';

  

  function showHolding(note) {
    node.replaceChildren(holdingCard(TITLE(), note));
    rec.panel.classList.remove('is-live');
  }

  function show(i) {
    if (!slides.length) return;
    index = ((i % slides.length) + slides.length) % slides.length;
    for (let s = 0; s < slides.length; s++) {
      slides[s].classList.toggle('is-current', s === index);
    }
    applyColumns();
  }

  function applyColumns() {
    
    
    
    
    
    
    
    const wide = rec.planeW >= 320;
    for (let i = 0; i < slides.length; i++) {
      const grid = slides[i].querySelector('.ccc-scr-feed__grid');
      if (!grid) continue;
      const n = districts[i] ? districts[i].stores.length : grid.children.length;
      const cols = wide ? Math.min(3, Math.max(2, Math.ceil(n / 2))) : 2;
      const rows = Math.max(1, Math.ceil(n / cols));
      grid.style.setProperty('--scr-cols', String(cols));
      
      grid.style.setProperty('--scr-num', rows >= 3 ? '2.15' : (rows === 2 ? '3.05' : '4.2'));
    }
  }

  function tick() {
    show(index + 1);
  }

  function startTimer() {
    if (timer || slides.length < 2 || !active) return;
    timer = window.setInterval(() => {
      
      
      if (document.visibilityState === 'hidden' || pageViewing()) return;
      tick();
    }, FEED_SLIDE_MS);
  }

  function stopTimer() {
    if (timer) { window.clearInterval(timer); timer = 0; }
  }

  function stopRetry() {
    if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = 0; }
  }

  

  function startRetry() {
    if (retryTimer || loaded || !active) return;
    const arm = () => {
      retryTimer = window.setTimeout(() => {
        retryTimer = 0;
        if (loaded || !active) return;
        if (document.visibilityState === 'hidden') { arm(); return; }
        retries++;
        pull({ force: true });
        if (!loaded) arm();
      }, retryDelay(retries));
    };
    arm();
  }

  

  function pull({ force = false } = {}) {
    if (pending) return;
    pending = true;
    loadStreaks({ force }).then((data) => {
      pending = false;
      if (rec.destroyed) return;
      if (data) { loaded = true; stopRetry(); render(data); }
      else { showHolding(OFFLINE); startRetry(); }
    }).catch(() => {
      pending = false;
      if (rec.destroyed) return;
      if (!loaded) { showHolding(OFFLINE); startRetry(); }
    });
  }

  function render(data) {
    if (!data) { showHolding(OFFLINE); return; }
    districts = groupByDistrict(data);
    if (!districts.length) { showHolding(OFFLINE); return; }
    slides = districts.map((d, i) => buildSlide(d, data, i, districts.length));
    stage.replaceChildren(...slides);
    if (!node.contains(stage)) node.replaceChildren(stage);
    show(0);
    rec.panel.classList.add('is-live');
    startTimer();
  }

  
  showHolding(WAITING);

  return {
    node,
    resize: applyColumns,
    activate() {
      active = true;
      if (!loaded) { pull(); startRetry(); }
      else startTimer();
    },
    deactivate() {
      active = false;
      stopTimer();
      stopRetry();
    },
     
    refresh() {
      retries = 0;
      pull({ force: !loaded });
      if (!loaded) startRetry();
    },
    destroy() {
      stopTimer();
      stopRetry();
      slides = [];
    }
  };
}

 



const LIVE_REVEAL_MS = 3200;
const LIVE_REVEAL_MS_BY_SLUG = {
  'wtw-chicago':   1200,
  'wtw-big-south': 1200
};



const BOARD_READY_CAP_MS = 45 * 1000;



const WAKE_SETTLE_MS = 400;
const BOARD_UNREACHABLE = 'This board is not reachable right now. It will try again on its own — or tap to open it full screen.';

function makeLive(rec) {
  const node = el('div', { class: 'ccc-scr-live' });
  let frame = null;
  let cover = null;
  let watchdog = 0;
  let revealT = 0;
  let bucket = 0;        
  let dead = false;      
  let speaks = false;    
  let failed = false;    
  let capT = 0;          
  let retryT = 0;        
  let attempt = 0;       
  let onMessage = null;  
  let wantFresh = false; 
  let suspended = false; 
  let revealOnWake = false; 

  

  function refuse(note) {
    window.clearTimeout(revealT);
    revealT = 0;
    
    
    
    
    window.clearTimeout(capT); capT = 0;
    window.clearTimeout(retryT); retryT = 0;
    if (cover) {
      const n = cover.querySelector('.ccc-scr-holding__note');
      if (n) n.textContent = note;
    } else {
      node.replaceChildren(holdingCard(rec.title, note));
      cover = null;
    }
    if (frame) { frame.remove(); frame = null; }
    rec.panel.classList.add('is-live');
  }

  

  function uncover() {
    revealT = 0;
    if (suspended) { revealOnWake = true; return; }
    if (!cover) return;
    const lid = cover;
    cover = null;
    lid.classList.add('is-gone');
    
    
    window.setTimeout(() => { if (lid.parentNode) lid.remove(); }, 700);
  }

  

  function armLid(words) {
    if (cover) {
      const n = cover.querySelector('.ccc-scr-holding__note');
      if (n) n.textContent = words;
      return;
    }
    cover = holdingCard(rec.title, words);
    cover.classList.add('ccc-scr-holding--cover');
    node.append(cover);
  }

  

  function arrived() {
    window.clearTimeout(watchdog);
    window.clearTimeout(capT); capT = 0;
    window.clearTimeout(retryT); retryT = 0;
    window.clearTimeout(revealT); revealT = 0;
    attempt = 0;
    failed = false;
    rec.deckArrived = true;                       
    rec.panel.classList.add('is-live');
    uncover();
  }

  

  function fail(words) {
    failed = true;
    window.clearTimeout(watchdog);
    window.clearTimeout(capT); capT = 0;
    window.clearTimeout(revealT); revealT = 0;
    rec.deckArrived = false;
    armLid(words);
    rec.panel.classList.add('is-live');           
    window.clearTimeout(retryT);
    retryT = window.setTimeout(retry, retryDelay(attempt));
    attempt += 1;
  }

  

  function retry() {
    retryT = 0;
    if (rec.destroyed || !frame) return;         
    
    
    if (suspended || pageViewing()) {
      retryT = window.setTimeout(retry, RESUME_MS);
      return;
    }
    dead = false;
    unmount();
    wantFresh = true;
    mount();
  }

  function handleBoard(d) {
    if (!speaks) {
      speaks = true;
      
      
      window.clearTimeout(revealT); revealT = 0;
    }
    if (d.state === 'ready') { arrived(); return; }
    if (d.state === 'error') {
      
      
      console.warn(`[screens] ${rec.slug}: board reported an error:`, typeof d.reason === 'string' ? d.reason.slice(0, 120) : '');
      fail(BOARD_UNREACHABLE);
      return;
    }
    if (d.state === 'loading') {
      failed = false;
      rec.deckArrived = false;
      window.clearTimeout(retryT); retryT = 0;
      armLid('Tap to open this board full screen.');
      if (!capT) {
        capT = window.setTimeout(() => {
          capT = 0;
          if (rec.destroyed || rec.deckArrived) return;
          fail(BOARD_UNREACHABLE);
        }, BOARD_READY_CAP_MS);
      }
    }
  }

  function mount() {
    if (frame) return;
    const fresh = wantFresh;
    wantFresh = false;
    speaks = false;
    failed = false;
    
    
    
    
    
    dead = false;
    const url = rec.url;
    if (!url) {
      node.replaceChildren(holdingCard(rec.title, 'Tap to open this board full screen.'));
      return;
    }
    frame = el('iframe', {
      class: 'ccc-scr__frame',
      
      
      'aria-hidden': 'true',
      tabindex: '-1',
      scrolling: 'no',
      title: '',
      referrerpolicy: 'no-referrer-when-downgrade'
    });
    frame.setAttribute('role', 'presentation');
    

    const mounted = frame;                        
    frame.addEventListener('load', () => {
      if (rec.destroyed || dead || mounted !== rec.liveFrame) return;
      let blank = false;
      try { blank = mounted.contentWindow && mounted.contentWindow.location.href === 'about:blank'; }
      catch { blank = false; }                    
      if (blank) return;
      

      if (speaks) { rec.panel.classList.add('is-live'); return; }
      window.clearTimeout(watchdog);
      rec.deckArrived = true;                     
      
      rec.panel.classList.add('is-live');
      window.clearTimeout(revealT);
      revealT = window.setTimeout(uncover, LIVE_REVEAL_MS_BY_SLUG[rec.slug] || LIVE_REVEAL_MS);
    });
    rec.liveFrame = frame;
    

    if (onMessage) window.removeEventListener('message', onMessage);   
    onMessage = (event) => {
      if (rec.destroyed || dead || mounted !== rec.liveFrame) return;
      if (!mounted.contentWindow || event.source !== mounted.contentWindow) return;
      const d = event.data;
      if (!d || typeof d !== 'object') return;
      if (d.source === 'ccc-board') {
        
        
        if (suspended) postToBoard('pause');
        handleBoard(d); return;
      }
      
      
      if (d.source === 'ccc-tool' && d.state === 'painted') handleBoard({ state: 'ready' });
    };
    window.addEventListener('message', onMessage);
    
    
    
    
    
    
    
    const BUCKET = 5 * 60 * 1000;
    bucket = Math.floor(Date.now() / BUCKET);
    frame.src = fresh ? freshUrl(url) : freshUrl(url, BUCKET);   
    
    
    cover = holdingCard(rec.title, 'Tap to open this board full screen.');
    cover.classList.add('ccc-scr-holding--cover');
    node.replaceChildren(frame, cover);
    fit();

    

    preflight(url).then((v) => {
      if (rec.destroyed || frame === null) return;
      if (v.verdict !== 'gone' && v.verdict !== 'unreachable' && v.verdict !== 'empty') return;
      dead = true;
      window.clearTimeout(watchdog);
      refuse(preflightCopy(v, rec.title) + ' Tap to open it full screen.');
    });

    

    watchdog = window.setTimeout(() => {
      if (rec.destroyed || rec.deckArrived) return;
      const words = 'This board is taking a while to load. Tap to open it full screen.';
      if (cover) {
        const note = cover.querySelector('.ccc-scr-holding__note');
        if (note) note.textContent = words;
      } else {
        node.replaceChildren(holdingCard(rec.title, words));
      }
      
      rec.panel.classList.add('is-live');
    }, 12000);
  }

  

  function hold() {
    if (frame) return;
    if (node.firstElementChild &&
        node.firstElementChild.classList.contains('ccc-scr-holding')) return;
    node.replaceChildren(holdingCard(rec.title, 'Tap to open this board full screen.'));
    rec.panel.classList.add('is-live');
  }

  

  

  function postToBoard(action) {
    try {
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ source: 'ccc-site', action }, '*');
    } catch (e) {   }
  }

  function suspend() {
    if (!frame || suspended) return;
    suspended = true;
    node.classList.add('is-suspended');
    postToBoard('pause');
    if (revealT) { window.clearTimeout(revealT); revealT = 0; revealOnWake = true; }
    armLid('Tap to open this board full screen.');
  }

  

  function resume() {
    if (!suspended) return;
    suspended = false;
    node.classList.remove('is-suspended');
    if (!frame) return;
    postToBoard('resume');
    const settle = revealOnWake ? (LIVE_REVEAL_MS_BY_SLUG[rec.slug] || LIVE_REVEAL_MS) : WAKE_SETTLE_MS;
    if (rec.deckArrived || revealOnWake) {
      revealOnWake = false;
      window.clearTimeout(revealT);
      revealT = window.setTimeout(uncover, settle);
    }
  }

  function unmount() {
    window.clearTimeout(watchdog);
    window.clearTimeout(revealT);
    revealT = 0;
    suspended = false;
    revealOnWake = false;
    node.classList.remove('is-suspended');
    window.clearTimeout(capT); capT = 0;
    window.clearTimeout(retryT); retryT = 0;
    if (onMessage) { window.removeEventListener('message', onMessage); onMessage = null; }
    speaks = false;
    cover = null;
    rec.panel.classList.remove('is-live');
    if (frame) {
      
      
      
      
      frame.remove();
      frame = null;
    }
    rec.liveFrame = null;
    rec.deckArrived = false;
    node.replaceChildren();
  }

  

  function fit() {
    if (!frame) return;
    const w = rec.planeW, h = rec.planeH;
    if (!w || !h) return;

    const aspect = w / h;                       
    
    
    
    
    const minH = LIVE_MIN_VIRTUAL_H_BY_SLUG[rec.slug] || LIVE_MIN_VIRTUAL_H;
    const vw = Math.max(rec.renderWidth, Math.round(minH * aspect));
    const vh = Math.max(1, Math.round(vw / aspect));

    const scale = w / vw;                       
    frame.style.width = `${vw}px`;
    frame.style.height = `${vh}px`;
    frame.style.transform = `scale(${scale.toFixed(5)})`;
  }

  return {
    node,
    resize: fit,
    activate: mount,
    deactivate: unmount,
    destroy: unmount,
    hold,
    suspend,
    resume,
    get isSuspended() { return suspended; },
    

    refresh() {
      if (!frame) return;
      const stale = Math.floor(Date.now() / (5 * 60 * 1000)) !== bucket;
      if (!stale && !failed) return;
      const wasFailed = failed;
      dead = false;
      unmount();
      wantFresh = wasFailed;
      mount();
    },
    get isLive() { return !!frame; }
  };
}

 



function fmtMoneyShort(n) {
  const sign = n < 0 ? '-$' : '$';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e3).toLocaleString()}k`;
  return fmtMoney(n);
}



function reportRows(rec) {
  const w = rec.planeW || 300;
  const h = rec.planeH || 170;
  const u = Math.max(11.2, w * 0.038);
  return Math.max(2, Math.min(8, Math.floor((h / u - 4.1) / 2.5)));
}



function reportDense(rec) {
  const w = rec.planeW || 300;
  return w / Math.max(11.2, w * 0.038) < 24;
}



function paginate(list, per) {
  const pages = Math.max(1, Math.ceil(list.length / Math.max(1, per)));
  const size = Math.ceil(list.length / pages);
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}



function streaksFresh(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String((data && data.asOf) || ''));
  if (!m) return false;
  const asOf = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return (Date.now() - asOf.getTime()) / 86400000 <= 3;
}

 
function rptRow(spec) {
  const kids = [
    el('i', { class: 'ccc-scr-rpt__fill', style: `--fill:${(spec.fill || 0).toFixed(3)}` })
  ];
  if (spec.rank) kids.push(el('span', { class: 'ccc-scr-rpt__rank', text: spec.rank }));
  kids.push(el('span', { class: 'ccc-scr-rpt__name', text: spec.name || '' }));
  if (spec.sub) kids.push(el('span', { class: 'ccc-scr-rpt__sub', text: spec.sub }));
  if (spec.val) kids.push(el('span', { class: 'ccc-scr-rpt__val', text: spec.val }));
  return el('div', { class: `ccc-scr-rpt__row${spec.cls ? ' ' + spec.cls : ''}` }, kids);
}

 
function rptSlide(kick, meta, body, extra) {
  return el('div', { class: `ccc-scr-rpt__slide${extra ? ' ' + extra : ''}` }, [
    el('div', { class: 'ccc-scr-rpt__head' }, [
      el('span', { class: 'ccc-scr-rpt__kick', text: kick }),
      meta ? el('span', { class: 'ccc-scr-rpt__meta', text: meta }) : null
    ]),
    body,
    el('div', { class: 'ccc-scr-rpt__tick', 'aria-hidden': 'true' }, [el('i')])
  ]);
}

const rptBody = (kids) => el('div', { class: 'ccc-scr-rpt__body' }, kids);



function buildReportCards(model, streaks, rows, promoOk, dense) {
  const cards = [];

  if (model) {
    cards.push({ kind: 'pulse' });

    
    
    
    
    
    const goal = model.stores.slice().sort((a, b) => {
      const pa = a.target > 0 ? a.gpTrend / a.target : -1;
      const pb = b.target > 0 ? b.gpTrend / b.target : -1;
      return pb - pa;
    });
    paginate(goal, rows).forEach((page, i, all) =>
      cards.push({ kind: 'goal', page, i, n: all.length, dense }));

    
    
    const conv = model.districts.slice()
      .sort((a, b) => (b.traffic ? b.mobile / b.traffic : 0) - (a.traffic ? a.mobile / a.traffic : 0));
    
    
    
    
    const convItems = conv.concat([Object.assign({ total: true }, model.market)]);
    paginate(convItems, rows).forEach((page, i, all) =>
      cards.push({ kind: 'yesterday', page, i, n: all.length, dense }));
  }

  if (streaks && Array.isArray(streaks.stores) && streaksFresh(streaks)) {
    const board = streaks.stores
      .filter((s) => num(s.days) !== null && s.status !== 'no-data')
      .sort((a, b) => num(b.days) - num(a.days));
    if (board.length) {
      cards.push({ kind: 'streak', board: board.slice(0, rows), goal: num(streaks.goalDays) || 30,
                   asOf: streaks.asOf });
    }
  }

  if (model) {
    if (model.dmMine.length) {
      paginate(model.dmMine, rows).forEach((page, i, all) =>
        cards.push({ kind: 'rank', of: 'dm', page, i, n: all.length, total: model.dmTotal, dense }));
    }
    if (model.regionRanks.length) {
      paginate(model.regionRanks, rows).forEach((page, i, all) =>
        cards.push({ kind: 'rank', of: 'region', page, i, n: all.length, dense,
                     total: model.regionRanks.length, mine: model.regionMine }));
    }
  }

  
  
  
  
  if (!cards.length) return promoOk === false ? [] : [{ kind: 'promo' }];

  
  
  if (promoOk !== false) {
    const woven = [];
    for (let i = 0; i < cards.length; i++) {
      woven.push(cards[i]);
      if ((i + 1) % PROMO_EVERY_N === 0) woven.push({ kind: 'promo' });
    }
    if (woven[woven.length - 1].kind !== 'promo') woven.push({ kind: 'promo' });
    return woven;
  }
  return cards;
}

function makeReport(rec) {
  const node = el('div', { class: 'ccc-scr-rpt' });
  const stage = el('div', { class: 'ccc-scr-rpt__stage' });

  let cards = [];
  let slides = [];
  let index = 0;
  let rows = 0;
  let dense = false;
  let timer = 0;
  let retryTimer = 0;
  let retries = 0;
  let active = false;
  let pending = false;
  let model = null;
  let streaks = null;
  let promoOk = true;

  const TITLE = () => rec.title || 'Daily Sales Report';
  const WAITING = 'Bringing up today’s numbers… tap to open the full Daily Sales Report.';
  const OFFLINE = 'Today’s numbers are not reachable right now. Tap to open the full Daily Sales Report.';

  node.style.setProperty('--rpt-slide', `${REPORT_SLIDE_MS}ms`);

  

  function showHolding(note) {
    node.replaceChildren(holdingCard(TITLE(), note));
    rec.panel.classList.remove('is-live');
  }

  

  function promoNode() {
    const art = el('div', { class: 'ccc-scr-art' });
    const bg = el('canvas', { class: 'ccc-scr-art__bg', width: '24', height: '17', 'aria-hidden': 'true' });
    const fg = el('img', { class: 'ccc-scr-art__fg', alt: '', 'aria-hidden': 'true', decoding: 'async' });
    
    
    fg.addEventListener('error', () => {
      if (rec.destroyed || promoOk === false) return;
      promoOk = false;
      build();
    }, { once: true });
    
    
    
    fg.src = PROMO_CARD_URL;
    art.append(bg, fg);
    return el('div', { class: 'ccc-scr-rpt__slide is-art' }, [
      art, el('div', { class: 'ccc-scr-rpt__tick', 'aria-hidden': 'true' }, [el('i')])
    ]);
  }

  function cardNode(card) {
    if (card.kind === 'promo') return promoNode();

    if (card.kind === 'pulse') {
      const m = model.market;
      const pct = m.target > 0 ? m.trend / m.target : 0;
      const cr = m.traffic > 0 ? m.mobile / m.traffic : 0;
      return rptSlide('The market', `${m.stores} stores`,
        el('div', { class: 'ccc-scr-rpt__hero' }, [
          el('span', { class: 'ccc-scr-rpt__num', text: pctWhole(pct) }),
          el('span', { class: 'ccc-scr-rpt__cap', text: 'of this month’s profit goal' }),
          
          
          
          el('span', { class: 'ccc-scr-rpt__line',
            text: `${fmtMoneyShort(m.trend)} trend · ${fmtMoneyShort(m.target)} goal` }),
          el('span', { class: 'ccc-scr-rpt__line',
            text: `${m.atGoal} of ${m.stores} stores at goal` })
        ]));
    }

    if (card.kind === 'goal') {
      return rptSlide('Profit goal',
        card.n > 1 ? `${card.i + 1}/${card.n}` : null,
        rptBody(card.page.map((s) => {
          const pct = s.target > 0 ? s.gpTrend / s.target : 0;
          return rptRow({
            name: s.name,
            sub: card.dense ? null : fmtMoneyShort(s.gpTrend),
            val: s.target > 0 ? pctWhole(pct) : '—',
            fill: Math.max(0, Math.min(1, pct)),
            cls: pct >= 1 ? 'is-hit' : (pct > 0 && pct < 0.9 ? 'is-miss' : '')
          });
        })));
    }

    if (card.kind === 'yesterday') {
      const best = Math.max(0.0001,
        ...card.page.filter((d) => !d.total)
                    .map((d) => (d.traffic ? d.mobile / d.traffic : 0)));
      const kids = card.page.map((d) => {
        const cr = d.traffic ? d.mobile / d.traffic : 0;
        return rptRow({
          
          
          
          name: d.total ? 'Market' : d.label,
          cls: d.total ? 'is-total' : '',
          sub: card.dense ? null : `${d.traffic.toLocaleString()} → ${d.mobile}`,
          val: pctStr(cr),
          fill: d.total ? 0 : Math.max(0, Math.min(1, cr / best))
        });
      });
      return rptSlide('Yesterday · close rate',
        card.n > 1 ? `${card.i + 1}/${card.n}` : null, rptBody(kids));
    }

    if (card.kind === 'streak') {
      return rptSlide('Clean streaks', `Goal ${card.goal} days`,
        rptBody(card.board.map((s, i) => {
          const days = num(s.days) || 0;
          return rptRow({
            rank: `#${num(s.rankMarket) || i + 1}`,
            name: s.store || s.storeFull || '',
            val: `${s.capped ? days + '+' : days} ${days === 1 ? 'day' : 'days'}`,
            fill: Math.max(0, Math.min(1, days / (card.goal || 30))),
            cls: (i < 3 ? 'is-podium' : '') + (s.goalMet || s.atGoal ? ' is-hit' : '')
          });
        })));
    }

    
    const isDM = card.of === 'dm';
    
    
    
    return rptSlide(isDM ? 'District managers' : 'Region rankings',
      `of ${card.total}`,
      rptBody(card.page.map((r) => rptRow({
        rank: `#${r.rank}`,
        name: r.name,
        
        
        
        val: card.dense ? null : fmtMoneyShort(r.avgGpTrend),
        fill: card.total > 0 ? Math.max(0, 1 - (r.rank - 1) / card.total) : 0,
        cls: (r.rank <= 3 ? 'is-podium' : '') +
             (!isDM && card.mine && card.mine(r.name) ? ' is-mine' : '')
      }))));
  }

  function show(i) {
    if (!slides.length) return;
    index = ((i % slides.length) + slides.length) % slides.length;
    for (let s = 0; s < slides.length; s++) {
      slides[s].classList.toggle('is-current', s === index);
    }
  }

  function build() {
    const next = buildReportCards(model, streaks, rows || reportRows(rec), promoOk, dense);
    if (!next.length) { showHolding(OFFLINE); return; }
    cards = next;
    slides = cards.map(cardNode);
    stage.replaceChildren(...slides);
    if (!node.contains(stage)) node.replaceChildren(stage);
    if (index >= slides.length) index = 0;
    show(index);
    rec.panel.classList.add('is-live');
    startTimer();
  }

  function startTimer() {
    if (timer || slides.length < 2 || !active) return;
    timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden' || pageViewing()) return;
      show(index + 1);
    }, REPORT_SLIDE_MS);
  }
  function stopTimer() { if (timer) { window.clearInterval(timer); timer = 0; } }
  function stopRetry() { if (retryTimer) { window.clearInterval(retryTimer); retryTimer = 0; } }

  

  function startRetry() {
    if (retryTimer || model || !active) return;
    retryTimer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (model || retries >= RETRY_LIMIT) { stopRetry(); return; }
      retries++;
      pull({ force: true });
    }, RETRY_EVERY_MS);
  }

  

  function pull({ force = false } = {}) {
    if (pending) return;
    pending = true;
    Promise.all([
      loadStreaks({ force }).catch(() => null),
      loadWorkbook({ force }).catch(() => null)
    ]).then(([s, m]) => {
      pending = false;
      if (rec.destroyed) return;
      if (s) streaks = s;
      if (m) { model = m; stopRetry(); }
      
      
      
      
      build();
      if (!model) startRetry();
    });
  }

  
  showHolding(WAITING);

  return {
    node,
    

    resize() {
      const next = reportRows(rec);
      const nextDense = reportDense(rec);
      if (next === rows && nextDense === dense) return;
      rows = next;
      dense = nextDense;
      if (model || streaks) build();
    },
    activate() {
      active = true;
      rows = reportRows(rec);
      dense = reportDense(rec);
      if (!model) { pull(); startRetry(); }
      else startTimer();
    },
    deactivate() {
      active = false;
      stopTimer();
      stopRetry();
    },
    

    refresh() {
      retries = 0;
      pull({ force: !model });
      if (!model) startRetry();
    },
    destroy() {
      stopTimer();
      stopRetry();
      slides = [];
      cards = [];
    }
  };
}

const RENDERERS = {
  title: makeTitle, image: makeImage, feed: makeFeed, live: makeLive, report: makeReport
};




const records = new Set();
let narrowMQ = null;
let isNarrow = false;
let narrowHostResolver = null;



let phoneMQ = null;
let isPhone = false;

 
function liveBudget() {
  return isPhone ? MAX_LIVE_FRAMES_PHONE : MAX_LIVE_FRAMES;
}

function initNarrowWatch() {
  if (narrowMQ) return;
  narrowMQ = window.matchMedia(NARROW_MEDIA);
  isNarrow = narrowMQ.matches;
  const onChange = () => {
    const next = narrowMQ.matches;
    if (next === isNarrow) return;
    isNarrow = next;
    for (const rec of records) relocate(rec);
    reconcile();
  };
  if (narrowMQ.addEventListener) narrowMQ.addEventListener('change', onChange);
  else if (narrowMQ.addListener) narrowMQ.addListener(onChange);

  phoneMQ = window.matchMedia(PHONE_MEDIA);
  isPhone = phoneMQ.matches;
  
  
  const onPhoneChange = () => {
    const next = phoneMQ.matches;
    if (next === isPhone) return;
    isPhone = next;
    reconcile();
  };
  if (phoneMQ.addEventListener) phoneMQ.addEventListener('change', onPhoneChange);
  else if (phoneMQ.addListener) phoneMQ.addListener(onPhoneChange);
}

 
function roomOf(host) {
  const stage = host.closest ? host.closest('.stage') : null;
  const room = host.closest ? host.closest('[data-room]') : null;
  return {
    stage: stage || host.parentElement,
    room,
    roomId: room ? (room.getAttribute('data-room') || '') : ''
  };
}



function narrowHostFor(rec) {
  const { stage, room, roomId } = roomOf(rec.host);
  if (typeof rec.narrowHostFn === 'function') {
    const supplied = rec.narrowHostFn({ slug: rec.slug, mode: rec.mode, room: roomId, host: rec.host });
    if (supplied && supplied.nodeType) return supplied;
  }
  const declared = (room || stage || document).querySelector('[data-screens-narrow]');
  if (declared) return declared;
  if (!stage) return null;

  let layer = stage.querySelector(':scope > .ccc-scr-layer');
  if (!layer) {
    layer = el('div', {
      class: `ccc-scr-layer ccc-scr-layer--${roomId || 'room'}`,
      'data-screens-layer': roomId || '',
      'aria-hidden': 'false'
    });
    const rail = stage.querySelector(':scope > .rail');
    stage.insertBefore(layer, rail || null);
  }
  return layer;
}

 
function relocate(rec) {
  if (rec.destroyed) return;
  const wantNarrow = isNarrow;
  if (wantNarrow === rec.narrow && rec.panel.isConnected) return;

  rec.narrow = wantNarrow;
  rec.panel.classList.toggle('ccc-scr--narrow', wantNarrow);

  if (wantNarrow) {
    const band = narrowHostFor(rec);
    if (band) {
      band.append(rec.panel);
      rec.band = band;
      band.style.setProperty('--scr-count', String(band.children.length));
    }
    rec.panel.style.setProperty('--scr-ar', String(NARROW_AR[rec.mode] || 1.7778));
    
    rec.plane.style.width = '';
    rec.plane.style.height = '';
    rec.plane.style.transform = '';
    rec.panel.style.removeProperty('--scr-ox');
    rec.panel.style.removeProperty('--scr-oy');
    rec.panel.classList.remove('ccc-scr--quad');
  } else {
    rec.host.append(rec.panel);
    if (rec.band) {
      const band = rec.band;
      rec.band = null;
      band.style.setProperty('--scr-count', String(Math.max(1, band.children.length)));
      if (!band.children.length && band.classList.contains('ccc-scr-layer')) band.remove();
    }
  }

  const stage = roomOf(rec.host).stage;
  if (stage) stage.setAttribute('data-ccc-screens', wantNarrow ? 'narrow' : 'wide');

  applyGeometry(rec);
}






function resolveQuadPx(rec, hostRect, k) {
  const ref = rec.quadRef;
  let ox = 0, oy = 0;
  let rw = rec.host.offsetWidth, rh = rec.host.offsetHeight;

  if (ref && ref !== rec.host) {
    const rb = ref.getBoundingClientRect();
    if (!rb.width || !rb.height) return null;
    ox = (rb.left - hostRect.left) * k;
    oy = (rb.top - hostRect.top) * k;
    rw = ref.offsetWidth; rh = ref.offsetHeight;
  }
  if (!rw || !rh) return null;

  const pts = rec.quad.map(([x, y]) => [ox + (x / 100) * rw, oy + (y / 100) * rh]);
  return isSaneQuad(pts) ? pts : null;
}



function applyGeometry(rec) {
  if (rec.destroyed || !rec.plane) return;

  let applied = false;
  let W = 0, H = 0;

  if (rec.narrow) {
    
    
    W = rec.panel.offsetWidth; H = rec.panel.offsetHeight;
  } else {
    const hostRect = rec.host.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return;     
    
    const k = rec.host.offsetWidth ? rec.host.offsetWidth / hostRect.width : 1;

    if (rec.quad) {
      const dst = resolveQuadPx(rec, hostRect, k);
      if (dst) {
        const w = Math.max(8, Math.round((dist2d(dst[0], dst[1]) + dist2d(dst[3], dst[2])) / 2));
        const h = Math.max(8, Math.round((dist2d(dst[0], dst[3]) + dist2d(dst[1], dst[2])) / 2));
        const hom = computeHomography([[0, 0], [w, 0], [w, h], [0, h]], dst);
        const matrix = hom && homographyToMatrix3d(hom);
        if (matrix) {
          rec.plane.style.width = `${w}px`;
          rec.plane.style.height = `${h}px`;
          rec.plane.style.transform = matrix;
          W = w; H = h;
          applied = true;
          
          
          const ox = (dst[0][0] + dst[1][0] + dst[2][0] + dst[3][0]) / 4;
          const oy = (dst[0][1] + dst[1][1] + dst[2][1] + dst[3][1]) / 4;
          rec.panel.style.setProperty('--scr-ox', `${ox.toFixed(1)}px`);
          rec.panel.style.setProperty('--scr-oy', `${oy.toFixed(1)}px`);
        }
      }
      if (!applied && !rec.quadWarned) {
        rec.quadWarned = true;
        console.warn(`[screens] "${rec.slug}": degenerate quad, falling back to the host box`);
      }
    }

    if (!applied) {
      rec.plane.style.width = '';
      rec.plane.style.height = '';
      rec.plane.style.transform = '';
      rec.panel.style.removeProperty('--scr-ox');
      rec.panel.style.removeProperty('--scr-oy');
      
      
      W = rec.host.offsetWidth; H = rec.host.offsetHeight;
    }
  }

  if (!W || !H) return;
  rec.planeW = W;
  rec.planeH = H;
  rec.panel.classList.toggle('ccc-scr--quad', applied);

  
  
  rec.plane.style.setProperty('--scr-w', W.toFixed(1));
  rec.plane.style.setProperty('--scr-h', H.toFixed(1));
  
  
  
  
  
  
  
  
  
  
  rec.plane.style.setProperty('--scr-u', `${Math.max(9, W / (rec.narrow ? 27 : 40)).toFixed(2)}px`);

  if (rec.api && rec.api.resize) rec.api.resize(rec);
}




 
const rooms = [];
let roomsObs = null;



let c2Live = false;
 
let ownedRoom = null;
 
let fallbackOwner = null;
 
let ownershipDirty = false;

let scrolling = false;
let settleT = 0;
let cancelBoards = null;   
let cancelSweep = null;    
let resumeAt = 0;          
let resumeT = 0;

function roomIndex(roomEl) { return roomEl ? rooms.indexOf(roomEl) : -1; }



function isOwned(rec) {
  if (!rec.roomEl) return true;
  if (c2Live) return rec.roomEl.classList.contains('is-owned');
  return rec.roomEl === fallbackOwner;
}



function geometryOwner() {
  let best = null, bestOv = 0;
  const vh = window.innerHeight;
  for (const r of rooms) {
    const b = r.getBoundingClientRect();
    const ov = Math.min(b.bottom, vh) - Math.max(b.top, 0);
    if (ov > bestOv) { bestOv = ov; best = r; }
  }
  return best;
}

function stageOf(roomEl) {
  return roomEl ? (roomEl.querySelector(':scope > .stage') || roomEl) : null;
}



function roomVisible(roomEl) {
  const st = stageOf(roomEl);
  if (!st) return true;
  const vh = window.innerHeight;
  const r = st.getBoundingClientRect();
  if (!r.width || r.bottom <= 0 || r.top >= vh) return false;
  const cs = getComputedStyle(st);
  if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.01) return false;
  const i = rooms.indexOf(roomEl);
  if (i < 0) return true;
  for (let j = i + 1; j < rooms.length && j <= i + 2; j++) {
    const s2 = stageOf(rooms[j]);
    if (!s2) continue;
    const r2 = s2.getBoundingClientRect();
    if (r2.top > 0.5 || r2.bottom < vh - 0.5) continue;
    const c2 = getComputedStyle(s2);
    if (c2.visibility !== 'hidden' && parseFloat(c2.opacity) >= 0.99) return false;
  }
  return true;
}



function panelDist(rec) {
  const r = (rec.narrow ? rec.panel : rec.plane).getBoundingClientRect();
  return Math.abs((r.top + r.height / 2) - window.innerHeight / 2);
}

 
function residentOk(rec) {
  return !isPhone || !rec.roomEl || !rec.roomEl.classList.contains('is-dormant');
}

 



function applyPower({ arming = false } = {}) {
  const tier = motionTier();
  const owner = c2Live ? ownedRoom : fallbackOwner;
  const oi = roomIndex(ownedRoom);
  for (const rec of records) {
    if (rec.destroyed) continue;
    const p = rec.panel;
    p.classList.toggle('ccc-scr--owned', !rec.roomEl || rec.roomEl === owner);
    if (!c2Live || !rec.roomEl || tier === 'off') {
      if (p.hasAttribute('data-power')) p.removeAttribute('data-power');
      continue;
    }
    const i = roomIndex(rec.roomEl);
    if (i < 0) continue;
    if (rec.roomEl === ownedRoom) {
      if (p.getAttribute('data-power') !== 'on') p.setAttribute('data-power', 'on');
    } else if (arming && !p.hasAttribute('data-power')) {
      p.setAttribute('data-power', 'off');
    } else if (ownedRoom && oi >= 0 && Math.abs(i - oi) >= 2) {
      
      
      
      if (p.getAttribute('data-power') !== 'off') p.setAttribute('data-power', 'off');
    }
  }
}

function currentOwned(hint) {
  for (const r of rooms) if (r.classList.contains('is-owned')) return r;
  const any = document.querySelector('.room.is-owned');
  if (any) return any;
  if (hint) {
    try { return document.querySelector(`.room[data-room="${CSS.escape(String(hint))}"]`) || null; }
    catch { return null; }
  }
  return null;
}



function onOwnership(hint) {
  const owned = currentOwned(hint);
  const arming = !c2Live && (owned !== null || hint !== undefined);
  if (arming) c2Live = true;
  if (!c2Live) { scheduleBoards(); return; }
  if (pageViewing()) {
    
    
    ownershipDirty = true;
    return;
  }
  ownershipDirty = false;
  if (owned !== ownedRoom || arming) {
    ownedRoom = owned;
    applyPower({ arming });
  }
  sweepSoon();
  scheduleBoards();
}

function trackRooms(roomEl) {
  if (!roomEl || !roomEl.parentElement) return;
  let added = false;
  for (const r of roomEl.parentElement.children) {
    if (!r.classList || !r.classList.contains('room') || rooms.includes(r)) continue;
    rooms.push(r);
    added = true;
    if (typeof MutationObserver === 'function') {
      if (!roomsObs) roomsObs = new MutationObserver(() => onOwnership());
      roomsObs.observe(r, { attributes: true, attributeFilter: ['class'] });
    }
  }
  if (added) {
    rooms.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (!c2Live && currentOwned()) onOwnership();
  }
}

document.addEventListener('ccc:room-owned', (e) => {
  const id = e && e.detail && e.detail.id;
  onOwnership(id === undefined ? null : id);
});



if (typeof MutationObserver === 'function') {
  new MutationObserver(() => applyPower()).observe(document.documentElement,
    { attributes: true, attributeFilter: ['data-motion'] });
}
try {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onRm = () => applyPower();
  if (mq.addEventListener) mq.addEventListener('change', onRm);
  else if (mq.addListener) mq.addListener(onRm);
} catch {   }

 

function onScrollish() {
  scrolling = true;
  if (settleT) window.clearTimeout(settleT);
  settleT = window.setTimeout(() => {
    settleT = 0;
    scrolling = false;
    scheduleBoards();
  }, SETTLE_MS);
}
window.addEventListener('scroll', onScrollish, { passive: true });
window.addEventListener('resize', onScrollish, { passive: true });



function scheduleBoards() {
  if (cancelBoards || scrolling) return;
  cancelBoards = onIdle(reconcileBoards);
}



function sweepSoon() {
  if (cancelSweep) return;
  cancelSweep = onIdle(() => { cancelSweep = null; sweepBoards(); }, 700);
}

function liveRecs() {
  const out = [];
  for (const rec of records) if (!rec.destroyed && rec.mode === 'live') out.push(rec);
  return out;
}

function deactivateBoard(rec) {
  rec.active = false;
  rec.api.deactivate(rec);
}



function sweepBoards() {
  if (pageViewing()) return;
  const gone = [];
  for (const rec of liveRecs()) {                                  
    if (!rec.active || isOwned(rec)) continue;
    if (!rec.wantsMount || !residentOk(rec) || !roomVisible(rec.roomEl)) gone.push(rec);
  }
  for (const rec of gone) deactivateBoard(rec);                    
  if (gone.length) holdBoards();
}

 
function holdBoards() {
  for (const rec of liveRecs()) {
    if (rec.wantsMount && !rec.active && rec.api.hold) rec.api.hold(rec);
  }
}



function suspendBoards() {
  if (cancelBoards) { cancelBoards(); cancelBoards = null; }
  for (const rec of liveRecs()) {
    if (!rec.active) continue;
    if (rec.deckArrived && rec.api.suspend) rec.api.suspend();
    else deactivateBoard(rec);
  }
  holdBoards();
}



function reconcileBoards() {
  cancelBoards = null;
  if (scrolling) return;                               
  if (pageViewing()) {
    suspendBoards();
    
    if (!viewerOpen) window.setTimeout(scheduleBoards, 500);
    return;
  }
  const wait = resumeAt - Date.now();
  if (wait > 0) {
    if (!resumeT) resumeT = window.setTimeout(() => { resumeT = 0; scheduleBoards(); }, wait);
    return;
  }
  
  
  let repower = false;
  if (ownershipDirty) {
    ownershipDirty = false;
    ownedRoom = currentOwned();
    repower = true;
  }

  const live = liveRecs();

  
  if (!c2Live) {
    const owner = geometryOwner();
    if (owner !== fallbackOwner) { fallbackOwner = owner; repower = true; }
  }
  const info = live.map((rec) => {
    const owned = isOwned(rec);
    return {
      rec,
      owned,
      want: rec.wantsMount && owned && residentOk(rec),
      d: rec.wantsMount ? panelDist(rec) : Infinity,
      visible: rec.active && !owned ? roomVisible(rec.roomEl) : true
    };
  });

  
  const budget = liveBudget();
  const wanted = info.filter((x) => x.want).sort((a, b) => a.d - b.d).slice(0, budget);
  const keep = new Set(wanted);
  
  
  let slots = budget - wanted.length;
  const leaving = info.filter((y) => y.rec.active && !keep.has(y) && y.visible &&
                                     y.rec.wantsMount && residentOk(y.rec))
                      .sort((a, b) => a.d - b.d);
  for (const x of leaving) {
    if (slots <= 0) break;
    keep.add(x);
    slots--;
  }

  
  if (repower) applyPower();
  for (const x of info) {
    if (x.rec.active && !keep.has(x)) deactivateBoard(x.rec);
  }
  let mounted = 0;
  let more = false;
  for (const x of wanted) {
    const { rec } = x;
    if (rec.active) {
      if (rec.api.isSuspended) rec.api.resume();
      if (rec.refreshWanted) { rec.refreshWanted = false; if (rec.api.refresh) rec.api.refresh(rec); }
      continue;
    }
    
    
    if (mounted >= 1) { more = true; continue; }
    rec.active = true;
    rec.refreshWanted = false;
    rec.api.activate(rec);
    mounted++;
  }
  for (const x of info) {
    if (keep.has(x) && !wanted.includes(x) && x.rec.api.isSuspended) x.rec.api.resume();
  }
  holdBoards();
  if (more) scheduleBoards();
}



function reconcile() {
  if (pageViewing()) {
    
    
    
    suspendBoards();
    return;
  }
  for (const rec of records) {
    if (rec.destroyed || rec.mode === 'live') continue;
    if (rec.wantsMount && !rec.active) { rec.active = true; rec.api.activate(rec); }
    else if (!rec.wantsMount && rec.active) { rec.active = false; rec.api.deactivate(rec); }
  }
  holdBoards();
  sweepSoon();
  scheduleBoards();
}

document.addEventListener('ccc:viewer-open', () => {
  viewerOpen = true;
  suspendBoards();
});
document.addEventListener('ccc:viewer-close', () => {
  viewerOpen = false;
  
  
  
  resumeAt = Date.now() + RESUME_MS;
  if (resumeT) window.clearTimeout(resumeT);
  resumeT = window.setTimeout(() => {
    resumeT = 0;
    if (ownershipDirty && c2Live) onOwnership();
    reconcile();
  }, RESUME_MS);
});

 
function applyMeta(rec) {
  const tool = getTool(rec.slug);
  if (tool) {
    if (!rec.url) rec.url = tool.url || null;
    if (!rec.title) rec.title = tool.label || null;
    if (!rec.headline) rec.headline = rec.title || rec.slug;
  }
  const name = rec.title || rec.headline || rec.slug;
  rec.label.textContent = `Open ${name}`;
  rec.hit.setAttribute('aria-label', `Open ${name}`);
  if (rec.capName) rec.capName.textContent = name;
  if (rec.mode === 'title') {
    const nameNode = rec.content && rec.content.querySelector('.ccc-scr-title__name');
    if (nameNode) nameNode.textContent = rec.headline || name;
    if (rec.api && rec.api.resize) rec.api.resize(rec);
  }
}






export function mountScreen(cfg = {}) {
  const { host, slug } = cfg;
  if (!host || !host.nodeType) {
    console.warn('[screens] mountScreen: no host element');
    return { destroy: noop, refresh: noop, host: null, slug, mode: null };
  }
  injectStyles();
  initNarrowWatch();

  const mode = MODES.has(cfg.mode) ? cfg.mode : (SCREEN_MODES[slug] || 'title');

  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  

  host.style.pointerEvents = 'none';

  const glass = el('div', { class: 'ccc-scr__glass' });
  const label = el('span', { class: 'ccc-sr-only' });
  const hit = el('button', { class: 'ccc-scr__hit', type: 'button' }, [label]);
  hit.setAttribute('data-tool', slug);        

  
  
  
  
  
  const capName = el('b', { text: '' });
  const cap = el('div', { class: 'ccc-scr__cap', 'aria-hidden': 'true' }, [
    capName, el('i', { text: 'Tap to open' })
  ]);
  const plane = el('div', { class: 'ccc-scr__plane' }, [
    el('div', { class: 'ccc-scr__glow', 'aria-hidden': 'true' }),
    glass,
    el('div', { class: 'ccc-scr__scan', 'aria-hidden': 'true' }),
    el('div', { class: 'ccc-scr__crt', 'aria-hidden': 'true' }),
    el('div', { class: 'ccc-scr__sheen', 'aria-hidden': 'true' }),
    el('div', { class: 'ccc-scr__bezel', 'aria-hidden': 'true' }),
    cap,
    hit
  ]);
  const panel = el('div', { class: `ccc-scr ccc-scr--${mode}`, 'data-screen-panel': slug }, [plane]);

  const rec = {
    host, slug, mode, panel, plane, glass, hit, label, cap, capName,
    quad: validQuad(cfg.quad) ? cfg.quad.map((pt) => [Number(pt[0]), Number(pt[1])]) : null,
    quadRef: cfg.quadRef && cfg.quadRef.nodeType ? cfg.quadRef : null,
    quadWarned: false,
    narrowHostFn: typeof cfg.narrowHost === 'function' ? cfg.narrowHost : null,
    url: cfg.url || null,
    title: cfg.title || null,
    headline: cfg.headline || cfg.title || null,
    renderWidth: Number(cfg.width) > 0 ? Number(cfg.width) : LIVE_RENDER_WIDTH,
    planeW: 0, planeH: 0,
    narrow: null,
    band: null,
    
    
    
    
    roomEl: roomOf(host).room,
    active: false,
    wantsMount: false,
    refreshWanted: false,                      
    destroyed: false,
    content: null,
    api: null,
    io: null,
    resizeObs: null,
    resizeRaf: 0
  };
  if (cfg.quad && !rec.quad) {
    console.warn(`[screens] "${slug}": malformed quad, using the host box`);
  }

  applyMeta(rec);                              
  rec.api = RENDERERS[mode](rec);
  rec.content = el('div', { class: 'ccc-scr__content' }, [rec.api.node]);
  glass.append(rec.content);

  host.append(panel);
  records.add(rec);

  relocate(rec);                               
  applyMeta(rec);                              

  

  trackRooms(rec.roomEl);
  if (c2Live && rec.roomEl) {
    const owned = rec.roomEl.classList.contains('is-owned');
    panel.classList.toggle('ccc-scr--owned', owned);
    if (motionTier() !== 'off') panel.setAttribute('data-power', owned ? 'on' : 'off');
  }

  

  if ('IntersectionObserver' in window) {
    rec.io = new IntersectionObserver((entries) => {
      for (const entry of entries) rec.wantsMount = entry.isIntersecting;
      reconcile();
    }, { root: null, rootMargin: IO_MARGIN[mode] || IO_MARGIN.image, threshold: 0 });
    rec.io.observe(panel);
  } else {
    rec.wantsMount = true;
    reconcile();
  }

  if ('ResizeObserver' in window) {
    rec.resizeObs = new ResizeObserver(() => {
      
      if (rec.resizeRaf) return;
      rec.resizeRaf = requestAnimationFrame(() => {
        rec.resizeRaf = 0;
        applyGeometry(rec);
      });
    });
    rec.resizeObs.observe(rec.quadRef || host);
    if ((rec.quadRef || host) !== host) rec.resizeObs.observe(host);
    rec.resizeObs.observe(panel);
  }

  return {
    host, slug, mode,
    refresh: () => applyGeometry(rec),
    destroy() {
      if (rec.destroyed) return;
      rec.destroyed = true;
      if (rec.active) { rec.active = false; rec.api.deactivate(rec); }
      rec.api.destroy();
      if (rec.io) rec.io.disconnect();
      if (rec.resizeObs) rec.resizeObs.disconnect();
      if (rec.resizeRaf) cancelAnimationFrame(rec.resizeRaf);
      records.delete(rec);
      const band = rec.band;
      panel.remove();
      if (band && !band.children.length && band.classList.contains('ccc-scr-layer')) band.remove();
    }
  };
}






export function mountRoomScreens(root = document, opts = {}) {
  if (opts.tools) registerTools(opts.tools);
  injectStyles();

  const hosts = Array.from(root.querySelectorAll('[data-screen]'));
  return hosts
    .filter((host) => !host.querySelector(':scope > .ccc-scr'))
    .map((host) => mountScreen({
      host,
      slug: host.getAttribute('data-screen'),
      mode: host.getAttribute('data-screen-mode') || undefined,
      url: host.getAttribute('data-screen-url') || undefined,
      title: host.getAttribute('data-screen-title') || undefined,
      headline: host.getAttribute('data-screen-name') || undefined,
      quad: parseQuadAttr(host.getAttribute('data-screen-quad')),
      width: Number(host.getAttribute('data-screen-width')) || undefined,
      narrowHost: opts.narrowHost
    }));
}

 
export function refreshScreens() {
  for (const rec of records) applyGeometry(rec);
  reconcile();
}

 
window.addEventListener('orientationchange', () => {
  setTimeout(refreshScreens, 200);
});



document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  let boards = false;
  for (const rec of records) {
    if (rec.destroyed || !rec.active || !rec.api) continue;
    if (typeof rec.api.refresh !== 'function') continue;
    
    
    if (rec.mode === 'live') { rec.refreshWanted = true; boards = true; continue; }
    if (!pageViewing()) rec.api.refresh(rec);
  }
  if (boards) scheduleBoards();
});



