'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,base,blankAction}=require('./helpers.cjs');
const {seed59}=require('../src/core/seed59');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v59: Chat preserva a sessão visual ao trocar menus e só reseta em nova visita/reload',()=>{
  const js=read('public/app.js');
  assert.doesNotMatch(js,/leavingPublicChat/);
  assert.match(js,/else\{resetUserChatSession\(\);\}/);
  assert.match(js,/event\.persisted&&state\.uiMode==='user'/);
  assert.match(js,/\$\('newConversation'\)\.onclick=async\(\)=>\{try\{if\(state\.uiMode==='user'\)\{state\.startSection='top';await setTab\('start'/);
  const handler=js.match(/\$\('newConversation'\)\.onclick=async\(\)=>\{[\s\S]*?\};\$\('refreshHistory'\)/)?.[0]||'';
  assert.ok(handler);assert.doesNotMatch(handler,/resetUserChatSession\(\)/);
});

test('v59+: user_page diferencia Espaço raiz de página filha e versões atuais permitem exclusão recursiva',t=>{
  const f=fixture(t);
  const rootPage=f.core.workspace.save({kind:'user_page',title:'Enjoy the Void',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes',parent_id:'',node_type:'space',blocks_json:'[]'}});
  assert.equal(rootPage.data.node_type,'space');
  const child=f.core.workspace.save({kind:'user_page',title:'Ideias',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes',parent_id:rootPage.id,node_type:'space',blocks_json:'[]'}});
  assert.equal(child.data.parent_id,rootPage.id);
  assert.equal(child.data.node_type,'page');
  const deleted=f.core.workspace.deleteEntity(rootPage.id);
  assert.equal(deleted.deleted_total,2);
  assert.throws(()=>f.core.workspace.get(rootPage.id),e=>e.code==='NOT_FOUND');
  assert.throws(()=>f.core.workspace.get(child.id),e=>e.code==='NOT_FOUND');
});

test('v59: create_user_page respeita parent_title e não cria subpágina como Espaço raiz',t=>{
  const f=fixture(t);
  const parent=f.core.workspace.save({kind:'user_page',title:'Enjoy the Void',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes',parent_id:'',node_type:'space',blocks_json:'[]'}});
  const conversation=f.store.createConversation('Teste','web');
  const user=f.store.userMessage({conversationId:conversation.id,clientId:crypto.randomUUID(),message:'coloca uma pagina de ideias dentro de enjoy the void'}).message;
  const plan=base('create_user_page',{explicit_action:true,assistant_message:'',ui_target:'userpage',action:{...blankAction(),title:'Ideias',parent_title:'Enjoy the Void',area:'Pessoal'}});
  const result=f.core.execute(user,plan,'private');
  const child=result.items[0];
  assert.equal(child.title,'Ideias');
  assert.equal(child.data.parent_id,parent.id);
  assert.equal(child.data.node_type,'page');
  assert.match(result.reply,/dentro de “Enjoy the Void”/);
});

test('v59: parent_title inexistente falha sem criar página solta',t=>{
  const f=fixture(t);
  const conversation=f.store.createConversation('Teste','web');
  const user=f.store.userMessage({conversationId:conversation.id,clientId:crypto.randomUUID(),message:'crie Ideias dentro de Espaço Fantasma'}).message;
  const plan=base('create_user_page',{explicit_action:true,assistant_message:'',ui_target:'userpage',action:{...blankAction(),title:'Ideias',parent_title:'Espaço Fantasma',area:'Pessoal'}});
  assert.throws(()=>f.core.execute(user,plan,'private'),/Não encontrei o espaço ou página/);
  assert.equal(f.core.workspace.list({kind:'user_page'}).length,0);
});

test('v59: seed repara página v58 criada como raiz quando a mensagem dizia explicitamente dentro de outro espaço',t=>{
  const f=fixture(t);
  const parent=f.core.workspace.save({kind:'user_page',title:'Enjoy the Void',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes'}});
  const c=f.store.createConversation('Teste','web');
  const m=f.store.userMessage({conversationId:c.id,clientId:crypto.randomUUID(),message:'coloca uma pagina de ideias dentro de enjoy the void'}).message;
  const child=f.core.workspace.save({kind:'user_page',title:'Ideias',area:'Pessoal',privacy:'private',state:'active',source_id:m.id,data:{layout:'notes'}});
  assert.equal(child.data.parent_id,'');
  seed59(f.store,f.core.workspace);
  const fixed=f.core.workspace.get(child.id);
  assert.equal(fixed.data.parent_id,parent.id);
  assert.equal(fixed.data.node_type,'page');
});

test('v59: editor de página usa blocos estilo Notion, slash menu, Enter e drag reorder',()=>{
  const js=read('public/app.js'),html=read('public/index.html'),css=read('public/style.css');
  assert.match(html,/id="addSubPage"[^>]*title="Criar subpágina"/);
  assert.match(html,/id="userPageBody" class="notion-page"/);
  assert.match(js,/const PAGE_BLOCK_TYPES=/);
  assert.match(js,/Digite \/ para escolher um bloco/);
  assert.match(js,/if\(e\.key==='Enter'&&!e\.shiftKey/);
  assert.match(js,/grip\.draggable=true/);
  assert.match(js,/blocks_json:JSON\.stringify\(state\.userPageBlocks\)/);
  assert.match(css,/\.block-command-menu\{/);
  assert.match(css,/\.notion-page-title\{/);
});

test('v59: sidebar renderiza árvore hierárquica em vez de páginas soltas',()=>{
  const js=read('public/app.js');
  assert.match(js,/const byParent=new Map\(\)/);
  assert.match(js,/renderNode\(child,depth\+1\)/);
  assert.match(js,/parent_id/);
  assert.match(js,/space-tree-button/);
});

test('v59: desktop tem um único scroll estrutural externo',()=>{
  const css=read('public/style.css');
  assert.match(css,/html,body\{height:100%;overflow:hidden\}/);
  assert.match(css,/\.shell\{height:100dvh;min-height:0\}/);
  assert.match(css,/@media\(max-width:760px\)\{html,body\{height:auto;overflow:auto\}/);
});

test('v59+: versão pública e assets continuam versionados depois da v59',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html');
  const m=cfg.match(/VERSION\s*=\s*'(\d+)\.0\.0'/);
  assert.ok(m&&Number(m[1])>=59);
  assert.match(html,/Sofia OS · v\d+/);
  assert.match(html,/style\.css\?v=\d+/);
  assert.match(html,/app\.js\?v=\d+/);
  assert.match(html,/Core v\d+/);
});
