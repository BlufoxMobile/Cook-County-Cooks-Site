// Craps verification — run with:  node js/games/craps-test.mjs
// 1. every bet × every dice pair × every point state against an independent oracle
// 2. exact expected values by Markov chain (through resolveRoll itself)
// 3. Monte Carlo with the game's crypto RNG
// 4. random play through CrapsLedger + the real Bank: money must always balance
import { resolveRoll, betLimit, removable, niceOdds, CrapsLedger, stickCall, pay, POINTS, HARDS, PROPS, ODDS_X, LAY_X, TRUE_ODDS, LAY_ODDS } from '../rules/craps.mjs';
import { rand } from '../core/rng.mjs';
import { Bank, Events } from '../core/economy.mjs';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; if (fails < 40) console.log('  FAIL', msg); } };
const PSTATES = [null, 4, 5, 6, 8, 9, 10];
const DICE = []; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) DICE.push([a, b]);

// ── 1. oracle ────────────────────────────────────────────────────────────
// Written independently from the rules text, deliberately in a different style.
function oracle(key, A, P, a, b, working = false) {
  const t = a + b, hard = a === b, co = P === null;
  const W = (w, keep = false) => ({ kind: 'win', win: w, keep }), L = { kind: 'lose' }, N = { kind: 'none' };
  if (key === 'pass') { if (co) { if (t === 7 || t === 11) return W(A, true); if ([2, 3, 12].includes(t)) return L; return N; } if (t === P) return W(A, true); if (t === 7) return L; return N; }
  if (key === 'dp') { if (co) { if (t === 2 || t === 3) return W(A, true); if (t === 12) return { kind: 'bar' }; if (t === 7 || t === 11) return L; return N; } if (t === 7) return W(A, true); if (t === P) return L; return N; }
  if (key === 'passOdds') { if (co) return { kind: 'push' }; const m = { 4: 2, 10: 2, 5: 1.5, 9: 1.5, 6: 1.2, 8: 1.2 }[P]; if (t === P) return W(Math.floor(A * m + 1e-9)); if (t === 7) return L; return N; }
  if (key === 'dpOdds') { if (co) return { kind: 'push' }; const m = { 4: .5, 10: .5, 5: 2 / 3, 9: 2 / 3, 6: 5 / 6, 8: 5 / 6 }[P]; if (t === 7) return W(Math.floor(A * m + 1e-9)); if (t === P) return L; return N; }
  if (key === 'come') { if (t === 7 || t === 11) return W(A, P !== null && t === 11); if ([2, 3, 12].includes(t)) return L; return { kind: 'travel', to: 'come' + t }; }
  if (key === 'dc') { if (t === 2 || t === 3) return W(A, true); if (t === 12) return { kind: 'bar' }; if (t === 7 || t === 11) return L; return { kind: 'travel', to: 'dc' + t }; }
  let m;
  if ((m = key.match(/^come(\d+)$/))) { const n = +m[1]; if (t === n) return W(A); if (t === 7) return L; return N; }
  if ((m = key.match(/^dc(\d+)$/))) { const n = +m[1]; if (t === 7) return W(A); if (t === n) return L; return N; }
  if ((m = key.match(/^comeOdds(\d+)$/))) { const n = +m[1], mult = { 4: 2, 10: 2, 5: 1.5, 9: 1.5, 6: 1.2, 8: 1.2 }[n]; if (co && !working) { if (t === n || t === 7) return { kind: 'push' }; return { kind: 'off' }; } if (t === n) return W(Math.floor(A * mult + 1e-9)); if (t === 7) return L; return N; }
  if ((m = key.match(/^dcOdds(\d+)$/))) { const n = +m[1], mult = { 4: .5, 10: .5, 5: 2 / 3, 9: 2 / 3, 6: 5 / 6, 8: 5 / 6 }[n]; if (t === 7) return W(Math.floor(A * mult + 1e-9)); if (t === n) return L; return N; }
  if ((m = key.match(/^place(\d+)$/))) { const n = +m[1]; if (co && !working) return { kind: 'off' }; const mult = { 4: 1.8, 10: 1.8, 5: 1.4, 9: 1.4, 6: 7 / 6, 8: 7 / 6 }[n]; if (t === n) return W(Math.floor(A * mult + 1e-9), true); if (t === 7) return L; return N; }
  if (key === 'field') { if (t === 2) return W(2 * A, true); if (t === 12) return W(3 * A, true); if ([3, 4, 9, 10, 11].includes(t)) return W(A, true); return L; }
  if ((m = key.match(/^hard(\d+)$/))) { const n = +m[1]; if (co && !working) return { kind: 'off' }; if (t === n && hard) return W(A * (n === 6 || n === 8 ? 9 : 7), true); if (t === 7 || t === n) return L; return N; }
  const props = { anySeven: [4, [7]], anyCraps: [7, [2, 3, 12]], yo: [15, [11]], aces: [30, [2]], boxcars: [30, [12]], aceDeuce: [15, [3]] };
  if (props[key]) { const [p, hits] = props[key]; return hits.includes(t) ? W(A * p, true) : L; }
  throw Error('oracle: unknown ' + key);
}
function allKeys(P) {
  const k = ['pass', 'dp', 'field', ...Object.keys(PROPS), ...POINTS.map(n => 'place' + n), ...HARDS.map(n => 'hard' + n), ...POINTS.flatMap(n => ['come' + n, 'dc' + n, 'comeOdds' + n, 'dcOdds' + n])];
  if (P !== null) k.push('passOdds', 'dpOdds', 'come', 'dc');
  return k;
}
console.log('1. every bet × 36 dice pairs × 7 point states vs oracle');
const AMOUNTS = [10, 25, 30, 35, 60, 125];
for (const working of [false, true]) for (const P of PSTATES) for (const key of allKeys(P)) for (const A of AMOUNTS) for (const [a, b] of DICE) {
  const res = resolveRoll({ [key]: A }, P, a, b, { working }), r = res.results[0], o = oracle(key, A, P, a, b, working);
  const tag = `${key} A=${A} P=${P} ${a}+${b} w=${working}`;
  ok(r.kind === o.kind, `${tag}: kind ${r.kind} != ${o.kind}`);
  if (o.kind === 'win') { ok(r.win === o.win, `${tag}: win ${r.win} != ${o.win}`); ok(!!r.keep === !!o.keep, `${tag}: keep`); }
  if (o.kind === 'travel') ok(r.to === o.to && res.bets[o.to] === A, `${tag}: travel`);
  // money for a single bet
  const expStaked = o.kind === 'lose' || o.kind === 'push' || (o.kind === 'win' && !o.keep) ? A : 0;
  const expRet = o.kind === 'push' ? A : o.kind === 'win' ? (o.keep ? o.win : A + o.win) : 0;
  ok(res.staked === expStaked && res.returned === expRet, `${tag}: money ${res.staked}/${res.returned} vs ${expStaked}/${expRet}`);
  // the bet is still on the layout exactly when it should be
  const stays = o.kind === 'none' || o.kind === 'off' || o.kind === 'bar' || (o.kind === 'win' && o.keep);
  ok(stays ? res.bets[key] === A : !(key in res.bets) || o.kind === 'travel', `${tag}: stays=${stays}`);
  // point transitions
  const t = a + b, np = P === null ? (POINTS.includes(t) ? t : null) : (t === P || t === 7 ? null : P);
  ok(res.nextPoint === np, `${tag}: next point`);
}
// interactions: waiting come bet lands on a number that already has a come bet
{
  const r = resolveRoll({ come: 10, come6: 25, comeOdds6: 50, dc: 10, dc6: 20, dcOdds6: 30 }, 8, 4, 2);
  ok(r.bets.come6 === 10 && !r.bets.comeOdds6, 'come off-and-on: new come bet on 6, old one paid');
  ok(r.bets.dc6 === 10 && !r.bets.dcOdds6, 'dont come: old dc6 loses, new one goes behind the 6');
  ok(r.staked === 25 + 50 + 20 + 30 && r.returned === 25 + 25 + 50 + 60, 'off-and-on money ' + r.staked + '/' + r.returned);
  const s = resolveRoll({ pass: 10, passOdds: 30, come: 10, place6: 30, place8: 30, hard6: 10, field: 10 }, 6, 3, 3);
  ok(s.pointMade && s.returned === 10 + 30 + 36 + 35 + 90, 'point made hard 6 returns ' + s.returned);
  ok(s.bets.pass === 10 && s.bets.come6 === 10 && s.bets.place6 === 30 && s.bets.hard6 === 10 && !s.bets.passOdds && !s.bets.field, 'point made: what stays up');
  const so = resolveRoll({ pass: 10, passOdds: 30, dp: 10, dpOdds: 60, come5: 10, comeOdds5: 40, dc9: 10, dcOdds9: 60, place6: 30 }, 6, 5, 2);
  ok(so.sevenOut && so.bets.dp === 10 && Object.keys(so.bets).length === 1, 'seven out clears everything but the don’t pass flat');
  // dp +10 stays up; lay 60 on the 6 wins 50; dc9 wins 10; lay 60 on the 9 wins 40
  ok(so.returned === 10 + (60 + 50) + (10 + 10) + (60 + 40) && so.staked === 10 + 30 + 60 + 10 + 40 + 10 + 60 + 30, `seven out money ${so.staked}/${so.returned}`);
  const co = resolveRoll({ pass: 10, come5: 10, comeOdds5: 40, place6: 30, hard8: 10 }, null, 4, 3);
  ok(co.natural && co.bets.pass === 10 && co.bets.place6 === 30 && co.bets.hard8 === 10 && !co.bets.come5 && !co.bets.comeOdds5, 'come-out 7: odds returned, place & hard off');
  ok(co.returned === 10 + 40 && co.staked === 10 + 40, 'come-out 7 money: pass +10, come5 lost, odds back');
}
// limits & contract rules
ok(!betLimit('pass', 6).ok && betLimit('pass', null).ok, 'pass only on come-out');
ok(!betLimit('come', null).ok && betLimit('come', 6).ok, 'come only with a point');
ok(betLimit('passOdds', 4, { pass: 10 }).max === 30 && betLimit('passOdds', 5, { pass: 10 }).max === 40 && betLimit('passOdds', 6, { pass: 10 }).max === 50, '3-4-5x');
ok(betLimit('dpOdds', 4, { dp: 10 }).max === 60 && betLimit('dcOdds8', 6, { dc8: 25 }).max === 150, 'lay 6x');
ok(!betLimit('passOdds', 6, {}).ok && !betLimit('come6', 6, {}).ok, 'no odds without a line bet, no direct come6');
ok(!removable('pass', 6) && removable('pass', null) && !removable('come6', null) && !removable('dc8', 5) && removable('passOdds', 6) && removable('place6', 6) && removable('come', 6), 'contract bets');
for (const P of POINTS) for (const flat of [10, 20, 25, 35, 100]) {
  for (const [k, max, ratio] of [['passOdds', ODDS_X[P] * flat, TRUE_ODDS[P]], ['dpOdds', LAY_X * flat, LAY_ODDS[P]]]) {
    const a = niceOdds(k, max, P);
    ok(a > 0 && a <= max && a % 5 === 0 && a !== 15 && (a * ratio[0]) % ratio[1] === 0, `niceOdds ${k} P=${P} flat=${flat} -> ${a}`);
  }
}
ok(stickCall(resolveRoll({}, 6, 1, 6)).title === 'Seven out' && stickCall(resolveRoll({}, null, 5, 6)).title === 'Yo!' && stickCall(resolveRoll({}, null, 2, 4)).status === 'Point is 6', 'stickman calls');
ok(stickCall(resolveRoll({}, null, 4, 4)).sub === 'Hard eight' && stickCall(resolveRoll({}, null, 5, 3)).sub === 'Easy eight', 'hard/easy');
console.log(`   ${checks} checks, ${fails} failures`);

// ── 2. exact EV through resolveRoll (Markov chain on (point, bet key)) ────
console.log('2. exact expected value per decision (value iteration over resolveRoll)');
function exactEV(key, A, P0, extra = {}) {
  const V = new Map(), id = (p, k) => p + '|' + k;
  let states = [[P0, key]], seen = new Set([id(P0, key)]);
  for (let i = 0; i < states.length; i++) {
    const [p, k] = states[i];
    for (const [a, b] of DICE) {
      const r = resolveRoll({ ...extra, [k]: A }, p, a, b), x = r.results.find(q => q.key === k);
      if (['none', 'off', 'travel'].includes(x.kind)) { const nk = x.kind === 'travel' ? x.to : k, s = id(r.nextPoint, nk); if (!seen.has(s)) { seen.add(s); states.push([r.nextPoint, nk]); } }
    }
  }
  for (let it = 0; it < 4000; it++) {
    let delta = 0;
    for (const [p, k] of states) {
      let v = 0;
      for (const [a, b] of DICE) {
        const r = resolveRoll({ ...extra, [k]: A }, p, a, b), x = r.results.find(q => q.key === k);
        if (x.kind === 'win') v += x.win; else if (x.kind === 'lose') v -= A; else if (x.kind === 'push' || x.kind === 'bar') v += 0;   // a barred 12 is a tie
        else v += V.get(id(r.nextPoint, x.kind === 'travel' ? x.to : k)) || 0;
      }
      v /= 36; delta = Math.max(delta, Math.abs(v - (V.get(id(p, k)) || 0))); V.set(id(p, k), v);
    }
    if (delta < 1e-13) break;
  }
  return V.get(id(P0, key)) / A;
}
const EXPECT = [
  ['pass', 10, null, -7 / 495], ['dp', 10, null, -3 / 220], ['come', 10, 6, -7 / 495], ['dc', 10, 6, -3 / 220],
  ['place6', 30, 6, -1 / 66], ['place8', 30, null, -1 / 66], ['place5', 10, 6, -1 / 25], ['place9', 10, 6, -1 / 25], ['place4', 10, 6, -1 / 15], ['place10', 10, 6, -1 / 15],
  ['field', 10, null, -1 / 36], ['hard6', 10, 6, -1 / 11], ['hard8', 10, 6, -1 / 11], ['hard4', 10, 6, -1 / 9], ['hard10', 10, 6, -1 / 9],
  ['anySeven', 10, null, -1 / 6], ['anyCraps', 10, null, -1 / 9], ['yo', 10, null, -1 / 9], ['aces', 10, null, -5 / 36], ['boxcars', 10, null, -5 / 36], ['aceDeuce', 10, null, -1 / 9]
];
for (const [k, A, P, exp] of EXPECT) {
  const ev = exactEV(k, A, P);
  ok(Math.abs(ev - exp) < 1e-9, `EV ${k}: ${ev} != ${exp}`);
  console.log(`   ${k.padEnd(9)} edge ${(-ev * 100).toFixed(3)}%`);
}
for (const P of POINTS) {
  const o = exactEV('passOdds', { 4: 10, 5: 20, 6: 50, 8: 50, 9: 20, 10: 30 }[P], P, { pass: 10 });
  const l = exactEV('dpOdds', 60, P, { dp: 10 });
  ok(Math.abs(o) < 1e-9 && Math.abs(l) < 1e-9, `odds on ${P} are free: ${o} ${l}`);
}
console.log('   pass/come odds & lay odds on every number: edge 0.000%');

// ── 3. Monte Carlo with the game's crypto RNG ─────────────────────────────
console.log('3. Monte Carlo (crypto RNG, the same rand() the table uses)');
// the table draws each die with rand(6) (crypto.getRandomValues + rejection sampling);
// for speed the simulation batches the same crypto source the same unbiased way
const BUF = new Uint8Array(65536); let bi = BUF.length;
const die = () => { for (;;) { if (bi >= BUF.length) { crypto.getRandomValues(BUF); bi = 0; } const v = BUF[bi++]; if (v < 252) return v % 6 + 1; } };
const roll = () => [die(), die()];
{ // sanity: rand() itself is uniform
  const c = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < 60000; i++) c[rand(6)]++;
  ok(c.every(x => Math.abs(x - 10000) < 450), 'rand(6) uniform ' + c.join(','));
}
function monte(key, A, decisions) {
  let point = null, bets = { pass: 10, [key]: A }, profit = 0, n = 0;
  while (n < decisions) {
    if (point !== null && (key === 'come' || key === 'dc') && !Object.keys(bets).some(k => k.startsWith(key))) bets[key] = A;
    const [a, b] = roll(), r = resolveRoll(bets, point, a, b);
    for (const x of r.results) {
      if (x.key === 'pass' && key !== 'pass') continue;
      if (x.kind === 'win') { profit += x.win; n++; } else if (x.kind === 'lose') { profit -= A; n++; } else if (x.kind === 'push' || x.kind === 'bar') n++;
    }
    bets = { ...r.bets, pass: 10 }; point = r.nextPoint;
    if (!(key in bets) && key !== 'come' && key !== 'dc') bets[key] = A;
  }
  return { edge: -profit / (A * n) * 100, n };
}
const MC = [['pass', 10, 1.414], ['dp', 10, 1.364], ['place6', 30, 1.515], ['place5', 10, 4.0], ['place4', 10, 6.667], ['field', 10, 2.778], ['hard8', 10, 9.091], ['anySeven', 10, 16.667], ['anyCraps', 10, 11.111], ['yo', 10, 11.111], ['come', 10, 1.414]];
const t0 = Date.now();
for (const [k, A, exp] of MC) {
  const N = ['pass', 'dp', 'place6', 'field'].includes(k) ? 2e6 : k === 'yo' || k === 'anySeven' || k === 'anyCraps' ? 1.2e6 : 6e5;
  const { edge, n } = monte(k, A, N);
  const sd = { pass: 1, dp: 1, come: 1, place6: 1.08, place5: 1.18, place4: 1.37, field: 1.04, hard8: 2.9, anySeven: 1.86, anyCraps: 2.5, yo: 3.9 }[k] / Math.sqrt(n) * 100;
  ok(Math.abs(edge - exp) < 4 * sd, `MC ${k}: ${edge.toFixed(3)}% vs ${exp}% (±${sd.toFixed(3)})`);
  console.log(`   ${k.padEnd(9)} ${edge.toFixed(3)}%  (expected ${exp}%, ${n.toLocaleString()} decisions, 1σ ${sd.toFixed(3)}%)`);
}
console.log(`   ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ── 4. random play through the ledger and the real Bank ───────────────────
console.log('4. random play: bank.balance + inPlay must always balance');
{
  const bank = new Bank(new Events());
  const start = bank.balance + bank.s.inPlay; let net = 0;
  const L = new CrapsLedger(bank);
  const CHIPS = [10, 25, 100, 500];
  const keysFor = () => [...allKeys(L.point ?? 6), 'passOdds', 'dpOdds', 'come', 'dc'];
  let rolls = 0, placed = 0, refused = 0, removed = 0, settles = 0;
  const statsBefore = bank.s.stats.hands;
  for (let step = 0; step < 60000; step++) {
    const r = Math.random();
    if (r < .55) { const k = keysFor()[Math.floor(Math.random() * keysFor().length)], v = CHIPS[Math.floor(Math.random() * 4)]; const x = L.place(k, v); x.ok ? placed++ : refused++; }
    else if (r < .6) { const ks = Object.keys(L.bets); if (ks.length) removed += L.remove(ks[Math.floor(Math.random() * ks.length)]) ? 1 : 0; }
    else if (r < .61) L.clearRemovable();
    else if (r < .62 && L.point != null) { for (const k of ['passOdds', 'dpOdds', ...POINTS.flatMap(n => ['comeOdds' + n, 'dcOdds' + n])]) { const lim = betLimit(k, L.point, L.bets); if (lim.ok) { const a = niceOdds(k, lim.max, L.point) - L.amount(k); if (a > 0) L.place(k, a); } } }
    else {
      const [a, b] = roll(), res = L.roll(a, b), before = bank.balance;
      const n = L.commit(res); net += n; rolls++; if (res.staked || res.returned) settles++;
      ok(bank.balance - before === res.returned, 'balance moves by exactly `returned`');
      ok(L.commit(res) === n && bank.balance - before === res.returned, 'commit is idempotent');
    }
    ok(bank.s.inPlay === L.total(), `step ${step}: inPlay ${bank.s.inPlay} != layout ${L.total()}`);
    ok(bank.balance + bank.s.inPlay === start + net, `step ${step}: balance+inPlay ${bank.balance + bank.s.inPlay} != ${start + net}`);
    ok(bank.balance >= 0 && Object.values(L.bets).every(v => Number.isInteger(v) && v > 0), 'no negative balance / bad bets');
    for (const k in L.bets) {
      const base = k === 'passOdds' ? (L.point != null && L.bets.pass) : k === 'dpOdds' ? (L.point != null && L.bets.dp) : k.startsWith('comeOdds') ? L.bets['come' + k.slice(8)] : k.startsWith('dcOdds') ? L.bets['dc' + k.slice(6)] : true;
      ok(!!base, `orphan odds ${k}`);
      if (k === 'come' || k === 'dc') ok(L.point != null, 'waiting come bet without a point');
    }
    if (bank.balance < 600 && Math.random() < .2) { bank.credit(5000, 'test'); net += 5000; }
  }
  ok(bank.s.stats.hands - statsBefore === settles, 'settle called once per deciding roll');
  // leave the table: every removable bet comes back; contract bets stay staked
  L.clearRemovable();
  ok(bank.s.inPlay === L.total() && Object.keys(L.bets).every(k => !removable(k, L.point)), 'clear leaves only contract bets');
  console.log(`   ${rolls} rolls, ${placed} bets placed, ${refused} refused, ${removed} removed, net ${net >= 0 ? '+' : ''}${net}`);
}
console.log(fails ? `\n${fails} FAILURES out of ${checks} checks` : `\nALL ${checks} CHECKS PASSED`);
process.exit(fails ? 1 : 0);
