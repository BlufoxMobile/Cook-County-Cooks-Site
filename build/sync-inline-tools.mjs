#!/usr/bin/env node
/* =============================================================================
 * Cook County Cooks — build/sync-inline-tools.mjs
 *
 * index.html carries an inline copy of data/tools.json on window.__CCC_INLINE__
 * so the page boots over file:// — a fetch() to a file:// URL is CORS-blocked,
 * and Jeff and the district managers review builds straight off a USB stick.
 *
 * app.js PREFERS that inline copy over the network fetch. So when the two drift,
 * the site silently renders the STALE one and every symptom points somewhere
 * else. It has now bitten twice: most recently when two tools swapped rooms and
 * the rail, the ink labels and the C³ menu all kept showing the old assignment
 * while data/tools.json was already correct.
 *
 * This step rewrites the inline block from the file on every build. Nobody
 * hand-edits it, and the two cannot diverge.
 *
 * IT ALSO REWRITES THE <noscript> INDEX, for exactly the same reason.
 *   The <noscript> block at the foot of index.html is the plain-links floor: it
 *   is what a rep gets when JavaScript is off AND — since app.js grew its
 *   module-failure fallback — when a module fails to load at all. It was
 *   hand-maintained, and on 2026-08-31 it had drifted to 23 links against 24 in
 *   tools.json: `rep-hourly-rate` and `training-pos` were MISSING, four tools
 *   were filed under the wrong room, and a dead `tools/employee-of-week` link
 *   was still there. A drifted floor is a rep who cannot reach a tool on the one
 *   occasion the pretty version already failed them.
 *
 *   So it is generated here from the SAME parsed tools.json, grouped by the SAME
 *   ROOM_ORDER the cinema and the pocket list walk. The markup and the copy
 *   around it are reproduced exactly as they were written, so the diff on any
 *   future run is data and nothing else.
 * ========================================================================== */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = resolve(ROOT, 'index.html');

// Compact for the same reason the head-chef block below is compacted: this is
// spliced into a one-key-per-line object literal in index.html.
const toolsDoc = JSON.parse(readFileSync(resolve(ROOT, 'data', 'tools.json'), 'utf8'));
const tools = JSON.stringify(toolsDoc);

let html = readFileSync(htmlPath, 'utf8');

/* ---------------------------------------------------------------------------
 * REWRITE THE WHOLE BOOTSTRAP OBJECT, NOT ONE VALUE.
 *
 * The earlier version spliced `tools:` by index and `headchefs:` up to the next
 * newline. That is only safe while every value is a single line — and the
 * moment build/pull-headchefs.mjs started writing headchefs.json pretty-printed,
 * the splice left the tail of the old value stranded in the file as loose JSON.
 * The page died with "Unexpected string" and the chef wall rendered from a
 * truncated object, which is exactly the class of silent drift this script was
 * written to end. So: find the object, brace-match its end, and emit it whole.
 *
 * Three keys, ONE LINE EACH, `freezer:` above `headchefs:` — build/seal-freezer.mjs
 * anchors on /^\s*freezer:/ and /^\s*headchefs:/ to place the sealed envelope,
 * and flattening these onto one line breaks the seal. Every value is
 * re-serialised compact, whatever its file looks like on disk.
 * ------------------------------------------------------------------------- */
const OPEN = 'window.__CCC_INLINE__ = {';
const objStart = html.indexOf(OPEN);
if (objStart < 0) {
  console.error('sync-inline-tools: could not find the inline bootstrap in index.html');
  process.exit(1);
}
let depth = 0, objEnd = -1;
for (let k = objStart + OPEN.length - 1; k < html.length; k++) {
  const ch = html[k];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { objEnd = k + 1; break; } }
}
if (objEnd < 0) {
  console.error('sync-inline-tools: the inline bootstrap object is unterminated.');
  process.exit(1);
}

/* Carry the sealed envelope through untouched. This script runs BEFORE
 * seal-freezer in build.mjs, which will rewrite the line anyway — but running
 * this script on its own must not silently drop the freezer. */
const freezerLine = (html.slice(objStart, objEnd).match(/^[ \t]*freezer:[ \t]*(\{.*?\})\s*,?\s*$/m) || [])[1] || null;

const indent = (html.slice(0, objStart).match(/\n([ \t]*)$/) || [, '    '])[1];
const pad = indent + '  ';

const chefsPath = resolve(ROOT, 'headchefs', 'headchefs.json');
let chefCount = null, chefsJson = null;
if (existsSync(chefsPath)) {
  const parsed = JSON.parse(readFileSync(chefsPath, 'utf8'));  // fail loudly on malformed JSON
  chefsJson = JSON.stringify(parsed);
  chefCount = Array.isArray(parsed.headchefs) ? parsed.headchefs.length : 0;
} else {
  // Keep whatever is already inline rather than emitting a bootstrap with no chefs.
  chefsJson = (html.slice(objStart, objEnd).match(/^[ \t]*headchefs:[ \t]*(\{.*?\})\s*,?\s*$/m) || [])[1] || null;
}

const lines = [`${pad}tools: ${tools}`];
if (freezerLine) lines.push(`${pad}freezer: ${freezerLine}`);
if (chefsJson)   lines.push(`${pad}headchefs: ${chefsJson}`);

const rebuilt = `${OPEN}\n${lines.join(',\n')}\n${indent}}`;
let next = html.slice(0, objStart) + rebuilt + html.slice(objEnd);

/* ---------------------------------------------------------------------------
 * THE <noscript> INDEX — REGENERATED, NOT HAND-MAINTAINED.
 *
 * WHAT IS REGENERATED AND WHAT IS NOT.
 *   Only the run of `<h3>room</h3><ul>…links…</ul>` blocks is rewritten: from
 *   the FIRST <h3> inside the <noscript> to the LAST </ul>. The heading, the
 *   "needs JavaScript" sentence above it and the Walk-In sentence below it are
 *   prose, they are not derived from anything, and they are left byte-for-byte
 *   alone. The generated span is the part that can drift, and it is the only
 *   part this touches.
 *
 * THE ORDER IS ROOM_ORDER, read from assets/roomorder.js — the single
 *   definition the cinema and the pocket list both walk (rooms.js re-exports
 *   it). Rooms that appear in tools.json but not in ROOM_ORDER are appended,
 *   which is exactly what pocket.js does, so a new room cannot silently fall
 *   off the plain-links floor either.
 *
 *   That is a file in this repo, not a tool on a machine, so it cannot rot the
 *   way the workflow's ImageMagick precondition did. But if it ever cannot be
 *   read, this falls back to the order the rooms are written in tools.json
 *   (identical today) and warns, rather than failing a build over a list order.
 *
 * THE WALK-IN IS NOT IN HERE, and that is load-bearing. The manager tools
 *   live encrypted in data/freezer.sealed.json and are never in tools.json;
 *   the `freezer` room is skipped explicitly as well, so a manager tool that
 *   ever did land in tools.json by mistake still could not leak into a block
 *   that is served to everybody in plain text.
 * ------------------------------------------------------------------------- */

/** Text -> HTML. `&#x27;` for the apostrophe, matching the block as written. */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

/** An off-site tool opens in a new tab; the two in-repo sub-apps do not. */
const isExternal = (url) => /^[a-z][a-z0-9+.\-]*:/i.test(url) || url.startsWith('//');

/**
 * ROOM_ORDER, lifted out of assets/roomorder.js as text.
 *
 * Not `await import()`: this repo has no package.json on purpose (no npm, no
 * build tooling), so importing a bare .js file makes Node print a four-line
 * MODULE_TYPELESS_PACKAGE_JSON warning on every single build — noise in a log
 * whose whole job is to be read. The array is one line of literals; reading it
 * is a two-line regex and costs nothing. assets/roomorder.js is still the ONE
 * definition — this only reads it.
 */
function readRoomOrder() {
  try {
    const src = readFileSync(resolve(ROOT, 'assets', 'roomorder.js'), 'utf8');
    const m = /export\s+const\s+ROOM_ORDER\s*=\s*\[([^\]]*)\]/.exec(src);
    if (!m) throw new Error('no `export const ROOM_ORDER = [...]` in the file');
    const ids = m[1].match(/['"]([^'"]+)['"]/g);
    if (!ids || !ids.length) throw new Error('ROOM_ORDER parsed as empty');
    return ids.map((q) => q.slice(1, -1));
  } catch (err) {
    console.warn(`! sync-inline-tools: could not read ROOM_ORDER from assets/roomorder.js ` +
                 `(${err.message}); falling back to the room order in data/tools.json.`);
    return [];
  }
}
const ROOM_ORDER = readRoomOrder();

const roomsById = new Map((toolsDoc.rooms || []).map((r) => [r.id, r]));
const roomSpine = [
  ...ROOM_ORDER.filter((id) => roomsById.has(id)),
  ...[...roomsById.keys()].filter((id) => !ROOM_ORDER.includes(id))
];

const NO_OPEN = '<noscript>';
const nsStart = next.indexOf(NO_OPEN, next.indexOf('<footer id="site-footer">'));
const nsEnd = nsStart < 0 ? -1 : next.indexOf('</noscript>', nsStart);
if (nsStart < 0 || nsEnd < 0) {
  console.error('sync-inline-tools: could not find the <noscript> tool index in index.html.');
  process.exit(1);
}
const block = next.slice(nsStart, nsEnd);
const h3At = block.indexOf('<h3>');
const ulAt = block.lastIndexOf('</ul>');
if (h3At < 0 || ulAt < 0 || ulAt < h3At) {
  console.error('sync-inline-tools: the <noscript> index has no <h3>…</ul> list to regenerate.');
  process.exit(1);
}

// Indentation is taken from the block as it stands, so the generated markup
// keeps whatever shape index.html is formatted with.
const h3Indent = (block.slice(0, h3At).match(/\n([ \t]*)$/) || [, '        '])[1];
const liIndent = h3Indent + '  ';

const nsLines = [];
let linkCount = 0;
for (const id of roomSpine) {
  if (id === 'freezer') continue;                       // sealed; see above
  const roomTools = (toolsDoc.tools || []).filter((t) => t.room === id);
  if (!roomTools.length) continue;                      // no empty headings
  nsLines.push(`${h3Indent}<h3>${esc(roomsById.get(id).label)}</h3>`);
  nsLines.push(`${h3Indent}<ul>`);
  for (const t of roomTools) {
    const attrs = isExternal(t.url) ? ' target="_blank" rel="noopener noreferrer"' : '';
    nsLines.push(`${liIndent}<li><a href="${esc(t.url)}"${attrs}>${esc(t.label)}</a></li>`);
    linkCount++;
  }
  nsLines.push(`${h3Indent}</ul>`);
}

const n = toolsDoc.tools.length;

// EVERY tool in tools.json must reach the floor, and this is checked BEFORE
// anything is written — a short list must not be committed and then complained
// about. The only way to be short is a tool filed into a room that is skipped
// (freezer) or into a room id that is not in tools.json's own rooms[]: the
// first would be a manager tool about to be published in plain text, the second
// a tool that is unreachable in the cinema too. Both are data errors.
if (linkCount !== n) {
  console.error(`sync-inline-tools: ${n} tools in data/tools.json but only ${linkCount} ` +
                `reached the <noscript> index — a tool is filed under a room that is ` +
                `skipped (freezer) or missing from data/tools.json's rooms[]. ` +
                `index.html was NOT written.`);
  process.exit(1);
}

let nextBlock = block.slice(0, h3At) + nsLines.join('\n').slice(h3Indent.length) +
                  block.slice(ulAt + '</ul>'.length);

/* ---------------------------------------------------------------------------
 * THE WALK-IN SENTENCE'S NUMBER — DERIVED, NOT TYPED.
 *
 * "The Walk-In Freezer holds N manager tools behind a keypad" was a literal,
 * and it drifted: it said 14 while the sealed envelope held 13 and the rail
 * chip, the C³ menu and the phone list all said 13 (links audit, 2026-09-24).
 *
 * The number comes from the sealed envelope's PUBLIC `count` field — the same
 * field every other surface reads. Nothing is decrypted and nothing but that
 * integer is read: the envelope is parsed only to find it, first from the
 * inline `freezer:` line carried through above, then from
 * data/freezer.sealed.json. If neither has a usable count the sentence is left
 * exactly as it is, with a warning: a missing count must not fail a build or
 * invent a number.
 * ------------------------------------------------------------------------- */
function sealedCount() {
  const pick = (json) => {
    try {
      const n = JSON.parse(json).count;
      return Number.isInteger(n) && n >= 0 ? n : null;
    } catch { return null; }
  };
  let n = freezerLine ? pick(freezerLine) : null;
  if (n === null) {
    const f = resolve(ROOT, 'data', 'freezer.sealed.json');
    if (existsSync(f)) n = pick(readFileSync(f, 'utf8'));
  }
  return n;
}
const WALKIN_RE = /(The Walk-In Freezer holds )(\d+)( manager tools?)/;
const walkInCount = sealedCount();
let walkInNote = '';
if (walkInCount === null) {
  console.warn('! sync-inline-tools: no usable `count` in the sealed envelope; ' +
               'the <noscript> Walk-In sentence was left as it is.');
} else if (!WALKIN_RE.test(nextBlock)) {
  console.warn('! sync-inline-tools: the <noscript> Walk-In sentence was not found; nothing to update.');
} else {
  nextBlock = nextBlock.replace(WALKIN_RE,
    (_m, a, _n, b) => a + walkInCount + (walkInCount === 1 ? b.replace(/s$/, '') : b.replace(/tool$/, 'tools')));
  walkInNote = ` · Walk-In sentence: ${walkInCount} (from the sealed envelope's count)`;
}
const noscriptChanged = nextBlock !== block;
next = next.slice(0, nsStart) + nextBlock + next.slice(nsEnd);

if (next !== html) writeFileSync(htmlPath, next);

console.log(`inline bootstrap: ${n} tools synced from data/tools.json${next === html ? ' (already current)' : ''}`);
if (chefCount !== null) console.log(`inline bootstrap: ${chefCount} head chefs synced from headchefs/headchefs.json`);
console.log(`noscript index:   ${linkCount} links in ${nsLines.filter((l) => l.includes('<h3>')).length} rooms` +
            `${noscriptChanged ? ' (rewritten)' : ' (already current)'}${walkInNote}`);
