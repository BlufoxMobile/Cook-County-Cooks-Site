// VIDEO POKER — Jacks or Better, 9/6 full pay, 1–5 coins, fresh 52-card deck each hand.
// Pure functions shared by the machine and the Node proof:
//   node js/rules/videopoker.mjs   evaluator tests + exact optimal-play return over all 2,598,960 deals
import { rankChar, SUIT_CHARS } from '../core/rng.mjs';

export const HANDS = ['Nothing', 'Jacks or Better', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];
export const PAY = [0, 1, 2, 3, 4, 6, 9, 25, 50, 250];         // per coin
export const MAX_COINS = 5;
export const COIN_VALUES = [10, 25, 100, 500];
export function payout(rank, coins) { return rank === 9 && coins === MAX_COINS ? 4000 : PAY[rank] * coins; }
// the paytable a player sees: rows best-first, columns 1..5 coins
export const PAYTABLE = HANDS.map((name, rank) => ({ rank, name, pays: [1, 2, 3, 4, 5].map(c => payout(rank, c)) })).filter(r => r.rank > 0).reverse();

// ── card indices: i = s*13 + (r-2) ──
export const idx = c => c.s * 13 + (c.r - 2);
export const cardOf = i => ({ r: (i % 13) + 2, s: Math.floor(i / 13) });
const STRAIGHT = new Uint8Array(8192);
for (let lo = 0; lo <= 8; lo++) STRAIGHT[0b11111 << lo] = 1;
STRAIGHT[0b1000000001111] = 1;                                 // A-2-3-4-5
const ROYAL_MASK = 0b1111100000000;                            // T J Q K A

// Straightforward evaluator for any 5 cards {r,s}
export function rankOf(cards) {
  const rc = new Array(13).fill(0); let mask = 0; const s0 = cards[0].s; let flush = true;
  for (const c of cards) { rc[c.r - 2]++; mask |= 1 << (c.r - 2); if (c.s !== s0) flush = false; }
  let pairs = 0, trips = 0, quads = 0, hi = 0;
  rc.forEach((n, r) => { if (n === 2) { pairs++; if (r >= 9) hi++; } if (n === 3) trips++; if (n === 4) quads++; });
  if (quads) return 7;
  if (trips && pairs) return 6;
  if (trips) return 3;
  if (pairs === 2) return 2;
  if (pairs === 1) return hi ? 1 : 0;
  const st = STRAIGHT[mask] === 1;
  if (st && flush) return mask === ROYAL_MASK ? 9 : 8;
  if (flush) return 5;
  if (st) return 4;
  return 0;
}
// the cards that make the hand (for highlighting): indices into `cards`
export function winningCards(cards, rank) {
  if (rank >= 4 && rank !== 7) return [0, 1, 2, 3, 4];
  if (rank === 0) return [];
  const rc = {}; cards.forEach(c => { rc[c.r] = (rc[c.r] || 0) + 1; });
  return cards.map((c, i) => [c, i]).filter(([c]) => rc[c.r] >= 2 && (rank !== 1 || c.r >= 11)).map(([, i]) => i);
}

// ── exact hold analysis ─────────────────────────────────────────────────
// Every draw for a hold is enumerated with an incremental hand state, so the
// leaf costs O(1): all 32 holds = 2,598,960 final hands, ~50–100 ms in a browser.
function makeState() { return { rc: new Int8Array(13), sc: new Int8Array(4), pairs: 0, trips: 0, quads: 0, hi: 0, mask: 0 }; }
function add(st, i) {
  const r = i % 13, s = (i / 13) | 0, o = st.rc[r]++;
  st.sc[s]++;
  if (o === 0) st.mask |= 1 << r;
  else if (o === 1) { st.pairs++; if (r >= 9) st.hi++; }
  else if (o === 2) { st.pairs--; if (r >= 9) st.hi--; st.trips++; }
  else if (o === 3) { st.trips--; st.quads++; }
}
function remove(st, i) {
  const r = i % 13, s = (i / 13) | 0, o = st.rc[r]--;
  st.sc[s]--;
  if (o === 1) st.mask &= ~(1 << r);
  else if (o === 2) { st.pairs--; if (r >= 9) st.hi--; }
  else if (o === 3) { st.trips--; st.pairs++; if (r >= 9) st.hi++; }
  else if (o === 4) { st.quads--; st.trips++; }
}
function leaf(st) {
  if (st.quads) return 7;
  if (st.trips) return st.pairs ? 6 : 3;
  if (st.pairs === 2) return 2;
  if (st.pairs === 1) return st.hi ? 1 : 0;
  const fl = st.sc[0] === 5 || st.sc[1] === 5 || st.sc[2] === 5 || st.sc[3] === 5, str = STRAIGHT[st.mask] === 1;
  if (str && fl) return st.mask === ROYAL_MASK ? 9 : 8;
  return fl ? 5 : str ? 4 : 0;
}
const C47 = [1, 47, 1081, 16215, 178365, 1533939];
// Expected payout (in coins, for `coins` bet) of holding `mask` (bit j = keep cards[j]).
export function holdEV(cards, mask, coins = MAX_COINS) {
  const pays = HANDS.map((_, r) => payout(r, coins));
  const hand = cards.map(idx), used = new Uint8Array(52); hand.forEach(i => { used[i] = 1; });
  const rest = []; for (let i = 0; i < 52; i++) if (!used[i]) rest.push(i);
  const st = makeState(); let held = 0;
  for (let j = 0; j < 5; j++) if (mask & (1 << j)) { add(st, hand[j]); held++; }
  const need = 5 - held;
  if (!need) return pays[leaf(st)];
  let sum = 0;
  const rec = (from, left) => {
    for (let k = from; k <= 47 - left; k++) {
      const c = rest[k]; add(st, c);
      if (left === 1) sum += pays[leaf(st)]; else rec(k + 1, left - 1);
      remove(st, c);
    }
  };
  rec(0, need);
  return sum / C47[need];
}
// All 32 holds, best first. Pass `yieldFn` (async) to stay off the UI thread's toes.
export async function analyse(cards, coins = MAX_COINS, yieldFn = null) {
  const out = [];
  for (let m = 0; m < 32; m++) { out.push({ mask: m, ev: holdEV(cards, m, coins) }); if (yieldFn) await yieldFn(); }
  // ties: prefer keeping fewer cards (the conventional choice), then lower mask
  return out.sort((a, b) => Math.abs(b.ev - a.ev) > 1e-9 ? b.ev - a.ev : popcount(a.mask) - popcount(b.mask));
}
export function bestHoldSync(cards, coins = MAX_COINS) {
  let best = { mask: 0, ev: -1 };
  for (let m = 0; m < 32; m++) { const ev = holdEV(cards, m, coins); if (ev > best.ev + 1e-12) best = { mask: m, ev }; }
  return best;
}
const popcount = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1);

// Ace's words for a hold
export const cardName = c => rankChar(c.r) + SUIT_CHARS[c.s];
const PLURAL = { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
export function describeHold(cards, mask) {
  const held = cards.filter((_, j) => mask & (1 << j)), n = held.length;
  if (n === 0) return 'Nothing worth keeping. Draw five fresh cards.';
  if (n === 5) { const rk = rankOf(cards); return rk ? `Stand pat. That ${HANDS[rk].toLowerCase()} is a keeper.` : 'Keep all five.'; }
  const byRank = {}; held.forEach(c => { byRank[c.r] = (byRank[c.r] || 0) + 1; });
  const groups = Object.entries(byRank).filter(([, k]) => k >= 2).map(([r, k]) => [+r, k]);
  if (groups.length === 2) return 'Hold the two pair and draw one.';
  if (groups.length === 1 && groups[0][1] + 0 === n) {
    const [r, k] = groups[0];
    return k === 4 ? `Hold the four ${PLURAL[r]}.` : k === 3 ? `Hold the three ${PLURAL[r]}.` : `Hold the pair of ${PLURAL[r]}.`;
  }
  const suited = held.every(c => c.s === held[0].s), ranks = held.map(c => c.r), lo = Math.min(...ranks), hiR = Math.max(...ranks);
  const distinct = new Set(ranks).size === n;
  const words = ['', 'one', 'two', 'three', 'four'];
  if (suited && n >= 3 && distinct && lo >= 10) return `Hold ${words[n]} to a Royal Flush.`;
  const aceLow = ranks.includes(14) && ranks.filter(r => r !== 14).every(r => r <= 5);
  const span = aceLow ? Math.max(...ranks.filter(r => r !== 14), 1) - 1 : hiR - lo;
  if (suited && n >= 3 && distinct && span <= 4) return `Hold ${words[n]} to a Straight Flush.`;
  if (suited && n === 4) return 'Hold four to a Flush.';
  if (n === 4 && distinct && span <= 4) return 'Hold four to a Straight.';
  return `Hold ${held.map(cardName).join(' ')}.`;
}

// ── proof ─────────────────────────────────────────────────────────────────
// Exact return of optimal play over all C(52,5) deals, by inclusion–exclusion:
// S_k[X] = total pay over all final hands containing the k-set X, so the pay of
// holding H from deal D is Σ_{T⊆D\H} (−1)^|T| S[H∪T] / C(47, 5−|H|).
export function exactReturn(coins = MAX_COINS) {
  const pays = HANDS.map((_, r) => payout(r, coins) / coins);
  const C = []; for (let n = 0; n <= 52; n++) { C[n] = []; for (let k = 0; k <= 5; k++) C[n][k] = k === 0 ? 1 : n < k ? 0 : (C[n - 1]?.[k - 1] ?? 0) + (C[n - 1]?.[k] ?? 0); }
  const S = [new Float64Array(1), new Float64Array(C[52][1]), new Float64Array(C[52][2]), new Float64Array(C[52][3]), new Float64Array(C[52][4]), new Float64Array(C[52][5])];
  const set = new Int32Array(5), sub = new Int32Array(5), rankIdx = new Int32Array(32), size = new Int8Array(32);
  for (let m = 0; m < 32; m++) size[m] = popcount(m);
  const colex = m => { let r = 0, k = 0; for (let j = 0; j < 5; j++) if (m & (1 << j)) { k++; r += C[set[j]][k]; } return r; };
  const st = makeState(), hist = new Float64Array(10);
  // pass 1: every final hand adds its pay to all 32 of its subsets
  for (let a = 0; a < 48; a++) { set[0] = a; add(st, a);
    for (let b = a + 1; b < 49; b++) { set[1] = b; add(st, b);
      for (let c = b + 1; c < 50; c++) { set[2] = c; add(st, c);
        for (let d = c + 1; d < 51; d++) { set[3] = d; add(st, d);
          for (let e = d + 1; e < 52; e++) { set[4] = e; add(st, e);
            const rk = leaf(st), v = pays[rk]; hist[rk]++;
            if (v) for (let m = 0; m < 32; m++) S[size[m]][colex(m)] += v;
            remove(st, e);
          } remove(st, d);
        } remove(st, c);
      } remove(st, b);
    } remove(st, a);
  }
  // pass 2: every deal, best of 32 holds
  const draws = [1533939, 178365, 16215, 1081, 47, 1];
  let total = 0, deals = 0; const bestHist = new Float64Array(32);
  for (let a = 0; a < 48; a++) { set[0] = a;
    for (let b = a + 1; b < 49; b++) { set[1] = b;
      for (let c = b + 1; c < 50; c++) { set[2] = c;
        for (let d = c + 1; d < 51; d++) { set[3] = d;
          for (let e = d + 1; e < 52; e++) { set[4] = e;
            for (let m = 0; m < 32; m++) rankIdx[m] = colex(m);
            let best = -1, bm = 0;
            for (let h = 0; h < 32; h++) {
              const free = 31 & ~h; let sum = 0;
              for (let t = free; ; t = (t - 1) & free) {        // all subsets T of the discards
                const u = h | t; sum += (size[t] & 1 ? -1 : 1) * S[size[u]][rankIdx[u]];
                if (t === 0) break;
              }
              const ev = sum / draws[size[h]];
              if (ev > best + 1e-12) { best = ev; bm = h; }
            }
            total += best; deals++; bestHist[size[bm]]++;
          }
        }
      }
    }
  }
  return { deals, rtp: total / deals, handFreq: Array.from(hist, x => x / C[52][5]), heldCards: Array.from(bestHist).slice(0, 6) };
}

// CLI: node js/rules/videopoker.mjs
if (globalThis.process?.argv?.[1]?.endsWith('videopoker.mjs')) {
  const h = s => s.split(' ').map(t => ({ r: { A: 14, K: 13, Q: 12, J: 11, T: 10 }[t[0]] || +t[0], s: 'shdc'.indexOf(t[1]) }));
  const cases = [
    ['As Ks Qs Js Ts', 9], ['Th Jh Qh Kh Ah', 9], ['9d Td Jd Qd Kd', 8], ['Ac 2c 3c 4c 5c', 8], ['7s 7h 7d 7c 2s', 7], ['As Ah Ad Ac Ks', 7],
    ['Ks Kh Kd 2c 2s', 6], ['3s 3h 3d Ac Ac', 6], ['2h 7h 9h Jh Kh', 5], ['Ah 2s 3d 4c 5h', 4], ['Ts Jh Qd Kc Ah', 4], ['9s Th Jd Qc Kh', 4],
    ['Qs Kh Ad 2c 3h', 0], ['Js Jh 4d 4c 9h', 2], ['9s 9h 9d Kc 2h', 3], ['Js Jh 2d 3c 9h', 1], ['As Ah 2d 3c 9h', 1], ['Ts Th 2d 3c 9h', 0],
    ['2s 3h 4d 5c 7h', 0], ['Ks Qs Js Ts 8s', 5], ['Ks Qs Js Ts 9h', 4], ['Jh Qh Kh Ah 2h', 5]
  ];
  let ok = 0;
  for (const [s, want] of cases) { const got = rankOf(h(s)); if (got === want) ok++; else console.log('  FAIL', s, 'got', HANDS[got], 'want', HANDS[want]); }
  console.log(`Evaluator: ${ok}/${cases.length} crafted hands correct`);
  // known optimal holds for 9/6 JoB at 5 coins
  const plays = [
    ['Ks Qs Js Ts 8s', 0b01111, 'break a flush for 4 to a royal'], ['As Ks Qs Js 9h', 0b01111, '4 to a royal over high cards'],
    ['Js Jh Qs Ks 3d', 0b00011, 'high pair beats 3 to a royal... (Jack pair)'], ['4s 4h 2s 7s 9s', 0b11101, '4 to a flush over a low pair'],
    ['Ts Jh Qd Kc Ah', 0b11111, 'stand on a made straight'], ['2s 5h 8d Jc Kh', 0b11000, 'two high cards'],
    ['3s 3h 3d 9c 9h', 0b11111, 'stand on a full house'], ['Qs Qh 5d 5c 9h', 0b01111, 'two pair, draw one'], ['2c 3d 7h 8s 9c', 0, 'garbage: draw five']
  ];
  let good = 0;
  for (const [s, want, why] of plays) {
    const cards = h(s), b = bestHoldSync(cards, 5);
    if (b.mask === want) good++; else console.log('  HOLD?', s, 'got', b.mask.toString(2).padStart(5, '0'), 'want', want.toString(2).padStart(5, '0'), '(' + why + ')', b.ev.toFixed(4));
    console.log(`  ${s.padEnd(15)} → ${describeHold(cards, b.mask).padEnd(42)} EV ${(b.ev / 5).toFixed(4)} per coin`);
  }
  console.log(`Strategy spot checks: ${good}/${plays.length}`);
  const t0 = Date.now(), r = exactReturn(5);
  console.log(`Exact optimal-play return, 9/6 Jacks or Better, 5 coins: ${(r.rtp * 100).toFixed(4)}% over ${r.deals.toLocaleString()} deals (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  const r1 = exactReturn(1);
  console.log(`Same with 1 coin (royal pays 250): ${(r1.rtp * 100).toFixed(4)}%`);
}
