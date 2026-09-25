// Hold'em HTML: scoped CSS, opponent seat cards, the bet sizer, help sheet.
import { fmt, esc } from '../core/hud.mjs';
import { cardImageURL } from '../core/textures.mjs';
import { HAND_NAMES, LEVELS, PLAYERS } from '../rules/holdem.mjs';

export const PORTRAITS = new URL('../../assets/img/poker-player-portraits.webp', import.meta.url).href;

// Portrait atlas: five 396×793 head-and-shoulders shots side by side. For a
// round crop zoomed k× on the face, solve background-position so the face
// centre (fx, fy of one portrait) lands in the middle of the circle.
const FACE = [[.53, .30], [.49, .29], [.50, .29], [.51, .30], [.54, .28]];
export function portraitStyle(i, k = 1.55) {
  const [fx, fy] = FACE[i], W = 5 * k, H = 2 * k;           // image size in element widths (atlas is ~5:2)
  const px = (.5 - (i + fx) * k) / (1 - W), py = (.5 - fy * H) / (1 - H);
  return `background-image:url(${PORTRAITS});background-size:${(W * 100).toFixed(1)}% auto;background-position:${(px * 100).toFixed(2)}% ${(py * 100).toFixed(2)}%`;
}

export function seatHTML(i) {
  const pl = PLAYERS[i];
  return `<div class="he-box" style="--seat:${pl.color}">
    <div class="he-ph" style="${portraitStyle(i - 1)}"><i class="he-ring"></i></div>
    <div class="he-txt"><b class="he-nm">${esc(pl.name.toUpperCase())}</b><span class="he-st">0</span></div>
    <i class="he-pos"></i>
  </div><div class="he-ac"></div><div class="he-show"></div>`;
}

const cardCache = new Map();
export function cardImg(c, w = 64) {
  const k = `${c.r}:${c.s}:${w}`;
  if (!cardCache.has(k)) cardCache.set(k, cardImageURL(c.r, c.s, w));
  return cardCache.get(k);
}

export const CSS = `
.anchor.he-seat{z-index:2}
.he-seat{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;transition:opacity .35s,filter .35s}
.he-box{position:relative;display:flex;align-items:center;gap:9px;padding:4px 14px 4px 4px;border-radius:999px;
  background:linear-gradient(180deg,rgba(24,21,15,.94),rgba(7,8,10,.94));
  box-shadow:inset 0 0 0 1px rgba(227,199,126,.28),0 10px 26px rgba(0,0,0,.55);transition:box-shadow .3s,transform .3s}
.he-ph{position:relative;width:46px;height:46px;border-radius:50%;flex:none;background-color:#15130f;
  box-shadow:0 0 0 2px #0b0c0e,0 0 0 3.5px var(--seat,#9c7430)}
.he-ring{position:absolute;inset:-6px;border-radius:50%;opacity:0;
  background:conic-gradient(from 0deg,rgba(243,220,155,0) 0 30%,rgba(243,220,155,.95) 70%,#fff6d8 76%,rgba(243,220,155,0) 77%);
  -webkit-mask:radial-gradient(circle,transparent 60%,#000 62%,#000 70%,transparent 72%);mask:radial-gradient(circle,transparent 60%,#000 62%,#000 70%,transparent 72%)}
.he-seat.act .he-ring{opacity:1;animation:heSpin 1.1s linear infinite}
@keyframes heSpin{to{transform:rotate(360deg)}}
.he-txt{display:flex;flex-direction:column;line-height:1.08;min-width:58px}
.he-nm{font-size:11px;font-weight:800;letter-spacing:.16em;color:var(--cream)}
.he-st{font-size:15px;font-weight:800;color:var(--gold-hi);font-variant-numeric:tabular-nums;margin-top:2px}
.he-pos{position:absolute;top:-6px;right:-4px;min-width:22px;height:22px;padding:0 5px;border-radius:11px;display:none;place-items:center;
  font:800 10px var(--text);letter-spacing:.04em;color:#15161a;background:#f4efe3;box-shadow:0 0 0 1.5px #b8914a,0 4px 10px rgba(0,0,0,.5)}
.he-pos.on{display:grid}
.he-pos.bl{background:linear-gradient(180deg,#27406f,#142347);color:#e8eefc;box-shadow:0 0 0 1.5px #6d8fd8,0 4px 10px rgba(0,0,0,.5)}
.he-ac{min-height:20px;display:flex;align-items:center;justify-content:center}
.he-ac span{padding:3px 10px;border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  background:rgba(5,6,8,.82);box-shadow:inset 0 0 0 1px rgba(227,199,126,.3);color:var(--cream);animation:hePop .35s cubic-bezier(.2,.9,.3,1.4)}
.he-ac span.raise{background:linear-gradient(180deg,#f6e2a6,#c89a47);color:#1e1405;box-shadow:none}
.he-ac span.allin{background:linear-gradient(180deg,#ff8a7a,#b3261e);color:#fff;box-shadow:0 0 18px rgba(230,70,60,.55)}
.he-ac span.fold{color:var(--mute)}
.he-ac span.think{color:var(--gold-hi);background:rgba(5,6,8,.6)}
.he-ac span.think i{display:inline-block;width:4px;height:4px;margin-left:3px;border-radius:50%;background:currentColor;animation:heDot 1s infinite}
.he-ac span.think i:nth-child(2){animation-delay:.15s}.he-ac span.think i:nth-child(3){animation-delay:.3s}
.he-ac span.hand{background:linear-gradient(180deg,#b8f5c7,#5ec47d);color:#06220f;box-shadow:0 0 18px rgba(94,196,125,.45)}
.he-ac span.hand.lose{background:rgba(5,6,8,.85);color:var(--cream);box-shadow:inset 0 0 0 1px rgba(227,199,126,.3)}
@keyframes heDot{0%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
@keyframes hePop{0%{opacity:0;transform:scale(.6)}100%{opacity:1;transform:none}}
.he-show{display:none;gap:3px}
.he-show.on{display:flex}
.he-show img{width:30px;border-radius:3px;box-shadow:0 4px 10px rgba(0,0,0,.6);animation:hePop .35s}
.he-seat.act .he-box{box-shadow:inset 0 0 0 1.5px var(--gold-hi),0 0 30px rgba(243,220,155,.35),0 10px 26px rgba(0,0,0,.55);transform:scale(1.04)}
.he-seat.fold{opacity:.5;filter:grayscale(.7)}
.he-seat.won .he-box{box-shadow:inset 0 0 0 1.5px #7ee29a,0 0 34px rgba(126,226,154,.55),0 10px 26px rgba(0,0,0,.55)}
.he-seat.won .he-ph{box-shadow:0 0 0 2px #0b0c0e,0 0 0 3.5px #7ee29a}
.he-seat.bust .he-st{color:var(--ruby)}
.tag.he-pot{font-size:12px;letter-spacing:.14em;font-weight:800;color:var(--mute);padding:5px 12px}
.tag.he-pot b{color:var(--gold-hi);font-size:14px;letter-spacing:.02em;margin-left:6px}
.tag.he-bet{font-size:12px;padding:3px 9px}
.tag.he-str{display:inline-block;text-align:center;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:6px 14px;box-shadow:0 8px 24px rgba(0,0,0,.45)}
.tag.he-str small{display:block;margin:2px 0 0;font-size:9.5px;letter-spacing:.16em;opacity:.75}
.tag.he-win{font-size:13px;letter-spacing:.08em;text-transform:uppercase}

#he-sizer{position:absolute;right:18px;bottom:var(--he-b,96px);z-index:16;width:min(452px,calc(100vw - 24px));padding:10px 12px 12px;border-radius:18px;
  background:linear-gradient(180deg,rgba(24,21,15,.94),rgba(7,8,10,.95));box-shadow:inset 0 0 0 1px rgba(227,199,126,.34),0 18px 44px rgba(0,0,0,.55);
  opacity:0;transform:translateY(10px);transition:opacity .25s,transform .25s;pointer-events:none}
#he-sizer.on{opacity:1;transform:none;pointer-events:auto}
.he-q{display:flex;gap:6px}
.he-q button{flex:1;height:34px;border-radius:10px;font-size:10.5px;font-weight:800;letter-spacing:.12em;color:var(--mute);
  background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(227,199,126,.2)}
.he-q button:hover{color:var(--cream)}
.he-q button.on{background:rgba(212,175,95,.18);box-shadow:inset 0 0 0 1px var(--gold);color:var(--gold-hi)}
.he-q button:disabled{opacity:.3;pointer-events:none}
.he-sl{display:flex;align-items:center;gap:10px;margin-top:10px}
.he-sl input{flex:1;min-width:0;-webkit-appearance:none;appearance:none;height:6px;border-radius:3px;outline:none;
  background:linear-gradient(90deg,#c89a47 0,#f3dc9b var(--p,0%),rgba(255,255,255,.12) var(--p,0%))}
.he-sl input::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;cursor:grab;
  background:radial-gradient(circle at 35% 30%,#fff3c4,#e4b95a 45%,#9a6d22 85%);box-shadow:0 0 0 3px rgba(0,0,0,.35),0 3px 10px rgba(0,0,0,.6)}
.he-sl input::-moz-range-thumb{width:24px;height:24px;border:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3c4,#e4b95a 45%,#9a6d22 85%)}
.he-step{flex:none;width:34px;height:34px;border-radius:50%;font-size:20px;line-height:1;color:var(--gold-hi);background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(227,199,126,.3)}
.he-amt{flex:none;min-width:104px;text-align:right;line-height:1.05}
.he-amt small{display:block;font-size:9.5px;letter-spacing:.2em;color:var(--mute);font-weight:700}
.he-amt b{font-size:20px;font-weight:900;color:var(--gold-hi);font-variant-numeric:tabular-nums}
.he-info em b{color:var(--gold-hi);font-style:normal}
@media (max-width:860px){
  #he-sizer{left:10px;right:10px;width:auto;padding:8px 10px 10px}
  .he-q button{height:32px;font-size:10px;letter-spacing:.08em}
}
@media (max-width:520px){
  .he-seat{gap:3px}
  .he-box{flex-direction:column;gap:3px;padding:4px 7px 5px;border-radius:16px}
  .he-ph{width:34px;height:34px}
  .he-txt{align-items:center;min-width:0}
  .he-nm{font-size:8.5px;letter-spacing:.12em}
  .he-st{font-size:11.5px;margin-top:1px}
  .he-ac{min-height:16px}
  .he-ac span{font-size:9px;padding:2px 7px;letter-spacing:.1em}
  .he-show img{width:24px}
  .he-show{position:absolute;top:6px}
  .he-seat.side-l .he-show{left:calc(100% + 3px)}
  .he-seat.side-r .he-show{right:calc(100% + 3px)}
  /* long pills grow inward from the seat card instead of off the screen edge */
  .he-seat.side-l .he-ac{width:0;justify-content:flex-start;align-self:flex-start;margin-left:4px}
  .he-seat.side-r .he-ac{width:0;justify-content:flex-end;align-self:flex-end;margin-right:4px}
  .he-pos{min-width:18px;height:18px;font-size:9px;top:-5px;right:-5px}
  .tag.he-str{font-size:10.5px;padding:5px 11px}
  .tag.he-pot{font-size:10px}.tag.he-pot b{font-size:12px}
  .tag.he-bet{font-size:10.5px;padding:2px 7px}
  .he-amt{min-width:84px}.he-amt b{font-size:17px}
}
.he-rank{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;align-items:center;margin-top:6px}
.he-rank .cs{display:flex;gap:2px}
.he-rank .cs img{width:26px;border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,.5)}
.he-rank .cs img.dim{opacity:.35}
.he-rank .nm{font-size:13.5px;color:#d7cfbf}
.he-rank .nm b{color:var(--gold-hi);font-weight:700}
@media (max-width:520px){.he-rank .cs img{width:20px}}
`;

// help sheet
const H = (r, s) => ({ r, s });
const EXAMPLES = [
  [8, 'Straight flush', 'Five in a row, one suit. A-K-Q-J-10 is a royal flush.', [H(14, 1), H(13, 1), H(12, 1), H(11, 1), H(10, 1)]],
  [7, 'Four of a kind', 'Four cards of one rank.', [H(9, 0), H(9, 1), H(9, 2), H(9, 3), H(13, 0)]],
  [6, 'Full house', 'Three of a kind plus a pair.', [H(13, 0), H(13, 1), H(13, 3), H(5, 2), H(5, 0)]],
  [5, 'Flush', 'Five of one suit.', [H(14, 2), H(11, 2), H(8, 2), H(6, 2), H(3, 2)]],
  [4, 'Straight', 'Five in a row. A-2-3-4-5 counts.', [H(10, 3), H(9, 1), H(8, 0), H(7, 2), H(6, 1)]],
  [3, 'Three of a kind', 'Three cards of one rank.', [H(7, 0), H(7, 1), H(7, 3), H(13, 2), H(2, 0)], 3],
  [2, 'Two pair', 'Two different pairs.', [H(12, 0), H(12, 2), H(4, 1), H(4, 3), H(14, 0)], 4],
  [1, 'One pair', 'Two cards of one rank.', [H(11, 1), H(11, 3), H(9, 0), H(6, 2), H(2, 1)], 2],
  [0, 'High card', 'Nothing else — the highest card plays.', [H(14, 0), H(12, 3), H(8, 1), H(5, 2), H(3, 0)], 1]
];
export function helpHTML({ level, stakes }) {
  const rows = EXAMPLES.map(([, name, desc, cards, used = 5]) => `<div class="cs">${cards.map((c, i) => `<img src="${cardImg(c, 52)}" alt="" class="${i >= used ? 'dim' : ''}">`).join('')}</div><div class="nm"><b>${name}</b> · ${desc}</div>`).join('');
  return `<p class="eyebrow">SIX SEATS · NO LIMIT · NO RAKE</p><h2>Texas <em>Hold’em</em></h2>
  <p>You against five regulars — Maya, Marcus, Kai, Elena and Rico. They are simulated players who see only their own cards and what happens on the felt. Ace deals.</p>
  <h3>THE HAND</h3>
  <ul><li>The dealer button moves one seat each hand. The next two seats post the small and big blind.</li>
  <li>Everyone gets two cards face down. Betting goes clockwise: pre-flop, then after the flop (three shared cards), the turn and the river (one card each). Ace burns a card before every street.</li>
  <li>On your turn: <b>fold</b>, <b>check</b> when nothing is owed, <b>call</b> to match, or <b>bet / raise</b>. A raise must be at least the size of the last bet or raise; you can always go all-in.</li>
  <li>An all-in for less than a full raise does not re-open betting for players who already acted.</li>
  <li>Best five cards from your two plus the five on the board win. Suits never break ties; equal hands split the pot (odd chip to the first seat left of the button).</li>
  <li>When someone is all-in for less, a main pot and side pots are made. You can only win what you matched. Uncalled chips go back.</li></ul>
  <h3>HAND RANKINGS · BEST TO WORST</h3><div class="he-rank">${rows}</div>
  <h3>YOUR CHIPS</h3>
  <ul><li>Buy-in is 100 big blinds (at least 20). Your table stack leaves your balance when you sit and comes back when you leave — <b>LEAVE TABLE</b> between hands, or the ‹ lobby button any time (an unfinished hand is checked or folded for you).</li>
  <li><b>TOP UP</b> back to 100 big blinds between hands; <b>REBUY</b> if you bust. Opponents rebuy on their own.</li></ul>
  <h3>OPPONENTS · ${esc(LEVELS[level].name.toUpperCase())}</h3>
  <div class="seg" id="he-level">${LEVELS.map((l, i) => `<button data-lv="${i}" class="${i === level ? 'on' : ''}">${esc(l.name.toUpperCase())}</button>`).join('')}</div>
  <p class="muted" style="margin-top:8px">Stronger levels estimate their chances with more simulations and make fewer mistakes. Takes effect next hand.</p>
  <h3>CONTROLS</h3>
  <p class="muted">Use the sizer above the buttons: MIN, ½ POT, POT, ALL-IN, or drag / step for any amount. Keys: F fold · C check / call · R bet / raise · ↑ ↓ size · A all-in · Space next hand.</p>
  <p class="muted" style="margin-top:6px">Tables: ${stakes.map(s => `${fmt(s.bb / 2)} / ${fmt(s.bb)}`).join(' · ')}. Play chips only.</p>`;
}
