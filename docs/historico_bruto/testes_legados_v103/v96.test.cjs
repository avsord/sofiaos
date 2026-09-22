'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','style.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

test('v96 usa ícone padrão colorido nas páginas Particular',()=>{
  assert.match(app,/const DEFAULT_PAGE_ICON='📄'/);
  assert.match(app,/page-icon-mode-'\+iconMode/);
  assert.match(css,/page-icon-mode-default,[\s\S]*page-icon-mode-emoji[\s\S]*Segoe UI Emoji/);
  assert.match(css,/page-icon-mode-icon[\s\S]*Segoe UI Symbol/);
});

test('v96 atualiza cache e identificação visual',()=>{
  assert.match(html,/Sofia OS · v103/);
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/Core v103 · AVSORD Technology/);
});
