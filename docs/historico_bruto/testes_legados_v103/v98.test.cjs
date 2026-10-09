'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const cfg=fs.readFileSync(path.join(root,'src','config','sofia.js'),'utf8');
const pkg=require(path.join(root,'package.json'));

test('v98: payload de página remove campos legados antes de salvar',()=>{
  assert.match(app,/const USER_PAGE_DATA_KEYS=\['icon','icon_mode','cover_type','cover_value','cover_attachment_id','purpose','layout','suggested','parent_id','node_type','blocks_json'\]/);
  assert.match(app,/function userPagePersistedData\([\s\S]*for\(const key of USER_PAGE_DATA_KEYS\)clean\[key\]=source\[key\]/);
  const start=app.indexOf('async function saveUserPageEditor()');
  const end=app.indexOf('async function loadSelectedUserPage()',start);
  assert.match(app.slice(start,end),/data:userPagePersistedData\(data,\{blocks_json:JSON\.stringify\(state\.userPageBlocks\)\}\)/);
});

test('v98: Modo default não envia template_id e deixa a página limpa',()=>{
  const start=app.indexOf('async function resetUserPageToDefault()');
  const end=app.indexOf('function showUserPageActions()',start);
  const block=app.slice(start,end);
  assert.match(block,/const defaultData=userPagePersistedData\(data,\{icon:'',icon_mode:'default',cover_type:DEFAULT_PAGE_COVER_TYPE,cover_value:DEFAULT_PAGE_COVER_VALUE,cover_attachment_id:DEFAULT_PAGE_COVER_ATTACHMENT_ID,purpose:'',layout:'notes',suggested:false,blocks_json:JSON\.stringify\(emptyBlocks\)\}\)/);
  assert.doesNotMatch(block,/template_id:''/);
  assert.match(block,/title:page\.title,content:''/);
  assert.match(block,/state\.userPageBlocks=emptyBlocks/);
});

test('v98: identidade e cache atualizados',()=>{
  assert.match(cfg,/VERSION = '103\.0\.0'/);
  assert.match(html,/Sofia OS · v103/);
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/Core v103 · AVSORD Technology/);
  assert.equal(pkg.version,'1.53.0');
});

test('v98: atualizador aponta para a release e manifesto corretos',()=>{
  const updater=fs.readFileSync(path.join(root,'..','ferramentas','atualizar.cjs'),'utf8');
  assert.match(updater,/const RELEASE_VERSION=103/);
  assert.match(updater,/const MANIFEST_NAME='MANIFESTO_V103\.json'/);
});
