'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,httpFixture,base,blankAction}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

function userFor(f,text='pedido de teste'){
  const c=f.store.createConversation('v68','web');
  return f.store.userMessage({conversationId:c.id,clientId:crypto.randomUUID(),message:text}).message;
}

test('v68: contrato de user_page aceita icon_mode e capa sem quebrar páginas antigas',async t=>{
  const f=await httpFixture(t);
  const old=(await f.request('/api/entities',{kind:'user_page',title:'Página antiga',content:'',area:'Pessoal',privacy:'private',state:'active',data:{purpose:'',layout:'notes',parent_id:'',node_type:'space',blocks_json:'[]'},tags:[]})).body;
  assert.equal(old.kind,'user_page');
  const patched=(await f.request('/api/entities/'+old.id,{kind:'user_page',title:old.title,content:'',area:old.area,privacy:old.privacy,state:old.state,revision:old.revision,data:{...old.data,icon:'🔥',icon_mode:'emoji',cover_type:'gradient',cover_value:'linear-gradient(135deg,#111,#555)',cover_attachment_id:''},tags:[]},'PATCH')).body;
  assert.equal(patched.data.icon,'🔥');assert.equal(patched.data.icon_mode,'emoji');assert.equal(patched.data.cover_type,'gradient');
  const reopened=(await fetch(f.base+'/api/entities/'+old.id).then(r=>r.json()));assert.equal(reopened.data.icon_mode,'emoji');
});

test('v68: IA edita blocos da mesma página sem criar página duplicada',t=>{
  const f=fixture(t,{privateMode:false});
  const page=f.core.workspace.save({kind:'user_page',title:'Enjoy the Void',content:'',area:'Pessoal',privacy:'shared',state:'active',data:{purpose:'',layout:'notes',parent_id:'',node_type:'space',blocks_json:JSON.stringify([{id:'b1',type:'text',text:'Texto antigo',html:'',checked:false,open:true,data:{},comments:[]}])}});
  const user=userFor(f,'adiciona um texto sobre alquimia nesta página');
  const append=base('append_page_block',{explicit_action:true,ready_for_backend:true,action:{...blankAction(),page_id:page.id,block_type:'text',position:'end',content:'Alquimia e o elemento fogo.'}});
  const a=f.core.execute(user,append,'shared');assert.equal(a.details.page_changed,true);assert.equal(a.details.created,false);assert.equal(f.core.workspace.list({kind:'user_page'}).length,1);
  let saved=f.core.workspace.get(page.id),blocks=JSON.parse(saved.data.blocks_json);assert.equal(blocks.length,2);assert.equal(blocks[1].text,'Alquimia e o elemento fogo.');
  const newId=blocks[1].id;
  const edit=base('edit_page_block',{explicit_action:true,ready_for_backend:true,action:{...blankAction(),page_id:page.id,block_id:newId,content:'Alquimia, fogo e transformação.'}});
  f.core.execute(user,edit,'shared');saved=f.core.workspace.get(page.id);blocks=JSON.parse(saved.data.blocks_json);assert.equal(blocks.find(x=>x.id===newId).text,'Alquimia, fogo e transformação.');assert.equal(f.core.workspace.list({kind:'user_page'}).length,1);
  const del=base('delete_page_block',{explicit_action:true,ready_for_backend:true,action:{...blankAction(),page_id:page.id,block_id:newId}});
  f.core.execute(user,del,'shared');saved=f.core.workspace.get(page.id);blocks=JSON.parse(saved.data.blocks_json);assert.equal(blocks.length,1);assert.equal(blocks[0].id,'b1');
});

test('v68: prompt e catálogo dão à IA ferramentas explícitas e page_id real',()=>{
  const engine=read('src/services/intent-engine.js'),core=read('src/core/sofia-core.js');
  for(const token of ['append_page_block','edit_page_block','delete_page_block'])assert.match(engine,new RegExp(token));
  assert.match(engine,/NÃO use create_user_page para adicionar conteúdo dentro de uma página existente/);
  assert.match(engine,/Um nome explícito de página dado pelo usuário vence o contexto visual atual/);
  assert.match(engine,/Conversar não significa editar/);
  assert.match(core,/page_id:\['page','space'\]\.includes\(scope\.category\)/);
  assert.match(core,/Para ferramentas de página, scopes das categorias page\/space trazem page_id real/);
});

test('v68: formulário de espaço usa seletor visual opcional e ícone default',()=>{
  const app=read('public/app.js'),catalog=read('src/core/catalog.js');
  assert.match(app,/function editorIconPicker/);assert.match(app,/type:'iconpicker'/);assert.match(app,/PAGE_EMOJIS/);assert.match(app,/PAGE_ICONS/);
  assert.match(app,/Ícone padrão/);assert.match(app,/DEFAULT_PAGE_ICON/);assert.match(app,/icon_mode:'default'/);
  assert.match(catalog,/"key":"icon_mode"/);assert.match(catalog,/"default","emoji","icon","upload"/);
});

test('v68: ações da Sofia sincronizam páginas imediatamente e não navegam por criação acidental',()=>{
  const app=read('public/app.js');
  assert.match(app,/async function syncUiAfterAction/);assert.match(app,/await loadUserPages\(\)/);assert.match(app,/pageChanged/);
  assert.match(app,/r\?\.intent\?\.type==='create_user_page'/);
  assert.match(app,/await syncUiAfterAction\(r,\{navigate\}\)/);
  assert.match(app,/send\(text,\{route:'auto',navigate:false,uiContext:miniContextPayload\(\)\}\)/);
});

test('v68: mini chat e chat principal reservam histórico rolável sem cortar composer',()=>{
  const css=read('public/style.css'),app=read('public/app.js');
  assert.match(css,/\.mini-sofia-panel\{height:min\(560px,calc\(100dvh - 150px\)\)[\s\S]*grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(css,/\.mini-sofia-thread\{min-height:0;overflow-y:auto/);
  assert.match(css,/\.home-thread\{min-height:0;overflow-y:auto/);
  assert.match(app,/thread\.scrollTop=thread\.scrollHeight/);
});

test('v68: modo claro padroniza superfícies, campos, editor e feedback compacto',()=>{
  const css=read('public/style.css');
  assert.match(css,/:root\[data-theme="light"\] input,[\s\S]*background:#f7f7f5!important[\s\S]*color:#37352f!important/);
  assert.match(css,/:root\[data-theme="light"\] \.block-editable,[\s\S]*caret-color:#37352f/);
  assert.match(css,/main>#notice\.notice\{position:fixed[\s\S]*width:max-content[\s\S]*max-width:min\(420px/);
  assert.match(css,/:root\[data-theme="light"\] \.mini-sofia-panel\{background:#f1f1ef!important\}/);
});

test('v68: Resumo usa o mesmo estado ativo legível dos demais itens',()=>{
  const css=read('public/style.css');
  assert.match(css,/:root\[data-theme="light"\] #summaryJump\.active\{background:#e9e9e7!important;color:#37352f!important;opacity:1!important\}/);
  assert.match(css,/:root\[data-theme="light"\] \.nav\.active\{background:#e9e9e7;color:#37352f\}/);
});

test('v68: versão pública e assets permanecem versionados a partir da v68',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  const m=cfg.match(/VERSION = '(\d+)\.0\.0'/);assert.ok(m&&Number(m[1])>=68);const v=m[1];assert.match(html,new RegExp('Sofia OS · v'+v));assert.match(html,new RegExp('style\\.css\\?v='+v));assert.match(html,new RegExp('app\\.js\\?v='+v));assert.match(html,new RegExp('Core v'+v));assert.ok(Number(pkg.version.split('.')[1])>=19);
});
