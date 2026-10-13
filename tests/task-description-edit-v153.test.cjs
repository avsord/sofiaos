'use strict';
// "Pedi pra adicionar uma descrição na tarefa e não adicionou": update_record
// não aceitava o campo 'description' (nem location/color/notifications) de
// tarefa — caía direto no erro 'Campo de tarefa não editável'.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,blankAction,base}=require('./helpers.cjs');
const run=(f,intent,action)=>f.core.execute({id:null,content:'pedido'},base(intent,{action:{...blankAction(),...action}}),'private');
const ch=(...pairs)=>pairs.map(([field,value])=>({field,value}));

test('acrescentar um parágrafo na descrição da tarefa: o texto completo novo é salvo',t=>{
 const f=fixture(t);
 const task=f.store.saveTask({title:'Encontrar filme',area:'Geral',state:'todo',description:'encontrar filme com movimentos lentos'});
 const novo='encontrar filme com movimentos lentos\n\nencontrar filmes dos anos 2000, do Supercine e do Corujão da Globo.';
 const r=run(f,'update_record',{target_id:task.id,changes:ch(['description',novo])});
 assert.equal(f.store.task(task.id).description,novo);
 assert.match(r.reply,/Tarefa atualizada/);
});
test('local e notificações da tarefa também editáveis pela conversa',t=>{
 const f=fixture(t);const task=f.store.saveTask({title:'Reunião',area:'Trabalho',state:'todo'});
 run(f,'update_record',{target_id:task.id,changes:ch(['location','Sala 3'],['notifications','10,60'])});
 const t2=f.store.task(task.id);assert.equal(t2.location,'Sala 3');assert.deepEqual(t2.notifications,['10','60']);
});
test('campo de verdade não editável continua recusado com clareza',t=>{
 const f=fixture(t);const task=f.store.saveTask({title:'X',area:'Geral',state:'todo'});
 assert.throws(()=>run(f,'update_record',{target_id:task.id,changes:ch(['inexistente','x'])}),/Campo de tarefa não editável: inexistente/);
});
test('instruções da IA explicam os campos de tarefa e proíbem fingir que mudou sem chamar a ação',()=>{
 const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/services/intent-engine.js'),'utf8');
 for(const t of ['8e. CAMPOS EDITÁVEIS DE TAREFA','description','NUNCA responda descrevendo uma alteração como se já tivesse sido feita'])assert.ok(s.includes(t),t);
});
