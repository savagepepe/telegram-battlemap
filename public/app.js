const c=document.querySelector('#map'),ctx=c.getContext('2d'),info=document.querySelector('#info');let N=12;
let id=localStorage.getItem('battlemap_demo_id');if(!id){id='demo_'+crypto.randomUUID().replaceAll('-','');localStorage.setItem('battlemap_demo_id',id)}
const sharedId=new URLSearchParams(location.search).get('battle');const shared=Boolean(sharedId);if(shared)document.querySelector('#reset').hidden=true;
const initData=window.Telegram?.WebApp?.initData||'';window.Telegram?.WebApp?.ready();let units=[],drag=null,canMove=!shared,maps=[],activeMap=null,bgImage=null,mapView={mode:'contain',zoom:1,x:0,y:0};const addButton=document.querySelector('#addToken'),joinButton=document.querySelector('#joinBattle'),assignButton=document.querySelector('#assignToken');let members=[],myUserId=null,isMaster=false,isCreator=false,initiative=null;const editButton=document.querySelector('#editToken');const tokenSize=u=>u.size||1;const overlaps=(a,b)=>a.x<b.x+tokenSize(b)&&a.x+tokenSize(a)>b.x&&a.y<b.y+tokenSize(b)&&a.y+tokenSize(a)>b.y;const at=(u,p)=>p.x>=u.x&&p.x<u.x+tokenSize(u)&&p.y>=u.y&&p.y<u.y+tokenSize(u);
function draw(){const w=c.clientWidth;c.width=w*devicePixelRatio;c.height=w*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const s=w/N;ctx.fillStyle='#e8dfc9';ctx.fillRect(0,0,w,w);if(bgImage&&bgImage.complete&&bgImage.naturalWidth){const iw=bgImage.naturalWidth,ih=bgImage.naturalHeight;const scale=(mapView.mode==='contain'?Math.min(w/iw,w/ih):Math.max(w/iw,w/ih))*(mapView.mode==='manual'?mapView.zoom:1);const dw=iw*scale,dh=ih*scale;ctx.save();ctx.beginPath();ctx.rect(0,0,w,w);ctx.clip();ctx.drawImage(bgImage,(w-dw)/2+mapView.x*w,(w-dh)/2+mapView.y*w,dw,dh);ctx.restore()}ctx.strokeStyle='#a59a83';for(let i=0;i<=N;i++){ctx.beginPath();ctx.moveTo(i*s,0);ctx.lineTo(i*s,w);ctx.moveTo(0,i*s);ctx.lineTo(w,i*s);ctx.stroke()}for(const u of units){ctx.beginPath();ctx.arc((u.x+tokenSize(u)/2)*s,(u.y+tokenSize(u)/2)*s,s*tokenSize(u)*.4,0,Math.PI*2);ctx.fillStyle='#385f71';ctx.fill();ctx.font=s*tokenSize(u)*.55+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(u.emoji,(u.x+tokenSize(u)/2)*s,(u.y+tokenSize(u)/2)*s)}}
function pos(e){const r=c.getBoundingClientRect();return{x:Math.max(0,Math.min(N-1,Math.floor((e.clientX-r.left)/r.width*N))),y:Math.max(0,Math.min(N-1,Math.floor((e.clientY-r.top)/r.height*N)))}}
async function load(){try{const r=await fetch(shared?'/api/battle?id='+encodeURIComponent(sharedId):'/api/demo?id='+encodeURIComponent(id),{cache:'no-store',headers:shared?{'X-Telegram-Init-Data':initData}:{}});const data=await r.json();if(!r.ok)throw Error(data.error);units=data.tokens;initiative=data.initiative||null;if(shared&&Number.isInteger(data.gridSize))N=data.gridSize;members=data.members||[];maps=data.maps||[];if(data.mapView){mapView=data.mapView;}document.querySelector('#initiativeButton').hidden=!shared;renderInitiative();document.querySelector('#chooseMap').hidden=!(shared&&(data.role==='creator'||data.role==='master'));document.querySelector('#gridButton').hidden=!(shared&&(data.role==='creator'||data.role==='master'));if((data.activeMap||null)!==activeMap){activeMap=data.activeMap||null;bgImage=null;if(activeMap){const img=new Image();img.onload=()=>{if(activeMap===data.activeMap){bgImage=img;draw()}};img.src='/api/map-image?battle='+encodeURIComponent(sharedId)+'&map='+encodeURIComponent(activeMap)}}myUserId=data.userId||null;isMaster=data.role==='creator'||data.role==='master';isCreator=data.role==='creator';document.querySelector('#manageMasters').hidden=!isCreator;canMove=shared?!data.readonly:true;joinButton.hidden=!(shared&&data.authenticated&&data.role==='visitor');assignButton.hidden=!(shared&&isMaster);editButton.hidden=!(shared&&(isMaster||data.role==='player'));addButton.hidden=!(shared&&(data.role==='creator'||data.role==='master'));info.textContent=shared?(data.authenticated?'Battaglia condivisa — ruolo: '+data.role+(canMove?' (puoi muovere le pedine)':' (sola visualizzazione)'):'Battaglia condivisa: apri dal pulsante del bot Telegram per identificarti'):'Demo D1: trascina le pedine. Le posizioni vengono salvate.';draw()}catch(e){info.textContent='Errore caricamento: '+e.message}}
c.addEventListener('pointerdown',e=>{if(!canMove)return;const p=pos(e);const u=units.find(u=>at(u,p)&&(!shared||isMaster||String(u.owner_id)===myUserId));if(u){drag={u,dx:p.x-u.x,dy:p.y-u.y};c.setPointerCapture(e.pointerId)}});
c.addEventListener('pointerup',async e=>{if(!drag)return;const {u,dx,dy}=drag;drag=null;const point=pos(e);const p={x:point.x-dx,y:point.y-dy};if(u.x===p.x&&u.y===p.y)return;if(p.x<0||p.y<0||p.x+tokenSize(u)>N||p.y+tokenSize(u)>N||units.some(v=>v!==u&&overlaps({...u,...p},v)))return;const old={x:u.x,y:u.y};Object.assign(u,p);draw();try{const r=await fetch(shared?'/api/battle?id='+encodeURIComponent(sharedId):'/api/demo?id='+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json',...(shared?{'X-Telegram-Init-Data':initData}:{})},body:JSON.stringify({tokenId:u.id,x:p.x,y:p.y})});const data=await r.json();if(!r.ok)throw Error(data.error)}catch(err){Object.assign(u,old);draw();info.textContent='Salvataggio non riuscito: '+err.message}});
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


const editor=document.querySelector('#tokenEditor'),choice=document.querySelector('#tokenChoice'),emojiInput=document.querySelector('#tokenEmoji'),nameInput=document.querySelector('#tokenName'),sizeInput=document.querySelector('#tokenSize'),nameRow=document.querySelector('#tokenNameRow'),sizeRow=document.querySelector('#tokenSizeRow'),deleteButton=document.querySelector('#tokenDelete'),saveButton=document.querySelector('#tokenSave');
const editable=()=>units.filter(u=>isMaster||String(u.owner_id)===myUserId);
function refreshEditor(){
 const u=editable().find(u=>u.id===choice.value);if(!u)return;
 emojiInput.value=u.emoji;nameInput.value=u.name;sizeInput.value=String(tokenSize(u));
 nameRow.hidden=!isMaster;sizeRow.hidden=!isMaster;deleteButton.hidden=!isMaster;
}
editButton.onclick=()=>{
 if(!editor.hidden){editor.hidden=true;return}
 const available=editable();if(!available.length){alert('Non hai pedine modificabili');return}
 choice.replaceChildren(...available.map(u=>new Option(u.emoji+' '+u.name+' ('+tokenSize(u)+'×'+tokenSize(u)+')',u.id)));
 editor.hidden=false;refreshEditor();
};
choice.onchange=refreshEditor;
document.querySelector('#tokenCancel').onclick=()=>{editor.hidden=true};
saveButton.onclick=async()=>{
 const u=editable().find(u=>u.id===choice.value);if(!u)return;
 const body={action:'updateToken',tokenId:u.id};
 if(emojiInput.value.trim()!==u.emoji)body.emoji=emojiInput.value;
 if(isMaster){
  if(nameInput.value.trim()!==u.name)body.name=nameInput.value;
  if(Number(sizeInput.value)!==tokenSize(u))body.size=Number(sizeInput.value);
 }
 if(body.emoji===undefined&&body.name===undefined&&body.size===undefined){editor.hidden=true;return}
 saveButton.disabled=true;
 try{await battleAction(body);editor.hidden=true}catch(e){alert(e.message)}finally{saveButton.disabled=false}
};
deleteButton.onclick=async()=>{
 if(!isMaster)return;
 const u=editable().find(u=>u.id===choice.value);if(!u)return;
 if(!confirm('Eliminare definitivamente '+u.name+'?'))return;
 try{await battleAction({action:'deleteToken',tokenId:u.id});editor.hidden=true}catch(e){alert(e.message)}
};
const masterButton=document.querySelector('#manageMasters'),masterPanel=document.querySelector('#masterPanel'),masterMember=document.querySelector('#masterMember'),masterRole=document.querySelector('#masterRole'),masterSave=document.querySelector('#masterSave');
masterButton.onclick=()=>{
 if(!isCreator)return;
 if(!masterPanel.hidden){masterPanel.hidden=true;return}
 const candidates=members.filter(m=>String(m.user_id)!==myUserId);
 if(!candidates.length){alert('Nessun altro partecipante. I giocatori devono prima entrare nella battaglia.');return}
 masterMember.replaceChildren(...candidates.map(m=>new Option('Utente Telegram '+m.user_id+' — '+(m.role==='master'?'Master':'Giocatore'),m.user_id)));
 masterPanel.hidden=false;masterMember.onchange();
};
masterMember.onchange=()=>{const m=members.find(m=>String(m.user_id)===masterMember.value);if(m)masterRole.value=m.role==='master'?'master':'player'};
document.querySelector('#masterCancel').onclick=()=>{masterPanel.hidden=true};
masterSave.onclick=async()=>{
 if(!isCreator)return;
 const m=members.find(m=>String(m.user_id)===masterMember.value);if(!m)return;
 if(m.role===masterRole.value){masterPanel.hidden=true;return}
 if(!confirm('Impostare '+masterMember.value+' come '+(masterRole.value==='master'?'Master':'Giocatore')+'?'))return;
 masterSave.disabled=true;
 try{await battleAction({action:'setMemberRole',targetId:masterMember.value,newRole:masterRole.value});masterPanel.hidden=true}catch(e){alert(e.message)}finally{masterSave.disabled=false}
};
const initiativeButton=document.querySelector('#initiativeButton'),initiativePanel=document.querySelector('#initiativePanel'),initiativeStatus=document.querySelector('#initiativeStatus'),initiativeList=document.querySelector('#initiativeList'),initiativeChoices=document.querySelector('#initiativeChoices');
initiativeButton.onclick=()=>{initiativePanel.hidden=!initiativePanel.hidden;renderInitiative()};
document.querySelector('#initiativeClose').onclick=()=>{initiativePanel.hidden=true};
function renderInitiative(){
 if(!initiativeStatus)return;
 const master=document.querySelector('#initiativeMaster');master.hidden=!isMaster;
 initiativeStatus.textContent=initiative?'Round '+initiative.round+' — turno '+(initiative.turn+1)+' di '+initiative.order.length:'Nessun combattimento attivo';
 initiativeList.replaceChildren();
 if(initiative)initiative.order.forEach((t,i)=>{const p=document.createElement('p');p.textContent=(i===initiative.turn?'▶️ ':'')+t.emoji+' '+t.name+' — '+t.card.label;if(i===initiative.turn){p.style.fontWeight='bold';p.style.background='#385f71';p.style.padding='8px';p.style.borderRadius='8px'}initiativeList.append(p)});
 if(isMaster){
  const selected=new Set([...initiativeChoices.querySelectorAll('input:checked')].map(x=>x.value));
  if(!initiativeChoices.children.length&&initiative?.participants)initiative.participants.forEach(t=>selected.add(t.id));
  initiativeChoices.replaceChildren();
  units.forEach(t=>{const label=document.createElement('label');label.style.display='block';const input=document.createElement('input');input.type='checkbox';input.value=t.id;input.checked=selected.has(t.id);label.append(input,document.createTextNode(' '+t.emoji+' '+t.name));initiativeChoices.append(label)});
  document.querySelector('#initiativeNext').disabled=!initiative;
  document.querySelector('#initiativeRound').disabled=!initiative;
  document.querySelector('#initiativeReset').disabled=!initiative;
 }
}
async function initiativeAction(action,extra={}){try{await battleAction({action,...extra})}catch(e){alert(e.message)}}
document.querySelector('#initiativeStart').onclick=()=>{const tokenIds=[...initiativeChoices.querySelectorAll('input:checked')].map(x=>x.value);if(!tokenIds.length){alert('Seleziona almeno una pedina');return}if(initiative&&!confirm('Ricominciare il combattimento?'))return;initiativeAction('initiativeStart',{tokenIds})};
document.querySelector('#initiativeNext').onclick=()=>initiativeAction('initiativeNext');
document.querySelector('#initiativeRound').onclick=()=>initiativeAction('initiativeRound');
document.querySelector('#initiativeReset').onclick=()=>{if(confirm('Terminare il combattimento?'))initiativeAction('initiativeReset')};
const gridButton=document.querySelector('#gridButton'),gridPanel=document.querySelector('#gridPanel'),gridInput=document.querySelector('#gridSize');
gridButton.onclick=()=>{if(!isMaster)return;gridInput.value=N;gridPanel.hidden=!gridPanel.hidden};
document.querySelector('#gridCancel').onclick=()=>{gridPanel.hidden=true};
document.querySelector('#gridSave').onclick=async()=>{
 const size=Number(gridInput.value);
 if(!Number.isInteger(size)||size<6||size>40){alert('Scegli un numero da 6 a 40');return}
 try{await battleAction({action:'setGridSize',gridSize:size});gridPanel.hidden=true}catch(e){alert(e.message)}
};
const mapButton=document.querySelector('#chooseMap'),mapPanel=document.querySelector('#mapPanel'),mapChoice=document.querySelector('#mapChoice');
mapButton.onclick=()=>{
 if(!isMaster)return;
 if(!mapPanel.hidden){mapPanel.hidden=true;return}
 mapChoice.replaceChildren(new Option('Nessuno — griglia semplice',''),...maps.map(m=>new Option(m.name,m.id)));
 mapChoice.value=activeMap||'';mapMode.value=mapView.mode;mapZoom.value=Math.round(mapView.zoom*100);mapX.value=Math.round(mapView.x*100);mapY.value=Math.round(mapView.y*100);updateMapControls();mapPanel.hidden=false;
};
const mapMode=document.querySelector('#mapMode'),mapZoom=document.querySelector('#mapZoom'),mapX=document.querySelector('#mapX'),mapY=document.querySelector('#mapY');
function updateMapControls(){const manual=mapMode.value==='manual';mapZoom.disabled=!manual;mapX.disabled=!manual;mapY.disabled=!manual;document.querySelector('#mapZoomLabel').textContent=mapZoom.value+'%'}
[mapMode,mapZoom,mapX,mapY].forEach(el=>el.oninput=()=>{updateMapControls();mapView={mode:mapMode.value,zoom:Number(mapZoom.value)/100,x:Number(mapX.value)/100,y:Number(mapY.value)/100};draw()});
document.querySelector('#mapViewSave').onclick=async()=>{if(!isMaster)return;try{await battleAction({action:'setMapView',view:mapView});mapPanel.hidden=true}catch(e){alert(e.message)}};
document.querySelector('#mapCancel').onclick=()=>{mapPanel.hidden=true};
document.querySelector('#mapSave').onclick=async()=>{
 if(!isMaster)return;
 try{await battleAction({action:'setMap',mapId:mapChoice.value||null});mapPanel.hidden=true}catch(e){alert(e.message)}
};
window.addEventListener('resize',draw);draw();load();if(shared)setInterval(load,5000);