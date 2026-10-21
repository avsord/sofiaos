'use strict';
// Finanças lento: o app fazia 5+ pedidos paginados. Agora é um só.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {httpFixture}=require('./helpers.cjs');
const {OwnerAuth}=require('../src/services/owner-auth');
const {MobileSessions}=require('../src/services/mobile-sessions');
test('GET /md/finance devolve os 5 tipos numa resposta só, sem perder nada além de 500',async t=>{
 const f=await httpFixture(t);const token=new MobileSessions(f.store,new OwnerAuth(f.config,f.store),f.config).issue('fin').token;
 const w=f.workspace;assert.ok(w,'workspace do runtime disponível');
 const acc=w.save({kind:'fin_account',title:'Conta',area:'Pessoal',data:{}});
 for(let i=0;i<520;i++)w.save({kind:'fin_tx',title:'Gasto '+i,area:'Pessoal',data:{kind:'expense',amount:1,date:'2026-10-01',account_id:acc.id}});
 const r=await fetch(f.base+'/api/mobile/md/finance',{headers:{Authorization:'Bearer '+token}});
 assert.equal(r.status,200);const data=await r.json();
 for(const k of ['fin_account','fin_card','fin_tx','fin_budget','fin_goal'])assert.ok(Array.isArray(data.items[k]),k);
 assert.equal(data.items.fin_tx.length,520,'passa de 500 sem cortar');assert.equal(data.items.fin_account.length,1);
});

test('janela de meses: só os lançamentos do período + recorrentes + não pagos, e o saldo acumulado por conta',async t=>{
 const f=await httpFixture(t);const token=new MobileSessions(f.store,new OwnerAuth(f.config,f.store),f.config).issue('fin2').token;
 const w=f.workspace;const acc=w.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente',initial_balance:'100'}});
 const tx=(title,date,amount,extra={})=>w.save({kind:'fin_tx',title,area:'Pessoal',data:{kind:'expense',amount,date,account_id:acc.id,paid:true,...extra}});
 tx('Antigo 1','2026-07-10',50);tx('Antigo 2','2026-08-20',30);tx('Salário','2026-08-01',1000,{kind:'income'});
 tx('No mês','2026-10-05',80);tx('Aluguel','2026-01-05',900,{recurrence:'monthly'});tx('Conta futura','2026-12-10',60,{paid:false});tx('Depois','2026-11-15',10);
 const r=await (await fetch(f.base+'/api/mobile/md/finance?from=2026-09&to=2026-10',{headers:{Authorization:'Bearer '+token}})).json();
 const titles=r.items.fin_tx.map(e=>e.title).sort();
 assert.deepEqual(titles,['Aluguel','Conta futura','No mês'],'janela set-out + recorrente + não pago; os antigos e o de novembro ficam fora');
 // 0.3.221: o aluguel de janeiro vai na lista (e recorrente) e o app ja conta ele - nao pode entrar tambem no acumulado
 assert.equal(r.carry[acc.id],920,'acumulado ate 31/08 so com o que nao vai na lista: +1000 -50 -30');
 const all=await (await fetch(f.base+'/api/mobile/md/finance',{headers:{Authorization:'Bearer '+token}})).json();assert.equal(all.items.fin_tx.length,7);assert.deepEqual(all.carry,{});assert.equal(all.window,null,'sem janela: tudo, como antes');
});

test('0.3.221: saldo pela janela = saldo com tudo (nada conta duas vezes, nada some)',async t=>{
 const f=await httpFixture(t);const token=new MobileSessions(f.store,new OwnerAuth(f.config,f.store),f.config).issue('fin3').token;
 const w=f.workspace;const acc=w.save({kind:'fin_account',title:'Conta principal',area:'Pessoal',data:{account_type:'corrente',initial_balance:'500'}});
 const tx=(title,date,amount,extra={})=>w.save({kind:'fin_tx',title,area:'Pessoal',data:{kind:'expense',amount,date,account_id:acc.id,paid:true,...extra}});
 tx('Salario fixo','2026-06-25',7821,{kind:'income',recurrence:'monthly'});tx('Mercado','2026-07-02',300);tx('Aluguel','2026-05-05',1500,{recurrence:'monthly'});
 const card=w.save({kind:'fin_card',title:'Visa',area:'Pessoal',data:{limit:1000,closing_day:5,due_day:12,account_id:acc.id}});tx('Fatura julho','2026-07-20',400,{kind:'card_payment',card_id:card.id,invoice_month:'2026-09'});tx('Sem marca de pago','2026-07-03',999,{paid:undefined});
 tx('Outubro','2026-10-10',120);tx('Aberta','2026-10-30',50,{paid:false});
 const effect=(d,id)=>{if(!d.paid)return 0;const a=Number(d.amount||0);if(d.kind==='income'&&d.account_id===id)return a;if(d.kind==='expense'&&!d.card_id&&d.account_id===id)return -a;if(d.kind==='card_payment'&&d.account_id===id)return -a;return 0;};
 const saldo=(r)=>500+(r.carry[acc.id]||0)+r.items.fin_tx.reduce((s,e)=>s+effect(e.data,acc.id),0);
 const all=await (await fetch(f.base+'/api/mobile/md/finance',{headers:{Authorization:'Bearer '+token}})).json();
 const full=500+all.items.fin_tx.reduce((s,e)=>s+effect(e.data,acc.id),0);
 for(const [from,to] of [['2026-09','2026-11'],['2026-05','2026-11'],['2026-10','2026-12']]){
  const r=await (await fetch(f.base+`/api/mobile/md/finance?from=${from}&to=${to}`,{headers:{Authorization:'Bearer '+token}})).json();
  assert.equal(Math.round(saldo(r)*100)/100,Math.round(full*100)/100,'janela '+from+'..'+to+' da o mesmo saldo');
 }
});
