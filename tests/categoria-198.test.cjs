'use strict';
// 0.3.198: a Sofia escolhe a categoria certa sozinha e aprende com as correcoes.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const bridge=require('../src/core/app-bridge.js');
function setup(t){const {core}=fixture(t);const w=core.workspace;w.save({kind:'fin_account',title:'Conta principal',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true}});return w;}
const build=(w,title,amount,category,kind='expense')=>bridge.buildEntity(w,'fin_tx',{title,changes:[{field:'data.kind',value:kind},{field:'data.amount',value:amount},...(category?[{field:'data.category',value:category}]:[])]},title).data.category;
test('categoria pela descricao, mesmo sem a Sofia mandar ou mandando uma que nao existe no app',t=>{
 const w=setup(t);
 assert.equal(build(w,'Rastreador Ugreen','138,08'),'Compras');
 assert.equal(build(w,'Oficialfarma','210,36','Farmácia'),'Saúde','"Farmácia" nao existe no app: vira Saúde');
 assert.equal(build(w,'Uber pra casa','23,40'),'Transporte');
 assert.equal(build(w,'iFood','58,00'),'Alimentação');
 assert.equal(build(w,'Assaí','310,00'),'Mercado');
 assert.equal(build(w,'DAS de outubro','469'),'Impostos');
 assert.equal(build(w,'Coisa sem pista','10'),'Outros');
 assert.equal(build(w,'Freela logo','800','','income'),'Freelance');
 assert.equal(build(w,'Lanche','20','Alimentação'),'Alimentação','categoria valida da Sofia e mantida');
});
test('aprende com a correcao da pessoa: mesma descricao, mesma categoria da ultima vez',t=>{
 const w=setup(t);
 const conta=w.list({kind:'fin_account',limit:5})[0];
 w.save({kind:'fin_tx',title:'Oficialfarma',area:'Pessoal',data:{kind:'expense',amount:100,date:'2026-10-10',account_id:conta.id,paid:true,category:'Presentes',recurrence:'none'}});
 assert.equal(build(w,'Oficialfarma','210,36','Saúde'),'Presentes','a escolha da pessoa vale mais');
});
test('a Sofia conhece as categorias do app',()=>{
 const ctx=bridge.appsContext({list:()=>[]},null).content;
 assert.match(ctx,/escolha VOCÊ pela descrição, sem perguntar/);assert.match(ctx,/Rastreador Ugreen.*Compras/);assert.match(ctx,/Oficialfarma.*Saúde/);
});
