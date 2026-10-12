'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {GoogleService}=require('../src/services/google');
const {BackupService}=require('../src/services/backup');
const ENV={GOOGLE_CALENDAR_CLIENT_ID:'cid',GOOGLE_CALENDAR_CLIENT_SECRET:'csecret',SOFIA_CALENDAR_TOKEN_KEY:'chave-de-teste'};

// Google falso: guarda eventos por calendário, pagina de 2 em 2, exige a janela de datas e devolve só o alterado com updatedMin.
function fakeGoogle(){
 const g={calendars:[{id:'primary',summary:'Pedro',accessRole:'owner',primary:true},{id:'feriados',summary:'Feriados',accessRole:'reader',selected:true},{id:'oculto',summary:'Oculto',accessRole:'reader',selected:false}],
  events:{primary:[],feriados:[],oculto:[]},changes:{primary:[],feriados:[]},expired:new Set(),calls:[],uploads:[],driveFiles:[],seq:1};
 const res=(status,body)=>({ok:status<300,status,json:async()=>body});
 g.fetch=async(url,opts={})=>{const u=new URL(url),m=opts.method||'GET';g.calls.push(m+' '+u.pathname+u.search);
  if(u.href.startsWith('https://oauth2.googleapis.com/token')){const b=new URLSearchParams(opts.body);if(b.get('grant_type')==='authorization_code')return res(200,{access_token:'at1',refresh_token:'rt-secreto',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file',id_token:'x.'+Buffer.from(JSON.stringify({email:'pedro@gmail.com'})).toString('base64url')+'.y'});return res(200,{access_token:'at2',expires_in:3600});}
  if(u.pathname==='/calendar/v3/users/me/calendarList')return res(200,{items:g.calendars});
  let mm=u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
  if(mm){const cal=decodeURIComponent(mm[1]),evId=mm[2]&&decodeURIComponent(mm[2]);
   if(m==='GET'){if(!u.searchParams.get('timeMin')||!u.searchParams.get('timeMax'))return res(400,{error:{message:'janela obrigatória'}});
    const inc=u.searchParams.get('updatedMin');const list=inc?g.changes[cal]:g.events[cal];const size=Math.max(2,Math.ceil(list.length/10)),start=Number(u.searchParams.get('pageToken')||0),page=list.slice(start,start+size);
    return res(200,{items:page,...(start+size<list.length?{nextPageToken:String(start+size)}:{})});}
   const body=opts.body?JSON.parse(opts.body):null;
   if(m==='POST'){const ev={id:'new'+(g.seq++),etag:'"e1"',...body};g.events[cal].push(ev);return res(200,ev);}
   if(m==='PATCH'){const ev=g.events[cal].find(e=>e.id===evId);Object.assign(ev,body,{etag:'"e'+(g.seq++)+'"'});return res(200,ev);}
   if(m==='DELETE'){g.events[cal]=g.events[cal].filter(e=>e.id!==evId);return {ok:true,status:204,json:async()=>({})};}}
  if(u.pathname==='/drive/v3/files'&&m==='GET'){const q=u.searchParams.get('q')||'';if(q.includes('folder'))return res(200,{files:g.driveFiles.filter(f=>f.folder&&q.includes("name='"+f.name+"'"))});return res(200,{files:g.driveFiles.filter(f=>!f.folder).reverse()});}
  if(u.pathname==='/drive/v3/files'&&m==='POST'){const b=JSON.parse(opts.body);const f={id:'f'+(g.seq++),name:b.name,folder:true};g.driveFiles.push(f);return res(200,{id:f.id});}
  if(u.pathname==='/upload/drive/v3/files'){g.uploads.push({type:opts.headers['Content-Type'],size:opts.body.length,text:opts.body.toString('latin1')});const f={id:'b'+(g.seq++),name:'backup'+g.seq};g.driveFiles.push(f);return res(200,{id:f.id});}
  if(u.pathname.startsWith('/drive/v3/files/')&&m==='DELETE'){g.driveFiles=g.driveFiles.filter(f=>'/drive/v3/files/'+f.id!==u.pathname);return {ok:true,status:204,json:async()=>({})};}
  throw new Error('rota inesperada '+m+' '+url);};
 return g;
}
async function connected(t,g=fakeGoogle()){
 const f=fixture(t);f.config.publicBaseUrl='https://sofia.example';
 const backups=new BackupService(f.store,path.join(f.dir,'bk'));
 const svc=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:g.fetch,env:ENV,backups});
 const {url}=svc.connectUrl();const u=new URL(url);
 assert.equal(u.searchParams.get('redirect_uri'),'https://sofia.example/google/oauth/callback');assert.match(u.searchParams.get('scope'),/calendar.*drive\.file/);assert.equal(u.searchParams.get('access_type'),'offline');
 svc.sync=svc.sync.bind(svc);const realSync=svc.sync;svc.sync=async()=>({skipped:true});const realBk=svc.backupToDrive.bind(svc);svc.backupToDrive=async()=>({skipped:true});
 const r=await svc.callback(new URLSearchParams({code:'abc',state:u.searchParams.get('state')}));assert.equal(r.ok,true);
 svc.sync=realSync;svc.backupToDrive=realBk;
 return {...f,svc,g,backups};
}
const ev=(id,summary,start,end,extra={})=>({id,etag:'"'+id+'"',status:'confirmed',summary,start:start.length===10?{date:start}:{dateTime:start},end:end.length===10?{date:end}:{dateTime:end},...extra});
const google=w=>w.list({kind:'commitment',limit:500}).filter(e=>e.data.calendar_provider==='google');

test('OAuth: estado de uso único, token guardado criptografado, link vencido recusado',async t=>{
 const {svc,store}=await connected(t);
 const raw=store.db.prepare("SELECT data FROM google_link").get().data;assert.ok(!raw.includes('rt-secreto'),'refresh token não fica em texto');
 assert.equal(svc.open(JSON.parse(raw).refresh),'rt-secreto');
 const again=await svc.callback(new URLSearchParams({code:'abc',state:'qualquer'}));assert.equal(again.ok,false);
 const s=await svc.status();assert.equal(s.connected,true);assert.equal(s.email,'pedro@gmail.com');assert.equal(s.drive.connected,true);
});

test('importa tudo, paginado: principal (2 sentidos) + outros visíveis (só leitura), dia inteiro, fuso, cancelado e recusado',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 g.events.primary=[ev('a','Reunião','2026-10-12T10:00:00-03:00','2026-10-12T11:00:00-03:00'),ev('b','Aniversário','2026-10-15','2026-10-16'),ev('c','Cancelado','2026-10-13T09:00:00-03:00','2026-10-13T10:00:00-03:00',{status:'cancelled'}),
  ev('d','Recusei','2026-10-14T09:00:00-03:00','2026-10-14T10:00:00-03:00',{attendees:[{self:true,responseStatus:'declined'}]}),ev('e','Viagem','2026-10-20','2026-10-23'),ev('f','Série 1','2026-10-21T08:00:00-03:00','2026-10-21T08:30:00-03:00',{recurringEventId:'serie'})];
 g.events.feriados=[ev('h1','Finados','2026-11-02','2026-11-03')];g.events.oculto=[ev('o1','Não deve vir','2026-11-05','2026-11-06')];
 const r=await svc.sync();assert.equal(r.imported,7);assert.equal(r.created,5);assert.equal(r.calendars,2);
 const all=google(w);assert.equal(all.length,5);
 const reuniao=all.find(e=>e.title==='Reunião');assert.equal(reuniao.data.start_at,'2026-10-12T13:00:00.000Z');assert.equal(reuniao.data.google_readonly,false);
 const viagem=all.find(e=>e.title==='Viagem');assert.equal(viagem.data.calendar_all_day,true);assert.equal(viagem.data.calendar_date_start,'2026-10-20');assert.equal(viagem.data.calendar_date_end,'2026-10-23');
 assert.equal(all.find(e=>e.title==='Finados').data.google_readonly,true);assert.ok(!all.some(e=>e.title==='Não deve vir'));
 assert.equal(all.find(e=>e.title==='Série 1').data.google_recurring_id,'serie');
 assert.ok(g.calls.some(c=>c.includes('pageToken=2')),'paginou');
 const st=await svc.status();assert.match(st.warnings[0],/7 recebidos do Google, 5 novos/);
});

test('janela fixa, incremental por data de alteração, não regrava o que não mudou; cancelado vira cancelado',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 g.events.primary=[ev('a','Reunião','2026-10-12T10:00:00-03:00','2026-10-12T11:00:00-03:00')];await svc.sync();
 const call=g.calls.find(c=>c.includes('/calendars/primary/events'));assert.match(call,/timeMin=/);assert.match(call,/timeMax=/);assert.ok(!/updatedMin/.test(call),'primeira vez: completa');
 const rev=google(w)[0].revision;
 g.changes.primary=[];await svc.sync();assert.ok(g.calls.some(c=>c.includes('updatedMin=')),'depois: só o que mudou');
 assert.equal(google(w)[0].revision,rev,'nada mudou: não regravou');
 g.changes.primary=[{...g.events.primary[0],summary:'Reunião (sala 2)',etag:'"a2"'}];await svc.sync();assert.equal(google(w)[0].title,'Reunião (sala 2)');
 g.changes.primary=[{id:'a',status:'cancelled',etag:'"a3"'}];await svc.sync();assert.equal(google(w)[0].state,'cancelled');
 g.changes.primary=[{id:'nunca',status:'cancelled',etag:'"x"'}];await svc.sync();assert.equal(google(w).length,1,'cancelado que nunca existiu não vira registro');
});

test('lote grande não trava: o servidor continua respondendo durante a sincronização',async t=>{
 const {svc,core,g}=await connected(t);
 g.events.primary=Array.from({length:120},(_,i)=>ev('e'+i,'Evento '+i,'2026-11-01T10:00:00-03:00','2026-11-01T11:00:00-03:00'));
 let ticks=0;const timer=setInterval(()=>ticks++,0);
 await svc.sync();clearInterval(timer);
 assert.equal(core.workspace.list({kind:'commitment',limit:500}).length,120);
 assert.ok(ticks>=3,'o event loop rodou outras tarefas no meio ('+ticks+')');
});

test('Sofia → Google: novo, editado e apagado; conflito não sobrescreve nada',async t=>{
 const {svc,core,g}=await connected(t);const w=core.workspace;
 const novo=w.save({kind:'commitment',title:'Dentista',area:'Pessoal',data:{start_at:'2026-10-30T13:00:00.000Z',end_at:'2026-10-30T14:00:00.000Z',calendar_provider:'google',remind_minutes:30}});
 const dia=w.save({kind:'commitment',title:'Folga',area:'Pessoal',data:{calendar_all_day:true,calendar_date_start:'2026-11-03',calendar_date_end:'2026-11-04',calendar_provider:'google'}});
 const local=w.save({kind:'commitment',title:'Só na Sofia',area:'Pessoal',data:{start_at:'2026-10-30T15:00:00.000Z',calendar_provider:'local'}});
 let r=await svc.sync();assert.equal(r.sent,2);
 const enviado=g.events.primary.find(e=>e.summary==='Dentista');assert.equal(enviado.reminders.overrides[0].minutes,30);assert.equal(enviado.start.timeZone,'America/Sao_Paulo');
 assert.deepEqual(g.events.primary.find(e=>e.summary==='Folga').start,{date:'2026-11-03'});
 assert.ok(!g.events.primary.some(e=>e.summary==='Só na Sofia'));
 const salvo=w.get(novo.id);assert.ok(salvo.data.external_event_id);
 r=await svc.sync();assert.equal(r.sent,0,'nada mudou: não reenvia');
 w.save({revision:salvo.revision,title:'Dentista 14h'},salvo.id);r=await svc.sync();assert.equal(r.sent,1);assert.equal(g.events.primary.find(e=>e.id===salvo.data.external_event_id).summary,'Dentista 14h');
 const dentro=w.get(novo.id);w.save({revision:dentro.revision,title:'Dentista (mudou aqui)'},novo.id);
 g.changes.primary=[{...g.events.primary.find(e=>e.id===dentro.data.external_event_id),summary:'Dentista (mudou lá)',etag:'"outro"'}];
 r=await svc.sync();assert.equal(r.conflicts,1);assert.equal(w.get(novo.id).title,'Dentista (mudou aqui)');
 const fol=w.get(dia.id);w.deleteEntity(fol.id);g.changes.primary=[];await svc.sync();assert.ok(!g.events.primary.some(e=>e.summary==='Folga'),'apagar na Sofia apaga no Google');
 assert.ok(local);
});

test('Drive: backup criptografado na pasta Sofia OS/Backups, guarda 14 e limpa o servidor',async t=>{
 const {svc,g,backups}=await connected(t);
 for(let i=0;i<16;i++)g.driveFiles.push({id:'old'+i,name:'antigo'+i});
 const r=await svc.backupToDrive(true);assert.equal(r.ok,true);
 assert.equal(g.uploads.length,1);assert.match(g.uploads[0].type,/multipart\/related/);assert.match(g.uploads[0].text,/"name":"sofia-/);
 assert.ok(g.driveFiles.some(f=>f.folder&&f.name==='Sofia OS')&&g.driveFiles.some(f=>f.folder&&f.name==='Backups'));
 assert.ok(g.driveFiles.filter(f=>!f.folder).length<=14);
 assert.equal((await svc.backupToDrive()).skipped,true,'um por dia');
 assert.ok(backups.list().length<=3);
 assert.equal((await svc.status()).drive.last_backup.slice(0,10),new Date().toISOString().slice(0,10));
});

test('sem configuração não conecta e o desconectar revoga e apaga o token',async t=>{
 const f=fixture(t);const svc=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:fakeGoogle().fetch,env:{}});
 assert.throws(()=>svc.connectUrl(),/configurada/);assert.equal((await svc.status()).configured,false);
 const c=await connected(t);await c.svc.disconnect();assert.equal((await c.svc.status()).connected,false);assert.ok(c.g.calls.some(x=>x.startsWith('POST /revoke')));
});

test('conexão pelo app: a janela do Google volta sozinha para o app (sofiaapp://google)',async t=>{
 const g=fakeGoogle();const f=fixture(t);f.config.publicBaseUrl='https://sofia.example';
 const svc=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:g.fetch,env:ENV});
 svc.sync=async()=>({});svc.backupToDrive=async()=>({});
 const {url}=svc.connectUrl({app:true});const state=new URL(url).searchParams.get('state');assert.ok(state.startsWith('a.'));
 const r=await svc.callbackResponse(new URLSearchParams({code:'abc',state}));
 assert.match(r.redirect,/^sofiaapp:\/\/google\?ok=1&message=/);
 const web=svc.connectUrl().url;const r2=await svc.callbackResponse(new URLSearchParams({code:'abc',state:new URL(web).searchParams.get('state')}));
 assert.ok(r2.html&&r2.html.includes('Pronto'),'pelo navegador continua mostrando a página');
 const bad=await svc.callbackResponse(new URLSearchParams({state:'a.invalido',code:'x'}));assert.match(bad.redirect,/ok=0/);
});
