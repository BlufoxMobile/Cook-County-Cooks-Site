




export { ROOM_ORDER } from './assets/roomorder.e9125c1800.js';

export const HOTSPOTS = {
  pass: [
    

    

    { slug:'quote-6th-gen',  kind:'screen', mode:'title',
      x:18.42, y:57.24, w:17.91, h:16.64, label:'6th Gen Quote Sheet',
      quad:[[21.25,57.31],[36.29,57.39],[34.71,73.66],[18.42,73.66]] },
    { slug:'quote-upgrade',  kind:'screen', mode:'title',
      x:42.00, y:57.24, w:16.00, h:16.64, label:'Upgrade Quote Sheet',
      quad:[[42.71,57.24],[57.21,57.24],[57.96,73.06],[42.25,73.66]] },
    { slug:'quote-internet', kind:'screen', mode:'title',
      x:62.75, y:57.24, w:17.79, h:16.57, label:'Internet Quote Sheet',
      quad:[[62.88,57.31],[77.75,57.31],[80.54,73.58],[64.12,72.91]] },
    { slug:'tsheet-submissions', kind:'tool', x:76.0, y:76.0, w:14.5, h: 8.0, label:'T-Sheet Submissions', edge:'right bottom' },
  ],
  host: [
    

    { slug:'daily-sales', kind:'screen', mode:'image', x:47.0, y:5.6, w:37.0, h:53.0,
      label:'Daily Sales Report', name:'Daily Promo Card',
      quad:[[47.6,21.4],[82.0,11.2],[82.0,57.8],[47.3,55.8]] },
    { slug:'yesterdays-conversion', kind:'tool', x:14.0, y:68.0, w:24.0, h:14.0, label:"Yesterday's Conversion", edge:'bottom' },
  ],
  dining: [
    

    { slug:'wtw-chicago',   kind:'screen', mode:'live', width:960,
      x:26.96, y:24.33, w:21.66, h:21.86, label:'Win the Weekend — Chicago' },
    { slug:'wtw-big-south', kind:'screen', mode:'live', width:960,
      x:51.38, y:24.33, w:21.58, h:21.86, label:'Win the Weekend — Big South' },
    { slug:'nps',           kind:'tool',   x:77.5, y:25.5, w:18.5, h:25.0, label:'NPS Report', edge:'right' },
  ],
  prep: [
    { slug:'porting-guide', kind:'tool', x:24.0, y:33.5, w:9.0, h:12.0, label:'PortPro — Porting Guide' },
    { slug:'credit-limit',  kind:'tool', x:35.0, y:33.5, w:7.5, h:11.0, label:'Credit Limit Increase' },
    { slug:'bapis',         kind:'tool', x:43.5, y:34.5, w:6.5, h:10.0, label:'Online Order Processing' },
    { slug:'bp-access',     kind:'tool', x:51.0, y:35.0, w:5.0, h: 9.0, label:'Report BP Access Issues' },
  ],
  office: [
    

    { slug:'daily-sales', kind:'screen', mode:'feed',
      x:36.0, y:22.9, w:28.0, h:28.4,
      label:'Days Since The Last Bad NPS Survey' },

    

    

    

    { slug:'commission-payouts', kind:'print', x:9.0, y:25.0, w:12.0, h:17.0,
      label:'Commission Payouts 2026', rotate:-1.4 },

    

    { slug:'printouts',        kind:'tool', x:78.1, y:35.0, w:7.9, h:17.2, label:'Print Outs', edge:'right' },
    { slug:'exception-report', kind:'tool', x:85.6, y:36.8, w:4.4, h:20.0, label:'Exception Report', edge:'right' },
    { slug:'fall-off',         kind:'tool', x:91.5, y:34.4, w:6.0, h:24.2, label:'Fall-Off Summary', edge:'right' },
  ],
  breakroom: [
    

    { slug:'daily-sales', kind:'screen', mode:'live',
      x:40.3, y:13.6, w:22.0, h:22.0, label:'Daily Sales Report' },

    { kind:'chefs' },

    

    { slug:'training-xfinity',      kind:'tool', x:18.2, y:42.0, w:3.1, h:16.0, label:'Xfinity Product Mastery' },
    { slug:'training-straight-line',kind:'tool', x:21.6, y:42.0, w:3.3, h:16.0, label:'Sales Process 101' },
    { slug:'training-tsheet',       kind:'tool', x:25.1, y:42.0, w:3.3, h:16.0, label:'The Plus-First Playbook' },
    { slug:'training-pos',          kind:'tool', x:28.5, y:42.0, w:1.9, h:16.0, label:'Celestial Point of Sale' },

    

    

    { slug:'arcade',                kind:'tool', x:87.4, y:30.4, w:13.6, h:45.6, label:'C\u00b3 Arcade \u00b7 Games', edge:'right' },
  ],
  freezer: [
    { kind:'lock', x:34.3, y:47.0, w:2.6, h:8.0, label:'Manager access' },

    

    { kind:'print', object:'note', x:57.4, y:36.0, w:11.2, h:26.0, rotate:1.1 },
  ],
};



export const CHEF_FRAMES = [
  { x:33.71, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:40.90, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:48.10, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:55.29, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:62.49, y:41.98, w:3.92, h:10.97, rotate:0 },
  { x:69.68, y:41.98, w:3.92, h:10.97, rotate:0 },
];




export const FREEZER_DOOR = {
  plate:     'plates/freezer-door.833492497b.webp',
  srcset:    'plates/freezer-door@1400.2c18d7f0b7.webp 1400w, '
           + 'plates/freezer-door@1800.5d976c9501.webp 1800w, '
           + 'plates/freezer-door.833492497b.webp 2400w',
   
  leaf:      { x: 38.45, y: 10.75, w: 23.20, h: 82.55 },
   
  opening:   { x: 39.55, y: 11.85, w: 21.00, h: 80.35 },
  

  keypad:    { x: 65.30, y: 39.20, w:  3.45, h:  7.95 },
   
  handle:    { x: 60.90, y: 52.80 },
  hinge:     'left',
  swing:     -78,
  thickness: 2.3,
  vanish:    { x: 50.0, y: 50.0 },
  fitPad:    3.5,
  fitY:      0.38
};
