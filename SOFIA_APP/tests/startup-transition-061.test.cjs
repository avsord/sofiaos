'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
test('061 actual native transition handles early/late splash without premature readiness',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-transition-'));
 try{
  const app=path.join(__dirname,'..');
  cp.execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',tmp,path.join(app,'plugins/native/SofiaLaunchTransition.java'),path.join(__dirname,'native/SofiaLaunchTransitionTest.java')],{stdio:'pipe'});
  const result=cp.execFileSync('java',['-cp',tmp,'com.avsord.sofiaapp.SofiaLaunchTransitionTest'],{encoding:'utf8'});
  assert.match(result,/PASS: actual production transition/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('061 current-month data is available before reveal; adjacent-month network waits',async()=>{
 const load=require('./load-ts.cjs'),effects=[],requests=[];
 const agenda=load('src/lib/agenda-cache.ts');
 const module=load('src/lib/use-agenda-month.ts',{
  react:{useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useState:()=>[0,()=>{}]},
  'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
  './agenda-cache':agenda,'./agenda-events':{subscribeAgenda:()=>()=>{}},
  './system-events':{subscribeSystemChanged:()=>()=>{}}
 });
 const now=new Date(),key=agenda.monthKey(now),api={cached:()=>undefined,agenda:async month=>{requests.push(month);return {items:[{id:'saved-event'}]};}};
 module.useAgendaMonth(api,now,true,false);let clean=effects.splice(0).map(fn=>fn());
 await new Promise(r=>setImmediate(r));
 assert.deepEqual(requests,[key]);
 assert.equal(module.cacheFor(api).snapshot(key).items[0].id,'saved-event');
 assert.ok(module.cacheFor(api).snapshot(key).loadedAt>0);
 clean.forEach(fn=>fn());
 module.useAgendaMonth(api,now,true,true);clean=effects.splice(0).map(fn=>fn());
 await new Promise(r=>setImmediate(r));
 assert.equal(requests.length,3);assert.equal(new Set(requests).size,3);
 clean.forEach(fn=>fn());
});
