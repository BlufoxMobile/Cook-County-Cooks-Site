// ROULETTE — European single zero. A turned walnut wheel at the end of a long
// table, the full printed layout, tap-anywhere betting (straight, split, street,
// corner, six line, trio, first four and every outside bet), an analytically
// choreographed ball and a cinematic camera for the last seconds of every spin.
import * as THREE from '../vendor/three.min.mjs';
import { Game } from './base.mjs';
import { buildTable, text, hitRect, PRINT, PRINT_SOFT } from '../core/tables.mjs';
import { ChipPile, ChipFactory, CHIP } from '../core/props.mjs';
import { rand } from '../core/rng.mjs';
import { fmt, floatText, esc } from '../core/hud.mjs';
import { FONT_DISPLAY, FONT_TEXT } from '../core/textures.mjs';
import { ease } from '../core/tween.mjs';
import * as R from '../rules/roulette.mjs';
import * as L from './roulette-layout.mjs';
import { RouletteWheel, WHEEL_RADIUS } from './roulette-wheel.mjs';

const TABLE = { type: 'rect', W: 2.5, D: 1.04, r: .17, zc: 0 };
const FAR = TABLE.zc - TABLE.D / 2;
const WC = new THREE.Vector3(-.722, 0, -.02);            // wheel centre
const FELT = '#0a2a52';
const PILE_SCALE = .8;                                   // chips on the layout are a touch smaller so neighbours don't collide
const ZERO_TIP = .034;
const DEALER = new THREE.Vector3(-.12, .03, -.43);
const VIEW = {
  landscape: { pos: [-.07, 1.2, 1.02], look: [-.07, 0, -.06], fov: 40, fitWidth: 2.68, maxFov: 60 },
  portrait: { pos: [1.06, 2.12, .078], look: [.475, 0, .078], fov: 48, fitWidth: .62, maxFov: 70 }
};
const NAMES = { red: 'Red', black: 'Black', green: 'Green' };

export default class Roulette extends Game {
  static id = 'roulette';

  async enter(first) {
    const { stage } = this;
    this.injectCss();
    document.getElementById('app')?.classList.add('rou-on');
    this.portraitPaint = stage.portrait;
    this.backdrop.setRoom('dealer');
    this.placeBackdrop();
    try { await Promise.race([document.fonts.load(`700 40px ${FONT_DISPLAY}`), new Promise(r => setTimeout(r, 1200))]); } catch {}
    if (!this.alive) return;
    const size = stage.tier === 'high' ? 3072 : stage.tier === 'mid' ? 2048 : 1536;
    this.table = buildTable(stage, { outline: TABLE, felt: { color: FELT, size: [size], paint: (c, P, S, W, H) => this.paintFelt(c, P, S, W, H) } });
    this.wheel = new RouletteWheel(stage, { x: WC.x, z: WC.z });
    this.root.add(this.wheel.group);
    this.wheel.on = {
      launch: () => { this.loop?.stop(); this.loop = this.sound.ballLoop(); this.sound.whoosh(); },
      clack: v => { this.loop?.clack(v); if (v > .5) this.sound.noise({ d: .05, vol: .12 * v, f: 2400, q: 1.5 }); },
      thunk: () => { this.sound.thunk(); this.loop?.clack(1); },
      settle: () => { this.loop?.stop(); this.loop = null; this.sound.thunk(); this.sound.tone(1320, { d: .5, vol: .04, verb: .4 }); }
    };
    this.hist = (this.bank.setting('rouHist') || []).filter(n => Number.isInteger(n) && n >= 0 && n <= 36).slice(0, 18);
    this.wheel.setRest(this.hist[0] ?? 0);
    this.buildHighlights();
    this.buildDolly();
    this.hit = hitRect(this.root, (L.BOUNDS.x0 + L.BOUNDS.x1) / 2, (L.BOUNDS.z0 + L.BOUNDS.z1) / 2 + .01, L.BOUNDS.x1 - L.BOUNDS.x0 + .03, L.BOUNDS.z1 - L.BOUNDS.z0 + .05, { layout: true });
    this.lights();

    this.bets = new Map();            // id → {bet, pile, amount}
    this.history = [];                // undo groups: [{id, v}]
    this.lastBets = null;
    this.phase = 'bet';
    this.onTap(e => this.tap(e));
    this.hover();
    this.key({ ' ': () => this.press('spin'), enter: () => this.press('spin'), c: () => this.press('clear'), u: () => this.press('undo'), z: () => this.press('undo'), r: () => this.press('rebet'), d: () => this.press('double') });
    this.hud.rack(this.rackFor(R.TABLE_MIN), () => {});
    const frame = dt => this.frame(dt);
    frame.onResize = () => this.orient();
    this.offFrame = stage.onFrame(frame);
    this.renderHistory();
    await stage.applyView(VIEW, first ? 0 : 1.2);
    if (!this.alive) return;
    this.betting();
    this.say('Place your bets. Tap a number, a line or a corner.');
  }

  // ── scene dressing ──────────────────────────────────────────────────────
  placeBackdrop() {
    if (this.stage.portrait) this.backdrop.place({ x: TABLE.W / -2 - .04, z: WC.z, railY: .057, width: 2.1, rotY: Math.PI / 2 });
    else this.backdrop.place({ z: FAR - .03, railY: .057, width: 2.05, x: -.18 });
  }
  lights() {
    const k = this.stage.key;
    this.keySaved = { p: k.position.clone(), t: k.target.position.clone(), i: k.intensity, a: k.angle };
    k.position.set(-.15, 2.5, .7); k.target.position.set(-.15, 0, -.04); k.angle = .74; k.intensity = 23;
    // lacquered wood under a key light sits above the default bloom threshold in close-up; only let real
    // specular sparkle bloom at this table (restored in dispose)
    if (this.stage.bloom) { this.bloomSaved = { th: this.stage.bloom.threshold, st: this.stage.bloom.strength }; this.stage.bloom.threshold = 1.6; this.stage.bloom.strength = .18; }
    // tame the felt's grazing sheen so the blue stays deep
    const fm = this.table.felt.material;
    if (fm.isMeshPhysicalMaterial) { fm.specularIntensity = .28; fm.sheen = .35; fm.sheenColor.set('#2a64b8'); fm.sheenRoughness = .7; fm.envMapIntensity = .1; }
    if (this.stage.tier === 'high') {
      const rim = new THREE.PointLight(0x9fb8ff, .9, 2.2, 1.6); rim.position.set(WC.x - .5, .55, WC.z - .7);
      this.root.add(rim);
    }
  }
  orient() {
    if (this.phase === 'bet' && this.bets) this.renderBetUI();
    if (!this.table || this.stage.portrait === this.portraitPaint) { this.renderHistory(); return; }
    this.portraitPaint = this.stage.portrait;
    const cv = this.table.feltCanvas, c = cv.getContext('2d');
    this.paintFelt(c, this.table.P, this.table.S, cv.width, cv.height);
    this.table.feltTex.needsUpdate = true;
    this.placeBackdrop();
    this.renderHistory();
  }

  // ── the printed felt ────────────────────────────────────────────────────
  paintFelt(c, P, S, W, H) {
    const port = this.portraitPaint, rUp = port ? -Math.PI / 2 : 0, rAlong = port ? Math.PI : 0;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    // cloth: a pool of light over the layout falling away to the rail
    const [gx, gy] = P(.2, .02);
    const g = c.createRadialGradient(gx, gy, S(.08), gx, gy, S(1.55));
    g.addColorStop(0, '#0d356c'); g.addColorStop(.42, '#082249'); g.addColorStop(1, '#020a1a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // faint woven sheen
    c.globalAlpha = .035; c.strokeStyle = '#bcd4ff'; c.lineWidth = Math.max(1, S(.0008));
    for (let y = 0; y < H; y += Math.max(2, S(.004))) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.globalAlpha = 1;
    // the wheel's contact shadow
    const [wx, wy] = P(WC.x, WC.z), sh = c.createRadialGradient(wx, wy, S(WHEEL_RADIUS - .02), wx, wy, S(WHEEL_RADIUS + .09));
    sh.addColorStop(0, 'rgba(0,0,0,.75)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.beginPath(); c.arc(wx, wy, S(WHEEL_RADIUS + .1), 0, 7); c.fill();
    // a gold pinline around the playing surface
    const inset = .075, [ax, ay] = P(-TABLE.W / 2 + inset, FAR + inset), [bx, by] = P(TABLE.W / 2 - inset, -FAR - inset);
    c.strokeStyle = 'rgba(226,196,120,.35)'; c.lineWidth = S(.0022);
    roundPath(c, ax, ay, bx - ax, by - ay, S(.11)); c.stroke();
    c.strokeStyle = 'rgba(226,196,120,.16)'; c.lineWidth = S(.0012);
    roundPath(c, ax + S(.012), ay + S(.012), bx - ax - S(.024), by - ay - S(.024), S(.1)); c.stroke();

    const T = (s, x, z, font, color = PRINT, rot = rUp, spacing = 0) => { const [px, py] = P(x, z); text(c, s, px, py, { font, color, rot, spacing }); };
    // numerals: Bodoni with its hairlines thickened by a same-colour stroke so a 4 never reads as a 1
    const num = (s, x, z, px) => {
      const [a, b] = P(x, z);
      c.save(); c.translate(a, b); c.rotate(rUp); c.font = `800 ${px}px ${FONT_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.fillStyle = 'rgba(0,0,0,.45)'; c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = px * .06; c.strokeText(s, px * .025, px * .035); c.fillText(s, px * .025, px * .035);
      c.fillStyle = '#f6ebcf'; c.strokeStyle = '#f6ebcf'; c.lineWidth = px * .045; c.strokeText(s, 0, 0); c.fillText(s, 0, 0);
      c.restore();
    };
    const box = ([x, z, w, d]) => { const [px, py] = P(x - w / 2, z - d / 2); return [px, py, S(w), S(d)]; };
    const B = L.BOUNDS, GR = L.GRID;
    // layout underlay + drop shadow so the print sits "in" the cloth
    {
      const [x, y] = P(B.x0 - ZERO_TIP * 0 - .014, B.z0 - .014), [x2, y2] = P(B.x1 + .014, B.z1 + .014);
      c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = S(.03); c.fillStyle = 'rgba(4,14,32,.32)';
      roundPath(c, x, y, x2 - x, y2 - y, S(.018)); c.fill(); c.restore();
    }
    // number boxes
    for (let n = 1; n <= 36; n++) {
      const [x, y, w, h] = box(L.cellRect(n)), red = R.REDS.has(n), pad = S(.0042);
      const cg = c.createLinearGradient(x, y, x + w * .3, y + h);
      if (red) { cg.addColorStop(0, '#b3141f'); cg.addColorStop(1, '#6e0911'); } else { cg.addColorStop(0, '#24252b'); cg.addColorStop(1, '#08090b'); }
      c.fillStyle = cg; roundPath(c, x + pad, y + pad, w - 2 * pad, h - 2 * pad, S(.006)); c.fill();
      c.strokeStyle = red ? 'rgba(255,170,160,.18)' : 'rgba(255,255,255,.08)'; c.lineWidth = S(.0012); c.stroke();
      const [cx, cz] = L.cellCentre(n);
      num(String(n), cx, cz, S(.047));
    }
    // zero
    const zp = zeroPath(P);
    const zg = c.createLinearGradient(...P(GR.zeroX0, 0), ...P(GR.x0, 0)); zg.addColorStop(0, '#0b7a45'); zg.addColorStop(1, '#064a2a');
    c.save(); c.fillStyle = zg; c.fill(zp); c.restore();
    const [zx, zz] = L.cellCentre(0);
    num('0', zx + .004, zz, S(.075));
    // gold rules
    const gold = '#e4c67c', line = (x1, z1, x2, z2, lw) => { const [a, b] = P(x1, z1), [d, e] = P(x2, z2); c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.lineWidth = S(lw); c.stroke(); };
    c.strokeStyle = gold; c.lineCap = 'round';
    for (let i = 0; i <= 12; i++) line(GR.x0 + i * L.CELL_U, GR.z0, GR.x0 + i * L.CELL_U, GR.z1, .0022);
    for (let j = 1; j < 3; j++) line(GR.x0, GR.z0 + j * L.CELL_V, GR.colX1, GR.z0 + j * L.CELL_V, .0022);
    line(GR.x0, GR.z1, GR.x1, GR.z1, .0036);                                     // the street line
    for (let d = 1; d < 3; d++) line(GR.x0 + d * 4 * L.CELL_U, GR.z1, GR.x0 + d * 4 * L.CELL_U, GR.dozZ1, .0022);
    line(GR.x0, GR.dozZ1, GR.x1, GR.dozZ1, .0022);
    for (let k = 1; k < 6; k++) line(GR.x0 + k * 2 * L.CELL_U, GR.dozZ1, GR.x0 + k * 2 * L.CELL_U, GR.evenZ1, .0022);
    line(GR.x1, GR.z0, GR.x1, GR.evenZ1, .0022);
    // outer frame (double rule)
    c.lineWidth = S(.004); c.stroke(zp);
    const frame = (off, lw) => {
      const pts = [[GR.x0, GR.evenZ1 + off], [GR.x1 + off, GR.evenZ1 + off], [GR.x1 + off, GR.z1 + off], [GR.colX1 + off, GR.z1 + off], [GR.colX1 + off, GR.z0 - off], [GR.x0, GR.z0 - off]];
      c.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.lineWidth = S(lw); c.stroke();
    };
    frame(0, .0042);
    c.globalAlpha = .55; frame(.0085, .0014);
    c.save(); c.globalAlpha = .55; c.lineWidth = S(.0014);
    const zo = zeroPath(P, .0085); c.stroke(zo); c.restore();
    c.globalAlpha = 1;
    line(GR.x0, GR.z1, GR.x0, GR.evenZ1, .0042);
    // column boxes
    for (let col = 0; col < 3; col++) {
      const r = L.OUTSIDE_BOXES[col].rect;
      T('2 TO 1', r[0], r[1], `800 ${S(.0165)}px ${FONT_TEXT}`, PRINT, rUp, S(.0022));
    }
    // dozens
    ['1st 12', '2nd 12', '3rd 12'].forEach((s, d) => { const r = L.OUTSIDE_BOXES[3 + d].rect; T(s, r[0], r[1] + .002, `italic 600 ${S(.037)}px ${FONT_DISPLAY}`, PRINT, rAlong); });
    // even money
    const ev = L.OUTSIDE_BOXES.slice(6);
    T('1 to 18', ev[0].rect[0], ev[0].rect[1] + .002, `italic 600 ${S(.031)}px ${FONT_DISPLAY}`, PRINT, rAlong);
    T('EVEN', ev[1].rect[0], ev[1].rect[1], `800 ${S(.021)}px ${FONT_TEXT}`, PRINT, rAlong, S(.004));
    T('ODD', ev[4].rect[0], ev[4].rect[1], `800 ${S(.021)}px ${FONT_TEXT}`, PRINT, rAlong, S(.004));
    T('19 to 36', ev[5].rect[0], ev[5].rect[1] + .002, `italic 600 ${S(.031)}px ${FONT_DISPLAY}`, PRINT, rAlong);
    for (const [i, fill, hi] of [[2, '#b3141f', '#e04850'], [3, '#101114', '#3b3d45']]) {
      const [x, z] = ev[i].rect, [px, py] = P(x, z), hw = S(.052), hh = S(.03);
      const dg = c.createLinearGradient(px, py - hh, px, py + hh); dg.addColorStop(0, hi); dg.addColorStop(1, fill);
      c.beginPath(); c.moveTo(px - hw, py); c.lineTo(px, py - hh); c.lineTo(px + hw, py); c.lineTo(px, py + hh); c.closePath();
      c.fillStyle = dg; c.fill(); c.strokeStyle = gold; c.lineWidth = S(.002); c.stroke();
    }
    // house marks: wordmark on the dealer's side, limits along the player's edge
    const wmx = .5, wmz = -.37;
    T('Blufox', wmx, wmz - .012, `italic 600 ${S(.07)}px ${FONT_DISPLAY}`, 'rgba(236,214,160,.5)', rAlong);
    T('EUROPEAN ROULETTE · SINGLE ZERO', wmx, wmz + .045, `700 ${S(.0145)}px ${FONT_TEXT}`, PRINT_SOFT, rAlong, S(.006));
    T(`INSIDE ${R.TABLE_MIN} – ${fmt(R.MAX_INSIDE)}   ·   OUTSIDE ${R.TABLE_MIN} – ${fmt(R.MAX_OUTSIDE)}   ·   STRAIGHT UP PAYS 35 TO 1`, (GR.x0 + GR.x1) / 2, GR.evenZ1 + .05, `700 ${S(.0125)}px ${FONT_TEXT}`, 'rgba(236,214,160,.42)', rAlong, S(.004));
    c.restore();
  }

  // glow planes over each printed box (hover + win): a gold rim with a soft fill, drawn per box shape
  buildHighlights() {
    this.hl = new Map(); this.hlMats = { hover: [], win: [] };
    const cache = new Map();
    const matsFor = (w, d, zero) => {
      const key = zero ? 'zero' : `${w.toFixed(3)}x${d.toFixed(3)}`;
      if (cache.has(key)) return cache.get(key);
      const ppm = 900, cw = Math.round(w * ppm), ch = Math.round(d * ppm), cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      const c = cv.getContext('2d'), rim = .0042 * ppm;
      const path = () => {
        c.beginPath();
        if (zero) { const pts = zeroPts(0), x0 = L.GRID.zeroX0, z0 = L.GRID.z0; pts.forEach(([x, z], i) => { const px = (x - x0) * ppm, py = (z - z0) * ppm; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath(); }
        else { const r = .006 * ppm; c.moveTo(r, 0); c.arcTo(cw, 0, cw, ch, r); c.arcTo(cw, ch, 0, ch, r); c.arcTo(0, ch, 0, 0, r); c.arcTo(0, 0, cw, 0, r); c.closePath(); }
      };
      path(); c.save(); c.clip();
      c.fillStyle = 'rgba(255,255,255,.13)'; c.fillRect(0, 0, cw, ch);
      c.shadowColor = '#fff'; c.shadowBlur = rim * 3; c.lineWidth = rim * 2.2; c.strokeStyle = 'rgba(255,255,255,1)'; path(); c.stroke();
      c.restore();
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const mk = o => new THREE.MeshBasicMaterial({ map: t, color: 0xffd98a, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const m = { hover: mk(.75), win: mk(.9) };
      this.hlMats.hover.push(m.hover); this.hlMats.win.push(m.win);
      cache.set(key, m); return m;
    };
    const plane = (id, [x, z, w, d]) => {
      const mats = matsFor(w, d, false);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.hover);
      m.rotation.x = -Math.PI / 2; m.position.set(x, .0015, z);
      m.visible = false; m.userData.ownGeo = true; m.userData.mats = mats; m.renderOrder = 2; this.root.add(m); this.hl.set(id, m);
    };
    for (let n = 1; n <= 36; n++) plane('n' + n, L.cellRect(n));
    // zero: its pentagon, uv-mapped to its own box
    const G = L.GRID, zw = G.x0 - G.zeroX0, zd = G.z1 - G.z0;
    const zg = new THREE.PlaneGeometry(zw, zd);
    const zm = new THREE.Mesh(zg, matsFor(zw, zd, true).hover);
    zm.rotation.x = -Math.PI / 2; zm.position.set(G.zeroX0 + zw / 2, .0015, G.z0 + zd / 2);
    zm.visible = false; zm.userData.ownGeo = true; zm.userData.mats = matsFor(zw, zd, true); zm.renderOrder = 2; this.root.add(zm); this.hl.set('n0', zm);
    for (const o of L.OUTSIDE_BOXES) plane(o.id, o.rect);
  }
  light(bet, kind) {
    for (const m of this.hl.values()) if (m.userData.kind === kind) { m.visible = false; m.userData.kind = null; }
    if (!bet) return;
    const ids = bet.numbers.map(n => 'n' + n);
    if (!R.isInside(bet)) ids.push(bet.id);
    for (const id of ids) {
      const m = this.hl.get(id); if (!m || (kind === 'hover' && m.userData.kind === 'win')) continue;
      m.material = m.userData.mats[kind]; m.visible = true; m.userData.kind = kind;
    }
  }
  clearLights() { for (const m of this.hl.values()) { m.visible = false; m.userData.kind = null; } }

  buildDolly() {
    const hi = this.stage.tier === 'high';
    const crystal = new THREE.MeshPhysicalMaterial({ color: 0xf4f8ff, roughness: .04, metalness: 0, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.8, ...(hi ? { transmission: 1, thickness: .02, ior: 1.5 } : { transparent: true, opacity: .62 }) });
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xe8bd62, metalness: 1, roughness: .18, envMapIntensity: 2.2 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.017, 0], [.018, .003], [.0155, .006], [.0105, .012], [.0082, .026], [.0094, .034], [.0122, .039], [.0125, .042], [0, .043]].map(([r, y]) => new THREE.Vector2(r, y)), 40), crystal);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.0128, .0128, .003, 40), gold); cap.position.y = .0445;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.0068, 0), gold); gem.position.y = .052; gem.scale.y = 1.3;
    const band = new THREE.Mesh(new THREE.TorusGeometry(.0158, .0013, 8, 40), gold); band.rotation.x = Math.PI / 2; band.position.y = .0045;
    for (const m of [body, cap, gem, band]) { m.castShadow = true; m.userData.ownGeo = true; m.userData.ownMat = true; g.add(m); }
    g.visible = false; g.scale.setScalar(1.6);
    this.root.add(g); this.dolly = g;
  }

  // ── betting ─────────────────────────────────────────────────────────────
  betting() {
    this.phase = 'bet';
    this.hud.rackEnabled(true);
    this.renderBetUI();
  }
  totalBets() { let t = 0; for (const e of this.bets.values()) t += e.amount; return t; }
  entry(bet) {
    let e = this.bets.get(bet.id);
    if (!e) {
      const [x, z] = L.betSpot(bet);
      const pile = new ChipPile(this.stage, this.chips, this.root, new THREE.Vector3(x, 0, z));
      pile.group.scale.setScalar(PILE_SCALE);
      e = { bet, pile, amount: 0, x, z };
      this.bets.set(bet.id, e);
    }
    return e;
  }
  renderBetUI() {
    if (this.phase !== 'bet') return;
    const total = this.totalBets(), last = this.lastBets ? this.lastBets.reduce((a, b) => a + b.amount, 0) : 0;
    this.hud.bet('TOTAL BET', total, this.stage.w < 520 ? `Table ${R.TABLE_MIN}–${fmt(R.MAX_OUTSIDE)}` : `Min ${R.TABLE_MIN} · Max ${fmt(R.MAX_INSIDE)} inside · ${fmt(R.MAX_OUTSIDE)} outside`);
    this.hud.affordable(this.balance);
    this.hud.actions([
      { id: 'clear', label: 'CLEAR', onClick: () => this.clearBets(), disabled: !total },
      { id: 'undo', label: 'UNDO', onClick: () => this.undo(), disabled: !this.history.length },
      // one slot: REBET while the layout is empty, DOUBLE once chips are down (the blackjack pattern)
      last && !total ? { id: 'rebet', label: 'REBET', sub: fmt(last), onClick: () => this.rebet(), disabled: last > this.balance }
        : { id: 'double', label: 'DOUBLE', sub: 'ALL BETS', onClick: () => this.doubleBets(), disabled: !total || total > this.balance },
      { id: 'spin', label: 'SPIN', kind: 'primary', hot: total > 0, onClick: () => this.spin(), disabled: !total, key: '␣' }
    ]);
  }
  press(id) {
    if (this.phase !== 'bet') return;
    document.querySelector(`#actions .act[data-id="${id}"]:not(:disabled)`)?.click();
  }
  layoutPoint(e) {
    const h = this.stage.pick(e.clientX, e.clientY, [this.hit], false)[0];
    return h ? h.point : null;
  }
  tap(e) {
    if (this.phase !== 'bet') return;
    const p = this.layoutPoint(e); if (!p) return;
    const bet = L.betAt(p.x, p.z); if (!bet) return;
    this.place(bet, this.hud.selected);
  }
  place(bet, v) {
    const cur = this.bets.get(bet.id)?.amount || 0, max = R.maxFor(bet);
    if (cur + v > max) { this.hud.toast(`Table max on ${esc(R.betName(bet).toLowerCase())} is <b>${fmt(max)}</b>.`); return false; }
    if (!this.bank.stake(v)) { this.hud.toast('Not enough chips for that one.'); return false; }
    const e = this.entry(bet);
    e.amount += v;
    this.history.push([{ id: bet.id, v }]);
    this.sound.chips(1);
    this.flyTo(e, v);
    this.tip(e);
    this.renderBetUI();
    return true;
  }
  // one chip (or a whole stack) arcs from the player's side onto the bet
  flyTo(e, amount, { from = this.chipOrigin(), dur = .36, delay = 0 } = {}) {
    const s = this.chips.stack(amount, { max: 8 }); s.scale.setScalar(PILE_SCALE);
    const h0 = ChipFactory.breakdown(Math.max(0, e.amount - amount), 36).length;
    const to = new THREE.Vector3(e.x, Math.min(14, h0) * CHIP.h * PILE_SCALE, e.z);
    s.position.copy(from); s.visible = delay <= 0; this.root.add(s);
    return this.tw.run(dur, (k, p) => { s.visible = true; s.position.lerpVectors(from, to, k); s.position.y += Math.sin(p * Math.PI) * .07; s.rotation.x = (1 - k) * 1.1; }, { ease: 'outCubic', delay }).then(() => {
      this.root.remove(s);
      if (this.alive) e.pile.set(e.amount);
    });
  }
  // lift a pile off the felt and send it somewhere; the logical pile is emptied at once
  sweep(e, to, { dur = .5, delay = 0, arc = .05 } = {}) {
    const g = e.pile.group;
    const fresh = new THREE.Group(); fresh.position.copy(g.position); fresh.scale.copy(g.scale); this.root.add(fresh);
    e.pile.group = fresh; e.pile.amount = 0;
    if (!g.children.length) { this.root.remove(g); return Promise.resolve(); }
    const start = g.position.clone();
    return this.tw.run(dur, (k, p) => { g.position.lerpVectors(start, to, k); g.position.y += Math.sin(p * Math.PI) * arc; }, { ease: 'inOutCubic', delay }).then(() => this.root.remove(g));
  }
  chipOrigin() {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(0, -.92), this.stage.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.05), out = new THREE.Vector3();
    return rc.ray.intersectPlane(plane, out) ? out : new THREE.Vector3(.4, .05, .5);
  }
  tip(e, hold = 1.6) {
    if (!e.amount) { this.hud.unanchor('rou-tip'); return; }
    this.hud.anchor('rou-tip', this.tipPos(e.x, e.z), `<span class="tag rou-tip">${esc(R.betName(e.bet))} <b>${fmt(e.amount)}</b><small>${e.bet.pays} TO 1</small></span>`);
    clearTimeout(this.tipT);
    if (hold) this.tipT = setTimeout(() => { if (!this.hovering) this.hud.unanchor('rou-tip'); }, hold * 1000);
  }
  // just "above" a bet on screen: toward the dealer in landscape, toward the wheel in portrait
  tipPos(x, z) { return this.stage.portrait ? new THREE.Vector3(x - .055, .03, z) : new THREE.Vector3(x, .03, z - .05); }
  hover() {
    const c = this.stage.canvas;
    const mv = ev => {
      if (ev.pointerType !== 'mouse' || this.phase !== 'bet') return;
      const p = this.layoutPoint(ev), bet = p ? L.betAt(p.x, p.z) : null;
      c.style.cursor = bet ? 'pointer' : '';
      if ((bet?.id || null) === (this.hoverId || null)) return;
      this.hoverId = bet?.id || null; this.hovering = !!bet;
      this.light(bet, 'hover');
      if (bet) {
        const e = this.bets.get(bet.id), [x, z] = L.betSpot(bet);
        this.hud.anchor('rou-tip', this.tipPos(x, z), `<span class="tag rou-tip">${esc(R.betName(bet))}${e?.amount ? ` <b>${fmt(e.amount)}</b>` : ''}<small>${bet.pays} TO 1</small></span>`);
      } else this.hud.unanchor('rou-tip');
    };
    const out = () => { this.hoverId = null; this.hovering = false; if (this.phase === 'bet') { this.light(null, 'hover'); this.hud.unanchor('rou-tip'); } c.style.cursor = ''; };
    c.addEventListener('pointermove', mv); c.addEventListener('pointerleave', out);
    this.offs.push(() => { c.removeEventListener('pointermove', mv); c.removeEventListener('pointerleave', out); c.style.cursor = ''; });
  }
  clearBets() {
    const n = this.totalBets(); if (!n || this.phase !== 'bet') return;
    this.bank.unstake(n);
    const home = this.chipOrigin();
    for (const e of this.bets.values()) if (e.amount) { e.amount = 0; this.sweep(e, home, { dur: .42 }); }
    this.history = [];
    this.hud.unanchor('rou-tip');
    this.sound.chips(4); this.renderBetUI();
  }
  undo() {
    const grp = this.history.pop(); if (!grp || this.phase !== 'bet') return;
    let back = 0;
    const home = this.chipOrigin();
    for (const { id, v } of grp) {
      const e = this.bets.get(id); if (!e) continue;
      const take = Math.min(v, e.amount); e.amount -= take; back += take;
      const s = this.chips.stack(take, { max: 8 }); s.scale.setScalar(PILE_SCALE);
      const from = new THREE.Vector3(e.x, ChipFactory.breakdown(e.amount, 36).length * CHIP.h * PILE_SCALE, e.z);
      s.position.copy(from); this.root.add(s);
      e.pile.set(e.amount);
      this.tw.run(.34, (k, p) => { s.position.lerpVectors(from, home, k); s.position.y += Math.sin(p * Math.PI) * .06; }, { ease: 'inCubic' }).then(() => this.root.remove(s));
    }
    if (back) this.bank.unstake(back);
    this.hud.unanchor('rou-tip');
    this.sound.chips(2); this.renderBetUI();
  }
  rebet() {
    if (this.phase !== 'bet' || !this.lastBets || this.totalBets()) return;
    const total = this.lastBets.reduce((a, b) => a + b.amount, 0);
    if (total > this.balance) { this.hud.toast('Not enough chips to repeat that layout.'); return; }
    const grp = [], from = this.chipOrigin();
    this.lastBets.forEach(({ id, amount }, i) => {
      const bet = R.betById(id); if (!bet || !this.bank.stake(amount)) return;
      const e = this.entry(bet); e.amount += amount; grp.push({ id, v: amount });
      this.flyTo(e, amount, { from, delay: i * .045, dur: .4 });
    });
    if (grp.length) this.history.push(grp);
    this.sound.chips(Math.min(8, grp.length + 2)); this.renderBetUI();
  }
  doubleBets() {
    if (this.phase !== 'bet') return;
    const adds = [];
    for (const e of this.bets.values()) if (e.amount) { const add = Math.min(e.amount, R.maxFor(e.bet) - e.amount); if (add > 0) adds.push([e, add]); }
    const need = adds.reduce((a, [, v]) => a + v, 0);
    if (!need) { this.hud.toast('Every bet is already at the table max.'); return; }
    if (need > this.balance) { this.hud.toast('Not enough chips to double everything.'); return; }
    this.bank.stake(need);
    const from = this.chipOrigin();
    adds.forEach(([e, add], i) => { e.amount += add; this.flyTo(e, add, { from, delay: i * .04, dur: .38 }); });
    this.history.push(adds.map(([e, v]) => ({ id: e.bet.id, v })));
    this.sound.chips(Math.min(8, adds.length + 2)); this.renderBetUI();
  }

  // ── the spin ────────────────────────────────────────────────────────────
  async spin() {
    if (this.phase !== 'bet' || !this.totalBets()) return;
    this.phase = 'spin';
    const live = [...this.bets.values()].filter(e => e.amount > 0);
    for (const e of this.bets.values()) if (!e.amount) { e.pile.dispose(); this.bets.delete(e.bet.id); }
    this.lastBets = live.map(e => ({ id: e.bet.id, amount: e.amount }));
    this.staked = this.totalBets(); this.settled = false; this.histPushed = false;
    this.outcome = rand(37);                          // decided before the ball leaves the croupier's hand
    this.result = R.settleSpin(live.map(e => ({ bet: e.bet, amount: e.amount })), this.outcome);
    this.hud.rackEnabled(false); this.hud.actions([]); this.hud.unanchor('rou-tip');
    this.clearLights(); this.stage.canvas.style.cursor = '';
    this.hud.bet('TOTAL BET', this.staked, `${live.length} bet${live.length > 1 ? 's' : ''} on the layout`);
    this.say('No more bets.');
    this.backdrop.play('nomore');
    const W = this.wheel, plan = W.spin(this.outcome);
    // 1 · up to the wheel while the croupier lifts the ball
    this.shotWheel('high', 1.3);
    await W.when(plan.drop - .75);
    if (!this.alive) return;
    // 2 · down low, aimed where the ball will meet the rotor
    this.shotWheel('low', 1.0, W.predictedAngle(plan.contact + .7));
    await W.when(plan.landed);
    if (!this.alive) return;
    const n = this.outcome, col = R.colorOf(n);
    this.say(`${n}, ${NAMES[col].toLowerCase()}.`);
    await W.when(plan.end - .35);
    if (!this.alive) return;
    // 3 · lock onto the pocket from above
    this.trackPocket(n, .95);
    this.pocketTag = `<span class="tag rou-num ${col}">${n}<small>${NAMES[col].toUpperCase()}</small></span>`;
    this.sound.chime(1);
    await this.wait(2.0);
    if (!this.alive) return;
    this.track = null; this.hud.unanchor('rou-num');
    this.stage.back(1.15);
    await this.wait(.75);
    if (!this.alive) return;
    this.pushHistory(n);
    await this.reveal(n);
  }
  // camera presets around the wheel
  wheelPose(kind, az) {
    const port = this.stage.portrait, asp = this.stage.camera.aspect;
    const P = (a, r, y) => new THREE.Vector3(WC.x + r * Math.cos(a), y, WC.z - r * Math.sin(a));
    const fit = (pos, look, fov, width) => { const d = pos.distanceTo(look); return Math.max(fov, Math.min(78, 2 * Math.atan(width / 2 / d / asp) * 180 / Math.PI)); };
    if (kind === 'high') {
      const a = port ? .12 : -Math.PI / 2 + .5;
      const pos = port ? P(a, .78, 1.28) : P(a, .8, .72), look = new THREE.Vector3(WC.x, .04, WC.z);
      return { pos, look, fov: fit(pos, look, 40, 1.08) };
    }
    if (kind === 'low') {
      // outside the rim, a little to one side of where the action will be, looking across the rotor
      const a = az + (port ? .3 : .42);
      const pos = P(a, port ? .66 : .6, port ? .36 : .26), look = P(az, .08, .025);
      return { pos, look, fov: fit(pos, look, 36, port ? .44 : .5) };
    }
    return null;
  }
  shotWheel(kind, dur, az) {
    this.track = null;
    const v = this.wheelPose(kind, az);
    return this.stage.shot({ pos: v.pos.toArray(), look: v.look.toArray(), fov: v.fov }, dur);
  }
  // top-down camera that rides the rotor so the winning pocket sits still, number upright
  trackPocket(n, dur) {
    this.stage.tw.kill('camera');
    const cam = this.stage.camera, port = this.stage.portrait;
    const tmp = new THREE.Vector3();
    this.track = {
      t: 0, dur, p0: cam.position.clone(), l0: this.stage.look.clone(), f0: cam.fov,
      fn: () => {
        // from the rotor's centre side, tilted ~55°, so the number reads upright and the lights don't glare back
        const look = this.wheel.pocketWorld(n, tmp, .245, .03).clone();
        const th = Math.atan2(-(look.z - WC.z), look.x - WC.x), back = th + Math.PI, off = port ? .26 : .25;
        const pos = new THREE.Vector3(look.x + off * Math.cos(back), port ? .5 : .38, look.z - off * Math.sin(back));
        return { pos, look, fov: port ? 46 : 34 };
      }
    };
  }
  frame(dt) {
    if (!this.wheel) return;
    this.wheel.update(dt);
    this.loop?.set(this.wheel.speed);
    const tr = this.track;
    if (tr) {
      tr.t += dt;
      const e = ease.inOutCubic(Math.min(1, tr.t / tr.dur)), pose = tr.fn(), cam = this.stage.camera;
      cam.position.lerpVectors(tr.p0, pose.pos, e); this.stage.look.lerpVectors(tr.l0, pose.look, e);
      cam.fov = tr.f0 + (pose.fov - tr.f0) * e; cam.lookAt(this.stage.look); cam.updateProjectionMatrix();
      if (this.pocketTag && tr.t > tr.dur * .6) this.hud.anchor('rou-num', this.wheel.pocketWorld(this.outcome, new THREE.Vector3(), .175, .075), this.pocketTag);
    }
    const t = performance.now() / 1000;
    const pulse = .62 + .3 * Math.sin(t * 4.2);
    for (const m of this.hlMats.win) m.opacity = pulse;
  }

  // ── results ─────────────────────────────────────────────────────────────
  async reveal(n) {
    const res = this.result, col = R.colorOf(n);
    // light the winning number and every outside box it pays
    const outs = L.OUTSIDE_BOXES.filter(o => R.betById(o.id).numbers.includes(n)).map(o => o.id);
    this.light({ numbers: [n], type: 'straight', id: 'straight:' + n }, 'win');
    for (const id of outs) { const m = this.hl.get(id); m.material = m.userData.mats.win; m.visible = true; m.userData.kind = 'win'; }
    // the dolly drops onto the number (on top of a straight-up stack if there is one)
    const [dx, dz] = L.cellCentre(n), sp = this.bets.get('straight:' + n);
    const topY = sp ? Math.min(14, ChipFactory.breakdown(sp.amount, 36).length) * CHIP.h * PILE_SCALE : 0;
    const d = this.dolly; d.visible = true; d.position.set(dx, .3, dz); d.rotation.y = Math.random() * 6;
    this.sound.whoosh();
    await this.tw.to(d.position, { y: topY }, { dur: .55, ease: 'outBounce' });
    if (!this.alive) return;
    this.sound.thunk(); this.sound.play('chip', { vol: .5, rate: .7 });
    // losing chips go to the house
    const losers = res.lines.filter(l => !l.won), winners = res.lines.filter(l => l.won);
    if (losers.length) {
      await this.wait(.25);
      this.sound.chips(Math.min(8, losers.length + 2));
      await Promise.all(losers.map((l, i) => this.sweep(this.bets.get(l.id), DEALER, { dur: .55, delay: i * .035 })));
    }
    if (!this.alive) return;
    // banner + Ace
    const net = res.net, big = net > 0 && (res.straightHit || net >= Math.max(500, this.staked * 5));
    const title = `${n} ${NAMES[col]}`;
    const sub = res.straightHit ? 'STRAIGHT UP · 35 TO 1' : winners.length ? `${winners.length} WINNING BET${winners.length > 1 ? 'S' : ''}` : n === 0 ? 'ZERO · THE HOUSE NUMBER' : '';
    this.hud.banner({ title, amount: net !== 0 ? net : null, kind: net > 0 ? (big ? 'big' : 'win') : net === 0 ? 'push' : 'lose', sub, hold: winners.length ? 2.2 : 1.7 });
    if (net > 0) { this.backdrop.play(big ? 'big' : 'win'); if (big) this.sound.fanfare(); else this.sound.play('win', { vol: .6 }); }
    else if (net < 0 && !winners.length) { this.backdrop.play('lose'); this.sound.lose(); }
    else if (net < 0) this.sound.chime(1);
    this.say(net > 0 ? (res.straightHit ? `Straight up on ${n}. Beautiful.` : 'Winner. Paying you now.') : net === 0 ? 'Even money back to you.'
      : winners.length ? `${winners.length > 1 ? 'A few winners' : 'One winner'} on the layout. Paying you now.` : n === 0 ? 'Zero. The house number.' : 'Not this time.');
    // winners: the payout slides out from the croupier and lands beside each bet
    const pays = [], tagAt = this.tagSpots(winners);
    if (winners.length) {
      this.sound.chips(6);
      await Promise.all(winners.map(async (l, i) => {
        const e = this.bets.get(l.id), win = l.returned - l.amount;
        const pay = this.chips.stack(win, { max: 22 }); pay.scale.setScalar(PILE_SCALE);
        const to = new THREE.Vector3(e.x + .038, 0, e.z + .03);
        pay.position.copy(DEALER); this.root.add(pay); pays.push(pay);
        await this.tw.run(.55, (k, p) => { pay.position.lerpVectors(DEALER, to, k); pay.position.y += Math.sin(p * Math.PI) * .04; }, { ease: 'outCubic', delay: i * .07 });
        this.hud.anchor('win-' + l.id, tagAt.get(l.id), `<span class="tag win">+${fmt(win)}</span>`);
        floatText(this.hud, new THREE.Vector3(e.x, .06, e.z), '+' + fmt(win));
      }));
      if (!this.alive) return;
      await this.wait(1.1);
      if (!this.alive) return;
      // everything comes home
      const home = this.chipOrigin();
      this.sound.chips(8);
      if (sp) this.tw.to(this.dolly.position, { y: 0 }, { dur: .3, delay: .1, ease: 'outCubic' });
      await Promise.all([
        ...winners.map((l, i) => this.sweep(this.bets.get(l.id), home, { dur: .6, delay: i * .03, arc: .07 })),
        ...pays.map((p, i) => { const s = p.position.clone(); return this.tw.run(.65, (k, q) => { p.position.lerpVectors(s, home, k); p.position.y += Math.sin(q * Math.PI) * .08; }, { ease: 'inOutCubic', delay: i * .03 }).then(() => this.root.remove(p)); })
      ]);
      for (const l of winners) this.hud.unanchor('win-' + l.id);
    }
    if (!this.alive) return;
    this.finish();
    await this.wait(winners.length ? .5 : 1.2);
    if (!this.alive) return;
    // clear up: lift the dolly away, dim the lights, reopen betting
    this.clearLights();
    const dp = this.dolly.position.clone();
    await this.tw.run(.4, (k) => { this.dolly.position.set(dp.x, dp.y + k * .25, dp.z); }, { ease: 'inCubic' });
    this.dolly.visible = false;
    for (const e of this.bets.values()) e.pile.dispose();
    this.bets.clear(); this.history = [];
    if (!this.alive) return;
    this.betting();
    this.say(this.balance < R.TABLE_MIN ? 'You’re out of chips — Ace’s marker is waiting in the lobby.' : 'Place your bets.');
  }
  // win labels for neighbouring bets must not sit on top of each other: nudge them "up" the screen
  tagSpots(winners) {
    const out = new Map(), placed = [], step = this.stage.portrait ? new THREE.Vector3(-.028, 0, 0) : new THREE.Vector3(0, 0, -.028);
    for (const l of [...winners].sort((a, b) => b.win - a.win)) {
      const e = this.bets.get(l.id), p = new THREE.Vector3(e.x, .05, e.z).add(step.clone().multiplyScalar(.7));
      const w = 30 + 9 * fmt(l.win).length;
      for (let k = 0; k < 8; k++) {
        const s = this.stage.toScreen(p);
        if (!placed.some(q => Math.abs(q.x - s.x) < (q.w + w) / 2 + 4 && Math.abs(q.y - s.y) < 27)) { placed.push({ x: s.x, y: s.y, w }); break; }
        p.add(step);
      }
      out.set(l.id, p);
    }
    return out;
  }
  finish() {
    if (this.settled) return;
    this.settled = true;
    const r = this.result;
    this.bank.settle(r.staked, r.returned, 'roulette');
    this.emit('spin', { net: r.net, straightHit: r.straightHit });
  }

  // ── recent numbers ──────────────────────────────────────────────────────
  pushHistory(n, render = true) {
    if (this.histPushed) return;
    this.histPushed = true;
    this.hist.unshift(n); this.hist = this.hist.slice(0, 18);
    this.bank.setting('rouHist', this.hist);
    if (render) this.renderHistory(true);
  }
  renderHistory(fresh = false) {
    let el = document.getElementById('rou-hist');
    if (!el) { el = document.createElement('div'); el.id = 'rou-hist'; el.className = 'rou-hist'; el.setAttribute('aria-label', 'Recent numbers'); document.getElementById('app').append(el); requestAnimationFrame(() => el.classList.add('on')); }
    el.classList.toggle('port', this.stage.portrait);
    const list = this.hist.slice(0, this.stage.portrait ? 10 : 12);
    const reds = list.filter(n => R.colorOf(n) === 'red').length, blacks = list.filter(n => R.colorOf(n) === 'black').length;
    el.innerHTML = `<div class="rh-h">${this.stage.portrait ? 'LAST' : 'RESULTS'}</div><div class="rh-list">${list.map((n, i) => `<div class="rh ${R.colorOf(n)}${i === 0 && fresh ? ' new' : ''}"><b>${n}</b></div>`).join('') || '<div class="rh-empty">—</div>'}</div>${list.length ? `<div class="rh-f"><i class="r"></i>${reds}<i class="b"></i>${blacks}</div>` : ''}`;
  }
  injectCss() {
    if (document.getElementById('css-roulette')) return;
    const s = document.createElement('style'); s.id = 'css-roulette';
    s.textContent = `
.rou-hist{position:absolute;z-index:14;right:calc(16px + var(--corner));top:calc(var(--top) + var(--safe-t) + 62px);width:76px;padding:10px 8px 9px;border-radius:16px;background:linear-gradient(180deg,rgba(18,15,9,.84),rgba(6,7,9,.84));box-shadow:inset 0 0 0 1px rgba(227,199,126,.32),0 18px 40px rgba(0,0,0,.45);pointer-events:none;opacity:0;transition:opacity .6s;font-family:var(--text)}
.rou-hist.on{opacity:1}
.rou-hist .rh-h{font-size:8px;font-weight:800;letter-spacing:.24em;color:var(--gold);text-align:center;margin:0 0 7px;padding-left:.24em;white-space:nowrap}
.rou-hist .rh-list{display:flex;flex-direction:column;gap:3px}
.rou-hist .rh{display:flex;justify-content:center}
.rou-hist .rh b{width:34px;height:22px;border-radius:7px;display:grid;place-items:center;font:700 13px/1 var(--display);color:#fbf3dc;font-variant-numeric:lining-nums}
.rou-hist .rh.red{justify-content:flex-end}.rou-hist .rh.black{justify-content:flex-start}
.rou-hist .rh.red b{background:linear-gradient(180deg,#d02330,#7c0a12)}
.rou-hist .rh.black b{background:linear-gradient(180deg,#34353c,#0b0c0e);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.rou-hist .rh.green b{background:linear-gradient(180deg,#16a263,#064a2b)}
.rou-hist .rh:first-child b{width:40px;height:28px;font-size:16px;box-shadow:0 0 0 1.5px #f3dc9b,0 0 16px rgba(243,220,155,.45)}
.rou-hist .rh.new b{animation:rhIn .7s cubic-bezier(.2,.9,.25,1.3)}
@keyframes rhIn{0%{transform:scale(.3);opacity:0}100%{transform:none;opacity:1}}
.rou-hist .rh-empty{text-align:center;color:var(--mute);font-size:12px}
.rou-hist .rh-f{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:8px;font-size:10px;font-weight:800;color:var(--mute);font-variant-numeric:tabular-nums}
.rou-hist .rh-f i{width:7px;height:7px;border-radius:2px;display:inline-block;margin-left:3px}.rou-hist .rh-f i.r{background:#c21a26}.rou-hist .rh-f i.b{background:#2a2b30;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.rou-hist.port{left:10px;right:auto;top:calc(var(--top) + var(--safe-t) + 52px);width:auto;max-width:calc(100% - 20px);display:flex;align-items:center;gap:8px;padding:6px 10px 6px 12px;border-radius:14px}
.rou-hist.port .rh-h{margin:0;writing-mode:horizontal-tb;font-size:8px;letter-spacing:.22em}
.rou-hist.port .rh-list{flex-direction:row;gap:4px;align-items:center}
.rou-hist.port .rh b{width:24px;height:22px;font-size:12px;border-radius:6px}
.rou-hist.port .rh:first-child b{width:30px;height:26px;font-size:14px}
.rou-hist.port .rh-f{display:none}
.tag.rou-tip{font-size:11.5px;letter-spacing:.08em;padding:5px 10px 5px 11px;display:inline-flex;gap:6px;align-items:baseline}
.tag.rou-tip b{color:var(--gold-hi)}
.tag.rou-tip small{margin-left:2px}
.tag.rou-num{font:700 30px/1 var(--display);padding:8px 16px 9px;display:inline-flex;align-items:baseline;gap:10px;color:#fff;box-shadow:0 0 0 1.5px #f3dc9b,0 14px 40px rgba(0,0,0,.55)}
.tag.rou-num small{font:800 10px var(--text);letter-spacing:.28em;opacity:.9}
.tag.rou-num.red{background:linear-gradient(180deg,#d02330,#7c0a12)}.tag.rou-num.black{background:linear-gradient(180deg,#34353c,#0b0c0e)}.tag.rou-num.green{background:linear-gradient(180deg,#16a263,#064a2b)}
@media (min-width:861px) and (max-width:1240px){.rou-on #actions .act{min-width:82px;padding:0 13px}}
`;
    document.head.append(s);
  }

  help() {
    const row = (name, how, pays) => `<tr><td>${name}</td><td class="muted" style="font-size:12.5px">${how}</td><td class="r">${pays}</td></tr>`;
    return `<p class="eyebrow">TABLE RULES</p><h2>European Roulette <em>single zero</em></h2>
    <ul><li>37 pockets: 1 to 36 plus a single green zero. The house edge is 2.70% on every bet.</li>
    <li>Pick a chip from the rack and tap the layout. Tap a number’s centre for a straight up, a shared line for a split, a crossing for a corner, the outer edge of a row for a street, and where that edge meets a row line for a six line.</li>
    <li>Zero loses every outside bet (no la partage). Bets touching zero — the zero splits, the trios 0-1-2 and 0-2-3 and the first four — win on it.</li>
    <li>Table limits: ${R.TABLE_MIN} minimum, ${fmt(R.MAX_INSIDE)} per inside position, ${fmt(R.MAX_OUTSIDE)} per outside bet.</li></ul>
    <h3>PAYOUTS</h3>
    <table class="paytable">
    ${row('Straight up', 'one number', '35 to 1')}${row('Split', 'two touching numbers', '17 to 1')}${row('Street', 'a row of three', '11 to 1')}${row('Trio', '0-1-2 or 0-2-3', '11 to 1')}
    ${row('Corner', 'four numbers that meet', '8 to 1')}${row('First four', '0-1-2-3', '8 to 1')}${row('Six line', 'two rows', '5 to 1')}${row('Column', '“2 to 1” box', '2 to 1')}
    ${row('Dozen', '1st, 2nd or 3rd 12', '2 to 1')}${row('Red / Black', '', '1 to 1')}${row('Odd / Even', '', '1 to 1')}${row('1–18 / 19–36', '', '1 to 1')}
    </table>
    <h3>BUTTONS</h3><p>CLEAR takes every chip back. UNDO removes your last chip. REBET repeats the last spin’s layout. DOUBLE doubles every bet (up to the table max).</p>
    <h3>KEYS</h3><p class="muted">Space spin · U undo · C clear · R rebet · D double</p>`;
  }

  dispose() {
    this.offFrame?.();
    clearTimeout(this.tipT);
    this.loop?.stop(); this.loop = null;
    document.getElementById('rou-hist')?.remove();
    document.getElementById('css-roulette')?.remove();
    document.getElementById('app')?.classList.remove('rou-on');
    if (this.keySaved) { const k = this.stage.key; k.position.copy(this.keySaved.p); k.target.position.copy(this.keySaved.t); k.intensity = this.keySaved.i; k.angle = this.keySaved.a; }
    if (this.bloomSaved && this.stage.bloom) { this.stage.bloom.threshold = this.bloomSaved.th; this.stage.bloom.strength = this.bloomSaved.st; }
    // money never goes missing when the player walks away
    if (this.phase === 'bet') { const n = this.bets ? this.totalBets() : 0; if (n) this.bank.unstake(n); }
    else if (this.result && !this.settled) { this.finish(); this.pushHistory(this.outcome, false); }
    this.wheel?.dispose();
    // base.exit() has already detached this.root, so stage.clearWorld() never sees it: free our own GPU objects here
    this.root.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.ownGeo) o.geometry.dispose();
      if (o.userData.ownMat) [].concat(o.material).forEach(m => { m.map?.dispose(); m.dispose(); });
    });
    this.hit?.material.dispose();
    if (this.hlMats) for (const m of [...this.hlMats.hover, ...this.hlMats.win]) { m.map?.dispose(); m.dispose(); }
  }
}

// the zero box: a pointed "home plate" facing the wheel
function zeroPts(grow = 0) {
  const G = L.GRID, zm = (G.z0 + G.z1) / 2;
  return [[G.x0 + grow, G.z0 - grow], [G.x0 + grow, G.z1 + grow], [G.zeroX0 + ZERO_TIP - grow * .4, G.z1 + grow], [G.zeroX0 - grow, zm], [G.zeroX0 + ZERO_TIP - grow * .4, G.z0 - grow]];
}
function zeroPath(P, grow = 0) {
  const p = new Path2D();
  zeroPts(grow).forEach(([x, z], i) => { const [a, b] = P(x, z); i ? p.lineTo(a, b) : p.moveTo(a, b); });
  p.closePath(); return p;
}
function roundPath(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
