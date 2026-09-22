'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Store}=require('../src/memory/store');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v82: itens de todos os widgets do Resumo têm altura normal e não esticam',()=>{
  const css=read('public/style.css');
  assert.match(css,/\.home-widget>\.widget-list\{display:flex!important;flex-direction:column!important/);
  assert.match(css,/\.home-widget \.widget-row \.dashboard-link\{[\s\S]*min-height:42px!important;[\s\S]*max-height:76px!important/);
});

test('v82: Notificações tem mini janela rolável e página completa agrupada por área',()=>{
  const app=read('public/app.js'),html=read('public/index.html'),css=read('public/style.css');
  assert.match(html,/id="tab-notifications"/);assert.match(html,/id="notificationsPageContent"/);
  assert.match(app,/async function openNoticesDialog\(\)/);assert.match(app,/async function loadNotificationsPage\(\)/);
  assert.match(app,/groups=new Map\(\)/);assert.match(app,/notificationArea\(n\)/);
  assert.match(css,/\.notifications-mini-list\{[\s\S]*overflow-y:auto/);assert.match(css,/\.notifications-page-content/);
});

test('v82: notificações carregam área da entidade quando disponível',()=>{
  const workspace=read('src/core/workspace.js');
  assert.match(workspace,/LEFT JOIN entities e ON e\.id=n\.entity_id/);
  assert.match(workspace,/COALESCE\(e\.area,'Geral'\) AS area/);
});

test('v82: tarefa guarda descrição, local, cor e notificações e restaura no backup',()=>{
  const s=new Store(':memory:');
  try{
    const t=s.saveTask({title:'Tarefa completa',area:'Casa',description:'Descrição longa',location:'Escritório',color:'green',notifications:['30 minutos antes','1 dia antes']});
    assert.equal(t.description,'Descrição longa');assert.equal(t.location,'Escritório');assert.equal(t.color,'green');assert.deepEqual(t.notifications,['30 minutos antes','1 dia antes']);
    const snap=s.export();assert.equal(snap.schema,6);assert.ok(Array.isArray(snap.tables.task_details));
    const s2=new Store(':memory:');try{s2.importSnapshot(snap);assert.equal(s2.tasks()[0].location,'Escritório');assert.deepEqual(s2.tasks()[0].notifications,['30 minutos antes','1 dia antes']);}finally{s2.close();}
  }finally{s.close();}
});

test('v82: área da tarefa sugere áreas existentes e permite criar nova',()=>{
  const app=read('public/app.js'),api=read('src/core/api45.js');
  assert.match(app,/name:'area'[\s\S]*suggestions:state\.areas/);
  assert.match(app,/state\.areas\.push\(area\)/);
  assert.match(api,/SELECT area FROM tasks[\s\S]*UNION SELECT area FROM entities/);
});

test('v82: foco não usa stroke azul e labels do editor permanecem legíveis',()=>{
  const css=read('public/style.css');
  assert.match(css,/button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible[\s\S]*outline:none!important/);
  assert.match(css,/#editorDialog label[\s\S]*color:var\(--text\)!important/);
});

test('v82+: versão pública, Core e package permanecem alinhados a partir da v82',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  const version=cfg.match(/VERSION = '(\d+)\.0\.0'/),title=html.match(/Sofia OS · v(\d+)/),css=html.match(/style\.css\?v=(\d+)/),js=html.match(/app\.js\?v=(\d+)/),core=html.match(/Core v(\d+)/);for(const x of [version,title,css,js,core])assert.ok(Number(x?.[1])>=82);assert.ok(Number(pkg.version.split('.')[1])>=33);
});
