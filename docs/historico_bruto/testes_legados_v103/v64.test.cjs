'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {fixture,base,blankAction}=require('./helpers.cjs');
const {INTENT_SCHEMA}=require('../src/services/intent-engine');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});
const shared={sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Organização cotidiana no teste.'};

function commitment(core,title,at='2026-09-20T15:00:00.000Z'){
  return core.workspace.save({kind:'commitment',title,content:'',area:'Pessoal',privacy:'shared',state:'planned',data:{start_at:at,end_at:'',location:'',remind_minutes:'',calendar_id:'',sync_state:'local'},tags:[]});
}
function reminder(core,title,at='2026-11-27T12:00:00.000Z'){
  return core.workspace.save({kind:'reminder',title,content:'',area:'Pessoal',privacy:'shared',state:'active',data:{remind_at:at,message:title,location:'',calendar_id:'',sync_state:'local'},tags:[]});
}
function purchaseGroup(core,title){return core.workspace.save({kind:'purchase_group',title,content:'',area:'Pessoal',privacy:'private',state:'active',data:{description:''},tags:[]});}
function purchase(core,title,group=''){return core.workspace.save({kind:'purchase',title,content:'',area:'Pessoal',privacy:'shared',state:'interest',data:{purchase_group_id:group},tags:[]});}

// A semântica escolhe um scope real. O backend só enumera/executa os membros atuais daquele scope.
test('v64: “apagar tudo da Agenda” executa o scope Agenda inteiro sem confirmação extra',async t=>{
  const plan=base('delete_scope',{explicit_action:true,ready_for_backend:true,execution_confirmed:false,privacy:shared,ui_target:'commitments',action:{...blankAction(),scope:'all',scope_id:'agenda'}});
  const f=fixture(t,{privateMode:false,plans:[plan]});
  commitment(f.core,'Aniversário');reminder(f.core,'Pad 2');reminder(f.core,'Black Friday','2026-11-27T14:00:00.000Z');
  const r=await send(f.core,'apaga tudo que está na agenda');
  assert.equal(r.intent.type,'delete_scope');
  assert.equal(r.clarification,null);
  assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,0);
  assert.equal(r.details.scope_id,'agenda');
  assert.equal(r.details.deleted_total,3);
  assert.deepEqual(new Set(Object.keys(r.details.deleted_by_kind)),new Set(['commitment','reminder']));
  assert.equal(f.calls.filter(x=>x.kind==='structured').length,1,'não deve existir uma segunda rodada artificial de confirmação');
});

test('v64: exclusão genérica por escopo funciona fora da Agenda — Prioridades',async t=>{
  const f=fixture(t,{privateMode:false});
  const p1=f.store.saveTask({title:'Prioridade A',area:'Pessoal',state:'todo',priority:true,privacy:'shared'});
  const p2=f.store.saveTask({title:'Prioridade B',area:'Pessoal',state:'todo',priority:true,privacy:'shared'});
  const normal=f.store.saveTask({title:'Tarefa comum',area:'Pessoal',state:'todo',priority:false,privacy:'shared'});
  const c=f.store.createConversation('Teste','web');const user=f.store.userMessage({conversationId:c.id,clientId:crypto.randomUUID(),message:'apaga tudo de prioridades',channel:'web'}).message;
  const plan=base('delete_scope',{explicit_action:true,ready_for_backend:true,privacy:shared,action:{...blankAction(),scope:'all',scope_id:'priorities'}});
  const out=f.core.execute(user,plan,'shared');
  assert.equal(out.details.deleted_total,2);
  assert.deepEqual(new Set(out.details.deleted_ids),new Set([p1.id,p2.id]));
  assert.equal(f.store.tasks().some(x=>x.id===normal.id),true);
  assert.equal(f.store.tasks().filter(x=>x.priority).length,0);
});

test('v64: grupos de Comprar são scopes reais definidos pelo usuário',async t=>{
  const f=fixture(t,{privateMode:false});
  const studio=purchaseGroup(f.core,'Studio'),supp=purchaseGroup(f.core,'Suplementação');
  const a=purchase(f.core,'SSD',studio.id),b=purchase(f.core,'Luz',studio.id),c=purchase(f.core,'Creatina',supp.id),d=purchase(f.core,'Café','');
  const scope=f.core.workspace.resolveScope('purchase-group:'+studio.id);
  assert.equal(scope.label,'Studio');assert.deepEqual(new Set(scope.members.map(x=>x.id)),new Set([a.id,b.id]));
  const conv=f.store.createConversation('Teste','web');const user=f.store.userMessage({conversationId:conv.id,clientId:crypto.randomUUID(),message:'apaga tudo das compras do Studio',channel:'web'}).message;
  const plan=base('delete_scope',{explicit_action:true,ready_for_backend:true,privacy:shared,action:{...blankAction(),scope:'all',scope_id:'purchase-group:'+studio.id}});
  const out=f.core.execute(user,plan,'shared');assert.equal(out.details.deleted_total,2);
  const remaining=f.core.workspace.list({kind:'purchase',limit:50});assert.deepEqual(new Set(remaining.map(x=>x.id)),new Set([c.id,d.id]));
  assert.equal(f.core.workspace.get(studio.id).title,'Studio','apagar o conteúdo do grupo não apaga o grupo em si');
});

test('v64: excluir um grupo de Comprar preserva itens em Sem grupo',t=>{
  const f=fixture(t,{privateMode:false});const g=purchaseGroup(f.core,'Casa');const item=purchase(f.core,'Lâmpada',g.id);
  const result=f.core.workspace.removePurchaseGroup(g.id);assert.equal(result.detached,1);
  assert.equal(f.core.workspace.get(item.id).data.purchase_group_id,'');
  assert.throws(()=>f.core.workspace.get(g.id),e=>e.code==='NOT_FOUND');
});

test('v64: update_record in-place preserva quantidade e revisão do alvo',async t=>{
  const f=fixture(t,{privateMode:false});const before=reminder(f.core,'Redmi Pad 2','2026-11-27T12:00:00.000Z');
  const conv=f.store.createConversation('Teste','web');const user=f.store.userMessage({conversationId:conv.id,clientId:crypto.randomUUID(),message:'altera o lembrete',channel:'web'}).message;
  const plan=base('update_record',{explicit_action:true,ready_for_backend:true,privacy:shared,action:{...blankAction(),target_id:before.id,changes:[{field:'title',value:'Redmi Pad 2 Pro'},{field:'time',value:'10:30'}]}});
  const out=f.core.execute(user,plan,'shared');
  assert.equal(out.details.updated_id,before.id);assert.equal(out.details.created,false);
  const rows=f.core.workspace.list({kind:'reminder',limit:50});assert.equal(rows.length,1);assert.equal(rows[0].id,before.id);assert.equal(rows[0].title,'Redmi Pad 2 Pro');assert.match(rows[0].data.remind_at,/13:30:00\.000Z$/); // 10:30 America/Sao_Paulo
});

test('v64: schema oferece delete_scope/update_record e catálogo estrutural não vaza membros à IA',()=>{
  const intents=INTENT_SCHEMA.properties.intent.enum;assert.ok(intents.includes('delete_scope'));assert.ok(intents.includes('update_record'));
  const action=INTENT_SCHEMA.properties.action.properties;assert.ok(action.scope_id);assert.ok(action.target_id);assert.ok(action.target_ids);assert.ok(action.changes);
  const core=read('src/core/sofia-core.js');assert.match(core,/semanticCatalogContext/);assert.match(core,/scope_id:scope\.scope_id/);assert.doesNotMatch(core,/semanticCatalogContext\(\)[\s\S]{0,500}members:/);
});

test('v64: exclusões diretas não exigem confirmação destrutiva nem confirm() nativo',()=>{
  const core=read('src/core/sofia-core.js'),engine=read('src/services/intent-engine.js'),app=read('public/app.js');
  assert.doesNotMatch(core,/DESTRUCTIVE_CONFIRMATION_REQUIRED/);
  assert.match(engine,/EXCLUSÕES NÃO EXIGEM UMA SEGUNDA CONFIRMAÇÃO/);
  assert.doesNotMatch(app,/(?:window\.)?confirm\s*\(/);
  assert.match(app,/async function deleteRecord\(e\)[\s\S]*method:'DELETE'/);
  assert.match(app,/async function deleteTaskRecord\(t\)[\s\S]*method:'DELETE'/);
  assert.doesNotMatch(app,/Limpar página'[\s\S]{0,220}uiConfirm/);
});

test('v64: confirmações que continuam necessárias usam janela da Sofia e backdrop fecha detalhes',()=>{
  const html=read('public/index.html'),app=read('public/app.js');
  assert.match(html,/id="confirmDialog"/);assert.match(app,/function uiConfirm/);
  assert.match(app,/closeOnBackdrop\(recordDialog\)/);assert.match(app,/closeOnBackdrop\(\$\('detailDialog'\)\)/);assert.match(app,/closeOnBackdrop\(\$\('editorDialog'\)\)/);
  assert.match(app,/e\.target!==dialog/);
});

test('v64: exclusão fecha detalhe obsoleto e resposta de IA traz IDs realmente removidos',()=>{
  const core=read('src/core/sofia-core.js'),app=read('public/app.js');
  assert.match(core,/deleted_ids:deleted\.map\(x=>x\.id\)/);
  assert.match(app,/const deletedIds=new Set\(r\?\.details\?\.deleted_ids\|\|\[\]\)/);
  assert.match(app,/deletedIds\.has\(recordDialog\.dataset\.recordId\).*recordDialog\.close/);
  assert.match(app,/recordDialog\.dataset\.recordId=e\.id/);
});

test('v64: Safe Chat substitui o nome antigo e aparece como label visual',()=>{
  const app=read('public/app.js'),html=read('public/index.html'),css=read('public/style.css'),engine=read('src/services/intent-engine.js');
  for(const text of [app,html,engine])assert.doesNotMatch(text,/Chat Protegido/i);
  assert.match(app,/appendStyledText[\s\S]*Safe Chat/);assert.match(html,/safe-chat-label/);assert.match(css,/\.safe-chat-label/);
});

test('v64+: páginas possuem os templates atuais editáveis em coleções',()=>{
  const app=read('public/app.js');
  for(const id of ['ideas_database','tasks_board'])assert.match(app,new RegExp("id:'"+id+"'"));
  for(const removed of ['blank','links_database','inventory_database','content','crm','research','purchases','notes','project','meeting','weekly'])assert.doesNotMatch(app,new RegExp("\\{id:'"+removed+"',title:"));
  assert.match(app,/Templates de página/);assert.match(app,/templateBlocks/);assert.match(app,/state\.userPageBlocks\.push/);assert.match(app,/tudo continua livre e editável/i);
  assert.match(app,/Perguntar à Sofia|sofia/i);
});

test('v64: Comprar expõe filtros/grupos criáveis, renomeáveis e removíveis sem apagar itens',()=>{
  const app=read('public/app.js'),catalog=read('src/core/catalog.js'),api=read('src/core/api45.js'),workspace=read('src/core/workspace.js');
  assert.match(catalog,/purchase_group/);assert.match(catalog,/purchase_group_id/);
  assert.match(app,/createPurchaseGroup/);assert.match(app,/managePurchaseGroups/);assert.match(app,/Sem grupo/);assert.match(app,/Renomear/);
  assert.match(api,/delete_purchase_group/);assert.match(workspace,/removePurchaseGroup/);assert.match(workspace,/purchase-group:/);
});

test('v64: módulos do Home são ocultados como widget, nunca apagados com seus dados',()=>{
  const app=read('public/app.js');assert.match(app,/async function hideHomeWidget/);assert.match(app,/homeWidgets:selected/);assert.match(app,/O módulo e seus dados continuam na Sofia/);
  assert.doesNotMatch(app,/hideHomeWidget[\s\S]{0,300}method:'DELETE'/);
});

test('v64: capacidades de escopo continuam publicadas em versões seguintes',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '\d+\.0\.0'/);assert.match(html,/Sofia OS · v\d+/);assert.match(html,/style\.css\?v=\d+/);assert.match(html,/app\.js\?v=\d+/);assert.match(html,/Core v\d+/);assert.match(pkg.description,/Sofia OS/);
});
