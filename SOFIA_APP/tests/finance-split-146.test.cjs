'use strict';
// 0.3.146: o exemplo do pedido - R$ 15.000 guardados, entra R$ 6.000, guarda R$ 4.000; R$ 1.500 a pagar.
const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
test('Dinheiro guardado R$ 19.000, dia a dia R$ 2.000, total R$ 21.000, comprometido R$ 1.500, livre R$ 500',()=>{
  const f=load('src/lib/finance.ts');
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:15000,include_total:true}});
  const tx=(id,kind,amount,date,paid=true,desc='x')=>f.toTx({id,kind:'fin_tx',title:desc,state:'active',data:{kind,amount,date,account_id:'a1',paid,category:'Outros',recurrence:'none'}});
  const txs=[tx('t1','income',6000,'2026-10-05'),tx('t2','expense',1500,'2026-10-25',false,'Aluguel')];
  const reserve=f.toGoal({id:'g1',kind:'fin_goal',title:'Dinheiro guardado',state:'active',data:{role:'reserve',saved:15000,monthly_plan:4000}});
  const move=f.toReserveMove({id:'m1',kind:'fin_reserve_move',title:'Aporte',state:'active',data:{goal_id:'g1',direction:'in',amount:4000,date:'2026-10-06'}});
  // antes de registrar o aporte: planejar R$ 4.000 nao muda nada
  let s=f.moneySplit(reserve,[],[acc],txs,[], '2026-10','2026-10-15');
  assert.equal(s.saved,15000);assert.equal(s.total,21000);assert.equal(s.daily,6000);assert.equal(s.realized,0);assert.equal(s.missing,4000);
  s=f.moneySplit(reserve,[move],[acc],txs,[], '2026-10','2026-10-15');
  assert.equal(s.saved,19000);assert.equal(s.daily,2000);assert.equal(s.total,21000,'guardar nao muda o total');
  assert.equal(s.committed,1500);assert.equal(s.free,500);assert.equal(s.realized,4000);assert.equal(s.missing,0);assert.equal(s.shortfall,0);
  // pagar a despesa prevista: sai do dia a dia, uma vez so; a reserva nao muda
  const paid=[txs[0],tx('t2','expense',1500,'2026-10-25',true,'Aluguel')];
  s=f.moneySplit(reserve,[move],[acc],paid,[], '2026-10','2026-10-26');
  assert.equal(s.saved,19000);assert.equal(s.daily,500);assert.equal(s.committed,0);assert.equal(s.free,500);
  // retirada intencional: volta para o dia a dia, total igual
  const out=f.toReserveMove({id:'m2',kind:'fin_reserve_move',title:'Retirada',state:'active',data:{goal_id:'g1',direction:'out',amount:1000,date:'2026-10-27'}});
  s=f.moneySplit(reserve,[move,out],[acc],paid,[], '2026-10','2026-10-27');
  assert.equal(s.saved,18000);assert.equal(s.daily,1500);assert.equal(s.total,19500);
  // falta dinheiro no dia a dia: mostra a falta, nao usa a reserva
  const tight=[txs[0],tx('t3','expense',3000,'2026-10-28',false,'Conserto')];
  s=f.moneySplit(reserve,[move],[acc],tight,[], '2026-10','2026-10-27');
  assert.equal(s.daily,2000);assert.equal(s.committed,3000);assert.equal(s.shortfall,1000);assert.equal(s.saved,19000);
});
