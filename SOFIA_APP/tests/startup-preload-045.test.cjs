'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exports_={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/lib/startup-preload.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exports_,Date,Map,Promise});
const {StartupReads,preloadStartup}=exports_;
test('startup read is shared, consumed once and invalidated on writes',async()=>{
 const cache=new StartupReads();let calls=0;const get=async()=>++calls;
 await cache.prime('tasks',get);assert.equal(await cache.read('tasks',get),1);assert.equal(calls,1);
 assert.equal(await cache.read('tasks',get),2);
 await cache.prime('tasks',get);cache.invalidate();assert.equal(await cache.read('tasks',get),4);
});
test('failed reads retry; invalidated in-flight reads cannot replace newer data',async()=>{
 const cache=new StartupReads();await assert.rejects(cache.prime('tasks',async()=>{throw Error('offline');}));assert.equal(await cache.read('tasks',async()=>7),7);
 let finish;const old=cache.prime('tasks',()=>new Promise(r=>{finish=r;}));cache.invalidate();await cache.prime('tasks',async()=>9);finish(1);await old;assert.equal(await cache.read('tasks',async()=>10),9);
});
test('startup prioritizes visible data and chat, then bounds secondary work to two entity workers',async()=>{
 const calls=[];let active=0,peak=0,release;
 const catalog=new Promise(r=>{release=r;});
 const api=Object.fromEntries(['home','tasks','library','dashboardWidgets','integrations','calendarStatus','ensureChat'].map(k=>[k,async()=>{calls.push(k);} ]));
 api.catalog=()=>catalog;api.entities=async kind=>{calls.push(kind);peak=Math.max(peak,++active);await Promise.resolve();active--;};
 const work=preloadStartup(api,async()=>{calls.push('agenda');});assert.equal(calls[0],'agenda');assert.ok(calls.includes('tasks'));assert.ok(calls.includes('ensureChat'));release({catalog:{user_page:{},film:{},capsule:{},note:{}}});await work;
 for(const kind of ['user_page','film','capsule','note'])assert.ok(calls.includes(kind));for(const name of ['library','integrations','calendarStatus'])assert.ok(calls.includes(name));assert.ok(peak<=2);
});
test('cold start is not followed by an unconditional second fetch of the same startup paths',()=>{
 const api=fs.readFileSync(require.resolve('../src/lib/api.ts'),'utf8');
 assert.ok(api.includes("const refresh=paths.filter(path=>this.snapshots.peek(path)!==undefined)"));
 assert.ok(api.includes("if(refresh.length)systemChanged(this)"));
 assert.ok(!api.includes("Array.from({length:3}"));
});
