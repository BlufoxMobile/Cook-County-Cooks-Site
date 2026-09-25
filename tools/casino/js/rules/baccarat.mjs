// Baccarat (Punto Banco) rules — pure functions, no DOM, no three.js.
// 8 decks. Naturals 8/9 stand. Player draws on 0–5. Banker follows the
// third-card tableau. Player 1:1, Banker 0.95:1 (5% commission taken on the
// spot), Tie 8:1 (Player/Banker bets push), Player Pair / Banker Pair 11:1.
//
// Commission rounding: play chips are whole numbers, so a winning Banker bet
// is paid 95% of the stake rounded to the nearest whole chip, with exact
// halves going to the house (25 → +24, 50 → +47, 100 → +95, 1,000 → +950).
// On any stake that is a multiple of 20 the payout is exact.

// Card: {r: 2..14 (14 = ace), s: suit}. Baccarat points: A = 1, 2–9 face, 10/J/Q/K = 0.
export const point = c => c.r === 14 ? 1 : c.r >= 10 ? 0 : c.r;
export const total = cards => cards.reduce((a, c) => a + point(c), 0) % 10;
export const isNatural = cards => cards.length === 2 && total(cards) >= 8;
export const isPair = cards => cards.length >= 2 && cards[0].r === cards[1].r;

// Player draws a third card on 0–5 and stands on 6–7 (only asked when neither hand is a natural).
export const playerDraws = pTotal => pTotal <= 5;

// Banker's third-card rule. p3 = POINT value of the player's third card, or null when the player stood.
export function bankerDraws(bTotal, p3) {
  if (bTotal >= 7) return false;
  if (p3 === null || p3 === undefined) return bTotal <= 5;
  if (bTotal <= 2) return true;
  if (bTotal === 3) return p3 !== 8;
  if (bTotal === 4) return p3 >= 2 && p3 <= 7;
  if (bTotal === 5) return p3 >= 4 && p3 <= 7;
  return p3 === 6 || p3 === 7;                      // bTotal 6
}

// The printed tableau exactly as it appears on a casino rules card
// (D = Banker draws, S = Banker stands). Columns: player's third card
// 0 1 2 3 4 5 6 7 8 9, then "player stood". Rows: Banker total 0–7.
// Kept independent of bankerDraws() so the two can be checked against each other.
export const TABLEAU = [
  'DDDDDDDDDD D',   // 0
  'DDDDDDDDDD D',   // 1
  'DDDDDDDDDD D',   // 2
  'DDDDDDDDSD D',   // 3
  'SSDDDDDDSS D',   // 4
  'SSSSDDDDSS D',   // 5
  'SSSSSSDDSS S',   // 6
  'SSSSSSSSSS S'    // 7
];
export function tableauSays(bTotal, p3) {
  const row = TABLEAU[bTotal]; if (!row) return false;
  return (p3 === null ? row[11] : row[p3]) === 'D';
}

// Play a whole coup with a card source `draw()` (called in real dealing
// order: P, B, P, B, then the third cards). Returns everything the table needs.
export function playCoup(draw) {
  const player = [], banker = [];
  player.push(draw()); banker.push(draw()); player.push(draw()); banker.push(draw());
  return finishCoup(player, banker, draw);
}
// Given the first four cards, draw any third cards and resolve.
export function finishCoup(player, banker, draw) {
  const natural = isNatural(player) || isNatural(banker);
  let p3 = null;
  if (!natural) {
    if (playerDraws(total(player))) { const c = draw(); player.push(c); p3 = point(c); }
    if (bankerDraws(total(banker), p3)) banker.push(draw());
  }
  return resolve(player, banker);
}
export function resolve(player, banker) {
  const pt = total(player), bt = total(banker);
  const winner = pt > bt ? 'P' : bt > pt ? 'B' : 'T';
  const natP = isNatural(player), natB = isNatural(banker);
  const winNatural = winner === 'P' ? (natP ? pt : 0) : winner === 'B' ? (natB ? bt : 0) : 0;
  return {
    player, banker, pt, bt, winner,
    natural: natP || natB, natP, natB,
    natural9: winNatural === 9,                  // the WINNING hand was a natural 9
    winNatural,                                  // 8 / 9 / 0
    pPair: isPair(player), bPair: isPair(banker)
  };
}

// ── money ──
export const BETS = ['player', 'banker', 'tie', 'pPair', 'bPair'];
export const PAYS = { player: 1, banker: .95, tie: 8, pPair: 11, bPair: 11 };
export const LIMITS = { min: 25, player: 10000, banker: 10000, tie: 1000, pPair: 1000, bPair: 1000 };
// Banker win for a stake: 95% rounded to the nearest whole chip, halves to the house.
export const bankerWin = stake => Math.max(0, Math.ceil((19 * stake - 10) / 20));

// Settle one bet. Returns {result:'win'|'lose'|'push', returned (incl. stake), win, commission}.
export function settleBet(key, stake, coup) {
  if (!stake) return { result: 'none', returned: 0, win: 0, commission: 0 };
  const W = coup.winner;
  const lose = { result: 'lose', returned: 0, win: 0, commission: 0 };
  const push = { result: 'push', returned: stake, win: 0, commission: 0 };
  switch (key) {
    case 'player': return W === 'P' ? { result: 'win', returned: stake * 2, win: stake, commission: 0 } : W === 'T' ? push : lose;
    case 'banker': {
      if (W === 'T') return push;
      if (W !== 'B') return lose;
      const win = bankerWin(stake);
      return { result: 'win', returned: stake + win, win, commission: stake - win };
    }
    case 'tie': return W === 'T' ? { result: 'win', returned: stake * 9, win: stake * 8, commission: 0 } : lose;
    case 'pPair': return coup.pPair ? { result: 'win', returned: stake * 12, win: stake * 11, commission: 0 } : lose;
    case 'bPair': return coup.bPair ? { result: 'win', returned: stake * 12, win: stake * 11, commission: 0 } : lose;
  }
  return lose;
}
// bets = {player, banker, tie, pPair, bPair}
export function settleAll(bets, coup) {
  const lines = {}; let staked = 0, returned = 0, commission = 0;
  for (const k of BETS) {
    const st = bets[k] || 0; if (!st) continue;
    const r = settleBet(k, st, coup); lines[k] = { stake: st, ...r };
    staked += st; returned += r.returned; commission += r.commission;
  }
  return { lines, staked, returned, commission, net: returned - staked };
}

// ── roadmap: Big Road placement ──
// results: array of {w:'P'|'B'|'T'}. Returns {cells:[{col,row,w,ties,pp,bp}], cols}
// Ties are marked on the previous cell (or a leading placeholder). Columns
// longer than six turn right along the bottom (the "dragon tail").
export function bigRoad(results, rows = 6) {
  const cells = [], occ = new Set(), K = (c, r) => c * 64 + r;
  let cur = null, logical = -1, turned = false, leadTies = 0;
  for (const h of results) {
    if (h.w === 'T') { if (cur) cur.ties++; else leadTies++; continue; }
    let col, row;
    if (cur && cur.w === h.w) {
      // same streak: go down while there is room, otherwise run right along the row
      if (!turned && cur.row + 1 < rows && !occ.has(K(cur.col, cur.row + 1))) { col = cur.col; row = cur.row + 1; }
      else { turned = true; col = cur.col + 1; row = cur.row; }
    } else {
      logical++;
      while (occ.has(K(logical, 0))) logical++;      // a long tail can reach the next column's top square
      col = logical; row = 0; turned = false;
    }
    cur = { col, row, w: h.w, ties: 0, pp: !!h.pp, bp: !!h.bp };
    if (leadTies && !cells.length) { cur.ties = leadTies; leadTies = 0; }   // ties before the first result
    occ.add(K(col, row)); cells.push(cur);
  }
  if (leadTies) cells.push({ col: 0, row: 0, w: null, ties: leadTies, pp: false, bp: false });
  const cols = cells.reduce((m, c) => Math.max(m, c.col + 1), 0);
  return { cells, cols };
}

// ── verification helpers (used by the Node test script) ──
// Exact probabilities for an 8-deck shoe by full enumeration of the six
// possible cards (by point value, drawn without replacement).
export function exactOdds(decks = 8) {
  const counts = Array(10).fill(4 * decks); counts[0] = 16 * decks;
  let left = 52 * decks;
  const out = { P: 0, B: 0, T: 0 };
  const take = (v, fn, p) => { const n = counts[v]; if (!n) return; const q = p * n / left; counts[v]--; left--; fn(v, q); counts[v]++; left++; };
  const each = (fn, p) => { for (let v = 0; v < 10; v++) take(v, fn, p); };
  each((p1, a) => each((b1, b) => each((p2, c) => each((b2, d) => {
    const pt = (p1 + p2) % 10, bt = (b1 + b2) % 10;
    const fin = (P, B, q) => { out[P > B ? 'P' : B > P ? 'B' : 'T'] += q; };
    if (pt >= 8 || bt >= 8) return fin(pt, bt, d);
    if (playerDraws(pt)) {
      each((p3, e) => {
        const P = (pt + p3) % 10;
        if (bankerDraws(bt, p3)) each((b3, f) => fin(P, (bt + b3) % 10, f), e);
        else fin(P, bt, e);
      }, d);
    } else if (bankerDraws(bt, null)) each((b3, f) => fin(pt, (bt + b3) % 10, f), d);
    else fin(pt, bt, d);
  }, c), b), a), 1);
  const pair = (4 * decks - 1) / (52 * decks - 1);
  return {
    ...out, pair,
    edge: {
      banker: -(out.B * .95 - out.P),
      player: -(out.P - out.B),
      tie: -(out.T * 8 - (1 - out.T)),
      pair: -(pair * 11 - (1 - pair))
    }
  };
}
