


import { el, fill, $ } from './dom.d7b1df3700.js';
import { initOverlay } from './overlay.dbf3839ea2.js';
import { ROOM_ORDER } from './roomorder.e9125c1800.js';
import {
  initColdGate, setAdopt, coldTools, isFreezerUnlocked, sealedCount,
  onFreezerUnlock, openKeypad
} from './coldgate.5557b67d4d.js';
import { buildIndex, query as findQuery, touchesFreezer, readRecent, mountFind } from './find.e53f08707c.js';







async function loadTools() {
  const inline = window.__CCC_INLINE__;
  if (inline && inline.tools) return inline.tools;
  const res = await fetch('data/tools.6f26bfbc4c.json');
  return res.json();
}



function indexTools(doc) {
  const rooms = doc.rooms || [];
  const tools = doc.tools || [];
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const bySlug = new Map(tools.map((t) => [t.slug, t]));

  const order = [...ROOM_ORDER];
  for (const r of rooms) if (!order.includes(r.id)) order.push(r.id);
  for (const t of tools) if (!order.includes(t.room)) order.push(t.room);

  const byRoom = new Map(order.map((id) => [id, []]));
  for (const tool of tools) byRoom.get(tool.room).push(tool);

  return { rooms, tools, roomById, bySlug, order, byRoom };
}











const FOX_SVG =
  '<svg class="c3-fox" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M3 3l3.6 3.2h10.8L21 3l-1 7.6a8 8 0 0 1-8 8 8 8 0 0 1-8-8z"/>' +
  '<path d="M9 11.2h.01M15 11.2h.01"/><path d="M12 14.2l-1.4 1.2h2.8z"/></svg>';



function toolRow(tool) {
  const a = el('a', {
    class: 'tool-row pocket-row',
    
    
    href: `#/tool/${encodeURIComponent(tool.slug)}`,
    'data-tool': tool.slug,
    'data-slug': tool.slug,
    
    
    
    
    
    
    
    
    
    
    'aria-label': tool.blurb ? `${tool.label}. ${tool.blurb}` : tool.label
  }, [
    el('span', { class: 'tool-row-name', text: tool.label }),
    
    
    tool.blurb ? el('span', { class: 'tool-row-blurb', text: tool.blurb }) : null
  ]);
  return el('li', {}, [a]);
}

 
function resultRow(tool, roomLabel) {
  const a = el('a', {
    class: 'tool-row pocket-row',
    href: `#/tool/${encodeURIComponent(tool.slug)}`,
    'data-tool': tool.slug,
    'data-slug': tool.slug,
    'aria-label': roomLabel ? `${tool.label}, ${roomLabel}` : tool.label
  }, [
    el('span', { class: 'tool-row-name', text: tool.label }),
    
    roomLabel ? el('span', { class: 'tool-row-blurb', text: roomLabel }) : null
  ]);
  return el('li', {}, [a]);
}



function lockRow(count) {
  return el('li', {}, [
    el('button', {
      type: 'button', class: 'tool-row pocket-row pocket-lock',
      'data-freezer-lock': '',
      
      'aria-label': `Manager tools — enter code. ${count} in the Walk-In Freezer.`
    }, [
      
      el('span', { class: 'tool-row-name', text: 'Manager tools — enter code' }),
      el('span', { class: 'micro', text: `${count} in the Walk-In Freezer` })
    ])
  ]);
}





export async function boot() {
  const doc = await loadTools();
  const data = indexTools(doc);

  const root = $('#kitchen');
  const rail = $('#ticket-rail');
  const footer = $('#site-footer');
  
  
  
  if (rail) rail.hidden = true;
  if (footer) footer.hidden = true;

  

  let overlayApi = null;              
  setAdopt((tools) => {
    const room = data.byRoom.get('freezer') || [];
    for (const tool of tools) {
      if (data.bySlug.has(tool.slug)) continue;
      data.tools.push(tool);
      data.bySlug.set(tool.slug, tool);
      room.push(tool);
      

      if (overlayApi && overlayApi.registry) overlayApi.registry.set(tool.slug, tool);
    }
    data.byRoom.set('freezer', room);
  });
  await initColdGate();

   
  

  const search = el('input', {
    type: 'search', id: 'pocket-q', class: 'pocket-input',
    placeholder: 'Search tools',
    inputmode: 'search',
    autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'done',
    'aria-describedby': 'pocket-count'
  });
  const count = el('p', { class: 'pocket-count micro', id: 'pocket-count', role: 'status' });
  const clear = el('button', {
    type: 'button', class: 'pocket-clear', 'aria-label': 'Clear the search', hidden: true
  });
  clear.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M6 6l12 12M18 6L6 18"/></svg>';

  const head = el('header', { class: 'pocket-head' }, [
    el('div', { class: 'pocket-brand' }, [
      el('h1', { class: 'pocket-wordmark', text: 'Cook County Cooks' }),
      el('span', { class: 'pocket-mark', 'aria-hidden': 'true' })
    ])
  ]);
  head.querySelector('.pocket-mark').innerHTML = FOX_SVG + '<span class="c3-mark">C³</span>';

  

  const bar = el('div', { class: 'pocket-bar' }, [
    el('label', { class: 'visually-hidden', for: 'pocket-q', text: 'Search tools by name or description' }),
    el('div', { class: 'pocket-field' }, [search, clear]),
    count
  ]);

  const results = el('div', { class: 'pocket-results', id: 'pocket-list', tabindex: '-1' });
  const empty = el('div', { class: 'pocket-empty', hidden: true });

  const foot = el('footer', { class: 'pocket-foot' }, [
    el('hr', { class: 'rule' }),
    
    
    el('a', {
      class: 'pocket-escape', href: '?view=full',
      
      
      'aria-label': 'View the full restaurant. The photographed walk-through. Heavier — best on wifi.'
    }, [
      el('span', { text: 'View the full restaurant' }),
      el('span', { class: 'micro', text: 'The photographed walk-through. Heavier — best on wifi.' })
    ]),
    el('p', { class: 'micro pocket-colophon' })
  ]);
  foot.querySelector('.pocket-escape').addEventListener('click', () => {
    try { localStorage.setItem('ccc-view', 'full'); } catch { 
 }
  });

  fill(root, [el('div', { class: 'pocket' }, [head, bar, results, empty, foot])]);

  

  const skip = $('.skip-link');
  if (skip) { skip.setAttribute('href', '#pocket-list'); skip.textContent = 'Skip to the tool list'; }

  document.documentElement.dataset.pocketReady = '1';

   
  let query = '';
  let index = buildIndex(data.tools, data.rooms);

  function render() {
    const searching = query.trim().length > 0;
    const groups = [];
    let shown = 0;
    const locked = !isFreezerUnlocked() && sealedCount() > 0;

    if (!searching) {
      for (const roomId of data.order) {
        const meta = data.roomById.get(roomId) || { label: roomId };
        const tools = data.byRoom.get(roomId) || [];
        
        
        
        const lockVisible = roomId === 'freezer' && locked;
        if (!tools.length && !lockVisible) continue;

        const headingId = `pocket-room-${roomId}`;
        const items = tools.map(toolRow);
        if (lockVisible) items.push(lockRow(sealedCount()));
        shown += tools.length + (lockVisible ? 1 : 0);

        groups.push(el('section', { class: 'pocket-group', 'aria-labelledby': headingId }, [
          el('h2', { class: 'kicker', id: headingId, text: meta.label }),
          el('ul', {}, items)
        ]));
      }
    } else {
      
      
      
      
      const results = findQuery(index, query, { recent: readRecent() });
      const items = results.map((r) => resultRow(r.tool, r.entry.room.label));
      
      
      const lockVisible = locked && touchesFreezer(index, query, results);
      if (lockVisible) items.push(lockRow(sealedCount()));
      shown = items.length;
      if (items.length) {
        groups.push(el('section', { class: 'pocket-group', 'aria-labelledby': 'pocket-room-results' }, [
          el('h2', { class: 'kicker', id: 'pocket-room-results', text: 'Best match first' }),
          el('ul', {}, items)
        ]));
      }
    }

    fill(results, groups);
    results.classList.toggle('is-searching', searching);

    const open = data.tools.length;
    const sealed = isFreezerUnlocked() ? 0 : sealedCount();
    if (searching) {
      count.textContent = shown === 0
        ? `No matches for “${query.trim()}”`
        : `${shown} ${shown === 1 ? 'match' : 'matches'} for “${query.trim()}”`;
    } else {
      count.textContent = sealed
        ? `${open} tools · ${sealed} in the walk-in`
        : `${open} tools`;
    }

    const none = searching && shown === 0;
    empty.hidden = !none;
    if (none) {
      

      fill(empty, [
        el('p', { class: 'pocket-empty-line', text: `Nothing here is called “${query.trim()}”.` }),
        el('button', { type: 'button', class: 'chip', 'data-act': 'clear', text: 'Clear search' })
      ]);
    }
    clear.hidden = !query;
    
    
    foot.querySelector('.pocket-colophon').textContent =
      `Cook County Cooks · ${open} tools across ${data.rooms.length} rooms · Blufox C³`;

  }

  render();

   
  search.addEventListener('input', () => { query = search.value; render(); });
  clear.addEventListener('click', () => {
    query = ''; search.value = ''; render(); search.focus();
  });
  empty.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-act="clear"]')) return;
    query = ''; search.value = ''; render(); search.focus();
  });
  
  
  search.addEventListener('search', () => { query = search.value; render(); });

  
  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest && ev.target.closest('[data-freezer-lock]');
    if (!trigger) return;
    ev.preventDefault();
    if (isFreezerUnlocked()) return;
    openKeypad();
  });
  onFreezerUnlock(() => { index = buildIndex(data.tools, data.rooms); render(); });

  

  const focusField = () => {
    if (overlayApi && overlayApi.isOpen()) return false;
    try { search.focus({ preventScroll: true }); } catch { search.focus(); }
    try { search.select(); } catch {   }
    return true;
  };

  


  

  function gatedSlugs() {
    if (isFreezerUnlocked()) return new Set();
    
    
    
    return { has: (slug) => !data.bySlug.has(slug) };
  }

  

  overlayApi = initOverlay({
    
    tools: data.tools,
    canOpen: (slug) => !gatedSlugs().has(slug) || isFreezerUnlocked(),
    onRefused: (slug, { retry }) => { openKeypad().then((ok) => { if (ok) retry(); }); }
  });

  mountFind({
    data,
    isLocked: () => !isFreezerUnlocked() && sealedCount() > 0,
    onUnlock: onFreezerUnlock,
    isViewing: () => !!(overlayApi && overlayApi.isOpen()),
    closeViewer: () => { if (overlayApi) overlayApi.close(); },
    onHotkey: () => focusField()
  });

  

  function catchSealedDeepLink(ev) {
    const m = /^#\/tool\/([^/?#]+)/.exec(location.hash || '');
    if (!m) return;
    let raw; try { raw = decodeURIComponent(m[1]); } catch { raw = m[1]; }
    
    const slug = raw.toLowerCase();
    if (data.bySlug.has(slug)) {            
      if (slug !== raw) {
        try {
          history.replaceState(history.state, '',
            `${location.pathname}${location.search}#/tool/${encodeURIComponent(slug)}`);
        } catch {   }
        if (ev && !overlayApi.isOpen()) overlayApi.open(slug, { history: false });
      }
      return;
    }
    if (isFreezerUnlocked()) return;        
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch {   }
    openKeypad().then((ok) => {
      
      
      
      if (ok && data.bySlug.has(slug)) overlayApi.open(slug);
    });
  }
  window.addEventListener('hashchange', catchSealedDeepLink);
  catchSealedDeepLink();

  

  const goToRoomGroup = () => {
    const m = /^#room-([a-z0-9_-]+)$/i.exec(location.hash || '');
    if (!m || query) return;
    const h = document.getElementById(`pocket-room-${m[1].toLowerCase()}`);
    const g = h && (h.closest('.pocket-group') || h);
    if (!g) return;
    try { g.scrollIntoView({ block: 'start' }); } catch { g.scrollIntoView(); }
  };
  window.addEventListener('hashchange', goToRoomGroup);
  goToRoomGroup();

  
  window.CCC = Object.assign(window.CCC || {}, { view: 'pocket', data, render });
}
