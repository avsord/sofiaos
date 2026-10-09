'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v102: hover do sino abre imediatamente e usa dados em cache antes da atualização',()=>{
  const app=read('public/app.js');
  assert.match(app,/startNotificationsButton\.addEventListener\('mouseenter'/);
  assert.match(app,/const serial=\+\+notificationsOpenSerial,cached=Array\.isArray\(state\.homePanorama\?\.notifications\)/);
  assert.match(app,/renderNotificationsPopover\(cached\);notificationsDialog\.hidden=false/);
  assert.match(app,/Você não tem notificações\./);
});

test('v102: preview mantém atalho para todas as notificações',()=>{
  const app=read('public/app.js');
  assert.match(app,/btn\('Ver todas',[\s\S]*'notifications-mini-link'/);
  assert.match(app,/Abrir a central completa de notificações/);
  assert.match(app,/await setTab\('notifications'\)/);
});

test('v102: central completa separa por área e também por origem',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/const bySource=new Map\(\)/);
  assert.match(app,/notifications-source-group/);
  assert.match(app,/notifications-source-head/);
  assert.match(css,/\.notifications-source-group\{/);
  assert.match(css,/\.notifications-source-head\{/);
});

test('v102: identidade e cache estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);
  assert.match(html,/Sofia OS · v103/);
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/Core v103 · AVSORD Technology/);
  assert.equal(pkg.version,'1.53.0');
});
