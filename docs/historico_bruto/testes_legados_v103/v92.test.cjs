const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public','style.css'),'utf8');

test('v93: controles usam assets novos e ficam dentro do cabeçalho rolável',()=>{
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/<header class="page-header user-page-header">[\s\S]*id="userPageFloatingActions"[\s\S]*<\/header>/);
});

test('v93: regra final prende a barra ao topo da página sem flutuar',()=>{
  const marker=css.lastIndexOf('Sofia OS v93');
  const block=css.slice(marker);
  assert.match(block,/#tab-userpage > \.user-page-header > #userPageFloatingActions\.user-page-floating-actions\{[\s\S]*position:absolute!important;/);
  assert.doesNotMatch(block,/position:fixed!important/);
  assert.match(block,/inset:0 0 auto auto!important;/);
});
