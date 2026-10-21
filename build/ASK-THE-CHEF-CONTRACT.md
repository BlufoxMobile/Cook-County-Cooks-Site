# Ask the Chef — build contract (shared by every agent)

Jeff's brief: an "Ask Jeeves" for cookcountycooks.com. A rep types a plain-English
question ("how do I add Xfinity Shield in CSG", "how do I open the store in Celestial")
and the bot returns the EXACT place on the site — the step-by-step, screenshots,
videos, PDFs — not just a tool name.

## Decisions Jeff made (do not revisit)
- Name: **Ask the Chef**.
- Brain: **Hybrid** — instant on-device retrieval first; only when confidence is low
  does the page call a Cloudflare Worker that asks Claude to pick among the
  retrieved candidates. The API key lives only in the Worker.
- Locked guides (CSG How To, Request Access — passcode/AES-GCM encrypted): the bot
  may NAME the exact transaction/step and deep-link to it, but the guide still asks
  for the passcode. Never ship locked step bodies or screenshots in the index.
- Placement: a big "Ask the Chef" bar in the hero + a floating button that follows
  through every room AND the phone (pocket) view.
- The Walk-In Freezer (sealed manager tools) is NEVER indexed, named, or hinted at
  beyond the existing "Manager tools — enter code" pattern in assets/find.js.

## Site facts every agent must respect
- Static site, GitHub Pages behind Cloudflare, repo root served as-is. Plain ES
  modules, no bundler. `data/tools.json` is the one tool list (rooms + tools,
  optional `aliases`). `window.__CCC_INLINE__` in index.html is the inline copy
  app reads; build/sync-inline-tools.mjs keeps it in sync.
- Tools open as overlays at `#/tool/<slug>` (overlay.js). Same-origin guides live in
  `tools/<slug>/index.html` and route internally on their OWN hash (e.g. BAPIS uses
  `#/~s3`, `#/~tips`).
- Two front ends: `cinema.js` (iPad/desktop restaurant) and `pocket.js` (phones).
  Primary devices: store iPads + desktops; phones must work too.
- assets/theme.css defines many bare class names — **every new class must be
  prefixed `ask-`** and you must grep theme.css before introducing one.
- Build steps rewrite hashed filenames (build/fingerprint.mjs). New modules must be
  added the way existing modules are so fingerprinting picks them up. Never run
  build/build.mjs (it needs the freezer password); fingerprint.mjs alone is OK.
- Spelling: the company is **Blufox** (never "Bluefox").

## The index: `data/ask-index.json` (produced by build/ask-index.mjs)
```json
{
  "version": 1,
  "built_at": "ISO",
  "docs": [
    {
      "id": "csg-how-to/xh/shield-select-add",      // stable, unique
      "kind": "tool|section|step|printout|video|game|room|faq",
      "title": "Add Xfinity Shield Select",          // what the rep would call it
      "crumbs": ["CSG How To", "XH", "Shield Select"],
      "tool": "csg-how-to",                          // slug in data/tools.json
      "room": "office",
      "anchor": "~xh-shield-add",                    // guide-internal hash, or ""
      "locked": false,                               // true => passcode guide
      "text": "≤700 chars of plain text (empty for locked)",
      "keywords": ["shield", "security", "xh"],
      "steps": [ { "n": 1, "text": "…", "img": "tools/bapis/shots/ab12.webp" } ],
      "media": [ { "type": "image|video|pdf|hls", "src": "site-relative path",
                   "alt": "…", "poster": "optional" } ]
    }
  ]
}
```
- `steps` is present on a `section` doc when it IS a step-by-step transaction, so
  the chat can show the whole walkthrough inline. Omit for locked docs.
- Every `src` is site-relative and must exist in the repo (the indexer asserts it).
- Link the UI builds: `#/tool/<tool>` + (anchor ? `/<anchor>` : "") — see the
  deep-link rule below.

## Deep-link rule
`#/tool/<slug>/<rest>` must open the overlay on <slug> AND land the framed guide on
its own `#/<rest>`. The UI agent owns making overlay.js forward `<rest>` into the
iframe src (verify whether it already does; app.js already preserves it).

## Engine API: `assets/ask-engine.js` (pure, no DOM)
```js
export function createAsk({ index, tools, rooms }) -> {
  search(q, { limit = 8 }) -> [{ doc, score, why: [string] }],
  answer(q) -> { mode: 'direct'|'choices'|'none', primary, alternates: [doc],
                 confidence: 0..1, candidates: [doc] /* top 12 for the Worker */ }
}
export const LOW_CONFIDENCE = 0.55; // below this the UI asks the Worker
```

## Worker API: `worker/ask-chef/` (Cloudflare Worker)
`POST https://<worker>/ask` body `{ q, candidates: [{id,title,crumbs,text,locked}] }`
→ `{ picks: [id, …] (≤3, only ids from candidates), reply: "≤2 sentences, grounded
only in candidates", none: bool }`. CORS limited to cookcountycooks.com (+ localhost
for testing). Per-IP rate limit. Key in a Worker secret. Times out ≤8s; the UI must
fall back to local results on any error.
