// Physical objects on the tables: cards, chips, dice, the dealer button.
// Units are metres. Cards and chips are real casino sizes, so the camera
// rules in stage.mjs read like a person sitting at a real table.
import * as THREE from '../vendor/three.min.mjs';
import { RoundedBoxGeometry } from '../vendor/three.min.mjs';
import { cardAtlas, cardUV, DENOMS, chipFaceCanvas, chipEdgeCanvas, diceFaceCanvas } from './textures.mjs';
import { ease } from './tween.mjs';

export const CARD = { w: .0756, h: .1056, t: .0004 };   // 1.2x real size: reads on a phone
export const CHIP = { r: .028, h: .0048 };               // ~1.45x real size, same reason

// ── cards ───────────────────────────────────────────────────────────────
export class CardFactory {
  constructor(stage) { this.stage = stage; this.geoCache = new Map(); this.ready = this.init(); }
  async init() {
    this.atlas = await cardAtlas(this.stage.renderer);
    this.mat = new THREE.MeshStandardMaterial({ map: this.atlas.tex, color: 0xdedede, roughness: .5, metalness: 0, envMapIntensity: .12 });
    // keep card whites from blooming into a glow under the key light
    if (this.stage.cfg.bloom) this.mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
      '#include <opaque_fragment>\n{ float pk = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b); if (pk > 1.22) gl_FragColor.rgb *= 1.22 / pk; }'); };
    const s = new THREE.Shape(), w = CARD.w, h = CARD.h, r = .0046;
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    this.shape = new THREE.ShapeGeometry(s, 5);
    this.backGeo = this.geo(0, 0);
  }
  geo(r, s) {
    const key = r + ':' + s;
    if (this.geoCache.has(key)) return this.geoCache.get(key);
    const g = this.shape.clone(), pos = g.attributes.position, uv = g.attributes.uv, q = cardUV(r, s);
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + CARD.w / 2) / CARD.w, v = (pos.getY(i) + CARD.h / 2) / CARD.h;
      uv.setXY(i, q.u0 + (q.u1 - q.u0) * u, q.v0 + (q.v1 - q.v0) * v);
    }
    uv.needsUpdate = true;
    this.geoCache.set(key, g);
    return g;
  }
  // card = {r,s} or null for an unknown (always face-down) card
  make(card = null, faceUp = false) {
    const grp = new THREE.Group();
    const front = new THREE.Mesh(card ? this.geo(card.r, card.s) : this.backGeo, this.mat);
    front.rotation.x = -Math.PI / 2; front.position.y = CARD.t / 2; front.castShadow = true;
    const back = new THREE.Mesh(this.backGeo, this.mat);
    back.rotation.x = Math.PI / 2; back.position.y = -CARD.t / 2; back.castShadow = true;
    grp.add(front, back);
    grp.userData = { card, front, back, faceUp };
    grp.rotation.z = faceUp ? 0 : Math.PI;
    grp.setCard = c => { grp.userData.card = c; front.geometry = c ? this.geo(c.r, c.s) : this.backGeo; };
    return grp;
  }
}

// Deal a card from `from` (Vector3) to a target transform with a gentle arc.
// opts: {faceUp, dur, rotY, lift, flipDuring}
export async function dealCard(tw, cardObj, from, to, { faceUp = true, dur = .42, rotY = 0, lift = .03, delay = 0 } = {}) {
  cardObj.position.copy(from);
  cardObj.rotation.set(0, rotY + (Math.random() - .5) * .5, Math.PI);
  const start = cardObj.position.clone(), endRotZ = faceUp ? 0 : Math.PI, startRotY = cardObj.rotation.y;
  const jitter = (Math.random() - .5) * .05;
  await tw.run(dur, (e, p) => {
    cardObj.position.lerpVectors(start, to, e);
    cardObj.position.y = THREE.MathUtils.lerp(start.y, to.y, e) + Math.sin(p * Math.PI) * lift;
    cardObj.rotation.y = THREE.MathUtils.lerp(startRotY, rotY + jitter, e);
    // turn over in the second half of the flight when dealt face up
    if (faceUp) cardObj.rotation.z = Math.PI * (1 - ease.inOutCubic(Math.max(0, (p - .35) / .65)));
  }, { ease: 'outCubic', delay });
  cardObj.rotation.z = endRotZ;
  cardObj.userData.faceUp = faceUp;
}
export async function flipCard(tw, cardObj, { dur = .38, lift = .035, axis = 'z' } = {}) {
  const y0 = cardObj.position.y, from = cardObj.rotation[axis], to = cardObj.userData.faceUp ? Math.PI : 0;
  await tw.run(dur, (e, p) => {
    cardObj.rotation[axis] = from + (to - from) * e;
    cardObj.position.y = y0 + Math.sin(p * Math.PI) * lift;
  }, { ease: 'inOutCubic' });
  cardObj.position.y = y0;
  cardObj.userData.faceUp = !cardObj.userData.faceUp;
}

// ── chips ───────────────────────────────────────────────────────────────
export class ChipFactory {
  constructor(stage) {
    this.stage = stage;
    this.geo = new THREE.CylinderGeometry(CHIP.r, CHIP.r, CHIP.h, 44, 1);
    this.mats = new Map();
    const aniso = Math.min(8, stage.renderer.capabilities.getMaxAnisotropy());
    for (const d of DENOMS) {
      const face = new THREE.CanvasTexture(chipFaceCanvas(d, 256)); face.colorSpace = THREE.SRGBColorSpace; face.anisotropy = aniso;
      const edge = new THREE.CanvasTexture(chipEdgeCanvas(d)); edge.colorSpace = THREE.SRGBColorSpace; face.userData.shared = edge.userData.shared = true;
      const common = { roughness: .42, metalness: .02, envMapIntensity: .45 };
      this.mats.set(d.v, [new THREE.MeshStandardMaterial({ map: edge, ...common }), new THREE.MeshStandardMaterial({ map: face, ...common }), new THREE.MeshStandardMaterial({ map: face, ...common })]);
    }
  }
  chip(v) {
    const m = new THREE.Mesh(this.geo, this.mats.get(v) || this.mats.get(10));
    m.castShadow = true; m.receiveShadow = true; m.userData.v = v;
    m.rotation.y = Math.random() * Math.PI * 2;
    return m;
  }
  // amount -> list of denominations (largest first), capped at `max` chips
  static breakdown(amount, max = 22) {
    const out = []; let left = Math.round(amount);
    const ds = DENOMS.map(d => d.v).sort((a, b) => b - a);
    for (const v of ds) { while (left >= v && out.length < max) { out.push(v); left -= v; } }
    if (left > 0 && out.length < max) out.push(10);
    return out;
  }
  // Build a neat stack group for an amount
  stack(amount, { max = 22 } = {}) {
    const g = new THREE.Group(); g.userData.amount = amount;
    ChipFactory.breakdown(amount, max).forEach((v, i) => {
      const c = this.chip(v);
      c.position.set((Math.random() - .5) * .0012, CHIP.h / 2 + i * CHIP.h * 1.002, (Math.random() - .5) * .0012);
      g.add(c);
    });
    return g;
  }
}

// A betting spot's chips: owns its group, animates additions and payouts.
export class ChipPile {
  constructor(stage, chips, parent, pos) {
    this.stage = stage; this.chips = chips; this.parent = parent;
    this.group = new THREE.Group(); this.group.position.copy(pos); parent.add(this.group);
    this.amount = 0;
  }
  rebuild() {
    for (const c of [...this.group.children]) this.group.remove(c);
    if (this.amount <= 0) return;
    // up to 3 columns when the stack is tall, like a dealer "colours up"
    const list = ChipFactory.breakdown(this.amount, 36), per = 14;
    list.forEach((v, i) => {
      const col = Math.floor(i / per), idx = i % per, c = this.chips.chip(v);
      const off = [[0, 0], [CHIP.r * 2.05, 0], [CHIP.r * 1.02, -CHIP.r * 1.8]][col] || [0, 0];
      c.position.set(off[0] + (Math.random() - .5) * .001, CHIP.h / 2 + idx * CHIP.h * 1.002, off[1] + (Math.random() - .5) * .001);
      this.group.add(c);
    });
  }
  set(amount) { this.amount = Math.max(0, Math.round(amount)); this.rebuild(); }
  worldTop() { const v = new THREE.Vector3(), s = new THREE.Vector3(); this.group.getWorldPosition(v); this.group.getWorldScale(s); v.y += (Math.min(14, ChipFactory.breakdown(this.amount, 36).length) * CHIP.h + .01) * s.y; return v; }
  // fly a single chip in from a world position, then settle the stack
  async add(v, fromWorld, tw, { dur = .34 } = {}) {
    const c = this.chips.chip(v); this.stage.scene.add(c);
    const target = this.worldTop(); c.position.copy(fromWorld);
    const start = fromWorld.clone();
    this.amount += v;              // the bet counts the moment it leaves your hand; the stack catches up
    await tw.run(dur, (e, p) => { c.position.lerpVectors(start, target, e); c.position.y += Math.sin(p * Math.PI) * .06; c.rotation.x = (1 - e) * 1.2; }, { ease: 'outCubic' });
    this.stage.scene.remove(c);
    this.rebuild();
  }
  // animate the whole pile to another world point (collect or pay out)
  async sweepTo(worldPoint, tw, { dur = .5, remove = true } = {}) {
    if (this.amount <= 0) return;
    const g = this.group, parent = g.parent, wp = new THREE.Vector3(); g.getWorldPosition(wp);
    this.stage.scene.attach(g);
    const start = wp.clone();
    await tw.run(dur, (e, p) => { g.position.lerpVectors(start, worldPoint, e); g.position.y += Math.sin(p * Math.PI) * .05; }, { ease: 'inOutCubic' });
    if (remove) { this.stage.scene.remove(g); this.group = new THREE.Group(); this.group.position.copy(parent.worldToLocal(start.clone())); this.group.scale.copy(g.scale); parent.add(this.group); this.amount = 0; }
    else { parent.attach(g); }
  }
  clear() { this.set(0); }
  dispose() { this.parent.remove(this.group); }
}

// ── dice ────────────────────────────────────────────────────────────────
export const DIE = .026;
// Face values for BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z (opposites sum to 7)
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
let dieMats = null;
export function makeDie() {
  if (!dieMats) dieMats = FACE_VALUES.map(n => {
    const t = new THREE.CanvasTexture(diceFaceCanvas(n)); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: .16, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: .9 });
  });
  const m = new THREE.Mesh(new RoundedBoxGeometry(DIE, DIE, DIE, 3, .0032), dieMats);
  m.castShadow = true; m.userData.ownGeo = true;
  return m;
}
// quaternion that puts `value` on top, with a yaw
export function dieRestQuat(value, yaw = 0) {
  const i = FACE_VALUES.indexOf(value);
  const q = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[i], new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}

// ── dealer button / puck ────────────────────────────────────────────────
export function makePuck(text = 'D', { r = .024, face = '#f4efe3', ink = '#15161a' } = {}) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = face; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill();
  c.strokeStyle = '#b8914a'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 54, 0, 7); c.stroke();
  c.fillStyle = ink; c.font = '800 60px Archivo, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const side = new THREE.MeshStandardMaterial({ color: face, roughness: .4 });
  const top = new THREE.MeshStandardMaterial({ map: t, roughness: .4 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .008, 40), [side, top, top]);
  m.castShadow = true; m.position.y = .004;
  m.userData.setText = (s, fg = ink, bg = face) => {
    c.fillStyle = bg; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill();
    c.strokeStyle = '#b8914a'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 54, 0, 7); c.stroke();
    c.fillStyle = fg; c.font = `800 ${s.length > 2 ? 40 : 60}px Archivo, Arial, sans-serif`; c.fillText(s, 64, 68); t.needsUpdate = true;
    side.color.set(bg);
  };
  return m;
}
