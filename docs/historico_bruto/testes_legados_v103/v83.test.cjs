'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v83: pergunta de esclarecimento permanece legível no tema claro',()=>{
  const css=read('public/style.css');
  assert.match(css,/\.clarification-question\{color:var\(--text\)!important;opacity:1!important\}/);
  assert.match(css,/:root\[data-theme="light"\] \.clarification-question\{color:#37352f!important\}/);
});

test('v83: turno e cliente têm timeout para impedir loading eterno',()=>{
  const runtime=read('src/config/runtime.js'),core=read('src/core/sofia-core.js'),app=read('public/app.js');
  assert.match(runtime,/turnTimeoutMs:\s*120000/);
  assert.match(core,/TURN_TIMEOUT/);
  assert.match(app,/timeoutMs:125000/);
  assert.match(app,/state\.homeThinking=false/);
});

test('v83: Resumo devolve roda para a página principal ao rolar para cima',()=>{
  const app=read('public/app.js');
  assert.match(app,/addEventListener\('wheel',cancelStartScrollAnimation/);
  assert.match(app,/e\.deltaY<0&&panel\.scrollTop>0&&summary\.contains\(e\.target\)/);
  assert.match(app,/panel\.scrollTop=Math\.max\(0,panel\.scrollTop\+e\.deltaY\)/);
});

test('v83: APPS usa espaçamento uniforme e Notificações mantém mini janela e página por área',()=>{
  const css=read('public/style.css'),app=read('public/app.js'),html=read('public/index.html');
  assert.match(css,/\.mode-user #appsMenuToggle\{margin:4px 0 4px!important\}/);
  assert.match(html,/id="tab-notifications"/);
  assert.match(app,/async function openNoticesDialog\(/);
  assert.match(app,/async function loadNotificationsPage\(\)/);
});

test('v83: ícone da página tem hitbox própria e controles ficam fixos',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/notion-page-icon-row/);
  assert.match(css,/\.notion-page-icon-row \.notion-page-icon\{[\s\S]*width:64px!important/);
  assert.match(css,/\.user-page-header \.header-actions\{[\s\S]*position:fixed!important/);
});

test('v83: título e campos de nomes próprios não usam spellcheck/autocorreção',()=>{
  const app=read('public/app.js');
  assert.match(app,/title\.spellcheck=false/);
  assert.match(app,/input\.spellcheck=false/);
  assert.match(app,/autocorrect','off/);
});

test('v83: correções permanecem presentes após a atualização',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);assert.match(html,/Sofia OS · v103/);assert.match(html,/style\.css\?v=103/);assert.match(html,/app\.js\?v=103/);assert.match(html,/Core v103/);assert.equal(pkg.version,'1.53.0');
});
