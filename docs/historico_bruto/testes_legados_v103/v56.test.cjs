'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,base,blankAction}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});
function sharedPlan(intent,extra={}){return base(intent,{privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Ação cotidiana não sensível no teste.'},...extra});}
function monitorReminder(time=''){
  return [
    {intent:'create_monitor',action:{...blankAction(),title:'Redmi Pad 2',content:'Monitorar o Redmi Pad 2',area:'Pessoal',tags:['Black Friday']}},
    {intent:'create_reminder',action:{...blankAction(),title:'Black Friday — Redmi Pad 2',content:'Revisar o preço do Redmi Pad 2',area:'Pessoal',date:'2026-11-27',time}}
  ];
}

test('v62: esclarecimento multi-etapa é conduzido pela IA e preserva as ações já entendidas',async t=>{
  const initial=sharedPlan('clarify',{confidence:.98,ready_for_backend:false,pending_state:'replace',assistant_message:'Você quer criar o lembrete, manter o monitoramento ou os dois?',clarification:{question:'Você quer criar o lembrete, manter o monitoramento ou os dois?',options:[{id:'create_reminder',label:'Criar lembrete',meaning:'Criar um lembrete para a Black Friday.'},{id:'keep_monitor',label:'Monitorar nessa data',meaning:'Manter o monitoramento do produto na Black Friday.'}]}});
  const askTime=sharedPlan('clarify',{confidence:.99,ready_for_backend:false,pending_state:'replace',assistant_message:'Entendi as duas ações. Qual horário você quer usar para o lembrete?',actions:monitorReminder(''),clarification:{question:'Entendi as duas ações. Qual horário você quer usar para o lembrete?',options:[{id:'09',label:'09:00',meaning:'Usar 09:00.'},{id:'15',label:'15:00',meaning:'Usar 15:00.'},{id:'19',label:'19:00',meaning:'Usar 19:00.'}]}});
  const complete=sharedPlan('compound',{confidence:.99,explicit_action:true,ready_for_backend:true,pending_state:'resolve',assistant_message:'Certo. Vou usar 09:00.',actions:monitorReminder('09:00')});
  const f=fixture(t,{privateMode:false,plans:[initial,askTime,complete]});

  const a=await send(f.core,'Quero acompanhar o Redmi Pad 2 na Black Friday e talvez criar um lembrete.');
  const b=await send(f.core,'os dois',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'clarify');
  assert.match(b.reply,/horário/i);
  assert.match(b.reply,/lembrete/i);
  assert.doesNotMatch(b.reply,/compromisso/i);
  assert.deepEqual(b.clarification.options.map(x=>x.label),['09:00','15:00','19:00']);
  assert.equal(b.clarification.id,a.clarification.id);
  const pending=f.store.db.prepare("SELECT * FROM pending_intents WHERE state='open'").get();
  assert.equal(pending.source_message_id,f.store.db.prepare('SELECT source_message_id FROM pending_intents ORDER BY rowid LIMIT 1').get().source_message_id);

  const c=await send(f.core,'De manhã',{conversation_id:a.conversation_id,clarification_id:b.clarification.id});
  assert.equal(c.intent.type,'compound');
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,1);
  assert.equal(f.core.workspace.list({kind:'monitor'}).length,1);
  assert.match(f.core.workspace.list({kind:'reminder'})[0].data.remind_at,/2026-11-27T12:00:00\.000Z$/);
});

test('v62: resposta livre que completa um campo volta à IA antes de qualquer execução',async t=>{
  const first=sharedPlan('clarify',{confidence:.99,ready_for_backend:false,pending_state:'replace',assistant_message:'Qual horário para o lembrete?',actions:monitorReminder(''),clarification:{question:'Qual horário para o lembrete?',options:[]}});
  const complete=sharedPlan('compound',{confidence:.99,explicit_action:true,ready_for_backend:true,pending_state:'resolve',actions:monitorReminder('09:00')});
  const f=fixture(t,{privateMode:false,plans:[first,complete]});
  const a=await send(f.core,'Monitore e me lembre da Black Friday.');
  assert.equal(a.intent.type,'clarify');
  const b=await send(f.core,'às 9h',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'compound');
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,1);
  assert.equal(f.core.workspace.list({kind:'monitor'}).length,1);
  const names=f.calls.filter(x=>x.kind==='structured').map(x=>x.name);
  assert.deepEqual(names,['sofia_dialogue_turn_v62','sofia_dialogue_turn_v62']);
});

test('v62: prompt manda a própria IA perguntar quando falta campo e só liberar backend quando estiver completo',()=>{
  const js=read('src/services/intent-engine.js');
  assert.match(js,/Use clarify quando .*faltar algum dado essencial/i);
  assert.match(js,/A pergunta e as opções DEVEM nascer de você/);
  assert.match(js,/ready_for_backend=true/);
  assert.match(js,/backend não formula perguntas conversacionais/i);
});

test('v56+: interface identifica Chat e força assets da versão atual após recarregar',()=>{
  const html=read('public/index.html');
  assert.match(html,/id="newConversation"[^>]*>[\s\S]*?nav-label">Chat<\/span>[\s\S]*?<\/button>/);
  assert.match(html,/style\.css\?v=\d+/);
  assert.match(html,/app\.js\?v=\d+/);
  assert.match(html,/Core v\d+/);
});

test('v62: versão pública usa diálogo e validação estruturados versionados',()=>{
  const cfg=read('src/config/sofia.js'),engine=read('src/services/intent-engine.js'),html=read('public/index.html');
  const m=cfg.match(/VERSION\s*=\s*'(\d+)\.0\.0'/);
  assert.ok(m&&Number(m[1])>=62);
  assert.match(engine,/sofia_dialogue_turn_v\d+/);
  assert.match(engine,/sofia_validation_turn_v\d+/);
  assert.match(html,/Sofia OS · v\d+/);
});
