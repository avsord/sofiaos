'use strict';
// Coleta + diagnóstico de ponta a ponta, com leitor e API falsos.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const tr=f=>ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(file,mocks){const module={exports:{}};vm.runInNewContext(tr(file),{module,exports:module.exports,require:n=>{if(n in mocks)return mocks[n];throw Error('Unexpected '+n);},URL,Date,Math,JSON,Number,String,Set,Map,Array,Object,Promise,Infinity,encodeURIComponent,setTimeout,clearTimeout});return module.exports;}
const monitoring=load('src/lib/monitoring.ts',{});
const K='https://www.kabum.com.br/produto/123/placa-secreta',P='https://www.pichau.com.br/p/456-placa-secreta';
const pages={[K]:{ok:true,title:'Placa Secreta',result:{found:true,needsConfirmation:false,best:{amount:2499.9,currency:'BRL',origins:['json-ld:offer'],confidence:1},candidates:[{amount:2499.9,currency:'BRL',origins:['json-ld:offer'],confidence:1}]}},
 [P]:{ok:false,error:'A loja recusou o acesso (403).'}};
const reader={readPrice:async u=>pages[u],readerDiagnostics:()=>({hostMounted:true,queue:0,busy:null,totals:{jobs:2},recent:[]})};
const notified=[];
const collector=load('src/lib/monitor-collector.ts',{'expo-notifications':{getPermissionsAsync:async()=>({granted:true}),setNotificationChannelAsync:async()=>{},scheduleNotificationAsync:async r=>{notified.push(r);},AndroidImportance:{HIGH:4}},
 './monitoring':monitoring,'./price-reader':reader,'./bell-inbox':{notificationScope:s=>'scope-'+s.length}});
const monitor={id:'abcdef1234567890',kind:'monitor',title:'Placa Secreta Ultra',state:'active',revision:1,data:{method:'product',variant:'Placa Secreta Ultra',currency:'BRL',preferred_url:K,source_urls:P,interval_minutes:360,new_low:true,drop_percent:'',target_price:''},created_at:'2026-10-01'};
const observed=[];
const api={owner:'pedro@example.com',entities:async()=>({items:[monitor]}),observations:async()=>({items:[]}),observe:async(id,b)=>{observed.push({id,...b});return {};}};

test('coleta grava só a leitura inequívoca, marca a loja que falhou e registra tudo no diagnóstico',async()=>{
 await collector.runCollection(api,{scope:'pedro@example.com',trigger:'teste'});
 assert.equal(observed.length,1);assert.equal(observed[0].source,K);assert.equal(observed[0].price,2499.9);assert.equal(observed[0].variant,'Placa Secreta Ultra');
 const st=collector.collectorState();assert.equal(st.running,false);
 const issue=st.issues['abcdef1234567890|'+P];assert.equal(issue.kind,'failed');assert.match(issue.error,/403/);
 const d=collector.monitorDiagnostics();
 assert.deepEqual(JSON.parse(JSON.stringify(d.outcomes.map(o=>[o.host,o.result]))),[['kabum.com.br','gravado'],['pichau.com.br','falhou']]);
 assert.equal(d.runs.at(-1).trigger,'teste');assert.equal(d.runs.at(-1).due,2);assert.equal(d.runs.at(-1).done,2);
 assert.equal(d.products[0].stores.length,2);assert.equal(d.products[0].id,'abcdef12');
 assert.equal(d.collector.pendingIssues[0].host,'pichau.com.br');
 const text=JSON.stringify(d);
 assert.ok(!text.includes('placa-secreta')&&!text.includes('/produto/'),'nunca o link completo');
 assert.ok(!text.includes('Placa Secreta'),'nunca o nome do produto');
 assert.ok(!text.includes('pedro@'),'nunca o e-mail');
});

test('sem histórico anterior, a primeira leitura não dispara aviso de "menor preço"',()=>{assert.equal(notified.length,0);});
