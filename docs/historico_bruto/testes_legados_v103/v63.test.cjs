'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {httpFixture,fixture}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v63: páginas expõem os tipos de bloco centrais do Notion e extensões da Sofia',()=>{
  const js=read('public/app.js');
  for(const token of ["label:'Texto'","label:'Título 1'","label:'Título 2'","label:'Título 3'","label:'Título 4'","label:'Página'","label:'Lista com marcadores'","label:'Lista numerada'","label:'Lista de tarefas'","label:'Lista de alternantes'","label:'Código'","label:'Citação'","label:'Frase de destaque'","label:'Equação em bloco'","label:'Imagem'","label:'Arquivo'","label:'Tabela simples'","label:'Vincular tarefa'","label:'Vincular Agenda'","label:'Perguntar à Sofia'"])assert.match(js,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(js,/function pageCommandMenu/);
  assert.match(js,/function pageMoreMenu/);
  assert.match(js,/function createSubpageBlock/);
});

test('v63: editor possui rich text contextual com links, comentário, equação e limpeza',()=>{
  const js=read('public/app.js'),css=read('public/style.css');
  assert.match(js,/function updatePageInlineToolbar/);
  assert.match(js,/Negrito/);assert.match(js,/Itálico/);assert.match(js,/Sublinhado/);assert.match(js,/Tachado/);
  assert.match(js,/Código inline/);assert.match(js,/Equação inline/);assert.match(js,/Comentário/);assert.match(js,/Limpar formatação/);
  assert.match(js,/sanitizeInlineHTML/);assert.match(js,/data-comment-id/);assert.match(js,/data-equation/);
  assert.match(css,/\.page-inline-toolbar\{/);assert.match(css,/\.block-editable mark\[data-comment-id\]/);
});

test('v63: editor oferece atalhos markdown, autosave, tabela, toggle, código e drag reorder',()=>{
  const js=read('public/app.js');
  assert.match(js,/const map=\{'#':'heading1'/);
  assert.match(js,/blocks_json:JSON\.stringify\(state\.userPageBlocks\)/);
  assert.match(js,/renderTableBlock/);assert.match(js,/renderCodeBlock/);assert.match(js,/toggle-details/);
  assert.match(js,/grip\.draggable=true/);assert.match(js,/Mover para cima/);assert.match(js,/Duplicar/);
});

test('v63: anexos de página suportam imagem webp e resposta inline usa MIME real',async t=>{
  const f=await httpFixture(t);
  const page=(await f.request('/api/entities',{kind:'user_page',title:'Página mídia',content:'',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes',parent_id:'',node_type:'space',blocks_json:'[]'},tags:[]})).body;
  const attached=(await f.request('/api/entities/'+page.id+'/attachments',{name:'teste.webp',mime:'image/webp',base64:Buffer.from([1,2,3,4]).toString('base64')})).body;
  const inline=await fetch(f.base+'/api/attachments/'+attached.id+'?inline=1');
  assert.equal(inline.status,200);assert.equal(inline.headers.get('content-type'),'image/webp');assert.match(inline.headers.get('content-disposition'),/^inline;/);assert.deepEqual([...new Uint8Array(await inline.arrayBuffer())],[1,2,3,4]);
  const download=await fetch(f.base+'/api/attachments/'+attached.id);assert.equal(download.headers.get('content-type'),'application/octet-stream');assert.match(download.headers.get('content-disposition'),/^attachment;/);
});

test('v63: blocos avançados continuam sendo dados locais da user_page e não criam nova entidade por bloco',t=>{
  const f=fixture(t);const blocks=[{id:'b1',type:'table',text:'',data:{rows:[['A','B']]},comments:[]},{id:'b2',type:'callout',text:'Nota',html:'<strong>Nota</strong>',data:{icon:'💡'},comments:[]}];
  const page=f.core.workspace.save({kind:'user_page',title:'Editor',area:'Pessoal',privacy:'private',state:'active',data:{layout:'notes',parent_id:'',node_type:'space',blocks_json:JSON.stringify(blocks)}});
  assert.deepEqual(JSON.parse(page.data.blocks_json),blocks);assert.equal(f.core.workspace.list({kind:'user_page'}).length,1);
});

test('v63: editor avançado continua publicado e versionado nas versões seguintes',()=>{
  const cfg=read('src/config/sofia.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(cfg,/VERSION = '\d+\.0\.0'/);assert.match(html,/Sofia OS · v\d+/);assert.match(html,/style\.css\?v=\d+/);assert.match(html,/app\.js\?v=\d+/);assert.match(html,/Core v\d+/);assert.match(pkg.description,/Sofia OS/);
});
