'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
const {pageBodyIsEmpty,pageBlockHint}=load('src/lib/page-hints.ts');
const blank={id:'first',type:'text',text:''};
test('new empty body shows one writing hint even without focus',()=>{
 assert.equal(pageBodyIsEmpty([blank]),true);assert.equal(pageBlockHint(blank,0,true,false),'Escreva algo…');
 assert.equal(pageBlockHint(blank,1,true,false),'');
});
test('written body is clean and a later empty row has no persistent hint',()=>{
 const written={...blank,text:'My notes'};assert.equal(pageBodyIsEmpty([written,blank]),false);
 assert.equal(pageBlockHint(written,0,false,false),'');assert.equal(pageBlockHint(blank,1,false,false),'');
});
test('rich blocks and HTML count as content; formatting-only empty text does not',()=>{
 for(const type of ['image','file','todo','divider','collection'])assert.equal(pageBodyIsEmpty([{...blank,type}]),false);
 assert.equal(pageBodyIsEmpty([{...blank,html:'<b>Saved text</b>'}]),false);
 assert.equal(pageBodyIsEmpty([{...blank,html:'<p><br>&nbsp;</p>'}]),true);
});
test('a focused empty row still exposes the contextual writing command',()=>{
 assert.equal(pageBlockHint(blank,1,false,true),'Digite / para opções');
});
test('hints are native placeholders with alpha; user content retains its full color',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 assert.ok(source.includes('placeholder="Título"'));assert.ok(source.includes("const placeholderColor=c.muted+'80'"));
 assert.equal((source.match(/placeholderTextColor=\{placeholderColor\}/g)||[]).length,2);
 assert.ok(source.includes('value={draft.title===\'Sem título\'?\'\':draft.title}'));
 assert.ok(!source.includes('Salvar agora'));
});
test('undo and redo share the right-hand tools group, after the flexible breadcrumb',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const breadcrumb=source.indexOf("path.map(p=>p.title)"),group=source.indexOf('testID="page-tools-right"');
 assert.ok(breadcrumb<group);const tools=source.slice(group,source.indexOf('</View>',group));
 let prev=-1;for(const name of ['undo','redo','plus','trash']){const i=tools.indexOf('name="'+name+'"');assert.ok(i>prev);prev=i;}
 assert.equal((source.match(/name="undo"/g)||[]).length,1);assert.equal((source.match(/name="redo"/g)||[]).length,1);
});

test('page canvas stays compact and subpages render as inline page rows',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
 const tree=fs.readFileSync(path.join(__dirname,'../src/components/PageTreeList.tsx'),'utf8');
 assert.ok(source.includes("height:hasCover?190:28"));
 assert.ok(source.includes("marginTop:hasCover?-44:0"));
 assert.ok(source.includes("style={{minHeight:18}}"));
 assert.ok(source.includes('fontSize:58'));
 assert.ok(source.includes("<PageTreeList roots={subpages}"));
 assert.ok(!source.includes("Subpáginas ·"));
 assert.ok(tree.includes("Solte aqui para página principal"));
 assert.ok(tree.includes("PanResponder.create"));
 assert.ok(tree.includes('onStartShouldSetPanResponderCapture:()=>true'));
 assert.ok(tree.includes("Arrastar página "));
});
