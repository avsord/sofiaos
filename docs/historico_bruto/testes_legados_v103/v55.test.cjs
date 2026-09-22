'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,base,blankAction}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});

function sharedPlan(intent,extra={}){
  return base(intent,{privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Ação cotidiana não sensível no teste.'},...extra});
}

test('v55+: botão principal continua identificado como Chat e o título vazio padrão permanece Chat',async t=>{
  const html=read('public/index.html'),js=read('public/app.js');
  assert.match(html,/id="newConversation"[^>]*>[\s\S]*?nav-label">Chat<\/span>[\s\S]*?<\/button>/);
  assert.doesNotMatch(html,/＋ Nova conversa/);
  assert.match(js,/newConversation\(\{title='Chat'/);
  const f=fixture(t,{privateMode:false});
  const c=f.store.createConversation();
  assert.equal(c.title,'Chat');
  const saved=f.store.userMessage({conversationId:c.id,clientId:crypto.randomUUID(),message:'Primeira mensagem do chat',channel:'web'}).message;
  assert.equal(f.store.conversation(saved.conversation_id).title,'Primeira mensagem do chat');
});

test('v55: esclarecimento aparece uma vez na Home, com os botões no mesmo bloco da Sofia',()=>{
  const js=read('public/app.js');
  assert.match(js,/clarificationMessageIndex/);
  assert.match(js,/normalized\(items\[i\]\?\.content\)===question/);
  assert.match(js,/index!==clarificationMessageIndex/);
  assert.match(js,/home-speaker','Sofia'/);
});

test('v62: “os dois” volta para a IA, que preserva monitoramento + lembrete e pergunta só o horário',async t=>{
  const initial=sharedPlan('clarify',{confidence:.98,ready_for_backend:false,pending_state:'replace',assistant_message:'Você quer que eu crie um lembrete para a Black Friday ou apenas mantenha o monitoramento do produto nessa data?',clarification:{question:'Você quer que eu crie um lembrete para a Black Friday ou apenas mantenha o monitoramento do produto nessa data?',options:[{id:'create_reminder',label:'Criar lembrete',meaning:'Criar um lembrete para a Black Friday.'},{id:'keep_monitor',label:'Monitorar nessa data',meaning:'Manter o monitoramento do produto na Black Friday.'}]}});
  const askTime=sharedPlan('clarify',{confidence:.99,ready_for_backend:false,pending_state:'replace',assistant_message:'Entendi as duas ações. Qual horário você quer para o lembrete?',actions:[
    {intent:'create_monitor',action:{...blankAction(),title:'Redmi Pad 2',content:'Monitorar o Redmi Pad 2',area:'Pessoal',tags:['Black Friday']}},
    {intent:'create_reminder',action:{...blankAction(),title:'Black Friday — Redmi Pad 2',content:'Revisar o preço do Redmi Pad 2',area:'Pessoal',date:'2026-11-27',time:''}}
  ],clarification:{question:'Entendi as duas ações. Qual horário você quer para o lembrete?',options:[{id:'09',label:'09:00',meaning:'Usar 09:00.'},{id:'15',label:'15:00',meaning:'Usar 15:00.'},{id:'19',label:'19:00',meaning:'Usar 19:00.'}]}});
  const bothComplete=sharedPlan('compound',{confidence:.99,explicit_action:true,ready_for_backend:true,pending_state:'resolve',assistant_message:'Certo. Mantive o monitoramento e criei o lembrete para 09:00.',actions:[
    {intent:'create_monitor',action:{...blankAction(),title:'Redmi Pad 2',content:'Monitorar o Redmi Pad 2',area:'Pessoal',tags:['Black Friday']}},
    {intent:'create_reminder',action:{...blankAction(),title:'Black Friday — Redmi Pad 2',content:'Revisar o preço do Redmi Pad 2',area:'Pessoal',date:'2026-11-27',time:'09:00'}}
  ]});
  const f=fixture(t,{privateMode:false,plans:[initial,askTime,bothComplete]});
  const a=await send(f.core,'Quero acompanhar o Redmi Pad 2 na Black Friday.');
  assert.equal(a.intent.type,'clarify');
  const b=await send(f.core,'os dois',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'clarify');
  assert.equal(b.clarification.id,a.clarification.id,'a mesma pendência deve evoluir na conversa');
  assert.match(b.reply,/duas ações/i);
  assert.match(b.reply,/horário/i);
  assert.match(b.reply,/lembrete/i);
  assert.doesNotMatch(b.reply,/compromisso/i);
  assert.equal(f.core.workspace.list({kind:'monitor'}).length,0);
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,0);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM pending_intents WHERE state='open'").get().n,1);
  const c=await send(f.core,'às 9h',{conversation_id:a.conversation_id,clarification_id:b.clarification.id});
  assert.equal(c.intent.type,'compound');
  assert.equal(f.core.workspace.list({kind:'monitor'}).length,1);
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,1);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM pending_intents WHERE state='open'").get().n,0);
});
test('v55: ação composta é atômica se uma etapa falhar',t=>{
  const f=fixture(t,{privateMode:false});
  const user=f.store.userMessage({clientId:crypto.randomUUID(),message:'faça os dois',channel:'web'}).message;
  const plan=sharedPlan('compound',{explicit_action:true,confidence:.99,actions:[
    {intent:'create_monitor',action:{...blankAction(),title:'Produto teste',content:'Monitorar produto teste',area:'Pessoal'}},
    {intent:'create_reminder',action:{...blankAction(),title:'Lembrete teste',content:'Lembrete teste',area:'Pessoal',date:'2026-11-27',time:''}}
  ]});
  assert.throws(()=>f.core.execute(user,plan,'shared'),e=>e.code==='ACTION_NEEDS_TIME'&&/lembrete/i.test(e.message)&&!/compromisso/i.test(e.message));
  assert.equal(f.core.workspace.list({kind:'purchase'}).length,0);
  assert.equal(f.core.workspace.list({kind:'monitor'}).length,0);
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,0);
});

test('v62: clique de esclarecimento envia a opção estruturada para o mesmo diálogo da IA',async t=>{
  const initial=sharedPlan('clarify',{confidence:.98,ready_for_backend:false,pending_state:'replace',assistant_message:'Qual opção?',clarification:{question:'Qual opção?',options:[{id:'create_reminder',label:'Criar lembrete',meaning:'Criar o lembrete pedido.'},{id:'keep_monitor',label:'Monitorar nessa data',meaning:'Manter o monitoramento.'}]}});
  const next=sharedPlan('respond',{response_ready:true,pending_state:'resolve',assistant_message:'Entendi a escolha.'});
  const f=fixture(t,{privateMode:false,plans:[initial,next]});
  const a=await send(f.core,'Preciso decidir entre duas ações.');
  await send(f.core,'Criar lembrete',{conversation_id:a.conversation_id,clarification_id:a.clarification.id,clarification_option:'create_reminder'});
  const structured=f.calls.filter(x=>x.kind==='structured');
  assert.equal(structured.length,2);
  assert.equal(structured[1].name,'sofia_dialogue_turn_v62');
  const input=JSON.stringify(structured[1].input||[]);
  assert.match(input,/OPÇÃO DE ESCLARECIMENTO SELECIONADA PELO USUÁRIO/);
  assert.match(input,/create_reminder/);
  assert.match(input,/Criar lembrete/);
});
test('v55: versão pública e schema estruturado continuam versionados após a v55',()=>{
  assert.match(read('src/config/sofia.js'),/VERSION\s*=\s*'\d+\.0\.0'/);
  assert.match(read('src/services/intent-engine.js'),/sofia_dialogue_turn_v\d+/);
  assert.match(read('public/index.html'),/Sofia OS · v\d+/);
});
