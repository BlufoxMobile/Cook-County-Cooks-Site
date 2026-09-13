#!/usr/bin/env node
/* =============================================================================
 * Cook County Cooks — build/fingerprint.mjs
 * CONTENT-HASHED ASSET FILENAMES
 * -----------------------------------------------------------------------------
 * THE BUG THIS EXISTS TO KILL
 *   New HTML and CSS composited over stale cached IMAGES from a previous build:
 *   every hotspot lands beside its object instead of on it, because the plate
 *   under the percentages is last week's. The plates are served with
 *   `cache-control: max-age=14400`, so for four hours after any art update every
 *   employee in the district can be looking at a different mixture of old and
 *   new. No amount of "hard refresh" instruction survives contact with a store.
 *
 * THE FIX
 *   Make a changed file a changed URL. Every plate, every module, the stylesheet
 *   and the door sound get the first ten hex digits of the SHA-256 of their own
 *   final bytes folded into the filename:
 *
 *       plates/office.webp        ->  plates/office.4d1f0a9c33.webp
 *       plates/office@1400.webp   ->  plates/office@1400.7be2c05118.webp
 *       assets/app.js             ->  assets/app.9f2c81e4a0.js
 *       assets/theme.css          ->  assets/theme.b30ac7d915.css
 *
 *   A four-hour cache on a URL that only ever holds one version of one file is
 *   not a hazard, it is the ideal. Nothing has to be revalidated and nothing can
 *   go stale: the HTML is the only document whose URL does not move, and the
 *   HTML is the thing that names all the new URLs.
 *
 * WHAT THIS IS NOT
 *   Not a bundler and not a serve-time step. It runs HERE, its output is
 *   committed, and the deployed tree stays plain static files. Nothing about the
 *   shipped page changes: same ES modules, same relative paths, no npm.
 *
 * THE SOURCE FILENAMES STAY. `plates/office.webp` is still there, still named
 *   for a human, and still what you edit. The hashed file is a COPY beside it.
 *   That is deliberate on a live site: the un-hashed URLs are already in the
 *   wild (the og:image, printed handouts, whatever a manager bookmarked), and a
 *   reference this script fails to rewrite must degrade to "correct but
 *   uncached", never to a 404.
 *
 * HOW THE REWRITE WORKS — and why it is safe
 *   One pass of longest-key-first literal substitution over every text file that
 *   can name an asset. A key is a repo-relative path ("plates/office.webp"); an
 *   occurrence is rewritten in place, keeping whatever "../" prefix it was
 *   written with, so `../assets/theme.css` inside tools/printouts/index.html
 *   works the same as `assets/theme.css` inside index.html. Longest-first is
 *   what stops "plates/hero.webp" from eating the front of
 *   "plates/hero@1400.webp" — the @-suffixed key is matched first.
 *
 *   Because the keys are LOCAL paths, no absolute URL to another origin can
 *   match one. screens.js's two live feeds —
 *   raw.githubusercontent.com/.../promo-card.jpg and
 *   .../nps-detractor-streaks.json — are checked explicitly at the end of the
 *   run and the build FAILS if either has been touched.
 *
 * ORDER MATTERS, so the run is staged:
 *   1. leaves            plates, the mp3, brand art, data JSON — nothing inside
 *                        them names another asset, so they hash immediately.
 *   2. CSS               theme.css names dark plates in an image-set(). Rewrite
 *                        those first, THEN hash the rewritten bytes.
 *   3. JS, in dependency order   a module's hash depends on its own imports'
 *                        hashes, so rooms.js is hashed before labels.js, which
 *                        is hashed before app.js. Import specifiers and asset
 *                        literals are both rewritten before hashing.
 *   4. HTML              rewritten in place, never hashed — it is the one URL
 *                        the browser has to re-check, and GitHub Pages already
 *                        serves it with a short cache.
 *
 * assets/theme.css IS OWNED BY ANOTHER AGENT. This script never hand-edits it —
 *   it reads it, rewrites the url() references mechanically into a hashed COPY,
 *   and leaves the source file byte-for-byte alone. Re-run the build after any
 *   theme.css edit and the copy catches up. Nobody has to type a hash.
 *
 * ONE PREVIOUS GENERATION IS KEPT ON PURPOSE — see §6. index.html is served
 *   with `cache-control: max-age=600`, so for up to ten minutes after a push a
 *   rep returning to a bookmark is holding the PREVIOUS index.html and asking
 *   for the PREVIOUS hashes. Deleting them the moment the new ones exist made
 *   every deploy a ten-minute window in which a 404'd module was a blank page.
 *
 * EVERY EMITTED MODULE'S IMPORTS ARE RESOLVED BEFORE THE BUILD IS ALLOWED TO
 *   EXIT — see §5b. A rewrite this script silently misses is the one way it can
 *   ship a page that 404s while printing a confident "entry:" line.
 *
 * Usage:  node build/fingerprint.mjs [--clean]
 *         --clean  removes every previously-emitted *.<hash>.* file first —
 *                  BOTH generations — and starts the retention window over.
 *                  Use it to reset, never as part of a deploy: a --clean build
 *                  is precisely the blank-page window §6 exists to close.
 * ========================================================================== */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLEAN = process.argv.includes('--clean');

/** 10 hex digits of SHA-256. 40 bits: collision-free for a few thousand files
 *  by any measure that matters, and short enough to read in a network tab. */
const HASH_LEN = 10;
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, HASH_LEN);

/** Already-fingerprinted? `office.4d1f0a9c33.webp` / `app.9f2c81e4a0.js` */
const HASHED_RE = new RegExp(`\\.[0-9a-f]{${HASH_LEN}}\\.[A-Za-z0-9]+$`);

const p = (...s) => resolve(ROOT, ...s);
const rel = (abs) => relative(ROOT, abs).split('\\').join('/');
const fileExists = (f) => { try { return statSync(p(f)).isFile(); } catch { return false; } };

function listDir(dir, exts) {
  let names = [];
  try { names = readdirSync(p(dir)); } catch { return []; }
  return names
    .filter((n) => exts.includes(extname(n).toLowerCase()))
    .filter((n) => !HASHED_RE.test(n))
    .map((n) => `${dir}/${n}`)
    .filter((f) => { try { return statSync(p(f)).isFile(); } catch { return false; } })
    .sort();
}

/* ── what gets fingerprinted ───────────────────────────────────────────────
 * plates            the whole point of the exercise
 * assets/*.js|css   the modules and the stylesheet
 * assets/*.mp3      the door sound
 * brand/*.png       the C³ mark
 * data/*.json       app.js's no-inline fallback; freezer.sealed.json changes
 *                   on every seal, so it must not be cached against an old one
 *
 * NOT fingerprinted, on purpose:
 *   headchefs/photos/*   named by headchefs.json, which is regenerated weekly
 *                        from the Win-The-Weekend decks by a different pipeline.
 *                        Hashing them means that pipeline has to know about this
 *                        one. They are small, they change with their own data
 *                        file, and they are not what threw the hotspots off.
 *   printouts/manifest.json, tools/**   the sub-apps own their own assets.
 * ──────────────────────────────────────────────────────────────────────── */
const LEAF_ASSETS = [
  ...listDir('plates', ['.webp', '.jpg', '.png', '.avif']),
  ...listDir('assets', ['.mp3', '.wav', '.woff2', '.woff']),
  ...listDir('brand',  ['.png', '.svg', '.jpg', '.webp']),
  ...listDir('data',   ['.json'])
];
const CSS_ASSETS = listDir('assets', ['.css']);
const JS_ASSETS  = [...listDir('assets', ['.js']), 'rooms.js'].filter((f) => {
  try { return statSync(p(f)).isFile(); } catch { return false; }
});

/** Every text file that may NAME an asset. HTML is rewritten, never hashed. */
const HTML_FILES = ['index.html', ...listDir('tools/printouts', ['.html']),
  ...listDir('tools/employee-of-week', ['.html']), ...listDir('tools/porting-guide', ['.html']),
  /* tools/arcade — the C³ Arcade station. It is here for ONE reason: its <head>
     names ../../assets/theme.css, and an un-rewritten reference to the stylesheet
     would leave that page un-themed for four hours after every art change (which
     is the whole defect at the top of this file). Its own data — arcade/manifest.json
     — is deliberately NOT fingerprinted, for the same reason printouts/manifest.json
     is not: the sub-app owns its assets, and adding a game must be one row in that
     manifest with no build step at all. (arcade/art/*.svg is gone as of the room
     rebuild: the cabinets are DRAWN from tint and title, so a new game needs no
     artwork and there is nothing left here to hash.) */
  ...listDir('tools/arcade', ['.html'])];

/* ── the rewriter ─────────────────────────────────────────────────────────── */

/** src -> hashed src. Filled as we go, so later stages see earlier hashes. */
const MAP = new Map();

/** `plates/office.webp` -> `plates/office.4d1f0a9c33.webp` */
function hashedName(srcPath, h) {
  const dir = dirname(srcPath);
  const ext = extname(srcPath);
  const stem = basename(srcPath, ext);
  const name = `${stem}.${h}${ext}`;
  return dir === '.' ? name : `${dir}/${name}`;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrite every reference in `text`, longest key first.
 *
 * The `(?:\.\.\/)*` prefix is preserved verbatim, so a relative reference stays
 * relative to whatever file it is written in. `(?<![\w@/-])` stops a key from
 * matching in the middle of a longer path segment.
 */
/**
 * Module filenames are NOT rewritten by this pass.
 *
 * Every .js file in this build is reached one of two ways: as an import
 * specifier (rewritten by the dependency stage, which resolves relative to the
 * importing file) or as index.html's one `<script type="module" src>`. Nothing
 * loads a module by matching a bare path string. Leaving them out of the prose
 * pass keeps the build from rewriting the dozens of places the source comments
 * say "see rooms.js" — which produced a large, meaningless diff on every run.
 */
const PROSE_SKIP = new Set();

function rewrite(text) {
  const keys = [...MAP.keys()]
    .filter((k) => !PROSE_SKIP.has(k))
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const key of keys) {
    const re = new RegExp(`(?<![\\w@.-])((?:\\.\\./)*)${escapeRe(key)}(?![\\w@.-])`, 'g');
    out = out.replace(re, (_m, up) => up + MAP.get(key));
  }
  return out;
}

/**
 * Undo a previous run's rewrite, so the build is REPEATABLE.
 *
 * index.html is rewritten in place, which means the second run would find
 * `assets/app.4c1f….js` and no longer recognise `assets/app.js`. Every file is
 * therefore normalised back to source filenames before it is rewritten. Only
 * names that resolve to a file this build actually fingerprints are touched, so
 * an unrelated `something.0123456789.js` in a sub-app is left alone.
 */
const SOURCE_PATHS = new Set();
function unhash(text) {
  return text.replace(
    new RegExp(`([A-Za-z0-9@_-]+)\\.[0-9a-f]{${HASH_LEN}}(\\.[A-Za-z0-9]+)`, 'g'),
    (whole, stem, ext, offset, full) => {
      // Rebuild the candidate source path from whatever directory prefix the
      // reference was written with, and only accept a known one.
      const before = full.slice(Math.max(0, offset - 64), offset);
      const dir = (/([A-Za-z0-9@._-]*\/)*$/.exec(before) || [''])[0];
      const candidate = (dir + stem + ext).replace(/^(\.\.\/)+/, '');
      return SOURCE_PATHS.has(candidate) ? stem + ext : whole;
    }
  );
}

/** Emit a hashed copy and record the mapping. Returns the hashed path. */
function emit(srcPath, buf) {
  const h = hash(buf);
  const outPath = hashedName(srcPath, h);
  writeFileSync(p(outPath), buf);
  MAP.set(srcPath, outPath);
  return outPath;
}

for (const f of [...LEAF_ASSETS, ...CSS_ASSETS, ...JS_ASSETS]) SOURCE_PATHS.add(f);
for (const f of JS_ASSETS) if (f !== 'assets/app.js') PROSE_SKIP.add(f);

/* ── --clean ──────────────────────────────────────────────────────────────── */
if (CLEAN) {
  let removed = 0;
  for (const dir of ['plates', 'assets', 'brand', 'data', '.']) {
    let names = [];
    try { names = readdirSync(p(dir)); } catch { continue; }
    for (const n of names) {
      if (!HASHED_RE.test(n)) continue;
      const f = dir === '.' ? n : `${dir}/${n}`;
      try { statSync(p(f)).isFile() && (unlinkSync(p(f)), removed++); } catch { /* noop */ }
    }
  }
  console.log(`fingerprint: --clean removed ${removed} previously emitted files`);
}

/* ── 1 · leaves ───────────────────────────────────────────────────────────── */
for (const f of LEAF_ASSETS) emit(f, readFileSync(p(f)));

/* ── 2 · CSS ──────────────────────────────────────────────────────────────── *
 * theme.css belongs to another agent. It is read, rewritten into a hashed copy,
 * and left untouched on disk.                                                 */
for (const f of CSS_ASSETS) {
  const src = unhash(readFileSync(p(f), 'utf8'));
  emit(f, Buffer.from(rewrite(src), 'utf8'));
}

/* ── 3 · JS, in dependency order ──────────────────────────────────────────── *
 * A module's bytes contain its imports' filenames, so its hash depends on
 * theirs. Topological order, leaves first. A cycle would be a bug in the source
 * (there are none today); it is reported rather than silently mis-hashed.      */
// Anchored at the start of a line. A static import/export IS a top-level
// statement, so this loses nothing real — and it stops the module's own doc
// comment ("import { initChefWall } from './chefwall.js';" as usage example)
// from registering as a self-import and reading as a dependency cycle.
const IMPORT_RE = /^[ \t]*(?:import|export)\s[^'"()]*?from\s*['"]([^'"]+)['"]|^[ \t]*import\s*\(\s*['"]([^'"]+)['"]\s*\)|^[ \t]*import\s*['"]([^'"]+)['"]/gm;

function importsOf(file) {
  const src = unhash(readFileSync(p(file), 'utf8'));
  const here = dirname(file);
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec || !spec.startsWith('.')) continue;              // bare/URL: not ours
    const resolved = rel(resolve(p(here), spec));
    if (JS_ASSETS.includes(resolved)) out.push(resolved);
  }
  return out;
}

const jsOrder = [];
const seen = new Map();                                        // file -> 'busy'|'done'
function order(file, stack) {
  const st = seen.get(file);
  if (st === 'done') return;
  if (st === 'busy') {
    console.error(`fingerprint: import cycle: ${[...stack, file].join(' -> ')}`);
    process.exit(1);
  }
  seen.set(file, 'busy');
  for (const dep of importsOf(file)) order(dep, [...stack, file]);
  seen.set(file, 'done');
  jsOrder.push(file);
}
for (const f of JS_ASSETS) order(f, []);

for (const f of jsOrder) {
  const src = unhash(readFileSync(p(f), 'utf8'));
  const here = dirname(f);
  // Import specifiers are relative to the IMPORTING file, so they are rewritten
  // separately from the repo-relative asset literals rewrite() handles.
  let out = src.replace(IMPORT_RE, (whole, a, b, c) => {
    const spec = a || b || c;
    if (!spec || !spec.startsWith('.')) return whole;
    const resolved = rel(resolve(p(here), spec));
    const hashedTarget = MAP.get(resolved);
    if (!hashedTarget) return whole;
    const nextSpec = './' + relative(here, hashedTarget).split('\\').join('/');
    return whole.replace(spec, nextSpec.replace(/^\.\/\.\.\//, '../'));
  });
  out = rewrite(out);
  emit(f, Buffer.from(out, 'utf8'));
}

/* ── 4 · HTML — rewritten in place, never hashed ──────────────────────────── */
for (const f of HTML_FILES) {
  const src = readFileSync(p(f), 'utf8');
  const out = rewrite(unhash(src));
  if (out !== src) writeFileSync(p(f), out);
}

/* ── 5 · verify ───────────────────────────────────────────────────────────── *
 * Two things the build is not allowed to get wrong.                           */
const FEEDS = [
  'https://raw.githubusercontent.com/BlufoxMobile/Daily-Sales-Report/main/data/promo-card.jpg',
  'https://raw.githubusercontent.com/BlufoxMobile/Daily-Sales-Report/main/data/nps-detractor-streaks.json'
];
const screens = MAP.get('assets/screens.js');
if (screens) {
  const built = readFileSync(p(screens), 'utf8');
  for (const feed of FEEDS) {
    if (!built.includes(feed)) {
      console.error(`fingerprint: the live feed was rewritten and must not be:\n  ${feed}`);
      process.exit(1);
    }
  }
}

/* ── 5b · every emitted module's imports must actually resolve ────────────── *
 * WHY THIS EXISTS.
 *   IMPORT_RE (§3) is anchored `^[ \t]*` under /gm, deliberately: it stops a
 *   module's own doc comment ("import { initChefWall } from './chefwall.js';"
 *   as a usage example) from reading as a self-import and therefore as a
 *   dependency cycle. The cost of that anchor is that an import which does not
 *   BEGIN its own line is invisible to this script:
 *
 *       const m = await import('./screens.js');      // assignment, mid-line
 *       if (needsPocket) { await import('./pocket.js'); }   // nested in a block
 *
 *   Such a specifier is never rewritten. The build then exits 0 and prints a
 *   confident "entry:" line while the emitted module still names an un-hashed
 *   twin — and after §6 has pruned two generations of it, or if the specifier
 *   was left hashed at an old hash, that is a 404 on a module, which is a blank
 *   page. The tree was clean when this was written (2026-08-31: 16 modules, 20
 *   relative specifiers, all resolved), so this is a latch, not a repair.
 *
 * WHAT IT CHECKS, on the BYTES THAT SHIP rather than on the sources:
 *   1. every relative specifier resolves to a file that exists on disk;
 *   2. no relative specifier still points at a file this build fingerprints —
 *      i.e. at an UN-hashed twin. That is the rewrite-miss above, and it is the
 *      check that catches it, because the un-hashed source is still on disk (it
 *      is deliberately kept, see "THE SOURCE FILENAMES STAY") and so check 1
 *      alone would pass straight over it.
 *
 * Comments are stripped first, for the same reason IMPORT_RE is anchored: the
 * doc comments in this codebase are full of example imports and of prose that
 * matches `from '…'`. Everything left is code.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments, incl. the headers
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '');      // whole-line // comments

const SPEC_RES = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,            // import … from '…' / export … from '…'
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,// await import('…')  — ANY position
  /\bimport\s*['"]([^'"\n]+)['"]/g           // import '…'  (side-effect only)
];

let checkedModules = 0, checkedSpecs = 0;
for (const src of jsOrder) {
  const emitted = MAP.get(src);
  if (!emitted) continue;
  const here = dirname(emitted);
  const code = stripComments(readFileSync(p(emitted), 'utf8'));
  const seenSpecs = new Set();
  for (const re of SPEC_RES) {
    for (const m of code.matchAll(re)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;   // bare / URL: not this build's problem
      if (seenSpecs.has(spec)) continue;
      seenSpecs.add(spec);
      checkedSpecs++;

      const target = rel(resolve(p(here), spec));
      if (!fileExists(target)) {
        console.error(
          `fingerprint: ${emitted} imports '${spec}', which resolves to ${target} — ` +
          `and that file does not exist. The deployed page would 404 on a module, ` +
          `which is a blank screen. (Was it renamed, or did §3's line-anchored ` +
          `IMPORT_RE miss a mid-line import and leave a stale hash behind?)`);
        process.exit(1);
      }
      if (SOURCE_PATHS.has(target)) {
        console.error(
          `fingerprint: ${emitted} still imports the UN-HASHED '${spec}' (${target}).\n` +
          `  Every module this build fingerprints must be imported by its hashed name.\n` +
          `  §3's IMPORT_RE only matches an import that BEGINS ITS OWN LINE, so a\n` +
          `  mid-line or nested import — const m = await import('${spec}') — is never\n` +
          `  rewritten. Move it to the start of a line, or widen IMPORT_RE.`);
        process.exit(1);
      }
    }
  }
  checkedModules++;
}

// index.html must end up pointing at hashed entry points, or the whole exercise
// silently did nothing.
const html = readFileSync(p('index.html'), 'utf8');
for (const entry of ['assets/app.js', 'assets/theme.css']) {
  const hashed = MAP.get(entry);
  if (!hashed || !html.includes(hashed)) {
    console.error(`fingerprint: index.html does not reference ${hashed || entry}`);
    process.exit(1);
  }
  if (new RegExp(`(?<![\\w.-])${escapeRe(entry)}(?![\\w.-])`).test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
    console.error(`fingerprint: index.html still references the un-hashed ${entry}`);
    process.exit(1);
  }
}

/* ── 6 · prune, KEEPING ONE PREVIOUS GENERATION ───────────────────────────── *
 * THE BUG THIS NOW EXISTS TO KILL.
 *   This step used to keep exactly one hashed copy per source and delete
 *   everything else — the previous build's files included. But index.html is
 *   the one URL that does not move, and GitHub Pages serves it with
 *   `cache-control: max-age=600`. So for up to TEN MINUTES after every push, a
 *   rep coming back to a bookmark is holding the PREVIOUS index.html, which
 *   names the PREVIOUS hashes, which this step had just deleted. Measured on
 *   the live site 2026-08-31: assets/app.2d8d16ff8f.js, assets/theme.f4c9abadeb.css
 *   and data/tools.46eb63be76.json all 404'd — and a 404 on the entry module is
 *   a blank page, not a degraded one. Every deploy opened that window.
 *
 * THE FIX, AND WHY IT CANNOT GROW.
 *   Prune N-2, not N-1. Two generations of hashed files are on disk at any
 *   time: the one this build just emitted and the one before it. A cached
 *   index.html is at most one generation old (it expires in ten minutes; the
 *   next build is minutes-to-days later), so it always resolves.
 *
 *   The retained set is not guessed from the filesystem — it is READ FROM
 *   build/asset-generations.json, which this step writes and which is committed
 *   with the build. Two entries, newest first, hard-capped at KEEP_GENERATIONS.
 *   A file leaves the repo on the SECOND build after the one that emitted it:
 *   generation 1 is kept by build 2 and deleted by build 3. So the ceiling is
 *   two hashed copies per source file, forever — the working tree cannot
 *   accumulate, which is what the original one-copy rule was protecting.
 *
 *   A build that changes nothing emits the identical file list. That must NOT
 *   count as a new generation, or two no-op builds in a row would push the real
 *   previous generation out and reopen the window. So an unchanged list leaves
 *   the manifest alone — no rewrite, no git churn.
 *
 *   `--clean` wipes both generations and starts the window over. It is a reset,
 *   not a deploy step; see the header.
 */
const KEEP_GENERATIONS = 2;
const GENERATIONS_FILE = 'build/asset-generations.json';

/** Newest first: [{ written_at, files:[…] }, …]. Absent/unreadable = first run. */
function readGenerations() {
  if (CLEAN) return [];                       // --clean already removed them all
  try {
    const doc = JSON.parse(readFileSync(p(GENERATIONS_FILE), 'utf8'));
    return (Array.isArray(doc.generations) ? doc.generations : [])
      .filter((g) => g && Array.isArray(g.files) && g.files.length)
      .map((g) => ({ written_at: g.written_at || null, files: g.files.slice() }));
  } catch { return []; }
}

/**
 * FIRST RUN AFTER THIS CHANGE: adopt what is already on disk.
 *
 * With no manifest there is no record of the previous generation — and pruning
 * on that basis would open, one last time, exactly the ten-minute window this
 * section exists to close. The files from the last build are still sitting in
 * the working tree, so they ARE the previous generation: adopt them rather than
 * delete them. Bounded like any other generation — the next build records its
 * own, and the build after that prunes these.
 */
function adoptOnDisk(current) {
  const have = new Set(current);
  const found = [];
  for (const dir of new Set([...MAP.keys()].map((k) => dirname(k)))) {
    let names = [];
    try { names = readdirSync(p(dir)); } catch { continue; }
    for (const n of names) {
      if (!HASHED_RE.test(n)) continue;
      const f = dir === '.' ? n : `${dir}/${n}`;
      if (have.has(f)) continue;
      const stripped = n.replace(new RegExp(`\\.[0-9a-f]{${HASH_LEN}}(\\.[A-Za-z0-9]+)$`), '$1');
      if (!SOURCE_PATHS.has(dir === '.' ? stripped : `${dir}/${stripped}`)) continue;
      found.push(f);
    }
  }
  return found.sort();
}

const thisGeneration = [...MAP.values()].sort();
let previous = readGenerations();
if (!previous.length && !CLEAN) {
  const adopted = adoptOnDisk(thisGeneration);
  if (adopted.length) {
    console.log(`fingerprint: no generation manifest yet — adopting the ${adopted.length} ` +
                `hashed files already on disk as the previous generation, so this build ` +
                `does not 404 a cached index.html.`);
    previous = [{ written_at: null, files: adopted, adopted_from_disk: true }];
  }
}
const isRepeat = previous.length > 0 &&
  previous[0].files.length === thisGeneration.length &&
  previous[0].files.every((f, i) => f === thisGeneration[i]);

// A repeat build IS the generation already on record — recording it again would
// push the real previous generation out and reopen the ten-minute window.
const retained = (isRepeat
  ? previous
  : [{ written_at: new Date().toISOString(), files: thisGeneration }, ...previous]
).slice(0, KEEP_GENERATIONS);
const KEEP = new Set(retained.flatMap((g) => g.files));

let pruned = 0;
for (const dir of new Set([...MAP.keys()].map((k) => dirname(k)))) {
  let names = [];
  try { names = readdirSync(p(dir)); } catch { continue; }
  for (const n of names) {
    if (!HASHED_RE.test(n)) continue;
    const f = dir === '.' ? n : `${dir}/${n}`;
    if (KEEP.has(f)) continue;
    // Only prune something whose un-hashed twin is a source file we own.
    const stripped = n.replace(new RegExp(`\\.[0-9a-f]{${HASH_LEN}}(\\.[A-Za-z0-9]+)$`), '$1');
    const twin = dir === '.' ? stripped : `${dir}/${stripped}`;
    if (!SOURCE_PATHS.has(twin)) continue;
    try { unlinkSync(p(f)); pruned++; } catch { /* noop */ }
  }
}

if (!isRepeat) {
  writeFileSync(p(GENERATIONS_FILE), JSON.stringify({
    note: 'GENERATED FILE — do not hand-edit. Written by build/fingerprint.mjs and ' +
          'COMMITTED WITH THE BUILD. It is the list of hashed asset filenames each ' +
          'build emitted, newest first. The build keeps the newest ' + KEEP_GENERATIONS +
          ' generations on disk so that an index.html cached under max-age=600 — up to ' +
          'ten minutes old — still resolves every URL it names. Deleting this file is ' +
          'safe: the next build finds no manifest and adopts the hashed files already ' +
          'in the working tree as the previous generation, then carries on. ' +
          '`adopted_from_disk` marks a generation recovered that way rather than recorded ' +
          'by the build that emitted it.',
    keep_generations: KEEP_GENERATIONS,
    generations: retained
  }, null, 2) + '\n');
}

console.log(`fingerprint: ${MAP.size} assets hashed${pruned ? `, ${pruned} stale removed` : ''}`);
console.log(`  retention: ${retained.length}/${KEEP_GENERATIONS} generations on disk, ` +
            `${KEEP.size} hashed files kept${isRepeat ? ' (unchanged build — same generation)' : ''}`);
console.log(`  imports verified: ${checkedSpecs} relative specifiers across ${checkedModules} emitted modules`);
console.log(`  ${LEAF_ASSETS.length} media/data · ${CSS_ASSETS.length} css · ${jsOrder.length} js`);
console.log(`  entry: ${MAP.get('assets/app.js')}`);
console.log(`  theme: ${MAP.get('assets/theme.css')}  (source file untouched)`);
