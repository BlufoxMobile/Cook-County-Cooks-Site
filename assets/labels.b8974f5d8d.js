


import { HOTSPOTS } from '../rooms.d58e8ef8a0.js';





const PLATE_AR = 2400 / 1340;          





const SURFACES = [
  

  { slug: 'porting-guide', snap: true,  room: 'prep',   surface: 'card',
    quad: [[24.58, 33.36], [33.20, 34.35], [33.26, 46.82], [24.60, 47.06]],
    zone: [0.07, 0.285, 0.93, 0.715],  align: 'start',
    paper: [217, 204, 186], ramp: [-0.020, 0.073],
    lines: ['PortPro', 'Porting Guide'], meta: 'Tap to open' },

  { slug: 'credit-limit', snap: true,   room: 'prep',   surface: 'card',
    quad: [[34.45, 34.68], [41.60, 35.52], [41.62, 46.88], [34.56, 46.95]],
    zone: [0.10, 0.260, 0.93, 0.740],  align: 'start',
    paper: [224, 213, 198], ramp: [0.007, 0.024],
    lines: ['Credit Limit', 'Increase'], meta: 'Tap to open' },

  { slug: 'bapis', snap: true,          room: 'prep',   surface: 'card',
    quad: [[43.12, 35.75], [49.05, 36.42], [49.12, 46.72], [43.48, 46.80]],
    zone: [0.10, 0.26, 0.93, 0.73],    align: 'start',
    paper: [228, 219, 209], ramp: [-0.019, 0.044],
    kicker: 'BAPIS', lines: ['Online Order', 'Processing'], meta: 'Tap to open' },

  { slug: 'bp-access', snap: true,      room: 'prep',   surface: 'card',
    quad: [[50.50, 36.79], [55.26, 37.31], [55.30, 46.80], [50.54, 46.88]],
    zone: [0.11, 0.24, 0.96, 0.71],    align: 'start',
    paper: [228, 219, 210], ramp: [-0.030, 0.018],
    

    lines: ['Report BP', 'Access', 'Issues'], rule: false },

  

  { slug: 'exception-report', room: 'office', surface: 'clipboard',
    quad: [[85.92, 37.91], [89.96, 36.79], [88.54, 56.72], [85.58, 56.34]],
    zone: [0.11, 0.09, 0.89, 0.60],    align: 'start',
    paper: [226, 181, 151], ramp: [-0.017, 0.074],
    lines: ['Exception', 'Report'], meta: 'Tap to open', rules: 0.62 },

  { slug: 'fall-off',        room: 'office', surface: 'clipboard',
    quad: [[91.54, 36.19], [97.46, 34.4], [97.12, 58.58], [91.46, 50.97]],
    

    zone: [0.11, 0.09, 0.89, 0.60],    align: 'start',
    paper: [222, 181, 155], ramp: [-0.066, -0.068],
    lines: ['Fall-Off', 'Summary'], meta: 'Tap to open', rules: 0.5 },

  

  { slug: 'printouts',       room: 'office', surface: 'printout',
    quad: [[78.12, 38.06], [85.96, 35.0], [81.5, 52.09], [78.96, 51.79]],
    zone: [0.10, 0.15, 0.90, 0.62],    align: 'start',
    paper: [252, 231, 200], ramp: [-0.285, -0.190],
    lines: ['Print Outs'], meta: 'Tap to open' },

  

  

  { slug: 'tsheet-submissions',  room: 'pass',   surface: 'counter-card',
    quad: [[76.62, 76.40], [83.80, 76.44], [89.74, 81.95], [81.62, 82.55]],
    zone: [0.12, 0.05, 0.88, 0.40],    align: 'center',
    paper: [250, 219, 192], ramp: [-0.011, -0.254],
    lines: ['T-Sheet', 'Submissions'] }
];





const INK_REFLECTANCE = 0.255;

function inkColour(paper) {
  const c = paper.map((v) => Math.round(Math.max(0, Math.min(255, v * INK_REFLECTANCE))));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}





 
function atUV(quad, u, v) {
  const [TL, TR, BR, BL] = quad;
  const topX = TL[0] + (TR[0] - TL[0]) * u;
  const topY = TL[1] + (TR[1] - TL[1]) * u;
  const botX = BL[0] + (BR[0] - BL[0]) * u;
  const botY = BL[1] + (BR[1] - BL[1]) * u;
  return [topX + (botX - topX) * v, topY + (botY - topY) * v];
}

 
function zoneQuad(quad, [u0, v0, u1, v1]) {
  return [atUV(quad, u0, v0), atUV(quad, u1, v0), atUV(quad, u1, v1), atUV(quad, u0, v1)];
}



function fitPlane(q, spot) {
  const [TL, TR, , BL] = q;

  
  
  
  
  const wPct = Math.hypot(TR[0] - TL[0], (TR[1] - TL[1]) / PLATE_AR);
  const hPct = Math.hypot((BL[0] - TL[0]) * PLATE_AR, BL[1] - TL[1]);
  if (!(wPct > 0) || !(hPct > 0)) return null;

  
  
  const wf = wPct / spot.w;
  const hf = hPct / spot.h;
  const ox = (TL[0] - spot.x) / spot.w;
  const oy = (TL[1] - spot.y) / spot.h;

  
  const e = q.map(([x, y]) => [(x - TL[0]) / wPct, (y - TL[1]) / hPct]);

  const S = [e[0][0] + e[1][0] + e[2][0] + e[3][0],
             e[0][1] + e[1][1] + e[2][1] + e[3][1]];
  const a = [e[1][0] + e[2][0] - S[0] / 2, e[1][1] + e[2][1] - S[1] / 2];
  const b = [e[2][0] + e[3][0] - S[0] / 2, e[2][1] + e[3][1] - S[1] / 2];
  const c = [0.75 * S[0] - 0.5 * (e[1][0] + 2 * e[2][0] + e[3][0]),
             0.75 * S[1] - 0.5 * (e[1][1] + 2 * e[2][1] + e[3][1])];

  
  
  const ratio = (wf * spot.w) / (hf * spot.h) * PLATE_AR;

  
  
  const m = [a[0], a[1] / ratio, b[0] * ratio, b[1]];
  const n = (v) => Number(v.toPrecision(8));

  
  
  return {
    left:   ox * 100,
    top:    oy * 100,
    width:  wf * 100,
    height: hf * 100,
    ratio,
    transform: `translate(${n(c[0] * 100)}%, ${n(c[1] * 100)}%) `
             + `matrix(${n(m[0])}, ${n(m[1])}, ${n(m[2])}, ${n(m[3])}, 0, 0)`
  };
}



function lightMask(ramp, ratio) {
  const [du, dv] = ramp;
  const amp = Math.min(0.55, Math.hypot(du, dv) * 1.15);
  if (amp < 0.03) return null;                       
  const deg = Math.atan2(du / ratio, -dv) * 180 / Math.PI;
  const lo = Math.round((1 - amp) * 100) / 100;
  return `linear-gradient(${deg.toFixed(1)}deg, rgb(0 0 0 / ${lo}) 0%, rgb(0 0 0 / 1) 100%)`;
}



const NARROW = new Set([...'IJLTF1.,-()\'’ ']);
const WIDE   = new Set([...'MW']);



const CHAR_EM  = 0.62;
const TRACK_EM = 0.015;
const WORD_EM  = 0.08;
const BLUR_EM  = 0.02;



const FILL = 0.95;



const MIN_FS = 9.5;
const MAX_FS = 20;

 
function measure(line, track = TRACK_EM) {
  const text = line.toUpperCase();
  let em = 0;
  let spaces = 0;
  for (const ch of text) {
    em += (NARROW.has(ch) ? 0.62 : WIDE.has(ch) ? 1.34 : 1) * CHAR_EM;
    if (ch === ' ') spaces++;
  }
  return em + text.length * track + spaces * WORD_EM + BLUR_EM;
}



function fitType(lines) {
  const longestAt = (track) => lines.reduce((n, s) => Math.max(n, measure(s, track)), 0.001);

  let track = TRACK_EM;
  let fs = (FILL * 100) / longestAt(track);

  if (fs < MIN_FS) {
    track = -0.005;
    fs = (FILL * 100) / longestAt(track);
  }

  return { fs: Math.max(MIN_FS, Math.min(MAX_FS, fs)), track };
}





const STYLE_ID = 'ccc-labels-css';

const CSS = `
/* ⚠ THESE THREE REGISTRATIONS ARE LOAD-BEARING, NOT DECORATION.
   An UNREGISTERED custom property substitutes as a token stream, and Chromium
   will not evaluate a clamp() that arrives that way into the middle of another
   calc(): --lbl-reveal came out as 1 at every value of --enter, the gate
   vanished, and the ink was simply always on — which looks plausible and is
   wrong. Registering the property with syntax "<number>" makes it compute to a
   NUMBER at its own declaration, before anything multiplies it. It also makes
   the three interpolatable, which is what gives the reveal a real curve instead
   of a step. theme.css §01 registers the engine's six for the first reason and
   names the third. Do not "simplify" these away. */
@property --lbl-alpha  { syntax: "<number>"; inherits: true;  initial-value: 0.94; }
@property --lbl-reveal { syntax: "<number>"; inherits: false; initial-value: 1; }
@property --lbl-light  { syntax: "<number>"; inherits: false; initial-value: 1; }

.hotspot--lettered { --lbl-alpha: .94; }

.ccc-ink {
  position: absolute;
  left:   var(--lbl-x);
  top:    var(--lbl-y);
  inline-size: var(--lbl-w);
  block-size:  var(--lbl-h);

  /* The plane. transform-origin 0 0 is what makes the fit in §4 valid — the
     affine is solved for a source rectangle whose own top-left is the origin. */
  transform: var(--lbl-transform);
  transform-origin: 0 0;

  /* The writing area is its own container, so every size below is a fraction of
     THIS PIECE OF PAPER. That is the difference between type that was printed
     on the card and type that happens to be lying over it. */
  container-type: inline-size;

  pointer-events: none;          /* the button underneath owns every pixel */
  overflow: hidden;

  /* ── INK COMES UP WITH THE LIGHTS ────────────────────────────────────────
     Two of the engine's own numbers, no rAF, no timer, no second animation.

       --lbl-reveal  the gate — now literally the same number theme.css §05
                     declares on .stage for the chips, the hotspot layer and
                     the screen band, so ink and object appear together by
                     construction rather than by two formulas agreeing. Its own
                     copy of that window used to open at --enter 0.58 and not
                     finish until 0.78, which put the writing on the paper
                     LATER than the paper itself; --cut settles the pair.
       --lbl-light   the density. --bloom is the engine's lights-come-up ramp
                     (easeOutQuint over the first 55% of the room's scrub), so
                     the writing starts at 82% and darkens to full as the room
                     finishes lighting. That is the beat: the paper brightens,
                     and what is written on it resolves out of it. The floor
                     was 70%, which was a legibility cost paid for a beat you
                     cannot see: the ink is already paper-colour x 0.235, and
                     the whole point of the label is that it can be READ before
                     the lights are up.

     ⚠ NO NESTED calc() INSIDE THE clamp(). Written with the middle argument
     wrapped as calc((var(--enter) - .52) * 3.1), the whole expression silently
     evaluates to 1 at every value of --enter in Chromium — the gate is gone and
     the ink is simply always on, which looks fine and is wrong. Use the bare
     infix form, exactly as theme.css §09's own --own clamp does. */
  --lbl-reveal: var(--cut, 1);
  --lbl-light:  calc(0.82 + 0.18 * var(--bloom, 1));
  opacity: calc(var(--ccc-label-show, 1) * var(--lbl-alpha)
                * var(--lbl-reveal) * var(--lbl-light));
  /* v29: NO transition. --cut and --bloom are scrubbed by the scroll, so a
     transition here restarted on every step of every scrub (42 CSSTransition
     objects in one 1440px pass, design audit P2-13 / G3) and lagged the ink
     behind the paper. The quantised --cut and --bloom (theme.css §05) already
     step it at most a dozen times per room. */
}

.ccc-ink__sheet {
  block-size: 100%;
  display: flex;
  flex-direction: column;
  align-items: var(--lbl-align, flex-start);
  justify-content: flex-start;
  text-align: var(--lbl-text-align, start);

  color: var(--lbl-ink, #4a453f);
  font-family: var(--ccc-label-font, var(--ccc-font-ui, var(--font-text, system-ui, sans-serif)));
  font-size: calc(var(--lbl-fs, 14) * 1cqw);
  font-weight: 700;
  font-stretch: 78%;
  line-height: 1.02;
  /* ⚠ §4 SOLVES AGAINST THESE. They are interpolated from TRACK_EM / WORD_EM so
     the estimator and the stylesheet cannot drift apart — that drift is what
     clipped the two narrowest sheets. Change them there, not here. */
  letter-spacing: var(--lbl-track, ${TRACK_EM}em);
  word-spacing: ${WORD_EM}em;
  text-transform: uppercase;
  -webkit-font-smoothing: antialiased;

  /* THE LAST TELL. Everything above can be right and the ink still reads as an
     overlay, because vector type is perfectly sharp and the photograph it is
     printed on is not: these plates are soft, and each card's own pre-printed
     heading is softer still. A blur of 0.02em — a third of a pixel at the size
     this actually renders — puts the ink on the same optical footing as the
     paper without costing a single point of legibility. It is a static filter,
     so it rasters once and never again; nothing here animates but opacity. */
  filter: blur(${BLUR_EM}em);

  /* the light falling across this sheet */
  -webkit-mask-image: var(--lbl-mask, none);
          mask-image: var(--lbl-mask, none);
}

.ccc-ink__kicker {
  font-size: 0.42em;
  font-weight: 600;
  font-stretch: 70%;
  letter-spacing: 0.2em;
  opacity: .72;
  margin-block-end: 0.12em;
}

.ccc-ink__title { display: block; }
.ccc-ink__line  { display: block; white-space: nowrap; }

.ccc-ink__rule {
  inline-size: 100%;
  block-size: 0;
  margin-block-start: 0.34em;
  border-block-start: max(0.5px, 0.05em) solid currentColor;
  opacity: .6;
}

.ccc-ink__meta {
  font-size: 0.38em;
  font-weight: 600;
  font-stretch: 68%;
  letter-spacing: 0.26em;
  opacity: .62;
  margin-block-start: 0.7em;
  white-space: nowrap;
}

/* Pre-printed form rules, for the two clipboards and the printer sheet: their
   stock is blank in the photograph, and a title alone on a blank sheet reads as
   a sticker stuck to it rather than as something the sheet was printed with. */
.ccc-ink__form {
  inline-size: 100%;
  /* leftover space only — 1 1 0 with no minimum means that on a short sheet
     the form rules simply are not printed rather than pushing the title off the
     paper. Everything above is flex: 0 0 auto, so the title always wins. */
  flex: 1 1 0;
  min-block-size: 0;
  margin-block-start: 0.55em;
  opacity: .3;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--lbl-form-gap, 0.62em) - max(0.5px, 0.04em)),
    currentColor calc(var(--lbl-form-gap, 0.62em) - max(0.5px, 0.04em)),
    currentColor var(--lbl-form-gap, 0.62em));
}

/* Engaged: the sheet is under the reticle, so the ink firms up a little. Ink
   does not glow — this is contrast, not a highlight. */
.hotspot--lettered:is(:hover, :focus-visible) .ccc-ink { --lbl-alpha: 1; }

/* ── the writing area gets too small to be writing ──────────────────────────
   Below roughly a 1180px stage the smallest of these sheets is ~70px of paper.
   The title survives that; the furniture around it does not, so it goes, and
   the title takes the room back. */
@container stage (max-width: 1180px) {
  .ccc-ink__meta,
  .ccc-ink__form,
  .ccc-ink__kicker { display: none; }
  .ccc-ink__rule   { margin-block-start: 0.26em; }
  /* No size bump here, tempting as it is. §4's FILL is a 5% margin over an
     estimate whose own residual is ±2%; a 1.06 multiplier spends all of it and
     three of the four prep cards start clipping their longest line again. The
     furniture coming off is what gives the title its room. */
}

/* Reduced motion: the ink is simply already dry. No reveal, no transition. */
@media (prefers-reduced-motion: reduce) {
  .ccc-ink {
    --lbl-reveal: 1;
    --lbl-light: 1;
    opacity: calc(var(--ccc-label-show, 1) * var(--lbl-alpha));
    transition: none;
  }
}

/* Forced colours: theme.css §18 repaints .hotspot as Canvas/CanvasText, so the
   photograph — and therefore the paper this ink is printed on — is gone. The
   button's border and its accessible name carry it from there. */
@media (forced-colors: active) {
  .ccc-ink { display: none; }
}
`;

function ensureStyles(doc) {
  try {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  } catch (_) {   }
}





 
const SHOW_MICRO = false;

function spotFor(room, slug) {
  return (HOTSPOTS[room] || []).find((s) => s.slug === slug) || null;
}

function buildInk(rec, spot, doc) {
  const plane = fitPlane(zoneQuad(rec.quad, rec.zone), spot);
  if (!plane) return null;                 
  const mask  = lightMask(rec.ramp, plane.ratio);
  const type  = fitType(rec.lines);

  const ink = doc.createElement('div');
  ink.className = 'ccc-ink';
  
  
  ink.setAttribute('aria-hidden', 'true');
  ink.dataset.inkRoom = rec.room;
  ink.dataset.inkSurface = rec.surface;

  const style = [
    `--lbl-x:${plane.left.toFixed(3)}%`,
    `--lbl-y:${plane.top.toFixed(3)}%`,
    `--lbl-w:${plane.width.toFixed(3)}%`,
    `--lbl-h:${plane.height.toFixed(3)}%`,
    `--lbl-transform:${plane.transform}`,
    `--lbl-ink:${inkColour(rec.paper)}`,
    `--lbl-fs:${type.fs.toFixed(2)}`
  ];
  
  
  if (type.track !== TRACK_EM) style.push(`--lbl-track:${type.track.toFixed(4)}em`);
  if (mask) style.push(`--lbl-mask:${mask}`);
  if (rec.align === 'center') style.push('--lbl-align:center', '--lbl-text-align:center');
  ink.setAttribute('style', style.join(';'));

  const sheet = doc.createElement('div');
  sheet.className = 'ccc-ink__sheet';

  
  
  
  
  
  
  if (rec.kicker && SHOW_MICRO) {
    const k = doc.createElement('span');
    k.className = 'ccc-ink__kicker';
    k.textContent = rec.kicker;
    sheet.appendChild(k);
  }

  const title = doc.createElement('span');
  title.className = 'ccc-ink__title';
  rec.lines.forEach((text) => {
    const line = doc.createElement('span');
    line.className = 'ccc-ink__line';
    line.textContent = text;
    title.appendChild(line);
  });
  sheet.appendChild(title);

  if (rec.rule !== false) {
    const rule = doc.createElement('span');
    rule.className = 'ccc-ink__rule';
    sheet.appendChild(rule);
  }

  if (rec.meta && SHOW_MICRO) {
    const meta = doc.createElement('span');
    meta.className = 'ccc-ink__meta';
    meta.textContent = rec.meta;
    sheet.appendChild(meta);
  }

  if (rec.rules) {
    const form = doc.createElement('span');
    form.className = 'ccc-ink__form';
    form.style.setProperty('--lbl-form-gap', `${rec.rules.toFixed(2)}em`);
    sheet.appendChild(form);
  }

  ink.appendChild(sheet);
  return ink;
}





export function initLabels(options = {}) {
  const root = options.root || document;
  const doc  = root.ownerDocument || document;

  ensureStyles(doc);

  let lettered = 0;
  for (const rec of SURFACES) {
    const spot = spotFor(rec.room, rec.slug);
    if (!spot || !Number.isFinite(spot.w) || !Number.isFinite(spot.h)) {
      
      
      console.warn(`[labels] no hotspot geometry for ${rec.room}/${rec.slug}`);
      continue;
    }

    const button = root.querySelector(
      `#room-${rec.room} .hotspot[data-tool="${rec.slug}"]`
    );
    if (!button) continue;

    const existing = button.querySelector(':scope > .ccc-ink');
    if (existing) existing.remove();

    
    
    
    
    
    
    
    
    
    let fit = spot;
    if (rec.snap) {
      const xs = rec.quad.map((q) => q[0]), ys = rec.quad.map((q) => q[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      fit = { ...spot, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
      button.style.setProperty('--x', `${fit.x.toFixed(2)}%`);
      button.style.setProperty('--y', `${fit.y.toFixed(2)}%`);
      button.style.setProperty('--w', `${fit.w.toFixed(2)}%`);
      button.style.setProperty('--h', `${fit.h.toFixed(2)}%`);
    }

    const ink = buildInk(rec, fit, doc);
    if (!ink) continue;
    button.classList.add('hotspot--lettered');
    button.appendChild(ink);
    lettered++;
  }

  return { lettered, surfaces: SURFACES.length };
}

export default initLabels;
