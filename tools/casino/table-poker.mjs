import {deck,rand,best,compare,LEVELS} from './engine.mjs';

export const PLAYERS=[
  {name:'You',style:'Your seat',color:'#e4c483'},
  {name:'Maya',style:'Patient',color:'#93ba9d',tight:.045,aggression:.45},
  {name:'Marcus',style:'Balanced',color:'#cab27e',tight:.005,aggression:.65},
  {name:'Kai',style:'Analytical',color:'#8aafc9',tight:.025,aggression:.55},
  {name:'Elena',style:'Aggressive',color:'#c78a94',tight:-.025,aggression:.92},
  {name:'Rico',style:'Loose',color:'#af9fc5',tight:-.055,aggression:.55}
];

// Multiway no-limit state machine. Chip denomination is 0.5 play chips.
export class TablePoker {
  constructor(stacks,bb,button=0,shoe=deck()){
    if(stacks.length<2||stacks.length>6||stacks.some(n=>!Number.isFinite(n)||n<=0||n*2%1)||!Number.isFinite(bb)||bb<=0||bb%1)throw Error('Invalid table stacks or blinds');
    this.n=stacks.length;this.stacks=[...stacks];this.initial=[...stacks];this.bb=bb;this.button=((button%this.n)+this.n)%this.n;this.shoe=shoe;
    this.cards=stacks.map(()=>[]);this.board=[];this.folded=stacks.map(()=>false);this.bets=stacks.map(()=>0);this.total=stacks.map(()=>0);this.actedAt=stacks.map(()=>null);this.status=stacks.map(()=> '');
    this.pot=0;this.street=0;this.phase='play';this.current=bb;this.lastRaise=bb;this.log=[];this.awards=stacks.map(()=>0);this.pots=[];this.ranks=[];this.lastAction=null;
    for(let pass=0;pass<2;pass++)for(let j=1;j<=this.n;j++)this.cards[(this.button+j)%this.n].push(shoe.pop());
    this.sb=this.n===2?this.button:(this.button+1)%this.n;this.big=(this.sb+1)%this.n;
    this.pay(this.sb,bb/2);this.pay(this.big,bb);this.status[this.sb]='Small blind';this.status[this.big]='Big blind';
    this.pending=new Set(this.stacks.flatMap((s,i)=>s>0?[i]:[]));this.actor=this.next(this.big,i=>this.canAct(i));this.advance(this.big);
  }
  next(from,predicate){for(let j=1;j<=this.n;j++){const i=(from+j)%this.n;if(predicate(i))return i;}return -1;}
  alive(){return this.folded.flatMap((f,i)=>f?[]:[i]);}
  canAct(i){return !this.folded[i]&&this.stacks[i]>0;}
  pay(i,amount){const n=Math.min(amount,this.stacks[i]);this.stacks[i]-=n;this.bets[i]+=n;this.total[i]+=n;this.pot+=n;return n;}
  legal(i=this.actor){
    if(this.phase!=='play'||i!==this.actor||!this.canAct(i))return null;
    const owed=Math.max(0,this.current-this.bets[i]),max=this.bets[i]+this.stacks[i];
    const reopen=this.actedAt[i]===null||this.actedAt[i]===0||this.current-this.actedAt[i]>=this.lastRaise;
    const min=this.current<this.bb?this.bb:this.current+this.lastRaise;
    const canRaise=reopen&&max>this.current&&this.stacks.some((_,j)=>j!==i&&this.canAct(j));
    return {call:Math.min(owed,this.stacks[i]),check:owed===0,minRaise:min,maxRaise:max,canRaise,shortRaise:canRaise&&max<min,reopened:reopen};
  }
  act(type,amount){
    const p=this.actor,l=this.legal();if(!l)return false;
    let text='',paid=0;
    if(type==='fold'){this.folded[p]=true;text='Fold';}
    else if(type==='check'){if(!l.check)return false;text='Check';this.actedAt[p]=this.current;}
    else if(type==='call'){if(l.check)return false;paid=this.pay(p,l.call);text=this.stacks[p]===0?'All-in '+this.bets[p]:'Call '+paid;this.actedAt[p]=this.current;}
    else if(type==='raise'){
      const target=Number(amount);if(!l.canRaise||!Number.isFinite(target)||target*2%1||target>l.maxRaise||target<=this.current||(target<l.minRaise&&target!==l.maxRaise))return false;
      const old=this.current,increase=target-old;
      if(target>=l.minRaise)this.lastRaise=old<this.bb?target:increase;
      paid=this.pay(p,target-this.bets[p]);this.current=target;this.actedAt[p]=target;
      this.pending=new Set(this.stacks.flatMap((_,i)=>i!==p&&this.canAct(i)?[i]:[]));
      text=this.stacks[p]===0?'All-in '+target:old===0?'Bet '+target:'Raise to '+target;
    }else return false;
    this.pending.delete(p);this.status[p]=text;this.log.push(`${PLAYERS[p].name}: ${text}`);this.lastAction={player:p,type,paid,text,street:this.street};
    this.advance(p);return true;
  }
  advance(from){
    const alive=this.alive();if(alive.length===1){this.refundUncalled();this.settle(false);return;}
    const able=alive.filter(i=>this.canAct(i));
    this.pending=new Set([...this.pending].filter(i=>this.canAct(i)));
    if(able.length<=1){
      this.current=Math.max(...this.bets);
      if(able.length===1&&this.bets[able[0]]<this.current){this.pending=new Set(able);this.actor=able[0];return;}
      this.closeStreet();return;
    }
    if(this.pending.size===0){this.closeStreet();return;}
    this.actor=this.next(from,i=>this.pending.has(i));
  }
  refundUncalled(){
    const order=this.bets.map((amount,i)=>({amount,i})).sort((a,b)=>b.amount-a.amount),top=order[0],second=order[1]?.amount??0;
    if(top.amount>second){const extra=top.amount-second;this.stacks[top.i]+=extra;this.total[top.i]-=extra;this.bets[top.i]-=extra;this.pot-=extra;}
  }
  closeStreet(){
    this.refundUncalled();
    if(this.street===3){this.settle(true);return;}
    if(this.alive().filter(i=>this.canAct(i)).length<=1){this.phase='runout';this.actor=-1;return;}
    this.dealStreet();this.bets.fill(0);this.current=0;this.lastRaise=this.bb;this.actedAt.fill(null);
    this.pending=new Set(this.stacks.flatMap((_,i)=>this.canAct(i)?[i]:[]));this.status=this.status.map((s,i)=>this.folded[i]?'Fold':this.stacks[i]===0?'All-in':'');
    this.actor=this.next(this.button,i=>this.canAct(i));
  }
  dealStreet(){this.shoe.pop();const count=this.board.length===0?3:1;for(let j=0;j<count;j++)this.board.push(this.shoe.pop());this.street++;}
  runoutStep(){if(this.phase!=='runout')return false;if(this.board.length<5)this.dealStreet();else this.settle(true);return true;}
  potLayers(){
    const caps=[...new Set(this.total.filter(n=>n>0))].sort((a,b)=>a-b);let before=0;
    const layers=[];
    for(const cap of caps){const contributors=this.total.flatMap((n,i)=>n>=cap?[i]:[]),amount=(cap-before)*contributors.length,eligible=contributors.filter(i=>!this.folded[i]);before=cap;
      const previous=layers.at(-1);
      // Dead money at different contribution levels is still the same pot when eligibility matches.
      if(previous&&previous.eligible.join(',')===eligible.join(',')){previous.amount+=amount;previous.cap=cap;}
      else layers.push({amount,cap,eligible,contributors});
    }return layers;
  }
  settle(showdown){
    if(this.phase==='settled')return;this.reason=showdown?'Showdown':'Fold';this.wonPot=this.pot;this.ranks=this.cards.map((c,i)=>showdown&&!this.folded[i]?best([...c,...this.board]):null);
    this.pots=this.potLayers();this.awards.fill(0);
    for(const pot of this.pots){
      let winners=pot.eligible;
      if(!winners.length)throw Error('Pot without eligible player');
      if(showdown&&winners.length>1){let top=[-1];for(const i of winners)if(compare(this.ranks[i],top)>0)top=this.ranks[i];winners=winners.filter(i=>compare(this.ranks[i],top)===0);}
      winners.sort((a,b)=>((a-this.button-1+this.n)%this.n)-((b-this.button-1+this.n)%this.n));
      const units=Math.round(pot.amount*2),base=Math.floor(units/winners.length),extra=units%winners.length;
      winners.forEach((i,j)=>{const paid=(base+(j<extra?1:0))/2;this.awards[i]+=paid;this.stacks[i]+=paid;});pot.winners=winners;
    }
    this.winners=[...new Set(this.pots.flatMap(p=>p.winners))];this.pot=0;this.phase='settled';this.actor=-1;this.net=this.stacks[0]-this.initial[0];
    this.status=this.status.map((s,i)=>this.awards[i]>0?'Won '+this.awards[i]:this.folded[i]?'Fold':showdown?'Showdown':s);
  }
}

export function tableEquity(own,board,opponents,samples){
  const known=new Set([...own,...board].map(c=>c.s*13+c.r));const pool=[];
  for(let s=0;s<4;s++)for(let r=2;r<=14;r++)if(!known.has(s*13+r))pool.push({r,s});
  const needed=opponents*2+5-board.length;let score=0;
  for(let t=0;t<samples;t++){
    const d=pool.slice();for(let j=0;j<needed;j++){const k=j+rand(d.length-j);[d[j],d[k]]=[d[k],d[j]];}
    const shared=[...board,...d.slice(opponents*2,needed)],mine=best([...own,...shared]);let tied=1,lost=false;
    for(let o=0;o<opponents;o++){const cmp=compare(mine,best([d[o*2],d[o*2+1],...shared]));if(cmp<0){lost=true;break;}if(cmp===0)tied++;}
    if(!lost)score+=1/tied;
  }return score/samples;
}
export function tableBotAction(p,level){
  const i=p.actor,l=p.legal();if(!l||i===0)return null;
  const cfg=LEVELS[level],style=PLAYERS[i],opponents=p.alive().length-1;
  // Inputs contain only this bot's cards, the public board and public betting state.
  const eq=tableEquity(p.cards[i],p.board,opponents,cfg.samples),noise=(rand(1000)/1000-.5)*(1-cfg.skill)*.28;
  const strength=eq+noise-style.tight,odds=l.call/(p.pot+l.call||1),bluff=rand(1000)/1000<(.012+cfg.skill*.035)*style.aggression/Math.sqrt(opponents);
  if(l.call&&strength<odds+cfg.skill*.025&&!bluff)return {type:'fold'};
  const threshold=Math.max(.32,1/(opponents+1)*1.4)+(1-style.aggression)*.1;
  if(l.canRaise&&(strength>threshold||bluff)){
    const bet=Math.round(Math.max(p.bb,p.pot*(.35+style.aggression*.4))/p.bb)*p.bb;
    return {type:'raise',amount:Math.min(l.maxRaise,Math.max(l.minRaise,p.current+bet))};
  }return {type:l.check?'check':'call'};
}
