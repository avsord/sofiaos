'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,base,blankAction}=require('./helpers.cjs');
const {INTENT_SCHEMA,nextBlackFriday,plannerInstructions}=require('../src/services/intent-engine');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});
function sharedPlan(intent,extra={}){return base(intent,{privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Ação cotidiana não sensível no teste.'},...extra});}
function actions(date='',time=''){
  return [
    {intent:'create_monitor',action:{...blankAction(),title:'Redmi Pad 2',content:'Monitorar o Redmi Pad 2',area:'Pessoal',tags:['Black Friday']}},
    {intent:'create_reminder',action:{...blankAction(),title:'Lembrete: Pad 2 na Black Friday',content:'Revisar o preço do Redmi Pad 2',area:'Pessoal',date,time}}
  ];
}

test('v62: resposta natural completa data da Black Friday e horário da manhã sem repetir a mesma pergunta',async t=>{
  const first=sharedPlan('clarify',{confidence:.99,ready_for_backend:false,pending_state:'replace',assistant_message:'Qual data e horário você quer usar?',actions:actions('',''),clarification:{question:'Qual data e horário você quer usar para o lembrete?',options:[]}});
  const completed=sharedPlan('compound',{confidence:.99,explicit_action:true,ready_for_backend:true,pending_state:'resolve',assistant_message:'Certo. Vou usar a Black Friday e o primeiro horário da manhã.',actions:actions('2026-11-27','09:00')});
  const f=fixture(t,{privateMode:false,plans:[first,completed]});

  const a=await send(f.core,'Quero monitorar o Redmi Pad 2 e criar um lembrete para a Black Friday.');
  assert.equal(a.intent.type,'clarify');
  assert.match(a.reply,/data e horário/i);

  const b=await send(f.core,'quero na data que acontece o black friday e pode ser o primeiro horario da manha',{conversation_id:a.conversation_id,clarification_id:a.clarification.id});
  assert.equal(b.intent.type,'compound');
  assert.doesNotMatch(b.reply,/qual data e horário/i);
  assert.equal(f.core.workspace.list({kind:'monitor'}).length,1);
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,1);
  assert.match(f.core.workspace.list({kind:'reminder'})[0].data.remind_at,/2026-11-27T12:00:00\.000Z$/);

  const structured=f.calls.filter(x=>x.kind==='structured');
  assert.equal(structured.length,2);
  assert.equal(structured[0].name,'sofia_dialogue_turn_v62');
  assert.equal(structured[1].name,'sofia_dialogue_turn_v62');
  assert.match(structured[1].instructions,/Próxima Black Friday: 2026-11-27/);
  assert.match(structured[1].instructions,/manhã=09:00/);
});

test('v62: schema único de diálogo explicita prontidão, confirmação e estado pendente',()=>{
  for(const key of ['ready_for_backend','execution_confirmed','pending_state'])assert.ok(INTENT_SCHEMA.required.includes(key));
  assert.deepEqual(INTENT_SCHEMA.properties.pending_state.enum,['none','keep','replace','resolve']);
  assert.ok(INTENT_SCHEMA.properties.intent.enum.includes('clarify'));
  assert.ok(INTENT_SCHEMA.properties.intent.enum.includes('create_commitment'));
});

test('v57+: cálculo da próxima Black Friday é determinístico',()=>{
  assert.equal(nextBlackFriday('2026-09-19'),'2026-11-27');
  assert.equal(nextBlackFriday('2026-12-01'),'2027-11-26');
});

test('v62: prompt distingue informação derivável de invenção e normaliza períodos do dia',()=>{
  const instructions=plannerInstructions({today:'2026-09-19',pending:true,privacyRules:[]});
  assert.match(instructions,/Datas\/horários que podem ser derivados de forma determinística/);
  assert.match(instructions,/primeiro horário da manhã/);
  assert.match(instructions,/não peça o HH:MM outra vez/i);
  assert.match(instructions,/Não trate cada mensagem como uma sessão isolada/i);
  assert.match(instructions,/ready_for_backend=true/);
});

test('v62: entendimento natural usa o mesmo ciclo de diálogo em versões posteriores',()=>{
  const cfg=read('src/config/sofia.js'),engine=read('src/services/intent-engine.js'),html=read('public/index.html');
  const m=cfg.match(/VERSION\s*=\s*'(\d+)\.0\.0'/);
  assert.ok(m&&Number(m[1])>=62);
  assert.match(engine,/sofia_dialogue_turn_v62/);
  assert.match(engine,/sofia_validation_turn_v62/);
  assert.doesNotMatch(engine,/lockedSchema/);
  assert.match(html,/Sofia OS · v\d+/);
  assert.match(html,/style\.css\?v=\d+/);
  assert.match(html,/app\.js\?v=\d+/);
  assert.match(html,/Core v\d+/);
});
