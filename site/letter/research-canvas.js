/* Abstract branching ideas. Decorative artwork, independent of the CBA text. */
(() => {
  'use strict';
  const root = document.querySelector('#ideas');
  const canvas = document.querySelector('#research-canvas');
  if (!root || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const stage = document.querySelector('.research-stage');
  const steps = [...root.querySelectorAll('.story-step')];
  const nav = [...root.querySelectorAll('.story-nav a[data-chapter]')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  // These are compositions within one drawing, not a sequence of factual scenes.
  const cameras = [
    {x:0, y:0, z:1.12},
    {x:640, y:-160, z:.86},
    {x:1440, y:200, z:.66},
    {x:2250, y:-320, z:.53},
    {x:1200, y:1380, z:.45},
    {x:1320, y:420, z:.19}
  ];
  const centres = [
    {x:0,y:0}, {x:640,y:-160}, {x:1440,y:200}, {x:2250,y:-320},
    {x:3040,y:320}, {x:2260,y:1150}, {x:1200,y:1380},
    {x:400,y:870}, {x:-660,y:470}, {x:-490,y:-720},
    {x:650,y:-1010}, {x:1700,y:-1190}
  ];
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const smooth = t => t*t*(3-2*t);
  const mix = (a,b,t) => a+(b-a)*t;
  const seed = (x,y) => {
    const n=Math.sin(x*127.1+y*311.7)*43758.5453;
    return n-Math.floor(n);
  };
  let width=0,height=0,ratio=1,anchors=[],active=-1,introStart=0;
  let openingOrigin={x:0,y:0};
  const strokes=[];
  const fringe=new Map();

  function curve(out,a,b,angleA,angleB,weight,terminal=false,distance=Math.hypot(a.x,a.y)) {
    const length=Math.hypot(b.x-a.x,b.y-a.y);
    const c1={x:a.x+Math.cos(angleA)*length*.37,y:a.y+Math.sin(angleA)*length*.37};
    const c2={x:b.x-Math.cos(angleB)*length*.32,y:b.y-Math.sin(angleB)*length*.32};
    out.push({
      a,b,c1,c2,length,weight,terminal,
      distance,
      left:Math.min(a.x,b.x,c1.x,c2.x)-8,
      right:Math.max(a.x,b.x,c1.x,c2.x)+8,
      top:Math.min(a.y,b.y,c1.y,c2.y)-8,
      bottom:Math.max(a.y,b.y,c1.y,c2.y)+8
    });
  }

  function branch(out,a,angle,length,depth,key,weight,distance=Math.hypot(a.x,a.y)) {
    const turn=(seed(key,depth)-.5)*.75;
    const endAngle=angle+turn;
    const b={
      x:a.x+Math.cos(angle+turn*.45)*length,
      y:a.y+Math.sin(angle+turn*.45)*length
    };
    curve(out,a,b,angle,endAngle,weight,depth===0,distance);
    if(!depth)return;
    const spread=.3+seed(key+7,depth)*.53;
    branch(out,b,endAngle-spread,length*(.58+seed(key+1,depth)*.16),depth-1,key*1.37+11,weight*.76,distance+length);
    branch(out,b,endAngle+spread*.83,length*(.66+seed(key+2,depth)*.15),depth-1,key*1.71+29,weight*.73,distance+length);
  }

  // Each region has its own rhythm. Shared strokes connect them without arrows.
  const links=centres.slice(1).map((_,offset)=>{
    const i=offset+1;
    return [i<8?i-1:(i===8?0:i-1),i,2.1];
  }).concat([[1,7,.8],[2,6,.8],[3,5,.8],[0,10,.8],[2,11,.8]]);
  const distances=centres.map((_,i)=>i?Infinity:0);
  // Measure along the drawing so children appear only after their parent stroke.
  for(let pass=0;pass<centres.length;pass++){
    links.forEach(([a,b])=>{
      const length=Math.hypot(centres[b].x-centres[a].x,centres[b].y-centres[a].y);
      distances[a]=Math.min(distances[a],distances[b]+length);
      distances[b]=Math.min(distances[b],distances[a]+length);
    });
  }
  centres.forEach((centre,i)=>{
    for(let arm=0;arm<3;arm++){
      const angle=seed(i+3,arm+2)*Math.PI*2;
      branch(strokes,centre,angle,180+seed(i,arm+9)*160,5,i*97+arm*31+7,2.3,distances[i]);
    }
  });
  links.forEach(([a,b,weight])=>{
    if(distances[a]>distances[b])[a,b]=[b,a];
    const from=centres[a],to=centres[b],angle=Math.atan2(to.y-from.y,to.x-from.x);
    curve(strokes,from,to,angle-.42,angle+.28,weight,false,distances[a]);
  });

  function extend(bounds) {
    const tile=1500;
    const result=[];
    for(let x=Math.floor(bounds.left/tile)-1;x<=Math.ceil(bounds.right/tile);x++){
      for(let y=Math.floor(bounds.top/tile)-1;y<=Math.ceil(bounds.bottom/tile);y++){
        const cx=x*tile+seed(x,y)*500,cy=y*tile+seed(y,x)*400;
        if(cx>-1600 && cx<4100 && cy>-2100 && cy<2300)continue;
        const key=x+','+y;
        if(!fringe.has(key)){
          const paths=[];
          const centre={x:cx,y:cy};
          for(let arm=0;arm<3;arm++){
            branch(paths,centre,seed(x+arm,y+4)*Math.PI*2,240+seed(y+arm,x)*180,4,x*131+y*17+arm+800,.95);
          }
          fringe.set(key,paths);
          if(fringe.size>100)fringe.delete(fringe.keys().next().value);
        }
        result.push(...fringe.get(key));
      }
    }
    return result;
  }

  function stroke(path,t,scale,opacity) {
    let c1=path.c1,c2=path.c2,b=path.b;
    if(t<1){
      // A partial cubic keeps the emerging ink attached to its existing branch.
      const q1={x:mix(path.a.x,c1.x,t),y:mix(path.a.y,c1.y,t)};
      const q2={x:mix(c1.x,c2.x,t),y:mix(c1.y,c2.y,t)};
      const q3={x:mix(c2.x,b.x,t),y:mix(c2.y,b.y,t)};
      const r1={x:mix(q1.x,q2.x,t),y:mix(q1.y,q2.y,t)};
      const r2={x:mix(q2.x,q3.x,t),y:mix(q2.y,q3.y,t)};
      c1=q1;c2=r1;b={x:mix(r1.x,r2.x,t),y:mix(r1.y,r2.y,t)};
    }
    ctx.lineWidth=Math.max(.48/scale,path.weight/Math.sqrt(scale));
    ctx.globalAlpha=(path.weight<.7?.35:(path.weight<1.4?.52:.8))*opacity;
    ctx.beginPath();ctx.moveTo(path.a.x,path.a.y);
    ctx.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,b.x,b.y);ctx.stroke();
    if(path.terminal && t>.99 && scale>.28){
      ctx.globalAlpha=.55*opacity;
      ctx.beginPath();ctx.arc(b.x,b.y,1.5/Math.sqrt(scale),0,Math.PI*2);ctx.fill();
    }
  }

  function cameraAt(progress) {
    const index=Math.min(cameras.length-2,Math.floor(progress));
    const t=smooth(clamp((progress-index-.17)/.77,0,1));
    const a=cameras[index],b=cameras[index+1];
    return {x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:Math.exp(mix(Math.log(a.z),Math.log(b.z),t))};
  }

  function draw(progress) {
    if(!width||!height)return;
    const camera=reduced.matches?cameras[0]:cameraAt(progress);
    const mobile=width<=700;
    const opening=reduced.matches?0:clamp(window.scrollY/Math.max(anchors[0],1),0,1);
    const blend=reduced.matches?0:smooth(clamp((window.scrollY-introStart)/Math.max(anchors[0]-introStart,1),0,1));
    const scale=(mobile?width/470:Math.min(width*.56/530,1.45))*camera.z*mix(.55,1,blend);
    const ox=mix(openingOrigin.x,width*(mobile?.5:.305),blend)-camera.x*scale;
    const oy=mix(openingOrigin.y,height*(mobile?.285:.5),blend)-camera.y*scale;
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.globalAlpha=1;
    ctx.clearRect(0,0,width,height);
    const opacity=mix(.6,1,blend)*clamp(root.getBoundingClientRect().bottom/(height*.7),0,1);
    if(!opacity)return;
    ctx.translate(ox,oy);ctx.scale(scale,scale);
    ctx.strokeStyle='#151515';ctx.fillStyle='#151515';
    ctx.lineCap='round';ctx.lineJoin='round';
    const bounds={left:-ox/scale,right:(width-ox)/scale,top:-oy/scale,bottom:(height-oy)/scale};
    const reach=reduced.matches?70:mix(70,115,opening)+progress*1120;
    for(const path of [...strokes,...extend(bounds)]){
      if(path.right<bounds.left||path.left>bounds.right||path.bottom<bounds.top||path.top>bounds.bottom)continue;
      const t=clamp((reach-path.distance)/path.length,0,1);
      if(t>0)stroke(path,t,scale,opacity);
    }
    ctx.globalAlpha=opacity;
    ctx.beginPath();ctx.arc(0,0,3.8/Math.sqrt(scale),0,Math.PI*2);ctx.fill();
    const index=Math.min(5,Math.round(progress));
    if(index!==active){
      active=index;
      nav.forEach((link,i)=>{if(i===index)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});
    }
  }

  function progressAt(y) {
    let i=0;
    while(i<anchors.length-1 && y>=anchors[i+1])i++;
    if(i===anchors.length-1)return i;
    return clamp(i+(y-anchors[i])/(anchors[i+1]-anchors[i]),0,5);
  }
  function requestDraw() {
    draw(progressAt(window.scrollY));
  }
  function layout() {
    const rect=stage.getBoundingClientRect();
    width=rect.width;height=rect.height;ratio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    anchors=steps.map(step=>step.getBoundingClientRect().top+window.scrollY);
    const sheet=document.querySelector('.letter-sheet').getBoundingClientRect();
    const sidebar=document.querySelector('.letter-sidebar').getBoundingClientRect();
    openingOrigin=width<=1050?{x:width*.5,y:44}:{x:sidebar.left+sidebar.width*.55,y:Math.min(height*.78,sidebar.bottom+window.scrollY+85)};
    introStart=Math.max(0,sheet.bottom+window.scrollY-height*.7);
    document.documentElement.style.setProperty('--scrollbar',String(window.innerWidth-document.documentElement.clientWidth)+'px');
    draw(progressAt(window.scrollY));
  }
  window.addEventListener('scroll',requestDraw,{passive:true});
  window.addEventListener('hashchange',requestDraw);
  window.addEventListener('pageshow',layout);
  new ResizeObserver(layout).observe(document.querySelector('.letter-layout'));
  let lastWidth=window.innerWidth;
  window.addEventListener('resize',()=>{
    if(window.innerWidth!==lastWidth || window.innerWidth>700){lastWidth=window.innerWidth;layout();}
  },{passive:true});
  reduced.addEventListener('change',layout);
  window.addEventListener('load',layout,{once:true});
  layout();
})();
