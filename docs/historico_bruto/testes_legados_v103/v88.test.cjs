'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v88: versão pública, Core e package estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '103\.0\.0'/);assert.match(html,/Sofia OS · v103/);assert.match(html,/style\.css\?v=103/);assert.match(html,/app\.js\?v=103/);assert.match(html,/Core v103/);assert.equal(pkg.version,'1.53.0');
});

test('v88: ações fixas permanecem no lugar original à direita',()=>{
  const css=read('public/style.css'),block=css.slice(css.lastIndexOf('/* Sofia OS v89'));
  assert.match(block,/\.user-page-floating-actions\{[\s\S]{0,260}position:absolute!important;[\s\S]{0,260}top:22px!important;[\s\S]{0,260}right:22px!important;[\s\S]{0,260}left:auto!important;[\s\S]{0,260}transform:none!important/);
});

test('v88: PARTICULAR e páginas internas seguem a mesma régua de APPS',()=>{
  const css=read('public/style.css'),html=read('public/index.html'),app=read('public/app.js'),block=css.slice(css.lastIndexOf('/* Sofia OS v89'));
  assert.match(html,/id="particularMenuToggle" class="sidebar-section-toggle particular-section-toggle"/);
  assert.match(html,/sidebar-section-title">PARTICULAR/);
  assert.match(block,/#appsMenuToggle,[\s\S]*#particularMenuToggle\{[\s\S]*min-height:40px!important;[\s\S]*padding:8px 12px!important;[\s\S]*border-radius:12px!important/);
  assert.match(block,/#appsMenu \.nav,[\s\S]*#userPagesNav \.space-tree-button\{[\s\S]*min-height:40px!important;[\s\S]*grid-template-columns:24px minmax\(0,1fr\)!important/);
  assert.match(app,/nav-icon space-tree-page-icon/);assert.match(app,/nav-label space-tree-page-title/);
});

test('v88: sino abre preview no hover e permite entrar na janela sem flicker',()=>{
  const app=read('public/app.js'),css=read('public/style.css');
  assert.match(app,/startNotificationsButton\.addEventListener\('mouseenter'/);assert.match(app,/scheduleNotificationsHoverClose\(\)/);assert.match(app,/notificationsDialog\.addEventListener\('mouseenter',cancelNotificationsHoverClose\)/);assert.match(app,/previewTrigger==='hover'/);assert.match(app,/function notificationsPreviewOpen\(\)\{return !notificationsDialog\.hidden;\}/);
  assert.match(app,/Você não tem notificações\./);assert.match(app,/btn\('Ver todas',[\s\S]*'notifications-mini-link'/);assert.match(css,/Sofia OS v89[\s\S]*\.notifications-mini-dialog\{[\s\S]*width:min\(360px/);assert.match(css,/\.notifications-mini-list\{[\s\S]*max-height:min\(270px/);assert.match(css,/\.notifications-view-all\{[\s\S]*background:transparent!important/);
});

test('v88: página ampliada separa origem e área e mostra os detalhes',()=>{
  const app=read('public/app.js'),html=read('public/index.html');assert.match(html,/Todas as notificações organizadas por área e origem\./);assert.match(app,/Notificações detalhadas desta área/);assert.match(app,/Origem: /);assert.match(app,/const area=notificationArea\(n\)/);assert.match(app,/Categoria: /);assert.match(app,/Importância: /);assert.match(app,/Abrir detalhe/);assert.match(app,/Marcar como lido/);
});

test('v88: alternar Privado atualiza dados sem remontar ou deslocar o chat',()=>{
  const app=read('public/app.js');assert.match(app,/refreshUsageStatus\(\{show:true,render:false,preferredFilter:key\}\);renderUsageStatus\(\{fallback:false\}\)/);assert.match(app,/function replaceUsageCardPreservingScroll\(container\)/);assert.match(app,/container\.scrollTop=atBottom\?container\.scrollHeight/);assert.match(app,/api\('\/api\/usage-status\?refresh='\+Date\.now\(\)\)/);
  const start=app.indexOf("b.onclick=async()=>{state.homeUsageFilter=key"),end=app.indexOf(';tabs.append(b)',start),handler=app.slice(start,end);assert.ok(start>=0);assert.doesNotMatch(handler,/renderHomeThread\(/);
});
