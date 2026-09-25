// Baccarat scoreboard: Bead Plate + Big Road, drawn as SVG in an HTML panel
// that sits over the lounge (top-right on desktop, above the console on phones).
import { bigRoad } from '../rules/baccarat.mjs';

const COL = { P: '#3d7bff', B: '#e8343f', T: '#27b35f' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Roadmap {
  constructor(host, { open = true, onToggle } = {}) {
    this.hist = []; this.shoeNo = 1; this.onToggle = onToggle;
    const el = document.createElement('aside');
    el.id = 'bac-road'; el.className = 'bac-road' + (open ? '' : ' shut');
    el.setAttribute('aria-label', 'Baccarat scoreboard');
    el.innerHTML = `
      <button class="br-head" type="button" aria-expanded="${open}">
        <span class="br-title">SCOREBOARD</span>
        <span class="br-stats"></span>
        <span class="br-tog" aria-hidden="true"></span>
      </button>
      <div class="br-body">
        <div class="br-pane"><div class="br-lbl">BEAD PLATE</div><div class="br-bead"></div></div>
        <div class="br-pane br-grow"><div class="br-lbl">BIG ROAD <span class="br-shoe"></span></div><div class="br-big"></div></div>
      </div>`;
    host.append(el);
    this.el = el;
    el.querySelector('.br-head').onclick = e => { e.stopPropagation(); this.toggle(); };
    el.addEventListener('pointerdown', e => e.stopPropagation());
    this.layout({});
  }
  get open() { return !this.el.classList.contains('shut'); }
  toggle(force) {
    const on = force ?? !this.open;
    this.el.classList.toggle('shut', !on);
    this.el.querySelector('.br-head').setAttribute('aria-expanded', on);
    this.onToggle?.(on);
  }
  // phone portrait: dock above the console; otherwise top-right under the top bar
  layout({ portrait = false, bottom = 140, compact = false }) {
    this.el.classList.toggle('dock', portrait);
    this.el.classList.toggle('compact', compact);
    this.el.style.bottom = portrait ? bottom + 'px' : '';
    this.cell = portrait ? (innerWidth < 420 ? 13 : 15) : compact ? 13 : 16;
    this.beadCols = portrait ? (innerWidth < 420 ? 10 : 12) : 10;
    this.bigCols = portrait ? Math.max(12, Math.floor((Math.min(innerWidth, 560) - 44 - this.beadCols * this.cell) / this.cell)) : compact ? 15 : 18;
    this.render();
  }
  reset(shoeNo) { this.hist = []; this.shoeNo = shoeNo; this.render(); }
  push(h) { this.hist.push(h); if (this.hist.length > 90) this.hist.shift(); this.render(true); }
  set(list, shoeNo) { this.hist = list.slice(-90); this.shoeNo = shoeNo; this.render(); }

  render(fresh = false) {
    const H = this.hist, c = this.cell || 16;
    const n = { P: 0, B: 0, T: 0 }; let pp = 0, bp = 0;
    for (const h of H) { n[h.w]++; if (h.pp) pp++; if (h.bp) bp++; }
    this.el.querySelector('.br-stats').innerHTML =
      `<i class="p"><b>P</b>${n.P}</i><i class="b"><b>B</b>${n.B}</i><i class="t"><b>T</b>${n.T}</i><i class="x">#${H.length}</i>`;
    this.el.querySelector('.br-shoe').textContent = `· SHOE ${this.shoeNo}`;
    // ── bead plate: column-major, newest at the end
    const rows = 6, bc = this.beadCols || 10;
    const start = Math.max(0, Math.ceil(H.length / rows) - bc) * rows, last60 = H.slice(start);
    let s = `<svg viewBox="0 0 ${bc * c} ${rows * c}" width="${bc * c}" height="${rows * c}" aria-hidden="true">${grid(bc, rows, c)}`;
    last60.forEach((h, i) => {
      const col = Math.floor(i / rows), row = i % rows, x = col * c + c / 2, y = row * c + c / 2;
      const isNew = fresh && start + i === H.length - 1;
      s += `<g class="${isNew ? 'br-new' : ''}" style="transform-origin:${x}px ${y}px"><circle cx="${x}" cy="${y}" r="${c * .42}" fill="${COL[h.w]}"/>` +
        `<text x="${x}" y="${y + c * .19}" font-size="${c * .52}" text-anchor="middle">${h.w}</text>` +
        (h.bp ? `<circle cx="${x - c * .3}" cy="${y - c * .3}" r="${c * .12}" fill="${COL.B}" stroke="#fff" stroke-width="${c * .05}"/>` : '') +
        (h.pp ? `<circle cx="${x + c * .3}" cy="${y + c * .3}" r="${c * .12}" fill="${COL.P}" stroke="#fff" stroke-width="${c * .05}"/>` : '') + `</g>`;
    });
    this.el.querySelector('.br-bead').innerHTML = s + '</svg>';
    // ── big road
    const road = bigRoad(H), vis = this.bigCols || 18, off = Math.max(0, road.cols - vis);
    s = `<svg viewBox="0 0 ${vis * c} ${rows * c}" width="${vis * c}" height="${rows * c}" aria-hidden="true">${grid(vis, rows, c)}`;
    road.cells.forEach((k, i) => {
      if (k.col < off) return;
      const x = (k.col - off) * c + c / 2, y = k.row * c + c / 2, isNew = fresh && i === road.cells.length - 1;
      s += `<g class="${isNew ? 'br-new' : ''}" style="transform-origin:${x}px ${y}px">`;
      if (k.w) s += `<circle cx="${x}" cy="${y}" r="${c * .36}" fill="none" stroke="${COL[k.w]}" stroke-width="${c * .15}"/>`;
      if (k.ties) s += `<line x1="${x - c * .34}" y1="${y + c * .34}" x2="${x + c * .34}" y2="${y - c * .34}" stroke="${COL.T}" stroke-width="${c * .14}" stroke-linecap="round"/>` +
        (k.ties > 1 ? `<text x="${x}" y="${y + c * .18}" font-size="${c * .5}" text-anchor="middle" class="tn">${k.ties}</text>` : '');
      if (k.bp) s += `<circle cx="${x - c * .32}" cy="${y - c * .32}" r="${c * .11}" fill="${COL.B}"/>`;
      if (k.pp) s += `<circle cx="${x + c * .32}" cy="${y + c * .32}" r="${c * .11}" fill="${COL.P}"/>`;
      s += '</g>';
    });
    this.el.querySelector('.br-big').innerHTML = s + '</svg>';
  }
  destroy() { this.el.remove(); }
}
function grid(cols, rows, c) {
  let g = `<rect width="${cols * c}" height="${rows * c}" fill="#f7f3ea"/>`;
  for (let i = 1; i < cols; i++) g += `<line x1="${i * c}" y1="0" x2="${i * c}" y2="${rows * c}"/>`;
  for (let j = 1; j < rows; j++) g += `<line x1="0" y1="${j * c}" x2="${cols * c}" y2="${j * c}"/>`;
  return `<g class="gr">${g}</g>`;
}

// Everything this game styles, scoped to its own ids/classes. Injected on enter, removed on exit.
export const CSS = `
#bac-road{position:absolute;z-index:14;right:calc(14px + var(--corner));top:calc(var(--top) + var(--safe-t) + 58px);padding:0;border-radius:16px;
  background:linear-gradient(170deg,rgba(28,22,12,.9),rgba(8,9,12,.9) 60%);box-shadow:inset 0 0 0 1px rgba(227,199,126,.34),0 18px 50px rgba(0,0,0,.55);
  color:var(--cream);font-family:var(--text);overflow:hidden;opacity:0;transform:translateY(-8px);animation:brIn .6s .3s cubic-bezier(.2,.8,.2,1) forwards;
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);max-width:calc(100vw - 24px)}
@keyframes brIn{to{opacity:1;transform:none}}
#bac-road .br-head{display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px 7px;text-align:left;cursor:pointer}
#bac-road .br-title{font-size:9.5px;letter-spacing:.3em;font-weight:800;color:var(--gold)}
#bac-road .br-stats{display:flex;gap:6px;margin-left:auto;font-variant-numeric:tabular-nums}
#bac-road .br-stats i{font-style:normal;font-size:11.5px;font-weight:800;display:flex;align-items:center;gap:4px;padding:2px 7px 2px 3px;border-radius:999px;background:rgba(255,255,255,.06)}
#bac-road .br-stats b{display:grid;place-items:center;width:16px;height:16px;border-radius:50%;font-size:9.5px;color:#fff}
#bac-road .br-stats .p b{background:${COL.P}}#bac-road .br-stats .b b{background:${COL.B}}#bac-road .br-stats .t b{background:${COL.T}}
#bac-road .br-stats .x{padding:2px 7px;color:var(--mute);font-weight:700}
#bac-road .br-tog{width:18px;height:18px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(227,199,126,.4);position:relative;flex:none}
#bac-road .br-tog::after{content:'';position:absolute;left:5px;top:4px;width:6px;height:6px;border-right:1.6px solid var(--gold);border-bottom:1.6px solid var(--gold);transform:rotate(-135deg);transform-origin:60% 60%;transition:transform .3s}
#bac-road.shut .br-tog::after{transform:rotate(45deg)}
#bac-road .br-body{display:flex;gap:8px;padding:0 10px 10px;align-items:flex-start;transition:max-height .35s,opacity .3s,padding .35s;max-height:200px}
#bac-road.shut .br-body{display:none}
#bac-road .br-lbl{font-size:8.5px;letter-spacing:.24em;color:var(--mute);font-weight:700;margin:0 0 4px 2px;white-space:nowrap}
#bac-road svg{display:block;border-radius:6px;box-shadow:0 0 0 1px rgba(227,199,126,.35)}
#bac-road svg .gr line{stroke:rgba(40,30,20,.14);stroke-width:1}
#bac-road svg text{font-family:Archivo,Arial,sans-serif;font-weight:800;fill:#fff}
#bac-road svg text.tn{fill:${COL.T};font-weight:900}
#bac-road .br-new{animation:brPop 1.2s cubic-bezier(.2,.9,.25,1.3)}
@keyframes brPop{0%{transform:scale(.2);opacity:0}40%{transform:scale(1.35);opacity:1}100%{transform:scale(1)}}
#bac-road.dock{left:12px;right:12px;top:auto;margin:0 auto;width:max-content}
#bac-road.dock .br-head{padding:6px 10px 5px}
#bac-road.dock .br-body{padding:0 8px 8px;gap:6px}
#bac-road.dock .br-lbl{display:none}
#bac-road.compact .br-lbl{display:none}
#bac-road{transition:filter .45s}
#bac-road.sqhide{filter:opacity(0);pointer-events:none}
@media (max-width:520px){
  .bac-score{font-size:8.5px;gap:6px;padding:3px 4px 3px 9px;letter-spacing:.2em}
  .bac-score .n{width:24px;height:24px;font-size:14px}
  .bac-score.win{transform:scale(1.06)}
  .bac-score .bdg{font-size:7.5px;padding:2px 6px 1px;letter-spacing:.18em}
  .bac-score .bdg.nat{top:-15px}.bac-score .bdg.pair{bottom:-14px}
  .bac-bet,.bac-res{font-size:10.5px;padding:2px 7px}
  .bac-hint{font-size:8.5px;letter-spacing:.22em}
}

/* hand totals, callouts, bet tags */
.bac-score{display:flex;align-items:center;gap:9px;padding:4px 5px 4px 13px;border-radius:999px;background:rgba(6,7,10,.84);
  box-shadow:inset 0 0 0 1px rgba(227,199,126,.38),0 8px 24px rgba(0,0,0,.45);font:800 10.5px var(--text);letter-spacing:.26em;color:var(--cream);transition:box-shadow .4s,opacity .4s,transform .4s}
.bac-score .n{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;font:800 17px/1 var(--text);color:#fff;letter-spacing:0;text-shadow:0 1px 2px rgba(0,0,0,.45);
  background:radial-gradient(circle at 35% 28%,#8fb0ff,#2553d6 55%,#122c80);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35)}
.bac-score.b .n{background:radial-gradient(circle at 35% 28%,#ff9a9a,#cf1f2b 55%,#6e0b12)}
.bac-score.win{background:linear-gradient(180deg,rgba(60,46,14,.95),rgba(14,12,8,.92));box-shadow:inset 0 0 0 1.5px #f3dc9b,0 0 34px rgba(243,220,155,.55);transform:scale(1.12)}
.bac-score.win .n{box-shadow:inset 0 0 0 2px #f3dc9b,0 0 16px rgba(243,220,155,.8)}
.bac-score.lose{opacity:.5;transform:scale(.94)}
.bac-score.tie{box-shadow:inset 0 0 0 1.5px #6fe39a,0 0 26px rgba(39,179,95,.5)}
.bac-score{position:relative}
.bac-score .bdg{position:absolute;left:50%;transform:translateX(-50%);padding:3px 9px 2px;border-radius:999px;font:900 9px/1.2 var(--text);letter-spacing:.24em;white-space:nowrap;font-style:normal;
  animation:bacBadge .6s cubic-bezier(.2,.9,.25,1.4) both}
.bac-score .bdg.nat{top:-19px;color:#1e1405;background:linear-gradient(180deg,#fff0c4,#d9ae59 60%,#a97c30);box-shadow:0 0 18px rgba(243,220,155,.7)}
.bac-score .bdg.pair{bottom:-17px;color:#fff;background:linear-gradient(180deg,#3d3f4a,#15161b);box-shadow:inset 0 0 0 1px rgba(243,220,155,.6)}
@keyframes bacBadge{0%{opacity:0;transform:translateX(-50%) scale(.3)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
@keyframes bacPop{0%{opacity:0;transform:scale(.4) translateY(10px)}100%{opacity:1;transform:none}}
.bac-bet{padding:3px 9px;border-radius:999px;background:rgba(5,6,8,.8);box-shadow:inset 0 0 0 1px rgba(227,199,126,.4);font:800 12px var(--text);color:var(--cream);font-variant-numeric:tabular-nums}
.bac-res{padding:4px 10px;border-radius:999px;font:800 12px var(--text);letter-spacing:.06em;white-space:nowrap;animation:bacPop .5s cubic-bezier(.2,.9,.25,1.3) both}
.bac-res.win{color:#06220f;background:linear-gradient(180deg,#c6f7d2,#5ec47d);box-shadow:0 0 22px rgba(94,196,125,.55)}
.bac-res.win em{font-style:normal;font-weight:700;opacity:.75;margin-left:6px;font-size:10px;letter-spacing:.12em}
.bac-res.lose{color:#fff;background:rgba(150,32,42,.92)}
.bac-res.push{color:var(--cream);background:rgba(20,22,28,.92);box-shadow:inset 0 0 0 1px rgba(227,199,126,.4)}
#app.bac-sq #vignette{background:radial-gradient(90% 75% at 50% 48%,transparent 38%,rgba(0,0,0,.78) 100%);transition:background .8s}
#vignette{transition:background .8s}
.bac-hint{font:800 10px var(--text);letter-spacing:.3em;color:var(--gold-hi);padding:6px 12px;border-radius:999px;background:rgba(5,6,8,.72);box-shadow:inset 0 0 0 1px rgba(227,199,126,.35);animation:bacPulse 1.8s ease-in-out infinite}
@keyframes bacPulse{50%{opacity:.55}}
`;
