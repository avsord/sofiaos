'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v58: interface pública separa menus padrão de espaços criados pelo usuário',()=>{
  const html=read('public/index.html'),js=read('public/app.js');
  assert.match(html,/(?:<p class="eyebrow">SOFIA(?: APLICATIVOS)?<\/p>|id="appsMenuToggle"[\s\S]*?>[\s\S]*?(?:APLICATIVOS DA SOFIA|CENTRAL DE APLICATIVOS|CENTRAL|APPS)[\s\S]*?<\/button>)/);
  assert.match(html,/(?:<p class="eyebrow">(?:SEUS ESPAÇOS|PARTICULAR)<\/p>|id="particularMenuToggle"[\s\S]*sidebar-section-title">PARTICULAR<\/span>)/);
  assert.match(html,/id="newConversation" class="primary wide chat-nav">[\s\S]*?nav-label">Chat<\/span>[\s\S]*?<\/button>/);
  assert.doesNotMatch(html,/＋ Chat/);
  assert.match(js,/Nenhuma página criada\. Comece do zero quando quiser\./);
});

test('v58: instalação nova não cria user_page automaticamente e atualização não precisa apagar os existentes',t=>{
  const f=fixture(t);
  assert.equal(f.core.workspace.list({kind:'user_page'}).length,0);
  const page=f.core.workspace.save({kind:'user_page',title:'Meu espaço',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes'}});
  assert.equal(f.core.workspace.get(page.id).title,'Meu espaço');
});

test('v58: Chat público não restaura conversa antiga após nova visita',()=>{
  const js=read('public/app.js');
  assert.match(js,/function resetUserChatSession\(/);
  assert.match(js,/state\.conversation=null;state\.messages=\[\]/);
  assert.match(js,/if\(state\.uiMode==='developer'\)\{const saved=localStorage\.getItem\('sofiaConversationId'\)/);
  assert.match(js,/else\{resetUserChatSession\(\);\}/);
  assert.match(js,/pagehide/);
  assert.match(js,/pageshow/);
  assert.match(js,/event\.persisted&&state\.uiMode==='user'/);
  assert.doesNotMatch(js,/leavingPublicChat/);
});

test('v58: conversa de backend continua sendo criada apenas ao enviar a primeira mensagem',()=>{
  const js=read('public/app.js');
  assert.match(js,/if\(!state\.conversation\)await newConversation\(/);
  assert.match(js,/if\(state\.uiMode==='user'\)\{state\.startSection='top';await setTab\('start'/);
});

test('v58: Início e Resumo usam animação orgânica própria e não salto do carregamento',()=>{
  const js=read('public/app.js');
  assert.match(js,/function startScrollEase\(t\)/);
  assert.match(js,/duration=Math\.min\(\d+,Math\.max\(\d+,\d+\+Math\.abs\(distance\)\*\.\d+\)\)/);
  assert.match(js,/animation\.frame=requestAnimationFrame\(tick\)/);
  assert.match(js,/addEventListener\('wheel',cancelStartScrollAnimation/);
  assert.match(js,/addEventListener\('touchstart',cancelStartScrollAnimation/);
  assert.doesNotMatch(js,/loadUserPages\(\);renderHomeThread\(\);if\(!\$\('tab-start'\)\.hidden&&state\.startSection==='summary'\)/);
});

test('v58: versão pública continua posterior à v58',()=>{
  const version=read('src/config/sofia.js').match(/VERSION\s*=\s*'(\d+)\.0\.0'/);
  assert.ok(version&&Number(version[1])>=58);
});
