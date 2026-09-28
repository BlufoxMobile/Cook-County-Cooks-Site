// Big, readable cards for the table games — an HTML layer over the 3D felt.
//
// WHY THIS EXISTS. The 3D cards lie flat on the felt and the camera sits
// behind the player's seat, so every card in the middle of the table is seen
// at a glancing angle, foreshortened to a sliver and lit by the key light's
// hot spot. On a laptop the Hold'em flop drew ~30px wide and on a phone
// ~20px — unreadable (the client: "I can't see them at all from my phone").
// The 3D cards still deal, fly and flip for the theatre; the moment one is
// face up, its twin appears here, upright, flat to the screen, as large as the
// screen allows, with a JUMBO index (rank + suit as big as the card allows) so
// it reads from arm's length. Suits are inline SVG — never a font glyph, which
// iOS turns into an emoji.
//
// A group is placed with the HUD's 3D anchors (js/core/hud.mjs), so it tracks
// the camera through close-ups and orientation changes.
//
//   const big = new BigCards(hud);
//   big.show('board', worldVec3, [{r:14,s:0}, {r:10,s:1}, null, {ghost:true}], { size:'lg' });
//   big.mark('board', (c, i) => i < 2 ? 'win' : 'dim');   // showdown
//   big.hide('board');  big.clear();
//
// Cards are {r, s} with r 2..14 (14 = ace; 1 also reads as ace) and s 0 ♠ 1 ♥ 2 ♦ 3 ♣.
// `null` (or {down:true}) is a face-down card; {ghost:true} an empty outlined slot.

const SUIT = [
  // spade, heart, diamond, club — same drawings as the 3D cards (core/textures.mjs)
  '<path d="M50 4C50 4 6 40 6 60C6 76 19 86 33 85C41 84 46 80 48 76C47 86 42 93 33 97L67 97C58 93 53 86 52 76C54 80 59 84 67 85C81 86 94 76 94 60C94 40 50 4 50 4Z"/>',
  '<path d="M50 94C50 94 5 62 5 33C5 16 17 6 30 6C40 6 47 12 50 21C53 12 60 6 70 6C83 6 95 16 95 33C95 62 50 94 50 94Z"/>',
  '<path d="M50 3C60 20 74 36 90 50C74 64 60 80 50 97C40 80 26 64 10 50C26 36 40 20 50 3Z"/>',
  '<circle cx="50" cy="27" r="21"/><circle cx="27" cy="57" r="21"/><circle cx="73" cy="57" r="21"/><circle cx="50" cy="50" r="12"/><path d="M45 58C45 78 39 89 30 96L70 96C61 89 55 78 55 58Z"/>'
];
const svg = s => `<svg viewBox="0 0 100 100" aria-hidden="true">${SUIT[s]}</svg>`;
const RANK = r => r === 14 || r === 1 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r);
const WORD = ['spades', 'hearts', 'diamonds', 'clubs'];
const RWORD = r => ({ 14: 'ace', 1: 'ace', 13: 'king', 12: 'queen', 11: 'jack' })[r] || String(r);
const key = c => c?.ghost ? 'ghost' : c && !c.down ? `${c.r}:${c.s}` : 'down';

export function bigCardHTML(c, cls = '') {
  if (c?.ghost) return `<div class="bc ghost" aria-hidden="true"></div>`;
  if (!c || c.down) return `<div class="bc down ${cls}" aria-label="face-down card"><i class="bc-back"><b>C<sup>3</sup></b></i></div>`;
  const red = c.s === 1 || c.s === 2;
  return `<div class="bc${red ? ' red' : ''} ${cls}" role="img" aria-label="${RWORD(c.r)} of ${WORD[c.s]}">`
    + `<b class="bc-r">${RANK(c.r)}</b><i class="bc-s">${svg(c.s)}</i><i class="bc-b">${svg(c.s)}</i></div>`;
}

const CSS = `
.anchor.bc-anchor{z-index:3;white-space:normal}
.bc-wrap{display:flex;flex-direction:column;align-items:center;gap:6px;transform:translateY(var(--bc-dy,0));pointer-events:none}
.bc-row{display:flex;align-items:flex-start;gap:var(--bc-gap,6px)}
.bc-fan .bc + .bc{margin-left:calc(var(--bc-w) * -.36)}
.bc-cap{padding:4px 12px;border-radius:999px;font:800 12px/1.2 var(--text);letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;
  color:var(--cream);background:rgba(5,6,8,.86);box-shadow:inset 0 0 0 1px rgba(227,199,126,.35),0 6px 18px rgba(0,0,0,.5)}
.bc-cap:empty{display:none}
.bc-cap b{color:var(--gold-hi);font-size:14px;letter-spacing:.04em;margin-left:6px}
.bc-cap.win{background:linear-gradient(180deg,#b8f5c7,#5ec47d);color:#06220f;box-shadow:0 0 18px rgba(94,196,125,.45)}
.bc-cap.win b{color:#06220f}
.bc-cap.bust{background:rgba(60,8,12,.9);color:#ffb3ad;box-shadow:inset 0 0 0 1px rgba(255,120,110,.5)}
.bc-cap.bust b{color:#ffd5d0}
.bc-cap.gold{background:linear-gradient(180deg,#f6e2a6,#c89a47);color:#1e1405}
.bc-cap.gold b{color:#1e1405}

/* sizes — as large as the screen allows; phones in portrait get their own */
.bc-lg{--bc-w:clamp(54px, min(8.6vw, 14.5vh), 122px);--bc-gap:clamp(5px,.8vw,10px)}
.bc-md{--bc-w:clamp(50px, min(7.4vw, 13.5vh), 110px)}
.bc-sm{--bc-w:clamp(34px, min(3.6vw, 7vh), 56px);--bc-gap:3px}
@media (max-aspect-ratio: 9/10){
  .bc-lg{--bc-w:min(14.4vw, 10.5vh, 86px);--bc-gap:4px}
  .bc-md{--bc-w:min(15vw, 9.5vh, 76px)}
  .bc-sm{--bc-w:min(9.5vw, 6vh, 44px)}
}

.bc{position:relative;flex:none;width:var(--bc-w);height:calc(var(--bc-w) * 1.4);border-radius:calc(var(--bc-w) * .085);overflow:hidden;
  color:#16171b;background:linear-gradient(170deg,#fffefb 0%,#f6f1e6 62%,#ece5d6 100%);
  box-shadow:0 0 0 1px rgba(0,0,0,.25),inset 0 0 0 calc(var(--bc-w) * .018) rgba(184,145,74,.35),0 calc(var(--bc-w) * .1) calc(var(--bc-w) * .28) rgba(0,0,0,.6);
  transition:transform .3s cubic-bezier(.2,.9,.3,1.3),opacity .3s,filter .3s,box-shadow .3s}
.bc.red{color:#c3172b}
.bc-r{position:absolute;left:8%;top:3%;font:800 calc(var(--bc-w) * .46)/1 var(--text);letter-spacing:-.05em;font-variant-numeric:lining-nums}
.bc-s{position:absolute;left:9%;top:39%;width:28%;height:20%}
.bc-b{position:absolute;right:7%;bottom:5%;width:50%;height:36%}
.bc svg{display:block;width:100%;height:100%;fill:currentColor}
.bc.ghost{background:rgba(0,0,0,.14);box-shadow:inset 0 0 0 1.5px rgba(236,214,160,.38);opacity:.9}
.bc.down{background:linear-gradient(160deg,#1c2b52,#0e1732)}
.bc-back{position:absolute;inset:7%;border-radius:calc(var(--bc-w) * .05);display:grid;place-items:center;
  box-shadow:inset 0 0 0 calc(var(--bc-w) * .02) #c8a55a;
  background:repeating-linear-gradient(45deg,rgba(200,165,90,.16) 0 2px,transparent 2px 7px)}
.bc-back b{font:italic 700 calc(var(--bc-w) * .3)/1 var(--display);color:#e3c77e}
.bc-back sup{font-size:.55em}
.bc.in{animation:bcIn .42s cubic-bezier(.2,.9,.3,1.25) both}
@keyframes bcIn{0%{opacity:0;transform:translateY(-14%) rotateY(80deg) scale(.8)}100%{opacity:1;transform:none}}
.bc.win{transform:translateY(-9%);box-shadow:0 0 0 2px #f3dc9b,0 0 26px rgba(243,220,155,.75),0 calc(var(--bc-w) * .12) calc(var(--bc-w) * .3) rgba(0,0,0,.6)}
.bc.dim{opacity:.42;filter:saturate(.4)}
.bc-wrap.out,.bc-wrap.veil{opacity:0;transition:opacity .35s}
.bc-cap.bare{padding:0;background:none;box-shadow:none;border-radius:0}
@media (prefers-reduced-motion: reduce){ .bc.in{animation:none} .bc{transition:none} }
`;
let cssDone = false;
function injectCSS() {
  if (cssDone || document.getElementById('css-bigcards')) { cssDone = true; return; }
  const st = document.createElement('style'); st.id = 'css-bigcards'; st.textContent = CSS; document.head.append(st); cssDone = true;
}

export class BigCards {
  constructor(hud) { this.hud = hud; this.groups = new Map(); injectCSS(); }

  /**
   * Show (or update) a group of cards at a point on the table.
   * opts: size 'lg'|'md'|'sm', fan (overlap like a held hand), caption (HTML),
   *       capCls ('win'|'bust'|'gold'), capFirst (caption above the cards), dy (CSS length, nudges the group).
   */
  show(id, world, cards, opts = {}) {
    const { size = 'md', fan = false, caption = '', capCls = '', capFirst = false, dy = '0px' } = opts;
    let g = this.groups.get(id);
    const el = this.hud.anchor('bc-' + id, world, '', `bc-anchor bc-${size}`);
    if (!g || g.el !== el || !el.firstChild) {
      el.innerHTML = `<div class="bc-wrap"><div class="bc-cap"></div><div class="bc-row"></div></div>`;
      g = { el, wrap: el.firstChild, cap: el.querySelector('.bc-cap'), row: el.querySelector('.bc-row'), keys: [] };
      this.groups.set(id, g);
    }
    g.wrap.classList.remove('out'); g.wrap.classList.toggle('veil', !!this.veiled);
    g.wrap.style.setProperty('--bc-dy', dy);
    g.wrap.style.flexDirection = capFirst ? 'column' : 'column-reverse';
    g.row.classList.toggle('bc-fan', !!fan);
    if (g.cap.innerHTML !== caption) g.cap.innerHTML = caption;
    g.cap.className = 'bc-cap ' + capCls;
    // diff: keep the cards that did not change, animate the ones that did
    const keys = cards.map(key);
    const kids = [...g.row.children];
    keys.forEach((k, i) => {
      if (g.keys[i] === k && kids[i]) return;
      const tmp = document.createElement('div'); tmp.innerHTML = bigCardHTML(cards[i], 'in');
      const node = tmp.firstChild;
      if (kids[i]) g.row.replaceChild(node, kids[i]); else g.row.append(node);
      kids[i] = node;
    });
    for (let i = kids.length - 1; i >= keys.length; i--) kids[i]?.remove();
    g.keys = keys;
    return el;
  }
  /** fn(cardIndex) -> 'win' | 'dim' | '' */
  mark(id, fn) {
    const g = this.groups.get(id); if (!g) return;
    [...g.row.children].forEach((n, i) => { const m = fn ? fn(i) : ''; n.classList.toggle('win', m === 'win'); n.classList.toggle('dim', m === 'dim'); });
  }
  caption(id, html, capCls = '') { const g = this.groups.get(id); if (!g) return; if (g.cap.innerHTML !== html) g.cap.innerHTML = html; g.cap.className = 'bc-cap ' + capCls; }
  has(id) { return this.groups.has(id); }
  /** hide every group without forgetting it (e.g. while the camera leans in for a close-up) */
  veil(on) { this.veiled = !!on; for (const g of this.groups.values()) g.wrap.classList.toggle('veil', !!on); }
  hide(id, { fade = true } = {}) {
    const g = this.groups.get(id); if (!g) return;
    this.groups.delete(id);
    if (!fade) { this.hud.unanchor('bc-' + id); return; }
    g.wrap.classList.add('out');
    setTimeout(() => { if (!this.groups.has(id)) this.hud.unanchor('bc-' + id); }, 380);
  }
  clear(opts) { for (const id of [...this.groups.keys()]) this.hide(id, opts); }
}
