#!/usr/bin/env node
/* =============================================================================
 * Cook County Cooks — build/pull-promos.mjs
 * RE-READ THE TWO QUOTE SHEETS AND REFRESH data/promos.json (THE SAVED COPY)
 * -----------------------------------------------------------------------------
 * WHAT THE SAVED COPY IS FOR
 *   The Mobile Promotions guide and Ask the Chef read Jeff's two quote sheets
 *   LIVE, every time (assets/promos-feed.js). This file is only the safety net
 *   under that: if a sheet will not download or will not read, the page falls
 *   back to data/promos.json instead of going blank. So this script's job is to
 *   keep that net close to the sheets — a GitHub job runs it on a schedule
 *   (.github/workflows/promos.yml) and commits the file when it changed.
 *
 * SAME READER AS THE PAGE
 *   It imports parseSheetsAll() from assets/promos-feed.js — the exact code the
 *   page uses — so the saved copy can never disagree with the live view about
 *   what a sheet says.
 *
 * WHAT GOES IN
 *   Every promo that has not ended yet (Chicago date), INCLUDING ones that start
 *   later — so a promo that starts on Monday is already in the net on Monday.
 *   The page filters to "on today" itself. Expired promos are dropped, which is
 *   Jeff's rule: an expired deal disappears everywhere.
 *
 * IT REFUSES TO MAKE THINGS WORSE
 *   Both sheets must read completely, and there must be at least one promo,
 *   before anything is written. Otherwise the existing file is left exactly as
 *   it was — the last good copy is a far better net than a half-empty one.
 *   It also writes nothing when the promos are unchanged (the time stamp alone
 *   is not a change), so a quiet day makes zero commits.
 *
 * EXIT CODES (the workflow reads these)
 *   0  done — written, or nothing changed
 *   2  a sheet could not be DOWNLOADED (network, GitHub hiccup). Usually fixes
 *      itself by the next run; the live page reads the sheets directly anyway.
 *   1  a sheet downloaded but could not be READ, or showed no promos. That
 *      means an edit broke the sheet's data, and it will not fix itself.
 *
 * USAGE
 *   node build/pull-promos.mjs                    fetch both live sheets, write
 *   node build/pull-promos.mjs --from <dir>       read <dir>/Mobile-Quote-Sheet-6th-Gen/index.html
 *                                                 and <dir>/Upgrade-Quote-Sheet/index.html instead
 *   node build/pull-promos.mjs --new-line <file> --upgrade <file>
 *   node build/pull-promos.mjs --today 2026-10-23 pretend it is that (Chicago) date
 *   node build/pull-promos.mjs --dry-run          everything except the write
 *   node build/pull-promos.mjs --out <file>       write somewhere else (tests)
 * ========================================================================== */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEETS, parseSheetsAll, notExpired, chicagoToday } from '../assets/promos-feed.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- arguments ----------------------------------------------------------------
const argv = process.argv.slice(2);
function arg(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const DRY_RUN = argv.includes('--dry-run') || argv.includes('-n');
const FROM = arg('--from');
const NEW_LINE_FILE = arg('--new-line');
const UPGRADE_FILE = arg('--upgrade');
const TODAY = arg('--today') || chicagoToday();
const OUT = resolve(arg('--out') || join(ROOT, 'data', 'promos.json'));

if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) {
  console.error(`--today must look like 2026-10-23 (got "${TODAY}")`);
  process.exit(1);
}

class DownloadError extends Error {}

// --- reading the sheets -------------------------------------------------------
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 60000;

async function download(key) {
  const base = SHEETS[key].url;
  let lastErr;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    // A fresh query string each time. Checked against GitHub Pages on
    // 2026-10-23: its cache (Fastly) treats ?_=<new value> as a never-seen
    // address and goes back to the real file (x-cache: MISS), so we read what
    // Jeff pushed, not a copy up to ten minutes old.
    const url = `${base}?_=${Date.now().toString(36)}${attempt}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'user-agent': 'ccc-promos-bot', 'cache-control': 'no-cache' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length < 4096) throw new Error(`only ${text.length} bytes came back`);
      return text;
    } catch (err) {
      lastErr = err.name === 'AbortError' ? new Error(`no answer in ${FETCH_TIMEOUT_MS / 1000}s`) : err;
      console.warn(`  ${SHEETS[key].label}: attempt ${attempt}/${FETCH_ATTEMPTS} failed — ${lastErr.message}`);
      if (attempt < FETCH_ATTEMPTS) await new Promise((r) => setTimeout(r, 3000 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new DownloadError(`${SHEETS[key].label} (${base}) could not be downloaded: ${lastErr && lastErr.message}`);
}

function readLocal(file) {
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);
  return readFileSync(file, 'utf8');
}

async function sheets() {
  if (NEW_LINE_FILE || UPGRADE_FILE) {
    if (!NEW_LINE_FILE || !UPGRADE_FILE) throw new Error('--new-line and --upgrade go together');
    return [readLocal(resolve(NEW_LINE_FILE)), readLocal(resolve(UPGRADE_FILE))];
  }
  if (FROM) {
    return [
      readLocal(resolve(FROM, 'Mobile-Quote-Sheet-6th-Gen', 'index.html')),
      readLocal(resolve(FROM, 'Upgrade-Quote-Sheet', 'index.html'))
    ];
  }
  // Both at once; if either fails the whole run stops before writing.
  return Promise.all([download('new_line_sheet'), download('upgrade_sheet')]);
}

// --- main ---------------------------------------------------------------------
async function run() {
  console.log(`Reading the quote sheets ${FROM || NEW_LINE_FILE ? 'from local files' : 'live'} for ${TODAY} (Chicago).`);
  const [newLineHtml, upgradeHtml] = await sheets();

  const parsed = parseSheetsAll(newLineHtml, upgradeHtml);
  for (const w of parsed.warnings) console.warn(`  ! ${w}`);
  if (parsed.failed.length) {
    throw new Error(`${parsed.failed.map((k) => SHEETS[k].label).join(' and ')} could not be read ` +
                    `(see the "!" lines above). data/promos.json was NOT changed.`);
  }

  const promos = parsed.promos.filter((p) => notExpired(p, TODAY));
  if (!promos.length) {
    throw new Error(`the sheets read, but not one promo is current or upcoming as of ${TODAY}. ` +
                    `That is almost certainly a broken edit, not a real empty week, so ` +
                    `data/promos.json was NOT changed.`);
  }

  // Unchanged? Compare everything except the time stamp.
  let before = null;
  try { before = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* missing or broken: write a fresh one */ }
  const same = before && before.version === 1 && before.source === 'snapshot' &&
    JSON.stringify(before.promos) === JSON.stringify(promos);

  console.log(`  ${promos.length} promo${promos.length === 1 ? '' : 's'} current or upcoming:`);
  for (const p of promos) {
    const tag = p.dates.start && p.dates.start > TODAY ? ` (starts ${p.dates.start})` : '';
    console.log(`    · ${p.id}${tag} — ${p.title}`);
  }

  if (same) {
    console.log('\nThe promos are unchanged. Nothing written.');
    return;
  }
  const doc = { version: 1, generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), source: 'snapshot', promos };
  // One space of indent: still small, and a commit's diff shows exactly which
  // promo line changed.
  const text = JSON.stringify(doc, null, 1) + '\n';
  if (DRY_RUN) {
    console.log(`\n--dry-run: would write ${OUT} (${Buffer.byteLength(text)} bytes).`);
    return;
  }
  // Write to a temporary file and rename, so a crash mid-write can never leave
  // a half file behind.
  writeFileSync(OUT + '.tmp', text);
  renameSync(OUT + '.tmp', OUT);
  console.log(`\nWrote ${OUT} (${Buffer.byteLength(text)} bytes).`);
}

run().then(() => process.exit(0)).catch((err) => {
  if (err instanceof DownloadError) {
    console.error(`\nCOULD NOT DOWNLOAD: ${err.message}`);
    console.error('data/promos.json was NOT changed. The next run will try again.');
    process.exit(2);
  }
  console.error(`\nFAILED: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
