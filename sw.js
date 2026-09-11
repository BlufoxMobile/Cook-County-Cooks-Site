/* =============================================================================
 * Cook County Cooks — sw.js
 * THE FLOOR UNDER THE FLOOR
 * -----------------------------------------------------------------------------
 * THE DEFECT
 *   Warm the site, walk into a stockroom, reload: net::ERR_INTERNET_DISCONNECTED.
 *   A Chrome error page, with the tool list — 7.5 KB of JSON that is already
 *   INLINE in the HTML — sitting uselessly on the other side of it. There was no
 *   service worker and no manifest, so the answer to "no network" was "no site".
 *
 * WHAT THIS DOES, AND THE THREE RULES IT IS BUILT AROUND
 *
 *   1. IT NEVER TOUCHES A CROSS-ORIGIN REQUEST. Not the tools, not the fonts,
 *      not the live feeds. `respondWith` is not called for them at all, so they
 *      behave exactly as they did — which is the only way to keep the promise
 *      the rest of this codebase makes about staleness. Every tool is on
 *      another origin; therefore no tool can ever be served from this cache.
 *      That is not a policy that can drift, it is a property of the code.
 *
 *   2. IT NEVER FIGHTS THE FINGERPRINTER. build/fingerprint.mjs makes a changed
 *      file a changed URL, so `assets/app.<10 hex>.js` is immutable BY
 *      CONSTRUCTION: cache-first on those is not a staleness risk, it is the
 *      ideal the hashing exists to create. Everything whose URL does NOT move —
 *      index.html above all, and the un-hashed JSON — is network-first, so a
 *      deploy lands the moment the network is there.
 *
 *   3. IT PRECACHES NOTHING. A precache list would have to name hashed
 *      filenames, which means this file would need regenerating on every build
 *      by a script this agent does not own, and a list that goes out of step
 *      with the build is a self-inflicted 404. Instead the cache fills from
 *      what the page actually loads. One warm visit is all it takes, and one
 *      warm visit is exactly the precondition of the bug being fixed.
 *
 * THE ESCAPE HATCH, because a service worker that cannot be removed is a
 * liability: loading any page with `?nosw=1` unregisters this worker and
 * deletes its caches (see the registration block in index.html <head>). If this
 * file ever needs to be withdrawn, ship it as a no-op that calls
 * `self.registration.unregister()` — an empty file at this URL would leave the
 * old worker installed for ever.
 *
 * VERSIONING. CACHE carries a version. `activate` deletes every cache that is
 * not the current one, so bumping the string below is a clean sweep. Bump it
 * when the CACHING RULES change; you do not need to bump it for content, which
 * is what rules 2 and 3 are for.
 * ========================================================================== */

const VERSION = 'ccc-v1';
const CACHE = `${VERSION}-shell`;

/** Matches the content hash build/fingerprint.mjs inserts before the extension:
 *  ten hex digits, as in `app.<10 hex>.js` or `hero@1800.<10 hex>.webp`. Written
 *  as a SHAPE and not as real filenames on purpose — every build mints new
 *  hashes, so quoting actual ones dates this comment the moment they change.
 *  Both filenames previously named here had already ceased to exist. */
const HASHED = /\.[0-9a-f]{10}\.[A-Za-z0-9]+$/;

/** Immutable-by-construction, or art that is safe to hold: cache first. */
const CACHE_FIRST = (url) =>
  HASHED.test(url.pathname) ||
  url.pathname.startsWith('/plates/') ||
  url.pathname.startsWith('/brand/') ||
  url.pathname.startsWith('/headchefs/photos/');

/** How many entries the cache may hold before the oldest are dropped.
 *  Every deploy adds a new set of hashed URLs and the old ones are never asked
 *  for again, so without a cap this grows for ever on a store iPad. 160 is
 *  comfortably more than one full build (24 plates, 16 modules, a stylesheet,
 *  the sound, the JSON, the sub-app pages) and comfortably less than a device
 *  quota. Cache.keys() is insertion-ordered, so the oldest go first. */
const MAX_ENTRIES = 160;

self.addEventListener('install', (event) => {
  // Nothing to precache (rule 3). Take over as soon as we are asked to.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => (n === CACHE ? null : caches.delete(n))));
    await self.clients.claim();
  })());
});

async function trim(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    for (const req of keys.slice(0, keys.length - MAX_ENTRIES)) await cache.delete(req);
  } catch { /* quota or a racing delete: not worth failing a response over */ }
}

/**
 * Store a copy, quietly. Only ever a complete, same-origin, 200 response —
 * a partial (206) or an opaque one would poison the cache for later reads.
 *
 * ⚠ THE clone() IS SYNCHRONOUS AND MUST STAY SYNCHRONOUS. The first version of
 * this awaited caches.open() and cloned afterwards, which hands control back to
 * the page; by the time it cloned, the page had begun reading the body and the
 * clone threw "Response body is already used". Silently: every put failed and
 * the cache stayed empty at 0 entries while the page went on working out of the
 * HTTP cache, so the offline floor was not there at all. Clone first, then go
 * away and store the copy.
 */
function keep(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  let copy;
  try { copy = response.clone(); } catch { return; }
  const done = (async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.put(request, copy);
      await trim(cache);
    } catch { /* private mode, quota exceeded: caching is best-effort */ }
  })();
  // Keep the worker alive until the write lands — a fetch handler that returns
  // before its put resolves can be killed mid-write.
  return done;
}

/** Immutable URL: the cache is the fast path and the offline path at once. */
async function cacheFirst(request, event) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  waitFor(event, keep(request, res));
  return res;
}

/** Everything the fetch handler needs to keep alive past its own return. */
function waitFor(event, promise) { if (promise) try { event.waitUntil(promise); } catch { /* noop */ } }

/**
 * Everything whose URL does NOT move: the network is the truth, the cache is
 * the floor. The race is bounded so a captive portal that accepts the
 * connection and never answers — the failure mode the font fix exists for —
 * cannot leave a rep looking at a spinner when a perfectly good cached copy is
 * sitting right here. Five seconds is long enough for a slow store connection
 * to win on merit and short enough that nobody stares at nothing.
 */
async function networkFirst(request, timeoutMs = 5000, event) {
  let timer = 0;
  try {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const net = fetch(ctrl ? new Request(request, { signal: ctrl.signal }) : request);
    const res = await (ctrl
      ? Promise.race([net, new Promise((_, rej) => {
          timer = setTimeout(() => { try { ctrl.abort(); } catch {} rej(new Error('timeout')); }, timeoutMs);
        })])
      : net);
    if (timer) clearTimeout(timer);
    waitFor(event, keep(request, res));
    return res;
  } catch (err) {
    if (timer) clearTimeout(timer);
    const hit = await caches.match(request);
    if (hit) return hit;
    // A navigation with nothing cached for this exact URL still has somewhere
    // to go: the last index.html we saw. Deep links (#/tool/…) live in the
    // fragment, which is not part of the cache key, so this is the same page.
    if (request.mode === 'navigate') {
      const root = await caches.match('/') || await caches.match('/index.html');
      if (root) return root;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // RULE 1. Another origin is not ours to answer. Tools, fonts, live feeds and
  // the raw.githubusercontent boards all fall out here, untouched.
  if (url.origin !== self.location.origin) return;

  // A request the page deliberately marked no-store (the preflight in
  // assets/preflight.js, the streaks feed) must not be answered from a cache.
  if (req.cache === 'no-store') return;

  if (CACHE_FIRST(url)) { event.respondWith(cacheFirst(req, event)); return; }
  event.respondWith(networkFirst(req, 5000, event));
});

/* The page can ask us to stand down (see `?nosw=1`). Kept here as well as in
   the page so the hatch works even if the page's own script is the thing that
   is broken. */
self.addEventListener('message', (event) => {
  if (!event.data || event.data.ccc !== 'unregister') return;
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
    await self.registration.unregister();
  })());
});
