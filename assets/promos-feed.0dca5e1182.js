


export const SHEETS = {
  new_line_sheet: { label: '6th Gen Mobile Quote Sheet', url: 'https://blufoxmobile.github.io/Mobile-Quote-Sheet-6th-Gen/' },
  upgrade_sheet:  { label: 'Upgrade Quote Sheet',        url: 'https://blufoxmobile.github.io/Upgrade-Quote-Sheet/' }
};



export const CACHE_KEY = 'ccc-promos-live-v1';

const CACHE_MS_LIVE = 5 * 60 * 1000;      
const CACHE_MS_DEGRADED = 60 * 1000;      



const SNAPSHOT_PATH = ['..', 'data', 'promos' + '.json'].join('/');




class ReadError extends Error {}



function readLiteral(text, start) {
  let i = start;
  let depth = 0;

  const fail = (msg) => {
    const line = text.slice(0, i).split('\n').length;
    throw new ReadError(msg + ' (line ' + line + ')');
  };

  
  function skip() {
    for (;;) {
      const c = text[i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\v' || c === ' ' || c === '﻿' || c === ' ' || c === ' ') { i++; continue; }
      if (c === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && text[i + 1] === '*') {
        const close = text.indexOf('*/', i + 2);
        if (close < 0) fail('a /* comment is never closed');
        i = close + 2;
        continue;
      }
      return;
    }
  }

  function readString() {
    const q = text[i++];
    let out = '';
    for (;;) {
      if (i >= text.length) fail('a text value is never closed');
      const c = text[i++];
      if (c === q) break;
      if (q === '`' && c === '$' && text[i] === '{') fail('a `template` with ${...} inside cannot be read without running code');
      if ((c === '\n' || c === '\r') && q !== '`') fail('a text value runs onto the next line (missing closing quote?)');
      if (c !== '\\') { out += c; continue; }
      const e = text[i++];
      switch (e) {
        case 'n': out += '\n'; break;
        case 't': out += '\t'; break;
        case 'r': out += '\r'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'v': out += '\v'; break;
        case '0': out += '\0'; break;
        case '\r': if (text[i] === '\n') i++; break;   
        case '\n': case ' ': case ' ': break;
        case 'x': {
          const h = text.slice(i, i + 2);
          if (!/^[0-9a-fA-F]{2}$/.test(h)) fail('bad \\x escape');
          out += String.fromCharCode(parseInt(h, 16)); i += 2; break;
        }
        case 'u': {
          if (text[i] === '{') {
            const close = text.indexOf('}', i);
            const h = close > 0 ? text.slice(i + 1, close) : '';
            if (!/^[0-9a-fA-F]{1,6}$/.test(h)) fail('bad \\u{...} escape');
            out += String.fromCodePoint(parseInt(h, 16)); i = close + 1;
          } else {
            const h = text.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(h)) fail('bad \\u escape');
            out += String.fromCharCode(parseInt(h, 16)); i += 4;
          }
          break;
        }
        default:
          if (e === undefined) fail('text ends inside an escape');
          out += e;                                      
      }
    }
    return out;
  }

  function readStringJoin() {
    
    let s = readString();
    for (;;) {
      const save = i;
      skip();
      if (text[i] !== '+') { i = save; return s; }
      i++; skip();
      const c = text[i];
      if (c !== '"' && c !== "'" && c !== '`') fail('"+" can only join two pieces of text here');
      s += readString();
    }
  }

  function readNumber() {
    const m = /^[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 64));
    if (!m) fail('expected a value');
    i += m[0].length;
    const raw = m[0].replace(/_/g, '');
    const n = /0[xX]/.test(raw) ? (raw[0] === '-' ? -1 : 1) * parseInt(raw.replace(/^[+-]/, ''), 16) : Number(raw);
    if (!isFinite(n)) fail('a number could not be read');
    return n;
  }

  function setKey(obj, key, val) {
    
    
    if (key === '__proto__') Object.defineProperty(obj, key, { value: val, enumerable: true, writable: true, configurable: true });
    else obj[key] = val;
  }

  function readValue() {
    skip();
    const c = text[i];
    if (c === '{') return readObject();
    if (c === '[') return readArray();
    if (c === '"' || c === "'" || c === '`') return readStringJoin();
    if (c === undefined) fail('the text ended where a value was expected');
    const word = /^[A-Za-z_$][\w$]*/.exec(text.slice(i, i + 32));
    if (word) {
      const w = word[0];
      if (w === 'true')  { i += 4; return true; }
      if (w === 'false') { i += 5; return false; }
      if (w === 'null')  { i += 4; return null; }
      if (w === 'undefined') { i += 9; return null; }
      fail('"' + w + '" is code, not a value');
    }
    return readNumber();
  }

  function readObject() {
    if (++depth > 200) fail('nested too deeply');
    i++;                                         
    const obj = {};
    for (;;) {
      skip();
      if (text[i] === '}') { i++; break; }
      let key;
      const c = text[i];
      if (c === '"' || c === "'" || c === '`') key = readString();
      else {
        const m = /^(?:[A-Za-z_$][\w$]*|\d+(?:\.\d+)?)/.exec(text.slice(i, i + 128));
        if (!m) fail('expected a field name');
        key = m[0]; i += key.length;
      }
      skip();
      if (text[i] !== ':') fail('expected ":" after "' + key + '"');
      i++;
      setKey(obj, key, readValue());
      skip();
      if (text[i] === ',') { i++; continue; }  
      if (text[i] === '}') { i++; break; }
      fail('expected "," or "}" after "' + key + '"');
    }
    depth--;
    return obj;
  }

  function readArray() {
    if (++depth > 200) fail('nested too deeply');
    i++;                                         
    const arr = [];
    for (;;) {
      skip();
      if (text[i] === ']') { i++; break; }
      if (text[i] === ',') fail('an empty slot ",," in a list');
      arr.push(readValue());
      skip();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; break; }
      fail('expected "," or "]" in a list');
    }
    depth--;
    return arr;
  }

  const value = readValue();
  return { value, end: i };
}



function findConstant(html, name, check) {
  const re = new RegExp('\\b(?:const|let|var)\\s+' + name + '\\s*=\\s*', 'g');
  let m, lastErr = 'not found';
  while ((m = re.exec(html))) {
    const at = m.index + m[0].length;
    const c = html[at];
    if (c !== '[' && c !== '{') { lastErr = 'is not a list or object'; continue; }
    try {
      const { value } = readLiteral(html, at);
      const bad = check(value);
      if (!bad) return { value };
      lastErr = bad;
    } catch (err) {
      if (!(err instanceof ReadError)) throw err;
      lastErr = err.message;
    }
  }
  return { error: name + ' ' + lastErr };
}




const has = (o, k) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const get = (o, k) => (has(o, k) && o[k] !== undefined ? o[k] : null);




function truthy(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}
const or = (v, d) => (truthy(v) ? v : d);
const asList = (v) => (Array.isArray(v) ? v : (truthy(v) ? [v] : []));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const BRANDS = ['Apple', 'Google', 'Motorola', 'OnePlus', 'Samsung'];
function brandOf(model) {
  const m = String(model).toLowerCase();
  for (const b of BRANDS) if (m.startsWith(b.toLowerCase())) return b;
  if (m.includes('iphone')) return 'Apple';
  if (m.includes('pixel')) return 'Google';
  if (m.includes('galaxy') || m.includes('note')) return 'Samsung';
  if (m.includes('moto') || m.includes('razr')) return 'Motorola';
  return 'Other';
}



const PLAN_LABELS = {
  plus_or_premium_unl: 'Mobile Plus or Premium Unlimited',
  any_mobile_plan: 'Any XM plan — Select included',
  smartwatch_plan_diamond: 'Smartwatch plan, Diamond only',
  mobile_select_or_plus: 'Mobile Select ($0) or Mobile Plus ($15) — first line',
  tablet_plan: 'Unlimited tablet plan, new tablet line',
  tablet_plan_unlimited: 'Unlimited tablet plan',
  any: 'Any XM plan'
};


function pyTitle(s) {
  let out = '', prevLetter = false;
  for (const ch of s) {
    const letter = ch.toLowerCase() !== ch.toUpperCase();
    out += letter ? (prevLetter ? ch.toLowerCase() : ch.toUpperCase()) : ch;
    prevLetter = letter;
  }
  return out;
}
function planLabel(p) {
  const pe = String(or(get(p, 'plan_eligibility'), 'any'));
  return has(PLAN_LABELS, pe) ? PLAN_LABELS[pe] : pyTitle(pe.split('_').join(' '));
}

 
function dollars(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.replace(/[$,\s]/g, '');
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  }
  return null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];


function monthNum(word) {
  const w = String(word).toLowerCase();
  if (w.length < 3) return 0;
  for (let k = 0; k < 12; k++) if (MONTHS[k].indexOf(w) === 0) return k + 1;
  return 0;
}



function isoDate(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T ])/.exec(s);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) {
    mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000;
  } else if ((m = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s))) {
    mo = monthNum(m[1]); d = +m[2]; y = +m[3];
  } else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(s))) {
    d = +m[1]; mo = monthNum(m[2]); y = +m[3];
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}


const cleanDate = (v) => isoDate(v);



function cleanDealCard(v) {
  if (typeof v !== 'string') return v === undefined ? null : v;
  return v.replace(/\s*·\s*[^·]*\.pdf\b[^·]*/gi, '').trim();
}




const CONDITIONS = ['good', 'fair', 'poor'];



function trade6g(tp) {
  const ladder = Object.keys(tp.tier_ladder)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((k) => tp.tier_ladder[k]);
  const byModel = new Map();
  for (const r of tp.trade_ins) {
    if (!byModel.has(r.model)) byModel.set(r.model, { model: r.model, brand: brandOf(r.model), good: null, fair: null, poor: null });
    const cond = String(r.condition).toLowerCase();
    if (CONDITIONS.includes(cond)) byModel.get(r.model)[cond] = dollars(r.value);
  }
  const devices = Array.from(byModel.values());
  return {
    bucket: get(tp, 'promo_tag'),
    ladder,
    max: Math.max.apply(null, ladder),
    floor: lowestValue(devices, get(tp, 'floor_value')),
    list_updated: get(tp, 'list_updated'),
    devices
  };
}



function lowestValue(devices, typed) {
  let low = null;
  for (const d of devices) for (const c of CONDITIONS) {
    if (typeof d[c] === 'number' && (low === null || d[c] < low)) low = d[c];
  }
  return low === null ? (typed === undefined ? null : typed) : low;
}



function tradeUpg(tag, buckets, table) {
  const b = buckets[tag], col = b.col, ladder = b.ladder, devices = [];
  for (const row of table) {
    const s = String(row[col] === undefined || row[col] === null ? '' : row[col]);
    if (!/[1-5]/.test(s)) continue;
    const vals = [0, 1, 2].map((k) => {
      const n = /\d/.test(s[k] || '') ? parseInt(s[k], 10) : 0;
      return n >= 1 && n <= ladder.length ? ladder[n - 1] : null;
    });
    devices.push({ model: row[0], brand: brandOf(row[0]), good: vals[0], fair: vals[1], poor: vals[2] });
  }
  
  
  return { bucket: tag, ladder, max: Math.max.apply(null, ladder), floor: lowestValue(devices, get(b, 'floor')), list_updated: null, devices };
}




const NOTE = {
  rep: /\b(?:Jeff|deal desk|Celestial)\b|\b(?:the|Upgrade) sheet\b|^RE-ISSUED\b|\bconfirmed \d+\/\d+|^Rep note\b/i,
  repCode: /\bDEALS\d+\b|\b[A-Za-z]+(?:_[A-Za-z0-9]+)+\b/,
  card: /\b(?:cards?|Celestial|Jeff|deal desk)\b|\b(?:the|Upgrade) sheet\b/i,
  cardCode: /\bCD\d{3}\b|\bDEALS\d+\b/,
  sheetUi: /\b(?:surface it\b|never assume\b|expired \d+\/\d+)/i,
  caveat: /\b(?:verify|confirm)\b/i
};

const noGiftCard = (x) => String(x == null ? '' : x).replace(/\bgift cards?\b/gi, 'gift');
const isCardNote = (x) => { const t = noGiftCard(x); return NOTE.card.test(t) || NOTE.cardCode.test(t); };
const isRepNote = (x) => NOTE.rep.test(x) || NOTE.repCode.test(x);



function repText(x, guide) {
  let t = String(x == null ? '' : x);
  const byCard = (code) => { const q = guide.find((z) => isObj(z) && z.deal_card === code); return q && q.marketing_name ? '\u201c' + q.marketing_name + '\u201d' : ''; };
  t = t.replace(/\b(check|see|try)\s+(CD\d{3})\b/g, (m, v, code) => { const n = byCard(code); return n ? v + ' ' + n : m; });
  
  t = t.replace(/\s*\(([^()]*)\)/g, (m, inner) => {
    if (/\b(?:Celestial|Jeff|cards?)\b/i.test(noGiftCard(inner))) return '';
    if (!NOTE.cardCode.test(inner)) return m;
    const rest = inner.replace(/\b(?:CD\d{3}|DEALS\d+)\b[,;:]?\s*/g, '').trim();
    return /\$/.test(rest) ? ' (' + rest + ')' : '';
  });
  
  
  
  let cut = false;
  const parts = t.split(/\.\s+(?=[A-Z])/).map((sn) =>
    sn.replace(/\s+—\s+[^—]*$/, (cl) => { if (isCardNote(cl)) { cut = true; return ''; } return cl; }));
  const kept = parts.filter((sn) => sn.trim() && !isCardNote(sn) && !NOTE.sheetUi.test(sn));
  if (kept.length < parts.length) cut = true;
  t = kept.join('. ');
  if (cut && t && !/[.!?:]$/.test(t)) t += '.';
  return t.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (tg) => {
    const q = guide.find((z) => isObj(z) && z.tag === tg);
    return q && typeof q.marketing_name === 'string' ? '\u201c' + q.marketing_name + '\u201d' : tg;
  });
}



function dropCaveats(x) {
  const orig = String(x == null ? '' : x);
  const lead = /^Carried forward from [^:]*:\s*/i;
  const hadLead = lead.test(orig);
  let t = orig.replace(lead, '');
  let parts = t.split(/\.\s+(?=[A-Z])/), before;
  do {
    before = parts.join('. ');
    while (parts.length > 1 && NOTE.caveat.test(parts[parts.length - 1])) parts.pop();
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\s+—\s+(?:verify|confirm)\b[^—]*$/i, '');
  } while (parts.join('. ') !== before);
  t = parts.join('. ').trim();
  if (t !== orig.trim()) {
    if (t && !/[.!?:]$/.test(t)) t += '.';
    if (hadLead) t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t;
}


function repList(arr, guide, isWatchouts) {
  if (!Array.isArray(arr)) return arr;
  return arr
    .map((x) => (typeof x === 'string' ? repText(isWatchouts ? dropCaveats(x) : x, guide) : x))
    .filter((x) => (typeof x === 'string' ? x && !isRepNote(x) : x !== null && x !== undefined));
}
const repOne = (v, guide) => (typeof v === 'string' && v ? repText(v, guide) : v);




function normalize(p, sheets, trade, guide) {
  const s = or(get(p, 'summary'), {});
  const ti = or(get(p, 'trade_in'), {});
  const offer = or(get(p, 'offer'), {});
  const dates = or(get(p, 'dates'), {});
  const lt = get(p, 'line_type');
  return {
    id: p.tag,
    title: p.marketing_name,
    deal_card: cleanDealCard(get(p, 'deal_card')),
    audience: lt === 'upgrade' ? 'upgrade' : (lt === 'new_line' ? 'new_line' : or(lt, 'any')),
    line_type_label: get(p, 'line_type_label'),
    sheets,
    savings: get(offer, 'savings'),
    mechanism: get(offer, 'mechanism'),
    dates: { start: cleanDate(get(dates, 'start')), end: cleanDate(get(dates, 'end')) },
    plan: planLabel(p),
    brands: or(get(p, 'device_brands'), []),
    device_scope: or(get(p, 'device_scope'), ''),
    device_type: or(get(or(get(p, 'display_when'), {}), 'device_type'), 'phone'),
    diamond_only: truthy(get(p, 'diamond_only')),
    trade_in_required: truthy(get(ti, 'required')),
    port_required: truthy(get(or(get(p, 'port'), {}), 'required')),
    mobile_service: or(get(p, 'mobile_service'), []),
    badges: or(get(p, 'badges'), []),
    hook: has(s, 'hook') ? repOne(s.hook, guide) : '',
    qualify: has(s, 'qualify') ? repList(s.qualify, guide, false) : [],
    steps: has(s, 'steps') ? repList(s.steps, guide, false) : [],
    deadlines: has(s, 'deadlines') ? repList(s.deadlines, guide, false) : [],
    watchouts: has(s, 'watchouts') ? repList(s.watchouts, guide, true) : [],
    credit_amount: has(s, 'credit_amount') ? repOne(s.credit_amount, guide) : '',
    trade_in: trade
  };
}






const CHECK = {
  PROMO_GUIDE(v) {
    if (!Array.isArray(v)) return 'is not a list';
    if (!v.length) return 'is an empty list';
    if (!v.some((p) => isObj(p) && typeof p.tag === 'string')) return 'has no promos with a "tag"';
    return '';
  },
  TIPS_PROMOS(v) {
    if (!isObj(v)) return 'is not an object';
    for (const k of Object.keys(v)) {
      const b = v[k];
      if (!isObj(b) || !isObj(b.tier_ladder) || !Array.isArray(b.trade_ins)) return 'bucket "' + k + '" is missing tier_ladder or trade_ins';
      if (!Object.keys(b.tier_ladder).length || Object.values(b.tier_ladder).some((x) => typeof x !== 'number')) return 'bucket "' + k + '" has a bad tier_ladder';
      if (b.trade_ins.some((r) => !isObj(r) || typeof r.model !== 'string')) return 'bucket "' + k + '" has a trade-in row without a model';
    }
    return '';
  },
  UPG_TIPS_BUCKETS(v) {
    if (!isObj(v)) return 'is not an object';
    for (const k of Object.keys(v)) {
      const b = v[k];
      if (!isObj(b) || typeof b.col !== 'number' || !Array.isArray(b.ladder) || !b.ladder.length || b.ladder.some((x) => typeof x !== 'number')) return 'bucket "' + k + '" is missing col or ladder';
    }
    return '';
  },
  UPG_TIPS_TABLE(v) {
    if (!Array.isArray(v) || !v.length) return 'is empty or not a list';
    if (v.some((r) => !Array.isArray(r) || typeof r[0] !== 'string')) return 'has a row that is not [device, ...]';
    return '';
  }
};





const NEEDS = {
  new_line_sheet: ['PROMO_GUIDE', 'TIPS_PROMOS'],
  upgrade_sheet:  ['PROMO_GUIDE', 'UPG_TIPS_BUCKETS', 'UPG_TIPS_TABLE']
};

function readSheet(key, html) {
  if (typeof html !== 'string' || html.length < 20) {
    return { ok: false, error: SHEETS[key].label + ': nothing to read' };
  }
  const got = {};
  for (const name of NEEDS[key]) {
    const r = findConstant(html, name, CHECK[name]);
    if (r.error) return { ok: false, error: SHEETS[key].label + ': ' + r.error };
    got[name] = r.value;
  }
  return { ok: true, data: got };
}

const SHEET_OF = { mobile_6th_gen: 'new_line_sheet', upgrade: 'upgrade_sheet' };



export function parseSheetsAll(newLineHtml, upgradeHtml) {
  const warnings = [];
  const failed = [];
  const read = {
    new_line_sheet: readSheet('new_line_sheet', newLineHtml),
    upgrade_sheet: readSheet('upgrade_sheet', upgradeHtml)
  };
  for (const k of Object.keys(read)) {
    if (!read[k].ok) { failed.push(k); warnings.push(read[k].error); }
  }
  const a = read.new_line_sheet.ok ? read.new_line_sheet.data : {};
  const u = read.upgrade_sheet.ok ? read.upgrade_sheet.data : {};
  const ta = a.TIPS_PROMOS || {};
  const ub = u.UPG_TIPS_BUCKETS || {};
  const ut = u.UPG_TIPS_TABLE || [];

  const out = new Map();                       
  const lists = [['new_line_sheet', a.PROMO_GUIDE || []], ['upgrade_sheet', u.PROMO_GUIDE || []]];
  for (const [src, plist] of lists) {
    plist.forEach((p, n) => {
      if (!isObj(p) || typeof p.tag !== 'string' || !p.tag) {
        warnings.push(SHEETS[src].label + ': promo #' + (n + 1) + ' has no "tag" and was skipped');
        return;
      }
      try {
        const home = get(p, 'sheet');
        const sheets = Array.from(new Set([home].concat(asList(get(p, 'additional_sheets')))
          .filter((x) => has(SHEET_OF, x)).map((x) => SHEET_OF[x]))).sort();
        
        
        const homeSrc = has(SHEET_OF, home) ? SHEET_OF[home] : null;
        const prev = out.get(p.tag);
        if (prev && homeSrc !== src) {
          prev.sheets = Array.from(new Set(prev.sheets.concat(sheets))).sort();
          return;
        }
        
        
        
        
        
        if (homeSrc && homeSrc !== src && failed.indexOf(homeSrc) >= 0) return;
        if (typeof p.marketing_name !== 'string') throw new Error('has no marketing_name');
        const bucket = get(or(get(p, 'trade_in'), {}), 'bucket');
        let trade = null;
        if (truthy(bucket) && has(ta, bucket)) trade = trade6g(ta[bucket]);
        else if (truthy(bucket) && has(ub, bucket)) trade = tradeUpg(bucket, ub, ut);
        else if (truthy(bucket) && truthy(get(get(p, 'trade_in'), 'required'))) {
          warnings.push(p.tag + ': trade-in list "' + bucket + '" was not found on either sheet');
        }
        const promo = normalize(p, sheets, trade, (src === 'new_line_sheet' ? a : u).PROMO_GUIDE || []);
        
        const rawDates = or(get(p, 'dates'), {});
        for (const side of ['start', 'end']) {
          const raw = get(rawDates, side);
          if (raw !== null && raw !== '' && promo.dates[side] === null) {
            warnings.push(SHEETS[src].label + ': promo "' + p.tag + '" has a ' + side + ' date the guide cannot read (' +
              JSON.stringify(raw) + '), so it is treated as having no ' + side + ' date' +
              (side === 'end' ? ' and will not expire by itself' : '') + '. Write it like 2026-11-10.');
          }
        }
        
        if (trade) {
          const typedFloor = has(ta, bucket) ? get(ta[bucket], 'floor_value') : get(ub[bucket], 'floor');
          const typedMax = has(ta, bucket) ? null : get(ub[bucket], 'max');
          if (typeof typedFloor === 'number' && typedFloor !== trade.floor) {
            warnings.push(p.tag + ': the sheet says the lowest trade-in value is $' + typedFloor + ', but the lowest on its list is $' + trade.floor + ' (the list is used).');
          }
          if (typeof typedMax === 'number' && typedMax !== trade.max) {
            warnings.push(p.tag + ': the sheet says the top trade-in value is $' + typedMax + ', but its ladder tops out at $' + trade.max + ' (the ladder is used).');
          }
        }
        if (prev) promo.sheets = Array.from(new Set(prev.sheets.concat(sheets))).sort();
        out.set(p.tag, promo);               
      } catch (err) {
        warnings.push(SHEETS[src].label + ': promo "' + p.tag + '" was skipped — ' + (err && err.message));
      }
    });
  }
  return { promos: Array.from(out.values()), warnings, failed };
}



export function parseSheets(newLineHtml, upgradeHtml, today) {
  const day = today || chicagoToday();
  const r = parseSheetsAll(newLineHtml, upgradeHtml);
  return { promos: r.promos.filter((p) => isActive(p, day)), warnings: r.warnings, failed: r.failed };
}






export function chicagoToday(now) {
  const when = now instanceof Date ? now : new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(when);
    const v = {};
    for (const p of parts) v[p.type] = p.value;
    if (v.year && v.month && v.day) return v.year + '-' + v.month + '-' + v.day;
  } catch (e) {   }
  return when.getFullYear() + '-' + String(when.getMonth() + 1).padStart(2, '0') + '-' + String(when.getDate()).padStart(2, '0');
}



export function isActive(promo, today) {
  const day = isoDate(today || '') || chicagoToday();
  const d = (promo && promo.dates) || {};
  const start = isoDate(d.start || ''), end = isoDate(d.end || '');
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}



export function notExpired(promo, today) {
  const day = isoDate(today || '') || chicagoToday();
  const end = isoDate(((promo && promo.dates) || {}).end || '');
  return !end || day <= end;
}




 
export function deviceSlug(model) {
  let s = String(model == null ? '' : model);
  try { s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (e) {   }
  return s.toLowerCase().replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}



export function tradeValue(promo, model, condition) {
  const t = promo && promo.trade_in;
  if (!t || !Array.isArray(t.devices) || model == null) return null;
  const want = deviceSlug(model);
  const dev = t.devices.find((d) => d.model === model) || t.devices.find((d) => deviceSlug(d.model) === want);
  if (!dev) return null;
  if (condition == null || condition === '') {
    const vals = CONDITIONS.map((c) => dev[c]).filter((v) => typeof v === 'number');
    return vals.length ? Math.max.apply(null, vals) : null;
  }
  const c = String(condition).trim().toLowerCase();
  const key = c === 'g' ? 'good' : c === 'f' ? 'fair' : c === 'p' ? 'poor' : c;
  if (!CONDITIONS.includes(key)) return null;
  return typeof dev[key] === 'number' ? dev[key] : null;
}



export function tradeDevices(promos) {
  const bySlug = new Map();
  for (const p of promos || []) {
    if (!p || !p.trade_in || !Array.isArray(p.trade_in.devices)) continue;
    for (const d of p.trade_in.devices) {
      const slug = deviceSlug(d.model);
      if (!bySlug.has(slug)) bySlug.set(slug, { slug, model: d.model, brand: d.brand, offers: [] });
      bySlug.get(slug).offers.push({
        promo_id: p.id, title: p.title, deal_card: p.deal_card, audience: p.audience,
        good: d.good, fair: d.fair, poor: d.poor
      });
    }
  }
  return Array.from(bySlug.values()).sort((x, y) =>
    x.brand === y.brand ? x.model.localeCompare(y.model, 'en', { numeric: true }) : x.brand.localeCompare(y.brand));
}




function withTimeout(fetchImpl, url, init, timeoutMs, what) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = 0;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { if (ctrl) ctrl.abort(); } catch (e) {   }
      reject(new Error(what + ' took longer than ' + Math.round(timeoutMs / 1000) + 's'));
    }, timeoutMs);
  });
  const opts = Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {});
  const run = (async () => {
    let res;
    try { res = await fetchImpl(url, opts); }
    catch (err) {
      
      
      if (err instanceof TypeError && /cache/i.test(String(err.message)) && 'cache' in opts) {
        const o2 = Object.assign({}, opts); delete o2.cache;
        res = await fetchImpl(url, o2);
      } else throw err;
    }
    if (!res || !res.ok) throw new Error(what + ' answered ' + (res ? res.status : 'nothing'));
    return await res.text();
  })();
  return Promise.race([run, timedOut]).finally(() => clearTimeout(timer));
}

function bust(url) {
  
  
  return url + (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now().toString(36);
}

function defaultSnapshotUrl() {
  try { return new URL(SNAPSHOT_PATH, import.meta.url).href; }
  catch (e) { return '/' + SNAPSHOT_PATH.replace(/^\.\.\//, ''); }
}

async function readSnapshot(fetchImpl, url, timeoutMs) {
  
  
  
  const text = await withTimeout(fetchImpl, url, { cache: 'no-cache', credentials: 'same-origin' }, timeoutMs, 'the saved copy');
  const j = JSON.parse(text);
  if (!j || !Array.isArray(j.promos)) throw new Error('the saved copy has no promos list');
  return j;
}






const MEM = '__cccPromosCache';
function memGet() { try { return globalThis[MEM] || null; } catch (e) { return null; } }
function memSet(v) { try { globalThis[MEM] = v; } catch (e) {   } }
function store() { try { return globalThis.sessionStorage || null; } catch (e) { return null; } }

function cacheRead() {
  const now = Date.now();
  const fresh = (c) => c && c.v === 1 && typeof c.at === 'number' && now - c.at >= 0 && now - c.at < c.ttl && c.data && Array.isArray(c.data.promos);
  const m = memGet();
  if (fresh(m)) return m.data;
  const s = store();
  if (!s) return null;
  try {
    const c = JSON.parse(s.getItem(CACHE_KEY) || 'null');
    if (fresh(c)) { memSet(c); return c.data; }
  } catch (e) {   }
  return null;
}
function cacheWrite(data, ttl) {
  const c = { v: 1, at: Date.now(), ttl, data };
  memSet(c);
  const s = store();
  if (!s) return;
  try { s.setItem(CACHE_KEY, JSON.stringify(c)); }
  catch (e) { try { s.removeItem(CACHE_KEY); } catch (e2) {   } }
}

function finish(base, today) {
  return {
    version: 1,
    promos: base.promos.filter((p) => isActive(p, today)),
    source: base.source,
    sheets_from: base.sheets_from,
    fetched_at: base.fetched_at,
    generated_at: base.generated_at || undefined,
    warnings: base.warnings.slice()
  };
}



export async function loadPromos(opts) {
  const o = opts || {};
  const live = o.live !== false;
  const timeoutMs = o.timeoutMs > 0 ? o.timeoutMs : 20000;
  const today = isoDate(o.today || '') || chicagoToday();
  const fetchImpl = o.fetchImpl || ((u, i) => fetch(u, i));
  const snapshotUrl = o.snapshotUrl || defaultSnapshotUrl();

  
  
  const useCache = !o.fetchImpl;
  if (live && !o.fresh && useCache) {
    const hit = cacheRead();
    if (hit) return finish(hit, today);
  }

  const warnings = [];
  let snap = null, snapErr = '';
  const getSnap = async () => {
    if (snap || snapErr) return snap;
    try { snap = await readSnapshot(fetchImpl, snapshotUrl, timeoutMs); }
    catch (err) { snapErr = 'The saved copy could not be read either: ' + (err && err.message); }
    return snap;
  };
  const fromSnapshot = (why) => {
    if (why) warnings.push(why);
    if (!snap) {
      if (snapErr) warnings.push(snapErr);
      return { promos: [], source: 'snapshot', sheets_from: { new_line_sheet: 'missing', upgrade_sheet: 'missing' }, fetched_at: new Date().toISOString(), warnings };
    }
    return { promos: snap.promos, source: 'snapshot', sheets_from: { new_line_sheet: 'snapshot', upgrade_sheet: 'snapshot' }, fetched_at: new Date().toISOString(), generated_at: snap.generated_at, warnings };
  };

  if (!live) {
    await getSnap();
    return finish(fromSnapshot(''), today);
  }

  
  const keys = ['new_line_sheet', 'upgrade_sheet'];
  const texts = await Promise.all(keys.map((k) =>
    withTimeout(fetchImpl, bust(SHEETS[k].url), { cache: 'no-store', credentials: 'omit', mode: 'cors' }, timeoutMs, SHEETS[k].label)
      .catch((err) => { warnings.push(SHEETS[k].label + ' could not be downloaded: ' + (err && err.message)); return null; })));

  let parsed;
  try { parsed = parseSheetsAll(texts[0], texts[1]); }
  catch (err) { parsed = { promos: [], warnings: ['The sheets could not be read: ' + (err && err.message)], failed: keys.slice() }; }
  for (const w of parsed.warnings) if (warnings.indexOf(w) < 0) warnings.push(w);

  const sheetsFrom = { new_line_sheet: 'live', upgrade_sheet: 'live' };
  let promos = parsed.promos;
  let source = 'live';

  if (parsed.failed.length === keys.length) {
    await getSnap();
    const result = fromSnapshot('Neither quote sheet could be read just now, so this is the saved copy.');
    if (useCache) cacheWrite(result, CACHE_MS_DEGRADED);
    return finish(result, today);
  }

  if (parsed.failed.length) {
    
    
    await getSnap();
    const bad = parsed.failed[0];
    sheetsFrom[bad] = snap ? 'snapshot' : 'missing';
    warnings.push('Promos from the ' + SHEETS[bad].label + (snap ? ' are from the saved copy until it reads again.' : ' are missing until it reads again.'));
    if (snapErr) warnings.push(snapErr);
    if (snap) {
      const liveIds = new Set(promos.map((p) => p.id));
      const onBad = (p) => p && Array.isArray(p.sheets) && p.sheets.indexOf(bad) >= 0;
      
      
      
      const borrowed = snap.promos.filter((p) => onBad(p) && !liveIds.has(p.id));
      
      const snapById = new Map(snap.promos.filter(onBad).map((p) => [p.id, p]));
      promos = promos.map((p) => (snapById.has(p.id) && p.sheets.indexOf(bad) < 0
        ? Object.assign({}, p, { sheets: p.sheets.concat([bad]).sort() }) : p));
      promos = bad === 'new_line_sheet' ? borrowed.concat(promos) : promos.concat(borrowed);
    }
  }

  
  
  if (!promos.some((p) => isActive(p, today))) {
    await getSnap();
    if (snap && snap.promos.some((p) => isActive(p, today))) {
      const result = fromSnapshot('The quote sheets read, but showed no current promos while the saved copy has some — showing the saved copy.');
      if (useCache) cacheWrite(result, CACHE_MS_DEGRADED);
      return finish(result, today);
    }
  }

  const result = { promos, source, sheets_from: sheetsFrom, fetched_at: new Date().toISOString(), warnings };
  
  if (parsed.failed.length && snap) result.generated_at = snap.generated_at;
  if (useCache) cacheWrite(result, parsed.failed.length || warnings.length ? CACHE_MS_DEGRADED : CACHE_MS_LIVE);
  return finish(result, today);
}
