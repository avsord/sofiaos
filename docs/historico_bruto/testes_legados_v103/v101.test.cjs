'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v101: sino abre preview no hover e fecha com tolerância ao sair',()=>{
  const app=read('public/app.js');
  assert.match(app,/startNotificationsButton\.addEventListener\('mouseenter'/);
  assert.match(app,/openNoticesDialogAt\(e\.currentTarget,\{trigger:'hover'\}\)/);
  assert.match(app,/scheduleNotificationsHoverClose/);
});

test('v101: preview tem estado vazio centralizado e atalho para central completa',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/Você não tem notificações\./);
  assert.match(app,/btn\('Ver todas',[\s\S]*'notifications-mini-link'/);
  assert.match(css,/\.notifications-mini-head-actions\{/);
  assert.match(css,/\.notifications-empty-state\{min-height:118px!important/);
});

test('v101: página completa agrupa notificações por área e mantém detalhes',()=>{
  const app=read('public/app.js'),html=read('public/index.html');
  assert.match(html,/id="tab-notifications"/);
  assert.match(app,/const area=notificationArea\(n\);if\(!groups\.has\(area\)\)/);
  assert.match(app,/Notificações detalhadas desta área/);
  assert.match(app,/Origem: /);
  assert.match(app,/Categoria: /);
  assert.match(app,/Importância: /);
});

test('v101: identidade e cache estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);
  assert.match(html,/Sofia OS · v103/);
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/Core v103 · AVSORD Technology/);
  assert.equal(pkg.version,'1.53.0');
});
