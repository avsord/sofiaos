'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const core=fs.readFileSync(path.join(root,'src','core','sofia-core.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const cfg=fs.readFileSync(path.join(root,'src','config','sofia.js'),'utf8');
const pkg=require(path.join(root,'package.json'));

test('v99: Lavanda é a capa padrão de página',()=>{
  assert.match(app,/const DEFAULT_PAGE_COVER_TYPE='preset'/);
  assert.match(app,/const DEFAULT_PAGE_COVER_VALUE='linear-gradient\(135deg,#d9d2ff,#b8aaff\)'/);
  assert.match(app,/function userPageData\(page=\{\}\)\{const d=\{icon:'',icon_mode:'default',cover_type:DEFAULT_PAGE_COVER_TYPE,cover_value:DEFAULT_PAGE_COVER_VALUE/);
  assert.match(core,/cover_type:'preset',cover_value:'linear-gradient\(135deg,#d9d2ff,#b8aaff\)'/);
});

test('v99: Modo default limpa conteúdo e mantém a capa padrão',()=>{
  const start=app.indexOf('async function resetUserPageToDefault()');
  const end=app.indexOf('function showUserPageActions()',start);
  const block=app.slice(start,end);
  assert.match(block,/cover_type:DEFAULT_PAGE_COVER_TYPE,cover_value:DEFAULT_PAGE_COVER_VALUE,cover_attachment_id:DEFAULT_PAGE_COVER_ATTACHMENT_ID/);
  assert.match(block,/title:page\.title,content:''/);
  assert.doesNotMatch(block,/template_id:''/);
});

test('v99: identidade e cache estão alinhados',()=>{
  assert.match(cfg,/VERSION = '103\.0\.0'/);
  assert.match(html,/Sofia OS · v103/);
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/Core v103 · AVSORD Technology/);
  assert.equal(pkg.version,'1.53.0');
});
