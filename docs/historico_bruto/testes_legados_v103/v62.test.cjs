'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,base,blankAction}=require('./helpers.cjs');
const {INTENT_SCHEMA}=require('../src/services/intent-engine');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});
const shared={sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Teste cotidiano.'};

test('v62: contrato estruturado separa diálogo de prontidão para backend',()=>{
  for(const field of ['ready_for_backend','execution_confirmed','pending_state'])assert.ok(INTENT_SCHEMA.required.includes(field));
  assert.equal(INTENT_SCHEMA.properties.ready_for_backend.type,'boolean');
  assert.equal(INTENT_SCHEMA.properties.execution_confirmed.type,'boolean');
  assert.deepEqual(INTENT_SCHEMA.properties.pending_state.enum,['none','keep','replace','resolve']);
});

test('v62: se a IA ainda não entendeu, só a pergunta e as opções dela chegam ao usuário',async t=>{
  const clarify=base('clarify',{confidence:.91,ready_for_backend:false,pending_state:'replace',assistant_message:'Preciso entender uma coisa.',privacy:shared,clarification:{question:'Você quer transformar isso em tarefa ou apenas conversar?',options:[{id:'task',label:'Criar tarefa',meaning:'Registrar como tarefa.'},{id:'talk',label:'Só conversar',meaning:'Não executar nada.'}]}});
  const f=fixture(t,{privateMode:false,plans:[clarify]});
  const r=await send(f.core,'preciso organizar isso');
  assert.equal(r.intent.type,'clarify');
  assert.equal(r.reply,'Você quer transformar isso em tarefa ou apenas conversar?');
  assert.deepEqual(r.clarification.options.map(x=>x.label),['Criar tarefa','Só conversar']);
  assert.equal(f.store.tasks().length,0);
});

test('v62: resposta escrita ou botão sempre volta ao mesmo ciclo semântico da IA',async t=>{
  const clarify=base('clarify',{ready_for_backend:false,pending_state:'replace',privacy:shared,clarification:{question:'Como prefere?',options:[{id:'task',label:'Tarefa',meaning:'Criar tarefa.'}]}});
  const respond=base('respond',{pending_state:'resolve',assistant_message:'Entendi.',privacy:shared});
  const f=fixture(t,{privateMode:false,plans:[clarify,respond]});
  const a=await send(f.core,'quero organizar algo');
  await send(f.core,'Tarefa',{conversation_id:a.conversation_id,clarification_id:a.clarification.id,clarification_option:'task'});
  const structured=f.calls.filter(x=>x.kind==='structured');
  assert.deepEqual(structured.map(x=>x.name),['sofia_dialogue_turn_v62','sofia_dialogue_turn_v62']);
  assert.match(JSON.stringify(structured[1].input),/OPÇÃO DE ESCLARECIMENTO SELECIONADA PELO USUÁRIO/);
});

test('v62: backend inválido não pergunta ao usuário; devolve diagnóstico técnico para a IA decidir',async t=>{
  const invalid=base('create_reminder',{explicit_action:true,ready_for_backend:true,privacy:shared,action:{...blankAction(),title:'Teste',content:'Teste',date:'2026-11-27',time:''}});
  const aiQuestion=base('clarify',{ready_for_backend:false,pending_state:'replace',privacy:shared,actions:[{intent:'create_reminder',action:{...blankAction(),title:'Teste',content:'Teste',date:'2026-11-27',time:''}}],clarification:{question:'Qual horário você quer para o lembrete?',options:[{id:'09',label:'09:00',meaning:'Usar 09:00.'}]}});
  const f=fixture(t,{privateMode:false,plans:[invalid,aiQuestion]});
  const r=await send(f.core,'crie um lembrete nesse dia');
  assert.equal(r.intent.type,'clarify');
  assert.equal(r.reply,'Qual horário você quer para o lembrete?');
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,0);
  const structured=f.calls.filter(x=>x.kind==='structured');
  assert.deepEqual(structured.map(x=>x.name),['sofia_dialogue_turn_v62','sofia_validation_turn_v62']);
  assert.match(JSON.stringify(structured[1].instructions),/backend NÃO executou nada/i);
});

test('v62: depois do esclarecimento a IA libera um plano completo e só então o backend executa',async t=>{
  const invalid=base('create_reminder',{explicit_action:true,ready_for_backend:true,privacy:shared,action:{...blankAction(),title:'Black Friday',content:'Ver preço',date:'2026-11-27',time:''}});
  const aiQuestion=base('clarify',{ready_for_backend:false,pending_state:'replace',privacy:shared,actions:[{intent:'create_reminder',action:{...blankAction(),title:'Black Friday',content:'Ver preço',date:'2026-11-27',time:''}}],clarification:{question:'Qual horário?',options:[]}});
  const complete=base('create_reminder',{explicit_action:true,ready_for_backend:true,pending_state:'resolve',privacy:shared,action:{...blankAction(),title:'Black Friday',content:'Ver preço',date:'2026-11-27',time:'09:00'}});
  const f=fixture(t,{privateMode:false,plans:[invalid,aiQuestion,complete]});
  const a=await send(f.core,'me lembra da Black Friday');
  assert.equal(a.intent.type,'clarify');
  const b=await send(f.core,'às 9h',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'create_reminder');
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,1);
});

test('v62: resultado factual do backend volta para a IA antes da resposta visível',async t=>{
  const plan=base('create_task',{explicit_action:true,ready_for_backend:true,privacy:shared,action:{...blankAction(),title:'Revisar orçamento',content:'Revisar orçamento',area:'Pessoal'}});
  const f=fixture(t,{privateMode:false,plans:[plan]});
  const r=await send(f.core,'crie a tarefa de revisar orçamento');
  assert.equal(r.intent.type,'create_task');
  const last=f.calls.at(-1);
  assert.equal(last.kind,'respond');
  const payload=JSON.stringify(last.input||[]);
  assert.match(payload,/RESULTADO TÉCNICO DO BACKEND/);
  assert.match(payload,/Tarefa criada/);
  assert.equal(f.store.tasks().length,1);
});

test('v62+: executor rejeita plano não pronto, mas exclusão semanticamente pronta não exige confirmação extra',t=>{
  const f=fixture(t,{privateMode:false});
  const c=f.store.createConversation('Teste','web');
  const user=f.store.userMessage({conversationId:c.id,clientId:crypto.randomUUID(),message:'teste',channel:'web'}).message;
  const notReady=base('create_task',{explicit_action:true,ready_for_backend:false,privacy:shared,action:{...blankAction(),title:'Não executar'}});
  assert.throws(()=>f.core.execute(user,notReady,'shared'),e=>e.code==='AI_NOT_READY');
  const destructive=base('delete_scope',{explicit_action:true,ready_for_backend:true,execution_confirmed:false,privacy:shared,action:{...blankAction(),scope:'all',scope_id:'commitments'}});
  assert.doesNotThrow(()=>f.core.execute(user,destructive,'shared'));
  assert.ok(!f.core.validationIssues(destructive).some(x=>x.code==='DESTRUCTIVE_CONFIRMATION_REQUIRED'));
});

test('v62: pergunta lateral pode ser respondida sem perder a ação pendente',async t=>{
  const pending=base('clarify',{ready_for_backend:false,pending_state:'replace',privacy:shared,actions:[{intent:'delete_commitments',action:{...blankAction(),scope:'all'}}],clarification:{question:'Confirma excluir todos?',options:[{id:'yes',label:'Sim',meaning:'Confirmar.'}]}});
  const side=base('respond',{pending_state:'keep',assistant_message:'Não, lembretes são separados.',privacy:shared});
  const f=fixture(t,{privateMode:false,plans:[pending,side]});
  const a=await send(f.core,'exclui meus compromissos');
  const b=await send(f.core,'isso apaga lembretes?',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'respond');
  assert.equal(b.clarification.id,a.clarification.id);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM pending_intents WHERE state='open'").get().n,1);
});

test('v62: código não possui classificadores paralelos de linguagem nem perguntas de backend',()=>{
  const core=read('src/core/sofia-core.js'),engine=read('src/services/intent-engine.js');
  assert.doesNotMatch(core,/asClarifyPlan|actionValidationClarification|classifyPendingReply|confirmDestructive/);
  assert.doesNotMatch(engine,/lockedSchema|clarificationFor|classifyPendingReply|confirmDestructive/);
  assert.match(engine,/O backend não formula perguntas conversacionais/);
  assert.match(core,/Backend executou somente o plano pronto da IA; o resultado técnico voltou para a IA/);
});

test('v62: segredo explícito continua sendo a única barreira local antes da IA',async t=>{
  const f=fixture(t,{privateMode:false});
  await assert.rejects(()=>send(f.core,'minha chave é sk-1234567890abcdefghijklmnop'),e=>e.code==='POSSIBLE_SECRET');
  assert.equal(f.calls.length,0);
});
