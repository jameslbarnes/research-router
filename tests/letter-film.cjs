const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const code=fs.readFileSync('site/letter/research-film.js','utf8');
async function setup(reduce=false, hideDuringLoad=false, delayFirstFrame=false){
 const events={}, mediaEvents={}, videos=[], fetches=[], rafs=new Map(); let rafId=0, clock=0;
 const style=()=>({setProperty(k,v){this[k]=v;}});
 const stage={style:style(),dataset:{},appendChild(v){videos.push(v);}};
 const control={hidden:true,attributes:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this[k]=f;}};
 const links=Array.from({length:6},()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}}));
 const steps=Array.from({length:6},(_,i)=>({getBoundingClientRect(){return{top:1700+i*900-context.scrollY};}}));
 const story={offsetHeight:5500,getBoundingClientRect(){return{top:1700-context.scrollY};},querySelectorAll(s){return s==='.story-step'?steps:links;}};
 const sheet={getBoundingClientRect(){return{bottom:1104-context.scrollY};}};
 const reduced={matches:reduce,addEventListener(k,f){mediaEvents.reduce=f;}};
 const portrait={matches:false,addEventListener(){}};
 const document={hidden:false,currentScript:{src:'http://localhost:8765/letter/research-film.js'},documentElement:{style:style(),clientWidth:1440},
  querySelector(s){return{'.research-stage':stage,'#ideas':story,'#motion-toggle':control,'.letter-sheet':sheet}[s];},
  addEventListener(k,f){events[k]=f;},createElement(){
   const ve={}; let current=0;
   return {style:style(),paused:true,seeking:false,duration:24,attrs:{},requests:[],
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
    addEventListener(k,f){ve[k]=f;},pause(){this.paused=true;},play(){throw new Error('Scrolling must not wait for autoplay or playback buffering');},
    load(){if(this.src && !delayFirstFrame)Promise.resolve().then(()=>ve.loadeddata?.());},remove(){this.removed=true;},
    requestVideoFrameCallback(f){Promise.resolve().then(f);},
    get currentTime(){return current;},set currentTime(t){assert.equal(this.seeking,false,'queued overlapping seek');this.seeking=true;current=t;this.requests.push(t);},
    finish(){this.seeking=false;ve.seeked?.();},fire(k){ve[k]?.();}
   };
  }};
 const url=class extends URL{};url.createObjectURL=()=> 'blob:video';url.revokeObjectURL=()=>{};
 const context={document,innerWidth:1440,innerHeight:900,scrollY:0,URL:url,AbortController,console,
  matchMedia(s){return s.includes('reduced')?reduced:s.includes('aspect')?portrait:{matches:false};},
  fetch(u){fetches.push(String(u));return Promise.resolve({ok:true,blob:()=>Promise.resolve({})});},
  addEventListener(k,f){events[k]=f;},requestAnimationFrame(f){const id=++rafId;rafs.set(id,f);return id;},cancelAnimationFrame(id){rafs.delete(id);}};context.window=context;
 vm.runInNewContext(code,context);
 if(hideDuringLoad)document.hidden=true;
 async function flush(){for(let i=0;i<18;i++)await Promise.resolve();}
 function advance(ms){for(let t=0;t<ms;t+=50){clock+=50;const callbacks=[...rafs.values()];rafs.clear();callbacks.forEach(f=>f(clock));videos.filter(v=>v.seeking).forEach(v=>v.finish());}}
 await flush();return{context,document,stage,control,links,events,mediaEvents,reduced,portrait,videos,fetches,flush,advance,rafs};
}
(async()=>{
 let x=await setup();assert.equal(x.videos.length,1,'opening and scroll must share one video');assert.equal(x.fetches.length,0,'the film must stream without a whole-file fetch');assert(x.videos[0].src.includes('journey-desktop.mp4'));
 let journey=x.videos[0];assert.equal(journey.style.opacity,'1','no crossfade layer');
 x.advance(10000);const idleTime=journey.currentTime;assert.equal(idleTime,0,'opening must hold its first frame until scrolling');assert(journey.paused);assert.equal(x.rafs.size,0,'no autonomous animation clock');
 x.context.scrollY=1;x.events.scroll();assert(Math.abs(journey.currentTime-idleTime)<.04,'first scroll must continue from the current frame');journey.finish();assert.equal(x.rafs.size,0,'idle clock stops during scrolling');
 x.context.scrollY=60;x.events.scroll();const early=journey.currentTime;assert(early>idleTime,'first scroll through letter must move camera');assert.equal(journey.style.opacity,'1');journey.finish();
 x.context.scrollY=200;x.events.scroll();assert(journey.currentTime>early);journey.finish();
 x.context.scrollY=60;x.events.scroll();assert(Math.abs(journey.currentTime-early)<.001,'reverse scrolling should retrace frames');journey.finish();
 x.context.scrollY=879;x.events.scroll();assert(journey.currentTime<3,'letter must retain a wide view');journey.finish();
 x.context.scrollY=3000;x.events.scroll();const first=journey.currentTime;x.context.scrollY=4500;x.events.scroll();assert.equal(journey.currentTime,first);
 journey.finish();assert(journey.currentTime>first,'latest scroll was lost');journey.finish();const held=journey.currentTime;x.advance(10000);assert.equal(journey.currentTime,held,'film must hold when scrolling stops partway down');assert.equal(journey.paused,true);
 x.control.click();assert.equal(x.control.textContent,'Resume motion');const paused=journey.currentTime;
 x.context.scrollY=5500;x.events.scroll();assert.equal(journey.currentTime,paused);
 x.control.click();journey.finish();assert(journey.currentTime>paused);
 x.context.scrollY=0;x.events.scroll();journey.finish();assert(Math.abs(journey.currentTime-idleTime)<.04,'return to top must retain the same origin');
 const returned=journey.currentTime;assert.equal(returned,0);x.advance(10000);assert.equal(journey.currentTime,returned,'returning to the top must leave the film still');
 x.document.hidden=true;x.events.visibilitychange();assert.equal(x.rafs.size,0);const hiddenTime=journey.currentTime;x.advance(1000);assert.equal(journey.currentTime,hiddenTime);
 x.document.hidden=false;x.events.visibilitychange();x.advance(10000);assert.equal(journey.currentTime,hiddenTime,'tab visibility must not start playback');
 x.control.click();assert.equal(x.rafs.size,0);const idlePaused=journey.currentTime;x.advance(500);assert.equal(journey.currentTime,idlePaused);x.control.click();assert.equal(x.rafs.size,0);
 x.reduced.matches=true;x.mediaEvents.reduce();await x.flush();assert(x.videos.every(v=>v.removed));assert.equal(x.control.hidden,true);assert.equal(x.rafs.size,0);
 x=await setup(true);assert.equal(x.videos.length,0,'reduced motion must not load video');assert.equal(x.control.hidden,true);
 x.reduced.matches=false;x.mediaEvents.reduce();await x.flush();assert.equal(x.videos.length,1);
 x.portrait.matches=true;x.context.innerWidth=390;x.context.innerHeight=740;x.document.documentElement.clientWidth=390;x.events.resize();await x.flush();
 assert.equal(x.stage.dataset.aspect,'mobile');assert(x.videos.at(-1).src.includes('journey-mobile.mp4'));assert.equal(x.videos.filter(v=>!v.removed).length,1);
 x.context.scrollY=60;x.events.scroll();journey=x.videos.at(-1);assert(journey.currentTime>0,'phone camera must move during letter');assert.equal(journey.style.opacity,'1');journey.finish();
 x=await setup(false,true);assert.equal(x.videos.length,1);assert(x.videos[0].paused);assert.equal(x.rafs.size,0);x.document.hidden=false;x.events.visibilitychange();await x.flush();x.advance(1000);assert.equal(x.videos[0].currentTime,0,'showing a tab must not animate without scrolling');assert.equal(x.videos[0].paused,true);
 x=await setup(false,false,true);journey=x.videos[0];assert(journey.src.startsWith('http:'));assert.equal(journey.requests.length,0);x.context.scrollY=3000;x.events.scroll();assert.equal(journey.requests.length,0,'loading must not seek before the first frame');journey.fire('loadeddata');await x.flush();assert(journey.currentTime>0,'the first frame must catch up to the latest scroll before a full download');journey.finish();assert(journey.paused,'streaming must remain paused');
 console.log('PASS: one film without crossfade, stationary opening, immediate scroll response, hold after scrolling, wide letter pacing, reverse scrolling, coalesced seeks, pause/resume, visibility, native portrait, reduced motion, orientation cleanup.');
})().catch(e=>{console.error(e);process.exit(1);});
