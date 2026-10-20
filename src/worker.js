const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(s);
const validEmoji=s=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=16;
const footprint=(a,b)=>a.x<b.x+(b.size||1)&&a.x+(a.size||1)>b.x&&a.y<b.y+(b.size||1)&&a.y+(a.size||1)>b.y;
const canPlace=(tokens,x,y,size,except,grid=12)=>x>=0&&y>=0&&x+size<=grid&&y+size<=grid&&!tokens.some(t=>t.id!==except&&footprint({x,y,size},t));
const defaults=[{id:'hero',x:2,y:2,emoji:'🛡️',name:'Eroe'},{id:'monster',x:6,y:3,emoji:'👹',name:'Mostro'},{id:'mage',x:4,y:7,emoji:'🧙',name:'Mago'}];

async function telegramUser(request,token){
 const raw=request.headers.get('X-Telegram-Init-Data');
 if(!raw||raw.length>8192||!token)return null;
 const params=new URLSearchParams(raw),hash=params.get('hash'),auth=Number(params.get('auth_date'));
 if(!hash||!/^[0-9a-f]{64}$/i.test(hash)||!Number.isFinite(auth)||Math.abs(Date.now()/1000-auth)>86400)return null;
 params.delete('hash');
 const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const enc=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',enc.encode('WebAppData'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const secret=await crypto.subtle.sign('HMAC',key,enc.encode(token));
 const hmac=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',hmac,enc.encode(check)));
 const hex=Array.from(signature,b=>b.toString(16).padStart(2,'0')).join('');
 if(hex!==hash.toLowerCase())return null;
 try{const user=JSON.parse(params.get('user')||'null');return user&&Number.isSafeInteger(user.id)?user:null}catch{return null}
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return json({ok:true,app:'telegram-battlemap',status:'d1-demo'});
  if(url.pathname==='/telegram/webhook'){
   if(request.method!=='POST')return json({error:'Metodo non consentito'},405);
   if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_WEBHOOK_SECRET)return json({error:'Bot non configurato'},503);
   const received=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
   if(!received||received!==env.TELEGRAM_WEBHOOK_SECRET)return json({error:'Non autorizzato'},403);
   const update=await request.json().catch(()=>null);
   const message=update?.message;
   if(message?.chat?.id&&message?.from?.id&&Array.isArray(message.photo)&&/^\/mappa(?:@\w+)?(?:\s|$)/i.test(message.caption||'')){
    const chatId=String(message.chat.id),userId=String(message.from.id);
    const name=(message.caption||'').replace(/^\/mappa(?:@\w+)?/i,'').trim().slice(0,60)||'Mappa';
    try{
     await env.DB.prepare('CREATE TABLE IF NOT EXISTS battle_maps (id TEXT PRIMARY KEY,battle_id TEXT NOT NULL,name TEXT NOT NULL,file_id TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)').run();
     const battle=await env.DB.prepare('SELECT b.id FROM battles b LEFT JOIN members m ON m.battle_id=b.id AND m.user_id=? WHERE b.chat_id=? AND (b.creator_id=? OR m.role=?) ORDER BY b.updated_at DESC LIMIT 1').bind(userId,chatId,userId,'master').first();
     if(battle){
      const photo=message.photo[message.photo.length-1];
      await env.DB.prepare('INSERT INTO battle_maps(id,battle_id,name,file_id) VALUES(?,?,?,?)').bind('map_'+crypto.randomUUID().replaceAll('-',''),battle.id,name,photo.file_id).run();
      await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:message.chat.id,text:'🗺️ Mappa «'+name+'» aggiunta. Apri Battle Map per selezionarla.'})});
     }
    }catch(e){return json({error:'Errore salvataggio riferimento mappa'},500)}
   }
   if(message?.chat?.id && typeof message.text === 'string' && message.text.split(' ')[0].split('@')[0] === '/start'){
    const chatId=message.chat.id;
    const payload={chat_id:chatId,text:'⚔️ Benvenuto in RPG Battle Map! Apri la mappa dimostrativa con il pulsante qui sotto.',reply_markup:{inline_keyboard:[[{text:'🗺️ Apri Battle Map',web_app:{url:'https://telegram-battlemap.marcpetruzzi.workers.dev/'}}]]}};
    const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!response.ok){const detail=await response.text().catch(()=> '');console.error('Telegram sendMessage failed',response.status,detail.slice(0,500));return json({ok:true,telegram_delivery_error:true});}
   }
   if(message?.chat?.id && message?.from?.id && typeof message.text==='string' && message.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase()==='/nuovabattaglia'){
    const chatId=String(message.chat.id),creatorId=String(message.from.id);
    let reply,battleId;
    try{
     if(!env.DB)throw Error('Database non disponibile');
     battleId='battle_'+crypto.randomUUID().replaceAll('-','');
     await env.DB.batch([
      env.DB.prepare('INSERT INTO battles (id,chat_id,creator_id,state) VALUES (?,?,?,?)').bind(battleId,chatId,creatorId,'{}'),
      env.DB.prepare('INSERT INTO members (battle_id,user_id,role) VALUES (?,?,?)').bind(battleId,creatorId,'master')
     ]);
     reply='⚔️ Battaglia creata!\n\nID: '+battleId+'\nSei il primo Master.\n\nMappa condivisa (per ora sola visualizzazione):\nhttps://telegram-battlemap.marcpetruzzi.workers.dev/?battle='+battleId;
    }catch(e){reply='⚠️ Non sono riuscito a creare la battaglia. Riprova tra poco.'}
    const battleLink=typeof battleId==='string'?'https://telegram-battlemap.marcpetruzzi.workers.dev/?battle='+battleId:null;
    const replyMarkup=battleLink?{inline_keyboard:[[{text:'🗺️ Apri battaglia',...(message.chat.type==='private'?{web_app:{url:battleLink}}:{url:battleLink})}]]}:undefined;
    const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:message.chat.id,text:reply,reply_markup:replyMarkup})});
    if(!response.ok){const detail=await response.text().catch(()=> '');console.error('Telegram sendMessage failed',response.status,detail.slice(0,500));return json({ok:true,telegram_delivery_error:true});}
   }
   if(message?.chat?.type==='private'&&message?.from?.id&&typeof message.text==='string'&&message.text.trim().startsWith('/apri ')){
    const battleId=message.text.trim().split(/\s+/)[1];
    let reply='ID battaglia non valido',markup;
    if(validId(battleId)&&battleId.startsWith('battle_')){
     const battle=await env.DB.prepare('SELECT id FROM battles WHERE id=? AND chat_id<>?').bind(battleId,'demo').first();
     if(battle){
      reply='Apri la battaglia per partecipare come giocatore.';
      markup={inline_keyboard:[[{text:'🗺️ Entra nella battaglia',web_app:{url:'https://telegram-battlemap.marcpetruzzi.workers.dev/?battle='+battleId}}]]};
     }else reply='Battaglia non trovata';
    }
    await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:message.chat.id,text:reply,reply_markup:markup})});
   }
   return json({ok:true});
  }
  if(url.pathname==='/api/map-image'){
   const id=url.searchParams.get('battle'),mapId=url.searchParams.get('map');
   if(!validId(id)||!validId(mapId)||!env.DB||!env.TELEGRAM_BOT_TOKEN)return json({error:'Mappa non valida'},400);
   try{
    const map=await env.DB.prepare('SELECT bm.file_id FROM battle_maps bm JOIN battles source ON source.id=bm.battle_id JOIN battles current ON current.chat_id=source.chat_id WHERE bm.id=? AND current.id=?').bind(mapId,id).first();
    if(!map)return json({error:'Immagine non trovata'},404);
    const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/getFile?file_id='+encodeURIComponent(map.file_id));
    const data=await r.json();
    if(!data.ok||!data.result?.file_path)return json({error:'File Telegram non disponibile'},502);
    const file=await fetch('https://api.telegram.org/file/bot'+env.TELEGRAM_BOT_TOKEN+'/'+data.result.file_path);
    if(!file.ok)return json({error:'Immagine non disponibile'},502);
    return new Response(file.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
   }catch{return json({error:'Errore caricamento immagine'},502)}
  }
  if(url.pathname==='/api/battle'&&['GET','POST'].includes(request.method)){
   const id=url.searchParams.get('id');
   if(!validId(id)||!id.startsWith('battle_'))return json({error:'Battaglia non valida'},400);
   if(!env.DB)return json({error:'Database non disponibile'},503);
   try{
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS token_sizes (token_id TEXT PRIMARY KEY, size INTEGER NOT NULL DEFAULT 1)').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS battle_maps (id TEXT PRIMARY KEY,battle_id TEXT NOT NULL,name TEXT NOT NULL,file_id TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)').run();
    const battle=await env.DB.prepare('SELECT id,creator_id,state FROM battles WHERE id=? AND chat_id<>?').bind(id,'demo').first();
    if(!battle)return json({error:'Battaglia non trovata'},404);
    const user=await telegramUser(request,env.TELEGRAM_BOT_TOKEN);
    const userId=user?String(user.id):null;
    const member=userId?await env.DB.prepare('SELECT role FROM members WHERE battle_id=? AND user_id=?').bind(id,userId).first():null;
    const role=userId===String(battle.creator_id)?'creator':member?.role||'visitor';
    const canMaster=role==='creator'||role==='master';
    let battleState={};try{battleState=JSON.parse(battle.state||'{}')}catch{}
    const gridSize=Number.isInteger(battleState.gridSize)&&battleState.gridSize>=6&&battleState.gridSize<=40?battleState.gridSize:12;
    if(request.method==='GET'){
     const {results}=await env.DB.prepare('SELECT t.id,t.name,t.x,t.y,t.emoji,t.owner_id,COALESCE(s.size,1) AS size FROM tokens t LEFT JOIN token_sizes s ON s.token_id=t.id WHERE t.battle_id=? ORDER BY t.id').bind(id).all();
     const members=canMaster?(await env.DB.prepare('SELECT user_id,role FROM members WHERE battle_id=? ORDER BY user_id').bind(id).all()).results:[];
     const maps=(await env.DB.prepare('SELECT DISTINCT bm.id,bm.name FROM battle_maps bm JOIN battles source ON source.id=bm.battle_id JOIN battles current ON current.chat_id=source.chat_id WHERE current.id=? ORDER BY bm.created_at DESC').bind(id).all()).results;
     let state={};try{state=JSON.parse(battle.state||'{}')}catch{}
     for(const t of results)t.conditions=(battleState.tokenStates||{})[t.id]||{wounds:0,shaken:false,distracted:false,vulnerable:false};
     return json({tokens:results,members,maps,activeMap:state.activeMap||null,gridSize,areas:(state.areas||[]).filter(a=>a.status==='approved'||(user&&(canMaster||a.owner===userId))),initiative:state.initiative?{round:state.initiative.round,turn:state.initiative.turn,revealed:state.initiative.revealed??state.initiative.order.length,order:state.initiative.order.map((t,i)=>(canMaster||i<(state.initiative.revealed??state.initiative.order.length)||results.some(u=>u.id===t.id&&String(u.owner_id)===userId&&!!user))?t:{id:t.id,name:t.name,emoji:t.emoji,card:null,cards:[]}),participants:state.initiative.participants,redrawRequests:canMaster?(state.initiative.redrawRequests||[]):[]}:null,mapView:state.mapView||{mode:'contain',zoom:1,x:0,y:0},userId,role,authenticated:!!user,readonly:!canMaster&&role!=='player'});
    }
    if(!user)return json({error:'Accesso Telegram richiesto'},403);
    const body=await request.json().catch(()=>null);
    if(body?.action==='join'){
     if(!user)return json({error:'Apri la mappa da Telegram'},403);
     if(!member&&!canMaster)await env.DB.prepare('INSERT OR IGNORE INTO members (battle_id,user_id,role) VALUES (?,?,?)').bind(id,userId,'player').run();
     return json({ok:true});
    }
    if(!member&&!canMaster)return json({error:'Partecipa prima alla battaglia'},403);
    if(['areaSubmit','areaApprove','areaReject','areaDelete'].includes(body?.action)){
     if(!member&&!canMaster)return json({error:'Partecipa prima alla battaglia'},403);
     const areas=Array.isArray(battleState.areas)?battleState.areas:[];
     if(body.action==='areaSubmit'){
      const a=body.area;
      if(!a||!['small','medium','large','cone','line'].includes(a.shape)||!a.origin||![a.origin.x,a.origin.y].every(v=>Number.isFinite(v)&&v>=0&&v<gridSize)||(['cone','line'].includes(a.shape)&&(!a.target||![a.target.x,a.target.y].every(v=>Number.isFinite(v)&&v>=0&&v<gridSize))))return json({error:'Sagoma non valida'},400);
      if(areas.length>=50)return json({error:'Troppe sagome'},409);
      areas.push({id:crypto.randomUUID(),shape:a.shape,origin:{x:a.origin.x,y:a.origin.y},target:a.target?{x:a.target.x,y:a.target.y}:null,owner:userId,status:canMaster?'approved':'pending'});
     }else{
      if(!canMaster)return json({error:'Solo il Master può approvare o eliminare sagome'},403);
      const i=areas.findIndex(a=>a.id===body.areaId);if(i<0)return json({error:'Sagoma non trovata'},404);
      if(body.action==='areaDelete'||body.action==='areaReject')areas.splice(i,1);
      else areas[i].status='approved';
     }
     battleState.areas=areas;
     await env.DB.prepare('UPDATE battles SET state=? WHERE id=?').bind(JSON.stringify(battleState),id).run();
     return json({ok:true});
    }
    if(body?.action==='setTokenConditions'){
     if(!canMaster)return json({error:'Solo il Master può modificare gli stati'},403);
     const token=await env.DB.prepare('SELECT id FROM tokens WHERE battle_id=? AND id=?').bind(id,body.tokenId).first();
     if(!token)return json({error:'Pedina non trovata'},404);
     const c=body.conditions;
     if(!c||!Number.isInteger(c.wounds)||c.wounds<0||c.wounds>10||['shaken','distracted','vulnerable'].some(k=>typeof c[k]!=='boolean'))return json({error:'Stati non validi'},400);
     battleState.tokenStates=battleState.tokenStates||{};
     battleState.tokenStates[body.tokenId]={wounds:c.wounds,shaken:c.shaken,distracted:c.distracted,vulnerable:c.vulnerable};
     await env.DB.prepare('UPDATE battles SET state=? WHERE id=?').bind(JSON.stringify(battleState),id).run();
     return json({ok:true});
    }
    if(body?.action==='initiativeRequestRedraw'){
     const initiative=battleState.initiative;
     if(!initiative||!initiative.order?.length)return json({error:'Nessuna iniziativa attiva'},409);
     if(!initiative.participants.some(t=>t.id===body.tokenId))return json({error:'Pedina non partecipante'},400);
     const token=await env.DB.prepare('SELECT owner_id FROM tokens WHERE battle_id=? AND id=?').bind(id,body.tokenId).first();
     if(!canMaster&&String(token?.owner_id)!==userId)return json({error:'Questa pedina non è tua'},403);
     initiative.redrawRequests=initiative.redrawRequests||[];
     if(!initiative.redrawRequests.includes(body.tokenId))initiative.redrawRequests.push(body.tokenId);
     await env.DB.prepare('UPDATE battles SET state=? WHERE id=?').bind(JSON.stringify(battleState),id).run();
     return json({ok:true});
    }
    if(['initiativeStart','initiativeNext','initiativeRound','initiativeReset','initiativeReveal','initiativeApproveRedraw','initiativeDenyRedraw'].includes(body?.action)){
     if(!canMaster)return json({error:'Solo i Master possono gestire l’iniziativa'},403);
     const action=body.action;
     let initiative=battleState.initiative||null;
     const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
     const suits=['♣','♦','♥','♠'];
     const newDeck=()=>{const cards=[];for(let suit=0;suit<4;suit++)for(let rank=0;rank<13;rank++)cards.push({label:ranks[rank]+suits[suit],value:rank*4+suit});cards.push({label:'🃏 Jolly rosso',value:53},{label:'🃏 Jolly nero',value:52});for(let i=cards.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[cards[i],cards[j]]=[cards[j],cards[i]]}return cards};
     if(action==='initiativeReset'){initiative=null}
     else if(action==='initiativeStart'){
      if(!Array.isArray(body.tokenIds)||body.tokenIds.length<1||body.tokenIds.length>54||new Set(body.tokenIds).size!==body.tokenIds.length||body.tokenIds.some(x=>typeof x!=='string'))return json({error:'Seleziona le pedine partecipanti'},400);
      const {results:all}=await env.DB.prepare('SELECT id,name,emoji FROM tokens WHERE battle_id=?').bind(id).all();
      const selected=body.tokenIds.map(tid=>all.find(t=>t.id===tid));
      if(selected.some(t=>!t))return json({error:'Pedina non trovata'},404);
      const cardCounts={};let total=0;
      for(const t of selected){const n=body.cardCounts?.[t.id]??1;if(!Number.isInteger(n)||n<1||n>4)return json({error:'Carte per pedina: da 1 a 4'},400);cardCounts[t.id]=n;total+=n}
      if(total>54)return json({error:'Massimo 54 carte complessive'},400);
      initiative={participants:selected,cardCounts,deck:newDeck(),order:[],turn:0,round:0,revealed:0,redrawRequests:[]};
     }else if(!initiative)return json({error:'Avvia prima il combattimento'},409);
     if(action==='initiativeRound'||action==='initiativeStart'){
      const count=initiative.participants.reduce((sum,t)=>sum+(initiative.cardCounts?.[t.id]||1),0);
      if(initiative.reshuffleNext||initiative.deck.length<count){initiative.deck=newDeck();initiative.reshuffleNext=false}
      const drawn=initiative.participants.map(t=>{const cards=Array.from({length:initiative.cardCounts?.[t.id]||1},()=>initiative.deck.pop());return {...t,card:cards.reduce((best,c)=>c.value>best.value?c:best),cards}});
      initiative.order=drawn.sort((a,b)=>b.card.value-a.card.value);
      initiative.round=(initiative.round||0)+1;initiative.turn=0;initiative.revealed=0;initiative.redrawRequests=[];
      if(drawn.some(t=>t.cards.some(c=>c.value>=52)))initiative.reshuffleNext=true;

     }
     if(action==='initiativeReveal')initiative.revealed=Math.min(initiative.order.length,(initiative.revealed??initiative.order.length)+1);
     if(action==='initiativeNext'){if((initiative.revealed??initiative.order.length)<initiative.order.length)return json({error:'Rivela prima tutte le carte'},409);initiative.turn=(initiative.turn+1)%initiative.order.length}
     if(action==='initiativeApproveRedraw'||action==='initiativeDenyRedraw'){
      const tid=body.tokenId;
      if(!initiative.redrawRequests?.includes(tid))return json({error:'Richiesta non trovata'},404);
      initiative.redrawRequests=initiative.redrawRequests.filter(x=>x!==tid);
      if(action==='initiativeApproveRedraw'){
       if(!initiative.deck.length)initiative.deck=newDeck();
       const entry=initiative.order.find(t=>t.id===tid);
       if(!entry)return json({error:'Pedina non trovata'},404);
       entry.card=initiative.deck.pop();entry.cards=[entry.card];
       if(entry.card.value>=52)initiative.reshuffleNext=true;
       initiative.order.sort((a,b)=>b.card.value-a.card.value);
       initiative.turn=0;initiative.revealed=0;
      }
     }
     battleState.initiative=initiative;
     await env.DB.prepare('UPDATE battles SET state=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(battleState),id).run();
     return json({ok:true});
    }
    if(body?.action==='setGridSize'){
     if(!canMaster)return json({error:'Solo i Master possono cambiare la griglia'},403);
     const size=body.gridSize;
     if(!Number.isInteger(size)||size<6||size>40)return json({error:'Scegli una dimensione da 6 a 40'},400);
     const {results:tokens}=await env.DB.prepare('SELECT t.x,t.y,COALESCE(s.size,1) AS size FROM tokens t LEFT JOIN token_sizes s ON s.token_id=t.id WHERE t.battle_id=?').bind(id).all();
     if(tokens.some(t=>t.x+t.size>size||t.y+t.size>size))return json({error:'Ci sono pedine fuori dalla nuova griglia: spostale prima di ridurla'},409);
     battleState.gridSize=size;
     await env.DB.prepare('UPDATE battles SET state=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(battleState),id).run();
     return json({ok:true});
    }
    if(body?.action==='setMapView'){
     if(!canMaster)return json({error:'Solo i Master possono regolare lo sfondo'},403);
     const v=body.view;
     if(!v||!['contain','cover','manual'].includes(v.mode)||![v.zoom,v.x,v.y].every(Number.isFinite)||v.zoom<0.5||v.zoom>5||Math.abs(v.x)>2||Math.abs(v.y)>2)return json({error:'Regolazione non valida'},400);
     let state={};try{state=JSON.parse(battle.state||'{}')}catch{}
     state.mapView={mode:v.mode,zoom:v.zoom,x:v.x,y:v.y};
     await env.DB.prepare('UPDATE battles SET state=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(state),id).run();
     return json({ok:true});
    }
    if(body?.action==='setMap'){
     if(!canMaster)return json({error:'Solo i Master possono cambiare mappa'},403);
     if(body.mapId!==null&&(typeof body.mapId!=='string'||!validId(body.mapId)))return json({error:'Mappa non valida'},400);
     if(body.mapId){const found=await env.DB.prepare('SELECT bm.id FROM battle_maps bm JOIN battles source ON source.id=bm.battle_id JOIN battles current ON current.chat_id=source.chat_id WHERE bm.id=? AND current.id=?').bind(body.mapId,id).first();if(!found)return json({error:'Mappa non trovata'},404)}
     let state={};try{state=JSON.parse(battle.state||'{}')}catch{}
     state.activeMap=body.mapId;
     await env.DB.prepare('UPDATE battles SET state=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(state),id).run();
     return json({ok:true});
    }
    if(body?.action==='setMemberRole'){
     if(role!=='creator')return json({error:'Solo il creatore può gestire i Master'},403);
     if(typeof body.targetId!=='string'||!/^\d{1,20}$/.test(body.targetId)||!['master','player'].includes(body.newRole))return json({error:'Dati non validi'},400);
     if(body.targetId===String(battle.creator_id))return json({error:'Il creatore non può perdere il ruolo'},403);
     const target=await env.DB.prepare('SELECT user_id,role FROM members WHERE battle_id=? AND user_id=?').bind(id,body.targetId).first();
     if(!target)return json({error:'Partecipante non trovato'},404);
     await env.DB.prepare('UPDATE members SET role=? WHERE battle_id=? AND user_id=?').bind(body.newRole,id,body.targetId).run();
     return json({ok:true});
    }
    if(body?.action==='assignToken'){
     if(!canMaster)return json({error:'Solo i Master possono assegnare pedine'},403);
     if(typeof body.tokenId!=='string'||typeof body.ownerId!=='string')return json({error:'Dati non validi'},400);
     const token=await env.DB.prepare('SELECT id FROM tokens WHERE battle_id=? AND id=?').bind(id,body.tokenId).first();
     if(!token)return json({error:'Pedina non trovata'},404);
     if(body.ownerId!==''){
      const target=await env.DB.prepare('SELECT user_id FROM members WHERE battle_id=? AND user_id=?').bind(id,body.ownerId).first();
      if(!target)return json({error:'Giocatore non presente nella battaglia'},404);
     }
     await env.DB.prepare('UPDATE tokens SET owner_id=? WHERE id=? AND battle_id=?').bind(body.ownerId||null,body.tokenId,id).run();
     return json({ok:true});
    }
    if(['updateToken','deleteToken'].includes(body?.action)){
     if(typeof body.tokenId!=='string')return json({error:'Pedina non valida'},400);
     const token=await env.DB.prepare('SELECT t.id,t.owner_id,t.x,t.y,COALESCE(s.size,1) AS size FROM tokens t LEFT JOIN token_sizes s ON s.token_id=t.id WHERE t.battle_id=? AND t.id=?').bind(id,body.tokenId).first();
     if(!token)return json({error:'Pedina non trovata'},404);
     if(body.action==='deleteToken'){
      if(!canMaster)return json({error:'Solo il Master può eliminare pedine'},403);
      await env.DB.batch([env.DB.prepare('DELETE FROM token_sizes WHERE token_id=?').bind(token.id),env.DB.prepare('DELETE FROM tokens WHERE id=? AND battle_id=?').bind(token.id,id)]);
      return json({ok:true});
     }
     if(!canMaster&&String(token.owner_id)!==userId)return json({error:'Non puoi modificare questa pedina'},403);
     const updates=[],values=[];
     if(body.emoji!==undefined){
      if(!validEmoji(body.emoji))return json({error:'Icona non valida'},400);
      updates.push('emoji=?');values.push(body.emoji.trim());
     }
     if(body.name!==undefined){
      if(!canMaster)return json({error:'Solo il Master può cambiare il nome'},403);
      if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>40)return json({error:'Nome non valido'},400);
      updates.push('name=?');values.push(body.name.trim());
     }
     if(body.size!==undefined){
      if(!canMaster)return json({error:'Solo il Master può cambiare la dimensione'},403);
      if(![1,2,3,4].includes(body.size))return json({error:'Dimensione non valida'},400);
      const {results:others}=await env.DB.prepare('SELECT t.id,t.x,t.y,COALESCE(s.size,1) AS size FROM tokens t LEFT JOIN token_sizes s ON s.token_id=t.id WHERE t.battle_id=?').bind(id).all();
      if(!canPlace(others,token.x,token.y,body.size,token.id,gridSize))return json({error:'Spazio insufficiente per la dimensione scelta'},409);
      await env.DB.prepare('INSERT INTO token_sizes(token_id,size) VALUES(?,?) ON CONFLICT(token_id) DO UPDATE SET size=excluded.size').bind(token.id,body.size).run();
     }
     if(updates.length)await env.DB.prepare('UPDATE tokens SET '+updates.join(',')+' WHERE id=? AND battle_id=?').bind(...values,token.id,id).run();
     return json({ok:true});
    }
    if(body?.action==='createToken'){
     if(!canMaster)return json({error:'Solo i Master possono creare pedine'},403);
     const name=typeof body.name==='string'?body.name.trim():'';
     const emoji=typeof body.emoji==='string'?body.emoji.trim():'';
     if(!name||name.length>40||!emoji||emoji.length>16)return json({error:'Dati pedina non validi'},400);
     const size=[1,2,3,4].includes(body.size)?body.size:1;
     const {results:occupied}=await env.DB.prepare('SELECT t.id,t.x,t.y,COALESCE(s.size,1) AS size FROM tokens t LEFT JOIN token_sizes s ON s.token_id=t.id WHERE t.battle_id=?').bind(id).all();
     let cell=null;
     for(let y=0;y<=gridSize-size&&!cell;y++)for(let x=0;x<=gridSize-size;x++)if(canPlace(occupied,x,y,size,undefined,gridSize)){cell={x,y};break}
     if(!cell)return json({error:'Non c’è spazio libero per la pedina'},409);
     const tokenId='token_'+crypto.randomUUID().replaceAll('-','');
     await env.DB.batch([env.DB.prepare('INSERT INTO tokens (id,battle_id,owner_id,name,x,y,emoji) VALUES (?,?,?,?,?,?,?)').bind(tokenId,id,null,name,cell.x,cell.y,emoji),env.DB.prepare('INSERT INTO token_sizes(token_id,size) VALUES(?,?)').bind(tokenId,size)]);
     return json({ok:true,tokenId});
    }
    if(!body||typeof body.tokenId!=='string'||!Number.isInteger(body.x)||!Number.isInteger(body.y)||body.x<0||body.x>=gridSize||body.y<0||body.y>=gridSize)return json({error:'Movimento non valido'},400);
    const token=await env.DB.prepare('SELECT id,owner_id FROM tokens WHERE id=? AND battle_id=?').bind(body.tokenId,id).first();
    if(!token)return json({error:'Pedina non trovata'},404);
    if(!canMaster&&String(token.owner_id)!==userId)return json({error:'Non puoi spostare questa pedina'},403);
    const {results:occupied}=await env.DB.prepare('SELECT t.id,t.x,t.y,COALESCE(s.size,1) AS size FROM tokens t LEFT JOIN token_sizes s ON s.token_id=t.id WHERE t.battle_id=?').bind(id).all();
    const moving=occupied.find(t=>t.id===body.tokenId);
    if(!moving||!canPlace(occupied,body.x,body.y,moving.size,body.tokenId,gridSize))return json({error:'Casella occupata o fuori griglia'},409);
    await env.DB.prepare('UPDATE tokens SET x=?,y=? WHERE id=? AND battle_id=?').bind(body.x,body.y,body.tokenId,id).run();
    return json({ok:true});
   }catch(e){return json({error:'Errore database'},500)}
  }
  if(url.pathname==='/api/demo'&&['GET','POST'].includes(request.method)){
   const id=url.searchParams.get('id');
   if(!validId(id))return json({error:'ID partita non valido'},400);
   if(!env.DB)return json({error:'Database non collegato'},503);
   try{
    if(request.method==='GET'){
     const battle=await env.DB.prepare('SELECT id FROM battles WHERE id=?').bind(id).first();
     if(!battle){
      await env.DB.prepare('INSERT OR IGNORE INTO battles (id,chat_id,creator_id,state) VALUES (?,?,?,?)').bind(id,'demo','demo','{}').run();
      for(const t of defaults)await env.DB.prepare('INSERT OR IGNORE INTO tokens (id,battle_id,owner_id,name,x,y,emoji) VALUES (?,?,?,?,?,?,?)').bind(id+'_'+t.id,id,null,t.name,t.x,t.y,t.emoji).run();
     }
     const {results}=await env.DB.prepare('SELECT id,name,x,y,emoji FROM tokens WHERE battle_id=? ORDER BY id').bind(id).all();
     return json({tokens:results});
    }
    const body=await request.json().catch(()=>null);
    if(!body||typeof body.tokenId!=='string'||!Number.isInteger(body.x)||!Number.isInteger(body.y)||body.x<0||body.x>=12||body.y<0||body.y>=12)return json({error:'Movimento non valido'},400);
    const token=await env.DB.prepare('SELECT id FROM tokens WHERE id=? AND battle_id=?').bind(body.tokenId,id).first();
    if(!token)return json({error:'Pedina non trovata'},404);
    const occupied=await env.DB.prepare('SELECT id FROM tokens WHERE battle_id=? AND x=? AND y=? AND id<>?').bind(id,body.x,body.y,body.tokenId).first();
    if(occupied)return json({error:'Casella occupata'},409);
    await env.DB.prepare('UPDATE tokens SET x=?,y=? WHERE id=? AND battle_id=?').bind(body.x,body.y,body.tokenId,id).run();
    return json({ok:true});
   }catch(e){return json({error:'Errore database'},500)}
  }
  if(url.pathname.startsWith('/api/'))return json({error:'API non ancora configurata'},501);
  return env.ASSETS.fetch(request);
 }
};