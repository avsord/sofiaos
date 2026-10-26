'use strict';
// 0.3.242: apagar uma capsula com doses ja marcadas funciona no servidor REAL (nao esbarra em "registro ainda usado")
// e o Historico das doses continua (tabela propria, com o nome copiado).
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');
const PASSWORD='capsule-delete-fixture-only-242';
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

test('apagar capsula com dose marcada: 200, some da lista, e a dose continua no Historico com o nome',async t=>{
 const f=await setup(t);
 const capsule=await f.request('/workspace/entities',{kind:'capsule',title:'Vitamina teste',area:'Pessoal',privacy:'private',state:'active',data:{capsule_type:'supplement',dose_text:'1 cápsula',times_json:'["09:00"]',start_date:'2026-10-08',end_date:'',repeat_type:'daily',weekdays_json:'[]',interval_days:1,remind_minutes:0,notifications:true}},'POST',f.token);
 const id=capsule.body?.id||capsule.id||capsule.body?.entity?.id;assert.ok(id,'capsula criada: '+JSON.stringify(capsule).slice(0,200));
 const dose=await f.request('/md/capsules/doses',{capsule_id:id,day:'2026-10-20',time:'09:00',taken:true},'POST',f.token);
 assert.ok(JSON.stringify(dose).includes('"ok":true'),JSON.stringify(dose).slice(0,200));
 const del=await f.request('/workspace/entities/'+id,undefined,'DELETE',f.token);
 assert.ok(!JSON.stringify(del).includes('ENTITY_IN_USE'),'nao esbarra na trava: '+JSON.stringify(del).slice(0,200));
 const list=await f.request('/workspace/entities?kind=capsule&limit=100&offset=0',undefined,'GET',f.token);
 assert.ok(!JSON.stringify(list).includes(id),'saiu da lista');
 const hist=await f.request('/md/capsules/doses?from=2026-10-01&to=2026-10-31',undefined,'GET',f.token);
 assert.ok(JSON.stringify(hist).includes('Vitamina teste'),'a dose marcada continua no Historico com o nome');
});
