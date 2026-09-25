// CRAPS — standard Vegas rules. Pure, DOM-free: the game and the Node tests
// (js/games/craps-test.mjs) share every line of this file.
//
// Bet keys
//   pass passOdds dp dpOdds          line bets and their odds
//   come dc                          a come / don't come bet waiting for its first roll
//   comeN comeOddsN dcN dcOddsN      a come / don't come bet established on N (+ odds)
//   placeN                           place bets, N in 4 5 6 8 9 10
//   field  hardN (4 6 8 10)          field, hardways
//   anySeven anyCraps yo aces boxcars aceDeuce   one-roll propositions
//
// Money model (see CrapsLedger): chips are staked the moment they hit the felt.
// A roll returns {staked, returned}: `staked` = stakes that LEAVE the layout this
// roll (lost, pushed back, or paid and taken down), `returned` = everything paid
// to the player (returned stakes + all winnings, including winnings on bets that
// stay up). Bets that stay up remain staked.
export const MIN = 10, MAX = 5000, PROP_MAX = 1000;
export const POINTS = [4, 5, 6, 8, 9, 10];
export const HARDS = [4, 6, 8, 10];
export const ODDS_X = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };          // 3-4-5x odds
export const LAY_X = 6;                                                 // lay 6x flat: wins 3-4-5x
export const TRUE_ODDS = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] };
export const LAY_ODDS = { 4: [1, 2], 5: [2, 3], 6: [5, 6], 8: [5, 6], 9: [2, 3], 10: [1, 2] };
export const PLACE_PAYS = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] };
export const HARD_PAYS = { 4: 7, 6: 9, 8: 9, 10: 7 };
export const FIELD_PAYS = { 2: 2, 3: 1, 4: 1, 9: 1, 10: 1, 11: 1, 12: 3 };
export const PROPS = {
  anySeven: { pays: 4, hit: t => t === 7, name: 'Any Seven' },
  anyCraps: { pays: 7, hit: t => t === 2 || t === 3 || t === 12, name: 'Any Craps' },
  yo: { pays: 15, hit: t => t === 11, name: 'Yo-Eleven' },
  aces: { pays: 30, hit: t => t === 2, name: 'Aces' },
  boxcars: { pays: 30, hit: t => t === 12, name: 'Boxcars' },
  aceDeuce: { pays: 15, hit: t => t === 3, name: 'Ace-Deuce' }
};
const WORDS = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const word = n => WORDS[n] || String(n);
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function parseKey(key) {
  const m = /^(\D+)(\d*)$/.exec(key);
  return { type: m[1], n: m[2] ? +m[2] : 0 };
}
// whole-chip payout: the house pays down to the chip (the table's smallest chip is 10,
// so amounts are multiples of 5; pay exactly when the ratio allows, else round down)
export const pay = (amount, [num, den]) => Math.floor(amount * num / den + 1e-9);
export const paysExactly = (amount, [num, den]) => (amount * num) % den === 0;

export function betName(key) {
  const { type, n } = parseKey(key);
  return ({
    pass: 'Pass Line', passOdds: 'Pass Odds', dp: 'Don’t Pass', dpOdds: 'Lay Odds', come: 'Come', dc: 'Don’t Come',
    comeOdds: `Come ${n} Odds`, dcOdds: `Don’t Come ${n} Odds`, place: `Place ${n}`, field: 'Field', hard: `Hard ${n}`
  })[type] || (type === 'come' ? `Come ${n}` : type === 'dc' ? `Don’t Come ${n}` : PROPS[type]?.name || key);
}
export const oddsKeyFor = key => { const { type, n } = parseKey(key); return type === 'pass' ? 'passOdds' : type === 'dp' ? 'dpOdds' : type === 'come' && n ? 'comeOdds' + n : type === 'dc' && n ? 'dcOdds' + n : null; };
export const isOdds = key => /Odds/.test(key);
export const isOneRoll = key => key === 'field' || !!PROPS[key];

// What may go down on `key` right now. Returns {ok, max, reason}; max = the most
// that may sit on that key in total.
export function betLimit(key, point, bets = {}) {
  const { type, n } = parseKey(key), on = point != null;
  const no = reason => ({ ok: false, max: 0, reason });
  switch (type) {
    case 'pass': return on ? no('Pass Line bets go down on the come-out roll. Try the Come box — it works the same way.') : { ok: true, max: MAX };
    case 'dp': return on ? no('Don’t Pass goes down on the come-out roll. Try Don’t Come instead.') : { ok: true, max: MAX };
    case 'come': case 'dc':
      if (n) return no('That bet is already working on its number.');
      return on ? { ok: true, max: MAX } : no(`${type === 'come' ? 'Come' : 'Don’t Come'} opens once a point is set. On the come-out, bet the ${type === 'come' ? 'Pass Line' : 'Don’t Pass Bar'}.`);
    case 'passOdds': return on && bets.pass > 0 ? { ok: true, max: ODDS_X[point] * bets.pass } : no(on ? 'Odds go behind a Pass Line bet.' : 'Odds open once a point is set.');
    case 'dpOdds': return on && bets.dp > 0 ? { ok: true, max: LAY_X * bets.dp } : no(on ? 'Lay odds need a Don’t Pass bet.' : 'Odds open once a point is set.');
    case 'comeOdds': return bets['come' + n] > 0 ? { ok: true, max: ODDS_X[n] * bets['come' + n] } : no('Odds go behind an established Come bet.');
    case 'dcOdds': return bets['dc' + n] > 0 ? { ok: true, max: LAY_X * bets['dc' + n] } : no('Lay odds need an established Don’t Come bet.');
    case 'place': return POINTS.includes(n) ? { ok: true, max: MAX } : no('No such number.');
    case 'field': return { ok: true, max: MAX };
    case 'hard': return HARDS.includes(n) ? { ok: true, max: PROP_MAX } : no('No such hardway.');
    default: return PROPS[type] ? { ok: true, max: PROP_MAX } : no('Unknown bet.');
  }
}
// Contract bets can't come down: pass/don't pass once the point is on, and
// come/don't come once they have travelled to a number. (This house also keeps
// the Don't side up once it is working — line bets stay until decided.)
export function removable(key, point) {
  const { type, n } = parseKey(key);
  if (type === 'pass' || type === 'dp') return point == null;
  if ((type === 'come' || type === 'dc') && n) return false;
  return true;
}
// Is a bet live on this roll? Place bets, hardways and come odds are OFF on the
// come-out unless the player calls them working. Lay odds are always working.
export function working(key, point, opts = {}) {
  const { type } = parseKey(key);
  if (point != null || opts.working) return true;
  return !(type === 'place' || type === 'hard' || type === 'comeOdds');
}

// The largest odds amount ≤ max that pays in whole chips and can be built from
// the rack (multiples of 5, never 5 or 15). Returns 0 if none.
export function niceOdds(key, max, point) {
  const { type, n } = parseKey(key), num = type === 'passOdds' || type === 'dpOdds' ? point : n;
  const ratio = type === 'passOdds' || type === 'comeOdds' ? TRUE_ODDS[num] : LAY_ODDS[num];
  for (let a = Math.floor(max / 5) * 5; a >= 10; a -= 5) if (a !== 15 && paysExactly(a, ratio)) return a;
  return 0;
}

// Resolve one roll. bets: {key: amount}. Returns everything the table needs to
// pay, sweep and move chips, plus the next state. Never mutates `bets`.
export function resolveRoll(bets, point, d1, d2, opts = {}) {
  const t = d1 + d2, hard = d1 === d2, on = point != null;
  const natural = t === 7 || t === 11, craps = t === 2 || t === 3 || t === 12;
  const results = [], next = {};
  let staked = 0, returned = 0;
  const keep = (k, a) => { next[k] = (next[k] || 0) + a; };
  const win = (w, stays = false) => ({ kind: 'win', win: w, keep: stays });
  const LOSE = { kind: 'lose', win: 0 }, NONE = { kind: 'none', win: 0 }, PUSH = { kind: 'push', win: 0 };
  // established bets settle before a waiting come bet travels onto the same number
  const order = Object.keys(bets).sort((a, b) => (a === 'come' || a === 'dc') - (b === 'come' || b === 'dc'));
  for (const key of order) {
    const amt = bets[key];
    if (!(amt > 0)) continue;
    const { type, n } = parseKey(key);
    let r;
    switch (type) {
      case 'pass':
        r = !on ? (natural ? win(amt, true) : craps ? LOSE : NONE) : (t === point ? win(amt, true) : t === 7 ? LOSE : NONE); break;
      case 'dp':
        r = !on ? (t === 2 || t === 3 ? win(amt, true) : t === 12 ? { kind: 'bar', win: 0 } : natural ? LOSE : NONE)
          : (t === 7 ? win(amt, true) : t === point ? LOSE : NONE); break;
      case 'passOdds':
        r = !on ? PUSH : t === point ? win(pay(amt, TRUE_ODDS[point])) : t === 7 ? LOSE : NONE; break;
      case 'dpOdds':
        r = !on ? PUSH : t === 7 ? win(pay(amt, LAY_ODDS[point])) : t === point ? LOSE : NONE; break;
      case 'come':
        // a waiting come bet that wins on 11 stays in the box; on a seven-out it comes down (next roll is a come-out)
        if (!n) { r = natural ? win(amt, on && t === 11) : craps ? LOSE : { kind: 'travel', win: 0, to: 'come' + t }; break; }
        r = t === n ? win(amt) : t === 7 ? LOSE : NONE; break;
      case 'dc':
        if (!n) { r = t === 2 || t === 3 ? win(amt, true) : t === 12 ? { kind: 'bar', win: 0 } : natural ? LOSE : { kind: 'travel', win: 0, to: 'dc' + t }; break; }
        r = t === 7 ? win(amt) : t === n ? LOSE : NONE; break;
      case 'comeOdds':
        // off on the come-out: the flat bet is decided, the odds come back
        if (!working(key, point, opts)) r = t === n || t === 7 ? PUSH : { kind: 'off', win: 0 };
        else r = t === n ? win(pay(amt, TRUE_ODDS[n])) : t === 7 ? LOSE : NONE;
        break;
      case 'dcOdds':
        r = t === 7 ? win(pay(amt, LAY_ODDS[n])) : t === n ? LOSE : NONE; break;
      case 'place':
        if (!working(key, point, opts)) { r = { kind: 'off', win: 0 }; break; }
        r = t === n ? win(pay(amt, PLACE_PAYS[n]), true) : t === 7 ? LOSE : NONE; break;
      case 'field':
        r = FIELD_PAYS[t] ? win(amt * FIELD_PAYS[t], true) : LOSE; break;
      case 'hard':
        if (!working(key, point, opts)) { r = { kind: 'off', win: 0 }; break; }
        r = t === n && hard ? win(amt * HARD_PAYS[n], true) : t === 7 || t === n ? LOSE : NONE; break;
      default: {
        const p = PROPS[type];
        r = !p ? PUSH : p.hit(t) ? win(amt * p.pays, true) : LOSE;
      }
    }
    if (r.kind === 'win') {
      if (r.keep) { returned += r.win; keep(key, amt); }
      else { staked += amt; returned += amt + r.win; }
    } else if (r.kind === 'lose') staked += amt;
    else if (r.kind === 'push') { staked += amt; returned += amt; }
    else if (r.kind === 'travel') keep(r.to, amt);
    else keep(key, amt);                                        // none / off / bar
    results.push({ key, amount: amt, ...r });
  }
  const pointSet = !on && POINTS.includes(t), pointMade = on && t === point, sevenOut = on && t === 7;
  const nextPoint = !on ? (pointSet ? t : null) : (pointMade || sevenOut ? null : point);
  return {
    d1, d2, total: t, hard, point, nextPoint, results, bets: next, staked, returned, net: returned - staked,
    pointSet, pointMade, sevenOut, natural: !on && natural, crapsOut: !on && craps
  };
}

// The stickman's call for a roll.
export function stickCall(res) {
  const { total: t, hard, point } = res, on = point != null;
  let title = cap(word(t)), sub = '';
  if (t === 2) sub = 'Craps · Aces';
  else if (t === 3) sub = 'Craps · Ace-Deuce';
  else if (t === 12) sub = 'Craps · Boxcars';
  else if (t === 11) { title = 'Yo!'; sub = on ? 'Yo-leven' : 'Yo-leven · Front line winner'; }
  else if (t === 7) { title = on ? 'Seven out' : 'Seven'; sub = on ? 'Line away · Pay the don’ts' : 'Front line winner'; }
  else if (HARDS.includes(t)) sub = (hard ? 'Hard ' : 'Easy ') + word(t);
  else if (t === 5) sub = 'No field five';
  else if (t === 9) sub = 'Center field nine';
  if (res.pointMade) { title = 'Winner!'; sub = `${cap(word(t))}, the point${hard ? ' · the hard way' : ''}`; }
  const status = res.pointSet ? `Point is ${t}` : res.pointMade ? 'Pass line wins' : res.sevenOut ? 'New shooter coming out' : on ? `Point is ${point}` : (t === 2 || t === 3 || t === 12) ? 'Line away' : '';
  return { title, sub, status, total: t };
}

// House edges (per bet resolved) for the help sheet — verified by the tests.
export const EDGES = { pass: 1.41, dp: 1.36, come: 1.41, dc: 1.36, odds: 0, place68: 1.52, place59: 4.0, place410: 6.67, field: 2.78, hard68: 9.09, hard410: 11.11, anySeven: 16.67, anyCraps: 11.11, yo: 11.11, aces: 13.89, aceDeuce: 11.11 };

// ── the table's money book ─────────────────────────────────────────────────
// Holds the bets on the layout and talks to the bank. Invariant, always:
//   bank.inPlay (craps share) === sum of this.bets
export class CrapsLedger {
  constructor(bank, { bets = {}, point = null, opts = {} } = {}) {
    this.bank = bank; this.bets = { ...bets }; this.point = point; this.opts = opts;
  }
  total() { let s = 0; for (const k in this.bets) s += this.bets[k]; return s; }
  amount(key) { return this.bets[key] || 0; }
  // add `v` chips on `key`; returns {ok, reason}
  place(key, v) {
    const lim = betLimit(key, this.point, this.bets);
    if (!lim.ok) return { ok: false, reason: lim.reason };
    if (v < 1) return { ok: false, reason: 'Pick a chip.' };
    if (this.amount(key) + v > lim.max) return { ok: false, reason: isOdds(key) ? `Max odds there is ${lim.max.toLocaleString('en-US')} (${this.point != null || /\d/.test(key) ? '3-4-5x' : ''}).` : `Table max on that bet is ${lim.max.toLocaleString('en-US')}.`, max: true };
    if (!this.bank.stake(v)) return { ok: false, reason: 'Not enough chips for that one.' };
    this.bets[key] = this.amount(key) + v;
    return { ok: true };
  }
  // take a bet down (if the rules allow); odds follow their line bet
  remove(key) {
    const a = this.amount(key);
    if (!a || !removable(key, this.point)) return 0;
    this.bank.unstake(a); delete this.bets[key];
    return a;
  }
  removableKeys() { return Object.keys(this.bets).filter(k => this.bets[k] > 0 && removable(k, this.point)); }
  clearRemovable() { const out = {}; for (const k of this.removableKeys()) out[k] = this.remove(k); return out; }
  // resolve a roll (does not touch money until commit)
  roll(d1, d2) { return resolveRoll(this.bets, this.point, d1, d2, this.opts); }
  // apply a resolved roll: bank.settle once for everything decided on it
  commit(res) {
    if (res.committed) return res.net;
    res.committed = true;
    if (res.staked > 0 || res.returned > 0) this.bank.settle(res.staked, res.returned, 'craps');
    this.bets = { ...res.bets }; this.point = res.nextPoint;
    return res.net;
  }
}
