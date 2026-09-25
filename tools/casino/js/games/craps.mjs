// CRAPS — you are the shooter. Standard Vegas rules (js/rules/craps.mjs), a deep
// pyramid-walled table (craps-layout.mjs) and a physically simulated throw
// (craps-dice.mjs). Ace works the stick from behind the far rail.
import * as THREE from '../vendor/three.min.mjs';
import { Game } from './base.mjs';
import { buildTable } from '../core/tables.mjs';
import { ChipPile, makeDie, makePuck, DIE } from '../core/props.mjs';
import { rand } from '../core/rng.mjs';
import { fmt, floatText, esc } from '../core/hud.mjs';
import { diceFaceCanvas } from '../core/textures.mjs';
import {
  MIN, MAX, PROP_MAX, POINTS, CrapsLedger, betLimit, oddsKeyFor, niceOdds, stickCall, betName, parseKey, isOdds, working,
  PLACE_PAYS, HARD_PAYS, PROPS, FIELD_PAYS, EDGES
} from '../rules/craps.mjs';
import {
  TABLE, Z0, Z1, WALL_T, RAIL_TOP, FELT, AREAS, pilePos, PUCK_OFF, puckOn, DEALER, STICK, RELEASE,
  paintFelt, buildTub, glowArea, hitArea, makeStick
} from './craps-layout.mjs';
import { planThrow, samplePlan } from './craps-dice.mjs';

// A long lens from well back keeps a 3 m table square to the eye (little keystone),
// with Ace's face clear of the top bar and the console. Portrait phones frame the
// core of the layout; the PROPS view pans to the proposition box and Don't Come.
const PORTRAIT_X = .3, PROPS_X = -.93;
const VIEW = {
  landscape: { pos: [0, 3.0, 3.2], look: [0, 0, -.45], fov: 23, fitWidth: 3.42, maxFov: 40 },
  portrait: { pos: [PORTRAIT_X, 3.3, 1.75], look: [PORTRAIT_X, 0, -.08], fov: 40, fitWidth: 1.74, maxFov: 75 }
};
const PROPS_VIEW = {
  landscape: VIEW.landscape,
  portrait: { pos: [PROPS_X, 3.1, 1.7], look: [PROPS_X, 0, -.1], fov: 36, fitWidth: 1.12, maxFov: 75 }
};
const HD = DIE / 2;
const an = n => (n === 8 || n === 11 ? 'an ' : 'a ') + n;
let SAVED = null;                                   // the layout survives a trip to the lobby
const diceURL = new Map();
const dieImg = n => { if (!diceURL.has(n)) diceURL.set(n, diceFaceCanvas(n).toDataURL('image/png')); return diceURL.get(n); };

export default class Craps extends Game {
  static id = 'craps';

  async enter(first) {
    const { stage } = this;
    try { await Promise.all(['italic 600 80px "Bodoni Moda"', '700 80px "Bodoni Moda"', '800 40px Archivo'].map(f => document.fonts.load(f))); } catch {}
    if (!this.alive) return;
    this.injectDom();
    this.backdrop.setRoom('dealer');
    this.placeBackdrop();
    this.table = buildTable(stage, { outline: TABLE, railRadius: .011, apron: .04, felt: { color: FELT, size: [stage.tier === 'high' ? 3072 : 2048], paint: (c, P, S) => paintFelt(c, P, S) } });
    buildTub(stage, this.table.group);
    // real baize is dead matte: no broad specular lobe when the camera looks straight down under the lights
    const fm = this.table.felt.material;
    if (fm.isMeshPhysicalMaterial) { fm.roughnessMap = null; fm.roughness = 1; fm.specularIntensity = .08; fm.sheen = .22; fm.sheenColor.set('#27477f'); fm.sheenRoughness = .9; fm.bumpScale = .25; fm.needsUpdate = true; }
    this.lightUp();

    // the puck
    this.puck = makePuck('OFF', { r: .038, face: '#111216', ink: '#f4efe3' });
    this.puck.userData.ownGeo = this.puck.userData.ownMat = true;
    this.root.add(this.puck);
    // Ace's stick
    this.stick = makeStick(stage); this.root.add(this.stick);
    // the dice
    this.dice = [makeDie(), makeDie()];
    for (const d of this.dice) { d.userData.ownGeo = true; d.castShadow = true; this.root.add(d); }
    this.stickSpot().forEach((p, i) => { this.dice[i].position.copy(p); this.dice[i].quaternion.copy(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i ? .5 : -.3, 0))); });

    // money & state (a layout left behind on the way to the lobby is still working)
    this.working = this.bank.setting('crapsWorking') === true;
    const saved = SAVED && this.bank.s.inPlay >= Object.values(SAVED.bets).reduce((a, b) => a + b, 0) ? SAVED : null;
    SAVED = null;
    this.ledger = new CrapsLedger(this.bank, { bets: saved?.bets || {}, point: saved?.point ?? null, opts: { working: this.working } });
    this.history = saved?.history || [];
    this.lastBets = saved?.lastBets || null;
    this.rolls = saved?.rolls || 0;
    this.piles = new Map();
    this.syncPiles();
    this.placePuck(false);

    // bet areas, glows
    this.targets = [];
    this.glows = {};
    for (const [key, rects] of Object.entries(AREAS)) {
      this.targets.push(...hitArea(this.root, rects, { bet: key }));
      this.glows[key] = { g: glowArea(this.root, rects, key === 'dp' || key === 'dc' || key === 'anySeven' || key === 'anyCraps' ? 0xffb0a0 : 0xf3d58a), flash: 0, hover: 0 };
    }
    this.oddsTargets = [];

    this.onTap(e => this.tap(e));
    this.onHover(() => this.phase === 'bet' ? [...this.oddsTargets, ...this.targets] : [], h => { this.hoverKey = h ? this.tapKey(h.object.userData.bet) : null; });
    this.swipe();
    this.key({ ' ': () => this.roll(), enter: () => this.roll(), o: () => this.maxOdds(), c: () => this.clearBets(), r: () => this.rebet() });
    this.hud.rack(this.rackFor(MIN), () => this.renderUI());
    const tick = dt => this.frame(dt);
    tick.onResize = () => this.alive && this.placeBackdrop();
    this.offFrame = stage.onFrame(tick);
    this.view = 'main';
    await stage.applyView(VIEW, first ? 0 : 1.2);
    if (!this.alive) return;
    this.idle(null, !!saved);
    if (!this.bank.setting('crapsIntro')) { this.bank.setting('crapsIntro', true); setTimeout(() => this.alive && this.hud.sheet(this.quickGuide(true), 'wide'), 700); }
  }

  // ── scene helpers ─────────────────────────────────────────────────────────
  lightUp() {
    const k = this.stage.key;
    this.savedKey = { pos: k.position.clone(), target: k.target.position.clone(), angle: k.angle, penumbra: k.penumbra, intensity: k.intensity };
    // the key moves up and back so its pool covers a 3 m table
    k.position.set(.1, 2.9, 1.05); k.target.position.set(.05, 0, -.15); k.angle = .72; k.penumbra = .8; k.intensity = 30;
    k.target.updateMatrixWorld();
  }
  placeBackdrop() {
    const x = this.stage.portrait ? (this.view === 'props' ? PROPS_X : PORTRAIT_X) : -.1;
    if (x === this.aceX) return; this.aceX = x;
    this.backdrop.place({ z: Z0 - WALL_T - .04, railY: RAIL_TOP - .006, width: 2.1, x });
  }
  stickSpot() { return [new THREE.Vector3(STICK.x - .019, HD, STICK.z), new THREE.Vector3(STICK.x + .019, HD, STICK.z + .004)]; }
  pileAt(key) {
    let p = this.piles.get(key);
    if (!p) { const [x, z] = pilePos(key); p = new ChipPile(this.stage, this.chips, this.root, new THREE.Vector3(x, 0, z)); p.flying = 0; this.piles.set(key, p); }
    return p;
  }
  // make the chips on the felt match the ledger exactly
  syncPiles() {
    const bets = this.ledger.bets;
    for (const [k, p] of this.piles) if (!bets[k]) { p.dispose(); this.piles.delete(k); }
    for (const [k, a] of Object.entries(bets)) { const p = this.pileAt(k), [x, z] = pilePos(k); if (!p.flying) { p.group.position.set(x, 0, z); if (p.amount !== a) p.set(a); } }
    // odds hit targets sit on established come / don't come chips
    for (const t of this.oddsTargets || []) { this.root.remove(t); t.geometry.dispose(); }
    this.oddsTargets = [];
    for (const k of Object.keys(bets)) {
      const { type, n } = parseKey(k);
      if ((type === 'come' || type === 'dc') && n) for (const kk of [k, oddsKeyFor(k)]) { const [x, z] = pilePos(kk); this.oddsTargets.push(...hitArea(this.root, [[x - .036, z - .036, x + .036, z + .036]], { bet: oddsKeyFor(k), prio: 2 })); }
    }
  }
  chipOrigin() { const c = this.stage.camera.position; return new THREE.Vector3(THREE.MathUtils.clamp(c.x, -.8, 1.1) * .6 + .25, RAIL_TOP + .04, Z1 + .09); }
  placePuck(animate = true) {
    const p = this.ledger.point, [x, z] = p ? puckOn(p) : PUCK_OFF, pk = this.puck;
    const set = () => p ? pk.userData.setText('ON', '#15161a', '#f4efe3') : pk.userData.setText('OFF', '#f4efe3', '#111216');
    if (!animate) { set(); pk.position.set(x, .004, z); pk.rotation.set(0, Math.PI / 2, 0); return Promise.resolve(); }
    const from = pk.position.clone(), to = new THREE.Vector3(x, .004, z); let flipped = false;
    this.sound.play('chip', { vol: .5, rate: .8 });
    return this.tw.run(.75, (e, q) => {
      pk.position.lerpVectors(from, to, e); pk.position.y = .004 + Math.sin(q * Math.PI) * .09;
      pk.rotation.x = Math.PI * 2 * e;
      if (!flipped && e > .5) { flipped = true; set(); }
    }, { ease: 'inOutCubic' }).then(() => { pk.rotation.set(0, Math.PI / 2, 0); this.sound.play('chip', { vol: .7, rate: .7 }); });
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  injectDom() {
    document.getElementById('css-craps')?.remove();
    const st = document.createElement('style'); st.id = 'css-craps'; st.textContent = CSS; document.head.append(st);
    const app = document.getElementById('app');
    this.hudEl = document.createElement('div'); this.hudEl.className = 'cr-hud';
    this.hudEl.innerHTML = `<div class="cr-state"><i class="cr-puck off">OFF</i><div><b></b><small></small></div></div><div class="cr-hist" aria-label="Last rolls"></div>`;
    this.hudEl.append(this.viewBtn = document.createElement('button'));
    this.callEl = document.createElement('div'); this.callEl.className = 'cr-call'; this.callEl.setAttribute('aria-live', 'polite');
    this.viewBtn.className = 'cr-view'; this.viewBtn.innerHTML = 'PROPS <span>›</span>';
    this.viewBtn.onclick = e => { e.stopPropagation(); this.sound.click(); this.toggleView(); };
    this.hintEl = document.createElement('div'); this.hintEl.className = 'cr-hint'; this.hintEl.innerHTML = `<i></i>${matchMedia('(pointer: coarse)').matches ? 'SWIPE' : 'DRAG'} UP TO THROW`;
    app.append(this.hudEl, this.callEl, this.hintEl);
    requestAnimationFrame(() => this.hudEl?.classList.add('on'));
  }
  toggleView(to) {
    this.view = to || (this.view === 'props' ? 'main' : 'props');
    this.viewBtn.innerHTML = this.view === 'props' ? '<span>‹</span> TABLE' : 'PROPS <span>›</span>';
    this.viewBtn.classList.toggle('back', this.view === 'props');
    this.placeBackdrop();
    return this.stage.applyView(this.view === 'props' ? PROPS_VIEW : VIEW, .8);
  }
  renderState() {
    const p = this.ledger.point, el = this.hudEl; if (!el) return;
    const pk = el.querySelector('.cr-puck');
    pk.className = 'cr-puck ' + (p ? 'on' : 'off'); pk.textContent = p ? 'ON' : 'OFF';
    el.querySelector('.cr-state b').textContent = p ? `POINT IS ${p}` : 'COME-OUT ROLL';
    el.querySelector('.cr-state small').textContent = p ? `Roll ${an(p)} before a 7 · roll ${this.rolls + 1}` : 'Pass: 7 or 11 wins · 2, 3, 12 lose';
    el.querySelector('.cr-hist').innerHTML = this.history.length ? this.history.slice(0, 12).map((h, i) => i === 0
      ? `<span class="cr-latest" title="${h.d1} + ${h.d2}"><img src="${dieImg(h.d1)}" alt="${h.d1}"><img src="${dieImg(h.d2)}" alt="${h.d2}"><b class="cr-h ${h.cls}">${h.total}</b></span>`
      : `<span class="cr-h ${h.cls}" title="${h.d1} + ${h.d2}">${h.total}</span>`).join('') : '<span class="cr-empty">NEW SHOOTER</span>';
  }

  // ── betting ───────────────────────────────────────────────────────────────
  tapKey(key) {
    const L = this.ledger, p = L.point;
    if (key === 'pass' && p && L.bets.pass) return 'passOdds';
    if (key === 'dp' && p && L.bets.dp) return 'dpOdds';
    return key;
  }
  tap(e) {
    if (this.phase !== 'bet') return;
    const hits = this.stage.pick(e.clientX, e.clientY, [...this.oddsTargets, ...this.targets], false);
    if (!hits.length) return;
    hits.sort((a, b) => (b.object.userData.prio || 0) - (a.object.userData.prio || 0) || a.distance - b.distance);
    this.placeBet(this.tapKey(hits[0].object.userData.bet), this.hud.selected);
  }
  placeBet(key, v, { quiet = false, from = null } = {}) {
    const L = this.ledger;
    if (v > this.balance) { if (!quiet) this.hud.toast(this.balance < MIN ? 'You’re out of chips.' : 'Not enough chips for that one — pick a smaller chip.'); return false; }
    const r = L.place(key, v);
    if (!r.ok) {
      if (quiet) return false;
      if (r.max && isOdds(key)) this.hud.toast(`That’s max odds on that bet — ${fmt(betLimit(key, L.point, L.bets).max)}.`);
      else this.hud.toast(esc(r.reason));
      if (/Pass Line/.test(r.reason) || /Come opens/.test(r.reason)) this.flash([key === 'come' ? 'pass' : key === 'dc' ? 'dp' : 'come'], .6);
      return false;
    }
    const pile = this.pileAt(key);
    pile.flying++;
    if (!quiet) this.sound.chips(1);
    pile.add(v, from || this.chipOrigin(), this.tw).then(() => { pile.flying--; if (this.alive) { if (!pile.flying && pile.amount !== L.amount(key)) pile.set(L.amount(key)); this.renderLabels(); } });
    if (!quiet) {
      this.renderUI();
      if ((key === 'place6' || key === 'place8') && L.amount(key) % 30 && !this.tipped68) { this.tipped68 = true; this.say('Tip: bet the 6 and 8 in multiples of 30 for the full 7-to-6 payout.'); }
      else this.coach(key);
    }
    if (key.startsWith('come') || key.startsWith('dc')) this.syncPiles();
    return true;
  }
  coach(key) {
    const p = this.ledger.point;
    const lines = {
      pass: p == null ? 'Good. Swipe up or tap ROLL — 7 or 11 wins, 2, 3 or 12 loses.' : null,
      dp: p == null ? 'Betting with the house: 2 or 3 wins, 7 or 11 loses, 12 is a push.' : null,
      passOdds: `Odds behind the line pay true odds on the ${p} — no house edge.`,
      dpOdds: `Laying odds: you win when the 7 beats the ${p}.`,
      come: 'Come works like a fresh Pass Line bet — it moves to the next number.',
      dc: 'Don’t Come: moves behind the next number rolled, then wants a 7.',
      field: 'One roll: 2, 3, 4, 9, 10, 11 or 12 wins. 2 pays double, 12 triple.',
      anySeven: 'Any Seven: one roll, pays 4 to 1.', anyCraps: 'Any Craps: 2, 3 or 12 next roll pays 7 to 1.',
      yo: 'Yo-eleven: 11 next roll pays 15 to 1.', aces: 'Aces: a 2 next roll pays 30 to 1.', boxcars: 'Boxcars: a 12 next roll pays 30 to 1.', aceDeuce: 'Ace-deuce: a 3 next roll pays 15 to 1.'
    };
    const { type, n } = parseKey(key);
    let line = lines[key] || lines[type];
    if (type === 'place') line = `Place ${n} pays ${PLACE_PAYS[n].join(' to ')} each time it rolls, until a 7.${p == null && !this.working ? ' Off on the come-out.' : ''}`;
    if (type === 'hard') line = `Hard ${n}: ${n / 2}+${n / 2} pays ${HARD_PAYS[n]} to 1. Loses to 7 or easy ${n}.`;
    if (type === 'comeOdds') line = `Odds on your come bet on the ${n} pay true odds.${p == null && !this.working ? ' They’re off on the come-out.' : ''}`;
    if (line && line !== this.lastCoach) { this.lastCoach = line; this.say(line); }
  }
  totalRemovable() { return this.ledger.removableKeys().reduce((a, k) => a + this.ledger.amount(k), 0); }
  clearBets() {
    if (this.phase !== 'bet') return;
    const out = this.ledger.clearRemovable(), keys = Object.keys(out);
    if (!keys.length) { if (this.ledger.total()) this.hud.toast('Line bets stay up until they’re decided.'); return; }
    const home = this.chipOrigin();
    for (const k of keys) { const p = this.piles.get(k); if (p) { p.flying++; p.sweepTo(home, this.tw, { dur: .4 }).then(() => { p.flying--; this.alive && this.syncPiles(); }); } }
    this.sound.chips(4);
    this.renderUI();
    if (this.ledger.total()) this.say('Line bets stay until they’re decided — the rest is back in your rack.');
  }
  rebetPlan() {
    if (!this.lastBets) return { total: 0, list: [] };
    const L = this.ledger, list = [];
    for (const [k, a] of Object.entries(this.lastBets)) {
      const need = a - L.amount(k); if (need <= 0) continue;
      const lim = betLimit(k, L.point, L.bets); if (!lim.ok || L.amount(k) + need > lim.max) continue;
      list.push([k, need]);
    }
    return { total: list.reduce((s, [, a]) => s + a, 0), list };
  }
  rebet() {
    if (this.phase !== 'bet') return;
    const plan = this.rebetPlan(); if (!plan.total) return;
    if (plan.total > this.balance) { this.hud.toast('Not enough chips to repeat those bets.'); return; }
    plan.list.forEach(([k, a], i) => setTimeout(() => this.alive && this.phase === 'bet' && this.placeBet(k, a, { quiet: true }), i * 70));
    this.sound.chips(5);
    setTimeout(() => this.alive && this.renderUI(), plan.list.length * 70 + 20);
  }
  oddsPlan() {
    const L = this.ledger, out = [];
    for (const k of Object.keys(L.bets)) {
      const ok = oddsKeyFor(k); if (!ok) continue;
      if ((k === 'pass' || k === 'dp') && L.point == null) continue;
      const lim = betLimit(ok, L.point, L.bets); if (!lim.ok) continue;
      const target = niceOdds(ok, lim.max, L.point), add = target - L.amount(ok);
      if (add >= 10) out.push([ok, add]);
    }
    return out;
  }
  maxOdds() {
    if (this.phase !== 'bet') return;
    const plan = this.oddsPlan(); if (!plan.length) { this.hud.toast(this.ledger.point ? 'Your odds are maxed out.' : 'Odds open once a point is set.'); return; }
    let placed = 0;
    for (const [k, a] of plan) { let amt = Math.min(a, Math.floor(this.balance / 5) * 5); if (amt === 15) amt = 10; if (amt >= 10 && this.placeBet(k, amt, { quiet: true })) placed++; }
    if (!placed) { this.hud.toast('Not enough chips for odds.'); return; }
    this.sound.chips(4); this.renderUI();
    this.say('Odds are working. They pay true odds — the best bet in the house.');
  }
  canRoll() { const L = this.ledger; return this.phase === 'bet' && (L.point != null || L.bets.pass > 0 || L.bets.dp > 0); }
  renderUI() {
    if (!this.alive) return;
    const L = this.ledger, total = L.total(), p = L.point;
    this.hud.bet('ON THE LAYOUT', total, `Table ${MIN}–${fmt(MAX)} · 3-4-5x odds`);
    this.hud.affordable(this.balance);
    const rb = this.rebetPlan(), odds = this.oddsPlan(), rem = this.totalRemovable(), can = this.canRoll();
    this.hud.actions([
      { id: 'clear', label: 'CLEAR', sub: rem ? fmt(rem) : '', onClick: () => this.clearBets(), disabled: !rem || this.phase !== 'bet' },
      rb.total ? { id: 'rebet', label: 'REBET', sub: fmt(rb.total), onClick: () => this.rebet(), disabled: rb.total > this.balance || this.phase !== 'bet' } : null,
      odds.length ? { id: 'odds', label: 'ODDS', sub: 'MAX 3-4-5X', onClick: () => this.maxOdds(), disabled: this.phase !== 'bet', hot: !L.bets.passOdds && !!L.bets.pass } : null,
      { id: 'roll', label: 'ROLL', sub: p ? `POINT ${p}` : L.bets.pass || L.bets.dp ? 'COME-OUT' : 'BET THE LINE', kind: 'primary', hot: can, disabled: !can, onClick: () => this.roll(), key: '␣' }
    ]);
    this.renderLabels();
    this.renderState();
  }
  renderLabels() {
    if (!this.alive) return;
    const L = this.ledger, seen = new Set();
    // one tag per bet; odds ride on their line bet's tag ("25 + ODDS 125")
    if (this.phase === 'bet') for (const [k, a] of Object.entries(L.bets)) {
      if (isOdds(k)) continue;
      const [x, z] = pilePos(k), ok = oddsKeyFor(k), odds = ok ? L.amount(ok) : 0, id = 'cb-' + k; seen.add(id);
      const off = !working(k, L.point, L.opts), oddsOff = odds && !working(ok, L.point, L.opts);
      const lay = /^dc|^dp/.test(k);
      const html = `<span class="tag cr-t">${fmt(a)}${off ? '<em>OFF</em>' : ''}${odds ? `<i>+ ${lay ? 'LAY' : 'ODDS'} ${fmt(odds)}${oddsOff ? ' <em>OFF</em>' : ''}</i>` : ''}</span>`;
      const below = k === 'pass' && odds ? .12 : .046;                       // pass odds sit behind the line
      this.hud.anchor(id, new THREE.Vector3(x + (odds && /^(come|dc)\d/.test(k) ? .04 : 0), .004, z + below), html);
    }
    for (const id of [...this.hud.anchors.keys()]) if (id.startsWith('cb-') && !seen.has(id)) this.hud.unanchor(id);
  }
  idle(res = null, restored = false) {
    if (!this.alive) return;
    this.phase = 'bet';
    this.hud.rackEnabled(true);
    this.renderUI();
    this.sayState(res, restored);
    if (this.canRoll() && !this.swiped && (this.thrown || 0) < 3) this.hintEl.classList.add('on');
  }
  sayState(res, restored) {
    const L = this.ledger, p = L.point, b = L.bets;
    if (this.balance < MIN && !L.total()) return this.say('You’re out of chips — Ace’s marker is waiting in the lobby.');
    if (restored) return this.say(p ? `Welcome back — your bets are still working. Point is ${p}.` : 'Welcome back — your bets are right where you left them.');
    if (p == null) {
      if (!b.pass && !b.dp) return this.say(res?.sevenOut ? 'Seven out. New come-out — bet the Pass Line, then roll.' : !this.history.length ? 'You’re the shooter. Put a bet on the Pass Line, then roll.' : 'Put a bet on the Pass Line, then roll.');
      if (res?.pointMade) return this.say(`Winner! The ${res.total} — your Pass Line stays up. Coming out again.`);
      if (res?.natural) return this.say(`Front line winner! Your bet stays up — roll again.`);
      return this.say(res?.sevenOut ? 'New come-out roll. 7 or 11 wins, 2, 3 or 12 loses.' : 'Coming out: 7 or 11 wins, 2, 3 or 12 loses. Swipe up or tap ROLL.');
    }
    if (res?.pointSet) return this.say(b.pass && !b.passOdds ? `Point is ${p} — roll it again before a 7. Take ODDS: no house edge.` : `Point is ${p} — roll it again before a 7.`);
    if (b.pass && !b.passOdds && Math.random() < .5) return this.say(`Point is ${p}. Take ODDS behind your line — no house edge.`);
    if (!Object.keys(b).some(k => /^come/.test(k)) && Math.random() < .4) return this.say(`Point is ${p}. Come works like a fresh Pass Line bet.`);
    this.say(`Point is ${p}. Roll ${an(p)} before a 7.`);
  }

  // ── the roll ──────────────────────────────────────────────────────────────
  swipe() {
    const c = this.stage.canvas; let s = null;
    const down = e => { s = { x: e.clientX, y: e.clientY, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }] }; };
    const move = e => { if (!s) return; s.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (s.pts.length > 8) s.pts.shift(); };
    const up = e => {
      if (!s) return; const a = s; s = null;
      const dy = e.clientY - a.y, dx = e.clientX - a.x;
      if (dy > -50 || Math.abs(dx) > Math.abs(dy) * 1.2) return;
      const p0 = a.pts[0], t = Math.max(16, performance.now() - p0.t), speed = Math.hypot(e.clientX - p0.x, e.clientY - p0.y) / t * 1000;
      if (!this.canRoll()) { if (this.phase === 'bet') { this.hud.toast('Put a bet on the Pass Line first, then throw.'); this.flash(['pass'], .7); } return; }
      this.swiped = true; this.sound.unlock();
      this.roll(THREE.MathUtils.clamp((speed - 350) / 2400, 0, 1), THREE.MathUtils.clamp(dx / 260, -1, 1));
    };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', () => { s = null; });
    this.offs.push(() => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); });
  }
  pileObstacles() {
    const out = [];
    for (const [k, p] of this.piles) if (p.amount > 0) { const [x, z] = pilePos(k); out.push({ x, z, r: .03 }); }
    out.push({ x: this.puck.position.x, z: this.puck.position.z, r: .032 });
    return out;
  }
  async roll(strength = .45 + Math.random() * .3, aim = (Math.random() - .5) * .6) {
    if (!this.canRoll()) { if (this.phase === 'bet') { this.hud.toast('The shooter needs a Pass Line or Don’t Pass bet on the come-out.'); this.flash(['pass'], .7); } return; }
    const L = this.ledger;
    this.phase = 'roll';
    this.hideCall(0);
    this.thrown = (this.thrown || 0) + 1;
    this.hintEl.classList.remove('on');
    this.lastBets = Object.fromEntries(Object.entries(L.bets).filter(([k]) => !isOdds(k) && !/^(come|dc)\d/.test(k)));
    this.hud.actions([]); this.hud.rackEnabled(false);
    for (const id of [...this.hud.anchors.keys()]) if (id.startsWith('cb-')) this.hud.unanchor(id);
    if (this.view === 'props') { this.view = 'main'; this.viewBtn.innerHTML = 'PROPS <span>›</span>'; this.viewBtn.classList.remove('back'); this.stage.viewPreset = VIEW; }
    // the outcome is decided here, before a single die moves
    let d1 = rand(6) + 1, d2 = rand(6) + 1;
    if (window.__crapsDev && Array.isArray(this.rig)) { [d1, d2] = this.rig; this.rig = null; }
    const res = L.roll(d1, d2);
    this.inflight = res;
    this.say(L.point == null ? 'Coming out! Dice are rolling…' : `Point is ${L.point}. Here come the dice…`);
    this.ace('nomore');
    const plan = planThrow([d1, d2], { from: RELEASE, strength, aim, avoid: this.pileObstacles() });
    await this.throwDice(plan);
    if (!this.alive) return;
    await this.reveal(res, plan);
    if (!this.alive) return;
    await this.settle(res);
    if (!this.alive) return;
    this.returnDice();
    this.idle(res);
    this.hideCall(res.pointMade || res.sevenOut ? 1.6 : .9);
  }
  async throwDice(plan) {
    const pose = [{ p: new THREE.Vector3(), q: new THREE.Quaternion() }, { p: new THREE.Vector3(), q: new THREE.Quaternion() }];
    samplePlan(plan, 0, pose);
    // Ace slides the dice across to you; you pick them up and shake
    this.tw.kill('crDice'); this.stopStick?.(); this.stopStick = null;
    const from = this.dice.map(d => ({ p: d.position.clone(), q: d.quaternion.clone() }));
    this.tw.kill('camera');
    this.cam = { plan, t: 0, phase: 'wind', fov: this.stage.camera.fov };
    this.sound.play('chip', { vol: .25, rate: 1.6 });
    await this.tw.run(.62, (e, q) => {
      this.dice.forEach((d, i) => {
        d.position.lerpVectors(from[i].p, pose[i].p, e);
        d.position.y += Math.sin(q * Math.PI) * .12 + Math.sin(q * 46 + i * 2) * .005 * Math.max(0, q - .6);
        d.quaternion.slerpQuaternions(from[i].q, pose[i].q, e);
      });
    }, { ease: 'inOutCubic' });
    if (!this.alive) return;
    this.sound.whoosh();
    // play the simulation: slow motion through the flight and the wall, real time for the roll-out
    const hits = plan.hits.slice();
    await new Promise(done => {
      this.play = { plan, t: 0, pose, hits, done };
      this.cam.phase = 'chase';
    });
  }
  playStep(dt) {
    const pl = this.play; if (!pl) return;
    const { plan } = pl, slow = pl.t < plan.backHit + .12 ? .58 : Math.min(1, .58 + (pl.t - plan.backHit - .12) * 1.4);
    pl.t = Math.min(plan.duration, pl.t + dt * slow);
    samplePlan(plan, pl.t, pl.pose);
    this.dice.forEach((d, i) => { d.position.copy(pl.pose[i].p); d.quaternion.copy(pl.pose[i].q); });
    while (pl.hits.length && pl.hits[0].t <= pl.t) { const h = pl.hits.shift(); this.sound.dice([{ t: 0, v: .35 + h.v * .65 }]); }
    if (this.cam && pl.t > plan.backHit + .18) this.cam.phase = 'settle';
    if (pl.t >= plan.duration) { this.play = null; pl.done(); }
  }
  camStep(dt) {
    const c = this.cam; if (!c || c.phase === 'wind' && !this.play) return;
    const cam = this.stage.camera, look = this.stage.look;
    const m = this.dice[0].position.clone().add(this.dice[1].position).multiplyScalar(.5);
    const portrait = this.stage.portrait;
    let tp, tl, fov, k1, k2;
    if (c.phase === 'wind' || c.phase === 'chase') {
      // chase from behind the throw; aim a touch toward Ace so the lens never runs off the painted room
      tp = new THREE.Vector3(m.x * .55 + .08, Math.max(.4, m.y + .42), m.z + (portrait ? .8 : .7));
      tl = new THREE.Vector3(m.x * .85 - .03, m.y * .3, m.z - .12); fov = portrait ? 52 : 33; k1 = 2.6; k2 = 5;
    } else {
      tp = new THREE.Vector3(m.x + .02, portrait ? .78 : .6, m.z + (portrait ? .5 : .44));
      tl = new THREE.Vector3(m.x, 0, m.z - .03); fov = portrait ? 52 : 36; k1 = 2.2; k2 = 4;
    }
    cam.position.lerp(tp, 1 - Math.exp(-dt * k1));
    look.lerp(tl, 1 - Math.exp(-dt * k2));
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 2));
    cam.lookAt(look); cam.updateProjectionMatrix();
  }
  async reveal(res, plan) {
    this.cam = null;
    const a = this.dice[0].position, b = this.dice[1].position, m = a.clone().add(b).multiplyScalar(.5);
    // a steep three-quarter look: the rolled faces read cleanly, the dice read as solid, and the
    // lens stays out of the overhead key's mirror bounce off the lacquered faces
    const asp = this.stage.camera.aspect, t = Math.tan(17 * Math.PI / 180) * 2;
    const d = Math.max(.27, (Math.abs(a.x - b.x) + .17) / (t * Math.min(asp, 1.6)), (Math.abs(a.z - b.z) + .16) / t);
    const shot = this.stage.shot({ pos: [m.x + d * .08, d * .86, m.z + d * .52], look: [m.x, 0, m.z - d * .06], fov: 34 }, .75);
    this.recordHistory(res);
    this.flashWinners(res);
    this.showCall(res);
    const call = stickCall(res);
    const sub = call.sub ? (call.title.endsWith('!') ? call.sub : call.sub.toLowerCase()).replace(/ · /g, ', ') : '';
    this.say(`${call.title}${sub ? (call.title.endsWith('!') ? ' ' : ' — ') + sub + '.' : call.title.endsWith('!') ? '' : '.'}${call.status && !res.pointMade && !res.sevenOut ? ' ' + call.status + '.' : ''}`);
    const big = res.pointMade || res.sevenOut || res.natural;
    if (res.pointMade) { this.sound.chime(3); this.sound.play('win', { vol: .5 }); }
    else if (res.sevenOut) this.sound.lose();
    else if (res.natural) this.sound.chime(2);
    else if (res.pointSet) this.sound.chime(1);
    else if (res.net > 0) this.sound.chime(1);
    await shot;
    await this.wait(big ? 1.3 : .95);
  }
  recordHistory(res) {
    res.recorded = true;
    const cls = res.sevenOut ? 'seven' : res.pointMade ? 'made' : res.total === 7 ? 'natural' : res.crapsOut ? 'craps' : res.pointSet ? 'point' : '';
    this.history.unshift({ d1: res.d1, d2: res.d2, total: res.total, cls });
    this.history.length = Math.min(this.history.length, 20);
    this.rolls = res.sevenOut ? 0 : this.rolls + 1;
  }
  showCall(res) {
    const c = stickCall(res), el = this.callEl, net = res.net;
    const kind = net > 0 ? 'win' : net < 0 ? 'lose' : res.sevenOut ? 'lose' : res.pointMade || res.natural ? 'win' : '';
    el.className = 'cr-call ' + kind;
    el.innerHTML = `<div class="c-in"><div class="c-dice"><img src="${dieImg(res.d1)}" alt="${res.d1}"><img src="${dieImg(res.d2)}" alt="${res.d2}"></div>
      <div class="c-title">${esc(c.title)}</div>${c.sub ? `<div class="c-sub">${esc(c.sub)}</div>` : ''}
      ${c.status ? `<div class="c-status">${esc(c.status)}</div>` : ''}
      ${net ? `<div class="c-net ${net > 0 ? 'plus' : 'minus'}">${net > 0 ? '+' : '−'}${fmt(Math.abs(net))}</div>` : ''}</div>`;
    void el.offsetWidth; el.classList.add('on');
    clearTimeout(this.callT);
  }
  // the call stays up through the payout and fades once betting reopens
  hideCall(delay = .9) { clearTimeout(this.callT); this.callT = setTimeout(() => this.callEl?.classList.remove('on'), delay * 1000); }
  // light up every area that wins on this roll, like the table is reading the dice
  flashWinners(res) {
    const t = res.total, on = res.point != null, keys = [];
    if ((!on && res.natural) || res.pointMade) keys.push('pass');
    if ((!on && (t === 2 || t === 3)) || res.sevenOut) keys.push('dp');
    if (on && (t === 7 || t === 11)) keys.push('come');
    if (on && (t === 2 || t === 3)) keys.push('dc');
    if (FIELD_PAYS[t]) keys.push('field');
    if (POINTS.includes(t)) keys.push('place' + t);
    if (res.hard && [4, 6, 8, 10].includes(t)) keys.push('hard' + t);
    for (const k of Object.keys(PROPS)) if (PROPS[k].hit(t)) keys.push(k);
    this.flash(keys, 1);
  }
  flash(keys, level = 1) { for (const k of keys) if (this.glows[k]) this.glows[k].flash = level; }

  // pay the winners, take the losers, move the come bets, flip the puck
  async settle(res) {
    const back = this.stage.back(.9);
    await this.wait(.35);
    if (!this.alive) return;
    const L = this.ledger, home = this.chipOrigin(), jobs = [];
    this.orphans = [];
    const lost = res.results.filter(r => r.kind === 'lose'), won = res.results.filter(r => r.kind === 'win'), pushed = res.results.filter(r => r.kind === 'push'), moved = res.results.filter(r => r.kind === 'travel');
    // losers first, the way a dealer does it
    lost.forEach((r, i) => {
      const p = this.piles.get(r.key); if (!p) return;
      p.flying++; const at = p.group.position.clone();
      floatText(this.hud, at.clone().add(new THREE.Vector3(0, .05, 0)), '−' + fmt(r.amount), 'minus');
      jobs.push(this.wait(i * .06).then(() => p.sweepTo(DEALER, this.tw, { dur: .55 })).then(() => { p.flying--; }));
    });
    if (lost.length) this.sound.chips(Math.min(6, 2 + lost.length));
    await this.wait(lost.length ? .45 : 0);
    if (!this.alive) return;
    for (const r of pushed) { const p = this.piles.get(r.key); if (p) { p.flying++; jobs.push(p.sweepTo(home, this.tw, { dur: .5 }).then(() => { p.flying--; })); } }
    won.forEach((r, i) => jobs.push(this.payOne(r, i * .09, home)));
    if (won.length) this.sound.chips(Math.min(8, 3 + won.length * 2));
    moved.forEach(r => jobs.push(this.travel(r)));
    const puckMoves = res.nextPoint !== res.point;
    await Promise.all(jobs);
    if (!this.alive) return;
    for (const o of this.orphans) o.dispose();
    // the money moves exactly once, when the chips have landed
    const pointBefore = L.point;
    L.commit(res);
    this.inflight = null;
    this.emit('roll', { net: res.net, pointMade: res.pointMade });
    this.syncPiles();
    if (puckMoves || pointBefore !== L.point) await this.placePuck(true);
    await back;
    if (!this.alive) return;
    // Ace reacts
    const bigWin = res.net >= Math.max(500, 4 * (res.staked || MIN));
    if (res.net > 0 && (res.pointMade || bigWin)) this.ace(bigWin ? 'big' : 'win', true);
    else if (res.sevenOut && res.net < 0) this.ace('lose', true);
    else if (res.net > 0) this.ace('win');
    if (res.net >= 2500) { this.sound.fanfare(); this.hud.banner({ title: 'Big win', amount: res.net, kind: 'big', sub: stickCall(res).title.toUpperCase(), hold: 1.6 }); }
  }
  async payOne(r, delay, home) {
    const p = this.piles.get(r.key); if (!p) return;
    p.flying++;
    await this.wait(delay);
    if (!this.alive) return;
    const base = p.group.position.clone(), side = base.x > 1.0 ? -1 : 1;
    const pay = new ChipPile(this.stage, this.chips, this.root, base.clone().add(new THREE.Vector3(side * .05, 0, .012)));
    pay.set(r.win);
    const target = pay.group.position.clone(); pay.group.position.copy(DEALER);
    floatText(this.hud, base.clone().add(new THREE.Vector3(0, .06, 0)), '+' + fmt(r.win));
    this.hud.anchor('w-' + r.key, base.clone().add(new THREE.Vector3(0, .01, .05)), `<span class="tag win cr-t">${esc(this.winLabel(r))} +${fmt(r.win)}</span>`);
    await this.tw.run(.55, (e, q) => { pay.group.position.lerpVectors(DEALER, target, e); pay.group.position.y += Math.sin(q * Math.PI) * .12; }, { ease: 'outCubic' });
    await this.wait(.5);
    if (!this.alive) return;
    this.hud.unanchor('w-' + r.key);
    const jobs = [pay.sweepTo(home, this.tw, { dur: .5 })];
    if (!r.keep) jobs.push(p.sweepTo(home, this.tw, { dur: .55 }));
    await Promise.all(jobs);
    pay.dispose(); p.flying--;
  }
  winLabel(r) { const { type, n } = parseKey(r.key); return type === 'passOdds' || type === 'comeOdds' ? 'ODDS' : type === 'dpOdds' || type === 'dcOdds' ? 'LAY' : type === 'place' ? 'PLACE ' + n : type === 'hard' ? 'HARD ' + n : type === 'come' && n ? 'COME ' + n : type === 'dc' && n ? 'DON’T ' + n : betName(r.key).toUpperCase(); }
  // a come bet travels to its number
  async travel(r) {
    const p = this.piles.get(r.key); if (!p) return;
    p.flying++;
    const from = p.group.position.clone(), [x, z] = pilePos(r.to), to = new THREE.Vector3(x, 0, z);
    await this.wait(.25);
    await this.tw.run(.6, (e, q) => { p.group.position.lerpVectors(from, to, e); p.group.position.y = Math.sin(q * Math.PI) * .07; }, { ease: 'inOutCubic' });
    this.sound.chips(2);
    // re-key: the waiting pile becomes the pile on the number
    const old = this.piles.get(r.to);
    if (old && old !== p) this.orphans.push(old);          // the bet it replaces is still being paid
    this.piles.delete(r.key); this.piles.set(r.to, p);
    p.flying--;
  }
  // Ace reaches out with the stick, hooks the dice and pulls them home
  returnDice() {
    const spots = this.stickSpot(), from = this.dice.map(d => d.position.clone()), q0 = this.dice.map(d => d.quaternion.clone());
    const yaw = this.dice.map((d, i) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i ? .6 : -.4)).multiply(q0[i]));
    const mid = from[0].clone().add(from[1]).multiplyScalar(.5), home = spots[0].clone().add(spots[1]).multiplyScalar(.5);
    const hand = new THREE.Vector3(this.aceX ?? -.1, .34, Z0 - WALL_T - .12);
    const rest = new THREE.Vector3(hand.x + .05, .2, Z0 - .02);                    // tip parked over the far wall
    const reach = mid.clone().add(new THREE.Vector3(0, .012, .055));               // just in front of the dice
    const park = home.clone().add(new THREE.Vector3(0, .012, .05));
    const st = this.stick, tip = new THREE.Vector3();
    const put = p => { tip.copy(p); st.position.copy(p); st.lookAt(hand); st.userData.setLength(p.distanceTo(hand) + .05); };
    const grab = from.map(p => p.clone().sub(mid));                                 // dice offsets from the hook
    let run = 0;
    const job = async () => {
      st.visible = true; put(rest);
      await this.tw.run(.55, e => put(rest.clone().lerp(reach, e).setY(THREE.MathUtils.lerp(rest.y, reach.y, Math.min(1, e * 1.4)))), { ease: 'inOutCubic', tag: 'crDice' });
      if (!this.alive || run) return;
      this.sound.play('chip', { vol: .18, rate: 1.9 });
      await this.tw.run(.85, (e, q) => {
        const p = reach.clone().lerp(park, e); put(p);
        this.dice.forEach((d, i) => {
          const tgt = p.clone().add(new THREE.Vector3(0, 0, -.05)).add(grab[i].clone().multiplyScalar(1 - e));
          const final = spots[i];
          d.position.lerpVectors(tgt, final, Math.max(0, (e - .7) / .3));
          d.position.y = HD;
          d.quaternion.slerpQuaternions(q0[i], yaw[i], e);
        });
      }, { ease: 'inOutCubic', tag: 'crDice' });
      if (!this.alive || run) return;
      await this.tw.run(.45, e => put(park.clone().lerp(rest, e)), { ease: 'inOutCubic', tag: 'crDice' });
      st.visible = false;
    };
    this.stopStick = () => { run = 1; st.visible = false; this.dice.forEach((d, i) => { d.position.copy(spots[i]); d.quaternion.copy(yaw[i]); }); };
    this.wait(.15).then(() => this.alive && !run && job());
  }
  ace(clip, force = false) {
    const now = performance.now();
    if (!force && now < (this.aceBusy || 0)) return;
    this.aceBusy = now + 7000; this.backdrop.play(clip);
  }

  // ── per frame ─────────────────────────────────────────────────────────────
  frame(dt) {
    if (!this.alive) return;
    dt *= this.tw.speed || 1;                           // follow the tween clock (the harness can fast-forward it)
    this.playStep(dt);
    this.camStep(dt);
    const t = performance.now() / 1000, L = this.ledger, needLine = this.phase === 'bet' && L.point == null && !L.bets.pass && !L.bets.dp;
    for (const [k, g] of Object.entries(this.glows)) {
      g.flash = Math.max(0, g.flash - dt * .38);
      const pulse = needLine && k === 'pass' ? .2 + .16 * Math.sin(t * 2.6) : 0;
      const hover = this.phase === 'bet' && this.hoverKey && (k === this.hoverKey || (this.hoverKey === 'passOdds' && k === 'pass') || (this.hoverKey === 'dpOdds' && k === 'dp')) ? .2 : 0;
      const fl = g.flash > 0 ? Math.min(1, g.flash * 1.6) * (.62 + .25 * Math.sin(t * 9)) : 0;
      g.g.userData.setOpacity(Math.max(pulse, hover, fl));
    }
  }

  // ── leaving ───────────────────────────────────────────────────────────────
  dispose() {
    for (const el of [this.hudEl, this.callEl, this.viewBtn, this.hintEl]) el?.remove();
    document.getElementById('css-craps')?.remove();
    clearTimeout(this.callT);
    if (!this.ledger) return;                          // left before the table was built
    // a roll in the air still counts
    if (this.inflight && !this.inflight.committed) { this.ledger.commit(this.inflight); this.emit('roll', { net: this.inflight.net, pointMade: this.inflight.pointMade }); }
    if (this.inflight && !this.inflight.recorded) this.recordHistory(this.inflight);
    this.offFrame?.();
    SAVED = this.ledger.total() || this.ledger.point != null ? { bets: { ...this.ledger.bets }, point: this.ledger.point, history: this.history, lastBets: this.lastBets, rolls: this.rolls } : (this.history.length ? { bets: {}, point: null, history: this.history, lastBets: this.lastBets, rolls: 0 } : null);
    const k = this.stage.key, s = this.savedKey;
    if (s) { k.position.copy(s.pos); k.target.position.copy(s.target); k.angle = s.angle; k.penumbra = s.penumbra; k.intensity = s.intensity; k.target.updateMatrixWorld(); }
  }

  // for the screenshot harness and the curious: window.__casino.current.state()
  state() { return { point: this.ledger.point, bets: { ...this.ledger.bets }, onLayout: this.ledger.total(), balance: this.balance, inPlay: this.bank.s.inPlay, phase: this.phase, history: this.history.slice(0, 6).map(h => h.total) }; }

  // ── rules sheet ───────────────────────────────────────────────────────────
  quickGuide(first = false) {
    return `<p class="eyebrow">${first ? 'NEW TO CRAPS? READ THIS FIRST' : 'THE 30-SECOND VERSION'}</p><h2>Craps in <em>30 seconds</em></h2>
    <ol class="cr-steps">
      <li><b>Bet the Pass Line.</b> Tap a chip, then tap the <em>Pass Line</em> along the front of the table.</li>
      <li><b>Roll.</b> Tap ROLL — or swipe up on the table to throw. On this first roll (the <em>come-out</em>) a 7 or 11 wins, a 2, 3 or 12 loses.</li>
      <li><b>Anything else is the point.</b> The puck flips to ON and sits on that number.</li>
      <li><b>Keep rolling.</b> Roll the point again before a 7 and the Pass Line wins. A 7 first is a <em>seven out</em>.</li>
      <li><b>Take the odds.</b> Once there’s a point, tap ODDS: it pays true odds, the only bet in the house with no edge.</li>
    </ol>
    ${first ? '<p class="muted">Everything else on the felt is optional. Tap ? any time for the full rules.</p><div class="row"><button class="btn primary" data-close>LET’S ROLL</button></div>' : ''}`;
  }
  help() {
    const row = (a, b, c = '') => `<tr><td>${a}</td><td class="r">${b}</td><td class="r muted">${c}</td></tr>`;
    return `${this.quickGuide()}
    <h3>THE BETS</h3>
    <table class="paytable"><tr><th>BET</th><th class="r">PAYS</th><th class="r">EDGE</th></tr>
      ${row('Pass Line · Come', '1 to 1', EDGES.pass + '%')}
      ${row('Don’t Pass · Don’t Come <span class="muted">(12 is a push)</span>', '1 to 1', EDGES.dp + '%')}
      ${row('Odds on 4 / 10 · 5 / 9 · 6 / 8', '2:1 · 3:2 · 6:5', '0%')}
      ${row('Lay odds on 4 / 10 · 5 / 9 · 6 / 8', '1:2 · 2:3 · 5:6', '0%')}
      ${row('Place 6 or 8', '7 to 6', EDGES.place68 + '%')}
      ${row('Place 5 or 9', '7 to 5', EDGES.place59 + '%')}
      ${row('Place 4 or 10', '9 to 5', EDGES.place410 + '%')}
      ${row('Field: 3 4 9 10 11 · 2 · 12', '1:1 · 2:1 · 3:1', EDGES.field + '%')}
      ${row('Hard 6 or 8', '9 to 1', EDGES.hard68 + '%')}
      ${row('Hard 4 or 10', '7 to 1', EDGES.hard410 + '%')}
      ${row('Any Seven', '4 to 1', EDGES.anySeven + '%')}
      ${row('Any Craps (2, 3, 12)', '7 to 1', EDGES.anyCraps + '%')}
      ${row('Yo-Eleven · Ace-Deuce', '15 to 1', EDGES.yo + '%')}
      ${row('Aces · Boxcars', '30 to 1', EDGES.aces + '%')}
    </table>
    <h3>HOW THE TABLE WORKS</h3>
    <ul>
      <li><b>Come / Don’t Come</b> open once a point is set. Your chips travel to the next number rolled and play like their own Pass / Don’t Pass bet.</li>
      <li><b>Odds</b> go behind a Pass or Come bet up to 3×, 4× and 5× (on 4/10, 5/9, 6/8). Lay odds on the Don’t side go up to 6× your flat bet. Tap your line bet (or ODDS) to add them.</li>
      <li><b>Line bets are contracts:</b> once a point is on, Pass and established Come bets stay up until they win or lose. Everything else comes down with CLEAR.</li>
      <li><b>Winning bets stay up</b> (Pass Line, place bets, hardways, field and props) — the winnings go to your rack. Come bets, their odds and all odds come down when they’re paid.</li>
      <li><b>Place bets, hardways and come odds are off</b> on the come-out roll unless you turn them on here: <button class="btn" id="cr-working" style="height:32px;margin-left:4px">${this.working ? 'WORKING — TURN OFF' : 'OFF — MAKE THEM WORK'}</button></li>
      <li>Payouts are in whole chips, rounded down. Bet the 6 and 8 in multiples of 30 for the full 7-to-6.</li>
      <li>Table limits ${MIN}–${fmt(MAX)} · props and hardways up to ${fmt(PROP_MAX)}.</li>
    </ul>
    <h3>KEYS</h3><p class="muted">Space roll · O max odds · C clear · R rebet · swipe up on the table to throw — faster swipe, harder throw.</p>`;
  }
}

document.addEventListener('click', e => {
  if (e.target.id === 'cr-working') {
    const g = window.__casino?.current; if (!g || !(g instanceof Craps)) return;
    g.working = !g.working; g.ledger.opts.working = g.working; g.bank.setting('crapsWorking', g.working);
    e.target.textContent = g.working ? 'WORKING — TURN OFF' : 'OFF — MAKE THEM WORK';
    g.renderLabels();
  }
});

const CSS = `
.cr-hud{position:absolute;left:16px;top:calc(var(--top) + var(--safe-t) + 14px);z-index:14;display:flex;flex-direction:column;align-items:flex-start;gap:8px;pointer-events:none;opacity:0;transition:opacity .5s}
.cr-hud.on{opacity:1}
[data-view=lobby] .cr-hud,[data-view=lobby] .cr-view,[data-view=lobby] .cr-hint{display:none}
.cr-state{display:flex;align-items:center;gap:11px;padding:7px 16px 7px 7px;border-radius:999px;background:rgba(6,8,10,.74);box-shadow:inset 0 0 0 1px var(--line);backdrop-filter:blur(6px)}
.cr-puck{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font:800 10.5px var(--text);letter-spacing:.06em;font-style:normal;box-shadow:inset 0 0 0 2.5px #b8914a,0 4px 10px rgba(0,0,0,.55);transition:background .4s,color .4s}
.cr-puck.off{background:#111216;color:#f4efe3}
.cr-puck.on{background:#f4efe3;color:#15161a}
.cr-state b{display:block;font-size:11.5px;letter-spacing:.24em;color:var(--gold-hi);font-weight:800}
.cr-state small{display:block;font-size:11.5px;color:var(--mute);margin-top:2px}
.cr-hist{display:flex;gap:5px;align-items:center;padding:5px 9px 5px 5px;border-radius:999px;background:rgba(6,8,10,.62);box-shadow:inset 0 0 0 1px var(--line);max-width:min(430px,44vw);overflow:hidden}
.cr-h{flex:none;width:25px;height:25px;border-radius:50%;display:grid;place-items:center;font:800 11.5px var(--text);color:var(--cream);background:rgba(255,255,255,.07);font-variant-numeric:tabular-nums}
.cr-h.seven{background:rgba(196,48,60,.92);color:#fff}
.cr-h.natural{background:rgba(94,196,125,.22);color:#aef0c0;box-shadow:inset 0 0 0 1px rgba(94,196,125,.5)}
.cr-h.made{background:linear-gradient(180deg,#f6e2a6,#c89a47);color:#1e1405}
.cr-h.craps{color:#ff9aa0}
.cr-h.point{box-shadow:inset 0 0 0 1.5px var(--gold)}
.cr-latest{flex:none;display:flex;align-items:center;gap:3px;height:32px;padding:0 3px 0 4px;border-radius:999px;background:rgba(255,255,255,.08);margin-right:3px}
.cr-latest img{width:22px;height:22px;border-radius:5px;box-shadow:0 2px 5px rgba(0,0,0,.5)}
.cr-latest .cr-h{margin-left:3px;width:26px;height:26px;font-size:13px}
.cr-empty{font-size:10px;letter-spacing:.24em;color:var(--mute);padding:6px 8px;font-weight:700}
.cr-call{position:absolute;left:50%;top:calc(var(--top) + var(--safe-t) + 56px);z-index:28;opacity:0;pointer-events:none;text-align:center;transform:translate(-50%,-12px) scale(.92);transition:opacity .35s,transform .5s cubic-bezier(.2,.9,.25,1.25)}
.cr-call.on{opacity:1;transform:translate(-50%,0) scale(1)}
.cr-call .c-in{padding:14px 40px 16px;border-radius:24px;background:radial-gradient(120% 150% at 50% 0,rgba(46,36,14,.95),rgba(6,7,9,.94));box-shadow:inset 0 0 0 1px var(--gold),0 24px 70px rgba(0,0,0,.6),0 0 70px rgba(212,175,95,.18)}
.cr-call.lose .c-in{box-shadow:inset 0 0 0 1px rgba(208,65,75,.7),0 24px 70px rgba(0,0,0,.6),0 0 60px rgba(208,65,75,.18)}
.cr-call .c-dice{display:flex;justify-content:center;gap:8px;margin-bottom:6px}
.cr-call .c-dice img{width:30px;height:30px;border-radius:7px;box-shadow:0 4px 10px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.2)}
.cr-call .c-title{font-family:var(--display);font-style:italic;font-weight:600;font-size:clamp(38px,5.6vw,64px);line-height:1.02;padding:0 .08em;background:linear-gradient(180deg,#fff6d8,#e2bd6a 55%,#a77a2c);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 10px rgba(0,0,0,.5))}
.cr-call.lose .c-title{background:linear-gradient(180deg,#fff0f0,#e7a0a6 60%,#a8454e);-webkit-background-clip:text;background-clip:text}
.cr-call .c-sub{font-size:12px;letter-spacing:.3em;color:var(--cream);font-weight:800;text-transform:uppercase;margin-top:7px}
.cr-call .c-status{display:inline-block;margin-top:9px;padding:5px 12px;border-radius:999px;font-size:10.5px;letter-spacing:.26em;font-weight:800;text-transform:uppercase;color:#1e1405;background:linear-gradient(180deg,#f6e2a6,#c89a47)}
.cr-call.lose .c-status{color:#fff;background:rgba(196,48,60,.9)}
.cr-call .c-net{font-weight:900;font-size:24px;margin-top:8px;font-variant-numeric:tabular-nums}
.cr-call .c-net.plus{color:var(--gold-hi)}.cr-call .c-net.minus{color:#ff9aa0}
.tag.cr-t{font-size:11.5px;padding:3px 8px;display:inline-flex;align-items:center;gap:4px}
.tag.cr-t small{font-size:8.5px;letter-spacing:.14em;margin:0;opacity:.75}
.tag.cr-t.odds{background:rgba(40,32,14,.86);box-shadow:inset 0 0 0 1px var(--line-2)}
.tag.cr-t em{font-style:normal;font-size:8.5px;letter-spacing:.12em;padding:1px 5px;border-radius:999px;background:#f4efe3;color:#111216}
.tag.cr-t i{font-style:normal;font-size:10.5px;color:var(--gold-hi);font-weight:800;letter-spacing:.02em}
.cr-view{display:none;pointer-events:auto;flex:none;align-items:center;gap:5px;height:40px;padding:0 13px;border-radius:999px;background:rgba(8,10,13,.86);box-shadow:inset 0 0 0 1px var(--line-2),0 6px 16px rgba(0,0,0,.45);font-size:10.5px;letter-spacing:.18em;font-weight:800;color:var(--gold-hi)}
.cr-view span{font-size:17px;line-height:1;margin-top:-2px}
.cr-view.back{background:linear-gradient(180deg,#f6e2a6,#c89a47);color:#1e1405}
.cr-hint{position:absolute;right:18px;bottom:calc(100px + var(--safe-b));z-index:14;pointer-events:none;display:flex;align-items:center;gap:10px;height:32px;padding:0 14px 0 10px;border-radius:999px;background:rgba(6,8,10,.72);box-shadow:inset 0 0 0 1px var(--line);font-size:10px;letter-spacing:.24em;font-weight:800;color:var(--gold-hi);opacity:0;transition:opacity .5s}
.cr-hint.on{opacity:1}
.cr-hint i{width:2px;height:18px;border-radius:2px;background:linear-gradient(0deg,transparent,var(--gold-hi));animation:crSwipe 1.6s infinite}
@keyframes crSwipe{0%{transform:translateY(8px);opacity:0}30%{opacity:1}100%{transform:translateY(-8px);opacity:0}}
.cr-steps{padding-left:20px;margin-top:6px}.cr-steps li{margin:7px 0}.cr-steps em{color:var(--gold-hi);font-style:normal}
@media (max-aspect-ratio:9/10){
  .cr-hud{left:8px;right:8px;top:auto;bottom:calc(158px + var(--safe-b));flex-direction:row;align-items:center;gap:6px}
  .cr-state{padding:5px 12px 5px 5px;gap:8px}.cr-puck{width:30px;height:30px;font-size:9px}
  .cr-state b{font-size:10px;letter-spacing:.16em}.cr-state small{display:none}
  .cr-hist{flex:1;min-width:0;max-width:none;height:40px}
  .cr-state{height:40px}
  .cr-h{width:22px;height:22px;font-size:10.5px}.cr-latest{height:28px}.cr-latest img{width:18px;height:18px}.cr-latest .cr-h{width:22px;height:22px}
  .cr-view{display:flex}
  .cr-call{top:calc(var(--top) + var(--safe-t) + 70px)}
  .cr-call .c-in{padding:12px 26px 14px}
  .cr-hint{right:auto;left:50%;transform:translateX(-50%);bottom:calc(214px + var(--safe-b))}
}
`;
