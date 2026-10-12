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
