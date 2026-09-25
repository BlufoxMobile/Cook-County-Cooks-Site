// Craps table: geometry of the printed layout, the felt painting, the deep
// pyramid-lined tub, bet-area hit targets and highlight glows.
// World units are metres; x right, z toward the player, felt at y = 0.
import * as THREE from '../vendor/three.min.mjs';
import { outlinePoints, brass } from '../core/tables.mjs';
import { FONT_DISPLAY, FONT_TEXT, shadeHex } from '../core/textures.mjs';

// felt outline (inside the walls)
export const TABLE = { type: 'rect', W: 2.94, D: 1.40, r: .17, zc: -.07 };
export const X0 = -1.47, X1 = 1.47, Z0 = -.77, Z1 = .63;
export const WALL_H = .12, WALL_T = .075;
export const RAIL_TOP = WALL_H + .054;               // top of the padded armrest
export const FELT = '#10346a';                       // Blufox sapphire

// ── layout regions ─────────────────────────────────────────────────────────
const PX0 = -1.38, PX1 = -.80, PXM = (PX0 + PX1) / 2;          // proposition box
const PROWS = [-.68, -.53, -.3175, -.105, .1075, .32, .50];
const NX0 = -.46, NW = .23, NZ0 = -.68, NZ1 = -.30;             // number boxes
export const BOX_X = [4, 5, 6, 8, 9, 10].map((n, i) => NX0 + NW * (i + .5));
const boxX = n => BOX_X[[4, 5, 6, 8, 9, 10].indexOf(n)];
export const PLAYER_X = .62;                                     // where your line bets sit

// bet areas: key -> list of rects [x0, z0, x1, z1]
export const AREAS = {
  pass: [[-.72, .32, 1.38, .52], [1.08, -.68, 1.38, .32]],
  dp: [[-.72, .20, 1.08, .32], [.92, -.68, 1.08, .20]],
  field: [[-.72, -.04, .92, .20]],
  come: [[NX0, NZ1, .92, -.04]],
  dc: [[-.72, NZ0, NX0, -.04]],
  anySeven: [[PX0, PROWS[0], PX1, PROWS[1]]],
  hard6: [[PX0, PROWS[1], PXM, PROWS[2]]], hard10: [[PXM, PROWS[1], PX1, PROWS[2]]],
  hard8: [[PX0, PROWS[2], PXM, PROWS[3]]], hard4: [[PXM, PROWS[2], PX1, PROWS[3]]],
  aces: [[PX0, PROWS[3], PXM, PROWS[4]]], boxcars: [[PXM, PROWS[3], PX1, PROWS[4]]],
  aceDeuce: [[PX0, PROWS[4], PXM, PROWS[5]]], yo: [[PXM, PROWS[4], PX1, PROWS[5]]],
  anyCraps: [[PX0, PROWS[5], PX1, PROWS[6]]]
};
for (const n of [4, 5, 6, 8, 9, 10]) AREAS['place' + n] = [[boxX(n) - NW / 2, NZ0, boxX(n) + NW / 2, NZ1]];
export const PROPS_CENTER = { x: PXM, z: (PROWS[0] + PROWS[6]) / 2 };
export const MAIN_CENTER = { x: (-.72 + 1.38) / 2, z: -.08 };

// where the chips for each bet sit
export function pilePos(key) {
  const m = /^(\D+)(\d*)$/.exec(key), type = m[1], n = +m[2];
  const bx = n ? boxX(n) : 0;
  switch (type) {
    case 'pass': return [PLAYER_X, .392];
    case 'passOdds': return [PLAYER_X, .466];
    case 'dp': return [PLAYER_X - .02, .26];
    case 'dpOdds': return [PLAYER_X + .048, .26];
    case 'field': return [PLAYER_X, .125];
    case 'come': return n ? [bx - .045, -.43] : [PLAYER_X, -.2];
    case 'comeOdds': return [bx + .04, -.43];
    case 'dc': return n ? [bx - .038, -.648] : [-.59, -.22];
    case 'dcOdds': return [bx + .038, -.648];
    case 'place': return [bx, -.346];
  }
  const r = AREAS[key]?.[0];
  if (!r) return [0, 0];
  // proposition boxes: chips sit toward the right of the box, clear of the print
  return [r[2] - .052, (r[1] + r[3]) / 2 + .01];
}
export const PUCK_OFF = [-.59, -.605];
export const puckOn = n => [boxX(n), -.528];
export const DEALER = new THREE.Vector3(-.15, .1, -.82);        // the house bank, under Ace
export const STICK = { x: -.1, z: -.722 };                      // the stickman keeps the dice here, in front of Ace
export const RELEASE = { x: .9, z: .56 };                        // your hand, just over the near rail

// ── felt painting ──────────────────────────────────────────────────────────
// print tones sit just under the bloom threshold, even in the key light's hotspot
const CREAM = '#eadab2', LINE = 'rgba(222,196,140,.9)', LINE_SOFT = 'rgba(222,196,140,.5)';
function goldGrad(c, x, y, h) {
  const g = c.createLinearGradient(0, y - h * .6, 0, y + h * .5);
  g.addColorStop(0, '#f6e4b4'); g.addColorStop(.45, '#dcb866'); g.addColorStop(1, '#9c6e28');
  return g;
}
function write(c, s, x, y, { size, font = FONT_TEXT, weight = 800, italic = false, color = LINE, align = 'center', rot = 0, spacing = 0, gold = false, shadow = true }) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  c.textAlign = align; c.textBaseline = 'middle';
  if (spacing && 'letterSpacing' in c) c.letterSpacing = spacing + 'px';
  if (shadow) { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = size * .08; c.shadowOffsetY = size * .03; }
  c.fillStyle = gold ? goldGrad(c, 0, 0, size) : color;
  c.fillText(s, 0, 0);
  c.restore();
}
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
// a little red die, face up, drawn in vector
export function dicePic(c, x, y, s, n) {
  c.save();
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = s * .18; c.shadowOffsetY = s * .08;
  const g = c.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
  g.addColorStop(0, '#e5303f'); g.addColorStop(1, '#8c0a16');
  rr(c, x - s / 2, y - s / 2, s, s, s * .2); c.fillStyle = g; c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = 'rgba(255,220,200,.35)'; c.lineWidth = s * .04; c.stroke();
  const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n];
  c.fillStyle = '#fbf6ec';
  for (const [a, b] of P) { c.beginPath(); c.arc(x + a * s * .26, y + b * s * .26, s * (n === 1 ? .13 : .095), 0, 7); c.fill(); }
  c.restore();
}

export function paintFelt(c, P, S) {
  const box = (x0, z0, x1, z1, { lw = S(.005), fill = 'rgba(2,8,24,.16)', color = LINE } = {}) => {
    const [a, b] = P(x0, z0), [e, f] = P(x1, z1);
    c.save(); if (fill) { c.fillStyle = fill; c.fillRect(a, b, e - a, f - b); }
    c.lineWidth = lw; c.strokeStyle = color; c.strokeRect(a, b, e - a, f - b); c.restore();
  };
  const at = (x, z) => P(x, z);
  const lwMain = S(.0055), lwFine = S(.0022);

  // subtle printed vignette & fine pinstripe border following the felt edge
  c.save();
  const [ex0, ez0] = P(X0 + .045, Z0 + .045), [ex1, ez1] = P(X1 - .045, Z1 - .045);
  rr(c, ex0, ez0, ex1 - ex0, ez1 - ez0, S(.13)); c.lineWidth = lwFine; c.strokeStyle = LINE_SOFT; c.stroke();
  const [fx0, fz0] = P(X0 + .06, Z0 + .06), [fx1, fz1] = P(X1 - .06, Z1 - .06);
  rr(c, fx0, fz0, fx1 - fx0, fz1 - fz0, S(.115)); c.lineWidth = S(.0012); c.stroke();
  c.restore();

  // ── PASS LINE (L-shape wrapping the end) ──
  const L = (pts, fill) => { c.save(); c.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = lwMain; c.strokeStyle = LINE; c.lineJoin = 'round'; c.stroke(); c.restore(); };
  const arcPts = (cx, cz, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });
  L([[-.72, .52], ...arcPts(1.38 - .2, .52 - .2, .2, Math.PI / 2, 0), [1.38, -.68], [1.08, -.68], ...arcPts(1.08 - .06, .32 - .06, .06, 0, Math.PI / 2, 6), [-.72, .32]], 'rgba(2,8,24,.1)');
  L([[-.72, .32], ...arcPts(1.08 - .06, .32 - .06, .06, Math.PI / 2, 0, 6), [1.08, -.68], [.92, -.68], [.92, .20], [-.72, .20]], 'rgba(2,8,24,.2)');
  { const [x, y] = at(.08, .42); write(c, 'Pass Line', x, y, { size: S(.098), font: FONT_DISPLAY, italic: true, weight: 600, gold: true, spacing: S(.006) }); }
  { const [x, y] = at(1.23, -.2); write(c, 'Pass Line', x, y, { size: S(.086), font: FONT_DISPLAY, italic: true, weight: 600, gold: true, rot: -Math.PI / 2, spacing: S(.006) }); }
  { const [x, y] = at(-.28, .468); write(c, 'ODDS BEHIND THE LINE ·', x, y, { size: S(.0165), color: LINE_SOFT, spacing: S(.004), shadow: false }); }
  // ── DON'T PASS BAR ──
  { const [x, y] = at(.02, .26); write(c, 'DON’T PASS BAR', x, y, { size: S(.042), color: CREAM, spacing: S(.009) }); dicePic(c, ...at(.38, .26), S(.05), 6); dicePic(c, ...at(.44, .26), S(.05), 6); }
  { const [x, y] = at(1.0, -.26); write(c, 'DON’T PASS BAR', x, y, { size: S(.036), color: CREAM, rot: -Math.PI / 2, spacing: S(.008) }); }

  // ── FIELD ──
  box(-.72, -.04, .92, .20, { lw: lwMain, fill: 'rgba(2,8,24,.1)' });
  const fnums = [2, 3, 4, 9, 10, 11, 12];
  fnums.forEach((n, i) => {
    const x = -.6 + i * .158, z = .035, [px, py] = at(x, z);
    if (n === 2 || n === 12) {
      c.save(); c.beginPath(); c.arc(px, py, S(.043), 0, 7); c.lineWidth = lwFine * 1.4; c.strokeStyle = LINE; c.stroke(); c.restore();
      const [qx, qy] = at(x, .104); write(c, n === 2 ? 'PAYS DOUBLE' : 'PAYS TRIPLE', qx, qy, { size: S(.0155), color: LINE, spacing: S(.003), shadow: false });
    } else if (i < 6) { const [qx, qy] = at(x + .079, z); write(c, '·', qx, qy, { size: S(.05), color: LINE_SOFT, shadow: false }); }
    write(c, String(n), px, py, { size: S(n >= 10 ? .062 : .07), font: FONT_DISPLAY, weight: 700, color: CREAM });
  });
  { const [x, y] = at(.12, .155); write(c, 'Field', x, y, { size: S(.07), font: FONT_DISPLAY, italic: true, weight: 600, gold: true, spacing: S(.012) }); }

  // ── COME ──
  box(NX0, NZ1, .92, -.04, { lw: lwMain, fill: 'rgba(2,8,24,.07)' });
  { const [x, y] = at(.16, -.17); write(c, 'Come', x, y, { size: S(.2), font: FONT_DISPLAY, italic: true, weight: 600, gold: true, spacing: S(.01) }); }

  // ── DON'T COME BAR ──
  box(-.72, NZ0, NX0, -.04, { lw: lwMain, fill: 'rgba(2,8,24,.2)' });
  { const x = -.59; for (const [w, z] of [['DON’T', -.44], ['COME', -.385], ['BAR', -.33]]) { const [px, py] = at(x, z); write(c, w, px, py, { size: S(.042), color: CREAM, spacing: S(.008) }); } dicePic(c, ...at(-.62, -.265), S(.048), 6); dicePic(c, ...at(-.56, -.265), S(.048), 6); }

  // ── place numbers ──
  [4, 5, 6, 8, 9, 10].forEach(n => {
    const x = boxX(n);
    box(x - NW / 2, NZ0, x + NW / 2, NZ1, { lw: lwMain, fill: 'rgba(2,8,24,.14)' });
    const [a, b] = at(x - NW / 2, -.615), [e] = at(x + NW / 2, -.615);
    c.save(); c.beginPath(); c.moveTo(a, b); c.lineTo(e, b); c.lineWidth = lwFine; c.strokeStyle = LINE_SOFT; c.stroke(); c.restore();
    const lbl = { 6: 'SIX', 9: 'NINE' }[n] || String(n), [px, py] = at(x, -.528);
    write(c, lbl, px, py, { size: S(lbl.length > 2 ? .07 : .105), font: FONT_DISPLAY, weight: 700, color: CREAM, spacing: lbl.length > 2 ? S(.004) : 0 });
    const pay = { 4: '9:5', 10: '9:5', 5: '7:5', 9: '7:5', 6: '7:6', 8: '7:6' }[n], [qx, qy] = at(x + NW / 2 - .018, -.318);
    write(c, pay, qx, qy, { size: S(.018), color: LINE_SOFT, align: 'right', shadow: false });
  });

  // ── proposition box ──
  const [pa, pb] = at(PX0 - .015, PROWS[0] - .015), [pe, pf] = at(PX1 + .015, PROWS[6] + .015);
  c.save(); rr(c, pa, pb, pe - pa, pf - pb, S(.03)); c.lineWidth = lwFine; c.strokeStyle = LINE_SOFT; c.stroke(); c.restore();
  const prop = (key, lines) => { const [x0, z0, x1, z1] = AREAS[key][0]; box(x0, z0, x1, z1, { lw: S(.0045), fill: 'rgba(2,8,24,.2)' }); lines(x0, z0, x1, z1, (x1 + x0) / 2, (z0 + z1) / 2); };
  prop('anySeven', (x0, z0, x1, z1, cx, cz) => {
    const [a, b] = at(cx - .07, cz), [d, e] = at(cx + .145, cz);
    write(c, 'SEVEN', a, b, { size: S(.056), font: FONT_DISPLAY, weight: 700, color: '#ff6b73', spacing: S(.01) });
    write(c, '4 TO 1', d, e, { size: S(.022), color: LINE, spacing: S(.003) });
  });
  prop('anyCraps', (x0, z0, x1, z1, cx, cz) => {
    const [a, b] = at(cx - .06, cz - .012), [d, e] = at(cx - .06, cz + .042);
    write(c, 'ANY CRAPS', a, b, { size: S(.043), color: '#ff6b73', spacing: S(.008) });
    write(c, '7 TO 1', d, e, { size: S(.02), color: LINE, spacing: S(.003) });
  });
  const hardBox = (key, n, pays) => prop(key, (x0, z0, x1, z1, cx, cz) => {
    const s = S(.046), dx = -.045; dicePic(c, ...at(cx + dx - .03, cz - .02), s, n / 2); dicePic(c, ...at(cx + dx + .03, cz - .02), s, n / 2);
    const [a, b] = at(cx + dx, cz + .058); write(c, `${pays} TO 1`, a, b, { size: S(.021), color: LINE, spacing: S(.003) });
    const [g, h] = at(cx + dx, cz - .077); write(c, `HARD ${n}`, g, h, { size: S(.0165), color: LINE_SOFT, spacing: S(.004), shadow: false });
  });
  hardBox('hard6', 6, 9); hardBox('hard10', 10, 7); hardBox('hard8', 8, 9); hardBox('hard4', 4, 7);
  const pairBox = (key, a1, a2, pays, name) => prop(key, (x0, z0, x1, z1, cx, cz) => {
    const s = S(.042), dx = -.045; dicePic(c, ...at(cx + dx - .027, cz - .01), s, a1); dicePic(c, ...at(cx + dx + .027, cz - .01), s, a2);
    const [a, b] = at(cx + dx, cz + .058); write(c, `${pays} TO 1`, a, b, { size: S(.02), color: LINE, spacing: S(.003) });
    const [g, h] = at(cx + dx, cz - .066); write(c, name, g, h, { size: S(.0155), color: LINE_SOFT, spacing: S(.004), shadow: false });
  });
  pairBox('aces', 1, 1, 30, 'ACES'); pairBox('boxcars', 6, 6, 30, 'BOXCARS'); pairBox('aceDeuce', 1, 2, 15, 'ACE-DEUCE'); pairBox('yo', 5, 6, 15, 'YO-ELEVEN');
  { const [x, y] = at(PXM, .565); write(c, 'BLUFOX · C³', x, y, { size: S(.022), font: FONT_DISPLAY, italic: true, weight: 600, color: LINE_SOFT, spacing: S(.01), shadow: false }); }
  { const [x, y] = at(PXM, -.715); write(c, 'PROPOSITIONS · ONE ROLL', x, y, { size: S(.0145), color: LINE_SOFT, spacing: S(.005), shadow: false }); }
}

// ── the tub: pyramid-lined walls, lacquered rail top, leather armrest ───────
const texCache = {};
function pyramidTextures() {
  if (texCache.pyr) return texCache.pyr;
  const W = 256, H = 128, cell = 64, nrm = document.createElement('canvas'), col = document.createElement('canvas');
  nrm.width = col.width = W; nrm.height = col.height = H;
  const n = nrm.getContext('2d'), k = col.getContext('2d');
  n.fillStyle = 'rgb(128,128,255)'; n.fillRect(0, 0, W, H);
  k.fillStyle = '#17130f'; k.fillRect(0, 0, W, H);
  const tilt = .62, s = Math.sin(tilt), cs = Math.cos(tilt);
  const facets = [[[1, 0], [0, -1], [.7071, -.7071]], [[0, 1], [1, 0], [.7071, .7071]], [[-1, 0], [0, 1], [-.7071, .7071]], [[0, -1], [-1, 0], [-.7071, -.7071]]];
  const shade = [1.25, .7, .55, 1.05];
  for (let row = -1; row <= H / (cell / 2) + 1; row++) for (let col2 = -1; col2 <= W / cell + 1; col2++) {
    const cx = col2 * cell + (row % 2 ? cell / 2 : 0), cy = row * cell / 2, a = cell / 2, b = cell / 2;
    facets.forEach(([p1, p2, d], fi) => {
      const path = () => { n.beginPath(); n.moveTo(cx, cy); n.lineTo(cx + p1[0] * a, cy + p1[1] * b); n.lineTo(cx + p2[0] * a, cy + p2[1] * b); n.closePath(); };
      const nx = d[0] * s, ny = -d[1] * s, nz = cs;                  // texture y is up in tangent space
      path(); n.fillStyle = `rgb(${Math.round((nx * .5 + .5) * 255)},${Math.round((ny * .5 + .5) * 255)},${Math.round((nz * .5 + .5) * 255)})`; n.fill();
      k.beginPath(); k.moveTo(cx, cy); k.lineTo(cx + p1[0] * a, cy + p1[1] * b); k.lineTo(cx + p2[0] * a, cy + p2[1] * b); k.closePath();
      const v = Math.round(22 * shade[fi]); k.fillStyle = `rgb(${v + 6},${v + 3},${v})`; k.fill();
    });
    k.strokeStyle = 'rgba(200,160,90,.18)'; k.lineWidth = 1.2; k.beginPath(); k.moveTo(cx - a, cy); k.lineTo(cx, cy - b); k.lineTo(cx + a, cy); k.lineTo(cx, cy + b); k.closePath(); k.stroke();
  }
  const tn = new THREE.CanvasTexture(nrm), tc = new THREE.CanvasTexture(col);
  tc.colorSpace = THREE.SRGBColorSpace;
  for (const t of [tn, tc]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return texCache.pyr = { normal: tn, color: tc };
}
function woodTexture() {
  if (texCache.wood) return texCache.wood;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 64;
  const c = cv.getContext('2d'); c.fillStyle = '#1d0e07'; c.fillRect(0, 0, 1024, 64);
  for (let i = 0; i < 140; i++) {
    c.strokeStyle = `rgba(${80 + Math.random() * 60},${38 + Math.random() * 26},${16 + Math.random() * 10},${.07 + Math.random() * .12})`;
    c.lineWidth = .8 + Math.random() * 2.2; c.beginPath(); const y = Math.random() * 64;
    c.moveTo(0, y); c.bezierCurveTo(340, y + Math.random() * 12 - 6, 680, y + Math.random() * 12 - 6, 1024, y + Math.random() * 6 - 3); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return texCache.wood = t;
}
const matCache = {};
function mats(tier) {
  if (matCache.m) return matCache.m;
  const pyr = pyramidTextures(), wood = woodTexture();
  return matCache.m = {
    pyramid: new THREE.MeshStandardMaterial({ map: pyr.color, normalMap: tier === 'low' ? null : pyr.normal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: .42, metalness: .25, envMapIntensity: .9 }),
    top: new THREE.MeshPhysicalMaterial({ map: wood, color: 0x8a6a55, roughness: .3, clearcoat: 1, clearcoatRoughness: .1, envMapIntensity: .9 }),
    wood: new THREE.MeshPhysicalMaterial({ map: wood, roughness: .38, clearcoat: .8, clearcoatRoughness: .18, envMapIntensity: .7 }),
    leather: new THREE.MeshPhysicalMaterial({ color: 0x0f0f12, roughness: .48, clearcoat: .4, clearcoatRoughness: .4, sheen: .5, sheenColor: new THREE.Color(0x2c2a33), sheenRoughness: .55, envMapIntensity: .8 })
  };
}
function loop(d) { return outlinePoints({ ...TABLE, W: TABLE.W + 2 * d, D: TABLE.D + 2 * d, r: TABLE.r + d }); }
// a strip between two loops (y0 on loop a, y1 on loop b); faces toward `side` (+1 inward/up)
function strip(a, b, ya, yb, { uScale = 1, vScale = 1, inward = true }) {
  const n = a.length, pos = [], uv = [], idx = [];
  let len = 0;
  const cx = (X0 + X1) / 2, cz = TABLE.zc;
  for (let i = 0; i <= n; i++) {
    const p = a[i % n], q = b[i % n];
    if (i) len += Math.hypot(p[0] - a[(i - 1) % n][0], p[1] - a[(i - 1) % n][1]);
    pos.push(p[0], ya, p[1], q[0], yb, q[1]);
    uv.push(len * uScale, 0, len * uScale, vScale);
  }
  // winding: is the loop's left-hand normal pointing at the centre?
  const [p0, p1] = [a[0], a[1]], tx = p1[0] - p0[0], tz = p1[1] - p0[1];
  const leftIn = (-tz) * (cx - p0[0]) + tx * (cz - p0[1]) > 0;
  const flip = leftIn !== inward;
  for (let i = 0; i < n; i++) {
    const A = i * 2, B = A + 1, C = A + 2, D = A + 3;
    if (!flip) idx.push(A, C, B, B, C, D); else idx.push(A, B, C, B, D, C);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export function buildTub(stage, parent) {
  const m = mats(stage.tier), g = new THREE.Group();
  const own = (mesh, { cast = true, recv = true } = {}) => { mesh.userData.ownGeo = true; mesh.castShadow = cast; mesh.receiveShadow = recv; g.add(mesh); return mesh; };
  const inner = loop(.001), top = loop(WALL_T), outer = loop(WALL_T + .012);
  // inner wall: the pyramid rubber the dice bounce off
  own(new THREE.Mesh(strip(inner, inner, -.002, WALL_H, { uScale: 1 / .16, vScale: WALL_H / .08 }), m.pyramid), { cast: false });
  // lacquered rail top
  own(new THREE.Mesh(strip(inner, top, WALL_H, WALL_H, { uScale: 1 / 1.2, vScale: .06, inward: false }), m.top), { cast: false });
  // brass lip on the inner top edge
  const lip = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(inner.map(([x, z]) => new THREE.Vector3(x, WALL_H, z)), true, 'centripetal'), 420, .0048, 8, true), brass());
  own(lip, { cast: false });
  // padded armrest
  const arm = loop(WALL_T - .004).map(([x, z]) => new THREE.Vector3(x, WALL_H + .024, z));
  own(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arm, true, 'centripetal'), 480, .031, stage.tier === 'low' ? 10 : 20, true), m.leather));
  // cabinet side
  own(new THREE.Mesh(strip(outer, outer, -.34, WALL_H + .01, { uScale: 1 / 1.5, vScale: 1, inward: false }), m.wood), { cast: false });
  parent.add(g);
  return g;
}

// ── the stick: a polished wooden dowel with a flat hook at the tip ─────────
// Local frame: the hook sits at the origin, the shaft runs along +Z to the handle.
// Point it with group.lookAt(handle) and stretch with setLength(d).
export function makeStick(stage) {
  const g = new THREE.Group();
  const wood = new THREE.MeshPhysicalMaterial({ color: 0x4a2a14, roughness: .32, clearcoat: .9, clearcoatRoughness: .2, envMapIntensity: .8 });
  const shaftGeo = new THREE.CylinderGeometry(.0052, .0062, 1, 12, 1); shaftGeo.rotateX(Math.PI / 2); shaftGeo.translate(0, 0, .5);
  const shaft = new THREE.Mesh(shaftGeo, wood); shaft.castShadow = true; shaft.userData.ownGeo = shaft.userData.ownMat = true;
  const hookGeo = new THREE.TorusGeometry(.024, .0045, 8, 20, Math.PI * 1.15);
  const hook = new THREE.Mesh(hookGeo, wood); hook.castShadow = true; hook.userData.ownGeo = true;
  hook.rotation.set(Math.PI / 2, 0, Math.PI * .92); hook.position.set(0, 0, .02);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.0065, 10, 8), brassLike()); cap.userData.ownGeo = true;
  g.add(shaft, hook, cap);
  g.userData.setLength = d => { shaft.scale.z = d; };
  g.visible = false;
  return g;
}
function brassLike() { return matCache.brassLike ||= new THREE.MeshStandardMaterial({ color: 0xd2a653, metalness: 1, roughness: .3 }); }

// ── highlight glows (additive, soft rounded-rect) ─────────────────────────
const glowTex = new Map();
function glowTexture(w, d) {
  const key = Math.round(w * 50) + 'x' + Math.round(d * 50);
  if (glowTex.has(key)) return glowTex.get(key);
  const px = 420, cw = Math.max(32, Math.round(w * px)), ch = Math.max(32, Math.round(d * px));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const c = cv.getContext('2d'), pad = 14;
  c.shadowColor = '#fff'; c.shadowBlur = 12;
  c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 5; rr(c, pad, pad, cw - pad * 2, ch - pad * 2, 10); c.stroke();
  c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.16)'; c.fill();
  const t = new THREE.CanvasTexture(cv); glowTex.set(key, t);
  return t;
}
export function glowArea(parent, rects, color = 0xf3d58a) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  for (const [x0, z0, x1, z1] of rects) {
    const w = x1 - x0 + .03, d = z1 - z0 + .03, m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.clone());
    m.material.map = glowTexture(w, d); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, .0025, (z0 + z1) / 2);
    m.userData.ownGeo = true; m.renderOrder = 2; g.add(m);
  }
  g.userData.setOpacity = o => { for (const m of g.children) m.material.opacity = o; g.visible = o > .002; };
  g.userData.setOpacity(0);
  parent.add(g);
  return g;
}
// invisible hit targets for a bet area
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
export function hitArea(parent, rects, data) {
  return rects.map(([x0, z0, x1, z1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), hitMat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, .003, (z0 + z1) / 2);
    m.userData = { ...data, ownGeo: true }; parent.add(m); return m;
  });
}
export { shadeHex };
