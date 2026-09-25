// Baccarat rules verification (Node only — never imported by the game).
//   node js/games/baccarat-verify.mjs [monteCarloHands]   (default 3,000,000; ~15 s per million)
// Checks: card points, the full third-card tableau vs the printed chart, all 10^6 six-card point
// combinations vs an independent reference, settlement + commission rounding, Big Road placement,
// exact 8-deck odds by enumeration, and a Monte Carlo with the real crypto Shoe.
import * as R from '../rules/baccarat.mjs';
import { Shoe } from '../core/rng.mjs';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };

// 1. card points
const pts = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 0, 11: 0, 12: 0, 13: 0, 14: 1 };
for (const r in pts) ok(R.point({ r: +r, s: 0 }) === pts[r], 'point ' + r);

// 2. Exhaustive tableau: bankerDraws() vs the printed chart, every banker total 0-9 x every third card 0-9 + stood.
// Standard chart (independent literal): banker total -> set of player third-card values on which banker DRAWS.
const STD = { 0: 'all', 1: 'all', 2: 'all', 3: [0, 1, 2, 3, 4, 5, 6, 7, 9], 4: [2, 3, 4, 5, 6, 7], 5: [4, 5, 6, 7], 6: [6, 7], 7: [], 8: [], 9: [] };
let cells = 0;
for (let bt = 0; bt <= 9; bt++) {
  for (let p3 = 0; p3 <= 9; p3++) {
    const want = STD[bt] === 'all' || STD[bt].includes(p3);
    ok(R.bankerDraws(bt, p3) === want, `bankerDraws(${bt}, ${p3}) should be ${want}`);
    if (bt <= 7) ok(R.tableauSays(bt, p3) === want, `TABLEAU[${bt}][${p3}]`);
    cells++;
  }
  const standWant = bt <= 5;       // player stood: banker draws 0-5, stands 6-7
  ok(R.bankerDraws(bt, null) === standWant, `bankerDraws(${bt}, stood)`);
  if (bt <= 7) ok(R.tableauSays(bt, null) === standWant, `TABLEAU[${bt}][stood]`);
  cells++;
}
for (let t = 0; t <= 9; t++) ok(R.playerDraws(t) === (t <= 5), 'playerDraws ' + t);
console.log(`tableau: ${cells} cells checked against the standard chart`);

// 3. Exhaustive coup check over every point-value combination of the six cards (10^6),
// against an independent reference implementation written straight from the rules text.
function refCoup(v) {   // v = [p1,b1,p2,b2,x,y] point values
  let p = (v[0] + v[2]) % 10, b = (v[1] + v[3]) % 10, i = 4, pc = 2, bc = 2;
  if (!(p >= 8 || b >= 8)) {
    let third = -1;
    if (p <= 5) { third = v[i++]; p = (p + third) % 10; pc = 3; }
    let draw;
    if (third < 0) draw = b <= 5;
    else if (b <= 2) draw = true;
    else if (b === 3) draw = third !== 8;
    else if (b === 4) draw = third >= 2 && third <= 7;
    else if (b === 5) draw = third >= 4 && third <= 7;
    else if (b === 6) draw = third === 6 || third === 7;
    else draw = false;
    if (draw) { b = (b + v[i++]) % 10; bc = 3; }
  }
  return { w: p > b ? 'P' : b > p ? 'B' : 'T', p, b, pc, bc };
}
const card = v => ({ r: v === 0 ? 13 : v === 1 ? 14 : v, s: 0 });
let n = 0;
const v = [0, 0, 0, 0, 0, 0];
for (let k = 0; k < 1e6; k++) {
  let x = k; for (let j = 0; j < 6; j++) { v[j] = x % 10; x = Math.floor(x / 10); }
  let i = 0; const draw = () => card(v[i++]);
  const c = R.playCoup(draw), ref = refCoup(v);
  if (c.winner !== ref.w || c.pt !== ref.p || c.bt !== ref.b || c.player.length !== ref.pc || c.banker.length !== ref.bc) { if (fails < 20) console.log('coup mismatch', v, c.winner, ref); fails++; }
  n++;
}
console.log(`coups: ${n.toLocaleString()} six-card combinations match the reference`);

// 4. Settlement
const coupOf = (w, pp = false, bp = false) => ({ winner: w, pPair: pp, bPair: bp });
const S = (k, st, c) => R.settleBet(k, st, c);
ok(S('player', 100, coupOf('P')).returned === 200, 'player win 1:1');
ok(S('player', 100, coupOf('T')).returned === 100, 'player push on tie');
ok(S('player', 100, coupOf('B')).returned === 0, 'player lose');
ok(S('banker', 100, coupOf('B')).returned === 195, 'banker 0.95:1');
ok(S('banker', 100, coupOf('T')).returned === 100, 'banker push on tie');
ok(S('banker', 1000, coupOf('B')).win === 950 && S('banker', 1000, coupOf('B')).commission === 50, 'banker 1000');
ok(S('banker', 25, coupOf('B')).win === 24, 'banker 25 -> 24 (23.75 rounds to 24)');
ok(S('banker', 50, coupOf('B')).win === 47, 'banker 50 -> 47 (47.5 half to house)');
ok(S('banker', 75, coupOf('B')).win === 71, 'banker 75 -> 71 (71.25)');
ok(S('banker', 10000, coupOf('B')).win === 9500, 'banker 10000');
for (let st = 25; st <= 10000; st += 25) { const w = S('banker', st, coupOf('B')).win; ok(Math.abs(w - st * .95) <= .5 + 1e-9, 'banker rounding ' + st); }
ok(S('tie', 100, coupOf('T')).returned === 900, 'tie 8:1');
ok(S('tie', 100, coupOf('P')).returned === 0, 'tie lose');
ok(S('pPair', 100, coupOf('P', true)).returned === 1200, 'player pair 11:1');
ok(S('bPair', 100, coupOf('P', true, false)).returned === 0, 'banker pair lose');
ok(S('bPair', 50, coupOf('T', false, true)).returned === 600, 'banker pair 11:1');
const all = R.settleAll({ player: 100, banker: 0, tie: 25, pPair: 25, bPair: 0 }, coupOf('T', true));
ok(all.staked === 150 && all.returned === 100 + 225 + 300 && all.net === 475, 'settleAll ' + JSON.stringify(all));
ok(R.isPair([{ r: 13, s: 0 }, { r: 13, s: 2 }]) && !R.isPair([{ r: 13, s: 0 }, { r: 12, s: 0 }]), 'pairs are same rank (K-K yes, K-Q no)');
const nat = R.resolve([{ r: 9, s: 0 }, { r: 10, s: 1 }], [{ r: 3, s: 0 }, { r: 4, s: 1 }]);
ok(nat.natural9 && nat.winner === 'P', 'natural 9 flagged');
const nat8 = R.resolve([{ r: 9, s: 0 }, { r: 10, s: 1 }], [{ r: 4, s: 0 }, { r: 4, s: 1 }]);
ok(nat8.natural9 && nat8.winner === 'P' && nat8.natB && nat8.winNatural === 9, 'natural 9 beats natural 8');
const lose9 = R.resolve([{ r: 9, s: 0 }, { r: 10, s: 1 }], [{ r: 9, s: 2 }, { r: 13, s: 1 }]);
ok(lose9.winner === 'T' && !lose9.natural9, 'tied naturals: no winning natural 9');
const b8 = R.resolve([{ r: 2, s: 0 }, { r: 3, s: 1 }], [{ r: 4, s: 0 }, { r: 4, s: 1 }]);
ok(b8.winner === 'B' && !b8.natural9 && b8.winNatural === 8, 'banker natural 8 is not a natural 9');

// 5. Big road placement
const road = R.bigRoad('BBBBBBBBPPT'.split('').map(w => ({ w })));
const pos = road.cells.map(c => `${c.w}${c.col},${c.row}`).join(' ');
ok(pos === 'B0,0 B0,1 B0,2 B0,3 B0,4 B0,5 B1,5 B2,5 P1,0 P1,1', 'big road dragon tail: ' + pos);
ok(road.cells[9].ties === 1, 'tie marked on last cell');
const lead = R.bigRoad('TTPB'.split('').map(w => ({ w })));
ok(lead.cells[0].ties === 2 && lead.cells[0].w === 'P' && lead.cells[1].col === 1, 'leading ties');

// 6. Exact odds by enumeration (8 decks, without replacement)
const ex = R.exactOdds(8);
const pct = x => (x * 100).toFixed(4) + '%';
console.log(`exact 8-deck: P ${pct(ex.P)}  B ${pct(ex.B)}  T ${pct(ex.T)}`);
console.log(`exact house edge: banker ${pct(ex.edge.banker)}  player ${pct(ex.edge.player)}  tie ${pct(ex.edge.tie)}  pair ${pct(ex.edge.pair)}`);
ok(Math.abs(ex.edge.banker - .010579) < 2e-5, 'exact banker edge 1.0579%');
ok(Math.abs(ex.edge.player - .012351) < 2e-5, 'exact player edge 1.2351%');
ok(Math.abs(ex.edge.tie - .143596) < 2e-5, 'exact tie edge 14.3596%');
ok(Math.abs(ex.edge.pair - .103614) < 2e-5, 'exact pair edge 10.36%');

// 7. Monte Carlo with the real crypto Shoe from rng.mjs (8 decks, cut card as the game uses it)
const N = +(process.argv[2] || 3e6);
const shoe = new Shoe(8, .8);
const draw = () => shoe.draw();
let evB = 0, evP = 0, evT = 0, evPP = 0, evB25 = 0, evB50 = 0, w = { P: 0, B: 0, T: 0 };
let sB = 0, sP = 0, sT = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  if (shoe.needsShuffle) shoe.fresh();
  const c = R.playCoup(draw);
  w[c.winner]++;
  const b = c.winner === 'B' ? .95 : c.winner === 'P' ? -1 : 0;
  const p = c.winner === 'P' ? 1 : c.winner === 'B' ? -1 : 0;
  const t = c.winner === 'T' ? 8 : -1;
  evB += b; sB += b * b; evP += p; sP += p * p; evT += t; sT += t * t;
  evPP += c.pPair ? 11 : -1;
  evB25 += (R.settleBet('banker', 25, c).returned - 25) / 25;
  evB50 += (R.settleBet('banker', 50, c).returned - 50) / 50;
}
const se = (s, m) => Math.sqrt((s / N - (m / N) ** 2) / N);
console.log(`\nMonte Carlo, ${N.toLocaleString()} hands, 8-deck crypto Shoe (${((Date.now() - t0) / 1000).toFixed(1)}s):`);
console.log(`  win rates P ${pct(w.P / N)}  B ${pct(w.B / N)}  T ${pct(w.T / N)}`);
const row = (name, m, s, exact) => { const e = -m / N, er = se(s, m); console.log(`  ${name.padEnd(7)} edge ${pct(e)} ± ${pct(1.96 * er)} (95% CI)   exact ${pct(exact)}   z=${((e - exact) / er).toFixed(2)}`); ok(Math.abs(e - exact) < 4 * er, name + ' Monte Carlo within 4 SE'); };
row('Banker', evB, sB, ex.edge.banker);
row('Player', evP, sP, ex.edge.player);
row('Tie', evT, sT, ex.edge.tie);
console.log(`  P.Pair  edge ${pct(-evPP / N)}   exact ${pct(ex.edge.pair)}`);
console.log(`  Banker paid in whole chips (the table's rounding): 25-chip bet edge ${pct(-evB25 / N)} · 50-chip bet ${pct(-evB50 / N)} · multiples of 20 are exact`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
