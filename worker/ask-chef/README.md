# Ask the Chef: AI helper (Cloudflare Worker)

This little server is the "AI fallback" behind the **Ask the Chef** bar on
cookcountycooks.com. Most questions are answered instantly on the rep's own device by the
site's built-in search. Only when that search is unsure does the page send the question,
plus the 12 best pages it found, to this Worker. The Worker asks Claude to choose which of
those pages answer the question and to write a 1-2 sentence pointer. Claude can only pick
from the pages it was sent. It cannot make up new pages, links, prices or steps, and it never
sees the passcode-locked guide contents.

If the Worker is down, slow, over its limit or not set up yet, the page just shows its own
search results. Nothing breaks.

```
worker/ask-chef/
  src/index.js    the Worker, plus the AskLimiter counter (a Durable Object)
  wrangler.toml   the Worker's settings: name, domain, limits, the counter
  test/           local tests:  node worker/ask-chef/test/run.mjs
```

---

## What you need before you start

1. **A Claude Console account and an API key.** Go to https://platform.claude.com and sign in
   or sign up. Add a payment method under **Billing**, then go to **API Keys > Create Key**.
   Name it `ask-chef` and copy the key (it starts with `sk-ant-`). You'll only see it once.
2. **Your Cloudflare login**: the same account that has the cookcountycooks.com zone and the
   casino leaderboard Worker.
3. **GitHub access to the site repo.** Cloudflare will deploy this Worker straight from it.

Keep the API key out of email, Teams, GitHub and the website. It only goes into Cloudflare as
a **Secret** (step B4).

---

## Step A (REQUIRED, do it first): put a hard spend limit on the Claude account

This is the one limit nobody can get around, so set it **before** the site is told about the
Worker (step C).

- Claude Console > **Settings > Billing** (https://platform.claude.com/settings/billing) >
  **Spend limits** > **Set limit**. Enter **$10** a month.
- Once the limit is reached, Claude refuses every request until the next month or until you
  raise it. Ask the Chef then quietly falls back to its own search results.
- The Worker's own daily cap (300 answers, about $0.12 to $0.27 a day) keeps normal use far
  below $10. The spend limit is the backstop if anything else ever fails.
- Optional: put the `ask-chef` key in its own **Workspace** (Console > Workspaces) with its own
  lower spend and rate limits. Then nothing else on the account is affected.

---

## Step B: deploy the Worker (Cloudflare dashboard, no command line)

The Worker needs a small counter (a Cloudflare **Durable Object**) to enforce its limits
exactly. Cloudflare only creates Durable Objects during a "wrangler deploy". The dashboard's
paste-the-code editor can't make one, so this Worker isn't pasted. Instead, Cloudflare deploys
it straight from GitHub (**Workers Builds**), which runs that deploy for you.

Durable Objects are included in the **Workers Free plan** (SQLite-backed, which is what this
Worker uses). Free-plan allowance: 100,000 requests a day and 100,000 rows written a day.
Ask the Chef uses about 2 of each per question. Workers Builds on the free plan gives 3,000
build minutes a month; each deploy takes about one minute.

**B1. Connect the repo**
- Cloudflare dashboard > **Workers & Pages** > **Create** > **Import a repository** (or
  "Connect to Git"). Pick GitHub, authorise Cloudflare if asked, and choose the
  cookcountycooks site repo.
- In the build settings:
  - **Project / Worker name:** `ask-chef` (it must match `name` in `wrangler.toml`)
  - **Root directory (path):** `worker/ask-chef`
  - **Build command:** leave empty
  - **Deploy command:** leave the default, `npx wrangler deploy`
  - **Production branch:** the branch the site deploys from (usually `main`)
- **Save and Deploy.** The first build creates the Worker, the AskLimiter counter, and the
  address **https://ask.cookcountycooks.com**.

If the first build fails on the domain (an `ask` DNS record already exists, or the zone is in
another Cloudflare account), open `wrangler.toml`. Delete the `[[routes]]` block and change
`workers_dev = false` to `workers_dev = true`, then push. The Worker then lives at
`https://ask-chef.jeff-bilbrey-jb.workers.dev` instead. That still works, but the WAF rule in
step D can't protect a workers.dev address.

**B2.** The Worker now appears under **Workers & Pages > ask-chef**. Its counter shows under
**Storage & Databases > Durable Objects** as `AskLimiter`. There is nothing to add by hand:
`wrangler.toml` binds it as `ASK_LIMITER`.

**B3. Make a random salt.** Any long random text works, for example 40 characters mashed on
the keyboard, or a password manager's "generate password". It never has to be typed again.
The Worker uses it to scramble IP addresses before counting them, so the counter never holds
a real address.

**B4. Add the two secrets**
- **ask-chef** > **Settings** > **Variables and Secrets** > **Add**:
  - Type **Secret**, name **`ANTHROPIC_API_KEY`**, value: the `sk-ant-...` key
  - Type **Secret**, name **`IP_SALT`**, value: the random text from B3
- **Deploy**.
- Both are required. Without either one, the Worker answers `503 not_configured` and never
  calls Claude.

**B5. Check it's alive.** Open https://ask.cookcountycooks.com/health in a browser. You
should see `{"ok":true}`.

### Changing settings later
The limits live in `wrangler.toml` under `[vars]`:

| Name | Default | What it does |
|---|---|---|
| `DAILY_CAP` | `300` | Most Claude answers per day for the whole site. Resets at midnight Central. |
| `PER_IP_MINUTE` | `20` | Most questions per minute from one network (IPv6: per /64). |
| `PER_IP_DAY` | `300` | Most questions per day from one network. |
| `ALLOW_LOCALHOST` | `false` | **Keep `false` in production.** `true` only while testing on your own computer. |

Edit the file and push. Cloudflare redeploys within a minute or two. Don't change these in
the dashboard: the next deploy puts back whatever `wrangler.toml` says. Secrets are never
touched by a deploy.

A whole store shares one internet connection, so "per network" really means "per store".
20 a minute per store is plenty for AI fallbacks.

### Updating the Worker
Push a change to `worker/ask-chef/` and Cloudflare redeploys automatically. The counter, the
secrets and the domain carry over.

### Turning it off fast
- Delete the `<meta name="ask-chef-endpoint">` line from the site, or
- set `DAILY_CAP = "1"` in `wrangler.toml` and push, or
- delete or disable the key in the Claude Console (instant).

---

## Step C: tell the site where the Worker is (one line). Only after step A.

In `index.html`, inside `<head>` next to the other `<meta>` tags, add:

```html
<meta name="ask-chef-endpoint" content="https://ask.cookcountycooks.com">
```

(If you had to fall back to workers.dev in B1, use that URL instead, with no trailing slash.)
Commit and push as usual. If the line is missing or empty, Ask the Chef still works on its
own search, just without the AI fallback.

---

## Step D (recommended): a Cloudflare WAF rate-limiting rule in front

This is an extra layer. Cloudflare counts and blocks floods at the edge before the Worker even
runs, so a flood never touches the counter. It only works on the `ask.cookcountycooks.com`
address, not on workers.dev.

- Cloudflare dashboard > **cookcountycooks.com** (the zone) > **Security** > **Security rules**
  > **Create rule** > **Rate limiting rules**.
  - **Rule name:** `Ask the Chef flood guard`
  - **Field / Operator / Value:** `URI Path` *equals* `/ask` (the free plan only offers the
    Path and Verified Bot fields. Nothing else on cookcountycooks.com uses `/ask`, so this
    only catches the Worker. On Pro or above you can add `Hostname` *equals*
    `ask.cookcountycooks.com`.)
  - **With the same characteristics:** IP (the only choice on the free plan)
  - **When rate exceeds:** `10` requests per `10 seconds` (the free plan's only period)
  - **Then take action:** **Block**, **Duration** `10 seconds`
  - **Deploy**
- The free plan includes **one** rate-limiting rule for the whole zone. If it's already used
  for something else, skip this step. The Worker's own limits still apply.
- A real rep never asks 10 AI questions in 10 seconds. A store full of reps behind one IP is
  still far under it.

---

## Deploy with the command line instead (wrangler)

From the repo root, with Node 20+:

```bash
cd worker/ask-chef
npx wrangler@4 login
npx wrangler@4 deploy                         # creates the Worker, the AskLimiter counter and the domain
npx wrangler@4 secret put ANTHROPIC_API_KEY   # paste the key when asked
npx wrangler@4 secret put IP_SALT             # paste any long random text
curl https://ask.cookcountycooks.com/health
```

Local dev against the real API: set `ALLOW_LOCALHOST = "true"` (locally only, never pushed).
Put `ANTHROPIC_API_KEY=...` and `IP_SALT=...` in a `.dev.vars` file next to `wrangler.toml`
and never commit it. Then run `npx wrangler@4 dev`.

`wrangler.toml` also has an optional Cloudflare **Rate Limiting binding** block (`RL`),
commented out. It is an approximate per-location burst guard and isn't needed: the Durable
Object already enforces the real limits.

**If Durable Objects were ever unavailable on your plan:** they are on Workers Free today
(SQLite-backed). If that changed, the fix is Workers Paid ($5/month, which includes 1 million
Durable Object requests a month). No code change is needed.

---

## API (for the page)

`POST /ask` with a JSON body. Send `content-type: application/json`, or `text/plain` to skip
the CORS preflight:

```json
{ "q": "how do I add shield in csg",
  "candidates": [ { "id": "csg-how-to/xh/shield-select-add", "title": "Add Xfinity Shield Select",
                    "crumbs": ["CSG How To","XH","Shield Select"], "text": "", "locked": true } ] }
```

Response `200`:

```json
{ "picks": ["csg-how-to/xh/shield-select-add"],
  "reply": "Open CSG How To > XH > Shield Select. That guide asks for the passcode.",
  "none": false }
```

| Status | Meaning | What the page should do |
|---|---|---|
| 200 | An answer (`none:true` means nothing fit). | Show it. |
| 400 / 413 / 415 | Bad input: q over 300 chars, more than 12 candidates, a field too long, or bad JSON. | Use local results. |
| 403 | Origin not allowed. | Use local results. |
| 429 | Rate limit or daily cap. The body has a friendly `message`; there's a `Retry-After` header. | Use local results (optionally show `message`). |
| 502 | Claude slow (over 7 s), down, or gave an odd answer. | Use local results silently. |
| 503 | Worker not set up (missing key, salt or counter), or the counter can't be reached. | Use local results. |

Every response is JSON with CORS headers for the allowed origins, so the page can always read
it. The whole `/ask` request finishes within about 7.5 s. `GET /health` returns `{"ok":true}`.

Input limits (enforced, otherwise `400`):

| Field | Limit |
|---|---|
| `q` | 1-300 chars |
| candidates | 1-12 |
| `id` | up to 120 chars of `A-Z a-z 0-9 _ - / ~ . : #`, unique |
| `title` | up to 140 chars |
| `crumbs` | up to 6 items, 60 chars each |
| `text` | up to 700 chars |
| `locked` | boolean |

Text sent for a `locked` candidate is thrown away before anything goes to Claude.

---

## How it stays safe and cheap

**Hard ceilings, from strongest to weakest**
1. **Claude Console spend limit** (step A). Enforced by Anthropic on every request.
2. **`DAILY_CAP`** (300 a day). One Durable Object instance holds every counter and handles one
   request at a time. It **reserves a slot before Claude is called**, and a slot used by a
   failed call is not handed back. So no more than `DAILY_CAP` Claude calls can happen in a
   Central day, however many requests arrive at once and from wherever. Tested: 50
   simultaneous requests with a cap of 5 lead to exactly 5 Claude calls.
3. **Per network:** 20 a minute and 300 a day. IPv6 addresses are counted per /64, so one
   connection can't rotate through endless addresses.
4. **WAF rule** (step D): floods are blocked at Cloudflare's edge.

**Fails closed.** If the counter can't be reached or answers strangely within 1.5 s, the Worker
returns 503 and does **not** call Claude.

**The origin check is not a security boundary.** Only `https://cookcountycooks.com` and
`https://www.cookcountycooks.com` get CORS access (plus `http://localhost:*` when
`ALLOW_LOCALHOST` is `"true"`, so keep it `"false"`). That stops other websites from using a
visitor's browser. But a script can fake the Origin header, which is why the limits above are
what actually protect the bill.

**One address only.** `workers_dev = false` turns off the `*.workers.dev` address, so there's
no second door around the WAF rule. Trade-off if you keep workers.dev instead (see B1): the
Worker's own limits and the spend limit still hold, but the edge WAF layer is missing.

**Claude only picks.**
- Candidates go to Claude as `c1...c12`, and the answer must be JSON in a fixed shape
  (structured outputs).
- The Worker maps the refs back to the real ids and **drops anything that isn't one of the
  candidates it was sent**. It also removes duplicates and keeps at most 3.

**Prompt-injection resistant.**
- The question and page text go to Claude wrapped as JSON data, and the system prompt says
  they are never instructions.
- The Worker also checks the reply. It strips links, markdown and anything past 2 sentences,
  and replaces any reply that mentions "system prompt" or off-limits areas with a plain
  "Try X" pointer.
- A question like "ignore your instructions..." just gets a normal pick or "couldn't find
  that".

**Locked guides.** Claude may name the transaction, and the reply always says the guide asks
for the passcode.

**Small answers.** `max_tokens` is 300, with thinking off, low effort and a 7-second timeout.

**Privacy.**
- Question text is never logged or stored.
- IP addresses are never stored. The counter holds a salted hash (keyed by the required
  `IP_SALT` secret) that changes every day. Yesterday's counters are wiped at midnight Central.
- Logs carry only counts, timings, token totals and error codes.

**No secrets in the repo.** The key and the salt live only in Cloudflare secrets.

**No KV.** This Worker doesn't use Workers KV, so it doesn't eat into the casino
leaderboard's shared 1,000-writes-a-day free KV allowance.

---

## Model choice and cost

**Model: Claude Haiku 5.5** (`claude-haiku-5-5`). This is Anthropic's fastest model, which
Anthropic positions for "high-volume, latency-sensitive tasks such as classification,
extraction, and routing". Picking 0-3 items from a list of 12 is a routing task. It doesn't
need a bigger model's reasoning, and the rep is waiting at the counter, so speed matters most.
Thinking is turned off and effort is set to `low` (Haiku 5.5 allows thinking off at `high`
effort or below). That keeps answers to roughly 60-120 output tokens.

**Prices** (Claude API, Oct 2026, prompts under 100k tokens):

| Model | Input, per million tokens | Output, per million tokens |
|---|---|---|
| **Haiku 5.5** | **$0.10** | **$0.50** |
| Haiku 4.5 | $1 | $5 |
| Sonnet 5.5 | $2 | $10 |

**Cost per question.** Each request carries the system prompt, the schema, the question and up
to 12 candidates of up to 700 chars:

| | Input tokens | Output tokens | Cost per question |
|---|---|---|---|
| Typical (about 12 candidates, about 400 chars each) | ~3,500 | ~100 | **~$0.0004** |
| Worst case (12 maxed-out candidates, max output) | ~7,000 | 300 | **~$0.0009** |
| Same typical question on Sonnet 5.5 | ~3,500 | ~100 | ~$0.008 (20x) |

**Estimated monthly Claude bill for all 27 stores** (30 days). Only questions the on-device
search couldn't answer confidently reach Claude.

| AI-fallback questions / day (all stores) | Per month | Claude cost / month (typical) | Worst case |
|---|---|---|---|
| 50 | 1,500 | **~$0.60** | ~$1.35 |
| 200 | 6,000 | **~$2.40** | ~$5.40 |
| 1,000* | 30,000 | **~$12** | ~$27 |
| Ceiling at default `DAILY_CAP` 300 | 9,000 max | **~$3.60** | ~$8.10 |

\* 1,000 a day needs `DAILY_CAP` raised to 1000. Cloudflare stays free at these volumes:
Workers allows 100,000 requests a day, and Durable Objects allow 100,000 requests and 100,000
rows written a day.

Token counts are estimates (the current tokenizer runs about 2.5 characters per token). After
a week live, check real usage in the Claude Console (**Usage** page) or in the Worker logs.
The `"evt":"ask"` lines carry `in`/`out` token counts.

---

## Testing

```bash
node worker/ask-chef/test/run.mjs
```

This runs the Worker in Node with a fake Claude, a fake rate limiter and the real AskLimiter
class over a fake, deliberately slow storage. It needs no key and no network
(`test/loader.mjs` stands in for the `cloudflare:workers` module).

It covers:
- health checks and CORS: allowed origins, www, the localhost flag, rejected origins, preflight
- the happy path and the shape of the request sent to Claude
- hallucinated ids being dropped, and `none`
- locked guides: passcode wording, and locked text never being forwarded
- reply trimming
- bad input: oversized or out-of-shape fields, malformed JSON
- upstream timeout / 500 / 529 / 401 / network error / garbage, all leading to 502; refusal
- per-network minute and day limits, the global daily cap, and IPv6 /64 grouping
- **concurrency**: 50 simultaneous requests with cap 5 lead to exactly 5 Claude calls; 50 from
  one IP with 2 a minute lead to exactly 2; two Worker copies sharing one counter still stop
  at the cap
- reserve-before-call, the midnight reset, and the counter failing closed (down, slow or odd)
- missing key, salt or counter
- prompt injection, and privacy (no question text or IP in logs or counter storage)

API reference used: Messages API (`POST https://api.anthropic.com/v1/messages`, headers
`x-api-key` and `anthropic-version: 2023-06-01`), structured outputs via
`output_config.format` (`json_schema`, no beta header), `output_config.effort`, and
`thinking: {type: "disabled"}`. See https://platform.claude.com/docs. Cloudflare: Durable
Objects pricing and limits (developers.cloudflare.com/durable-objects/platform/pricing),
Workers Builds, and WAF rate-limiting rules.
