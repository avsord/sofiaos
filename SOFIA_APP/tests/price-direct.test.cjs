'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const provider=load('src/lib/price-provider.ts');
const m=load('src/lib/price-direct.ts',{'./price-provider':provider},{AbortController});
const SHARE='https://www.mercadolivre.com.br/p/MLB42258825?matt_tool=38524122&pdp_filters=item_id:MLB5296520523#origin=share&wid=MLB5296520523';
const reading=()=>({provider:'mercadolivre',itemId:'MLB5296520523',catalogProductId:'MLB42258825',identityKey:'mercadolivre:MLB5296520523',title:'Produto de teste',seller:{id:'427963557',name:'TechPrime'},normalizedUrl:'https://www.mercadolivre.com.br/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523',amount:1412.83,amountCents:141283,currency:'BRL',source:'__NORDIC_RENDERING_CTX__',observedAt:new Date().toISOString()});
test('ML recognition covers catalog, item, short links and deep links; does not trust lookalike domains',()=>{
 for(const u of [SHARE,'https://mercadolivre.com/sec/1AbC23x','https://produto.mercadolivre.com.br/MLB-12345678-teste','https://www.mercadolivre.com.br/p/MLB42258825','meli://item?id=MLB5296520523','https://lista.mercadolivre.com.br/fone'])assert.equal(provider.isMercadoLivreUrl(u),true,u);
 for(const u of ['https://mercadolivre.com.br.evil.invalid/MLB-123456','https://fake-mercadolivre.com.br/MLB-123456','https://kabum.com.br/produto/123'])assert.equal(provider.isMercadoLivreUrl(u),false,u);
});
test('selected HTML result from authenticated Sofia API maps exact cents, timestamp and identity',async()=>{
 const calls=[];const api={readMercadoLivre:async(u,options)=>{calls.push({u,options});return {ok:true,reading:reading()};}};
 const r=await m.readStorePrice(SHARE,api,async()=>assert.fail('must not mount WebView'),{monitorId:'mon-1'});
 assert.equal(r.ok,true);assert.equal(r.result.best.amount,1412.83);assert.equal(r.mercadoLivre.itemId,'MLB5296520523');assert.equal(r.result.best.origins[0],'mercadolivre:html:MLB5296520523');
 assert.equal(calls[0].u,SHARE);assert.equal(calls[0].options.monitorId,'mon-1');
});
for(const code of ['BLOCKED','VERIFICATION_REQUIRED','HTTP_ERROR','RATE_LIMITED','TIMEOUT','NETWORK','STATE_NOT_FOUND','PRICE_MISSING','ITEM_MISMATCH','SELLER_MISMATCH','MONITOR_PAUSED','SOURCE_REMOVED','CANCELLED'])test('ML '+code+': error is retained; ZERO browser calls',async()=>{
 let browser=0;const r=await m.readStorePrice(SHARE,{readMercadoLivre:async()=>({ok:false,code,message:'Leitura recusada.',keepLastPrice:true})},async()=>{browser++;return {ok:false,error:'browser'};});
 assert.equal(r.ok,false);assert.equal(r.code,code);assert.equal(r.keepLastPrice,true);assert.equal(browser,0);
});
test('ML API throwing or absent does not return null or call the old extractor',async()=>{
 for(const api of [{readMercadoLivre:async()=>{throw Object.assign(new Error('offline'),{code:'NETWORK'});}},{readMercadoLivre:async()=>{throw Object.assign(new Error('missing route'),{status:404});}},{}]){
  const r=await m.readStorePrice(SHARE,api,async()=>assert.fail('unexpected WebView'));assert.equal(r.ok,false);
 }
});
test('invalid backend price/currency/date/seller is rejected rather than plotted',async()=>{
 for(const modify of [r=>r.amountCents=0,r=>r.amountCents=1.2,r=>r.currency='USD',r=>r.observedAt=null,r=>r.seller.id='',r=>r.identityKey='mercadolivre:MLB123456']){
  const value=reading();modify(value);const r=await m.readDirect(SHARE,{readMercadoLivre:async()=>({ok:true,reading:value})});assert.equal(r.ok,false);assert.equal(r.code,'INVALID_RESPONSE');
 }
});
test('ML: expected seller mismatch, abort before request and abort after result are rejected',async()=>{
 const api={readMercadoLivre:async()=>({ok:true,reading:reading()})};
 assert.equal((await m.readDirect(SHARE,api,{expectedSellerId:'999999'})).code,'SELLER_MISMATCH');
 const c=new AbortController();c.abort();assert.equal((await m.readDirect(SHARE,{readMercadoLivre:()=>assert.fail('network after cancellation')},{signal:c.signal})).code,'CANCELLED');
 const d=new AbortController();assert.equal((await m.readDirect(SHARE,{readMercadoLivre:async()=>{d.abort();return {ok:true,reading:reading()};}},{signal:d.signal})).code,'CANCELLED');
});
test('other stores still use their original page reader, without ML network calls',async()=>{
 let browser=0;const r=await m.readStorePrice('https://kabum.com.br/produto/123',{readMercadoLivre:()=>assert.fail('ML used for another store')},async()=>{browser++;return {ok:false,error:'store error'};});
 assert.equal(browser,1);assert.equal(r.error,'store error');
});
test('ML source metadata preserves original URL as key and does not carry HTML or cookies',()=>{
 const pin=m.identityOf(reading()),raw=JSON.stringify({[SHARE]:pin});
 assert.equal(m.storedMLIdentity(raw,SHARE).sellerId,'427963557');assert.equal(m.storedMLIdentity('null',SHARE),undefined);assert.equal(m.storedMLIdentity('broken',SHARE),undefined);
 assert.ok(!JSON.stringify(pin).includes('observedAt'));assert.equal(pin.priceBasis,'product_excluding_shipping');
});
test('both collection and add form use same dispatch; neither can catch failure then open browser',()=>{
 for(const file of ['src/lib/monitor-collector.ts','src/screens/Monitoring.tsx']){
  const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');assert.ok(src.includes('await readStorePrice('));assert.ok(!src.includes('readDirect('));assert.ok(!/catch\(\(\) => null\)\) \|\|/.test(src));
 }
});
