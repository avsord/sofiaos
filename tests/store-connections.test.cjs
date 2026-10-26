'use strict';
// Conexoes de lojas: Mercado Livre por login da pessoa (OAuth) + leitura pela API oficial.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');
const LINK='https://www.mercadolivre.com.br/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523';
const ENV={ML_APP_ID:'123456',ML_APP_SECRET:'segredo-app',SOFIA_CALENDAR_TOKEN_KEY:'chave-de-teste',ALIEXPRESS_APP_KEY:'',ALIEXPRESS_APP_SECRET:''};
const ITEM={id:'MLB5296520523',title:'Fone de Ouvido Shokz OpenRun Pro 2',price:1412.83,currency_id:'BRL',available_quantity:6,status:'active',seller_id:427963557,catalog_product_id:'MLB42258825',permalink:'https://www.mercadolivre.com.br/fone/p/MLB42258825',sold_quantity:100,condition:'new'};
// Mercado Livre falso: token, renovacao (refresh rotativo), /users/me, /items, /users/{id}
function fakeML(state={}){
 state.refreshes=0;state.tokens=[];state.items={...(state.items||{})};
 const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json'}});
 return async(url,init={})=>{
  const u=String(url);const auth=String(init.headers?.Authorization||init.headers?.authorization||'');
  if(u.startsWith('https://api.mercadolibre.com/oauth/token')){
   const b=new URLSearchParams(String(init.body));
   if(b.get('client_id')!=='123456'||b.get('client_secret')!=='segredo-app')return json({error:'invalid_client'},401);
   if(b.get('grant_type')==='authorization_code'){if(b.get('code')!=='CODE-OK')return json({error:'invalid_grant'},400);const t='AT-'+(++state.refreshes);state.tokens.push(t);return json({access_token:t,refresh_token:'RT-1',expires_in:21600,user_id:999});}
   if(b.get('grant_type')==='refresh_token'){const n=state.refreshes+1;if(b.get('refresh_token')!=='RT-'+state.refreshes)return json({error:'invalid_grant'},400);state.refreshes=n;const t='AT-'+n;state.tokens.push(t);return json({access_token:t,refresh_token:'RT-'+n,expires_in:21600});}
   return json({error:'unsupported'},400);
  }
  if(!auth.startsWith('Bearer AT-'))return json({error:'unauthorized'},401);
  if(state.revoked&&!state.tokens.slice(-1).includes(auth.slice(7)))return json({error:'unauthorized'},401);
  if(u.includes('/users/me'))return json({id:999,nickname:'PEDRO_SILVA'});
  if(state.forbidden&&/\/items\//.test(u))return json({status:403,error:'access_denied',message:'Access to the requested resource is forbidden',code:'FORBIDDEN'},403);
  const pi=/\/products\/(MLB\d+)\/items/.exec(u);if(pi)return state.catalog&&state.catalog[pi[1]]?json({paging:{total:state.catalog[pi[1]].items.length},results:state.catalog[pi[1]].items}):json({error:'not_found'},404);
  const pr=/\/products\/(MLB\d+)(?:\?|$)/.exec(u);if(pr)return state.catalog&&state.catalog[pr[1]]?json({id:pr[1],name:state.catalog[pr[1]].name}):json({error:'not_found'},404);
  const it=/\/items\/(MLB\d+)/.exec(u);if(it)return state.items[it[1]]?json(state.items[it[1]]):json({error:'not_found'},404);
  const us=/\/users\/(\d+)/.exec(u);if(us)return json({id:+us[1],nickname:us[1]==='427963557'?'TechPrime':'Outro'});
  return json({error:'unknown'},404);
 };
}
async function setup(t,mlState={items:{MLB5296520523:ITEM}}){
 const f=fixture(t);f.config.loginPassword='integration-test-password-only';f.config.loginEmail='owner@example.com';
 const ml=fakeML(mlState);
 const r=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure'),storesFetch:ml,storesEnv:ENV,mercadoLivreOptions:{fetchImpl:async()=>assert.fail('com a conta conectada o servidor nao deve buscar a pagina'),minIntervalMs:0}});
 const server=http.createServer(r.handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const res=await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:f.config.loginPassword})});
 const {token}=await res.json();
 const call=async(p,body,method=body?'POST':'GET')=>{const x=await fetch(base+p,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});return {status:x.status,body:await x.json().catch(()=>({}))};};
 return {...f,...r,base,token,call,mlState};
}
async function connect(f){
 const c=await f.call('/api/mobile/price-tracker/connections/mercadolivre/connect',{app:true});
 assert.equal(c.status,200);const u=new URL(c.body.url);
 assert.equal(u.origin+u.pathname,'https://auth.mercadolivre.com.br/authorization');assert.equal(u.searchParams.get('client_id'),'123456');
 assert.equal(u.searchParams.get('redirect_uri'),f.base+'/stores/mercadolivre/oauth/callback');
 const cb=await fetch(f.base+'/stores/mercadolivre/oauth/callback?code=CODE-OK&state='+encodeURIComponent(u.searchParams.get('state')),{redirect:'manual'});
 return cb;
}

test('status: mesmo formato para todas as lojas; sem conta, Mercado Livre aparece "nao conectado" e AliExpress "sem chave"',async t=>{
 const f=await setup(t);const s=await f.call('/api/mobile/price-tracker/connections');
 assert.equal(s.status,200);assert.deepEqual(s.body.stores.map(x=>[x.provider,x.mode,x.configured,x.connected]),[['mercadolivre','login',true,false],['aliexpress','server',false,false]]);
 assert.equal(s.body.stores[0].redirect_uri,f.base+'/stores/mercadolivre/oauth/callback');
 const nope=await fetch(f.base+'/api/mobile/price-tracker/connections');assert.equal(nope.status,401,'exige login na Sofia');
});
test('conectar pelo app: janela do ML -> volta para sofiaapp://stores -> status conectado com o apelido',async t=>{
 const f=await setup(t);const cb=await connect(f);
 assert.equal(cb.status,302);const loc=new URL(cb.headers.get('location').replace('sofiaapp://','https://x/'));
 assert.equal(loc.pathname,'/stores');assert.equal(loc.searchParams.get('provider'),'mercadolivre');assert.equal(loc.searchParams.get('ok'),'1');
 const s=await f.call('/api/mobile/price-tracker/connections');const ml=s.body.stores[0];
 assert.equal(ml.connected,true);assert.equal(ml.account,'PEDRO_SILVA');
 assert.ok(!JSON.stringify(f.store.db.prepare('SELECT data FROM store_link').all()).includes('RT-1'),'refresh token fica criptografado no banco');
});
test('estado invalido/expirado e cancelamento nao conectam nada',async t=>{
 const f=await setup(t);
 let cb=await fetch(f.base+'/stores/mercadolivre/oauth/callback?code=CODE-OK&state=a.inventado',{redirect:'manual'});
 assert.equal(cb.status,302);assert.match(cb.headers.get('location'),/ok=0/);
 const c=await f.call('/api/mobile/price-tracker/connections/mercadolivre/connect',{});const st=new URL(c.body.url).searchParams.get('state');
 cb=await fetch(f.base+'/stores/mercadolivre/oauth/callback?error=access_denied&state='+encodeURIComponent(st));
 assert.equal(cb.status,200);assert.match(await cb.text(),/cancelada/);
 assert.equal((await f.call('/api/mobile/price-tracker/connections')).body.stores[0].connected,false);
});
test('com a conta conectada, a leitura vem da API oficial: sem pagina, sem navegador, mesmo formato de antes',async t=>{
 const f=await setup(t);await connect(f);
 const r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:LINK});
 assert.equal(r.status,200);assert.equal(r.body.ok,true,JSON.stringify(r.body));
 const x=r.body.reading;assert.equal(x.amountCents,141283);assert.equal(x.itemId,'MLB5296520523');assert.equal(x.identityKey,'mercadolivre:MLB5296520523');
 assert.equal(x.seller.id,'427963557');assert.equal(x.seller.name,'TechPrime');assert.equal(x.source,'api.mercadolibre.com');assert.equal(x.catalogProductId,'MLB42258825');
 assert.ok(Number.isFinite(Date.parse(x.observedAt)));
});
test('acesso expira -> renova sozinho com o refresh rotativo do ML; anuncio pausado -> preco anterior preservado; vendedor trocado -> SELLER_MISMATCH',async t=>{
 const f=await setup(t);await connect(f);
 f.runtime=null;f.stores.access={token:'AT-velho',exp:0}; // forca renovacao
 let r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:LINK});assert.equal(r.body.ok,true);assert.equal(f.mlState.refreshes,2,'renovou uma vez');
 f.stores.access={token:'AT-velho',exp:0};r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:LINK});assert.equal(r.body.ok,true);assert.equal(f.mlState.refreshes,3,'segunda renovacao usa o refresh NOVO, nao o antigo');
 f.mlState.items.MLB5296520523={...ITEM,status:'paused'};
 r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:LINK});assert.equal(r.body.ok,false);assert.equal(r.body.code,'UNAVAILABLE');assert.equal(r.body.keepLastPrice,true);
 f.mlState.items.MLB5296520523={...ITEM,seller_id:740521218};
 r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:LINK,expectedSellerId:'427963557'});assert.equal(r.body.code,'SELLER_MISMATCH');assert.equal(r.body.needsUserAction,true);
});
test('desconectar: volta ao caminho antigo (pagina), e o app sabe disso pelo status',async t=>{
 const f=await setup(t);await connect(f);
 assert.equal((await f.call('/api/mobile/price-tracker/connections/mercadolivre/disconnect',{})).status,200);
 assert.equal((await f.call('/api/mobile/price-tracker/connections')).body.stores[0].connected,false);
 const r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:LINK});
 assert.equal(r.body.ok,false,'sem conta e sem pagina o servidor tenta a pagina e falha com motivo');
});
test('AliExpress: assinatura HMAC-SHA256 da Open Platform e leitura pela chave do servidor',async t=>{
 const {StoreConnections}=require('../src/services/store-connections');
 const f=fixture(t);
 const calls=[];const fetchImpl=async(url)=>{calls.push(String(url));return new Response(JSON.stringify({aliexpress_affiliate_productdetail_get_response:{resp_result:{resp_code:200,result:{products:{product:[{product_id:1005009140414,product_title:'Shokz OpenRun Pro 2',target_sale_price:'846.76',target_sale_price_currency:'BRL',target_original_price:'1299.00',shop_id:12345,shop_name:'Shokz Official Store',product_detail_url:'https://pt.aliexpress.com/item/1005009140414.html'}]}}}}}),{headers:{'content-type':'application/json'}});};
 const s=new StoreConnections(f.store,f.config,{fetchImpl,env:{ALIEXPRESS_APP_KEY:'k1',ALIEXPRESS_APP_SECRET:'s1'}});
 assert.equal(s.status().stores[1].connected,true);assert.equal(s.status().stores[1].mode,'server');
 const r=await s.readAliExpress('1005009140414');
 assert.equal(r.amountCents,84676);assert.equal(r.currency,'BRL');assert.equal(r.identityKey,'aliexpress:1005009140414');assert.equal(r.seller.name,'Shokz Official Store');
 const q=new URL(calls[0]).searchParams;assert.equal(q.get('method'),'aliexpress.affiliate.productdetail.get');assert.equal(q.get('target_currency'),'BRL');
 const params={};for(const [k,v] of q)if(k!=='sign')params[k]=v;
 const expected=require('node:crypto').createHmac('sha256','s1').update(Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('hex').toUpperCase();
 assert.equal(q.get('sign'),expected,'assinatura conforme a Open Platform');
 const s2=new StoreConnections(f.store,f.config,{fetchImpl,env:{}});
 await assert.rejects(()=>s2.readAliExpress('1005009140414'),e=>e.code==='ALI_NOT_CONFIGURED');
});

const CATALOG={MLB42258825:{name:'Fone de Ouvido Shokz OpenRun Pro 2',items:[{item_id:'MLB9999999999',price:1399.9,currency_id:'BRL',seller_id:111},{item_id:'MLB5296520523',price:1412.83,currency_id:'BRL',seller_id:427963557,condition:'new',available_quantity:6}]}};
test('0.3.235: o ML bloqueia /items de outro vendedor (403 access_denied) -> le o MESMO anuncio pelo catalogo, com preco, vendedor e nome',async t=>{
 const f=await setup(t,{items:{MLB5296520523:ITEM},forbidden:true,catalog:CATALOG});await connect(f);
 const r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:LINK});
 assert.equal(r.status,200);assert.equal(r.body.ok,true,JSON.stringify(r.body));
 const x=r.body.reading;assert.equal(x.itemId,'MLB5296520523','o anuncio do link, nao o mais barato');assert.equal(x.amountCents,141283);
 assert.equal(x.seller.id,'427963557');assert.equal(x.seller.name,'TechPrime');assert.equal(x.title,'Fone de Ouvido Shokz OpenRun Pro 2');
 assert.equal(x.source,'api.mercadolibre.com/products');assert.equal(x.catalogProductId,'MLB42258825');
});
test('0.3.235: anuncio que saiu do catalogo -> aviso claro e preco anterior preservado (nunca pega o de outro vendedor)',async t=>{
 const f=await setup(t,{items:{MLB5296520523:ITEM},forbidden:true,catalog:{MLB42258825:{name:'X',items:[{item_id:'MLB9999999999',price:10,currency_id:'BRL',seller_id:111}]}}});await connect(f);
 const r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:LINK});
 const text=JSON.stringify(r.body);assert.match(text,/ITEM_NOT_IN_CATALOG/);assert.match(text,/preco anterior preservado/);assert.ok(!/"amountCents":1000/.test(text));
});

test('0.3.236: link sem catalogo (produto.mercadolivre.com.br/MLB-...) com /items bloqueado -> mensagem clara pedindo o link /p/, sem tentar a pagina',async t=>{
 const f=await setup(t,{items:{MLB5296520523:ITEM},forbidden:true,catalog:CATALOG});await connect(f);
 const r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:'https://produto.mercadolivre.com.br/MLB-5296520523-fone-shokz-_JM'});
 const text=JSON.stringify(r.body);
 assert.match(text,/ML_NEEDS_CATALOG_LINK/,text);assert.match(text,/Copie esse endereço da barra/);assert.ok(!/VERIFICATION_REQUIRED/.test(text));
});

test('0.3.237: link de compartilhar + endereco final que o celular seguiu (/p/MLB...) -> le pelo catalogo o MESMO anuncio',async t=>{
 const f=await setup(t,{items:{MLB5296520523:ITEM},forbidden:true,catalog:CATALOG});await connect(f);
 const r=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:'https://produto.mercadolivre.com.br/MLB-5296520523-fone-shokz-_JM',finalUrl:'https://www.mercadolivre.com.br/fone/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523'});
 assert.equal(r.body.ok,true,JSON.stringify(r.body));assert.equal(r.body.reading.itemId,'MLB5296520523');assert.equal(r.body.reading.amountCents,141283);
 const evil=await f.call('/api/mobile/price-tracker/mercadolivre/read',{link:'https://produto.mercadolivre.com.br/MLB-5296520523-fone-shokz-_JM',finalUrl:'https://evil.example/p/MLB42258825'});
 assert.match(JSON.stringify(evil.body),/ML_NEEDS_CATALOG_LINK/,'endereco fora do ML e ignorado');
});

test('0.3.240: AliExpress mostra o motivo exato (erro da plataforma e resp_code/resp_msg), sem chave',async t=>{
 const {StoreConnections}=require('../src/services/store-connections');const f=fixture(t);
 const mk=json=>new StoreConnections(f.store,f.config,{env:{ALIEXPRESS_APP_KEY:'k',ALIEXPRESS_APP_SECRET:'s'},fetchImpl:async()=>({ok:true,status:200,json:async()=>json})});
 await assert.rejects(mk({error_response:{code:'27',msg:'Invalid session',sub_code:'isv.appkey-not-exists',sub_msg:'App nao aprovado'}}).readAliExpress('1005006123456789'),e=>/isv\.appkey-not-exists/.test(e.message)&&/App nao aprovado/.test(e.message)&&!/\bs\b|sign/.test(e.message.replace(/sub/g,'')));
 await assert.rejects(mk({aliexpress_affiliate_productdetail_get_response:{resp_result:{resp_code:405,resp_msg:'The products not exist or not affiliate'}}}).readAliExpress('1005006123456789'),e=>/405 — The products not exist or not affiliate/.test(e.message));
 const down=new StoreConnections(f.store,f.config,{env:{ALIEXPRESS_APP_KEY:'k',ALIEXPRESS_APP_SECRET:'s'},fetchImpl:async()=>({ok:false,status:503,json:async()=>{throw Error('html');}})});
 await assert.rejects(down.readAliExpress('1005006123456789'),e=>/respondeu 503 sem dados/.test(e.message));
});
