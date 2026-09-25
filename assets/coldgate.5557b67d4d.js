


import { el, $ } from './dom.d7b1df3700.js';
import { loadEnvelope, unseal, restore, remember, cryptoAvailable } from './coldstore.26c122da4b.js';






const FREEZER_SESSION_KEY = 'c3f-unlocked';
const FREEZER_COOKIE = 'c3f=';

 
const unlockListeners = [];

 
let FREEZER_SEALED = null;



let COLD = null;



let ADOPT_COLD = null;



export function setAdopt(fn) { ADOPT_COLD = fn; }

export function isFreezerUnlocked() { return COLD !== null; }



export function sealedCount() {
  return (FREEZER_SEALED && +FREEZER_SEALED.count) || 0;
}





function freezerSessionHint() {
  try { if (sessionStorage.getItem(FREEZER_SESSION_KEY) === '1') return true; }
  catch {   }
  try { return document.cookie.split('; ').some((c) => c.startsWith(FREEZER_COOKIE)); }
  catch { return false; }        
}

export function onFreezerUnlock(cb) { unlockListeners.push(cb); }

 
export function markFreezerUnlocked(payload) {
  if (COLD || !payload || !payload.tools || !payload.tools.length) return;
  COLD = payload;
  if (ADOPT_COLD) { try { ADOPT_COLD(payload.tools); } catch (err) { console.error(err); } }
  unlockListeners.forEach((cb) => { try { cb(true); } catch (err) { console.error(err); } });
}



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
  } catch {   }
}

 
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

    
    
    const flagWrong = () => {
      panel.classList.remove('is-wrong');
      void panel.offsetWidth;                 
      panel.classList.add('is-wrong');
    };

    
    
    
    
    
    
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







export async function initColdGate() {
  FREEZER_SEALED = await loadEnvelope();
  if (!FREEZER_SEALED) console.warn('[coldgate] no sealed freezer payload — cold storage stays shut.');
  else if (!cryptoAvailable()) console.warn('[coldgate] no WebCrypto in this context — the keypad cannot check codes.');

  
  
  if (freezerSessionHint()) markFreezerUnlocked(restore());

  return { sealed: !!FREEZER_SEALED, cryptoOk: cryptoAvailable() };
}



export function coldTools() { return (COLD && COLD.tools) || []; }
