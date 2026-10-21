'use strict';
// 0.3.222: apagar a regra nunca fica preso ("ainda e usado por..."), mesmo com e-mail antigo que nao passaria na validacao
// de hoje; a estrela que veio da regra sai e os e-mails ficam. Cada e-mail aceita um emoji proprio.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('apagar regra solta os e-mails direto no banco e tira a estrela',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const acc=w.save({kind:'mail_account',title:'Gmail',area:'Pessoal',data:{address:'eu@example.com',provider:'gmail'}});
 const rule=w.save({kind:'mail_rule',title:'Contas e faturas',area:'Pessoal',data:{field:'any',contains:'fatura',important:true}});
 const hit=w.save({kind:'mail_hit',title:'Pedro, seus impostos ja estao disponiveis',area:'Pessoal',state:'read',data:{from_name:'Receita',from_addr:'x@example.com',snippet:'',received_at:'',account_id:acc.id,rule_id:rule.id,rule_names:'Contas e faturas',message_key:'k1',important:true}});
 // e-mail gravado por versao antiga com campo que hoje seria recusado
 w.db.prepare('UPDATE entities SET data=? WHERE id=?').run(JSON.stringify({...w.get(hit.id).data,legacy_field:'x'}),hit.id);
 w.deleteEntity(rule.id);
 assert.throws(()=>w.get(rule.id));
 const h=w.get(hit.id);
 assert.equal(h.data.rule_id,'');assert.equal(h.data.important,false,'a estrela sai');assert.equal(h.data.rule_names,'');
 assert.equal(h.title,'Pedro, seus impostos ja estao disponiveis','o e-mail continua');
 const {legacy_field,...clean}=w.get(hit.id).data;
 const saved=w.save({...w.get(hit.id),data:{...clean,emoji:'🔥'}},hit.id);
 assert.equal(saved.data.emoji,'🔥','emoji proprio do e-mail');
});

test('0.3.223: regra com emoji proprio - o e-mail encontrado vem com ele; apagar a regra tira esse emoji',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const acc=w.save({kind:'mail_account',title:'Gmail',area:'Pessoal',data:{address:'eu@example.com',provider:'gmail'}});
 const rule=w.save({kind:'mail_rule',title:'Impostos',area:'Pessoal',data:{field:'any',contains:'imposto',important:true,emoji:'🧾'}});
 assert.equal(w.get(rule.id).data.emoji,'🧾');
 const hit=w.save({kind:'mail_hit',title:'DAS',area:'Pessoal',state:'new',data:{from_name:'Receita',from_addr:'x@example.com',snippet:'',received_at:'',account_id:acc.id,rule_id:rule.id,rule_names:'Impostos',message_key:'k2',important:true,emoji:'🧾'}});
 w.deleteEntity(rule.id);
 const h=w.get(hit.id);assert.equal(h.data.emoji,'');assert.equal(h.data.important,false);assert.equal(h.title,'DAS');
});
