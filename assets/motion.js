/* =============================================================================
 * Cook County Cooks — assets/motion.js
 * THE MOTION TIER (contract C5) AND THE MOMENTS THAT HANG OFF A ROOM (v29 · S6)
 * -----------------------------------------------------------------------------
 * Jeff chose "polished + cinematic … premium, never in the way", on the same
 * store iPads that froze. So every moment on this site answers to ONE number,
 * written here and nowhere else:
 *
 *     <html data-motion="full | lite | off">        (design audit §5.2)
 *
 *   full   the whole choreography: room arrivals (M2), the hand-over grade
 *          (M3), the glow on things you can click (M5), live signage (M6).
 *   lite   the same page with the flourishes off: one 200 ms fade per arrival,
 *          opacity-only hovers, no atmosphere, no signage loops, every menu
 *          jump a quick cut. For a device that has shown it cannot keep up.
 *   off    prefers-reduced-motion: nothing moves that does not have to.
 *
 * Every other module READS it (engine, overlay, screens, find, the curtain,
 * theme.css); none of them writes it. absent = full, so a page that never
 * loads this file keeps working exactly as before.
 *
 * HOW THE TIER IS CHOSEN, in this order — the first rule that answers wins:
 *   1. prefers-reduced-motion: reduce  -> off. Always, whatever else says so:
 *      theme.css's @media blocks apply regardless, and an attribute that
 *      disagreed with them would only half-honour the request. A live
 *      listener follows the setting if it changes mid-session.
 *   2. ?motion=full|lite|off           -> that tier, PINNED: no probe and no
 *      demotion, so a test or a support call sees exactly what it asked for.
 *   3. sessionStorage 'ccc-motion'     -> an earlier demotion in this tab.
 *   4. a hardware hint                 -> lite when navigator.deviceMemory <= 2
 *      or hardwareConcurrency <= 2. A HINT: Chromium alone reports memory, and
 *      iOS Safari reports a fixed 4 or 8 cores (WebKit's fingerprinting
 *      guard), so a store iPad is never demoted by this line — rules 5 and 6
 *      are what can demote it. A 2-core desktop is.
 *   5. an idle probe                   -> after the hero has painted (C3) and
 *      the curtain is gone, 60 animation frames at an idle moment. p75 over
 *      20 ms, or more than 10% of them over 50 ms, on two probes in a row ->
 *      lite. iOS Low Power Mode caps rAF at 30 fps (documented), which lands
 *      here, correctly.
 *   6. real scrolling                  -> while the tier is full, the frame
 *      intervals of actual scroll frames (never idle, never under the viewer,
 *      never inside an M4 cut). A median over 24 ms across 2 s of scrolling,
 *      or 3 of the last 60 scroll frames over 50 ms -> lite.
 * A demotion is written to sessionStorage and is never undone in the session
 * (there is no promotion). html[data-motion-why] records which rule answered,
 * for a support call; a demotion also logs one console.info line.
 *
 * THE KEY NAMES ARE SHARED, and this file is their owner: the query parameter
 * `motion`, the sessionStorage key `ccc-motion`, the values full|lite|off.
 * index.html's first inline script mirrors rules 1-4 so the attribute is on
 * <html> before first paint (the curtain, the phone list and theme.css all see
 * it at once); this module re-derives the same answer when the cinema boots
 * and owns the attribute from then on. Change a name here and there together.
 *
 * WHAT ELSE LIVES HERE — the two moments that need a clock, not a stylesheet:
 *   · M2 "motion-ready". theme.css's room arrival hides a room's type and
 *     reticles until the room is OWNED (C2, engine.js) and then plays them in.
 *     Those pre-reveal styles apply only under html.motion-ready, which this
 *     file sets — so if JavaScript never runs, or the engine never speaks C2,
 *     nothing is ever hidden. A watchdog takes the class off again if no
 *     `ccc:room-owned` arrives after the first frame.
 *   · M5 the idle breath. After 6 s with no input in an owned room, the
 *     room's first object that is on screen breathes its glow once
 *     (0 -> .6 -> 0, 1.4 s). Once per room visit, one at a time site-wide,
 *     full tier only, never under the viewer, the palette or a menu.
 *
 * AND ONE COMPATIBILITY DUTY. ?motion=off without the OS setting has to look
 * like reduced motion, but that CSS lives in @media (prefers-reduced-motion:
 * reduce) blocks across theme.css and five modules' own sheets. Duplicating
 * them under an attribute selector would put a universal selector in the
 * always-on rule set (theme.css §03's note) and would drift. So while the
 * tier is off by override, the media text of those rules is rewritten to
 * match, and put back when it is not: the SAME rules apply, with no copy and
 * no cost to any other page. See forceReducedCss().
 *
 * Plain ES module. No dependencies. Every storage access is in try/catch.
 * ========================================================================== */

export const MOTION_PARAM = 'motion';       // ?motion=full|lite|off
export const MOTION_STORE = 'ccc-motion';   // sessionStorage: this tab's demotion
const TIERS = { full: 1, lite: 1, off: 1 };
const REDUCE_MQ = '(prefers-reduced-motion: reduce)';

const PROBE_FRAMES = 60;
const PROBE_P75_MS = 20;
const PROBE_LONG_MS = 50;
const PROBE_LONG_SHARE = 0.10;
const SCROLL_MEDIAN_MS = 24;
const SCROLL_WINDOW_MS = 2000;
const SCROLL_SPIKE_MS = 50;
const SCROLL_SPIKES = 3;          // of the last SCROLL_RING scroll frames
const SCROLL_RING = 60;
const SCROLL_IDLE_MS = 200;       // no scroll event for this long ends a sample run
const READY_WATCHDOG_MS = 3000;   // after the first frame, C2 must have spoken
const BREATH_IDLE_MS = 6000;
const BREATH_MS = 1400;

const html = document.documentElement;
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const raf = (f) => (window.requestAnimationFrame ? window.requestAnimationFrame(f) : setTimeout(() => f(now()), 16));

const st = {
  inited: false,
  tier: 'full',
  why: 'default',
  pinned: false,          // ?motion= override: no probe, no demotion
  demoted: false,
  listeners: new Set(),
  // the forced-off CSS mirror
  forced: false,
  rewritten: new Map(),   // CSSMediaRule -> original media text
  headMO: null,
  // rule 5
  probeFails: 0,
  probeTries: 0,
  probeDone: false,
  probe: null,
  // rule 6
  sampling: false,
  lastScroll: 0,
  lastT: 0,
  skip: 0,
  ring: [],
  win: [],
  winMs: 0,
  winCount: 0,
  // M2
  firstFrame: false,
  sawOwner: false,
  readyOk: true,
  watchdog: 0,
  // M5 breath
  owned: null,
  lastInput: 0,
  breathTimer: 0,
  breathed: false
};


/* ─────────────────────────────────────────────────────────────────────────────
 * 1 · THE STATIC DECISION (rules 1-4). index.html's first script mirrors this.
 * ────────────────────────────────────────────────────────────────────────── */

function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia(REDUCE_MQ).matches); }
  catch (_) { return false; }
}

function queryTier() {
  try {
    const q = new URLSearchParams(location.search).get(MOTION_PARAM);
    return TIERS[q] ? q : null;
  } catch (_) { return null; }
}

function storedTier() {
  try {
    const s = window.sessionStorage.getItem(MOTION_STORE);
    return TIERS[s] ? s : null;
  } catch (_) { return null; }
}

function weakHardware() {
  try {
    const dm = navigator.deviceMemory;
    const hc = navigator.hardwareConcurrency;
    if (typeof dm === 'number' && dm > 0 && dm <= 2) return true;
    if (typeof hc === 'number' && hc > 0 && hc <= 2) return true;
  } catch (_) { /* a hint, never a requirement */ }
  return false;
}

/** [tier, why] from rules 1-4. */
export function decideStaticTier() {
  if (reducedMotion()) return ['off', 'reduced'];
  const q = queryTier();
  if (q) return [q, 'query'];
  const s = storedTier();
  if (s) return [s, 'session'];
  if (weakHardware()) return ['lite', 'hint'];
  return ['full', 'default'];
}

/** The tier in force: what html[data-motion] says, absent = full (C5). */
export function motionTier() {
  const m = html.getAttribute('data-motion');
  return TIERS[m] ? m : 'full';
}

/** Subscribe to tier changes: fn({ tier, why, from }). Returns an unsubscribe. */
export function onMotionChange(fn) {
  st.listeners.add(fn);
  return () => st.listeners.delete(fn);
}

function apply(tier, why) {
  const from = st.tier;
  st.tier = tier;
  st.why = why;
  if (html.getAttribute('data-motion') !== tier) html.setAttribute('data-motion', tier);
  if (html.getAttribute('data-motion-why') !== why) html.setAttribute('data-motion-why', why);
  forceReducedCss(tier === 'off' && !reducedMotion());
  syncReady();
  if (tier !== 'full') { cancelBreath(); stopSampling(); }
  if (from !== tier) {
    for (const fn of st.listeners) { try { fn({ tier, why, from }); } catch (_) { /* a listener's bug is its own */ } }
    try { document.dispatchEvent(new CustomEvent('ccc:motion', { detail: { tier, why, from } })); } catch (_) { /* noop */ }
  }
}

function demote(why, detail) {
  if (st.tier !== 'full' || st.pinned) return;
  st.demoted = true;
  try { window.sessionStorage.setItem(MOTION_STORE, 'lite'); } catch (_) { /* the flag still holds for this page */ }
  apply('lite', why);
  try { console.info('[motion] lite: ' + why + (detail ? ' ' + detail : '')); } catch (_) { /* noop */ }
}

function onReducedChange() {
  let [tier, why] = decideStaticTier();
  // never a promotion: a page that was demoted stays demoted when the OS
  // setting is switched back off, even if sessionStorage refused the flag
  if (st.demoted && tier === 'full') { tier = 'lite'; why = 'session'; }
  apply(tier, why);
  if (tier === 'full') scheduleProbe(0);
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · ?motion=off WITHOUT THE OS SETTING — the same CSS, not a copy of it.
 *
 * Every rule written for reduced motion sits in an @media whose query names
 * (prefers-reduced-motion: reduce). While this is on, that feature in each
 * such rule's media list is replaced by one that always matches; when it goes
 * off the original text is put back. Stylesheets that arrive later (each
 * module injects its own <style> when it mounts) are caught by an observer on
 * <head> for as long as the override lasts. A cross-origin sheet throws on
 * cssRules and is skipped; there are none on this site.
 * ────────────────────────────────────────────────────────────────────────── */

const RM_TEST = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i;
const RM_ALL = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/gi;
const ALWAYS = '(min-width: 0px)';

function walkRules(list, fn) {
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r.media && typeof r.media.mediaText === 'string' && r.cssRules) fn(r);
    if (r.cssRules) walkRules(r.cssRules, fn);
  }
}

function rewriteSheet(sheet) {
  let rules = null;
  try { rules = sheet.cssRules; } catch (_) { return; }
  walkRules(rules, (r) => {
    if (st.rewritten.has(r)) return;
    const text = r.media.mediaText;
    if (!RM_TEST.test(text)) return;
    try {
      r.media.mediaText = text.replace(RM_ALL, ALWAYS);
      st.rewritten.set(r, text);
    } catch (_) { /* leave it as it was */ }
  });
}

function rewriteAll() {
  const sheets = document.styleSheets;
  for (let i = 0; i < sheets.length; i++) rewriteSheet(sheets[i]);
}

function forceReducedCss(on) {
  if (on === st.forced) { if (on) rewriteAll(); return; }
  st.forced = on;
  if (on) {
    rewriteAll();
    try {
      st.headMO = new MutationObserver((recs) => {
        for (const rec of recs) {
          for (const n of rec.addedNodes) {
            if (n.nodeName === 'STYLE' && n.sheet) rewriteSheet(n.sheet);
            else if (n.nodeName === 'LINK') n.addEventListener('load', () => { if (st.forced && n.sheet) rewriteSheet(n.sheet); }, { once: true });
          }
        }
      });
      st.headMO.observe(document.head, { childList: true });
    } catch (_) { /* sheets injected later keep their own media */ }
  } else {
    if (st.headMO) { try { st.headMO.disconnect(); } catch (_) { /* noop */ } st.headMO = null; }
    for (const [r, text] of st.rewritten) { try { r.media.mediaText = text; } catch (_) { /* noop */ } }
    st.rewritten.clear();
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 3 · RULE 5 — THE IDLE PROBE
 *
 * After the hero has painted and the curtain has gone, at an idle moment, time
 * 60 animation frames. Nothing is animating then (the engine parks at rest),
 * so the interval is what this device takes to produce an empty frame. Input
 * during the probe aborts it (a scroll is not idle); rule 6 measures scrolling.
 * Two failing probes in a row demote: one bad second while a tool's iframe
 * finishes loading is not a verdict on the device.
 * ────────────────────────────────────────────────────────────────────────── */

function scheduleProbe(delay) {
  if (st.pinned || st.probeDone || st.tier !== 'full') return;
  setTimeout(() => {
    const go = () => runProbe();
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 200);
  }, delay);
}

function busy() {
  return document.hidden || html.classList.contains('is-viewing') || html.classList.contains('ccc-locked') ||
    !!document.getElementById('curtain') || !!document.getElementById('ccc-cut');
}

function runProbe() {
  if (st.pinned || st.probeDone || st.tier !== 'full') return;
  if (busy()) { retryProbe(1500); return; }
  st.probeTries++;
  const samples = [];
  let last = 0;
  let aborted = false;
  const abort = () => { aborted = true; };
  const EV = ['scroll', 'wheel', 'pointerdown', 'keydown', 'touchstart'];
  EV.forEach((t) => window.addEventListener(t, abort, { passive: true, capture: true }));
  const done = () => EV.forEach((t) => window.removeEventListener(t, abort, { capture: true }));
  const step = (t) => {
    if (aborted || busy()) { done(); retryProbe(2500); return; }
    if (last) samples.push(t - last);
    last = t;
    if (samples.length < PROBE_FRAMES) { raf(step); return; }
    done();
    judgeProbe(samples);
  };
  raf(step);
}

function retryProbe(ms) {
  if (st.probeTries >= 6) { st.probeDone = true; return; }
  scheduleProbe(ms);
}

function judgeProbe(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const p75 = sorted[Math.floor(0.75 * (sorted.length - 1))];
  const long = samples.filter((x) => x > PROBE_LONG_MS).length;
  const fail = p75 > PROBE_P75_MS || long > samples.length * PROBE_LONG_SHARE;
  st.probe = { p75: Math.round(p75 * 10) / 10, long, n: samples.length, fail };
  if (!fail) { st.probeDone = true; st.probeFails = 0; return; }
  st.probeFails++;
  if (st.probeFails >= 2) {
    st.probeDone = true;
    demote('probe', `(p75 ${st.probe.p75} ms, ${long}/${samples.length} frames over ${PROBE_LONG_MS} ms)`);
  } else {
    retryProbe(3000);
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 4 · RULE 6 — REAL SCROLL FRAMES
 *
 * A scroll event starts a rAF sampler that runs only while scroll events keep
 * coming (it stops 200 ms after the last one), so it adds no frames of its own:
 * the engine is already drawing every one of them. It records the interval
 * between consecutive frames, skipping the first two of each run (the wake-up
 * frame is not the scroll), and any frame under the viewer, inside an M4 cut
 * or in a hidden tab.
 * ────────────────────────────────────────────────────────────────────────── */

function excludedFrame() {
  return document.hidden || html.classList.contains('is-viewing') || html.classList.contains('ccc-locked') ||
    !!document.getElementById('ccc-cut') || !st.firstFrame;
}

function onScroll() {
  if (st.tier !== 'full' || st.pinned) return;
  st.lastScroll = now();
  if (st.sampling) return;
  st.sampling = true;
  st.lastT = 0;
  st.skip = 2;
  raf(sampleFrame);
}

function stopSampling() { st.sampling = false; }

function sampleFrame(t) {
  if (!st.sampling || st.tier !== 'full') { st.sampling = false; return; }
  if (now() - st.lastScroll > SCROLL_IDLE_MS) { st.sampling = false; return; }
  if (excludedFrame()) { st.lastT = 0; st.skip = 1; raf(sampleFrame); return; }
  if (st.lastT) {
    if (st.skip > 0) st.skip--;
    else recordScrollFrame(t - st.lastT);
  }
  st.lastT = t;
  raf(sampleFrame);
}

function recordScrollFrame(dt) {
  st.ring.push(dt);
  if (st.ring.length > SCROLL_RING) st.ring.shift();
  let spikes = 0;
  for (const x of st.ring) if (x > SCROLL_SPIKE_MS) spikes++;
  // judged once a third of the window is in: three hitches among a session's
  // first eight scroll frames are the page waking up, not a verdict
  if (st.ring.length >= SCROLL_RING / 3 && spikes >= SCROLL_SPIKES) {
    demote('scroll', `(${spikes} of the last ${st.ring.length} scroll frames over ${SCROLL_SPIKE_MS} ms)`);
    return;
  }
  st.win.push(dt);
  st.winMs += dt;
  while (st.win.length > 1 && st.winMs - st.win[0] >= SCROLL_WINDOW_MS) st.winMs -= st.win.shift();
  if (st.winMs >= SCROLL_WINDOW_MS && ++st.winCount % 15 === 0) {
    const sorted = st.win.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    if (med > SCROLL_MEDIAN_MS) demote('scroll', `(median ${Math.round(med)} ms over ${Math.round(st.winMs)} ms of scrolling)`);
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 5 · M2 — motion-ready, and the watchdog that takes it away again
 * ────────────────────────────────────────────────────────────────────────── */

function syncReady() {
  html.classList.toggle('motion-ready', st.tier !== 'off' && st.readyOk);
}

function onFirstFrame() {
  if (st.firstFrame) return;
  st.firstFrame = true;
  if (!st.sawOwner) {
    clearTimeout(st.watchdog);
    st.watchdog = setTimeout(() => {
      if (st.sawOwner) return;
      // The engine never spoke C2: show every room's type and objects as they
      // are, for good. Nothing may stay hidden behind a class nobody flips.
      st.readyOk = false;
      syncReady();
    }, READY_WATCHDOG_MS);
  }
  scheduleProbe(900);
}

function onRoomOwned(ev) {
  st.sawOwner = true;
  clearTimeout(st.watchdog);
  if (!st.readyOk) { st.readyOk = true; syncReady(); }
  const d = (ev && ev.detail) || {};
  const room = d.el || (d.elId && document.getElementById(d.elId)) || document.querySelector('.room.is-owned');
  // a new visit: the breath may play once more, in this room only
  cancelBreath();
  st.owned = room || null;
  st.breathed = false;
  armBreath();
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 6 · M5 — THE IDLE BREATH
 *
 * One glow breath on the owned room's first on-screen object after 6 s with no
 * input. theme.css draws it: `.hotspot.is-breathing::after` runs @keyframes
 * m-breath once (the same pre-painted glow the hover fades in). This file only
 * decides when, and takes the class off again at animationend.
 * ────────────────────────────────────────────────────────────────────────── */

function noteInput() {
  st.lastInput = now();
}

function armBreath() {
  clearTimeout(st.breathTimer);
  st.breathTimer = 0;
  if (st.tier !== 'full' || st.breathed || !st.owned) return;
  st.breathTimer = setTimeout(breathe, BREATH_IDLE_MS);
}

function cancelBreath() {
  clearTimeout(st.breathTimer);
  st.breathTimer = 0;
  const on = document.querySelectorAll('.hotspot.is-breathing');
  for (const n of on) n.classList.remove('is-breathing');
}

function quietScreen() {
  if (document.hidden) return false;
  if (html.classList.contains('is-viewing') || html.classList.contains('ccc-locked')) return false;
  const fr = document.getElementById('find-root');
  if (fr && fr.classList.contains('is-open')) return false;
  const c3 = document.getElementById('c3-menu');
  if (c3 && (c3.classList.contains('is-open') || c3.hasAttribute('data-open') || c3.hasAttribute('open'))) return false;
  const modal = document.getElementById('modal-root');
  if (modal && modal.firstElementChild) return false;
  if (document.getElementById('ccc-cut')) return false;
  return true;
}

function firstObject(room) {
  const layer = room && room.querySelector('.hotspots');
  if (!layer) return null;
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  for (const h of layer.children) {
    if (!h.classList || !h.classList.contains('hotspot')) continue;
    const r = h.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;          // display:none in the narrow band
    if (r.left < 0 || r.top < 56 || r.right > vw || r.bottom > vh) continue;   // wholly on screen
    return h;
  }
  return null;
}

function breathe() {
  st.breathTimer = 0;
  if (st.tier !== 'full' || st.breathed || !st.owned || !st.owned.classList.contains('is-owned')) return;
  const idle = now() - st.lastInput;
  if (idle < BREATH_IDLE_MS) { st.breathTimer = setTimeout(breathe, BREATH_IDLE_MS - idle); return; }
  if (!quietScreen()) { st.breathTimer = setTimeout(breathe, 2000); return; }
  if (document.querySelector('.hotspot.is-breathing')) return;     // one at a time, site-wide
  const target = firstObject(st.owned);
  st.breathed = true;
  if (!target || target.matches(':hover, :focus-visible')) return;
  target.classList.add('is-breathing');
  let t = 0;
  const end = () => { clearTimeout(t); target.classList.remove('is-breathing'); };
  target.addEventListener('animationend', end, { once: true });
  t = setTimeout(end, BREATH_MS + 400);
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 7 · INIT — called first thing in cinema.js boot(), before the engine exists.
 * ────────────────────────────────────────────────────────────────────────── */

export function initMotion() {
  if (st.inited) return api();
  st.inited = true;

  const [tier, why] = decideStaticTier();
  st.pinned = why === 'query';
  st.demoted = why === 'session' && tier === 'lite';
  apply(tier, why);

  try {
    const mq = window.matchMedia(REDUCE_MQ);
    if (mq.addEventListener) mq.addEventListener('change', onReducedChange);
    else if (mq.addListener) mq.addListener(onReducedChange);
  } catch (_) { /* no live listener; the tier holds for this page */ }

  document.addEventListener('ccc:first-frame', onFirstFrame);
  document.addEventListener('ccc:room-owned', onRoomOwned);
  // the engine may already own a room if boot ran late (never today)
  if (document.querySelector('.room.is-owned')) onRoomOwned(null);
  // no first frame at all within 8 s: run the watchdog anyway
  setTimeout(onFirstFrame, 8000);

  window.addEventListener('scroll', onScroll, { passive: true });
  const IN = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
  IN.forEach((t) => window.addEventListener(t, noteInput, { passive: true, capture: true }));
  noteInput();

  return api();
}

function api() {
  return {
    get tier() { return st.tier; },
    get why() { return st.why; },
    get probe() { return st.probe; },
    onChange: onMotionChange
  };
}
