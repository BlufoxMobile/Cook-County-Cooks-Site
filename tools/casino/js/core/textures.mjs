// Every printed surface in the casino is drawn here, in code, at load:
// the 52-card atlas and its back, the chip faces and edges, dice pips,
// felt fibre noise. No image downloads, pixel-crisp at any size we pick.
import * as THREE from '../vendor/three.min.mjs';

export const CARD_W = 300, CARD_H = 419;          // 63 x 88 mm poker size ratio
export const RED = '#b5121b', INK = '#15161a', GOLD = '#d4af5f', GOLD_DEEP = '#a8802f';
export const FONT_DISPLAY = '"Bodoni Moda", "Didot", Georgia, serif';
export const FONT_TEXT = 'Archivo, "Helvetica Neue", Arial, sans-serif';

const SUIT_PATHS = [
  // spade
  'M50 4C50 4 6 40 6 60C6 76 19 86 33 85C41 84 46 80 48 76C47 86 42 93 33 97L67 97C58 93 53 86 52 76C54 80 59 84 67 85C81 86 94 76 94 60C94 40 50 4 50 4Z',
  // heart
  'M50 94C50 94 5 62 5 33C5 16 17 6 30 6C40 6 47 12 50 21C53 12 60 6 70 6C83 6 95 16 95 33C95 62 50 94 50 94Z',
  // diamond
  'M50 3C60 20 74 36 90 50C74 64 60 80 50 97C40 80 26 64 10 50C26 36 40 20 50 3Z',
  // club (stem only; lobes are circles)
  'M45 58C45 78 39 89 30 96L70 96C61 89 55 78 55 58Z'
];
const suitPath2D = SUIT_PATHS.map(d => new Path2D(d));

export function drawSuit(ctx, suit, x, y, size, color) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = color;
  if (suit === 3) {
    ctx.beginPath(); ctx.arc(50, 27, 21, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(27, 57, 21, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(73, 57, 21, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(50, 50, 12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fill(suitPath2D[suit]);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Stylised fox head, used on the Jacks and the card back medallion.
function foxHead(ctx, cx, cy, s, fill) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s / 100, s / 100); ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-44, -46); ctx.lineTo(-18, -20); ctx.lineTo(18, -20); ctx.lineTo(44, -46);
  ctx.lineTo(40, 2); ctx.lineTo(22, 22); ctx.lineTo(8, 44); ctx.lineTo(0, 50); ctx.lineTo(-8, 44);
  ctx.lineTo(-22, 22); ctx.lineTo(-40, 2); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.moveTo(-26, -6); ctx.lineTo(-10, 2); ctx.lineTo(-24, 6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(26, -6); ctx.lineTo(10, 2); ctx.lineTo(24, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function crown(ctx, cx, cy, s, fill) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s / 100, s / 100); ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-46, 30); ctx.lineTo(-50, -22); ctx.lineTo(-24, 4); ctx.lineTo(0, -36); ctx.lineTo(24, 4);
  ctx.lineTo(50, -22); ctx.lineTo(46, 30); ctx.closePath(); ctx.fill();
  ctx.fillRect(-46, 36, 92, 12);
  for (const x of [-50, 0, 50]) { ctx.beginPath(); ctx.arc(x, x === 0 ? -40 : -26, 7, 0, 7); ctx.fill(); }
  ctx.restore();
}
function tiara(ctx, cx, cy, s, fill) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s / 100, s / 100); ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(-48, 30);
  ctx.quadraticCurveTo(-40, -8, -22, -6); ctx.lineTo(-12, -30); ctx.lineTo(0, -48); ctx.lineTo(12, -30); ctx.lineTo(22, -6);
  ctx.quadraticCurveTo(40, -8, 48, 30); ctx.quadraticCurveTo(0, 14, -48, 30); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(9, -12); ctx.lineTo(0, 4); ctx.lineTo(-9, -12); ctx.closePath(); ctx.fill();
  ctx.restore();
}

const PIPS = {
  // [xCol (-1,0,1), yRow (0..1)] in the pip field
  2: [[0, 0], [0, 1]],
  3: [[0, 0], [0, .5], [0, 1]],
  4: [[-1, 0], [1, 0], [-1, 1], [1, 1]],
  5: [[-1, 0], [1, 0], [0, .5], [-1, 1], [1, 1]],
  6: [[-1, 0], [1, 0], [-1, .5], [1, .5], [-1, 1], [1, 1]],
  7: [[-1, 0], [1, 0], [0, .25], [-1, .5], [1, .5], [-1, 1], [1, 1]],
  8: [[-1, 0], [1, 0], [0, .25], [-1, .5], [1, .5], [0, .75], [-1, 1], [1, 1]],
  9: [[-1, 0], [1, 0], [-1, 1 / 3], [1, 1 / 3], [0, .5], [-1, 2 / 3], [1, 2 / 3], [-1, 1], [1, 1]],
  10: [[-1, 0], [1, 0], [0, 1 / 6], [-1, 1 / 3], [1, 1 / 3], [-1, 2 / 3], [1, 2 / 3], [0, 5 / 6], [-1, 1], [1, 1]]
};
export const rankLabel = r => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r));

function drawCardFace(ctx, r, s) {
  const W = CARD_W, H = CARD_H, color = (s === 1 || s === 2) ? RED : INK;
  // stock
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#fffdf8'); g.addColorStop(1, '#f1ece0');
  roundRect(ctx, 0, 0, W, H, 18); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,60,.22)'; ctx.lineWidth = 2; roundRect(ctx, 5, 5, W - 10, H - 10, 14); ctx.stroke();
  // jumbo indices
  const label = rankLabel(r);
  const index = () => {
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${label === '10' ? 70 : 84}px ${FONT_DISPLAY}`;
    ctx.fillText(label, 50, 88);
    drawSuit(ctx, s, 50, 128, 50, color);
  };
  index();
  ctx.save(); ctx.translate(W, H); ctx.rotate(Math.PI); index(); ctx.restore();

  if (r <= 10) {
    const px = [W / 2 - 52, W / 2, W / 2 + 52], y0 = 92, y1 = H - 92, size = r >= 9 ? 46 : 52;
    for (const [c, row] of PIPS[r]) {
      const x = px[c + 1], y = y0 + (y1 - y0) * row;
      if (row > .5) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI); drawSuit(ctx, s, 0, 0, size, color); ctx.restore(); }
      else drawSuit(ctx, s, x, y, size, color);
    }
  } else if (r === 14) {
    if (s === 0) {
      // the house ace
      ctx.strokeStyle = GOLD_DEEP; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 92, 0, 7); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(W / 2, H / 2, 84, 0, 7); ctx.stroke();
      drawSuit(ctx, 0, W / 2, H / 2 - 4, 124, INK);
      ctx.fillStyle = GOLD_DEEP; ctx.font = `italic 700 22px ${FONT_DISPLAY}`; ctx.textAlign = 'center';
      ctx.fillText('C³ · BLUFOX', W / 2, H / 2 + 122);
    } else drawSuit(ctx, s, W / 2, H / 2, 132, color);
  } else {
    // court cards: a lacquered panel with a gold frame
    const x = 74, y = 60, w = W - 148, h = H - 120;
    const panel = ctx.createLinearGradient(0, y, 0, y + h);
    if (color === RED) { panel.addColorStop(0, '#7d0d17'); panel.addColorStop(1, '#3c0409'); }
    else { panel.addColorStop(0, '#12306e'); panel.addColorStop(1, '#070f29'); }
    roundRect(ctx, x, y, w, h, 10); ctx.fillStyle = panel; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = GOLD; ctx.stroke();
    ctx.lineWidth = 1.5; roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 6); ctx.stroke();
    const emblem = r === 13 ? crown : r === 12 ? tiara : foxHead;
    const drawHalf = () => {
      emblem(ctx, W / 2, y + 70, 64, GOLD);
      ctx.fillStyle = '#f6e7c1'; ctx.textAlign = 'center'; ctx.font = `italic 700 74px ${FONT_DISPLAY}`;
      ctx.fillText(label, W / 2, y + 160);
    };
    drawHalf();
    ctx.save(); ctx.translate(W, H); ctx.rotate(Math.PI); drawHalf(); ctx.restore();
    ctx.strokeStyle = 'rgba(212,175,95,.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 16, H / 2); ctx.lineTo(x + w - 16, H / 2); ctx.stroke();
    drawSuit(ctx, s, W / 2, H / 2, 26, GOLD);
  }
}

function drawCardBack(ctx) {
  const W = CARD_W, H = CARD_H;
  roundRect(ctx, 0, 0, W, H, 18); ctx.fillStyle = '#f4efe3'; ctx.fill();
  const x = 14, y = 14, w = W - 28, h = H - 28;
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#123a8f'); g.addColorStop(1, '#081d52');
  roundRect(ctx, x, y, w, h, 10); ctx.fillStyle = g; ctx.fill();
  ctx.save(); roundRect(ctx, x, y, w, h, 10); ctx.clip();
  ctx.strokeStyle = 'rgba(212,175,95,.34)'; ctx.lineWidth = 1.4;
  for (let i = -H; i < W + H; i += 18) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 6); ctx.stroke();
  // medallion
  const cx = W / 2, cy = H / 2;
  const m = ctx.createRadialGradient(cx - 20, cy - 20, 10, cx, cy, 70);
  m.addColorStop(0, '#f3dc9b'); m.addColorStop(.6, '#c79a44'); m.addColorStop(1, '#7c5a1f');
  ctx.beginPath(); ctx.arc(cx, cy, 64, 0, 7); ctx.fillStyle = m; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 54, 0, 7); ctx.fillStyle = '#0b2462'; ctx.fill();
  foxHead(ctx, cx, cy - 2, 62, '#d8b366');
}

let atlasPromise = null;
// 13 columns x 5 rows: rows 0-3 are the suits, row 4 col 0 is the back.
export function cardAtlas(renderer) {
  if (atlasPromise) return atlasPromise;
  atlasPromise = (async () => {
    try { await Promise.all([document.fonts.load(`700 80px ${FONT_DISPLAY}`), document.fonts.load(`italic 700 80px ${FONT_DISPLAY}`)]); } catch {}
    const cv = document.createElement('canvas');
    cv.width = CARD_W * 13; cv.height = CARD_H * 5;
    const ctx = cv.getContext('2d');
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) {
      ctx.save(); ctx.translate((r - 2) * CARD_W, s * CARD_H); drawCardFace(ctx, r, s); ctx.restore();
    }
    ctx.save(); ctx.translate(0, 4 * CARD_H); drawCardBack(ctx); ctx.restore();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.userData.shared = true;
    return { tex, canvas: cv, cols: 13, rows: 5 };
  })();
  return atlasPromise;
}
// UV rect of a card in the atlas (three.js UV origin is bottom-left)
export function cardUV(r, s) {
  const col = r === 0 ? 0 : r - 2, row = r === 0 ? 4 : s;
  return { u0: col / 13, u1: (col + 1) / 13, v0: 1 - (row + 1) / 5, v1: 1 - row / 5 };
}
export function cardImageURL(r, s, w = 120) {
  // a small data URL of one card face for HTML (history strips, help screens)
  const src = document.createElement('canvas'); src.width = CARD_W; src.height = CARD_H;
  const c = src.getContext('2d'); if (r === 0) drawCardBack(c); else drawCardFace(c, r, s);
  const out = document.createElement('canvas'); out.width = w; out.height = Math.round(w * CARD_H / CARD_W);
  out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// ── chips ────────────────────────────────────────────────────────────────
export const DENOMS = [
  { v: 10, base: '#1d5fc2', spot: '#f4f1ea', ink: '#ffffff', label: '10' },
  { v: 25, base: '#1b7f47', spot: '#f4f1ea', ink: '#ffffff', label: '25' },
  { v: 100, base: '#17181c', spot: '#e3c77e', ink: '#e3c77e', label: '100' },
  { v: 500, base: '#5d2a93', spot: '#f4f1ea', ink: '#ffffff', label: '500' },
  { v: 1000, base: '#d9a21c', spot: '#15161a', ink: '#15161a', label: '1K' },
  { v: 5000, base: '#b4461a', spot: '#f4f1ea', ink: '#ffffff', label: '5K' },
  { v: 25000, base: '#8a0f25', spot: '#e3c77e', ink: '#f3dc9b', label: '25K' }
];
export function chipFaceCanvas(d, size = 256, forUI = false) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'), R = size / 2;
  c.translate(R, R);
  c.beginPath(); c.arc(0, 0, R * (forUI ? .98 : 1), 0, 7); c.fillStyle = d.base; c.fill();
  // edge inlays
  c.fillStyle = d.spot;
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, w = .2;
    c.beginPath(); c.arc(0, 0, R * (forUI ? .98 : 1), a - w, a + w); c.arc(0, 0, R * .8, a + w * .9, a - w * .9, true); c.closePath(); c.fill();
  }
  // inner ring
  c.beginPath(); c.arc(0, 0, R * .66, 0, 7); c.strokeStyle = 'rgba(227,199,126,.95)'; c.lineWidth = R * .035; c.stroke();
  const inner = c.createRadialGradient(-R * .2, -R * .2, R * .05, 0, 0, R * .64);
  inner.addColorStop(0, shade(d.base, 22)); inner.addColorStop(1, shade(d.base, -8));
  c.beginPath(); c.arc(0, 0, R * .62, 0, 7); c.fillStyle = inner; c.fill();
  // dashes on the ring
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = R * .02;
  for (let k = 0; k < 36; k++) { const a = k * Math.PI / 18; c.beginPath(); c.moveTo(Math.cos(a) * R * .7, Math.sin(a) * R * .7); c.lineTo(Math.cos(a) * R * .76, Math.sin(a) * R * .76); c.stroke(); }
  c.fillStyle = d.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `800 ${R * (d.label.length > 2 ? .42 : .5)}px ${FONT_TEXT}`;
  c.fillText(d.label, 0, R * .04);
  c.font = `italic 700 ${R * .15}px ${FONT_DISPLAY}`; c.globalAlpha = .75;
  c.fillText('C³', 0, R * .4);
  c.globalAlpha = 1;
  if (forUI) {
    const gl = c.createRadialGradient(-R * .35, -R * .45, 0, 0, 0, R);
    gl.addColorStop(0, 'rgba(255,255,255,.28)'); gl.addColorStop(.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,.28)');
    c.beginPath(); c.arc(0, 0, R * .98, 0, 7); c.fillStyle = gl; c.fill();
  }
  return cv;
}
export function chipEdgeCanvas(d) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 32;
  const c = cv.getContext('2d');
  c.fillStyle = d.base; c.fillRect(0, 0, 512, 32);
  c.fillStyle = d.spot;
  for (let k = 0; k < 6; k++) {
    const x0 = (k / 6) * 512 - 17;
    for (let j = 0; j < 3; j++) c.fillRect(x0 + j * 12, 0, 8, 32);
  }
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, 512, 3); c.fillRect(0, 29, 512, 3);
  return cv;
}
const chipUrlCache = new Map();
export function chipImageURL(v, size = 96) {
  const d = DENOMS.find(x => x.v === v) || DENOMS[0];
  const key = v + ':' + size;
  if (!chipUrlCache.has(key)) chipUrlCache.set(key, chipFaceCanvas(d, size * 2, true).toDataURL('image/png'));
  return chipUrlCache.get(key);
}
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16), f = pct / 100;
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

// ── dice ─────────────────────────────────────────────────────────────────
export function diceFaceCanvas(n) {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(S * .4, S * .35, 4, S / 2, S / 2, S * .75);
  g.addColorStop(0, '#e2283b'); g.addColorStop(1, '#8e0a18');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  const p = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] }[n];
  for (const [x, y] of p) {
    const rg = c.createRadialGradient(x * S - 2, y * S - 2, 1, x * S, y * S, 11);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(.8, '#e9e4da'); rg.addColorStop(1, '#b9b2a5');
    c.beginPath(); c.arc(x * S, y * S, n === 1 ? 14 : 10.5, 0, 7); c.fillStyle = rg; c.fill();
  }
  return cv;
}

// ── fabric / noise ───────────────────────────────────────────────────────
let noiseTex = null;
export function feltNoise() {
  if (noiseTex) return noiseTex;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), img = c.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 150 + Math.random() * 70 + (Math.random() < .03 ? 30 : 0);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  noiseTex = new THREE.CanvasTexture(cv);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.repeat.set(24, 24);
  return noiseTex;
}

// A felt canvas with a painter callback for the layout printing.
export function feltCanvas(w, h, base, paint) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(w / 2, h * .45, Math.min(w, h) * .1, w / 2, h / 2, Math.max(w, h) * .7);
  g.addColorStop(0, shadeHex(base, 10)); g.addColorStop(1, shadeHex(base, -28));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  if (paint) paint(c, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
export function shadeHex(hex, pct) { return shade(hex, pct); }
