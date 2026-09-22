const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v95: ícone da página Particular não possui fundo cinza',()=>{
  const css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v95'));
  assert.match(block,/#userPagesNav \.space-tree-page-icon,[\s\S]*background:transparent!important;[\s\S]*box-shadow:none!important/);
});

test('v95: seta do Particular é geométrica e centralizada',()=>{
  const app=read('public/app.js'),css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v95'));
  assert.match(block,/\.particular-section-chevron::before\{[\s\S]*left:50%!important;[\s\S]*top:50%!important/);
  assert.match(app,/chevron\.classList\.toggle\('is-collapsed',!open\)/);
});

test('v95: Modo default salva diretamente antes de recarregar a lista',()=>{
  const app=read('public/app.js'),start=app.indexOf('async function resetUserPageToDefault()'),end=app.indexOf('function showUserPageActions()',start),block=app.slice(start,end);
  assert.match(block,/clearTimeout\(state\.userPageSaveTimer\)/);
  assert.match(block,/const saved=await api\('\/api\/entities\/'\+page\.id,\{method:'PATCH'/);
  assert.match(block,/blocks_json:JSON\.stringify\(emptyBlocks\)/);
  assert.doesNotMatch(block,/queueUserPageSave\(/);
  assert.ok(block.indexOf('const saved=await api')<block.indexOf('await loadUserPages()'));
});
