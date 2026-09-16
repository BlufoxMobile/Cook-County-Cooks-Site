/* =============================================================================
 * Cook County Cooks — assets/roomorder.js
 * THE ROOM ORDER, ON ITS OWN, SO THE PHONE DOES NOT PAY 24 KB FOR ONE ARRAY
 * -----------------------------------------------------------------------------
 * This was one line at the top of rooms.js. rooms.js is 24 KB of hotspot
 * geometry — percentages measured off the plates — and the pocket list (the
 * phone build) needs none of it: it has no plates, no hotspots and no rooms to
 * place anything in. It needs the ORDER, and the order alone.
 *
 * Importing rooms.js to get it would have cost the phone 24 KB (9.9 KB gzipped)
 * of measurements it can never use, which is exactly the kind of "it's cached
 * anyway" reasoning the pocket build exists to refuse.
 *
 * rooms.js re-exports this, so `import { ROOM_ORDER } from '../rooms.js'`
 * keeps working unchanged everywhere in the cinema. THERE IS STILL EXACTLY ONE
 * DEFINITION — it is this one.
 *
 * NOTE: this is the walk-through's PHYSICAL order, and the pocket list uses it
 * as its ordering spine. It is not a room registry: the rooms themselves (id,
 * label, tagline) live in data/tools.f0f6c533e3.json, and pocket.js appends any room that
 * appears there but is not named here, so adding a room to tools.json does not
 * silently drop it off the phone.
 * ========================================================================== */

export const ROOM_ORDER = ['pass','host','dining','prep','office','breakroom','freezer'];
