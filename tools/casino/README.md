# C³ Blufox Casino

Texas Hold'em, Blackjack, European Roulette and Xfinity Gateway Slots, with the
blue fox dealer, five AI poker opponents and a mobile layout. **Free play chips
only** — no wagering, no purchases, no cash value, and the balance resets on a
new visit.

Originally built in ChatGPT and handed over as a zip. Two things changed on the
way in, both recorded here so nobody wonders later.

## 1. The music is generated, not a file

It shipped playing `assets/audio/late-shift.m4a` on `loop`. That file was
**24.7 seconds long**, which is exactly long enough to notice and then be unable
to stop noticing.

`lofi-engine.mjs` replaces it: a procedural WebAudio lo-fi beat, ~77 BPM and
swung, seventh and ninth chords over a synthesised kit, with vinyl crackle and
tape wow. It never loops, the arrangement thins out and fills back in, and a
seeded PRNG makes each session a little different. It also deleted 486 KB.

Measured on a 200-second offline render: 77.34 BPM, swing 0.589 of the beat,
peak −3.4 dBFS, RMS −18.0 dBFS, 99% of the energy below 4 kHz, and a
minute-1-vs-minute-3 correlation of +0.37 (i.e. the same music, not the same
bars). 2,324 audio nodes created and 2,324 freed over a 70-second run.

If it ever costs too much on a store iPad, the first thing to cut is the
`ConvolverNode` — set `verbSend.gain.value = 0` and the filtered delay carries
the room on its own.

The short `.wav` foley in `assets/audio/` is untouched. Those are meant to repeat.

## 2. The art is WebP

Three photographic images shipped as PNG at 6.8 MB between them. As WebP q82
they are **0.5 MB**, and a 1:1 crop comparison shows no visible difference. The
small transparent `xb*.png` sprites are unchanged.

## Where it lives

`tools/casino/`, served same-origin from cookcountycooks.com, so the arcade
frames it with no cross-origin anything. It is listed in `arcade/manifest.json`
and `data/tools.json` under the slug `casino`, like every other cabinet.

No build step, no dependencies, no server, no credentials. It must be served
over HTTP — opening `index.html` as a `file://` URL blocks the ES modules.
