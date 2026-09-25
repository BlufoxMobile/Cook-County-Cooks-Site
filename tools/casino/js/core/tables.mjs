// Table builder: felt, leather rail, brass trim, walnut apron, dealer chip tray.
// Outlines are drawn in the XZ plane (x right, z toward the player).
import * as THREE from '../vendor/three.min.mjs';
import { feltNoise, shadeHex } from './textures.mjs';
import { CHIP } from './props.mjs';

function chaikin(pts, iters = 3, closed = true) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const out = [], n = p.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    p = out;
  }
  return p;
}
export function outlinePoints(o) {
  let pts = [];
  if (o.type === 'bj') {
    // straight dealer edge at z = zf, arc toward the player
    const { a, b, zf } = o;
    for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI; pts.push([a * Math.cos(t), zf + b * Math.sin(t)]); }
    pts.push([-a, zf - .001], [a, zf - .001]);
    pts = chaikin(pts, 3);
  } else if (o.type === 'stadium') {
    const { L, R, zc = 0 } = o;
    for (let i = 0; i <= 40; i++) { const t = -Math.PI / 2 + i / 40 * Math.PI; pts.push([L / 2 + R * Math.cos(t), zc + R * Math.sin(t)]); }
    for (let i = 0; i <= 40; i++) { const t = Math.PI / 2 + i / 40 * Math.PI; pts.push([-L / 2 + R * Math.cos(t), zc + R * Math.sin(t)]); }
  } else if (o.type === 'rect') {
    const { W, D, r = .12, zc = 0 } = o;
    const c = [[W / 2 - r, zc - D / 2 + r, -Math.PI / 2], [W / 2 - r, zc + D / 2 - r, 0], [-W / 2 + r, zc + D / 2 - r, Math.PI / 2], [-W / 2 + r, zc - D / 2 + r, Math.PI]];
    for (const [cx, cz, a0] of c) for (let i = 0; i <= 10; i++) { const t = a0 + i / 10 * Math.PI / 2; pts.push([cx + r * Math.cos(t), cz + r * Math.sin(t)]); }
  }
  return pts;
}
function offset(pts, d) {
  const n = pts.length, out = [];
  // signed area to know which way is inward
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    let tx = q[0] - p[0], tz = q[1] - p[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    out.push([c[0] - tz * d * s, c[1] + tx * d * s]);
  }
  return out;
}

const matCache = {};
function leather() {
  return matCache.leather ||= new THREE.MeshPhysicalMaterial({ color: 0x121214, roughness: .5, metalness: 0, clearcoat: .35, clearcoatRoughness: .45, sheen: .4, sheenColor: new THREE.Color(0x2a2a30), sheenRoughness: .6, envMapIntensity: .8 });
}
export function brass() {
  return matCache.brass ||= new THREE.MeshStandardMaterial({ color: 0xd2a653, metalness: 1, roughness: .26, envMapIntensity: 1.2 });
}
function walnut() {
  if (matCache.walnut) return matCache.walnut;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
  const c = cv.getContext('2d'); c.fillStyle = '#2a160c'; c.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(${90 + Math.random() * 60},${45 + Math.random() * 30},20,${.08 + Math.random() * .12})`; c.lineWidth = 1 + Math.random() * 2; c.beginPath(); const y = Math.random() * 64; c.moveTo(0, y); c.bezierCurveTo(170, y + Math.random() * 10 - 5, 340, y + Math.random() * 10 - 5, 512, y + Math.random() * 6 - 3); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1);
  return matCache.walnut = new THREE.MeshPhysicalMaterial({ map: t, roughness: .35, clearcoat: .8, clearcoatRoughness: .15, envMapIntensity: .8 });
}

// Build a table. felt: {color, paint(ctx, P, S, W, H), size:[w,h]}  P(x,z)->[px,py], S(metres)->px
export function buildTable(stage, { outline, felt, railRadius = .032, apron = .12, tray = null, sheen = true, feltMaterial = {} }) {
  const g = new THREE.Group();
  const pts = outlinePoints(outline);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const W = maxX - minX, D = maxZ - minZ;

  // felt texture
  const cw = (felt.size || [2048])[0], ch = Math.round(cw * D / W);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  const P = (x, z) => [(x - minX) / W * cw, (z - minZ) / D * ch];
  const S = m => m / W * cw;
  const grd = ctx.createRadialGradient(cw / 2, ch * .5, Math.min(cw, ch) * .08, cw / 2, ch * .5, Math.max(cw, ch) * .62);
  grd.addColorStop(0, shadeHex(felt.color, 8)); grd.addColorStop(1, shadeHex(felt.color, -30));
  ctx.fillStyle = grd; ctx.fillRect(0, 0, cw, ch);
  felt.paint?.(ctx, P, S, cw, ch);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, stage.renderer.capabilities.getMaxAnisotropy());

  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const fg = new THREE.ShapeGeometry(shape, 24);
  const uv = fg.attributes.uv, pos = fg.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - minX) / W, (pos.getY(i) + maxZ) / D);
  fg.rotateX(-Math.PI / 2);
  const noise = feltNoise();
  const fm = stage.tier === 'low'
    ? new THREE.MeshLambertMaterial({ map: tex })
    : new THREE.MeshPhysicalMaterial({ map: tex, roughness: .92, roughnessMap: noise, bumpMap: noise, bumpScale: .35, sheen: sheen ? .3 : 0, sheenColor: new THREE.Color(shadeHex(felt.color, 30)), sheenRoughness: .8, envMapIntensity: .15, ...feltMaterial });
  const feltMesh = new THREE.Mesh(fg, fm);
  feltMesh.receiveShadow = true; feltMesh.userData.ownGeo = feltMesh.userData.ownMat = true;
  g.add(feltMesh);

  // rail
  const railPts = offset(pts, -railRadius * .55).map(([x, z]) => new THREE.Vector3(x, railRadius * .78, z));
  const curve = new THREE.CatmullRomCurve3(railPts, true, 'centripetal');
  const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 420, railRadius, stage.tier === 'low' ? 10 : 18, true), leather());
  rail.castShadow = true; rail.receiveShadow = true; rail.userData.ownGeo = true;
  g.add(rail);
  // brass trim at the felt edge
  const trimPts = offset(pts, railRadius * .35).map(([x, z]) => new THREE.Vector3(x, .004, z));
  const trim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trimPts, true, 'centripetal'), 420, .0045, 8, true), brass());
  trim.userData.ownGeo = true;
  g.add(trim);
  // apron
  const apronShape = new THREE.Shape(offset(pts, -railRadius * 1.2).map(([x, z]) => new THREE.Vector2(x, z)));
  const ag = new THREE.ExtrudeGeometry(apronShape, { depth: apron, bevelEnabled: false, curveSegments: 24 });
  ag.rotateX(Math.PI / 2); ag.translate(0, -.003, 0);
  const apronMesh = new THREE.Mesh(ag, walnut()); apronMesh.userData.ownGeo = true;
  g.add(apronMesh);

  if (tray) g.add(chipTray(stage, tray));

  stage.world.add(g);
  return { group: g, felt: feltMesh, feltTex: tex, feltCanvas: cv, P, S, bounds: { minX, maxX, minZ, maxZ }, railTop: railRadius * 1.78, outline: pts };
}

// The dealer's float: a recessed tray with chips standing in columns.
function chipTray(stage, { x = 0, z = -.5, w = .62, chips }) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w, .012, .11), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: .4 }));
  tray.position.y = .006; tray.receiveShadow = true; g.add(tray);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + .01, .016, .006), brass()); lip.position.set(0, .01, .058); g.add(lip);
  const cols = [25000, 5000, 1000, 500, 100, 25, 10, 100];
  const n = cols.length, gap = w / n;
  // chips lying in channels, seen edge-on like a real float — instanced: one draw call per denomination
  const byV = new Map(); cols.forEach((v, i) => byV.set(v, [...(byV.get(v) || []), i]));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (const [v, idx] of byV) {
    const im = new THREE.InstancedMesh(chips.geo, chips.mats.get(v), idx.length * 11); let k = 0;
    for (const i of idx) for (let j = 0; j < 11; j++) {
      q.setFromEuler(e.set(Math.PI / 2, 0, Math.random() * 6.28));
      im.setMatrixAt(k++, m.compose(p.set(-w / 2 + gap * (i + .5), .012 + CHIP.r * .82, -.042 + j * CHIP.h * 1.02), q, one));
    }
    im.receiveShadow = true; g.add(im);
  }
  return g;
}

// ── felt painting helpers ────────────────────────────────────────────────
export const PRINT = 'rgba(236, 214, 160, .92)';
export const PRINT_SOFT = 'rgba(236, 214, 160, .55)';
export function arcText(ctx, text, cx, cy, radius, startAngle, { font = '600 40px serif', color = PRINT, spacing = 0, inward = false } = {}) {
  ctx.save(); ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const widths = [...text].map(ch => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  let a = startAngle - (total / radius) / 2 * (inward ? -1 : 1);
  [...text].forEach((ch, i) => {
    const w = widths[i], half = (w / 2) / radius * (inward ? -1 : 1);
    a += half;
    ctx.save(); ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.rotate(a + (inward ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0); ctx.restore();
    a += half;
  });
  ctx.restore();
}
export function ring(ctx, x, y, r, { lw = 4, color = PRINT, fill = null, dash = null } = {}) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (dash) ctx.setLineDash(dash);
  ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke(); ctx.restore();
}
export function rrect(ctx, x, y, w, h, r, { lw = 4, color = PRINT, fill = null } = {}) {
  ctx.save(); ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke(); }
  ctx.restore();
}
export function text(ctx, s, x, y, { font = '600 40px serif', color = PRINT, align = 'center', rot = 0, base = 'middle', spacing = 0 } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  if (spacing && 'letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
  ctx.fillText(s, 0, 0); ctx.restore();
}
// invisible hit target for a betting spot
export function hitSpot(parent, x, z, r, data) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ visible: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .002, z); m.userData = { ...data, ownGeo: true };
  parent.add(m); return m;
}
export function hitRect(parent, x, z, w, d, data) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ visible: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .002, z); m.userData = { ...data, ownGeo: true };
  parent.add(m); return m;
}
// a soft glowing ring to highlight a spot (win / active)
export function glowRing(parent, x, z, r, color = 0xf3d58a) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'), gr = c.createRadialGradient(64, 64, 30, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.72, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.6, r * 2.6), new THREE.MeshBasicMaterial({ map: t, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .003, z); m.userData.ownGeo = m.userData.ownMat = true;
  parent.add(m); return m;
}

// A dealing shoe: a smoked-black wedge with a brass lip, the next card peeking out.
export function cardShoe(stage, cards, { x = .6, z = -.44, rotY = -.5 } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
  const prof = new THREE.Shape([[-.085, 0], [-.085, .072], [.05, .046], [.078, .02], [.078, 0]].map(([zz, y]) => new THREE.Vector2(zz, y)));
  const geo = new THREE.ExtrudeGeometry(prof, { depth: .085, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 2 });
  geo.rotateY(-Math.PI / 2); geo.translate(.0425, 0, 0);
  const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, roughness: .22, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 1.1 }));
  body.castShadow = true; body.userData.ownGeo = true; g.add(body);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(.092, .006, .03), brass()); lip.position.set(0, .021, .066); lip.rotation.x = .45; g.add(lip);
  const top = cards.make(null, false); top.position.set(0, .03, .062); top.rotation.set(-.62, 0, Math.PI); top.scale.setScalar(.92); g.add(top);
  stage.world.add(g);
  g.updateMatrixWorld(true);
  const mouth = new THREE.Vector3(0, .03, .09).applyMatrix4(g.matrixWorld);
  return { group: g, mouth };
}
export function discardTray(stage, { x = -.6, z = -.44, rotY = .5 } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
  const m = new THREE.MeshPhysicalMaterial({ color: 0x0c0d10, roughness: .15, transparent: true, opacity: .8, clearcoat: 1 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(.075, .003, .1), m); base.position.y = .0015; g.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(.075, .04, .003), m); back.position.set(0, .02, -.049); g.add(back);
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(.003, .04, .1), m); w.position.set(sx * .037, .02, 0); g.add(w); }
  stage.world.add(g);
  g.updateMatrixWorld(true);
  return { group: g, point: new THREE.Vector3(0, .01, 0).applyMatrix4(g.matrixWorld), count: 0 };
}
