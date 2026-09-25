// MIDNIGHT FOX — 5 reels × 3 rows, 20 fixed lines, left-to-right line pays.
// Fox medallion WILD (reels 2–5) substitutes for everything except the
// sapphire SCATTER. 3/4/5 scatters anywhere pay 2/10/50× the total bet and
// award 8/12/20 free spins; free spins pay double and can retrigger.
//
// Pure functions — the browser imports them, and Node runs the proof:
//   node js/rules/slots.mjs            exact full-cycle analysis (all 53.7M stop combinations)
//   node js/rules/slots.mjs mc 5000000 Monte Carlo with the crypto RNG, free spins played out
//   node js/rules/slots.mjs test       evaluator checks on crafted windows
import { rand } from '../core/rng.mjs';

export const SYM = { WILD: 0, SCATTER: 1, CROWN: 2, SEVEN: 3, BARS: 4, BELL: 5, MARTINI: 6, CHERRY: 7, CHIPS: 8, A: 9, K: 10, Q: 11, J: 12, T: 13 };
export const SYMBOLS = [
  { key: 'W', name: 'Fox Wild' }, { key: 'S', name: 'Sapphire' }, { key: 'CR', name: 'Crown' }, { key: 'SV', name: 'Red Seven' },
  { key: 'BR', name: 'Gold Bars' }, { key: 'BL', name: 'Gold Bell' }, { key: 'MT', name: 'Martini' }, { key: 'CH', name: 'Cherries' },
  { key: 'CP', name: 'Chip Stack' }, { key: 'A', name: 'Ace' }, { key: 'K', name: 'King' }, { key: 'Q', name: 'Queen' }, { key: 'J', name: 'Jack' }, { key: 'T', name: 'Ten' }
];
const KEY = Object.fromEntries(SYMBOLS.map((s, i) => [s.key, i]));

// Reel strips (top-to-bottom order as they pass the window). Wilds and
// scatters are always at least three stops apart, so one reel never shows two.
const RAW = [
  'Q BR CP MT J K BR A A CR MT SV K BL Q CH Q A T BL Q CP MT K J S T CH CR SV BL CH',
  'CH BR S SV MT CP W K BL W J CR MT A CP A K CH SV T CH J K W Q T CP CR Q Q J BR MT BL W A',
  'K A CR Q W BR A CH A T BL SV MT J CP CR CH MT BR SV K W MT CP K S T Q CP Q BL W CH J J',
  'CP T SV J BL Q K MT S T K K CR CP W A CH BR J CH J W CR Q A CP Q MT A W MT CH SV W BR BL',
  'K CP A A K T Q K CH Q W CH T S J J MT SV MT CR T BL W CP CR Q SV BR CH A MT BR W CP J J BL'
];
export const REELS = RAW.map(r => r.split(' ').map(k => KEY[k]));

// Line pays in multiples of the LINE bet, indexed by count (3, 4, 5 of a kind).
export const PAYS = {
  [SYM.CROWN]: [0, 0, 0, 50, 250, 1000], [SYM.SEVEN]: [0, 0, 0, 40, 200, 750], [SYM.BARS]: [0, 0, 0, 30, 100, 400],
  [SYM.BELL]: [0, 0, 0, 25, 100, 250], [SYM.MARTINI]: [0, 0, 0, 20, 75, 200], [SYM.CHERRY]: [0, 0, 0, 15, 60, 150],
  [SYM.CHIPS]: [0, 0, 0, 15, 50, 125], [SYM.A]: [0, 0, 0, 10, 40, 150], [SYM.K]: [0, 0, 0, 10, 30, 125],
  [SYM.Q]: [0, 0, 0, 5, 25, 100], [SYM.J]: [0, 0, 0, 5, 20, 80], [SYM.T]: [0, 0, 0, 5, 15, 60]
};
export const SCATTER_PAYS = [0, 0, 0, 2, 10, 50];     // × TOTAL bet
export const FREE_SPINS = [0, 0, 0, 8, 12, 20];
export const FS_MULT = 2;
export const FS_CAP = 200;                             // safety cap on a single feature (practically never reached)
export const NLINES = 20;
export const LINE_BETS = [1, 2, 5, 10, 25, 50];        // chips per line → 20 … 1,000 total
// rows: 0 top, 1 middle, 2 bottom
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 2, 2, 0], [2, 0, 0, 0, 2], [0, 2, 0, 2, 0]
];
export const WIN_TIERS = [{ name: 'EPIC WIN', x: 50 }, { name: 'MEGA WIN', x: 25 }, { name: 'BIG WIN', x: 10 }];
export const tierFor = multiple => WIN_TIERS.find(t => multiple >= t.x) || null;

// stops[i] = strip index shown in the TOP row of reel i
export function spinStops(rng = rand) { return REELS.map(r => rng(r.length)); }
export function windowOf(stops) {
  return REELS.map((strip, i) => [0, 1, 2].map(row => strip[(stops[i] + row) % strip.length]));
}

// Evaluate a 5×3 window. Returns wins in chips for the given line bet.
export function evaluate(win, lineBet = 1, mult = 1) {
  const lines = [];
  for (let li = 0; li < LINES.length; li++) {
    const ln = LINES[li], s = win[0][ln[0]];
    if (s === SYM.SCATTER || s === SYM.WILD) continue;
    let k = 1;
    while (k < 5) { const x = win[k][ln[k]]; if (x === s || x === SYM.WILD) k++; else break; }
    const pay = PAYS[s][k];
    if (pay) lines.push({ line: li, sym: s, count: k, pay: pay * lineBet * mult, cells: ln.slice(0, k).map((row, reel) => [reel, row]) });
  }
  const sc = [];
  for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (win[r][row] === SYM.SCATTER) sc.push([r, row]);
  const n = Math.min(5, sc.length);
  const scatter = { count: n, cells: sc, pay: SCATTER_PAYS[n] * lineBet * NLINES * mult, spins: FREE_SPINS[n] };
  const total = lines.reduce((a, l) => a + l.pay, 0) + scatter.pay;
  return { lines, scatter, total };
}

// One complete paid spin including any free-spins feature (used by the simulator
// and when a player leaves mid-feature: the rest of the feature is played out instantly).
export function playFeature(spins, lineBet, rng = rand) {
  let left = spins, played = 0, total = 0;
  while (left > 0 && played < FS_CAP) {
    left--; played++;
    const r = evaluate(windowOf(spinStops(rng)), lineBet, FS_MULT);
    total += r.total; if (r.scatter.spins) left += r.scatter.spins;
  }
  return { played, total };
}

// ── proof ─────────────────────────────────────────────────────────────────
// Exact: every combination of reel stops is enumerated once (the full cycle).
// Free spins use the same strips at ×2, so their value follows exactly from the
// base-game distribution: with r = expected spins awarded per spin, a feature
// of n spins lasts n/(1−r) spins on average (retriggers included, Wald).
export function cycle() {
  const L = REELS.map(r => r.length), total = L.reduce((a, b) => a * b, 1);
  let sumLine = 0, sumScat = 0, hits = 0, lineHits = 0;
  const scat = [0, 0, 0, 0, 0, 0], win = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const col = (i, s) => { const st = REELS[i]; for (let row = 0; row < 3; row++) win[i][row] = st[(s + row) % L[i]]; };
  const sOn = REELS.map((st, i) => st.map((_, s) => [0, 1, 2].filter(row => st[(s + row) % L[i]] === SYM.SCATTER).length));
  for (let a = 0; a < L[0]; a++) { col(0, a);
    for (let b = 0; b < L[1]; b++) { col(1, b);
      for (let c = 0; c < L[2]; c++) { col(2, c);
        for (let d = 0; d < L[3]; d++) { col(3, d);
          for (let e = 0; e < L[4]; e++) { col(4, e);
            let lw = 0;
            for (let li = 0; li < 20; li++) {
              const ln = LINES[li], s = win[0][ln[0]]; if (s === SYM.SCATTER) continue;
              let k = 1; while (k < 5) { const x = win[k][ln[k]]; if (x === s || x === SYM.WILD) k++; else break; }
              if (k >= 3) lw += PAYS[s][k];
            }
            const n = Math.min(5, sOn[0][a] + sOn[1][b] + sOn[2][c] + sOn[3][d] + sOn[4][e]);
            scat[n]++;
            sumLine += lw; sumScat += SCATTER_PAYS[n] * NLINES;
            if (lw) lineHits++;
            if (lw || n >= 3) hits++;
          }
        }
      }
    }
  }
  const line = sumLine / NLINES / total, scatter = sumScat / NLINES / total, base = line + scatter;
  const P = scat.map(x => x / total);
  const r = P.reduce((a, p, k) => a + p * FREE_SPINS[k], 0), feat = P[3] + P[4] + P[5];
  const featureRTP = base * FS_MULT * r / (1 - r);
  return { combos: total, line, scatter, base, featureRTP, rtp: base + featureRTP, hitRate: hits / total, lineHitRate: lineHits / total, featureEvery: 1 / feat, avgFeatureSpins: (P[3] * 8 + P[4] * 12 + P[5] * 20) / feat / (1 - r), scatterP: P };
}

// Monte Carlo with the real crypto RNG (buffered for speed; same unbiased rejection sampling as rng.rand)
export function simulate(n = 5e6, rng = cryptoStream()) {
  let staked = 0, returned = 0, hits = 0, features = 0, fsSpins = 0, big = 0, mega = 0, epic = 0, maxX = 0, retriggers = 0;
  for (let i = 0; i < n; i++) {
    const r = evaluate(windowOf(spinStops(rng)), 1, 1);
    let win = r.total;
    if (r.scatter.spins) {
      features++;
      let left = r.scatter.spins, played = 0;
      while (left > 0 && played < FS_CAP) {
        left--; played++;
        const f = evaluate(windowOf(spinStops(rng)), 1, FS_MULT);
        win += f.total; if (f.scatter.spins) { left += f.scatter.spins; retriggers++; }
      }
      fsSpins += played;
    }
    staked += NLINES; returned += win;
    if (win > 0) hits++;
    const x = win / NLINES; if (x > maxX) maxX = x;
    if (x >= 50) epic++; else if (x >= 25) mega++; else if (x >= 10) big++;
  }
  return { spins: n, rtp: returned / staked, hitRate: hits / n, featureEvery: n / Math.max(1, features), avgFeatureSpins: fsSpins / Math.max(1, features), retriggers, bigWinEvery: n / Math.max(1, big + mega + epic), tiers: { big, mega, epic }, maxX };
}
export function cryptoStream(size = 16384) {
  const buf = new Uint32Array(size); let i = size;
  return n => {
    const limit = Math.floor(4294967296 / n) * n;
    for (;;) { if (i >= size) { globalThis.crypto.getRandomValues(buf); i = 0; } const v = buf[i++]; if (v < limit) return v % n; }
  };
}

// CLI
if (globalThis.process?.argv?.[1]?.endsWith('slots.mjs')) {
  const [mode, count] = process.argv.slice(2);
  const pct = x => (x * 100).toFixed(3) + '%';
  if (mode === 'test') {
    const { CROWN: CR, WILD: W, SCATTER: S, SEVEN: SV, A, K, Q, J, T, CHERRY: CH } = SYM;
    // window given as rows (top, middle, bottom) of five symbols → columns
    const win = rows => [0, 1, 2, 3, 4].map(r => rows.map(row => row[r]));
    const cases = [
      ['wilds complete a line', win([[A, K, Q, J, T], [CR, W, W, CR, K], [Q, J, T, A, K]]), 2, r => r.lines.some(l => l.line === 0 && l.sym === CR && l.count === 4 && l.pay === 250 * 2)],
      ['five of a kind with a wild', win([[SV, W, SV, SV, SV], [A, Q, K, J, T], [K, J, Q, A, CH]]), 1, r => r.lines.some(l => l.line === 1 && l.count === 5 && l.pay === 750)],
      ['two of a kind pays nothing', win([[CR, CR, A, K, Q], [J, T, A, K, Q], [T, J, K, A, Q]]), 1, r => r.lines.length === 0],
      ['scatter never starts a line', win([[S, S, S, K, Q], [J, T, A, K, Q], [T, J, K, A, Q]]), 5, r => r.lines.length === 0 && r.scatter.count === 3 && r.scatter.pay === 2 * 5 * NLINES && r.scatter.spins === 8],
      ['scatters pay anywhere', win([[S, A, K, Q, J], [K, Q, S, J, T], [A, K, Q, T, S]]), 1, r => r.scatter.count === 3 && r.scatter.spins === 8],
      ['five scatters', win([[S, A, S, Q, S], [K, S, K, S, T], [A, K, Q, T, J]]), 1, r => r.scatter.count === 5 && r.scatter.pay === 50 * NLINES && r.scatter.spins === 20],
      ['free-spin multiplier', win([[A, K, Q, J, T], [CR, CR, CR, J, K], [Q, J, T, A, K]]), 1, r => false],
      ['V line (line 4) pays', win([[CH, K, Q, J, CH], [A, CH, J, CH, T], [K, Q, CH, A, K]]), 1, r => r.lines.some(l => l.line === 3 && l.count === 5 && l.pay === 150)]
    ];
    let ok = 0;
    for (const [name, w, lb, test] of cases) {
      let r = evaluate(w, lb);
      if (name === 'free-spin multiplier') { const r2 = evaluate(w, lb, FS_MULT); r = r2; if (r2.total === 2 * evaluate(w, lb).total && r2.lines.some(l => l.line === 0 && l.pay === 100)) { ok++; continue; } }
      if (test(r)) ok++; else console.log('  FAIL', name, JSON.stringify(r.lines), JSON.stringify(r.scatter));
    }
    const noWildOnReel1 = !REELS[0].includes(SYM.WILD), spaced = REELS.every(st => st.every((s, i) => (s !== SYM.WILD && s !== SYM.SCATTER) || [1, 2].every(k => { const t = st[(i + k) % st.length]; return t !== SYM.WILD && t !== SYM.SCATTER; })));
    console.log(`Line evaluator: ${ok}/${cases.length} crafted windows correct · no wild on reel 1: ${noWildOnReel1} · specials ≥3 apart on every strip: ${spaced}`);
  } else if (mode === 'mc') {
    const n = +(count || 5e6), t0 = Date.now(), s = simulate(n);
    console.log(`Monte Carlo · ${n.toLocaleString()} paid spins (crypto RNG, features played out) · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`  RTP ${pct(s.rtp)} · hit rate ${pct(s.hitRate)} · free spins every ${s.featureEvery.toFixed(1)} spins · ${s.avgFeatureSpins.toFixed(2)} spins/feature · ${s.retriggers} retriggers`);
    console.log(`  big wins (≥10×) every ${s.bigWinEvery.toFixed(0)} spins · tiers ${JSON.stringify(s.tiers)} · max ${s.maxX.toFixed(1)}× bet`);
  } else {
    const t0 = Date.now(), c = cycle();
    console.log(`Exact full cycle · ${c.combos.toLocaleString()} stop combinations · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`  line pays ${pct(c.line)} + scatter pays ${pct(c.scatter)} + free spins ${pct(c.featureRTP)} = RTP ${pct(c.rtp)}`);
    console.log(`  hit rate ${pct(c.hitRate)} (base game, any line win or feature) · line-win rate ${pct(c.lineHitRate)}`);
    console.log(`  free spins every ${c.featureEvery.toFixed(1)} spins · ${c.avgFeatureSpins.toFixed(2)} free spins per feature incl. retriggers`);
  }
}
