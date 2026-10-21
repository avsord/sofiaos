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

test('0.3.230: copias identicas de uma fixa (sem pagamento) somem sozinhas; a de valor diferente fica para a pessoa decidir',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const conta=w.save({kind:'fin_account',title:'Conta',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true}});
 const base={kind:'income',amount:1853.94,date:'2026-11-12',account_id:conta.id,paid:false,category:'Contas',recurrence:'monthly',installments:5,installment:1};
 // copias antigas, de antes da trava (gravadas direto no banco como o app antigo fazia)
 const ids=[];for(const n of [1,2,3]){const e=w.save({kind:'fin_tx',title:'Quinto andar (aluguel)',area:'Pessoal',data:{...base,import_id:'sofia-pendencia:x'+n,date:'2026-11-1'+n}});ids.push(e.id);}
 for(const id of ids){const e=w.get(id);w.save({revision:e.revision,data:{...e.data,date:'2026-11-12'}},id);}
 const outra=w.save({kind:'fin_tx',title:'Quinto Andar(aluguel)',area:'Pessoal',data:{...base,amount:1853.54,installments:'',installment:'',import_id:'sofia-pendencia:y',date:'2026-11-13'}});
 w.repairFinanceDuplicates();
 const left=w.list({kind:'fin_tx',limit:20}).filter(e=>e.state!=='archived');
 assert.equal(left.filter(e=>Number(e.data.amount)===1853.94).length,1,'das tres iguais fica uma');
 assert.ok(left.some(e=>e.id===outra.id),'a de valor diferente fica');
 assert.ok(left.some(e=>e.id===ids[0]),'fica a mais antiga');
});
