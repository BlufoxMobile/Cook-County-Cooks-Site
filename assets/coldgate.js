/* =============================================================================
 * Cook County Cooks — assets/coldgate.js
 * THE WALK-IN'S LOCK — ONE IMPLEMENTATION, BOTH FRONT ENDS
 * -----------------------------------------------------------------------------
 * This is §2 of the cinema integrator, lifted out whole and unchanged in
 * behaviour. It moved because the site now has two front ends — the walk-through
 * and the pocket list a phone gets — and the lock is the one thing neither of
 * them may re-implement. A second keypad is a second place to get the crypto,
 * the session restore, the focus trap or the "wrong code" wording wrong.
 *
 * The cinema imports it. The pocket list imports it. coldstore.js does the
 * actual AES-256-GCM work for both, exactly as before.
 *
 * WHAT THE CINEMA STILL OWNS AND THIS FILE DOES NOT:
 *   · the walk-in DOOR (freezer.js) — the set piece that swings open
 *   · the unlock beat, the chips rippling, the rail
 *   · overlay.js's canOpen / onRefused wiring
 * Those are cinema. This file is the lock.
 *
 * The keypad mounts into #modal-root, which index.html declares and both front
 * ends keep. Its look is theme.css §15, unchanged.
 * ========================================================================== */

import { el, $ } from './dom.js';
import { loadEnvelope, unseal, restore, remember, cryptoAvailable } from './coldstore.js';

/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · THE FREEZER GATE — NOW A LOCK, NOT A NOTICE
 *
 * v3 shipped a courtesy gate: the fourteen manager tools were in tools.json and
 * in the inline bootstrap, and the "lock" was a POST to an endpoint that did not
 * exist yet and therefore unlocked on 404. Anyone could read the fourteen URLs
 * out of View Source. The client's brief is the opposite of that:
 *
 *   "I don't want the other employees to have access to what's behind the
 *    freezer door as these tools are specifically for the managers."
 *
 * This is a static site on GitHub Pages. There is no server to ask, so the
 * answer cannot be "check with the server" — it has to be that THE DATA IS NOT
 * THERE. The fourteen ship as one AES-256-GCM blob (see coldstore.js and
 * build/seal-freezer.mjs); the password is the key. Typing it decrypts the list
 * in memory. Typing something else fails GCM's authentication tag and produces
 * nothing — no partial list, no hash to compare against, no oracle beyond
 * "that did not decrypt".
 *
 * THE CONTRACT, in full:
 *
 *   sealed    the envelope from window.__CCC_INLINE__.freezer, or a fetch of
 *             data/freezer.sealed.json. Public. Meaningless without the key.
 *   unlocked  ⇔  COLD !== null  — i.e. we are HOLDING the decrypted tools.
 *             Restored at boot from sessionStorage['c3f-cold'] when
 *             sessionStorage['c3f-unlocked'] === '1', so a reload inside the
 *             same session stays unlocked exactly as it did before.
 *   unlock    ⇔  the code decrypts the envelope. No network. No endpoint.
 *
 * WHAT CHANGED FROM THE v3 CONTRACT, ON PURPOSE:
 *   · /api/freezer-unlock is gone. There is nothing to POST to and nothing that
 *     could answer 404-means-yes.
 *   · The `c3f=` cookie is still READ, but it can no longer unlock on its own:
 *     a cookie is not a key, and without the key there is nothing to show. It
 *     now means "this session unlocked once", and the payload beside it is what
 *     actually opens the room. A cookie with no payload re-prompts, which is
 *     the honest outcome.
 *
 * WHAT THIS PROTECTS, AND WHAT IT DOES NOT — the same honest list as
 * coldstore.js's header, because this is the file people read first:
 *   · It stops a rep reading the links out of the page. There is no list.
 *   · It does not stop someone who has the password from sharing it.
 *   · It does not protect the destination tools — every one of those URLs is a
 *     public GitHub Pages site or a public Smartsheet form.
 *   · It does not hide plates/freezer.webp, the interior photograph, which is a
 *     static file at a guessable path.
 * ────────────────────────────────────────────────────────────────────────── */

/** The v3 keys, unchanged, so an unlock from earlier in this session survives.
 *  coldstore.js owns the writes; these two are here for the read below. */
const FREEZER_SESSION_KEY = 'c3f-unlocked';
const FREEZER_COOKIE = 'c3f=';

/** Subscribers re-render themselves when the door opens. */
const unlockListeners = [];

/** The sealed envelope, resolved once by initColdGate(). Public, useless alone. */
let FREEZER_SEALED = null;

/** THE DECRYPTED FOURTEEN, or null. This — not a flag, not a cookie — is what
 *  "unlocked" means. Nothing else in this file may write it. */
let COLD = null;

/** The one place the index gets mutated when the door opens, so the C³ menu,
 *  the footer, the rail and overlay.js's registry all agree — or, on a phone,
 *  the pocket list. Set by the front end through setAdopt(). */
let ADOPT_COLD = null;

/** Hand the gate the function that folds the decrypted tools into whatever
 *  index the front end is rendering from. Called once, before initColdGate(). */
export function setAdopt(fn) { ADOPT_COLD = fn; }

export function isFreezerUnlocked() { return COLD !== null; }

/** How many tools are behind the door. Public metadata on the envelope — the
 *  count is recoverable from the ciphertext's length anyway, and the locked
 *  copy has to be able to say "14" rather than invent a number. */
export function sealedCount() {
  return (FREEZER_SEALED && +FREEZER_SEALED.count) || 0;
}

/** "This session unlocked once" — the v3 signal, kept verbatim. It is a HINT
 *  used to decide whether to look for a stored payload, never an authorisation
 *  on its own. */
/* ⚠ BOTH READS ARE INSIDE THE try, AND THAT IS THE FIX.
 *  `document.cookie` is not the safe sibling of sessionStorage it looks like:
 *  reading it THROWS a SecurityError in a sandboxed iframe without
 *  allow-same-origin, and returns nothing useful (or throws, in some embedded
 *  webviews) where cookies are disabled outright. It sat on the line AFTER the
 *  catch, in the boot path, so a browser that made the storage read throw was
 *  handed straight to an unguarded one. Every other storage call site in this
 *  build is wrapped; this one was the hole. */
function freezerSessionHint() {
  try { if (sessionStorage.getItem(FREEZER_SESSION_KEY) === '1') return true; }
  catch { /* private mode / storage disabled — fall through to the cookie */ }
  try { return document.cookie.split('; ').some((c) => c.startsWith(FREEZER_COOKIE)); }
  catch { return false; }        // no cookies either: treat as locked, never throw
}

export function onFreezerUnlock(cb) { unlockListeners.push(cb); }

/** Adopt a decrypted payload and tell every surface. Idempotent. */
export function markFreezerUnlocked(payload) {
  if (COLD || !payload || !payload.tools || !payload.tools.length) return;
  COLD = payload;
  if (ADOPT_COLD) { try { ADOPT_COLD(payload.tools); } catch (err) { console.error(err); } }
  unlockListeners.forEach((cb) => { try { cb(true); } catch (err) { console.error(err); } });
}

/**
 * Try a code against the sealed envelope.
 *
 * No network, so there is no "transient error" in the v3 sense — but there IS a
 * real environment fault worth distinguishing: a browser with no WebCrypto
 * (a non-secure http:// origin) genuinely cannot check any code, and telling
 * that manager "wrong code" would send them hunting for a password they already
 * typed correctly.
 *
 * @returns {Promise<'ok'|'wrong'|'error'>}
 */
async function submitFreezerCode(code) {
  if (!code) return 'wrong';
  if (isFreezerUnlocked()) return 'ok';
  if (!FREEZER_SEALED) return 'error';
  try {
    const payload = await unseal(FREEZER_SEALED, code);
    if (!payload) return 'wrong';
    remember(payload);
    markFreezerUnlocked(payload);
    return 'ok';
  } catch (err) {
    console.error('[freezer] cannot check codes in this context:', err);
    return 'error';
  }
}

/* ── The keypad dialog ────────────────────────────────────────────────────────
 * theme.css §15 now ships the `.keypad*` component — a cold-storage access
 * panel: brushed steel, a mint LCD readout, keys that travel, and an
 * `.is-wrong` state. All presentation lives there; this function only builds
 * the structure and owns the behaviour. It mounts into #modal-root, the
 * container index.html declares for it.
 *
 * The one class this file toggles is `.is-wrong` on the panel — added when the
 * lock rejects a code, removed on the next keystroke so the alert clears the
 * moment the user starts over.
 * ───────────────────────────────────────────────────────────────────────── */

/* The keypad's secondary button. Everything else about the keypad is
   theme.css §15; this one class is new, prefixed, and grepped absent from
   theme.css. Same box as .btn (Unlock) — 44px, caps, --r-sm — in the steel
   the walk-in's other controls use; hover/focus fade a pre-painted plate
   (opacity only) and the press is the site's shared .98. */
const KEYPAD_CSS = `
.keypad-cancel {
  -webkit-appearance: none; appearance: none;
  display: inline-flex; align-items: center; justify-content: center;
  position: relative;
  min-block-size: 44px; min-inline-size: 44px;
  padding: 0 var(--sp-5, 1.25rem);
  border: 0; border-radius: var(--r-sm, 4px);
  cursor: pointer;
  font-family: var(--font-text, system-ui, sans-serif);
  font-size: var(--t--2, .75rem); font-weight: 700; font-stretch: 90%;
  letter-spacing: var(--track-caps, .1em); text-transform: uppercase; line-height: 1;
  color: var(--ice-300, #b9cbd6);
  background: rgb(159 182 196 / .06);
  box-shadow: inset 0 0 0 1px rgb(159 182 196 / .24);
  transition: transform var(--press-t, var(--m-t-2, 160ms)) var(--press-e, var(--m-ease-press, ease-out));
}
.keypad-cancel::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: rgb(159 182 196 / .12);
  opacity: 0; transition: opacity var(--m-t-2, 160ms) var(--m-ease-out, ease-out);
}
@media (hover: hover) { .keypad-cancel:hover::after { opacity: 1; } }
.keypad-cancel:focus-visible::after { opacity: 1; }
.keypad-cancel:active { transform: scale(var(--m-press, .98)); --press-t: var(--m-t-1, 90ms); }
@media (prefers-reduced-motion: reduce) { .keypad-cancel, .keypad-cancel::after { transition: none; } }
`;
let keypadCssDone = false;
function injectKeypadCss() {
  if (keypadCssDone) return;
  keypadCssDone = true;
  try {
    const st = document.createElement('style');
    st.dataset.ccc = 'keypad';
    st.textContent = KEYPAD_CSS;
    document.head.append(st);
  } catch { /* a CSP-blocked <style>: Cancel is still a working button */ }
}

/** Only ever one keypad on screen. Resolves true when the door opens. */
export function openKeypad() {
  const root = $('#modal-root');
  if (!root || root.firstChild) return Promise.resolve(false);

  return new Promise((resolve) => {
    const returnFocus = document.activeElement;

    const input = el('input', {
      type: 'password', inputmode: 'text', autocomplete: 'off',
      autocapitalize: 'off', spellcheck: 'false',
      'aria-label': 'Freezer code', class: 'keypad-readout'
    });
    const msg = el('p', { class: 'micro keypad-msg', role: 'alert', 'aria-live': 'assertive' });

    const keyBtn = (key, label) => el('button', {
      type: 'button', 'data-key': key, class: 'keypad-key', text: label
    });
    const grid = el('div', { class: 'keypad-keys' }, [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => keyBtn(String(n), String(n))),
      keyBtn('clear', 'CLR'),
      keyBtn('0', '0'),
      keyBtn('back', '⌫')
    ]);

    /* Cancel is the keypad's own SECONDARY button, not a chip (v29 fix round,
       G3 m-2): as a chip it inherited the rail's sentence-case glass-and-brass
       look and sat between two caps steel/brass buttons. It is the Unlock
       button's shape in the walk-in's steel — see KEYPAD_CSS. */
    injectKeypadCss();
    const cancel = el('button', { type: 'button', class: 'keypad-cancel', 'data-act': 'cancel', text: 'Cancel' });
    const unlock = el('button', { type: 'button', class: 'btn', 'data-act': 'unlock', text: 'Unlock' });

    const panel = el('div', {
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'keypad-title',
      class: 'keypad'
    }, [
      el('h2', { class: 't-sub', id: 'keypad-title', text: 'Walk-In Freezer' }),
      el('p', { class: 'micro', text: 'Manager tools — enter the code to open cold storage.' }),
      el('hr', { class: 'rule' }),
      input, grid, msg,
      el('div', { class: 'keypad-actions' }, [cancel, unlock])
    ]);

    const scrim = el('div', { class: 'keypad-scrim' }, [panel]);
    root.append(scrim);
    input.focus();

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown, true);
      scrim.remove();
      if (returnFocus && returnFocus.focus) returnFocus.focus();
      resolve(ok);
    };

    // Re-arm the shake: removing and re-adding the class on the next frame is
    // what makes a second wrong code animate again rather than sit still.
    const flagWrong = () => {
      panel.classList.remove('is-wrong');
      void panel.offsetWidth;                 // one deliberate reflow, off-loop
      panel.classList.add('is-wrong');
    };

    // Deriving the key is 600,000 rounds of PBKDF2 — a few hundred milliseconds
    // on a laptop, a second or two on an old store iPad, and that cost is the
    // ONLY thing standing between an attacker and a brute force, so it is not
    // getting tuned down. It does mean the dialog has to say it is working:
    // an unresponsive keypad reads as broken, and the button is already
    // aria-disabled, so the readout says so too. `busy` guards a second Enter.
    let busy = false;
    const attempt = async () => {
      if (busy) return;
      busy = true;
      panel.classList.remove('is-wrong');
      unlock.setAttribute('aria-disabled', 'true');
      msg.textContent = 'Checking the code…';
      let result;
      try { result = await submitFreezerCode(input.value.trim()); }
      finally { busy = false; unlock.removeAttribute('aria-disabled'); }
      if (result === 'ok') { finish(true); return; }
      flagWrong();
      msg.textContent = result === 'wrong'
        ? 'That code didn’t open the door. Try again.'
        : 'This browser can’t check the code here. Open the site over https.';
      input.select();
    };

    scrim.addEventListener('click', (ev) => {
      if (ev.target === scrim) { finish(false); return; }
      const key = ev.target.closest('[data-key]');
      if (key) {
        panel.classList.remove('is-wrong');
        const k = key.dataset.key;
        if (k === 'clear') input.value = '';
        else if (k === 'back') input.value = input.value.slice(0, -1);
        else input.value += k;
        input.focus();
        return;
      }
      const act = ev.target.closest('[data-act]');
      if (act && act.dataset.act === 'cancel') finish(false);
      if (act && act.dataset.act === 'unlock') attempt();
    });

    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') attempt(); });
    input.addEventListener('input', () => panel.classList.remove('is-wrong'));

    // Escape closes; Tab is trapped inside the panel so focus cannot wander out
    // to the page underneath while a modal dialog is up.
    function onKeydown(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); return; }
      if (ev.key !== 'Tab') return;
      const focusables = panel.querySelectorAll('button, input, [href]');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeydown, true);
  });
}

/* The gate is installed ON overlay.js in boot(), through its canOpen /
 * onRefused options. There used to be a capture-phase click interceptor here.
 * It is gone, because it only ever guarded CLICKS: a deep link to
 * `#/tool/<a-manager-tool>` went through overlay's own syncFromLocation() and opened
 * a manager tool with the door still shut and sessionStorage still empty. The
 * gate now sits inside openTool() itself, so every path reaches it — click,
 * keyboard, hash sync on load, and the openTool re-exported on window.CCC.
 */


/* ── Booting the gate ──────────────────────────────────────────────────────
 * Both front ends do exactly this, in exactly this order, and both did it
 * inline before there were two of them:
 *
 *   1. resolve the envelope (inline bootstrap first, then a fetch of
 *      data/freezer.sealed.json — see coldstore.js for why the inline copy has
 *      to exist at all)
 *   2. if THIS TAB unlocked earlier in the session, re-adopt the payload out of
 *      sessionStorage rather than re-running 600,000 rounds of PBKDF2
 *
 * A missing envelope is not fatal, on either front end. The freezer simply has
 * nothing in it: every surface says "locked", the keypad answers "this browser
 * can't check the code here", and nothing else is affected. A broken seal must
 * never take the restaurant — or the tool list — down with it.
 *
 * @returns {Promise<{sealed: boolean, cryptoOk: boolean}>}
 * ────────────────────────────────────────────────────────────────────────── */
export async function initColdGate() {
  FREEZER_SEALED = await loadEnvelope();
  if (!FREEZER_SEALED) console.warn('[coldgate] no sealed freezer payload — cold storage stays shut.');
  else if (!cryptoAvailable()) console.warn('[coldgate] no WebCrypto in this context — the keypad cannot check codes.');

  // Unlocked earlier in this tab: the payload is in sessionStorage, so a reload
  // stays open exactly as it did in v3 — and without re-deriving the key.
  if (freezerSessionHint()) markFreezerUnlocked(restore());

  return { sealed: !!FREEZER_SEALED, cryptoOk: cryptoAvailable() };
}

/** The decrypted tools, or an empty array while the door is shut. The pocket
 *  list re-renders from this on unlock; the cinema goes through ADOPT_COLD. */
export function coldTools() { return (COLD && COLD.tools) || []; }
