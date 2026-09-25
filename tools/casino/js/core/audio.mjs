// One AudioContext for everything: decoded foley buffers (low latency, many
// overlapping chips), a few synthesised effects that no sample could do
// (a roulette ball that actually slows down, dice that bounce the number of
// times they bounce), and the generated lo-fi score from lofi-engine.mjs.
import { LofiEngine } from './lofi-engine.mjs';

const BASE = new URL('../../assets/audio/', import.meta.url).href;
const FILES = ['card', 'chip', 'tick', 'win', 'push', 'lose', 'reel'];

export class Sound {
  constructor(bank) {
    this.bank = bank;
    this.sfxOn = bank.setting('sfx') !== false;
    this.musicOn = bank.setting('music') === true;
    this.vol = bank.setting('vol') ?? .7;
    this.buffers = new Map();
    this.ctx = null;
    this.onchange = () => {};
  }
  get ready() { return !!this.ctx; }
  // Must be called from inside a user gesture.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
    this.fxBus = this.ctx.createGain(); this.fxBus.connect(this.master);
    // a short room reverb for the synth voices
    this.verb = this.ctx.createConvolver(); this.verb.buffer = this.impulse(1.6); this.verbSend = this.ctx.createGain(); this.verbSend.gain.value = .18;
    this.verbSend.connect(this.verb); this.verb.connect(this.master);
    this.ctx.resume().catch(() => {});
    for (const f of FILES) fetch(BASE + f + '.wav').then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).then(buf => this.buffers.set(f, buf)).catch(() => {});
    this.noiseBuf = this.makeNoise();
    if (this.musicOn) this.setMusic(true);
  }
  impulse(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec), b = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    return b;
  }
  makeNoise() {
    const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  setVolume(v) { this.vol = v; this.bank.setting('vol', v); if (this.master) this.master.gain.value = v; this.lofi?.setVolume(v * .8); this.onchange(); }
  setSfx(on) { this.sfxOn = on; this.bank.setting('sfx', on); this.onchange(); }
  async setMusic(on) {
    this.musicOn = on; this.bank.setting('music', on);
    if (!this.ctx) { this.onchange(); return; }
    if (on) {
      if (!this.lofi) this.lofi = new LofiEngine({ context: this.ctx, volume: this.vol * .8 });
      try { await this.lofi.start(); } catch {}
    } else this.lofi?.stop();
    this.onchange();
  }
  suspend() { this.lofi?.suspend?.(); }
  resume() { if (this.musicOn) this.lofi?.resume?.(); }

  // sample playback
  play(name, { vol = 1, rate = 1, delay = 0, jitter = .06 } = {}) {
    if (!this.sfxOn || !this.ctx || this.ctx.state !== 'running') return;
    const buf = this.buffers.get(name); if (!buf) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = buf; s.playbackRate.value = rate * (1 + (Math.random() - .5) * jitter);
    g.gain.value = vol; s.connect(g); g.connect(this.fxBus);
    s.start(this.ctx.currentTime + delay);
  }
  chips(n = 3) { for (let i = 0; i < n; i++) this.play('chip', { vol: .55 + Math.random() * .3, rate: .92 + Math.random() * .2, delay: i * (.035 + Math.random() * .03) }); }
  card(delay = 0) { this.play('card', { vol: .7, delay }); }

  // ── synth voices ──
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  tone(freq, { type = 'sine', t = 0, a = .005, d = .4, vol = .2, verb = .3, detune = 0 } = {}) {
    if (!this.sfxOn || !this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), at = c.currentTime + t;
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    this.env(g, at, a, vol, d); o.connect(g); g.connect(this.fxBus);
    if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verbSend); }
    o.start(at); o.stop(at + a + d + .05);
  }
  noise({ t = 0, d = .08, vol = .2, f = 3000, q = 1.2, type = 'bandpass' } = {}) {
    if (!this.sfxOn || !this.ctx) return;
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), at = c.currentTime + t;
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    this.env(g, at, .002, vol, d); s.connect(fl); fl.connect(g); g.connect(this.fxBus);
    s.start(at, Math.random()); s.stop(at + d + .05);
  }
  click() { this.play('tick', { vol: .35 }); }
  whoosh(t = 0) { this.noise({ t, d: .28, vol: .09, f: 900, q: .6 }); }
  chime(level = 1) {
    const base = 523.25, notes = [0, 4, 7, 12, 16, 19].slice(0, 3 + level);
    notes.forEach((n, i) => this.tone(base * Math.pow(2, n / 12), { type: 'triangle', t: i * .07, d: .9, vol: .09, verb: .5 }));
  }
  fanfare() {
    const seq = [[0, 0], [4, .1], [7, .2], [12, .3], [7, .45], [12, .55], [16, .65], [19, .8]];
    for (const [n, t] of seq) { this.tone(392 * Math.pow(2, n / 12), { type: 'sawtooth', t, d: .5, vol: .045, verb: .6 }); this.tone(392 * Math.pow(2, n / 12), { type: 'triangle', t, d: .8, vol: .08, verb: .6 }); }
    for (let i = 0; i < 14; i++) this.coin(1 + i * .08);
  }
  coin(t = 0) {
    const f = 2200 + Math.random() * 1400;
    this.tone(f, { t, d: .35, vol: .05, verb: .35 }); this.tone(f * 1.5, { t, d: .2, vol: .025, verb: .2 });
  }
  thunk(t = 0) { this.tone(95, { type: 'sine', t, d: .16, vol: .35, verb: .05 }); this.noise({ t, d: .05, vol: .12, f: 1800, q: .8 }); }
  lose() { this.tone(220, { type: 'triangle', d: .5, vol: .06 }); this.tone(207.65, { type: 'triangle', t: .16, d: .7, vol: .06 }); }
  // dice: `bounces` impacts on the felt then a wall clack
  dice(hits) {
    for (const h of hits) { this.noise({ t: h.t, d: .04, vol: .25 * h.v, f: 2600 + Math.random() * 1500, q: 2 }); this.tone(160 + Math.random() * 60, { t: h.t, d: .06, vol: .12 * h.v, verb: .05 }); }
  }
  // roulette ball: returns a controller; call .set(speed 0..1) each frame, .stop()
  ballLoop() {
    if (!this.sfxOn || !this.ctx) return { set() {}, clack() {}, stop() {} };
    const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.value = 1800; g.gain.value = 0;
    s.connect(bp); bp.connect(g); g.connect(this.fxBus); s.start();
    let last = 0;
    return {
      set: sp => { const t = c.currentTime; bp.frequency.setTargetAtTime(600 + 2200 * sp, t, .05); g.gain.setTargetAtTime(.07 * Math.min(1, sp * 1.4), t, .08); },
      clack: (v = 1) => { const t = c.currentTime; if (t - last < .05) return; last = t; this.noise({ d: .03, vol: .22 * v, f: 3400, q: 3 }); this.tone(1400 + Math.random() * 500, { d: .05, vol: .05 * v, verb: .1 }); },
      stop: () => { const t = c.currentTime; g.gain.setTargetAtTime(0, t, .05); s.stop(t + .4); }
    };
  }
  reelSpin() {
    if (!this.sfxOn || !this.ctx) return { stop() {} };
    const c = this.ctx, s = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; lp.type = 'lowpass'; lp.frequency.value = 700; g.gain.value = 0;
    s.connect(lp); lp.connect(g); g.connect(this.fxBus); s.start(); g.gain.setTargetAtTime(.06, c.currentTime, .05);
    return { stop: () => { g.gain.setTargetAtTime(0, c.currentTime, .06); s.stop(c.currentTime + .4); } };
  }
}
