'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v65: exclusão rápida fica do lado direito e Estudos continua sem exclusão rápida',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(css,/\.quick-delete-card\{position:relative;padding-right:48px\}/);
  assert.match(css,/\.quick-delete\{position:absolute;right:13px;left:auto/);
  assert.match(app,/quickAllowed=group!=='study'&&state\.catalog\[e\.kind\]\?\.group!=='study'/);
  assert.match(app,/row\.append\(btn\(r\.text,r\.open,'dashboard-link'\)\);if\(r\.record&&key!=='study'\)row\.append\(quickDeleteButton/);
});

test('v65+: feedback comum é local e barra global fica reservada a erro real',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/function notify\(text,error=false\)[\s\S]*if\(!error\)/);
  assert.match(app,/notice error/);
  assert.match(css,/main>#notice\.notice:not\(\.error\)\{display:none!important\}/);
});

test('v65: Listas e Biblioteca são menus fixos sem botão para ocultar módulo',()=>{
  const html=read('public/index.html'),app=read('public/app.js');
  assert.match(html,/id="navWidgetLists"[\s\S]*data-tab="lists"/);
  assert.match(html,/id="navWidgetLibrary"[\s\S]*data-tab="library"/);
  assert.doesNotMatch(html,/data-hide-nav-widget=/);
  assert.doesNotMatch(app,/function hideUserNavWidget/);
  assert.doesNotMatch(app,/Barra lateral · Listas|Barra lateral · Biblioteca/);
  assert.match(app,/Listas e Biblioteca continuam fixos no menu/);
});

test('v65: personalização acontece dentro de Listas e Biblioteca',t=>{
  const f=fixture(t,{privateMode:false});
  const s=f.store.updateSettings({listViews:['purchase','market'],libraryViews:['recipe','film']});
  assert.deepEqual(s.listViews,['purchase','market']);
  assert.deepEqual(s.libraryViews,['recipe','film']);
  const app=read('public/app.js');
  assert.match(app,/function manageListViews/);assert.match(app,/Listas padrão visíveis/);
  assert.match(app,/function manageLibraryViews/);assert.match(app,/Categorias padrão da Biblioteca/);
  assert.match(app,/Gerenciar listas/);assert.match(app,/Gerenciar categorias/);
});

test('v65: itens de Comprar podem ser arrastados para grupos reais',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/function movePurchaseToGroup/);
  assert.match(app,/function makePurchaseDropTarget/);
  assert.match(app,/c\.draggable=true/);
  assert.match(app,/dragstart/);assert.match(app,/dragover/);assert.match(app,/drop/);
  assert.match(app,/purchase_group_id:groupId\|\|''/);
  assert.match(css,/\.purchase-draggable/);assert.match(css,/\.purchase-group-controls button\.drop-target/);
});

test('v65: editor de Comprar aceita nome de grupo digitado e mantém edição in-place',()=>{
  const app=read('public/app.js');
  assert.match(app,/name:'purchase_group_name'/);
  assert.match(app,/Escolha um grupo existente ou escreva um novo/);
  assert.match(app,/suggestions:purchaseGroups\.map\(g=>g\.title\)/);
  assert.match(app,/if\(!found\)found=await api\('\/api\/entities'/);
  assert.match(app,/method:entity\?'PATCH':'POST'/);
});

test('v65+: regras da v65 continuam publicadas em versões seguintes',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  const m=cfg.match(/VERSION = '(\d+)\.0\.0'/);assert.ok(m);assert.ok(Number(m[1])>=65);
  assert.match(html,/Sofia OS · v\d+/);assert.match(html,/style\.css\?v=\d+/);assert.match(html,/app\.js\?v=\d+/);assert.match(html,/Core v\d+/);assert.match(pkg.description,/Sofia OS/);
});
