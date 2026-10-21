'use strict';
// 0.3.227: cadastrar de novo a mesma conta/receita fixa (mesmo nome, valor e dia) nao cria outra.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('receita fixa igual nao duplica; com outro valor ou outro dia, cria',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const conta=w.save({kind:'fin_account',title:'Conta',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true}});
 const base={kind:'income',amount:1853.94,date:'2026-11-12',account_id:conta.id,paid:false,category:'Aluguel',recurrence:'monthly'};
 const a=w.save({kind:'fin_tx',title:'Quinto andar (aluguel)',area:'Pessoal',data:{...base,import_id:'sofia-pendencia:a'}});
 const b=w.save({kind:'fin_tx',title:'Quinto Andar(aluguel)',area:'Pessoal',data:{...base,import_id:'sofia-pendencia:b'}});
 assert.equal(b.id,a.id,'mesmo nome (sem diferenca de maiuscula/espaco), valor e dia: devolve a que ja existe');
 const c=w.save({kind:'fin_tx',title:'Quinto andar (aluguel)',area:'Pessoal',data:{...base,amount:1853.54,import_id:'sofia-pendencia:c'}});
 assert.notEqual(c.id,a.id,'valor diferente: e outra');
 assert.equal(w.list({kind:'fin_tx',limit:10}).length,2);
});
