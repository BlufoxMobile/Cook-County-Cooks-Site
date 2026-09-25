// TEXAS HOLD'EM — six-seat no-limit: you against five regulars (Maya, Marcus,
// Kai, Elena, Rico), dealt by Ace. Rules: js/rules/holdem.mjs (tested in
// js/games/holdem-test.mjs). Chips on the felt: js/games/holdem-chips.mjs.
//
// Money: the buy-in is staked when you sit. After every hand the stack is
// settled and re-staked, so bank.inPlay always equals your table stack; a
// closed tab refunds the stack you had when the hand began. Leaving (LEAVE
// TABLE, or the lobby button mid-hand, which checks/folds you out) unstakes it.
import * as THREE from '../vendor/three.min.mjs';
import { Game } from './base.mjs';
import { buildTable, glowRing } from '../core/tables.mjs';
import { CARD, makePuck, flipCard } from '../core/props.mjs';
import { fmt, esc, floatText } from '../core/hud.mjs';
import { TablePoker, tableBotAction, PLAYERS, LEVELS, bestHand, best, describe, shortName, holeName, draws, rankName } from '../rules/holdem.mjs';
import { ChipField, denomsFor } from './holdem-chips.mjs';
import { CSS, seatHTML, cardImg, helpHTML } from './holdem-ui.mjs';
import { makeLayout, paintFelt, VIEW } from './holdem-layout.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const STAKES = [{ bb: 50 }, { bb: 200 }, { bb: 1000 }];
const BOT_START = [1.1, .85, 1.2, .7, 1];            // opening stacks × 100 big blinds
const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
const cardWords = c => `${rankName(c.r)} of ${SUIT_NAMES[c.s]}`;
const upper = s => s.toUpperCase();

export default class Holdem extends Game {
  static id = 'holdem';

  async enter(first) {
    const { stage, bank } = this;
    this.css = Object.assign(document.createElement('style'), { id: 'css-holdem', textContent: CSS });
    document.head.append(this.css);
    this.level = Math.max(0, Math.min(4, bank.setting('heLevel') ?? 1));
    this.stakeIdx = Math.max(0, Math.min(2, bank.setting('heStakes') ?? 0));
    this.backdrop.setRoom('dealer');
    this.lay = makeLayout(stage.portrait);
    this.buildScene();
    this.keySave = { pos: stage.key.position.clone(), tgt: stage.key.target.position.clone(), angle: stage.key.angle, dist: stage.key.distance };
    stage.key.position.set(.1, 2.6, .75); stage.key.target.position.set(0, 0, -.05); stage.key.angle = .78; stage.key.distance = 9;

    this.seats = [0, 1, 2, 3, 4, 5].map(i => Object.assign({ i, objs: [], revealed: false }, this.lay.seats[i]));
    this.field = new ChipField(this.chips, this.root, { denoms: denomsFor(this.bb), shadows: stage.tier !== 'low' });
    for (const s of this.seats) {
      s.stack = this.field.stack({ pos: s.stackPos, yaw: s.yaw, style: 'stack', perCol: 14 });
      s.bet = this.field.stack({ pos: s.betPos, yaw: s.yaw, style: 'bet' });
    }
    this.potStack = this.field.stack({ pos: this.lay.pot, style: 'pot' });
    this.burnObjs = []; this.muckObjs = [];
    // a soft pool of light on the felt in front of whoever is acting
    this.turnGlow = glowRing(this.root, 0, 0, .12, 0xf3d58a); this.turnGlow.visible = false; this.acting = -1;
    this.puck = makePuck('D', { r: .026 }); this.puck.userData.ownGeo = true; this.root.add(this.puck);
    this.deck = this.makeDeck();
    this.rig = new THREE.Group(); this.root.add(this.rig);
    this.glowMat = this.makeGlowMat();
    // cards held up to the camera sit much closer to the key light: a darker, matte twin keeps them from blowing out
    this.heldMat = this.cards.mat.clone(); this.heldMat.roughness = .62; this.heldMat.envMapIntensity = .35;
    this.dimMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .52, depthWrite: false });
    this.glowGeo = new THREE.PlaneGeometry(CARD.w * 1.62, CARD.h * 1.42);
    this.fx = [];                                    // highlight meshes to clean up
    this.handObjs = [];                              // every card object dealt this hand
    this.stacks = [0, ...BOT_START.map(k => Math.round(k * 100) * this.bb)];
    this.button = rand6();
    this.handNo = 0; this.ff = false; this.seated = false; this.phase = 'sit';
    this.puck.position.copy(this.seats[this.button].puckPos);
    for (const s of this.seats) s.stack.set(this.stacks[s.i]);
    this.seatCards();
    this.makeSizer();
    this.hud.rack([], () => {});
    this.onDoc = e => this.docClick(e); document.addEventListener('click', this.onDoc);
    this.key({ f: () => this.press('fold'), c: () => this.press('call'), k: () => this.press('call'), r: () => this.press('raise'), a: () => this.preset('all'),
      arrowup: () => this.nudge(1), arrowdown: () => this.nudge(-1), ' ': () => this.press('deal'), enter: () => this.press('deal') });
    const frame = dt => this.frame(dt); frame.onResize = () => this.resized();
    this.offFrame = stage.onFrame(frame);
    this.portraitNow = stage.portrait;
    await stage.applyView(VIEW, first ? 0 : 1.2);
    if (!this.alive) return;
    this.sitDown(true);
  }
  get bb() { return STAKES[this.stakeIdx].bb; }
  get compact() { return this.stage.portrait; }       // portrait screens: the sizer opens on demand

  // ── table dressing ──────────────────────────────────────────────────────
  buildScene() {
    const lay = this.lay;
    this.backdrop.place(lay.backdrop);
    this.table = buildTable(this.stage, { outline: lay.outline, felt: { color: '#0c4636', size: [2048], paint: (c, P, S) => paintFelt(c, P, S, lay) } });
    this.table.group.rotation.y = lay.tableYaw;
  }
  // the phone turned: rebuild the table the other way round and move everything onto it
  reorient() {
    const old = this.table;
    old.group.removeFromParent();
    old.group.traverse(n => { if (!n.isMesh) return; if (n.userData.ownGeo) n.geometry.dispose(); if (n.userData.ownMat) [].concat(n.material).forEach(m => { m.map?.dispose(); m.dispose(); }); });
    this.lay = makeLayout(this.stage.portrait);
    this.buildScene();
    const lay = this.lay;
    for (const s of this.seats) {
      Object.assign(s, lay.seats[s.i]);
      s.stack.pos.copy(s.stackPos); s.stack.yaw = s.yaw; s.bet.pos.copy(s.betPos); s.bet.yaw = s.yaw;
      s.objs.forEach((o, k) => { if (o.parent === this.root && !o.userData.mucked) { o.position.x = s.cardPos[k].x; o.position.z = s.cardPos[k].z; o.rotation.y = s.yaw + (k ? -.06 : .06); o.scale.setScalar(s.i ? lay.holeScale : 1); } });
      if (this.disp?.bet[s.i]) this.betTag(s.i);
    }
    this.potStack.pos.copy(lay.pot); this.field.dirty = true; this.potTag();
    (this.boardObjs || []).forEach((o, k) => { const b = lay.board(k); o.position.x = b.x; o.position.z = b.z; o.scale.setScalar(lay.boardScale); });
    this.burnObjs.forEach((o, k) => { o.position.x = lay.burn.x; o.position.z = lay.burn.z; });
    this.muckObjs.forEach(o => { o.position.x = lay.muck.x; o.position.z = lay.muck.z; });
    this.deck.position.copy(lay.deal).setY(0);
    this.puck.position.copy(this.seats[this.button].puckPos);
    this.clearHighlight();
    this.fitAnchors();
  }
  makeDeck() {
    const g = new THREE.Group();
    for (let k = 0; k < 7; k++) { const o = this.cards.make(null, false); o.position.set((Math.random() - .5) * .001, CARD.t / 2 + k * .0007, (Math.random() - .5) * .001); o.rotation.y = (Math.random() - .5) * .03; g.add(o); }
    g.position.copy(this.lay.deal).setY(0); g.rotation.y = .06;
    this.root.add(g); return g;
  }
  makeGlowMat() {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 160;
    const c = cv.getContext('2d');
    c.filter = 'blur(10px)'; c.fillStyle = '#fff'; c.beginPath(); c.roundRect ? c.roundRect(22, 22, 84, 116, 12) : c.rect(22, 22, 84, 116); c.fill();
    const t = new THREE.CanvasTexture(cv);
    return new THREE.MeshBasicMaterial({ map: t, color: 0xf3d58a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  }
  seatCards() {
    for (const s of this.seats) {
      if (!s.i) continue;
      s.el = this.hud.anchor('seat' + s.i, s.anchor, seatHTML(s.i), 'seat he-seat');
      s.elSt = s.el.querySelector('.he-st'); s.elAc = s.el.querySelector('.he-ac'); s.elPos = s.el.querySelector('.he-pos'); s.elShow = s.el.querySelector('.he-show');
      s.elSt.textContent = fmt(this.stacks[s.i]);
    }
    this.fitAnchors();
  }
  // Keep every seat card fully on screen: walk its anchor in from the rail
  // (along the seat's inward normal) until the card clears the screen edges,
  // judged from the base camera so close-ups don't shuffle the seats.
  fitAnchors() {
    const st = this.stage; if (!this.seats || !st.w) return;
    const v = st.resolveView(VIEW), cam = st.camera.clone();
    cam.position.copy(v.pos); cam.fov = v.fov; cam.aspect = st.w / st.h; cam.updateProjectionMatrix(); cam.lookAt(v.look); cam.updateMatrixWorld();
    const top = 64 + (st.portrait ? 40 : 30);
    for (const s of this.seats) {
      if (!s.i || !s.el) continue;
      const hw = (s.el.offsetWidth || 110) / 2 + 6, hh = (s.el.offsetHeight || 70) / 2 + 4, p = s.anchor.clone(), q = V();
      for (let k = 0; k < 40; k++) {
        q.copy(p).project(cam);
        const x = (q.x * .5 + .5) * st.w, y = (-q.y * .5 + .5) * st.h;
        if (x >= hw && x <= st.w - hw && y >= top + hh) break;
        p.addScaledVector(s.n, .012);
      }
      const a = this.hud.anchors.get('seat' + s.i); if (a) a.world.copy(p);
      q.copy(p).project(cam); s.el.classList.toggle('side-l', q.x < 0); s.el.classList.toggle('side-r', q.x >= 0);
    }
  }
  resized() {
    if (!this.seats) return;
    this.consoleTop = null;
    if (this.stage.portrait !== this.portraitNow) { this.portraitNow = this.stage.portrait; this.reorient(); }
    else this.fitAnchors();
    this.placeSizer();
  }

  // ── per frame ──────────────────────────────────────────────────────────
  frame(dt) {
    if (!this.alive) return;
    const cam = this.stage.camera;
    this.rig.position.copy(cam.position); this.rig.quaternion.copy(cam.quaternion);
    this.field.update();
    const t = performance.now() / 1000;
    this.glowMat.opacity = this.glowOn ? .55 + .25 * Math.sin(t * 3.2) : Math.max(0, this.glowMat.opacity - dt * 3);
    const tg = this.turnGlow, act = this.seats[this.acting];
    if (act) { const c = act.cardPos[0].clone().lerp(act.cardPos[1], .5); tg.position.x = c.x; tg.position.z = c.z; tg.visible = true; tg.material.opacity = .35 + .15 * Math.sin(t * 4); }
    else tg.visible = false;
    if (this.strengthOn && this.held?.length) {
      this.rig.updateMatrixWorld();
      const top = this.rig.localToWorld(this.heldPose(0, true));
      if (Number.isFinite(top.x + top.y + top.z)) this.tag('str', top, this.strengthHTML);
    }
    this.heldFollow(dt);
    if (++this.tick % 20 === 0) this.consoleTop = null;
  }
  tick = 0;
  // where your two cards are held, in camera space: large, just above the console
  heldPose(k, labelPoint = false) {
    const st = this.stage, cam = st.camera, H = st.h, W = st.w;
    if (this.consoleTop == null) { const r = document.querySelector('#console')?.getBoundingClientRect(); this.consoleTop = r && r.height ? r.top : H - 100; }
    const port = st.portrait, tanH = Math.tan(cam.fov * Math.PI / 360);
    const pxH = port ? Math.min(H * .15, W * .34) : Math.min(H * .22, 210);
    const d = CARD.h * H / (2 * tanH * pxH), hh = d * tanH, hw = hh * cam.aspect;
    // (on phones the sizer, while open, simply overlays the lower half of the cards — the indices stay in view)
    const bottom = Math.min(this.consoleTop, H - 60);
    const cyPx = bottom - pxH * (port ? .52 : .44);
    const cxPx = port ? W * .5 : W * .5;
    const x = (cxPx / W * 2 - 1) * hw, y = -(cyPx / H * 2 - 1) * hh;
    if (labelPoint) return V(x, y + (CARD.h * .56), -d);
    const spread = CARD.w * .5, lift = this.held?.[k]?.userData.lift ? CARD.h * .09 : 0;
    return { pos: V(x + (k ? spread / 2 : -spread / 2), y + lift, -d + (k ? .0012 : 0)), quat: heldQuat(k ? -.085 : .085) };
  }

  // ── sit down / leave ───────────────────────────────────────────────────
  sitDown(first = false) {
    this.phase = 'sit'; this.seated = false;
    this.hideSizer();
    const bal = this.balance, can = STAKES.map(s => bal >= s.bb * 20);
    this.hud.bet('TAKE A SEAT', bal, 'Buy-in 100 big blinds');
    this.hud.actions(STAKES.map((s, k) => ({ id: 'stake' + k, label: `${fmtS(s.bb / 2)}/${fmtS(s.bb)}`, sub: 'BUY-IN ' + fmtS(Math.min(bal, s.bb * 100)), kind: k === this.stakeIdx ? 'primary' : 'ghost', hot: k === this.stakeIdx && can[k], disabled: !can[k], onClick: () => this.takeSeat(k) })));
    if (!can[0]) this.say('You’ll need 1,000 chips for a seat. Ace’s marker is waiting in the lobby.');
    else this.say(first ? 'Evening. Five regulars, one open seat. Pick your stakes.' : 'Pick your stakes whenever you’re ready.');
  }
  async takeSeat(k) {
    if (this.phase !== 'sit') return;
    const bb = STAKES[k].bb, buy = Math.min(this.balance, bb * 100);
    if (buy < bb * 20) { this.hud.toast(`The ${fmt(bb / 2)}/${fmt(bb)} table needs at least ${fmt(bb * 20)} chips.`); return; }
    if (!this.bank.stake(buy)) return;
    this.phase = 'seating';
    if (k !== this.stakeIdx || !this.handNo) {
      this.stakeIdx = k; this.bank.setting('heStakes', k);
      this.field.denoms = denomsFor(bb);
      this.stacks = [0, ...BOT_START.map(x => Math.round(x * 100) * bb)];
      for (const s of this.seats) { s.stack.chips = []; s.stack.amount = -1; s.stack.set(this.stacks[s.i]); if (s.i) s.elSt.textContent = fmt(this.stacks[s.i]); }
    }
    this.stacks[0] = buy; this.seated = true;
    this.hud.actions([]);
    this.say(`Welcome in. ${fmt(bb / 2)}/${fmt(bb)}, no limit — good luck.`);
    await this.chipsArrive(0, buy);
    if (!this.alive) return;
    await this.wait(.3);
    this.newHand();
  }
  async chipsArrive(i, amount) {
    const s = this.seats[i], fly = this.field.stack({ pos: this.lay.deal, style: 'bet' }).set(amount);
    this.sound.chips(5);
    const from = this.lay.deal.clone(), to = s.stackPos.clone();
    await this.tw.run(.55, (e, p) => { fly.pos.lerpVectors(from, to, e); fly.pos.y = Math.sin(p * Math.PI) * .06; fly.touch(); }, { ease: 'inOutCubic' });
    fly.dispose();
    const v = this.phase === 'hand' && this.disp ? this.disp.stack[i] : this.stacks[i];   // a blind may have gone out meanwhile
    s.stack.set(v);
    if (s.elSt && this.alive) s.elSt.textContent = fmt(v);
    this.infoBar();
  }
  leaveTable() {
    if (this.phase !== 'between' && this.phase !== 'bust') return;
    this.phase = 'leaving';
    const n = this.stacks[0];
    if (n > 0) this.bank.unstake(n);
    this.stacks[0] = 0; this.seated = false;
    const s = this.seats[0], fly = this.field.stack({ pos: s.stackPos, style: 'bet' }).set(n);
    s.stack.set(0); this.sound.chips(4);
    const from = s.stackPos.clone(), to = this.stage.camera.position.clone().multiplyScalar(.55).setY(.2);
    this.tw.run(.5, (e) => { fly.pos.lerpVectors(from, to, e); fly.touch(); }, { ease: 'inCubic' }).then(() => fly.dispose());
    if (n > 0) this.hud.toast(`<b>${fmt(n)}</b> chips back in your balance.`, 'gold');
    this.sitDown();
  }
  topUp() {
    if (this.phase !== 'between' && this.phase !== 'bust') return;
    const want = this.bb * 100 - this.stacks[0], n = Math.min(want, this.balance);
    if (this.phase === 'bust' && n < this.bb * 20) { this.hud.toast(`A rebuy needs at least ${fmt(this.bb * 20)} chips.`); return; }
    if (n <= 0 || !this.bank.stake(n)) return;
    this.stacks[0] += n;
    this.chipsArrive(0, n);
    this.hud.toast(`${this.phase === 'bust' ? 'Rebuy' : 'Topped up'}: <b>+${fmt(n)}</b> on the table.`, 'gold');
    this.between();
  }

  // ── a hand ─────────────────────────────────────────────────────────────
  async newHand() {
    if (!this.alive || !this.seated || this.stacks[0] <= 0 || this.phase === 'hand' || this.phase === 'leaving') return;
    this.phase = 'hand'; this.handNo++; this.handSettled = false; this.ff = false; this.nomore = false;
    this.hud.actions([]); this.hideSizer(); this.level = Math.max(0, Math.min(4, this.bank.setting('heLevel') ?? 1));
    const bb = this.bb;
    // regulars who went broke buy back in
    const rebought = [];
    for (let i = 1; i < 6; i++) if (this.stacks[i] < bb) { this.stacks[i] = bb * 100; rebought.push(i); }
    for (const i of rebought) { this.chipsArrive(i, bb * 100); this.seats[i].el?.classList.remove('bust'); }
    if (rebought.length) this.hud.toast(`${rebought.map(i => PLAYERS[i].name).join(' & ')} ${rebought.length > 1 ? 'rebuy' : 'rebuys'} for ${fmt(bb * 100)}.`);
    this.button = (this.button + 1) % 6;
    this.handStart = this.stacks[0];
    const p = this.p = new TablePoker([...this.stacks], bb, this.button);
    this.disp = { stack: [...this.stacks], bet: [0, 0, 0, 0, 0, 0], pot: 0 };
    this.boardObjs = []; this.handObjs = []; this.held = null; this.strengthOn = false; this.shownStreet = 0; this.burnN = 0;
    for (const s of this.seats) { s.objs = []; s.revealed = false; s.el?.classList.remove('act', 'won', 'fold', 'bust'); this.seatAct(s.i, ''); if (s.elShow) { s.elShow.className = 'he-show'; s.elShow.innerHTML = ''; } this.stackLabel(s.i); }
    this.positions();
    // the button travels
    const from = this.puck.position.clone(), to = this.seats[this.button].puckPos.clone();
    this.tw.run(.6, (e, q) => { this.puck.position.lerpVectors(from, to, e); this.puck.position.y = .004 + Math.sin(q * Math.PI) * .03; }, { ease: 'inOutCubic' });
    this.say(this.button === 0 ? 'You have the button. Blinds are in.' : `${PLAYERS[this.button].name} has the button. Blinds are in.`);
    this.infoBar();
    // blinds
    await Promise.all([this.pushBet(p.blinds.sb, p.blinds.sbPaid), this.pushBet(p.blinds.bb, p.blinds.bbPaid)]);
    this.seatAct(p.blinds.sb, 'SB ' + fmt(p.blinds.sbPaid), 'blind'); this.seatAct(p.blinds.bb, 'BB ' + fmt(p.blinds.bbPaid), 'blind');
    if (!this.alive) return;
    await this.dealHoles();
    if (!this.alive) return;
    await this.peek();
    if (!this.alive) return;
    await this.play();
  }
  positions() {
    const p = this.p;
    for (const s of this.seats) {
      if (!s.elPos) continue;
      const lab = s.i === p.button ? 'D' : s.i === p.sb ? 'SB' : s.i === p.big ? 'BB' : '';
      s.elPos.textContent = lab; s.elPos.className = 'he-pos' + (lab ? ' on' : '') + (lab && lab !== 'D' ? ' bl' : '');
    }
  }
  async dealHoles() {
    const p = this.p, jobs = [];
    this.backdrop.play('deal');
    let k = 0;
    for (let pass = 0; pass < 2; pass++) for (let j = 1; j <= 6; j++) {
      const i = (p.button + j) % 6, s = this.seats[i], c = p.cards[i][pass];
      const o = this.cards.make(c, false); this.root.add(o); s.objs.push(o); this.handObjs.push(o);
      const to = s.cardPos[pass].clone().setY(CARD.t / 2 + pass * .0008);
      o.visible = false; if (i) o.scale.setScalar(this.lay.holeScale);
      jobs.push(this.wait(k * (this.ff ? .03 : .075)).then(() => {
        if (!this.alive) return;
        o.visible = true; this.sound.card();
        return this.flyCard(o, this.deckTop(), to, { yaw: s.yaw + (pass ? -.06 : .06), dur: .34, lift: .05 });
      }));
      k++;
    }
    await Promise.all(jobs);
  }
  deckTop() { return this.lay.deal.clone().setY(.012); }
  // a card sails from `from` to `to`, face down, turning to `yaw`
  flyCard(o, from, to, { yaw = 0, dur = .34, lift = .04, faceUp = false } = {}) {
    o.position.copy(from); o.rotation.set(0, yaw + (Math.random() - .5) * .6, Math.PI);
    const y0 = o.rotation.y, jit = (Math.random() - .5) * .04;
    return this.tw.run(dur, (e, q) => {
      o.position.lerpVectors(from, to, e); o.position.y = THREE.MathUtils.lerp(from.y, to.y, e) + Math.sin(q * Math.PI) * lift;
      o.rotation.y = THREE.MathUtils.lerp(y0, yaw + jit, e);
      if (faceUp) o.rotation.z = Math.PI * (1 - Math.min(1, Math.max(0, (q - .3) / .7)));
    }, { ease: 'outCubic' }).then(() => { o.userData.faceUp = faceUp; });
  }
  // your two cards lift off the felt, corners peel, and they come up to you
  async peek() {
    const s = this.seats[0], objs = s.objs;
    this.held = objs;
    const dur = this.ff ? .5 : .95;
    this.sound.whoosh();
    await Promise.all(objs.map((o, k) => {
      const p0 = o.position.clone(), q0 = o.quaternion.clone();
      const qPeel = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -1.05).multiply(q0);
      const p1 = p0.clone().add(V(0, .045, .03));
      for (const m of o.children) { m.castShadow = false; m.material = this.heldMat; }
      const tq = new THREE.Quaternion(), tp = V(), qW = new THREE.Quaternion();
      return this.tw.run(dur, (e, q) => {
        const pose = this.heldPose(k);
        this.rig.updateMatrixWorld();
        tp.copy(pose.pos).applyMatrix4(this.rig.matrixWorld);
        qW.copy(this.rig.quaternion).multiply(pose.quat);
        if (q < .32) {
          const u = easeOut(q / .32);
          o.position.lerpVectors(p0, p1, u); o.quaternion.slerpQuaternions(q0, qPeel, u);
        } else {
          const u = easeInOut((q - .32) / .68);
          const mid = p1.clone().lerp(tp, .5).add(V(0, .06, 0));
          o.position.copy(bez(p1, mid, tp, u)); tq.slerpQuaternions(qPeel, qW, u); o.quaternion.copy(tq);
        }
        if (q > .55 && !o.userData.faceUp) { o.userData.faceUp = true; this.sound.card(); }
        this.heldMat.color.setScalar(1 - .42 * Math.min(1, q * 1.3));
      }, { delay: k * .12 }).then(() => {
        const pose = this.heldPose(k);
        this.rig.add(o); o.position.copy(pose.pos); o.quaternion.copy(pose.quat); o.userData.held = true;
      });
    }));
    this.strength();
  }
  heldFollow(dt = .016) {   // keep the held cards glued to their screen spot (console / sizer can move)
    if (!this.held) return;
    const f = 1 - Math.exp(-dt * 14);
    this.held.forEach((o, k) => { if (o.userData.held && o.parent === this.rig) { const pose = this.heldPose(k); o.position.lerp(pose.pos, f); o.quaternion.slerp(pose.quat, f); } });
  }
  strength() {
    const p = this.p, hole = p.cards[0];
    if (!this.held || p.folded[0]) { this.strengthOn = false; this.hud.unanchor('str'); return; }
    let main, sub = '';
    if (p.board.length < 3) { main = holeName(hole); }
    else { main = describe(best([...hole, ...p.board])); const d = draws(hole, p.board); if (d.length) sub = d.join(' · '); }
    this.strengthHTML = `<span class="tag gold he-str">${esc(main)}${sub ? `<small>+ ${esc(sub)}</small>` : ''}</span>`;
    this.strengthOn = true;
  }

  async play() {
    const p = this.p;
    while (this.alive && p.phase !== 'settled') {
      if (p.phase === 'runout') {
        await this.wait(this.ff ? .25 : .75); if (!this.alive) return;
        p.runoutStep();
        if (p.phase !== 'settled') await this.syncBoard();
        continue;
      }
      const i = p.actor;
      this.infoBar();
      const move = i === 0 ? await this.playerTurn() : await this.botTurn(i);
      if (!this.alive || this.p !== p) return;
      const before = { street: p.street, refunds: p.refundLog.length, phase: p.phase };
      if (!p.act(move.type, move.amount)) { const l = p.legal(); p.act(l && l.check ? 'check' : 'fold'); }
      await this.showAction(i);
      if (!this.alive) return;
      if (p.street !== before.street || p.phase !== 'play') await this.endStreet(before);
    }
    if (!this.alive) return;
    await this.finishHand();
  }
  async botTurn(i) {
    const p = this.p;
    this.seatState(i, 'act'); this.seatAct(i, 'THINKING<i></i><i></i><i></i>', 'think', true); this.acting = i;
    await this.wait(this.ff ? .02 : .12);
    if (!this.alive) return { type: 'fold' };
    const move = tableBotAction(p, this.level) || { type: p.legal()?.check ? 'check' : 'fold' };
    const big = move.type === 'raise' || (p.legal()?.call || 0) > p.bb * 8;
    await this.wait(this.ff ? .08 : move.type === 'fold' ? .28 + Math.random() * .35 : big ? .6 + Math.random() * .5 : .36 + Math.random() * .45);
    this.seatState(i, ''); this.acting = -1;
    return move;
  }
  async showAction(i) {
    const p = this.p, a = p.lastAction; if (!a) return;
    const name = PLAYERS[i].name;
    if (a.type === 'fold') {
      this.seatAct(i, 'FOLD', 'fold'); this.seatState(i, 'fold'); this.sound.whoosh();
      if (i === 0) {
        this.say('You fold.');
        this.hud.actions([{ id: 'ff', label: 'SKIP', sub: 'TO RESULT', onClick: () => { this.ff = true; this.hud.actions([]); } }]);
      }
      await this.muckSeat(i);
    } else if (a.type === 'check') {
      this.seatAct(i, 'CHECK'); this.sound.thunk(0); this.sound.thunk(.09);
      await this.wait(this.ff ? .05 : .22);
    } else {
      const allIn = a.allIn, label = allIn ? 'ALL-IN' : a.type === 'call' ? 'CALL ' + fmt(a.paid) : a.text.startsWith('Bet') ? 'BET ' + fmt(a.to) : 'RAISE ' + fmt(a.to);
      this.seatAct(i, label, allIn ? 'allin' : a.type === 'raise' ? 'raise' : '');
      if (a.type === 'raise' && i !== 0) this.say(allIn ? `${name} is all-in for ${fmt(a.to)}.` : a.text.startsWith('Bet') ? `${name} bets ${fmt(a.to)}.` : `${name} raises to ${fmt(a.to)}.`);
      if (allIn && !this.nomore) { this.nomore = true; this.backdrop.play('nomore'); this.sound.chime(1); }
      await this.pushBet(i, a.paid);
    }
    this.infoBar();
  }
  async endStreet(before) {
    const p = this.p;
    // uncalled chips go home first
    for (const r of p.refundLog.slice(before.refunds)) await this.refundBet(r.player, r.amount);
    await this.wait(this.ff ? .05 : .25);
    await this.sweepBets();
    for (const s of this.seats) if (!p.folded[s.i] && p.stacks[s.i] > 0 && p.phase === 'play') this.seatAct(s.i, '');
    if (p.phase === 'runout' || (p.phase === 'settled' && p.reason === 'Showdown' && p.alive().length > 1 && p.board.length < 5)) await this.revealAll(true);
    if (p.phase !== 'settled' || p.reason === 'Showdown') await this.syncBoard();
  }
  async syncBoard() {
    const p = this.p;
    while (this.alive && this.boardObjs.length < p.board.length) {
      const k0 = this.boardObjs.length, n = k0 === 0 ? 3 : 1;
      if (k0 === 0 && !this.ff) this.backdrop.play('deal');       // Ace reaches in for the flop
      // burn one
      const burn = this.cards.make(p.burned[this.burnN] || null, false); this.root.add(burn); this.handObjs.push(burn); this.burnObjs.push(burn);
      const bto = this.lay.burn.clone().setY(CARD.t / 2 + this.burnN * .0008); this.burnN++;
      this.sound.card();
      await this.flyCard(burn, this.deckTop(), bto, { yaw: .25 + Math.random() * .2, dur: this.ff ? .15 : .26, lift: .02 });
      if (!this.alive) return;
      const objs = [];
      for (let j = 0; j < n; j++) {
        const k = k0 + j, c = p.board[k], o = this.cards.make(c, false); this.root.add(o); this.boardObjs.push(o); this.handObjs.push(o); objs.push(o);
        const to = this.lay.board(k); o.scale.setScalar(this.lay.boardScale);
        this.sound.card(.02);
        await this.flyCard(o, this.deckTop(), to, { yaw: 0, dur: this.ff ? .16 : .3, lift: .03 });
        o.rotation.y = 0;
        if (!this.alive) return;
      }
      if (!this.ff) await this.wait(.08);
      for (const [j, o] of objs.entries()) { this.sound.card(); await flipCard(this.tw, o, { dur: this.ff ? .16 : .3, lift: .03 }); if (!this.ff && j < objs.length - 1) await this.wait(.03); }
      const st = p.board.length >= 5 && k0 === 4 ? 'river' : k0 === 3 ? 'turn' : 'flop';
      this.say(st === 'flop' ? `The flop: ${p.board.slice(0, 3).map(c => rankLabel(c)).join(', ')}.` : `The ${st}: ${cardWords(p.board[k0])}.`);
      this.strength();
      if (!this.ff) await this.wait(.25);
    }
  }

  // ── chips on the move ──────────────────────────────────────────────────
  async pushBet(i, amount) {
    if (!(amount > 0)) return;
    const s = this.seats[i];
    this.disp.stack[i] -= amount; s.stack.set(Math.max(0, this.disp.stack[i])); this.stackLabel(i);
    const fly = this.field.stack({ pos: s.stackPos, yaw: s.yaw, style: 'bet' }).set(amount);
    const from = s.stackPos.clone(), to = s.betPos.clone().setY(s.bet.amount ? s.bet.height : 0);
    this.sound.chips(Math.min(6, 2 + Math.floor(fly.chips.length / 3)));
    await this.tw.run(this.ff ? .18 : .34, (e, q) => { fly.pos.lerpVectors(from, to, e); fly.pos.y += Math.sin(q * Math.PI) * .045; fly.touch(); }, { ease: 'outCubic' });
    fly.dispose();
    this.disp.bet[i] += amount; s.bet.set(this.disp.bet[i]); this.betTag(i);
  }
  async refundBet(i, amount) {
    const s = this.seats[i];
    this.disp.bet[i] -= amount; s.bet.set(this.disp.bet[i]); this.betTag(i);
    const fly = this.field.stack({ pos: s.betPos, yaw: s.yaw, style: 'bet' }).set(amount);
    const from = s.betPos.clone(), to = s.stackPos.clone();
    await this.tw.run(this.ff ? .15 : .3, e => { fly.pos.lerpVectors(from, to, e); fly.touch(); }, { ease: 'inOutCubic' });
    fly.dispose();
    this.disp.stack[i] += amount; s.stack.set(this.disp.stack[i]); this.stackLabel(i);
  }
  async sweepBets() {
    const moves = [];
    for (const s of this.seats) {
      const amt = this.disp.bet[s.i]; if (amt <= 0) continue;
      const st = s.bet, from = s.betPos.clone(), to = this.lay.pot.clone().add(V((Math.random() - .5) * .03, 0, (Math.random() - .5) * .03));
      this.hud.unanchor('bet' + s.i);
      moves.push(this.tw.run(this.ff ? .2 : .42, (e, q) => { st.pos.lerpVectors(from, to, e); st.pos.y = Math.sin(q * Math.PI) * .03; st.touch(); }, { ease: 'inOutCubic', delay: s.i * .025 }).then(() => {
        this.disp.pot += amt; this.disp.bet[s.i] = 0; st.set(0); st.moveTo(s.betPos); this.potStack.set(this.disp.pot); this.potTag();
      }));
    }
    if (moves.length) this.sound.chips(6);
    await Promise.all(moves);
  }
  async pushPot(amount, i, { dur = .6 } = {}) {
    if (amount <= 0) return;
    const s = this.seats[i];
    this.disp.pot -= amount; this.potStack.set(Math.max(0, this.disp.pot)); this.potTag();
    const fly = this.field.stack({ pos: this.lay.pot, style: 'pot' }).set(amount);
    const from = this.lay.pot.clone(), to = s.stackPos.clone();
    this.sound.chips(7);
    await this.tw.run(this.ff ? .3 : dur, (e, q) => { fly.pos.lerpVectors(from, to, e); fly.pos.y = Math.sin(q * Math.PI) * .07; fly.touch(); }, { ease: 'inOutCubic' });
    fly.dispose();
    this.disp.stack[i] += amount; s.stack.set(this.disp.stack[i]); this.stackLabel(i); this.infoBar();
    floatText(this.hud, s.stackPos.clone().setY(.06), '+' + fmt(amount), 'plus');
  }

  // ── cards on the move ──────────────────────────────────────────────────
  async muckSeat(i) {
    const s = this.seats[i], objs = s.objs.filter(o => o.parent);
    if (i === 0) { this.strengthOn = false; this.hud.unanchor('str'); this.held = null; }
    await Promise.all(objs.map((o, k) => {
      this.root.attach(o); o.userData.held = false; o.userData.mucked = true; this.muckObjs.push(o);
      for (const m of o.children) m.material = this.cards.mat;
      const from = o.position.clone(), q0 = o.quaternion.clone(), to = this.lay.muck.clone().setY(.002 + (this.muckObjs.length % 12) * .0006);
      const qEnd = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .5 + Math.random() * .6, Math.PI));
      return this.tw.run(this.ff ? .22 : .42, (e, q) => { o.position.lerpVectors(from, to, e); o.position.y += Math.sin(q * Math.PI) * .03; o.quaternion.slerpQuaternions(q0, qEnd, e); }, { ease: 'inOutCubic', delay: k * .05 })
        .then(() => { o.userData.faceUp = false; });
    }));
  }
  async revealAll(allIn = false) {
    const p = this.p, order = [];
    for (let j = 1; j <= 6; j++) { const i = (p.button + j) % 6; if (!p.folded[i]) order.push(i); }
    if (allIn) this.say('All in. Cards on their backs.');
    for (const i of order) {
      const s = this.seats[i]; if (s.revealed) continue;
      s.revealed = true;
      if (i === 0) continue;             // yours stay up in your hand, large and readable
      this.sound.card();
      await Promise.all(s.objs.map((o, k) => this.wait(k * .06).then(() => flipCard(this.tw, o, { dur: this.ff ? .18 : .32, lift: .035 }))));
      if (s.elShow) { s.elShow.innerHTML = p.cards[i].map(c => `<img src="${cardImg(c, 60)}" alt="">`).join(''); s.elShow.className = 'he-show on'; }
      if (!this.ff) await this.wait(.12);
    }
  }
  highlight(cards) {
    this.clearHighlight();
    const all = [...this.boardObjs, ...this.seats.flatMap(s => s.objs)].filter(o => (o.parent === this.root || o.parent === this.rig) && o.userData.faceUp);
    for (const o of all) {
      const win = cards.includes(o.userData.card);
      if (win && o.parent === this.rig) {
        const g = new THREE.Mesh(this.glowGeo, this.glowMat); g.rotation.x = -Math.PI / 2; g.position.y = -.002;
        o.add(g); this.fx.push(g); o.userData.lift = 1;
      } else if (win) {
        const g = new THREE.Mesh(this.glowGeo, this.glowMat); g.rotation.x = -Math.PI / 2; g.rotation.z = o.rotation.y; g.scale.setScalar(o.scale.x);
        g.position.set(o.position.x, .0015, o.position.z); this.root.add(g); this.fx.push(g);
        const y0 = o.position.y; o.userData.y0 = y0;
        this.tw.run(.3, e => { o.position.y = y0 + e * .014; }, { ease: 'outBack' });
      } else {
        const d = new THREE.Mesh(this.cards.shape, this.dimMat); d.rotation.x = -Math.PI / 2; d.position.y = CARD.t / 2 + .0003;
        o.add(d); this.fx.push(d);
      }
    }
    this.glowOn = true;
  }
  clearHighlight() {
    for (const m of this.fx) m.parent?.remove(m);
    this.fx = []; this.glowOn = false;
    for (const o of this.held || []) o.userData.lift = 0;
    for (const o of this.handObjs) if (o.userData.y0 != null) { o.position.y = o.userData.y0; o.userData.y0 = null; }
  }

  // ── your turn ──────────────────────────────────────────────────────────
  playerTurn() {
    const p = this.p, l = p.legal(0);
    return new Promise(res => {
      this.turn = { res, l };
      const owed = l.call, pot = p.pot;
      this.sound.tone(988, { d: .18, vol: .045, verb: .3 }); this.sound.tone(1318, { t: .08, d: .25, vol: .035, verb: .3 });
      this.say(l.check ? (p.street === 0 ? 'Your option.' : 'Check to you.') : `${fmt(owed)} to call${owed >= p.stacks[0] ? ' — that’s all your chips' : ''}.`);
      if (l.canRaise) {
        this.raise = { min: l.shortRaise ? l.maxRaise : l.minRaise, max: l.maxRaise, step: Math.max(1, p.bb / 2), cur: p.current, owed, pot, bet: p.current === 0 };
        const def = this.raise.bet ? (p.street === 0 ? p.bb * 3 : Math.round(pot * .5)) : (p.street === 0 ? p.current * 3 : p.current + Math.round((pot + owed) * .6));
        this.setRaise(this.snap(def));
        if (!this.compact) this.showSizer();
      } else { this.raise = null; this.hideSizer(); }
      this.turnButtons();
    });
  }
  turnButtons() {
    const t = this.turn; if (!t) return;
    const { l } = t, p = this.p, r = this.raise;
    const callAll = !l.check && l.call >= p.stacks[0];
    const btns = [
      { id: 'fold', label: 'FOLD', kind: 'danger', key: 'F', onClick: () => this.decide({ type: 'fold' }) },
      l.check ? { id: 'call', label: 'CHECK', key: 'C', onClick: () => this.decide({ type: 'check' }) }
        : { id: 'call', label: callAll ? 'ALL-IN' : 'CALL', sub: fmt(l.call), key: 'C', onClick: () => this.decide({ type: 'call' }) }
    ];
    if (r) {
      // phones: the first tap opens the sizer, the second one bets
      const all = r.amt >= r.max, closed = this.compact && !this.sizerEl.classList.contains('on');
      btns.push({ id: 'raise', label: closed ? (r.bet ? 'BET' : 'RAISE') : all ? 'ALL-IN' : r.bet ? 'BET' : 'RAISE TO', sub: closed ? fmt(r.amt) + ' ▴' : fmt(r.amt), kind: 'primary', key: 'R',
        onClick: () => closed ? (this.showSizer(), this.turnButtons()) : this.decide({ type: 'raise', amount: r.amt }) });
    }
    this.hud.actions(btns);
  }
  decide(move) {
    const t = this.turn; if (!t) return;
    this.turn = null; this.hideSizer(); this.hud.actions([]);
    t.res(move);
  }
  press(id) {
    if (id === 'deal') { if (this.phase === 'between') this.newHand(); return; }
    const btn = document.querySelector(`#actions .act[data-id="${id}"]:not(:disabled)`); btn?.click();
  }
  // ── the sizer ──
  makeSizer() {
    const el = document.createElement('div'); el.id = 'he-sizer';
    el.innerHTML = `<div class="he-q"><button data-q="min">MIN</button><button data-q="half">½ POT</button><button data-q="pot3">¾ POT</button><button data-q="pot">POT</button><button data-q="all">ALL-IN</button></div>
      <div class="he-sl"><button class="he-step" data-d="-1" aria-label="Less">−</button><input type="range" min="0" max="1000" value="0" aria-label="Bet size"><button class="he-step" data-d="1" aria-label="More">+</button><div class="he-amt"><small>RAISE TO</small><b>0</b></div></div>`;
    document.querySelector('#app').append(el);
    this.sizerEl = el; this.slider = el.querySelector('input'); this.amtEl = el.querySelector('.he-amt b'); this.amtLab = el.querySelector('.he-amt small');
    el.querySelectorAll('[data-q]').forEach(b => b.onclick = e => { e.stopPropagation(); this.sound.click(); this.preset(b.dataset.q); });
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = e => { e.stopPropagation(); this.sound.click(); this.nudge(+b.dataset.d); });
    this.slider.oninput = () => { const r = this.raise; if (!r) return; const u = this.slider.value / 1000; this.setRaise(this.snap(r.min + (r.max - r.min) * u * u), true); };
    el.addEventListener('pointerdown', e => e.stopPropagation());
  }
  placeSizer() {
    if (!this.sizerEl) return;
    const c = document.querySelector('#console')?.getBoundingClientRect(), H = this.stage.h;
    const port = innerWidth <= 860;
    let b = c && c.height ? H - c.top + 6 : 100;
    if (!port) { const a = document.querySelector('#actions')?.getBoundingClientRect(); if (a && a.height) b = H - a.top + 10; }
    this.sizerEl.style.setProperty('--he-b', b + 'px');
  }
  showSizer() { this.placeSizer(); this.sizerEl.classList.add('on'); this.consoleTop = null; }
  hideSizer() { this.sizerEl?.classList.remove('on'); this.consoleTop = null; }
  snap(v) {
    const r = this.raise; if (!r) return 0;
    if (v >= r.max) return r.max;
    v = Math.round(v / r.step) * r.step;
    return Math.max(r.min, Math.min(r.max, v));
  }
  setRaise(v, fromSlider = false) {
    const r = this.raise; if (!r) return;
    r.amt = v;
    const u = r.max > r.min ? Math.sqrt((v - r.min) / (r.max - r.min)) : 1;
    if (!fromSlider) this.slider.value = Math.round(u * 1000);
    this.slider.style.setProperty('--p', (u * 100).toFixed(1) + '%');
    this.amtEl.textContent = fmt(v); this.amtLab.textContent = v >= r.max ? 'ALL-IN' : r.bet ? 'BET' : 'RAISE TO';
    const pre = this.presets();
    this.sizerEl.querySelectorAll('[data-q]').forEach(b => { const x = pre[b.dataset.q]; b.disabled = x == null; b.classList.toggle('on', x === v); });
    this.turnButtons();
  }
  presets() {
    const r = this.raise; if (!r) return {};
    const pot = r.pot + r.owed, at = f => { const v = this.snap(r.cur + pot * f); return v; };
    const out = { min: r.min, half: at(.5), pot3: at(.75), pot: at(1), all: r.max };
    if (r.min >= r.max) { out.half = out.pot3 = out.pot = null; }
    return out;
  }
  preset(q) { if (!this.raise) return; const v = this.presets()[q]; if (v != null) this.setRaise(v); }
  nudge(d) { const r = this.raise; if (!r) return; this.setRaise(this.snap((r.amt >= r.max && d > 0) ? r.max : r.amt + d * this.bb)); }

  // ── the end of a hand ──────────────────────────────────────────────────
  async finishHand() {
    const p = this.p, bb = this.bb;
    this.hud.actions([]); this.hideSizer();
    const showdown = p.reason === 'Showdown', mine = showdown && !p.folded[0];
    if (showdown) {
      if (this.lay.showdownShot) {   // crane up over the board at the same distance: a bigger board, every seat still in frame
        const v = this.stage.resolveView(VIEW), off = v.pos.clone().sub(v.look), d = off.length(), pitch = Math.asin(off.y / d) + .13;
        const pos = v.look.clone().add(V(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(d * .97));
        this.stage.shot({ pos: pos.toArray(), look: v.look.toArray(), fov: v.fov }, .9);
      }
      await this.revealAll(false);
      if (!this.alive) return;
      for (const i of p.alive()) if (i !== 0) this.seatAct(i, shortName(p.ranks[i]), 'hand lose');
      await this.wait(this.ff ? .1 : .35);
      for (const [k, pot] of p.pots.entries()) {
        if (!this.alive) return;
        const label = p.pots.length > 1 ? (k === 0 ? 'Main pot' : p.pots.length > 2 ? `Side pot ${k}` : 'Side pot') : '';
        const w = pot.winners, rank = p.ranks[w[0]];
        const contested = pot.eligible.length > 1;
        if (contested) {
          const five = new Set(w.flatMap(i => bestHand([...p.cards[i], ...p.board]).cards));
          this.highlight([...five]);
        }
        for (const i of w) { this.seatState(i, 'won'); if (i && contested) this.seatAct(i, shortName(p.ranks[i]), 'hand'); }
        const names = w.map(i => i === 0 ? 'You' : PLAYERS[i].name);
        const who = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0];
        const hand = w.length > 1 ? `split — ${withArticle(rank)}` : `${w[0] === 0 ? 'win' : 'wins'} with ${withArticle(rank)}`;
        this.say(label ? `${label}: ${who}${contested ? ' ' + hand.replace(/^wins? with /, '— ').replace(/^split/, 'split') : ''}.` : `${who} ${hand}.`);
        if (contested && w.includes(0) && this.held) { this.strengthHTML = `<span class="tag win he-str">${esc(describe(rank))}</span>`; this.strengthOn = true; }
        await this.wait(this.ff ? .2 : .75);
        await Promise.all(w.map((i, j) => this.pushPot(pot.shares[j], i)));
        await this.wait(this.ff ? .1 : .45);
        if (k < p.pots.length - 1) { this.clearHighlight(); for (const i of w) this.seatState(i, ''); }
      }
    } else {
      const w = p.winners[0];
      this.seatState(w, 'won');
      this.say(w === 0 ? 'Everyone folds. The pot is yours.' : `${PLAYERS[w].name} takes it down.`);
      await this.wait(this.ff ? .1 : .3);
      await this.pushPot(this.disp.pot, w);
    }
    if (!this.alive) return;
    // books
    this.settleBank();
    for (const s of this.seats) { s.stack.set(this.stacks[s.i]); this.disp.stack[s.i] = this.stacks[s.i]; this.stackLabel(s.i); }
    const net = p.stacks[0] - this.handStart, won = p.awards[0] > 0 && net > 0;
    const rank = mine ? p.ranks[0][0] : -1;
    this.emit('hand', { won, showdown: mine, rank, net });
    // Ace and the banner (phones get the short hand name so the banner stays compact)
    const winners = p.winners.filter(i => i !== 0).map(i => PLAYERS[i].name);
    const hn = r => upper(this.stage.w < 520 ? shortName(r) : describe(r));
    const bigPot = p.wonPot >= bb * 40;
    let banner;
    if (net > 0) {
      this.sound.play('win', { vol: .6 }); this.sound.chime(bigPot ? 3 : 2);
      if (bigPot) this.sound.fanfare();
      this.backdrop.play(bigPot ? 'big' : 'win');
      banner = { title: p.winners.length > 1 && p.pots.every(x => x.winners.length > 1) ? 'Split pot' : bigPot ? 'Big pot!' : 'You win', amount: net, kind: bigPot ? 'big' : 'win', sub: mine ? hn(p.ranks[0]) : 'UNCONTESTED' };
    } else if (mine) {
      const lost = -net;
      if (lost >= bb * 20) { this.backdrop.play('lose'); this.sound.lose(); }
      banner = net === 0 ? { title: 'Split pot', kind: 'push', sub: hn(p.ranks[0]) } : { title: `${winners.join(' & ') || 'The table'} ${winners.length > 1 ? 'win' : 'wins'}`, amount: net, kind: 'lose', sub: hn(p.ranks[p.winners.find(i => i !== 0) ?? 0]) };
    } else {
      banner = { title: `${winners.join(' & ')} ${winners.length > 1 ? 'win' : 'wins'}`, kind: 'push', sub: showdown ? hn(p.ranks[p.winners[0]]) : 'UNCONTESTED', hold: .9 };
    }
    this.banner = this.hud.banner({ hold: 1.35, ...banner });
    await this.wait(this.ff ? .5 : 1.1);
    if (!this.alive) return;
    if (showdown && this.lay.showdownShot) this.stage.back(.8);
    await this.clearTable();
    if (!this.alive) return;
    // regulars who busted
    for (let i = 1; i < 6; i++) if (this.stacks[i] <= 0) { this.seats[i].el?.classList.add('bust'); this.seatAct(i, 'REBUYING', 'fold'); }
    this.between();
  }
  // One hand = one settle: the stack comes off the felt with the result
  // (stats + the weekly peak see balance + stack) and goes straight back on,
  // so bank.inPlay == your table stack. The balance itself doesn't move, so
  // the two notifications are folded into one — no flash in the top bar.
  settleBank() {
    if (this.handSettled || !this.p) return;
    this.bank.settleStack(this.handStart, this.p.stacks[0], 'holdem');
    this.stacks = [...this.p.stacks];
    this.handSettled = true;
  }
  async clearTable() {
    this.clearHighlight();
    this.hud.unanchor('str'); this.strengthOn = false;
    for (let i = 0; i < 6; i++) this.hud.unanchor('bet' + i);
    const objs = this.handObjs.filter(o => o.parent);
    const to = this.lay.deal.clone().setY(.01);
    await Promise.all(objs.map((o, k) => {
      if (o.parent !== this.root) this.root.attach(o);
      const from = o.position.clone(), q0 = o.quaternion.clone(), qEnd = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI));
      return this.tw.run(this.ff ? .25 : .45, (e, q) => { o.position.lerpVectors(from, to, e); o.position.y += Math.sin(q * Math.PI) * .03; o.quaternion.slerpQuaternions(q0, qEnd, e); }, { ease: 'inOutCubic', delay: Math.min(.3, k * .015) });
    }));
    for (const o of objs) o.parent?.remove(o);
    this.handObjs = []; this.boardObjs = []; this.burnObjs = []; this.muckObjs = []; this.held = null;
    for (const s of this.seats) { s.objs = []; s.revealed = false; s.el?.classList.remove('act', 'won', 'fold'); if (this.stacks[s.i] > 0) this.seatAct(s.i, ''); if (s.elShow) { s.elShow.className = 'he-show'; s.elShow.innerHTML = ''; } }
    this.potStack.set(0); this.hud.unanchor('pot');
    this.disp.pot = 0;
  }
  between() {
    if (!this.alive) return;
    this.hideSizer();
    const bb = this.bb, st = this.stacks[0];
    this.phase = st <= 0 ? 'bust' : 'between';
    this.infoBar();
    if (st <= 0) {
      const can = Math.min(this.balance, bb * 100) >= bb * 20;
      this.say(can ? 'That’s the stack. Rebuy and go again?' : 'That’s the stack — and the balance is short for a rebuy here.');
      this.hud.actions([
        { id: 'leave', label: 'LEAVE TABLE', onClick: () => this.leaveTable() },
        { id: 'topup', label: 'REBUY', sub: fmt(Math.min(this.balance, bb * 100)), kind: 'primary', hot: can, disabled: !can, onClick: () => this.topUp() }
      ]);
      return;
    }
    const want = Math.min(bb * 100 - st, this.balance);
    const deal = { id: 'deal', label: 'DEAL', sub: 'NEXT HAND', kind: 'primary', hot: true, key: '␣', onClick: () => this.newHand() };
    this.hud.actions([
      { id: 'leave', label: 'LEAVE', sub: 'TABLE', onClick: () => this.leaveTable() },
      { id: 'topup', label: 'TOP UP', sub: want > 0 ? '+' + fmt(want) : 'FULL', disabled: want <= 0, onClick: () => this.topUp() },
      deal
    ]);
    // brisk: the next hand deals itself unless you're reading the rules
    const token = this.betweenToken = {};
    (async () => {
      for (let t = 0; t < 26; t++) {
        await this.wait(.1);
        if (!this.alive || this.phase !== 'between' || this.betweenToken !== token) return;
        if (document.querySelector('.sheet.on')) t = Math.min(t, 10);
      }
      if (this.phase === 'between' && this.betweenToken === token) this.newHand();
    })();
  }

  // ── labels ─────────────────────────────────────────────────────────────
  say(t) { if (this.alive) this.hud.say(t); }
  // anchored label that is placed the moment it is created (no one-frame flash at the corner)
  tag(id, world, html, cls = '') {
    if (!this.alive) return;
    const fresh = !this.hud.anchors.has(id);
    this.hud.anchor(id, world, html, cls);
    if (fresh) this.hud.placeAnchors();
  }
  infoBar() {
    if (!this.alive) return;
    const p = this.p, st = this.phase === 'hand' && this.disp ? this.disp.stack[0] : this.stacks[0];
    const blinds = `${fmt(this.bb / 2)}/${fmt(this.bb)}`;
    if (this.phase === 'hand' && p) {
      const pot = this.disp.pot + this.disp.bet.reduce((a, b) => a + b, 0);
      const pos = p.button === 0 ? ' · Button' : p.sb === 0 ? ' · Small blind' : p.big === 0 ? ' · Big blind' : '';
      this.hud.bet('POT', pot, `<span class="he-info">Stack <b>${fmt(Math.max(0, st))}</b>${pos}</span>`);
    } else if (this.seated) this.hud.bet('YOUR STACK', st, `<span class="he-info">Blinds ${blinds} · ${esc(LEVELS[this.level].name)}</span>`);
  }
  stackLabel(i) { if (!this.alive || !this.disp) return; const s = this.seats[i]; if (s.elSt) s.elSt.textContent = fmt(Math.max(0, this.disp.stack[i])); if (i === 0) this.infoBar(); }
  betTag(i) {
    if (!this.alive) return;
    const s = this.seats[i], amt = this.disp.bet[i];
    if (amt > 0) this.tag('bet' + i, s.betPos.clone().setY(s.bet.height + .018), `<span class="tag he-bet">${fmt(amt)}</span>`);
    else this.hud.unanchor('bet' + i);
    this.infoBar();
  }
  potTag() {
    if (!this.alive) return;
    const amt = this.disp.pot;
    if (amt > 0) this.tag('pot', this.lay.pot.clone().add(V(0, this.potStack.height + .03, 0)), `<span class="tag he-pot">POT<b>${fmt(amt + this.disp.bet.reduce((a, b) => a + b, 0))}</b></span>`);
    else this.hud.unanchor('pot');
  }
  seatState(i, st) {       // 'act' (their turn), 'fold' (sticks for the hand), 'won', '' (clear turn/won)
    const el = this.seats[i]?.el; if (!el || !this.alive) return;
    el.classList.toggle('act', st === 'act'); el.classList.toggle('won', st === 'won');
    if (st === 'fold') el.classList.add('fold');
  }
  seatAct(i, html, cls = '', raw = false) {
    const s = this.seats[i]; if (!s?.elAc || !this.alive) return;
    s.elAc.innerHTML = html ? `<span class="${cls}">${raw ? html : esc(html)}</span>` : '';
  }

  // ── help & settings ────────────────────────────────────────────────────
  help() { return helpHTML({ level: this.level, stakes: STAKES }); }
  docClick(e) {
    const b = e.target.closest?.('#he-level [data-lv]'); if (!b) return;
    this.level = +b.dataset.lv; this.bank.setting('heLevel', this.level);
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    const h = b.closest('.sheet-card')?.querySelector('#he-level')?.previousElementSibling; if (h) h.textContent = 'OPPONENTS · ' + upper(LEVELS[this.level].name);
    this.infoBar();
  }

  // ── leaving mid-hand: check or fold for the player, finish the hand, cash out ──
  finishSilently() {
    const p = this.p; if (!p || this.handSettled) return;
    let guard = 0;
    while (p.phase !== 'settled' && guard++ < 300) {
      if (p.phase === 'runout') { p.runoutStep(); continue; }
      if (p.actor === 0) { const l = p.legal(0); p.act(l.check ? 'check' : 'fold'); continue; }
      const m = tableBotAction(p, 0) || { type: p.legal()?.check ? 'check' : 'fold' };
      if (!p.act(m.type, m.amount)) p.act(p.legal()?.check ? 'check' : 'fold');
    }
    if (p.phase === 'settled') {
      this.settleBank();
      const mine = p.reason === 'Showdown' && !p.folded[0], net = p.stacks[0] - this.handStart;
      this.emit('hand', { won: p.awards[0] > 0 && net > 0, showdown: mine, rank: mine ? p.ranks[0][0] : -1, net });
    }
  }
  dispose() {
    this.offFrame?.();
    if (this.seated) {
      if (this.phase === 'hand') this.finishSilently();
      if (this.stacks[0] > 0) this.bank.unstake(this.stacks[0]);
      this.stacks[0] = 0; this.seated = false;
    }
    document.removeEventListener('click', this.onDoc);
    this.css?.remove(); this.sizerEl?.remove();
    this.puck?.geometry.dispose(); [].concat(this.puck?.material || []).forEach(m => { m.map?.dispose(); m.dispose(); });
    this.field?.dispose();
    this.turnGlow?.geometry.dispose(); this.turnGlow?.material.map?.dispose(); this.turnGlow?.material.dispose();
    this.glowGeo?.dispose(); this.glowMat?.map?.dispose(); this.glowMat?.dispose(); this.dimMat?.dispose(); this.heldMat?.dispose();
    const k = this.keySave, key = this.stage.key;
    if (k) { key.position.copy(k.pos); key.target.position.copy(k.tgt); key.angle = k.angle; key.distance = k.dist; }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────
function rand6() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % 6; }
const fmtS = n => n >= 1000 && n % 1000 === 0 ? n / 1000 + 'K' : fmt(n);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const bez = (a, b, c, t) => V().addScaledVector(a, (1 - t) * (1 - t)).addScaledVector(b, 2 * (1 - t) * t).addScaledVector(c, t * t);
const rankLabel = c => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.r] || String(c.r)) + '♠♥♦♣'[c.s];
const withArticle = r => { const d = describe(r), l = d.charAt(0).toLowerCase() + d.slice(1); return [0, 2, 3, 7].includes(r[0]) ? l : 'a ' + l; };
const _qx = new THREE.Quaternion(), _qz = new THREE.Quaternion(), _X = V(1, 0, 0), _Z = V(0, 0, 1);
function heldQuat(fan) {
  _qx.setFromAxisAngle(_X, Math.PI / 2 - .2);
  _qz.setFromAxisAngle(_Z, fan);
  return _qz.clone().multiply(_qx);
}
