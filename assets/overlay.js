/* =============================================================================
 * Cook County Cooks — v3 "Cinema"
 * assets/overlay.js  ·  Agent B  ·  the full-screen tool viewer
 * -----------------------------------------------------------------------------
 * A tool should never feel like "a github.io link". It should feel like a thing
 * inside the restaurant that you walked up to and switched on.
 *
 *   initOverlay()  — the full-screen tool viewer. Clicking any
 *                    [data-tool="<slug>"] opens that tool in a framed,
 *                    chrome-wrapped, deep-linkable, modal viewer.
 *
 * The room screens used to live here too. They are assets/screens.js now; the
 * only thing that connects the two is `data-tool` on a screen's hit target,
 * which the delegated handler below picks up like any other trigger.
 *
 * Contract notes (see SPEC.md):
 *   · Plain ES module. No dependencies. No build step.
 *   · Only transform / opacity / filter are animated.
 *   · This module never writes the engine's stage vars and never sets
 *     `transform` on `.plate-wrap`. It owns its own layers only.
 *   · prefers-reduced-motion is honoured for every animation here.
 *
 * Exports:
 *   initOverlay(options)  -> { open, close, isOpen, setGate, registry, ready }
 *   openTool(slug), closeTool()
 * ========================================================================== */

/* FRESH-LOAD CACHE BUSTING — moved to its own module so the phone's pocket
 * list can use it without loading this file. The rationale, the client quote
 * and the reason same-origin URLs are left alone are all in freshurl.js.
 * Re-exported here because screens.js imports it from this module. */
import { freshUrl } from './freshurl.js';
export { freshUrl };

/* ASK THE SERVER, DO NOT ASK THE IFRAME. preflight() is the only thing in this
 * build that can tell a tool that loaded from a tool that 404'd — the iframe
 * cannot, and §6 below carries the twelve-shape measurement that proves it.
 * Its own file because screens.js needs it too and must not import this one. */
import { preflight, preflightCopy } from './preflight.js';
export { preflight };


/* -----------------------------------------------------------------------------
 * 0. Constants & tiny helpers
 * -------------------------------------------------------------------------- */

/**
 * THE FRAME BUDGET, AND WHY IT IS THIRTY SECONDS AND NOT SIX.
 *
 * This was 6000, and 6000 was shorter than the tool takes to load. The 6th Gen
 * quote sheet is 1,307,626 bytes of self-contained HTML (measured:
 * content-length on the live URL) and it pulls html2canvas and jspdf from a CDN
 * on top of that; an iframe's `load` waits for all of it. Document load,
 * measured against the live URL under throttling:
 *
 *     LTE        12.9 s
 *     fast 3G    13.3 s
 *     slow 3G    26.1 s
 *
 * Not one of them is under six seconds. So the watchdog was firing on tools
 * that were working — and firing it went through showFallback() -> blankStage-
 * Frame(), which REPLACES the iframe element and throws the in-flight download
 * away seconds from done. "Try again here" then started from zero.
 *
 * Two changes, and the second matters more than the first:
 *   · 30 s, which clears the slowest measurement above with room for a cold
 *     cellular fetch of the CDN scripts;
 *   · the deadline is no longer a VERDICT. At SLOW_NOTE_MS the viewer says it
 *     is a large document; at FRAME_TIMEOUT_MS it puts the card up but KEEPS
 *     THE FRAME LOADING behind it, so a download that lands at 34 s still gets
 *     shown. Nothing is discarded on a timer any more.
 * The genuinely dead cases do not wait for either clock — preflight() answers
 * them in a round trip.
 *
 * v15: THERE IS NO "OPEN IN A NEW TAB" ANY MORE, ANYWHERE IN THIS VIEWER.
 * The client: "I would like to eliminate the option to launch these
 * repositories in a separate window. I don't want people to be able to see my
 * repositories on the site. I want the links and my github to be more or less
 * private, and look like these are just part of the website." So the chrome
 * bar, the fallback card and the note bar all lost their new-tab link, the
 * fallback card no longer prints the host, and every rep-facing sentence in
 * this file names the TOOL rather than the server it came from. What a rep
 * gets when a tool cannot be framed is "Try again here", "Keep waiting" (when
 * the download is still running behind the card) and "Back to the restaurant"
 * — never an address. See showFallback() for why that is the honest offer.
 */
const FRAME_TIMEOUT_MS = 30000;

/** When to stop looking like nothing is happening and say what is happening.
 *  Six seconds was the old watchdog; it is now the point at which the viewer
 *  admits the document is big and says so on the note bar. */
const SLOW_NOTE_MS = 6000;

/** A tool the rep opened before lunch is still the pre-lunch document: an
 *  iframe is not reloaded by anything when a tab is merely backgrounded. After
 *  this long out of sight, the viewer OFFERS a reload on return. It offers and
 *  does not take: these tools are data entry (the quote sheets are half an
 *  hour of a rep's typing) and silently reloading one would throw that away. */
const STALE_AFTER_MS = 10 * 60 * 1000;

/** Deep-link shape: #/tool/<slug> */
const HASH_RE = /^#\/tool\/([A-Za-z0-9_-]+)\/?$/;

/* v29 motion (design audit M7). Twins of the durations in STYLES, used only as
 * safety nets behind the panel's own `transitionend` (see afterPanelFade). */
const OPEN_MS = { full: 360, lite: 160, off: 0 };
const CLOSE_MS = { full: 160, lite: 160, off: 0 };

/** The dark skeleton only appears if a tool is still not drawn after this long,
 *  so a cached or quick tool never flashes it (design audit P1-7). */
const SKEL_DELAY_MS = 350;

/** O-7: a `load` sooner than this, from a frame that has not said it painted,
 *  is probed before it is shown (every failure shape fires `load` in 8-23 ms);
 *  a slower one is shown and never probed. See showFrame(). */
const PROBE_FAST_LOAD_MS = 1500;

/** How long that probe may hold the reveal; its verdict can still overrule. */
const PROBE_HOLD_MS = 2000;

/** The hang probe goes out at SLOW_NOTE_MS with this timeout: card at ~11 s. */
const HANG_PROBE_TIMEOUT_MS = 5000;

/**
 * Hosts known, in advance, to refuse framing (X-Frame-Options /
 * frame-ancestors). For these we don't burn six seconds of the user's life on
 * a spinner — we go straight to the card, still dressed in our own chrome so
 * it reads as part of cookcountycooks.com.
 *
 * Kept deliberately SHORT. The link audit fetched all 37 URLs: the only
 * genuinely un-frameable tool in the registry is `printouts` (SharePoint),
 * which is already `external_only: true` and never reaches the iframe path.
 * Smartsheet returned 200 with no XFO and no frame-ancestors — it frames fine,
 * so it is NOT listed here. Pre-empting a working tool into a fallback card is
 * a worse bug than a 6s spinner on one that fails; the runtime detection in
 * showFrame() is the real safety net. This list is belt-and-braces only.
 */
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

/** Build an element in one breath. */
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

/** Absolute URL, tolerant of the relative tool paths in tools.json. */
function absUrl(url) {
  try { return new URL(url, document.baseURI); } catch { return null; }
}

function isCrossOrigin(url) {
  const u = absUrl(url);
  return !!u && u.origin !== location.origin;
}

/** Would this URL be pointless to put in an iframe? */
function isKnownUnframeable(url) {
  const u = absUrl(url);
  if (!u) return false;
  return NEVER_FRAMES.some((re) => re.test(u.hostname));
}

/* hostLabel() is gone. It fed the fallback card's eyebrow and the first word
 * of every failure sentence with the tool's hostname, and the client has asked
 * that reps never see where the tools are hosted. The tool's own label is the
 * subject of every sentence now — see preflightCopy() in preflight.js. */

/**
 * The client's own hosting. A tool on one of these hosts is framed and ONLY
 * framed: it is never opened in a new tab or navigated to, whatever its flags
 * say, because the one thing a new tab does that the frame does not is put
 * the repository's address in the rep's address bar. Same test preflight.js
 * uses for CORS_TRUTHFUL, kept separate because the two mean different things.
 */
const CLIENT_HOSTS = [/(^|\.)github\.io$/i, /(^|\.)githubusercontent\.com$/i];

function isClientHosted(url) {
  const u = absUrl(url);
  return !!u && CLIENT_HOSTS.some((re) => re.test(u.hostname));
}

const reduceMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Contract C5: <html data-motion="full|lite|off">, absent = full, and
 *  prefers-reduced-motion always wins. Read on every open/close, never cached:
 *  S6 may demote the tier mid-session. */
function motionTier() {
  if (reduceMotion()) return 'off';
  const m = document.documentElement.getAttribute('data-motion');
  return m === 'lite' || m === 'off' ? m : 'full';
}

/**
 * Open a URL in a new tab, safely. Returns the window, or null if the popup
 * was genuinely blocked. ONLY reachable for `external_only` tools on hosts
 * that are not the client's (SharePoint, Smartsheet) — see openTool().
 *
 * NOTE the missing 'noopener' feature string. Passing it makes window.open
 * return **null by specification even on success**, which makes the return
 * value useless as a popup-blocked signal. We get the same protection by
 * nulling `opener` on the window we just opened.
 */
function openNewTab(url) {
  let win = null;
  try { win = window.open(url, '_blank'); } catch { win = null; }
  if (win) { try { win.opener = null; } catch { /* cross-origin: already safe */ } }
  return win;
}

/** The site's own address for a tool: what a copied link must say. */
function internalHref(slug) {
  return `#/tool/${encodeURIComponent(slug)}`;
}

/**
 * EVERY TRIGGER LINK CARRIES THE SITE'S ADDRESS, NOT THE TOOL'S.
 *
 * A `[data-tool]` trigger is opened by onDocumentClick() below whatever its
 * href says, so the href only ever matters for what the browser does WITHOUT
 * this module: a long-press "Copy Link" on an iPad, a middle-click, a screen
 * reader's link list, a right-click "Open in new tab". The C³ menu's rows were
 * built with `href: tool.url` and `target="_blank"` on the reasoning that the
 * href "keeps it real" — and what it kept real was the repository address, in
 * the exact gestures the client does not want to hand it out through. The
 * pocket list had the same leak by a different route (restamp() overwrote its
 * internal href with the stamped repository URL on every render).
 *
 * This module owns the [data-tool] contract, so it normalises every anchor
 * that carries one: href becomes `#/tool/<slug>`, target and rel come off. A
 * middle-click then opens cookcountycooks.com with the tool framed — which is
 * a FRESH copy, because showFrame() stamps the frame's src on every open, so
 * nothing the old repository href bought is lost. Runs once at init over the
 * whole document and again for anything added later (the C³ list re-renders
 * on a freezer unlock, the pocket list on every keystroke), via one
 * MutationObserver that only looks at added nodes. Measured: 37 anchors
 * rewritten at boot; 0 ms attributable in the profile.
 */
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

/* v29: SCOPED (perf audit §3.9). It used to observe the whole document, so
 * every slide a live board rotated queued records for it. Anchor triggers live
 * only in body children (C³ menu, Find palette) and the phone list (#kitchen >
 * .pocket); the rooms' triggers are <button>s. So <body> is watched shallowly,
 * each child deeply EXCEPT #kitchen, where only a `.pocket` is. */
function watchTriggerLinks() {
  normaliseTriggerLinks(document.body || document.documentElement);
  if (typeof MutationObserver !== 'function' || !document.body) return;
  const DEEP = {
    childList: true, subtree: true,
    // pocket.js used to rewrite href after the fact; if anything else does,
    // the rewrite is undone in the same task.
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

/* -----------------------------------------------------------------------------
 * 1. Module state
 * -------------------------------------------------------------------------- */

const state = {
  /** slug -> tool record from tools.json */
  registry: new Map(),
  /** resolved once the registry is populated */
  ready: false,
  readyWaiters: [],
  /** live DOM of the viewer, built lazily on first open */
  ui: null,
  /** slug currently displayed, or null */
  activeSlug: null,
  /** the element that opened the viewer, so focus can go home */
  lastFocus: null,
  /** true when *we* pushed the #/tool/ entry (so close() can history.back()) */
  pushedHistory: false,
  /** scroll lock bookkeeping */
  scrollY: 0,
  locked: false,
  /** frame watchdog, and the "this is big" note that now precedes it */
  frameTimer: 0,
  slowTimer: 0,
  /** when the current tool was pointed at, so a return to the foreground can
   *  tell "just opened" from "open since before lunch" — see onViewerVisible() */
  openedAt: 0,
  /** true once a return-to-foreground has offered a reload for this open, so
   *  the offer is made once and does not nag on every tab switch */
  staleOffered: false,
  /** optional access gate — see initOverlay({ canOpen, onRefused }) */
  canOpen: null,
  onRefused: null,
  initialised: false,

  /* ── v29 lifecycle: one phase, one flag per side effect, applied only on
     its edge (the P0 inert freeze, perf audit §3.1, came from re-applying).
       phase   'closed' | 'opening' (fading in, not locked) | 'open' (locked)
               | 'closing' (unlocked, fading out)
       inert   background inert, snapshotted on false→true ONLY
       viewing html.is-viewing (contract C1) */
  phase: 'closed',
  inert: false,
  viewing: false,
  /** the opening fade's end: lock + inert + is-viewing (see settleOpen) */
  lockTimer: 0,
  /** the closing fade's end: hide + unload (see finishClose) */
  finishTimer: 0,
  /** bumps on every open/close so a stale timer or rAF can tell it is stale */
  gen: 0,
  /** skeleton delay, and the reveal hook of the frame currently shown (O-3) */
  skelTimer: 0,
  revealCurrent: null,
  /** O-9: the ✕ watchdog for a tool that pushed history of its own */
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

/* C7: slugs are case-insensitive — `#/tool/NPS` used to fall through to the
 * manager keypad (links audit #10). Only registry slugs can match, and a sealed
 * tool is not in the registry until its code is typed, so nothing leaks. */
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

/* -----------------------------------------------------------------------------
 * 2. Stylesheet
 *    Injected once. Everything is prefixed `ccc-` and every colour is a
 *    custom property with a fallback, so assets/theme.css (Agent D) can
 *    retheme the viewer without touching this file.
 * -------------------------------------------------------------------------- */

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

/* -----------------------------------------------------------------------------
 * 3. Scroll lock
 *    The position:fixed technique is the only one that reliably stops
 *    background scroll on iOS Safari — but it *loses the scroll position*
 *    unless you stash and restore it yourself. That restore is the classic
 *    bug; it is handled explicitly here, synchronously, with smooth scrolling
 *    temporarily disabled so the page does not visibly fly back.
 * -------------------------------------------------------------------------- */

function lockScroll() {
  if (state.locked) return;
  state.scrollY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.classList.add('ccc-locked');
  document.body.classList.add('ccc-locked');       // read by engine/screens/motion/find
  document.body.setAttribute('data-ccc-lock', ''); // the geometry (see STYLES)
  document.body.style.top = `-${state.scrollY}px`;
  state.locked = true;
}

function unlockScroll() {
  if (!state.locked) return;
  document.body.classList.remove('ccc-locked');
  document.body.removeAttribute('data-ccc-lock');
  document.body.style.top = '';
  // Restore synchronously, before the browser paints, and without smoothing.
  // behavior 'instant' overrides any CSS scroll-behavior WITHOUT writing a
  // style on <html> (the old save/set/restore of html.style.scrollBehavior
  // restyled the whole document twice per close — G1 D8). Only where CSS
  // scroll-behavior exists at all: an engine without it has no smooth scroll
  // to defeat, and an old one might read an options object as scrollTo(0, 0).
  if ('scrollBehavior' in document.documentElement.style) {
    try { window.scrollTo({ top: state.scrollY, left: 0, behavior: 'instant' }); }
    catch { window.scrollTo(0, state.scrollY); }
  } else {
    window.scrollTo(0, state.scrollY);
  }
  document.documentElement.classList.remove('ccc-locked');
  state.locked = false;
}

/* -----------------------------------------------------------------------------
 * 4. Focus trap + background inerting
 * -------------------------------------------------------------------------- */

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((n) => {
    if (n.hasAttribute('hidden') || n.closest('[hidden]')) return false;
    // offsetParent is null for display:none; position:fixed elements report
    // null too, so fall back to a rect check.
    const r = n.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}

/**
 * Keeps Tab inside the dialog. Note: once focus enters a *cross-origin*
 * iframe we can no longer observe keystrokes — that is a browser boundary,
 * not an oversight. We mitigate it by putting the chrome bar (close button
 * included) BEFORE the frame in DOM order, so Shift+Tab out of the frame
 * lands on the close button.
 */
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
    /* `!contains(active)` on the forward side too: when Tab walks out of the
       cross-origin frame the browser parks focus on <body>, and the next Tab
       from there went back INTO the frame (measured: ✕ → frame → body → frame).
       The close button is the honest landing place after the frame — it is
       first in DOM order and it is the way out. Now: ✕ → frame → body → ✕.
       v29: Find sits before ✕ now, so the landing place is named rather than
       taken as `first`. */
    ev.preventDefault();
    const home = items.includes(state.ui.closeBtn) ? state.ui.closeBtn : first;
    home.focus();
  }
}

/** Hide the rest of the page from assistive tech (and, where supported, from
 *  interaction) while the dialog is up.
 *
 *  v29 — THE P0 FREEZE LIVED HERE (perf audit §3.1). Every call used to
 *  snapshot each node's CURRENT inert as "the state to restore"; a reopen
 *  inside the old close window snapshotted the viewer's own inert, and the
 *  next close restored inert=true on eleven body children — a page that
 *  scrolls and ignores every tap until a reload (race_probe: 3 of 6 probes on
 *  the base build, 0 now). Now: one flag, snapshot only on false→true, restore
 *  only on true→false; only nodes marked data-ccc-inerted are restored; body
 *  children with [data-ccc-keep-live] (the Find palette, C4) are skipped. */
function setBackgroundInert(on) {
  on = !!on;
  if (on === state.inert) return;
  state.inert = on;
  if (on && state.ui) liveRoot(state.ui);
  for (const node of Array.from(document.body.children)) {
    if (state.ui && node === state.ui.root) continue;
    if (on) {
      if (node.hasAttribute('data-ccc-keep-live')) continue;
      /* ALREADY INERT = SOMEONE ELSE'S (v29 fix round, G1 D2). A chef portrait
         (chefwall.js) or the C³ panel (cinema.js) inerts every other body
         child while it is up and releases exactly what it inerted when it
         closes. Snapshotting their inert=true as "the state to restore" put it
         back AFTER they had released it — a tool that arrived by Forward over
         a portrait left eleven body children inert until a reload. Their
         nodes stay theirs; this module restores only what it changed. */
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

/** THE VIEWER'S OWN ROOT IS NEVER INERT (v29 fix round, G1 D2). A modal that
 *  was up when the tool arrived (a chef portrait, the C³ panel) inerted every
 *  other body child, this one included, and inert on the root makes ✕ — and
 *  every tap on the viewer — fall through to <body>. Whoever inerted it still
 *  releases it later (setting false on a live node is harmless). */
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

/** Contract C1: `html.is-viewing` is on for as long as the viewer owns the
 *  page — added with the lock, removed after the unlock and scroll restore.
 *  The engine parks and the screens drop their boards on it; the rule in
 *  STYLES pauses every animation behind the viewer on it. */
function setViewing(on) {
  on = !!on;
  if (on === state.viewing) return;
  state.viewing = on;
  document.documentElement.classList.toggle('is-viewing', on);
}

/**
 * THE PAGE MUST NEVER BE LEFT INERT WITH NO VIEWER ON IT. Belt and braces
 * on pageshow (bfcache) and visibilitychange (throttled timers). It only undoes
 * what this module did (data-ccc-inerted), so it cannot fight the chef wall's
 * own modal.
 */
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

/* -----------------------------------------------------------------------------
 * 5. Building the viewer DOM (once, lazily)
 * -------------------------------------------------------------------------- */

function buildUI() {
  if (state.ui) return state.ui;

  const title = el('h2', { class: 'ccc-ov__title', id: 'ccc-ov-title' });
  // v29: not drawn (ccc-sr), still the dialog's aria-describedby. P2-10.
  const blurb = el('p', { class: 'ccc-ov__blurb ccc-sr', id: 'ccc-ov-blurb' });

  /* The chrome bar used to carry an always-visible "Open in new tab" beside
     the close button, on the argument that a rep should never have to reach a
     failure state to get a real link. The client has since asked for the
     opposite: no way out of the viewer that shows where a tool is hosted.
     v29: the bar carries Find (left) and ✕ (right), both before the frame in
     DOM order, so Shift+Tab out of a cross-origin frame still lands on ✕, and
     trapFocus() sends a forward Tab past the frame back to ✕ as well. */
  const closeBtn = el('button', {
    class: 'ccc-ov__btn ccc-ov__btn--icon ccc-ov__btn--close',
    type: 'button',
    'aria-label': 'Close tool and return to the restaurant',
    html: '<span aria-hidden="true">✕</span>'
  });

  /* v29 Find (design audit §3.4, contract C4): the viewer covers the top bar
     and a framed tool swallows keys, so this button is the way to the palette
     while a tool is open. It only announces; find.js owns the palette, and a
     choice there is a [data-tool] click that reaches openTool() as a swap. */
  // Deliberately NOT .ccc-ov__btn--icon: `.ccc-ov__bar .ccc-ov__btn--icon`
  // has meant "the ✕" to every test script and harness since v3, and Find sits
  // before it in DOM order. It is styled to match below.
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

  // --- fallback card (the un-frameable / not-yet-here path) -----------------
  /* THREE ACTIONS, NONE OF THEM AN ADDRESS.
       Keep waiting   only when the download is still running behind the card
                      (showFallback keepFrame). Lifts the card, leaves the
                      frame alone; onLoad() reveals the tool when it lands.
       Try again here a fresh frame, a fresh stamp, a fresh preflight.
       Back           closeTool().
     The card used to lead with "Open in a new tab" and print the host under
     the title. Both are gone at the client's request. Nothing that a new tab
     could do for a tool on the client's own hosting is lost by that: a 404, a
     500, an empty body and a dead network are the SAME server answering the
     same way in a new tab, and GitHub Pages sends no X-Frame-Options, so the
     one failure a new tab genuinely cures (a host that refuses framing) cannot
     happen to these tools. Hosts that DO refuse framing are not the client's
     (SharePoint, Smartsheet — none in tools.json today). For those, and ONLY
     for those, a fourth button opens the tool in its own window: a SharePoint
     address is not the secret, and a rep with no route to a tool is the one
     outcome worse than any of this. isClientHosted() is the gate, so a tool on
     the client's own hosting can never reach that button whatever its flags. */
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

  // --- the note bar (progress / staleness) ----------------------------------
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

  // --- wiring ---------------------------------------------------------------
  closeBtn.addEventListener('click', () => closeTool());
  findBtn.addEventListener('click', () => {
    try { document.dispatchEvent(new CustomEvent('ccc:find-open', { detail: { source: 'viewer' } })); }
    catch { /* CustomEvent unavailable: nothing to open */ }
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
    // Belt and braces on top of showFallback()'s gate: never for the client's
    // own hosting, whatever put this button on screen.
    if (!tool || isClientHosted(tool.url)) return;
    const win = openNewTab(freshUrl(tool.url));
    ui_status(win
      ? `${tool.label} opened in its own window.`
      : `The browser blocked the window. Allow pop-ups for this site and try again.`);
  });
  // Clicking the scrim (the margin around the panel) closes, like any modal.
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

/** role="status" line, guarded so a click handler can run before buildUI. */
function ui_status(text) {
  if (state.ui) state.ui.status.textContent = text;
}

/* -----------------------------------------------------------------------------
 * 6. Frame loading + failure detection
 * -------------------------------------------------------------------------- */

/** Mint a viewer iframe. Fresh elements are how we stay out of history.
 *
 *  v29 `allow` (links audit #2): BLUFOX OVERDRIVE steers by tilt and, opened
 *  outside the arcade cabinet, logged "accelerometer is not allowed in this
 *  document". Motion sensors, autoplay and gamepad join the original three;
 *  the browser's own permission prompts still apply. */
function makeStageFrame() {
  return el('iframe', {
    class: 'ccc-ov__frame',
    title: 'Tool',
    allow: 'clipboard-write; fullscreen; geolocation; accelerometer; gyroscope; magnetometer; autoplay; gamepad',
    referrerpolicy: 'no-referrer-when-downgrade'
  });
}

/**
 * Point the viewer's iframe at `url` WITHOUT adding a session-history entry.
 *
 * This matters more than it looks. Assigning `.src` to a frame that has
 * already navigated away from its initial about:blank pushes a real entry onto
 * the joint session history. `closeTool()` calls history.back() to unwind its
 * own pushState — and it would unwind the *iframe's* navigation instead, so ✕,
 * Escape and the Back button all took two presses to close. Measured:
 * history.length went 2 -> 3 (our pushState) -> 4 (the iframe load).
 *
 * Two defences, in order:
 *   1. Replace the whole <iframe> element. A brand-new frame's first
 *      navigation *replaces* its initial about:blank rather than pushing, so
 *      the entry is never created. This also guarantees no stale load handlers
 *      and fully unloads the previous tool.
 *   2. If a live same-document window is somehow still there, use
 *      location.replace(), which is explicitly non-pushing.
 *
 * @returns {HTMLIFrameElement} the frame that is now in the DOM
 */
/** The arcade's full-screen request (§6b). Any new frame starts un-immersed. */
function setImmersive(on) {
  if (state.ui) state.ui.root.classList.toggle('is-immersive', !!on);
}

function navigateStageFrame(ui, url) {
  setImmersive(false);
  const fresh = makeStageFrame();
  ui.frame.replaceWith(fresh);          // keeps its slot/order inside the stage
  ui.frame = fresh;
  fresh.src = freshUrl(url);            // initial navigation: replaces, no push
  return fresh;
}

/**
 * Blank the viewer frame by discarding the element entirely. Removing the
 * `src` attribute does NOT unload a frame (the document stays live and keeps
 * its timers running), and navigating it to about:blank would push yet another
 * history entry. Replacing the node does both jobs and pushes nothing.
 */
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

/* -----------------------------------------------------------------------------
 * 6b. The arcade handshake — a framed sub-app asking for a different tool
 * -----------------------------------------------------------------------------
 * WHAT THIS IS FOR. tools/arcade/ is a page inside this viewer that lists the
 * break room's games. When a rep presses Play on one, the right outcome is NOT
 * for the arcade's own frame to navigate to the game: that leaves the viewer's
 * chrome still titled "C³ Arcade", makes Back unwind an iframe navigation
 * instead of closing anything, and loses the arcade with no way back to it.
 *
 * The right outcome is openTool(slug) — the same call a hotspot or a chip makes.
 * The frame is swapped, the chrome is re-titled, `#/tool/<slug>` is pushed, and
 * Back therefore lands on `#/tool/arcade`, where syncFromLocation() puts the
 * arcade straight back up. That is the client's ask ("a Cook County Cooks Arcade
 * section … that has the games listed on there") behaving like a section rather
 * than like a dead end.
 *
 * TRUST IS BY IDENTITY, NOT BY ORIGIN — the same rule, for the same reason, as
 * the Daily Sales Report's ready handshake in assets/screens.js. A message is
 * taken ONLY when `event.source === state.ui.frame.contentWindow`: the frame
 * THIS module put in the DOM and is currently showing. An origin string can be
 * claimed by any page and changes if the client moves a tool; a WindowProxy
 * cannot be forged and is null the moment the frame leaves the document, so a
 * torn-down arcade can never speak for a live viewer. On top of that:
 *
 *   · the slug is validated against the registry before anything happens, so
 *     the message cannot navigate the viewer anywhere that is not already a
 *     tool this site ships;
 *   · openTool() is called normally, which means the FREEZER GATE still runs.
 *     A message naming a sealed tool is refused and raises the keypad exactly
 *     as a deep link would. This listener creates no way past canOpen().
 *
 * THE ACKNOWLEDGEMENT is not decoration. The arcade page waits 500 ms for it and
 * falls back to setting the parent's hash if it never comes — which is what
 * happens when a rep is holding an index.html from before this build (GitHub
 * Pages serves it with max-age=600, so that window is real on every deploy; see
 * the FLOOR note in app.js). Posting the ack is how the arcade knows it does not
 * need that fallback. Posted to location.origin, never '*'.
 * -------------------------------------------------------------------------- */

function onFrameMessage(event) {
  const ui = state.ui;
  if (!ui || !ui.frame || state.activeSlug === null) return;
  // IDENTITY. contentWindow is null for a frame that is out of the document.
  if (!ui.frame.contentWindow || event.source !== ui.frame.contentWindow) return;

  const d = event.data;
  if (!d || typeof d !== 'object') return;

  /* v29 (O-3, contract C6): A TOOL SAYING IT HAS DRAWN — {source:'ccc-tool',
     state:'painted'}, or the DSR's board handshake {source:'ccc-board', state:
     loading|ready|error}. Same identity rule; all it can do is reveal the frame
     that is showing (revealCurrent is re-bound per navigation). `load` waits for
     every font and CDN script: 6th Gen usable 2.8 s / shown 5.3 s, DSR drawn
     5.8 s / shown 18.7 s (iPad profile, tools audit). */
  if ((d.source === 'ccc-tool' || d.source === 'ccc-board') &&
      (d.state === 'painted' || d.state === 'loading' || d.state === 'ready' || d.state === 'error')) {
    const rc = state.revealCurrent;
    if (rc && rc.frame === ui.frame) rc.reveal('message');
    return;
  }

  /* v29: KEYS THE FRAME SWALLOWED. With focus inside a cross-origin tool no
     key reaches this page — the iPad "Escape did nothing" report (links audit
     #13). A tool or station page may hand them back (opt-in, identity-checked):
     {source:'ccc-tool'|'ccc-station', action:'escape'} closes the viewer,
     action:'find' opens the Find palette — no more than ✕ and Find can do. */
  if ((d.source === 'ccc-tool' || d.source === 'ccc-station') &&
      (d.action === 'escape' || d.action === 'find')) {
    if (d.action === 'escape') closeTool();
    else {
      try { document.dispatchEvent(new CustomEvent('ccc:find-open', { detail: { source: 'frame' } })); }
      catch { /* CustomEvent unavailable */ }
    }
    return;
  }

  // IMMERSIVE (v28): a game is running inside the arcade and wants the whole
  // screen. Same identity check as above; the only effect is a class on this
  // viewer, which setImmersive(false) undoes on any frame swap or close, so a
  // frame that dies mid-game cannot leave the chrome hidden.
  if (d.source === 'ccc-arcade' && d.action === 'immersive') {
    setImmersive(d.on === true);
    return;
  }

  if (d.source !== 'ccc-arcade' || d.action !== 'open-tool') return;

  const asked = typeof d.slug === 'string' ? d.slug : '';
  // Shape first (the same character class HASH_RE accepts), then existence.
  const known = /^[A-Za-z0-9_-]+$/.test(asked) ? getTool(asked) : null;
  if (!known) {
    console.warn(`[overlay] arcade asked for an unknown tool "${asked}"; ignored.`);
    return;
  }
  const slug = known.slug;

  // Acknowledge BEFORE opening: openTool() replaces the frame element, and a
  // message posted to a WindowProxy that has just been discarded goes nowhere.
  try { event.source.postMessage({ source: 'ccc-arcade-host', ok: true, slug }, location.origin); }
  catch { /* the frame is already gone; the open below is still the right thing */ }

  // A normal open: pushes #/tool/<slug>, so Back returns to the arcade. `api`
  // and not `click` because there is no DOM trigger to hand focus back to —
  // restoreFocus() then falls back to the [data-tool] element for this slug,
  // which is the arcade's own chip in the Break Room rail.
  openTool(slug, { source: 'api' });
}

/* -----------------------------------------------------------------------------
 * 6a. The note bar — progress and staleness, never a verdict
 * -------------------------------------------------------------------------- */

/**
 * Put a line on the stage without taking the stage away.
 * @param {string} text     what is true right now
 * @param {object} tool     the tool (kept in the signature for callers)
 * @param {object} [opts]   {reload:boolean, reloadLabel:string}
 */
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

/* stampExits() is gone with the exits it stamped. freshUrl() now has exactly
 * one consumer in this file — the frame's src in navigateStageFrame() — and it
 * is minted on every open, which is the whole of the client's "fresh load
 * every time" ask. There is no link out of the viewer left to go stale. */

/**
 * The rep chose to wait for a download that is still running behind the
 * card. Lift the card, put the skeleton back, and say so on the note bar —
 * with the reload one tap away in case they change their mind. onLoad() takes
 * it from here exactly as it would have without the card.
 */
function keepWaiting(tool) {
  const ui = state.ui;
  if (!ui) return;
  /* v29: the card can go up over a frame that has ALREADY loaded or drawn (a
     probe verdict of `unreachable` after the fact). Waiting for a `load` that
     has been and gone left the skeleton up for ever; show the frame. */
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

/**
 * A BACKSTOP, NOT THE ANSWER. Read preflight.js before you touch this.
 *
 * This used to be the whole of the failure detection, and it could not do the
 * job: for a CROSS-ORIGIN url every one of eleven distinct failure shapes is
 * byte-for-byte indistinguishable from success from in here (the table is in
 * preflight.js). The `catch` below returning false — "it threw, so a real
 * document from another origin is sitting there" — is true of a 404, a 500, a
 * refused frame and a dead host as well, and that is how "<tool> loaded." came
 * to be announced over a grey void.
 *
 * What it is still good for, and all it is now used for:
 *   · SAME-ORIGIN tools (tools/porting-guide/, tools/printouts/). There the
 *     document is readable and an empty body really does mean an empty body.
 *   · the browser parking us on about:blank, which is a genuine refusal signal
 *     and is not something preflight can see.
 * Everything cross-origin is decided by preflight() in showFrame().
 *
 * READ THIS BEFORE CHANGING THE PROBE — the obvious version is wrong.
 *
 *   `frame.contentDocument` does NOT throw for a cross-origin document. Per
 *   spec it returns **null**, which is indistinguishable from "nothing loaded"
 *   — so probing it flags every successfully framed cross-origin tool as
 *   blocked. (Measured in-page: contentDocument returned null and did not
 *   throw; contentWindow.document threw.)
 *
 *   `frame.contentWindow.document` is the probe that discriminates: reading it
 *   across an origin boundary throws a SecurityError, and THAT THROW is the
 *   success signal — a real document from another origin is sitting there.
 *
 * When a server sends X-Frame-Options: DENY the browser instead leaves the
 * frame on a same-origin, effectively-empty about:blank / error document, so
 * the read succeeds and we can see that there is nothing in it. That is the
 * refusal case, and it is the only way we reach the checks below.
 *
 * Same-origin tools (tools/porting-guide/, tools/employee-of-week/) are exempt
 * up front: for them an accessible document is completely normal.
 */
function looksBlocked(frame, url) {
  if (!isCrossOrigin(url)) return false;

  let doc;
  try {
    const win = frame.contentWindow;
    if (!win) return true;                                   // no browsing context
    doc = win.document;                                      // throws if cross-origin
  } catch {
    /* Cross-origin read refused. This means A document from another origin is
       there — it does NOT mean the right one. Chromium commits an error page in
       an opaque origin for a 404, a 500, an XFO refusal, a refused connection
       and a DNS failure alike, and all five throw exactly here. So this is "not
       provably empty", nothing more; preflight() is what has the status code. */
    return false;
  }

  // Only reachable when the document is same-origin, i.e. the browser parked
  // us on about:blank or an error page after a refusal.
  if (!doc) return true;
  if (doc.location && doc.location.href === 'about:blank') return true;
  if (!doc.body) return true;
  return doc.body.childElementCount === 0 && !doc.body.textContent.trim();
}

/**
 * Swap the stage over to the "can't show this here" card.
 *
 * @param {object} tool
 * @param {string} reason  the rep-facing sentence
 * @param {object} [opts]
 * @param {boolean} [opts.keepFrame=false]
 *        Leave the iframe in place and still loading. THIS IS THE DIFFERENCE
 *        BETWEEN A SLOW TOOL AND A DEAD ONE. showFallback used to call
 *        blankStageFrame() unconditionally, which replaces the <iframe>
 *        element and so destroys an in-flight download — on a store's 3G that
 *        was routinely a 1.3 MB document twenty seconds in. When the card is up
 *        because we ran out of patience rather than because the server said no,
 *        the download keeps going behind the card and onLoad() lifts the card
 *        off it if it lands.
 * @param {string} [opts.announce]  what role="status" should say
 */
function showFallback(tool, reason, opts = {}) {
  const { keepFrame = false, announce = null } = opts;
  const ui = state.ui;
  clearFrameTimer();
  hideNote();
  if (!keepFrame) {
    ui.frame.classList.remove('is-shown');
    blankStageFrame(ui);                // unloads the refused document, no history entry
  }
  ui.skel.hidden = true;
  ui.fallback.hidden = false;

  ui.fbTitle.textContent = tool.label;
  ui.fbCopy.textContent = reason;
  // "Keep waiting" is only an honest offer while there is a frame to wait for.
  ui.fbWait.hidden = !keepFrame;
  // A window of its own: only for a host that is not the client's AND that
  // the viewer cannot frame (flagged external_only, or on the refusers list).
  const leaveable = !isClientHosted(tool.url) && (!!tool.external_only || isKnownUnframeable(tool.url));
  ui.fbGo.hidden = !leaveable;
  // Retrying a SharePoint/Smartsheet URL will never work — don't offer it.
  ui.fbRetry.hidden = isKnownUnframeable(tool.url);
  ui.status.textContent = announce ||
    `${tool.label} can't be shown right now. You can try again or go back to the restaurant.`;

  // Put focus somewhere useful, but only if focus was not already inside the
  // panel. The primary action is whichever is on offer first.
  if (!ui.panel.contains(document.activeElement)) {
    const primary = [ui.fbWait, ui.fbGo, ui.fbRetry, ui.fbBack].find((b) => !b.hidden) || ui.closeBtn;
    primary.focus();
  }
}

/**
 * Point the iframe at a tool, decide when to show it, and keep the rep
 * informed about what is taking the time.
 *
 * v29 — WHEN THE FRAME IS SHOWN (O-3): on the tool's "painted" message or on
 * `load` (+120 ms), whichever comes first. The skeleton only goes up if neither
 * has happened after SKEL_DELAY_MS, so a quick tool never flashes it.
 *
 * v29 — WHEN THE SERVER IS ASKED (O-7). preflight() went out beside every
 * frame, and its GET-and-cancel only cancels when this thread gets to it: the
 * netlog showed 72, 70 and 452 KB of the 6th Gen sheet's 547 KB read twice per
 * open. It now goes out only when there is something to decide:
 *   (a) `load` in under PROBE_FAST_LOAD_MS from a frame that has not said it
 *       painted — the shape of every failure in preflight.js's table (8-23 ms).
 *       The reveal waits for the verdict, at most PROBE_HOLD_MS;
 *   (b) nothing at all by SLOW_NOTE_MS — the hang case.
 * A tool that paints, or loads at a normal pace, is never fetched twice. Every
 * verdict is still reached (tested with page.route: 404 ±CORS, 500, empty 200,
 * refused, hang), and gone/empty still overrule a frame already shown.
 */
function showFrame(tool, { force = false } = {}) {
  const ui = state.ui;
  clearFrameTimer();

  ui.fallback.hidden = true;
  hideNote();
  ui.frame.classList.remove('is-shown');
  ui.skel.hidden = true;                        // up after SKEL_DELAY_MS, if still needed
  ui.status.textContent = `Loading ${tool.label}…`;
  state.revealCurrent = null;

  // Known refusers: skip the spinner entirely and go straight to the card.
  // Nothing routes here today except SharePoint/Microsoft hosts — none of which
  // are in data/tools.json — but the list stays as cheap insurance for whatever
  // gets added next. It is NOT the failure detection; preflight() is.
  if (!force && isKnownUnframeable(tool.url)) {
    showFallback(
      tool,
      `${tool.label} cannot be displayed inside the site. It opens in its own window — you'll come straight back here when you're done.`
    );
    return;
  }

  let settled = false;          // shown, or a card is up: no more clocks
  let confirmed = null;         // preflight's verdict, once it lands
  let preflightLength = -1;     // Content-Length the server reported, or -1
  let spoke = false;            // the tool itself said it has drawn (C6)
  let loadedAt = 0;             // when `load` fired, 0 until it has
  let probing = false;          // a preflight is out (never more than one)
  let holding = false;          // `load` was fast: the reveal waits for a verdict

  /* The reveal, from `load`, from the tool's own message, from a probe verdict
     that cleared a fast load, or from "Keep waiting" over a frame that has
     already arrived. Idempotent: a second call over a frame that is already up
     with no card on it does nothing. */
  const reveal = (why) => {
    if (frame !== ui.frame) return;                // superseded by a newer open
    if (frame.classList.contains('is-shown') && ui.fallback.hidden) return;
    if (why === 'message') spoke = true;
    // SAME-ORIGIN ONLY. See looksBlocked(): for a cross-origin URL this
    // cannot tell success from any failure, so it is not consulted there. A
    // frame that has posted a message is a live document by definition.
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
    /* A late arrival lifts the card — which can pull the focused element out
       from under the keyboard, because showFallback(keepFrame) may have put
       focus on the card's "Keep waiting". Hand it to the close button
       before hiding, so Tab does not restart from the top of the page. */
    if (!ui.fallback.hidden && ui.fallback.contains(document.activeElement)) {
      try { ui.closeBtn.focus({ preventScroll: true }); } catch { ui.closeBtn.focus(); }
    }
    ui.fallback.hidden = true;
    frame.classList.add('is-shown');
    /* WHAT WE ARE ALLOWED TO CLAIM. "loaded" is only honest when the tool
       spoke, the server told us the document is there, or the document is our
       own. A slow `load` with no probe is very probably the tool (the failure
       shapes fire in milliseconds), but all we KNOW is that it is open. */
    ui.status.textContent = (spoke || confirmed === 'ok' || !isCrossOrigin(tool.url))
      ? `${tool.label} loaded.`
      : (confirmed === null
        ? `${tool.label} is open.`
        : `${tool.label} is open in the viewer. If it looks empty, close it and open it again.`);
    maybeWarnRefused();
  };

  const onLoad = () => {
    // Give a blocked-frame error document a tick to settle before probing.
    setTimeout(() => {
      if (frame !== ui.frame) return;
      loadedAt = Date.now();
      if (spoke || (frame.classList.contains('is-shown') && ui.fallback.hidden)) return;
      // O-7 (a): a fast `load` from a frame that has not said a word is the
      // shape every failure in preflight.js's table takes. Ask before showing.
      if (!probing && confirmed === null && loadedAt - startedAt < PROBE_FAST_LOAD_MS) {
        holding = true;
        runPreflight();
        window.setTimeout(() => { if (holding) reveal('load'); }, PROBE_HOLD_MS);
        return;
      }
      if (holding) return;                         // the verdict will reveal it
      reveal('load');
    }, 120);
  };

  /**
   * THE ONE BACKSTOP FOR A FRAME THAT WAS REFUSED, and an honest account of
   * what it can and cannot do.
   *
   * X-Frame-Options and Content-Security-Policy: frame-ancestors are the two
   * failures a preflight cannot see: neither header is on the CORS-safelisted
   * response header list, so `res.headers.get('x-frame-options')` is null even
   * with `access-control-allow-origin: *`, and the blocked frame itself is
   * byte-for-byte indistinguishable from a working one (it fires `load`, and
   * every property throws SecurityError — measured, see preflight.js).
   *
   * What IS readable is Content-Length. So: a document the server says is
   * half a megabyte cannot have been fetched, parsed and fired `load` in a
   * fifth of a second, because the frame's URL carries a fresh `_ccc` stamp and
   * therefore CANNOT have come out of the HTTP cache. When that happens,
   * nothing was downloaded — the browser committed an error page instead.
   * (v29: measured against when `load` fired, not against when the verdict
   * came back, now that the probe goes out after `load` rather than beside
   * the frame. A frame that loads that fast is always probed — O-7 (a).)
   *
   * Thresholds are deliberately far outside anything a real load reaches:
   * 500 KB in 200 ms is 2.5 MB/s sustained, which no store connection does.
   * And the consequence is a NOTE, never a card: if this is ever wrong the rep
   * sees one extra line above a working tool, not a tool taken away from them.
   * The a-priori NEVER_FRAMES list remains the real answer for a host that
   * refuses framing — and GitHub Pages, where every one of the client's tools
   * lives, sends no X-Frame-Options at all (curl-verified across all 24).
   */
  function maybeWarnRefused() {
    if (spoke) return;                              // it drew: it was not refused
    if (!isCrossOrigin(tool.url)) return;
    if (confirmed !== 'ok') return;                 // no Content-Length to reason from
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

  // A FRESH element per navigation — see navigateStageFrame() for why.
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

  /* ── the preflight, when there is something to decide ────────────────────
     A verdict of `gone` or `empty` is the server's own answer, so it earns an
     immediate card and the dead frame is discarded; see the two cases in the
     header comment for when this runs at all. */
  function runPreflight(timeoutMs) {
    if (probing) return;
    probing = true;
    preflight(tool.url, timeoutMs ? { timeoutMs } : undefined).then(onVerdict);
  }

  function onVerdict(v) {
    if (frame !== ui.frame || state.activeSlug === null) return;   // superseded
    confirmed = v.verdict;
    preflightLength = v.length;

    /* A DEFINITE FAILURE OVERRULES A REVEALED FRAME, and it has to.
       `settled` is not a veto here: the server saying 404 outranks an iframe
       that cannot say anything. (It cannot fight a WORKING tool: `gone` needs
       a real error status, or a CORS refusal from a host verified to always
       send the header; and `unreachable` needs BOTH probes refused at the
       network level. And a tool that has posted "painted" is never probed.) */
    if (v.verdict === 'gone' || v.verdict === 'empty') {
      settled = true; holding = false;
      showFallback(tool, preflightCopy(v, tool.label), {
        announce: `${tool.label} could not be opened: the server did not return the tool.`
      });
      return;
    }

    if (v.verdict === 'unreachable') {
      /* THE NETWORK SAID NO — TO THE PROBE. It does not follow that it said
         no to the frame: the frame's request went out first, on its own
         socket, and on a store's wifi one request dying while its neighbour
         survives is ordinary. v13 discarded the frame here, and a frame
         discarded at second 3 of a 13-second download is a rep who "has to
         close it out and reopen". So the card goes up (it is the right card:
         "check you are past the sign-in page") and the frame stays underneath
         it. If the network is really gone the frame never loads and the card
         is the last word; if it was one dropped request, the frame lifts the
         card off itself when it lands (or "Keep waiting" shows it, if it
         already has). Nothing is lost either way. */
      settled = true; holding = false;
      showFallback(tool, preflightCopy(v, tool.label), {
        keepFrame: true,
        announce: `${tool.label} could not be reached. Still trying behind this card.`
      });
      return;
    }

    if (holding) {
      // A fast `load` that the server has now vouched for (or could not rule
      // on: `unknown`, `slow`): show it.
      reveal('load');
      return;
    }

    if (settled) {
      // The frame is already up. A 2xx upgrades what we are allowed to say
      // about it from "it is open" to "it loaded".
      if (v.verdict === 'ok' && ui.fallback.hidden && frame.classList.contains('is-shown')) {
        ui.status.textContent = `${tool.label} loaded.`;
        maybeWarnRefused();     // the Content-Length only arrived now
      }
      return;
    }

    if (v.verdict === 'slow') {
      /* Nothing answered the probe either, and the frame has not fired. That
         is a HANG, which is the one failure the old six-second watchdog got
         right — so say so now rather than at thirty seconds, but KEEP the
         frame: a hung request can still complete, and it lifts this card off
         itself if it does. */
      showFallback(tool, `${tool.label} is not answering. It may be the network rather than the tool — if you are on store wifi, check you are past the sign-in page.`,
        { keepFrame: true,
          announce: `${tool.label} is not answering. Still trying behind this card.` });
    }
    // 'ok' and 'unknown': carry on. The frame is the one doing the work.
  }

  /* ── the two clocks ───────────────────────────────────────────────────────
     Neither is a verdict any more. The first says the document is still
     coming (and, v29, sends the hang probe); the second says it has been long
     enough that you deserve a choice. Both leave the iframe alone, so nothing
     that is nearly finished is thrown away — which is what firing the old 6s
     watchdog did. */
  state.slowTimer = window.setTimeout(() => {
    if (settled || frame !== ui.frame) return;
    /* v29 (O-4): this used to tell every rep, whatever they had opened, that
       "the 6th Gen quote sheet alone is 1.3 MB". It is about THIS tool now. */
    showNote(
      `Still loading ${tool.label}. On a store connection this can take a little while — it will appear here as soon as it is ready.`,
      tool
    );
    ui.status.textContent = `${tool.label} is still loading.`;
    runPreflight(HANG_PROBE_TIMEOUT_MS);          // O-7 (b)
  }, SLOW_NOTE_MS);

  state.frameTimer = window.setTimeout(() => {
    if (settled || frame !== ui.frame) return;
    showFallback(tool,
      `${tool.label} is still coming down after ${Math.round(FRAME_TIMEOUT_MS / 1000)} seconds. It may be the connection — it is still loading behind this card and will appear if it lands.`,
      { keepFrame: true,
        announce: `${tool.label} is taking a long time. Still loading behind this card; you can keep waiting or start it again.` });
  }, FRAME_TIMEOUT_MS);
}

/* -----------------------------------------------------------------------------
 * 7. Open / close
 * -------------------------------------------------------------------------- */

function hashSlug() {
  const m = HASH_RE.exec(location.hash || '');
  return m ? m[1] : null;
}

/**
 * The gate said no. Undo any URL that claims otherwise, then hand control to
 * whoever owns the lock so they can put their keypad up.
 */
function refuseTool(slug, tool, { trigger = null, source = 'api' } = {}) {
  // A refused deep link must not leave #/tool/<slug> sitting in the address
  // bar claiming a tool is open. Strip it — but only if nothing else is open.
  if (state.activeSlug === null && (hashSlug() || '').toLowerCase() === slug.toLowerCase()) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* noop */ }
  }

  // `retry` deliberately drops the original history/source options: by the
  // time it runs the hash is gone, so reopening should push a fresh entry.
  const retry = () => openTool(slug, { trigger, bypassGate: true });
  const detail = { slug, tool, trigger, source, retry };

  try {
    document.dispatchEvent(new CustomEvent('ccc:tool-refused', { bubbles: true, detail }));
  } catch { /* CustomEvent unavailable: the callback below still fires */ }

  if (typeof state.onRefused === 'function') {
    try { state.onRefused(slug, detail); } catch (err) { console.error('[overlay] onRefused threw:', err); }
  }
}

/**
 * Tell the rest of the page that the viewer has gone up or come down.
 *
 * WHY THE PAGE NEEDS TO KNOW. The scrim is 92–94% opaque, so nothing behind
 * the viewer is visible — but everything behind it was still RUNNING: on an iPad in the Dining Room that is two live iframes of the
 * Win-the-Weekend decks (5.6 MB and 5.0 MB of HTML, each cycling slides on a
 * 7 s timer) and, in the Break Room, a television parsing a 1.15 MB workbook.
 * All of it on the same HTTP/2 connection to the same host the tool is loading
 * from. Measured in the harness at a 4 Mbps shared link, opening a tool from
 * the Dining Room while the boards were still coming down: Daily Sales Report
 * data ready at 15.7 s, Win the Weekend at 33.6 s — the same two at 7.3 s and
 * 12.4 s once screens.js drops the in-flight boards for as long as the viewer
 * is up (see liveWanted() there). This is where it hears about it.
 *
 * A CustomEvent on document rather than an import in either direction:
 * screens.js already imports this module (freshUrl) and this module must not
 * import screens.js, and the pocket list — which has no screens — pays nothing.
 */
function announceViewer(kind, slug, tool) {
  try {
    document.dispatchEvent(new CustomEvent(`ccc:viewer-${kind}`, {
      bubbles: false,
      detail: { slug: slug || null, tool: tool || null }
    }));
  } catch { /* CustomEvent unavailable: the boards simply keep running */ }
}

/* -----------------------------------------------------------------------------
 * 7a. The choreography (v29, design audit M7)
 * -----------------------------------------------------------------------------
 * OPEN.  The panel grows from the trigger's centre (360 ms; lite: 160 ms
 *   opacity only; reduced motion: none) over a 240 ms scrim fade, with the page
 *   NOT locked, so the room stays painted underneath. At the end of the fade,
 *   viewer opaque, is-viewing + inert + lock go on in one task.
 * CLOSE. The page first, while the viewer is still opaque: inert off, unlock +
 *   scroll restore, is-viewing off, `ccc:viewer-close`, focus home. Two frames
 *   for the room to redraw, then the 160 ms fade — into the room the rep came
 *   from. (Before v29 the fade ran first and dissolved into black or the hero,
 *   design audit P0-1.) Independent of the engine ignoring the lock's jump.
 * SWAP.  Tool to tool: title cross-fade, skeleton between frames, no motion.
 * REOPEN WHILE CLOSING: the fade reverses; lock/inert/is-viewing come back at
 *   its end through the same one-edge flags (the case that used to freeze).
 * -------------------------------------------------------------------------- */

/** The trigger's centre in viewport px, or null (no trigger, off screen,
 *  hidden) to grow from the panel's centre. Read before any write. */
function triggerPoint(trigger) {
  if (!trigger || !trigger.isConnected || typeof trigger.getBoundingClientRect !== 'function') return null;
  const r = trigger.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return null;
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;
  return { x, y };
}

/** transform-origin at `pt`. offsetLeft/Top, not the (scaled) rect; the read
 *  also computes the start state the fade runs from (see beginOpen). */
function setOrigin(ui, pt) {
  const s = ui.panel.style;
  const left = ui.panel.offsetLeft;
  const top = ui.panel.offsetTop;
  if (!pt) { s.removeProperty('--ccc-ov-ox'); s.removeProperty('--ccc-ov-oy'); return; }
  s.setProperty('--ccc-ov-ox', `${Math.round(pt.x - left)}px`);
  s.setProperty('--ccc-ov-oy', `${Math.round(pt.y - top)}px`);
}

/** Run `cb` when the panel's opacity transition ends, or after `ms` + a margin
 *  if it never reports (hidden tab, interrupted, themed away). Stale by `gen`.
 *
 *  OPEN is `patient`: with a tool busy on this thread (in-process on iPad) the
 *  transition may not even have started when the timer fires — measured: panel
 *  still at opacity 0 at 440 ms — and locking then would show the lock's
 *  effect through a transparent viewer. So it waits while the panel's own
 *  transition is pending/running, up to ~4 s. CLOSE is not: the room is
 *  already right underneath, and waiting would keep the closed tool running. */
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

/** Two rendering opportunities from now: the first is the one in which the
 *  unlock's scroll event reaches the engine and it redraws the room; the
 *  second is the first one that shows it. A timer backs it for a hidden tab,
 *  where rAF does not run at all. */
function afterTwoFrames(cb) {
  let done = false;
  const go = () => { if (done) return; done = true; clearTimeout(timer); cb(); };
  const timer = window.setTimeout(go, 300);
  try { requestAnimationFrame(() => requestAnimationFrame(go)); } catch { /* the timer has it */ }
}

/** closed → opening. */
function beginOpen(ui, origin) {
  const gen = ++state.gen;
  const tier = motionTier();
  state.phase = 'opening';
  ui.root.classList.remove('is-in', 'is-closing', 'is-immersive');
  ui.root.hidden = false;
  liveRoot(ui);
  // Also forces the start state's style, so adding is-in below transitions.
  setOrigin(ui, tier === 'full' ? origin : null);
  ui.root.classList.add('is-in');
  if (tier === 'off') { settleOpen(gen); return; }
  state.lockTimer = afterPanelFade(ui, gen, OPEN_MS[tier], () => settleOpen(gen), { patient: true });
}

/** closing → opening: a reopen inside the close fade. Nothing was torn down
 *  yet except the page-side state, which settleOpen() puts back. */
function reopenFromClosing(ui) {
  const gen = ++state.gen;            // the pending finishClose() is now stale
  const tier = motionTier();
  state.phase = 'opening';
  ui.root.hidden = false;
  liveRoot(ui);
  ui.root.classList.remove('is-closing');
  ui.root.classList.add('is-in');     // the fade reverses from where it is
  if (tier === 'off') { settleOpen(gen); return; }
  state.lockTimer = afterPanelFade(ui, gen, OPEN_MS[tier], () => settleOpen(gen), { patient: true });
}

/** opening → open: the viewer is opaque now. is-viewing goes on first
 *  (contract C1: before the lock), then inert, then the lock. */
function settleOpen(gen) {
  if (state.gen !== gen || state.phase !== 'opening') return;
  state.lockTimer = 0;
  setViewing(true);
  setBackgroundInert(true);
  lockScroll();
  state.phase = 'open';
}

/** closing → closed: the fade is over. Unload the tool and put the viewer
 *  away. The page was handed back before the fade started. */
function finishClose(gen) {
  if (state.gen !== gen || state.phase !== 'closing') return;
  const ui = state.ui;
  state.phase = 'closed';
  state.finishTimer = 0;
  if (!ui) return;
  ui.root.hidden = true;
  ui.root.classList.remove('is-in', 'is-closing', 'is-immersive');
  blankStageFrame(ui);                           // unload the tool; adds no history
  ui.fallback.hidden = true;
  ui.skel.hidden = true;
  hideNote();
}

/** Swap: the title changes under a quick fade; nothing else moves. */
function crossFadeTitle(ui) {
  if (motionTier() === 'off' || typeof ui.title.animate !== 'function') return;
  try {
    ui.title.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: 160, easing: 'cubic-bezier(.22,.61,.24,1)' });
  } catch { /* WAAPI missing: the title just changes */ }
}

function clearCloseWatch() {
  if (state.closeWatch) { clearTimeout(state.closeWatch); state.closeWatch = 0; }
}

/**
 * Open a tool full-screen.
 * @param {string} slug
 * @param {object} [opts]
 * @param {boolean} [opts.history=true]     push #/tool/<slug> (false when we're
 *                                          reacting to a history event ourselves)
 * @param {Element} [opts.trigger]          element to return focus to on close
 * @param {boolean} [opts.bypassGate=false] skip canOpen — for the retry handed
 *                                          to onRefused after a successful unlock
 * @param {string}  [opts.source='api']     'click' | 'hash' | 'api', passed to onRefused
 * @param {boolean} [opts.replace=false]    on a swap, replace the history entry
 *                                          instead of pushing one (Find palette)
 */
export function openTool(slug, opts = {}) {
  const { history: doPush = true, trigger = null, bypassGate = false, source = 'api', replace = false } = opts;
  const tool = getTool(slug);

  if (!tool) {
    // Registry may not have arrived yet (deep link on a cold load).
    if (!state.ready) { whenReady().then(() => openTool(slug, opts)); return; }
    console.warn(`[overlay] unknown tool "${slug}"`);
    return;
  }
  // C7: from here on, the registry's own spelling — in the gate, the history
  // entry, the events and the focus return.
  slug = tool.slug;

  // --- access gate ----------------------------------------------------------
  // Consulted on EVERY path into the viewer — click, deep link, hash sync,
  // programmatic call — and BEFORE the external_only shortcut, so a gated tool
  // cannot be reached by typing #/tool/<slug> past a keypad that only ever
  // guarded clicks. The predicate is re-evaluated each time, so an unlock that
  // happened in between is simply seen.
  if (!bypassGate && typeof state.canOpen === 'function') {
    let allowed = false;
    try { allowed = !!state.canOpen(slug, tool); }
    catch (err) { console.error('[overlay] canOpen threw; refusing:', err); }
    if (!allowed) { refuseTool(slug, tool, { trigger, source }); return; }
  }

  // external_only: never frame, never take over the page — straight out. No
  // modal, no scroll lock, no history entry.
  //
  // The fallthrough below is ONLY for a genuinely blocked popup. It used to
  // run on every success too, because window.open(url, '_blank', 'noopener')
  // returns null by specification even when the tab opens fine — see
  // openNewTab(), which no longer passes that feature string.
  //
  // Nothing here keys off a slug: `printouts` is external_only today purely
  // because tools.json says so. Drop the flag when the PDFs come out of
  // SharePoint and this tool starts framing like any other, no code change.
  if (tool.external_only && !isClientHosted(tool.url)) {
    // Stamped, so a SharePoint/Smartsheet document is not a ten-minute-old
    // copy out of the HTTP cache. A tool on the client's OWN hosting never
    // takes this branch even if tools.json flags it: the whole point of v15 is
    // that no gesture on this site puts that address in an address bar, and a
    // mis-set flag must not be the way it happens. It is framed instead.
    const win = openNewTab(freshUrl(tool.url));
    if (win) return;                             // opened: leave the page alone
    // Popup blocked: fall through into the viewer showing the card, whose
    // "Open it in its own window" button is a user gesture the blocker allows.
  }

  const from = state.phase;
  const swapping = from === 'opening' || from === 'open';
  // Where the window grows from. Read first, while nothing has been written.
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
    // v29 · a swap chosen from the Find palette (C4) REPLACES the viewer's
    // entry instead of stacking one per tool, so one ✕ / Escape / Back closes
    // the viewer (S4's request). pushedHistory is left as it was: an entry we
    // pushed is still ours to pop; a deep link still has none.
    try { history.replaceState({ cccTool: slug }, '', internalHref(slug)); } catch { /* noop */ }
  } else if (doPush) {
    try {
      history.pushState({ cccTool: slug }, '', internalHref(slug));
      state.pushedHistory = true;
    } catch { state.pushedHistory = false; }
  }

  // Focus the close button: predictable, and one Shift+Tab from everything.
  // (Unless the fallback card already claimed focus for its primary action —
  // don't yank it back from a more useful target.)
  if (!swapping) requestAnimationFrame(() => {
    if (state.activeSlug === null) return;
    if (!ui.panel.contains(document.activeElement)) ui.closeBtn.focus();
  });
}

/**
 * Close the viewer.
 * @param {object} [opts]
 * @param {boolean} [opts.history=true] let the Back button do the closing
 *                                      (false when a popstate is closing us)
 */
export function closeTool(opts = {}) {
  const { history: useHistory = true } = opts;
  if (state.activeSlug === null) return;

  // If we pushed the #/tool/ entry, closing should *rewind* history so Back
  // and the ✕ leave the user in the same place. popstate then re-enters here
  // with history:false and does the real teardown.
  if (useHistory && state.pushedHistory) {
    state.pushedHistory = false;
    const slug = state.activeSlug;
    history.back();
    /* v29 (O-9): A TOOL THAT PUSHED HISTORY OF ITS OWN. NPS's skip link
       (href="#results") adds an entry inside the frame, so history.back()
       steps back inside the tool and no popstate ever reaches this page: ✕
       did nothing. If the address bar still names this tool 400 ms later,
       close it here. The popstate normally lands in 3-10 ms; if it went to a
       different tool (Back from a game to the arcade) the address bar says so
       and this does nothing. */
    clearCloseWatch();
    state.closeWatch = window.setTimeout(() => {
      state.closeWatch = 0;
      if (state.activeSlug !== slug) return;
      const still = getTool(hashSlug() || '');
      if (!still || still.slug !== slug) return;
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* noop */ }
      teardown();
    }, 400);
    return;
  }

  // Deep-linked straight into a tool: no entry of ours to pop, so just strip
  // the hash in place rather than sending the user off the site.
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
  const gen = ++state.gen;                       // a pending settleOpen() is now stale
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
  ui.root.classList.add('is-closing');           // pointer to the page; nothing moves yet
  ui.frame.onload = ui.frame.onerror = null;
  /* A tool closed BEFORE it was shown is unloaded now, not after the fade:
     nothing of it is on screen (the skeleton or the dark stage is), and a
     report still fetching and parsing its workbook would otherwise keep this
     thread (on an iPad) busy through the fade. A tool that IS on screen stays
     for the fade and is unloaded at its end. */
  if (!ui.frame.classList.contains('is-shown')) blankStageFrame(ui);
  ui.status.textContent = '';
  ui.note.hidden = true;
  state.openedAt = 0;
  state.staleOffered = false;

  /* M7 close, step 1: THE PAGE FIRST, while the viewer is still opaque. The
     unlock's scrollTo() is synchronous and needs layout, so this task also
     pays the style pass for inert/is-viewing coming off — once, and hidden. */
  setBackgroundInert(false);
  unlockScroll();
  setViewing(false);
  announceViewer('close', slug, slug ? getTool(slug) : null);
  restoreFocus(slug);

  /* Step 2: one frame for the room to be drawn where it belongs, then fade. */
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
    // preventScroll: the page has just been un-fixed; don't yank it again.
    try { target.focus({ preventScroll: true }); } catch { target.focus(); }
  }

  /* AND A FLOOR UNDER IT. `isConnected` is not the same as "can take focus": a
     trigger inside a panel that has closed behind the viewer is still in the
     document and still display:none, so .focus() is a no-op and the browser
     drops focus on <body> — where the next Tab starts the whole page again from
     the skip link. Measured on the one route that does this: open a tool from
     the C³ menu (which closes as it hands over) and close it again.
     The C³ button is the honest landing place for that case — it is fixed, it
     is always visible, and it is the control that opened the panel the trigger
     was in. Only ever runs when focus is genuinely nowhere. */
  if (target && document.activeElement === target) return;   // it took: done
  /* Tested on the outcome, not on document.activeElement: setting `hidden` on
     the viewer does not synchronously move activeElement off the close button
     in Chromium, so "is focus on <body>?" reads false here and then true a
     frame later. "Did the element I aimed at actually take it?" is answerable
     now and cannot be raced. */
  const fallback = document.getElementById('c3-button') || document.querySelector('.skip-link');
  if (fallback && typeof fallback.focus === 'function') {
    try { fallback.focus({ preventScroll: true }); } catch { fallback.focus(); }
  }
}

/**
 * The tab came back to the foreground (or was restored from the bfcache, which
 * is what iOS does every time someone taps Back out of a tool).
 *
 * ONE THING HAPPENS, AND ONE THING DELIBERATELY DOES NOT.
 *
 *   1. If the tool has been open longer than STALE_AFTER_MS, the note bar
 *      OFFERS a reload. Once per open, not on every tab switch. (v14 also
 *      re-stamped the links out of the viewer here; there are none now.)
 *
 *   2. IT DOES NOT RELOAD THE FRAME BY ITSELF — and it does not re-mount,
 *      replace or touch the iframe in any way, which was checked specifically
 *      while chasing "the data sometimes doesn't load on the iPad": a
 *      re-mount on return to the foreground would throw away a fetch that the
 *      tool was in the middle of. This handler reads state and writes a note.
 *      That is a decision, not an
 *      omission. These tools are data entry: the 6th Gen quote sheet is a
 *      customer's lines, devices and trade-ins typed in at the counter, and the
 *      Daily Sales Report is a half-written entry. Reloading the iframe throws
 *      all of it away with no undo, and a rep who lost a quote mid-conversation
 *      is worse off than a rep looking at a document from before lunch — the
 *      staleness that actually bites (pricing changing under a quote) is
 *      carried by the freshUrl stamp on the links OUT, which is (1).
 *      The offer is one tap; taking it is the rep's call, not ours.
 */
function onViewerVisible() {
  if (state.activeSlug === null || !state.ui) return;
  const tool = getTool(state.activeSlug);
  if (!tool) return;
  if (state.staleOffered || !state.openedAt) return;
  if (Date.now() - state.openedAt < STALE_AFTER_MS) return;
  if (!state.ui.fallback.hidden) return;        // the card is already up
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
    /* v29: Escape inside the Find palette (contract C4) is the palette's —
       it clears the query or closes the palette. This listener is on the
       document in the capture phase, so without this it ran first and shut
       the viewer from under the palette. */
    const t = ev.target;
    if (t && t.closest && t.closest('[data-ccc-keep-live]')) return;
    ev.preventDefault();
    ev.stopPropagation();
    closeTool();
  }
}

/* -----------------------------------------------------------------------------
 * 7b. The on-screen keyboard (v29, touch devices only)
 * -----------------------------------------------------------------------------
 * iPadOS shrinks and pans the VISUAL viewport for the keyboard but leaves the
 * layout viewport (which the fixed, svh-sized viewer is measured against), so a
 * quote-sheet field can end up under the keyboard (tools audit §3; documented
 * iOS behaviour, not observable here). On a coarse pointer, and only while the
 * visual viewport is shorter than the window and not pinch-zoomed, the viewer
 * is fitted to it. Otherwise nothing is written. */
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

/* -----------------------------------------------------------------------------
 * 8. Routing — the viewer has its own URL
 * -------------------------------------------------------------------------- */

/**
 * C7: A WRONG-CASE LINK OPENS THE TOOL, NOT THE KEYPAD. A hash naming a
 * registry tool in the wrong case is rewritten in place (replaceState) to the
 * registry's spelling, which is returned. It runs before anything else reads
 * the hash (inside initOverlay(), and in this module's hashchange listener,
 * registered before cinema's/pocket's sealed-link watchers), so those watchers
 * see a slug they know. Unknown and sealed slugs are untouched: keypad.
 */
function canonicaliseLocation() {
  const raw = hashSlug();
  if (!raw) return null;
  const tool = getTool(raw);
  if (!tool || tool.slug === raw) return raw;
  try {
    history.replaceState(history.state, '', location.pathname + location.search + internalHref(tool.slug));
  } catch { /* noop: the lookup below is case-insensitive anyway */ }
  return tool.slug;
}

/** Reconcile the viewer with whatever the address bar currently says. */
function syncFromLocation() {
  const slug = canonicaliseLocation();
  if (slug) {
    if (slug === state.activeSlug) return;
    // Arrived by history, so don't push another entry — but remember that the
    // entry exists so ✕ still rewinds correctly.
    const had = state.activeSlug !== null;
    openTool(slug, { history: false, source: 'hash' });
    // If the gate refused, nothing opened — don't claim an entry we don't own.
    if (state.activeSlug === slug) state.pushedHistory = had || state.pushedHistory;
  } else if (state.activeSlug !== null) {
    closeTool({ history: false });
  }
}

/* -----------------------------------------------------------------------------
 * 9. Delegated click handling for [data-tool]
 * -------------------------------------------------------------------------- */

function onDocumentClick(ev) {
  // Let modified clicks behave like normal browser clicks.
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

  const trigger = ev.target.closest && ev.target.closest('[data-tool]');
  if (!trigger) return;

  const slug = trigger.getAttribute('data-tool');
  if (!slug) return;

  // Anything inside the viewer itself is not a trigger.
  if (state.ui && state.ui.root.contains(trigger)) return;

  ev.preventDefault();
  // A row in the Find palette ([data-ccc-keep-live], C4). The palette may have
  // hidden itself by now, so ask the dispatch path, not the live tree.
  let fromPalette = false;
  try {
    fromPalette = ev.composedPath().some((n) => n && n.nodeType === 1 && n.hasAttribute('data-ccc-keep-live'));
  } catch { /* noop */ }
  openTool(slug, { trigger, source: 'click', replace: fromPalette });
}

/** Keyboard activation for non-native triggers (a div with data-tool). */
function onDocumentKeydown(ev) {
  if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
  const trigger = ev.target.closest && ev.target.closest('[data-tool]');
  if (!trigger || !trigger.hasAttribute('data-tool')) return;
  const tag = trigger.tagName;
  if (tag === 'A' || tag === 'BUTTON') return;      // browser already handles it
  if (state.ui && state.ui.root.contains(trigger)) return;
  ev.preventDefault();
  openTool(trigger.getAttribute('data-tool'), { trigger, source: 'click' });
}

/* -----------------------------------------------------------------------------
 * 10. initOverlay()
 * -------------------------------------------------------------------------- */

/**
 * Boot the tool viewer.
 *
 * @param {object}  [options]
 * @param {Array}   [options.tools]     tools array (as in data/tools.json). If
 *                                      omitted we look at window.CCC_TOOLS /
 *                                      window.CCC?.tools, then fetch toolsUrl.
 * @param {string}  [options.toolsUrl]  default 'data/tools.json'
 * @param {boolean} [options.deepLink]  honour #/tool/<slug> on load (default true)
 *
 * @param {(slug:string, tool:object) => boolean} [options.canOpen]
 *        Access gate. Return falsy to refuse. Called on EVERY path into the
 *        viewer — click, keyboard, deep link, hash sync, programmatic
 *        openTool() — and before the external_only shortcut, so a lock cannot
 *        be walked past with a URL. Re-evaluated on every open, so it should
 *        read live state (e.g. sessionStorage) rather than a captured boolean.
 *
 * @param {(slug:string, ctx:{tool:object, trigger:Element|null,
 *          source:'click'|'hash'|'api', retry:() => void}) => void} [options.onRefused]
 *        Called when canOpen refuses. Nothing opens, no history entry is made,
 *        and a refused deep-link hash is stripped from the address bar. Put
 *        your keypad up here, then call ctx.retry() once the user is through
 *        (or just call openTool(slug, { trigger }) again — canOpen re-runs and
 *        will now pass). The same payload is also dispatched on `document` as
 *        a bubbling `ccc:tool-refused` CustomEvent for listener-style wiring.
 *
 * @returns {{open:Function, close:Function, isOpen:Function, setGate:Function,
 *            registry:Map, ready:Promise}}
 *
 * @example  // assets/app.js — the freezer gate
 *   initOverlay({
 *     tools: data.tools,
 *     canOpen: (slug) => !gated.has(slug) || isFreezerUnlocked(),
 *     onRefused: (slug, { retry }) => openKeypad().then((ok) => { if (ok) retry(); })
 *   });
 */
export function initOverlay(options = {}) {
  const {
    tools = null,
    toolsUrl = 'data/tools.json',
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
    /* §6b. One listener for the life of the page, not one per open: the frame
       element is replaced on every navigation (navigateStageFrame) and a
       per-mount listener would have to be torn down in four places. The
       identity test inside it reads state.ui.frame live, so it is correct for
       whichever frame is mounted at the moment a message arrives. */
    window.addEventListener('message', onFrameMessage);
    /* THE VIEWER HAD NO IDEA THE TAB HAD EVER GONE AWAY. This module carried no
       visibilitychange and no pageshow handler at all, so a tool opened before
       lunch was still, on the rep's return, the pre-lunch document with a
       pre-lunch stamp on every link out of it. The pocket list has had this
       since v5; the framed viewer never did. See onViewerVisible(). */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { selfHeal(); onViewerVisible(); }
    });
    window.addEventListener('pageshow', (ev) => { selfHeal(); if (ev.persisted) onViewerVisible(); });
    /* Every anchor that opens a tool carries the site's own address. See
       normaliseTriggerLinks(): this is where "copy link" on a phone or an
       iPad stops handing out the repository. */
    watchTriggerLinks();
  }

  /* ⚠ THE INLINE FALLBACK READ THE WRONG GLOBAL AND SO WAS NEVER A FALLBACK.
     It looked for `window.CCC.tools` and `window.CCC_TOOLS`; index.html has
     always written `window.__CCC_INLINE__ = { tools, freezer, headchefs }`, and
     nothing in this build has ever set either of the other two. The branch was
     dead, so a caller that did not pass `tools` fell straight through to a
     fetch of data/tools.json — which is the one thing the inline payload exists
     to avoid (fetch() against a file:// URL is refused outright, and Jeff
     reviews builds off a USB stick). The real global is read first now; the
     two old spellings are kept behind it in case something out there sets one,
     and the fetch stays as the last resort. */
  const inlineTools =
    (window.__CCC_INLINE__ && window.__CCC_INLINE__.tools) ||
    (window.CCC && window.CCC.tools) || window.CCC_TOOLS || null;

  /* v29 (C7): fill the registry now, not a microtask later, so a wrong-case
     deep link is rewritten before cinema/pocket run their (case-sensitive)
     sealed-link watchers right after this call. The deep link itself still
     opens in the .then() below, at the same moment as before. */
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
      if (deepLink) syncFromLocation();          // deep link opens straight in
      return state.registry;
    })
    .catch((err) => {
      console.error('[overlay] could not load tools:', err);
      markReady();                               // unblock waiters regardless
      return state.registry;
    });

  return {
    open: (slug, opts) => openTool(slug, opts),
    close: (opts) => closeTool(opts),
    isOpen: () => state.activeSlug !== null,
    /** Install or replace the gate after init (pass nulls to remove it). */
    setGate: (nextCanOpen, nextOnRefused) => {
      state.canOpen = typeof nextCanOpen === 'function' ? nextCanOpen : null;
      state.onRefused = typeof nextOnRefused === 'function' ? nextOnRefused : null;
    },
    registry: state.registry,
    ready
  };
}

/* =============================================================================
 * 11. THE SCREENS MOVED OUT
 * -----------------------------------------------------------------------------
 * mountScreen() / mountRoomScreens() used to live here, and the v3 header above
 * still describes them. They are now assets/screens.js, which renders four
 * different kinds of surface (title card, promo image, live data board, real
 * iframe) instead of the one kind this file knew how to make.
 *
 * The two modules still meet in exactly one place: every screen's hit target
 * carries `data-tool`, so onDocumentClick() below opens the tool. That means the
 * freezer gate, the deep-link router and the focus-return all keep working with
 * no knowledge of screens at all. Do not re-add a screen API here.
 * ========================================================================== */
