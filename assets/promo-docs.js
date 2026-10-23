/* =============================================================================
 * Cook County Cooks — assets/promo-docs.js
 * ASK THE CHEF  ·  the Mobile Promotions guide, as index docs (pure, no DOM)
 * -----------------------------------------------------------------------------
 * Jeff (Oct 23 2026): "I also want this archived for the reps to be able to
 * search for promotions on the ask the chef feature of the website and it would
 * return information from this page that breaks it down." He chose CURRENT
 * promos only: an ended deal is never a doc.
 *
 *   promoDocs(feed, { today, room }) -> [doc]       (contract index schema)
 *   pruneExpired(docs, today)        -> [doc]       (static docs, re-dated)
 *   chicagoToday()                   -> 'YYYY-MM-DD' (the stores' date)
 *   isPromoDoc(doc)                  -> boolean
 *
 * The SAME builder runs in two places, so the static index and the live answer
 * can never disagree about what a doc says:
 *   · build/ask-index.mjs  — from data/promos.json (the snapshot), at build time;
 *   · assets/ask.js        — from loadPromos() (the live quote sheets), at run time.
 *
 * WHAT IT MAKES (ids all start `mobile-promos/`; anchors are the guide page's
 * own routes without the leading `#/`, see contract/CONTRACT.md):
 *   p/<promoId>        one per current promo — the full breakdown + its steps
 *   trade/<slug>       one per trade-in phone — its Good/Fair/Poor value on
 *                      every current trade-in promo (the "what is it worth" table)
 *   trade              the trade-in lookup
 *   current            every current promo, one line each
 *   new-lines, upgrades  the same, by who it is for
 *   brand/<brand>      Apple / Samsung / Google / Motorola deals
 *   device/<key>       one per phone a promo SELLS ("deals on the iPhone 17")
 * Aggregate docs carry their rows as data (`list`, `trade.rows`), and their
 * text is built FROM the rows, so pruneExpired() can drop an ended promo's
 * row and rewrite the text without the feed.
 *
 * Only rep-facing fields are read (title, hook, qualify, steps, deadlines,
 * watchouts, savings, deal card, plan, devices, flags, trade-in values). The
 * sheets' internal fields (source, discrepancy, values_in, …) are never touched.
 * Every amount and date in a doc's text comes straight from the feed, so the
 * Worker (which only sees id/title/crumbs/text) has the real figures to quote.
 * ========================================================================== */
import * as FEED from './promos-feed.js';

export const PROMO_TOOL = 'mobile-promos';
const P = `${PROMO_TOOL}/`;
const TEXT_MAX = 700;
const GUIDE = 'Mobile Promotions';

/* ── small helpers ─────────────────────────────────────────────────────── */

/** Today's date where the stores are (America/Chicago), 'YYYY-MM-DD'. */
export function chicagoToday(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** contract: start <= today <= end, a missing date is open-ended. */
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

/** '2026-11-10' -> '11/10/26' (how the sheets and deal cards write it). */
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${+m[2]}/${+m[3]}/${m[1].slice(2)}` : '';
}
const endsLine = (end) => (end ? `Ends ${shortDate(end)}` : 'No end date');
const money = (n) => (n == null ? null : `$${Number(n).toLocaleString('en-US')}`);
const sentence = (s) => { s = String(s || '').trim(); return !s ? '' : /[.!?…]$/.test(s) ? s : `${s}.`; };
/** Fill up to `n` chars with whole sentences, in priority order: a part that
 *  does not fit is skipped (a later, shorter one may still fit); nothing is
 *  ever cut mid-sentence. Returns the parts joined in the order given. */
function pack(parts, n = TEXT_MAX) {
  const out = [];
  let len = 0;
  for (const raw of parts) {
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const add = (out.length ? 1 : 0) + t.length;
    if (len + add > n) continue;
    out.push(t); len += add;
  }
  return out.join(' ');
}
/** Sentences of a block of text (for packing a long qualify line whole). */
const sentencesOf = (s) => String(s || '').match(/[^.!?]+(?:[.!?]+|$)/g)?.map((x) => x.trim()).filter(Boolean) || [];
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
/** "$1,200" -> ["$1,200", "$1200", "1200", "1,200"] — every way a rep types it. */
function amountWords(s) {
  const out = [];
  for (const m of String(s || '').matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?/g)) {
    const raw = m[1], bare = raw.replace(/,/g, '');
    out.push(`$${raw}`, `$${bare}`, bare, raw);
  }
  return out;
}
/** The deal card as a rep reads it: a real card number ("CD885"), or ''.
 *  A value that names a source PDF or says "(no separate card)" is not a card
 *  a rep can look up, so nothing is shown (UX review, Oct 23). */
export function dealCard(s) {
  const v = String(s || '').replace(/\s*·\s*[^·]*\.pdf\b[^·]*/gi, '').trim();
  if (!v || /\.pdf\b/i.test(v) || /no separate card/i.test(v)) return '';
  return v;
}
const codes = (s) => [...String(s || '').matchAll(/\b[A-Z]{2,}\d{2,}\b/g)].map((m) => m[0]);

/* ── who a promo is for ────────────────────────────────────────────────── */

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

/** The promo's name the way a rep would say it:
 *  "TIPs — Up to $930 off select Apple, Google and Motorola"
 *    -> "Up to $930 off select Apple, Google and Motorola — new line trade-in deal" */
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

/** Display name of a trade-in model: "Apple iPhone 13" -> "iPhone 13",
 *  "Samsung Galaxy S22 Plus 5G" -> "Galaxy S22 Plus", "Google Pixel 7A 5G" -> "Pixel 7a". */
export function modelName(model) {
  let m = String(model || '').replace(/\s+5G\b/gi, '').replace(/\s+/g, ' ').trim();
  m = m.replace(/^Apple\s+(?=iPhone|iPad|Watch)/i, '').replace(/^Samsung\s+(?=Galaxy)/i, '').replace(/^Google\s+(?=Pixel)/i, '');
  // the sheets write a few Samsungs without "Galaxy" ("Samsung Note 10 Plus")
  m = m.replace(/^Samsung\s+(?=(?:Note|S\d|Z\s|A\d)\b)/i, 'Galaxy ');
  m = m.replace(/\b(Pixel \d+)([A-Z])\b/, (x, a, b) => a + b.toLowerCase());
  return m;
}
/** Every way a rep names a model (for keywords and asks). */
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

/* ── the promo itself ──────────────────────────────────────────────────── */

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
  /* PRIORITY, not position (accuracy review m1): what a rep (and the Worker,
     which only sees this text) needs first — savings, who and plan, the end
     date, the flags, the trade-in deadline — then the credit, the hook, the
     other deadlines and as many whole qualify sentences as still fit. Long
     device lists inside qualify lines are left to the card's Eligible
     devices. Nothing is cut mid-sentence. */
  const dl = (p.deadlines || []).map(sentence);
  const tradeDl = dl.filter((d) => /trade-?in/i.test(d) && /\bdays?\b/i.test(d));
  const otherDl = dl.filter((d) => !tradeDl.includes(d) && !/^offer (?:ends|runs)\b/i.test(d));
  const card = dealCard(p.deal_card);
  const text = pack([
    sentence(`${p.savings || ''}${card ? ` (deal card ${card})` : ''}`),
    sentence([audWord(p) ? `For: ${audWord(p)}` : '', p.plan ? `Plan: ${p.plan}` : ''].filter(Boolean).join('. ')),
    sentence(endsLine(p.dates && p.dates.end)),
    sentence(flagsLine(p)),
    ...tradeDl,
    p.credit_amount ? sentence(`Credit: ${p.credit_amount}`) : (ti && ladder ? sentence(`Trade-in values by device and condition: ${ladder}`) : ''),
    sentence(p.hook),
    ...otherDl,
    ...(p.qualify || []).flatMap(sentencesOf).filter((x) => x.length <= 220 && !/:\s*(?:[^,]+,){5,}/.test(x))
  ]);
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
    codes(card).map((c) => c.toLowerCase()),
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
    /* a word that lives only in a long keyword list is treated by the engine
       as a list entry (a store name), not evidence — so the deal card number
       and "tips" are said here too, where they count */
    codes(card).flatMap((c) => [`${c.toLowerCase()} deal card`, `deal card ${c.toLowerCase()}`]),
    /* "does the samsung promo need a port" (UX review m3) */
    p.port_required ? ['need a port', 'port required', ...brands.map((b) => `does the ${b} promo need a port`)] : [],
    isTips ? 'tips trade in promo' : '',
    /* a promo for ONE phone ("iPhone Duo") is asked for by that phone + who */
    one.length === 1 ? [`${p.diamond_only ? 'diamond ' : ''}${one[0].name.toLowerCase()} ${aw}${p.trade_in_required ? ' trade in' : ''}`, `${one[0].name.toLowerCase()} ${aw} deal`] : []
  ], 18);
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
      deal_card: card,
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

/* ── the phones a promo sells (device_scope) ───────────────────────────── */

/** "iPhone 15, …; Google Pixel 10, … (Galaxy A57 is not included)" -> names.
 *  Phones only: watch scopes are left to the watch promo's own doc. */
function scopeNames(p) {
  if (!p || p.device_type !== 'phone' || !(p.brands || []).length) return [];
  const s = String(p.device_scope || '').replace(/\([^)]*\)/g, ' ').replace(/[–—]/g, ' ');
  const out = [];
  for (let part of s.split(/[,;]/)) {
    part = part.replace(/\s+/g, ' ').trim();
    if (!part || part.split(' ').length > 5 || /^any\b/i.test(part)) continue;
    part = part.replace(/^(?:Apple|Google|Samsung)\s+/i, '');
    // Motorola is written every which way: "Motorola moto razr – 2026",
    // "motorola edge – 2025", "Razr fold", "moto g stylus – 2026".
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

/** The biggest dollar figure in a promo's savings ("up to $1,200 off" -> 1200). */
function topAmount(p) {
  let m = 0;
  for (const x of String((p && p.savings) || '').matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)) m = Math.max(m, parseFloat(x[1].replace(/,/g, '')) || 0);
  return m;
}

/* ── aggregate docs: rows + text built from rows ───────────────────────── */

function listRow(p) {
  return { id: p.id, doc: `${P}p/${p.id}`, title: promoTitle(p), savings: p.savings || '', ends: (p.dates && p.dates.end) || null, who: audWord(p), group: group(p) };
}
function listText(lead, rows) {
  const head = sentence(lead);
  const lines = rows.map((r) => sentence(`${r.title}: ${r.savings}, ${endsLine(r.ends).toLowerCase()}`));
  let out = head;
  let k = 0;
  for (; k < lines.length; k++) {
    const more = lines.length - k - 1;
    const tail = more ? ` And ${more} more.`.length : 0;
    if (out.length + 1 + lines[k].length + tail > TEXT_MAX) break;
    out += ` ${lines[k]}`;
  }
  if (k < lines.length) out += ` And ${lines.length - k} more.`;
  return out.trim();
}
/** A trade-in promo in a few words: "New line, up to $930 off Apple/Google/Motorola". */
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
  return pack([`${name} trade-in credit, by condition, on every current trade-in promo.`, ...lines, 'Credit is paid as 36 monthly bill credits toward an eligible new phone.']);
}

/** Recompute an aggregate doc after rows were dropped; null when none are left. */
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

/**
 * Index docs for every CURRENT promo in a feed ({ promos: [...] }).
 * @param {{promos:Array}} feed
 * @param {{today?:string, room?:string}} [opts]  today = 'YYYY-MM-DD' (default: Chicago today)
 */
export function promoDocs(feed, { today, room = 'host' } = {}) {
  const day = today || chicagoToday();
  const promos = ((feed && feed.promos) || []).filter((p) => p && p.id && isActive(p, day));
  const docs = [];
  if (!promos.length) return docs;

  for (const p of promos) docs.push(promoDoc(p, room));

  /* overview + by audience */
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
    ['promos for upgrades', 'upgrade deals', 'what deals for an upgrade', 'existing customer upgrade promo'],
    /* the guide's search for "upgrade" lists the upgrade deals first (their
       titles say upgrade); the home page (#/) has no upgrades-only view */
    'search/upgrade');

  /* by brand */
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
      [`${b} promo`, `${b} deals`, line ? `${line} promo` : '', line ? `any deals on ${line}` : ''],
      /* the guide's own search lists this brand's promos and trade-in phones */
      `search/${slugOf(b)}`);
  }

  /* by phone sold */
  const phones = new Map();
  for (const p of promos) for (const d of scopeNames(p)) {
    if (!phones.has(d.key)) phones.set(d.key, { name: d.name, promos: [] });
    const e = phones.get(d.key);
    if (!e.promos.includes(p)) e.promos.push(p);
  }
  for (const [key, e] of phones) {
    const low = e.name.toLowerCase();
    const extra = /^galaxy\s/.test(low) ? [low.replace(/^galaxy\s+/, ''), `samsung ${low.replace(/^galaxy\s+/, '')}`] : /^motorola\s/.test(low) ? [low.replace(/^motorola\s+/, ''), low.replace(/^motorola\s+/, 'moto ')] : [];
    /* BEST-OF NAMES ITS CONDITIONS (accuracy review M4): the best deal any
       customer can get is stated first; a bigger Diamond-only deal is named
       as such, never as the plain "best". */
    const byAmt = (x, y) => topAmount(y) - topAmount(x);
    const bestLine = (who, label) => {
      const mine = e.promos.filter((p) => p.audience === who).sort(byAmt);
      const open = mine.find((p) => !p.diamond_only), dia = mine.find((p) => p.diamond_only);
      const say = (p) => `${p.savings}${p.trade_in_required ? ' with a trade-in' : p.port_required ? ' with a port-in' : ''}`;
      const parts = [];
      if (open) parts.push(`Best for ${label}: ${say(open)}`);
      if (dia && (!open || topAmount(dia) > topAmount(open))) parts.push(`${open ? 'Diamond members only' : `For ${label}, Diamond members only`}: ${say(dia)}`);
      return parts.join('. ');
    };
    const lead = [`Every current promo that sells the ${e.name} (${e.promos.length})`,
      bestLine('new_line', 'a new line'), bestLine('upgrade', 'an upgrade')].filter(Boolean).join('. ');
    const sorted = e.promos.slice().sort((x, y) => (x.audience === y.audience ? (x.diamond_only - y.diamond_only) || byAmt(x, y) : x.audience === 'new_line' ? -1 : 1));
    mk(`device/${key}`, `Deals on the ${e.name}`, [GUIDE, 'By phone'],
      lead, sorted.map(listRow),
      [low, extra],
      [`${low} promo`, `${low} deal`, `deals on the ${low}`, `best deal for ${low}`, `${low} discount`, `any promo on the ${low}`,
        `${low} new line`, `how much off ${low}`, `how much off ${low} new line`, `${low} upgrade deal`],
      /* the guide has no per-phone page for a phone being SOLD: land on its
         best open deal (the first row); every other deal is a row in the card */
      `p/${sorted[0].id}`, `${P}device`);
  }

  /* trade-in: lookup + one doc per phone */
  const tradePromos = promos.filter((p) => p.trade_in && Array.isArray(p.trade_in.devices) && p.trade_in.devices.length);
  if (tradePromos.length) {
    const rows = tradePromos.map(listRow);
    /* the trade-in deadline every trade-in promo shares (UX review m3:
       "how long do they have to send the trade in") */
    const tdl = tradePromos.map((p) => (p.deadlines || []).find((d) => /trade-?in/i.test(d) && /\bdays?\b/i.test(d))).filter(Boolean);
    const shared = tdl.length === tradePromos.length && new Set(tdl.map((d) => (d.match(/\d+\s*days?/i) || [''])[0].toLowerCase())).size === 1 ? sentence(tdl[0]) : '';
    const lead = [`Look up what any phone is worth on today's trade-in promos (Good / Fair / Poor)`, shared ? `On every trade-in deal: ${shared.replace(/^\w/, (c) => c.toLowerCase())}` : '']
      .filter(Boolean).map(sentence).join(' ');
    docs.push({
      id: `${P}trade`, kind: 'faq', title: 'Trade-in values: look up what a phone is worth', crumbs: [GUIDE, 'Trade-in values'],
      tool: PROMO_TOOL, room, anchor: 'trade', locked: false,
      text: listText(lead, rows), list: rows, _lead: lead,
      keywords: uniq(['trade in', 'trade-in', 'tips', 'tips promos', 'tips promo', 'trade in value', shared ? ['trade in deadline', '21 days', 'assurant', 'send the trade in'] : [], 'trade in values', 'trade in list', 'trade in lookup', 'worth', 'value', 'good', 'fair', 'poor', 'condition', 'what is my phone worth', 'assurant']),
      asks: uniq(['what is my phone worth', 'trade in values', 'trade in value list', 'all trade in values', 'how much is a trade in worth', 'look up a trade in', 'trade in lookup', 'tips trade in values', 'tips promos', 'tips promo', 'what tips are running',
        shared ? ['how long do they have to send the trade in', 'trade in deadline', 'how many days to send in the trade in', 'when does the trade in have to be sent'] : []], 16)
    });
    const byModel = new Map();
    for (const p of tradePromos) for (const d of p.trade_in.devices) {
      if (!d || !d.model) continue;
      if (!byModel.has(d.model)) byModel.set(d.model, { brand: d.brand || '', rows: [] });
      byModel.get(d.model).rows.push({ doc: `${P}p/${p.id}`, label: shortLabel(p), ends: (p.dates && p.dates.end) || null, good: d.good ?? null, fair: d.fair ?? null, poor: d.poor ?? null });
    }
    const nameCount = new Map();
    for (const m of byModel.keys()) nameCount.set(modelName(m), (nameCount.get(modelName(m)) || 0) + 1);
    for (const [model, e] of byModel) {
      /* two list entries that read the same once "5G" is dropped ("Galaxy
         Note 10 Plus" and "… Plus 5G") keep "5G", so a chooser can tell them apart */
      const name = nameCount.get(modelName(model)) > 1 && /\b5G\b/i.test(model) ? `${modelName(model)} 5G` : modelName(model);
      const v = modelVariants(model, e.brand);
      docs.push({
        id: `${P}trade/${slugOf(model)}`, kind: 'faq', title: `Trade-in value: ${name}`, family: `${P}trade`,
        crumbs: [GUIDE, 'Trade-in values', e.brand || 'Other'],
        tool: PROMO_TOOL, room, anchor: `trade/${slugOf(model)}`, locked: false,
        text: tradeText(name, e.rows),
        keywords: uniq([v, 'trade in', 'trade-in', 'trade in value', 'worth', 'value']),
        asks: uniq([`${v[0]} trade in value`, `what is a ${v[0]} worth`, `how much is a ${v[0]} worth`, `${v[0]} trade in`, `trade in ${v[0]}`], 8),
        trade: { model, name, brand: e.brand, rows: e.rows }
      });
    }
  }
  return docs;
}

/**
 * Drop what has ended since `docs` were built (the static index can be days
 * old). Promo docs go when their promo has ended; aggregate docs lose those
 * rows (text rewritten from what is left) and go when no row is left.
 * Returns NEW objects for anything it changes; never mutates its input.
 */
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
