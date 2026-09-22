'use strict';
const fs=require('node:fs'),path=require('node:path');
const {AppError,atomicWrite}=require('../core/util');
const {httpsFetch}=require('./http-client');
const MODELS_ENDPOINT='https://api.openai.com/v1/models';
const USAGE_ENDPOINT='https://api.openai.com/v1/organization/usage/completions';

function normalize(route,value){
  if(!['private','shared','admin'].includes(route))throw new AppError('BAD_ROUTE','Destino inválido.');
  if(typeof value!=='string'||!/^sk-[A-Za-z0-9_-]{16,}$/.test(value.trim()))throw new AppError('BAD_KEY','Cole somente a chave completa, sem quebras de linha. Ela não foi salva.');
  return value.trim();
}
function persist(config,route,key){
  const varName=route==='private'?'OPENAI_PRIVATE_API_KEY':route==='shared'?'OPENAI_SHARED_API_KEY':'OPENAI_ADMIN_KEY',file=path.join(config.root,'.env');
  let text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  if(text.length>1024*1024)throw new AppError('BAD_ENV','Arquivo de configuração inesperado.');
  const lines=text.split(/\r?\n/).filter(l=>!new RegExp('^\\s*'+varName+'\\s*=').test(l));
  lines.push(varName+'='+key);
  atomicWrite(file,Buffer.from(lines.join('\n').replace(/\n{3,}/g,'\n\n')+'\n'));
  if(route==='private')config.privateApiKey=key;else if(route==='shared')config.sharedApiKey=key;else config.adminApiKey=key;
}
function saveCredential(config,route,value){
  const key=normalize(route,value);persist(config,route,key);
  return {saved:true,route,validated:false,notice:route==='admin'?'Chave Admin guardada somente no .env local.':'Chave guardada somente no .env local. A política de compartilhamento do projeto deve ser confirmada manualmente na OpenAI.'};
}
function validationUrl(route){
  if(route!=='admin')return MODELS_ENDPOINT;
  const start=Math.floor(Date.now()/1000)-86400,url=new URL(USAGE_ENDPOINT);url.searchParams.set('start_time',String(start));url.searchParams.set('end_time',String(Math.floor(Date.now()/1000)+1));url.searchParams.set('bucket_width','1d');url.searchParams.set('limit','1');return url.toString();
}
async function validateCredential(value,fetchImpl=null,timeoutMs=15000,route='private'){
  const key=typeof value==='string'?value.trim():'';
  if(!/^sk-[A-Za-z0-9_-]{16,}$/.test(key))throw new AppError('BAD_KEY','Cole somente a chave completa, sem quebras de linha. Ela não foi salva.');
  if(!['private','shared','admin'].includes(route))throw new AppError('BAD_ROUTE','Destino inválido.');
  let response;
  try{
    const signal=AbortSignal.timeout(timeoutMs);
    response=await (fetchImpl||httpsFetch)(validationUrl(route),{method:'GET',redirect:'error',signal,headers:{Authorization:'Bearer '+key,Accept:'application/json'}});
  }catch(error){
    throw new AppError('KEY_TEST_NETWORK','Não foi possível validar a chave agora. Nenhuma alteração foi salva. Verifique sua conexão e tente novamente.',503,{cause:error?.message||''});
  }
  if(response.status===401)throw new AppError('KEY_REJECTED','A OpenAI recusou esta chave. Nenhuma alteração foi salva.',401);
  if(response.status===403)throw new AppError('KEY_PERMISSION',route==='admin'?'A chave existe, mas não tem acesso ao Usage da organização. Use uma chave Admin da organização da OpenAI Platform.':'A chave existe, mas não tem permissão suficiente para o teste de projeto. Use uma chave com permissão All durante a configuração.',403);
  if(!response.ok)throw new AppError('KEY_TEST_FAILED','Não foi possível validar a chave agora (HTTP '+response.status+'). Nenhuma alteração foi salva.',503);
  return {ok:true,status:response.status};
}
async function saveCredentialValidated(config,route,value,fetchImpl=null){
  const key=normalize(route,value);
  await validateCredential(key,fetchImpl,config.apiTimeoutMs?Math.min(config.apiTimeoutMs,20000):15000,route);
  persist(config,route,key);
  return {saved:true,validated:true,route,notice:route==='admin'?'Chave Admin validada no Usage da OpenAI e salva no .env local.':'Chave validada pela OpenAI e salva no .env local. Nenhuma mensagem pessoal foi enviada durante este teste.'};
}
module.exports={saveCredential,validateCredential,saveCredentialValidated};
