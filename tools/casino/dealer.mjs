// A frame-based character performance driven by actual game events.
// The source atlas is not a rigged 3D model or a generated video.
export class DealerPerformance {
  constructor(stage){
    this.stage=stage;this.canvas=document.createElement('canvas');this.canvas.className='dealer-performance';this.canvas.setAttribute('aria-hidden','true');stage.prepend(this.canvas);
    this.ctx=this.canvas.getContext('2d');this.sheet=new Image();this.ready=false;this.sequence=null;this.started=0;this.nextBlink=performance.now()+2400;this.lastDraw=0;this.reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduced-motion');
    this.sheet.onload=()=>{this.ready=true;this.cellW=this.sheet.width/4;this.cellH=this.sheet.height/4;this.canvas.width=this.cellW*2;this.canvas.height=this.cellH*2;stage.classList.add('animated-host');this.paint(0,0,0);};
    this.sheet.src=new URL('./assets/dealer-motion-atlas.webp',import.meta.url).href;
    this.loop=this.loop.bind(this);this.raf=requestAnimationFrame(this.loop);
    window.addEventListener('pagehide',()=>{cancelAnimationFrame(this.raf);this.raf=null;});
    window.addEventListener('pageshow',()=>{if(this.raf===null)this.raf=requestAnimationFrame(this.loop);});
  }
  play(kind='deal',cycles=1){
    if(this.reduced())return;
    const frames={deal:[4,5,6,7,8,9,10,11,0],nod:[0,12,13,14,15,0],blink:[0,1,2,3,0]};
    this.sequence={frames:frames[kind]||frames.deal,step:kind==='deal'?115:kind==='blink'?105:180,cycles};this.started=performance.now();
  }
  async dealTo(target,onRelease=()=>{}){
    if(this.reduced()){onRelease();return;}
    this.sequence={frames:[4,5,6,7,8,9,0],step:75,cycles:1};this.started=performance.now();
    // The card leaves during the arm's extension, then appears in the recipient's hand on landing.
    await new Promise(r=>setTimeout(r,225));onRelease();this.flyCard(target,260);
    await new Promise(r=>setTimeout(r,260));
  }
  paint(a,b,mix){
    const x=this.ctx,w=this.canvas.width,h=this.canvas.height;x.clearRect(0,0,w,h);
    // Restrict the rendered scene to the dealer; the table is the live game surface.
    const sourceHeight=this.cellH*.785;
    const draw=(frame,alpha)=>{x.globalAlpha=alpha;x.drawImage(this.sheet,(frame%4)*this.cellW,Math.floor(frame/4)*this.cellH,this.cellW,sourceHeight,0,0,w,h*.785);};
    draw(a,1);if(a!==b&&mix>0)draw(b,mix);x.globalAlpha=1;
  }
  loop(now){
    this.raf=requestAnimationFrame(this.loop);if(!this.ready||document.hidden||now-this.lastDraw<32)return;this.lastDraw=now;
    if(this.reduced()){this.paint(0,0,0);return;}
    if(!this.sequence&&now>this.nextBlink){this.play('blink');this.nextBlink=now+4600+Math.random()*3500;}
    if(!this.sequence){return;}
    const s=this.sequence,elapsed=now-this.started,length=(s.frames.length-1)*s.step,total=length*s.cycles;
    if(elapsed>=total){this.sequence=null;this.paint(0,0,0);return;}
    const f=(elapsed%length)/s.step,index=Math.floor(f),blend=f-index;
    this.paint(s.frames[index],s.frames[index+1],blend*blend*(3-2*blend));
  }
  flyCard(target,duration=420){
    if(this.reduced())return;
    const stage=this.stage.getBoundingClientRect(),host=this.canvas.getBoundingClientRect();
    const from={x:host.left-stage.left+host.width*.60,y:host.top-stage.top+host.height*.76};
    const node=document.createElement('div');node.className='flying-card';node.setAttribute('aria-hidden','true');node.textContent='C3';this.stage.append(node);
    const end=typeof target==='string'?this.stage.querySelector(target):target;
    let dest={x:stage.width*.5,y:stage.height*.73};if(end){const r=end.getBoundingClientRect();dest={x:r.left-stage.left+r.width*.5,y:r.top-stage.top+r.height*.5};}
    const anim=node.animate([{left:from.x+'px',top:from.y+'px',transform:'translate(-50%,-50%) scale(.55) rotate(-12deg)',opacity:1},{left:dest.x+'px',top:dest.y+'px',transform:'translate(-50%,-50%) scale(1) rotate(4deg)',opacity:1}],{duration,easing:'cubic-bezier(.18,.7,.25,1)',fill:'forwards'});anim.onfinish=()=>node.remove();
  }
  moveChips(from,to){
    if(this.reduced()||!from||!to)return;const s=this.stage.getBoundingClientRect(),a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
    for(let i=0;i<4;i++){const n=document.createElement('span');n.className='travelling-chip';n.setAttribute('aria-hidden','true');this.stage.append(n);const anim=n.animate([{left:(a.left-s.left+a.width/2)+'px',top:(a.top-s.top+a.height/2-i*3)+'px',opacity:1,transform:'scale(1)'},{left:(b.left-s.left+b.width/2)+'px',top:(b.top-s.top+b.height/2-i*3)+'px',opacity:.8,transform:'scale(.75)'}],{duration:550,delay:i*55,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});anim.onfinish=()=>n.remove();}
  }
}
