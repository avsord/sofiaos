'use strict';
const {AppError}=require('../core/util');
const BAD=()=>{throw new AppError('BAD_SOURCE_IDENTITY','Identidade da loja inválida.');};
const isML=u=>{try{return /(^|\.)mercadoli(vre|bre)\.com(\.br)?$/.test(new URL(u).hostname);}catch{return false;}};
function pins(raw){if(!raw)return {};let v;try{v=typeof raw==='string'?JSON.parse(raw):raw;}catch{BAD();}if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>11)BAD();return v;}
function identity(value){
 if(!value||value.provider!=='mercadolivre'||!/^MLB\d{6,16}$/.test(value.itemId)||!/^\d{1,20}$/.test(String(value.sellerId||'')))BAD();
 if(value.identityKey!=='mercadolivre:'+value.itemId)BAD();
 let u;try{u=new URL(value.normalizedUrl);}catch{BAD();}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!['www.mercadolivre.com.br','mercadolivre.com.br','produto.mercadolivre.com.br'].includes(u.hostname)||u.href.length>1000)BAD();
 if(value.catalogProductId!=null&&!/^MLB\d{6,16}$/.test(value.catalogProductId))BAD();
 const id=value.itemId.replace('MLB','');
 if(!new RegExp('^/MLB-'+id+'(?:-|/|$)').test(u.pathname)&&!Array.from(u.searchParams.values()).some(v=>v===value.itemId||v==='item_id:'+value.itemId))BAD();
 return {provider:'mercadolivre',identityKey:value.identityKey,itemId:value.itemId,catalogProductId:value.catalogProductId||null,sellerId:String(value.sellerId),sellerName:String(value.sellerName||'').slice(0,120),normalizedUrl:u.href,priceBasis:'product_excluding_shipping'};
}
function mergePins(raw, oldRaw, sources){
 const before=pins(oldRaw),supplied=pins(raw),out={};
 for(const key of new Set(sources.filter(Boolean))){
  const old=before[key]?identity(before[key]):null,next=supplied[key]?identity(supplied[key]):old;
  if(!next)continue;if(!isML(key))BAD();
  if(old&&(old.itemId!==next.itemId||old.sellerId!==next.sellerId))throw new AppError('SELLER_MISMATCH','Não troque anúncio/vendedor dentro do mesmo histórico. Adicione outra loja.',409);
  out[key]=next;
 }
 // A removed store may still carry its old pin in a full-entity save.
 // Drop that pin, but reject unrelated identities injected into the request.
 for(const key of Object.keys(supplied))if(!sources.includes(key)&&!Object.hasOwn(before,key))BAD();
 return JSON.stringify(out);
}
module.exports={pins,identity,mergePins,isML};
