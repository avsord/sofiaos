'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v91: versão pública, Core e package estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);assert.match(html,/Sofia OS · v103/);assert.match(html,/style\.css\?v=103/);assert.match(html,/app\.js\?v=103/);assert.match(html,/Core v103/);assert.equal(pkg.version,'1.53.0');
});

test('v91/v93: ações foram devolvidas ao cabeçalho rolável da userpage',()=>{
  const html=read('public/index.html');
  const floating=html.indexOf('<div id="userPageFloatingActions"');
  const userStart=html.indexOf('<section id="tab-userpage"'),userClose=html.indexOf('</section>',userStart);
  assert.ok(userStart>=0&&userClose>userStart&&floating>userStart&&floating<userClose);
});

test('v91/v93: regra final não prende mais a barra à viewport',()=>{
  const css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v93'));
  assert.match(block,/#tab-userpage > \.user-page-header > #userPageFloatingActions\.user-page-floating-actions\{[\s\S]*position:absolute!important;/);
  assert.doesNotMatch(block,/position:fixed!important/);
});

test('v91/v93: runtime repara o parent para o cabeçalho e força absolute',()=>{
  const app=read('public/app.js');
  assert.match(app,/function ensureUserPageActionsViewportLayer\(\)/);
  assert.match(app,/pageActions\.parentElement!==header\)header\.append\(pageActions\)/);
  assert.match(app,/pageActions\.style\.setProperty\('position','absolute','important'\)/);
  assert.match(app,/const pageActions=ensureUserPageActionsViewportLayer\(\);if\(pageActions\)pageActions\.hidden=name!=='userpage'/);
});

test('v91: mobile mantém barra fixa em 8 px',()=>{
  const css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v91'));
  assert.match(block,/@media\(max-width:760px\)\{[\s\S]*body > \.user-page-floating-actions\{[\s\S]*top:8px!important;[\s\S]*right:8px!important/);
});
