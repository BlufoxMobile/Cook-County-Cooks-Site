// Blufox Casino & Lounge — app shell: boot, lobby, routing, top bar, sheets.
import * as THREE from './vendor/three.min.mjs';
import { Stage } from './core/stage.mjs';
import { Backdrop } from './core/dealer.mjs';
import { CardFactory, ChipFactory } from './core/props.mjs';
import { Bank, Events, Challenges, BONUS_LADDER, isoWeek } from './core/economy.mjs';
import { Board, DISTRICTS } from './core/board.mjs';
import { Sound } from './core/audio.mjs';
import { Hud, fmt, esc } from './core/hud.mjs';

export const GAMES = [
  { id: 'blackjack', title: 'Blackjack', sub: 'THE CLASSIC 21', tag: '3:2 PAYS', load: () => import('./games/blackjack.mjs') },
  { id: 'holdem', title: 'Texas Hold’em', sub: 'SIX SEATS · NO LIMIT', tag: '5 RIVALS', load: () => import('./games/holdem.mjs') },
  { id: 'roulette', title: 'Roulette', sub: 'EUROPEAN · SINGLE ZERO', tag: '35 TO 1', load: () => import('./games/roulette.mjs') },
  { id: 'slots', title: 'Midnight Fox', sub: '5 REELS · 20 LINES', tag: 'FREE SPINS', load: () => import('./games/slots.mjs') },
  { id: 'baccarat', title: 'Baccarat', sub: 'PUNTO BANCO', tag: 'HIGH ROLLER', load: () => import('./games/baccarat.mjs') },
  { id: 'craps', title: 'Craps', sub: 'THE HOTTEST TABLE', tag: 'ROLL IT', load: () => import('./games/craps.mjs') },
  { id: 'videopoker', title: 'Video Poker', sub: 'JACKS OR BETTER', tag: '9/6 FULL PAY', load: () => import('./games/videopoker.mjs') }
];

const $ = s => document.querySelector(s);
const app = $('#app');
const setView = v => { app.dataset.view = v; };
const progress = (p, msg) => { $('#ld-fill').style.width = Math.round(p * 100) + '%'; if (msg) $('#ld-msg').textContent = msg; };

class Casino {
  async boot() {
    progress(.08, 'Setting the tables…');
    if (window.self !== window.top) document.documentElement.style.setProperty('--corner', '52px');
    this.events = new Events();
    this.bank = new Bank(this.events);
    this.challenges = new Challenges(this.bank, this.events);
    this.board = new Board(this.bank, this.events);
    this.sound = new Sound(this.bank);
    try { this.stage = new Stage($('#stage')); }
    catch (e) { this.fatal('This device could not start 3D graphics. Try a newer browser, or turn off Low Power Mode.'); return; }
    const mobile = this.stage.tier !== 'high' || innerWidth < 700;
    this.backdrop = new Backdrop(this.stage, { mobile });
    progress(.3, 'Shuffling six decks…');
    this.cards = new CardFactory(this.stage);
    this.chips = new ChipFactory(this.stage);
    await this.cards.ready;
    progress(.55, 'Racking the chips…');
    this.hud = new Hud(app, this.stage, this.sound);
    this.ctx = { stage: this.stage, backdrop: this.backdrop, cards: this.cards, chips: this.chips, bank: this.bank, events: this.events, sound: this.sound, hud: this.hud, challenges: this.challenges, board: this.board, app: this };
    this.wireTop();
    this.renderLobby();
    this.events.on('balance', e => this.showBalance(e));
    this.events.on('challenges', () => this.updateBadge());
    this.events.on('challenge-done', c => { this.hud.toast(`Challenge complete · <b>${esc(c.text)}</b><br>Tap ★ to collect ${fmt(c.reward)} chips`, 'gold'); this.sound.chime(2); this.updateBadge(); });
    this.showBalance({ balance: this.bank.balance }, true);
    this.updateBadge();
    this.stage.start();
    progress(.75, 'Ace is on his way…');
    // Ace's idle loop; don't hold the lobby hostage to it
    await Promise.race([this.backdrop.start(), new Promise(r => setTimeout(r, 2500))]);
    progress(1, 'Welcome in.');
    const unlock = () => { this.sound.unlock(); this.backdrop.kick(); };
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.backdrop.pause(); this.sound.suspend(); } else { this.backdrop.resume(); this.sound.resume(); } });
    addEventListener('popstate', () => this.route());
    await this.route(true);
    setTimeout(() => $('#loader').classList.add('off'), 250);
    if (this.bank.refunded) this.hud.toast(`Ace returned <b>${fmt(this.bank.refunded)}</b> chips from a hand you left mid-deal.`, 'gold');
    else if (this.bank.fresh) setTimeout(() => this.welcome(), 900);
  }
  fatal(msg) {
    $('#loader').innerHTML = `<div class="ld-mark">C<sup>3</sup></div><div class="ld-title">BLUFOX <em>Casino</em></div><p class="ld-msg" style="max-width:320px;text-align:center;line-height:1.7;letter-spacing:.08em">${esc(msg)}</p>`;
  }

  // ── balance ──
  showBalance({ balance }, instant = false) {
    const el = $('#balance'), from = this.shown ?? balance, to = balance, bank = $('#bank');
    this.shown = to;
    if (instant || from === to) { el.textContent = fmt(to); return; }
    bank.classList.remove('bump', 'down'); void bank.offsetWidth; bank.classList.add(to > from ? 'bump' : 'down');
    const t0 = performance.now(), dur = 600;
    const step = now => { const p = Math.min(1, (now - t0) / dur); el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1 && this.shown === to) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    if (app.dataset.view === 'lobby') this.renderStrip();
  }
  updateBadge() { const n = this.challenges.unclaimed, b = $('#chal-badge'); b.hidden = !n; b.textContent = n; }

  // ── top bar ──
  wireTop() {
    $('#home').onclick = () => { if (app.dataset.view === 'game') this.go(''); };
    $('#btn-challenges').onclick = () => this.sheetChallenges();
    $('#btn-board').onclick = () => this.sheetBoard();
    $('#btn-sound').onclick = () => this.sheetSound();
    $('#btn-help').onclick = () => this.current?.help ? this.hud.sheet(this.current.help(), 'wide') : null;
    $('#bank').onclick = () => this.sheetBank();
    this.sound.onchange = () => $('#btn-sound').classList.toggle('off', !this.sound.sfxOn && !this.sound.musicOn);
    this.sound.onchange();
  }

  // ── routing ──
  go(id) { history.pushState(null, '', id ? '#' + id : location.pathname + location.search); this.route(); }
  async route(first = false) {
    const id = location.hash.slice(1);
    const g = GAMES.find(x => x.id === id);
    if (this.routing) { this.pendingRoute = true; return; }
    this.routing = true;
    try {
      if (g) await this.enterGame(g, first); else await this.enterLobby(first);
    } finally {
      this.routing = false;
      if (this.pendingRoute) { this.pendingRoute = false; this.route(); }
    }
  }
  async leaveCurrent() {
    if (document.querySelector('#sheet.on')) this.hud.closeSheet();
    this.stage.resetRig();
    this.backdrop.setDim(1);
    if (!this.current) return;
    const c = this.current; this.current = null;
    await c.exit();
    this.stage.clearWorld();
    this.stage.resetRig();
    this.backdrop.setDim(1);
  }
  async enterLobby(first) {
    await this.leaveCurrent();
    this.hud.showConsole(false); this.hud.say('');
    $('#gametitle').innerHTML = '';
    setView('lobby');
    this.backdrop.setRoom('dealer');
    this.backdrop.place({ z: -.6, railY: .06, width: 3.3 });
    this.lobbyScene();
    const v = { landscape: { pos: [-.36, .48, .82], look: [-.5, .46, -.6], fov: 44 }, portrait: { pos: [0, .3, .9], look: [0, .24, -.6], fov: 56 } };
    if (first) this.stage.applyView(v, 0); else { this.stage.applyView(v, 1.1); }
    this.renderStrip();
    $('#lobby').scrollTop = 0;
  }
  lobbyScene() {
    // an empty table in front of Ace, lit, with a few chips — the lobby's set dressing
    import('./core/tables.mjs').then(({ buildTable }) => {
      if (app.dataset.view !== 'lobby' || this.lobbyBuilt) return;
      this.lobbyBuilt = true;
      const t = buildTable(this.stage, { outline: { type: 'bj', a: 1.05, b: .78, zf: -.6 }, felt: { color: '#0f4a39', size: [1024, 512] } });
      const dust = makeDust(); this.stage.world.add(dust);
      const off = this.stage.onFrame(dt => { dust.rotation.y += dt * .01; dust.children[0].material.uniforms.t.value += dt; });
      this.lobbyCleanup = () => { off(); this.lobbyBuilt = false; };
      this.stage.world.userData.lobby = t;
    });
  }
  async enterGame(g, first) {
    this.lobbyCleanup?.(); this.lobbyCleanup = null;
    await this.leaveCurrent();
    this.stage.clearWorld();
    setView('game');
    $('#gametitle').innerHTML = `<b>${esc(g.title.toUpperCase())}</b> &nbsp;·&nbsp; ${esc(g.sub)}`;
    this.hud.say('');
    let mod;
    try { mod = await g.load(); }
    catch (e) { console.error(e); this.hud.toast('That table could not open. Check your connection and try again.'); this.go(''); return; }
    const game = new mod.default(this.ctx);
    this.current = game;
    this.events.emit('game', { game: g.id, type: 'enter' });
    await game.enter(first);
    this.hud.showConsole(true);
  }

  // ── lobby ──
  renderLobby() {
    $('#tiles').innerHTML = GAMES.map((g, i) => `
      <button class="tile" data-id="${g.id}" aria-label="Play ${esc(g.title)}">
        <img src="assets/img/tile-${g.id}.webp" alt="" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async">
        <span class="t-num">${String(i + 1).padStart(2, '0')}</span><span class="t-tag">${esc(g.tag)}</span>
        <span class="t-body"><h3>${esc(g.title)}</h3><p>${esc(g.sub)}</p><span class="t-play">TAKE A SEAT →</span></span>
      </button>`).join('');
    $('#tiles').querySelectorAll('.tile').forEach(b => b.onclick = () => { this.sound.unlock(); this.sound.whoosh(); this.go(b.dataset.id); });
    this.renderStrip();
  }
  renderStrip() {
    const b = this.bank.bonusState(), r = this.bank.rescueState(), ch = this.challenges.list, done = ch.filter(c => c.done).length;
    let first;
    if (r.needed) first = `<div class="strip-card glow"><span class="strip-icon">A</span><div><div class="k">ACE’S MARKER</div><div class="v">${fmt(2500)} chips</div><div class="s">${r.ready ? 'Running low? The house covers you.' : 'Back in ' + Math.ceil(r.wait / 60000) + ' min'}</div></div><button class="go" data-a="rescue" ${r.ready ? '' : 'disabled'}>TAKE IT</button></div>`;
    else if (b.available) first = `<div class="strip-card glow"><span class="strip-icon">★</span><div><div class="k">DAILY BONUS · DAY ${b.day}</div><div class="v">${fmt(b.amount)} chips</div><div class="s">Come back tomorrow for ${fmt(BONUS_LADDER[Math.min(b.day, BONUS_LADDER.length - 1)])}</div></div><button class="go" data-a="bonus">COLLECT</button></div>`;
    else first = `<div class="strip-card"><span class="strip-icon">✓</span><div><div class="k">DAILY BONUS</div><div class="v">Collected</div><div class="s">Tomorrow: ${fmt(b.next)} chips · day ${this.bank.s.streak + 1 > 7 ? 7 : this.bank.s.streak + 1} streak</div></div></div>`;
    $('#lobby-strip').innerHTML = first + `
      <button class="strip-card" data-a="chal"><span class="strip-icon" style="background:radial-gradient(circle at 35% 30%,#dfe9ff,#6d95e8 45%,#1f3f8f 85%);color:#fff">★</span><div><div class="k">TODAY’S CHALLENGES</div><div class="v">${done} of ${ch.length} done</div><div class="s">${esc(ch.find(c => !c.done)?.text || 'All done — collect your chips')}</div></div><span class="go">${this.challenges.unclaimed ? 'COLLECT' : 'VIEW'}</span></button>
      <button class="strip-card" data-a="board"><span class="strip-icon" style="background:radial-gradient(circle at 35% 30%,#fff,#c9ccd4 45%,#6b707c 85%)">♛</span><div><div class="k">BIGGEST STACK · THIS WEEK</div><div class="v">${fmt(this.bank.s.weekPeak)}</div><div class="s">${this.board.registered ? 'Your best this week' : 'Put your name on the board'}</div></div><span class="go">BOARD</span></button>`;
    $('#lobby-strip').querySelectorAll('[data-a]').forEach(el => el.onclick = () => {
      this.sound.unlock();
      const a = el.dataset.a;
      if (a === 'bonus') { const n = this.bank.claimBonus(); if (n) { this.sound.fanfare(); this.hud.banner({ title: 'Daily Bonus', amount: n, kind: 'big', sub: 'DAY ' + this.bank.s.streak + ' STREAK' }); this.backdrop.play('big'); } this.renderStrip(); }
      if (a === 'rescue') { const n = this.bank.rescue(); if (n) { this.sound.chime(2); this.hud.toast(`Ace slides you <b>${fmt(n)}</b> chips. Make them count.`, 'gold'); } this.renderStrip(); }
      if (a === 'chal') this.sheetChallenges();
      if (a === 'board') this.sheetBoard();
    });
  }
  welcome() {
    this.hud.sheet(`<p class="eyebrow">WELCOME TO THE LOUNGE</p><h2>Good evening. <em>I’m Ace.</em></h2>
      <p>You start with <b>${fmt(10000)} play chips</b>. They stay on this device between visits — win some, lose some, come back tomorrow for a bonus.</p>
      <p style="margin-top:10px">Seven games tonight: Blackjack, Texas Hold’em against five regulars, Roulette, the Midnight Fox slot, Baccarat, Craps and Video Poker.</p>
      <p class="muted" style="margin-top:12px">Play chips only. Nothing to buy, nothing to cash out.</p>
      <div class="row"><button class="btn primary" data-close>LET’S PLAY</button></div>`);
  }

  // ── sheets ──
  sheetChallenges() {
    const render = () => {
      const card = this.hud.sheet(`<p class="eyebrow">RESETS AT MIDNIGHT</p><h2>Today’s <em>challenges</em></h2>
        ${this.challenges.list.map(c => `<div class="chal ${c.done ? 'done' : ''}"><div class="txt">${esc(c.text)}<div class="bar"><i style="width:${Math.round(c.n / c.goal * 100)}%"></i></div><div class="rw">${fmt(c.reward)} chips · ${c.n}/${c.goal}</div></div>
        ${c.done && !c.claimed ? `<button class="btn primary" data-claim="${c.id}">COLLECT</button>` : c.claimed ? '<span class="muted">Collected ✓</span>' : c.game ? `<button class="btn" data-play="${c.game}">PLAY</button>` : ''}</div>`).join('')}`);
      card.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => { const n = this.challenges.claim(b.dataset.claim); if (n) { this.sound.fanfare(); this.hud.toast(`<b>+${fmt(n)}</b> chips collected`, 'gold'); } render(); if (app.dataset.view === 'lobby') this.renderStrip(); });
      card.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { this.hud.closeSheet(); this.go(b.dataset.play); });
    };
    render();
  }
  async sheetBoard(district = '') {
    const card = this.hud.sheet(`<p class="eyebrow">WEEK ${esc(isoWeek().split('-W')[1])} · RESETS MONDAY</p><h2>Biggest <em>Stack</em></h2><p class="muted">Your highest chip balance this week, across every Blufox player.</p>
      <div class="seg" style="margin-top:12px">${['', ...DISTRICTS].map(d => `<button data-d="${esc(d)}" class="${d === district ? 'on' : ''}">${d ? esc(d.toUpperCase()) : 'ALL'}</button>`).join('')}</div>
      <div id="board-body"><p class="muted" style="margin-top:16px">Loading the board…</p></div>
      ${this.board.registered ? `<p class="muted" style="margin-top:12px">Playing as <b>${esc(this.bank.s.name)}</b> · ${esc(this.bank.s.store)} · <a href="#" id="rename" style="color:var(--gold)">change</a></p>` : this.nameForm()}`, 'wide');
    card.querySelectorAll('[data-d]').forEach(b => b.onclick = () => this.sheetBoard(b.dataset.d));
    this.bindNameForm(card, () => this.sheetBoard(district));
    card.querySelector('#rename')?.addEventListener('click', e => { e.preventDefault(); card.querySelector('#board-body').insertAdjacentHTML('afterend', this.nameForm()); this.bindNameForm(card, () => this.sheetBoard(district)); });
    const data = await this.board.top(district);
    const body = card.querySelector('#board-body'); if (!body) return;
    if (!data.rows.length) { body.innerHTML = `<p class="muted" style="margin-top:16px">${data.ok ? 'Nobody on the board yet this week. Be first.' : 'The board is offline right now — your chips are safe on this device.'}</p>`; return; }
    body.innerHTML = `<table><tr><th>#</th><th>PLAYER</th><th>DISTRICT</th><th class="r">PEAK STACK</th></tr>${data.rows.slice(0, 25).map((r, i) => `<tr class="${r.id === this.bank.id ? 'me' : ''}"><td>${r.rank || i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.district || '')}</td><td class="r">${fmt(r.peak)}</td></tr>`).join('')}</table>${data.ok ? '' : '<p class="muted" style="margin-top:8px">Offline — showing this device only.</p>'}`;
  }
  nameForm() {
    return `<h3>PUT YOUR NAME UP</h3><div class="field"><label for="nm">NAME ON THE BOARD</label><input id="nm" maxlength="20" autocomplete="nickname" placeholder="First name + last initial" value="${esc(this.bank.s.name)}"></div>
      <div class="field"><label for="dt">DISTRICT</label><select id="dt">${DISTRICTS.map(d => `<option ${d === this.bank.s.store ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
      <div class="row"><button class="btn primary" id="save-name">SAVE</button></div>`;
  }
  bindNameForm(card, after) {
    const btn = card.querySelector('#save-name'); if (!btn) return;
    btn.onclick = () => { const n = card.querySelector('#nm').value.trim(); if (!n) { card.querySelector('#nm').focus(); return; } this.board.setIdentity(n, card.querySelector('#dt').value); this.hud.toast(`You’re on the board, <b>${esc(this.bank.s.name)}</b>.`, 'gold'); setTimeout(after, 600); };
  }
  sheetSound() {
    const s = this.sound, q = this.stage.tier;
    const card = this.hud.sheet(`<p class="eyebrow">SETTINGS</p><h2>Sound &amp; <em>picture</em></h2>
      <h3>MUSIC · C³ LATE SHIFT</h3><div class="seg"><button data-m="1" class="${s.musicOn ? 'on' : ''}">ON</button><button data-m="0" class="${!s.musicOn ? 'on' : ''}">OFF</button></div>
      <h3>TABLE SOUNDS</h3><div class="seg"><button data-f="1" class="${s.sfxOn ? 'on' : ''}">ON</button><button data-f="0" class="${!s.sfxOn ? 'on' : ''}">OFF</button></div>
      <h3>VOLUME</h3><input id="vol" type="range" min="0" max="1" step=".05" value="${s.vol}" style="width:100%;accent-color:#d4af5f">
      <h3>GRAPHICS</h3><div class="seg">${['high', 'mid', 'low'].map(t => `<button data-q="${t}" class="${q === t ? 'on' : ''}">${{ high: 'CINEMATIC', mid: 'BALANCED', low: 'BATTERY SAVER' }[t]}</button>`).join('')}</div>
      <p class="muted" style="margin-top:8px">Picked automatically for this device. Battery Saver turns off shadows and glow.</p>`);
    card.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { s.unlock(); s.setMusic(b.dataset.m === '1'); this.sheetSound(); });
    card.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { s.setSfx(b.dataset.f === '1'); this.sheetSound(); });
    card.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { this.stage.setTier(b.dataset.q); this.sheetSound(); });
    card.querySelector('#vol').oninput = e => s.setVolume(+e.target.value);
  }
  sheetBank() {
    const st = this.bank.s.stats, r = this.bank.rescueState();
    const card = this.hud.sheet(`<p class="eyebrow">YOUR CHIPS</p><h2>${fmt(this.bank.balance)} <em>play chips</em></h2>
      <table><tr><td>Best stack this week</td><td class="r">${fmt(this.bank.s.weekPeak)}</td></tr><tr><td>Best stack ever</td><td class="r">${fmt(this.bank.s.allTimePeak)}</td></tr>
      <tr><td>Hands &amp; spins played</td><td class="r">${fmt(st.hands)}</td></tr><tr><td>Won</td><td class="r">${fmt(st.wins)}</td></tr><tr><td>Biggest single win</td><td class="r">${fmt(st.biggestWin)}</td></tr></table>
      ${r.needed ? `<div class="row"><button class="btn primary" id="rescue" ${r.ready ? '' : 'disabled'}>${r.ready ? 'TAKE ACE’S MARKER · 2,500' : 'MARKER BACK IN ' + Math.ceil(r.wait / 60000) + ' MIN'}</button></div>` : ''}
      <p class="muted" style="margin-top:14px">Play chips only — they can’t be bought, sold or cashed out, and they live on this device.</p>`);
    card.querySelector('#rescue')?.addEventListener('click', () => { const n = this.bank.rescue(); if (n) this.hud.toast(`Ace slides you <b>${fmt(n)}</b> chips.`, 'gold'); this.hud.closeSheet(); });
  }
}

function makeDust() {
  const n = 260, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 3.4; pos[i * 3 + 1] = Math.random() * 1.2 + .05; pos[i * 3 + 2] = (Math.random() - .5) * 2.4 - .1; seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { t: { value: 0 } },
    vertexShader: `attribute float seed; uniform float t; varying float a; void main(){ vec3 p=position; p.y+=sin(t*.3+seed*20.)*.03; p.x+=cos(t*.2+seed*13.)*.02; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(2.+seed*3.)*(1.6/-mv.z); a=.25+.35*sin(t*.8+seed*40.); }`,
    fragmentShader: `varying float a; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(1.,.85,.55,a*smoothstep(.5,0.,d)); }`
  });
  const pts = new THREE.Points(g, m); pts.userData.ownGeo = pts.userData.ownMat = true;
  const grp = new THREE.Group(); grp.add(pts); return grp;
}

const casino = new Casino();
window.__casino = casino;
casino.boot().catch(e => { console.error(e); casino.fatal('Something went wrong opening the lounge. Reload to try again.'); });
