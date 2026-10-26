'use strict';
// 0.3.244: o Filtro Privado roda com a chave do projeto COMPARTILHADO (cota gratuita), com o mesmo modelo e contexto;
// se a OpenAI disser cota/limite (API_QUOTA), a mesma chamada e refeita uma vez pela chave privada.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/memory/store');const {RoutingService}=require('../src/services/routing');const {AudioService}=require('../src/services/audio');
const PRIV='sk-private-key-for-tests-000000000001',SHARED='sk-shared-key-for-tests-0000000000002';
function setup(t,{via=true,fail=null}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-rota-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new Store(path.join(dir,'sofia.sqlite'));t.after(()=>store.close&&store.close());
  store.updateSettings({routingEnabled:true,privateConfirmed:true,sharedConfirmed:true,sharedBillingAcknowledged:true,privateModel:'modelo-privado',privateDailyUSD:10,privateMonthlyUSD:100,sharedDailyUSD:10,sharedMonthlyUSD:100,privateInputPerMillion:1,privateOutputPerMillion:1,sharedInputPerMillion:1,sharedOutputPerMillion:1});
  const calls=[];const factory=c=>({respond:async req=>{calls.push({key:c.apiKey,model:c.model});if(fail&&fail(c.apiKey)){const e=new Error('limite');e.code=fail.code||'API_QUOTA';throw e;}return {text:'ok',usage:{input_tokens:10,output_tokens:5}};},
    structured:async req=>{calls.push({key:c.apiKey,model:c.model,structured:true});return {data:{x:1},usage:{input_tokens:10,output_tokens:5}};}});
  const config={privateApiKey:PRIV,sharedApiKey:SHARED,model:'modelo-padrao',privateViaShared:via};
  return {routing:new RoutingService(store,config,factory),calls,config};
}
test('privado sai pela chave do COMPARTILHADO, com o MESMO modelo do privado (comportamento igual)',async t=>{
  const {routing,calls}=setup(t);
  const r=await routing.respond('private',{instructions:'x',input:[{role:'user',content:'oi'}],maxOutputTokens:100});
  assert.equal(calls[0].key,SHARED);assert.equal(calls[0].model,'modelo-privado');assert.equal(r.route,'private');
  await routing.respondStructured('private',{instructions:'x',input:[],schema:{},name:'n',maxOutputTokens:100});
  assert.equal(calls[1].key,SHARED,'os comandos (interpretacao estruturada) tambem');
});
test('cota grátis acabou (API_QUOTA): refaz UMA vez pela chave privada; outros erros nao trocam de chave',async t=>{
  const f=k=>k===SHARED;f.code='API_QUOTA';
  const {routing,calls}=setup(t,{fail:f});
  const r=await routing.respond('private',{instructions:'x',input:[],maxOutputTokens:100});
  assert.deepEqual(calls.map(c=>c.key),[SHARED,PRIV]);assert.equal(r.text,'ok');assert.equal(r.keyUsed,'private-fallback');
  const g=k=>k===SHARED;g.code='API_AUTH';
  const b=setup(t,{fail:g});
  await assert.rejects(b.routing.respond('private',{instructions:'x',input:[],maxOutputTokens:100}),e=>e.code==='API_AUTH');
  assert.deepEqual(b.calls.map(c=>c.key),[SHARED],'erro que nao e cota: nao gasta a chave paga');
});
test('SOFIA_PRIVATE_VIA_SHARED=0 (interruptor desligado): volta ao projeto privado como antes',async t=>{
  const {routing,calls}=setup(t,{via:false});
  await routing.respond('private',{instructions:'x',input:[],maxOutputTokens:100});assert.equal(calls[0].key,PRIV);
});
test('audio: transcricao tambem usa a chave do compartilhado; com o interruptor desligado, a privada',()=>{
  assert.equal(new AudioService({privateApiKey:PRIV,sharedApiKey:SHARED,privateViaShared:true}).key('auto'),SHARED);
  assert.equal(new AudioService({privateApiKey:PRIV,sharedApiKey:SHARED,privateViaShared:true}).key('private'),SHARED);
  assert.equal(new AudioService({privateApiKey:PRIV,sharedApiKey:SHARED,privateViaShared:false}).key('auto'),PRIV);
});
test('o interruptor vem ligado por padrao e so desliga com SOFIA_PRIVATE_VIA_SHARED=0',()=>{
  const s=fs.readFileSync(path.join(__dirname,'../src/config/runtime.js'),'utf8');
  assert.ok(s.includes("privateViaShared: process.env.SOFIA_PRIVATE_VIA_SHARED?.trim() !== '0',"));
});
