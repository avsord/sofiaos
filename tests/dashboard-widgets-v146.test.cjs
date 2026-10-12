'use strict';
// Regressão: GET /md/dashboard devolvia {widgets:null} quando nada estava salvo.
// O app guardava essa resposta no cache e a Início fazia null.filter → tela quebrada.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {httpFixture}=require('./helpers.cjs');
const {OwnerAuth}=require('../src/services/owner-auth');
const {MobileSessions}=require('../src/services/mobile-sessions');
async function setup(t){
 const f=await httpFixture(t);
 const token=new MobileSessions(f.store,new OwnerAuth(f.config,f.store),f.config).issue('widgets-test').token;
 const call=async(path,body)=>{const r=await fetch(f.base+'/api/mobile'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 return {call};
}
test('widgets da Início: nunca vem nulo, mesmo sem nada salvo',async t=>{
 const {call}=await setup(t);
 const r=await call('/md/dashboard');assert.equal(r.status,200);
 assert.ok(Array.isArray(r.data.widgets),'widgets precisa ser lista: o app faz .filter nela');
 assert.deepEqual(r.data.widgets,['monitoring','tasks']);assert.equal(r.data.saved,false);
});
test('widgets da Início: salva, filtra o desconhecido e devolve marcado como salvo',async t=>{
 const {call}=await setup(t);
 const w=await call('/md/dashboard',{widgets:['capsules','tasks','hacker','capsules']});
 assert.deepEqual(w.data.widgets,['capsules','tasks']);
 const r=await call('/md/dashboard');assert.deepEqual(r.data.widgets,['capsules','tasks']);assert.equal(r.data.saved,true);
 assert.equal((await call('/md/capabilities')).data.dashboard_widgets,true);
});
