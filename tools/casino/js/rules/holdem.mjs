// Texas Hold'em rules — six-seat no-limit, ported from the tested C³ table
// engine (tools/casino/table-poker.mjs + engine.mjs). Pure logic, no DOM.
//
//  • five/best/compare   hand evaluation (rank arrays compare lexicographically)
//  • TablePoker          multiway state machine: blinds, full/short raises and
//                        re-opening, uncalled-bet refunds, all-ins, runouts,
//                        main + side pots, split pots (odd chip left of button)
//  • tableEquity / tableBotAction   Monte-Carlo opponents using only their own
//                        cards and public information.
//
// Changes from the source: whole chips (the site version used half chips — our
// blinds are always even, so odd chips of a split go left of the button),
// crypto RNG from core/rng.mjs, bestHand() that also returns the winning five
// cards, human-readable hand names and draws, and a little bookkeeping the 3D
// table animates from (burned cards, refunds, the closed street's bets).
import { rand, deck } from '../core/rng.mjs';

export const LEVELS = [
  { name: 'Rookie', skill: .18, samples: 12 },
  { name: 'Regular', skill: .4, samples: 24 },
  { name: 'Sharp', skill: .6, samples: 45 },
  { name: 'High Roller', skill: .8, samples: 75 },
  { name: 'The C3 Elite', skill: .95, samples: 110 }
];

export const HAND_NAMES = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

// ── evaluation ─────────────────────────────────────────────────────────────
export function five(cards) {
  const ranks = cards.map(c => c.r).sort((a, b) => b - a), counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]), flush = cards.every(c => c.s === cards[0].s);
  let straight = 0;
  if (counts.size === 5) { if (ranks[0] - ranks[4] === 4) straight = ranks[0]; else if (ranks.join(',') === '14,5,4,3,2') straight = 5; }
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, ...groups.map(g => g[0])];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...groups.map(g => g[0])];
  if (groups[0][1] === 2) return [1, ...groups.map(g => g[0])];
  return [0, ...ranks];
}
export function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return Math.sign(d); }
  return 0;
}
export function best(cards) {
  if (cards.length < 5) return [0, ...cards.map(c => c.r).sort((a, b) => b - a)];
  let v = [-1];
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++) for (let c = b + 1; c < cards.length - 2; c++)
    for (let d = c + 1; d < cards.length - 1; d++) for (let e = d + 1; e < cards.length; e++) {
      const n = five([cards[a], cards[b], cards[c], cards[d], cards[e]]);
      if (compare(n, v) > 0) v = n;
    }
  return v;
}
// Like best(), but also returns which five cards make the hand (for highlighting).
export function bestHand(cards) {
  if (cards.length < 5) return { rank: best(cards), cards: [...cards] };
  let v = [-1], pick = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++)
    for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
      const h = [cards[a], cards[b], cards[c], cards[d], cards[e]], r = five(h);
      if (compare(r, v) > 0) { v = r; pick = h; }
    }
  return { rank: v, cards: pick };
}

// ── names ──────────────────────────────────────────────────────────────────
const NAME = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };
const PLURAL = r => r === 6 ? 'sixes' : NAME[r] + 's';
export const rankName = r => NAME[r];
export const rankPlural = PLURAL;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// "Full house, kings over fives", "Two pair, aces and nines", "Flush, ace high"…
export function describe(rank) {
  if (!rank || rank[0] < 0) return '';
  const [cat, a, b] = rank;
  switch (cat) {
    case 8: return a === 14 ? 'Royal flush' : `Straight flush, ${NAME[a]} high`;
    case 7: return `Four of a kind, ${PLURAL(a)}`;
    case 6: return `Full house, ${PLURAL(a)} over ${PLURAL(b)}`;
    case 5: return `Flush, ${NAME[a]} high`;
    case 4: return a === 5 ? 'Straight, five high' : `Straight, ${NAME[a]} high`;
    case 3: return `Three of a kind, ${PLURAL(a)}`;
    case 2: return `Two pair, ${PLURAL(a)} and ${PLURAL(b)}`;
    case 1: return `Pair of ${PLURAL(a)}`;
    default: return `High card, ${NAME[a]}`;
  }
}
// Short label for small tags: "Two pair", "Kings full", "Pair of 9s"…
export function shortName(rank) {
  if (!rank || rank[0] < 0) return '';
  const [cat, a, b] = rank;
  if (cat === 8) return a === 14 ? 'Royal flush' : 'Straight flush';
  if (cat === 6) return `${cap(PLURAL(a))} full`;
  if (cat === 1) return `Pair of ${PLURAL(a)}`;
  if (cat === 0) return `${cap(NAME[a])} high`;
  return HAND_NAMES[cat];
}
// Pre-flop names: "Pocket kings", "Ace–king suited", "Nine–seven offsuit"
export function holeName([x, y]) {
  if (!x || !y) return '';
  const hi = x.r >= y.r ? x : y, lo = hi === x ? y : x;
  if (hi.r === lo.r) return `Pocket ${PLURAL(hi.r)}`;
  return `${cap(NAME[hi.r])}–${NAME[lo.r]} ${hi.s === lo.s ? 'suited' : 'offsuit'}`;
}
// What the player is drawing to (only meaningful on the flop and turn).
export function draws(hole, board) {
  if (board.length < 3 || board.length > 4) return [];
  const all = [...hole, ...board], out = [];
  const made = best(all)[0];
  if (made < 5) {
    const bySuit = [0, 0, 0, 0]; for (const c of all) bySuit[c.s]++;
    const s = bySuit.findIndex(n => n === 4);
    if (s >= 0 && hole.some(c => c.s === s)) out.push('flush draw');
  }
  if (made < 4) {
    const withAce = rs => { const s = new Set(rs); if (s.has(14)) s.add(1); return s; };
    const high = s => { for (let hi = 14; hi >= 5; hi--) { let ok = true; for (let k = 0; k < 5 && ok; k++) ok = s.has(hi - k); if (ok) return hi; } return 0; };
    const base = all.map(c => c.r), holeR = withAce(hole.map(c => c.r)), outs = [];
    for (let r = 2; r <= 14; r++) {
      if (base.includes(r)) continue;
      const hi = high(withAce([...base, r]));
      // the straight must use one of our hole cards to be *our* draw
      if (hi && [0, 1, 2, 3, 4].some(k => holeR.has(hi - k))) outs.push(r);
    }
    if (outs.length >= 2) out.push('open-ended straight draw'); else if (outs.length === 1) out.push('gutshot');
  }
  return out;
}

// ── the table ──────────────────────────────────────────────────────────────
export const PLAYERS = [
  { name: 'You', style: 'Your seat', color: '#e4c483' },
  { name: 'Maya', style: 'Patient', color: '#93ba9d', tight: .045, aggression: .45 },
  { name: 'Marcus', style: 'Balanced', color: '#cab27e', tight: .005, aggression: .65 },
  { name: 'Kai', style: 'Analytical', color: '#8aafc9', tight: .025, aggression: .55 },
  { name: 'Elena', style: 'Aggressive', color: '#c78a94', tight: -.025, aggression: .92 },
  { name: 'Rico', style: 'Loose', color: '#af9fc5', tight: -.055, aggression: .55 }
];

// Multiway no-limit state machine. Seat 0 is the human. Whole chips.
export class TablePoker {
  constructor(stacks, bb, button = 0, shoe = deck()) {
    if (stacks.length < 2 || stacks.length > 6 || stacks.some(n => !Number.isInteger(n) || n <= 0) || !Number.isInteger(bb) || bb <= 0 || bb % 2) throw Error('Invalid table stacks or blinds');
    this.n = stacks.length; this.stacks = [...stacks]; this.initial = [...stacks]; this.bb = bb; this.button = ((button % this.n) + this.n) % this.n; this.shoe = shoe;
    this.cards = stacks.map(() => []); this.board = []; this.burned = []; this.folded = stacks.map(() => false); this.bets = stacks.map(() => 0); this.total = stacks.map(() => 0);
    this.actedAt = stacks.map(() => null); this.status = stacks.map(() => '');
    this.pot = 0; this.street = 0; this.phase = 'play'; this.current = bb; this.lastRaise = bb; this.log = []; this.awards = stacks.map(() => 0); this.pots = []; this.ranks = []; this.lastAction = null;
    this.refundLog = [];   // every uncalled bet returned: {player, amount, street}
    for (let pass = 0; pass < 2; pass++) for (let j = 1; j <= this.n; j++) this.cards[(this.button + j) % this.n].push(shoe.pop());
    this.sb = this.n === 2 ? this.button : (this.button + 1) % this.n; this.big = (this.sb + 1) % this.n;
    this.pay(this.sb, bb / 2); this.pay(this.big, bb); this.status[this.sb] = 'Small blind'; this.status[this.big] = 'Big blind';
    this.blinds = { sb: this.sb, bb: this.big, sbPaid: this.bets[this.sb], bbPaid: this.bets[this.big] };
    this.pending = new Set(this.stacks.flatMap((s, i) => s > 0 ? [i] : [])); this.actor = this.next(this.big, i => this.canAct(i)); this.advance(this.big);
  }
  next(from, predicate) { for (let j = 1; j <= this.n; j++) { const i = (from + j) % this.n; if (predicate(i)) return i; } return -1; }
  alive() { return this.folded.flatMap((f, i) => f ? [] : [i]); }
  canAct(i) { return !this.folded[i] && this.stacks[i] > 0; }
  pay(i, amount) { const n = Math.min(amount, this.stacks[i]); this.stacks[i] -= n; this.bets[i] += n; this.total[i] += n; this.pot += n; return n; }
  legal(i = this.actor) {
    if (this.phase !== 'play' || i !== this.actor || !this.canAct(i)) return null;
    const owed = Math.max(0, this.current - this.bets[i]), max = this.bets[i] + this.stacks[i];
    const reopen = this.actedAt[i] === null || this.actedAt[i] === 0 || this.current - this.actedAt[i] >= this.lastRaise;
    const min = this.current < this.bb ? this.bb : this.current + this.lastRaise;
    const canRaise = reopen && max > this.current && this.stacks.some((_, j) => j !== i && this.canAct(j));
    return { call: Math.min(owed, this.stacks[i]), check: owed === 0, minRaise: min, maxRaise: max, canRaise, shortRaise: canRaise && max < min, reopened: reopen };
  }
  act(type, amount) {
    const p = this.actor, l = this.legal(); if (!l) return false;
    let text = '', paid = 0;
    if (type === 'fold') { this.folded[p] = true; text = 'Fold'; }
    else if (type === 'check') { if (!l.check) return false; text = 'Check'; this.actedAt[p] = this.current; }
    else if (type === 'call') { if (l.check) return false; paid = this.pay(p, l.call); text = this.stacks[p] === 0 ? 'All-in ' + this.bets[p] : 'Call ' + paid; this.actedAt[p] = this.current; }
    else if (type === 'raise') {
      const target = Number(amount);
      if (!l.canRaise || !Number.isInteger(target) || target > l.maxRaise || target <= this.current || (target < l.minRaise && target !== l.maxRaise)) return false;
      const old = this.current, increase = target - old;
      if (target >= l.minRaise) this.lastRaise = old < this.bb ? target : increase;
      paid = this.pay(p, target - this.bets[p]); this.current = target; this.actedAt[p] = target;
      this.pending = new Set(this.stacks.flatMap((_, i) => i !== p && this.canAct(i) ? [i] : []));
      text = this.stacks[p] === 0 ? 'All-in ' + target : old === 0 ? 'Bet ' + target : 'Raise to ' + target;
    } else return false;
    this.pending.delete(p); this.status[p] = text; this.log.push(`${PLAYERS[p]?.name ?? 'Seat ' + p}: ${text}`);
    this.lastAction = { player: p, type, paid, text, street: this.street, allIn: this.stacks[p] === 0 && type !== 'fold' && type !== 'check', to: this.bets[p] };
    this.advance(p); return true;
  }
  advance(from) {
    const alive = this.alive(); if (alive.length === 1) { this.refundUncalled(); this.settle(false); return; }
    const able = alive.filter(i => this.canAct(i));
    this.pending = new Set([...this.pending].filter(i => this.canAct(i)));
    if (able.length <= 1) {
      this.current = Math.max(...this.bets);
      if (able.length === 1 && this.bets[able[0]] < this.current) { this.pending = new Set(able); this.actor = able[0]; return; }
      this.closeStreet(); return;
    }
    if (this.pending.size === 0) { this.closeStreet(); return; }
    this.actor = this.next(from, i => this.pending.has(i));
  }
  refundUncalled() {
    const order = this.bets.map((amount, i) => ({ amount, i })).sort((a, b) => b.amount - a.amount), top = order[0], second = order[1]?.amount ?? 0;
    this.refund = null;
    if (top.amount > second) {
      const extra = top.amount - second;
      this.stacks[top.i] += extra; this.total[top.i] -= extra; this.bets[top.i] -= extra; this.pot -= extra;
      this.refund = { player: top.i, amount: extra, street: this.street };
      this.refundLog.push(this.refund);
    }
  }
  closeStreet() {
    this.refundUncalled();
    this.closed = { street: this.street, bets: [...this.bets], refund: this.refund };
    if (this.street === 3) { this.settle(true); return; }
    if (this.alive().filter(i => this.canAct(i)).length <= 1) { this.phase = 'runout'; this.actor = -1; return; }
    this.dealStreet(); this.bets.fill(0); this.current = 0; this.lastRaise = this.bb; this.actedAt.fill(null);
    this.pending = new Set(this.stacks.flatMap((_, i) => this.canAct(i) ? [i] : [])); this.status = this.status.map((s, i) => this.folded[i] ? 'Fold' : this.stacks[i] === 0 ? 'All-in' : '');
    this.actor = this.next(this.button, i => this.canAct(i));
  }
  dealStreet() { this.burned.push(this.shoe.pop()); const count = this.board.length === 0 ? 3 : 1; for (let j = 0; j < count; j++) this.board.push(this.shoe.pop()); this.street++; }
  runoutStep() { if (this.phase !== 'runout') return false; if (this.board.length < 5) this.dealStreet(); else this.settle(true); return true; }
  potLayers() {
    const caps = [...new Set(this.total.filter(n => n > 0))].sort((a, b) => a - b); let before = 0;
    const layers = [];
    for (const cap of caps) {
      const contributors = this.total.flatMap((n, i) => n >= cap ? [i] : []), amount = (cap - before) * contributors.length, eligible = contributors.filter(i => !this.folded[i]); before = cap;
      const previous = layers.at(-1);
      // Dead money at different contribution levels is still the same pot when eligibility matches.
      if (previous && previous.eligible.join(',') === eligible.join(',')) { previous.amount += amount; previous.cap = cap; }
      else if (!eligible.length && previous) { previous.amount += amount; previous.cap = cap; }   // (never happens after refunds; belt and braces)
      else layers.push({ amount, cap, eligible, contributors });
    }
    return layers;
  }
  settle(showdown) {
    if (this.phase === 'settled') return;
    this.reason = showdown ? 'Showdown' : 'Fold'; this.wonPot = this.pot;
    this.ranks = this.cards.map((c, i) => showdown && !this.folded[i] ? best([...c, ...this.board]) : null);
    this.pots = this.potLayers(); this.awards.fill(0);
    for (const pot of this.pots) {
      let winners = pot.eligible;
      if (!winners.length) throw Error('Pot without eligible player');
      if (showdown && winners.length > 1) { let top = [-1]; for (const i of winners) if (compare(this.ranks[i], top) > 0) top = this.ranks[i]; winners = winners.filter(i => compare(this.ranks[i], top) === 0); }
      // odd chips go to the first winner clockwise from the button
      winners.sort((a, b) => ((a - this.button - 1 + this.n) % this.n) - ((b - this.button - 1 + this.n) % this.n));
      const base = Math.floor(pot.amount / winners.length), extra = pot.amount % winners.length;
      pot.shares = winners.map((i, j) => { const paid = base + (j < extra ? 1 : 0); this.awards[i] += paid; this.stacks[i] += paid; return paid; });
      pot.winners = winners;
    }
    this.winners = [...new Set(this.pots.flatMap(p => p.winners))]; this.pot = 0; this.phase = 'settled'; this.actor = -1; this.net = this.stacks[0] - this.initial[0];
    this.status = this.status.map((s, i) => this.awards[i] > 0 ? 'Won ' + this.awards[i] : this.folded[i] ? 'Fold' : showdown ? 'Showdown' : s);
  }
  // chips still behind + in front of every seat (for conservation checks)
  get chipsInPlay() { return this.stacks.reduce((a, b) => a + b, 0) + this.pot; }
}

// ── the regulars ───────────────────────────────────────────────────────────
export function tableEquity(own, board, opponents, samples) {
  const known = new Set([...own, ...board].map(c => c.s * 13 + c.r)); const pool = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) if (!known.has(s * 13 + r)) pool.push({ r, s });
  const needed = opponents * 2 + 5 - board.length; let score = 0;
  for (let t = 0; t < samples; t++) {
    const d = pool.slice(); for (let j = 0; j < needed; j++) { const k = j + rand(d.length - j); [d[j], d[k]] = [d[k], d[j]]; }
    const shared = [...board, ...d.slice(opponents * 2, needed)], mine = best([...own, ...shared]); let tied = 1, lost = false;
    for (let o = 0; o < opponents; o++) { const cmp = compare(mine, best([d[o * 2], d[o * 2 + 1], ...shared])); if (cmp < 0) { lost = true; break; } if (cmp === 0) tied++; }
    if (!lost) score += 1 / tied;
  }
  return score / samples;
}
const r01 = () => rand(1000) / 1000;
// A bot's decision. Inputs are only its own cards, the board and public betting.
// opts.style lets the test harness drive seat 0 with a bot personality.
export function tableBotAction(p, level, opts = {}) {
  const i = p.actor, l = p.legal(); if (!l || (i === 0 && !opts.style)) return null;
  const cfg = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))], style = opts.style || PLAYERS[i], opponents = p.alive().length - 1;
  const eq = tableEquity(p.cards[i], p.board, opponents, cfg.samples), noise = (r01() - .5) * (1 - cfg.skill) * .28;
  const strength = eq + noise - style.tight, odds = l.call / (p.pot + l.call || 1), bluff = r01() < (.012 + cfg.skill * .035) * style.aggression / Math.sqrt(opponents);
  if (l.call && strength < odds + cfg.skill * .025 && !bluff) return { type: 'fold' };
  const threshold = Math.max(.32, 1 / (opponents + 1) * 1.4) + (1 - style.aggression) * .1;
  if (l.canRaise && (strength > threshold || bluff)) {
    const bet = Math.round(Math.max(p.bb, p.pot * (.35 + style.aggression * .4)) / p.bb) * p.bb;
    return { type: 'raise', amount: Math.min(l.maxRaise, Math.max(l.minRaise, p.current + bet)) };
  }
  return { type: l.check ? 'check' : 'call' };
}
