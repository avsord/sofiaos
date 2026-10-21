'use strict';
// 0.3.215: receita avulsa pode mandar uma parte para o guardado; apagar a receita apaga o aporte ligado a ela.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('apagar a receita apaga so o aporte que veio dela',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const conta=w.save({kind:'fin_account',title:'Conta',area:'Pessoal',data:{account_type:'corrente',initial_balance:'1000',include_total:true}});
 const meta=w.save({kind:'fin_goal',title:'Reserva',area:'Pessoal',data:{target:40000}});
 const outro=w.save({kind:'fin_reserve_move',title:'Aporte',area:'Pessoal',data:{goal_id:meta.id,direction:'in',amount:500,date:'2026-10-20'}});
 const rec=w.save({kind:'fin_tx',title:'Freela',area:'Pessoal',data:{kind:'income',amount:1000,date:'2026-10-21',account_id:conta.id,paid:true,category:'Freelance',recurrence:'none',reserve_part:300}});
 const mv=w.save({kind:'fin_reserve_move',title:'Guardado na reserva',area:'Pessoal',data:{goal_id:meta.id,direction:'in',amount:300,date:'2026-10-21',note:'Da receita: Freela',planned:false,income_id:rec.id}});
 assert.equal(w.list({kind:'fin_reserve_move',limit:10}).length,2);
 w.deleteEntity(rec.id);
 const left=w.list({kind:'fin_reserve_move',limit:10});assert.equal(left.length,1);assert.equal(left[0].id,outro.id,'o aporte de outra origem fica');
});
