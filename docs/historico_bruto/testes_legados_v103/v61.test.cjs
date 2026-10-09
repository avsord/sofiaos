'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,base,blankAction}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});

test('v61: executor recusa qualquer ação sem autoridade semântica da IA',t=>{
  const f=fixture(t,{privateMode:false});
  const c=f.store.createConversation('Teste','web');
  const user=f.store.userMessage({conversationId:c.id,clientId:crypto.randomUUID(),message:'texto qualquer'}).message;
  const raw={intent:'create_task',confidence:1,explicit_action:true,needs_context:false,context_query:'',assistant_message:'',response_ready:false,ui_target:'tasks',decision_basis:'',privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:''},action:{...blankAction(),title:'Não deveria existir'},actions:[],clarification:{question:'',options:[]}};
  assert.throws(()=>f.core.execute(user,raw,'shared'),e=>e.code==='SEMANTIC_AUTHORITY_REQUIRED');
  assert.equal(f.store.tasks().length,0);
});

test('v61: mensagem enganosa não permite que backend troque a intenção escolhida pela IA',async t=>{
  const plan=base('create_task',{explicit_action:true,confidence:.99,assistant_message:'Criei a tarefa correta.',privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Plano da IA.'},action:{...blankAction(),title:'Tarefa decidida pela IA',content:'Tarefa decidida pela IA',area:'Pessoal'}});
  const f=fixture(t,{privateMode:false,plans:[plan]});
  const r=await send(f.core,'crie um compromisso amanhã às 10h');
  assert.equal(r.intent.type,'create_task');
  assert.equal(f.store.tasks().filter(x=>x.title==='Tarefa decidida pela IA').length,1);
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);
});

test('v61: texto destrutivo não executa exclusão se a IA decidiu responder',async t=>{
  const f=fixture(t,{privateMode:false,plans:[base('respond',{assistant_message:'Vou apenas responder.',response_ready:true,privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Plano da IA.'}})]});
  f.core.workspace.save({kind:'commitment',title:'Dentista',area:'Pessoal',privacy:'shared',state:'planned',data:{start_at:'2026-09-20T15:00:00.000Z'}});
  const r=await send(f.core,'exclua todos os meus compromissos agora');
  assert.equal(r.intent.type,'respond');
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,1);
});

test('v62: clique em botão também volta para a IA antes da execução',async t=>{
  const initial=base('clarify',{confidence:.99,ready_for_backend:false,pending_state:'replace',assistant_message:'Confirma?',clarification:{question:'Confirma?',options:[{id:'confirm',label:'Confirmar',meaning:'Executar.'},{id:'just_telling',label:'Cancelar',meaning:'Não executar.'}]},actions:[{intent:'create_task',action:{...blankAction(),title:'Teste botão',content:'Teste botão',area:'Pessoal'}}]});
  const next=base('respond',{pending_state:'resolve',assistant_message:'Entendi.'});
  const f=fixture(t,{privateMode:false,plans:[initial,next]});
  const a=await send(f.core,'quero registrar algo');
  await send(f.core,'Confirmar',{conversation_id:a.conversation_id,clarification_id:a.clarification.id,clarification_option:'confirm'});
  const structured=f.calls.filter(x=>x.kind==='structured');
  assert.equal(structured.length,2);
  assert.equal(structured[1].name,'sofia_dialogue_turn_v62');
  assert.match(JSON.stringify(structured[1].input),/OPÇÃO DE ESCLARECIMENTO SELECIONADA PELO USUÁRIO/);
});

test('v61: correção de privacidade vira exemplo para a IA, não regra textual inventada pelo backend',async t=>{
  const first=base('respond',{response_ready:true,privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Teste.'}});
  const second=base('reclassify_route',{explicit_action:true,assistant_message:'Marquei como privado.',privacy:{sensitivity:'sensitive',recommended_route:'private',reason:'Correção do usuário.'},action:{...blankAction(),privacy_route:'private'}});
  const f=fixture(t,{privateMode:false,plans:[first,second]});
  const a=await send(f.core,'Projeto Auralis contém material particular');
  await send(f.core,'Isso é privado',{conversation_id:a.conversation_id});
  const row=f.store.db.prepare("SELECT * FROM privacy_rules WHERE source='feedback-chat' ORDER BY rowid DESC LIMIT 1").get();
  assert.equal(row.scope,'example');
  assert.equal(row.value,'Projeto Auralis contém material particular');
});

test('v61: runtime declara IA como autoridade semântica global e backend só valida/executa',()=>{
  const engine=read('src/services/intent-engine.js');
  const core=read('src/core/sofia-core.js');
  const authority=read('src/core/semantic-authority.js');
  assert.match(engine,/AUTORIDADE SEMÂNTICA GLOBAL/);
  assert.match(engine,/TODAS as capacidades/i);
  assert.match(core,/assertAuthorized\(plan\)/);
  assert.match(core,/Toda linguagem natural passa primeiro pela IA/);
  assert.match(engine,/Botões e escolhas da interface também voltam para sua interpretação semântica/);
  assert.doesNotMatch(core,/classifyPendingReply|confirmDestructive|asClarifyPlan/);
  assert.match(authority,/SEMANTIC_AUTHORITY_REQUIRED/);
  assert.doesNotMatch(core,/SENSITIVE\.test\(|SHAREABLE\.test\(|classify\(user\.content/);
});

test('v61: segurança não semântica continua antes da IA',async t=>{
  const f=fixture(t,{privateMode:false});
  await assert.rejects(()=>send(f.core,'minha chave é sk-1234567890abcdefghijklmnop'),e=>e.code==='POSSIBLE_SECRET');
  assert.equal(f.calls.length,0);
});
