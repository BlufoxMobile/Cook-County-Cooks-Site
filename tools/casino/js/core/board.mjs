// "Biggest Stack" weekly leaderboard client. Never throws, never blocks play:
// with no network (or no Worker configured) it shows this device's own row.
import { isoWeek } from './economy.mjs';

export const BOARD_URL = 'https://c3-casino.jeff-bilbrey-jb.workers.dev';
export const DISTRICTS = ['North Side', 'South Side', 'East Side', 'West Side', 'Big South'];
const TIMEOUT = 7000, MIN_GAP = 5 * 60 * 1000;   // KV free tier: 1,000 writes/day for the whole account

async function timed(url, opts = {}) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), TIMEOUT);
  try { const r = await fetch(url, { ...opts, signal: ac.signal, cache: 'no-store' }); if (!r.ok) throw Error(r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

export class Board {
  constructor(bank, events) {
    this.bank = bank; this.events = events; this.online = null; this.lastSent = 0; this.pending = null; this.cache = null;
    events.on('peak', () => this.queue());
    addEventListener('pagehide', () => this.flush(true));
  }
  get registered() { return !!(this.bank.s.name && this.bank.s.store); }
  setIdentity(name, district) {
    this.bank.s.name = String(name || '').replace(/[^\p{L}\p{N} .'\-]/gu, '').trim().slice(0, 20);
    this.bank.s.store = DISTRICTS.includes(district) ? district : '';
    this.bank.save();
    this.queue(true);
  }
  row() { return { id: this.bank.id, name: this.bank.s.name, district: this.bank.s.store, peak: this.bank.s.weekPeak, week: this.bank.s.week }; }
  queue(now = false) {
    if (!this.registered) return;
    const r = this.row(), last = this.lastPeak || 0;
    // only worth a write when the peak moved meaningfully (or name/district changed)
    if (!now && r.peak < last * 1.03 && r.peak - last < 500) return;
    this.pending = r;
    const wait = Math.max(0, this.lastSent + MIN_GAP - Date.now());
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), now ? 0 : wait);
  }
  async flush(beacon = false) {
    if (!this.pending || !BOARD_URL) return;
    const body = JSON.stringify(this.pending);
    if (beacon && navigator.sendBeacon) { try { navigator.sendBeacon(BOARD_URL + '/submit', new Blob([body], { type: 'text/plain' })); this.pending = null; } catch {} return; }
    try {
      const res = await timed(BOARD_URL + '/submit', { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
      this.online = true; this.lastSent = Date.now(); this.lastPeak = this.pending?.peak || this.lastPeak; this.pending = null; this.cache = null;
      this.events.emit('board-rank', res);
    } catch { this.online = false; }
  }
  async top(district = '') {
    const week = isoWeek();
    if (this.cache && this.cache.key === week + district && Date.now() - this.cache.at < 15000) return this.cache.data;
    let rows = [], ok = false;
    try {
      const d = await timed(`${BOARD_URL}/top?week=${week}${district ? '&district=' + encodeURIComponent(district) : ''}`);
      rows = d.rows || []; ok = true; this.online = true;
    } catch { this.online = false; }
    const me = this.row();
    if (!ok && this.registered) rows = [{ ...me, rank: 1 }];
    const data = { rows, ok, me, week };
    this.cache = { key: week + district, at: Date.now(), data };
    return data;
  }
}
