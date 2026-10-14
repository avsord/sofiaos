'use strict';
// "Coloca prioridade baixa na última tarefa que eu mandei você criar" -> "S" -> a Sofia
// respondia "Localizando a tarefa…" e depois "Ainda não… precisa ser localizada" sem
// mudar nada. Causa: a IA sabia o TÍTULO da tarefa mas não o ID, e um respond não executa.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,blankAction,base}=require('./helpers.cjs');
const {promisesAction}=require('../src/core/sofia-core');

test('a IA recebe os registros recentes COM ID e sabe qual foi a ultima tarefa criada',t=>{
 const f=fixture(t);
 f.store.saveTask({title:'Antiga',area:'Geral',state:'todo'});
 const nova=f.store.saveTask({title:'Encontrar filme',area:'Geral',state:'todo'});
 const ctx=f.core.recentRecordsContext();
 const rows=JSON.parse(ctx.content.slice(ctx.content.indexOf('\n')+1));
 const last=rows.find(r=>r.mais_recente_criado&&r.tipo==='tarefa');
 assert.equal(last.id,nova.id);assert.equal(last.titulo,'Encontrar filme');
 assert.match(ctx.content,/A última tarefa que eu criei/);
});
test('o planejador recebe essa secao em todo turno',async t=>{
 const f=fixture(t,{plans:[base('respond',{assistant_message:'Oi!'})]});
 f.store.saveTask({title:'Encontrar filme',area:'Geral',state:'todo'});
 await f.core.receive({message:'oi',client_message_id:'acts-1'});
 const planner=f.calls.find(c=>c.kind==='structured');
 assert.ok((planner.input||[]).some(m=>String(m.content).startsWith('REGISTROS RECENTES COM ID')),'secao enviada ao planejador');
});
test('resposta que PROMETE acao ("Localizando…") volta ao planejamento e a acao e executada de verdade',async t=>{
 const f=fixture(t,{plans:[]});
 const task=f.store.saveTask({title:'Encontrar filme',area:'Geral',state:'todo'});
 f.plans.push(
  base('respond',{assistant_message:'Localizando a tarefa “Encontrar filme” para aplicar a prioridade baixa.'}),
  base('update_record',{explicit_action:true,execution_confirmed:true,action:{...blankAction(),target_id:task.id,changes:[{field:'priority_level',value:'light'}]}}),
 );
 const r=await f.core.receive({message:'S',client_message_id:'acts-2'});
 assert.equal(f.store.task(task.id).priority_level,'light','a prioridade mudou de fato');
 assert.notEqual(r.intent.type,'respond');
 const replan=f.calls.filter(c=>c.kind==='structured').find(c=>/RESPOND_PROMISED_ACTION/.test(String(c.instructions)));
 assert.ok(replan,'o backend devolveu o turno ao planejamento com o motivo');
});
test('promessa repetida nao vira loop: depois de 2 tentativas a Sofia responde sem fingir',async t=>{
 const f=fixture(t,{plans:[]});
 f.plans.push(...Array(4).fill(0).map(()=>base('respond',{assistant_message:'Vou alterar a tarefa agora.'})));
 const r=await f.core.receive({message:'muda a prioridade',client_message_id:'acts-3'});
 assert.ok(r.ok);assert.ok(f.calls.filter(c=>c.kind==='structured').length<=4,'no maximo 2 replanejamentos');
});
test('detector: pega promessas, ignora perguntas e respostas normais',()=>{
 for(const t of ['Localizando a tarefa “Encontrar filme” para aplicar a prioridade baixa.','Vou alterar a prioridade agora.','Estou procurando a tarefa.','Ainda não. A tarefa “Encontrar filme” precisa ser localizada no sistema antes de eu conseguir alterar a prioridade para baixa.','Ok, vou colocar como baixa.','Já já eu mudo.'])assert.equal(promisesAction(t),true,t);
 for(const t of ['Você quer que eu altere a prioridade dela para baixa?','Pronto, a tarefa ficou com prioridade Baixa.','Bom dia! Como posso ajudar?','A última tarefa criada foi Encontrar filme.',''])assert.equal(promisesAction(t),false,t);
});
test('regras do planejador: acao em vez de promessa, confirmacao curta executa, pedido claro nao pede confirmacao',()=>{
 const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/services/intent-engine.js'),'utf8');
 assert.ok(s.includes('8f. AÇÃO, NÃO PROMESSA.'));assert.ok(s.includes('mais_recente_criado'));assert.ok(s.includes('("s", "sim", "pode", "isso", "ok", "manda")'));
});
test('chat sem asteriscos crus: o app mostra texto puro',()=>{
 const {plainChat}=require('../src/core/sofia-core');
 assert.equal(plainChat('A última tarefa criada foi **“Encontrar filme”**.'),'A última tarefa criada foi “Encontrar filme”.');
 assert.equal(plainChat('## Resumo\n- item __um__'),'Resumo\n- item um');
 assert.equal(plainChat('2 * 3 = 6 e a*b'),'2 * 3 = 6 e a*b','asterisco sozinho fica');
});
