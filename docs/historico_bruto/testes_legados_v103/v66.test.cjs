'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v66: tema global possui Sistema/Claro/Escuro e modo claro segue linguagem visual clara tipo Notion',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),css=read('public/style.css');
  assert.match(html,/id="themePreference"/);assert.match(html,/value="system">Sistema/);assert.match(html,/value="light">Claro/);assert.match(html,/value="dark">Escuro/);
  assert.match(html,/prefers-color-scheme: dark/);assert.match(app,/localStorage\.getItem\('sofiaTheme'\)/);assert.match(app,/systemThemeMedia/);
  assert.match(css,/:root\[data-theme="light"\][\s\S]*--bg:#fff[\s\S]*--surface-soft:#f7f7f5[\s\S]*--text:#37352f[\s\S]*--line:#e9e9e7[\s\S]*--accent:#2383e2/);
  assert.match(css,/:root\[data-theme="light"\] \.sidebar/);assert.match(css,/:root\[data-theme="light"\] \.settings-card/);assert.match(css,/:root\[data-theme="light"\] \.data-card/);
});

test('v66: ícones da sidebar usam uma única coluna alinhada',()=>{
  const css=read('public/style.css');
  assert.match(css,/\.nav\{[^}]*grid-template-columns:minmax\(0,1fr\) 24px/);
  assert.match(css,/\.nav>span\{[^}]*width:24px[^}]*text-align:center/);
});

test('v66: exclusão de página é recursiva para subpáginas, preservando páginas externas',t=>{
  const f=fixture(t);
  const parent=f.core.workspace.save({kind:'user_page',title:'Pai',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes',parent_id:'',node_type:'space',blocks_json:'[]'}});
  const child=f.core.workspace.save({kind:'user_page',title:'Filha',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes',parent_id:parent.id,node_type:'page',blocks_json:'[]'}});
  const grand=f.core.workspace.save({kind:'user_page',title:'Neta',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes',parent_id:child.id,node_type:'page',blocks_json:'[]'}});
  const other=f.core.workspace.save({kind:'user_page',title:'Outra',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes',parent_id:'',node_type:'space',blocks_json:'[]'}});
  const result=f.core.workspace.deleteEntity(parent.id);
  assert.equal(result.deleted_total,3);assert.deepEqual(new Set(result.deleted_ids),new Set([parent.id,child.id,grand.id]));
  assert.equal(f.core.workspace.get(other.id).title,'Outra');
  for(const id of [parent.id,child.id,grand.id])assert.throws(()=>f.core.workspace.get(id),e=>e.code==='NOT_FOUND');
});

test('v66: breadcrumb da página é clicável em todos os níveis',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),css=read('public/style.css');
  assert.match(html,/id="userPageBreadcrumb"/);assert.match(app,/function renderUserPageBreadcrumb/);assert.match(app,/breadcrumb-link/);assert.match(app,/state\.selectedUserPage=node;setTab\('userpage'\)/);assert.match(css,/\.page-breadcrumb/);
});

test('v66+: templates atuais usam coleção real, tabela e quadro customizáveis',()=>{
  const app=read('public/app.js');
  for(const id of ['ideas_database','tasks_board'])assert.match(app,new RegExp("id:'"+id+"'"));
  assert.match(app,/type:'board'/);assert.match(app,/type:'table'/);assert.match(app,/group_by:'status'/);
  assert.match(app,/function renderCollectionBlock/);assert.match(app,/function renderCollectionBoard/);assert.match(app,/function renderCollectionTable/);
  assert.match(app,/function editCollectionProperty/);assert.match(app,/function addCollectionView/);assert.match(app,/function editCollectionView/);
});

test('v66: Ctrl+Z desfaz e Ctrl+Y/Ctrl+Shift+Z refaz alterações de página',()=>{
  const app=read('public/app.js');
  assert.match(app,/function undoUserPage/);assert.match(app,/function redoUserPage/);assert.match(app,/state\.userPageHistory/);assert.match(app,/state\.userPageRedo/);
  assert.match(app,/const key=e\.key\.toLowerCase\(\)/);assert.match(app,/key==='z'/);assert.match(app,/key==='y'/);assert.match(app,/undoUserPage\(\)/);assert.match(app,/redoUserPage\(\)/);
});

test('v66: mini Sofia aparece fora do Início e envia contexto da página para a mesma conversa',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),core=read('src/core/sofia-core.js');
  assert.match(html,/id="miniSofiaButton"/);assert.match(html,/id="miniSofiaPanel"/);assert.match(html,/id="miniSofiaContext"/);
  assert.match(app,/function miniContextPayload/);assert.match(app,/surface:'user_page'/);assert.match(app,/uiContext:miniContextPayload\(\)/);assert.match(app,/state\.currentTab!=='start'/);
  assert.match(core,/input\.ui_context/);assert.match(core,/CONTEXTO ATUAL DA INTERFACE DA SOFIA/);assert.match(core,/esta página/);
});

test('v66: instrução semântica permite editar a página atual sem criar duplicata',()=>{
  const engine=read('src/services/intent-engine.js');
  assert.match(engine,/CONTEXTO ATUAL DA INTERFACE/);assert.match(engine,/user_page/);assert.match(engine,/update_record/);assert.match(engine,/append_page_block/);assert.match(engine,/edit_page_block/);assert.match(engine,/delete_page_block/);assert.match(engine,/NÃO use create_user_page para adicionar conteúdo/i);assert.match(engine,/nunca crie uma página duplicada|NUNCA crie outro registro/i);
});

test('v66: versão pública continua posterior à v66 e assets usam o mesmo major',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  const version=cfg.match(/VERSION = '(\d+)\.0\.0'/),title=html.match(/Sofia OS · v(\d+)/),css=html.match(/style\.css\?v=(\d+)/),js=html.match(/app\.js\?v=(\d+)/),core=html.match(/Core v(\d+)/);
  assert.ok(version&&Number(version[1])>=66);for(const m of [title,css,js,core])assert.equal(Number(m?.[1]),Number(version[1]));
  assert.ok(Number(pkg.version.split('.')[1])>=17);
});
