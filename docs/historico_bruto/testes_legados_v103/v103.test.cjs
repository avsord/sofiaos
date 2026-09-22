'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v103: listener do sino é ligado cedo e aceita pointerenter e mouseenter',()=>{
  const app=read('public/app.js');
  const bind=app.indexOf('function bindStartNotificationsHover()');
  const widgets=app.indexOf('async function loadStart()');
  assert.ok(bind>=0&&widgets>=0&&bind<widgets);
  assert.match(app,/bell\.addEventListener\('pointerenter',openHover\)/);
  assert.match(app,/bell\.addEventListener\('mouseenter',openHover\)/);
  assert.match(app,/bindStartNotificationsHover\(\);/);
});

test('v103: Início e Resumo têm o mesmo tamanho de texto dos menus de Apps',()=>{
  const css=read('public/style.css');
  assert.match(css,/\.mode-user #primaryUserNav \.nav>\.nav-label\{[\s\S]*font-size:13\.5px!important/);
  assert.match(css,/\.mode-user #appsMenu \.nav>\.nav-label[\s\S]*font-size:13\.5px!important/);
});

test('v103: identidade e cache estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);
  assert.match(html,/Sofia OS · v103/);
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/Core v103 · AVSORD Technology/);
  assert.equal(pkg.version,'1.53.0');
});
