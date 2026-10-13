'use strict';
// Pedir na conversa "coloca tal tarefa em prioridade leve" não mudava nada:
// a IA só podia mandar prioridade sim/não, e "leve" virava "não".
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,blankAction,base}=require('./helpers.cjs');
const run=(f,intent,action)=>f.core.execute({id:null},base(intent,{action:{...blankAction(),...action}}),'private');
test('editar pela conversa: leve, média, importante e tirar prioridade',t=>{
 const f=fixture(t);const task=f.store.saveTask({title:'Trocar lâmina',area:'Geral',state:'todo',priority:true,priority_level:'important'});
 let r=run(f,'update_record',{target_id:task.id,changes:[{field:'priority_level',value:'leve'}]});
 assert.equal(f.store.task(task.id).priority_level,'light');assert.match(r.reply,/prioridade Leve/);
 run(f,'update_record',{target_id:task.id,changes:[{field:'priority',value:'Média'}]});assert.equal(f.store.task(task.id).priority_level,'medium');
 run(f,'update_record',{target_id:task.id,changes:[{field:'priority_level',value:'alta'}]});assert.equal(f.store.task(task.id).priority_level,'important');
 run(f,'update_record',{target_id:task.id,changes:[{field:'priority_level',value:'sem prioridade'}]});assert.equal(f.store.task(task.id).priority_level,'none');
 assert.throws(()=>run(f,'update_record',{target_id:task.id,changes:[{field:'priority_level',value:'azul'}]}),/Use Importante, Média, Leve ou Sem prioridade/);
});
test('criar pela conversa já com prioridade leve',t=>{
 const f=fixture(t);const r=run(f,'create_task',{title:'Ver bobs',changes:[{field:'priority_level',value:'light'}]});
 assert.equal(f.store.tasks().find(x=>x.title==='Ver bobs').priority_level,'light');assert.match(r.reply,/prioridade Leve/);
});
test('a IA aprende os 4 níveis no texto de instruções',()=>{const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/services/intent-engine.js'),'utf8');assert.ok(s.includes("field:'priority_level', value:'important'|'medium'|'light'|'none'"));});
