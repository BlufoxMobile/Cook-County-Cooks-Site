// Play chips only. The bankroll lives in this browser (localStorage) so it
// carries over between visits; nothing here is ever worth money.
const KEY = 'c3-casino-v2';
export const START_BANK = 10000;
export const BONUS_LADDER = [1000, 1500, 2000, 2500, 3000, 4000, 5000];
export const RESCUE = 2500;           // Ace's marker when you're down to nothing
export const RESCUE_COOLDOWN_H = 1;

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}
function uid() { const a = new Uint8Array(9); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); }

export class Events {
  constructor() { this.map = new Map(); }
  on(n, f) { if (!this.map.has(n)) this.map.set(n, new Set()); this.map.get(n).add(f); return () => this.map.get(n).delete(f); }
  emit(n, d) { for (const f of this.map.get(n) || []) try { f(d); } catch (e) { console.error(e); } }
}

export class Bank {
  constructor(events) {
    this.events = events;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
    this.s = Object.assign({
      id: uid(), balance: START_BANK, inPlay: 0, lastBonus: null, streak: 0, rescueAt: 0,
      week: isoWeek(), weekPeak: START_BANK, allTimePeak: START_BANK,
      stats: { hands: 0, wins: 0, biggestWin: 0, byGame: {} }, name: '', store: '', created: Date.now(), settings: {}
    }, s || {});
    this.fresh = !s;
    // A hand interrupted by a closed tab: give the stake back.
    if (this.s.inPlay > 0) { this.refunded = this.s.inPlay; this.s.balance += this.s.inPlay; this.s.inPlay = 0; }
    this.rollWeek();
    this.save();
  }
  get balance() { return this.s.balance; }
  get id() { return this.s.id; }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch {} }
  changed(reason) { this.save(); this.events.emit('balance', { balance: this.s.balance, reason }); }
  rollWeek() {
    const w = isoWeek();
    if (this.s.week !== w) { this.s.week = w; this.s.weekPeak = this.s.balance; }
  }
  canAfford(n) { return n <= this.s.balance; }
  // Chips leave your rack for the felt.
  stake(n) {
    n = Math.round(n);
    if (n <= 0 || n > this.s.balance) return false;
    this.s.balance -= n; this.s.inPlay += n; this.changed('stake'); return true;
  }
  // Chips come back off the felt without the hand being played (clear bets).
  unstake(n) { n = Math.round(n); n = Math.min(n, this.s.inPlay); this.s.inPlay -= n; this.s.balance += n; this.changed('unstake'); }
  // Round over: `staked` leaves play, `returned` (stake + winnings) comes back.
  settle(staked, returned, game) {
    staked = Math.round(staked); returned = Math.round(returned);
    this.s.inPlay = Math.max(0, this.s.inPlay - staked);
    this.s.balance += returned;
    const net = returned - staked;
    const st = this.s.stats; st.hands++; if (net > 0) st.wins++; st.biggestWin = Math.max(st.biggestWin, net);
    const bg = st.byGame[game] ||= { hands: 0, net: 0 }; bg.hands++; bg.net += net;
    this.rollWeek();
    if (this.s.balance > this.s.weekPeak) { this.s.weekPeak = this.s.balance; this.events.emit('peak', { peak: this.s.weekPeak, week: this.s.week }); }
    this.s.allTimePeak = Math.max(this.s.allTimePeak, this.s.balance);
    this.changed('settle');
    return net;
  }
  // Games with a table stack (Hold'em): the hand's result moves the stack on the felt, not the balance.
  // Same books as settle() (stats, weekly/all-time peak measured on balance + stack), one event, inPlay == stack.
  settleStack(before, after, game) {
    before = Math.round(before); after = Math.round(after);
    const net = after - before;
    this.s.inPlay = Math.max(0, this.s.inPlay + net);
    const st = this.s.stats; st.hands++; if (net > 0) st.wins++; st.biggestWin = Math.max(st.biggestWin, net);
    const bg = st.byGame[game] ||= { hands: 0, net: 0 }; bg.hands++; bg.net += net;
    this.rollWeek();
    const total = this.s.balance + this.s.inPlay;
    if (total > this.s.weekPeak) { this.s.weekPeak = total; this.events.emit('peak', { peak: total, week: this.s.week }); }
    this.s.allTimePeak = Math.max(this.s.allTimePeak, total);
    this.changed('settle');
    return net;
  }
  credit(n, reason = 'bonus') {
    this.s.balance += Math.round(n); this.rollWeek();
    this.changed(reason);
  }
  // daily bonus
  bonusState() {
    const t = today(), last = this.s.lastBonus;
    if (last === t) return { available: false, next: BONUS_LADDER[Math.min(this.s.streak, BONUS_LADDER.length - 1)] };
    const y = new Date(); y.setDate(y.getDate() - 1);
    const streak = last === today(y) ? this.s.streak : 0;
    return { available: true, day: streak + 1, amount: BONUS_LADDER[Math.min(streak, BONUS_LADDER.length - 1)] };
  }
  claimBonus() {
    const b = this.bonusState(); if (!b.available) return 0;
    this.s.streak = b.day; this.s.lastBonus = today(); this.credit(b.amount, 'daily');
    return b.amount;
  }
  rescueState() {
    const wait = this.s.rescueAt + RESCUE_COOLDOWN_H * 36e5 - Date.now();
    return { needed: this.s.balance < 100 && this.s.inPlay === 0, ready: wait <= 0, wait };
  }
  rescue() {
    const r = this.rescueState(); if (!r.needed || !r.ready) return 0;
    this.s.rescueAt = Date.now(); const n = RESCUE - this.s.balance; this.credit(n, 'rescue'); return n;
  }
  setting(k, v) { if (v === undefined) return this.s.settings[k]; this.s.settings[k] = v; this.save(); }
}

// ── daily challenges ────────────────────────────────────────────────────
// Each has a test(e) over game events {game, type, ...} returning a progress increment.
export const CHALLENGE_POOL = [
  { id: 'bj-win3', game: 'blackjack', text: 'Win 3 hands of Blackjack', goal: 3, reward: 750, test: e => e.game === 'blackjack' && e.type === 'hand' && e.net > 0 },
  { id: 'bj-natural', game: 'blackjack', text: 'Get dealt a Blackjack', goal: 1, reward: 1000, test: e => e.game === 'blackjack' && e.type === 'hand' && e.natural },
  { id: 'bj-double', game: 'blackjack', text: 'Win a doubled-down hand', goal: 1, reward: 1000, test: e => e.game === 'blackjack' && e.type === 'hand' && e.doubledWin },
  { id: 'he-pot', game: 'holdem', text: 'Win 2 pots at Texas Hold’em', goal: 2, reward: 1000, test: e => e.game === 'holdem' && e.type === 'hand' && e.won },
  { id: 'he-showdown', game: 'holdem', text: 'Win a Hold’em showdown with two pair or better', goal: 1, reward: 1250, test: e => e.game === 'holdem' && e.type === 'hand' && e.won && e.showdown && e.rank >= 2 },
  { id: 'ro-straight', game: 'roulette', text: 'Hit a straight-up number in Roulette', goal: 1, reward: 1500, test: e => e.game === 'roulette' && e.type === 'spin' && e.straightHit },
  { id: 'ro-spins', game: 'roulette', text: 'Win 4 Roulette spins', goal: 4, reward: 750, test: e => e.game === 'roulette' && e.type === 'spin' && e.net > 0 },
  { id: 'sl-freespins', game: 'slots', text: 'Trigger Free Spins on Midnight Fox', goal: 1, reward: 1500, test: e => e.game === 'slots' && e.type === 'spin' && e.freeSpins },
  { id: 'sl-bigwin', game: 'slots', text: 'Land a win of 10x your bet on the slots', goal: 1, reward: 1250, test: e => e.game === 'slots' && e.type === 'spin' && e.multiple >= 10 },
  { id: 'ba-banker', game: 'baccarat', text: 'Win 3 Banker bets in Baccarat', goal: 3, reward: 750, test: e => e.game === 'baccarat' && e.type === 'hand' && e.bankerWin },
  { id: 'ba-natural', game: 'baccarat', text: 'See a natural 9 win in Baccarat', goal: 1, reward: 750, test: e => e.game === 'baccarat' && e.type === 'hand' && e.natural9 },
  { id: 'cr-point', game: 'craps', text: 'Make your point in Craps', goal: 1, reward: 1250, test: e => e.game === 'craps' && e.type === 'roll' && e.pointMade },
  { id: 'cr-rolls', game: 'craps', text: 'Roll the dice 12 times', goal: 12, reward: 600, test: e => e.game === 'craps' && e.type === 'roll' },
  { id: 'vp-flush', game: 'videopoker', text: 'Make a Flush or better in Video Poker', goal: 1, reward: 1250, test: e => e.game === 'videopoker' && e.type === 'hand' && e.rank >= 5 },
  { id: 'vp-wins', game: 'videopoker', text: 'Win 5 Video Poker hands', goal: 5, reward: 750, test: e => e.game === 'videopoker' && e.type === 'hand' && e.net > 0 },
  { id: 'any-tour', game: null, text: 'Play 4 different games today', goal: 4, reward: 1000, test: null }
];
function seeded(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; }; }

export class Challenges {
  constructor(bank, events) {
    this.bank = bank; this.events = events;
    const t = today();
    let st = bank.s.challenges;
    if (!st || st.day !== t) {
      const r = seeded('c3-' + t), pool = CHALLENGE_POOL.filter(c => c.id !== 'any-tour'), picks = [], games = new Set();
      let guard = 0;
      while (picks.length < 3 && guard++ < 500) { const c = pool[Math.floor(r() * pool.length)]; if (!games.has(c.game)) { games.add(c.game); picks.push(c.id); } }
      if (r() < .4) picks[2] = 'any-tour';
      st = { day: t, list: picks.map(id => ({ id, n: 0, done: false, claimed: false })), played: [] };
      bank.s.challenges = st; bank.save();
    }
    this.st = st;
    events.on('game', e => this.onEvent(e));
  }
  get list() { return this.st.list.map(x => ({ ...CHALLENGE_POOL.find(c => c.id === x.id), ...x })); }
  onEvent(e) {
    if (e.type === 'enter' && !this.st.played.includes(e.game)) this.st.played.push(e.game);
    let changed = false;
    for (const x of this.st.list) {
      if (x.done) continue;
      const def = CHALLENGE_POOL.find(c => c.id === x.id);
      if (def.id === 'any-tour') { const n = Math.min(def.goal, this.st.played.length); if (n !== x.n) { x.n = n; changed = true; } }
      else if (def.test(e)) { x.n = Math.min(def.goal, x.n + 1); changed = true; }
      if (x.n >= def.goal && !x.done) { x.done = true; this.events.emit('challenge-done', { ...def, ...x }); }
    }
    if (changed) { this.bank.save(); this.events.emit('challenges', this.list); }
  }
  claim(id) {
    const x = this.st.list.find(c => c.id === id); if (!x || !x.done || x.claimed) return 0;
    const def = CHALLENGE_POOL.find(c => c.id === id);
    x.claimed = true; this.bank.credit(def.reward, 'challenge');
    this.events.emit('challenges', this.list);
    return def.reward;
  }
  get unclaimed() { return this.st.list.filter(x => x.done && !x.claimed).length; }
}
