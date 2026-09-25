/* lofi-engine.mjs — procedural lo-fi hip hop, pure WebAudio, no files, no network. */

const MIN_GAIN = 1e-4;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* Chord shapes: semitone offsets from the chord root. Sevenths and ninths only. */
const SHAPES = {
  m9:      [0, 3, 7, 10, 14],
  m7:      [0, 3, 7, 10],
  m11:     [0, 3, 10, 14, 17],
  maj9:    [0, 4, 7, 11, 14],
  maj7:    [0, 4, 7, 11],
  maj7s11: [0, 4, 11, 14, 18],
  dom9:    [0, 4, 7, 10, 14],
  dom13:   [0, 4, 10, 14, 21],
  dom7b9:  [0, 4, 7, 10, 13],
  dom7s5:  [0, 4, 8, 10],
  halfdim: [0, 3, 6, 10],
  halfdim9:[0, 3, 6, 10, 14],
};

/* Original progressions, degrees relative to the minor tonic (0 = i).
   Each entry: [degree, shape, bars]. ii-V motion and borrowed chords throughout. */
const PROGRESSIONS = [
  { name: 'A', bars: 8, chords: [[0,'m9',2],[5,'m9',2],[10,'dom9',2],[3,'maj7',2]] },
  { name: 'B', bars: 8, chords: [[2,'halfdim9',2],[7,'dom7b9',2],[0,'m9',2],[8,'maj9',2]] },
  { name: 'C', bars: 8, chords: [[0,'m11',2],[8,'maj9',1],[10,'dom13',1],[3,'maj7s11',2],[7,'dom7s5',2]] },
  { name: 'D', bars: 8, chords: [[5,'m9',2],[10,'dom13',2],[3,'maj9',2],[8,'maj7',2]] },
  { name: 'E', bars: 8, chords: [[0,'m9',1],[0,'m7',1],[2,'halfdim',2],[7,'dom7b9',2],[0,'m9',2]] },
  { name: 'F', bars: 8, chords: [[8,'maj9',2],[5,'m11',2],[0,'m9',2],[10,'dom9',2]] },
  { name: 'G', bars: 8, chords: [[0,'m9',2],[3,'maj7',2],[5,'m7',2],[10,'dom7b9',2]] },
];

/* Drum patterns on a 16th grid (indices 0..15). */
const KICKS = [
  [0, 6, 10], [0, 10, 11], [0, 3, 10], [0, 6, 11], [0, 7, 10], [0, 10], [0, 6, 10, 14],
];
const SNARES = [
  [4, 12], [4, 12], [4, 12, 14], [4, 11, 12], [4, 12],
];

export class LofiEngine {
  /**
   * @param {object} [opts]
   * @param {BaseAudioContext} [opts.context] supply a context (used by the offline render harness)
   * @param {number} [opts.volume] 0..1
   * @param {number} [opts.seed] force the PRNG seed (deterministic renders)
   */
  constructor(opts = {}) {
    this.ctx = opts.context || null;
    this._ownsCtx = !opts.context;
    this._offline = !!(opts.context && typeof opts.context.startRendering === 'function');
    this._vol = typeof opts.volume === 'number' ? Math.max(0, Math.min(1, opts.volume)) : 0.7;
    this._seed = (opts.seed == null) ? (Math.random() * 4294967296) >>> 0 : (opts.seed >>> 0);
    this.rng = mulberry32(this._seed);

    this._running = false;
    this._suspended = false;
    this._timer = null;
    this._voices = new Set();      // live voice teardown records — the leak guard
    this._built = false;

    this.lookahead = 0.15;         // seconds of music scheduled ahead of currentTime
    this.tickMs = 25;

    this.bpm = 70 + this.rng() * 12;          // 70..82
    this.swing = 0.55 + this.rng() * 0.07;    // 0.55..0.62 of the beat
    this.beat = 60 / this.bpm;
    this.barDur = this.beat * 4;

    this.bar = 0;
    this.nextBarTime = 0;
    this.key = 57 + Math.floor(this.rng() * 5) - 2;  // A minor-ish, +/- a couple of semitones
    this.section = null;
    this._lastProg = -1;
    this._lastVoicing = null;
  }

  get playing() { return this._running && !this._suspended; }
  get contextState() { return this.ctx ? this.ctx.state : 'none'; }

  /* ---------------------------------------------------------------- lifecycle */

  async start() {
    if (this._running) return true;
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) throw new Error('WebAudio unavailable');
      this.ctx = new AC({ latencyHint: 'playback' });
      this._ownsCtx = true;
    }
    if (!this._offline && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) {}
    }
    this._gen = (this._gen || 0) + 1;   // invalidates any teardown still pending from a stop()
    this._build();
    this._running = true;
    this._suspended = false;

    const t0 = this.ctx.currentTime + (this._offline ? 0.02 : 0.12);
    this.nextBarTime = t0;
    this._startTexture(t0);
    this._applyVolume(0.25);

    if (!this._offline) {
      this._timer = setInterval(() => this._tick(), this.tickMs);
      this._tick();
    }
    return this.playing;
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    this._suspended = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (this.master) {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(this.master.gain.value, MIN_GAIN), now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.12);
    }
    // Hard teardown after the fade, but only if start() has not been called since:
    // a fast off/on toggle must not have its new graph torn down by this timer.
    this._gen = (this._gen || 0) + 1;
    const g = this._gen;
    const kill = () => { if (this._gen === g && !this._running) this._teardownGraph(); };
    if (this._offline) kill();
    else setTimeout(kill, 400);
  }

  suspend() {
    if (!this._running || this._suspended) return;
    this._suspended = true;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }   // scheduling genuinely stops
    if (this.ctx && !this._offline && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  async resume() {
    if (!this._running || !this._suspended) return this.playing;
    this._suspended = false;
    if (this.ctx && !this._offline && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) {}
    }
    this._reanchor();
    if (!this._offline && !this._timer) {
      this._timer = setInterval(() => this._tick(), this.tickMs);
      this._tick();
    }
    return this.playing;
  }

  setVolume(v) {
    this._vol = Math.max(0, Math.min(1, v || 0));
    if (this._running) this._applyVolume(0.08);
  }

  dispose() {
    this.stop();
    this._teardownGraph();
    if (this._ownsCtx && this.ctx && !this._offline) {
      const c = this.ctx; this.ctx = null;
      c.close().catch(() => {});
    }
  }

  /** Offline pump: schedule every event that starts before `until` (seconds). */
  scheduleUntil(until) {
    if (!this._running) return;
    let guard = 0;
    while (this.nextBarTime < until && guard++ < 20000) {
      this._scheduleBar(this.bar, this.nextBarTime);
      this.bar++;
      this.nextBarTime += this.barDur;
    }
  }

  /* ---------------------------------------------------------------- scheduler */

  _tick() {
    if (!this._running || this._suspended || !this.ctx) return;
    const now = this.ctx.currentTime;
    // If the tab was frozen or the clock jumped, re-anchor instead of dumping
    // a burst of past-due events into the graph.
    if (this.nextBarTime < now - 0.05) this._reanchor();
    this.scheduleUntil(now + this.lookahead);
  }

  _reanchor() {
    if (!this.ctx) return;
    this.nextBarTime = this.ctx.currentTime + 0.08;
  }

  /* ---------------------------------------------------------------- graph */

  _build() {
    if (this._built) return;
    const ctx = this.ctx;

    this.out = ctx.createGain();            // hard limiter sits after this
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.08;

    this.master = ctx.createGain();
    this.master.gain.value = MIN_GAIN;

    this.glue = ctx.createDynamicsCompressor();  // gentle bus glue
    this.glue.threshold.value = -20;
    this.glue.knee.value = 14;
    this.glue.ratio.value = 3.2;
    this.glue.attack.value = 0.008;
    this.glue.release.value = 0.22;

    this.out.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);
    this.tilt = ctx.createBiquadFilter();        // tame the low pile-up
    this.tilt.type = 'lowshelf'; this.tilt.frequency.value = 190; this.tilt.gain.value = -6.5;
    this.pres = ctx.createBiquadFilter();        // open the window the chords live in
    this.pres.type = 'peaking'; this.pres.frequency.value = 2400;
    this.pres.Q.value = 0.7; this.pres.gain.value = 6.0;
    this.glue.connect(this.tilt); this.tilt.connect(this.pres); this.pres.connect(this.out);

    // Tone: the lo-fi lowpass. Everything musical lives under it.
    this.toneLP = ctx.createBiquadFilter();
    this.toneLP.type = 'lowpass';
    this.toneLP.frequency.value = 4000;
    this.toneLP.Q.value = 0.6;
    this.toneHP = ctx.createBiquadFilter();
    this.toneHP.type = 'highpass';
    this.toneHP.frequency.value = 46;
    this.toneLP.connect(this.toneHP);
    this.toneHP.connect(this.glue);

    // Buses
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 1.15;
    this.drumBus = ctx.createGain();  this.drumBus.gain.value = 0.78;
    this.drumLP = ctx.createBiquadFilter();
    this.drumLP.type = 'lowpass'; this.drumLP.frequency.value = 9000; this.drumLP.Q.value = 0.5;
    this.musicBus.connect(this.toneLP);
    this.drumBus.connect(this.drumLP);
    this.drumLP.connect(this.glue);

    // Filtered feedback delay (the room on the chords)
    const d = ctx.createDelay(2.0);
    d.delayTime.value = this.beat * 0.75;           // dotted-ish eighth
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass'; dlp.frequency.value = 1700;
    const dhp = ctx.createBiquadFilter();
    dhp.type = 'highpass'; dhp.frequency.value = 260;
    d.connect(dlp); dlp.connect(dhp); dhp.connect(fb); fb.connect(d);
    this.delaySend = ctx.createGain(); this.delaySend.gain.value = 1;
    this.delaySend.connect(d);
    const dout = ctx.createGain(); dout.gain.value = 0.5;
    dhp.connect(dout); dout.connect(this.toneLP);
    this._delayNodes = [d, fb, dlp, dhp, dout];

    // Small generated plate
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._makeIR(1.4);
    this.verbSend = ctx.createGain(); this.verbSend.gain.value = 1;
    const vout = ctx.createGain(); vout.gain.value = 0.34;
    this.verbSend.connect(this.verb); this.verb.connect(vout); vout.connect(this.toneLP);
    this._verbOut = vout;

    // Tape wow / flutter: one shared LFO pair driving every oscillator's detune.
    this.wow = ctx.createGain(); this.wow.gain.value = 5.5;      // cents
    const l1 = ctx.createOscillator(); l1.type = 'sine'; l1.frequency.value = 0.19;
    const l2 = ctx.createOscillator(); l2.type = 'sine'; l2.frequency.value = 5.6;
    const l2g = ctx.createGain(); l2g.gain.value = 0.28;
    l1.connect(this.wow); l2.connect(l2g); l2g.connect(this.wow);
    l1.start(); l2.start();
    this._lfos = [l1, l2, l2g];

    this.noiseBuf = this._makeNoise(2.0);
    this._built = true;
  }

  _teardownGraph() {
    for (const v of Array.from(this._voices)) this._freeVoice(v);
    this._voices.clear();
    const all = [];
    if (this._lfos) { for (const o of this._lfos) { try { o.stop && o.stop(); } catch (_) {} all.push(o); } }
    if (this._texture) { for (const n of this._texture) { try { n.stop && n.stop(); } catch (_) {} all.push(n); } }
    for (const k of ['out','limiter','master','glue','tilt','pres','toneLP','toneHP','musicBus','drumBus','drumLP',
                     'delaySend','verb','verbSend','_verbOut','wow']) {
      if (this[k]) all.push(this[k]);
    }
    if (this._delayNodes) all.push(...this._delayNodes);
    for (const n of all) { try { n.disconnect(); } catch (_) {} }
    this._lfos = null; this._texture = null; this._delayNodes = null;
    this._built = false;
  }

  _applyVolume(ramp) {
    if (!this.master) return;
    const now = this.ctx.currentTime;
    const target = Math.max(MIN_GAIN, this._vol * 0.74);
    const g = this.master.gain;
    try { g.cancelAndHoldAtTime(now); } catch (_) { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
    g.linearRampToValueAtTime(target, now + ramp);     // never a step
  }

  /* ------------------------------------------------------------ voice plumbing */

  /**
   * Every sounding thing goes through here. A voice owns its nodes; when its
   * primary source ends, onended disconnects all of them and drops the record.
   * Nothing is created outside this function except the four permanent texture
   * sources and the two LFOs, so there is no path to an orphaned node.
   */
  _voice(src, nodes, stopAt, params) {
    // `params` are AudioParams the shared wow LFO was connected INTO. A plain
    // node.disconnect() only drops a node's outgoing edges, so without this the
    // LFO's own output list would hold a reference to every oscillator forever.
    const rec = { src, nodes, params: params || null };
    this._voices.add(rec);
    src.onended = () => this._freeVoice(rec);
    try { src.stop(stopAt); } catch (_) {}
    // Belt and braces for engines that drop onended on a closed context.
    if (!this._offline) {
      rec.t = setTimeout(() => this._freeVoice(rec), Math.max(0, (stopAt - this.ctx.currentTime) * 1000) + 600);
    }
    return rec;
  }

  _freeVoice(rec) {
    if (!this._voices.has(rec)) return;
    this._voices.delete(rec);
    if (rec.t) clearTimeout(rec.t);
    rec.src.onended = null;
    if (rec.params && this.wow) {
      for (const prm of rec.params) { try { this.wow.disconnect(prm); } catch (_) {} }
    }
    try { rec.src.disconnect(); } catch (_) {}
    for (const n of rec.nodes) { try { n.disconnect(); } catch (_) {} }
  }

  get liveVoices() { return this._voices.size; }

  _makeNoise(sec) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = this.rng() * 2 - 1;
    return b;
  }

  _makeIR(sec) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const env = Math.pow(1 - t, 3.2) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
        lp += 0.28 * ((this.rng() * 2 - 1) - lp);       // darken the tail
        d[i] = lp * env;
      }
    }
    return b;
  }

  _noiseSrc(t, dur, offset) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.85 + this.rng() * 0.3;
    const off = offset == null ? this.rng() * 1.5 : offset;
    try { s.start(t, off, dur); } catch (_) { s.start(t); }
    return s;
  }

  /* ------------------------------------------------------------ texture layer */

  _stopTexture() {
    if (!this._texture) return;
    for (const n of this._texture) {
      try { if (n.stop) n.stop(); } catch (_) {}
      try { n.disconnect(); } catch (_) {}
    }
    this._texture = null;
  }

  _startTexture(t0) {
    const ctx = this.ctx;
    this._stopTexture();          // a restart must not stack a second crackle bed
    this._texture = [];

    // Vinyl crackle: a long generated bed of pops + surface noise, looped.
    const secs = 7.3;                                  // not a musical length
    const n = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (this.rng() * 2 - 1) * 0.10;   // surface hiss
    let i = 0;
    while (i < n) {                                     // random pops
      i += Math.floor(ctx.sampleRate * (0.05 + Math.pow(this.rng(), 2) * 0.55));
      if (i >= n) break;
      const amp = (0.12 + this.rng() * 0.3) * (this.rng() < 0.12 ? 2.0 : 1.0);
      const len = 14 + Math.floor(this.rng() * 110);
      for (let j = 0; j < len && i + j < n; j++) {
        d[i + j] += amp * (this.rng() * 2 - 1) * Math.pow(1 - j / len, 2.5);
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 780; hp.Q.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4800;
    const g = ctx.createGain(); g.gain.value = 0.042;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.out);
    src.start(t0);
    this._texture.push(src, hp, lp, g);

    // Low tape hum/rumble bed, very quiet, keeps the floor from feeling digital.
    const hum = ctx.createBufferSource();
    hum.buffer = this.noiseBuf; hum.loop = true;
    const hlp = ctx.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 190; hlp.Q.value = 0.7;
    const hg = ctx.createGain(); hg.gain.value = 0.010;
    hum.connect(hlp); hlp.connect(hg); hg.connect(this.out);
    hum.start(t0);
    this._texture.push(hum, hlp, hg);
  }

  /* ------------------------------------------------------------ arrangement */

  _planSection(phrase) {
    const r = this.rng;
    let p;
    do { p = Math.floor(r() * PROGRESSIONS.length); } while (p === this._lastProg && PROGRESSIONS.length > 1);
    this._lastProg = p;

    // Drift the key a little every few phrases so nothing settles forever.
    if (phrase > 0 && r() < 0.34) {
      const steps = [-3, -2, 0, 2, 3, 5];
      this.key = 55 + ((this.key - 55 + steps[Math.floor(r() * steps.length)] + 12) % 12);
    }

    const roll = r();
    const wasStripped = this.section && this.section.mode !== 'full' && this.section.mode !== 'fullMel';
    let mode;
    if (phrase === 0) mode = 'intro';
    else if (wasStripped) mode = roll < 0.5 ? 'full' : 'fullMel';  // never two stripped phrases running
    else if (roll < 0.11) mode = 'sparse';      // chords, bass and crackle only
    else if (roll < 0.23) mode = 'noKick';      // hats + chords, kick rests
    else if (roll < 0.33) mode = 'hatsOnly';
    else if (roll < 0.68) mode = 'full';
    else mode = 'fullMel';

    this.section = {
      mode,
      prog: PROGRESSIONS[p],
      kick: KICKS[Math.floor(r() * KICKS.length)],
      snare: SNARES[Math.floor(r() * SNARES.length)],
      hatDensity: 0.72 + r() * 0.28,
      melody: mode === 'fullMel' ? 0.32 : (mode === 'full' ? 0.11 : (mode === 'sparse' ? 0.20 : 0.07)),
      bass: true,
      restrike: r() < 0.55,
      dropLast: r() < 0.22,
      swingJitter: (r() - 0.5) * 0.015,
    };
  }

  _chordForBar(barInPhrase) {
    const list = this.section.prog.chords;
    let acc = 0;
    for (const c of list) {
      if (barInPhrase < acc + c[2]) return { deg: c[0], shape: c[1], start: acc, len: c[2] };
      acc += c[2];
    }
    const last = list[list.length - 1];
    return { deg: last[0], shape: last[1], start: acc - last[2], len: last[2] };
  }

  /* Greedy voice leading into MIDI 56..80. */
  _voiceChord(rootMidi, shape) {
    const tones = SHAPES[shape].map((s) => (rootMidi + s) % 12);
    const prev = this._lastVoicing;
    const out = [];
    for (let i = 0; i < tones.length; i++) {
      const pc = tones[i];
      let best = null, bestD = 1e9;
      for (let m = 56; m <= 80; m++) {
        if (((m % 12) + 12) % 12 !== ((pc % 12) + 12) % 12) continue;
        const ref = prev && prev[i] != null ? prev[i] : 66;
        const d = Math.abs(m - ref) + (out.some((o) => Math.abs(o - m) < 2) ? 6 : 0);
        if (d < bestD) { bestD = d; best = m; }
      }
      if (best != null) out.push(best);
    }
    this._lastVoicing = out;
    return out;
  }

  /* ------------------------------------------------------------ timing grid */

  _eighth(j) {
    const sw = Math.max(0.5, Math.min(0.66, this.swing + (this.section ? this.section.swingJitter : 0)));
    return (Math.floor(j / 2) + (j % 2 ? sw : 0)) * this.beat;
  }

  _sixteenth(i) {
    if (i % 2 === 0) return this._eighth(i / 2);
    return (this._eighth((i - 1) / 2) + this._eighth((i + 1) / 2)) / 2;
  }

  _hum(ms) { return (this.rng() - 0.5) * 2 * ms * 0.001; }

  /* ------------------------------------------------------------ bar scheduler */

  _scheduleBar(bar, t) {
    const phrase = Math.floor(bar / 8);
    const inPhrase = bar % 8;
    if (inPhrase === 0) this._planSection(phrase);
    const s = this.section;
    const r = this.rng;

    const drop = s.dropLast && inPhrase === 7;
    const intro = s.mode === 'intro';
    const introDrums = intro && inPhrase >= 4;
    const introHats = intro && inPhrase >= 2;
    const wantKick = !drop && (intro ? introDrums
      : (s.mode !== 'sparse' && s.mode !== 'hatsOnly' && s.mode !== 'noKick'));
    const wantSnare = !drop && (intro ? introDrums : (s.mode !== 'sparse' && s.mode !== 'hatsOnly'));
    const wantHats = !drop && (intro ? introHats : s.mode !== 'sparse');

    // ---- chords: once per chord change, held
    const ch = this._chordForBar(inPhrase);
    if (ch.start === inPhrase) {
      const rootMidi = this.key + ch.deg;
      const notes = this._voiceChord(rootMidi, ch.shape);
      const dur = ch.len * this.barDur * 0.92;
      const vel = 0.20 + r() * 0.07;
      for (let i = 0; i < notes.length; i++) {
        this._rhodes(t + this._hum(14) + i * 0.012 * r(), notes[i], dur, vel * (i === 0 ? 0.85 : 1));
      }
      if (s.restrike) {                                  // soft re-voicing on the and-of-3
        const at = t + this._eighth(5) + this._hum(18);
        const sub2 = notes.slice(1);
        for (let i = 0; i < sub2.length; i++) {
          this._rhodes(at + i * 0.01 * r(), sub2[i], this.beat * 2.2, vel * 0.42);
        }
      }
      if (s.bass) {
        this._bass(t + this._hum(10), rootMidi - 24, this.beat * 1.6, 0.27);
        if (r() < 0.55) {
          const fifth = r() < 0.6 ? 7 : (r() < 0.5 ? -5 : 12);
          this._bass(t + this._eighth(5) + this._hum(10), rootMidi - 24 + fifth, this.beat * 0.9, 0.19);
        }
      }
    } else if (s.bass && r() < 0.7) {
      const rootMidi = this.key + ch.deg;
      this._bass(t + this._hum(10), rootMidi - 24, this.beat * 1.3, 0.24);
      if (r() < 0.4) this._bass(t + this._eighth(5) + this._hum(10), rootMidi - 24 + 7, this.beat * 0.8, 0.16);
    }

    // ---- drums
    if (wantKick) {
      for (const idx of s.kick) {
        if (idx !== 0 && r() < 0.12) continue;             // occasional omission
        this._kick(t + this._sixteenth(idx) + this._hum(9), 0.72 + r() * 0.22);
      }
    }
    if (wantSnare) {
      for (const idx of s.snare) {
        const ghost = idx !== 4 && idx !== 12;
        if (ghost && r() < 0.45) continue;
        this._snare(t + this._sixteenth(idx) + this._hum(11), ghost ? 0.22 + r() * 0.1 : 0.62 + r() * 0.2);
      }
    }
    if (wantHats) {
      for (let j = 0; j < 8; j++) {
        if (r() > s.hatDensity) continue;
        const acc = (j % 2 === 0) ? 1 : 0.62;
        const v = (0.27 + r() * 0.22) * acc;
        this._hat(t + this._eighth(j) + this._hum(7), v, r() < 0.12);
        if (r() < 0.10) {                                   // 16th flam
          const a = this._eighth(j), b = this._eighth(j + 1);
          this._hat(t + (a + b) / 2 + this._hum(6), v * 0.6, false);
        }
      }
    }
    // fill at the end of a phrase
    if (inPhrase === 7 && !intro && r() < 0.4) {
      for (let k = 0; k < 3; k++) {
        this._snare(t + this._sixteenth(13 + k) + this._hum(8), 0.2 + k * 0.13);
      }
    }

    // ---- melody: sparse on purpose
    if (r() < 0.75) {
      const scale = [0, 2, 3, 5, 7, 8, 10];
      const base = this.key + 12;
      for (let j = 0; j < 8; j++) {
        if (r() > s.melody) continue;
        const deg = scale[Math.floor(r() * scale.length)] + (r() < 0.3 ? 12 : 0);
        const len = this.beat * (0.5 + r() * 1.4);
        this._lead(t + this._eighth(j) + this._hum(16), base + deg, len, 0.1 + r() * 0.06);
      }
    }
  }

  /* ------------------------------------------------------------ instruments */

  _kick(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(124, t);
    o.frequency.exponentialRampToValueAtTime(47, t + 0.06);
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(v * 0.78, t + 0.004);
    g.gain.exponentialRampToValueAtTime(v * 0.18, t + 0.10);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + 0.24);
    o.connect(g); g.connect(this.drumBus);
    o.start(t);
    this._voice(o, [g], t + 0.27);

    // soft beater click
    const n = this._noiseSrc(t, 0.03);
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(v * 0.1, t);
    ng.gain.exponentialRampToValueAtTime(MIN_GAIN, t + 0.03);
    n.connect(nf); nf.connect(ng); ng.connect(this.drumBus);
    this._voice(n, [nf, ng], t + 0.05);
  }

  _snare(t, v) {
    const ctx = this.ctx;
    const n = this._noiseSrc(t, 0.3);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1500 + this.rng() * 700; bp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5400;
    const g = ctx.createGain();
    const dec = 0.10 + this.rng() * 0.07;
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(v * 0.5, t + 0.003);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dec);
    n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(this.drumBus);
    g.connect(this.verbSend);
    this._voice(n, [bp, lp, g], t + dec + 0.05);

    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(196 + this.rng() * 24, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(MIN_GAIN, t);
    og.gain.linearRampToValueAtTime(v * 0.22, t + 0.004);
    og.gain.exponentialRampToValueAtTime(MIN_GAIN, t + 0.09);
    o.connect(og); og.connect(this.drumBus);
    o.start(t);
    this._voice(o, [og], t + 0.11);
  }

  _hat(t, v, open) {
    const ctx = this.ctx;
    const dec = open ? 0.16 + this.rng() * 0.08 : 0.028 + this.rng() * 0.026;
    const n = this._noiseSrc(t, dec + 0.02);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 6800 + this.rng() * 2800; bp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dec);
    n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(this.drumBus);
    this._voice(n, [bp, hp, g], t + dec + 0.03);
  }

  /* Warm electric-piano-ish tone: detuned sine partials, soft attack, long release. */
  _rhodes(t, midi, dur, v) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const rel = 1.2;                                   // tail overlaps the next chord
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3600, t);
    lp.frequency.exponentialRampToValueAtTime(2100, t + dur * 0.9);
    lp.Q.value = 0.4;
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(v, t + 0.05);
    g.gain.exponentialRampToValueAtTime(v * 0.66, t + 0.7);
    g.gain.exponentialRampToValueAtTime(v * 0.42, t + dur);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur + rel);
    g.connect(lp);
    lp.connect(this.musicBus);
    const send = ctx.createGain(); send.gain.value = 0.3;
    lp.connect(send); send.connect(this.verbSend); send.connect(this.delaySend);

    const parts = [[1, 1.0, 'sine'], [2, 0.20, 'sine'], [1, 0.34, 'triangle'], [3.01, 0.06, 'sine']];
    const owned = [g, lp, send];
    const wowed = [];
    let primary = null;
    for (let i = 0; i < parts.length; i++) {
      const [mul, amp, type] = parts[i];
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      o.detune.value = (this.rng() - 0.5) * 9;
      this.wow.connect(o.detune); wowed.push(o.detune);   // tape wow
      const og = ctx.createGain(); og.gain.value = amp * 0.30;
      o.connect(og); og.connect(g);
      o.start(t);
      owned.push(og);
      if (i === 0) {
        primary = o;                              // primary's onended frees the whole voice
      } else {
        try { o.stop(t + dur + rel + 0.06); } catch (_) {}
        owned.push(o);
      }
    }
    this._voice(primary, owned, t + dur + rel + 0.06, wowed);
  }

  _bass(t, midi, dur, v) {
    const ctx = this.ctx;
    // Keep the bass in its pocket rather than the sub basement.
    while (midi < 38) midi += 12;
    while (midi > 50) midi -= 12;
    const f = mtof(midi);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = f;
    this.wow.connect(o.detune);
    const o2 = ctx.createOscillator(); o2.type = 'triangle';
    o2.frequency.value = f; o2.detune.value = 6;
    const o2g = ctx.createGain(); o2g.gain.value = 0.14;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(v, t + 0.03);
    g.gain.exponentialRampToValueAtTime(v * 0.5, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);
    o.connect(g); o2.connect(o2g); o2g.connect(g); g.connect(lp); lp.connect(this.musicBus);
    o.start(t); o2.start(t);
    try { o2.stop(t + dur + 0.05); } catch (_) {}
    this._voice(o, [o2, o2g, lp, g], t + dur + 0.05, [o.detune]);
  }

  _lead(t, midi, dur, v) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = f;
    o.detune.value = (this.rng() - 0.5) * 8;
    this.wow.connect(o.detune);
    const o2 = ctx.createOscillator(); o2.type = 'triangle';
    o2.frequency.value = f * 2; 
    const o2g = ctx.createGain(); o2g.gain.value = 0.08;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(v, t + 0.06);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);
    o.connect(g); o2.connect(o2g); o2g.connect(g); g.connect(lp); lp.connect(this.musicBus);
    const send = ctx.createGain(); send.gain.value = 0.42;
    lp.connect(send); send.connect(this.delaySend); send.connect(this.verbSend);
    o.start(t); o2.start(t);
    try { o2.stop(t + dur + 0.05); } catch (_) {}
    this._voice(o, [o2, o2g, g, lp, send], t + dur + 0.05, [o.detune]);
  }
}

export default LofiEngine;
