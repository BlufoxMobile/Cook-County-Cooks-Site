/* =============================================================================
 * Cook County Cooks
 * assets/app.js  ·  THE ROUTER
 * -----------------------------------------------------------------------------
 * This file used to be the cinema integrator. It is now ~2 KB whose only job is
 * to answer one question — restaurant, or pocket list? — and load exactly one
 * of the two. The integrator moved to cinema.js, byte for byte.
 *
 * WHY A ROUTER AND NOT A BRANCH INSIDE THE INTEGRATOR
 *   The client, about the shipped site: "The mobile site just looks super rough,
 *   if I'm honest." Before that: "the site keeps crashing on my iPhone ... when
 *   I scroll down the site crashes and it turns into a blue screen" — WebKit
 *   killing the tab under memory pressure, with 35 MB of decoded plates and
 *   50 MB of compositor backing store resident (theme.css §17 carries the
 *   measurements).
 *
 *   A branch inside the integrator would not have helped, because a static
 *   `import` is fetched, parsed and evaluated whether or not the branch is
 *   taken. The cinema is engine + overlay + screens + chefwall + labels +
 *   wallprint + freezer: 660 KB raw, 213 KB gzipped, before a single plate. The
 *   ONLY way a phone does not pay for it is for the specifier never to be
 *   reached, which is what the dynamic import()s below are for.
 *
 *   Measured, 393x852 at DPR 3, scrolled to the walk-in:
 *     restaurant   25 requests · 1849 KB wire · 9 plates · 35.2 MB decoded
 *     pocket list   4 requests ·  343 KB wire · 0 plates ·  0.0 MB decoded
 *
 * THE DECISION IS NOT MADE HERE. It is made by the inline script in the <head>
 * of index.html, before first paint, and stamped on <html data-view>. It has to
 * be there and not here: this module is type="module", therefore deferred,
 * therefore it runs after the document has painted — a decision made here would
 * show the wrong site first and then swap it. Read that script for the
 * predicate and the reasoning; this file trusts the stamp and only recomputes
 * it if the stamp is missing (someone loading this module some other way).
 *
 * READING OLDER COMMENTS. Half this codebase says "app.js §2", "app.js's
 * PLATE_SIZES", "app.js builds the dialog". Those were all true of this file
 * and are now true of two others; rather than rewrite forty prose references
 * across seven modules, here is the single redirection:
 *      app.js §2 (the freezer gate + the keypad)  ->  coldgate.js
 *      everything else that was app.js            ->  cinema.js
 *      el() / fill() / $()                        ->  dom.js
 *      freshUrl()                                 ->  freshurl.js
 *      ROOM_ORDER                                 ->  roomorder.js (re-exported
 *                                                    by rooms.js, unchanged)
 *
 * NOTE ON THE import() FORMATTING BELOW — do not "tidy" it onto one line.
 * build/fingerprint.mjs anchors its import matcher at the start of a line
 * (`^[ \t]*import\s*\(`), deliberately, so that a static import quoted inside a
 * doc comment is not mistaken for a real dependency. A dynamic import written
 * as `const m = await import('./cinema.js')` would therefore never have its
 * specifier rewritten to the hashed filename, and the module would 404 in a
 * production build while working perfectly from a dev checkout.
 * ========================================================================== */

/* THE ONE COPY OF THE PREDICATE THAT IS NOT IN index.html. It is only ever used
 * when the inline stamp is absent, and for the "you are on a phone" test that
 * decides whether the cinema gets a quiet way back to the pocket list. The
 * authoritative copy, with the device table behind it, is in index.html. */
const POCKET_MQ =
  '(pointer: coarse) and ((max-width: 500px) or ((max-width: 1000px) and (max-height: 500px)))';

const VIEW_KEY = 'ccc-view';

/** localStorage throws outright in some Safari configurations (private mode
 *  with storage blocked, "Prevent cross-site tracking" in a framed context).
 *  Every read and write in this build goes through these two. */
export function readView() {
  try { const v = localStorage.getItem(VIEW_KEY); return v === 'full' || v === 'pocket' ? v : null; }
  catch { return null; }
}
export function rememberView(v) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage disabled: the
    ?view= parameter in the href still carries the choice for this visit */ }
}

function decide() {
  const stamped = document.documentElement.dataset.view;
  if (stamped === 'pocket' || stamped === 'full') return stamped;
  // No stamp: recompute rather than guess. Same order of precedence.
  let q = null;
  try { q = new URLSearchParams(location.search).get('view'); } catch { /* noop */ }
  if (q === 'full' || q === 'pocket') return q;
  const saved = readView();
  if (saved) return saved;
  try { return matchMedia(POCKET_MQ).matches ? 'pocket' : 'full'; } catch { return 'full'; }
}

/* The two front ends, each behind a specifier this file only reaches down one
 * branch. Written on their own indented lines for the fingerprinter — see the
 * note in the header. */
const load = {
  pocket: () =>
    import('./pocket.fa0947c853.js'),
  cinema: () =>
    import('./cinema.1a0f967496.js')
};

/**
 * THE WAY BACK, and the reason it is here rather than in cinema.js.
 *
 * A rep who taps "View the full restaurant" needs a way out of it again, and
 * the cinema has no room in its chrome for one. So the router appends a single
 * fixed link — but ONLY when this device would have been given the pocket list
 * on its own. On an iPad or a desktop the media query does not match, nothing
 * is appended, and the cinematic build is byte-identical to what it was.
 * (Verified: 0.000% pixel difference at 820x1180, 1180x820, 1440x900 and
 * 2560x1440, against a same-build A/A noise floor of 0.000%.)
 */
function addWayBack() {
  let phone = false;
  try { phone = matchMedia(POCKET_MQ).matches; } catch { /* noop */ }
  if (!phone) return;
  const a = document.createElement('a');
  a.className = 'pocket-return';
  a.href = '?view=pocket';
  a.textContent = 'Tool list';
  a.setAttribute('aria-label', 'Switch to the fast tool list');
  a.addEventListener('click', () => rememberView('pocket'));
  document.body.append(a);
}

/**
 * `?tool=<slug>` -> `#/tool/<slug>`.
 *
 * The site's deep-link shape has always been the hash (overlay.js §8 routes on
 * it, pushes it, and rewinds it). The query spelling is the one people actually
 * paste out of a chat, and it is what the brief for this build asked to keep
 * working in BOTH modes. Normalising it here — in the router, before either
 * front end boots — makes one shape reach both, and leaves overlay.js's routing
 * completely untouched. The parameter is stripped from the address bar so the
 * viewer's own history handling is not looking at two URLs that mean the same
 * thing; every other query parameter (?view=, anything the client adds) is
 * preserved.
 */
function normaliseToolParam() {
  let params;
  try { params = new URLSearchParams(location.search); } catch { return; }
  const slug = params.get('tool');
  if (!slug) return;
  params.delete('tool');
  const q = params.toString();
  const url = location.pathname + (q ? `?${q}` : '') + `#/tool/${encodeURIComponent(slug)}`;
  try { history.replaceState(history.state, '', url); }
  catch { location.hash = `#/tool/${encodeURIComponent(slug)}`; }
}

/* =============================================================================
 * THE FLOOR — what the page is when a module does not arrive
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS, with the reproduction.
 *   Every deploy opens a window in which one of these modules 404s. The build
 *   emits content-hashed filenames and prunes the previous build's, while
 *   index.html is served by GitHub Pages with `cache-control: max-age=600`. For
 *   up to ten minutes after a push, a browser holding the OLD index.html asks
 *   for the OLD hashed module names — which the new deploy has already deleted.
 *   Confirmed live on 2026-08-31: assets/app.js and
 *   assets/theme.a73825e539.css were both 404 on cookcountycooks.com while the
 *   HTML naming them was still inside its own cache lifetime.
 *
 *   What that produced: `await load.cinema()` rejected, nothing caught it, and
 *   the page's only remaining link was "Skip to the kitchen" — pointing at an
 *   empty <main>. A rep mid-conversation with a customer had NOTHING.
 *
 * WHAT THIS RENDERS INSTEAD
 *   A plain <ul> of real <a href> — every open tool, grouped by room, in room
 *   order. No modules, no CSS beyond what already loaded, no fetch: the whole
 *   tool list is already in the document as window.__CCC_INLINE__.tools (the
 *   <head> writes it inline so the site boots off a USB stick). If even that is
 *   missing there is one honest line and a reload link.
 *
 *   The walk-in is NOT listed. Its thirteen labels are ciphertext and coldgate
 *   is one of the modules that may be the one that failed, so the floor says
 *   how many are sealed and nothing else — the same thing the pocket list's
 *   locked row says.
 *
 *   Links are stamped with the same `_ccc` cache-buster the rest of the site
 *   uses. freshUrl lives in its own module and may itself be the 404, so this
 *   inlines the two lines rather than importing anything: a floor with a
 *   dependency is not a floor.
 * ========================================================================== */

/** Minimal, dependency-free element builder. dom.js may be the module that 404'd. */
function fEl(tag, props, kids) {
  const n = document.createElement(tag);
  for (const k in (props || {})) {
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(kids || [])) if (c) n.append(c);
  return n;
}

/** freshUrl(), inlined. Same rule: stamp cross-origin only, never our own
 *  content-hashed assets. See assets/freshurl.js for the client's own words. */
function fStamp(url) {
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) return u.href;
    u.searchParams.set('_ccc', String(Date.now()));
    return u.href;
  } catch { return url; }
}

function renderFloor(err) {
  console.error('[app] a front-end module did not load; rendering the flat list.', err);
  const main = document.getElementById('kitchen') || document.body;
  if (!main) return;                                   // nothing to render into
  document.documentElement.dataset.view = 'floor';     // theme.css may style it
  const data = (window.__CCC_INLINE__ && window.__CCC_INLINE__.tools) || null;
  const tools = (data && Array.isArray(data.tools)) ? data.tools : [];
  const rooms = (data && Array.isArray(data.rooms)) ? data.rooms : [];

  const head = fEl('div', { class: 'floor-head' }, [
    fEl('p', { class: 'kicker', text: 'Cook County Cooks' }),
    fEl('h1', { class: 't-sub', text: 'Every tool, one tap away' }),
    fEl('p', {
      class: 'micro',
      text: tools.length
        ? 'The kitchen could not be built on this load, so here is the plain list. Every link is live.'
        : 'The kitchen could not be built on this load.'
    }),
    fEl('p', {}, [fEl('a', { class: 'chip', href: location.pathname + location.search, text: 'Try the full site again' })])
  ]);

  const groups = [];
  const seen = new Set();
  const byRoom = new Map();
  for (const t of tools) {
    if (!t || !t.url) continue;
    const r = t.room || 'other';
    if (!byRoom.has(r)) byRoom.set(r, []);
    byRoom.get(r).push(t);
  }
  for (const room of rooms) {
    const list = byRoom.get(room.id);
    if (!list || !list.length) continue;
    seen.add(room.id);
    groups.push(fEl('section', {}, [
      fEl('h2', { class: 'kicker', text: room.label || room.id }),
      fEl('ul', {}, list.map((t) => fEl('li', {}, [
        fEl('a', { class: 'tool-row', href: fStamp(t.url), rel: 'noopener' }, [
          fEl('span', { class: 'tool-row-name', text: t.label || t.slug }),
          t.blurb ? fEl('span', { class: 'tool-row-blurb', text: t.blurb }) : null
        ])
      ])))
    ]));
  }
  // Any room the inline rooms[] did not name (or no rooms[] at all).
  for (const [roomId, list] of byRoom) {
    if (seen.has(roomId)) continue;
    groups.push(fEl('section', {}, [
      fEl('h2', { class: 'kicker', text: roomId }),
      fEl('ul', {}, list.map((t) => fEl('li', {}, [
        fEl('a', { class: 'tool-row', href: fStamp(t.url), rel: 'noopener',
                   text: t.label || t.slug })
      ])))
    ]));
  }

  if (!groups.length) {
    groups.push(fEl('p', { class: 'micro', text:
      'The tool list is not in this page either. Reload to fetch a fresh copy of the site.' }));
  }

  main.replaceChildren(fEl('div', { class: 'floor' }, [head, ...groups]));
  // The skip link points at #kitchen; it now lands on something real.
  try { main.focus({ preventScroll: true }); } catch { /* noop */ }
}

async function start() {
  const view = decide();
  document.documentElement.dataset.view = view;
  normaliseToolParam();
  if (view === 'pocket') {
    const mod = await load.pocket();
    return mod.boot();
  }
  const mod = await load.cinema();
  addWayBack();
  return mod.boot();
}

/**
 * ONE catch around the whole boot, and it must stay one.
 *
 * `start()` is an async function, so a 404 on any dynamic import() rejects the
 * promise it returns; boot() throwing synchronously inside a module rejects it
 * too. Both used to be unhandled — `:148-159` awaited the import with no
 * try/catch and the call site attached no .catch — which is why ONE missing
 * module was a blank page. Everything that can go wrong between "the router
 * ran" and "a front end is on screen" now lands here.
 */
function boot() {
  let p;
  try { p = start(); }
  catch (err) { renderFloor(err); return; }
  if (p && typeof p.catch === 'function') p.catch(renderFloor);
}

/* type="module" is deferred by definition, so the parser has finished by the
   time this runs. The readyState check is there only for the case where someone
   loads this file some other way. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
