# Deploy notes — Cook County Cooks

**GitHub Pages is an interim host.** The site's permanent home is Cloudflare.
Live (interim): https://blufoxmobile.github.io/Cook-County-Cooks-Site/

## Why this repo moved (2026-09-11)
It lived under `projectknoxsolutions`, which GitHub flagged: the owner still
sees everything normally and the repo still reads "Public", but the
unauthenticated world gets 404 and Pages goes dark. It was republished under
`jeffbilbrey1985`, and within hours THAT account was flagged the same way.

`BlufoxMobile` is the one account verified healthy, so the repo lives here now.

**How to test an account for the flag — do this BEFORE any DNS change:**

    curl -s -o /dev/null -w "%{http_code}\n" https://api.github.com/users/<account>
    curl -s -o /dev/null -w "%{http_code}\n" https://api.github.com/users/torvalds   # control

404 against a 200 control means flagged. Note that pushing still SUCCEEDS from a
flagged account, because the owner is authenticated — a green push proves
nothing about whether anyone else can see the result. Run this from a normal
machine, not from a Claude cloud container: that proxy gates GitHub per-repo and
returns its own 403, which is easy to mistake for a GitHub answer.

## What this repo is
The static preview build of the "walk through the restaurant" one-page site:
seven rooms (Pass → Host → Dining → Prep → Office → Breakroom → Freezer),
a pinned top menu, and tools that open as full-screen overlays. All paths are
relative and there is no build step — the repo root is served as-is.
`.nojekyll` is present so the `assets/` folder is not Jekyll-processed.

## Known-and-intended, not bugs
- **The freezer is sealed, not gated.** The fourteen manager tools are not in
  this repo at all. `data/freezer.sealed.json` (and the identical copy inlined
  in `index.html`) is AES-256-GCM ciphertext; the key is PBKDF2-HMAC-SHA256 over
  the manager password, 600,000 iterations, random per-build salt. A wrong code
  fails the AEAD tag and produces nothing. The plaintext lives OUTSIDE this repo
  at `../ccc-build/secret/freezer-tools.json`; `build/seal-freezer.mjs` is the
  only thing that reads it. Re-seal after any change to the manager tool list.
  NOTE: earlier commits in this repo's history still contain the plaintext
  fourteen. If the repo is public, treat those URLs as already disclosed until
  the history is rewritten.
- **No cinematic room-to-room walk yet.** Frame sequences render on the Mac GPU
  later; the site auto-upgrades via the frames manifest once they exist.
- **Print Outs section has no content yet.**

## Still to do (handled in the other session, with Jeff present)
- Move hosting to Cloudflare; point cookcountycooks.com at it (currently still
  serving the old GoDaddy site).
- (done, differently) The freezer no longer needs a server: it is encrypted at
  rest in the deployed tree. `/api/freezer-unlock` is gone.
- Employee-of-the-Week auto-sync from the Win-The-Weekend decks
  (Big South + Chicago).
- cookcountycaptains.com redirect into the freezer.

## Build steps (run here, commit the output; nothing runs at serve time)
- `FREEZER_PASSWORD='…' node build/build.mjs` — seals the freezer AND
  fingerprints every plate/JS/CSS asset. Run it after ANY edit to
  `assets/*`, `rooms.js`, `plates/*` or the manager tool list. That includes
  edits to `assets/theme.css`: the script rewrites it mechanically, so nobody
  has to hand-edit hashed URLs into it.

## Do not
- Add a C³ logo. The brand mark on this site is the full name "Cook County Cooks".
- Commit the freezer password, or any hash of it, to this public repo.

## The break-room chef wall, and how it follows the decks
`headchefs/headchefs.json` and `headchefs/photos/*.webp` are GENERATED. Nothing
here is hand-edited. `.github/workflows/headchefs.yml` re-reads the two
Win-The-Weekend decks with `build/pull-headchefs.mjs` and commits `headchefs/`
only when a VISITOR could see the difference. A quiet week produces no commits.

It is woken three ways, and they are deliberately independent:
- **The clock.** Every 30 minutes all week, and on Friday mornings every 5
  minutes from 12:00–17:59 UTC (covers 8–11am Chicago in both CST and CDT).
- **A deck push.** Each deck repo has `.github/workflows/tell-the-break-room.yml`,
  which rings this repo the moment a deck goes up. See the key below.
- **By hand.** Actions → Head chefs → Run workflow.

If the key is missing or dead the wall is not broken — it just goes back to
waiting for the clock. That is why the clock stays.

### The key: BREAK_ROOM_TOKEN
The decks AND this site now both live under **BlufoxMobile** (moved there on
2026-09-11 — see "Why this repo moved" below). A workflow still cannot reach
another repo without a credential, even under the same owner, so the token is
still required.

Make it signed in as **BlufoxMobile**:
avatar → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token.
- Name `break-room-wall-dispatch`, resource owner **BlufoxMobile**
- Repository access → Only select repositories → **Cook-County-Cooks-Site**
- Permissions → Repository permissions → **Contents: Read and write**. Nothing
  else. (Metadata: Read-only switches itself on and cannot be removed.)
- Copy the token — GitHub never shows it again.

Then add it to BOTH deck repos (same account, same session): repo → Settings →
Secrets and variables → Actions → New repository secret → name exactly
`BREAK_ROOM_TOKEN`.

**Any token issued by `projectknoxsolutions` or `jeffbilbrey1985` is dead for
this purpose** — both accounts are flagged, and the dispatch endpoint answers
404 for them. Reissue from BlufoxMobile.

If fine-grained tokens are blocked for the org, a classic token with ONLY the
`public_repo` scope works and needs no approval — wider blast radius, same job.

**When it expires** the deck workflow goes red on your own next deck push and
says so in plain English. The wall keeps working on the clock. Remake the token
and replace the secret; the name never changes.

### When the wall looks wrong
`.github/workflows/headchefs-watchdog.yml` opens ONE issue titled "The
break-room wall may be showing last week's chefs" when the pull is disabled,
has not SUCCEEDED in 4 hours, failed its last run, or a deck was pushed and
never read. It keeps that one issue up to date rather than commenting, and
closes it on recovery. If there is no such issue, the pipeline believes it is
healthy — so a wrong wall with no issue open means the deck itself, not the job.

Prove the whole pipeline end to end without waiting for a deck edit:
`node build/pull-headchefs.mjs`. It reaches raw.githubusercontent.com even
where headless Chromium cannot reach blufoxmobile.github.io.
