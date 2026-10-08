const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs'),fs=require('node:fs'),path=require('node:path');
const {prepareLocalLaunch}=load('src/lib/local-launch.ts');
const profile={email:'owner@example.test',name:'Owner',role:'owner'};
const auth={token:'a'.repeat(43),profile};
const prefs={appearance:'dark'};
const next=()=>new Promise(r=>setTimeout(r,0));
test('057 auth, preferences and encrypted reads overlap; shell receives one ready account snapshot',async()=>{
 const events=[];let resolveAuth,resolvePrefs,resolveDisk;
 const snapshot={hydrate:()=>{events.push('disk');return new Promise(r=>resolveDisk=r);}};
 const work=prepareLocalLaunch(()=>{events.push('auth');return new Promise(r=>resolveAuth=r);},()=>{events.push('prefs');return new Promise(r=>resolvePrefs=r);},scope=>{assert.equal(scope,profile.email);return snapshot;});
 assert.deepEqual(events,['auth','prefs']);resolveAuth(auth);await next();assert.deepEqual(events,['auth','prefs','disk']);
 let done=false;work.then(()=>done=true);resolvePrefs(prefs);await next();assert.equal(done,false);resolveDisk();const actual=await work;
 assert.equal(actual.auth,auth);assert.equal(actual.snapshot,snapshot);assert.equal(actual.prefs,prefs);
});
test('057 no account never reads another account cache',async()=>{
 const result=await prepareLocalLaunch(async()=>null,async()=>prefs,()=>{throw Error('no account must mean no data');});
 assert.equal(result.auth,null);assert.equal(result.snapshot,null);
});
test('057 a transient session-storage error is propagated, not changed into an empty logged-out account',async()=>{
 await assert.rejects(prepareLocalLaunch(async()=>{throw Error('locked');},async()=>prefs,()=>{}),/locked/);
});
test('057 post-paint services wait for native Home confirmation, not two empty shell frames',async()=>{
 let resolve;const states=[],frames=[];let effect;
 const {useAfterFirstPaint}=load('src/lib/use-after-first-paint.ts',{'react':{useState:v=>[v,v=>states.push(v)],useEffect:f=>effect=f},'react-native':{NativeModules:{SofiaLaunch:{whenInteractive:()=>new Promise(r=>resolve=r)}}}},{requestAnimationFrame:f=>{frames.push(f);return frames.length;},cancelAnimationFrame(){}});
 useAfterFirstPaint(true);const cleanup=effect();assert.deepEqual(states,[false]);assert.equal(frames.length,0);
 resolve(true);await next();assert.equal(frames.length,1);assert.deepEqual(states,[false]);frames[0]();assert.deepEqual(states,[false,true]);cleanup();
});
test('057 unmount cancels the native startup fence without firing stale services',async()=>{
 let resolve,effect;const frames=[];const {useAfterFirstPaint}=load('src/lib/use-after-first-paint.ts',{'react':{useState:v=>[v,()=>{}],useEffect:f=>effect=f},'react-native':{NativeModules:{SofiaLaunch:{whenInteractive:()=>new Promise(r=>resolve=r)}}}},{requestAnimationFrame:f=>{frames.push(f);return 1;},cancelAnimationFrame(){}});
 useAfterFirstPaint(true);effect()();resolve(true);await next();assert.equal(frames.length,0);
});
test('057 no duplicate logo, timer or touch blocker is installed; process-to-data readiness is explicit',()=>{
 const native=fs.readFileSync(path.join(__dirname,'../plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 for(const absent of ['FrameLayout','root.addView','}, 5000)','SOFIA_LAUNCH_TIMEOUT'])assert.ok(!native.includes(absent),absent);
 for(const present of ['Process.getStartUptimeMillis()','sofia-home-data-ready','reportFullyDrawn()','whenInteractive'])assert.ok(native.includes(present),present);
 const app=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');assert.ok(app.includes('startup.snapshot||undefined'));assert.ok(!app.includes("from './src/lib/capsule-notifications'"));
});
