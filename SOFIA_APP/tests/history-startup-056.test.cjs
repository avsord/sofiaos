'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs'),fs=require('node:fs');
const {openExistingChat}=load('src/lib/chat-opening.ts');
const conv=(id,channel='mobile')=>({id,channel,title:id,created_at:'2026-10-08T00:00:00Z',updated_at:'2026-10-08T00:00:00Z'});
const snapshot=(id,messages=[],revision=1)=>({conversation:id?conv(id):null,messages,has_more:false,deleted_ids:[],current_id:id,cursor_revision:revision});
const message={id:'preserved',role:'user',content:'Original unchanged',sequence:1};
function reader(current,rows=[],histories={}){const calls=[];return {calls,current:async()=>{calls.push(['current']);return current;},index:async offset=>{calls.push(['index',offset]);return{items:rows,has_more:false};},history:async id=>{calls.push(['history',id]);return{conversation:conv(id),messages:histories[id]||[],has_more:false};},select:async(id,revision)=>{calls.push(['select',id,revision]);return snapshot(id,histories[id],revision+1);}};}
test('056 open with messages performs one read, never creates/selects a new conversation',async()=>{const r=reader(snapshot('kept',[message]));assert.equal((await openExistingChat(r)).conversation.id,'kept');assert.deepEqual(r.calls,[['current']]);});
test('056 legacy empty cursor restores original non-empty thread, preserving IDs and text',async()=>{const r=reader(snapshot('auto-empty'),[conv('auto-empty'),conv('real')],{real:[message]});const result=await openExistingChat(r);assert.equal(result.conversation.id,'real');assert.equal(result.messages[0],message);assert.ok(r.calls.some(([op,id,revision])=>op==='select'&&id==='real'&&revision===1));});
test('056 new empty account remains empty; opening has no create side effect',async()=>{const r=reader(snapshot(null));const result=await openExistingChat(r);assert.equal(result.conversation,null);assert.ok(!r.calls.some(([op])=>op==='select'));});
test('056 deleted messages do not trigger recovery of a different conversation',async()=>{const page={...snapshot('cleared'),deleted_ids:['preserved']},r=reader(page,[conv('old')],{old:[message]});assert.equal(await openExistingChat(r),page);assert.equal(r.calls.length,1);});
test('056 another client selection during recovery wins',async()=>{const r=reader(snapshot('empty'),[conv('real')],{real:[message]});let count=0;r.current=async()=>++count===1?snapshot('empty'):snapshot('user-selected',[],2);assert.equal((await openExistingChat(r)).conversation.id,'user-selected');assert.ok(!r.calls.some(([op])=>op==='select'));});
test('056 contact, simulation and test conversations never enter personal recovery',async()=>{const r=reader(snapshot('empty'),[conv('contact','whatsapp'),conv('test','test'),conv('sim','whatsapp-simulator')]);await openExistingChat(r);assert.ok(!r.calls.some(([op])=>op==='history'||op==='select'));});
test('056 offline failure is explicit; no empty replacement is fabricated',async()=>{const r=reader(snapshot(null));r.current=async()=>{throw Error('offline');};await assert.rejects(openExistingChat(r,snapshot('saved',[message])),/offline/);});
test('056 remote missing history preserves saved copy as unsynchronized, never uploads it',async()=>{const r=reader(snapshot(null));const result=await openExistingChat(r,snapshot('saved',[message]));assert.equal(result.messages[0],message);assert.equal(result.recovery_pending,true);assert.ok(!r.calls.some(([op])=>op==='select'));});
test('056 explicit remote conversation tombstone prevents local resurrection',async()=>{const initial={...snapshot(null),deleted_conversation_ids:['saved']},r=reader(initial);const result=await openExistingChat(r,snapshot('saved',[message]));assert.equal(result.conversation,null);assert.equal(result.messages.length,0);});
test('056 cursor compare-and-swap rejection keeps the newer selection',async()=>{const r=reader(snapshot('empty'),[conv('real')],{real:[message]});r.select=async()=>{r.current=async()=>snapshot('other',[message],3);throw Object.assign(Error('changed'),{status:409});};assert.equal((await openExistingChat(r)).conversation.id,'other');});
test('056 frame warming yields Home first, selection is immediate and cleanup cancels work',()=>{
 let state=['home'],effects=[],frames=new Map(),nextId=0,cleanup;
 const react={useMemo:f=>f(),useState:()=>[state,f=>{state=typeof f==='function'?f(state):f;}],useEffect:f=>effects.push(f)};
 const {useStartupMounts}=load('src/lib/startup-mounts.ts',{'react':react},{requestAnimationFrame:f=>{frames.set(++nextId,f);return nextId;},cancelAnimationFrame:id=>frames.delete(id)});
 const frame=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(f=>f());};
 assert.deepEqual(Array.from(useStartupMounts(true,'home')),['home']);cleanup=effects.shift()();frame();assert.deepEqual(state,['home']);frame();assert.ok(state.includes('chat'));
 assert.ok(useStartupMounts(true,'profile').has('profile'));for(let i=0;i<6;i++)frame();assert.deepEqual(Array.from(state),['home','chat','pages','agenda','apps','profile']);cleanup();assert.equal(frames.size,0);
});
test('056 launch handoff invokes native after commit without two additional animation frames',()=>{let calls=0;const {finishLaunchHandoff}=load('src/lib/launch-handoff.ts',{'react-native':{NativeModules:{SofiaLaunch:{hide:async()=>{calls++;}}}}});finishLaunchHandoff();assert.equal(calls,1);});
test('056 polling cannot starve encrypted snapshot persistence',async()=>{
 let writeCount=0,callback,scheduled=0;
 const {StartupSnapshot}=load('src/lib/startup-snapshot.ts',{}, {setTimeout:f=>{callback=f;return ++scheduled;},clearTimeout:()=>{}});
 const cache=new StartupSnapshot({read:async()=>null,write:async()=>{writeCount++;},remove:async()=>{}},'scope');
 for(let i=0;i<20;i++)cache.remember('/home',{i});assert.equal(scheduled,1);callback();await Promise.resolve();assert.equal(writeCount,1);await cache.clear();
});
test('056 all-message deletion in saved thread also prevents cached resurrection',async()=>{const r=reader(snapshot('empty'));r.history=async()=>({...snapshot('saved'),deleted_ids:['preserved']});const result=await openExistingChat(r,snapshot('saved',[message]));assert.equal(result.messages.length,0);assert.equal(result.recovery_pending,undefined);});
