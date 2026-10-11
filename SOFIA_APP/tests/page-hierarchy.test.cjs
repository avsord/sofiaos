'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {canReparentPage,reparentedPage,reparentPatch}=load('src/lib/page-hierarchy.ts');
const page=(id,parent='')=>({id,kind:'user_page',title:id,content:'',area:'Pessoal',state:'active',privacy:'private',tags:[],revision:3,data:{parent_id:parent,node_type:parent?'page':'space',blocks_json:'[]'}});
const rows=[page('a'),page('b','a'),page('c','b'),page('d')];

test('a page can become a subpage or return to the root',()=>{
 assert.equal(canReparentPage(rows,'d','a'),true);
 assert.equal(canReparentPage(rows,'c',''),true);
 const child=reparentedPage(rows[3],'a');assert.equal(child.data.parent_id,'a');assert.equal(child.data.node_type,'page');
 const root=reparentedPage(rows[2],'');assert.equal(root.data.parent_id,'');assert.equal(root.data.node_type,'space');
});
test('drag cannot create self-parenting or descendant cycles',()=>{
 assert.equal(canReparentPage(rows,'a','a'),false);
 assert.equal(canReparentPage(rows,'a','b'),false);
 assert.equal(canReparentPage(rows,'a','c'),false);
 assert.equal(canReparentPage(rows,'b','c'),false);
 assert.equal(canReparentPage(rows,'b','d'),true);
});
test('server patch preserves page data and optimistic move does not mutate source',()=>{
 const source=rows[3],patch=reparentPatch(source,'b'),next=reparentedPage(source,'b');
 assert.equal(source.data.parent_id,'');assert.equal(patch.id,'d');assert.equal(patch.revision,3);
 assert.equal(patch.data.parent_id,'b');assert.equal(patch.data.node_type,'page');
 assert.equal(next.data.parent_id,'b');assert.notEqual(next,source);assert.notEqual(next.data,source.data);
});
