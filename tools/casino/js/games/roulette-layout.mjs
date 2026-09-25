// Roulette layout geometry and the tap → bet resolver. Pure math, no three.js,
// so Node can test that every point of the felt resolves to the right bet.
//
// World frame (metres): the rows of the layout run along +X (1-2-3 nearest the
// wheel, 34-35-36 furthest), the three columns run across the table along Z
// (column 3 = 3,6,…,36 on the dealer's side, column 1 on the player's side),
// then the dozens and the six even-money boxes toward the player.
import { straight, split, street, trio, corner, firstFour, line, column, dozen, even, numAt, rowOf, colOf } from '../rules/roulette.mjs';

export const CELL_U = .09;      // along a row step (X)
export const CELL_V = .105;     // across (Z), one column
export const ZERO_W = .1;       // the zero box
export const COL_W = .092;      // the "2 to 1" boxes
export const DOZ_D = .088;      // dozens depth
export const EVEN_D = .088;     // even-money depth
export const X0 = -.118;        // world x of the zero | 1-2-3 boundary
export const Z0 = -.168;        // world z of the dealer-side edge of the number grid
export const EDGE = .24;        // fraction of a cell that counts as "on the line"
export const LINE_OUT = .2;     // how far (in cells) past the column-1 edge still counts as the street line

export const GRID = {
  x0: X0, x1: X0 + 12 * CELL_U, z0: Z0, z1: Z0 + 3 * CELL_V,
  zeroX0: X0 - ZERO_W, colX1: X0 + 12 * CELL_U + COL_W,
  dozZ1: Z0 + 3 * CELL_V + DOZ_D, evenZ1: Z0 + 3 * CELL_V + DOZ_D + EVEN_D
};
export const BOUNDS = { x0: GRID.zeroX0, x1: GRID.colX1, z0: Z0, z1: GRID.evenZ1 };

// column index c (0 = column 1 … 2 = column 3) → band b (0 = dealer side … 2 = player side)
const bandOf = c => 2 - c;
const colOfBand = b => 2 - b;
// centre of a number's box in world coordinates
export function cellCentre(n) {
  if (n === 0) return [X0 - ZERO_W / 2, Z0 + 1.5 * CELL_V];
  return [X0 + (rowOf(n) + .5) * CELL_U, Z0 + (bandOf(colOf(n)) + .5) * CELL_V];
}
// rectangle [x, z, w, d] (centre + size) of each printed box
export function cellRect(n) {
  if (n === 0) return [X0 - ZERO_W / 2, Z0 + 1.5 * CELL_V, ZERO_W, 3 * CELL_V];
  const [x, z] = cellCentre(n); return [x, z, CELL_U, CELL_V];
}
export const OUTSIDE_BOXES = [
  ...[0, 1, 2].map(c => ({ id: `column:${c + 1}`, rect: [GRID.x1 + COL_W / 2, Z0 + (bandOf(c) + .5) * CELL_V, COL_W, CELL_V] })),
  ...[0, 1, 2].map(d => ({ id: `dozen:${d + 1}`, rect: [X0 + (d * 4 + 2) * CELL_U, GRID.z1 + DOZ_D / 2, 4 * CELL_U, DOZ_D] })),
  ...['low', 'even', 'red', 'black', 'odd', 'high'].map((k, i) => ({ id: k, rect: [X0 + (i * 2 + 1) * CELL_U, GRID.dozZ1 + EVEN_D / 2, 2 * CELL_U, EVEN_D] }))
];
const OUT_BY_ID = new Map(OUTSIDE_BOXES.map(o => [o.id, o]));

// Where the chips for a bet sit (world x,z)
export function betSpot(bet) {
  const t = bet.type, ns = bet.numbers;
  if (t === 'straight') return cellCentre(ns[0]);
  if (OUT_BY_ID.has(bet.id)) { const r = OUT_BY_ID.get(bet.id).rect; return [r[0], r[1]]; }
  if (t === 'split' && ns[0] === 0) return [X0, cellCentre(ns[1])[1]];
  if (t === 'trio') return [X0, Z0 + (ns.includes(1) ? 2 : 1) * CELL_V];
  if (t === 'four') return [X0, GRID.z1];
  if (t === 'street') return [X0 + (rowOf(ns[0]) + .5) * CELL_U, GRID.z1];
  if (t === 'line') return [X0 + (rowOf(ns[0]) + 1) * CELL_U, GRID.z1];
  // split / corner: the average of the covered box centres lands on the shared line / intersection
  const cs = ns.map(cellCentre);
  return [cs.reduce((a, c) => a + c[0], 0) / cs.length, cs.reduce((a, c) => a + c[1], 0) / cs.length];
}

// Resolve a point on the felt into a bet (or null).
export function betAt(x, z) {
  const a = (x - X0) / CELL_U, b = (z - Z0) / CELL_V;
  const zeroCells = ZERO_W / CELL_U, colCells = COL_W / CELL_U;
  const gridB1 = 3, dozB1 = 3 + DOZ_D / CELL_V, evenB1 = dozB1 + EVEN_D / CELL_V;
  if (b < -.12 || b > evenB1 || a < -zeroCells || a > 12 + colCells) return null;
  const bb = Math.max(0, b);
  // ── the street line: the outer edge of column 1 ──
  const onLine = bb > gridB1 - EDGE && bb < gridB1 + LINE_OUT && a > -EDGE && a < 12;
  if (onLine) {
    const i = Math.min(11, Math.floor(Math.max(0, a))), fa = a - i;
    if (a < EDGE) return firstFour();                                  // 0 | 1-2-3 corner of the line
    if (fa < EDGE && i > 0) return line(i - 1);
    if (fa > 1 - EDGE && i < 11) return line(i);
    return street(i);
  }
  // ── outside boxes below the grid ──
  if (bb >= gridB1) {
    if (a < 0 || a >= 12) return null;
    if (bb < dozB1) return dozen(Math.floor(a / 4));
    return even(['low', 'even', 'red', 'black', 'odd', 'high'][Math.min(5, Math.floor(a / 2))]);
  }
  const band = Math.min(2, Math.floor(bb)), fb = bb - band;
  // ── the column boxes ──
  if (a >= 12) return column(colOfBand(band));
  // ── zero and its borders ──
  if (a < EDGE) {
    if (a < -EDGE) return straight(0);
    // on the 0 | first-row boundary
    const nearUp = fb < EDGE && band > 0, nearDown = fb > 1 - EDGE && band < 2;
    if (nearUp || nearDown) {
      const b2 = nearUp ? band - 1 : band + 1;
      const pair = [numAt(0, colOfBand(band)), numAt(0, colOfBand(b2))].sort((p, q) => p - q);
      return trio(pair[0] === 1 ? 1 : 2);                              // 0-1-2 or 0-2-3
    }
    return split(0, numAt(0, colOfBand(band)));
  }
  // ── the number grid ──
  const i = Math.floor(a), fa = a - i;
  const n = numAt(i, colOfBand(band));
  const nearL = fa < EDGE && i > 0, nearR = fa > 1 - EDGE && i < 11;
  const nearUp = fb < EDGE && band > 0, nearDown = fb > 1 - EDGE && band < 2;
  const rowN = nearL ? i - 1 : nearR ? i + 1 : null;
  const bandN = nearUp ? band - 1 : nearDown ? band + 1 : null;
  if (rowN !== null && bandN !== null) {
    const r0 = Math.min(i, rowN), c0 = Math.min(colOfBand(band), colOfBand(bandN));
    return corner(numAt(r0, c0));
  }
  if (rowN !== null) return split(n, numAt(rowN, colOfBand(band)));
  if (bandN !== null) return split(n, numAt(i, colOfBand(bandN)));
  return straight(n);
}
