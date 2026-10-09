const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v94: cabeçalho não reserva espaço acima da capa',()=>{
  const css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v94'));
  assert.match(block,/#tab-userpage > \.user-page-header\{[\s\S]*position:absolute!important;[\s\S]*height:34px!important/);
  assert.match(block,/#tab-userpage\{position:relative!important\}/);
});

test('v94: Particular tem somente seta de abrir e mais',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),css=read('public/style.css');
  assert.match(html,/id="particularMenuCollapse"[\s\S]*class="particular-section-chevron"[\s\S]*id="addUserPage"/);
  assert.doesNotMatch(html,/particular-section-more/);
  assert.match(app,/function setParticularMenuExpanded\(expanded\)/);
  assert.match(css,/#userPagesNav\[hidden\]\{display:none!important\}/);
});

test('v94: páginas do Particular não ganham cinza diferente quando ativas',()=>{
  const css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v94'));
  assert.match(block,/#userPagesNav \.space-tree-button,[\s\S]*#userPagesNav \.space-tree-button\.active\{[\s\S]*background:transparent!important/);
});
