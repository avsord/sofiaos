'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {UsageService}=require('../src/services/usage');
const {saveCredentialValidated}=require('../src/services/credentials');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v86: versão pública, Core e package estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);assert.match(html,/Sofia OS · v103/);assert.match(html,/style\.css\?v=103/);assert.match(html,/app\.js\?v=103/);assert.match(html,/Core v103/);assert.equal(pkg.version,'1.53.0');
});

test('v86/v93: ações continuam exclusivas da página e agora pertencem ao cabeçalho rolável',()=>{
  const html=read('public/index.html'),css=read('public/style.css'),app=read('public/app.js');
  const start=html.indexOf('<section id="tab-userpage"'),close=html.indexOf('</section>',start),floating=html.indexOf('id="userPageFloatingActions"');
  assert.ok(start>=0&&close>start&&floating>start&&floating<close,'ações precisam estar no cabeçalho do section rolável');
  assert.match(css,/#tab-userpage > \.user-page-header > #userPageFloatingActions\.user-page-floating-actions\{[\s\S]*position:absolute!important/);
  assert.match(app,/pageActions\.hidden=name!==['"]userpage['"]/);
});

test('v86: árvore Particular não herda o selected global que quebrava Enjoy the Void',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/const row=el\('div','space-tree-node'\)/);
  assert.doesNotMatch(app,/space-tree-node'\+\(state\.selectedUserPage/);
  assert.match(css,/\.space-tree-node\.selected\{[\s\S]*background:transparent!important/);
  assert.match(css,/grid-template-columns:28px minmax\(0,1fr\) 28px!important/);
  assert.match(css,/\.space-tree-button\.active\{[\s\S]*background:color-mix/);
});

test('v86: selecionar foto não altera layout, não mostra legenda vazia e drag só começa após movimento',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(css,/\.image-context-toolbar\{[\s\S]*position:absolute!important/);
  assert.match(css,/grid-template-columns:max-content max-content!important/);
  assert.match(css,/\.resizable-image-block figcaption:empty\{display:none!important\}/);
  assert.match(css,/\.image-resize-handle\{transition:none!important\}/);
  assert.match(app,/if\(!dragging&&Math\.abs\(delta\)<5\)return/);
  assert.match(app,/if\(!dragging\)\{dragging=true;figure\.classList\.add\('moving'\)/);
});

test('v86: Usage Admin sincroniza Privado e Compartilhado com organization usage',async()=>{
  const settings={sharedDailyTokenCap:250000,sharedIncentiveDailyTokens:2500000,sharedUsageAlertPercent:90,sharedModel:'shared-model',privateUsageTotalUSD:5,privateUsageAlertPercent:90,privateModel:'private-model',privateInputPerMillion:0,privateOutputPerMillion:0};
  const store={settings:()=>settings};
  const routing={usage:route=>route==='private'?{month_utc:'2026-09',monthly_microusd:0,input_tokens_month:9,output_tokens_month:1,tokens_actual_month:10,calls_month:1,tokens_pending_month:0}:{day_utc:'2026-09-21',tokens_actual_today:3,input_tokens_today:2,output_tokens_today:1,calls_today:1,tokens_pending_estimate:0}};
  const calls=[];
  const fetchMock=async url=>{const u=String(url);calls.push(u);if(u.includes('/organization/costs'))return {ok:true,status:200,async json(){return {data:[{results:[{amount:{value:.54,currency:'usd'},project_id:'proj-private',line_item:'Responses'}]}],has_more:false,next_page:null};}};return {ok:true,status:200,async json(){return {data:[{results:[{service_tier:'default',model:'gpt-x',project_id:'proj-private',input_tokens:43000,output_tokens:800,num_model_requests:120},{service_tier:'data_sharing_incentive_tier',model:'gpt-x',project_id:'proj-shared',input_tokens:5000,output_tokens:200,num_model_requests:15}]}]};}};};
  const service=new UsageService(store,{adminApiKey:'sk-admin-'+'A'.repeat(32),model:'private-model'},routing,fetchMock);
  const result=await service.status();
  assert.equal(result.filters.private.source,'organization');assert.equal(result.filters.private.total_tokens,43800);assert.equal(result.filters.private.requests,120);assert.equal(result.filters.private.used_usd,.54);assert.equal(result.filters.private.cost_source,'organization-costs');
  assert.equal(result.filters.shared.source,'organization');assert.equal(result.filters.shared.total_tokens,5200);assert.equal(result.filters.shared.requests,15);
  assert.ok(calls.some(url=>/\/organization\/usage\/completions/.test(url)&&/group_by=service_tier/.test(url)&&/group_by=project_id/.test(url)));assert.ok(calls.some(url=>/\/organization\/costs/.test(url)&&/project_ids=proj-private/.test(url)));
});

test('v86: chave Admin pode ser validada e salva separadamente',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-v86-admin-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const config={root:dir,apiTimeoutMs:1000,adminApiKey:'',privateApiKey:'',sharedApiKey:''};let seen='';
  const fetchMock=async url=>{seen=String(url);return {ok:true,status:200};};
  const key='sk-admin-'+'B'.repeat(32),out=await saveCredentialValidated(config,'admin',key,fetchMock);
  assert.equal(out.validated,true);assert.equal(config.adminApiKey,key);assert.match(seen,/\/organization\/usage\/completions/);assert.match(fs.readFileSync(path.join(dir,'.env'),'utf8'),/OPENAI_ADMIN_KEY=sk-admin-/);
});

test('v86: interface explica quando os tokens são locais ou sincronizados',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),routing=read('src/services/routing.js');
  assert.match(html,/value="admin">Uso da OpenAI · chave Admin da organização/);
  assert.match(app,/Tokens(?: e gasto)? sincronizados com a OpenAI/);assert.match(app,/Tokens(?: e gasto)? somente desta instalação/);
  assert.match(app,/Usage Admin:/);assert.match(routing,/admin_key_present:Boolean\(this\.config\.adminApiKey\)/);
});
