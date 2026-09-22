'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {saveCredentialValidated}=require('../src/services/credentials');
const {fixture}=require('./helpers.cjs');

test('v51: chave é validada antes de ser persistida',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-v51-key-'));
  try{
    fs.writeFileSync(path.join(dir,'.env'),'WHATSAPP_ACCESS_TOKEN=preservado\n');
    const config={root:dir,apiTimeoutMs:1000};
    let auth='';
    const fetchMock=async(_url,opts)=>{auth=opts.headers.Authorization;return {ok:true,status:200};};
    const key='sk-proj-'+'A'.repeat(40);
    const r=await saveCredentialValidated(config,'private',key,fetchMock);
    assert.equal(r.validated,true);
    assert.equal(auth,'Bearer '+key);
    const env=fs.readFileSync(path.join(dir,'.env'),'utf8');
    assert.match(env,/WHATSAPP_ACCESS_TOKEN=preservado/);
    assert.match(env,/OPENAI_PRIVATE_API_KEY=sk-proj-/);
    assert.equal(config.privateApiKey,key);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('v51: chave recusada não altera o .env',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-v51-key-fail-'));
  try{
    const before='OPENAI_PRIVATE_API_KEY=sk-proj-ANTIGA12345678901234567890\n';
    fs.writeFileSync(path.join(dir,'.env'),before);
    const config={root:dir,apiTimeoutMs:1000};
    const fetchMock=async()=>({ok:false,status:401});
    await assert.rejects(saveCredentialValidated(config,'private','sk-proj-'+'B'.repeat(40),fetchMock),e=>e.code==='KEY_REJECTED');
    assert.equal(fs.readFileSync(path.join(dir,'.env'),'utf8'),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('v51: filtro privado funciona sem obrigar tarifa USD',async t=>{
  const f=fixture(t,{privateMode:true});
  f.store.updateSettings({routingEnabled:true,privateConfirmed:true,privateInputPerMillion:0,privateOutputPerMillion:0,privateDailyUSD:0,privateMonthlyUSD:0});
  assert.doesNotThrow(()=>f.core.routing.profile('private'));
});

test('v51: status distingue chave, confirmação e prontidão',async t=>{
  const f=fixture(t,{privateMode:true});
  f.store.updateSettings({routingEnabled:true,privateConfirmed:true,sharedConfirmed:true,sharedBillingAcknowledged:true});
  const s=f.core.routing.status();
  assert.equal(s.private_key_present,true);
  assert.equal(s.shared_key_present,true);
  assert.equal(s.private_ready,true);
  assert.equal(s.shared_ready,true);
});

test('v51: interface explica projetos e valida chave sem expor conversa',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(html,/Salvar e testar chave/);
  assert.match(html,/projeto fora do Sharing/);
  assert.match(html,/Nenhuma conversa, memória ou dado pessoal é enviado durante a validação/);
  assert.match(js,/renderRoutingSetup/);
  assert.match(js,/Chave validada na OpenAI e salva/);
});
