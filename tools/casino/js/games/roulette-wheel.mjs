// The roulette wheel: a procedurally turned walnut bowl, burl stator with eight
// chrome deflectors, a rotor with 37 pockets, chrome frets, a printed number
// ring and a chrome turret — and the ball, choreographed analytically so it
// looks like physics but always lands in the pocket chosen before the spin.
//
// Wheel-local frame: y up, the table felt at y = 0. Angles θ are measured
// counter-clockwise seen from above, with a point at θ sitting at
// (r cos θ, y, −r sin θ). The rotor group's rotation.y adds directly to θ.
import * as THREE from '../vendor/three.min.mjs';
import { WHEEL, colorOf } from '../rules/roulette.mjs';
import { FONT_DISPLAY } from '../core/textures.mjs';

const TAU = Math.PI * 2, N = 37, PW = TAU / N;
export const BALL_R = .0105;
// ball-centre path over the bowl: track → stator → rotor
const R_TRACK = .4005, Y_TRACK = .0788;
const R_ENTRY = .284, R_POCKET = .2215, Y_POCKET = .0309;
const R_DEFL = .343;
const DEFL_ANG = Array.from({ length: 8 }, (_, i) => i * TAU / 8 + TAU / 16);
const LAUNCH_ANG = .95;                          // the dealer's side of the wheel
const OMEGA_IDLE = TAU * .055, OMEGA_PUSH = TAU * .3, TAU_DECAY = 10, TAU_UP = .4;

// ball-centre height as a function of radius outside the rotor
const BALL_Y = [[.4005, .0788], [.388, .0757], [.300, .0500], [.284, .0500]];
function ballY(r) {
  if (r >= BALL_Y[0][0]) return BALL_Y[0][1];
  for (let i = 1; i < BALL_Y.length; i++) {
    const [r1, y1] = BALL_Y[i - 1], [r2, y2] = BALL_Y[i];
    if (r >= r2) return y2 + (y1 - y2) * (r - r2) / (r1 - r2);
  }
  return BALL_Y[BALL_Y.length - 1][1];
}
// rotor surface under the ball (ring, then pockets) — for hop baselines
function rotorBallY(r) {
  if (r >= .247) return .0325 + (r - .247) * (.007 / .038) + BALL_R;
  return Y_POCKET + (r - R_POCKET) * .05;
}
// local rotor angle of pocket k (the ring is printed clockwise: 0, 32, 15, …)
export const pocketAngle = k => -Math.PI / 2 - (k + .5) * PW;
const wrap = a => ((a % TAU) + TAU) % TAU;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const rnd = (a, b) => a + Math.random() * (b - a);             // cosmetic only — the outcome is chosen by the game with rng.rand

// ── textures ────────────────────────────────────────────────────────────
// periodic value noise (wraps in x) for seamless turned-wood textures
function noiseField(gw, gh, seed = 1) {
  let s = seed * 9301 + 49297;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const g = Array.from({ length: gw * (gh + 1) }, r);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
    const X0 = ((xi % gw) + gw) % gw, X1 = (X0 + 1) % gw, Y0 = Math.max(0, Math.min(gh, yi)), Y1 = Math.min(gh, Y0 + 1);
    const a = g[Y0 * gw + X0], b = g[Y0 * gw + X1], c = g[Y1 * gw + X0], d = g[Y1 * gw + X1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };
}
function woodCanvas(w, h, { dark, mid, light, gold = null, burl = false, rings = 18, seed = 3, aspect = 7.5 }) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), img = c.createImageData(w, h), d = img.data;
  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const stops = [dark, mid, light, gold || light].map(hex);
  const ramp = t => { t = Math.max(0, Math.min(.999, t)) * 3; const i = Math.floor(t), f = t - i; return stops[i].map((k, j) => lerp(k, stops[i + 1][j], f)); };
  if (burl) {
    // domain-warped fractal noise: fine swirling figure like burl veneer. Cells are square on the
    // real surface (`aspect` = its width / height), so nothing stretches around the ring.
    const G = 44, GV = Math.max(2, Math.round(G / aspect));
    const oct = [0, 1, 2, 3].map(o => noiseField(G << o, GV << o, seed + o * 17));
    const fbm = (x, y, n = 4) => { let a = .5, s2 = 0, f = 1; for (let o = 0; o < n; o++) { s2 += a * oct[o](x * f, y * f); a *= .5; f *= 2; } return s2 / (1 - Math.pow(.5, n)); };
    const pins = noiseField(G * 4, GV * 4, seed + 99);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x / w * G, py = y / h * GV;
      const qx = fbm(px, py, 2), qy = fbm(px + 5.2, py + 1.3, 2);
      const f = fbm(px + 2.4 * qx, py + 2.4 * qy, 4);
      const fig = .5 + .5 * Math.sin(f * 26 + qx * 6);                      // the tight curling lines
      const e = Math.pow(Math.max(0, pins(x / w * G * 4, y / h * GV * 4) - .8) * 5, 2);
      const t = .34 + (f - .5) * .9 + fig * .22 - e * .35;
      const col = ramp(t);
      const o = (y * w + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  } else {
    const n1 = noiseField(16, 8, seed), n2 = noiseField(64, 24, seed + 7), n3 = noiseField(200, 60, seed + 13);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const warp = n1(u * 16, v * 8) * 1.6 + n2(u * 64, v * 24) * .35;
      let t = .5 + .5 * Math.sin((v * rings + warp) * Math.PI * 2);
      t = Math.pow(t, 2.2) * .85 + n3(u * 200, v * 60) * .15;
      const col = ramp(t * .66), fleck = (n3(u * 200 + 50, v * 60) - .5) * 14;
      const o = (y * w + x) * 4;
      d[o] = col[0] + fleck; d[o + 1] = col[1] + fleck * .7; d[o + 2] = col[2] + fleck * .5; d[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}
function numberRingCanvas() {
  const W = 4096, H = 176, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), sw = W / N;
  for (let k = 0; k < N; k++) {
    const n = WHEEL[k], col = colorOf(n), x = k * sw;
    const g = c.createLinearGradient(0, 0, 0, H);
    if (col === 'red') { g.addColorStop(0, '#c21a26'); g.addColorStop(1, '#7c0a12'); }
    else if (col === 'black') { g.addColorStop(0, '#26272c'); g.addColorStop(1, '#08090b'); }
    else { g.addColorStop(0, '#12925a'); g.addColorStop(1, '#064a2b'); }
    c.fillStyle = g; c.fillRect(x, 0, sw + 1, H);
    // soft lacquer highlight
    const hl = c.createLinearGradient(0, 0, 0, H); hl.addColorStop(0, 'rgba(255,255,255,.16)'); hl.addColorStop(.45, 'rgba(255,255,255,0)');
    c.fillStyle = hl; c.fillRect(x, 0, sw + 1, H);
    c.save(); c.translate(x + sw / 2, H * .47);
    c.font = `700 ${n >= 10 ? 76 : 86}px ${FONT_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if ('letterSpacing' in c) c.letterSpacing = '-2px';
    c.lineJoin = 'round';
    c.fillStyle = c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 5; c.strokeText(String(n), 2, 3); c.fillText(String(n), 2, 3);
    c.fillStyle = c.strokeStyle = col === 'green' ? '#f7e4a8' : '#f7f0de'; c.lineWidth = 3.5; c.strokeText(String(n), 0, 0); c.fillText(String(n), 0, 0);
    c.restore();
  }
  // gold separators and rims
  c.fillStyle = '#e2c275';
  for (let k = 0; k <= N; k++) c.fillRect(Math.round(k * sw) - 2, 0, 4, H);
  c.fillRect(0, 0, W, 7); c.fillRect(0, H - 6, W, 6);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 7, W, 2); c.fillRect(0, H - 8, W, 2);
  return cv;
}
function pocketCanvas() {
  const W = 1024, H = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), sw = W / N;
  for (let k = 0; k < N; k++) {
    const col = colorOf(WHEEL[k]);
    c.fillStyle = col === 'red' ? '#8e101a' : col === 'black' ? '#0d0e11' : '#0a6b3e';
    c.fillRect(k * sw, 0, sw + 1, H);
  }
  // a darker floor band so the pockets read deep
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,.05)'); g.addColorStop(.25, 'rgba(0,0,0,.35)'); g.addColorStop(.8, 'rgba(0,0,0,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  return cv;
}

// ── geometry helpers ────────────────────────────────────────────────────
function lathe(pts, segs, mat, { flipU = false, flipV = false } = {}) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  if (flipU || flipV) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, flipU ? 1 - uv.getX(i) : uv.getX(i), flipV ? 1 - uv.getY(i) : uv.getY(i)); }
  const m = new THREE.Mesh(g, mat); m.userData.ownGeo = true; m.userData.ownMat = true;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function torus(r, tube, y, mat, segs) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, segs), mat);
  m.rotation.x = Math.PI / 2; m.position.y = y; m.userData.ownGeo = true; m.userData.ownMat = true; m.receiveShadow = true;
  return m;
}

export class RouletteWheel {
  constructor(stage, { x = 0, z = 0 } = {}) {
    this.stage = stage;
    const tier = stage.tier, segs = tier === 'high' ? 180 : tier === 'mid' ? 128 : 80;
    const aniso = Math.min(8, stage.renderer.capabilities.getMaxAnisotropy());
    const tex = (cv, rep = 1) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.wrapS = THREE.RepeatWrapping; t.repeat.x = rep; return t; };
    this.group = new THREE.Group(); this.group.position.set(x, 0, z);

    // materials
    const walnut = new THREE.MeshPhysicalMaterial({ map: tex(woodCanvas(1024, 256, { dark: '#1a0b04', mid: '#3d1c0b', light: '#6e3a17', rings: 26, seed: 5 }), 2), roughness: .55, clearcoat: .7, clearcoatRoughness: .2, envMapIntensity: .8 });
    const big = tier === 'high';
    const burl = new THREE.MeshPhysicalMaterial({ map: tex(woodCanvas(big ? 1024 : 640, big ? 256 : 160, { dark: '#2a1206', mid: '#5b2b0e', light: '#8a4e1c', gold: '#b07a3c', burl: true, seed: 11, aspect: 7.6 }), 3), roughness: .5, clearcoat: .6, clearcoatRoughness: .18, envMapIntensity: .7 });
    const turned = new THREE.MeshPhysicalMaterial({ map: tex(woodCanvas(512, 256, { dark: '#2a1207', mid: '#5a2a0f', light: '#8f5220', rings: 11, seed: 21 }), 1), roughness: .5, clearcoat: .75, clearcoatRoughness: .14, envMapIntensity: .8 });
    const track = new THREE.MeshPhysicalMaterial({ map: tex(woodCanvas(1024, 64, { dark: '#24100a', mid: '#4a2311', light: '#6b3519', rings: 4, seed: 9 }), 2), roughness: .4, clearcoat: .8, clearcoatRoughness: .12, envMapIntensity: .9 });
    const chrome = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f7, metalness: 1, roughness: .13, envMapIntensity: 2.0 });
    const brass = new THREE.MeshPhysicalMaterial({ color: 0xe0b35a, metalness: 1, roughness: .24, envMapIntensity: 1.7 });
    const ringMat = new THREE.MeshPhysicalMaterial({ map: tex(numberRingCanvas()), roughness: .55, clearcoat: .6, clearcoatRoughness: .16, envMapIntensity: .7 });
    const pocketMat = new THREE.MeshPhysicalMaterial({ map: tex(pocketCanvas()), roughness: .5, clearcoat: .6, clearcoatRoughness: .2, envMapIntensity: .6 });
    this.mats = { walnut, burl, turned, track, chrome, brass, ringMat, pocketMat };

    // ── the bowl (static) ──
    const bowlOuter = lathe([[.462, 0], [.462, .004], [.456, .009], [.452, .02], [.449, .07], [.447, .088], [.444, .096], [.438, .1015], [.43, .1035], [.423, .1025]], segs, walnut);
    const trackWall = lathe([[.423, .1025], [.419, .0985], [.4165, .091], [.4135, .08], [.411, .0735], [.406, .0695], [.397, .0675], [.388, .0655]], segs, track);
    const stator = lathe([[.388, .0655], [.384, .0625], [.30, .0392], [.298, .036], [.297, .026]], segs, burl);
    this.group.add(bowlOuter, trackWall, stator);
    // brass: foot ring, rim bead, the lip between track and stator, the stator's inner bead
    this.group.add(torus(.4595, .0035, .006, brass, segs), torus(.4505, .0028, .09, brass, segs), torus(.3875, .0016, .0662, brass, segs), torus(.2995, .0022, .0385, brass, segs));
    // deflectors ("diamonds"): alternately along the slope and across it
    const dGeo = new THREE.LatheGeometry([[1, 0], [.78, .3], [.42, .78], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 4);
    const defl = new THREE.InstancedMesh(dGeo, brass, DEFL_ANG.length);
    defl.userData.ownGeo = true; defl.castShadow = true;
    const slope = Math.atan2(.0625 - .0392, .384 - .30);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    DEFL_ANG.forEach((a, i) => {
      const long = i % 2 === 0, yS = .0392 + (R_DEFL - .30) * Math.tan(slope);
      const p = new THREE.Vector3(R_DEFL * Math.cos(a), yS - .0004, -R_DEFL * Math.sin(a));
      // local x = radial, z = tangential; tilt to the slope
      e.set(0, a, 0, 'YXZ'); q.setFromEuler(e);
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), slope);
      q.multiply(tilt);
      const s = long ? new THREE.Vector3(.026, .0072, .0085) : new THREE.Vector3(.0085, .0072, .026);
      mtx.compose(p, q, s); defl.setMatrixAt(i, mtx);
    });
    this.group.add(defl);

    // ── the rotor (turns) ──
    const rotor = this.rotor = new THREE.Group();
    this.group.add(rotor);
    const lip = lathe([[.2975, .031], [.2972, .0368], [.2945, .0402], [.2895, .0412], [.2865, .0400]], segs, chrome);
    const ring = lathe([[.2865, .0400], [.247, .0325]], segs, ringMat, { flipU: true, flipV: true });
    const pockets = lathe([[.247, .0325], [.2458, .0305], [.2452, .019], [.222, .0202], [.1985, .0215], [.1968, .0345]], segs, pocketMat, { flipU: true });
    const cone = lathe([[.1968, .0345], [.1935, .0372], [.17, .045], [.13, .0565], [.09, .0668], [.066, .0728], [.056, .0748]], segs, turned);
    rotor.add(lip, ring, pockets, cone);
    rotor.add(torus(.1962, .0019, .0355, chrome, segs), torus(.1255, .0014, .0578, brass, segs), torus(.0668, .0016, .0728, brass, segs));
    // frets between the pockets
    const fGeo = new THREE.BoxGeometry(.0485, .0128, .0019);
    const frets = new THREE.InstancedMesh(fGeo, chrome, N);
    frets.userData.ownGeo = true; frets.castShadow = true; frets.receiveShadow = true;
    for (let k = 0; k < N; k++) {
      const a = -Math.PI / 2 - k * PW, rm = (.1985 + .2458) / 2;
      mtx.compose(new THREE.Vector3(rm * Math.cos(a), .019 + .0064, -rm * Math.sin(a)), q.setFromEuler(e.set(0, a, 0)), new THREE.Vector3(1, 1, 1));
      frets.setMatrixAt(k, mtx);
    }
    rotor.add(frets);
    // turret: spindle + four arms with ball finials
    const turret = lathe([[.058, .0745], [.056, .079], [.046, .0815], [.03, .0835], [.021, .089], [.0145, .097], [.011, .106], [.0105, .124], [.0135, .128], [.0165, .1335], [.0135, .139], [.0095, .142], [.0095, .153], [.0145, .158], [.0185, .166], [.0165, .175], [.0105, .181], [.006, .1855], [.0045, .19], [.0075, .1945], [.0055, .1995], [0, .2015]], segs > 100 ? 64 : 40, chrome);
    rotor.add(turret);
    const armGeo = new THREE.CylinderGeometry(.0034, .0048, .082, 16); armGeo.rotateZ(Math.PI / 2); armGeo.translate(.052, 0, 0);
    const knobGeo = new THREE.SphereGeometry(.0085, 20, 14);
    const collarGeo = new THREE.CylinderGeometry(.0058, .0058, .006, 16); collarGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2 + Math.PI / 4; arm.position.y = .1335;
      const bar = new THREE.Mesh(armGeo, chrome); bar.castShadow = true;
      const knob = new THREE.Mesh(knobGeo, chrome); knob.position.x = .096; knob.castShadow = true;
      const collar = new THREE.Mesh(collarGeo, brass); collar.position.x = .0855;
      arm.add(bar, knob, collar); rotor.add(arm);
    }
    this.turretGeos = [armGeo, knobGeo, collarGeo, dGeo, fGeo];

    // ── the ball + motion-blur ghosts ──
    const ballMat = new THREE.MeshPhysicalMaterial({ color: 0xfbfaf6, roughness: .18, clearcoat: .8, clearcoatRoughness: .08, envMapIntensity: 1.2, sheen: .2 });
    const bGeo = new THREE.SphereGeometry(BALL_R, 32, 24);
    this.ball = new THREE.Mesh(bGeo, ballMat); this.ball.castShadow = true; this.ball.userData.ownGeo = this.ball.userData.ownMat = true;
    this.group.add(this.ball);
    this.ghosts = [];
    for (let i = 0; i < 5; i++) {
      const gm = new THREE.Mesh(bGeo, new THREE.MeshBasicMaterial({ color: 0xfdfbf4, transparent: true, opacity: 0, depthWrite: false }));
      gm.userData.ownMat = true; gm.visible = false; this.group.add(gm); this.ghosts.push(gm);
    }

    // clock / state
    this.t = 0;
    this.rot = { t0: 0, a0: rnd(0, TAU), A: 0, B: 0 };
    this.state = 'rest'; this.restK = 0; this.rest = { dPhi: 0, dR: 0 };
    this.plan = null; this.events = []; this.waiters = [];
    this.on = { clack() {}, thunk() {}, settle() {}, launch() {} };
    this.speed = 0;
    this._v = new THREE.Vector3();
    this.update(0);
  }

  // ── rotor: ω(t) = ω_idle + A·e^(−t/τ) + B·e^(−t/τu) since the last push ──
  rotorAngle(t) {
    const { t0, a0, A, B } = this.rot, s = Math.max(0, t - t0);
    return a0 + OMEGA_IDLE * s + A * TAU_DECAY * (1 - Math.exp(-s / TAU_DECAY)) + B * TAU_UP * (1 - Math.exp(-s / TAU_UP));
  }
  rotorOmega(t) {
    const { t0, A, B } = this.rot, s = Math.max(0, t - t0);
    return OMEGA_IDLE + A * Math.exp(-s / TAU_DECAY) + B * Math.exp(-s / TAU_UP);
  }
  // ball at rest in pocket k riding the rotor
  setRest(n) { this.state = 'rest'; this.restK = WHEEL.indexOf(n); this.rest = { dPhi: 0, dR: 0 }; }

  // Choreograph a spin that lands on `winner`. Returns key times on this wheel's clock.
  spin(winner) {
    const t = this.t, w = WHEEL.indexOf(winner);
    // the croupier pushes the rotor
    const a0 = this.rotorAngle(t), wCur = this.rotorOmega(t), A = OMEGA_PUSH - OMEGA_IDLE;
    this.rot = { t0: t, a0, A, B: wCur - OMEGA_IDLE - A };
    const P = {};
    P.pickup = t; P.launch = t + .8;
    P.orbit = rnd(4.3, 5.3); P.drop = rnd(1.05, 1.3);
    P.t1 = P.launch + P.orbit; P.t2 = P.t1 + P.drop;
    const w1 = TAU * rnd(.8, .9), w2 = TAU * rnd(.58, .66);
    // scatter: hops across the frets (pockets counted clockwise = the ball's way relative to the rotor)
    const hops = [
      { s: Math.floor(rnd(7, 11.99)) + Math.random(), dur: rnd(.42, .5), h: rnd(.017, .023), r1: R_POCKET + rnd(.004, .008) },
      { s: Math.floor(rnd(3, 5.99)), dur: rnd(.27, .33), h: rnd(.009, .013), r1: R_POCKET - rnd(.003, .006) },
      { s: Math.floor(rnd(1, 3.99)), dur: rnd(.19, .24), h: rnd(.005, .007), r1: R_POCKET + rnd(.002, .004) },
      { s: Math.random() < .45 ? -1 : 1, dur: rnd(.14, .17), h: rnd(.003, .0042), r1: R_POCKET - rnd(.001, .003) },
      { s: Math.random() < .5 ? 0 : 1, dur: rnd(.1, .13), h: rnd(.0015, .0025), r1: R_POCKET + .0015 }
    ];
    const S = hops.slice(1).reduce((a, h) => a + h.s, 0);
    const k1 = ((w - S) % N + N) % N;                      // the pocket the first big hop lands in
    const phiC = pocketAngle(k1) + hops[0].s * PW;          // rotor-frame angle where the ball meets the rotor
    // solve the launch speed so the orbit + drop brings the ball to phiC on the rotor at t2
    const Fdrop = -(w1 + w2) / 2 * P.drop;
    const Q = phiC + this.rotorAngle(P.t2) - LAUNCH_ANG - Fdrop;   // −(ω0+ω1)/2·T ≡ Q (mod 2π)
    const step = 4 * Math.PI / P.orbit, base = -2 * Q / P.orbit - w1, lo = TAU * 1.95;
    const w0 = base + step * Math.ceil((lo - base) / step);
    Object.assign(P, { w0, w1, w2, hops, phiC, winner, w });
    // hop timeline in the rotor frame
    let tt = P.t2, phi = phiC, r = R_ENTRY, y = ballY(R_ENTRY);
    this.events = [{ t: P.launch, type: 'launch' }];
    for (const [i, h] of hops.entries()) {
      // every hop crosses a whole number of frets; the last one lands a little off-centre and rocks home
      const phi1 = phi - h.s * PW + (i === hops.length - 1 ? (Math.random() < .5 ? -1 : 1) * .3 * PW : 0);
      Object.assign(h, { t0: tt, t1: tt + h.dur, phi0: phi, phi1, r0: r, y0: y });
      h.y1 = rotorBallY(h.r1);
      this.events.push({ t: tt, type: i === 0 ? 'thunk' : 'clack', v: i === 0 ? 1 : .9 - i * .15 });
      tt += h.dur; phi = phi1; r = h.r1; y = h.y1;
    }
    P.t3 = tt; P.settleDur = .9; P.end = tt + P.settleDur;
    P.rest0 = { dPhi: wrap(phi - pocketAngle(w) + Math.PI) - Math.PI, dR: r - R_POCKET };
    this.events.push({ t: tt, type: 'clack', v: .3 }, { t: tt + .05, type: 'settle' });
    // a diamond strike during the drop, if the ball's path crosses one on its way down
    // (footprint of each diamond + the ball's radius, radially and around)
    P.defl = null;
    for (let k = 0; k <= 400 && !P.defl; k++) {
      const s = k / 400, tHit = P.t1 + s * P.drop, r = R_TRACK - (R_TRACK - R_ENTRY) * Math.pow(s, 1.8);
      const th = this.worldBallAngle(tHit, P);
      DEFL_ANG.forEach((a, i) => {
        if (P.defl) return;
        const long = i % 2 === 0, dr = Math.abs(r - R_DEFL), da = Math.abs(wrap(th - a + Math.PI) - Math.PI) * R_DEFL;
        if (dr < (long ? .026 : .0085) + BALL_R && da < (long ? .0085 : .026) + BALL_R) P.defl = { t: tHit, dur: rnd(.18, .3), h: rnd(.006, .017), kick: rnd(.004, .014) };
      });
    }
    if (P.defl) this.events.push({ t: P.defl.t, type: 'clack', v: .5 + P.defl.h * 30 });
    // a few rattles on the track as the ball loses speed
    for (let k = 0; k < 3; k++) this.events.push({ t: P.t1 - rnd(.1, 1.2), type: 'clack', v: .25 });
    this.events.sort((a, b) => a.t - b.t);
    this.pickupFrom = null;
    this.plan = P; this.state = 'spin';
    return { pickup: P.pickup, launch: P.launch, drop: P.t1, contact: P.t2, landed: P.t3, end: P.end };
  }
  // world angle of the ball during orbit / drop (before contact)
  worldBallAngle(t, P = this.plan) {
    const tl = Math.max(0, t - P.launch);
    if (t <= P.t1) return LAUNCH_ANG - (P.w0 * tl - (P.w0 - P.w1) * tl * tl / (2 * P.orbit));
    const td = Math.min(P.drop, t - P.t1);
    return LAUNCH_ANG - (P.w0 + P.w1) / 2 * P.orbit - (P.w1 * td - (P.w1 - P.w2) * td * td / (2 * P.drop));
  }
  ballOmega(t, P = this.plan) {
    if (t < P.launch) return 0;
    if (t <= P.t1) return P.w0 - (P.w0 - P.w1) * (t - P.launch) / P.orbit;
    if (t <= P.t2) return P.w1 - (P.w1 - P.w2) * (t - P.t1) / P.drop;
    return 0;
  }

  // Promise that resolves when the wheel clock passes t
  when(t) { return new Promise(res => { if (this.t >= t) res(); else this.waiters.push({ t, res }); }); }

  update(dt) {
    this.t += dt;
    const t = this.t, rotA = this.rotorAngle(t);
    this.rotor.rotation.y = rotA;
    const b = this.ball.position;
    let ghostW = 0;
    const put = (theta, r, y) => b.set(r * Math.cos(theta), y, -r * Math.sin(theta));
    if (this.state === 'rest') {
      const phi = pocketAngle(this.restK) + this.rest.dPhi;
      put(phi + rotA, R_POCKET + this.rest.dR, Y_POCKET);
      this.speed = 0;
    } else if (this.state === 'spin') {
      const P = this.plan;
      if (t < P.launch) {
        // the croupier lifts the ball out of its pocket and carries it to the track
        if (!this.pickupFrom) { const phi = pocketAngle(this.restK) + this.rest.dPhi; this.pickupFrom = { th: phi + this.rotorAngle(P.pickup), r: R_POCKET + this.rest.dR, y: Y_POCKET }; }
        const s = Math.min(1, (t - P.pickup) / (P.launch - P.pickup)), e = smooth(s), f = this.pickupFrom;
        const dth = wrap(LAUNCH_ANG - f.th + Math.PI) - Math.PI;
        put(f.th + dth * e, lerp(f.r, R_TRACK, e), lerp(f.y, Y_TRACK, e) + Math.sin(s * Math.PI) * .07);
        this.speed = 0;
      } else if (t < P.t2) {
        const th = this.worldBallAngle(t);
        let r, y;
        if (t <= P.t1) {
          // on the track; a slight wobble as it slows
          const wob = Math.max(0, 1 - this.ballOmega(t) / (TAU * 1.4));
          r = R_TRACK - wob * .0016 * (1 + Math.sin(t * 23)); y = Y_TRACK;
        } else {
          const s = (t - P.t1) / P.drop;
          r = R_TRACK - (R_TRACK - R_ENTRY) * Math.pow(s, 1.8); y = ballY(r);
          if (P.defl && t > P.defl.t && t < P.defl.t + P.defl.dur) {
            const q = (t - P.defl.t) / P.defl.dur; y += Math.sin(q * Math.PI) * P.defl.h; r += Math.sin(q * Math.PI) * P.defl.kick;
          }
        }
        put(th, r, y);
        ghostW = this.ballOmega(t);
        this.speed = t <= P.t1 ? .35 + .65 * Math.min(1, this.ballOmega(t) / P.w0) : .3;
      } else if (t < P.t3) {
        const h = P.hops.find(hp => t < hp.t1) || P.hops[P.hops.length - 1];
        const q = Math.min(1, (t - h.t0) / h.dur);
        const phi = lerp(h.phi0, h.phi1, q), r = lerp(h.r0, h.r1, q);
        const y = lerp(h.y0, h.y1, q) + 4 * h.h * q * (1 - q);
        put(phi + rotA, r, y);
        this.speed = .18;
      } else {
        // rocking to rest inside the pocket
        const s = t - P.t3, dec = Math.exp(-s / .2), osc = Math.cos(s * TAU / .26);
        this.rest = { dPhi: P.rest0.dPhi * dec * osc, dR: P.rest0.dR * dec };
        this.restK = P.w;
        put(pocketAngle(P.w) + this.rest.dPhi + rotA, R_POCKET + this.rest.dR, Y_POCKET + Math.abs(osc) * dec * .0008);
        this.speed = 0;
        if (s > P.settleDur) { this.state = 'rest'; this.rest = { dPhi: 0, dR: 0 }; }
      }
      // fire sound / timing events
      while (this.events.length && this.events[0].t <= t) {
        const ev = this.events.shift();
        if (ev.type === 'clack') this.on.clack(ev.v); else if (ev.type === 'thunk') this.on.thunk(); else if (ev.type === 'settle') this.on.settle(); else if (ev.type === 'launch') this.on.launch();
      }
    }
    // motion blur: ghosts trail behind a fast ball
    const show = ghostW > 3;
    this.ghosts.forEach((g, i) => {
      g.visible = show;
      if (!show) return;
      // stretched along the direction of travel, overlapping: reads as a motion-blur streak
      const r = Math.hypot(b.x, b.z), th = Math.atan2(-b.z, b.x), d = ghostW * (1 / 60) * (i + 1) * .16;
      g.position.set(r * Math.cos(th + d), b.y, -r * Math.sin(th + d));
      g.rotation.y = th + d + Math.PI / 2; g.scale.set(1 + Math.min(1.4, ghostW * .08), .92, .92);
      g.material.opacity = Math.min(1, (ghostW - 3) / 6) * [.42, .3, .2, .12, .05][i];
    });
    for (let i = this.waiters.length - 1; i >= 0; i--) if (this.waiters[i].t <= t) { this.waiters[i].res(); this.waiters.splice(i, 1); }
  }

  // world positions (for cameras and labels)
  ballWorld(out = new THREE.Vector3()) { return this.ball.getWorldPosition(out); }
  ballAngle() { const b = this.ball.position; return Math.atan2(-b.z, b.x); }
  pocketWorld(n, out = new THREE.Vector3(), r = R_POCKET, y = Y_POCKET) {
    const th = pocketAngle(WHEEL.indexOf(n)) + this.rotor.rotation.y;
    out.set(r * Math.cos(th), y, -r * Math.sin(th));
    return this.group.localToWorld(out);
  }
  // world angle where the ball will be at wheel-clock time t (planning cameras)
  predictedAngle(t) {
    const P = this.plan; if (!P) return this.ballAngle();
    if (t < P.t2) return this.worldBallAngle(t);
    const h = P.hops.find(hp => t < hp.t1);
    const phi = h ? lerp(h.phi0, h.phi1, (t - h.t0) / h.dur) : pocketAngle(P.w);
    return phi + this.rotorAngle(t);
  }
  dispose() { for (const g of this.turretGeos) g.dispose(); for (const m of Object.values(this.mats)) { m.map?.dispose(); m.dispose(); } }
}
export const WHEEL_RADIUS = .462;
