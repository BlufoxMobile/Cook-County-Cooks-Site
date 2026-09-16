import {SYMBOLS,slotMultiplier,symbolHTML} from './slots.mjs';
import {LEVELS,Blackjack,bjValue,bjHint,Poker,botAction,best,HAND_NAMES,REDS,WHEEL,rand,rouletteBet,rouletteReturn} from './engine.mjs';
import {LoungeAudio} from './audio.mjs';
import {TablePoker,PLAYERS,tableBotAction} from './table-poker.mjs';
import {DealerPerformance} from './dealer.mjs';
import {betBounds,sliderToBet,betToSlider,exactBetValid,presetBet} from './betting.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],fmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:1}),audio=new LoungeAudio();
let mode='poker',level=0,bank=10000,wager=100,round=0,bj=null,poker=null,pokerReserve=0,button=1,bets=[],history=[],spinning=false,chip=25,wheelRotation=0,busy=false,settledId='',toastTimer,renderedCards=new Set();
try{level=Math.min(4,Math.max(0,Number(localStorage.getItem('c3-level'))||0));audio.volume=Math.max(0,Math.min(1,Number(localStorage.getItem('c3-volume')??.55)));}catch{}
let reels=[0,2,4],slotLast=null,musicWanted=true;
try{musicWanted=localStorage.getItem('c3-music')!=='off';}catch{}
const dealer=new DealerPerformance($('#stage'));
let botStacks=null,tableHand=0,dealtCount=12,fastForward=false,boardShown=5,suppressCardEntrance=false;
const suits=['♠','♥','♦','♣'],rank=r=>({11:'J',12:'Q',13:'K',14:'A'}[r]||r);
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
function active(){return busy||spinning||(bj&&bj.phase!=='settled')||(poker&&poker.phase!=='settled');}
function card(c,i=0,hidden=false,empty=false,scope=''){
  const key=`${round}-${scope}-${c?.id}-${hidden}-${empty}`,fresh=!renderedCards.has(key);renderedCards.add(key);
  if(empty)return '<div class="card empty" aria-hidden="true">♠</div>';
  return `<div class="card ${hidden?'back':c.s===1||c.s===2?'red':''} ${fresh&&!suppressCardEntrance?'enter':''}" style="--delay:${Math.min(i,4)*80}ms;--tilt:${i%2?-2:2}deg" role="img" aria-label="${hidden?'Face-down card':rank(c.r)+' of '+['spades','hearts','diamonds','clubs'][c.s]}">${hidden?'':`<span class="corner">${rank(c.r)}<span>${suits[c.s]}</span></span><span>${suits[c.s]}</span><span class="corner bottom">${rank(c.r)}<span>${suits[c.s]}</span></span>`}</div>`;
}
function cardList(cards,hiddenIndex=-1,scope=''){return `<div class="cards ${cards.length>4?'many':''}">${cards.map((c,i)=>card(c,i,i===hiddenIndex,false,scope)).join('')}</div>`;}
function showResult(title,detail,net=0){if(net>0)dealer.play('nod');const o=$('#outcome');o.innerHTML=`<strong>${title}</strong><small>${detail}</small>`;o.className=`outcome visible ${net>0?'win':net<0?'loss':''}`;audio.fx(net>0?'win':net<0?'lose':'push');}
function clearResult(){$('#outcome').className='outcome';}
function speech(text){$('#speech').textContent=text;}
function syncHeader(){
  $('#balance').textContent=fmt(bank);$('#level-name').textContent=LEVELS[level].name;$('.level-bars').textContent='▮'.repeat(level+1)+'▯'.repeat(4-level);
  $('#table-min').textContent=mode==='poker'?`BLINDS · ${LEVELS[level].bb/2} / ${LEVELS[level].bb}`:`TABLE MIN · ${LEVELS[level].min}`;
  $('#round-count').textContent=`${mode==='roulette'?'SPIN':'HAND'} ${String(Math.max(1,round)).padStart(3,'0')}`;
  $$('[data-game]').forEach(b=>{b.classList.toggle('selected',b.dataset.game===mode);b.setAttribute('aria-pressed',String(b.dataset.game===mode));b.disabled=!!active();});
  $('#refill').disabled=!!active()||bets.length>0;$('#level-button').disabled=!!active()||bets.length>0;
}
function render(){syncHeader();if(mode==='blackjack')renderBlackjack();if(mode==='poker')renderPoker();if(mode==='roulette')renderRoulette();if(mode==='slots')renderSlots();}
function chips(selected){return [...new Set([LEVELS[level].min,25,100,500])].sort((a,b)=>a-b).map(n=>`<button class="chip ${n===selected?'picked':''}" data-amount="${n}" aria-label="Select ${n} chips" aria-pressed="${n===selected}" ${n<LEVELS[level].min?'disabled':''}>${n}</button>`).join('');}
function bindChips(){ $$('[data-amount]').forEach(b=>b.onclick=()=>{audio.unlock();audio.fx('chip');if(mode==='roulette'){chip=Number(b.dataset.amount);render();}else{wager=Number(b.dataset.amount);render();}}); }
function renderBlackjack(){
  const area=$('#table-content');area.className='table-content';$('#control-label').textContent='YOUR WAGER';$('#wager-display').innerHTML=`${fmt(bj&&bj.phase!=='settled'?bj.hands.reduce((s,h)=>s+h.bet,0):wager)} <span>CHIPS</span>`;
  const done=bj?.phase==='settled',reveal=done||bj?.phase==='dealer';
  if(!bj){
    area.innerHTML=`<div class="hand-row"><div class="cards">${card(null,0,true,false,'idle1')}${card(null,1,true,false,'idle2')}</div><div class="hand-label">ACE<span>DEALER</span></div></div><div class="player-zone"><div class="hand-row"><div class="cards">${card(null,0,false,true)}${card(null,1,false,true)}</div><div class="hand-label">YOUR HAND<strong>Ready?</strong></div></div></div>`;
  }else{
    area.innerHTML=`<div class="hand-row">${cardList(bj.dealer,reveal?-1:1,'dealer')}<div class="hand-label">ACE<strong>${reveal?bjValue(bj.dealer).total:bjValue([bj.dealer[0]]).total}</strong></div></div><div class="player-zone ${bj.hands.length>1?'split':''}">${bj.hands.map((h,i)=>`<div class="hand-row ${bj.active===i&&bj.phase==='player'?'active':''}">${cardList(h.cards,-1,'hand'+i)}<div class="hand-label">${bj.hands.length>1?'HAND '+(i+1):'YOUR HAND'}<strong>${bjValue(h.cards).total}${bjValue(h.cards).soft?' / SOFT':''}</strong>${done?`<span>${bj.results[i].label}</span>`:''}</div></div>`).join('')}</div>`;
  }
  if(!bj||done){
    $('#controls').innerHTML=chips(wager);$('#actions').innerHTML=`<button class="primary" id="deal" ${bank<wager||busy?'disabled':''}>${bj?'Deal again':'Deal me in'} <span>↗</span></button>`;
    $('#coach').textContent=bank<wager?'Choose a smaller wager or refill your free chips.':LEVELS[level].help?'Pick a chip value, then deal. Blackjack pays 3:2.':'Set your wager. The table is yours.';
    bindChips();$('#deal').onclick=startBlackjack;
  }else if(bj.phase==='insurance'){
    $('#controls').innerHTML='<span class="bet-hint">Ace showing. Insurance costs half your wager and pays 2:1.</span>';
    $('#actions').innerHTML=`<button class="secondary" id="no-insurance">No thanks</button><button class="primary" id="insurance" ${bj.bank<bj.hands[0].bet/2?'disabled':''}>Insure · ${fmt(bj.hands[0].bet/2)}</button>`;
    $('#coach').textContent=LEVELS[level].help?'Coaching: declining insurance is the basic-strategy choice.':'Insurance? Ace checks for blackjack next.';
    $('#no-insurance').onclick=()=>insurance(false);$('#insurance').onclick=()=>insurance(true);
  }else if(bj.phase==='dealer'||busy){$('#controls').innerHTML='';$('#actions').innerHTML='<button class="primary" disabled>Dealing…</button>';$('#coach').textContent='Ace reveals and draws to 17.';
  }else{
    const legal=bj.legal();$('#controls').innerHTML=`<div class="action-group">${['hit','stand','double','split'].map(a=>`<button class="${a==='hit'?'primary':'secondary'}" data-bj="${a}" ${!legal.includes(a)?'disabled':''}>${{hit:'Hit +',stand:'Stand',double:'Double ×2',split:'Split ⇄'}[a]}</button>`).join('')}</div>`;$('#actions').innerHTML='';
    $('#coach').textContent=LEVELS[level].help===2?`Ace’s tip: ${bjHint(bj)}. ${bj.hands.length>1?'Playing hand '+(bj.active+1)+'.':'Get closer to 21 without going over.'}`:LEVELS[level].help?'Hit draws a card. Stand keeps your total.':'Your move.';
    $$('[data-bj]').forEach(b=>b.onclick=()=>playBlackjack(b.dataset.bj));
  }
}
async function startBlackjack(){
  if(active()||bank<wager||wager<LEVELS[level].min)return;busy=true;await audio.unlock();busy=false;clearResult();round++;renderedCards.clear();bj=new Blackjack(wager,bank);bank=bj.bank;dealer.play('deal',2);dealer.flyCard('.player-zone .cards');audio.fx('card');speech('Your cards. Take your time.');render();finishBlackjack();
}
function insurance(yes){bj.insure(yes);bank=bj.bank;render();finishBlackjack();}
function playBlackjack(a){if(busy||!bj.act(a))return;if(a!=='stand'){dealer.play('deal');dealer.flyCard('.player-zone .cards');}audio.fx(a==='stand'?'chip':'card');bank=bj.bank;render();if(bj.phase==='dealer')dealerTurn();}
async function dealerTurn(){busy=true;render();await pause(550);while(bj.phase==='dealer'){const drew=bj.dealerStep();bank=bj.bank;render();if(drew){dealer.play('deal');dealer.flyCard('.hand-row .cards');audio.fx('card');await pause(600);}}busy=false;render();finishBlackjack();}
function finishBlackjack(){
  if(!bj||bj.phase!=='settled'||settledId===`b${round}`)return;settledId=`b${round}`;bank=bj.bank;render();
  let title=bj.hands.length>1?(bj.net>0?'Nice split.':bj.net===0?'Even on the split.':'Next hand is yours.'):bj.results[0].label;
  showResult(title,`${bj.net>0?'+':''}${fmt(bj.net)} chips · Net result${bj.insurance?' · Insurance included':''}`,bj.net);
  speech(bj.net>0?'Now that’s a good hand. Nicely played.':bj.net===0?'A push. Your wager comes back.':'Fresh cards. Fresh opportunity.');
}
function playerSeat(i,p){
  const info=PLAYERS[i],done=p?.phase==='settled',folded=p?.folded[i],turn=p?.phase==='play'&&p.actor===i&&!busy,winner=done&&p.awards[i]>0;
  const currentButton=p?.button??((button+1)%6),blind=p?(i===p.sb?'SB':i===p.big?'BB':''):'';
  let cards='';for(let j=0;j<2;j++){
    const order=(i-currentButton-1+6)%6+j*6,shown=!p||order<dealtCount;
    const reveal=p&&(i===0||(done&&p.reason==='Showdown'&&!folded)||(p.phase==='runout'&&!folded));
    cards+=shown&&p?card(p.cards[i][j],j,!reveal,false,'seat'+i):card(null,j,false,true,'seat'+i);
  }
  const value=p?p.stacks[i]:i===0?Math.min(bank,LEVELS[level].bb*100):(botStacks?.[i-1]??LEVELS[level].bb*[110,85,120,70,100][i-1]);
  const status=p?(p.phase==='play'&&p.actor===i?(i===0?'YOUR TURN':'THINKING…'):p.status[i]||'In the hand'):(i===0?'YOUR SEAT':info.style.toUpperCase());
  return `<div class="poker-seat seat-${i} ${i===0?'human':''} ${folded?'folded':''} ${turn||p?.phase==='play'&&p.actor===i?'on-turn':''} ${winner?'pot-winner':''}" data-seat="${i}" style="--seat-color:${info.color}">
    <div class="seat-portrait ${i===0?'hero-portrait':'portrait-'+i}" aria-hidden="true">${i===0?'C3':''}</div>
    <div class="seat-plaque"><div class="seat-name">${info.name}${i>0?'<span class="ai-tag">AI</span>':''}${currentButton===i?'<span class="dealer-button">D</span>':''}${blind?'<span class="blind-tag">'+blind+'</span>':''}</div><strong>${fmt(value)} <small>◉</small></strong><span class="seat-action">${status}</span></div>
    <div class="seat-cards ${folded?'mucked':''}">${cards}</div>${p&&p.bets[i]>0&&!done?'<div class="seat-wager">◉ '+fmt(p.bets[i])+'</div>':''}
  </div>`;
}
function renderPoker(){
  const area=$('#table-content');area.className='table-content full-poker-table';const p=poker,done=p?.phase==='settled';
  const pot=p?(done?p.wonPot:p.pot):0,layers=p?.potLayers().filter(x=>x.contributors.length>1).length||1;
  area.innerHTML=`<div class="poker-felt" aria-hidden="true"><span>C3</span></div>${Array.from({length:6},(_,i)=>playerSeat(i,p)).join('')}
    <div class="shared-board"><div class="pot-label">${done?'AWARDED':'POT'} <b>${fmt(pot)} ◉</b>${layers>1?'<span class="side-pot-count">'+(layers-1)+' SIDE POT'+(layers>2?'S':'')+'</span>':''}</div><div class="board">${Array.from({length:5},(_,i)=>p?.board[i]&&i<boardShown?card(p.board[i],i,false,false,'board'):card(null,i,false,true)).join('')}</div><div class="street-label">${p?['PRE-FLOP','THE FLOP','THE TURN','THE RIVER'][Math.min(3,p.street)]:'SIX-SEAT NO-LIMIT'}<span>${p?p.alive().length+' IN THE HAND':'YOU + FIVE AI PLAYERS'}</span></div></div>
    <div class="table-action-feed" aria-live="polite">${p?.log.at(-1)||'Ace is your dealer. Take your seat.'}</div>`;
  $('#control-label').textContent=p&&!done?'YOUR TABLE STACK':'TABLE BUY-IN';$('#wager-display').innerHTML=`${fmt(p&&!done?p.stacks[0]:Math.min(bank,LEVELS[level].bb*100))} <span>CHIPS</span>`;
  if(!p||done){
    $('#controls').innerHTML=`<div class="bet-hint">SIX-SEAT NO-LIMIT<br>Blinds ${LEVELS[level].bb/2} / ${LEVELS[level].bb} · Five AI opponents</div>`;
    $('#actions').innerHTML=`<button class="primary" id="poker-deal" ${bank<LEVELS[level].bb||busy?'disabled':''}>${p?'Next hand':'Take your seat'} ↗</button>`;$('#poker-deal').onclick=startPoker;
    $('#coach').textContent=bank<LEVELS[level].bb?'Refill your free chips to return to the table.':'Ace deals. Maya, Marcus, Kai, Elena and Rico play against you.';
  }else if(p.actor!==0||busy||p.phase==='runout'){
    const label=dealtCount<12?'Ace is dealing…':p.phase==='runout'?'Running the board…':`${PLAYERS[p.actor]?.name||'The table'}’s move…`;
    $('#controls').innerHTML=`<div class="bet-hint">${p.folded[0]?'You folded. Watch the hand play out.':label}</div>`;
    $('#actions').innerHTML=p.folded[0]?`<button class="secondary" id="fast-forward" ${fastForward?'disabled':''}>${fastForward?'Finishing…':'Skip to result »'}</button>`:`<button class="primary" disabled>${label}</button>`;
    if($('#fast-forward'))$('#fast-forward').onclick=()=>{fastForward=true;render();};
    $('#coach').textContent='Every opponent sees only their own cards and the shared board.';
  }else{
    const l=p.legal();$('#controls').innerHTML=`<div class="action-group"><button class="danger" id="fold">Fold</button><button class="primary" id="call">${l.check?'Check':'Call '+fmt(l.call)}</button></div>${l.canRaise?betComposer(p,l):''}`;
    $('#actions').innerHTML=l.canRaise?'<button class="primary commit-bet" id="raise"></button>':'';
    $('#fold').onclick=()=>playerPoker('fold');$('#call').onclick=()=>playerPoker(l.check?'check':'call');
    if(l.canRaise)bindBetComposer(p,l);
    const hand=p.board.length>=3?HAND_NAMES[best([...p.cards[0],...p.board])[0]]:'Two private cards';
    $('#coach').textContent=LEVELS[level].help===2?`${hand}. ${l.check?'You can check for free.':'Call '+fmt(l.call)+' to stay in.'}`:LEVELS[level].help?hand:'Your action. Take your time.';
  }
}
function betComposer(p,l){
  const bounds=betBounds(l,p.bb);
  return `<div class="bet-composer"><div class="bet-amount-row"><label for="bet-amount">${p.current===0?'BET':'RAISE TO'}</label><div class="amount-stepper"><button id="bet-minus" aria-label="Decrease by ${fmt(bounds.step)} chips">−</button><input id="bet-amount" type="number" inputmode="decimal" min="${bounds.min}" max="${bounds.max}" step="0.5" value="${bounds.min}" aria-describedby="bet-summary"><button id="bet-plus" aria-label="Increase by ${fmt(bounds.step)} chips">+</button></div></div><div class="bet-presets">${[['min','Min'],['half','½ pot'],['pot','Pot'],['all','All-in']].map(([key,label])=>`<button data-preset="${key}">${label}</button>`).join('')}</div><label class="sr-only" for="raise-range">Choose total bet amount</label><input type="range" id="raise-range" min="0" max="1000" step="1" value="0"><div class="bet-range-labels"><span>${fmt(bounds.min)}</span><span>${fmt(bounds.max)}</span></div><div id="bet-summary" aria-live="polite"></div></div>`;
}
function bindBetComposer(p,l){
  const bounds=betBounds(l,p.bb),input=$('#bet-amount'),range=$('#raise-range'),commit=$('#raise');let chosen=bounds.min;
  const update=(value,fromInput=false)=>{
    const valid=exactBetValid(value,bounds);input.setAttribute('aria-invalid',String(!valid));commit.disabled=!valid;
    if(!valid){$('#bet-summary').textContent=`Enter ${fmt(bounds.min)}–${fmt(bounds.max)} chips, in steps of 0.5.`;commit.textContent='Enter valid amount';return;}
    chosen=Number(value);if(!fromInput)input.value=chosen;
    range.value=betToSlider(chosen,bounds);range.style.setProperty('--bet-fill',`${Number(range.value)/10}%`);range.setAttribute('aria-valuetext',`${p.current===0?'Bet':'Raise to'} ${fmt(chosen)} chips`);
    const cost=chosen-p.bets[0],remaining=p.stacks[0]-cost;
    $('#bet-summary').textContent=`Adds ${fmt(cost)} chips · ${fmt(remaining)} left`;
    commit.textContent=chosen===bounds.max?`All-in · ${fmt(cost)}`:`${p.current===0?'Bet':'Raise to'} ${fmt(chosen)}`;
    $('#bet-minus').disabled=chosen<=bounds.min;$('#bet-plus').disabled=chosen>=bounds.max;
    $$('[data-preset]').forEach(b=>{const selected=presetBet(b.dataset.preset,l,p.bb,p.pot,p.bets[0])===chosen;b.classList.toggle('picked',selected);b.setAttribute('aria-pressed',String(selected));});
  };
  range.oninput=()=>update(sliderToBet(range.value,bounds));input.oninput=()=>update(input.value,true);
  input.onkeydown=e=>{if(e.key==='Enter'&&exactBetValid(input.value,bounds)){e.preventDefault();input.blur();commit.click();}};
  const adjust=delta=>update(Math.max(bounds.min,Math.min(bounds.max,Math.round((chosen+delta)*2)/2)));
  $('#bet-minus').onclick=()=>adjust(-bounds.step);$('#bet-plus').onclick=()=>adjust(bounds.step);
  range.onkeydown=e=>{const changes={ArrowLeft:-bounds.step,ArrowDown:-bounds.step,ArrowRight:bounds.step,ArrowUp:bounds.step,PageDown:-bounds.step*10,PageUp:bounds.step*10};if(e.key in changes){e.preventDefault();adjust(changes[e.key]);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();update(e.key==='Home'?bounds.min:bounds.max);}};
  $$('[data-preset]').forEach(b=>b.onclick=()=>update(presetBet(b.dataset.preset,l,p.bb,p.pot,p.bets[0])));
  commit.onclick=()=>{if(exactBetValid(input.value,bounds)&&poker===p)playerPoker('raise',Number(input.value));};update(chosen);
}
function renderLandedCards(){suppressCardEntrance=true;render();suppressCardEntrance=false;}
async function startPoker(){
  if(active()||bank<LEVELS[level].bb)return;busy=true;await audio.unlock();clearResult();round++;tableHand++;renderedCards.clear();button=(button+1)%6;fastForward=false;
  const bb=LEVELS[level].bb,stack=Math.min(bank,bb*100);pokerReserve=bank-stack;
  if(!botStacks)botStacks=[110,85,120,70,100].map(n=>n*bb);botStacks=botStacks.map(n=>n<bb?bb*100:n);
  poker=new TablePoker([stack,...botStacks],bb,button);bank=pokerReserve;dealtCount=0;boardShown=0;speech('Good evening, everyone. Blinds are in.');render();
  for(let k=0;k<12;k++){const seat=(button+1+k%6)%6;await dealer.dealTo(`[data-seat="${seat}"] .seat-cards`,()=>audio.fx('card'));dealtCount++;renderLandedCards();}
  busy=false;render();speech(`${PLAYERS[poker.actor]?.name||'The table'}, action is on you.`);await runBot();
}
async function playerPoker(type,amount){
  if(busy||poker.actor!==0||!poker.act(type,amount))return;audio.fx(type==='fold'?'card':'chip');
  if(type!=='fold')dealer.moveChips($('[data-seat="0"] .seat-plaque'),$('.pot-label'));await showPokerTransition();await runBot();
}
async function showPokerTransition(){
  const before=boardShown;
  if(poker.board.length>before){busy=true;render();speech(['','','','The flop.','The turn.','The river.'][poker.board.length]);for(let j=before;j<poker.board.length;j++){if(fastForward){boardShown++;renderLandedCards();}else{await dealer.dealTo(`.board .card:nth-child(${j+1})`,()=>audio.fx('card'));boardShown++;renderLandedCards();}}busy=false;render();}else render();
}
async function runBot(){
  busy=true;render();
  while(poker.phase!=='settled'&&(poker.actor!==0||poker.phase==='runout')){
    if(poker.phase==='runout'){await pause(fastForward?40:800);poker.runoutStep();await showPokerTransition();busy=true;render();continue;}
    const who=poker.actor;await pause(fastForward?35:650+rand(300));const move=tableBotAction(poker,level);if(!move||!poker.act(move.type,move.amount))throw Error('Invalid simulated action');
    audio.fx(move.type==='fold'?'card':'chip');if(move.type!=='fold')dealer.moveChips($(`[data-seat="${who}"] .seat-plaque`),$('.pot-label'));await showPokerTransition();busy=true;render();
  }
  busy=false;render();finishPoker();if(poker.phase==='play'&&poker.actor===0)speech('Your action.');
}
function finishPoker(){
  if(!poker||poker.phase!=='settled'||settledId===`p${round}`)return;settledId=`p${round}`;bank=pokerReserve+poker.stacks[0];botStacks=poker.stacks.slice(1);render();
  const paid=poker.awards[0],names=poker.winners.map(i=>PLAYERS[i].name).join(' & '),detail=poker.reason==='Fold'?'Uncontested pot':poker.pots.length>1?'Main and side pots settled':HAND_NAMES[poker.ranks[poker.winners[0]][0]];
  const title=paid>0?(poker.winners.length===1?'The pot is yours.':'You take a share.'):(poker.winners.length===1?`${names} wins.`:'Pots awarded.');
  showResult(title,`${detail} · ${poker.net>0?'+':''}${fmt(poker.net)} chips`,poker.net);speech(poker.winners.length===1?`Pot goes to ${names}.`:'The pots are settled. Next hand.');dealer.play('nod');
  for(const i of poker.winners)dealer.moveChips($('.pot-label'),$(`[data-seat="${i}"] .seat-plaque`));
}
function betButton(key,label,cls=''){const amount=bets.filter(b=>b.key===key).reduce((s,b)=>s+b.amount,0);return `<button class="${cls} ${amount?'has-bet':''}" data-bet="${key}" aria-label="Bet ${label}${amount?', '+amount+' chips placed':''}" ${spinning?'disabled':''}>${label}${amount?`<span class="bet-token">${amount>=1000?(amount/1000)+'k':amount}</span>`:''}</button>`;}
function renderRoulette(){
  const area=$('#table-content');area.className='table-content roulette-table'+(spinning?' wheel-spinning':'');let nums=betButton('n0','0','zero');for(let row=3;row>=1;row--)for(let col=0;col<12;col++){const n=col*3+row;nums+=betButton('n'+n,String(n),REDS.has(n)?'red':'black');}
  area.innerHTML=`<div class="wheel-wrap"><canvas id="wheel" width="680" height="680" aria-label="European roulette wheel with 37 pockets"></canvas><div class="wheel-pin" id="wheel-ball"></div><div class="wheel-center">C3</div></div><div class="bet-layout"><div class="roulette-grid">${nums}</div><div class="dozen-grid">${[0,1,2].map(i=>betButton('d'+i,['1st 12','2nd 12','3rd 12'][i])).join('')}</div><div class="outside-grid">${[['low','1–18'],['even','EVEN'],['red','◆ RED','red-bet'],['black','◆ BLACK'],['odd','ODD'],['high','19–36']].map(a=>betButton(...a)).join('')}</div><div class="column-grid">${[0,1,2].map(i=>betButton('c'+i,'COLUMN '+(i+1)+' · 2:1')).join('')}</div><p class="bet-hint">${spinning?'No more bets. The wheel is in motion.':'Choose a chip, then tap a number or an outside bet.'}</p><div class="recent-spins"><span>LAST SPINS</span>${history.length?history.slice(0,5).map(n=>`<b class="${n===0?'zero':REDS.has(n)?'red':''}">${n}</b>`).join(''):'<span>—</span>'}</div></div>`;
  drawWheel(wheelRotation);const total=bets.reduce((s,b)=>s+b.amount,0);$('#control-label').textContent='ON THE TABLE';$('#wager-display').innerHTML=`${fmt(total)} <span>CHIPS</span>`;
  $('#controls').innerHTML=chips(chip);$('#actions').innerHTML=`<button class="quiet" id="undo" ${!bets.length||spinning?'disabled':''}>Undo</button><button class="quiet" id="clear-bets" ${!bets.length||spinning?'disabled':''}>Clear</button><button class="primary" id="spin" ${!bets.length||spinning?'disabled':''}>${spinning?'Spinning…':'Spin the wheel ↗'}</button>`;
  $('#coach').textContent=LEVELS[level].help===2?'Straight number pays 35:1. Red/black pays 1:1. Zero is neither.':LEVELS[level].help?'Single zero · Every spin is independent.':'Place your chips. Trust the spin.';
  $$('[data-amount]').forEach(b=>b.disabled=spinning||Number(b.dataset.amount)<LEVELS[level].min);bindChips();
  $$('[data-bet]').forEach(b=>b.onclick=()=>placeBet(b.dataset.bet));
  $('#undo').onclick=()=>{if(spinning)return;const b=bets.pop();if(b)bank+=b.amount;render();};$('#clear-bets').onclick=()=>{if(spinning)return;bank+=total;bets=[];render();};$('#spin').onclick=spin;
  const picker=document.createElement('button');picker.className='number-picker';picker.textContent='Choose a number ⊞';picker.disabled=spinning;picker.onclick=numberPicker;$('.bet-layout').prepend(picker);
}
function placeBet(key){if(spinning||busy)return;if(bank<chip){toast('Not enough chips. Clear a bet or refill after this round.');return;}audio.unlock();clearResult();bets.push({key,amount:chip});bank-=chip;audio.fx('chip');render();}
function numberPicker(){openDialog(`<h2>Pick your number.</h2><p>Tap a number to place ${fmt(chip)} chips. Pays 35:1.</p><div class="number-grid">${Array.from({length:37},(_,n)=>`<button data-number="${n}" class="${n===0?'green':REDS.has(n)?'red':'black'}">${n}</button>`).join('')}</div>`);$$('[data-number]').forEach(b=>b.onclick=()=>{placeBet('n'+b.dataset.number);$('#dialog').close();});}
function drawWheel(rotation){
  const c=$('#wheel');if(!c)return;const x=c.getContext('2d'),s=340;x.clearRect(0,0,680,680);x.save();x.translate(s,s);
  const metal=x.createRadialGradient(0,0,270,0,0,337);metal.addColorStop(0,'#6d4f26');metal.addColorStop(.2,'#ebd49b');metal.addColorStop(.4,'#544128');metal.addColorStop(.7,'#ddc698');metal.addColorStop(1,'#442d1c');x.fillStyle=metal;x.beginPath();x.arc(0,0,335,0,Math.PI*2);x.fill();
  x.save();x.rotate(rotation);const step=Math.PI*2/37;
  for(let i=0;i<37;i++){const start=-Math.PI/2+(i-.5)*step,end=start+step,n=WHEEL[i];x.beginPath();x.arc(0,0,301,start,end);x.arc(0,0,208,end,start,true);x.closePath();x.fillStyle=n===0?'#22684c':REDS.has(n)?'#913b40':'#172724';x.fill();x.strokeStyle='#cfb987';x.lineWidth=1.6;x.stroke();x.save();x.rotate(-Math.PI/2+i*step);x.translate(270,0);x.rotate(Math.PI/2);x.fillStyle='#f7ebd4';x.font='500 24px Georgia';x.textAlign='center';x.textBaseline='middle';x.fillText(String(n),0,0);x.restore();}
  const wood=x.createRadialGradient(-50,-60,5,0,0,206);wood.addColorStop(0,'#9d7950');wood.addColorStop(.25,'#503425');wood.addColorStop(.8,'#231e18');wood.addColorStop(1,'#b18a51');x.fillStyle=wood;x.beginPath();x.arc(0,0,205,0,Math.PI*2);x.fill();
  for(let i=0;i<37;i++){x.save();x.rotate(i*step);x.strokeStyle='#bd915b77';x.lineWidth=2;x.beginPath();x.moveTo(0,-122);x.lineTo(0,-200);x.stroke();x.restore();}
  const hub=x.createRadialGradient(-25,-25,0,0,0,110);hub.addColorStop(0,'#ebd4a1');hub.addColorStop(.24,'#9d7f4b');hub.addColorStop(.29,'#312b22');hub.addColorStop(.85,'#172c22');hub.addColorStop(1,'#b6985d');x.fillStyle=hub;x.beginPath();x.arc(0,0,111,0,Math.PI*2);x.fill();x.restore();x.restore();
}
async function spin(){
  if(spinning||busy||!bets.length)return;spinning=true;busy=true;await audio.unlock();clearResult();round++;const result=rand(37),idx=WHEEL.indexOf(result),start=wheelRotation,step=Math.PI*2/37;
  const normalized=((start%(Math.PI*2))+Math.PI*2)%(Math.PI*2),target=(Math.PI*2-idx*step)%(Math.PI*2);let distance=(target-normalized+Math.PI*2)%(Math.PI*2)+Math.PI*2*5;
  render();dealer.play('nod');speech('No more bets.');const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduced-motion'),duration=reduced?300:4700,begin=performance.now();let lastTick=-1;
  await new Promise(resolve=>{function frame(now){const p=Math.min(1,(now-begin)/duration),ease=1-(1-p)**4;wheelRotation=start+distance*ease;drawWheel(wheelRotation);const ball=$('#wheel-ball');if(ball){const angle=-Math.PI*2*8*ease,radius=43-6*ease;ball.style.left=(50+Math.sin(angle)*radius)+'%';ball.style.top=(50-Math.cos(angle)*radius)+'%';}const tick=Math.floor(wheelRotation/step);if(tick!==lastTick){audio.fx('tick');lastTick=tick;}if(p<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
  const cost=bets.reduce((s,b)=>s+b.amount,0),paid=rouletteReturn(bets,result);bank+=paid;const net=paid-cost;bets=[];history.unshift(result);history=history.slice(0,12);spinning=false;busy=false;render();
  showResult(`${result} · ${result===0?'Zero':REDS.has(result)?'Red':'Black'}`,`${net>0?'+':''}${fmt(net)} chips · Net result`,net);speech(paid?'The wheel has spoken. Nice hit.':'The wheel has spoken. New spin?');
}
function renderSlots(){
 const area=$('#table-content');area.className='table-content slots-table';
 area.innerHTML=`<div class="slot-cabinet"><span class="slot-kicker">C3 PRIVATE COLLECTION</span><h2>Midnight <em>Fox</em></h2><div class="slot-reels" aria-label="Slot reels">${reels.map((n,i)=>`<div class="slot-reel ${SYMBOLS[n].bonus?'bonus-symbol':''}" id="reel-${i}" role="img" aria-label="${SYMBOLS[n].name}"><span>${symbolHTML(n)}</span></div>`).join('')}</div><div class="slot-status" role="status">${spinning?'Reels rolling…':slotLast||'Three of a kind. One midnight moment.'}</div><div class="slot-paytable">${SYMBOLS.map(v=>`<span>${v.name.replace('Xfinity ','')} <b>${v.pay}×</b></span>`).join('')}</div><small>Three matching symbols pay above · Any pair returns your wager</small></div>`;
 $('#control-label').textContent='PER SPIN';$('#wager-display').innerHTML=fmt(wager)+' <span>CHIPS</span>';$('#coach').textContent='One payline. Seven symbols. Up to 75× your wager.';$('#controls').innerHTML=chips(wager);$('#actions').innerHTML=`<button class="primary" id="slot-spin" ${spinning||bank<wager?'disabled':''}>${spinning?'Spinning…':'Spin · '+fmt(wager)}</button>`;bindChips();$$('[data-amount]').forEach(b=>b.disabled=spinning||Number(b.dataset.amount)<LEVELS[level].min);$('#slot-spin').onclick=spinSlots;
}
async function spinSlots(){
 if(active()||bank<wager||wager<LEVELS[level].min)return;
 spinning=true;busy=true;const stake=wager;bank-=stake;round++;clearResult();const result=[rand(SYMBOLS.length),rand(SYMBOLS.length),rand(SYMBOLS.length)];await audio.unlock();render();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduced-motion');
 await Promise.all(result.map(async(n,i)=>{const node=$('#reel-'+i);node.classList.add('rolling');let k=i;const timer=reduced?null:setInterval(()=>{node.querySelector('span').innerHTML=symbolHTML((k++)%SYMBOLS.length);},85);await pause(reduced?120:1100+i*450);clearInterval(timer);reels[i]=n;node.classList.remove('rolling');node.classList.toggle('bonus-symbol',SYMBOLS[n].bonus===true);node.querySelector('span').innerHTML=symbolHTML(n);node.setAttribute('aria-label',SYMBOLS[n].name);audio.fx('reel');}));
 const mult=slotMultiplier(result),paid=stake*mult;bank+=paid;spinning=false;busy=false;slotLast=mult>1?`${mult}× · ${fmt(paid)} chips returned`:mult===1?'A pair · Your wager is returned':'No match · Ready for the next spin';render();showResult(mult>=50?'Xfinity bonus!':mult>1?'Midnight hit.':mult===1?'A pair.':'Next spin?',`${paid-stake>0?'+':''}${fmt(paid-stake)} chips · Net result`,paid-stake);
}
function pause(ms){return new Promise(r=>setTimeout(r,document.body.classList.contains('reduced-motion')?Math.min(ms,120):ms));}
function switchGame(next){if(active()){toast('Finish this hand before changing tables.');return;}if(bets.length){bank+=bets.reduce((s,b)=>s+b.amount,0);bets=[];}mode=next;bj=null;poker=null;renderedCards.clear();clearResult();$('#stage').className='casino-stage '+mode;
  $('#table-name').textContent={blackjack:'BLACKJACK',poker:'TEXAS HOLD’EM',roulette:'EUROPEAN ROULETTE',slots:'MIDNIGHT FOX SLOTS'}[mode];$('#table-rules').textContent={blackjack:'3:2 BLACKJACK · DEALER STANDS ON 17',poker:'SIX PLAYERS · NO-LIMIT HOLD’EM · AI OPPONENTS',roulette:'SINGLE ZERO · STRAIGHT NUMBER PAYS 35:1',slots:'THREE REELS · ONE PAYLINE · UP TO 75×'}[mode];speech({blackjack:'Welcome back. Let’s find your 21.',poker:'Welcome to the table. I’ll handle the cards.',roulette:'Pick your spot. I’ll give it a spin.',slots:'Welcome to the midnight reels.'}[mode]);render();}
function openDialog(html){$('#dialog-content').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal();}
function levels(){
  openDialog(`<h2>Find your table.</h2><p>Five levels. Same fair cards and wheel.</p><div class="level-list">${LEVELS.map((l,i)=>`<button class="level-option ${level===i?'selected':''}" data-level="${i}" ${active()||bets.length?'disabled':''}><span>0${i+1}</span><div><b>${l.name}</b><small>${['Full coaching · Forgiving poker opponents','Full coaching · More selective opponents','Light hints · Balanced poker opponents','No hints · Stronger reads and bigger stakes','No hints · Our toughest poker opponents'][i]}<br>Table minimum ${l.min} · Poker blinds ${l.bb/2}/${l.bb}</small></div></button>`).join('')}</div><p>In blackjack, slots and roulette, levels change guidance and stakes. Payouts, dealer rules, and random outcomes stay the same. In poker, all five opponents’ decisions also get stronger.</p>`);
  $$('[data-level]').forEach(b=>b.onclick=()=>{if(active()||bets.length)return;level=Number(b.dataset.level);botStacks=null;tableHand=0;wager=Math.max(wager,LEVELS[level].min);chip=Math.max(chip,LEVELS[level].min);bj=null;poker=null;clearResult();try{localStorage.setItem('c3-level',String(level));}catch{}$('#dialog').close();render();toast(`${LEVELS[level].name} table is ready.`);});
}
function settings(){openDialog(`<h2>Set the mood.</h2><div class="setting-row"><label for="volume">Master volume</label><input id="volume" type="range" min="0" max="1" step="0.05" value="${audio.volume}"></div><div class="setting-row"><label for="effects">Card, chip & wheel sounds</label><input type="checkbox" id="effects" ${audio.effects?'checked':''}></div><div class="setting-row"><label for="motion">Reduce motion</label><input type="checkbox" id="motion" ${document.body.classList.contains('reduced-motion')?'checked':''}></div><div class="setting-row"><button class="secondary" id="test-sound">Test sound ♪</button><span id="audio-status" role="status"></span></div><h3>C³ Late Shift</h3><p>There is no music file. The soundtrack is generated live in your browser — a swung ~77 BPM lo-fi beat with seventh and ninth chords, soft bass, vinyl crackle and tape wow — so it never loops and it is a little different every time you open the room. Music starts with your first tap. Use the music button to pause or resume it.</p><button class="secondary" id="settings-level">Change difficulty</button><p>Your chip balance is for this visit. Refilling is free. Nothing can be purchased, redeemed, or cashed out.</p>`);
  $('#test-sound').onclick=async()=>{if(audio.volume===0)audio.setVolume(.55);await audio.unlock();audio.effects=true;$('#effects').checked=true;const played=await audio.fx('win');$('#audio-status').textContent=played?'Sound check sent to your speakers':audio.error||'Tap Test sound to retry';};
  $('#volume').oninput=e=>{audio.setVolume(Number(e.target.value));try{localStorage.setItem('c3-volume',e.target.value);}catch{}};$('#effects').onchange=e=>audio.effects=e.target.checked;$('#motion').onchange=e=>{document.body.classList.toggle('reduced-motion',e.target.checked);try{localStorage.setItem('c3-motion',String(e.target.checked));}catch{}};$('#settings-level').onclick=levels;
}
function rules(){
  const common='<p>Free play only. No real money, prizes, cash-out, purchases, or casino affiliation. These are the house rules for this game; it is not a certified wagering product.</p>';
  const texts={
slots:`<h2>Midnight Fox Slots</h2><p class="rules-tag">3 REELS · ONE CENTER PAYLINE</p><p>Choose your wager and spin. Each reel independently selects one of seven equally likely symbols. Three matching symbols pay the multiplier below; exactly two matching symbols anywhere return your wager (1×). All other combinations pay zero. Multipliers include the returned stake.</p><ul>${SYMBOLS.map(v=>`<li>Three ${v.name}: ${v.pay}× total return.</li>`).join('')}</ul><p>Maximum return is 75× your wager. Three Xfinity Mobile symbols pay a 50× bonus; three Xfinity Shield symbols pay a 75× bonus. These are chip payouts, not extra spins. No wilds or progressive jackpots. Difficulty changes the minimum wager only, never the odds. Free play only.</p>`,
    blackjack:`<h2>Blackjack</h2><p class="rules-tag">6 DECKS · STAND ON SOFT 17 · 3:2</p><p>Beat Ace’s total without going over 21. Number cards count at face value; faces count as 10; aces count as 1 or 11.</p><ul><li>Each round uses a newly shuffled six-deck shoe. Ace takes a hidden hole card and checks for blackjack before you play.</li><li>A two-card blackjack pays 3:2. Other wins pay 1:1. Equal totals push. Dealer blackjack beats every hand except your natural blackjack.</li><li>Hit for another card; stand to finish. Double on any first two cards, including after a split: add an equal wager, receive one card, then stand.</li><li>Split identical ranks into two hands with an equal extra wager. One split only; no resplits. Split aces receive one card each. A split-hand 21 pays 1:1.</li><li>Insurance is offered against an ace, costs half your initial wager, and pays 2:1 if the dealer has blackjack. Insurance is separate from your main hand.</li><li>Dealer draws below 17 and stands on every 17. No surrender or side bets. Wins show net change, including insurance and split hands.</li></ul><p><a href="https://bicyclecards.com/how-to-play/blackjack" target="_blank" rel="noopener">Learn the foundations of blackjack ↗</a></p>`,
    poker:`<h2>Texas Hold’em</h2><p class="rules-tag">SIX SEATS · FIVE AI OPPONENTS · NO RAKE</p><p>Ace deals while you play against Maya, Marcus, Kai, Elena and Rico. These are simulated players, not people connected online.</p><ul><li>The button moves clockwise each hand. The next two seats post small and big blinds. Action starts after the big blind pre-flop and after the button on later streets.</li><li>Pre-flop, flop, turn and river each have a betting round. Check for free when nothing is owed, call to match, raise, or fold. After you fold, the other players finish the hand; Skip to result speeds them up.</li><li>A full raise must match or exceed the last full bet or raise. Short all-ins are allowed. A short raise does not reopen action for a player who has already acted unless the cumulative increase reaches a full raise. Checking before an opening bet preserves your option to raise.</li><li>All-ins with unequal contributions create a main pot and separate side pots. You may only win pots you contributed to. Uncalled excess is returned. Ties split each pot; any odd half-chip goes clockwise from the button.</li><li>The best five cards win, using any combination of your two hole cards and five shared cards. Aces can be low in A–2–3–4–5. Suits do not break ties.</li><li>Your buy-in is up to 100 big blinds; your ending stack returns to your balance after each hand. Opponents keep their stacks between hands, with an automatic 100-big-blind rebuy if they have less than one big blind.</li><li>Difficulty affects coaching and opponent decisions. Each AI estimates its chances using only its own cards, the public board and public betting information.</li></ul><p><a href="https://www.pokerstars.com/poker/games/texas-holdem/" target="_blank" rel="noopener">Hold’em foundations ↗</a> · <a href="https://www.pokertda.com/view-poker-tda-rules/" target="_blank" rel="noopener">Betting rules reference ↗</a></p>`,
    roulette:`<h2>European Roulette</h2><p class="rules-tag">37 POCKETS · ONE ZERO · NO DOUBLE ZERO</p><p>Choose a chip denomination, then tap a number or an outside bet. Each tap adds that amount. You can place several bets; Undo removes the latest and Clear returns them all before a spin.</p><ul><li>Straight number (0–36): 35:1. Dozens and columns: 2:1. Red/black, odd/even, and low/high: 1:1. Your winning stake is also returned.</li><li>Zero wins only a straight bet on 0. It is neither red nor black, odd nor even, low nor high. All outside bets lose on zero.</li><li>Every pocket has a 1 in 37 chance on every spin. The result is chosen with unbiased browser cryptographic randomness. The animated wheel stops on that exact pocket.</li><li>No bets can change after the spin begins. Each spin is independent. Previous results do not make a pocket more likely next time.</li><li>This table offers straight numbers, dozens, columns and even-money bets. Split, street, corner, six-line, neighbour bets, la partage and en prison are not offered.</li><li>Difficulty changes guidance and minimum chip size. It never changes odds or payouts.</li></ul>`
  };openDialog(texts[mode]+common);
}
$$('[data-game]').forEach(b=>b.onclick=()=>switchGame(b.dataset.game));$('#outcome').onclick=clearResult;$('#rules-button').onclick=rules;$('#settings').onclick=settings;$('#level-button').onclick=levels;$('#close-dialog').onclick=()=>$('#dialog').close();$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#dialog').close();}});
$('#refill').onclick=()=>{if(active()||bets.length)return;bank=10000;botStacks=null;tableHand=0;bj=null;poker=null;clearResult();render();toast('Back to 10,000 free play chips. Enjoy the lounge.');};
function syncMusic(){const playing=audio.playing&&audio.volume>0;$('#music-button').classList.toggle('playing',playing);$('#music-button').setAttribute('aria-pressed',String(playing));$('#music-button').setAttribute('aria-label',playing?'Pause background music':'Play background music');$('#music-state').textContent=playing?'Ⅱ':'▶';$('#music-button small').textContent=playing?'LIVE LO-FI · PLAYED IN CODE':'LIVE LO-FI · TAP TO PLAY';$('#sound-label').textContent=playing?'Sound on':'Enable sound';$('#enable-sound').setAttribute('aria-pressed',String(playing));}
async function startBackgroundMusic(){if(musicWanted){await audio.setMusic(true);syncMusic();}}
$('#music-button').onclick=async()=>{musicWanted=!audio.playing;if(musicWanted&&audio.volume===0)audio.setVolume(.55);await audio.setMusic(musicWanted);try{localStorage.setItem('c3-music',musicWanted?'on':'off');}catch{}syncMusic();if(musicWanted&&!audio.music)toast('Tap the music button again to enable audio.');};
document.addEventListener('click',e=>{if(!e.target.closest('#music-button,#enable-sound,#test-sound')&&!audio.playing)startBackgroundMusic();},{capture:true});
audio.onchange=syncMusic;
$('#enable-sound').onclick=async()=>{musicWanted=true;if(audio.volume===0)audio.setVolume(.55);const started=await audio.setMusic(true);try{localStorage.setItem('c3-music','on');localStorage.setItem('c3-volume',String(audio.volume));}catch{}syncMusic();if(started)audio.fx('win');else toast(audio.error||'Audio could not start. Tap to retry.');};
window.addEventListener('pageshow',()=>{audio.resume();syncMusic();});
document.addEventListener('visibilitychange',()=>document.hidden?audio.suspend():audio.resume());
try{document.body.classList.toggle('reduced-motion',localStorage.getItem('c3-motion')==='true');}catch{}
wager=Math.max(wager,LEVELS[level].min);chip=Math.max(chip,LEVELS[level].min);switchGame(mode);
window.addEventListener('beforeunload',e=>{if(active()){e.preventDefault();e.returnValue='';}});
// The same guarded actions are available to assistive agents through WebMCP.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'casino_status',description:'Read the current free-play casino table, balance, and legal action state.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async()=>({game:mode,balance:bank,level:LEVELS[level].name,active:!!active(),phase:mode==='blackjack'?bj?.phase:mode==='poker'?poker?.phase:spinning?'spinning':'betting',legal:mode==='blackjack'?bj?.legal():mode==='poker'?poker?.actor===0?poker.legal():null:null})});
  register({name:'casino_choose_table',description:'Choose Blackjack, Texas Hold’em, Roulette or Fox Slots between rounds. Returns any unspun roulette wagers to the play balance.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{game:{type:'string',enum:['blackjack','poker','roulette','slots']}},required:['game'],additionalProperties:false},execute:async({game})=>{if(!['blackjack','poker','roulette','slots'].includes(game))throw Error('Invalid game');if(active())throw Error('Finish the current round first');switchGame(game);return {game:mode,balance:bank};}});
}
