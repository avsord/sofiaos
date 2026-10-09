'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v84: versão pública, Core e package estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);
  assert.match(html,/Sofia OS · v103/);
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/Core v103/);
  assert.equal(pkg.version,'1.53.0');
});

test('v84: notificações usam popover e mantêm página completa por área',()=>{
  const app=read('public/app.js'),css=read('public/style.css'),html=read('public/index.html');
  assert.match(app,/notificationsDialog\.hidden=false/);
  assert.doesNotMatch(app,/notificationsDialog\.showModal\(\)/);
  assert.match(app,/btn\('Ver todas',[\s\S]*'notifications-mini-link'/);
  assert.match(app,/function positionNotificationsDialog/);
  assert.match(app,/async function loadNotificationsPage/);
  assert.match(app,/notificationArea\(n\)/);
  assert.match(css,/\.notifications-mini-dialog\{[\s\S]*position:fixed!important/);
  assert.match(html,/id="tab-notifications"/);
});

test('v84: Início tem botão rápido de retorno ao topo',()=>{
  const app=read('public/app.js'),css=read('public/style.css'),html=read('public/index.html');
  assert.match(html,/id="startBackToTop"/);
  assert.match(app,/function updateStartBackToTop/);
  assert.match(app,/panel\.scrollTop<280/);
  assert.match(app,/startBackToTop'\)\.onclick=.*scrollStartTop/);
  assert.match(css,/\.start-back-to-top\{[\s\S]*position:fixed!important/);
});

test('v84: chat aceita imagens coladas, prévia e salvamento opcional em Particular',()=>{
  const app=read('public/app.js'),html=read('public/index.html'),core=read('src/core/sofia-core.js'),http=read('src/core/http-handler.js');
  assert.match(app,/function bindImagePaste/);
  assert.match(app,/Salvar em Particular/);
  assert.match(app,/saveChatImageToPage/);
  assert.match(app,/chatImagePayloads/);
  assert.match(html,/id="homeImageTray"/);
  assert.match(html,/id="miniImageTray"/);
  assert.match(html,/id="chatImageTray"/);
  assert.match(core,/type:'input_image'/);
  assert.match(core,/turnImages\.length\?'private':'none'/);
  assert.match(http,/p==='\/chat'\?60\*1024\*1024:65536/);
  assert.match(http,/img-src 'self' blob:/);
});

test('v84: páginas Particular aceitam colar imagem, mover e redimensionar pelos quatro cantos',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/async function addImageFileToCurrentPage/);
  assert.match(app,/document\.addEventListener\('paste'/);
  for(const corner of ['nw','ne','sw','se'])assert.match(app,new RegExp("'"+corner+"'"));
  assert.match(app,/display_width/);
  assert.match(app,/display_x/);
  assert.match(app,/image-resize-handle/);
  assert.match(css,/\.resizable-image-block img\{[\s\S]*height:auto!important/);
  assert.match(css,/\.image-resize-nw/);
  assert.match(css,/\.image-resize-ne/);
  assert.match(css,/\.image-resize-sw/);
  assert.match(css,/\.image-resize-se/);
});

test('v84: uso Privado usa tokens mensais atualizados e mesma barra visual',()=>{
  const routing=read('src/services/routing.js'),usage=read('src/services/usage.js'),app=read('public/app.js'),core=read('src/core/sofia-core.js');
  assert.match(routing,/input_tokens_month/);
  assert.match(routing,/output_tokens_month/);
  assert.match(routing,/tokens_actual_month/);
  assert.match(routing,/calls_month/);
  assert.match(usage,/input_tokens:inputTokens/);
  assert.match(usage,/output_tokens:outputTokens/);
  assert.match(usage,/total_tokens:totalTokens/);
  assert.match(usage,/requests:u\.calls_month/);
  assert.match(app,/const bar=el\('div','usage-bar'\)/);
  assert.match(app,/if\(isPrivate\)\{[\s\S]{0,120}?stats\.append/);
  assert.match(app,/tokens neste mês/);
  assert.match(core,/privateTokens\.toLocaleString\('pt-BR'\).*tokens neste mês/);
});

test('v84: controles de página Particular continuam fixos',()=>{
  const css=read('public/style.css');
  assert.match(css,/\.user-page-header \.header-actions\{[\s\S]*position:fixed!important[\s\S]*z-index:90!important/);
});
