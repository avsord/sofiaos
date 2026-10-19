'use strict';
// 0.3.197: cadastrar uma conta "A receber" pelo app (mesma rota e mesmos campos que o app envia).
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');
const PASSWORD='development-fixture-only-197';
test('a receber: salvar pelo app grava e aparece como pendencia',async t=>{
 const f=fixture(t);f.config.loginPassword=PASSWORD;f.config.loginEmail='owner@example.com';
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const req=async(p,body,m=body===undefined?'GET':'POST',token='')=>{const r=await fetch(base+'/api/mobile'+p,{method:m,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const token=(await req('/auth/login',{email:'owner@example.com',password:PASSWORD})).body.token;
 const conta=await req('/workspace/entities',{kind:'fin_account',title:'Conta principal',content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data:{account_type:'corrente',initial_balance:'0',include_total:true}},'POST',token);
 assert.ok(conta.status<300,JSON.stringify(conta.body));
 const data={kind:'income',amount:500,date:'2026-10-30',category:'Contas',account_id:conta.body.id,remind_days:0,installments:'',installment:'',recurrence_end:'',paid:false,card_id:'',to_account_id:'',recurrence:'none',series_id:'',import_id:'sofia-pendencia:x1'};
 const r=await req('/workspace/entities',{kind:'fin_tx',title:'Freela',content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data},'POST',token);
 assert.ok(r.status<300,JSON.stringify(r.body));
 const fin=await req('/md/finance',undefined,'GET',token);
 assert.equal(fin.status,200,JSON.stringify(fin.body).slice(0,300));
 const txs=(fin.body.fin_tx||fin.body.txs||[]);
 assert.ok(JSON.stringify(fin.body).includes('Freela'),'o a receber volta na lista de Financas');
});
