'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {UsageService}=require('../src/services/usage');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v87: versão pública, Core e package estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);assert.match(html,/Sofia OS · v103/);assert.match(html,/style\.css\?v=103/);assert.match(html,/app\.js\?v=103/);assert.match(html,/Core v103/);assert.equal(pkg.version,'1.53.0');
});

test('v87/v89: ações de página ficam ancoradas ao main no lugar original à direita',()=>{
  const css=read('public/style.css');const start=css.lastIndexOf('/* Sofia OS v89'),end=css.lastIndexOf('/* Sofia OS v90');const block=css.slice(start,end);
  assert.match(block,/\.user-page-floating-actions\{[\s\S]*position:absolute!important;[\s\S]*top:22px!important;[\s\S]*right:22px!important;[\s\S]*left:auto!important;[\s\S]*transform:none!important/);
});

test('v87: PARTICULAR recebe o mesmo bloco visual de APPS',()=>{
  const css=read('public/style.css');
  assert.match(css,/Sofia OS v87[\s\S]*#appsMenu \+ \.conversation-heading\{[\s\S]*min-height:40px!important;[\s\S]*border-radius:12px!important;[\s\S]*background:color-mix/);
  assert.match(css,/#appsMenu \+ \.conversation-heading #addUserPage\{[\s\S]*justify-self:end!important/);
});

test('v87: toolbar da imagem é uma linha flutuante abaixo da foto',()=>{
  const css=read('public/style.css');
  assert.match(css,/Sofia OS v87[\s\S]*\.image-context-toolbar\{[\s\S]*top:calc\(100% \+ 7px\)!important;[\s\S]*flex-wrap:nowrap!important/);
  assert.match(css,/\.resizable-image-block\.selected \.image-context-toolbar\{display:flex!important\}/);
});

test('v87: alternar Privado não remonta o chat',()=>{
  const app=read('public/app.js');
  assert.match(app,/refreshUsageStatus\(\{show:true,render:false,preferredFilter:key\}\);renderUsageStatus\(\{fallback:false\}\)/);
  const start=app.indexOf("b.onclick=async()=>{state.homeUsageFilter=key"),end=app.indexOf(';tabs.append(b)',start),handler=app.slice(start,end);
  assert.ok(start>=0);assert.doesNotMatch(handler,/renderHomeThread\(/);assert.doesNotMatch(handler,/renderMiniSofia\(/);
  assert.match(app,/function renderUsageStatus\(\{fallback=true\}=\{\}\)[\s\S]*replaceUsageCardPreservingScroll\(\$\('homeChatResult'\)\)/);
});

test('v87: Privado usa Costs oficial e limita por project_id quando possível',async()=>{
  const settings={sharedDailyTokenCap:250000,sharedIncentiveDailyTokens:2500000,sharedUsageAlertPercent:90,sharedModel:'shared',privateUsageTotalUSD:5,privateUsageAlertPercent:90,privateModel:'private',privateInputPerMillion:0,privateOutputPerMillion:0};
  const store={settings:()=>settings};
  const routing={usage:route=>route==='private'?{month_utc:'2026-09',monthly_microusd:0,input_tokens_month:0,output_tokens_month:0,tokens_actual_month:0,calls_month:0,tokens_pending_month:0}:{day_utc:'2026-09-21',tokens_actual_today:0,input_tokens_today:0,output_tokens_today:0,calls_today:0,tokens_pending_estimate:0}};
  const calls=[];const fetchMock=async url=>{const u=String(url);calls.push(u);if(u.includes('/organization/costs'))return {ok:true,async json(){return {data:[{results:[{amount:{value:.53,currency:'usd'},project_id:'proj-private',line_item:'Responses'}]}],has_more:false};}};return {ok:true,async json(){return {data:[{results:[{service_tier:'default',model:'gpt-5.6-terra',project_id:'proj-private',input_tokens:28110,output_tokens:500,num_model_requests:50},{service_tier:'data_sharing_incentive_tier',model:'gpt-5.6-luna',project_id:'proj-shared',input_tokens:15292,output_tokens:300,num_model_requests:20}]}]};}};};
  const service=new UsageService(store,{adminApiKey:'sk-admin-test',model:'private'},routing,fetchMock),status=await service.status();
  assert.equal(status.filters.private.used_usd,.53);assert.equal(status.filters.private.remaining_usd,4.47);assert.equal(status.filters.private.cost_source,'organization-costs');assert.deepEqual(status.filters.private.project_ids,['proj-private']);assert.ok(calls.some(x=>x.includes('/organization/costs')&&x.includes('project_ids=proj-private')));
});

test('v87: sino abre popover rolável e mantém acesso à página geral por área/app',()=>{
  const app=read('public/app.js'),css=read('public/style.css'),html=read('public/index.html');
  assert.match(html,/id="startNotifications"[^>]*aria-haspopup="dialog"[^>]*aria-controls="notificationsDialog"/);
  assert.match(app,/Você não tem notificações\./);assert.match(app,/btn\('Ver todas',[\s\S]*'notifications-mini-link'/);assert.match(app,/Notificações detalhadas desta área/);assert.match(app,/Abrir detalhe/);
  assert.match(css,/\.notifications-mini-list\{[\s\S]*overflow-y:auto!important/);
});
