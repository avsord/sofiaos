'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const model=load('src/lib/chat-model.ts'),{reconcileMessages,toggleMessageSelection,retainMessageSelection}=load('src/lib/chat-sync.ts',{'./chat-model':model});
const m=(n,extra={})=>({id:'m'+n,sequence:n,role:'user',content:'message '+n,created_at:'2026-10-02T12:00:00Z',status:'completed',...extra});
test('remote additions and status changes are reflected without duplicates',()=>{const result=reconcileMessages([m(1),m(2,{status:'pending'})],{messages:[m(1),m(2),m(3)],has_more:false});assert.equal(result.length,3);assert.equal(result[1].status,'completed');});
test('deleted messages disappear from the authoritative window and older loaded pages',()=>{const result=reconcileMessages([m(1),m(2),m(100),m(101)],{messages:[m(100),m(102)],has_more:true,deleted_ids:['m1','m101']});assert.deepEqual(Array.from(result,x=>x.id),['m2','m100','m102']);});
test('an empty remote history clears persisted messages but keeps unsent local drafts',()=>{const draft=m(8,{sequence:undefined,status:'failed'});const result=reconcileMessages([m(1),draft],{messages:[],has_more:false});assert.deepEqual(Array.from(result,x=>x.id),['m8']);});
test('a persisted acknowledgement replaces its optimistic client ID',()=>{const a=m(8,{sequence:undefined,status:'sending',client_id:'client'}),b=m(9,{client_id:'client'});assert.deepEqual(Array.from(reconcileMessages([a],{messages:[b],has_more:false}),x=>x.id),['m9']);});
test('unchanged snapshots keep their array identity to avoid periodic re-renders',()=>{const old=[m(1)];assert.equal(reconcileMessages(old,{messages:[m(1)],has_more:false}),old);});
test('selection is opt-in, multiple, toggleable and capped at the batch limit',()=>{let selection=new Set();selection=toggleMessageSelection(selection,'m1');selection=toggleMessageSelection(selection,'m2');assert.equal(selection.size,2);selection=toggleMessageSelection(selection,'m1');assert.equal(selection.has('m1'),false);for(let i=0;i<120;i++)selection=toggleMessageSelection(selection,'x'+i);assert.equal(selection.size,100);});
test('remote deletion also removes a selected row',()=>{assert.deepEqual([...retainMessageSelection(new Set(['m1','m2']),[m(2)])],['m2']);});

test('chat screen always returns to the newest message and keeps a manual jump button',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Chat.tsx'),'utf8');
 assert.ok(source.includes("if(!active){void silenceVoices();setSelectedIds(new Set());return;}"));
 assert.ok(source.includes("list.current?.scrollToEnd({animated:false})"));
 assert.ok(source.includes('accessibilityLabel="Ir para a última mensagem"'));
 assert.ok(source.includes('setShowLatest(!atEnd)'));
 assert.ok(source.includes('onLayout={()=>{if(active&&scrollEnd.current)'));
});
