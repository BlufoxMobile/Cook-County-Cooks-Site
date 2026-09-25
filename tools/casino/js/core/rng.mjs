// Cryptographic, unbiased randomness for every deal, spin and roll.
// Math.random is only ever used for cosmetics (sparkle positions, idle glances).
export function rand(n) {
  if (!Number.isInteger(n) || n < 1) throw Error('Invalid random range');
  const a = new Uint32Array(1), limit = Math.floor(4294967296 / n) * n;
  do { globalThis.crypto.getRandomValues(a); } while (a[0] >= limit);
  return a[0] % n;
}
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = rand(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
// Card: {r: 2..14 (14 = ace), s: 0 spades, 1 hearts, 2 diamonds, 3 clubs}
export function deck(count = 1) {
  const d = [];
  for (let k = 0; k < count; k++) for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s, id: `${k}-${s}-${r}` });
  return shuffle(d);
}
// A shoe that reshuffles itself at the cut card.
export class Shoe {
  constructor(decks = 6, penetration = .75) { this.decks = decks; this.pen = penetration; this.fresh(); }
  fresh() { this.cards = deck(this.decks); this.total = this.cards.length; this.shuffled = true; }
  get needsShuffle() { return this.cards.length < this.total * (1 - this.pen); }
  draw() { if (!this.cards.length) this.fresh(); return this.cards.pop(); }
}
export const SUIT_CHARS = ['♠', '♥', '♦', '♣'];
export const RANK_CHARS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankChar = r => RANK_CHARS[r] || String(r);
export const cardName = c => rankChar(c.r) + SUIT_CHARS[c.s];
export const isRed = c => c.s === 1 || c.s === 2;
