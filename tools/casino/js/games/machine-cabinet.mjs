// A premium upright machine, built procedurally and shared by the Midnight Fox
// slot and the video poker bar-top: black lacquer, brushed-gold trim, a curved
// glowing topper, animated LED light bars, a glass display and a lit button deck.
//
// Face coordinates: the centre of the display opening is the origin, x right,
// y up, z toward the player; the front of the screen bezel is z = 0.
import * as THREE from '../vendor/three.min.mjs';
import { RoundedBoxGeometry } from '../vendor/three.min.mjs';
import { FONT_DISPLAY, FONT_TEXT } from '../core/textures.mjs';

export const FLOOR_Y = -1.22;

// ── shared bits ──────────────────────────────────────────────────────────
export function own(m) { m.userData.ownGeo = true; m.userData.ownMat = true; return m; }
// Game.exit() detaches the game's root before stage.clearWorld() runs, so the
// machines free their own GPU resources (meshes flagged ownGeo / ownMat).
export function disposeTree(root) {
  const mats = new Set(), geos = new Set(), texs = new Set();
  root.traverse(n => {
    if (!n.isMesh && !n.isPoints) return;
    if (n.userData.ownGeo) geos.add(n.geometry);
    if (n.userData.ownMat) for (const m of [].concat(n.material)) mats.add(m);
  });
  for (const m of mats) {
    for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k]?.isTexture) texs.add(m[k]);
    if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) texs.add(u.value);
    m.dispose();
  }
  for (const g of geos) g.dispose();
  for (const t of texs) t.dispose();
}
export function canvasTex(cv, { srgb = true, aniso = 8, mips = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}
export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function goldGrad(ctx, y0, y1, stops = ['#fff4cf', '#f1cf7d', '#c8943c', '#8a5f1f', '#e6c06d']) {
  const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); return g;
}
// text with tracking (letter-spacing) that works everywhere
export function spaced(ctx, s, x, y, track = 0, align = 'center') {
  if ('letterSpacing' in ctx) { ctx.letterSpacing = track + 'px'; const w = ctx.measureText(s).width; ctx.textAlign = 'left'; const x0 = align === 'center' ? x - (w - track) / 2 : align === 'right' ? x - w + track : x; ctx.fillText(s, x0, y); ctx.letterSpacing = '0px'; ctx.textAlign = align; return; }
  const chars = [...s], ws = chars.map(ch => ctx.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x; const prev = ctx.textAlign; ctx.textAlign = 'left';
  chars.forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += ws[i] + track; }); ctx.textAlign = prev;
}
export async function loadFonts() {
  try { await Promise.all([document.fonts.load(`italic 800 100px ${FONT_DISPLAY}`), document.fonts.load(`700 100px ${FONT_DISPLAY}`), document.fonts.load(`900 100px ${FONT_DISPLAY}`), document.fonts.load(`800 40px ${FONT_TEXT}`), document.fonts.load(`600 40px ${FONT_TEXT}`)]); } catch {}
}
let glowTexCache = null;
export function glowTexture() {
  if (glowTexCache) return glowTexCache;
  const cv = makeCanvas(128, 128), c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return glowTexCache = canvasTex(cv, { srgb: false });
}
// a soft rectangular frame glow (for held cards, anticipation reels)
let frameTexCache = null;
export function frameGlowTexture() {
  if (frameTexCache) return frameTexCache;
  const S = 256, cv = makeCanvas(S, S), c = cv.getContext('2d');
  c.shadowColor = '#fff'; c.shadowBlur = 26; c.strokeStyle = '#fff'; c.lineWidth = 10;
  for (let k = 0; k < 3; k++) { rrPath(c, 34, 34, S - 68, S - 68, 18); c.stroke(); }
  return frameTexCache = canvasTex(cv, { srgb: false });
}
export function additive(map, color = 0xffffff, opacity = 1) {
  return new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
}

let brushedCache = null;
function brushedMap() {
  if (brushedCache) return brushedCache;
  const S = 256, cv = makeCanvas(S, S), c = cv.getContext('2d');
  c.fillStyle = '#c4c4c4'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * S, v = 150 + Math.random() * 105, a = .05 + Math.random() * .18;
    c.strokeStyle = `rgba(${v},${v},${v},${a})`; c.lineWidth = Math.random() < .8 ? 1 : 2;
    const x = Math.random() * S, l = 40 + Math.random() * 220; c.beginPath(); c.moveTo(x - l / 2, y); c.lineTo(x + l / 2, y); c.stroke();
  }
  const t = canvasTex(cv, { srgb: false }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9);
  return brushedCache = t;
}

// Machines want crisp screens and tight light-bar glow: nudge the stage's
// bloom and key light for the visit and hand back a restore function.
export function machineStage(stage, backdrop, { keyPos = [.25, 2.3, 1.8], keyTarget = [0, .05, 0], keyIntensity = 16, dim = .72 } = {}) {
  const k = stage.key, b = stage.bloom;
  const saved = { kp: k.position.clone(), kt: k.target.position.clone(), kc: k.color.getHex(), ki: k.intensity, dim: backdrop.uniforms.dim.value, bloom: b ? { s: b.strength, r: b.radius, t: b.threshold } : null };
  k.position.set(...keyPos); k.target.position.set(...keyTarget); k.intensity = keyIntensity;
  backdrop.uniforms.dim.value = dim;
  if (b) { b.strength = .38; b.radius = 0; b.threshold = 1.65; }
  return () => {
    k.position.copy(saved.kp); k.target.position.copy(saved.kt); k.color.setHex(saved.kc); k.intensity = saved.ki;
    backdrop.uniforms.dim.value = saved.dim;
    if (b && saved.bloom) { b.strength = saved.bloom.s; b.radius = saved.bloom.r; b.threshold = saved.bloom.t; }
  };
}

export function cabinetMaterials(stage) {
  const low = stage.tier === 'low';
  const lacquer = low
    ? new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: .2, metalness: .35, envMapIntensity: 1.1 })
    : new THREE.MeshPhysicalMaterial({ color: 0x040507, roughness: .42, metalness: .08, clearcoat: 1, clearcoatRoughness: .035, envMapIntensity: 1.15 });
  const goldOpts = { color: 0xd0a65c, metalness: 1, roughness: .4, roughnessMap: brushedMap(), envMapIntensity: 1.0 };
  const gold = low ? new THREE.MeshStandardMaterial(goldOpts) : new THREE.MeshPhysicalMaterial({ ...goldOpts, anisotropy: .55 });
  const goldPolish = new THREE.MeshStandardMaterial({ color: 0xd2a85c, metalness: 1, roughness: .36, envMapIntensity: .85 });
  const interior = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: .9, metalness: 0 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd7dbe2, metalness: 1, roughness: .16, envMapIntensity: 1.3 });
  const smoke = new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: .55, metalness: .15, envMapIntensity: .7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .03, metalness: 0, transparent: true, opacity: .045, envMapIntensity: .9, depthWrite: false });
  return { lacquer, gold, goldPolish, interior, chrome, smoke, glass };
}

// rounded-rect Shape (x,y = centre)
function rrShape(shape, cx, cy, w, h, r) {
  const x = cx - w / 2, y = cy - h / 2;
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}
// A plate with a rectangular hole, extruded toward +z with its front face at z = 0.
export function framePlate({ w, h, cy = 0, r = .02, hole, depth = .02, bevel = .004 }) {
  const s = rrShape(new THREE.Shape(), 0, cy, w, h, r);
  if (hole) s.holes.push(rrShape(new THREE.Path(), hole.x || 0, hole.y || 0, hole.w, hole.h, hole.r ?? .006));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(depth + bevel));
  return g;
}

// ── LED light bars ───────────────────────────────────────────────────────
export const LED_MODE = { attract: 0, spin: 1, win: 2, anticipate: 3, big: 4 };
const LED_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LED_FS = `
uniform float t; uniform float mode; uniform float n; uniform float gain; uniform float phase;
uniform vec3 colA; uniform vec3 colB;
varying vec2 vUv;
float h1(float x){ return fract(sin(x * 91.7) * 43758.5453); }
void main(){
  float y = vUv.y * n; float id = floor(y); float f = fract(y);
  float dotm = smoothstep(.5, .12, abs(f - .5));
  float k = id / n;
  float b = 0.; vec3 c = colA;
  if (mode < .5) {
    float w = fract(k * 1.6 - t * .3 + phase);
    b = .22 + .78 * pow(w, 3.);
    c = mix(colB, colA, w);
  } else if (mode < 1.5) {
    float w = fract(k * 4. - t * 2.4 + phase);
    b = .12 + .88 * smoothstep(.5, 1., w);
    c = mix(colA, colB, step(.5, fract(k * 2. - t * .6)));
  } else if (mode < 2.5) {
    float on = step(.5, fract(t * 2.6 + id * .5));
    b = .25 + .75 * on; c = mix(colB, colA, on);
  } else if (mode < 3.5) {
    b = .35 + .65 * (.5 + .5 * sin(t * 16. - k * 10.)); c = mix(colA, colB, .5 + .5 * sin(t * 5.));
  } else {
    float w = fract(k * 3. - t * 3.2 + phase);
    b = .35 + .65 * smoothstep(.55, 1., w) + .5 * step(.9, h1(id + floor(t * 14.)));
    c = mix(colA, colB, fract(k * 4. + t * .8));
  }
  float across = 1. - .45 * pow(abs(vUv.x - .5) * 2., 2.);
  vec3 col = c * b * (.4 + .6 * dotm) * across * gain;
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function ledMaterial(n = 48, phase = 0) {
  const m = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, mode: { value: 0 }, n: { value: n }, gain: { value: 2.4 }, phase: { value: phase }, colA: { value: new THREE.Color(0xffc861) }, colB: { value: new THREE.Color(0xff5a1f) } },
    vertexShader: LED_VS, fragmentShader: LED_FS, toneMapped: false
  });
  return m;
}

// marquee: a canvas lit from behind, with a slow sheen sweeping across
const MQ_FS = `
uniform sampler2D map; uniform float t; uniform float gain; uniform float sheen; uniform float flash;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(map, vUv);
  float x = vUv.x - (fract(t * .085) * 2.4 - .7) + (vUv.y - .5) * .3;
  float s = exp(-x * x * 700.) * sheen;
  vec3 col = c.rgb * (gain + flash) + s * (vec3(.9, .8, .6) * .35 + c.rgb * 1.4);
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ── the cabinet ─────────────────────────────────────────────────────────
// opts: { width, open:{w,h}, bezel:{top,bottom,side}, recess, topper:{h, radius}, buttons:[{id,label,w,kind:'rect'|'round', x}], led:{a,b} }
export function buildCabinet(stage, opts) {
  const W = opts.width, OW = opts.open.w, OH = opts.open.h, BZ = opts.bezel, D = opts.recess ?? .4;
  const M = cabinetMaterials(stage);
  const g = new THREE.Group(); g.name = 'cabinet';
  const add = (mesh, parent = g) => { own(mesh); parent.add(mesh); return mesh; };
  const shareMat = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.userData.ownGeo = true; m.userData.ownMat = true; return m; };

  const bezTop = OH / 2 + BZ.top, bezBot = -OH / 2 - BZ.bottom, headTop = bezTop + .012, headBot = bezBot - .02;
  const panelW = W - .045;
  // head (the box behind the bezel)
  // the head is a hollow shell: a tunnel runs through it behind the opening so the recess shows
  const head = shareMat(framePlate({ w: W, h: headTop - headBot, cy: (headTop + headBot) / 2, r: .022, hole: { w: OW + .008, h: OH + .008, r: .008 }, depth: .5, bevel: .012 }), M.lacquer);
  head.position.z = -.03; head.castShadow = true; head.receiveShadow = true; g.add(head);
  const headBack = shareMat(new THREE.BoxGeometry(W - .02, headTop - headBot - .02, .02), M.lacquer);
  headBack.position.set(0, (headTop + headBot) / 2, -.56); g.add(headBack);
  // bezel with the display opening
  const bezel = shareMat(framePlate({ w: panelW, h: bezTop - bezBot, cy: (bezTop + bezBot) / 2, r: .018, hole: { w: OW, h: OH, r: .008 }, depth: .024, bevel: .005 }), M.lacquer);
  g.add(bezel);
  // brushed gold frame around the opening
  const fw = .016;
  const frame = shareMat(framePlate({ w: OW + fw * 2, h: OH + fw * 2, r: .012, hole: { w: OW, h: OH, r: .006 }, depth: .008, bevel: .004 }), M.gold);
  frame.position.z = .01; g.add(frame);
  const frameInner = shareMat(framePlate({ w: OW + .006, h: OH + .006, r: .007, hole: { w: OW - .002, h: OH - .002, r: .005 }, depth: .004, bevel: .0015 }), M.goldPolish);
  frameInner.position.z = .014; g.add(frameInner);
  // outer gold pinstripe around the bezel
  const pin = shareMat(framePlate({ w: panelW + .012, h: bezTop - bezBot + .012, cy: (bezTop + bezBot) / 2, r: .022, hole: { y: (bezTop + bezBot) / 2, w: panelW - .004, h: bezTop - bezBot - .004, r: .018 }, depth: .006, bevel: .002 }), M.gold);
  pin.position.z = .002; g.add(pin);
  // recess behind the opening (seen from inside)
  const rec = shareMat(new THREE.BoxGeometry(OW + .004, OH + .004, D), new THREE.MeshStandardMaterial({ color: 0x020203, roughness: .9, side: THREE.BackSide }));
  rec.position.set(0, 0, -.028 - D / 2); g.add(rec);
  // glass
  const glass = shareMat(new THREE.PlaneGeometry(OW, OH), M.glass); glass.position.z = -.002; glass.renderOrder = 5; g.add(glass);
  const streakCv = makeCanvas(512, 256), sc = streakCv.getContext('2d');
  for (const [x0, w0, a] of [[.12, .16, .5], [.36, .05, .35], [.7, .22, .28]]) {
    const gr = sc.createLinearGradient(512 * x0, 0, 512 * (x0 + w0), 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    sc.save(); sc.transform(1, 0, -.55, 1, 0, 0); sc.fillStyle = gr; sc.fillRect(0, 0, 900, 256); sc.restore();
  }
  const vg = sc.createLinearGradient(0, 0, 0, 256); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(.5, 'rgba(0,0,0,.0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
  sc.globalCompositeOperation = 'destination-out'; sc.fillStyle = vg; sc.fillRect(0, 0, 512, 256);
  const streak = add(new THREE.Mesh(new THREE.PlaneGeometry(OW, OH), additive(canvasTex(streakCv, { srgb: false }), 0xfff2de, .045)));
  streak.position.z = -.001; streak.renderOrder = 6;

  // LED light bars on both front edges
  const ledTop = headTop + (opts.topper ? opts.topper.h + .05 : 0), ledBot = headBot + .01;
  const leds = [];
  for (const sx of [-1, 1]) {
    const mat = ledMaterial(Math.round((ledTop - ledBot) / .018), sx > 0 ? .5 : 0);
    const bar = add(new THREE.Mesh(new RoundedBoxGeometry(.02, ledTop - ledBot, .012, 2, .006), mat));
    bar.position.set(sx * (W / 2 - .012), (ledTop + ledBot) / 2, -.004);
    const housing = shareMat(new RoundedBoxGeometry(.03, ledTop - ledBot + .012, .014, 2, .007), M.gold);
    housing.position.set(sx * (W / 2 - .012), (ledTop + ledBot) / 2, -.012); g.add(housing);
    // light spill on the lacquer
    const spill = add(new THREE.Mesh(new THREE.PlaneGeometry(.12, ledTop - ledBot), additive(glowTexture(), 0xffc861, .0)));
    spill.position.set(sx * (W / 2 - .04), (ledTop + ledBot) / 2, .0005); spill.scale.x = .9;
    leds.push({ mat, spill });
  }

  // ── topper: a barrel-curved marquee ──
  let marquee = null;
  if (opts.topper) {
    const TH = opts.topper.h, R = opts.topper.radius || .45, TW = W - .07, a = TH / 2 / R;
    const y0 = headTop + .02 + TH / 2;
    const geo = new THREE.PlaneGeometry(TW, TH, 1, 24), p = geo.attributes.position, nrm = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) { const ang = p.getY(i) / R; p.setY(i, R * Math.sin(ang)); p.setZ(i, R * Math.cos(ang) - R); nrm.setXYZ(i, 0, Math.sin(ang), Math.cos(ang)); }
    const MW = 1024, MH = Math.round(1024 * TH / TW / 2) * 2;
    const cv = makeCanvas(MW, MH), ctx = cv.getContext('2d'), tex = canvasTex(cv);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, t: { value: 0 }, gain: { value: 1.05 }, sheen: { value: .8 }, flash: { value: 0 } }, vertexShader: LED_VS, fragmentShader: MQ_FS });
    const panel = add(new THREE.Mesh(geo, mat)); panel.position.set(0, y0, .006);
    // housing behind + side cheeks
    const back = shareMat(new RoundedBoxGeometry(W, TH + .06, .4, 4, .025), M.lacquer); back.position.set(0, y0, -.22); g.add(back);
    // curved gold rails down both sides of the barrel
    for (const sx of [-1, 1]) {
      const pts = []; for (let k = 0; k <= 20; k++) { const ang = -a + 2 * a * k / 20; pts.push(new THREE.Vector3(sx * (TW / 2 + .006), y0 + R * Math.sin(ang), .006 + R * Math.cos(ang) - R + .004)); }
      const tube = shareMat(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .009, 12, false), M.goldPolish); g.add(tube);
    }
    // gold rails top and bottom of the marquee
    for (const sy of [-1, 1]) {
      const rail = shareMat(new THREE.CylinderGeometry(.009, .009, TW + .03, 20), M.goldPolish);
      rail.rotation.z = Math.PI / 2; rail.position.set(0, y0 + sy * (R * Math.sin(a) + .006), .006 + R * Math.cos(a) - R + .004); g.add(rail);
    }
    // crown cap
    const cap = shareMat(new RoundedBoxGeometry(W, .05, .42, 4, .02), M.lacquer); cap.position.set(0, y0 + TH / 2 + .038, -.2); g.add(cap);
    const capTrim = shareMat(new THREE.BoxGeometry(W - .03, .006, .006), M.gold); capTrim.position.set(0, y0 + TH / 2 + .03, .006); g.add(capTrim);
    marquee = { canvas: cv, ctx, tex, W: MW, H: MH, mat, mesh: panel, y: y0, h: TH, redraw(fn) { fn(ctx, MW, MH); tex.needsUpdate = true; } };
  }

  // ── button deck ──
  const deck = new THREE.Group();
  const deckY = headBot - .045, deckD = .25, tilt = .2;
  deck.position.set(0, deckY, .1); deck.rotation.x = tilt; g.add(deck);
  const slab = shareMat(new RoundedBoxGeometry(W + .01, .05, deckD, 4, .014), M.lacquer); deck.add(slab);
  const deckTop = shareMat(new RoundedBoxGeometry(W - .05, .004, deckD - .05, 2, .0018), M.smoke); deckTop.position.y = .026; deck.add(deckTop);
  const lip = shareMat(new THREE.CylinderGeometry(.008, .008, W + .012, 16), M.goldPolish); lip.rotation.z = Math.PI / 2; lip.position.set(0, .018, deckD / 2 + .001); deck.add(lip);
  const buttons = new Map();
  for (const b of opts.buttons || []) {
    const btn = makeButton(b, M); btn.group.position.set(b.x, .028, b.z ?? .02); deck.add(btn.group); buttons.set(b.id, btn);
  }
  // body below the deck, plinth
  const bodyTop = deckY - .02, bodyH = bodyTop - FLOOR_Y;
  const body = shareMat(new RoundedBoxGeometry(W - .02, bodyH, .5, 4, .02), M.lacquer); body.position.set(0, FLOOR_Y + bodyH / 2, -.26); g.add(body);
  const belly = makeBelly(W - .12, Math.min(.42, bodyH - .35)); belly.position.set(0, bodyTop - .08 - Math.min(.42, bodyH - .35) / 2, -.005); g.add(belly);
  const bellyFrame = shareMat(framePlate({ w: W - .1, h: Math.min(.42, bodyH - .35) + .02, r: .012, hole: { w: W - .12, h: Math.min(.42, bodyH - .35), r: .008 }, depth: .006, bevel: .003 }), M.gold);
  bellyFrame.position.set(0, belly.position.y, -.002); g.add(bellyFrame);
  const kick = shareMat(new THREE.BoxGeometry(W - .02, .06, .02), M.gold); kick.position.set(0, FLOOR_Y + .03, -.005); g.add(kick);
  // a hint of floor
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: .6, metalness: .1 });
  const floor = shareMat(new THREE.CircleGeometry(2.4, 48), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(0, FLOOR_Y, .2); floor.receiveShadow = true; g.add(floor);

  let t = 0, ledMode = 0, spillBase = .08;
  const api = {
    group: g, materials: M, marquee, buttons, deck, glass, opening: { w: OW, h: OH }, bezTop, bezBot,
    pickables: () => [...buttons.values()].map(b => b.cap),
    setLeds(mode, a, b) {
      ledMode = LED_MODE[mode] ?? mode;
      for (const l of leds) {
        l.mat.uniforms.mode.value = ledMode;
        if (a) l.mat.uniforms.colA.value.set(a);
        if (b) l.mat.uniforms.colB.value.set(b);
        l.spill.material.color.set(a || l.mat.uniforms.colA.value);
      }
    },
    setLedGain(v) { for (const l of leds) l.mat.uniforms.gain.value = v; },
    flashMarquee(v) { if (marquee) marquee.mat.uniforms.flash.value = v; },
    update(dt) {
      t += dt;
      for (const l of leds) { l.mat.uniforms.t.value = t; l.spill.material.opacity = spillBase * (ledMode >= 2 ? .9 + .5 * Math.abs(Math.sin(t * 7)) : 1); }
      if (marquee) marquee.mat.uniforms.t.value = t;
      for (const b of buttons.values()) b.tick(t, dt);
    }
  };
  if (opts.led) api.setLeds('attract', opts.led.a, opts.led.b);
  return api;
}

// lit deck button: a chrome/gold bezel with a glowing label cap
function makeButton(b, M) {
  const round = b.kind === 'round', w = b.w || .07, d = b.d || .042;
  const group = new THREE.Group();
  const cv = makeCanvas(256, round ? 256 : Math.round(256 * d / w)), ctx = cv.getContext('2d'), tex = canvasTex(cv);
  const draw = (label, color = b.color || '#f3c75e', on = true) => {
    const Wc = cv.width, Hc = cv.height;
    ctx.clearRect(0, 0, Wc, Hc);
    const gr = ctx.createLinearGradient(0, 0, 0, Hc);
    gr.addColorStop(0, shade(color, on ? .45 : -.2)); gr.addColorStop(.5, shade(color, on ? 0 : -.45)); gr.addColorStop(1, shade(color, on ? -.35 : -.65));
    ctx.fillStyle = gr;
    if (round) { ctx.beginPath(); ctx.arc(Wc / 2, Hc / 2, Wc / 2, 0, 7); ctx.fill(); } else ctx.fillRect(0, 0, Wc, Hc);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; if (round) { ctx.beginPath(); ctx.ellipse(Wc / 2, Hc * .3, Wc * .32, Hc * .14, 0, 0, 7); ctx.fill(); } else ctx.fillRect(0, 0, Wc, Hc * .12);
    ctx.fillStyle = on ? '#1c1204' : 'rgba(20,14,4,.8)'; ctx.textBaseline = 'middle';
    const lines = String(label).split('\n'); const fs = round ? 50 : Math.min(Hc * .42, 230 / Math.max(...lines.map(l => l.length)) * 1.45);
    ctx.font = `800 ${fs}px ${FONT_TEXT}`;
    lines.forEach((l, i) => spaced(ctx, l, Wc / 2, Hc / 2 + (i - (lines.length - 1) / 2) * fs * 1.05 + fs * .04, fs * .08));
    tex.needsUpdate = true;
  };
  draw(b.label, b.color);
  const capMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .45, roughness: .3, metalness: 0 });
  const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.color || '#f3c75e').multiplyScalar(.5), emissive: new THREE.Color(b.color || '#f3c75e'), emissiveIntensity: .25, roughness: .35 });
  let cap, rim;
  if (round) {
    cap = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, .014, 40), [sideMat, capMat, capMat]);
    rim = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + .004, .005, 10, 40), M.chrome); rim.rotation.x = Math.PI / 2; rim.position.y = .004;
  } else {
    cap = new THREE.Mesh(new THREE.BoxGeometry(w, .012, d), [sideMat, sideMat, capMat, sideMat, sideMat, sideMat]);
    rim = new THREE.Mesh(framePlate({ w: w + .012, h: d + .012, r: .006, hole: { w: w + .001, h: d + .001, r: .002 }, depth: .004, bevel: .0015 }), M.chrome);
    rim.rotation.x = -Math.PI / 2; rim.position.y = .003;
  }
  own(cap); rim.userData.ownGeo = true;
  cap.position.y = .008; cap.userData.btn = b.id;
  if (round) cap.rotation.y = Math.PI / 2;   // cylinder cap UVs run along z; turn the label to face the player
  group.add(rim, cap);
  let press = 0, lit = true, pulse = !!b.pulse;
  return {
    group, cap, id: b.id,
    setLabel(l, color) { b.label = l; if (color) b.color = color; draw(l, b.color, lit); },
    setLit(on) { if (on === lit) return; lit = on; draw(b.label, b.color, on); capMat.emissiveIntensity = on ? .45 : .06; },
    setPulse(on) { pulse = on; },
    press() { press = 1; },
    tick(t, dt) {
      press = Math.max(0, press - dt * 5);
      cap.position.y = .008 - Math.sin(press * Math.PI) * .005;
      if (lit) capMat.emissiveIntensity = .3 + (pulse ? .2 * (.5 + .5 * Math.sin(t * 5)) : 0) + press * .5;
    }
  };
}
function shade(hex, f) {
  const c = new THREE.Color(hex);
  if (f >= 0) c.lerp(new THREE.Color(1, 1, 1), f); else c.multiplyScalar(1 + f);
  return '#' + c.getHexString();
}
// lower-cabinet glass panel with the house mark
function makeBelly(w, h) {
  const cv = makeCanvas(1024, Math.round(1024 * h / w)), c = cv.getContext('2d'), W = cv.width, H = cv.height;
  const bg = c.createRadialGradient(W / 2, H * .45, 10, W / 2, H / 2, W * .6); bg.addColorStop(0, '#15203d'); bg.addColorStop(1, '#03050b');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(227,199,126,.25)'; c.lineWidth = 2;
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; c.beginPath(); c.moveTo(W / 2, H * .45); c.lineTo(W / 2 + Math.cos(a) * W, H * .45 + Math.sin(a) * W); c.stroke(); }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `700 ${H * .3}px ${FONT_DISPLAY}`; c.fillStyle = goldGrad(c, H * .25, H * .6); c.shadowColor = 'rgba(243,200,110,.6)'; c.shadowBlur = 30;
  c.fillText('C³', W / 2, H * .42); c.shadowBlur = 0;
  c.font = `800 ${H * .075}px ${FONT_TEXT}`; c.fillStyle = '#e8cf8e'; spaced(c, 'BLUFOX  CASINO  &  LOUNGE', W / 2, H * .72, H * .03);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTex(cv), color: 0xbbbbbb }));
  return own(m);
}
