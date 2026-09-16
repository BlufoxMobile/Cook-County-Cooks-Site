/* =============================================================================
 * Cook County Cooks — v4 "Alive"
 * assets/coldstore.js  ·  THE SEALED PAYLOAD
 * -----------------------------------------------------------------------------
 * The fourteen manager tools are not hidden in this site. They are not IN it.
 * What ships is a block of AES-256-GCM ciphertext — `data/freezer.sealed.6eaa4f60f0.json`,
 * and the identical copy inlined on `window.__CCC_INLINE__.freezer`. This module
 * is the only thing that can turn it back into tools, and only with the
 * password.
 *
 * WHAT THAT DOES AND DOES NOT BUY YOU — read this before you promise anything.
 *   IT DOES stop a sales rep reading the manager links out of View Source, out
 *     of data/tools.f0f6c533e3.json, out of the network tab or out of the DOM. There is no
 *     list to find and no hash to compare against — without the password the
 *     blob is indistinguishable from noise, and a wrong password fails GCM's
 *     authentication tag and yields nothing at all.
 *   IT DOES NOT stop anyone who HAS the password. They can read it out of this
 *     page, out of their own sessionStorage, or simply say it out loud. This is
 *     a shared secret; it is exactly as good as the discipline around it.
 *   IT DOES NOT protect the destination tools. Every one of those fourteen URLs
 *     is a public GitHub Pages site or a public Smartsheet form. Anyone who
 *     learns a URL by any route can open it. Real protection belongs on the
 *     tools themselves.
 *   IT DOES NOT hide the freezer's interior PHOTOGRAPH. `plates/freezer.01697f04b3.webp` is
 *     a static file at a guessable path and always will be.
 *
 * WHY PBKDF2 AND NOT SOMETHING BETTER
 *   Argon2id would be the right answer. WebCrypto does not ship it, and the
 *   shipped page is allowed no npm and no WASM, so PBKDF2-HMAC-SHA256 at the
 *   current OWASP iteration count is the strongest thing available in the
 *   browser. The parameters are not hard-coded here — they are read from the
 *   envelope the build wrote, and they are AUTHENTICATED as additional data, so
 *   a tampered copy of the JSON that asks for 1,000 iterations fails to decrypt
 *   instead of quietly weakening the derivation.
 *
 * PARAMETERS ARE OWNED BY build/seal-freezer.mjs. Do not fork them here.
 *
 * Plain ES module. No build step, no npm, no framework, no external JS.
 * ========================================================================== */

/** sessionStorage keys. `c3f-unlocked` is the v2/v3 flag, kept verbatim so a
 *  manager who unlocked earlier in this session is not asked twice.
 *  `c3f-cold` is new: the decrypted payload, so a RELOAD inside the same
 *  session does not have to re-derive a 600,000-iteration key (or re-ask). */
export const SESSION_FLAG = 'c3f-unlocked';
export const SESSION_PAYLOAD = 'c3f-cold';

const AAD_PREFIX = 'ccc-freezer/v1';

/** The subset of the envelope we are willing to act on. */
function validEnvelope(e) {
  return !!(e && e.ct && e.iv && e.kdf && e.kdf.salt &&
            Number.isFinite(+e.kdf.iterations) && +e.kdf.iterations > 0);
}

function b64ToBytes(s) {
  const bin = atob(String(s));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Find the envelope.
 *
 * The inline copy is preferred and is the only one that works when the page is
 * opened straight off disk — fetch() against file:// is CORS-blocked for a null
 * origin, which is the same reason index.html inlines tools.json at all.
 *
 * @returns {Promise<object|null>}
 */
export async function loadEnvelope(url = 'data/freezer.sealed.6eaa4f60f0.json') {
  const inline = (window.__CCC_INLINE__ || {}).freezer;
  if (validEnvelope(inline)) return inline;
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const doc = await res.json();
    return validEnvelope(doc) ? doc : null;
  } catch { return null; }
}

/** Is WebCrypto actually here? file:// counts as a secure context in Chrome and
 *  Firefox, so the USB-stick review path works; plain http:// on a LAN IP does
 *  not, and the caller needs to be able to say so rather than say "wrong code". */
export function cryptoAvailable() {
  return !!(globalThis.crypto && globalThis.crypto.subtle && typeof atob === 'function');
}

/**
 * Try the password against the envelope.
 *
 * @returns {Promise<{tools: object[]}|null>} the payload, or null when the
 *          password is wrong. THROWS only for an environment fault (no
 *          WebCrypto, malformed envelope) so the keypad can tell "that code is
 *          wrong" apart from "this browser cannot check codes at all".
 */
export async function unseal(envelope, password) {
  if (!cryptoAvailable()) throw new Error('WebCrypto unavailable');
  if (!validEnvelope(envelope)) throw new Error('no sealed payload');
  if (!password) return null;

  const enc = new TextEncoder();
  const salt = b64ToBytes(envelope.kdf.salt);
  const iv = b64ToBytes(envelope.iv);
  const ct = b64ToBytes(envelope.ct);
  const iterations = +envelope.kdf.iterations;
  const hash = envelope.kdf.hash || 'SHA-256';
  const tagLength = +envelope.tagBits || 128;

  // The KDF header, authenticated. Byte-identical to the string the build
  // script signed — change one and the other must change with it.
  const aad = enc.encode(`${AAD_PREFIX}|${envelope.kdf.salt}|${iterations}`);

  const material = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength, additionalData: aad }, key, ct
    );
  } catch {
    // OperationError: the tag did not verify. Wrong password, or a tampered
    // envelope. There is deliberately no way to tell those two apart.
    return null;
  }

  let doc;
  try { doc = JSON.parse(new TextDecoder().decode(plain)); }
  catch { return null; }

  const tools = (doc && Array.isArray(doc.tools) ? doc.tools : [])
    .filter((t) => t && t.slug && t.label && t.url);
  return tools.length ? { tools } : null;
}

/* ── session persistence ──────────────────────────────────────────────────────
 * The decrypted list is kept in sessionStorage for the life of the TAB, so a
 * reload does not re-prompt and does not re-run 600,000 iterations of PBKDF2 on
 * a store iPad. It is plaintext there, deliberately: anyone who can read this
 * tab's sessionStorage is already looking at the unlocked page. It dies with
 * the tab, and it is never written to localStorage, to a cookie, or to disk.
 * ────────────────────────────────────────────────────────────────────────── */

export function remember(payload) {
  try {
    sessionStorage.setItem(SESSION_PAYLOAD, JSON.stringify(payload));
    sessionStorage.setItem(SESSION_FLAG, '1');
  } catch { /* private mode: the unlock simply does not survive a reload */ }
}

/** @returns {{tools: object[]}|null} */
export function restore() {
  try {
    if (sessionStorage.getItem(SESSION_FLAG) !== '1') return null;
    const raw = sessionStorage.getItem(SESSION_PAYLOAD);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    const tools = (doc && Array.isArray(doc.tools) ? doc.tools : [])
      .filter((t) => t && t.slug && t.label && t.url);
    return tools.length ? { tools } : null;
  } catch { return null; }
}

export function forget() {
  try {
    sessionStorage.removeItem(SESSION_PAYLOAD);
    sessionStorage.removeItem(SESSION_FLAG);
  } catch { /* noop */ }
}
