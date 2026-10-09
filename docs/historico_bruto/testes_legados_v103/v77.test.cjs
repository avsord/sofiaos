const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v77: ficam somente os dois templates solicitados',()=>{
  const A=read('public/app.js');
  const segment=A.slice(A.indexOf('const PAGE_TEMPLATES=['),A.indexOf('function templateBlocks'));
  assert.match(segment,/id:'ideas_database'/);
  assert.match(segment,/id:'tasks_board'/);
  for(const old of ['blank','links_database','inventory_database','content','crm','research','purchases'])assert.doesNotMatch(segment,new RegExp("id:'"+old+"'"));
  assert.match(segment,/Todas as anotações/);
  assert.match(segment,/Por curso/);
  assert.match(segment,/Literatura 455/);
  assert.match(segment,/Lista simples/);
  assert.match(segment,/Visualização em quadro/);
  assert.match(segment,/Não iniciada/);
  assert.match(segment,/Prioridade/);
});

test('v77: database dos templates é customizável',()=>{
  const A=read('public/app.js');
  assert.match(A,/function editCollectionProperty/);
  assert.match(A,/function addCollectionView/);
  assert.match(A,/function editCollectionView/);
  assert.match(A,/function configureCollection/);
  assert.match(A,/Excluir esta propriedade/);
  assert.match(A,/Excluir esta visualização/);
});

test('v77: widgets do resumo usam drag estável e atualização parcial',()=>{
  const A=read('public/app.js'),C=read('public/style.css');
  assert.match(A,/function lockHomeWidgetDrag/);
  assert.match(A,/function keepHomeWidgetDragScroll/);
  assert.match(A,/function refreshHomeWidgets/);
  assert.match(A,/after=from<to/);
  assert.match(C,/#tab-start\.widget-reordering/);
  assert.match(C,/\.home-widget\.drag-before/);
  assert.match(C,/\.home-widget\.drag-after/);
});

test('v77: lateral e botão enviar seguem os últimos ajustes',()=>{
  const H=read('public/index.html'),C=read('public/style.css');
  assert.match(H,/(?:CENTRAL DE APLICATIVOS|CENTRAL|APPS)/);
  assert.doesNotMatch(H,/APLICATIVOS DA SOFIA/);
  assert.match(C,/\.mode-user #userPagesNav \.space-tree-button\{/);
  assert.match(C,/\.send-button:disabled\{[\s\S]*?color:#fff!important/);
});

test('v77+: versão pública e pacote permanecem alinhados',()=>{
  const H=read('public/index.html'),cfg=read('src/config/sofia.js'),pkg=JSON.parse(read('package.json'));
  const version=cfg.match(/VERSION = '(\d+)\.0\.0'/),title=H.match(/Sofia OS · v(\d+)/),css=H.match(/style\.css\?v=(\d+)/),js=H.match(/app\.js\?v=(\d+)/),core=H.match(/Core v(\d+)/);
  for(const x of [version,title,css,js,core])assert.ok(Number(x?.[1])>=77);
  assert.ok(Number(pkg.version.split('.')[1])>=28);
});
