'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const {PAGE_TEMPLATES,STATUS_COLORS}=load('src/lib/page-templates.ts');
test('exactly the three official page templates are exposed',()=>{
 assert.deepEqual(PAGE_TEMPLATES.map(x=>x.id),['tasks_personal','notes_hub','playlist_links']);
 assert.deepEqual(PAGE_TEMPLATES.map(x=>x.title),['Tarefas pessoal','Bloco de nota','Lista de reprodução']);
});
test('tasks template has editable status columns with colors',()=>{
 const t=PAGE_TEMPLATES[0],collection=t.blocks.find(x=>x.type==='collection');
 const status=collection.data.properties.find(x=>x.key==='status');
 assert.deepEqual(status.options,['Não iniciada','Prioridade']);
 assert.equal(status.option_colors['Não iniciada'],'gray');assert.equal(status.option_colors['Prioridade'],'red');
 assert.equal(collection.data.views[0].type,'board');assert.equal(collection.data.views[0].group_by,'status');
 assert.ok(STATUS_COLORS.some(x=>x.id==='blue'));assert.ok(STATUS_COLORS.some(x=>x.id==='green'));
});
test('notes and playlist templates match the requested structures',()=>{
 const notes=PAGE_TEMPLATES[1],playlist=PAGE_TEMPLATES[2];
 assert.ok(notes.blocks.some(x=>x.type==='collection'&&x.data.views?.some(v=>v.type==='pages')));
 assert.ok(playlist.blocks.filter(x=>x.type==='callout').length>=2);
 const links=playlist.blocks.find(x=>x.type==='collection');assert.ok(links.data.properties.some(x=>x.key==='url'&&x.type==='url'));
});
test('Pages + offers blank/template and renders collection blocks in the app',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const picker=fs.readFileSync(path.join(__dirname,'../src/components/PageTemplatePicker.tsx'),'utf8');
 const collection=fs.readFileSync(path.join(__dirname,'../src/components/NativeCollectionBlock.tsx'),'utf8');
 assert.ok(src.includes('PageCreateMenu'));assert.ok(src.includes("template_id:preset?.id||''"));assert.ok(src.includes("<NativeCollectionBlock"));
 assert.ok(picker.includes('＋ Página em branco'));assert.ok(picker.includes('▦ Usar template'));
 assert.ok(collection.includes('Duplicar coluna'));assert.ok(collection.includes('＋ Coluna'));assert.ok(collection.includes('Cor'));
});
