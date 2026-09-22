'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v70+: APLICATIVOS DA SOFIA pode abrir/recolher sem esconder PARTICULAR',()=>{
  const H=read('public/index.html'),A=read('public/app.js'),C=read('public/style.css');
  assert.match(H,/id="appsMenuToggle"[^>]*aria-controls="appsMenu"/);
  assert.match(H,/id="appsMenu" class="apps-menu(?: is-collapsed)?"/);assert.match(H,/(?:class="conversation-heading"><p class="eyebrow">PARTICULAR|id="particularMenuToggle"[\s\S]*sidebar-section-title">PARTICULAR)/);
  assert.match(A,/function setAppsMenuExpanded\(expanded\)/);assert.match(C,/\.apps-menu\.is-collapsed\{max-height:0/);
});

test('v70: ícones do menu do usuário são maiores, semânticos e ocupam coluna estável',()=>{
  const H=read('public/index.html'),C=read('public/style.css');
  for(const icon of ['🏠','📋','✅','📅','📝','📚','🎓','📔'])assert.match(H,new RegExp(icon));
  assert.match(C,/#appsMenu \.nav\{display:grid;grid-template-columns:minmax\(0,1fr\) 32px/);
  assert.match(C,/\.nav>\.nav-icon\{display:grid;place-items:center;position:static!important;right:auto!important;top:auto!important;width:30px!important;height:30px!important/);
});

test('v70: Início e Resumo têm exclusão mútua de estado ativo e transição contínua',()=>{
  const A=read('public/app.js');
  assert.match(A,/function clearStartSectionState\(\)/);assert.match(A,/clearStartSectionState\(\);if\(!panel\|\|panel\.hidden\)return/);
  assert.match(A,/const active=state\.startSection==='summary'\?summary:start/);assert.match(A,/function startScrollEase\(t\)\{return 1-Math\.pow\(1-t,4\);\}/);
  assert.match(A,/duration=Math\.min\(900,Math\.max\(360,300\+Math\.abs\(distance\)\*\.18\)\)/);
  assert.match(A,/const maxScroll=Math\.max\(0,panel\.scrollHeight-panel\.clientHeight\),nearBottom=maxScroll>0&&panel\.scrollTop>=maxScroll-2/);
});

test('v70: Ctrl+Z/Y usa feedback inline da página e não abre aviso lateral',()=>{
  const A=read('public/app.js');const undo=A.slice(A.indexOf('function pageHistoryFeedback'),A.indexOf('function queueUserPageSave'));
  assert.match(undo,/function pageHistoryFeedback\(text\)/);assert.match(undo,/pageHistoryFeedback\('Desfeito'\)/);assert.match(undo,/pageHistoryFeedback\('Refeito'\)/);assert.doesNotMatch(undo,/notify\(/);
});

test('v70: alertas de uso após texto ou áudio ficam no contexto da conversa, sem toast lateral',()=>{
  const A=read('public/app.js');const start=A.indexOf('async function maybeUsageAlert'),end=A.indexOf('function bindVoiceControls',start),block=A.slice(start,end);
  assert.match(block,/state\.homeUsage=u/);assert.match(block,/renderUsageStatus\(\)/);assert.doesNotMatch(block,/renderHomeThread\(\)/);assert.doesNotMatch(block,/notify\(/);
});

test('v70: avisos globais restantes são pílulas centrais, não barras laterais',()=>{
  const C=read('public/style.css');assert.match(C,/main>#notice\.notice\{position:fixed;z-index:80;left:50%;right:auto;top:auto;bottom:22px;transform:translateX\(-50%\)/);
});

test('v70: página aumenta escala de texto, tabela e área útil mantendo capa full width',()=>{
  const C=read('public/style.css');assert.match(C,/width:min\(980px,calc\(100% - 104px\)\)!important/);assert.match(C,/\.notion-page-title\{font-size:48px!important/);assert.match(C,/\.block-editable\{font-size:16px/);assert.match(C,/\.collection-table\{font-size:13\.5px\}/);assert.match(C,/\.collection-cell-input\{padding:11px!important;font-size:13\.5px!important/);assert.match(C,/\.notion-page-cover\{height:250px!important\}/);
});


test('v70: envio de voz aparece imediatamente e usa captura Opus leve para fala',()=>{
  const A=read('public/app.js'),C=read('public/style.css');
  assert.match(A,/audioBitsPerSecond:32000/);assert.match(A,/recorder\.start\(1000\)/);
  assert.match(A,/function setOptimisticVoice\(target,blob,durationMs,clientId,status='Enviando…'\)/);
  assert.match(A,/URL\.createObjectURL\(blob\)/);assert.match(A,/voice-send-status/);assert.match(C,/\.voice-message \.voice-send-status/);
});

test('v70: preparação do áudio e abertura da conversa ocorrem em paralelo antes do processamento',()=>{
  const A=read('public/app.js');const start=A.indexOf('async function sendVoiceBlob'),end=A.indexOf('function usageCardFromData',start),block=A.slice(start,end);
  assert.match(block,/const base64Promise=blobToBase64\(blob\)/);assert.match(block,/const conversationPromise=state\.conversation\?Promise\.resolve\(state\.conversation\):newConversation/);
  assert.match(block,/const base64=await base64Promise;const conversation=await conversationPromise/);
});

test('v70+: versão pública permanece em v70 ou posterior',()=>{
  const cfg=read('src/config/sofia.js'),H=read('public/index.html'),pkg=JSON.parse(read('package.json'));const m=cfg.match(/VERSION = '(\d+)\.0\.0'/),h=H.match(/Sofia OS · v(\d+)/),css=H.match(/style\.css\?v=(\d+)/),js=H.match(/app\.js\?v=(\d+)/),core=H.match(/Core v(\d+)/);for(const x of [m,h,css,js,core])assert.ok(Number(x?.[1])>=70);assert.ok(Number(pkg.version.split('.')[1])>=21);
});
