// BACCARAT — Punto Banco for high rollers. 8 decks, Banker 0.95:1, Tie 8:1,
// Player/Banker Pairs 11:1, a Bead Plate + Big Road scoreboard, and the squeeze:
// the camera leans in and the card is peeled up at the corner until the index shows.
import * as THREE from '../vendor/three.min.mjs';
import { Game } from './base.mjs';
import { buildTable, cardShoe, discardTray, arcText, ring, rrect, text, hitSpot, glowRing, brass, PRINT, PRINT_SOFT } from '../core/tables.mjs';
import { dealCard, flipCard, ChipPile, ChipFactory, CARD, CHIP } from '../core/props.mjs';
import { Shoe, rand } from '../core/rng.mjs';
import * as R from '../rules/baccarat.mjs';
import { fmt, floatText } from '../core/hud.mjs';
import { FONT_DISPLAY, FONT_TEXT, rankLabel } from '../core/textures.mjs';
import { BendCards } from './baccarat-card.mjs';
import { Roadmap, CSS } from './baccarat-road.mjs';

const ZF = -.6, TABLE = { type: 'bj', a: 1.1, b: .82, zf: ZF };
const RAD = Math.PI / 180;
// betting bands: annular sectors centred on (0, ZF), angles in degrees (90 = toward the player)
const A0 = 54, A1 = 126;
const BANDS = {
  tie: { r0: .47, r1: .545, color: 0x4fe08a },
  banker: { r0: .557, r1: .657, color: 0xff6b5e },
  player: { r0: .669, r1: .769, color: 0x6f9bff }
};
const PAIR_R = .6, PAIR_ANG = 40, PAIR_SIZE = .056;
const PAIRS = { pPair: { x: -Math.cos(PAIR_ANG * RAD) * PAIR_R, z: ZF + Math.sin(PAIR_ANG * RAD) * PAIR_R }, bPair: { x: Math.cos(PAIR_ANG * RAD) * PAIR_R, z: ZF + Math.sin(PAIR_ANG * RAD) * PAIR_R } };
const BOX = { P: { x: -.2 }, B: { x: .2 }, z: -.36, w: .3, d: .15 };
const LABEL = { player: 'PLAYER', banker: 'BANKER', tie: 'TIE', pPair: 'PLAYER PAIR', bPair: 'BANKER PAIR' };
const SIDE = { P: 'PLAYER', B: 'BANKER' };
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const VIEW = {
  landscape: { pos: [0, .6, .9], look: [0, .09, -.3], fov: 44, fitWidth: 1.5 },
  portrait: { pos: [0, 1.16, .74], look: [0, 0, -.2], fov: 52, fitWidth: 1.24, maxFov: 78 }
};
// peel keyframes: [peel, depth (m past the fold), theta (rad)]
const PEEL = [[0, 0, 0], [.3, .026, 1.2], [.62, .046, 1.95], [1, .066, 2.45]];
function peelAt(p) {
  p = Math.max(0, Math.min(1, p));
  for (let i = 1; i < PEEL.length; i++) if (p <= PEEL[i][0]) {
    const [a, d0, t0] = PEEL[i - 1], [b, d1, t1] = PEEL[i], f = (p - a) / (b - a);
    return [d0 + (d1 - d0) * f, t0 + (t1 - t0) * f];
  }
  return [PEEL[3][1], PEEL[3][2]];
}

export default class Baccarat extends Game {
  static id = 'baccarat';

  async enter(first) {
    const { stage } = this;
    const st = document.createElement('style'); st.id = 'css-baccarat'; st.textContent = CSS + HELP_CSS;
    document.getElementById('css-baccarat')?.remove(); document.head.append(st); this.styleEl = st;
    document.getElementById('app').classList.add('bac-on');
    this.fast = this.bank.setting('bacFast') === true;
    this.bends = new BendCards(this.cards);
    // card stock: a shade off pure white, and a satin (not glossy) finish — the bright room reflection
    // otherwise lifts the black ink to tan when the camera leans in
    this.bends.mat.color.setScalar(.86); this.bends.mat.envMapIntensity = .12; this.bends.mat.roughness = .5;
    // White stock under the key light is ~2x the bloom threshold, and the glow swamps the ink. On the bloom
    // tier, cap the cards' HDR brightness (hue-preserving) just under this table's threshold: crisp faces, no halo.
    if (stage.bloom) {
      this.bloomT0 = stage.bloom.threshold; stage.bloom.threshold = Math.max(this.bloomT0, 1.3);
      this.bends.mat.onBeforeCompile = sh => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
          { float pk = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b); if (pk > 1.22) gl_FragColor.rgb *= 1.22 / pk; }`);
      };
      this.bends.mat.customProgramCacheKey = () => 'bac-card-cap';
    }
    this.shoe = new Shoe(8, .8); this.shoeNo = 1;
    this.backdrop.setRoom('dealer');
    this.backdrop.place({ z: ZF - .03, railY: .057, width: 1.95 });
    this.table = buildTable(stage, { outline: TABLE, felt: { color: '#3b0610', size: [stage.tier === 'high' ? 2560 : 2048], paint: (c, P, S) => this.paintFelt(c, P, S) } });
    this.tray = instancedTray(this.root, this.chips, { x: 0, z: ZF + .075, w: .62 });
    this.printMedallion();
    // deepen the crimson: less pink sheen at grazing angles, a touch of red in the base
    const fm = this.table.felt.material;
    if (fm.sheenColor) { fm.sheen = .12; fm.sheenColor.set('#5c0a17'); fm.specularIntensity = .3; fm.envMapIntensity = .06; }
    fm.color?.setRGB(1, .8, .83);
    this.shoeProp = cardShoe(stage, this.cards, { x: .7, z: ZF + .17, rotY: -.62 });
    this.discard = discardTray(stage, { x: -.7, z: ZF + .17, rotY: .62 });
    this.dealerPoint = new THREE.Vector3(0, .03, ZF + .08);

    // betting spots
    this.bets = { player: 0, banker: 0, tie: 0, pPair: 0, bPair: 0 };
    this.spots = {};
    for (const k of ['tie', 'banker', 'player']) {
      const b = BANDS[k], rm = (b.r0 + b.r1) / 2, pos = new THREE.Vector3(0, 0, ZF + rm);
      this.spots[k] = { key: k, pos, pile: new ChipPile(stage, this.chips, this.root, pos), hit: sectorHit(this.root, b, k), glow: bandGlow(this.root, b), o: 0, tagAt: new THREE.Vector3(0, .012, ZF + rm) };
    }
    for (const k of ['pPair', 'bPair']) {
      const p = PAIRS[k], pos = new THREE.Vector3(p.x, 0, p.z);
      const glow = glowRing(this.root, p.x, p.z, PAIR_SIZE * .95, 0xf3d58a);
      this.spots[k] = { key: k, pos, pile: new ChipPile(stage, this.chips, this.root, pos), hit: hitSpot(this.root, p.x, p.z, PAIR_SIZE, { bet: k }), glow, o: 0, tagAt: new THREE.Vector3(p.x, .012, p.z) };
    }
    this.hitMeshes = Object.values(this.spots).map(s => s.hit);
    this.lastBets = null;
    this.hand = null;

    // scoreboard
    this.road = new Roadmap(document.getElementById('app'), { open: this.bank.setting('bacRoad') !== false && !(innerHeight < 500 && innerWidth > innerHeight), onToggle: on => this.bank.setting('bacRoad', on) });
    this.layoutRoad();
    const onResize = () => this.layoutRoad();
    addEventListener('resize', onResize); this.offs.push(() => removeEventListener('resize', onResize));
    // you walk up to a table mid-shoe: the hands already dealt from this shoe are on the board
    const hist = [];
    this.burn();
    for (let i = 0, n = 12 + rand(24); i < n; i++) hist.push(this.entry(R.playCoup(() => this.shoe.draw())));
    this.road.set(hist, this.shoeNo);

    this.onTap(e => this.tap(e));
    this.onHover(() => this.phase === 'bet' ? this.hitMeshes : [], h => { this.hover = h?.object.userData.bet || null; });
    this.dragWire();
    this.key({ ' ': () => this.press('deal'), enter: () => this.press('deal'), c: () => this.press('clear'), r: () => this.press('rebet'), x: () => this.press('x2'), f: () => this.toggleFast(), s: () => this.toggleFast(), b: () => this.road.toggle() });
    this.hud.rack(this.rackFor(R.LIMITS.min), () => {});
    this.offFrame = stage.onFrame(dt => this.frame(dt));
    await stage.applyView(VIEW, first ? 0 : 1.2);
    if (!this.alive) return;
    this.betting();
    this.layoutRoad();
    this.say('Welcome to the salon. Player, Banker or Tie?');
  }

  // ── the printed felt ──
  paintFelt(c, P, S) {
    const [cx, cy] = P(0, ZF);
    this.feltP = P; this.feltS = S;
    // pinstripe following the rail
    c.save(); c.strokeStyle = PRINT_SOFT;
    for (const [d, lw] of [[.045, .0022], [.056, .0011]]) {
      c.lineWidth = S(lw); c.beginPath();
      for (let i = 0; i <= 96; i++) { const t = i / 96 * Math.PI, [x, y] = P((TABLE.a - d) * Math.cos(t), ZF + (TABLE.b - d) * Math.sin(t)); i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    c.restore();
    // a faint sunburst from the dealer: the felt's woven "damask"
    c.save(); c.globalAlpha = .05; c.strokeStyle = '#f0d9a0'; c.lineWidth = S(.002);
    for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI; c.beginPath(); c.moveTo(cx + Math.cos(a) * S(.47), cy + Math.sin(a) * S(.47)); c.lineTo(cx + Math.cos(a) * S(.8), cy + Math.sin(a) * S(.8)); c.stroke(); }
    c.restore();

    // betting bands
    const accent = { tie: '#27b35f', banker: '#e8343f', player: '#3d7bff' };
    for (const k of ['tie', 'banker', 'player']) {
      const b = BANDS[k], r0 = S(b.r0), r1 = S(b.r1), a0 = A0 * RAD, a1 = A1 * RAD, rm = (r0 + r1) / 2;
      c.save();
      c.beginPath(); c.arc(cx, cy, r1, a0, a1); c.arc(cx, cy, r0, a1, a0, true); c.closePath();
      c.fillStyle = 'rgba(0,0,0,.16)'; c.fill();
      c.lineJoin = 'round'; c.lineWidth = S(.0032); c.strokeStyle = PRINT; c.stroke();
      // inner accent line in the bet's colour
      c.beginPath(); c.arc(cx, cy, r1 - S(.009), a0 + .012, a1 - .012); c.arc(cx, cy, r0 + S(.009), a1 - .012, a0 + .012, true); c.closePath();
      c.globalAlpha = .55; c.lineWidth = S(.0014); c.strokeStyle = accent[k]; c.stroke();
      c.restore();
      if (k === 'tie') {
        arcText(c, 'TIE PAYS 8 TO 1', cx, cy, rm, Math.PI / 2, { font: `700 ${S(.021)}px ${FONT_DISPLAY}`, color: PRINT, spacing: S(.006), inward: true });
        this.gems(c, cx, cy, rm, `700 ${S(.021)}px ${FONT_DISPLAY}`, 'TIE PAYS 8 TO 1', S(.006), accent.tie, S);
      } else {
        const word = LABEL[k], wf = `italic 700 ${S(.034)}px ${FONT_DISPLAY}`;
        arcText(c, word, cx, cy, rm - S(.008), Math.PI / 2, { font: wf, color: PRINT, spacing: S(.012), inward: true });
        this.gems(c, cx, cy, rm - S(.008), wf, word, S(.012), accent[k], S);
        const sub = k === 'banker' ? 'PAYS 0.95 TO 1  ·  5% COMMISSION' : `PAYS 1 TO 1  ·  LIMITS ${fmt(R.LIMITS.min)} – ${fmt(R.LIMITS.player)}`;
        arcText(c, sub, cx, cy, rm + S(.03), Math.PI / 2, { font: `800 ${S(.0112)}px ${FONT_TEXT}`, color: PRINT_SOFT, spacing: S(.0045), inward: true });
      }
    }
    // pair circles
    for (const k of ['pPair', 'bPair']) {
      const p = PAIRS[k], [x, y] = P(p.x, p.z);
      ring(c, x, y, S(PAIR_SIZE), { lw: S(.0032), color: PRINT, fill: 'rgba(0,0,0,.16)' });
      ring(c, x, y, S(PAIR_SIZE - .008), { lw: S(.0012), color: k === 'pPair' ? 'rgba(61,123,255,.6)' : 'rgba(232,52,63,.7)' });
      text(c, k === 'pPair' ? 'PLAYER' : 'BANKER', x, y - S(.017), { font: `800 ${S(.0105)}px ${FONT_TEXT}`, color: PRINT_SOFT, spacing: S(.003) });
      text(c, 'PAIR', x, y + S(.002), { font: `italic 700 ${S(.022)}px ${FONT_DISPLAY}`, color: PRINT });
      text(c, '11 TO 1', x, y + S(.024), { font: `800 ${S(.0105)}px ${FONT_TEXT}`, color: PRINT_SOFT, spacing: S(.003) });
    }
    // the dealer's card boxes
    for (const side of ['P', 'B']) {
      const bx = BOX[side].x, [x, y] = P(bx - BOX.w / 2, BOX.z - BOX.d / 2);
      rrect(c, x, y, S(BOX.w), S(BOX.d), S(.014), { lw: S(.0028), color: PRINT, fill: 'rgba(0,0,0,.2)' });
      rrect(c, x + S(.006), y + S(.006), S(BOX.w - .012), S(BOX.d - .012), S(.01), { lw: S(.001), color: PRINT_SOFT });
      const [lx, ly] = P(bx, BOX.z);
      text(c, SIDE[side], lx, ly + S(.004), { font: `italic 700 ${S(.034)}px ${FONT_DISPLAY}`, color: 'rgba(236,214,160,.34)', spacing: S(.006) });
      c.save(); c.fillStyle = side === 'P' ? '#3d7bff' : '#e8343f'; c.strokeStyle = PRINT; c.lineWidth = S(.001);
      for (const sx of [-1, 1]) { const gx = lx + sx * S(.118), gy = ly; c.beginPath(); c.moveTo(gx, gy - S(.006)); c.lineTo(gx + S(.006), gy); c.lineTo(gx, gy + S(.006)); c.lineTo(gx - S(.006), gy); c.closePath(); c.fill(); c.stroke(); }
      c.restore();
    }
    // house marks
    arcText(c, 'BLUFOX', cx, cy, S(.405), Math.PI / 2, { font: `600 ${S(.034)}px ${FONT_DISPLAY}`, color: PRINT, spacing: S(.02), inward: true });
    arcText(c, 'CASINO  &  LOUNGE', cx, cy, S(.44), Math.PI / 2, { font: `700 ${S(.0105)}px ${FONT_TEXT}`, color: PRINT_SOFT, spacing: S(.006), inward: true });
  }
  gems(c, cx, cy, r, font, word, spacing, color, S) {
    c.save(); c.font = font;
    const w = [...word].reduce((a, ch) => a + c.measureText(ch).width + spacing, 0);
    const half = (w / 2 + S(.022)) / r;
    for (const sg of [-1, 1]) {
      const a = Math.PI / 2 + sg * half, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, s = S(.0065);
      c.translate(x, y); c.rotate(a);
      c.beginPath(); c.moveTo(-s, 0); c.lineTo(0, -s * .8); c.lineTo(s, 0); c.lineTo(0, s * .8); c.closePath();
      c.fillStyle = color; c.fill(); c.lineWidth = S(.001); c.strokeStyle = PRINT; c.stroke();
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    c.restore();
  }
  // the gold fox medallion between the card boxes (async: prints once the image arrives)
  printMedallion() {
    const img = new Image();
    img.onload = () => {
      if (!this.alive || !this.feltP) return;
      const c = this.table.feltCanvas.getContext('2d'), [x, y] = this.feltP(0, BOX.z), s = this.feltS(.082);
      c.save(); c.globalAlpha = .92; c.drawImage(img, 0, 0, 256, 256, x - s / 2, y - s / 2, s, s); c.restore();
      this.table.feltTex.needsUpdate = true;
    };
    img.src = new URL('../../assets/img/symbols.webp', import.meta.url).href;
  }

  // ── betting ──
  betting() {
    this.phase = 'bet';
    this.hud.rackEnabled(true);
    this.winGlow = null;
    this.renderBetUI();
  }
  total(b = this.bets) { return R.BETS.reduce((a, k) => a + (b[k] || 0), 0); }
  renderBetUI() {
    const total = this.total();
    this.hud.bet('TOTAL BET', total, `Table ${fmt(R.LIMITS.min)} – ${fmt(R.LIMITS.player)}`);
    this.hud.affordable(this.balance);
    const lastTotal = this.lastBets ? this.total(this.lastBets) : 0;
    this.hud.actions([
      { id: 'clear', label: 'CLEAR', onClick: () => this.clearBets(), disabled: !total, key: 'C' },
      this.lastBets && !total
        ? { id: 'rebet', label: 'REBET', sub: fmt(lastTotal), onClick: () => this.rebet(), disabled: lastTotal > this.balance, key: 'R' }
        : { id: 'x2', label: 'DOUBLE', sub: 'ALL BETS', onClick: () => this.doubleBets(), disabled: !total || total > this.balance, key: 'X' },
      this.fastBtn(),
      { id: 'deal', label: 'DEAL', kind: 'primary', hot: total > 0, onClick: () => this.deal(), disabled: !total, key: '␣' }
    ]);
    this.betTags();
  }
  fastBtn() { return { id: 'fast', label: 'SQUEEZE', sub: this.fast ? 'OFF · FAST' : 'ON', onClick: () => this.toggleFast(), key: 'S', hot: false }; }
  toggleFast() {
    this.fast = !this.fast; this.bank.setting('bacFast', this.fast);
    this.hud.toast(this.fast ? 'Fast deal — cards are turned straight over.' : 'The squeeze is on. Drag a card up to peel it yourself.', 'gold');
    const btn = document.querySelector('#actions .act[data-id="fast"] small'); if (btn) btn.textContent = this.fast ? 'OFF · FAST' : 'ON';
    if (this.fast && this.sq) this.skip();
    const hb = document.getElementById('bac-fast-toggle'); if (hb) hb.textContent = this.fast ? 'TURN SQUEEZE ON' : 'TURN SQUEEZE OFF';
  }
  betTags() {
    for (const k of R.BETS) {
      const s = this.spots[k], v = this.bets[k];
      if (v) this.hud.anchor('bet-' + k, this.tagPos(k, v), `<span class="bac-bet">${fmt(v)}</span>`); else this.hud.unanchor('bet-' + k);
    }
  }
  tagPos(k, v) {
    const n = Math.min(14, v ? breakdownCount(v) : 0);          // ChipPile stacks up to 14 high
    return this.spots[k].tagAt.clone().add(new THREE.Vector3(0, n * CHIP.h + .022, 0));
  }
  tap(e) {
    if (this.sq) { if (!this.sq.dragged) this.skip(); return; }
    if (this.phase !== 'bet') return;
    const h = this.stage.pick(e.clientX, e.clientY, this.hitMeshes, false)[0];
    if (!h) return;
    this.place(h.object.userData.bet, this.hud.selected);
  }
  place(k, v) {
    const max = R.LIMITS[k];
    if (this.bets[k] + v > max) { this.hud.toast(`Table max on ${LABEL[k]} is ${fmt(max)}.`); return; }
    if (!this.bank.stake(v)) { this.hud.toast('Not enough chips for that one.'); return; }
    this.bets[k] += v;
    this.sound.chips(1);
    this.flyChip(k, v);
    this.renderBetUI();
  }
  async flyChip(k, v) {
    const s = this.spots[k], chip = this.chips.chip(v), from = this.chipOrigin(), gen = this.betGen;
    this.stage.scene.add(chip);
    const to = s.pile.worldTop();
    await this.tw.run(.34, (e, p) => { chip.position.lerpVectors(from, to, e); chip.position.y += Math.sin(p * Math.PI) * .06; chip.rotation.x = (1 - e) * 1.2; }, { ease: 'outCubic' });
    this.stage.scene.remove(chip);
    if (!this.alive || gen !== this.betGen || this.phase !== 'bet') return;
    s.pile.set(this.bets[k]);
  }
  chipOrigin() { const c = this.stage.camera.position; return new THREE.Vector3(c.x * .6, .05, Math.min(.5, c.z * .7)); }
  clearBets() {
    const n = this.total(); if (!n || this.phase !== 'bet') return;
    this.bank.unstake(n); this.betGen = (this.betGen || 0) + 1;
    for (const k of R.BETS) { this.bets[k] = 0; this.spots[k].pile.clear(); }
    this.sound.chips(4); this.renderBetUI();
  }
  rebet() {
    if (this.phase !== 'bet' || !this.lastBets || this.total()) return;
    const need = this.total(this.lastBets); if (!this.bank.stake(need)) { this.hud.toast('Not enough chips to repeat that bet.'); return; }
    for (const k of R.BETS) { this.bets[k] = this.lastBets[k] || 0; this.spots[k].pile.set(this.bets[k]); }
    this.sound.chips(5); this.renderBetUI();
  }
  doubleBets() {
    if (this.phase !== 'bet') return;
    const add = {}; let n = 0;
    for (const k of R.BETS) { add[k] = Math.min(this.bets[k], R.LIMITS[k] - this.bets[k]); n += add[k]; }
    if (!n) { this.hud.toast('Those bets are already at the table max.'); return; }
    if (!this.bank.stake(n)) { this.hud.toast('Not enough chips to double.'); return; }
    for (const k of R.BETS) { this.bets[k] += add[k]; this.spots[k].pile.set(this.bets[k]); }
    this.sound.chips(5); this.renderBetUI();
  }
  press(id) {
    if (id === 'deal' && this.sq) { this.skip(); return; }
    if (id === 'deal') { if (this.phase === 'bet') this.deal(); return; }
    document.querySelector(`#actions .act[data-id="${id}"]:not(:disabled)`)?.click();
  }

  // ── shoe ──
  burn() {
    this.shoe.fresh();
    const first = this.shoe.draw(), n = R.point(first) || 10;
    for (let i = 0; i < n; i++) this.shoe.draw();
    return { first, n };
  }
  async newShoe() {
    this.shoeNo++;
    const { first, n } = this.burn();
    this.road.reset(this.shoeNo);
    this.say(`Fresh shoe — eight decks. The burn card is ${rankLabel(first.r) === 'A' ? 'an ace' : 'a ' + rankLabel(first.r)}: ${n} cards burned.`);
    const o = this.bends.make(first, false); this.root.add(o);
    this.sound.card();
    await dealCard(this.tw, o, this.shoeProp.mouth, new THREE.Vector3(0, CARD.t / 2 + .001, BOX.z + .01), { faceUp: true, dur: .5 });
    await this.wait(1.2);
    await this.tw.run(.5, e => { o.position.lerp(this.discard.point, e * .5 + .02); o.rotation.z = Math.PI * e; }, { ease: 'inOutCubic' });
    this.root.remove(o); this.bends.release(o);
  }
  entry(c) { return { w: c.winner, pp: c.pPair, bp: c.bPair, pt: c.pt, bt: c.bt, nat: c.natural }; }

  // ── the coup ──
  // card slots in a box: two upright cards reading left to right, the third sideways on the outside
  slot(side, i) {
    const bx = BOX[side].x, inner = side === 'P' ? 1 : -1;            // toward the table's centre line
    const xIn = bx + inner * (BOX.w / 2 - .012 - CARD.w / 2);
    const xMid = xIn - inner * (CARD.w + .008);
    const x3 = xMid - inner * (CARD.w / 2 + .01 + CARD.h / 2);
    const xs = side === 'P' ? [xMid, xIn, x3] : [xIn, xMid, x3];
    return { pos: new THREE.Vector3(xs[i], CARD.t / 2 + .0004 * i, BOX.z), rotY: i === 2 ? Math.PI / 2 * (side === 'P' ? -1 : 1) : 0 };
  }
  // cards come off the shoe in dealing order at DEAL time (the coup is decided before anything is animated)
  async give(side, i) {
    const h = this.hand, c = (side === 'P' ? this.coup.player : this.coup.banker)[i], o = this.bends.make(c, false);
    this.root.add(o);
    h[side].push(c); h.objs[side].push(o);
    const { pos, rotY } = this.slot(side, i);
    this.sound.card();
    await dealCard(this.tw, o, this.shoeProp.mouth, pos, { faceUp: false, dur: .4, rotY, lift: .03 });
    return c;
  }
  async deal() {
    if (this.phase !== 'bet' || !this.total()) return;
    this.phase = 'deal'; this.settled = false; this.coup = null;
    this.betGen = (this.betGen || 0) + 1;
    for (const k of R.BETS) this.spots[k].pile.set(this.bets[k]);
    this.lastBets = { ...this.bets };
    this.staked = this.total();
    this.hud.rackEnabled(false);
    this.hud.actions([this.fastBtn()]);
    if (this.shoe.needsShuffle) { await this.newShoe(); if (!this.alive) return; }
    // P, B, P, B, then any third cards — exactly the order they leave the shoe
    this.coup = R.playCoup(() => this.shoe.draw());
    this.result = R.settleAll(this.bets, this.coup);
    this.hand = { P: [], B: [], objs: { P: [], B: [] } };
    this.backdrop.play('deal');
    this.say('No more bets.');
    this.home(1.2); this.mood(1);
    for (let i = 0; i < 2; i++) {
      await this.give('P', i); if (!this.alive) return;
      await this.give('B', i); if (!this.alive) return;
    }
    await this.wait(.25); if (!this.alive) return;
    const b = this.bets, sqP = b.player > 0, sqB = b.banker > 0 || (!b.player && !b.banker);
    await this.revealHand('P', sqP); if (!this.alive) return;
    await this.revealHand('B', sqB); if (!this.alive) return;
    const { P, B } = this.hand, coup = this.coup;
    if (coup.natural) {
      this.sound.chime(3);
      this.say(coup.natP && coup.natB ? `Naturals on both sides.` : `A natural ${NUM[coup.natP ? R.total(P) : R.total(B)]} for the ${coup.natP ? 'Player' : 'Banker'}.`);
      await this.wait(1.3); if (!this.alive) return;
    } else {
      if (coup.player.length === 3) {
        this.say(`Player has ${NUM[R.total(P)]} — Player draws.`);
        await this.wait(.6); if (!this.alive) return;
        await this.give('P', 2); if (!this.alive) return;
        await this.revealCard(this.hand.objs.P[2], !this.fast, 'P');
      } else this.say(`Player stands on ${NUM[R.total(P)]}.`);
      if (!this.alive) return;
      await this.wait(.5); if (!this.alive) return;
      if (coup.banker.length === 3) {
        this.say(`Banker has ${NUM[R.total(B)]} — Banker draws.`);
        await this.wait(.6); if (!this.alive) return;
        await this.give('B', 2); if (!this.alive) return;
        await this.revealCard(this.hand.objs.B[2], !this.fast, 'B');
      } else this.say(`Banker stands on ${NUM[R.total(B)]}.`);
      if (!this.alive) return;
      await this.wait(.4); if (!this.alive) return;
    }
    await this.resolveCoup(coup);
  }

  // reveal the first two cards of a hand
  async revealHand(side, squeeze) {
    const objs = this.hand.objs[side];
    this.say(`${SIDE[side] === 'PLAYER' ? 'The Player' : 'The Banker'}${squeeze && !this.fast ? '’s cards. The squeeze…' : '.'}`);
    if (!squeeze || this.fast) {
      for (const o of objs) { this.sound.card(); await flipCard(this.tw, o, { dur: this.fast ? .28 : .36 }); if (!this.alive) return; this.updateTotals(); }
      await this.wait(this.fast ? .2 : .45);
      return;
    }
    this.skipped = false;
    await this.squeeze(objs[0], side, { short: true });
    if (!this.alive) return;
    // tapping REVEAL on the first card turns the second straight over too
    if (this.skipped) { this.sound.card(); await flipCard(this.tw, objs[1], { dur: .3 }); if (!this.alive) return; this.updateTotals(); await this.wait(.3); }
    else await this.squeeze(objs[1], side, { short: false });
    if (!this.alive) return;
    await this.home(.8);
  }
  async revealCard(o, squeeze, side) {
    if (squeeze && !this.fast) { await this.squeeze(o, side, { short: false, third: true }); if (this.alive) await this.home(.7); return; }
    this.sound.card(); await flipCard(this.tw, o, { dur: .32 }); if (!this.alive) return;
    this.updateTotals(); await this.wait(.35);
  }

  // landscape: during the coup the camera settles over the card boxes (Ace still in frame); phones keep the table view
  revealShot() {
    const d = Math.hypot(.48, .62), need = 2 * Math.atan(.44 / d / this.stage.camera.aspect) * 180 / Math.PI;
    return { pos: [0, .5, .28], look: [0, .02, -.34], fov: Math.min(60, Math.max(38, need)) };
  }
  home(dur = .8) { return this.stage.portrait || !this.hand ? this.stage.back(dur) : this.stage.shot(this.revealShot(), dur); }

  // ── THE SQUEEZE ──
  sqShot(o, third) {
    // lean in over the card from the player's side, steep enough to look under the peeled corner
    const p = o.position;
    if (this.stage.portrait) return { pos: [p.x * .97, .4, p.z + .15], look: [p.x, .004, p.z + .025], fov: third ? 44 : 40 };
    return { pos: [p.x * .9, .335, p.z + .215], look: [p.x * .97, .004, p.z - .002], fov: third ? 38 : 35 };
  }
  // the room goes quiet: level 1 while a coup is dealt, level 2 for the squeeze. The lounge dims and bloom /
  // exposure ease off so white card stock reads crisply instead of glowing.
  mood(level) {
    level = level === true ? 2 : level === false ? 0 : level;
    const st = this.stage, u = this.backdrop.uniforms?.dim;
    if (!this.moodBase) this.moodBase = { exp: st.renderer.toneMappingExposure, bloom: st.bloom?.strength ?? 0 };
    const b = this.moodBase, from = { d: u?.value ?? 1, e: st.renderer.toneMappingExposure, s: st.bloom?.strength ?? 0 };
    const to = [{ d: 1, e: b.exp, s: b.bloom }, { d: .66, e: b.exp * .95, s: b.bloom * .45 }, { d: .42, e: b.exp * .9, s: b.bloom * .25 }][level];
    this.moodLevel = level;
    document.getElementById('app').classList.toggle('bac-sq', level === 2);
    this.road?.el.classList.toggle('sqhide', level === 2 && this.stage.portrait);      // phones: give the card the whole screen
    this.tw.kill('bac-mood');
    return this.tw.run(.6, e => {
      if (u) u.value = from.d + (to.d - from.d) * e;
      st.renderer.toneMappingExposure = from.e + (to.e - from.e) * e;
      if (st.bloom) st.bloom.strength = from.s + (to.s - from.s) * e;
    }, { ease: 'inOutSine', tag: 'bac-mood' });
  }
  async squeeze(o, side, { short = false, third = false } = {}) {
    if (!this.alive) return;
    this.mood(2);
    await this.stage.shot(this.sqShot(o, third), .75);
    if (!this.alive) return;
    o.bend.aim(this.stage.camera.position, third ? .5 : .58);
    const sq = this.sq = { o, side, peel: 0, vel: 0, target: 0, drag: null, finish: false, dragged: false, t: 0 };
    this.hud.actions([{ id: 'reveal', label: 'REVEAL', sub: 'TURN IT OVER', kind: 'primary', onClick: () => this.skip(), key: '␣' }, this.fastBtn()]);
    this.hud.anchor('sqhint', new THREE.Vector3(o.position.x, .01, o.position.z - (third ? .06 : .075)), `<span class="bac-hint">DRAG UP TO SQUEEZE · TAP TO TURN</span>`);
    // slow drift in while the corner comes up
    const c0 = this.stage.camera.position.clone(), look = this.stage.look.clone();
    this.tw.run(short ? 1.6 : 3.4, e => { if (this.sq !== sq) return; this.stage.camera.position.lerpVectors(c0, c0.clone().lerp(look, .12), e); this.stage.camera.lookAt(look); }, { ease: 'inOutSine', tag: 'camera' });
    const steps = short ? [[.34, .9], [.34, .4], [.66, .75], [.66, .3]] : [[.3, .95], [.3, .45], [.64, 1.0], [.64, .6], [.92, .6], [.92, .35]];
    for (const [tg, dur] of steps) {
      if (!sq.drag) sq.target = tg;
      if (tg > sq.peel + .05) { this.sound.noise({ d: .5 + dur * .5, vol: .045, f: 2600, q: .6 }); if (tg > .5) this.sound.tone(62, { d: .35, vol: .16, verb: .08 }); }
      await this.waitFor(dur, () => sq.finish || !this.alive);
      if (sq.finish || !this.alive) break;
    }
    // wait out an active drag unless it finished the job
    while (this.alive && sq.drag && !sq.finish) await this.wait(.05);
    if (!this.alive) return;
    this.hud.unanchor('sqhint');
    await this.turnOver(o, sq);
    if (!this.alive) return;
    if (this.speed0 != null) { this.tw.speed = this.speed0; this.speed0 = null; }
    this.mood(1);
    this.hud.actions([this.fastBtn()]);
    this.updateTotals();
    const card = o.userData.card, v = R.point(card);
    // a little sting on the good ones
    if (v >= 8) this.sound.chime(1); else if (v === 0) this.sound.tone(180, { type: 'triangle', d: .3, vol: .05 });
    await this.wait(short ? .35 : .6);
  }
  async turnOver(o, sq) {
    const [d0, t0] = peelAt(sq.peel), y0 = o.position.y, z0 = o.rotation.z;
    this.sq = null;
    this.sound.card();
    await this.tw.run(.52, (e, p) => {
      o.rotation.z = z0 * (1 - e);
      o.position.y = y0 + Math.sin(p * Math.PI) * .04;
      const k = Math.max(0, 1 - p * 1.7);
      o.bend.set(d0 * k, t0 * k);
    }, { ease: 'inOutCubic' });
    o.bend.flat(); o.rotation.z = 0; o.position.y = y0; o.userData.faceUp = true;
  }
  // wait `dur` seconds of game time, or until cond() — measured on the real frame clock
  waitFor(dur, cond) {
    return new Promise(res => {
      let t = 0;
      const done = () => { off(); res(); };
      const off = this.stage.onFrame(dt => {
        t += dt * this.tw.speed;
        if (!this.alive || cond() || t >= dur) done();
      });
      this.offs.push(done);
    });
  }
  skip() {
    if (!this.sq) return;
    this.sq.finish = true; this.sq.drag = null; this.skipped = true;
    if (this.speed0 == null) { this.speed0 = this.tw.speed; this.tw.speed *= 2.2; }
  }
  dragWire() {
    const c = this.stage.canvas;
    const down = e => { if (!this.sq) return; this.sq.drag = { y: e.clientY, p: this.sq.peel }; this.sq.dragged = false; };
    const move = e => {
      const sq = this.sq; if (!sq?.drag) return;
      const dy = sq.drag.y - e.clientY; if (Math.abs(dy) > 10) sq.dragged = true;
      sq.target = sq.peel = Math.max(0, Math.min(1, sq.drag.p + dy / (this.stage.h * .32)));
      sq.vel = 0;
      if (sq.peel >= .97) { sq.finish = true; sq.drag = null; }
    };
    const up = () => { const sq = this.sq; if (!sq?.drag) return; sq.drag = null; if (sq.peel > .8) sq.finish = true; };
    c.addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    this.offs.push(() => { c.removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); });
  }

  // ── labels ──
  updateTotals() {
    const h = this.hand; if (!h) return;
    for (const side of ['P', 'B']) {
      const shown = h[side].filter((c, i) => h.objs[side][i].userData.faceUp);
      if (!shown.length) { this.hud.unanchor('tot' + side); continue; }
      const cls = h.result ? (h.result === side ? ' win' : h.result === 'T' ? ' tie' : ' lose') : '';
      const two = shown.length >= 2 && h.objs[side][1]?.userData.faceUp && h.objs[side][0]?.userData.faceUp;
      const nat = two && R.isNatural(h[side].slice(0, 2)), pair = two && R.isPair(h[side]);
      const badges = (nat ? `<i class="bdg nat">NATURAL</i>` : '') + (pair ? `<i class="bdg pair">PAIR</i>` : '');
      this.hud.anchor('tot' + side, new THREE.Vector3(BOX[side].x, .012, BOX.z + BOX.d / 2 + .034), `<div class="bac-score ${side.toLowerCase()}${cls}">${badges}${SIDE[side]}<span class="n">${R.total(shown)}</span></div>`);
    }
  }

  // ── result & payouts ──
  async resolveCoup(coup) {
    this.phase = 'settle';
    const h = this.hand; h.result = coup.winner;
    this.updateTotals();
    const res = this.result || R.settleAll(this.bets, coup);
    const W = coup.winner, hi = Math.max(coup.pt, coup.bt), lo = Math.min(coup.pt, coup.bt);
    this.winGlow = { player: W === 'P', banker: W === 'B', tie: W === 'T', pPair: coup.pPair, bPair: coup.bPair };
    this.road.push(this.entry(coup));
    const title = coup.winNatural ? `Natural ${coup.winNatural}!` : W === 'T' ? `Tie ${hi} to ${hi}` : `${W === 'P' ? 'Player' : 'Banker'} wins ${hi} to ${lo}`;
    const subs = [];
    if (coup.winNatural) subs.push(`${W === 'P' ? 'PLAYER' : 'BANKER'} WINS ${hi} TO ${lo}`);
    if (coup.pPair) subs.push('PLAYER PAIR'); if (coup.bPair) subs.push('BANKER PAIR');
    if (res.net < 0) subs.push(`YOU LOSE ${fmt(-res.net)}`); else if (res.net === 0) subs.push('YOUR BETS PUSH');
    if (res.commission) subs.push(`${fmt(res.commission)} COMMISSION`);
    this.say(W === 'T' ? `A tie — ${NUM[hi]} apiece. Player and Banker bets push.` : `${W === 'P' ? 'Player' : 'Banker'} wins, ${NUM[hi]} to ${NUM[lo]}.`);
    const big = res.net > 0 && (res.net >= 2000 || res.net >= this.staked * 5);
    if (res.net > 0) { this.sound.play('win', { vol: .6 }); if (big) this.sound.fanfare(); this.backdrop.play(big ? 'big' : 'win'); }
    else if (res.net < 0) { this.sound.lose(); if (res.returned === 0) this.backdrop.play('lose'); }
    else this.sound.play('push', { vol: .6 });
    await this.hud.banner({ title: title.toUpperCase().replace('NATURAL', 'Natural'), amount: res.net > 0 ? res.net : null, kind: res.net > 0 ? (big || coup.winNatural ? 'big' : 'win') : res.net === 0 ? 'push' : 'lose', sub: subs.join('  ·  '), hold: 1.7 });
    if (!this.alive) return;
    this.stage.back(.9); this.mood(0);
    await this.wait(.35); if (!this.alive) return;
    // move the chips
    const moves = Object.entries(res.lines).map(async ([k, L]) => {
      const s = this.spots[k];
      const tag = L.result === 'win' ? `<span class="bac-res win">+${fmt(L.win)}${L.commission ? `<em>−${fmt(L.commission)} COMM</em>` : ''}</span>` : L.result === 'push' ? `<span class="bac-res push">PUSH</span>` : `<span class="bac-res lose">LOSE</span>`;
      this.hud.anchor('bet-' + k, this.tagPos(k, L.stake), tag);
      if (L.result === 'win') { floatText(this.hud, s.pos.clone().add(new THREE.Vector3(0, .06, 0)), '+' + fmt(L.win)); await this.payPile(s.pile, L.win); }
      else if (L.result === 'push') { await this.wait(.5); await s.pile.sweepTo(this.chipOrigin(), this.tw, { dur: .5 }); }
      else { await this.wait(.25); await s.pile.sweepTo(this.dealerPoint, this.tw, { dur: .5 }); }
    });
    if (res.net > 0) this.sound.chips(6); else this.sound.chips(3);
    await Promise.all(moves);
    this.settleNow();
    await this.wait(.6);
    if (!this.alive) return;
    await this.clearTable();
    if (!this.alive) return;
    for (const k of R.BETS) this.bets[k] = 0;
    this.betting();
    this.say(this.balance < R.LIMITS.min ? 'You’re out of chips — Ace’s marker is waiting in the lobby.' : 'Place your bets.');
  }
  // the one place money moves for a hand (also used when the player walks away mid-hand)
  settleNow() {
    if (this.settled || !this.coup || !this.result) return;
    const res = this.result, coup = this.coup;
    this.bank.settle(res.staked, res.returned, 'baccarat');
    this.settled = true;
    this.emit('hand', { net: res.net, bankerWin: res.lines.banker?.result === 'win', natural9: coup.natural9 });
  }
  async payPile(pile, win) {
    const pay = new ChipPile(this.stage, this.chips, this.root, pile.group.position.clone().add(new THREE.Vector3(.062, 0, -.008)));
    pay.set(win);
    const target = pay.group.position.clone(); pay.group.position.copy(this.dealerPoint);
    await this.tw.to(pay.group.position, { x: target.x, y: target.y, z: target.z }, { dur: .55, ease: 'outCubic' });
    await this.wait(.45);
    const home = this.chipOrigin();
    await Promise.all([pile.sweepTo(home, this.tw, { dur: .5 }), pay.sweepTo(home, this.tw, { dur: .55 })]);
    pay.dispose();
  }
  async clearTable() {
    const h = this.hand; if (!h) return;
    const objs = [...h.objs.P, ...h.objs.B];
    this.hud.clearAnchors();
    this.winGlow = null;
    await Promise.all(objs.map((o, i) => this.tw.run(.45, (e, p) => {
      o.position.lerp(this.discard.point, e * .5 + .02); o.position.y += Math.sin(p * Math.PI) * .004;
      if (o.userData.faceUp) o.rotation.z = Math.PI * e;
    }, { delay: i * .04, ease: 'inOutCubic' })));
    for (const o of objs) { this.root.remove(o); this.bends.release(o); }
    this.hand = null;
  }

  // ── per frame ──
  frame(dt) {
    if (!this.alive) return;
    const t = performance.now() / 1000, any = this.total() > 0;
    for (const k of R.BETS) {
      const s = this.spots[k];
      let target = 0;
      if (this.phase === 'bet') {
        if (this.hover === k) target = .95;
        else if (!any) target = (k === 'player' || k === 'banker') ? .3 + .18 * Math.sin(t * 2.2 + (k === 'player' ? 0 : 1.7)) : .1 + .08 * Math.sin(t * 2.2 + 3.1);
        else target = this.bets[k] ? .4 : 0;
      } else if (this.winGlow?.[k]) target = .75 + .25 * Math.sin(t * 5.5);
      s.o += (target - s.o) * Math.min(1, dt * 7);
      const m = s.glow.material; if (m.uniforms) m.uniforms.opacity.value = s.o; else m.opacity = s.o;
    }
    const sq = this.sq;
    if (sq) {
      const d = dt * this.tw.speed;
      sq.t += d;
      if (!sq.drag) {
        // critically damped spring toward the scripted peel: slow, deliberate, no overshoot (sub-stepped: stable at any frame rate)
        const k = 3.2, n = Math.max(1, Math.ceil(d / .012)), h = d / n;
        for (let i = 0; i < n; i++) { sq.vel += (k * k * (sq.target - sq.peel) - 2 * k * sq.vel) * h; sq.peel += sq.vel * h; }
      }
      const [depth, theta] = peelAt(sq.peel);
      // a faint tremble while it's held up, like fingers holding tension
      const tremble = sq.peel > .1 ? Math.sin(sq.t * 23) * .018 + Math.sin(sq.t * 37) * .01 : 0;
      sq.o.bend.set(depth, theta + tremble);
    }
  }

  layoutRoad() {
    if (!this.road) return;
    const portrait = this.stage.portrait && innerWidth < 900;
    const con = document.getElementById('console');
    this.road.layout({ portrait, bottom: (con?.offsetHeight || 130) + 8, compact: !portrait && innerWidth < 1450 });
  }

  help() {
    const T = R.TABLEAU;
    const head = `<tr><th>BANKER</th>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => `<th>${v}</th>`).join('')}<th>—</th></tr>`;
    const rows = T.map((row, bt) => `<tr><td>${bt}</td>${[...row.replace(' ', '')].map(ch => `<td class="${ch === 'D' ? 'd' : 's'}">${ch}</td>`).join('')}</tr>`).join('');
    return `<p class="eyebrow">TABLE RULES · PUNTO BANCO</p><h2>Baccarat <em>the squeeze</em></h2>
    <p>Bet on the hand you think finishes closer to <b>9</b> — <b>Player</b> or <b>Banker</b> — or on a <b>Tie</b>. Nobody makes decisions: the cards are drawn by fixed rules.</p>
    <ul><li>Eight decks, reshuffled at the cut card. The first card of each shoe is turned over and that many cards are burned.</li>
    <li>Tens and picture cards count 0, aces 1, everything else its face value. Only the last digit counts: 7 + 8 = 15 is <b>5</b>.</li>
    <li>Two cards each. An 8 or 9 is a <b>natural</b> — both hands stand.</li>
    <li>Otherwise the Player draws on 0–5 and stands on 6–7. The Banker then follows the tableau below.</li></ul>
    <h3>PAYOUTS</h3>
    <table class="paytable"><tr><td>Player</td><td class="r">1 to 1</td></tr><tr><td>Banker</td><td class="r">0.95 to 1 (5% commission)</td></tr><tr><td>Tie</td><td class="r">8 to 1 · Player &amp; Banker bets push</td></tr><tr><td>Player Pair / Banker Pair</td><td class="r">11 to 1</td></tr></table>
    <p class="muted" style="margin-top:8px">Commission is taken the moment a Banker bet wins: you are paid 95% of the bet, rounded to the nearest whole chip (exact halves go to the house) — 100 pays 95, 25 pays 24, 50 pays 47. A pair bet wins when that hand’s first two cards are the same rank (K-K yes, K-Q no).</p>
    <h3>BANKER’S THIRD CARD</h3>
    <p class="muted">Columns: the Player’s third card (— = the Player stood). D = Banker draws, S = Banker stands. Banker always stands on 7.</p>
    <div class="bac-tabwrap"><table class="bac-tab">${head}${rows}</table></div>
    <h3>LIMITS</h3><p>Player / Banker ${fmt(R.LIMITS.min)} – ${fmt(R.LIMITS.player)} · Tie &amp; Pairs up to ${fmt(R.LIMITS.tie)}.</p>
    <h3>THE SQUEEZE</h3><p>The hand you back is squeezed — the camera leans in and the card peels up at the corner until the index shows. Drag up on the card to peel it yourself, or tap to turn it straight over. <button class="btn" id="bac-fast-toggle" style="height:34px;margin-left:6px">${this.fast ? 'TURN SQUEEZE ON' : 'TURN SQUEEZE OFF'}</button></p>
    <h3>SCOREBOARD</h3><p class="muted">Bead Plate: every hand in order, down the columns. Big Road: a new column each time the winner changes; green slashes are ties; a red dot is a Banker Pair, blue a Player Pair.</p>
    <h3>KEYS</h3><p class="muted">Space deal / reveal · C clear · R rebet · X double · S squeeze on/off · B scoreboard</p>
    <p class="muted" style="margin-top:10px">House edge: Banker 1.06% · Player 1.24% · Tie 14.4% · Pairs 10.4%.</p>`;
  }

  dispose() {
    this.offFrame?.();
    if (this.speed0 != null) this.tw.speed = this.speed0;
    // walking away: a hand already dealt is settled as dealt; bets that never saw a card go back to the rack
    if (this.phase === 'bet') { if (this.total()) this.bank.unstake(this.total()); }
    else if (!this.settled) { if (this.coup) this.settleNow(); else if (this.staked) this.bank.unstake(this.staked); }
    this.road?.destroy();
    this.styleEl?.remove();
    document.getElementById('app').classList.remove('bac-sq', 'bac-on');
    if (this.backdrop.uniforms?.dim) this.backdrop.uniforms.dim.value = 1;
    if (this.moodBase) { this.stage.renderer.toneMappingExposure = this.moodBase.exp; if (this.stage.bloom) this.stage.bloom.strength = this.moodBase.bloom; }
    if (this.stage.bloom && this.bloomT0 != null) this.stage.bloom.threshold = this.bloomT0;
    this.bends?.dispose();
    this.tray?.dispose();
  }
}

// ── helpers ──
// The dealer's float (same look as tables.mjs chipTray: chips standing edge-on in columns), but one
// InstancedMesh per denomination: ~21 draw calls instead of 264.
function instancedTray(parent, chips, { x = 0, z = -.5, w = .62 }) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w, .012, .11), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: .4 }));
  tray.position.y = .006; tray.receiveShadow = true; tray.userData.ownGeo = tray.userData.ownMat = true; g.add(tray);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + .01, .016, .006), brass()); lip.position.set(0, .01, .058); lip.userData.ownGeo = true; g.add(lip);
  const cols = [25000, 5000, 1000, 500, 100, 25, 10, 100], gap = w / cols.length, per = 11;
  const byV = new Map(); cols.forEach((v, i) => byV.set(v, [...(byV.get(v) || []), i]));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const meshes = [];
  for (const [v, idx] of byV) {
    const im = new THREE.InstancedMesh(chips.geo, chips.mats.get(v), idx.length * per);
    let k = 0;
    for (const i of idx) for (let j = 0; j < per; j++) im.setMatrixAt(k++, m.compose(p.set(-w / 2 + gap * (i + .5), .012 + CHIP.r * .82, -.042 + j * CHIP.h * 1.02), q, one));
    im.instanceMatrix.needsUpdate = true; im.receiveShadow = true;
    g.add(im); meshes.push(im);
  }
  parent.add(g);
  return { group: g, dispose: () => meshes.forEach(im => im.dispose()) };
}
const breakdownCount = v => ChipFactory.breakdown(v, 36).length;
function sectorHit(parent, b, key) {
  const geo = new THREE.RingGeometry(b.r0, b.r1, 48, 1, -A1 * RAD, (A1 - A0) * RAD);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, .002, ZF);
  m.userData = { bet: key, ownGeo: true, ownMat: true };
  parent.add(m); return m;
}
// a neon outline + soft fill hugging a betting band (additive)
function bandGlow(parent, b) {
  const pad = .03, a0 = A0 * RAD, a1 = A1 * RAD;
  const geo = new THREE.RingGeometry(b.r0 - pad, b.r1 + pad, 96, 2, -a1 - .09, a1 - a0 + .18);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(b.color) }, opacity: { value: 0 }, r0: { value: b.r0 }, r1: { value: b.r1 }, a0: { value: a0 }, a1: { value: a1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 color; uniform float opacity, r0, r1, a0, a1; varying vec2 vP;
      void main(){
        float r = length(vP), a = atan(-vP.y, vP.x);
        float d = min(min(r - r0, r1 - r), min((a - a0) * r, (a1 - a) * r));
        float line = exp(-abs(d) / .0045);
        float halo = d < 0.0 ? exp(d / .014) * .45 : 0.0;
        float fill = d > 0.0 ? .16 + .1 * smoothstep(0.0, .03, d) : 0.0;
        float v = (line + halo + fill) * opacity;
        gl_FragColor = vec4(color * v, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2; m.position.set(0, .0032, ZF); m.renderOrder = 2;
  m.userData.ownGeo = m.userData.ownMat = true;
  parent.add(m); return m;
}

const HELP_CSS = `
/* four buttons in one row on laptop widths */
@media (min-width:861px) and (max-width:1500px){#app.bac-on .actions .act{min-width:0;padding:0 14px;letter-spacing:.1em}#app.bac-on .actions .act small{letter-spacing:.08em}}
.bac-tabwrap{overflow-x:auto;margin-top:6px}
.bac-tab{border-collapse:collapse;width:100%;min-width:420px;font-variant-numeric:tabular-nums}
.bac-tab th,.bac-tab td{padding:6px 4px!important;text-align:center!important;font-size:12.5px;border-bottom:1px solid rgba(255,255,255,.06)}
.bac-tab th:first-child,.bac-tab td:first-child{color:var(--gold);font-weight:800;text-align:left!important;padding-left:8px!important}
.bac-tab td.d{color:var(--gold-hi);font-weight:900;background:rgba(212,175,95,.13);box-shadow:inset 0 0 0 1px rgba(212,175,95,.18)}
.bac-tab td.s{color:rgba(239,230,210,.3)}
`;

document.addEventListener('click', e => {
  if (e.target.id === 'bac-fast-toggle') {
    const g = window.__casino?.current; if (!g || !(g instanceof Baccarat)) return;
    g.toggleFast();
  }
});
