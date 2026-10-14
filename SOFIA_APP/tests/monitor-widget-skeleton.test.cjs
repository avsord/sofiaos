'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const load=f=>{const m={};vm.runInNewContext(ts.transpileModule(read(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:m,require:()=>({}),URL,Date,Math,JSON,Number,String,Set,Map,Array,Object,Infinity,encodeURIComponent,isFinite});return m;};
const mon=load('src/lib/monitoring.ts'),snap=load('src/lib/startup-snapshot.ts');

test('widget do Price Tracker entra no cache de abertura (aparece no primeiro quadro)',()=>{
 assert.equal(snap.MONITOR_WIDGET_PATH,'/local/monitor-widget');
 assert.equal(snap.cacheableRead(snap.MONITOR_WIDGET_PATH),true);
 assert.equal(snap.launchRead(snap.MONITOR_WIDGET_PATH),true);
});
test('o resumo do widget nunca compete com dados reais do usuario pelas 32 vagas do cache geral',()=>{
 // launchRead (usado no blob pequeno e instantaneo de abertura) continua incluindo o widget;
 // startupPriority (usado no corte de 32 itens do cache completo) NAO deve.
 assert.equal(snap.startupPriority(snap.MONITOR_WIDGET_PATH),snap.startupPriority('/alguma/pagina/qualquer'),
  'resumo do widget deve ficar no mesmo nivel padrao de qualquer outro dado, nunca acima de rascunhos/paginas reais');
 assert.ok(snap.startupPriority(snap.MONITOR_WIDGET_PATH)>snap.startupPriority('/tasks'),'nao pode empatar com telas essenciais');
});
test('resumo do widget é pequeno, ordenado e validado',()=>{
 const p=(id,atLow,lastAt,price)=>({monitor:{id,title:'P'+id},color:'#f00',currency:'BRL',atLow,lastAt,now:price===null?null:{price,store:{name:'KaBuM!'}},change:null,stores:[{points:new Array(500).fill({t:1,v:1})}],best:new Array(500).fill({t:1,v:1})});
 const rows=mon.widgetRows([p('a',false,1,10),p('b',true,0,20),p('c',false,5,null)]);
 assert.equal(rows.map(r=>r.id).join(','),'b,c,a');
 assert.ok(JSON.stringify(rows).length<600,'sem séries históricas no cache');
 assert.equal(rows[1].price,null);assert.equal(rows[1].store,null);
 assert.ok(mon.validWidgetRows(JSON.parse(JSON.stringify(rows))));
 assert.equal(mon.validWidgetRows(undefined),null);assert.equal(mon.validWidgetRows([{monitor:{}}]),null,'formato antigo vira "sem cache"');
});
test('Início: começa do cache, guarda o novo resumo e nunca mostra "nenhum produto" enquanto carrega',()=>{
 const home=read('src/screens/Home.tsx'),w=read('src/components/MonitorWidget.tsx');
 assert.ok(home.includes('validWidgetRows(api.cached(MONITOR_WIDGET_PATH))'));
 assert.ok(home.includes('api.rememberLocal(MONITOR_WIDGET_PATH,rows)'));
 assert.ok(w.includes('rows===null?(failed?')&&w.includes('<SkeletonRows/>'),'null = esqueleto, não convite vazio');
 assert.ok(w.includes('ShimmerGroup')&&w.includes('ShimmerBlock'));
});
test('reflexo: uma animação só, nativa, e sem respeitar "remover animações" (pedido do dono)',()=>{
 const l=read('src/components/Loading.tsx');
 assert.ok(l.includes('export function ShimmerGroup')&&l.includes('export function ShimmerBlock'));
 assert.ok(/ShimmerGroup[\s\S]*useNativeDriver: true/.test(l));
 assert.ok(!/ShimmerGroup[\s\S]*isReduceMotionEnabled/.test(l));
});
test('reflexo nao usa Svg/LinearGradient (0.3.137: custava tempo de abertura no caminho critico da Inicio)',()=>{
 const l=read('src/components/Loading.tsx');
 const shimmer=l.slice(l.indexOf('export function ShimmerGroup'));
 assert.ok(!/LinearGradient|<Svg|Defs|Stop/.test(shimmer),'shimmer deve usar so View/Animated.View');
});
test('cada bloco do esqueleto usa so 1 View animada (0.3.138: 3 segmentos por bloco ainda pesava no caminho critico)',()=>{
 const l=read('src/components/Loading.tsx');
 const block=l.slice(l.indexOf('export function ShimmerBlock'));
 assert.equal((block.match(/<Animated\.View/g)||[]).length,1,'um unico Animated.View por bloco');
 assert.ok(!/SEGMENT/.test(block),'sem dividir em 3 segmentos');
});
