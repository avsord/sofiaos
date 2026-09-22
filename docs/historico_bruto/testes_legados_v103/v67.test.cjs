'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v67+: menu do usuário mantém grupo de aplicativos e PARTICULAR',()=>{
  const html=read('public/index.html'),app=read('public/app.js');
  assert.match(html,/(?:CENTRAL DE APLICATIVOS|CENTRAL|APPS)/);
  assert.match(html,/PARTICULAR/);
  assert.doesNotMatch(html,/>SEUS ESPAÇOS</);
  assert.match(app,/host\.append\(el\('span','', 'PARTICULAR'\)\)/);
});

test('v67: símbolos da sidebar ficam presos à mesma coluna vertical',()=>{
  const css=read('public/style.css');
  assert.match(css,/\.nav\{display:block;position:relative;padding-right:50px!important\}/);
  assert.match(css,/\.nav>\.nav-icon\{position:absolute!important;right:14px!important;top:50%!important;transform:translateY\(-50%\)/);
  assert.match(css,/#appsMenu \.nav\{display:grid;grid-template-columns:26px minmax\(0,1fr\)/);
});

test('v67: modo claro dá contraste real para cards, chat e mini Sofia',()=>{
  const css=read('public/style.css');
  assert.match(css,/:root\[data-theme="light"\]\{--panel:#f7f7f5;--surface-soft:#f1f1ef;--surface-strong:#e9e9e7/);
  assert.match(css,/:root\[data-theme="light"\] \.settings-card[\s\S]*background:#f7f7f5/);
  assert.match(css,/:root\[data-theme="light"\] \.composer\{background:#f1f1ef/);
  assert.match(css,/:root\[data-theme="light"\] \.mini-sofia-panel\{background:#f7f7f5/);
  assert.match(css,/:root\[data-theme="light"\] \.mini-sofia-button\{background:radial-gradient/);
});

test('v67: texto do editor no claro usa contraste Notion e exclusão não parece desabilitada',()=>{
  const css=read('public/style.css');
  assert.match(css,/:root\[data-theme="light"\] \.notion-page-title[\s\S]*\.block-editable[\s\S]*color:#37352f!important/);
  assert.match(css,/:root\[data-theme="light"\] \.block-more-action\.danger-text\{background:#fff5f4\}/);
  assert.match(css,/:root\[data-theme="light"\] \.danger\{background:#fbeceb!important[\s\S]*color:#b8322d!important/);
});

test('v67: páginas suportam capa, emoji e ícone convencional com propagação visual',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/icon_mode:'default'/);assert.match(app,/['"]emoji['"]/);
  assert.match(app,/cover_type:''/);
  assert.match(app,/const PAGE_EMOJIS=/);
  assert.match(app,/const PAGE_ICONS=/);
  assert.match(app,/function showPageIconPicker/);
  assert.match(app,/function showPageCoverPicker/);
  assert.match(app,/function uploadPageCover/);
  assert.match(app,/notion-page-icon/);
  assert.match(app,/notion-page-cover/);
  assert.match(css,/\.page-icon-grid/);
  assert.match(css,/\.page-cover-grid/);
});

test('v67: histórico Ctrl+Z/Y também restaura capa e ícone da página',()=>{
  const app=read('public/app.js');
  assert.match(app,/visual:\{icon:d\.icon\|\|''/);
  assert.match(app,/cover_attachment_id:d\.cover_attachment_id\|\|''/);
  assert.match(app,/if\(parsed\.visual&&state\.selectedUserPage\)/);
  assert.match(app,/\.\.\.parsed\.visual/);
});

test('v67: versão pública continua posterior à v67 e assets usam o mesmo major',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  const version=cfg.match(/VERSION = '(\d+)\.0\.0'/),title=html.match(/Sofia OS · v(\d+)/),css=html.match(/style\.css\?v=(\d+)/),js=html.match(/app\.js\?v=(\d+)/),core=html.match(/Core v(\d+)/);
  assert.ok(version&&Number(version[1])>=67);for(const m of [title,css,js,core])assert.equal(Number(m?.[1]),Number(version[1]));
  assert.ok(Number(pkg.version.split('.')[1])>=18);
});
