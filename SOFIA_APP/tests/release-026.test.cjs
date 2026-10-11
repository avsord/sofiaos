'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {mergeRemotePages}=load('src/lib/page-sync.ts');
const {pageTitleHint}=load('src/lib/page-hints.ts');
const hierarchy=load('src/lib/page-hierarchy.ts');
const {projectPageDrop}=load('src/lib/page-order.ts',{'./page-hierarchy':hierarchy});
const {PageEditorStore}=load('src/lib/page-editor.ts');
const page=(id,parent='',revision=1)=>({id,title:id,kind:'user_page',content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],revision,data:{parent_id:parent,blocks_json:'[]'}});
test('026 remote refresh applies creations, revisions and deletions while retaining pending drafts',()=>{
 const old=[page('updated'),page('removed'),page('draft'),page('newer','',8)];
 const fresh=[{...page('updated','',2),title:'Site mudou'},page('created'),page('newer','',4)];
 const merged=mergeRemotePages(old,fresh,id=>id==='draft');
 assert.deepEqual(Array.from(merged,p=>p.id),['updated','created','newer','draft']);
 assert.equal(merged[0].title,'Site mudou');assert.equal(merged[2].revision,8);assert.equal(merged[3],old[2]);
});
test('026 incoming server snapshot cannot overwrite locally edited content',()=>{
 const local={...page('draft'),title:'Rascunho local'};const result=mergeRemotePages([local],[{...page('draft','',2),title:'Texto remoto'}],()=>true);assert.equal(result[0],local);
});
test('026 stale network revisions cannot rewind the editor',()=>{
 const store=new PageEditorStore({save:async p=>p,read:async()=>page('p'),persist:async()=>{}});
 store.open({...page('p','',5),title:'Recente'});store.open({...page('p','',2),title:'Antiga'});assert.equal(store.get('p').draft.title,'Recente');store.dispose();
});
test('026 title hint hides for existing body/subpages and returns on focus',()=>{
 assert.equal(pageTitleHint(true,false,false),'Título');assert.equal(pageTitleHint(false,false,false),'');assert.equal(pageTitleHint(true,true,false),'');assert.equal(pageTitleHint(false,true,true),'Título');
});
test('026 a large lateral outdent still goes up one hierarchy level',()=>{
 const root=page('root'),a=page('a','root'),b=page('b','a'),source=page('source','b'),sibling=page('sibling','b');
 const all=[root,a,b,source,sibling],rows=all.map((p,i)=>({page:p,depth:[0,1,2,3,3][i],x:0,y:i*46,width:400,height:46}));
 const drop=projectPageDrop(all,source,rows,30,rows[4].y+40,-180);assert.equal(drop.parentId,'a');assert.equal(drop.anchorId,'b');assert.equal(drop.depth,2);
});
