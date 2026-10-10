'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');
const PASSWORD='home-compat-fixture-only-152';

async function setup(t){
 const f=fixture(t);f.config.loginPassword=PASSWORD;f.config.loginEmail='owner@example.com';
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 async function request(route,body,method=body===undefined?'GET':'POST',token=''){
  const response=await fetch(base+'/api/mobile'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 const login=await request('/auth/login',{email:'owner@example.com',password:PASSWORD});
 assert.equal(login.status,200,JSON.stringify(login.body));
 return {...f,...runtime,request,token:login.body.token};
}

test('mobile Home survives a legacy entity kind and capsule remains queryable',async t=>{
 const f=await setup(t);
 const catalog=await f.request('/workspace/catalog',undefined,'GET',f.token);
 assert.equal(catalog.status,200);assert.ok(catalog.body.catalog.capsule);
 const capsule=await f.request('/workspace/entities',{kind:'capsule',title:'Vitamina teste',area:'Pessoal',privacy:'private',state:'active',data:{capsule_type:'supplement',dose_text:'1 cápsula',times_json:'["09:00"]',start_date:'2026-10-08',end_date:'',repeat_type:'daily',weekdays_json:'[]',interval_days:1,remind_minutes:0,notifications:true}},'POST',f.token);
 assert.equal(capsule.status,201,JSON.stringify(capsule.body));
 const legacy=f.workspace.save({kind:'idea',title:'Registro legado',area:'Pessoal',privacy:'private',data:{}});
 f.store.db.prepare('UPDATE entities SET kind=? WHERE id=?').run('legacy_removed_kind',legacy.id);
 const home=await f.request('/home',undefined,'GET',f.token);
 assert.equal(home.status,200,JSON.stringify(home.body));assert.ok(Array.isArray(home.body.tasks));
 const capsules=await f.request('/workspace/entities?kind=capsule&limit=100&offset=0',undefined,'GET',f.token);
 assert.equal(capsules.status,200,JSON.stringify(capsules.body));assert.ok(capsules.body.items.some(x=>x.id===capsule.body.id));
});
