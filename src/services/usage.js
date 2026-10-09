'use strict';
const {now}=require('../core/util');

class UsageService{
  constructor(store,config,routing,fetchImpl=global.fetch){this.store=store;this.config=config;this.routing=routing;this.fetch=fetchImpl;}
  sharedLocalStatus(){
    const settings=this.store.settings(),shared=this.routing.usage('shared');
    const legacyLimit=Number(settings.sharedDailyTokenCap||250000),total=Number(settings.sharedIncentiveDailyTokens||2500000),used=Number(shared.tokens_actual_today||0);
    const alertPercentConfig=Number(settings.sharedUsageAlertPercent||90),usagePercent=total>0?Math.min(999,used/total*100):0,alertAt=Math.round(total*alertPercentConfig/100);
    const legacyPercent=legacyLimit>0?Math.min(999,used/legacyLimit*100):0;
    return {filter:'shared',unit:'tokens',source:'local',day_utc:shared.day_utc,model:settings.sharedModel||'gpt-5.6-terra',input_tokens:shared.input_tokens_today||0,output_tokens:shared.output_tokens_today||0,total_tokens:used,requests:shared.calls_today||0,pending_estimate:shared.tokens_pending_estimate||0,period:'day',
      total_limit:total,used,remaining:Math.max(0,total-used),usage_percent:usagePercent,alert_percent_config:alertPercentConfig,alert_at:alertAt,alert_reached:usagePercent>=alertPercentConfig,
      // Campos legados preservados para compatibilidade com versões e testes anteriores.
      alert_limit:legacyLimit,alert_remaining:Math.max(0,legacyLimit-used),alert_percent:legacyPercent,incentive_daily_tokens:total,incentive_remaining:Math.max(0,total-used),incentive_percent:usagePercent,resets_at_utc:'00:00',blocking:false};
  }
  localStatus(){return this.sharedLocalStatus();}
  privateLocalStatus(){
    const settings=this.store.settings(),u=this.routing.usage('private');
    const used=Math.max(0,Number(u.monthly_microusd||0)/1e6),total=Math.max(.01,Number(settings.privateUsageTotalUSD||5)),alertPercentConfig=Number(settings.privateUsageAlertPercent||90),usagePercent=total>0?Math.min(999,used/total*100):0;
    const inputTokens=Number(u.input_tokens_month||0),outputTokens=Number(u.output_tokens_month||0),totalTokens=Number(u.tokens_actual_month||0);
    return {filter:'private',unit:'usd',source:'local-estimate',month_utc:u.month_utc,model:settings.privateModel||this.config.model,used_usd:used,used,total_limit_usd:total,total_limit:total,remaining_usd:Math.max(0,total-used),remaining:Math.max(0,total-used),usage_percent:usagePercent,alert_percent_config:alertPercentConfig,alert_at_usd:total*alertPercentConfig/100,alert_at:total*alertPercentConfig/100,alert_reached:usagePercent>=alertPercentConfig,input_tokens:inputTokens,output_tokens:outputTokens,total_tokens:totalTokens,requests:u.calls_month||0,pending_estimate:u.tokens_pending_month||0,period:'month',priced:Boolean(settings.privateInputPerMillion>0&&settings.privateOutputPerMillion>0),blocking:false};
  }
  isSharedTier(value){return /data.?sharing|incentive/i.test(String(value||''));}
  async organizationCompletionTotals({start,end,shared}){
    if(!this.config.adminApiKey)return null;
    const url=new URL('https://api.openai.com/v1/organization/usage/completions');
    url.searchParams.set('start_time',String(start));url.searchParams.set('end_time',String(end));url.searchParams.set('bucket_width','1d');url.searchParams.append('group_by','service_tier');url.searchParams.append('group_by','model');url.searchParams.append('group_by','project_id');url.searchParams.set('limit','31');
    try{
      const res=await this.fetch(url,{headers:{Authorization:'Bearer '+this.config.adminApiKey,'Content-Type':'application/json'},redirect:'error'});if(!res.ok)return null;
      const body=await res.json();let input=0,output=0,requests=0;const details=[],projectIds=new Set();
      for(const bucket of body.data||[])for(const r of bucket.results||[]){const service=String(r.service_tier||''),isShared=this.isSharedTier(service);if(Boolean(shared)!==isShared)continue;const projectId=String(r.project_id||'');const row={service_tier:service,model:r.model||'',project_id:projectId,input_tokens:Number(r.input_tokens||0),output_tokens:Number(r.output_tokens||0),requests:Number(r.num_model_requests||0)};input+=row.input_tokens;output+=row.output_tokens;requests+=row.requests;if(projectId)projectIds.add(projectId);details.push(row);}
      return {input,output,requests,details,project_ids:[...projectIds]};
    }catch{return null;}
  }
  async organizationCostTotals({start,end,projectIds=[]}){
    if(!this.config.adminApiKey)return null;
    const makeUrl=page=>{const url=new URL('https://api.openai.com/v1/organization/costs');url.searchParams.set('start_time',String(start));url.searchParams.set('end_time',String(end));url.searchParams.set('bucket_width','1d');url.searchParams.set('limit','31');url.searchParams.append('group_by','project_id');url.searchParams.append('group_by','line_item');for(const projectId of projectIds)if(projectId)url.searchParams.append('project_ids',projectId);if(page)url.searchParams.set('page',page);return url;};
    try{
      let page='',total=0,guard=0;const details=[];
      do{
        const res=await this.fetch(makeUrl(page),{headers:{Authorization:'Bearer '+this.config.adminApiKey,'Content-Type':'application/json'},redirect:'error'});if(!res.ok)return null;
        const body=await res.json();for(const bucket of body.data||[])for(const r of bucket.results||[]){const currency=String(r.amount?.currency||'usd').toLowerCase();if(currency!=='usd')continue;const value=Math.max(0,Number(r.amount?.value||0));total+=value;details.push({project_id:r.project_id||'',line_item:r.line_item||'',value,currency});}page=body.has_more?String(body.next_page||''):'';
      }while(page&&++guard<10);
      return {total,details,scope:projectIds.length?'projects':'organization',project_ids:projectIds};
    }catch{return null;}
  }
  async organizationSharedStatus(){
    if(!this.config.adminApiKey)return null;
    const start=Math.floor(Date.parse(now().slice(0,10)+'T00:00:00Z')/1000),end=Math.floor(Date.now()/1000)+1,remote=await this.organizationCompletionTotals({start,end,shared:true});if(!remote)return null;
    const local=this.sharedLocalStatus(),used=remote.input+remote.output,total=local.total_limit,usagePercent=total?Math.min(999,used/total*100):0;
    return {...local,source:'organization',token_source:'organization',input_tokens:remote.input,output_tokens:remote.output,total_tokens:used,used,requests:remote.requests,details:remote.details,remaining:Math.max(0,total-used),usage_percent:usagePercent,alert_reached:usagePercent>=local.alert_percent_config,alert_remaining:Math.max(0,local.alert_limit-used),alert_percent:local.alert_limit?Math.min(999,used/local.alert_limit*100):0,incentive_remaining:Math.max(0,total-used),incentive_percent:usagePercent};
  }
  async organizationPrivateStatus(){
    if(!this.config.adminApiKey)return null;
    const stamp=now(),month=stamp.slice(0,7),start=Math.floor(Date.parse(month+'-01T00:00:00Z')/1000),end=Math.floor(Date.now()/1000)+1,remote=await this.organizationCompletionTotals({start,end,shared:false});if(!remote)return null;
    // Usage entrega tokens/requisições. Costs é a fonte financeira reconciliável com o painel.
    // Quando Usage informa project_id, o custo é limitado aos projetos que tiveram tráfego não-Data-Sharing.
    const local=this.privateLocalStatus(),costs=await this.organizationCostTotals({start,end,projectIds:remote.project_ids||[]});
    const usedUsd=costs?Math.max(0,Number(costs.total||0)):local.used_usd,total=Math.max(.01,Number(local.total_limit_usd||local.total_limit||5)),usagePercent=total?Math.min(999,usedUsd/total*100):0;
    return {...local,source:'organization',token_source:'organization',cost_source:costs?'organization-costs':'local-estimate',cost_scope:costs?.scope||'local',input_tokens:remote.input,output_tokens:remote.output,total_tokens:remote.input+remote.output,requests:remote.requests,details:remote.details,cost_details:costs?.details||[],project_ids:remote.project_ids||[],used_usd:usedUsd,used:usedUsd,remaining_usd:Math.max(0,total-usedUsd),remaining:Math.max(0,total-usedUsd),usage_percent:usagePercent,alert_reached:usagePercent>=local.alert_percent_config,pending_estimate:0,sync_scope:'organization-completions+costs'};
  }
  async organizationStatus(){return this.organizationSharedStatus();}
  async status(){
    const [sharedRemote,privateRemote]=await Promise.all([this.organizationSharedStatus(),this.organizationPrivateStatus()]);
    const shared=sharedRemote||this.sharedLocalStatus(),privateUsage=privateRemote||this.privateLocalStatus();
    // O topo continua espelhando o Compartilhado para não quebrar clientes antigos.
    return {...shared,admin_sync:Boolean(this.config.adminApiKey),filters:{shared,private:privateUsage},default_filter:'shared'};
  }
}
module.exports={UsageService};
