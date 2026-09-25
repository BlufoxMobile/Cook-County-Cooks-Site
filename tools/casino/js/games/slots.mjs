// MIDNIGHT FOX — a 3D video slot in the lounge. Five real reel drums spin
// behind glass in a lacquer-and-gold cabinet; outcomes come from the crypto
// RNG (reel stops) and the math in js/rules/slots.mjs (95.97% RTP, exact).
import * as THREE from '../vendor/three.min.mjs';
import { Game } from './base.mjs';
import { fmt } from '../core/hud.mjs';
import { FONT_DISPLAY, FONT_TEXT } from '../core/textures.mjs';
import { buildCabinet, machineStage, disposeTree, own, canvasTex, makeCanvas, goldGrad, spaced, loadFonts, glowTexture, frameGlowTexture, additive } from './machine-cabinet.mjs';
import { CoinShower, nudge } from './machine-fx.mjs';
import { REELS, LINES, PAYS, SCATTER_PAYS, FREE_SPINS, FS_MULT, FS_CAP, NLINES, LINE_BETS, SYM, SYMBOLS, spinStops, windowOf, evaluate, tierFor, playFeature } from '../rules/slots.mjs';

// ── geometry of the reel window (metres, face coordinates) ──
const CELL_W = .118, CELL_H = .116, RAD = .3, GAP = .008, TH = CELL_H / RAD;
const REEL_X = i => (i - 2) * (CELL_W + GAP);
const OPEN_W = 5 * CELL_W + 4 * GAP + .02, OPEN_H = 2 * RAD * Math.sin(TH * 1.6);
const Z_AXIS = -.024 - RAD;
const rowAngle = row => (1 - row) * TH;
const rowY = row => RAD * Math.sin(rowAngle(row));
const LCD_H = .062, BAND_H = .03;
const CAB_W = .74;
const VIEW = {
  landscape: { pos: [0, .12, 1.75], look: [0, .12, 0], fov: 32 },
  portrait: { pos: [0, .1, 1.62], look: [0, .1, 0], fov: 44, fitWidth: .7, maxFov: 62 }
};
const ROOM = { landscape: { z: -2.5, railY: -1.25, width: 8.6 }, portrait: { z: -1.9, railY: -1.6, width: 10.5 } };
const LINE_COLORS = ['#ffd24a', '#4fd6ff', '#ff5a7a', '#7dff8a', '#c38bff', '#ff9a3c', '#3cffd0', '#ff6be0', '#b8ff3c', '#6b8cff',
  '#ffe08a', '#39b8ff', '#ff8c8c', '#9dffb9', '#e0a8ff', '#ffc070', '#7afff0', '#ff9ad6', '#e4ff7a', '#9ab0ff'];
const THEME = {
  base: { ledA: '#ffcf6a', ledB: '#ff6a1f', bg0: '#16244e', bg1: '#060913', key: 0xffdcae },
  free: { ledA: '#5fb4ff', ledB: '#2437ff', bg0: '#0f2f78', bg1: '#040a24', key: 0xb9d2ff }
};

// ── symbol atlas: 4×4 cells of 256px; 0–8 from symbols.webp, 9–13 drawn here ──
const ROYAL = {
  [SYM.A]: { t: 'A', c: ['#ffb3bd', '#ee2946', '#8d0a1f', '#3d020b'] },
  [SYM.K]: { t: 'K', c: ['#c4dcff', '#3b7bff', '#1437a6', '#07134a'] },
  [SYM.Q]: { t: 'Q', c: ['#c6ffe6', '#22d18d', '#0b7a4f', '#033222'] },
  [SYM.J]: { t: 'J', c: ['#f1d4ff', '#b25cff', '#6a1fb0', '#2b0850'] },
  [SYM.T]: { t: '10', c: ['#ffe7b8', '#ffab2e', '#c2600a', '#512002'] }
};
function drawRoyal(ctx, x, y, S, def) {
  const layer = makeCanvas(S, S), c = layer.getContext('2d');
  const two = def.t.length > 1, fs = two ? S * .6 : S * .74;
  c.translate(S / 2, S / 2); if (two) c.scale(.8, 1);
  c.font = `900 ${fs}px ${FONT_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const yo = fs * .05;
  c.lineJoin = 'round';
  c.shadowColor = 'rgba(0,0,0,.75)'; c.shadowBlur = S * .06; c.shadowOffsetY = S * .025;
  c.lineWidth = S * .085; c.strokeStyle = '#3a2508'; c.strokeText(def.t, 0, yo);
  c.shadowColor = 'transparent';
  c.lineWidth = S * .06; c.strokeStyle = goldGrad(c, -fs * .5, fs * .5, ['#fff6d6', '#f6d27c', '#b9862f', '#f3cd72', '#7d5718']); c.strokeText(def.t, 0, yo);
  c.lineWidth = S * .012; c.strokeStyle = 'rgba(255,248,220,.9)'; c.strokeText(def.t, 0, yo);
  // jewel fill on its own layer so the gloss stays inside the letter
  const fill = makeCanvas(S, S), f = fill.getContext('2d');
  f.translate(S / 2, S / 2); if (two) f.scale(.8, 1);
  f.font = c.font; f.textAlign = 'center'; f.textBaseline = 'middle';
  const g = f.createLinearGradient(0, -fs * .45, 0, fs * .45);
  g.addColorStop(0, def.c[0]); g.addColorStop(.28, def.c[1]); g.addColorStop(.7, def.c[2]); g.addColorStop(1, def.c[3]);
  f.fillStyle = g; f.fillText(def.t, 0, yo);
  f.globalCompositeOperation = 'source-atop';
  const gl = f.createLinearGradient(0, -fs * .5, 0, fs * .05); gl.addColorStop(0, 'rgba(255,255,255,.75)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  f.fillStyle = gl; f.beginPath(); f.ellipse(-fs * .05, -fs * .2, fs * .55, fs * .26, -.2, 0, 7); f.fill();
  f.fillStyle = 'rgba(255,255,255,.18)'; for (let k = -3; k < 4; k++) { f.beginPath(); f.moveTo(k * fs * .16, -fs); f.lineTo(k * fs * .16 + fs * .05, -fs); f.lineTo(k * fs * .16 - fs * .25, fs); f.lineTo(k * fs * .16 - fs * .3, fs); f.fill(); }
  c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(fill, 0, 0);
  // a glint
  c.translate(S * .26, S * .2); c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath();
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? S * .012 : S * .06; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill();
  ctx.drawImage(layer, x, y);
}
async function buildAtlas(renderer) {
  const S = 256, cv = makeCanvas(S * 4, S * 4), ctx = cv.getContext('2d');
  let img = null;
  try { img = new Image(); img.src = new URL('../../assets/img/symbols.webp', import.meta.url).href; await img.decode(); } catch { img = null; }
  for (let i = 0; i < 14; i++) {
    const x = (i % 4) * S, y = Math.floor(i / 4) * S;
    if (i <= 8) {
      if (img) ctx.drawImage(img, (i % 3) * 256, Math.floor(i / 3) * 256, 256, 256, x + 12, y + 12, S - 24, S - 24);
      else { ctx.fillStyle = ['#d4af5f', '#2a63d4', '#c8a040', '#d0414b', '#e0b050', '#d4af5f', '#9fd3c7', '#c3122c', '#1d5fc2'][i]; ctx.beginPath(); ctx.arc(x + S / 2, y + S / 2, S * .38, 0, 7); ctx.fill(); }
    } else drawRoyal(ctx, x, y, S, ROYAL[i]);
  }
  const tex = canvasTex(cv, { aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
  tex.premultiplyAlpha = true;
  return { tex, canvas: cv, img };
}
function symbolURL(atlas, s, px = 64) {
  const out = makeCanvas(px, px), c = out.getContext('2d');
  c.drawImage(atlas.canvas, (s % 4) * 256, Math.floor(s / 4) * 256, 256, 256, 0, 0, px, px);
  return out.toDataURL('image/png');
}

// ── the reel drum shader ──
const REEL_VS = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const REEL_FS = `
uniform sampler2D atlas; uniform float strip[40]; uniform float L; uniform float pos; uniform float theta; uniform float width;
uniform float blur; uniform float dim; uniform vec3 bg0; uniform vec3 bg1; uniform float glow; uniform vec3 glowCol;
varying vec3 vP;
vec4 cellAt(float s, float u, vec2 gx, vec2 gy){
  float ci = mod(floor(s), L);
  float sym = strip[int(ci)];
  float f = fract(s);
  vec2 cell = vec2(mod(sym, 4.), floor(sym / 4. + .01));
  vec2 uv = vec2((cell.x + u) * .25, 1. - (cell.y + f) * .25);
  return textureGrad(atlas, uv, gx, gy);
}
void main(){
  float a = atan(vP.y, vP.z);
  float s = pos + .5 - a / theta;
  float u = clamp(vP.x / width + .5, .002, .998);
  vec2 gx = vec2(dFdx(u), -dFdx(s)) * .25, gy = vec2(dFdy(u), -dFdy(s)) * .25;
  vec4 c = vec4(0.);
  if (blur < .02) c = cellAt(s, u, gx, gy);
  else { for (int k = 0; k < 9; k++) c += cellAt(s + (float(k) / 8. - .5) * blur, u, gx, gy); c /= 9.; }
  float e = abs(a);
  vec3 bg = mix(bg0, bg1, smoothstep(0., .7, e));
  bg += bg0 * .5 * exp(-pow((u - .5) * 3.2, 2.)) * (1. - smoothstep(0., .5, e));
  bg *= 1. - .45 * smoothstep(.36, .5, abs(u - .5));
  vec3 col = bg * (1. - c.a) + c.rgb;
  col *= (1. - .7 * smoothstep(.2, .66, e)) * dim;
  col += glowCol * glow * (.2 + .8 * smoothstep(.62, .1, e)) * .4;
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function reelGeometry() {
  const span = TH * 1.85 * 2, g = new THREE.PlaneGeometry(CELL_W, span * RAD, 1, 64), p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const a = p.getY(i) / RAD; p.setY(i, RAD * Math.sin(a)); p.setZ(i, RAD * Math.cos(a)); n.setXYZ(i, 0, Math.sin(a), Math.cos(a)); }
  return g;
}
const outQuad = t => t * (2 - t);
const outBackSoft = t => { const c1 = 1.1, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

class Reel {
  constructor(i, atlasTex, geo, theme) {
    this.i = i; this.strip = REELS[i]; this.L = this.strip.length;
    const arr = new Float32Array(40); this.strip.forEach((s, k) => { arr[k] = s; });
    this.u = {
      atlas: { value: atlasTex }, strip: { value: arr }, L: { value: this.L }, pos: { value: 0 }, theta: { value: TH }, width: { value: CELL_W },
      blur: { value: 0 }, dim: { value: 1 }, bg0: { value: new THREE.Color(theme.bg0) }, bg1: { value: new THREE.Color(theme.bg1) }, glow: { value: 0 }, glowCol: { value: new THREE.Color(0x3f8cff) }
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: REEL_VS, fragmentShader: REEL_FS }));
    this.mesh.userData.ownMat = true;
    this.mesh.position.set(REEL_X(i), 0, Z_AXIS);
    this.pos = 0; this.speed = 0; this.state = 'idle'; this.vmax = 21;
  }
  setStop(topIndex) { this.pos = (topIndex + 1) % this.L; this.u.pos.value = this.pos; }
  start(delay) { this.state = 'wait'; this.t = -delay; this.target = null; this.vmax = 21; }
  requestStop(topIndex, onLand) {
    this.target = topIndex + 1; this.onLand = onLand;
    // Re-phase the strip under full motion blur so the stop begins at once (the
    // jump is invisible at speed — real video reels swap their strips the same way).
    if (this.state === 'spin' && this.speed > 10) {
      const frac = this.pos - Math.floor(this.pos), k = Math.round((this.pos - this.target) / this.L);
      this.pos = this.target + k * this.L + 2.2 + frac;
    }
  }
  update(dt) {
    switch (this.state) {
      case 'wait': this.t += dt; if (this.t >= 0) { this.state = 'kick'; this.t = 0; this.p0 = this.pos; } break;
      case 'kick': { this.t += dt; const k = Math.min(1, this.t / .13); this.pos = this.p0 + .24 * Math.sin(k * Math.PI / 2); if (k >= 1) { this.state = 'spin'; this.speed = 2; } break; }
      case 'spin': {
        this.speed += (this.vmax - this.speed) * Math.min(1, dt * 6);
        this.pos -= this.speed * dt;
        if (this.target !== null) {
          // choose the landing index P ≡ target (mod L) far enough below to decelerate into
          let P = this.target + Math.floor((this.pos - 1.6 - this.target) / this.L) * this.L;
          this.P = P; this.state = 'run';
        }
        break;
      }
      case 'run': {
        const over = .3, D = this.pos - (this.P - over);
        if (D <= 1.9) { this.state = 'decel'; this.t = 0; this.s0 = this.pos; this.D = D; this.T = Math.max(.12, 2 * D / Math.max(4, this.speed)); this.v0 = this.speed; }
        else { this.speed += (this.vmax - this.speed) * Math.min(1, dt * 6); this.pos -= this.speed * dt; }
        break;
      }
      case 'decel': {
        this.t += dt; const k = Math.min(1, this.t / this.T);
        this.pos = this.s0 - this.D * outQuad(k); this.speed = this.v0 * (1 - k);
        if (k >= 1) { this.state = 'bounce'; this.t = 0; this.onThunk?.(this); }
        break;
      }
      case 'bounce': {
        this.t += dt; const k = Math.min(1, this.t / .26), over = .3;
        this.pos = this.P - over * (1 - outBackSoft(k)); this.speed = 0;
        if (k >= 1) { this.pos = ((this.P % this.L) + this.L) % this.L; this.state = 'idle'; const f = this.onLand; this.onLand = null; f?.(this); }
        break;
      }
    }
    this.u.pos.value = this.pos;
    this.u.blur.value = Math.max(0, Math.min(1, (this.speed - 3) / 15)) * .95;
  }
  get spinning() { return this.state !== 'idle'; }
}

export default class Slots extends Game {
  static id = 'slots';

  async enter(first) {
    const { stage } = this;
    this.lineBetIdx = Math.max(0, Math.min(LINE_BETS.length - 1, this.bank.setting('slotBetIdx') ?? 2));
    this.phase = 'boot'; this.clock = 0; this.theme = THEME.base; this.fs = null; this.auto = null; this.pending = null;
    this.backdrop.setRoom('empty');
    this.restoreStage = machineStage(stage, this.backdrop);
    this.placeRoom();
    await loadFonts();
    if (!this.alive) return;
    this.atlas = await buildAtlas(stage.renderer);
    if (!this.alive) return;
    this.buildMachine();
    this.fx = new CoinShower(stage, this.root);
    this.onTap(e => this.tap(e));
    this.onHover(() => this.phase === 'idle' ? this.cab.pickables() : []);
    this.key({ ' ': () => this.press('spin'), enter: () => this.press('spin'), '+': () => this.press('betup'), '=': () => this.press('betup'), '-': () => this.press('betdn'), m: () => this.press('max'), a: () => this.press('auto') });
    this.hud.rack([]);
    this.offFrame = stage.onFrame(Object.assign(dt => this.frame(dt), { onResize: () => this.placeRoom() }));
    this.phase = 'idle';
    this.renderUI();
    await stage.applyView(VIEW, first ? 0 : 1.2);
    if (!this.alive) return;
    this.say('Midnight Fox. Three sapphires anywhere start the free spins.');
  }
  placeRoom() {
    const r = this.stage.portrait ? ROOM.portrait : ROOM.landscape;
    this.backdrop.place(r);
  }

  // ── build ──
  buildMachine() {
    const stage = this.stage;
    this.cab = buildCabinet(stage, {
      width: CAB_W, open: { w: OPEN_W, h: OPEN_H }, bezel: { top: .058, bottom: .105 }, recess: .42,
      topper: { h: .26, radius: .44 }, led: { a: this.theme.ledA, b: this.theme.ledB },
      buttons: [
        { id: 'betdn', label: 'BET\n−', x: -.275, w: .07, color: '#e9c46a' },
        { id: 'betup', label: 'BET\n+', x: -.19, w: .07, color: '#e9c46a' },
        { id: 'max', label: 'MAX\nBET', x: -.105, w: .07, color: '#ff7a3c' },
        { id: 'auto', label: 'AUTO', x: -.02, w: .07, color: '#4fb0ff' },
        { id: 'spin', label: 'SPIN', x: .19, w: .1, kind: 'round', color: '#ffc53d', pulse: true, z: .005 }
      ]
    });
    this.root.add(this.cab.group);
    const face = this.face = new THREE.Group(); this.root.add(face);
    // reels
    const geo = reelGeometry();
    this.reels = [0, 1, 2, 3, 4].map(i => { const r = new Reel(i, this.atlas.tex, geo, this.theme); r.mesh.userData.ownGeo = i === 0; face.add(r.mesh); r.onThunk = rr => this.onThunk(rr); return r; });
    const start = spinStops(); this.reels.forEach((r, i) => r.setStop(start[i])); this.stops = start;
    // dividers between reels
    const divMat = this.cab.materials.goldPolish;
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(.0035, OPEN_H, .004), divMat); d.userData.ownGeo = true;
      d.position.set((REEL_X(i) + REEL_X(i + 1)) / 2, 0, -.016); face.add(d);
      const sh = own(new THREE.Mesh(new THREE.PlaneGeometry(GAP + .01, OPEN_H), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .55, depthWrite: false })));
      sh.position.set(d.position.x, 0, -.02); face.add(sh);
    }
    // inner shadow at top and bottom of the window
    const shCv = makeCanvas(8, 256), sc = shCv.getContext('2d'), sg = sc.createLinearGradient(0, 0, 0, 256);
    sg.addColorStop(0, 'rgba(0,0,0,.85)'); sg.addColorStop(.12, 'rgba(0,0,0,0)'); sg.addColorStop(.88, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.85)');
    sc.fillStyle = sg; sc.fillRect(0, 0, 8, 256);
    const inner = own(new THREE.Mesh(new THREE.PlaneGeometry(OPEN_W, OPEN_H), new THREE.MeshBasicMaterial({ map: canvasTex(shCv, { srgb: false }), transparent: true, depthWrite: false })));
    inner.position.z = -.012; inner.renderOrder = 2; face.add(inner);
    // anticipation glow frames (one per reel)
    this.antic = this.reels.map(r => {
      const m = own(new THREE.Mesh(new THREE.PlaneGeometry(CELL_W * 1.34, OPEN_H * 1.12), additive(frameGlowTexture(), 0x55a8ff, 0)));
      m.position.set(r.mesh.position.x, 0, -.007); m.renderOrder = 4; face.add(m); return m;
    });
    // win pops + glows
    this.popGeos = new Map();
    this.popMat = new THREE.MeshBasicMaterial({ map: this.atlas.tex, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    this.pops = Array.from({ length: 15 }, () => {
      const g = new THREE.Group(); g.visible = false;
      const glow = own(new THREE.Mesh(new THREE.PlaneGeometry(CELL_W * 1.55, CELL_H * 1.55), additive(glowTexture(), 0xffd24a, .0)));
      glow.position.z = -.002;
      const sym = new THREE.Mesh(this.popGeo(0), this.popMat); sym.userData.ownMat = true; sym.renderOrder = 3;
      const ring = own(new THREE.Mesh(new THREE.PlaneGeometry(CELL_W * 1.12, CELL_H * 1.12), additive(frameGlowTexture(), 0xffd24a, 0)));
      ring.position.z = .001; ring.renderOrder = 4;
      g.add(glow, sym, ring); face.add(g);
      return { g, glow, sym, ring, t: 0 };
    });
    this.ribbons = new Map();
    this.ribbonTex = (() => { const cv = makeCanvas(4, 64), c = cv.getContext('2d'), gr = c.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.28, 'rgba(255,255,255,.16)'); gr.addColorStop(.42, 'rgba(255,255,255,.6)'); gr.addColorStop(.5, 'rgba(255,255,255,.85)'); gr.addColorStop(.58, 'rgba(255,255,255,.6)'); gr.addColorStop(.72, 'rgba(255,255,255,.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 4, 64); return canvasTex(cv, { srgb: false }); })();
    // LCD meter under the reels, info band above
    this.lcd = this.makePanel(OPEN_W, LCD_H, -OPEN_H / 2 - .016 - .012 - LCD_H / 2, 1024);
    this.band = this.makePanel(OPEN_W - .06, BAND_H, OPEN_H / 2 + .016 + .006 + BAND_H / 2, 1024);
    this.meter = { win: 0, shown: 0, label: '', sub: '' };
    this.drawBand(); this.drawLCD(); this.drawMarquee();
  }
  makePanel(w, h, y, px) {
    const cv = makeCanvas(px, Math.round(px * h / w / 2) * 2), ctx = cv.getContext('2d'), tex = canvasTex(cv);
    const m = own(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    m.position.set(0, y, .0015); this.face.add(m);
    return { cv, ctx, tex, mesh: m, W: cv.width, H: cv.height };
  }
  popGeo(s) {
    if (this.popGeos.has(s)) return this.popGeos.get(s);
    const g = new THREE.PlaneGeometry(CELL_W, CELL_H), uv = g.attributes.uv, cx = s % 4, cy = Math.floor(s / 4);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / 4, 1 - (cy + 1 - uv.getY(i)) / 4);
    this.popGeos.set(s, g); return g;
  }
  ribbon(li) {
    if (this.ribbons.has(li)) return this.ribbons.get(li);
    const ln = LINES[li], pts = [[-OPEN_W / 2 + .004, rowY(ln[0])]];
    ln.forEach((row, i) => pts.push([REEL_X(i), rowY(row)]));
    pts.push([OPEN_W / 2 - .004, rowY(ln[4])]);
    const w = .026, pos = [], uvs = [], idx = [];
    let len = 0; const acc = [0]; for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(len); }
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty); tx /= l; ty /= l;
      // miter: scale the offset so the ribbon keeps its width at the bends
      let nx = -ty, ny = tx, sc = 1;
      if (i > 0 && i < pts.length - 1) {
        const t1 = [p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]], l1 = Math.hypot(...t1), n1 = [-t1[1] / l1, t1[0] / l1];
        sc = 1 / Math.max(.5, nx * n1[0] + ny * n1[1]);
      }
      pos.push(p[0] + nx * w / 2 * sc, p[1] + ny * w / 2 * sc, 0, p[0] - nx * w / 2 * sc, p[1] - ny * w / 2 * sc, 0);
      uvs.push(acc[i] / len, 1, acc[i] / len, 0);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
    const m = own(new THREE.Mesh(g, additive(this.ribbonTex, LINE_COLORS[li], 0)));
    m.position.z = -.008; m.renderOrder = 7; m.visible = false; this.face.add(m);
    // numbered jewels on the gold frame at both ends
    const cv = makeCanvas(96, 96), c = cv.getContext('2d');
    const rg = c.createRadialGradient(40, 36, 4, 48, 48, 46); rg.addColorStop(0, '#ffffff'); rg.addColorStop(.35, LINE_COLORS[li]); rg.addColorStop(1, '#101010');
    c.fillStyle = rg; c.beginPath(); c.arc(48, 48, 44, 0, 7); c.fill(); c.lineWidth = 6; c.strokeStyle = '#f3d98a'; c.stroke();
    c.fillStyle = '#0b0b0b'; c.font = `900 ${li + 1 >= 10 ? 42 : 50}px ${FONT_TEXT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(li + 1), 48, 51);
    const bt = canvasTex(cv), badges = [-1, 1].map(sx => {
      const b = own(new THREE.Mesh(new THREE.PlaneGeometry(.03, .03), new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, toneMapped: false })));
      b.position.set(sx * (OPEN_W / 2 + .008), rowY(sx < 0 ? ln[0] : ln[4]), .02); b.renderOrder = 9; b.visible = false; this.face.add(b); return b;
    });
    const r = { mesh: m, badges }; this.ribbons.set(li, r); return r;
  }

  // ── painted panels ──
  drawMarquee() {
    const fs = !!this.fs, img = this.atlas.img;
    this.cab.marquee.redraw((c, W, H) => {
      const bg = c.createRadialGradient(W / 2, H * .55, 10, W / 2, H * .55, W * .62);
      if (fs) { bg.addColorStop(0, '#2b6bff'); bg.addColorStop(.35, '#0d2a8a'); bg.addColorStop(1, '#020619'); }
      else { bg.addColorStop(0, '#2a2560'); bg.addColorStop(.4, '#0c1233'); bg.addColorStop(1, '#020309'); }
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      // sunburst
      c.save(); c.translate(W / 2, H * .62);
      for (let i = 0; i < 36; i++) { c.rotate(Math.PI / 18); c.fillStyle = i % 2 ? (fs ? 'rgba(140,200,255,.07)' : 'rgba(255,210,120,.06)') : 'rgba(0,0,0,0)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(W, -W * .09); c.lineTo(W, W * .09); c.fill(); }
      c.restore();
      // stars
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 90; i++) { const x = rnd() * W, y = rnd() * H, r = rnd() * 2.2 + .4; c.fillStyle = `rgba(255,255,255,${.25 + rnd() * .6})`; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
      // medallions left and right
      const cell = fs ? 1 : 0, ms = H * .62;
      for (const x of [W * .1, W * .9]) {
        const gg = c.createRadialGradient(x, H * .5, 0, x, H * .5, ms * .75); gg.addColorStop(0, fs ? 'rgba(90,170,255,.65)' : 'rgba(255,200,90,.5)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gg; c.fillRect(x - ms, 0, ms * 2, H);
        if (img) c.drawImage(img, (cell % 3) * 256, Math.floor(cell / 3) * 256, 256, 256, x - ms / 2, H * .5 - ms / 2, ms, ms);
      }
      // title
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      const title = fs ? 'Free Spins' : 'Midnight Fox', ts = H * .4;
      c.font = `italic 900 ${ts}px ${FONT_DISPLAY}`;
      const mw = c.measureText(title).width, sx = Math.min(1, W * .62 / mw);
      c.save(); c.translate(W / 2, H * .6); c.scale(sx, 1);
      c.lineJoin = 'round';
      c.shadowColor = fs ? 'rgba(80,160,255,.95)' : 'rgba(255,170,50,.85)'; c.shadowBlur = H * .09;
      c.lineWidth = H * .04; c.strokeStyle = fs ? '#06163f' : '#2a1402'; c.strokeText(title, 0, 0);
      c.shadowBlur = 0;
      c.fillStyle = fs ? goldGrad(c, -ts * .75, ts * .1, ['#ffffff', '#cfe6ff', '#6fb0ff', '#2c5fe0', '#bfe0ff']) : goldGrad(c, -ts * .75, ts * .1);
      c.fillText(title, 0, 0);
      c.lineWidth = H * .005; c.strokeStyle = 'rgba(255,255,255,.75)'; c.strokeText(title, 0, 0);
      c.restore();
      c.font = `800 ${H * .085}px ${FONT_TEXT}`; c.fillStyle = fs ? '#ffffff' : '#ffe7ad';
      spaced(c, fs ? 'EVERY WIN PAYS DOUBLE' : '20 LINES  ·  WILD FOX  ·  FREE SPINS', W / 2, H * .84, H * .025);
      c.font = `800 ${H * .07}px ${FONT_TEXT}`; c.fillStyle = fs ? '#9fd0ff' : '#d9b766';
      spaced(c, fs ? '★  MIDNIGHT FOX  ★' : '★  C³ LOUNGE  ★', W / 2, H * .17, H * .04);
    });
  }
  drawBand() {
    const { ctx: c, W, H } = this.band, fs = !!this.fs;
    c.clearRect(0, 0, W, H);
    const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.15, 'rgba(0,0,0,.6)'); g.addColorStop(.85, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const txt = fs ? `FREE SPINS  ·  EVERY WIN ×${FS_MULT}  ·  3 SAPPHIRES RETRIGGER` : 'FOX IS WILD ON REELS 2–5  ·  3 SAPPHIRES WIN FREE SPINS';
    let fsz = H * .5; c.font = `800 ${fsz}px ${FONT_TEXT}`; c.textBaseline = 'middle'; c.fillStyle = fs ? '#a9d4ff' : '#e8c77a';
    const tw = c.measureText(txt).width + txt.length * fsz * .1; if (tw > W * .9) { fsz *= W * .9 / tw; c.font = `800 ${fsz}px ${FONT_TEXT}`; }
    spaced(c, txt, W / 2, H * .54, fsz * .1);
    this.band.tex.needsUpdate = true;
  }
  drawLCD() {
    const { ctx: c, W, H } = this.lcd, fs = this.fs, m = this.meter;
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b0d12'); g.addColorStop(.5, '#030406'); g.addColorStop(1, '#0a0b0f');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(227,199,126,.45)'; c.lineWidth = 2; c.strokeRect(1, 1, W - 2, H - 2);
    c.fillStyle = 'rgba(227,199,126,.25)'; c.fillRect(W * .27, H * .18, 2, H * .64); c.fillRect(W * .73, H * .18, 2, H * .64);
    const label = (t, x) => { c.font = `800 ${H * .2}px ${FONT_TEXT}`; c.fillStyle = fs ? '#8fbfff' : '#b59a5a'; spaced(c, t, x, H * .3, H * .05); };
    const value = (t, x, size = .36, col = '#f6e3b0') => { c.font = `800 ${H * size}px ${FONT_TEXT}`; c.fillStyle = col; c.fillText(t, x, H * .7); };
    c.textAlign = 'center'; c.textBaseline = 'middle';
    label('TOTAL BET', W * .135); value(fmt(this.totalBet), W * .135);
    if (fs) { label('FREE SPINS', W * .865); value(`${fs.played} / ${fs.total}`, W * .865, .36, '#cfe6ff'); }
    else { label('LINE BET', W * .865); value(`${this.lineBet} × ${NLINES}`, W * .865); }
    if (m.label) {
      label(m.label, W / 2);
      c.font = `800 ${H * .3}px ${FONT_TEXT}`; c.fillStyle = '#ffffff'; c.fillText(m.sub, W / 2, H * .7);
    } else {
      label(fs ? `FEATURE WIN` : 'WIN', W / 2);
      const v = fs && !m.shown ? fs.win : m.shown;
      c.font = `900 ${H * .44}px ${FONT_TEXT}`;
      c.fillStyle = v > 0 ? goldGrad(c, H * .5, H * .9, ['#fff8da', '#ffd978', '#e0a63c']) : '#5b5647';
      c.fillText(v > 0 ? fmt(v) : (this.phase === 'spin' ? 'GOOD LUCK' : '0'), W / 2, H * .7);
    }
    this.lcd.tex.needsUpdate = true;
  }

  // ── bets & UI ──
  get lineBet() { return this.fs ? this.fs.lineBet : LINE_BETS[this.lineBetIdx]; }
  get totalBet() { return this.lineBet * NLINES; }
  setBetIdx(i) {
    i = Math.max(0, Math.min(LINE_BETS.length - 1, i));
    if (i === this.lineBetIdx) return;
    this.lineBetIdx = i; this.bank.setting('slotBetIdx', i);
    this.sound.play('chip', { vol: .5, rate: .9 + i * .06 });
    this.renderUI(); this.drawLCD();
  }
  renderUI() {
    const idle = this.phase === 'idle', spinning = this.phase === 'spin', fs = this.fs, autoOn = !!this.auto;
    const can = this.totalBet <= this.balance;
    this.hud.bet(fs ? 'FEATURE WIN' : 'TOTAL BET', fs ? fs.win : this.totalBet, fs ? `Spin ${fs.played} of ${fs.total} · wins ×${FS_MULT}` : `${this.lineBet} × ${NLINES} lines`);
    const lock = !idle || autoOn || !!fs;
    this.hud.actions([
      { id: 'betdn', label: 'BET −', onClick: () => this.setBetIdx(this.lineBetIdx - 1), disabled: lock || this.lineBetIdx === 0 },
      { id: 'betup', label: 'BET +', onClick: () => this.setBetIdx(this.lineBetIdx + 1), disabled: lock || this.lineBetIdx === LINE_BETS.length - 1 },
      { id: 'max', label: 'MAX BET', sub: fmt(LINE_BETS[LINE_BETS.length - 1] * NLINES), onClick: () => this.maxBet(), disabled: lock },
      { id: 'auto', label: autoOn ? 'STOP' : 'AUTO', sub: autoOn ? `${this.auto.left} LEFT` : '10 SPINS', kind: autoOn ? 'danger' : 'ghost', onClick: () => this.toggleAuto(), disabled: !!fs || (!autoOn && (!idle || !can)) },
      fs ? { id: 'spin', label: 'FREE', sub: `${fs.played} / ${fs.total}`, kind: 'primary', disabled: true }
        : { id: 'spin', label: spinning ? 'STOP' : 'SPIN', sub: spinning ? 'REELS' : fmt(this.totalBet), kind: 'primary', hot: idle && can && !autoOn, key: '␣', onClick: () => this.spinPressed(), disabled: autoOn || (idle && !can) || (!idle && !spinning && this.phase !== 'present') }
    ]);
    const b = this.cab?.buttons; if (!b) return;
    b.get('betdn').setLit(!lock && this.lineBetIdx > 0); b.get('betup').setLit(!lock && this.lineBetIdx < LINE_BETS.length - 1);
    b.get('max').setLit(!lock); b.get('auto').setLabel(autoOn ? 'STOP' : 'AUTO'); b.get('auto').setLit(!fs && (idle || autoOn));
    b.get('spin').setLit(!fs && (idle ? can : spinning)); b.get('spin').setPulse(idle && can && !autoOn);
  }
  press(id) {
    if (!this.alive || document.querySelector('.sheet.on')) return;
    if (id === 'spin') return this.spinPressed();
    const btn = document.querySelector(`#actions .act[data-id="${id}"]:not(:disabled)`); btn?.click();
  }
  tap(e) {
    const h = this.stage.pick(e.clientX, e.clientY, this.cab.pickables(), false)[0];
    if (h) { const id = h.object.userData.btn; this.cab.buttons.get(id)?.press(); this.press(id); return; }
    // tapping the glass during a spin slams the reels; during a win it skips ahead
    if (this.phase === 'spin' || this.phase === 'present') { const g = this.stage.pick(e.clientX, e.clientY, [this.cab.glass], false)[0]; if (g) this.spinPressed(); }
  }
  maxBet() {
    if (this.phase !== 'idle' || this.auto) return;
    let i = LINE_BETS.length - 1; while (i > 0 && LINE_BETS[i] * NLINES > this.balance) i--;
    this.setBetIdx(i); this.renderUI();
    if (LINE_BETS[i] * NLINES <= this.balance) this.spin();
  }
  toggleAuto() {
    if (this.auto) { this.auto = null; this.say('Auto play stopped.'); this.renderUI(); return; }
    if (this.phase !== 'idle' || this.fs) return;
    this.auto = { left: 10 }; this.say('Auto play: ten spins. It stops for free spins and big wins.');
    this.renderUI(); this.spin();
  }
  spinPressed() {
    if (!this.alive) return;
    this.cab.buttons.get('spin')?.press();
    if (this.phase === 'spin') { this.slam(); return; }
    if (this.phase === 'present') { this.skipAhead(); if (!this.fs && !this.auto) this.queued = true; return; }
    if (this.phase === 'idle' && !this.auto) this.spin();
  }
  skipAhead() { this.skip = true; this.tw.kill('count'); this.tw.kill('pwait'); }
  pwait(s) { return this.tw.run(s, () => {}, { tag: 'pwait' }); }

  // ── a paid spin ──
  async spin() {
    if (this.phase !== 'idle' || !this.alive) return;
    const bet = this.totalBet;
    if (!this.bank.stake(bet)) { this.hud.toast('Not enough chips for that bet — try BET −.'); this.auto = null; this.renderUI(); return; }
    const stops = spinStops(), res = evaluate(windowOf(stops), this.lineBet);
    this.pending = { bet, res, lineBet: this.lineBet, settled: false };
    this.meter.shown = 0; this.meter.label = '';
    this.sound.play('chip', { vol: .5 }); this.sound.whoosh();
    await this.runReels(stops);
    if (!this.alive) return;
    const trig = res.scatter.spins > 0;
    await this.present(res, bet);
    if (!this.alive) return;
    this.pending.settled = true;
    this.bank.settle(bet, res.total, 'slots');
    this.emit('spin', { net: res.total - bet, freeSpins: trig, multiple: res.total / bet });
    if (trig) { this.pending.fsLeft = res.scatter.spins; await this.feature(res.scatter.spins, this.pending.lineBet); if (!this.alive) return; }
    this.pending = null;
    this.phase = 'idle';
    const x = res.total / bet;
    if (this.auto) {
      this.auto.left--;
      if (this.auto.left <= 0 || trig || x >= 10 || this.totalBet > this.balance) { this.auto = null; this.say(trig || x >= 10 ? 'Auto play paused for the big moment.' : 'Auto play finished.'); }
    }
    this.renderUI(); this.drawLCD();
    if (this.queued) { this.queued = false; if (!this.auto && this.totalBet <= this.balance) { this.spin(); return; } }
    if (this.auto) { await this.wait(.45); if (this.alive && this.auto && this.phase === 'idle') this.spin(); }
    else if (!trig && res.total === 0 && this.balance < this.totalBet) this.say(this.balance < LINE_BETS[0] * NLINES ? 'Out of chips — Ace’s marker is waiting in the lobby.' : 'Bet is more than your stack. Try BET −.');
  }

  // spin the reels to `stops`; resolves when all five have landed
  runReels(stops) {
    this.phase = 'spin'; this.slammed = false; this.renderUI(); this.drawLCD();
    this.stops = stops;
    this.cab.setLeds('spin');
    const loop = this.sound.reelSpin();
    this.reelLoop = loop;
    return new Promise(res => {
      let landed = 0, scat = 0;
      const t0 = this.clock;
      this.reels.forEach((r, i) => r.start(i * .06));
      this.stopPlan = this.reels.map((r, i) => ({ at: t0 + .72 + i * .25, requested: false }));
      this.landedCb = r => {
        landed++;
        const col = [0, 1, 2].map(row => REELS[r.i][(stops[r.i] + row) % r.L]);
        if (col.includes(SYM.SCATTER)) { scat++; this.sound.tone(1046.5 * Math.pow(2, (scat - 1) * 4 / 12), { type: 'triangle', d: .7, vol: .09, verb: .5 }); this.sound.tone(2093 * Math.pow(2, (scat - 1) * 4 / 12), { d: .4, vol: .04 }); this.flashScatter(r.i, col.indexOf(SYM.SCATTER)); }
        this.antic[r.i].material.opacity = 0; r.u.glow.value = 0;
        // anticipation: two sapphires showing and reels still to come
        if (scat >= 2 && landed < 5 && !this.slammed) {
          const next = this.stopPlan[landed];
          next.at = Math.max(next.at, this.clock + 1.55); next.antic = true;
          for (let k = landed + 1; k < 5; k++) this.stopPlan[k].at = Math.max(this.stopPlan[k].at, next.at + (k - landed) * 1.2);
          this.reels[landed].vmax = 12;
          this.cab.setLeds('anticipate', '#6fc0ff', '#2244ff');
          this.say(scat === 2 ? 'Two sapphires… one more for the free spins.' : 'Sapphires everywhere…');
        }
        if (landed === 5) {
          loop.stop(); this.reelLoop = null;
          this.cab.setLeds('attract', this.theme.ledA, this.theme.ledB);
          res();
        }
      };
    });
  }
  slam() {
    if (this.phase !== 'spin' || this.slammed) return;
    this.slammed = true;
    this.stopPlan?.forEach((p, i) => { p.at = Math.min(p.at, this.clock + .02 + i * .07); p.antic = false; });
    this.reels.forEach(r => { r.vmax = 21; });
  }
  onThunk(r) {
    this.sound.thunk(); this.sound.play('reel', { vol: .35, rate: 1.1 + r.i * .03 });
  }
  flashScatter(i, row) {
    const p = this.pops[14]; this.showPop(p, i, row, SYM.SCATTER, '#5fb4ff');
    p.flash = 1.1;
  }

  // ── presentation ──
  showPop(p, reel, row, sym, color) {
    p.sym.geometry = this.popGeo(sym);
    const a = rowAngle(row);
    p.g.position.set(REEL_X(reel), RAD * Math.sin(a), Z_AXIS + RAD * Math.cos(a) + .004);
    p.g.rotation.x = -a; p.g.visible = true; p.t = 0; p.flash = 0;
    p.glow.material.color.set(color); p.ring.material.color.set(color);
  }
  hidePops() { for (const p of this.pops) { p.g.visible = false; p.flash = 0; } }
  showLine(li, on) { const r = this.ribbon(li); r.mesh.visible = on; r.badges.forEach(b => { b.visible = on; }); r.mesh.material.opacity = on ? 1 : 0; }
  async present(res, bet, { free = false } = {}) {
    this.phase = 'present'; this.skip = false; this.renderUI();
    const total = res.total, wins = [...res.lines];
    if (res.scatter.pay || res.scatter.spins) wins.push({ scatter: true, cells: res.scatter.cells, pay: res.scatter.pay, spins: res.scatter.spins, count: res.scatter.count });
    if (!wins.length) { this.meter.shown = 0; this.drawLCD(); this.phase = 'done'; return; }
    const multiple = total / (free ? this.fs.lineBet * NLINES : bet), tier = tierFor(multiple);
    // 1) everything at once, reels dim, count-up
    this.reels.forEach(r => { r.u.dim.value = .38; });
    const cellSet = new Map();
    for (const w of wins) for (const [reel, row] of w.cells) cellSet.set(reel * 3 + row, { reel, row, color: w.scatter ? '#5fb4ff' : LINE_COLORS[w.line] });
    let k = 0; for (const c of cellSet.values()) { if (k < 14) this.showPop(this.pops[k++], c.reel, c.row, this.windowSym(c.reel, c.row), c.color); }
    for (const w of wins) if (!w.scatter) this.showLine(w.line, true);
    this.cab.setLeds(tier ? 'big' : 'win', tier ? '#ffe28a' : this.theme.ledA, tier ? '#ff3d7a' : this.theme.ledB);
    const countDur = tier ? Math.min(6, 2.6 + Math.log10(multiple) * 1.4) : Math.min(2.2, .7 + Math.log10(total + 1) * .35);
    const from = free ? this.meter.shown : 0;
    if (tier) {
      this.sound.fanfare(); this.fx.start({ rate: tier.x >= 50 ? 110 : tier.x >= 25 ? 80 : 55, dur: countDur + .8, burst: tier.x >= 25 ? 50 : 20 });
      nudge(this.stage, .07);
      this.cab.flashMarquee(.1);
      this.say(tier.x >= 50 ? 'Epic. The whole lounge heard that one.' : tier.x >= 25 ? 'Mega win! The fox is on your side tonight.' : 'Big win! Now that’s a night out.');
      this.hud.banner({ title: tier.name.replace(' WIN', '').toLowerCase().replace(/^./, c => c.toUpperCase()) + ' Win', amount: total, kind: 'big', sub: `${multiple.toFixed(multiple < 100 ? 1 : 0)}× YOUR BET`, hold: countDur + 1.2 });
    } else {
      this.sound.chime(Math.min(3, 1 + Math.floor(multiple))); if (res.scatter.spins) this.sound.chime(3);
    }
    await this.countUp(from, from + total, countDur);
    if (!this.alive) return;
    this.cab.flashMarquee(0);
    // 2) line by line
    this.hidePops(); for (const w of wins) if (!w.scatter) this.showLine(w.line, false);
    const each = free || this.auto ? .6 : .9, show = wins.slice(0, this.skip ? 0 : 8);
    for (const w of show) {
      if (this.skip || !this.alive) break;
      let n = 0;
      for (const [reel, row] of w.cells) this.showPop(this.pops[n++], reel, row, this.windowSym(reel, row), w.scatter ? '#5fb4ff' : LINE_COLORS[w.line]);
      if (!w.scatter) this.showLine(w.line, true);
      const name = w.scatter ? SYMBOLS[SYM.SCATTER].name : SYMBOLS[w.sym].name;
      this.meter.label = w.scatter ? `${w.count} SAPPHIRES` : `LINE ${w.line + 1}`;
      this.meter.sub = w.scatter ? (w.spins ? `${w.spins} FREE SPINS${w.pay ? ' + ' + fmt(w.pay) : ''}` : fmt(w.pay)) : `${w.count} × ${name.toUpperCase()}  ·  ${fmt(w.pay)}`;
      this.drawLCD(); this.sound.coin();
      await this.pwait(each);
      this.hidePops(); if (!w.scatter) this.showLine(w.line, false);
    }
    this.meter.label = ''; this.drawLCD();
    this.reels.forEach(r => { r.u.dim.value = 1; });
    this.hidePops();
    this.cab.setLeds('attract', this.theme.ledA, this.theme.ledB);
    this.phase = 'done';
  }
  windowSym(reel, row) { return REELS[reel][(this.stops[reel] + row) % REELS[reel].length]; }
  countUp(from, to, dur) {
    let lastTick = 0;
    if (this.skip) dur = .01;
    return this.tw.run(dur, (e, p) => {
      this.meter.shown = from + (to - from) * e; this.drawLCD();
      if (p - lastTick > .06 && p < 1) { lastTick = p; this.sound.coin(); }
    }, { ease: 'outCubic', tag: 'count' }).then(() => { this.meter.shown = to; this.drawLCD(); });
  }

  // ── free spins ──
  async feature(spins, lineBet) {
    this.fs = { left: spins, total: spins, played: 0, win: 0, lineBet };
    this.setTheme('free');
    this.renderUI(); this.drawLCD();
    this.sound.fanfare();
    this.say(`${spins} free spins. Every win pays double.`);
    await this.hud.banner({ title: 'Free Spins', amount: null, kind: 'big', sub: `${spins} SPINS  ·  ALL WINS ×${FS_MULT}`, hold: 2.2 });
    if (!this.alive) return;
    this.meter.shown = 0;
    while (this.fs.left > 0 && this.fs.played < FS_CAP && this.alive) {
      this.fs.left--; this.fs.played++;
      if (this.pending) this.pending.fsLeft = this.fs.left;
      this.renderUI(); this.drawLCD();
      await this.wait(.35);
      if (!this.alive) return;
      const stops = spinStops(), res = evaluate(windowOf(stops), lineBet, FS_MULT);
      this.fsSpin = { res, settled: false };
      await this.runReels(stops);
      if (!this.alive) return;
      this.meter.shown = this.fs.win;
      await this.present(res, lineBet * NLINES, { free: true });
      if (!this.alive) return;
      this.fsSpin.settled = true;
      this.fs.win += res.total;
      this.bank.settle(0, res.total, 'slots');
      this.emit('spin', { net: res.total, freeSpins: res.scatter.spins > 0, multiple: res.total / (lineBet * NLINES) });
      if (res.scatter.spins) {
        this.fs.left += res.scatter.spins; this.fs.total += res.scatter.spins;
        if (this.pending) this.pending.fsLeft = this.fs.left;
        this.sound.chime(4); this.say(`Retrigger! ${res.scatter.spins} more free spins.`);
        await this.hud.banner({ title: 'Retrigger', amount: null, kind: 'big', sub: `+${res.scatter.spins} FREE SPINS`, hold: 1.6 });
      }
      this.phase = 'feature'; this.meter.shown = this.fs.win; this.drawLCD();
    }
    if (!this.alive) return;
    const won = this.fs.win, bet = lineBet * NLINES;
    this.sound.fanfare(); if (won >= bet * 10) this.fx.start({ rate: 70, dur: 2.5, burst: 25 });
    this.say(won > 0 ? `The feature paid ${fmt(won)}. Nicely done.` : 'The feature came up quiet this time.');
    await this.hud.banner({ title: 'Feature Win', amount: won, kind: won > 0 ? 'big' : 'push', sub: `${this.fs.played} FREE SPINS  ·  ${(won / bet).toFixed(1)}× BET`, hold: 2.6 });
    if (!this.alive) return;
    this.fs = null; this.fsSpin = null; this.meter.shown = won;
    this.setTheme('base');
  }
  setTheme(name) {
    this.theme = THEME[name];
    this.reels.forEach(r => { r.u.bg0.value.set(this.theme.bg0); r.u.bg1.value.set(this.theme.bg1); });
    this.cab.setLeds('attract', this.theme.ledA, this.theme.ledB);
    this.stage.key.color.setHex(this.theme.key);
    this.backdrop.uniforms.dim.value = name === 'free' ? .45 : .72;
    this.drawMarquee(); this.drawBand(); this.drawLCD();
  }

  // ── per frame ──
  frame(dt) {
    if (!this.alive || !this.reels) return;
    this.clock += dt;
    if (this.phase === 'spin' && this.stopPlan) {
      for (let i = 0; i < 5; i++) {
        const p = this.stopPlan[i], r = this.reels[i];
        const prevLanded = i === 0 || this.reels[i - 1].state === 'idle' || this.reels[i - 1].state === 'bounce';
        if (p.antic && !p.requested) { this.antic[i].material.opacity = .55 + .35 * Math.sin(this.clock * 9); r.u.glow.value = .6 + .4 * Math.sin(this.clock * 9); if (Math.floor(this.clock * 8) !== this.anticTick) { this.anticTick = Math.floor(this.clock * 8); this.sound.tone(330 + (this.clock % 2) * 260, { type: 'sine', d: .12, vol: .035, verb: .2 }); } }
        if (!p.requested && prevLanded && this.clock >= p.at && (r.state === 'spin' || r.state === 'run')) {
          p.requested = true;
          r.requestStop(this.stops[i], rr => this.landedCb?.(rr));
        }
      }
    }
    for (const r of this.reels) r.update(dt);
    // pops breathe
    for (const p of this.pops) {
      if (!p.g.visible) continue;
      p.t += dt;
      if (p.flash) { p.flash -= dt; const k = Math.max(0, p.flash / 1.1); p.g.scale.setScalar(1 + .18 * Math.sin((1 - k) * Math.PI)); p.glow.material.opacity = k; p.ring.material.opacity = k; if (p.flash <= 0) p.g.visible = false; continue; }
      const s = 1.06 + .06 * Math.sin(p.t * 7.5);
      p.g.scale.setScalar(s); p.glow.material.opacity = .22 + .12 * Math.sin(p.t * 7.5); p.ring.material.opacity = .7 + .2 * Math.sin(p.t * 7.5);
    }
    for (const r of this.ribbons.values()) if (r.mesh.visible) r.mesh.material.opacity = .7 + .2 * Math.sin(this.clock * 8);
    this.cab.update(dt);
    this.fx.update(dt);
  }

  // ── leaving mid-spin: nothing is lost ──
  dispose() {
    this.offFrame?.(); this.offResize?.();
    this.reelLoop?.stop(); this.reelLoop = null;
    this.restoreStage?.();
    const p = this.pending;
    if (p) {
      if (!p.settled) { this.bank.settle(p.bet, p.res.total, 'slots'); this.emit('spin', { net: p.res.total - p.bet, freeSpins: p.res.scatter.spins > 0, multiple: p.res.total / p.bet }); p.fsLeft = p.res.scatter.spins; }
      else if (this.fsSpin && !this.fsSpin.settled) { this.bank.settle(0, this.fsSpin.res.total, 'slots'); if (this.fsSpin.res.scatter.spins) p.fsLeft = (p.fsLeft || 0) + this.fsSpin.res.scatter.spins; }
      if (p.fsLeft > 0) {
        const f = playFeature(p.fsLeft, p.lineBet);
        this.bank.settle(0, f.total, 'slots');
        if (f.total > 0) this.hud.toast(`Your remaining free spins were played out: <b>+${fmt(f.total)}</b> chips.`, 'gold');
      }
      this.pending = null;
    }
    disposeTree(this.root);
    this.popGeos?.forEach(g => g.dispose());
    this.atlas?.tex.dispose();
  }

  help() {
    const img = s => this.atlas ? `<img src="${symbolURL(this.atlas, s, 56)}" alt="" style="width:40px;height:40px;vertical-align:middle">` : '';
    const rows = [SYM.CROWN, SYM.SEVEN, SYM.BARS, SYM.BELL, SYM.MARTINI, SYM.CHERRY, SYM.CHIPS, SYM.A, SYM.K, SYM.Q, SYM.J, SYM.T]
      .map(s => `<tr><td>${img(s)} ${SYMBOLS[s].name}</td><td class="r">${PAYS[s][3]}</td><td class="r">${PAYS[s][4]}</td><td class="r">${PAYS[s][5]}</td></tr>`).join('');
    const mini = ln => `<span style="display:inline-grid;grid-template-columns:repeat(5,7px);grid-template-rows:repeat(3,7px);gap:2px;padding:4px;border-radius:5px;background:rgba(255,255,255,.04);margin:2px">${[0, 1, 2].map(row => ln.map(r => `<i style="display:block;border-radius:2px;background:${r === row ? '#d4af5f' : 'rgba(255,255,255,.1)'}"></i>`).join('')).join('')}</span>`;
    return `<p class="eyebrow">MACHINE RULES</p><h2>Midnight <em>Fox</em></h2>
    <ul><li>5 reels, 3 rows, <b>20 fixed lines</b>. Wins pay left to right from the first reel, three or more in a row. Only the highest win on each line is paid; wins on different lines add up.</li>
    <li>${img(SYM.WILD)} <b>Fox Wild</b> appears on reels 2–5 and stands in for every symbol except the sapphire.</li>
    <li>${img(SYM.SCATTER)} <b>Sapphire Scatter</b> pays anywhere: 3 = ${SCATTER_PAYS[3]}×, 4 = ${SCATTER_PAYS[4]}×, 5 = ${SCATTER_PAYS[5]}× your total bet, plus <b>${FREE_SPINS[3]} / ${FREE_SPINS[4]} / ${FREE_SPINS[5]} free spins</b>. Free spins are played at the bet that won them, every win pays <b>double</b>, and sapphires can retrigger more.</li>
    <li>Bet ${LINE_BETS.join(', ')} chips per line (${fmt(LINE_BETS[0] * NLINES)}–${fmt(LINE_BETS[LINE_BETS.length - 1] * NLINES)} per spin). MAX BET sets the top bet you can afford and spins.</li>
    <li>AUTO plays ten spins and stops for free spins, any win of 10× or more, or when your stack runs short. Tap SPIN (or the glass) while the reels turn to stop them early.</li></ul>
    <h3>LINE PAYS · × LINE BET</h3>
    <table class="paytable"><tr><th>SYMBOL</th><th class="r">3</th><th class="r">4</th><th class="r">5</th></tr>${rows}</table>
    <h3>THE 20 LINES</h3><div style="display:flex;flex-wrap:wrap;gap:2px">${LINES.map((ln, i) => `<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--mute)">${i + 1}${mini(ln)}</span>`).join('')}</div>
    <h3>THE MATH</h3><p class="muted">Return to player 95.97% — computed exactly over all 53,706,240 reel-stop combinations and confirmed by a 5-million-spin simulation. About one spin in three wins something; free spins arrive roughly once every 183 spins. Reel stops come from your browser’s cryptographic random number generator.</p>
    <h3>KEYS</h3><p class="muted">Space spin / stop · + and − change the bet · M max bet · A auto</p>`;
  }
}
