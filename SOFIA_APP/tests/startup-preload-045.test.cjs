'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function compile(file){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:out,Date,Map,Promise});return out;}
const {StartupReads,preloadStartup}=compile('../src/lib/startup-preload.ts');
const {fastBootstrap,authWithBootstrap}=compile('../src/lib/fast-bootstrap.ts');
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
test('secure session yields an immediate conservative bootstrap before server or encrypted cache',()=>{
 const auth={token:'a'.repeat(43),token_type:'Bearer',expires_at:'2030-01-01T00:00:00Z',profile:{name:'Pedro Silva',email:'owner@test.invalid',role:'owner'}};
 const first=fastBootstrap(auth);assert.equal(first.profile.name,'Pedro Silva');assert.equal(first.capabilities.text,true);assert.equal(first.capabilities.workspace,true);assert.equal(first.limits.audio_bytes,64*1024*1024);assert.equal(first.limits.audio_seconds,0);assert.equal(first.limits.text_chars,0);
 const live={...first,version:'server-200',limits:{audio_bytes:7,audio_seconds:8,text_chars:9}};
 const stored=authWithBootstrap(auth,live);assert.equal(stored.token,auth.token);assert.equal(fastBootstrap(stored).version,'server-200');assert.deepEqual(fastBootstrap(stored).limits,live.limits);
 const wrong={...stored,startup:{...live,profile:{...live.profile,email:'other@test.invalid'}}};assert.equal(fastBootstrap(wrong).version,'startup');
});
