'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {applyLeafPatch}=load('src/lib/leaf-document.ts');
const {createPagerSelection}=load('src/lib/tab-navigation.ts');
const blank=()=>({id:'note',title:'',content:''});
test('blank note has no date until the first meaningful text, then retains that exact instant',()=>{
 let calls=0;const now=()=>{calls++;return '2026-10-04T12:00:05.123Z';};
 let note=applyLeafPatch(blank(),{},now);note=applyLeafPatch(note,{title:'  ',content:'\n'},now);note=applyLeafPatch(note,{blocks:[{id:'b',text:'',type:'heading1',marks:[]}]},now);
 assert.equal(calls,0);assert.equal(note.created_at,undefined);
 note=applyLeafPatch(note,{content:'Primeiro texto'},now);assert.equal(calls,1);assert.equal(note.created_at,'2026-10-04T12:00:05.123Z');
 note=applyLeafPatch(note,{content:'Texto seguinte',title:'Título'},now);note=applyLeafPatch(note,{content:''},now);assert.equal(calls,1);assert.equal(note.created_at,'2026-10-04T12:00:05.123Z');
});
test('manual date and time override automatic creation and survive later edits',()=>{
 let note=applyLeafPatch(blank(),{title:'Nota'},()=> '2026-10-04T12:00:00Z');note=applyLeafPatch(note,{created_at:'2020-05-20T17:32:00Z'});note=applyLeafPatch(note,{content:'Outro texto'});
 assert.equal(note.created_at,'2020-05-20T17:32:00Z');
});
test('legacy dates are preserved and an undated note is never dated just by opening',()=>{
 const old={...blank(),title:'Antiga',content:'Conteúdo antigo',created_at:'2022-01-01T13:15:00Z'};
 assert.equal(applyLeafPatch(old,{content:'Revisada'}).created_at,old.created_at);
 delete old.created_at;assert.equal(applyLeafPatch(old,{}).created_at,undefined);
});
test('rapid reverse drag ignores previous momentum while touching and after an earlier timestamp',()=>{
 const pager=createPagerSelection('home');pager.beginDrag();pager.release(20);pager.beginDrag();
 assert.equal(pager.finishDrag(400,400,25),null);assert.equal(pager.current(),'home');
 pager.release(40);assert.equal(pager.finishDrag(400,400,30),null);assert.equal(pager.isDragging(),true);
 assert.equal(pager.finishDrag(800,400,50),'pages');assert.equal(pager.current(),'pages');
});
test('settling ignores intermediate offsets and keeps listening until native paging ends',()=>{
 const pager=createPagerSelection('home');pager.beginDrag();pager.release(10);
 assert.equal(pager.finishDrag(620,400,20),null);assert.equal(pager.isDragging(),true);
 assert.equal(pager.finishDrag(800,400,30),'pages');assert.equal(pager.isDragging(),false);
});
