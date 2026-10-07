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
test('agenda starts immediately without tab selection; all catalog categories preload with bounded concurrency',async()=>{
 const calls=[];let active=0,peak=0,release;
 const catalog=new Promise(r=>{release=r;});
 const api=Object.fromEntries(['home','tasks','library','dashboardWidgets','integrations','calendarStatus'].map(k=>[k,async()=>{calls.push(k);} ]));
 api.catalog=()=>catalog;api.entities=async kind=>{calls.push(kind);peak=Math.max(peak,++active);await Promise.resolve();active--;};
 const work=preloadStartup(api,async()=>{calls.push('agenda');});assert.equal(calls[0],'agenda');assert.ok(calls.includes('tasks'));release({catalog:{user_page:{},film:{},capsule:{},note:{}}});await work;
 for(const kind of ['user_page','film','capsule','note'])assert.ok(calls.includes(kind));assert.ok(peak<=3);
});
