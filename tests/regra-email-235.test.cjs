'use strict';
// 0.3.235: apagar uma regra que ja encontrou e-mails funciona; os e-mails ficam, sem o vinculo.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('apagar regra com e-mail encontrado',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const acc=w.save({kind:'mail_account',title:'Gmail',area:'Pessoal',data:{address:'eu@example.com',provider:'gmail'}});
 const rule=w.save({kind:'mail_rule',title:'enjoythevoid',area:'Pessoal',data:{field:'from',contains:'enjoythevoid'}});
 const hit=w.save({kind:'mail_hit',title:'Oi',area:'Pessoal',state:'new',data:{from_name:'Pedro',from_addr:'x@example.com',snippet:'',received_at:'',account_id:acc.id,rule_id:rule.id,rule_names:'enjoythevoid',message_key:'k1',important:false}});
 w.deleteEntity(rule.id);
 assert.throws(()=>w.get(rule.id));
 assert.equal(w.get(hit.id).data.rule_id,'','o e-mail encontrado fica, sem o vinculo');
});
