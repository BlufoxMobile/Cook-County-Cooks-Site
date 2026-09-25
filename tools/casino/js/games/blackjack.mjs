// BLACKJACK — three spots, 21+3 side bets, splits, doubles, surrender,
// insurance, Ace's basic-strategy tips. 6 decks, S17, 3:2.
import * as THREE from '../vendor/three.min.mjs';
import { Game } from './base.mjs';
import { buildTable, cardShoe, discardTray, arcText, ring, text, hitSpot, glowRing, PRINT, PRINT_SOFT } from '../core/tables.mjs';
import { dealCard, flipCard, ChipPile, CARD } from '../core/props.mjs';
import { Shoe } from '../core/rng.mjs';
import { handValue, isNatural, label, dealerShouldHit, twentyOnePlus3, SIDE_PAYS, advice, settleHand } from '../rules/blackjack.mjs';
import { fmt, floatText } from '../core/hud.mjs';
import { FONT_DISPLAY, FONT_TEXT } from '../core/textures.mjs';

const ZF = -.6, TABLE = { type: 'bj', a: 1.08, b: .8, zf: ZF };
const SPOT_R = .6, SPOT_ANG = [62, 90, 118].map(d => d * Math.PI / 180);   // right, centre, left (player's view)
const MIN = 25, MAX_MAIN = 5000, MAX_SIDE = 500;
const VIEW = {
  landscape: { pos: [0, .55, .8], look: [0, .085, -.3], fov: 44, fitWidth: 1.3 },
  portrait: { pos: [0, .96, .72], look: [0, .26, -.2], fov: 52, fitWidth: 1.0, maxFov: 78 }
};

export default class Blackjack extends Game {
  static id = 'blackjack';
  async enter(first) {
    const { stage } = this;
    this.shoe = new Shoe(6, .75);
    this.backdrop.setRoom('dealer');
    this.backdrop.place({ z: ZF - .03, railY: .057, width: 1.95 });
    this.table = buildTable(stage, { outline: TABLE, felt: { color: '#0b4031', size: [2048], paint: (c, P, S) => this.paintFelt(c, P, S) }, tray: { x: 0, z: ZF + .09, w: .62, chips: this.chips } });
    this.shoeProp = cardShoe(stage, this.cards, { x: .66, z: ZF + .16, rotY: -.62 });
    this.discard = discardTray(stage, { x: -.66, z: ZF + .16, rotY: .62 });
    this.dealerPoint = new THREE.Vector3(0, .03, ZF + .1);

    this.spots = SPOT_ANG.map((a, i) => {
      const x = Math.cos(a) * SPOT_R, z = ZF + Math.sin(a) * SPOT_R;
      const side = { x: x + Math.cos(a + Math.PI / 2) * -.0, z: z + .09 };
      const sp = new THREE.Vector3(Math.cos(a) * (SPOT_R + .105), 0, ZF + Math.sin(a) * (SPOT_R + .105));
      const spot = { i, x, z, ang: a, main: new ChipPile(stage, this.chips, this.root, new THREE.Vector3(x, 0, z)), side: new ChipPile(stage, this.chips, this.root, sp), hands: [] };
      spot.sidePos = spot.side.group.position.clone();
      spot.hit = hitSpot(this.root, x, z, .075, { spot: i, kind: 'main' });
      spot.sideHit = hitSpot(this.root, spot.sidePos.x, spot.sidePos.z, .045, { spot: i, kind: 'side' });
      spot.glow = glowRing(this.root, x, z, .07);
      return spot;
    });
    this.lastBets = null; this.history = [];
    this.hints = this.bank.setting('bjHints') !== false;
    this.onTap(e => this.tap(e));
    this.onHover(() => this.phase === 'bet' ? this.spots.flatMap(s => [s.hit, s.sideHit]) : []);
    this.key({ h: () => this.press('hit'), s: () => this.press('stand'), d: () => this.press('double'), p: () => this.press('split'), r: () => this.press('surrender'), ' ': () => this.press('deal'), enter: () => this.press('deal') });
    this.hud.rack(this.rackFor(MIN), () => {});
    await stage.applyView(VIEW, first ? 0 : 1.2);
    this.betting();
    this.say('Place your bets. Tap a circle to bet, the small circle is 21+3.');
    stage.onFrame(dt => this.frame(dt));
  }

  paintFelt(c, P, S) {
    const [cx, cy] = P(0, ZF);
    arcText(c, 'BLACKJACK PAYS 3 TO 2', cx, cy, S(.335), Math.PI / 2, { font: `italic 600 ${S(.036)}px ${FONT_DISPLAY}`, color: PRINT, spacing: S(.003), inward: true });
    arcText(c, 'DEALER MUST DRAW TO 16 AND STAND ON ALL 17s', cx, cy, S(.372), Math.PI / 2, { font: `700 ${S(.0135)}px ${FONT_TEXT}`, color: PRINT_SOFT, spacing: S(.004), inward: true });
    // insurance band
    c.save(); c.strokeStyle = PRINT; c.lineWidth = S(.0025);
    c.beginPath(); c.arc(cx, cy, S(.405), Math.PI * .25, Math.PI * .75); c.stroke();
    c.beginPath(); c.arc(cx, cy, S(.445), Math.PI * .25, Math.PI * .75); c.stroke(); c.restore();
    arcText(c, 'INSURANCE PAYS 2 TO 1', cx, cy, S(.425), Math.PI / 2, { font: `800 ${S(.016)}px ${FONT_TEXT}`, color: PRINT, spacing: S(.006), inward: true });
    SPOT_ANG.forEach(a => {
      const x = Math.cos(a) * SPOT_R, z = ZF + Math.sin(a) * SPOT_R, [px, py] = P(x, z);
      ring(c, px, py, S(.07), { lw: S(.004), color: PRINT, fill: 'rgba(0,0,0,.08)' });
      ring(c, px, py, S(.062), { lw: S(.0015), color: PRINT_SOFT });
      const [sx, sy] = P(Math.cos(a) * (SPOT_R + .105), ZF + Math.sin(a) * (SPOT_R + .105));
      ring(c, sx, sy, S(.04), { lw: S(.003), color: PRINT });
      text(c, '21+3', sx, sy, { font: `800 ${S(.018)}px ${FONT_TEXT}`, color: PRINT });
    });
  }

  // ── betting ──
  betting() {
    this.phase = 'bet';
    this.hud.rackEnabled(true);
    this.renderBetUI();
  }
  totalBets() { return this.spots.reduce((a, s) => a + s.main.amount + s.side.amount, 0); }
  renderBetUI() {
    const total = this.totalBets(), hasMain = this.spots.some(s => s.main.amount >= MIN);
    this.hud.bet('TOTAL BET', total, `Table ${MIN}–${fmt(MAX_MAIN)}`);
    this.hud.affordable(this.balance);
    const canRebet = this.lastBets && this.lastBets.reduce((a, b) => a + b.main + b.side, 0) <= this.balance + total;
    this.hud.actions([
      { id: 'clear', label: 'CLEAR', onClick: () => this.clearBets(), disabled: !total },
      this.lastBets && !total ? { id: 'rebet', label: 'REBET', sub: fmt(this.lastBets.reduce((a, b) => a + b.main + b.side, 0)), onClick: () => this.rebet(), disabled: !canRebet } : { id: 'x2', label: 'DOUBLE', sub: 'ALL BETS', onClick: () => this.doubleBets(), disabled: !total || total > this.balance },
      { id: 'deal', label: 'DEAL', kind: 'primary', hot: hasMain, onClick: () => this.deal(), disabled: !hasMain, key: '␣' }
    ]);
    this.spots.forEach(s => {
      if (s.main.amount) this.hud.anchor('bet' + s.i, new THREE.Vector3(s.x, .01, s.z + .085), `<span class="tag">${fmt(s.main.amount)}</span>`); else this.hud.unanchor('bet' + s.i);
      if (s.side.amount) this.hud.anchor('side' + s.i, s.sidePos.clone().add(new THREE.Vector3(0, .01, .05)), `<span class="tag">${fmt(s.side.amount)}</span>`); else this.hud.unanchor('side' + s.i);
    });
  }
  tap(e) {
    if (this.phase !== 'bet') return;
    const h = this.stage.pick(e.clientX, e.clientY, this.spots.flatMap(s => [s.hit, s.sideHit]), false)[0];
    if (!h) return;
    const { spot, kind } = h.object.userData, s = this.spots[spot], v = this.hud.selected;
    const pile = kind === 'main' ? s.main : s.side, max = kind === 'main' ? MAX_MAIN : MAX_SIDE;
    if (pile.amount + v > max) { this.hud.toast(`Table max on that spot is ${fmt(max)}.`); return; }
    if (!this.bank.stake(v)) { this.hud.toast('Not enough chips for that one.'); return; }
    this.history.push({ pile, v });
    const from = this.chipOrigin();
    this.sound.chips(1);
    pile.add(v, from, this.tw).then(() => this.renderBetUI());
    this.renderBetUI();
  }
  chipOrigin() { const c = this.stage.camera.position; return new THREE.Vector3(c.x * .6, .05, Math.min(.5, c.z * .7)); }
  clearBets() {
    const n = this.totalBets(); if (!n) return;
    this.bank.unstake(n); this.spots.forEach(s => { s.main.clear(); s.side.clear(); }); this.history = [];
    this.sound.chips(4); this.renderBetUI();
  }
  async rebet() {
    for (const [i, b] of this.lastBets.entries()) {
      const s = this.spots[i];
      for (const [pile, amt] of [[s.main, b.main], [s.side, b.side]]) if (amt && this.bank.stake(amt)) { pile.set(pile.amount + amt); }
    }
    this.sound.chips(5); this.renderBetUI();
  }
  doubleBets() {
    const n = this.totalBets(); if (!n || !this.bank.stake(n)) return;
    this.spots.forEach(s => { s.main.set(Math.min(MAX_MAIN, s.main.amount * 2)); s.side.set(Math.min(MAX_SIDE, s.side.amount * 2)); });
    // any clamp to table max comes back to the rack
    const over = n * 2 - this.totalBets(); if (over > 0) this.bank.unstake(over);
    this.sound.chips(5); this.renderBetUI();
  }

  // ── the deal ──
  async deal() {
    if (this.phase !== 'bet' || !this.spots.some(s => s.main.amount >= MIN)) return;
    // side bets without a main bet go back
    for (const s of this.spots) if (!s.main.amount && s.side.amount) { this.bank.unstake(s.side.amount); s.side.clear(); }
    for (const s of this.spots) if (s.main.amount && s.main.amount < MIN) { this.hud.toast(`Minimum bet is ${MIN}.`); return; }
    this.phase = 'deal';
    this.lastBets = this.spots.map(s => ({ main: s.main.amount, side: s.side.amount }));
    this.staked = this.totalBets(); this.returned = 0;
    this.hud.rackEnabled(false); this.hud.actions([]);
    this.hud.clearAnchors();
    if (this.shoe.needsShuffle) { this.say('Fresh shoe. Shuffling six decks.'); this.shoe.fresh(); await this.wait(.8); }
    const active = this.spots.filter(s => s.main.amount).sort((a, b) => b.x - a.x);   // first base = player's right
    for (const s of active) s.hands = [{ cards: [], objs: [], bet: s.main.amount, pile: s.main, split: false, done: false, doubled: false }];
    this.dealer = { cards: [], objs: [] };
    this.backdrop.play('deal');
    this.say('Cards are out. Good luck.');
    for (let round = 0; round < 2; round++) {
      for (const s of active) await this.giveCard(s.hands[0], true, .14);
      await this.giveDealer(round === 0, .14);
    }
    await this.wait(.35);
    // 21+3
    for (const s of active) {
      if (!s.side.amount) continue;
      const h = s.hands[0], res = twentyOnePlus3(h.cards[0], h.cards[1], this.dealer.cards[0]);
      if (res) {
        const win = s.side.amount * SIDE_PAYS[res];
        this.returned += s.side.amount + win;
        this.hud.anchor('side' + s.i, s.sidePos.clone().add(new THREE.Vector3(0, .02, .04)), `<span class="tag win">${res.toUpperCase()} +${fmt(win)}</span>`);
        floatText(this.hud, s.sidePos.clone().add(new THREE.Vector3(0, .05, 0)), '+' + fmt(win));
        this.sound.chime(2); this.sound.chips(4);
        await this.payPile(s.side, win);
      } else {
        await s.side.sweepTo(this.dealerPoint, this.tw, { dur: .45 });
      }
    }
    this.updateLabels();
    // insurance & peek
    const up = this.dealer.cards[0];
    if (up.r === 14) {
      const ins = await this.askInsurance(active);
      const dn = isNatural(this.dealer.cards);
      for (const s of active) if (s.insurance) {
        if (dn) { this.returned += s.insurance * 3; floatText(this.hud, new THREE.Vector3(s.x, .05, s.z - .2), 'INSURANCE +' + fmt(s.insurance * 2)); }
      }
      if (ins) this.say(dn ? 'Insurance pays.' : 'No blackjack. Insurance loses.');
    }
    if ((up.r === 14 || Math.min(10, up.r) === 10)) {
      await this.wait(.3);
      if (isNatural(this.dealer.cards)) {
        this.say('Dealer has blackjack.');
        await this.revealHole();
        return this.settle(active);
      }
      if (up.r !== 14) this.say('Dealer checks… no blackjack.');
    }
    // player turns
    for (const s of active) {
      for (let hi = 0; hi < s.hands.length; hi++) await this.playHand(s, s.hands[hi], hi);
    }
    // dealer
    const live = active.some(s => s.hands.some(h => !h.surrendered && handValue(h.cards).total <= 21 && !(isNatural(h.cards) && !h.split)));
    await this.revealHole();
    if (live) {
      while (dealerShouldHit(this.dealer.cards)) { await this.wait(.35); await this.giveDealer(true, .2); this.updateLabels(); }
    }
    await this.settle(active);
  }
  cardSpot(s, hand, hi) {
    const n = hand.cards.length, split = s.hands.length > 1;
    const bx = s.x + (split ? (hi === 0 ? -.058 : .058) : 0), bz = s.z - .128;
    return new THREE.Vector3(bx + n * .02, CARD.t / 2 + .0006 * n, bz - n * .025 + (split ? .01 : 0));
  }
  async giveCard(hand, faceUp = true, dur = .16) {
    const s = this.spots.find(sp => sp.hands.includes(hand)), hi = s.hands.indexOf(hand);
    const c = this.shoe.draw(), obj = this.cards.make(c, false);
    this.root.add(obj);
    const to = this.cardSpot(s, hand, hi);
    hand.cards.push(c); hand.objs.push(obj);
    this.sound.card();
    await dealCard(this.tw, obj, this.shoeProp.mouth, to, { faceUp, dur: .38, rotY: -(s.ang - Math.PI / 2) * .6 });
    await this.wait(dur * .3);
    return c;
  }
  async giveDealer(faceUp, dur = .16) {
    const c = this.shoe.draw(), obj = this.cards.make(c, false), n = this.dealer.cards.length;
    this.root.add(obj);
    this.dealer.cards.push(c); this.dealer.objs.push(obj);
    const to = new THREE.Vector3(-.045 + n * .085 - (n > 1 ? (n - 1) * .014 : 0), CARD.t / 2, ZF + .25);
    this.sound.card();
    await dealCard(this.tw, obj, this.shoeProp.mouth, to, { faceUp, dur: .36, lift: .02 });
    await this.wait(dur * .3);
  }
  async revealHole() {
    const obj = this.dealer.objs[1];
    if (obj && !obj.userData.faceUp) {
      await this.stage.shot(this.stage.portrait ? { pos: [0, .7, .3], look: [0, 0, ZF + .26], fov: 58 } : { pos: [0, .52, .3], look: [0, 0, ZF + .22], fov: 40 }, .6);
      this.sound.card(); await flipCard(this.tw, obj);
      this.updateLabels(); await this.wait(.45);
      this.stage.back(.6);
    }
  }
  updateLabels() {
    for (const s of this.spots) s.hands.forEach((h, hi) => {
      if (!h.cards.length) return;
      const top = this.cardSpot(s, h, hi).add(new THREE.Vector3(.06, .005, .035));
      const v = handValue(h.cards), nat = isNatural(h.cards) && !h.split;
      const cls = nat ? 'tag gold big' : v.total > 21 ? 'tag bust' : 'tag';
      this.hud.anchor(`h${s.i}-${hi}`, top, `<span class="${cls}">${nat ? 'BLACKJACK' : v.total > 21 ? 'BUST ' + v.total : label(h.cards)}${h.doubled ? '<small>×2</small>' : ''}</span>`);
    });
    if (this.dealer?.cards.length) {
      const visible = this.dealer.objs.map((o, i) => o.userData.faceUp ? this.dealer.cards[i] : null).filter(Boolean);
      const v = handValue(visible);
      this.hud.anchor('dealer', new THREE.Vector3(-.13, .01, ZF + .25), `<span class="tag ${v.total > 21 ? 'bust' : ''}">${isNatural(this.dealer.cards) && visible.length === 2 ? 'BLACKJACK' : v.total > 21 ? 'BUST' : 'DEALER ' + label(visible)}</span>`);
    }
  }
  askInsurance(active) {
    return new Promise(res => {
      const cost = active.reduce((a, s) => a + s.hands[0].bet / 2, 0);
      this.say('Ace showing. Insurance?');
      this.hud.actions([
        { id: 'no', label: 'NO THANKS', onClick: () => { this.hud.actions([]); res(false); } },
        { id: 'yes', label: 'INSURE', sub: fmt(cost), kind: 'primary', disabled: cost > this.balance, onClick: () => {
          for (const s of active) { const c = s.hands[0].bet / 2; if (this.bank.stake(c)) { s.insurance = c; this.staked += c; } }
          this.sound.chips(3); this.hud.actions([]); res(true);
        } }
      ]);
    });
  }
  legal(s, hand) {
    const two = hand.cards.length === 2;
    return {
      double: two && this.balance >= hand.bet && !(hand.split && hand.cards[0].r === 14),
      split: two && !hand.split && s.hands.length === 1 && Math.min(10, hand.cards[0].r) === Math.min(10, hand.cards[1].r) && hand.cards[0].r === hand.cards[1].r && this.balance >= hand.bet,
      surrender: two && !hand.split && s.hands.length === 1
    };
  }
  async playHand(s, hand, hi) {
    if (isNatural(hand.cards) && !hand.split) { hand.done = true; return; }
    if (hand.split && hand.cards[0].r === 14) { hand.done = true; return; }   // split aces: one card each
    s.glow.material.opacity = .85;
    const focus = this.cardSpot(s, hand, hi);
    this.stage.shot(this.stage.portrait ? { pos: [focus.x * .4, .66, .5], look: [focus.x * .7, 0, focus.z - .05], fov: 60 } : { pos: [focus.x * .5, .5, .55], look: [focus.x * .8, 0, focus.z + .02], fov: 40 }, .5);
    while (!hand.done) {
      const v = handValue(hand.cards).total;
      if (v >= 21) { hand.done = true; break; }
      const act = await this.choose(s, hand);
      if (act === 'stand') hand.done = true;
      else if (act === 'hit') { await this.giveCard(hand); this.updateLabels(); }
      else if (act === 'double') {
        if (!this.bank.stake(hand.bet)) continue;
        this.staked += hand.bet; hand.bet *= 2; hand.doubled = true; this.sound.chips(3);
        this.sound.chips(3);
        hand.pile.set(hand.bet);
        await this.giveCard(hand); this.updateLabels(); hand.done = true;
      } else if (act === 'split') {
        if (!this.bank.stake(hand.bet)) continue;
        this.staked += hand.bet;
        const card2 = hand.cards.pop(), obj2 = hand.objs.pop();
        const pile2 = new ChipPile(this.stage, this.chips, this.root, new THREE.Vector3(s.x + .055, 0, s.z));
        pile2.set(hand.bet);
        hand.pile.group.position.x = s.x - .055;
        const h2 = { cards: [card2], objs: [obj2], bet: hand.bet, pile: pile2, split: true, done: false };
        hand.split = true; s.hands.push(h2); s.extraPiles = [pile2];
        this.sound.chips(3);
        // slide the cards apart
        const a = this.cardSpot(s, { cards: [] }, 0), b = this.cardSpot(s, { cards: [] }, 1);
        await Promise.all([this.tw.to(hand.objs[0].position, { x: a.x, z: a.z }, { dur: .3 }), this.tw.to(obj2.position, { x: b.x, z: b.z, y: a.y }, { dur: .3 })]);
        await this.giveCard(hand); await this.giveCard(h2); this.updateLabels();
        if (hand.cards[0].r === 14) { hand.done = true; h2.done = true; }
      } else if (act === 'surrender') {
        hand.surrendered = true; hand.done = true;
        this.hud.anchor(`h${s.i}-${hi}`, focus.clone().add(new THREE.Vector3(0, .01, -.06)), `<span class="tag">SURRENDERED</span>`);
      }
    }
    s.glow.material.opacity = 0;
    this.hud.actions([]);
  }
  choose(s, hand) {
    return new Promise(res => {
      const lg = this.legal(s, hand), tip = this.hints ? advice(hand.cards, this.dealer.cards[0], lg) : null;
      const v = handValue(hand.cards);
      this.say(`${v.soft ? 'Soft ' : ''}${v.total} against a ${label([this.dealer.cards[0]])}.${tip ? ' ' + this.tipLine(tip) : ''}`);
      this.pending = res;
      const b = (id, lbl, extra = {}) => ({ id, label: lbl, onClick: () => { this.pending = null; res(id); }, hot: tip === id, sub: tip === id ? 'ACE SAYS' : extra.sub, ...extra });
      this.hud.actions([
        lg.surrender ? b('surrender', 'SURRENDER', { sub: 'HALF BACK' }) : null,
        lg.split ? b('split', 'SPLIT', { key: 'P' }) : null,
        lg.double ? b('double', 'DOUBLE', { key: 'D' }) : null,
        b('stand', 'STAND', { key: 'S' }),
        b('hit', 'HIT', { kind: 'primary', key: 'H' })
      ]);
    });
  }
  tipLine(t) { return { hit: 'Ace would hit.', stand: 'Ace would stand.', double: 'Ace would double.', split: 'Ace would split.', surrender: 'Ace would surrender.' }[t]; }
  press(id) {
    if (id === 'deal') { if (this.phase === 'bet') this.deal(); return; }
    const btn = document.querySelector(`#actions .act[data-id="${id}"]:not(:disabled)`); btn?.click();
  }

  async payPile(pile, win) {
    // winnings slide out of the dealer's tray and land next to the bet, then both come home
    const pay = new ChipPile(this.stage, this.chips, this.root, pile.group.position.clone().add(new THREE.Vector3(.045, 0, -.02)));
    pay.set(win);
    const target = pay.group.position.clone(); pay.group.position.copy(this.dealerPoint);
    await this.tw.to(pay.group.position, { x: target.x, y: target.y, z: target.z }, { dur: .5, ease: 'outCubic' });
    await this.wait(.35);
    const home = this.chipOrigin();
    await Promise.all([pile.sweepTo(home, this.tw, { dur: .5 }), pay.sweepTo(home, this.tw, { dur: .55 })]);
    pay.dispose();
  }
  async settle(active) {
    this.phase = 'settle';
    this.updateLabels();
    let net = 0, blackjack = false, doubledWin = false, anyWin = false, allLose = true;
    const results = [];
    for (const s of active) for (const [hi, h] of s.hands.entries()) {
      const r = settleHand(h, this.dealer.cards);
      results.push({ s, h, hi, ...r });
      this.returned += r.returned;
      if (r.result === 'blackjack') blackjack = true;
      if (r.result === 'win' && h.doubled) doubledWin = true;
      if (r.returned > h.bet) anyWin = true;
      if (r.returned > 0) allLose = false;
    }
    net = this.returned - this.staked;
    // physically move the chips
    const moves = results.map(async ({ s, h, hi, result, returned }) => {
      const at = this.cardSpot(s, h, hi).add(new THREE.Vector3(.06, .01, .035));
      const tag = { blackjack: ['tag gold big', 'BLACKJACK +' + fmt(returned - h.bet)], win: ['tag win', 'WIN +' + fmt(returned - h.bet)], push: ['tag', 'PUSH'], lose: ['tag lose', 'LOSE'], bust: ['tag bust', 'BUST'], surrender: ['tag', 'SURRENDER'] }[result];
      this.hud.anchor(`h${s.i}-${hi}`, at, `<span class="${tag[0]}">${tag[1]}</span>`);
      if (returned > h.bet) { await this.payPile(h.pile, returned - h.bet); }
      else if (result === 'push') { await this.wait(.4); await h.pile.sweepTo(this.chipOrigin(), this.tw, { dur: .5 }); }
      else if (result === 'surrender') { await h.pile.sweepTo(this.dealerPoint, this.tw, { dur: .5 }); }
      else { await this.wait(.2); await h.pile.sweepTo(this.dealerPoint, this.tw, { dur: .5 }); }
    });
    if (anyWin) this.sound.chips(6);
    await Promise.all(moves);
    this.bank.settle(this.staked, this.returned, 'blackjack');
    this.emit('hand', { net, natural: blackjack, doubledWin, won: net > 0 });
    if (net > 0) { this.sound.play('win', { vol: .6 }); this.backdrop.play(net >= this.staked * 2 && net >= 500 ? 'big' : 'win'); }
    else if (net < 0 && allLose) { this.sound.lose(); this.backdrop.play('lose'); }
    const title = blackjack ? 'Blackjack!' : net > 0 ? 'You win' : net === 0 ? 'Push' : 'Dealer wins';
    this.say(net > 0 ? 'Nicely played.' : net === 0 ? 'Even money back to you.' : 'The house takes that one. Next hand.');
    await this.hud.banner({ title, amount: net !== 0 ? net : null, kind: net > 0 ? (blackjack ? 'big' : 'win') : net === 0 ? 'push' : 'lose', hold: 1.4 });
    await this.clearTable(active);
    if (!this.alive) return;
    this.betting();
    this.say(this.balance < MIN ? 'You’re out of chips — Ace’s marker is waiting in the lobby.' : 'Place your bets.');
  }
  async clearTable(active) {
    const objs = [...active.flatMap(s => s.hands.flatMap(h => h.objs)), ...this.dealer.objs];
    this.hud.clearAnchors();
    await Promise.all(objs.map((o, i) => this.tw.run(.45, (e, p) => {
      o.position.lerp(this.discard.point, e * .5 + .02); o.position.y += Math.sin(p * Math.PI) * .004;
      if (o.userData.faceUp) o.rotation.z = Math.PI * e;
    }, { delay: i * .03, ease: 'inOutCubic' })));
    for (const o of objs) this.root.remove(o);
    for (const s of active) { s.hands = []; s.insurance = 0; s.main.group.position.x = s.x; for (const p of s.extraPiles || []) p.dispose(); s.extraPiles = []; }
    this.spots.forEach(s => { s.main.set(0); s.side.set(0); });
    this.history = [];
  }
  frame(dt) {
    const t = performance.now() / 1000;
    if (this.phase === 'bet') for (const s of this.spots) s.glow.material.opacity = s.main.amount ? 0 : .25 + .2 * Math.sin(t * 2.4 + s.i);
  }
  help() {
    return `<p class="eyebrow">TABLE RULES</p><h2>Blackjack <em>3 to 2</em></h2>
    <ul><li>Six decks, reshuffled at the cut card. Dealer stands on all 17s.</li><li>Blackjack pays 3 to 2. Insurance pays 2 to 1.</li><li>Double on any first two cards, including after a split.</li><li>Split any pair once. Split aces get one card each.</li><li>Late surrender: give up your first two cards for half your bet back.</li><li>Play up to three spots. Table limits ${MIN}–${fmt(MAX_MAIN)}.</li></ul>
    <h3>21+3 SIDE BET</h3><p>Your two cards plus the dealer’s up card, read as a poker hand:</p>
    <table class="paytable">${Object.entries(SIDE_PAYS).map(([k, v]) => `<tr><td>${k}</td><td class="r">${v} to 1</td></tr>`).join('')}</table>
    <h3>ACE’S TIPS</h3><p>Ace lights up the basic-strategy play on your buttons. <button class="btn" id="tips-toggle" style="height:34px;margin-left:6px">${this.hints ? 'TURN OFF' : 'TURN ON'}</button></p>
    <h3>KEYS</h3><p class="muted">H hit · S stand · D double · P split · R surrender · Space deal</p>`;
  }
}
document.addEventListener('click', e => {
  if (e.target.id === 'tips-toggle') {
    const g = window.__casino?.current; if (!g || !(g instanceof Blackjack)) return;
    g.hints = !g.hints; g.bank.setting('bjHints', g.hints); e.target.textContent = g.hints ? 'TURN OFF' : 'TURN ON';
  }
});
