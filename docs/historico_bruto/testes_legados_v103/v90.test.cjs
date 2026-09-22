'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v90: versão pública, Core e package estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);assert.match(html,/Sofia OS · v103/);assert.match(html,/style\.css\?v=103/);assert.match(html,/app\.js\?v=103/);assert.match(html,/Core v103/);assert.equal(pkg.version,'1.53.0');
});

test('v90/v93: regra final substitui fixed por absolute no cabeçalho',()=>{
  const css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v93'));
  assert.match(block,/#tab-userpage > \.user-page-header > #userPageFloatingActions\.user-page-floating-actions\{[\s\S]*position:absolute!important;/);
  assert.doesNotMatch(block,/position:fixed!important/);
});

test('v90/v93: controles ficam dentro do cabeçalho da userpage',()=>{
  const html=read('public/index.html'),app=read('public/app.js');
  assert.match(html,/<section id="tab-userpage" class="tab scroll-panel" hidden>[\s\S]*<header class="page-header user-page-header">[\s\S]*id="userPageFloatingActions"/);
  assert.match(app,/const pageActions=ensureUserPageActionsViewportLayer\(\);if\(pageActions\)pageActions\.hidden=name!==\'userpage\'/);
});

test('v90: mobile mantém os controles fixos no canto superior direito',()=>{
  const css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v90'));
  assert.match(block,/@media\(max-width:760px\)\{[\s\S]*\.user-page-floating-actions\{[\s\S]*top:8px!important;[\s\S]*right:8px!important/);
});
