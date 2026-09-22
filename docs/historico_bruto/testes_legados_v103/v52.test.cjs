'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs');
const {plannerInstructions}=require('../src/services/intent-engine');
const {CATALOG}=require('../src/core/catalog');

const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});

test('v52: tarefa e lembrete são intenções e registros distintos',async t=>{
  const f=fixture(t,{privateMode:false});
  const first=await send(f.core,'hoje eu tenho um aniversario de um colega pra ir as 19hrs no capao');
  assert.deepEqual(first.clarification.options.map(x=>x.label),['Adicionar aos compromissos','Criar tarefa','Criar lembrete','Só estou contando']);
  const reminder=await send(f.core,'Criar lembrete',{conversation_id:first.conversation_id,clarification_id:first.clarification.id,clarification_option:'create_reminder'});
  assert.equal(reminder.intent.type,'create_reminder');
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,1);
  assert.equal(f.store.tasks().length,0);
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);
});

test('v52: compromisso continua separado de lembrete',async t=>{
  const f=fixture(t,{privateMode:false});
  const first=await send(f.core,'hoje eu tenho um aniversario de um colega pra ir as 19hrs no capao');
  await send(f.core,'Adicionar aos compromissos',{conversation_id:first.conversation_id,clarification_id:first.clarification.id,clarification_option:'add_commitment'});
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,1);
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,0);
});

test('v52: catálogo de compromisso e lembrete não expõe texto técnico de ICS ao usuário',()=>{
  assert.equal(CATALOG.commitment.label,'Compromisso');
  assert.equal(CATALOG.reminder.label,'Lembrete');
  assert.doesNotMatch(CATALOG.commitment.description,/\.ics|Google/i);
  assert.equal(CATALOG.commitment.fields.find(x=>x.key==='calendar_id').developerOnly,true);
  assert.equal(CATALOG.reminder.fields.find(x=>x.key==='calendar_id').developerOnly,true);
});

test('v52: interface pública usa Agenda e formata datetime em vez de ISO bruto',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  assert.match(js,/commitments:\{title:'Agenda'/);
  assert.match(js,/function fieldValue\(field,value\)/);
  assert.match(js,/if\(field\.type==='datetime'\)return date\(value\)/);
  assert.doesNotMatch(html,/Google Calendar continua uma integração separada/);
});

test('v52: detalhes do usuário mostram apenas Editar; controles técnicos ficam no modo desenvolvedor',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(js,/actions\.append\(btn\('Editar'/);
  assert.match(js,/if\(state\.uiMode==='developer'\)\{/);
  assert.match(js,/ID '\+e\.id/);
  assert.match(js,/Criado em '\+date\(e\.created_at\)/);
});

test('v62: opções de esclarecimento pertencem à IA e a interface limita a quatro escolhas',()=>{
  const engine=fs.readFileSync(path.join(__dirname,'..','src','services','intent-engine.js'),'utf8');
  const core=fs.readFileSync(path.join(__dirname,'..','src','core','sofia-core.js'),'utf8');
  assert.match(engine,/A pergunta e as opções DEVEM nascer de você/);
  assert.match(core,/\(c\.options\|\|\[\]\)\.slice\(0,4\)/);
  assert.doesNotMatch(engine,/function clarificationFor/);
});

test('v52: instrução da IA diferencia tarefa, lembrete e compromisso',()=>{
  const text=plannerInstructions({today:'2026-09-19'});
  assert.match(text,/Tarefa e lembrete são ações diferentes/);
  assert.match(text,/Criar lembrete/);
});

test('v52: transporte padrão da OpenAI usa cliente HTTPS robusto e interface oferece nova tentativa',()=>{
  const provider=fs.readFileSync(path.join(__dirname,'..','src','services','openai.js'),'utf8');
  const client=fs.readFileSync(path.join(__dirname,'..','src','services','http-client.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(provider,/fetchImpl\|\|httpsFetch/);
  assert.match(client,/autoSelectFamily:true/);
  assert.match(ui,/Tentar novamente/);
  assert.match(ui,/API_CONNECTION/);
});
