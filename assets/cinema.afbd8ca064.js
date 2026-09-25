


import { initEngine, scrollToRoom, onRoomChange } from './engine.638cfc5330.js';
import { initOverlay, openTool, closeTool } from './overlay.dbf3839ea2.js';
import { mountRoomScreens } from './screens.14b6a54b78.js';
import { initChefWall } from './chefwall.561dda2416.js';
import { initLabels } from './labels.b8974f5d8d.js';
import { buildWallPrint, revealWallPrints } from './wallprint.c6e5ad8da9.js';
import { initFreezer } from './freezer.db542c2f18.js';


import {
  initColdGate, setAdopt, coldTools, isFreezerUnlocked, sealedCount,
  onFreezerUnlock, openKeypad
} from './coldgate.5557b67d4d.js';
import { el, fill, $ } from './dom.d7b1df3700.js';
import { ROOM_ORDER, HOTSPOTS, CHEF_FRAMES, FREEZER_DOOR } from '../rooms.d58e8ef8a0.js';



function optional(name, pending) {
  return pending.then((m) => m, (err) => {
    console.error(`[cinema] ${name}.js did not load; the restaurant boots without it.`, err);
    return null;
  });
}
const MOTION_MODULE = optional('motion',
  import('./motion.cdd7997661.js'));
const FIND_MODULE = optional('find',
  import('./find.e53f08707c.js'));
const OPTIONAL_WAIT_MS = 1500;
 
function within(pending, ms) {
  return Promise.race([pending, new Promise((res) => setTimeout(() => res(undefined), ms))]);
}





 
const COURSE = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];



function totalToolCount(data) {
  return data.tools.length + (isFreezerUnlocked() ? 0 : sealedCount());
}

 
function isExternal(url) {
  try { return new URL(url, document.baseURI).origin !== location.origin; }
  catch { return false; }
}







const ROOM_ART = {
  hero:      { focus: '50% 45%', glowX: '50%', glowY: '20%' },
  pass:      { focus: '50% 58%', glowX: '50%', glowY: '28%' },
  host:      { focus: '52% 44%', glowX: '22%', glowY: '16%' },
  dining:    { focus: '50% 40%', glowX: '50%', glowY: '24%' },
  prep:      { focus: '46% 46%', glowX: '60%', glowY: '22%' },
  office:    { focus: '60% 50%', glowX: '50%', glowY: '16%' },
  breakroom: { focus: '46% 48%', glowX: '34%', glowY: '16%' },
  freezer:   { focus: '46% 50%', glowX: '66%', glowY: '14%' }
};



function roomVars(art) {
  const [fx, fy] = String(art.focus || '50% 50%').trim().split(/\s+/);
  const frac = (v, fallback) => {
    const num = parseFloat(v);
    return Number.isFinite(num) ? (num / 100).toFixed(4) : fallback;
  };
  return `--focus-x:${frac(fx, '0.5')};--focus-y:${frac(fy, '0.5')};` +
         `--glow-x:${art.glowX || '62%'};--glow-y:${art.glowY || '30%'}`;
}



const PLATE_W = 2400;
const PLATE_H = 1340;

async function loadData() {
  const inline = window.__CCC_INLINE__;
  if (inline && inline.tools && inline.headchefs) return inline;

  
  const [tools, headchefs] = await Promise.all([
    fetch('data/tools.6f26bfbc4c.json').then((r) => r.json()),
    fetch('headchefs/headchefs.json').then((r) => r.json())
  ]);
  return { tools, headchefs };
}

 
function indexTools(toolsDoc) {
  const rooms = toolsDoc.rooms || [];
  const tools = toolsDoc.tools || [];

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const bySlug = new Map(tools.map((t) => [t.slug, t]));

  
  
  const byRoom = new Map(ROOM_ORDER.map((id) => [id, []]));
  for (const tool of tools) {
    if (!byRoom.has(tool.room)) byRoom.set(tool.room, []);
    byRoom.get(tool.room).push(tool);
  }

  return { rooms, tools, roomById, bySlug, byRoom };
}












const PLATE_SIZES =
  '(max-width: 500px) 440px, ' +
  '(max-width: 1000px) and (max-height: 500px) 440px, ' +
  '(min-aspect-ratio: 2400/1340) 110vw, 197vh';



const WIDE_SIZES = {
  breakroom: '(max-width: 500px) 495px, ' +
             '(max-width: 1000px) and (max-height: 500px) 495px, ' +
             '(min-aspect-ratio: 2400/1340) 124vw, 222vh',
  office:    '(max-width: 500px) 455px, ' +
             '(max-width: 1000px) and (max-height: 500px) 455px, ' +
             '(min-aspect-ratio: 2400/1340) 114vw, 204vh'
};



const PLATES = {
  hero:         { src: 'plates/hero.197e175d93.webp',         srcset: 'plates/hero@1400.24df9e8171.webp 1400w, plates/hero@1800.e298cedad8.webp 1800w, plates/hero.197e175d93.webp 2400w' },
  pass:         { src: 'plates/pass.96df41e5e3.webp',         srcset: 'plates/pass@1400.19e2f93c88.webp 1400w, plates/pass@1800.67a9fef62f.webp 1800w, plates/pass.96df41e5e3.webp 2400w' },
  host:         { src: 'plates/host.77ad3dcb2d.webp',         srcset: 'plates/host@1400.9f4f7fceb0.webp 1400w, plates/host@1800.c1093ca544.webp 1800w, plates/host.77ad3dcb2d.webp 2400w' },
  dining:       { src: 'plates/dining.e833a21953.webp',       srcset: 'plates/dining@1400.940873ea4c.webp 1400w, plates/dining@1800.f2e000e730.webp 1800w, plates/dining.e833a21953.webp 2400w' },
  prep:         { src: 'plates/prep.e1ff2fd61f.webp',         srcset: 'plates/prep@1400.71a1c3421a.webp 1400w, plates/prep@1800.914c0511c4.webp 1800w, plates/prep.e1ff2fd61f.webp 2400w' },
  office:       { src: 'plates/office.670507df49.webp',       srcset: 'plates/office@1400.a9e2459c21.webp 1449w, plates/office@1800.f9ba7cb502.webp 1863w, plates/office.670507df49.webp 2484w',
                  w: 2484, h: 1656, sizes: WIDE_SIZES.office },
  breakroom:    { src: 'plates/breakroom.2a6780d6af.webp',    srcset: 'plates/breakroom@1400.ca6052d83a.webp 1575w, plates/breakroom@1800.01ed4c35af.webp 2025w, plates/breakroom.2a6780d6af.webp 2700w',
                  w: 2700, h: 1656, sizes: WIDE_SIZES.breakroom },
  freezer:      { src: 'plates/freezer.01697f04b3.webp',      srcset: 'plates/freezer@1400.bc3f759e61.webp 1400w, plates/freezer@1800.950d506378.webp 1800w, plates/freezer.01697f04b3.webp 2400w' },
  'freezer-door': { src: 'plates/freezer-door.833492497b.webp', srcset: 'plates/freezer-door@1400.2c18d7f0b7.webp 1400w, plates/freezer-door@1800.5d976c9501.webp 1800w, plates/freezer-door.833492497b.webp 2400w' }
};



function plateFor(room) {
  if (room === 'freezer' && !isFreezerUnlocked()) return PLATES['freezer-door'];
  return PLATES[room] || PLATES.hero;
}



function revealFreezerInterior() {
  const img = document.querySelector('#room-freezer .plate');
  if (!img) return;
  const p = PLATES.freezer;
  if (img.getAttribute('src') === p.src) return;
  img.setAttribute('srcset', p.srcset);
  img.setAttribute('src', p.src);
}

function buildPlate(room, index) {
  const eager = index === 0;              
  const art = plateFor(room);
  

  return el('img', {
    class: 'plate',
    srcset: art.srcset,
    sizes: art.sizes || PLATE_SIZES,
    src: art.src,
    width: String(art.w || PLATE_W),
    height: String(art.h || PLATE_H),
    alt: '',                              
    decoding: 'async',
    loading: eager ? 'eager' : 'lazy',
    
    
    
    
    fetchpriority: eager ? 'high' : 'low'
  });
}

function buildPlateWrap(room, index) {
  return el('div', { class: 'plate-wrap' }, [
    buildPlate(room, index),
    el('div', { class: 'plate-glow', 'aria-hidden': 'true' }),
    el('div', { class: 'plate-vig', 'aria-hidden': 'true' })
  ]);
}

 
function boxVars(x, y, w, h) {
  return `--x:${x}%;--y:${y}%;--w:${w}%;--h:${h}%`;
}

 
const FULL_BLEED = boxVars(0, 0, 100, 100);



function buildHotspot(spot, data) {
  if (spot.kind === 'chefs') {
    
    return el('div', { 'data-chefwall-host': '', style: FULL_BLEED });
  }

  if (spot.kind === 'screen') {
    const tool = data.bySlug.get(spot.slug);
    const host = el('div', {
      'data-screen': spot.slug,
      'data-screen-title': spot.label || (tool && tool.label) || '',
      
      'data-screen-mode': spot.mode || null,
      'data-screen-name': spot.name || null,
      'data-screen-width': spot.width || null,
      'data-screen-quad': spot.quad ? JSON.stringify(spot.quad) : null,
      
      
      
      
      
      
      style: (spot.quad
        ? FULL_BLEED
        
        
        
        
        : boxVars(spot.x, spot.y, spot.w, spot.h) + ';pointer-events:auto'
      ) + ';position:absolute'
    });
    return host;
  }

  if (spot.kind === 'lock') {
    return el('button', {
      type: 'button',
      class: 'hotspot',
      'data-freezer-lock': '',
      style: boxVars(spot.x, spot.y, spot.w, spot.h)
    }, [
      el('span', { class: 'dot', 'aria-hidden': 'true' }),
      el('span', { class: 'hotspot-label', text: spot.label || 'Manager access' })
    ]);
  }

  
  
  
  
  
  
  
  
  
  
  
  
  
  if (spot.kind === 'print') return buildWallPrint(spot, data);

  
  const tool = data.bySlug.get(spot.slug);
  return el('button', {
    type: 'button',
    class: 'hotspot',
    'data-tool': spot.slug,
    'data-edge': spot.edge || null,        
    style: boxVars(spot.x, spot.y, spot.w, spot.h)
  }, [
    el('span', { class: 'dot', 'aria-hidden': 'true' }),
    el('span', { class: 'hotspot-label', text: spot.label || (tool && tool.label) || spot.slug })
  ]);
}



function buildRail(roomId, index, data) {
  const meta = data.roomById.get(roomId) || { label: roomId, tagline: '' };
  const tools = (data.byRoom.get(roomId) || []).filter(showsChip);
  const titleId = `room-${roomId}-title`;
  
  const gated = roomId === 'freezer' && !isFreezerUnlocked();

  const chips = el('nav', {
    class: 'rail-chips',
    
    
    'aria-label': gated ? `${meta.label} — locked` : `Tools in ${meta.label}`,
    
    
    'data-locked': gated ? '' : null,
    'data-room-chips': roomId
  }, gated ? [buildLockChip(sealedCount())] : tools.map((tool, i) => buildChip(tool, false, i)));

  return el('div', { class: 'rail' }, [
    
    
    
    el('p', { class: 'rail-kicker', text: `Course ${COURSE[index - 1] || index}` }),
    el('h2', { class: 'rail-title', id: titleId, text: meta.label }),
    
    
    
    
    el('hr', { class: 'rail-rule' }),
    chips
  ]);
}



function showsChip(tool) {
  return !tool || tool.object !== 'no-chip';
}



const PADLOCK_SVG =
  '<svg width="10" height="12" viewBox="0 0 11 13" fill="currentColor" ' +
  'aria-hidden="true" focusable="false" style="flex:none"><rect x="0" y="5" ' +
  'width="11" height="8" rx="1.5"/><path d="M2.5 6V3.5a3 3 0 0 1 6 0V6" ' +
  'fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';



function buildChip(tool, staged, i) {
  const chip = el('button', {
    type: 'button',
    class: 'chip',
    'data-tool': tool.slug,
    
    style: staged
      ? `opacity:0;transition:opacity 420ms var(--ease-out) ${i * 30}ms`
      : null
  });
  chip.append(tool.label);
  

  if (tool.marquee) {
    chip.dataset.marquee = '';
    
    
    chip.dataset.label = tool.label;
    chip.append(el('span', { class: 'chip-count', 'data-marquee-count': tool.marquee }));
  }
  return chip;
}



function armArcadeChips() {
  const spans = document.querySelectorAll('[data-marquee-count]');
  if (!spans.length) return;
  const byUrl = new Map();
  for (const span of spans) {
    const url = span.getAttribute('data-marquee-count');
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(span);
  }
  for (const [url, targets] of byUrl) {
    fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        
        
        const n = Array.isArray(d) ? d.length
                : (d && Array.isArray(d.games)) ? d.games.length : 0;
        if (!n) return;                                   
        const words = n === 1 ? '1 game' : `${n} games`;
        for (const span of targets) {
          
          
          span.replaceChildren(
            el('span', { class: 'chip-sep', 'aria-hidden': 'true' }),
            document.createTextNode(words)
          );
          

          const chip = span.closest('.chip');
          if (chip) chip.setAttribute('aria-label', `${chip.dataset.label || 'Arcade'} — ${words}`);
        }
      })
      .catch((err) => {
        console.warn('[arcade] chip count unavailable; the chip keeps its plain label.', err);
      });
  }
}





const LOCK_WORDS = 'Manager tools — enter code';

function buildLockChip(count) {
  const chip = el('button', {
    type: 'button',
    class: 'chip',
    'data-freezer-lock': '',
    'data-locked': '',
    'aria-haspopup': 'dialog',
    'aria-label': `${LOCK_WORDS}. ${count} are locked in the Walk-In Freezer.`
  });
  chip.insertAdjacentHTML('afterbegin', PADLOCK_SVG);
  chip.append(LOCK_WORDS);
  return chip;
}



function playUnlockBeat() {
  
  
  
  
  revealFreezerInterior();
  
  
  
  revealWallPrints();

  const rail = document.querySelector('[data-room-chips="freezer"]');
  if (rail && rail.hasAttribute('data-locked')) {
    const meta = FREEZER_RAIL_META;
    const tools = (meta && meta.tools) || [];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    fill(rail, tools.map((tool, i) => buildChip(tool, !reduce, i)));
    rail.removeAttribute('data-locked');
    rail.setAttribute('aria-label', `Tools in ${(meta && meta.label) || 'Walk-In Freezer'}`);

    if (!reduce) {
      
      
      
      
      
      
      
      
      
      void rail.offsetWidth;
      for (const chip of rail.children) chip.style.opacity = '1';
      
      
      
      
      const n = rail.children.length;
      setTimeout(() => {
        for (const chip of rail.children) {
          chip.style.removeProperty('transition');
          chip.style.removeProperty('opacity');
        }
      }, 420 + n * 30 + 120);
    }
  }

  const keypad = document.querySelector('#room-freezer .hotspot[data-freezer-lock]');
  if (keypad) keypad.remove();

  announce('Cold storage open. Manager tools are unlocked.');
}



let FREEZER_RAIL_META = null;



function watchSealedDeepLink(data, freezer, overlayApi) {
  const slugOf = () => {
    const m = /^#\/tool\/([^/?#]+)/.exec(location.hash || '');
    try { return m ? decodeURIComponent(m[1]) : null; } catch { return m ? m[1] : null; }
  };

  const check = (ev) => {
    const raw = slugOf();
    if (!raw) return;
    

    const slug = raw.toLowerCase();
    if (data.bySlug.has(slug)) {
      if (slug !== raw) {
        try {
          history.replaceState(history.state, '',
            `${location.pathname}${location.search}#/tool/${encodeURIComponent(slug)}`);
        } catch {   }
        if (ev && overlayApi && !overlayApi.isOpen()) openTool(slug, { history: false });
      }
      return;                             
    }
    if (isFreezerUnlocked()) return;      

    try { history.replaceState(null, '', location.pathname + location.search); }
    catch {   }

    openKeypad().then((ok) => {
      if (!ok) return;
      const tool = data.bySlug.get(slug);
      if (!tool) return;                  
      freezer.whenOpen().then(() => openTool(slug));
    });
  };

  window.addEventListener('hashchange', check);
  check(null);
}



function roomFromHash() {
  const m = /^#room-([a-z0-9_-]+)$/i.exec(location.hash || '');
  if (!m) return null;
  const id = m[1].toLowerCase();
  return id === 'hero' || ROOM_ORDER.includes(id) ? id : null;
}

function goToHashRoom(cold) {
  const id = roomFromHash();
  if (!id) return;
  if (document.documentElement.classList.contains('ccc-locked')) return;   
  if (cold && id !== 'hero') {
    
    const sec = document.getElementById(`room-${id}`);
    if (sec) window.scrollTo(0, Math.round(sec.getBoundingClientRect().top + window.scrollY));
  }
  
  
  scrollToRoom(id, { offset: 0, duration: 1, instant: true, cut: false });
}

 
let liveRegion = null;
function announce(message) {
  if (!liveRegion) {
    liveRegion = el('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
    document.body.append(liveRegion);
  }
  
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = message; }, 60);
}

 
function buildRoom(roomId, index, data) {
  const art = ROOM_ART[roomId] || {};
  const spots = HOTSPOTS[roomId] || [];

  const hotspots = el('div', { class: 'hotspots' },
    spots.map((spot) => buildHotspot(spot, data)));

  return el('section', {
    class: 'room',
    id: `room-${roomId}`,
    'data-room': roomId,
    'aria-labelledby': `room-${roomId}-title`,
    style: roomVars(art)
  }, [
    el('div', { class: 'stage' }, [
      buildPlateWrap(roomId, index),
      hotspots,
      buildRail(roomId, index, data)
    ])
  ]);
}



function buildHero() {
  const art = ROOM_ART.hero;
  return el('section', {
    class: 'hero room',
    id: 'room-hero',
    'data-room': 'hero',
    'aria-labelledby': 'hero-title',
    style: roomVars(art)
  }, [
    el('div', { class: 'stage' }, [
      buildPlateWrap('hero', 0),
      el('div', { class: 'hero-inner' }, [
        
        
        el('h1', { class: 'hero-title', id: 'hero-title' }, [
          el('span', { text: 'Cook' }),
          el('span', { text: 'County' }),
          el('span', { text: 'Cooks' })
        ])
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
      ])
    ])
  ]);
}

 
function buildKitchen(data) {
  const kitchen = $('#kitchen');
  const sections = [buildHero()];
  ROOM_ORDER.forEach((roomId, i) => sections.push(buildRoom(roomId, i + 1, data)));
  fill(kitchen, sections);
  return kitchen;
}







const TICKET_ROW_BREAK = 4;

function buildTicketRail(data) {
  const header = $('#ticket-rail');

  const ticketEls = ROOM_ORDER.map((roomId, i) => {
    const meta = data.roomById.get(roomId) || { short: roomId, label: roomId };
    return el('a', {
      class: 'ticket',
      href: `#room-${roomId}`,
      'data-goto': roomId,
      'aria-label': meta.label
    }, [
      el('span', { class: 'ticket-no', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') }),
      el('span', { class: 'ticket-name', text: meta.short || meta.label })
    ]);
  });

  

  const rows = [
    el('div', { class: 'ticket-row' }, ticketEls.slice(0, TICKET_ROW_BREAK)),
    el('div', { class: 'ticket-row' }, ticketEls.slice(TICKET_ROW_BREAK))
  ].filter(r => r.childElementCount > 0);

  const tickets = el('nav', { class: 'tickets', 'aria-label': 'Rooms' }, rows);

  fill(header, [
    el('a', { class: 'brand', href: '#room-hero', text: 'Cook County Cooks' }),
    tickets
  ]);

  
  header.addEventListener('click', (ev) => {
    
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const link = ev.target.closest('[data-goto], .brand');
    if (!link) return;
    ev.preventDefault();
    const target = link.dataset.goto || 'hero';
    
    
    
    
    scrollToRoom(target, { offset: 0 });
  });

  
  
  onRoomChange(({ name }) => {
    
    
    for (const t of ticketEls) {
      if (t.dataset.goto === name) t.setAttribute('aria-current', 'true');
      else t.removeAttribute('aria-current');
    }
    

  });

  return header;
}





 
const FOX_SVG =
  '<svg class="c3-fox" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M3 3l3.6 3.2h10.8L21 3l-1 7.6a8 8 0 0 1-8 8 8 8 0 0 1-8-8z"/>' +
  '<path d="M9 11.2h.01M15 11.2h.01"/><path d="M12 14.2l-1.4 1.2h2.8z"/></svg>';



function buildC3Menu(data, findRef = { api: null }) {
  const button = el('button', {
    type: 'button', id: 'c3-button', 'aria-expanded': 'false',
    'aria-controls': 'c3-menu', 'aria-label': 'Blufox C³ — every tool'
  });
  button.innerHTML = FOX_SVG + '<span class="c3-mark">C³</span>';

  

  const countEl = el('span', { class: 'kicker', 'data-c3-count': '' });
  const renderCount = () => {
    const n = data.tools.length;
    countEl.textContent = `${n} ${n === 1 ? 'tool' : 'tools'}`;
  };
  renderCount();

  

  const search = el('input', {
    type: 'text', class: 'find-c3-input', 'aria-label': 'Search every tool',
    placeholder: 'Search every tool', autocomplete: 'off', autocorrect: 'off',
    autocapitalize: 'off', spellcheck: 'false', inputmode: 'search', enterkeyhint: 'go'
  });
  
  
  const searchField = el('div', { class: 'find-c3-field', hidden: true }, [search]);
  const enableSearch = (svg) => {
    if (!searchField.hidden) return;
    if (svg) {
      const holder = el('span', {});
      holder.innerHTML = svg;
      if (holder.firstChild) {
        holder.firstChild.setAttribute('class', 'find-c3-icon');
        searchField.insertBefore(holder.firstChild, search);
      }
    }
    searchField.hidden = false;
  };

  const list = el('div', { class: 'c3-list' });
  const menu = el('div', {
    id: 'c3-menu', role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': 'c3-menu-title',
    
    
    tabindex: '-1'
  }, [
    el('div', { id: 'c3-menu-head', class: 'find-c3-head' }, [
      el('h2', { class: 't-sub', id: 'c3-menu-title', text: 'Every tool' }),
      countEl,
      searchField
    ]),
    el('hr', { class: 'rule' }),
    list
  ]);


  function renderList() {
    const unlocked = isFreezerUnlocked();
    const children = [];

    for (const roomId of ROOM_ORDER) {
      const meta = data.roomById.get(roomId) || { label: roomId };
      const tools = data.byRoom.get(roomId) || [];
      
      
      
      if (!tools.length && !(roomId === 'freezer' && !unlocked)) continue;

      children.push(el('p', { class: 'kicker', text: meta.label }));

      if (roomId === 'freezer' && !unlocked) {
        
        children.push(el('button', {
          type: 'button', class: 'c3-item', 'data-freezer-lock': '',
          'aria-label': `${LOCK_WORDS}. ${sealedCount()} are locked in the Walk-In Freezer.`,
          text: LOCK_WORDS
        }));
        continue;
      }

      for (const tool of tools) {
        children.push(el('a', {
          class: 'c3-item',
          href: tool.url,
          'data-tool': tool.slug,      
          target: tool.external_only || isExternal(tool.url) ? '_blank' : null,
          rel: tool.external_only || isExternal(tool.url) ? 'noopener noreferrer' : null,
          text: tool.label
        }));
      }
    }
    fill(list, children);
  }
  renderList();
  onFreezerUnlock(() => { renderList(); renderCount(); });

  


  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const supportsInert = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
  let inerted = [];
  let lastFocus = null;
  let open = false;

  

  function setOutsideInert(on) {
    if (!supportsInert) return;
    if (on) {
      inerted = [];
      for (const child of Array.from(document.body.children)) {
        if (child === menu || child === button || child.inert) continue;
        child.inert = true;
        inerted.push(child);
      }
    } else {
      inerted.forEach((n) => { n.inert = false; });
      inerted = [];
    }
  }

  const focusables = () => Array.from(menu.querySelectorAll(FOCUSABLE))
    .filter((n) => n.offsetParent !== null || n === document.activeElement);

  const setOpen = (next, { restore = true } = {}) => {
    if (next === open) return;
    open = next;
    button.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);

    if (open) {
      lastFocus = document.activeElement;
      setOutsideInert(true);
      const first = menu.querySelector('.c3-item');
      let fine = false;
      try { fine = matchMedia('(pointer: fine)').matches; } catch {   }
      (fine && !searchField.hidden ? search : (first || menu)).focus();
      return;
    }

    search.value = '';
    setOutsideInert(false);
    
    if (!restore) { lastFocus = null; return; }
    
    
    
    if (lastFocus && lastFocus.isConnected && !menu.contains(document.activeElement)) lastFocus = null;
    if (lastFocus && lastFocus.isConnected) {
      try { lastFocus.focus({ preventScroll: true }); } catch (_) { lastFocus.focus(); }
    } else if (menu.contains(document.activeElement)) {
      button.focus();
    }
    lastFocus = null;
  };

  button.addEventListener('click', () => setOpen(!open));

  
  document.addEventListener('click', (ev) => {
    if (!open) return;
    if (menu.contains(ev.target) || button.contains(ev.target)) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (ev) => {
    if (!open) return;

    if (ev.key === 'Escape') {
      ev.preventDefault();
      setOpen(false);
      button.focus();
      return;
    }

    if (ev.key !== 'Tab') return;

    
    
    
    
    const items = focusables();
    if (!items.length) { ev.preventDefault(); menu.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey) {
      if (active === first || active === menu || !menu.contains(active)) {
        ev.preventDefault(); last.focus();
      }
    } else if (active === last || !menu.contains(active)) {
      ev.preventDefault(); first.focus();
    }
  });
  
  menu.addEventListener('click', (ev) => {
    if (ev.target.closest('.c3-item')) setOpen(false);
  });
  
  
  
  
  document.addEventListener('ccc:viewer-open', () => {
    if (open) setOpen(false, { restore: false });
  });

  
  
  search.addEventListener('input', () => {
    const text = search.value;
    if (!text.trim() || !findRef.api) return;
    search.value = '';
    setOpen(false, { restore: false });
    findRef.api.open({ text, opener: button });
  });
  search.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown') return;
    const first = menu.querySelector('.c3-item');
    if (first) { ev.preventDefault(); first.focus(); }
  });

  
  
  document.body.append(button, menu);
  return { button, menu, close: () => setOpen(false), enableSearch };
}





function buildFooter(data) {
  const footer = $('#site-footer');
  footer.setAttribute('aria-labelledby', 'footer-title');

  const grid = el('div', { class: 'footer-index' });

  function renderGroups() {
    const unlocked = isFreezerUnlocked();
    const groups = [];

    for (const roomId of ROOM_ORDER) {
      const meta = data.roomById.get(roomId) || { label: roomId, tagline: '' };
      const tools = data.byRoom.get(roomId) || [];
      if (!tools.length && !(roomId === 'freezer' && !unlocked)) continue;

      const headingId = `footer-${roomId}`;
      const body = [];

      if (roomId === 'freezer' && !unlocked) {
        body.push(el('p', {
          class: 'micro',
          text: `${sealedCount()} manager tools are behind the keypad.`
        }));
        body.push(el('button', {
          type: 'button', class: 'chip', 'data-freezer-lock': '',
          text: LOCK_WORDS
        }));
      } else {
        body.push(el('ul', {}, tools.map((tool) => {
          const external = tool.external_only || isExternal(tool.url);
          return el('li', {}, [
            el('a', {
              class: 'tool-row',
              href: tool.url,
              target: external ? '_blank' : null,
              rel: external ? 'noopener noreferrer' : null
            }, [
              
              
              
              
              
              el('span', { class: 'tool-row-name', text: tool.label })
            ])
          ]);
        })));
      }

      groups.push(el('section', { 'aria-labelledby': headingId }, [
        el('h3', { class: 'kicker', id: headingId, text: meta.label }),
        
        
        
        
        
        
        
        
        
        
        
        
        
        el('p', { class: 'micro', text: meta.tagline || '' }),
        ...body
      ]));
    }
    fill(grid, groups);
  }
  renderGroups();
  onFreezerUnlock(renderGroups);

  fill(footer, [
    el('h2', { class: 't-sub', id: 'footer-title', text: 'Every tool, in plain text' }),
    el('p', {
      class: 'micro',
      text: 'The whole index, grouped by room. Ordinary links — open them here, in a new tab, or copy them out.'
    }),
    el('hr', { class: 'rule' }),
    grid,
    el('hr', { class: 'rule' }),
    el('p', {
      class: 'micro',
      text: `Cook County Cooks · ${totalToolCount(data)} tools across ${data.rooms.length} rooms · Blufox C³`
    })
  ]);

  return footer;
}





export async function boot() {
  

  let motion = null;
  const startMotion = (mod) => {
    try { motion = mod.initMotion(); } catch (err) { console.error('[motion] init failed:', err); }
    if (window.CCC) window.CCC.motion = motion;
  };
  {
    const mod = await within(MOTION_MODULE, OPTIONAL_WAIT_MS);
    if (mod) startMotion(mod);
    else if (mod === undefined) MOTION_MODULE.then((late) => { if (late) startMotion(late); });
  }

  

  document.documentElement.style.scrollBehavior = 'auto';

  let raw;
  try {
    raw = await loadData();
  } catch (err) {
    console.error('[app] could not load tools/headchefs:', err);
    return;
  }
  const data = indexTools(raw.tools);

  

  let overlayApi = null;
  const adoptCold = (tools) => {
    const room = data.byRoom.get('freezer') || [];
    for (const tool of tools) {
      if (data.bySlug.has(tool.slug)) continue;
      data.tools.push(tool);
      data.bySlug.set(tool.slug, tool);
      room.push(tool);
      
      
      
      if (overlayApi && overlayApi.registry) overlayApi.registry.set(tool.slug, tool);
    }
    data.byRoom.set('freezer', room);
    FREEZER_RAIL_META = {
      tools: room,
      label: (data.roomById.get('freezer') || {}).label || 'Walk-In Freezer'
    };
  };
  setAdopt(adoptCold);

  await initColdGate();

  
  
  
  FREEZER_RAIL_META = {
    tools: data.byRoom.get('freezer') || [],
    label: (data.roomById.get('freezer') || {}).label || 'Walk-In Freezer'
  };

   
  buildKitchen(data);
  
  
  
  
  
  
  
  
  initLabels();
  buildTicketRail(data);
  const findRef = { api: null };
  const c3 = buildC3Menu(data, findRef);
  

  const startFind = (mod) => {
    try {
      findRef.api = mod.mountFind({
        data,
        isLocked: () => !isFreezerUnlocked() && sealedCount() > 0,
        onUnlock: onFreezerUnlock,
        goToRoom: (id) => scrollToRoom(id, { offset: 0 }),
        rail: $('#ticket-rail'),
        beforeOpen: () => c3.close(),
        closeViewer: () => closeTool()
      });
      c3.enableSearch(mod.SEARCH_SVG);
    } catch (err) { console.error('[find] mount failed:', err); }
    if (window.CCC) window.CCC.find = findRef.api;
  };
  {
    
    const mod = await within(FIND_MODULE, OPTIONAL_WAIT_MS);
    if (mod) startFind(mod);
    else if (mod === undefined) FIND_MODULE.then((late) => { if (late) startFind(late); });
  }
  
  
  armArcadeChips();
  
  
  
  
  
  
  
  
  
  
  
  
  
  const footerEl = $('#site-footer');
  if (footerEl) footerEl.hidden = true;

   
  
  
  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest && ev.target.closest('[data-freezer-lock]');
    if (!trigger) return;
    ev.preventDefault();
    if (isFreezerUnlocked()) return;
    openKeypad();
  });

  
  
  
  
  
  
  
  
  
  
  
  const freezer = initFreezer({
    room: $('#room-freezer'),
    geometry: FREEZER_DOOR,
    
    
    interior: PLATES.freezer.src,
    interiorSrcset: PLATES.freezer.srcset,
    
    
    
    
    sizes: PLATE_SIZES,
    isUnlocked: isFreezerUnlocked,
    onUnlock: onFreezerUnlock,
    onRevealed: playUnlockBeat
  });

  if (isFreezerUnlocked()) {
    
    
    
    
    
    const keypad = $('#room-freezer .hotspot[data-freezer-lock]');
    if (keypad) keypad.remove();
  }

   
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  const gatedSlugs = () => new Set((data.byRoom.get('freezer') || []).map((t) => t.slug));
  overlayApi = initOverlay({
    
    
    tools: data.tools,
    canOpen: (slug) => !gatedSlugs().has(slug) || isFreezerUnlocked(),
    
    
    
    
    onRefused: (slug, { retry }) => {
      openKeypad().then((ok) => { if (ok) freezer.whenOpen().then(retry); });
    }
  });

  
  
  if (isFreezerUnlocked()) adoptCold(coldTools());

  

  watchSealedDeepLink(data, freezer, overlayApi);

   
  const engine = initEngine();

   
  
  
  
  mountRoomScreens(document, { tools: data.tools });

   
  const breakroom = $('#room-breakroom');
  const wallHost = breakroom && breakroom.querySelector('[data-chefwall-host]');
  if (wallHost) {
    initChefWall({
      host: wallHost,
      chefs: raw.headchefs.headchefs || [],
      frames: CHEF_FRAMES,
      
      
      
      
      
      
      refreshFrom: 'headchefs/headchefs.json',
      
      
      
      
      stripHost: breakroom.querySelector('.rail')
    });
  }

   
  
  
  
  engine.refresh();

   
  goToHashRoom(true);
  window.addEventListener('hashchange', () => goToHashRoom(false));

  
  
  
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => engine.refresh()).catch(() => {});
  }

  
  window.CCC = Object.assign(window.CCC || {}, { engine, data, openTool, freezer, find: findRef.api, motion });
}



