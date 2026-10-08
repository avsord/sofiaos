'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs'),fs=require('node:fs'),path=require('node:path');
const snapshot=load('src/lib/startup-snapshot.ts');
const {readHomeRows}=load('src/lib/home-rows.ts');
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const disk=()=>{const map=new Map();return {map,read:async key=>map.get(key)||null,write:async(key,value)=>{map.set(key,value);},remove:async key=>{map.delete(key);}};};
const task=id=>({id,title:id,state:'todo',revision:1});
const home={tasks:[task('a'),task('b')],today_tasks:[task('a')],profile:{name:'Saved'},notifications:[]};
function seed(s){s.remember('/home',home);s.remember('/tasks',{items:home.tasks});s.remember('/agenda?month=2026-10',{items:[{id:'event',kind:'commitment',data:{},title:'Saved event'}]});s.remember('/chat-sync/current',{conversation:{id:'chat'},messages:[{id:'m',content:'Saved'}]});}
function apiFixture(s,handler){
 const {SofiaApi}=load('src/lib/api.ts',{
  './startup-snapshot':snapshot,'./encrypted-storage':{encryptedStorage:disk()},'./startup-preload':load('src/lib/startup-preload.ts'),
  './theme-schedule':{themeTimes:()=>({})},'./agenda-events':{agendaChanged(){}},'./system-events':{systemChanged(){}},
  './chat-model':load('src/lib/chat-model.ts'),'./legacy-md':{LegacyMdAdapter:class{}},'expo-secure-store':{},'@react-native-async-storage/async-storage':{default:{}}
 },{process:{env:{}},AbortController,fetch:async(url,options)=>{const answer=await handler(new URL(url).pathname.replace('/api/mobile',''),options);return{ok:answer.status!==500,status:answer.status||200,json:async()=>answer.body};}});
 return new SofiaApi('token',()=>{},'owner',s);
}
test('060 saved tasks publish before a pending home network summary',async()=>{
 let finishHome;const seen=[];
 const loading=readHomeRows({home:()=>new Promise(r=>finishHome=r),tasks:async()=>({items:[task('local')]})},()=>seen.push('home'),rows=>seen.push(rows[0].id));
 await tick();assert.deepEqual(seen,['local']);finishHome(home);await loading;assert.deepEqual(seen,['local','home']);
 assert.ok(file('src/screens/Home.tsx').includes('readHomeRows(api,'));
});
test('060 a failed home summary cannot hide successfully loaded tasks',async()=>{
 let rows;const results=await readHomeRows({home:async()=>{throw Error('offline');},tasks:async()=>({items:[task('local')]})},()=>{},value=>rows=value);
 assert.equal(rows[0].id,'local');assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');
});
test('060 a failed task read is never fabricated as a confirmed empty list',async()=>{
 let tasksSeen=false,homeSeen=false;
 const results=await readHomeRows({home:async()=>home,tasks:async()=>{throw Error('offline');}},()=>homeSeen=true,()=>tasksSeen=true);
 assert.equal(homeSeen,true);assert.equal(tasksSeen,false);assert.equal(results[1].status,'rejected');
});
test('060 opening 50 history/detail windows cannot evict the next Home/Tasks/Agenda reads',async()=>{
 const d=disk();let now=10000;const s=new snapshot.StartupSnapshot(d,'owner',()=>now);seed(s);
 s.remember('/workspace/catalog',{catalog:{}});s.remember('/md/dashboard',{widgets:['tasks']});
 for(let i=0;i<50;i++){now++;s.remember('/conversations/history'+i,{messages:[{id:String(i)}]});}
 await s.flush();const restored=new snapshot.StartupSnapshot(d,'owner',()=>now);await restored.hydrate();
 for(const key of ['/home','/tasks','/workspace/catalog','/md/dashboard','/agenda?month=2026-10','/chat-sync/current'])assert.ok(restored.peek(key),key);
 assert.equal(JSON.parse(d.map.get('owner')).schema,1);assert.ok(JSON.parse(d.map.get('owner')).entries.length<=32);await s.clear();await restored.clear();
});
test('060 a confirmed task deletion preserves unrelated startup data and the original read timestamp',async()=>{
 const d=disk();let now=10000;const s=new snapshot.StartupSnapshot(d,'owner',()=>now);seed(s);now++;
 s.deleteRecord('task','a');await s.flush();
 const rows=JSON.parse(d.map.get('owner')).entries;assert.equal(rows.find(([key])=>key==='/tasks')[1].at,10000);
 const next=new snapshot.StartupSnapshot(d,'owner',()=>now);await next.hydrate();assert.deepEqual(Array.from(next.peek('/tasks').items,t=>t.id),['b']);
 assert.equal(next.peek('/home').today_tasks.length,0);assert.equal(next.peek('/agenda?month=2026-10').items[0].id,'event');assert.equal(next.peek('/chat-sync/current').messages[0].content,'Saved');await s.clear();await next.clear();
});
test('060 confirmed entity deletion reconciles the saved agenda without clearing tasks or history',async()=>{
 const d=disk(),s=new snapshot.StartupSnapshot(d,'owner',()=>10000);seed(s);s.remember('/workspace/entities?kind=commitment&offset=0',{items:[{id:'event',kind:'commitment'},{id:'other'}]});
 s.deleteRecord('entity','event');assert.equal(s.peek('/agenda?month=2026-10').items.length,0);assert.equal(s.peek('/workspace/entities?kind=commitment&offset=0').items[0].id,'other');assert.equal(s.peek('/tasks').items.length,2);assert.equal(s.peek('/chat-sync/current').messages.length,1);await s.clear();
});
test('060 deleting a page invalidates its hierarchy listing, not the startup agenda',async()=>{
 const d=disk(),s=new snapshot.StartupSnapshot(d,'owner',()=>10000);seed(s);s.remember('/workspace/entities?kind=user_page&offset=0',{items:[{id:'p',kind:'user_page'},{id:'child',kind:'user_page',data:{parent_id:'p'}}]});
 s.deleteRecord('entity','p');assert.equal(s.peek('/workspace/entities?kind=user_page&offset=0'),undefined);assert.equal(s.peek('/agenda?month=2026-10').items.length,1);assert.equal(s.peek('/tasks').items.length,2);await s.clear();
});
test('060 failed API deletion preserves every local record; successful deletion persists only its own change',async()=>{
 const d=disk(),s=new snapshot.StartupSnapshot(d,'owner');seed(s);await s.flush();const before=d.map.get('owner');let fail=true;
 const api=apiFixture(s,async()=>({status:fail?500:200,body:fail?{error:'failed'}:{ok:true}}));
 await assert.rejects(api.deleteTask('a'));await s.flush();assert.equal(d.map.get('owner'),before);
 fail=false;await api.deleteTask('a');const next=new snapshot.StartupSnapshot(d,'owner');await next.hydrate();assert.deepEqual(Array.from(next.peek('/tasks').items,t=>t.id),['b']);assert.equal(next.peek('/agenda?month=2026-10').items.length,1);assert.equal(next.peek('/chat-sync/current').messages.length,1);await s.clear();await next.clear();
});
test('060 reads started during an acknowledged deletion cannot restore that record in the next-launch snapshot',async()=>{
 const d=disk(),s=new snapshot.StartupSnapshot(d,'owner');seed(s);let completeDelete,completeRead;
 const api=apiFixture(s,async(_p,options)=>options.method==='DELETE'?new Promise(r=>completeDelete=r):new Promise(r=>completeRead=r));
 const deletion=api.deleteTask('a');await tick();const oldRead=api.tasks();await tick();
 completeDelete({body:{ok:true}});await deletion;completeRead({body:{items:home.tasks}});await oldRead;
 assert.deepEqual(Array.from(api.cached('/tasks').items,t=>t.id),['b']);await s.clear();
});
function visibilityFixture(withNative=true){
 const states=[],effects=[],frames=[];let resolve;
 const {useLaunchVisible}=load('src/lib/use-launch-visible.ts',{'react':{useState:initial=>[initial,value=>states.push(value)],useEffect:fn=>effects.push(fn)},'react-native':{NativeModules:withNative?{SofiaLaunch:{whenRevealed:()=>new Promise(r=>resolve=r)}}:{}}},{requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){}});
 useLaunchVisible(true);const dispose=effects.shift()();return{states,frames,dispose,resolve:ok=>resolve(ok)};
}
test('060 optional services do not start at layout permission, only at completed visual handoff',async()=>{
 const f=visibilityFixture();assert.deepEqual(f.states,[false]);f.resolve(true);await tick();assert.deepEqual(f.states,[false,true]);f.dispose();
 const app=file('App.tsx');assert.ok(app.includes('servicesReady=visible&&'));assert.ok(app.includes('if(painted)api.releaseNetwork()'));assert.ok(app.includes('useStartupMounts(servicesReady,tab)'));assert.ok(app.includes('{visible?<DeferredScreen load={loadBackgroundServices}')); 
});
test('060 unmount or launch failure cannot release stale optional services',async()=>{
 for(const cancel of [true,false]){const f=visibilityFixture();if(cancel)f.dispose();f.resolve(!cancel?false:true);await tick();assert.deepEqual(f.states,[false]);}
});
test('060 old platforms without the visibility bridge keep a cancellable fallback',async()=>{
 const f=visibilityFixture(false);assert.deepEqual(f.states,[false]);f.frames.shift()();f.frames.shift()();assert.deepEqual(f.states,[false,true]);f.dispose();
});
test('063 ready content exits directly while readiness still includes the next display frame',()=>{
 const native=file('plugins/native/SofiaLaunchOverlay.kt');
 for(const token of ['fun whenRevealed','SOFIA_LAUNCH_${stage}_PROCESS_MS=','record(activity, "LOCAL_READY")','record(activity, "SPLASH_REMOVED")'])assert.ok(native.includes(token),token);
 assert.ok(native.includes('splash.remove(); removeSystemSplash = null'));
 for(const absent of ['root.addView','Thread.sleep','.translationY(','.animate()', 'content.alpha = 0f','EXIT_FADE_MS'])assert.ok(!native.includes(absent),absent);
 const completion=native.slice(native.indexOf('private fun completeReveal'),native.indexOf('private fun reveal'));
 assert.ok(completion.indexOf('postOnAnimation')<completion.indexOf('visible = true'));
 assert.ok(completion.indexOf('visible = true')<completion.indexOf('record(activity, if (success) "DATA"'));
});
