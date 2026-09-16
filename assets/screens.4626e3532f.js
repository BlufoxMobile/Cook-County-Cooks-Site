/* =============================================================================
 * Cook County Cooks — v4 "Alive"
 * assets/screens.js  ·  the room screens
 * -----------------------------------------------------------------------------
 * This module owns every screen, monitor, TV and tablet in the restaurant. It
 * takes that job over from the second half of overlay.js, which now owns only
 * the full-screen tool viewer (openTool / closeTool). The two still meet in one
 * place and one place only: every screen's hit target carries `data-tool`, so
 * overlay.js's delegated handler opens the tool — which means the freezer gate,
 * the deep-link router and the focus-return all keep working untouched.
 *
 * FIVE MODES. A screen declares one with `data-screen-mode`:
 *
 *   title  the three Pass tablets. Too small to render a web page at any zoom,
 *          so they render the ONE thing that matters — the tool's name, set in
 *          the site's display face and auto-fitted to the glass — plus a quiet
 *          "Tap to open". Live glass, not a label: glow, scanlines, a refresh
 *          shimmer and a CRT power-on that rides the engine.
 *
 *   image  the Host Stand TV. The daily promo card straight out of the Daily
 *          Sales Report's own data directory, cache-busted in the same 10-minute
 *          buckets the source app uses. Held frozen — no rotation. Fitted with a
 *          blurred same-image backdrop so a 1.40 card in a 1.52 screen goes edge
 *          to edge instead of sitting in two black bars.
 *
 *   feed   the Back Office monitor. `nps-detractor-streaks.json`, rendered as a
 *          rotating board, ONE DISTRICT PER SLIDE, big numerals, 30-day goal
 *          meters, and real celebration for a met goal or a new personal record.
 *
 *   live   the two Dining boards. Real iframes of the Win the Weekend decks,
 *          rendered into a virtual viewport and scaled down. The decks are
 *          FLUID, so the number that decides everything is that viewport's
 *          HEIGHT: tall enough for the deck's tallest slide or the slide is
 *          cut off, no taller than that or the scale factor — and with it
 *          every glyph on the glass — is smaller than it needs to be. Each
 *          board runs at its own measured floor. See LIVE_MIN_VIRTUAL_H.
 *
 *   report the Break Room television. The Daily Sales Report's own numbers,
 *          composed natively for a 297px screen and cycled like a TV. It
 *          exists because that panel CANNOT iframe the deck: the deck is a
 *          fixed 1920x1080 canvas that scales itself, so its type lands at
 *          panelWidth/1920 whatever viewport it is handed — 4.3px store names
 *          on an 18.4%-of-plate television. See the MODE: report block in §3
 *          for the whole measurement.
 *
 * NARROW VIEWPORTS. Below `(max-width: 900px), (max-aspect-ratio: 8/7)` a 16:9
 * plate cover-cropped into a 3:4 viewport throws away a third of the frame, and
 * a screen mounted in the art stops being readable. So the screens LEAVE the
 * art: each room's panels relocate into a full-width band pinned under the top
 * bar (`.ccc-scr-layer`), sized so the whole set fits above the rail. Nothing
 * about the page layout is assumed — see `narrowHost` in mountRoomScreens() and
 * the class-hook list at the bottom of this file.
 *
 * CONTRACT NOTES (SPEC.md + SPEC-v4.md)
 *   · Plain ES module, no dependencies, no build step.
 *   · No second rAF loop. Every power-on, glow and dissolve is composed in CSS
 *     from the engine's own `--enter` / `--bloom` / `--p`.
 *   · Only transform / opacity / filter animate.
 *   · Never blocks first paint; both feeds fail soft to a branded holding card.
 *   · prefers-reduced-motion: no shimmer, no scanline travel, no slide
 *     animation — the feed still advances, plainly.
 *
 * EXPORTS
 *   mountScreen(cfg)            -> handle { destroy, refresh, host, slug, mode }
 *   mountRoomScreens(root, opt) -> handle[]
 *   registerTools(tools)        -> void         (url/label lookup)
 *   refreshScreens()            -> void         (re-measure everything)
 *   SCREEN_MODES, NARROW_MEDIA, PROMO_CARD_URL, STREAKS_URL, EXCEL_URL
 * ========================================================================== */

/* -----------------------------------------------------------------------------
 * 0 · Constants
 * -------------------------------------------------------------------------- */

/** The two public, CORS-open data files behind the Host Stand and Back Office. */
import { freshUrl } from './overlay.2404daeb1c.js';
/* Same reason as overlay.js §6: an iframe's `load` fires for a 404, a 500, an
   error page and a refused frame alike, so a live board that 404s was being
   revealed as the board. preflight.js carries the twelve-shape measurement. */
import { preflight, preflightCopy } from './preflight.8a6e597fbb.js';   // shared fresh-load cache buster

export const PROMO_CARD_URL =
  'https://raw.githubusercontent.com/BlufoxMobile/Daily-Sales-Report/main/data/promo-card.jpg';
export const STREAKS_URL =
  'https://raw.githubusercontent.com/BlufoxMobile/Daily-Sales-Report/main/data/nps-detractor-streaks.json';
/** The third one, and the heavy one: the workbook every number in the deck is
 *  computed from. Read ONLY by `report`, and only once a report panel arms. */
export const EXCEL_URL =
  'https://raw.githubusercontent.com/BlufoxMobile/Daily-Sales-Report/main/data/Sales%20Report.xlsx';

/** Ten-minute buckets — exactly what the source app does. */
const BUCKET_MS = 600000;

/** Floor for the virtual desktop WIDTH a `live` iframe renders at before it is
 *  scaled down. rooms.js may raise it per panel with `width`; nothing lowers
 *  it. In practice LIVE_MIN_VIRTUAL_H below is what decides, because the decks
 *  are height-bound, not width-bound. */
const LIVE_RENDER_WIDTH = 960;

/** ⚠ THE ONE NUMBER THE DINING BOARDS TURN ON.
 *
 *  A `live` panel renders its deck into a virtual viewport and scales that
 *  uniformly into the glass. The viewport takes the PANEL'S OWN ASPECT — width
 *  `round(H * aspect)`, height `H` — so the scaled frame covers the glass
 *  corner to corner with no bars and no crop. That has never been the bug.
 *
 *  What the number decides is SIZE. Both Win-the-Weekend decks are FLUID, not
 *  fixed-canvas: `.s{min-height:100vh; display:flex; justify-content:safe
 *  center; overflow-y:auto}`, one slide at a time on their own 7s timer, laid
 *  out against whatever viewport they are handed and cut by the body when it
 *  does not fit. So `H` is a two-sided constraint: too small and slides are
 *  cut off (the client, twice); too large and the scale factor `panelW / vw`
 *  is smaller than it needs to be and every glyph on the glass shrinks with it
 *  (the client, once he saw 960).
 *
 *  ── WHY THE BOARDS LOOK EMPTY, WHICH IS NOT THE SAME QUESTION ─────────────
 *  Most of the black on a Top-5 board is the DECK'S own margin, not our scale.
 *  Measured at the 1703x960 the boards shipped at: `.t5{max-width:900px;
 *  margin:0 auto}` puts that card in 900 of 1703px, so 47% of the glass width
 *  is the deck centring itself; `justify-content:safe center` then centres its
 *  656px of content in 960px and spends another 32% of the height. The widest
 *  thing either deck ever draws is `.dg{max-width:1400px}`. None of that is
 *  reachable from here: the crop would have to be uniform, and HEIGHT is
 *  already the binding dimension, so trimming width buys exactly nothing.
 *
 *  ── WHY NOT JUST HAND THEM A NARROW VIEWPORT ──────────────────────────────
 *  Because their type is `clamp(min_rem, k*vw, max_rem)` and at any width at
 *  or above ~1010px every vw-driven size is already pinned at its MAX cap —
 *  `.hd h2` 3.8rem/60.8px, `.t5p` 2.6rem/41.6px, `.t5v` 2.4rem/38.4px, `.t5nm`
 *  2.2rem/35.2px — measured identical at vw 1300, 1500, 1703 and 2200. The
 *  knee where narrowing would start to pay is at vw ~1010 and we can never
 *  reach it: below vw 1300 the store-rankings table is cut off SIDEWAYS inside
 *  `.tw{overflow:auto; max-width:1300px}` with its nowrap cells — measured
 *  -37px at vw 1250 and -172px at vw 1100. Height is the only lever there is.
 *
 *  ── THE CURVE, MEASURED ───────────────────────────────────────────────────
 *  Each deck driven slide by slide at `round(aspect*H) x H`, with its own row
 *  animations parked at their end state first — the decks start their rows on
 *  a translateY, so an unsettled scrollHeight over-reports by 20-40px and an
 *  unsettled rect under-reports the NPS boards, which self-fit — and a slide
 *  counted as cut when any painted or text box lands outside the viewport or
 *  outside a scroll-clipping ancestor:
 *
 *      H     vw(chi)  Chicago (17)        vw(bs)  Big South (18)
 *      541    960     9 cut, worst -904    956    11 cut, worst -362
 *      721   1279     1 cut, worst -728   1275     3 cut, worst -189
 *      811   1439     1 cut, worst  -43   1434     1 cut, worst  -99
 *      853   1513     0 cut               1508     1 cut, worst  -57
 *      880   1561     0 cut  ← SHIPPED    1556     1 cut, worst  -30
 *      902   1600     0 cut               1595     1 cut, worst   -8
 *      910   1614     0 cut               1609     0 cut
 *      935   1659     0 cut               1653     0 cut  ← SHIPPED
 *      960   1703     0 cut               1697     0 cut  (both, before)
 *
 *  The floor is ONE SLIDE in each deck, and it is a different slide, which is
 *  why this is per board and not one shared number. Every other slide clears
 *  its deck's floor by a mile:
 *
 *      Chicago   853  District Ranker   (next tallest: Top 5 Money Makers 721,
 *                                        the other Top 5 boards 687, Store
 *                                        Rankings 510, Top 10 NPS 488)
 *      Big South 910  Top 10 NPS        (next tallest: District Ranker 758,
 *                                        Head Chef 743, Store Rankings 718,
 *                                        the Top 5 boards 533-575)
 *
 *  Below 811 a second cliff opens: the District Ranker's
 *  `repeat(auto-fit,minmax(320px,1fr))` grid needs vw >= 1416 to keep its four
 *  districts on one row, and the aspect-locked vw falls under that at H < 799.
 *
 *  ── WHAT IS SHIPPED, AND WHAT IT COSTS ────────────────────────────────────
 *  880 and 935: each deck's measured floor plus ~3%. That is +9.1% of scale on
 *  Chicago and +2.7% on Big South against the 960 both were running at, and it
 *  spends headroom to get it — Chicago 107px down to 27px, Big South 51px to
 *  25px. 3% is the honest margin here, not a round number chosen to look safe:
 *  neither deck's growth quantum fits in ANY margin we could afford (one more
 *  metric tile row on a District Ranker card is +85px, one more NPS row is
 *  +81px), so the margin can only absorb sub-row drift — a font metric, a
 *  longer label, a border — and 960 never covered a row either.
 *
 *  The ceiling, for whoever asks next: the absolute floors 853/910 with zero
 *  margin are +12.5% and +5.6%. That is ALL the size that exists in an iframe
 *  of these decks. At 1440 it moves a Top-5 store name from 7.9 rendered CSS
 *  px to 8.9 at best. If these boards have to be legible rather than merely
 *  whole, the answer is the one the Back Office and the Break Room already
 *  took: render the numbers natively at the panel's own scale (`feed` and
 *  `report`), and stop iframing a 1400px deck into 350px of glass.
 *
 *  The Daily Sales Report is indifferent to all of this: it is a fixed
 *  1920x1080 canvas that scales itself with `Math.min(innerWidth/1920,
 *  innerHeight/1080)`, so its size on the glass is panelWidth/1920 whatever we
 *  hand it — which is exactly why the break-room television is on `report` and
 *  not here. Anything that arrives in `live` mode without a measured floor
 *  gets LIVE_MIN_VIRTUAL_H, which stays at the value both boards used to run
 *  at rather than borrowing a floor that was measured against another deck. */
const LIVE_MIN_VIRTUAL_H = 960;

/** The measured floor, per board. Keys are `rec.slug`. A board with no entry
 *  falls back to LIVE_MIN_VIRTUAL_H above. Re-measure — do not nudge — if a
 *  deck's slide set changes: the value is the tallest slide's own height plus
 *  ~3%, and the tallest slide is named in the table above. */
const LIVE_MIN_VIRTUAL_H_BY_SLUG = {
  'wtw-chicago':   880,   // floor 853, District Ranker
  'wtw-big-south': 935    // floor 910, Top 10 NPS
};

/** Hard ceiling on simultaneous `live` iframes. iPads are real. Cheap modes
 *  (title / image / feed) are not counted — they cost a few DOM nodes.
 *
 *  ONE ON A PHONE, TWO EVERYWHERE ELSE (2026-08-28). A `live` panel is a whole
 *  extra document: fit() lays each one out in a 1703x960 CSS virtual viewport
 *  and scales it down to the 346x195 band panel, so two of them are two full
 *  sub-documents with their own DOM, style, layout and timers. Measured on a
 *  390x844 DPR-3 profile, both of the Dining room's boards were mounted and
 *  live from scrollY 591 to 7092 — essentially the entire runway, because there
 *  are only two live candidates on the page and a budget of two, so nothing
 *  ever evicted either one. That is two documents' worth of memory carried
 *  through every room on the device that was running out of it.
 *
 *  One is not a dead rectangle: reconcile() hands the unbudgeted board its
 *  branded holding card ("Tap to open this board full screen"), which is the
 *  same card every mode already falls back to and is still the client's
 *  requirement that the screen show what it is and stay clickable. §17's
 *  "the screens are exempt, do not fold them back in" note is about iPads, and
 *  iPads are untouched: PHONE_MEDIA cannot match one. */
const MAX_LIVE_FRAMES = 2;
const MAX_LIVE_FRAMES_PHONE = 1;

/** How long one district holds the Back Office board. Slow on purpose. */
const FEED_SLIDE_MS = 9000;

/** How long a SUCCESSFUL streaks fetch is reused. */
const FEED_TTL_MS = 10 * 60 * 1000;

/** How long a FAILED one is remembered before the next screen may try again.
 *  Long enough to stop a stampede when several panels arm at once, short enough
 *  that one blip does not cost the board the rest of the session. */
const FEED_RETRY_MS = 20 * 1000;

/** A request that never answers is a failure that never fail-softs. Both feeds
 *  get a deadline, after which the screen falls to its holding state and the
 *  retry clock starts. Without this the board sits on an EMPTY stage for as long
 *  as the socket stays open, which is the shape the live bug took. */
const FEED_TIMEOUT_MS = 10 * 1000;
const IMAGE_TIMEOUT_MS = 10 * 1000;

/** The workbook's own deadline, and the library's. Both are longer than the
 *  feeds' 10s for the same reason: the streak JSON is 16KB, `Sales Report.xlsx`
 *  is ~1.1MB and SheetJS is ~900KB, and a store's wifi is a store's wifi. They
 *  are still HARD deadlines — an unanswered request has to reach the retry
 *  clock rather than hang, which is the whole lesson of FEED_TIMEOUT_MS. */
const BOOK_TIMEOUT_MS = 25 * 1000;
const SHEETJS_TIMEOUT_MS = 15 * 1000;

/** How long one card holds the break-room television. The source app runs 15s
 *  a slide on a 1920px wall; this board carries a quarter of the content per
 *  card, so it moves faster — but still slower than the eye, because nobody
 *  reads a break-room TV on purpose. */
const REPORT_SLIDE_MS = 10 * 1000;

/** The source app's CONFIG.PROMO_EVERY_N, and its rule: a promo card every N
 *  slides, and the rotation always ends on one. */
const PROMO_EVERY_N = 4;

/** How often an on-screen panel that has never had data tries again, and how
 *  many times before it settles for the holding card. */
const RETRY_EVERY_MS = 20 * 1000;
const RETRY_LIMIT = 5;

/** THE BACKOFF, and the arithmetic behind the floor.
 *
 *  A store iPad is parked on a room and left on all day. A retry that never
 *  gets slower is a retry that costs 3 requests a minute for as long as the
 *  device is awake — 4,320 a day against a URL that is not answering, which is
 *  the shape a dead feed URL takes on that iPad. Doubling from the same 20s
 *  start and stopping at a five-minute floor costs 20s, 40s, 80s, 160s and then
 *  288 requests a day, and still recovers within five minutes of the network
 *  coming back, which a hard cap does not do at all: the old RETRY_LIMIT of 5
 *  gave up after 100 seconds and the board then stayed on its holding card for
 *  the rest of the day even after the wifi came back. Slower AND more durable.
 */
const RETRY_MAX_MS = 5 * 60 * 1000;
const retryDelay = (attempt) =>
  Math.min(RETRY_MAX_MS, RETRY_EVERY_MS * Math.pow(2, Math.max(0, attempt)));

/** The same two conditions theme.css uses for its portrait takeover. Exported
 *  so the layout owner can key off one string instead of a second copy. */
export const NARROW_MEDIA = '(max-width: 900px), (max-aspect-ratio: 8 / 7)';

/** THE PHONE, AND ONLY THE PHONE — the same pair app.js's PLATE_SIZES and
 *  theme.css §06b's tier 0 use, kept identical on purpose.
 *
 *    (max-width: 500px)                            every iPhone in portrait
 *    (max-width: 1000px) and (max-height: 500px)   every iPhone in landscape
 *
 *  Deliberately NOT NARROW_MEDIA: that one catches iPad Pro portrait by aspect
 *  and iPad mini portrait by width, and the iPads are the device this module's
 *  live boards were budgeted for and the device that works today. Anything
 *  gated on THIS constant is a phone-only concession. */
export const PHONE_MEDIA =
  '(max-width: 500px), (max-width: 1000px) and (max-height: 500px)';

/** Default mode per slug, used when the host carries no `data-screen-mode`. */
export const SCREEN_MODES = {
  'quote-6th-gen':  'title',
  'quote-upgrade':  'title',
  'quote-internet': 'title',
  'daily-sales':    'image',
  'wtw-chicago':    'live',
  'wtw-big-south':  'live'
};

const MODES = new Set(['title', 'image', 'feed', 'live', 'report']);

/** Aspect ratios (as plain numbers) the panels take in the narrow band. */
/** Aspect ratios (as plain numbers) the panels take in the narrow band.
 *  `feed` is deliberately taller than the 4/3 it used to be: the band's height
 *  budget is set by `--scr-band-h` and a single-screen room was leaving ~180px
 *  of it unused, while the board's own rows were the thing running out of space.
 *  `image` stays the promo card's own 2000x1429 — `object-fit: contain` means
 *  any other number just letterboxes it. */
/*  `report` takes 4/3 rather than the feed's 6/5: its cards are ROWS, and a
 *  row's width is what decides whether a store name ellipsises, so the band
 *  spends its height budget on width instead. At a 390px viewport that gives a
 *  346x260 panel — 6 rows to the card, the widest this board ever gets. */
const NARROW_AR = { title: 4, image: 2000 / 1429, feed: 6 / 5, live: 16 / 9, report: 4 / 3 };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* -----------------------------------------------------------------------------
 * 1 · Tiny helpers
 * -------------------------------------------------------------------------- */

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

function reduceMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

/** 'YYYY-MM-DD' -> 'Aug 26'. Parsed by hand: `new Date('2026-08-26')` is UTC
 *  midnight and prints as the 25th anywhere west of Greenwich. */
/* hostOf() is gone. It put the board's hostname into the holding card's note
 * on a failed preflight ("blufoxmobile.github.io says this tool is not there
 * any more"); the client wants reps never to see where the boards are hosted,
 * and preflightCopy() names the board instead now. */

function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : '';
}

/**
 * Current cache-busted promo URL.
 *
 * `?t=` is the source app's own ten-minute bucket and nothing may change it —
 * inside one bucket the URL is byte-identical, which is the whole point.
 * `retry` is appended ONLY on a recovery attempt after a failed load, because
 * assigning an <img> the src string it already has is a no-op in every engine:
 * without a distinct URL a card that failed once could never be re-requested
 * until the bucket rolled, up to ten minutes later.
 */
function promoSrc(retry = 0) {
  const base = `${PROMO_CARD_URL}?t=${Math.floor(Date.now() / BUCKET_MS)}`;
  return retry > 0 ? `${base}&r=${retry}` : base;
}

/* -----------------------------------------------------------------------------
 * 2 · Tool registry
 *
 * Screens need a url and a label. app.js already has both, so it hands them
 * over; if it does not, we fall back to whatever `window.CCC.data` is holding
 * and finally to the slug itself. We never fetch tools.json ourselves — a
 * screen must never be the reason the page waits on the network.
 * -------------------------------------------------------------------------- */

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

/* -----------------------------------------------------------------------------
 * 3 · Stylesheet
 *
 * Injected once, prefixed `ccc-scr`, every colour and face read through a
 * `var(--ccc-…, fallback)` so assets/theme.a73825e539.css owns the look. Nothing here
 * animates anything but transform / opacity / filter.
 * -------------------------------------------------------------------------- */

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
}

.ccc-scr__plane {
  position: absolute; inset: 0;
  transform-origin: 0 0;          /* the homography is solved for this origin */
  overflow: visible;              /* the glow spills; the glass clips */
  pointer-events: none;
}
/* Perspective mode: JS writes width/height in px and a matrix3d here. */
.ccc-scr--quad .ccc-scr__plane { inset: auto; top: 0; left: 0; }

/* the halo the panel throws onto the wall behind it */
.ccc-scr__glow {
  position: absolute; inset: -18%;
  z-index: 0; pointer-events: none;
  border-radius: 40%;
  background: radial-gradient(58% 58% at 50% 50%,
    rgba(154,196,255,.46), rgba(120,158,255,.16) 46%, rgba(0,0,0,0) 72%);
  filter: blur(12px);
  opacity: calc(var(--scr-on) * (0.30 + 0.55 * var(--bloom, 0)));
}

/* the black glass itself */
.ccc-scr__glass {
  position: absolute; inset: 0;
  z-index: 1; overflow: hidden;
  pointer-events: none;
  background: linear-gradient(163deg, #0b0e14 0%, #04060a 55%, #080a10 100%);
  transform: translateZ(0);
  filter:
    brightness(calc(0.16 + 0.84 * var(--scr-on)))
    saturate(calc(0.30 + 0.70 * var(--scr-on)));
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
.ccc-scr__scan::after {
  content: ""; position: absolute; inset: -60% 0;
  background: linear-gradient(180deg,
    rgba(0,0,0,0) 0%, rgba(178,214,255,.13) 47%, rgba(0,0,0,0) 100%);
  animation: ccc-scr-refresh 7.5s linear infinite;
}
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
  transition: box-shadow .25s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1)),
              background-color .25s ease;
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
.ccc-scr__hit:hover {
  background: rgba(255,255,255,.045);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.20),
              0 0 34px -6px rgba(180,210,255,.42);
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
/* the connection light. Opacity only — the perf contract allows no other
   property to animate, and a pulsing dot is the cheapest "this is running"
   signal a still photograph can carry. */
.ccc-scr-title__pip {
  inline-size: .62em; block-size: .62em;
  border-radius: 50%;
  background: var(--ccc-accent-hi, #ebce93);
  box-shadow: 0 0 .5em color-mix(in oklab, var(--ccc-accent-hi, #ebce93) 70%, transparent);
  animation: ccc-scr-pip 3.4s ease-in-out infinite;
}
@keyframes ccc-scr-pip {
  0%, 62%, 100% { opacity: 1; }
  76%           { opacity: .28; }
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
  transition: filter .22s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1)),
              transform .22s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1));
}
.ccc-scr--title:has(.ccc-scr__hit:is(:hover, :focus-visible)) .ccc-scr-title__key {
  filter: brightness(1.09);
  transform: translate3d(0, 1px, 0);
}

/* ── the panel chrome, re-weighted for a screen that is ON ────────────────
   Everything below overrides a shared rule further up this sheet. Each one is
   here because the default was tuned for black glass and reads wrong on a lit
   panel — not because the effect is unwanted. */

/* THE SPILL. 'inset' is asymmetric: more room below the glass than above it,
   because the counter is below and that is where the light actually lands.
   The blur is static — nothing animates it, per the perf contract. */
.ccc-scr--title .ccc-scr__glow {
  inset: -24% -19% -38% -19%;
  border-radius: 46%;
  background:
    radial-gradient(48% 42% at 50% 40%,
      rgba(206,230,255,.50), rgba(206,230,255,0) 72%),
    radial-gradient(76% 64% at 50% 64%,
      rgba(146,186,255,.26), rgba(120,158,255,0) 76%);
  filter: blur(15px);
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
.ccc-scr-art__bg {
  position: absolute; inset: -8%;
  inline-size: 116%; block-size: 116%;
  object-fit: cover;
  filter: blur(22px) saturate(1.15) brightness(.62);
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
  transform: translate3d(0, .45em, 0);
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
.ccc-scr-feed__foot > :last-child { text-align: end; }

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
  transform: translate3d(0, .4em, 0);
  transition: opacity .55s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1)),
              transform .55s var(--ccc-ov-ease, cubic-bezier(.22,.61,.36,1));
  pointer-events: none;              /* the hit button above owns every tap */
}
.ccc-scr-rpt__slide.is-current { opacity: 1; transform: none; }
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
.ccc-scr-rpt__row > :not(.ccc-scr-rpt__fill) { position: relative; z-index: 1; }

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
  filter: drop-shadow(0 14px 34px rgba(0,0,0,.55));
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
.ccc-scr--narrow :is(.ccc-scr__glass, .ccc-scr__scan, .ccc-scr__crt,
                     .ccc-scr__sheen, .ccc-scr__bezel) {
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
.ccc-scr__cap b {
  font-weight: 600; min-inline-size: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ccc-scr__cap i {
  font-style: normal; flex: 0 0 auto;
  color: var(--ccc-accent-hi, #ebce93); white-space: nowrap;
}

/* ══ reduced motion ══════════════════════════════════════════════════════ */
@media (prefers-reduced-motion: reduce) {
  .ccc-scr__scan::after { animation: none; opacity: 0; }
  .ccc-scr__crt { display: none; }
  /* the terminal's connection light holds lit rather than blinking */
  .ccc-scr-title__pip { animation: none; opacity: 1; }
  .ccc-scr-title__key { transition: none; }
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

   __glass carries a transform of translateZ(0), which promotes it to hold a flat
   two-stop gradient and a filter that only moves when a board powers on. The
   promotion is worth having on an iPad, where the panels are large, warped onto
   a wall plane and composited against a moving photograph. In the phone band
   they are small, axis-aligned and in a static band under the plate.

   The reduced-motion block above already switches the sweep off by exactly this
   route, and has since v3; this is the same concession spent on a different
   constraint. THE CONDITION IS THE PHONE BAND (PHONE_MEDIA), not the narrow
   band — an iPad Pro portrait matches the narrow band and must not be touched
   here. Keep it identical to PHONE_MEDIA, theme.css §06b TIER 0 and §06e. */
@media (max-width: 500px), (max-width: 1000px) and (max-height: 500px) {
  .ccc-scr__scan::after { display: none; }
  .ccc-scr__glass { transform: none; }

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
     3D transform and was never promoting anything. */
  .ccc-scr-rpt__slide  { transform: translate(0, .4em); }
  .ccc-scr-feed__slide { transform: translate(0, .45em); }
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

/* -----------------------------------------------------------------------------
 * 4 · Perspective maths
 *
 * Lifted, deliberately unchanged, from the version of this code that lived in
 * overlay.js: it is solved, reviewed and correct, and the Host Stand TV depends
 * on it. An 8-DOF projective transform maps our flat W x H panel onto the four
 * measured corners of a screen photographed at an angle, emitted as a CSS
 * matrix3d so the browser warps it on the GPU and hit-testing follows.
 * -------------------------------------------------------------------------- */

/** Gaussian elimination with partial pivoting. Returns null when singular —
 *  a NaN inside a transform blanks the element, which is far worse than a
 *  quiet fallback to the axis-aligned box. */
function solveLinearSystem(A, b) {
  const n = b.length;

  // Relative pivot tolerance: the matrix mixes pixels (~1e3) with their
  // products (~1e6), so a fixed epsilon is meaningless.
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

/** Two linear rows per correspondence, h8 pinned to 1 → an 8x8 system. */
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

/** matrix3d is column-major. The transform lives in z=0, so h6/h7 become the
 *  perspective terms in the w row. Ten significant figures, NOT toFixed(6):
 *  h6/h7 are around 1e-4 and would round away to nothing. */
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

/** Convexity + area, on the resolved pixel quad — catches collinear input. */
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

/** `data-screen-quad`: eight numbers TL,TR,BR,BL in % of the plate, or JSON. */
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

/* -----------------------------------------------------------------------------
 * 5 · The streaks feed — one fetch, shared by every feed screen
 * -------------------------------------------------------------------------- */

let feedCache = { at: 0, promise: null, data: null, failed: false, inflight: false };

/**
 * Fetch the streak board, at most once per window, shared by every feed screen.
 *
 * ⚠ THE BUG THIS FUNCTION EXISTS TO NOT HAVE, TWICE OVER.
 *
 * 1. THE MEMO USED TO CACHE THE FAILURE FOR THE FULL TTL. The resolved promise
 *    — `null`, from the catch — was stored in `feedCache.promise` under the same
 *    ten-minute guard as a success, and `feedCache.failed` was written but never
 *    read by anything. So the first failure poisoned every later attempt for ten
 *    minutes: a second feed panel arming, a tab returning to the foreground, a
 *    reconnected laptop, all got the memoised `null` back instantly without a
 *    request ever leaving the page. Nothing in the module called it with
 *    `force`, so in practice the board was dead for the life of the session.
 *    A SUCCESS is worth memoising for the TTL. A FAILURE is worth memoising only
 *    long enough to stop several panels stampeding the same dead URL.
 *
 * 2. THERE WAS NO DEADLINE. `fetch()` has no timeout of its own, so a connection
 *    that opened and then hung left this promise pending forever — and the feed
 *    renderer, which only paints when the promise settles, left the glass on an
 *    empty `.ccc-scr-feed__stage`: not the board, and not the holding card
 *    either. A fail-soft path that is never reached is not a fail-soft path.
 *
 * On failure this resolves to the LAST GOOD DATA when there is any, so a screen
 * that has been up all day keeps showing this morning's board through a blip
 * rather than dropping to a holding card, and only resolves `null` when there
 * has never been anything to show.
 */
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

  // AbortController is everywhere we ship, but a missing one must not throw.
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
      // Stale beats blank; null only when there has never been anything.
      return feedCache.data;
    });

  return feedCache.promise;
}

/**
 * Group the flat store list into one entry per district, in the order the feed
 * itself declares (`districts[]`), falling back to first-appearance order.
 * Stores sort best-first; a store with no surveys sinks to the bottom.
 */
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

  // Prefer the feed's own district order when it covers what we found.
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

/* -----------------------------------------------------------------------------
 * 5b · The sales workbook — one fetch and one parse, shared by every report
 *      screen
 *
 * The Daily Sales Report is driven from `data/Sales Report.xlsx` in its own
 * repo, parsed client-side with SheetJS. The break-room television renders the
 * same numbers natively (see the MODE: report block in §3 for why it cannot
 * iframe them), so it reads the same workbook with the same parser shapes and
 * the same vocabulary — this is meant to be the same product on a smaller
 * screen, not a lookalike.
 *
 * THE COSTS, STATED HONESTLY. This is the only thing on the site that pulls a
 * ~900KB library and a ~1.1MB workbook. Both are therefore paid ONLY when a
 * `report` panel actually arms — i.e. when the Break Room is within one and a
 * half viewports — never at boot, never for any other mode, and never twice:
 * the library is one <script> guarded by an id, and the workbook is one fetch
 * memoised for the same ten minutes the source app refreshes on.
 *
 * THE DISCIPLINE IS §5's, DELIBERATELY COPIED. Every rule that block exists to
 * enforce applies here for the same reasons:
 *   · a real deadline on the fetch, because `fetch()` has none of its own and a
 *     socket that opens and hangs is a screen that never fail-softs;
 *   · a SUCCESS is memoised for the TTL, a FAILURE only for FEED_RETRY_MS —
 *     long enough to stop a stampede, far too short to settle what the board
 *     shows for the rest of the session;
 *   · on failure resolve LAST GOOD DATA when there is any, and `null` only
 *     when there has never been anything.
 * -------------------------------------------------------------------------- */

/** The market this site belongs to. The workbook is the whole company; every
 *  row whose RSD is not this one belongs to somebody else's break room. The
 *  source app spells it `RSD_NAME: 'Jeffrey Bilbrey'` and tests it with
 *  `String(rsd).includes('Bilbrey')` — same test, same surname. */
const RSD_SURNAME = 'Bilbrey';

/** The market's districts, copied from the source app's own DISTRICTS table so
 *  a store lands in the same district on this wall as it does on the deck.
 *  `dmMatch` is a DM-surname substring from the Store Rank sheet; storeMatch /
 *  storeExclude are the hand-placed exceptions (Cicero reports to the East DM
 *  but belongs to Chicago North on the org chart). The 'all' row is dropped —
 *  this board never filters. */
const REPORT_DISTRICTS = [
  { key: 'north',     label: 'Chicago North', dmMatch: ['dhorajiwala'], storeMatch: ['cicero'] },
  { key: 'south',     label: 'Chicago South', dmMatch: ['carrillo'] },
  { key: 'east',      label: 'Chicago East',  dmMatch: ['cabrales'], storeExclude: ['cicero'] },
  { key: 'west',      label: 'Chicago West',  dmMatch: ['chowdhury'] },
  { key: 'big-south', label: 'Big South',     dmMatch: ['brooks'] }
];

/** The two regions this market sits inside, for the region standings card.
 *  The source app's CONFIG.OUR_REGIONS, unchanged. */
const OUR_REGIONS = ['Greater Chicago', 'Big South'];

/** Sheet names, the source app's CONFIG values. */
const SHEET_STORE  = 'Store Rank';
const SHEET_ZERO   = 'Zero';
const SHEET_DM     = 'District Rank';
const SHEET_REGION = 'Region Rank';

/* ── format helpers, the deck's own ──────────────────────────────────────── */

/** `$79,118` / `-$3,051`. Verbatim from the source app's fmtMoney. */
const fmtMoney = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
/** `0.1291` -> `12.9%`. The source app's pctStr. */
const pctStr = (v) => `${(v * 100).toFixed(1)}%`;
/** Whole percent. A tenth of a point is noise on a goal meter read at 18px. */
const pctWhole = (v) => `${Math.round(v * 100)}%`;

/** The source app's storeMatchesDistrict, minus the catch-all branch. */
function storeInDistrict(store, dist) {
  const name = String(store.name || '').toLowerCase();
  if (dist.storeExclude && dist.storeExclude.some((m) => name.includes(m))) return false;
  if (dist.storeMatch && dist.storeMatch.some((m) => name.includes(m))) return true;
  const dm = String(store.dm || '').toLowerCase();
  return dist.dmMatch.some((m) => dm.includes(m));
}

/* ── SheetJS, loaded lazily and never twice ──────────────────────────────── */

/** Pinned, exactly the build the source app loads. It is NOT run through
 *  freshUrl(): the two data URLs below are, because the client's requirement is
 *  fresh NUMBERS, but this is an immutable version-pinned library on a CDN and
 *  a rolling query string on it would defeat the only cache that matters and
 *  re-download 900KB for nothing. */
const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

let sheetJsPromise = null;

/**
 * Resolve to `window.XLSX`, or to `null` if the library never arrives.
 *
 * Three things this has to get right:
 *   1. ONE <script>, however many report panels arm in the same frame. The id
 *      guard plus the shared promise does that; a second panel awaits the
 *      first one's tag instead of injecting another 900KB.
 *   2. A DEADLINE. A <script> that neither loads nor errors — a captive portal,
 *      a CDN blocked by a store's filter — otherwise leaves the board waiting
 *      forever on a promise that never settles, which is the exact shape of the
 *      `live` bug this whole mode replaces.
 *   3. A FAILURE IS NOT MEMOISED. On failure the promise AND the dead tag are
 *      both dropped, so the next retry tick genuinely re-injects. Caching the
 *      failure would settle the board's contents for the session.
 */
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
        // Drop both memos so a later retry is a real one.
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

/* ── the workbook itself ─────────────────────────────────────────────────── */

let bookCache = { at: 0, promise: null, data: null, failed: false, inflight: false };

/** `XLSX.utils.sheet_to_json(sheet, {header:1})` on a named sheet, or null. */
function sheetRows(XLSX, wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
}

/**
 * `Store Rank` -> this market's stores.
 *
 * Header discovery and every column lookup are the source app's parseWorkbook,
 * kept row for row: the header row is the first of the top 15 carrying both a
 * cell equal to 'Rank' and a cell containing 'Store'; columns are found by
 * case-insensitive substring so a renamed "Net Target GP $" still resolves.
 * Two columns are matched EXACTLY rather than by substring, and both for the
 * source app's reasons: 'GP $ Trend' would otherwise be eaten by
 * 'GP $ Est Net Trend', and 'Fiscal NPS' by 'Last Month Fiscal NPS'.
 */
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
    if (!row || !row[iRank]) break;                 // the sheet ends at its first gap
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

/**
 * `Zero` -> yesterday's walk-ins and mobile sales, by store name.
 * The source app's parseZeroSheet, unchanged: header row is the one whose
 * first cell reads 'Store Name'; column 2 is TTL Mobile, 7 is Yesterday MCR %,
 * 8 is Yesterday Traffic. MCR arrives as either a fraction or a percentage
 * depending on how the sheet was last saved, so it is normalised the same way.
 */
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

/**
 * `District Rank` / `Region Rank` -> the national standings.
 * The source app's parseRankSheet: the header row is the one of the top six
 * whose first cell is exactly 'Rank'; column 2 is Avg GP Trend $ and column 32
 * is NPS%. Only the columns this board actually shows are kept.
 */
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

/** Everything the report cards need, in one plain object. */
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

  // Yesterday, rolled up per district and for the market. The deck prints the
  // same three numbers per row plus a DISTRICT TOTAL; this board has room for
  // one row per district and one MARKET total, which is the same table with
  // the market's five districts standing in for one district's five stores.
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

  // Our own district managers, looked up in the national District Rank table.
  // Matched the way the deck matches them: a DM name off our store rows,
  // compared loosely in both directions so "Matt Brooks" still finds
  // "Matthew Brooks".
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

/**
 * Fetch + parse the workbook, at most once per window, shared by every report
 * screen. Resolves the model, the last good model, or null.
 *
 * The deadline is longer than the feeds' because the payload is: the streak
 * JSON is 16KB and the workbook is ~1.1MB, and a store's wifi is a store's
 * wifi. It is still a hard deadline — an unanswered request is a failure like
 * any other and must reach the retry clock rather than hang.
 */
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

  // The library and the bytes are fetched together: neither is useful alone and
  // starting them in series would add a whole round trip to a cold board.
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
      // `sheets` is the whole reason this parse is affordable on a phone.
      // buildSalesModel() reads FOUR sheets by exact name and nothing else, and
      // without this option SheetJS materialises every sheet in a ~1.1MB
      // workbook as a cell-per-key object graph — tens of megabytes of transient
      // JS objects, allocated in the one room (the Break Room) that a phone
      // reaches last, with the whole runway's plates already resident. Naming
      // the four keeps the graph to what is actually read. The names are the
      // same constants sheetRows() then looks up in wb.Sheets, so a workbook
      // that renames a tab fails exactly as it did before: a missing sheet, a
      // null AoA and the holding card, not a wrong number.
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
      return bookCache.data;             // stale beats blank; null only if never
    });

  return bookCache.promise;
}

/* -----------------------------------------------------------------------------
 * 6 · Mode renderers
 *
 * Every renderer returns a small controller:
 *   { node, resize(rec), activate(rec), deactivate(rec), destroy() }
 * `activate` runs when the screen comes within range, `deactivate` when it
 * leaves — that is where timers stop and iframes die.
 * -------------------------------------------------------------------------- */

/** The calm branded card every mode falls back to. Never a spinner, never a
 *  broken image, never a stack trace. */
function holdingCard(title, note) {
  return el('div', { class: 'ccc-scr-holding' }, [
    el('span', { class: 'ccc-scr-holding__mark', text: 'Cook County Cooks' }),
    el('p', { class: 'ccc-scr-holding__title', text: title || 'Board offline' }),
    el('p', { class: 'ccc-scr-holding__note', text: note || 'Live data is not reachable right now. Tap to open the full report.' })
  ]);
}

/* ── title ────────────────────────────────────────────────────────────────── */

/** Rooms, as a terminal's chrome would name them. Falls back to the house
 *  name, so a `title` screen mounted in a room this map has never heard of
 *  still gets a plausible station id rather than a blank rail. */
const ROOM_TITLES = {
  pass: 'The Pass', host: 'Host Stand', dining: 'Dining Room', prep: 'Prep',
  office: 'Back Office', breakroom: 'Break Room', freezer: 'Walk-In'
};

/** "THE PASS · 02" — the station id in the chrome rail. The number is the
 *  panel's position among the screen hosts of its own room, in DOM order, so
 *  the three tablets read 01/02/03 left to right without anything in rooms.js
 *  having to say so. Derived, never hand-set. */
function stationLabel(rec) {
  const { room, roomId } = roomOf(rec.host);
  const scope = room || document;
  let n = 1;
  try {
    const hosts = Array.from(scope.querySelectorAll('[data-screen]'));
    const i = hosts.indexOf(rec.host);
    if (i >= 0) n = i + 1;
  } catch { /* a detached host is still worth a station id */ }
  const place = ROOM_TITLES[roomId] || 'Cook County Cooks';
  return `${place} · ${String(n).padStart(2, '0')}`;
}

function makeTitle(rec) {
  /* A <p>, NOT an <h3>, and that is a fix rather than a preference.
     A screen host lives in `.hotspots`, which theme.css §09 puts BEFORE the
     rail in the stage — so the three panels in the Pass emitted "6th Gen Quote
     Sheet / Upgrade / Internet" as h3s before the room's own
     <h2 class="rail-title"> ("The Pass") had appeared at all. A heading walk
     therefore entered every room three levels deep and jumped h1 -> h3, which
     is what axe reports as `heading-order`.
     Demoting rather than re-ordering is the honest call: this caption is not a
     section heading, it is the visible label of the one control the panel IS
     (`.ccc-scr__hit`, whose accessible name is already "Open <the same
     words>"). Nothing outside this function knows or cares about the tag —
     .ccc-scr-title__name carries every style, `margin: 0` included, and
     applyRecord() finds the node by that class. */
  const name = el('p', { class: 'ccc-scr-title__name', text: rec.headline });

  /* Row 1 — the chrome. aria-hidden throughout: the button's accessible name is
     already "Open <tool>", and a screen reader has no use for set dressing. */
  const bar = el('div', { class: 'ccc-scr-title__bar', 'aria-hidden': 'true' }, [
    el('span', { class: 'ccc-scr-title__term', text: stationLabel(rec) }),
    el('span', { class: 'ccc-scr-title__stat' }, [
      el('i', { class: 'ccc-scr-title__pip' }),
      el('span', { text: 'Online' })
    ])
  ]);

  /* Row 2 — the one subject on the screen. */
  /* No second brass rule under the name: the chrome rail's own hairline is
     the rule now, and at 150px of glass a third brass element competes with
     the key for the eye instead of structuring anything. */
  const body = el('div', { class: 'ccc-scr-title__body' }, [name]);

  /* Row 3 — the primary key. Not a button: the whole panel is already one
     <button>, and nesting a second interactive element inside a control is
     invalid and would hand the tab order a duplicate. This is the KEY CAP the
     panel-wide button presses. */
  const key = el('div', { class: 'ccc-scr-title__key', 'aria-hidden': 'true' }, [
    el('span', { class: 'ccc-scr-title__cta', text: 'Tap to open' }),
    el('span', { class: 'ccc-scr-title__chev', text: '›' })
  ]);

  const node = el('div', { class: 'ccc-scr-title' }, [bar, body, key]);

  return {
    node,
    resize(r) {
      // ── THE AUTO-FIT ───────────────────────────────────────────────────
      // Two numbers come out of one solve, and both are pure functions of the
      // glass box: a tablet 15% of frame width and a full-width phone strip
      // are the same problem with different numbers, so there is one solve
      // rather than a table of breakpoints.
      //
      //   --scr-pos-fs   the chrome unit. Everything in the rail and the key
      //                  is an em of it, so paying for the chrome is a single
      //                  multiplication rather than a stack of guesses.
      //   --scr-title-fs the subject. Solved from what is LEFT after the
      //                  chrome, which is the whole reason the terminal
      //                  layout does not squeeze the name off the glass.
      const w = r.planeW, h = r.planeH;
      if (!w || !h) return;
      const narrow = r.narrow;

      // The chrome unit. Capped on both axes so a very wide strip does not get
      // a rail out of proportion to its height, and floored at 7px because
      // below that uppercase tracking stops resolving at all.
      const u = Math.max(7, Math.min(h * (narrow ? 0.13 : 0.093), w * 0.040));

      // What the chrome actually costs, in the same em terms the CSS uses:
      //   rail = 1 line + .62em padding + the hairline
      //   key  = 1.06em cap-line + .78em + .74em padding + the 2px shadow lip
      const railH = u * 1.0 + u * 0.62 + 1;
      const keyH  = Math.max(narrow ? 44 : 0, u * 1.06 + u * 1.36 + 2);
      const padY  = h * (narrow ? 0.08 : 0.09);
      const gaps  = h * (narrow ? 0.03 : 0.08);

      // The name's own box. In the narrow strip the key sits BESIDE the
      // subject rather than under it, so it costs width, not height.
      const bw = (w - w * (narrow ? 0.09 : 0.11)) * (narrow ? 0.62 : 1);
      const bh = narrow
        ? Math.max(14, h - railH - padY - gaps)
        : Math.max(14, h - railH - keyH - padY - gaps);

      const text = (rec.headline || '').replace(/\s+/g, ' ').trim();
      const chars = Math.max(8, text.length);
      let fs = Math.sqrt((bw * bh * 0.42) / chars) * 1.42;
      // Cap on both axes: bh*0.46 leaves room for two lines of the name,
      // bw*0.34 keeps the longest single word inside the glass.
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

/* ── image ────────────────────────────────────────────────────────────────── */

function makeImage(rec) {
  const node = el('div', { class: 'ccc-scr-art' });
  let bucket = -1;
  let timer = 0;
  let deadline = 0;
  let retries = 0;
  let ok = false;
  let holding = null;

  // The blurred copy behind the fitted card is what takes a 1.40 promo card
  // edge to edge inside a 1.52 screen. Two black bars would read as a broken
  // mount; an ambient backdrop reads as a screen.
  const bg = el('img', { class: 'ccc-scr-art__bg', alt: '', 'aria-hidden': 'true', decoding: 'async' });
  const fg = el('img', { class: 'ccc-scr-art__fg', alt: '', 'aria-hidden': 'true', decoding: 'async' });

  const NOTE = 'Today\u2019s promo card has not landed yet. Tap to open the Daily Sales Report.';

  /* ⚠ THE HOLDING CARD GOES OVER THE IMAGES, NEVER INSTEAD OF THEM.
     It used to be `node.replaceChildren(holdingCard(...))`, which took both
     <img> elements out of the document. Every later load therefore succeeded
     against elements nothing could see, `.is-live` went on a panel with no
     picture in it, and the TV showed its holding card for the rest of the
     session however many good cards arrived afterwards. `.ccc-scr-holding` is
     `position:absolute; inset:0`, so it is already an overlay — use it as one. */
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

  /**
   * @param {boolean} force  re-request even inside the current bucket. Used by
   *                         the recovery path; a healthy card is HELD, not
   *                         re-fetched, until the ten-minute bucket rolls.
   */
  function load({ force = false } = {}) {
    const next = Math.floor(Date.now() / BUCKET_MS);
    if (!force && next === bucket && ok) return;
    if (force && !ok) retries++;
    if (next !== bucket) { bucket = next; retries = 0; }

    const src = promoSrc(ok ? 0 : retries);
    stopDeadline();
    // An <img> that never errors and never loads is the same dead screen as one
    // that 404s, and only this timer tells them apart.
    deadline = window.setTimeout(() => {
      deadline = 0;
      if (!ok) showHolding();
    }, IMAGE_TIMEOUT_MS);

    fg.src = src;
    bg.src = src;
  }

  fg.addEventListener('error', () => {
    stopDeadline();
    ok = false;
    showHolding();
  });
  fg.addEventListener('load', () => {
    stopDeadline();
    ok = true;
    retries = 0;
    clearHolding();
    rec.panel.classList.add('is-live');
  });

  node.append(bg, fg);

  return {
    node,
    resize: noop,
    activate() {
      load({ force: !ok });
      // Re-check on the 10-minute boundary, but only while the screen is in
      // range and the tab is visible. The card is HELD, not rotated — this is a
      // refresh, not a slideshow. While it has never arrived the same tick is
      // the retry, capped so a permanently dead URL is not polled forever.
      //
      // ⚠ This used to read `failed = false; load();` — and `load()` began with
      // `if (next === bucket && !failed) return;`, so clearing the flag one line
      // early guaranteed the early return and the retry never fired at all.
      // The intent is an explicit argument, not a flag mutated around the call.
      if (!timer) {
        timer = window.setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          if (!ok && retries >= RETRY_LIMIT) return;
          load({ force: !ok });
        }, RETRY_EVERY_MS);
      }
    },
    deactivate() {
      stopDeadline();
      if (timer) { window.clearInterval(timer); timer = 0; }
    },
    /** A tab returning to the foreground gets a fresh card. */
    refresh() {
      retries = 0;
      load({ force: true });
    },
    destroy() {
      stopDeadline();
      if (timer) { window.clearInterval(timer); timer = 0; }
      fg.removeAttribute('src');
      bg.removeAttribute('src');
    }
  };
}

/* ── feed ─────────────────────────────────────────────────────────────────── */

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

  // The two things worth celebrating, in the source app's own terms.
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
    /* <p> for the same reason as .ccc-scr-title__name above: the district name
       is the subject of one slide inside a control, not a section heading, and
       as an h3 it landed in the outline before the Back Office's own h2. */
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

  /* ⚠ SAY WHEN IT IS OLD. loadStreaks() resolves to the LAST GOOD DATA when a
     fetch fails ("stale beats blank", §5) — which is right, and was silent: a
     board that last succeeded at eight this morning sat on the Back Office wall
     all day reading exactly like a board that succeeded a minute ago. The date
     was already printed here, but a date on its own is not a warning; a store
     manager reads "Aug 28" as a label, not as a problem.

     streaksFresh() is the source app's own rule (more than three days old is
     not shown at all) and it existed in this file with no caller. It is the
     caller now: past it, the foot says so in words and the slide carries
     .is-stale so theme.css can grey the figures. The numbers on this board are
     "days since the last bad survey", and a counter that has stopped counting
     is the exact failure the rule was written for. */
  const fresh = streaksFresh(data);
  const stamp = shortDate(data.asOf);
  const foot = el('div', { class: 'ccc-scr-feed__foot' }, [
    el('span', { text: bestLabel }),
    dots,
    el('span', {
      class: fresh ? '' : 'ccc-scr-feed__stale',
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

  /* ⚠ THE GLASS IS NEVER EMPTY. The board used to paint nothing at all until the
     fetch settled, so a slow or hanging request left a lit, correctly warped,
     completely blank `.ccc-scr-feed__stage` on the office wall — which is what
     the live site was showing. A screen with nothing on it is a broken screen
     whatever the network is doing, so the branded card is the RESTING state and
     the board replaces it, not the other way round. Never a spinner. */
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
    // Column count is a function of how wide the glass actually is, not of the
    // viewport: the same board is 790px across on a wall and 350px on a phone.
    // Two rows is the target — a district is five or six stores, and two rows of
    // three carries a far bigger numeral than three rows of two.
    // Three columns wherever three fit: two rows of three carries a numeral
    // half again as big as three rows of two, and the store names still clear
    // an ellipsis at ~100px of tile. Below that a phone gets two columns.
    const wide = rec.planeW >= 320;
    for (let i = 0; i < slides.length; i++) {
      const grid = slides[i].querySelector('.ccc-scr-feed__grid');
      if (!grid) continue;
      const n = districts[i] ? districts[i].stores.length : grid.children.length;
      const cols = wide ? Math.min(3, Math.max(2, Math.ceil(n / 2))) : 2;
      const rows = Math.max(1, Math.ceil(n / cols));
      grid.style.setProperty('--scr-cols', String(cols));
      // Three rows in the same box means a smaller numeral, or it clips.
      grid.style.setProperty('--scr-num', rows >= 3 ? '2.15' : (rows === 2 ? '3.05' : '4.2'));
    }
  }

  function tick() {
    show(index + 1);
  }

  function startTimer() {
    if (timer || slides.length < 2 || !active) return;
    timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      tick();
    }, FEED_SLIDE_MS);
  }

  function stopTimer() {
    if (timer) { window.clearInterval(timer); timer = 0; }
  }

  function stopRetry() {
    if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = 0; }
  }

  /**
   * Keep asking while the board is on screen and has still never had data —
   * but ask more slowly each time. See RETRY_MAX_MS for the arithmetic.
   *
   * A self-rescheduling setTimeout rather than a setInterval, because the
   * delay changes every pass. A tick that lands while the tab is hidden does
   * not spend the attempt: it reschedules at the SAME delay, so a board that
   * was backgrounded for an hour does not come back at a five-minute cadence
   * for something it has only tried twice.
   */
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

  /**
   * One request, at most one in flight per panel.
   *
   * ⚠ This used to be a one-shot `started` latch around a single
   *   `loadStreaks().then(render)`. Between that latch and the memo in §5
   *   caching its own failure, ONE bad fetch — at any point in the session,
   *   including before the room had ever been looked at — permanently settled
   *   what this screen would show. There is now exactly one thing that can
   *   retire the retry: data actually arriving.
   */
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

  // The resting state, in the DOM from the moment the panel mounts.
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
    /** A tab returning to the foreground gets a board no older than the TTL. */
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

/* ── live ─────────────────────────────────────────────────────────────────── */

/** How long after an iframe's `load` the deck inside it is given to paint its
 *  own content before the branded holding card is lifted off it.
 *
 *  IT IS A SETTLE, NOT A SIGNAL, AND THAT IS NOT A SHORTCUT — it is the whole
 *  of what a cross-origin frame will tell you UNLESS THE DECK SPEAKS: the
 *  Daily Sales Report now posts its own `ready`, and for it this settle is
 *  retired the moment it does — see BOARD_READY_CAP_MS below. For every
 *  board that stays silent, what follows is still true. `load` fires when the deck's
 *  document is done, which for every one of these boards is before it has
 *  fetched its workbook and drawn a slide; nothing after that is observable
 *  from out here (no same-origin DOM, no resource timing for its subresources,
 *  no message it sends). So the choice is between revealing early and showing
 *  the deck's white loading screen — the defect the client photographed — and
 *  revealing late and showing a branded, correct, tappable card for a moment
 *  longer than strictly necessary. Late is the right way to be wrong: the card
 *  says "Tap to open this board full screen", which is true the entire time it
 *  is up, and on a phone it is the same card two of the three boards are
 *  showing anyway because MAX_LIVE_FRAMES is 1.
 *
 *  3200ms is the deck's own budget with room for a cold cellular fetch of the
 *  1.15 MB workbook it renders from. The 12s watchdog below is still the
 *  backstop for a frame that never loads at all, and it now rewrites the note
 *  on this same card instead of swapping the card for another one. */
const LIVE_REVEAL_MS = 3200;

/* ── THE READY HANDSHAKE — a board that says when it has drawn ─────────────
   LIVE_REVEAL_MS above is a guess about a deck we cannot see into, and the
   Break Room TV showed what a guess costs. Observed in the client's own
   Chrome (2026-09-03): the lid lifted 3.2 s after the Daily Sales Report's
   `load`, but the report only draws after ITS OWN workbook fetch + parse —
   5-15 s on store wifi, never when the fetch stalls — so the rep saw the
   report's white "Loading Sales Report…" screen for that whole window
   (white at 8:12 PM, real data at 8:22 PM). `load` is a poor proxy in BOTH
   directions: it is held back by a 365 KB promo-card probe and a Google
   Fonts sheet, so on a fast link it fires before the content and on a slow
   one after it.

   So the report now tells us. From inside the frame it posts
     { source:'ccc-board', board:'daily-sales', state:'loading'|'ready'|'error' }
   `loading` when its spinner goes up (every load, retries included), `ready`
   at the exact line that hides that spinner after the first slide is drawn,
   `error` when its "Failed to fetch — Retry" screen shows. Trust is by
   IDENTITY, not by origin string: a message is taken only when
   `event.source === frame.contentWindow` — the element we mounted is the
   only thing that can speak for it, whatever origin it was served from.

   A board that never posts (both Win-the-Weekend decks, anything older) is
   not changed at all: nothing above disarms the `load` + LIVE_REVEAL_MS
   reveal until the first ccc-board message arrives, and the report posts
   `loading` from its inline script — during parse, before `load` can fire —
   so the two paths never race on the one board that speaks.

   BOARD_READY_CAP_MS is for the third case: a board that said `loading` and
   then went quiet (the workbook request hung with no error — the shape the
   8:12-to-8:22 stall took). The lid HOLDS — the alternative is the white
   screen this exists to end — and after the cap the note becomes the same
   "not reachable" sentence the preflight uses, and the frame is re-mounted
   with a fresh stamp on the retryDelay() backoff (20 s, 40 s… five-minute
   floor; see RETRY_MAX_MS for the arithmetic). 45 s is the report's OWN cap
   on its slowest feed (loadTSheetCounts: normal answers take 12.7-16.7 s,
   measured 2026-09-02), so anything that has not drawn by then is not slow,
   it is stuck, and a fresh request is the only thing that will move it. */
const BOARD_READY_CAP_MS = 45 * 1000;
const BOARD_UNREACHABLE = 'This board is not reachable right now. It will try again on its own — or tap to open it full screen.';

function makeLive(rec) {
  const node = el('div', { class: 'ccc-scr-live' });
  let frame = null;
  let cover = null;
  let watchdog = 0;
  let revealT = 0;
  let bucket = 0;        // which 5-minute stamp the mounted frame is carrying
  let dead = false;      // the preflight said the board is not there
  let speaks = false;    // THIS frame has posted a ccc-board message — it owns the reveal
  let failed = false;    // the board said `error`, or BOARD_READY_CAP_MS ran out
  let capT = 0;          // the ready cap, armed by the first `loading`
  let retryT = 0;        // the backoff re-mount after a failure
  let attempt = 0;       // consecutive failures, drives retryDelay(); reset by `ready`
  let onMessage = null;  // the window listener for the mounted frame
  let wantFresh = false; // retry() asks the next mount() for a unique stamp

  /** The board did not come back. Say so on the lid rather than lifting it off
   *  a grey rectangle, and drop the frame — there is nothing behind it. */
  function refuse(note) {
    window.clearTimeout(revealT);
    revealT = 0;
    // The preflight's word is final for this mount: no ready cap and no
    // backoff re-mount on top of it. A dead board comes back the way it
    // always has — refresh() when the 5-minute stamp moves, or the room
    // scrolling out of range and back.
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

  /** Fade the lid off and take it out of the DOM. Idempotent. */
  function uncover() {
    revealT = 0;
    if (!cover) return;
    const lid = cover;
    cover = null;
    lid.classList.add('is-gone');
    // after the .55s transition in the sheet above; removing rather than
    // leaving an opacity-0 box is what keeps this off the compositor.
    window.setTimeout(() => { if (lid.parentNode) lid.remove(); }, 700);
  }

  /** Put the lid back on (or leave it on) over the frame with these words.
   *  The frame stays behind it: this is the branded card as a LID, exactly as
   *  mount() lays it, so a board that goes back to `loading` after it has
   *  been uncovered gets the same card the next viewer would. */
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

  /** `ready`: the deck has drawn. Every clock that was waiting for it stops,
   *  and the lid comes off NOW rather than on a timer. */
  function arrived() {
    window.clearTimeout(watchdog);
    window.clearTimeout(capT); capT = 0;
    window.clearTimeout(retryT); retryT = 0;
    window.clearTimeout(revealT); revealT = 0;
    attempt = 0;
    failed = false;
    rec.deckArrived = true;                       // read by liveWanted(), not by CSS
    rec.panel.classList.add('is-live');
    uncover();
  }

  /** `error`, or the cap ran out: keep the lid, change its words, and put a
   *  fresh request on the backoff clock. deckArrived goes false on purpose —
   *  a board with nothing drawn is the one liveWanted() is allowed to drop
   *  while the viewer is up, because it has nothing to lose. */
  function fail(words) {
    failed = true;
    window.clearTimeout(watchdog);
    window.clearTimeout(capT); capT = 0;
    window.clearTimeout(revealT); revealT = 0;
    rec.deckArrived = false;
    armLid(words);
    rec.panel.classList.add('is-live');           // a lit card, not black glass
    window.clearTimeout(retryT);
    retryT = window.setTimeout(retry, retryDelay(attempt));
    attempt += 1;
  }

  /** Re-mount with a fresh stamp — a unique URL, not the 5-minute bucket, so
   *  a request the network left hanging cannot be handed back from cache. */
  function retry() {
    retryT = 0;
    if (rec.destroyed || !frame) return;         // held or unmounted: nothing to redo
    dead = false;
    unmount();
    wantFresh = true;
    mount();
  }

  function handleBoard(d) {
    if (!speaks) {
      speaks = true;
      // the board owns its own reveal from here: the settle timer is a guess
      // it has just made unnecessary.
      window.clearTimeout(revealT); revealT = 0;
    }
    if (d.state === 'ready') { arrived(); return; }
    if (d.state === 'error') {
      // the reason is for the console, never for the rep — see hostOf()'s
      // epitaph above: nothing on the glass names where the boards come from.
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
    // A fresh mount gets a fresh verdict: `dead` belongs to the frame that was
    // refused, not to the board. Without this reset a board the preflight
    // declared dead once stayed dead for the life of the page even after the
    // deck came back, because the new frame's `load` listener bailed on a flag
    // set for the old one.
    dead = false;
    const url = rec.url;
    if (!url) {
      node.replaceChildren(holdingCard(rec.title, 'Tap to open this board full screen.'));
      return;
    }
    frame = el('iframe', {
      class: 'ccc-scr__frame',
      // Decorative: it is a picture of a TV, not content. The button above it
      // is the only thing assistive tech ever sees.
      'aria-hidden': 'true',
      tabindex: '-1',
      scrolling: 'no',
      title: '',
      referrerpolicy: 'no-referrer-when-downgrade'
    });
    frame.setAttribute('role', 'presentation');
    /* ⚠ THE FIRST `load` AN INSERTED IFRAME FIRES IS FOR about:blank, AND IT
       FIRES SYNCHRONOUSLY ON INSERTION. This listener used to be `{ once:
       true }` and was attached BEFORE the frame went into the DOM with no src,
       so the about:blank load consumed it: `is-live` went on 7 ms after mount
       (measured in Chromium, deck still in flight), the reveal timer lifted
       the lid 3.2 s later off a frame whose deck had not arrived, and the 12 s
       watchdog — which checks for `is-live` — never fired at all. On a slow
       store connection that is the deck's own white loading screen on the
       Dining Room wall: the exact photograph this cover was built to end.

       Two defences. The src is set BEFORE insertion, so the first navigation
       is the deck's and no about:blank load is fired (measured: no load event
       within 4 s on a 2 Mbps link, then the real one); and the listener is
       persistent and IGNORES any load whose document is still readable and
       still about:blank — a cross-origin deck throws on that read, which is
       the "a real document from another origin is here" signal overlay.js's
       looksBlocked() is built on. */
    const mounted = frame;                        // this element, not whatever `frame` is later
    frame.addEventListener('load', () => {
      if (rec.destroyed || dead || mounted !== rec.liveFrame) return;
      let blank = false;
      try { blank = mounted.contentWindow && mounted.contentWindow.location.href === 'about:blank'; }
      catch { blank = false; }                    // cross-origin: the deck is there
      if (blank) return;
      /* A board that has already spoken (see BOARD_READY_CAP_MS) owns its own
         reveal: its document being here says nothing about whether it has
         drawn, so `load` lights the glass behind the lid and does nothing
         else. deckArrived stays false until `ready` — a deck still pulling
         its workbook IS the download liveWanted() wants to drop under the
         viewer's scrim — and the 12 s watchdog keeps its clock, because
         "taking a while" is the true sentence for a report on store wifi. */
      if (speaks) { rec.panel.classList.add('is-live'); return; }
      window.clearTimeout(watchdog);
      rec.deckArrived = true;                     // read by liveWanted(), not by CSS
      // the glass powers on now — the deck behind the lid is still white.
      rec.panel.classList.add('is-live');
      window.clearTimeout(revealT);
      revealT = window.setTimeout(uncover, LIVE_REVEAL_MS);
    });
    rec.liveFrame = frame;
    /* THE HANDSHAKE LISTENER — see BOARD_READY_CAP_MS. One per mounted frame,
       on window (postMessage targets the parent window, not the element),
       attached BEFORE the src is set so the report's `loading` — posted from
       its inline script, during parse — cannot be missed. The identity test
       is `event.source === mounted.contentWindow`: not the origin string,
       which any page can claim and which changes if the client moves the
       tool, but the WindowProxy of the element THIS mount put in the DOM.
       `contentWindow` is null once the frame is out of the document, so a
       message from a torn-down frame can never match a live one. */
    if (onMessage) window.removeEventListener('message', onMessage);   // never two for one board
    onMessage = (event) => {
      if (rec.destroyed || dead || mounted !== rec.liveFrame) return;
      if (!mounted.contentWindow || event.source !== mounted.contentWindow) return;
      const d = event.data;
      if (!d || typeof d !== 'object' || d.source !== 'ccc-board') return;
      handleBoard(d);
    };
    window.addEventListener('message', onMessage);
    // 5-minute bucket, not a per-mount stamp: these boards mount and unmount
    // as the room scrolls in and out, and a unique URL each time would refetch
    // the whole deck on every pass. Five minutes is well inside "today's
    // numbers" while still picking up a push within one coffee break.
    // The one exception is a retry() after the board failed: that mount asks
    // for a unique stamp, because the bucket URL is the one the network just
    // left hanging and the cache would hand it straight back.
    const BUCKET = 5 * 60 * 1000;
    bucket = Math.floor(Date.now() / BUCKET);
    frame.src = fresh ? freshUrl(url) : freshUrl(url, BUCKET);   // before insertion — see above
    // The lid goes on WITH the frame, not instead of it. See the
    // .ccc-scr-holding--cover note in the sheet above for the defect this is.
    cover = holdingCard(rec.title, 'Tap to open this board full screen.');
    cover.classList.add('ccc-scr-holding--cover');
    node.replaceChildren(frame, cover);
    fit();

    /* ⚠ ASK THE SERVER WHETHER THE BOARD IS THERE.
       The `load` listener above is the same trap overlay.js was in: it fires
       for a 404, a 500, an empty body and an error page exactly as it does for
       the deck, so `is-live` went on and LIVE_REVEAL_MS lifted the branded
       holding card off a grey rectangle 3.2 seconds later. Confirmed for 404,
       an empty body and an error page; only the hang path (the 12s watchdog
       below) behaved. One GET, cancelled at the headers — see preflight.js —
       answers it, and a definite failure keeps the lid ON with the note
       rewritten, which is the state this screen already knows how to be. */
    preflight(url).then((v) => {
      if (rec.destroyed || frame === null) return;
      if (v.verdict !== 'gone' && v.verdict !== 'unreachable' && v.verdict !== 'empty') return;
      dead = true;
      window.clearTimeout(watchdog);
      refuse(preflightCopy(v, rec.title) + ' Tap to open it full screen.');
    });

    /* A deck that has not arrived by now gets a truer sentence on its lid —
       and KEEPS ITS FRAME. This used to drop the frame at 12 s, and until v15
       that was harmless because the about:blank bug above meant it never ran.
       Now that it can run, dropping the frame would throw away a 5.6 MB deck
       at second 12 of a 22-second download (4 Mbps) — the same mistake
       overlay.js's old 6 s watchdog made with the quote sheets. A genuinely
       dead board is the preflight's call (refuse(), above); this clock only
       ever changes the words. The lid stays on, the frame stays behind it,
       and the load listener uncovers the deck whenever it lands. */
    watchdog = window.setTimeout(() => {
      if (rec.destroyed || rec.deckArrived) return;
      const words = 'This board is taking a while to load. Tap to open it full screen.';
      if (cover) {
        const note = cover.querySelector('.ccc-scr-holding__note');
        if (note) note.textContent = words;
      } else {
        node.replaceChildren(holdingCard(rec.title, words));
      }
      // The glass "powers on" so the lid reads as a lit card, not black glass.
      rec.panel.classList.add('is-live');
    }, 12000);
  }

  /**
   * The no-frame state: this board is in range but the live-iframe ration is
   * spent (see MAX_LIVE_FRAMES / liveBudget()). Shows the mode's own holding
   * card rather than leaving the glass empty. Idempotent — reconcile() calls it
   * on every observer callback — and it never fights mount(): a board that
   * later wins a frame goes through activate(), which replaces these children.
   */
  function hold() {
    if (frame) return;
    if (node.firstElementChild &&
        node.firstElementChild.classList.contains('ccc-scr-holding')) return;
    node.replaceChildren(holdingCard(rec.title, 'Tap to open this board full screen.'));
    rec.panel.classList.add('is-live');
  }

  function unmount() {
    window.clearTimeout(watchdog);
    window.clearTimeout(revealT);
    revealT = 0;
    window.clearTimeout(capT); capT = 0;
    window.clearTimeout(retryT); retryT = 0;
    if (onMessage) { window.removeEventListener('message', onMessage); onMessage = null; }
    speaks = false;
    cover = null;
    rec.panel.classList.remove('is-live');
    if (frame) {
      // Just remove it. Removing an <iframe> destroys its browsing context on
      // the spot AND pushes nothing onto session history — navigating it to
      // about:blank first would stack entries that closeTool()'s history.back()
      // then has to unwind.
      frame.remove();
      frame = null;
    }
    rec.liveFrame = null;
    rec.deckArrived = false;
    node.replaceChildren();
  }

  /**
   * Size the frame to the glass.
   *
   * The virtual viewport keeps the panel's own aspect — that is what makes the
   * scaled frame land corner to corner with no bars and no crop — and is made
   * big enough that the deck inside it lays a whole slide out rather than
   * clipping one, and NO bigger, because every px of height above that floor
   * is a px of scale taken off every glyph on the glass. See
   * LIVE_MIN_VIRTUAL_H for the measurements behind 880 and 935.
   *
   * The scale is uniform, so nothing is distorted, and the frame is positioned
   * at the plane's top-left with `transform-origin: top left`, so the scaled
   * box starts exactly where the glass starts.
   */
  function fit() {
    if (!frame) return;
    const w = rec.planeW, h = rec.planeH;
    if (!w || !h) return;

    const aspect = w / h;                       // the panel's, as measured
    // Derived, not hand-tuned: the height THIS deck was measured to need, the
    // panel's own aspect, and whatever floor rooms.js asked for. Per slug
    // because the two decks' tallest slides are different slides and 57px
    // apart — see LIVE_MIN_VIRTUAL_H_BY_SLUG.
    const minH = LIVE_MIN_VIRTUAL_H_BY_SLUG[rec.slug] || LIVE_MIN_VIRTUAL_H;
    const vw = Math.max(rec.renderWidth, Math.round(minH * aspect));
    const vh = Math.max(1, Math.round(vw / aspect));

    const scale = w / vw;                       // uniform: no distortion
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
    /**
     * A STORE iPAD PARKED ON THE DINING ROOM SHOWED THE LEADERBOARD FROM
     * PAGE-LOAD TIME FOR EVER. This mode exposed no refresh(), so the
     * visibilitychange handler at the foot of this file — which asks every
     * active screen for one — skipped it, and the only thing that ever
     * re-navigated these frames was the room scrolling out of range and back.
     * On a device left on one room, that never happens.
     *
     * Re-mount only when the 5-minute stamp has actually moved on, so a rep
     * flicking between apps does not make the wall reload a 1.15 MB deck every
     * time; and only when a frame is genuinely mounted, so a board holding the
     * branded card because the live-frame ration is spent stays as it is.
     * A board the preflight declared dead retries here too: `dead` is cleared,
     * so a deck that comes back is picked up on the next foreground.
     *
     * A board that FAILED the handshake (said `error`, or never said `ready`
     * inside BOARD_READY_CAP_MS) does not wait for the bucket: it is showing
     * a "not reachable" card with nothing behind it worth keeping, and a tab
     * coming to the foreground is the best moment to ask again — with a
     * fresh stamp, for the reason retry() gives.
     *
     * THE LID IS RE-ARMED BY THIS RE-MOUNT, not merely restored: mount() lays
     * a new cover WITH the new frame and, for a board that speaks, keeps it
     * there until `ready` — so the 5-minute refresh never flashes the
     * report's loading screen either. Measured: a refresh is a full workbook
     * fetch on the report's side (it stamps its own `?t=`), i.e. the same
     * 5-15 s the first load takes.
     */
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

/* ── report ───────────────────────────────────────────────────────────────── */

/** Money compacted for a 297px screen: `$1.63M`, `$107k`, `$8,009`.
 *  The deck prints fmtMoney() everywhere because it has 1920px to print it in.
 *  Here a nine-character figure would take a third of the row and push the
 *  store name — the thing the card is ABOUT — into an ellipsis, so anything
 *  over ten thousand is rounded. Measured: `$107,467` is 62px at 1.24em/1440
 *  and `$107k` is 38px, which is the difference between a 19-character and a
 *  15-character store name in the same row. Below $10,000 nothing is rounded,
 *  because that is the range where the last three digits are the news. */
function fmtMoneyShort(n) {
  const sign = n < 0 ? '-$' : '$';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e3).toLocaleString()}k`;
  return fmtMoney(n);
}

/**
 * How many rows one card can carry.
 *
 * The only decision on this board that a percentage cannot make. Every SIZE is
 * a fraction of the panel's width (see MODE: report in §3), but the row COUNT
 * depends on the panel's height measured in those units — and at a 1024
 * viewport the 11.2px floor under --rpt-u makes the same box relatively
 * shorter, so the same board honestly holds one row fewer.
 *
 * The two constants are the card's own chrome and one row, both in units and
 * both read straight off the CSS above:
 *   chrome 4.1u = slide padding (.72 + .5) + header rail (1.15em x 1.15 line
 *                 + .34 padding + 1px rule) + the body gap + the 2px tick
 *   row    2.5u = 1.62em name x 1.06 line + .44 padding + .34 gap
 *
 * Measured against the panel as it actually lays out:
 *   1024  143 / 11.20 = 12.8u  ->  3 rows
 *   1440  167 / 11.29 = 14.8u  ->  4 rows
 *   1920  201 / 13.53 = 14.9u  ->  4 rows
 *   2560  268 / 18.05 = 14.8u  ->  4 rows
 *   narrow band (390px viewport)  ->  6 rows
 * The clamp is there so a mis-measured plane cannot produce a one-row card or
 * a hundred-row one.
 */
function reportRows(rec) {
  const w = rec.planeW || 300;
  const h = rec.planeH || 170;
  const u = Math.max(11.2, w * 0.038);
  return Math.max(2, Math.min(8, Math.floor((h / u - 4.1) / 2.5)));
}

/**
 * Is this panel too narrow to carry a secondary column?
 *
 * The board's SIZES are a percentage of the panel, so a 253px panel and a
 * 475px one are the same picture - except at 1024, where --rpt-u hits its
 * 11.2px floor and the type stops shrinking with the box. Measured in units
 * the panel is 26.3u wide at 1440, 1920, 2560 AND in the narrow band, and only
 * 22.6u at 1024. Below 24u the money column costs more than it is worth: at
 * 1024 it took the store-name column down to ~13 characters, which put
 * "Evergreen Park" and "Round Lake Beach" - the name is what the row is ABOUT
 * - into an ellipsis. Dropping it gives the name ~17 characters back.
 */
function reportDense(rec) {
  const w = rec.planeW || 300;
  return w / Math.max(11.2, w * 0.038) < 24;
}

/** Split a list into as few pages as `per` allows, then even them out, so 5
 *  districts over a 4-row card come out 3 + 2 rather than 4 + 1. */
function paginate(list, per) {
  const pages = Math.max(1, Math.ceil(list.length / Math.max(1, per)));
  const size = Math.ceil(list.length / pages);
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** The source app's own staleness rule, and its reason: "a wrong counter on a
 *  store TV is worse than no counter at all". A streak board more than three
 *  days old is dropped from the rotation rather than shown. */
function streaksFresh(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String((data && data.asOf) || ''));
  if (!m) return false;
  const asOf = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return (Date.now() - asOf.getTime()) / 86400000 <= 3;
}

/** One data row. `fill` (0..1) paints the meter behind the type. */
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

/** The frame every card shares: header rail, body, slide clock. */
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

/**
 * The rotation.
 *
 * Card order follows the deck's own buildSlides(): the market first, then
 * store performance, then yesterday's conversion, then the standings — with
 * the promo card interleaved every PROMO_EVERY_N slides and always last,
 * which is the source app's rule and its number.
 *
 * WHAT IS DELIBERATELY NOT HERE. The Back Office monitor already runs
 * district-by-district "days since last detractor" across all 27 stores. This
 * board takes ONE different slice of the same feed — a market-wide leaderboard
 * of the longest clean streaks, top N only — so the two screens in the
 * building never show the same card.
 *
 * @param {object|null} model    the parsed workbook, or null if it never came
 * @param {object|null} streaks  nps-detractor-streaks.json, or null
 * @param {number} rows          rows this panel can carry, from reportRows()
 * @param {boolean} promoOk      false once the promo card has 404'd
 * @param {boolean} dense        drop the secondary column; see reportDense()
 */
function buildReportCards(model, streaks, rows, promoOk, dense) {
  const cards = [];

  if (model) {
    cards.push({ kind: 'pulse' });

    // Store overview / profit-goal tracking, best-tracking first. The deck
    // pages these in national-rank order; on a board this size a monotonic
    // meter is what makes the card readable at a glance from across the room,
    // so the sort is % of goal and the national rank is not shown here (it is
    // one tap away in the deck itself).
    const goal = model.stores.slice().sort((a, b) => {
      const pa = a.target > 0 ? a.gpTrend / a.target : -1;
      const pb = b.target > 0 ? b.gpTrend / b.target : -1;
      return pb - pa;
    });
    paginate(goal, rows).forEach((page, i, all) =>
      cards.push({ kind: 'goal', page, i, n: all.length, dense }));

    // Yesterday's conversion: one row per district plus the MARKET total, the
    // same table the deck draws per district with its DISTRICT TOTAL row.
    const conv = model.districts.slice()
      .sort((a, b) => (b.traffic ? b.mobile / b.traffic : 0) - (a.traffic ? a.mobile / a.traffic : 0));
    // The MARKET total is paginated as an ITEM rather than bolted onto the
    // last page: 5 districts + 1 total over a 4-row card pages 3 + 3, both
    // full, where 5 districts alone paged 3 + 2 and left the first card a row
    // short of its own rule.
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

  // Nothing from either feed, but the promo card may still be there — and
  // "today's deals to lead with" is real content, not a placeholder. If that
  // 404s too, promoOk goes false, this returns empty and the caller falls to
  // the branded holding card.
  if (!cards.length) return promoOk === false ? [] : [{ kind: 'promo' }];

  // The source app's interleave, verbatim in shape: a promo every N cards, and
  // the rotation always ends on one.
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

  /* The glass is never empty — the same rule §6's feed learned the hard way.
     The branded card is the RESTING state and the board replaces it. */
  function showHolding(note) {
    node.replaceChildren(holdingCard(TITLE(), note));
    rec.panel.classList.remove('is-live');
  }

  /** The promo card, built out of `image` mode's own two-layer art so a 1.40
   *  card in a 1.77 screen goes edge to edge instead of sitting in two bars. */
  function promoNode() {
    const art = el('div', { class: 'ccc-scr-art' });
    const src = promoSrc();
    const bg = el('img', { class: 'ccc-scr-art__bg', alt: '', 'aria-hidden': 'true', decoding: 'async' });
    const fg = el('img', { class: 'ccc-scr-art__fg', alt: '', 'aria-hidden': 'true', decoding: 'async' });
    // A promo card that has not been uploaded yet must not become a broken
    // slide in the rotation — the source app drops the slide, so this does too.
    fg.addEventListener('error', () => {
      if (rec.destroyed || promoOk === false) return;
      promoOk = false;
      build();
    }, { once: true });
    fg.src = src; bg.src = src;
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
          // Two short lines rather than one long one: measured at 1440 the
          // combined line ran past 276px of usable row and ellipsised its own
          // last clause away. The close rate has a whole card of its own.
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
          // The MARKET row is the deck's own DISTRICT TOTAL one level up:
          // same columns, lit rule, and no meter, because a total has nothing
          // to race against.
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

    // card.kind === 'rank'
    const isDM = card.of === 'dm';
    // Kickers are kept under ~22 characters on purpose: measured at 1440 the
    // header rail has 276px, and at 1.15em with .085em of tracking that is
    // about where a nowrap kicker starts eating its own tail.
    return rptSlide(isDM ? 'District managers' : 'Region rankings',
      `of ${card.total}`,
      rptBody(card.page.map((r) => rptRow({
        rank: `#${r.rank}`,
        name: r.name,
        // On a dense panel the rank and the name are the story; the average GP
        // trend is what gets dropped, because "Imaad Dhorajiwala" truncated to
        // "Imaad Dhoraj..." is a worse card than one carrying no dollar figure.
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
      if (document.visibilityState === 'hidden') return;
      show(index + 1);
    }, REPORT_SLIDE_MS);
  }
  function stopTimer() { if (timer) { window.clearInterval(timer); timer = 0; } }
  function stopRetry() { if (retryTimer) { window.clearInterval(retryTimer); retryTimer = 0; } }

  /** Keep asking while the board is on screen and the WORKBOOK has still never
   *  arrived — a board running on the streak feed alone is showing something
   *  real, but it is not yet the sales report the client asked for. */
  function startRetry() {
    if (retryTimer || model || !active) return;
    retryTimer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (model || retries >= RETRY_LIMIT) { stopRetry(); return; }
      retries++;
      pull({ force: true });
    }, RETRY_EVERY_MS);
  }

  /**
   * One round of fetching, at most one in flight per panel.
   *
   * Both sources are asked together and NEITHER can take the other down: each
   * loader swallows its own failure and resolves last-good-or-null, and the
   * extra .catch() here is belt and braces for a synchronous throw inside one
   * of them. Whatever arrives is rendered; whatever did not is retried.
   */
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
      // build() unconditionally, even with nothing from either feed: the promo
      // card may still be up, and buildReportCards() falls back to it before it
      // falls back to the holding card. build() shows the holding card itself
      // when there is genuinely nothing, so there is no second code path here.
      build();
      if (!model) startRetry();
    });
  }

  // The resting state, in the DOM from the moment the panel mounts.
  showHolding(WAITING);

  return {
    node,
    /** Re-page only when the panel's height in units has actually crossed a
     *  row boundary. Every SIZE on the board is a container percentage and
     *  needs no help from here. */
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
    /** A tab returning to the foreground gets a board no older than the TTL —
     *  and never re-downloads 1.1MB just because someone changed windows. */
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

/* -----------------------------------------------------------------------------
 * 7 · The record set + narrow-mode relocation
 * -------------------------------------------------------------------------- */

const records = new Set();
let narrowMQ = null;
let isNarrow = false;
let narrowHostResolver = null;

/* The phone band is watched separately from the narrow band because it is a
   different question with a different answer: the narrow band decides WHERE a
   panel is drawn, the phone band decides how many of them may be a whole extra
   document. A phone matches both; an iPad matches only the first. */
let phoneMQ = null;
let isPhone = false;

/** How many `live` iframes may run at once, right now. */
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
  // Rotating a phone crosses this boundary, so the budget has to be re-applied
  // rather than sampled once at boot. reconcile() is idempotent.
  const onPhoneChange = () => {
    const next = phoneMQ.matches;
    if (next === isPhone) return;
    isPhone = next;
    reconcile();
  };
  if (phoneMQ.addEventListener) phoneMQ.addEventListener('change', onPhoneChange);
  else if (phoneMQ.addListener) phoneMQ.addListener(onPhoneChange);
}

/** The room this host belongs to, and its stage. */
function roomOf(host) {
  const stage = host.closest ? host.closest('.stage') : null;
  const room = host.closest ? host.closest('[data-room]') : null;
  return {
    stage: stage || host.parentElement,
    room,
    roomId: room ? (room.getAttribute('data-room') || '') : ''
  };
}

/**
 * Where a panel goes when the viewport is too narrow for the art.
 *
 * Resolution order, most specific first:
 *   1. the `narrowHost` callback passed to mountRoomScreens / mountScreen
 *   2. an element the page provides:  [data-screens-narrow] inside the room
 *   3. our own band: `.ccc-scr-layer`, inserted into `.stage` before `.rail`
 *
 * 1 and 2 exist so the owner of the mobile page layout can put the screens
 * wherever the mobile composition wants them without editing this file.
 */
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

/** Move one panel between the art and the narrow band. */
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
    // Drop the perspective: a warped panel in a flat band is nonsense.
    rec.plane.style.width = '';
    rec.plane.style.height = '';
    rec.plane.style.transform = '';
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

/* -----------------------------------------------------------------------------
 * 8 · Geometry
 * -------------------------------------------------------------------------- */

/**
 * Resolve the quad's percentages into host-local, UNTRANSFORMED pixels.
 *
 * ⚠ THE BUG THIS FUNCTION EXISTS TO NOT HAVE. The host lives inside
 * `.hotspots`, which theme.css scales by `--plate-scale * --overscan-k` and
 * drifts with the parallax. `getBoundingClientRect()` reports that transformed
 * box — so resolving a percentage against it produces a LAYOUT offset that is
 * already ~10% too large, which the ancestor transform then scales a second
 * time. The error is proportional to distance from the layer's centre, so the
 * left tablet lands 39px right of its glass and the right one 121px: a screen
 * that is subtly, progressively wrong across the frame.
 *
 * offsetWidth / offsetHeight are the layout box, before any transform, which is
 * the coordinate space the plane is actually positioned in. Use them. `k` undoes
 * the ancestor scale for the one case that genuinely needs a rect — a `quadRef`
 * that is a different element from the host.
 */
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

/**
 * Size the plane, warp it if it hangs at an angle, then tell the mode.
 *
 * The plane is given a flat W x H pixel box — W and H from the averaged
 * opposing edges of the target quad, so the pre-warp render resolution is close
 * to the on-screen size and text stays crisp — and then mapped onto the
 * measured corners. `transform-origin: 0 0` is what makes the solve valid.
 */
function applyGeometry(rec) {
  if (rec.destroyed || !rec.plane) return;

  let applied = false;
  let W = 0, H = 0;

  if (rec.narrow) {
    // The band is not inside the transformed plate layer, so the layout box is
    // the on-screen box.
    W = rec.panel.offsetWidth; H = rec.panel.offsetHeight;
  } else {
    const hostRect = rec.host.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return;     // not laid out yet
    // The ancestor scale, as a number that undoes it. See resolveQuadPx().
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
      // Layout size again, not the rect: an axis-aligned screen's iframe scale
      // is computed from this, and inside a scaled layer the rect is ~10% wide.
      W = rec.host.offsetWidth; H = rec.host.offsetHeight;
    }
  }

  if (!W || !H) return;
  rec.planeW = W;
  rec.planeH = H;
  rec.panel.classList.toggle('ccc-scr--quad', applied);

  // The one number every mode's internal type scale is expressed in em of.
  // 1/40th of the glass width, floored so a tiny tablet is not sub-pixel.
  rec.plane.style.setProperty('--scr-w', W.toFixed(1));
  rec.plane.style.setProperty('--scr-h', H.toFixed(1));
  // The narrow band is read at arm's length on a small panel, the art at room
  // distance on a large one, so the unit is bigger relative to the box.
  //
  // W/27 rather than W/32: on a 390px phone the band panel is 346px of glass, and
  // at /32 the streak board's store names came out at 8.4 CSS px and its "days
  // clean" caption at 5.8 — smaller than any system text style, i.e. below the
  // client's one standing requirement for these screens ("large enough that we
  // can read them on a mobile device"). /27 puts the names at 10.2px and the
  // numerals at 39px with the grid still clearing its tiles; see NARROW_AR.feed,
  // which was opened up at the same time to give those rows the height back.
  rec.plane.style.setProperty('--scr-u', `${Math.max(9, W / (rec.narrow ? 27 : 40)).toFixed(2)}px`);

  if (rec.api && rec.api.resize) rec.api.resize(rec);
}

/* -----------------------------------------------------------------------------
 * 9 · Mount budget
 * -------------------------------------------------------------------------- */

function reconcile() {
  const all = Array.from(records).filter((r) => !r.destroyed);

  // 1. Everything cheap follows its observer exactly.
  for (const rec of all) {
    if (rec.mode === 'live') continue;
    if (rec.wantsMount && !rec.active) { rec.active = true; rec.api.activate(rec); }
    else if (!rec.wantsMount && rec.active) { rec.active = false; rec.api.deactivate(rec); }
  }

  // 2. Live iframes are rationed, nearest-to-the-viewport first.
  const live = all.filter((r) => r.mode === 'live');
  for (const rec of live) {
    if (!liveWanted(rec) && rec.active) { rec.active = false; rec.api.deactivate(rec); }
  }

  const mid = window.innerHeight / 2;
  // A layout read, yes — but only ever inside an IntersectionObserver callback
  // or a media change, never inside the engine's rAF loop.
  const dist = (rec) => {
    const r = (rec.narrow ? rec.panel : rec.plane).getBoundingClientRect();
    return Math.abs((r.top + r.height / 2) - mid);
  };

  const budget = liveBudget();
  let running = live.filter((r) => r.active);

  // The budget can SHRINK under us — a phone rotating out of landscape, where
  // (max-height: 500px) stops matching, goes 2 -> 1 with two frames already up.
  // Evict the furthest until the budget is met, or the ration is a ceiling that
  // only ever applies to boards that had not mounted yet.
  while (running.length > budget) {
    let worst = null, worstD = -1;
    for (const rec of running) { const d = dist(rec); if (d > worstD) { worstD = d; worst = rec; } }
    if (!worst) break;
    worst.active = false;
    worst.api.deactivate(worst);
    running = running.filter((r) => r !== worst);
  }

  const waiting = live.filter((r) => liveWanted(r) && !r.active)
    .map((r) => ({ rec: r, d: dist(r) }))
    .sort((a, b) => a.d - b.d);

  for (const cand of waiting) {
    if (running.length >= budget) {
      let worst = null, worstD = -1;
      for (const rec of running) { const d = dist(rec); if (d > worstD) { worstD = d; worst = rec; } }
      if (!worst || worstD <= cand.d) break;
      worst.active = false;
      worst.api.deactivate(worst);
      running = running.filter((r) => r !== worst);
    }
    cand.rec.active = true;
    cand.rec.api.activate(cand.rec);
    running.push(cand.rec);
  }

  // WHAT THE UNBUDGETED BOARD SHOWS. Not black glass. A `live` panel that is in
  // range but did not win a frame gets the same branded holding card the mode
  // already falls back to when a deck will not load — it names the board and
  // says "tap to open it full screen", and the button over the glass is
  // untouched, so the client's rule (every screen readable and clickable the
  // whole time its room is on screen) still holds with one iframe instead of
  // two. hold() is idempotent; reconcile() runs on every observer callback.
  for (const rec of live) {
    if (rec.wantsMount && !rec.active && rec.api && rec.api.hold) rec.api.hold(rec);
  }
}

/* ── WHEN A PHONE IS ALLOWED TO HOLD A LIVE DOCUMENT ──────────────────────
 * MAX_LIVE_FRAMES_PHONE caps live iframes at one. It does not say for how
 * long, and on this page that turned out to be "essentially always": the lazy
 * gate above is an IntersectionObserver with rootMargin 150%, and the panel it
 * observes lives inside a STICKY stage that theme.css §05 pins to the viewport
 * a full --pin-lead early and releases a --pin-lead late. A pinned panel's rect
 * sits at the top of the viewport and stops moving, so the observer keeps
 * reporting it as intersecting for the whole of its room's runway and a
 * viewport and a half either side of that. Measured at 393x852: the Dining
 * boards were mounted from scrollY 591 to 7092 out of 8230 — a whole extra
 * document, laid out in a 1703x960 virtual viewport, carried through five rooms
 * that do not contain it. (The Win-the-Weekend deck is 5.6 MB of HTML.)
 *
 * theme.css §06e's curtain already knows exactly when a room is not being
 * looked at, and engine.js publishes it as one class. So on a phone a live
 * iframe additionally requires its own room to be resident. Nothing changes
 * anywhere else: `is-dormant` is only ever set by engine.js, it is set on every
 * breakpoint, and this is the only place outside theme.css §06e that reads it.
 *
 * ON AN iPAD AND A DESKTOP THIS FUNCTION IS `rec.wantsMount`, EXACTLY AS
 * BEFORE. isPhone cannot match an iPad — see PHONE_MEDIA — and a panel with no
 * room element (a standalone mount) is never gated.
 *
 * WHAT THE UNBUDGETED BOARD SHOWS IS UNCHANGED: hold() below still gives it the
 * branded holding card, still names the board, and the button over the glass is
 * still live, so "every screen readable and clickable the whole time its room
 * is on screen" holds — the room this defers is a room that is not on screen.
 */
function liveWanted(rec) {
  if (!rec.wantsMount) return false;
  /* WHILE THE TOOL VIEWER IS UP, A DECK THAT HAS NOT ARRIVED YET IS NOT
     WANTED. The viewer's scrim hides the whole room, and a 5 MB deck still
     coming down behind it is on the same HTTP/2 connection — same host — as
     the tool the rep is now waiting for. Measured at a 4 Mbps shared link,
     opening Win the Weekend from the Dining Room while its boards were still
     loading: 33.6 s to the deck's slides (v14), 12.4 s once the in-flight
     boards were dropped for the duration; the Daily Sales Report from the same
     spot, 15.7 s to its first slide (v14), 7.3 s. A board that HAS arrived is
     left alone: it costs no network to keep and 5 MB to bring back, and it is
     showing again the instant the viewer closes. The dropped ones re-mount on `ccc:viewer-close` through
     the ordinary reconcile(), from the HTTP cache when the same 5-minute
     bucket is still current.
     `deckArrived`, not the `is-live` class: hold() puts is-live on a board
     that is showing its holding card with no frame at all, and reading the
     class here re-mounted every dropped board on the next observer callback
     — measured as the decks downloading TWICE under the scrim (26 MB). */
  if (viewerOpen && !rec.deckArrived) return false;
  if (!isPhone || !rec.roomEl) return true;
  return !rec.roomEl.classList.contains('is-dormant');
}

/** True between overlay.js's `ccc:viewer-open` and `ccc:viewer-close`. */
let viewerOpen = false;
document.addEventListener('ccc:viewer-open', () => { viewerOpen = true; reconcile(); });
document.addEventListener('ccc:viewer-close', () => { viewerOpen = false; reconcile(); });

/* liveWanted() reads a class that nothing in this module writes, so nothing in
 * this module would ever notice it change: reconcile() runs on observer
 * callbacks and media changes, and a curtain lifting is neither. Without this
 * watch a board would go dark when its room went dormant and never come back.
 *
 * One MutationObserver for the whole page, attributeFilter'd to `class`, on the
 * handful of .room elements that actually contain a live panel. engine.js
 * touches those classes a few times per full-page scroll (updateResidency()
 * early-outs on an unchanged bitmask), so this fires about as often as the room
 * label in the top bar changes. reconcile() is idempotent. */
let residencyObs = null;
const residencyWatched = new WeakSet();

function watchResidency(roomEl) {
  if (!roomEl || residencyWatched.has(roomEl)) return;
  if (typeof MutationObserver !== 'function') return;
  if (!residencyObs) residencyObs = new MutationObserver(() => reconcile());
  residencyWatched.add(roomEl);
  residencyObs.observe(roomEl, { attributes: true, attributeFilter: ['class'] });
}

/** Pull url/title off the registry once it exists. */
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

/* -----------------------------------------------------------------------------
 * 10 · mountScreen()
 * -------------------------------------------------------------------------- */

/**
 * Mount one screen.
 *
 * @param {object}  cfg
 * @param {Element} cfg.host        the positioned box the room layout produced.
 *                                  With `quad` it is the PERCENT REFERENCE BOX
 *                                  and should be full-bleed over the plate.
 * @param {string}  cfg.slug        tool slug — drives the click-through
 * @param {'title'|'image'|'feed'|'live'|'report'} [cfg.mode]  default: SCREEN_MODES[slug] or 'title'
 * @param {Array<[number,number]>}  [cfg.quad]  TL,TR,BR,BL in % of the reference box
 * @param {Element} [cfg.quadRef]   measure the % against this instead of host
 * @param {string}  [cfg.url]       default: the tool's url
 * @param {string}  [cfg.title]     default: the tool's label
 * @param {string}  [cfg.headline]  display name for `title` mode (default: title)
 * @param {number}  [cfg.width]     virtual render width for `live`
 * @param {Function}[cfg.narrowHost] ({slug,mode,room,host}) => Element
 * @returns {{destroy:Function, refresh:Function, host:Element, slug:string, mode:string}}
 */
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

  const glass = el('div', { class: 'ccc-scr__glass' });
  const label = el('span', { class: 'ccc-sr-only' });
  const hit = el('button', { class: 'ccc-scr__hit', type: 'button' }, [label]);
  hit.setAttribute('data-tool', slug);        // overlay.js's delegated handler

  // Everything visible lives inside ONE wrapper, so in perspective mode the
  // single matrix3d carries glass, glow, reflection, bezel AND the hit target
  // onto the wall plane together — the reflection stays welded to the screen,
  // and the browser's own hit-testing follows the transform, so a click on a
  // slanted corner lands where it looks like it should.
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
    // The .room this panel lives in, cached at registration. reconcile() reads
    // its `is-dormant` class to decide whether a live iframe is allowed — see
    // liveWanted(). Null for a panel mounted outside a room.
    roomEl: roomOf(host).room,
    active: false,
    wantsMount: false,
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

  applyMeta(rec);                              // headline before the renderer
  rec.api = RENDERERS[mode](rec);
  rec.content = el('div', { class: 'ccc-scr__content' }, [rec.api.node]);
  glass.append(rec.content);

  host.append(panel);
  records.add(rec);

  relocate(rec);                               // places it and measures it
  applyMeta(rec);                              // and now the caption/label

  /* --- lazy gate -----------------------------------------------------------
     A screen comes to life about one and a half viewports out. Anything
     further away is not worth an iframe or a fetch on an iPad. */
  // Only `live` panels are rationed by residency, so only their rooms are
  // watched — see liveWanted() and watchResidency().
  if (mode === 'live') watchResidency(rec.roomEl);

  if ('IntersectionObserver' in window) {
    rec.io = new IntersectionObserver((entries) => {
      for (const entry of entries) rec.wantsMount = entry.isIntersecting;
      reconcile();
    }, { root: null, rootMargin: '150% 0px 150% 0px', threshold: 0 });
    rec.io.observe(panel);
  } else {
    rec.wantsMount = true;
    reconcile();
  }

  if ('ResizeObserver' in window) {
    rec.resizeObs = new ResizeObserver(() => {
      // Coalesce: a band resize fires for every panel in it.
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

/* -----------------------------------------------------------------------------
 * 11 · mountRoomScreens()
 * -------------------------------------------------------------------------- */

/**
 * Mount every `[data-screen="<slug>"]` box found under `root`.
 *
 * Attributes read off the host:
 *   data-screen        the tool slug (required)
 *   data-screen-mode   title | image | feed | live | report  (default: SCREEN_MODES)
 *   data-screen-title  accessible / caption name     (default: the tool label)
 *   data-screen-name   short display name for a title card
 *   data-screen-quad   TL,TR,BR,BL in % of the plate — eight numbers or JSON
 *   data-screen-url    override the tool url
 *   data-screen-width  virtual render width for a live iframe
 *
 * @param {ParentNode} [root=document]
 * @param {object}   [opts]
 * @param {Array}    [opts.tools]       tools.json rows, for url/label lookup
 * @param {Function} [opts.narrowHost]  see mountScreen
 */
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

/** Re-measure every screen. Cheap and rare — call it after a layout change. */
export function refreshScreens() {
  for (const rec of records) applyGeometry(rec);
  reconcile();
}

/* Orientation changes on an iPad move every plane at once. */
window.addEventListener('orientationchange', () => {
  setTimeout(refreshScreens, 200);
});

/* A tab coming back from the background gets a fresh promo card and, if the
   streak data has aged past its TTL, a fresh board — without a second loop.
   The board half of that sentence used to be a comment and nothing else: only
   `image` was refreshed, and the tear-down/set-up pair it used dropped the
   image's own retry timer on the floor. Both modes now expose `refresh()` and
   this asks for it; every other mode is left alone. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  for (const rec of records) {
    if (rec.destroyed || !rec.active || !rec.api) continue;
    if (typeof rec.api.refresh === 'function') rec.api.refresh(rec);
  }
});

/* =============================================================================
 * CLASS HOOKS — the contract with assets/theme.a73825e539.css
 * -----------------------------------------------------------------------------
 * Structure (one per screen):
 *   .ccc-scr[data-screen-panel="<slug>"]      the panel
 *     .ccc-scr--title|--image|--feed|--live|--report   its mode
 *     .ccc-scr--quad                          a solved perspective warp is on
 *     .ccc-scr--narrow                        it is in the narrow band
 *     .is-live                                its content has arrived
 *     .ccc-scr__plane   > __glow __glass __scan __crt __sheen __bezel __cap __hit
 *     .ccc-scr__content > one of:
 *         .ccc-scr-title  (__bar __term __stat __pip __body __name
 *                          __key __cta __chev)
 *         .ccc-scr-art    (__bg __fg)
 *         .ccc-scr-feed   (__stage __slide __head __eyebrow __district __goal
 *                          __grid __store __days __unit __name __meter __flag
 *                          __foot __dots)
 *         .ccc-scr-live
 *         .ccc-scr-rpt    (__stage __slide __head __kick __meta __body __row
 *                          __fill __rank __name __sub __val __hero __num
 *                          __cap __line __tick;  row states .is-podium
 *                          .is-hit .is-miss .is-total .is-mine;  slide state
 *                          .is-art, which carries an .ccc-scr-art promo card)
 *         .ccc-scr-holding (__mark __title __note)
 *
 * Narrow band:
 *   .ccc-scr-layer[data-screens-layer="<room>"]  one per room, inside .stage,
 *                                                inserted before .rail
 *   .ccc-scr-layer--<room>                       per-room hook
 *   --scr-count / --scr-gap / --scr-band-h       the band's sizing knobs
 *   .stage[data-ccc-screens="narrow|wide"]       page-level hook
 *   Supply `[data-screens-narrow]` inside a room, or pass `narrowHost`, and
 *   this module puts the panels there instead of building its own band.
 *
 * Custom properties JS writes on `.ccc-scr__plane`:
 *   --scr-w --scr-h      the glass size in px, PRE-warp (unitless numbers)
 *   --scr-u              the type unit: max(9px, width / 40), or / 32 when narrow.
 *                        Every size inside a feed or holding card is an em of it.
 *   --scr-title-fs       the solved subject size for `title` mode
 *   --scr-pos-fs         the solved chrome unit for `title` mode — the rail,
 *                        the key and the chevron are all ems of it
 * and on the panel: --scr-ar (narrow aspect ratio, a plain number).
 * CSS-side, `.ccc-scr--narrow .ccc-scr__plane` defines --scr-cap-h (the caption
 * rail's height); set it to 0px to reclaim that strip for the glass.
 * The feed's grid carries --scr-cols and --scr-num (the numeral's em size),
 * both solved from the glass width and the store count.
 * The report board carries --rpt-u (its one type unit — max(11.2px, 3.8cqw),
 * with a --scr-w-derived fallback for engines without container queries) and
 * --rpt-slide (the slide clock's duration, written by JS from
 * REPORT_SLIDE_MS). Its row COUNT is solved in JS by reportRows().
 *
 * Custom properties JS READS (all from the engine, all @property-registered):
 *   --enter --bloom --p
 * ========================================================================== */
