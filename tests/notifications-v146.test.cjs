'use strict';
// 0.3.146: notificacoes - apagar nao faz o aviso voltar, lista paginada com o total real, "marcar tudo" global.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('apagar marca como dispensado: some da lista e o mesmo aviso (dedup) nao volta; a origem fica intacta',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const task=w.save({kind:'reminder',title:'Pagar conta',area:'Pessoal',data:{remind_at:'2026-10-20T10:00:00-03:00',message:'',location:''}});
 w.notify('reminder','Pagar conta','Hoje',task.id,'info','dup-1');
 const id=w.notifications()[0].id;
 w.clearNotification(id);assert.equal(w.notifications().length,0);
 w.notify('reminder','Pagar conta','Hoje',task.id,'info','dup-1');assert.equal(w.notifications().length,0,'nao reaparece');
 assert.ok(w.get(task.id),'a tarefa de origem continua');
});
test('pagina: 100 por vez, sem os apagados, e "unread" e o total do servidor (nao so a pagina)',t=>{
 const {core}=fixture(t);const w=core.workspace;
 for(let i=0;i<130;i++)w.notify('info','Aviso '+i,'x',null,'info','d'+i);
 const p1=w.noticePage(0);assert.equal(p1.items.length,100);assert.equal(p1.next_offset,100);assert.equal(p1.unread,130);
 const p2=w.noticePage(100);assert.equal(p2.items.length,30);assert.equal(p2.next_offset,null);
 w.clearNotification(p1.items[0].id);assert.equal(w.noticePage(0).unread,129);
});
test('marcar tudo como lido vale para todos os avisos, nao so os carregados; lido nao volta a nao lido',t=>{
 const {core}=fixture(t);const w=core.workspace;
 for(let i=0;i<350;i++)w.notify('info','A'+i,'x',null,'info','r'+i);
 assert.equal(w.markAllRead().updated,350);assert.equal(w.noticePage(0).unread,0);
 const id=w.noticePage(0).items[0].id;w.markRead(id);assert.equal(w.noticePage(0).items[0].state,'read');
 w.clearNotification('all');assert.equal(w.noticePage(0).items.length,0);
});

test('0.3.146: salvar a conta de e-mail aberta antes da verificacao automatica nao da conflito; edicao real de outro aparelho ainda da',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const acc=w.save({kind:'mail_account',title:'p@gmail.com',area:'Pessoal',data:{provider:'gmail',address:'p@gmail.com'}});
 const opened={...acc};
 // a Sofia verifica a caixa em segundo plano e grava o ponto de leitura
 const cur=w.get(acc.id);w.save({revision:cur.revision,data:{...cur.data,last_uid:99,last_check:'2026-10-15T10:00:00.000Z'}},acc.id);
 // a pessoa troca para Conta Google no formulario aberto antes
 const saved=w.save({...opened,data:{...opened.data,provider:'gmail_google'},base_data:opened.data,base_title:opened.title},acc.id);
 assert.equal(saved.data.provider,'gmail_google');assert.equal(saved.data.last_uid,99,'campo automatico preservado');
 // outro aparelho muda um campo de verdade: agora o conflito aparece
 const now2=w.get(acc.id);w.save({revision:now2.revision,data:{...now2.data,address:'outro@gmail.com'}},acc.id);
 assert.throws(()=>w.save({...saved,data:{...saved.data,provider:'gmail'},base_data:saved.data,base_title:saved.title},acc.id),/outro aparelho/);
});
