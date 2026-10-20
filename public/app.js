const c=document.querySelector('#map'),ctx=c.getContext('2d'),info=document.querySelector('#info');const N=12;
let id=localStorage.getItem('battlemap_demo_id');if(!id){id='demo_'+crypto.randomUUID().replaceAll('-','');localStorage.setItem('battlemap_demo_id',id)}
const sharedId=new URLSearchParams(location.search).get('battle');const shared=Boolean(sharedId);if(shared)document.querySelector('#reset').hidden=true;
const initData=window.Telegram?.WebApp?.initData||'';window.Telegram?.WebApp?.ready();let units=[],drag=null,canMove=!shared;const addButton=document.querySelector('#addToken'),joinButton=document.querySelector('#joinBattle'),assignButton=document.querySelector('#assignToken');let members=[],myUserId=null,isMaster=false;const editButton=document.querySelector('#editToken');const tokenSize=u=>u.size||1;const overlaps=(a,b)=>a.x<b.x+tokenSize(b)&&a.x+tokenSize(a)>b.x&&a.y<b.y+tokenSize(b)&&a.y+tokenSize(a)>b.y;const at=(u,p)=>p.x>=u.x&&p.x<u.x+tokenSize(u)&&p.y>=u.y&&p.y<u.y+tokenSize(u);
function draw(){const w=c.clientWidth;c.width=w*devicePixelRatio;c.height=w*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const s=w/N;ctx.fillStyle='#e8dfc9';ctx.fillRect(0,0,w,w);ctx.strokeStyle='#a59a83';for(let i=0;i<=N;i++){ctx.beginPath();ctx.moveTo(i*s,0);ctx.lineTo(i*s,w);ctx.moveTo(0,i*s);ctx.lineTo(w,i*s);ctx.stroke()}for(const u of units){ctx.beginPath();ctx.arc((u.x+tokenSize(u)/2)*s,(u.y+tokenSize(u)/2)*s,s*tokenSize(u)*.4,0,Math.PI*2);ctx.fillStyle='#385f71';ctx.fill();ctx.font=s*tokenSize(u)*.55+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(u.emoji,(u.x+tokenSize(u)/2)*s,(u.y+tokenSize(u)/2)*s)}}
function pos(e){const r=c.getBoundingClientRect();return{x:Math.max(0,Math.min(N-1,Math.floor((e.clientX-r.left)/r.width*N))),y:Math.max(0,Math.min(N-1,Math.floor((e.clientY-r.top)/r.height*N)))}}
async function load(){try{const r=await fetch(shared?'/api/battle?id='+encodeURIComponent(sharedId):'/api/demo?id='+encodeURIComponent(id),{cache:'no-store',headers:shared?{'X-Telegram-Init-Data':initData}:{}});const data=await r.json();if(!r.ok)throw Error(data.error);units=data.tokens;members=data.members||[];myUserId=data.userId||null;isMaster=data.role==='creator'||data.role==='master';canMove=shared?!data.readonly:true;joinButton.hidden=!(shared&&data.authenticated&&data.role==='visitor');assignButton.hidden=!(shared&&isMaster);editButton.hidden=!(shared&&(isMaster||data.role==='player'));addButton.hidden=!(shared&&(data.role==='creator'||data.role==='master'));info.textContent=shared?(data.authenticated?'Battaglia condivisa — ruolo: '+data.role+(canMove?' (puoi muovere le pedine)':' (sola visualizzazione)'):'Battaglia condivisa: apri dal pulsante del bot Telegram per identificarti'):'Demo D1: trascina le pedine. Le posizioni vengono salvate.';draw()}catch(e){info.textContent='Errore caricamento: '+e.message}}
c.addEventListener('pointerdown',e=>{if(!canMove)return;const p=pos(e);drag=units.find(u=>at(u,p)&&(!shared||isMaster||String(u.owner_id)===myUserId));if(drag)c.setPointerCapture(e.pointerId)});
c.addEventListener('pointerup',async e=>{if(!drag)return;const u=drag;drag=null;const p=pos(e);if(u.x===p.x&&u.y===p.y)return;if(p.x+tokenSize(u)>N||p.y+tokenSize(u)>N||units.some(v=>v!==u&&overlaps({...u,...p},v)))return;const old={x:u.x,y:u.y};Object.assign(u,p);draw();try{const r=await fetch(shared?'/api/battle?id='+encodeURIComponent(sharedId):'/api/demo?id='+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json',...(shared?{'X-Telegram-Init-Data':initData}:{})},body:JSON.stringify({tokenId:u.id,x:p.x,y:p.y})});const data=await r.json();if(!r.ok)throw Error(data.error)}catch(err){Object.assign(u,old);draw();info.textContent='Salvataggio non riuscito: '+err.message}});
document.querySelector('#reset').onclick=async()=>{if(!confirm('Creare una nuova demo con le pedine iniziali?'))return;id='demo_'+crypto.randomUUID().replaceAll('-','');localStorage.setItem('battlemap_demo_id',id);await load()};

addButton.onclick=async()=>{
 if(!shared||!canMove)return;
 const name=prompt('Nome della pedina (massimo 40 caratteri):','Nuova pedina');if(name===null)return;
 const emoji=prompt('Icona della pedina:','⚔️');if(emoji===null)return;
 try{
  const r=await fetch('/api/battle?id='+encodeURIComponent(sharedId),{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({action:'createToken',name,emoji})});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Errore');
  await load();
 }catch(e){alert('Impossibile aggiungere pedina: '+e.message)}
};

async function battleAction(body){
 const r=await fetch('/api/battle?id='+encodeURIComponent(sharedId),{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Errore');await load();
}
joinButton.onclick=async()=>{try{await battleAction({action:'join'})}catch(e){alert(e.message)}};
assignButton.onclick=async()=>{
 if(!isMaster||!units.length){alert('Prima aggiungi una pedina');return}
 const options=units.map((u,i)=>(i+1)+'. '+u.emoji+' '+u.name+(u.owner_id?' (assegnata)':'')).join('\n');
 const choice=prompt('Quale pedina vuoi assegnare?\n'+options);
 if(choice===null)return;
 const index=Number(choice)-1;if(!Number.isInteger(index)||index<0||index>=units.length){alert('Numero pedina non valido');return}
 const players=members.filter(m=>m.role==='player');
 const list=players.map((m,i)=>(i+1)+'. Utente Telegram '+m.user_id).join('\n');
 const selected=prompt('Scegli un giocatore:\n0. Nessuno (libera pedina)\n'+(list||'Nessun giocatore iscritto'));
 if(selected===null)return;
 const n=Number(selected);
 if(!Number.isInteger(n)||n<0||n>players.length){alert('Giocatore non valido');return}
 try{await battleAction({action:'assignToken',tokenId:units[index].id,ownerId:n===0?'':players[n-1].user_id})}catch(e){alert(e.message)}
};


const editor=document.querySelector('#tokenEditor'),choice=document.querySelector('#tokenChoice'),action=document.querySelector('#tokenAction'),valueInput=document.querySelector('#tokenText'),sizeInput=document.querySelector('#tokenSize'),textRow=document.querySelector('#tokenTextRow'),sizeRow=document.querySelector('#tokenSizeRow');
const editable=()=>units.filter(u=>isMaster||String(u.owner_id)===myUserId);
function refreshEditor(){
 const u=editable().find(u=>u.id===choice.value);
 if(!u)return;
 const a=action.value;
 textRow.hidden=a==='size'||a==='delete';
 sizeRow.hidden=a!=='size';
 if(a==='emoji')valueInput.value=u.emoji;
 if(a==='name')valueInput.value=u.name;
 sizeInput.value=String(tokenSize(u));
}
editButton.onclick=()=>{
 if(!editor.hidden){editor.hidden=true;return}
 const available=editable();if(!available.length){alert('Non hai pedine modificabili');return}
 choice.replaceChildren(...available.map(u=>new Option(u.emoji+' '+u.name+' ('+tokenSize(u)+'×'+tokenSize(u)+')',u.id)));
 for(const opt of action.options)opt.hidden=!isMaster&&opt.value!=='emoji';
 action.value='emoji';editor.hidden=false;refreshEditor();
};
choice.onchange=refreshEditor;action.onchange=refreshEditor;
document.querySelector('#tokenCancel').onclick=()=>{editor.hidden=true};
document.querySelector('#tokenSave').onclick=async()=>{
 const u=editable().find(u=>u.id===choice.value);if(!u)return;
 const a=action.value;
 let body={action:'updateToken',tokenId:u.id};
 if(a==='emoji')body.emoji=valueInput.value;
 else if(a==='name'&&isMaster)body.name=valueInput.value;
 else if(a==='size'&&isMaster)body.size=Number(sizeInput.value);
 else if(a==='delete'&&isMaster){if(!confirm('Eliminare definitivamente '+u.name+'?'))return;body.action='deleteToken'}
 else return;
 try{await battleAction(body);editor.hidden=true}catch(e){alert(e.message)}
};
window.addEventListener('resize',draw);draw();load();if(shared)setInterval(load,5000);