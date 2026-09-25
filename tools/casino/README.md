# Blufox Casino & Lounge (v2 — 3D)

Seven 3D games dealt by **Ace**, the blue fox — a live video dealer — in a private
high-limit salon over the Chicago skyline. **Play chips only**: nothing to buy,
nothing to win, no cash value.

| # | Game | Notes |
|---|------|-------|
| 1 | Blackjack | 6 decks, S17, 3:2, double/split/surrender/insurance, up to 3 spots, 21+3 side bet, Ace's basic-strategy tips |
| 2 | Texas Hold'em | 6-max no-limit vs Maya, Marcus, Kai, Elena, Rico; three stake levels; side pots |
| 3 | Roulette | European single zero, all 157 bets, a modelled wheel with real ball choreography |
| 4 | Midnight Fox | 5×3 video slot, 20 lines, wild fox, sapphire free spins ×2 — 95.97% RTP (exact) |
| 5 | Baccarat | Punto Banco, 8 decks, pairs, the card squeeze, Bead Plate + Big Road |
| 6 | Craps | full Vegas layout, odds 3-4-5×, the player throws the dice (swipe or ROLL) |
| 7 | Video Poker | Jacks or Better 9/6, exact-EV "Ace's pick" hint — 99.54% with perfect play |

Everything around the tables: chips that **carry over between visits** (saved on the
device), a **daily bonus** streak, three **daily challenges**, **Ace's marker** when you
go broke, and a weekly **"Biggest Stack" leaderboard** shared across every Blufox player.

## How it's built

Plain ES modules, **no build step**, no CDN. Served same-origin from
`cookcountycooks.com/tools/casino/` and framed by the C³ Arcade (`arcade/manifest.json`,
`data/tools.json`, slug `casino`). Must be served over HTTP (not `file://`).

```
index.html, casino.css           shell: loader, top bar, lobby, console, sheets
js/main.mjs                      app: boot, lobby, routing (#blackjack …), top-bar sheets
js/vendor/three.min.mjs          three.js r186 + addons, bundled with esbuild (see below)
js/core/stage.mjs                renderer, camera presets (landscape/portrait), lights, quality tiers
js/core/dealer.mjs               Ace: the lounge still + video clips composited in one shader
js/core/tables.mjs               table builder (felt canvas printing, rail, apron, tray, shoe)
js/core/props.mjs                cards (canvas atlas), chips, chip piles, dice, pucks
js/core/textures.mjs             every printed surface drawn in code (cards, chips, dice, felt)
js/core/hud.mjs                  HTML overlay: rack, buttons, 3D-anchored labels, banners
js/core/economy.mjs              Bank (localStorage), daily bonus, challenges
js/core/board.mjs                leaderboard client (never blocks play)
js/core/audio.mjs                WebAudio foley + synthesised effects; lofi-engine.mjs = the score
js/games/<id>.mjs, js/rules/<id>.mjs   one game each; rules are pure and unit-tested
worker/worker.js                 the leaderboard Cloudflare Worker (source of record)
GAMEDEV.md                       the developer guide — read it before changing a game
```

Quality tiers are picked per device (`?q=high|mid|low` forces one) and step down
automatically if the frame rate can't hold. Phones get the `-m` video and still.

## Ace (the video dealer)

`assets/img/lounge-still.webp` is the salon with Ace in his rest pose; the clips in
`assets/video/` (idle, deal, win, lose, big, nomore, cuff) all start and end on that exact
frame, cropped at the table rail, so the shader can cut between them invisibly.
MP4/H.264 for Safari and anything that plays it, WebM/VP9 otherwise; `-m` files for phones.
Generated with Higgsfield (MiniMax H3, start frame = end frame = the plate).

## Leaderboard

Cloudflare Worker `c3-casino` → https://c3-casino.jeff-bilbrey-jb.workers.dev
(KV namespace `C3_CASINO_BOARD` bound as `BOARD`). `GET /top?week=…&district=…`,
`POST /submit`. A submit that doesn't beat the player's stored peak is answered without a
KV write (the free tier's 1,000 writes/day is shared with C³ FOX RUN). To clear a week,
delete its `wk:<week>` key in the KV dashboard.

## Verifying the maths

```
node js/rules/slots.mjs test | exact | mc 5000000
node js/rules/videopoker.mjs
node js/games/roulette-verify.mjs
node js/games/craps-test.mjs
node js/games/baccarat-verify.mjs
node js/games/holdem-test.mjs
```

## Rebuilding three.js

```
npm i three@0.186.1 esbuild
# vendor-entry.mjs: export * from 'three' + RoomEnvironment, RoundedBoxGeometry,
# EffectComposer, RenderPass, UnrealBloomPass, OutputPass, mergeGeometries
npx esbuild vendor-entry.mjs --bundle --format=esm --minify --outfile=js/vendor/three.min.mjs
```
