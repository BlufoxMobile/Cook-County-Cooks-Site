# Brief for the "asks" writers (Ask the Chef)

Ask the Chef is a search bot on cookcountycooks.com for Xfinity retail sales reps at
Blufox Mobile (27 stores, Chicago area + Tennessee; Central division only). Reps type
fast on a store iPad or their phone, mid-transaction, often quoting the customer.

The bot matches words. It fails when a rep describes a SITUATION instead of naming the
doc ("can i wear jeans to work" → Dress code; "grandma passed how many days off" →
Bereavement leave; "lady wants to move her internet to her new apartment" → Transfer of
Service). Your job: for every doc in your group, write the ways real reps would ask for it.

## Output
One JSON file `build/ask-asks/<group>.json`:
`{ "<doc id>": ["phrasing", "phrasing", …], … }` — EVERY doc id in your group, 6–12
phrasings each (fewer, 3–5, for thin docs like a game, a room, a video chapter).

## How to write them
- Rep voice: lowercase, short, some abbreviations (cx, acct, xm, xh, ie, tv box), some
  customer-quoted ("customer says…", "lady wants…", "guy's number won't port"), a few
  typo'd. Mix "how do i…", bare keywords, and situation descriptions.
- Cover the SITUATIONS and plain-English synonyms a doc answers, not just its title:
  everyday words (jeans → dress code; funeral/passed away → bereavement; moving/new
  apartment → transfer; upstairs wifi/dead spots → extenders; pause for winter → seasonal).
- Distinguish siblings: if two docs are close (Add Shield vs Add more Shield equipment;
  a carrier's PIN vs its account number), make each doc's phrasings specific to it.
- Read each doc's title, crumbs, text and steps in data/ask-index.json to know what it
  really answers. Don't promise things a doc doesn't cover.

## Hard rules
- LOCKED docs (locked:true, CSG How To / Request Access): you only see title + crumbs.
  Write phrasings from the title/crumbs and general Xfinity retail knowledge ONLY. Never
  invent steps, and never include any code, rate code, campaign code, URL, email, system
  number, article id (how#####) or anything containing digits — the build rejects them.
- No digits anywhere except common product names (5g, 6th gen, xb7, x1, 2nd line, 4 lines).
  No customer names, account numbers, phone numbers.
- Do NOT open: assets/ask-engine.js, build/ask-eval*.json, build/ask-eval.mjs,
  build/ask-engine-report.md, or anything under /tmp/claude-0/ask-qa* — those are test
  sets; reading them would invalidate the test.
- Never mention the Walk-In Freezer / manager-only tools.
- Edit only your own output file. Validate with a script: every key is a doc id in your
  group, every doc in your group has phrasings, JSON parses, no digits violating the rule.
