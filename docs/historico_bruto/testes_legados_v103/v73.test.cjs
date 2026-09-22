const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture,base,blankAction}=require('./helpers.cjs');
const {UsageService}=require('../src/services/usage');
const root=path.resolve(__dirname,'..');const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v73: esclarecimento da Sofia não herda card preto no tema claro',()=>{
  const C=read('public/style.css');
  assert.match(C,/\.home-clarification\{[\s\S]*?background:var\(--panel\)!important;[\s\S]*?color:var\(--text\)!important/);
  assert.match(C,/:root\[data-theme="light"\] \.home-clarification\{[\s\S]*?background:#fff!important/);
});

test('v73: cabeçalho dos widgets do Resumo fica sticky durante scroll interno',()=>{
  const C=read('public/style.css');
  assert.match(C,/\.home-widget-head\{[\s\S]*?position:sticky;[\s\S]*?top:0;[\s\S]*?z-index:4/);
});

test('v73: Uso da Sofia alterna Compartilhado e Privado e mantém marcador de alerta separado do preenchimento',()=>{
  const A=read('public/app.js'),C=read('public/style.css');
  assert.match(A,/usage-filter-tabs/);assert.match(A,/Compartilhado/);assert.match(A,/Privado/);
  assert.match(A,/usage-alert-marker/);assert.match(A,/marker\.style\.left=alertPct\+'%'/);
  assert.match(A,/fill\.style\.width=visiblePct\+'%'/);assert.match(A,/usage-bar-spectrum/);assert.match(A,/usage-bar-remainder/);
  assert.match(C,/\.usage-alert-marker\{/);
});

test('v73: total compartilhado é fixo e alerta percentual não altera uso nem total',t=>{
  const f=fixture(t);f.store.updateSettings({sharedIncentiveDailyTokens:100000,sharedUsageAlertPercent:90});
  const stamp=new Date().toISOString();
  f.store.db.prepare('INSERT INTO route_reservations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('v73-shared',null,'shared','gpt-test','settled',0,0,0,0,35000,0,stamp);
  const service=new UsageService(f.store,f.config,f.core.routing);const before=service.sharedLocalStatus();
  assert.equal(before.total_limit,100000);assert.equal(before.used,35000);assert.equal(Math.round(before.usage_percent),35);assert.equal(before.alert_at,90000);
  const plan=base('set_usage_alert',{explicit_action:true,ready_for_backend:true,action:{...blankAction(),token_limit:70,privacy_route:'shared'}});
  const result=f.core.execute({id:'u1',content:'alerta 70%'},plan,'shared');const after=service.sharedLocalStatus();
  assert.equal(result.details.usage_alert_percent,70);assert.equal(after.total_limit,100000);assert.equal(after.used,35000);assert.equal(Math.round(after.usage_percent),35);assert.equal(after.alert_at,70000);
});

test('v73+: Privado respeita total financeiro configurado e alerta percentual independente',t=>{
  const f=fixture(t);const stamp=new Date().toISOString();
  f.store.updateSettings({privateUsageTotalUSD:10,privateUsageAlertPercent:90});
  f.store.db.prepare('INSERT INTO route_reservations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('v73-private',null,'private','gpt-test','settled',0,0,0,350000,1000,500,stamp);
  const service=new UsageService(f.store,f.config,f.core.routing);const before=service.privateLocalStatus();
  assert.equal(before.total_limit_usd,10);assert.equal(before.used_usd,0.35);assert.equal(before.usage_percent,3.4999999999999996);assert.equal(before.alert_at_usd,9);
  const plan=base('set_usage_alert',{explicit_action:true,ready_for_backend:true,action:{...blankAction(),token_limit:80,privacy_route:'private'}});
  const result=f.core.execute({id:'u2',content:'alerta privado 80%'},plan,'private');const after=service.privateLocalStatus();
  assert.equal(result.details.usage_filter,'private');assert.equal(after.alert_percent_config,80);assert.equal(after.total_limit_usd,10);assert.equal(after.alert_at_usd,8);assert.equal(after.used_usd,0.35);
});

test('v73: endpoint de uso expõe os dois filtros e regras de linguagem natural conhecem percentuais',async t=>{
  const f=fixture(t);const service=new UsageService(f.store,f.config,f.core.routing);const status=await service.status();
  assert.ok(status.filters.shared);assert.ok(status.filters.private);assert.equal(status.filters.private.total_limit_usd,5);
  const I=read('src/services/intent-engine.js');assert.match(I,/privacy_route=shared/);assert.match(I,/privacy_route=private/);assert.match(I,/70%\/90%/);
});


test('v73: versão pública, Core e assets usam v73',()=>{
  const cfg=read('src/config/sofia.js'),H=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  const version=cfg.match(/VERSION = '(\d+)\.0\.0'/),title=H.match(/Sofia OS · v(\d+)/),css=H.match(/style\.css\?v=(\d+)/),js=H.match(/app\.js\?v=(\d+)/),core=H.match(/Core v(\d+)/);for(const x of [version,title,css,js,core])assert.ok(Number(x?.[1])>=73);assert.ok(Number(pkg.version.split('.')[1])>=24);
});
