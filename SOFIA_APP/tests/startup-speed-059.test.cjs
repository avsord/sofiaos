'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs'),fs=require('node:fs'),path=require('node:path');
const file=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const disk=()=>{const m=new Map();return {m,read:async k=>m.get(k)||null,write:async(k,v)=>{m.set(k,v);},remove:async k=>{m.delete(k);}};};
test('059 early native session/preferences reads are issued synchronously and each consumed once',async()=>{
 const p=load('src/lib/startup-read-ahead.ts'),events=[];
 p.primeStartupReads(async()=>{events.push('auth');return 'saved';},async()=>{events.push('prefs');return 'dark';});
 assert.deepEqual(events,['auth','prefs']);
 p.primeStartupReads(async()=>{throw Error('duplicate');},async()=>{throw Error('duplicate');});
 assert.equal(await p.takeStartupAuth(async()=>{throw Error('duplicate');}),'saved');
 assert.equal(await p.takeStartupPrefs(async()=>{throw Error('duplicate');}),'dark');
 assert.equal(await p.takeStartupAuth(async()=>'fresh'),'fresh');
 assert.equal(await p.takeStartupPrefs(async()=>'light'),'light');
});
test('059 entrypoint launches both native reads before evaluating App; never awaits the disk',()=>{
 const events=[],Component=()=>{},p=load('src/lib/startup-read-ahead.ts');
 load('index.ts',{'expo':{registerRootComponent:C=>{assert.equal(C,Component);events.push('register');}},'./src/lib/startup-read-ahead':p,'expo-secure-store':{getItemAsync:key=>{assert.equal(key,p.AUTH_STORAGE_KEY);events.push('auth');return Promise.resolve(null);}},'@react-native-async-storage/async-storage':{default:{getItem:key=>{assert.equal(key,p.PREFS_STORAGE_KEY);events.push('prefs');return Promise.resolve(null);}}},'./App':Object.defineProperty({},'default',{get(){events.push('app');return Component;}})});
 assert.deepEqual(events,['auth','prefs','app','register']);
});
test('059 prefetch rejection remains a real error, and consumption permits retry',async()=>{
 const p=load('src/lib/startup-read-ahead.ts');p.primeStartupReads(()=>Promise.reject(Error('locked')),async()=>null);
 await assert.rejects(p.takeStartupAuth(async()=>null),/locked/);
 assert.equal(await p.takeStartupAuth(async()=>'retried'),'retried');
});
test('059 logout/account write invalidates even a still-pending previous-account read',async()=>{
 const p=load('src/lib/startup-read-ahead.ts');let resolve;
 p.primeStartupReads(()=>new Promise(r=>resolve=r),async()=>'old-prefs');
 p.invalidateStartupAuth();p.invalidateStartupPrefs();resolve('previous-account');
 assert.equal(await p.takeStartupAuth(async()=>null),null);
 assert.equal(await p.takeStartupPrefs(async()=>'new-prefs'),'new-prefs');
 const s=file('src/lib/api.ts');for(const marker of ['saveAuth(auth: Auth) { invalidateStartupAuth();','forgetAuth() { invalidateStartupAuth();','savePrefs(p: Prefs) { invalidateStartupPrefs();'])assert.ok(s.includes(marker),marker);
});
test('059 synchronous native failure does not stop preference prefetch or entrypoint registration',async()=>{
 const p=load('src/lib/startup-read-ahead.ts');let called=false;
 p.primeStartupReads(()=>{throw Error('native unavailable');},async()=>{called=true;return 'ok';});assert.equal(called,true);
 await assert.rejects(p.takeStartupAuth(async()=>null),/native unavailable/);assert.equal(await p.takeStartupPrefs(async()=>null),'ok');
});
function idleFixture(withIdle=true){
 const frames=[],idles=[],calls=[];let n=0;
 const globals={requestAnimationFrame:f=>{frames.push(f);return ++n;},cancelAnimationFrame(){},...(withIdle?{requestIdleCallback:f=>{idles.push(f);return ++n;},cancelIdleCallback(){}}:{})};
 const {scheduleIdleTask}=load('src/lib/idle-task.ts',{},globals);return{frames,idles,calls,start:()=>scheduleIdleTask(()=>calls.push('run'))};
}
test('059 optional update lookup yields two frames and then idle, without moving notification setup',()=>{
 const q=idleFixture();q.start();assert.equal(q.calls.length,0);q.frames.shift()();assert.equal(q.idles.length,0);q.frames.shift()();assert.equal(q.calls.length,0);q.idles.shift()();assert.deepEqual(q.calls,['run']);
 const app=file('App.tsx');assert.ok(app.includes('scheduleIdleTask(()=>void checkUpdate(false))'));assert.ok(file('src/components/BackgroundServices.tsx').includes('useAgendaNotifications(api,scope,enabled,onAgenda)'));
});
test('059 cleanup fences callbacks which were already queued',()=>{
 const q=idleFixture();const cancel=q.start();q.frames.shift()();q.frames.shift()();cancel();q.idles.shift()();assert.deepEqual(q.calls,[]);
});
test('059 platforms without idle callbacks retain a cancellable frame fallback',()=>{
 const q=idleFixture(false);q.start();q.frames.shift()();q.frames.shift()();q.frames.shift()();assert.deepEqual(q.calls,['run']);
});
test('059 speech module is loaded on use, not during application import; stopping voices still works',async()=>{
 const events=[];const speech=Object.defineProperty({},'stop',{get(){events.push('load-speech');return async()=>events.push('stop');}});
 const a=load('src/lib/audio-focus.ts',{'expo-speech':speech});assert.deepEqual(events,[]);
 a.registerVoice('a',()=>events.push('pause-a'));a.registerVoice('b',()=>events.push('pause-b'));await a.silenceVoices('b');assert.deepEqual(events,['pause-a','load-speech','stop']);
});
test('059 serialized snapshots preserve schema, priority, truncation and complete values exactly',async()=>{
 const d=disk(),{StartupSnapshot}=load('src/lib/startup-snapshot.ts');let at=100000;const s=new StartupSnapshot(d,'owner',()=>at),entries=[];
 for(let i=0;i<32;i++){const key=i===7?'/chat-sync/current':'/workspace/entities?offset=0&kind=kind'+i;const value={items:[{title:'ç😀"\\\n'+i,body:'x'.repeat(190000),fields:{keep:true}}]};s.remember(key,value);entries.push([key,{at:at++,value}]);}
 const priority=entries.sort((a,b)=>Number(b[0]==='/chat-sync/current')-Number(a[0]==='/chat-sync/current')||b[1].at-a[1].at).slice(0,32);
 let old=JSON.stringify({schema:1,entries:priority});while(old.length>4*1024*1024&&priority.length>1){priority.pop();old=JSON.stringify({schema:1,entries:priority});}
 await s.flush();assert.equal(d.m.get('owner'),old);await s.clear();
});
test('059 warmed writes do not reserialize every unchanged object',async()=>{
 let stringifies=0;const json={parse:JSON.parse,stringify:(...args)=>{stringifies++;return JSON.stringify(...args);}};
 const d=disk(),{StartupSnapshot}=load('src/lib/startup-snapshot.ts',{}, {JSON:json}),s=new StartupSnapshot(d,'owner',()=>100000);
 const value={items:[{name:'original',nested:{value:3}}]};s.remember('/tasks',value);value.items[0].nested.value=99;await s.flush();const first=d.m.get('owner');
 stringifies=0;await s.flush();assert.ok(stringifies<=2, `unchanged snapshots serialized ${stringifies} times`);assert.equal(d.m.get('owner'),first);assert.equal(JSON.parse(first).entries[0][1].value.items[0].nested.value,3);await s.clear();
});
test('059 old schema hydrates intact and explicit deletion cannot reuse cached serialization',async()=>{
 const d=disk(),{StartupSnapshot}=load('src/lib/startup-snapshot.ts');const old={schema:1,entries:[['/home',{at:100000,value:{name:'home'}}],['/chat-sync/current',{at:100000,value:{conversation:{id:'c'},messages:[{id:'m',content:'saved'}]}}]]};d.m.set('owner',JSON.stringify(old));
 const s=new StartupSnapshot(d,'owner',()=>100100);await s.hydrate();await s.flush();assert.equal(s.peek('/chat-sync/current').messages[0].content,'saved');s.forgetChat();await s.flush();assert.ok(!d.m.get('owner').includes('saved'));const fresh=new StartupSnapshot(d,'owner',()=>100100);await fresh.hydrate();assert.equal(fresh.peek('/chat-sync/current'),undefined);assert.equal(fresh.peek('/home').name,'home');await s.clear();await fresh.clear();
});

test('059 exposed cache references keep legacy mutable-view semantics across repeated flushes',async()=>{
 const d=disk(),{StartupSnapshot}=load('src/lib/startup-snapshot.ts'),s=new StartupSnapshot(d,'owner',()=>100000);s.remember('/home',{value:1});
 const visible=s.peek('/home');visible.value=2;await s.flush();assert.equal(JSON.parse(d.m.get('owner')).entries[0][1].value.value,2);
 visible.value=3;await s.flush();assert.equal(JSON.parse(d.m.get('owner')).entries[0][1].value.value,3);await s.clear();
});
