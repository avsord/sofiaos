const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Store}=require('../src/memory/store');
const {fixture}=require('./helpers.cjs');
const {UsageService}=require('../src/services/usage');
const root=path.resolve(__dirname,'..');const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v78: Privado usa US$ 5 como crédito total padrão',t=>{
  const f=fixture(t);const settings=f.store.settings();assert.equal(settings.privateUsageTotalUSD,5);
  const service=new UsageService(f.store,f.config,f.core.routing);const status=service.privateLocalStatus();assert.equal(status.total_limit_usd,5);
});

test('v78: migra apenas o default antigo de US$ 10 para US$ 5 e preserva total escolhido pelo usuário',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-v78-'));const file=path.join(dir,'data','sofia.sqlite');
  let store=new Store(file);store.db.prepare("UPDATE settings SET value=? WHERE key='privateUsageTotalUSD'").run(JSON.stringify(10));store.db.prepare("DELETE FROM settings WHERE key='privateUsageTotalUserSet'").run();store.close();
  store=new Store(file);assert.equal(store.settings().privateUsageTotalUSD,5);store.updateSettings({privateUsageTotalUSD:7});store.close();
  store=new Store(file);assert.equal(store.settings().privateUsageTotalUSD,7);assert.equal(store.settings().privateUsageTotalUserSet,true);store.close();fs.rmSync(dir,{recursive:true,force:true});
});

test('v78: medidor usa gradiente integral, barra não achatada e marcador independente',()=>{
  const A=read('public/app.js'),C=read('public/style.css');
  assert.match(A,/usage-bar-spectrum/);assert.match(A,/usage-bar-remainder/);assert.match(A,/usage-current-marker/);
  assert.match(C,/\.usage-bar\{[\s\S]*?width:100%!important;[\s\S]*?height:16px!important/);
  assert.match(C,/\.usage-bar-spectrum\{[\s\S]*?#259653 0%[\s\S]*?#d9554b 100%/);
  assert.match(C,/\.usage-bar-remainder\{/);assert.doesNotMatch(A,/backgroundSize=\(10000\/visiblePct\)/);
});

test('v78: pedido do Privado força filtro privado e exibe o card visual',()=>{
  const A=read('public/app.js');
  assert.match(A,/preferredFilter:\['shared','private'\]\.includes\(r\?\.details\?\.usage_filter\)\?r\.details\.usage_filter:''/);
  assert.match(A,/maybeSwitchVisibleUsageFilter/);assert.match(A,/\['privado','private','filtro privado'\]/);
  assert.match(A,/refreshUsageStatus\(\{show:true,preferredFilter:filter\}\)/);
});

test('v78: continuam existindo somente os dois templates solicitados',()=>{
  const A=read('public/app.js');const segment=A.slice(A.indexOf('const PAGE_TEMPLATES=['),A.indexOf('function templateBlocks'));
  assert.equal((segment.match(/id:'ideas_database'/g)||[]).length,1);assert.equal((segment.match(/id:'tasks_board'/g)||[]).length,1);
  for(const oldId of ['blank','links_database','inventory_database','content','crm','research','purchases'])assert.doesNotMatch(segment,new RegExp("id:'"+oldId+"'"));
});

test('v78: versão pública e pacote estão alinhados',()=>{
  const H=read('public/index.html'),cfg=read('src/config/sofia.js'),pkg=JSON.parse(read('package.json'));
  const m=cfg.match(/VERSION = '(\d+)\.0\.0'/),h=H.match(/Sofia OS · v(\d+)/),css=H.match(/style\.css\?v=(\d+)/),js=H.match(/app\.js\?v=(\d+)/),core=H.match(/Core v(\d+)/);for(const x of [m,h,css,js,core])assert.ok(Number(x?.[1])>=78);assert.ok(Number(pkg.version.split('.')[1])>=29);
});
