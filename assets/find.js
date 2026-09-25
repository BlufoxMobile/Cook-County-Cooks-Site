/* =============================================================================
 * Cook County Cooks — assets/find.js
 * FIND A TOOL  ·  one matcher, one list, every screen
 * -----------------------------------------------------------------------------
 * Jeff, on what the site has to be: "I want this to be something that a new
 * hire could look at day one and understand." He chose "Search everywhere" for
 * that, and explicitly NOT a welcome tour. So this module is the one place a
 * rep who only knows "the DSR" or "the t-sheet thing" can type what they know
 * and get the tool — from the hero, from any room, from inside another tool.
 *
 * WHAT IT EXPORTS
 *   buildIndex(tools, rooms)        -> index   (pure; no DOM)
 *   query(index, text, {recent})    -> [{tool, entry, score, hits}]
 *   queryRoom(index, text)          -> the room a query names, or null
 *   roomNamed(index, text)          -> the room whose name the query IS, or null
 *   touchesFreezer(index, text)     -> does the query reach for the walk-in?
 *   readRecent() / rememberRecent() -> the per-viewer "Recent" list
 *   mountFind(opts)                 -> the palette, its triggers and hotkeys
 *
 * THE ONE-LIST RULE STILL HOLDS. The index is built from the SAME array the
 * cinema and the pocket list render from (window.__CCC_INLINE__.tools, via
 * their own indexTools()), handed in by reference. There is no second list, no
 * fetch, and no tool, URL or room named anywhere in this file. Aliases live in
 * the tool list itself, as an optional `aliases` array on a tool or a room, so
 * Jeff adds shorthand where he adds tools.
 *
 * THE FREEZER. While the walk-in is sealed the array holds no freezer tools at
 * all — they are ciphertext until a code decrypts them — so the index cannot
 * contain them and no query can surface a name. mountFind re-indexes on
 * unlock. Recents never store a freezer slug. A locked query that reaches for
 * the walk-in gets one row, "Manager tools — enter code", that opens the
 * keypad through the existing delegated [data-freezer-lock] handler.
 *
 * ROWS ARE LINKS. A result is `a.find-row[href="#/tool/<slug>"][data-tool]`,
 * exactly the shape of a pocket row, so overlay.js's delegated [data-tool]
 * handler opens it, pushes the history entry, and — when the viewer is already
 * up — swaps the tool. The palette closes instantly on a choice so the viewer's
 * own motion is the only motion.
 *
 * Plain ES module. No build step, no dependencies beyond dom.js/roomorder.js.
 * ========================================================================== */

import { el, fill } from './dom.js';
import { ROOM_ORDER } from './roomorder.js';


/* ─────────────────────────────────────────────────────────────────────────────
 * 1 · NORMALISATION
 *
 * fold()     lower-case, compatibility-decomposed, accents stripped. NFKD (not
 *            NFD) so the superscript in "C³" folds to a plain 3: "c3" finds the
 *            arcade.
 * compact()  fold() with every non-alphanumeric removed, so "t-sheet",
 *            "t sheet" and "tsheet" are one string, and "6th gen" = "6thgen".
 * ────────────────────────────────────────────────────────────────────────── */

export function fold(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function compact(s) {
  return fold(s).replace(/[^a-z0-9]+/g, '');
}

/** Words of a phrase, compacted, plus each whitespace chunk joined: "T-Sheet
 *  Submissions" -> t, sheet, tsheet, submissions. */
function wordsOf(s) {
  const out = new Set();
  for (const chunk of fold(s).split(/\s+/)) {
    if (!chunk) continue;
    const parts = chunk.split(/[^a-z0-9]+/).filter(Boolean);
    for (const p of parts) out.add(p);
    if (parts.length > 1) out.add(parts.join(''));
  }
  return [...out];
}

/** The compact form of a label, with a map back to the original characters so
 *  a matched run can be highlighted in the text the rep actually reads. */
function compactMap(label) {
  let c = '';
  const map = [];
  const starts = new Set();
  let idx = 0;
  let prevAlnum = false;
  for (const ch of Array.from(String(label))) {
    const f = fold(ch).replace(/[^a-z0-9]/g, '');
    for (let k = 0; k < f.length; k++) {
      if (k === 0 && !prevAlnum) starts.add(c.length);
      c += f[k];
      map.push([idx, idx + ch.length]);
    }
    prevAlnum = f.length > 0;
    idx += ch.length;
  }
  return { c, map, starts };
}

/* Words that carry no meaning on their own. Dropped from a query that has
   other words ("the pass" -> "pass"); kept when they are the whole query. */
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'for', 'in', 'on', 'my', 'i', 'at']);

function tokenize(text) {
  const raw = fold(text).split(/\s+/).map((t) => t.replace(/[^a-z0-9]+/g, '')).filter(Boolean);
  const meaningful = raw.filter((t) => !STOP.has(t));
  return meaningful.length ? meaningful : raw;
}

function aliasList(list) {
  return (Array.isArray(list) ? list : [])
    .map((a) => ({ c: compact(a), words: wordsOf(a) }))
    .filter((a) => a.c);
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · THE INDEX
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * @param {Array} tools   the live tools array (public, plus freezer once open)
 * @param {Array} rooms   the rooms array from the same document
 * @param {{roomOrder?: string[]}} [opts]
 */
export function buildIndex(tools, rooms, opts = {}) {
  const order = [...(opts.roomOrder || ROOM_ORDER)];
  for (const r of rooms || []) if (r && r.id && !order.includes(r.id)) order.push(r.id);

  const roomMap = new Map();
  const addRoom = (r) => {
    const label = r.label || r.id;
    const short = r.short || label;
    roomMap.set(r.id, {
      id: r.id, label, short,
      lc: compact(label), sc: compact(short),
      words: wordsOf(`${label} ${short}`),
      aliases: aliasList(r.aliases),
      order: order.indexOf(r.id) === -1 ? order.length : order.indexOf(r.id)
    });
  };
  for (const r of rooms || []) if (r && r.id) addRoom(r);

  const entries = [];
  for (const tool of tools || []) {
    if (!tool || !tool.slug || !tool.label) continue;
    if (!roomMap.has(tool.room)) {
      if (!order.includes(tool.room)) order.push(tool.room);
      addRoom({ id: tool.room || 'other', label: tool.room || 'Other' });
    }
    const { c, map, starts } = compactMap(tool.label);
    entries.push({
      tool,
      slug: String(tool.slug),
      key: String(tool.slug).toLowerCase(),
      label: String(tool.label),
      room: roomMap.get(tool.room),
      frozen: tool.room === 'freezer',
      lc: c, map, starts,
      lwords: wordsOf(tool.label),
      aliases: aliasList(tool.aliases),
      bwords: wordsOf(tool.blurb || '')
    });
  }
  for (const e of entries) {
    e.typoWords = [...e.lwords, ...e.aliases.map((a) => a.c), ...e.aliases.flatMap((a) => a.words)]
      .filter((w) => w.length >= 3);
  }

  return {
    entries,
    rooms: roomMap,
    order,
    bySlug: new Map(entries.map((e) => [e.key, e]))
  };
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 3 · MATCHING AND RANKING  (≈40 tools, synchronous, no debounce)
 *
 * Every token must match (AND). Each token scores its BEST match below, and a
 * tool's score is the sum over tokens:
 *
 *     alias exact, the tool's FIRST alias      100
 *     alias exact, any later alias              95
 *       … +10 when the token also starts a word of the label: a label beats
 *       an alias-only match, so "arcade" ranks C³ Arcade above the five games
 *       that merely carry the word (v29 fix round, G2 M2). The first-alias
 *       rule is the data convention: a tool lists its most characteristic
 *       word first, so "games" ranks the arcade (["games", …]) above the games
 *       themselves (["fox run", "games", …]).
 *     label compact-prefix                      70
 *     label word-prefix                         55
 *     alias prefix (whole or word)              45
 *     label contains                            35
 *     one-edit typo, token ≥ 4, vs words/aliases 30  (only if nothing matches
 *                                                    without one)
 *     alias contains                            25
 *     room label / short / alias                20   ("office" lists the room)
 *     blurb word-prefix, token ≥ 3               8
 *
 * A multi-word query that IS an alias ("quote sheet") earns +100 on top.
 * Ties: recent use, then room order, then label. Blurbs are searched but never
 * displayed — Jeff removed descriptions under titles; a row is name + room.
 * ────────────────────────────────────────────────────────────────────────── */

/** True if a and b are at most one edit apart (insert, delete, substitute, or
 *  swap two neighbours). */
function oneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function typoHit(c, words) {
  if (c.length < 4) return false;
  for (const w of words) {
    if (oneEdit(c, w)) return true;
    // a word still being typed: compare against the word's own prefixes
    for (let L = c.length - 1; L <= c.length + 1; L++) {
      if (L >= 3 && L < w.length && oneEdit(c, w.slice(0, L))) return true;
    }
  }
  return false;
}

function roomHit(r, c) {
  if (!r) return false;
  if (r.lc.startsWith(c) || r.sc.startsWith(c)) return true;
  if (r.words.some((w) => w.startsWith(c))) return true;
  return r.aliases.some((a) => a.c.startsWith(c) || a.words.some((w) => w.startsWith(c)));
}

const TYPO = 30;
const ALIAS_FIRST = 100;
const ALIAS_OTHER = 95;
const LABEL_BONUS = 10;

function scoreToken(e, c) {
  let best = 0;
  if (e.lc.startsWith(c)) best = 70;
  else if (e.lwords.some((w) => w.startsWith(c))) best = 55;
  const ai = e.aliases.findIndex((a) => a.c === c);
  if (ai !== -1) return (ai === 0 ? ALIAS_FIRST : ALIAS_OTHER) + (best ? LABEL_BONUS : 0);
  if (best >= 45) return best;
  // The walk-in's words ("code", "lock"…) reach a tool only through a label
  // or an exact alias, never as a PART of a longer alias: "code" is the
  // freezer's, not the "qr code" sheet's. A phrase that IS an alias still
  // finds its tool whole (see query()).
  if (LOCK_WEAK.includes(c)) return 0;
  if (e.aliases.some((a) => a.c.startsWith(c) || a.words.some((w) => w.startsWith(c)))) return 45;
  if (e.lc.includes(c)) return 35;
  if (typoHit(c, e.typoWords)) return TYPO;
  if (e.aliases.some((a) => a.c.includes(c))) return 25;
  if (roomHit(e.room, c)) return 20;
  if (c.length >= 3 && e.bwords.some((w) => w.startsWith(c))) return 8;
  return 0;
}

/** Where each token sits in the label, as [start, end) ranges of the ORIGINAL
 *  string, preferring an occurrence at the start of a word. */
function hitRanges(e, toks) {
  const ranges = [];
  for (const c of toks) {
    let pos = -1;
    for (let i = e.lc.indexOf(c); i !== -1; i = e.lc.indexOf(c, i + 1)) {
      if (e.starts.has(i)) { pos = i; break; }
      if (pos === -1) pos = i;
    }
    if (pos === -1) continue;
    ranges.push([e.map[pos][0], e.map[pos + c.length - 1][1]]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/**
 * @param {object} index  from buildIndex()
 * @param {string} text   what the rep typed
 * @param {{recent?: string[]}} [opts]
 * @returns {Array<{tool:object, entry:object, score:number, hits:Array}>}
 */
export function query(index, text, opts = {}) {
  const toks = tokenize(text);
  if (!index || !toks.length) return [];
  const whole = compact(text);
  const recent = (opts.recent || []).map((s) => String(s).toLowerCase());
  const recentRank = (e) => { const i = recent.indexOf(e.key); return i === -1 ? 99 : i; };

  let out = [];
  for (const e of index.entries) {
    let score = 0;
    let ok = true;
    let typo = false;
    for (const c of toks) {
      const s = scoreToken(e, c);
      if (!s) { ok = false; break; }
      if (s === TYPO) typo = true;
      score += s;
    }
    const phrase = toks.length > 1 && e.aliases.some((a) => a.c === whole);
    // A query that IS one of the tool's aliases matches it outright, even
    // when a word of it would not match on its own ("qr code").
    if (!ok && phrase) { ok = true; typo = false; score = ALIAS_FIRST; }
    if (!ok) continue;
    if (phrase) score += 100;
    out.push({ tool: e.tool, entry: e, score, hits: hitRanges(e, toks), typo });
  }
  // A typo is a rescue, not a rival: "print" must not also list Celestial
  // *Point*, but "comission" must still find Commission Payouts.
  if (out.some((r) => !r.typo)) out = out.filter((r) => !r.typo);
  out.sort((a, b) =>
    (b.score - a.score) ||
    (recentRank(a.entry) - recentRank(b.entry)) ||
    (a.entry.room.order - b.entry.room.order) ||
    a.entry.label.localeCompare(b.entry.label));
  return out;
}

/** The room whose NAME the query is — its label or short name, exactly
 *  ("break room", "office", "the pass") — or null. Aliases do not count: they
 *  are category words ("games", "training", "numbers") where a tool is the
 *  better first answer. The palette puts this room's row FIRST, so Enter on
 *  "break room" goes to the Break Room (v29 fix round, G2 M2). */
export function roomNamed(index, text) {
  if (!index) return null;
  const w = compact(text);
  if (w.length < 3) return null;
  for (const r of index.rooms.values()) if (r.lc === w || r.sc === w) return r;
  return null;
}

/** The one room a query names — exactly, or as an unambiguous prefix of 3+
 *  characters — for the "Go to <Room> →" row. */
export function queryRoom(index, text) {
  if (!index) return null;
  const w = compact(text);
  if (w.length < 3 || STOP.has(w)) return null;
  const rooms = [...index.rooms.values()];
  const exact = rooms.find((r) => r.lc === w || r.sc === w || r.aliases.some((a) => a.c === w));
  if (exact) return exact;
  const pre = rooms.filter((r) =>
    r.lc.startsWith(w) || r.sc.startsWith(w) ||
    r.words.some((x) => x.length >= 3 && x.startsWith(w)) ||
    r.aliases.some((a) => a.c.startsWith(w)));
  return pre.length === 1 ? pre[0] : null;
}

/* Words that reach for the walk-in without naming anything inside it. The
   STRONG ones only ever mean the walk-in. The WEAK ones mean it only when
   nothing else answers: "locked out" is the BP access tool, not a manager
   tool, and a new hire should not be sent to a keypad for it (v29 fix round,
   G2 M3). */
const LOCK_STRONG = ['keypad', 'manager', 'managers', 'walkin', 'freezer'];
const LOCK_WEAK = ['lock', 'locked', 'unlock', 'code', 'codes', 'enter', 'door', 'password'];

/** Does this query reach for the walk-in? Matches the room's own label, short
 *  name and aliases plus a few lock words — never anything about its tools.
 *  Weak lock words ("code", "unlock", "enter code") count only when the query
 *  is made of nothing else and — pass the query's `results` — no tool
 *  answered: "promo code" and "locked out" are not the walk-in. */
export function touchesFreezer(index, text, results = null) {
  const strong = new Set(LOCK_STRONG);
  const room = index && index.rooms.get('freezer');
  if (room) {
    strong.add(room.lc); strong.add(room.sc);
    for (const w of room.words) if (w.length >= 3) strong.add(w);
    for (const a of room.aliases) {
      strong.add(a.c);
      for (const w of a.words) if (w.length >= 3) strong.add(w);
    }
  }
  const hit = (terms, t) => {
    for (const term of terms) if (term === t || (t.length >= 3 && term.startsWith(t))) return true;
    return false;
  };
  const toks = tokenize(text);
  if (toks.some((t) => hit(strong, t))) return true;
  return !(results && results.length) && toks.length > 0 && toks.every((t) => hit(LOCK_WEAK, t));
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 4 · RECENT  (per viewer, this browser only)
 *
 * localStorage['ccc-find-recent'] = up to five slugs, newest first. Every read
 * and write is in try/catch (Safari private mode throws). A freezer slug is
 * never written: a shared store iPad must not show the next rep a manager
 * tool's name. Slugs the current index does not know are dropped on read.
 * ────────────────────────────────────────────────────────────────────────── */

const RECENT_KEY = 'ccc-find-recent';
const RECENT_MAX = 5;

export function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

/** Remember a slug, but only a public one the index knows. */
export function rememberRecent(index, slug) {
  if (!index || !slug) return;
  const e = index.bySlug.get(String(slug).toLowerCase());
  if (!e || e.frozen) return;
  const next = [e.slug, ...readRecent().filter((s) => {
    const x = index.bySlug.get(String(s).toLowerCase());
    return x && !x.frozen && x.key !== e.key;
  })].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage off */ }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 5 · THE PALETTE — styles
 *
 * Injected once. Every class is prefixed `find-` (theme.css has none; checked
 * with a grep). The two things outside the palette it touches are scoped to
 * `#ticket-rail.has-find` — the rail only carries that class when this module
 * put a trigger in it — and to the C³ menu's search field.
 *
 * Performance rules the whole site follows: no backdrop-filter (the scrim is a
 * flat 72% ink), transform/opacity only, nothing loops, will-change nowhere.
 * Motion tier: html[data-motion] full | lite | off, absent = full, and
 * prefers-reduced-motion always wins.
 * ────────────────────────────────────────────────────────────────────────── */

const EASE_OUT = 'var(--m-ease-out, cubic-bezier(.22,.61,.24,1))';
const EASE_IN = 'var(--m-ease-in, cubic-bezier(.5,0,.75,0))';

const CSS = `
#find-root { position: fixed; inset: 0; z-index: 9100; }
#find-root[hidden] { display: none !important; }
#find-root.is-closing { pointer-events: none; }
.find-sprite { position: absolute; inline-size: 0; block-size: 0; overflow: hidden; }
.find-scrim { position: absolute; inset: 0; background: rgb(5 7 10 / .72); touch-action: none; }

.find-panel {
  --find-row-h: 48px;
  position: absolute; inset-inline: 0; margin-inline: auto;
  inset-block-start: 12vh;
  inline-size: min(640px, calc(100vw - 32px));
  max-block-size: min(70vh, 560px);
  display: flex; flex-direction: column;
  color: var(--bone, #f4efe6);
  background: var(--ink-850, #0d131b);
  border-radius: var(--r-lg, 10px);
  box-shadow:
    inset 0 0 0 1px color-mix(in oklab, var(--bone, #f4efe6) 13%, transparent),
    inset 0 1px 0 rgb(255 255 255 / .06),
    0 30px 90px -18px rgb(3 5 9 / .8), 0 4px 18px -6px rgb(3 5 9 / .6);
  overflow: hidden;
  font-family: var(--font-text, system-ui, sans-serif);
  text-align: start;
}

.find-field {
  flex: none; position: relative;
  display: flex; align-items: center; gap: 10px;
  min-block-size: 60px; padding-inline: 16px 10px;
  border-block-end: 1px solid color-mix(in oklab, var(--brass, #c8973f) 26%, transparent);
}
.find-field:focus-within { border-block-end-color: color-mix(in oklab, var(--brass, #c8973f) 72%, transparent); }
.find-field-icon { inline-size: 20px; block-size: 20px; flex: none; color: var(--brass, #c8973f); }
.find-input {
  flex: 1 1 auto; min-inline-size: 0; block-size: 44px; margin: 0; padding: 0;
  border: 0; border-radius: 0; background: transparent; box-shadow: none;
  color: var(--bone, #f4efe6); caret-color: var(--brass-300, #ebce93);
  font: 400 17px/1.2 var(--font-text, system-ui, sans-serif); letter-spacing: .005em;
  -webkit-appearance: none; appearance: none; outline: none;
}
.find-input::placeholder { color: var(--bone-3, #b4aba0); opacity: 1; }
.find-icon-btn {
  flex: none; display: inline-grid; place-items: center;
  inline-size: 44px; block-size: 44px; margin: 0; padding: 0;
  border: 0; border-radius: var(--r-sm, 3px); background: transparent;
  color: var(--bone-3, #b4aba0); cursor: pointer; -webkit-tap-highlight-color: transparent;
  font: 600 13px/1 var(--font-text, system-ui, sans-serif);
}
.find-icon-btn:hover { color: var(--bone, #f4efe6); }
.find-icon-btn[hidden] { display: none; }
.find-close { inline-size: auto; padding-inline: 10px; color: var(--brass-300, #ebce93); }
@media (pointer: fine) { .find-close { display: none; } }

.find-scroll {
  position: relative; flex: 1 1 auto; min-block-size: 0;
  overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
  padding: 6px 8px 10px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklab, var(--brass, #c8973f) 70%, transparent) transparent;
}
.find-hl {
  position: absolute; inset-inline: 8px; inset-block-start: 0;
  block-size: var(--find-row-h); border-radius: var(--r-md, 6px);
  background: color-mix(in oklab, var(--bone, #f4efe6) 8%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--brass, #c8973f) 46%, transparent);
  opacity: 0; pointer-events: none;
  transition: transform var(--m-t-1, 90ms) ${EASE_OUT};
}
.find-hl.is-snap { transition: none; }
.find-scroll:focus-visible { outline: 2px solid var(--brass-300, #ebce93); outline-offset: -2px; }
.find-row.is-active { background: color-mix(in oklab, var(--bone, #f4efe6) 8%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--brass, #c8973f) 46%, transparent); }
.find-scroll.has-hl .find-row.is-active { background: transparent; box-shadow: none; }
.find-group + .find-group { margin-block-start: 6px; }
.find-group-head {
  display: block; padding: 12px 10px 6px;
  font: 600 11px/1 var(--font-text, system-ui, sans-serif);
  letter-spacing: var(--track-caps, .165em); text-transform: uppercase;
  color: var(--brass-400, #ddb463);
}
.find-row {
  position: relative; z-index: 1; box-sizing: border-box;
  display: flex; align-items: center; gap: 12px;
  inline-size: 100%; min-block-size: var(--find-row-h);
  margin: 0; padding: 0 12px 0 10px; border: 0; border-radius: var(--r-md, 6px);
  background: transparent; color: var(--bone, #f4efe6); text-align: start; text-decoration: none;
  font: 600 15px/1.25 var(--font-text, system-ui, sans-serif); letter-spacing: .005em;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.find-glyph { inline-size: 20px; block-size: 20px; flex: none; color: var(--brass, #c8973f); }
.find-row-name { flex: 1 1 auto; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.find-mark { background: none; color: var(--brass-300, #ebce93); padding: 0; }
.find-row-room {
  flex: none; font: 600 11px/1 var(--font-text, system-ui, sans-serif);
  letter-spacing: .12em; text-transform: uppercase; color: var(--bone-3, #b4aba0);
}
.find-row-enter { flex: none; inline-size: 1.25em; text-align: center; color: var(--brass-300, #ebce93); opacity: 0; }
@media (pointer: fine) { .find-row.is-active .find-row-enter { opacity: 1; } }
.find-row--lock, .find-row--lock .find-glyph { color: var(--ice-100, #dbe8ef); }
.find-row--lock .find-row-room { color: var(--ice-300, #9fb6c4); }
.find-row--room .find-row-name { color: var(--brass-300, #ebce93); }

.find-empty { padding: 18px 12px 8px; display: grid; gap: 10px; justify-items: start; }
.find-empty[hidden] { display: none; }
.find-empty-line {
  margin: 0; color: var(--bone-2, #dcd5c8);
  font-family: var(--font-display, Georgia, serif); font-size: 22px; line-height: 1.2; font-weight: 500;
  overflow-wrap: anywhere;
}
.find-empty-note { margin: 0; color: var(--bone-3, #b4aba0); font-size: 13px; line-height: 1.4; }
.find-browse {
  min-block-size: 44px; padding: 0 16px; margin: 0; border: 0; border-radius: var(--r-sm, 3px);
  color: var(--bone, #f4efe6); cursor: pointer;
  background: color-mix(in oklab, var(--bone, #f4efe6) 6%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--brass, #c8973f) 44%, transparent);
  font: 600 14px/1 var(--font-text, system-ui, sans-serif);
}
.find-browse:hover { background: color-mix(in oklab, var(--bone, #f4efe6) 10%, transparent); }

.find-foot {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-block-size: 40px; padding-inline: 16px;
  border-block-start: 1px solid color-mix(in oklab, var(--bone, #f4efe6) 8%, transparent);
  font: 500 12px/1 var(--font-text, system-ui, sans-serif); color: var(--bone-3, #b4aba0);
}
.find-keys { display: none; gap: 14px; align-items: center; }
@media (pointer: fine) { .find-keys { display: flex; } }
.find-kbd {
  display: inline-block; min-inline-size: 1.2em; padding: 3px 5px; margin-inline-end: 4px;
  border-radius: 3px; text-align: center;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bone, #f4efe6) 24%, transparent);
  font: 600 11px/1 var(--font-text, system-ui, sans-serif); color: var(--bone-2, #dcd5c8);
}
.find-sr { position: absolute !important; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* v29 · S6: the site's one focus ring (theme.css §16). The trigger sits on the
   open bar and takes the ring as is; inside the palette and the C³ field the
   ring is drawn inward, because both sit in boxes that clip. */
#find-root :is(button, a):focus-visible, .find-c3-input:focus-visible {
  outline: 2px solid var(--ring-halo, #ebce93); outline-offset: -2px;
  box-shadow: inset 0 0 0 5px var(--ring-core, #05070a);
}

/* iPad: wider, pinned under the chrome, and never under the keyboard. */
@media (hover: none) and (pointer: coarse) and (min-width: 561px) {
  .find-panel {
    --find-row-h: 56px;
    inline-size: min(720px, 92vw);
    inset-block-start: calc(var(--find-vvt, 0px) + env(safe-area-inset-top, 0px) + 72px);
    max-block-size: min(680px, calc(var(--find-vvh, 100vh) - env(safe-area-inset-top, 0px) - 88px));
  }
}
@media (pointer: coarse) { .find-panel { --find-row-h: 56px; } }
/* Phone: a full-screen sheet over whatever is under it. */
@media (max-width: 560px), (pointer: coarse) and (max-height: 500px) {
  .find-panel {
    inset-block-start: var(--find-vvt, 0px); inset-inline: 0; margin: 0;
    inline-size: 100%; block-size: var(--find-vvh, 100dvh); max-block-size: none;
    border-radius: 0;
    padding-block-start: env(safe-area-inset-top, 0px);
    padding-inline: env(safe-area-inset-left, 0px) env(safe-area-inset-right, 0px);
  }
}

/* Motion (M7). Open: scrim 0->1 over t-2, panel opacity + translateY(-8px) +
   scale(.98) over t-3. Close: t-2, ease-in. Results never animate. Open runs
   fill-mode backwards: the settled palette is its own resting style, so the
   finished animations detach instead of holding the panel on a layer. */
@keyframes find-fade-in { from { opacity: 0; } }
@keyframes find-fade-out { to { opacity: 0; } }
@keyframes find-panel-in { from { opacity: 0; transform: translateY(-8px) scale(.98); } }
@keyframes find-panel-out { to { opacity: 0; transform: translateY(-4px) scale(.985); } }
#find-root.is-open .find-scrim { animation: find-fade-in var(--m-t-2, 160ms) ${EASE_OUT} backwards; }
#find-root.is-open .find-panel { animation: find-panel-in var(--m-t-3, 240ms) ${EASE_OUT} backwards; }
#find-root.is-closing .find-scrim { animation: find-fade-out var(--m-t-2, 160ms) ${EASE_IN} both; }
#find-root.is-closing .find-panel { animation: find-panel-out var(--m-t-2, 160ms) ${EASE_IN} both; }
/* A full-screen sheet fades; scaling it would flash the scrim at its edges. */
@media (max-width: 560px), (pointer: coarse) and (max-height: 500px) {
  #find-root.is-open .find-panel { animation-name: find-fade-in; }
  #find-root.is-closing .find-panel { animation-name: find-fade-out; }
}
html[data-motion="lite"] #find-root.is-open .find-panel { animation: find-fade-in 160ms ${EASE_OUT} backwards; }
html[data-motion="lite"] #find-root.is-closing .find-panel { animation: find-fade-out 160ms ${EASE_IN} both; }
html[data-motion="lite"] .find-hl, html[data-motion="off"] .find-hl { transition: none; }
html[data-motion="off"] #find-root *, html[data-motion="off"] .find-trigger { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  #find-root *, .find-trigger { animation: none !important; transition: none !important; }
}

/* ── The trigger in the ticket rail ──────────────────────────────────────
   Icon-only 44x44 by default (desktop 1024-1279, every iPad); the labelled
   pill from 1280px on a fine pointer; nothing on a phone-width cinema, where
   the two-row course menu has no room and the pocket list is the search. */
.find-trigger {
  position: relative; flex: none; box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  inline-size: 44px; block-size: 44px; margin: 0; padding: 0;
  border: 0; border-radius: var(--r-sm, 3px); cursor: pointer;
  color: var(--bone-2, #dcd5c8);
  background: linear-gradient(180deg,
    color-mix(in oklab, var(--slate, #1d3b52) 62%, var(--ink-900, #090d13)),
    color-mix(in oklab, var(--ink-900, #090d13) 90%, var(--slate, #1d3b52)));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .08),
              inset 0 0 0 1px color-mix(in oklab, var(--brass, #c8973f) 34%, transparent);
  font: 600 13px/1 var(--font-text, system-ui, sans-serif); letter-spacing: .01em; white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  /* the shared press (theme.css §16): down in 90 ms, back on the press ease */
  transition: transform var(--press-t, var(--m-t-2, 160ms)) var(--press-e, var(--m-ease-press, cubic-bezier(.34,1.36,.44,1))),
              color var(--m-t-2, 160ms) ${EASE_OUT};
}
.find-trigger::after { content: ""; position: absolute; inset: 0; }
.find-trigger:hover { color: var(--bone, #f4efe6); box-shadow: inset 0 1px 0 rgb(255 255 255 / .12), inset 0 0 0 1px color-mix(in oklab, var(--brass, #c8973f) 64%, transparent); }
.find-trigger:active { transform: scale(var(--m-press, .98)); --press-t: var(--m-t-1, 90ms); --press-e: ${EASE_OUT}; }
.find-trigger[aria-expanded="true"] { color: var(--bone, #f4efe6); }
/* THE RING (v29 fix round, G3 m-1). The site's two-tone ring is an ink core
   plus a brass halo drawn as box-shadow (theme.css §16); this rule's own
   box-shadow above replaced the halo, and an ink core on the ink rail is
   invisible — the new hire's control was the one control with no ring. The
   halo wins while focused, as on .chip / .btn / #c3-button. */
.find-trigger:focus-visible {
  outline: 3px solid var(--ring-core, #05070a); outline-offset: 2px;
  box-shadow: 0 0 0 6px var(--ring-halo, #ebce93);
}
.find-trigger-icon { inline-size: 18px; block-size: 18px; flex: none; color: var(--brass-300, #ebce93); }
.find-trigger-label, .find-trigger-kbd { display: none; }
.find-trigger-kbd {
  margin-inline-start: auto; padding: 3px 6px; border-radius: 3px;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bone, #f4efe6) 22%, transparent);
  font: 600 11px/1 var(--font-text, system-ui, sans-serif); letter-spacing: .02em; color: var(--bone-3, #b4aba0);
}
@media (min-width: 1280px) and (pointer: fine) {
  .find-trigger { inline-size: auto; min-inline-size: 11.5rem; block-size: 36px; padding-inline: 12px 8px; justify-content: flex-start; }
  .find-trigger::after { inset: -4px 0; }
  .find-trigger-label, .find-trigger-kbd { display: inline-block; }
}
@media (min-width: 1440px) and (pointer: fine) { .find-trigger { min-inline-size: 13rem; } }
/* 1280-1366 is the landscape band where the wordmark is back on the bar and the
   C³ reserve is tight: keep the words, drop the key chip (the tooltip and
   aria-keyshortcuts still carry it). Measured at 1280: 18px short with it. */
@media (min-width: 1280px) and (max-width: 1366px) and (pointer: fine) {
  .find-trigger { min-inline-size: 0; padding-inline: 12px 14px; }
  .find-trigger-kbd { display: none; }
}
@media (max-width: 560px) { .find-trigger { display: none; } }

/* The rail makes room. From 1367px the C³ reserve is cut to the button's own
   width so the pill sits beside it; in the narrow band the course numbers (aria-
   hidden already) step off so all seven rooms and the icon fit unscrolled. */
@media (min-width: 1367px) {
  #ticket-rail.has-find { padding-inline-end: calc(var(--gut) + 4.25rem + var(--sp-3, .75rem)); }
}
@media (min-width: 561px) and (max-width: 900px), (min-width: 561px) and (max-aspect-ratio: 8 / 7) {
  #ticket-rail.has-find .ticket-no { display: none; }
  #ticket-rail.has-find .find-trigger { margin-inline-end: var(--sp-2, .5rem); }
}

/* ── The C³ menu's search field (cinema.js puts it in #c3-menu-head) ──── */
.find-c3-head { flex-wrap: wrap; row-gap: var(--sp-3, .75rem); }
.find-c3-field { position: relative; flex: 1 1 100%; order: 3; display: flex; align-items: center; }
.find-c3-icon { position: absolute; inset-inline-start: 12px; inline-size: 18px; block-size: 18px; color: var(--brass, #c8973f); pointer-events: none; }
.find-c3-input {
  box-sizing: border-box; inline-size: 100%; block-size: 44px; margin: 0; padding: 0 12px 0 40px;
  border: 0; border-radius: var(--r-sm, 3px); outline: none;
  background: color-mix(in oklab, var(--ink-950, #05070a) 55%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bone, #f4efe6) 16%, transparent);
  color: var(--bone, #f4efe6); font: 400 15px/1.2 var(--font-text, system-ui, sans-serif);
  -webkit-appearance: none; appearance: none;
}
.find-c3-input::placeholder { color: var(--bone-3, #b4aba0); opacity: 1; }
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'find-styles';
  style.textContent = CSS;
  document.head.append(style);
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 6 · GLYPHS — one inline sprite, not emoji
 *   pass = tablet · host = podium · dining = wine glass · prep = knife
 *   office = clipboard · breakroom = cup · freezer = snowflake
 * ────────────────────────────────────────────────────────────────────────── */

export const SEARCH_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" aria-hidden="true" focusable="false">' +
  '<circle cx="8.6" cy="8.6" r="5.4"/><path d="M12.7 12.7l4.6 4.6"/></svg>';

const G = (id, body) =>
  `<symbol id="find-g-${id}" viewBox="0 0 20 20" fill="none" stroke="currentColor" ` +
  `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`;

const SPRITE =
  '<svg class="find-sprite" aria-hidden="true" focusable="false">' +
  G('pass', '<rect x="4.5" y="2.5" width="11" height="15" rx="1.8"/><path d="M8.5 14.8h3"/>') +
  G('host', '<path d="M3.5 5.5h13l-1.6 3.5H5.1z"/><path d="M8.3 9v7M11.7 9v7M6 17h8"/>') +
  G('dining', '<path d="M6.3 2.5h7.4c.2 4.2-1.4 7-3.7 7s-3.9-2.8-3.7-7z"/><path d="M10 9.5v7M7 17.5h6"/>') +
  G('prep', '<path d="M16.8 3.2 7.6 12.4 6 10.8c2.8-4.3 6.4-7 10.8-7.6z"/><path d="M7.6 12.4 4 16a1.1 1.1 0 0 0 1.6 1.6l3.6-3.6"/>') +
  G('office', '<rect x="4.5" y="3.5" width="11" height="14" rx="1.5"/><path d="M7.8 3.5V2.4h4.4v1.1M7.5 8h5M7.5 11h5M7.5 14h3"/>') +
  G('breakroom', '<path d="M3.8 7.5h10v4.8a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z"/><path d="M13.8 9h1.4a2 2 0 0 1 0 4h-1.4M7 2.8v2.4M10.4 2.8v2.4"/>') +
  G('freezer', '<path d="M10 2.5v15M3.5 6.25l13 7.5M3.5 13.75l13-7.5M8.2 3.9 10 5.4l1.8-1.5M8.2 16.1 10 14.6l1.8 1.5"/>') +
  G('lock', '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>') +
  G('go', '<path d="M3.5 10h12M11 5.5l4.5 4.5-4.5 4.5"/>') +
  G('tool', '<circle cx="10" cy="10" r="3"/>') +
  '</svg>';

const GLYPHS = new Set(['pass', 'host', 'dining', 'prep', 'office', 'breakroom', 'freezer', 'lock', 'go']);

const SVG_NS = 'http://www.w3.org/2000/svg';
function glyph(id) {
  const name = GLYPHS.has(id) ? id : 'tool';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'find-glyph');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#find-g-${name}`);
  svg.append(use);
  return svg;
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 7 · mountFind — the palette, its triggers, its hotkeys
 * ────────────────────────────────────────────────────────────────────────── */

const IS_MAC = (() => {
  try {
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    return /mac|iphone|ipad|ipod/i.test(p);
  } catch { return false; }
})();

function motionTier() {
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off'; } catch { /* noop */ }
  const m = document.documentElement.dataset.motion;
  return m === 'off' || m === 'lite' ? m : 'full';
}

function isEditable(t) {
  if (!t || t.nodeType !== 1) return false;
  if (t.isContentEditable) return true;
  return !!(t.closest && t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}

/** The keypad or a chef portrait is up: the hotkeys stand down. */
function modalUp() {
  const modal = document.getElementById('modal-root');
  if (modal && modal.firstElementChild) return true;
  return !!document.querySelector('.ccc-chefmodal[data-open="true"]');
}

function focusSafely(node) {
  if (!node || !node.isConnected || typeof node.focus !== 'function') return false;
  try { node.focus({ preventScroll: true }); } catch { node.focus(); }
  return document.activeElement === node;
}

let MOUNTED = null;

/**
 * Mount the palette. Idempotent: a second call returns the first instance.
 *
 * @param {object}   opts
 * @param {{tools:Array, rooms:Array}} opts.data  the LIVE arrays; re-read on reindex()
 * @param {() => boolean} [opts.isLocked]   walk-in shut and something is sealed
 * @param {(cb:Function) => void} [opts.onUnlock]  coldgate.onFreezerUnlock
 * @param {(roomId:string) => void} [opts.goToRoom] cinema: scrollToRoom; omit on the phone
 * @param {Element}  [opts.rail]            #ticket-rail: gets the trigger
 * @param {() => void} [opts.beforeOpen]    close anything the palette replaces (C³)
 * @param {(ev:Event|null) => boolean} [opts.onHotkey]  return true if the caller
 *                   handled a hotkey itself (the pocket list focuses its field)
 * @param {() => boolean} [opts.isViewing]  the tool viewer is up
 * @param {() => void} [opts.closeViewer]  close the tool viewer (the keypad row
 *                   closes it first, so the keypad never opens under it)
 */
export function mountFind(opts = {}) {
  if (MOUNTED) return MOUNTED;
  injectStyles();

  const {
    data,
    isLocked = () => false,
    onUnlock = null,
    goToRoom = null,
    rail = null,
    beforeOpen = null,
    onHotkey = null,
    closeViewer = null
  } = opts;

  let viewerUp = false;
  const canLeaveViewer = typeof closeViewer === 'function';
  const isViewing = () => {
    if (typeof opts.isViewing === 'function') {
      try { if (opts.isViewing()) return true; } catch { /* noop */ }
    }
    const h = document.documentElement.classList;
    return viewerUp || h.contains('is-viewing') || h.contains('ccc-locked');
  };

  let index = buildIndex((data && data.tools) || [], (data && data.rooms) || []);
  let indexVersion = 0;
  const reindex = () => {
    index = buildIndex((data && data.tools) || [], (data && data.rooms) || []);
    indexVersion++;
    if (isOpenNow) render();
  };
  if (typeof onUnlock === 'function') onUnlock(reindex);

  /* ---- DOM ------------------------------------------------------------- */
  const root = el('div', { id: 'find-root', 'data-ccc-keep-live': '', hidden: true });
  root.insertAdjacentHTML('afterbegin', SPRITE);

  const scrim = el('div', { class: 'find-scrim', 'aria-hidden': 'true' });

  const input = el('input', {
    id: 'find-input', class: 'find-input', type: 'text',
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'find-list',
    'aria-autocomplete': 'list', 'aria-label': 'Find a tool',
    'aria-describedby': 'find-count',
    autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
    inputmode: 'search', enterkeyhint: 'go',
    placeholder: 'Find a tool — try a name, a room, or DSR'
  });
  const clearBtn = el('button', {
    type: 'button', class: 'find-icon-btn find-clear', 'aria-label': 'Clear the search', hidden: true
  });
  clearBtn.innerHTML =
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">' +
    '<path d="M5 5l10 10M15 5L5 15"/></svg>';
  const closeBtn = el('button', {
    type: 'button', class: 'find-icon-btn find-close', text: 'Close', 'aria-label': 'Close find'
  });
  const fieldIcon = document.createElement('span');
  fieldIcon.innerHTML = SEARCH_SVG;
  fieldIcon.firstChild.setAttribute('class', 'find-field-icon');

  const field = el('div', { class: 'find-field' }, [fieldIcon.firstChild, input, clearBtn, closeBtn]);

  const hl = el('div', { class: 'find-hl', 'aria-hidden': 'true' });
  const list = el('div', { id: 'find-list', class: 'find-list', role: 'listbox', 'aria-label': 'Tools' });
  const empty = el('div', { class: 'find-empty', hidden: true });
  // A keyboard-reachable scroll region (axe: scrollable-region-focusable). The
  // rows themselves are reached from the input with the arrow keys.
  const scroller = el('div', { class: 'find-scroll', tabindex: '0' }, [hl, list, empty]);

  const count = el('span', { class: 'find-count', id: 'find-count' });
  const status = el('span', { class: 'find-sr', role: 'status', 'aria-live': 'polite' });
  const keys = el('span', { class: 'find-keys', 'aria-hidden': 'true' });
  keys.innerHTML =
    '<span><kbd class="find-kbd">↑</kbd><kbd class="find-kbd">↓</kbd>move</span>' +
    '<span><kbd class="find-kbd">↵</kbd>open</span>' +
    '<span><kbd class="find-kbd">esc</kbd>close</span>';
  const foot = el('div', { class: 'find-foot' }, [count, keys, status]);

  const panel = el('div', {
    id: 'find-panel', class: 'find-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Find a tool'
  }, [field, scroller, foot]);

  root.append(scrim, panel);
  document.body.append(root);

  /* ---- the trigger ----------------------------------------------------- */
  let trigger = null;
  if (rail) {
    trigger = el('button', {
      type: 'button', class: 'find-trigger',
      'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'find-panel',
      'aria-label': 'Find a tool',
      'aria-keyshortcuts': IS_MAC ? 'Meta+K /' : 'Control+K /',
      title: `Find a tool (${IS_MAC ? '⌘K' : 'Ctrl K'})`
    });
    trigger.innerHTML = SEARCH_SVG +
      '<span class="find-trigger-label">Find a tool</span>' +
      `<kbd class="find-trigger-kbd">${IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>`;
    trigger.firstChild.setAttribute('class', 'find-trigger-icon');
    trigger.addEventListener('click', () => {
      if (isOpenNow) close({ restore: true });
      else open({ opener: trigger });
    });
    rail.append(trigger);
    rail.classList.add('has-find');
  }

  /* ---- state ------------------------------------------------------------ */
  let isOpenNow = false;
  let opener = null;
  let rows = [];
  let active = -1;
  let optSeq = 0;
  let closeTimer = 0;
  let statusTimer = 0;
  let pendingReturn = null;        // focus target once a viewer we opened closes
  let lastChoice = null;

  /* ---- rendering -------------------------------------------------------- */
  function labelNode(label, ranges) {
    const span = el('span', { class: 'find-row-name' });
    if (!ranges || !ranges.length) { span.textContent = label; return span; }
    let at = 0;
    for (const [s, e] of ranges) {
      if (s > at) span.append(label.slice(at, s));
      span.append(el('mark', { class: 'find-mark', text: label.slice(s, e) }));
      at = e;
    }
    if (at < label.length) span.append(label.slice(at));
    return span;
  }

  function toolRow(e, ranges, showRoom) {
    const a = el('a', {
      class: 'find-row', role: 'option', id: `find-opt-${++optSeq}`,
      href: `#/tool/${encodeURIComponent(e.slug)}`,
      'data-tool': e.slug, tabindex: '-1', 'aria-selected': 'false',
      'aria-label': showRoom ? `${e.label}, ${e.room.label}` : e.label
    });
    a.append(glyph(e.room.id), labelNode(e.label, ranges));
    if (showRoom) a.append(el('span', { class: 'find-row-room', text: e.room.label }));
    a.append(el('span', { class: 'find-row-enter', 'aria-hidden': 'true', text: '↵' }));
    return a;
  }

  function lockRow() {
    const room = index.rooms.get('freezer');
    const label = (room && room.label) || 'Walk-In Freezer';
    const b = el('button', {
      type: 'button', class: 'find-row find-row--lock', role: 'option',
      id: `find-opt-${++optSeq}`, tabindex: '-1', 'aria-selected': 'false',
      'data-freezer-lock': '', 'aria-haspopup': 'dialog',
      'aria-label': `Manager tools — enter code, ${label}`
    });
    // One wording for the one lock, everywhere (cinema.js LOCK_WORDS).
    b.append(glyph('lock'), el('span', { class: 'find-row-name', text: 'Manager tools — enter code' }),
      el('span', { class: 'find-row-enter', 'aria-hidden': 'true', text: '↵' }));
    return b;
  }

  function roomRow(room) {
    const b = el('button', {
      type: 'button', class: 'find-row find-row--room', role: 'option',
      id: `find-opt-${++optSeq}`, tabindex: '-1', 'aria-selected': 'false',
      'data-find-room': room.id, 'aria-label': `Go to ${room.label}`
    });
    b.append(glyph(room.id), el('span', { class: 'find-row-name', text: `Go to ${room.label} →` }),
      el('span', { class: 'find-row-enter', 'aria-hidden': 'true', text: '↵' }));
    return b;
  }

  function group(label, items) {
    const g = el('div', { class: 'find-group', role: 'group', 'aria-label': label }, [
      el('div', { class: 'find-group-head', 'aria-hidden': 'true', text: label }),
      ...items
    ]);
    return g;
  }

  function recentEntries() {
    const out = [];
    for (const s of readRecent()) {
      const e = index.bySlug.get(String(s).toLowerCase());
      if (e && !e.frozen && !out.includes(e)) out.push(e);
    }
    return out.slice(0, RECENT_MAX);
  }

  function announce(text) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = text; }, 350);
  }

  let browseKey = '';

  function render() {
    const text = input.value;
    const trimmed = text.trim();
    const locked = !!isLocked();
    const viewing = isViewing();
    const groups = [];
    let toolCount = 0;
    let summary = '';

    clearBtn.hidden = !text;

    // The browse list only changes with the index, the lock, the viewer and
    // Recent — reopening the palette reuses it rather than rebuilding it.
    const key = trimmed ? '' : `${indexVersion}|${locked}|${viewing}|${readRecent().join(',')}`;
    if (key && key === browseKey && list.firstChild) {
      empty.hidden = true;
      rows.forEach((r) => { r.classList.remove('is-active'); r.setAttribute('aria-selected', 'false'); });
      active = -1;
      scroller.classList.remove('has-hl');
      hl.style.opacity = '0';
      setActive(rows.length ? 0 : -1, { slide: false, reveal: false });
      if (scrolled) { scroller.scrollTop = 0; scrolled = false; }
      return;
    }
    browseKey = key;
    optSeq = 0;

    if (!trimmed) {
      const rec = recentEntries();
      if (rec.length) groups.push(group('Recent', rec.map((e) => toolRow(e, null, true))));
      for (const roomId of index.order) {
        const room = index.rooms.get(roomId);
        if (!room) continue;
        if (roomId === 'freezer' && locked) {
          if (!viewing || canLeaveViewer) groups.push(group(room.label, [lockRow()]));
          continue;
        }
        const inRoom = index.entries.filter((e) => e.room.id === roomId);
        if (!inRoom.length) continue;
        toolCount += inRoom.length;
        groups.push(group(room.label, inRoom.map((e) => toolRow(e, null, false))));
      }
      summary = `${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`;
      fill(list, groups);
      empty.hidden = true;
    } else {
      const results = query(index, trimmed, { recent: readRecent() });
      const items = results.map((r) => toolRow(r.entry, r.hits, true));
      toolCount = results.length;
      const reaches = locked && touchesFreezer(index, trimmed, results);
      const lockHit = reaches && (!viewing || canLeaveViewer);
      if (lockHit) items.push(lockRow());
      const room = goToRoom && !viewing ? queryRoom(index, trimmed) : null;
      const showRoom = room && !(room.id === 'freezer' && locked);
      // The room's own name ("break room", "office") puts its row FIRST, so
      // Enter goes to the room; a category word leaves it after the tools.
      if (showRoom) {
        if (roomNamed(index, trimmed) === room) items.unshift(roomRow(room));
        else items.push(roomRow(room));
      }
      fill(list, items);

      if (!toolCount && (lockHit || showRoom)) {
        // A row answered — never "Nothing called …" / "0 tools" beside it
        // (v29 fix round, G2 m3 / G3 m-6).
        empty.hidden = true;
        summary = lockHit && !showRoom ? 'Manager tools — enter code' : `Go to ${room.label}`;
      } else if (!toolCount) {
        fill(empty, [
          el('p', { class: 'find-empty-line', text: `Nothing called “${trimmed}”.` }),
          // Only when the query plausibly was for a manager tool (and the
          // lock row cannot be offered here): otherwise it tells a new hire
          // that the flyer they want is locked away.
          reaches ? el('p', { class: 'find-empty-note', text: 'Manager tools are in the Walk-In Freezer.' }) : null,
          el('button', { type: 'button', class: 'find-browse', 'data-find-browse': '', text: 'Browse every tool' })
        ]);
        empty.hidden = false;
        summary = '0 tools';
      } else {
        empty.hidden = true;
        summary = `${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`;
      }
    }

    count.textContent = summary;
    announce(toolCount || !trimmed || empty.hidden ? summary : `No tools called “${trimmed}”`);
    rows = Array.from(list.querySelectorAll('.find-row'));
    active = -1;
    // Fresh rows: the first one is active by its own background, and the
    // sliding highlight stands down until the next move. NOTHING here reads
    // layout — the first paint lays the palette out once, in the frame.
    scroller.classList.remove('has-hl');
    hl.style.opacity = '0';
    setActive(rows.length ? 0 : -1, { slide: false, reveal: false });
    if (scrolled) { scroller.scrollTop = 0; scrolled = false; }
  }

  /* THE ACTIVE ROW. aria-selected + aria-activedescendant always; the brass
     highlight slides to it (90 ms transform, motion M7) only when the rep moves
     with the keys or the mouse — by then layout is clean, so the two offsetTop
     reads are free. */
  let scrolled = false;
  scroller.addEventListener('scroll', () => { scrolled = scroller.scrollTop > 0; }, { passive: true });

  function setActive(i, { slide = true, reveal = true } = {}) {
    const prev = rows[active] || null;
    if (prev) {
      prev.setAttribute('aria-selected', 'false');
      prev.classList.remove('is-active');
    }
    if (i < 0 || !rows.length) {
      active = -1;
      input.removeAttribute('aria-activedescendant');
      hl.style.opacity = '0';
      return;
    }
    active = i;
    const r = rows[i];
    r.setAttribute('aria-selected', 'true');
    r.classList.add('is-active');
    input.setAttribute('aria-activedescendant', r.id);
    if (slide) {
      if (!scroller.classList.contains('has-hl') && prev) {
        // start from where the eye already is
        hl.classList.add('is-snap');
        hl.style.transform = `translate3d(0, ${prev.offsetTop}px, 0)`;
        hl.style.blockSize = `${prev.offsetHeight}px`;
        void hl.offsetWidth;
        hl.classList.remove('is-snap');
      }
      hl.style.transform = `translate3d(0, ${r.offsetTop}px, 0)`;
      hl.style.blockSize = `${r.offsetHeight}px`;
      hl.style.opacity = '1';
      scroller.classList.add('has-hl');
    }
    if (reveal) {
      const top = r.offsetTop;
      const bottom = top + r.offsetHeight;
      const pad = 8;
      if (top - pad < scroller.scrollTop) scroller.scrollTop = Math.max(0, i === 0 ? 0 : top - pad);
      else if (bottom + pad > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTop = bottom + pad - scroller.clientHeight;
      }
    }
  }

  function move(delta, wrap) {
    if (!rows.length) return;
    let i = active < 0 ? (delta > 0 ? -1 : rows.length) : active;
    i += delta;
    if (wrap) i = (i + rows.length) % rows.length;
    else i = Math.max(0, Math.min(rows.length - 1, i));
    setActive(i);
  }

  /* ---- open / close -----------------------------------------------------
     NO `inert` ON THE PAGE, deliberately. Toggling it on #kitchen invalidates
     style for the whole restaurant: measured 40–160 ms of forced recalc on the
     keystroke (1440x900, loaded runner) — the difference between "opens on the
     next frame" and a visible hitch. The palette is modal without it: the scrim
     covers the viewport so no pointer reaches the page, the Tab trap below
     keeps the keyboard in, and aria-modal tells assistive tech the rest is out
     of play. */

  let vvRaf = 0;
  function syncViewport() {
    vvRaf = 0;
    const vv = window.visualViewport;
    if (!vv) return;
    root.style.setProperty('--find-vvh', `${Math.round(vv.height)}px`);
    root.style.setProperty('--find-vvt', `${Math.round(vv.offsetTop)}px`);
  }
  const onViewport = () => { if (!vvRaf) vvRaf = requestAnimationFrame(syncViewport); };

  function open({ text = '', opener: from = null } = {}) {
    if (modalUp()) return false;
    if (isOpenNow) {
      if (text) { input.value = text; render(); }
      focusSafely(input);
      return true;
    }
    if (typeof beforeOpen === 'function') { try { beforeOpen(); } catch (err) { console.error(err); } }

    clearTimeout(closeTimer);
    root.classList.remove('is-closing');
    opener = from || document.activeElement;
    pendingReturn = null;

    input.value = text || '';
    // ORDER MATTERS FOR THE ONE-FRAME OPEN: read the visual viewport while
    // layout is still clean (free), build the rows while the root is still
    // display:none (no layout), THEN show it — so the palette is laid out once,
    // in the frame, instead of twice inside the keystroke.
    syncViewport();
    render();
    // An element someone else inerted (the viewer, before contract C4 landed)
    // must not swallow the palette.
    if (root.inert) root.inert = false;
    root.removeAttribute('aria-hidden');
    root.hidden = false;
    isOpenNow = true;
    root.classList.add('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    // (Setting .value already leaves the caret at the end; no selection call,
    // which would force a layout inside the keystroke.)
    focusSafely(input);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewport);
      window.visualViewport.addEventListener('scroll', onViewport);
    }
    return true;
  }

  function close({ instant = false, restore = true } = {}) {
    if (!isOpenNow) return;
    isOpenNow = false;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', onViewport);
      window.visualViewport.removeEventListener('scroll', onViewport);
    }
    clearTimeout(statusTimer);

    const done = () => {
      clearTimeout(closeTimer);
      panel.removeEventListener('animationend', onEnd);
      if (isOpenNow) return;                       // reopened mid-fade
      root.hidden = true;
      root.classList.remove('is-open', 'is-closing');
    };
    const onEnd = (ev) => { if (ev.target === panel) done(); };
    if (instant || motionTier() === 'off') done();
    else {
      root.classList.remove('is-open');
      root.classList.add('is-closing');
      panel.addEventListener('animationend', onEnd);
      closeTimer = setTimeout(done, 260);
    }

    if (restore) returnFocus();
  }

  function returnFocus() {
    const target = opener;
    opener = null;
    if (target && target !== document.body && isShown(target) && focusSafely(target)) return;
    if (trigger && isShown(trigger)) focusSafely(trigger);
  }

  function isShown(n) {
    if (!n || !n.isConnected) return false;
    if (n.closest && n.closest('[hidden], [inert]')) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /* ---- choosing --------------------------------------------------------- */
  root.addEventListener('click', (ev) => {
    if (ev.target === scrim) { close({ restore: true }); return; }
    const t = ev.target.closest && ev.target.closest('button, a');
    if (!t || !root.contains(t)) return;

    if (t === clearBtn) {
      input.value = ''; render(); focusSafely(input); return;
    }
    if (t === closeBtn) { close({ restore: true }); return; }
    if (t.hasAttribute('data-find-browse')) {
      input.value = ''; render(); focusSafely(input); return;
    }
    if (t.matches('a.find-row[data-tool]')) {
      // ⌘/Ctrl/middle-click: the browser opens a new tab; the palette stays.
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const slug = t.getAttribute('data-tool');
      const wasViewing = isViewing();
      const from = opener;
      rememberRecent(index, slug);
      lastChoice = slug;
      close({ instant: true, restore: false });
      if (wasViewing) {
        // A swap: the viewer stays up and keeps its own focus management. Put
        // focus back where the rep asked for the palette (the viewer's button).
        requestAnimationFrame(() => {
          const a = document.activeElement;
          if (!a || a === document.body || root.contains(a)) {
            if (!(from && isShown(from) && focusSafely(from))) { /* leave it */ }
          }
        });
      } else {
        pendingReturn = from && from !== document.body ? from : trigger;
      }
      // NO preventDefault: overlay.js's delegated [data-tool] handler on
      // document opens (or swaps) the tool from this very click.
      return;
    }
    if (t.hasAttribute('data-find-room')) {
      ev.preventDefault();
      const id = t.getAttribute('data-find-room');
      close({ instant: true, restore: true });
      if (typeof goToRoom === 'function') goToRoom(id);
      return;
    }
    if (t.hasAttribute('data-freezer-lock')) {
      if (isViewing() && canLeaveViewer) {
        // Over a tool: the keypad must not open under the viewer (it would sit
        // in the inerted page). Close the viewer first, then hand this same
        // row's click to the page's delegated keypad handler once the viewer
        // has put the page back (ccc:viewer-close, C1).
        ev.preventDefault();
        ev.stopPropagation();
        close({ instant: true, restore: false });
        let sent = false;
        const reissue = () => {
          if (sent) return;
          sent = true;
          if (!isViewing()) t.click();
        };
        document.addEventListener('ccc:viewer-close', () => setTimeout(reissue, 0), { once: true });
        setTimeout(reissue, 1500);
        try { closeViewer(); } catch { /* noop */ }
        return;
      }
      // The page's delegated [data-freezer-lock] handler opens the keypad after
      // this; close first so the keypad is not underneath us and so it records
      // the right element to hand focus back to.
      close({ instant: true, restore: true });
    }
  });

  // Pointer hover moves the active row (a mouse, not a scroll under a finger).
  list.addEventListener('pointermove', (ev) => {
    if (ev.pointerType && ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') return;
    const r = ev.target.closest && ev.target.closest('.find-row');
    if (!r) return;
    const i = rows.indexOf(r);
    if (i !== -1 && i !== active) setActive(i, { reveal: false });
  });

  input.addEventListener('input', () => render());

  input.addEventListener('keydown', (ev) => {
    if (ev.isComposing) return;
    switch (ev.key) {
      case 'ArrowDown': ev.preventDefault(); move(+1, true); break;
      case 'ArrowUp': ev.preventDefault(); move(-1, true); break;
      case 'PageDown': ev.preventDefault(); move(+5, false); break;
      case 'PageUp': ev.preventDefault(); move(-5, false); break;
      case 'Home': if (rows.length) { ev.preventDefault(); setActive(0); } break;
      case 'End': if (rows.length) { ev.preventDefault(); setActive(rows.length - 1); } break;
      case 'Enter':
        if (rows[active]) { ev.preventDefault(); rows[active].click(); }
        break;
      default: break;
    }
  });

  // Tab stays in the dialog.
  panel.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab') return;
    // DOM order: the field's controls, the list region, the empty state's button.
    const items = [input, clearBtn, closeBtn, scroller, ...empty.querySelectorAll('button')]
      .filter((n) => !n.hidden && isShown(n));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const a = document.activeElement;
    if (ev.shiftKey && (a === first || !panel.contains(a))) { ev.preventDefault(); focusSafely(last); }
    else if (!ev.shiftKey && (a === last || !panel.contains(a))) { ev.preventDefault(); focusSafely(first); }
  });

  // The scrim is not a scroller: a wheel or a drag on it must not move the
  // restaurant underneath (the engine would animate rooms nobody can see).
  const guard = (ev) => { if (!scroller.contains(ev.target)) ev.preventDefault(); };
  root.addEventListener('wheel', guard, { passive: false });
  root.addEventListener('touchmove', guard, { passive: false });

  /* ---- hotkeys: `/`, Ctrl-K, ⌘K ---------------------------------------
     On window, capture phase, so they run before the viewer's own capture
     listener on document — which is what lets Escape clear or close the
     palette WITHOUT also closing a tool open underneath it. */
  window.addEventListener('keydown', (ev) => {
    if (ev.isComposing) return;
    const k = ev.key;

    if (isOpenNow && k === 'Escape') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (input.value) { input.value = ''; render(); focusSafely(input); }
      else close({ restore: true });
      return;
    }

    const cmdK = (ev.metaKey || ev.ctrlKey) && !ev.altKey && !ev.shiftKey && (k === 'k' || k === 'K');
    const slash = k === '/' && !ev.metaKey && !ev.ctrlKey && !ev.altKey;
    if (!cmdK && !slash) return;
    if (ev.defaultPrevented || modalUp()) return;

    if (cmdK) {
      ev.preventDefault();
      if (isOpenNow) { close({ restore: true }); return; }
      if (typeof onHotkey === 'function' && !isViewing() && onHotkey(ev)) return;
      open({ opener: document.activeElement });
      return;
    }
    // `/` only when nobody is typing.
    if (isOpenNow || isEditable(ev.target)) return;
    ev.preventDefault();
    if (typeof onHotkey === 'function' && !isViewing() && onHotkey(ev)) return;
    open({ opener: document.activeElement });
  }, true);

  /* ---- contract C4: the viewer's "Find another tool" button -------------- */
  document.addEventListener('ccc:find-open', (ev) => {
    const d = (ev && ev.detail) || {};
    if (typeof onHotkey === 'function' && !isViewing() && onHotkey(null)) return;
    open({ text: typeof d.text === 'string' ? d.text : '', opener: d.opener || document.activeElement });
  });

  /* Same-origin station pages (arcade, printouts, porting guide, casino) may
     forward ⌘K as postMessage({source:'ccc-station', action:'find'}). */
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    const d = ev.data;
    if (!d || d.source !== 'ccc-station' || d.action !== 'find') return;
    open({ opener: null });
  });

  /* ---- the viewer, heard from its events (contract C1) ------------------- */
  document.addEventListener('ccc:viewer-open', (ev) => {
    viewerUp = true;
    const d = (ev && ev.detail) || {};
    if (d.slug) rememberRecent(index, d.slug);
    /* A choice made HERE closes the palette before its click reaches the
       viewer, so an open palette at this point means the tool came some other
       way (Forward, a #/tool/ hash) and would open underneath us, ✕ covered
       (G1 D2). Step aside; the viewer takes focus. */
    if (isOpenNow) close({ instant: true, restore: false });
  });
  document.addEventListener('ccc:viewer-close', () => {
    viewerUp = false;
    if (isOpenNow) render();
    const target = pendingReturn;
    const chosen = lastChoice;
    pendingReturn = null;
    lastChoice = null;
    if (!target) return;
    /* The viewer hands focus back to the element that opened the tool — here,
       a row of a palette that is now closed, which cannot take it, so it falls
       back to the C³ button (or the tool's chip in some other room). The rep
       came from the Find trigger; send them back there once the viewer has
       finished restoring the page. */
    const deadline = Date.now() + 2000;
    const settle = () => {
      const h = document.documentElement.classList;
      if ((h.contains('is-viewing') || h.contains('ccc-locked')) && Date.now() < deadline) {
        setTimeout(settle, 60);
        return;
      }
      const a = document.activeElement;
      const lost = !a || a === document.body || a.id === 'c3-button' || root.contains(a) ||
        (chosen && a.getAttribute && a.getAttribute('data-tool') === chosen);
      if (lost && isShown(target)) focusSafely(target);
    };
    setTimeout(settle, 0);
  });

  MOUNTED = {
    open, close,
    toggle: () => (isOpenNow ? close({ restore: true }) : open({})),
    isOpen: () => isOpenNow,
    reindex,
    get index() { return index; },
    root, trigger
  };
  return MOUNTED;
}
