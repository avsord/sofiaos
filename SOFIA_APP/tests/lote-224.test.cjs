'use strict';
// 0.3.224: limite do cartao como no banco; fatura fechada e paga nao reabre; Apps dentro de Financas volta ao Resumo/topo.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const f=require('./load-ts.cjs')('src/lib/finance.ts');
const E=(kind,id,data)=>({id,kind,title:id,state:'active',content:'',area:'Pessoal',privacy:'private',tags:[],revision:1,data});
const inter=f.toCard(E('fin_card','Inter',{limit:16000,closing_day:9,due_day:15,account_id:'a1'}));
const bill=(id,amount,date='2026-10-11',extra={})=>f.toTx(E('fin_tx',id,{kind:'expense',amount,date,account_id:'a1',card_id:'Inter',paid:false,recurrence:'none',category:'Contas',import_id:'sofia-pendencia:'+id,...extra}));
const pay=(amount,month)=>f.toTx(E('fin_tx','pg'+month,{kind:'card_payment',amount,date:'2026-10-14',account_id:'a1',card_id:'Inter',invoice_month:month,paid:true}));

test('conta esquecida numa fatura ja fechada e paga: entra nela, ja paga, e a fatura nao reabre',()=>{
  const txs=[bill('MaisLaser',300),bill('Claude Max',550),pay(850,'2026-10'),bill('Esquecida',150)];
  const out=f.cardInvoices(inter,txs,'2026-10-21').find(i=>i.month==='2026-10');
  assert.equal(out.total,1000,'a conta esquecida aparece em outubro');
  assert.equal(out.status,'paga','nao reabre');
  assert.ok(f.cardBillSettled([inter],txs,'2026-10-21')(txs[3]),'e ja entra paga');
  assert.equal(f.cardUsed(inter,txs,'2026-10-21'),0,'nao ocupa o limite');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("i.status !== 'futura' && i.status !== 'paga' ? <Button title={busy ? 'Pagando…'"),'sem botao de pagar');
});

test('compra depois do fechamento vai para a fatura seguinte aberta e soma nela',()=>{
  const buy=f.toTx(E('fin_tx','Compra',{kind:'expense',amount:200,date:'2026-10-21',account_id:'',card_id:'Inter',paid:false,recurrence:'none',category:'Compras'}));
  const nov=f.cardInvoices(inter,[pay(850,'2026-10'),bill('MaisLaser',850),buy],'2026-10-21').find(i=>i.month==='2026-11');
  assert.equal(nov.total,200);assert.equal(nov.status,'aberta');
});

test('limite: usado = tudo que esta no cartao sem pagar, com as parcelas futuras; assinatura so quando cobrada',()=>{
  const parcels=[1,2,3].map(n=>f.toTx(E('fin_tx','TV '+n,{kind:'expense',amount:100,date:['2026-10-20','2026-11-20','2026-12-20'][n-1],account_id:'',card_id:'Inter',paid:false,recurrence:'none',category:'Compras',installment:n,installments:3,series_id:'tv',invoice_month:['2026-11','2026-12','2027-01'][n-1]})));
  const spotify=bill('Spotify',20,'2026-10-11',{recurrence:'monthly'});
  const used=f.cardUsed(inter,[...parcels,spotify],'2026-10-21');
  assert.equal(used,320,'3 parcelas da TV (300) + Spotify de outubro (20); os Spotify de nov/dez ainda nao');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("card.limit && used > card.limit ?")&&s.includes('do limite'),'passou do limite em vermelho');
});

test('Apps dentro de Financas: fora do Resumo volta ao Resumo; rolado sobe; no topo sai',()=>{
  const s=read('src/screens/Finance.tsx'),w=read('src/screens/Workspace.tsx');
  assert.ok(s.includes("if (tab !== 'home' || editing || billEditor || manage || accountPicker || newMenu) { goHome();"));
  assert.ok(s.includes('if (scrollY.current > 4) { mainScroll.current?.scrollTo({y: 0, animated: true});'));
  assert.ok(w.includes("if(module==='finance'&&financeAppsTap.current?.()){onDepthChange(true);return;}setModule('');"));
});
