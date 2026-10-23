

import * as FEED from './promos-feed.f7a59d1771.js';

export const PROMO_TOOL = 'mobile-promos';
const P = `${PROMO_TOOL}/`;
const TEXT_MAX = 700;
const GUIDE = 'Mobile Promotions';

 

 
export function chicagoToday(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

 
function activeFallback(p, today) {
  const d = (p && p.dates) || {};
  if (d.start && today < d.start) return false;
  if (d.end && today > d.end) return false;
  return true;
}
const isActive = (p, today) => (typeof FEED.isActive === 'function' ? FEED.isActive(p, today) : activeFallback(p, today));
const slugOf = (model) => (typeof FEED.deviceSlug === 'function'
  ? FEED.deviceSlug(model)
  : String(model || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));

export const isPromoDoc = (d) => !!(d && typeof d.id === 'string' && d.id.startsWith(P));

 
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${+m[2]}/${+m[3]}/${m[1].slice(2)}` : '';
}
const endsLine = (end) => (end ? `Ends ${shortDate(end)}` : 'No end date');
const money = (n) => (n == null ? null : `$${Number(n).toLocaleString('en-US')}`);
const sentence = (s) => { s = String(s || '').trim(); return !s ? '' : /[.!?…]$/.test(s) ? s : `${s}.`; };
function clip(s, n = TEXT_MAX) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, '') + '…';
}
function uniq(list, max = 40) {
  const seen = new Set(), out = [];
  for (const raw of list.flat(3)) {
    if (raw == null) continue;
    const k = String(raw).toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k); out.push(k);
    if (out.length >= max) break;
  }
  return out;
}
 
function amountWords(s) {
  const out = [];
  for (const m of String(s || '').matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?/g)) {
    const raw = m[1], bare = raw.replace(/,/g, '');
    out.push(`$${raw}`, `$${bare}`, bare, raw);
  }
  return out;
}


const dealCard = (s) => String(s || '').replace(/\s*·\s*[^·]*\.pdf\b[^·]*/gi, '').trim();
const codes = (s) => [...String(s || '').matchAll(/\b[A-Z]{2,}\d{2,}\b/g)].map((m) => m[0]);

 

function group(p) {
  if (p.device_type === 'watch') return 'Watches';
  if (p.device_type === 'tablet') return 'Tablets';
  if (p.audience === 'upgrade') return 'Upgrades';
  if (p.audience === 'new_line') return 'New lines';
  return 'Other deals';
}
function audWord(p) {
  if (p.device_type === 'watch') return p.audience === 'upgrade' ? 'watch upgrade' : 'new watch line';
  if (p.device_type === 'tablet') return p.audience === 'upgrade' ? 'tablet upgrade' : 'new tablet line';
  return p.audience === 'upgrade' ? 'upgrade' : p.audience === 'new_line' ? 'new line' : '';
}



export function promoTitle(p) {
  const raw = String(p.title || p.id || '').trim();
  let core = raw.replace(/^TIPs\s*[—–-]\s*/i, '');
  const noTrade = /\bno trade-?in\b/i.test(core);
  core = core.replace(/\s*\((?:new lines?|upgrades?|no trade-?in)\)\s*$/i, '').trim();
  const tags = [];
  const saysWho = /\bupgrade|new (?:\w+ )?lines?\b/i.test(core);
  const aw = audWord(p);
  if (p.trade_in_required) tags.push(!saysWho && aw ? `${aw} trade-in deal` : 'trade-in deal');
  else {
    if (!saysWho && aw && (p.brands || []).length) tags.push(aw);
    if (noTrade) tags.push('no trade-in');
  }
  if (!tags.length) return core;
  return `${core}${/\s[—–]\s/.test(core) ? ', ' : ' — '}${tags.join(', ')}`;
}



export function modelName(model) {
  let m = String(model || '').replace(/\s+5G\b/gi, '').replace(/\s+/g, ' ').trim();
  m = m.replace(/^Apple\s+(?=iPhone|iPad|Watch)/i, '').replace(/^Samsung\s+(?=Galaxy)/i, '').replace(/^Google\s+(?=Pixel)/i, '');
  m = m.replace(/\b(Pixel \d+)([A-Z])\b/, (x, a, b) => a + b.toLowerCase());
  return m;
}
 
function modelVariants(model, brand) {
  const name = modelName(model);
  const low = name.toLowerCase();
  const out = [low, String(model).toLowerCase().replace(/\s+5g\b/g, '')];
  if (/^galaxy\s/.test(low)) {
    const bare = low.replace(/^galaxy\s+/, '');
    out.push(bare, `samsung ${bare}`, `samsung ${low}`);
    if (/\bplus\b/.test(bare)) out.push(bare.replace(/\s*plus\b/, '+'), low.replace(/\s*plus\b/, '+'));
  }
  if (/^iphone\s/.test(low)) out.push(`apple ${low}`, low.replace(/\s+/g, ''));
  if (/^pixel\s/.test(low)) out.push(`google ${low}`);
  if (/^motorola\s/.test(low)) out.push(low.replace(/^motorola\s+/, ''), low.replace(/^motorola\s+/, 'moto '));
  if (brand) out.push(String(brand).toLowerCase());
  return uniq(out, 12);
}

 

function flagsLine(p) {
  const f = [];
  if (p.diamond_only) f.push('Diamond members only');
  f.push(p.trade_in_required ? 'Trade-in required' : 'No trade-in needed');
  f.push(p.port_required ? 'Port-in (number transfer) required' : 'No port-in needed');
  return f.join('. ');
}

function promoDoc(p, room) {
  const title = promoTitle(p);
  const ti = p.trade_in;
  const ladder = ti && Array.isArray(ti.ladder) ? ti.ladder.map(money).join(' / ') : '';
  const text = clip([
    sentence(`${p.savings || ''}${dealCard(p.deal_card) ? ` (deal card ${dealCard(p.deal_card)})` : ''}`),
    sentence(endsLine(p.dates && p.dates.end)),
    sentence([audWord(p) ? `For: ${audWord(p)}` : '', p.plan ? `Plan: ${p.plan}` : ''].filter(Boolean).join('. ')),
    sentence(flagsLine(p)),
    p.credit_amount ? sentence(`Credit: ${p.credit_amount}`) : '',
    ti && ladder ? sentence(`Trade-in values by device and condition: ${ladder}`) : '',
    sentence(p.hook),
    (p.qualify || []).length ? `Who qualifies: ${(p.qualify || []).map(sentence).join(' ')}` : '',
    (p.deadlines || []).length ? `Deadlines: ${(p.deadlines || []).map(sentence).join(' ')}` : ''
  ].filter(Boolean).join(' '));
  const brands = (p.brands || []).map((b) => String(b).toLowerCase());
  const devices = scopeNames(p).map((d) => d.name.toLowerCase());
  const aw = audWord(p);
  const isTips = /^TIPs\b/i.test(String(p.title || ''));
  const keywords = uniq([
    'promo', 'promotion', 'deal', aw, aw === 'new line' ? ['new lines', 'add a line'] : [],
    p.trade_in_required ? ['trade in', 'trade-in', 'trade in deal'] : (/no trade/i.test(p.title || '') ? ['no trade-in', 'no trade in'] : []),
    p.port_required ? ['port in', 'port', 'number transfer'] : [],
    p.diamond_only ? ['diamond', 'diamond members', 'diamond only'] : [],
    isTips ? ['tips', 'trade in promo'] : [],
    codes(p.deal_card).map((c) => c.toLowerCase()),
    amountWords(`${p.savings} ${p.title}`),
    brands, brands.length > 1 ? brands.join(' ') : '',
    /anytime/i.test(p.title || '') ? ['upgrade anytime', 'ua', 'balance left'] : [],
    (p.badges || []).map((b) => String(b).toLowerCase()),
    /gift card/i.test(p.title || '') ? ['gift card', 'visa', 'visa gift card', '2 lines', 'two lines'] : [],
    /activation/i.test(p.title || '') ? ['activation fee', 'waived', 'waive', 'new customer'] : [],
    /free/i.test(p.title || '') ? ['free line', 'first line free', 'free for a year', '12 months free'] : [],
    p.device_type === 'watch' ? ['watch', 'smartwatch', 'apple watch', 'galaxy watch', 'pixel watch'] : [],
    devices.slice(0, 14),
    p.plan ? String(p.plan).toLowerCase() : ''
  ], 40);
  const amount = amountWords(p.savings)[0] || '';
  const one = scopeNames(p);
  const asks = uniq([
    amount ? `${amount} deal` : '', amount ? `${amount} off` : '',
    brands.length ? `${brands.join(' ')} ${aw} deal` : '',
    p.trade_in_required && brands.length ? `${brands[0]} trade in ${aw}` : '',
    p.port_required ? ['do they need to port in', 'does it need a port in'] : [],
    !p.trade_in_required && /no trade/i.test(p.title || '') ? `${aw} without a trade in` : '',
    p.diamond_only ? `diamond ${p.device_type === 'watch' ? 'smartwatch' : aw} deal` : '',
    /anytime/i.test(p.title || '') ? `upgrade anytime ${brands[0] || ''} deal` : '',
    /gift card/i.test(p.title || '') ? ['visa gift card for adding lines', 'gift card for 2 new lines'] : [],
    /activation/i.test(p.title || '') ? ['waive the activation fee', 'activation fee waived'] : [],
    /free/i.test(p.title || '') ? ['free line for a year', 'first line free'] : [],
    

    codes(p.deal_card).flatMap((c) => [`${c.toLowerCase()} deal card`, `deal card ${c.toLowerCase()}`]),
    isTips ? 'tips trade in promo' : '',
     
    one.length === 1 ? [`${p.diamond_only ? 'diamond ' : ''}${one[0].name.toLowerCase()} ${aw}${p.trade_in_required ? ' trade in' : ''}`, `${one[0].name.toLowerCase()} ${aw} deal`] : []
  ], 14);
  return {
    id: `${P}p/${p.id}`, kind: 'section', title,
    crumbs: [GUIDE, group(p)],
    tool: PROMO_TOOL, room, anchor: `p/${p.id}`, locked: false,
    text, keywords, asks,
    steps: (p.steps || []).map((s, i) => ({ n: i + 1, text: String(s) })),
    promo: {
      id: p.id,
      savings: p.savings || '',
      ends: (p.dates && p.dates.end) || null,
      starts: (p.dates && p.dates.start) || null,
      deal_card: dealCard(p.deal_card),
      plan: p.plan || '',
      group: group(p),
      who: aw,
      diamond: !!p.diamond_only, trade: !!p.trade_in_required, port: !!p.port_required,
      hook: p.hook || '',
      credit: p.credit_amount || '',
      qualify: (p.qualify || []).map(String),
      deadlines: (p.deadlines || []).map(String),
      watchouts: (p.watchouts || []).map(String),
      devices: p.device_scope || '',
      trade_in: ti ? { ladder: ti.ladder || [], max: ti.max ?? null, floor: ti.floor ?? null, count: (ti.devices || []).length } : null
    }
  };
}

 



function scopeNames(p) {
  if (!p || p.device_type !== 'phone' || !(p.brands || []).length) return [];
  const s = String(p.device_scope || '').replace(/\([^)]*\)/g, ' ').replace(/[–—]/g, ' ');
  const out = [];
  for (let part of s.split(/[,;]/)) {
    part = part.replace(/\s+/g, ' ').trim();
    if (!part || part.split(' ').length > 5 || /^any\b/i.test(part)) continue;
    part = part.replace(/^(?:Apple|Google|Samsung)\s+/i, '');
    
    
    let moto = false;
    while (/^(?:motorola|moto)\s+/i.test(part)) { part = part.replace(/^(?:motorola|moto)\s+/i, ''); moto = true; }
    if (/^(?:razr|edge|g)\b/i.test(part)) moto = true;
    const key = (moto ? 'moto' : '') + part.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '');
    let name = part.replace(/\s+/g, ' ').trim();
    if (moto) name = `Motorola ${/^g\b/i.test(name) ? 'Moto ' : ''}${name.replace(/\b[a-z]/g, (c) => c.toUpperCase())}`;
    if (key) out.push({ key, name });
  }
  return out;
}

 
function topAmount(p) {
  let m = 0;
  for (const x of String((p && p.savings) || '').matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)) m = Math.max(m, parseFloat(x[1].replace(/,/g, '')) || 0);
  return m;
}

 

function listRow(p) {
  return { id: p.id, doc: `${P}p/${p.id}`, title: promoTitle(p), savings: p.savings || '', ends: (p.dates && p.dates.end) || null, who: audWord(p), group: group(p) };
}
function listText(lead, rows) {
  return clip(`${sentence(lead)} ${rows.map((r) => sentence(`${r.title}: ${r.savings}, ${endsLine(r.ends).toLowerCase()}`)).join(' ')}`);
}
 
function shortLabel(p) {
  const one = scopeNames(p);
  const what = one.length === 1 ? one[0].name : (p.brands || []).join('/');
  const who = audWord(p);
  return `${who ? who[0].toUpperCase() + who.slice(1) + ', ' : ''}${p.savings || ''}${what ? ` ${what}` : ''}${p.diamond_only ? ' (Diamond)' : ''}`.trim();
}
function tradeText(name, rows) {
  const lines = rows.map((r) => {
    const v = ['good', 'fair', 'poor'].map((c) => `${c[0].toUpperCase()}${c.slice(1)} ${r[c] == null ? 'not accepted' : money(r[c])}`).join(', ');
    return sentence(`${r.label} (${endsLine(r.ends).toLowerCase()}): ${v}`);
  });
  return clip(`${name} trade-in credit, by condition, on every current trade-in promo. ${lines.join(' ')} Credit is paid as 36 monthly bill credits toward an eligible new phone.`);
}

 
function rebuild(doc) {
  if (doc.trade && Array.isArray(doc.trade.rows)) {
    if (!doc.trade.rows.length) return null;
    doc.text = tradeText(doc.trade.name, doc.trade.rows);
  } else if (Array.isArray(doc.list)) {
    if (!doc.list.length) return null;
    doc.text = listText(doc._lead || '', doc.list);
  }
  return doc;
}



export function promoDocs(feed, { today, room = 'host' } = {}) {
  const day = today || chicagoToday();
  const promos = ((feed && feed.promos) || []).filter((p) => p && p.id && isActive(p, day));
  const docs = [];
  if (!promos.length) return docs;

  for (const p of promos) docs.push(promoDoc(p, room));

   
  const mk = (id, title, crumbs, lead, rows, keywords, asks, anchor = '', family = '') => {
    if (!rows.length) return;
    docs.push({
      id: `${P}${id}`, kind: 'faq', title, crumbs, tool: PROMO_TOOL, room, anchor, locked: false,
      text: listText(lead, rows), keywords: uniq(keywords), asks: uniq(asks, 10), list: rows, _lead: lead,
      ...(family ? { family } : {})
    });
  };
  const rowsAll = promos.map(listRow);
  mk('current', 'Current mobile promotions', [GUIDE], `Every Xfinity Mobile promotion running today (${rowsAll.length})`, rowsAll,
    ['promos', 'promotions', 'current promos', 'deals', 'offers', 'specials', 'promo of the day', 'todays promos', 'what promos are there', 'mobile promotions', 'xm promos'],
    ['what promos are running', 'what deals do we have', 'current mobile promotions', 'list of promos', 'all the deals right now', 'deals', 'promos', 'any deals']);
  const rowsNew = rowsAll.filter((r) => r.group === 'New lines');
  mk('new-lines', 'New line promotions', [GUIDE, 'New lines'], `Deals for a NEW Xfinity Mobile line (${rowsNew.length})`, rowsNew,
    ['new line', 'new lines', 'add a line', 'new customer', 'new line deals', 'new line promos', 'promos', 'deals'],
    ['promos for new lines', 'new line deals', 'what deals for adding a line', 'deals for new customers']);
  const rowsUpg = rowsAll.filter((r) => r.group === 'Upgrades');
  mk('upgrades', 'Upgrade promotions', [GUIDE, 'Upgrades'], `Deals for UPGRADING the phone on an existing line (${rowsUpg.length})`, rowsUpg,
    ['upgrade', 'upgrades', 'upgrade deals', 'upgrade promos', 'existing line', 'existing customer', 'promos', 'deals'],
    ['promos for upgrades', 'upgrade deals', 'what deals for an upgrade', 'existing customer upgrade promo']);

   
  const brands = new Map();
  for (const p of promos) for (const b of p.brands || []) {
    const k = String(b).trim();
    if (!k) continue;
    if (!brands.has(k)) brands.set(k, []);
    brands.get(k).push(p);
  }
  const LINE = { Apple: 'iPhone', Samsung: 'Galaxy', Google: 'Pixel' };
  for (const [b, list] of brands) {
    const line = LINE[b] || '';
    mk(`brand/${slugOf(b)}`, `${b} promotions${line ? ` (${line} deals)` : ''}`, [GUIDE, 'By brand'],
      `Every current promo on ${b}${line ? ` / ${line}` : ''} devices (${list.length})`, list.map(listRow),
      [b, line, `${b} deals`, `${b} promos`, line ? `${line} deals` : '', 'promo', 'deal', 'promos', 'deals'],
      [`${b} promo`, `${b} deals`, line ? `${line} promo` : '', line ? `any deals on ${line}` : '']);
  }

   
  const phones = new Map();
  for (const p of promos) for (const d of scopeNames(p)) {
    if (!phones.has(d.key)) phones.set(d.key, { name: d.name, promos: [] });
    const e = phones.get(d.key);
    if (!e.promos.includes(p)) e.promos.push(p);
  }
  for (const [key, e] of phones) {
    const low = e.name.toLowerCase();
    const extra = /^galaxy\s/.test(low) ? [low.replace(/^galaxy\s+/, ''), `samsung ${low.replace(/^galaxy\s+/, '')}`] : /^motorola\s/.test(low) ? [low.replace(/^motorola\s+/, ''), low.replace(/^motorola\s+/, 'moto ')] : [];
    const best = (who) => e.promos.filter((p) => p.audience === who).sort((x, y) => topAmount(y) - topAmount(x))[0];
    const bn = best('new_line'), bu = best('upgrade');
    const lead = [`Every current promo that sells the ${e.name} (${e.promos.length})`,
      bn ? `Best for a new line: ${bn.savings}${bn.trade_in_required ? ' with a trade-in' : ''}` : '',
      bu ? `Best for an upgrade: ${bu.savings}${bu.trade_in_required ? ' with a trade-in' : ''}` : ''].filter(Boolean).join('. ');
    mk(`device/${key}`, `Deals on the ${e.name}`, [GUIDE, 'By phone'],
      lead, e.promos.slice().sort((x, y) => (x.audience === y.audience ? topAmount(y) - topAmount(x) : x.audience === 'new_line' ? -1 : 1)).map(listRow),
      [low, extra],
      [`${low} promo`, `${low} deal`, `deals on the ${low}`, `best deal for ${low}`, `${low} discount`, `any promo on the ${low}`], '', `${P}device`);
  }

   
  const tradePromos = promos.filter((p) => p.trade_in && Array.isArray(p.trade_in.devices) && p.trade_in.devices.length);
  if (tradePromos.length) {
    const rows = tradePromos.map(listRow);
    const lead = `Look up what any phone is worth on today's trade-in promos (Good / Fair / Poor). ${tradePromos.map((p) => `${promoTitle(p)}: ${(p.trade_in.ladder || []).map(money).join(' / ')}`).join('; ')}`;
    docs.push({
      id: `${P}trade`, kind: 'faq', title: 'Trade-in values: look up what a phone is worth', crumbs: [GUIDE, 'Trade-in values'],
      tool: PROMO_TOOL, room, anchor: 'trade', locked: false,
      text: listText(lead, rows), list: rows, _lead: lead,
      keywords: uniq(['trade in', 'trade-in', 'tips', 'tips promos', 'trade in value', 'trade in values', 'trade in list', 'trade in lookup', 'worth', 'value', 'good', 'fair', 'poor', 'condition', 'what is my phone worth', 'assurant']),
      asks: uniq(['what is my phone worth', 'trade in values', 'trade in value list', 'all trade in values', 'how much is a trade in worth', 'look up a trade in', 'trade in lookup', 'tips trade in values', 'tips promos', 'what tips are running'], 12)
    });
    const byModel = new Map();
    for (const p of tradePromos) for (const d of p.trade_in.devices) {
      if (!d || !d.model) continue;
      if (!byModel.has(d.model)) byModel.set(d.model, { brand: d.brand || '', rows: [] });
      byModel.get(d.model).rows.push({ doc: `${P}p/${p.id}`, label: shortLabel(p), ends: (p.dates && p.dates.end) || null, good: d.good ?? null, fair: d.fair ?? null, poor: d.poor ?? null });
    }
    for (const [model, e] of byModel) {
      const name = modelName(model);
      const v = modelVariants(model, e.brand);
      const best = Math.max(...e.rows.flatMap((r) => [r.good, r.fair, r.poor]).filter((x) => x != null));
      docs.push({
        id: `${P}trade/${slugOf(model)}`, kind: 'faq', title: `Trade-in value: ${name}`, family: `${P}trade`,
        crumbs: [GUIDE, 'Trade-in values', e.brand || 'Other'],
        tool: PROMO_TOOL, room, anchor: `trade/${slugOf(model)}`, locked: false,
        text: tradeText(name, e.rows),
        keywords: uniq([v, 'trade in', 'trade-in', 'trade in value', 'worth', 'value', Number.isFinite(best) ? `up to ${money(best)}` : '']),
        asks: uniq([`${v[0]} trade in value`, `what is a ${v[0]} worth`, `how much is a ${v[0]} worth`, `${v[0]} trade in`, `trade in ${v[0]}`], 8),
        trade: { model, name, brand: e.brand, rows: e.rows }
      });
    }
  }
  return docs;
}



export function pruneExpired(docs, today = chicagoToday()) {
  const live = (end) => !end || end >= today;
  const out = [];
  for (const d of docs || []) {
    if (!isPromoDoc(d)) { out.push(d); continue; }
    if (d.promo) { if (live(d.promo.ends)) out.push(d); continue; }
    if (d.trade && Array.isArray(d.trade.rows)) {
      const rows = d.trade.rows.filter((r) => live(r.ends));
      if (rows.length === d.trade.rows.length) { out.push(d); continue; }
      const n = rebuild({ ...d, trade: { ...d.trade, rows } });
      if (n) out.push(n);
      continue;
    }
    if (Array.isArray(d.list)) {
      const rows = d.list.filter((r) => live(r.ends));
      if (rows.length === d.list.length) { out.push(d); continue; }
      const n = rebuild({ ...d, list: rows });
      if (n) out.push(n);
      continue;
    }
    out.push(d);
  }
  return out;
}
