'use strict';
const {AppError,id,now}=require('../core/util');
const {OpenAIProvider}=require('./openai');
class RoutingService {
 constructor(store,config,providerFactory){this.store=store;this.config=config;this.factory=providerFactory||((c)=>new OpenAIProvider(c));}
 profile(route){const s=this.store.settings();if(!['private','shared'].includes(route))throw new AppError('BAD_ROUTE','Rota inválida.');
   const privateRoute=route==='private';
   if(!s.routingEnabled)throw new AppError('ROUTING_SETUP','A inteligência ainda não foi conectada aos filtros. Abra Configuração no modo desenvolvedor.',409);
   const key=(privateRoute?this.config.privateApiKey:this.config.sharedApiKey)||(s.legacyRoute===route?this.config.apiKey:'');
   if(!key)throw new AppError('ROUTE_KEY_MISSING',privateRoute?'Esta mensagem precisa do Filtro Privado, mas a chave privada ainda não foi configurada. A mensagem não foi enviada ao Filtro Compartilhado.':'O Filtro Compartilhado ainda não tem uma chave configurada.',409);
   if(!s[route+'Confirmed'])throw new AppError('PROJECT_NOT_CONFIRMED',privateRoute?'Confirme no modo desenvolvedor que o projeto privado está configurado para o tratamento de dados desejado.':'Confirme o projeto de tráfego compartilhado no modo desenvolvedor.',409);
   if(!privateRoute&&!s.sharedBillingAcknowledged)throw new AppError('BILLING_ACK','Confirme no modo desenvolvedor que benefícios/cobrança do projeto compartilhado foram revisados.',409);
   const other=(privateRoute?this.config.sharedApiKey:this.config.privateApiKey)||(s.legacyRoute===(privateRoute?'shared':'private')?this.config.apiKey:'');
   if(other&&other===key)throw new AppError('SAME_PROJECT_KEY','As rotas estão usando a mesma chave. Separe os projetos; a Sofia não consegue verificar a política de dados pela chave.',409);
   const model=s[route+'Model']||(route==='shared'?'gpt-5.6-terra':this.config.model);
   const inputRate=s[route+'InputPerMillion'],outputRate=s[route+'OutputPerMillion'];
   const priced=inputRate>0&&outputRate>0&&s[route+'DailyUSD']>0&&s[route+'MonthlyUSD']>0;
   return {route,key,model,inputRate,outputRate,daily:s[route+'DailyUSD'],monthly:s[route+'MonthlyUSD'],priced,settings:s};
 }
 usage(route){
   const stamp=now(),day=stamp.slice(0,10),month=stamp.slice(0,7);
   const rows=this.store.db.prepare('SELECT * FROM route_reservations WHERE route=? AND created_at LIKE ?').all(route,month+'%');
   const costTotal=r=>r.reduce((a,x)=>a+(x.status==='settled'?x.charged_microusd:x.reserved_microusd),0);
   const todayRows=rows.filter(x=>x.created_at.startsWith(day)),settledToday=todayRows.filter(x=>x.status==='settled'),settledMonth=rows.filter(x=>x.status==='settled');
   const sumTokens=(items,key)=>items.reduce((a,x)=>a+Number(x[key]||0),0);
   const inputToday=sumTokens(settledToday,'input_tokens'),outputToday=sumTokens(settledToday,'output_tokens');
   const inputMonth=sumTokens(settledMonth,'input_tokens'),outputMonth=sumTokens(settledMonth,'output_tokens');
   const pendingToday=todayRows.filter(x=>x.status==='reserved'||x.status==='uncertain').reduce((a,x)=>a+Number(x.input_bound||0)+Number(x.output_bound||0),0);
   const pendingMonth=rows.filter(x=>x.status==='reserved'||x.status==='uncertain').reduce((a,x)=>a+Number(x.input_bound||0)+Number(x.output_bound||0),0);
   return {route,day_utc:day,month_utc:month,daily_microusd:costTotal(todayRows),monthly_microusd:costTotal(rows),calls_today:todayRows.length,calls_month:rows.length,
     input_tokens_today:inputToday,output_tokens_today:outputToday,tokens_actual_today:inputToday+outputToday,tokens_pending_estimate:pendingToday,tokens_reserved_today:inputToday+outputToday+pendingToday,
     input_tokens_month:inputMonth,output_tokens_month:outputMonth,tokens_actual_month:inputMonth+outputMonth,tokens_pending_month:pendingMonth,tokens_reserved_month:inputMonth+outputMonth+pendingMonth,
     uncertain:todayRows.filter(x=>x.status==='uncertain'||x.status==='reserved').length,uncertain_month:rows.filter(x=>x.status==='uncertain'||x.status==='reserved').length};
 }
 reserve(profile,request,attemptId){const output=request.maxOutputTokens;
   // Conservative UTF-8 byte estimate plus envelope allowance. Not an official tokenizer or billing meter.
   const input=Buffer.byteLength(JSON.stringify({instructions:request.instructions,input:request.input}),'utf8')+2048;
   const reserve=profile.priced?Math.ceil(input*profile.inputRate+output*profile.outputRate):0,s=profile.settings;
   return this.store.tx(()=>{const u=this.usage(profile.route);if(profile.priced&&(u.daily_microusd+reserve>Math.floor(profile.daily*1e6)||u.monthly_microusd+reserve>Math.floor(profile.monthly*1e6)))throw new AppError('LOCAL_BUDGET_LIMIT','O teto financeiro local configurado para esta rota foi atingido. A chamada não foi enviada.',429);
     // v69: contadores de chamadas e tokens são alertas transparentes, nunca bloqueios locais.
     const key=id();this.store.db.prepare('INSERT INTO route_reservations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(key,attemptId||null,profile.route,profile.model,'reserved',input,output,reserve,0,null,null,now());return key;
   });
 }
 settle(key,result,profile){const u=result?.usage;if(u&&Number.isSafeInteger(u.input_tokens)&&Number.isSafeInteger(u.output_tokens)){const cost=profile.priced?Math.ceil(u.input_tokens*profile.inputRate+u.output_tokens*profile.outputRate):0;this.store.db.prepare("UPDATE route_reservations SET status='settled',charged_microusd=?,input_tokens=?,output_tokens=? WHERE id=?").run(cost,u.input_tokens,u.output_tokens,key);}else this.store.db.prepare("UPDATE route_reservations SET status='uncertain' WHERE id=?").run(key);}
 async respond(route,request,attemptId){const profile=this.profile(route),key=this.reserve(profile,request,attemptId);try{const provider=this.factory({...this.config,apiKey:profile.key,model:profile.model});const result=await provider.respond(request);this.settle(key,result,profile);return {...result,route,model:profile.model};}catch(e){this.settle(key,e,profile);throw e;}}
 async respondStructured(route,request,attemptId){const profile=this.profile(route),key=this.reserve(profile,request,attemptId);try{const provider=this.factory({...this.config,apiKey:profile.key,model:profile.model});if(typeof provider.structured!=='function')throw new AppError('STRUCTURED_UNAVAILABLE','O provedor configurado não oferece interpretação estruturada nesta instalação.',503);const result=await provider.structured(request);this.settle(key,result,profile);return {...result,route,model:profile.model};}catch(e){this.settle(key,e,profile);throw e;}}
 log(messageId,route,reason){this.store.db.prepare('INSERT INTO routing_log VALUES(?,?,?,?,?)').run(id(),messageId||null,route,reason,now());}
 status(){const s=this.store.settings();const privateKey=Boolean(this.config.privateApiKey||(s.legacyRoute==='private'&&this.config.apiKey)),sharedKey=Boolean(this.config.sharedApiKey||(s.legacyRoute==='shared'&&this.config.apiKey));return {private_key_present:privateKey,shared_key_present:sharedKey,admin_key_present:Boolean(this.config.adminApiKey),legacy_key_present:Boolean(this.config.apiKey),private_ready:Boolean(privateKey&&s.privateConfirmed&&s.routingEnabled),shared_ready:Boolean(sharedKey&&s.sharedConfirmed&&s.sharedBillingAcknowledged&&s.routingEnabled),usage:[this.usage('private'),this.usage('shared')],notice:'Tokens e chamadas locais são apenas alertas na v69; não bloqueiam a conversa. Tetos financeiros em USD continuam sendo proteções explícitas quando configurados.'};}
}
module.exports={RoutingService};
