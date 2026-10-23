


export const LOW_CONFIDENCE = 0.55;
export const HIGH_CONFIDENCE = 0.85;


export const NONE_BELOW = 0.2;


export const GUESS_FLOOR = 0;




const NON_ASCII = /[^\x00-\x7f]/;
export function fold(s) {
  const str = String(s == null ? '' : s);
  
  if (!NON_ASCII.test(str)) return str.toLowerCase();
  return str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function compact(s) {
  return fold(s).replace(/[^a-z0-9]+/g, '');
}



export function stem(w) {
  if (w.length <= 3 || /^\d/.test(w)) return w;
  let s = w;
  if (s.endsWith('ies') && s.length > 4) s = s.slice(0, -3) + 'y';
  else if (s.endsWith('sses')) s = s.slice(0, -2);
  else if (s.endsWith('s') && !/(ss|us|is|os)$/.test(s) && s.length > 3) s = s.slice(0, -1);
  if (s.length > 7 && s.endsWith('ation')) s = s.slice(0, -5) + 'at';
  else if (s.length > 5 && s.endsWith('ing')) s = undouble(s.slice(0, -3));
  else if (s.length > 4 && s.endsWith('ed') && !s.endsWith('eed')) s = undouble(s.slice(0, -2));
  if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}
function undouble(s) {
  const n = s.length;
  if (n > 3 && s[n - 1] === s[n - 2] && !/[lsz]/.test(s[n - 1]) && !/[aeiou]/.test(s[n - 1])) return s.slice(0, -1);
  return s;
}



function rawTokens(text) {
  const out = [];
  for (const chunk of fold(text).split(/\s+/)) {
    if (!chunk) continue;
    const parts = chunk.split(/[^a-z0-9]+/).filter(Boolean);
    for (const p of parts) out.push(p);
    if (parts.length > 1) out.push(parts.join(''));
  }
  return out;
}



const ARTICLES = new Set(['the', 'a', 'an', 'my', 'our', 'your']);
function nameKey(phrase) {
  return fold(phrase).split(/[^a-z0-9]+/).filter((t) => t && !ARTICLES.has(t)).join('');
}

 
const PHRASE_CACHE = new Map();
function phraseKey(text) {
  let v = PHRASE_CACHE.get(text);
  if (v !== undefined) return v;
  const w = fold(text).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
  v = (w.length < 2 || w.length > 6) ? '' : w.map(stemC).join('');
  if (PHRASE_CACHE.size > 60000) PHRASE_CACHE.clear();
  PHRASE_CACHE.set(text, v);
  return v;
}
 
const COMPACT_CACHE = new Map();
function compactC(text) {
  let v = COMPACT_CACHE.get(text);
  if (v === undefined) {
    v = compact(text);
    if (COMPACT_CACHE.size > 60000) COMPACT_CACHE.clear();
    COMPACT_CACHE.set(text, v);
  }
  return v;
}



const ASK_WORDS_CACHE = new Map();
function askWords(text) {
  let v = ASK_WORDS_CACHE.get(text);
  if (v) return v;
  v = fold(text).split(/[^a-z0-9]+/).filter((t) => t && t.length > 1 && !STOP.has(t) && !FILLER.has(t)).map(stemC);
  if (ASK_WORDS_CACHE.size > 60000) ASK_WORDS_CACHE.clear();
  ASK_WORDS_CACHE.set(text, v);
  return v;
}

function docTerms(text) {
  return rawTokens(text).map(stem);
}



const STOP = new Set((
  'a an the of and or to too for in on at by with from into onto about as is are was were be been being ' +
  'am im i me my mine we us our ours you your yours u ur ya it its this that these those there here ' +
  'how do does did doing done what whats where wheres when which who whom why whose ' +
  'can could would should will shall may might must ' +
  'please pls plz thx thanks need needs want wants wanna gotta gonna trying try tryna ' +
  'some any much many just really also then so if but yes ok okay hey hi hello good ' +
  'tmrw tmr tomorrow today tonight rn asap quick quickly real morning afternoon evening night week weekend later soon ' +
  'bought buy buying purchased has have had having going goes went came come comes trying tried ' +
  'says saying asked asking wanted keeps keep still already again also ' +
  'tell told say said says know show find get got give help helps ' +
  'wtf lol omg idk pls plz smh ugh hmm um umm uh mean means meaning does supposed guys yall ya ' +
  'way where see like thing stuff something someone somebody one ' +
  'customer customers cust cx person'
).split(/\s+/));





const FILLER = new Set(['someone', 'somebody', 'them', 'him', 'her', 'it', 'this', 'that', 'the', 'a', 'an',
  'my', 'your', 'their', 'his', 'its', 'our', 'customer', 'customers', 'cust', 'guest', 'person', 'they', 'he', 'she']);



const GENERIC = new Set((
  'code codes card cards schedul only set setup servic number customer time week next day new get make use ' +
  'start end info information thing app help question issu problem order account phon store work page screen ' +
  'step option list show see find look call do go want need way'
).split(/\s+/));



const NEG = new Set(['not', 'cant', 'cannot', 'wont', 'dont', 'doesnt', 'didnt', 'isnt', 'aint', 'never', 'no']);

 
const NAV = /^(?:open|launch|go to|goto|take me to|bring up|pull up|show me|show|load|where(?:'s| is)? the|where can i find|find)\s+/;

 
const MODEL_WORD = /^(?:iphone|pixel|galaxy|note|flip|fold|watch|series|ultra|pro|max|plus|razr|edge|stylus|tab|se|mini|gen|s|a|z|g|xl|fe)$/;



const REWRITES = [
  [/\bhow much (?:do|will|would|can|did|does|should) (?:i|we|u|you|reps?|a rep) (?:make|earn|get paid|get)\b/g, ' commission payout '],
  [/\bwhat (?:do|does|will) (?:i|we|u|reps?) (?:make|earn|get paid)\b/g, ' commission payout '],
  [/\bmy (?:pay|check|money)\b/g, ' commission pay '],
  [/\b(?:how 2|how2|hw|howto)\b/g, ' how to '],
  
  
  [/(\S+)?(\s*)\b([24])\b(?=\s+[a-z])/g, (m, prev, sp, d) => (prev && MODEL_WORD.test(prev) ? m : `${prev || ''}${sp}${d === '2' ? ' to ' : ' for '}`)],
  [/\b(?:w\/|w\/o)\b/g, ' '],
  [/([a-z0-9])&([a-z0-9])/g, '$1$2'],
  [/&/g, ' and ']
];



const OFFTOPIC = new Set((
  'lunch dinner breakfast food eat eating hungry snack pizza coffee weather rain snow forecast ' +
  'joke jokes funny movie movies film song songs music lyrics girlfriend boyfriend date dating poem poems ' +
  'bears bulls blackhawks football basketball nfl nba super bowl recipe cook cooking bake ' +
  'horoscope stock stocks bitcoin crypto lottery president election news traffic? ' +
  'meaning life alive feel feeling sad happy bored tired sleep sick ' +
  'time clock tonight age birthday near nearby nearest restaurant restaurants bar party vacation holiday ' +
  
  
  'gas flight flights airport hotel uber lyft taxi doctor dentist ' +
  'netflix hulu youtube spotify tiktok instagram brand brands cheapest ' +
  'french german italian chinese translate'
).split(/\s+/).filter((w) => w && !w.endsWith('?')));



const EVERYDAY = new Set((
  'walmart target costco amazon bestbuy best buy mall store stores shop shops shopping ' +
  'monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun ' +
  'january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec ' +
  'month months year years day days week weeks morning noon tonight yesterday last next ' +
  'she he her him his hers they them their lady guy man woman grandma grandpa kid kids ' +
  'hello hi apt apartment unit suite asap'
).split(/\s+/));

 
const FREEZER_WORDS = new Set(['freezer', 'keypad', 'walkin', 'cooler', 'coldstorage']);


const FREEZER_SOFT = new Set(['manager', 'managers', 'mgr', 'mgrs', 'mgmt', 'management']);
const FREEZER_PHRASES = [/\bwalk[\s-]?in\b(?!\s+(?:customer|guest|traffic|appointment))/, /\bmanager (?:tools?|only|code|stuff|section|area)\b/, /\bcold storage\b/, /\bsealed\b/];



const GLOSSARY = `
csg | csg billing~ | order entry~ | billing system~ @csg-how-to^
celestial | celestial store space~ | store space~ | point of sale~ | pos~ | retail360 | retail 360 | r360 | customer space~ @training-pos^
bapis | bopis | bopus | buy anywhere | buy anywhere pick up in store | online order | online orders | web order | pickup order | pick up order | order pickup | in store pickup | ship to store~ | pickups~ | pickup~ @bapis
portpro | porting guide | port guide @porting-guide
port | port in | portin | ported | porting | coming from | switching from | switching to us | switching over | switch carriers | leaving | coming over from | number transfer | transfer number | transfer their number | keep number | keep their number | keep my number | bring number | bring their number | move number | moving number~ | port out~ | transfer pin~ @porting-guide
ie | internet essentials | ie plus~ | ieplus~ | low income | low cost internet | affordable internet | agent portal~ @internet-essentials
nslp | school lunch | free lunch | reduced lunch | snap | food stamps | medicaid | wic | ssi | pell grant | public housing | veterans pension | qualify | qualifies | qualifying | eligible | does it count | count for | proof of eligibility~
xm | xfinity mobile | mobile~ | cell phone~ | cellphone~ | wireless~ | phone line~
xh | xfinity home | home security | security system | alarm~ | security~ | shield~
shield | xfinity shield | shield select | shield plus | shieldselect | security~ | xh~ | camera~ | cameras~ | xfinity home~
xfi | xfi gateway | gateway | modem | router~ | wifi~ | pods~ | xfi pods~
byod | bring your own device | bring own device | bring your own phone | own phone | own device | byo | byop | purchased elsewhere | bought elsewhere | unlocked phone~ | compatible~
esim | e sim | digital sim | embedded sim | esims | sim~ | qr code~ | lpa~
psim | physical sim | sim card | simcard | sim tray~ | pysical sim
dsr | daily sales report | daily sales | sales report | dsr report | log sales | log a sale | log my sales | log today~
wtw | win the weekend | weekend leaderboard | weekend contest | wtw chicago~ | wtw big south~
tsheet | t sheet | tsheets | t sheets | tee sheet | quote submission | quote submissions~ | submissions~
nps | net promoter | medallia | survey score | detractor | detractors | promoter~ | survey~ | reviews~
quote sheet | quote | quotes | qs | price out | quote tool
price | prices | pricing | priced | cost | costs | how much is | how much does | how much for | how much~ | fee | fees | charge | charges | monthly cost | monthly price | rates~ | plan~ | plans~
6th gen | sixth gen | 6thgen | 6th generation | mobile quote | xm quote | new quote~
upgrade | upgrades | upgrade anytime | ua | upgrade quote | new phone~ | trade in~ | tradein~
trade in | tradein | trade ins | trade~
open store | open the store | opening | store open | opening the store | open up | opening up | start of day | sod | open drawer~ | fund drawer~ | cash drawer~ | till~
close store | close the store | closing | closing the store | store close | close out | closeout | end of day | eod | settle drawer~ | tender count~ | close drawer~ | till~
fund drawer | fund the drawer | load the drawer | starting cash | float~ | till~
settle drawer | tender count | count the drawer | count drawer | drawer count | cash count | count cash | count till | till~
transfer of service | tos | move | moving | new apartment | new house | new place | moving out | mover | movers | moving service | transfer service | move service | relocate | relocating | moving house | moving out | new home~ | new address~
add line | add a line | new line | additional line | another line | second line | extra line | add lines | add phone line | add a phone line | second phone line | adding a line
swap | device swap | swap device | swap phone | exchange~ | replace~ | replacement~
credit limit | cli | line limit | credit limit increase | credit check | credit~ | eligibility~ | more lines~ | max lines~
exception report | exception | exceptions | exeption~
fall off | falloff | fell off | fall offs | falloffs | chargeback | chargebacks | clawback | clawbacks | cancelled sale~ | canceled~ | cancellation~
print outs | printouts | printout | print out | printable | printables | print~ | flyer~ | flyers~ | forms~ | signage~
commission | commissions | comm | comp | payout | payouts | pay sheet | paysheet | paycheck | pay check | paystub | spiff | spiffs | gp~ | earn | earnings | pay~ | paid~ | money~ | bonus~
hourly | hourly rate | hourly wage | wage | per hour | an hour | rate per hour | hourly estimate
google review | google reviews | review card | review cards | google review card | review print out | googl review
channel lineup | channel line up | lineup | line up | channels | channel guide | channel list
now tv | nowtv | now latino | latino~ | spanish channels~
premium channels | premium channel | premium | premiums | movie channels | movie channel | hbo | hbo max | max | showtime | starz | cinemax | paramount | paramount plus | mgm | epix | add a channel~ | channels~
whole home | whole home bundle | wholehome | bundle~
welcome kit | welcome packet | new customer kit
games | game | arcade | play | play a game | video games | video game | gaming | bored~
suggestion | suggestion box | idea | ideas | feedback | complaint | complain | anonymous~ | gripe
site tour | tour | start here | where do i start | where to start | im new | i am new | new here | new hire | orientation | how to use site | how this site works | first day
request access | access | locked out | locked out of | lockout | login | log in | logon | sign in | signin | password | passwords | password reset | reset password | pw reset | lost access | new access | access request | unlock account | account locked | bp~ @bp-access!
einstein | einstein 360 | e360 | einstein360
xm360 | xm 360 | xm three sixty
techspot | tech spot | ticket | submit a ticket | it ticket | help desk~ | helpdesk~
receipt | receipts | reprint | reprint receipt | packing slip~ | print receipt~
return | returns | refund | refunds | send back | return a phone | return device | exchange it | exchange for | swap for a different | different color | wrong color | wrong size | returned~
accessory | accessories | case | phone case | screen protector | protector | charger | charging cable | charger cable | earbuds | headphones | power bank | car charger | item~ | items~ | product~ | merchandise~ | sku~
sale | ring up | ringing up | checkout | check out | ring a sale | complete a sale | make a sale | sell | selling | sold | transaction~
hand off | handoff | hand over | pass to another rep | hand off to another rep | transfer to another rep | another rep | different rep | other rep | give to another rep | transfer the session | transfer session
check in | checkin | check in a guest | checking in | queue~ | waitlist~ | waiting~ | guest~
someone else | somebody else | account owner required | owner required | not the primary | wife | husband | spouse | son | daughter | mom | dad | mother | father | family member | relative | friend | not the account holder | not on the account | primary account holder | primary~ | owner~ | holder~
unpack | nobody picked up | never picked up | never came | didnt pick up | didnt come | not picked up | no show | noshow | abandoned | never showed
broken | broke | breaks | not working | wont work | stopped working | frozen | crashed | crash | glitch | glitching | down~ | error~ | issue~ | problem~ | ticket~ | techspot~
create | make | creating | new~
restart | restarting | restart account | restart service | reconnect | reconnecting | reconnection | reactivate | reactivating | reinstate | turn back on | turn service back on | restore service | resume service | disconnected account | disconnected acct | disconnected | was disconnected | after disconnect | after a disconnect | after being disconnected | got disconnected
technician | tech | pro install | professional install | professional installation | install appointment | tech visit | send a tech | truck roll
smart lock | door lock | kwikset | smart entry | keyless entry
home security | security system | alarm system | security cameras | xfinity home security
extender | extenders | wifi extender | wifi extenders | mesh | pods | xfi pods | dead spot | dead zone | weak wifi | wifi booster | booster
bill | billing info | billing information | balance | past due | what they owe | amount due | due date | statement | statements | ledger | prorate | prorated
billing address | mailing address | change address~ | bill address
customer owned | customer owned equipment | own modem | own router | their own modem | their own router | bought their own modem | purchased modem | cod
equipment status | status codes | status code | device status
appointment | appointments | appt | appts | book an appointment | schedule an appointment | creating an appointment | create an appointment | make an appointment | make an appt | book a visit | future visit | come back later | come back tomorrow | reservation~
activate | activation | activating | turn on~
pack | scan and pack | scan pack | pack order | pack the order | packing | packed~
set up | setup | set-up | setting up
phone | phones | handset | smartphone | cellphone | device~ | devices~
walk in customer | walk in guest | walkin customer | walk up customer | walkup | prospective customer~ | prospect~ | guest~ | check in~
new customer | new install | new connect | new service | new account | sign up | signing up | new internet customer | brand new customer
internet only | just internet | only internet | internet by itself | standalone internet | internet~
watch | smartwatch | smart watch | apple watch | galaxy watch | pixel watch | watches
tablet | ipad~ | tablets
iphone | iphones | apple~ | ios~
android | samsung~ | galaxy~ | pixel~ | motorola~ | moto~
unlock | unlocked | lock | locked | locked to | network locked | carrier locked | carrier lock | network lock | network unlocked | sim lock~ | device unlock
account number | acct number | acct num | account num | account no | acct no | account #
account manager | acct manager | account mgr | acct mgr | account owner | acct owner
pin | transfer pin | port pin | number transfer pin | nip | passcode~ | security pin
brinks | brinks pick up | brinks log | cash pickup | cash pick up | pick up log | pickup log | cash log
handbook | employee handbook | policy~ | policies~ | dress code~
internet | hsd | home internet | broadband | xfinity internet | wifi~ | speed~ | speeds~
voice | home phone | landline | land line | xfinity voice | house phone | home voice | phone service at home
tv | television | cable tv | x1 | video~ | stream~ | streaming~
tv box | cable box | x1 box | set top box | settop box | equipment~ | box~
equipment | swap equipment | swap gateway | swap modem | swap box | swap the box | change box | change equipment | replace gateway | replace modem | replace box | exchange equipment | move equipment | add equipment | box~ | boxes~ | modem~ | gateway~ | remote~ | return equipment~
billing | bill | bills | pay bill | payment~ | autopay | auto pay | paperless~ | statement~
campaign | campaigns | promo | promos | promotion | promotions | offer~ | offers~ | deal~ | deals~ | rate code~
spanish | espanol | en espanol | language | translate~ | translation~
selfie | photo | picture | pic | pics | photos
documents | docs | document | upload~ | proof~ | paperwork~
conversion | yc | yesterday conversion | yesterdays conversion | yesterday's conversion | close rate~ | traffic~
leaderboard | standings | rankings | ranking | rank | ranked | top reps~ | who is winning | whos winning
employee of the week | eotw | eow | head chef | head chefs | wall of fame | chef wall
mercury | mercury assistant | ama | ask me anything
deleted esim | recover esim | esim deleted | lost esim | erased esim | erase esim | esim erased | wiped esim | removed esim | accidentally deleted | accidentally erased | deleted by accident | get esim back | delete esim~
sos | no service | no bars | sos only | no signal | not working~
not showing | not showing up | doesnt show | does not show | not show up | missing | missing order | didnt go through | did not go through | never went through | not in csg | stuck | worklisted | worklist | status~ | reached~ | confirm~
contacts | contact | contact info | customer service | customer service number | customer care | phone number for | number to call | who do i call | who to call | call center | hotline | support number | 800 number | 1 800 | phone numbers~
additional tv | another tv | second tv | extra tv | another room | other room | second room | additional outlet | new outlet | add outlet | extra outlet | another box | second box | extra box | outlet | outlets
seasonal | seasonal plan | snowbird | snowbirds | pause | pause service | pausing | vacation hold | hold service | put on hold | suspend | suspend service | going away | away for the winter | winter | away from home
expire | expires | expired | expiration | expiry | how long is it good for | how long is the pin good | how long does it last | good for | good until | valid for | how long valid
quick transfer | transfer data | move data | copy data | transfer contacts
self activate | self activation | self-activation | activate themselves | customer activate
application id | app id | application number | application status | check the application | check application | ie status | ie order status
sales id | salesid | sales number | rep id~ | get credit~ | credit for the sale~
imei | imei number | serial~ | iccid~
xfinity app | the app | app~ | my account app
ecm | enterprise case management
onesupport | one support
hub2u | hub 2 u | hub to you | order supplies | supplies | store supplies | supply order | ordering for the store | order for the store | store ordering
mycomcastaccess | my comcast access
pto | paid time off | time off | vacation days | days off | personal day | personal days | leave~
sick leave | sick day | sick days | call in sick | calling in sick | called in sick | out sick
payday | pay day | when do we get paid | when do i get paid | paycheck day | direct deposit~
store hours | hours of operation | open until | what time does the store | what time do we | alarm code | alarm codes | store alarm | business cards | voicemail | voice mail | voicemail password | roku | fire stick | firestick | apple tv~ | my schedule | work schedule | schedule next week | shifts | teams shifts | clock in | clock out | time clock | adp | payroll | w2 | w-2 | roaming | international roaming | car | my car | fix my car | wifi password | store wifi password | guest wifi | wifi code @offsite
training | class | training class | product training | product mastery | quiz | battle cards | battlecards | learn~
video | training video | how to video | tutorial | walkthrough
`;

function parseGlossary(src) {
  const groups = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let body = t;
    let scope = null;
    let scopeStrong = false;
    const m = t.match(/@([a-z0-9-]+)([!^]?)\s*$/);
    if (m) { scope = m[1]; scopeStrong = m[2] === '!' ? 3 : m[2] === '^' ? 2 : 1; body = t.slice(0, m.index); }
    const members = body.split('|').map((x) => x.trim()).filter(Boolean).map((x) => {
      const weak = x.endsWith('~');
      const phrase = weak ? x.slice(0, -1).trim() : x;
      return { phrase, weak };
    });
    const offsite = scope === 'offsite';
    groups.push({ members, scope: offsite ? null : scope, scopeStrong, offsite });
  }
  return groups;
}




function editWithin(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (a === b) return 0;
  let prev2 = null;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}








const FIELDS = ['title', 'keywords', 'crumbs', 'steps', 'text', 'inherit', 'asks'];
const FW = { title: 6, keywords: 4, crumbs: 2.2, steps: 1.1, text: 1, inherit: 0.7, asks: 4.5 };
const FB = { title: 0.35, keywords: 0.3, crumbs: 0.2, steps: 0.6, text: 0.65, inherit: 0.3, asks: 0.75 };
const K1 = 1.2;


const FAMILY_WEIGHT = 3;

 
const KIND_PRIOR = { tool: 1, section: 1, step: 0.93, printout: 1, video: 0.97, game: 0.96, room: 0.8, faq: 0.98 };

function docFields(doc, toolBySlug, shared) {
  let kw = Array.isArray(doc.keywords) ? doc.keywords.slice() : [];
  let inh = [];
  if (doc.kind !== 'tool' && shared) {
    inh = kw.filter((k) => shared.has(compactC(k)));
    kw = kw.filter((k) => !shared.has(compactC(k)));
  }
  
  
  const tool = toolBySlug.get(doc.tool);
  if (doc.kind === 'tool' && tool) {
    for (const a of tool.aliases || []) kw.push(a);
    kw.push(tool.label || '');
  }
  const f = {
    title: String(doc.title || ''),
    keywords: kw.join(' , '),
    crumbs: (Array.isArray(doc.crumbs) ? doc.crumbs : []).join(' , '),
    inherit: inh.join(' , '),
    asks: (Array.isArray(doc.asks) ? doc.asks : []).join(' , ')
  };
  if (doc.locked) {
    
    f.crumbs = ''; f.steps = ''; f.text = '';
  } else {
    f.steps = (Array.isArray(doc.steps) ? doc.steps : []).map((s) => (s && s.text) || '').join(' ');
    let text = String(doc.text || '');
    if (doc.kind === 'tool' && tool && tool.blurb && !text.includes(tool.blurb)) text += ' ' + tool.blurb;
    f.text = text;
  }
  return f;
}

 
const STEM_CACHE = new Map();
function stemC(w) {
  let v = STEM_CACHE.get(w);
  if (v === undefined) {
    v = stem(w);
    if (STEM_CACHE.size > 60000) STEM_CACHE.clear();
    STEM_CACHE.set(w, v);
  }
  return v;
}


const CHUNK = /[a-z0-9]+(?:[^a-z0-9\s]+[a-z0-9]+)*/g;
const PART = /[a-z0-9]+/g;


function termIds(text, idOf, out, cache) {
  out.length = 0;
  if (!text) return out;
  const f = fold(text);
  CHUNK.lastIndex = 0;
  let m;
  while ((m = CHUNK.exec(f))) {
    const chunk = m[0];
    const hit = cache.get(chunk);
    if (hit !== undefined) {
      if (typeof hit === 'number') out.push(hit); else for (let k = 0; k < hit.length; k++) out.push(hit[k]);
      continue;
    }
    let simple = true;
    for (let k = 0; k < chunk.length; k++) {
      const c = chunk.charCodeAt(k);
      if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57))) { simple = false; break; }
    }
    if (simple) { const id = idOf(stemC(chunk)); cache.set(chunk, id); out.push(id); continue; }
    PART.lastIndex = 0;
    const got = [];
    let p, joined = '';
    while ((p = PART.exec(chunk))) { got.push(idOf(stemC(p[0]))); joined += p[0]; }
    if (got.length > 1) got.push(idOf(stemC(joined)));
    cache.set(chunk, got.length === 1 ? got[0] : got);
    for (let k = 0; k < got.length; k++) out.push(got[k]);
  }
  return out;
}

function buildIndex(docsIn, tools, rooms) {
  const toolBySlug = new Map((tools || []).filter((t) => t && t.slug).map((t) => [t.slug, t]));
  const docs = (docsIn || []).filter((d) => d && d.id && d.room !== 'freezer' &&
    !(toolBySlug.get(d.tool) && toolBySlug.get(d.tool).room === 'freezer'));
  const N = docs.length;
  const NF = FIELDS.length;
  

  const famSize = new Map();
  for (const d of docs) if (typeof d.family === 'string' && d.family) famSize.set(d.family, (famSize.get(d.family) || 0) + 1);
  const statW = new Float64Array(N);
  docs.forEach((d, i) => { const m = famSize.get(d.family); statW[i] = m ? Math.min(1, FAMILY_WEIGHT / m) : 1; });
  let Nw = 0;
  for (let i = 0; i < N; i++) Nw += statW[i];

  
  const ids = new Map();
  const terms = [];
  const idOf = (t) => {
    let id = ids.get(t);
    if (id === undefined) { id = terms.length; ids.set(t, id); terms.push(t); }
    return id;
  };

  
  const perTool = new Map();
  for (const d of docs) {
    if (d.kind === 'tool' || !Array.isArray(d.keywords)) continue;
    let e = perTool.get(d.tool);
    if (!e) { e = { n: 0, f: new Map() }; perTool.set(d.tool, e); }
    e.n++;
    for (const k of new Set(d.keywords.map(compactC))) e.f.set(k, (e.f.get(k) || 0) + 1);
  }
  const sharedOf = new Map();
  for (const [t, e] of perTool) {
    if (e.n < 4) continue;
    const set = new Set();
    for (const [k, c] of e.f) if (c >= 0.4 * e.n) set.add(k);
    sharedOf.set(t, set);
  }
  
  const idIndex = new Map(docs.map((d, i) => [d.id, i]));
  const parent = new Int32Array(N).fill(-1);
  docs.forEach((d, i) => {
    const k = d.id.lastIndexOf('/');
    if (k <= 0) return;
    const j = idIndex.get(d.id.slice(0, k));
    if (j !== undefined && docs[j].tool === d.tool && docs[j].kind !== 'tool') parent[i] = j;
  });
  
  
  
  
  const titleKeys = new Map();
  docs.forEach((d, i) => { const k = compactC(d.title); if (k.length > 3) titleKeys.set(k, i); });
  const hub = new Uint8Array(N);
  docs.forEach((d, i) => {
    if (d.kind === 'tool' || !Array.isArray(d.keywords)) return;
    let n = 0;
    for (const k of new Set(d.keywords.map(compactC))) {
      const j = titleKeys.get(k);
      if (j !== undefined && j !== i && parent[j] !== i && parent[i] !== j) n++;
    }
    if (n >= 3) hub[i] = 1;
  });

  
  
  
  
  const phraseKeys = new Array(N);
  for (let i = 0; i < N; i++) {
    const d = docs[i];
    let m = null;
    const add = (txt, depth) => {
      const k = phraseKey(txt);
      if (!k) return;
      if (!m) m = new Map();
      if (!m.has(k) || depth >= 0) m.set(k, depth);
    };
    const sh = d.kind === 'tool' ? null : sharedOf.get(d.tool);
    if (Array.isArray(d.keywords)) for (const k of d.keywords) if (!sh || !sh.has(compactC(k))) add(k, -1);
    if (!d.locked && Array.isArray(d.crumbs)) d.crumbs.forEach((c, k) => { if (k > 0 && k < d.crumbs.length - 1) add(c, k); });
    phraseKeys[i] = m;
  }

  
  
  
  
  
  const askPairs = new Array(N);
  const askSets = new Array(N);
  for (let i = 0; i < N; i++) {
    const list = docs[i].asks;
    if (!Array.isArray(list) || !list.length) continue;
    const pairs = new Set();
    const sets = [];
    for (const a of list) {
      const w = askWords(a);
      for (let k = 0; k + 1 < w.length; k++) pairs.add(w[k] + ' ' + w[k + 1]);
      if (w.length >= 2) sets.push(w);
    }
    askPairs[i] = pairs;
    askSets[i] = sets;
  }

  const parentTitle = docs.map((d, i) => (parent[i] >= 0 ? docs[parent[i]].title : ''));

  
  const chunkCache = new Map();
  const fieldIds = new Array(N * NF);
  const lens = new Float64Array(N * NF);
  const sumLen = new Float64Array(NF);
  const buf = [];
  for (let i = 0; i < N; i++) {
    const f = docFields(docs[i], toolBySlug, sharedOf.get(docs[i].tool));
    for (let k = 0; k < NF; k++) {
      termIds(f[FIELDS[k]], idOf, buf, chunkCache);
      fieldIds[i * NF + k] = Int32Array.from(buf);
      lens[i * NF + k] = buf.length;
      sumLen[k] += buf.length * statW[i];
    }
  }
  const avg = new Float64Array(NF);
  for (let k = 0; k < NF; k++) avg[k] = Math.max(1, sumLen[k] / Math.max(1, Nw));
  const fw = FIELDS.map((n) => FW[n]);
  const fb = FIELDS.map((n) => FB[n]);

  
  
  const V0 = terms.length;
  const df = new Int32Array(V0);
  const dfw = new Float64Array(V0);           
  const seenIn = new Int32Array(V0).fill(-1);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < NF; k++) {
      const arr = fieldIds[i * NF + k];
      for (let j = 0; j < arr.length; j++) {
        const t = arr[j];
        if (seenIn[t] !== i) { seenIn[t] = i; df[t]++; dfw[t] += statW[i]; }
      }
    }
  }
  const off = new Int32Array(V0 + 1);
  for (let t = 0; t < V0; t++) off[t + 1] = off[t] + df[t];
  const D = new Int32Array(off[V0]);
  const Wt = new Float32Array(off[V0]);
  const fill = off.slice(0, V0);

  
  const scratch = new Float64Array(V0);
  const touched = [];
  const titleTerms = new Array(N);
  for (let i = 0; i < N; i++) {
    touched.length = 0;
    for (let k = 0; k < NF; k++) {
      const arr = fieldIds[i * NF + k];
      if (!arr.length) continue;
      const add = fw[k] / (1 - fb[k] + fb[k] * (lens[i * NF + k] / avg[k]));
      for (let j = 0; j < arr.length; j++) {
        const t = arr[j];
        if (scratch[t] === 0) touched.push(t);
        scratch[t] += add;
      }
    }
    for (let j = 0; j < touched.length; j++) {
      const t = touched[j];
      const wtf = scratch[t];
      scratch[t] = 0;
      const at = fill[t]++;
      D[at] = i;
      Wt[at] = (wtf * (K1 + 1)) / (wtf + K1);
    }
    
    
    
    let ts;
    const title = String(docs[i].title || '');
    const dash = title.lastIndexOf(' — ');
    if (dash > 0 && parentTitle[i] && compactC(title.slice(dash + 3)) === compactC(parentTitle[i])) {
      ts = new Set(docTerms(title.slice(0, dash)));
    } else {
      ts = new Set();
      const ta = fieldIds[i * NF];
      for (let j = 0; j < ta.length; j++) ts.add(terms[ta[j]]);
    }
    titleTerms[i] = ts;
  }
  const post = new Map();
  for (let t = 0; t < V0; t++) {
    const n = df[t];
    if (!n) continue;
    const nw = dfw[t];
    const idf = Math.log(1 + (Nw - nw + 0.5) / (nw + 0.5));
    post.set(terms[t], { df: n, dfw: nw, idf, d: D.subarray(off[t], off[t + 1]), w: Wt.subarray(off[t], off[t + 1]) });
  }
  const vocab = [...post.keys()].sort();
  const byLen = new Map();
  for (const t of vocab) {
    if (!byLen.has(t.length)) byLen.set(t.length, []);
    byLen.get(t.length).push(t);
  }

  
  
  
  
  
  
  const toolNames = new Map();
  const addName = (phrase, slug, strength) => {
    const c = nameKey(phrase);
    if (c.length < 2) return;
    if (!toolNames.has(c)) toolNames.set(c, new Map());
    const m = toolNames.get(c);
    m.set(slug, Math.max(m.get(slug) || 0, strength));
  };
  for (const t of tools || []) {
    if (!t || !t.slug || t.room === 'freezer') continue;
    addName(t.label, t.slug, 1);
    
    for (const part of String(t.label).split(/\s[—–-]\s/)) addName(part, t.slug, 1);
    (t.aliases || []).forEach((a, k) => addName(a, t.slug, (k === 0 || compact(a).length <= 4) ? 1 : 0.6));
  }
  
  
  for (const [c, m] of toolNames) if (m.size > 2) toolNames.delete(c);

  const toolDoc = new Map(); 
  docs.forEach((d, i) => { if (d.kind === 'tool' && !toolDoc.has(d.tool)) toolDoc.set(d.tool, i); });

  const docTool = docs.map((d) => d.tool);
  
  
  const toolWords = new Map();
  for (const [t, set] of sharedOf) {
    const w = new Set();
    for (const k of set) for (const x of docTerms(k)) w.add(x);
    const tl = toolBySlug.get(t);
    if (tl) for (const x of docTerms(tl.label)) w.add(x);
    toolWords.set(t, w);
  }
  
  
  const generic = new Set([...GENERIC].map(stemC));
  
  
  
  
  
  const listTerms = new Set();
  {
    
    const listRuns = (str) => {
      const runs = [];
      for (const sentence of String(str).split(/[.:;()]/)) {
        const items = sentence.split(',');
        let run = [];
        for (const it of items) {
          const t = it.trim();
          if (t.length >= 2 && t.length <= 32) run.push(t);
          else { if (run.length >= 8) runs.push(run.join(', ')); run = []; }
        }
        if (run.length >= 8) runs.push(run.join(', '));
      }
      return runs;
    };
    
    
    const seenElsewhere = new Set();
    for (let i = 0; i < N; i++) {
      for (const k of [0, 3, 6]) { const arr = fieldIds[i * NF + k]; for (let j = 0; j < arr.length; j++) seenElsewhere.add(arr[j]); }
    }
    for (const d of docs) {
      for (const f of [d.text || '', (d.keywords || []).join(', ')]) {
        if (f.indexOf(',') === -1) continue;
        for (const run of listRuns(f)) for (const t of docTerms(run)) { const id = ids.get(t); if (id === undefined || !seenElsewhere.has(id)) listTerms.add(t); }
      }
    }
  }
  {
    const toolsOf = new Map();
    for (const [t, p] of post) {
      const set = new Set();
      for (let j = 0; j < p.d.length; j++) set.add(docTool[p.d[j]]);
      toolsOf.set(t, set.size);
    }
    const nTools = new Set(docTool).size;
    for (const [t, n] of toolsOf) if (n >= Math.max(6, nTools * 0.4)) generic.add(t);
  }
  return { docs, N, Nw, post, vocab, byLen, toolBySlug, toolNames, toolDoc, titleTerms, hub, parent, docTool, phraseKeys, generic, listTerms, toolWords, askPairs, askSets, rooms: rooms || [] };
}




function buildGlossary(ix) {
  const groups = parseGlossary(GLOSSARY);
  const byKey = new Map(); 
  const byStem = new Map(); 
  let maxWords = 1;
  groups.forEach((g, gi) => {
    for (const m of g.members) {
      const toks = rawTokens(m.phrase).filter((t) => !STOP.has(t) || rawTokens(m.phrase).every((x) => STOP.has(x)));
      m.terms = [...new Set(toks.filter((t, k, arr) => !(arr.length > 1 && t.length === 1)).map(stem))];
      
      const joined = stem(toks.join(''));
      if (toks.length > 1 && ix.post.has(joined)) m.joined = joined;
      const rawWords = fold(m.phrase).split(/[^a-z0-9]+/).filter(Boolean);
      m.key = rawWords.join('');
      m.skey = rawWords.map(stem).join('');
      m.nwords = rawWords.length;
      if (m.weak) continue;
      if (!byKey.has(m.key)) byKey.set(m.key, []);
      if (!byKey.get(m.key).includes(gi)) byKey.get(m.key).push(gi);
      
      
      const sk = rawWords.map(stem).join('');
      if (!byStem.has(sk)) byStem.set(sk, []);
      if (!byStem.get(sk).includes(gi)) byStem.get(sk).push(gi);
      maxWords = Math.max(maxWords, m.nwords);
    }
  });
  
  const typoKeys = [...byKey.keys()].filter((k) => k.length >= 5 && !/\d/.test(k) && !groups[byKey.get(k)[0]].offsite);
  
  
  
  
  const titleScopes = new Array(ix.N);
  groups.forEach((g) => {
    if (!g.scope || g.scopeStrong >= 3) return;
    for (const m of g.members) {
      if (m.weak || m.terms.length < 2) continue;
      for (let d = 0; d < ix.N; d++) {
        if (ix.docTool[d] === g.scope) continue;
        const tt = ix.titleTerms[d];
        if (m.terms.every((t) => tt.has(t))) (titleScopes[d] || (titleScopes[d] = new Set())).add(g.scope);
      }
    }
  });
  return { groups, byKey, byStem, maxWords: Math.min(maxWords, 6), typoKeys, titleScopes };
}




function prefixTerms(ix, p, limit) {
  
  const v = ix.vocab;
  let lo = 0, hi = v.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (v[mid] < p) lo = mid + 1; else hi = mid; }
  const out = [];
  for (let i = lo; i < v.length && v[i].startsWith(p); i++) if (v[i] !== p) out.push(v[i]);
  if (out.length > limit) {
    out.sort((a, b) => ix.post.get(b).dfw - ix.post.get(a).dfw);
    out.length = limit;
  }
  return out;
}



function typoTerms(ix, gl, w) {
  if (w.length <= 4 || /\d/.test(w)) return [];
  const max = w.length <= 7 ? 1 : 2;
  const found = [];
  for (let L = w.length - max; L <= w.length + max; L++) {
    for (const t of ix.byLen.get(L) || []) {
      if (t[0] !== w[0]) continue;
      const p = ix.post.get(t);
      if (p.dfw > ix.Nw * 0.08 || ix.generic.has(t)) continue;
      const d = editWithin(w, t, max);
      if (d <= max) found.push({ t, d, df: p.dfw, gloss: false });
    }
  }
  for (const k of gl.typoKeys) {
    if (Math.abs(k.length - w.length) > max) continue;
    if (k[0] !== w[0]) continue;
    const d = editWithin(w, k, max);
    if (d <= max && d > 0) found.push({ t: k, d, df: 1e6, gloss: true });
  }
  found.sort((a, b) => (a.d - b.d) || (b.df - a.df));
  return found.slice(0, 3);
}

function normalizeQuery(q) {
  let s = ' ' + fold(q).replace(/[’‘]/g, "'") + ' ';
  for (const [re, to] of REWRITES) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

function parse(ix, gl, q) {
  const why = [];
  let s = normalizeQuery(q);
  for (const re of FREEZER_PHRASES) s = s.replace(new RegExp(re.source, 'g'), ' freezer ');
  const howto = /\b(how|steps?|walk ?me|walkthrough|process|procedure|instructions?|what do i do|where do i|set ?up|setup)\b/.test(s) ||
    /^(?:add|activate|open|close|port|swap|upgrade|return|reset|request|check|transfer|unpack|pack|reprint|fund|settle|book|create|start|end|delete|recover|switch|enter|upload|verify|change|remove|cancel|ring|scan|log)\b/.test(s);
  let nav = false;
  const mNav = s.match(NAV);
  if (mNav) {
    
    
    const rest = s.slice(mNav[0].length);
    if (ix.toolNames.has(nameKey(rest))) { nav = true; s = rest; }
  }

  
  const words = s.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const content = words.filter((t) => !STOP.has(t));
  const keepStop = !content.length; 
  const toks = keepStop ? words.filter((t) => !['how', 'do', 'i', 'the', 'a', 'to', 'is', 'what', 'can', 'you', 'it'].includes(t)) : content;

  
  const concepts = [];
  const scopes = []; 
  const W = keepStop ? toks : words;
  const fixed = new Map(); 
  let i = 0;
  while (i < W.length) {
    let matched = false;
    
    
    
    
    
    const runs = [];
    for (let n = Math.min(gl.maxWords + 2, W.length - i); n >= 1; n--) {
      const typed = W.slice(i, i + n);
      runs.push({ n, run: typed });
      if (n >= 3 && !FILLER.has(typed[0]) && !FILLER.has(typed[n - 1])) {
        const kept = typed.filter((t, k) => k === 0 || k === n - 1 || !FILLER.has(t));
        if (kept.length < n && kept.length >= 2) runs.push({ n, run: kept });
      }
    }
    for (const { n, run } of runs) {
      if (run.length > gl.maxWords) continue;
      if (!keepStop && run.length === 1 && STOP.has(run[0])) continue;
      const key = run.join('');
      let gis = gl.byKey.get(key);
      if (!gis && run.some((t) => t.length > 3)) gis = gl.byStem.get(run.map(stemC).join(''));
      if (!gis) continue;
      
      
      if (gis.every((g) => gl.groups[g].offsite)) {
        concepts.push({ text: run.join(' '), span: 1, alts: [], kind: 'offtopic' });
        i += n; matched = true; break;
      }
      const alts = [];
      const skey = run.map(stemC).join('');
      const seen = new Map(); 
      for (const gi of gis) {
        const g = gl.groups[gi];
        if (g.offsite) continue;
        if (g.scope) scopes.push({ slug: g.scope, strong: g.scopeStrong, n });
        for (const m of g.members) {
          const exact = m.key === key || (m.skey && m.skey === skey);
          const w = exact ? 1 : (m.weak ? 0.55 : 0.85);
          const sig = m.terms.join(' ') + '|' + (m.joined || '');
          const prev = seen.get(sig);
          if (prev) {
            if (w > prev.w) { prev.w = w; for (const a of prev.alts) a.w = a.terms.length > 1 ? w * 0.95 : w; }
            continue;
          }
          const mine = [];
          if (m.joined) mine.push({ terms: [m.joined], w, src: m.phrase });
          if (m.terms.length) mine.push({ terms: m.terms, w: m.terms.length > 1 ? w * 0.95 : w, src: m.phrase });
          seen.set(sig, { w, alts: mine });
          alts.push(...mine);
        }
      }
      const span = run.filter((t) => !STOP.has(t)).length || 1;
      const same = concepts.find((c) => c.gis && c.gis.length === gis.length && c.gis.every((g, k) => g === gis[k]));
      if (same) {
        
        
        same.text += ' / ' + run.join(' ');
        for (const gi of gis) for (const m of gl.groups[gi].members) {
          if (m.key !== key) continue;
          for (const a of same.alts) if (a.src === m.phrase) a.w = a.terms.length > 1 ? 0.95 : 1;
        }
        same.phrase = same.phrase || run.filter((t) => !STOP.has(t)).length >= 2;
        i += n; matched = true; break;
      }
      const scopeOf = gis.map((g) => gl.groups[g].scope).find(Boolean) || null;
      
      
      
      const system = gis.some((g) => gl.groups[g].scope && gl.groups[g].scopeStrong < 3);
      
      
      const generic = run.length === 1 && ix.generic.has(stemC(run[0]));
      concepts.push({ text: run.join(' '), span, alts, kind: 'gloss', gis, scopeOf, system, generic, phrase: run.filter((t) => !STOP.has(t)).length >= 2 });
      why.push(`glossary: ${run.join(' ')}`);
      i += n;
      matched = true;
      break;
    }
    if (matched) continue;

    const w = W[i];
    
    
    
    if (i + 1 < W.length && STOP.has(w) && !STOP.has(W[i + 1]) && ix.post.has(w + W[i + 1]) && ix.post.get(w + W[i + 1]).dfw <= 12) {
      const j = w + W[i + 1];
      concepts.push({ text: `${w} ${W[i + 1]}`, span: 2, alts: [{ terms: [j], w: 1 }], kind: 'join', phrase: true });
      i += 2;
      continue;
    }
    if (!keepStop && STOP.has(w)) { i++; continue; }
    
    if (i + 1 < W.length && !STOP.has(W[i + 1])) {
      const j = stem(w + W[i + 1]);
      if (ix.post.has(j) && (w.length <= 3 || W[i + 1].length <= 3)) {
        concepts.push({ text: `${w} ${W[i + 1]}`, span: 2, alts: [{ terms: [j], w: 1 }, { terms: [stem(w), stem(W[i + 1])], w: 0.9 }], kind: 'join', phrase: true });
        i += 2;
        continue;
      }
    }
    if (OFFTOPIC.has(w)) { concepts.push({ text: w, span: 1, alts: [], kind: 'offtopic' }); i++; continue; }
    const digitWord = /^\d+(st|nd|rd|th|am|pm)?$/.test(w) || (/\d/.test(w) && /[a-z]/.test(w) && w.length <= 4);
    if (EVERYDAY.has(w) || (digitWord && !ix.post.has(w) && !ix.post.has(stem(w)))) { concepts.push({ text: w, span: 1, alts: [], kind: 'everyday' }); i++; continue; }
    
    if (FREEZER_WORDS.has(w)) { concepts.push({ text: w, span: 1, alts: [], kind: 'offtopic' }); i++; continue; }
    if (FREEZER_SOFT.has(w)) { i++; continue; }
    
    if (NEG.has(w) && !ix.post.has(stem(w))) { i++; continue; }
    if (w.length === 1 && !/\d/.test(w)) { i++; continue; }

    const st = stem(w);
    const alts = [];
    const isLast = i === W.length - 1;
    if (ix.post.has(st)) alts.push({ terms: [st], w: 1 });
    if (st !== w && ix.post.has(w)) alts.push({ terms: [w], w: 1 });
    
    if (w.length >= 3 || (isLast && w.length >= 2)) {
      const pw = ix.post.has(st) ? 0.6 : 0.78;
      for (const t of prefixTerms(ix, w, 8)) alts.push({ terms: [t], w: pw * Math.min(1, 0.55 + w.length / Math.max(8, t.length)), src: `${w}…` });
    }
    
    if (!ix.post.has(st) && !ix.post.has(w) && alts.length === 0) {
      for (const c of typoTerms(ix, gl, w)) {
        if (c.gloss) {
          
          for (const gi of gl.byKey.get(c.t) || []) {
            for (const m of gl.groups[gi].members) {
              if (m.joined) alts.push({ terms: [m.joined], w: (m.weak ? 0.5 : 0.75), src: `${w}→${c.t}` });
              if (m.terms.length) alts.push({ terms: m.terms, w: (m.weak ? 0.5 : 0.75), src: `${w}→${c.t}` });
            }
            const g = gl.groups[gi];
            if (g.scope) scopes.push({ slug: g.scope, strong: g.scopeStrong, n: 1 });
          }
        } else {
          alts.push({ terms: [c.t], w: c.d === 1 ? 0.75 : 0.55, src: `${w}→${c.t}` });
        }
      }
      if (alts.length) {
        why.push(`typo: ${w}`);
        const best = typoTerms(ix, gl, w)[0];
        if (best && best.d === 1) fixed.set(i, best.t);
      }
    }
    const strongAlts = alts.filter((a) => a.w >= 0.84);
    const listOnly = strongAlts.length > 0 && strongAlts.every((a) => a.terms.every((t) => ix.listTerms.has(t)));
    
    
    if (listOnly && !keepStop) { concepts.push({ text: w, span: 1, alts: [], kind: 'everyday', listOnly: true }); i++; continue; }
    concepts.push({ text: w, span: 1, alts, kind: 'word', generic: ix.generic.has(st) || listOnly, listOnly, typo: alts.length > 0 && alts.every((a) => a.src && a.src.includes('→')) });
    i++;
  }

  
  
  const named = new Map(); 
  const NW = W.map((t, k) => fixed.get(k) || t).filter((t) => !ARTICLES.has(t));
  const stopOnly = concepts.filter((c) => c.kind === 'gloss' && c.text.split(/[\s/]+/).every((t) => !t || STOP.has(t))).length;
  
  const everydayN = concepts.filter((c) => c.kind === 'everyday').length;
  const nContent = Math.max(1, toks.length + stopOnly - everydayN);
  for (let a = 0; a < NW.length; a++) {
    for (let b = NW.length; b > a; b--) {
      const set = ix.toolNames.get(NW.slice(a, b).join(''));
      if (!set) continue;
      const share = Math.min(1, NW.slice(a, b).filter((t) => !STOP.has(t)).length / nContent);
      for (const [slug, str] of set) named.set(slug, Math.max(named.get(slug) || 0, share * str));
    }
  }
  
  
  const topical = concepts.filter((c) => c.kind !== 'everyday');
  if (topical.length === 1 && topical[0].gis) {
    for (const gi of topical[0].gis) {
      for (const m of gl.groups[gi].members) {
        if (m.weak) continue;
        const set = ix.toolNames.get(m.key);
        if (set) for (const [slug, str] of set) if (str === 1) named.set(slug, Math.max(named.get(slug) || 0, 0.9));
      }
    }
  }
  
  const qPhrases = new Set();
  const cw = toks.filter((t) => !STOP.has(t));
  for (let a = 0; a < cw.length; a++) {
    for (let b = a + 2; b <= Math.min(cw.length, a + 5); b++) qPhrases.add(cw.slice(a, b).map(stemC).join(''));
  }
  const qStems = new Set(toks.filter((t) => !STOP.has(t) && !FREEZER_SOFT.has(t)).map(stemC));
  
  
  
  const qw = askWords(W.join(' '));
  const qPairs = [];
  for (let k = 0; k + 1 < qw.length; k++) qPairs.push({ key: qw[k] + ' ' + qw[k + 1], generic: ix.generic.has(qw[k]) && ix.generic.has(qw[k + 1]) });
  const qWordSet = new Set(qw);
  return { concepts, scopes, howto, nav, named, toks, why, qPhrases, qStems, qPairs, qWordSet };
}




function conceptImportance(ix, c) {
  if (c.kind === 'offtopic') return Math.log(1 + ix.Nw) * 0.9;
  if (c.kind === 'everyday') return 0.3;
  let best = 0;
  for (const a of c.alts) {
    if (a.w < 0.7) continue;
    for (const t of a.terms) { const p = ix.post.get(t); if (p) best = Math.max(best, p.idf * a.w); }
  }
  if (!best) return Math.log(1 + ix.Nw) * 0.8; 
  
  
  return Math.max(best, 0.6) * c.span ** 0.5 * (c.generic ? 0.5 : 1);
}

function scoreAll(ix, parsed, scopeSlugs) {
  const N = ix.N;
  const total = new Float64Array(N);
  const covered = new Float64Array(N);
  
  const best = new Float64Array(N);
  const bestW = new Float64Array(N);
  const acc = new Float64Array(N);
  const accMax = new Float64Array(N);
  const hits = new Uint8Array(N);
  const touched = [];
  const accT = [];
  
  
  
  const nspec = new Uint8Array(N);
  const nphrase = new Uint8Array(N);
  let impTotal = 0;
  for (const c of parsed.concepts) {
    const imp = conceptImportance(ix, c);
    c.imp = imp;
    impTotal += imp;
    if (!c.alts.length) continue;
    touched.length = 0;
    for (const a of c.alts) {
      const L = a.terms.length;
      if (L === 1) {
        const p = ix.post.get(a.terms[0]);
        if (!p) continue;
        const k = a.w * p.idf * c.span;
        for (let j = 0; j < p.d.length; j++) {
          const d = p.d[j], v = k * p.w[j];
          if (best[d] === 0) touched.push(d);
          if (v > best[d]) { best[d] = v; bestW[d] = a.w; }
        }
      } else {
        accT.length = 0;
        for (const t of a.terms) {
          const p = ix.post.get(t);
          if (!p) continue;
          for (let j = 0; j < p.d.length; j++) {
            const d = p.d[j];
            if (hits[d] === 0) accT.push(d);
            acc[d] += p.idf * p.w[j];
            if (p.idf * p.w[j] > accMax[d]) accMax[d] = p.idf * p.w[j];
            hits[d]++;
          }
        }
        for (const d of accT) {
          
          const h = hits[d];
          const full = h === L;
          const v = a.w * c.span * (acc[d] / L) * (full ? 1 : 0.5 * h / L);
          if (best[d] === 0) touched.push(d);
          if (v > best[d]) { best[d] = v; bestW[d] = full ? a.w : a.w * 0.4; }
          acc[d] = 0; hits[d] = 0; accMax[d] = 0;
        }
      }
    }
    
    
    if (c.scopeOf && c.system && scopeSlugs && scopeSlugs.has(c.scopeOf)) {
      const flat = imp * 1.2;
      for (let d = 0; d < N; d++) {
        if (ix.docTool[d] !== c.scopeOf) continue;
        if (best[d] === 0) touched.push(d);
        best[d] = flat; bestW[d] = 1;
      }
    }
    const specific = !c.generic && !c.typo && c.kind !== 'offtopic';
    for (const d of touched) {
      total[d] += best[d];
      covered[d] += imp * Math.min(1, bestW[d] / 0.85);
      if (specific && bestW[d] >= 0.8) { nspec[d]++; if (c.phrase) nphrase[d]++; }
      best[d] = 0; bestW[d] = 0;
    }
  }
  return { total, covered, impTotal, nspec, nphrase };
}






function parentId(doc) {
  if (!doc || !doc.id || doc.kind === 'tool' || !doc.tool) return null;
  const i = doc.id.lastIndexOf('/');
  const up = i > 0 ? doc.id.slice(0, i) : '';
  if (!up || up === doc.tool || up === 'tool' || up === 'video' || up === 'game') return `tool/${doc.tool}`;
  return up;
}
function isAncestor(a, b) {          
  if (!a || !b || a.tool !== b.tool) return false;
  if (a.kind === 'tool') return b.kind !== 'tool';
  for (let p = parentId(b), n = 0; p && n < 8; n++) {
    if (p === a.id) return true;
    const i = p.lastIndexOf('/');
    p = i > 0 && !p.startsWith('tool/') ? p.slice(0, i) : null;
  }
  return false;
}
function sameFamily(P, D, close) {
  if (!P || !D || !P.tool || P.tool !== D.tool) return false;
  if (isAncestor(D, P) || isAncestor(P, D)) return true;
  const pp = parentId(P);
  return !!pp && pp === parentId(D) && close.some((c) => c.id === pp);
}

export function createAsk({ index, tools, rooms } = {}) {
  const docsIn = (index && Array.isArray(index.docs)) ? index.docs : [];
  const ix = buildIndex(docsIn, tools || [], rooms || []);
  const gl = buildGlossary(ix);

   
  function freezerish(q) {
    const s = normalizeQuery(q);
    if (FREEZER_PHRASES.some((re) => re.test(s))) return 2;
    const toks = rawTokens(s);
    if (toks.some((t) => FREEZER_WORDS.has(t))) return 2;
    return toks.some((t) => FREEZER_SOFT.has(t)) ? 1 : 0;
  }

  function rank(q) {
    const parsed = parse(ix, gl, q);
    if (!parsed.concepts.length || !ix.N) return { parsed, results: [], impTotal: 0 };
    
    
    const scopeSlugs = new Set();
    if (parsed.scopes.length) {
      const top = Math.max(...parsed.scopes.map((s) => s.strong));
      for (const s of parsed.scopes) if (s.strong === top) scopeSlugs.add(s.slug);
    }
    const { total, covered, impTotal, nspec, nphrase } = scoreAll(ix, parsed, scopeSlugs);
    
    let topNamed = 0;
    for (const v of parsed.named.values()) topNamed = Math.max(topNamed, v);
    const toolIntent = parsed.nav || topNamed >= 0.99 || (!parsed.howto && topNamed >= 0.65);
    
    const specificBeyondScope = parsed.concepts.some((c) => !c.generic && c.kind !== 'offtopic' && c.alts.length && !(c.scopeOf && scopeSlugs.has(c.scopeOf)));
    
    
    const sectionNames = new Set();
    const qTerms = new Set();
    for (const c of parsed.concepts) {
      if (c.scopeOf && c.system && scopeSlugs.has(c.scopeOf)) continue;
      for (const a of c.alts) if (a.w >= 0.84) for (const t of a.terms) qTerms.add(t);
    }

    if (specificBeyondScope) {
      for (let d = 0; d < ix.N; d++) {
        if (total[d] <= 0 || ix.docs[d].kind === 'tool' || sectionNames.has(ix.docTool[d])) continue;
        const tt = ix.titleTerms[d];
        if (!tt) continue;
        for (const c of parsed.concepts) {
          if (c.generic || c.kind === 'offtopic' || !c.alts.length || (c.scopeOf && scopeSlugs.has(c.scopeOf))) continue;
          if (c.alts.some((a) => a.w >= 0.84 && a.terms.every((t) => tt.has(t)) && !ix.toolWords.get(ix.docTool[d])?.has(a.terms[0]))) { sectionNames.add(ix.docTool[d]); break; }
        }
      }
    }
    
    
    
    let rawMax = 0;
    for (let d = 0; d < ix.N; d++) if (total[d] > rawMax) rawMax = total[d];
    const rawCut = rawMax * 0.03;
    const out = [];
    for (let d = 0; d < ix.N; d++) {
      let s = total[d];
      if (s <= 0 || s < rawCut) continue;
      const doc = ix.docs[d];
      const cov = impTotal ? covered[d] / impTotal : 0;
      
      s *= 0.35 + 0.65 * cov ** 1.4;
      s *= KIND_PRIOR[doc.kind] || 1;
      
      
      const tt = ix.titleTerms[d];
      let tp = 0;
      let tHits = 0;
      if (tt) for (const c of parsed.concepts) {
        if (c.generic || c.kind === 'offtopic' || (c.scopeOf && c.system && scopeSlugs.has(c.scopeOf))) continue;
        if (c.alts.some((a) => a.w >= 0.84 && a.terms.every((t) => tt.has(t) && !ix.toolWords.get(doc.tool)?.has(t)))) tHits++;
      }
      if (tt && tt.size && qTerms.size) {
        let hit = 0, n = 0;
        for (const t of tt) { if (t.length < 2 || STOP.has(t)) continue; n++; if (qTerms.has(t)) hit++; }
        if (n) { tp = hit / n; s *= 1 + 0.22 * tp; }
      }
      
      if (tHits) s *= 1 + 0.12 * Math.min(tHits, 3);
      
      
      
      if (tt && tt.size && qTerms.size) {
        let extra = 0;
        for (const t of tt) {
          if (t.length < 3 || STOP.has(t) || qTerms.has(t) || ix.generic.has(t)) continue;
          const p = ix.post.get(t);
          if (p && p.dfw <= ix.Nw * 0.03) extra++;
        }
        if (extra) s *= Math.pow(0.9, Math.min(extra, 3));
      }
      
      if (tt && tt.size && tp >= 0.99 && parsed.qStems.size && [...parsed.qStems].every((t) => tt.has(t))) s *= 1.25;
      const why = [];
      
      
      let askHits = 0, askStrong = 0, askWhole = false;
      const ap = ix.askPairs[d];
      if (ap && parsed.qPairs.length) {
        for (const qp of parsed.qPairs) if (ap.has(qp.key)) { askHits++; if (!qp.generic) askStrong++; }
      }
      const as = ix.askSets[d];
      if (as && parsed.qWordSet.size >= 2) {
        for (const w of as) {
          if (w.length >= 2 && w.length <= parsed.qWordSet.size && w.every((t) => parsed.qWordSet.has(t)) && !w.every((t) => ix.generic.has(t))) { askWhole = true; break; }
        }
      }
      if (askHits) { s *= 1 + 0.18 * Math.min(askHits, 3); why.push('ask phrase'); }
      if (askWhole) { s *= 1.2; why.push('whole ask'); }
      let crumbAt = -1;
      const pk = ix.phraseKeys[d];
      if (pk && parsed.qPhrases.size && doc.kind !== 'tool') {
        let best = -2;
        for (const q of parsed.qPhrases) { const v = pk.get(q); if (v !== undefined && v > best) best = v; }
        if (best > -2) { s *= 1.2; crumbAt = best; why.push('phrase'); }
      }
      if (scopeSlugs.size) {
        if (scopeSlugs.has(doc.tool)) { s *= 1.45; why.push(`scope: ${doc.tool}`); }
        else s *= 0.8;
      }
      const ts = gl.titleScopes[d];
      if (ts) for (const sc of ts) if (!scopeSlugs.has(sc)) { s *= 0.8; break; }
      const nm = parsed.named.get(doc.tool) || 0;
      if (nm) {
        if (doc.kind === 'tool' && toolIntent) { s *= 1.25 + 0.6 * nm; why.push('names this tool'); }
        else s *= 1 + 0.25 * nm;
      }
      
      
      if (!toolIntent && !(nm >= 0.99)) {
        if (ix.hub[d]) s *= parsed.howto ? 0.82 : 0.88;
        else if (doc.kind === 'tool' && parsed.howto) s *= 0.82;
        
        
        
        
        else if (doc.kind === 'tool' && specificBeyondScope) s *= sectionNames.has(doc.tool) ? 0.75 : 0.9;
      }
      if (parsed.howto && !toolIntent) {
        if (doc.kind === 'section') s *= Array.isArray(doc.steps) && doc.steps.length ? 1.18 : 1.08;
        else if (doc.kind === 'room' || doc.kind === 'game') s *= 0.85;
      } else if (toolIntent && doc.kind !== 'tool' && nm >= 0.99) {
        s *= 0.8;
      }
      
      
      if (!nspec[d]) s *= 0.5;
      out.push({ d, score: s, cov, tp, crumbAt, why, nspec: nspec[d], nphrase: nphrase[d] + (crumbAt > -1 ? 1 : 0) + (askStrong ? 1 : 0) + (askWhole ? 1 : 0), askStrong, askWhole, tHits, named: nm >= 0.99 && doc.kind === 'tool' });
    }
    out.sort((a, b) => b.score - a.score);
    rollup(out, toolIntent);
    return { parsed, results: out, impTotal };
  }

  

  function rollup(out, toolIntent) {
    if (out.length < 2) return;
    const top = out[0];
    const lift = (k, why) => {
      const r = out.splice(k, 1)[0];
      r.score = top.score * 1.001;
      r.why.push(why);
      out.unshift(r);
    };
    const p = ix.parent[top.d];
    if (p >= 0) {
      let pk = -1, sib = 0;
      for (let k = 1; k < Math.min(out.length, 12); k++) {
        if (out[k].d === p) pk = k;
        else if (ix.parent[out[k].d] === p && out[k].score >= top.score * 0.8) sib++;
      }
      if (pk > 0 && out[pk].tHits >= top.tHits) {
        const pr = out[pk];
        let sibTp = 0;
        for (let k = 1; k < Math.min(out.length, 12); k++) if (ix.parent[out[k].d] === p) sibTp = Math.max(sibTp, out[k].tp);
        const blindTitle = top.tp === 0 && pr.cov >= 0.5;
        
        const sameName = pr.tHits >= top.tHits && pr.tHits > 0 && pr.score >= top.score * 0.85;
        const family = sib > 0 && top.tp <= sibTp && pr.score >= top.score * 0.7 && pr.cov >= top.cov - 0.02;
        if (blindTitle || family || sameName) { lift(pk, 'whole transaction'); return; }
      }
    }
    
    
    
    if (top.crumbAt > 0) {
      const path = (ix.docs[top.d].crumbs || []).slice(0, top.crumbAt + 1).join('\u0001');
      let first = 0;
      for (let k = 1; k < Math.min(out.length, 12); k++) {
        const r = out[k];
        if (r.score < top.score * 0.8 || r.crumbAt !== top.crumbAt || r.tp < top.tp) continue;
        if ((ix.docs[r.d].crumbs || []).slice(0, top.crumbAt + 1).join('\u0001') !== path) continue;
        if (r.d < out[first].d) first = k;
      }
      if (first > 0) { lift(first, 'first under the heading'); return; }
    }
    if (!toolIntent && ix.docs[top.d].kind === 'tool') {
      for (let k = 1; k < Math.min(out.length, 4); k++) {
        const r = out[k];
        if (ix.docTool[r.d] === ix.docs[top.d].tool && r.tp >= 0.6 && r.score >= top.score * 0.6) { lift(k, 'named in the title'); return; }
      }
    }
  }

  function explain(r, parsed) {
    const doc = ix.docs[r.d];
    const why = r.why.slice();
    const tt = ix.titleTerms[r.d];
    const inTitle = [];
    for (const c of parsed.concepts) {
      if (c.alts.some((a) => a.w >= 0.7 && a.terms.every((t) => tt && tt.has(t)))) inTitle.push(c.text);
    }
    if (inTitle.length) why.unshift(`title: ${inTitle.join(', ')}`);
    why.push(`covers ${Math.round(r.cov * 100)}%`);
    for (const w of parsed.why) if (w.startsWith('typo') || w.startsWith('glossary')) why.push(w);
    return why;
  }

  function search(q, opts = {}) {
    const limit = opts.limit == null ? 8 : opts.limit;
    const { parsed, results } = rank(q);
    return results.slice(0, limit).map((r) => ({ doc: ix.docs[r.d], score: +r.score.toFixed(4), why: explain(r, parsed) }));
  }

  function answer(q) {
    const fz = freezerish(q);
    const { parsed, results, impTotal } = rank(q);
    const candidates = results.slice(0, 12).map((r) => ix.docs[r.d]);
    const none = (confidence) => ({
      mode: 'none', primary: null, alternates: [], confidence, candidates,
      ...(fz ? { freezer: true } : {})
    });
    if (!results.length) return none(0);

    const r1 = results[0];
    
    
    
    const famOf = (d) => { const p = ix.parent[d]; return p >= 0 ? p : d; };
    const sameAnswer = (d) => d === r1.d || famOf(d) === famOf(r1.d) || ix.parent[d] === r1.d || ix.parent[r1.d] === d ||
      (ix.docs[d].kind === 'tool' && ix.docTool[d] === ix.docTool[r1.d]);
    let r2 = null;
    for (let k = 1; k < results.length; k++) if (!sameAnswer(results[k].d)) { r2 = results[k]; break; }
    const s1 = r1.score;
    const ratio = r2 ? r2.score / s1 : 0;
    const cov = r1.cov;
    
    
    const strength = 1 - Math.exp(-s1 / 9);
    
    
    
    
    const margin = Math.min(1, (1 - ratio) * 2.6);
    const rNext = results[1] ? results[1].score / s1 : 0;
    const marginNext = Math.min(1, (1 - rNext) * 3);
    
    const titleFit = r1.tp >= 0.99 ? 1 : r1.tHits >= 2 ? 0.8 : r1.tHits ? 0.6 : 0.35;
    let conf = cov ** 1.6 * (0.3 + 0.35 * margin + 0.35 * marginNext) * (0.45 + 0.55 * strength) * (0.6 + 0.4 * titleFit);
    conf = Math.max(0, Math.min(1, conf * 1.45));
    
    
    
    const strongEv = r1.nspec >= 2 || r1.nphrase >= 1 || r1.named;
    if (!r1.nspec && !r1.named) conf = Math.min(conf, 0.2);
    else if (!strongEv) conf = Math.min(conf, 0.8);
    
    
    

    const unknownC = parsed.concepts.filter((c) => (c.kind === 'word' && !c.alts.length) || c.kind === 'everyday');
    const unknown = unknownC.length;
    const strongEvidence = r1.nspec >= 2 || r1.nphrase >= 1 || r1.named;
    if (unknown) conf *= Math.pow(strongEvidence ? 0.92 : 0.85, Math.min(unknown, 4));
    const specificEvidence = r1.nspec >= 1 || r1.askStrong > 0 || r1.askWhole || r1.named;
    const offOnly = parsed.concepts.every((c) => c.kind === 'offtopic' || c.kind === 'everyday' || !c.alts.length);
    const offWords = parsed.concepts.filter((c) => c.kind === 'offtopic').length;
    const specificCount = r1.nspec + (r1.askStrong ? 1 : 0) + (r1.named ? 1 : 0);
    
    const offDominated = offWords > 0 && 2 * offWords >= specificCount;
    
    
    const impUnknown = unknownC.reduce((n, c) => n + (c.imp || 0), 0);
    const covKnown = impTotal > impUnknown ? Math.min(1, cov * impTotal / (impTotal - impUnknown)) : cov;
    const hasOff = offWords > 0;
    if (offOnly || !specificEvidence || offDominated || covKnown < (hasOff ? 0.6 : 0.4) || s1 < 1.2) {
      return { ...none(+Math.min(conf, 0.2).toFixed(3)), ...(fz === 1 ? { freezer: true } : {}) };
    }
    const lowButClean = conf < NONE_BELOW;   

    
    
    
    
    const close = [];
    let ownGuide = 0;
    const famKey = (d) => { const p = ix.parent[d]; return p >= 0 ? p : d; };
    const seenFam = new Set([famKey(r1.d), r1.d]);
    for (let k = 1; k < results.length && close.length < 3; k++) {
      const r = results[k];
      if (r.score < s1 * 0.8) break;
      const fk = famKey(r.d);
      if (seenFam.has(fk) || seenFam.has(r.d)) continue;
      
      if (ix.docs[r.d].kind === 'tool' && ix.docTool[r.d] === ix.docTool[r1.d]) continue;
      if (ix.docTool[r.d] === ix.docTool[r1.d] && ++ownGuide > 1) continue;
      seenFam.add(fk); seenFam.add(r.d);
      close.push(ix.docs[r.d]);
    }
    const alternates = results.slice(1, 4).map((r) => ix.docs[r.d]);
    

    const P = ix.docs[r1.d];
    const family = close.length >= 1 && close.every((D) => sameFamily(P, D, close));
    let mode = (close.length >= 1 && !family && conf < LOW_CONFIDENCE + 0.15) ? 'choices' : 'direct';
    
    if (lowButClean) {
      mode = 'choices';
      if (!close.length) for (const r of results.slice(1, 4)) close.push(ix.docs[r.d]);
    }
    
    
    
    const freezer = fz === 2;
    return {
      mode,
      primary: ix.docs[r1.d],
      alternates: (mode === 'choices' || family) ? close : alternates,
      ...(family && !lowButClean ? { family: true } : {}),
      ...(lowButClean ? { guess: true } : {}),
      confidence: +conf.toFixed(3),
      candidates,
      ...(freezer ? { freezer: true } : {})
    };
  }


   
  function debug(q) {
    const p = parse(ix, gl, q);
    return p.concepts.map((c) => `${c.kind}${c.generic ? '(generic)' : ''}${c.typo ? '(typo)' : ''}${c.phrase ? '(phrase)' : ''}:${c.text}`).join(' | ');
  }

  return { search, answer, debug, size: ix.N };
}
