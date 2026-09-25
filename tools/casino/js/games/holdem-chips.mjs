// Hold'em chips: every chip on the table drawn with one InstancedMesh per
// denomination (7 meshes × 3 material groups ≈ 21 draw calls for 400+ chips,
// instead of 3 draw calls per chip). Stacks are cheap value objects; moving
// one (a bet pushed forward, the pot swept to a winner) just marks the field
// dirty and the matrices are rewritten on the next frame.
import * as THREE from '../vendor/three.min.mjs';
import { CHIP } from '../core/props.mjs';

const ALL = [10, 25, 100, 500, 1000, 5000, 25000];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

// Denominations a player at these blinds would actually hold.
export function denomsFor(bb) {
  const sb = bb / 2, i = Math.max(0, ALL.findIndex(v => v >= sb));
  return ALL.slice(i, i + 4);
}
// Few chips: pots, bets, flying chips.
export function greedy(amount, denoms, max = 40) {
  const out = []; let left = Math.round(amount);
  for (const v of [...denoms].sort((a, b) => b - a)) while (left >= v && out.length < max) { out.push(v); left -= v; }
  if (left > 0 && !out.length) out.push(denoms[0]);
  return out;
}
// A player's stack: two or three colour columns, most of the value in the
// top colour, like a regular who has been racking up for an hour.
export function colourUp(amount, denoms) {
  const d = [...denoms].sort((a, b) => a - b), cols = [];
  let rem = Math.round(amount);
  if (rem <= 0) return cols;
  const top = [...d].reverse().find(v => amount / v >= 5) ?? d[0];
  const win = d.filter(v => v <= top).reverse().slice(0, 3);
  win.forEach((v, k) => {
    const last = k === win.length - 1;
    let n = Math.floor((last ? rem : rem * (win.length === 2 ? .7 : k === 0 ? .55 : .65)) / v);
    n = Math.min(n, last ? 18 : 40);
    if (n > 0) { cols.push([v, n]); rem -= n * v; }
  });
  for (const c of cols) { const add = Math.floor(rem / c[0]); if (add > 0) { c[1] += add; rem -= add * c[0]; } }
  if (!cols.length) cols.push([d[0], 1]);
  return cols;
}

export class Stack {
  constructor(field, { pos = new THREE.Vector3(), yaw = 0, style = 'bet', perCol = 12 } = {}) {
    this.field = field; this.pos = pos.clone(); this.yaw = yaw; this.style = style; this.perCol = perCol;
    this.amount = 0; this.chips = []; this.visible = true; this.lift = 0; this.tilt = 0;
    field.stacks.add(this);
  }
  set(amount) {
    amount = Math.max(0, Math.round(amount));
    if (amount === this.amount && this.chips.length) { return this; }
    this.amount = amount; this.layout(); this.field.dirty = true; return this;
  }
  layout() {
    const f = this.field, out = [];
    if (this.amount <= 0) { this.chips = out; return; }
    const jit = () => (Math.random() - .5) * .0014, yawR = () => Math.random() * Math.PI * 2;
    const pitch = CHIP.r * 2.08;
    if (this.style === 'stack') {
      // colour columns side by side (along local x), overflow into a second row
      const cols = [];
      for (const [v, n] of colourUp(this.amount, f.denoms)) for (let k = 0; k < n; k += this.perCol) cols.push([v, Math.min(this.perCol, n - k)]);
      const perRow = cols.length > 4 ? Math.ceil(cols.length / 2) : cols.length;
      cols.forEach(([v, n], ci) => {
        const row = Math.floor(ci / perRow), col = ci % perRow, inRow = Math.min(perRow, cols.length - row * perRow);
        const x = (col - (inRow - 1) / 2) * pitch + (row ? pitch * .5 : 0), z = row * pitch * .92;
        for (let k = 0; k < n; k++) out.push({ v, x: x + jit(), y: CHIP.h / 2 + k * CHIP.h * 1.003, z: z + jit(), r: yawR() });
      });
    } else {
      // bets and pots: tidy columns of mixed chips, hex-packed around the spot
      const list = greedy(this.amount, f.denoms, this.style === 'pot' ? 60 : 30);
      const per = this.style === 'pot' ? 9 : this.perCol, n = Math.ceil(list.length / per);
      const spots = [[0, 0], [1, 0], [.5, -.87], [-.5, -.87], [-1, 0], [-.5, .87], [.5, .87], [2, 0], [1.5, -.87]];
      for (let c = 0; c < n; c++) {
        const [sx, sz] = spots[c % spots.length], cx = sx * pitch * .98, cz = sz * pitch * .98;
        const slice = list.slice(c * per, (c + 1) * per);
        slice.forEach((v, k) => out.push({ v, x: cx + jit() * 1.6, y: CHIP.h / 2 + k * CHIP.h * 1.003, z: cz + jit() * 1.6, r: yawR() }));
      }
      if (n > 1 && this.style !== 'pot') { const cx = (n === 2 ? .5 : .33) * pitch; for (const c of out) c.x -= cx; }
    }
    this.chips = out;
  }
  // height of the tallest column (for labels)
  get height() { let h = 0; for (const c of this.chips) h = Math.max(h, c.y); return h + CHIP.h; }
  moveTo(v) { this.pos.copy(v); this.field.dirty = true; }
  touch() { this.field.dirty = true; }
  dispose() { this.field.stacks.delete(this); this.field.dirty = true; }
}

export class ChipField {
  constructor(chips, parent, { capacity = 320, denoms = [25, 100, 500, 1000], shadows = true } = {}) {
    this.denoms = denoms; this.stacks = new Set(); this.dirty = true; this.meshes = new Map();
    for (const v of ALL) {
      const m = new THREE.InstancedMesh(chips.geo, chips.mats.get(v), capacity);
      m.count = 0; m.castShadow = shadows; m.receiveShadow = true; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.userData.capacity = capacity;
      parent.add(m); this.meshes.set(v, m);
    }
  }
  stack(opts) { return new Stack(this, opts); }
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const idx = new Map(ALL.map(v => [v, 0]));
    for (const s of this.stacks) {
      if (!s.visible || !s.chips.length) continue;
      const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
      for (const c of s.chips) {
        const m = this.meshes.get(c.v) || this.meshes.get(10), i = idx.get(c.v) ?? 0;
        if (i >= m.userData.capacity) continue;
        _p.set(s.pos.x + c.x * cy + c.z * sy, s.pos.y + s.lift + c.y, s.pos.z - c.x * sy + c.z * cy);
        _e.set(s.tilt, c.r, 0); _q.setFromEuler(_e);
        _m.compose(_p, _q, _s); m.setMatrixAt(i, _m); idx.set(c.v, i + 1);
      }
    }
    for (const [v, m] of this.meshes) { m.count = idx.get(v); m.instanceMatrix.needsUpdate = true; }
  }
  dispose() { for (const m of this.meshes.values()) { m.parent?.remove(m); m.dispose(); } this.meshes.clear(); this.stacks.clear(); }
}
