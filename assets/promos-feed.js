/* =============================================================================
 * Cook County Cooks — assets/promos-feed.js
 * THE MOBILE PROMOTIONS FEED
 * -----------------------------------------------------------------------------
 * WHAT THIS IS FOR
 *   Jeff keeps the current mobile promotions inside his two quote sheets:
 *     · 6th Gen Mobile Quote Sheet (new lines)
 *     · Upgrade Quote Sheet        (upgrades)
 *   The Mobile Promotions guide (tools/mobile-promos/) and Ask the Chef both
 *   need that same list. Rather than copy it by hand — which goes stale the day
 *   he edits a sheet — this module READS THE SHEETS THEMSELVES and turns them
 *   into one tidy list of promos. Edit a sheet, the guide follows.
 *
 * WHERE THE DATA SITS INSIDE A SHEET
 *   Each sheet is one big index.html with the data written as JavaScript
 *   constants, e.g. `const PROMO_GUIDE = [ ... ];`. We find those constants in
 *   the page's TEXT and read them with a small hand-written reader
 *   (`readLiteral` below). We never run the sheet's code (no eval, no
 *   new Function): the sheet is someone else's page and running it would be
 *   both unsafe and fragile.
 *
 * WHY A HAND-WRITTEN READER AND NOT JSON.parse
 *   Some constants are strict JSON, but some are written the relaxed JavaScript
 *   way — keys without quotes, 'single quotes', a comma after the last item,
 *   // comments. Jeff edits these by hand and with AI, so any of those can show
 *   up anywhere tomorrow. The reader accepts all of them, and understands
 *   strings properly (an apostrophe in "the customer's line" or a "]" inside a
 *   comment does not confuse it).
 *
 * FAIL SOFT — A BROKEN SHEET NEVER BLANKS THE PAGE
 *   Each sheet is checked on its own. If one sheet will not read (a typo, a
 *   half-saved edit, a slow network), the promos from the OTHER sheet stay live
 *   and the broken sheet's promos come from the saved copy, with a warning. If
 *   both fail, the whole saved copy is used. The saved copy is the snapshot
 *   file written by build/pull-promos.mjs on a GitHub schedule.
 *
 * "CURRENT PROMOS ONLY"
 *   Jeff's rule: an expired deal disappears everywhere. "Today" means the
 *   calendar date in Chicago (America/Chicago), and the end date counts — a
 *   promo that ends 11/10 is still shown all day on 11/10.
 *
 * RUNS EVERYWHERE
 *   Plain ES module. No DOM, no Node-only APIs, so the same file runs in
 *   Safari on the store iPads, in Chrome, and in Node 18+ for the build script
 *   and the tests.
 *
 * THE OUTPUT MUST MATCH THE REFERENCE
 *   contract/make_fixture.py is the reference version of this conversion.
 *   parseSheets() must give exactly the same promos for the same sheets and
 *   date — build/promos-feed.test.mjs checks that.
 * ========================================================================== */

export const SHEETS = {
  new_line_sheet: { label: '6th Gen Mobile Quote Sheet', url: 'https://blufoxmobile.github.io/Mobile-Quote-Sheet-6th-Gen/' },
  upgrade_sheet:  { label: 'Upgrade Quote Sheet',        url: 'https://blufoxmobile.github.io/Upgrade-Quote-Sheet/' }
};

/* The sessionStorage key for the 5-minute cache. It is a fixed string on
   purpose: the guide page loads this file unhashed and Ask the Chef loads the
   build's hashed copy, and both must find the same saved result so the sheets
   (about 1.4 MB together) are downloaded only once. Change the "-v1" only if
   the shape of what is stored changes. */
export const CACHE_KEY = 'ccc-promos-live-v1';

const CACHE_MS_LIVE = 5 * 60 * 1000;      // both sheets read fine
const CACHE_MS_DEGRADED = 60 * 1000;      // something fell back: try again sooner

/* The saved copy, next to the site's other data files. The path is built from
   pieces ON PURPOSE. build/fingerprint.mjs rewrites any literal mention of the
   data file's path inside assets/*.js into its content-hashed name — which
   would pin the fallback to the copy that existed on deploy day, so the
   GitHub job's later refreshes would never be read. Spelled in pieces, the
   rewriter cannot match it, and both copies of this module (hashed and not)
   still sit in assets/, so "../" + "data" is right for either. */
const SNAPSHOT_PATH = ['..', 'data', 'promos' + '.json'].join('/');

/* ---------------------------------------------------------------------------
 * 1. READING JAVASCRIPT VALUES OUT OF PAGE TEXT
 * ------------------------------------------------------------------------ */

class ReadError extends Error {}

/**
 * Read one JavaScript value (object, array, string, number, true/false/null)
 * starting at `start` in `text`. Returns { value, end }.
 * Accepts the relaxed forms Jeff's sheets use: bare keys, 'single quotes',
 * trailing commas, // and block comments, "a" + "b" string joins.
 * Anything else (a function call, a variable name, ${...}) is refused with a
 * message that says where — we do not guess.
 */
function readLiteral(text, start) {
  let i = start;
  let depth = 0;

  const fail = (msg) => {
    const line = text.slice(0, i).split('\n').length;
    throw new ReadError(msg + ' (line ' + line + ')');
  };

  // Skip spaces, newlines and comments.
  function skip() {
    for (;;) {
      const c = text[i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\v' || c === ' ' || c === '﻿' || c === ' ' || c === ' ') { i++; continue; }
      if (c === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && text[i + 1] === '*') {
        const close = text.indexOf('*/', i + 2);
        if (close < 0) fail('a /* comment is never closed');
        i = close + 2;
        continue;
      }
      return;
    }
  }

  function readString() {
    const q = text[i++];
    let out = '';
    for (;;) {
      if (i >= text.length) fail('a text value is never closed');
      const c = text[i++];
      if (c === q) break;
      if (q === '`' && c === '$' && text[i] === '{') fail('a `template` with ${...} inside cannot be read without running code');
      if ((c === '\n' || c === '\r') && q !== '`') fail('a text value runs onto the next line (missing closing quote?)');
      if (c !== '\\') { out += c; continue; }
      const e = text[i++];
      switch (e) {
        case 'n': out += '\n'; break;
        case 't': out += '\t'; break;
        case 'r': out += '\r'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'v': out += '\v'; break;
        case '0': out += '\0'; break;
        case '\r': if (text[i] === '\n') i++; break;   // backslash at end of line = continue
        case '\n': case ' ': case ' ': break;
        case 'x': {
          const h = text.slice(i, i + 2);
          if (!/^[0-9a-fA-F]{2}$/.test(h)) fail('bad \\x escape');
          out += String.fromCharCode(parseInt(h, 16)); i += 2; break;
        }
        case 'u': {
          if (text[i] === '{') {
            const close = text.indexOf('}', i);
            const h = close > 0 ? text.slice(i + 1, close) : '';
            if (!/^[0-9a-fA-F]{1,6}$/.test(h)) fail('bad \\u{...} escape');
            out += String.fromCodePoint(parseInt(h, 16)); i = close + 1;
          } else {
            const h = text.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(h)) fail('bad \\u escape');
            out += String.fromCharCode(parseInt(h, 16)); i += 4;
          }
          break;
        }
        default:
          if (e === undefined) fail('text ends inside an escape');
          out += e;                                      // \' \" \\ \/ and friends
      }
    }
    return out;
  }

  function readStringJoin() {
    // "part one " + "part two" — a common way to split a long line by hand.
    let s = readString();
    for (;;) {
      const save = i;
      skip();
      if (text[i] !== '+') { i = save; return s; }
      i++; skip();
      const c = text[i];
      if (c !== '"' && c !== "'" && c !== '`') fail('"+" can only join two pieces of text here');
      s += readString();
    }
  }

  function readNumber() {
    const m = /^[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 64));
    if (!m) fail('expected a value');
    i += m[0].length;
    const raw = m[0].replace(/_/g, '');
    const n = /0[xX]/.test(raw) ? (raw[0] === '-' ? -1 : 1) * parseInt(raw.replace(/^[+-]/, ''), 16) : Number(raw);
    if (!isFinite(n)) fail('a number could not be read');
    return n;
  }

  function setKey(obj, key, val) {
    // A key literally named "__proto__" must become a normal field, not change
    // what kind of object this is.
    if (key === '__proto__') Object.defineProperty(obj, key, { value: val, enumerable: true, writable: true, configurable: true });
    else obj[key] = val;
  }

  function readValue() {
    skip();
    const c = text[i];
    if (c === '{') return readObject();
    if (c === '[') return readArray();
    if (c === '"' || c === "'" || c === '`') return readStringJoin();
    if (c === undefined) fail('the text ended where a value was expected');
    const word = /^[A-Za-z_$][\w$]*/.exec(text.slice(i, i + 32));
    if (word) {
      const w = word[0];
      if (w === 'true')  { i += 4; return true; }
      if (w === 'false') { i += 5; return false; }
      if (w === 'null')  { i += 4; return null; }
      if (w === 'undefined') { i += 9; return null; }
      fail('"' + w + '" is code, not a value');
    }
    return readNumber();
  }

  function readObject() {
    if (++depth > 200) fail('nested too deeply');
    i++;                                         // {
    const obj = {};
    for (;;) {
      skip();
      if (text[i] === '}') { i++; break; }
      let key;
      const c = text[i];
      if (c === '"' || c === "'" || c === '`') key = readString();
      else {
        const m = /^(?:[A-Za-z_$][\w$]*|\d+(?:\.\d+)?)/.exec(text.slice(i, i + 128));
        if (!m) fail('expected a field name');
        key = m[0]; i += key.length;
      }
      skip();
      if (text[i] !== ':') fail('expected ":" after "' + key + '"');
      i++;
      setKey(obj, key, readValue());
      skip();
      if (text[i] === ',') { i++; continue; }  // a trailing comma is fine: the loop sees "}" next
      if (text[i] === '}') { i++; break; }
      fail('expected "," or "}" after "' + key + '"');
    }
    depth--;
    return obj;
  }

  function readArray() {
    if (++depth > 200) fail('nested too deeply');
    i++;                                         // [
    const arr = [];
    for (;;) {
      skip();
      if (text[i] === ']') { i++; break; }
      if (text[i] === ',') fail('an empty slot ",," in a list');
      arr.push(readValue());
      skip();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; break; }
      fail('expected "," or "]" in a list');
    }
    depth--;
    return arr;
  }

  const value = readValue();
  return { value, end: i };
}

/**
 * Find `const NAME = <value>` in a page and read the value.
 * Tolerates `let`/`var` and any spacing. If the name appears more than once
 * (say, an old copy left in a comment) each place is tried in order and the
 * first one that reads AND looks right (`check`) wins.
 * Returns { value } or { error: 'why' }.
 */
function findConstant(html, name, check) {
  const re = new RegExp('\\b(?:const|let|var)\\s+' + name + '\\s*=\\s*', 'g');
  let m, lastErr = 'not found';
  while ((m = re.exec(html))) {
    const at = m.index + m[0].length;
    const c = html[at];
    if (c !== '[' && c !== '{') { lastErr = 'is not a list or object'; continue; }
    try {
      const { value } = readLiteral(html, at);
      const bad = check(value);
      if (!bad) return { value };
      lastErr = bad;
    } catch (err) {
      if (!(err instanceof ReadError)) throw err;
      lastErr = err.message;
    }
  }
  return { error: name + ' ' + lastErr };
}

/* ---------------------------------------------------------------------------
 * 2. SMALL HELPERS (each mirrors the reference normalizer exactly)
 * ------------------------------------------------------------------------ */

const has = (o, k) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const get = (o, k) => (has(o, k) && o[k] !== undefined ? o[k] : null);

// Python's idea of "empty": the reference uses `x or default`, and in Python an
// empty list, empty object, "" and 0 all count as empty. JavaScript disagrees
// about [] and {}, so we spell it out to stay identical.
function truthy(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}
const or = (v, d) => (truthy(v) ? v : d);
const asList = (v) => (Array.isArray(v) ? v : (truthy(v) ? [v] : []));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const BRANDS = ['Apple', 'Google', 'Motorola', 'OnePlus', 'Samsung'];
function brandOf(model) {
  const m = String(model).toLowerCase();
  for (const b of BRANDS) if (m.startsWith(b.toLowerCase())) return b;
  if (m.includes('iphone')) return 'Apple';
  if (m.includes('pixel')) return 'Google';
  if (m.includes('galaxy') || m.includes('note')) return 'Samsung';
  if (m.includes('moto') || m.includes('razr')) return 'Motorola';
  return 'Other';
}

// The sheets' own wording for each plan code (6th Gen and Upgrade "Plan" fact,
// index.html pgOpen). A code neither sheet knows is shown title-cased.
const PLAN_LABELS = {
  plus_or_premium_unl: 'Mobile Plus or Premium Unlimited',
  any_mobile_plan: 'Any XM plan — Select included',
  smartwatch_plan_diamond: 'Smartwatch plan, Diamond only',
  mobile_select_or_plus: 'Mobile Select ($0) or Mobile Plus ($15) — first line',
  tablet_plan: 'Unlimited tablet plan, new tablet line',
  tablet_plan_unlimited: 'Unlimited tablet plan',
  any: 'Any XM plan'
};
// Python's str.title(): a letter is capitalised when the character before it
// is not a letter, otherwise lower-cased.
function pyTitle(s) {
  let out = '', prevLetter = false;
  for (const ch of s) {
    const letter = ch.toLowerCase() !== ch.toUpperCase();
    out += letter ? (prevLetter ? ch.toLowerCase() : ch.toUpperCase()) : ch;
    prevLetter = letter;
  }
  return out;
}
function planLabel(p) {
  const pe = String(or(get(p, 'plan_eligibility'), 'any'));
  return has(PLAN_LABELS, pe) ? PLAN_LABELS[pe] : pyTitle(pe.split('_').join(' '));
}

/** Money as whole dollars: 500, "500" and "$500" all become 500; anything else null. */
function dollars(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.replace(/[$,\s]/g, '');
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  }
  return null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
// "Oct", "Sept", "October" -> 10. At least three letters, and they must be the
// start of a real month name, so "Octopus" is not October.
function monthNum(word) {
  const w = String(word).toLowerCase();
  if (w.length < 3) return 0;
  for (let k = 0; k < 12; k++) if (MONTHS[k].indexOf(w) === 0) return k + 1;
  return 0;
}

/** A date written by hand -> 'YYYY-MM-DD'. Accepts 2026-11-10, 2026-11-1,
 *  11/10/2026, 11/10/26, "Nov 10, 2026", "November 10th 2026" and
 *  "10 Nov 2026". Returns null when it is not a date at all. */
function isoDate(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T ])/.exec(s);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) {
    mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000;
  } else if ((m = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s))) {
    mo = monthNum(m[1]); d = +m[2]; y = +m[3];
  } else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(s))) {
    d = +m[1]; mo = monthNum(m[2]); y = +m[3];
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
// A date the guide cannot read becomes null (= "no limit on that side") and
// parseSheetsAll() puts a warning in `warnings` so the problem is visible.
const cleanDate = (v) => isoDate(v);

/** The deal card as a rep reads it. The Upgrade sheet once wrote a source file
 *  name into it ("DEALS18 (no separate card) · trade-in list DEALS94-….pdf");
 *  file names are internal, so any " · … .pdf" part is taken off. */
function cleanDealCard(v) {
  if (typeof v !== 'string') return v === undefined ? null : v;
  return v.replace(/\s*·\s*[^·]*\.pdf\b[^·]*/gi, '').trim();
}

/* ---------------------------------------------------------------------------
 * 3. TRADE-IN LISTS
 * ------------------------------------------------------------------------ */

const CONDITIONS = ['good', 'fair', 'poor'];

/** 6th Gen sheet: TIPS_PROMOS[bucket] = { tier_ladder:{1:930,...}, floor_value,
 *  list_updated, trade_ins:[{model, condition:'Good', value}] }. */
function trade6g(tp) {
  const ladder = Object.keys(tp.tier_ladder)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((k) => tp.tier_ladder[k]);
  const byModel = new Map();
  for (const r of tp.trade_ins) {
    if (!byModel.has(r.model)) byModel.set(r.model, { model: r.model, brand: brandOf(r.model), good: null, fair: null, poor: null });
    const cond = String(r.condition).toLowerCase();
    if (CONDITIONS.includes(cond)) byModel.get(r.model)[cond] = dollars(r.value);
  }
  const devices = Array.from(byModel.values());
  return {
    bucket: get(tp, 'promo_tag'),
    ladder,
    max: Math.max.apply(null, ladder),
    floor: lowestValue(devices, get(tp, 'floor_value')),
    list_updated: get(tp, 'list_updated'),
    devices
  };
}

/** The real "every accepted phone gets at least $X": the lowest value that is
 *  actually on the list, not a separately typed number that can drift from it.
 *  `typed` is used only for an empty list. */
function lowestValue(devices, typed) {
  let low = null;
  for (const d of devices) for (const c of CONDITIONS) {
    if (typeof d[c] === 'number' && (low === null || d[c] < low)) low = d[c];
  }
  return low === null ? (typed === undefined ? null : typed) : low;
}

/** Upgrade sheet: one table, one column per bucket, each cell three tier
 *  digits for Good/Fair/Poor ("345"); a digit n means ladder[n-1], and "-" (or
 *  any digit outside the ladder) means that condition is not accepted. This is
 *  the same rule the Upgrade sheet itself uses (upgTipsValueInBucket). */
function tradeUpg(tag, buckets, table) {
  const b = buckets[tag], col = b.col, ladder = b.ladder, devices = [];
  for (const row of table) {
    const s = String(row[col] === undefined || row[col] === null ? '' : row[col]);
    if (!/[1-5]/.test(s)) continue;
    const vals = [0, 1, 2].map((k) => {
      const n = /\d/.test(s[k] || '') ? parseInt(s[k], 10) : 0;
      return n >= 1 && n <= ladder.length ? ladder[n - 1] : null;
    });
    devices.push({ model: row[0], brand: brandOf(row[0]), good: vals[0], fair: vals[1], poor: vals[2] });
  }
  // max and floor come from the ladder and the list itself: the Upgrade sheet's
  // own code never reads its typed `max` / `floor`, so they can go stale.
  return { bucket: tag, ladder, max: Math.max.apply(null, ladder), floor: lowestValue(devices, get(b, 'floor')), list_updated: null, devices };
}

/* ---------------------------------------------------------------------------
 * 4a. TAKING THE SHEETS' INTERNAL NOTES OUT OF THE TEXT
 *
 *   The promo text in the sheets mixes rep-facing rules with Jeff's own
 *   bookkeeping: "(Jeff, 2026-10-09). Flagged to the deal desk.", "the CD865
 *   card text … governs", "Order Entry steps are copy-pasted…", "The sheet
 *   applies whichever…". The sheets already strip those for their customer
 *   view (6th Gen index.html: PG_REP_NOTE, PG_CARD_NOTE, pgCustomerText,
 *   pgDropCaveats). This is a port of that same code — the 6th Gen version,
 *   which is the more careful of the two — with four deliberate differences,
 *   because the reader here is a REP, not a customer:
 *     1. Watch-outs are cleaned sentence by sentence BEFORE the whole-line
 *        test, so "Not combinable with the no-trade deal on the same line.
 *        The sheet applies whichever…" keeps its first sentence (a real rule)
 *        and loses only the second.
 *     2. Rep coaching ("if the rep starts the buy flow before…", "quoting
 *        $400 here costs…") is KEPT — reps are the audience. Only the parts of
 *        the sheets' coaching filter that are about the quote sheet's own
 *        screen or its change log go: "surface it", "never assume",
 *        "expired 9/1".
 *     3. DEALS / CD codes are matched in capitals only, on both sheets. (The
 *        Upgrade sheet's own filter matches "deals" in any case, so it drops
 *        "…not on the other upgrade trade-in deals" by mistake.)
 *     4. A line that starts "Rep note" is dropped whole.
 *   contract/make_fixture.py does exactly the same, so both agree.
 * ------------------------------------------------------------------------ */

const NOTE = {
  rep: /\b(?:Jeff|deal desk|Celestial)\b|\b(?:the|Upgrade) sheet\b|^RE-ISSUED\b|\bconfirmed \d+\/\d+|^Rep note\b/i,
  repCode: /\bDEALS\d+\b|\b[A-Za-z]+(?:_[A-Za-z0-9]+)+\b/,
  card: /\b(?:cards?|Celestial|Jeff|deal desk)\b|\b(?:the|Upgrade) sheet\b/i,
  cardCode: /\bCD\d{3}\b|\bDEALS\d+\b/,
  sheetUi: /\b(?:surface it\b|never assume\b|expired \d+\/\d+)/i,
  caveat: /\b(?:verify|confirm)\b/i
};
// "gift card" (the $200 Visa offer) is not a deal card.
const noGiftCard = (x) => String(x == null ? '' : x).replace(/\bgift cards?\b/gi, 'gift');
const isCardNote = (x) => { const t = noGiftCard(x); return NOTE.card.test(t) || NOTE.cardCode.test(t); };
const isRepNote = (x) => NOTE.rep.test(x) || NOTE.repCode.test(x);

/** One line of promo text with the internal asides and sentences taken out.
 *  `guide` is the same sheet's PROMO_GUIDE, used to turn "check CD872" and
 *  internal tags like tips_agm_930 into the offer's real name. */
function repText(x, guide) {
  let t = String(x == null ? '' : x);
  const byCard = (code) => { const q = guide.find((z) => isObj(z) && z.deal_card === code); return q && q.marketing_name ? '\u201c' + q.marketing_name + '\u201d' : ''; };
  t = t.replace(/\b(check|see|try)\s+(CD\d{3})\b/g, (m, v, code) => { const n = byCard(code); return n ? v + ' ' + n : m; });
  // Asides: "(Jeff, 2026-09-28)" and "(CD824, 9/18)" go; "(CD871, up to $1,300)" keeps the money.
  t = t.replace(/\s*\(([^()]*)\)/g, (m, inner) => {
    if (/\b(?:Celestial|Jeff|cards?)\b/i.test(noGiftCard(inner))) return '';
    if (!NOTE.cardCode.test(inner)) return m;
    const rest = inner.replace(/\b(?:CD\d{3}|DEALS\d+)\b[,;:]?\s*/g, '').trim();
    return /\$/.test(rest) ? ' (' + rest + ')' : '';
  });
  // Sentence by sentence (". " then a capital, so "$299.99" is never split):
  // a trailing " — …" clause about the deal card is cut, and a sentence that is
  // about the deal card or the quote sheet's own screen is left out.
  let cut = false;
  const parts = t.split(/\.\s+(?=[A-Z])/).map((sn) =>
    sn.replace(/\s+—\s+[^—]*$/, (cl) => { if (isCardNote(cl)) { cut = true; return ''; } return cl; }));
  const kept = parts.filter((sn) => sn.trim() && !isCardNote(sn) && !NOTE.sheetUi.test(sn));
  if (kept.length < parts.length) cut = true;
  t = kept.join('. ');
  if (cut && t && !/[.!?:]$/.test(t)) t += '.';
  return t.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (tg) => {
    const q = guide.find((z) => isObj(z) && z.tag === tg);
    return q && typeof q.marketing_name === 'string' ? '\u201c' + q.marketing_name + '\u201d' : tg;
  });
}

/** A watch-out that states a rule and then adds "— verify with the deal desk."
 *  keeps the rule (the sheets' pgDropCaveats). The first sentence always stays. */
function dropCaveats(x) {
  const orig = String(x == null ? '' : x);
  const lead = /^Carried forward from [^:]*:\s*/i;
  const hadLead = lead.test(orig);
  let t = orig.replace(lead, '');
  let parts = t.split(/\.\s+(?=[A-Z])/), before;
  do {
    before = parts.join('. ');
    while (parts.length > 1 && NOTE.caveat.test(parts[parts.length - 1])) parts.pop();
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\s+—\s+(?:verify|confirm)\b[^—]*$/i, '');
  } while (parts.join('. ') !== before);
  t = parts.join('. ').trim();
  if (t !== orig.trim()) {
    if (t && !/[.!?:]$/.test(t)) t += '.';
    if (hadLead) t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t;
}

// Only text is cleaned; anything else in a list (unlikely) is passed through.
function repList(arr, guide, isWatchouts) {
  if (!Array.isArray(arr)) return arr;
  return arr
    .map((x) => (typeof x === 'string' ? repText(isWatchouts ? dropCaveats(x) : x, guide) : x))
    .filter((x) => (typeof x === 'string' ? x && !isRepNote(x) : x !== null && x !== undefined));
}
const repOne = (v, guide) => (typeof v === 'string' && v ? repText(v, guide) : v);

/* ---------------------------------------------------------------------------
 * 4. ONE PROMO -> THE SHAPE THE GUIDE AND ASK THE CHEF USE
 *    Only rep-facing fields are copied. The sheets' internal notes (source,
 *    discrepancy, values_in, source_pdf, verified cards, routing) never leave.
 * ------------------------------------------------------------------------ */

function normalize(p, sheets, trade, guide) {
  const s = or(get(p, 'summary'), {});
  const ti = or(get(p, 'trade_in'), {});
  const offer = or(get(p, 'offer'), {});
  const dates = or(get(p, 'dates'), {});
  const lt = get(p, 'line_type');
  return {
    id: p.tag,
    title: p.marketing_name,
    deal_card: cleanDealCard(get(p, 'deal_card')),
    audience: lt === 'upgrade' ? 'upgrade' : (lt === 'new_line' ? 'new_line' : or(lt, 'any')),
    line_type_label: get(p, 'line_type_label'),
    sheets,
    savings: get(offer, 'savings'),
    mechanism: get(offer, 'mechanism'),
    dates: { start: cleanDate(get(dates, 'start')), end: cleanDate(get(dates, 'end')) },
    plan: planLabel(p),
    brands: or(get(p, 'device_brands'), []),
    device_scope: or(get(p, 'device_scope'), ''),
    device_type: or(get(or(get(p, 'display_when'), {}), 'device_type'), 'phone'),
    diamond_only: truthy(get(p, 'diamond_only')),
    trade_in_required: truthy(get(ti, 'required')),
    port_required: truthy(get(or(get(p, 'port'), {}), 'required')),
    mobile_service: or(get(p, 'mobile_service'), []),
    badges: or(get(p, 'badges'), []),
    hook: has(s, 'hook') ? repOne(s.hook, guide) : '',
    qualify: has(s, 'qualify') ? repList(s.qualify, guide, false) : [],
    steps: has(s, 'steps') ? repList(s.steps, guide, false) : [],
    deadlines: has(s, 'deadlines') ? repList(s.deadlines, guide, false) : [],
    watchouts: has(s, 'watchouts') ? repList(s.watchouts, guide, true) : [],
    credit_amount: has(s, 'credit_amount') ? repOne(s.credit_amount, guide) : '',
    trade_in: trade
  };
}

/* ---------------------------------------------------------------------------
 * 5. READING BOTH SHEETS
 * ------------------------------------------------------------------------ */

// What each constant must look like before we trust it. A string returned is
// the reason it was refused.
const CHECK = {
  PROMO_GUIDE(v) {
    if (!Array.isArray(v)) return 'is not a list';
    if (!v.length) return 'is an empty list';
    if (!v.some((p) => isObj(p) && typeof p.tag === 'string')) return 'has no promos with a "tag"';
    return '';
  },
  TIPS_PROMOS(v) {
    if (!isObj(v)) return 'is not an object';
    for (const k of Object.keys(v)) {
      const b = v[k];
      if (!isObj(b) || !isObj(b.tier_ladder) || !Array.isArray(b.trade_ins)) return 'bucket "' + k + '" is missing tier_ladder or trade_ins';
      if (!Object.keys(b.tier_ladder).length || Object.values(b.tier_ladder).some((x) => typeof x !== 'number')) return 'bucket "' + k + '" has a bad tier_ladder';
      if (b.trade_ins.some((r) => !isObj(r) || typeof r.model !== 'string')) return 'bucket "' + k + '" has a trade-in row without a model';
    }
    return '';
  },
  UPG_TIPS_BUCKETS(v) {
    if (!isObj(v)) return 'is not an object';
    for (const k of Object.keys(v)) {
      const b = v[k];
      if (!isObj(b) || typeof b.col !== 'number' || !Array.isArray(b.ladder) || !b.ladder.length || b.ladder.some((x) => typeof x !== 'number')) return 'bucket "' + k + '" is missing col or ladder';
    }
    return '';
  },
  UPG_TIPS_TABLE(v) {
    if (!Array.isArray(v) || !v.length) return 'is empty or not a list';
    if (v.some((r) => !Array.isArray(r) || typeof r[0] !== 'string')) return 'has a row that is not [device, ...]';
    return '';
  }
};

// Which constants each sheet must have. If ANY of them will not read, that
// whole sheet is treated as unreadable (its promos then come from the saved
// copy) — half a sheet, e.g. promos without their trade-in values, would be
// worse than yesterday's full sheet.
const NEEDS = {
  new_line_sheet: ['PROMO_GUIDE', 'TIPS_PROMOS'],
  upgrade_sheet:  ['PROMO_GUIDE', 'UPG_TIPS_BUCKETS', 'UPG_TIPS_TABLE']
};

function readSheet(key, html) {
  if (typeof html !== 'string' || html.length < 20) {
    return { ok: false, error: SHEETS[key].label + ': nothing to read' };
  }
  const got = {};
  for (const name of NEEDS[key]) {
    const r = findConstant(html, name, CHECK[name]);
    if (r.error) return { ok: false, error: SHEETS[key].label + ': ' + r.error };
    got[name] = r.value;
  }
  return { ok: true, data: got };
}

const SHEET_OF = { mobile_6th_gen: 'new_line_sheet', upgrade: 'upgrade_sheet' };

/**
 * Both sheets -> every promo, expired or not. Same as parseSheets() without the
 * date filter (the snapshot job needs promos that start in the future too).
 * Returns { promos, warnings, failed: ['upgrade_sheet', ...] }.
 */
export function parseSheetsAll(newLineHtml, upgradeHtml) {
  const warnings = [];
  const failed = [];
  const read = {
    new_line_sheet: readSheet('new_line_sheet', newLineHtml),
    upgrade_sheet: readSheet('upgrade_sheet', upgradeHtml)
  };
  for (const k of Object.keys(read)) {
    if (!read[k].ok) { failed.push(k); warnings.push(read[k].error); }
  }
  const a = read.new_line_sheet.ok ? read.new_line_sheet.data : {};
  const u = read.upgrade_sheet.ok ? read.upgrade_sheet.data : {};
  const ta = a.TIPS_PROMOS || {};
  const ub = u.UPG_TIPS_BUCKETS || {};
  const ut = u.UPG_TIPS_TABLE || [];

  const out = new Map();                       // id -> promo, in first-seen order
  const lists = [['new_line_sheet', a.PROMO_GUIDE || []], ['upgrade_sheet', u.PROMO_GUIDE || []]];
  for (const [src, plist] of lists) {
    plist.forEach((p, n) => {
      if (!isObj(p) || typeof p.tag !== 'string' || !p.tag) {
        warnings.push(SHEETS[src].label + ': promo #' + (n + 1) + ' has no "tag" and was skipped');
        return;
      }
      try {
        const home = get(p, 'sheet');
        const sheets = Array.from(new Set([home].concat(asList(get(p, 'additional_sheets')))
          .filter((x) => has(SHEET_OF, x)).map((x) => SHEET_OF[x]))).sort();
        // A promo listed on both sheets is taken from its HOME sheet's copy;
        // the other copy only adds its sheet to `sheets`.
        const homeSrc = has(SHEET_OF, home) ? SHEET_OF[home] : null;
        const prev = out.get(p.tag);
        if (prev && homeSrc !== src) {
          prev.sheets = Array.from(new Set(prev.sheets.concat(sheets))).sort();
          return;
        }
        // The copy on a NON-home sheet is never used to stand in for its home
        // sheet: when the home sheet will not read, this promo is left out here
        // and loadPromos() takes the home copy from the saved snapshot instead.
        // (The two copies differ — e.g. the Upgrade sheet's Visa card is
        // written as a pitch for an upgrade quote.)
        if (homeSrc && homeSrc !== src && failed.indexOf(homeSrc) >= 0) return;
        if (typeof p.marketing_name !== 'string') throw new Error('has no marketing_name');
        const bucket = get(or(get(p, 'trade_in'), {}), 'bucket');
        let trade = null;
        if (truthy(bucket) && has(ta, bucket)) trade = trade6g(ta[bucket]);
        else if (truthy(bucket) && has(ub, bucket)) trade = tradeUpg(bucket, ub, ut);
        else if (truthy(bucket) && truthy(get(get(p, 'trade_in'), 'required'))) {
          warnings.push(p.tag + ': trade-in list "' + bucket + '" was not found on either sheet');
        }
        const promo = normalize(p, sheets, trade, (src === 'new_line_sheet' ? a : u).PROMO_GUIDE || []);
        // A date the guide cannot read: say so, and treat it as "no limit".
        const rawDates = or(get(p, 'dates'), {});
        for (const side of ['start', 'end']) {
          const raw = get(rawDates, side);
          if (raw !== null && raw !== '' && promo.dates[side] === null) {
            warnings.push(SHEETS[src].label + ': promo "' + p.tag + '" has a ' + side + ' date the guide cannot read (' +
              JSON.stringify(raw) + '), so it is treated as having no ' + side + ' date' +
              (side === 'end' ? ' and will not expire by itself' : '') + '. Write it like 2026-11-10.');
          }
        }
        // The typed max / floor on the sheet disagree with the list itself.
        if (trade) {
          const typedFloor = has(ta, bucket) ? get(ta[bucket], 'floor_value') : get(ub[bucket], 'floor');
          const typedMax = has(ta, bucket) ? null : get(ub[bucket], 'max');
          if (typeof typedFloor === 'number' && typedFloor !== trade.floor) {
            warnings.push(p.tag + ': the sheet says the lowest trade-in value is $' + typedFloor + ', but the lowest on its list is $' + trade.floor + ' (the list is used).');
          }
          if (typeof typedMax === 'number' && typedMax !== trade.max) {
            warnings.push(p.tag + ': the sheet says the top trade-in value is $' + typedMax + ', but its ladder tops out at $' + trade.max + ' (the ladder is used).');
          }
        }
        if (prev) promo.sheets = Array.from(new Set(prev.sheets.concat(sheets))).sort();
        out.set(p.tag, promo);               // Map keeps the first-seen position
      } catch (err) {
        warnings.push(SHEETS[src].label + ': promo "' + p.tag + '" was skipped — ' + (err && err.message));
      }
    });
  }
  return { promos: Array.from(out.values()), warnings, failed };
}

/**
 * Both sheets -> the promos that are on TODAY (Chicago date).
 * `promos` matches contract/make_fixture.py exactly.
 * Also returns `warnings` (plain-English problems) and `failed` (which sheets
 * could not be read at all; their promos are simply missing here — loadPromos
 * fills them in from the saved copy).
 */
export function parseSheets(newLineHtml, upgradeHtml, today) {
  const day = today || chicagoToday();
  const r = parseSheetsAll(newLineHtml, upgradeHtml);
  return { promos: r.promos.filter((p) => isActive(p, day)), warnings: r.warnings, failed: r.failed };
}

/* ---------------------------------------------------------------------------
 * 6. DATES
 * ------------------------------------------------------------------------ */

/** Today's date in Chicago, as 'YYYY-MM-DD'. Every store reads the same list
 *  regardless of the iPad's own clock setting or time zone. */
export function chicagoToday(now) {
  const when = now instanceof Date ? now : new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(when);
    const v = {};
    for (const p of parts) v[p.type] = p.value;
    if (v.year && v.month && v.day) return v.year + '-' + v.month + '-' + v.day;
  } catch (e) { /* very old browser without time zones: use the device's own date */ }
  return when.getFullYear() + '-' + String(when.getMonth() + 1).padStart(2, '0') + '-' + String(when.getDate()).padStart(2, '0');
}

/** Is the promo on today? Start and end days both count. A missing date means
 *  "no limit on that side". A date that is not a date at all is ignored rather
 *  than guessed at. */
export function isActive(promo, today) {
  const day = isoDate(today || '') || chicagoToday();
  const d = (promo && promo.dates) || {};
  const start = isoDate(d.start || ''), end = isoDate(d.end || '');
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

/** Not expired yet (may not have started). The snapshot keeps these so a promo
 *  that starts tomorrow is already in the saved copy tomorrow. */
export function notExpired(promo, today) {
  const day = isoDate(today || '') || chicagoToday();
  const end = isoDate(((promo && promo.dates) || {}).end || '');
  return !end || day <= end;
}

/* ---------------------------------------------------------------------------
 * 7. TRADE-IN LOOKUPS
 * ------------------------------------------------------------------------ */

/** 'Apple iPhone 13 Pro' -> 'apple-iphone-13-pro'. Used in page addresses. */
export function deviceSlug(model) {
  let s = String(model == null ? '' : model);
  try { s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* no normalize: fine */ }
  return s.toLowerCase().replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * What one device is worth on one promo, in whole dollars.
 * `model` may be the name as written ('Apple iPhone 13') or its slug
 * ('apple-iphone-13'). `condition` is 'good', 'fair' or 'poor'; leave it out
 * to get the best value the device can earn ("up to").
 * Returns null when the promo has no trade-in, the device is not on its list,
 * or the list does not take that condition.
 */
export function tradeValue(promo, model, condition) {
  const t = promo && promo.trade_in;
  if (!t || !Array.isArray(t.devices) || model == null) return null;
  const want = deviceSlug(model);
  const dev = t.devices.find((d) => d.model === model) || t.devices.find((d) => deviceSlug(d.model) === want);
  if (!dev) return null;
  if (condition == null || condition === '') {
    const vals = CONDITIONS.map((c) => dev[c]).filter((v) => typeof v === 'number');
    return vals.length ? Math.max.apply(null, vals) : null;
  }
  const c = String(condition).trim().toLowerCase();
  const key = c === 'g' ? 'good' : c === 'f' ? 'fair' : c === 'p' ? 'poor' : c;
  if (!CONDITIONS.includes(key)) return null;
  return typeof dev[key] === 'number' ? dev[key] : null;
}

/**
 * Every trade-in device across the given promos, for "what is my phone worth?"
 * lookups: [{ slug, model, brand, offers: [{ promo_id, title, deal_card,
 * audience, good, fair, poor }] }], sorted by brand then model.
 */
export function tradeDevices(promos) {
  const bySlug = new Map();
  for (const p of promos || []) {
    if (!p || !p.trade_in || !Array.isArray(p.trade_in.devices)) continue;
    for (const d of p.trade_in.devices) {
      const slug = deviceSlug(d.model);
      if (!bySlug.has(slug)) bySlug.set(slug, { slug, model: d.model, brand: d.brand, offers: [] });
      bySlug.get(slug).offers.push({
        promo_id: p.id, title: p.title, deal_card: p.deal_card, audience: p.audience,
        good: d.good, fair: d.fair, poor: d.poor
      });
    }
  }
  return Array.from(bySlug.values()).sort((x, y) =>
    x.brand === y.brand ? x.model.localeCompare(y.model, 'en', { numeric: true }) : x.brand.localeCompare(y.brand));
}

/* ---------------------------------------------------------------------------
 * 8. LOADING: LIVE SHEETS FIRST, SAVED COPY AS THE FLOOR
 * ------------------------------------------------------------------------ */

function withTimeout(fetchImpl, url, init, timeoutMs, what) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = 0;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { if (ctrl) ctrl.abort(); } catch (e) { /* ignore */ }
      reject(new Error(what + ' took longer than ' + Math.round(timeoutMs / 1000) + 's'));
    }, timeoutMs);
  });
  const opts = Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {});
  const run = (async () => {
    let res;
    try { res = await fetchImpl(url, opts); }
    catch (err) {
      // Some fetch versions (older Node) refuse the `cache` option outright;
      // that is not a network problem, so ask once more without it.
      if (err instanceof TypeError && /cache/i.test(String(err.message)) && 'cache' in opts) {
        const o2 = Object.assign({}, opts); delete o2.cache;
        res = await fetchImpl(url, o2);
      } else throw err;
    }
    if (!res || !res.ok) throw new Error(what + ' answered ' + (res ? res.status : 'nothing'));
    return await res.text();
  })();
  return Promise.race([run, timedOut]).finally(() => clearTimeout(timer));
}

function bust(url) {
  // A fresh address every time, so neither the browser nor GitHub's cache in
  // front of the sheet can hand back a copy from before Jeff's last edit.
  return url + (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now().toString(36);
}

function defaultSnapshotUrl() {
  try { return new URL(SNAPSHOT_PATH, import.meta.url).href; }
  catch (e) { return '/' + SNAPSHOT_PATH.replace(/^\.\.\//, ''); }
}

async function readSnapshot(fetchImpl, url, timeoutMs) {
  // `no-cache`, not `no-store`: the browser checks for a newer copy, but the
  // site's offline helper (sw.js) may still answer from its stored copy when
  // the store has no internet — exactly when the saved copy matters most.
  const text = await withTimeout(fetchImpl, url, { cache: 'no-cache', credentials: 'same-origin' }, timeoutMs, 'the saved copy');
  const j = JSON.parse(text);
  if (!j || !Array.isArray(j.promos)) throw new Error('the saved copy has no promos list');
  return j;
}

// --- the 5-minute cache ------------------------------------------------------
// Two layers: an in-memory one on the window (shared by the hashed and the
// unhashed copy of this module in the same page) and sessionStorage (shared
// with the guide, which runs in a frame of the same site). Storage can throw
// in Safari private mode or when full, so every touch is wrapped.
const MEM = '__cccPromosCache';
function memGet() { try { return globalThis[MEM] || null; } catch (e) { return null; } }
function memSet(v) { try { globalThis[MEM] = v; } catch (e) { /* ignore */ } }
function store() { try { return globalThis.sessionStorage || null; } catch (e) { return null; } }

function cacheRead() {
  const now = Date.now();
  const fresh = (c) => c && c.v === 1 && typeof c.at === 'number' && now - c.at >= 0 && now - c.at < c.ttl && c.data && Array.isArray(c.data.promos);
  const m = memGet();
  if (fresh(m)) return m.data;
  const s = store();
  if (!s) return null;
  try {
    const c = JSON.parse(s.getItem(CACHE_KEY) || 'null');
    if (fresh(c)) { memSet(c); return c.data; }
  } catch (e) { /* unreadable: ignore */ }
  return null;
}
function cacheWrite(data, ttl) {
  const c = { v: 1, at: Date.now(), ttl, data };
  memSet(c);
  const s = store();
  if (!s) return;
  try { s.setItem(CACHE_KEY, JSON.stringify(c)); }
  catch (e) { try { s.removeItem(CACHE_KEY); } catch (e2) { /* ignore */ } }
}

function finish(base, today) {
  return {
    version: 1,
    promos: base.promos.filter((p) => isActive(p, today)),
    source: base.source,
    sheets_from: base.sheets_from,
    fetched_at: base.fetched_at,
    generated_at: base.generated_at || undefined,
    warnings: base.warnings.slice()
  };
}

/**
 * The list of current promos, for the guide page and Ask the Chef.
 *
 * Options (all optional):
 *   live       true  = read the two sheets now (default); false = saved copy only
 *   timeoutMs  how long to wait for each download (default 20 s — the 6th Gen
 *              sheet is about a megabyte and store Wi-Fi can be slow)
 *   snapshotUrl  where the saved copy lives (default: the site's data folder)
 *   today      'YYYY-MM-DD' to pretend it is another day (default: Chicago today)
 *   fetchImpl  a fetch to use instead of the browser's (tests)
 *   fresh      true = ignore the 5-minute cache
 *
 * Resolves to { version: 1, promos, source: 'live'|'snapshot', sheets_from:
 * { new_line_sheet: 'live'|'snapshot'|'missing', upgrade_sheet: ... },
 * fetched_at, generated_at? (when the saved copy was used), warnings: [] }.
 * It does not reject: with nothing readable at all it resolves with an empty
 * list and a warning that says so.
 */
export async function loadPromos(opts) {
  const o = opts || {};
  const live = o.live !== false;
  const timeoutMs = o.timeoutMs > 0 ? o.timeoutMs : 20000;
  const today = isoDate(o.today || '') || chicagoToday();
  const fetchImpl = o.fetchImpl || ((u, i) => fetch(u, i));
  const snapshotUrl = o.snapshotUrl || defaultSnapshotUrl();

  // The cache is only for the real thing: a test that hands in its own fetch
  // must neither read nor leave behind a saved result.
  const useCache = !o.fetchImpl;
  if (live && !o.fresh && useCache) {
    const hit = cacheRead();
    if (hit) return finish(hit, today);
  }

  const warnings = [];
  let snap = null, snapErr = '';
  const getSnap = async () => {
    if (snap || snapErr) return snap;
    try { snap = await readSnapshot(fetchImpl, snapshotUrl, timeoutMs); }
    catch (err) { snapErr = 'The saved copy could not be read either: ' + (err && err.message); }
    return snap;
  };
  const fromSnapshot = (why) => {
    if (why) warnings.push(why);
    if (!snap) {
      if (snapErr) warnings.push(snapErr);
      return { promos: [], source: 'snapshot', sheets_from: { new_line_sheet: 'missing', upgrade_sheet: 'missing' }, fetched_at: new Date().toISOString(), warnings };
    }
    return { promos: snap.promos, source: 'snapshot', sheets_from: { new_line_sheet: 'snapshot', upgrade_sheet: 'snapshot' }, fetched_at: new Date().toISOString(), generated_at: snap.generated_at, warnings };
  };

  if (!live) {
    await getSnap();
    return finish(fromSnapshot(''), today);
  }

  // Both sheets at once; each one may fail on its own.
  const keys = ['new_line_sheet', 'upgrade_sheet'];
  const texts = await Promise.all(keys.map((k) =>
    withTimeout(fetchImpl, bust(SHEETS[k].url), { cache: 'no-store', credentials: 'omit', mode: 'cors' }, timeoutMs, SHEETS[k].label)
      .catch((err) => { warnings.push(SHEETS[k].label + ' could not be downloaded: ' + (err && err.message)); return null; })));

  let parsed;
  try { parsed = parseSheetsAll(texts[0], texts[1]); }
  catch (err) { parsed = { promos: [], warnings: ['The sheets could not be read: ' + (err && err.message)], failed: keys.slice() }; }
  for (const w of parsed.warnings) if (warnings.indexOf(w) < 0) warnings.push(w);

  const sheetsFrom = { new_line_sheet: 'live', upgrade_sheet: 'live' };
  let promos = parsed.promos;
  let source = 'live';

  if (parsed.failed.length === keys.length) {
    await getSnap();
    const result = fromSnapshot('Neither quote sheet could be read just now, so this is the saved copy.');
    if (useCache) cacheWrite(result, CACHE_MS_DEGRADED);
    return finish(result, today);
  }

  if (parsed.failed.length) {
    // One sheet is fine, the other is not: keep the good one live and borrow
    // the broken one's promos from the saved copy.
    await getSnap();
    const bad = parsed.failed[0];
    sheetsFrom[bad] = snap ? 'snapshot' : 'missing';
    warnings.push('Promos from the ' + SHEETS[bad].label + (snap ? ' are from the saved copy until it reads again.' : ' are missing until it reads again.'));
    if (snapErr) warnings.push(snapErr);
    if (snap) {
      const liveIds = new Set(promos.map((p) => p.id));
      const onBad = (p) => p && Array.isArray(p.sheets) && p.sheets.indexOf(bad) >= 0;
      // Promos missing from the live read that the broken sheet carries —
      // including shared promos whose HOME is the broken sheet (parseSheetsAll
      // leaves those out rather than rebuild them from the other sheet's copy).
      const borrowed = snap.promos.filter((p) => onBad(p) && !liveIds.has(p.id));
      // A live promo the broken sheet also lists keeps that sheet in `sheets`.
      const snapById = new Map(snap.promos.filter(onBad).map((p) => [p.id, p]));
      promos = promos.map((p) => (snapById.has(p.id) && p.sheets.indexOf(bad) < 0
        ? Object.assign({}, p, { sheets: p.sheets.concat([bad]).sort() }) : p));
      promos = bad === 'new_line_sheet' ? borrowed.concat(promos) : promos.concat(borrowed);
    }
  }

  // A sheet that reads but yields nothing current, while the saved copy has
  // current promos, is far more likely a broken edit than a real empty week.
  if (!promos.some((p) => isActive(p, today))) {
    await getSnap();
    if (snap && snap.promos.some((p) => isActive(p, today))) {
      const result = fromSnapshot('The quote sheets read, but showed no current promos while the saved copy has some — showing the saved copy.');
      if (useCache) cacheWrite(result, CACHE_MS_DEGRADED);
      return finish(result, today);
    }
  }

  const result = { promos, source, sheets_from: sheetsFrom, fetched_at: new Date().toISOString(), warnings };
  // Part of the list came from the saved copy: say how old that copy is.
  if (parsed.failed.length && snap) result.generated_at = snap.generated_at;
  if (useCache) cacheWrite(result, parsed.failed.length || warnings.length ? CACHE_MS_DEGRADED : CACHE_MS_LIVE);
  return finish(result, today);
}
