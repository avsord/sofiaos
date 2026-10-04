'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const {PAGE_TEMPLATES,STATUS_COLORS}=load('src/lib/page-templates.ts');
test('exactly the three official page templates are exposed',()=>{
 assert.equal(Array.from(PAGE_TEMPLATES,x=>x.id).join('|'),'tasks_personal|notes_hub|playlist_links');
 assert.equal(Array.from(PAGE_TEMPLATES,x=>x.title).join('|'),'Tarefas pessoal|Bloco de nota|Lista de reprodução');
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

test('stationary long press exposes a named delete action without reparenting',()=>{
 const tree=fs.readFileSync(path.join(__dirname,'../src/components/PageTreeList.tsx'),'utf8');
 assert.ok(tree.includes('if(!d.moved){setContext(d.page.id);return;}'));
 assert.ok(tree.includes('Excluir “{p.title}”'));assert.ok(tree.includes('onDelete(p)'));
 assert.ok(tree.includes('if(cancelled)return;'));
});

test('page back swipe reveals the actual previous page instead of the pages list',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 assert.ok(src.includes('const previousBackdrop=previousEntry&&previousPage'));
 assert.ok(src.includes('{previousBackdrop}'));
 assert.ok(!src.includes("return <View style={{flex:1,backgroundColor:c.bg}} onLayout={e=>{paneWidth.current=e.nativeEvent.layout.width;}}>\n  {listView}\n  <Animated.View"));
});

test('page row drag disables the outer menu pager while active',()=>{
 const pages=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const tree=fs.readFileSync(path.join(__dirname,'../src/components/PageTreeList.tsx'),'utf8');
 assert.ok(pages.includes('[pageInteraction,setPageInteraction]=useState(false)'));
 assert.ok(pages.includes('onDepthChange?.(!!selectedId||pageInteraction)'));
 assert.ok(pages.includes('pageInteractionRef.current=value;refreshGuard.current.setActive(value)'));
 assert.ok(pages.includes('setPageInteraction(value);onDepthChange?.(!!selectedRef.current||value)'));
 assert.ok(pages.includes('enabled={!pageInteraction&&!selectedId}'));
 assert.ok(pages.includes('onInteractionChange={changePageInteraction}')); 
 assert.ok(tree.includes('},240)'));
});


test('MD8: insertion retains written content and replaces only the untouched guide',()=>{
 const {insertTemplateBlocks}=load('src/lib/page-templates.ts');
 const written=[{id:'user',type:'text',text:'Minha anotação'}],incoming=[{id:'template',type:'collection',data:{rows:[]}}];
 const result=insertTemplateBlocks(written,incoming);assert.equal(result.length,2);assert.equal(result[0].text,'Minha anotação');assert.equal(written.length,1);assert.equal(incoming.length,1);
 result[1].data.rows.push({id:'local'});assert.equal(incoming[0].data.rows.length,0);
 assert.equal(insertTemplateBlocks([{id:'guide',type:'text',text:''}],incoming).length,1);
});
