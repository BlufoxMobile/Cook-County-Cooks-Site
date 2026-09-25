// European single-zero roulette: the wheel, the bets and what they pay.
// Pure functions only (no DOM, no three.js) so Node can verify every payout.
//
// A bet is { id, type, numbers:[...sorted], pays } where `pays` is the
// "to one" multiple. Every bet on this layout satisfies (pays + 1) × numbers = 36,
// which is exactly what gives the single-zero wheel its 1/37 = 2.70% edge.

export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = n => n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
export const pocketIndex = n => WHEEL.indexOf(n);

export const TABLE_MIN = 10, MAX_INSIDE = 1000, MAX_OUTSIDE = 5000;

export const PAYS = { straight: 35, split: 17, street: 11, trio: 11, corner: 8, four: 8, line: 5, column: 2, dozen: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };
export const INSIDE = new Set(['straight', 'split', 'street', 'trio', 'corner', 'four', 'line']);
export const isInside = bet => INSIDE.has(bet.type);
export const maxFor = bet => isInside(bet) ? MAX_INSIDE : MAX_OUTSIDE;

// layout helpers: number n sits in row (0..11) and column (0..2, column 0 = 1,4,7…)
export const rowOf = n => Math.floor((n - 1) / 3);
export const colOf = n => (n - 1) % 3;
export const numAt = (row, col) => row * 3 + col + 1;

const NAMES = {
  straight: 'STRAIGHT UP', split: 'SPLIT', street: 'STREET', trio: 'TRIO', corner: 'CORNER', four: 'FIRST FOUR', line: 'SIX LINE',
  column: 'COLUMN', dozen: 'DOZEN', red: 'RED', black: 'BLACK', odd: 'ODD', even: 'EVEN', low: '1 – 18', high: '19 – 36'
};

function mk(type, numbers, id) {
  const nums = [...numbers].sort((a, b) => a - b);
  return { id: id || `${type}:${nums.join('-')}`, type, numbers: nums, pays: PAYS[type] };
}

// ── constructors (return null when the combination is not a legal bet) ──
export function straight(n) { return Number.isInteger(n) && n >= 0 && n <= 36 ? mk('straight', [n]) : null; }
export function split(a, b) {
  if (a > b) [a, b] = [b, a];
  if (a === 0) return b >= 1 && b <= 3 ? mk('split', [0, b]) : null;
  if (a < 1 || b > 36) return null;
  const sameRow = rowOf(a) === rowOf(b) && b - a === 1;
  const sameCol = colOf(a) === colOf(b) && b - a === 3;
  return sameRow || sameCol ? mk('split', [a, b]) : null;
}
export function street(row) { return row >= 0 && row <= 11 ? mk('street', [1, 2, 3].map(c => row * 3 + c)) : null; }
export function trio(b) { return b === 1 ? mk('trio', [0, 1, 2]) : b === 2 ? mk('trio', [0, 2, 3]) : null; }  // b = 1 → 0-1-2, b = 2 → 0-2-3
// corner by its lowest number: n, n+1, n+3, n+4 (n not in column 3)
export function corner(n) { return n >= 1 && n <= 32 && colOf(n) !== 2 ? mk('corner', [n, n + 1, n + 3, n + 4]) : null; }
export function firstFour() { return mk('four', [0, 1, 2, 3]); }
// six line: rows r and r+1
export function line(row) { return row >= 0 && row <= 10 ? mk('line', Array.from({ length: 6 }, (_, i) => row * 3 + 1 + i)) : null; }
export function column(c) { return c >= 0 && c <= 2 ? mk('column', Array.from({ length: 12 }, (_, i) => i * 3 + c + 1), `column:${c + 1}`) : null; }
export function dozen(d) { return d >= 0 && d <= 2 ? mk('dozen', Array.from({ length: 12 }, (_, i) => d * 12 + i + 1), `dozen:${d + 1}`) : null; }
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export function even(kind) {
  const sets = {
    red: [...REDS], black: range(1, 36).filter(n => !REDS.has(n)),
    odd: range(1, 36).filter(n => n % 2), even: range(1, 36).filter(n => !(n % 2)),
    low: range(1, 18), high: range(19, 36)
  };
  return sets[kind] ? mk(kind, sets[kind], kind) : null;
}

// Every legal bet on the layout, keyed by id.
let catalog = null;
export function allBets() {
  if (catalog) return catalog;
  const list = [];
  for (let n = 0; n <= 36; n++) list.push(straight(n));
  for (let b = 1; b <= 3; b++) list.push(split(0, b));
  for (let n = 1; n <= 36; n++) { if (colOf(n) < 2) list.push(split(n, n + 1)); if (n <= 33) list.push(split(n, n + 3)); }
  for (let r = 0; r < 12; r++) list.push(street(r));
  list.push(trio(1), trio(2));
  for (let n = 1; n <= 32; n++) if (colOf(n) < 2) list.push(corner(n));
  list.push(firstFour());
  for (let r = 0; r < 11; r++) list.push(line(r));
  for (let c = 0; c < 3; c++) list.push(column(c));
  for (let d = 0; d < 3; d++) list.push(dozen(d));
  for (const k of ['red', 'black', 'odd', 'even', 'low', 'high']) list.push(even(k));
  catalog = new Map(list.map(b => [b.id, b]));
  return catalog;
}
export const betById = id => allBets().get(id) || null;

export function betName(bet) {
  if (!bet) return '';
  const nm = NAMES[bet.type];
  if (bet.type === 'straight') return `${nm} ${bet.numbers[0]}`;
  if (bet.type === 'column') return `${nm} ${bet.id.split(':')[1]}`;
  if (bet.type === 'dozen') { const d = +bet.id.split(':')[1]; return `${['1ST', '2ND', '3RD'][d - 1]} 12`; }
  if (['red', 'black', 'odd', 'even', 'low', 'high'].includes(bet.type)) return nm;
  if (bet.type === 'street' || bet.type === 'line') return `${nm} ${bet.numbers[0]}–${bet.numbers[bet.numbers.length - 1]}`;
  return `${nm} ${bet.numbers.join(' · ')}`;
}

export const wins = (bet, n) => bet.numbers.includes(n);
// what comes back for `amount` on `bet` when `n` hits (stake included; 0 on a loss)
export const returnFor = (bet, amount, n) => wins(bet, n) ? amount * (bet.pays + 1) : 0;

// Resolve a whole layout. bets: [{id, amount}] (or {bet, amount}); n: winning number.
export function settleSpin(bets, n) {
  let staked = 0, returned = 0, straightHit = false;
  const lines = [];
  for (const b of bets) {
    const bet = b.bet || betById(b.id);
    if (!bet || !(b.amount > 0)) continue;
    const back = returnFor(bet, b.amount, n);
    staked += b.amount; returned += back;
    if (back && bet.type === 'straight') straightHit = true;
    lines.push({ id: bet.id, bet, amount: b.amount, won: back > 0, returned: back, win: back ? back - b.amount : -b.amount });
  }
  return { n, color: colorOf(n), staked, returned, net: returned - staked, straightHit, lines };
}

// Limits check for a proposed amount on a bet
export function withinLimits(bet, amount) { return amount >= TABLE_MIN && amount <= maxFor(bet); }

// Exact expected return per unit staked (for tests / the rules sheet)
export function expectedReturn(bet) { return bet.numbers.length * (bet.pays + 1) / 37; }
