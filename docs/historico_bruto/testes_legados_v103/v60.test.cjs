'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,base,blankAction}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});

function commitment(core,title,at='2026-09-20T15:00:00.000Z'){
  return core.workspace.save({kind:'commitment',title,content:'',area:'Pessoal',privacy:'shared',state:'planned',data:{start_at:at,end_at:'',location:'',remind_minutes:'',calendar_id:'',sync_state:'local'},tags:[]});
}

test('v62: confirmar exclusão em linguagem natural volta à IA, executa e nunca vira novo compromisso',async t=>{
  const f=fixture(t,{privateMode:false});
  commitment(f.core,'Aniversário');commitment(f.core,'Dentista','2026-09-21T17:00:00.000Z');
  const a=await send(f.core,'exclui todos os meus compromissos');
  assert.equal(a.intent.type,'clarify');
  assert.match(a.reply,/excluir todos/i);
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,2);
  const pending=f.store.db.prepare("SELECT * FROM pending_intents WHERE state='open'").get();
  const pendingPlan=JSON.parse(pending.plan_json);
  assert.equal(pendingPlan.actions[0].intent,'delete_commitments');
  assert.equal(pendingPlan.ready_for_backend,false);

  const b=await send(f.core,'Sim, excluir todos',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'delete_commitments');
  assert.match(b.reply,/2 compromissos excluídos/i);
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM pending_intents WHERE state='open'").get().n,0);
  const names=f.calls.filter(x=>x.kind==='structured').map(x=>x.name);
  assert.deepEqual(names,['sofia_dialogue_turn_v62','sofia_dialogue_turn_v62']);
});

test('v62: confirmação destrutiva usa o mesmo diálogo da IA e não possui classificador paralelo no backend',async t=>{
  const f=fixture(t,{privateMode:false});commitment(f.core,'Aniversário');
  const a=await send(f.core,'exclui todos os meus compromissos');
  const b=await send(f.core,'Sim, excluir todos',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'delete_commitments');
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);
  const names=f.calls.filter(x=>x.kind==='structured').map(x=>x.name);
  assert.ok(names.every(name=>name==='sofia_dialogue_turn_v62'));
  const engine=read('src/services/intent-engine.js');
  assert.doesNotMatch(engine,/classifyPendingReply|confirmDestructive|sofia_destructive_confirmation_v60|sofia_pending_reply_v60/);
});

test('v62: cancelar uma confirmação pendente é decisão da IA e não executa nada',async t=>{
  const f=fixture(t,{privateMode:false});commitment(f.core,'Reunião');
  const a=await send(f.core,'exclui todos os meus compromissos');
  const b=await send(f.core,'não, deixa como está',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'respond');
  assert.match(b.reply,/cancelei/i);
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,1);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM pending_intents WHERE state='open'").get().n,0);
});

test('v62: pergunta no meio de uma confirmação é respondida pela IA sem esquecer a pendência',async t=>{
  const f=fixture(t,{privateMode:false});commitment(f.core,'Reunião');
  const a=await send(f.core,'exclui todos os meus compromissos');
  const b=await send(f.core,'isso vai apagar também os lembretes?',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'respond');
  assert.ok(b.clarification,'a confirmação deve continuar aberta');
  assert.equal(b.clarification.id,a.clarification.id);
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,1);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM pending_intents WHERE state='open'").get().n,1);
});

test('v62: confirmação genérica volta ao mesmo planejador de diálogo e só depois libera execução',async t=>{
  const ask=base('clarify',{confidence:.70,explicit_action:true,ready_for_backend:false,pending_state:'replace',assistant_message:'Posso criar essa tarefa?',privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Tarefa cotidiana.'},actions:[{intent:'create_task',action:{...blankAction(),title:'Revisar orçamento',content:'Revisar orçamento',area:'Pessoal'}}],clarification:{question:'Posso criar essa tarefa?',options:[{id:'yes',label:'Sim',meaning:'Criar a tarefa.'},{id:'no',label:'Não',meaning:'Cancelar.'}]}});
  const execute=base('create_task',{confidence:.99,explicit_action:true,ready_for_backend:true,pending_state:'resolve',assistant_message:'Vou criar.',privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Confirmação recebida.'},action:{...blankAction(),title:'Revisar orçamento',content:'Revisar orçamento',area:'Pessoal'}});
  const f=fixture(t,{privateMode:false,plans:[ask,execute]});
  const a=await send(f.core,'crie uma tarefa para revisar o orçamento');
  assert.equal(a.intent.type,'clarify');
  const b=await send(f.core,'sim, pode criar',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'create_task');
  assert.equal(f.store.tasks().filter(x=>x.title==='Revisar orçamento').length,1);
  assert.deepEqual(f.calls.filter(x=>x.kind==='structured').map(x=>x.name),['sofia_dialogue_turn_v62','sofia_dialogue_turn_v62']);
});

test('v60+: conversa comum usa geração natural separada do JSON de intenção',async t=>{
  const plan=base('respond',{response_ready:true,assistant_message:'Resposta curta do planejador.',privacy:{sensitivity:'sensitive',recommended_route:'private',reason:'Teste privado.'}});
  const f=fixture(t,{privateMode:true,plans:[plan]});
  const r=await send(f.core,'quero conversar sobre uma ideia');
  assert.equal(r.intent.type,'respond');
  assert.equal(r.reply,'Resposta simulada para testes.');
  assert.equal(f.calls.filter(x=>x.kind==='structured').length,1);
  assert.equal(f.calls.filter(x=>x.kind==='respond').length,1);
});

test('v62: prompts tratam respostas curtas como continuação, não como novos objetos',()=>{
  const engine=read('src/services/intent-engine.js'),identity=read('src/config/sofia.js');
  assert.match(engine,/Respostas curtas são atos de diálogo ligados ao turno anterior/);
  assert.match(engine,/Nunca use uma dessas expressões como título de um novo compromisso\/tarefa/i);
  assert.match(identity,/Converse como uma assistente contínua, não como um formulário/);
  assert.match(identity,/não as transforme em títulos ou pedidos novos isolados/i);
});
