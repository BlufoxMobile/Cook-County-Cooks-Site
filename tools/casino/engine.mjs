export const LEVELS = [
  {name:'Rookie',min:10,bb:10,help:2,skill:.18,samples:12},
  {name:'Regular',min:25,bb:25,help:2,skill:.4,samples:24},
  {name:'Sharp',min:50,bb:50,help:1,skill:.6,samples:45},
  {name:'High Roller',min:100,bb:100,help:0,skill:.8,samples:75},
  {name:'The C3 Elite',min:250,bb:250,help:0,skill:.95,samples:110}
];
export function rand(n) {
  if(!Number.isInteger(n)||n<1) throw Error('Invalid random range');
  const a=new Uint32Array(1), limit=Math.floor(4294967296/n)*n;
  do { globalThis.crypto.getRandomValues(a); } while(a[0]>=limit);
  return a[0]%n;
}
export function deck(count=1) {
  const d=[];for(let k=0;k<count;k++)for(let s=0;s<4;s++)for(let r=2;r<=14;r++)d.push({r,s,id:`${k}-${s}-${r}`});
  for(let i=d.length-1;i>0;i--){const j=rand(i+1);[d[i],d[j]]=[d[j],d[i]];}return d;
}
export const bjValue = cards => {
  let total=0,aces=0;for(const c of cards){total+=c.r===14?11:Math.min(10,c.r);if(c.r===14)aces++;}
  while(total>21&&aces){total-=10;aces--;}return {total,soft:aces>0};
};
export const natural = cards => cards.length===2&&bjValue(cards).total===21;
export class Blackjack {
  constructor(bet,bank,shoe=deck(6)) {
    if(bet<=0||bank<bet)throw Error('Not enough chips');
    this.bank=bank-bet;this.shoe=shoe;this.hands=[{cards:[shoe.pop()],bet,split:false,done:false}];
    this.dealer=[shoe.pop()];this.hands[0].cards.push(shoe.pop());this.dealer.push(shoe.pop());
    this.active=0;this.insurance=0;this.insuranceNet=0;this.results=[];this.startBank=bank;
    this.phase=this.dealer[0].r===14?'insurance':'player';
    if(this.phase!=='insurance')this.peek();
  }
  peek(){
    if(natural(this.dealer)||natural(this.hands[0].cards)){this.phase='settled';this.settle();}
    else this.phase='player';
  }
  insure(yes){
    if(this.phase!=='insurance')return;
    const cost=this.hands[0].bet/2;
    if(yes&&this.bank>=cost){this.insurance=cost;this.bank-=cost;if(natural(this.dealer)){this.bank+=cost*3;this.insuranceNet=cost*2;}else this.insuranceNet=-cost;}
    this.peek();
  }
  legal(){
    const h=this.hands[this.active];if(this.phase!=='player'||!h)return [];
    return ['hit','stand',...(h.cards.length===2&&this.bank>=h.bet?['double']:[]),...(!h.split&&h.cards.length===2&&h.cards[0].r===h.cards[1].r&&this.bank>=h.bet?['split']:[])];
  }
  act(action){
    if(!this.legal().includes(action))return false;let h=this.hands[this.active];
    if(action==='hit'){h.cards.push(this.shoe.pop());if(bjValue(h.cards).total>=21)h.done=true;}
    if(action==='stand')h.done=true;
    if(action==='double'){this.bank-=h.bet;h.bet*=2;h.cards.push(this.shoe.pop());h.done=true;}
    if(action==='split'){
      this.bank-=h.bet;const a=h.cards[0],b=h.cards[1],aces=a.r===14;
      this.hands=[{cards:[a,this.shoe.pop()],bet:h.bet,split:true,done:aces},{cards:[b,this.shoe.pop()],bet:h.bet,split:true,done:aces}];
      for(const hand of this.hands)if(bjValue(hand.cards).total===21)hand.done=true;
    }
    while(this.active<this.hands.length&&this.hands[this.active].done)this.active++;
    if(this.active>=this.hands.length)this.phase='dealer';return true;
  }
  dealerStep(){
    if(this.phase!=='dealer')return false;
    if(this.hands.some(h=>bjValue(h.cards).total<=21)&&bjValue(this.dealer).total<17){this.dealer.push(this.shoe.pop());return true;}
    this.settle();return false;
  }
  settle(){
    if(this.results.length)return;const d=bjValue(this.dealer).total,dn=natural(this.dealer);
    this.results=this.hands.map(h=>{
      const p=bjValue(h.cards).total,pn=!h.split&&natural(h.cards);
      let paid=0,label='Dealer wins';
      if(p>21)label='Bust';
      else if(dn){if(pn){paid=h.bet;label='Push';}}
      else if(pn){paid=h.bet*2.5;label='Blackjack';}
      else if(d>21||p>d){paid=h.bet*2;label='You win';}
      else if(p===d){paid=h.bet;label='Push';}
      this.bank+=paid;return {label,net:paid-h.bet,paid};
    });this.phase='settled';this.net=this.bank-this.startBank;
  }
}
export function bjHint(game){
  const h=game.hands[game.active];if(!h)return '';const {total:t,soft}=bjValue(h.cards),u=game.dealer[0].r===14?11:Math.min(10,game.dealer[0].r),legal=game.legal();
  if(legal.includes('split')){
    const r=h.cards[0].r;
    if(r===14||r===8||(r===9&&[2,3,4,5,6,8,9].includes(u))||(r===7&&u<=7)||(r===6&&u<=6)||([2,3].includes(r)&&u<=7)||(r===4&&[5,6].includes(u)))return 'Split';
  }
  if(soft){
    if(t>=19)return 'Stand';
    if(legal.includes('double')&&((t===18&&u>=3&&u<=6)||(t===17&&u>=3&&u<=6)||([15,16].includes(t)&&u>=4&&u<=6)||([13,14].includes(t)&&u>=5&&u<=6)))return 'Double';
    return t===18&&u<=8?'Stand':'Hit';
  }
  if(legal.includes('double')&&((t===11&&u<11)||(t===10&&u<=9)||(t===9&&u>=3&&u<=6)))return 'Double';
  if(t>=17||(t>=13&&u<=6)||(t===12&&u>=4&&u<=6))return 'Stand';return 'Hit';
}
export const HAND_NAMES=['High card','One pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
export function five(cards){
  const ranks=cards.map(c=>c.r).sort((a,b)=>b-a),counts=new Map();for(const r of ranks)counts.set(r,(counts.get(r)||0)+1);
  const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]),flush=cards.every(c=>c.s===cards[0].s);
  let straight=0;if(counts.size===5){if(ranks[0]-ranks[4]===4)straight=ranks[0];else if(ranks.join(',')==='14,5,4,3,2')straight=5;}
  if(flush&&straight)return [8,straight];
  if(groups[0][1]===4)return [7,groups[0][0],groups[1][0]];
  if(groups[0][1]===3&&groups[1][1]===2)return [6,groups[0][0],groups[1][0]];
  if(flush)return [5,...ranks];if(straight)return [4,straight];
  if(groups[0][1]===3)return [3,...groups.map(g=>g[0])];
  if(groups[0][1]===2&&groups[1][1]===2)return [2,...groups.map(g=>g[0])];
  if(groups[0][1]===2)return [1,...groups.map(g=>g[0])];return [0,...ranks];
}
export function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const diff=(a[i]||0)-(b[i]||0);if(diff)return Math.sign(diff);}return 0;}
export function best(cards){
  if(cards.length<5)return [0,...cards.map(c=>c.r).sort((a,b)=>b-a)];
  let v=[-1];for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){const n=five([cards[a],cards[b],cards[c],cards[d],cards[e]]);if(compare(n,v)>0)v=n;}return v;
}
export class Poker {
  constructor(stack,bb,button=0,shoe=deck()){
    if(stack<bb)throw Error('Insufficient table stack');
    this.shoe=shoe;this.bb=bb;this.button=button;this.stacks=[stack,stack];this.initial=stack;
    this.cards=[[],[]];for(let i=0;i<2;i++){this.cards[1-button].push(shoe.pop());this.cards[button].push(shoe.pop());}
    this.board=[];this.pot=0;this.bets=[0,0];this.street=0;this.phase='play';this.lastRaise=bb;this.pending=new Set([0,1]);this.actor=button;this.log=[];
    this.pay(button,bb/2);this.pay(1-button,bb);this.current=bb;
  }
  pay(p,n){n=Math.min(n,this.stacks[p]);this.stacks[p]-=n;this.bets[p]+=n;this.pot+=n;return n;}
  legal(p=this.actor){
    if(this.phase!=='play'||p!==this.actor)return null;
    const call=Math.max(0,this.current-this.bets[p]),max=Math.min(this.bets[p]+this.stacks[p],this.bets[1-p]+this.stacks[1-p]);
    return {call:Math.min(call,this.stacks[p]),check:call===0,minRaise:this.current+this.lastRaise,maxRaise:max,canRaise:max>this.current,shortRaise:max>this.current&&max<this.current+this.lastRaise};
  }
  act(type,amount){
    const p=this.actor,l=this.legal();if(!l)return false;
    if(type==='fold'){this.finish(1-p,'Fold');return true;}
    if(type==='check'&&!l.check)return false;
    if(type==='raise'){
      const target=Number(amount);if(!l.canRaise||!Number.isFinite(target)||target>l.maxRaise||target<=this.current||(target<l.minRaise&&target!==l.maxRaise))return false;
      this.lastRaise=Math.max(this.lastRaise,target-this.current);this.pay(p,target-this.bets[p]);this.current=target;this.pending=new Set([1-p]);
      this.log.push(`${p===0?'You':'Ace'} ${this.bets[1-p]===0?'bet':'raise to'} ${target}`);
    } else if(type==='call'||type==='check'){
      this.pay(p,l.call);this.pending.delete(p);this.log.push(`${p===0?'You':'Ace'} ${l.call?'call '+l.call:'check'}`);
    }else return false;
    if(this.pending.size===0)this.nextStreet();else this.actor=1-p;return true;
  }
  nextStreet(){
    if(this.stacks.some(s=>s===0)){while(this.board.length<5)this.dealStreet();this.showdown();return;}
    if(this.street===3){this.showdown();return;}
    this.dealStreet();this.bets=[0,0];this.current=0;this.lastRaise=this.bb;this.pending=new Set([0,1]);this.actor=1-this.button;
  }
  dealStreet(){this.shoe.pop();const n=this.board.length===0?3:1;for(let i=0;i<n;i++)this.board.push(this.shoe.pop());this.street++;}
  showdown(){this.ranks=this.cards.map(c=>best([...c,...this.board]));const c=compare(...this.ranks);this.finish(c===0?-1:c>0?0:1,'Showdown');}
  finish(winner,reason){
    if(this.phase==='settled')return;this.winner=winner;this.reason=reason;this.wonPot=this.pot;
    if(winner===-1){this.stacks[0]+=this.pot/2;this.stacks[1]+=this.pot/2;}else this.stacks[winner]+=this.pot;
    this.pot=0;this.phase='settled';this.net=this.stacks[0]-this.initial;
  }
}
export function equity(own,board,samples){
  const known=new Set([...own,...board].map(c=>c.s*13+c.r));let pool=[];for(let s=0;s<4;s++)for(let r=2;r<=14;r++)if(!known.has(s*13+r))pool.push({r,s});
  let wins=0;for(let k=0;k<samples;k++){
    const d=pool.slice();for(let j=0;j<7-board.length;j++){const r=j+rand(d.length-j);[d[j],d[r]]=[d[r],d[j]];}
    const b=[...board,...d.slice(2,7-board.length)],cmp=compare(best([...own,...b]),best([d[0],d[1],...b]));wins+=cmp>0?1:cmp===0?.5:0;
  }return wins/samples;
}
export function botAction(game,level){
  const l=game.legal(1);if(!l)return null;
  const cfg=LEVELS[level],eq=equity(game.cards[1],game.board,cfg.samples),noise=(rand(1000)/1000-.5)*(1-cfg.skill)*.65,strength=eq+noise;
  const odds=l.call/(game.pot+l.call||1),bluff=rand(1000)/1000<(.025+cfg.skill*.07);
  if(l.call&&strength<odds+.07*cfg.skill&&!bluff)return {type:'fold'};
  if(l.canRaise&&(strength>.73-cfg.skill*.11||bluff)){
    const desired=Math.max(l.minRaise,game.current+Math.round(Math.max(game.bb,game.pot*(.4+cfg.skill*.35))/game.bb)*game.bb);
    return {type:'raise',amount:Math.min(desired,l.maxRaise)};
  }return {type:l.check?'check':'call'};
}
export const REDS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const WHEEL=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
export function rouletteBet(key){
  if(/^n\d+$/.test(key)){const n=Number(key.slice(1));if(n>=0&&n<=36)return {label:String(n),numbers:[n],payout:35};}
  const a=Array.from({length:36},(_,i)=>i+1);
  const defs={red:['Red',a.filter(n=>REDS.has(n)),1],black:['Black',a.filter(n=>!REDS.has(n)),1],even:['Even',a.filter(n=>n%2===0),1],odd:['Odd',a.filter(n=>n%2===1),1],low:['1–18',a.slice(0,18),1],high:['19–36',a.slice(18),1]};
  for(let i=0;i<3;i++){defs['d'+i]=[`${i*12+1}–${(i+1)*12}`,a.slice(i*12,(i+1)*12),2];defs['c'+i]=[`Column ${i+1}`,a.filter(n=>(n-1)%3===i),2];}
  if(defs[key]){const [label,numbers,payout]=defs[key];return {label,numbers,payout};}throw Error('Unknown bet');
}
export function rouletteReturn(bets,result){let paid=0;for(const b of bets){const spec=rouletteBet(b.key);if(spec.numbers.includes(result))paid+=b.amount*(spec.payout+1);}return paid;}
