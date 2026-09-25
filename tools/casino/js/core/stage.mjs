// The 3D stage: renderer, camera, light rig, environment reflections,
// quality tiers, the frame loop, picking and screen projection.
import * as THREE from '../vendor/three.min.mjs';
import { RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } from '../vendor/three.min.mjs';
import { Tweens } from './tween.mjs';

export function detectTier() {
  const q = new URLSearchParams(location.search).get('q');
  if (['low', 'mid', 'high'].includes(q)) return q;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
  if (mem <= 2 || (coarse && cores <= 4)) return 'low';
  if (coarse) return 'mid';
  return 'high';
}
const TIERS = {
  high: { dpr: 2, shadows: 2048, bloom: true, aa: true },
  mid: { dpr: 1.6, shadows: 1024, bloom: false, aa: true },
  low: { dpr: 1, shadows: 0, bloom: false, aa: false }
};

export class Stage {
  constructor(host) {
    this.host = host;
    this.tier = detectTier();
    this.cfg = TIERS[this.tier];
    const canvas = document.createElement('canvas');
    canvas.className = 'gl';
    host.append(canvas);
    this.canvas = canvas;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: this.cfg.aa, powerPreference: 'high-performance', alpha: false, stencil: false });
    } catch (e) {
      this.failed = true; throw e;
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = this.cfg.shadows > 0;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x040507, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040507);
    this.camera = new THREE.PerspectiveCamera(38, 1, .02, 60);
    this.camera.position.set(0, .7, 1.2);
    this.look = new THREE.Vector3(0, 0, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, .04).texture;
    this.scene.environmentIntensity = .3;
    room.dispose?.();

    this.lights();
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.tw = new Tweens();
    this.frameFns = new Set();
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.last = performance.now();
    this.fpsSamples = [];
    this.running = false;
    this.viewPreset = null;

    if (this.cfg.bloom) this.makeComposer();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.last = performance.now(); });
  }

  lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xffe6c4, 0x0b1020, .16);
    s.add(this.hemi);
    const key = new THREE.SpotLight(0xffdcae, 30, 8, .72, .8, 1.5);
    key.position.set(.15, 2.3, .55);
    key.target.position.set(0, 0, -.05);
    key.castShadow = this.cfg.shadows > 0;
    if (key.castShadow) {
      key.shadow.mapSize.set(this.cfg.shadows, this.cfg.shadows);
      key.shadow.bias = -.00012; key.shadow.normalBias = .004;
      key.shadow.camera.near = .6; key.shadow.camera.far = 4.5;
      key.shadow.radius = 3;
    }
    s.add(key, key.target);
    this.key = key;
    this.rigDefaults = { key: key.position.clone(), target: key.target.position.clone(), keyI: key.intensity, hemi: .16, exposure: 1.08, env: .3 };
    const fill = new THREE.DirectionalLight(0x9fb7ff, .45);
    fill.position.set(-1.4, 1.2, -1.8);
    s.add(fill);
    this.fill = fill;
    const front = new THREE.DirectionalLight(0xffe9cf, .35);
    front.position.set(.4, 1.1, 2.2);
    s.add(front);
    this.front = front;
  }

  // put the light rig back the way the stage built it (games may move it)
  resetRig() {
    const d = this.rigDefaults; if (!d) return;
    this.key.position.copy(d.key); this.key.target.position.copy(d.target); this.key.intensity = d.keyI; this.key.color.setHex(0xffdcae);
    this.hemi.intensity = d.hemi; this.renderer.toneMappingExposure = d.exposure; this.scene.environmentIntensity = d.env;
    if (this.bloom) Object.assign(this.bloom, { strength: .22, radius: .5, threshold: .92 });
  }
  makeComposer() {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .22, .5, .92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setTier(t) {
    if (t === this.tier) return;
    this.tier = t; this.cfg = TIERS[t];
    if (!this.cfg.bloom && this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (this.cfg.shadows === 0) { this.renderer.shadowMap.enabled = false; this.key.castShadow = false; }
    this.resize();
  }

  get portrait() { return this.w / this.h < .9; }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width)); this.h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, this.cfg.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
    this.camera.aspect = this.w / this.h;
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(this.w, this.h); }
    if (this.viewPreset) this.applyView(this.viewPreset, 0, 'inOutCubic', true);
    if (this.activeShot) { const r = this.activeShot; this.camera.position.copy(r.pos); this.look.copy(r.look); this.camera.fov = r.fov; this.camera.lookAt(this.look); }
    this.camera.updateProjectionMatrix();
    for (const fn of this.frameFns) fn.onResize?.();
    this.onResize?.();
  }

  // preset = {landscape:{pos,look,fov}, portrait:{...}} or a single {pos,look,fov}
  resolveView(preset) {
    const v = preset.landscape ? (this.portrait ? (preset.portrait || preset.landscape) : preset.landscape) : preset;
    // widen the lens for very tall screens so the table still fits side to side
    let fov = v.fov || 38;
    if (v.fitWidth) {
      const dist = new THREE.Vector3(...v.pos).distanceTo(new THREE.Vector3(...v.look));
      const needH = 2 * Math.atan((v.fitWidth / 2) / dist / this.camera.aspect) * 180 / Math.PI;
      fov = Math.max(fov, Math.min(v.maxFov || 80, needH));
    }
    return { pos: new THREE.Vector3(...v.pos), look: new THREE.Vector3(...v.look), fov };
  }
  applyView(preset, dur = .9, easeName = 'inOutCubic', keepShot = false) {
    this.viewPreset = preset;
    if (!keepShot) this.activeShot = null;
    const v = this.resolveView(preset);
    this.tw.kill('camera');
    if (!dur) {
      this.camera.position.copy(v.pos); this.look.copy(v.look); this.camera.fov = v.fov;
      this.camera.lookAt(this.look); this.camera.updateProjectionMatrix();
      return Promise.resolve();
    }
    const p0 = this.camera.position.clone(), l0 = this.look.clone(), f0 = this.camera.fov;
    return this.tw.run(dur, e => {
      this.camera.position.lerpVectors(p0, v.pos, e);
      this.look.lerpVectors(l0, v.look, e);
      this.camera.fov = f0 + (v.fov - f0) * e;
      this.camera.lookAt(this.look); this.camera.updateProjectionMatrix();
    }, { ease: easeName, tag: 'camera' });
  }
  // temporary camera move that does not replace the base preset (close-ups)
  shot(v, dur = .8, easeName = 'inOutCubic') {
    const r = { pos: new THREE.Vector3(...v.pos), look: new THREE.Vector3(...v.look), fov: v.fov || this.camera.fov };
    this.activeShot = r;
    this.tw.kill('camera');
    const p0 = this.camera.position.clone(), l0 = this.look.clone(), f0 = this.camera.fov;
    return this.tw.run(dur, e => {
      this.camera.position.lerpVectors(p0, r.pos, e); this.look.lerpVectors(l0, r.look, e);
      this.camera.fov = f0 + (r.fov - f0) * e; this.camera.lookAt(this.look); this.camera.updateProjectionMatrix();
    }, { ease: easeName, tag: 'camera' });
  }
  back(dur = .8) { return this.applyView(this.viewPreset, dur); }

  pick(clientX, clientY, objects, recursive = true) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }
  // world -> CSS pixels inside the host
  toScreen(v, out = { x: 0, y: 0, visible: true }) {
    const p = v.clone().project(this.camera);
    out.x = (p.x * .5 + .5) * this.w; out.y = (-p.y * .5 + .5) * this.h; out.visible = p.z < 1 && p.z > -1;
    return out;
  }
  onFrame(fn) { this.frameFns.add(fn); return () => this.frameFns.delete(fn); }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (this.lost || document.hidden) return;
      const now = performance.now(), dt = Math.min(.1, (now - this.last) / 1000); this.last = now;
      this.tw.update(dt);
      for (const fn of this.frameFns) fn(dt);
      if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
      this.watchFps(dt);
    };
    this.last = performance.now();
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  // quietly step down a tier if the device cannot hold the frame rate
  watchFps(dt) {
    if (this.tier === 'low' || new URLSearchParams(location.search).get('q')) return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length < 150) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples = [];
    if (avg > 1 / 38) this.setTier(this.tier === 'high' ? 'mid' : 'low');
  }

  // per-game bloom look; returns a restore function. clearWorld() resets it too.
  setBloom({ strength, radius, threshold } = {}) {
    const b = this.bloom; if (!b) return () => {};
    const saved = { strength: b.strength, radius: b.radius, threshold: b.threshold };
    if (strength !== undefined) b.strength = strength; if (radius !== undefined) b.radius = radius; if (threshold !== undefined) b.threshold = threshold;
    return () => Object.assign(b, saved);
  }
  clearWorld() {
    this.tw.clear();
    this.activeShot = null;
    if (this.bloom) Object.assign(this.bloom, { strength: .22, radius: .5, threshold: .92 });
    const dispose = o => {
      o.traverse(n => {
        if (n.isMesh && n.userData.ownGeo) n.geometry.dispose();
        if ((n.isMesh || n.isPoints || n.isLine) && n.userData.ownMat) [].concat(n.material).forEach(m => {
          for (const t of [m.map, m.emissiveMap, m.alphaMap, ...Object.values(m.uniforms || {}).map(u => u.value)]) if (t?.isTexture && !t.userData?.shared) t.dispose();
          m.dispose();
        });
      });
    };
    for (const c of [...this.world.children]) { dispose(c); this.world.remove(c); }
  }
}
