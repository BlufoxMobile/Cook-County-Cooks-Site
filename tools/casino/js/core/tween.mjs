// Tiny timeline engine driven by the Stage's frame loop.
// Every tween returns a Promise so game scripts read top to bottom:
//   await tw.to(card.position,{x:.2,z:.4},{dur:.45,ease:'outCubic'});
export const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => (t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  outExpo: t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBackSoft: t => { const c1 = .9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + .75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + .9375;
    return n1 * (t -= 2.625 / d1) * t + .984375;
  }
};

export class Tweens {
  constructor() { this.list = []; this.speed = 1; }
  // Animate numeric props of `target` to the values in `to`.
  to(target, to, { dur = .4, ease: e = 'outCubic', delay = 0, onUpdate = null, tag = null } = {}) {
    const fn = typeof e === 'function' ? e : (ease[e] || ease.outCubic);
    return new Promise(resolve => {
      const tw = { target, to, from: null, dur: Math.max(1e-4, dur), t: -delay, fn, onUpdate, resolve, tag };
      this.list.push(tw);
    });
  }
  // Run a custom function f(eased t in 0..1) over `dur` seconds.
  run(dur, f, { ease: e = 'linear', delay = 0, tag = null } = {}) {
    const fn = typeof e === 'function' ? e : (ease[e] || ease.linear);
    return new Promise(resolve => {
      this.list.push({ custom: f, dur: Math.max(1e-4, dur), t: -delay, fn, resolve, tag });
    });
  }
  wait(sec) { return this.run(sec, () => {}); }
  kill(tag) {
    this.list = this.list.filter(tw => { if (tw.tag === tag) { tw.resolve(false); return false; } return true; });
  }
  killTarget(target) {
    this.list = this.list.filter(tw => { if (tw.target === target) { tw.resolve(false); return false; } return true; });
  }
  clear() { for (const tw of this.list) tw.resolve(false); this.list = []; }
  update(dt) {
    dt *= this.speed;
    if (!this.list.length) return;
    const done = [];
    for (const tw of this.list) {
      tw.t += dt;
      if (tw.t < 0) continue;
      if (!tw.custom && !tw.from) {
        tw.from = {};
        for (const k in tw.to) tw.from[k] = tw.target[k];
      }
      const p = Math.min(1, tw.t / tw.dur), v = tw.fn(p);
      try {
        if (tw.custom) tw.custom(v, p);
        else {
          for (const k in tw.to) tw.target[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * v;
          if (tw.onUpdate) tw.onUpdate(v);
        }
      } catch (e) { console.error(e); done.push(tw); continue; }
      if (p >= 1) done.push(tw);
    }
    if (done.length) {
      this.list = this.list.filter(tw => !done.includes(tw));
      for (const tw of done) tw.resolve(true);
    }
  }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
