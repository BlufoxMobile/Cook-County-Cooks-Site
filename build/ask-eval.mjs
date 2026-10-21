#!/usr/bin/env node
/* =============================================================================
 * build/ask-eval.mjs — offline eval for assets/ask-engine.js ("Ask the Chef")
 *
 *   node build/ask-eval.mjs                 # real index: data/ask-index.json
 *   node build/ask-eval.mjs --index other.json
 *   node build/ask-eval.mjs --fails         # list every miss
 *   node build/ask-eval.mjs --split holdout # only one split
 *   node build/ask-eval.mjs --q "how 2 add shield"   # debug one question
 *   node build/ask-eval.mjs --questions build/ask-eval-questions-qa1.json    # QA agent's 100
 *   node build/ask-eval.mjs --questions build/ask-eval-questions-probe.json  # engine agent's probe
 *
 * Question files (each says where it came from in its _provenance field):
 *   ask-eval-questions.json        builder's 180; every 3rd is a holdout
 *   ask-eval-questions-qa1.json    independent QA agent's 100 (tuned against in round 2)
 *   ask-eval-questions-probe.json  60 written by the engine agent mid round 2 (tuned against)
 *
 * Questions: build/ask-eval-questions.json
 *   { q, expect: [doc ids] | "none", split: "tune"|"holdout", freezer?: true }
 * A question is top-1 correct when answer(q).primary.id is in `expect` and the
 * mode is not 'none'; top-3 when any of search(q, {limit:3}) is. An `expect:
 * "none"` question is correct when the mode is 'none'.
 *
 * Prints: top-1, top-3, none precision/recall, freezer-flag accuracy, latency
 * (index build and per query), a confidence calibration table, and the
 * LOW_CONFIDENCE line's effect. Exit code 0 always (it is a report).
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAsk, LOW_CONFIDENCE } from '../assets/ask-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i === -1 ? d : args[i + 1]; };
const indexPath = path.resolve(ROOT, opt('--index', 'data/ask-index.json'));
const qPath = path.resolve(ROOT, opt('--questions', 'build/ask-eval-questions.json'));
const onlySplit = opt('--split', null);
const showFails = args.includes('--fails');
const one = opt('--q', null);

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const toolsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tools.json'), 'utf8'));

// ---- build timing (median of 7 cold builds) ----
const builds = [];
let ask;
for (let k = 0; k < 7; k++) {
  const t0 = performance.now();
  ask = createAsk({ index, tools: toolsDoc.tools, rooms: toolsDoc.rooms });
  builds.push(performance.now() - t0);
}
builds.sort((a, b) => a - b);

if (one) {
  const a = ask.answer(one);
  console.log(`mode=${a.mode} conf=${a.confidence}${a.freezer ? ' FREEZER' : ''}`);
  if (ask.debug) console.log('  read as: ' + ask.debug(one));
  for (const r of ask.search(one, { limit: 8 })) console.log(`  ${r.score.toFixed(2).padStart(7)}  ${r.doc.id}  [${r.doc.kind}] ${r.doc.title}  — ${r.why.join('; ')}`);
  process.exit(0);
}

const all = JSON.parse(fs.readFileSync(qPath, 'utf8'));
const qs = (Array.isArray(all) ? all : all.questions).filter((x) => !onlySplit || x.split === onlySplit);
const ids = new Set(index.docs.map((d) => d.id));

// ---- label check ----
const badLabels = [];
for (const x of qs) if (Array.isArray(x.expect)) for (const id of x.expect) if (!ids.has(id)) badLabels.push(`${x.q} -> ${id}`);

// ---- run ----
const rows = [];
const lat = [];
for (const x of qs) {
  // warm once, then time
  ask.answer(x.q);
  const t0 = performance.now();
  const a = ask.answer(x.q);
  const s3 = ask.search(x.q, { limit: 3 });
  lat.push(performance.now() - t0);
  const isNone = x.expect === 'none';
  const exp = isNone ? [] : x.expect;
  const top1 = isNone ? a.mode === 'none' : (a.mode !== 'none' && a.primary && exp.includes(a.primary.id));
  const top3 = isNone ? a.mode === 'none' : s3.some((r) => exp.includes(r.doc.id));
  const inCand = isNone ? true : a.candidates.some((d) => exp.includes(d.id));
  const freezerOk = x.freezer ? !!a.freezer : !a.freezer;
  rows.push({ x, a, s3, top1, top3, inCand, isNone, freezerOk });
}

function summarize(list, label) {
  const pos = list.filter((r) => !r.isNone);
  const neg = list.filter((r) => r.isNone);
  const saidNone = list.filter((r) => r.a.mode === 'none');
  const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}% (${n}/${d})` : 'n/a';
  console.log(`\n== ${label}: ${list.length} questions (${pos.length} answerable, ${neg.length} expect none)`);
  console.log(`  top-1 (all)          ${pct(list.filter((r) => r.top1).length, list.length)}`);
  console.log(`  top-3 (all)          ${pct(list.filter((r) => r.top3).length, list.length)}`);
  console.log(`  top-1 answerable     ${pct(pos.filter((r) => r.top1).length, pos.length)}`);
  console.log(`  top-3 answerable     ${pct(pos.filter((r) => r.top3).length, pos.length)}`);
  console.log(`  in 12 candidates     ${pct(pos.filter((r) => r.inCand).length, pos.length)}`);
  console.log(`  none precision       ${pct(saidNone.filter((r) => r.isNone).length, saidNone.length)}`);
  console.log(`  none recall          ${pct(neg.filter((r) => r.a.mode === 'none').length, neg.length)}`);
  console.log(`  freezer flag right   ${pct(list.filter((r) => r.freezerOk).length, list.length)}`);
  return list;
}

console.log(`index: ${path.relative(ROOT, indexPath)} — ${index.docs.length} docs (${ask.size} rankable), built ${index.built_at || '?'}`);
console.log(`kinds: ${JSON.stringify(index.docs.reduce((m, d) => (m[d.kind] = (m[d.kind] || 0) + 1, m), {}))}, locked: ${index.docs.filter((d) => d.locked).length}`);
if (badLabels.length) console.log(`\n!! ${badLabels.length} labels name ids not in the index:\n   ${badLabels.join('\n   ')}`);

summarize(rows, 'ALL');
if (!onlySplit) {
  summarize(rows.filter((r) => r.x.split !== 'holdout'), 'TUNE');
  summarize(rows.filter((r) => r.x.split === 'holdout'), 'HOLDOUT (never tuned against)');
}

// ---- latency ----
lat.sort((a, b) => a - b);
const q = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
console.log(`\n== latency (Node ${process.version})`);
console.log(`  index build  median ${builds[3].toFixed(1)} ms  (min ${builds[0].toFixed(1)}, max ${builds[6].toFixed(1)})`);
console.log(`  answer+search  p50 ${q(0.5).toFixed(2)} ms  p95 ${q(0.95).toFixed(2)} ms  max ${lat[lat.length - 1].toFixed(2)} ms`);

// ---- calibration ----
console.log(`\n== confidence calibration (answerable questions; "right" = top-1 correct)`);
const bins = [[0, 0.3], [0.3, 0.45], [0.45, 0.55], [0.55, 0.7], [0.7, 0.85], [0.85, 1.01]];
const pos = rows.filter((r) => !r.isNone && r.a.mode !== 'none');
for (const [lo, hi] of bins) {
  const b = pos.filter((r) => r.a.confidence >= lo && r.a.confidence < hi);
  const ok = b.filter((r) => r.top1).length;
  console.log(`  [${lo.toFixed(2)}, ${Math.min(hi, 1).toFixed(2)})  n=${String(b.length).padStart(3)}  top-1 ${b.length ? (100 * ok / b.length).toFixed(0).padStart(3) + '%' : '  - '}`);
}
const above = pos.filter((r) => r.a.confidence >= LOW_CONFIDENCE);
const below = pos.filter((r) => r.a.confidence < LOW_CONFIDENCE);
console.log(`  >= LOW_CONFIDENCE (${LOW_CONFIDENCE}): ${above.length} answered locally, top-1 ${(100 * above.filter((r) => r.top1).length / Math.max(1, above.length)).toFixed(1)}%`);
console.log(`  <  LOW_CONFIDENCE: ${below.length} go to the Worker, top-1 ${(100 * below.filter((r) => r.top1).length / Math.max(1, below.length)).toFixed(1)}%, right doc in candidates ${(100 * below.filter((r) => r.inCand).length / Math.max(1, below.length)).toFixed(1)}%`);
const modes = rows.reduce((m, r) => (m[r.a.mode] = (m[r.a.mode] || 0) + 1, m), {});
console.log(`  modes: ${JSON.stringify(modes)}, best guesses (choices, guess:true): ${rows.filter((r) => r.a.guess).length} (top-1 right ${rows.filter((r) => r.a.guess && r.top1).length})`);

// ---- robustness: the same questions with everyday words added (round 4) ----
// Dates, weekdays, store/retailer/place names and people must lower confidence,
// never refuse a question the engine otherwise answers, and never make an
// off-topic question answerable.
{
  const EXTRA = ['next month', 'on tuesday', 'at the skokie store', 'she shops at walmart', 'in apt 4b', 'by friday',
    'last week', 'from best buy', 'in evanston', 'oct 3rd', 'this weekend', 'at target', 'for her grandma', 'asap pls',
    'in oak lawn', 'on monday morning', 'from costco', 'in bourbonnais', 'tmrw at noon', 'at the mall'];
  let n = 0, keep = 0, lost = 0, refused = 0, offN = 0, offRef = 0;
  rows.forEach((r, i) => {
    const q2 = `${r.x.q} ${EXTRA[i % EXTRA.length]}`;
    const a2 = ask.answer(q2);
    if (r.isNone) { if (!r.x.freezer) { offN++; if (a2.mode === 'none') offRef++; } return; }
    n++;
    if (a2.mode === 'none') refused++;
    const ok2 = a2.mode !== 'none' && a2.primary && r.x.expect.includes(a2.primary.id);
    if (ok2) keep++; else if (r.top1) lost++;
  });
  console.log(`\n== robustness: + everyday words (dates, places, retailers, people)`);
  console.log(`  answerable top-1      ${(100 * keep / Math.max(1, n)).toFixed(1)}% (${keep}/${n}); lost vs plain ${lost}; refused ${refused}`);
  console.log(`  off-topic refused     ${offN ? (100 * offRef / offN).toFixed(1) + '%' : 'n/a'} (${offRef}/${offN})`);
}

if (showFails) {
  console.log('\n== misses');
  for (const r of rows) {
    if (r.top1 && r.freezerOk) continue;
    const got = r.a.mode === 'none' ? 'NONE' : r.a.primary.id;
    console.log(`  [${r.x.split}] ${r.top3 ? 'top3' : 'MISS'} "${r.x.q}"  want ${Array.isArray(r.x.expect) ? r.x.expect.join(' | ') : 'none'}  got ${got} (${r.a.mode} ${r.a.confidence})${r.freezerOk ? '' : ' FREEZER-FLAG-WRONG'}`);
    if (!r.isNone) console.log(`        top3: ${r.s3.map((s) => s.doc.id).join(', ')}`);
  }
}
