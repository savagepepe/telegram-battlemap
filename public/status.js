(()=>{'use strict';
const panel=document.querySelector('#conditionsPanel'),button=document.querySelector('#conditionsButton'),pick=document.querySelector('#conditionsToken'),wounds=document.querySelector('#conditionsWounds');
const keys=['shaken','distracted','vulnerable'];
const canvas=document.querySelector('#map'),overlay=document.createElement('div');
const wrap=document.createElement('div');wrap.style.cssText='position:relative;width:100%';canvas.parentNode.insertBefore(wrap,canvas);wrap.append(canvas,overlay);overlay.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';
let tokens=[],role='',lastId='';
const url=new URLSearchParams(location.search).get('battle');if(!url)return;
const auth=window.Telegram?.WebApp?.initData||'';
const chosen=()=>tokens.find(t=>t.id===pick.value);
function fill(){const c=chosen()?.conditions||{};wounds.value=c.wounds||0;for(const k of keys)document.querySelector('#conditions'+k[0].toUpperCase()+k.slice(1)).checked=!!c[k]}
function marks(){overlay.replaceChildren();const n=Number(window.N)||12;const grid=Number(overlay.dataset.grid)||12;for(const t of tokens){const st=t.conditions||{};const labels=[st.shaken?'💫':'',st.distracted?'🎯':'',st.vulnerable?'⚠️':'',st.wounds?'🩸'+st.wounds:''].filter(Boolean);if(!labels.length)continue;const el=document.createElement('span');el.textContent=labels.join(' ');el.title=t.name+': '+labels.join(', ');el.style.cssText='position:absolute;transform:translate(-50%,-100%);font-size:clamp(10px,2.8vw,17px);text-shadow:0 1px 3px black,0 -1px 3px black;white-space:nowrap';el.style.left=((t.x+(t.size||1)/2)/grid*100)+'%';el.style.top=((t.y+(t.size||1))/grid*100)+'%';overlay.append(el)}}
async function refresh(){try{const r=await fetch('/api/battle?id='+encodeURIComponent(url),{headers:{'X-Telegram-Init-Data':auth},cache:'no-store'});if(!r.ok)return;const data=await r.json();tokens=data.tokens||[];role=data.role;overlay.dataset.grid=data.gridSize||12;button.hidden=!['master','creator'].includes(role);const selected=pick.value;pick.replaceChildren(...tokens.map(t=>new Option(t.emoji+' '+t.name,t.id)));if(tokens.some(t=>t.id===selected))pick.value=selected;if(pick.value!==lastId){lastId=pick.value;fill()}marks()}catch(e){console.warn('Status refresh',e)}}
button.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){lastId=pick.value;fill()}};
pick.onchange=()=>{lastId=pick.value;fill()};
document.querySelector('#conditionsClose').onclick=()=>panel.hidden=true;
document.querySelector('#conditionsSave').onclick=async()=>{const count=Number(wounds.value);if(!Number.isInteger(count)||count<0||count>10)return alert('Ferite da 0 a 10');const conditions={wounds:count};for(const k of keys)conditions[k]=document.querySelector('#conditions'+k[0].toUpperCase()+k.slice(1)).checked;try{const r=await fetch('/api/battle?id='+encodeURIComponent(url),{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':auth},body:JSON.stringify({action:'setTokenConditions',tokenId:pick.value,conditions})});const d=await r.json();if(!r.ok)throw Error(d.error||'Errore');panel.hidden=true;await refresh()}catch(e){alert(e.message)}};
refresh();setInterval(refresh,5000);window.addEventListener('resize',marks);
})();