(()=>{'use strict';
const tg=window.Telegram?.WebApp;
const auth=tg?.initData||'';
if(!auth)return;
const api='/api/my-battles';
const headers={'X-Telegram-Init-Data':auth,'Content-Type':'application/json'};
const box=document.querySelector('#myBattles'),list=document.querySelector('#myBattlesList');
if(!box)return;
box.hidden=false;
const current=new URLSearchParams(location.search).get('battle');
async function request(action,data={}){const r=await fetch(api,{method:action?'POST':'GET',headers,body:action?JSON.stringify({action,...data}):undefined,cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'Errore');return j}
async function refresh(){try{const {battles}=await request();list.replaceChildren();if(!battles.length)list.textContent='Nessuna battaglia salvata.';for(const b of battles){const row=document.createElement('div');row.style.cssText='padding:10px;border:1px solid #52687c;border-radius:10px;margin:8px 0';const name=document.createElement('strong');name.textContent=b.name+' '+(b.private?'🔒':'🌐');row.append(name,document.createElement('br'));const open=document.createElement('button');open.textContent='🗺️ Apri';open.onclick=()=>{location.href='/?battle='+encodeURIComponent(b.id)};row.append(open);if(b.private){const share=document.createElement('button');share.textContent='📤 Condividi nel gruppo';share.onclick=async()=>{try{const data=await request('publish',{id:b.id});const link='https://t.me/share/url?url='+encodeURIComponent(data.url)+'&text='+encodeURIComponent('⚔️ '+b.name+' — entra nella battaglia!');tg.openTelegramLink?tg.openTelegramLink(link):location.assign(link);refresh()}catch(e){alert(e.message)}};row.append(share)}else{const share=document.createElement('button');share.textContent='📤 Invia link';share.onclick=()=>{const link='https://t.me/share/url?url='+encodeURIComponent('https://t.me/RpgBattleMapBot/battlemap?startapp='+b.id)+'&text='+encodeURIComponent('⚔️ '+b.name);tg.openTelegramLink?tg.openTelegramLink(link):location.assign(link)};row.append(share)}list.append(row)}}catch(e){list.textContent=e.message}}
document.querySelector('#myBattlesNew').onclick=async()=>{const name=prompt('Nome della nuova battaglia','Nuova battaglia');if(name===null)return;try{const b=await request('create',{name});location.href='/?battle='+encodeURIComponent(b.id)}catch(e){alert(e.message)}};
document.querySelector('#myBattlesRefresh').onclick=refresh;
refresh();
})();