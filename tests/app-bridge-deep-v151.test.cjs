'use strict';
// Dicionário aprofundado: gíria, datas do dia a dia, períodos do dia, "a cada N horas",
// apelidos aprendidos, erro de digitação, ambiguidade, categoria pelo histórico, consultas com filtro.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,blankAction,base}=require('./helpers.cjs');
const bridge=require('../src/core/app-bridge');
const run=(f,intent,action)=>f.core.execute({id:null,content:'pedido'},base(intent,{action:{...blankAction(),...action}}),'private');
const ch=(...pairs)=>pairs.map(([field,value])=>({field,value}));
const addDays=n=>{const d=new Date(bridge.today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

test('dinheiro em gíria: conto, pila, barão, 2k, meio real',()=>{
 assert.equal(bridge.money('50 conto'),50);assert.equal(bridge.money('cinquenta pila'),50);assert.equal(bridge.money('um barão'),1000);assert.equal(bridge.money('2k'),2000);assert.equal(bridge.money('meio real'),0.5);
});
test('datas do dia a dia: semana passada, 3 dias atrás, dia 15, fim do mês, começo do mês que vem, sexta passada',()=>{
 assert.equal(bridge.dateOf('semana passada'),addDays(-7));assert.equal(bridge.dateOf('3 dias atras'),addDays(-3));assert.equal(bridge.dateOf('ha 2 dias'),addDays(-2));
 const d15=bridge.dateOf('dia 15');assert.ok(d15.endsWith('-15')&&d15>=bridge.today(),'dia 15 é o próximo dia 15: '+d15);
 const fim=bridge.dateOf('fim do mes');assert.equal(fim.slice(0,7),bridge.today().slice(0,7));assert.ok(Number(fim.slice(8))>=28);
 assert.ok(bridge.dateOf('comeco do mes que vem').endsWith('-01'));
 const sexta=bridge.dateOf('sexta passada');assert.equal(new Date(sexta+'T12:00:00Z').getUTCDay(),5);assert.ok(sexta<bridge.today());
});
test('períodos do dia viram horário; "a cada 8 horas" e "3 vezes ao dia" viram vários horários',t=>{
 assert.equal(bridge.timeOf('de manhã'),'08:00');assert.equal(bridge.timeOf('à noite'),'20:00');assert.equal(bridge.timeOf('antes de dormir'),'22:00');
 const f=fixture(t);
 run(f,'create_entity',{entity_kind:'capsule',title:'Antibiótico',changes:ch(['data.dose_text','1 comprimido'],['data.times_json','a cada 8 horas'],['data.repeat_type','todo dia'])});
 assert.equal(f.core.workspace.list({kind:'capsule'})[0].data.times_json,'["08:00","16:00","00:00"]');
 run(f,'create_entity',{entity_kind:'capsule',title:'Vitamina',changes:ch(['data.dose_text','1'],['data.times_json','3 vezes ao dia'],['data.repeat_type','dia sim dia nao'])});
 const v=f.core.workspace.list({kind:'capsule'}).find(e=>e.title==='Vitamina');assert.equal(v.data.times_json,'["08:00","16:00","00:00"]');assert.equal(v.data.repeat_type,'interval');
});
test('referência por nome: artigo, erro de digitação, apelido aprendido e ambiguidade',t=>{
 const f=fixture(t);const w=f.core.workspace;
 const nu=w.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente'}});w.save({kind:'fin_account',title:'Itaú',area:'Pessoal',data:{account_type:'corrente'}});
 assert.equal(bridge.resolveRef(w,'fin_account','o nubank',f.store),nu.id);
 assert.equal(bridge.resolveRef(w,'fin_account','Nubak',f.store),nu.id,'erro de digitação');
 run(f,'save_memory',{content:'Apelido: minha conta = '+nu.id});
 assert.equal(bridge.resolveRef(w,'fin_account','minha conta',f.store),nu.id,'apelido aprendido');
 w.save({kind:'fin_account',title:'Nubank PJ',area:'Pessoal',data:{account_type:'corrente'}});
 assert.throws(()=>bridge.resolveRef(w,'fin_account','nub',f.store),e=>e.code==='REF_AMBIGUOUS'&&/Nubank/.test(e.message)&&/Nubank PJ/.test(e.message));
});
test('categoria vem do histórico quando a pessoa não diz (mesma descrição)',t=>{
 const f=fixture(t);const w=f.core.workspace;w.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente'}});
 run(f,'create_entity',{entity_kind:'fin_tx',title:'Uber',changes:ch(['data.amount','20'],['data.category','Transporte'],['data.account_id','Nubank'])});
 run(f,'create_entity',{entity_kind:'fin_tx',title:'uber',changes:ch(['data.amount','18'])});
 const last=w.list({kind:'fin_tx'}).find(e=>Number(e.data.amount)===18);assert.equal(last.data.category,'Transporte');
});
test('consultas com filtro: "quanto gastei com mercado", "no Nubank", "mês passado", produto no Price Tracker',t=>{
 const f=fixture(t);const w=f.core.workspace;
 const nu=w.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente',initial_balance:'100'}});const it=w.save({kind:'fin_account',title:'Itaú',area:'Pessoal',data:{account_type:'corrente'}});
 w.save({kind:'fin_tx',title:'Mercado',area:'Pessoal',data:{kind:'expense',amount:300,date:bridge.today(),category:'Mercado',account_id:nu.id,paid:true}});
 w.save({kind:'fin_tx',title:'Luz',area:'Pessoal',data:{kind:'expense',amount:150,date:bridge.today(),category:'Casa',account_id:it.id,paid:true}});
 const [y,m]=bridge.today().split('-').map(Number);const past=(m===1?y-1:y)+'-'+String(m===1?12:m-1).padStart(2,'0')+'-10';
 w.save({kind:'fin_tx',title:'Cinema',area:'Pessoal',data:{kind:'expense',amount:40,date:past,category:'Lazer',account_id:nu.id,paid:true}});
 const cat=run(f,'query',{query_target:'finance',content:'quanto gastei com mercado esse mês'});assert.match(cat.reply,/em Mercado/);assert.match(cat.reply,/Despesas: R\$\s?300,00/);
 const acc=run(f,'query',{query_target:'finance',content:'quanto gastei no Nubank'});assert.match(acc.reply,/na conta Nubank/);assert.match(acc.reply,/Despesas: R\$\s?300,00/);assert.match(acc.reply,/Saldo de Nubank: -R\$\s?240,00|Saldo de Nubank: R\$\s?-240,00/);
 const pm=run(f,'query',{query_target:'finance',content:'quanto gastei mês passado'});assert.match(pm.reply,/Despesas: R\$\s?40,00/);
 w.save({kind:'monitor',title:'HD 2TB Seagate',area:'Pessoal',data:{method:'product',variant:'HD',preferred_url:'https://a.com/1',currency:'BRL',interval_minutes:360,consent:true}});
 w.save({kind:'monitor',title:'Teclado',area:'Pessoal',data:{method:'product',variant:'T',preferred_url:'https://a.com/2',currency:'BRL',interval_minutes:360,consent:true}});
 const mon=run(f,'query',{query_target:'monitors',content:'quanto tá o HD'});assert.match(mon.reply,/HD 2TB Seagate/);assert.ok(!/Teclado/.test(mon.reply));
});
test('instruções da IA trazem o guia de linguagem, a desambiguação e o formato de apelido',()=>{
 const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/services/intent-engine.js'),'utf8');
 for(const t of ['8d. GUIA DE LINGUAGEM','DESAMBIGUAÇÃO','"Apelido: <apelido> = <id do registro>"'])assert.ok(s.includes(t),t);
});
