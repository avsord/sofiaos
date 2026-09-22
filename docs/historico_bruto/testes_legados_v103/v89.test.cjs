'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v89: versão pública, Core e package estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);assert.match(html,/Sofia OS · v103/);assert.match(html,/style\.css\?v=103/);assert.match(html,/app\.js\?v=103/);assert.match(html,/Core v103/);assert.equal(pkg.version,'1.53.0');
});

test('v89/v93: regra histórica existe, mas a estrutura atual mantém ações no cabeçalho',()=>{
  const html=read('public/index.html'),css=read('public/style.css'),start=css.lastIndexOf('/* Sofia OS v89'),end=css.lastIndexOf('/* Sofia OS v90');const block=css.slice(start,end);
  assert.match(html,/<section id=\"tab-userpage\"[\s\S]*<header class=\"page-header user-page-header\">[\s\S]*<div id=\"userPageFloatingActions\" class=\"user-page-floating-actions\"/);
  assert.match(block,/\.user-page-floating-actions\{[\s\S]*position:absolute!important;[\s\S]*top:22px!important;[\s\S]*right:22px!important/);
});

test('v89: PARTICULAR reutiliza a mesma estrutura visual de APPS',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v89'));
  assert.match(html,/id="particularMenuToggle" class="sidebar-section-toggle particular-section-toggle"/);
  assert.match(html,/<span class="sidebar-section-title">PARTICULAR<\/span>/);
  assert.match(block,/#appsMenuToggle,[\s\S]*#particularMenuToggle\{[\s\S]*width:100%!important;[\s\S]*min-height:40px!important;[\s\S]*padding:8px 12px!important;[\s\S]*border-radius:12px!important/);
  assert.match(app,/nav-icon space-tree-page-icon/);assert.match(app,/nav-label space-tree-page-title/);
  assert.match(block,/#appsMenu \.nav,[\s\S]*#userPagesNav \.space-tree-button\{[\s\S]*padding:8px 12px!important;[\s\S]*grid-template-columns:24px minmax\(0,1fr\)!important/);
});

test('v89: preview do sino abre por hover e usa painel estável sem dialog nativo',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/const notificationsDialog=el\('aside','notifications-mini-dialog'\)/);
  assert.match(app,/notificationsDialog\.hidden=true/);assert.match(app,/startNotificationsButton\.addEventListener\('mouseenter'/);assert.match(app,/startNotificationsButton\.addEventListener\('mouseleave'/);
  assert.match(app,/notificationsDialog\.addEventListener\('mouseenter',cancelNotificationsHoverClose\)/);assert.match(app,/notificationsDialog\.addEventListener\('mouseleave'/);
  assert.match(app,/Você não tem notificações\./);assert.match(app,/btn\('Ver todas',[\s\S]*'notifications-mini-link'/);
  assert.match(css,/\.notifications-mini-dialog\{[\s\S]*position:fixed!important;[\s\S]*background:var\(--panel\)!important/);
  assert.match(css,/\.notifications-mini-list\{[\s\S]*overflow-y:auto!important/);
});

test('v89: página completa de notificações mantém overview por origem e área',()=>{
  const app=read('public/app.js'),html=read('public/index.html');
  assert.match(html,/Todas as notificações organizadas por área e origem\./);assert.match(app,/Notificações detalhadas desta área/);assert.match(app,/Origem: /);assert.match(app,/const area=notificationArea\(n\)/);assert.match(app,/Categoria: /);assert.match(app,/Importância: /);
});
