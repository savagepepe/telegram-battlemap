const c=document.querySelector('#map'),ctx=c.getContext('2d'),info=document.querySelector('#info');const N=12;
let id=localStorage.getItem('battlemap_demo_id');if(!id){id='demo_'+crypto.randomUUID().replaceAll('-','');localStorage.setItem('battlemap_demo_id',id)}
const sharedId=new URLSearchParams(location.search).get('battle');const shared=Boolean(sharedId);if(shared)document.querySelector('#reset').hidden=true;
const initData=window.Telegram?.WebApp?.initData||'';window.Telegram?.WebApp?.ready();let units=[],drag=null,canMove=!shared;const addButton=document.querySelector('#addToken');
function draw(){const w=c.clientWidth;c.width=w*devicePixelRatio;c.height=w*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const s=w/N;ctx.fillStyle='#e8dfc9';ctx.fillRect(0,0,w,w);ctx.strokeStyle='#a59a83';for(let i=0;i<=N;i++){ctx.beginPath();ctx.moveTo(i*s,0);ctx.lineTo(i*s,w);ctx.moveTo(0,i*s);ctx.lineTo(w,i*s);ctx.stroke()}for(const u of units){ctx.beginPath();ctx.arc((u.x+.5)*s,(u.y+.5)*s,s*.4,0,Math.PI*2);ctx.fillStyle='#385f71';ctx.fill();ctx.font=s*.55+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(u.emoji,(u.x+.5)*s,(u.y+.5)*s)}}
function pos(e){const r=c.getBoundingClientRect();return{x:Math.max(0,Math.min(N-1,Math.floor((e.clientX-r.left)/r.width*N))),y:Math.max(0,Math.min(N-1,Math.floor((e.clientY-r.top)/r.height*N)))}}
async function load(){try{const r=await fetch(shared?'/api/battle?id='+encodeURIComponent(sharedId):'/api/demo?id='+encodeURIComponent(id),{cache:'no-store',headers:shared?{'X-Telegram-Init-Data':initData}:{}});const data=await r.json();if(!r.ok)throw Error(data.error);units=data.tokens;canMove=shared?!data.readonly:true;addButton.hidden=!(shared&&(data.role==='creator'||data.role==='master'));info.textContent=shared?(data.authenticated?'Battaglia condivisa — ruolo: '+data.role+(canMove?' (puoi muovere le pedine)':' (sola visualizzazione)'):'Battaglia condivisa: apri dal pulsante del bot Telegram per identificarti'):'Demo D1: trascina le pedine. Le posizioni vengono salvate.';draw()}catch(e){info.textContent='Errore caricamento: '+e.message}}
c.addEventListener('pointerdown',e=>{if(!canMove)return;const p=pos(e);drag=units.find(u=>u.x===p.x&&u.y===p.y);if(drag)c.setPointerCapture(e.pointerId)});
c.addEventListener('pointerup',async e=>{if(!drag)return;const u=drag;drag=null;const p=pos(e);if(u.x===p.x&&u.y===p.y)return;if(units.some(v=>v!==u&&v.x===p.x&&v.y===p.y))return;const old={x:u.x,y:u.y};Object.assign(u,p);draw();try{const r=await fetch(shared?'/api/battle?id='+encodeURIComponent(sharedId):'/api/demo?id='+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json',...(shared?{'X-Telegram-Init-Data':initData}:{})},body:JSON.stringify({tokenId:u.id,x:p.x,y:p.y})});const data=await r.json();if(!r.ok)throw Error(data.error)}catch(err){Object.assign(u,old);draw();info.textContent='Salvataggio non riuscito: '+err.message}});
document.querySelector('#reset').onclick=async()=>{if(!confirm('Creare una nuova demo con le pedine iniziali?'))return;id='demo_'+crypto.randomUUID().replaceAll('-','');localStorage.setItem('battlemap_demo_id',id);await load()};

addButton.onclick=async()=>{
 if(!shared||!canMove)return;
 const name=prompt('Nome della pedina (massimo 40 caratteri):','Nuova pedina');if(name===null)return;
 const emoji=prompt('Icona della pedina:','⚔️');if(emoji===null)return;
 const xRaw=prompt('Colonna da 1 a 12:','1');if(xRaw===null)return;
 const yRaw=prompt('Riga da 1 a 12:','1');if(yRaw===null)return;
 const x=Number(xRaw)-1,y=Number(yRaw)-1;
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=N||y<0||y>=N){alert('Scegli una riga e una colonna tra 1 e 12');return}
 try{
  const r=await fetch('/api/battle?id='+encodeURIComponent(sharedId),{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({action:'createToken',name,emoji,x,y})});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Errore');
  await load();
 }catch(e){alert('Impossibile aggiungere pedina: '+e.message)}
};
window.addEventListener('resize',draw);draw();load();if(shared)setInterval(load,5000);