


export const MOTION_PARAM = 'motion';       
export const MOTION_STORE = 'ccc-motion';   
const TIERS = { full: 1, lite: 1, off: 1 };
const REDUCE_MQ = '(prefers-reduced-motion: reduce)';

const PROBE_FRAMES = 60;
const PROBE_P75_MS = 20;
const PROBE_LONG_MS = 50;
const PROBE_LONG_SHARE = 0.10;
const SCROLL_MEDIAN_MS = 24;
const SCROLL_WINDOW_MS = 2000;
const SCROLL_SPIKE_MS = 50;
const SCROLL_SPIKES = 3;          
const SCROLL_RING = 60;
const SCROLL_IDLE_MS = 200;       
const READY_WATCHDOG_MS = 3000;   
const BREATH_IDLE_MS = 6000;
const BREATH_MS = 1400;

const html = document.documentElement;
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const raf = (f) => (window.requestAnimationFrame ? window.requestAnimationFrame(f) : setTimeout(() => f(now()), 16));

const st = {
  inited: false,
  tier: 'full',
  why: 'default',
  pinned: false,          
  demoted: false,
  listeners: new Set(),
  
  forced: false,
  rewritten: new Map(),   
  headMO: null,
  
  probeFails: 0,
  probeTries: 0,
  probeDone: false,
  probe: null,
  
  sampling: false,
  lastScroll: 0,
  lastT: 0,
  skip: 0,
  ring: [],
  win: [],
  winMs: 0,
  winCount: 0,
  
  firstFrame: false,
  sawOwner: false,
  readyOk: true,
  watchdog: 0,
  
  owned: null,
  lastInput: 0,
  breathTimer: 0,
  breathed: false
};





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
  } catch (_) {   }
  return false;
}

 
export function decideStaticTier() {
  if (reducedMotion()) return ['off', 'reduced'];
  const q = queryTier();
  if (q) return [q, 'query'];
  const s = storedTier();
  if (s) return [s, 'session'];
  if (weakHardware()) return ['lite', 'hint'];
  return ['full', 'default'];
}

 
export function motionTier() {
  const m = html.getAttribute('data-motion');
  return TIERS[m] ? m : 'full';
}

 
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
    for (const fn of st.listeners) { try { fn({ tier, why, from }); } catch (_) {   } }
    try { document.dispatchEvent(new CustomEvent('ccc:motion', { detail: { tier, why, from } })); } catch (_) {   }
  }
}

function demote(why, detail) {
  if (st.tier !== 'full' || st.pinned) return;
  st.demoted = true;
  try { window.sessionStorage.setItem(MOTION_STORE, 'lite'); } catch (_) {   }
  apply('lite', why);
  try { console.info('[motion] lite: ' + why + (detail ? ' ' + detail : '')); } catch (_) {   }
}

function onReducedChange() {
  let [tier, why] = decideStaticTier();
  
  
  if (st.demoted && tier === 'full') { tier = 'lite'; why = 'session'; }
  apply(tier, why);
  if (tier === 'full') scheduleProbe(0);
}





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
    } catch (_) {   }
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
    } catch (_) {   }
  } else {
    if (st.headMO) { try { st.headMO.disconnect(); } catch (_) {   } st.headMO = null; }
    for (const [r, text] of st.rewritten) { try { r.media.mediaText = text; } catch (_) {   } }
    st.rewritten.clear();
  }
}





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
  
  cancelBreath();
  st.owned = room || null;
  st.breathed = false;
  armBreath();
}





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
    if (r.width < 1 || r.height < 1) continue;          
    if (r.left < 0 || r.top < 56 || r.right > vw || r.bottom > vh) continue;   
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
  if (document.querySelector('.hotspot.is-breathing')) return;     
  const target = firstObject(st.owned);
  st.breathed = true;
  if (!target || target.matches(':hover, :focus-visible')) return;
  target.classList.add('is-breathing');
  let t = 0;
  const end = () => { clearTimeout(t); target.classList.remove('is-breathing'); };
  target.addEventListener('animationend', end, { once: true });
  t = setTimeout(end, BREATH_MS + 400);
}





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
  } catch (_) {   }

  document.addEventListener('ccc:first-frame', onFirstFrame);
  document.addEventListener('ccc:room-owned', onRoomOwned);
  
  if (document.querySelector('.room.is-owned')) onRoomOwned(null);
  
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
