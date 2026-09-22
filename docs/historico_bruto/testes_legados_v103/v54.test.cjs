'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v54: Início e Resumo têm estado independente e navegação não recarrega a Home',()=>{
  const js=read('public/app.js'),html=read('public/index.html');
  assert.match(html,/id="startJump" data-tab="start"/);
  assert.match(html,/id="summaryJump"/);
  assert.match(js,/function setStartSection\(section\)/);
  assert.match(js,/function navigateStartSection\(section\)/);
  assert.match(js,/setTab\('start',\{reload:hidden\}\)/);
  assert.match(js,/function scrollStartSection\(section,\{smooth=true\}=\{\}\)/);
  assert.match(js,/requestAnimationFrame\(tick\)/);
  assert.doesNotMatch(js,/homeSummary['"]\)\.scrollIntoView/);
});

test('v54: destaque do menu acompanha a rolagem manual entre Início e Resumo',()=>{
  const js=read('public/app.js');
  assert.match(js,/function syncStartSectionFromScroll\(\)/);
  assert.match(js,/addEventListener\('scroll',syncStartSectionFromScroll,\{passive:true\}\)/);
  assert.match(js,/setStartSection\((?:nearBottom\|\|)?panel\.scrollTop>=threshold\?'summary':'top'\)/);
});

test('v54: erros globais não deslocam a Home',()=>{
  const css=read('public/style.css');
  assert.match(css,/main>#notice\.notice\{position:absolute/);
  assert.match(css,/\.home-chat\{max-height:none;overflow:visible\}/);
  assert.match(css,/overflow-anchor:none/);
});

test('v54: exclusão direta aparece em cards, Agenda, Listas e página personalizada',()=>{
  const js=read('public/app.js'),html=read('public/index.html');
  assert.ok((js.match(/btn\('Excluir',\(\)=>deleteRecord\(e\),'danger'\)/g)||[]).length>=3);
  assert.match(html,/id="deleteUserPage"[^>]*title="Mais ações"/);
  assert.match(js,/\$\('deleteUserPage'\)\.onclick=showUserPageActions/);
  assert.match(js,/Excluir página e subpáginas/);
});

test('v54: transporte HTTPS não vence antes do timeout oficial da API',()=>{
  const http=read('src/services/http-client.js'),runtime=read('src/config/runtime.js');
  assert.doesNotMatch(http,/timeout:30000/);
  assert.match(http,/keepAlive:true/);
  assert.match(runtime,/apiTimeoutMs:\s*90000/);
});

test('v54: versão pública e schema estruturado continuam versionados após a v54',()=>{
  assert.match(read('src/config/sofia.js'),/VERSION\s*=\s*'\d+\.0\.0'/);
  assert.match(read('src/services/intent-engine.js'),/sofia_dialogue_turn_v\d+/);
  assert.match(read('public/index.html'),/Sofia OS · v\d+/);
});
