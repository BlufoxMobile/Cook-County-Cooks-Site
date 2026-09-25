// VIDEO POKER — Jacks or Better, 9/6 full pay, on a lacquer-and-gold upright in
// the lounge. Five real 3D cards deal, flip, lift when held and redraw on a
// glass display under a live paytable. Ace's hint is an exact expected-value
// search over all 32 holds (js/rules/videopoker.mjs).
import * as THREE from '../vendor/three.min.mjs';
import { Game } from './base.mjs';
import { fmt } from '../core/hud.mjs';
import { deck } from '../core/rng.mjs';
import { FONT_DISPLAY, FONT_TEXT, drawSuit } from '../core/textures.mjs';
import { CARD } from '../core/props.mjs';
import { buildCabinet, machineStage, disposeTree, own, canvasTex, makeCanvas, rrPath, goldGrad, spaced, loadFonts, frameGlowTexture, additive } from './machine-cabinet.mjs';
import { CoinShower, nudge } from './machine-fx.mjs';
import { HANDS, PAYTABLE, MAX_COINS, COIN_VALUES, payout, rankOf, winningCards, analyse, bestHoldSync, describeHold, holdEV } from '../rules/videopoker.mjs';

// display layout (metres, face coordinates; the opening is centred on 0,0)
const OPEN_W = .64, OPEN_H = .6, PX = 1600;                     // canvas pixels per metre
const PT_TOP = .288, HDR_H = .024, ROW_H = .0275;
const CARD_S = 1.45, CW = CARD.w * CARD_S, CH = CARD.h * CARD_S, PITCH = CW + .016;
const CARD_Y = -.1, CARD_Z = -.05, LIFT = .011, HELD_Y = .003, HOLD_BTN_Y = -.203, INFO_Y = -.255, DISPLAY_Z = -.14;
const slotX = i => (i - 2) * PITCH;
const VIEW = {
  landscape: { pos: [0, .13, 1.86], look: [0, .13, 0], fov: 32 },
  portrait: { pos: [0, .1, 1.75], look: [0, .1, 0], fov: 44, fitWidth: .68, maxFov: 64 }
};
const ROOM = { landscape: { z: -2.5, railY: -1.25, width: 8.6 }, portrait: { z: -1.9, railY: -1.6, width: 10.5 } };
const CSS = `
.anchor.vp-hold{pointer-events:auto}
.vp-hold button{min-width:62px;height:30px;padding:0 10px;border-radius:9px;font:800 11px/1 ${FONT_TEXT};letter-spacing:.16em;color:#f3dc9b;background:rgba(8,10,14,.82);box-shadow:inset 0 0 0 1px rgba(227,199,126,.45),0 6px 16px rgba(0,0,0,.45);cursor:pointer;transition:transform .12s,background .2s}
.vp-hold button:active{transform:scale(.95)}
.vp-hold button.on{color:#1e1405;background:linear-gradient(180deg,#f6e2a6,#d3a855 55%,#a97c30);box-shadow:0 0 18px rgba(243,220,155,.55)}
@media (max-width:520px){.vp-hold button{min-width:52px;height:28px;padding:0 6px;font-size:10px;letter-spacing:.1em}}`;

export default class VideoPoker extends Game {
  static id = 'videopoker';

  async enter(first) {
    const { stage } = this;
    this.coins = Math.max(1, Math.min(MAX_COINS, this.bank.setting('vpCoins') ?? MAX_COINS));
    this.coinValue = COIN_VALUES.includes(this.bank.setting('vpCoin')) ? this.bank.setting('vpCoin') : 25;
    this.hints = this.bank.setting('vpHints') !== false;
    this.phase = 'boot'; this.hand = null; this.held = [false, false, false, false, false]; this.best = null;
    this.flash = null; this.winShown = 0; this.msg = 'PLAY 5 COINS FOR THE ROYAL BONUS'; this.clock = 0;
    this.backdrop.setRoom('empty');
    this.restoreStage = machineStage(stage, this.backdrop, { keyIntensity: 17, dim: .7 });
    this.placeRoom();
    this.css = document.createElement('style'); this.css.id = 'css-videopoker'; this.css.textContent = CSS; document.head.append(this.css);
    await Promise.all([loadFonts(), this.cards.ready]);
    if (!this.alive) return;
    this.buildMachine();
    this.fx = new CoinShower(stage, this.root, { max: { high: 120, mid: 70, low: 36 }[stage.tier] });
    this.onTap(e => this.tap(e));
    this.onHover(() => this.phase === 'hold' ? this.cardObjs.map(c => c.pick) : this.phase === 'bet' ? this.cab.pickables() : this.cab.pickables());
    this.key({ ' ': () => this.primary(), enter: () => this.primary(), 1: () => this.toggle(0), 2: () => this.toggle(1), 3: () => this.toggle(2), 4: () => this.toggle(3), 5: () => this.toggle(4), b: () => this.betOne(), m: () => this.betMax(), h: () => this.acePick() });
    this.hud.rack(COIN_VALUES, v => this.setCoin(v));
    this.hud.selected = this.coinValue; this.hud.rack(COIN_VALUES, v => this.setCoin(v));
    this.offFrame = stage.onFrame(Object.assign(dt => this.frame(dt), { onResize: () => this.placeRoom() }));
    this.phase = 'bet';
    this.renderUI(); this.drawScreen();
    await stage.applyView(VIEW, first ? 0 : 1.2);
    if (!this.alive) return;
    this.say(this.hints ? 'Jacks or Better, full pay. I’ll point out the best hold.' : 'Jacks or Better, full pay. Deal when ready.');
  }
  placeRoom() { this.backdrop.place(this.stage.portrait ? ROOM.portrait : ROOM.landscape); }

  // ── build ──
  buildMachine() {
    const stage = this.stage;
    this.cab = buildCabinet(stage, {
      width: .74, open: { w: OPEN_W, h: OPEN_H }, bezel: { top: .03, bottom: .05 }, recess: .15,
      topper: { h: .24, radius: .44 }, led: { a: '#ff4d5e', b: '#ffcf6a' },
      buttons: [
        ...[0, 1, 2, 3, 4].map(i => ({ id: 'hold' + i, label: 'HOLD', x: -.29 + i * .075, w: .062, color: '#ffd76a' })),
        { id: 'betone', label: 'BET\nONE', x: .1, w: .062, color: '#ff8a3c' },
        { id: 'betmax', label: 'BET\nMAX', x: .172, w: .062, color: '#ff5a4a' },
        { id: 'deal', label: 'DEAL', x: .262, w: .085, color: '#ffc53d', pulse: true }
      ]
    });
    this.root.add(this.cab.group);
    const face = this.face = new THREE.Group(); this.root.add(face);
    // the display
    const cv = makeCanvas(1024, Math.round(1024 * OPEN_H / OPEN_W)), tex = canvasTex(cv);
    this.scr = { cv, ctx: cv.getContext('2d'), tex, W: cv.width, H: cv.height };
    const disp = own(new THREE.Mesh(new THREE.PlaneGeometry(OPEN_W + .004, OPEN_H + .004), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    disp.position.z = DISPLAY_Z; face.add(disp);
    // inner vignette on the glass
    const vcv = makeCanvas(256, 256), vc = vcv.getContext('2d'), vg = vc.createRadialGradient(128, 128, 60, 128, 128, 190);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); vc.fillStyle = vg; vc.fillRect(0, 0, 256, 256);
    const vig = own(new THREE.Mesh(new THREE.PlaneGeometry(OPEN_W, OPEN_H), new THREE.MeshBasicMaterial({ map: canvasTex(vcv, { srgb: false }), transparent: true, depthWrite: false })));
    vig.position.z = -.004; vig.renderOrder = 4; face.add(vig);
    // five cards; each owns a clone of the card material so it can dim on its own
    const base = this.cards.mat;
    this.cardObjs = [0, 1, 2, 3, 4].map(i => {
      const holder = new THREE.Group(); holder.position.set(slotX(i), CARD_Y, CARD_Z); holder.rotation.x = Math.PI / 2; holder.scale.setScalar(CARD_S);
      const card = this.cards.make(null, false);
      const mat = base.clone(); mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = base.map; mat.emissiveIntensity = .05;
      card.userData.front.material = mat; card.userData.back.material = mat;
      holder.add(card); face.add(holder);
      const glow = own(new THREE.Mesh(new THREE.PlaneGeometry(CW * 1.5, CH * 1.34), additive(frameGlowTexture(), 0xffd36a, 0)));
      glow.position.set(slotX(i), CARD_Y, CARD_Z - .012); glow.renderOrder = 1; face.add(glow);
      const pick = new THREE.Mesh(new THREE.PlaneGeometry(CW * 1.06, CH * 1.1), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(slotX(i), CARD_Y + .006, CARD_Z + .01); pick.userData = { card: i, ownGeo: true, ownMat: true }; face.add(pick);
      return { i, holder, card, mat, glow, pick, lift: 0, liftTo: 0, dim: 1, dimTo: 1, glowTo: 0, glowCol: new THREE.Color(0xffd36a) };
    });
    // glowing HELD plates
    const hcv = makeCanvas(320, 72), hc = hcv.getContext('2d');
    hc.shadowColor = 'rgba(255,200,80,.9)'; hc.shadowBlur = 14; rrPath(hc, 10, 8, 300, 56, 28);
    const hg = hc.createLinearGradient(0, 8, 0, 64); hg.addColorStop(0, '#fff0b8'); hg.addColorStop(.5, '#f2c75a'); hg.addColorStop(1, '#b8842c');
    hc.fillStyle = hg; hc.fill(); hc.shadowBlur = 0; hc.lineWidth = 3; hc.strokeStyle = '#fff6d8'; hc.stroke();
    hc.fillStyle = '#2a1600'; hc.font = `900 38px ${FONT_TEXT}`; hc.textAlign = 'center'; hc.textBaseline = 'middle'; spaced(hc, 'HELD', 160, 38, 10);
    const hTex = canvasTex(hcv), hMat = new THREE.MeshBasicMaterial({ map: hTex, transparent: true, depthWrite: false, toneMapped: false });
    this.heldLabels = [0, 1, 2, 3, 4].map(i => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CW * .92, CW * .92 * 72 / 320), hMat); m.userData.ownGeo = true; m.userData.ownMat = i === 0;
      m.position.set(slotX(i), HELD_Y, CARD_Z + .004); m.visible = false; m.renderOrder = 6; face.add(m); return m;
    });
    this.drawMarquee();
  }
  drawMarquee() {
    this.cab.marquee.redraw((c, W, H) => {
      const bg = c.createRadialGradient(W / 2, H * .55, 10, W / 2, H * .55, W * .6);
      bg.addColorStop(0, '#7d1024'); bg.addColorStop(.45, '#2c0510'); bg.addColorStop(1, '#070105');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H * .6);
      for (let i = 0; i < 36; i++) { c.rotate(Math.PI / 18); if (i % 2) { c.fillStyle = 'rgba(255,200,120,.06)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(W, -W * .09); c.lineTo(W, W * .09); c.fill(); } }
      c.restore();
      // suits in medallions
      const suits = [[0, W * .085], [1, W * .165], [2, W * .835], [3, W * .915]];
      for (const [s, x] of suits) {
        const y = H * .5, r = H * .15;
        const g = c.createRadialGradient(x - r * .3, y - r * .3, 2, x, y, r); g.addColorStop(0, '#fff8e2'); g.addColorStop(1, '#d8cdb0');
        c.fillStyle = goldGrad(c, y - r * 1.2, y + r * 1.2); c.beginPath(); c.arc(x, y, r * 1.18, 0, 7); c.fill();
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
        drawSuit(c, s, x, y + r * .04, r * 1.15, s === 1 || s === 2 ? '#c3122c' : '#15161a');
      }
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      const title = 'Video Poker', ts = H * .38;
      c.font = `italic 900 ${ts}px ${FONT_DISPLAY}`;
      const sx = Math.min(1, W * .56 / c.measureText(title).width);
      c.save(); c.translate(W / 2, H * .58); c.scale(sx, 1); c.lineJoin = 'round';
      c.shadowColor = 'rgba(255,120,80,.8)'; c.shadowBlur = H * .09; c.lineWidth = H * .04; c.strokeStyle = '#2a0508'; c.strokeText(title, 0, 0); c.shadowBlur = 0;
      c.fillStyle = goldGrad(c, -ts * .75, ts * .1); c.fillText(title, 0, 0);
      c.lineWidth = H * .005; c.strokeStyle = 'rgba(255,255,255,.75)'; c.strokeText(title, 0, 0); c.restore();
      c.font = `800 ${H * .09}px ${FONT_TEXT}`; c.fillStyle = '#ffe7ad';
      spaced(c, 'JACKS OR BETTER  ·  9/6 FULL PAY', W / 2, H * .84, H * .03);
      c.font = `800 ${H * .07}px ${FONT_TEXT}`; c.fillStyle = '#e9b86a'; spaced(c, '★  C³ LOUNGE  ★', W / 2, H * .17, H * .04);
    });
  }
  drawScreen() {
    const { ctx: c, W, H } = this.scr, Y = y => (OPEN_H / 2 - y) * PX;
    const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d2276'); bg.addColorStop(.5, '#08185a'); bg.addColorStop(1, '#030a2c');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.save(); c.globalAlpha = .06; c.strokeStyle = '#8fb0ff'; c.lineWidth = 1;
    for (let k = -H; k < W + H; k += 26) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + H, H); c.stroke(); c.beginPath(); c.moveTo(k, H); c.lineTo(k + H, 0); c.stroke(); }
    c.restore();
    // paytable
    const x0 = 22, x1 = W - 22, top = Y(PT_TOP), hdr = HDR_H * PX, rowH = ROW_H * PX, nameW = 372, colW = (x1 - x0 - nameW) / 5, bottom = top + hdr + PAYTABLE.length * rowH;
    rrPath(c, x0, top, x1 - x0, bottom - top, 12); c.fillStyle = 'rgba(2,6,24,.55)'; c.fill();
    // bet column
    const cx = x0 + nameW + (this.coins - 1) * colW;
    const cg = c.createLinearGradient(0, top, 0, bottom); cg.addColorStop(0, '#b3172c'); cg.addColorStop(1, '#5d0714');
    c.fillStyle = cg; c.fillRect(cx, top, colW, bottom - top);
    c.strokeStyle = '#f3d58a'; c.lineWidth = 3; c.strokeRect(cx + 1.5, top + 1.5, colW - 3, bottom - top - 3);
    // header
    c.textBaseline = 'middle'; c.font = `800 ${hdr * .52}px ${FONT_TEXT}`;
    c.fillStyle = '#9fb4ff'; c.textAlign = 'left'; spaced(c, 'HAND', x0 + 18, top + hdr * .55, 3, 'left');
    for (let k = 0; k < 5; k++) { c.fillStyle = k === this.coins - 1 ? '#fff4d6' : '#9fb4ff'; spaced(c, `${k + 1} COIN${k ? 'S' : ''}`, x0 + nameW + colW * (k + .5), top + hdr * .55, 2); }
    // rows
    const flashOn = this.flash && Math.floor(this.clock * 4) % 2 === 0;
    PAYTABLE.forEach((row, i) => {
      const y = top + hdr + i * rowH, hot = this.flash === row.rank, lit = hot && (flashOn || this.phase !== 'result'), dealt = this.dealtRank === row.rank && this.phase === 'hold';
      if (lit || dealt) { c.fillStyle = lit ? 'rgba(255,214,100,.95)' : 'rgba(255,214,100,.28)'; c.fillRect(x0 + 3, y + 1, x1 - x0 - 6, rowH - 2); }
      c.strokeStyle = 'rgba(227,199,126,.22)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0 + 10, y); c.lineTo(x1 - 10, y); c.stroke();
      c.font = `800 ${rowH * .56}px ${FONT_TEXT}`; c.textAlign = 'left';
      c.fillStyle = lit ? '#2a1400' : row.rank === 9 ? '#ffe28a' : '#ffd24d';
      spaced(c, row.name.toUpperCase(), x0 + 18, y + rowH * .54, 1.5, 'left');
      c.textAlign = 'right';
      row.pays.forEach((v, k) => {
        c.fillStyle = lit ? '#2a1400' : k === this.coins - 1 ? '#ffffff' : '#ffe9a0';
        c.font = `${row.rank === 9 && k === 4 ? 900 : 800} ${rowH * (row.rank === 9 && k === 4 ? .62 : .56)}px ${FONT_TEXT}`;
        c.fillText(fmt(v), x0 + nameW + colW * (k + 1) - 16, y + rowH * .55);
      });
    });
    rrPath(c, x0, top, x1 - x0, bottom - top, 12); c.strokeStyle = 'rgba(243,213,138,.75)'; c.lineWidth = 3; c.stroke();
    // card wells
    for (let i = 0; i < 5; i++) {
      const cx2 = W / 2 + slotX(i) * PX, cy2 = Y(CARD_Y);
      rrPath(c, cx2 - CW * PX / 2 - 6, cy2 - CH * PX / 2 - 6, CW * PX + 12, CH * PX + 12, 14);
      c.fillStyle = 'rgba(0,0,0,.28)'; c.fill(); c.strokeStyle = 'rgba(150,180,255,.18)'; c.lineWidth = 2; c.stroke();
    }
    // info row
    const iy = Y(INFO_Y);
    const ig = c.createLinearGradient(0, iy - 34, 0, iy + 34); ig.addColorStop(0, 'rgba(0,0,0,.55)'); ig.addColorStop(1, 'rgba(0,0,0,.25)');
    rrPath(c, x0, iy - 32, x1 - x0, 64, 12); c.fillStyle = ig; c.fill(); c.strokeStyle = 'rgba(243,213,138,.5)'; c.lineWidth = 2; c.stroke();
    c.textAlign = 'left'; c.font = `800 20px ${FONT_TEXT}`; c.fillStyle = '#9fb4ff'; spaced(c, 'WIN', x0 + 20, iy - 1, 3, 'left');
    c.font = `900 38px ${FONT_TEXT}`; c.fillStyle = this.winShown > 0 ? '#ffe28a' : '#5f6a97'; c.fillText(fmt(this.winShown), x0 + 78, iy + 2);
    const betTxt = `${this.coins} × ${fmt(this.coinValue)}`;
    c.textAlign = 'right'; c.font = `900 30px ${FONT_TEXT}`; c.fillStyle = '#ffffff'; c.fillText(betTxt, x1 - 22, iy + 2);
    const bw = c.measureText(betTxt).width;
    c.font = `800 20px ${FONT_TEXT}`; c.fillStyle = '#9fb4ff'; spaced(c, 'BET', x1 - 34 - bw, iy - 1, 3, 'right');
    // centre message, shrunk to fit between the two readouts
    const room = W - 2 * 250;
    let fz = 24; c.font = `800 ${fz}px ${FONT_TEXT}`;
    const mw = c.measureText(this.msg).width + this.msg.length * 2.5; if (mw > room) { fz = Math.max(14, fz * room / mw); c.font = `800 ${fz}px ${FONT_TEXT}`; }
    c.textAlign = 'center'; c.fillStyle = this.phase === 'result' && this.flash ? '#ffe28a' : '#cfd9ff';
    spaced(c, this.msg, W / 2, iy + 1, fz * .1);
    this.scr.tex.needsUpdate = true;
  }

  // ── bets ──
  get bet() { return this.coins * this.coinValue; }
  canBet() { return this.phase === 'bet' || this.phase === 'result'; }
  setCoin(v) {
    if (!this.canBet()) { this.hud.selected = this.coinValue; return; }
    this.coinValue = v; this.bank.setting('vpCoin', v); this.toBet(); this.renderUI(); this.drawScreen();
  }
  toBet() { if (this.phase === 'result') { this.phase = 'bet'; this.flash = null; this.clearHighlights(); } }
  betOne() {
    if (!this.canBet()) return;
    this.toBet(); this.coins = this.coins % MAX_COINS + 1; this.bank.setting('vpCoins', this.coins);
    this.sound.play('chip', { vol: .5, rate: .85 + this.coins * .08 }); this.cab.buttons.get('betone').press();
    this.msg = this.coins === MAX_COINS ? 'MAX BET · ROYAL PAYS 4,000' : `${this.coins} COIN${this.coins > 1 ? 'S' : ''} · PLAY 5 FOR THE ROYAL BONUS`;
    this.renderUI(); this.drawScreen();
  }
  betMax() {
    if (!this.canBet()) return;
    this.cab.buttons.get('betmax').press();
    this.toBet(); this.coins = MAX_COINS; this.bank.setting('vpCoins', this.coins);
    this.drawScreen(); this.deal();
  }
  renderUI() {
    const p = this.phase, betting = this.canBet(), hold = p === 'hold';
    this.hud.bet('TOTAL BET', this.bet, `${this.coins} coin${this.coins > 1 ? 's' : ''} × ${fmt(this.coinValue)}`);
    this.hud.rackEnabled(betting); this.hud.affordable(this.balance);
    const afford = this.bet <= this.balance;
    if (hold) {
      this.hud.actions([
        { id: 'hint', label: 'ACE’S PICK', sub: 'HOLD FOR ME', onClick: () => this.acePick(), key: 'H' },
        { id: 'draw', label: 'DRAW', kind: 'primary', hot: true, onClick: () => this.draw(), key: '␣' }
      ]);
    } else {
      this.hud.actions([
        { id: 'hints', label: 'HINTS', sub: this.hints ? 'ACE IS ON' : 'OFF', onClick: () => this.toggleHints(), disabled: !betting && p !== 'boot' },
        { id: 'betone', label: 'BET ONE', sub: `${this.coins} COIN${this.coins > 1 ? 'S' : ''}`, onClick: () => this.betOne(), disabled: !betting, key: 'B' },
        { id: 'betmax', label: 'BET MAX', sub: fmt(MAX_COINS * this.coinValue), onClick: () => this.betMax(), disabled: !betting || MAX_COINS * this.coinValue > this.balance, key: 'M' },
        { id: 'deal', label: 'DEAL', sub: fmt(this.bet), kind: 'primary', hot: betting && afford, onClick: () => this.deal(), disabled: !betting || !afford, key: '␣' }
      ]);
    }
    const b = this.cab?.buttons; if (!b) return;
    for (let i = 0; i < 5; i++) b.get('hold' + i).setLit(hold);
    b.get('betone').setLit(betting); b.get('betmax').setLit(betting);
    b.get('deal').setLabel(hold ? 'DRAW' : 'DEAL'); b.get('deal').setLit(hold || (betting && afford)); b.get('deal').setPulse(hold || (betting && afford));
    this.renderHoldButtons();
  }
  renderHoldButtons() {
    for (let i = 0; i < 5; i++) {
      if (this.phase !== 'hold') { this.hud.unanchor('vph' + i); continue; }
      const el = this.hud.anchor('vph' + i, new THREE.Vector3(slotX(i), HOLD_BTN_Y, CARD_Z), `<button class="${this.held[i] ? 'on' : ''}" aria-pressed="${this.held[i]}">${this.held[i] ? 'HELD' : 'HOLD'}</button>`, 'vp-hold');
      el.onclick = e => { e.stopPropagation(); this.sound.unlock(); this.toggle(i); };
    }
  }
  toggleHints() {
    this.hints = !this.hints; this.bank.setting('vpHints', this.hints);
    this.say(this.hints ? 'Hints on. I’ll light up the best hold after every deal.' : 'Hints off. You’re on your own.');
    this.renderUI();
  }
  primary() { if (this.phase === 'hold') this.draw(); else if (this.canBet()) this.deal(); }
  tap(e) {
    const h = this.stage.pick(e.clientX, e.clientY, [...this.cardObjs.map(c => c.pick), ...this.cab.pickables()], false)[0];
    if (!h) return;
    const ud = h.object.userData;
    if (ud.card !== undefined) { this.toggle(ud.card); return; }
    const id = ud.btn; this.cab.buttons.get(id)?.press();
    if (id?.startsWith('hold')) this.toggle(+id.slice(4));
    else if (id === 'betone') this.betOne();
    else if (id === 'betmax') this.betMax();
    else if (id === 'deal') this.primary();
  }

  // ── the hand ──
  async deal() {
    if (!this.canBet() || !this.alive) return;
    const bet = this.bet;
    if (!this.bank.stake(bet)) { this.hud.toast('Not enough chips for that bet — try a smaller coin or BET ONE.'); return; }
    this.cab.buttons.get('deal').press();
    this.phase = 'dealing'; this.staked = bet; this.flash = null; this.winShown = 0; this.best = null; this.dealtRank = 0;
    this.held = [false, false, false, false, false];
    this.clearHighlights();
    this.msg = 'GOOD LUCK'; this.renderUI(); this.drawScreen();
    this.deck = deck(); this.hand = this.deck.splice(0, 5);
    this.pendingHand = { bet, coins: this.coins, coinValue: this.coinValue };
    this.sound.play('chip', { vol: .5 }); this.cab.setLeds('spin');
    // turn over whatever is showing, then deal the new cards face up left to right
    const up = this.cardObjs.filter(o => o.card.userData.faceUp);
    if (up.length) { this.sound.whoosh(); await Promise.all(up.map(o => this.flip(o, false, .22))); }
    if (!this.alive) return;
    for (let i = 0; i < 5; i++) {
      const o = this.cardObjs[i]; o.card.setCard(this.hand[i]);
      this.sound.card(); this.flip(o, true, .34, true, true);
      await this.wait(.09);
      if (!this.alive) return;
    }
    await this.wait(.3);
    if (!this.alive) return;
    this.phase = 'hold'; this.cab.setLeds('attract', '#ff4d5e', '#ffcf6a');
    const r = rankOf(this.hand); this.dealtRank = r;
    this.msg = r ? `DEALT ${HANDS[r].toUpperCase()}` : 'HOLD CARDS · THEN DRAW';
    this.renderUI(); this.drawScreen();
    if (r >= 4) this.sound.chime(2);
    this.adviseAsync();
  }
  async adviseAsync() {
    const hand = this.hand, coins = this.coins;
    const res = await analyse(hand, coins, () => new Promise(r => setTimeout(r, 0)));
    if (!this.alive || this.hand !== hand || this.phase !== 'hold') return;
    this.best = res[0];
    if (this.hints) this.showHint();
  }
  showHint() {
    if (!this.best) return;
    const m = this.best.mask;
    this.cardObjs.forEach((o, i) => { if (!this.held[i]) { o.glowCol.set(0x5fc8ff); o.glowTo = m & (1 << i) ? .75 : 0; } });
    this.say(describeHold(this.hand, m));
  }
  async acePick() {
    if (this.phase !== 'hold') return;
    if (!this.best) { this.say('One moment…'); const res = await analyse(this.hand, this.coins, () => new Promise(r => setTimeout(r, 0))); if (!this.alive || this.phase !== 'hold') return; this.best = res[0]; }
    const m = this.best.mask;
    for (let i = 0; i < 5; i++) if (!!(m & (1 << i)) !== this.held[i]) this.toggle(i, true);
    this.say(describeHold(this.hand, m)); this.sound.chime(1);
  }
  toggle(i, quiet = false) {
    if (this.phase !== 'hold' || !this.alive) return;
    this.held[i] = !this.held[i];
    const o = this.cardObjs[i];
    o.liftTo = this.held[i] ? 1 : 0;
    o.glowCol.set(this.held[i] ? 0xffd36a : 0x5fc8ff);
    o.glowTo = this.held[i] ? .95 : (this.hints && this.best && this.best.mask & (1 << i) ? .75 : 0);
    this.heldLabels[i].visible = this.held[i];
    this.cab.buttons.get('hold' + i)?.press();
    if (!quiet) this.sound.tone(this.held[i] ? 880 : 660, { type: 'triangle', d: .12, vol: .06, verb: .1 });
    this.renderHoldButtons();
  }
  async draw() {
    if (this.phase !== 'hold' || !this.alive) return;
    this.phase = 'drawing'; this.renderUI();
    const mask = this.held.reduce((m, h, i) => m | (h ? 1 << i : 0), 0);
    const bestMask = this.best?.mask, pre = this.hand.slice();
    this.cardObjs.forEach((o, i) => { if (!this.held[i]) o.glowTo = 0; });
    this.cab.buttons.get('deal').press();
    const redraw = [0, 1, 2, 3, 4].filter(i => !this.held[i]);
    for (const i of redraw) this.hand[i] = this.deck.shift();
    if (redraw.length) {
      this.sound.whoosh();
      await Promise.all(redraw.map(i => this.flip(this.cardObjs[i], false, .2)));
      if (!this.alive) return;
      for (const i of redraw) {
        const o = this.cardObjs[i]; o.card.setCard(this.hand[i]);
        this.sound.card(); this.flip(o, true, .34, true, true);
        await this.wait(.1);
        if (!this.alive) return;
      }
      await this.wait(.32);
    } else await this.wait(.25);
    if (!this.alive) return;
    const rank = rankOf(this.hand), pay = payout(rank, this.coins) * this.coinValue, bet = this.staked;
    await this.showResult(rank, pay, bet);
    if (!this.alive) return;
    this.pendingHand = null;
    this.bank.settle(bet, pay, 'videopoker');
    this.emit('hand', { net: pay - bet, rank });
    if (this.hints && bestMask !== undefined && bestMask !== mask) {
      const lost = holdEV(pre, bestMask, this.coins) - holdEV(pre, mask, this.coins);
      if (lost > .05 * this.coins) this.say(`My play was: ${describeHold(pre, bestMask).replace(/\.$/, '')}.`);
    }
    this.phase = 'result'; this.renderUI(); this.drawScreen();
    if (this.balance < COIN_VALUES[0]) this.say('Out of chips — Ace’s marker is waiting in the lobby.');
  }
  async showResult(rank, pay, bet) {
    this.held.forEach((h, i) => { if (h) { this.heldLabels[i].visible = false; } });
    this.heldLabels.forEach(l => { l.visible = false; });
    this.cardObjs.forEach(o => { o.liftTo = 0; });
    this.renderHoldButtons();
    if (!rank) {
      this.msg = 'NO WIN · DEAL AGAIN'; this.flash = null; this.drawScreen();
      this.cardObjs.forEach(o => { o.dimTo = .55; o.glowTo = 0; });
      this.say(['Nothing there. Next hand.', 'The deck owes you one.', 'Close, but no. Deal again?'][Math.floor(Math.random() * 3)]);
      this.sound.lose();
      return;
    }
    const win = winningCards(this.hand, rank);
    this.cardObjs.forEach((o, i) => { const w = win.includes(i); o.dimTo = w ? 1 : .5; o.glowCol.set(0xffd36a); o.glowTo = w ? .9 : 0; });
    this.flash = rank; this.msg = HANDS[rank].toUpperCase(); this.drawScreen();
    this.cab.setLeds(rank >= 7 ? 'big' : 'win', rank >= 7 ? '#ffe28a' : '#ff4d5e', rank >= 7 ? '#ff3d7a' : '#ffcf6a');
    const dur = rank >= 7 ? 2.6 : Math.min(1.8, .6 + rank * .15);
    if (rank === 9) { this.sound.fanfare(); this.fx.start({ rate: 110, dur: 4, burst: 60 }); nudge(this.stage, .08); this.cab.flashMarquee(.25); }
    else if (rank >= 7) { this.sound.fanfare(); this.fx.start({ rate: 50, dur: 2.4, burst: 20 }); nudge(this.stage, .05); }
    else this.sound.chime(rank >= 5 ? 3 : rank >= 3 ? 2 : 1);
    const lines = { 1: 'Jacks or better. Your bet comes back.', 2: 'Two pair pays two for one.', 3: 'Three of a kind.', 4: 'A straight. Very tidy.', 5: 'Flush! Six for one.', 6: 'Full house — nine for one.', 7: 'Four of a kind!', 8: 'A straight flush. Rare air.', 9: 'ROYAL FLUSH. The lounge will talk about this one.' };
    this.say(lines[rank]);
    if (rank >= 5) this.hud.banner({ title: HANDS[rank], amount: pay - bet, kind: rank >= 7 ? 'big' : 'win', sub: `PAYS ${fmt(pay)}`, hold: rank >= 7 ? 3 : 1.8 });
    let last = 0;
    let lastDraw = -1;
    await this.tw.run(dur, (e, p) => {
      this.winShown = pay * e;
      if (this.clock - lastDraw > 1 / 15) { lastDraw = this.clock; this.drawScreen(); }   // big canvas: ~15 uploads a second is plenty
      if (p - last > .08 && p < 1) { last = p; this.sound.coin(); }
    }, { ease: 'outCubic' });
    this.winShown = pay; this.cab.flashMarquee(0); this.drawScreen();
    if (rank < 7) this.cab.setLeds('attract', '#ff4d5e', '#ffcf6a');
    else setTimeout(() => { if (this.alive) this.cab.setLeds('attract', '#ff4d5e', '#ffcf6a'); }, 2500);
  }
  clearHighlights() {
    this.cardObjs?.forEach(o => { o.dimTo = 1; o.glowTo = 0; o.liftTo = 0; });
    this.heldLabels?.forEach(l => { l.visible = false; });
  }
  // flip a card in place about its vertical axis, easing back into the screen so it never touches the glass
  flip(o, faceUp, dur = .3, pop = false, glide = false) {
    const from = o.card.rotation.z, to = faceUp ? 0 : Math.PI;
    if (Math.abs(from - to) < 1e-3) return Promise.resolve();
    const gx = glide ? .05 + (4 - o.i) * .012 : 0, gy = glide ? .035 : 0;
    return this.tw.run(dur, (e, p) => {
      o.card.rotation.z = from + (to - from) * e;
      o.push = Math.sin(p * Math.PI) * .03;
      const k = 1 - (1 - p) * (1 - p) * (1 - p);
      o.dx = gx * (1 - k); o.dy = gy * (1 - k);
      if (pop) o.holder.scale.setScalar(CARD_S * (1 + .05 * Math.sin(p * Math.PI)));
    }, { ease: 'inOutCubic' }).then(() => { o.card.rotation.z = to; o.card.userData.faceUp = faceUp; o.push = 0; o.dx = o.dy = 0; o.holder.scale.setScalar(CARD_S); });
  }

  frame(dt) {
    if (!this.alive || !this.cardObjs) return;
    this.clock += dt;
    const k = Math.min(1, dt * 12);
    for (const o of this.cardObjs) {
      o.lift += (o.liftTo - o.lift) * k; o.dim += (o.dimTo - o.dim) * Math.min(1, dt * 6);
      o.holder.position.x = slotX(o.i) + (o.dx || 0);
      o.holder.position.y = CARD_Y + o.lift * LIFT + (o.dy || 0);
      o.holder.position.z = CARD_Z - (o.push || 0) + o.lift * .004;
      o.mat.color.setScalar(.93 * o.dim); o.mat.emissiveIntensity = .05 * o.dim;
      const g = o.glow.material; g.color.copy(o.glowCol);
      const target = o.glowTo * (o.glowTo ? .8 + .2 * Math.sin(this.clock * 6 + o.i) : 1);
      g.opacity += (target - g.opacity) * Math.min(1, dt * 10);
      o.glow.position.y = o.holder.position.y;
    }
    if (this.flash && this.phase === 'result') { const f = Math.floor(this.clock * 4) % 2; if (f !== this.lastFlash) { this.lastFlash = f; this.drawScreen(); } }
    this.cab.update(dt);
    this.fx.update(dt);
  }

  dispose() {
    this.offFrame?.();
    this.restoreStage?.();
    this.css?.remove();
    // leaving mid-hand: finish it with the cards held, so the stake is never lost in limbo
    if (this.pendingHand && this.hand) {
      const ph = this.pendingHand;
      if (this.phase === 'hold' || this.phase === 'dealing' || this.phase === 'drawing') {
        // nothing held yet? play it the way Ace would
        let keep = this.held.slice();
        if (this.phase !== 'drawing' && !keep.some(Boolean)) { const m = (this.best || bestHoldSync(this.hand, ph.coins)).mask; keep = keep.map((_, i) => !!(m & (1 << i))); }
        const final = this.hand.map((c, i) => (this.phase === 'drawing' || keep[i]) ? c : this.deck.shift());
        const rank = rankOf(final), pay = payout(rank, ph.coins) * ph.coinValue;
        this.bank.settle(ph.bet, pay, 'videopoker');
        this.emit('hand', { net: pay - ph.bet, rank });
        if (pay > 0) this.hud.toast(`Your hand was finished for you: <b>${HANDS[rank]}</b> pays ${fmt(pay)}.`, 'gold');
      }
      this.pendingHand = null;
    }
    this.cardObjs?.forEach(o => o.mat.dispose());
    disposeTree(this.root);
  }

  help() {
    const rows = PAYTABLE.map(r => `<tr><td>${r.name}</td>${r.pays.map((v, k) => `<td class="r"${k === 4 ? ' style="color:var(--gold-hi)"' : ''}>${fmt(v)}</td>`).join('')}</tr>`).join('');
    return `<p class="eyebrow">MACHINE RULES</p><h2>Video Poker <em>Jacks or Better</em></h2>
    <ul><li>A fresh 52-card deck is shuffled for every hand. You get five cards: tap the ones to keep (or the HOLD buttons, or keys 1–5), then DRAW to replace the rest.</li>
    <li>Pick a coin value from the rack (${COIN_VALUES.map(fmt).join(' / ')} chips) and play 1–5 coins with BET ONE. BET MAX plays five coins and deals.</li>
    <li>Pays are per the table below — “for one”, so a pair of Jacks gives your bet back. Play all five coins: the Royal Flush jumps from 1,250 to <b>4,000</b>.</li></ul>
    <h3>PAYTABLE · 9/6 FULL PAY</h3>
    <table class="paytable"><tr><th>HAND</th>${[1, 2, 3, 4, 5].map(k => `<th class="r">${k} COIN${k > 1 ? 'S' : ''}</th>`).join('')}</tr>${rows}</table>
    <h3>ACE’S HINT</h3><p>After each deal Ace checks all 32 possible holds and lights the one with the best expected return. ACE’S PICK holds it for you. <button class="btn" id="vp-hints-toggle" style="height:34px;margin-left:6px">${this.hints ? 'TURN OFF' : 'TURN ON'}</button></p>
    <h3>THE MATH</h3><p class="muted">With five coins and perfect play this game returns 99.54% — verified exactly over all 2,598,960 possible deals. At fewer than five coins the smaller royal brings it down to about 98.37%.</p>
    <h3>KEYS</h3><p class="muted">1–5 hold · Space deal / draw · B bet one · M bet max · H Ace’s pick</p>`;
  }
}
document.addEventListener('click', e => {
  if (e.target.id === 'vp-hints-toggle') {
    const g = window.__casino?.current; if (!g || !(g instanceof VideoPoker)) return;
    g.toggleHints(); e.target.textContent = g.hints ? 'TURN OFF' : 'TURN ON';
  }
});
