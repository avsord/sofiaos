'use strict';
// Provedor Anthropic (Claude Fable 5.1, Opus, Sonnet...) com a MESMA interface do
// provedor OpenAI: respond() e structured(). A escolha é pelo nome do modelo
// (começa com "claude"); a chave vai no mesmo lugar das chaves de rota
// (sk-ant-...). Saída estruturada = ferramenta obrigatória com o schema do
// plano, o que garante JSON válido sem texto em volta.
const {AppError}=require('../core/util');
const {httpsFetch}=require('./http-client');
const ENDPOINT='https://api.anthropic.com/v1/messages';
const VERSION='2023-06-01';

/** Converte o "input" no formato da Responses API (OpenAI) para mensagens Anthropic. */
function toMessages(input){
 const messages=[];const push=(role,blocks)=>{if(!blocks.length)return;const last=messages[messages.length-1];if(last&&last.role===role)last.content.push(...blocks);else messages.push({role,content:blocks});};
 for(const item of Array.isArray(input)?input:[]){
  const role=item.role==='assistant'?'assistant':'user';
  const blocks=[];
  if(typeof item.content==='string'){if(item.content.trim())blocks.push({type:'text',text:item.content});}
  else for(const part of Array.isArray(item.content)?item.content:[]){
   if(part?.type==='input_text'&&typeof part.text==='string'&&part.text.trim())blocks.push({type:'text',text:part.text});
   else if(part?.type==='output_text'&&typeof part.text==='string'&&part.text.trim())blocks.push({type:'text',text:part.text});
   else if(part?.type==='input_image'&&typeof part.image_url==='string'){
    const m=/^data:([^;]+);base64,(.+)$/.exec(part.image_url);
    blocks.push(m?{type:'image',source:{type:'base64',media_type:m[1],data:m[2]}}:{type:'image',source:{type:'url',url:part.image_url}});
   }
  }
  push(role,blocks);
 }
 if(!messages.length||messages[0].role!=='user')messages.unshift({role:'user',content:[{type:'text',text:'(continuação)'}]});
 return messages;
}
function safeUsage(data){const u=data?.usage;return Number.isSafeInteger(u?.input_tokens)&&Number.isSafeInteger(u?.output_tokens)?{input_tokens:u.input_tokens,output_tokens:u.output_tokens}:null;}
function textOf(data){return (Array.isArray(data?.content)?data.content:[]).filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n').trim();}

class AnthropicProvider{
 constructor(config,fetchImpl=null){this.config=config;this.fetch=fetchImpl||httpsFetch;}
 checkKey(){const key=this.config.apiKey;if(!key)throw new AppError('NO_API_KEY','A chave não está carregada. Use o reparador de chave existente, sem colá-la no chat.',503);if(!/^sk-ant-[A-Za-z0-9_-]{16,}$/.test(key))throw new AppError('BAD_API_KEY_FORMAT','O modelo configurado é da Anthropic (Claude), mas a chave carregada não é uma chave Anthropic (sk-ant-...). Nenhuma credencial foi enviada.',503);return key;}
 async call(body,signal){
  const key=this.checkKey();const timeout=AbortSignal.timeout(this.config.apiTimeoutMs);let response;
  try{
   response=await this.fetch(ENDPOINT,{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout,
    headers:{'x-api-key':key,'anthropic-version':VERSION,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
  }catch(e){
   if(signal?.aborted)throw new AppError('CANCELLED','A chamada foi interrompida. A mensagem continua salva.',503);
   if(timeout.aborted)throw new AppError('API_TIMEOUT','A Anthropic não respondeu no prazo. Não repeti a chamada automaticamente.',504);
   const err=new AppError('API_CONNECTION','Falha de conexão com a Anthropic. A mensagem foi preservada; tente novamente.',502);err.causeCode=e?.code||e?.cause?.code||'';throw err;
  }
  let data;try{data=await response.json();}catch{throw new AppError('API_INVALID_RESPONSE','O provedor devolveu uma resposta inválida. Não fiz nova tentativa.',502);}
  const requestId=response.headers?.get('request-id')||null;
  if(!response.ok){
   const detail=String(data?.error?.message||'').slice(0,160);
   const [code,message]=({401:['API_AUTH','A Anthropic não aceitou a credencial carregada. Não coloque a chave no chat.'],403:['API_FORBIDDEN','A chave não tem acesso a esta operação.'],404:['API_MODEL_NOT_FOUND','O modelo configurado ('+this.config.model+') não está disponível para esta chave. Não troquei de modelo automaticamente.'],429:['API_QUOTA','A Anthropic informou limite de uso ou saldo. Confira o painel; não gere outra chave só por isso.']})[response.status]||['API_HTTP','A Anthropic respondeu com erro HTTP '+response.status+(detail?': '+detail:'')+'. A solicitação não foi repetida.'];
   const error=new AppError(code,message,response.status===429?429:502);error.requestId=requestId;throw error;
  }
  return {data,requestId};
 }
 async respond({instructions,input,maxOutputTokens,signal}){
  const {data,requestId}=await this.call({model:this.config.model,max_tokens:Math.max(256,Number(maxOutputTokens)||1024),system:String(instructions||''),messages:toMessages(input)},signal);
  const usage=safeUsage(data),reply=textOf(data);
  if(!reply){const e=new AppError('API_EMPTY','A API não devolveu texto utilizável. Não repeti a chamada.',502);e.usage=usage;throw e;}
  return {reply,usage,requestId,incomplete:data.stop_reason==='max_tokens'};
 }
 async structured({instructions,input,schema,name='structured_output',maxOutputTokens,signal}){
  if(!schema||typeof schema!=='object')throw new AppError('BAD_SCHEMA','Esquema estruturado inválido.');
  const tool={name,description:'Devolva o plano estruturado exatamente neste formato.',input_schema:schema};
  const {data,requestId}=await this.call({model:this.config.model,max_tokens:Math.max(512,Number(maxOutputTokens)||2000),system:String(instructions||''),messages:toMessages(input),tools:[tool],tool_choice:{type:'tool',name}},signal);
  const usage=safeUsage(data);
  if(data.stop_reason==='max_tokens'){const e=new AppError('API_STRUCTURED_INCOMPLETE','A interpretação da Sofia ficou incompleta antes de terminar. Nenhuma ação foi executada.',502);e.usage=usage;e.requestId=requestId;e.incompleteReason='max_output_tokens';throw e;}
  const use=(Array.isArray(data?.content)?data.content:[]).find(b=>b?.type==='tool_use'&&b.name===name);
  if(!use||!use.input||typeof use.input!=='object'){const e=new AppError('API_STRUCTURED_PARSE','A API respondeu sem a estrutura esperada. Nenhuma ação foi executada.',502);e.usage=usage;e.requestId=requestId;throw e;}
  return {data:use.input,reply:JSON.stringify(use.input),usage,requestId,incomplete:false};
 }
}
function isAnthropicModel(model){return /^claude/i.test(String(model||'').trim());}
module.exports={AnthropicProvider,isAnthropicModel,toMessages};
