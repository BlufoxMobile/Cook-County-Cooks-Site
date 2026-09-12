#!/usr/bin/env node
/* =============================================================================
 * Cook County Cooks — build/unseal-freezer.mjs
 * OPEN THE WALK-IN, ON PURPOSE
 * -----------------------------------------------------------------------------
 * The missing counterpart to seal-freezer.mjs.
 *
 * WHY THIS EXISTS
 *   seal-freezer.mjs is one-way: it reads a plaintext list from OUTSIDE the repo
 *   and writes ciphertext in. That is the right shape for a build step, but it
 *   means the plaintext is the only editable copy of the thirteen manager tools —
 *   and on 2026-09-12 that copy was found to be GONE from the working machine.
 *   The sealed blob was the only surviving record, and nothing could read it back
 *   except the browser keypad. One broken URL was therefore unfixable.
 *
 *   This script closes that hole. It decrypts data/freezer.sealed.json with the
 *   same password the keypad takes and restores the plaintext to its canonical
 *   home, so the normal edit-then-reseal loop works again.
 *
 * USE
 *     FREEZER_PASSWORD='…' node build/unseal-freezer.mjs
 *     # edit ../ccc-build/secret/freezer-tools.json
 *     FREEZER_PASSWORD='…' node build/build.mjs      # re-seal + re-fingerprint
 *
 *   --in     envelope to read      (default data/freezer.sealed.json)
 *   --out    plaintext to write    (default ../ccc-build/secret/freezer-tools.json)
 *   --force  overwrite an existing plaintext (refused otherwise, so a good local
 *            copy is never clobbered by a stale decrypt)
 *   --print  list slugs on stdout. URLs are NEVER printed — this runs in shells
 *            whose scrollback and logs outlive the session.
 *
 * THE CRYPTO IS NOT RE-DESIGNED HERE
 *   Every parameter is read from the envelope rather than assumed, and the AAD
 *   string is rebuilt byte-identically to the one seal-freezer.mjs signed:
 *       ccc-freezer/v1|<salt b64>|<iterations>
 *   If that string drifts, decryption fails closed. See assets/coldstore.js
 *   unseal(), which this mirrors exactly — the browser and the build step must
 *   agree or the keypad stops opening.
 *
 * A WRONG PASSWORD YIELDS NOTHING
 *   AES-GCM is authenticated. A bad password fails the tag check and produces no
 *   plaintext, no partial, no length hint. This script exits 1 and says so; it
 *   deliberately cannot tell a wrong password from a tampered envelope.
 *
 * THE PASSWORD IS NEVER WRITTEN, ECHOED OR LOGGED. It is read from the
 * environment, used to derive a key, and dropped.
 * ========================================================================== */

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AAD_PREFIX = 'ccc-freezer/v1';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const IN  = resolve(ROOT, arg('in',  'data/freezer.sealed.json'));
const OUT = resolve(ROOT, arg('out', '../ccc-build/secret/freezer-tools.json'));
const PASSWORD = process.env.FREEZER_PASSWORD || '';

if (!PASSWORD) {
  console.error('unseal-freezer: no password. Set FREEZER_PASSWORD in the environment.');
  console.error('  (deliberately not a --password flag: that lands in shell history)');
  process.exit(1);
}
if (existsSync(OUT) && !has('force')) {
  console.error(`unseal-freezer: ${OUT} already exists. Refusing to overwrite.`);
  console.error('  Pass --force only if you are sure the sealed copy is the newer one.');
  process.exit(1);
}

let env;
try { env = JSON.parse(readFileSync(IN, 'utf8')); }
catch (err) {
  console.error(`unseal-freezer: could not read the envelope at ${IN}\n  ${err.message}`);
  process.exit(1);
}
if (!env || !env.kdf || !env.kdf.salt || !env.iv || !env.ct) {
  console.error('unseal-freezer: that file is not a sealed envelope.');
  process.exit(1);
}

const enc = new TextEncoder();
const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

const iterations = +env.kdf.iterations;
const hash = env.kdf.hash || 'SHA-256';
const tagLength = +env.tagBits || 128;
const aad = enc.encode(`${AAD_PREFIX}|${env.kdf.salt}|${iterations}`);

const material = await crypto.subtle.importKey(
  'raw', enc.encode(PASSWORD), 'PBKDF2', false, ['deriveKey']
);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt: b64(env.kdf.salt), iterations, hash },
  material,
  { name: 'AES-GCM', length: 256 },
  false,
  ['decrypt']
);

let plain;
try {
  plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64(env.iv), tagLength, additionalData: aad },
    key,
    b64(env.ct)
  );
} catch {
  console.error('unseal-freezer: the tag did not verify — wrong password, or the');
  console.error('  envelope has been altered. There is no way to tell which.');
  process.exit(1);
}

let doc;
try { doc = JSON.parse(new TextDecoder().decode(plain)); }
catch (err) {
  console.error(`unseal-freezer: decrypted, but the payload is not JSON\n  ${err.message}`);
  process.exit(1);
}
const tools = Array.isArray(doc?.tools) ? doc.tools : [];
if (!tools.length) {
  console.error('unseal-freezer: decrypted, but there are no tools inside.');
  process.exit(1);
}
if (env.count !== undefined && +env.count !== tools.length) {
  console.error(`unseal-freezer: envelope says count=${env.count} but ${tools.length} decrypted. Refusing.`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true, mode: 0o700 });
writeFileSync(
  OUT,
  JSON.stringify({
    _note: 'PLAINTEXT — never commit this, never move it inside the repo. Restored by build/unseal-freezer.mjs. Edit here, then re-seal with build/build.mjs.',
    tools
  }, null, 2) + '\n',
  { mode: 0o600 }
);

console.log(`unseal-freezer: restored ${tools.length} manager tools -> ${OUT}`);
if (has('print')) for (const t of tools) console.log(`  ${t.slug}`);
console.log('next: edit that file, then  FREEZER_PASSWORD=… node build/build.mjs');
