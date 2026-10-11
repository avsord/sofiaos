'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/background-notify.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
let defined=null;
const mocks={'expo-task-manager':{defineTask:(n,fn)=>{defined={n,fn};},isTaskRegisteredAsync:async()=>false},'expo-background-task':{BackgroundTaskResult:{Success:1,Failed:2},BackgroundTaskStatus:{Available:2},getStatusAsync:async()=>2,registerTaskAsync:async()=>{}},
 'expo-notifications':{},'expo-secure-store':{},'@react-native-async-storage/async-storage':{default:{}},'./startup-read-ahead':{AUTH_STORAGE_KEY:'k'}};
const m={exports:{}};vm.runInNewContext(code,{module:m,exports:m.exports,require:n=>mocks[n],process:{env:{}},JSON,Date,Promise,Array,String,Object});
const bg=m.exports;
function deps(items,{auth={token:'t',expires_at:'2099-01-01T00:00:00Z'},seen=null}={}){
 const store={},shown=[],calls=[];if(seen!==null)store['sofia.native.bg-notice-seen.v1']=JSON.stringify(seen);
 return {store,shown,calls,d:{auth:async()=>auth?JSON.stringify(auth):null,fetch:async(u,o)=>{calls.push([u,o.headers.Authorization]);return {ok:true,json:async()=>({items})};},get:async k=>store[k]??null,set:async(k,v)=>{store[k]=v;},notify:async n=>{shown.push(n);}}};
}
const n=(id,title,state='unread',at='2026-10-12T10:00:00Z')=>({id,title,body:'b',state,category:'email',created_at:at});

test('tarefa em segundo plano declarada no carregamento',()=>{assert.equal(defined.n,'sofia-notice-check');});
test('primeira vez só marca como visto, sem despejar avisos antigos',async()=>{
 const x=deps([n('1','A'),n('2','B')]);assert.equal(await bg.checkNoticesOnce(x.d),0);assert.equal(x.shown.length,0);
 assert.deepEqual(JSON.parse(x.store['sofia.native.bg-notice-seen.v1']),['1','2']);assert.equal(x.calls[0][1],'Bearer t');assert.match(x.calls[0][0],/\/api\/mobile\/notifications$/);
});
test('depois mostra só os novos não lidos, uma vez, e resume o excesso',async()=>{
 const x=deps([n('1','A'),n('3','C'),n('4','D','read'),...['5','6','7','8','9'].map(i=>n(i,'N'+i))],{seen:['1']});
 assert.equal(await bg.checkNoticesOnce(x.d),6);assert.equal(x.shown.length,5);assert.match(x.shown.at(-1).body,/E mais 2 avisos/);
 assert.equal(x.shown[0].data.sofiaServerNotice,true);
 x.shown.length=0;assert.equal(await bg.checkNoticesOnce(x.d),0);assert.equal(x.shown.length,0,'não repete');
});
test('sem login ou sessão vencida não chama o servidor',async()=>{
 const a=deps([],{auth:null});assert.equal(await bg.checkNoticesOnce(a.d),-1);assert.equal(a.calls.length,0);
 const b=deps([],{auth:{token:'t',expires_at:'2000-01-01T00:00:00Z'}});assert.equal(await bg.checkNoticesOnce(b.d),-1);assert.equal(b.calls.length,0);
});
