'use strict';
const {pins,identity}=require('./mercado-livre-identity');
const failure=(code,message,retryable=false)=>({ok:false,code,message,keepLastPrice:true,retryable,needsUserAction:false});
let modulePromise;
const load=()=>modulePromise||(modulePromise=import('./stores/mercado-livre.mjs'));
function makeMercadoLivreReader({workspace,fetchImpl=globalThis.fetch,minIntervalMs=2500,maxPending=8,timeoutMs=15000}={}){
 let limitPromise,pending=0;const accounts=new Set();
 const limiter=()=>limitPromise||(limitPromise=load().then(m=>m.createLimiter({concurrency:2,minIntervalMs})));
 function context(b){
  if(!b.monitorId)return null;
  let mon;try{mon=workspace.get(b.monitorId);}catch{return failure('MONITOR_UNAVAILABLE','Este acompanhamento não está disponível.');}
  if(mon.kind!=='monitor'||mon.data.method!=='product'||mon.state!=='active')return failure('MONITOR_PAUSED','Acompanhamento pausado ou removido.');
  const sources=[mon.data.preferred_url,...String(mon.data.source_urls||'').split('\n')];
  if(!sources.includes(b.link))return failure('SOURCE_REMOVED','Este link não pertence mais ao acompanhamento.');
  const pin=pins(mon.data.source_identities)[b.link];
  return {mon,pin:pin?identity(pin):null};
 }
 async function read(b,{signal,accountKey='owner-local'}={}){
  if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.link!=='string'||!b.link.trim()||b.link.length>8192)return failure('INVALID_URL','Informe um link válido de até 8192 caracteres.');
  if(Object.keys(b).some(k=>!['link','monitorId','expectedSellerId','allowCatalogWinner'].includes(k)))return failure('INVALID_INPUT','A consulta aceita somente link e identidade da oferta.');
  if(b.expectedSellerId!=null&&!/^\d{1,20}$/.test(String(b.expectedSellerId)))return failure('INVALID_INPUT','Vendedor inválido.');
  if(b.monitorId!=null&&(typeof b.monitorId!=='string'||!/^[-\w]{1,80}$/.test(b.monitorId)))return failure('INVALID_INPUT','Monitor inválido.');
  if(b.allowCatalogWinner!==undefined&&typeof b.allowCatalogWinner!=='boolean')return failure('INVALID_INPUT','Confirmação de catálogo inválida.');
  if(signal?.aborted)return failure('CANCELLED','Leitura cancelada.');
  const first=context(b);if(first?.ok===false)return first;
  if(pending>=maxPending||accounts.has(accountKey))return failure('BUSY','Já há uma leitura em andamento. Aguarde.',true);
  pending++;accounts.add(accountKey);
  try{
   const m=await load(),limit=await limiter();
   return await limit(async()=>{
    if(signal?.aborted)return failure('CANCELLED','Leitura cancelada.');
    const current=context(b);if(current?.ok===false)return current;
    const pin=current?.pin;
    if(pin&&b.expectedSellerId!=null&&pin.sellerId!==String(b.expectedSellerId))return failure('SELLER_MISMATCH','O vendedor informado difere do acompanhamento.');
    const r=await m.readMercadoLivre(pin?.normalizedUrl||b.link,{fetchImpl,timeoutMs,maxBytes:3_000_000,maxRedirects:4,signal,expectedSellerId:pin?.sellerId||b.expectedSellerId,allowCatalogWinner:!b.monitorId&&b.allowCatalogWinner===true});
    if(signal?.aborted)return failure('CANCELLED','Leitura cancelada.');
    const after=context(b);if(after?.ok===false)return after;
    if(!r.ok)return {...r,detail:null}; // Do not expose raw HTML, cookies or network URLs.
    if(pin&&(r.reading.itemId!==pin.itemId||r.reading.seller.id!==pin.sellerId))return failure('SELLER_MISMATCH','A oferta mudou; leitura descartada.');
    return r;
   });
  }catch{return failure('READER_ERROR','Não consegui concluir a leitura. Preço anterior preservado.',true);}
  finally{pending--;accounts.delete(accountKey);}
 }
 return {read};
}
module.exports={makeMercadoLivreReader};
