'use strict';
// Integration tests use temporary in-memory SQLite and a fake Google transport.
// They never read a live user account or make real external requests.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Store,OWNER}=require('../src/memory/store');
const {Workspace}=require('../src/core/workspace');
const {installFields,computeMove,getMdRuntime,makeMdApi}=require('../src/core/md-api');
const {GoogleCalendarSync,encrypt,decrypt,toGoogle,fromGoogle,fingerprint}=require('../src/services/google-calendar-sync');
const ENV={GOOGLE_CALENDAR_CLIENT_ID:'fixture-client',GOOGLE_CALENDAR_CLIENT_SECRET:'fixture-secret',SOFIA_CALENDAR_TOKEN_KEY:Buffer.alloc(32,7).toString('base64')};
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(t){installFields();const store=new Store(':memory:'),workspace=new Workspace(store),runtime={store,workspace,config:{publicBaseUrl:'https://sofia.example'}};t.after(()=>{runtime[Symbol.for('sofia.md.upgrade')]?.calendar.close();store.close();});return runtime;}
function makePage(w,title,parent=''){return w.save({kind:'user_page',title,privacy:'private',data:{parent_id:parent,icon:'🖤',blocks_json:'[{"type":"text","text":"Preservar conteúdo"}]'}});}
function event(w,title='Evento',extra={}){return w.save({kind:'commitment',title,privacy:'private',data:{start_at:'2026-10-03T12:00:00Z',end_at:'2026-10-03T13:00:00Z'},...extra});}
function fakeGoogle(){
 const events=new Map(),calls=[];let seq=0,onPost=null;
 const out=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 async function transport(url,options={}){const u=new URL(url),method=options.method||'GET';calls.push({url,method,headers:copy(options.headers||{}),body:options.body});
  if(u.hostname==='oauth2.googleapis.com'){if(u.pathname==='/revoke')return out({});return out({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600});}
  if(u.pathname.endsWith('/users/me/calendarList'))return out({items:[{id:'owner@example.test',summary:'Agenda teste',primary:true,accessRole:'owner'}]});
  const match=u.pathname.match(/\/events(?:\/([^/]+))?$/);assert.ok(match,'Unknown fake URL '+url);
  const id=match[1]?decodeURIComponent(match[1]):null;
  if(method==='GET'&&!id)return out({items:[...events.values()].map(copy),nextSyncToken:'sync-'+seq});
  if(method==='POST'){const b=JSON.parse(options.body);if(events.has(b.id))return out({},409);const saved={...b,etag:'"'+(++seq)+'"'};events.set(b.id,saved);if(onPost){const fn=onPost;onPost=null;fn();}return out(copy(saved));}
  const existing=events.get(id);if(!existing)return out({},404);
  if(options.headers?.['If-Match']&&options.headers['If-Match']!==existing.etag)return out({},412);
  if(method==='GET')return out(copy(existing));
  if(method==='PATCH'){const saved={...existing,...JSON.parse(options.body),etag:'"'+(++seq)+'"'};events.set(id,saved);return out(copy(saved));}
  if(method==='DELETE'){events.set(id,{id,status:'cancelled',etag:'"'+(++seq)+'"'});return out(null,204);}
  throw Error('Unknown method '+method);
 }
 return {events,calls,transport,onPost(fn){onPost=fn;},remoteEdit(id,changes){const updated={...events.get(id),...changes,etag:'"'+(++seq)+'"'};events.set(id,updated);return updated;}};
}
function syncFixture(t){const runtime=setup(t),google=fakeGoogle(),sync=new GoogleCalendarSync(runtime,{env:ENV,fetchImpl:google.transport});t.after(()=>sync.close());sync.schedule=()=>{};sync.write({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Date.now()+3600000,account_key:'fixture-account',meta:{calendar_id:'owner@example.test',calendar_name:'Agenda teste',sync_token:''}});return {...runtime,google,sync};}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};}

test('MD1: atomic move reorders siblings without changing page identity or content',t=>{
 const r=setup(t),a=makePage(r.workspace,'A'),b=makePage(r.workspace,'B'),c=makePage(r.workspace,'C');const service=getMdRuntime(r);service.calendar.close();
 const out=service.move({id:c.id,revision:c.revision,kind:'before',parentId:'',anchorId:a.id});assert.deepEqual(out.items.map(x=>x.id),[c.id,a.id,b.id]);
 for(const original of [a,b,c]){const saved=r.workspace.get(original.id);assert.equal(saved.title,original.title);assert.equal(saved.data.icon,original.data.icon);assert.equal(saved.data.blocks_json,original.data.blocks_json);}
 assert.deepEqual(out.items.map(x=>x.data.sort_order),[1024,2048,3072]);
});
test('MD1: stale source revision and stale parent targets cannot overwrite concurrent changes',t=>{
 const r=setup(t),a=makePage(r.workspace,'A'),b=makePage(r.workspace,'B');const service=getMdRuntime(r);service.calendar.close();r.workspace.save({revision:b.revision,title:'Nome novo'},b.id);
 assert.throws(()=>service.move({id:b.id,revision:b.revision,kind:'inside',parentId:a.id,anchorId:a.id}),e=>e.code==='REVISION_CONFLICT');assert.equal(r.workspace.get(b.id).title,'Nome novo');
 assert.throws(()=>computeMove([a,b],{id:b.id,revision:b.revision,kind:'before',parentId:a.id,anchorId:a.id}),e=>e.code==='STALE_DROP');
});
test('MD1: cyclic nesting is rejected and no page disappears',t=>{
 const r=setup(t),a=makePage(r.workspace,'A'),b=makePage(r.workspace,'B',a.id);const service=getMdRuntime(r);service.calendar.close();
 assert.throws(()=>service.move({id:a.id,revision:a.revision,kind:'inside',parentId:b.id,anchorId:b.id}),e=>e.code==='PAGE_CYCLE');assert.equal(r.workspace.list({kind:'user_page'}).length,2);
});
test('MD4: authenticated encryption detects tampering and hides access tokens',()=>{
 const key=crypto.randomBytes(32),value={refresh_token:'fixture-sensitive-value'},encoded=encrypt(value,key);assert.ok(!encoded.includes(value.refresh_token));assert.deepEqual(decrypt(encoded,key),value);
 const bad=Buffer.from(encoded,'base64');bad[bad.length-1]^=1;assert.throws(()=>decrypt(bad.toString('base64'),key));
});
test('MD4: missing server credentials give truthful disconnected status',t=>{
 const r=setup(t),sync=new GoogleCalendarSync(r,{env:{},fetchImpl:async()=>{throw Error('Network must not be called');}});t.after(()=>sync.close());assert.deepEqual(sync.status(),{configured:false,connected:false});assert.throws(()=>sync.createTicket(),e=>e.code==='GOOGLE_SETUP');
});
test('MD4: one-time browser ticket starts OAuth with PKCE and a secure state cookie',async t=>{
 const {sync}=syncFixture(t),ticket=sync.createTicket(),res=response(),url=new URL(ticket.url);await sync.publicRoute({headers:{}},res,url.pathname,'GET',url);
 const authorize=new URL(res.headers.Location);assert.equal(authorize.hostname,'accounts.google.com');assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');assert.equal(authorize.searchParams.get('access_type'),'offline');assert.match(res.headers['Set-Cookie'],/HttpOnly; SameSite=Lax;.*Secure/);
 await assert.rejects(()=>sync.publicRoute({headers:{}},response(),url.pathname,'GET',url),e=>e.code==='OAUTH_EXPIRED');
});
test('MD4: OAuth callback without matching browser cookie is denied',async t=>{
 const {sync,google}=syncFixture(t),url=new URL(sync.createTicket().url),res=response();await sync.publicRoute({headers:{}},res,url.pathname,'GET',url);const state=new URL(res.headers.Location).searchParams.get('state');
 const callback=new URL('https://sofia.example/oauth/google/calendar/callback?state='+state+'&code=fixture-code');await assert.rejects(()=>sync.publicRoute({headers:{}},response(),callback.pathname,'GET',callback),e=>e.code==='OAUTH_STATE');assert.equal(google.calls.length,0);
});
test('MD4: timed and all-day event projections preserve timezone/date semantics',t=>{
 const r=setup(t),timed=event(r.workspace);assert.equal(toGoogle(timed).start.dateTime,'2026-10-03T12:00:00.000Z');
 const all={...timed,data:{calendar_all_day:true,calendar_date_start:'2026-10-03',calendar_date_end:'2026-10-05'}};assert.deepEqual(toGoogle(all).start,{date:'2026-10-03'});assert.deepEqual(toGoogle(all).end,{date:'2026-10-05'});
 const imported=fromGoogle({...toGoogle(all),id:'fake-google'},null,'fake-calendar');assert.equal(imported.data.calendar_date_end,'2026-10-05');assert.equal(imported.data.calendar_all_day,true);assert.equal(fingerprint(toGoogle(all)),fingerprint(toGoogle(imported)));
 assert.equal(toGoogle({...timed,data:{start_at:'not-a-date'}}),null);
});
test('MD4: repeated sync exports one local event once, then patches the same remote ID',async t=>{
 const r=syncFixture(t),e=event(r.workspace);await r.sync.sync();await r.sync.sync();assert.equal(r.google.events.size,1);assert.equal(r.google.calls.filter(c=>c.method==='POST').length,1);
 let local=r.workspace.get(e.id);r.workspace.save({revision:local.revision,title:'Título alterado'},e.id);await r.sync.sync();assert.equal(r.google.events.size,1);assert.equal([...r.google.events.values()][0].summary,'Título alterado');assert.ok(r.google.calls.some(c=>c.method==='PATCH'&&c.headers['If-Match']));
});
test('MD4: Google edits update the local event; Google deletion cancels it without erasing other data',async t=>{
 const r=syncFixture(t),e=event(r.workspace),p=makePage(r.workspace,'Página preservada');await r.sync.sync();const id=[...r.google.events.keys()][0];r.google.remoteEdit(id,{summary:'Alterado no Google',start:{dateTime:'2026-10-04T12:00:00Z'},end:{dateTime:'2026-10-04T13:00:00Z'}});await r.sync.sync();assert.equal(r.workspace.get(e.id).title,'Alterado no Google');assert.equal(r.workspace.get(e.id).data.start_at,'2026-10-04T12:00:00.000Z');
 r.google.remoteEdit(id,{status:'cancelled'});await r.sync.sync();assert.equal(r.workspace.get(e.id).state,'cancelled');assert.equal(r.workspace.get(p.id).title,p.title);
});
test('MD4: local deletion deletes only the mapped Google event and does not reimport it',async t=>{
 const r=syncFixture(t),e=event(r.workspace);await r.sync.sync();r.workspace.deleteEntity(e.id);await r.sync.sync();await r.sync.sync();assert.equal([...r.google.events.values()][0].status,'cancelled');assert.equal(r.workspace.list({kind:'commitment'}).length,0);
});
test('MD4: simultaneous edits become a conflict instead of silently overwriting either side',async t=>{
 const r=syncFixture(t),e=event(r.workspace);await r.sync.sync();const local=r.workspace.get(e.id),id=[...r.google.events.keys()][0];r.workspace.save({revision:local.revision,title:'Local novo'},e.id);r.google.remoteEdit(id,{summary:'Google novo'});await r.sync.sync();
 assert.equal(r.workspace.get(e.id).title,'Local novo');assert.equal(r.google.events.get(id).summary,'Google novo');assert.equal(r.sync.status().conflicts.length,1);await r.sync.sync();assert.equal(r.sync.status().conflicts.length,1);
});
test('MD4: records explicitly marked local never leave Sofia',async t=>{
 const r=syncFixture(t);event(r.workspace,'Somente local',{privacy:'local'});await r.sync.sync();assert.equal(r.google.events.size,0);
});
test('MD4: editing while first export is in flight retains mapping and never imports a duplicate',async t=>{
 const r=syncFixture(t),e=event(r.workspace);r.google.onPost(()=>{const current=r.workspace.get(e.id);r.workspace.save({revision:current.revision,title:'Mudou durante envio'},e.id);});await r.sync.sync();assert.equal(r.sync.links(r.sync.account()).length,1);await r.sync.sync();assert.equal(r.workspace.list({kind:'commitment'}).length,1);assert.equal(r.google.events.size,1);assert.equal([...r.google.events.values()][0].summary,'Mudou durante envio');
});
test('MD4: deleting while first export is in flight removes the exact remote record on retry',async t=>{
 const r=syncFixture(t),e=event(r.workspace);r.google.onPost(()=>r.workspace.deleteEntity(e.id));await r.sync.sync();await r.sync.sync();assert.equal([...r.google.events.values()][0].status,'cancelled');assert.equal(r.workspace.list({kind:'commitment'}).length,0);
});

test('MD4: disconnect removes authorization but preserves synced entities',async t=>{
 const r=syncFixture(t),e=event(r.workspace);await r.sync.sync();await r.sync.disconnect();assert.equal(r.sync.status().connected,false);assert.equal(r.workspace.get(e.id).title,e.title);assert.equal(r.google.calls.at(-1).url,'https://oauth2.googleapis.com/revoke');
});
test('MD6: notification pagination exposes all rows and clearing notices never deletes events',async t=>{
 const r=setup(t),e=event(r.workspace),service=getMdRuntime(r);service.calendar.close();for(let i=0;i<235;i++)r.workspace.notify('agenda','Aviso '+i,'Corpo',e.id);
 let result;const api=makeMdApi(r,{bodyJson:async()=>({}),json:(_res,_status,value)=>{result=value;}});await api({},response(),'/api/md/notifications','GET',new URL('http://localhost/?offset=0'));assert.equal(result.items.length,100);assert.equal(result.next_offset,100);assert.ok(result.unread>=235);
 await api({},response(),'/api/md/notifications','GET',new URL('http://localhost/?offset=200'));assert.ok(result.items.length>=35);assert.equal(result.next_offset,null);
 await api({},response(),'/api/md/notifications/all','DELETE',new URL('http://localhost/'));assert.equal(r.workspace.notifications().length,0);assert.equal(r.workspace.get(e.id).title,e.title);
});


test('MD4: expired Google authorization never impersonates an expired Sofia session',async t=>{
 const runtime=setup(t),sync=new GoogleCalendarSync(runtime,{env:ENV,fetchImpl:async()=>new Response(JSON.stringify({error:'invalid_grant'}),{status:400})});
 t.after(()=>sync.close());
 await assert.rejects(()=>sync.token({grant_type:'refresh_token',refresh_token:'invalid-fixture'}),e=>e.code==='GOOGLE_AUTH'&&e.status===409);
});
test('MD4: callback base accepts HTTPS or local HTTP, never other protocols',t=>{
 const runtime=setup(t);runtime.config.publicBaseUrl='ftp://localhost';const sync=new GoogleCalendarSync(runtime,{env:ENV});t.after(()=>sync.close());assert.equal(sync.configured(),false);
});

// Large initial imports must keep foreground requests responsive.
test('Google import yields to foreground work while preserving every event',async t=>{
 const r=syncFixture(t);for(let i=0;i<160;i++)r.google.events.set('remote'+i,{id:'remote'+i,etag:'"1"',summary:'Event '+i,start:{dateTime:'2026-10-06T12:00:00Z'},end:{dateTime:'2026-10-06T13:00:00Z'}});
 let imported=0,foregroundDuringImport=false;const original=r.workspace.save.bind(r.workspace);r.workspace.save=(...args)=>{const result=original(...args);imported++;if(imported===1)setImmediate(()=>{foregroundDuringImport=imported<160;});return result;};
 await r.sync.sync();assert.equal(imported,160);assert.equal(foregroundDuringImport,true);assert.equal(r.workspace.list({kind:'commitment',limit:500}).length,160);
 let linksWritten=0;const saveLink=r.sync.saveLink.bind(r.sync);r.sync.saveLink=(...args)=>{linksWritten++;return saveLink(...args);};await r.sync.sync();assert.equal(imported,160);assert.equal(linksWritten,0);
});
test('Calendar disconnect during a yielded import stops remaining writes',async t=>{
 const r=syncFixture(t);for(let i=0;i<30;i++)r.google.events.set('remote'+i,{id:'remote'+i,etag:'"1"',summary:'Event '+i,start:{dateTime:'2026-10-06T12:00:00Z'},end:{dateTime:'2026-10-06T13:00:00Z'}});
 let imported=0;const original=r.workspace.save.bind(r.workspace);r.workspace.save=(...args)=>{const result=original(...args);if(++imported===1)setImmediate(()=>void r.sync.disconnect());return result;};
 await r.sync.sync();assert.equal(imported,1);assert.equal(r.sync.status().connected,false);
});
