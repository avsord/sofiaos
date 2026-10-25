'use strict';
const {pins,identity}=require('./mercado-livre-identity');
const failure=(code,message,retryable=false)=>({ok:false,code,message,keepLastPrice:true,retryable,needsUserAction:false});
let modulePromise;
const MAX_DEVICE_HTML=4_000_000;
const load=()=>modulePromise||(modulePromise=import('./stores/mercado-livre.mjs'));
/** Leitura pela API oficial. Devolve null quando o link nao diz qual anuncio e (catalogo sem
 * vendedor): ai os caminhos de pagina decidem. Erros da API viram falha no mesmo formato. */
async function fromApi(m,stores,b,pin,{expectedSellerId}){
 let itemId=pin?.itemId||null,catalogId=pin?.catalogProductId||null;
 if(!itemId||!catalogId){try{const id=m.normalizeMercadoLivreLink(b.link);itemId=itemId||id.itemId;catalogId=catalogId||id.catalogProductId||null;}catch(e){if(e&&e.code==='SHORT_LINK'&&b.finalUrl){try{const f=m.normalizeMercadoLivreLink(b.finalUrl);itemId=itemId||f.itemId;catalogId=catalogId||f.catalogProductId||null;}catch{}}}}
 if(!itemId)return null;
 try{
  const reading=await stores.readMercadoLivre(itemId,{catalogId});
  if(expectedSellerId!=null&&String(expectedSellerId)!==reading.seller.id)return {ok:false,code:'SELLER_MISMATCH',message:'O vendedor mudou; confirme antes de continuar o historico.',keepLastPrice:true,retryable:false,needsUserAction:true};
  return {ok:true,reading};
 }catch(e){
  const code=e&&e.code||'ML_API';
  if(code==='ML_NOT_CONNECTED')return null; // conta caiu no meio: pagina decide
  // 0.3.236: o ML fecha /items de outros vendedores e a pagina pede verificacao; sem o catalogo no link nao ha caminho.
  // Em vez de "VERIFICATION_REQUIRED", diz o que fazer: usar o endereco /p/MLB... que aparece ao abrir o link.
  if(code==='ML_FORBIDDEN')return {ok:false,code:'ML_NEEDS_CATALOG_LINK',message:'Esse link não mostra o catálogo do produto, e o Mercado Livre não libera o preço por ele. Abra o link no navegador: o endereço muda para “…/p/MLB…”. Copie esse endereço da barra e use no Price Tracker. Se não mudar, o anúncio está fora do catálogo e o Mercado Livre não permite ler o preço automaticamente.',keepLastPrice:true,retryable:false,needsUserAction:true};
  const retryable=['RATE_LIMITED','ML_API','ML_TOKEN','UNAVAILABLE'].includes(code);
  return {ok:false,code,message:(e&&e.message)||'A API do Mercado Livre nao respondeu. Preco anterior preservado.',keepLastPrice:true,retryable,needsUserAction:code==='ML_NOT_FOUND'};
 }
}
function fromDevice(m,b,pin,{expectedSellerId,allowCatalogWinner}){
 // Qual anuncio a pagina TEM que conter: o fixado no acompanhamento; senao o destino final
 // (link curto ja resolvido no celular), desde que seja um link valido do Mercado Livre.
 let target=pin?.normalizedUrl||b.link;
 if(!pin&&b.finalUrl){try{m.normalizeMercadoLivreLink(b.finalUrl,{allowCatalogOnly:true});if(m.isMercadoLivreShortLink(b.link)||!safeNormalize(m,b.link))target=b.finalUrl;}catch{}}
 try{
  const reading=m.extractMercadoLivreHtml(b.html,target,{expectedSellerId,allowCatalogWinner});
  return {ok:true,reading:{...reading,observedAt:new Date().toISOString(),fetchedFrom:'device'}};
 }catch(e){
  const code=e&&e.code||'READER_ERROR',pol=m.ERROR_POLICY[code]||{};
  // Motivo exato junto (texto do proprio conversor: nomes de chaves e regras, nunca conteudo da pagina).
  const why=e&&typeof e.message==='string'?String(e.message).slice(0,400):'';
  return {ok:false,code,message:(pol.msg||'Nao consegui ler o preco desta pagina. Preco anterior preservado.')+(why?' ['+why+']':''),keepLastPrice:true,retryable:!!pol.retryable,needsUserAction:!!pol.userAction};
 }
}
function safeNormalize(m,link){try{m.normalizeMercadoLivreLink(link,{allowCatalogOnly:true});return true;}catch{return false;}}
function makeMercadoLivreReader({workspace,stores=null,fetchImpl=globalThis.fetch,minIntervalMs=2500,maxPending=8,timeoutMs=15000}={}){
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
  if(Object.keys(b).some(k=>!['link','monitorId','expectedSellerId','allowCatalogWinner','html','finalUrl'].includes(k)))return failure('INVALID_INPUT','A consulta aceita somente link e identidade da oferta.');
  // Pagina baixada pelo CELULAR (o Mercado Livre recusa a Railway). So o bloco de dados;
  // a extracao abaixo e a mesma, estrita, do caminho do servidor.
  if(b.html!==undefined&&(typeof b.html!=='string'||!b.html||b.html.length>MAX_DEVICE_HTML))return failure('INVALID_INPUT','Pagina enviada pelo celular invalida.');
  if(b.finalUrl!==undefined&&(typeof b.finalUrl!=='string'||b.finalUrl.length>8192))return failure('INVALID_INPUT','Endereco final invalido.');
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
    const allowCatalogWinner=!b.monitorId&&b.allowCatalogWinner===true,expectedSellerId=pin?.sellerId||b.expectedSellerId;
    // 1) API oficial, quando a conta do Mercado Livre esta conectada: sem navegador, sem
    //    verificacao. Precisa saber QUAL anuncio: o fixado no acompanhamento ou o do link.
    //    2) pagina baixada pelo celular. 3) servidor busca a pagina (reserva).
    const apiRead=stores&&stores.mlConnected()?await fromApi(m,stores,b,pin,{expectedSellerId}):null;
    const r=apiRead||(b.html!==undefined?fromDevice(m,b,pin,{expectedSellerId,allowCatalogWinner})
     :await m.readMercadoLivre(pin?.normalizedUrl||b.link,{fetchImpl,timeoutMs,maxBytes:3_000_000,maxRedirects:4,signal,expectedSellerId,allowCatalogWinner}));
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
