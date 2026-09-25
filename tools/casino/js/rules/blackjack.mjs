// Blackjack rules: 6 decks, dealer stands on soft 17, 3:2, double any two,
// double after split, one split per hand (aces get one card), late surrender,
// insurance 2:1, US hole-card peek. Pure functions — unit tested in the harness.
export const cardVal = c => c.r === 14 ? 11 : Math.min(10, c.r);
export function handValue(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += cardVal(c); if (c.r === 14) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 && t <= 21 };
}
export const isNatural = cards => cards.length === 2 && handValue(cards).total === 21;
export function label(cards) {
  const v = handValue(cards);
  if (isNatural(cards)) return 'BJ';
  if (v.total > 21) return String(v.total);
  return v.soft && v.total !== 21 ? `${v.total - 10}/${v.total}` : String(v.total);
}
export const dealerShouldHit = cards => handValue(cards).total < 17;

// 21+3: player's first two cards + dealer's up card
export const SIDE_PAYS = { 'Suited trips': 100, 'Straight flush': 40, 'Three of a kind': 30, 'Straight': 10, 'Flush': 5 };
export function twentyOnePlus3(a, b, up) {
  const cs = [a, b, up], rs = cs.map(c => c.r).sort((x, y) => x - y);
  const flush = cs.every(c => c.s === cs[0].s);
  const trips = rs[0] === rs[1] && rs[1] === rs[2];
  const straight = !trips && ((rs[2] - rs[0] === 2 && rs[0] !== rs[1] && rs[1] !== rs[2]) || (rs[0] === 2 && rs[1] === 3 && rs[2] === 14));
  if (trips && flush) return 'Suited trips';
  if (straight && flush) return 'Straight flush';
  if (trips) return 'Three of a kind';
  if (straight) return 'Straight';
  if (flush) return 'Flush';
  return null;
}

// Basic strategy for these rules. legal: {double, split, surrender}
export function advice(cards, up, legal) {
  const u = cardVal(up), { total: t, soft } = handValue(cards);
  if (legal.surrender && !soft) {
    if (t === 16 && u >= 9) return 'surrender';
    if (t === 15 && u === 10) return 'surrender';
  }
  if (legal.split) {
    const r = cards[0].r;
    if (r === 14 || r === 8) return 'split';
    if (r === 9 && [2, 3, 4, 5, 6, 8, 9].includes(u)) return 'split';
    if (r === 7 && u <= 7) return 'split';
    if (r === 6 && u <= 6) return 'split';
    if (r === 4 && (u === 5 || u === 6)) return 'split';
    if ((r === 2 || r === 3) && u <= 7) return 'split';
  }
  if (soft) {
    if (t >= 19) return 'stand';
    if (t === 18) { if (legal.double && u >= 3 && u <= 6) return 'double'; return u <= 8 ? 'stand' : 'hit'; }
    if (t === 17) return legal.double && u >= 3 && u <= 6 ? 'double' : 'hit';
    if (t >= 15) return legal.double && u >= 4 && u <= 6 ? 'double' : 'hit';
    return legal.double && u >= 5 && u <= 6 ? 'double' : 'hit';
  }
  if (t >= 17) return 'stand';
  if (t >= 13) return u <= 6 ? 'stand' : 'hit';
  if (t === 12) return u >= 4 && u <= 6 ? 'stand' : 'hit';
  if (t === 11) return legal.double && u <= 10 ? 'double' : 'hit';
  if (t === 10) return legal.double && u <= 9 ? 'double' : 'hit';
  if (t === 9) return legal.double && u >= 3 && u <= 6 ? 'double' : 'hit';
  return 'hit';
}

// Settle one hand. Returns {result, returned} where returned includes the stake.
export function settleHand(hand, dealerCards) {
  const p = handValue(hand.cards).total, d = handValue(dealerCards).total;
  const pn = !hand.split && isNatural(hand.cards), dn = isNatural(dealerCards);
  if (hand.surrendered) return { result: 'surrender', returned: hand.bet / 2 };
  if (p > 21) return { result: 'bust', returned: 0 };
  if (dn) return pn ? { result: 'push', returned: hand.bet } : { result: 'lose', returned: 0 };
  if (pn) return { result: 'blackjack', returned: hand.bet * 2.5 };
  if (d > 21 || p > d) return { result: 'win', returned: hand.bet * 2 };
  if (p === d) return { result: 'push', returned: hand.bet };
  return { result: 'lose', returned: 0 };
}
