




export const SESSION_FLAG = 'c3f-unlocked';
export const SESSION_PAYLOAD = 'c3f-cold';

const AAD_PREFIX = 'ccc-freezer/v1';

 
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



export function cryptoAvailable() {
  return !!(globalThis.crypto && globalThis.crypto.subtle && typeof atob === 'function');
}



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
    
    
    return null;
  }

  let doc;
  try { doc = JSON.parse(new TextDecoder().decode(plain)); }
  catch { return null; }

  const tools = (doc && Array.isArray(doc.tools) ? doc.tools : [])
    .filter((t) => t && t.slug && t.label && t.url);
  return tools.length ? { tools } : null;
}




export function remember(payload) {
  try {
    sessionStorage.setItem(SESSION_PAYLOAD, JSON.stringify(payload));
    sessionStorage.setItem(SESSION_FLAG, '1');
  } catch {   }
}

 
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
  } catch {   }
}
