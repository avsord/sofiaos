'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const handler=fs.readFileSync(path.join(root,'src','core','http-handler.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const cfg=fs.readFileSync(path.join(root,'src','config','sofia.js'),'utf8');

test('v97 permite navegação inicial do documento sem liberar APIs cross-site',()=>{
  assert.match(handler,/const panelNavigation=req\.method==='GET'/);
  assert.match(handler,/!panelNavigation&&req\.headers\.origin/);
  assert.match(handler,/!panelNavigation&&req\.headers\['sec-fetch-site'\]==='cross-site'/);
});

test('v97 atualiza identidade pública e cache',()=>{
  assert.match(cfg,/VERSION = '103\.0\.0'/);
  assert.match(html,/Sofia OS · v103/);
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/Core v103 · AVSORD Technology/);
});
