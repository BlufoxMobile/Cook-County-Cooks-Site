// Node test for the Hold'em rules (never loaded by the browser):
//   node js/games/holdem-test.mjs [randomHands=20000] [botHands=600]
// Hand-crafted evaluations and showdowns, betting-rule scenarios, side pots,
// then thousands of random-action and bot-policy hands checking chip
// conservation, legality, refunds and every pot award against an independent
// (fractional) side-pot calculation.
import { TablePoker, tableBotAction, PLAYERS, LEVELS, best, bestHand, compare, five, describe, shortName, holeName, draws, HAND_NAMES } from '../rules/holdem.mjs';
import { rand } from '../core/rng.mjs';

let checks = 0, fails = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.error('FAIL:', msg); if (fails > 25) process.exit(1); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n   got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`);
const S = { s: 0, h: 1, d: 2, c: 3 }, R = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const c = t => ({ r: R[t[0]] || +t[0], s: S[t[1]] });           // 'Ah' -> {r:14,s:1}
const cs = s => s.split(' ').filter(Boolean).map(c);

// ── 1. hand evaluation ────────────────────────────────────────────────────
const cat = s => best(cs(s))[0];
eq(cat('Ah Kh Qh Jh Th 2c 3d'), 8, 'royal flush');
eq(best(cs('Ah 2h 3h 4h 5h Kc Kd')), [8, 5], 'steel wheel is a 5-high straight flush');
eq(cat('9c 9d 9h 9s 2c 3d 4h'), 7, 'quads');
eq(best(cs('Kc Kd Kh 5s 5c 2d 3h')), [6, 13, 5], 'kings full of fives');
eq(best(cs('Kc Kd Kh 5s 5c 5d 3h')), [6, 13, 5], 'two trips make the higher boat');
eq(cat('Ah 9h 7h 4h 2h Kc Kd'), 5, 'flush beats pair');
eq(best(cs('As 2d 3c 4h 5s Kc Qd')), [4, 5], 'wheel');
eq(best(cs('Ts Jd Qc Kh As 2c 3d')), [4, 14], 'broadway');
eq(best(cs('Qs Kd Ac 2h 3s 8c 9d'))[0], 0, 'no wrap-around straight');
eq(best(cs('7s 7d 7c Ah Ks 2c 3d')), [3, 7, 14, 13], 'trips with kickers');
eq(best(cs('Js Jd 4c 4h As 4d 2c')), [6, 4, 11], 'board trips + pocket pair = full house');
eq(best(cs('Js Jd 4c 4h As 2d 3c')).slice(0, 4), [2, 11, 4, 14], 'two pair, ace kicker');
eq(best(cs('Js Jd 4c 4h 9s 9d 2c')), [2, 11, 9, 4], 'three pair plays the top two with best kicker');
ok(compare(best(cs('As Ad Kc 7h 3s 2d 9c')), best(cs('Ah Ac Qc 7d 3h 2s 9s'))) > 0, 'pair of aces: king kicker wins');
ok(compare(best(cs('Ah 9h 7h 4h 2h Kc Kd')), best(cs('Kh Qh 9h 8h 6h Ac Ad'))) > 0, 'ace-high flush beats king-high flush');
ok(compare(five(cs('As Ks Qs Js 9s')), five(cs('Ad Kd Qd Jd 9d'))) === 0, 'suits never break ties');
for (const [hand, want] of [['Kc Kd Kh 5s 5c', 'Full house, kings over fives'], ['As Ah 9c 9d 2h', 'Two pair, aces and nines'], ['6s 6h 6d Ah Kc', 'Three of a kind, sixes'],
  ['Ah Kh Qh Jh Th', 'Royal flush'], ['5h 4h 3h 2h Ah', 'Straight flush, five high'], ['As 2d 3c 4h 5s', 'Straight, five high'], ['Qs Qh 9c 4d 2h', 'Pair of queens'], ['Ah Jd 9c 4d 2h', 'High card, ace'], ['Ah 9h 7h 4h 2h', 'Flush, ace high']])
  eq(describe(five(cs(hand))), want, 'describe ' + hand);
eq(shortName(five(cs('Kc Kd Kh 5s 5c'))), 'Kings full', 'short name');
eq(holeName(cs('Kd Ks')), 'Pocket kings', 'pocket name'); eq(holeName(cs('Kh Ah')), 'Ace–king suited', 'suited name'); eq(holeName(cs('7c 9d')), 'Nine–seven offsuit', 'offsuit name');
eq(draws(cs('Ah 5h'), cs('Kh 9h 2c')), ['flush draw'], 'nut flush draw');
eq(draws(cs('8c 9d'), cs('Th Jc 2s')), ['open-ended straight draw'], 'OESD');
eq(draws(cs('8c 9d'), cs('Jh Qc 2s')), ['gutshot'], 'gutshot');
eq(draws(cs('2c 3d'), cs('Th Jc Qs')), [], 'board-only straight draw is not ours');
{ const h = bestHand(cs('Kc Kd 2h 3s Kh 5s 5c')); eq(h.rank, [6, 13, 5], 'bestHand rank'); eq(h.cards.map(x => x.r).sort((a, b) => a - b), [5, 5, 13, 13, 13], 'bestHand picks the five'); }
// bestHand == best on random 7-card hands
for (let t = 0; t < 3000; t++) {
  const d = []; for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = rand(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  const seven = d.slice(0, 7), a = best(seven), b = bestHand(seven);
  if (JSON.stringify(a) !== JSON.stringify(b.rank) || JSON.stringify(five(b.cards)) !== JSON.stringify(a)) { ok(false, 'bestHand disagrees with best ' + JSON.stringify(seven)); break; }
}
checks++;

// ── 2. rigged tables ──────────────────────────────────────────────────────
// holes[i] = 'Ah Kd' for seat i; board = 'Qs Jd Tc 2h 3s' (5 cards). Builds the
// shoe TablePoker pops from: two passes of hole cards from the button's left,
// then burn + flop, burn + turn, burn + river.
function rig(holes, board, button) {
  const n = holes.length, order = [], H = holes.map(cs), B = cs(board), filler = { r: 2, s: 3, burn: true };
  for (let pass = 0; pass < 2; pass++) for (let j = 1; j <= n; j++) order.push(H[(button + j) % n][pass]);
  order.push(filler, B[0], B[1], B[2], filler, B[3], filler, B[4]);
  return order.reverse();
}
function play(p, script) {           // script: list of [type, amount] for whoever is to act
  for (const [type, amount] of script) { const who = p.actor; ok(p.act(type, amount), `scripted ${type} ${amount ?? ''} by seat ${who} (street ${p.street})`); }
  let guard = 0; while (p.phase === 'runout' && guard++ < 5) p.runoutStep();
}
{ // showdown: best hand wins, board plays = split, kicker decides
  const p = new TablePoker([1000, 1000, 1000], 20, 0, rig(['Ah Kh', 'Qc Qd', '7s 2d'], 'Qh Jh Th 3c 4d', 0));
  play(p, [['call'], ['call'], ['check'], ...Array(9).fill(['check'])]);
  eq(p.phase, 'settled', 'three-way checked down'); eq(p.winners, [0], 'royal flush wins'); eq(p.stacks, [1040, 980, 980], 'royal collects 60');
  eq(describe(p.ranks[0]), 'Royal flush', 'royal named'); eq(p.ranks[1][0], 3, 'queens make a set');
}
{ const p = new TablePoker([1000, 1000], 20, 0, rig(['2c 3d', '4h 5s'], 'Ah Kh Qh Jh Th', 0));
  play(p, [['call'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']]);
  eq(p.winners, [1, 0], 'board plays: split (odd-chip order starts left of the button)'); eq(p.stacks, [1000, 1000], 'split pot returns stakes'); }
{ const p = new TablePoker([1000, 1000, 1000], 20, 2, rig(['As 9c', 'Ad 8c', 'Kd Kc'], 'Ah 7d 4s 3c 2h', 2));
  // heads-up in position check: button=2, sb=0, bb=1. Pre-flop: button acts first.
  play(p, [['fold'], ['call'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']]);
  eq(p.winners, [0], 'nine kicker beats eight'); eq(p.stacks[0] - 1000, 20, 'kicker wins the bb'); }
{ // odd chip: 3 players, pot 45 split two ways -> odd chip to first clockwise from button
  const p = new TablePoker([15, 1000, 1000], 20, 0, rig(['As Kd', 'Ah Kc', '7c 2d'], 'Qs Js Th 3c 4d', 0));
  // sb = seat1 (10), bb = seat2 (20). Seat 0 all-in 15 (call short), seat 1 calls to 20, seat 2 checks.
  play(p, [['call'], ['call'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']]);
  eq(p.pots.map(x => x.amount), [45, 10], 'main pot 45 and side pot 10');
  eq(p.pots[0].winners, [1, 0], 'split main pot, odd chip seat 1 (left of button)');
  eq(p.awards, [22, 33, 0], 'awards with odd chip'); eq(p.stacks.reduce((a, b) => a + b), 2015, 'conserved');
}

// ── 3. betting rules ─────────────────────────────────────────────────────
{ // short all-in does NOT reopen the betting for a player who already acted
  const p = new TablePoker([1000, 150, 1000], 20, 0);   // button 0, sb 1, bb 2; seat 0 acts first
  ok(p.act('raise', 100), 'open to 100');               // lastRaise 80
  ok(p.act('raise', 150), 'sb short all-in to 150');    // +50 < 80: incomplete
  ok(p.act('call'), 'bb calls 150');
  const l = p.legal(); eq([p.actor, l.canRaise, l.call], [0, false, 50], 'opener may only call or fold');
  ok(!p.act('raise', 400), 'raise refused'); ok(p.act('call'), 'call'); eq(p.street, 1, 'flop dealt');
}
{ // cumulative short all-ins that add up to a full raise DO reopen
  const p = new TablePoker([190, 1000, 1000, 150, 1000], 20, 4);   // button 4, sb 0, bb 1, first to act 2
  ok(p.act('raise', 100), 'utg opens 100');                  // lastRaise 80
  ok(p.act('raise', 150), 'seat 3 short all-in 150');        // +50
  ok(p.act('call'), 'button calls 150');
  ok(p.act('raise', 190), 'sb short all-in 190');            // +40, min was 230
  ok(p.act('fold'), 'bb folds');
  let l = p.legal(); eq([p.actor, l.call, l.canRaise, l.minRaise], [2, 90, true, 270], '+90 in total re-opens the opener');
  ok(p.act('call'), 'opener just calls');
  l = p.legal(); eq([p.actor, l.call, l.canRaise], [4, 40, false], 'button saw only +40: call or fold');
  ok(!p.act('raise', 500), 'button may not raise'); ok(p.act('call'), 'button calls'); eq(p.street, 1, 'flop');
}
{ const p = new TablePoker([1000, 1000, 1000, 1000], 20, 0);   // button 0, sb 1, bb 2, UTG 3
  ok(p.act('raise', 100), 'utg opens 100');
  ok(p.act('fold'), 'button folds');
  ok(!p.act('raise', 150), 'sb cannot min-raise below 180');
  ok(p.act('raise', 180), 'sb raises to 180');
  ok(p.act('call'), 'bb calls'); eq(p.legal().reopened, true, 'utg reopened by full raise'); }
{ const p = new TablePoker([1000, 1000, 1000], 20, 0);
  play(p, [['call'], ['call']]);   // button limps, sb completes
  eq([p.actor, p.legal().check, p.legal().canRaise], [2, true, true], 'big blind option to check or raise'); }
{ const p = new TablePoker([1000, 1000], 20, 0);   // heads-up: button is small blind and acts first pre-flop
  eq([p.sb, p.big, p.actor], [0, 1, 0], 'heads-up blinds'); play(p, [['call'], ['check']]); eq(p.actor, 1, 'bb acts first after the flop'); }
{ const p = new TablePoker([1000, 1000, 1000], 20, 0);
  ok(!p.act('check'), 'cannot check facing a bet'); ok(!p.act('raise', 39), 'raise below min'); ok(!p.act('raise', 20.5), 'fractional raise');
  ok(!p.act('raise', 5000), 'raise above stack'); ok(!p.act('dance'), 'unknown action'); ok(p.legal(1) === null, 'not your turn'); }
{ // uncalled bet returned
  const p = new TablePoker([1000, 1000, 1000], 20, 0);
  play(p, [['raise', 500], ['fold'], ['fold']]);
  eq(p.stacks, [1030, 990, 980], 'raiser gets uncalled 480 back and wins blinds'); }
{ // all-in for less than the big blind in the blind
  const p = new TablePoker([1000, 1000, 7], 20, 0, rig(['Ah Ad', 'Kh Kd', '2c 7d'], '3s 8h 9c Js 4h', 0));
  eq([p.bets[2], p.stacks[2], p.current], [7, 0, 20], 'short big blind, others still owe 20');
  play(p, [['call'], ['call'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']]);
  eq(p.pots.map(x => x.amount), [21, 26], 'main 21 (3x7), side 26'); eq(p.stacks, [1027, 980, 0], 'aces scoop both'); }

// ── 4. side pots ─────────────────────────────────────────────────────────
{ // four all-ins of different sizes, worst hand has the most chips
  const holes = ['Ah Ad', 'Kh Kd', 'Qh Qd', 'Jh Jd', '7c 2d', '8c 3d'];
  const p = new TablePoker([100, 300, 600, 1000, 2000, 2000], 20, 5, rig(holes, '2s 5c 9h Tc 4s', 5));
  // button 5, sb 0, bb 1, first to act 2. Everyone shoves / calls.
  play(p, [['raise', 600], ['raise', 1000], ['call'], ['fold'], ['call'], ['call']]);
  eq(p.phase, 'settled', 'all-in runout settles');
  eq(p.pots.map(x => [x.amount, x.winners]), [[500, [0]], [800, [1]], [900, [2]], [800, [3]]], 'main pot and three side pots');
  eq(p.stacks, [500, 800, 900, 800, 1000, 2000], 'each all-in wins only what they covered');
}
{ // side pot to a folder-free middle stack while the short stack wins main
  const holes = ['7h 7d', 'Ah Kd', 'Qs Qc'];
  const p = new TablePoker([200, 1000, 1000], 20, 2, rig(holes, '7s 2c 9h Ac 3d', 2));   // button 2: sb 0, bb 1, first to act 2
  play(p, [['raise', 1000], ['call'], ['call']]);
  eq(p.pots.map(x => x.amount), [600, 1600], 'main 600, side 1600');
  eq(p.pots.map(x => x.winners), [[0], [1]], 'set wins main, AK wins side over QQ'); eq(p.stacks, [600, 1600, 0], 'stacks');
}
{ // dead money from a folded raiser stays in the pot it was bet into
  const p = new TablePoker([1000, 300, 1000, 1000], 20, 0, rig(['2c 7d', 'As Ah', 'Kc Kd', '3h 8s'], '4c 9d Jh Qs 5h', 0));
  // button 0, sb 1, bb 2, UTG 3: UTG opens 100, button calls, sb shoves 300, bb re-raises 700, both fold
  play(p, [['raise', 100], ['call'], ['raise', 300], ['raise', 700], ['fold'], ['fold']]);
  eq(p.pots.map(x => [x.amount, x.eligible, x.winners]), [[800, [1, 2], [1]]], 'dead money of the folders stays in one pot; bb’s extra 400 returned');
  eq(p.stacks, [900, 800, 700, 900], 'stacks after dead-money pot');
}

// ── 5. random stress ─────────────────────────────────────────────────────
function snapshot(p) { return JSON.stringify([p.stacks, p.bets, p.total, p.pot, p.actor, p.street, p.current, p.lastRaise, p.folded, [...p.pending], p.board.length, p.phase]); }
function fairAwards(p) {       // independent layered side-pot calculation with exact fractions
  const n = p.n, out = new Array(n).fill(0), levels = [...new Set(p.total)].filter(x => x > 0).sort((a, b) => a - b);
  let prev = 0;
  for (const lv of levels) {
    const slice = p.total.reduce((a, t) => a + Math.max(0, Math.min(t, lv) - prev), 0);
    let el = [...Array(n).keys()].filter(i => !p.folded[i] && p.total[i] >= lv);
    if (!el.length) el = [...Array(n).keys()].filter(i => !p.folded[i]);
    if (p.reason === 'Showdown' && el.length > 1) { const topR = el.map(i => p.ranks[i]).reduce((a, b) => compare(a, b) >= 0 ? a : b); el = el.filter(i => compare(p.ranks[i], topR) === 0); }
    for (const i of el) out[i] += slice / el.length;
    prev = lv;
  }
  return out;
}
function randomAction(p) {
  const l = p.legal(), x = rand(100);
  if (!l.check && x < 18) return { type: 'fold' };
  if (l.check && x < 3) return { type: 'fold' };
  if (l.canRaise && x > 68) {
    const lo = l.shortRaise ? l.maxRaise : l.minRaise, hi = l.maxRaise, y = rand(10);
    return { type: 'raise', amount: y < 3 ? lo : y < 5 ? hi : lo + rand(hi - lo + 1) };
  }
  return { type: l.check ? 'check' : 'call' };
}
function illegalProbe(p) {
  const l = p.legal(), before = snapshot(p), tries = [];
  if (!l.check) tries.push(['check']); else tries.push(['call']);
  tries.push(['raise', p.current], ['raise', l.maxRaise + 1], ['raise', 1.5], ['bogus']);
  if (!l.canRaise) tries.push(['raise', l.maxRaise]);
  else if (!l.shortRaise && l.minRaise - 1 > p.current && l.minRaise - 1 < l.maxRaise) tries.push(['raise', l.minRaise - 1]);
  for (const [t, a] of tries) { const r = p.act(t, a); if (r) { ok(false, `illegal ${t} ${a} accepted ${JSON.stringify(l)}`); return false; } }
  ok(snapshot(p) === before, 'illegal actions leave state untouched');
  return true;
}
function runHand(stacks, bb, button, chooser) {
  const p = new TablePoker(stacks, bb, button), sum = stacks.reduce((a, b) => a + b, 0);
  let steps = 0;
  while (p.phase !== 'settled') {
    if (++steps > 400) { ok(false, 'hand did not terminate'); break; }
    if (p.chipsInPlay !== sum) { ok(false, `chips not conserved mid-hand ${p.chipsInPlay} vs ${sum}`); break; }
    if (p.stacks.some(s => s < 0)) { ok(false, 'negative stack'); break; }
    if (p.phase === 'runout') { p.runoutStep(); continue; }
    ok(p.phase === 'play' && p.actor >= 0 && p.canAct(p.actor), 'actor can act');
    for (let i = 0; i < p.n; i++) if (i !== p.actor && p.legal(i) !== null) ok(false, 'legal() for a non-actor');
    if (rand(8) === 0) illegalProbe(p);
    const m = chooser(p);
    if (!p.act(m.type, m.amount)) { ok(false, `legal-looking action refused ${JSON.stringify(m)} ${JSON.stringify(p.legal())}`); break; }
  }
  // end-of-hand invariants
  const after = p.stacks.reduce((a, b) => a + b, 0);
  if (after !== sum) ok(false, `chips not conserved: ${after} vs ${sum}`); else checks++;
  const potSum = p.pots.reduce((a, x) => a + x.amount, 0), totSum = p.total.reduce((a, b) => a + b, 0);
  if (potSum !== totSum) ok(false, `pots ${potSum} != contributions ${totSum}`); else checks++;
  const sorted = [...p.total].sort((a, b) => b - a);
  if (sorted[0] !== sorted[1]) ok(false, `uncalled chips not returned: totals ${p.total}`); else checks++;
  for (const pot of p.pots) if (!pot.winners.every(w => pot.eligible.includes(w)) || pot.shares.reduce((a, b) => a + b, 0) !== pot.amount) ok(false, 'pot winner not eligible / shares');
  const fair = fairAwards(p);
  for (let i = 0; i < p.n; i++) if (Math.abs(fair[i] - p.awards[i]) > p.pots.length) { ok(false, `award mismatch seat ${i}: ${p.awards} vs fair ${fair.map(x => x.toFixed(1))} totals ${p.total} folded ${p.folded}`); break; }
  checks++;
  if (p.reason === 'Showdown') { ok(p.board.length === 5, 'showdown with five board cards'); }
  if (p.reason === 'Fold') ok(p.alive().length === 1 && p.winners[0] === p.alive()[0], 'fold win goes to last player');
  eq(p.net, p.stacks[0] - stacks[0], 'net for seat 0');
  return p;
}
const RANDOM = +(process.argv[2] ?? 20000), BOTS = +(process.argv[3] ?? 600);
let t0 = Date.now(), sidePotHands = 0, showdowns = 0, splits = 0;
for (let h = 0; h < RANDOM; h++) {
  const n = 2 + rand(5), bb = [2, 20, 50, 200, 1000][rand(5)];
  const stacks = Array.from({ length: n }, () => rand(4) === 0 ? 1 + rand(bb * 3) : bb * (5 + rand(200)));
  const p = runHand(stacks, bb, rand(n), randomAction);
  if (p.pots.length > 1) sidePotHands++; if (p.reason === 'Showdown') showdowns++; if (p.pots.some(x => x.winners.length > 1)) splits++;
}
console.log(`random hands: ${RANDOM} in ${Date.now() - t0} ms · ${sidePotHands} with side pots · ${showdowns} showdowns · ${splits} split pots`);

// bot policy: always legal, table keeps its chips over a long session (bots rebuy)
t0 = Date.now();
let stacks = [5000, 5500, 4250, 6000, 3500, 5000], button = 0, rebuys = 0, total = stacks.reduce((a, b) => a + b, 0);
const heroStyle = PLAYERS[3];
for (let h = 0; h < BOTS; h++) {
  const level = h < BOTS * .8 ? rand(2) : 2 + rand(3);
  stacks = stacks.map(s => { if (s < 50) { rebuys++; total += 5000 - s; return 5000; } return s; });
  const p = runHand(stacks, 50, button, q => {
    const m = tableBotAction(q, level, q.actor === 0 ? { style: heroStyle } : {});
    if (!m) ok(false, 'bot returned no action');
    return m;
  });
  stacks = p.stacks; button = (button + 1) % 6;
  ok(stacks.reduce((a, b) => a + b, 0) === total, 'session chips conserved');
}
ok(tableBotAction(new TablePoker([1000, 1000], 20, 0), 1) === null, 'bots never act for the human seat');
console.log(`bot hands: ${BOTS} in ${Date.now() - t0} ms · ${rebuys} rebuys`);
console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
