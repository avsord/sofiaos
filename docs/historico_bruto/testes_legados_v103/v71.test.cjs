const {test}=require('node:test');
const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v71: mini Sofia mantém página aberta como contexto ambiente mesmo quando o contexto completo é reduzido',()=>{
  const A=read('public/app.js');
  assert.match(A,/const mode=state\.miniSofiaUseContext\?'focused':'ambient'/);
  assert.match(A,/context_priority:'soft'/);
  assert.match(A,/if\(!state\.miniSofiaUseContext\)return JSON\.stringify\(\{\.\.\.base,page_hint:/);
  assert.doesNotMatch(A,/if\(!state\.miniSofiaUseContext\)return '';/);
});

test('v71: backend trata página aberta como prioridade contextual suave sem bloquear o cérebro global',()=>{
  const C=read('src/core/sofia-core.js');
  assert.match(C,/PRIORIDADE CONTEXTUAL SUAVE/);
  assert.match(C,/nunca substitui uma intenção explícita do usuário, a continuidade da conversa nem o restante do cérebro\/memória da Sofia/);
  assert.match(C,/context_mode for ambient/);
});

test('v71: compromisso criado pela Sofia força atualização imediata da Agenda sem F5',()=>{
  const A=read('public/app.js');
  assert.match(A,/if\(state\.currentTab==='commitments'&&touchesAgenda\)await loadCommitments\(\);/);
  assert.match(A,/if\(state\.currentTab==='start'&&\(touchesAgenda\|\|touchesTasks/);
});

test('v71: menu de aplicativos nasce fechado, mantém coluna estável e ícones compactos à esquerda',()=>{
  const H=read('public/index.html'),A=read('public/app.js'),C=read('public/style.css');
  assert.match(H,/id="appsMenuToggle"[^>]*aria-expanded="false"/);
  assert.match(H,/id="appsMenu" class="apps-menu is-collapsed"[^>]*aria-hidden="true"/);
  assert.match(A,/setAppsMenuExpanded\(false\)/);
  assert.match(C,/#userNavigation\{[^}]*overflow-y:scroll!important/);
  assert.match(C,/#appsMenu \.nav\{[^}]*grid-template-columns:26px minmax\(0,1fr\)/);
  assert.match(C,/#appsMenu \.nav>\.nav-icon\{[^}]*width:24px!important;height:24px!important/);
  assert.match(C,/#appsMenu \.nav:hover>\.nav-icon[^}]*transform:none!important/);
});

test('v71: chat usa ícones vetoriais consistentes e não troca geometria ao gravar',()=>{
  const H=read('public/index.html'),A=read('public/app.js'),C=read('public/style.css');
  assert.match(H,/id="homeVoiceButton"[\s\S]*?class="control-icon voice-icon-mic"/);
  assert.match(H,/id="protectedModeToggle"[\s\S]*?class="control-icon safe-chat-icon"/);
  assert.match(H,/id="homeSendButton"[^>]*send-button[\s\S]*?class="control-icon send-icon"/);
  assert.match(A,/querySelector\('\.safe-chat-copy'\)/);
  assert.match(A,/button\.setAttribute\('aria-label',recording\?'Parar e enviar mensagem de voz'/);
  assert.match(C,/\.voice-button:hover,\.voice-button:active,\.voice-button:focus-visible\{transform:none!important\}/);
});

test('v71+: templates ficam somente nos dois modelos solicitados atualmente',()=>{
  const A=read('public/app.js');
  for(const id of ['ideas_database','tasks_board'])assert.match(A,new RegExp("\\{id:'"+id+"',title:"));
  for(const id of ['blank','links_database','inventory_database','content','crm','research','purchases','notes','project','meeting','weekly'])assert.doesNotMatch(A,new RegExp("\\{id:'"+id+"',title:"));
});

test('v71: controles finos do editor não invadem o texto nem herdam pílulas cinza no tema claro',()=>{
  const C=read('public/style.css');
  assert.match(C,/\.notion-block\{grid-template-columns:54px minmax\(0,1fr\)!important\}/);
  assert.match(C,/\.block-gutter\{width:54px;display:grid!important;grid-template-columns:24px 24px/);
  assert.match(C,/:root\[data-theme="light"\] \.block-add,[\s\S]*?\.notion-add-block,[\s\S]*?background:transparent!important/);
  assert.match(C,/\.page-meta-action\{[^}]*background:transparent!important/);
});

test('v71+: versão pública, Core, pacote e assets permanecem em v71 ou posterior',()=>{
  const cfg=read('src/config/sofia.js'),H=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  const version=cfg.match(/VERSION = '(\d+)\.0\.0'/),title=H.match(/Sofia OS · v(\d+)/),css=H.match(/style\.css\?v=(\d+)/),js=H.match(/app\.js\?v=(\d+)/),core=H.match(/Core v(\d+)/);for(const x of [version,title,css,js,core])assert.ok(Number(x?.[1])>=71);assert.ok(Number(pkg.version.split('.')[1])>=22);
});
