// Casino foley from short local .wav files, and the music GENERATED IN CODE.
//
// ⚠ THERE IS NO MUSIC FILE, AND THAT IS THE FIX.
// This shipped playing assets/audio/late-shift.m4a on `loop`. That file was
// 24.7 SECONDS LONG. Under a game somebody sits with for twenty minutes, a
// 25-second loop is the thing you notice and then cannot stop noticing, and
// "the only thing I don't like is the music" is exactly what it earns.
//
// So the music is now synthesised live by lofi-engine.mjs: ~77 BPM, swung,
// seventh and ninth chords over a dusty kit, vinyl crackle and tape wow, with
// the arrangement thinning out and filling back in so it never settles into a
// loop at all. It is different every session (seeded PRNG), it never repeats,
// and it deleted 486 KB from the download.
//
// The EFFECTS half below is unchanged — those .wav files are short, they are
// meant to repeat, and they sound right.
import { LofiEngine } from './lofi-engine.mjs';

export class LoungeAudio {
 constructor(){this.music=false;this.effects=true;this.volume=.55;this.enabled=false;this.error='';this.onchange=()=>{};this.pool=[];this.cursor=0;this.intent=0;this._lofi=null;this._starting=null;}
 make(src){const a=new Audio(new URL('./assets/audio/'+src,import.meta.url).href);a.preload='auto';a.setAttribute('playsinline','');return a;}
 init(){
  if(this.pool.length)return;
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
  for(const name of ['card','chip','tick','win','push','lose','reel']){const players=Array.from({length:name==='tick'?2:3},()=>this.make(name+'.wav'));this.pool.push({name,players,next:0});}
 }
 get playing(){return !!(this._lofi&&this._lofi.playing)&&this.music;}
 unlock(){
  this.init();
  // Start each media element in the original user gesture; later game events reuse it.
  if(!this.enabled){this.enabled=true;for(const group of this.pool)for(const a of group.players){a.volume=0;const ticket=a._ticket=0;const play=a.play();Promise.resolve(play).then(()=>{if(a._ticket===ticket){a.pause();a.currentTime=0;a.volume=this.volume;}}).catch(()=>{});}}
  return Promise.resolve(true);
 }
 /* Build and start the engine. The AudioContext is constructed HERE rather than
    at module load, because every mobile browser blocks one created outside a
    user gesture — and LofiEngine.start() builds and resumes it synchronously
    before its first await, so this still counts as being inside the gesture. */
 _startMusic(){
  if(this._starting)return this._starting;
  if(!this._lofi){
   try{this._lofi=new LofiEngine({volume:this.volume});}
   catch{this.error='Audio is not available on this device.';this.onchange();return Promise.resolve(false);}
  }
  this._lofi.setVolume(this.volume);
  this._starting=this._lofi.start().then(ok=>{this._starting=null;this.error='';this.onchange();return ok;},
    ()=>{this._starting=null;this.music=false;this.error='Audio was blocked. Tap Enable sound to retry.';this.onchange();return false;});
  return this._starting;
 }
 setVolume(v){this.volume=Math.max(0,Math.min(1,v));if(this._lofi)this._lofi.setVolume(this.volume);for(const group of this.pool)for(const a of group.players)a.volume=this.volume;this.onchange();}
 async setMusic(enabled){
  const ticket=++this.intent;this.init();this.music=!!enabled;
  if(!this.music){if(this._lofi)this._lofi.stop();this.onchange();return false;}
  this.unlock();
  await this._startMusic();
  if(ticket!==this.intent)return this.playing;
  this.onchange();return this.playing;
 }
 toggle(){return this.setMusic(!this.playing);}
 fx(name){
  if(!this.effects||!this.enabled)return Promise.resolve(false);
  const group=this.pool.find(g=>g.name===name);if(!group)return Promise.resolve(false);
  const a=group.players[group.next++%group.players.length];a._ticket=(a._ticket||0)+1;a.pause();a.currentTime=0;a.volume=this.volume;
  return Promise.resolve(a.play()).then(()=>true).catch(()=>{this.error='Sound effects were blocked. Tap Enable sound to retry.';this.enabled=false;this.onchange();return false;});
 }
 /* Page hidden: stop SCHEDULING, not just the sound. A lookahead scheduler left
    running in a throttled background tab wakes up owing thousands of past-due
    events. */
 suspend(){if(this._lofi)this._lofi.suspend();for(const group of this.pool)for(const a of group.players)a.pause();}
 resume(){if(this._lofi&&this.music&&this.enabled)this._lofi.resume();this.onchange();}
 destroy(){if(this._lofi){this._lofi.dispose();this._lofi=null;}}
}
