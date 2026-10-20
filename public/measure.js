(()=>{'use strict';
const canvas=document.querySelector('#map'),button=document.querySelector('#measureButton'),clear=document.querySelector('#measureClear'),result=document.querySelector('#measureResult');
const layer=document.createElement('canvas');layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;background:transparent;padding:0;margin:0;border-radius:0;box-sizing:border-box';
const parent=canvas.parentElement;parent.style.position='relative';parent.append(layer);
const ctx=layer.getContext('2d');let active=false,start=null,end=null,grid=12,down=null;
const battle=new URLSearchParams(location.search).get('battle');
async function updateGrid(){if(!battle)return;try{const r=await fetch('/api/battle?id='+encodeURIComponent(battle),{cache:'no-store'});if(r.ok){const d=await r.json();grid=d.gridSize||12;paint()}}catch{}}
function cell(e){const rect=canvas.getBoundingClientRect();const x=Math.floor((e.clientX-rect.left)/rect.width*grid),y=Math.floor((e.clientY-rect.top)/rect.height*grid);if(x<0||y<0||x>=grid||y>=grid)return null;return{x,y}}
function paint(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=devicePixelRatio||1;layer.width=Math.round(w*dpr);layer.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);if(!active||!start)return;const s=w/grid;function center(p){return{x:(p.x+.5)*s,y:(p.y+.5)*s}}const a=center(start);ctx.fillStyle='rgba(255,215,0,.38)';ctx.fillRect(start.x*s,start.y*s,s,s);if(!end)return;const b=center(end);ctx.fillRect(end.x*s,end.y*s,s,s);ctx.strokeStyle='#ffd700';ctx.lineWidth=4;ctx.setLineDash([8,5]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);const squares=Math.max(Math.abs(end.x-start.x),Math.abs(end.y-start.y));result.textContent=' '+squares+' caselle · '+squares+'″ · '+(squares*2)+' m';}
function reset(){start=null;end=null;result.textContent=' Tocca la casella di partenza';paint()}
button.onclick=()=>{active=!active;button.textContent=active?'📏 Righello attivo':'📏 Misura distanza';clear.hidden=!active;canvas.style.touchAction=active?'none':'none';if(active)reset();else{start=null;end=null;result.textContent='';paint()}};
clear.onclick=()=>{active=false;button.textContent='📏 Misura distanza';clear.hidden=true;start=null;end=null;result.textContent='';paint()};
canvas.addEventListener('pointerdown',e=>{if(!active)return;down=cell(e);e.stopImmediatePropagation();e.preventDefault()},true);
canvas.addEventListener('pointermove',e=>{if(!active)return;e.stopImmediatePropagation();e.preventDefault()},true);
canvas.addEventListener('pointerup',e=>{if(!active)return;const p=cell(e)||down;down=null;e.stopImmediatePropagation();e.preventDefault();if(!p)return;if(!start||end){start=p;end=null;result.textContent=' Tocca la casella di arrivo'}else{end=p}paint()},true);
canvas.addEventListener('pointercancel',e=>{if(active){down=null;e.stopImmediatePropagation()}},true);
window.addEventListener('resize',paint);updateGrid();if(battle)setInterval(updateGrid,5000);
})();