const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(s);
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
   if(message?.chat?.id && typeof message.text === 'string' && message.text.split(' ')[0].split('@')[0] === '/start'){
    const chatId=message.chat.id;
    const payload={chat_id:chatId,text:'⚔️ Benvenuto in RPG Battle Map! Apri la mappa dimostrativa con il pulsante qui sotto.',reply_markup:{inline_keyboard:[[{text:'🗺️ Apri Battle Map',web_app:{url:'https://telegram-battlemap.marcpetruzzi.workers.dev/'}}]]}};
    const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!response.ok)return json({error:'Invio Telegram non riuscito'},502);
   }
   if(message?.chat?.id && message?.from?.id && typeof message.text==='string' && message.text.trim().split(/\\s+/)[0].split('@')[0].toLowerCase()==='/nuovabattaglia'){
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
    if(!response.ok)return json({error:'Invio Telegram non riuscito'},502);
   }
   return json({ok:true});
  }
  if(url.pathname==='/api/battle'&&['GET','POST'].includes(request.method)){
   const id=url.searchParams.get('id');
   if(!validId(id)||!id.startsWith('battle_'))return json({error:'Battaglia non valida'},400);
   if(!env.DB)return json({error:'Database non disponibile'},503);
   try{
    const battle=await env.DB.prepare('SELECT id,creator_id FROM battles WHERE id=? AND chat_id<>?').bind(id,'demo').first();
    if(!battle)return json({error:'Battaglia non trovata'},404);
    const user=await telegramUser(request,env.TELEGRAM_BOT_TOKEN);
    const userId=user?String(user.id):null;
    const member=userId?await env.DB.prepare('SELECT role FROM members WHERE battle_id=? AND user_id=?').bind(id,userId).first():null;
    const role=userId===String(battle.creator_id)?'creator':member?.role||'visitor';
    const canMaster=role==='creator'||role==='master';
    if(request.method==='GET'){
     const {results}=await env.DB.prepare('SELECT id,name,x,y,emoji,owner_id FROM tokens WHERE battle_id=? ORDER BY id').bind(id).all();
     return json({tokens:results,role,authenticated:!!user,readonly:!canMaster});
    }
    if(!user||!member&&!canMaster)return json({error:'Accesso Telegram richiesto'},403);
    const body=await request.json().catch(()=>null);
    if(body?.action==='createToken'){
     if(!canMaster)return json({error:'Solo i Master possono creare pedine'},403);
     const name=typeof body.name==='string'?body.name.trim():'';
     const emoji=typeof body.emoji==='string'?body.emoji.trim():'';
     if(!name||name.length>40||!emoji||emoji.length>16||!Number.isInteger(body.x)||!Number.isInteger(body.y)||body.x<0||body.x>=12||body.y<0||body.y>=12)return json({error:'Dati pedina non validi'},400);
     const occupied=await env.DB.prepare('SELECT id FROM tokens WHERE battle_id=? AND x=? AND y=?').bind(id,body.x,body.y).first();
     if(occupied)return json({error:'Casella occupata'},409);
     const tokenId='token_'+crypto.randomUUID().replaceAll('-','');
     await env.DB.prepare('INSERT INTO tokens (id,battle_id,owner_id,name,x,y,emoji) VALUES (?,?,?,?,?,?,?)').bind(tokenId,id,null,name,body.x,body.y,emoji).run();
     return json({ok:true,tokenId});
    }
    if(!body||typeof body.tokenId!=='string'||!Number.isInteger(body.x)||!Number.isInteger(body.y)||body.x<0||body.x>=12||body.y<0||body.y>=12)return json({error:'Movimento non valido'},400);
    const token=await env.DB.prepare('SELECT id,owner_id FROM tokens WHERE id=? AND battle_id=?').bind(body.tokenId,id).first();
    if(!token)return json({error:'Pedina non trovata'},404);
    if(!canMaster&&String(token.owner_id)!==userId)return json({error:'Non puoi spostare questa pedina'},403);
    const occupied=await env.DB.prepare('SELECT id FROM tokens WHERE battle_id=? AND x=? AND y=? AND id<>?').bind(id,body.x,body.y,body.tokenId).first();
    if(occupied)return json({error:'Casella occupata'},409);
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