'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,base,blankAction}=require('./helpers.cjs');
const {recentRecords,searchTasks}=require('../src/services/record-context');
test('create then rename the same task preserves real ID, light priority and description',async t=>{
 const f=fixture(t,{plans:[base('create_task',{explicit_action:true,action:{...blankAction(),title:'Fazer chamada Cobra Reflex',content:'Ligar sobre orçamento',priority_level:'light'}})]});
 const first=await f.core.receive({client_message_id:'create-reflex',message:'Crie Cobra Reflex com prioridade leve'});
 const task=f.store.tasks()[0];assert.equal(task.priority_level,'light');assert.equal(task.description,'Ligar sobre orçamento');
 const reply=f.store.message(first.message_id);assert.ok(JSON.parse(reply.refs).some(r=>r.id===task.id&&r.kind==='task'));
 f.plans.push(base('update_record',{explicit_action:true,action:{...blankAction(),target_id:task.id,changes:[{field:'title',value:'Cobra Reflex'}]}}));
 const second=await f.core.receive({conversation_id:first.conversation_id,client_message_id:'rename-reflex',message:'A que você acabou de criar, mude só o nome para Cobra Reflex'});
 assert.equal(second.items[0].id,task.id);assert.equal(f.store.tasks().length,1);const updated=f.store.task(task.id);assert.equal(updated.title,'Cobra Reflex');assert.equal(updated.priority_level,'light');assert.equal(updated.description,'Ligar sobre orçamento');
 const planning=f.calls.filter(c=>c.kind==='structured').at(-1).input;
 assert.ok(planning.some(m=>m.content.includes('REGISTROS REAIS VINCULADOS')&&m.content.includes(task.id)&&m.content.includes('Fazer chamada Cobra Reflex')));
 const tech=f.core.technicalResult({intent:'update_record'},{items:[updated]});assert.equal(tech.items[0].priority_level,'light');
});
test('existing source links work before receipts exist; current title is read live and other conversations stay separate',t=>{
 const f=fixture(t),c=f.store.createConversation('Original'),other=f.store.createConversation('Outra');
 const m=f.store.userMessage({conversationId:c.id,clientId:'old-source',message:'Crie uma tarefa'}).message;
 const original=f.store.saveTask({title:'Nome antigo',source_id:m.id,privacy:'private'});
 const renamed=f.store.saveTask({...original,title:'Nome editado no app',revision:original.revision},original.id);
 const later=f.store.userMessage({conversationId:c.id,clientId:'next-source',message:'Mude a que acabou de criar'}).message;
 assert.equal(recentRecords(f.store,f.core.workspace,later)[0].title,renamed.title);
 assert.equal(recentRecords(f.store,f.core.workspace,{...later,conversation_id:other.id}).length,0);
 assert.equal(recentRecords(f.store,f.core.workspace,later,'shared').length,0);
 f.store.deleteTask(original.id);assert.equal(recentRecords(f.store,f.core.workspace,later).length,0);
});
test('task context search includes priorities and honors local/private boundaries',t=>{
 const f=fixture(t);f.store.saveTask({title:'Cobra Reflex',priority_level:'medium',privacy:'private'});f.store.saveTask({title:'Cobra segredo',privacy:'local'});
 assert.equal(searchTasks(f.store,'Cobra','private').length,1);assert.equal(searchTasks(f.store,'Cobra','private')[0].priority_level,'medium');assert.equal(searchTasks(f.store,'Cobra','shared').length,0);
});
test('changing only priority or description preserves task identity and other fields',t=>{
 const f=fixture(t),task=f.store.saveTask({title:'Reflex',description:'Manter',priority_level:'light'});
 const result=f.core.execute({},base('update_record',{explicit_action:true,action:{...blankAction(),target_id:task.id,changes:[{field:'priority_level',value:'medium'}]}}),'private');
 assert.equal(result.items[0].id,task.id);assert.equal(result.items[0].description,'Manter');assert.equal(result.items[0].priority_level,'medium');
 const next=f.core.execute({},base('update_record',{explicit_action:true,action:{...blankAction(),target_id:task.id,changes:[{field:'description',value:'Nova descrição'}]}}),'private');assert.equal(next.items[0].priority_level,'medium');assert.equal(next.items[0].description,'Nova descrição');
});
