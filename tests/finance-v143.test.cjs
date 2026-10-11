'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const save=(core,kind,data,title='x')=>core.workspace.save({kind,title,area:'Pessoal',data});
test('finanças: contas, cartões e lançamentos válidos salvam e ficam privados',t=>{
 const {core}=fixture(t);
 const acc=save(core,'fin_account',{account_type:'corrente',initial_balance:'1500.50',include_total:true},'Nubank');
 const card=save(core,'fin_card',{limit:5000,closing_day:3,due_day:10,account_id:acc.id},'Visa');
 const tx=save(core,'fin_tx',{kind:'expense',amount:89.9,date:'2026-10-05',category:'Alimentação',card_id:card.id,invoice_month:'2026-11',paid:false},'Almoço');
 assert.equal(core.workspace.get(acc.id).privacy,'private');
 assert.equal(core.workspace.get(tx.id).data.invoice_month,'2026-11');
 save(core,'fin_tx',{kind:'card_payment',amount:89.9,date:'2026-11-10',card_id:card.id,invoice_month:'2026-11',account_id:acc.id,paid:true},'Fatura');
 save(core,'fin_budget',{category:'Alimentação',limit:800},'Alimentação');
 save(core,'fin_goal',{target:10000,saved:1500},'Viagem');
});
test('finanças: recusa lançamento sem valor, sem data, transferência para a mesma conta e cartão sem dias',t=>{
 const {core}=fixture(t);
 const acc=save(core,'fin_account',{},'Conta');
 assert.throws(()=>save(core,'fin_tx',{kind:'expense',date:'2026-10-01',account_id:acc.id}),/maior que zero/);
 assert.throws(()=>save(core,'fin_tx',{kind:'expense',amount:10,account_id:acc.id}),/data/);
 assert.throws(()=>save(core,'fin_tx',{kind:'expense',amount:10,date:'2026-10-01'}),/conta ou o cartão/);
 assert.throws(()=>save(core,'fin_tx',{kind:'transfer',amount:10,date:'2026-10-01',account_id:acc.id,to_account_id:acc.id}),/diferentes/);
 assert.throws(()=>save(core,'fin_card',{limit:100,closing_day:0,due_day:10}),/entre 1 e 31/);
 assert.throws(()=>save(core,'fin_account',{initial_balance:'abc'}),/Saldo inicial/);
 assert.throws(()=>save(core,'fin_tx',{kind:'expense',amount:10,date:'2026-10-01',account_id:acc.id,installments:100}),/72/);
});
