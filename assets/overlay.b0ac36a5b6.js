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
import { freshUrl } from './freshurl.11f28a5de9.js';
export { freshUrl };

/* ASK THE SERVER, DO NOT ASK THE IFRAME. preflight() is the only thing in this
 * build that can tell a tool that loaded from a tool that 404'd — the iframe
 * cannot, and §6 below carries the twelve-shape measurement that proves it.
 * Its own file because screens.js needs it too and must not import this one. */
import { preflight, preflightCopy } from './preflight.b10841a986.js';
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

function watchTriggerLinks() {
  normaliseTriggerLinks(document.body || document.documentElement);
  if (typeof MutationObserver !== 'function') return;
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') { normaliseTriggerLinks(m.target); continue; }
      for (const n of m.addedNodes) if (n.nodeType === 1) normaliseTriggerLinks(n);
    }
  });
  mo.observe(document.documentElement, {
    childList: true, subtree: true,
    // pocket.js used to rewrite href after the fact; if anything else does,
    // the rewrite is undone in the same task.
    attributes: true, attributeFilter: ['href', 'target']
  });
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
  initialised: false
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
  return state.registry.get(slug) || null;
}

/* -----------------------------------------------------------------------------
 * 2. Stylesheet
 *    Injected once. Everything is prefixed `ccc-` and every colour is a
 *    custom property with a fallback, so assets/theme.a73825e539.css (Agent D) can
 *    retheme the viewer without touching this file.
 * -------------------------------------------------------------------------- */

const STYLES = `
:root {
  --ccc-ov-z: 9000;
  --ccc-ov-ease: cubic-bezier(.22,.61,.36,1);
}

/* --- background scroll lock ------------------------------------------------ */
html.ccc-locked { scroll-behavior: auto !important; }
body.ccc-locked {
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
  opacity: 0;
  transition: opacity .28s var(--ccc-ov-ease);
}
.ccc-ov[hidden] { display: none; }
.ccc-ov.is-in { opacity: 1; }

.ccc-ov__scrim {
  position: absolute; inset: 0;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(24,20,16,.72), rgba(6,6,7,.94) 70%),
    var(--ccc-ov-scrim, rgba(6,6,7,.92));
  backdrop-filter: blur(18px) saturate(.9);
  -webkit-backdrop-filter: blur(18px) saturate(.9);
}

/* The panel: a "service window" that slides up a hair as it arrives. */
.ccc-ov__panel {
  position: relative;
  grid-row: 1 / -1;
  display: grid;
  grid-template-rows: auto 1fr;
  width: min(1680px, 100vw - clamp(0px, 4vw, 56px));
  height: min(100svh - clamp(0px, 4vw, 56px), 1100px);
  margin: auto;
  border-radius: var(--ccc-ov-radius, 18px);
  overflow: hidden;
  background: var(--ccc-ov-panel, #101012);
  box-shadow:
    0 0 0 1px rgba(255,255,255,.07),
    0 60px 140px -30px rgba(0,0,0,.9);
  transform: translate3d(0, 18px, 0) scale(.985);
  opacity: 0;
  transition: transform .34s var(--ccc-ov-ease), opacity .34s var(--ccc-ov-ease);
}
.ccc-ov.is-in .ccc-ov__panel { transform: none; opacity: 1; }

@media (max-width: 720px) {
  .ccc-ov__panel { width: 100vw; height: 100svh; border-radius: 0; }
}

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
@media (max-width: 640px) { .ccc-ov__blurb { display: none; } }

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

/* --- stage (frame / skeleton / fallback share one box) --------------------- */
.ccc-ov__stage { position: relative; background: var(--ccc-ov-stage, #f7f5f1); overflow: hidden; }

.ccc-ov__frame {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  border: 0; display: block;
  background: transparent;
  opacity: 0;
  transition: opacity .4s var(--ccc-ov-ease);
}
.ccc-ov__frame.is-shown { opacity: 1; }

/* --- loading skeleton: a plausible dashboard, gently shimmering ------------ */
.ccc-ov__skel {
  position: absolute; inset: 0;
  padding: clamp(16px, 3vw, 34px);
  display: grid; gap: clamp(12px, 1.6vw, 20px);
  grid-template-rows: auto auto 1fr;
  background: var(--ccc-ov-stage, #f7f5f1);
  overflow: hidden;
}
.ccc-ov__skel[hidden] { display: none; }
.ccc-ov__skel::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 25%, rgba(255,255,255,.85) 50%, transparent 75%);
  transform: translate3d(-60%,0,0);
  animation: ccc-shimmer 1.5s linear infinite;
  pointer-events: none;
}
@keyframes ccc-shimmer { to { transform: translate3d(60%,0,0); } }

.ccc-sk { background: rgba(20,22,26,.075); border-radius: 8px; }
.ccc-sk--title { height: clamp(20px, 2.4vw, 28px); width: min(340px, 52%); }
.ccc-sk--tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: clamp(10px, 1.4vw, 16px); background: none; }
.ccc-sk--tile { height: clamp(74px, 9vw, 104px); border-radius: 12px; background: rgba(20,22,26,.06); }
.ccc-sk--body { border-radius: 14px; background: rgba(20,22,26,.05); }

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

@media (prefers-reduced-motion: reduce) {
  .ccc-ov, .ccc-ov__panel, .ccc-ov__frame { transition: none; }
  .ccc-ov__skel::after { animation: none; }
  .ccc-ov__panel { transform: none; }
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
  document.body.classList.add('ccc-locked');
  document.body.style.top = `-${state.scrollY}px`;
  state.locked = true;
}

function unlockScroll() {
  if (!state.locked) return;
  document.body.classList.remove('ccc-locked');
  document.body.style.top = '';
  // Restore synchronously, before the browser paints, and without smoothing.
  const prev = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, state.scrollY);
  document.documentElement.style.scrollBehavior = prev;
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
       first in DOM order and it is the way out. Now: ✕ → frame → body → ✕. */
    ev.preventDefault(); first.focus();
  }
}

/** Hide the rest of the page from assistive tech (and, where supported, from
 *  interaction) while the dialog is up. */
function setBackgroundInert(on) {
  for (const node of Array.from(document.body.children)) {
    if (state.ui && node === state.ui.root) continue;
    if (on) {
      if (node.hasAttribute('aria-hidden')) node.dataset.cccPrevAria = node.getAttribute('aria-hidden');
      node.setAttribute('aria-hidden', 'true');
      if ('inert' in node) { node.dataset.cccPrevInert = node.inert ? '1' : '0'; node.inert = true; }
    } else {
      if ('cccPrevAria' in node.dataset) { node.setAttribute('aria-hidden', node.dataset.cccPrevAria); delete node.dataset.cccPrevAria; }
      else node.removeAttribute('aria-hidden');
      if ('inert' in node && 'cccPrevInert' in node.dataset) { node.inert = node.dataset.cccPrevInert === '1'; delete node.dataset.cccPrevInert; }
    }
  }
}

/* -----------------------------------------------------------------------------
 * 5. Building the viewer DOM (once, lazily)
 * -------------------------------------------------------------------------- */

function buildUI() {
  if (state.ui) return state.ui;

  const title = el('h2', { class: 'ccc-ov__title', id: 'ccc-ov-title' });
  const blurb = el('p', { class: 'ccc-ov__blurb', id: 'ccc-ov-blurb' });

  /* The chrome bar used to carry an always-visible "Open in new tab" beside
     the close button, on the argument that a rep should never have to reach a
     failure state to get a real link. The client has since asked for the
     opposite: no way out of the viewer that shows where a tool is hosted. The
     close button is the bar's only control now, which also makes it the first
     AND last tabbable thing before the frame — Shift+Tab out of a cross-origin
     frame still lands on it (see trapFocus()). */
  const closeBtn = el('button', {
    class: 'ccc-ov__btn ccc-ov__btn--icon',
    type: 'button',
    'aria-label': 'Close tool and return to the restaurant',
    html: '<span aria-hidden="true">✕</span>'
  });

  const bar = el('header', { class: 'ccc-ov__bar' }, [
    el('div', { class: 'ccc-ov__id' }, [title, blurb]),
    el('div', { class: 'ccc-ov__actions' }, [closeBtn])
  ]);

  const skel = el('div', { class: 'ccc-ov__skel', 'aria-hidden': 'true' }, [
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
    root, panel, title, blurb, closeBtn,
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

/** Mint a viewer iframe. Fresh elements are how we stay out of history. */
function makeStageFrame() {
  return el('iframe', {
    class: 'ccc-ov__frame',
    title: 'Tool',
    allow: 'clipboard-write; fullscreen; geolocation',
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
function navigateStageFrame(ui, url) {
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
  const fresh = makeStageFrame();
  ui.frame.replaceWith(fresh);
  ui.frame = fresh;
}

function clearFrameTimer() {
  if (state.frameTimer) { clearTimeout(state.frameTimer); state.frameTimer = 0; }
  if (state.slowTimer) { clearTimeout(state.slowTimer); state.slowTimer = 0; }
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
  if (d.source !== 'ccc-arcade' || d.action !== 'open-tool') return;

  const slug = typeof d.slug === 'string' ? d.slug : '';
  // Shape first (the same character class HASH_RE accepts), then existence.
  if (!/^[A-Za-z0-9_-]+$/.test(slug) || !getTool(slug)) {
    console.warn(`[overlay] arcade asked for an unknown tool "${slug}"; ignored.`);
    return;
  }

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
 * Point the iframe at a tool, ask the server whether the tool is really there,
 * and keep the rep informed about which of those two is taking the time.
 *
 * THE ORDER MATTERS. The frame is navigated FIRST and the preflight goes out
 * beside it, not before it: a working tool must not pay a round trip for the
 * benefit of a broken one. The preflight then either overrules the frame (the
 * server said 404 / nothing answered — card, now, no six-second stare) or
 * confirms it (2xx — the document exists, so anything slow after that is size
 * or network, and is reported as progress rather than as failure).
 */
function showFrame(tool, { force = false } = {}) {
  const ui = state.ui;
  clearFrameTimer();

  ui.fallback.hidden = true;
  hideNote();
  ui.frame.classList.remove('is-shown');
  ui.skel.hidden = false;
  ui.status.textContent = `Loading ${tool.label}…`;

  // Known refusers: skip the spinner entirely and go straight to the card.
  // Nothing routes here today except SharePoint/Microsoft hosts — none of which
  // are in data/tools.f0f6c533e3.json — but the list stays as cheap insurance for whatever
  // gets added next. It is NOT the failure detection; preflight() is.
  if (!force && isKnownUnframeable(tool.url)) {
    showFallback(
      tool,
      `${tool.label} cannot be displayed inside the site. It opens in its own window — you'll come straight back here when you're done.`
    );
    return;
  }

  let settled = false;          // a verdict has been reached and announced
  let confirmed = null;         // preflight's verdict, once it lands
  let preflightLength = -1;     // Content-Length the server reported, or -1

  const onLoad = () => {
    // Give a blocked-frame error document a tick to settle before probing.
    setTimeout(() => {
      if (frame !== ui.frame) return;              // superseded by a newer open
      // SAME-ORIGIN ONLY. See looksBlocked(): for a cross-origin URL this
      // cannot tell success from any failure, so it is not consulted there.
      if (looksBlocked(frame, tool.url)) {
        settled = true;
        showFallback(tool, `${tool.label} refused to load inside the site.`);
        return;
      }
      settled = true;
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
      /* WHAT WE ARE ALLOWED TO CLAIM. "loaded" is only honest when the server
         told us the document is there. With a 2xx in hand it is; without one
         (an origin that sends no CORS header, a browser with no fetch) all we
         know is that the frame fired `load`, and the old unconditional
         "<tool> loaded." over a grey void is precisely the defect. */
      ui.status.textContent = (confirmed === 'ok' || !isCrossOrigin(tool.url))
        ? `${tool.label} loaded.`
        : `${tool.label} is open in the viewer. If it looks empty, close it and open it again.`;
      maybeWarnRefused();
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
    if (!isCrossOrigin(tool.url)) return;
    if (confirmed !== 'ok') return;                 // no Content-Length to reason from
    if (!(preflightLength >= 500 * 1024)) return;
    if (Date.now() - startedAt > 200) return;
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

  /* ── the preflight ────────────────────────────────────────────────────────
     One HEAD request, in parallel with the frame. It is the only thing in the
     build that can tell a tool that loaded from a tool that 404'd; the twelve
     measured shapes and the curl evidence for the CORS headers are all in
     preflight.js. A verdict of `gone` or `unreachable` is the server's own
     answer, so it earns an immediate card and the dead frame is discarded. */
  preflight(tool.url).then((v) => {
    if (frame !== ui.frame || state.activeSlug === null) return;   // superseded
    confirmed = v.verdict;
    preflightLength = v.length;

    /* A DEFINITE FAILURE OVERRULES A REVEALED FRAME, and it has to.
       The failure shapes all fire `load` in 8-23 ms, which is faster than any
       round trip, so by the time the status code comes back the frame has
       usually already been faded in over a grey void. `settled` is not a veto
       here: the server saying 404 outranks an iframe that cannot say anything.
       (It cannot fight a WORKING tool: `gone` needs a real error status, or a
       CORS refusal from a host verified to always send the header; and
       `unreachable` needs BOTH probes refused at the network level.) */
    if (v.verdict === 'gone' || v.verdict === 'empty') {
      settled = true;
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
         is the last word; if it was one dropped request, onLoad() lifts the
         card off the tool when it lands. Nothing is lost either way. */
      settled = true;
      showFallback(tool, preflightCopy(v, tool.label), {
        keepFrame: true,
        announce: `${tool.label} could not be reached. Still trying behind this card.`
      });
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
      /* Nothing answered inside preflight.js's PREFLIGHT_TIMEOUT_MS (8s), and
         the frame has not fired either. That is a HANG, which is the one
         failure the old six-second watchdog got right — so say so at eight
         seconds rather than thirty, but KEEP the frame: a hung request can
         still complete, and onLoad() lifts this card off it if it does. */
      showFallback(tool, `${tool.label} is not answering. It may be the network rather than the tool — if you are on store wifi, check you are past the sign-in page.`,
        { keepFrame: true,
          announce: `${tool.label} is not answering. Still trying behind this card.` });
    }
    // 'ok' and 'unknown': carry on. The frame is the one doing the work.
  });

  /* ── the two clocks ───────────────────────────────────────────────────────
     Neither is a verdict any more. The first says the document is big; the
     second says it has been long enough that you deserve a choice. Both leave
     the iframe alone, so nothing that is nearly finished is thrown away —
     which is what firing the old 6s watchdog did. */
  state.slowTimer = window.setTimeout(() => {
    if (settled || frame !== ui.frame) return;
    showNote(
      `Still loading ${tool.label}. These sheets are large — the 6th Gen quote sheet alone is 1.3 MB, and on a store connection that is a real wait.`,
      tool
    );
    ui.status.textContent = `${tool.label} is still loading. It is a large document.`;
  }, SLOW_NOTE_MS);

  state.frameTimer = window.setTimeout(() => {
    if (settled || frame !== ui.frame) return;
    showFallback(tool,
      `${tool.label} is still coming down after ${Math.round(FRAME_TIMEOUT_MS / 1000)} seconds. It is a large document on a slow connection — it is still loading behind this card and will appear if it lands.`,
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
  if (state.activeSlug === null && hashSlug() === slug) {
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
 * WHY THE PAGE NEEDS TO KNOW. The scrim is 92–94% opaque with an 18px blur,
 * so nothing behind the viewer is visible — but everything behind it was
 * still RUNNING: on an iPad in the Dining Room that is two live iframes of the
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
 */
export function openTool(slug, opts = {}) {
  const { history: doPush = true, trigger = null, bypassGate = false, source = 'api' } = opts;
  const tool = getTool(slug);

  if (!tool) {
    // Registry may not have arrived yet (deep link on a cold load).
    if (!state.ready) { whenReady().then(() => openTool(slug, opts)); return; }
    console.warn(`[overlay] unknown tool "${slug}"`);
    return;
  }

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

  injectStyles();
  const ui = buildUI();
  const swapping = state.activeSlug !== null;

  state.activeSlug = slug;
  ui.title.textContent = tool.label;
  ui.blurb.textContent = tool.blurb || '';
  state.openedAt = Date.now();
  state.staleOffered = false;

  if (!swapping) {
    state.lastFocus = trigger || document.activeElement;
    lockScroll();
    ui.root.hidden = false;
    setBackgroundInert(true);
    // Next frame so the transition has a starting state to animate from.
    requestAnimationFrame(() => ui.root.classList.add('is-in'));
    document.addEventListener('keydown', onKeydown, true);
    announceViewer('open', slug, tool);
  }

  if (tool.external_only && !isClientHosted(tool.url)) {
    showFallback(tool, `${tool.label} opens in its own window.`);
  } else {
    showFrame(tool);
  }

  if (doPush) {
    try {
      history.pushState({ cccTool: slug }, '', `#/tool/${slug}`);
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
    history.back();
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
  document.removeEventListener('keydown', onKeydown, true);
  announceViewer('close', slug, slug ? getTool(slug) : null);

  if (!ui) return;

  ui.root.classList.remove('is-in');
  ui.frame.onload = ui.frame.onerror = null;
  ui.frame.classList.remove('is-shown');
  ui.status.textContent = '';
  ui.note.hidden = true;
  state.openedAt = 0;
  state.staleOffered = false;

  const finish = () => {
    if (state.activeSlug !== null) return;       // reopened mid-transition
    ui.root.hidden = true;
    blankStageFrame(ui);                         // unload the tool; adds no history
    ui.fallback.hidden = true;
    ui.skel.hidden = false;
    setBackgroundInert(false);
    unlockScroll();
    restoreFocus(slug);
  };

  if (reduceMotion()) finish();
  else setTimeout(finish, 300);                  // matches the CSS transition
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
    ev.preventDefault();
    ev.stopPropagation();
    closeTool();
  }
}

/* -----------------------------------------------------------------------------
 * 8. Routing — the viewer has its own URL
 * -------------------------------------------------------------------------- */

/** Reconcile the viewer with whatever the address bar currently says. */
function syncFromLocation() {
  const slug = hashSlug();
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
  openTool(slug, { trigger, source: 'click' });
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
 * @param {Array}   [options.tools]     tools array (as in data/tools.f0f6c533e3.json). If
 *                                      omitted we look at window.CCC_TOOLS /
 *                                      window.CCC?.tools, then fetch toolsUrl.
 * @param {string}  [options.toolsUrl]  default 'data/tools.f0f6c533e3.json'
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
    toolsUrl = 'data/tools.f0f6c533e3.json',
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
      if (document.visibilityState === 'visible') onViewerVisible();
    });
    window.addEventListener('pageshow', (ev) => { if (ev.persisted) onViewerVisible(); });
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
     fetch of data/tools.f0f6c533e3.json — which is the one thing the inline payload exists
     to avoid (fetch() against a file:// URL is refused outright, and Jeff
     reviews builds off a USB stick). The real global is read first now; the
     two old spellings are kept behind it in case something out there sets one,
     and the fetch stays as the last resort. */
  const inlineTools =
    (window.__CCC_INLINE__ && window.__CCC_INLINE__.tools) ||
    (window.CCC && window.CCC.tools) || window.CCC_TOOLS || null;

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
