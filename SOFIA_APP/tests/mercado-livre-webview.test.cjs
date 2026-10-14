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
 const state='_n.ctx.r={"appProps":{"pageProps":{"initialState":{"id":"MLB42258825"}}}};_n.ctx.r.assets=new Map([]);'+'x'.repeat(300);
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
