'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const f={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/finance.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:f,Date,Math,JSON,Number,String,Map,Set,Array,Object});
const eq=(a,b,m)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);
const E=(kind,title,data,state='active')=>({id:title,kind,title,state,content:'',area:'Pessoal',privacy:'private',tags:[],revision:1,data});
const acc=f.toAccount(E('fin_account','Nubank',{initial_balance:'1000',include_total:true}));
const acc2=f.toAccount(E('fin_account','Poupança',{initial_balance:'500',include_total:true}));
const card=f.toCard(E('fin_card','Visa',{limit:3000,closing_day:5,due_day:12,account_id:'Nubank'}));
const tx=(id,data)=>f.toTx(E('fin_tx',id,{paid:true,recurrence:'none',...data}));

test('fatura: compra depois do fechamento vai para o mês seguinte; vencimento antes do fechamento cai no mês seguinte',()=>{
 assert.equal(f.invoiceMonth(card,'2026-10-05'),'2026-10');assert.equal(f.invoiceMonth(card,'2026-10-06'),'2026-11');
 assert.equal(f.invoiceMonth(card,'2026-12-20'),'2027-01');
 assert.equal(f.invoiceDue(card,'2026-10'),'2026-10-12');
 assert.equal(f.invoiceDue({closing:25,due:5},'2026-10'),'2026-11-05');
 assert.equal(f.dayIn('2026-02',31),'2026-02-28');
});

test('saldo: só o pago conta; cartão não mexe na conta até pagar a fatura; transferência move entre contas',()=>{
 const txs=[tx('salario',{kind:'income',amount:5000,date:'2026-10-01',account_id:'Nubank',category:'Salário'}),
  tx('aluguel',{kind:'expense',amount:2000,date:'2026-10-05',account_id:'Nubank',category:'Moradia'}),
  tx('luz',{kind:'expense',amount:150,date:'2026-10-20',account_id:'Nubank',category:'Contas',paid:false}),
  tx('jantar',{kind:'expense',amount:300,date:'2026-10-03',card_id:'Visa',category:'Alimentação',paid:false}),
  tx('guardar',{kind:'transfer',amount:700,date:'2026-10-10',account_id:'Nubank',to_account_id:'Poupança'})];
 assert.equal(f.accountBalance(acc,txs),1000+5000-2000-700);
 assert.equal(f.accountBalance(acc2,txs),1200);
 assert.equal(f.totalBalance([acc,acc2],txs),4500);
 const s=f.monthSummary(txs,'2026-10');
 eq(s,{income:5000,incomePending:0,expense:2300,expensePending:150,cardSpend:300,result:2700});
 txs.push(tx('fatura',{kind:'card_payment',amount:300,date:'2026-10-12',card_id:'Visa',invoice_month:'2026-10',account_id:'Nubank'}));
 assert.equal(f.accountBalance(acc,txs),3000);
 assert.equal(f.monthSummary(txs,'2026-10').expense,2300,'pagar a fatura não conta o gasto duas vezes');
 const inv=f.cardInvoices(card,txs,'2026-10-15').find(i=>i.month==='2026-10');assert.equal(inv.status,'paga');assert.equal(f.cardUsed(card,txs),0);
});

test('parcelas: soma exata em centavos, uma por mês, mesma data clamped',()=>{
 const p=f.installmentPlan(100,3,'2026-01-31');
 eq(p.map(x=>x.date),['2026-01-31','2026-02-28','2026-03-31']);
 assert.equal(Math.round(p.reduce((s,x)=>s+x.amount,0)*100),10000);eq(p.map(x=>x.amount),[33.34,33.33,33.33]);
});

test('recorrência: aparece prevista nos meses seguintes, some quando confirmada, respeita o fim',()=>{
 const netflix=tx('netflix',{kind:'expense',amount:55.9,date:'2026-08-15',account_id:'Nubank',category:'Assinaturas',recurrence:'monthly',recurrence_end:'2026-11'});
 let v=f.expandRecurring([netflix],'2026-10');assert.equal(v.length,1);assert.equal(v[0].date,'2026-10-15');assert.equal(v[0].virtual,true);assert.equal(v[0].paid,false);
 const conf=tx('netflix-out',{kind:'expense',amount:55.9,date:'2026-10-15',account_id:'Nubank',series_id:'netflix'});
 assert.equal(f.expandRecurring([netflix,conf],'2026-10').length,0);
 assert.equal(f.expandRecurring([netflix],'2026-12').length,0,'passou do fim');
 assert.equal(f.expandRecurring([netflix],'2026-08').length,0,'o próprio mês já tem o lançamento real');
 assert.equal(f.monthSummary([netflix],'2026-10').expensePending,55.9);
 assert.equal(f.expandRecurring([tx('w',{kind:'expense',amount:10,date:'2026-10-01',account_id:'Nubank',recurrence:'weekly'})],'2026-11').length,4);
});

test('contas a pagar: atrasadas, previstas e fatura a vencer, em ordem de data',()=>{
 const txs=[tx('luz',{kind:'expense',amount:150,date:'2026-10-08',account_id:'Nubank',paid:false}),
  tx('freela',{kind:'income',amount:800,date:'2026-10-14',account_id:'Nubank',paid:false}),
  tx('compra',{kind:'expense',amount:400,date:'2026-10-02',card_id:'Visa',paid:false})];
 const d=f.upcoming(txs,[card],'2026-10-10',7);
 eq(d.map(x=>[x.title,x.kind,x.late]),[['luz','pagar',true],['Fatura Visa','fatura',false],['freela','receber',false]]);
 assert.equal(d[1].amount,400);
});

test('categorias, orçamentos e objetivos',()=>{
 const txs=[tx('a',{kind:'expense',amount:300,date:'2026-10-02',account_id:'Nubank',category:'Alimentação'}),tx('b',{kind:'expense',amount:100,date:'2026-10-03',card_id:'Visa',category:'Alimentação'}),tx('c',{kind:'expense',amount:100,date:'2026-10-04',account_id:'Nubank',category:'Lazer'})];
 const cats=f.byCategory(txs,'2026-10');eq(cats.map(c=>[c.category.name,c.total]),[['Alimentação',400],['Lazer',100]]);assert.equal(cats[0].pct,0.8);
 const b=f.budgetProgress([f.toBudget(E('fin_budget','Alimentação',{category:'Alimentação',limit:450}))],txs,'2026-10')[0];
 assert.equal(b.state,'alerta');assert.equal(b.left,50);
 const g=f.goalProgress(f.toGoal(E('fin_goal','Viagem',{target:6000,saved:1500,deadline:'2027-04-01'})),'2026-10-11');
 assert.equal(g.left,4500);assert.equal(g.perMonth,750);
 eq(f.trend(txs,'2026-10',2).map(x=>x.expense),[0,500]);
});

test('valor digitado em reais vira número sem surpresa',()=>{
 eq(['89,90','R$ 1.234,56','1234.56','1.500','12.5','','abc'].map(f.parseMoney),[89.9,1234.56,1234.56,1500,12.5,null,null]);
});

test('campos monetários formatam milhares ao digitar e vírgula com centavos ao terminar sem alterar o valor',()=>{
  eq(['1','1911','191146','191146,5','191146,56','1.234,56','1234.5','1.234.567','0,05',''].map(f.formatMoneyInput),
    ['1','1.911','191.146','191.146,5','191.146,56','1.234,56','1.234,5','1.234.567','0,05','']);
  eq(['191.146','191.146,5','1.234,56','0,05',''].map(f.finishMoneyInput),
    ['191.146,00','191.146,50','1.234,56','0,05','']);
  assert.equal(f.parseMoney(f.finishMoneyInput(f.formatMoneyInput('191146'))),191146);
  assert.equal(f.parseMoney(f.finishMoneyInput(f.formatMoneyInput('1234,56'))),1234.56);
  assert.equal(f.parseMoney(f.finishMoneyInput(f.formatMoneyInput('0,05'))),0.05);
  assert.equal(f.formatMoneyInput('12.345,'),'12.345,');
});

test('e-mail de cobrança: lê valor e vencimento, sem inventar quando não há',()=>{
 eq(f.parseBill('Sua fatura Nubank chegou: R$ 1.234,56 — vencimento 15/10/2026','2026-10-11'),{amount:1234.56,due:'2026-10-15'});
 eq(f.parseBill('Boleto Enel R$ 189,90 vence em 05/11','2026-10-11'),{amount:189.9,due:'2026-11-05'});
 eq(f.parseBill('Conta de dezembro: vence 10/01 · total R$ 99,00','2026-12-20'),{amount:99,due:'2027-01-10'});
 eq(f.parseBill('Seu pedido foi enviado','2026-10-11'),{amount:null,due:null});
});

test('pendências são manuais e separadas de extratos, com recorrência e conta própria',()=>{
 const bill=tx('Boleto',{kind:'expense',amount:350,date:'2026-10-22',account_id:'Nubank',paid:false,import_id:'sofia-pendencia:energy'});
 const automatic=tx('Importado',{kind:'expense',amount:60,date:'2026-10-20',account_id:'Nubank',paid:false,import_id:'bank:123'});
 const other=tx('Empresa',{kind:'expense',amount:950,date:'2026-10-19',account_id:'Poupança',paid:false,import_id:'sofia-pendencia:enterprise'});
 const monthly=tx('Aluguel',{kind:'expense',amount:1200,date:'2026-09-03',account_id:'Nubank',paid:false,import_id:'sofia-pendencia:rent',recurrence:'monthly'});
 const selected=f.manualDues([bill,automatic,other,monthly],'Nubank','2026-10-16',10);
 eq(selected.map(t=>[t.title,t.amount,t.date]),[['Boleto',350,'2026-10-22']]);
 assert.ok(selected.some(t=>t.title==='Boleto') && !selected.some(t=>t.title==='Importado'));
 assert.ok(!selected.some(t=>t.title==='Empresa'),'outro titular nao deve aparecer');
 const november=f.manualDues([monthly],'Nubank','2026-11-01',15);
 assert.ok(november.some(t=>t.date==='2026-11-03' && t.tx.virtual),'o lembrete mensal se repete');
 assert.equal(f.accountBalance(acc,[bill,automatic]),1000,'nenhuma pendência reduz o saldo sem pagamento');
});
test('seletor isola históricos pessoais e empresa, inclusive cartões da conta',()=>{
 const mine=tx('Mercado',{kind:'expense',amount:40,date:'2026-10-02',account_id:'Nubank'});
 const hers=tx('Esposa',{kind:'expense',amount:90,date:'2026-10-04',account_id:'Poupança'});
 const cardTx=tx('Notebook',{kind:'expense',amount:300,date:'2026-10-03',card_id:'Visa',paid:false});
 const mineOnly=f.transactionsForAccount([mine,hers,cardTx],[card],'Nubank');
 eq(mineOnly.map(x=>x.desc),['Mercado','Notebook']);
 assert.equal(f.totalBalance([acc],mineOnly),960);
 eq(f.transactionsForAccount([mine,hers,cardTx],[card],'Poupança').map(x=>x.desc),['Esposa']);
});
test('orientação financeira usa lançamentos reais, não pendências que ainda não ocorreram',()=>{
 const arr=[tx('sal',{kind:'income',amount:1500,date:'2026-10-01',account_id:'Nubank'}),tx('alimento',{kind:'expense',amount:1100,date:'2026-10-02',account_id:'Nubank',category:'Alimentação'}),tx('boleto futuro',{kind:'expense',amount:3000,date:'2026-10-26',account_id:'Nubank',paid:false,import_id:'sofia-pendencia:later'})];
 const tips=f.financeInsights(arr,'2026-10');
 assert.ok(tips.some(x=>x.tone==='good'&&x.text.includes('dentro das receitas')));
 assert.ok(tips.some(x=>x.text.includes('Alimentação')));
 assert.ok(!tips.some(x=>x.text.includes('superaram as receitas')),'pendencia futura nao cria aconselhamento falso');
});
test('máscara em português preserva milhares após apagar',()=>{
 assert.equal(f.formatMoneyInput('1.23','1.234'),'123');
 assert.equal(f.formatMoneyInput('1.00','1.000'),'100');
 assert.equal(f.formatMoneyInput('1.234.','1.234'),'1.234,');
 assert.equal(f.formatMoneyInput('1.234,5','1.234,'),'1.234,5');
});
