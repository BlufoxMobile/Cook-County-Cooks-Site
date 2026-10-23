#!/usr/bin/env node
/* =============================================================================
 * Cook County Cooks — build/promos-feed.test.mjs
 * CHECKS FOR assets/promos-feed.js (the Mobile Promotions feed)
 * -----------------------------------------------------------------------------
 *   node --test build/promos-feed.test.mjs
 *
 * Uses the local copies of the two quote sheets. Point it elsewhere with
 *   PROMO_SHEETS_DIR=/path/containing/both/sheet/folders
 * (default: the folder next to this repository, /home/claude/work in the build
 * sandbox). Tests that need the sheets are skipped, not failed, when the sheets
 * are not there — so this can run on a laptop without them.
 *
 * WHAT IS CHECKED, AND WHY
 *   parity       the feed gives EXACTLY what the reference converter
 *                (contract/make_fixture.py) gives for the same sheets and day.
 *   fail-soft    a broken sheet never blanks the page: the other sheet stays
 *                live, the broken one's promos come from the saved copy.
 *   tolerance    hand edits (trailing commas, 'single quotes', bare keys,
 *                comments, apostrophes in text) still read.
 *   dates        "today" is the Chicago date and the end day still counts.
 *   trade-ins    values come out in whole dollars, "not accepted" is null.
 * ========================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  SHEETS, CACHE_KEY, parseSheets, parseSheetsAll, loadPromos, deviceSlug, tradeValue,
  isActive, notExpired, chicagoToday, tradeDevices
} from '../assets/promos-feed.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHEETS_DIR = process.env.PROMO_SHEETS_DIR || resolve(ROOT, '..');
const NEW_LINE = join(SHEETS_DIR, 'Mobile-Quote-Sheet-6th-Gen', 'index.html');
const UPGRADE = join(SHEETS_DIR, 'Upgrade-Quote-Sheet', 'index.html');
const FIXTURE = join(SHEETS_DIR, 'contract', 'fixture-2026-10-23.json');
const REFERENCE = join(SHEETS_DIR, 'contract', 'make_fixture.py');
const HAVE = existsSync(NEW_LINE) && existsSync(UPGRADE);
const skip = HAVE ? false : 'quote sheets not found (set PROMO_SHEETS_DIR)';

const A = HAVE ? readFileSync(NEW_LINE, 'utf8') : '';
const U = HAVE ? readFileSync(UPGRADE, 'utf8') : '';
const DAY = '2026-10-23';
const plain = (x) => JSON.parse(JSON.stringify(x));      // drop undefined, like JSON does

/** Find a constant's value text in a sheet: [startOfValue, endOfValue). */
function span(html, name) {
  const at = html.indexOf(`const ${name} = `) + `const ${name} = `.length;
  // The data ends at the first ";\n" at depth 0 — fine for these generated blocks.
  let depth = 0, q = null;
  for (let k = at; k < html.length; k++) {
    const c = html[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (!depth) return [at, k + 1]; }
  }
  throw new Error('no ' + name);
}
function replaceValue(html, name, fn) {
  const [s, e] = span(html, name);
  return html.slice(0, s) + fn(html.slice(s, e)) + html.slice(e);
}

/** A fake fetch that serves the given bodies by URL prefix. */
function fakeFetch(routes, log = []) {
  return async (url, init) => {
    log.push({ url, init });
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        if (body instanceof Error) throw body;
        if (body === 404) return { ok: false, status: 404, text: async () => 'nope' };
        if (body === 'hang') return new Promise((_, rej) => init.signal && init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
        return { ok: true, status: 200, text: async () => body };
      }
    }
    return { ok: false, status: 404, text: async () => '' };
  };
}
const SNAP_URL = 'https://cookcountycooks.test/data/promos.json';
const snapshot = HAVE ? readFileSync(join(ROOT, 'data', 'promos.json'), 'utf8') : '{"version":1,"promos":[]}';

/* ---------------------------------------------------------------- parity -- */

test('parity: same promos as the reference fixture for 2026-10-23', { skip: skip || (!existsSync(FIXTURE) && 'no fixture') }, () => {
  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const r = parseSheets(A, U, DAY);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.failed, []);
  assert.equal(r.promos.length, fx.promos.length);
  assert.deepEqual(plain(r.promos), fx.promos);
});

test('parity: matches the reference converter on other days too', { skip: skip || (!existsSync(REFERENCE) && 'no reference') }, () => {
  for (const day of ['2026-05-10', '2026-10-30', '2026-10-31', '2026-11-10', '2026-11-11']) {
    const py = spawnSync('python3', [REFERENCE, NEW_LINE, UPGRADE, day], { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (py.status !== 0) return;                     // no python here: the fixed-day test above still ran
    assert.deepEqual(plain(parseSheets(A, U, day).promos), JSON.parse(py.stdout).promos, day);
  }
});

test('the promo object has exactly the contract keys and no internal fields', { skip }, () => {
  const keys = ['id', 'title', 'deal_card', 'audience', 'line_type_label', 'sheets', 'savings', 'mechanism', 'dates',
    'plan', 'brands', 'device_scope', 'device_type', 'diamond_only', 'trade_in_required', 'port_required',
    'mobile_service', 'badges', 'hook', 'qualify', 'steps', 'deadlines', 'watchouts', 'credit_amount', 'trade_in'];
  const r = parseSheets(A, U, DAY);
  for (const p of r.promos) assert.deepEqual(Object.keys(p), keys, p.id);
  const all = JSON.stringify(r.promos);
  for (const bad of ['"source"', '"discrepancy"', '"values_in"', '"source_pdf"', '"verified_deal_cards"', '"routing'])
    assert.ok(!all.includes(bad), 'leaked ' + bad);
});

test('shared promos are taken once, from the home sheet, with both sheets listed', { skip }, () => {
  const r = parseSheets(A, U, DAY);
  const ids = r.promos.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  const watch = r.promos.find((p) => p.id === 'smartwatch_300_diamond');
  assert.deepEqual(watch.sheets, ['new_line_sheet', 'upgrade_sheet']);
});

/* ------------------------------------------------------------- tolerance -- */

test('tolerance: trailing commas, single quotes, bare keys, comments, apostrophes', { skip }, () => {
  const relax = (txt) => {
    // Rewrite strict JSON the way a hand edit might: bare keys, 'single quotes'
    // where the text has no apostrophe, a trailing comma after every item, and
    // comments that contain brackets and quotes.
    const v = JSON.parse(txt);
    const js = (x, ind) => {
      if (Array.isArray(x)) return '[\n' + x.map((e) => ind + '  ' + js(e, ind + '  ') + ',').join('\n') + '\n' + ind + '/* ] " \' */]';
      if (x && typeof x === 'object') return '{ // don\'t { [ touch\n' + Object.entries(x).map(([k, e]) =>
        ind + '  ' + (/^[A-Za-z_]\w*$/.test(k) ? k : JSON.stringify(k)) + ': ' + js(e, ind + '  ') + ',').join('\n') + '\n' + ind + '}';
      if (typeof x === 'string' && !x.includes("'")) return "'" + x.replace(/\\/g, '\\\\').replace(/\n/g, '\\n') + "'";
      return JSON.stringify(x);
    };
    return js(v, '');
  };
  let a = replaceValue(A, 'PROMO_GUIDE', relax);
  a = replaceValue(a, 'TIPS_PROMOS', relax);
  const u = replaceValue(U, 'PROMO_GUIDE', relax);
  const before = plain(parseSheets(A, U, DAY).promos);
  const after = parseSheets(a, u, DAY);
  assert.deepEqual(after.warnings, []);
  assert.deepEqual(plain(after.promos), before);
});

test('tolerance: an apostrophe and ", word:" inside text do not confuse the reader', { skip }, () => {
  const a = replaceValue(A, 'PROMO_GUIDE', (t) => t.replace('"hook": "', '"hook": "Heads up, Note: the rep\'s and customer\'s line [x] {y}. '));
  const r = parseSheets(a, U, DAY);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.promos[0].hook.startsWith("Heads up, Note: the rep's and customer's line [x] {y}. "));
});

test('tolerance: the reader never runs sheet code', () => {
  const evil = `const PROMO_GUIDE = [{ tag: 'x', marketing_name: globalThis.__pwned = 1 }];
                const TIPS_PROMOS = {};`;
  const r = parseSheetsAll(evil, '');
  assert.equal(globalThis.__pwned, undefined);
  assert.deepEqual(r.failed, ['new_line_sheet', 'upgrade_sheet']);
  assert.match(r.warnings[0], /code, not a value/);
});

test('tolerance: a hand-typed date like 11/10/2026 or "Nov 10, 2026" is understood', () => {
  const mk = (start, end) => `const PROMO_GUIDE = [{ tag: 'x', marketing_name: 'X', sheet: 'mobile_6th_gen', line_type: 'new_line',
              dates: { start: '${start}', end: '${end}' } }]; const TIPS_PROMOS = {};`;
  assert.deepEqual(parseSheetsAll(mk('10/1/2026', '11/10/26'), '').promos[0].dates, { start: '2026-10-01', end: '2026-11-10' });
  assert.deepEqual(parseSheetsAll(mk('Oct 1, 2026', 'November 10th 2026'), '').promos[0].dates, { start: '2026-10-01', end: '2026-11-10' });
  assert.deepEqual(parseSheetsAll(mk('1 Sept 2026', '2026-11-10'), '').promos[0].dates, { start: '2026-09-01', end: '2026-11-10' });
});

test('dates: an end date that cannot be read -> warning, and treated as no end date (m4)', () => {
  const a = `const PROMO_GUIDE = [{ tag: 'x', marketing_name: 'X', sheet: 'mobile_6th_gen', line_type: 'new_line',
              dates: { start: '2026-10-01', end: 'end of next month' } }]; const TIPS_PROMOS = {};`;
  const r = parseSheets(a, '', DAY);
  assert.equal(r.promos[0].dates.end, null);
  assert.ok(isActive(r.promos[0], '2030-01-01'));
  assert.ok(r.warnings.some((w) => /"x" has a end date the guide cannot read \("end of next month"\)/.test(w)), r.warnings.join(' | '));
});

/* ------------------------------------------------- internal notes (M2) -- */

test('internal notes: no Jeff / deal desk / card-text / copy-pasted / sheet-UI lines reach reps', { skip }, () => {
  const r = parseSheets(A, U, DAY);
  const bad = /\bJeff\b|deal desk|card text|copy-pasted|\bgoverns\b|surface it|\bthe sheet\b|\bUpgrade sheet\b|\bCelestial\b|\bDEALS\d+|\.pdf\b|^Rep note/i;
  for (const p of r.promos) {
    for (const k of ['qualify', 'steps', 'deadlines', 'watchouts']) for (const x of p[k]) assert.ok(!bad.test(x), `${p.id} ${k}: ${x}`);
    for (const k of ['hook', 'credit_amount']) assert.ok(!bad.test(p[k] || ''), `${p.id} ${k}: ${p[k]}`);
    // A deal card IS a code (CD885, DEALS122) and reps need it — but never a file name.
    assert.ok(!/\.pdf\b|·/.test(p.deal_card || ''), `${p.id} deal_card: ${p.deal_card}`);
  }
  const agm = r.promos.find((p) => p.id === 'tips_agm_930');
  assert.ok(agm.watchouts.includes('Not combinable with the no-trade deal on the same line.'), 'the rule stays, the sheet aside goes');
  const watch = r.promos.find((p) => p.id === 'smartwatch_300_diamond');
  assert.ok(watch.watchouts.includes('This is the ONLY Diamond-gated promo on the board.'));
  assert.ok(watch.watchouts.some((x) => /rep starts the buy flow/.test(x)), 'rep coaching is kept: reps are the audience');
  assert.equal(r.promos.find((p) => p.id === 'tips_duo_1000_diamond_upg').deal_card, 'DEALS18 (no separate card)', 'no source file name');
});

test('internal notes: asides, card codes and trailing caveats come off, the rule stays', () => {
  const a = `const PROMO_GUIDE = [{ tag: 'x', marketing_name: 'X', sheet: 'mobile_6th_gen', line_type: 'new_line', summary: {
      hook: 'Up to $300 off (Jeff, 10/9) a new watch.',
      credit_amount: '$300 (CD871, up to $300) as a credit.',
      qualify: ['A rule — see the deal card CD871 for the rest.', 'Rep note (Jeff): ignore this.', 'Pairs with y_tag deals.'],
      watchouts: ['Paid in full first. Verify with the deal desk.', 'Carried forward from the old cards: one per account — verify with the deal desk.',
                  'Visa gift cards are not bill credits.', 'Old line. Never assume the sheet has it.'] } },
    { tag: 'y_tag', marketing_name: 'Y deal', sheet: 'mobile_6th_gen' }]; const TIPS_PROMOS = {};`;
  const p = parseSheetsAll(a, '').promos[0];
  assert.equal(p.hook, 'Up to $300 off a new watch.');
  assert.equal(p.credit_amount, '$300 (up to $300) as a credit.');
  assert.deepEqual(p.qualify, ['A rule.', 'Pairs with \u201cY deal\u201d deals.']);
  assert.deepEqual(p.watchouts, ['Paid in full first.', 'One per account.', 'Visa gift cards are not bill credits.', 'Old line.']);
});

/* ------------------------------------------------------------- fail-soft -- */

test('fail-soft: parseSheets on garbage, empty and missing input', () => {
  for (const [a, u] of [['', ''], [null, undefined], ['<html>nothing here</html>', '{{{{'], ['const PROMO_GUIDE = [', 'const PROMO_GUIDE = []']]) {
    const r = parseSheets(a, u, DAY);
    assert.deepEqual(r.promos, []);
    assert.deepEqual(r.failed, ['new_line_sheet', 'upgrade_sheet']);
    assert.equal(r.warnings.length, 2);
  }
});

test('fail-soft: corrupted upgrade sheet -> new-line promos still parse', { skip }, () => {
  const broken = replaceValue(U, 'UPG_TIPS_BUCKETS', (t) => t.replace('ladder: [500, 450', 'ladder: [500 450'));
  const r = parseSheets(A, broken, DAY);
  assert.deepEqual(r.failed, ['upgrade_sheet']);
  assert.ok(r.promos.length > 0);
  assert.ok(r.promos.every((p) => p.sheets.includes('new_line_sheet')));
  assert.match(r.warnings[0], /Upgrade Quote Sheet: UPG_TIPS_BUCKETS/);
});

test('fail-soft: loadPromos keeps new lines live and borrows upgrades from the saved copy', { skip }, async () => {
  const broken = U.replace('const PROMO_GUIDE = [', 'const PROMO_GUIDE = [ oops');
  const res = await loadPromos({
    today: DAY, snapshotUrl: SNAP_URL,
    fetchImpl: fakeFetch({ [SHEETS.new_line_sheet.url]: A, [SHEETS.upgrade_sheet.url]: broken, [SNAP_URL]: snapshot })
  });
  const full = plain(parseSheets(A, U, DAY).promos);
  assert.equal(res.source, 'live');
  assert.deepEqual(res.sheets_from, { new_line_sheet: 'live', upgrade_sheet: 'snapshot' });
  assert.deepEqual(res.promos.map((p) => p.id).sort(), full.map((p) => p.id).sort());
  assert.ok(res.warnings.some((w) => /saved copy/.test(w)));
  assert.ok(res.generated_at);
});

test('fail-soft: 6th Gen unreadable -> shared promos come from the snapshot (home copy), not the Upgrade copy (M6)', { skip }, async () => {
  const brokenA = A.replace('const TIPS_PROMOS = {', 'const TIPS_PROMOS = { oops');
  const parsed = parseSheetsAll(brokenA, U);
  assert.deepEqual(parsed.failed, ['new_line_sheet']);
  assert.ok(!parsed.promos.some((p) => p.id === 'visa_gc_200_2lines' || p.id === 'smartwatch_300_diamond'), 'non-home copies are not used');
  const res = await loadPromos({ today: DAY, snapshotUrl: SNAP_URL,
    fetchImpl: fakeFetch({ [SHEETS.new_line_sheet.url]: brokenA, [SHEETS.upgrade_sheet.url]: U, [SNAP_URL]: snapshot }) });
  const full = plain(parseSheets(A, U, DAY).promos);
  for (const id of ['visa_gc_200_2lines', 'smartwatch_300_diamond']) {
    assert.deepEqual(plain(res.promos.find((p) => p.id === id)), full.find((p) => p.id === id), id + ' is the home (6th Gen) copy');
  }
  assert.deepEqual(res.promos.map((p) => p.id).sort(), full.map((p) => p.id).sort());
});

test('fail-soft: one sheet will not download -> the other stays live', { skip }, async () => {
  const res = await loadPromos({
    today: DAY, snapshotUrl: SNAP_URL,
    fetchImpl: fakeFetch({ [SHEETS.new_line_sheet.url]: 404, [SHEETS.upgrade_sheet.url]: U, [SNAP_URL]: snapshot })
  });
  assert.deepEqual(res.sheets_from, { new_line_sheet: 'snapshot', upgrade_sheet: 'live' });
  assert.equal(res.promos.length, parseSheets(A, U, DAY).promos.length);
  assert.equal(res.promos[0].id, 'tips_agm_930', 'new-line promos stay first');
});

test('fail-soft: both sheets fail -> the saved copy', { skip }, async () => {
  const res = await loadPromos({
    today: DAY, snapshotUrl: SNAP_URL,
    fetchImpl: fakeFetch({ [SHEETS.new_line_sheet.url]: new TypeError('Load failed'), [SHEETS.upgrade_sheet.url]: 'garbage', [SNAP_URL]: snapshot })
  });
  assert.equal(res.source, 'snapshot');
  assert.ok(res.promos.length > 0);
  assert.ok(res.warnings.length >= 2);
});

test('fail-soft: sheets read but show nothing current while the saved copy has some -> saved copy', { skip }, async () => {
  // Every end date moved into the past: reads fine, but nothing is on today.
  const stale = (h) => replaceValue(h, 'PROMO_GUIDE', (t) => t.replace(/"end": "2026-\d\d-\d\d"/g, '"end": "2020-01-01"').replace(/"end": null/g, '"end": "2020-01-01"'));
  const res = await loadPromos({
    today: DAY, snapshotUrl: SNAP_URL,
    fetchImpl: fakeFetch({ [SHEETS.new_line_sheet.url]: stale(A), [SHEETS.upgrade_sheet.url]: stale(U), [SNAP_URL]: snapshot })
  });
  assert.equal(res.source, 'snapshot');
  assert.ok(res.promos.length > 0);
});

test('fail-soft: nothing readable at all resolves (empty + warning), never throws', async () => {
  const res = await loadPromos({ today: DAY, snapshotUrl: SNAP_URL, fetchImpl: fakeFetch({}) });
  assert.equal(res.source, 'snapshot');
  assert.deepEqual(res.promos, []);
  assert.ok(res.warnings.some((w) => /saved copy could not be read/.test(w)));
});

test('loadPromos: timeout gives up and falls back', { skip }, async () => {
  const t0 = Date.now();
  const res = await loadPromos({
    today: DAY, snapshotUrl: SNAP_URL, timeoutMs: 150,
    fetchImpl: fakeFetch({ [SHEETS.new_line_sheet.url]: 'hang', [SHEETS.upgrade_sheet.url]: U, [SNAP_URL]: snapshot })
  });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(res.sheets_from.new_line_sheet, 'snapshot');
  assert.ok(res.warnings.some((w) => /longer than/.test(w)));
});

test('loadPromos: fetches both sheets with no-store and a cache-busting query', { skip }, async () => {
  const log = [];
  const res = await loadPromos({ today: DAY, snapshotUrl: SNAP_URL,
    fetchImpl: fakeFetch({ [SHEETS.new_line_sheet.url]: A, [SHEETS.upgrade_sheet.url]: U, [SNAP_URL]: snapshot }, log) });
  assert.equal(res.source, 'live');
  assert.deepEqual(res.warnings, []);
  assert.equal(res.version, 1);
  assert.ok(!Number.isNaN(Date.parse(res.fetched_at)));
  const sheetCalls = log.filter((c) => !c.url.startsWith(SNAP_URL));
  assert.equal(sheetCalls.length, 2);
  for (const c of sheetCalls) { assert.equal(c.init.cache, 'no-store'); assert.match(c.url, /\?_=/); }
  assert.equal(log.length, 2, 'the saved copy is not downloaded when both sheets read');
});

test('loadPromos: live:false reads only the saved copy and re-filters it to today', { skip }, async () => {
  const res = await loadPromos({ live: false, today: '2026-11-03', snapshotUrl: SNAP_URL, fetchImpl: fakeFetch({ [SNAP_URL]: snapshot }) });
  assert.equal(res.source, 'snapshot');
  assert.ok(!res.promos.some((p) => p.id === 'visa_gc_200_2lines'), 'ended 11/2');
  assert.ok(res.promos.some((p) => p.id === 'tips_agm_930'));
});

test('loadPromos: the 5-minute cache is shared through sessionStorage under CACHE_KEY', { skip }, async () => {
  const mem = new Map();
  globalThis.sessionStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => { calls++; return fakeFetch({ [SHEETS.new_line_sheet.url]: A, [SHEETS.upgrade_sheet.url]: U })(url, init); };
  try {
    delete globalThis.__cccPromosCache;
    const one = await loadPromos({ today: DAY, snapshotUrl: SNAP_URL });
    assert.equal(calls, 2);
    assert.equal(CACHE_KEY, 'ccc-promos-live-v1');
    assert.ok(mem.has(CACHE_KEY));
    delete globalThis.__cccPromosCache;                    // like a second module copy / a framed page
    const two = await loadPromos({ today: DAY, snapshotUrl: SNAP_URL });
    assert.equal(calls, 2, 'served from sessionStorage, no second download');
    assert.deepEqual(two.promos, one.promos);
    await loadPromos({ today: DAY, snapshotUrl: SNAP_URL, fresh: true });
    assert.equal(calls, 4, 'fresh:true skips the cache');
    // Storage that throws (Safari private mode) must not break anything.
    globalThis.sessionStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
    delete globalThis.__cccPromosCache;
    const three = await loadPromos({ today: DAY, snapshotUrl: SNAP_URL });
    assert.equal(three.source, 'live');
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.sessionStorage;
    delete globalThis.__cccPromosCache;
  }
});

/* ----------------------------------------------------------------- dates -- */

test('isActive: start and end days both count; missing dates mean no limit', () => {
  const p = { dates: { start: '2026-10-09', end: '2026-11-10' } };
  assert.equal(isActive(p, '2026-10-08'), false);
  assert.equal(isActive(p, '2026-10-09'), true);
  assert.equal(isActive(p, '2026-11-10'), true);
  assert.equal(isActive(p, '2026-11-11'), false);
  assert.equal(isActive({ dates: { start: null, end: null } }, '2030-01-01'), true);
  assert.equal(isActive({ dates: { start: null, end: '2026-10-30' } }, '2026-10-31'), false);
  assert.equal(isActive({}, '2026-10-23'), true);
  assert.equal(isActive({ dates: { start: 'soon', end: 'TBD' } }, '2026-10-23'), true, 'a non-date is ignored, not guessed');
  assert.equal(notExpired({ dates: { start: '2026-12-01', end: '2026-12-31' } }, '2026-10-23'), true);
  assert.equal(notExpired({ dates: { start: null, end: '2026-10-22' } }, '2026-10-23'), false);
});

test('chicagoToday: the Chicago calendar date, not UTC', () => {
  // 03:00 UTC on the 24th is still 10 pm on the 23rd in Chicago (CDT).
  assert.equal(chicagoToday(new Date('2026-10-24T03:00:00Z')), '2026-10-23');
  assert.equal(chicagoToday(new Date('2026-10-24T05:30:00Z')), '2026-10-24');
  // Winter (CST, UTC-6): 05:30 UTC on Dec 2 is 11:30 pm on Dec 1.
  assert.equal(chicagoToday(new Date('2026-12-02T05:30:00Z')), '2026-12-01');
  assert.match(chicagoToday(), /^\d{4}-\d{2}-\d{2}$/);
});

/* ------------------------------------------------------------- trade-ins -- */

test('deviceSlug', () => {
  assert.equal(deviceSlug('Apple iPhone 13 Pro'), 'apple-iphone-13-pro');
  assert.equal(deviceSlug('Samsung Galaxy Note 10 Lite (6GB)'), 'samsung-galaxy-note-10-lite-6gb');
  assert.equal(deviceSlug('  ONEPLUS 8T PLUS 5G '), 'oneplus-8t-plus-5g');
  assert.equal(deviceSlug('Galaxy S24+'), 'galaxy-s24-plus');
  assert.equal(deviceSlug(null), '');
});

test('deviceSlug: no two trade-in devices share a slug', { skip }, () => {
  const devs = tradeDevices(parseSheets(A, U, DAY).promos);
  const models = new Set();
  for (const p of parseSheets(A, U, DAY).promos) for (const d of (p.trade_in ? p.trade_in.devices : [])) models.add(d.model);
  assert.equal(devs.length, models.size);
});

test('tradeValue: dollars, null for not accepted, by name or slug, best when no condition', { skip }, () => {
  const promos = parseSheets(A, U, DAY).promos;
  const agm930 = promos.find((p) => p.id === 'tips_agm_930');
  const upg500 = promos.find((p) => p.id === 'tips_agm_500_upg');
  assert.equal(tradeValue(agm930, 'Apple iPhone 11', 'good'), 500);
  assert.equal(tradeValue(upg500, 'Apple iPhone 11', 'good'), 350);   // tier "455" on ladder 500/450/400/350/300
  assert.equal(tradeValue(upg500, 'Apple iPhone 11', 'fair'), 300);
  assert.equal(tradeValue(upg500, 'apple-iphone-11', 'Fair'), 300, 'slug and any case');
  assert.equal(tradeValue(upg500, 'Apple iPhone 11', 'F'), 300);
  assert.equal(tradeValue(upg500, 'Apple iPhone 11'), 350, 'no condition = best value');
  assert.equal(tradeValue(upg500, 'Apple iPhone 11', 'mint'), null);
  assert.equal(tradeValue(upg500, 'Nokia 3310', 'good'), null);
  assert.equal(tradeValue(promos.find((p) => p.id === 'flat_agm_400'), 'Apple iPhone 11', 'good'), null, 'no trade-in on this promo');
  // A condition the list does not take ("5--" = Good only) is null, not 0.
  const partial = upg500.trade_in.devices.concat(promos.find((p) => p.id === 'tips_samsung_700_upg').trade_in.devices)
    .find((d) => d.fair === null || d.poor === null);
  if (partial) {
    const owner = promos.find((p) => p.trade_in && p.trade_in.devices.includes(partial));
    assert.equal(tradeValue(owner, partial.model, partial.fair === null ? 'fair' : 'poor'), null);
  }
  for (const p of promos) for (const d of (p.trade_in ? p.trade_in.devices : []))
    for (const c of ['good', 'fair', 'poor']) assert.ok(d[c] === null || Number.isInteger(d[c]), `${p.id} ${d.model} ${c}`);
});

test('tradeValue: upgrade tier strings decode like the Upgrade sheet does', () => {
  const u = `const PROMO_GUIDE = [{ tag: 'b', marketing_name: 'B', sheet: 'upgrade', line_type: 'upgrade', trade_in: { required: true, bucket: 'b' } }];
             const UPG_TIPS_BUCKETS = { b: { ladder: [500, 450, 400], floor: 400, max: 500, col: 1, }, };
             const UPG_TIPS_TABLE = [ ['Phone A', '123'], ['Phone B', '5--'], ['Phone C', '---'], ['Phone D', '1'], ['Phone E', '09-'], ];`;
  const p = parseSheetsAll('', u).promos[0];
  assert.deepEqual(p.trade_in.devices, [
    { model: 'Phone A', brand: 'Other', good: 500, fair: 450, poor: 400 },
    { model: 'Phone B', brand: 'Other', good: null, fair: null, poor: null },   // 5 is past a 3-step ladder
    { model: 'Phone D', brand: 'Other', good: 500, fair: null, poor: null }
  ]);
});

test('trade-in max / floor come from the ladder and the list, with a warning when the typed ones disagree (m5)', () => {
  const u = `const PROMO_GUIDE = [{ tag: 'b', marketing_name: 'B', sheet: 'upgrade', line_type: 'upgrade', trade_in: { required: true, bucket: 'b' } }];
             const UPG_TIPS_BUCKETS = { b: { ladder: [550, 450, 400], floor: 300, max: 500, col: 1 } };
             const UPG_TIPS_TABLE = [ ['Phone A', '122'], ['Phone B', '1--'] ];`;
  const r = parseSheetsAll('', u);
  assert.equal(r.promos[0].trade_in.max, 550);
  assert.equal(r.promos[0].trade_in.floor, 450);
  assert.equal(r.warnings.filter((w) => /typed|says the (lowest|top)/.test(w)).length, 2, r.warnings.join(' | '));
});

test('plan labels use the sheets\' own wording (m3)', { skip }, () => {
  const plan = Object.fromEntries(parseSheets(A, U, DAY).promos.map((p) => [p.id, p.plan]));
  assert.equal(plan.smartwatch_300_diamond, 'Smartwatch plan, Diamond only');
  assert.equal(plan.free_line, 'Mobile Select ($0) or Mobile Plus ($15) \u2014 first line');
  assert.equal(plan.waived_activation, 'Any XM plan \u2014 Select included');
  assert.equal(plan.tips_agm_930, 'Mobile Plus or Premium Unlimited');
});

test('tradeDevices: one entry per device with its value on every trade-in promo', { skip }, () => {
  const devs = tradeDevices(parseSheets(A, U, DAY).promos);
  const ip13 = devs.find((d) => d.slug === 'apple-iphone-13');
  assert.ok(ip13);
  assert.ok(ip13.offers.length >= 4);
  assert.ok(ip13.offers.every((o) => o.promo_id && 'good' in o));
});

/* -------------------------------------------------------------- snapshot -- */

test('data/promos.json is a valid saved copy with no expired promos', () => {
  const s = JSON.parse(readFileSync(join(ROOT, 'data', 'promos.json'), 'utf8'));
  assert.equal(s.version, 1);
  assert.equal(s.source, 'snapshot');
  assert.ok(Array.isArray(s.promos) && s.promos.length > 0);
  const day = s.generated_at ? chicagoToday(new Date(s.generated_at)) : DAY;
  for (const p of s.promos) assert.ok(notExpired(p, day), p.id);
});

test('the snapshot path is not spelled as one literal (build/fingerprint.mjs would pin it)', () => {
  const src = readFileSync(join(ROOT, 'assets', 'promos-feed.js'), 'utf8');
  assert.ok(!/data\/promos\.json/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')), 'literal path in code');
});
