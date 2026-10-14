'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const dev=load('src/lib/mercado-livre-device.ts',{},{AbortController,setTimeout,clearTimeout});
const LINK='https://www.mercadolivre.com.br/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523';
const BLOCK='<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r={"a":1};_n.ctx.r.assets=new Map([]);</script>';
const page='<html><head><meta name="csrf" content="SEGREDO"><script>window.x=1</script>'+BLOCK+'<script>cookie="TOKEN"</script></head></html>';
// Igual ao fetch do React Native: segue redirecionamentos e expoe a URL final em res.url.
const fake=(res)=>async(u,init)=>({status:res.status??200,url:res.url??u,text:async()=>res.body??page});

test('celular: baixa como texto e envia SO o bloco de dados (sem csrf, cookies ou resto da pagina)',async()=>{
 let init;const r=await dev.fetchMercadoLivrePage(LINK,{fetchImpl:async(u,i)=>{init=i;return fake({})(u,i);}});
 assert.equal(r.ok,true);assert.equal(r.html,BLOCK);assert.ok(!r.html.includes('SEGREDO')&&!r.html.includes('TOKEN'));
 assert.equal(init.method,'GET');assert.match(init.headers['accept-language'],/pt-BR/);
});
test('celular: redirecionado para login/verificacao = falha explicita, nunca contorno',async()=>{
 for(const url of ['https://www.mercadolivre.com.br/jms/mlb/lgz/login?go=x','https://www.mercadolivre.com.br/gz/account-verification?x=1'])
  assert.equal((await dev.fetchMercadoLivrePage(LINK,{fetchImpl:fake({url,body:'<html>entre</html>'})})).code,'VERIFICATION_REQUIRED');
 assert.equal((await dev.fetchMercadoLivrePage(LINK,{fetchImpl:fake({body:'<html>Complete o captcha</html>'})})).code,'VERIFICATION_REQUIRED');
});
test('celular: so hosts do Mercado Livre, antes e depois dos redirecionamentos',async()=>{
 let called=0;const spy=async()=>{called++;throw Error('nao devia buscar');};
 for(const u of ['https://evil.example/p/MLB1','https://mercadolivre.com.br.evil.example/x','meli://item?id=MLB1','intent://x'])assert.equal((await dev.fetchMercadoLivrePage(u,{fetchImpl:spy})).ok,false);
 assert.equal(called,0);
 assert.equal((await dev.fetchMercadoLivrePage(LINK,{fetchImpl:fake({url:'https://evil.example/'})})).code,'UNSAFE_REDIRECT');
 assert.equal((await dev.fetchMercadoLivrePage('https://mercadolivre.com/sec/1AbC23x',{fetchImpl:fake({url:LINK})})).ok,true,'link curto resolvido pelo proprio fetch');
});
test('celular: 403/429/500, pagina sem dados, erro de rede, tempo limite e cancelamento',async()=>{
 assert.equal((await dev.fetchMercadoLivrePage(LINK,{fetchImpl:fake({status:403})})).code,'BLOCKED');
 assert.equal((await dev.fetchMercadoLivrePage(LINK,{fetchImpl:fake({status:429})})).code,'RATE_LIMITED');
 assert.equal((await dev.fetchMercadoLivrePage(LINK,{fetchImpl:fake({status:500})})).code,'HTTP_ERROR');
 assert.equal((await dev.fetchMercadoLivrePage(LINK,{fetchImpl:fake({body:'<html>ok</html>'})})).code,'STATE_NOT_FOUND');
 assert.equal((await dev.fetchMercadoLivrePage(LINK,{fetchImpl:async()=>{throw Error('offline');}})).code,'NETWORK');
 assert.equal((await dev.fetchMercadoLivrePage(LINK,{timeoutMs:20,fetchImpl:(u,i)=>new Promise((_,no)=>i.signal.addEventListener('abort',()=>no(Error('abort'))))})).code,'TIMEOUT');
 const c=new AbortController();c.abort();assert.equal((await dev.fetchMercadoLivrePage(LINK,{signal:c.signal,fetchImpl:()=>assert.fail()})).code,'CANCELLED');
});
test('modulo do celular nao usa WebView, Linking nem intent',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/lib/mercado-livre-device.ts'),'utf8');
 const code=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
 assert.ok(!/react-native-webview|Linking|openURL|WebBrowser|IntentLauncher|from 'react-native'/.test(code));
});
test('api: le no celular (navegador primeiro, texto de reserva) e manda o bloco ao servidor; se tudo falhar, servidor busca como antes',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/lib/api.ts'),'utf8');
 const part=s.slice(s.indexOf('  async readMercadoLivre('),s.indexOf('  monitorObservations('));
 assert.ok(part.includes('readMercadoLivrePageOnDevice(fetchUrl||canonicalMercadoLivreUrl(link),signal)'),'entra pelo endereco limpo do produto');
 assert.ok(part.includes('page.ok?{link,...params,html:page.html,finalUrl:page.finalUrl}:{link,...params}'));
 assert.ok(!part.includes('fetchUrl:'),'fetchUrl nao vai ao servidor (ele recusa campos desconhecidos)');
 assert.ok(part.includes("' (celular: '+page.code+')'"),'motivo do celular vai junto na mensagem de erro');
});
test('ordem no celular: navegador registrado primeiro; sem navegador, texto; cancelamento respeitado',async()=>{
 const calls=[];
 dev.setMercadoLivrePageReader(async(u)=>{calls.push('browser');return {ok:true,html:BLOCK,finalUrl:u};});
 let r=await dev.readMercadoLivrePageOnDevice(LINK);assert.equal(r.ok,true);assert.deepEqual(calls,['browser']);
 dev.setMercadoLivrePageReader(async()=>({ok:false,code:'VERIFICATION_REQUIRED'}));
 r=await dev.readMercadoLivrePageOnDevice('https://evil.example/x');assert.equal(r.ok,false);assert.equal(r.code,'UNSUPPORTED_HOST','texto de reserva ainda valida o host');
 dev.setMercadoLivrePageReader(async()=>{throw Error('webview quebrou');});
 r=await dev.readMercadoLivrePageOnDevice(LINK);assert.equal(r.ok,false);assert.notEqual(r.code,'CANCELLED','erro do navegador cai no texto de reserva, nao explode');
 const c=new AbortController();c.abort();dev.setMercadoLivrePageReader(()=>assert.fail('cancelado nao le'));
 assert.equal((await dev.readMercadoLivrePageOnDevice(LINK,c.signal)).code,'CANCELLED');
 dev.setMercadoLivrePageReader(null);
});
test('coleta e atualizacao manual usam o endereco salvo do anuncio (vendedor fixado)',()=>{
 for(const f of ['src/lib/monitor-collector.ts','src/screens/Monitoring.tsx'])assert.ok(fs.readFileSync(path.join(__dirname,'..',f),'utf8').includes('fetchUrl: pinned?.normalizedUrl'),f);
});
