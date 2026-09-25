// Hold'em table geometry, for both screen shapes. The layout frame is always
// the same — you at +z, Ace behind the far rail at −z, the camera behind you —
// but the table turns under it:
//   landscape: the racetrack lies across the screen, Ace at the middle of the
//              far long side, you at the middle of the near one;
//   portrait:  the racetrack runs away from you (long axis along z), Ace at the
//              far end, you at the near end, the regulars down both sides —
//              the only way six seats AND readable cards fit a phone.
import * as THREE from '../vendor/three.min.mjs';
import { arcText, rrect, text, PRINT, PRINT_SOFT } from '../core/tables.mjs';
import { CARD } from '../core/props.mjs';
import { FONT_DISPLAY, FONT_TEXT } from '../core/textures.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const DIMS = { landscape: { L: 1.16, R: .62 }, portrait: { L: 1.04, R: .62 } };
export const VIEW = {
  landscape: { pos: [0, 1.45, 1.66], look: [0, -.03, -.05], fov: 38, fitWidth: 3.05 },
  portrait: { pos: [0, 2.46, 1.72], look: [0, 0, -.1], fov: 56, fitWidth: 1.42, maxFov: 80 }
};
const SEAT_DEG = { landscape: [90, 157, 201, 228, 312, 351], portrait: [90, 140, 184, 223, 317, 356] };
const STACK_SIDE = [-1, 1, 1, 1, -1, -1];      // which side of its cards a seat keeps its chips

// Point on an x-long stadium's felt edge in direction th (+z toward you), with the outward normal.
function edgeX(th, L, R) {
  const dx = Math.cos(th), dz = Math.sin(th), a = L / 2;
  if (Math.abs(dz) > 1e-6) { const t = R / Math.abs(dz), x = t * dx; if (Math.abs(x) <= a) return { x, z: Math.sign(dz) * R, nx: 0, nz: Math.sign(dz) }; }
  const cx = Math.sign(dx) * a, dc = dx * cx, t = dc + Math.sqrt(dc * dc - cx * cx + R * R), x = t * dx, z = t * dz;
  return { x, z, nx: (x - cx) / R, nz: z / R };
}
function edgeAt(th, { L, R }, zLong) {
  if (!zLong) return edgeX(th, L, R);
  const e = edgeX(th - Math.PI / 2, L, R);           // same shape, turned a quarter: (x, z) -> (−z, x)
  return { x: -e.z, z: e.x, nx: -e.nz, nz: e.nx };
}

export function makeLayout(portrait) {
  const key = portrait ? 'portrait' : 'landscape', dims = DIMS[key];
  const far = portrait ? dims.L / 2 + dims.R : dims.R;          // centre → far rail (and near rail)
  const hs = portrait ? 1.14 : 1;
  const seats = SEAT_DEG[key].map((d, i) => {
    const e = edgeAt(d * Math.PI / 180, dims, portrait);
    const n = V(-e.nx, 0, -e.nz), t = V(-n.z, 0, n.x), edge = V(e.x, 0, e.z), side = STACK_SIDE[i];
    const at = (inset, s = 0) => edge.clone().addScaledVector(n, inset).addScaledVector(t, s);
    return {
      edge, n, t, side, yaw: Math.atan2(-n.x, -n.z),
      cardPos: [at(.16, -.024 * hs), at(.16, .024 * hs)],
      stackPos: at(.085, side * (portrait ? .13 : .145)),
      betPos: at(portrait ? .29 : .305, side * .02),
      puckPos: at(.235, -side * .105).setY(.004)
    };
  });
  const me = seats[0];
  if (portrait) {
    me.cardPos = [V(-.03, 0, far - .18), V(.03, 0, far - .18)];
    me.stackPos = V(-.25, 0, far - .22); me.betPos = V(.2, 0, far - .37); me.puckPos = V(.27, .004, far - .24);
  } else {
    me.cardPos = [V(-.028, 0, far - .175), V(.028, 0, far - .175)];
    me.stackPos = V(-.3, 0, far - .12); me.betPos = V(.24, 0, far - .31); me.puckPos = V(.31, .004, far - .18);
  }
  // seat cards (HTML) hang just outside the rail, pulled into frame where needed
  const anchor = portrait
    ? { 1: [-.035, .07], 2: [-.035, .07], 3: [-.05, .08], 4: [-.05, .08], 5: [-.035, .07] }
    : { 1: [-.1, .08], 2: [-.09, .1], 3: [-.1, .2], 4: [-.1, .2], 5: [-.1, .08] };
  for (const [i, [o, y]] of Object.entries(anchor)) seats[i].anchor = seats[i].edge.clone().addScaledVector(seats[i].n, o).setY(y);
  const bdx = portrait ? .116 : .1, bz = portrait ? .07 : .035, bscale = portrait ? 1.45 : 1.2;
  return {
    portrait, dims, far, seats, holeScale: hs, boardScale: bscale, boardZ: bz, boardDX: bdx,
    outline: { type: 'stadium', L: dims.L, R: dims.R, zc: 0 },
    tableYaw: portrait ? Math.PI / 2 : 0,
    board: k => V((k - 2) * bdx, CARD.t / 2, bz),
    pot: portrait ? V(0, 0, -.42) : V(0, 0, -.19),
    deal: V(0, .012, -far + .12),
    burn: V(portrait ? .22 : .25, 0, -far + (portrait ? .2 : .17)),
    muck: V(portrait ? -.22 : -.25, 0, -far + (portrait ? .2 : .17)),
    backdrop: { z: -far - .03, railY: .057, width: 1.95 },
    showdownShot: !portrait
  };
}

// The printed felt. P/S are the table's own canvas mapping (its long axis is
// local x); W maps layout-frame points, ROT turns lettering to face you.
export function paintFelt(c, P, S, lay) {
  const { L, R } = lay.dims, port = lay.portrait;
  const W = port ? (x, z) => P(-z, x) : P, ROT = port ? Math.PI / 2 : 0;
  const path = inset => {
    const r = R - inset, a = L / 2;
    c.beginPath();
    const [x0, y0] = P(-a, r); c.moveTo(x0, y0);
    const [x1] = P(a, r); c.lineTo(x1, y0);
    const [ax, ay] = P(a, 0); c.arc(ax, ay, S(r), Math.PI / 2, -Math.PI / 2, true);
    const [bx, by] = P(-a, 0); c.lineTo(bx, P(0, -r)[1]); c.arc(bx, by, S(r), -Math.PI / 2, Math.PI / 2, true);
    c.closePath();
  };
  c.save();
  path(.03); c.lineWidth = S(.07); c.strokeStyle = 'rgba(0,0,0,.2)'; c.stroke();            // racetrack shade inside the rail
  path(.235); c.lineWidth = S(.0032); c.strokeStyle = PRINT; c.stroke();                    // the betting line
  path(.247); c.lineWidth = S(.0012); c.strokeStyle = PRINT_SOFT; c.stroke();
  path(.26); const [gx, gy] = P(0, 0), g = c.createRadialGradient(gx, gy, S(.1), gx, gy, S(.9));
  g.addColorStop(0, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fill();
  // community card frames
  const cw = CARD.w * lay.boardScale + .008, ch = CARD.h * lay.boardScale + .008;
  for (let k = 0; k < 5; k++) {
    const b = lay.board(k), [x, y] = W(b.x, b.z), w = S(port ? ch : cw), h = S(port ? cw : ch);
    rrect(c, x - w / 2, y - h / 2, w, h, S(.008), { lw: S(.0018), color: 'rgba(236,214,160,.32)' });
  }
  // lettering
  const tz = lay.boardZ + CARD.h * lay.boardScale / 2 + (port ? .09 : .07), [tx, ty] = W(0, tz);
  const T = (s, x, y, o) => text(c, s, x, y, { rot: ROT, ...o });
  T('NO LIMIT HOLD’EM', tx, ty, { font: `italic 600 ${S(port ? .05 : .042)}px ${FONT_DISPLAY}`, color: PRINT, spacing: S(.004) });
  const [sx, sy] = W(0, tz + (port ? .045 : .036));
  T('SIX SEATS  ·  DEALT BY ACE', sx, sy, { font: `700 ${S(port ? .015 : .0125)}px ${FONT_TEXT}`, color: PRINT_SOFT, spacing: S(.006) });
  const [mx, my] = W(0, lay.pot.z - (port ? .12 : .11));
  T('C³', mx, my, { font: `italic 700 ${S(.085)}px ${FONT_DISPLAY}`, color: 'rgba(236,214,160,.13)' });
  if (!port) {
    for (const sgn of [-1, 1]) {
      const [ex, ey] = P(sgn * L / 2, 0);
      arcText(c, 'BLUFOX', ex, ey, S(R - .33), sgn < 0 ? Math.PI : 0, { font: `800 ${S(.03)}px ${FONT_TEXT}`, color: 'rgba(236,214,160,.5)', spacing: S(.012) });
      arcText(c, 'CASINO & LOUNGE', ex, ey, S(R - .375), sgn < 0 ? Math.PI : 0, { font: `700 ${S(.0115)}px ${FONT_TEXT}`, color: 'rgba(236,214,160,.36)', spacing: S(.006) });
    }
  } else {
    // along the two long sides, reading toward the far end
    for (const sgn of [-1, 1]) {
      const [bx, by] = W(sgn * (R - .33), -.02);
      text(c, 'BLUFOX', bx, by, { rot: ROT + sgn * Math.PI / 2, font: `800 ${S(.03)}px ${FONT_TEXT}`, color: 'rgba(236,214,160,.42)', spacing: S(.012) });
    }
  }
  c.restore();
}
