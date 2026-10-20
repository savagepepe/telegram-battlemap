(()=>{'use strict';
const canvas=document.querySelector('#map'),button=document.querySelector('#areaButton'),panel=document.querySelector('#areaPanel'),shape=document.querySelector('#areaShape'),help=document.querySelector('#areaHelp');
const layer=document.createElement('canvas');layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;background:transparent;padding:0;margin:0;border-radius:0;box-sizing:border-box';canvas.parentElement.style.position='relative';canvas.parentElement.append(layer);
const ctx=layer.getContext('2d');let active=false,origin=null,target=null,grid=12;
const battle=new URLSearchParams(location.search).get('battle');
function guide(){help.textContent=!origin?'Tocca il centro o il punto di partenza sulla mappa.':shape.value==='cone'||shape.value==='line'?'Tocca una seconda casella per orientare la sagoma.':'Sagoma posizionata. Tocca per spostarla.'}
function point(e){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*grid,y=(e.clientY-r.top)/r.height*grid;if(x<0||y<0||x>=grid||y>=grid)return null;return{x:Math.floor(x)+.5,y:Math.floor(y)+.5}}
function paint(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=devicePixelRatio||1;layer.width=Math.round(w*dpr);layer.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);if(!active||!origin)return;const s=w/grid,x=origin.x*s,y=origin.y*s;ctx.fillStyle='rgba(255,80,40,.28)';ctx.strokeStyle='#ffb03a';ctx.lineWidth=3;ctx.beginPath();
if(['small','medium','large'].includes(shape.value)){const radius={small:1,medium:2,large:3}[shape.value];ctx.arc(x,y,radius*s,0,Math.PI*2)}
else if(target){const dx=target.x-origin.x,dy=target.y-origin.y,angle=Math.atan2(dy,dx),length=(shape.value==='cone'?9:12)*s;if(shape.value==='cone'){const half=Math.PI/6;ctx.moveTo(x,y);ctx.arc(x,y,length,angle-half,angle+half);ctx.closePath()}else{const nx=-Math.sin(angle)*s/2,ny=Math.cos(angle)*s/2,ex=x+Math.cos(angle)*length,ey=y+Math.sin(angle)*length;ctx.moveTo(x+nx,y+ny);ctx.lineTo(ex+nx,ey+ny);ctx.lineTo(ex-nx,ey-ny);ctx.lineTo(x-nx,y-ny);ctx.closePath()}}
else{ctx.arc(x,y,s*.22,0,Math.PI*2)}
ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill()}
function reset(){origin=null;target=null;guide();paint()}
button.onclick=()=>{active=!active;panel.hidden=!active;button.textContent=active?'🔥 Aree attive':'🔥 Aree d\'effetto';if(active){const ruler=document.querySelector('#measureClear');if(ruler&&!ruler.hidden)ruler.click()}reset()};
shape.onchange=reset;document.querySelector('#areaClear').onclick=reset;document.querySelector('#areaClose').onclick=()=>{active=false;panel.hidden=true;button.textContent='🔥 Aree d\'effetto';reset()};
canvas.addEventListener('pointerdown',e=>{if(!active)return;e.preventDefault();e.stopImmediatePropagation()},true);
canvas.addEventListener('pointermove',e=>{if(!active)return;e.preventDefault();e.stopImmediatePropagation()},true);
canvas.addEventListener('pointerup',e=>{if(!active)return;e.preventDefault();e.stopImmediatePropagation();const p=point(e);if(!p)return;if(!origin||target||['small','medium','large'].includes(shape.value)){origin=p;target=null}else{target=p}guide();paint()},true);
canvas.addEventListener('pointercancel',e=>{if(active)e.stopImmediatePropagation()},true);
async function refresh(){if(!battle)return;try{const r=await fetch('/api/battle?id='+encodeURIComponent(battle),{cache:'no-store'});if(r.ok){const data=await r.json();grid=data.gridSize||12;paint()}}catch{}}
window.addEventListener('resize',paint);refresh();if(battle)setInterval(refresh,5000);
})();