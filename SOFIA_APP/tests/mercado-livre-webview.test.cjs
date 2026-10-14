'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const load=require('./load-ts.cjs'),provider=load('src/lib/price-provider.ts');
const React={useEffect:()=>{},useState:v=>[v,()=>{}],useRef:v=>({current:v}),useMemo:f=>f(),useCallback:f=>f};
const jsx={jsx:(t,p)=>({type:t,props:p}),jsxs:(t,p)=>({type:t,props:p}),Fragment:'Fragment'};
const device=load('src/lib/mercado-livre-device.ts',{},{AbortController,setTimeout,clearTimeout});
const reader=load('src/lib/price-reader.tsx',{'./price-provider':provider,react:React,'react/jsx-runtime':jsx,'react-native':{View:'View'},'./price-extractor':{},'./monitoring':{readerUrl:u=>u,readerAgent:()=>'mobile'},'./mercado-livre-device':device},{AbortController,setTimeout,clearTimeout});
const LINK='https://www.mercadolivre.com.br/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523';

test('leitura do ML so navega dentro do ML; leituras comuns nunca; meli://, intent:// e fora: recusados',()=>{
 const ml={kind:'ml-state'},price={kind:'price'};
 assert.equal(reader.allowNavigation(ml,LINK),true);
 assert.equal(reader.allowNavigation(ml,'https://produto.mercadolivre.com.br/MLB-1-x'),true);
 assert.equal(reader.allowNavigation(ml,'https://http2.mlstatic.com/x.js'),false,'recursos de fora nao navegam a pagina principal');
 for(const u of ['meli://item?id=MLB1','intent://item/MLB1#Intent;end','https://evil.example/','https://mercadolivre.com.br.evil.example/'])assert.equal(reader.allowNavigation(ml,u),false,u);
 assert.equal(reader.allowNavigation(price,LINK),false,'leitura comum nunca vai ao ML');
 assert.equal(reader.allowNavigation(price,'https://www.kabum.com.br/produto/1'),true);
 assert.equal(reader.allowNavigation(null,'meli://x'),false);
});
test('readPrice/readLinks continuam recusando o ML; readMercadoLivreState registra o leitor e recusa host de fora',async()=>{
 assert.equal((await reader.readPrice(LINK)).ok,false);
 assert.equal((await reader.readLinks(LINK,'x','','y')).ok,false);
 assert.equal(typeof device.mercadoLivrePageReader(),'function','leitor registrado ao carregar o modulo');
 assert.equal((await reader.readMercadoLivreState('https://evil.example/p/MLB1')).code,'UNSUPPORTED_HOST');
 assert.equal((await reader.readMercadoLivreState(LINK)).code,'READER_NOT_MOUNTED','sem host montado: falha clara, nao fica pendurado');
 const c=new AbortController();c.abort();assert.equal((await reader.readMercadoLivreState(LINK,c.signal)).code,'CANCELLED');
});
test('script injetado: copia o bloco de dados e a URL final; detecta login/captcha; nada de preco interpretado',()=>{
 const src=reader.buildMercadoLivreStateScript();
 const posted=[];
 const state='_n.ctx.r={"appProps":{"pageProps":{"initialState":{"id":"MLB42258825","components":{"price":{}}}}}};_n.ctx.r.assets=new Map([]);'+'x'.repeat(300);
 const env={location:{href:LINK,pathname:'/p/MLB42258825'},document:{getElementById:id=>id==='__NORDIC_RENDERING_CTX__'?{textContent:state}:null,body:{innerHTML:'<div>produto</div>'}},window:{ReactNativeWebView:{postMessage:m=>posted.push(m)}},setTimeout:(f)=>f()};
 env.window.location=env.location;
 vm.runInNewContext(src,env);
 const m=reader.parseMercadoLivreStateMessage(posted[0]);
 assert.equal(m.ok,true);assert.equal(m.html,'<script id="__NORDIC_RENDERING_CTX__">'+state+'</script>');assert.equal(m.finalUrl,LINK);
 // pagina de login: nao fica tentando para sempre, reporta
 const posted2=[];const env2={location:{href:'https://www.mercadolivre.com.br/jms/mlb/lgz/login',pathname:'/jms/mlb/lgz/login'},document:{getElementById:()=>null,body:{innerHTML:'entre'}},window:{ReactNativeWebView:{postMessage:m=>posted2.push(m)}},setTimeout:(f)=>f()};
 vm.runInNewContext(src,env2);assert.equal(reader.parseMercadoLivreStateMessage(posted2[0]).code,'VERIFICATION_REQUIRED');
 // sem bloco: desiste depois das tentativas
 const posted3=[];let n=0;const env3={location:{href:LINK,pathname:'/p/x'},document:{getElementById:()=>null,body:{innerHTML:'nada'}},window:{ReactNativeWebView:{postMessage:m=>posted3.push(m)}},setTimeout:(f)=>{if(++n<60)f();}};
 vm.runInNewContext(src,env3);assert.equal(reader.parseMercadoLivreStateMessage(posted3[0]).code,'STATE_NOT_FOUND');
});
test('mensagem vinda da pagina e tratada como dado: URL final de fora, html curto, codigo estranho ou lixo nao passam',()=>{
 const p=reader.parseMercadoLivreStateMessage;
 assert.equal(p(JSON.stringify({kind:'ml-state',ok:true,html:'<script id="__NORDIC_RENDERING_CTX__">'+'y'.repeat(300)+'</script>',finalUrl:'https://evil.example/'})).ok,false);
 assert.equal(p(JSON.stringify({kind:'ml-state',ok:true,html:'curto',finalUrl:LINK})).ok,false);
 assert.equal(p(JSON.stringify({kind:'ml-state',ok:false,code:'<script>alert(1)</script>'})).code,'STATE_NOT_FOUND');
 assert.equal(p('nao e json').ok,false);assert.equal(p(JSON.stringify({kind:'price',ok:true})).ok,false);
});
test('leitura do ML usa a versao de COMPUTADOR (formato validado); outras lojas seguem a regra delas',()=>{
 const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/lib/price-reader.tsx'),'utf8');
 assert.ok(s.includes("userAgent={job.kind === 'ml-state' || readerAgent(job.url) === 'desktop' ? DESKTOP_AGENT : USER_AGENT}"));
 const d=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/lib/mercado-livre-device.ts'),'utf8');
 assert.match(d,/'user-agent': 'Mozilla\/5\.0 \(Windows NT 10\.0/);
});

// ---- 0.3.138: tela "Abra o app do Mercado Livre" (openInApp) no lugar do produto ----
function runScript(env){const posted=[];env.window={ReactNativeWebView:{postMessage:m=>posted.push(m)}};env.window.location=env.location;
 const store={};env.sessionStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;},removeItem:k=>{delete store[k];}};
 let n=0;env.setTimeout=env.setTimeout||(f=>{if(++n<60)f();});
 require('node:vm').runInNewContext(reader.buildMercadoLivreStateScript(),env);return {posted,store};}
const INTERSTITIAL='_n.ctx.r={"appProps":{"pageProps":{"openInApp":true,"deviceType":"desktop","appStoreLinks":{},"authLinks":{},"header":{},"deeplink":"meli://item?id=MLB5296520523","webUrl":"https:\\u002F\\u002Fwww.mercadolivre.com.br\\u002Ffone-shokz\\u002Fp\\u002FMLB42258825?pdp_filters=item_id%3AMLB5296520523"}}};'+'z'.repeat(300);
test('tela "Abra o app": segue o link do produto NA WEB (nunca meli://) e nao envia dados da tela intermediaria',()=>{
 const loc={href:'https://www.mercadolivre.com.br/social/x?forceInApp=true',pathname:'/social/x'};
 const {posted,store}=runScript({location:loc,document:{getElementById:id=>id==='__NORDIC_RENDERING_CTX__'?{textContent:INTERSTITIAL}:null,body:{innerHTML:'Abra o app'},querySelectorAll:()=>[]}});
 assert.equal(posted.length,0,'nada enviado da tela intermediaria');
 assert.equal(loc.href,'https://www.mercadolivre.com.br/fone-shokz/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523');
 assert.equal(store.sofiaMlHops,'1');
 assert.equal(reader.allowNavigation({kind:'ml-state'},loc.href),true);assert.equal(reader.allowNavigation({kind:'ml-state'},'meli://item?id=MLB5296520523'),false);
});
test('tela "Abra o app" sem link do produto (ou depois de 2 saltos): falha clara APP_INTERSTITIAL',()=>{
 const noLink=INTERSTITIAL.replace(/"webUrl":"[^"]*"/,'"x":1');
 let r=runScript({location:{href:'https://www.mercadolivre.com.br/social/x',pathname:'/social/x'},document:{getElementById:()=>({textContent:noLink}),body:{innerHTML:''},querySelectorAll:()=>[]}});
 assert.equal(reader.parseMercadoLivreStateMessage(r.posted[0]).code,'APP_INTERSTITIAL');
});
test('so aceita dados de pagina de PRODUTO (initialState + components)',()=>{
 const product='_n.ctx.r={"appProps":{"pageProps":{"initialState":{"id":"MLB42258825","components":{"price":{}}}}}};'+'p'.repeat(300);
 const r=runScript({location:{href:LINK,pathname:'/p/MLB42258825'},document:{getElementById:()=>({textContent:product}),body:{innerHTML:''},querySelectorAll:()=>[]}});
 assert.equal(reader.parseMercadoLivreStateMessage(r.posted[0]).ok,true);
 const other='_n.ctx.r={"appProps":{"pageProps":{"algo":1}}};'+'q'.repeat(300);
 const r2=runScript({location:{href:LINK,pathname:'/p/MLB42258825'},document:{getElementById:()=>({textContent:other}),body:{innerHTML:''},querySelectorAll:()=>[]}});
 assert.equal(reader.parseMercadoLivreStateMessage(r2.posted[0]).code,'STATE_NOT_FOUND','bloco que nao e de produto nao vai ao servidor');
});
test('endereco limpo: tira parametros de compartilhamento e preserva o anuncio escolhido',()=>{
 const c=device.canonicalMercadoLivreUrl;
 assert.equal(c('https://www.mercadolivre.com.br/fone-x/p/MLB42258825?matt_tool=1&forceInApp=true&pdp_filters=item_id:MLB5296520523#origin=share'),'https://www.mercadolivre.com.br/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523');
 assert.equal(c('https://www.mercadolivre.com.br/p/MLB42258825#wid=MLB5296520523&sid=share'),'https://www.mercadolivre.com.br/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523');
 assert.equal(c('http://produto.mercadolivre.com.br/MLB-4292609581-fone-_JM?matt_tool=9#position=3'),'https://produto.mercadolivre.com.br/MLB-4292609581-fone-_JM');
 assert.equal(c('https://www.mercadolivre.com.br/fones/up/MLBU4015253503#wid=MLB4719125711'),'https://www.mercadolivre.com.br/up/MLBU4015253503?wid=MLB4719125711');
 assert.equal(c('https://mercadolivre.com/sec/1AbC23x'),'https://mercadolivre.com/sec/1AbC23x','link curto fica como esta (o navegador resolve)');
});
