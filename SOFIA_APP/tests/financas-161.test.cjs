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

test('0.3.162: corrigir ou apagar um movimento reajusta o guardado e o aporte do mes',()=>{
  const acc2=f.toAccount({id:'a1',kind:'fin_account',title:'C',state:'active',data:{account_type:'corrente',initial_balance:0,include_total:true}});
  const reserve=f.toGoal({id:'g1',kind:'fin_goal',title:'R',state:'active',data:{role:'reserve',saved:15000,monthly_plan:4000}});
  const mv=(id,dir,amount,date,planned=false)=>f.toReserveMove({id,kind:'fin_reserve_move',title:id,state:'active',data:{goal_id:'g1',direction:dir,amount,date,planned}});
  const split=m=>f.moneySplit(reserve,m,[acc2],[],[], '2026-10','2026-10-20',[]);
  const errado=split([mv('m1','in',20000,'2026-10-05')]);
  assert.equal(errado.saved,35000);assert.equal(errado.realized,20000);
  const corrigido=split([mv('m1','in',2000,'2026-10-05')]);
  assert.equal(corrigido.saved,17000);assert.equal(corrigido.realized,2000);assert.equal(corrigido.missing,2000);
  const apagado=split([]);
  assert.equal(apagado.saved,15000);assert.equal(apagado.realized,0);assert.equal(apagado.missing,4000);
  // trocar "a recompor" por "planejada" tira a retirada da conta do mes, sem mexer no guardado
  const recompor=split([mv('m2','out',1000,'2026-10-10')]),planejada=split([mv('m2','out',1000,'2026-10-10',true)]);
  assert.equal(recompor.saved,planejada.saved);assert.equal(recompor.monthTarget,5000);assert.equal(planejada.monthTarget,4000);
});
test('0.3.162: historico abre a edicao do movimento, com apagar',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("accessibilityLabel={'Editar ' + reserveMoveLabel(it) + ' de ' + show(it.amount)}"));
  assert.ok(s.includes('Apagar movimento'));assert.ok(s.includes('o dinheiro guardado volta ao valor de antes'));
  assert.ok(s.includes('<DateTimeField label="Data" value={date} onChange={v => setDate(v || date)} dateOnly allowClear={false} />'),'0.3.172: data pelo seletor');
  assert.ok(s.includes("Toque em um movimento para corrigir o valor, a data ou apagá-lo."));
});

test('0.3.165: conta fixa com prazo conta as parcelas e acaba sozinha',()=>{
  const bill=(id,date,paid,extra={})=>f.toTx({id,kind:'fin_tx',title:'Cartão',state:'active',
    data:{kind:'expense',amount:500,date,account_id:'a1',paid,category:'Contas',recurrence:'monthly',installments:10,recurrence_end:'2027-05',...extra}});
  // primeira parcela em agosto/2026; em outubro estamos na 3a
  const txs=[bill('p1','2026-08-10',true),bill('p2','2026-09-10',true,{series_id:'p1'}),bill('p3','2026-10-10',false,{series_id:'p1'})];
  const out=f.fixedBills(txs,'a1',{start:'2026-10-01',end:'2026-10-31'});
  assert.equal(out.length,1);
  const b=out[0];assert.equal(b.installments,10);assert.equal(b.index,1,'index sai da data da propria parcela quando ela e a primeira do registro');
  // usando o campo data.date da serie (primeira parcela) o indice fica correto
  const serie=f.fixedBills([f.toTx({id:'p3',kind:'fin_tx',title:'Cartão',state:'active',
    data:{kind:'expense',amount:500,date:'2026-10-10',account_id:'a1',paid:false,category:'Contas',recurrence:'monthly',installments:10}})],'a1',{start:'2026-10-01',end:'2026-10-31'});
  assert.equal(serie[0].left,10,'a pagar: conta a propria parcela');
  assert.equal(f.lastInstallmentMonth('2026-08-10',10),'2027-05','para de se repetir na 10a');
  assert.equal(f.monthsBetween('2026-08','2026-10'),2);
});
test('0.3.165: tela e avisos das parcelas',()=>{
  const s=read('src/screens/Finance.tsx'),n=read('src/lib/finance-notifications.ts');
  assert.ok(s.includes('Parcelas (opcional)'));
  assert.ok(s.includes("parcela '+b.index+' de '+b.installments"));
  assert.ok(s.includes('A Sofia avisa quando terminar.'));
  assert.ok(n.includes("due.title + ' acabou"));assert.ok(n.includes("'Última parcela de '"));
});

test('0.3.166: conta que ja esta no meio ("3 de 10") conta certo e termina na decima',()=>{
  const tx=f.toTx({id:'p1',kind:'fin_tx',title:'Cartão',state:'active',
    data:{kind:'expense',amount:500,date:'2026-10-10',account_id:'a1',paid:false,category:'Contas',recurrence:'monthly',installments:10,installment:3}});
  const b=f.fixedBills([tx],'a1',{start:'2026-10-01',end:'2026-10-31'})[0];
  assert.equal(b.index,3);assert.equal(b.left,8,'a pagar: a 3a mais as 7 seguintes');
  const pago=f.fixedBills([{...tx,paid:true}],'a1',{start:'2026-10-01',end:'2026-10-31'})[0];
  assert.equal(pago.left,7,'depois de pagar a 3a, faltam 7');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('Esta é a parcela nº'),'campo ao criar e ao editar');
  assert.ok(s.includes('Conta com prazo (ex.: 10x)?'),'tambem no passo a passo');
});

test('0.3.176: pendencias seguem o mes do topo; no mes atual entram as atrasadas',()=>{
  const p=(id,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind:'expense',amount:100,date,account_id:'a1',paid:false,category:'Contas',recurrence:'none',import_id:'sofia-pendencia:'+id,...extra}});
  const txs=[p('atrasada','2026-09-20'),p('outubro','2026-10-25'),p('novembro','2026-11-05'),p('academia','2026-10-10',{recurrence:'monthly'})];
  const titles=m=>f.monthDues(txs,'a1',m,'2026-10-17').map(d=>d.title).join(',');
  assert.equal(titles('2026-10'),'atrasada,academia,outubro');
  assert.equal(titles('2026-11'),'novembro,academia','outro mes: so o dele, com as fixas daquele mes');
  assert.equal(titles('2026-12'),'academia');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('monthDues(d.txs,accountId,month,today)'));
  assert.ok(s.includes("'Pendentes de '+monthLabel(month)"));
});

test('0.3.177: ao pagar, a conta fica verde e continua na lista do mes',()=>{
  const p=(id,date,paid=false)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind:'expense',amount:100,date,account_id:'a1',paid,category:'Contas',recurrence:'none',import_id:'sofia-pendencia:'+id}});
  const list=f.monthDues([p('atrasada','2026-09-20'),p('paga-setembro','2026-09-05',true),p('outubro','2026-10-25'),p('paga-outubro','2026-10-02',true)],'a1','2026-10','2026-10-17');
  assert.equal(list.map(d=>d.title).join(','),'atrasada,paga-outubro,outubro','paga de setembro nao vem para outubro');
  const paga=list.find(d=>d.title==='paga-outubro');assert.equal(paga.paid,true);assert.equal(paga.late,false);
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("if (due.paid) return ("),'linha propria para paga');
  assert.ok(s.includes("backgroundColor: GOOD + '1a'"),'verde');
  assert.ok(s.includes("import_id: t.manualDue ? 'sofia-pendencia:' + (t.seriesId || t.id) + ':' + t.date : ''"),'repeticao paga continua pendencia daquele mes');
  assert.ok(s.includes("paidCount?' · '+paidCount"),'cabecalho separa pendentes e pagas');
});
