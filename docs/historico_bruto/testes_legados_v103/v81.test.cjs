'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {fixture,base,blankAction}=require('./helpers.cjs');
const {AppError}=require('../src/core/util');
const {parseStructuredText}=require('../src/services/openai');
const fs=require('node:fs'),path=require('node:path');

const send=(core,message,extra={})=>core.receive({message,client_message_id:crypto.randomUUID(),...extra});

test('v81: parser aceita JSON válido envolvido por texto curto sem avaliar código',()=>{
  const parsed=parseStructuredText('Aqui está o plano:\n{"ok":true,"value":3}\nFim.');
  assert.deepEqual(parsed,{ok:true,value:3});
});

test('v81: falha de interpretação estruturada vira pergunta natural, não bloqueio técnico',async t=>{
  const f=fixture(t,{privateMode:false});
  f.provider.structured=async()=>{const e=new AppError('API_STRUCTURED_PARSE','estrutura inválida',502);e.usage={input_tokens:12,output_tokens:8};throw e;};
  f.provider.respond=async request=>{f.calls.push({kind:'respond',...request});return {reply:'Você quer que eu apenas responda sobre isso ou que eu faça alguma alteração na Sofia?',usage:{input_tokens:20,output_tokens:10},requestId:'req_fallback'};};
  const r=await send(f.core,'faz isso pra mim');
  assert.equal(r.ok,true);assert.equal(r.mode,'ai-clarification-fallback');
  assert.match(r.reply,/Você quer/i);assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);
  const msg=f.store.db.prepare("SELECT status,error_code FROM messages WHERE role='user' ORDER BY rowid DESC LIMIT 1").get();
  assert.equal(msg.status,'completed');assert.equal(msg.error_code,null);
});

test('v81: plano que continua incompleto após validações pergunta em vez de bloquear',async t=>{
  const invalid=()=>base('create_commitment',{explicit_action:true,ready_for_backend:true,action:{...blankAction(),title:'Compromisso ambíguo'}});
  const f=fixture(t,{privateMode:false,plans:[invalid(),invalid(),invalid()]});
  f.provider.respond=async request=>{f.calls.push({kind:'respond',...request});return {reply:'Qual dia e horário você quer usar para esse compromisso?',usage:{input_tokens:14,output_tokens:8},requestId:'req_clarify'};};
  const r=await send(f.core,'marca esse compromisso');
  assert.equal(r.mode,'ai-clarification-fallback');assert.match(r.reply,/Qual dia e horário/i);
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);
});


test('v81+: versão pública e package permanecem alinhados a partir da v81',()=>{
  const root=path.resolve(__dirname,'..'),H=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),cfg=fs.readFileSync(path.join(root,'src/config/sofia.js'),'utf8'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const m=cfg.match(/VERSION = '(\d+)\.0\.0'/),title=H.match(/Sofia OS · v(\d+)/),css=H.match(/style\.css\?v=(\d+)/),js=H.match(/app\.js\?v=(\d+)/),core=H.match(/Core v(\d+)/);for(const x of [m,title,css,js,core])assert.ok(Number(x?.[1])>=81);assert.ok(Number(pkg.version.split('.')[1])>=32);
});
