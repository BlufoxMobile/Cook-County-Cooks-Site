#!/usr/bin/env node
/* =============================================================================
 * Cook County Cooks — build/ask-index.mjs
 * THE "ASK THE CHEF" CONTENT INDEX  ->  data/ask-index.json
 * -----------------------------------------------------------------------------
 * Contract: build/ASK-THE-CHEF-CONTRACT.md. Report: build/ask-index-report.md.
 *
 *   node build/ask-index.mjs                 build the index
 *   node build/ask-index.mjs --self-test     prove the locked-guide decrypt path
 *                                            against a throwaway envelope, then exit
 *
 * Locked guides (CSG How To, Request Access) are AES-GCM payloads. Their
 * transaction titles are only expanded when the passcode is given in the
 * environment, never on disk:
 *     CSG_PASS='…' RA_PASS='…' node build/ask-index.mjs
 * Without a passcode the previous index's locked docs are carried forward
 * unchanged IF the payload version still matches (so a rebuild without the code
 * is idempotent); otherwise only the tool-level doc is emitted.
 * Locked docs carry title / crumbs / keywords / asks / anchor only — no text, no
 * steps, no media (Jeff's rule: name the transaction, the guide still asks for
 * the code).
 *
 * ASKS (Oct 2026): build/ask-asks/*.json hold, per doc id, the ways reps ask for
 * that doc ("can i wear jeans to work" -> Dress Code). They are merged into each
 * doc as `asks: [string]` by mergeAsks() — after every source, including the
 * carried-forward locked docs — so a rebuild with or without the passcode gets
 * them. Unknown doc ids fail the build; on locked docs any phrasing that trips
 * LOCKED_DENY (digits, '@', URLs, codes) is dropped and reported.
 *
 * The Walk-In Freezer is never read and never indexed: data/freezer.sealed*.json
 * is not opened by this script, and the 'freezer' room is skipped.
 *
 * No npm dependencies. pdftotext (poppler) is used OPTIONALLY for printout
 * keywords (store names, handbook contents); without it those docs fall back to
 * the manifest text and the run says so.
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promoDocs, chicagoToday, PROMO_TOOL } from '../assets/promo-docs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/ask-index.json');
const TEXT_MAX = 1600, STEP_MAX = 4000, KW_MAX = 40;
const t0 = Date.now();

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));
const fail = msg => { console.error('ask-index: FAIL — ' + msg); process.exit(1); };

/* ---------------------------------------------------------------- text utils */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', middot: '·',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', sup3: '³', rarr: '→', larr: '←', bull: '•' };
const decode = s => String(s).replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
/** markdown-ish guide strings -> plain text */
const plain = s => String(s ?? '')
  .replace(/\{\{img:[^}]+\}\}/g, '')
  .replace(/\[(.+?)\]\([^)]+\)/g, '$1')
  .replace(/\*\*|`/g, '')
  .replace(/\s+/g, ' ').trim();
/** HTML fragment -> plain text */
const htmlText = s => decode(String(s ?? '')
  .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<\/(p|li|h[1-6]|dt|dd|div|figcaption)>/gi, '$& ')
  .replace(/<[^>]+>/g, ''))
  .replace(/\s+([.,;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
const clip = (s, n = TEXT_MAX) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1); const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, '') + '…';
};
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const join = (...xs) => xs.flat().filter(Boolean).map(x => String(x).trim()).filter(Boolean)
  .map(x => /[.!?:…]$/.test(x) ? x : x + '.').join(' ');

/* ------------------------------------------------------------ keyword lexicon
 * If a doc's own words match the left side, the right-side terms are added, so
 * a rep's abbreviation finds the doc that spells it out and vice versa. */
const LEX = [
  [/\bxfinity home\b|\bxh\b|home security/i, ['xh', 'xfinity home', 'home security']],
  [/\bshield\b/i, ['xfinity shield', 'shield', 'security', 'camera']],
  [/xfinity mobile|\bxm\b/i, ['xm', 'xfinity mobile', 'mobile']],
  [/\bxm ?360\b/i, ['xm360']],
  [/\bxfi\b|xfi pods?|wifi extender/i, ['xfi', 'wifi', 'pods', 'extender']],
  [/\be-?sim\b/i, ['esim', 'e-sim', 'activation']],
  [/\bp-?sim\b|sim card|physical sim/i, ['psim', 'sim card', 'physical sim']],
  [/bring your own|\bbyod\b/i, ['byod', 'bring your own device']],
  [/\bport(s|ing|ed)?\b|port-in|number transfer|transfer pin/i, ['port', 'port-in', 'porting', 'transfer pin', 'number transfer']],
  [/internet essentials|\bie\b/i, ['ie', 'internet essentials', 'low income']],
  [/ie plus|internet essentials plus/i, ['ie plus']],
  [/point of sale|\bpos\b/i, ['pos', 'point of sale', 'register']],
  [/buy anywhere|\bbapis\b|pick ?up in.?store/i, ['bapis', 'buy anywhere', 'pickup', 'online order']],
  [/store space/i, ['store space', 'celestial', 'queue']],
  [/customer space|retail ?360/i, ['customer space', 'retail 360', 'r360']],
  [/\bcelestial\b/i, ['celestial']],
  [/\bcsg\b/i, ['csg']],
  [/einstein ?360|\be360\b/i, ['einstein 360', 'e360']],
  [/\becm\b|enterprise case management/i, ['ecm', 'case management']],
  [/onesupport|techspot/i, ['onesupport', 'techspot', 'ticket']],
  [/\brefund|\breturn/i, ['return', 'refund', 'exchange']],
  [/\bdrawer\b|\btill\b/i, ['cash drawer', 'till', 'register']],
  [/open(ing)? (the )?store|store open/i, ['open store', 'opening']],
  [/clos(e|ing) (the )?store|store close/i, ['close store', 'closing', 'end of day']],
  [/check[- ]?in/i, ['check in', 'checkin', 'queue']],
  [/appointment/i, ['appointment', 'appt', 'calendar']],
  [/trade[- ]?in/i, ['trade-in', 'trade in']],
  [/\bupgrade\b/i, ['upgrade']],
  [/now tv|now latino/i, ['now tv', 'streaming']],
  [/\bunlock(ed|ing)?\b/i, ['unlock', 'carrier lock']],
  [/qr code/i, ['qr code', 'qr']],
  [/smart ?watch|apple watch|\bwatch(es)?\b/i, ['watch', 'smartwatch', 'wearable']],
  [/\btablet|ipad\b/i, ['tablet', 'ipad']],
  [/\bvoice\b|home phone|landline/i, ['voice', 'home phone', 'landline']],
  [/transfer of service|\btos\b|moving to a new address/i, ['transfer of service', 'tos', 'move', 'moving']],
  [/getting started kit|\bgsk\b/i, ['gsk', 'getting started kit', 'self-install']],
  [/pro[- ]install|professional install/i, ['pro install', 'technician', 'tech visit']],
  [/\bnps\b|medallia|survey/i, ['nps', 'survey', 'medallia']],
  [/commission|\bgp\b|payout/i, ['commission', 'pay', 'gp']],
  [/receipt/i, ['receipt', 'reprint']],
  [/password|locked out|reset/i, ['password', 'locked out', 'reset', 'login']],
  [/sales id/i, ['sales id', 'get paid']],
  [/\bbilling\b/i, ['billing', 'bill']],
  [/equipment|gateway|modem/i, ['equipment', 'gateway', 'modem']],
  [/xfinity communities|\bbulk\b/i, ['bulk', 'xfinity communities', 'mdu']],
  [/spanish|español/i, ['spanish', 'espanol']],
];
const STOP = new Set('a an the to of for and or on in at by how do does i my me what is are can with it be this that from if you your we get need want about there then into out up as so not no yes was were will just one two all any each'.split(' '));
function lexicon(text) {
  const out = [];
  for (const [re, terms] of LEX) if (re.test(text)) out.push(...terms);
  return out;
}
/** short bold UI labels (**Process payment**) are exactly what reps type */
function boldTerms(...strs) {
  const out = [];
  for (const s of strs.flat()) for (const m of String(s ?? '').matchAll(/\*\*(.+?)\*\*/g)) {
    const t = plain(m[1]).replace(/[.:,]+$/, '');
    if (t.length >= 2 && t.length <= 32 && t.split(' ').length <= 5 && !/^\$?[\d.,/%]+$/.test(t)) out.push(t);
  }
  return out;
}
function kw(...lists) {
  const seen = new Set(), out = [];
  for (const raw of lists.flat(3)) {
    if (raw == null) continue;
    const k = plain(String(raw)).toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
    if (!k || k.length < 2 || STOP.has(k) || seen.has(k)) continue;
    seen.add(k); out.push(k);
    if (out.length >= KW_MAX) break;
  }
  return out;
}

/* ------------------------------------------------------------- doc assembly */
const DOCS = [];
const COUNTS = {};
const MEDIA_CHECK = [];
function add(src, d) {
  const where = [d.title, ...(d.crumbs || [])].join(' ');
  if (OTHER_DIVISION.test(where)) { DROPPED.division.push(`${d.id} — ${plain(d.title)}`); return null; }
  if (PLACEHOLDER.test([d.title, d.text, ...(d.steps || []).map(s => s.text)].join(' '))) {
    DROPPED.placeholder.push(`${d.id} — ${plain(d.title)}`); return null;
  }
  const doc = {
    id: d.id, kind: d.kind, title: clip(plain(d.title), 120), crumbs: (d.crumbs || []).map(c => plain(c)),
    tool: d.tool || '', room: d.room || '', anchor: d.anchor || '', locked: !!d.locked,
    text: d.locked ? '' : clip(d.text || ''),
    keywords: kw(d.keywords || [], d.locked ? [] : lexicon([d.title, d.text, ...(d.crumbs || [])].join(' '))),
  };
  if (doc.locked) doc.keywords = lockedKeywords(doc);
  if (!d.locked && d.steps && d.steps.length) doc.steps = d.steps.map((s, i) => {
    const o = { n: i + 1, text: clip(s.text, STEP_MAX) };
    if (s.img) { o.img = s.img; MEDIA_CHECK.push([doc.id, s.img]); }
    return o;
  });
  if (!d.locked && d.media && d.media.length) {
    doc.media = d.media.map(m => {
      const o = { type: m.type, src: m.src };
      if (m.alt) o.alt = clip(plain(m.alt), 240);
      if (m.caption && plain(m.caption) !== plain(m.alt || '')) o.caption = clip(plain(m.caption), 200);
      if (m.poster) { o.poster = m.poster; MEDIA_CHECK.push([doc.id, m.poster]); }
      if (m.captions) { o.captions = m.captions; MEDIA_CHECK.push([doc.id, m.captions]); }
      if (m.start != null) o.start = m.start;
      if (m.page != null) o.page = m.page;
      MEDIA_CHECK.push([doc.id, m.src]);
      return o;
    });
  }
  DOCS.push(doc);
  COUNTS[src] = COUNTS[src] || {};
  COUNTS[src][doc.kind] = (COUNTS[src][doc.kind] || 0) + 1;
  return doc;
}
const NOTES = [];   // report lines collected during the run
const note = s => { NOTES.push(s); console.log('  · ' + s); };

/* ── LOCKED KEYWORDS: NAMES ONLY (security review B2, Oct 2026) ──────────────
 * A locked doc may NAME its transaction, nothing more. Its keywords used to be
 * built from the bold labels inside the encrypted steps and the guide's own
 * keyword list — which put the click path, rate codes, internal hostnames,
 * role names and knowledge-article ids into a public JSON file. Now a locked
 * doc's keywords are words from its own title and crumbs (which already
 * include the category, guide and section titles) and nothing else; every one
 * also has to pass LOCKED_DENY. The engine's glossary supplies the plain-
 * English synonyms at query time, so nothing is added here.
 * lockedKeywords() runs on fresh AND carried-forward docs, and the final
 * assertion (assertLocked) fails the build if any locked doc breaks the rule. */
const LOCKED_DENY = /\d|@|https?:|www\.|\.(?:com|net|org|io|gov)\b|_|^how\d|\bsys\b|\//i;
const LOCKED_CAPS_OK = new Set(['csg', 'tv', 'xh', 'now', 'ecm', 'epon', 'gsk', 'lob', 'ie', 'xm', 'tos', 'cpni']);
function lockedVocab(d) {
  return new Set(kwWords([d.title, ...(d.crumbs || [])].join(' ')));
}
function kwWords(s) {
  return plain(s).toLowerCase().replace(/[“”"’'()]/g, ' ').split(/[^a-z0-9&+.-]+/).map(w => w.replace(/^[.-]+|[.-]+$/g, '')).filter(Boolean);
}
function lockedKeywordOk(k, vocab) {
  if (LOCKED_DENY.test(k)) return false;
  const words = kwWords(k);
  if (!words.length) return false;
  // a short all-caps-looking code (e.g. "vt" "2pb") that is not a known product word
  if (words.length === 1 && words[0].length <= 5 && !LOCKED_CAPS_OK.has(words[0]) && !/^[a-z]+$/.test(words[0])) return false;
  return words.every(w => vocab.has(w));
}
/** A locked section's display title. Unchanged today (the " — <guide>"
 *  suffix on generic sections is kept: in a choices list it is what tells two
 *  "Option 1: …" rows apart; the chat UI strips it for the smaller chips). */
function lockedTitle(title) { return plain(title); }
function lockedKeywords(d) {
  const vocab = lockedVocab(d);
  const phrases = [d.title, ...(d.crumbs || [])]
    .flatMap(t => [t, ...String(t).split(/\s[—–-]\s|:\s/)])
    .map(t => plain(String(t)).toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim());
  const out = [];
  for (const k of phrases) if (k && k.length >= 2 && !STOP.has(k) && !out.includes(k) && lockedKeywordOk(k, vocab)) out.push(k);
  return out.slice(0, 16);
}

/* ── PLACEHOLDER CONTENT (QA round 3) ────────────────────────────────────────
 * An author's note left in a guide ("The FAQ link was not captured… Add the
 * destination URL here") must not be served as an answer. Docs that match are
 * DROPPED from the index and listed for Jeff (the run prints them and the
 * build fails if one ever slips past the drop). The bare word "placeholder" is
 * not in the pattern: Tello's tips legitimately say "use '0000' as a
 * placeholder". */
const PLACEHOLDER = /not captured|add the destination url|add (?:the )?(?:url|link) here|\bTODO\b|\bTBD\b|lorem ipsum|coming soon|fill (?:this|me) in|\bXXX\b/i;
const DROPPED = { placeholder: [], division: [] };

/* ── CENTRAL DIVISION ONLY (Jeff's rule) ────────────────────────────────────
 * The stores are all Central division. A guide section written for another
 * division (West, Northeast) is not indexed, so it can never be an answer or a
 * Related chip. The guide itself still has it; the index just never offers it. */
const OTHER_DIVISION = /\b(?:west|northeast|north east|east|south|southwest)(?:ern)? division\b/i;

/* ----------------------------------------------------------- 1. tools.json */
const TJ = JSON.parse(read('data/tools.json'));
const ROOMS = new Map(TJ.rooms.filter(r => r.id !== 'freezer').map(r => [r.id, r]));
const TOOLS = new Map(TJ.tools.filter(t => t.room !== 'freezer').map(t => [t.slug, t]));
const roomLabel = id => ROOMS.get(id)?.label || '';
const toolOf = slug => { const t = TOOLS.get(slug); if (!t) fail(`tool slug "${slug}" is not in data/tools.json`); return t; };
const aliasKw = (slug, n = 99) => { const t = toolOf(slug); return [t.label, ...(t.aliases || []).slice(0, n)]; };

/* What the external tools (blufoxmobile.github.io) put on screen — harvested
 * 2026-10-20 from each live page's headings, labels and buttons (no rep or
 * manager names). Static so the build stays deterministic and offline. */
const EXT_KW = {
  'quote-6th-gen': ['membership tier', 'silver', 'gold', 'platinum', 'diamond', 'core bill', 'rebundle', 'current carrier', 'number of lines', 'current monthly bill', 'now mobile prepaid', 'internet essentials quote', 'build comparison', 'yearly savings', 'line-by-line breakdown', 'device financing', 'customer declines mobile offer', 'email pdf', 'trade-in', 'promo applied', 'xmc', 't-chart', 'mobile plus', 'mobile select'],
  'quote-upgrade': ['membership tier', 'core bill', 'rebundled core bill', 'current mobile bill', 'new mobile bill', 'upgrade credit', 'trade-in', 'eligible devices', 'xmc insurance', 'view customer preview', 'promotions', 'deadlines', 'watch', 'tablet', 'bundle'],
  'quote-internet': ['whole home bundle', 'internet plan calculator', 'now tv', 'xfinity shield', 'wifi equipment', 'unlimited data', 'cybersecure', 'parental controls', 'xfinity mobile plus', 'change speed', 'submit session', 'new customer', 'internet speeds', 'gig'],
  'tsheet-submissions': ['internet quote sheets', 'nps scan tracker', 'start stop', 'zero-scan', 'reps', 'last month', 'quotes'],
  'yesterdays-conversion': ['traffic', 'mcr', 'mobile close rate', 't-charts', 't-chart %', 'chicago north', 'chicago south', 'chicago east', 'chicago west', 'big south', 'all stores'],
  'daily-sales': ['today', 'store numbers'],
  'commission-payouts': ['rate card', 'product payouts', 'store gp', 'you earn', '2 gig', 'gig', 'ie plus', 'prepaid internet kit', 'mobile plus', 'premium unlimited', 'mobile select', 'by the gig', 'tablets', 'watches', 'xm bapis', 'tv premium', 'sports & news tv', 'world soccer ticket', 'now latino', 'xpro', 'mobile upgrade', 'xfi complete', 'xumo', 'xcam', 'wifi extenders', 'mobile protection', 'shield select', 'digital voice premier', 'video upgrade', 'hsd upgrade', 'multi-play bonus'],
  'wtw-chicago': ['mobile close rate', 'fiscal close rate', 'accessory per box', 'store rankings', 'top reps', 'gig%', 'plus%', 'head chef of the week', 'top 10 nps', 'know your promos', 'quote of the week', 'north side', 'west side', 'south side', 'chicago'],
  'wtw-big-south': ['mobile close rate', 'fiscal close rate', 'accessory per box', 'store rankings', 'top reps', 'gig%', 'plus%', 'head chef of the week', 'top 10 nps', 'know your promos', 'quote of the week', 'tennessee', 'big south'],
  'nps': ['yesterday', 'month to date', 'districts', 'stores', 'reps', 'needs attention', 'nps index'],
  'credit-limit': ['credit line increase', 'core account number', 'add a line', 'upgrade phone', 'add a watch', 'add a tablet', 'submit request'],
  'exception-report': ['by rep', 'by store', 'by exception', 'cancellations', 'lines of business', 'cancel date'],
  'fall-off': ['reason guide', 'fall-off rate', 'stores', 'employees', 'top reason'],
  'rep-hourly-rate': ['rep commission estimator', 'blended wage', 'find yourself', 'district totals', 'hourly'],
  'training-xfinity': ['product training', 'slides', 'mobile select', 'mobile plus', 'accessory math', 'battle cards', 'quiz', 'plans', 'pricing'],
  'fox-run': ['high score', 'scoreboard', 'runner'],
  'after-hours': ['high score', 'leaderboard', 'this week', 'all-time', 'submit score'],
  'deep-six': ['battleship', 'sonar', 'head to head', 'fight the machine', 'two commanders', 'medals'],
  'overdrive': ['kart', 'racing', 'circuits', 'drivers', 'tilt steering', 'drift', 'chicago afterglow'],
  'windy-city-derby': ['home run', 'baseball', 'wrigley', 'rate field', 'daily challenge', 'leaderboard'],
};
/* tools whose own content is indexed deeper further down; their tool doc gets a
 * pointer to the guide-level text */
const GAME_SLUGS = new Set(JSON.parse(read('arcade/manifest.json')).games.map(g => g.slug));

function indexRoomsAndTools() {
  const S = 'tools.json';
  for (const r of ROOMS.values()) {
    const inRoom = [...TOOLS.values()].filter(t => t.room === r.id);
    add(S, {
      id: `room/${r.id}`, kind: 'room', title: r.label, crumbs: [r.label], room: r.id,
      text: join(r.tagline, inRoom.length ? `In this room: ${inRoom.map(t => t.label).join(', ')}` : ''),
      keywords: [r.short, r.label, ...(r.aliases || []), 'room'],
    });
  }
  for (const t of TOOLS.values()) {
    if (GAME_SLUGS.has(t.slug) || t.slug === 'arcade') continue;   // indexed by arcade()
    if (t.slug === 'csg-how-to' || t.slug === 'bp-access') continue; // indexed by lockedGuides()
    const media = [];
    const vid = VIDEO_TOOLS[t.slug];
    if (vid) media.push(videoMedia(vid, t.label));
    add(S, {
      id: `tool/${t.slug}`, kind: 'tool', title: t.label, crumbs: [roomLabel(t.room), t.label],
      tool: t.slug, room: t.room, locked: false,
      text: t.blurb,
      keywords: [t.aliases || [], EXT_KW[t.slug] || [], t.under ? toolOf(t.under).label : ''],
      media,
    });
  }
}

/* ── NO INTERNAL CODES IN THE INDEX (coordinator rule, Oct 2026) ────────────
 * The index is a public repo file. Celestial knowledge-article ids (HOW…, COMMS…,
 * PRD…) and CSG rate / campaign codes (the guides' `code` spans: "IE HSD Pnd N",
 * "HS196") stay in the guides; the index never carries them. scrubDeep() runs on
 * every guide's data before extraction: a code span without "." or ":" is
 * dropped (the eSIM server address the rep must type keeps its span), any
 * sentence or table cell that cites an article id is dropped, and a table
 * column headed "Rate code" / "ID" is dropped. The final assertion fails the
 * build if one still gets through. */
const ARTICLE_ID = /\b(?:HOW|COMMS|PRD|KB)\d{3,}\b/i;
const SCRUB_SKIP = new Set(['f', 'src', 'url', 'source', 'slug', 'id', 'cat', 'g', 'from', 'img', 'key', 'qr', 'data']);
function scrubText(str) {
  let t = String(str).replace(/`([^`]{1,40})`/g, (m, x) => /[.:]/.test(x) ? m : '');
  if (ARTICLE_ID.test(t)) t = t.split(/(?<=[.!?])\s+/).filter(x => !ARTICLE_ID.test(x)).join(' ');
  return t.replace(/\s+([,.;])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}
function scrubTable(tb) {
  if (!tb || !Array.isArray(tb.head)) return tb;
  const drop = new Set(tb.head.map((h, i) => /^(rate code|id|article id|code)$/i.test(String(h).trim()) ? i : -1).filter(i => i >= 0));
  const keep = (_, i) => !drop.has(i);
  tb.head = tb.head.filter(keep);
  tb.rows = tb.rows.map(r => r.filter(keep).map(c => scrubText(String(c).replace(/\[(.+?)\]\([^)]+\)/g, (m, t) => ARTICLE_ID.test(t) ? '' : m))))
    .map(r => r.map(c => c.replace(/^[\s—–-]+|[\s—–-]+$/g, '')))
    .filter(r => r.some(Boolean));
  return tb;
}
function scrubDeep(o, key) {
  if (typeof o === 'string') return SCRUB_SKIP.has(key) ? o : scrubText(o);
  if (Array.isArray(o)) return o.map(x => scrubDeep(x, key));
  if (o && typeof o === 'object') {
    if (Array.isArray(o.head) && Array.isArray(o.rows)) scrubTable(o);
    for (const k of Object.keys(o)) o[k] = scrubDeep(o[k], k);
    if ('code' in o && typeof o.code === 'string') o.code = '';
  }
  return o;
}

/* ------------------------------------- 2a. "G" guides (BAPIS / IE / eSIM)
 * One JSON blob `const G = {...};` per page. Since the Oct 2026 makeover each
 * guide is one TASK PAGE per transaction plus a whole-guide page:
 *   BAPIS, IE:  #/do/<slugify(section.nav)>[~<el id>]   (route(): SECS.find(x=>x.slug===path.slice(3)))
 *   eSIM:       #/do/<task.slug>[~<el id>]              (route(): TASKS.find(x=>x.slug===path.slice(3)))
 *   all three:  #/all~before, #/all~tips                (showGuide({mode:'all'}) -> getElementById -> <details> opened)
 * Old one-page links (#/~s3) are redirected by the guides, but the index points
 * at the new format. Doc ids stay `<slug>/s<n>` (eSIM: the first task cut from
 * section n keeps s<n>; extra tasks cut from the same section are `<slug>/<task>`). */
const guideSlug = s => String(s).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function gStepText(st, override) {
  return join(plain(override || st.text), st.where && `Where: ${plain(st.where)}`, st.result && `You'll see: ${plain(st.result)}`,
    st.warn && `Heads up: ${plain(st.warn)}`, st.note && `Tip: ${plain(st.note)}`, st.info && plain(st.info));
}
function gBlob(dir) {
  const html = read(`tools/${dir}/index.html`);
  const m = html.match(/const G = (\{.*?\});\n/s); if (!m) fail(`${dir}: no const G blob`);
  return { html, G: scrubDeep(JSON.parse(m[1])) };
}
function gPanels(S, slug, G, t, gk) {
  if (G.before && G.before.length) add(S, {
    id: `${slug}/before`, kind: 'faq', title: `${t.label}: before you start`, crumbs: [t.label, 'Before you start'],
    tool: slug, room: t.room, anchor: 'all~before', text: G.before.map(plain).join(' '),
    keywords: ['before you start', 'prerequisites', boldTerms(G.before), gk],
  });
  if (G.tips && G.tips.length) add(S, {
    id: `${slug}/tips`, kind: 'faq', title: `${t.label}: good to know`, crumbs: [t.label, 'Good to know'],
    tool: slug, room: t.room, anchor: 'all~tips', text: G.tips.map(plain).join(' '),
    keywords: ['tips', 'good to know', boldTerms(G.tips), gk],
  });
}
function gGuide(slug, dir) {
  const S = dir, { html, G } = gBlob(dir);
  const t = toolOf(slug), base = `tools/${dir}/shots/`, gk = aliasKw(slug, 10);
  if (!/const SECS=G\.sections\.map\(\(s,si\)=>\(\{s,si,slug:slugify\(s\.nav\)\}\)\);/.test(html)
    || !/const slugify=s=>s\.toLowerCase\(\)\.replace\(\/&\/g,' '\)\.replace\(\/\[\^a-z0-9\]\+\/g,'-'\)\.replace\(\/\^-\|-\$\/g,''\);/.test(html)
    || !/const sec=path\.startsWith\('do\/'\)&&SECS\.find\(x=>x\.slug===path\.slice\(3\)\);/.test(html)
    || !/else if\(path==='all'\) showGuide\(\{mode:'all'/.test(html)
    || !/panelHtml\('before'/.test(html) || !/panelHtml\('tips'/.test(html)) fail(`${dir}: router shape changed — re-verify #/do/<task>`);
  const groupOf = si => (G.groups || []).find(g => (g.secs || []).includes(si));
  G.sections.forEach((s, si) => {
    const steps = (s.steps || []).map(st => ({ text: gStepText(st), img: st.imgs && st.imgs[0] ? base + st.imgs[0].f : undefined }));
    const media = (s.steps || []).flatMap(st => (st.imgs || []).map(im => ({ type: 'image', src: base + im.f, alt: im.alt || im.cap, caption: im.cap })));
    const tbl = s.table ? s.table.rows.map(r => r.map(plain).filter(Boolean).join(' — ')).join('; ') : '';
    const grp = groupOf(si);
    add(S, {
      id: `${slug}/s${si}`, kind: 'section', title: s.title, crumbs: [t.label, ...(grp ? [grp.name] : []), s.title], tool: slug, room: t.room,
      anchor: `do/${guideSlug(s.nav)}`,
      text: join(plain(s.intro), plain(s.introMore), tbl && !steps.length ? tbl : '', steps.length ? `${steps.length} steps.` : '', tbl && steps.length ? tbl : ''),
      keywords: [s.nav, grp && grp.name, boldTerms(s.intro, (s.steps || []).map(st => st.text), s.table ? s.table.rows.map(r => r[0]) : []), gk],
      steps, media,
    });
  });
  gPanels(S, slug, G, t, gk);
}
function esimGuide() {
  const slug = 'esim-activation', dir = 'esim-activation', S = dir, { html, G } = gBlob(dir);
  const t = toolOf(slug), base = `tools/${dir}/shots/`, gk = aliasKw(slug, 10);
  if (!/const TASKS=G\.tasks\.map\(\(t,k\)=>\(\{\.\.\.t,k\}\)\);/.test(html)
    || !/const t=path\.startsWith\('do\/'\)&&TASKS\.find\(x=>x\.slug===path\.slice\(3\)\);/.test(html)
    || !/else if\(path==='all'\) showGuide\(\{mode:'all'/.test(html)
    || !/const secTask=si=>TASKS\.find\(t=>t\.from===si\);/.test(html)) fail(`${dir}: router shape changed — re-verify #/do/<task>`);
  const grp = id => (G.groups || []).find(g => g.id === id);
  const first = new Map();                       // section -> its first task (the one secTask() returns)
  G.tasks.forEach(tk => { if (!first.has(tk.from)) first.set(tk.from, tk.slug); });
  for (const tk of G.tasks) {
    const items = (tk.items || []).map(it => ({ it, st: G.sections[it.si].steps[it.ti] }));
    const steps = items.map(({ it, st }) => ({ text: gStepText(st, it.text), img: st.imgs && st.imgs[0] ? base + st.imgs[0].f : undefined }));
    const seenImg = new Set();
    const media = items.flatMap(({ st }) => (st.imgs || [])).filter(im => !seenImg.has(im.f) && seenImg.add(im.f))
      .map(im => ({ type: 'image', src: base + im.f, alt: im.alt || im.cap, caption: im.cap }));
    let tbl = '';
    if (tk.table != null) {
      const T = G.sections[tk.table].table;
      tbl = T.rows.filter((_, ri) => !tk.rows || tk.rows.includes(ri)).map(r => r.map(plain).filter(Boolean).join(' — ')).join('; ');
    }
    const g = grp(tk.g);
    add(S, {
      id: first.get(tk.from) === tk.slug ? `${slug}/s${tk.from}` : `${slug}/${tk.slug}`,
      kind: 'section', title: tk.title, crumbs: [t.label, ...(g ? [g.name] : []), tk.title], tool: slug, room: t.room,
      anchor: `do/${tk.slug}`,
      text: join(plain(tk.intro), plain(tk.introMore), tk.warn && `Heads up: ${plain(tk.warn)}`, steps.length ? `${steps.length} steps.` : '', tbl),
      keywords: [G.sections[tk.from].nav, g && g.name, boldTerms(tk.intro, items.map(x => x.st.text)), gk],
      steps, media,
    });
  }
  gPanels(S, slug, G, t, gk);
  if (G.qrs) add(S, {   /* the three activation QR codes (header strip of the QR task and the whole guide) */
    id: `${slug}/qr-codes`, kind: 'section', title: 'eSIM activation QR codes', crumbs: [t.label, 'QR codes'],
    tool: slug, room: t.room, anchor: 'do/qr-codes',
    text: G.qrs.map(q => plain(q.cap)).join(' '),
    keywords: ['qr code', 'qr', 'esim qr', 'scan to activate', 'self-activation', 'xfinity app qr', gk],
    media: G.qrs.map(q => ({ type: 'image', src: base + q.f, alt: q.alt, caption: q.cap })),
  });
  if (!G.tasks.some(x => x.slug === 'qr-codes')) fail('esim: qr-codes task missing');
}

/* ------------------------------------------- 2b. Celestial Job Aid
 * Since the Oct 2026 makeover it is a CSG-style app: `const DATA = {categories,
 * guides, oldAnchors}` (a JS object literal, not JSON — evaluated here in a bare
 * Function, the page's own data, no DOM). One guide per transaction. Router:
 *   route(): a==='guide' -> renderGuide(b) -> [gid,anchor]=split('~') ->
 *   getElementById(anchor) = <section class="g-sec" id="s<si>">, step <li id="s<si>-<ti>">,
 *   point <li id="s<si>-p<ti>">, <details id="tips">.
 * So the framed page wants  #/guide/<gid>[~s<si>|~s<si>-p<ti>|~tips]  ("#/" like
 * every other guide; the old "#<card-id>" spelling is redirected by legacy()).
 * Doc ids: the guide (its first section) is `training-pos/<gid>`; later sections
 * `training-pos/<gid>/s<si>`, FAQ questions `training-pos/<gid>/q<n>`, the tips
 * panel `training-pos/<gid>/tips`. Old card ids map through DATA.oldAnchors.  */
const LEGACY = new Map();              // old doc id -> new doc id (asks + eval keep working)
/* Celestial Job Aid doc ids before the Oct 2026 makeover (frozen history: the
   asks files and eval questions were written against these). */
const CJA_OLD_IDS = new Set(('overview overview-2 queue queue-appointments queue-waiting queue-inprogress checkin-member checkin-prospect checkin-cb '
  + 'appointment details details-ai details-insights session-start session-end pos-what pos-rules launch-new launch-inprogress launch-backoffice '
  + 'pos-home sale-steps sale-tips return-steps return-tips bo-home open-drawer fund-drawer settle-drawer tender-count close-drawer pos-help '
  + 'cs-glance cs-what cs-access cs-lookup cs-new cs-existing cs-features cs-tools cs-account cs-billing cs-service cs-devices cs-mobile '
  + 'cs-mercury cs-agentic cs-recommended cs-ama cs-training cs-faqs/q1 cs-faqs/q2 cs-faqs/q3 cs-faqs/q4 cs-faqs/q5').split(' '));
function celestialData() {
  const html = read('tools/celestial-job-aid/index.html');
  const at = html.indexOf('const DATA = {'); if (at < 0) fail('celestial: no const DATA');
  const endAt = html.indexOf('\n};\n', at); if (endAt < 0) fail('celestial: DATA literal not closed');
  let D;
  try { D = Function(`"use strict";return (${html.slice(at + 13, endAt + 2)});`)(); } catch (e) { fail(`celestial: DATA literal did not evaluate: ${e.message}`); }
  const oldAnchors = D.oldAnchors; D = scrubDeep(D); D.oldAnchors = oldAnchors;
  if (!/else if\(a==='guide'\) renderGuide\(b\|\|''\);/.test(html) || !/const \[gid,anchor\]=param\.split\('~'\);/.test(html)
    || !/<section class="g-sec" id="s\$\{si\}">/.test(html) || !/ptHtml\(st,`s\$\{si\}-p\$\{ti\}`,ti\)/.test(html)
    || !/<details class="panel" id="tips">/.test(html) || !/const shot=k=>'shots\/'\+k\+'\.webp';/.test(html))
    fail('celestial: router shape changed — re-verify #/guide/<gid>~s<n>');
  return D;
}
const cjaId = (gid, si) => `training-pos/${gid}${si ? `/s${si}` : ''}`;
function celestial() {
  const slug = 'training-pos', S = 'celestial-job-aid', t = toolOf(slug), gName = t.label, base = 'tools/celestial-job-aid/shots/';
  const D = celestialData();
  const cat = id => D.categories.find(c => c.id === id) || { name: id };
  const img = im => ({ type: 'image', src: base + im.src + '.webp', alt: im.alt, caption: im.caption });
  const listText = l => (l || []).map(x => typeof x === 'string' ? plain(x) : [plain(x.t), ...(x.sub || []).map(plain)].join(' ')).join('; ');
  const rowText = st => join(st.lead && `${plain(st.lead)}:`, plain(st.text), listText(st.list), st.where && `Where: ${plain(st.where)}`,
    st.result && `You'll see: ${plain(st.result)}`, st.warn && `Heads up: ${plain(st.warn)}`, st.note && `Tip: ${plain(st.note)}`, st.info && plain(st.info));
  const FROM_START = /^(from |shortcut|step by step|tender count)/i;
  for (const g of D.guides) {
    const c = cat(g.cat);
    const gk = [g.keywords || [], c.name, aliasKw(slug, 8)];
    if (g.id === 'cs-faqs') {          /* one doc per question */
      g.sections.forEach((s, si) => (s.points || []).forEach((p, pi) => add(S, {
        id: `training-pos/${g.id}/q${pi + 1}`, kind: 'faq', title: plain(p.text), crumbs: [gName, c.name, g.title],
        tool: slug, room: t.room, anchor: `guide/${g.id}~s${si}-p${pi}`, text: join(plain(p.info), plain(p.note)),
        keywords: ['faq', gk], media: (p.imgs || []).map(img),
      })));
      continue;
    }
    g.sections.forEach((s, si) => {
      const steps = (s.steps || []).map(st => ({ text: rowText(st), img: st.imgs && st.imgs[0] ? base + st.imgs[0].src + '.webp' : undefined }));
      const pts = (s.points || []).map(rowText);
      const tbl = s.table ? s.table.rows.map(r => r.map(plain).filter(Boolean).join(' — ')).join('; ') : '';
      const multi = g.sections.length > 1;
      const title = si === 0 ? g.title : FROM_START.test(s.title) ? `${g.title} — ${s.title.replace(/^./, x => x.toLowerCase())}` : s.title;
      add(S, {
        id: cjaId(g.id, si), kind: 'section', title, crumbs: [gName, c.name, ...(multi ? [g.title, s.title] : [g.title])],
        tool: slug, room: t.room, anchor: si === 0 ? `guide/${g.id}` : `guide/${g.id}~s${si}`,
        text: join(si === 0 ? plain(g.summary) : '', plain(s.intro), s.warn && `${plain(s.warn.lbl || 'Heads up')}: ${plain(s.warn.text)}`,
          pts.join(' '), tbl, plain(s.note), steps.length ? `${steps.length} steps.` : ''),
        keywords: [s.title, gk, boldTerms((s.steps || []).map(x => x.text), (s.points || []).map(x => x.text))],
        steps, media: [...(s.steps || []), ...(s.points || [])].flatMap(st => (st.imgs || []).map(img)),
      });
    });
    if (g.tips && g.tips.length) add(S, {
      id: `training-pos/${g.id}/tips`, kind: 'faq', title: `${g.title}: good to know`, crumbs: [gName, c.name, g.title, 'Good to know'],
      tool: slug, room: t.room, anchor: `guide/${g.id}~tips`, text: g.tips.map(plain).join(' '), keywords: ['tips', 'good to know', gk],
    });
  }
  /* old card ids -> new docs, through the guide's own redirect table */
  const toId = target => {
    const m = /^guide\/([^~]+)(?:~(s(\d+)(?:-p(\d+))?|tips))?$/.exec(target || ''); if (!m) return null;
    const [, gid, , si, pi] = m;
    if (m[2] === 'tips') return `training-pos/${gid}/tips`;
    if (gid === 'cs-faqs') return pi != null ? `training-pos/cs-faqs/q${+pi + 1}` : null;
    return cjaId(gid, si ? +si : 0);
  };
  for (const [oldKey, target] of Object.entries(D.oldAnchors || {})) {
    const to = toId(target); if (!to || !CJA_OLD_IDS.has(oldKey)) continue;     /* section-level keys (#open, #sale…) were never doc ids */
    const from = `training-pos/${oldKey}`;
    if (from !== to) LEGACY.set(from, to);
  }
  /* the old FAQ card's 5th question became its own guide; the old overview's second card ("What this job aid covers") folded into the overview */
  LEGACY.set('training-pos/cs-faqs/q5', 'training-pos/cs-report');
  /* STABLE IDS: where exactly one pre-makeover doc id maps onto a new doc, the new
     doc keeps that id (asks files and eval questions are keyed by id). */
  const byNew = new Map(), renamed = new Map();
  for (const [o, n] of LEGACY) if (o.startsWith('training-pos/') && CJA_OLD_IDS.has(o.slice(13))) { if (!byNew.has(n)) byNew.set(n, []); byNew.get(n).push(o); }
  for (const d of DOCS) {
    if (d.tool !== slug) continue;
    const olds = byNew.get(d.id) || [];
    if (olds.length !== 1 || DOCS.some(x => x.id === olds[0])) continue;
    const was = d.id; d.id = olds[0];
    LEGACY.delete(olds[0]);
    for (const [o, n] of LEGACY) if (n === was) LEGACY.set(o, d.id);
    LEGACY.set(was, d.id);                 /* "new natural" id -> kept id, for anyone writing asks against the new guide ids */
    renamed.set(was, d.id);
  }
  /* new-only docs under a renamed guide ("pos-sale/s1", "open-store/tips") hang under the kept id, so id-path parents resolve */
  for (const d of DOCS) {
    if (d.tool !== slug) continue;
    const k = d.id.lastIndexOf('/'), up = d.id.slice(0, k);
    if (k > 13 && renamed.has(up) && !CJA_OLD_IDS.has(d.id.slice(13))) { const was = d.id; d.id = renamed.get(up) + d.id.slice(k); LEGACY.set(was, d.id); }
  }
  LEGACY.set('training-pos/overview-2', 'training-pos/overview');   /* "What this job aid covers" folded into the overview */
  return D;
}

/* ------------------------------------------------- 2c. PortPro (porting)
 * Since the Oct 2026 makeover each carrier has two task pages:
 *   #/carrier/<id>            Port a number in (account number + transfer PIN)
 *   #/carrier/<id>/unlock     Unlock the phone
 * renderCarrier(): [path,anchor]=split('~'); [cid,tk]=path.split('/'); anchors on
 * the port page: ~account ~pin ~tips ~support ~before (sections/<details>), on the
 * unlock page ~unlock ~support. #/<category>, #/table and #/unlock (any carrier)
 * stay. Steps are now objects {text, where, result, note, warn, src}.
 * Screens are base64 data URIs inside shots-<id>.js, not files, so PortPro docs
 * carry no image media (reel titles and captions are text). Ids are unchanged. */
function porting() {
  const slug = 'porting-guide', S = 'porting-guide', t = toolOf(slug), gName = 'PortPro';
  const html = read('tools/porting-guide/index.html');
  const D = scrubDeep(JSON.parse(html.match(/const DATA = (\{.*?\});\n/s)[1]));
  if (!/if\(a==='carrier'\) return renderCarrier\(h\.slice\(8\)\);/.test(html) || !/let \[path,anchor\]=param\.split\('~'\);/.test(html)
    || !/let \[cid,tk\]=path\.split\('\/'\);/.test(html) || !/const taskHref=\(c,t\)=>'#\/carrier\/'\+c\.id\+\(t==='unlock'\?'\/unlock':''\);/.test(html)
    || !/if\(a==='unlock'\) return renderUnlock\(\);/.test(html) || !/if\(a==='table'\) return renderTable\(\);/.test(html))
    fail('porting: router shape changed — re-verify #/carrier/<id>[/unlock]~<anchor>');
  const catName = id => D.categories.find(c => c.id === id)?.name || id;
  const gk = ['portpro', 'port', 'porting', 'port-in', 'port out', 'transfer pin', 'number transfer pin', 'account number'];
  const stepTxt = st => typeof st === 'string' ? st : join(plain(st.text), st.where && `Where: ${plain(st.where)}`, st.result && `You'll see: ${plain(st.result)}`,
    st.warn && `Heads up: ${plain(st.warn)}`, st.note && `Tip: ${plain(st.note)}`);
  const href = (c, task, a) => `carrier/${c.id}${task === 'unlock' ? '/unlock' : ''}${a ? '~' + a : ''}`;
  for (const c of D.categories) add(S, {
    id: `${slug}/cat/${c.id}`, kind: 'section', title: /carriers?$/i.test(c.name) ? c.name : `${c.name} carriers`, crumbs: [gName, c.name], tool: slug, room: t.room,
    anchor: c.id, text: join(c.blurb, `Carriers: ${D.carriers.filter(x => x.type === c.id).map(x => x.name).join(', ')}`), keywords: [c.name, gk],
  });
  add(S, {
    id: `${slug}/table`, kind: 'section', title: `All ${D.carriers.length} carriers at a glance`, crumbs: [gName, 'Quick reference'],
    tool: slug, room: t.room, anchor: 'table', text: `One table: account number, transfer PIN, how long the PIN is good for and unlock rules for every carrier. ${D.carriers.map(c => c.name).join(', ')}.`,
    keywords: ['quick reference', 'all carriers', 'table', 'compare carriers', gk],
  });
  for (const q of D.commonShots || []) add(S, {
    id: `${slug}/common/${slugify(q.title)}`, kind: 'section', title: q.title, crumbs: [gName, 'Is the phone unlocked?'],
    tool: slug, room: t.room, anchor: 'unlock', text: `Any carrier: iPhone — Settings › General › About › Carrier Lock ("No SIM restrictions" means unlocked). Samsung — screen by screen below (${q.label}).`,
    keywords: ['network lock', 'carrier lock', 'unlock', 'samsung', 'iphone', 'check unlock', 'is the phone unlocked', gk], steps: q.screens.map(s => ({ text: s.caption })),
  });
  for (const c of D.carriers) {
    const ck = [c.name, c.aliases, c.network, catName(c.type), gk];
    const shotsFor = k => (c.shots || []).filter(q => q.section === k);
    const kvs = { account: [['Format', c.account.format]], pin: [['Dial or text', c.pin.dial], ['PIN format', c.pin.format], ['Expires', c.pin.expires], ['Turn this off first', c.pin.lockToDisable]], unlock: [['Postpaid', c.unlock.postpaid], ['Prepaid', c.unlock.prepaid]] };
    const unk = v => !v || /^(not confirmed|not stated|not applicable)/i.test(v);
    add(S, {
      id: `${slug}/${c.id}`, kind: 'section', title: `Port from ${c.name}`, crumbs: [gName, catName(c.type), c.name],
      tool: slug, room: t.room, anchor: href(c, 'port'),
      text: join(`Account number: ${c.account.summary}`, `Transfer PIN: ${c.pin.summary}`, c.expShort && `PIN good ${c.expShort}`,
        c.support.phone && `Carrier support: ${c.support.phone}`, `Runs on ${c.net}`),
      keywords: [ck, c.self ? 'self-serve pin' : 'call carrier', c.dialShort],
    });
    for (const [k, title] of [['account', 'account number'], ['pin', 'transfer PIN'], ['unlock', c.type === 'voip' ? 'unlock the number' : 'device unlock']]) {
      const sec = c[k], reels = shotsFor(k);
      add(S, {
        id: `${slug}/${c.id}/${k}`, kind: 'section', title: `${c.name} ${title}`, crumbs: [gName, c.name, title[0].toUpperCase() + title.slice(1)],
        tool: slug, room: t.room, anchor: k === 'unlock' ? href(c, 'unlock') : href(c, 'port', k),
        text: join(sec.summary, kvs[k].filter(([, v]) => !unk(v)).map(([l, v]) => `${l}: ${v}`),
          reels.length && `See it on screen: ${reels.map(q => `${q.title} (${q.screens.length} screens)`).join('; ')}`),
        keywords: [c.name, c.aliases, k === 'pin' ? ['pin', 'transfer pin', 'port out pin', 'number transfer pin', c.dialShort, c.pin.lockToDisable && 'number lock'] : k === 'account' ? ['account number', 'account #', 'acct'] : ['unlock', 'carrier lock', 'device unlock'],
          reels.length ? reels.map(q => q.title) : [], gk],
        steps: (sec.steps || []).map(st => ({ text: stepTxt(st) })),
      });
    }
    if ((c.gotchas || []).length) add(S, {
      id: `${slug}/${c.id}/tips`, kind: 'faq', title: `${c.name} porting: good to know`, crumbs: [gName, c.name, 'Good to know'],
      tool: slug, room: t.room, anchor: href(c, 'port', 'tips'), text: c.gotchas.map(plain).join(' '), keywords: [c.name, c.aliases, 'gotchas', 'tips', gk],
    });
  }
  note('porting-guide: screenshots are base64 data URIs inside shots-<carrier>.js — no file-backed image media; reel titles indexed as text');
}

/* --------------------------------------------------------------- 2d. videos */
const VIDEO_TOOLS = {
  'quote-6th-gen-how-to': { dir: 'quote-6th-gen-how-to', m3u8: 'howto.m3u8', chapters: /^(?:.*?\s)?(Step (\d+)\.\s*(.+))$/ },
  'quote-upgrade-how-to': { dir: 'quote-upgrade-how-to', m3u8: 'howto.m3u8', chapters: /^(?:.*?\s)?(Step (\d+)\.\s*(.+))$/ },
  'site-tour': { dir: 'site-tour', m3u8: 'tour.m3u8', tour: true },
};
function videoMedia(v, title, start) {
  const b = `tools/${v.dir}/video/`;
  return { type: 'hls', src: b + v.m3u8, poster: b + 'poster.jpg', captions: b + 'captions.vtt', alt: title, start };
}
function vtt(p) {
  const cues = [];
  for (const blk of read(p).replace(/\r/g, '').split(/\n\n+/)) {
    const m = blk.match(/(\d+):(\d+):(\d+)\.(\d+)\s*-->\s*[\d:.]+\s*\n([\s\S]+)/);
    if (m) cues.push({ t: Math.round((+m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000) * 10) / 10, text: m[5].replace(/\s+/g, ' ').trim() });
  }
  return cues;
}
function videos() {
  const S = 'videos';
  for (const [slug, v] of Object.entries(VIDEO_TOOLS)) {
    const t = toolOf(slug);
    const page = read(`tools/${v.dir}/index.html`);
    const kicker = htmlText((page.match(/<div class="kicker">([\s\S]*?)<\/div>/) || [])[1] || '');
    const cues = vtt(`tools/${v.dir}/video/captions.vtt`);
    const all = cues.map(c => c.text).join(' ');
    const title = `${t.label} (video)`;
    add(S, {
      id: `video/${slug}`, kind: 'video', title, crumbs: [roomLabel(t.room), t.label, 'Video'], tool: slug, room: t.room,
      text: join(t.blurb, kicker, `Transcript: ${all}`), keywords: ['video', 'watch', 'training video', t.aliases],
      media: [videoMedia(v, title, 0)],
    });
    /* chapters, cut on the narration's own markers */
    let marks = [];
    if (v.chapters) {
      // "Step N." can start mid-cue: split cue texts at "Step N."
      cues.forEach((c, i) => { const m = c.text.match(/Step (\d+)\.\s*(.*)$/); if (m) marks.push({ t: c.t, n: +m[1], head: (m[2] || (cues[i + 1] || {}).text || '') }); });
      marks = marks.filter((m, i, a) => a.findIndex(x => x.n === m.n) === i);
    } else if (v.tour) {
      const T = [[/^This is Cook County Cooks/, 'Intro', 'hero'], [/^Getting around is easy/, 'Getting around the site', 'hero'], [/^First stop: The Pass/, 'The Pass', 'pass'], [/^Next, the Host Stand/, 'Host Stand', 'host'],
        [/^In the Dining Room/, 'Dining Room', 'dining'], [/^The Prep Station/, 'Prep Station', 'prep'], [/^The Back Office|^The Training Room/, 'Back Office', 'office'],
        [/^A few of the how-to guides/, 'Passcode guides', 'office'], [/^Last stop: the Break Room/, 'Break Room', 'breakroom']];
      /* the chapter KEY (doc id) stays as the narration names it; the TITLE follows the room's current label in data/tools.json
         (the tour video still says "Back Office" for the room tools.json now calls "Training Room") */
      cues.forEach(c => { for (const [re, name, room] of T) if (re.test(c.text)) marks.push({ t: c.t, key: name, head: ROOMS.has(room) && name !== 'Passcode guides' ? roomLabel(room) : name, room }); });
    }
    marks.forEach((m, i) => {
      const end = marks[i + 1] ? marks[i + 1].t : Infinity;
      const body = cues.filter(c => c.t >= m.t && c.t < end).map(c => c.text).join(' ').replace(/^.*?(Step \d+\.)/, '$1');
      const first = (v.chapters ? body.replace(/^Step \d+\.\s*/, '') : m.head).replace(/([.!?])\s.*$/, '$1').replace(/[.!?]$/, '').replace(/^Before we talk phones, /, '');
      const head = v.chapters ? `${t.label.replace(/ How To$/, '')} — step ${m.n}: ${first[0].toUpperCase() + first.slice(1)}` : `Site tour: ${m.head}`;
      add(S, {
        id: `video/${slug}/${v.chapters ? `step-${m.n}` : slugify(m.key)}`, kind: 'video', title: head,
        crumbs: [t.label, v.chapters ? `Step ${m.n}` : m.head], tool: slug, room: v.tour && m.room !== 'hero' ? m.room : t.room,
        text: join(`At ${Math.floor(m.t / 60)}:${String(Math.floor(m.t % 60)).padStart(2, '0')} in the video.`, body),
        keywords: ['video', 'chapter', v.chapters ? `step ${m.n}` : m.head, t.label],
        media: [videoMedia(v, head, m.t)],
      });
    });
  }
}

/* ---------------------------------------------------------- 2e. print outs */
let PDFTOTEXT = null;
function pdftext(file, args = []) {
  if (PDFTOTEXT === false) return null;
  try { const out = execFileSync('pdftotext', [...args, path.join(ROOT, file), '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 << 20 }); PDFTOTEXT = true; return out; }
  catch (e) { if (e.code === 'ENOENT') { PDFTOTEXT = false; note('pdftotext not installed — printout docs use manifest text only'); } return null; }
}
const titleCase = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
function printouts() {
  const S = 'printouts', t = toolOf('printouts');
  const M = JSON.parse(read('printouts/manifest.json'));
  const group = id => M.groups.find(g => g.id === id)?.label || '';
  for (const f of M.files) {
    const src = `printouts/${f.file}`;
    if (!exists(src)) fail(`printout missing on disk: ${src}`);
    const extra = [];
    let pageNames = [];
    if (f.type === 'pdf') {
      const tx = pdftext(src);
      if (tx != null) {
        const pages = tx.split('\f').filter(p => p.trim());
        /* per-store sheets: page heading is the store name */
        if (/one page per store|one per store/i.test(f.blurb)) {
          pageNames = pages.map(p => p.split('\n').map(x => x.trim()).filter(x => x && !/^xfinity$/i.test(x))[0]).filter(Boolean).map(titleCase);
          extra.push([...new Set(pageNames)]);
        } else {
          extra.push(boldish(pages.slice(0, 3).join('\n')));
        }
      }
    }
    add(S, {
      id: `printouts/${slugify(f.file.replace(/\.[a-z0-9]+$/i, ''))}`, kind: 'printout', title: f.label,
      crumbs: [t.label, group(f.group)], tool: 'printouts', room: t.room,
      /* the station routes #/<sheet-id> (tools/printouts/index.html sheetId():
         the file name without extension, slugified exactly like this) */
      anchor: printoutAnchor(f),
      text: join(f.blurb, pageNames.length && `Stores: ${[...new Set(pageNames)].join(', ')}`),
      keywords: [f.label, f.file.replace(/\.[a-z0-9]+$/i, ''), group(f.group), 'print', 'printout', f.type === 'pdf' ? 'pdf' : 'image', extra, matchingAliases(f)],
      media: [{ type: f.type === 'pdf' ? 'pdf' : 'image', src, alt: f.label }],
    });
    if (/handbook/i.test(f.file)) handbookSections(f, src, t);
  }
}
/** tools/printouts/index.html's sheetId() — KEEP IN STEP: the file name
 *  without its extension, lower-cased, runs of non-alphanumerics to "-". */
const printoutAnchor = (f, page) => slugify(f.file.replace(/\.[a-z0-9]+$/i, '')) + (page ? `~p${page}` : '');
/** the printouts tool's own aliases that point at this file */
function matchingAliases(f) {
  const hay = (f.label + ' ' + f.file + ' ' + f.blurb).toLowerCase();
  return (toolOf('printouts').aliases || []).filter(a => a.split(' ').every(w => hay.includes(w)));
}
/** a few distinctive capitalised phrases from a PDF's first pages */
function boldish(tx) {
  const words = (tx.match(/\b[A-Z][A-Za-z&+'’.-]{2,}(?: [A-Z][A-Za-z&+'’.-]{1,}){0,2}\b/g) || []).map(s => s.trim());
  const seen = new Map(); for (const w of words) seen.set(w, (seen.get(w) || 0) + 1);
  return [...seen.keys()].filter(w => w.length >= 4 && w.length <= 28).slice(0, 18);
}
/** Employee Handbook: one doc per numbered section, with its PDF page */
function handbookSections(f, src, t) {
  const tx = pdftext(src, ['-layout', '-l', '3']); if (tx == null) return;
  const full = pdftext(src) || '';
  const pages = full.split('\f');
  const pageOf = num => { for (let i = 3; i < pages.length; i++) if (new RegExp(`^${num.replace('.', '\\.')} [A-Z]`, 'm').test(pages[i])) return i + 1; return null; };
  const secs = [];
  const lines = tx.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m = line.match(/^\s*(\d+(?:\.\d+)?)\s+(.+?)\s*\.{2,}\s*(\d+)?\s*$/) || line.match(/^\s*(\d+\.\d+)\s+([A-Z].+?)\s*$/);
    if (!m || /table of contents/i.test(m[2])) continue;
    if (secs.some(s => s.num === m[1])) continue;
    let title = m[2];
    /* A TOC entry that wraps: "13.3 Continuation … Omnibus Budget" then
       "Reconciliation Act (COBRA) ......35" on the next line, which has no
       number of its own. Join it, or the title is cut mid-name. */
    const next = lines[i + 1] || '';
    if (!/\.{2,}/.test(line) && next && !/^\s*\d+(?:\.\d+)?\s/.test(next) && /\.{2,}\s*\d+\s*$/.test(next)) {
      title += ' ' + next.replace(/\.{2,}\s*\d+\s*$/, '').trim();
      i++;
    }
    secs.push({ num: m[1], title: title.replace(/[.:\s]+$/, '').replace(/\s+/g, ' ') });
  }
  const tops = new Map(secs.filter(s => !s.num.includes('.')).map(s => [s.num, s.title]));
  for (const s of secs) {
    const page = pageOf(s.num); if (!page) continue;
    const chapter = tops.get(s.num.split('.')[0]) || '';
    let nice = s.title === s.title.toUpperCase() ? titleCase(s.title) : s.title;
    /* "Continuation of Health Benefits Under the federal Consolidated Omnibus
       Budget Reconciliation Act (COBRA)" -> "Continuation of Health Benefits
       (COBRA)": a statute's full name does not fit a chip or a choice row. */
    const law = nice.match(/^(.{12,60}?)\s+(?:under|pursuant to|in accordance with)\b.*(\([A-Z]{3,}\))$/i);
    if (law && nice.length > 70) nice = `${law[1]} ${law[2]}`;
    add('printouts', {
      id: `printouts/employee-handbook/${s.num}`, kind: 'section', title: `Employee Handbook ${s.num}: ${nice}`,
      crumbs: [t.label, 'Employee Handbook', titleCase(chapter)], tool: 'printouts', room: t.room,
      anchor: printoutAnchor(f, page),     /* the station opens the PDF at #page=N */
      text: `Section ${s.num} "${nice}" is on page ${page} of the Employee Handbook (January 2026). Open Print Outs → Employee Handbook.`,
      keywords: [nice, titleCase(chapter), 'employee handbook', 'handbook', 'policy', 'hr'],
      media: [{ type: 'pdf', src, alt: `Employee Handbook, page ${page}`, page }],
    });
  }
}

/* ---------------------------------------------------- 2f. arcade + casino */
function arcade() {
  const S = 'arcade';
  const M = JSON.parse(read('arcade/manifest.json'));
  const at = toolOf('arcade');
  add(S, {
    id: 'tool/arcade', kind: 'tool', title: at.label, crumbs: [roomLabel(at.room), at.label], tool: 'arcade', room: at.room,
    text: join(at.blurb, `${M.games.length} games: ${M.games.map(g => g.title).join(', ')}`), keywords: [at.aliases, M.games.map(g => g.title)],
  });
  for (const g of M.games) {
    const t = toolOf(g.slug);
    add(S, {
      id: `game/${g.slug}`, kind: 'game', title: g.title, crumbs: [roomLabel(t.room), at.label, g.title], tool: g.slug, room: t.room,
      text: join(t.blurb, g.blurb), keywords: [t.label, t.aliases, EXT_KW[g.slug] || [], 'game', 'arcade', 'play'],
    });
  }
  /* casino tables: js/main.mjs GAMES list; its router is location.hash.slice(1) -> #<id> */
  const mj = read('tools/casino/js/main.mjs');
  if (!/const id = location\.hash\.slice\(1\);/.test(mj)) fail('casino: router shape changed');
  const ct = toolOf('casino');
  for (const m of mj.matchAll(/\{ id: '([a-z]+)', title: '([^']+)', sub: '([^']+)', tag: '([^']+)'/g)) {
    add(S, {
      id: `game/casino/${m[1]}`, kind: 'game', title: `${m[2]} — Blufox Casino`, crumbs: [roomLabel(ct.room), 'Blufox Casino', m[2]],
      tool: 'casino', room: ct.room, anchor: m[1],
      text: `${m[2]} (${titleCase(m[3])} · ${m[4]}) at the Blufox Casino, dealt by Ace. Play chips only — nothing to buy and nothing to win.`,
      keywords: [m[2], m[1], 'casino', 'game', 'play chips', m[3]],
    });
  }
}

/* ------------------------------------------------------- 2g. small pages */
function smallPages() {
  const t = toolOf('suggestion-box');
  const html = read('tools/suggestion-box/index.html');
  const topics = [...html.matchAll(/<label[^>]*class="[^"]*chip[^"]*"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map(m => decode(m[1]));
  const T2 = topics.length ? topics : ['Store Operations', 'Sales & Promos', 'Tools & Website', 'Scheduling', 'Training', 'Recognition', 'Other'];
  const d = DOCS.find(x => x.id === 'tool/suggestion-box');
  d.text = clip(join(t.blurb, `Topics: ${T2.join(', ')}.`, 'Anonymous by default: your name, phone or email are only sent if you add them.'));
  d.keywords = kw(d.keywords, T2);
  /* site-wide FAQs, grounded in the site tour narration (tools/site-tour/video/captions.vtt) */
  const cues = vtt('tools/site-tour/video/captions.vtt');
  const findCue = re => { const c = cues.find(c => re.test(c.text)); if (!c) fail(`site FAQ cue not found: ${re}`); return c.t; };
  const tour = VIDEO_TOOLS['site-tour'];
  const FAQ = [
    ['find-a-tool', 'How do I find a tool on the site?', 'Scroll to walk from room to room, or use the menu across the top to jump to any room. Tap Find a tool to search by name, or the C³ button in the corner for the full list. Every tool opens right on the site; close it and you are back where you left off.', /Getting around is easy/, 'host', ['find a tool', 'search', 'menu', 'c3 button', 'navigate', 'where is']],
    ['passcode', 'A guide is asking for a passcode', 'A few how-to guides (CSG How To and Request Access) need a team passcode. Ask your manager for it.', /need a passcode/, 'office', ['passcode', 'password', 'locked', 'code', 'csg how to', 'request access']],
    ['head-chef-wall', 'Head Chef wall', "The Head Chef wall in the Break Room shows this week's top performers from every district. Tap a photo to see why they won.", /Head Chef wall/, 'breakroom', ['head chef', 'employee of the week', 'top performers', 'wall of fame', 'recognition']],
    ['days-since-nps', 'Days since last bad NPS survey',  `The TV in the ${roomLabel('office')} counts the days since each store's last bad NPS survey.`, /days since each store/, 'office', ['nps', 'detractor', 'days since', 'bad survey', 'streak']],
    ['todays-promo', "Today's mobile promo",  `The screen up front at the ${roomLabel('host')} shows today's mobile promo. Tap it to open ${toolOf(PROMO_TOOL).label}: every current promotion explained, plus what every trade-in is worth.`, /today's mobile promo/i, 'host', ['promo', 'promotion', 'deal of the day', 'specials'], PROMO_TOOL],
  ];
  for (const [id, title, text, re, room, k, tool = ''] of FAQ) {
    const start = findCue(re);
    add('site', {
      id: `faq/${id}`, kind: 'faq', title, crumbs: ['Cook County Cooks', roomLabel(room)], tool, room, text,
      keywords: [k, roomLabel(room)], media: [videoMedia(tour, `Site tour — ${title}`, start)],
    });
  }
  /* tools/employee-of-week is not in data/tools.json: orphaned, not indexed */
  if (exists('tools/employee-of-week/index.html') && !TOOLS.has('employee-of-week')) note('tools/employee-of-week: not in data/tools.json (orphaned) — skipped');
}

/* ------------------------------------------------ 2h. mobile promotions
 * The Mobile Promotions guide (tools/mobile-promos/) is a live read of the two
 * quote sheets; data/promos.json is its saved copy (build/pull-promos.mjs).
 * The docs are built by assets/promo-docs.js — the SAME builder ask.js runs on
 * the live feed at run time — so the index and the live answer cannot drift.
 * CURRENT PROMOS ONLY (Jeff): promoDocs() drops anything ended by today's
 * Chicago date; ask.js re-prunes at run time, because this file can be days old.
 * The docs carry extra fields the chat renders (`promo`, `trade`, `list`);
 * they skip add()'s field whitelist, but go through every check below. */
function mobilePromos() {
  const S = 'mobile-promos';
  const t = toolOf(PROMO_TOOL);
  if (!exists('data/promos.json')) { note('mobile-promos: data/promos.json not found — no promo docs'); return; }
  let feed;
  try { feed = JSON.parse(read('data/promos.json')); } catch (e) { fail(`data/promos.json: not valid JSON (${e.message})`); }
  if (!Array.isArray(feed.promos)) fail('data/promos.json: no promos array');
  const today = process.env.PROMOS_TODAY || chicagoToday();
  const docs = promoDocs(feed, { today, room: t.room });
  for (const d of docs) {
    if (d.tool !== PROMO_TOOL || !d.id.startsWith(`${PROMO_TOOL}/`)) fail(`${d.id}: promo doc outside ${PROMO_TOOL}/`);
    if (!/^[a-z0-9][a-z0-9/_-]*$/.test(d.anchor || 'x')) fail(`${d.id}: anchor "${d.anchor}" is not a guide route`);
    if ((d.text || '').length > 700) fail(`${d.id}: text over 700 chars`);
    DOCS.push(d);
    COUNTS[S] = COUNTS[S] || {};
    COUNTS[S][d.kind] = (COUNTS[S][d.kind] || 0) + 1;
  }
  const ended = feed.promos.length - docs.filter(d => d.promo).length;
  note(`mobile-promos: ${docs.length} docs from ${feed.promos.length} promos in data/promos.json (snapshot ${feed.generated_at || '?'}; ${ended} ended by ${today} and left out)`);
}

/* ----------------------------------------------------- 3. locked guides */
/** Envelope (both pages' own unlock code): base64(JSON {v, iter, salt, iv, ct[, aad]}),
 *  key = PBKDF2-SHA256(pass, salt, iter) -> AES-256-GCM, ct = ciphertext||tag(16),
 *  plaintext = gzip(JSON). Neither payload carries AAD today; it is honoured if present. */
export function openEnvelope(b64json, pass) {
  const p = JSON.parse(Buffer.from(b64json, 'base64').toString('utf8'));
  for (const k of ['iter', 'salt', 'iv', 'ct']) if (p[k] == null) throw new Error(`envelope missing ${k}`);
  const key = crypto.pbkdf2Sync(Buffer.from(pass, 'utf8'), Buffer.from(p.salt, 'base64'), p.iter, 32, 'sha256');
  const ct = Buffer.from(p.ct, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
  if (p.aad) d.setAAD(Buffer.from(p.aad, 'base64'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return { v: p.v, data: JSON.parse(zlib.gunzipSync(plain).toString('utf8')) };
}
export function sealEnvelope(obj, pass, { iter = 600000, aad } = {}) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(Buffer.from(pass, 'utf8'), salt, iter, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv); if (aad) c.setAAD(aad);
  const ct = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj)))), c.final(), c.getAuthTag()]);
  const env = { v: crypto.randomBytes(6).toString('hex'), iter, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
  if (aad) env.aad = aad.toString('base64');
  return Buffer.from(JSON.stringify(env)).toString('base64');
}
const LOCKED = [
  { slug: 'csg-how-to', dir: 'csg-how-to', env: 'CSG_PASS', name: 'CSG How To',
    payload: () => { const h = read('tools/csg-how-to/index.html'); const n = +(h.match(/PAYLOAD_PARTS = (\d+)/) || [])[1]; if (!n) fail('csg: PAYLOAD_PARTS not found');
      return Array.from({ length: n }, (_, i) => read(`tools/csg-how-to/payload-${i + 1}.txt`).trim()).join(''); } },
  { slug: 'bp-access', dir: 'request-access', env: 'RA_PASS', name: 'Request Access',
    payload: () => (read('tools/request-access/index.html').match(/const PAYLOAD = "([^"]+)"/) || fail('request-access: PAYLOAD not found'))[1] },
];
/* generic section titles that need the guide's name to mean anything */
const GENERIC_SEC = /^(finish|check|schedule|complete|pick|choose|review|start|add the|find|order details|job details|summary|account details|provisioning|approval|picklist|option \d|scheduling|how to enter|rate codes|bulk rate codes|some examples|the lines|where the|cable modem|emta|ledger|statements|future statements|quick look|missing|disconnects|upgrades|new installation|transfers of service|if you get|from the|verification|your part|port order|entering|adding|verifying)/i;
function lockedGuides(prev) {
  const LOCKED_SOURCES = {};
  for (const L of LOCKED) {
    const S = L.dir, t = toolOf(L.slug);
    const raw = L.payload();
    const v = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')).v;
    LOCKED_SOURCES[L.slug] = v;
    const html = read(`tools/${L.dir}/index.html`);
    /* anchor format is read off the guide's own router, and must still match */
    /* Oct 2026 makeover: route() is `else if(a==='guide') renderGuide(b||'');`, renderGuide splits
       [gid,anchor] on '~' and scrolls to getElementById(anchor) = <section class="g-sec" id="s<si>">.
       CSG also redirects retired guide ids through DATA.redirects / redirectAnchors (used below for LEGACY). */
    if (!/else if\(a==='guide'\) renderGuide\(b\|\|''\);/.test(html) || !/const \[gid,anchor\]=param\.split\('~'\);/.test(html) || !/<section class="g-sec" id="s\$\{si\}">/.test(html)
      || !/window\.addEventListener\('hashchange',route\); route\(\);/.test(html))
      fail(`${L.dir}: router shape changed — re-verify #/guide/<id>~s<n>`);
    add(S, {
      id: `tool/${L.slug}`, kind: 'tool', title: t.label, crumbs: [roomLabel(t.room), t.label], tool: L.slug, room: t.room,
      text: t.blurb, keywords: [t.aliases, 'passcode'],
    });
    const pass = process.env[L.env];
    if (!pass) {
      const carried = prev && prev.locked_sources && prev.locked_sources[L.slug] === v ? prev.docs.filter(d => d.tool === L.slug && d.locked && d.id !== `tool/${L.slug}`) : [];
      if (carried.length) {
        for (const d0 of carried) {
          // A carried doc never went through add(): apply the same rules here
          // (names-only keywords, title tidy, division/placeholder drop), so a
          // rebuild WITHOUT the passcode still produces clean locked docs.
          const d = { ...d0, text: '', title: lockedTitle(d0.title, d0.crumbs), keywords: [] };
          delete d.steps; delete d.media; delete d.asks; // asks come from build/ask-asks/ (mergeAsks), never carried
          if (OTHER_DIVISION.test([d.title, ...(d.crumbs || [])].join(' '))) { DROPPED.division.push(`${d.id} — ${d.title}`); continue; }
          d.keywords = lockedKeywords(d);
          DOCS.push(d); COUNTS[S] = COUNTS[S] || {}; COUNTS[S][d.kind] = (COUNTS[S][d.kind] || 0) + 1;
        }
        for (const [o, n] of Object.entries((prev && prev.legacy_ids) || {})) if (o.startsWith(L.slug + '/')) LEGACY.set(o, n);
        note(`${L.name}: ${L.env} not set — carried forward ${carried.length} locked docs from the previous index (payload ${v} unchanged)`);
      } else {
        delete LOCKED_SOURCES[L.slug];
        note(`${L.name}: locked guide not expanded — passcode needed (${L.env})`);
      }
      continue;
    }
    let D;
    try { D = openEnvelope(raw, pass).data; }
    catch (e) { fail(`${L.name}: decrypt failed with ${L.env} (wrong passcode or changed envelope): ${e.message}`); }
    const cat = id => D.categories.find(c => c.id === id) || { id, name: id };
    for (const c of D.categories) {
      add(S, { id: `${L.slug}/${c.id}`, kind: 'section', locked: true, title: `${L.name}: ${c.name}`, crumbs: [L.name, c.name], tool: L.slug, room: t.room,
        anchor: c.id, keywords: [] });
    }
    for (const g of D.guides) {
      const c = cat(g.cat);
      add(S, { id: `${L.slug}/${g.id}`, kind: 'section', locked: true, title: g.title, crumbs: [L.name, c.name, g.title], tool: L.slug, room: t.room,
        anchor: `guide/${g.id}`, keywords: [] });
      (g.sections || []).forEach((s, si) => {
        const st = plain(s.title);
        const title = lockedTitle(GENERIC_SEC.test(st) ? `${st} — ${g.title}` : st, [L.name, c.name, g.title, st]);
        add(S, { id: `${L.slug}/${g.id}/s${si}`, kind: 'section', locked: true, title, crumbs: [L.name, c.name, g.title, st], tool: L.slug, room: t.room,
          anchor: `guide/${g.id}~s${si}`,
          keywords: [] });
      });
    }
    /* retired guide ids (split into one-transaction guides) -> the new doc, via the guide's own redirect tables */
    const toDoc = target => { const [g, a] = String(target).split('~'); const m = /^s(\d+)$/.exec(a || ''); return `${L.slug}/${g}${m ? `/s${m[1]}` : ''}`; };
    for (const [old, to] of Object.entries(D.redirects || {})) {
      LEGACY.set(`${L.slug}/${old}`, toDoc(to));
      for (const [a, tgt] of Object.entries((D.redirectAnchors || {})[old] || {})) if (/^s\d+$/.test(a)) LEGACY.set(`${L.slug}/${old}/${a}`, toDoc(tgt));
    }
    note(`${L.name}: decrypted payload ${v} in memory — ${D.guides.length} guides, ${D.guides.reduce((n, g) => n + (g.sections || []).length, 0)} transactions`);
  }
  return LOCKED_SOURCES;
}

/* ------------------------------------------------------------- 4. asks */
/* Rep phrasings per doc, written by people who never saw the test sets
   (build/ask-asks/WRITER-BRIEF.md). Normalised (lower case, plain, one
   space), deduped per doc, capped at ASKS_MAX. */
const ASKS_DIR = 'build/ask-asks', ASKS_MAX = 14;
const REMAPPED = [];
function mergeAsks() {
  const dir = path.join(ROOT, ASKS_DIR);
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort(); } catch { note(`asks: ${ASKS_DIR}/ not found — no asks merged`); return; }
  const byId = new Map(DOCS.map(d => [d.id, d]));
  const merged = new Map();
  const unknown = [];
  for (const f of files) {
    let j;
    try { j = JSON.parse(read(`${ASKS_DIR}/${f}`)); } catch (e) { fail(`${ASKS_DIR}/${f}: not valid JSON (${e.message})`); }
    for (const [id0, list] of Object.entries(j)) {
      const id = byId.has(id0) ? id0 : LEGACY.get(id0) || id0;
      if (id !== id0) REMAPPED.push(`${id0} -> ${id}`);
      if (!byId.has(id)) { unknown.push(`${f}: ${id0}`); continue; }
      if (!Array.isArray(list)) fail(`${ASKS_DIR}/${f}: ${id} is not an array`);
      if (!merged.has(id)) merged.set(id, []);
      merged.get(id).push(...list);
    }
  }
  if (unknown.length) fail(`asks for doc ids that are not in the index (fix the asks file or the id):
  ${unknown.slice(0, 20).join('\n  ')}`);
  let total = 0, droppedLocked = [], dup = 0;
  for (const [id, list] of merged) {
    const d = byId.get(id);
    const out = [];
    const seenA = new Set();
    for (const raw of list) {
      const a = plain(String(raw)).toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
      if (!a || a.length > 120) continue;
      if (d.locked && LOCKED_DENY.test(a)) { droppedLocked.push(`${id}: ${a}`); continue; }
      if (/freezer|walk-in|walk in freezer/i.test(a)) continue;
      const k = a.replace(/[^a-z0-9]+/g, '');
      if (seenA.has(k)) { dup++; continue; }
      seenA.add(k);
      out.push(a);
    }
    if (out.length) { d.asks = out.slice(0, ASKS_MAX); total += d.asks.length; }
  }
  const without = DOCS.filter(d => !d.asks).map(d => d.id);
  note(`asks: ${total} phrasings merged onto ${DOCS.length - without.length}/${DOCS.length} docs from ${files.length} files (${dup} duplicates removed)`);
  if (droppedLocked.length) note(`asks: dropped ${droppedLocked.length} locked-doc phrasing(s) that trip the locked denylist: ${droppedLocked.join('; ')}`);
  if (REMAPPED.length) note(`asks: ${REMAPPED.length} asks key(s) written for a retired doc id were merged onto its new doc (legacy_ids in the index)`);
  if (without.length) note(`asks: ${without.length} doc(s) have no phrasings: ${without.slice(0, 12).join(', ')}${without.length > 12 ? ' …' : ''}`);
}

/* ------------------------------------------------------------- self-test */
function selfTest() {
  const pass = crypto.randomBytes(18).toString('base64url');     // throwaway, never stored
  const fixture = { categories: [{ id: 'xh', name: 'XH' }], guides: [{ id: 'shield-select', cat: 'xh', title: 'Xfinity Shield Select', keywords: ['shield'], sections: [{ title: 'Add Shield Select', steps: [{ text: 'x' }] }] }] };
  const env = sealEnvelope(fixture, pass, { iter: 600000 });
  const back = openEnvelope(env, pass).data;
  if (JSON.stringify(back) !== JSON.stringify(fixture)) fail('self-test: round trip mismatch');
  const envA = sealEnvelope(fixture, pass, { iter: 1000, aad: Buffer.from('ccc') });
  if (JSON.stringify(openEnvelope(envA, pass).data) !== JSON.stringify(fixture)) fail('self-test: AAD round trip mismatch');
  let rejected = false; try { openEnvelope(env, pass + 'x'); } catch { rejected = true; }
  if (!rejected) fail('self-test: wrong passcode was accepted');
  /* the real payloads must parse as the same envelope shape */
  for (const L of LOCKED) { const p = JSON.parse(Buffer.from(L.payload(), 'base64').toString()); if (!p.iter || !p.salt || !p.iv || !p.ct) fail(`self-test: ${L.name} envelope shape`); console.log(`  ${L.name}: envelope v=${p.v} iter=${p.iter} aad=${p.aad ? 'yes' : 'none'}`); }
  console.log('ask-index self-test: OK (PBKDF2-SHA256 600k -> AES-256-GCM -> gunzip round trip; AAD honoured; wrong passcode rejected)');
}

/* ------------------------------------------------------------------ main */
if (process.argv.includes('--self-test')) { selfTest(); process.exit(0); }

let prev = null;
try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first build */ }

console.log('ask-index: building data/ask-index.json');
indexRoomsAndTools();
gGuide('bapis', 'bapis');
gGuide('internet-essentials', 'internet-essentials');
esimGuide();
celestial();
porting();
videos();
printouts();
arcade();
smallPages();
mobilePromos();
const lockedSources = lockedGuides(prev);
mergeAsks();

/* never index the freezer, never name its tools */
for (const d of DOCS) if (d.room === 'freezer' || /freezer|walk-in/i.test(d.title + ' ' + d.keywords.join(' ') + ' ' + (d.asks || []).join(' '))) fail(`freezer leak in ${d.id}`);
/* unique ids, stable order */
const seen = new Set(); for (const d of DOCS) { if (seen.has(d.id)) fail(`duplicate id ${d.id}`); seen.add(d.id); }
/* every src on disk */
const missing = MEDIA_CHECK.filter(([, p]) => !exists(p));
if (missing.length) fail(`media not on disk:\n${missing.slice(0, 20).map(([id, p]) => `  ${id}: ${p}`).join('\n')}`);
/* every tool slug real */
for (const d of DOCS) if (d.tool && !TOOLS.has(d.tool)) fail(`${d.id}: unknown tool ${d.tool}`);
/* S2 · THE LOCKED RULE, ASSERTED ON EVERYTHING THAT SHIPS (fresh and carried):
   a doc in a passcode guide is marked locked, carries no text/steps/media, and
   every keyword passes the denylist AND is made only of words from its own
   title and crumbs; every rep phrasing (asks) passes the denylist too. */
{
  const lockedSlugs = new Set(LOCKED.map(L => L.slug));
  for (const d of DOCS) {
    if (lockedSlugs.has(d.tool) && d.id !== `tool/${d.tool}` && !d.locked) fail(`${d.id}: locked guide doc not marked locked`);
    if (!d.locked) continue;
    if (d.text || d.steps || d.media) fail(`${d.id}: locked doc carries text/steps/media`);
    const vocab = lockedVocab(d);
    for (const k of d.keywords) if (!lockedKeywordOk(k, vocab)) fail(`${d.id}: locked keyword "${k}" is not from its own title/crumbs or looks like guide content`);
    for (const a of d.asks || []) if (LOCKED_DENY.test(a)) fail(`${d.id}: locked ask "${a}" trips the locked denylist (digits, @, URLs, codes)`);
  }
}
/* no internal codes anywhere in what ships (article ids, CSG rate codes) */
for (const d of DOCS) {
  const blob = [d.title, d.text, ...(d.crumbs || []), ...(d.keywords || []), ...(d.asks || []), ...(d.steps || []).map(x => x.text),
    ...(d.media || []).flatMap(m => [m.alt, m.caption])].filter(Boolean).join(' \n ');
  const hit = blob.match(ARTICLE_ID) || blob.match(/\bIE (?:HSD Pnd|GSK Pend|Inst Pend|ECON HSD|\$0 (?:Modem|GSK|Failed))\b|\bHS\d{3}\b|\b\d+daygsktrk\b/);
  if (hit) fail(`${d.id}: internal code "${hit[0]}" in the index — scrub it at the source extractor`);
}
/* nothing that reads like an author's placeholder, and no other division */
for (const d of DOCS) {
  if (PLACEHOLDER.test([d.title, d.text, ...(d.steps || []).map(s => s.text)].join(' '))) fail(`${d.id}: placeholder text ("${(d.text.match(PLACEHOLDER) || [''])[0]}") — fill it in or drop it`);
  if (OTHER_DIVISION.test([d.title, ...d.crumbs].join(' '))) fail(`${d.id}: non-Central division content`);
}
if (DROPPED.placeholder.length) note(`dropped ${DROPPED.placeholder.length} placeholder doc(s) — Jeff to fill in: ${DROPPED.placeholder.join('; ')}`);
if (DROPPED.division.length) note(`dropped ${DROPPED.division.length} non-Central division doc(s): ${DROPPED.division.join('; ')}`);

const index = {
  version: 1,
  built_at: new Date().toISOString(),
  /* how the framed guide wants its hash: "#/" + anchor (default) or "#" + anchor */
  frame_hash_prefix: { default: '#/', casino: '#' },
  locked_sources: lockedSources,
  /* retired doc id -> the doc that replaced it (guide makeover, Oct 2026), only where the target exists */
  legacy_ids: Object.fromEntries([...LEGACY].filter(([o, n]) => seen.has(n) && !seen.has(o)).sort(([a], [b]) => a.localeCompare(b))),
  docs: DOCS,
};
const json = JSON.stringify(index);
/* idempotent: keep the previous file byte-for-byte (built_at included) if nothing else changed */
const strip = s => s.replace(/"built_at":"[^"]*"/, '');
if (prev && strip(JSON.stringify(prev)) === strip(json)) console.log('ask-index: no content change — file left as is');
else fs.writeFileSync(OUT, json + '\n');

const size = fs.statSync(OUT).size, gz = zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }).length;
console.log('\nper source:');
for (const [s, k] of Object.entries(COUNTS)) console.log(`  ${s.padEnd(22)} ${Object.entries(k).map(([a, b]) => `${a} ${b}`).join(', ')}`);
const steps = DOCS.reduce((n, d) => n + (d.steps ? d.steps.length : 0), 0), media = DOCS.reduce((n, d) => n + (d.media ? d.media.length : 0), 0);
console.log(`\n${DOCS.length} docs · ${steps} steps · ${media} media · ${MEDIA_CHECK.length} paths verified on disk`);
console.log(`data/ask-index.json ${(size / 1024).toFixed(1)} KB raw · ${(gz / 1024).toFixed(1)} KB gzip · ${Date.now() - t0} ms`);
if (size > 1.5 * 1024 * 1024) console.warn('ask-index: WARNING over the 1.5 MB phone budget — trim text');
