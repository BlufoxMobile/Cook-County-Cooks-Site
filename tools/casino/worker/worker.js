// C3 Blufox Casino — "Biggest Stack" weekly leaderboard.
// Cloudflare Worker (module syntax) + one KV namespace bound as BOARD.
//
//   GET  /top?week=2026-W39[&district=Big South]  -> { week, rows:[{rank,id,name,district,peak}] }
//   POST /submit  body {id,name,district,peak,week} (text/plain JSON, so no CORS preflight)
//                 -> { ok, rank, changed }
//   GET  /health
//
// One KV key per week: "wk:<ISO week>" holding the top 200 rows. A submit that
// does not beat that player's stored peak is answered WITHOUT a write — KV's
// free tier allows 1,000 writes a day across the whole account (FOX RUN shares it).
const DISTRICTS = ['North Side', 'South Side', 'East Side', 'West Side', 'Big South'];
const MAX_PEAK = 100_000_000, KEEP = 200;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra } });

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}
function nearWeeks() { const n = Date.now(); return new Set([isoWeek(new Date(n - 864e5)), isoWeek(new Date(n)), isoWeek(new Date(n + 864e5))]); }
const clean = s => String(s || '').replace(/[^\p{L}\p{N} .'\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/health') return json({ ok: true, week: isoWeek() });

    if (url.pathname === '/top' && req.method === 'GET') {
      const week = /^\d{4}-W\d{2}$/.test(url.searchParams.get('week') || '') ? url.searchParams.get('week') : isoWeek();
      const district = url.searchParams.get('district') || '';
      let rows = (await env.BOARD.get('wk:' + week, 'json')) || [];
      if (district) rows = rows.filter(r => r.district === district);
      rows = rows.slice(0, 50).map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, district: r.district, peak: r.peak }));
      return json({ week, rows }, 200, { 'cache-control': 'public, max-age=15' });
    }

    if (url.pathname === '/submit' && req.method === 'POST') {
      let b; try { b = JSON.parse(await req.text()); } catch { return json({ ok: false, error: 'bad json' }, 400); }
      const id = String(b.id || ''), name = clean(b.name), district = DISTRICTS.includes(b.district) ? b.district : '';
      const peak = Math.floor(Number(b.peak)), week = String(b.week || '');
      if (!/^[0-9a-f]{12,32}$/.test(id) || !name || !Number.isFinite(peak) || peak < 0 || peak > MAX_PEAK) return json({ ok: false, error: 'invalid' }, 400);
      if (!nearWeeks().has(week)) return json({ ok: false, error: 'stale week' }, 409);
      const key = 'wk:' + week;
      const rows = (await env.BOARD.get(key, 'json')) || [];
      const i = rows.findIndex(r => r.id === id);
      const cur = rows[i];
      if (cur && cur.peak >= peak && cur.name === name && cur.district === district) {
        return json({ ok: true, changed: false, rank: i + 1 });
      }
      const row = { id, name, district, peak: Math.max(peak, cur?.peak || 0), at: Date.now() };
      if (i >= 0) rows.splice(i, 1);
      rows.push(row);
      rows.sort((a, b) => b.peak - a.peak || a.at - b.at);
      const rank = rows.findIndex(r => r.id === id) + 1;
      if (rank > KEEP && i < 0) return json({ ok: true, changed: false, rank: 0 });
      await env.BOARD.put(key, JSON.stringify(rows.slice(0, KEEP)), { expirationTtl: 60 * 60 * 24 * 7 * 8 });
      return json({ ok: true, changed: true, rank });
    }
    return json({ ok: false, error: 'not found' }, 404);
  }
};
