/**
 * Cook County Cooks — v3 "Cinema"
 * assets/engine.js — the scroll-driven cinematic engine.
 *
 * Contract (see SPEC.md):
 *   Each `.room` is a tall scroll runway. Inside it, `.stage` is `position: sticky`
 *   and `height: 100svh`, so the stage stays pinned for exactly
 *   (roomHeight - stageHeight) pixels of scrolling. This engine converts that
 *   pinned distance into a normalised progress `p` and publishes SIX numbers as
 *   CSS custom properties on the `.stage` element:
 *
 *      --p            0 → 1     progress through this room's runway
 *      --plate-scale  1 → 1.085 camera push-in
 *      --plate-x      number    parallax drift x  (see unit note below)
 *      --plate-y      number    parallax drift y  (see unit note below)
 *      --enter        0 → 1     dissolve-in / dissolve-out
 *      --bloom        0 → 1     lights-come-up bloom
 *
 *   UNIT NOTE — do not "fix" this: --plate-x / --plate-y are written as BARE
 *   NUMBERS, not percentages. theme.css registers them via
 *   `@property { syntax: "<number>" }` and applies the units itself, as
 *   `translate3d(calc(var(--plate-x) * 1cqw), calc(var(--plate-y) * 1svh), 0)`.
 *   Appending '%' here makes the registered property reject the value and fall
 *   back to its initial-value of 0, silently killing all parallax.
 *
 *   Everything else — the actual transforms, opacities, filters, hotspot
 *   mirroring — is expressed in theme.css from those six numbers. The engine
 *   NEVER touches any other style, never reads a computed style, and never
 *   reads layout inside the animation loop.
 *
 * Why the old version stuttered and this one cannot:
 *   v2.2 scrubbed a 350-frame image sequence. Every scroll event had to swap a
 *   decoded bitmap; a missed decode = a visibly missing frame. Here there are no
 *   frames. There is one shared rAF loop, all geometry is measured once and kept
 *   in flat typed arrays, and the per-frame work is ~30 floating point ops plus a
 *   handful of `setProperty` calls on at most two elements. The compositor does
 *   the rest on the GPU.
 *
 * Plain ES module. No dependencies. No build step.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Tunables — the whole "feel" of the film lives in this block.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Max push-in. 8.5% over a full room read as a slow dolly, not a zoom. */
const PUSH_IN_MAX = 0.085;

/** Parallax drift. Units are applied by theme.css (1cqw / 1svh per unit), so
 *  these are ~1.4 container-widths-percent and ~1.8 viewport-heights-percent.
 *  Deliberately tiny — this is a camera on a track, not a Ken Burns slideshow. */
const DRIFT_X_PCT = 1.4;
const DRIFT_Y_PCT = 1.8;

/** Time-constant (ms) for the cross-dissolve / bloom smoothing. Scale and
 *  position track scroll EXACTLY (anything else feels like input lag), but the
 *  light transitions get a short filmic lag so the rooms breathe into each other. */
const DISSOLVE_TAU = 90;

/** How long the shared loop keeps spinning after everything has settled before
 *  it parks itself. Parking saves battery on iPads; any input re-arms it. */
const IDLE_FRAMES_BEFORE_PARK = 45;

/** Debounce for expensive re-measures. Required by SPEC: 150ms. */
const RESIZE_DEBOUNCE_MS = 150;

/* ── The occluded-window fallback ────────────────────────────────────────────
 *
 * Chrome zeroes requestAnimationFrame in a hidden tab, and throttles it hard in
 * an occluded window, in a background window under Energy Saver, and on an
 * iPad whose app has been swiped away from. That is correct browser behaviour,
 * but this site runs on store desktops and iPads where exactly that is the
 * NORMAL state: the browser sits behind the POS window all day and a kiosk
 * panel can be composited on screen while the rAF scheduler considers the page
 * uninteresting. v2.2.3 already shipped a setInterval safety net for this same
 * class of bug on this same site; this is that idea, done properly.
 *
 * It is a FALLBACK, not a second engine, and three rules keep it that way:
 *
 *   1. It only exists while the loop is running. armFallback() is called from
 *      wake() and disarmFallback() from park(), so a parked engine has no timer
 *      at all — an idle iPad pays literally nothing.
 *   2. While it is armed it stands down unless rAF has failed to service a
 *      frame for RAF_STALE_MS. On a healthy page the callback is two boolean
 *      tests and a subtraction, five times a second, and never touches the DOM.
 *   3. When it does drive, it calls serviceFrame() — the SAME function tick()
 *      calls, with the same maths and the same write path. There is exactly one
 *      update path in this file, so rAF and the interval can never disagree.
 *
 * RAF_STALE_MS is deliberately well above the worst frame this page produces
 * under a 4x-CPU-throttled iPad Pro profile (517ms in the original gauntlet,
 * 650-720ms on the harness used for this fix), so a merely slow frame never
 * trips it — only a scheduler that has genuinely stopped. The cost of being
 * generous is at most ~1.2s before the fallback picks up a window nobody is
 * looking at; the cost of being tight would be firing during normal raster.
 */
const FALLBACK_INTERVAL_MS = 200;   // 5Hz — enough for a scroll to track, cheap enough to ignore
const RAF_STALE_MS         = 1000;  // no rAF frame for this long ⇒ the scheduler has stopped
const FALLBACK_DT_CAP      = 250;   // clamp the smoothing delta the fallback reports
const FALLBACK_IDLE_DRIVES = 12;    // ~2.4s of nothing to do ⇒ park (and disarm the timer)

/** Values closer than this are considered "arrived" / not worth re-writing. */
const EPS = 0.0005;

/** scrollToRoom tween shaping. */
const TWEEN_MIN_MS = 420;
const TWEEN_MAX_MS = 1100;
const TWEEN_PX_PER_MS = 2.6;

/** Takeover detection during a scrollToRoom flight. See onTakeoverWheel(). */
const TAKEOVER_GRACE_MS   = 280;  // envelope-priming window for an inherited wheel stream
const STREAM_NEW_MS       = 90;   // a wheel stream starting later than this cannot be inertia
const WHEEL_STREAM_GAP_MS = 160;  // silence longer than this ends the current wheel stream
const WHEEL_ENV_TAU       = 1600; // envelope decay (ms) — slower than any real momentum tail (swept)
const WHEEL_RISE_RATIO    = 1.3;  // a delta must beat the envelope by this much to count as a push
const WHEEL_MIN_DELTA     = 12;   // px; below this a wheel event is noise
const WHEEL_RISE_EVENTS   = 2;    // consecutive rising events needed while an envelope is standing

/** Perf self-check flag (see the bottom of this file). */
const PERF = (() => {
  try { return new URLSearchParams(location.search).has('perf'); }
  catch (_) { return false; }
})();

/* ────────────────────────────────────────────────────────────────────────────
 * Flat storage layout.
 *
 * Per-room data lives in two Float64Arrays rather than in objects, so the hot
 * path touches one contiguous buffer instead of chasing pointers across the
 * heap. Strides are named constants so the arithmetic stays readable.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Geometry — written ONLY by measure(), read-only in the loop. */
const M_STRIDE  = 5;
const M_TOP     = 0; // absolute document offset of the room's top edge (px)
const M_HEIGHT  = 1; // full runway height of .room (px)
const M_STAGE_H = 2; // height of the pinned .stage (px) — this is the real 100svh
const M_RUNWAY  = 3; // HEIGHT - STAGE_H, i.e. how far the stage stays pinned
const M_DIR_X   = 4; // +1 / -1, alternates so adjacent rooms drift opposite ways

/* Live values — written by the loop. */
const V_STRIDE   = 9;
const V_P        = 0;
const V_SCALE    = 1;
const V_X        = 2;
const V_Y        = 3;
const V_ENTER    = 4; // smoothed
const V_BLOOM    = 5; // smoothed
const V_ENTER_T  = 6; // target, straight from scroll
const V_BLOOM_T  = 7; // target, straight from scroll
const V_EXIT     = 8; // M3 lights-down, pure function of p (not smoothed)

/* Last values actually pushed to the DOM, for write de-duplication. */
const W_STRIDE = 7;

/* ── M3 · LIGHTS DOWN, THEN LIGHTS UP (v29) ──────────────────────────────────
 * The outgoing room's --exit-fine ramps 0 → 1 across this window of its own
 * progress, smoothstepped. The incoming stage becomes visible at p ≈ .56 of
 * the outgoing room (§05's --dissolve floor at the 220/58svh geometry) and is
 * ~75% opaque by .74, so the outgoing plate is already on its way down when the
 * incoming one appears and fully down before the two are at equal weight — and
 * the incoming room arrives on its own dark twin (theme.css §06b). Dark over
 * dark: the double exposure the design audit measured (P1-3) goes below
 * perception. theme.css §06 turns the number into the grade. The last room has
 * no successor and never exits. Lite and off tiers skip it (C5). */
const EXIT_FROM = 0.50;
const EXIT_TO   = 0.74;

/** How much of a stage height a room with a successor takes to leave. See
 *  computeFrame(): the departure is fully occluded by the incoming stage. */
const EXIT_RUN_K = 0.35;

/* ────────────────────────────────────────────────────────────────────────────
 * Easing.
 *
 * A linear push-in reads as mechanical — that is exactly the "cheap" feeling
 * Jeff objected to. easeInOutCubic accelerates and settles like a real dolly
 * with a human on the wheel; easeOutQuint gives the dissolve a soft landing.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Monotonic milliseconds, with a fallback for very old engines. */
function nowMs() {
  return (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
}

/** Clamp to 0..1. */
function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

/** Slow start, slow finish. Used for the camera push and the scrollToRoom tween. */
function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Fast, then a very long soft tail. Used for dissolve-in and bloom. */
function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

/** Symmetrical S-curve with gentler shoulders than cubic. Used for parallax so
 *  the drift never "starts" or "stops" on a visible frame. */
function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** 3t² − 2t³. The M3 lights-down ramp. */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Engine state (module singleton — there is one page, one loop).
 * ──────────────────────────────────────────────────────────────────────────── */

const state = {
  inited: false,
  destroyed: false,

  /** Per-room DOM handles. Index matches the typed-array stride index. */
  rooms: [],            // { id, name, el, stage, wrap, live, settled }
  byName: new Map(),    // 'pass'      → index
  byId: new Map(),      // 'room-pass' → index

  M: null,              // Float64Array geometry
  V: null,              // Float64Array live values
  W: null,              // Float64Array last-written values
  liveFlags: null,      // Uint8Array — 1 when the room is inside the IO margin

  // Loop bookkeeping
  rafId: 0,
  running: false,
  dirty: true,          // set by the passive scroll listener
  lastScrollY: -1,
  lastFrameTime: 0,
  idleFrames: 0,
  dissolveInFlight: false,
  snapNext: false,      // a jump happened: land ON this position's values, do not ease

  // Occluded-window fallback (see FALLBACK_INTERVAL_MS above)
  fallbackTimer: 0,
  lastRafAt: 0,         // nowMs() of the last frame rAF actually serviced
  lastFallbackAt: 0,
  fallbackIdle: 0,

  // Diagnostics, exposed read-only on the public API. Plain integer bumps.
  rafFrames: 0,
  fallbackDrives: 0,
  settles: 0,
  repairs: 0,
  measures: 0,

  // Active-room tracking
  activeIndex: -1,
  roomChangeCbs: new Set(),

  // C2 · ownership (v29). The room whose `.is-owned` class is on, or -1. It
  // follows the room whose --cut is open (ownerCandidate) after a short dwell
  // so a fling does not hand every room it passes the class, and it is -1 for
  // the whole of an M4 cut.
  ownedIndex: -1,
  ownTimer: 0,
  ownCand: -1,          // the room whose --cut is open (see ownerCandidate)
  cutZ: 0.6433,         // theme.css §02/§17 --cut-z / --cut-k, read in measure()
  cutK: 100,
  cutting: false,
  cutEl: null,

  // C1 · the tool viewer (v29). While html.is-viewing / ccc-locked is on, the
  // engine is parked and the lock's scroll jump is ignored; one sync after.
  viewing: false,
  viewSyncOwed: false,
  classMO: null,

  // C3 · first frame (v29): dispatched once, after the first real frame paints.
  firstFrameSent: false,
  firstFramePending: false,

  // Layer promotion — indices of the (at most two) rooms currently carrying
  // will-change. Decoupled from the IO live set on purpose; see updatePromotions().
  promoA: -1,
  promoB: -1,

  // Residency — bitmask of the rooms currently allowed to paint. -1 means "not
  // yet computed", which is never a valid mask, so the first write always
  // happens. See the RESIDENCY section.
  residentMask: -1,

  // The curtain's inputs. NONE of these is derived from the cached geometry in
  // M — that is the whole point of the rebuild. See the RESIDENCY section.
  paintIO: null,          // IntersectionObserver over the .stage elements
  byStage: new Map(),     // stage element → room index (IO entries carry no id)
  paintNear: null,        // Uint8Array — 1 when the BROWSER says the stage is in band
  paintSeen: null,        // Uint8Array — 1 once the observer has reported on it at all
  paintHold: null,        // Float64Array — nowMs() before which a room may not be hidden
  curtainArmed: false,    // false ⇒ every room is visible, no exceptions
  curtainTimer: 0,        // re-arm timer after a geometry event
  dwellTimer: 0,          // "a room went out of band; re-check after the dwell"
  lastVvSig: '',          // visual-viewport size fingerprint (iOS toolbar detector)
  lastMeasureAt: 0,       // nowMs() of the last measure(), for the leading-edge throttle
  lastPaintRefresh: 0,    // nowMs() of the last forced re-observation
  measureDeferred: false, // measure() ran while the rooms were out of the scroll
                          // flow (the viewer's scroll lock) and kept the old table;
                          // a real pass is owed. See roomsOutOfFlow().

  // Focus bookkeeping for the FOCUS OWNERSHIP block: the last in-room element
  // to take focus, and where the page was when it did. Together they tell a
  // focus RESTORE (the viewer handing focus back to the hotspot that opened it)
  // from the reader moving. See onFocusIn().
  lastRoomFocus: null,
  lastRoomFocusY: -1,

  // scrollToRoom tween
  tween: null,          // { from, to, start, dur, resolve, cancelled }

  // Environment
  reduceMotion: false,
  // C5 · the motion tier, html[data-motion] ∈ full | lite | off (S6 sets it;
  // absent = full). 'off' is treated exactly like prefers-reduced-motion;
  // 'lite' keeps the scrub but drops M3's lights-down and always cuts on a
  // menu jump. See readMotionTier().
  motion: 'full',
  motionMO: null,
  motionMQ: null,
  io: null,
  listeners: [],        // [target, type, fn, opts] for clean teardown
  resizeTimer: 0,
  lastGeomSig: '',
};

/* ────────────────────────────────────────────────────────────────────────────
 * Listener bookkeeping — every listener we add is recorded so destroy() can
 * remove all of them. A half-removed engine is how you get two rAF loops.
 * ──────────────────────────────────────────────────────────────────────────── */

function on(target, type, fn, opts) {
  if (!target || !target.addEventListener) return;
  target.addEventListener(type, fn, opts);
  state.listeners.push([target, type, fn, opts]);
}

function offAll() {
  for (const [target, type, fn, opts] of state.listeners) {
    try { target.removeEventListener(type, fn, opts); } catch (_) { /* noop */ }
  }
  state.listeners.length = 0;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Measurement.
 *
 * THE ONLY PLACE IN THIS FILE THAT READS LAYOUT.
 *
 * All reads happen back-to-back with zero interleaved writes, so the browser
 * performs at most one layout flush for the whole pass regardless of how many
 * rooms exist. Called on init, on debounced resize, on orientationchange, on
 * visualViewport resize, and when the page becomes visible again.
 *
 * It can also DECLINE. A pass taken while the rooms are out of the document's
 * scroll flow (the tool viewer's scroll lock) is kept out of the table and
 * retaken at the next event after the unlock — see roomsOutOfFlow() below.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A MEASUREMENT IS ONLY A MEASUREMENT IF THE ROOMS ARE IN THE DOCUMENT.
 *
 * THE DEFECT, MEASURED. The tool viewer (overlay.js §3) locks background scroll
 * the only way that holds on iOS: `body { position: fixed; top: -<scrollY>px }`.
 * While that is on, the rooms are still drawn exactly where they were, but the
 * document has no idea they exist — a fixed body contributes nothing to the
 * scrollable overflow — so `scrollY` reads 0 and `scrollHeight` collapses to one
 * viewport. Every geometry event that fires in that window (a tab switch to the
 * POS and back, an iPad rotation, the on-screen keyboard coming up under a quote
 * sheet, a Split View drag) lands in measure(), and measure() faithfully cached
 * the VISUAL offsets as if they were document offsets. Reproduced at 1440x900,
 * office room open at scrollY 7920: one measure() during the lock and the
 * office's cached top went 7920 -> 0, and every other room's moved by the same
 * -7920. Nothing re-measures on close, so the table stayed wrong.
 *
 * What the rep then saw when the viewer closed:
 *     · every stage on screen at --enter 0, opacity 0 — lit pixels 0.0% of the
 *       viewport, and 0.0% after scrolling, because every scroll position is
 *       being read against the wrong table;
 *     · 0 of 16 hotspots hit-testable, so no tool would open;
 *     · the ticket rail still lit for the room they had been in;
 *     · and, since the focus-ownership block below reads the same table, the
 *       page teleported to scrollY 0 as focus returned to the hotspot.
 *   The main thread was healthy throughout (0 long tasks, rAF at 58 fps): it was
 *   not a hang, it was a page confidently painting nothing. To the rep that is
 *   "the whole site locking up and freezing", and a reload is the only way out.
 *   The v6 build showed the same black page (no scroll jump; the focus block
 *   did not exist yet), so this predates last night's changes.
 *
 * THE RULE. A room cannot lie outside the document that contains it: not above
 * its top, not below its `scrollHeight`. If the pass just read a room top at a
 * negative document offset, or a room bottom past the end, the rooms are not in
 * the scroll flow
 * right now, and the pass is not a measurement of the page — it is a
 * measurement of the lock. Keep the table we have (it was right when the lock
 * went on, and the page is put back exactly where it was when it comes off),
 * remember that a measurement is owed, and take it at the first event after
 * the rooms are back in the flow: the unlock's own scrollTo(), the focus
 * returning to the hotspot, the next geometry event, or the tab becoming
 * visible. Each of those is an event handler, so the layout read stays out of
 * the loop.
 *
 * BOTH HALVES ARE NEEDED. The bottom test alone catches the common case (the
 * viewer opened deep in the page: the freezer's bottom read 5328 against a
 * 900px document). It misses a resize INSIDE the lock that makes the rooms
 * shorter than the stashed offset: 1440x900 -> 1100x700 with the office open
 * shrank the eight rooms to 8470px, so with the body still held at -7920px
 * every room sat entirely above the viewport — bottom 550, document 700 — and
 * the pass went through and wrote the table. The hero's top read -7920 in that
 * same pass, which no in-flow layout can produce: the rail is fixed, nothing
 * above the hero is in flow, and no room carries a negative margin.
 *
 * Tested on the invariant rather than on overlay.js's class name so the engine
 * still knows nothing about the viewer, and so any future lock that takes the
 * rooms out of the flow — whatever it is called — is caught by the same line.
 * `html` and `body` clip on x only, and the page's height IS the rooms.
 */
function roomsOutOfFlow(docScrollHeight, firstRoomTop, lastRoomBottom) {
  return firstRoomTop < -1 || lastRoomBottom > docScrollHeight + 1;
}

/** measure() found the rooms out of the scroll flow and kept the old table. A
 *  fresh pass is owed the moment they are back. */
function retryDeferredMeasure() {
  if (state.measureDeferred && !state.destroyed) measure();
}

function measure() {
  const rooms = state.rooms;
  const M = state.M;
  if (!rooms.length || !M) return;

  // One scroll read up front; getBoundingClientRect is viewport-relative and we
  // want absolute document offsets.
  const scrollY = window.scrollY || window.pageYOffset || 0;

  // --- READ PHASE (no writes below this line until the loop ends) ---
  // Read into locals, not into M: the pass may turn out not to be a measurement
  // of the page at all (see roomsOutOfFlow), and a half-written table is worse
  // than the old one.
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

    // The stage's own measured height IS the resolved 100svh. Deriving the
    // runway from it (instead of window.innerHeight) is what makes iOS Safari's
    // collapsing address bar a non-event: svh does not change when the chrome
    // hides, so neither does any number we cache here.
    tops[i] = top;
    heights[i] = height;
    stageHs[i] = stageRect.height || height;
    if (top < firstTop) firstTop = top;
    if (top + height > lastBottom) lastBottom = top + height;
  }
  // --- END READ PHASE ---

  if (roomsOutOfFlow(docH, firstTop, lastBottom)) {
    // Not the page. Keep the table, owe a measurement, touch nothing else — the
    // curtain and the loop are left exactly as they are, because whatever is
    // covering the rooms right now is not something this engine can see past.
    state.measureDeferred = true;
    return;
  }
  state.measureDeferred = false;

  for (let i = 0; i < n; i++) {
    const o = i * M_STRIDE;
    M[o + M_TOP] = tops[i];
    M[o + M_HEIGHT] = heights[i];
    M[o + M_STAGE_H] = stageHs[i];
    // Guard against a room shorter than its stage (mis-authored CSS): a zero or
    // negative runway would produce Infinity/NaN progress.
    M[o + M_RUNWAY] = Math.max(1, heights[i] - stageHs[i]);
    M[o + M_DIR_X] = (i % 2 === 0) ? 1 : -1;
  }

  state.measures++;
  state.lastMeasureAt = nowMs();

  // C2's hand-over point (ownerCandidate) is theme.css §05's --cut, whose exit
  // constants are solved per breakpoint on :root. Media-query constants, not
  // geometry: safe to read here, never in the loop.
  try {
    const rs = getComputedStyle(document.documentElement);
    const z = parseFloat(rs.getPropertyValue('--cut-z'));
    const k = parseFloat(rs.getPropertyValue('--cut-k'));
    if (Number.isFinite(z) && z > 0) state.cutZ = z;
    if (Number.isFinite(k) && k > 0) state.cutK = k;
  } catch (_) { /* keep the §02 defaults */ }

  // If the LAYOUT geometry actually moved — not merely the visual viewport, so
  // not an iOS toolbar, but a rotation, a Split View drag, a font settling, a
  // late plate changing the document height — then every --enter now in flight
  // was aimed at a target computed for the old geometry. Easing on from there
  // walks the cross-dissolve through values that belong to neither layout, and
  // the measured symptom is a frame where the incoming room is still at 0.003
  // and the outgoing one has already gone: a band of bare page ground across
  // the top of the screen. Land on this layout's answer instead.
  const sig = geometrySignature();
  if (sig !== state.lastGeomSig) state.snapNext = true;
  state.lastGeomSig = sig;
  state.lastVvSig = visualViewportSignature();
  state.dirty = true;

  // A re-measure exists BECAUSE something moved, which means everything this
  // engine believed a moment ago is suspect. Show every room, then let the
  // observer close the curtain again once the page has stopped moving.
  openCurtain();
  armCurtain();

  // The course menu's pill positions are layout too; this is the place for
  // them (see M4 · THE SLIDING TICKET).
  measureTickets();
  scheduleOffstageCheck();

  wake();
}

/** Size (not offset) of the visual viewport. On iOS this is what a URL-bar
 *  collapse changes, and it changes without `window.resize` ever firing. */
function visualViewportSignature() {
  const vv = window.visualViewport;
  if (!vv) return '-';
  return Math.round(vv.width) + 'x' + Math.round(vv.height) + '@' + (vv.scale || 1).toFixed(3);
}

/**
 * Cheap fingerprint of page geometry. visualViewport fires constantly while the
 * iOS address bar animates; if this string has not changed there is genuinely
 * nothing to re-measure and we can skip the layout flush entirely.
 */
function geometrySignature() {
  const de = document.documentElement;
  const vv = window.visualViewport;
  return de.clientWidth + 'x' + de.clientHeight + '/' + de.scrollHeight +
         '/' + (vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) : '-');
}

/* ────────────────────────────────────────────────────────────────────────────
 * The single shared rAF loop.
 *
 * One loop for the entire page — rooms, dissolves and the scrollToRoom tween all
 * step from here. There is never more than one rAF in flight.
 * ──────────────────────────────────────────────────────────────────────────── */

function wake() {
  if (state.reduceMotion || state.destroyed) return;
  // C1: nothing on the page is visible under the viewer, so nothing is worth a
  // frame. The owed sync runs when the lock comes off (exitViewing).
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

  // Frame delta, clamped so a backgrounded tab or a long GC pause cannot make
  // the dissolve jump on the next visible frame.
  const dt = state.lastFrameTime ? Math.min(64, now - state.lastFrameTime) : 16.7;
  state.lastFrameTime = now;

  // The fallback's only input. Stamped from nowMs() rather than from `now` so
  // both sides read the same clock even on an engine without performance.now().
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

  // Nothing to compute. This is the cheapest possible frame.
  if (++state.idleFrames > IDLE_FRAMES_BEFORE_PARK) { park(); checkOffstage(); }
}

/* ── v29 fix round (G2 m1) · AN OBJECT MOSTLY OFF SCREEN TAKES NO TAP ────────
 * Where no crop can hold a room's objects (the Back Office's clipboards on a
 * 4:3 iPad, the arcade cabinet at the plate's edge — theme.css §06d), the part
 * of a hotspot left at the screen's edge was still a live target: a tap at the
 * right edge of an iPad in the Back Office opened a tool whose object the rep
 * could not see. A hotspot whose visible area (inside the viewport, below the
 * course menu) is under half of its box is made `inert` — no tap, no Tab stop,
 * out of the accessibility tree — and marked data-offstage so theme.css drops
 * its reticle; the room's chip for the same tool is untouched. The same pass
 * keeps objects off the room's type (G3 M-6): brackets that would cross the
 * title card are not drawn at rest (data-over-rail), and a name label that
 * would hang onto the type hangs above its object instead (data-label-up).
 * Checked for the owned room when the engine parks (the page is still, its
 * style is clean, so the rect reads cost no layout), on ownership and after a
 * re-measure. */
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
  } catch (_) { /* noop */ }
  let list, type;
  try {
    list = room.el.querySelectorAll('.hotspots > .hotspot');
    type = room.el.querySelectorAll('.rail-kicker, .rail-title, .rail-chips > .chip');
  } catch (_) { return; }
  // the room's own type: nothing of an object may be drawn over it (G3 M-6)
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
    // an object whose box runs into the title card keeps its tap but loses
    // its resting brackets there (theme.css), so no line crosses the type
    setFlag(h, 'data-over-rail', hits(r.left, r.top, r.right, r.bottom));
    // …and its name hangs ABOVE it when hanging below would land on the type
    // (or off the bottom of the screen). The label is laid out even while
    // hidden, so its size is known; both placements are tried from the box.
    const lab = h.querySelector('.hotspot-label');
    if (lab) {
      const lr = lab.getBoundingClientRect();
      // the label's own nudge (below) is already in lr; take it back out
      const k = h.offsetWidth ? r.width / h.offsetWidth : 1;
      const prev = (parseFloat(lab.dataset.nudge) || 0) * k;
      const L = lr.left - prev, R = lr.right - prev;
      const lh = lr.height;
      const downT = r.bottom + 10, upB = r.top - 10;
      const downBad = hits(L, downT, R, downT + lh) || downT + lh > vh - 4;
      const upBad = hits(L, upB - lh, R, upB) || upB - lh < top + 4;
      setFlag(h, 'data-label-up', downBad && !upBad);
      // …and it stays on screen sideways: an object at the plate's edge (the
      // arcade, the clipboards) hung its name half off the glass.
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
  // v29 final: check once right after ownership moves, even while the engine is
  // still running — M2's reticles fade in from 360 ms, and waiting for the park
  // (45 idle frames) let a locker bracket sit on "Break Room" for ~1.5 s
  // (verifier V2 m1). One off-frame read per ownership change; the park check
  // below still settles the final positions.
  state.offstageTimer = setTimeout(() => {
    state.offstageTimer = 0;
    checkOffstage();
  }, 60);
}

/* ────────────────────────────────────────────────────────────────────────────
 * serviceFrame — THE single update path.
 *
 * tick() calls it, the occluded-window fallback calls it, the visibilitychange
 * repair calls it. One scroll read at the top, all arithmetic in the middle, all
 * DOM writes at the end; no caller can introduce a second way of updating a room
 * and therefore no caller can disagree with another about what a room looks like.
 *
 * @param {number}  now    ms on the nowMs() timeline
 * @param {number}  dt     frame delta for the dissolve smoothing
 * @param {boolean} snap   true ⇒ smoothing coefficient 1: land ON the targets for
 *                         this scroll position instead of easing toward them.
 * @param {boolean} resolve true ⇒ collapse the cross-dissolve to a coherent
 *                         composite (see resolveComposite).
 * @param {boolean} fromFallback true ⇒ rAF is not running, so IntersectionObserver
 *                         is not being delivered either; re-derive liveness.
 * @returns {boolean} whether there was anything to do.
 * ──────────────────────────────────────────────────────────────────────────── */
function serviceFrame(now, dt, snapIn, resolve, fromFallback) {
  let snap = snapIn;
  // ---- 1. Advance the programmatic scroll tween, if any. ----
  // Doing it here rather than in a second rAF keeps the "one loop" guarantee.
  if (state.tween) stepTween(now);

  // ---- 2. Single scroll read for the whole frame. ----
  // Read once, at the top, before any write. Nothing below this line reads the
  // DOM, so this can never be a read-after-write layout thrash.
  const scrollY = window.scrollY || window.pageYOffset || 0;
  const scrolled = scrollY !== state.lastScrollY;

  // ---- 3. Early-out. ----
  if (!scrolled && !state.dirty && !state.dissolveInFlight && !state.tween) return false;

  // ---- 4. Liveness, when the observer cannot help. ----
  // IntersectionObserver callbacks are delivered from the same "update the
  // rendering" step that runs rAF callbacks — so in a window where rAF has
  // stopped, IO has stopped too, and a room scrolled into view would never be
  // marked live and never have its vars written. (That is precisely why `host`
  // came back with empty --p / --enter in the field report.) Re-derive it from
  // the cached geometry instead: pure float compares, zero layout reads, and
  // skipped entirely on the healthy rAF path.
  // The jump test again, from the OTHER side. onScroll() catches a jump when the
  // scroll event is delivered; this catches one when it is not — coalesced away,
  // starved by a busy main thread, or simply a scroll the compositor performed
  // that we are only learning about now, from this frame's own scrollY read.
  // Same threshold, same consequences, and it is two floats.
  if (state.lastScrollY >= 0 &&
      Math.abs(scrollY - state.lastScrollY) > (window.innerHeight || 800) * JUMP_FRACTION) {
    snap = true;
    openCurtain();
    armCurtain();
  }

  //
  // A JUMP NEEDS THE SAME TREATMENT, for a different reason with an identical
  // symptom. settleDormant() freezes a room's --enter at 0 when it leaves the
  // observer's band, and computeFrame() skips any room the observer has not
  // marked live — so on the first frame after a jump the rooms that just
  // arrived still carry `--enter: 0` from the last time we scrolled past them,
  // and theme.css resolves that to opacity 0. Every stage on the screen is
  // VISIBLE and every one of them is transparent: measured at 393x852, jumping
  // to y=0 from mid-document gave a frame with zero coverage across all
  // thirteen sample rows, which is a flat dark-navy screen. IO would fix it a
  // frame or two later; on a starved main thread "a frame or two" is as long as
  // the phone needs it to be. `snap` is set by onScroll()'s jump test, and
  // priming is additive-only pure arithmetic, so doing it here costs a jump one
  // pass over eight floats and cannot un-live anything.
  if ((fromFallback || snap) && scrolled) primeLiveNeighbourhood(scrollY);

  state.lastScrollY = scrollY;
  state.dirty = false;

  computeFrame(scrollY, dt, snap);
  if (resolve) resolveComposite(scrollY);
  flushWrites();
  updatePromotions(scrollY);
  updateActiveRoom(scrollY);
  updateOwnerCandidate();
  // AFTER updatePromotions and updateActiveRoom: the curtain's "never hide the
  // room being read, or its neighbours" rule reads both of them, so computing
  // it first would spend a frame acting on the previous position's answer.
  updateResidency();
  return true;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The occluded-window fallback. Armed by wake(), disarmed by park().
 * ──────────────────────────────────────────────────────────────────────────── */

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
  // Parked, torn down, or reduced-motion: the loop is not supposed to be
  // producing frames at all, so neither is this.
  if (state.destroyed || state.reduceMotion || !state.running) return;

  // THE STAND-DOWN TEST. rAF serviced a frame recently, so it is doing its job
  // and this must not touch anything. Two compares; no DOM, no allocation.
  const now = nowMs();
  if (now - state.lastRafAt < RAF_STALE_MS) return;

  // v29: A SLOW FRAME IS NOT AN OCCLUDED WINDOW. The fallback exists for a page
  // the browser has stopped scheduling — a hidden tab, a window behind the POS.
  // It also used to fire whenever one frame took over RAF_STALE_MS, i.e. during
  // exactly the long tool-open stalls (audit/perf.md §3.2/§3.9: 303 firings in
  // one slow 112 s scroll), where it re-ran serviceFrame and churned the rAF
  // request on a main thread that was already drowning. A visible, focused
  // document is being scheduled; rAF will come.
  const focused = (typeof document.hasFocus !== 'function') || document.hasFocus();
  if (!isHidden() && focused) return;

  const dt = state.lastFallbackAt
    ? Math.min(FALLBACK_DT_CAP, now - state.lastFallbackAt)
    : FALLBACK_INTERVAL_MS;
  state.lastFallbackAt = now;
  state.fallbackDrives++;

  // Re-arm the real loop. `running` means "a frame is wanted", and wake() is a
  // no-op while it is true — so if the request we are running on was swallowed
  // by a scheduler that has since come back (a tab shown again, a window
  // un-occluded, Energy Saver releasing the page), nothing would ever ask for
  // another frame and the whole site would stay on this 5Hz drip. Cancel first
  // so there is never more than one request in flight: the "one shared rAF
  // loop" guarantee has to survive the fallback, not be broken by it.
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(tick);

  // A page the compositor is not showing gets the settled composite rather than
  // a 5Hz cross-dissolve: nobody can see a dissolve at 5Hz, and a coherent room
  // is the only thing worth leaving on a screen we cannot repaint smoothly.
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

/* ────────────────────────────────────────────────────────────────────────────
 * Per-frame math. Pure arithmetic over the cached typed arrays.
 * Not a single DOM access in this function.
 * ──────────────────────────────────────────────────────────────────────────── */

function computeFrame(scrollY, dt, snap) {
  const rooms = state.rooms;
  const M = state.M;
  const V = state.V;
  const live = state.liveFlags;

  // Exponential smoothing coefficient, derived from the real frame delta so the
  // dissolve takes the same wall-clock time at 60Hz, 120Hz or a dropped 30Hz.
  // snap ⇒ k = 1: used when we are repairing a page that has not been ticking,
  // where easing from a stale value would show the user half a second of the
  // very ghost we are there to remove.
  const k = snap ? 1 : (1 - Math.exp(-dt / DISSOLVE_TAU));

  // v29 fix round (G3 M-3): lite dims the outgoing room too. Its hand-over was
  // the muddiest state on the site — a plain cross-dissolve of two lit rooms,
  // screens and all — and the lights-down is one number on a filter and a
  // screen opacity that are already there (no new layer, no new pass).
  const exitOn = state.motion === 'full' || state.motion === 'lite';
  const lastRoom = rooms.length - 1;

  let anyInFlight = false;

  for (let i = 0; i < rooms.length; i++) {
    if (!live[i]) continue; // dormant: vars stay exactly as last written (frozen)

    const o = i * M_STRIDE;
    const v = i * V_STRIDE;

    const top = M[o + M_TOP];
    const stageH = M[o + M_STAGE_H];
    const runway = M[o + M_RUNWAY];
    const dirX = M[o + M_DIR_X];

    // --- progress through the pinned runway ---
    const p = clamp01((scrollY - top) / runway);

    // --- camera push-in ---
    const pushEase = easeInOutCubic(p);
    const scale = 1 + PUSH_IN_MAX * pushEase;

    // --- parallax drift ---
    // Centred on 0 at p = 0.5 so the plate is never off-centre for long, and
    // eased so the direction change at the midpoint is invisible.
    const drift = (smootherstep(p) - 0.5) * 2;
    const x = drift * DRIFT_X_PCT * dirX;
    const y = -drift * DRIFT_Y_PCT;

    // --- enter / dissolve ---
    // Ramps 0→1 across the viewport-height of approach (room bottom edge rising
    // into view) and back 1→0 across the viewport-height of departure. Two rooms
    // are therefore mid-dissolve at once, which is exactly the cross-fade.
    const enterIn = clamp01((scrollY - (top - stageH)) / stageH);
    // v29: a room with a successor leaves over EXIT_RUN_K of a stage, not a
    // whole one. Its departure starts only once the next room is fully opaque
    // over it (at every breakpoint --dissolve-run >= 0.396 x --pin-lead, which
    // is where the incoming stage reaches opacity 1 — §05), so the fade was
    // always invisible; at a full stage it kept a whole occluded layer stack
    // alive for most of the next room and, in iPad portrait, overlapped the
    // room after that — no scroll position held one clean room (design audit
    // P1-4). At 0.35 the hold is >= 0.57 vh at every breakpoint (portrait
    // 170/42svh: 57.5svh). The last room has nothing over it and keeps the
    // full, visible ramp.
    const exitRun = i < lastRoom ? stageH * EXIT_RUN_K : stageH;
    const enterOut = 1 - clamp01((scrollY - (top + runway)) / exitRun);
    const enterTarget = easeOutQuint(Math.min(enterIn, enterOut));

    // --- bloom ---
    // Lights come up over the first ~55% of the room, then hold. Gated by enter
    // so an off-screen room never glows.
    const bloomTarget = easeOutQuint(clamp01(p / 0.55)) * enterTarget;

    // --- M3 lights-down (full tier only; see EXIT_FROM) ---
    const exit = (exitOn && i < lastRoom)
      ? smoothstep(clamp01((p - EXIT_FROM) / (EXIT_TO - EXIT_FROM)))
      : 0;

    // Smoothed toward target. Scale/x/y are NOT smoothed — they must be locked
    // to the finger or the whole thing feels like input lag.
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

/* ────────────────────────────────────────────────────────────────────────────
 * Write phase. All DOM writes for the frame happen here, at the very end, in
 * one uninterrupted burst — no read can sneak between them.
 *
 * setProperty on a custom property invalidates style for that subtree but does
 * not force a synchronous layout. Combined with the de-dup below, a still frame
 * costs zero writes and a moving frame costs at most 12 (6 vars × 2 live rooms).
 * ──────────────────────────────────────────────────────────────────────────── */

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

/**
 * Write the vars for one room, skipping any that have not moved.
 *
 * v29: these are the FINE tier (theme.css §01) — registered `inherits: false`,
 * so a write restyles the stage and, through explicit `inherit`, its direct
 * children (.plate-wrap, .hotspots, the walk-in door), and nothing deeper. The
 * public, inherited --p / --enter / --bloom / --cut / --lit that everything
 * else in a room reads are DERIVED from these in CSS (§05), quantised, so the
 * rest of the room restyles only when one of them crosses a visible step.
 * This was 14-18ms of style per frame on an iPad (audit/perf.md §3.3).
 */
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

/** Quantise. Rounding kills sub-perceptual churn, which kills wasted style work. */
function round(v, digits) {
  const f = digits === 3 ? 1e3 : (digits === 4 ? 1e4 : 1e5);
  return Math.round(v * f) / f;
}

/* ────────────────────────────────────────────────────────────────────────────
 * IntersectionObserver gating.
 *
 * rootMargin '100% 0px' = one full viewport of slack above and below. A room
 * becomes "live" a screen before it can possibly be seen, so its first painted
 * frame is already correct, and goes dormant a screen after it leaves.
 *
 * Liveness controls COMPUTATION only. Layer promotion is a separate, tighter
 * rule — see updatePromotions() — because the gauntlet measured four rooms
 * legitimately intersecting this band at iPad Pro portrait, and four promoted
 * 4K plates is precisely the GPU-memory pressure we are trying to avoid.
 *
 * The margin stays at one full viewport (SPEC: "a room more than one viewport
 * away is skipped entirely"). It must: a room goes live a full viewport before
 * its --enter ramp begins, which is the slack that absorbs IntersectionObserver's
 * async delivery on a fast flick. Tightening it would buy nothing — the extra
 * live rooms are entirely offscreen, so they are never rastered — while risking
 * a room reaching the viewport with its vars still frozen at enter = 0.
 * ──────────────────────────────────────────────────────────────────────────── */

function setupObserver() {
  if (typeof IntersectionObserver !== 'function') {
    // No IO (ancient browser): treat every room as live. Correct, just less lazy.
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
        // Settle the room to a clean end-state so a frozen plate is never left
        // stranded mid-push. This runs in the IO callback, NOT in the rAF loop,
        // so it costs the animation nothing. will-change is NOT touched here —
        // updatePromotions() is its single owner.
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

/**
 * Snap a newly-dormant room to a defensible resting state: fully pushed-in if we
 * scrolled past it, fully wide if we scrolled back above it, dissolved out either
 * way. Written once, then frozen until the room goes live again.
 */
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

/* ────────────────────────────────────────────────────────────────────────────
 * resolveComposite — never leave a half-dissolved frame.
 *
 * A cross-dissolve is only coherent while it is MOVING. Freeze one at its
 * midpoint and the page is not "a room fading into another room", it is two
 * translucent photographs stacked over the ink-950 matte: the field report's
 * hero at 0.39 opacity over black, no plate readable, and no amount of
 * scrolling changing it because the loop that drives it had stopped.
 *
 * So whenever ticking is about to stop — the tab is being hidden, or the engine
 * booted into a background tab where rAF will never run — we do not merely
 * freeze the numbers. We collapse the dissolve to a decision: ONE room is fully
 * present, every other live room is fully absent. That composite is a real
 * frame of the film. It is what the room would look like a few hundred
 * milliseconds either side of where we stopped, and it is stable.
 *
 * Which room wins: the one with the highest --enter TARGET, ties going to the
 * later room in DOM order (which is the incoming one, and paints above anyway,
 * so the resolution matches what the compositor was already heading toward).
 * If every live room targets 0 — the far tail of the last room's runway — we
 * fall back to the room with the most viewport overlap, because resolving to
 * "all absent" would be a black screen, which is the one outcome worse than a
 * ghost.
 *
 * Rooms outside the live set are deliberately untouched. theme.css registers
 * --enter with initial-value 1 (and --p 0, --plate-scale 1, --plate-x/y 0), so
 * a room this engine has never written renders as a lit, static, correctly
 * framed photograph — that is the documented no-JS design. Those rooms are all
 * more than a viewport away, so none of them is on screen to contradict the
 * room we just resolved.
 * ──────────────────────────────────────────────────────────────────────────── */

function resolveComposite(scrollY) {
  const rooms = state.rooms, M = state.M, V = state.V, live = state.liveFlags;

  let winner = -1, bestEnter = -1;
  let overlapWinner = -1, bestOverlap = 0;

  for (let i = 0; i < rooms.length; i++) {
    if (!live[i]) continue;

    // '>=' so a dead-even cross-dissolve resolves to the incoming room.
    const t = V[i * V_STRIDE + V_ENTER_T];
    if (t >= bestEnter) { bestEnter = t; winner = i; }

    const o = i * M_STRIDE;
    const top = M[o + M_TOP];
    const overlap = Math.min(top + M[o + M_HEIGHT], scrollY + M[o + M_STAGE_H]) -
                    Math.max(top, scrollY);
    if (overlap > bestOverlap) { bestOverlap = overlap; overlapWinner = i; }
  }

  if (bestEnter <= 0) winner = overlapWinner;   // never resolve to an all-black frame
  if (winner < 0) return;

  for (let i = 0; i < rooms.length; i++) {
    if (!live[i]) continue;
    const v = i * V_STRIDE;
    if (i === winner) {
      V[v + V_ENTER] = 1;
      // Bloom is normally gated by --enter; with enter forced to 1 the
      // consistent value is the ungated curve for this room's own progress.
      V[v + V_BLOOM] = easeOutQuint(clamp01(V[v + V_P] / 0.55));
    } else {
      V[v + V_ENTER] = 0;
      V[v + V_BLOOM] = 0;
    }
  }

  // Nothing is easing any more, so the loop is free to park.
  state.dissolveInFlight = false;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The two moments where ticking starts or stops.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * About to stop ticking (tab hidden, or booted hidden). Land on a coherent,
 * fully-presented room synchronously, before the compositor takes its last
 * snapshot of the page.
 */
function settleHidden() {
  cancelTween('cancelled');   // before the guards: a flight must never survive a hide
  if (state.reduceMotion || state.destroyed || !state.rooms.length) return;
  state.lastScrollY = -1;        // force a full recompute, not an early-out
  state.dirty = true;
  state.settles++;
  serviceFrame(nowMs(), FALLBACK_DT_CAP, true, true, true);
}

/**
 * Just became visible again. The page may have been hidden across a window
 * resize, a rotation, a font swap or a bfcache restore, so the cached geometry
 * is suspect — re-measure for real (not on the 150ms debounce) and then push a
 * full synchronous update BEFORE the next rAF, so the first frame the user sees
 * is already right. Waiting for rAF would show one stale frame; waiting for a
 * scroll event, as the old code effectively did, would show a stale page until
 * the user happened to touch it.
 */
function repairVisible() {
  if (state.destroyed || !state.rooms.length) return;

  state.lastFrameTime = 0;       // do not integrate the time the tab was hidden
  state.lastFallbackAt = 0;
  state.repairs++;

  measure();                     // full geometry re-measure, synchronous
  primeLiveNeighbourhood(window.scrollY || window.pageYOffset || 0);

  state.lastScrollY = -1;
  state.dirty = true;

  // snap: land exactly on this scroll position's values. resolve: NO — the tab
  // is on screen now, so the true cross-dissolve for where we are is the
  // correct picture, and it is what the very next rAF frame would compute.
  serviceFrame(nowMs(), 0, true, false, false);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Layer promotion — the hard cap on will-change.
 *
 * The gauntlet measured FOUR .plate-wrap elements carrying will-change at iPad
 * Pro portrait (1024x1366): rootMargin '100% 0px' genuinely keeps four rooms
 * intersecting at that aspect. Combined with ~300MB of composited layer memory
 * and dozens of >1MB layers, that is the precondition for iPad Safari tile
 * eviction — the exact stutter signature this engine exists to prevent.
 *
 * So promotion is decoupled from liveness. IO decides what gets COMPUTED (cheap
 * float math, and it needs the full viewport of lead time). This decides what
 * gets a COMPOSITOR LAYER: the two rooms nearest the viewport centre, never
 * more. Live-but-offscreen rooms get nothing — offscreen content is not
 * rastered, so a layer for it is pure cost.
 *
 * This function is the SINGLE OWNER of will-change for the whole page, across
 * all three animated layers of a room: .plate-wrap (transform), .plate-glow and
 * .plate-vig (opacity). theme.css deliberately declares none of them — a static
 * will-change rule cannot be scoped to the visible rooms, so it promoted all 16
 * light layers for the entire session (peak 18, 381MB, 47 layers over 1MB) and
 * did it under prefers-reduced-motion too, promoting sixteen layers to animate
 * nothing. Promotion is worth ~40% of frame time, so it stays — it just has to
 * be spent on the two rooms that can actually be seen. Budget: 3 x 2 = 6.
 *
 * Because rooms are 200vh runways, "nearest two by centre distance" flips at
 * each room's midpoint, which lands exactly right: during every cross-dissolve
 * the two rooms actually dissolving are the two that hold layers.
 *
 * Runs every frame, but it is two integer compares against the cached pair and
 * touches the DOM only when the pair changes — a handful of times per full-page
 * scroll. When the loop parks, the last pair keeps its layers on purpose:
 * re-promoting on scroll resume would throw away rasterised tiles for nothing.
 * ──────────────────────────────────────────────────────────────────────────── */

function setRoomPromotion(room, on) {
  // .plate-wrap animates transform; the glow and vignette animate opacity only.
  // Naming the right property matters — `will-change: transform` on a layer that
  // only ever changes opacity buys the cost of a layer without the benefit.
  room.wrap.style.willChange = on ? 'transform' : '';
  if (room.glow) room.glow.style.willChange = on ? 'opacity' : '';
  if (room.vig) room.vig.style.willChange = on ? 'opacity' : '';
}

function updatePromotions(scrollY) {
  const rooms = state.rooms;
  const M = state.M;

  // Nearest and second-nearest room centre to the viewport centre.
  let a = -1, b = -1, aDist = Infinity, bDist = Infinity;

  for (let i = 0; i < rooms.length; i++) {
    const o = i * M_STRIDE;
    const roomCentre = M[o + M_TOP] + M[o + M_HEIGHT] * 0.5;
    const viewCentre = scrollY + M[o + M_STAGE_H] * 0.5;
    const d = Math.abs(roomCentre - viewCentre);

    if (d < aDist)      { b = a; bDist = aDist; a = i; aDist = d; }
    else if (d < bDist) { b = i; bDist = d; }
  }

  if (a === state.promoA && b === state.promoB) return;  // steady state: no writes

  // Demote first, then promote, and skip any room that is in both the old and
  // new pair — churning will-change on a room that stayed selected would
  // discard and re-rasterise its tiles, which is the opposite of the point.
  const prevA = state.promoA, prevB = state.promoB;
  if (prevA >= 0 && prevA !== a && prevA !== b) setRoomPromotion(rooms[prevA], false);
  if (prevB >= 0 && prevB !== a && prevB !== b) setRoomPromotion(rooms[prevB], false);
  if (a >= 0 && a !== prevA && a !== prevB) setRoomPromotion(rooms[a], true);
  if (b >= 0 && b !== prevA && b !== prevB) setRoomPromotion(rooms[b], true);

  state.promoA = a;
  state.promoB = b;
}

/* ────────────────────────────────────────────────────────────────────────────
 * RESIDENCY — "the curtain".  Which rooms are allowed to PAINT at all.
 *
 * WHAT THIS IS FOR (unchanged, and it is not optional).
 * Every room carries, from theme.css and not from here:
 *
 *     .plate-wrap   translate3d(...) + backface-visibility: hidden
 *     .hotspots     translate3d(...)
 *     .stage        translate3d(0, -1 * --pin-lead, 0)
 *     .stage::before / ::after   an infinite transform/opacity animation
 *     .rail         promoted by overlap over the composited plate
 *
 * A 3D transform is an unconditional promotion, so without a curtain the page
 * runs with all eight rooms' layer stacks alive for the whole session, and —
 * because §05 pins every stage a full --pin-lead early — three of them are
 * piled on the same viewport rectangle at once. Measured on this build at
 * 393x852 DPR 3, curtain removed: 122 composited layers, 339 MB of
 * viewport-clipped backing store, on a phone whose whole tab budget is around
 * 200 MB. That is the blue screen. The curtain is load-bearing; it stays.
 *
 * ── WHAT WENT WRONG, AND WHY IT COULD NOT NOT GO WRONG ───────────────────
 * The first version of this decided residency from two things the engine
 * BELIEVES rather than two things the browser MEASURES:
 *
 *   · `liveFlags`, delivered asynchronously by an IntersectionObserver, and
 *   · `--enter`, a number this engine has to have written for the room already.
 *
 * Both are wrong at exactly the moment they matter most — the frame after a
 * jump. Reproduced at 393x852 DPR 3 by scrolling from y=0 to y=4087 in one
 * step (a menu tap, a fling, a restored scroll position): host, dining, prep
 * and office all intersect the viewport, none of them has had --enter written
 * yet, so theme.css resolves every one of them at its registered initial-value
 * of 1 — fully opaque, the documented no-JS rendering — and the curtain hid all
 * four. Coverage across thirteen sample rows of the viewport: zero. A flat
 * dark-navy screen, edge to edge, which is `body` with nothing painted over it.
 *
 * The failure was not "the cache drifted". It was the DIRECTION of the rule: a
 * room had to PROVE it was worth painting, and anything the engine had not got
 * round to yet failed that proof. A curtain must fail OPEN.
 *
 * ── THE RULE NOW ─────────────────────────────────────────────────────────
 * A room is hidden only when EVERY ONE of these is true:
 *
 *   1. A dedicated IntersectionObserver over the room's .stage — not the room,
 *      the stage, because the stage is what paints and what sticky pins — has
 *      REPORTED on that room at least once (`paintSeen`), and
 *   2. its most recent report was "outside a band one full viewport wider than
 *      the screen in both directions" (`paintNear === 0`), and
 *   3. it has been outside that band for DORMANT_DWELL_MS (`paintHold`), and
 *   4. it is not the active room or either of its neighbours, and not one of
 *      the promoted pair or either of THEIR neighbours, and
 *   5. the curtain is armed — i.e. no resize, rotation, visual-viewport change
 *      or re-measure has happened in the last CURTAIN_ARM_MS.
 *
 * Nothing in that list reads M. The one geometric input is the observer, which
 * the browser evaluates against the real rendered box in the same frame it
 * delivers, and which therefore cannot be stale, cannot be outrun by a fling,
 * and does not care whether iOS Safari's URL bar moved the visual viewport
 * without firing `resize`. Rules 4 and 5 are pure belt-and-braces on top.
 *
 * ── THE FOUR INVARIANTS, AND WHERE EACH ONE LIVES ────────────────────────
 *   I.   No stage that intersects the viewport is ever hidden.
 *        Enforced by (2): `paintNear` is 0 only for a stage the browser has
 *        placed HALF A VIEWPORT clear of the screen. A stage one pixel on
 *        screen reports isIntersecting, and the observer callback lifts its
 *        curtain synchronously, in that callback, not on the next rAF.
 *        Verified over ~11,000 sampled frames across eleven scroll scenarios,
 *        three profiles (plain, window.resize suppressed the way iOS suppresses
 *        it, and 4x CPU throttle): zero frames in which a stage intersecting
 *        the viewport was hidden, and zero in which one with a non-zero
 *        computed opacity was.
 *   II.  Fail open, never closed.
 *        `paintSeen === 0` (never observed) is resident. No observer at all is
 *        resident. Reduced motion is resident. Mid-resize is resident. The
 *        initial mask is "everything", and `curtainArmed` starts false.
 *   III. Re-measure on visualViewport resize AND scroll, debounced.
 *        See onVisualViewportChange() / onVisualViewportScroll() in the event
 *        wiring; both funnel through the same 150ms scheduleRemeasure(), and a
 *        change in the visual viewport's SIZE (which is what an iOS toolbar
 *        collapse is) additionally throws the curtain open for CURTAIN_ARM_MS.
 *   IV.  Never hide the room adjacent to the one being read.
 *        Rule (4). Two independent notions of "being read" — the active room by
 *        overlap, and the promoted pair by centre distance — each with a ±1
 *        skirt, so a fling that moves three rooms in one frame still cannot
 *        arrive at a hidden stage.
 *
 * WHAT IT COSTS, AND WHERE THE MEMORY WENT INSTEAD. Dropping the --enter test
 * means this rule can no longer retire a stage that is pinned on the viewport
 * but painting nothing, and §05 guarantees there is always one of those. That
 * saving is not lost, it MOVED: theme.css §06e now retires those layers from a
 * style container query on --paints, which is derived from the same --dissolve
 * §05 hands to the stage's opacity and therefore cannot disagree with it. See
 * the note there; between them the two halves are worth more than the single
 * unsafe rule was, per unit of risk.
 *
 * Measured at 393x852 DPR 3, peak over a full scroll, viewport-clipped backing
 * store at 4 bytes a device pixel:
 *
 *     no curtain at all ................... 122 layers / 339.0 MB
 *     this rule alone, no §06e query ....... 84 layers / 215.2 MB
 *     this rule + §06e's --paints query .... 69 layers / 180.7 MB   ← shipped
 *     the version that blanks the page ..... 48 layers / 142.2 MB
 *
 * So the fix costs 38.5 MB against the build that produced the client's blank
 * screenshot, and saves 158.3 MB against having no curtain — which is the
 * number that matters, because 339 MB on a phone with a ~200 MB tab budget is
 * the blue screen this whole section exists to prevent. 37.5 MB to make a blank
 * page structurally impossible is not a close call.
 *
 * THIS FUNCTION WRITES A CLASS AND NOTHING ELSE, ON EVERY BREAKPOINT — theme.css
 * §06e only consults it inside the phone query, and screens.js reads it to
 * ration live iframes (see its liveWanted(); that module is downstream of this
 * one being right, and needs no change now that it is).
 * ──────────────────────────────────────────────────────────────────────────── */

/** One full viewport of slack, both ways: a stage re-enters the paint set a
 *  whole screen before it can be seen, and only leaves the set a whole screen
 *  after it has gone.
 *
 *  IT IS SET WIDE ON PURPOSE, AND IT IS NEARLY FREE. On iOS the scroll offset
 *  is owned by the compositor, so the main thread finds out where the page IS
 *  some time after the user is already looking at it — a hard fling plus a
 *  100ms hitch is several hundred pixels of the engine simply not having been
 *  told yet. Every millisecond of that lag is a millisecond in which a curtain
 *  computed for the last known position is being applied to a screen showing a
 *  different one, and the only defence against that is slack.
 *
 *  Half a viewport was measured at 179.7 MB peak and a full viewport at 180.7,
 *  because §06e's --paints query already retires the layers of every pinned,
 *  transparent stage — so the rooms this margin adds are ones with no pixels on
 *  the screen, and a layer with nothing on the viewport costs nothing on the
 *  metric that matters. One megabyte for twice the lag budget. */
const PAINT_MARGIN = '100% 0px';

/** A stage must have been continuously outside that band for this long before
 *  the curtain may close on it. Absorbs a scrub back and forth over a boundary
 *  and any late observer delivery on a starved main thread. */
const DORMANT_DWELL_MS = 320;

/** After ANY geometry event — window resize, rotation, a visual-viewport size
 *  change, a re-measure — every room is visible for at least this long. An iOS
 *  URL-bar animation fires visualViewport 'resize' continuously for roughly
 *  300ms; this outlasts it, so the curtain simply stays open for the whole
 *  animation and closes again once the toolbar has settled. */
const CURTAIN_ARM_MS = 550;

/** How many rooms either side of the one being read are resident whatever the
 *  observer says. TWO, not one, for the compositor-lag reason in the note on
 *  PAINT_MARGIN: one room is about 1,090px at this profile, and a hard iOS
 *  fling can put that much between what the compositor is showing and what the
 *  main thread has been told. Two rooms is ~2,180px of runway, which no gesture
 *  covers inside one main-thread stall. It is also nearly free — the second
 *  room's stage is off the viewport, so its layers cost nothing clipped. */
const NEIGHBOUR_SKIRT = 2;

/** Every room resident. Used as the mask whenever the curtain is open. */
function allResidentMask() {
  const n = Math.min(state.rooms.length, 31);
  return n >= 31 ? 0x7fffffff : ((1 << n) - 1);
}

/**
 * The paint observer. This is the ONLY thing on the page allowed to say that a
 * room is not worth painting, and it says it about the real rendered box.
 *
 * It observes .stage rather than .room deliberately: a .room is a 220svh
 * runway that intersects the viewport for far longer than its stage is pinned
 * on it, so observing the room would keep every layer alive most of the time
 * and buy nothing. The stage is exactly the thing that paints.
 */
function setupPaintObserver() {
  if (typeof IntersectionObserver !== 'function') {
    // No observer ⇒ no evidence ⇒ no curtain, ever. Correct, just heavier.
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

    // OPENING IS IMMEDIATE AND SYNCHRONOUS. Not "set a flag and let the next
    // rAF frame deal with it" — that is a frame of blank, and on a page where
    // the loop may be parked it is an indefinite frame of blank.
    if (opened) applyResidency();
    // Closing waits out the dwell, and then only if nothing else has re-opened.
    if (closed) scheduleDwellCheck();
  }, { root: null, rootMargin: PAINT_MARGIN, threshold: 0 });

  state.byStage.clear();
  for (let i = 0; i < state.rooms.length; i++) {
    state.byStage.set(state.rooms[i].stage, i);
    state.paintIO.observe(state.rooms[i].stage);
  }
}

/**
 * Decide the resident set and write it. Cheap enough to call every frame; it
 * touches the DOM only when the mask actually changes.
 */
function applyResidency() {
  const rooms = state.rooms;
  if (!rooms.length || !state.paintNear) return;

  // Reduced motion renders every room static, lit and correct. Nothing may be
  // hidden, and the loop that would lift a curtain never runs.
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
    // v29 BELT AND BRACES, now that the curtain is on every breakpoint
    // (theme.css §06e): the stage of a room with top T, height H and stage
    // height S is on the viewport for scrollY in (T - 2S, T + H + S) — §05 pins
    // it a --pin-lead early and releases it a --pin-lead late. Widened by one
    // more S each way, that span keeps a room resident whatever the observer
    // says. Additive only: it can keep a room painted, never hide one. The
    // cache it reads can be stale, which is exactly why it is not the rule —
    // it is the floor under the rule.
    const o = i * M_STRIDE;
    const S = M ? M[o + M_STAGE_H] : 0;
    const T = M ? M[o + M_TOP] : 0;
    const geomNear = !M || S <= 0 ||
      (y > T - 3 * S && y < T + M[o + M_HEIGHT] + 2 * S);
    const resident =
      geomNear ||
      state.paintSeen[i] === 0 ||                       // never observed: unknown ⇒ visible
      state.paintNear[i] === 1 ||                       // the browser says it is in band
      now < state.paintHold[i] ||                       // still inside its dwell
      (a >= 0 && i >= a - NEIGHBOUR_SKIRT && i <= a + NEIGHBOUR_SKIRT) ||
      i === pa || i === pb;
    if (resident) mask |= (1 << i);
  }

  writeResidency(mask);
}

/** The single writer of `is-dormant`. Only the rooms that actually flipped are
 *  touched, so a steady mask costs nothing and a change costs one or two
 *  classList calls. */
function writeResidency(mask) {
  const prev = state.residentMask;
  if (mask === prev) return;
  state.residentMask = mask;
  for (let i = 0; i < state.rooms.length && i < 31; i++) {
    const now = (mask >> i) & 1;
    if (prev >= 0 && ((prev >> i) & 1) === now) continue;
    try { state.rooms[i].el.classList.toggle('is-dormant', now === 0); }
    catch (_) { /* noop */ }
  }
}

/** Called from serviceFrame. Named for its old call site; the work is all in
 *  applyResidency() so that the observer can call the same code path. */
function updateResidency() {
  applyResidency();
}

/** A room left the band. Re-check once its dwell has expired — the rAF loop may
 *  well have parked by then, so this cannot be left to the next frame. */
function scheduleDwellCheck() {
  if (state.dwellTimer || state.destroyed) return;
  state.dwellTimer = setTimeout(() => {
    state.dwellTimer = 0;
    if (state.destroyed) return;
    applyResidency();
  }, DORMANT_DWELL_MS + 20);
}

/**
 * THROW THE CURTAIN OPEN, NOW, and keep it open until things have settled.
 *
 * Called from every event that can change what is on screen without the engine
 * being able to trust anything it has cached: window resize, orientation
 * change, pageshow, a visual-viewport SIZE change (an iOS URL bar collapsing or
 * expanding), and every re-measure. The re-arm is a timeout, so a toolbar
 * animation firing thirty resize events in 300ms leaves the curtain open for
 * the whole animation and arms it once, afterwards.
 */
function openCurtain() {
  state.curtainArmed = false;
  clearTimeout(state.curtainTimer);
  state.curtainTimer = 0;
  writeResidency(allResidentMask());
  forgetPaintReports();
}

/** Minimum gap between two forced re-observations. A hard fling fires a jump on
 *  every scroll event; without this that would be sixteen observer calls per
 *  frame for no new information. */
const PAINT_REFRESH_MS = 120;

/**
 * THROW AWAY WHAT THE OBSERVER TOLD US, AND MAKE IT SAY IT AGAIN.
 *
 * An IntersectionObserver only reports CHANGES, and it reports nothing at all
 * while the page is not being rendered — a backgrounded tab, an app the user
 * has swiped away from, a bfcache'd document. So after any such gap its last
 * word about a room can be arbitrarily old, and "arbitrarily old" was still
 * good enough to hide a room with, because `paintSeen` only ever asked whether
 * it had EVER spoken. Measured once in 390 frames of hide-at-depth / show:
 * `room-office`, --enter never written and therefore fully opaque, intersecting
 * the viewport, `is-dormant`.
 *
 * Clearing paintSeen alone would deadlock the curtain open — with no change to
 * report the observer would never speak again. Re-observing is what forces it
 * to: a fresh observe() delivers an initial entry for its target on the next
 * rendering opportunity, so within one frame every room has a report that
 * post-dates whatever happened, and the curtain can arm again on evidence
 * rather than on memory.
 */
function forgetPaintReports() {
  if (!state.paintIO || state.destroyed) return;
  const now = nowMs();
  if (now - state.lastPaintRefresh < PAINT_REFRESH_MS) return;
  state.lastPaintRefresh = now;

  for (let i = 0; i < state.rooms.length; i++) state.paintSeen[i] = 0;
  for (const r of state.rooms) {
    try { state.paintIO.unobserve(r.stage); state.paintIO.observe(r.stage); }
    catch (_) { /* noop */ }
  }
}

function armCurtain() {
  if (state.destroyed || state.reduceMotion) return;
  clearTimeout(state.curtainTimer);
  state.curtainTimer = setTimeout(() => {
    state.curtainTimer = 0;
    if (state.destroyed || state.reduceMotion) return;
    if (!state.paintIO) return;                 // no observer ⇒ the curtain never closes

    // Every room must have been reported on at least once. Until then we do not
    // know enough to hide anything, so wait another interval rather than guess.
    for (let i = 0; i < state.rooms.length; i++) {
      if (!state.paintSeen[i]) { armCurtain(); return; }
    }

    state.curtainArmed = true;
    applyResidency();
  }, CURTAIN_ARM_MS);
}

/** Draw every curtain back and leave it back. Used by reduced motion (where the
 *  loop never runs, so residency would never be recomputed), by teardown, and
 *  as the fail-open state everywhere else. */
function clearResidency() {
  state.curtainArmed = false;
  clearTimeout(state.curtainTimer);
  clearTimeout(state.dwellTimer);
  state.curtainTimer = 0;
  state.dwellTimer = 0;
  if (state.rooms.length) writeResidency(allResidentMask());
  state.residentMask = -1;
  for (const r of state.rooms) {
    try { r.el.classList.remove('is-dormant'); } catch (_) { /* noop */ }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Active-room tracking → onRoomChange.
 * Pure arithmetic over cached geometry; the top menu gets its highlight for free.
 * ──────────────────────────────────────────────────────────────────────────── */

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
    // A throwing menu callback must never be able to kill the animation loop.
    try { cb(payload); }
    catch (err) { console.error('[engine] onRoomChange callback threw:', err); }
  }

  scheduleOwnership(first);
  placeTicketIndicator(tix.lead || room.name, first);
}

/* ────────────────────────────────────────────────────────────────────────────
 * M4 · THE SLIDING TICKET (v29, design audit §5.4).
 *
 * One `.ticket-ind` pill inside the course menu's strip, moved with transform
 * only when the room changes (theme.css §11 has the look). The positions are
 * read from layout in measureTickets() — which runs from measure() and from a
 * ResizeObserver on the strip, never from the frame loop — so moving the pill
 * in the frame that changes rooms costs no layout. If the strip is not there
 * (the phone list, a failed boot) this is inert, and the menu keeps its old
 * per-ticket gold ground.
 *
 * v29 fix round (G3 M-2) · THE TYPE ON THE PILL IS NEVER BONE ON GOLD. The
 * label used to turn dark 360 ms after the pill set off (a delayed colour
 * swap), so for most of every move — and for all of a cut, and indefinitely on
 * a device that dropped the frames the delayed transition needed to start —
 * the pill carried bone type or slid under it. Now no real label ever changes
 * colour. `.ticket-ink` is a dark copy of every label on its own gold ground,
 * laid over the strip and clipped to exactly the pill's rectangle, so type is
 * dark wherever the gold is and bone everywhere else, at every instant of the
 * slide. The clip is two nested overflow boxes that each translate by one
 * edge of the pill (left, then right) with the copy counter-translated inside
 * them — translations only, each linear in the same eased progress as the
 * pill's own translate/scale, so the four transform transitions (pill, left
 * edge, right edge, copy) stay locked together on the compositor with no
 * main-thread work during the slide. The copy is positioned and typeset from
 * the real labels' measured boxes and computed fonts (at measure time), so it
 * follows every breakpoint's ticket styling without restating any of it.
 *
 * AND THE PILL LEADS. A menu jump moves the pill at the click (tix.lead), not
 * when the page arrives, so the menu answers in the frame the rep taps — the
 * tween or the cut then brings the room to it. aria-current still follows the
 * room (cinema.js's onRoomChange), which is what a screen reader should hear.
 * ──────────────────────────────────────────────────────────────────────────── */

const tix = { nav: null, ind: null, pos: null, current: '', ro: null,
  ink: null, inkL: null, inkR: null, inkC: null, inkW: 0, lead: '' };

function mountTicketIndicator() {
  let nav = null;
  try { nav = document.querySelector('#ticket-rail .tickets'); } catch (_) { /* noop */ }
  if (!nav) return false;
  if (tix.nav === nav && tix.ind && tix.ind.isConnected && tix.ink && tix.ink.isConnected) return true;
  if (tix.ind) { try { tix.ind.remove(); } catch (_) { /* noop */ } }
  if (tix.ink) { try { tix.ink.remove(); } catch (_) { /* noop */ } }
  const ind = document.createElement('span');
  ind.className = 'ticket-ind is-snap';
  ind.setAttribute('aria-hidden', 'true');
  nav.insertBefore(ind, nav.firstChild);
  // The ink layer: clipper (sized to the strip's content, so it adds no
  // scrollable overflow) > left edge > right edge > the dark copy.
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
  if (tix.ro) { try { tix.ro.disconnect(); } catch (_) { /* noop */ } }
  if (typeof ResizeObserver === 'function') {
    // Fires after layout, before paint: the one place outside measure() where
    // reading offsets is free. Catches a font swap, a rotated strip, or the
    // top bar gaining a control after we measured.
    tix.ro = new ResizeObserver(() => measureTickets());
    try {
      tix.ro.observe(nav);
      for (const t of nav.querySelectorAll('.ticket')) tix.ro.observe(t);
    } catch (_) { /* noop */ }
  }
  return true;
}

/** The typography of a label, copied onto its dark twin (measure time only). */
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
    // the dark twin of each visible label, at the label's own box and font
    for (const part of t.children) {
      const pr = part.getBoundingClientRect();
      if (!pr.width || !pr.height) continue;   // e.g. a numeral hidden at this width
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
    // The strip's edge fade is for a strip that overflows; over one that fits
    // it only smudged the first and last tickets (G3 nit, theme.css §11).
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
  // A first placement, a re-measure or a pill that was hidden jumps; only a
  // room change on a visible pill slides.
  const jump = snap || state.reduceMotion || !ind.classList.contains('is-on');
  ind.classList.toggle('is-snap', jump);
  const x = r[0], y = r[1], w = r[2], h = r[3];
  ind.style.transform =
    `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${(w / 100).toFixed(4)}, ${(h / 40).toFixed(4)})`;
  ind.classList.add('is-on');
  if (ink && tix.inkL) {
    // left edge at x; right edge at x + w; the copy back at the strip's origin
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

/** The pill's room: the one a menu jump is heading for, else the active one. */
function ticketRoomName() {
  if (tix.lead) return tix.lead;
  const a = state.activeIndex;
  return a >= 0 && state.rooms[a] ? state.rooms[a].name : '';
}

/** A menu jump starts: the pill sets off for `name` now (see the note above). */
function leadTicket(name) {
  // Only a room with a ticket leads (the brand's jump to the hero does not:
  // with no pill the old ticket would fall back to its static gold ground).
  if (!name || !tix.pos || !tix.pos.has(name)) { if (tix.lead) releaseTicket(); return; }
  tix.lead = name;
  placeTicketIndicator(tix.lead, false);
}

/** A menu jump is over (arrived, interrupted or superseded). */
function releaseTicket() {
  if (!tix.lead) return;
  tix.lead = '';
  placeTicketIndicator(ticketRoomName(), false);
}

/* ────────────────────────────────────────────────────────────────────────────
 * C2 · OWNERSHIP — `.is-owned` + `ccc:room-owned` (v29).
 *
 * Exactly one `.room` carries `.is-owned` once the page has settled: the room
 * whose --cut is open, i.e. the one whose chips and objects are live (see
 * ownerCandidate(); the ticket rail still lights the most-overlapping room,
 * which changes hands later). It follows a change after OWN_DWELL_MS, so a
 * fling or a tween through four rooms does not hand the class to each one in
 * turn: screens.js keys live boards on it and the phase-2 arrival choreography
 * keys on it, and neither wants to start for a room that is only being passed.
 * During an M4 cut NO room owns the page; the target takes it on arrival.
 * `.is-dormant` (the curtain) is untouched and independent.
 *
 * The event is `document`-level `ccc:room-owned`, detail { id, elId, index,
 * el }, where `id` is the room's data-room name ('pass', 'office', …).
 * ──────────────────────────────────────────────────────────────────────────── */

const OWN_DWELL_MS = 140;

/* v29 integrate · THE OWNER IS THE ROOM WHOSE --cut IS OPEN.
 * "Most viewport overlap" (activeIndex, the ticket rail's rule) changes hands
 * a long way after the picture does: measured at 1440x900, the Host Stand was
 * fully opaque with its chips and objects live (--cut 1) for ~570 px of scroll
 * while the Pass still owned the page — and screens.js keys its power-on and
 * its boards on .is-owned, so the Host TV sat black through the whole arrival.
 * theme.css §05's --cut is the page's own answer to "who owns the affordances"
 * (roomOwnsPage() reads it too); this is the same arithmetic over the values
 * this frame just wrote — --cut rounds to >= 0.1 once enter passes
 * 0.578 + 0.05/34 and p stays under --cut-z - 0.05/--cut-k (the last room has
 * no exit half). Only the active room and its neighbours are considered, and
 * only live ones (a dormant room's values are frozen). In the ~30 px gap where
 * neither room's --cut is open, the previous candidate holds. Reduced motion
 * pins every room open, so there it is activeIndex, as before. */
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
  // The dwell is for rooms a fling passes through. The room a menu jump is
  // heading for is not being passed: it takes the page as soon as its --cut
  // opens, so its arrival overlaps the end of the dissolve (G3 M-5).
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
    try { rooms[prev].el.classList.remove('is-owned'); } catch (_) { /* noop */ }
  }
  if (i < 0 || !rooms[i]) return;
  const room = rooms[i];
  try { room.el.classList.add('is-owned'); } catch (_) { /* noop */ }
  scheduleOffstageCheck();
  try {
    document.dispatchEvent(new CustomEvent('ccc:room-owned', {
      detail: { id: room.name, elId: room.id, index: i, el: room.el }
    }));
  } catch (_) { /* CustomEvent unavailable: the class alone still carries it */ }
}

/* ────────────────────────────────────────────────────────────────────────────
 * C3 · FIRST FRAME — `ccc:first-frame` (v29).
 *
 * Dispatched once, after the engine's first real frame has been painted, so
 * index.html's static curtain (S5) can lift onto a page that is already the
 * right picture. "Painted" means: the frame that wrote the vars has gone to
 * the screen (the next animation frame), AND the plate of the room on screen
 * has decoded — lifting a curtain onto an undecoded plate would swap a picture
 * for a black stage. The decode wait is capped: S5's curtain has its own
 * safety timeout, and this one must never be the reason a page stays covered.
 * ──────────────────────────────────────────────────────────────────────────── */

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
  } catch (_) { /* noop */ }
  decoded.then(() => {
    const send = () => {
      if (state.firstFrameSent) return;
      state.firstFrameSent = true;
      try { document.dispatchEvent(new Event('ccc:first-frame')); } catch (_) { /* noop */ }
    };
    // One more frame: the one that wrote the vars must have been presented.
    if (typeof requestAnimationFrame === 'function' && !isHidden()) {
      requestAnimationFrame(() => setTimeout(send, 0));
    } else {
      send();
    }
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * C1 · THE TOOL VIEWER — park, ignore the lock's jump, one sync after (v29).
 *
 * overlay.js locks background scroll with body{position:fixed; top:-scrollY},
 * which collapses the document and clamps scrollY to 0, and then puts it back.
 * The engine used to read both as jumps: open the curtain, forget and
 * re-observe every stage (8 unobserve/observe pairs, which screens.js's
 * observer turns into a reconcile() with forced layout), snap-compute the rooms
 * for scrollY 0 behind an opaque viewer, and do it all again on the way out
 * (audit/perf.md §3.7). Nothing behind the viewer can be seen, so the engine
 * simply stops: while html.is-viewing (S1 holds it for the viewer's whole life)
 * or the lock class is on, scroll events are ignored, the loop is parked and
 * no frame is requested. When both are gone, one pass runs at the restored
 * position — normally a no-op, because the unlock puts scrollY back to the
 * pixel the engine last computed.
 *
 * Driven by the classes rather than by the events, so a missed event cannot
 * strand the engine parked: the events only prompt a re-check.
 * ──────────────────────────────────────────────────────────────────────────── */

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
  // A measurement owed from inside the lock (a resize under the viewer) is
  // taken now that the rooms are back in the flow.
  retryDeferredMeasure();
  if (state.viewSyncOwed) {
    state.viewSyncOwed = false;
    state.dirty = true;
  }
  state.lastFrameTime = 0;   // do not integrate the time the viewer was up
  wake();
}

/* ────────────────────────────────────────────────────────────────────────────
 * prefers-reduced-motion.
 *
 * Reduce → write the static end-state once and never start the loop at all.
 * Not "start the loop and make it do nothing" — never start it.
 * ──────────────────────────────────────────────────────────────────────────── */

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
    // Promote nothing: the loop never runs, so there is nothing to promote for.
    // The static rule this replaced promoted sixteen layers to animate nothing.
    setRoomPromotion(r, false);
    state.promoA = -1;
    state.promoB = -1;

    // Keep the write-cache in sync so a later motion-allowed switch does not
    // skip writes it thinks are already applied.
    const w = i * W_STRIDE;
    state.W[w + 0] = 0;
    state.W[w + 1] = 1;
    state.W[w + 2] = 0;
    state.W[w + 3] = 0;
    state.W[w + 4] = 1;
    state.W[w + 5] = 1;
    state.W[w + 6] = 0;
  }

  // Reduced motion means the loop never runs, so updateResidency() would never
  // be called again to lift a curtain. Every room is static, correct and
  // visible; none of them may be hidden.
  clearResidency();

  // The menu still needs to know where we are.
  updateActiveRoom(window.scrollY || 0);
}

/* ────────────────────────────────────────────────────────────────────────────
 * scrollToRoom — our own rAF tween.
 *
 * CSS `scroll-behavior: smooth` is banned: the browser's own smooth scroll runs
 * on a separate timeline we cannot cancel or read, and in v2 it fought this
 * engine's scroll handling and left the menu in a wedged state. A hand-rolled
 * tween is cancellable, inspectable and stops dead the instant a human touches
 * the wheel, the trackpad, the screen or the keyboard.
 *
 * The tween is stepped from the SHARED loop (see tick()), so requirement 1 —
 * exactly one rAF for the whole page — still holds.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Input events that mean "the user may have taken over". */
const TAKEOVER_EVENTS = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'mousedown', 'keydown'];

/** Keys that actually scroll. Tabbing or typing must not kill a jump. */
const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar', 'Escape'];

function cancelTween(reason) {
  const t = state.tween;
  if (!t) return;
  state.tween = null;
  for (const type of TAKEOVER_EVENTS) {
    window.removeEventListener(type, onTakeover, { capture: true });
  }
  // A superseding jump sets its own lead right after this; anything else —
  // arrived, interrupted by a hand on the page — hands the pill back to the
  // room the page is actually in.
  const superseded = reason === 'superseded';
  if (!superseded && !state.cutting) releaseTicket();
  if (t.resolve) t.resolve(superseded ? 'cancelled' : (reason || 'cancelled'));
}

/* ── Takeover detection ──────────────────────────────────────────────────────
 *
 * The v2 regression, reproduced 4/4 by the gauntlet: click a menu item while
 * trackpad momentum is still arriving, and the jump was cancelled by the very
 * first inertial wheel event — stranding the page thousands of pixels short with
 * aria-current stuck on the wrong room. Trackpad inertia runs ~1s past the
 * finger lift, so "zero wheel events after the click" is the unrealistic case.
 *
 * The question is not "did an input event arrive" but "is a HUMAN driving right
 * now". That splits the events into two classes with two different tests:
 *
 *   Discrete events — touchstart, touchmove, pointerdown, mousedown, nav keys.
 *     A finger landing on the glass or a key going down cannot be inertia:
 *     momentum scrolling fires no touch, pointer or key events on any platform.
 *     These cancel INSTANTLY, at any point in the flight, grace window included.
 *     That is what keeps a deliberate override feeling immediate.
 *
 *   Wheel events — the only ambiguous class. Inertia and a fresh two-finger push
 *     produce byte-identical events, and magnitude cannot separate them because
 *     inertia is LOUDEST immediately after the lift, which is exactly when the
 *     click lands. The one property inertia always has is that it only ever
 *     DECAYS. So we track a leaky energy envelope with a slower-decaying
 *     peak-hold and cancel when the incoming stream climbs back ABOVE its own
 *     envelope — something a decaying tail cannot do, and a hand returning to
 *     the trackpad does within one or two events (~30ms). The envelope decays on
 *     a slower time-constant than any real momentum tail, so the gap between the
 *     two only ever widens — that is what makes the guarantee hold for the full
 *     ~1s of inertia rather than just the first few frames. WHEEL_ENV_TAU was
 *     chosen by sweeping 126 synthetic momentum profiles (peak 40-450px, decay
 *     0.90-0.99 per event, 8/16/33ms cadences): 1600ms is the smallest value that
 *     false-cancels on none of them while still admitting a real push in under
 *     four events.
 *
 * Deliberately NOT used: a direction test ("cancel if the wheel opposes the
 * tween"). It is unsound here — whether the leftover inertia opposes the tween
 * depends only on whether the user clicked a room above or below where they were
 * scrolling, so an opposing sign is just as likely to be inertia as intent. It
 * would have swapped this bug for the same bug on upward jumps.
 */

/** Normalise a wheel event to pixels, whatever deltaMode it reports in. */
function wheelDeltaPx(e) {
  const raw = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  if (e.deltaMode === 1) return raw * 16;                          // lines
  if (e.deltaMode === 2) return raw * (window.innerHeight || 800);  // pages
  return raw;                                                      // pixels
}

function onTakeover(e) {
  const t = state.tween;
  if (!t) return;

  if (e.type === 'wheel') { onTakeoverWheel(e, t); return; }

  if (e.type === 'keydown' && !NAV_KEYS.includes(e.key)) return;

  // Discrete, unambiguous human input — stop dead.
  cancelTween('interrupted');
  wake();
}

function onTakeoverWheel(e, t) {
  const now = nowMs();
  const d = Math.abs(wheelDeltaPx(e));
  const gap = now - t.lastWheelAt;

  // Silence long enough to end the stream means the gesture AND its inertia are
  // over. Drop the envelope so the next wheel event is judged on its own merits.
  if (gap > WHEEL_STREAM_GAP_MS) {
    t.wheelEnv = 0;
    t.risingRun = 0;
    t.streamStart = now;
  }
  t.lastWheelAt = now;

  // The envelope decays on a time-constant deliberately chosen to be SLOWER than
  // any plausible momentum tail. Two geometric decays, ours the slower: a real
  // inertia stream therefore slides further beneath the envelope every event and
  // can never climb back through it, no matter how long it runs.
  t.wheelEnv *= Math.exp(-Math.min(gap, 2000) / WHEEL_ENV_TAU);

  // Was this stream already running when the jump started? Inertia is continuous
  // with the gesture that preceded the click, so its first event lands within a
  // frame or two of t.start. A stream that begins later cannot be that inertia.
  const inherited = (t.streamStart - t.start) <= STREAM_NEW_MS;

  if (inherited && (now - t.start) < TAKEOVER_GRACE_MS) {
    // Priming. This is the only window in which the envelope is allowed to rise,
    // and the only window in which a wheel event can never cancel. Its sole job
    // is to record how loud the inherited stream was, so the rest of the flight
    // has something to measure against. Letting the envelope rise later would be
    // self-defeating: it would chase a sustained push upward and never be beaten.
    t.wheelEnv = Math.max(t.wheelEnv, d);
    t.risingRun = 0;
    return;
  }

  // With no envelope standing there is no inertia to be confused with, so one
  // event above the noise floor is enough — that is a mouse wheel notch, or a
  // gesture that began after a pause, and both are unambiguous intent. While an
  // envelope IS standing, require a short run so a single jittery momentum
  // sample cannot masquerade as a push.
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

/* ── v29 fix round (G3 M-5) · THE NEXT-ROOM JUMP DISSOLVES, IT DOES NOT STALL ──
 * The tween used to ease the whole distance on one easeInOutCubic. Between two
 * adjacent rooms the visible hand-over (the incoming stage going 0 → 1) is only
 * ~35svh of a ~162svh trip, and it sits at the END of the path — so a click
 * bought ~450 ms of near-still push-in, then the entire dissolve in ~100 ms,
 * then a bare room. Measured by the gauntlet on a quiet runner: nothing on
 * screen for ~0.6 s after the click, then a snap.
 *
 * Now the path is cut where the picture changes, and each piece gets the time
 * it is worth:
 *   · RUNWAY — the part of the outgoing room still ahead of the hand-over (its
 *     push-in and lights). Continuous but quick: JUMP_RUN_SVH_PER_MS, capped.
 *   · BAND — the dissolve, parameterised by the incoming stage's actual
 *     opacity (§05's --dissolve, inverted through the engine's easeOutQuint),
 *     so equal time buys equal fade: JUMP_BAND_MS for a whole one.
 *   · TAIL — the incoming room already opaque and pinned at p 0, nothing
 *     visible changes: a few frames, below the jump detector's half-viewport.
 * Runway + band share ONE ease-out over their combined time, so the camera
 * moves in the first frame, never stops between them and lands softly;
 * downward it is runway → band → tail, upward the mirror (tail → band →
 * runway). The menu pill has already moved at the click (leadTicket), and the
 * target takes the page the moment its --cut opens rather than after the
 * ownership dwell (updateOwnerCandidate), so its arrival plays under the end
 * of the dissolve instead of after a bare room. */
const JUMP_BAND_MS = 420;          // a whole dissolve, 0 → 1
const JUMP_TAIL_MS = 80;           // the invisible remainder (≤ ~12svh a frame)
const JUMP_RUN_SVH_PER_MS = 0.6;   // runway speed: ~67svh (a room's approach) in ~110 ms
const JUMP_RUN_MIN_MS = 60;
const JUMP_RUN_MAX_MS = 180;

/** §05: the incoming stage's opacity for a raw enter progress u. */
function bandOpacity(u) {
  return clamp01((easeOutQuint(clamp01(u)) - 0.22) * 1.43);
}
/** …and back: the raw progress at which that opacity is reached. */
function bandProgress(d) {
  const e = Math.min(0.999999, clamp01(d) / 1.43 + 0.22);
  return 1 - Math.pow(1 - e, 1 / 5);
}

/**
 * The time-remapped path between two ADJACENT rooms (see above), or null when
 * the geometry is not the ordinary two-rooms-overlapping case (then the caller
 * keeps the plain tween). Returns { dur, path(k) → scrollY }.
 */
function adjacentJumpPath(a, i, from, to) {
  const M = state.M;
  if (!M || a < 0 || Math.abs(i - a) !== 1) return null;
  const hi = Math.max(a, i);
  const topHi = M[hi * M_STRIDE + M_TOP];
  const sH = M[hi * M_STRIDE + M_STAGE_H];
  if (!(sH > 0)) return null;
  const at = (u) => topHi - sH + u * sH;           // scrollY at incoming progress u
  const uOf = (y) => (y - (topHi - sH)) / sH;
  const b0 = at(bandProgress(0));
  const b1 = at(bandProgress(1));
  const down = to > from;
  const runMs = (len) => Math.max(JUMP_RUN_MIN_MS,
    Math.min(JUMP_RUN_MAX_MS, Math.abs(len) / (JUMP_RUN_SVH_PER_MS * sH / 100)));

  // pieces in travel order: { kind, y0, y1, ms }
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
  // the eased group: every run/band piece; tails stay linear at their end
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
      // one easing across the group, then located piece by piece
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

/* ── v29 fix round (G2 M1) · A KEYBOARD JUMP LANDS FOCUS IN THE ROOM ─────────
 * After Enter on a course-menu ticket, focus used to stay in the menu: seven
 * Tabs from "01 PASS" to the 6th Gen chip. Now a keyboard-initiated jump (and
 * only that — a mouse or a tap never moves focus) puts focus on the landed
 * room's title (made programmatically focusable, tabindex -1), so the next Tab
 * is the room's first control and a screen reader announces where it is. */
function onMenuClickCapture(ev) {
  const t = ev.target;
  if (!t || typeof t.closest !== 'function') return;
  const link = t.closest('#ticket-rail [data-goto]');
  // detail 0 alone is also every scripted .click(); a real keyboard
  // activation has an Enter / Space keydown right before it.
  const kbd = !!link && ev.detail === 0 && nowMs() - (state.menuKeyAt || -1e9) < 600;
  state.kbdJumpAt = kbd ? nowMs() : 0;
}

function onMenuKeyCapture(ev) {
  if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') state.menuKeyAt = nowMs();
  // Keyboard mode (theme.css §06e's curtain): the first Tab lifts the curtain
  // off the non-painting neighbours' rails and objects so the walk visits
  // them in order; the next pointer or touch puts the saving back.
  if (ev.key === 'Tab' && !state.kbdMode) {
    state.kbdMode = true;
    try { document.documentElement.classList.add('ccc-kbd'); } catch (_) { /* noop */ }
  }
}

function onPointerModeCapture() {
  if (!state.kbdMode) return;
  state.kbdMode = false;
  try { document.documentElement.classList.remove('ccc-kbd'); } catch (_) { /* noop */ }
}

function focusRoomHeading(i) {
  const room = state.rooms[i];
  if (!room || state.viewing || state.destroyed) return;
  const h = room.el.querySelector('.rail-title') || room.el.querySelector('h2, h1');
  if (!h) return;
  // Only if focus is still where the jump left it (the menu, or nowhere): a
  // rep who has already Tabbed on, or opened something, keeps their place.
  const a = document.activeElement;
  if (a && a !== document.body && !(a.closest && a.closest('#ticket-rail'))) return;
  if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  try { h.focus({ preventScroll: true }); } catch (_) { /* noop */ }
}

/**
 * Animate the window to a room's start.
 *
 * @param {string|Element} target  room name ('pass'), element id ('room-pass'),
 *                                 or the `.room` element itself.
 * @param {object}   [opts]
 * @param {number}   [opts.offset=0]    px to stop short (e.g. a fixed header).
 * @param {number}   [opts.duration]    override the distance-derived duration.
 * @param {boolean}  [opts.cut]         false: never the M4 dip, always the tween.
 * @param {boolean}  [opts.instant]     land in one step: no dip, no tween.
 * @returns {Promise<'done'|'interrupted'|'cancelled'|'unknown-room'|'reduced-motion'|'instant'>}
 */
export function scrollToRoom(target, opts) {
  const options = opts || {};
  const i = resolveRoomIndex(target);

  if (i === -1) {
    console.warn('[engine] scrollToRoom: unknown room', target);
    return Promise.resolve('unknown-room');
  }

  // A keyboard-activated menu click in this same dispatch (see above).
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

  // Any in-flight jump is superseded.
  cancelTween('superseded');

  const maxY = Math.max(0, document.documentElement.scrollHeight - (window.innerHeight || 0));
  const to = Math.max(0, Math.min(maxY, state.M[i * M_STRIDE + M_TOP] - (options.offset || 0)));
  const from = window.scrollY || window.pageYOffset || 0;

  // Reduced motion: teleport. An unrequested 900ms animation is exactly what the
  // user asked the OS to stop doing.
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

  // opts.instant (cinema.js's cold / hashchange `#room-` links): land in one
  // step — no M4 dip, no tween — with the same treatment a keyboard jump gets
  // (bringRoomToReadingPosition): curtain open, a snapped frame before paint.
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

  // M4 · the cut. Two rooms or more (lite tier: any jump) dips to black and
  // lands instead of scrubbing through every room in between. Adjacent rooms
  // keep the tween below, which reads as a dolly. opts.cut === false opts out.
  const hops = state.activeIndex >= 0 ? Math.abs(i - state.activeIndex) : 2;
  leadTicket(state.rooms[i] && state.rooms[i].name);
  if (state.cutting ||
      (options.cut !== false && options.duration == null &&
       (hops >= 2 || state.motion === 'lite'))) {
    return cutToRoom(i, to);
  }

  // An adjacent room: the dissolve-shaped path (G3 M-5). A caller-supplied
  // duration, or geometry that is not two rooms overlapping, keeps the plain
  // distance-timed tween.
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
      // Wheel-takeover envelope. lastWheelAt/streamStart start at 0 so a first
      // wheel event always reads as "new stream" until one actually arrives.
      wheelEnv: 0,
      risingRun: 0,
      lastWheelAt: 0,
      streamStart: 0,
    };
    // Capture-phase + passive: we only observe, we never preventDefault, so we
    // cannot interfere with the user's own scrolling.
    for (const type of TAKEOVER_EVENTS) {
      window.addEventListener(type, onTakeover, { capture: true, passive: true });
    }
    wake();
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * M4 · THE CUT (v29, design audit §5.4).
 *
 * Office → Pass used to be an 1100ms scrub through Prep, Dining and Host:
 * three dissolves, three plate decodes and three layer stacks on the heaviest
 * path in the site, reading as fast-forward rather than a cut (P1-5). Now:
 *
 *   1. a fixed ink layer (#ccc-cut, theme.css §11, below the top bar so the
 *      course menu stays up) fades in over --m-t-2 on --m-ease-in;
 *   2. the page jumps — instantly, under the black — and lands one coherent
 *      frame for the new position, with the curtain thrown open exactly as any
 *      jump does;
 *   3. the target room's plate is given up to CUT_DECODE_CAP_MS to decode;
 *   4. the layer fades out over --m-t-4 on --m-ease-out.
 * No room owns the page during the cut (C2); the target takes ownership on the
 * way out, which is what starts its arrival choreography. Lite: 120 / 240ms.
 * The layer's opacity is a Web Animation, i.e. compositor-driven, and the
 * layer is removed from the tree between cuts. A second jump during a cut
 * simply retargets it.
 * ──────────────────────────────────────────────────────────────────────────── */

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
    // one animation at a time on the layer: a retargeted or re-used cut must
    // not stack forwards-filled opacities from an earlier one
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
    setTimeout(finish, ms + 120);   // a throttled timeline must not strand the cut
  });
}

function cutToRoom(i, to) {
  const seq = ++cutSeq;
  const lite = state.motion === 'lite';
  // v29 fix round (G3 M-5): 120 / 280 ms at full (was 160 / 360) — the dip is
  // a cut, not a scene change; lite keeps its 120 / 240.
  const inMs = 120;
  const outMs = lite ? 240 : 280;
  const el = cutLayer();
  const wasCutting = state.cutting;
  state.cutting = true;
  clearTimeout(state.ownTimer);
  state.ownTimer = 0;
  applyOwnership(-1);

  // A retarget mid-cut starts from wherever the layer is (it may already be
  // on its way out) and is back to black quickly; a fresh cut dips normally.
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
      // A tool opened during the dip. Do not scroll under the viewer's lock;
      // put the page back as it was and let the viewer own the screen.
      state.cutting = false;
      try { el.remove(); } catch (_) { /* noop */ }
      releaseTicket();
      scheduleOwnership(true);
      return 'cancelled';
    }
    // Land. The same treatment bringRoomToReadingPosition() gives a keyboard
    // jump: curtain open, snapped frame, before anything paints.
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
      // decode() on a complete image too: `complete` says the bytes arrived,
      // not that a decoded bitmap is ready to paint (G3 m-10).
      if (img && typeof img.decode === 'function') {
        ready = Promise.race([img.decode().catch(() => {}),
          new Promise((r) => setTimeout(r, CUT_DECODE_CAP_MS))]);
      }
    } catch (_) { /* noop */ }
    // …and then one painted frame of the landed room under the black before
    // it takes the page, so its type never comes up over a plate that is not
    // on screen yet (G3 m-10). Two rAFs = the frame after the next paint;
    // capped, because a throttled timeline must not strand the cut.
    ready = ready.then(() => new Promise((r) => {
      const cap = setTimeout(r, 80);
      if (typeof requestAnimationFrame !== 'function') { clearTimeout(cap); r(); return; }
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(cap); r(); }));
    }));
    return ready.then(() => {
      if (seq !== cutSeq || state.destroyed) return 'cancelled';
      // v29 · S6: the target takes the page AS THE BLACK LIFTS, as the note
      // above says — not 140 ms after it has gone. Waiting left the room on
      // screen bare for ~0.4 s (no type, terminals dark) before its arrival
      // (M2, theme.css §09b) and the screens' power-on could start; now they
      // play under the fade-out. `cutting` stays true until the fade ends, so
      // no frame can hand the page to anyone else meanwhile, and the
      // scheduleOwnership() below lands on this same room (a no-op).
      if (!state.viewing) applyOwnership(i);
      return fadeCut(el, 1, 0, outMs, cutEasing('--m-ease-out', 'cubic-bezier(.22,.61,.24,1)'))
        .then(() => {
          if (seq !== cutSeq || state.destroyed) return 'cancelled';
          state.cutting = false;
          try { el.remove(); } catch (_) { /* noop */ }
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
    // An element (or anything with an id / dataset.room).
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

/* ────────────────────────────────────────────────────────────────────────────
 * onRoomChange — public subscription for the top menu.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Subscribe to "the most-visible room changed".
 *
 * @param {(info: {id:string, name:string, index:number, el:Element}) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onRoomChange(cb) {
  if (typeof cb !== 'function') return () => {};
  state.roomChangeCbs.add(cb);

  // Fire immediately with the current room so callers do not need a separate
  // "what is active right now?" call at startup.
  if (state.activeIndex >= 0) {
    const room = state.rooms[state.activeIndex];
    try { cb({ id: room.id, name: room.name, index: state.activeIndex, el: room.el }); }
    catch (err) { console.error('[engine] onRoomChange callback threw:', err); }
  }

  return () => state.roomChangeCbs.delete(cb);
}

/* ────────────────────────────────────────────────────────────────────────────
 * FOCUS OWNERSHIP — the keyboard's own way of changing rooms.
 *
 * THE DEFECT, MEASURED. theme.css §05 gives every room a --cut: the room that
 * owns the page keeps its affordances, and every other room's `.rail-chips`,
 * `.hotspot`, `[data-screen]` and `.frz-pad` go to `clip-path: inset(50%)`
 * behind a stage at `opacity: 0`. That is exactly right for a POINTER — it is
 * the one declaration that makes an element neither painted nor hit-tested, and
 * it is what stops a room you have scrolled past from eating clicks through an
 * invisible plate.
 *
 * It is exactly wrong for the TAB KEY, because sequential focus navigation does
 * not care about --cut. It moves focus to the next element in DOM order and
 * scrolls it to the nearest viewport EDGE — which is never the position at
 * which its room owns the page. So the control took focus while clipped:
 *
 *     Tab walk, 1600x900, 66 stops (10 of them page chrome, 56 in the rooms):
 *       48 of the 56 at effective opacity 0 AND clip-path inset(50%)
 *       47 of the 56 with document.elementFromPoint() at the control's own
 *          centre returning MAIN — i.e. voice control and every other
 *          pointer-emulating assistive technology could not activate it at all
 *       Enter still fired on all 56.
 *
 * Operable, and invisible. WCAG 2.4.7 in its textbook form.
 *
 * THE FIX IS NOT TO UN-CLIP ANYTHING. Un-clipping a room that does not own the
 * page is how the click-through bug §05 documents comes back: the stage is
 * pinned a full --pin-lead early, so a non-owning room's hotspots sit over the
 * room you are actually looking at. Instead, focus is treated as what it
 * genuinely is — a statement about where the reader is. If focus enters a room
 * that does not own the page, that room is BROUGHT to the reading position, and
 * it then owns the page for the same reason and by the same maths as if you had
 * scrolled there: --p 0, --enter 1, --cut 1, nothing clipped, everything lit.
 * One room is un-clipped at a time, and it is the room the engine itself calls
 * active. Nothing new can be clicked through.
 *
 *     After, same walk: 0 of 56 failing the hit test, and 1 of 56 still not
 *     fully on screen — the Back Office's Fall-Off Summary, whose clipboard is
 *     photographed at the right edge of the plate, so 39% of the control hangs
 *     past a 1600px viewport at every scroll position. That one is geometry in
 *     the photograph, not a clip; it is unclipped, hit-testable over the 39%
 *     that IS on screen, and has a fully visible chip in the rail. At 820x1180
 *     and 430x932 the plate is cropped differently and the count is 0 of 49 and
 *     0 of 31.
 *
 *     Re-verified at the same time, because this rule must not buy visibility
 *     with click-through: 549 controls belonging to a NON-owning room,
 *     hit-tested at 60 scroll positions, 0 reachable — and 46 more with focus
 *     deliberately parked in a room the page has since scrolled away from, also
 *     0. A room only ever un-clips by becoming the room you are looking at.
 *
 * WHY IT READS --cut RATHER THAN RE-DERIVING IT. --cut is theme.css's answer,
 * assembled from --enter, --p, --cut-z and --cut-k, and --cut-z/--cut-k are
 * solved PER BREAKPOINT (§02, §17). A copy of that arithmetic here would be a
 * second source of truth that drifts the first time someone re-solves a
 * breakpoint. This is one getComputedStyle read per focus event — a handful a
 * second at a human's tabbing speed, on the event, never in the loop. The rule
 * at the top of this file stands: nothing reads a computed style inside tick().
 *
 * WHY THE JUMP IS INSTANT, always. The engine has a perfectly good tween
 * (scrollToRoom) and it is the wrong tool here twice over. A tween is up to
 * 1100ms during which the control that just took focus is still clipped — the
 * defect, merely shortened — and a Tab-Tab-Tab user restarts it on every press.
 * And an unrequested multi-thousand-pixel glide is precisely the motion
 * prefers-reduced-motion exists to suppress. `behavior: 'instant'` is what the
 * browser itself does when it scrolls a focused element into view, so this is
 * the native behaviour aimed at the right scroll position. Under reduced motion
 * applyReducedMotion() pins --enter 1 / --p 0 for EVERY room, so --cut is 1
 * everywhere, nothing is ever clipped, and this handler returns at the first
 * test without scrolling anything at all.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The --cut a room must reach before focus is allowed to stay in it.
 *
 *  Any value above zero already restores hit-testing (--live-cut snaps to 1 the
 *  instant --cut leaves zero, and that is what drives the clip), but --cut also
 *  IS the hotspot layer's opacity, so a room at --cut 0.04 is hit-testable and
 *  still invisible. Half-lit is the line: at 0.5 the room is plainly on screen
 *  and a keyboard user can see the ring, below it they cannot.
 *
 *  The exact number is close to immaterial in practice. §05 ramps --cut at x34
 *  on --enter and x100 on --p, so it crosses 0 to 1 in about 0.03 of a room's
 *  --enter — one or two frames of scrolling. Anything in (0, 1) picks the same
 *  rooms; this one is written down so nobody has to re-derive why. */
const OWNS_PAGE_MIN_CUT = 0.5;

/** theme.css §05's own answer to "does this room own the page right now?".
 *  --cut is registered `<number>`, so the computed value parses as one. A
 *  browser that has not registered it (or a stage the engine never wrote to)
 *  yields NaN, which is treated as "owns" — fail open, exactly as the curtain
 *  does: the cost of being wrong that way is nothing, and the cost of being
 *  wrong the other way is a page that scrolls itself on every focus event. */
function roomOwnsPage(room) {
  let cut;
  try { cut = parseFloat(getComputedStyle(room.stage).getPropertyValue('--cut')); }
  catch (_) { return true; }
  if (!Number.isFinite(cut)) return true;
  return cut >= OWNS_PAGE_MIN_CUT;
}

/** Put a room at its reading position NOW, and make the page agree in the same
 *  turn — serviceFrame(snap) is the one update path (see its header), so the
 *  vars the browser paints on the very next frame are already this room's. */
function bringRoomToReadingPosition(i) {
  const maxY = Math.max(0, document.documentElement.scrollHeight - (window.innerHeight || 0));
  const to = Math.max(0, Math.min(maxY, state.M[i * M_STRIDE + M_TOP]));
  if (Math.abs(to - (window.scrollY || window.pageYOffset || 0)) < 2) return;

  // Any in-flight jump is superseded — the keyboard is a human taking over.
  cancelTween('interrupted');

  try { window.scrollTo({ top: to, left: 0, behavior: 'instant' }); }
  catch (_) { window.scrollTo(0, to); }          // no options bag: old WebKit

  // Same treatment a jump gets in onScroll(): show everything, land ON the
  // values rather than easing toward them, and do it before the next paint.
  openCurtain();
  armCurtain();
  syncNow();
  wake();
}

/**
 * Bring --p / --enter up to date with the scroll position we are at RIGHT NOW,
 * synchronously, before anything reads a style off a stage.
 *
 * WITHOUT THIS THE OWNERSHIP TEST BELOW READS THE PAST, twice over:
 *   · focusing an element scrolls it into view first and dispatches the event
 *     second, so by the time we run, the page has moved and --enter/--p are
 *     still the values the last rAF frame wrote for where we used to be; and
 *   · a room the engine has never written to at all resolves --cut at its
 *     registered initial-value of 1 (§01's no-JS rendering), which reads as
 *     "owns the page" for every room on the document until it is first ticked.
 * Both were reproduced: focus() on the Back Office's Fall-Off hotspot from
 * scrollY 0 measured --cut 1 for a room 7,920px down the page, so the handler
 * declined to move and left the control clipped at the viewport's edge — the
 * original defect, in the one case that matters most (a deep link or a
 * restored scroll position).
 *
 * serviceFrame(snap) is the one update path; snap lands ON this position's
 * values instead of easing toward them, and its own jump test primes liveness
 * for whatever room we have arrived at.
 */
function syncNow() {
  state.lastScrollY = -1;      // force a full recompute, not an early-out
  state.dirty = true;
  serviceFrame(nowMs(), 0, true, false, false);
}

function onFocusIn(ev) {
  if (state.destroyed || !state.rooms.length) return;

  const t = ev.target;
  if (!t || typeof t.closest !== 'function') return;

  // .hero carries `class="hero room"`, so it is matched here too — it holds no
  // interactive element today, but a future one gets the same treatment free.
  const roomEl = t.closest('.room');
  if (!roomEl) return;                    // page chrome: skip link, ticket rail, C³

  const i = state.byId.get(roomEl.id);
  if (i === undefined) return;            // a section the engine skipped

  /* THE STAGE IS NOT A SCROLLER, and the browser has just scrolled it. Focus
     scrolls the new element into view through EVERY scrollable ancestor before
     this handler runs, and `.stage { overflow: hidden }` counts: it cannot be
     scrolled by a finger, but it can by focus. The note on revealWithinRoom()
     records the hand-rolled reveal being written to avoid exactly that, and it
     does — but the browser's own pass had already happened. Measured, this
     build, 1440x900: Tab onto the Back Office's Fall-Off hotspot (39% of it past
     the right edge of the plate, §17) and `.stage.scrollLeft` read 187. The
     plate, the light layers, the hotspot layer and the rail all panned 187px
     left and stayed there for the rest of the session: Commission Payouts
     landed at x -174, off the left edge, and no longer took a click. Put the
     composition back before anything else reads a rect off it. One property
     read per focus event, a write only when it moved. */
  const stage = state.rooms[i].stage;
  if (stage.scrollLeft || stage.scrollTop) { stage.scrollLeft = 0; stage.scrollTop = 0; }

  // Everything below reads M. If the last geometry event landed while the
  // viewer's scroll lock had the rooms out of the flow, the table is owed a
  // pass and this is the first event after the unlock that can take it — the
  // unlock's own scroll event is queued behind us. See roomsOutOfFlow().
  retryDeferredMeasure();

  /* A FOCUS RESTORE IS NOT THE READER MOVING. When the tool viewer closes it
     hands focus back to the hotspot that opened it (overlay.js restoreFocus),
     and that hotspot is, by construction, in the room the reader was already
     in: they activated it there, the page has been locked in place since, and
     the unlock puts scrollY back to the pixel. The ownership rule below exists
     for focus ARRIVING somewhere — Tab walking into a clipped room — and has
     nothing to say about focus coming home. It is told apart by the two facts
     that are true of a restore and false of navigation: the same element that
     last held focus in the rooms, at the same scroll position it held it at.
     Tab-Tab-Tab moves to a new element every press; a wheel scroll and a
     Shift+Tab back to the old one changes scrollY; both still get the rule.
     syncNow() still runs so the first frame painted after the viewer lifts is
     computed for THIS scroll position, not the 0 the lock left behind. */
  const y = window.scrollY || window.pageYOffset || 0;
  const restore = t === state.lastRoomFocus && Math.abs(y - state.lastRoomFocusY) < 2;
  state.lastRoomFocus = t;
  state.lastRoomFocusY = y;

  if (state.reduceMotion) return;         // §18 un-clips everything; nothing to do
  // v29 · CHEAPER (audit/perf.md §3.9). This used to run a full synchronous
  // engine frame, a getComputedStyle and an ancestor walk of computed styles
  // and scroll sizes on EVERY focus — which in Chromium is every button click,
  // and every focus the viewer hands back on close. Two cases need none of it:
  //   · a focus RESTORE (see above): since C1 the engine ignores the viewer's
  //     lock entirely, so the vars under a closing viewer are already the
  //     ones for this exact scroll position;
  //   · a focus that is not :focus-visible, i.e. a pointer press. A pointer
  //     can only press what is painted and hit-testable, which is to say a
  //     control in a room that already owns the page — the §05 clip makes
  //     every other room's controls unreachable to it.
  // What is left is keyboard (and programmatic-after-keyboard) focus, which is
  // exactly the case the ownership rule was written for.
  if (restore || state.viewing) return;
  let visible = true;
  try { visible = t.matches(':focus-visible'); } catch (_) { visible = true; }
  if (!visible) return;
  syncNow();
  if (!roomOwnsPage(state.rooms[i])) bringRoomToReadingPosition(i);
  revealWithinRoom(t, state.rooms[i].stage);
}

/**
 * THE SECOND HALF OF THE SAME PROBLEM, one scroller down.
 *
 * The browser scrolls a newly focused element into view through EVERY
 * scrollable ancestor, not just the page — but it does it before this handler
 * runs, i.e. while the room is still clipped to `inset(50%)`. A clipped element
 * has no visible rectangle to scroll into view, so the inner scrollers are left
 * exactly where they were, and un-clipping the room afterwards reveals a strip
 * still scrolled to the wrong card. Measured at 820x1180 after the room fix
 * landed: Tab into the Break Room's Head Chef strip and card 5 sat at x 772 in
 * a strip whose visible box ends at 784, with scrollLeft 0 — one stop still off
 * screen out of 49. So the reveal is re-run now that nothing is clipped.
 *
 * IT IS HAND-ROLLED, AND `el.scrollIntoView()` IS NOT USED, because that call
 * scrolls every scroll container on the way up and TWO of them must not move:
 *
 *   · the page. The room's own scroll position is the thing this whole block
 *     exists to establish; handing it to a nested strip gives it straight back.
 *   · .stage. `overflow: hidden` is still a scroll container to script, and
 *     scrollIntoView will happily scroll one. Measured: focusing the Back
 *     Office's Fall-Off hotspot (whose object sits at the right edge of the
 *     photograph, §17) left `.stage.scrollLeft = 65` — the plate, the light
 *     layers, the hotspot layer and the rail all panned 65px sideways, with
 *     nothing to ever put them back. The composition is not a scroller.
 *
 * So this walks up to the stage and moves only boxes that are genuinely
 * scrollable — overflow auto/scroll AND actually overflowing, i.e. exactly the
 * ones a user could scroll themselves — by the smallest delta that brings the
 * element inside. Measured after: 0 of 49 at 820x1180, 0 of 31 at 430x932, and
 * `.stage.scrollLeft` 0 everywhere.
 */
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


/* ────────────────────────────────────────────────────────────────────────────
 * Event wiring.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The scroll listener does two things, both O(1) and neither of them layout.
 *
 * 1. Raise the dirty flag. All maths waits for rAF.
 * 2. Detect a JUMP — more than half a viewport moved between one frame's
 *    scroll position and this event.
 *
 * A jump is a menu tap, a hard fling, a restored scroll position on reload, a
 * back-navigation, or an anchor. It is the one input that can put a completely
 * different part of the document under the reading position before any observer
 * has been given a chance to say anything about it, and it is where BOTH of the
 * client's symptoms came from:
 *
 *   · the curtain was still holding the mask for where we used to be, so the
 *     rooms that just arrived were still marked dormant — measured at 393x852:
 *     jumping y=0 to y=4087 left the bottom two thirds of the screen blank; and
 *   · the cross-dissolve was easing --enter from the frozen 0 of a room we had
 *     scrolled past, so even once the curtain lifted the stage spent ~5 frames
 *     at an opacity below theme.css's 0.22 dissolve floor, painting nothing.
 *
 * So a jump throws the curtain open (every room visible until the observer has
 * re-reported and the page has stopped moving) and asks the next frame to SNAP
 * the dissolve rather than ease it. Easing a cross-fade across four thousand
 * pixels is not a cross-fade anyway: nothing crossed, we teleported.
 *
 * The threshold is half a viewport, which no continuous gesture reaches — a
 * hard iOS fling tops out around 300px per frame at 60Hz and the scrollToRoom
 * tween is capped at 2.6px/ms, ~43px per frame — so normal scrolling never pays
 * for any of this, and the curtain keeps closing exactly as it should.
 */
const JUMP_FRACTION = 0.5;

function onScroll() {
  // C1: the viewer's lock and unlock are not the reader moving. Ignore them
  // entirely; exitViewing() runs the one owed pass. (Re-checked here as well as
  // by the class observer, so a stale flag can never swallow real scrolling.)
  if (state.viewing || viewingNow()) {
    checkViewing();
    if (state.viewing) { state.viewSyncOwed = true; return; }
  }
  // The viewer's unlock is a scrollTo() back to where the page was, and it is
  // the one event guaranteed to follow the rooms returning to the scroll flow.
  // A measurement owed from inside the lock is taken here, once; on a healthy
  // page this is a boolean test. See roomsOutOfFlow().
  retryDeferredMeasure();
  const y = window.scrollY || window.pageYOffset || 0;
  // Reduced motion never runs the loop, so the menu and ownership would never
  // hear about a scroll. The active-room test is pure arithmetic on the cache.
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

/** Never let the geometry cache go more than this long without a refresh while
 *  the page is actively being resized. The trailing debounce alone is not
 *  enough: for its whole 150ms the engine is deriving --enter from the OLD
 *  stage height, and a 78px error in stageH is enough to put both rooms of a
 *  cross-dissolve under the 0.22 floor at once — every stage visible, every one
 *  of them transparent. Measured on the toolbar-flap scenario: eleven blank
 *  frames with the debounce alone, zero with this. A leading edge costs at most
 *  one layout flush per 80ms of continuous resizing (about four for a whole iOS
 *  toolbar animation), against one per event without it. */
const MEASURE_THROTTLE_MS = 80;

/** Measure now if we have not measured recently, and again once things settle.
 *  Every geometry event goes through here. */
function measureThrottled() {
  if (state.destroyed) return;
  // A deferred pass bypasses the throttle: nothing was measured last time, so
  // there is nothing to be throttling against.
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

/**
 * iOS Safari fires visualViewport 'resize' continuously while the address bar
 * animates. Because the layout is authored in svh, none of that changes our
 * cached geometry — so we fingerprint first and only pay for a re-measure when
 * something real moved. This is what stops the "address bar collapse jump".
 */
/**
 * Anything that can move the page under us. Fail open first, ask questions on
 * the debounce.
 *
 * `window.resize` is NOT sufficient on iOS Safari: collapsing or expanding the
 * URL bar changes the visual viewport's height by 60-90px and fires no window
 * resize at all — only visualViewport 'resize' (and 'scroll'). Anything cached
 * against the old height is then wrong by that much for as long as the user
 * keeps scrolling, which is precisely the window in which a curtain keyed to
 * cached geometry hides the room being read. So: open the curtain immediately,
 * re-measure on the 150ms debounce, re-arm the curtain after that.
 */
function onGeometryEvent() {
  state.lastVvSig = visualViewportSignature();
  openCurtain();
  armCurtain();
  state.dirty = true;
  wake();
  measureThrottled();
}

/** visualViewport 'resize'. On iOS this fires continuously for the whole
 *  toolbar animation; openCurtain()/armCurtain() are both idempotent and
 *  timer-based, so thirty of these cost thirty clearTimeout/setTimeout pairs
 *  and exactly one class write. */
function onVisualViewportChange() {
  onGeometryEvent();
}

/** visualViewport 'scroll'. Fires on every scroll on iOS, and also when a pinch
 *  or the keyboard moves the visual viewport under a static layout viewport.
 *  The size fingerprint tells the two apart: a SIZE change is a toolbar event
 *  and gets the full fail-open treatment, a pure offset change only needs a
 *  frame and a debounced re-measure. Both re-measure; neither thrashes, because
 *  scheduleRemeasure() is the same 150ms debounce for all callers. */
function onVisualViewportScroll() {
  if (visualViewportSignature() !== state.lastVvSig) { onGeometryEvent(); return; }
  state.dirty = true;
  wake();
  scheduleRemeasure();   // offset-only: the debounce is plenty, nothing resized
}

function onOrientationChange() {
  // Orientation change resolves asynchronously; measure now for responsiveness
  // and again after the debounce for correctness. Both measures open the
  // curtain, so nothing is hidden across the rotation.
  openCurtain();
  requestAnimationFrame(() => { if (!state.destroyed) measure(); });
  scheduleRemeasure();
}

function onVisibilityChange() {
  if (!isHidden()) {
    if (state.reduceMotion) {
      // The loop never runs under reduce; just make sure the static end-state
      // still matches the geometry we may have missed while hidden.
      measure();
      applyReducedMotion();
      return;
    }
    // park() first: while the page was hidden, a resize or an IntersectionObserver
    // delivery may have called wake(), leaving `running` true on a rAF request
    // the hidden tab never serviced. Clearing it is what lets wake() below
    // actually issue a live request instead of short-circuiting.
    park();
    openCurtain();       // whatever happened while we were away, show everything
    repairVisible();     // re-measure + synchronous correct frame, before any rAF
    scheduleRemeasure(); // and once more after the debounce, for late layout
    wake();
  } else {
    // Ticking is about to stop. Do not leave a mid-dissolve on the glass.
    settleHidden();
    park();
  }
}

function wireEvents() {
  // Passive: we never call preventDefault, so the browser can keep scrolling on
  // the compositor thread without waiting to see what this handler does. On iOS
  // this alone is the difference between smooth and not.
  on(window, 'scroll', onScroll, { passive: true });
  on(window, 'resize', onGeometryEvent, { passive: true });
  on(window, 'orientationchange', onOrientationChange, { passive: true });
  on(window, 'pageshow', onGeometryEvent, { passive: true });
  on(document, 'visibilitychange', onVisibilityChange);

  // v29 fix round (G2 M1): a menu jump made from the KEYBOARD takes focus to
  // the room it lands in. A keyboard-activated link click has detail 0; a
  // pointer click has 1+. Capture phase, so this is noted before cinema.js's
  // own handler calls scrollToRoom() in the same dispatch.
  on(document, 'keydown', onMenuKeyCapture, true);
  on(document, 'pointerdown', onPointerModeCapture, { capture: true, passive: true });
  on(document, 'click', onMenuClickCapture, true);

  // Sequential focus is a scroll input like any other — see the FOCUS
  // OWNERSHIP block above for what it is for and what it measured. focusin,
  // not focus, because focus does not bubble and every control on this page is
  // built by another module into a room this one only knows by its .room class.
  on(document, 'focusin', onFocusIn);

  // C1 · the viewer. The events prompt a re-check; the classes decide.
  on(document, 'ccc:viewer-open', checkViewing);
  on(document, 'ccc:viewer-close', checkViewing);
  if (typeof MutationObserver === 'function') {
    state.classMO = new MutationObserver(checkViewing);
    try {
      state.classMO.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) state.classMO.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (_) { /* noop */ }
  }

  if (window.visualViewport) {
    on(window.visualViewport, 'resize', onVisualViewportChange, { passive: true });
    on(window.visualViewport, 'scroll', onVisualViewportScroll, { passive: true });
  }

  // Late-loading plates can change document height. One cheap re-measure when
  // the window fully loads catches that without polling.
  on(window, 'load', onGeometryEvent, { passive: true });

  // Fonts settling can reflow the rails. Same idea, one shot.
  if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
    document.fonts.ready.then(() => { if (!state.destroyed) onGeometryEvent(); }).catch(() => {});
  }
  // …and a face that lands later retypesets the course menu's dark labels
  // (their fonts are copied at measure time, §M4 above).
  if (document.fonts && typeof document.fonts.addEventListener === 'function') {
    on(document.fonts, 'loadingdone', () => { if (!state.destroyed) measureTickets(); });
  }
}

/** C5 · html[data-motion]. Anything but 'lite' or 'off' — including absent,
 *  which is every page until S6's motion.js lands — is 'full'. */
function readMotionTier() {
  let t = '';
  try { t = document.documentElement.getAttribute('data-motion') || ''; }
  catch (_) { /* noop */ }
  return (t === 'lite' || t === 'off') ? t : 'full';
}

function wireReducedMotion() {
  state.motion = readMotionTier();
  const mq = (typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  state.motionMQ = mq;
  state.reduceMotion = !!(mq && mq.matches) || state.motion === 'off';

  // One handler for both inputs: the OS preference and the tier attribute.
  // Either can change at runtime (S6 demotes to lite on a slow device; a rep
  // can flip the OS setting), and the engine answers the same way to both.
  const handler = () => {
    const wasReduced = state.reduceMotion;
    state.motion = readMotionTier();
    state.reduceMotion = !!(state.motionMQ && state.motionMQ.matches) || state.motion === 'off';
    if (state.reduceMotion) {
      cancelTween('cancelled');
      applyReducedMotion();
    } else {
      state.dirty = true;
      state.lastScrollY = -1;   // force a full recompute (a tier change moves --exit-fine)
      if (wasReduced) {
        // Booted reduced: the observers were never set up (initEngine returns
        // before them), so the loop would have nothing marked live to compute.
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
      mq.addListener(handler);   // Safari < 14
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

/* ────────────────────────────────────────────────────────────────────────────
 * Room collection.
 * ──────────────────────────────────────────────────────────────────────────── */

function collectRooms(root) {
  const scope = (root && typeof root.querySelectorAll === 'function') ? root : document;
  const nodes = scope.querySelectorAll('.room');
  const rooms = [];

  for (const el of nodes) {
    const stage = el.querySelector('.stage');
    const wrap = stage ? stage.querySelector('.plate-wrap') : null;

    // Defensive: a malformed room is skipped, never thrown on. One bad section
    // authored by another agent must not take the whole page down.
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
    if (!el.id) el.id = id;   // IO callback maps back by id

    // The two light layers. Queried from .stage rather than .plate-wrap so this
    // keeps working whichever of the two they hang off — theme.css re-anchors
    // them to the stage rect with insets, but they are still .plate-wrap's
    // children in the DOM, and either arrangement resolves here. Cached once:
    // updatePromotions() must never touch the DOM to find them.
    // They are decorative, so a missing one is skipped, not fatal — unlike
    // .stage / .plate-wrap, whose absence skips the whole room.
    const glow = stage.querySelector('.plate-glow');
    const vig = stage.querySelector('.plate-vig');

    rooms.push({ id, name, el, stage, wrap, glow, vig, live: false });
  }

  return rooms;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Public entry point.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Boot the engine.
 *
 * @param {Element|Document} [root=document] scope to search for `.room` sections.
 * @returns {{
 *   rooms: string[],
 *   scrollToRoom: typeof scrollToRoom,
 *   onRoomChange: typeof onRoomChange,
 *   refresh: () => void,
 *   destroy: () => void,
 *   get reducedMotion(): boolean
 * }}
 */
export function initEngine(root) {
  // Re-initialising must never leave a second loop or a second observer behind.
  if (state.inited) destroyEngine();

  state.destroyed = false;
  state.rooms = collectRooms(root || document);

  const n = state.rooms.length;
  state.M = new Float64Array(Math.max(1, n) * M_STRIDE);
  state.V = new Float64Array(Math.max(1, n) * V_STRIDE);
  // NaN-fill the write cache so the very first frame always writes every var.
  state.W = new Float64Array(Math.max(1, n) * W_STRIDE).fill(NaN);
  state.liveFlags = new Uint8Array(Math.max(1, n));

  // Curtain inputs. paintSeen starts at 0 for every room and paintNear at 1:
  // "not yet observed, assume visible". Both halves of that are the fail-open
  // default — nothing can be hidden until the observer has said something about
  // it, and what it has not said anything about is painted.
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
  state.viewing = viewingNow();   // a deep link can have the viewer up before we boot

  if (state.reduceMotion) {
    // Requirement 7: never start the loop at all.
    applyReducedMotion();
    scheduleFirstFrame();
    return publicApi();
  }

  setupObserver();
  setupPaintObserver();

  // If IO has not fired yet (it is async), light up the rooms nearest the current
  // scroll position so the very first painted frame is already correct.
  primeLiveNeighbourhood();

  // The curtain starts OPEN and only arms once the paint observer has reported
  // on every room. Until then every room paints, which is the pre-curtain
  // rendering — heavier for half a second, and never blank.
  armCurtain();

  if (isHidden()) {
    // Booted straight into a background tab. requestAnimationFrame will not run
    // a single callback here, so starting the loop and hoping is how the page
    // ended up stranded on one frame's worth of half-written values in the
    // first place. Write a coherent, fully-presented room right now, then stay
    // parked — visibilitychange will re-measure and repair when the tab is
    // actually shown, and any scroll before then re-arms the loop (and with it
    // the interval fallback) through the normal onScroll path.
    settleHidden();
    park();
    return publicApi();
  }

  // THE FIRST FRAME HAS NOTHING TO DISSOLVE FROM. Every V_ENTER starts at 0, so
  // easing toward the target spends 4-6 frames below theme.css's 0.22 dissolve
  // floor — a black page. Invisible at scrollY 0 (the hero's target is 1 and it
  // is the only room on screen), obvious when the browser has RESTORED a deep
  // scroll position before we booted, which Safari does on every reload and
  // every back-navigation. Measured after a goBack to y=5449: two frames with
  // zero coverage on all thirteen sample rows. Land on the values instead.
  state.snapNext = true;

  if (state.viewing) {
    // Booted under the viewer: land one coherent frame for what is behind it
    // (the lock stashed the load's own scroll position, so this is right), and
    // stay parked until it closes. The static curtain still has to hear.
    syncNow();
    scheduleFirstFrame();
    return publicApi();
  }

  wake();
  return publicApi();
}

/**
 * Mark the room under a given scroll position, and its neighbours, live.
 *
 * Used at boot (IntersectionObserver delivery is async, and never happens at all
 * in a tab that loads hidden) and again whenever we are updating without rAF,
 * where IO is starved for exactly the same reason. Purely arithmetic over the
 * cached geometry — no layout reads — and additive only: it can promote a room
 * into the computed set but never drops one, so it can never race the observer
 * into un-ticking a room that is still on screen.
 */
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
    /**
     * Read-only counters. Cheap enough to leave in: a handful of integer bumps
     * per frame. `fallbackDrives` staying at 0 through a normal session is the
     * proof that the occluded-window fallback is costing nothing.
     */
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
    /** Force a re-measure (call after injecting or removing content). */
    refresh() { measure(); },
    destroy: destroyEngine,
  };
}

/** Full teardown: loop, observer, listeners, timers, tween. */
export function destroyEngine() {
  state.destroyed = true;
  cancelTween('cancelled');
  park();                 // also disarms the fallback interval
  disarmFallback();       // belt and braces: park() is the only other caller
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
    try { state.rooms[state.ownedIndex].el.classList.remove('is-owned'); } catch (_) { /* noop */ }
  }
  state.ownedIndex = -1;
  state.ownCand = -1;
  state.viewing = false;
  state.cutting = false;
  if (tix.ro) { try { tix.ro.disconnect(); } catch (_) { /* noop */ } tix.ro = null; }
  if (tix.ind) { try { tix.ind.remove(); } catch (_) { /* noop */ } }
  if (tix.ink) { try { tix.ink.remove(); } catch (_) { /* noop */ } }
  if (tix.nav) { try { tix.nav.classList.remove('has-ind', 'is-overflowing'); } catch (_) { /* noop */ } }
  tix.nav = tix.ind = tix.pos = null;
  tix.ink = tix.inkL = tix.inkR = tix.inkC = null;
  tix.lead = '';
  if (state.cutEl) { try { state.cutEl.remove(); } catch (_) { /* noop */ } state.cutEl = null; }
  state.byStage.clear();
  offAll();
  for (const r of state.rooms) {
    try { setRoomPromotion(r, false); } catch (_) { /* noop */ }
  }
  // Leaving `is-dormant` behind on a torn-down page would hide six rooms for
  // whatever mounts next.
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

/* ────────────────────────────────────────────────────────────────────────────
 * Perf self-check — append ?perf to the URL.
 *
 * Counts frames whose delta exceeded 1.5× the device's own measured frame
 * budget. On a 60Hz iPad the budget resolves to ~16.7ms, on a 120Hz iPad Pro to
 * ~8.3ms, so the number means the same thing on both: "frames the user could
 * feel". Prints a rolling report every 2s and leaves the counters on
 * `window.__cccPerf` for a quick console poke during a store demo.
 * ──────────────────────────────────────────────────────────────────────────── */

let perf = null;

if (PERF) {
  perf = {
    frames: 0,
    dropped: 0,
    worstMs: 0,
    budgetMs: 16.7,   // refined from observed deltas below
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

  // Learn the display's real cadence from the fastest deltas seen, so a 120Hz
  // panel is not scored against a 60Hz budget.
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
