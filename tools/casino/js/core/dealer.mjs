// Ace, the live video dealer, and the lounge behind him.
//
// The room is one wide still (lounge-still.webp) painted on a plane that
// stands at the far rail of whichever table is on stage. Ace's clips are
// video, cropped at the same rail line, and composited INTO that plane in
// the shader: every clip starts and ends on the exact frame the still was
// built from, so the seam is invisible and reactions can cut in at any time
// with a quarter-second crossfade.
import * as THREE from '../vendor/three.min.mjs';

const BASE = new URL('../../assets/', import.meta.url).href;
// still geometry, measured when the plate was composited (see README)
const STILL = { aspect: 3168 / 942, u0: .18939, u1: .80997, vTop: 1 - .14862, rail: 1 - .98458 };
const EXT_X = .6, EXT_Y = .9;
export const CLIPS = ['idle', 'cuff', 'deal', 'win', 'lose', 'big', 'nomore'];

export class Backdrop {
  constructor(stage, { mobile = false } = {}) {
    this.stage = stage; this.mobile = mobile;
    const loader = new THREE.TextureLoader();
    this.still = loader.load(BASE + `img/lounge-still${mobile ? '-m' : ''}.webp`);
    this.still.colorSpace = THREE.SRGBColorSpace;
    this.empty = null;
    this.uniforms = {
      vidA: { value: null }, vidB: { value: null }, mixAB: { value: 0 }, vidOn: { value: 0 },
      rect: { value: new THREE.Vector4(STILL.u0, STILL.u1, 0, STILL.vTop) }, dim: { value: 1 }, blurEdge: { value: 1 }
    };
    const mat = new THREE.MeshBasicMaterial({ map: this.still, toneMapped: false, transparent: true, depthWrite: true });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', `uniform sampler2D vidA; uniform sampler2D vidB; uniform float mixAB; uniform float vidOn; uniform vec4 rect; uniform float dim; uniform float blurEdge;
void main() {`)
        .replace('#include <map_fragment>', `
          vec2 m = vMapUv;
          if ( m.x < 0.0 ) m.x = min( -m.x, rect.x );   // mirror the room, never back into the dealer
          if ( m.x > 1.0 ) m.x = max( 2.0 - m.x, rect.y );
          if ( m.y > 1.0 ) m.y = 1.0 - min( m.y - 1.0, 0.12 );   // reflect only the ceiling band, never the dealer
          vec4 sc = texture2D( map, m );
          vec3 col = sc.rgb;
          vec2 q = vec2( (vMapUv.x - rect.x) / (rect.y - rect.x), (vMapUv.y - rect.z) / (rect.w - rect.z) );
          if ( vidOn > 0.0 && q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0 ) {
            vec3 va = texture2D( vidA, q ).rgb;
            vec3 vb = texture2D( vidB, q ).rgb;
            vec3 v = mix( va, vb, mixAB );
            float f = smoothstep( 0.0, 0.05, q.x ) * smoothstep( 1.0, 0.95, q.x ) * smoothstep( 1.0, 0.975, q.y );
            col = mix( col, v, f * vidOn );
          }
          // outside the painted room: a mirrored, darkening continuation so no camera ever sees an edge
          float outside = max( max( -vMapUv.x, vMapUv.x - 1.0 ), vMapUv.y - 1.0 );
          col *= dim * mix( 0.06, 1.0, 1.0 - smoothstep( 0.0, 0.3, outside ) );
          diffuseColor = vec4( col, opacity );
        `);
    };
    this.mat = mat;
    // the plane is wider and taller than the painting; UVs run past 0..1 and the shader mirrors + darkens there
    const geo = new THREE.PlaneGeometry(1 + 2 * EXT_X, (1 + EXT_Y) / STILL.aspect);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, -EXT_X + uv.getX(i) * (1 + 2 * EXT_X), uv.getY(i) * (1 + EXT_Y));
    this.plane = new THREE.Mesh(geo, mat);
    this.plane.renderOrder = -1;
    this.group = new THREE.Group();
    this.group.add(this.plane);
    stage.scene.add(this.group);

    // video
    this.els = [this.makeVideo(), this.makeVideo()];
    this.texs = this.els.map(v => { const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; });
    this.front = 0; // index of the element currently fully shown
    this.uniforms.vidA.value = this.texs[0]; this.uniforms.vidB.value = this.texs[1];
    this.blobs = new Map();
    this.queue = Promise.resolve();
    this.enabled = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.current = null;
  }
  makeVideo() {
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto'; v.crossOrigin = 'anonymous';
    return v;
  }
  url(name) {
    if (!this.ext) { const t = document.createElement('video'); this.ext = t.canPlayType('video/mp4; codecs="avc1.4D401F"') ? 'mp4' : 'webm'; }
    return BASE + `video/ace-${name}${this.mobile ? '-m' : ''}.${this.ext}`;
  }
  async src(name) {
    if (this.blobs.has(name)) return this.blobs.get(name);
    try {
      const r = await fetch(this.url(name));
      if (!r.ok) throw Error(r.status);
      const u = URL.createObjectURL(await r.blob());
      this.blobs.set(name, u); return u;
    } catch { return this.url(name); }
  }
  preload() { for (const c of CLIPS) this.src(c); }

  // Put the backdrop's rail line at world (0, railY, z), `width` metres wide.
  place({ z = -.6, railY = .05, width = 2.6, x = 0, rotY = 0 } = {}) {
    const h = width / STILL.aspect;
    this.plane.scale.set(width, width, 1);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = rotY;
    // plane is centred; the rail line sits STILL.rail up from its bottom edge
    this.plane.position.set(0, railY + h * (1 + EXT_Y) / 2 - STILL.rail * h, 0);
    this.group.visible = true;
  }
  hide() { this.group.visible = false; }
  setDim(v = 1) { this.uniforms.dim.value = v; }
  setRoom(kind) {
    if (kind === 'empty') {
      if (!this.empty) { this.empty = new THREE.TextureLoader().load(BASE + `img/lounge-empty${this.mobile ? '-m' : ''}.webp`); this.empty.colorSpace = THREE.SRGBColorSpace; }
      this.mat.map = this.empty; this.uniforms.vidOn.value = 0; this.dealerOn = false;
    } else { this.mat.map = this.still; this.dealerOn = true; if (this.playing) this.uniforms.vidOn.value = 1; }
    this.mat.needsUpdate = true;
  }

  // Start the idle loop. Resolves false when autoplay is refused (low power mode).
  async start() {
    if (!this.enabled) return false;
    const v = this.els[this.front];
    v.loop = true; v.src = await this.src('idle');
    try { await v.play(); } catch { this.blocked = true; return false; }
    await this.firstFrame(v);
    this.playing = true; this.current = 'idle';
    if (this.dealerOn !== false) this.stage.tw.run(.5, e => { this.uniforms.vidOn.value = e; });
    this.preload();
    return true;
  }
  // Retry after a user gesture when autoplay was refused.
  kick() { if (this.blocked) { this.blocked = false; this.start(); } }
  firstFrame(v) {
    return new Promise(res => {
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => res());
      else if (v.readyState >= 2) res(); else v.addEventListener('loadeddata', () => res(), { once: true });
      setTimeout(res, 1500);
    });
  }
  // Play a reaction clip, then glide back to idle.
  play(name) {
    if (!this.playing || !this.enabled || !CLIPS.includes(name)) return Promise.resolve();
    this.queue = this.queue.then(() => this._play(name)).catch(() => {});
    return this.queue;
  }
  async _swapTo(name, loop) {
    const back = 1 - this.front, v = this.els[back];
    v.loop = loop; v.src = await this.src(name);
    try { v.currentTime = 0; await v.play(); } catch { return false; }
    await this.firstFrame(v);
    const from = this.front === 0 ? 0 : 1, to = 1 - from;
    await this.stage.tw.run(.22, e => { this.uniforms.mixAB.value = from + (to - from) * e; });
    this.els[this.front].pause();
    this.front = back; this.current = name;
    return true;
  }
  async _play(name) {
    if (!(await this._swapTo(name, false))) return;
    const v = this.els[this.front];
    await new Promise(res => {
      const done = () => { v.removeEventListener('ended', done); res(); };
      v.addEventListener('ended', done);
      setTimeout(done, (v.duration || 7) * 1000 + 400);
    });
    await this._swapTo('idle', true);
  }
  pause() { for (const v of this.els) v.pause(); }
  resume() { if (this.playing) this.els[this.front].play().catch(() => {}); }
}
