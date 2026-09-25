





 
const PUSH_IN_MAX = 0.085;



const DRIFT_X_PCT = 1.4;
const DRIFT_Y_PCT = 1.8;



const DISSOLVE_TAU = 90;



const IDLE_FRAMES_BEFORE_PARK = 45;

 
const RESIZE_DEBOUNCE_MS = 150;



const FALLBACK_INTERVAL_MS = 200;   
const RAF_STALE_MS         = 1000;  
const FALLBACK_DT_CAP      = 250;   
const FALLBACK_IDLE_DRIVES = 12;    

 
const EPS = 0.0005;

 
const TWEEN_MIN_MS = 420;
const TWEEN_MAX_MS = 1100;
const TWEEN_PX_PER_MS = 2.6;

 
const TAKEOVER_GRACE_MS   = 280;  
const STREAM_NEW_MS       = 90;   
const WHEEL_STREAM_GAP_MS = 160;  
const WHEEL_ENV_TAU       = 1600; 
const WHEEL_RISE_RATIO    = 1.3;  
const WHEEL_MIN_DELTA     = 12;   
const WHEEL_RISE_EVENTS   = 2;    

 
const PERF = (() => {
  try { return new URLSearchParams(location.search).has('perf'); }
  catch (_) { return false; }
})();




 
const M_STRIDE  = 5;
const M_TOP     = 0; 
const M_HEIGHT  = 1; 
const M_STAGE_H = 2; 
const M_RUNWAY  = 3; 
const M_DIR_X   = 4; 

 
const V_STRIDE   = 9;
const V_P        = 0;
const V_SCALE    = 1;
const V_X        = 2;
const V_Y        = 3;
const V_ENTER    = 4; 
const V_BLOOM    = 5; 
const V_ENTER_T  = 6; 
const V_BLOOM_T  = 7; 
const V_EXIT     = 8; 

 
const W_STRIDE = 7;



const EXIT_FROM = 0.50;
const EXIT_TO   = 0.74;



const EXIT_RUN_K = 0.35;




 
function nowMs() {
  return (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
}

 
function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

 
function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

 
function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}



function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

 
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}




const state = {
  inited: false,
  destroyed: false,

   
  rooms: [],            
  byName: new Map(),    
  byId: new Map(),      

  M: null,              
  V: null,              
  W: null,              
  liveFlags: null,      

  
  rafId: 0,
  running: false,
  dirty: true,          
  lastScrollY: -1,
  lastFrameTime: 0,
  idleFrames: 0,
  dissolveInFlight: false,
  snapNext: false,      

  
  fallbackTimer: 0,
  lastRafAt: 0,         
  lastFallbackAt: 0,
  fallbackIdle: 0,

  
  rafFrames: 0,
  fallbackDrives: 0,
  settles: 0,
  repairs: 0,
  measures: 0,

  
  activeIndex: -1,
  roomChangeCbs: new Set(),

  
  
  
  
  ownedIndex: -1,
  ownTimer: 0,
  ownCand: -1,          
  cutZ: 0.6433,         
  cutK: 100,
  cutting: false,
  cutEl: null,

  
  
  viewing: false,
  viewSyncOwed: false,
  classMO: null,

  
  firstFrameSent: false,
  firstFramePending: false,

  
  
  promoA: -1,
  promoB: -1,

  
  
  
  residentMask: -1,

  
  
  paintIO: null,          
  byStage: new Map(),     
  paintNear: null,        
  paintSeen: null,        
  paintHold: null,        
  curtainArmed: false,    
  curtainTimer: 0,        
  dwellTimer: 0,          
  lastVvSig: '',          
  lastMeasureAt: 0,       
  lastPaintRefresh: 0,    
  measureDeferred: false, 
                          
                          

  
  
  
  
  lastRoomFocus: null,
  lastRoomFocusY: -1,

  
  tween: null,          

  
  reduceMotion: false,
  
  
  
  
  motion: 'full',
  motionMO: null,
  motionMQ: null,
  io: null,
  listeners: [],        
  resizeTimer: 0,
  lastGeomSig: '',
};




function on(target, type, fn, opts) {
  if (!target || !target.addEventListener) return;
  target.addEventListener(type, fn, opts);
  state.listeners.push([target, type, fn, opts]);
}

function offAll() {
  for (const [target, type, fn, opts] of state.listeners) {
    try { target.removeEventListener(type, fn, opts); } catch (_) {   }
  }
  state.listeners.length = 0;
}






function roomsOutOfFlow(docScrollHeight, firstRoomTop, lastRoomBottom) {
  return firstRoomTop < -1 || lastRoomBottom > docScrollHeight + 1;
}



function retryDeferredMeasure() {
  if (state.measureDeferred && !state.destroyed) measure();
}

function measure() {
  const rooms = state.rooms;
  const M = state.M;
  if (!rooms.length || !M) return;

  
  
  const scrollY = window.scrollY || window.pageYOffset || 0;

  
  
  
  
  const docH = document.documentElement.scrollHeight;
  const n = rooms.length;
  const tops = new Float64Array(n);
  const heights = new Float64Array(n);
  const stageHs = new Float64Array(n);
  let firstTop = Infinity;
  let lastBottom = -Infinity;
  for (let i = 0; i < n; i++) {
    const r = rooms[i];
    const roomRect = r.el.getBoundingClientRect();
    const stageRect = r.stage.getBoundingClientRect();

    const top = roomRect.top + scrollY;
    const height = roomRect.height;

    
    
    
    
    tops[i] = top;
    heights[i] = height;
    stageHs[i] = stageRect.height || height;
    if (top < firstTop) firstTop = top;
    if (top + height > lastBottom) lastBottom = top + height;
  }
  

  if (roomsOutOfFlow(docH, firstTop, lastBottom)) {
    
    
    
    state.measureDeferred = true;
    return;
  }
  state.measureDeferred = false;

  for (let i = 0; i < n; i++) {
    const o = i * M_STRIDE;
    M[o + M_TOP] = tops[i];
    M[o + M_HEIGHT] = heights[i];
    M[o + M_STAGE_H] = stageHs[i];
    
    
    M[o + M_RUNWAY] = Math.max(1, heights[i] - stageHs[i]);
    M[o + M_DIR_X] = (i % 2 === 0) ? 1 : -1;
  }

  state.measures++;
  state.lastMeasureAt = nowMs();

  
  
  
  try {
    const rs = getComputedStyle(document.documentElement);
    const z = parseFloat(rs.getPropertyValue('--cut-z'));
    const k = parseFloat(rs.getPropertyValue('--cut-k'));
    if (Number.isFinite(z) && z > 0) state.cutZ = z;
    if (Number.isFinite(k) && k > 0) state.cutK = k;
  } catch (_) {   }

  
  
  
  
  
  
  
  
  const sig = geometrySignature();
  if (sig !== state.lastGeomSig) state.snapNext = true;
  state.lastGeomSig = sig;
  state.lastVvSig = visualViewportSignature();
  state.dirty = true;

  
  
  
  openCurtain();
  armCurtain();

  
  
  measureTickets();
  scheduleOffstageCheck();

  wake();
}



function visualViewportSignature() {
  const vv = window.visualViewport;
  if (!vv) return '-';
  return Math.round(vv.width) + 'x' + Math.round(vv.height) + '@' + (vv.scale || 1).toFixed(3);
}



function geometrySignature() {
  const de = document.documentElement;
  const vv = window.visualViewport;
  return de.clientWidth + 'x' + de.clientHeight + '/' + de.scrollHeight +
         '/' + (vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) : '-');
}




function wake() {
  if (state.reduceMotion || state.destroyed) return;
  
  
  if (state.viewing) { state.viewSyncOwed = true; return; }
  state.idleFrames = 0;
  if (!state.running) {
    state.running = true;
    state.lastFrameTime = 0;
    state.rafId = requestAnimationFrame(tick);
    armFallback();
  }
}

function park() {
  state.running = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  disarmFallback();
}

function tick(now) {
  if (state.destroyed) { park(); return; }
  state.rafId = requestAnimationFrame(tick);

  
  
  const dt = state.lastFrameTime ? Math.min(64, now - state.lastFrameTime) : 16.7;
  state.lastFrameTime = now;

  
  
  state.lastRafAt = nowMs();
  state.rafFrames++;

  if (PERF) perfSample(dt);

  const snap = state.snapNext;
  state.snapNext = false;

  if (serviceFrame(now, dt, snap, false, false)) {
    state.idleFrames = 0;
    if (!state.firstFrameSent) scheduleFirstFrame();
    return;
  }
  if (!state.firstFrameSent) scheduleFirstFrame();

  
  if (++state.idleFrames > IDLE_FRAMES_BEFORE_PARK) { park(); checkOffstage(); }
}



const OFFSTAGE_MIN_VISIBLE = 0.5;

function checkOffstage() {
  if (state.destroyed || state.viewing || !state.rooms.length) return;
  const i = state.ownedIndex >= 0 ? state.ownedIndex : state.activeIndex;
  const room = state.rooms[i];
  if (!room) return;
  const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
  if (!vw || !vh) return;
  let top = 0;
  try {
    const bar = document.getElementById('ticket-rail');
    if (bar) top = Math.max(0, bar.getBoundingClientRect().bottom);
  } catch (_) {   }
  let list, type;
  try {
    list = room.el.querySelectorAll('.hotspots > .hotspot');
    type = room.el.querySelectorAll('.rail-kicker, .rail-title, .rail-chips > .chip');
  } catch (_) { return; }
  
  const text = [];
  for (const t of type) {
    const tr = t.getBoundingClientRect();
    if (tr.width >= 2 && tr.height >= 2) text.push(tr);
  }
  const hits = (a, t, rr, b) => {
    for (const q of text) if (a < q.right && rr > q.left && t < q.bottom && b > q.top) return true;
    return false;
  };
  for (const h of list) {
    const r = h.getBoundingClientRect();
    let off = false;
    if (r.width >= 2 && r.height >= 2) {
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const hh = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, top));
      off = (w * hh) / (r.width * r.height) < OFFSTAGE_MIN_VISIBLE;
    }
    if (off !== h.hasAttribute('data-offstage')) {
      if (off) {
        h.setAttribute('data-offstage', '');
        if ('inert' in h) h.inert = true;
      } else {
        h.removeAttribute('data-offstage');
        if ('inert' in h) h.inert = false;
      }
    }
    if (off || r.width < 2) continue;
    
    
    setFlag(h, 'data-over-rail', hits(r.left, r.top, r.right, r.bottom));
    
    
    
    const lab = h.querySelector('.hotspot-label');
    if (lab) {
      const lr = lab.getBoundingClientRect();
      
      const k = h.offsetWidth ? r.width / h.offsetWidth : 1;
      const prev = (parseFloat(lab.dataset.nudge) || 0) * k;
      const L = lr.left - prev, R = lr.right - prev;
      const lh = lr.height;
      const downT = r.bottom + 10, upB = r.top - 10;
      const downBad = hits(L, downT, R, downT + lh) || downT + lh > vh - 4;
      const upBad = hits(L, upB - lh, R, upB) || upB - lh < top + 4;
      setFlag(h, 'data-label-up', downBad && !upBad);
      
      
      let dx = 0;
      if (R > vw - 8) dx = (vw - 8) - R;
      if (L + dx < 8) dx = 8 - L;
      const nudge = Math.round(dx / (k || 1));
      if (nudge !== (parseFloat(lab.dataset.nudge) || 0)) {
        lab.dataset.nudge = String(nudge);
        lab.style.translate = nudge ? `${nudge}px 0` : '';
      }
    }
  }
}

function setFlag(el, name, on) {
  if (on === el.hasAttribute(name)) return;
  if (on) el.setAttribute(name, ''); else el.removeAttribute(name);
}

function scheduleOffstageCheck() {
  clearTimeout(state.offstageTimer);
  
  
  
  
  
  state.offstageTimer = setTimeout(() => {
    state.offstageTimer = 0;
    checkOffstage();
  }, 60);
}



function serviceFrame(now, dt, snapIn, resolve, fromFallback) {
  let snap = snapIn;
  
  
  if (state.tween) stepTween(now);

  
  
  
  const scrollY = window.scrollY || window.pageYOffset || 0;
  const scrolled = scrollY !== state.lastScrollY;

  
  if (!scrolled && !state.dirty && !state.dissolveInFlight && !state.tween) return false;

  
  
  
  
  
  
  
  
  
  
  
  
  
  if (state.lastScrollY >= 0 &&
      Math.abs(scrollY - state.lastScrollY) > (window.innerHeight || 800) * JUMP_FRACTION) {
    snap = true;
    openCurtain();
    armCurtain();
  }

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  if ((fromFallback || snap) && scrolled) primeLiveNeighbourhood(scrollY);

  state.lastScrollY = scrollY;
  state.dirty = false;

  computeFrame(scrollY, dt, snap);
  if (resolve) resolveComposite(scrollY);
  flushWrites();
  updatePromotions(scrollY);
  updateActiveRoom(scrollY);
  updateOwnerCandidate();
  
  
  
  updateResidency();
  return true;
}




function armFallback() {
  if (state.fallbackTimer || state.destroyed || state.reduceMotion) return;
  state.fallbackIdle = 0;
  state.lastFallbackAt = 0;
  state.fallbackTimer = setInterval(fallbackTick, FALLBACK_INTERVAL_MS);
}

function disarmFallback() {
  if (!state.fallbackTimer) return;
  clearInterval(state.fallbackTimer);
  state.fallbackTimer = 0;
}

function fallbackTick() {
  
  
  if (state.destroyed || state.reduceMotion || !state.running) return;

  
  
  const now = nowMs();
  if (now - state.lastRafAt < RAF_STALE_MS) return;

  
  
  
  
  
  
  
  const focused = (typeof document.hasFocus !== 'function') || document.hasFocus();
  if (!isHidden() && focused) return;

  const dt = state.lastFallbackAt
    ? Math.min(FALLBACK_DT_CAP, now - state.lastFallbackAt)
    : FALLBACK_INTERVAL_MS;
  state.lastFallbackAt = now;
  state.fallbackDrives++;

  
  
  
  
  
  
  
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(tick);

  
  
  
  const hidden = isHidden();
  const snap = hidden || state.snapNext;
  state.snapNext = false;

  if (serviceFrame(now, dt, snap, hidden, true)) {
    state.fallbackIdle = 0;
  } else if (++state.fallbackIdle > FALLBACK_IDLE_DRIVES) {
    park();
  }
}

function isHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}




function computeFrame(scrollY, dt, snap) {
  const rooms = state.rooms;
  const M = state.M;
  const V = state.V;
  const live = state.liveFlags;

  
  
  
  
  
  const k = snap ? 1 : (1 - Math.exp(-dt / DISSOLVE_TAU));

  
  
  
  
  const exitOn = state.motion === 'full' || state.motion === 'lite';
  const lastRoom = rooms.length - 1;

  let anyInFlight = false;

  for (let i = 0; i < rooms.length; i++) {
    if (!live[i]) continue; 

    const o = i * M_STRIDE;
    const v = i * V_STRIDE;

    const top = M[o + M_TOP];
    const stageH = M[o + M_STAGE_H];
    const runway = M[o + M_RUNWAY];
    const dirX = M[o + M_DIR_X];

    
    const p = clamp01((scrollY - top) / runway);

    
    const pushEase = easeInOutCubic(p);
    const scale = 1 + PUSH_IN_MAX * pushEase;

    
    
    
    const drift = (smootherstep(p) - 0.5) * 2;
    const x = drift * DRIFT_X_PCT * dirX;
    const y = -drift * DRIFT_Y_PCT;

    
    
    
    
    const enterIn = clamp01((scrollY - (top - stageH)) / stageH);
    
    
    
    
    
    
    
    
    
    
    const exitRun = i < lastRoom ? stageH * EXIT_RUN_K : stageH;
    const enterOut = 1 - clamp01((scrollY - (top + runway)) / exitRun);
    const enterTarget = easeOutQuint(Math.min(enterIn, enterOut));

    
    
    
    const bloomTarget = easeOutQuint(clamp01(p / 0.55)) * enterTarget;

    
    const exit = (exitOn && i < lastRoom)
      ? smoothstep(clamp01((p - EXIT_FROM) / (EXIT_TO - EXIT_FROM)))
      : 0;

    
    
    const prevEnter = V[v + V_ENTER];
    const prevBloom = V[v + V_BLOOM];
    const nextEnter = prevEnter + (enterTarget - prevEnter) * k;
    const nextBloom = prevBloom + (bloomTarget - prevBloom) * k;

    if (Math.abs(enterTarget - nextEnter) > EPS ||
        Math.abs(bloomTarget - nextBloom) > EPS) {
      anyInFlight = true;
    }

    V[v + V_P] = p;
    V[v + V_SCALE] = scale;
    V[v + V_X] = x;
    V[v + V_Y] = y;
    V[v + V_ENTER] = nextEnter;
    V[v + V_BLOOM] = nextBloom;
    V[v + V_ENTER_T] = enterTarget;
    V[v + V_BLOOM_T] = bloomTarget;
    V[v + V_EXIT] = exit;
  }

  state.dissolveInFlight = anyInFlight;
}




function flushWrites() {
  const rooms = state.rooms;
  const V = state.V;
  const W = state.W;
  const live = state.liveFlags;

  for (let i = 0; i < rooms.length; i++) {
    if (!live[i]) continue;
    writeRoom(rooms[i].stage.style, V, W, i * V_STRIDE, i * W_STRIDE);
  }
}



function writeRoom(style, V, W, v, w) {
  const p     = round(V[v + V_P], 4);
  const scale = round(V[v + V_SCALE], 5);
  const x     = round(V[v + V_X], 3);
  const y     = round(V[v + V_Y], 3);
  const enter = round(V[v + V_ENTER], 3);
  const bloom = round(V[v + V_BLOOM], 3);
  const exit  = round(V[v + V_EXIT], 3);

  if (W[w + 0] !== p)     { W[w + 0] = p;     style.setProperty('--p-fine', p); }
  if (W[w + 1] !== scale) { W[w + 1] = scale; style.setProperty('--plate-scale', scale); }
  if (W[w + 2] !== x)     { W[w + 2] = x;     style.setProperty('--plate-x', x); }
  if (W[w + 3] !== y)     { W[w + 3] = y;     style.setProperty('--plate-y', y); }
  if (W[w + 4] !== enter) { W[w + 4] = enter; style.setProperty('--enter-fine', enter); }
  if (W[w + 5] !== bloom) { W[w + 5] = bloom; style.setProperty('--bloom-fine', bloom); }
  if (W[w + 6] !== exit)  { W[w + 6] = exit;  style.setProperty('--exit-fine', exit); }
}

 
function round(v, digits) {
  const f = digits === 3 ? 1e3 : (digits === 4 ? 1e4 : 1e5);
  return Math.round(v * f) / f;
}




function setupObserver() {
  if (typeof IntersectionObserver !== 'function') {
    
    state.liveFlags.fill(1);
    for (const r of state.rooms) r.live = true;
    return;
  }

  state.io = new IntersectionObserver((entries) => {
    let changed = false;

    for (const entry of entries) {
      const i = state.byId.get(entry.target.id);
      if (i === undefined) continue;

      const nowLive = entry.isIntersecting;
      const room = state.rooms[i];
      if (room.live === nowLive) continue;

      room.live = nowLive;
      state.liveFlags[i] = nowLive ? 1 : 0;
      changed = true;

      if (!nowLive) {
        
        
        
        
        settleDormant(i);
      }
    }

    if (changed) { state.dirty = true; wake(); }
  }, {
    root: null,
    rootMargin: '100% 0px',
    threshold: 0,
  });

  for (const r of state.rooms) state.io.observe(r.el);
}



function settleDormant(i) {
  const M = state.M, V = state.V;
  const o = i * M_STRIDE, v = i * V_STRIDE;
  const scrollY = state.lastScrollY < 0 ? (window.scrollY || 0) : state.lastScrollY;
  const past = scrollY > M[o + M_TOP];

  const p = past ? 1 : 0;
  V[v + V_P] = p;
  V[v + V_SCALE] = 1 + PUSH_IN_MAX * easeInOutCubic(p);
  V[v + V_X] = (smootherstep(p) - 0.5) * 2 * DRIFT_X_PCT * M[o + M_DIR_X];
  V[v + V_Y] = -(smootherstep(p) - 0.5) * 2 * DRIFT_Y_PCT;
  V[v + V_ENTER] = 0;
  V[v + V_BLOOM] = 0;
  V[v + V_ENTER_T] = 0;
  V[v + V_BLOOM_T] = 0;
  V[v + V_EXIT] = 0;

  writeRoom(state.rooms[i].stage.style, V, state.W, v, i * W_STRIDE);
}




function resolveComposite(scrollY) {
  const rooms = state.rooms, M = state.M, V = state.V, live = state.liveFlags;

  let winner = -1, bestEnter = -1;
  let overlapWinner = -1, bestOverlap = 0;

  for (let i = 0; i < rooms.length; i++) {
    if (!live[i]) continue;

    
    const t = V[i * V_STRIDE + V_ENTER_T];
    if (t >= bestEnter) { bestEnter = t; winner = i; }

    const o = i * M_STRIDE;
    const top = M[o + M_TOP];
    const overlap = Math.min(top + M[o + M_HEIGHT], scrollY + M[o + M_STAGE_H]) -
                    Math.max(top, scrollY);
    if (overlap > bestOverlap) { bestOverlap = overlap; overlapWinner = i; }
  }

  if (bestEnter <= 0) winner = overlapWinner;   
  if (winner < 0) return;

  for (let i = 0; i < rooms.length; i++) {
    if (!live[i]) continue;
    const v = i * V_STRIDE;
    if (i === winner) {
      V[v + V_ENTER] = 1;
      
      
      V[v + V_BLOOM] = easeOutQuint(clamp01(V[v + V_P] / 0.55));
    } else {
      V[v + V_ENTER] = 0;
      V[v + V_BLOOM] = 0;
    }
  }

  
  state.dissolveInFlight = false;
}






function settleHidden() {
  cancelTween('cancelled');   
  if (state.reduceMotion || state.destroyed || !state.rooms.length) return;
  state.lastScrollY = -1;        
  state.dirty = true;
  state.settles++;
  serviceFrame(nowMs(), FALLBACK_DT_CAP, true, true, true);
}



function repairVisible() {
  if (state.destroyed || !state.rooms.length) return;

  state.lastFrameTime = 0;       
  state.lastFallbackAt = 0;
  state.repairs++;

  measure();                     
  primeLiveNeighbourhood(window.scrollY || window.pageYOffset || 0);

  state.lastScrollY = -1;
  state.dirty = true;

  
  
  
  serviceFrame(nowMs(), 0, true, false, false);
}




function setRoomPromotion(room, on) {
  
  
  
  room.wrap.style.willChange = on ? 'transform' : '';
  if (room.glow) room.glow.style.willChange = on ? 'opacity' : '';
  if (room.vig) room.vig.style.willChange = on ? 'opacity' : '';
}

function updatePromotions(scrollY) {
  const rooms = state.rooms;
  const M = state.M;

  
  let a = -1, b = -1, aDist = Infinity, bDist = Infinity;

  for (let i = 0; i < rooms.length; i++) {
    const o = i * M_STRIDE;
    const roomCentre = M[o + M_TOP] + M[o + M_HEIGHT] * 0.5;
    const viewCentre = scrollY + M[o + M_STAGE_H] * 0.5;
    const d = Math.abs(roomCentre - viewCentre);

    if (d < aDist)      { b = a; bDist = aDist; a = i; aDist = d; }
    else if (d < bDist) { b = i; bDist = d; }
  }

  if (a === state.promoA && b === state.promoB) return;  

  
  
  
  const prevA = state.promoA, prevB = state.promoB;
  if (prevA >= 0 && prevA !== a && prevA !== b) setRoomPromotion(rooms[prevA], false);
  if (prevB >= 0 && prevB !== a && prevB !== b) setRoomPromotion(rooms[prevB], false);
  if (a >= 0 && a !== prevA && a !== prevB) setRoomPromotion(rooms[a], true);
  if (b >= 0 && b !== prevA && b !== prevB) setRoomPromotion(rooms[b], true);

  state.promoA = a;
  state.promoB = b;
}






const PAINT_MARGIN = '100% 0px';



const DORMANT_DWELL_MS = 320;



const CURTAIN_ARM_MS = 550;



const NEIGHBOUR_SKIRT = 2;

 
function allResidentMask() {
  const n = Math.min(state.rooms.length, 31);
  return n >= 31 ? 0x7fffffff : ((1 << n) - 1);
}



function setupPaintObserver() {
  if (typeof IntersectionObserver !== 'function') {
    
    state.paintNear.fill(1);
    state.paintSeen.fill(1);
    state.curtainArmed = false;
    applyResidency();
    return;
  }

  state.paintIO = new IntersectionObserver((entries) => {
    let opened = false;
    let closed = false;

    for (const entry of entries) {
      const i = state.byStage.get(entry.target);
      if (i === undefined) continue;
      state.paintSeen[i] = 1;
      const near = entry.isIntersecting ? 1 : 0;
      if (state.paintNear[i] === near) continue;
      state.paintNear[i] = near;
      if (near) opened = true;
      else { state.paintHold[i] = nowMs() + DORMANT_DWELL_MS; closed = true; }
    }

    
    
    
    if (opened) applyResidency();
    
    if (closed) scheduleDwellCheck();
  }, { root: null, rootMargin: PAINT_MARGIN, threshold: 0 });

  state.byStage.clear();
  for (let i = 0; i < state.rooms.length; i++) {
    state.byStage.set(state.rooms[i].stage, i);
    state.paintIO.observe(state.rooms[i].stage);
  }
}



function applyResidency() {
  const rooms = state.rooms;
  if (!rooms.length || !state.paintNear) return;

  
  
  if (state.reduceMotion || state.destroyed || !state.curtainArmed) {
    writeResidency(allResidentMask());
    return;
  }

  const now = nowMs();
  const a = state.activeIndex, pa = state.promoA, pb = state.promoB;
  const M = state.M;
  const y = state.lastScrollY >= 0 ? state.lastScrollY : (window.scrollY || window.pageYOffset || 0);
  let mask = 0;

  for (let i = 0; i < rooms.length && i < 31; i++) {
    
    
    
    
    
    
    
    
    const o = i * M_STRIDE;
    const S = M ? M[o + M_STAGE_H] : 0;
    const T = M ? M[o + M_TOP] : 0;
    const geomNear = !M || S <= 0 ||
      (y > T - 3 * S && y < T + M[o + M_HEIGHT] + 2 * S);
    const resident =
      geomNear ||
      state.paintSeen[i] === 0 ||                       
      state.paintNear[i] === 1 ||                       
      now < state.paintHold[i] ||                       
      (a >= 0 && i >= a - NEIGHBOUR_SKIRT && i <= a + NEIGHBOUR_SKIRT) ||
      i === pa || i === pb;
    if (resident) mask |= (1 << i);
  }

  writeResidency(mask);
}



function writeResidency(mask) {
  const prev = state.residentMask;
  if (mask === prev) return;
  state.residentMask = mask;
  for (let i = 0; i < state.rooms.length && i < 31; i++) {
    const now = (mask >> i) & 1;
    if (prev >= 0 && ((prev >> i) & 1) === now) continue;
    try { state.rooms[i].el.classList.toggle('is-dormant', now === 0); }
    catch (_) {   }
  }
}



function updateResidency() {
  applyResidency();
}



function scheduleDwellCheck() {
  if (state.dwellTimer || state.destroyed) return;
  state.dwellTimer = setTimeout(() => {
    state.dwellTimer = 0;
    if (state.destroyed) return;
    applyResidency();
  }, DORMANT_DWELL_MS + 20);
}



function openCurtain() {
  state.curtainArmed = false;
  clearTimeout(state.curtainTimer);
  state.curtainTimer = 0;
  writeResidency(allResidentMask());
  forgetPaintReports();
}



const PAINT_REFRESH_MS = 120;



function forgetPaintReports() {
  if (!state.paintIO || state.destroyed) return;
  const now = nowMs();
  if (now - state.lastPaintRefresh < PAINT_REFRESH_MS) return;
  state.lastPaintRefresh = now;

  for (let i = 0; i < state.rooms.length; i++) state.paintSeen[i] = 0;
  for (const r of state.rooms) {
    try { state.paintIO.unobserve(r.stage); state.paintIO.observe(r.stage); }
    catch (_) {   }
  }
}

function armCurtain() {
  if (state.destroyed || state.reduceMotion) return;
  clearTimeout(state.curtainTimer);
  state.curtainTimer = setTimeout(() => {
    state.curtainTimer = 0;
    if (state.destroyed || state.reduceMotion) return;
    if (!state.paintIO) return;                 

    
    
    for (let i = 0; i < state.rooms.length; i++) {
      if (!state.paintSeen[i]) { armCurtain(); return; }
    }

    state.curtainArmed = true;
    applyResidency();
  }, CURTAIN_ARM_MS);
}



function clearResidency() {
  state.curtainArmed = false;
  clearTimeout(state.curtainTimer);
  clearTimeout(state.dwellTimer);
  state.curtainTimer = 0;
  state.dwellTimer = 0;
  if (state.rooms.length) writeResidency(allResidentMask());
  state.residentMask = -1;
  for (const r of state.rooms) {
    try { r.el.classList.remove('is-dormant'); } catch (_) {   }
  }
}




function updateActiveRoom(scrollY) {
  const rooms = state.rooms;
  const M = state.M;

  let best = -1;
  let bestOverlap = 0;

  for (let i = 0; i < rooms.length; i++) {
    const o = i * M_STRIDE;
    const top = M[o + M_TOP];
    const bottom = top + M[o + M_HEIGHT];
    const viewTop = scrollY;
    const viewBottom = scrollY + M[o + M_STAGE_H];

    const overlap = Math.min(bottom, viewBottom) - Math.max(top, viewTop);
    if (overlap > bestOverlap) { bestOverlap = overlap; best = i; }
  }

  if (best === -1 || best === state.activeIndex) return;
  const first = state.activeIndex === -1;
  state.activeIndex = best;

  const room = rooms[best];
  const payload = { id: room.id, name: room.name, index: best, el: room.el };

  for (const cb of state.roomChangeCbs) {
    
    try { cb(payload); }
    catch (err) { console.error('[engine] onRoomChange callback threw:', err); }
  }

  scheduleOwnership(first);
  placeTicketIndicator(tix.lead || room.name, first);
}




const tix = { nav: null, ind: null, pos: null, current: '', ro: null,
  ink: null, inkL: null, inkR: null, inkC: null, inkW: 0, lead: '' };

function mountTicketIndicator() {
  let nav = null;
  try { nav = document.querySelector('#ticket-rail .tickets'); } catch (_) {   }
  if (!nav) return false;
  if (tix.nav === nav && tix.ind && tix.ind.isConnected && tix.ink && tix.ink.isConnected) return true;
  if (tix.ind) { try { tix.ind.remove(); } catch (_) {   } }
  if (tix.ink) { try { tix.ink.remove(); } catch (_) {   } }
  const ind = document.createElement('span');
  ind.className = 'ticket-ind is-snap';
  ind.setAttribute('aria-hidden', 'true');
  nav.insertBefore(ind, nav.firstChild);
  
  
  const ink = document.createElement('span');
  ink.className = 'ticket-ink is-snap';
  ink.setAttribute('aria-hidden', 'true');
  const l = document.createElement('span'); l.className = 'ticket-ink__l';
  const r = document.createElement('span'); r.className = 'ticket-ink__r';
  const c = document.createElement('span'); c.className = 'ticket-ink__c';
  r.appendChild(c); l.appendChild(r); ink.appendChild(l);
  nav.appendChild(ink);
  tix.nav = nav;
  tix.ind = ind;
  tix.ink = ink; tix.inkL = l; tix.inkR = r; tix.inkC = c;
  tix.pos = null;
  if (tix.ro) { try { tix.ro.disconnect(); } catch (_) {   } }
  if (typeof ResizeObserver === 'function') {
    
    
    
    tix.ro = new ResizeObserver(() => measureTickets());
    try {
      tix.ro.observe(nav);
      for (const t of nav.querySelectorAll('.ticket')) tix.ro.observe(t);
    } catch (_) {   }
  }
  return true;
}

 
const INK_FONT_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'font-variation-settings', 'font-optical-sizing', 'font-feature-settings', 'letter-spacing',
  'text-transform', 'line-height', 'word-spacing'];

function measureTickets() {
  if (state.destroyed) return;
  if (!tix.nav || !tix.nav.isConnected || !tix.ind || !tix.ind.isConnected ||
      !tix.ink || !tix.ink.isConnected) {
    if (!mountTicketIndicator()) return;
  }
  const nav = tix.nav;
  const nr = nav.getBoundingClientRect();
  const ox = nr.left + nav.clientLeft - nav.scrollLeft;
  const oy = nr.top + nav.clientTop - nav.scrollTop;
  const pos = new Map();
  const frag = document.createDocumentFragment();
  let contentW = 0, maxW = 0, maxH = 0;
  for (const t of nav.querySelectorAll('.ticket[data-goto]')) {
    const tr = t.getBoundingClientRect();
    if (!tr.width || !tr.height) continue;
    const box = [tr.left - ox, tr.top - oy, tr.width, tr.height];
    pos.set(t.dataset.goto, box);
    contentW = Math.max(contentW, box[0] + box[2]);
    maxW = Math.max(maxW, box[2]);
    maxH = Math.max(maxH, box[1] + box[3]);
    
    for (const part of t.children) {
      const pr = part.getBoundingClientRect();
      if (!pr.width || !pr.height) continue;   
      const cs = getComputedStyle(part);
      const s = document.createElement('span');
      s.className = part.classList.contains('ticket-no') ? 'ticket-ink__no' : 'ticket-ink__name';
      s.textContent = part.textContent;
      let css = `left:${(pr.left - ox).toFixed(2)}px;top:${(pr.top - oy).toFixed(2)}px;`;
      for (const k of INK_FONT_PROPS) {
        const v = cs.getPropertyValue(k);
        if (v) css += `${k}:${v};`;
      }
      s.style.cssText = css;
      frag.appendChild(s);
    }
  }
  tix.pos = pos;
  if (tix.inkC) {
    tix.inkC.replaceChildren(frag);
    const w = Math.ceil(Math.max(contentW, nav.clientWidth));
    const h = Math.ceil(Math.max(maxH, nav.clientHeight));
    tix.inkW = Math.ceil(maxW) + 2;
    tix.ink.style.width = w + 'px';
    tix.ink.style.height = h + 'px';
    tix.inkL.style.width = tix.inkW + 'px';
    tix.inkR.style.width = tix.inkW + 'px';
    tix.inkC.style.width = w + 'px';
    tix.inkC.style.height = h + 'px';
    
    
    nav.classList.toggle('is-overflowing', contentW > nav.clientWidth + 1);
  }
  placeTicketIndicator(tix.current, true);
}

function placeTicketIndicator(name, snap) {
  tix.current = name || '';
  const ind = tix.ind, nav = tix.nav, ink = tix.ink;
  if (!ind || !nav || !tix.pos) return;
  const r = tix.pos.get(tix.current);
  if (!r || !r[2] || !r[3]) {
    ind.classList.remove('is-on');
    if (ink) ink.classList.remove('is-on');
    nav.classList.remove('has-ind');
    return;
  }
  
  
  const jump = snap || state.reduceMotion || !ind.classList.contains('is-on');
  ind.classList.toggle('is-snap', jump);
  const x = r[0], y = r[1], w = r[2], h = r[3];
  ind.style.transform =
    `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${(w / 100).toFixed(4)}, ${(h / 40).toFixed(4)})`;
  ind.classList.add('is-on');
  if (ink && tix.inkL) {
    
    const W = tix.inkW, R = x + w;
    ink.classList.toggle('is-snap', jump);
    tix.inkL.style.height = h.toFixed(2) + 'px';
    tix.inkR.style.height = h.toFixed(2) + 'px';
    tix.inkL.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    tix.inkR.style.transform = `translate(${(R - x - W).toFixed(2)}px, 0px)`;
    tix.inkC.style.transform = `translate(${(W - R).toFixed(2)}px, ${(-y).toFixed(2)}px)`;
    ink.classList.add('is-on');
  }
  nav.classList.add('has-ind');
  if (jump && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (tix.ind === ind) ind.classList.remove('is-snap');
      if (ink && tix.ink === ink) ink.classList.remove('is-snap');
    }));
  }
}

 
function ticketRoomName() {
  if (tix.lead) return tix.lead;
  const a = state.activeIndex;
  return a >= 0 && state.rooms[a] ? state.rooms[a].name : '';
}

 
function leadTicket(name) {
  
  
  if (!name || !tix.pos || !tix.pos.has(name)) { if (tix.lead) releaseTicket(); return; }
  tix.lead = name;
  placeTicketIndicator(tix.lead, false);
}

 
function releaseTicket() {
  if (!tix.lead) return;
  tix.lead = '';
  placeTicketIndicator(ticketRoomName(), false);
}




const OWN_DWELL_MS = 140;



const OWN_ENTER_MIN = 0.578 + 0.05 / 34;

function ownerCandidate() {
  const a = state.activeIndex;
  if (a < 0 || state.reduceMotion || !state.V || !state.liveFlags) return a;
  const V = state.V, live = state.liveFlags, last = state.rooms.length - 1;
  const pMax = state.cutZ - 0.05 / state.cutK;
  let best = -1;
  for (let i = Math.max(0, a - 1); i <= Math.min(last, a + 1); i++) {
    if (!live[i]) continue;
    const v = i * V_STRIDE;
    if (V[v + V_ENTER] > OWN_ENTER_MIN && (i === last || V[v + V_P] < pMax)) best = i;
  }
  if (best >= 0) return best;
  const prev = state.ownCand;
  return (prev >= 0 && Math.abs(prev - a) <= 1) ? prev : a;
}

function updateOwnerCandidate() {
  const c = ownerCandidate();
  if (c === state.ownCand) return;
  state.ownCand = c;
  
  
  
  const target = !!(state.tween && state.tween.target === c);
  scheduleOwnership((state.ownedIndex === -1 || target) && !state.cutting);
}

function ownerTarget() {
  if (state.reduceMotion || state.ownCand < 0) return state.activeIndex;
  return state.ownCand;
}

function scheduleOwnership(immediate) {
  clearTimeout(state.ownTimer);
  state.ownTimer = 0;
  if (state.destroyed || state.cutting) return;
  if (immediate) { applyOwnership(ownerTarget()); return; }
  state.ownTimer = setTimeout(() => {
    state.ownTimer = 0;
    if (!state.destroyed && !state.cutting) applyOwnership(ownerTarget());
  }, OWN_DWELL_MS);
}

function applyOwnership(i) {
  const rooms = state.rooms;
  if (i === state.ownedIndex || !rooms.length) return;
  const prev = state.ownedIndex;
  state.ownedIndex = i;
  if (prev >= 0 && rooms[prev]) {
    try { rooms[prev].el.classList.remove('is-owned'); } catch (_) {   }
  }
  if (i < 0 || !rooms[i]) return;
  const room = rooms[i];
  try { room.el.classList.add('is-owned'); } catch (_) {   }
  scheduleOffstageCheck();
  try {
    document.dispatchEvent(new CustomEvent('ccc:room-owned', {
      detail: { id: room.name, elId: room.id, index: i, el: room.el }
    }));
  } catch (_) {   }
}




const FIRST_FRAME_DECODE_CAP_MS = 1200;

function scheduleFirstFrame() {
  if (state.firstFrameSent || state.firstFramePending) return;
  state.firstFramePending = true;
  const i = state.activeIndex >= 0 ? state.activeIndex : 0;
  const room = state.rooms[i];
  const img = room && room.stage ? room.stage.querySelector('.plate') : null;
  let decoded = Promise.resolve();
  try {
    if (img && !img.complete && typeof img.decode === 'function') {
      decoded = Promise.race([
        img.decode().catch(() => {}),
        new Promise((r) => setTimeout(r, FIRST_FRAME_DECODE_CAP_MS))
      ]);
    }
  } catch (_) {   }
  decoded.then(() => {
    const send = () => {
      if (state.firstFrameSent) return;
      state.firstFrameSent = true;
      try { document.dispatchEvent(new Event('ccc:first-frame')); } catch (_) {   }
    };
    
    if (typeof requestAnimationFrame === 'function' && !isHidden()) {
      requestAnimationFrame(() => setTimeout(send, 0));
    } else {
      send();
    }
  });
}




function viewingNow() {
  try {
    const h = document.documentElement, b = document.body;
    return h.classList.contains('is-viewing') || h.classList.contains('ccc-locked') ||
           !!(b && b.classList.contains('ccc-locked'));
  } catch (_) { return false; }
}

function checkViewing() {
  if (state.destroyed) return;
  const v = viewingNow();
  if (v && !state.viewing) enterViewing();
  else if (!v && state.viewing) exitViewing();
}

function enterViewing() {
  state.viewing = true;
  cancelTween('cancelled');
  park();
}

function exitViewing() {
  state.viewing = false;
  if (state.reduceMotion) return;
  
  
  retryDeferredMeasure();
  if (state.viewSyncOwed) {
    state.viewSyncOwed = false;
    state.dirty = true;
  }
  state.lastFrameTime = 0;   
  wake();
}




function applyReducedMotion() {
  park();
  state.dissolveInFlight = false;

  for (let i = 0; i < state.rooms.length; i++) {
    const r = state.rooms[i];
    const s = r.stage.style;
    s.setProperty('--p-fine', 0);
    s.setProperty('--plate-scale', 1);
    s.setProperty('--plate-x', 0);
    s.setProperty('--plate-y', 0);
    s.setProperty('--enter-fine', 1);
    s.setProperty('--bloom-fine', 1);
    s.setProperty('--exit-fine', 0);
    
    
    setRoomPromotion(r, false);
    state.promoA = -1;
    state.promoB = -1;

    
    
    const w = i * W_STRIDE;
    state.W[w + 0] = 0;
    state.W[w + 1] = 1;
    state.W[w + 2] = 0;
    state.W[w + 3] = 0;
    state.W[w + 4] = 1;
    state.W[w + 5] = 1;
    state.W[w + 6] = 0;
  }

  
  
  
  clearResidency();

  
  updateActiveRoom(window.scrollY || 0);
}




 
const TAKEOVER_EVENTS = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'mousedown', 'keydown'];

 
const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar', 'Escape'];

function cancelTween(reason) {
  const t = state.tween;
  if (!t) return;
  state.tween = null;
  for (const type of TAKEOVER_EVENTS) {
    window.removeEventListener(type, onTakeover, { capture: true });
  }
  
  
  
  const superseded = reason === 'superseded';
  if (!superseded && !state.cutting) releaseTicket();
  if (t.resolve) t.resolve(superseded ? 'cancelled' : (reason || 'cancelled'));
}




 
function wheelDeltaPx(e) {
  const raw = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  if (e.deltaMode === 1) return raw * 16;                          
  if (e.deltaMode === 2) return raw * (window.innerHeight || 800);  
  return raw;                                                      
}

function onTakeover(e) {
  const t = state.tween;
  if (!t) return;

  if (e.type === 'wheel') { onTakeoverWheel(e, t); return; }

  if (e.type === 'keydown' && !NAV_KEYS.includes(e.key)) return;

  
  cancelTween('interrupted');
  wake();
}

function onTakeoverWheel(e, t) {
  const now = nowMs();
  const d = Math.abs(wheelDeltaPx(e));
  const gap = now - t.lastWheelAt;

  
  
  if (gap > WHEEL_STREAM_GAP_MS) {
    t.wheelEnv = 0;
    t.risingRun = 0;
    t.streamStart = now;
  }
  t.lastWheelAt = now;

  
  
  
  
  t.wheelEnv *= Math.exp(-Math.min(gap, 2000) / WHEEL_ENV_TAU);

  
  
  
  const inherited = (t.streamStart - t.start) <= STREAM_NEW_MS;

  if (inherited && (now - t.start) < TAKEOVER_GRACE_MS) {
    
    
    
    
    
    t.wheelEnv = Math.max(t.wheelEnv, d);
    t.risingRun = 0;
    return;
  }

  
  
  
  
  
  const needed = t.wheelEnv > 0 ? WHEEL_RISE_EVENTS : 1;

  if (d > Math.max(WHEEL_MIN_DELTA, t.wheelEnv * WHEEL_RISE_RATIO)) {
    if (++t.risingRun >= needed) {
      cancelTween('interrupted');
      wake();
    }
    return;
  }

  t.risingRun = 0;
}

function stepTween(now) {
  const t = state.tween;
  const k = clamp01((now - t.start) / t.dur);
  const y = t.path ? t.path(k) : t.from + (t.to - t.from) * easeInOutCubic(k);

  window.scrollTo(0, y);

  if (k >= 1) cancelTween('done');
}



const JUMP_BAND_MS = 420;          
const JUMP_TAIL_MS = 80;           
const JUMP_RUN_SVH_PER_MS = 0.6;   
const JUMP_RUN_MIN_MS = 60;
const JUMP_RUN_MAX_MS = 180;

 
function bandOpacity(u) {
  return clamp01((easeOutQuint(clamp01(u)) - 0.22) * 1.43);
}
 
function bandProgress(d) {
  const e = Math.min(0.999999, clamp01(d) / 1.43 + 0.22);
  return 1 - Math.pow(1 - e, 1 / 5);
}



function adjacentJumpPath(a, i, from, to) {
  const M = state.M;
  if (!M || a < 0 || Math.abs(i - a) !== 1) return null;
  const hi = Math.max(a, i);
  const topHi = M[hi * M_STRIDE + M_TOP];
  const sH = M[hi * M_STRIDE + M_STAGE_H];
  if (!(sH > 0)) return null;
  const at = (u) => topHi - sH + u * sH;           
  const uOf = (y) => (y - (topHi - sH)) / sH;
  const b0 = at(bandProgress(0));
  const b1 = at(bandProgress(1));
  const down = to > from;
  const runMs = (len) => Math.max(JUMP_RUN_MIN_MS,
    Math.min(JUMP_RUN_MAX_MS, Math.abs(len) / (JUMP_RUN_SVH_PER_MS * sH / 100)));

  
  const pieces = [];
  if (down) {
    if (from < b0) pieces.push({ kind: 'run', y0: from, y1: Math.min(b0, to) });
    const s0 = Math.max(from, b0);
    if (s0 < b1 && s0 < to) pieces.push({ kind: 'band', y0: s0, y1: Math.min(b1, to) });
    const t0 = Math.max(from, b1);
    if (t0 < to) pieces.push({ kind: 'tail', y0: t0, y1: to });
  } else {
    const t0 = Math.min(from, topHi);
    if (from > topHi) pieces.push({ kind: 'run', y0: from, y1: Math.max(topHi, to) });
    if (t0 > b1 && t0 > to) pieces.push({ kind: 'tail', y0: t0, y1: Math.max(b1, to) });
    const s0 = Math.min(from, b1);
    if (s0 > b0 && s0 > to) pieces.push({ kind: 'band', y0: s0, y1: Math.max(b0, to) });
    const r0 = Math.min(from, b0);
    if (r0 > to) pieces.push({ kind: 'run', y0: r0, y1: to });
  }
  if (!pieces.length) return null;
  for (const pc of pieces) {
    if (pc.kind === 'run') pc.ms = runMs(pc.y1 - pc.y0);
    else if (pc.kind === 'tail') pc.ms = JUMP_TAIL_MS;
    else {
      pc.d0 = bandOpacity(uOf(pc.y0));
      pc.d1 = bandOpacity(uOf(pc.y1));
      pc.ms = Math.max(120, JUMP_BAND_MS * Math.abs(pc.d1 - pc.d0));
    }
  }
  
  const lead = pieces[0].kind === 'tail' ? pieces[0] : null;
  const trail = pieces[pieces.length - 1].kind === 'tail' && pieces.length > 1 ? pieces[pieces.length - 1] : null;
  const group = pieces.filter((pc) => pc !== lead && pc !== trail);
  const gMs = group.reduce((n, pc) => n + pc.ms, 0);
  const dur = gMs + (lead ? lead.ms : 0) + (trail ? trail.ms : 0);
  const place = (pc, f) => {
    if (pc.kind !== 'band') return pc.y0 + (pc.y1 - pc.y0) * f;
    return at(bandProgress(pc.d0 + (pc.d1 - pc.d0) * f));
  };
  const path = (k) => {
    let ms = k * dur;
    if (lead) {
      if (ms < lead.ms) return place(lead, ms / lead.ms);
      ms -= lead.ms;
    }
    if (gMs > 0 && ms < gMs) {
      
      let g = easeOutQuad(ms / gMs) * gMs;
      for (const pc of group) {
        if (g <= pc.ms) return place(pc, pc.ms > 0 ? g / pc.ms : 1);
        g -= pc.ms;
      }
      return group.length ? group[group.length - 1].y1 : to;
    }
    ms -= gMs;
    if (trail && ms < trail.ms) return place(trail, ms / trail.ms);
    return to;
  };
  return { dur, path };
}

function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }



function onMenuClickCapture(ev) {
  const t = ev.target;
  if (!t || typeof t.closest !== 'function') return;
  const link = t.closest('#ticket-rail [data-goto]');
  
  
  const kbd = !!link && ev.detail === 0 && nowMs() - (state.menuKeyAt || -1e9) < 600;
  state.kbdJumpAt = kbd ? nowMs() : 0;
}

function onMenuKeyCapture(ev) {
  if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') state.menuKeyAt = nowMs();
  
  
  
  if (ev.key === 'Tab' && !state.kbdMode) {
    state.kbdMode = true;
    try { document.documentElement.classList.add('ccc-kbd'); } catch (_) {   }
  }
}

function onPointerModeCapture() {
  if (!state.kbdMode) return;
  state.kbdMode = false;
  try { document.documentElement.classList.remove('ccc-kbd'); } catch (_) {   }
}

function focusRoomHeading(i) {
  const room = state.rooms[i];
  if (!room || state.viewing || state.destroyed) return;
  const h = room.el.querySelector('.rail-title') || room.el.querySelector('h2, h1');
  if (!h) return;
  
  
  const a = document.activeElement;
  if (a && a !== document.body && !(a.closest && a.closest('#ticket-rail'))) return;
  if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  try { h.focus({ preventScroll: true }); } catch (_) {   }
}



export function scrollToRoom(target, opts) {
  const options = opts || {};
  const i = resolveRoomIndex(target);

  if (i === -1) {
    console.warn('[engine] scrollToRoom: unknown room', target);
    return Promise.resolve('unknown-room');
  }

  
  const kbd = !!state.kbdJumpAt && nowMs() - state.kbdJumpAt < 400;
  state.kbdJumpAt = 0;
  const result = scrollToRoomInner(i, options);
  if (kbd) {
    result.then((r) => {
      if (r === 'done' || r === 'reduced-motion' || r === 'instant') focusRoomHeading(i);
    }, () => {});
  }
  return result;
}

function scrollToRoomInner(i, options) {

  
  cancelTween('superseded');

  const maxY = Math.max(0, document.documentElement.scrollHeight - (window.innerHeight || 0));
  const to = Math.max(0, Math.min(maxY, state.M[i * M_STRIDE + M_TOP] - (options.offset || 0)));
  const from = window.scrollY || window.pageYOffset || 0;

  
  
  if (state.reduceMotion) {
    window.scrollTo(0, to);
    updateActiveRoom(to);
    return Promise.resolve('reduced-motion');
  }

  const distance = Math.abs(to - from);
  if (distance < 2) {
    window.scrollTo(0, to);
    return Promise.resolve('done');
  }

  
  
  
  if (options.instant) {
    try { window.scrollTo({ top: to, left: 0, behavior: 'instant' }); }
    catch (_) { window.scrollTo(0, to); }
    if (!state.viewing) {
      openCurtain();
      armCurtain();
      syncNow();
      wake();
    }
    return Promise.resolve('instant');
  }

  
  
  
  const hops = state.activeIndex >= 0 ? Math.abs(i - state.activeIndex) : 2;
  leadTicket(state.rooms[i] && state.rooms[i].name);
  if (state.cutting ||
      (options.cut !== false && options.duration == null &&
       (hops >= 2 || state.motion === 'lite'))) {
    return cutToRoom(i, to);
  }

  
  
  
  const shaped = options.duration == null ? adjacentJumpPath(state.activeIndex, i, from, to) : null;
  const dur = shaped ? shaped.dur
    : options.duration != null
      ? Math.max(1, options.duration)
      : Math.max(TWEEN_MIN_MS, Math.min(TWEEN_MAX_MS, distance / TWEEN_PX_PER_MS));

  return new Promise((resolve) => {
    state.tween = {
      from, to, dur,
      target: i,
      path: shaped ? shaped.path : null,
      start: nowMs(),
      resolve,
      
      
      wheelEnv: 0,
      risingRun: 0,
      lastWheelAt: 0,
      streamStart: 0,
    };
    
    
    for (const type of TAKEOVER_EVENTS) {
      window.addEventListener(type, onTakeover, { capture: true, passive: true });
    }
    wake();
  });
}




const CUT_DECODE_CAP_MS = 250;
let cutSeq = 0;

function cutEasing(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (_) { return fallback; }
}

function cutLayer() {
  let el = state.cutEl;
  if (!el || !el.isConnected) {
    el = document.getElementById('ccc-cut') || document.createElement('div');
    el.id = 'ccc-cut';
    el.setAttribute('aria-hidden', 'true');
    state.cutEl = el;
  }
  if (!el.isConnected) document.body.appendChild(el);
  return el;
}

function fadeCut(el, from, to, ms, easing) {
  if (typeof el.animate !== 'function') {
    el.style.opacity = String(to);
    return Promise.resolve();
  }
  let anim;
  try {
    
    
    if (typeof el.getAnimations === 'function') el.getAnimations().forEach((a) => a.cancel());
    anim = el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing, fill: 'forwards' });
  } catch (_) {
    el.style.opacity = String(to);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    anim.finished.then(finish, finish);
    setTimeout(finish, ms + 120);   
  });
}

function cutToRoom(i, to) {
  const seq = ++cutSeq;
  const lite = state.motion === 'lite';
  
  
  const inMs = 120;
  const outMs = lite ? 240 : 280;
  const el = cutLayer();
  const wasCutting = state.cutting;
  state.cutting = true;
  clearTimeout(state.ownTimer);
  state.ownTimer = 0;
  applyOwnership(-1);

  
  
  let from = 0;
  if (wasCutting) {
    try { from = parseFloat(getComputedStyle(el).opacity) || 0; } catch (_) { from = 1; }
  }
  const fadeIn = (wasCutting && from > 0.98)
    ? Promise.resolve()
    : fadeCut(el, from, 1, wasCutting ? 90 : inMs, cutEasing('--m-ease-in', 'cubic-bezier(.5,0,.75,0)'));

  return fadeIn.then(() => {
    if (seq !== cutSeq || state.destroyed) return 'cancelled';
    if (state.viewing) {
      
      
      state.cutting = false;
      try { el.remove(); } catch (_) {   }
      releaseTicket();
      scheduleOwnership(true);
      return 'cancelled';
    }
    
    
    const maxY = Math.max(0, document.documentElement.scrollHeight - (window.innerHeight || 0));
    const y = Math.max(0, Math.min(maxY, to));
    try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); }
    catch (_) { window.scrollTo(0, y); }
    openCurtain();
    armCurtain();
    syncNow();
    wake();
    const room = state.rooms[i];
    const img = room && room.stage ? room.stage.querySelector('.plate') : null;
    let ready = Promise.resolve();
    try {
      
      
      if (img && typeof img.decode === 'function') {
        ready = Promise.race([img.decode().catch(() => {}),
          new Promise((r) => setTimeout(r, CUT_DECODE_CAP_MS))]);
      }
    } catch (_) {   }
    
    
    
    
    ready = ready.then(() => new Promise((r) => {
      const cap = setTimeout(r, 80);
      if (typeof requestAnimationFrame !== 'function') { clearTimeout(cap); r(); return; }
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(cap); r(); }));
    }));
    return ready.then(() => {
      if (seq !== cutSeq || state.destroyed) return 'cancelled';
      
      
      
      
      
      
      
      if (!state.viewing) applyOwnership(i);
      return fadeCut(el, 1, 0, outMs, cutEasing('--m-ease-out', 'cubic-bezier(.22,.61,.24,1)'))
        .then(() => {
          if (seq !== cutSeq || state.destroyed) return 'cancelled';
          state.cutting = false;
          try { el.remove(); } catch (_) {   }
          releaseTicket();
          scheduleOwnership(true);
          return 'done';
        });
    });
  });
}

function resolveRoomIndex(target) {
  if (!target) return -1;
  if (typeof target !== 'string') {
    
    if (target.id && state.byId.has(target.id)) return state.byId.get(target.id);
    if (target.dataset && state.byName.has(target.dataset.room)) return state.byName.get(target.dataset.room);
    return -1;
  }
  const key = target.replace(/^#/, '');
  if (state.byName.has(key)) return state.byName.get(key);
  if (state.byId.has(key)) return state.byId.get(key);
  if (state.byName.has(key.replace(/^room-/, ''))) return state.byName.get(key.replace(/^room-/, ''));
  return -1;
}






export function onRoomChange(cb) {
  if (typeof cb !== 'function') return () => {};
  state.roomChangeCbs.add(cb);

  
  
  if (state.activeIndex >= 0) {
    const room = state.rooms[state.activeIndex];
    try { cb({ id: room.id, name: room.name, index: state.activeIndex, el: room.el }); }
    catch (err) { console.error('[engine] onRoomChange callback threw:', err); }
  }

  return () => state.roomChangeCbs.delete(cb);
}






const OWNS_PAGE_MIN_CUT = 0.5;



function roomOwnsPage(room) {
  let cut;
  try { cut = parseFloat(getComputedStyle(room.stage).getPropertyValue('--cut')); }
  catch (_) { return true; }
  if (!Number.isFinite(cut)) return true;
  return cut >= OWNS_PAGE_MIN_CUT;
}



function bringRoomToReadingPosition(i) {
  const maxY = Math.max(0, document.documentElement.scrollHeight - (window.innerHeight || 0));
  const to = Math.max(0, Math.min(maxY, state.M[i * M_STRIDE + M_TOP]));
  if (Math.abs(to - (window.scrollY || window.pageYOffset || 0)) < 2) return;

  
  cancelTween('interrupted');

  try { window.scrollTo({ top: to, left: 0, behavior: 'instant' }); }
  catch (_) { window.scrollTo(0, to); }          

  
  
  openCurtain();
  armCurtain();
  syncNow();
  wake();
}



function syncNow() {
  state.lastScrollY = -1;      
  state.dirty = true;
  serviceFrame(nowMs(), 0, true, false, false);
}

function onFocusIn(ev) {
  if (state.destroyed || !state.rooms.length) return;

  const t = ev.target;
  if (!t || typeof t.closest !== 'function') return;

  
  
  const roomEl = t.closest('.room');
  if (!roomEl) return;                    

  const i = state.byId.get(roomEl.id);
  if (i === undefined) return;            

  

  const stage = state.rooms[i].stage;
  if (stage.scrollLeft || stage.scrollTop) { stage.scrollLeft = 0; stage.scrollTop = 0; }

  
  
  
  
  retryDeferredMeasure();

  

  const y = window.scrollY || window.pageYOffset || 0;
  const restore = t === state.lastRoomFocus && Math.abs(y - state.lastRoomFocusY) < 2;
  state.lastRoomFocus = t;
  state.lastRoomFocusY = y;

  if (state.reduceMotion) return;         
  
  
  
  
  
  
  
  
  
  
  
  
  
  if (restore || state.viewing) return;
  let visible = true;
  try { visible = t.matches(':focus-visible'); } catch (_) { visible = true; }
  if (!visible) return;
  syncNow();
  if (!roomOwnsPage(state.rooms[i])) bringRoomToReadingPosition(i);
  revealWithinRoom(t, state.rooms[i].stage);
}



function scrollIntoBox(box, el) {
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  if (r.left < b.left) dx = r.left - b.left;
  else if (r.right > b.right) dx = Math.min(r.left - b.left, r.right - b.right);
  if (r.top < b.top) dy = r.top - b.top;
  else if (r.bottom > b.bottom) dy = Math.min(r.top - b.top, r.bottom - b.bottom);
  if (dx) box.scrollLeft += dx;
  if (dy) box.scrollTop += dy;
}

function revealWithinRoom(el, stage) {
  let node = el.parentElement;
  while (node && node !== stage && node !== document.body) {
    let cs;
    try { cs = getComputedStyle(node); } catch (_) { return; }
    const canX = /auto|scroll/.test(cs.overflowX) && node.scrollWidth > node.clientWidth + 1;
    const canY = /auto|scroll/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1;
    if (canX || canY) scrollIntoBox(node, el);
    node = node.parentElement;
  }
}







const JUMP_FRACTION = 0.5;

function onScroll() {
  
  
  
  if (state.viewing || viewingNow()) {
    checkViewing();
    if (state.viewing) { state.viewSyncOwed = true; return; }
  }
  
  
  
  
  retryDeferredMeasure();
  const y = window.scrollY || window.pageYOffset || 0;
  
  
  if (state.reduceMotion) { updateActiveRoom(y); return; }
  if (state.lastScrollY >= 0 &&
      Math.abs(y - state.lastScrollY) > (window.innerHeight || 800) * JUMP_FRACTION) {
    state.snapNext = true;
    openCurtain();
    armCurtain();
  }
  state.dirty = true;
  wake();
}



const MEASURE_THROTTLE_MS = 80;



function measureThrottled() {
  if (state.destroyed) return;
  
  
  if (state.measureDeferred || nowMs() - state.lastMeasureAt >= MEASURE_THROTTLE_MS) measure();
  scheduleRemeasure();
}

function scheduleRemeasure() {
  clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(() => {
    if (state.destroyed) return;
    measure();
    if (state.reduceMotion) applyReducedMotion();
  }, RESIZE_DEBOUNCE_MS);
}





function onGeometryEvent() {
  state.lastVvSig = visualViewportSignature();
  openCurtain();
  armCurtain();
  state.dirty = true;
  wake();
  measureThrottled();
}



function onVisualViewportChange() {
  onGeometryEvent();
}



function onVisualViewportScroll() {
  if (visualViewportSignature() !== state.lastVvSig) { onGeometryEvent(); return; }
  state.dirty = true;
  wake();
  scheduleRemeasure();   
}

function onOrientationChange() {
  
  
  
  openCurtain();
  requestAnimationFrame(() => { if (!state.destroyed) measure(); });
  scheduleRemeasure();
}

function onVisibilityChange() {
  if (!isHidden()) {
    if (state.reduceMotion) {
      
      
      measure();
      applyReducedMotion();
      return;
    }
    
    
    
    
    park();
    openCurtain();       
    repairVisible();     
    scheduleRemeasure(); 
    wake();
  } else {
    
    settleHidden();
    park();
  }
}

function wireEvents() {
  
  
  
  on(window, 'scroll', onScroll, { passive: true });
  on(window, 'resize', onGeometryEvent, { passive: true });
  on(window, 'orientationchange', onOrientationChange, { passive: true });
  on(window, 'pageshow', onGeometryEvent, { passive: true });
  on(document, 'visibilitychange', onVisibilityChange);

  
  
  
  
  on(document, 'keydown', onMenuKeyCapture, true);
  on(document, 'pointerdown', onPointerModeCapture, { capture: true, passive: true });
  on(document, 'click', onMenuClickCapture, true);

  
  
  
  
  on(document, 'focusin', onFocusIn);

  
  on(document, 'ccc:viewer-open', checkViewing);
  on(document, 'ccc:viewer-close', checkViewing);
  if (typeof MutationObserver === 'function') {
    state.classMO = new MutationObserver(checkViewing);
    try {
      state.classMO.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) state.classMO.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {   }
  }

  if (window.visualViewport) {
    on(window.visualViewport, 'resize', onVisualViewportChange, { passive: true });
    on(window.visualViewport, 'scroll', onVisualViewportScroll, { passive: true });
  }

  
  
  on(window, 'load', onGeometryEvent, { passive: true });

  
  if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
    document.fonts.ready.then(() => { if (!state.destroyed) onGeometryEvent(); }).catch(() => {});
  }
  
  
  if (document.fonts && typeof document.fonts.addEventListener === 'function') {
    on(document.fonts, 'loadingdone', () => { if (!state.destroyed) measureTickets(); });
  }
}



function readMotionTier() {
  let t = '';
  try { t = document.documentElement.getAttribute('data-motion') || ''; }
  catch (_) {   }
  return (t === 'lite' || t === 'off') ? t : 'full';
}

function wireReducedMotion() {
  state.motion = readMotionTier();
  const mq = (typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  state.motionMQ = mq;
  state.reduceMotion = !!(mq && mq.matches) || state.motion === 'off';

  
  
  
  const handler = () => {
    const wasReduced = state.reduceMotion;
    state.motion = readMotionTier();
    state.reduceMotion = !!(state.motionMQ && state.motionMQ.matches) || state.motion === 'off';
    if (state.reduceMotion) {
      cancelTween('cancelled');
      applyReducedMotion();
    } else {
      state.dirty = true;
      state.lastScrollY = -1;   
      if (wasReduced) {
        
        
        if (!state.io) { setupObserver(); setupPaintObserver(); primeLiveNeighbourhood(); armCurtain(); }
        state.snapNext = true;
        measure();
      } else { wake(); }
    }
  };

  if (mq) {
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      state.listeners.push([mq, 'change', handler, undefined]);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(handler);   
    }
  }
  if (typeof MutationObserver === 'function') {
    state.motionMO = new MutationObserver(handler);
    try {
      state.motionMO.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    } catch (_) { state.motionMO = null; }
  }
  return mq;
}




function collectRooms(root) {
  const scope = (root && typeof root.querySelectorAll === 'function') ? root : document;
  const nodes = scope.querySelectorAll('.room');
  const rooms = [];

  for (const el of nodes) {
    const stage = el.querySelector('.stage');
    const wrap = stage ? stage.querySelector('.plate-wrap') : null;

    
    
    if (!stage || !wrap) {
      console.warn(
        '[engine] skipping room "%s": missing %s',
        el.id || el.dataset.room || '(unnamed)',
        !stage ? '.stage' : '.plate-wrap'
      );
      continue;
    }

    const name = el.dataset.room || (el.id || '').replace(/^room-/, '');
    const id = el.id || ('room-' + name);
    if (!el.id) el.id = id;   

    
    
    
    
    
    
    
    const glow = stage.querySelector('.plate-glow');
    const vig = stage.querySelector('.plate-vig');

    rooms.push({ id, name, el, stage, wrap, glow, vig, live: false });
  }

  return rooms;
}






export function initEngine(root) {
  
  if (state.inited) destroyEngine();

  state.destroyed = false;
  state.rooms = collectRooms(root || document);

  const n = state.rooms.length;
  state.M = new Float64Array(Math.max(1, n) * M_STRIDE);
  state.V = new Float64Array(Math.max(1, n) * V_STRIDE);
  
  state.W = new Float64Array(Math.max(1, n) * W_STRIDE).fill(NaN);
  state.liveFlags = new Uint8Array(Math.max(1, n));

  
  
  
  
  state.paintNear = new Uint8Array(Math.max(1, n)).fill(1);
  state.paintSeen = new Uint8Array(Math.max(1, n));
  state.paintHold = new Float64Array(Math.max(1, n));
  state.curtainArmed = false;
  clearTimeout(state.curtainTimer); state.curtainTimer = 0;
  clearTimeout(state.dwellTimer);   state.dwellTimer = 0;
  state.byStage.clear();
  state.lastVvSig = visualViewportSignature();
  state.measureDeferred = false;
  state.lastRoomFocus = null;
  state.lastRoomFocusY = -1;

  state.byName.clear();
  state.byId.clear();
  for (let i = 0; i < n; i++) {
    state.byName.set(state.rooms[i].name, i);
    state.byId.set(state.rooms[i].id, i);
  }

  state.inited = true;
  state.activeIndex = -1;
  state.promoA = -1;
  state.promoB = -1;
  state.residentMask = -1;
  state.lastScrollY = -1;
  state.dirty = true;

  if (!n) {
    console.warn('[engine] no usable .room sections found — engine idle.');
    return publicApi();
  }

  wireReducedMotion();
  measure();
  wireEvents();
  state.viewing = viewingNow();   

  if (state.reduceMotion) {
    
    applyReducedMotion();
    scheduleFirstFrame();
    return publicApi();
  }

  setupObserver();
  setupPaintObserver();

  
  
  primeLiveNeighbourhood();

  
  
  
  armCurtain();

  if (isHidden()) {
    
    
    
    
    
    
    
    settleHidden();
    park();
    return publicApi();
  }

  
  
  
  
  
  
  
  state.snapNext = true;

  if (state.viewing) {
    
    
    
    syncNow();
    scheduleFirstFrame();
    return publicApi();
  }

  wake();
  return publicApi();
}



function primeLiveNeighbourhood(atScrollY) {
  const scrollY = atScrollY == null ? (window.scrollY || window.pageYOffset || 0) : atScrollY;
  const M = state.M;
  for (let i = 0; i < state.rooms.length; i++) {
    const o = i * M_STRIDE;
    const top = M[o + M_TOP];
    const bottom = top + M[o + M_HEIGHT];
    const stageH = M[o + M_STAGE_H];
    const near = bottom > scrollY - stageH && top < scrollY + stageH * 2;
    if (near && !state.rooms[i].live) {
      state.rooms[i].live = true;
      state.liveFlags[i] = 1;
    }
  }
}

function publicApi() {
  return {
    get rooms() { return state.rooms.map((r) => r.name); },
    get reducedMotion() { return state.reduceMotion; },
    

    get diagnostics() {
      return {
        running: state.running,
        fallbackArmed: !!state.fallbackTimer,
        rafFrames: state.rafFrames,
        fallbackDrives: state.fallbackDrives,
        settles: state.settles,
        repairs: state.repairs,
        measures: state.measures,
        measureDeferred: state.measureDeferred,
        live: state.rooms.map((r, i) => !!state.liveFlags[i]),
        curtainArmed: state.curtainArmed,
        resident: state.rooms.map((r, i) => ((state.residentMask >> i) & 1) === 1),
        paintNear: state.rooms.map((r, i) => !!(state.paintNear && state.paintNear[i])),
        paintSeen: state.rooms.map((r, i) => !!(state.paintSeen && state.paintSeen[i])),
      };
    },
    scrollToRoom,
    onRoomChange,
     
    refresh() { measure(); },
    destroy: destroyEngine,
  };
}

 
export function destroyEngine() {
  state.destroyed = true;
  cancelTween('cancelled');
  park();                 
  disarmFallback();       
  clearTimeout(state.resizeTimer);
  clearTimeout(state.curtainTimer); state.curtainTimer = 0;
  clearTimeout(state.dwellTimer);   state.dwellTimer = 0;
  if (state.io) { state.io.disconnect(); state.io = null; }
  if (state.paintIO) { state.paintIO.disconnect(); state.paintIO = null; }
  if (state.motionMO) { state.motionMO.disconnect(); state.motionMO = null; }
  if (state.classMO) { state.classMO.disconnect(); state.classMO = null; }
  clearTimeout(state.ownTimer); state.ownTimer = 0;
  clearTimeout(state.offstageTimer); state.offstageTimer = 0;
  if (state.ownedIndex >= 0 && state.rooms[state.ownedIndex]) {
    try { state.rooms[state.ownedIndex].el.classList.remove('is-owned'); } catch (_) {   }
  }
  state.ownedIndex = -1;
  state.ownCand = -1;
  state.viewing = false;
  state.cutting = false;
  if (tix.ro) { try { tix.ro.disconnect(); } catch (_) {   } tix.ro = null; }
  if (tix.ind) { try { tix.ind.remove(); } catch (_) {   } }
  if (tix.ink) { try { tix.ink.remove(); } catch (_) {   } }
  if (tix.nav) { try { tix.nav.classList.remove('has-ind', 'is-overflowing'); } catch (_) {   } }
  tix.nav = tix.ind = tix.pos = null;
  tix.ink = tix.inkL = tix.inkR = tix.inkC = null;
  tix.lead = '';
  if (state.cutEl) { try { state.cutEl.remove(); } catch (_) {   } state.cutEl = null; }
  state.byStage.clear();
  offAll();
  for (const r of state.rooms) {
    try { setRoomPromotion(r, false); } catch (_) {   }
  }
  
  
  clearResidency();
  state.rooms = [];
  state.byName.clear();
  state.byId.clear();
  state.roomChangeCbs.clear();
  state.measureDeferred = false;
  state.lastRoomFocus = null;
  state.lastRoomFocusY = -1;
  state.inited = false;
  state.activeIndex = -1;
  state.promoA = -1;
  state.promoB = -1;
  state.residentMask = -1;
  state.curtainArmed = false;
  state.snapNext = false;
  state.dissolveInFlight = false;
}

export default { initEngine, scrollToRoom, onRoomChange, destroyEngine };




let perf = null;

if (PERF) {
  perf = {
    frames: 0,
    dropped: 0,
    worstMs: 0,
    budgetMs: 16.7,   
    windowStart: 0,
    windowFrames: 0,
    windowDropped: 0,
  };
  window.__cccPerf = perf;
  console.info('[engine:perf] frame monitor active. window.__cccPerf holds the counters.');
}

function perfSample(dt) {
  const p = perf;
  p.frames++;

  
  
  if (dt > 4 && dt < p.budgetMs) p.budgetMs = p.budgetMs * 0.98 + dt * 0.02;

  if (dt > p.budgetMs * 1.5) { p.dropped++; p.windowDropped++; }
  if (dt > p.worstMs) p.worstMs = dt;

  p.windowFrames++;
  const now = state.lastFrameTime;
  if (!p.windowStart) p.windowStart = now;

  if (now - p.windowStart >= 2000) {
    const pct = (p.windowDropped / Math.max(1, p.windowFrames) * 100).toFixed(1);
    console.info(
      '[engine:perf] %d frames / 2s · %d late (%s%%) · worst %sms · budget %sms · total late %d',
      p.windowFrames, p.windowDropped, pct,
      p.worstMs.toFixed(1), p.budgetMs.toFixed(1), p.dropped
    );
    p.windowStart = now;
    p.windowFrames = 0;
    p.windowDropped = 0;
    p.worstMs = 0;
  }
}
