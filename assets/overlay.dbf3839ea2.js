




import { freshUrl } from './freshurl.72537abf1f.js';
export { freshUrl };



import { preflight, preflightCopy } from './preflight.3928c43470.js';
export { preflight };







const FRAME_TIMEOUT_MS = 30000;



const SLOW_NOTE_MS = 6000;



const STALE_AFTER_MS = 10 * 60 * 1000;

 
const HASH_RE = /^#\/tool\/([A-Za-z0-9_-]+)\/?$/;



const OPEN_MS = { full: 360, lite: 160, off: 0 };
const CLOSE_MS = { full: 160, lite: 160, off: 0 };



const SKEL_DELAY_MS = 350;



const PROBE_FAST_LOAD_MS = 1500;

 
const PROBE_HOLD_MS = 2000;

 
const HANG_PROBE_TIMEOUT_MS = 5000;



const NEVER_FRAMES = [
  /(^|\.)sharepoint\.com$/i,
  /(^|\.)onedrive\.live\.com$/i,
  /(^|\.)1drv\.ms$/i,
  /(^|\.)office\.com$/i,
  /(^|\.)office365\.com$/i,
  /(^|\.)microsoftonline\.com$/i
];

const $ = (sel, root = document) => root.querySelector(sel);
const noop = () => {};

 
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k in node && k !== 'title' && k !== 'list') { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

 
function absUrl(url) {
  try { return new URL(url, document.baseURI); } catch { return null; }
}

function isCrossOrigin(url) {
  const u = absUrl(url);
  return !!u && u.origin !== location.origin;
}

 
function isKnownUnframeable(url) {
  const u = absUrl(url);
  if (!u) return false;
  return NEVER_FRAMES.some((re) => re.test(u.hostname));
}






const CLIENT_HOSTS = [/(^|\.)github\.io$/i, /(^|\.)githubusercontent\.com$/i];

function isClientHosted(url) {
  const u = absUrl(url);
  return !!u && CLIENT_HOSTS.some((re) => re.test(u.hostname));
}

const reduceMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;



function motionTier() {
  if (reduceMotion()) return 'off';
  const m = document.documentElement.getAttribute('data-motion');
  return m === 'lite' || m === 'off' ? m : 'full';
}



function openNewTab(url) {
  let win = null;
  try { win = window.open(url, '_blank'); } catch { win = null; }
  if (win) { try { win.opener = null; } catch {   } }
  return win;
}

 
function internalHref(slug) {
  return `#/tool/${encodeURIComponent(slug)}`;
}



function normaliseTriggerLinks(root) {
  if (!root || !root.querySelectorAll) return;
  const list = root.matches && root.matches('a[data-tool]') ? [root] : [];
  for (const a of root.querySelectorAll('a[data-tool]')) list.push(a);
  for (const a of list) {
    const slug = a.getAttribute('data-tool');
    if (!slug) continue;
    const want = internalHref(slug);
    if (a.getAttribute('href') !== want) a.setAttribute('href', want);
    if (a.hasAttribute('target')) a.removeAttribute('target');
    if (a.hasAttribute('rel')) a.removeAttribute('rel');
  }
}



function watchTriggerLinks() {
  normaliseTriggerLinks(document.body || document.documentElement);
  if (typeof MutationObserver !== 'function' || !document.body) return;
  const DEEP = {
    childList: true, subtree: true,
    
    
    attributes: true, attributeFilter: ['href', 'target']
  };
  const watched = new WeakSet();
  const deep = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') { normaliseTriggerLinks(m.target); continue; }
      for (const n of m.addedNodes) if (n.nodeType === 1) normaliseTriggerLinks(n);
    }
  });
  const watchDeep = (node) => {
    if (!node || node.nodeType !== 1 || watched.has(node)) return;
    watched.add(node);
    normaliseTriggerLinks(node);
    deep.observe(node, DEEP);
  };
  const isKitchen = (node) => node.id === 'kitchen';
  const adoptKitchenChild = (n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('.pocket')) watchDeep(n);
    else if (n.querySelector) { const p = n.querySelector('.pocket'); if (p) watchDeep(p); }
  };
  const kitchenMo = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) adoptKitchenChild(n);
  });
  const adoptBodyChild = (n) => {
    if (n.nodeType !== 1 || (state.ui && n === state.ui.root)) return;
    if (isKitchen(n)) {
      if (watched.has(n)) return;
      watched.add(n);
      normaliseTriggerLinks(n);
      for (const c of Array.from(n.children)) adoptKitchenChild(c);
      kitchenMo.observe(n, { childList: true });
      return;
    }
    watchDeep(n);
  };
  for (const n of Array.from(document.body.children)) adoptBodyChild(n);
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) adoptBodyChild(n);
  }).observe(document.body, { childList: true });
}




const state = {
   
  registry: new Map(),
   
  ready: false,
  readyWaiters: [],
   
  ui: null,
   
  activeSlug: null,
   
  lastFocus: null,
   
  pushedHistory: false,
   
  scrollY: 0,
  locked: false,
   
  frameTimer: 0,
  slowTimer: 0,
  

  openedAt: 0,
  

  staleOffered: false,
   
  canOpen: null,
  onRefused: null,
  initialised: false,

  

  phase: 'closed',
  inert: false,
  viewing: false,
   
  lockTimer: 0,
   
  finishTimer: 0,
   
  gen: 0,
   
  skelTimer: 0,
  revealCurrent: null,
   
  closeWatch: 0
};

function whenReady() {
  if (state.ready) return Promise.resolve();
  return new Promise((res) => state.readyWaiters.push(res));
}

function markReady() {
  state.ready = true;
  state.readyWaiters.splice(0).forEach((fn) => fn());
}



function getTool(slug) {
  if (typeof slug !== 'string' || !slug) return null;
  const hit = state.registry.get(slug);
  if (hit) return hit;
  const low = slug.toLowerCase();
  const lowHit = state.registry.get(low);
  if (lowHit) return lowHit;
  for (const [key, tool] of state.registry) if (key.toLowerCase() === low) return tool;
  return null;
}




const STYLES = `
:root {
  --ccc-ov-z: 9000;
  --ccc-ov-ease: cubic-bezier(.22,.61,.36,1);
}

/* --- background scroll lock ------------------------------------------------ */
/* (v29 fix round, G1 D8) NOTHING MAY RESTYLE <html> AT THE LOCK. There was
   an html.ccc-locked rule setting scroll-behavior — a value <html> already
   has (cinema.js sets it inline at boot) — and a restyle of <html> is a
   restyle of every element under it (measured: ~710 elements per lock and
   again per unlock, 1x iPad profile). So no rule has the ccc-locked class in
   its subject (body's geometry keys on data-ccc-lock below), and
   unlockScroll() asks for an instant scroll instead of writing
   html.style.scrollBehavior. The class stays on <html> and <body>: the engine,
   screens, motion and find read it, and theme.css keys a few loops to it
   (descendant selectors, which invalidate only those elements). */
/* NOTHING BEHIND THE VIEWER MOVES WHILE IT IS UP (v29, O-1 / G2). 37 CSS
   animations kept running under the scrim: with a static tool open, measured
   322 ms/s of page main-thread CPU and 54 style recalcs/s, 3 ms/s and 1.2/s
   once they were paused (iPad profile; on an iPad that thread is the tool's too).
   KEYED, NOT UNIVERSAL (v29 fix round, G1 D8). This used to be
   "html.is-viewing body > :not(.ccc-ov) *" (+ ::before/::after): a rule whose
   subject is * makes the is-viewing class invalidate EVERY element under
   <body>, so opening and closing the viewer each restyled ~1,450 elements in
   one task (measured 67-74 ms at 1x, 416-450 ms at 4x on close). The loops
   that exist are few and each one is already keyed to is-viewing by its owner
   (theme.css §06c plumes, §08 marquee, screens.js scan/key sheen, freezer.js
   ring, motion.js breath). This list repeats exactly those subjects as a
   backstop, so the class change invalidates only the elements that carry them.
   A new infinite loop must be keyed to html.is-viewing by its owner (and may
   be added here). The Find palette ([data-ccc-keep-live], C4) is not touched.
   Paused, never hidden: layout is untouched. */
html.is-viewing .stage::before,
html.is-viewing .stage::after,
html.is-viewing .ccc-scr__scan::after,
html.is-viewing .ccc-scr-title__key::after,
html.is-viewing [data-marquee]::before,
html.is-viewing [data-marquee]::after,
html.is-viewing .frz-pad__ring,
html.is-viewing .is-breathing::after {
  animation-play-state: paused !important;
}
/* The lock's geometry keys on an ATTRIBUTE that only <body> ever carries,
   not on the ccc-locked class: a class that is the subject of any rule makes
   every element that gains it restyle itself, and <html> gains ccc-locked too
   — a restyle of <html> is a restyle of the whole document (G1 D8). */
body[data-ccc-lock] {
  position: fixed;
  left: 0; right: 0; width: 100%;
  overscroll-behavior: none;
}

/* --- screen-reader-only text ---------------------------------------------- */
.ccc-sr {
  position: absolute !important; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}

/* ==========================================================================
   THE VIEWER
   ========================================================================== */
.ccc-ov {
  position: fixed; inset: 0;
  z-index: var(--ccc-ov-z);
  display: grid;
  grid-template-rows: auto 1fr;
  color: var(--ccc-ov-ink, #f2efe9);
  font-family: var(--ccc-font-ui, var(--font-ui, system-ui, -apple-system, "Segoe UI", sans-serif));
}
.ccc-ov[hidden] { display: none; }
/* Closing: the page underneath is already unlocked, un-inerted and in its
   room (see teardown()), so it takes the pointer from the first frame of the
   fade rather than from the last. This is also what makes a second ✕ during
   the fade impossible. */
.ccc-ov.is-closing { pointer-events: none; }

/* v29 (O-2): no backdrop-filter — an 18px full-viewport blur (≈15 MB backdrop
   layer at iPad @2x) behind a scrim that is 80-95% opaque. The top stop is a
   touch denser to make up for it. touch-action is set here and never on an
   ancestor of the frame (that would take touch scrolling from the tool): a
   swipe on the margin must not scroll the room before the lock is on. */
.ccc-ov__scrim {
  position: absolute; inset: 0;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(24,20,16,.8), rgba(6,6,7,.95) 70%),
    var(--ccc-ov-scrim, rgba(6,6,7,.92));
  opacity: 0;
  transition: opacity 240ms var(--m-ease-out, cubic-bezier(.22,.61,.24,1));
  touch-action: none;
}
.ccc-ov.is-in .ccc-ov__scrim { opacity: 1; }

/* The panel: a "service window" that grows out of whatever was touched.
   --ccc-ov-ox/-oy are set per open from the trigger's rect (openTool); with no
   trigger (a deep link, Back/Forward) it grows from its own centre. */
.ccc-ov__panel {
  position: relative;
  grid-row: 1 / -1;
  display: grid;
  grid-template-rows: auto 1fr;
  width: min(1680px, 100vw - clamp(0px, 4vw, 56px));
  height: min(var(--ccc-ov-vh, 100svh) - clamp(0px, 4vw, 56px), 1100px);
  margin: auto;
  border-radius: var(--ccc-ov-radius, 18px);
  overflow: hidden;
  background: var(--ccc-ov-panel, #101012);
  box-shadow:
    0 0 0 1px rgba(255,255,255,.07),
    0 60px 140px -30px rgba(0,0,0,.9);
  transform-origin: var(--ccc-ov-ox, 50%) var(--ccc-ov-oy, 50%);
  transform: translate3d(0, 10px, 0) scale(.94);
  opacity: 0;
  transition:
    transform 360ms var(--m-ease-cine, cubic-bezier(.16,1,.3,1)),
    opacity 360ms var(--m-ease-cine, cubic-bezier(.16,1,.3,1));
}
.ccc-ov.is-in .ccc-ov__panel { transform: none; opacity: 1; }
/* Leaving is quicker and accelerates, and only gives up a hair of scale. The
   target lives on :not(.is-in) because teardown() sets .is-closing two frames
   BEFORE it drops .is-in (the room is put right underneath first), and the
   panel must not move in between. */
.ccc-ov.is-closing .ccc-ov__scrim {
  transition: opacity 160ms var(--m-ease-in, cubic-bezier(.5,0,.75,0));
}
.ccc-ov.is-closing .ccc-ov__panel {
  transition:
    transform 160ms var(--m-ease-in, cubic-bezier(.5,0,.75,0)),
    opacity 160ms var(--m-ease-in, cubic-bezier(.5,0,.75,0));
}
.ccc-ov.is-closing:not(.is-in) .ccc-ov__panel { transform: scale(.985); }

@media (max-width: 720px), (max-height: 500px) and (orientation: landscape) {
  .ccc-ov__panel { width: 100vw; height: var(--ccc-ov-vh, 100svh); border-radius: 0; }
}

/* IMMERSIVE — the arcade asks for this while a game is running (§6b). The
   chrome bar goes and the panel takes the whole viewport edge to edge, so the
   game gets every pixel; the arcade draws its own ✕ to come back. dvh (with
   svh as the floor) so a phone's collapsing toolbar gives its space to the
   game too. Cleared on every frame swap and on close. */
.ccc-ov.is-immersive .ccc-ov__panel {
  width: 100vw; height: 100svh; height: 100dvh;
  border-radius: 0; box-shadow: none;
  grid-template-rows: 0 1fr;
}
.ccc-ov.is-immersive .ccc-ov__bar { display: none; }
.ccc-ov.is-immersive .ccc-ov__stage { background: #000; }

/* --- chrome bar ------------------------------------------------------------ */
.ccc-ov__bar {
  display: flex; align-items: center; gap: clamp(10px, 2vw, 22px);
  padding: 12px clamp(12px, 2vw, 20px);
  background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
  border-bottom: 1px solid rgba(255,255,255,.09);
}
.ccc-ov__id { min-width: 0; flex: 1 1 auto; }
.ccc-ov__title {
  margin: 0;
  font-family: var(--ccc-font-display, var(--font-display, inherit));
  font-size: clamp(15px, 1.5vw, 19px);
  font-weight: 600;
  letter-spacing: .005em;
  line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccc-ov__blurb {
  margin: 3px 0 0;
  font-size: clamp(11.5px, 1.05vw, 13px);
  line-height: 1.35;
  color: var(--ccc-ov-dim, rgba(242,239,233,.62));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* v29: the blurb is .ccc-sr (see buildUI) — never display:none, which would
   drop it from the accessibility tree on a phone. */

.ccc-ov__actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }

.ccc-ov__btn {
  -webkit-appearance: none; appearance: none;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 40px; padding: 0 14px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 999px;
  background: rgba(255,255,255,.05);
  color: inherit; font: inherit; font-size: 13px; font-weight: 500;
  text-decoration: none; cursor: pointer;
  transition: background .18s ease, border-color .18s ease, transform .12s ease;
}
.ccc-ov__btn:hover { background: rgba(255,255,255,.11); border-color: rgba(255,255,255,.24); }
.ccc-ov__btn:active { transform: translateY(1px); }
.ccc-ov__btn:focus-visible {
  outline: 2px solid var(--ccc-focus, #e8b45a);
  outline-offset: 3px;
}
.ccc-ov__btn--primary {
  background: var(--ccc-accent, #e8b45a);
  border-color: transparent;
  color: var(--ccc-accent-ink, #17130c);
  font-weight: 600;
}
.ccc-ov__btn--primary:hover { background: var(--ccc-accent-hi, #f2c778); }
.ccc-ov__btn--icon { width: 40px; padding: 0; font-size: 15px; }

/* THE SLIM BAR (v28, at the client's request: "reduce the size of the header
   by half … so it doesn't take up much real estate"). ~33px instead of ~66px:
   one line — title, then the blurb run in after it and truncated — and a
   28px close button whose hit area is widened invisibly, so it stays easy to
   tap even though it draws small. Scoped to the bar: the fallback card's
   buttons keep their full size. */
.ccc-ov__bar { padding: 2px 8px 2px clamp(10px, 1.6vw, 16px); gap: 10px; min-height: 32px; }
.ccc-ov__id { display: flex; align-items: baseline; gap: 10px; }
.ccc-ov__title { flex: 0 1 auto; font-size: 13.5px; line-height: 1.15; }
.ccc-ov__blurb { flex: 1 1 0; min-width: 0; margin: 0; font-size: 11.5px; line-height: 1.15; }
.ccc-ov__bar .ccc-ov__btn { min-height: 28px; position: relative; }
.ccc-ov__bar .ccc-ov__btn--icon,
.ccc-ov__bar .ccc-ov__btn--find { width: 28px; padding: 0; font-size: 11px; }
.ccc-ov__bar .ccc-ov__btn--icon::after,
.ccc-ov__bar .ccc-ov__btn--find::after { content: ""; position: absolute; inset: -9px; }
/* v29 fix round (G2 n2): TRULY 44 TALL. The centred -9px area reached above
   the bar's top edge, where the panel's clip (or the top of a phone's screen)
   cut it to ~38px. It now starts at the bar's top edge and hangs DOWN past
   the slim bar, over the top of the stage: 48px tall, 44px wide, for a 28px
   drawn button in a 33px bar (Jeff's slim header keeps its height). The bar
   sits above the stage (z-index 1), so the strip under each button is the
   button's; the rest of the tool's top edge is untouched. */
.ccc-ov__bar .ccc-ov__btn--icon::after,
.ccc-ov__bar .ccc-ov__btn--find::after { top: -5px; bottom: auto; height: 50px; }

/* v29 TITLE BAR (design audit P2-10, P1-7, §3.4).
   · Title in the UI face, Archivo 13/600 (13.5px Bodoni read thin here).
   · The blurb is not drawn (no descriptions under titles, as elsewhere); it
     stays as the dialog's aria-describedby.
   · Find and ✕ draw at 28px with 44px-wide hit areas (::after at -9px: it
     sits on the 26px padding box), 16px apart so the areas meet exactly; the
     bar sits over the stage so the lower edge of an area is not under the
     frame. Height: see the fix-round rule above (the area hangs down from the
     bar's top edge). Measured with elementFromPoint.
   · The focus ring is drawn inward (the panel's clipped corner cut it off).
   · Bar contents fade in 120 ms after the panel starts to grow (M7). */
.ccc-ov__bar { position: relative; z-index: 1; }
.ccc-ov__title {
  font-family: var(--ccc-font-ui, var(--font-text, system-ui, -apple-system, "Segoe UI", sans-serif));
  font-size: 13px; font-weight: 600; letter-spacing: .01em; line-height: 1.2;
}
.ccc-ov__bar .ccc-ov__actions { gap: 16px; }
/* theme.css gives every :focus-visible a 6px brass halo (box-shadow) outside
   the box; that halo is what the panel's corner sliced off. Inside the bar the
   ring is drawn inward instead, same brass, and the halo is dropped. */
.ccc-ov__bar .ccc-ov__btn:focus-visible {
  outline: 2px solid var(--ccc-focus, #e8b45a); outline-offset: -2px;
  box-shadow: none; border-radius: 999px;
}
.ccc-ov__btn--find svg { display: block; width: 14px; height: 14px; }
.ccc-ov__bar > * {
  opacity: 0;
  transition: opacity 160ms var(--m-ease-out, cubic-bezier(.22,.61,.24,1)) 120ms;
}
.ccc-ov.is-in .ccc-ov__bar > *,
.ccc-ov.is-closing .ccc-ov__bar > * { opacity: 1; }
.ccc-ov.is-closing .ccc-ov__bar > * { transition: none; }

/* --- stage (frame / skeleton / fallback share one box) --------------------- */
/* v29: THE STAGE IS DARK, THE FRAME CARRIES THE PAPER. A cream stage and
   skeleton flashed a bright panel on every open (design audit P1-7). The paper
   (--ccc-ov-stage) is now the frame's own background, invisible until the
   frame is revealed, so a tool with no background of its own still sits on
   paper and nothing light shows before the tool does. */
.ccc-ov__stage { position: relative; background: var(--ccc-ov-panel, #101012); overflow: hidden; }

.ccc-ov__frame {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  border: 0; display: block;
  background: var(--ccc-ov-stage, #f7f5f1);
  opacity: 0;
  transition: opacity 240ms var(--m-ease-out, cubic-bezier(.22,.61,.24,1));
}
.ccc-ov__frame.is-shown { opacity: 1; }
.ccc-ov.is-immersive .ccc-ov__frame { background: #000; }

/* --- loading skeleton: a plausible dashboard, dark, gently shimmering -------
   Hidden by default and only put up if the tool has not drawn after
   SKEL_DELAY_MS (350 ms), so a quick or cached tool never flashes it; it fades
   in over 200 ms when it does come. */
.ccc-ov__skel {
  position: absolute; inset: 0;
  padding: clamp(16px, 3vw, 34px);
  display: grid; gap: clamp(12px, 1.6vw, 20px);
  grid-template-rows: auto auto 1fr;
  background: var(--ccc-ov-panel, #101012);
  overflow: hidden;
  animation: ccc-skel-in 200ms var(--m-ease-out, cubic-bezier(.22,.61,.24,1)) both;
}
.ccc-ov__skel[hidden] { display: none; }
.ccc-ov__skel::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 25%, rgba(255,255,255,.045) 50%, transparent 75%);
  transform: translate3d(-60%,0,0);
  animation: ccc-shimmer 1.5s linear infinite;
  pointer-events: none;
}
@keyframes ccc-shimmer { to { transform: translate3d(60%,0,0); } }
@keyframes ccc-skel-in { from { opacity: 0; } }

.ccc-sk { background: rgba(255,255,255,.06); border-radius: 8px; }
.ccc-sk--title { height: clamp(20px, 2.4vw, 28px); width: min(340px, 52%); }
.ccc-sk--tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: clamp(10px, 1.4vw, 16px); background: none; }
.ccc-sk--tile { height: clamp(74px, 9vw, 104px); border-radius: 12px; background: rgba(255,255,255,.05); }
.ccc-sk--body { border-radius: 14px; background: rgba(255,255,255,.035); }

/* --- fallback card: the un-frameable path --------------------------------- */
.ccc-ov__fallback {
  position: absolute; inset: 0;
  display: grid; place-content: center; justify-items: center;
  gap: 14px; padding: clamp(24px, 5vw, 56px);
  text-align: center;
  background:
    radial-gradient(90% 70% at 50% 0%, rgba(255,255,255,.06), transparent 70%),
    var(--ccc-ov-panel, #101012);
  color: var(--ccc-ov-ink, #f2efe9);
}
.ccc-ov__fallback[hidden] { display: none; }
.ccc-ov__fb-mark {
  width: 58px; height: 58px; display: grid; place-content: center;
  border-radius: 16px; margin-bottom: 4px;
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.05);
  font-size: 26px; line-height: 1;
}
.ccc-ov__fb-title {
  margin: 0;
  font-family: var(--ccc-font-display, var(--font-display, inherit));
  font-size: clamp(19px, 2.4vw, 26px); font-weight: 600;
}
.ccc-ov__fb-copy {
  margin: 0; max-width: 48ch;
  font-size: clamp(13px, 1.3vw, 15px); line-height: 1.55;
  color: var(--ccc-ov-dim, rgba(242,239,233,.66));
}
.ccc-ov__fb-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 8px; }
.ccc-ov__fb-actions [hidden] { display: none; }

/* --- the note bar: progress and staleness, never a verdict -----------------
   Sits ON the stage, over the skeleton or over a loaded frame, and says the one
   true thing the viewer knows at that moment: "this is big and still coming",
   or "you have had this open for a while". It carries its own affordance (a
   reload, when one is on offer) so the action is one tap away, and it NEVER
   covers the whole stage — a tool that is working must stay usable underneath
   it. */
.ccc-ov__note {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
  gap: 10px; padding: 10px clamp(12px, 2vw, 20px);
  background: var(--ccc-ov-panel, #101012);
  border-top: 1px solid rgba(255,255,255,.10);
  color: var(--ccc-ov-ink, #f2efe9);
  font-size: clamp(12px, 1.2vw, 14px); line-height: 1.45;
  box-shadow: 0 -18px 40px -24px rgba(0,0,0,.9);
}
.ccc-ov__note[hidden] { display: none; }
.ccc-ov__note-text { max-width: 60ch; }
.ccc-ov__btn--sm { padding: 6px 12px; font-size: 12px; min-height: 0; }

/* --- motion tiers (contract C5; design audit §5.2, M7 fallbacks) ------------
   lite: opacity only, 160 ms, no shimmer. off (and prefers-reduced-motion): no
   transitions at all. The lock/unlock ORDER in teardown() is the same in every
   tier; only the fades change. */
html[data-motion="lite"] .ccc-ov__scrim,
html[data-motion="lite"] .ccc-ov__panel,
html[data-motion="lite"] .ccc-ov.is-closing .ccc-ov__scrim,
html[data-motion="lite"] .ccc-ov.is-closing .ccc-ov__panel {
  transition: opacity 160ms var(--m-ease-out, cubic-bezier(.22,.61,.24,1));
}
html[data-motion="lite"] .ccc-ov__panel,
html[data-motion="lite"] .ccc-ov.is-closing:not(.is-in) .ccc-ov__panel { transform: none; }
html[data-motion="lite"] .ccc-ov__bar > * { transition: none; opacity: 1; }
html[data-motion="lite"] .ccc-ov__frame { transition-duration: 160ms; }
html[data-motion="lite"] .ccc-ov__skel,
html[data-motion="lite"] .ccc-ov__skel::after { animation: none; }

html[data-motion="off"] .ccc-ov__scrim,
html[data-motion="off"] .ccc-ov__panel,
html[data-motion="off"] .ccc-ov__frame,
html[data-motion="off"] .ccc-ov__bar > * { transition: none !important; }
html[data-motion="off"] .ccc-ov__panel,
html[data-motion="off"] .ccc-ov.is-closing:not(.is-in) .ccc-ov__panel { transform: none; }
html[data-motion="off"] .ccc-ov__bar > * { opacity: 1; }
html[data-motion="off"] .ccc-ov__skel,
html[data-motion="off"] .ccc-ov__skel::after { animation: none; }

@media (prefers-reduced-motion: reduce) {
  .ccc-ov__scrim, .ccc-ov__panel, .ccc-ov__frame, .ccc-ov__bar > * { transition: none !important; }
  .ccc-ov__panel, .ccc-ov.is-closing:not(.is-in) .ccc-ov__panel { transform: none; }
  .ccc-ov__bar > * { opacity: 1; }
  .ccc-ov__skel, .ccc-ov__skel::after { animation: none; }
}
`;

function injectStyles() {
  if (document.getElementById('ccc-overlay-css')) return;
  document.head.append(el('style', { id: 'ccc-overlay-css', text: STYLES }));
}




function lockScroll() {
  if (state.locked) return;
  state.scrollY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.classList.add('ccc-locked');
  document.body.classList.add('ccc-locked');       
  document.body.setAttribute('data-ccc-lock', ''); 
  document.body.style.top = `-${state.scrollY}px`;
  state.locked = true;
}

function unlockScroll() {
  if (!state.locked) return;
  document.body.classList.remove('ccc-locked');
  document.body.removeAttribute('data-ccc-lock');
  document.body.style.top = '';
  
  
  
  
  
  
  if ('scrollBehavior' in document.documentElement.style) {
    try { window.scrollTo({ top: state.scrollY, left: 0, behavior: 'instant' }); }
    catch { window.scrollTo(0, state.scrollY); }
  } else {
    window.scrollTo(0, state.scrollY);
  }
  document.documentElement.classList.remove('ccc-locked');
  state.locked = false;
}




const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((n) => {
    if (n.hasAttribute('hidden') || n.closest('[hidden]')) return false;
    
    
    const r = n.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}



function trapFocus(ev) {
  if (ev.key !== 'Tab' || !state.ui) return;
  const items = focusables(state.ui.panel);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (ev.shiftKey && (active === first || !state.ui.panel.contains(active))) {
    ev.preventDefault(); last.focus();
  } else if (!ev.shiftKey && (active === last || !state.ui.panel.contains(active))) {
    

    ev.preventDefault();
    const home = items.includes(state.ui.closeBtn) ? state.ui.closeBtn : first;
    home.focus();
  }
}



function setBackgroundInert(on) {
  on = !!on;
  if (on === state.inert) return;
  state.inert = on;
  if (on && state.ui) liveRoot(state.ui);
  for (const node of Array.from(document.body.children)) {
    if (state.ui && node === state.ui.root) continue;
    if (on) {
      if (node.hasAttribute('data-ccc-keep-live')) continue;
      

      if (node.inert === true) continue;
      node.dataset.cccInerted = '1';
      if (node.hasAttribute('aria-hidden')) node.dataset.cccPrevAria = node.getAttribute('aria-hidden');
      node.setAttribute('aria-hidden', 'true');
      if ('inert' in node) { node.dataset.cccPrevInert = node.inert ? '1' : '0'; node.inert = true; }
    } else {
      restoreInertNode(node);
    }
  }
}



function liveRoot(ui) {
  if (!ui || !ui.root) return;
  if (ui.root.inert) ui.root.inert = false;
  if (ui.root.getAttribute('aria-hidden') === 'true') ui.root.removeAttribute('aria-hidden');
}

function restoreInertNode(node) {
  if (!node.dataset || !('cccInerted' in node.dataset)) return;
  delete node.dataset.cccInerted;
  if ('cccPrevAria' in node.dataset) { node.setAttribute('aria-hidden', node.dataset.cccPrevAria); delete node.dataset.cccPrevAria; }
  else node.removeAttribute('aria-hidden');
  if ('inert' in node) {
    node.inert = 'cccPrevInert' in node.dataset ? node.dataset.cccPrevInert === '1' : false;
    delete node.dataset.cccPrevInert;
  }
}



function setViewing(on) {
  on = !!on;
  if (on === state.viewing) return;
  state.viewing = on;
  document.documentElement.classList.toggle('is-viewing', on);
}



function selfHeal() {
  if (state.phase === 'closing') { finishClose(state.gen); return; }
  if (state.phase !== 'closed') return;
  if (state.inert) setBackgroundInert(false);
  for (const node of Array.from(document.body.children)) restoreInertNode(node);
  if (state.locked) unlockScroll();
  setViewing(false);
  document.documentElement.classList.remove('is-viewing');
  if (state.ui && !state.ui.root.hidden) {
    state.ui.root.hidden = true;
    state.ui.root.classList.remove('is-in', 'is-closing', 'is-immersive');
  }
}




function buildUI() {
  if (state.ui) return state.ui;

  const title = el('h2', { class: 'ccc-ov__title', id: 'ccc-ov-title' });
  
  const blurb = el('p', { class: 'ccc-ov__blurb ccc-sr', id: 'ccc-ov-blurb' });

  

  const closeBtn = el('button', {
    class: 'ccc-ov__btn ccc-ov__btn--icon ccc-ov__btn--close',
    type: 'button',
    'aria-label': 'Close tool and return to the restaurant',
    html: '<span aria-hidden="true">✕</span>'
  });

  

  
  
  
  const findBtn = el('button', {
    class: 'ccc-ov__btn ccc-ov__btn--find',
    type: 'button',
    'aria-label': 'Find another tool',
    html: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>'
  });

  const bar = el('header', { class: 'ccc-ov__bar' }, [
    el('div', { class: 'ccc-ov__id' }, [title, blurb]),
    el('div', { class: 'ccc-ov__actions' }, [findBtn, closeBtn])
  ]);

  const skel = el('div', { class: 'ccc-ov__skel', 'aria-hidden': 'true', hidden: true }, [
    el('div', { class: 'ccc-sk ccc-sk--title' }),
    el('div', { class: 'ccc-sk--tiles' }, [
      el('div', { class: 'ccc-sk--tile' }), el('div', { class: 'ccc-sk--tile' }),
      el('div', { class: 'ccc-sk--tile' }), el('div', { class: 'ccc-sk--tile' })
    ]),
    el('div', { class: 'ccc-sk ccc-sk--body' })
  ]);

  const frame = makeStageFrame();

  
  

  const fbTitle = el('h3', { class: 'ccc-ov__fb-title' });
  const fbCopy = el('p', { class: 'ccc-ov__fb-copy' });
  const fbWait = el('button', { class: 'ccc-ov__btn ccc-ov__btn--primary', type: 'button', text: 'Keep waiting', hidden: true });
  const fbGo = el('button', { class: 'ccc-ov__btn ccc-ov__btn--primary', type: 'button', text: 'Open it in its own window', hidden: true });
  const fbRetry = el('button', { class: 'ccc-ov__btn', type: 'button', text: 'Try again here' });
  const fbBack = el('button', { class: 'ccc-ov__btn', type: 'button', text: 'Back to the restaurant' });

  const fallback = el('div', { class: 'ccc-ov__fallback', hidden: true }, [
    el('div', { class: 'ccc-ov__fb-mark', 'aria-hidden': 'true', text: '⧉' }),
    fbTitle, fbCopy,
    el('div', { class: 'ccc-ov__fb-actions' }, [fbWait, fbGo, fbRetry, fbBack])
  ]);

  
  const noteText = el('span', { class: 'ccc-ov__note-text' });
  const noteAct = el('button', { class: 'ccc-ov__btn ccc-ov__btn--sm', type: 'button', text: 'Reload it' });
  const note = el('div', { class: 'ccc-ov__note', hidden: true }, [noteText, noteAct]);

  const status = el('p', { class: 'ccc-sr', role: 'status', 'aria-live': 'polite' });

  const stage = el('div', { class: 'ccc-ov__stage' }, [frame, skel, fallback, note]);
  const panel = el('div', { class: 'ccc-ov__panel' }, [bar, stage, status]);

  const root = el('div', {
    class: 'ccc-ov',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'ccc-ov-title',
    'aria-describedby': 'ccc-ov-blurb',
    hidden: true
  }, [el('div', { class: 'ccc-ov__scrim' }), panel]);

  document.body.append(root);

  
  closeBtn.addEventListener('click', () => closeTool());
  findBtn.addEventListener('click', () => {
    try { document.dispatchEvent(new CustomEvent('ccc:find-open', { detail: { source: 'viewer' } })); }
    catch {   }
  });
  fbBack.addEventListener('click', () => closeTool());
  fbRetry.addEventListener('click', () => {
    const tool = getTool(state.activeSlug);
    if (tool) showFrame(tool, { force: true });
  });
  fbWait.addEventListener('click', () => {
    const tool = getTool(state.activeSlug);
    if (tool) keepWaiting(tool);
  });
  fbGo.addEventListener('click', () => {
    const tool = getTool(state.activeSlug);
    
    
    if (!tool || isClientHosted(tool.url)) return;
    const win = openNewTab(freshUrl(tool.url));
    ui_status(win
      ? `${tool.label} opened in its own window.`
      : `The browser blocked the window. Allow pop-ups for this site and try again.`);
  });
  
  root.addEventListener('mousedown', (ev) => {
    if (ev.target === root || ev.target.classList.contains('ccc-ov__scrim')) closeTool();
  });
  root.addEventListener('keydown', trapFocus);

  noteAct.addEventListener('click', () => {
    const tool = getTool(state.activeSlug);
    if (tool) showFrame(tool, { force: true });
  });

  state.ui = {
    root, panel, title, blurb, closeBtn, findBtn, bar,
    stage, frame, skel, fallback, status,
    fbTitle, fbCopy, fbWait, fbGo, fbRetry, fbBack,
    note, noteText, noteAct
  };
  return state.ui;
}

 
function ui_status(text) {
  if (state.ui) state.ui.status.textContent = text;
}






function makeStageFrame() {
  return el('iframe', {
    class: 'ccc-ov__frame',
    title: 'Tool',
    allow: 'clipboard-write; fullscreen; geolocation; accelerometer; gyroscope; magnetometer; autoplay; gamepad',
    referrerpolicy: 'no-referrer-when-downgrade'
  });
}



 
function setImmersive(on) {
  if (state.ui) state.ui.root.classList.toggle('is-immersive', !!on);
}

function navigateStageFrame(ui, url) {
  setImmersive(false);
  const fresh = makeStageFrame();
  ui.frame.replaceWith(fresh);          
  ui.frame = fresh;
  fresh.src = freshUrl(url);            
  return fresh;
}



function blankStageFrame(ui) {
  if (!ui || !ui.frame) return;
  ui.frame.onload = ui.frame.onerror = null;
  setImmersive(false);
  const fresh = makeStageFrame();
  ui.frame.replaceWith(fresh);
  ui.frame = fresh;
}

function clearFrameTimer() {
  if (state.frameTimer) { clearTimeout(state.frameTimer); state.frameTimer = 0; }
  if (state.slowTimer) { clearTimeout(state.slowTimer); state.slowTimer = 0; }
  if (state.skelTimer) { clearTimeout(state.skelTimer); state.skelTimer = 0; }
}




function onFrameMessage(event) {
  const ui = state.ui;
  if (!ui || !ui.frame || state.activeSlug === null) return;
  
  if (!ui.frame.contentWindow || event.source !== ui.frame.contentWindow) return;

  const d = event.data;
  if (!d || typeof d !== 'object') return;

  

  if ((d.source === 'ccc-tool' || d.source === 'ccc-board') &&
      (d.state === 'painted' || d.state === 'loading' || d.state === 'ready' || d.state === 'error')) {
    const rc = state.revealCurrent;
    if (rc && rc.frame === ui.frame) rc.reveal('message');
    return;
  }

  

  if ((d.source === 'ccc-tool' || d.source === 'ccc-station') &&
      (d.action === 'escape' || d.action === 'find')) {
    if (d.action === 'escape') closeTool();
    else {
      try { document.dispatchEvent(new CustomEvent('ccc:find-open', { detail: { source: 'frame' } })); }
      catch {   }
    }
    return;
  }

  
  
  
  
  if (d.source === 'ccc-arcade' && d.action === 'immersive') {
    setImmersive(d.on === true);
    return;
  }

  if (d.source !== 'ccc-arcade' || d.action !== 'open-tool') return;

  const asked = typeof d.slug === 'string' ? d.slug : '';
  
  const known = /^[A-Za-z0-9_-]+$/.test(asked) ? getTool(asked) : null;
  if (!known) {
    console.warn(`[overlay] arcade asked for an unknown tool "${asked}"; ignored.`);
    return;
  }
  const slug = known.slug;

  
  
  try { event.source.postMessage({ source: 'ccc-arcade-host', ok: true, slug }, location.origin); }
  catch {   }

  
  
  
  
  openTool(slug, { source: 'api' });
}






function showNote(text, tool, opts = {}) {
  const ui = state.ui;
  if (!ui) return;
  const { reload = false, reloadLabel = 'Reload it' } = opts;
  ui.noteText.textContent = text;
  ui.noteAct.hidden = !reload;
  if (reload) ui.noteAct.textContent = reloadLabel;
  ui.note.hidden = false;
}

function hideNote() {
  if (state.ui) state.ui.note.hidden = true;
}






function keepWaiting(tool) {
  const ui = state.ui;
  if (!ui) return;
  

  const rc = state.revealCurrent;
  if (rc && rc.frame === ui.frame && rc.arrived()) { rc.reveal('wait'); return; }
  if (state.skelTimer) { clearTimeout(state.skelTimer); state.skelTimer = 0; }
  ui.fallback.hidden = true;
  ui.skel.hidden = false;
  showNote(`Still loading ${tool.label}. It will appear here as soon as it lands.`, tool,
    { reload: true, reloadLabel: 'Start it again' });
  ui.status.textContent = `Still loading ${tool.label}.`;
  try { ui.closeBtn.focus({ preventScroll: true }); } catch { ui.closeBtn.focus(); }
}



function looksBlocked(frame, url) {
  if (!isCrossOrigin(url)) return false;

  let doc;
  try {
    const win = frame.contentWindow;
    if (!win) return true;                                   
    doc = win.document;                                      
  } catch {
    

    return false;
  }

  
  
  if (!doc) return true;
  if (doc.location && doc.location.href === 'about:blank') return true;
  if (!doc.body) return true;
  return doc.body.childElementCount === 0 && !doc.body.textContent.trim();
}



function showFallback(tool, reason, opts = {}) {
  const { keepFrame = false, announce = null } = opts;
  const ui = state.ui;
  clearFrameTimer();
  hideNote();
  if (!keepFrame) {
    ui.frame.classList.remove('is-shown');
    blankStageFrame(ui);                
  }
  ui.skel.hidden = true;
  ui.fallback.hidden = false;

  ui.fbTitle.textContent = tool.label;
  ui.fbCopy.textContent = reason;
  
  ui.fbWait.hidden = !keepFrame;
  
  
  const leaveable = !isClientHosted(tool.url) && (!!tool.external_only || isKnownUnframeable(tool.url));
  ui.fbGo.hidden = !leaveable;
  
  ui.fbRetry.hidden = isKnownUnframeable(tool.url);
  ui.status.textContent = announce ||
    `${tool.label} can't be shown right now. You can try again or go back to the restaurant.`;

  
  
  if (!ui.panel.contains(document.activeElement)) {
    const primary = [ui.fbWait, ui.fbGo, ui.fbRetry, ui.fbBack].find((b) => !b.hidden) || ui.closeBtn;
    primary.focus();
  }
}



function showFrame(tool, { force = false } = {}) {
  const ui = state.ui;
  clearFrameTimer();

  ui.fallback.hidden = true;
  hideNote();
  ui.frame.classList.remove('is-shown');
  ui.skel.hidden = true;                        
  ui.status.textContent = `Loading ${tool.label}…`;
  state.revealCurrent = null;

  
  
  
  
  if (!force && isKnownUnframeable(tool.url)) {
    showFallback(
      tool,
      `${tool.label} cannot be displayed inside the site. It opens in its own window — you'll come straight back here when you're done.`
    );
    return;
  }

  let settled = false;          
  let confirmed = null;         
  let preflightLength = -1;     
  let spoke = false;            
  let loadedAt = 0;             
  let probing = false;          
  let holding = false;          

  

  const reveal = (why) => {
    if (frame !== ui.frame) return;                
    if (frame.classList.contains('is-shown') && ui.fallback.hidden) return;
    if (why === 'message') spoke = true;
    
    
    
    if (!spoke && looksBlocked(frame, tool.url)) {
      settled = true;
      showFallback(tool, `${tool.label} refused to load inside the site.`);
      return;
    }
    settled = true;
    holding = false;
    clearFrameTimer();
    hideNote();
    ui.skel.hidden = true;
    

    if (!ui.fallback.hidden && ui.fallback.contains(document.activeElement)) {
      try { ui.closeBtn.focus({ preventScroll: true }); } catch { ui.closeBtn.focus(); }
    }
    ui.fallback.hidden = true;
    frame.classList.add('is-shown');
    

    ui.status.textContent = (spoke || confirmed === 'ok' || !isCrossOrigin(tool.url))
      ? `${tool.label} loaded.`
      : (confirmed === null
        ? `${tool.label} is open.`
        : `${tool.label} is open in the viewer. If it looks empty, close it and open it again.`);
    maybeWarnRefused();
  };

  const onLoad = () => {
    
    setTimeout(() => {
      if (frame !== ui.frame) return;
      loadedAt = Date.now();
      if (spoke || (frame.classList.contains('is-shown') && ui.fallback.hidden)) return;
      
      
      if (!probing && confirmed === null && loadedAt - startedAt < PROBE_FAST_LOAD_MS) {
        holding = true;
        runPreflight();
        window.setTimeout(() => { if (holding) reveal('load'); }, PROBE_HOLD_MS);
        return;
      }
      if (holding) return;                         
      reveal('load');
    }, 120);
  };

  

  function maybeWarnRefused() {
    if (spoke) return;                              
    if (!isCrossOrigin(tool.url)) return;
    if (confirmed !== 'ok') return;                 
    if (!(preflightLength >= 500 * 1024)) return;
    if (!loadedAt || loadedAt - startedAt > 200) return;
    if (!frame.classList.contains('is-shown') || !ui.fallback.hidden) return;
    showNote(
      `${tool.label} may not be allowed to show inside the site — if the panel below stays blank, close it and try again.`,
      tool,
      { reload: true, reloadLabel: 'Try again' }
    );
  }

  const onError = () => {
    if (settled || frame !== ui.frame) return;
    settled = true;
    showFallback(tool, `${tool.label} couldn't be reached. Try again in a moment.`);
  };

  
  const startedAt = Date.now();
  const frame = navigateStageFrame(ui, tool.url);
  frame.title = `${tool.label} — live tool`;
  frame.onload = onLoad;
  frame.onerror = onError;
  state.revealCurrent = { frame, reveal, arrived: () => spoke || loadedAt > 0 };

  state.skelTimer = window.setTimeout(() => {
    state.skelTimer = 0;
    if (frame !== ui.frame || frame.classList.contains('is-shown') || !ui.fallback.hidden) return;
    ui.skel.hidden = false;
  }, SKEL_DELAY_MS);

  

  function runPreflight(timeoutMs) {
    if (probing) return;
    probing = true;
    preflight(tool.url, timeoutMs ? { timeoutMs } : undefined).then(onVerdict);
  }

  function onVerdict(v) {
    if (frame !== ui.frame || state.activeSlug === null) return;   
    confirmed = v.verdict;
    preflightLength = v.length;

    

    if (v.verdict === 'gone' || v.verdict === 'empty') {
      settled = true; holding = false;
      showFallback(tool, preflightCopy(v, tool.label), {
        announce: `${tool.label} could not be opened: the server did not return the tool.`
      });
      return;
    }

    if (v.verdict === 'unreachable') {
      

      settled = true; holding = false;
      showFallback(tool, preflightCopy(v, tool.label), {
        keepFrame: true,
        announce: `${tool.label} could not be reached. Still trying behind this card.`
      });
      return;
    }

    if (holding) {
      
      
      reveal('load');
      return;
    }

    if (settled) {
      
      
      if (v.verdict === 'ok' && ui.fallback.hidden && frame.classList.contains('is-shown')) {
        ui.status.textContent = `${tool.label} loaded.`;
        maybeWarnRefused();     
      }
      return;
    }

    if (v.verdict === 'slow') {
      

      showFallback(tool, `${tool.label} is not answering. It may be the network rather than the tool — if you are on store wifi, check you are past the sign-in page.`,
        { keepFrame: true,
          announce: `${tool.label} is not answering. Still trying behind this card.` });
    }
    
  }

  

  state.slowTimer = window.setTimeout(() => {
    if (settled || frame !== ui.frame) return;
    

    showNote(
      `Still loading ${tool.label}. On a store connection this can take a little while — it will appear here as soon as it is ready.`,
      tool
    );
    ui.status.textContent = `${tool.label} is still loading.`;
    runPreflight(HANG_PROBE_TIMEOUT_MS);          
  }, SLOW_NOTE_MS);

  state.frameTimer = window.setTimeout(() => {
    if (settled || frame !== ui.frame) return;
    showFallback(tool,
      `${tool.label} is still coming down after ${Math.round(FRAME_TIMEOUT_MS / 1000)} seconds. It may be the connection — it is still loading behind this card and will appear if it lands.`,
      { keepFrame: true,
        announce: `${tool.label} is taking a long time. Still loading behind this card; you can keep waiting or start it again.` });
  }, FRAME_TIMEOUT_MS);
}




function hashSlug() {
  const m = HASH_RE.exec(location.hash || '');
  return m ? m[1] : null;
}



function refuseTool(slug, tool, { trigger = null, source = 'api' } = {}) {
  
  
  if (state.activeSlug === null && (hashSlug() || '').toLowerCase() === slug.toLowerCase()) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch {   }
  }

  
  
  const retry = () => openTool(slug, { trigger, bypassGate: true });
  const detail = { slug, tool, trigger, source, retry };

  try {
    document.dispatchEvent(new CustomEvent('ccc:tool-refused', { bubbles: true, detail }));
  } catch {   }

  if (typeof state.onRefused === 'function') {
    try { state.onRefused(slug, detail); } catch (err) { console.error('[overlay] onRefused threw:', err); }
  }
}



function announceViewer(kind, slug, tool) {
  try {
    document.dispatchEvent(new CustomEvent(`ccc:viewer-${kind}`, {
      bubbles: false,
      detail: { slug: slug || null, tool: tool || null }
    }));
  } catch {   }
}






function triggerPoint(trigger) {
  if (!trigger || !trigger.isConnected || typeof trigger.getBoundingClientRect !== 'function') return null;
  const r = trigger.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return null;
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;
  return { x, y };
}



function setOrigin(ui, pt) {
  const s = ui.panel.style;
  const left = ui.panel.offsetLeft;
  const top = ui.panel.offsetTop;
  if (!pt) { s.removeProperty('--ccc-ov-ox'); s.removeProperty('--ccc-ov-oy'); return; }
  s.setProperty('--ccc-ov-ox', `${Math.round(pt.x - left)}px`);
  s.setProperty('--ccc-ov-oy', `${Math.round(pt.y - top)}px`);
}



function afterPanelFade(ui, gen, ms, cb, { patient = false } = {}) {
  let done = false;
  let tries = 0;
  let timer = 0;
  const onEnd = (ev) => { if (ev.target === ui.panel && ev.propertyName === 'opacity') finish(); };
  const finish = () => {
    if (done) return;
    done = true;
    ui.panel.removeEventListener('transitionend', onEnd);
    clearTimeout(timer);
    if (state.gen === gen) cb();
  };
  const stillMoving = () => {
    try {
      return ui.panel.getAnimations().some((a) => a.playState === 'running' || a.playState === 'pending');
    } catch { return false; }
  };
  const onTimer = () => {
    if (done) return;
    if (patient && state.gen === gen && stillMoving() && tries++ < 30) { timer = window.setTimeout(onTimer, 120); return; }
    finish();
  };
  ui.panel.addEventListener('transitionend', onEnd);
  timer = window.setTimeout(onTimer, ms + 80);
  return timer;
}



function afterTwoFrames(cb) {
  let done = false;
  const go = () => { if (done) return; done = true; clearTimeout(timer); cb(); };
  const timer = window.setTimeout(go, 300);
  try { requestAnimationFrame(() => requestAnimationFrame(go)); } catch {   }
}

 
function beginOpen(ui, origin) {
  const gen = ++state.gen;
  const tier = motionTier();
  state.phase = 'opening';
  ui.root.classList.remove('is-in', 'is-closing', 'is-immersive');
  ui.root.hidden = false;
  liveRoot(ui);
  
  setOrigin(ui, tier === 'full' ? origin : null);
  ui.root.classList.add('is-in');
  if (tier === 'off') { settleOpen(gen); return; }
  state.lockTimer = afterPanelFade(ui, gen, OPEN_MS[tier], () => settleOpen(gen), { patient: true });
}



function reopenFromClosing(ui) {
  const gen = ++state.gen;            
  const tier = motionTier();
  state.phase = 'opening';
  ui.root.hidden = false;
  liveRoot(ui);
  ui.root.classList.remove('is-closing');
  ui.root.classList.add('is-in');     
  if (tier === 'off') { settleOpen(gen); return; }
  state.lockTimer = afterPanelFade(ui, gen, OPEN_MS[tier], () => settleOpen(gen), { patient: true });
}



function settleOpen(gen) {
  if (state.gen !== gen || state.phase !== 'opening') return;
  state.lockTimer = 0;
  setViewing(true);
  setBackgroundInert(true);
  lockScroll();
  state.phase = 'open';
}



function finishClose(gen) {
  if (state.gen !== gen || state.phase !== 'closing') return;
  const ui = state.ui;
  state.phase = 'closed';
  state.finishTimer = 0;
  if (!ui) return;
  ui.root.hidden = true;
  ui.root.classList.remove('is-in', 'is-closing', 'is-immersive');
  blankStageFrame(ui);                           
  ui.fallback.hidden = true;
  ui.skel.hidden = true;
  hideNote();
}

 
function crossFadeTitle(ui) {
  if (motionTier() === 'off' || typeof ui.title.animate !== 'function') return;
  try {
    ui.title.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: 160, easing: 'cubic-bezier(.22,.61,.24,1)' });
  } catch {   }
}

function clearCloseWatch() {
  if (state.closeWatch) { clearTimeout(state.closeWatch); state.closeWatch = 0; }
}



export function openTool(slug, opts = {}) {
  const { history: doPush = true, trigger = null, bypassGate = false, source = 'api', replace = false } = opts;
  const tool = getTool(slug);

  if (!tool) {
    
    if (!state.ready) { whenReady().then(() => openTool(slug, opts)); return; }
    console.warn(`[overlay] unknown tool "${slug}"`);
    return;
  }
  
  
  slug = tool.slug;

  
  
  
  
  
  
  if (!bypassGate && typeof state.canOpen === 'function') {
    let allowed = false;
    try { allowed = !!state.canOpen(slug, tool); }
    catch (err) { console.error('[overlay] canOpen threw; refusing:', err); }
    if (!allowed) { refuseTool(slug, tool, { trigger, source }); return; }
  }

  
  
  
  
  
  
  
  
  
  
  
  if (tool.external_only && !isClientHosted(tool.url)) {
    
    
    
    
    
    const win = openNewTab(freshUrl(tool.url));
    if (win) return;                             
    
    
  }

  const from = state.phase;
  const swapping = from === 'opening' || from === 'open';
  
  const origin = !swapping && from !== 'closing' && motionTier() === 'full' ? triggerPoint(trigger) : null;

  injectStyles();
  const ui = buildUI();

  state.activeSlug = slug;
  ui.title.textContent = tool.label;
  ui.blurb.textContent = tool.blurb || '';
  state.openedAt = Date.now();
  state.staleOffered = false;
  clearCloseWatch();

  if (swapping || from === 'closing') crossFadeTitle(ui);
  if (!swapping) {
    state.lastFocus = trigger || document.activeElement;
    document.addEventListener('keydown', onKeydown, true);
    if (from === 'closing') reopenFromClosing(ui);
    else beginOpen(ui, origin);
    startViewportWatch();
    announceViewer('open', slug, tool);
  }

  if (tool.external_only && !isClientHosted(tool.url)) {
    showFallback(tool, `${tool.label} opens in its own window.`);
  } else {
    showFrame(tool);
  }

  if (doPush && swapping && replace) {
    
    
    
    
    try { history.replaceState({ cccTool: slug }, '', internalHref(slug)); } catch {   }
  } else if (doPush) {
    try {
      history.pushState({ cccTool: slug }, '', internalHref(slug));
      state.pushedHistory = true;
    } catch { state.pushedHistory = false; }
  }

  
  
  
  if (!swapping) requestAnimationFrame(() => {
    if (state.activeSlug === null) return;
    if (!ui.panel.contains(document.activeElement)) ui.closeBtn.focus();
  });
}



export function closeTool(opts = {}) {
  const { history: useHistory = true } = opts;
  if (state.activeSlug === null) return;

  
  
  
  if (useHistory && state.pushedHistory) {
    state.pushedHistory = false;
    const slug = state.activeSlug;
    history.back();
    

    clearCloseWatch();
    state.closeWatch = window.setTimeout(() => {
      state.closeWatch = 0;
      if (state.activeSlug !== slug) return;
      const still = getTool(hashSlug() || '');
      if (!still || still.slug !== slug) return;
      try { history.replaceState(null, '', location.pathname + location.search); } catch {   }
      teardown();
    }, 400);
    return;
  }

  
  
  if (useHistory && !state.pushedHistory && hashSlug()) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  }

  teardown();
}

function teardown() {
  const ui = state.ui;
  const slug = state.activeSlug;
  state.activeSlug = null;
  state.pushedHistory = false;
  clearFrameTimer();
  clearCloseWatch();
  stopViewportWatch();
  state.revealCurrent = null;
  document.removeEventListener('keydown', onKeydown, true);
  const gen = ++state.gen;                       
  state.lockTimer = 0;

  if (!ui) {
    setBackgroundInert(false);
    unlockScroll();
    setViewing(false);
    state.phase = 'closed';
    announceViewer('close', slug, slug ? getTool(slug) : null);
    return;
  }

  state.phase = 'closing';
  ui.root.classList.add('is-closing');           
  ui.frame.onload = ui.frame.onerror = null;
  

  if (!ui.frame.classList.contains('is-shown')) blankStageFrame(ui);
  ui.status.textContent = '';
  ui.note.hidden = true;
  state.openedAt = 0;
  state.staleOffered = false;

  

  setBackgroundInert(false);
  unlockScroll();
  setViewing(false);
  announceViewer('close', slug, slug ? getTool(slug) : null);
  restoreFocus(slug);

   
  afterTwoFrames(() => {
    if (state.gen !== gen || state.phase !== 'closing') return;
    const tier = motionTier();
    if (tier === 'off') { finishClose(gen); return; }
    ui.root.classList.remove('is-in');
    state.finishTimer = afterPanelFade(ui, gen, CLOSE_MS[tier], () => finishClose(gen));
  });
}

function restoreFocus(slug) {
  let target = state.lastFocus;
  state.lastFocus = null;
  if (!target || !target.isConnected) {
    target = slug ? document.querySelector(`[data-tool="${CSS.escape(slug)}"]`) : null;
  }
  if (target && typeof target.focus === 'function') {
    
    try { target.focus({ preventScroll: true }); } catch { target.focus(); }
  }

  

  if (target && document.activeElement === target) return;   
  

  const fallback = document.getElementById('c3-button') || document.querySelector('.skip-link');
  if (fallback && typeof fallback.focus === 'function') {
    try { fallback.focus({ preventScroll: true }); } catch { fallback.focus(); }
  }
}



function onViewerVisible() {
  if (state.activeSlug === null || !state.ui) return;
  const tool = getTool(state.activeSlug);
  if (!tool) return;
  if (state.staleOffered || !state.openedAt) return;
  if (Date.now() - state.openedAt < STALE_AFTER_MS) return;
  if (!state.ui.fallback.hidden) return;        
  state.staleOffered = true;
  const mins = Math.round((Date.now() - state.openedAt) / 60000);
  showNote(
    `You have had ${tool.label} open for about ${mins} minutes. Reload it if you need today's numbers — anything you have typed into it will be lost.`,
    tool,
    { reload: true, reloadLabel: 'Reload it' }
  );
}

function onKeydown(ev) {
  if (ev.key === 'Escape' && state.activeSlug !== null) {
    

    const t = ev.target;
    if (t && t.closest && t.closest('[data-ccc-keep-live]')) return;
    ev.preventDefault();
    ev.stopPropagation();
    closeTool();
  }
}



let vvHandler = null;
let vvRaf = 0;

function fitToVisualViewport() {
  vvRaf = 0;
  const ui = state.ui;
  const vv = window.visualViewport;
  if (!ui || !vv) return;
  const s = ui.root.style;
  const zoomed = Math.abs((vv.scale || 1) - 1) > 0.01;
  const shrunk = !zoomed && vv.height > 0 && vv.height < (window.innerHeight || 0) - 1;
  if (shrunk) {
    s.setProperty('--ccc-ov-vh', `${Math.round(vv.height)}px`);
    s.top = `${Math.max(0, Math.round(vv.offsetTop))}px`;
    s.height = `${Math.round(vv.height)}px`;
    s.bottom = 'auto';
  } else if (s.height) {
    s.removeProperty('--ccc-ov-vh');
    s.top = s.height = s.bottom = '';
  }
}

function startViewportWatch() {
  const vv = window.visualViewport;
  if (!vv || vvHandler) return;
  let coarse = false;
  try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch { coarse = false; }
  if (!coarse) return;
  vvHandler = () => { if (!vvRaf) vvRaf = requestAnimationFrame(fitToVisualViewport); };
  vv.addEventListener('resize', vvHandler);
  vv.addEventListener('scroll', vvHandler);
}

function stopViewportWatch() {
  const vv = window.visualViewport;
  if (vv && vvHandler) {
    vv.removeEventListener('resize', vvHandler);
    vv.removeEventListener('scroll', vvHandler);
  }
  vvHandler = null;
  if (vvRaf) { cancelAnimationFrame(vvRaf); vvRaf = 0; }
  const ui = state.ui;
  if (ui && ui.root.style.height) {
    ui.root.style.removeProperty('--ccc-ov-vh');
    ui.root.style.top = ui.root.style.height = ui.root.style.bottom = '';
  }
}






function canonicaliseLocation() {
  const raw = hashSlug();
  if (!raw) return null;
  const tool = getTool(raw);
  if (!tool || tool.slug === raw) return raw;
  try {
    history.replaceState(history.state, '', location.pathname + location.search + internalHref(tool.slug));
  } catch {   }
  return tool.slug;
}

 
function syncFromLocation() {
  const slug = canonicaliseLocation();
  if (slug) {
    if (slug === state.activeSlug) return;
    
    
    const had = state.activeSlug !== null;
    openTool(slug, { history: false, source: 'hash' });
    
    if (state.activeSlug === slug) state.pushedHistory = had || state.pushedHistory;
  } else if (state.activeSlug !== null) {
    closeTool({ history: false });
  }
}




function onDocumentClick(ev) {
  
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

  const trigger = ev.target.closest && ev.target.closest('[data-tool]');
  if (!trigger) return;

  const slug = trigger.getAttribute('data-tool');
  if (!slug) return;

  
  if (state.ui && state.ui.root.contains(trigger)) return;

  ev.preventDefault();
  
  
  let fromPalette = false;
  try {
    fromPalette = ev.composedPath().some((n) => n && n.nodeType === 1 && n.hasAttribute('data-ccc-keep-live'));
  } catch {   }
  openTool(slug, { trigger, source: 'click', replace: fromPalette });
}

 
function onDocumentKeydown(ev) {
  if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
  const trigger = ev.target.closest && ev.target.closest('[data-tool]');
  if (!trigger || !trigger.hasAttribute('data-tool')) return;
  const tag = trigger.tagName;
  if (tag === 'A' || tag === 'BUTTON') return;      
  if (state.ui && state.ui.root.contains(trigger)) return;
  ev.preventDefault();
  openTool(trigger.getAttribute('data-tool'), { trigger, source: 'click' });
}






export function initOverlay(options = {}) {
  const {
    tools = null,
    toolsUrl = 'data/tools.6f26bfbc4c.json',
    deepLink = true,
    canOpen = null,
    onRefused = null
  } = options;

  state.canOpen = typeof canOpen === 'function' ? canOpen : null;
  state.onRefused = typeof onRefused === 'function' ? onRefused : null;

  injectStyles();

  if (!state.initialised) {
    state.initialised = true;
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeydown);
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    

    window.addEventListener('message', onFrameMessage);
    

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { selfHeal(); onViewerVisible(); }
    });
    window.addEventListener('pageshow', (ev) => { selfHeal(); if (ev.persisted) onViewerVisible(); });
    

    watchTriggerLinks();
  }

  

  const inlineTools =
    (window.__CCC_INLINE__ && window.__CCC_INLINE__.tools) ||
    (window.CCC && window.CCC.tools) || window.CCC_TOOLS || null;

  

  const syncList = Array.isArray(tools) ? tools : (tools && Array.isArray(tools.tools) ? tools.tools : null);
  if (syncList) {
    for (const tool of syncList) if (tool && tool.slug) state.registry.set(tool.slug, tool);
    if (deepLink) canonicaliseLocation();
  }

  const load = tools
    ? Promise.resolve(tools)
    : Promise.resolve(inlineTools)
      .then((inline) => inline || fetch(toolsUrl, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))));

  const ready = load
    .then((data) => {
      const list = Array.isArray(data) ? data : (data && data.tools) || [];
      for (const tool of list) if (tool && tool.slug) state.registry.set(tool.slug, tool);
      markReady();
      if (deepLink) syncFromLocation();          
      return state.registry;
    })
    .catch((err) => {
      console.error('[overlay] could not load tools:', err);
      markReady();                               
      return state.registry;
    });

  return {
    open: (slug, opts) => openTool(slug, opts),
    close: (opts) => closeTool(opts),
    isOpen: () => state.activeSlug !== null,
     
    setGate: (nextCanOpen, nextOnRefused) => {
      state.canOpen = typeof nextCanOpen === 'function' ? nextCanOpen : null;
      state.onRefused = typeof nextOnRefused === 'function' ? nextOnRefused : null;
    },
    registry: state.registry,
    ready
  };
}



