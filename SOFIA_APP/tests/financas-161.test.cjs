'use strict';
// 0.3.161: ciclo do recebimento, contas fixas, Saldo do ciclo, meta e passo a passo.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const f=load('src/lib/finance.ts');
const acc=(cycle=25,initial=0)=>f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:initial,include_total:true,cycle_day:cycle}});
const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'Contas',recurrence:'none',...extra}});
test('ciclo comeca no dia em que a pessoa recebe e se adapta a meses curtos',()=>{
  assert.equal(JSON.stringify(f.cycleRange(25,'2026-10-17')),JSON.stringify({start:'2026-09-25',end:'2026-10-24',label:'até 24/10'}));
  assert.equal(JSON.stringify(f.cycleRange(25,'2026-10-26')),JSON.stringify({start:'2026-10-25',end:'2026-11-24',label:'até 24/11'}));
  assert.equal(f.cycleRange(31,'2026-02-15').end,'2026-02-27','fevereiro cai no ultimo dia');
  assert.equal(f.cycleRange(0,'2026-10-17').start,'2026-10-01','sem dia: mes do calendario');
});
test('contas fixas: total do ciclo, pagas e proporcao do que entrou',()=>{
  const txs=[tx('Salario','income',6000,'2026-09-25'),
    tx('Aluguel','expense',1800,'2026-09-28',{recurrence:'monthly'}),
    tx('Academia','expense',150,'2026-10-10',{recurrence:'monthly',paid:false}),
    tx('Padaria','expense',40,'2026-10-02')];
  const s=f.fixedSummary(txs,'a1',f.cycleRange(25,'2026-10-17'));
  assert.equal(s.bills.length,2);assert.equal(s.total,1950);assert.equal(s.paid,1800);assert.equal(s.open,150);
  assert.equal(s.income,6000);assert.ok(Math.abs(s.share-0.325)<0.001);
});
test('Saldo do ciclo: teto desconta fixas e aporte; gasto variavel esvazia; estouro vira "over"',()=>{
  const txs=[tx('Salario','income',6000,'2026-09-25'),
    tx('Aluguel','expense',1800,'2026-09-28',{recurrence:'monthly'}),
    tx('Mercado','expense',500,'2026-10-02')];
  const r=f.cycleRoom(txs,'a1',f.cycleRange(25,'2026-10-17'),4000,0);
  assert.equal(r.income,6000);assert.equal(r.fixed,1800);assert.equal(r.plan,4000);
  assert.equal(r.ceiling,200,'6000 - 1800 - 4000');assert.equal(r.spent,500);assert.equal(r.left,-300);assert.equal(r.over,300);
  const folga=f.cycleRoom([txs[0],txs[1]],'a1',f.cycleRange(25,'2026-10-17'),0,0);
  assert.equal(folga.ceiling,4200);assert.equal(folga.pct,1);
});
test('meta: projecao no ritmo atual e quanto por mes fecharia no prazo',()=>{
  const g=f.toGoal({id:'g1',kind:'fin_goal',title:'Guardado',state:'active',data:{role:'reserve',saved:15000,target:39000,deadline:'2027-03-31'}});
  const o=f.reserveOutlook(g,19000,4000,'2026-10-17');
  assert.equal(o.missing,20000);assert.equal(o.months,5);assert.equal(o.atCurrent,39000);assert.equal(o.neededMonthly,4000);assert.equal(o.onTrack,true);
  const curto=f.reserveOutlook(g,19000,3000,'2026-10-17');
  assert.equal(curto.atCurrent,34000);assert.equal(curto.onTrack,false);assert.equal(curto.neededMonthly,4000);assert.equal(curto.reachDate,'2027-05');
  assert.equal(f.reserveOutlook(f.toGoal({id:'g2',kind:'fin_goal',title:'x',state:'active',data:{role:'reserve',saved:0}}),0,0),null,'sem meta nao calcula');
});
test('telas: cartao Saldo, secao de contas fixas, meta e passo a passo com 7 etapas',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('>Saldo</Text>')&&s.includes('cycleRoom(d.txs, accountId, cycleRange(cycleDay, today)'),'cartao do ciclo');
  assert.ok(s.includes('além do que havia'),'mostra o estouro');
  assert.ok(s.includes('<Title text="Contas fixas" />')&&s.includes('Total do ciclo'));
  assert.ok(s.includes('Meta: {show(outlook.target)}')&&s.includes('Para fechar no prazo:'));
  assert.ok(s.includes("{title: 'Quando você recebe'")&&s.includes("{title: 'Tudo pronto'"));
  assert.ok(s.includes('Passo {step + 1} de {steps.length}')&&s.includes('Pular o resto'));
  assert.ok(s.includes('Refazer a configuração'),'reabre ja preenchido em Contas e cartoes');
  assert.ok(s.includes('Dia em que você recebe (opcional)'),'campo no cadastro da conta');
});
