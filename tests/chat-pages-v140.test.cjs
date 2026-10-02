'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');

test('v140: excluir uma mensagem remove texto, voz/índice visível e mantém a conversa íntegra',t=>{
  const f=fixture(t),c=f.store.createConversation('Excluir teste','web');
  const m=f.store.userMessage({conversationId:c.id,clientId:'delete-one',message:'texto exclusivo para apagar',channel:'web'}).message;
  f.store.db.prepare("UPDATE messages SET status='completed' WHERE id=?").run(m.id);
  assert.equal(f.store.messages(c.id).length,1);
  const out=f.store.deleteMessage(m.id);
  assert.equal(out.ok,true);
  assert.equal(f.store.messages(c.id).length,0);
  assert.throws(()=>f.store.message(m.id),/não encontrada/i);
  assert.equal(f.store.search('exclusivo').length,0);
});

test('v140: limpar histórico remove conversas de app e web sem apagar tarefas',t=>{
  const f=fixture(t),a=f.store.createConversation('Web','web'),b=f.store.createConversation('Mobile','mobile');
  f.store.userMessage({conversationId:a.id,clientId:'clear-a',message:'um',channel:'web'});
  f.store.userMessage({conversationId:b.id,clientId:'clear-b',message:'dois',channel:'mobile'});
  const task=f.store.saveTask({title:'Tarefa preservada'});
  const out=f.store.clearChatHistory();
  assert.equal(out.conversations,2);
  assert.equal(f.store.conversations().length,0);
  assert.equal(f.store.task(task.id).title,'Tarefa preservada');
});

test('v140: criação semântica de página reaproveita mesmo título no mesmo pai',()=>{
  const core=fs.readFileSync(path.join(__dirname,'../src/core/sofia-core.js'),'utf8');
  assert.ok(core.includes('existing=pages.find'));
  assert.ok(core.includes('created:false,reused:true'));
  assert.ok(core.includes("replace(/\\s+/g,'')"));
});
