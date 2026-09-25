




const POCKET_MQ =
  '(pointer: coarse) and ((max-width: 500px) or ((max-width: 1000px) and (max-height: 500px)))';

const VIEW_KEY = 'ccc-view';



export function readView() {
  try { const v = localStorage.getItem(VIEW_KEY); return v === 'full' || v === 'pocket' ? v : null; }
  catch { return null; }
}
export function rememberView(v) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { 
 }
}

function decide() {
  const stamped = document.documentElement.dataset.view;
  if (stamped === 'pocket' || stamped === 'full') return stamped;
  
  let q = null;
  try { q = new URLSearchParams(location.search).get('view'); } catch {   }
  if (q === 'full' || q === 'pocket') return q;
  const saved = readView();
  if (saved) return saved;
  try { return matchMedia(POCKET_MQ).matches ? 'pocket' : 'full'; } catch { return 'full'; }
}



const load = {
  pocket: () =>
    import('./pocket.e858cd8700.js'),
  cinema: () =>
    import('./cinema.afbd8ca064.js')
};



function addWayBack() {
  let phone = false;
  try { phone = matchMedia(POCKET_MQ).matches; } catch {   }
  if (!phone) return;
  const a = document.createElement('a');
  a.className = 'pocket-return';
  a.href = '?view=pocket';
  a.textContent = 'Tool list';
  a.setAttribute('aria-label', 'Switch to the fast tool list');
  a.addEventListener('click', () => rememberView('pocket'));
  document.body.append(a);
}



function normaliseToolParam() {
  let params;
  try { params = new URLSearchParams(location.search); } catch { return; }
  

  const hm = /^#\/tool\/([^/?#]+)(.*)$/.exec(location.hash || '');
  if (hm && hm[1] !== hm[1].toLowerCase()) {
    try { history.replaceState(history.state, '', location.pathname + location.search + `#/tool/${hm[1].toLowerCase()}${hm[2]}`); }
    catch {   }
  }
  const raw = params.get('tool');
  if (!raw) return;
  const slug = raw.toLowerCase();
  params.delete('tool');
  const q = params.toString();
  const url = location.pathname + (q ? `?${q}` : '') + `#/tool/${encodeURIComponent(slug)}`;
  try { history.replaceState(history.state, '', url); }
  catch { location.hash = `#/tool/${encodeURIComponent(slug)}`; }
}




 
function fEl(tag, props, kids) {
  const n = document.createElement(tag);
  for (const k in (props || {})) {
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(kids || [])) if (c) n.append(c);
  return n;
}



function fStamp(url) {
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) return u.href;
    u.searchParams.set('_ccc', String(Date.now()));
    return u.href;
  } catch { return url; }
}

function renderFloor(err) {
  console.error('[app] a front-end module did not load; rendering the flat list.', err);
  const main = document.getElementById('kitchen') || document.body;
  if (!main) return;                                   
  document.documentElement.dataset.view = 'floor';     
  const data = (window.__CCC_INLINE__ && window.__CCC_INLINE__.tools) || null;
  const tools = (data && Array.isArray(data.tools)) ? data.tools : [];
  const rooms = (data && Array.isArray(data.rooms)) ? data.rooms : [];

  const head = fEl('div', { class: 'floor-head' }, [
    fEl('p', { class: 'kicker', text: 'Cook County Cooks' }),
    fEl('h1', { class: 't-sub', text: 'Every tool, one tap away' }),
    fEl('p', {
      class: 'micro',
      text: tools.length
        ? 'The kitchen could not be built on this load, so here is the plain list. Every link is live.'
        : 'The kitchen could not be built on this load.'
    }),
    fEl('p', {}, [fEl('a', { class: 'chip', href: location.pathname + location.search, text: 'Try the full site again' })])
  ]);

  const groups = [];
  const seen = new Set();
  const byRoom = new Map();
  for (const t of tools) {
    if (!t || !t.url) continue;
    const r = t.room || 'other';
    if (!byRoom.has(r)) byRoom.set(r, []);
    byRoom.get(r).push(t);
  }
  for (const room of rooms) {
    const list = byRoom.get(room.id);
    if (!list || !list.length) continue;
    seen.add(room.id);
    groups.push(fEl('section', {}, [
      fEl('h2', { class: 'kicker', text: room.label || room.id }),
      fEl('ul', {}, list.map((t) => fEl('li', {}, [
        fEl('a', { class: 'tool-row', href: fStamp(t.url), rel: 'noopener' }, [
          fEl('span', { class: 'tool-row-name', text: t.label || t.slug }),
          t.blurb ? fEl('span', { class: 'tool-row-blurb', text: t.blurb }) : null
        ])
      ])))
    ]));
  }
  
  for (const [roomId, list] of byRoom) {
    if (seen.has(roomId)) continue;
    groups.push(fEl('section', {}, [
      fEl('h2', { class: 'kicker', text: roomId }),
      fEl('ul', {}, list.map((t) => fEl('li', {}, [
        fEl('a', { class: 'tool-row', href: fStamp(t.url), rel: 'noopener',
                   text: t.label || t.slug })
      ])))
    ]));
  }

  if (!groups.length) {
    groups.push(fEl('p', { class: 'micro', text:
      'The tool list is not in this page either. Reload to fetch a fresh copy of the site.' }));
  }

  main.replaceChildren(fEl('div', { class: 'floor' }, [head, ...groups]));
  
  try { main.focus({ preventScroll: true }); } catch {   }
}

async function start() {
  const view = decide();
  document.documentElement.dataset.view = view;
  normaliseToolParam();
  if (view === 'pocket') {
    const mod = await load.pocket();
    return mod.boot();
  }
  const mod = await load.cinema();
  addWayBack();
  return mod.boot();
}



function boot() {
  let p;
  try { p = start(); }
  catch (err) { renderFloor(err); return; }
  if (p && typeof p.catch === 'function') p.catch(renderFloor);
}



if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
