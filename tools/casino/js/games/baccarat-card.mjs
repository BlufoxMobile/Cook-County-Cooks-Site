// Bendable playing card for the baccarat squeeze.
// Same size, atlas and conventions as props.mjs cards (a Group lying flat in
// XZ; face up = rotation.z 0, face down = π; dealCard/flipCard work on it),
// but the card is a subdivided sheet (face layer + back layer) that can be
// peeled around a cylinder, like a real card lifted at the corner.
import * as THREE from '../vendor/three.min.mjs';
import { CARD } from '../core/props.mjs';
import { cardUV } from '../core/textures.mjs';

const NX = 14, NZ = 20, V = (NX + 1) * (NZ + 1);

export class BendCards {
  constructor(cardFactory) {
    // rounded corners come from the atlas alpha (the flat props cards use a rounded Shape instead)
    this.mat = cardFactory.mat.clone();
    this.mat.alphaTest = .5;
    this.mat.side = THREE.FrontSide;
    const idx = [];
    const at = (i, j) => j * (NX + 1) + i;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      idx.push(a, d, b, b, d, c);                                  // face layer, normal +y
      idx.push(a + V, b + V, d + V, b + V, c + V, d + V);         // back layer, normal -y
    }
    this.index = new THREE.BufferAttribute(new Uint16Array(idx), 1);
    this.rest = new Float32Array(V * 2);                           // x,z per grid vertex
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const k = at(i, j);
      this.rest[k * 2] = -CARD.w / 2 + CARD.w * i / NX;
      this.rest[k * 2 + 1] = -CARD.h / 2 + CARD.h * j / NZ;
    }
    const qb = cardUV(0, 0);
    this.backUV = new Float32Array(V * 2);
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const k = at(i, j);
      this.backUV[k * 2] = qb.u0 + (qb.u1 - qb.u0) * i / NX;
      this.backUV[k * 2 + 1] = qb.v0 + (qb.v1 - qb.v0) * j / NZ;
    }
    this.live = new Set();
  }
  // card = {r,s}
  make(card, faceUp = false) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(V * 2 * 3), uv = new Float32Array(V * 2 * 2);
    const q = cardUV(card.r, card.s);
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const k = j * (NX + 1) + i;
      uv[k * 2] = q.u0 + (q.u1 - q.u0) * i / NX;
      uv[k * 2 + 1] = q.v0 + (q.v1 - q.v0) * (1 - j / NZ);
      uv[(k + V) * 2] = this.backUV[k * 2]; uv[(k + V) * 2 + 1] = this.backUV[k * 2 + 1];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(this.index);
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.userData.ownGeo = true;
    const grp = new THREE.Group();
    grp.add(mesh);
    grp.userData = { card, faceUp, mesh, bent: true };
    grp.rotation.z = faceUp ? 0 : Math.PI;
    const bc = new Bend(this, grp, geo);
    grp.bend = bc;
    bc.flat();
    this.live.add(grp);
    return grp;
  }
  release(grp) { this.live.delete(grp); grp.userData.mesh.geometry.dispose(); }
  dispose() { for (const g of this.live) g.userData.mesh.geometry.dispose(); this.live.clear(); this.mat.dispose(); }
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _c = new THREE.Vector3();

class Bend {
  constructor(fac, grp, geo) { this.fac = fac; this.grp = grp; this.geo = geo; this.dir = new THREE.Vector2(0, 1); this.upSign = -1; this.isFlat = false; }
  // Aim the peel: lift the index corner that is nearest to `eye` (world), mostly along the near edge.
  aim(eye, cornerBias = .55) {
    const g = this.grp;
    g.updateMatrixWorld(true);
    g.getWorldQuaternion(_q).invert();
    const center = g.getWorldPosition(_c.set(0, 0, 0)).clone();
    // toward the viewer, in the card's local frame
    const toEye = _v.set(eye.x - center.x, 0, eye.z - center.z).normalize().applyQuaternion(_q);
    const n = new THREE.Vector2(toEye.x, toEye.z).normalize();
    // the two index corners of the face: top-left (-w/2,-h/2) and bottom-right (+w/2,+h/2)
    const cA = new THREE.Vector2(-CARD.w / 2, -CARD.h / 2), cB = new THREE.Vector2(CARD.w / 2, CARD.h / 2);
    const corner = cA.dot(n) > cB.dot(n) ? cA : cB;
    const d = corner.clone().normalize().multiplyScalar(cornerBias).add(n.clone().multiplyScalar(1 - cornerBias)).normalize();
    this.dir.copy(d);
    this.upSign = new THREE.Vector3(0, 1, 0).applyQuaternion(_q).y >= 0 ? 1 : -1;
    return this;
  }
  flat() {
    if (this.isFlat) return;
    const pos = this.geo.attributes.position.array, rest = this.fac.rest, t2 = CARD.t / 2;
    for (let k = 0; k < V; k++) {
      pos[k * 3] = pos[(k + V) * 3] = rest[k * 2];
      pos[k * 3 + 2] = pos[(k + V) * 3 + 2] = rest[k * 2 + 1];
      pos[k * 3 + 1] = t2; pos[(k + V) * 3 + 1] = -t2;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.isFlat = true;
  }
  // depth: how far (m) past the fold line the peeled part reaches; theta: how far it has turned (rad); R: curl radius
  set(depth, theta, R = .014) {
    if (depth <= 1e-5 || theta <= 1e-4) return this.flat();
    this.isFlat = false;
    const pos = this.geo.attributes.position.array, rest = this.fac.rest, t2 = CARD.t / 2;
    const dx = this.dir.x, dz = this.dir.y, up = this.upSign;
    const sMax = (Math.abs(dx) * CARD.w + Math.abs(dz) * CARD.h) / 2, s0 = sMax - depth;
    const arc = R * theta, ct = Math.cos(theta), st = Math.sin(theta);
    for (let k = 0; k < V; k++) {
      const x = rest[k * 2], z = rest[k * 2 + 1];
      const s = x * dx + z * dz - s0;
      let px = x, pz = z, h = 0, nd = 0, nu = 1;
      if (s > 0) {
        let along;
        if (s <= arc) { const f = s / R; along = R * Math.sin(f); h = R * (1 - Math.cos(f)); nd = -Math.sin(f); nu = Math.cos(f); }
        else { const e = s - arc; along = R * st + e * ct; h = R * (1 - ct) + e * st; nd = -st; nu = ct; }
        px = x + dx * (along - s); pz = z + dz * (along - s);
      }
      // face layer rests at +t/2 (local y), back layer at -t/2; offsets follow the curled normal
      for (const [kk, ly] of [[k, t2], [k + V, -t2]]) {
        const ou = ly * up;                      // offset measured along the lift direction
        pos[kk * 3] = px + dx * nd * ou;
        pos[kk * 3 + 1] = up * (h + nu * ou);
        pos[kk * 3 + 2] = pz + dz * nd * ou;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
