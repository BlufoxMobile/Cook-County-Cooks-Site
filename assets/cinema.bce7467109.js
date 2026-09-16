/* =============================================================================
 * Cook County Cooks — v3 "Cinema"
 * assets/cinema.js  ·  THE INTEGRATOR
 * -----------------------------------------------------------------------------
 * THIS FILE USED TO BE app.js AND IS OTHERWISE UNCHANGED. app.js is now a ~2 KB
 * router that decides, before first paint, whether this device gets the
 * restaurant or the pocket list, and dynamic-imports one of the two. Everything
 * below is the restaurant. A phone never reaches this file — and that is the
 * point: engine, overlay, screens, chefwall, labels, wallprint and freezer are
 * ~700 KB of modules and eight full-bleed plates, on a device whose whole web
 * content budget is around 200 MB and which was crashing under it.
 *
 * The one export is boot(); the router calls it. Nothing else changed.
 * -----------------------------------------------------------------------------
 * The four feature modules (engine, overlay, chefwall, theme) know nothing about
 * each other. This file is the only place that does. Its whole job is:
 *
 *   1. turn rooms.js geometry + tools.json data into the DOM contract in SPEC.md
 *   2. hand each module the exact hooks its own doc comment asks for
 *   3. boot them in the one order that works
 *
 * WHAT THIS FILE MAY NOT DO — read this before editing:
 *   · It must never write --p, --plate-scale, --plate-x, --plate-y, --enter or
 *     --bloom. Those six numbers belong to engine.js alone (SPEC.md §"CSS custom
 *     properties"). Everything cinematic is composed in theme.css from them.
 *   · It must never set transform on .plate-wrap.
 *   · It must never introduce a CSS class theme.css does not already style, and
 *     it must never turn on `scroll-behavior: smooth` (see NOTE 1 below).
 *
 * NOTE 1 — the scroll-behavior land mine.
 *   theme.css §03 sets `html { scroll-behavior: smooth }`. engine.js implements
 *   scrollToRoom() as a per-frame `window.scrollTo(0, y)` tween inside its own
 *   rAF loop. With CSS smooth scrolling on, EVERY one of those ~60 writes starts
 *   its own native smooth animation, the two fight, and the top menu ends up
 *   crawling to the wrong place — the exact bug that broke v2's menu. We turn it
 *   off from here, on the element, at boot. This is the countermeasure, not a
 *   violation of the "never smooth" rule.
 *
 * NOTE 2 — why some hosts are full-bleed.
 *   theme.css §09 sizes every direct child of .hotspots from --x/--y/--w/--h
 *   (defaulting to 10% x 10%). chefwall.js and a perspective screen both want a
 *   host that is the WHOLE plate box, because their own percentages are measured
 *   in plate space. So those hosts are given --w:100%/--h:100% explicitly rather
 *   than being allowed to fall through to the 10% default.
 *
 * Plain ES module. No build step, no npm, no framework, no external JS.
 * ========================================================================== */

import { initEngine, scrollToRoom, onRoomChange } from './engine.cccb8d066e.js';
import { initOverlay, openTool } from './overlay.b0ac36a5b6.js';
import { mountRoomScreens } from './screens.d80858d3cf.js';
import { initChefWall } from './chefwall.2e2da0a5e6.js';
import { initLabels } from './labels.25f429c431.js';
import { buildWallPrint, revealWallPrints } from './wallprint.636de3ceef.js';
import { initFreezer } from './freezer.39bd7199fd.js';
/* The lock is shared with the pocket list — see coldgate.js. It owns the
   sealed envelope, the session restore, the keypad and every path to
   coldstore.js's crypto; this file owns the door, the beat and the chips. */
import {
  initColdGate, setAdopt, coldTools, isFreezerUnlocked, sealedCount,
  onFreezerUnlock, openKeypad
} from './coldgate.0a2c572c3c.js';
import { el, fill, $ } from './dom.a199da796c.js';
import { ROOM_ORDER, HOTSPOTS, CHEF_FRAMES, FREEZER_DOOR } from '../rooms.88de5861ae.js';


/* §0 · TINY DOM HELPERS — el(), fill() and $() now live in dom.js, because the
 * pocket list and the cold-storage gate build DOM the same way and must not
 * import this file to do it. Same three functions, same behaviour. */

/** Ordinal words for the course kickers. Seven rooms; no need to be clever. */
const COURSE = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

/**
 * How many tools the site has, sealed ones included.
 *
 * `data.tools` holds only what shipped in plaintext — 23 while the walk-in is
 * locked, 37 once the fourteen have been decrypted into it. Both headline
 * counts ("37 tools") are rendered once, at boot, and must not shrink just
 * because the freezer has not been opened yet.
 */
function totalToolCount(data) {
  return data.tools.length + (isFreezerUnlocked() ? 0 : sealedCount());
}

/** Is this URL somewhere other than our own origin? Drives target="_blank". */
function isExternal(url) {
  try { return new URL(url, document.baseURI).origin !== location.origin; }
  catch { return false; }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 1 · DATA
 *
 * index.html inlines both JSON payloads on window.__CCC_INLINE__ because
 * fetch() against a file:// URL is CORS-blocked — the site has to open straight
 * off disk for local review. Every real deployment could fetch instead; we keep
 * the fetch path as a fallback so the module still works if the inline block is
 * ever dropped.
 * ────────────────────────────────────────────────────────────────────────── */

/** Per-room art direction: where the practical lights are, and how to crop.
 *  --focus-x / --focus-y / --glow-x / --glow-y are documented per-room overrides in
 *  theme.css §06. They are the only custom properties this file writes on a
 *  .room, and none of them belong to the engine. Values eyeballed off the
 *  actual renders (see all-rooms.png). */
const ROOM_ART = {
  hero:      { focus: '50% 45%', glowX: '50%', glowY: '20%' },
  pass:      { focus: '50% 58%', glowX: '50%', glowY: '28%' },
  host:      { focus: '52% 44%', glowX: '22%', glowY: '16%' },
  dining:    { focus: '50% 40%', glowX: '50%', glowY: '24%' },
  prep:      { focus: '46% 46%', glowX: '60%', glowY: '22%' },
  office:    { focus: '60% 50%', glowX: '50%', glowY: '16%' },
  breakroom: { focus: '46% 48%', glowX: '34%', glowY: '16%' },
  freezer:   { focus: '46% 50%', glowX: '66%', glowY: '14%' }
};

/**
 * The room's inline custom properties.
 *
 * `focus` stays authored as an object-position pair because that is how anyone
 * eyeballing a crop thinks about it, but theme.css §06 needs it as two unitless
 * fractions: .plate-wrap and .hotspots are both sized to the plate's COVER box
 * and offset by the crop, so the SAME numbers have to move both layers or the
 * hotspots come off their objects.
 */
function roomVars(art) {
  const [fx, fy] = String(art.focus || '50% 50%').trim().split(/\s+/);
  const frac = (v, fallback) => {
    const num = parseFloat(v);
    return Number.isFinite(num) ? (num / 100).toFixed(4) : fallback;
  };
  return `--focus-x:${frac(fx, '0.5')};--focus-y:${frac(fy, '0.5')};` +
         `--glow-x:${art.glowX || '62%'};--glow-y:${art.glowY || '30%'}`;
}

/** The generated plates are 2400x1340 (and 1400x781 for the @1400 cut). */
const PLATE_W = 2400;
const PLATE_H = 1340;

async function loadData() {
  const inline = window.__CCC_INLINE__;
  if (inline && inline.tools && inline.headchefs) return inline;

  // Fallback for a served deployment where the inline block was removed.
  const [tools, headchefs] = await Promise.all([
    fetch('data/tools.f0f6c533e3.json').then((r) => r.json()),
    fetch('headchefs/headchefs.json').then((r) => r.json())
  ]);
  return { tools, headchefs };
}

/** Everything derived from tools.json, computed once. */
function indexTools(toolsDoc) {
  const rooms = toolsDoc.rooms || [];
  const tools = toolsDoc.tools || [];

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const bySlug = new Map(tools.map((t) => [t.slug, t]));

  // Room -> tools, in tools.json order. Every room key exists even if empty, so
  // callers never have to null-check.
  const byRoom = new Map(ROOM_ORDER.map((id) => [id, []]));
  for (const tool of tools) {
    if (!byRoom.has(tool.room)) byRoom.set(tool.room, []);
    byRoom.get(tool.room).push(tool);
  }

  return { rooms, tools, roomById, bySlug, byRoom };
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · THE FREEZER GATE — NOW IN coldgate.js
 *
 * The whole gate — the sealed envelope, COLD, the session hint, the unlock
 * listeners, submitFreezerCode() and the keypad dialog — moved to coldgate.js
 * unchanged, so the phone's pocket list can open the same lock without loading
 * a byte of the cinema. The contract, the threat model and the honest list of
 * what this protects and what it does not are all in that file's header.
 *
 * The gate is installed ON overlay.js in boot(), through its canOpen /
 * onRefused options. There used to be a capture-phase click interceptor here.
 * It is gone, because it only ever guarded CLICKS: a deep link to
 * `#/tool/<a-manager-tool>` went through overlay's own syncFromLocation() and
 * opened a manager tool with the door still shut and sessionStorage still
 * empty. The gate now sits inside openTool() itself, so every path reaches it —
 * click, keyboard, hash sync on load, and the openTool re-exported on
 * window.CCC.
 * ────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────────
 * 3 · ROOMS — the DOM contract from SPEC.md, built from rooms.js + tools.json
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The cinematic plate.
 *
 * ── WHY `sizes` IS NOT `100vw`, AND WHY THAT IS THE HONEST VALUE ──────────
 * The old comment here claimed an iPad would take the 1400w cut. It never did.
 * Two things were wrong with the reasoning:
 *
 *   1. DPR. Every shipping iPad is DPR 2, so `sizes: 100vw` asks for 2 device
 *      pixels per CSS pixel — 2048px in portrait, 2732px in landscape — and the
 *      2400w plate won every single time. Measured `currentSrc` at DPR 2, not
 *      DPR 1, confirms it: 154KB per plate instead of 68KB, and ~2.2x the raster
 *      area and layer memory, feeding straight into compositor cost.
 *   2. The cover box. theme.css §06 sizes .plate-wrap to
 *      `max(100cqw, 100svh * 1.79)`, so in a PORTRAIT viewport the plate is far
 *      wider than the viewport — 2446 CSS px on a 1024x1366 iPad. `100vw` was
 *      never the real box in the first place; it was under-declared already and
 *      simply saturated at the largest candidate.
 *
 * The mathematically-correct value would ask for ~4900 device pixels on an iPad
 * and there is no such plate.
 *
 * ── CORRECTED 2026-08-26 ──────────────────────────────────────────────────
 * The old value here was `(max-width: 1400px) 65vw, 100vw`, a deliberate
 * under-declaration that traded resolution for raster area. That trade was
 * sound when theme.css sized .plate-wrap to `inset: -5%` — a 110vw box. It is
 * not sound now: §06 sizes the wrap to the plate's COVER box, which on a
 * portrait viewport is `100svh * 1.79104`, i.e. 258vw on an iPad in portrait.
 * Declaring 65vw against a 258vw box asked the browser for a quarter of the
 * pixels the layout actually uses, and it correctly obliged: the 1400w cut,
 * upscaled 3.7x, was being painted into a 5186-device-pixel box. Rendered and
 * compared side by side against the 2400w cut at true device resolution, the
 * difference is not subtle — mushy lamp rims, no brick texture, smeared
 * speculars on the steel. Exactly the kind of soft photograph this client
 * rejects builds over.
 *
 * So `sizes` now describes the real box. Two branches, no calc() or max(),
 * because both have to work inside <link imagesizes> too:
 *
 *   viewport wider than the plate  -> the cover box is 100vw  -> 110vw
 *   viewport taller than the plate -> the cover box is 179.1vh -> 197vh
 *
 * (110 and 197 fold in theme.css's --overscan-k of 1.10.) Where that lands:
 *
 *   820x1180  DPR2 (iPad portrait)  -> 4649px -> 2400w
 *   1180x820  DPR2 (iPad landscape) -> 3230px -> 2400w
 *   1366x1024 DPR2 (iPad Pro land.) -> 4034px -> 2400w
 *   1440x900  DPR1 (store desktop)  -> 1773px -> 1800w
 *   2560x1440 DPR1                  -> 2837px -> 2400w
 *
 * iPad now takes the 2400 cut on both orientations, which is the honest answer:
 * a 16:9 plate cover-cropped into a portrait viewport genuinely needs its full
 * width. Cost is ~180KB per plate over the 1400 cut, on lazy images, on store
 * wifi. Verify any change to this line with `currentSrc` at
 * `deviceScaleFactor: 2`, and keep index.html's imagesizes identical.
 *
 * ── LOADING, WITH THE REAL NUMBERS ───────────────────────────────────────
 * Only the hero is eager. `pass` used to be too, but Chrome's lazy threshold is
 * generous enough that it — and `host`, the THIRD plate — are fetched at first
 * paint anyway at every viewport, so marking them eager only took bandwidth off
 * the hero, which is the LCP element. `lazy` does not stop that fetch; the
 * `fetchpriority: low` below is what keeps it from racing the hero.
 *
 * Measured cold load, not guessed (an earlier version of this comment claimed
 * ~230KB and was wrong by more than 2x, which is how the DPR bug above survived
 * so long — so these are `content-length` sums off a real navigation):
 *
 *   iPad portrait  1024x1366 DPR2   4 plates   370KB   (was 536KB / 3 plates)
 *   iPad landscape 1366x1024 DPR2   4 plates   546KB   (was 536KB / 3 plates)
 *   phone           390x844  DPR2   5 plates   462KB
 *   store desktop  2560x1440 DPR1   3 plates   536KB   (unchanged, correctly)
 *
 * Per plate is the number that moved and the number that matters for the
 * compositor: 68-92KB instead of 154-180KB, and roughly 0.45x the raster area.
 * The count of plates Chrome decides to pull at first paint is a function of the
 * room runway (--room-run, theme.css §02), not of anything this file controls.
 */
/**
 * ── THE PHONE BAND, AND WHY `sizes` HAS A BRANCH FOR IT ──────────────────
 * ADDED 2026-08-28, after a shipped-site crash: "the site keeps crashing on my
 * iPhone ... it works well on iPads and desktops ... when I scroll down the
 * site crashes and it turns into a blue screen". Blue ground with every layer
 * above it gone, then unresponsive, is WebKit killing the tab's web content
 * process under memory pressure. iPhones have a far smaller per-tab budget than
 * iPads, which is exactly why one reproduced it and the other did not.
 *
 * MEASURED, at 390x844 DPR 3 in a real device profile, reading `currentSrc` off
 * every plate and multiplying each RESOURCE's pixels by 4 bytes (a decoded
 * bitmap costs its pixel count regardless of how small the WebP is):
 *
 *   eight lit plates, all at the 2400 cut .......... 98.2 MB
 *   eight dark twins, at the 1800 cut (§06b's cap) .. 55.2 MB
 *   the chef wall's three photographs ............... 2.6 MB
 *                                                    -------
 *   resident at the bottom of the runway ........... 156 MB
 *
 * and it climbs MONOTONICALLY with scroll depth — 105 MB at the hero, 143 MB by
 * the Prep Station, 156 MB in the walk-in — which is precisely the shape of the
 * report. That is before the compositor's own backing stores and before the two
 * live iframes, on a device whose whole budget is around 200 MB.
 *
 * The branch below is why the phone was taking the 2400 cut in the first place,
 * and it was not a bug in `sizes` — it was `sizes` being HONEST. §06 sizes
 * .plate-wrap to the plate's cover box, which in a 390x844 portrait viewport is
 * `100svh * 1.79104` = 1512 CSS px, and §17's --overscan-k lifts it to 1602.
 * `197vh` resolves to 1663 CSS px, x DPR 3 = 4988 device px, and the 2400 cut
 * duly won. The declaration was right; what was wrong was spending the honest
 * answer on a device that cannot afford it — and only ~24% of that 1602px box
 * is ever on screen (390 / 1602), so three quarters of those 98 MB are decoded
 * for pixels the phone crops away.
 *
 * So the phone band under-declares, deliberately, and says so:
 *
 *   440px  x DPR 3 -> 1400 / 440 = 3.18 >= 3  -> the 1400 cut
 *          x DPR 2 -> 3.18 >= 2               -> the 1400 cut
 *          x DPR 1 -> 3.18 >= 1               -> the 1400 cut
 *
 * Every iPhone lands on 1400 in both orientations, at 4.4 MB a plate instead of
 * 12.3, and NOTHING ELSE MATCHES THE BRANCH. The two conditions are the phone
 * and only the phone:
 *
 *   (max-width: 500px)                       every iPhone in portrait (320-440)
 *   (max-width: 1000px) and (max-height: 500px)   every iPhone in landscape
 *                                            (568-956 wide, 320-440 tall)
 *
 * They are deliberately NOT §17's `(max-width: 900px), (max-aspect-ratio: 8/7)`
 * takeover, and not §06b's `(min-width: 901px)` dark-plate cap: both of those
 * catch an iPad — iPad Pro portrait by aspect, iPad mini portrait at 744px by
 * width — and the iPads work today. Nothing here may reach them. Verify any
 * change to this line by reading `currentSrc` at deviceScaleFactor 2 AND 3, on
 * both a 390x844 and an 820x1180 profile, and keep index.html's `imagesizes`
 * and freezer.js's buildDoorImg() identical to it.
 *
 * WHAT IT COSTS, LOOKED AT RATHER THAN ASSUMED. The 1400 cut, the 1200 and the
 * 1000 were rendered side by side at this exact presentation geometry — same
 * 1602px box, same crop, DPR 3, ungraded and unveiled, which is far harsher
 * than the phone ever shows it. At 1200 the subway grout in the Prep Station
 * starts to smear and the ruled lines on the recipe cards go; at 1000 both are
 * gone and the scissor clips are blobs. At 1400 the grout, the card rules and
 * the clips all survive. 1400 is the floor, so 1400 is what the phone takes —
 * and it does not need to go lower: with §06b's dark twins off in the same band
 * this leaves 35 MB of plates where there were 153.
 */
const PLATE_SIZES =
  '(max-width: 500px) 440px, ' +
  '(max-width: 1000px) and (max-height: 500px) 440px, ' +
  '(min-aspect-ratio: 2400/1340) 110vw, 197vh';

/**
 * Every plate URL in the site, written out as literal strings.
 *
 * It used to be `plates/${room}.webp`. It is a table now because
 * build/fingerprint.mjs puts a content hash in every asset filename and
 * rewrites the references mechanically — and a template literal is not a
 * reference it can see. One table, eight rooms, greppable: `grep plates/`
 * finds every plate this file can ask for, which is the point.
 *
 * (`freezer` is the INTERIOR. While the walk-in is locked the freezer room
 * shows `freezer-door` instead — see plateFor().)
 */
const PLATES = {
  hero:         { src: 'plates/hero.197e175d93.webp',         srcset: 'plates/hero@1400.24df9e8171.webp 1400w, plates/hero@1800.e298cedad8.webp 1800w, plates/hero.197e175d93.webp 2400w' },
  pass:         { src: 'plates/pass.96df41e5e3.webp',         srcset: 'plates/pass@1400.19e2f93c88.webp 1400w, plates/pass@1800.67a9fef62f.webp 1800w, plates/pass.96df41e5e3.webp 2400w' },
  host:         { src: 'plates/host.77ad3dcb2d.webp',         srcset: 'plates/host@1400.9f4f7fceb0.webp 1400w, plates/host@1800.c1093ca544.webp 1800w, plates/host.77ad3dcb2d.webp 2400w' },
  dining:       { src: 'plates/dining.e833a21953.webp',       srcset: 'plates/dining@1400.940873ea4c.webp 1400w, plates/dining@1800.f2e000e730.webp 1800w, plates/dining.e833a21953.webp 2400w' },
  prep:         { src: 'plates/prep.e1ff2fd61f.webp',         srcset: 'plates/prep@1400.71a1c3421a.webp 1400w, plates/prep@1800.914c0511c4.webp 1800w, plates/prep.e1ff2fd61f.webp 2400w' },
  office:       { src: 'plates/office.4e4c6d7172.webp',       srcset: 'plates/office@1400.ac0e7111c5.webp 1400w, plates/office@1800.7c45276712.webp 1800w, plates/office.4e4c6d7172.webp 2400w' },
  breakroom:    { src: 'plates/breakroom.57d227f685.webp',    srcset: 'plates/breakroom@1400.ef37dc6807.webp 1400w, plates/breakroom@1800.b68af49648.webp 1800w, plates/breakroom.57d227f685.webp 2400w' },
  freezer:      { src: 'plates/freezer.01697f04b3.webp',      srcset: 'plates/freezer@1400.bc3f759e61.webp 1400w, plates/freezer@1800.950d506378.webp 1800w, plates/freezer.01697f04b3.webp 2400w' },
  'freezer-door': { src: 'plates/freezer-door.833492497b.webp', srcset: 'plates/freezer-door@1400.2c18d7f0b7.webp 1400w, plates/freezer-door@1800.5d976c9501.webp 1800w, plates/freezer-door.833492497b.webp 2400w' }
};

/**
 * Which plate a room shows RIGHT NOW.
 *
 * One room's answer is not constant. The client asked that "when you scroll
 * down, you only see the freezer door and not what's behind it until you type
 * in the password" — so while the walk-in is locked the freezer room's plate IS
 * the closed door, and the interior is never requested. freezer.js paints its
 * animated door assembly over the top of this when the art is available; when
 * it is not (a 404, a thrown module, reduced motion before unlock) the room
 * still shows a shut door rather than the cold storage behind it. That is the
 * whole difference between hiding a thing and not sending it.
 */
function plateFor(room) {
  if (room === 'freezer' && !isFreezerUnlocked()) return PLATES['freezer-door'];
  return PLATES[room] || PLATES.hero;
}

/**
 * Swap the freezer room's plate from the shut door to the interior.
 *
 * Called from playUnlockBeat(), which freezer.js fires as the through-the-
 * doorway move lands — by then the door assembly is scaling past the camera and
 * what it uncovers has to be the room, not the door again. The fetch starts
 * roughly two seconds earlier, at the moment the code is accepted, because the
 * door sequence is 2.76s long and the interior needs to be decoded before the
 * scene dissolves off it.
 */
function revealFreezerInterior() {
  const img = document.querySelector('#room-freezer .plate');
  if (!img) return;
  const p = PLATES.freezer;
  if (img.getAttribute('src') === p.src) return;
  img.setAttribute('srcset', p.srcset);
  img.setAttribute('src', p.src);
}

function buildPlate(room, index) {
  const eager = index === 0;              // the hero, and only the hero
  const art = plateFor(room);
  /* ⚠ srcset AND sizes BEFORE src, AND THAT ORDER IS THE POINT.
     dom.js's el() walks Object.entries(props) — insertion order — so this
     literal IS the order the attributes land on the element. An <img> that is
     given `src` first has already chosen its candidate; adding `srcset`/`sizes`
     afterwards makes it choose again, and a browser that has begun the first
     fetch pays for both. Chromium happens to coalesce the two selections here
     because el() sets every attribute synchronously before the node is
     connected (measured 2026-08-31: one request per plate at 1440x900, 1180x820
     and 393x852, with realistic cache headers) — but that is an implementation
     detail of one engine, not a guarantee, and freezer.js §"the art probe"
     already carries this rule in prose. Written the safe way round in both. */
  return el('img', {
    class: 'plate',
    srcset: art.srcset,
    sizes: PLATE_SIZES,
    src: art.src,
    width: String(PLATE_W),
    height: String(PLATE_H),
    alt: '',                              // decorative: the rail names the room
    decoding: 'async',
    loading: eager ? 'eager' : 'lazy',
    // Chrome's lazy threshold still pulls three or four plates at first paint,
    // so `lazy` alone does not stop them competing with the hero. `low` does:
    // they are fetched when the network is otherwise idle instead of alongside
    // the LCP image, the stylesheet and the fonts.
    fetchpriority: eager ? 'high' : 'low'
  });
}

function buildPlateWrap(room, index) {
  return el('div', { class: 'plate-wrap' }, [
    buildPlate(room, index),
    el('div', { class: 'plate-glow', 'aria-hidden': 'true' }),
    el('div', { class: 'plate-vig', 'aria-hidden': 'true' })
  ]);
}

/** Percent geometry in the form theme.css §09 documents. */
function boxVars(x, y, w, h) {
  return `--x:${x}%;--y:${y}%;--w:${w}%;--h:${h}%`;
}

/** The whole plate box — used by hosts whose own percentages are plate-space. */
const FULL_BLEED = boxVars(0, 0, 100, 100);

/**
 * One hotspot. `kind` decides what it becomes:
 *
 *   'tool'   a real <button data-tool>. overlay.js's delegated click handler
 *            picks it up; the visible .hotspot-label is its accessible name.
 *   'screen' a bare host carrying overlay.js's data-screen-* attributes, which
 *            mountRoomScreens() reads. A quad screen's host must be FULL-BLEED
 *            because mountScreen() resolves quad percentages against the host
 *            box and mountRoomScreens() passes no quadRef.
 *   'chefs'  a full-bleed host for chefwall.js (mounted later, in boot()).
 *   'lock'   the freezer keypad. Styled as a .hotspot but carries no data-tool.
 *   'print'  a sheet of paper drawn onto the wall by assets/wallprint.js. It
 *            returns a .hotspot button like 'tool' does — the printed page is
 *            a decoration INSIDE that button, never a second element over it.
 *            A print spot names its tool with `slug` OR with `object`; the
 *            second form resolves at runtime and builds nothing until its tool
 *            exists, which is how the walk-in's sheet stays sealed.
 */
function buildHotspot(spot, data) {
  if (spot.kind === 'chefs') {
    // Marked so boot() can find it without another selector convention.
    return el('div', { 'data-chefwall-host': '', style: FULL_BLEED });
  }

  if (spot.kind === 'screen') {
    const tool = data.bySlug.get(spot.slug);
    const host = el('div', {
      'data-screen': spot.slug,
      'data-screen-title': spot.label || (tool && tool.label) || '',
      // screens.js reads these three; see the `mode` note at the top of rooms.js.
      'data-screen-mode': spot.mode || null,
      'data-screen-name': spot.name || null,
      'data-screen-width': spot.width || null,
      'data-screen-quad': spot.quad ? JSON.stringify(spot.quad) : null,
      // position:absolute is forced INLINE and is not optional. A relative host
      // offsets from its NORMAL FLOW position, which stacks the second screen in
      // a room below the first — the Big South board rendered 172px under its
      // bezel, hanging in mid-air over the banquettes. Inline wins over both
      // sheets. Absolute is still a positioned ancestor, so mountScreen() is
      // satisfied either way.
      style: (spot.quad
        ? FULL_BLEED
        // Axis-aligned screens are hit-tested through their own host, and
        // .hotspots is pointer-events:none, so the host has to opt back in.
        // (Quad screens must NOT: the full-bleed reference box stays
        // click-through on purpose — only the warped plane is solid.)
        : boxVars(spot.x, spot.y, spot.w, spot.h) + ';pointer-events:auto'
      ) + ';position:absolute'
    });
    return host;
  }

  if (spot.kind === 'lock') {
    return el('button', {
      type: 'button',
      class: 'hotspot',
      'data-freezer-lock': '',
      style: boxVars(spot.x, spot.y, spot.w, spot.h)
    }, [
      el('span', { class: 'dot', 'aria-hidden': 'true' }),
      el('span', { class: 'hotspot-label', text: spot.label || 'Manager access' })
    ]);
  }

  // kind: 'print' — a sheet of paper on the wall. wallprint.js draws it and
  // hands back a normal <button data-tool>, so everything downstream of here
  // (overlay.js's delegated click, the deep link, the ownership gate,
  // theme.css §09's reticle, §17's narrow-band suppression) is unchanged.
  //
  // It gets the whole index rather than one looked-up tool, because a print
  // hotspot may name its tool by `object` instead of by `slug` — the walk-in's
  // note does, since its slug is encrypted and is not in this tree (rooms.js,
  // and wallprint.js §7). Resolving by object needs the tool LIST, it needs to
  // happen inside the module so it can happen again after an unlock, and it is
  // also what gates that sheet: while the fourteen are ciphertext there is no
  // matching tool, so wallprint.js builds no button, no paper and no name at
  // all. playUnlockBeat() calls revealWallPrints() when the door opens.
  if (spot.kind === 'print') return buildWallPrint(spot, data);

  // kind: 'tool'
  const tool = data.bySlug.get(spot.slug);
  return el('button', {
    type: 'button',
    class: 'hotspot',
    'data-tool': spot.slug,
    'data-edge': spot.edge || null,        // theme.css flips the label inboard
    style: boxVars(spot.x, spot.y, spot.w, spot.h)
  }, [
    el('span', { class: 'dot', 'aria-hidden': 'true' }),
    el('span', { class: 'hotspot-label', text: spot.label || (tool && tool.label) || spot.slug })
  ]);
}

/**
 * The rail: kicker, title, rule, and a chip for EVERY tool in the room.
 *
 * ── NO ROOM DESCRIPTION, ANYWHERE ON THE ART (2026-08-28) ──────────────────
 * The client, on the whole site: "I love the Title of each page to be on the
 * screen … however, I don't like the descriptions on the page … for instance,
 * on the pass, I love the title and the clickable boxes with the links in them,
 * but I don't like the 'Quotes fired and plated — the tools you touch on every
 * sale'. I want those types of descriptions to be removed on every page." His
 * reason is compositional — "I think that would make the slides fit better" —
 * and it is a real one: the tagline was the only row in this stack whose height
 * came from the length of a sentence, and it pushed everything above it further
 * up the frame into whatever the photograph put there. The Break Room is the
 * proof (§08a): its title ran into the head chef frames.
 *
 * `meta.tagline` IS STILL IN THE DATA, deliberately not deleted:
 *   · `blurb` on each TOOL is a different string with a different job — the
 *     viewer prints it — and has to survive untouched. Hand-deleting one of
 *     the two description fields out of tools.json is how you lose the other,
 *     and tools.json is not one file: index.html inlines a copy that app.js
 *     PREFERS over the fetch (see build/sync-inline-tools.mjs), so a data
 *     deletion is a two-file edit plus a build step, for no visible gain;
 *   · nothing renders it any more, so keeping it costs exactly nothing on
 *     screen. THE ONLY OTHER READER IS buildFooter() IN §6, and that function
 *     is not called — the client had the footer recap removed earlier ("I want
 *     the freezer to be the last thing someone could see"). The C³ menu, which
 *     IS the tool index now, never carried a description and still does not;
 *   · if he asks for them back it is one line here.
 * So this builds FOUR children, not five, and theme.css §08 / §08a / §17 are
 * re-balanced around four rows.
 *
 * The chip list is the client's hard requirement ("links must be easy to find"):
 * a tool with no hotspot — every one of the freezer's manager tools, the head
 * chef wall — is still one tap away here, and below 900px theme.css turns this
 * same list into the full-width drawer because hotspots are suppressed there.
 *
 * ── THE ONE EXCEPTION: THE WALK-IN WHILE IT IS SHUT ────────────────────────
 * The freezer's brief is "I want to actually see a freezer door that is CLOSED …
 * when someone types in the password it will OPEN the freezer door to this
 * screen. I want to have all of the manager tools HERE ON THIS SCREEN." The
 * tools arrive AFTER the door. Fourteen padlocked chips rendered up front
 * stacked seven rows deep across the left half of the leaf — spoiling the
 * reveal and burying the most cinematic frame on the site under its own table
 * of contents.
 *
 * So while the gate is shut the rail carries ONE row, not fourteen: the same
 * locked affordance the C³ menu and the footer index have always shown. This is
 * not a new gating rule, it is the existing one applied consistently —
 * renderList() in §5 and renderGroups() in §6 both already collapse the freezer
 * to a single `[data-freezer-lock]` control off this same predicate and both
 * re-render the full list through onFreezerUnlock(). The rail is the third
 * surface and it now behaves like the other two; playUnlockBeat() is its
 * re-render, and it is also the reveal.
 *
 * NOTHING BECOMES UNREACHABLE BY DOING THIS, and that is load-bearing:
 *   · the door is not the only route in — this chip, the C³ menu's locked row
 *     and the footer's button all open the same keypad, from any scroll
 *     position, with the keyboard, and without ever seeing the door;
 *   · the gate itself is untouched. overlay.js still evaluates canOpen/onRefused
 *     inside openTool(), so a `#/tool/<slug>` deep link into a freezer tool on a
 *     cold load still refuses and still routes through the keypad;
 *   · the instant the predicate flips, all fourteen are listed here, in the C³
 *     menu and in the footer — and the footer's are plain `<a href>`s, which is
 *     the no-JS, no-cinema path.
 */
function buildRail(roomId, index, data) {
  const meta = data.roomById.get(roomId) || { label: roomId, tagline: '' };
  const tools = (data.byRoom.get(roomId) || []).filter(showsChip);
  const titleId = `room-${roomId}-title`;
  // The freezer is the only gated room, and its chips have to LOOK gated.
  const gated = roomId === 'freezer' && !isFreezerUnlocked();

  const chips = el('nav', {
    class: 'rail-chips',
    // Room labels carry their own article ("The Pass"), so there is no "the"
    // here — with one it read "Tools in the The Pass".
    'aria-label': gated ? `${meta.label} — locked` : `Tools in ${meta.label}`,
    // The hook playUnlockBeat() re-renders against. It is on the LIST, not on
    // the chips: what is gated here is the list's existence, not each row.
    'data-locked': gated ? '' : null,
    'data-room-chips': roomId
  }, gated ? [buildLockChip(sealedCount())] : tools.map((tool, i) => buildChip(tool, false, i)));

  return el('div', { class: 'rail' }, [
    // The ticket rail numbers the seven rooms 01..07; `index` counts the hero as
    // 0, so the kicker has to step back one or the menu and the room contradict
    // each other by a whole course while both are on screen.
    el('p', { class: 'rail-kicker', text: `Course ${COURSE[index - 1] || index}` }),
    el('h2', { class: 'rail-title', id: titleId, text: meta.label }),
    // The rule closes the title block. It used to divide title from tagline;
    // with the tagline gone it is the only thing between a display-scale name
    // and a row of chips, which is why §08 now gives it more air below than
    // above rather than the one flat `gap` the five-row stack used.
    el('hr', { class: 'rail-rule' }),
    chips
  ]);
}

/**
 * DOES THIS TOOL GET A RAIL CHIP?
 *
 * `object` has always been the field that says how a tool meets the room. Most
 * values name a thing in the photograph ('binder-1', 'printer', 'clipboard-2')
 * and rooms.js hangs a hotspot on it. Two values are SENTINELS instead — they
 * name no object, they answer the question "which of the two affordances does
 * this tool get?":
 *
 *   'chip-only'   a chip in the rail, no hotspot on the plate. Shipped since
 *                 v3 for the tools whose objects are not in the shot
 *                 (`discount-close`, `rep-hourly-rate`).
 *   'no-chip'     THE CONVERSE, and new here: no chip in the rail, and no
 *                 hotspot either. The tool is still in data/tools.f0f6c533e3.json and so
 *                 is still in the C³ menu, the footer index, the phone list's
 *                 search, the <noscript> floor and `#/tool/<slug>` — it is only
 *                 absent from the RAIL.
 *
 * WHY THE BREAK ROOM NEEDED IT. The room now holds four training tools, the
 * discount close and THREE GAMES, and a seventh and eighth game are expected
 * ("I think I want to add a couple more games on the site over the next couple
 * of weeks"). Eight chips is two full rows at 1180x820 and it buries the
 * training binders — the room's actual job — under a list of arcade cabinets.
 * So the three games are marked 'no-chip' and the rail carries ONE chip for the
 * arcade, which is also the thing the client asked to be unmissable. Nothing
 * becomes unreachable: `#/tool/deep-six` still opens, "deep six" still finds it
 * on a phone, and the C³ menu still lists all three under Break Room.
 *
 * The test is on the tool, not on a slug list, so the next game Jeff adds is
 * one `"object": "no-chip"` in data/tools.f0f6c533e3.json and no code change at all.
 */
function showsChip(tool) {
  return !tool || tool.object !== 'no-chip';
}

/* A small padlock, sized by attribute so it needs no stylesheet of its own.
   It sits alongside the chip's brass tick rather than replacing it: the tick is
   a ::before and only theme.css can swap that (see the report). */
const PADLOCK_SVG =
  '<svg width="10" height="12" viewBox="0 0 11 13" fill="currentColor" ' +
  'aria-hidden="true" focusable="false" style="flex:none"><rect x="0" y="5" ' +
  'width="11" height="8" rx="1.5"/><path d="M2.5 6V3.5a3 3 0 0 1 6 0V6" ' +
  'fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

/**
 * One rail chip. `staged` starts it at opacity 0 with a per-chip delay, which is
 * the only thing `i` is for: it is what turns the freezer's reveal into a ripple
 * rather than a flash. Every other room passes false and gets a plain chip.
 */
function buildChip(tool, staged, i) {
  const chip = el('button', {
    type: 'button',
    class: 'chip',
    'data-tool': tool.slug,
    // Reveal state, only ever set by playUnlockBeat() as it inserts the chip.
    style: staged
      ? `opacity:0;transition:opacity 420ms var(--ease-out) ${i * 30}ms`
      : null
  });
  chip.append(tool.label);
  /* THE MARQUEE. A tool carrying `marquee` in data/tools.f0f6c533e3.json gets the bulb
     treatment in theme.css §08b and a live count appended to its label. Exactly
     one tool has it today (`arcade`), and this function still does not know
     that — the slug is nowhere in this file. See armArcadeChips(). */
  if (tool.marquee) {
    chip.dataset.marquee = '';
    // the plain label, kept so armArcadeChips() can rebuild the accessible name
    // without re-reading a text node it does not own.
    chip.dataset.label = tool.label;
    chip.append(el('span', { class: 'chip-count', 'data-marquee-count': tool.marquee }));
  }
  return chip;
}

/**
 * THE COUNT ON THE ARCADE CHIP, AND WHY IT IS FETCHED RATHER THAN TYPED.
 *
 * The client: "I want it to be abundantly clear that there are games there …
 * The reps won't notice it if we don't just point it out." The chip is the one
 * arcade affordance that is on screen at EVERY size (the cabinet hotspot is
 * 0% visible at 1180x820 — see the measurement table in rooms.js), so the chip
 * has to say what is behind it, and "C³ ARCADE" alone does not say "games".
 * "C³ ARCADE · 3 GAMES" does.
 *
 * THE NUMBER IS NOT WRITTEN DOWN ANYWHERE. He has already said he is adding
 * games "over the next couple of weeks", and a 3 hand-typed into tools.json, or
 * into this file, or into the stylesheet's content property, is wrong the first
 * Tuesday he adds one — and wrong in the worst way, because a stale count reads
 * as authoritative. So it is counted from arcade/manifest.json, which is the
 * file he edits, at runtime.
 *
 * WHAT IT COSTS, measured: one 1.9 KB JSON over a connection the page has
 * already opened, issued AFTER the rails are in the DOM, never awaited by
 * anything, and fetched ONCE for however many chips carry the flag (the Map
 * below dedupes by URL; there is one URL and one chip today).
 *
 * FAIL-SOFT IS THE WHOLE DESIGN. No network, a 404, malformed JSON, a manifest
 * with no games[] — every one of them leaves the chip reading "C³ ARCADE",
 * which is the label tools.json already gave it and is a perfectly good chip.
 * Nothing is ever removed and no error is shown: a rep does not need to know
 * that a count failed to load, and a chip that says "0 GAMES" would be a lie.
 * `cache: 'no-cache'` (not no-store) so it revalidates rather than serving a
 * ten-minute-old copy, while sw.js's networkFirst can still answer it on a
 * store connection that has dropped — sw.js bails out of any request marked
 * no-store, which would make the offline case worse, not better.
 */
function armArcadeChips() {
  const spans = document.querySelectorAll('[data-marquee-count]');
  if (!spans.length) return;
  const byUrl = new Map();
  for (const span of spans) {
    const url = span.getAttribute('data-marquee-count');
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(span);
  }
  for (const [url, targets] of byUrl) {
    fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        // The manifest's own shape, tolerating a bare array the way the Print
        // Outs station tolerates one.
        const n = Array.isArray(d) ? d.length
                : (d && Array.isArray(d.games)) ? d.games.length : 0;
        if (!n) return;                                   // 0 is not a count worth printing
        const words = n === 1 ? '1 game' : `${n} games`;
        for (const span of targets) {
          // The separator is its own aria-hidden element so a screen reader is
          // not read a middle dot; theme.css §08b supplies the glyph.
          span.replaceChildren(
            el('span', { class: 'chip-sep', 'aria-hidden': 'true' }),
            document.createTextNode(words)
          );
          /* AND THE ACCESSIBLE NAME IS SET EXPLICITLY, not left to the text.
             Concatenating the chip's children gives "C³ Arcade3 games" — the
             only thing between the two is the aria-hidden separator and a flex
             gap, neither of which contributes a space to the name computation.
             One aria-label, written from the same two values that are on
             screen, so what is announced and what is printed cannot drift. */
          const chip = span.closest('.chip');
          if (chip) chip.setAttribute('aria-label', `${chip.dataset.label || 'Arcade'} — ${words}`);
        }
      })
      .catch((err) => {
        console.warn('[arcade] chip count unavailable; the chip keeps its plain label.', err);
      });
  }
}

/**
 * The freezer's locked row: the one control the rail shows while the door is
 * shut. Same wording, same `[data-freezer-lock]` hook and same delegated
 * handler as the C³ menu's locked row and the footer's button, so all three
 * lead to the same keypad.
 *
 * It announces itself BEFORE it is pressed — a chip identical to every other
 * chip that then produces an unexpected modal is a worse affordance than a
 * visibly locked one. So it carries the padlock, says how many tools are behind
 * it, and takes `aria-haspopup="dialog"` so assistive tech warns that a dialog
 * is coming rather than a page.
 */
function buildLockChip(count) {
  const chip = el('button', {
    type: 'button',
    class: 'chip',
    'data-freezer-lock': '',
    'data-locked': '',
    'aria-haspopup': 'dialog',
    'aria-label': `Enter freezer code — ${count} manager tools are locked`
  });
  chip.insertAdjacentHTML('afterbegin', PADLOCK_SVG);
  chip.append('Enter freezer code');
  return chip;
}

/**
 * The reward beat when the door opens — the rail's half of the reveal.
 *
 * "When someone types in the password, it will open the freezer door TO THIS
 * SCREEN. I want to have all of the manager tools HERE ON THIS SCREEN." So this
 * is the moment the fourteen actually arrive: the locked row is swapped for the
 * real list, which is then brought up to full strength in a short left-to-right
 * ripple — the room visibly filling, using nothing but opacity.
 *
 * WHY THE INSERT AND THE RIPPLE ARE THE SAME FUNCTION. A re-render on its own
 * blinks: the elements are new, so there is nothing for a transition to run
 * from. The chips are therefore inserted already carrying `opacity: 0` and
 * their staggered `transition`, and raised on the next frame, which is the same
 * beat the previous version got by mutating chips that were already on screen.
 * There is exactly one of these; freezer.js takes it as `onRevealed` and fires
 * it at the end of the door animation (or immediately when there is no door),
 * and it is idempotent, so a second unlock event is a no-op.
 *
 * Under reduced motion the list is simply there — no fade, no stagger — which
 * matches the door, which under that query is simply open.
 *
 * The keypad hotspot goes at the same time. It was the freezer's only hotspot
 * and, once unlocked, `if (isFreezerUnlocked()) return;` left it a dead object
 * sitting in the photograph. There is no honest thing to repoint it at — the
 * other fourteen tools have no measured geometry in rooms.js, and inventing a
 * box would hang a label on the wrong object — so the room hands over to its
 * rail, which is how the freezer was specified in the first place.
 */
function playUnlockBeat() {
  // The room under the door. freezer.js's THROUGH beat is dissolving its own
  // assembly right now and what it uncovers has to be cold storage, not the
  // shut door the locked page was showing. The bytes were requested when the
  // code was accepted, ~2s ago, so this is a swap and not a fetch.
  revealFreezerInterior();
  // The note on the walk-in's back wall. It was not built at boot — its tool
  // was ciphertext then — so this is where it arrives, with the chips and the
  // room behind the door. See wallprint.js §7.
  revealWallPrints();

  const rail = document.querySelector('[data-room-chips="freezer"]');
  if (rail && rail.hasAttribute('data-locked')) {
    const meta = FREEZER_RAIL_META;
    const tools = (meta && meta.tools) || [];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    fill(rail, tools.map((tool, i) => buildChip(tool, !reduce, i)));
    rail.removeAttribute('data-locked');
    rail.setAttribute('aria-label', `Tools in ${(meta && meta.label) || 'Walk-In Freezer'}`);

    if (!reduce) {
      // ONE DELIBERATE REFLOW, and it must be a reflow rather than a pair of
      // rAFs. A freshly inserted element has no previous computed style, so a
      // transition only runs if the browser resolves style once at opacity 0
      // before it is raised. rAF would do that too — but rAF does not fire in a
      // background tab, and this beat can be triggered from the footer index
      // with the room off screen, which would leave fourteen tools inserted at
      // opacity 0 and never raised. Reading a layout property forces the flush
      // synchronously and cannot be starved. This is not the hot path: it
      // happens once, on unlock, outside the engine's frame.
      void rail.offsetWidth;
      for (const chip of rail.children) chip.style.opacity = '1';
    }
  }

  const keypad = document.querySelector('#room-freezer .hotspot[data-freezer-lock]');
  if (keypad) keypad.remove();

  announce('Cold storage open. Manager tools are unlocked.');
}

/** What playUnlockBeat() needs to render the fourteen; set in boot(), and again
 *  by ADOPT_COLD() the moment a code decrypts them. */
let FREEZER_RAIL_META = null;

/**
 * A hash naming a tool this build has never heard of, while the walk-in is shut.
 *
 * See the note at the call site in boot(). Three things matter here:
 *
 *   1. It runs on `hashchange` as well as at boot, so a manager pasting a
 *      bookmark into an already-open tab gets the keypad too.
 *   2. It strips the hash before opening the keypad, exactly as overlay.js's
 *      refuseTool() does, so a refused deep link does not sit in the address
 *      bar claiming a tool is open and does not re-fire on reload.
 *   3. It is silent about whether the slug exists. An unrecognised slug and one
 *      of the sealed fourteen produce the same keypad; only a correct code
 *      tells them apart, and by then it does not matter.
 */
function watchSealedDeepLink(data, freezer) {
  const slugOf = () => {
    const m = /^#\/tool\/([^/?#]+)/.exec(location.hash || '');
    try { return m ? decodeURIComponent(m[1]) : null; } catch { return m ? m[1] : null; }
  };

  const check = () => {
    const slug = slugOf();
    if (!slug) return;
    if (isFreezerUnlocked()) return;      // overlay.js owns every slug now
    if (data.bySlug.has(slug)) return;    // a public tool: overlay.js has it

    try { history.replaceState(null, '', location.pathname + location.search); }
    catch { /* noop */ }

    openKeypad().then((ok) => {
      if (!ok) return;
      const tool = data.bySlug.get(slug);
      if (!tool) return;                  // never was one of ours; say nothing
      freezer.whenOpen().then(() => openTool(slug));
    });
  };

  window.addEventListener('hashchange', check);
  check();
}

/** One polite live region for the whole page, created on first use. */
let liveRegion = null;
function announce(message) {
  if (!liveRegion) {
    liveRegion = el('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
    document.body.append(liveRegion);
  }
  // Clearing first guarantees a re-announcement if the same text repeats.
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = message; }, 60);
}

/** One `.room` — the exact structure in SPEC.md's DOM contract. */
function buildRoom(roomId, index, data) {
  const art = ROOM_ART[roomId] || {};
  const spots = HOTSPOTS[roomId] || [];

  const hotspots = el('div', { class: 'hotspots' },
    spots.map((spot) => buildHotspot(spot, data)));

  return el('section', {
    class: 'room',
    id: `room-${roomId}`,
    'data-room': roomId,
    'aria-labelledby': `room-${roomId}-title`,
    style: roomVars(art)
  }, [
    el('div', { class: 'stage' }, [
      buildPlateWrap(roomId, index),
      hotspots,
      buildRail(roomId, index, data)
    ])
  ]);
}

/**
 * The hero.
 *
 * It carries BOTH `hero` and `room`. `hero` gets it theme.css §07's masthead
 * layout; `room` is what makes engine.js pick it up in collectRooms(), so the
 * storefront genuinely comes alive as you arrive — --enter lifts the stage out
 * of black, --bloom brings the Edison lights up, --plate-scale starts the dolly
 * before you have read the name. Jeff's brief, expressed entirely in the two
 * numbers the engine already publishes; not one line of extra animation code.
 *
 * The engine's own maths guarantees --enter === 1 for the first room at scrollY
 * 0, so this is a short fade up from black, never a blank first paint.
 *
 * No C³ logo here, by instruction. The restaurant is Cook County Cooks; the one
 * permitted C³ mark on the whole site is the fixed button in §5.
 */
function buildHero() {
  const art = ROOM_ART.hero;
  return el('section', {
    class: 'hero room',
    id: 'room-hero',
    'data-room': 'hero',
    'aria-labelledby': 'hero-title',
    style: roomVars(art)
  }, [
    el('div', { class: 'stage' }, [
      buildPlateWrap('hero', 0),
      el('div', { class: 'hero-inner' }, [
        // Three spans: theme.css §07 sets each on its own line, the second in
        // brass italic, the third heavier and further inset. A masthead.
        el('h1', { class: 'hero-title', id: 'hero-title' }, [
          el('span', { text: 'Cook' }),
          el('span', { text: 'County' }),
          el('span', { text: 'Cooks' })
        ])
        // THE MASTHEAD IS THE WHOLE HERO NOW. The client named both ends of
        // what used to sit under it: "the main page has 'Every tool' all the
        // way to 'walk the line'. I want to remove the descriptions." So the
        // lede (`Every tool in the building — plated, lit, and one tap away.`)
        // and the `Walk the line` scroll cue are both gone, and §07's
        // .hero-lede / .scroll-cue rules with them.
        //
        // NOTHING BECOMES UNREACHABLE. The cue was an <a href="#room-pass">,
        // i.e. one way into the first room — but #ticket-rail is fixed, is
        // built before the hero paints, and carries all seven rooms as real
        // anchors at every scroll position (§4). The page also still scrolls.
        // The one thing the cue did that survives nowhere else is SAY that the
        // page scrolls; the ticket rail showing "01 PASS … 07 FREEZER" over the
        // storefront says it better, and it is on screen already.
        //
        // The og:description meta in index.html keeps that sentence: it is the
        // link preview, not the page, and he was talking about the page.
      ])
    ])
  ]);
}

/** Build the whole restaurant into #kitchen. */
function buildKitchen(data) {
  const kitchen = $('#kitchen');
  const sections = [buildHero()];
  ROOM_ORDER.forEach((roomId, i) => sections.push(buildRoom(roomId, i + 1, data)));
  fill(kitchen, sections);
  return kitchen;
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 4 · #ticket-rail — the always-visible room menu
 *
 * Fixed by theme.css §11, so it is reachable at any scroll position and nobody
 * is ever forced to scroll through rooms to get somewhere. The tickets are real
 * anchors (#room-pass), so they work with JS disabled and can be opened in a new
 * tab; when JS is alive we preventDefault and hand the jump to the engine, whose
 * tween is the thing that keeps the cinema in sync with the scroll position.
 * ────────────────────────────────────────────────────────────────────────── */

/** Where the phone's two-row course menu breaks its lines.
 *
 *  ⚠ THIS IS A MARKUP CONSTANT WITH A LAYOUT CONTRACT. theme.css §17 turns the
 *  strip into two flex rows below 560px and reserves the C³ button's column on
 *  the FIRST row only, so the split has to be "the wide row first". Four /
 *  three is what the seven room names measure to: at 375px CSS — the narrowest
 *  phone this site is built for — the first row's four tickets need 237px of a
 *  275px allowance and the second row's three need 262px of 351px. Five in the
 *  first row overflows the C³ reserve at every phone width. If a room is ever
 *  added or a `short` label lengthened, re-measure before touching this.
 *
 *  Above 560px both rows are `display: contents` and this constant has no
 *  visible effect at all — the seven tickets sit in one flex strip exactly as
 *  they always have. */
const TICKET_ROW_BREAK = 4;

function buildTicketRail(data) {
  const header = $('#ticket-rail');

  const ticketEls = ROOM_ORDER.map((roomId, i) => {
    const meta = data.roomById.get(roomId) || { short: roomId, label: roomId };
    return el('a', {
      class: 'ticket',
      href: `#room-${roomId}`,
      'data-goto': roomId,
      'aria-label': meta.label
    }, [
      el('span', { class: 'ticket-no', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') }),
      el('span', { class: 'ticket-name', text: meta.short || meta.label })
    ]);
  });

  /* Two presentational groups, NOT two navs: they are `display: contents` at
     every width except the phone band, so assistive tech and the wide layout
     both see one flat list of seven links either way. A wrapper is what lets
     the phone reserve the C³ button's space on one line instead of on both —
     the defect the client photographed was the last ticket sheared under that
     button. */
  const rows = [
    el('div', { class: 'ticket-row' }, ticketEls.slice(0, TICKET_ROW_BREAK)),
    el('div', { class: 'ticket-row' }, ticketEls.slice(TICKET_ROW_BREAK))
  ].filter(r => r.childElementCount > 0);

  const tickets = el('nav', { class: 'tickets', 'aria-label': 'Rooms' }, rows);

  fill(header, [
    el('a', { class: 'brand', href: '#room-hero', text: 'Cook County Cooks' }),
    tickets
  ]);

  // One delegated listener for the whole menu.
  header.addEventListener('click', (ev) => {
    // Let modified clicks behave like normal links (new tab, etc.).
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const link = ev.target.closest('[data-goto], .brand');
    if (!link) return;
    ev.preventDefault();
    const target = link.dataset.goto || 'hero';
    // offset 0 is correct here and is NOT an oversight: a room's runway starts
    // exactly where its sticky .stage pins to the top of the viewport, and the
    // rail inside that stage is already padded by var(--topbar-h) in theme.css
    // §08. Stopping short would push the title down, not clear the bar.
    scrollToRoom(target, { offset: 0 });
  });

  // Highlight follows the engine's own notion of the most-visible room, so the
  // menu is correct however the user got there — tween, flick, or Find-in-page.
  onRoomChange(({ name }) => {
    // `ticketEls`, not `tickets.children`: the tickets are inside two
    // presentational row groups now (see TICKET_ROW_BREAK).
    for (const t of ticketEls) {
      if (t.dataset.goto === name) t.setAttribute('aria-current', 'true');
      else t.removeAttribute('aria-current');
    }
    /* NOTHING SCROLLS THE STRIP. It is tempting to keep the current ticket in
       view by writing the scroller's scrollLeft when the room changes, and it
       was written and then taken out again, because it MOVES A SHEAR rather
       than removing one. Measured at 1180x820 — iPad landscape, coarse pointer,
       where the seven tickets are 771px of content in a 737px box — walking
       into the Walk-In scrolled the strip 34px so "07 FREEZER" came whole into
       view and "01 PASS" went 34px under the left mask instead. One cut item
       for another, plus a bar that moves under the reader while they are
       reading it, which is half of what the client photographed on his phone.

       On a phone this would be dead code anyway: theme.css §17 puts all seven
       tickets on two rows below 560px, so there is no overflow to scroll and
       the current room is visible because every room is. The 1180x820 shear
       was real and was left for a later pass because every candidate fix
       repainted a signed-off iPad layout; that constraint was lifted on
       2026-09-02 and it is FIXED IN theme.css ("THE COURSE MENU ON AN iPAD IN
       LANDSCAPE"): a C³ reserve sized to the button, --sp-3 tickets, and the
       wordmark off the bar below 1120px. Measured after: 700px of tickets in
       a 790px box at 1180x820, 694 in 855 at 1024x768 — nothing overflows on
       any iPad in landscape, so there is still nothing here to scroll. */
  });

  return header;
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 5 · BLUE FOX C³ — the fixed button and the repo quick menu
 *
 * The single approved exception to "no C³ logo inside the restaurant". It is
 * position:fixed (theme.css §12) and #ticket-rail reserves padding for it, so it
 * works at any scroll position, in any room, including inside the freezer.
 *
 * theme.css offers four open-state hooks; we use two of them together —
 * `.is-open` on the panel and aria-expanded on the button — because the button
 * and panel are siblings and the `[aria-expanded="true"] ~ #c3-menu` selector
 * then works as a free belt-and-braces even if a class write ever fails.
 * ────────────────────────────────────────────────────────────────────────── */

/** A blue fox, drawn small enough to read at 18px. Signage motif only. */
const FOX_SVG =
  '<svg class="c3-fox" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M3 3l3.6 3.2h10.8L21 3l-1 7.6a8 8 0 0 1-8 8 8 8 0 0 1-8-8z"/>' +
  '<path d="M9 11.2h.01M15 11.2h.01"/><path d="M12 14.2l-1.4 1.2h2.8z"/></svg>';

function buildC3Menu(data) {
  const button = el('button', {
    type: 'button', id: 'c3-button', 'aria-expanded': 'false',
    'aria-controls': 'c3-menu', 'aria-label': 'Blue Fox C³ — every tool'
  });
  button.innerHTML = FOX_SVG + '<span class="c3-mark">C³</span>';

  const list = el('div', { class: 'c3-list' });
  const menu = el('div', {
    id: 'c3-menu', role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': 'c3-menu-title',
    // focusable-but-not-tabbable, so the trap has somewhere to put focus if the
    // list is ever empty — same shape as chefwall.js's .cw-dialog
    tabindex: '-1'
  }, [
    el('div', { id: 'c3-menu-head' }, [
      el('h2', { class: 't-sub', id: 'c3-menu-title', text: 'Every tool' }),
      el('span', { class: 'kicker', 'data-c3-count': '', text: `${totalToolCount(data)} tools` })
    ]),
    el('hr', { class: 'rule' }),
    list
  ]);


  function renderList() {
    const unlocked = isFreezerUnlocked();
    const children = [];

    for (const roomId of ROOM_ORDER) {
      const meta = data.roomById.get(roomId) || { label: roomId };
      const tools = data.byRoom.get(roomId) || [];
      // The freezer's array is EMPTY while locked — the fourteen are ciphertext
      // until a code decrypts them — so it cannot be skipped for being empty or
      // the locked row disappears along with them.
      if (!tools.length && !(roomId === 'freezer' && !unlocked)) continue;

      children.push(el('p', { class: 'kicker', text: meta.label }));

      if (roomId === 'freezer' && !unlocked) {
        // Gated: one row that opens the keypad instead of 14 rows of URLs.
        children.push(el('button', {
          type: 'button', class: 'c3-item', 'data-freezer-lock': '',
          text: `Locked — ${sealedCount()} manager tools`
        }));
        continue;
      }

      for (const tool of tools) {
        children.push(el('a', {
          class: 'c3-item',
          href: tool.url,
          'data-tool': tool.slug,      // overlay.js frames it; href keeps it real
          target: tool.external_only || isExternal(tool.url) ? '_blank' : null,
          rel: tool.external_only || isExternal(tool.url) ? 'noopener noreferrer' : null,
          text: tool.label
        }));
      }
    }
    fill(list, children);
  }
  renderList();
  onFreezerUnlock(renderList);

  /* ── open / close ─────────────────────────────────────────────────────────
     THE PANEL IS A MODAL DIALOG, AND NOW BEHAVES LIKE ONE.

     THE DEFECT, MEASURED. It said `role="dialog"`, moved focus in, restored it
     on Escape — and then set no trap and left #kitchen live. Opening it and
     pressing Tab forty times, focus left the panel on 16 of the 40 presses and
     landed on the skip link, the brand, the seven ticket links and then straight
     into the rooms behind the glass. This list is the one flat, reliable index
     of all 37 tools — the fallback for exactly the visitor who cannot work the
     hotspots — so falling out of it is the worst place on the page to fall out
     of.

     WHICH OF THE TWO HONEST ANSWERS THIS IS. A dialog that is not modal has to
     drop role="dialog" and close on focus-out; a dialog that is modal has to
     trap and inert. Modal is the right one here: the panel is up to 78svh of
     backdrop-blurred glass, everything behind it is a duplicate of something
     inside it, and Escape-closes-and-restores was already the behaviour. So the
     ARIA now matches: aria-modal="true", the background inert, Tab cycling.
     chefwall.js's chef modal is the model — same FOCUSABLE list, same
     skip-already-inert bookkeeping, same restore. Measured after: 0 of 40.

     #c3-button IS DELIBERATELY LEFT OUT OF THE INERT SET. It is this dialog's
     only close affordance — there is no ✕ in the panel — and an inert button
     ignores pointer events, so inerting it would leave a touch user who cannot
     press Escape with nothing to tap but the background. It is outside the tab
     cycle and aria-modal already hides it from assistive tech; what it keeps is
     the tap that closes the thing. Click-away still works too: Chromium
     re-targets a click on inert content to the nearest non-inert ancestor, so
     the document listener below still sees it (verified — closing by clicking
     the plate behind the panel works with the background inert).             */

  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const supportsInert = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
  let inerted = [];
  let lastFocus = null;
  let open = false;

  /** Everything but this panel and its own button. Anything already inert (the
   *  tool viewer, a chef modal) is left alone and NOT un-inerted on close. */
  function setOutsideInert(on) {
    if (!supportsInert) return;
    if (on) {
      inerted = [];
      for (const child of Array.from(document.body.children)) {
        if (child === menu || child === button || child.inert) continue;
        child.inert = true;
        inerted.push(child);
      }
    } else {
      inerted.forEach((n) => { n.inert = false; });
      inerted = [];
    }
  }

  const focusables = () => Array.from(menu.querySelectorAll(FOCUSABLE))
    .filter((n) => n.offsetParent !== null || n === document.activeElement);

  const setOpen = (next) => {
    if (next === open) return;
    open = next;
    button.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);

    if (open) {
      lastFocus = document.activeElement;
      setOutsideInert(true);
      const first = menu.querySelector('.c3-item');
      (first || menu).focus();
      return;
    }

    setOutsideInert(false);
    // Only take focus back if the panel still has it. A click on a tool row has
    // already handed the page to overlay.js by the time this runs, and yanking
    // focus out from under the viewer would undo its own focus management.
    if (lastFocus && lastFocus.isConnected && !menu.contains(document.activeElement)) lastFocus = null;
    if (lastFocus && lastFocus.isConnected) {
      try { lastFocus.focus({ preventScroll: true }); } catch (_) { lastFocus.focus(); }
    } else if (menu.contains(document.activeElement)) {
      button.focus();
    }
    lastFocus = null;
  };

  button.addEventListener('click', () => setOpen(!open));

  // Click-away and Escape. Both are scoped so they cost nothing when closed.
  document.addEventListener('click', (ev) => {
    if (!open) return;
    if (menu.contains(ev.target) || button.contains(ev.target)) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (ev) => {
    if (!open) return;

    if (ev.key === 'Escape') {
      ev.preventDefault();
      setOpen(false);
      button.focus();
      return;
    }

    if (ev.key !== 'Tab') return;

    // THE TRAP. Belt and braces on top of the inert background: inert is not in
    // every engine this site meets (older iPad Safari), and it is the trap, not
    // inert, that makes the cycle wrap from the last of 37 rows back to the
    // first instead of leaving through the top of the document.
    const items = focusables();
    if (!items.length) { ev.preventDefault(); menu.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey) {
      if (active === first || active === menu || !menu.contains(active)) {
        ev.preventDefault(); last.focus();
      }
    } else if (active === last || !menu.contains(active)) {
      ev.preventDefault(); first.focus();
    }
  });
  // Choosing a tool closes the menu; the overlay takes over from here.
  menu.addEventListener('click', (ev) => {
    if (ev.target.closest('.c3-item')) setOpen(false);
  });

  // Siblings, button first — that is what makes theme.css's
  // `#c3-button[aria-expanded="true"] ~ #c3-menu` fallback selector match.
  document.body.append(button, menu);
  return { button, menu };
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 6 · THE FOOTER — the plain index
 *
 * This is the "just give me the link" path: no hotspots, no cinema, no viewer.
 * Every entry is a real <a href> WITHOUT data-tool, so overlay.js does not
 * intercept it — middle-click, right-click "copy link", a screen reader's link
 * list and a printed page all behave exactly as a user expects. index.html also
 * carries a <noscript> copy of this index for the genuinely-no-JS case.
 *
 * theme.css §14 owns the look. It styles this structurally — `#site-footer > h2`,
 * `section > ul`, and so on — so the only class this function contributes is
 * `.footer-index` on the column grid. No inline layout.
 * ────────────────────────────────────────────────────────────────────────── */

function buildFooter(data) {
  const footer = $('#site-footer');
  footer.setAttribute('aria-labelledby', 'footer-title');

  const grid = el('div', { class: 'footer-index' });

  function renderGroups() {
    const unlocked = isFreezerUnlocked();
    const groups = [];

    for (const roomId of ROOM_ORDER) {
      const meta = data.roomById.get(roomId) || { label: roomId, tagline: '' };
      const tools = data.byRoom.get(roomId) || [];
      if (!tools.length && !(roomId === 'freezer' && !unlocked)) continue;

      const headingId = `footer-${roomId}`;
      const body = [];

      if (roomId === 'freezer' && !unlocked) {
        body.push(el('p', {
          class: 'micro',
          text: `${sealedCount()} manager tools are behind the keypad.`
        }));
        body.push(el('button', {
          type: 'button', class: 'chip', 'data-freezer-lock': '',
          text: 'Enter freezer code'
        }));
      } else {
        body.push(el('ul', {}, tools.map((tool) => {
          const external = tool.external_only || isExternal(tool.url);
          return el('li', {}, [
            el('a', {
              class: 'tool-row',
              href: tool.url,
              target: external ? '_blank' : null,
              rel: external ? 'noopener noreferrer' : null
            }, [
              // No blurb. At four columns theme.css line-clamps it to two lines
              // and half the entries read "…right at th…" — a section headed
              // "Every tool, in plain text" cannot amputate its own sentences.
              // A name and a room grouping is what an index owes you; the blurb
              // lives in the viewer, where there is room for it.
              el('span', { class: 'tool-row-name', text: tool.label })
            ])
          ]);
        })));
      }

      groups.push(el('section', { 'aria-labelledby': headingId }, [
        el('h3', { class: 'kicker', id: headingId, text: meta.label }),
        // THE SECOND COPY OF meta.tagline, AND IT STAYS — because it is not on
        // the page and cannot get onto it. "Remove the descriptions on each
        // page" is about the type standing on the room art: he named the
        // Pass's, and said it in the same breath as "that would make the slides
        // fit better". This is not a slide. It is a room heading's subtitle in
        // a plain-text directory — and, since the footer recap was removed at
        // his earlier instruction, buildFooter() is not called at all (see the
        // boot order in §7), so this line renders nowhere in the shipped page.
        // Deleting it would be deleting dead code on a live instruction's
        // authority, and it would take the one thing that still explains what
        // is filed under "Prep Station" out of the file that would come back
        // first if the index ever returns. If the index does return and he
        // does not want the subtitle, it is this one line.
        el('p', { class: 'micro', text: meta.tagline || '' }),
        ...body
      ]));
    }
    fill(grid, groups);
  }
  renderGroups();
  onFreezerUnlock(renderGroups);

  fill(footer, [
    el('h2', { class: 't-sub', id: 'footer-title', text: 'Every tool, in plain text' }),
    el('p', {
      class: 'micro',
      text: 'The whole index, grouped by room. Ordinary links — open them here, in a new tab, or copy them out.'
    }),
    el('hr', { class: 'rule' }),
    grid,
    el('hr', { class: 'rule' }),
    el('p', {
      class: 'micro',
      text: `Cook County Cooks · ${totalToolCount(data)} tools across ${data.rooms.length} rooms · Blue Fox C³`
    })
  ]);

  return footer;
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 7 · BOOT
 *
 * Order matters and is not negotiable:
 *
 *   markup first    — every module measures or queries the DOM, so nothing can
 *                     run until #kitchen actually contains the rooms.
 *   initOverlay     — registers the delegated [data-tool] handler and populates
 *                     the registry the screens read their URLs from. Must come
 *                     BEFORE mountRoomScreens or the screens mount blank and
 *                     have to wait on whenReady().
 *   initEngine      — measures room geometry. Must come AFTER the markup, and
 *                     refresh() must be called after anything that changes the
 *                     document height afterwards (the footer, mainly).
 *   mountRoomScreens— needs laid-out hosts to solve its homography against.
 *   initChefWall    — last; it appends a modal to <body> and nothing waits on it.
 * ────────────────────────────────────────────────────────────────────────── */

export async function boot() {
  /* NOTE 1, applied: kill the CSS smooth scroll before anything can scroll.
     See the header comment — this is what stops theme.css's
     `html { scroll-behavior: smooth }` from fighting the engine's tween. */
  document.documentElement.style.scrollBehavior = 'auto';

  let raw;
  try {
    raw = await loadData();
  } catch (err) {
    console.error('[app] could not load tools/headchefs:', err);
    return;
  }
  const data = indexTools(raw.tools);

  /* ---- 0. the sealed freezer ---------------------------------------------
   * Before ANY markup, because every surface that renders below asks
   * isFreezerUnlocked() and sealedCount() as it builds. coldgate.js resolves
   * the envelope and re-adopts a payload this tab already decrypted earlier in
   * the session; see its header for the contract. setAdopt() has to be handed
   * over BEFORE initColdGate() runs, or a session restore would fold the
   * fourteen into nothing. */
  let overlayApi = null;
  const adoptCold = (tools) => {
    const room = data.byRoom.get('freezer') || [];
    for (const tool of tools) {
      if (data.bySlug.has(tool.slug)) continue;
      data.tools.push(tool);
      data.bySlug.set(tool.slug, tool);
      room.push(tool);
      // overlay.js resolves a slug through this Map inside openTool(); until
      // now it did not contain a single freezer tool, which is why a deep link
      // to one had nothing to open.
      if (overlayApi && overlayApi.registry) overlayApi.registry.set(tool.slug, tool);
    }
    data.byRoom.set('freezer', room);
    FREEZER_RAIL_META = {
      tools: room,
      label: (data.roomById.get('freezer') || {}).label || 'Walk-In Freezer'
    };
  };
  setAdopt(adoptCold);

  await initColdGate();

  // playUnlockBeat() is handed to freezer.js as a bare callback and runs long
  // after boot() has returned, so the one thing it cannot do is close over a
  // local. It gets the freezer's tools and label here instead.
  FREEZER_RAIL_META = {
    tools: data.byRoom.get('freezer') || [],
    label: (data.roomById.get('freezer') || {}).label || 'Walk-In Freezer'
  };

  /* ---- 1. markup ---------------------------------------------------------- */
  buildKitchen(data);
  // The eight blank sheets in the photographs — the prep station's four recipe
  // cards, the back office's two clipboards and its printer output, the card on
  // the pass — get the name of the tool they open printed onto them, on their
  // own plane and in their own light. It appends one aria-hidden child to each
  // EXISTING hotspot button: no new elements over the objects, no change to the
  // click target, the reticle, the focus ring or the accessible name. It reads
  // no layout and starts no animation, so it can run here, before the engine
  // measures, and it changes no document height.
  initLabels();
  buildTicketRail(data);
  buildC3Menu(data);
  // After the rails exist, never awaited: see the note on the function. The
  // chip is fully usable before this resolves and stays usable if it never does.
  armArcadeChips();
  // The client asked for the Walk-In Freezer to be the hard stop when scrolling:
  // "I want to remove the bottom recap portion on the site. I want the freezer to
  // be the last thing someone could see... All of these tools are listed in the
  // menu, so employees can find them there as well." The visible footer index is
  // therefore not built. The <noscript> index in index.html stays (it is the
  // genuinely-no-JS path and is invisible to everyone else), and the C3 menu
  // remains a real list of real <a href> links, so the "just give me the link"
  // route survives for keyboards and screen readers.
  // buildFooter(data);
  // Collapse the footer element itself so the Walk-In is a true hard stop with
  // no dead band under it. Done from JS on purpose: the <noscript> index inside
  // #site-footer is the genuinely-no-JS path, and a browser with JS off never
  // runs this line, so that path is untouched.
  const footerEl = $('#site-footer');
  if (footerEl) footerEl.hidden = true;

  /* ---- 2. the freezer gate ------------------------------------------------ */
  // Every lock affordance — the keypad object in the photograph, the C³ menu's
  // locked row, the footer's button — is one delegated handler.
  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest && ev.target.closest('[data-freezer-lock]');
    if (!trigger) return;
    ev.preventDefault();
    if (isFreezerUnlocked()) return;
    openKeypad();
  });

  // The walk-in door. freezer.js replaces what the LOCKED freezer looks like:
  // a closed insulated door with the keypad on the wall beside it, which swings
  // open on a correct code. It owns none of the gate above — it reads
  // isFreezerUnlocked() and never writes it — and if its plate is missing or
  // the module throws, the freezer falls straight back to the v3 behaviour.
  //
  // playUnlockBeat is handed over as `onRevealed` rather than being subscribed
  // to the unlock directly, so the fourteen chips ripple as the door finishes
  // opening instead of while it is still shut. When there is no door (no art,
  // reduced motion, the room off screen) freezer.js calls it immediately, which
  // is exactly the old timing.
  const freezer = initFreezer({
    room: $('#room-freezer'),
    geometry: FREEZER_DOOR,
    // Named here rather than defaulted inside freezer.js so PLATES stays the one
    // table build/fingerprint.mjs has to rewrite.
    interior: PLATES.freezer.src,
    interiorSrcset: PLATES.freezer.srcset,
    // The jamb and the leaf are the SAME picture as the room's own plate, so
    // they must resolve to the same candidate or the phone decodes the door
    // twice — once at 1400 for the plate and once at 2400 for the door. Passed
    // in rather than repeated inside freezer.js so PLATE_SIZES has one owner.
    sizes: PLATE_SIZES,
    isUnlocked: isFreezerUnlocked,
    onUnlock: onFreezerUnlock,
    onRevealed: playUnlockBeat
  });

  if (isFreezerUnlocked()) {
    // Already open from earlier in this session. The chips, the footer and the
    // C³ list all rendered unlocked because they read live state at render time,
    // so the only thing left over is the keypad object in the photograph. Clear
    // it WITHOUT the beat: nothing just happened, and announcing that it did
    // would be a lie to a screen reader.
    const keypad = $('#room-freezer .hotspot[data-freezer-lock]');
    if (keypad) keypad.remove();
  }

  /* ---- 3. the tool viewer ------------------------------------------------- */
  // THE GATE LIVES HERE, not on the click. overlay.js evaluates canOpen inside
  // openTool() itself, after the registry lookup and before any UI, so it covers
  // every route into a tool: a chip, a hotspot, a TV screen, the keyboard, the
  // C³ menu, the openTool re-exported on window.CCC — and, the one that was
  // actually broken, syncFromLocation() honouring a `#/tool/<slug>` deep link on
  // a cold load. canOpen is re-evaluated on every open and must be SYNCHRONOUS
  // (a returned Promise is truthy and would open the tool regardless), so it
  // reads live state and the keypad goes in onRefused.
  //
  // On refusal overlay.js opens nothing at all — no chrome, no scroll lock, no
  // history entry — and strips the refused hash itself, so a locked deep link
  // does not re-fire on reload.
  // gatedSlugs is now DYNAMIC: while the walk-in is sealed there are no freezer
  // slugs to name, because the fourteen are ciphertext. The predicate is kept
  // and kept live anyway, as defence in depth — if anything ever puts a freezer
  // tool into overlay.js's registry before the code is typed, canOpen still
  // refuses it. Deep links to a slug that is not in the registry AT ALL are
  // caught by watchSealedDeepLink() below; overlay.js cannot refuse a tool it
  // has never heard of.
  const gatedSlugs = () => new Set((data.byRoom.get('freezer') || []).map((t) => t.slug));
  overlayApi = initOverlay({
    // Passing the array straight in — no fetch, so a deep link resolves on the
    // first frame instead of after a network round-trip.
    tools: data.tools,
    canOpen: (slug) => !gatedSlugs().has(slug) || isFreezerUnlocked(),
    // The retry waits for the door. Without whenOpen() a locked deep link
    // unlocks, the tool opens over the top on the next tick, and the set piece
    // the client paid for plays out behind a full-screen overlay. whenOpen()
    // resolves immediately when there is no door to wait for.
    onRefused: (slug, { retry }) => {
      openKeypad().then((ok) => { if (ok) freezer.whenOpen().then(retry); });
    }
  });

  // Anything already unlocked from earlier in this session has to be in the
  // registry before overlay.js honours the first deep link.
  if (isFreezerUnlocked()) adoptCold(coldTools());

  /* THE DEEP LINK THAT OVERLAY.JS CANNOT SEE.
   *
   * In v3 every freezer slug was in tools.json, so a `#/tool/<slug>` link on a
   * cold load reached openTool(), failed canOpen, and routed through
   * onRefused into the keypad. That refusal is not weakened — it still fires
   * for anything the registry knows about — but a sealed slug is not in the
   * registry, and overlay.js's own answer for an unknown slug is one
   * console.warn and nothing else.
   *
   * That is a STRONGER refusal (there is nothing to open, and the URL leaks
   * nothing back) but a worse manager: someone with a bookmark to a manager
   * tool would get a silent dead page. So we catch it here. The rule is
   * deliberately narrow — a hash that names a tool this build has never heard
   * of, while the walk-in is shut — and its only effect is to offer the
   * keypad. It never confirms whether the slug is one of the fourteen: a wrong
   * slug and a real one behave identically right up until the code decrypts.
   */
  watchSealedDeepLink(data, freezer);

  /* ---- 4. the cinema ------------------------------------------------------ */
  const engine = initEngine();

  /* ---- 5. the screens ----------------------------------------------------- */
  // Every TV, monitor and tablet in the building. screens.js picks a renderer
  // per `data-screen-mode` (see rooms.js) and hands the tools array straight in
  // so a screen never waits on a network round-trip for its own label.
  mountRoomScreens(document, { tools: data.tools });

  /* ---- 6. the head chef wall ---------------------------------------------- */
  const breakroom = $('#room-breakroom');
  const wallHost = breakroom && breakroom.querySelector('[data-chefwall-host]');
  if (wallHost) {
    initChefWall({
      host: wallHost,
      chefs: raw.headchefs.headchefs || [],
      frames: CHEF_FRAMES,
      // The inline bootstrap in index.html is a BUILD-TIME snapshot, and the
      // 30-minute head-chef auto-pull commits headchefs/** only — so without
      // this the page renders the snapshot for ever while headchefs.json moves
      // underneath it. chefwall.js mounts from the inline data first and then
      // re-reads this one ~13 KB file; it never fetches the decks. See the
      // `refreshFrom` docs in chefwall.js.
      refreshFrom: 'headchefs/headchefs.json',
      // Below 900px theme.css hides .hotspots outright, so the wall's narrow
      // fallback strip has to live somewhere untransformed and still visible:
      // the break room's own rail. This is exactly the case chefwall.js's
      // `stripHost` option was added for.
      stripHost: breakroom.querySelector('.rail')
    });
  }

  /* ---- 7. re-measure ------------------------------------------------------ */
  // The footer, the chef wall's modal and the chef strip all changed the
  // document height after initEngine() cached its geometry. One refresh puts the
  // runway maths back in agreement with reality.
  engine.refresh();

  // The plates are lazy; a decode that lands late can change nothing about
  // layout (they are absolutely positioned with fixed intrinsic size) but the
  // fonts can. One refresh when the webfonts settle, then we are done.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => engine.refresh()).catch(() => {});
  }

  // Expose a tiny handle for debugging in a store — never for other modules.
  window.CCC = Object.assign(window.CCC || {}, { engine, data, openTool, freezer });
}

/* NO SELF-START. app.js — the router — awaits the dynamic import of this module
   and calls boot() itself, after it has already decided that this device gets
   the restaurant. Starting here as well would boot the cinema twice. */
