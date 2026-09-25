// HTML overlay: top bar, console (chip rack + action buttons), Ace's line,
// 3D-anchored labels, result banners, toasts and modal sheets.
import { chipImageURL, DENOMS } from './textures.mjs';

const $ = (s, r = document) => r.querySelector(s);
export const fmt = n => Math.round(n).toLocaleString('en-US');
export const fmtShort = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : fmt(n);
export function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export class Hud {
  constructor(root, stage, sound) {
    this.root = root; this.stage = stage; this.sound = sound;
    this.anchorsEl = $('#anchors', root);
    this.anchors = new Map();
    this.statusEl = $('#status', root);
    this.rackEl = $('#rack', root);
    this.actionsEl = $('#actions', root);
    this.betEl = $('#betinfo', root);
    this.bannerEl = $('#banner', root);
    this.toastEl = $('#toast', root);
    this.sheetEl = $('#sheet', root);
    this.consoleEl = $('#console', root);
    this.selected = 25;
    stage.onFrame(() => this.placeAnchors());
    this.sheetEl.addEventListener('click', e => { if (e.target === this.sheetEl || e.target.closest('[data-close]')) this.closeSheet(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.sheetEl.classList.contains('on')) this.closeSheet(); });
  }

  // ── Ace's line / game status ──
  say(text, { who = 'ACE' } = {}) {
    if (!text) { this.statusEl.classList.remove('on'); return; }
    this.statusEl.innerHTML = `${who ? `<b>${esc(who)}</b>` : ''}<span>${esc(text)}</span>`;
    this.statusEl.classList.remove('on'); void this.statusEl.offsetWidth; this.statusEl.classList.add('on');
  }
  showConsole(on) { this.consoleEl.classList.toggle('on', on); }

  // ── chip rack ──
  rack(denoms, onSelect, { disabled = false } = {}) {
    this.rackDenoms = denoms; this.onRack = onSelect;
    if (denoms.length && !denoms.includes(this.selected)) this.selected = denoms[Math.min(1, denoms.length - 1)];
    this.rackEl.innerHTML = denoms.map(v => `<button class="chip-btn${v === this.selected ? ' sel' : ''}" data-v="${v}" aria-label="${fmt(v)} chip" ${disabled ? 'disabled' : ''}><img src="${chipImageURL(v, 64)}" alt=""></button>`).join('');
    this.rackEl.querySelectorAll('.chip-btn').forEach(b => b.onclick = () => {
      this.selected = +b.dataset.v; this.sound.play('chip', { vol: .4, rate: 1.1 });
      this.rackEl.querySelectorAll('.chip-btn').forEach(x => x.classList.toggle('sel', x === b));
      this.onRack?.(this.selected);
    });
    this.rackEl.classList.toggle('off', !denoms.length);
  }
  rackEnabled(on) { this.rackEl.querySelectorAll('.chip-btn').forEach(b => b.disabled = !on); this.rackEl.classList.toggle('dim', !on); }
  affordable(balance) { this.rackEl.querySelectorAll('.chip-btn').forEach(b => b.classList.toggle('cant', +b.dataset.v > balance)); }

  // ── action buttons: [{id,label,sub,kind,onClick,disabled,hot}] ──
  actions(list) {
    this.actionsEl.innerHTML = '';
    for (const a of list) {
      if (!a) continue;
      const b = document.createElement('button');
      b.className = `act ${a.kind || 'ghost'}${a.hot ? ' hot' : ''}${a.wide ? ' wide' : ''}`;
      b.dataset.id = a.id; b.disabled = !!a.disabled;
      b.innerHTML = `<span>${esc(a.label)}</span>${a.sub ? `<small>${esc(a.sub)}</small>` : ''}${a.key ? `<kbd>${esc(a.key)}</kbd>` : ''}`;
      b.onclick = e => { e.stopPropagation(); if (b.disabled) return; this.sound.click(); a.onClick?.(); };
      this.actionsEl.append(b);
    }
  }
  bet(label, amount, extra = '') {
    this.betEl.innerHTML = `<span>${esc(label)}</span><strong>${fmt(amount)}</strong>${extra ? `<em>${extra}</em>` : ''}`;
  }

  // ── 3D anchored labels ──
  anchor(id, world, html, cls = '') {
    let a = this.anchors.get(id);
    const fresh = !a;
    if (!a) { const el = document.createElement('div'); el.className = 'anchor ' + cls; this.anchorsEl.append(el); a = { el, world: world.clone(), html: '' }; this.anchors.set(id, a); }
    a.world.copy(world);
    if (a.html !== html) { a.el.innerHTML = html; a.html = html; }
    if (cls && a.el.className !== 'anchor ' + cls) a.el.className = 'anchor ' + cls;
    a.el.classList.add('on');
    if (fresh) this.placeOne(a);
    return a.el;
  }
  unanchor(id) { const a = this.anchors.get(id); if (a) { a.el.remove(); this.anchors.delete(id); } }
  clearAnchors() { for (const a of this.anchors.values()) a.el.remove(); this.anchors.clear(); }
  placeAnchors() { for (const a of this.anchors.values()) this.placeOne(a); }
  placeOne(a) {
    const s = this.stage.toScreen(a.world);
    a.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    a.el.style.visibility = s.visible ? '' : 'hidden';
  }

  // ── result banner ──
  async banner({ title, sub = '', amount = null, kind = 'win', hold = 1.6 }) {
    const el = this.bannerEl;
    el.className = 'banner ' + kind;
    el.innerHTML = `<div class="b-in"><div class="b-title">${esc(title)}</div>${amount !== null ? `<div class="b-amt">${amount > 0 ? '+' : amount < 0 ? '−' : ''}<span>0</span></div>` : ''}${sub ? `<div class="b-sub">${esc(sub)}</div>` : ''}</div>`;
    void el.offsetWidth; el.classList.add('on');
    if (amount !== null) {
      const span = el.querySelector('.b-amt span'), dur = Math.min(1.4, .5 + Math.log10(Math.abs(amount) + 1) * .2);
      const t0 = performance.now(), tick = now => { const p = Math.min(1, (now - t0) / (dur * 1000)); span.textContent = fmt(Math.abs(amount) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    await new Promise(r => setTimeout(r, hold * 1000));
    el.classList.remove('on');
  }
  toast(msg, kind = '') {
    const el = document.createElement('div'); el.className = 'toast-item ' + kind; el.innerHTML = msg;
    this.toastEl.append(el); requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); }, 3200);
  }
  // ── sheets ──
  sheet(html, cls = '') {
    this.sheetEl.innerHTML = `<div class="sheet-card ${cls}" role="dialog" aria-modal="true"><button class="sheet-x" data-close aria-label="Close">×</button>${html}</div>`;
    this.sheetEl.classList.add('on'); this.sound.whoosh();
    return this.sheetEl.firstElementChild;
  }
  closeSheet() { this.sheetEl.classList.remove('on'); this.onSheetClose?.(); this.onSheetClose = null; }
}

// Flying-number from a screen point (used when chips pay out)
export function floatText(hud, world, text, cls = 'plus') {
  const s = hud.stage.toScreen(world);
  const el = document.createElement('div'); el.className = 'float ' + cls; el.textContent = text;
  el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
  hud.anchorsEl.append(el); setTimeout(() => el.remove(), 1600);
}
export { DENOMS };
