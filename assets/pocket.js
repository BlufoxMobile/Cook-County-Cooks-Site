/* =============================================================================
 * Cook County Cooks — assets/pocket.js
 * THE POCKET LIST  ·  what a phone gets instead of the restaurant
 * -----------------------------------------------------------------------------
 * The client, on the shipped site: "The mobile site just looks super rough, if
 * I'm honest." He asked about a separate m. subdomain and chose this instead:
 *
 *   "On a phone, serve a fast flat tool list. Same URL. Detected automatically."
 *   "the dropdown of the tools that people could access on their phone ...
 *    I don't necessarily need the extras."
 *
 * So: no rooms, no photography, no head-chef wall, no live boards. The tools,
 * and nothing else, on one scrolling page a rep opens on a shop floor to get to
 * a quote sheet in under two seconds.
 *
 * ── THE ONE RULE THIS FILE EXISTS UNDER ─────────────────────────────────────
 * THERE IS EXACTLY ONE TOOL LIST IN THIS CODEBASE, AND IT IS data/tools.json.
 * The reason we are not building an m-dot site is that the client edits that
 * file weekly and a second list would silently go stale. So nothing below names
 * a tool, a URL or a room: this module reads the same inline __CCC_INLINE__
 * bootstrap the cinema reads, through the same fallback fetch of the same file,
 * groups by the same ROOM_ORDER, and opens the same sealed envelope through the
 * same coldgate.js. Adding a tool to data/tools.json and rebuilding puts it on
 * the phone with no other edit. If you find yourself typing a tool's name into
 * this file, stop — you are about to build the thing we decided not to build.
 *
 * ── WHAT IT DELIBERATELY DOES NOT SHOW, AND WHY ─────────────────────────────
 *   the room taglines   The client already had these taken off the rooms: "I
 *                       want those types of descriptions to be removed on every
 *                       page" (see the note over buildRail() in cinema.js). A
 *                       room here is a grouping label, not a place. Seven
 *                       taglines would wrap to two lines each on a 393px phone
 *                       and push the first tool 250px down the page.
 *   the blurbs, at rest 24 tools with two-line blurbs is 2,400px of scrolling;
 *                       24 names is 1,350px. The names are self-describing
 *                       ("Internet Quote Sheet"), so the blurb is dead weight
 *                       until you are searching — at which point it is the
 *                       opposite, because it is half of what the search matched
 *                       against and it is what explains a non-obvious hit. So
 *                       blurbs appear ON MATCHES ONLY. Same data, shown where
 *                       it earns its line.
 *
 * ── WHY THE ROWS ARE PLAIN LINKS IN THE SAME TAB ────────────────────────────
 * Every row is a real <a href> with a real URL, so long-press, "copy link",
 * "open in new tab" and a screen reader's link list all behave. There is no
 * target="_blank": on a phone a new tab is a tab the rep then has to find their
 * way out of, whereas a same-tab navigation makes the system Back gesture the
 * way back to the list — and iOS restores the page, search text and all, from
 * the back/forward cache.
 *
 * TOOLS OPEN INSIDE THE SITE, IN THE SAME FRAMED VIEWER THE DESKTOP USES.
 * The first cut of this file shipped rows that navigated straight out to
 * blufoxmobile.github.io, on the reasoning that the system Back gesture is a
 * better "close" than any button we could draw. The client's answer was that
 * leaving the site is the problem, not the ergonomics of coming back: "I want
 * to have these repositories baked into the site, not opening with the external
 * link." He is right, and the desktop had always behaved that way — a phone
 * doing something different was an inconsistency nobody asked for.
 *
 * overlay.js turns out to import nothing but freshurl.js and to inject its own
 * styles, so the phone can mount the identical viewer rather than growing a
 * second one. It also already delegates clicks on [data-tool] and owns the
 * `#/tool/<slug>` history entry, so a row here is the same kind of object a
 * hotspot is in the cinema, and Back still closes the tool — the gesture the
 * external-link version was written to preserve is preserved anyway.
 *
 * The href is the INTERNAL deep link, not the repository URL, so "copy link"
 * hands someone a cookcountycooks.com address that opens the tool in the site
 * rather than a bare github.io one. v15: THAT IS NOW TRUE, AND STAYS TRUE.
 * For two builds the paragraph above was the intent and restamp() was the
 * fact: it rewrote every row's href to freshUrl(data-url) — the stamped
 * repository URL — on every render, so a long-press on a phone copied the
 * repository after all. The client has since asked that reps never see where
 * the tools are hosted, so the rewrite is gone, data-url is gone with it, and
 * the stamp is minted where it has always mattered: on the viewer's frame,
 * on every open. A ⌘-click on a row opens cookcountycooks.com with the tool
 * framed — a fresh copy, because that open stamps its own frame.
 * ========================================================================== */

import { el, fill, $ } from './dom.js';
import { initOverlay } from './overlay.js';
import { ROOM_ORDER } from './roomorder.js';
import {
  initColdGate, setAdopt, coldTools, isFreezerUnlocked, sealedCount,
  onFreezerUnlock, openKeypad
} from './coldgate.js';
import { buildIndex, query as findQuery, touchesFreezer, readRecent, mountFind } from './find.js';


/* ─────────────────────────────────────────────────────────────────────────────
 * 1 · DATA — the same two paths the cinema uses, and no third one
 * ────────────────────────────────────────────────────────────────────────── */

/** index.html inlines tools.json on window.__CCC_INLINE__ because fetch()
 *  against a file:// URL is CORS-blocked and the client reviews builds straight
 *  off a USB stick. The fetch is the fallback for a served deployment whose
 *  inline block was removed. NOTE: the pocket list does NOT read
 *  __CCC_INLINE__.headchefs — there is no chef wall here, so the 13 KB of head
 *  chef data and the three photographs are never touched. */
async function loadTools() {
  const inline = window.__CCC_INLINE__;
  if (inline && inline.tools) return inline.tools;
  const res = await fetch('data/tools.json');
  return res.json();
}

/**
 * Group the tools by room.
 *
 * ROOM_ORDER is the spine because it is the order of the restaurant and the
 * order every other surface on this site uses. But it is NOT the room registry
 * — data/tools.json is — so any room that appears there and not in ROOM_ORDER
 * is appended in file order rather than dropped. That matters for the one rule
 * above: a new room added to tools.json must reach the phone without a second
 * edit, even before anyone updates the walk-through's geometry.
 */
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


/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · SEARCH — find.js's matcher, the same one the desktop and iPad use
 *
 * The phone used to have its own: a folded substring AND over label + blurb,
 * with no aliases and no punctuation folding, so the floor's own words failed
 * — "dsr" found nothing, "tsheet" missed "T-Sheet", and "yc", "cli", "wtw" and
 * "comp" all came back empty. It now asks find.js, which indexes the same array
 * with the aliases from the tool list, folds "t-sheet" into "tsheet", and
 * ranks — so a phone and a desk rank every query identically.
 *
 * Under a query the list is one ranked column, best first, each row its name
 * and its room. The blurb is still searched ("trade-in" is in no tool's name)
 * but no longer shown: the rest of the site dropped descriptions under titles,
 * and a room is what tells a rep where the tool lives.
 * ────────────────────────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────────────────────────
 * 3 · MARKUP
 * ────────────────────────────────────────────────────────────────────────── */

/* The C³ mark, copied from cinema.js so the two headers wear the same fox.
   It is a path, not a tool, not a URL and not a room — the one-list rule is
   about data/tools.json. */
const FOX_SVG =
  '<svg class="c3-fox" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M3 3l3.6 3.2h10.8L21 3l-1 7.6a8 8 0 0 1-8 8 8 8 0 0 1-8-8z"/>' +
  '<path d="M9 11.2h.01M15 11.2h.01"/><path d="M12 14.2l-1.4 1.2h2.8z"/></svg>';

/**
 * One row.
 *
 * The href is the site's own deep link and nothing ever rewrites it. The
 * freshness the client asked for ("essentially, it would be a fresh load every
 * time we pull up the repository") is delivered by the viewer, which stamps
 * its frame's src with freshUrl() on every open — including the open that a
 * ⌘-click or a pasted link produces, since both land on `#/tool/<slug>` and
 * go through the same openTool(). There is no path from this row to the
 * repository address: not the href, not a data attribute (data-url is gone),
 * not a long-press.
 */
function toolRow(tool) {
  const a = el('a', {
    class: 'tool-row pocket-row',
    // The deep-link shape overlay.js §8 owns, and the row needs no handler of
    // its own because §9 delegates the click off data-tool.
    href: `#/tool/${encodeURIComponent(tool.slug)}`,
    'data-tool': tool.slug,
    'data-slug': tool.slug,
    // AN EXPLICIT NAME, because the computed one was wrong. The name and the
    // blurb are two sibling <span>s with no text node between them, and the
    // accessible-name algorithm concatenates element children with NO
    // separator: VoiceOver read "6th Gen Mobile Quote SheetBuild a full
    // Xfinity Mobile quote" — one run-on word at the join. Putting a text node
    // between them would make it a third grid item and add a row to the layout.
    // An aria-label fixes the join, is unaffected by the blurb being display:
    // none at rest (so the description is announced whether or not it is on
    // screen), and still contains the visible label verbatim, which is what
    // WCAG 2.5.3 Label in Name asks for.
    'aria-label': tool.blurb ? `${tool.label}. ${tool.blurb}` : tool.label
  }, [
    el('span', { class: 'tool-row-name', text: tool.label }),
    // Rendered always, hidden by CSS unless the list is searching (theme.css
    // §19), so a match does not have to rebuild the row.
    tool.blurb ? el('span', { class: 'tool-row-blurb', text: tool.blurb }) : null
  ]);
  return el('li', {}, [a]);
}

/** One ranked search result: the name, and the room it lives in. */
function resultRow(tool, roomLabel) {
  const a = el('a', {
    class: 'tool-row pocket-row',
    href: `#/tool/${encodeURIComponent(tool.slug)}`,
    'data-tool': tool.slug,
    'data-slug': tool.slug,
    'aria-label': roomLabel ? `${tool.label}, ${roomLabel}` : tool.label
  }, [
    el('span', { class: 'tool-row-name', text: tool.label }),
    // the second line of the row, which theme.css §19 shows while searching
    roomLabel ? el('span', { class: 'tool-row-blurb', text: roomLabel }) : null
  ]);
  return el('li', {}, [a]);
}

/** The walk-in's one row while it is shut. It names a COUNT and nothing else:
 *  the thirteen labels are ciphertext until a code decrypts them, and this row
 *  is rendered from the envelope's public `count` field exactly as the C³
 *  menu's locked row is. */
function lockRow(count) {
  return el('li', {}, [
    el('button', {
      type: 'button', class: 'tool-row pocket-row pocket-lock',
      'data-freezer-lock': '',
      // Same reason as the tool rows above: two sibling spans, no separator.
      'aria-label': `Manager tools — enter code. ${count} in the Walk-In Freezer.`
    }, [
      // One wording for the one lock, everywhere (cinema.js LOCK_WORDS).
      el('span', { class: 'tool-row-name', text: 'Manager tools — enter code' }),
      el('span', { class: 'micro', text: `${count} in the Walk-In Freezer` })
    ])
  ]);
}


/* ─────────────────────────────────────────────────────────────────────────────
 * 4 · BOOT
 * ────────────────────────────────────────────────────────────────────────── */

export async function boot() {
  const doc = await loadTools();
  const data = indexTools(doc);

  const root = $('#kitchen');
  const rail = $('#ticket-rail');
  const footer = $('#site-footer');
  // The cinema's mount points stay in the document — the <noscript> index
  // inside #site-footer is the genuinely-no-JS path and must not be removed —
  // but nothing in the pocket build renders into them.
  if (rail) rail.hidden = true;
  if (footer) footer.hidden = true;

  /* ---- the cold-storage gate, before any markup -------------------------
   * Same order as the cinema, for the same reason: every surface below asks
   * isFreezerUnlocked() and sealedCount() as it renders. */
  let overlayApi = null;              // set below; adopt reads it lazily
  setAdopt((tools) => {
    const room = data.byRoom.get('freezer') || [];
    for (const tool of tools) {
      if (data.bySlug.has(tool.slug)) continue;
      data.tools.push(tool);
      data.bySlug.set(tool.slug, tool);
      room.push(tool);
      /* ⚠ THE LINE THAT MAKES THE THIRTEEN OPENABLE, and the one this function
         was missing. overlay.js resolves a slug through its own registry Map
         inside openTool(); that Map is populated once, from the `tools` array
         handed to initOverlay(), and at that moment the freezer is ciphertext.
         So every sealed row rendered correctly, carried the right label and the
         right href, and did NOTHING when tapped — the viewer had never heard of
         the slug. cinema.js has carried this line (and a comment saying why)
         since deep links were added; pocket.js did not, because when it was
         written a phone had no framed viewer to register anything with. When
         v12 gave it one, this is what was left behind.

         Two paths reach the registry and BOTH are needed: a fresh unlock runs
         adopt after initOverlay, so it must write the entry here; a session
         restore runs adopt inside initColdGate() BELOW, before the viewer
         exists, and is covered because initOverlay is handed data.tools after
         that call and therefore already contains the fourteen. */
      if (overlayApi && overlayApi.registry) overlayApi.registry.set(tool.slug, tool);
    }
    data.byRoom.set('freezer', room);
  });
  await initColdGate();

  /* ---- the header ------------------------------------------------------- */
  /* THE PLACEHOLDER IS NOT THE LABEL. It disappears the moment a character is
     typed, which on a phone — where this field is the ONLY way to find a tool —
     leaves an unlabelled box with text in it. The real <label> is a few lines
     down in `bar`, visually hidden and wired with `for`, so the name survives
     the first keystroke and a screen reader announces the field on entry. The
     placeholder stays as the short visual hint it is good at being.

     inputmode="search": the field is `type="search"` but there is no form and
     nothing to submit, and type alone does not choose the on-screen keyboard.
     `search` gets the plain keyboard with a search action key on both iOS and
     Android — with `enterkeyhint="done"` overriding what that key SAYS, because
     the list is already filtered by the time it is pressed and the useful thing
     for it to do is dismiss the keyboard rather than promise a round trip.

     autocomplete is NOT set to "off" any more, on purpose. It was doing nothing
     it was meant to do: there is no form and no submission here, so the browser
     has no search history to offer and nothing to suppress — while `off` is
     also the switch some platforms read as "suppress the suggestion strip",
     which is the row a rep using dictation or a word-prediction keyboard leans
     on. Everything that WAS pulling its weight — autocorrect, autocapitalize
     and spellcheck all off, so "BAPIS" and "PortPro" are not helpfully
     rewritten — stays exactly as it was. */
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

  /* THE SEARCH BAR IS A SIBLING OF THE HEADER, NOT A CHILD OF IT, and that is
     load-bearing rather than tidy. `position: sticky` sticks within its nearest
     scrolling ancestor BUT ONLY FOR AS LONG AS ITS CONTAINING BLOCK IS ON
     SCREEN. Nested inside .pocket-head it stuck to the top of the header and
     then left with it — which looked right for the first 200px and then the
     field was simply gone for the remaining two screens of list. Verified on a
     phone in landscape (852x393), where the header is most of the viewport and
     the bug is impossible to miss. As a direct child of .pocket its containing
     block is the whole list, so it stays. */
  const bar = el('div', { class: 'pocket-bar' }, [
    el('label', { class: 'visually-hidden', for: 'pocket-q', text: 'Search tools by name or description' }),
    el('div', { class: 'pocket-field' }, [search, clear]),
    count
  ]);

  const results = el('div', { class: 'pocket-results', id: 'pocket-list', tabindex: '-1' });
  const empty = el('div', { class: 'pocket-empty', hidden: true });

  const foot = el('footer', { class: 'pocket-foot' }, [
    el('hr', { class: 'rule' }),
    // THE ESCAPE HATCH. A real link with a real href, so it works with JS half
    // dead and can be sent to someone; the click handler only adds the memory.
    el('a', {
      class: 'pocket-escape', href: '?view=full',
      // Two sibling spans with no separator ran the name on
      // ("…restaurantThe photographed…"); same fix as the rows.
      'aria-label': 'View the full restaurant. The photographed walk-through. Heavier — best on wifi.'
    }, [
      el('span', { text: 'View the full restaurant' }),
      el('span', { class: 'micro', text: 'The photographed walk-through. Heavier — best on wifi.' })
    ]),
    el('p', { class: 'micro pocket-colophon' })
  ]);
  foot.querySelector('.pocket-escape').addEventListener('click', () => {
    try { localStorage.setItem('ccc-view', 'full'); } catch { /* storage disabled:
      the ?view=full in the href still carries the choice for this visit */ }
  });

  fill(root, [el('div', { class: 'pocket' }, [head, bar, results, empty, foot])]);

  /* THE SKIP LINK. index.html ships "Skip to the kitchen" -> #kitchen, which is
     right for the walk-through and useless here: the header it would skip is
     INSIDE #kitchen, so the link skips nothing at all. Re-point it at the list
     and rename it. Done from JS rather than by editing index.html because the
     markup there belongs to the cinema and a phone is the only reader of this
     version. */
  const skip = $('.skip-link');
  if (skip) { skip.setAttribute('href', '#pocket-list'); skip.textContent = 'Skip to the tool list'; }

  document.documentElement.dataset.pocketReady = '1';

  /* ---- rendering -------------------------------------------------------- */
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
        // While the walk-in is shut its array is EMPTY — the thirteen are
        // ciphertext — so it cannot be skipped for being empty or the locked
        // row disappears with them.
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
      // Ranked, best first. The locked row answers a query that reaches for
      // the walk-in (its name, "manager", "keypad", "code"…) and never one
      // that happens to name something inside it: while it is shut the index
      // holds nothing from inside it.
      const results = findQuery(index, query, { recent: readRecent() });
      const items = results.map((r) => resultRow(r.tool, r.entry.room.label));
      // A weak lock word ("locked out", "code") only counts when no tool
      // answered — "locked out" is BP access, not the walk-in.
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
      /* No "manager tools are still in the walk-in" line here any more (v29
         fix round, G2 M3): a query that reaches for the walk-in gets the lock
         row above instead of this empty state, so under every other miss that
         line only told a new hire that the flyer they wanted was locked away. */
      fill(empty, [
        el('p', { class: 'pocket-empty-line', text: `Nothing here is called “${query.trim()}”.` }),
        el('button', { type: 'button', class: 'chip', 'data-act': 'clear', text: 'Clear search' })
      ]);
    }
    clear.hidden = !query;
    // The count a rep can open, as in the header — not public + sealed (the
    // footer said 42 under a header that said 29; G3 nit).
    foot.querySelector('.pocket-colophon').textContent =
      `Cook County Cooks · ${open} tools across ${data.rooms.length} rooms · Blufox C³`;

  }

  render();

  /* ---- interaction ------------------------------------------------------ */
  search.addEventListener('input', () => { query = search.value; render(); });
  clear.addEventListener('click', () => {
    query = ''; search.value = ''; render(); search.focus();
  });
  empty.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-act="clear"]')) return;
    query = ''; search.value = ''; render(); search.focus();
  });
  // A search field's own clear affordance fires `search`, not `input`, in
  // WebKit when it is dismissed with the keyboard.
  search.addEventListener('search', () => { query = search.value; render(); });

  // Every lock affordance is one delegated handler, exactly as in the cinema.
  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest && ev.target.closest('[data-freezer-lock]');
    if (!trigger) return;
    ev.preventDefault();
    if (isFreezerUnlocked()) return;
    openKeypad();
  });
  onFreezerUnlock(() => { index = buildIndex(data.tools, data.rooms); render(); });

  /* `/` (and Ctrl-K / ⌘K) put a hardware keyboard in the search field, the
     same keys that open Find on a desk. With a tool open over the list the
     field is underneath it, so find.js puts its palette up instead — which is
     also where the viewer's own Find button lands (contract C4). */
  const focusField = () => {
    if (overlayApi && overlayApi.isOpen()) return false;
    try { search.focus({ preventScroll: true }); } catch { search.focus(); }
    try { search.select(); } catch { /* noop */ }
    return true;
  };

  /* ---- keeping the links fresh ------------------------------------------
   * There is nothing to keep fresh any more. v12–v14 re-stamped every row's
   * href with freshUrl() at render, on visibilitychange and on pageshow, so a
   * list left open since the morning would not hand out the morning's stamp.
   * The rows no longer carry a stamped URL at all (see toolRow()), so the
   * staleness lives in exactly one place — the viewer's frame — and the viewer
   * mints its stamp at the moment of each open. Nothing here to do. */

  /* The sealed thirteen. While the walk-in is shut coldTools() is empty and
     every unknown slug is gated, which is what keeps a typed deep link from
     confirming that a guessed name is real. Once it is open the set is empty
     and nothing is gated. */
  function gatedSlugs() {
    if (isFreezerUnlocked()) return new Set();
    // Everything the open list does NOT contain — so the twenty-four open
    // tools pass, and both a sealed slug and an invented one are refused
    // identically. data.bySlug holds only what is currently listable.
    return { has: (slug) => !data.bySlug.has(slug) };
  }

  /* ---- the framed viewer ------------------------------------------------
   * The SAME overlay the cinema mounts, with the SAME gate. It owns the
   * `#/tool/<slug>` history entry, the delegated [data-tool] click, keyboard
   * activation, focus handling and the deep link on load — so everything this
   * block used to do by hand is now one call, and a phone and a desktop cannot
   * drift apart in how a tool opens.
   *
   * canOpen is re-read on EVERY path in (click, keyboard, deep link, hash
   * sync, programmatic), which is what makes `#/tool/<a sealed slug>` typed
   * into the address bar hit the keypad instead of the tool. There is no
   * freezer DOOR on a phone — that set piece belongs to the cinema — so the
   * retry runs as soon as the code is accepted, with no whenOpen() to wait on.
   *
   * A slug this build has never heard of, while the walk-in is shut, is
   * refused exactly as a sealed one is: the keypad comes up and NEVER confirms
   * whether the slug was one of the thirteen. */
  overlayApi = initOverlay({
    // Straight in, no fetch, so a deep link resolves on the first frame.
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

  /* A SLUG THE OVERLAY HAS NEVER HEARD OF STILL HAS TO REACH THE KEYPAD.
   * canOpen only runs for slugs that are IN the registry, and while the
   * walk-in is shut the sealed thirteen are not in it — they are ciphertext.
   * So `#/tool/<a sealed slug>` typed into the address bar falls off the end
   * of overlay.js §8 and does nothing at all, while `#/tool/<an open slug>`
   * opens a tool. That difference is itself the answer to "is this name one of
   * the thirteen?", which is the question the walk-in exists not to answer.
   *
   * This is the same job cinema.js does in watchSealedDeepLink, and it was in
   * this file too until the framed viewer replaced the hand-rolled deep-link
   * handler; it is restored here rather than left to the overlay because the
   * overlay cannot gate on a slug it does not have. An unknown slug and a
   * sealed one now behave identically: hash stripped, keypad up, and only a
   * correct code tells them apart. */
  function catchSealedDeepLink(ev) {
    const m = /^#\/tool\/([^/?#]+)/.exec(location.hash || '');
    if (!m) return;
    let raw; try { raw = decodeURIComponent(m[1]); } catch { raw = m[1]; }
    // Contract C7: case-insensitive. `#/tool/NPS` is NPS, not the keypad.
    const slug = raw.toLowerCase();
    if (data.bySlug.has(slug)) {            // the overlay has this one
      if (slug !== raw) {
        try {
          history.replaceState(history.state, '',
            `${location.pathname}${location.search}#/tool/${encodeURIComponent(slug)}`);
        } catch { /* noop */ }
        if (ev && !overlayApi.isOpen()) overlayApi.open(slug, { history: false });
      }
      return;
    }
    if (isFreezerUnlocked()) return;        // open, and genuinely unknown
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch { /* noop */ }
    openKeypad().then((ok) => {
      // coldTools() has re-populated data.bySlug via the unlock listener by
      // the time this resolves, so a sealed slug now opens and an invented one
      // still does not — without either having been confirmed beforehand.
      if (ok && data.bySlug.has(slug)) overlayApi.open(slug);
    });
  }
  window.addEventListener('hashchange', catchSealedDeepLink);
  catchSealedDeepLink();

  /* A `#room-<id>` link (a shared ticket, a ⌘-clicked one from a desk) lands
     on that room's group here, as it lands on the room in the cinema. The
     scroll-padding in theme.css clears the sticky search bar. */
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

  // A tiny handle for debugging in a store, matching the cinema's window.CCC.
  window.CCC = Object.assign(window.CCC || {}, { view: 'pocket', data, render });
}
