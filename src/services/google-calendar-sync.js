'use strict';
// Tokens never enter entity data, logs, public responses or the APK.
const crypto=require('node:crypto');
const {OWNER}=require('../memory/store');
const {AppError}=require('../core/util');
const API='https://www.googleapis.com/calendar/v3';
const TOKEN='https://oauth2.googleapis.com/token';
const COOKIE='sofia_google_calendar_state';
const hash=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const stamp=()=>new Date().toISOString();
const clone=x=>JSON.parse(JSON.stringify(x));
// Let HTTP requests run between background records; never hold a transaction across this yield.
const yieldRequests=()=>new Promise(resolve=>setImmediate(resolve));
function encrypt(value,key){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');}
function decrypt(value,key){const raw=Buffer.from(value,'base64');if(raw.length<29)throw Error('Invalid encrypted token');const c=crypto.createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));c.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([c.update(raw.subarray(28)),c.final()]).toString('utf8'));}
function cookie(req,name){const pair=String(req.headers.cookie||'').split(';').find(x=>x.trim().startsWith(name+'='));return pair?pair.trim().slice(name.length+1):'';}
function eq(a,b){if(typeof a!=='string'||typeof b!=='string')return false;return crypto.timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));}
function validDate(x){return /^\d{4}-\d{2}-\d{2}$/.test(x||'')&&Number.isFinite(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;}
function plusDay(date){return new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);}
function toGoogle(entity){
 const d=entity.data||{},start=d.start_at||d.remind_at||d.due_at;
 if(!d.calendar_all_day&&(!start||!Number.isFinite(Date.parse(start))))return null;
 const common={summary:entity.title,description:entity.content||'',location:d.location||''};
 if(d.calendar_all_day&&validDate(d.calendar_date_start))return {...common,start:{date:d.calendar_date_start},end:{date:validDate(d.calendar_date_end)&&d.calendar_date_end>d.calendar_date_start?d.calendar_date_end:plusDay(d.calendar_date_start)}};
 if(!start||!Number.isFinite(Date.parse(start)))return null;
 const begin=new Date(start).toISOString();let finish=d.end_at&&Number.isFinite(Date.parse(d.end_at))?new Date(d.end_at).toISOString():new Date(Date.parse(begin)+3600000).toISOString();
 if(Date.parse(finish)<=Date.parse(begin))finish=new Date(Date.parse(begin)+3600000).toISOString();
 return {...common,start:{dateTime:begin},end:{dateTime:finish}};
}
function googleProjection(event){
 event=event||{};
 const instant=value=>value?.date?{date:value.date}:value?.dateTime&&Number.isFinite(Date.parse(value.dateTime))?{dateTime:new Date(value.dateTime).toISOString()}:null;
 return {summary:event.summary||'Sem título',description:event.description||'',location:event.location||'',start:instant(event.start),end:instant(event.end)};
}
const fingerprint=event=>hash(JSON.stringify(googleProjection(event)));
const deleted=entity=>!entity||['cancelled','archived'].includes(entity.state);
function fromGoogle(event,old,calendarId){
 const projection=googleProjection(event),allDay=!!projection.start?.date;if(!projection.start||!projection.end)throw Error('Evento sem início ou fim');
 const dateStart=allDay?projection.start.date:'',dateEnd=allDay?projection.end.date:'';
 const start=allDay?dateStart+'T12:00:00.000Z':projection.start.dateTime,end=allDay?dateEnd+'T12:00:00.000Z':projection.end.dateTime;
 const kind=old?.kind||'commitment',data={...(old?.data||{}),[kind==='reminder'?'remind_at':'start_at']:start,calendar_provider:'google',calendar_id:calendarId,external_event_id:event.id,calendar_recurring_id:event.recurringEventId||'',calendar_original_start:JSON.stringify(event.originalStartTime||{}),calendar_time_zone:event.start?.timeZone||'',sync_state:'synced',calendar_all_day:allDay,calendar_date_start:dateStart,calendar_date_end:dateEnd};
 if(kind==='commitment'){data.end_at=end;data.location=projection.location;}
 return {kind,title:projection.summary.slice(0,240),content:projection.description.slice(0,16000),state:old?.state||'confirmed',area:old?.area||'Pessoal',privacy:old?.privacy||'private',tags:old?.tags||[],revision:old?.revision,data};
}
class GoogleCalendarSync{
 constructor(runtime,{fetchImpl=globalThis.fetch,env=process.env}={}){
  this.runtime=runtime;this.db=runtime.store.db;this.w=runtime.workspace;this.fetch=fetchImpl;this.env=env;this.pending=new Map();this.tickets=new Map();this.busy=null;this.epoch=0;this.applying=false;this.controller=null;
  this.windows=new Map();this.monthLoads=new Map();this.monthRetryAt=new Map();this.seriesRefresh=0;
  this.db.exec(`CREATE TABLE IF NOT EXISTS md_google_series(owner TEXT NOT NULL,account_key TEXT NOT NULL,calendar_id TEXT NOT NULL,google_id TEXT NOT NULL,event TEXT NOT NULL,PRIMARY KEY(owner,account_key,calendar_id,google_id));
   CREATE TABLE IF NOT EXISTS md_google_account(owner TEXT PRIMARY KEY,secret TEXT NOT NULL,meta TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS md_google_links(owner TEXT NOT NULL,account_key TEXT NOT NULL,calendar_id TEXT NOT NULL,local_id TEXT NOT NULL,google_id TEXT NOT NULL,local_hash TEXT NOT NULL,etag TEXT NOT NULL,remote_hash TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,account_key,calendar_id,local_id),UNIQUE(owner,account_key,calendar_id,google_id));`);
 }
 key(){const k=Buffer.from(this.env.SOFIA_CALENDAR_TOKEN_KEY||'','base64');return k.length===32?k:null;}
 base(){try{const u=new URL(this.runtime.config.publicBaseUrl||'');if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))||u.username||u.password||u.search||u.hash||u.pathname!=='/')return '';return u.origin;}catch{return '';}}
 configured(){return !!(this.env.GOOGLE_CALENDAR_CLIENT_ID&&this.env.GOOGLE_CALENDAR_CLIENT_SECRET&&this.key()&&this.base());}
 account(){const row=this.db.prepare('SELECT * FROM md_google_account WHERE owner=?').get(OWNER);if(!row)return null;try{return {...decrypt(row.secret,this.key()),meta:JSON.parse(row.meta)};}catch{throw new AppError('CALENDAR_KEY','Não foi possível abrir a conexão Google. Verifique a chave persistente do servidor.',503);}}
 write(a){const {meta,...secret}=a;this.db.prepare('INSERT INTO md_google_account VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET secret=excluded.secret,meta=excluded.meta').run(OWNER,encrypt(secret,this.key()),JSON.stringify(meta||{}));}
 status(){
  if(!this.configured())return {configured:false,connected:false};
  try{const a=this.account();if(!a)return {configured:true,connected:false};return {configured:true,connected:true,calendar_id:a.meta.calendar_id,calendar_name:a.meta.calendar_name,calendars:a.meta.calendars||[],last_sync:a.meta.last_sync||null,syncing:!!this.busy,error:a.meta.error||'',warnings:a.meta.warnings||[],conflicts:a.meta.conflicts||[]};}catch(e){return {configured:true,connected:false,error:e.message};}
 }
 start(){if(this.timer)return;this.timer=setInterval(()=>void this.sync().catch(()=>{}),30000);this.timer.unref?.();this.schedule();}
 close(){clearInterval(this.timer);clearTimeout(this.scheduled);this.epoch++;this.controller?.abort();this.pending.clear();this.tickets.clear();}
 schedule(){clearTimeout(this.scheduled);this.scheduled=setTimeout(()=>void this.sync().catch(()=>{}),650);this.scheduled.unref?.();}
 prune(){for(const map of [this.pending,this.tickets])for(const [k,v] of map)if(v.expires<Date.now())map.delete(k);}
 createTicket(){if(!this.configured())throw new AppError('GOOGLE_SETUP','A conexão Google precisa ser configurada pelo responsável da Sofia.',503);this.prune();if(this.tickets.size+this.pending.size>=20)throw new AppError('RATE_LIMIT','Há muitas autorizações pendentes. Aguarde alguns minutos.',429);const ticket=crypto.randomBytes(32).toString('base64url');this.tickets.set(hash(ticket),{expires:Date.now()+300000});return {url:this.base()+'/oauth/google/calendar/start?ticket='+ticket};}
 async publicRoute(req,res,p,m,url){
  if(m!=='GET'||!['/oauth/google/calendar/start','/oauth/google/calendar/callback'].includes(p))return false;
  this.prune();res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  const secure=this.base().startsWith('https:')?'; Secure':'';
  if(p.endsWith('/start')){
   const ticket=hash(url.searchParams.get('ticket')||''),entry=this.tickets.get(ticket);this.tickets.delete(ticket);if(!entry||entry.expires<Date.now())throw new AppError('OAUTH_EXPIRED','A autorização expirou. Toque em conectar novamente.',400);
   const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url'),nonce=crypto.randomBytes(24).toString('base64url');
   this.pending.set(hash(state),{verifier,nonce,expires:Date.now()+600000,epoch:this.epoch});
   res.setHeader('Set-Cookie',COOKIE+'='+nonce+'; Path=/oauth/google/calendar; HttpOnly; SameSite=Lax; Max-Age=600'+secure);
   const params=new URLSearchParams({client_id:this.env.GOOGLE_CALENDAR_CLIENT_ID,redirect_uri:this.base()+'/oauth/google/calendar/callback',response_type:'code',access_type:'offline',prompt:'consent select_account',scope:'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
   res.statusCode=303;res.setHeader('Location','https://accounts.google.com/o/oauth2/v2/auth?'+params);res.end();return true;
  }
  const state=hash(url.searchParams.get('state')||''),pending=this.pending.get(state);this.pending.delete(state);
  res.setHeader('Set-Cookie',COOKIE+'=; Path=/oauth/google/calendar; HttpOnly; SameSite=Lax; Max-Age=0'+secure);
  if(!pending||pending.expires<Date.now()||pending.epoch!==this.epoch||!eq(cookie(req,COOKIE),pending.nonce))throw new AppError('OAUTH_STATE','A autorização não corresponde a este navegador. Conecte novamente.',403);
  if(url.searchParams.get('error')){this.done(res,false);return true;}
  const code=url.searchParams.get('code');if(!code||code.length>4096)throw new AppError('OAUTH_CODE','Resposta de autorização inválida.',400);
  const token=await this.token({code,code_verifier:pending.verifier,grant_type:'authorization_code',redirect_uri:this.base()+'/oauth/google/calendar/callback'});
  if(!token.refresh_token)throw new AppError('GOOGLE_OFFLINE','O Google não autorizou a sincronização contínua. Conecte a conta novamente.',409);
  const calendars=await this.calendarList(token.access_token),primary=calendars.find(c=>c.primary&&['owner','writer'].includes(c.accessRole))||calendars.find(c=>['owner','writer'].includes(c.accessRole));
  if(!primary)throw new AppError('GOOGLE_READ_ONLY','Essa conta não tem um calendário com permissão de edição.',403);
  if(pending.epoch!==this.epoch)throw new AppError('OAUTH_EXPIRED','A conexão foi cancelada.');
  this.epoch++;this.controller?.abort();this.write({...token,expires_at:Date.now()+Number(token.expires_in||3600)*1000,account_key:hash(calendars.find(c=>c.primary)?.id||primary.id),meta:{calendar_id:primary.id,calendar_name:primary.summary,calendars,conflicts:[],warnings:[],error:'',sync_token:''}});this.schedule();this.done(res,true);return true;
 }
 done(res,ok){res.setHeader('Content-Type','text/html; charset=utf-8');res.statusCode=200;res.end('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sofia · Google Agenda</title><body style="font-family:system-ui;padding:32px;max-width:540px;margin:auto"><h1>'+ (ok?'Google Agenda conectado':'Conexão cancelada')+'</h1><p>'+ (ok?'Volte à Sofia. A sincronização começa automaticamente e os ajustes mostram o estado real da conexão.':'Nenhum evento foi alterado. Você pode tentar novamente nos ajustes da Sofia.')+'</p><a href="/">Abrir Sofia no site</a></body></html>');}
 async raw(url,options={}){const timeout=AbortSignal.timeout(15000),signal=this.controller?AbortSignal.any([timeout,this.controller.signal]):timeout;const response=await this.fetch(url,{...options,signal,redirect:'error'});let body;try{body=await response.json();}catch{body={};}return {response,body};}
 async token(values){const {response,body}=await this.raw(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.env.GOOGLE_CALENDAR_CLIENT_ID,client_secret:this.env.GOOGLE_CALENDAR_CLIENT_SECRET,...values})});if(!response.ok||!body.access_token)throw new AppError('GOOGLE_AUTH','O Google recusou a autorização. Reconecte a conta nos ajustes.',409);return body;}
 async access(){const a=this.account();if(!a)throw new AppError('GOOGLE_NOT_CONNECTED','Google Agenda não conectado.',409);if(a.expires_at>Date.now()+60000)return a.access_token;const epoch=this.epoch;const token=await this.token({grant_type:'refresh_token',refresh_token:a.refresh_token});if(epoch!==this.epoch)throw new AppError('CANCELLED','Sincronização cancelada.',409);this.write({...a,...token,refresh_token:token.refresh_token||a.refresh_token,expires_at:Date.now()+Number(token.expires_in||3600)*1000});return token.access_token;}
 async request(path,options={}){const access=await this.access(),{response,body}=await this.raw(API+path,{...options,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',...(options.headers||{})}});if(!response.ok){const error=new AppError('GOOGLE_REQUEST','Não foi possível sincronizar com o Google Agenda. Tente novamente.',[401,403].includes(response.status)?409:response.status);error.googleStatus=response.status;throw error;}return body;}
 async calendarList(access){const result=[];let pageToken='';do{const params=new URLSearchParams({maxResults:'250'});if(pageToken)params.set('pageToken',pageToken);const {response,body}=await this.raw(API+'/users/me/calendarList?'+params,{headers:{Authorization:'Bearer '+access}});if(!response.ok)throw new AppError('GOOGLE_CALENDARS','Não foi possível listar os calendários autorizados.',502);for(const c of body.items||[])result.push({id:c.id,summary:c.summary||c.id,accessRole:c.accessRole,primary:!!c.primary});pageToken=body.nextPageToken||'';}while(pageToken);return result;}
 async disconnect(){this.windows.clear();this.monthLoads.clear();this.monthRetryAt.clear();this.seriesRefresh=0;const a=this.configured()?this.account():null;this.epoch++;this.controller?.abort();this.pending.clear();this.tickets.clear();this.db.prepare('DELETE FROM md_google_account WHERE owner=?').run(OWNER);if(a?.refresh_token){try{await this.fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:a.refresh_token}),signal:AbortSignal.timeout(8000),redirect:'error'});}catch{/* Local access is removed even while offline. */}}}
 async select(id){this.windows.clear();this.monthLoads.clear();this.monthRetryAt.clear();this.seriesRefresh=0;const startEpoch=this.epoch,a=this.account();if(!a)throw new AppError('GOOGLE_NOT_CONNECTED','Conecte o Google Agenda.');if(typeof id!=='string'||id.length>1024)throw new AppError('BAD_CALENDAR','Calendário inválido.');const calendars=await this.calendarList(await this.access()),selected=calendars.find(c=>c.id===id&&['owner','writer'].includes(c.accessRole));if(!selected)throw new AppError('GOOGLE_READ_ONLY','O calendário não permite edição.',403);if(startEpoch!==this.epoch)throw new AppError('CANCELLED','A conexão mudou durante a seleção.',409);this.epoch++;this.controller?.abort();const fresh=this.account();if(!fresh)throw new AppError('GOOGLE_NOT_CONNECTED','Conecte o Google Agenda.');fresh.meta={...fresh.meta,calendar_id:id,calendar_name:selected.summary,calendars,sync_token:'',last_sync:null,conflicts:[],error:''};this.write(fresh);this.schedule();}
 links(a){return this.db.prepare('SELECT * FROM md_google_links WHERE owner=? AND account_key=? AND calendar_id=?').all(OWNER,a.account_key,a.meta.calendar_id);}
 saveLink(a,entity,event,{isDeleted=false}={}){const localHash=entity?fingerprint(toGoogle(entity)):'';this.db.prepare('INSERT INTO md_google_links VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,account_key,calendar_id,local_id) DO UPDATE SET google_id=excluded.google_id,local_hash=excluded.local_hash,etag=excluded.etag,remote_hash=excluded.remote_hash,deleted=excluded.deleted').run(OWNER,a.account_key,a.meta.calendar_id,entity.id,event.id,localHash,event.etag||'',event.status==='cancelled'?'':fingerprint(event),isDeleted?1:0);}
 safeGet(id){try{return this.w.get(id);}catch(e){if(e.status===404||e.code==='NOT_FOUND')return null;throw e;}}
 async sync(){if(!this.configured()||!this.account())return;if(this.busy)return this.busy;const epoch=this.epoch;this.controller=new AbortController();this.busy=this.perform(epoch).catch(error=>{if(epoch!==this.epoch)return;const a=this.account();if(a){a.meta.error=error.code==='GOOGLE_AUTH'?'A autorização Google expirou. Reconecte a conta.':'A sincronização não terminou. Seus registros foram preservados; tente novamente.';this.write(a);}throw error;}).finally(()=>{this.busy=null;this.controller=null;});return this.busy;}
 cancelOccurrence(a,link,local,conflicts){
  if(link.deleted||deleted(local))return;
  if(fingerprint(toGoogle(local))!==link.local_hash){conflicts.push({id:local.id,reason:'Ocorrência removida no Google e editada na Sofia'});return;}
  this.applying=true;try{this.runtime.store.tx(()=>{const saved=this.w.save({revision:local.revision,state:'cancelled',data:{...local.data,sync_state:'synced'}},local.id);this.saveLink(a,saved,{id:link.google_id,status:'cancelled'},{isDeleted:true});});}finally{this.applying=false;}
 }
 requestMonth(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))throw new AppError('BAD_DATE','Mês inválido.');
  if(!this.configured()||!this.account()||this.windows.get(month)?.loaded)return false;
  if(this.monthLoads.has(month))return true;
  if(Date.now()<(this.monthRetryAt.get(month)||0))return false;
  // Reading the saved agenda must never wait for Google's network or full sync.
  // Collapse simultaneous requests from Home/Agenda into one background load.
  const job=this.ensureMonth(month).catch(()=>{this.monthRetryAt.set(month,Date.now()+30000);}).finally(()=>{if(this.monthLoads.get(month)===job)this.monthLoads.delete(month);});
  this.monthLoads.set(month,job);return !this.windows.get(month)?.loaded;
 }
 async ensureMonth(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))throw new AppError('BAD_DATE','Mês inválido.');
  if(!this.configured()||!this.account())return;
  const first=Date.parse(month+'-01T00:00:00Z'),end=new Date(first);end.setUTCMonth(end.getUTCMonth()+1);
  // Expand an overlap for device timezones and multi-day events.
  const range={min:new Date(first-2*86400000).toISOString(),max:new Date(end.getTime()+2*86400000).toISOString()};
  // Incremental sync refreshes changed series; the daily pass refreshes the
  // rolling window. Merely opening a screen must not invalidate it every 30s.
  const existing=this.windows.get(month);if(existing?.loaded)return;
  const year=new Date().getUTCFullYear();
  const covered=this.seriesRefresh&&Date.parse(range.min)>=Date.UTC(year-1,0,1)&&Date.parse(range.max)<=Date.UTC(year+3,0,1);
  if(covered){this.windows.set(month,{...range,loaded:this.seriesRefresh});return;}
  if(!existing)this.windows.set(month,{...range,loaded:0});
  if(this.busy)await this.busy;
  if(!this.windows.get(month)?.loaded)await this.sync();
 }
 async expandSeries(a,epoch,conflicts){
  const still=()=>{if(epoch!==this.epoch)throw new AppError('CANCELLED','Conexão alterada.',409);};
  const now=new Date(),year=now.getUTCFullYear();
  const primary={min:new Date(Date.UTC(year-1,0,1)).toISOString(),max:new Date(Date.UTC(year+3,0,1)).toISOString()},requested=[...this.windows.values()];
  const ranges=[primary,...requested.filter(range=>range.min<primary.min||range.max>primary.max)];
  const series=this.db.prepare('SELECT event FROM md_google_series WHERE owner=? AND account_key=? AND calendar_id=?').all(OWNER,a.account_key,a.meta.calendar_id);
  for(const row of series){const master=JSON.parse(row.event);for(const range of ranges){
   const events=[];let pageToken='';do{const params=new URLSearchParams({maxResults:'2500',showDeleted:'true',timeMin:range.min,timeMax:range.max});if(pageToken)params.set('pageToken',pageToken);
    const result=await this.request('/calendars/'+encodeURIComponent(a.meta.calendar_id)+'/events/'+encodeURIComponent(master.id)+'/instances?'+params);still();events.push(...result.items||[]);pageToken=result.nextPageToken||'';
   }while(pageToken);
   const links=this.links(a),byGoogle=new Map(links.map(link=>[link.google_id,link])),seen=new Set();
   for(const event of events){await yieldRequests();still();seen.add(event.id);const link=byGoogle.get(event.id),local=link?this.safeGet(link.local_id):null;
    if(event.status==='cancelled'){if(link&&local)this.cancelOccurrence(a,link,local,conflicts);continue;}
    if(link?.deleted||local?.privacy==='local')continue;
    if(!googleProjection(event).start||!googleProjection(event).end)continue;
    const remoteHash=fingerprint(event),localHash=local?fingerprint(toGoogle(local)):'';
    if(link&&remoteHash===link.remote_hash){if(link.etag!==event.etag)this.db.prepare('UPDATE md_google_links SET etag=? WHERE owner=? AND account_key=? AND calendar_id=? AND local_id=?').run(event.etag||'',OWNER,a.account_key,a.meta.calendar_id,link.local_id);continue;}
    if(link&&(!local||deleted(local)||localHash!==link.local_hash)&&localHash!==remoteHash){conflicts.push({id:link.local_id,reason:'Mudanças simultâneas nesta ocorrência'});continue;}
    this.applying=true;try{this.runtime.store.tx(()=>{const saved=this.w.save(fromGoogle(event,local,a.meta.calendar_id),local?.id);this.saveLink(a,saved,event);});}finally{this.applying=false;}
   }
   // Reconcile removed occurrences after a COUNT/UNTIL/rule change, only in the fully fetched window.
   for(const link of links){await yieldRequests();still();const local=this.safeGet(link.local_id);if(!local||local.data.calendar_recurring_id!==master.id||seen.has(link.google_id))continue;
    const start=local.data.calendar_all_day?local.data.calendar_date_start+'T12:00:00Z':local.data.start_at||local.data.remind_at,end=local.data.end_at||start;
    if(Date.parse(start)>=Date.parse(range.min)&&Date.parse(start)<Date.parse(range.max)&&Date.parse(end)>Date.parse(range.min))this.cancelOccurrence(a,link,local,conflicts);
   }
  }}
  // A distant month requested after this snapshot must not be marked loaded.
  for(const range of requested)range.loaded=Date.now();
 }
 async perform(epoch){
  const a=this.account();if(!a)return;const cal=encodeURIComponent(a.meta.calendar_id),base='/calendars/'+cal+'/events';const still=()=>{if(this.epoch!==epoch)throw new AppError('CANCELLED','Conexão alterada durante a sincronização.',409);};
  // Conflict snapshots contain IDs only; no body or credentials in public status.
  const conflicts=[],warnings=[],remote=[];let syncToken=a.meta.recurrence_version===1?(a.meta.sync_token||''):'',nextToken='',retried=false;
  for(;;){try{let pageToken='';remote.length=0;do{const params=new URLSearchParams({maxResults:'2500',showDeleted:'true',singleEvents:'false'});if(syncToken)params.set('syncToken',syncToken);if(pageToken)params.set('pageToken',pageToken);const result=await this.request(base+'?'+params);still();remote.push(...result.items||[]);pageToken=result.nextPageToken||'';nextToken=result.nextSyncToken||nextToken;}while(pageToken);break;}catch(e){if(e.googleStatus===410&&!retried){syncToken='';warnings.length=0;retried=true;continue;}throw e;}}
  const mappings=this.links(a),byGoogle=new Map(mappings.map(link=>[link.google_id,link])),conflictIds=new Set();let recurring=0,unsupported=0;let seriesChanged=false;
  for(const event of remote){await yieldRequests();still();const link=byGoogle.get(event.id),local=link?this.safeGet(link.local_id):null;
   if(event.recurrence?.length){const previous=this.db.prepare('SELECT event FROM md_google_series WHERE owner=? AND account_key=? AND calendar_id=? AND google_id=?').get(OWNER,a.account_key,a.meta.calendar_id,event.id);if(!previous||JSON.parse(previous.event).etag!==event.etag)seriesChanged=true;this.db.prepare('INSERT INTO md_google_series VALUES(?,?,?,?,?) ON CONFLICT(owner,account_key,calendar_id,google_id) DO UPDATE SET event=excluded.event').run(OWNER,a.account_key,a.meta.calendar_id,event.id,JSON.stringify(event));recurring++;continue;}
   if(event.recurringEventId){seriesChanged=true;continue;} // Instances (including exceptions) come from Google's bounded expansion.
   if(event.status==='cancelled'&&this.db.prepare('SELECT google_id FROM md_google_series WHERE owner=? AND account_key=? AND calendar_id=? AND google_id=?').get(OWNER,a.account_key,a.meta.calendar_id,event.id)){
    seriesChanged=true;this.db.prepare('DELETE FROM md_google_series WHERE owner=? AND account_key=? AND calendar_id=? AND google_id=?').run(OWNER,a.account_key,a.meta.calendar_id,event.id);
    for(const mapping of this.links(a)){await yieldRequests();still();const occurrence=this.safeGet(mapping.local_id);if(occurrence?.data.calendar_recurring_id===event.id)this.cancelOccurrence(a,mapping,occurrence,conflicts);}continue;
   }
   if(event.status==='cancelled'){
    if(!link||link.deleted)continue;
    if(local&&!deleted(local)&&fingerprint(toGoogle(local))!==link.local_hash){conflicts.push({id:local.id,reason:'Exclusão no Google e edição na Sofia'});conflictIds.add(local.id);continue;}
    if(local){this.applying=true;try{this.runtime.store.tx(()=>{const cancelled=this.w.save({revision:local.revision,state:'cancelled',data:{...local.data,sync_state:'synced'}},local.id);this.saveLink(a,cancelled,event,{isDeleted:true});});}finally{this.applying=false;}}
    else this.db.prepare('UPDATE md_google_links SET deleted=1 WHERE owner=? AND account_key=? AND calendar_id=? AND local_id=?').run(OWNER,a.account_key,a.meta.calendar_id,link.local_id);
    continue;
   }
   const projected=googleProjection(event);if(!projected.start||!projected.end){unsupported++;continue;}
   if(link?.deleted)continue; // Never resurrect an intentionally deleted local event.
   if(local?.privacy==='local'){conflictIds.add(local.id);continue;}
   const remoteChanged=!link||fingerprint(event)!==link.remote_hash,localChanged=!!link&&(!local||deleted(local)||fingerprint(toGoogle(local))!==link.local_hash);
   if(link&&local&&!deleted(local)&&fingerprint(event)===fingerprint(toGoogle(local))){if(link.local_hash!==fingerprint(toGoogle(local))||link.remote_hash!==fingerprint(event)||link.etag!==(event.etag||''))this.saveLink(a,local,event);continue;}
   if(link&&remoteChanged&&localChanged){conflicts.push({id:link.local_id,reason:'Mudanças simultâneas nos dois calendários'});conflictIds.add(link.local_id);continue;}
   if(link&&!remoteChanged){if(event.etag!==link.etag)this.db.prepare('UPDATE md_google_links SET etag=? WHERE owner=? AND account_key=? AND calendar_id=? AND local_id=?').run(event.etag,OWNER,a.account_key,a.meta.calendar_id,link.local_id);continue;}
   if(link&&!local)continue;
   this.applying=true;try{this.runtime.store.tx(()=>{const saved=this.w.save(fromGoogle(event,local,a.meta.calendar_id),local?.id);this.saveLink(a,saved,event);});}finally{this.applying=false;}
  }
  if(seriesChanged||Date.now()-this.seriesRefresh>86400000||[...this.windows.values()].some(range=>!range.loaded)){await this.expandSeries(a,epoch,conflicts);this.seriesRefresh=Date.now();}
  for(const conflict of conflicts)conflictIds.add(conflict.id);
  // Fresh mappings and records after import prevent a stale revision from overwriting an edit.
  const currentLinks=this.links(a),byLocal=new Map(currentLinks.map(link=>[link.local_id,link]));
  const ids=this.db.prepare("SELECT id FROM entities WHERE owner=? AND kind IN ('commitment','reminder')").all(OWNER);
  const toPush=new Map();for(const row of ids){await yieldRequests();still();const e=this.w.get(row.id);toPush.set(e.id,e);}
  for(const link of currentLinks)if(!toPush.has(link.local_id))toPush.set(link.local_id,null);
  for(const [id,entity] of toPush){await yieldRequests();still();const link=byLocal.get(id);if(conflictIds.has(id)||link?.deleted||entity?.privacy==='local')continue;
   if(entity?.data.external_event_id&&!link)continue; // Imported from another account/calendar: never copy it silently.
   if(deleted(entity)){
    if(entity?.data.calendar_recurring_id)this.seriesRefresh=0;
    if(!link)continue;try{await this.request(base+'/'+encodeURIComponent(link.google_id),{method:'DELETE',headers:{'If-Match':link.etag}});}catch(e){if(e.googleStatus===412){conflicts.push({id,reason:'Evento alterado no Google durante a exclusão'});continue;}if(![404,410].includes(e.googleStatus))throw e;}still();this.db.prepare('UPDATE md_google_links SET deleted=1 WHERE owner=? AND account_key=? AND calendar_id=? AND local_id=?').run(OWNER,a.account_key,a.meta.calendar_id,id);continue;
   }
   const payload=toGoogle(entity);if(!payload)continue;const localHash=fingerprint(payload);if(link&&link.local_hash===localHash)continue;
   const googleId=link?.google_id||'sf'+hash(OWNER+'|'+a.account_key+'|'+a.meta.calendar_id+'|'+id).slice(0,48);
   let saved;
   try{saved=await this.request(base+(link?'/'+encodeURIComponent(googleId):''),{method:link?'PATCH':'POST',headers:link?{'If-Match':link.etag}:{},body:JSON.stringify(link?payload:{...payload,id:googleId,extendedProperties:{private:{sofiaId:id}}})});}
   catch(e){if(e.googleStatus===412){conflicts.push({id,reason:'Evento alterado no Google durante a gravação'});continue;}
    if(e.googleStatus===409&&!link){saved=await this.request(base+'/'+googleId);if(fingerprint(saved)!==localHash){conflicts.push({id,reason:'Revisar tentativa anterior de envio'});continue;}}
    else if(e.googleStatus===404&&link){conflicts.push({id,reason:'Evento removido no Google durante a edição'});continue;}else throw e;
   }
   still();if(entity?.data.calendar_recurring_id)this.seriesRefresh=0;const fresh=this.safeGet(id);if(!fresh||fresh.revision!==entity.revision){
    // Keep the identity of the exported snapshot even if the user edited/deleted
    // the local record while Google was responding. The next pass patches or
    // deletes this exact remote record instead of importing a duplicate.
    this.saveLink(a,entity,saved);this.schedule();continue;
   }
   this.applying=true;try{this.runtime.store.tx(()=>{const marked=this.w.save({revision:fresh.revision,data:{...fresh.data,calendar_provider:'google',calendar_id:a.meta.calendar_id,external_event_id:saved.id,sync_state:'synced'}},id);this.saveLink(a,marked,saved);});}finally{this.applying=false;}
  }
  still();const fresh=this.account();if(!fresh)return;
  
  if(unsupported)warnings.push('Há tipos especiais de evento que permanecem no Google.');
  // Keep the previous token while conflicts exist, so a retry cannot forget remote changes.
  fresh.meta={...fresh.meta,last_sync:stamp(),error:'',conflicts,warnings:[...new Set(warnings)],sync_token:conflicts.length?syncToken:nextToken||syncToken,recurrence_version:1};this.write(fresh);
 }
}
module.exports={GoogleCalendarSync,encrypt,decrypt,toGoogle,fromGoogle,googleProjection,fingerprint};
