'use strict';
// A conversa precisa alcançar todos os apps (Cápsulas, Price Tracker, Finanças, E-mails...).
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,blankAction,base}=require('./helpers.cjs');
const bridge=require('../src/core/app-bridge');
const run=(f,intent,action)=>f.core.execute({id:null,content:'pedido'},base(intent,{action:{...blankAction(),...action}}),'private');
const ch=(...pairs)=>pairs.map(([field,value])=>({field,value}));

test('cápsula pela conversa: dose, horário, todo dia, a partir de hoje',t=>{
 const f=fixture(t);const r=run(f,'create_entity',{entity_kind:'capsule',title:'Multivitamínico',changes:ch(['data.dose_text','1 cápsula'],['data.times_json','15h'],['data.repeat_type','todos os dias'],['data.start_date','hoje'])});
 const e=f.core.workspace.list({kind:'capsule'})[0];assert.equal(e.title,'Multivitamínico');assert.equal(e.data.times_json,'["15:00"]');assert.equal(e.data.repeat_type,'daily');assert.equal(e.data.start_date,bridge.today());assert.equal(e.data.notifications,true);
 assert.match(r.reply,/Cápsula registrada.*15:00.*todos os dias/);assert.equal(r.ui_target,'capsules');
 assert.throws(()=>run(f,'create_entity',{entity_kind:'capsule',title:'Ômega',changes:ch(['data.dose_text','4 caps'])}),/horário/i);
});
test('lançamento pela conversa: valor em reais, conta pelo NOME, data hoje; sem conta pede qual',t=>{
 const f=fixture(t);const w=f.core.workspace;
 assert.throws(()=>run(f,'create_entity',{entity_kind:'fin_tx',title:'Mercado',changes:ch(['data.amount','45,90'])}),/Crie uma conta/);
 w.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente',initial_balance:'100'}});w.save({kind:'fin_account',title:'Itaú',area:'Pessoal',data:{account_type:'corrente'}});
 assert.throws(()=>run(f,'create_entity',{entity_kind:'fin_tx',title:'Mercado',changes:ch(['data.amount','45,90'])}),/Em qual conta.*Nubank/);
 const r=run(f,'create_entity',{entity_kind:'fin_tx',title:'Mercado',changes:ch(['data.kind','gastei'],['data.amount','R$ 45,90'],['data.category','Mercado'],['data.account_id','nubank'])});
 const tx=w.list({kind:'fin_tx'})[0];assert.equal(tx.data.amount,45.9);assert.equal(tx.data.kind,'expense');assert.equal(tx.data.date,bridge.today());assert.equal(tx.data.account_id,w.list({kind:'fin_account'}).find(a=>a.title==='Nubank').id);assert.equal(tx.data.paid,true);
 assert.match(r.reply,/Despesa registrada.*R\$\s?45,90/);
 assert.throws(()=>run(f,'create_entity',{entity_kind:'fin_tx',title:'X',changes:ch(['data.amount','10'],['data.account_id','Bradesco'])}),/Não achei conta.*Nubank/);
});
test('regra de e-mail e Price Tracker pela conversa',t=>{
 const f=fixture(t);const w=f.core.workspace;
 const m=run(f,'create_entity',{entity_kind:'mail_rule',title:'Ana',changes:ch(['data.field','remetente'],['data.contains','ana@empresa.com'])});
 assert.equal(w.list({kind:'mail_rule'})[0].data.field,'from');assert.match(m.reply,/Vigia de e-mail criada/);
 const p=run(f,'create_entity',{entity_kind:'monitor',title:'HD 2TB',changes:ch(['data.preferred_url','Olha isso https://www.kabum.com.br/produto/1?x=1'],['data.drop_percent','10'])});
 const mon=w.list({kind:'monitor'})[0];assert.equal(mon.data.preferred_url,'https://www.kabum.com.br/produto/1?x=1');assert.equal(mon.data.method,'product');assert.equal(mon.data.drop_percent,10);assert.match(p.reply,/Price Tracker.*10%/);
});
test('editar registro de app pela conversa traduz do mesmo jeito (horário 16h)',t=>{
 const f=fixture(t);const e=f.core.workspace.save({kind:'capsule',title:'Ômega 3',area:'Pessoal',data:{dose_text:'4 caps',times_json:'["15:00"]',repeat_type:'daily',start_date:bridge.today()}});
 run(f,'update_record',{target_id:e.id,changes:ch(['data.times_json','16h'])});assert.equal(f.core.workspace.get(e.id).data.times_json,'["16:00"]');
});
test('consultas: finanças do mês, cápsulas de hoje, Price Tracker, e-mails',t=>{
 const f=fixture(t);const w=f.core.workspace;
 const acc=w.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente',initial_balance:'1000'}});
 w.save({kind:'fin_tx',title:'Salário',area:'Pessoal',data:{kind:'income',amount:5000,date:bridge.today(),account_id:acc.id,paid:true}});
 w.save({kind:'fin_tx',title:'Mercado',area:'Pessoal',data:{kind:'expense',amount:300,date:bridge.today(),category:'Mercado',account_id:acc.id,paid:true}});
 const fin=run(f,'query',{query_target:'finance'});assert.match(fin.reply,/Receitas: R\$\s?5\.000,00/);assert.match(fin.reply,/Despesas: R\$\s?300,00/);assert.match(fin.reply,/Saldo das contas: R\$\s?5\.700,00/);assert.match(fin.reply,/Mercado/);
 w.save({kind:'capsule',title:'Vitamina D',area:'Pessoal',data:{dose_text:'1 cap',times_json:'["15:00"]',repeat_type:'daily',start_date:bridge.today()}});
 assert.match(run(f,'query',{query_target:'capsules'}).reply,/Vitamina D — 1 cap às 15:00/);
 assert.match(run(f,'query',{query_target:'monitors'}).reply,/Nenhum produto/);assert.match(run(f,'query',{query_target:'mail'}).reply,/Nenhum e-mail/);
});
test('a IA recebe os apps, os campos e os registros existentes no contexto',t=>{
 const f=fixture(t);f.core.workspace.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente'}});
 f.store.saveNote?null:null;
 const ctx=bridge.appsContext(f.core.workspace,f.store).content;
 for(const s of ['capsule (Cápsula; app Cápsulas','fin_tx (Lançamento; app Finanças','mail_rule (Regra de e-mail; app E-mails','monitor (Monitoramento; app Price Tracker','contact (Contato','routine (Rotina','REGISTROS EXISTENTES','"Nubank"','query_target=finance','times_json=Horários'])assert.ok(ctx.includes(s),s);
 assert.ok(!ctx.includes('mail_hit ('),'tipos internos ficam de fora');
 const engine=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/services/intent-engine.js'),'utf8');
 assert.ok(engine.includes("...require('../core/app-bridge').APP_KINDS"));assert.ok(engine.includes('8c. APRENDA COM A PESSOA'));assert.ok(engine.includes("'finance','capsules','monitors','mail'"));assert.ok(engine.includes('8b. TODOS OS APPS DA SOFIA'));
});

test('absorve hábitos: mesma categoria vai para a mesma conta/cartão da última vez; aprendizados entram no contexto',t=>{
 const f=fixture(t);const w=f.core.workspace;
 const nu=w.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente'}});w.save({kind:'fin_account',title:'Itaú',area:'Pessoal',data:{account_type:'corrente'}});
 run(f,'create_entity',{entity_kind:'fin_tx',title:'Mercado',changes:ch(['data.amount','50'],['data.category','Mercado'],['data.account_id','Nubank'])});
 run(f,'create_entity',{entity_kind:'fin_tx',title:'Feira',changes:ch(['data.amount','20'],['data.category','mercado'])});
 assert.equal(w.list({kind:'fin_tx'}).find(e=>e.title==='Feira').data.account_id,nu.id,'sem perguntar: aprendeu que mercado é no Nubank');
 run(f,'save_memory',{content:'Aprendizado: "o HD" é o produto HD 2TB do Price Tracker.'});
 const ctx=bridge.appsContext(w,f.store).content;assert.ok(ctx.includes('APRENDIZADOS SOBRE ESTA PESSOA')&&ctx.includes('"o HD" é o produto HD 2TB'));
});

test('valores por extenso em reais, inclusive com centavos',()=>{
 for(const [v,exp] of [['cinquenta reais',50],['cem reais',100],['cinquenta e nove reais e noventa centavos',59.9],['mil e duzentos',1200],['quarenta e cinco reais',45]])assert.equal(bridge.money(v),exp,v);
});
test('datas relativas: depois de amanhã, daqui a N dias, dia da semana (inclusive "que vem")',()=>{
 const addDays=n=>{const d=new Date(bridge.today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 assert.equal(bridge.dateOf('depois de amanha'),addDays(2));
 assert.equal(bridge.dateOf('daqui a 3 dias'),addDays(3));
 for(const s of ['segunda-feira','proxima segunda','segunda que vem'])assert.equal(new Date(bridge.dateOf(s)+'T12:00:00Z').getUTCDay(),1,s);
});
test('meio-dia e meia-noite como horário',()=>{assert.equal(bridge.timeOf('meio-dia'),'12:00');assert.equal(bridge.timeOf('meia-noite'),'00:00');});
test('cápsula e lançamento pela conversa já usam números e datas por extenso',t=>{
 const f=fixture(t);
 run(f,'create_entity',{entity_kind:'capsule',title:'Ômega 3',changes:ch(['data.dose_text','4 caps'],['data.times_json','16h'],['data.repeat_type','daily'])});
 f.core.workspace.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente'}});
 run(f,'create_entity',{entity_kind:'fin_tx',title:'Mercado',changes:ch(['data.amount','cinquenta e nove reais e noventa centavos'],['data.date','amanha'],['data.account_id','nubank'])});
 const mercado=f.core.workspace.list({kind:'fin_tx'}).find(e=>e.title==='Mercado');
 assert.equal(mercado.data.amount,59.9);assert.equal(mercado.data.date,bridge.dateOf('amanha'));
 run(f,'create_entity',{entity_kind:'fin_tx',title:'Feira',changes:ch(['data.amount','cinquenta reais'],['data.account_id','nubank'])});
 assert.equal(f.core.workspace.list({kind:'fin_tx'}).find(e=>e.title==='Feira').data.amount,50);
});
