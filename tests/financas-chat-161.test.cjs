'use strict';
// 0.3.161: a Sofia responde sobre guardado/meta/fixas e registra aporte pelo chat.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const bridge=require('../src/core/app-bridge.js');
function setup(t){
 const {core}=fixture(t);const w=core.workspace;
 const acc=w.save({kind:'fin_account',title:'Conta',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true,cycle_day:25}});
 const today=new Date().toISOString().slice(0,10),month=today.slice(0,7);
 w.save({kind:'fin_tx',title:'Salario',area:'Pessoal',data:{kind:'income',amount:6000,date:month+'-02',account_id:acc.id,paid:true,category:'Salário',recurrence:'none'}});
 w.save({kind:'fin_tx',title:'Aluguel',area:'Pessoal',data:{kind:'expense',amount:1800,date:month+'-05',account_id:acc.id,paid:true,category:'Moradia',recurrence:'monthly'}});
 const r=w.save({kind:'fin_goal',title:'Dinheiro guardado',area:'Pessoal',data:{role:'reserve',saved:15000,monthly_plan:4000,plan_day:5,target:39000,deadline:'2027-03-31'}});
 return {w,acc,r,month};
}
test('resumo de financas traz guardado, aporte do mes, meta com as duas projecoes e contas fixas',t=>{
 const {w,r,month}=setup(t);
 w.save({kind:'fin_reserve_move',title:'Aporte',area:'Pessoal',data:{goal_id:r.id,direction:'in',amount:2500,date:month+'-06'}});
 const out=bridge.query(w,null,'finance',{});
 assert.match(out.reply,/Dinheiro guardado: R\$[\s\u00a0]?17\.500/);
 assert.match(out.reply,/Aporte deste mês: R\$[\s\u00a0]?2\.500,00 de R\$[\s\u00a0]?4\.000/);
 assert.match(out.reply,/faltam R\$[\s\u00a0]?1\.500/);
 assert.match(out.reply,/Meta: R\$[\s\u00a0]?39\.000/);assert.match(out.reply,/para fechar no prazo/);
 assert.match(out.reply,/Contas fixas do mês: R\$[\s\u00a0]?1\.800,00 \(30% do que entrou\)/);
});
test('retirada a recompor aumenta o alvo do mes; a planejada nao',t=>{
 const {w,r,month}=setup(t);
 w.save({kind:'fin_reserve_move',title:'Retirada',area:'Pessoal',data:{goal_id:r.id,direction:'out',amount:1000,date:month+'-10'}});
 assert.match(bridge.query(w,null,'finance',{}).reply,/de R\$[\s\u00a0]?5\.000/);
 w.save({kind:'fin_reserve_move',title:'Compra',area:'Pessoal',data:{goal_id:r.id,direction:'out',amount:10000,date:month+'-11',planned:true}});
 const out=bridge.query(w,null,'finance',{}).reply;
 assert.match(out,/de R\$[\s\u00a0]?5\.000/,'a planejada nao soma ao alvo');
 assert.match(out,/Dinheiro guardado: R\$[\s\u00a0]?4\.000/,'mas sai do guardado');
});
test('a Sofia conhece o tipo do aporte para registrar pelo chat',()=>{
 const ctx=bridge.appsContext({list:()=>[]},null).content;
 assert.match(ctx,/fin_reserve_move/);assert.match(ctx,/direction=in \(guardar\) ou out \(retirar\)/);
 assert.match(ctx,/role=reserve/);
});
