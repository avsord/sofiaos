'use strict';
// 0.3.151: fecha os pontos do pedido de Financas que faltavam na 0.3.150.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const load=require('./load-ts.cjs');
test('pendencias a receber entram na lista, com o tipo certo',()=>{
  const f=load('src/lib/finance.ts');
  const tx=(id,kind,date)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount:100,date,account_id:'a1',paid:false,category:'Contas',recurrence:'none',import_id:'sofia-pendencia:'+id,remind_days:3}});
  const list=f.manualDues([tx('boleto','expense','2026-10-20'),tx('freela','income','2026-10-22')],'a1','2026-10-16',30);
  assert.equal(JSON.stringify(list.map(d=>d.kind)),'["pagar","receber"]');assert.equal(list[0].tx.remindDays,3);
});
test('cada conta tem o proprio guardado; a principal mantem a reserva antiga',()=>{
  const f=load('src/lib/finance.ts');
  const g=(id,account)=>f.toGoal({id,kind:'fin_goal',title:id,state:'active',data:{role:'reserve',saved:100,account_id:account}});
  const goals=[g('antiga',''),g('esposa','a2')];
  assert.equal(f.reserveFor(goals,'a1',true).id,'antiga');assert.equal(f.reserveFor(goals,'a2',false).id,'esposa');assert.equal(f.reserveFor(goals,'a3',false),null);
});
test('aviso alguns dias antes e no dia; faixa laranja com "faltam no mes"; card da Sofia no Resumo',()=>{
  const n=read('src/lib/finance-notifications.ts'),s=read('src/screens/Finance.tsx');
  assert.ok(n.includes("for (const offset of before ? [before, 0] : [0])"));
  assert.ok(s.includes("{value:'3',label:'3 dias antes'}"));assert.ok(s.includes("{value:'income',label:'A receber'}"));
  assert.ok(s.includes('faltam {show(split.missing)} no mês'));assert.ok(s.includes('const reserve = reserveFor(d.goals, accountId, isPrimary);'));
  assert.ok(s.includes('A Sofia sobre o seu mês'));
});
