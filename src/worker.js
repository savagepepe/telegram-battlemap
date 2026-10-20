export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return Response.json({ok:true,app:'telegram-battlemap',status:'starter'});
  if(url.pathname.startsWith('/api/'))return Response.json({error:'API non ancora configurata: collega bot Telegram e database D1 prima di abilitare la partita condivisa'},{status:501});
  return env.ASSETS.fetch(request);
 }
};