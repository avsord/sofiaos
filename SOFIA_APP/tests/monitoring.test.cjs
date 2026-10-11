'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/lib/monitoring.ts'),'utf8');const m={};
vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:m,URL,Date,Math,JSON,Number,String,Set,Map,Array,Object,Infinity,encodeURIComponent,isFinite});
const plain=x=>JSON.parse(JSON.stringify(x));const eq=(a,b,msg)=>assert.deepEqual(plain(a),plain(b),msg);
const K='https://www.kabum.com.br/produto/1',P='https://www.pichau.com.br/p/2',ML='https://produto.mercadolivre.com.br/MLB-3';
const mon=(data={},extra={})=>({id:'m1',kind:'monitor',title:'RTX 4070 Super',content:'',area:'Pessoal',state:'active',privacy:'private',tags:[],revision:1,data:{method:'product',variant:'RTX 4070 Super',currency:'BRL',preferred_url:K,source_urls:P+'\n'+ML,interval_minutes:360,new_low:true,drop_percent:'',target_price:'',line_color:'#4fa3ff',...data},...extra});
const H=3600e3,T0=Date.parse('2026-10-01T12:00:00Z');
const row=(source,price,h)=>({id:source+h,source,total_cents:Math.round(price*100),observed_at:new Date(T0+h*H).toISOString()});

test('lojas: principal primeiro, nomes humanos, sem repetidas nem http',()=>{
 const s=m.storesOf(mon({source_urls:P+'\n'+P+'\nhttp://inseguro.com/x\n'+ML}));
 eq(s.map(x=>x.name),['KaBuM!','Pichau','Mercado Livre']);assert.equal(s[0].primary,true);assert.equal(s[1].primary,false);
 assert.equal(m.storeName('https://www.lojaxyz.com.br/a'),'Lojaxyz');
});

test('melhor preço ao longo do tempo é o menor entre as lojas, e loja removida sai da conta',()=>{
 const rows=[row(K,3000,0),row(P,2900,1),row(K,2800,2),row('https://removida.com/x',100,3)];
 const p=m.buildProduct(mon(),rows);
 eq(p.best.map(x=>x.v),[3000,2900,2800]);
 assert.equal(p.now.price,2800);assert.equal(p.now.store.name,'KaBuM!');
 assert.ok(Math.abs(p.change-(2800-2900)/2900*100)<1e-9);
 assert.equal(p.atLow,true);assert.equal(p.low.price,2800);
});

test('sem leitura não existe preço nem variação inventados',()=>{
 const p=m.buildProduct(mon(),[]);assert.equal(p.now,null);assert.equal(p.change,null);assert.equal(p.low,null);assert.equal(p.best.length,0);assert.equal(p.atLow,false);
});

test('gráfico: degraus válidos, âncora antes da janela e modo % parte do zero',()=>{
 const now=T0+40*24*H;
 const lines=[{id:'a',color:'#f00',points:[{t:T0,v:100},{t:T0+35*24*H,v:90}]},{id:'b',color:'#0f0',points:[{t:T0+36*24*H,v:5000}]}];
 const g=m.chartGeometry(lines,{width:300,height:150,window:'7d',now,mode:'change'});
 assert.ok(g);for(const l of g.lines)for(const [x,y] of l.path){assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.ok(x>=0&&x<=300&&y>=0&&y<=150);}
 assert.ok(g.y0<=-10&&g.y1>=0,'queda de 10% cabe e o zero aparece');
 assert.equal(m.preferredMode(lines),'change','R$ 90 e R$ 5.000 não dividem o eixo em reais');
 assert.equal(m.chartGeometry([],{width:300,height:150,window:'30d',mode:'price',now}),null);
});

test('avisos no celular seguem a regra do servidor: queda só na mesma loja',()=>{
 const rows=[row(K,3000,0),row(P,2600,1)];
 eq(m.alertReasons(mon({drop_percent:10,new_low:false}),rows,K,2950),[],'1,7% não chega a 10%');
 eq(m.alertReasons(mon({drop_percent:10,new_low:false}),rows,K,2650).length,1);
 assert.match(m.alertReasons(mon({new_low:true}),rows,P,2500).join(),/menor preço/);
 assert.match(m.alertReasons(mon({target_price:2700,new_low:false}),rows,K,2690).join(),/seu preço/);
 eq(m.alertReasons(mon({target_price:2700}),[row(K,2690,0)],K,2690),[],'mesmo preço de novo não repete aviso');
});

test('leitura ambígua só é gravada sozinha se bater com a origem que o usuário confirmou',()=>{
 const a={amount:2499,currency:'BRL',origins:['json-ld:offer'],confidence:1},b={amount:2199,currency:'BRL',origins:['texto-visivel'],confidence:.25};
 assert.equal(m.pickAutomatic({needsConfirmation:false,best:a,candidates:[a]},undefined),a);
 assert.equal(m.pickAutomatic({needsConfirmation:true,best:a,candidates:[a,b]},undefined),null);
 assert.equal(m.pickAutomatic({needsConfirmation:true,best:a,candidates:[a,b]},['texto-visivel']),b);
 const memo=m.withMemory(mon(),K,['microdata:price']);eq(m.readMemory(mon({reader_memory:memo}))[K],['microdata:price']);
 eq(m.readMemory(mon({reader_memory:'lixo'})),{});
});

test('coleta: só o que venceu, nada de pausado, e forçar lê tudo',()=>{
 const p=m.buildProduct(mon(),[row(K,3000,0),row(P,2900,2.5)]);
 eq(m.storesDue(p,T0+3*H).map(s=>s.name),['Mercado Livre'],'KaBuM e Pichau lidas há menos de 6 h; ML nunca lido');
 eq(m.storesDue(p,T0+7*H).map(s=>s.name),['KaBuM!','Mercado Livre'],'KaBuM venceu (7 h), Pichau ainda não (4,5 h)');
 assert.equal(m.storesDue(p,T0+3*H,true).length,3);
 assert.equal(m.storesDue(m.buildProduct(mon({},{state:'paused'}),[]),T0,true).length,0);
});

test('outras lojas: busca ignora lojas que já existem, adicionar/remover/principal mantêm a lista coerente',()=>{
 const keys=m.searchTargetsFor(m.storesOf(mon())).map(t=>t.key);assert.ok(!keys.includes('kabum')&&!keys.includes('pichau')&&!keys.includes('mercadolivre'));assert.ok(keys.includes('amazon'));
 assert.equal(m.SEARCH_TARGETS.find(t=>t.key==='kabum').url('Placa de Vídeo RTX 4070'),'https://www.kabum.com.br/busca/placa-de-video-rtx-4070');
 assert.equal(m.searchTerms('Placa de Vídeo RTX 4070 (Frete Grátis) | Oferta'),'Placa de Vídeo RTX 4070');
 const x=mon();assert.equal(m.addSource(x,P),P+'\n'+ML,'repetida não duplica');assert.equal(m.addSource(x,'https://www.amazon.com.br/dp/1').split('\n').length,3);
 eq(m.removeSource(x,K),{preferred_url:P,source_urls:ML},'tirar a principal promove a próxima');
 eq(m.makePrimary(x,ML),{preferred_url:ML,source_urls:K+'\n'+P});
});

test('cores de produto não se repetem até acabar a paleta',()=>{
 const used=[];for(let i=0;i<m.PRODUCT_COLORS.length;i++)used.push(m.nextColor(used));assert.equal(new Set(used).size,m.PRODUCT_COLORS.length);
 assert.equal(m.colorOf(mon({line_color:'hsl(1,2%,3%)'}),2),m.PRODUCT_COLORS[2],'cor inválida cai na paleta');
});

test('análise: média pondera pelo tempo, não pela quantidade de leituras',()=>{
 // 3000 valeu 9 h (lido 9 vezes ou 1 vez, tanto faz), 2000 valeu 1 h
 const avg=m.timeWeightedAverage([{t:0,v:3000},{t:9*H,v:2000}],0,10*H);
 assert.equal(avg,2900);
 const repetido=m.timeWeightedAverage([{t:0,v:3000},{t:1*H,v:3000},{t:2*H,v:3000},{t:9*H,v:2000}],0,10*H);
 assert.equal(repetido,2900);
});

test('análise: menor, maior, posição, economia, mudanças e loja mais barata no tempo',()=>{
 const now=T0+10*24*H;
 const rows=[row(K,3000,0),row(P,3200,0),row(K,2800,48),row(P,2700,120),row(K,2600,200)];
 const p=m.buildProduct(mon({source_urls:P}),rows);
 const a=m.analyzeProduct(p,'all',now);
 assert.equal(a.min.v,2600);assert.equal(a.max.v,3000);assert.equal(a.position,0);
 assert.equal(a.saving,400);
 assert.equal(a.verdict.kind,'great');
 eq(a.changes.map(c=>[c.store,c.from,c.to]),[['KaBuM!',2800,2600],['Pichau',3200,2700],['KaBuM!',3000,2800]]);
 const k=a.stores.find(s=>s.name==='KaBuM!'),pi=a.stores.find(s=>s.name==='Pichau');
 assert.equal(k.changes,2);assert.equal(pi.changes,1);
 assert.ok(Math.abs(k.cheapestShare+pi.cheapestShare-1)<1e-9,'as frações somam 100%');
 assert.ok(k.cheapestShare>pi.cheapestShare);
 eq(a.spread,{cheap:'KaBuM!',expensive:'Pichau',diff:100});
 assert.equal(m.allReadings(p).length,5);assert.ok(m.allReadings(p)[0].t>=m.allReadings(p)[4].t,'mais recente primeiro');
});

test('análise: veredito não inventa opinião sem dados e reconhece preço caro',()=>{
 assert.equal(m.analyzeProduct(m.buildProduct(mon(),[]),'30d').verdict.kind,'unknown');
 assert.equal(m.analyzeProduct(m.buildProduct(mon(),[row(K,3000,0)]),'all',T0+H).verdict.kind,'unknown');
 const now=T0+10*24*H,rows=[row(K,2000,0),row(K,2100,24),row(K,2050,48),row(K,3000,72)];
 assert.equal(m.analyzeProduct(m.buildProduct(mon({source_urls:''}),rows),'all',now).verdict.kind,'high');
});

test('gráfico: linha de referência (média, preço-alvo) entra na escala',()=>{
 const g=m.chartGeometry([{id:'a',color:'#f00',points:[{t:T0,v:3000},{t:T0+H,v:3100}]}],{width:300,height:150,window:'all',mode:'price',now:T0+2*H,refs:[2000]});
 assert.ok(g.y0<=2000);assert.equal(g.refY.length,1);assert.ok(g.refY[0]>=0&&g.refY[0]<=150);
});
