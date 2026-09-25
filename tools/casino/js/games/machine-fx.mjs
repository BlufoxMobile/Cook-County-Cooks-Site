// Celebration effects shared by the machines: an instanced 3D gold-coin shower
// and a quick camera nudge. Cosmetic randomness only (Math.random is fine here).
import * as THREE from '../vendor/three.min.mjs';
import { FONT_DISPLAY } from '../core/textures.mjs';
import { makeCanvas, canvasTex } from './machine-cabinet.mjs';

const R = .021, H = .0035;
function coinFace() {
  const S = 256, cv = makeCanvas(S, S), c = cv.getContext('2d');
  const g = c.createRadialGradient(S * .38, S * .32, 8, S / 2, S / 2, S * .55);
  g.addColorStop(0, '#fff3c0'); g.addColorStop(.45, '#f0c261'); g.addColorStop(.85, '#b17d27'); g.addColorStop(1, '#7c5415');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  c.strokeStyle = 'rgba(110,70,15,.7)'; c.lineWidth = 7; c.beginPath(); c.arc(S / 2, S / 2, S * .4, 0, 7); c.stroke();
  c.strokeStyle = 'rgba(255,240,190,.6)'; c.lineWidth = 3; c.beginPath(); c.arc(S / 2, S / 2, S * .36, 0, 7); c.stroke();
  for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; c.fillStyle = k % 2 ? 'rgba(120,80,20,.5)' : 'rgba(255,236,170,.5)'; c.fillRect(S / 2 + Math.cos(a) * S * .45 - 3, S / 2 + Math.sin(a) * S * .45 - 3, 6, 6); }
  c.fillStyle = '#7a5214'; c.font = `700 ${S * .38}px ${FONT_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('C³', S / 2 + 3, S / 2 + 6); c.fillStyle = '#ffe9a8'; c.fillText('C³', S / 2, S / 2 + 2);
  return canvasTex(cv);
}

export class CoinShower {
  constructor(stage, parent, { max } = {}) {
    this.stage = stage;
    this.max = max ?? ({ high: 160, mid: 90, low: 45 }[stage.tier] || 90);
    const face = coinFace();
    const faceMat = new THREE.MeshStandardMaterial({ map: face, metalness: .8, roughness: .36, envMapIntensity: 1.0, color: 0xffffff });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xd9a646, metalness: 1, roughness: .38, envMapIntensity: 1.0 });
    this.mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(R, R, H, 28), [edgeMat, faceMat, faceMat], this.max);
    this.mesh.userData.ownGeo = true; this.mesh.userData.ownMat = true;
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 8;
    parent.add(this.mesh);
    this.coins = [];
    this.dummy = new THREE.Object3D();
    this.active = false; this.rate = 0; this.acc = 0;
    this.box = { x: .5, top: .9, bottom: -.75, z0: .08, z1: .62 };
  }
  // rate: coins per second while running; burst: coins launched upward from below at once
  start({ rate = 60, dur = 2.5, burst = 0 } = {}) {
    this.active = true; this.rate = rate * (this.max / 160); this.until = dur;
    for (let i = 0; i < burst * (this.max / 160); i++) this.spawn(true);
  }
  stop() { this.active = false; }
  spawn(up = false) {
    if (this.coins.length >= this.max) return;
    const b = this.box, z = b.z0 + Math.random() * (b.z1 - b.z0);
    const c = {
      p: new THREE.Vector3((Math.random() - .5) * 2 * b.x, up ? b.bottom + Math.random() * .1 : b.top + Math.random() * .25, z),
      v: new THREE.Vector3((Math.random() - .5) * .5, up ? 2.1 + Math.random() * 1.2 : -.2 - Math.random() * .5, (Math.random() - .5) * .2),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3((Math.random() - .5) * 16, (Math.random() - .5) * 6, (Math.random() - .5) * 16)
    };
    if (up) c.p.x *= .6;
    this.coins.push(c);
  }
  update(dt) {
    if (this.active) {
      this.until -= dt; if (this.until <= 0) this.active = false;
      this.acc += this.rate * dt; while (this.acc >= 1) { this.acc--; this.spawn(false); }
    }
    if (!this.coins.length) { if (this.mesh.count) { this.mesh.count = 0; } return; }
    const g = -2.6, b = this.box;
    this.coins = this.coins.filter(c => c.p.y > b.bottom - .2);
    let i = 0;
    for (const c of this.coins) {
      c.v.y += g * dt; c.v.x *= 1 - dt * .3;
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
      this.dummy.position.copy(c.p); this.dummy.rotation.copy(c.r); this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i++, this.dummy.matrix);
    }
    this.mesh.count = i; this.mesh.instanceMatrix.needsUpdate = true;
  }
  get busy() { return this.active || this.coins.length > 0; }
  clear() { this.coins = []; this.active = false; this.mesh.count = 0; }
}

// a short push toward the screen and back (does not replace the base view)
export async function nudge(stage, amt = .06) {
  const cam = stage.camera.position, look = stage.look;
  const dir = new THREE.Vector3().subVectors(look, cam).normalize();
  const pos = cam.clone().addScaledVector(dir, amt);
  await stage.shot({ pos: pos.toArray(), look: look.toArray(), fov: stage.camera.fov }, .16, 'outCubic');
  await stage.back(.55);
}
