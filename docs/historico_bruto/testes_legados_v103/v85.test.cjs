'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Store}=require('../src/memory/store');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v85: versão pública, Core e package estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);assert.match(html,/Sofia OS · v103/);assert.match(html,/style\.css\?v=103/);assert.match(html,/app\.js\?v=103/);assert.match(html,/Core v103/);assert.equal(pkg.version,'1.53.0');
});

test('v85: imagem perde alças ao deselecionar e tem edição, link e comentário contextual',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/function clearImageSelection\(\)/);assert.match(app,/Editar imagem/);assert.match(app,/Adicionar link/);assert.match(app,/Adicionar comentário/);assert.match(app,/image_comment/);assert.match(app,/e\.key!==['"]Escape['"]/);
  assert.match(css,/\.resizable-image-block:not\(\.selected\) figcaption:empty/);assert.match(css,/\.resizable-image-block\.selected \.image-resize-handle/);assert.match(css,/\.resizable-image-block\.selected \.image-context-toolbar/);assert.match(css,/\.resizable-image-block\.selected \.image-context-comment:not\(\.empty-comment\)/);
});

test('v85: chat principal está centralizado e X rápido é um único controle visual',()=>{
  const css=read('public/style.css');
  assert.match(css,/\.mode-user #tab-start \.home-chat\{[\s\S]*margin-left:auto!important;[\s\S]*margin-right:auto!important/);
  assert.match(css,/\.quick-delete\{[\s\S]*border:0!important;[\s\S]*background:transparent!important/);
});

test('v85: sino abre primeiro e depois carrega; vazio e acesso a todas as notificações permanecem',()=>{
  const app=read('public/app.js');const start=app.indexOf('async function openNoticesDialog()'),end=app.indexOf('function closeNotificationsOnOutsidePointer',start),fn=app.slice(start,end);
  assert.ok(start>=0);assert.ok(fn.indexOf('notificationsDialog.hidden=false')>=0);assert.ok(fn.indexOf("await api('/api/notifications?refresh='+Date.now())")>=0);assert.ok(fn.indexOf('notificationsDialog.hidden=false')<fn.indexOf("await api('/api/notifications?refresh='+Date.now())"));
  assert.match(app,/Você não tem notificações\./);assert.match(app,/btn\('Ver todas',[\s\S]*'notifications-mini-link'/);assert.match(app,/groups=new Map\(\)/);
});

test('v85: Kanban segue status Notion e template de páginas abre itens como página/modal',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  for(const status of ['Não iniciada','Prioridade','Concluído'])assert.match(app,new RegExp(status));
  assert.match(app,/collection-status-chip/);assert.match(app,/＋ Nova página/);assert.match(css,/status-priority/);assert.match(css,/status-done/);
  assert.match(app,/id:'pages_directory'/);assert.match(app,/Guidance/);assert.match(app,/Pinned Notes/);assert.match(app,/Recently Added/);assert.match(app,/Recently Updated/);assert.match(app,/function openCollectionPage/);assert.match(css,/\.collection-page-dialog/);
});

test('v85: aplicar template preserva ícone e modo default volta para documento em branco',()=>{
  const app=read('public/app.js');
  assert.match(app,/O ícone\/emoticon atual da página é sempre preservado/);assert.doesNotMatch(app,/updateSelectedPageVisual\(\{icon:t\.icon/);
  assert.match(app,/const DEFAULT_PAGE_ICON='📄'/);assert.match(app,/btn\('Modo default'/);assert.match(app,/Voltar ao modo default/);assert.match(app,/state\.userPageBlocks=\[newPageBlock\('text'\)\]/);assert.match(app,/cover_type:DEFAULT_PAGE_COVER_TYPE/);
});

test('v85: cada página tem + para subpágina e árvore expandível/recolhível',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/space-tree-add/);assert.match(app,/Criar subpágina em/);assert.match(app,/space-tree-expander/);assert.match(app,/Recolher subpáginas/);assert.match(app,/Expandir subpáginas/);assert.match(app,/notion-subpages/);
  assert.match(css,/\.space-tree-controls/);assert.match(css,/\.space-tree-add/);
});

test('v85: Agenda fica acima de Tarefas e recebe tarefas datadas com labels e prioridades',()=>{
  const html=read('public/index.html'),app=read('public/app.js');const menu=html.slice(html.indexOf('id="appsMenu"'),html.indexOf('id="navWidgetLists"'));
  assert.ok(menu.indexOf('>Agenda<')>=0&&menu.indexOf('>Tarefas<')>=0&&menu.indexOf('>Agenda<')<menu.indexOf('>Tarefas<'));
  assert.match(app,/filter\(x=>x\.due_at\)/);assert.match(app,/Tarefa > /);assert.match(app,/agenda-task-origin/);assert.match(app,/Importante/);assert.match(app,/Médio/);assert.match(app,/Leve/);
});

test('v85: prioridade de tarefa persiste em três níveis e continua no backup',()=>{
  const s=new Store(':memory:');try{const t=s.saveTask({title:'Teste agenda',due_at:'2026-09-22T12:00:00Z',priority_level:'medium'});assert.equal(t.priority_level,'medium');assert.equal(t.priority,1);const snap=s.export();assert.equal(snap.schema,6);const s2=new Store(':memory:');try{s2.importSnapshot(snap);assert.equal(s2.tasks()[0].priority_level,'medium');assert.equal(s2.db.prepare('PRAGMA user_version').get().user_version,7);}finally{s2.close();}}finally{s.close();}
});
