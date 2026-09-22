'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v80: Início e Resumo ficam fora de APPS e APPS contém os demais módulos',()=>{
  const H=read('public/index.html');
  const primary=H.slice(H.indexOf('id="primaryUserNav"'),H.indexOf('id="appsMenuToggle"'));
  const apps=H.slice(H.indexOf('id="appsMenu"'),H.indexOf('class="conversation-heading"'));
  assert.match(primary,/>Início</);assert.match(primary,/>Resumo</);assert.match(H,/>APPS<\/span>/);
  assert.doesNotMatch(apps,/>Início</);assert.doesNotMatch(apps,/>Resumo</);
  for(const name of ['Agenda','Tarefas','Listas','Biblioteca','Estudos','Diário Pessoal'])assert.match(apps,new RegExp('>'+name.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'<'));
});

test('v80: Chat centraliza o nome sem mover o ícone da esquerda e Enviar permanece branco',()=>{
  const C=read('public/style.css');
  assert.match(C,/#newConversation\.chat-nav\{[\s\S]*?justify-content:center!important/);
  assert.match(C,/#newConversation\.chat-nav>\.nav-icon\{[\s\S]*?left:8px!important/);
  assert.match(C,/#newConversation\.chat-nav>\.nav-label\{[\s\S]*?text-align:center!important/);
  assert.match(C,/\.send-button:disabled\{opacity:1!important\}/);
  assert.match(C,/\.send-button:disabled span,\.send-button:disabled \.send-icon\{opacity:1!important\}/);
});

test('v80: Resumo mantém âncora por múltiplos frames e ignora scroll de estabilização',()=>{
  const A=read('public/app.js'),C=read('public/style.css');
  assert.match(A,/startViewportLock:0/);assert.match(A,/function restoreStartViewportAnchor\(anchor,\{frames=5\}=\{\}\)/);
  assert.match(A,/count<frames/);assert.match(A,/setTimeout\(\(\)=>\{/);assert.match(A,/state\.startViewportLock/);
  assert.match(A,/state\.startScrollAnimation\|\|state\.startViewportLock/);assert.match(C,/#tab-start\.viewport-stabilizing/);
  assert.match(C,/overflow-anchor:none!important/);
});

test('v80: Agenda no Resumo atualiza parcialmente sem loadStart integral',()=>{
  const A=read('public/app.js');
  assert.match(A,/state\.currentTab==='commitments'&&touchesAgenda/);
  assert.match(A,/await refreshHomeWidgets\(keys\)/);
  assert.doesNotMatch(A,/if\(target==='start'\)await loadStart\(\)/);
  assert.match(A,/const anchor=captureStartViewportAnchor\(\),panel=\$\('tab-start'\)/);
});

test('v80+: versão pública e pacote permanecem alinhados a partir da v80',()=>{
  const H=read('public/index.html'),cfg=read('src/config/sofia.js'),pkg=JSON.parse(read('package.json'));
  const v=cfg.match(/VERSION = '(\d+)\.0\.0'/);assert.ok(v&&Number(v[1])>=80);const n=v[1];
  assert.match(H,new RegExp('Sofia OS · v'+n));assert.match(H,new RegExp('style\\.css\\?v='+n));assert.match(H,new RegExp('app\\.js\\?v='+n));assert.match(H,new RegExp('Core v'+n));assert.ok(Number(pkg.version.split('.')[1])>=31);
});
