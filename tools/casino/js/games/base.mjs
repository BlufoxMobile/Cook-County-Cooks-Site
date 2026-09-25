// Shared behaviour for every game on the floor.
import * as THREE from '../vendor/three.min.mjs';
import { fmt } from '../core/hud.mjs';

export class Game {
  static id = 'base';
  constructor(ctx) {
    Object.assign(this, ctx);
    this.tw = ctx.stage.tw;
    this.root = new THREE.Group();
    this.stage.world.add(this.root);
    this.alive = true;
    this.offs = [];
  }
  get balance() { return this.bank.balance; }
  emit(type, data = {}) { this.events.emit('game', { game: this.constructor.id, type, ...data }); }
  // tap on the 3D table: calls fn(hit, event) for taps (not drags)
  onTap(fn) {
    const c = this.stage.canvas; let down = null;
    const pd = e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const pu = e => {
      if (!down) return; const d = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
      if (d > 12) return; this.sound.unlock(); fn(e);
    };
    c.addEventListener('pointerdown', pd); c.addEventListener('pointerup', pu);
    this.offs.push(() => { c.removeEventListener('pointerdown', pd); c.removeEventListener('pointerup', pu); });
  }
  onHover(targets, fn) {
    const c = this.stage.canvas;
    const mv = e => { if (e.pointerType !== 'mouse') return; const h = this.stage.pick(e.clientX, e.clientY, targets(), false)[0]; c.style.cursor = h ? 'pointer' : ''; fn?.(h); };
    c.addEventListener('pointermove', mv);
    this.offs.push(() => { c.removeEventListener('pointermove', mv); c.style.cursor = ''; });
  }
  key(map) {
    const h = e => { if (e.target?.closest?.('input,select,textarea') || document.querySelector('.sheet.on')) return; const f = map[e.key.toLowerCase()]; if (f) { e.preventDefault(); f(); } };
    addEventListener('keydown', h); this.offs.push(() => removeEventListener('keydown', h));
  }
  wait(s) { return this.tw.wait(s); }
  say(t) { this.hud.say(t); }
  money(n) { return fmt(n); }
  async exit() {
    this.alive = false;
    for (const f of this.offs) f();
    this.offs = [];
    this.hud.clearAnchors();
    // this.root stays in stage.world: main calls stage.clearWorld() next, which frees ownGeo/ownMat meshes
    this.dispose?.();
  }
  // denominations offered in the rack for a table
  rackFor(min) {
    const all = [10, 25, 100, 500, 1000, 5000, 25000];
    const start = Math.max(0, all.findIndex(v => v >= min));
    return all.slice(start, start + 6);
  }
}
