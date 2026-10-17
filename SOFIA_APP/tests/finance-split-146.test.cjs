'use strict';
// 0.3.154: o guardado e INDEPENDENTE das contas. Exemplo do pedido: R$ 15.000 guardados (fora das contas),
// entra R$ 6.000, guarda R$ 4.000 -> guardado R$ 19.000, saldo geral R$ 2.000, total organizado R$ 21.000.
const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
test('guardado independente das contas; guardar/retirar passam dinheiro entre o guardado e o saldo geral',()=>{
  const f=load('src/lib/finance.ts');
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:0,include_total:true}});
  const tx=(id,kind,amount,date,paid=true,desc='x')=>f.toTx({id,kind:'fin_tx',title:desc,state:'active',data:{kind,amount,date,account_id:'a1',paid,category:'Outros',recurrence:'none'}});
  const txs=[tx('t1','income',6000,'2026-10-05'),tx('t2','expense',1500,'2026-10-25',false,'Aluguel')];
  const reserve=f.toGoal({id:'g1',kind:'fin_goal',title:'Dinheiro guardado',state:'active',data:{role:'reserve',saved:15000,monthly_plan:4000}});
  const mv=(id,dir,amount,date)=>f.toReserveMove({id,kind:'fin_reserve_move',title:id,state:'active',data:{goal_id:'g1',direction:dir,amount,date}});
  // so o valor inicial: o guardado NAO desconta do saldo geral (antes dava -13.100)
  let s=f.moneySplit(reserve,[],[acc],txs,[], '2026-10','2026-10-15');
  assert.equal(s.saved,15000);assert.equal(s.daily,6000);assert.equal(s.total,21000);assert.equal(s.realized,0);assert.equal(s.missing,4000);
  // guardar 4.000 sai do saldo geral e soma no guardado
  const aporte=mv('m1','in',4000,'2026-10-06');
  s=f.moneySplit(reserve,[aporte],[acc],txs,[], '2026-10','2026-10-15');
  assert.equal(s.saved,19000);assert.equal(s.daily,2000);assert.equal(s.total,21000);
  assert.equal(s.committed,1500);assert.equal(s.free,500);assert.equal(s.realized,4000);assert.equal(s.missing,0);
  // retirada devolve ao saldo geral
  s=f.moneySplit(reserve,[aporte,mv('m2','out',1000,'2026-10-27')],[acc],txs,[], '2026-10','2026-10-27');
  assert.equal(s.saved,18000);assert.equal(s.daily,3000);assert.equal(s.total,21000);
  // o caso do print: so R$ 1.900 na conta e R$ 15.000 guardados -> saldo geral continua R$ 1.900
  const pouco=[tx('r1','income',1900,'2026-10-01')];
  s=f.moneySplit(reserve,[],[acc],pouco,[], '2026-10','2026-10-16');
  assert.equal(s.daily,1900);assert.equal(s.saved,15000);assert.equal(s.total,16900);assert.ok(s.daily>=0);
});
