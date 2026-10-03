'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const {PAGE_TEMPLATES,STATUS_COLORS}=load('src/lib/page-templates.ts');
test('exactly the three official page templates are exposed',()=>{
 assert.equal(Array.from(PAGE_TEMPLATES,x=>x.id).join('|'),'tasks_personal|notes_hub|playlist_links');
 assert.equal(Array.from(PAGE_TEMPLATES,x=>x.title).join('|'),'Tarefas pessoais|Bloco de notas|Lista de reprodução');
});
test('tasks template has editable status columns with colors',()=>{
 const t=PAGE_TEMPLATES[0],collection=t.blocks.find(x=>x.type==='collection');
 const status=collection.data.properties.find(x=>x.key==='status');
 assert.equal(Array.from(status.options).join('|'),'Não iniciada|Prioridade');
 assert.equal(status.option_colors['Não iniciada'],'gray');assert.equal(status.option_colors['Prioridade'],'red');
 assert.equal(collection.data.views[0].type,'board');assert.equal(collection.data.views[0].group_by,'status');
 assert.ok(STATUS_COLORS.some(x=>x.id==='blue'));assert.ok(STATUS_COLORS.some(x=>x.id==='green'));
});
test('notes and playlist templates match the requested structures',()=>{
 const notes=PAGE_TEMPLATES[1],playlist=PAGE_TEMPLATES[2];
 assert.ok(notes.blocks.some(x=>x.type==='collection'&&x.data.views?.some(v=>v.type==='pages')));
 assert.equal(playlist.blocks.filter(x=>x.type==='callout').length,0);
 const links=playlist.blocks.find(x=>x.type==='collection');assert.ok(links.data.properties.some(x=>x.key==='url'&&x.type==='url'));assert.equal(links.data.title,'');
});
test('Pages + offers blank/template and renders collection blocks in the app',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const picker=fs.readFileSync(path.join(__dirname,'../src/components/PageTemplatePicker.tsx'),'utf8');
 const collection=fs.readFileSync(path.join(__dirname,'../src/components/NativeCollectionBlock.tsx'),'utf8');
 assert.ok(src.includes('PageCreateMenu'));assert.ok(!src.includes('template_id:'));assert.ok(src.includes("title:'Sem título'"));assert.ok(src.includes("icon:'',icon_mode:'default'"));assert.ok(src.includes("blocks_json:preset?JSON.stringify(preset.blocks):'[]'"));assert.ok(src.includes("applyTemplate(template:PageTemplate)"));assert.ok(src.includes("<NativeCollectionBlock"));
 assert.ok(picker.includes('＋ Página em branco'));assert.ok(picker.includes('▦ Usar template'));
 assert.ok(collection.includes('Duplicar coluna'));assert.ok(collection.includes('＋ Coluna'));assert.ok(collection.includes('Cor'));
});

test('page long press exposes delete without making a downward outdent jump straight to root',()=>{
 const tree=fs.readFileSync(path.join(__dirname,'../src/components/PageTreeList.tsx'),'utf8');
 assert.ok(tree.includes('setShowDelete(!!onDelete)'));
 assert.ok(tree.includes("else if(wasChild&&outsideHorizontal&&canParent(page.id,''))"));
 assert.ok(tree.includes('else if(wasChild&&dy>18&&previousLevel!==parentId'));
 assert.ok(tree.includes("const previousLevel=parent?String(parent.data?.parent_id||''):''"));
});

test('page back swipe reveals the actual previous page instead of the pages list',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 assert.ok(src.includes('const previousBackdrop=previousEntry&&previousPage'));
 assert.ok(src.includes('{previousBackdrop}'));
 assert.ok(!src.includes("return <View style={{flex:1,backgroundColor:c.bg}} onLayout={e=>{paneWidth.current=e.nativeEvent.layout.width;}}>\n  {listView}\n  <Animated.View"));
});
