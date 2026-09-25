// The throw. The outcome is decided first (crypto RNG, by the caller); this file
// only makes it look right.
//
// 1. A small rigid-body simulation of two cubes: gravity, corner contacts with
//    impulses (restitution + Coulomb friction) against the felt, the four walls
//    (the far wall's pyramids kick the dice off at random angles) and each other.
//    It is run ahead of time, many candidate throws per roll, and the best one is
//    kept: both dice must reach the back wall, stay inside the tub, come to rest
//    flat, apart, visible and clear of the chips.
// 2. The simulated die lands on whatever face physics chose. Each die is given a
//    constant body-frame rotation D (a symmetry of the cube) from the very first
//    frame so that the face physics put on top IS the value that was rolled. The
//    motion is untouched frame for frame, and the last few centimetres of the
//    final roll ease into the exact dieRestQuat(value, yaw) — nothing ever snaps.
import * as THREE from '../vendor/three.min.mjs';
import { DIE, dieRestQuat } from '../core/props.mjs';
import { X0, X1, Z0, Z1, WALL_H } from './craps-layout.mjs';

const H = DIE / 2, HC = H * .93;                   // rounded corners sit a little inside the box
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
const CORNERS = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push(new THREE.Vector3(x * HC, y * HC, z * HC));
const G = 9.8, DT = 1 / 480, REC = 4;              // record every 4th step: 120 fps samples
const MASS = 1, INV_M = 1, INV_I = 6 / (MASS * DIE * DIE);
const UP = new THREE.Vector3(0, 1, 0);
const WALLS = [
  { n: new THREE.Vector3(1, 0, 0), d: X0, e: .45, mu: .22, name: 'left' },
  { n: new THREE.Vector3(-1, 0, 0), d: -X1, e: .45, mu: .22, name: 'right' },
  { n: new THREE.Vector3(0, 0, 1), d: Z0, e: .55, mu: .25, name: 'back', pyramids: true },
  { n: new THREE.Vector3(0, 0, -1), d: -Z1, e: .45, mu: .22, name: 'front' }
];

class Body {
  constructor(p, v, w, q) { this.p = p.clone(); this.v = v.clone(); this.w = w.clone(); this.q = q.clone(); this.sleep = 0; this.asleep = false; this.lastHit = -1; }
}
const _r = new THREE.Vector3(), _vc = new THREE.Vector3(), _t = new THREE.Vector3(), _tmp = new THREE.Vector3(), _rn = new THREE.Vector3();
// impulse at world offset r with contact normal n; returns normal impulse
function contact(b, r, n, e, mu) {
  _vc.copy(b.w).cross(r).add(b.v);
  const vn = _vc.dot(n);
  if (vn >= 0) return 0;
  _rn.copy(r).cross(n);
  const k = INV_M + INV_I * _rn.lengthSq();
  const eff = vn < -.25 ? e : 0;
  const jn = -(1 + eff) * vn / k;
  b.v.addScaledVector(n, jn * INV_M);
  b.w.addScaledVector(_rn, jn * INV_I);
  // friction
  _vc.copy(b.w).cross(r).add(b.v);
  _t.copy(_vc).addScaledVector(n, -_vc.dot(n));
  const vt = _t.length();
  if (vt > 1e-6) {
    _t.multiplyScalar(1 / vt);
    _tmp.copy(r).cross(_t);
    const kt = INV_M + INV_I * _tmp.lengthSq();
    const jt = Math.min(vt / kt, mu * jn);
    b.v.addScaledVector(_t, -jt * INV_M);
    b.w.addScaledVector(_tmp, -jt * INV_I);
  }
  return jn;
}
const cornerWorld = (b, i, out) => out.copy(CORNERS[i]).applyQuaternion(b.q);

// Run one throw. start/vel/spin: arrays of two Vector3; q: two quaternions.
export const PHYS = { feltE: .4, feltMu: .2, wallE: .62, backE: .9, spinDamp: .35, rollDamp: .12, air: .04 };
export function simulate({ start, vel, spin, q, jitter = Math.random, maxT = 5, phys = PHYS }) {
  const bodies = [0, 1].map(i => new Body(start[i], vel[i], spin[i], q[i]));
  const frames = [], hits = [], stats = { back: [false, false], escaped: false, firstFloor: [null, null] };
  const wq = new THREE.Quaternion(), rw = new THREE.Vector3();
  let t = 0, step = 0;
  const hit = (t, v, who) => { const b = bodies[who]; if (t - b.lastHit < .045) return; b.lastHit = t; hits.push({ t, v: Math.min(1, v) }); };
  while (t < maxT) {
    for (let bi = 0; bi < 2; bi++) {
      const b = bodies[bi];
      if (b.asleep) continue;
      b.v.y -= G * DT;
      b.p.addScaledVector(b.v, DT);
      // orientation: q += 0.5 * (0,w) * q * dt
      wq.set(b.w.x, b.w.y, b.w.z, 0).multiply(b.q);
      b.q.set(b.q.x + wq.x * .5 * DT, b.q.y + wq.y * .5 * DT, b.q.z + wq.z * .5 * DT, b.q.w + wq.w * .5 * DT).normalize();
      // air drag / spin decay
      b.v.multiplyScalar(1 - phys.air * DT); b.w.multiplyScalar(1 - .25 * DT);
      // contacts: a few relaxation passes over the corners
      let onFloor = 0;
      for (let it = 0; it < 3; it++) {
        let pen = 0;
        for (let i = 0; i < 8; i++) {
          cornerWorld(b, i, rw); const y = b.p.y + rw.y;
          if (y < 0) {
            pen = Math.max(pen, -y);
            const jn = contact(b, rw, UP, phys.feltE, phys.feltMu);
            if (it === 0 && jn > .05 * MASS) { hit(t, jn / (.9 * MASS), bi); if (stats.firstFloor[bi] === null) stats.firstFloor[bi] = t; }
          }
          if (it === 0 && y < .0015) onFloor++;
        }
        if (pen > 0) b.p.y += pen;
        for (const w of WALLS) {
          let wpen = 0;
          for (let i = 0; i < 8; i++) {
            cornerWorld(b, i, rw);
            const dist = _tmp.copy(b.p).add(rw).dot(w.n) - w.d;
            if (dist < 0) {
              wpen = Math.max(wpen, -dist);
              let n = w.n;
              if (w.pyramids) n = _r.set(w.n.x + (jitter() - .5) * .7, w.n.y + (jitter() - .3) * .35, w.n.z).normalize().clone();
              const jn = contact(b, rw, n, w.pyramids ? phys.backE : phys.wallE, w.mu);
              if (jn > .02 && it === 0) {
                hit(t, jn / (.7 * MASS) + .25, bi);
                if (w.pyramids) { stats.back[bi] = true; b.w.x += (jitter() - .5) * 30; b.w.y += (jitter() - .5) * 30; }
                if (b.p.y > WALL_H - .004) stats.escaped = true;
              }
            }
          }
          if (wpen > 0) b.p.addScaledVector(w.n, wpen);
        }
      }
      if (onFloor >= 1) { b.w.multiplyScalar(1 - phys.spinDamp * DT); b.v.multiplyScalar(1 - phys.rollDamp * DT); }
      // near rest on a face: felt soaks up the last of the energy, then sleep
      const flat = onFloor >= 4, v2 = b.v.lengthSq(), w2 = b.w.lengthSq();
      if (flat && v2 < .01 && w2 < 9) { b.w.multiplyScalar(1 - 7 * DT); b.v.multiplyScalar(1 - 5 * DT); }
      if (flat && v2 < .0009 && w2 < 1.4) { b.sleep += DT; if (b.sleep > .1) { b.asleep = true; b.v.set(0, 0, 0); b.w.set(0, 0, 0); } }
      else b.sleep = Math.max(0, b.sleep - DT * .5);
    }
    // die against die: spheres are close enough for the glancing hits dice make
    const [a, b] = bodies;
    if (!(a.asleep && b.asleep)) {
      _tmp.copy(b.p).sub(a.p); const d = _tmp.length(), R = H * 2.05;
      if (d < R && d > 1e-6) {
        const n = _tmp.multiplyScalar(1 / d), vr = _r.copy(b.v).sub(a.v).dot(n);
        const over = R - d;
        a.p.addScaledVector(n, -over / 2); b.p.addScaledVector(n, over / 2);
        if (vr < 0) {
          const j = -(1 + .5) * vr / (2 * INV_M);
          a.v.addScaledVector(n, -j * INV_M); b.v.addScaledVector(n, j * INV_M);
          a.w.x += (jitter() - .5) * 18 * j; b.w.z += (jitter() - .5) * 18 * j;
          a.asleep = b.asleep = false; a.sleep = b.sleep = 0;
          if (j > .03) { hits.push({ t, v: Math.min(1, j * 1.5) }); }
        }
      }
    }
    if (step % REC === 0) frames.push(bodies.map(b => ({ p: b.p.clone(), q: b.q.clone() })));
    step++; t += DT;
    if (a.asleep && b.asleep) break;
  }
  frames.push(bodies.map(b => ({ p: b.p.clone(), q: b.q.clone() })));
  return { frames, hits: hits.sort((x, y) => x.t - y.t), stats, duration: (frames.length - 1) * DT * REC, bodies, settled: bodies.every(b => b.asleep) };
}

// which face is up (index into FACE_VALUES) for an orientation
function upFace(q) {
  const inv = q.clone().invert(), up = UP.clone().applyQuaternion(inv);
  let best = 0, bd = -2;
  FACE_N.forEach((n, i) => { const d = n.dot(up); if (d > bd) { bd = d; best = i; } });
  return { i: best, tilt: Math.acos(Math.min(1, bd)) };
}

// Plan a throw that ends on [v1, v2]. opts: {from:{x,z}, strength 0..1, aim -1..1,
// avoid:[{x,z,r}], zone:{x0,x1,z0,z1}} — returns a playable plan.
export function planThrow(values, { from = { x: .9, z: .56 }, strength = .6, aim = 0, avoid = [], zone = { x0: -.6, x1: 1.25, z0: -.55, z1: .42 }, tries = 36 } = {}) {
  let best = null;
  for (let k = 0; k < tries; k++) {
    const rnd = Math.random, s = THREE.MathUtils.clamp(strength + (rnd() - .5) * .25, 0, 1);
    const sx = from.x - .05 + rnd() * .04, sz = from.z - .02;
    const tx = THREE.MathUtils.clamp(sx - .25 + aim * .45 + (rnd() - .5) * .5, X0 + .5, X1 - .2), tz = Z0;
    const dir = new THREE.Vector3(tx - sx, 0, tz - sz).normalize();
    const speed = 3.2 + 1.6 * s + (rnd() - .5) * .3;
    const start = [new THREE.Vector3(sx, .19 + rnd() * .03, sz), new THREE.Vector3(sx + .03 + rnd() * .02, .2 + rnd() * .03, sz + .012)];
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const vel = start.map((p, i) => dir.clone().multiplyScalar(speed * (1 + (i ? .04 : -.03) + (rnd() - .5) * .06)).addScaledVector(side, (rnd() - .5) * .25).setY(.3 + s * .5 + rnd() * .2));
    const spin = [0, 1].map(() => new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize().multiplyScalar(22 + 26 * s + rnd() * 10));
    const q = [0, 1].map(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3)));
    const sim = simulate({ start, vel, spin, q, jitter: rnd });
    // score it
    const rest = sim.bodies.map(b => b.p);
    let score = 0;
    if (!sim.settled) score -= 100;
    if (sim.stats.escaped) score -= 200;
    if (!sim.stats.back[0] || !sim.stats.back[1]) score -= sim.stats.back[0] || sim.stats.back[1] ? 25 : 60;
    for (const p of rest) {
      if (p.x < zone.x0 || p.x > zone.x1 || p.z < zone.z0 || p.z > zone.z1) score -= 30;
      for (const a of avoid) { const d = Math.hypot(p.x - a.x, p.z - a.z); if (d < a.r + .03) score -= 40; }
    }
    const sep = rest[0].distanceTo(rest[1]);
    if (sep < DIE * 1.5) score -= 25; if (sep > .38) score -= 12;
    for (const b of sim.bodies) { const f = upFace(b.q); if (f.tilt > .12) score -= 50; }
    if (sim.duration > 3) score -= 8; if (sim.duration < .9) score -= 8;
    score -= Math.abs(sim.duration - 1.6) * 3;
    if (!best || score > best.score) best = { sim, score };
    if (score > -6) break;
  }
  return finish(best.sim, values);
}

// turn a simulation into a playback plan that shows `values`
function finish(sim, values) {
  const n = sim.frames.length, dice = [0, 1].map(i => {
    const last = sim.frames[n - 1][i], f = upFace(last.q);
    // exact flat rest orientation (tiny correction) keeping the yaw physics chose
    const faceWorld = FACE_N[f.i].clone().applyQuaternion(last.q);
    const flat = new THREE.Quaternion().setFromUnitVectors(faceWorld, UP).multiply(last.q);
    // D maps the rolled value's face onto the face physics put on top
    const want = FACE_N[FACE_VALUES.indexOf(values[i])];
    const D = new THREE.Quaternion().setFromUnitVectors(want, FACE_N[f.i]);
    const finalQ = flat.clone().multiply(D);
    // the yaw of that final pose, so it can be written as dieRestQuat(value, yaw)
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(finalQ.clone().multiply(dieRestQuat(values[i], 0).invert()));
    const yaw = Math.atan2(-fwd.z, fwd.x);
    return { D, flat, finalQ: dieRestQuat(values[i], yaw), rest: new THREE.Vector3(last.p.x, H, last.p.z), yaw };
  });
  // when does each die start its final low roll? (last hit above a threshold)
  const settleFrom = [0, 1].map(i => {
    let k = n - 1;
    while (k > 0 && sim.frames[k][i].p.distanceTo(sim.frames[n - 1][i].p) < .012 && Math.abs(sim.frames[k][i].p.y - H) < .004) k--;
    return Math.max(0, k - 12);
  });
  const backHit = sim.hits.find(h => h.v > .3 && h.t > .15)?.t ?? .5;
  return { ...sim, dice, settleFrom, values, backHit, frameDt: DT * REC };
}

// sample a plan at time t into two {p, q} poses
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
export function samplePlan(plan, t, out) {
  const n = plan.frames.length, f = Math.min(n - 1, Math.max(0, t / plan.frameDt)), i = Math.floor(f), a = f - i, j = Math.min(n - 1, i + 1);
  for (let d = 0; d < 2; d++) {
    const A = plan.frames[i][d], B = plan.frames[j][d], o = out[d], die = plan.dice[d];
    o.p.lerpVectors(A.p, B.p, a);
    _qa.copy(A.q).slerp(B.q, a).multiply(die.D);
    // ease into the exact rest pose over the final settle
    const s0 = plan.settleFrom[d], k = THREE.MathUtils.clamp((f - s0) / Math.max(1, n - 1 - s0), 0, 1);
    if (k > 0) {
      const e = k * k * (3 - 2 * k);
      _qa.slerp(die.finalQ, e);
      o.p.y += (H - o.p.y) * e;
      o.p.x += (die.rest.x - o.p.x) * e; o.p.z += (die.rest.z - o.p.z) * e;
    }
    o.q.copy(_qa);
  }
  return out;
}
export { upFace, FACE_VALUES };
