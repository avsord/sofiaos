'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');
const {makeMercadoLivreReader}=require('../src/services/mercado-livre');
const {identity,pins}=require('../src/services/mercado-livre-identity');
const LINK='https://www.mercadolivre.com.br/p/MLB42258825?matt_tool=38524122&pdp_filters=item_id:MLB5296520523#origin=share&wid=MLB5296520523';
const FIXTURE=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/services/stores/fixture-oferta-sanitizada.json'),'utf8'));
const html=()=>'<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r='+JSON.stringify(FIXTURE)+'</script>';
const PIN={provider:'mercadolivre',itemId:'MLB5296520523',catalogProductId:'MLB42258825',identityKey:'mercadolivre:MLB5296520523',sellerId:'427963557',sellerName:'TechPrime',normalizedUrl:'https://www.mercadolivre.com.br/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523'};
const makeMonitor=f=>f.workspace.save({kind:'monitor',title:'Produto de teste',area:'Pessoal',privacy:'private',state:'active',data:{method:'product',variant:'Preto',currency:'BRL',preferred_url:LINK,new_low:true}});
const success=async()=>new Response(html(),{headers:{'Content-Type':'text/html'}});
async function setup(t,fetchImpl=success){
 const f=fixture(t);f.config.loginPassword='integration-test-password-only';f.config.loginEmail='owner@example.com';
 const r=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure'),mercadoLivreOptions:{fetchImpl,minIntervalMs:0}});
 const server=http.createServer(r.handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const request=async(body,token='',headers={})=>{const res=await fetch(base+'/api/mobile/price-tracker/mercadolivre/read',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
 const res=await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:f.config.loginPassword})});
 const {token}=await res.json();assert.ok(token);
 return {...f,...r,request,token};
}
test('ML route: requires existing mobile bearer, refuses cross origin before external request',async t=>{
 let calls=0;const f=await setup(t,async()=>{calls++;return success();});
 assert.equal((await f.request({link:LINK})).status,401);
 assert.equal((await f.request({link:LINK},f.token,{Origin:'https://evil.invalid'})).status,403);
 assert.equal(calls,0);
});
test('ML route: authenticates, parses actual fixture and returns selected offer without writing history',async t=>{
 const calls=[];const f=await setup(t,async(u,init)=>{calls.push({u,init});return success();});const mon=makeMonitor(f);
 const r=await f.request({link:LINK,monitorId:mon.id},f.token);
 assert.equal(r.status,200);assert.equal(r.body.ok,true,JSON.stringify(r.body));
 assert.equal(r.body.reading.itemId,'MLB5296520523');assert.equal(r.body.reading.seller.id,'427963557');assert.equal(r.body.reading.amountCents,141283);
 assert.ok(Number.isFinite(Date.parse(r.body.reading.observedAt)));assert.equal(calls.length,1);
 assert.match(calls[0].u,/pdp_filters=item_id%3AMLB5296520523/);assert.equal(calls[0].init.redirect,'manual');
 assert.ok(!JSON.stringify(calls[0].init.headers).includes(f.token));assert.equal(f.workspace.observations(mon.id).length,0);
});
test('ML route: validates types/options and never allows client cookies, headers, fetch URL or truthy boolean',async t=>{
 let calls=0;const f=await setup(t,async()=>{calls++;return success();});
 for(const body of [{link:LINK,headers:{Cookie:'x'}},{link:LINK,allowCatalogWinner:'false'},{link:LINK,expectedSellerId:{}},{link:'x'.repeat(8193)},{link:LINK,fetchImpl:'bad'}]){
  const r=await f.request(body,f.token);assert.equal(r.body.ok,false);
 }
 assert.equal(calls,0);
});
test('ML route: paused/non-owner/missing source never fetches',async t=>{
 let calls=0;const f=await setup(t,async()=>{calls++;return success();});const mon=makeMonitor(f);
 f.workspace.save({...mon,state:'paused'},mon.id);
 assert.equal((await f.request({link:LINK,monitorId:mon.id},f.token)).body.code,'MONITOR_PAUSED');
 assert.equal((await f.request({link:LINK,monitorId:'not-existing'},f.token)).body.code,'MONITOR_UNAVAILABLE');
});
test('ML reading: preserves source/observations and pins seller atomically with the saved price',async t=>{
 const f=fixture(t);f.workspace=f.core.workspace;const mon=makeMonitor(f);
 const before=f.workspace.observe(mon.id,{price:1500,variant:'Preto',currency:'BRL',source:LINK,source_key:'old'});
 f.workspace.observe(mon.id,{price:1412.83,variant:'Preto',currency:'BRL',source:LINK,source_key:'new',source_identity:PIN});
 const updated=f.workspace.get(mon.id);assert.equal(updated.data.preferred_url,LINK);
 assert.equal(pins(updated.data.source_identities)[LINK].sellerId,'427963557');
 assert.equal(f.workspace.observations(mon.id)[0].id,before.id);assert.equal(f.workspace.observations(mon.id).length,2);
 assert.throws(()=>f.workspace.observe(mon.id,{price:1200,variant:'Preto',currency:'BRL',source:LINK,source_identity:{...PIN,sellerId:'999999'}}),e=>e.code==='SELLER_MISMATCH');
 assert.equal(f.workspace.observations(mon.id).length,2);
});
test('ML metadata: unrelated edit from legacy client cannot remove the pin or change its identity',async t=>{
 const f=fixture(t);const w=f.core.workspace;const mon=w.save({kind:'monitor',title:'Teste',state:'active',data:{method:'product',variant:'Preto',preferred_url:LINK,source_identities:JSON.stringify({[LINK]:PIN})}});
 const data={...mon.data};delete data.source_identities;
 const edited=w.save({...mon,title:'Renomeado',data},mon.id);
 assert.equal(pins(edited.data.source_identities)[LINK].itemId,PIN.itemId);
 assert.throws(()=>w.save({...edited,data:{...edited.data,source_identities:JSON.stringify({[LINK]:{...PIN,sellerId:'9999'}})}},mon.id),e=>e.code==='SELLER_MISMATCH');
});
for(const status of [401,403,404,429,500])test('ML route: HTTP '+status+' preserves history without another provider/browser',async t=>{
 let calls=0;const f=await setup(t,async()=>{calls++;return new Response('',{status});});const mon=makeMonitor(f);
 const old=f.workspace.observe(mon.id,{price:1500,source:LINK,variant:'Preto',currency:'BRL'});
 const r=await f.request({link:LINK,monitorId:mon.id},f.token);
 assert.equal(r.body.ok,false);assert.equal(r.body.keepLastPrice,true);assert.equal(calls,1);
 assert.equal(f.workspace.observations(mon.id).length,1);assert.equal(f.workspace.observations(mon.id)[0].id,old.id);
});
test('ML service: cancellation already signalled never reaches network',async()=>{
 let calls=0;const r=makeMercadoLivreReader({fetchImpl:async()=>{calls++;return success();},minIntervalMs:0});const c=new AbortController();c.abort();
 assert.equal((await r.read({link:LINK},{signal:c.signal})).code,'CANCELLED');assert.equal(calls,0);
});
test('ML service: a pause during HTTP discards the completed read',async t=>{
 const f=fixture(t);const w=f.core.workspace,mon=makeMonitor({workspace:w});let release,started;
 const ready=new Promise(ok=>started=ok);
 const service=makeMercadoLivreReader({workspace:w,minIntervalMs:0,fetchImpl:()=>{started();return new Promise(ok=>release=ok);}});
 const reading=service.read({link:LINK,monitorId:mon.id});await ready;
 w.save({...mon,state:'paused'},mon.id);release(await success());
 assert.equal((await reading).code,'MONITOR_PAUSED');assert.equal(w.observations(mon.id).length,0);
 assert.throws(()=>w.observe(mon.id,{price:1412.83,source:LINK,variant:'Preto',currency:'BRL'}),e=>e.code==='MONITOR_PAUSED');
});
test('ML service: one request per owner and bounded admission',async()=>{
 let release,started;const ready=new Promise(ok=>started=ok);
 const service=makeMercadoLivreReader({minIntervalMs:0,maxPending:1,fetchImpl:()=>{started();return new Promise(ok=>release=ok);}});
 const first=service.read({link:LINK},{accountKey:'A'});await ready;
 assert.equal((await service.read({link:LINK},{accountKey:'A'})).code,'BUSY');
 assert.equal((await service.read({link:LINK},{accountKey:'B'})).code,'BUSY');
 release(await success());assert.equal((await first).ok,true);
});
test('ML route: catalog-only is adopted only in explicit add preview, not ongoing collection',async t=>{
 const f=await setup(t);const url='https://www.mercadolivre.com.br/p/MLB42258825';
 assert.equal((await f.request({link:url},f.token)).body.code,'ITEM_REQUIRED');
 assert.equal((await f.request({link:url,allowCatalogWinner:true},f.token)).body.reading.itemSelectedBy,'store_buy_box');
 const m=f.workspace.save({kind:'monitor',title:'Catalog',state:'active',data:{method:'product',preferred_url:url,variant:'Preto'}});
 assert.equal((await f.request({link:url,monitorId:m.id,allowCatalogWinner:true},f.token)).body.code,'ITEM_REQUIRED');
});
test('ML network: external redirect is rejected before any second request',async t=>{
 let calls=0;const f=await setup(t,async()=>{calls++;return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}});});
 const r=await f.request({link:LINK},f.token);assert.equal(r.body.code,'UNSAFE_REDIRECT');assert.equal(calls,1);
});

// Full entity saves from existing screens still include the old identities.
test('ML metadata: removing a store drops its pin without rejecting the save or deleting history',async t=>{
 const f=fixture(t),w=f.core.workspace;
 const mon=w.save({kind:'monitor',title:'Removal',state:'active',data:{method:'product',variant:'Preto',preferred_url:LINK,source_urls:'https://www.kabum.com.br/p/1',source_identities:JSON.stringify({[LINK]:PIN})}});
 const row=w.observe(mon.id,{price:1400,variant:'Preto',currency:'BRL',source:LINK});
 const edited=w.save({...mon,data:{...mon.data,preferred_url:'https://www.kabum.com.br/p/1',source_urls:''}},mon.id);
 assert.deepEqual(pins(edited.data.source_identities),{});
 assert.equal(w.observations(mon.id)[0].id,row.id);
});
