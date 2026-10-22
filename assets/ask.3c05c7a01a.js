


import { el } from './dom.d7b1df3700.js';

 



let LOW_CONFIDENCE = 0.55;


let HIGH_CONFIDENCE = 0.85;

const RECENT_KEY = 'ccc-ask-recent';
const RECENT_MAX = 5;
const TURNS_MAX = 6;               
const WORKER_TIMEOUT_MS = 8000;
const W = { q: 300, candidates: 12, id: 120, title: 140, crumbs: 6, crumb: 60, text: 700, bytes: 24 * 1024 };
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_\-\/~.:#]*$/;
const HLS_LIB = 'tools/site-tour/hls.light.min.js';
const INDEX_URL = 'data/ask-index.ee5f35fc18.json';
const CSS_URL = 'assets/ask.fbb67fc8e1.css';



let cssP = null;
export function loadStyles() {
  if (cssP) return cssP;
  cssP = new Promise((res) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = CSS_URL;
    l.onload = () => res(true);
    l.onerror = () => res(false);
    document.head.append(l);
    setTimeout(() => res(false), 2500);
  });
  return cssP;
}

 
const EXAMPLES = [
  'pack a BAPIS order for pickup',
  'how do I add Shield in CSG?',
  'the eSIM won’t download',
  'port a number from T-Mobile',
  'where’s the channel lineup to print?',
  'sign a customer up for Internet Essentials'
];

const SVG_NS = 'http://www.w3.org/2000/svg';

 
const BELL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M4 17.5h16"/><path d="M5.5 17.5a6.5 6.5 0 0 1 13 0"/>' +
  '<path d="M12 11V9.4"/><path d="M10.4 9.2h3.2"/><path d="M3 20h18"/></svg>';
const LOCK =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
const CLOSE =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15"/></svg>';
const SEND =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5"/></svg>';
const PLAY =
  '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7 4.5v11l9-5.5z" fill="currentColor"/></svg>';
const CHEV_L =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>';
const CHEV_R =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7.5 4.5 13 10l-5.5 5.5"/></svg>';

function svg(markup, cls) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const node = t.content.firstChild;
  if (cls) node.setAttribute('class', cls);
  return node;
}

 

function motionOff() {
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch {   }
  return document.documentElement.dataset.motion === 'off';
}

function finePointer() {
  try { return matchMedia('(pointer: fine)').matches; } catch { return true; }
}



function isTouch() {
  try { return (navigator.maxTouchPoints || 0) > 0 || matchMedia('(any-pointer: coarse)').matches; }
  catch { return false; }
}



function siteUrl(src) {
  try {
    const u = new URL(String(src || ''), location.href);
    return u.origin === location.origin && (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
  } catch { return ''; }
}



const ANCHOR_RE = /^[A-Za-z0-9~_.:\/-]{1,160}$/;
const cleanAnchor = (a) => (typeof a === 'string' && ANCHOR_RE.test(a) ? a : '');



function redact(q) {
  return String(q || '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '####')                       
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '####')  
    .replace(/\d(?:[\d\s().-]{2,}\d)?/g, (m) => (m.replace(/\D/g, '').length >= 4 ? '####' : m));
}
const wasRedacted = (q) => redact(q) !== String(q || '');
 
const mostlyMasked = (r) => r.replace(/####|\[email\]/g, '').replace(/[^A-Za-z]/g, '').length < 6;

function focusSafely(node) {
  if (!node || !node.isConnected || typeof node.focus !== 'function') return false;
  try { node.focus({ preventScroll: true }); } catch { node.focus(); }
  return document.activeElement === node;
}

function isShown(n) {
  if (!n || !n.isConnected) return false;
  if (n.closest && n.closest('[hidden], [inert]')) return false;
  const r = n.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}



function readRecent() {
  try {
    const v = JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function rememberRecent(q) {
  const t = String(q || '').trim().slice(0, W.q);
  if (!t || wasRedacted(t)) return;
  const list = readRecent().filter((s) => s.toLowerCase() !== t.toLowerCase());
  list.unshift(t);
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); }
  catch {   }
}
function clearRecent() {
  try { sessionStorage.removeItem(RECENT_KEY); } catch {   }
  
  try { localStorage.removeItem(RECENT_KEY); } catch {   }
}
try { localStorage.removeItem(RECENT_KEY); } catch {   }



function workerEndpoint() {
  const m = document.querySelector('meta[name="ask-chef-endpoint"]');
  const raw = m && (m.getAttribute('content') || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const local = u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    if (u.protocol !== 'https:' && !local) return '';
    return u.href.replace(/\/+$/, '');
  } catch { return ''; }
}

 



function toolDocs(tools, rooms) {
  const roomLabel = new Map((rooms || []).map((r) => [r.id, r.label || r.id]));
  return (tools || [])
    .filter((t) => t && t.slug && t.label && t.room !== 'freezer')
    .map((t) => ({
      id: `tool/${t.slug}`.replace(/[^A-Za-z0-9_\-\/~.:#]/g, '-'),
      kind: 'tool', title: t.label,
      crumbs: [roomLabel.get(t.room) || t.room, t.label],
      tool: t.slug, room: t.room, anchor: '', locked: false,
      text: t.blurb || '', keywords: Array.isArray(t.aliases) ? t.aliases : []
    }));
}

 

let MOUNTED = null;



export function mountAsk(opts = {}) {
  if (MOUNTED) return MOUNTED;
  const { data, view = 'cinema', heroSlot = null, isLocked = () => false, goToRoom = null } = opts;
  const pocket = view === 'pocket';
  document.documentElement.classList.add(pocket ? 'ask-pocket' : 'ask-cinema');

   
  let brainP = null;
  let brain = null;
  function loadBrain() {
    if (brainP) return brainP;
    const engineP =
      import('./ask-engine.b2cb599405.js');
    const indexP = fetch(INDEX_URL, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    brainP = Promise.all([engineP, indexP]).then(([mod, index]) => {
      if (typeof mod.LOW_CONFIDENCE === 'number') LOW_CONFIDENCE = mod.LOW_CONFIDENCE;
      if (typeof mod.HIGH_CONFIDENCE === 'number') HIGH_CONFIDENCE = mod.HIGH_CONFIDENCE;
      const tools = (data && data.tools) || [];
      const rooms = (data && data.rooms) || [];
      const docs = index && Array.isArray(index.docs) && index.docs.length ? index : { docs: toolDocs(tools, rooms) };
      const fromIndex = docs !== null && docs === index;
      brain = { ask: mod.createAsk({ index: docs, tools, rooms }), docs: docs.docs, full: fromIndex };
      
      
      if (fromIndex && index.frame_hash_prefix && typeof index.frame_hash_prefix === 'object') {
        try { document.dispatchEvent(new CustomEvent('ccc:frame-hash-prefix', { detail: index.frame_hash_prefix })); }
        catch {   }
      }
      return brain;
    }).catch((err) => {
      console.error('[ask] the engine did not load.', err);
      brainP = null;                       
      throw err;
    });
    return brainP;
  }

  const toolBySlug = () => new Map(((data && data.tools) || []).map((t) => [t.slug, t]));

   
  const root = el('div', { id: 'ask-root', hidden: true });
  const scrim = el('div', { class: 'ask-scrim', 'aria-hidden': 'true' });

  const titleId = 'ask-title';
  const head = el('div', { class: 'ask-head' });
  const headBell = svg(BELL, 'ask-head-bell');
  const title = el('h2', { class: 'ask-head-title', id: titleId, text: 'Ask the Chef' });
  const newBtn = el('button', { type: 'button', class: 'ask-head-btn', text: 'Clear' });
  newBtn.setAttribute('aria-label', 'Clear the conversation');
  const closeBtn = el('button', { type: 'button', class: 'ask-head-btn ask-close', 'aria-label': 'Close Ask the Chef' });
  closeBtn.append(svg(CLOSE, 'ask-ico'));
  head.append(headBell, title, newBtn, closeBtn);

  const log = el('div', { class: 'ask-log', tabindex: '-1', 'aria-label': 'Answers' });
  const welcome = el('div', { class: 'ask-welcome' });
  log.append(welcome);

  const form = el('form', { class: 'ask-form', role: 'search', 'aria-label': 'Ask the Chef' });
  const input = el('input', {
    id: 'ask-input', class: 'ask-input', type: 'text', name: 'q',
    maxlength: String(W.q), autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
    spellcheck: 'false', enterkeyhint: 'send', inputmode: 'search',
    'aria-label': 'Ask the Chef a question', placeholder: 'Ask anything on the site'
  });
  const send = el('button', { type: 'submit', class: 'ask-send', 'aria-label': 'Ask' });
  send.append(svg(SEND, 'ask-ico'));
  form.append(input, send);

  const status = el('div', { class: 'ask-sr', role: 'status', 'aria-live': 'polite' });

  const panel = el('div', {
    class: 'ask-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId
  }, [head, log, form, status]);

   
  const lbImg = el('img', { class: 'ask-lb-img', alt: '' });
  const lbCap = el('p', { class: 'ask-lb-cap', id: 'ask-lb-cap' });
  const lbClose = el('button', { type: 'button', class: 'ask-lb-btn ask-lb-close', 'aria-label': 'Close picture' });
  lbClose.append(svg(CLOSE, 'ask-ico'));
  const lbPrev = el('button', { type: 'button', class: 'ask-lb-btn ask-lb-prev', 'aria-label': 'Previous picture' });
  lbPrev.append(svg(CHEV_L, 'ask-ico'));
  const lbNext = el('button', { type: 'button', class: 'ask-lb-btn ask-lb-next', 'aria-label': 'Next picture' });
  lbNext.append(svg(CHEV_R, 'ask-ico'));
  const lightbox = el('div', {
    class: 'ask-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Screenshot', 'aria-describedby': 'ask-lb-cap', hidden: true
  }, [el('figure', { class: 'ask-lb-fig' }, [lbImg, lbCap]), lbPrev, lbNext, lbClose]);

  root.append(scrim, panel, lightbox);
  document.body.append(root);

   
  const fab = el('button', {
    type: 'button', id: 'ask-fab', class: 'ask-fab',
    'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'ask-root',
    'aria-label': 'Ask the Chef'
  });
  fab.append(svg(BELL, 'ask-fab-bell'), el('span', { class: 'ask-fab-label', text: 'Ask the Chef' }));
  

  let dock = null;
  if (pocket) {
    dock = el('div', { class: 'ask-dock' }, [fab]);
    document.body.append(dock);
  } else {
    document.body.append(fab);
  }

   
  let heroInput = null;
  let heroForm = null;
  if (heroSlot) {
    heroInput = el('input', {
      id: 'ask-hero-input', class: 'ask-hero-input', type: 'text', name: 'q',
      maxlength: String(W.q), autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
      spellcheck: 'false', enterkeyhint: 'send', inputmode: 'search',
      'aria-describedby': 'ask-hero-hint'
    });
    const label = el('label', { class: 'ask-sr', for: 'ask-hero-input', text: 'Ask the Chef a question' });
    const hint = el('span', { class: 'ask-hero-hint', id: 'ask-hero-hint', 'aria-hidden': 'true' });
    const hintText = el('span', { class: 'ask-hero-hint-text' });
    hint.append(el('span', { text: 'Ask anything — ' }), hintText);
    const go = el('button', { type: 'submit', class: 'ask-hero-go' }, [
      el('span', { text: 'Ask the Chef' })
    ]);
    heroForm = el('form', { class: 'ask-hero', role: 'search', 'aria-label': 'Ask the Chef' }, [
      svg(BELL, 'ask-hero-bell'), label, el('div', { class: 'ask-hero-field' }, [heroInput, hint]), go
    ]);
    heroSlot.append(heroForm);

    
    
    
    let ex = 0;
    const setHint = () => { hintText.textContent = `‘${EXAMPLES[ex]}’`; };
    setHint();
    const syncHint = () => hint.classList.toggle('is-gone', !!heroInput.value);
    heroInput.addEventListener('input', syncHint);
    let rot = 0;
    const rotate = () => {
      if (motionOff() || heroInput.value || document.hidden || !heroVisible) return;
      hint.classList.add('is-swap');
      setTimeout(() => {
        ex = (ex + 1) % EXAMPLES.length;
        setHint();
        hint.classList.remove('is-swap');
      }, 220);
    };
    rot = setInterval(rotate, 4200);
    void rot;

    heroInput.addEventListener('focus', () => { loadBrain().catch(() => {}); });
    heroForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const q = heroInput.value.trim();
      
      open({ opener: heroInput, q });
      heroInput.value = '';
      syncHint();
    });
  }

  

  let heroVisible = !!heroSlot;
  let viewing = false;
  let isOpenNow = false;

  function syncFab() {
    const hide = viewing || isOpenNow || (heroSlot && heroVisible);
    fab.classList.toggle('is-hidden', !!hide);
    if (hide) fab.setAttribute('tabindex', '-1'); else fab.removeAttribute('tabindex');
    fab.setAttribute('aria-hidden', hide ? 'true' : 'false');
    if (dock) dock.classList.toggle('is-hidden', !!hide);
    if (!hide) scheduleDodge();
  }
  syncFab();

  if (heroSlot) {
    document.addEventListener('ccc:room-owned', (ev) => {
      const id = ev && ev.detail && ev.detail.id;
      heroVisible = id === 'hero';
      syncFab();
    });
    
    try {
      new IntersectionObserver((ents) => {
        for (const e of ents) {
          if (!e.isIntersecting) { heroVisible = false; syncFab(); }
          else if (window.scrollY < 40) { heroVisible = true; syncFab(); }
        }
      }, { threshold: 0 }).observe(heroSlot);
    } catch {   }
  }

  document.addEventListener('ccc:viewer-open', () => {
    viewing = true;
    syncFab();
    if (isOpenNow) close({ instant: true, restore: false });
  });
  document.addEventListener('ccc:viewer-close', () => {
    viewing = false;
    syncFab();
    
    
    const back = pendingReturn;
    pendingReturn = null;
    if (!back) return;
    const deadline = Date.now() + 2000;
    const settle = () => {
      const h = document.documentElement.classList;
      if ((h.contains('is-viewing') || h.contains('ccc-locked')) && Date.now() < deadline) { setTimeout(settle, 60); return; }
      const a = document.activeElement;
      
      
      
      
      const lost = !a || a === document.body || a === document.documentElement || a.id === 'c3-button' ||
        (a.classList && a.classList.contains('skip-link')) || root.contains(a);
      const target = isShown(back) ? back : (isShown(fab) ? fab : null);
      if (lost && target) focusSafely(target);
    };
    setTimeout(settle, 0);
  });

  

  let dodgeTimer = 0;
  function scheduleDodge() {
    if (pocket) return;
    clearTimeout(dodgeTimer);
    dodgeTimer = setTimeout(dodge, 140);
  }
  function dodge() {
    if (fab.classList.contains('is-hidden')) return;
    fab.style.setProperty('--ask-lift', '0px');
    const home = fab.getBoundingClientRect();
    if (!home.width) return;
    const scope = document.querySelector('#kitchen .room.is-owned') || document.getElementById('kitchen');
    const nodes = scope ? Array.from(scope.querySelectorAll('a, button, [data-tool], .hotspot, .cw-card, [tabindex="0"]')) : [];
    const ret = document.querySelector('.pocket-return');
    if (ret) nodes.push(ret);
    const rects = [];
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
      if (r.right < home.left - 8 || r.left > home.right + 8) continue;
      if (getComputedStyle(n).visibility === 'hidden') continue;
      rects.push(r);
    }
    let top = home.top;
    let bottom = home.bottom;
    for (let pass = 0; pass < 6; pass++) {
      const hit = rects.filter((r) => r.top < bottom + 8 && r.bottom > top - 8);
      if (!hit.length) break;
      const above = Math.min(...hit.map((r) => r.top)) - 12;
      const h = bottom - top;
      bottom = above;
      top = above - h;
    }
    const lift = Math.max(0, Math.round(home.bottom - bottom));
    
    
    
    
    fab.style.setProperty('--ask-lift', `${lift <= 160 ? lift : 0}px`);
  }
  if (!pocket) {
    document.addEventListener('ccc:room-owned', scheduleDodge);
    window.addEventListener('resize', scheduleDodge, { passive: true });
    window.addEventListener('scroll', scheduleDodge, { passive: true });
  }

  

  if (/^#\/tool\/[^/]+\/./.test(location.hash || '')) loadBrain().catch(() => {});

   
  const warm = () => { loadBrain().catch(() => {}); };
  fab.addEventListener('pointerenter', warm, { once: true });
  fab.addEventListener('pointerdown', warm, { once: true });
  fab.addEventListener('focus', warm, { once: true });
  fab.addEventListener('click', () => (isOpenNow ? close({ restore: true }) : open({ opener: fab })));

   
  let opener = null;
  let pendingReturn = null;
  let closeTimer = 0;
  const turns = [];               
  let inflight = null;            
  let workerOff = false;          
  let turnSeq = 0;

   
  let io = null;
  function lazyImg(node) {
    if (!io) {
      try {
        io = new IntersectionObserver((ents) => {
          for (const e of ents) {
            if (!e.isIntersecting) continue;
            const img = e.target;
            io.unobserve(img);
            if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
          }
        }, { root: log, rootMargin: '300px 0px' });
      } catch { io = null; }
    }
    if (io) io.observe(node);
    else if (node.dataset.src) { node.src = node.dataset.src; delete node.dataset.src; }
  }

   
  function renderWelcome() {
    const recent = readRecent();
    const chips = (list) => el('div', { class: 'ask-chips' },
      list.map((q) => el('button', { type: 'button', class: 'ask-chip', 'data-ask-q': q, 'data-ask-nav': '', text: q })));
    welcome.replaceChildren(
      el('p', { class: 'ask-welcome-line', text: 'Ask how to do something and I’ll bring you the exact steps, screens and videos from the site.' }),
      el('p', { class: 'ask-welcome-note', text: 'Don’t type customer names or account numbers.' }),
      recent.length ? el('p', { class: 'ask-welcome-head', text: 'You asked' }) : null,
      recent.length ? chips(recent) : null,
      el('p', { class: 'ask-welcome-head', text: 'Try' }),
      chips(EXAMPLES.slice(0, 4))
    );
    welcome.hidden = turns.length > 0;
  }

   

  function shortLabel(label) {
    return String(label || '').split(/\s[—–]\s/)[0];
  }

   
  function openLink(doc, { primary = true } = {}) {
    const tools = toolBySlug();
    if (doc.kind === 'room' && doc.room) {
      const a = el('a', { class: primary ? 'ask-open' : 'ask-open ask-open--quiet', href: `#room-${doc.room}`, 'data-ask-room': doc.room, 'data-ask-nav': '' });
      a.append(el('span', { text: `Go to ${doc.title}` }));
      return a;
    }
    const tool = tools.get(doc.tool);
    if (!tool) {
      
      const room = ((data && data.rooms) || []).find((r) => r.id === doc.room && r.id !== 'freezer');
      if (!room) return null;
      const a = el('a', { class: 'ask-open ask-open--quiet', href: `#room-${room.id}`, 'data-ask-room': room.id, 'data-ask-nav': '' });
      a.append(el('span', { text: `Go to ${room.label || room.id}` }));
      return a;
    }
    const anchor = cleanAnchor(doc.anchor);
    const name = shortLabel(tool.label);
    const words = doc.kind === 'tool' || doc.kind === 'game' ? `Open ${name}` : `Open in ${name}`;
    const a = el('a', {
      class: primary ? 'ask-open' : 'ask-open ask-open--quiet',
      href: `#/tool/${encodeURIComponent(tool.slug)}${anchor ? `/${anchor}` : ''}`,
      'data-tool': tool.slug, 'data-ask-nav': ''
    });
    if (anchor) a.setAttribute('data-tool-anchor', anchor);
    a.append(el('span', { text: words }), svg(SEND, 'ask-ico'));
    return a;
  }

  

  const GENERIC_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'into', 'how', 'what', 'when',
    'add', 'new', 'how', 'guide', 'details', 'screen', 'view', 'step', 'steps', 'customer', 'customers']);
  const sigWords = (s) => new Set(String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ')
    .split(/[^a-z0-9&]+/).filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w)));
  function crumbTrail(doc) {
    const c = (Array.isArray(doc.crumbs) ? doc.crumbs : []).filter(Boolean);
    
    const t = String(doc.title || '').toLowerCase();
    while (c.length && t.startsWith(c[c.length - 1].toLowerCase())) c.pop();
    return c;
  }
  function rowTitle(doc) {
    let t = String(doc.title || '');
    const trail = crumbTrail(doc);
    const m = /^(.+?)\s—\s(.+)$/.exec(t);
    if (m && trail.some((c) => c.toLowerCase() === m[2].toLowerCase())) t = m[1];
    
    const parent = (trail[trail.length - 1] || '').split(/\s—\s/)[0].replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (parent && t.split(/\s+/).length <= 3) {
      const tw = sigWords(t);
      const shares = [...sigWords(parent)].some((w) => tw.has(w));
      if (!shares && !t.toLowerCase().includes(parent.toLowerCase())) t = `${parent} — ${t}`;
    }
    return t;
  }

   
  function crumbsNode(doc) {
    const c = (Array.isArray(doc.crumbs) ? doc.crumbs : []).filter(Boolean);
    if (!c.length) return null;
    const p = el('p', { class: 'ask-crumbs' });
    c.forEach((s, i) => {
      
      const deep = i < c.length - 2 ? ' ask-crumb--deep' : '';
      const sepDeep = i <= c.length - 2 ? ' ask-crumb--deep' : '';
      if (i) p.append(el('span', { class: `ask-crumb-sep${sepDeep}`, 'aria-hidden': 'true', text: '›' }));
      p.append(el('span', { class: deep.trim() || null, text: s }));
    });
    return p;
  }

  function shotButton(src, alt, group, idx) {
    const b = el('button', { type: 'button', class: 'ask-shot', 'data-ask-shot': String(idx), 'data-ask-nav': '' });
    b.setAttribute('aria-label', `Enlarge picture: ${alt || 'screenshot'}`);
    const img = el('img', { class: 'ask-shot-img', alt: alt || '', decoding: 'async', 'data-src': siteUrl(src) || null });
    b.append(img);
    group.push({ src: siteUrl(src), alt: alt || '' });
    b._askGroup = group;
    lazyImg(img);
    return b;
  }

  

  const STEP_LABELS = [
    ['Where:', 'Where', ''], ["You'll see:", 'You’ll see', ''], ['You’ll see:', 'You’ll see', ''],
    ['Heads up:', 'Heads up', 'warn'], ['Tip:', 'Tip', 'tip']
  ];
  const STEP_SPLIT = /\s(?=(?:Where|You'll see|You’ll see|Heads up|Tip):\s)/;
  function stepText(text) {
    const parts = String(text).split(STEP_SPLIT);
    const head = el('p', { class: 'ask-step-text', text: parts.shift() || '' });
    if (!parts.length) return [head];
    const dl = el('dl', { class: 'ask-step-subs' });
    for (const part of parts) {
      const hit = STEP_LABELS.find(([k]) => part.startsWith(k));
      if (!hit) { head.append(` ${part}`); continue; }
      dl.append(el('div', { class: `ask-step-sub${hit[2] ? ` ask-step-sub--${hit[2]}` : ''}` }, [
        el('dt', { text: hit[1] }), el('dd', { text: part.slice(hit[0].length).trim() })
      ]));
    }
    return dl.childNodes.length ? [head, dl] : [head];
  }

  

  function stepCaption(st, fallbackN, total) {
    const lead = `Step ${st.n || fallbackN} of ${total}`;
    const head = String(st.text || '').split(STEP_SPLIT)[0];
    let clause = (head.split(/(?<=[.!?;:])\s|\s[—–]\s/)[0] || '').trim().replace(/[.;:]$/, '');
    if (!clause) return lead;
    const MAX = 90;
    if (clause.length > MAX) {
      const cut = clause.slice(0, MAX);
      const sp = cut.lastIndexOf(' ');
      if (sp < 30) return lead;
      clause = cut.slice(0, sp).replace(/[\s,;:—–-]+$/, '') + '…';
    }
    return `${lead}: ${clause}`;
  }

  function stepsNode(doc) {
    const steps = Array.isArray(doc.steps) ? doc.steps : [];
    if (!steps.length) return null;
    const group = [];
    const ol = el('ol', { class: 'ask-steps' });
    for (const st of steps) {
      const li = el('li', { class: 'ask-step' });
      const n = el('span', { class: 'ask-step-n', 'aria-hidden': 'true', text: String(st.n || ol.children.length + 1) });
      const body = el('div', { class: 'ask-step-body' }, stepText(st.text || ''));
      if (st.img) body.append(shotButton(st.img, stepCaption(st, ol.children.length + 1, steps.length), group, group.length));
      li.append(n, body);
      ol.append(li);
    }
    return ol;
  }

  function mediaNodes(doc) {
    const out = [];
    const group = [];
    
    
    const inSteps = new Set((Array.isArray(doc.steps) ? doc.steps : []).map((st) => st && st.img).filter(Boolean));
    for (const m of Array.isArray(doc.media) ? doc.media : []) {
      if (!m || !m.src || !siteUrl(m.src)) continue;
      if (m.type === 'image' && inSteps.has(m.src)) continue;
      if (m.type === 'image') {
        const wrap = el('div', { class: 'ask-media ask-media--image' });
        wrap.append(shotButton(m.src, m.alt || doc.title, group, group.length));
        if (doc.kind === 'printout') wrap.append(fileActions(m, doc));
        out.push(wrap);
      } else if (m.type === 'video' || m.type === 'hls') {
        out.push(videoNode(m, doc));
      } else if (m.type === 'pdf') {
        const page = Number.isInteger(m.page) && m.page > 0 ? m.page : 0;
        const wrap = el('div', { class: 'ask-media ask-media--pdf' }, [
          el('span', { class: 'ask-pdf-tag', 'aria-hidden': 'true', text: 'PDF' }),
          el('span', { class: 'ask-pdf-name' }, [
            el('span', { text: m.alt || doc.title }),
            page ? el('span', { class: 'ask-pdf-page', text: `Opens at page ${page}` }) : null
          ])
        ]);
        wrap.append(fileActions(m, doc));
        out.push(wrap);
      }
    }
    return out;
  }

  

  function fileActions(m, doc) {
    const url = siteUrl(m.src);
    if (!url) return el('div');
    
    const page = Number.isInteger(m.page) && m.page > 0 ? m.page : 0;
    const openUrl = page && m.type === 'pdf' ? `${url}#page=${page}` : url;
    const note = el('p', { class: 'ask-file-note', role: 'status' });
    const openA = el('a', { class: 'ask-file-btn', href: openUrl, target: '_blank', rel: 'noopener', 'data-ask-nav': '', text: 'Open' });
    openA.setAttribute('aria-label', `Open ${m.alt || doc.title} in a new tab`);
    const printB = el('button', { type: 'button', class: 'ask-file-btn', 'data-ask-nav': '', text: 'Print' });
    printB.setAttribute('aria-label', `Print ${m.alt || doc.title}`);
    printB.addEventListener('click', () => printFile(url, m.type, note));
    return el('div', { class: 'ask-file' }, [el('div', { class: 'ask-file-row' }, [openA, printB]), note]);
  }

  function printFile(url, type, note) {
    const say = (t) => { note.textContent = t; };
    if (type === 'pdf' && isTouch()) {
      let tab = null;
      try { tab = window.open(url, '_blank'); } catch { tab = null; }
      say(tab ? 'Opened in a new tab. To print it there, tap Share, then Print.'
        : 'Your browser blocked the new tab. Use Open, then print from there.');
      return;
    }
    let done = false;
    const frame = el('iframe', { class: 'ask-print-frame', title: 'Print', 'aria-hidden': 'true', tabindex: '-1' });
    const fallback = () => {
      if (done) return;
      done = true;
      frame.remove();
      let win = null;
      try { win = window.open(url, '_blank'); } catch { win = null; }
      if (win) { try { win.addEventListener('load', () => { try { win.print(); } catch {   } }); } catch {   } }
      say(win ? 'Opened in a new tab to print.' : 'Your browser blocked the print window. Use Open, then print from there.');
    };
    const watchdog = setTimeout(fallback, 5000);
    frame.addEventListener('load', () => {
      if (done) return;
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        done = true;
        clearTimeout(watchdog);
        say('');
        setTimeout(() => frame.remove(), 60000);
      } catch { clearTimeout(watchdog); fallback(); }
    });
    root.append(frame);
    frame.src = url;
  }

  

  let hlsP = null;
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsP) return hlsP;
    hlsP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = siteUrl(HLS_LIB);
      s.async = true;
      s.onload = () => (window.Hls ? res(window.Hls) : rej(new Error('no Hls')));
      s.onerror = () => { hlsP = null; rej(new Error('hls.light did not load')); };
      document.head.append(s);
    });
    return hlsP;
  }

  function videoNode(m, doc) {
    const wrap = el('div', { class: 'ask-media ask-media--video' });
    const btn = el('button', { type: 'button', class: 'ask-video-play', 'data-ask-nav': '' });
    const at = Number.isFinite(m.start) && m.start > 0 ? Math.floor(m.start) : 0;
    const clock = at ? `${Math.floor(at / 60)}:${String(at % 60).padStart(2, '0')}` : '';
    btn.setAttribute('aria-label', `Play video: ${m.alt || doc.title}${at ? `, from ${clock}` : ''}`);
    if (m.poster) {
      const img = el('img', { class: 'ask-video-poster', alt: '', decoding: 'async', 'data-src': siteUrl(m.poster) });
      btn.append(img);
      lazyImg(img);
    }
    btn.append(el('span', { class: 'ask-video-disc', 'aria-hidden': 'true' }, [svg(PLAY, 'ask-ico')]),
      el('span', { class: 'ask-video-label' }, [
        el('span', { text: m.alt || doc.title }),
        at ? el('span', { class: 'ask-video-at', text: `Starts at ${clock}` }) : null
      ]));
    const err = el('p', { class: 'ask-file-note', role: 'status' });
    btn.addEventListener('click', () => {
      const v = el('video', { class: 'ask-video', controls: '', playsinline: '', preload: 'auto' });
      v.setAttribute('aria-label', m.alt || doc.title);
      if (m.poster) v.setAttribute('poster', siteUrl(m.poster));
      if (m.captions) {
        v.setAttribute('crossorigin', 'anonymous');
        v.append(el('track', { kind: 'captions', src: siteUrl(m.captions), srclang: 'en', label: 'English' }));
      }
      const src = siteUrl(m.src);
      const hls = m.type === 'hls' || /\.m3u8(\?|$)/i.test(m.src);
      
      if (at) {
        const seek = () => { try { if (v.currentTime < at - 1) v.currentTime = at; } catch {   } };
        v.addEventListener('loadedmetadata', seek, { once: true });
        v.addEventListener('canplay', seek, { once: true });
      }
      const start = () => { btn.replaceWith(v); v.play().catch(() => {}); focusSafely(v); };
      if (!hls || v.canPlayType('application/vnd.apple.mpegurl')) { v.src = src; start(); return; }
      btn.setAttribute('aria-busy', 'true');
      loadHls().then((Hls) => {
        if (!Hls.isSupported()) { v.src = src; start(); return; }
        const h = new Hls({ maxBufferLength: 20 });
        h.loadSource(src);
        h.attachMedia(v);
        v._askHls = h;
        start();
      }).catch(() => {
        btn.removeAttribute('aria-busy');
        err.textContent = 'The video player did not load. Use the button below to watch it on its own page.';
      });
    });
    wrap.append(btn, err);
    return wrap;
  }

  

  function videoLine(doc) {
    const text = String(doc.text || '');
    const at = /^At (\d{1,2}:\d{2}) in the video\./.exec(text);
    if (at) {
      const parent = String((doc.crumbs || [])[0] || '').replace(/\s+—\s+Start Here$/, '');
      return parent ? `A chapter of the ${parent} video, starting at ${at[1]}.` : `A chapter starting at ${at[1]} in the video.`;
    }
    let d = text.split(/\bTranscript:/)[0].trim();
    d = d.replace(/\s+[^.]*·\s*\d+\s*min[^.]*\.?\s*$/, '').trim();
    const first = (d.match(/^.+?[.!?](?=\s|$)/) || [d])[0];
    return first.length > 200 ? first.slice(0, 200).replace(/\s+\S*$/, '') + '…' : first;
  }

   
  function docCard(doc, { headingId, alternates = [], related = false, guess = false, level = 'h3' } = {}) {
    const art = el('article', { class: 'ask-card', 'aria-labelledby': headingId });
    const crumbs = crumbsNode(doc);
    const h = el(level, { class: 'ask-card-title', id: headingId, tabindex: '-1' });
    

    if (guess) {
      art.classList.add('ask-card--guess');
      h.append(el('span', { class: 'ask-guess', text: 'Best guess' }), el('span', { class: 'ask-sr', text: ': ' }));
    }
    h.append(document.createTextNode(doc.title));
    if (crumbs) art.append(crumbs);
    art.append(h);

    if (doc.locked) {
      
      
      art.classList.add('ask-card--locked');
      art.append(el('p', { class: 'ask-locked' }, [svg(LOCK, 'ask-ico'), el('span', { text: 'Passcode required' })]));
      const o = openLink(doc);
      if (o) art.append(el('div', { class: 'ask-actions' }, [o]));
      const rel = alternates.filter((d) => d && d.id !== doc.id).slice(0, 3);
      if (related && rel.length) {
        art.append(el('div', { class: 'ask-related' }, [
          el('p', { class: 'ask-also-head', text: 'Related' }),
          el('div', { class: 'ask-related-chips' }, rel.map((d) => el('button', {
            type: 'button', class: 'ask-chip', 'data-ask-doc': d.id, 'data-ask-nav': '', text: rowTitle(d)
          })))
        ]));
      }
      return art;
    }

    if (doc.kind === 'video') {
      
      
      const line = videoLine(doc);
      if (line) art.append(el('p', { class: 'ask-card-text', text: line }));
    } else if (doc.text && doc.kind === 'game' && doc.text.length > 280) {
      art.append(el('p', { class: 'ask-card-text', text: doc.text.slice(0, 260).replace(/\s+\S*$/, '') + '…' }));
    } else if (doc.text) {
      art.append(el('p', { class: 'ask-card-text', text: doc.text }));
    }
    const steps = stepsNode(doc);
    if (steps) art.append(steps);
    for (const n of mediaNodes(doc)) art.append(n);
    const o = openLink(doc);
    if (o) art.append(el('div', { class: 'ask-actions' }, [o]));

    const alts = alternates.filter((d) => d && d.id !== doc.id).slice(0, 3);
    if (alts.length && related) {
      
      art.append(el('div', { class: 'ask-related' }, [
        el('p', { class: 'ask-also-head', text: 'Related' }),
        el('div', { class: 'ask-related-chips' }, alts.map((d) => {
          const b = el('button', { type: 'button', class: 'ask-chip', 'data-ask-doc': d.id, 'data-ask-nav': '', text: rowTitle(d) });
          if (d.locked) b.setAttribute('aria-label', `${rowTitle(d)}, passcode required`);
          return b;
        }))
      ]));
    } else if (alts.length) {
      art.append(el('div', { class: 'ask-also' }, [
        el('p', { class: 'ask-also-head', text: guess ? 'Or one of these' : 'Also close' }),
        el('div', { class: 'ask-opts' }, alts.map((d) => optButton(d)))
      ]));
    }
    return art;
  }

  function optButton(doc, i) {
    const b = el('button', { type: 'button', class: 'ask-opt', 'data-ask-doc': doc.id, 'data-ask-nav': '' });
    if (typeof i === 'number') b.append(el('span', { class: 'ask-opt-n', 'aria-hidden': 'true', text: String(i + 1) }));
    const label = rowTitle(doc);
    const words = el('span', { class: 'ask-opt-words' }, [el('span', { class: 'ask-opt-title', text: label })]);
    const c = crumbTrail(doc);
    if (c.length) {
      words.append(el('span', { class: 'ask-opt-crumbs ask-opt-crumbs--full', text: c.join(' › ') }));
      words.append(el('span', { class: 'ask-opt-crumbs ask-opt-crumbs--short', 'aria-hidden': 'true', text: c.slice(-2).join(' › ') }));
    }
    b.append(words);
    if (doc.locked) b.append(svg(LOCK, 'ask-ico ask-opt-lock'));
    b.setAttribute('aria-label', `${label}${c.length ? `, ${c.join(', ')}` : ''}${doc.locked ? ', passcode required' : ''}`);
    return b;
  }

  function freezerRow() {
    
    const b = el('button', {
      type: 'button', class: 'ask-opt ask-opt--lock', 'data-freezer-lock': '', 'aria-haspopup': 'dialog', 'data-ask-nav': ''
    });
    b.append(svg(LOCK, 'ask-ico'), el('span', { class: 'ask-opt-words' }, [el('span', { class: 'ask-opt-title', text: 'Manager tools — enter code' })]));
    return b;
  }

  

  function closeEnough(ans, q, ratio) {
    const P = ans.primary;
    const sc = ans._scores || null;
    const top = sc && P ? sc.get(P.id) : 0;
    const qw = sigWords(q);
    const out = [];
    for (const d of ans.alternates || []) {
      if (!d || d.id === P.id) continue;
      if (sc && top && !((sc.get(d.id) || 0) >= top * ratio)) continue;
      const same = d.tool && d.tool === P.tool;
      const dw = sigWords([d.title, ...(d.crumbs || [])].join(' '));
      const shares = [...qw].some((w) => dw.has(w) || [...dw].some((x) => x.startsWith(w) || w.startsWith(x)));
      if (same || shares) out.push(d);
    }
    return out;
  }

   
  function answerBody(ans, q, turnId) {
    const parts = [];
    const lockedNow = !!(ans.freezer && isLocked());
    if (lockedNow && ans.mode === 'none') {
      
      ans._lockOnly = true;
      return [el('h3', { class: 'ask-sr', id: `${turnId}-h`, tabindex: '-1', text: 'Manager tools' }),
        el('div', { class: 'ask-opts' }, [freezerRow()])];
    }
    if (ans.mode === 'direct' && ans.primary && !ans._confirmed && !(ans.confidence >= HIGH_CONFIDENCE)) {
      

      const guess = !!ans._guess;
      const alts = (ans.family ? (ans.alternates || []) : closeEnough(ans, q, 0.3))
        .filter((d) => d && d.id !== ans.primary.id).slice(0, 2);
      ans._likely = true;
      ans._options = [ans.primary, ...alts];
      if (!alts.length) {
        
        parts.push(docCard(ans.primary, { headingId: `${turnId}-h`, guess: true }));
      } else {
        parts.push(el('div', { class: 'ask-likely' }, [
          el('h3', { class: 'ask-card-title ask-card-title--small ask-likely-q', id: `${turnId}-h`, tabindex: '-1', text: 'Is it one of these?' }),
          docCard(ans.primary, { headingId: `${turnId}-h1`, guess, level: 'h4' }),
          el('div', { class: 'ask-also' }, [
            el('p', { class: 'ask-also-head', text: 'Or' }),
            el('div', { class: 'ask-opts' }, alts.map((d, i) => optButton(d, i + 1)))
          ])
        ]));
      }
    } else if (ans.mode === 'direct' && ans.primary) {
      const guess = !!ans._guess;
      const alts = ans._confirmed ? (ans.alternates || [])
        : guess ? closeEnough(ans, q, 0.3) : (ans.family ? (ans.alternates || []) : closeEnough(ans, q, 0.5));
      parts.push(docCard(ans.primary, { headingId: `${turnId}-h`, alternates: alts, related: !!ans.family && !guess, guess }));
    } else if (ans.mode === 'choices' && ans.primary) {
      const opts = [ans.primary, ...(ans.alternates || [])].filter(Boolean).slice(0, 4);
      const qh = el('h3', { class: 'ask-card-title ask-card-title--small', id: `${turnId}-h`, tabindex: '-1' });
      if (ans._guess) qh.append(el('span', { class: 'ask-guess', text: 'Best guess' }), el('span', { class: 'ask-sr', text: ': ' }));
      qh.append(document.createTextNode(ans._guess ? 'Is it one of these?' : 'Which one do you mean?'));
      parts.push(el('div', { class: 'ask-choices' }, [
        qh,
        el('div', { class: 'ask-opts' }, opts.map((d, i) => optButton(d, i)))
      ]));
      ans._options = opts;
    } else {
      

      const box = el('div', { class: 'ask-none' }, [
        el('h3', { class: 'ask-card-title ask-card-title--small', id: `${turnId}-h`, tabindex: '-1', text: 'I couldn’t find that on the site.' }),
        el('p', { class: 'ask-card-text', text: 'Try other words, browse every tool, or ask for a guide and Jeff will see it.' })
      ]);
      const browse = el('button', { type: 'button', class: 'ask-open ask-open--quiet', 'data-ask-browse': '', 'data-ask-nav': '' });
      browse.append(el('span', { text: 'Browse every tool' }));
      const tools = toolBySlug();
      const sb = tools.get('suggestion-box');
      if (sb) {
        const a = el('a', { class: 'ask-open ask-open--quiet', href: '#/tool/suggestion-box', 'data-tool': 'suggestion-box', 'data-ask-nav': '' });
        a.append(el('span', { text: 'Ask for a guide in the Suggestion Box' }), svg(SEND, 'ask-ico'));
        box.append(el('div', { class: 'ask-actions ask-actions--stack' }, [browse, a]));
      } else {
        box.append(el('div', { class: 'ask-actions' }, [browse]));
      }
      parts.push(box);
    }
    if (lockedNow) parts.push(el('div', { class: 'ask-opts ask-opts--lock' }, [freezerRow()]));
    return parts;
  }

  function announceFor(ans) {
    if (ans._lockOnly) return 'Manager tools — enter code.';
    if (ans._likely) {
      const n = (ans._options || []).length - 1;
      return `${ans._guess ? 'Best guess: ' : 'Possibly '}${ans.primary.title}${n ? `, or ${n} other ${n === 1 ? 'option' : 'options'}` : ''}.`;
    }
    if (ans.mode === 'direct' && ans.primary) {
      const n = Array.isArray(ans.primary.steps) ? ans.primary.steps.length : 0;
      return `${ans.primary.title}${ans.primary.locked ? ', passcode required' : ''}${n ? `, ${n} steps` : ''}.`;
    }
    if (ans.mode === 'choices') return `${(ans._options || []).length} possible answers. Pick one.`;
    return 'I couldn’t find that on the site. Closest matches listed.';
  }

   

  function addTurn(q, { label = null } = {}) {
    const id = `ask-t${++turnSeq}`;
    const node = el('section', { class: 'ask-turn', id, 'aria-labelledby': `${id}-h` });
    const ql = el('p', { class: 'ask-q' }, [el('span', { class: 'ask-sr', text: 'You asked: ' }), el('span', { text: label || q })]);
    const body = el('div', { class: 'ask-a' });
    node.append(ql, body);
    log.append(node);
    const turn = { id, node, body, q };
    turns.push(turn);
    while (turns.length > TURNS_MAX) {
      const old = turns.shift();
      for (const v of old.node.querySelectorAll('video')) { try { if (v._askHls) v._askHls.destroy(); v.pause(); v.removeAttribute('src'); v.load(); } catch {   } }
      for (const i of old.node.querySelectorAll('img')) { if (io) io.unobserve(i); i.removeAttribute('src'); }
      old.node.remove();
    }
    welcome.hidden = true;
    return turn;
  }

  

  function scrollToTurn(turn) {
    const top = turn.node.offsetTop - 8;
    try { log.scrollTo({ top, behavior: motionOff() ? 'auto' : 'smooth' }); } catch { log.scrollTop = top; }
  }

  function settleFocus(turn) {
    
    if (finePointer() && !isTouch()) { focusSafely(input); return; }
    try { input.blur(); } catch {   }
    const h = turn.node.querySelector(`#${turn.id}-h`);
    if (h) focusSafely(h);
  }

  function announce(text) {
    status.textContent = '';
    setTimeout(() => { status.textContent = text; }, 60);
  }

   
  async function ask(q) {
    const text = String(q || '').trim().slice(0, W.q);
    if (!text) return;

    
    const last = turns[turns.length - 1];
    const ord = /^(?:the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th|[1-4])(?:\s+one)?\.?$/i.exec(text);
    if (ord && last && last.options && last.options.length) {
      const map = { first: 0, '1st': 0, 1: 0, second: 1, '2nd': 1, 2: 1, third: 2, '3rd': 2, 3: 2, fourth: 3, '4th': 3, 4: 3 };
      const doc = last.options[map[ord[1].toLowerCase()]];
      if (doc) { pick(doc); return; }
    }

    rememberRecent(text);
    const turn = addTurn(redact(text));
    turn.body.append(el('p', { class: 'ask-wait', text: 'Looking…' }));
    scrollToTurn(turn);

    let b;
    try { b = await loadBrain(); }
    catch {
      turn.body.replaceChildren(el('p', { class: 'ask-card-text', text: 'Ask the Chef could not load. Check the connection and try again.' }));
      announce('Ask the Chef could not load.');
      return;
    }

    const ans = b.ask.answer(text);
    try { ans._scores = new Map(b.ask.search(text, { limit: 12 }).map((r) => [r.doc.id, r.score])); }
    catch { ans._scores = null; }
    
    
    
    ans._guess = ans.mode !== 'none' && (ans.guess === true || ans.confidence < LOW_CONFIDENCE);

    const endpoint = workerEndpoint();
    const canAsk = !!endpoint && !workerOff && !mostlyMasked(redact(text));
    const hasCands = !!(ans.candidates && ans.candidates.length);
    const lockOnly = ans.mode === 'none' && ans.freezer && isLocked();

    

    if (ans.mode === 'none' && !lockOnly && canAsk && hasCands) {
      turn.body.replaceChildren(el('p', { class: 'ask-thinking ask-thinking--solo' }, [
        el('span', { class: 'ask-thinking-dot', 'aria-hidden': 'true' }), el('span', { text: 'Chef is checking…' })
      ]));
      announce('Checking with the Chef.');
      const out = await callWorker(text, ans.candidates, endpoint);
      if (!turn.node.isConnected) return;
      if (out && out.picks.length) {
        showAnswer(turn, confirmed(out.picks, ans), text, out.reply);
      } else {
        showAnswer(turn, ans, text, '');
      }
      settleFocus(turn);
      return;
    }

    showAnswer(turn, ans, text, '');
    settleFocus(turn);

    
    if (!canAsk || ans.mode === 'none' || !hasCands || !ans._guess) return;
    hybrid(turn, text, ans, endpoint);
  }

   
  function showAnswer(turn, ans, q, reply) {
    turn.body.replaceChildren(...answerBody(ans, q, turn.id));
    turn.options = ans._options || null;
    turn.answer = ans;
    for (const old of turn.node.querySelectorAll('.ask-reply')) old.remove();
    if (reply) {
      
      turn.node.insertBefore(el('p', { class: 'ask-reply' }, [svg(BELL, 'ask-ico'), el('span', { text: reply })]), turn.body);
    }
    scrollToTurn(turn);
    announce(`${reply ? `${reply} ` : ''}${announceFor(ans)}`);
  }

  

  function confirmed(picks, ans) {
    return {
      mode: 'direct', primary: picks[0],
      alternates: picks.slice(1, 3),
      candidates: ans.candidates, confidence: ans.confidence, freezer: ans.freezer,
      _scores: null, _guess: false, _confirmed: true
    };
  }

   
  function pick(doc) {
    const turn = addTurn('', { label: doc.title });
    const ans = { mode: 'direct', primary: doc, alternates: [], candidates: [], confidence: 1 };
    turn.body.replaceChildren(...answerBody(ans, doc.title, turn.id));
    turn.answer = ans;
    scrollToTurn(turn);
    announce(announceFor(ans));
    settleFocus(turn);
  }

  

  function workerBody(q, docs) {
    const clean = (s) => String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    const seen = new Set();
    const candidates = [];
    for (const d of docs) {
      if (candidates.length === W.candidates) break;
      if (!d || typeof d.id !== 'string' || d.id.length > W.id || !ID_RE.test(d.id) || seen.has(d.id)) continue;
      const titleT = clean(d.title).slice(0, W.title);
      if (!titleT) continue;
      seen.add(d.id);
      candidates.push({
        id: d.id,
        title: titleT,
        crumbs: (Array.isArray(d.crumbs) ? d.crumbs : []).map((c) => clean(c).slice(0, W.crumb)).filter(Boolean).slice(0, W.crumbs),
        text: d.locked ? '' : clean(d.text).slice(0, W.text),
        locked: d.locked === true
      });
    }
    const body = { q: redact(clean(q)).slice(0, W.q), candidates };
    let json = JSON.stringify(body);
    const size = (s) => new TextEncoder().encode(s).length;
    
    for (const cap of [400, 200, 0]) {
      if (size(json) <= W.bytes) break;
      for (const c of candidates) c.text = c.text.slice(0, cap);
      json = JSON.stringify(body);
    }
    while (size(json) > W.bytes && candidates.length > 1) { candidates.pop(); json = JSON.stringify(body); }
    return candidates.length && body.q ? json : null;
  }

  

  async function callWorker(q, candidates, endpoint) {
    if (mostlyMasked(redact(q))) return null;
    const json = workerBody(q, candidates);
    if (!json) return null;
    if (inflight) { try { inflight.abort(); } catch {   } }
    const ctl = new AbortController();
    inflight = ctl;
    const timer = setTimeout(() => { try { ctl.abort(); } catch {   } }, WORKER_TIMEOUT_MS);
    let out = null;
    try {
      const res = await fetch(`${endpoint}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: json,
        signal: ctl.signal,
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-store',
        referrerPolicy: 'strict-origin'
      });
      if (res.status === 429) workerOff = true;     
      if (res.ok) out = await res.json();
    } catch { out = null; }
    finally {
      clearTimeout(timer);
      if (inflight === ctl) inflight = null;
    }
    if (!out || typeof out !== 'object') return null;
    const byId = new Map((candidates || []).map((d) => [d.id, d]));
    return {
      picks: (Array.isArray(out.picks) ? out.picks : []).map((id) => byId.get(id)).filter(Boolean).slice(0, 3),
      reply: typeof out.reply === 'string' ? out.reply.trim().slice(0, 400) : '',
      none: out.none === true
    };
  }

  

  async function hybrid(turn, q, ans, endpoint) {
    const thinking = el('p', { class: 'ask-thinking', 'aria-hidden': 'true' }, [
      el('span', { class: 'ask-thinking-dot' }), el('span', { text: 'Chef is thinking…' })
    ]);
    turn.node.insertBefore(thinking, turn.body);
    const out = await callWorker(q, ans.candidates, endpoint);
    thinking.remove();
    if (!out || !turn.node.isConnected) return;
    let next = null;
    if (out.picks.length) next = confirmed(out.picks, ans);
    else if (out.none) next = { mode: 'none', primary: null, alternates: [], candidates: ans.candidates, confidence: 0, freezer: ans.freezer };
    if (!next) return;
    const hadFocus = turn.node.contains(document.activeElement);
    showAnswer(turn, next, q, out.picks.length ? out.reply : '');
    if (hadFocus) settleFocus(turn);
  }

   

  let vvRaf = 0;
  function syncViewport() {
    vvRaf = 0;
    const vv = window.visualViewport;
    if (!vv) return;
    root.style.setProperty('--ask-vvh', `${Math.round(vv.height)}px`);
    root.style.setProperty('--ask-vvt', `${Math.round(vv.offsetTop)}px`);
  }
  const onViewport = () => { if (!vvRaf) vvRaf = requestAnimationFrame(syncViewport); };

  function open({ opener: from = null, q = '' } = {}) {
    if (viewing) return false;
    const modal = document.getElementById('modal-root');
    if (modal && modal.firstElementChild) return false;     
    clearTimeout(closeTimer);
    root.classList.remove('is-closing');
    if (!isOpenNow) {
      opener = from || document.activeElement;
      pendingReturn = null;
      if (!turns.length) renderWelcome();
      syncViewport();
      if (root.inert) root.inert = false;
      root.removeAttribute('aria-hidden');
      root.hidden = false;
      isOpenNow = true;
      root.classList.add('is-open');
      document.documentElement.classList.add('ask-is-open');
      fab.setAttribute('aria-expanded', 'true');
      syncFab();
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewport);
        window.visualViewport.addEventListener('scroll', onViewport);
      }
    }
    loadBrain().catch(() => {});
    if (q) { input.value = ''; ask(q); }
    else focusSafely(input);
    return true;
  }

  function close({ instant = false, restore = true } = {}) {
    if (!isOpenNow) return;
    isOpenNow = false;
    closeLightbox(false);
    fab.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('ask-is-open');
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', onViewport);
      window.visualViewport.removeEventListener('scroll', onViewport);
    }
    for (const v of root.querySelectorAll('video')) { try { v.pause(); } catch {   } }
    const done = () => {
      clearTimeout(closeTimer);
      if (isOpenNow) return;
      root.hidden = true;
      root.classList.remove('is-open', 'is-closing');
    };
    if (instant || motionOff()) done();
    else {
      root.classList.remove('is-open');
      root.classList.add('is-closing');
      closeTimer = setTimeout(done, 200);
    }
    syncFab();
    if (restore) {
      const t = opener;
      opener = null;
      if (t && t !== document.body && isShown(t) && focusSafely(t)) return;
      if (isShown(fab)) focusSafely(fab);
      else if (heroInput && isShown(heroInput)) focusSafely(heroInput);
    }
  }

   
  let lbGroup = null;
  let lbIdx = 0;
  let lbFrom = null;
  function showLb(i) {
    lbIdx = (i + lbGroup.length) % lbGroup.length;
    const it = lbGroup[lbIdx];
    lbImg.src = it.src;
    lbImg.alt = it.alt;
    
    lbCap.textContent = lbGroup.length > 1 && !/^Step \d+ of \d+/.test(it.alt) ? `${lbIdx + 1} of ${lbGroup.length} · ${it.alt}` : it.alt;
    lbPrev.hidden = lbNext.hidden = lbGroup.length < 2;
  }
  function openLightbox(group, i, from) {
    lbGroup = group;
    lbFrom = from;
    showLb(i);
    lightbox.hidden = false;
    panel.setAttribute('aria-hidden', 'true');
    if ('inert' in panel) panel.inert = true;
    focusSafely(lbClose);
  }
  function closeLightbox(restore = true) {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    lbImg.removeAttribute('src');
    panel.removeAttribute('aria-hidden');
    if ('inert' in panel) panel.inert = false;
    if (restore && lbFrom) focusSafely(lbFrom);
    lbFrom = null;
  }
  lbClose.addEventListener('click', () => closeLightbox());
  lbPrev.addEventListener('click', () => showLb(lbIdx - 1));
  lbNext.addEventListener('click', () => showLb(lbIdx + 1));
  lightbox.addEventListener('click', (ev) => { if (ev.target === lightbox) closeLightbox(); });

   
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = input.value;
    input.value = '';
    ask(q);
  });
  closeBtn.addEventListener('click', () => close({ restore: true }));
  newBtn.addEventListener('click', () => {
    while (turns.length) {
      const t = turns.pop();
      for (const v of t.node.querySelectorAll('video')) { try { if (v._askHls) v._askHls.destroy(); v.pause(); } catch {   } }
      t.node.remove();
    }
    if (inflight) { try { inflight.abort(); } catch {   } }
    clearRecent();
    renderWelcome();
    focusSafely(input);
  });
  scrim.addEventListener('pointerdown', (ev) => {
    
    
    if (ev.pointerType === 'mouse' && ev.button === 0) close({ restore: true });
  });

  root.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('button, a');
    if (!t || !root.contains(t)) return;

    if (t.hasAttribute('data-ask-q')) { ask(t.getAttribute('data-ask-q')); return; }
    if (t.hasAttribute('data-ask-shot')) {
      const group = t._askGroup;
      if (group && group.length) openLightbox(group, Number(t.getAttribute('data-ask-shot')) || 0, t);
      return;
    }
    if (t.hasAttribute('data-ask-doc')) {
      const id = t.getAttribute('data-ask-doc');
      const turn = turns.find((x) => x.node.contains(t));
      const pool = [];
      if (turn && turn.answer) pool.push(turn.answer.primary, ...(turn.answer.alternates || []), ...(turn.answer.candidates || []));
      if (brain) pool.push(...brain.docs);
      const doc = pool.find((d) => d && d.id === id);
      if (doc) pick(doc);
      return;
    }
    if (t.hasAttribute('data-ask-browse')) {
      
      
      close({ instant: true, restore: false });
      try { document.dispatchEvent(new CustomEvent('ccc:find-open', { detail: { source: 'ask' } })); } catch {   }
      return;
    }
    if (t.hasAttribute('data-ask-room')) {
      if (typeof goToRoom === 'function') {
        ev.preventDefault();
        const id = t.getAttribute('data-ask-room');
        close({ instant: true, restore: false });
        goToRoom(id);
      } else close({ instant: true, restore: false });      
      return;
    }
    if (t.matches('a[data-tool]')) {
      
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      pendingReturn = (heroSlot && heroVisible && heroInput) ? heroInput : fab;
      close({ instant: true, restore: false });
      
      
      return;
    }
    if (t.hasAttribute('data-freezer-lock')) {
      
      
      pendingReturn = null;
      close({ instant: true, restore: true });
    }
  });

   
  root.addEventListener('keydown', (ev) => {
    if (ev.isComposing) return;
    if (!lightbox.hidden) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeLightbox(); return; }
      if (ev.key === 'ArrowLeft' && lbGroup.length > 1) { ev.preventDefault(); showLb(lbIdx - 1); return; }
      if (ev.key === 'ArrowRight' && lbGroup.length > 1) { ev.preventDefault(); showLb(lbIdx + 1); return; }
      if (ev.key === 'Tab') {
        const items = [lbPrev, lbNext, lbClose].filter((n) => !n.hidden);
        const i = items.indexOf(document.activeElement);
        ev.preventDefault();
        focusSafely(items[(i + (ev.shiftKey ? -1 : 1) + items.length) % items.length]);
      }
      return;
    }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close({ restore: true }); return; }

    const navs = () => Array.from(log.querySelectorAll('[data-ask-nav]')).filter(isShown);
    const a = document.activeElement;
    if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && (a === input || (a && a.hasAttribute && a.hasAttribute('data-ask-nav')))) {
      if (a && a.tagName === 'VIDEO') return;
      const list = navs();
      if (!list.length) return;
      ev.preventDefault();
      if (a === input) {
        
        const lastTurn = turns[turns.length - 1];
        const scope = lastTurn ? Array.from(lastTurn.node.querySelectorAll('[data-ask-nav]')).filter(isShown) : list;
        focusSafely(ev.key === 'ArrowDown' ? (scope[0] || list[0]) : list[list.length - 1]);
        return;
      }
      const i = list.indexOf(a);
      const j = i + (ev.key === 'ArrowDown' ? 1 : -1);
      if (j < 0 || j >= list.length) { focusSafely(input); return; }
      focusSafely(list[j]);
      try { list[j].scrollIntoView({ block: 'nearest' }); } catch {   }
      return;
    }
    if (ev.key === 'Tab') {
      const items = [newBtn, closeBtn, ...navs(), input, send].filter((n) => !n.hidden && isShown(n) && !n.disabled);
      
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (ev.shiftKey && (a === first || !panel.contains(a))) { ev.preventDefault(); focusSafely(last); }
      else if (!ev.shiftKey && (a === last || !panel.contains(a))) { ev.preventDefault(); focusSafely(first); }
    }
  });

  
  
  const guard = (ev) => { if (!log.contains(ev.target) && !lightbox.contains(ev.target)) ev.preventDefault(); };
  root.addEventListener('wheel', guard, { passive: false });
  root.addEventListener('touchmove', guard, { passive: false });

  MOUNTED = {
    open, close, ask,
    isOpen: () => isOpenNow,
    root, fab, heroForm,
    _loadBrain: loadBrain
  };
  window.CCC = Object.assign(window.CCC || {}, { ask: MOUNTED });
  return MOUNTED;
}
