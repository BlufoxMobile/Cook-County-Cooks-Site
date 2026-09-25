# Blufox Casino — game developer guide

Read this before touching a game. The finished reference game is `js/games/blackjack.mjs`
(+ `js/rules/blackjack.mjs`) — copy its patterns.

## What this is
A 3D (three.js r186) casino for Blufox Mobile employees, framed inside the arcade on
cookcountycooks.com. Target: **AAA, high-end-Vegas quality**, on desktop AND phones
(portrait iPhone 390×844 is a first-class target; also iPad). Play chips only.

Everything is plain ES modules, no build step, no CDN. three.js is vendored:
`import * as THREE from '../vendor/three.min.mjs'` (also exports RoomEnvironment,
RoundedBoxGeometry, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, mergeGeometries).

## File ownership (IMPORTANT — several people work in parallel)
- You may CREATE/EDIT only your own files: `js/games/<id>.mjs`, `js/rules/<id>.mjs`,
  and any extra `js/games/<id>-*.mjs` helpers you need.
- Do NOT edit anything in `js/core/`, `js/main.mjs`, `index.html`, `casino.css`, or other games.
  If you truly need a core change, write the exact patch you want in your final report instead.
  Game-specific CSS: inject a `<style id="css-<id>">` from your module on enter (remove on exit),
  scoped under `[data-game="<id>"]` or your own class names.
- Assets live in `assets/` (read-only for you). Available: `assets/img/symbols.webp`
  (768×768, 3×3 grid of 256px slot symbols: 0 gold fox medallion, 1 blue sapphire, 2 crown,
  3 red seven, 4 gold bars, 5 gold bell, 6 martini, 7 cherries, 8 blue chip stack),
  `assets/img/poker-player-portraits.webp` (1983×793, five head-and-shoulders portraits side by side,
  left→right: Maya, Marcus, Kai, Elena, Rico), `assets/img/lounge-empty.webp` (room with no dealer).

## Game module contract
```js
import { Game } from './base.mjs';
export default class Roulette extends Game {
  static id = 'roulette';            // must match GAMES id in main.mjs
  async enter(first) { ... }         // build scene, set camera, start betting. `first` = deep-linked page load
  help() { return '<p class="eyebrow">…</p><h2>…</h2>…'; }   // HTML for the rules sheet (the ? button)
  dispose() { ... }                  // optional extra cleanup (base.exit() already removes this.root,
                                     // listeners registered via onTap/onHover/key, and anchors)
}
```
`this` has (from `Game`): `stage, backdrop, cards, chips, bank, events, sound, hud, challenges, board, app, tw, root`.
- `this.root` — a THREE.Group already in the world; put your objects in it.
- `this.alive` — false after the player leaves; check it after every `await` in long async flows.
- `this.onTap(e => ...)` tap on the canvas (drag-filtered). `this.stage.pick(e.clientX, e.clientY, meshes)` raycasts.
- `this.onHover(() => meshesArray)` mouse cursor pointer over hit targets.
- `this.key({h: fn, ' ': fn})` keyboard shortcuts.
- `this.emit(type, data)` → challenge/stat events (see below).
- `this.rackFor(min)` → six chip denominations starting at the table min.

## Stage (js/core/stage.mjs)
- Units are METRES. Y up. Felt surface is y = 0. The player sits at +Z looking toward −Z (the dealer side).
- `stage.applyView({landscape:{pos,look,fov,fitWidth,maxFov}, portrait:{...}}, seconds)` sets the base
  camera (portrait is chosen when width/height < .9). `fitWidth` widens the lens so that many metres fit
  across at the look-target distance — use it for portrait phones.
- `stage.shot({pos,look,fov}, seconds)` temporary close-up; `stage.back(seconds)` returns to the base view.
- `stage.onFrame(dt => ...)` per-frame callback (returns an unsubscribe fn — base cleanup does NOT
  remove frame callbacks automatically, so keep the unsubscribe and call it in dispose(), or guard with `this.alive`).
- `stage.tw` = `this.tw`: `await tw.to(obj, {x:..}, {dur, ease, delay})`, `await tw.run(dur, (e, p) => ..., {ease})`,
  `await tw.wait(s)`. Eases: linear, outCubic, inOutCubic, outBack, outExpo, outBounce, inOutSine, outQuart...
- `stage.tier` is 'high' | 'mid' | 'low'. On 'low' skip expensive extras (extra lights, particles, transmission).
- Lighting rig already exists: warm key SpotLight over (0,0,0) (`stage.key`), fills, env reflections. You may
  move `stage.key.position`/`stage.key.target.position` for your table (restore in dispose()).

## Backdrop / Ace the dealer (js/core/dealer.mjs)
- `this.backdrop.setRoom('dealer')` → the lounge with Ace (live video). `'empty'` → empty lounge (machines).
- `this.backdrop.place({ z, railY, width, x, rotY })` puts the painting's rail line at world (x, railY, z).
  Put it just behind your table's far rail: `z = farEdgeZ - .03`, `railY = .057` (rail top), `width ≈ 1.95`
  (that makes Ace life-sized next to a 2 m table). For machines (`'empty'`) use a bigger width (~3–4) further back.
- `this.backdrop.play(clip)` clips: `'deal'` (reaches onto the felt), `'win'` (nod + thumbs up),
  `'lose'` (sympathetic shrug), `'big'` (applause, for big wins), `'nomore'` (sweeping “no more bets”), `'cuff'`.
  Call them at the matching moments — it is what makes the game feel alive. They queue; don't spam.

## Tables & props
- `buildTable(stage, { outline, felt:{color, size:[2048], paint(ctx, P, S, W, H)}, tray })` in `js/core/tables.mjs`
  - outline `{type:'bj', a, b, zf}` (straight dealer edge at z=zf, arc toward player),
    `{type:'stadium', L, R, zc}` (poker racetrack), `{type:'rect', W, D, r, zc}` (roulette/craps).
  - `paint` draws the printed felt layout on a canvas: `P(x,z)` → canvas px, `S(metres)` → px.
    Helpers exported: `arcText, ring, rrect, text, PRINT, PRINT_SOFT`.
  - returns `{group, felt, feltTex, feltCanvas, P, S, bounds, railTop, outline}`.
  - `tray:{x,z,w,chips:this.chips}` adds the dealer's chip float.
- `hitSpot(parent,x,z,r,data)` / `hitRect(parent,x,z,w,d,data)` invisible raycast targets (data lands in userData).
- `glowRing(parent,x,z,r,color)` additive glow (animate `.material.opacity`).
- `cardShoe(stage, this.cards, {x,z,rotY})` → `{group, mouth}` (mouth = world Vector3 where cards leave).
  `discardTray(stage, {x,z,rotY})` → `{point}`.
- Cards (`js/core/props.mjs`): `const o = this.cards.make({r,s}, faceUp)` (r 2..14, s 0♠ 1♥ 2♦ 3♣).
  A card lies flat in XZ, face up = rotation.z 0, face down = π. `CARD = {w:.0756,h:.1056}`.
  `await dealCard(tw, o, fromVec3, toVec3, {faceUp, dur, rotY, lift})`, `await flipCard(tw, o)`.
  `o.setCard({r,s})` changes the face.
- Chips: `this.chips.chip(value)` one chip mesh; `this.chips.stack(amount)` a group;
  `new ChipPile(stage, this.chips, parentGroup, localPosVec3)` a betting spot pile with
  `.set(amount)`, `await .add(value, fromWorldVec3, tw)`, `await .sweepTo(worldVec3, tw, {dur})`, `.clear()`, `.dispose()`.
  `CHIP = {r:.028, h:.0048}`. Denominations: 10, 25, 100, 500, 1000, 5000, 25000.
- Dice: `makeDie()` (edge `DIE = .026`), `dieRestQuat(value, yaw)` quaternion that puts `value` on top.
- Card faces for HTML: `cardImageURL(r, s, width)` in `js/core/textures.mjs`; chip images `chipImageURL(v)`.
- Randomness: `rand(n)`, `shuffle`, `deck(n)`, `Shoe` in `js/core/rng.mjs` — crypto RNG. Never use Math.random for outcomes.

## Money (js/core/economy.mjs) — follow exactly
- Chips leave the player's balance the moment they hit the felt: `bank.stake(n)` (returns false if not affordable).
- Taking chips back before the round is played: `bank.unstake(n)`.
- When a round resolves: `bank.settle(totalStakedThisRound, totalReturnedIncludingStakes, '<gameId>')`.
  Call it exactly once per round (per spin / hand / roll that resolves bets). Bets that stay on the layout
  across rolls (craps pass line, come bets) should stay "staked" until they resolve.
- `bank.balance` is the live balance (topbar updates itself through events).

## HUD (js/core/hud.mjs) — `this.hud`
- `hud.say(text)` Ace's line at the top. Keep it short and classy.
- `hud.rack(denoms, onSelect)`, `hud.selected` (current chip value), `hud.rackEnabled(bool)`, `hud.affordable(balance)`.
- `hud.actions([{id,label,sub,kind:'primary'|'ghost'|'danger',onClick,disabled,hot,key}])` the right-hand buttons.
  Max ~5 buttons (phones!). Primary = the gold one.
- `hud.bet(label, amount, extraHtml)` the left TOTAL BET readout.
- `hud.anchor(id, worldVec3, html, cls)` HTML label glued to a 3D point; classes `tag`, `tag gold`, `tag win`,
  `tag lose`, `tag big`. `hud.unanchor(id)`, `hud.clearAnchors()`.
- `await hud.banner({title, amount, kind:'win'|'lose'|'push'|'big', sub, hold})` big centred result.
- `hud.toast(html, 'gold')`, `hud.sheet(html, 'wide')`.
- `floatText(hud, worldVec3, '+500')` rising number.
- The console occupies the bottom ~90px (desktop) / ~130px (phone portrait) of the screen and the top bar
  ~58px + Ace's line ~40px. Frame your camera so the play area is not hidden under them.

## Sound (js/core/audio.mjs) — `this.sound`
`chips(n)`, `card()`, `play('win'|'lose'|'push'|'tick'|'reel'|'chip'|'card')`, `chime(level)`, `fanfare()`,
`coin(t)`, `thunk(t)`, `lose()`, `whoosh()`, `dice(hits[{t,v}])`, `ballLoop()` → `{set(speed0..1), clack(v), stop()}`,
`reelSpin()` → `{stop()}`, `tone(freq,{...})`, `noise({...})`.

## Challenge events — emit these exactly (the daily challenges listen for them)
- blackjack: `emit('hand', {net, natural, doubledWin, won})`
- holdem: `emit('hand', {won, showdown, rank, net})` (rank 0 high card … 8 straight flush)
- roulette: `emit('spin', {net, straightHit})` (straightHit = a straight-up number bet won)
- slots: `emit('spin', {net, freeSpins, multiple})` (freeSpins = this spin triggered free spins; multiple = win ÷ total bet)
- baccarat: `emit('hand', {net, bankerWin, natural9})` (bankerWin = player had a Banker bet that won; natural9 = the winning hand was a natural 9)
- craps: `emit('roll', {net, pointMade})` every roll (pointMade = the shooter made the point this roll)
- videopoker: `emit('hand', {net, rank})` (rank: 0 nothing, 1 jacks+, 2 two pair, 3 trips, 4 straight, 5 flush, 6 full house, 7 quads, 8 straight flush, 9 royal)

## Quality bar
- Real casino rules and payouts, verified with a Node script (`node --input-type=module`) before you ship.
- Every state change is animated: chips fly, cards arc and flip, cameras push in for the reveal and pull back.
- Clear readable labels (anchors) for totals/bets/results. Result banner every round. Ace reacts.
- Phone portrait must be fully playable: test at 390×844 as well as 1600×900.
- Never block the UI thread; never throw. Guard every await chain with `if (!this.alive) return;`.
- Keep draw calls reasonable (< ~400); reuse geometries/materials; mark meshes you create with unique
  geometry `userData.ownGeo = true` / materials `userData.ownMat = true` so the stage disposes them.

## Testing
Serve this folder over HTTP (e.g. `python3 -m http.server 8765`) and open `http://localhost:8765/#<gameId>`;
`?q=high|mid|low` forces a quality tier. `window.__casino` is the app (`__casino.current` is the running game).
Headless screenshots work with Playwright + Chromium launched with `--use-angle=swiftshader --enable-unsafe-swiftshader`
(software rendering, so a few fps — use generous waits). Check at 1600×900 and 390×844. There must be no console errors.
Every rules module has a Node verification script (see README.md) — run it after any rules change.
