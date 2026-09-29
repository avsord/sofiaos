'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v130: identidade e cache atuais estão alinhados',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.ok(cfg.includes("const VERSION = '130.0.0'"));
  assert.ok(html.includes('Sofia OS · v130'));
  assert.ok(html.includes('/ui-current.css?v=130'));
  assert.ok(html.includes('/app.js?v=130'));
  assert.ok(html.includes('Core v130 · AVSORD Technology'));
  assert.equal(pkg.version,'1.80.0');
});

test('v119: subpáginas continuam fechadas ao iniciar',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes('function pageTreeExpanded(pageId){if(state.userPageExpanded[pageId]===undefined)state.userPageExpanded[pageId]=false'));
  assert.ok(!app.includes("localStorage.setItem('sofiaPageTreeExpanded'"));
});

test('v119: Agenda é interativa e cria itens clicando no dia',()=>{
  const app=read('public/app.js'),css=read('public/ui-current.css');
  assert.ok(app.includes('function agendaCreateAt(day)'));
  assert.ok(app.includes("cell.addEventListener('click'"));
  assert.ok(app.includes("options:[['event','Evento'],['task','Tarefa'],['reminder','Lembrete']]"));
  assert.ok(css.includes('.agenda-day:hover'));
});

test('v119: arrastar no calendário atualiza o registro de origem',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes('async function agendaMoveRowToDay(row,day)'));
  assert.ok(app.includes("api('/api/tasks/'+row.id"));
  assert.ok(app.includes("api('/api/entities/'+current.id"));
  assert.ok(app.includes("b.draggable=true"));
});

test('v119: clicar em tarefa/evento existente abre edição da própria origem',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes("function agendaOpenRow(row){if(row._source==='task')return editTask(row);if(['commitment','reminder'].includes(row.kind))return editEntity(row.kind,row,'commitments')"));
});

test('v119: formulário de tarefa foi rediagramado',()=>{
  const app=read('public/app.js'),css=read('public/ui-current.css');
  assert.ok(app.includes("classList.add('task-editor-dialog')"));
  assert.ok(css.includes('#editorDialog.task-editor-dialog #editorFields'));
  assert.ok(css.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));
  assert.ok(css.includes('label[data-field="description"]'));
});

test('v119: tarefas têm metadados de sincronização futura de calendário',()=>{
  const migration=read('src/memory/migration119.js'),store=read('src/memory/store.js');
  assert.ok(migration.includes('calendar_provider'));
  assert.ok(migration.includes('external_event_id'));
  assert.ok(store.includes("migrate119"));
  assert.ok(store.includes("sync_state"));
});


test('v120: tela Tarefas possui todas as funções usadas por loadTasks',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes('function taskPriorityLabel(level)'));
  assert.ok(app.includes('function taskPriorityClass(level)'));
  assert.ok(app.includes('async function loadTaskCards()'));
  assert.ok(app.includes('await loadTaskCards();'));
});


test('v121: Início usa o destino solicitado e não o estado alterado pelo scroll antigo do Resumo',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes("const requestedSection=section==='summary'?'summary':'top'"));
  assert.ok(app.includes("state.startSection=requestedSection;"));
  assert.ok(app.includes("requestAnimationFrame(()=>scrollStartSection(requestedSection,{smooth:true}))"));
  assert.ok(!app.includes("requestAnimationFrame(()=>scrollStartSection(state.startSection,{smooth:true}))"));
});


test('v122: barra lateral dos menus mantém thumb visível no estilo Notion',()=>{
  const css=read('public/ui-current.css');
  assert.ok(css.includes('/* v122 — barra lateral de rolagem sempre visível'));
  assert.ok(css.includes('.mode-user .sidebar::-webkit-scrollbar-thumb{'));
  assert.ok(css.includes('background:rgba(55,53,47,.30)!important'));
  assert.ok(css.includes('scrollbar-width:thin!important'));
  assert.ok(css.includes('scrollbar-gutter:stable!important'));
  assert.ok(!css.slice(css.indexOf('/* v122 — barra lateral de rolagem sempre visível')).includes('.mode-user .sidebar:hover::-webkit-scrollbar-thumb'));
});


test('v124: APPS e PARTICULAR persistem e subpáginas reiniciam fechadas',()=>{
  const app=read('public/app.js');
  assert.ok(app.includes("localStorage.setItem('sofiaAppsExpanded',open?'1':'0')"));
  assert.ok(app.includes("localStorage.getItem('sofiaAppsExpanded')!=='0'"));
  assert.ok(app.includes("localStorage.setItem('sofiaParticularExpanded',open?'1':'0')"));
  assert.ok(app.includes("localStorage.getItem('sofiaParticularExpanded')!=='0'"));
  assert.ok(!app.includes("localStorage.setItem('sofiaPageTreeExpanded'"));
  assert.ok(app.includes("if(open&&!wasOpen){state.userPageExpanded={};loadUserPages().catch(showError);}"));
});


test('v124: excluir curso aparece apenas dentro de Editar',()=>{
  const app=read('public/app.js');
  assert.match(app,/entity&&kind==='course'/);
  assert.match(app,/Excluir curso/);
  assert.match(app,/if\(kind!=='course'\)a\.append\(btn\('Excluir'/);
  assert.match(app,/if\(e\.kind!=='course'\)actions\.append\(btn\('Excluir'/);
});


test('v125: curso só pode ser excluído dentro de Editar',()=>{
  const app=read('public/app.js');
  assert.match(app,/if\(kind!=='course'\)a\.append\(btn\('Excluir'/);
  assert.match(app,/if\(e\.kind!=='course'\)actions\.append\(btn\('Excluir'/);
  assert.match(app,/course-editor-danger-zone/);
  assert.match(app,/Esta opção fica somente dentro de Editar/);
  assert.match(app,/Excluir curso/);
});


test('v127: Conexões oferece botão real de coexistência do WhatsApp Business',()=>{
  const app=read('public/app.js'),api=read('src/core/api45.js');
  assert.ok(app.includes('Conectar WhatsApp Business'));
  assert.ok(app.includes("r.status==='ready-to-connect'?'Pronto para conectar'"));
  assert.ok(api.includes("status:'ready-to-connect'"));
  assert.ok(api.includes("connect_url:base+'/whatsapp/connect'"));
});

test('v127: Embedded Signup abre o fluxo de coexistência e não o cadastro normal',()=>{
  const js=read('public/whatsapp-connect.js'),html=read('public/whatsapp-connect.html');
  assert.ok(html.includes('Conectar WhatsApp Business'));
  assert.ok(js.includes("featureType:'whatsapp_business_app_onboarding'"));
  assert.ok(js.includes("sessionInfoVersion:'3'"));
  assert.ok(js.includes("config_id:state.config.configId"));
  assert.ok(js.includes("override_default_response_type:true"));
});

test('v130: infraestrutura Railway mantém endpoints públicos e protege o painel online com login',()=>{
  const handler=read('src/core/http-handler.js'),server=read('src/server.js');
  assert.ok(handler.includes("p==='/health'"));
  assert.ok(handler.includes("p==='/privacy'"));
  assert.ok(handler.includes("p==='/webhook'"));
  assert.ok(handler.includes("p==='/whatsapp/connect'"));
  assert.ok(handler.includes("p==='/login'"));
  assert.ok(handler.includes("p==='/auth/login'"));
  assert.ok(handler.includes('validSession(req)'));
  assert.ok(handler.includes('checkLocalRequest(req)'));
  assert.ok(server.includes("?'0.0.0.0':config.host"));
  assert.ok(server.includes('process.env.PORT'));
});


test('v129: site público da Meta descreve serviço, responsável e políticas sem abrir o painel',()=>{
  const site=read('public/site.html'),terms=read('public/terms.html'),deletion=read('public/data-deletion.html'),handler=read('src/core/http-handler.js');
  assert.ok(site.includes('Automação e atendimento'));
  assert.ok(site.includes('Pedro Henrique Silva'));
  assert.ok(site.includes('sofiaos.core@gmail.com'));
  assert.ok(site.includes('/login'));
  assert.ok(site.includes('Entrar na Sofia OS'));
  assert.ok(site.includes('/privacy'));
  assert.ok(site.includes('/terms'));
  assert.ok(site.includes('/data-deletion'));
  assert.ok(terms.includes('Termos de Serviço'));
  assert.ok(deletion.includes('Solicitação de exclusão de dados'));
  assert.ok(handler.includes("'/site':['site.html'"));
  assert.ok(handler.includes("'/terms':['terms.html'"));
  assert.ok(handler.includes("'/data-deletion':['data-deletion.html'"));
});
