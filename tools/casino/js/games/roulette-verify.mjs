// Roulette payout / coverage / Monte-Carlo / tap-resolver verification (not loaded by the game).
// Run from the casino folder:  node js/games/roulette-verify.mjs [spins=4000000]
import * as R from '../rules/roulette.mjs';
import * as L from './roulette-layout.mjs';
import { rand } from '../core/rng.mjs';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL:', msg); } };

// ── the wheel ──
ok(R.WHEEL.length === 37 && new Set(R.WHEEL).size === 37 && R.WHEEL.every(n => n >= 0 && n <= 36), 'wheel has 0..36 once each');
ok(R.REDS.size === 18, '18 reds');
// on a European wheel colours alternate around the rotor (after 0)
for (let k = 1; k < 36; k++) ok(R.colorOf(R.WHEEL[k]) !== R.colorOf(R.WHEEL[k + 1]), `colours alternate at pocket ${k}`);
// low/high and odd/even have 9 reds each — sanity of the red set
const reds = [...R.REDS];
ok(reds.filter(n => n <= 18).length === 9 && reds.filter(n => n % 2).length === 10, 'red set shape (9 low reds, 10 odd reds)');

// ── catalogue ──
const all = [...R.allBets().values()];
const byType = t => all.filter(b => b.type === t);
const expectCount = { straight: 37, split: 60, street: 12, trio: 2, corner: 22, four: 1, line: 11, column: 3, dozen: 3, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };
for (const [t, n] of Object.entries(expectCount)) ok(byType(t).length === n, `${t}: ${byType(t).length} bets (want ${n})`);
ok(all.length === 157, `157 bets total (got ${all.length})`);
const PAY = { straight: 35, split: 17, street: 11, trio: 11, corner: 8, four: 8, line: 5, column: 2, dozen: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };
for (const b of all) {
  ok(b.pays === PAY[b.type], `${b.id} pays ${b.pays}:1`);
  ok((b.pays + 1) * b.numbers.length === 36, `${b.id}: (pays+1) x covered = 36`);
  ok(Math.abs(R.expectedReturn(b) - 36 / 37) < 1e-12, `${b.id}: exact RTP 36/37`);
}

// ── coverage geometry (independent of the constructors) ──
const pos = n => ({ r: Math.floor((n - 1) / 3), c: (n - 1) % 3 });
for (const b of byType('split')) {
  const [a, c] = b.numbers;
  if (a === 0) { ok([1, 2, 3].includes(c), `zero split ${b.id}`); continue; }
  const p = pos(a), q = pos(c);
  ok((p.r === q.r && Math.abs(p.c - q.c) === 1) || (p.c === q.c && Math.abs(p.r - q.r) === 1), `split ${b.id} is adjacent`);
}
for (const b of byType('corner')) {
  const ps = b.numbers.map(pos), rs = new Set(ps.map(p => p.r)), cs = new Set(ps.map(p => p.c));
  ok(rs.size === 2 && cs.size === 2 && Math.abs([...rs][0] - [...rs][1]) === 1 && Math.abs([...cs][0] - [...cs][1]) === 1, `corner ${b.id} is a 2x2 block`);
}
for (const b of byType('street')) ok(new Set(b.numbers.map(n => pos(n).r)).size === 1 && b.numbers.length === 3, `street ${b.id} is one row`);
for (const b of byType('line')) { const rs = [...new Set(b.numbers.map(n => pos(n).r))]; ok(rs.length === 2 && Math.abs(rs[0] - rs[1]) === 1 && b.numbers.length === 6, `six line ${b.id} is two adjacent rows`); }
ok(JSON.stringify(R.betById('trio:0-1-2').numbers) === '[0,1,2]' && JSON.stringify(R.betById('trio:0-2-3').numbers) === '[0,2,3]', 'trios');
ok(JSON.stringify(R.betById('four:0-1-2-3').numbers) === '[0,1,2,3]', 'first four');
// every split / corner / street / line in the rules is exactly the set a layout sweep would produce
const allSplits = new Set(); for (let n = 1; n <= 36; n++) { if (n % 3) allSplits.add(`split:${n}-${n + 1}`); if (n <= 33) allSplits.add(`split:${n}-${n + 3}`); } [1, 2, 3].forEach(n => allSplits.add(`split:0-${n}`));
ok(allSplits.size === 60 && [...allSplits].every(id => R.betById(id)), 'all 60 splits present');
ok(R.split(1, 5) === null && R.split(3, 4) === null && R.split(0, 4) === null && R.corner(3) === null && R.corner(33) === null, 'illegal combos rejected');

// ── every outcome against every bet, checked against an independent definition ──
const wantWin = (b, n) => {
  switch (b.type) {
    case 'red': return n > 0 && [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
    case 'black': return n > 0 && ![1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
    case 'odd': return n > 0 && n % 2 === 1;
    case 'even': return n > 0 && n % 2 === 0;
    case 'low': return n >= 1 && n <= 18;
    case 'high': return n >= 19 && n <= 36;
    case 'dozen': { const d = +b.id.split(':')[1]; return n > 0 && Math.ceil(n / 12) === d; }
    case 'column': { const c = +b.id.split(':')[1]; return n > 0 && ((n - 1) % 3) + 1 === c; }
    default: return b.numbers.includes(n);
  }
};
for (const b of all) for (let n = 0; n <= 36; n++) {
  const got = R.returnFor(b, 100, n), want = wantWin(b, n) ? 100 * (PAY[b.type] + 1) : 0;
  ok(got === want, `${b.id} on ${n}: got ${got} want ${want}`);
}
// zero: every outside bet loses (no la partage), every inside bet covering 0 wins
for (const b of all) {
  const inside = R.isInside(b);
  if (!inside) ok(R.returnFor(b, 100, 0) === 0, `outside ${b.id} loses on zero`);
  else ok((R.returnFor(b, 100, 0) > 0) === b.numbers.includes(0), `inside ${b.id} on zero`);
}
// hand-picked spins through settleSpin
{
  const s = R.settleSpin([{ id: 'straight:17', amount: 10 }, { id: 'red', amount: 100 }, { id: 'black', amount: 100 }, { id: 'split:14-17', amount: 20 }, { id: 'corner:13-14-16-17', amount: 10 }, { id: 'line:13-14-15-16-17-18', amount: 10 }, { id: 'dozen:2', amount: 50 }, { id: 'column:2', amount: 30 }], 17);
  // 17: black, odd, low, 2nd dozen, column 2
  const want = 10 * 36 + 0 + 200 + 20 * 18 + 10 * 9 + 10 * 6 + 50 * 3 + 30 * 3;
  ok(s.returned === want && s.staked === 330 && s.straightHit && s.net === want - 330, `settleSpin 17 → ${s.returned} (want ${want})`);
  const z = R.settleSpin([{ id: 'straight:0', amount: 10 }, { id: 'red', amount: 100 }, { id: 'even', amount: 100 }, { id: 'four:0-1-2-3', amount: 20 }, { id: 'trio:0-2-3', amount: 10 }, { id: 'split:0-3', amount: 10 }, { id: 'column:3', amount: 10 }], 0);
  ok(z.returned === 360 + 180 + 120 + 180 && z.staked === 260 && z.straightHit, `settleSpin 0 → ${z.returned}`);
}

// ── exact house edge per bet type (all 37 outcomes, equal weight) ──
console.log('\nExact house edge by bet type:');
for (const t of Object.keys(expectCount)) {
  let st = 0, ret = 0;
  for (const b of byType(t)) for (let n = 0; n <= 36; n++) { st += 1; ret += R.returnFor(b, 1, n); }
  const edge = 1 - ret / st;
  ok(Math.abs(edge - 1 / 37) < 1e-12, `${t} exact edge`);
  console.log(`  ${t.padEnd(8)} ${(edge * 100).toFixed(4)}%`);
}

// ── Monte Carlo with the game's own crypto RNG ──
const N = +(process.argv[2] || 4e6);
console.log(`\nMonte Carlo, ${N.toLocaleString()} spins via rng.rand(37), one random bet of each type per spin:`);
const types = Object.keys(expectCount);
const acc = Object.fromEntries(types.map(t => [t, { st: 0, ret: 0, sq: 0 }]));
const hist = new Array(37).fill(0);
const lists = Object.fromEntries(types.map(t => [t, byType(t)]));
for (let i = 0; i < N; i++) {
  const n = rand(37); hist[n]++;
  for (const t of types) {
    const L2 = lists[t], b = L2[(i * 7919 + 13) % L2.length];   // deterministic rotation through the bets of the type
    const r = R.returnFor(b, 1, n), a = acc[t];
    a.st++; a.ret += r; a.sq += r * r;
  }
}
for (const t of types) {
  const a = acc[t], mean = a.ret / a.st, sd = Math.sqrt(a.sq / a.st - mean * mean), se = sd / Math.sqrt(a.st);
  const edge = 1 - mean, z = (edge - 1 / 37) / se;
  ok(Math.abs(z) < 4, `${t} MC edge within 4 SE (z=${z.toFixed(2)})`);
  console.log(`  ${t.padEnd(8)} edge ${(edge * 100).toFixed(3)}%  ±${(se * 196).toFixed(3)}% (95%)  z=${z.toFixed(2)}`);
}
// pooled edge across all types (should be very close to 2.70%)
{
  let st = 0, ret = 0; for (const t of types) { st += acc[t].st; ret += acc[t].ret; }
  console.log(`  pooled   edge ${((1 - ret / st) * 100).toFixed(3)}%`);
}
// uniformity of the RNG over the 37 pockets (chi-square, 36 dof; 99.9% critical ≈ 67.99)
{
  const e = N / 37, chi = hist.reduce((s, h) => s + (h - e) ** 2 / e, 0);
  ok(chi < 68, `rand(37) chi-square ${chi.toFixed(1)} < 68`);
  console.log(`  chi-square over 37 pockets: ${chi.toFixed(1)} (36 dof)`);
}
// Monte Carlo with whole random layouts through settleSpin, compared with an independent sum
{
  let st = 0, ret = 0;
  for (let i = 0; i < 200000; i++) {
    const bets = Array.from({ length: 1 + (i % 7) }, (_, k) => ({ id: all[(i * 31 + k * 97) % all.length].id, amount: 10 * (1 + ((i + k) % 5)) }));
    const n = rand(37), s = R.settleSpin(bets, n);
    const want = bets.reduce((a, b) => a + (wantWin(R.betById(b.id), n) ? b.amount * (PAY[R.betById(b.id).type] + 1) : 0), 0);
    if (s.returned !== want) { ok(false, `layout settle mismatch at ${i}`); break; }
    st += s.staked; ret += s.returned;
  }
  checks++;
  console.log(`  random layouts via settleSpin: edge ${((1 - ret / st) * 100).toFixed(3)}%`);
}

// ── tap resolver round trip ──
for (const b of all) {
  const [x, z] = L.betSpot(b), got = L.betAt(x, z);
  ok(got && got.id === b.id, `betAt(betSpot(${b.id})) → ${got?.id}`);
}
for (let n = 0; n <= 36; n++) { const [x, z] = L.cellCentre(n); ok(L.betAt(x, z)?.id === `straight:${n}`, `centre of ${n}`); }
// specific taps
const at = (x, z) => L.betAt(x, z)?.id;
const c = L.cellCentre;
ok(at((c(14)[0] + c(17)[0]) / 2, c(14)[1]) === 'split:14-17', 'edge 14|17 → split');
ok(at(c(14)[0], (c(14)[1] + c(15)[1]) / 2) === 'split:14-15', 'edge 14|15 → split');
ok(at((c(14)[0] + c(17)[0]) / 2, (c(14)[1] + c(15)[1]) / 2) === 'corner:14-15-17-18', 'intersection → corner');
ok(at(c(13)[0], L.GRID.z1) === 'street:13-14-15', 'outer line → street');
ok(at((c(13)[0] + c(16)[0]) / 2, L.GRID.z1 + .005) === 'line:13-14-15-16-17-18', 'outer line x row edge → six line');
ok(at(L.X0, L.GRID.z1) === 'four:0-1-2-3', 'zero corner → first four');
ok(at(L.X0, (c(1)[1] + c(2)[1]) / 2) === 'trio:0-1-2' && at(L.X0, (c(2)[1] + c(3)[1]) / 2) === 'trio:0-2-3', 'trios');
ok(at(L.X0 - .005, c(2)[1]) === 'split:0-2', 'zero split');
ok(at(L.X0 - .06, c(2)[1] + .1) === 'straight:0', 'zero box');
ok(at(L.GRID.x1 + .04, c(36)[1]) === 'column:3' && at(L.GRID.x1 + .04, c(34)[1]) === 'column:1', 'columns');
ok(at(c(5)[0], L.GRID.z1 + .06) === 'dozen:1' && at(c(20)[0], L.GRID.z1 + .06) === 'dozen:2' && at(c(35)[0], L.GRID.z1 + .06) === 'dozen:3', 'dozens');
const evZ = L.GRID.dozZ1 + .04, evIds = ['low', 'even', 'red', 'black', 'odd', 'high'];
evIds.forEach((id, i) => ok(at(L.X0 + (i * 2 + 1) * L.CELL_U, evZ) === id, `even-money box ${id}`));
ok(at(L.X0 - .3, 0) == null && at(0, L.GRID.evenZ1 + .05) == null && at(0, L.Z0 - .05) == null, 'off-layout taps → null');
// a fine sweep: every point on the layout resolves to a legal bet whose chip spot is near the tap
let sweepMax = 0, sweepN = 0;
for (let x = L.BOUNDS.x0 + .001; x < L.BOUNDS.x1; x += .004) for (let z = L.BOUNDS.z0 + .001; z < L.BOUNDS.z1; z += .004) {
  const b = L.betAt(x, z); if (!b) continue; sweepN++;
  const cat = R.betById(b.id); ok(cat && JSON.stringify(cat.numbers) === JSON.stringify(b.numbers) && cat.pays === b.pays, `sweep bet ${b.id} is catalogued`);
  if (R.isInside(b) && b.id !== 'straight:0') { const [sx, sz] = L.betSpot(b), d = Math.hypot(sx - x, sz - z); if (d > sweepMax) { sweepMax = d; globalThis.worst = [b.id, x.toFixed(3), z.toFixed(3)]; } }
}
ok(sweepMax < .08, `inside-bet chips land within 8 cm of the tap (max ${sweepMax.toFixed(3)} m)`);
console.log(`\nSweep: ${sweepN} points resolved; furthest inside chip from its tap ${(sweepMax * 100).toFixed(1)} cm`);
const found = new Set(); for (let x = L.BOUNDS.x0 + .0005; x < L.BOUNDS.x1; x += .002) for (let z = L.BOUNDS.z0 + .0005; z < L.BOUNDS.z1; z += .002) { const b = L.betAt(x, z); if (b) found.add(b.id); }
ok(found.size === 157, `every one of the 157 bets is reachable by tapping (${found.size})`);

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
