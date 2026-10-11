'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./load-ts.cjs');
function clock(){let t=0,id=0;const timers=new Map();return {now:()=>t,setTimer:(f,ms)=>{timers.set(++id,{at:t+ms,f});return id;},clearTimer:k=>timers.delete(k),async advance(ms){const end=t+ms;for(let n=0;n<10000;n++){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){t=end;for(let i=0;i<10;i++)await Promise.resolve();return;}timers.delete(due[0]);t=due[1].at;due[1].f();for(let i=0;i<10;i++)await Promise.resolve();}throw Error('timer loop');}};}
function runtime(c){let tapLogs=0;const {createIdleWork}=load('src/lib/idle-work.ts');const w=createIdleWork({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer,quietMs:800,gapMs:50,startDelayMs:0});const f=load('src/lib/fluency.ts',{'./idle-work':{idleWork:w},'./fluency-metrics':{perfInput(){tapLogs++;},perfEvent(){},perfNow:c.now,perfSetMode(){},perfStart(){}}});return {w,f,tapLogs:()=>tapLogs};}
test('R7.1 native pager scroll keeps optional work quiet for a continuous three-second gesture',async()=>{
 const c=clock(),r=runtime(c),stub=require('./animated-stub.cjs')();const model=load('src/lib/menu-motion.ts',{'react-native':{Animated:stub.Animated},'./tab-navigation':load('src/lib/tab-navigation.ts')});
 const motion=model.createMenuMotion('home',r.f.noteFluencyMovement),ran=[];
 r.f.startFluency('new');r.w.enqueue({name:'optional',run:()=>{ran.push(c.now());}});
 for(let i=0;i<=30;i++){motion.onScroll({nativeEvent:{contentOffset:{x:i*10}}});if(i<30)await c.advance(100);}
 assert.deepEqual(ran,[]);assert.equal(motion.onScroll.nativeDriver,true,'keep native Animated graph');assert.equal(r.tapLogs(),0,'movement must not allocate per-frame tap logs');
 await c.advance(799);assert.deepEqual(ran,[]);await c.advance(1);assert.deepEqual(ran,[3800]);
});
test('R7.1 movement observer does not change the Antigo policy',()=>{const c=clock(),r=runtime(c);let calls=0;r.w.noteInput=()=>calls++;r.f.startFluency('old');for(let i=0;i<100;i++)r.f.noteFluencyMovement();assert.equal(calls,0);assert.equal(r.tapLogs(),0);});
test('R7.1 earliest overdue entry wins without eliminating minimum spacing',async()=>{
 const c=clock(),r=runtime(c),ran=[];r.f.startFluency('new');r.f.noteFluencyInput();
 r.w.enqueue({name:'without-deadline',priority:1,run:()=>{ran.push(['normal',c.now()]);}});
 r.w.enqueue({name:'later',priority:2,deadlineMs:200,run:()=>{ran.push(['later',c.now()]);}});
 r.w.enqueue({name:'earliest',priority:9,deadlineMs:100,run:()=>{ran.push(['earliest',c.now()]);}});
 await c.advance(250);assert.deepEqual(ran,[['earliest',100],['later',200]]);assert.ok(r.w.records().every(v=>v.forcedByDeadline));
});
test('R7.1 scrolling hooks retain native pager, page scroll position and chat pagination',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const app=read('App.tsx'),pager=read('src/components/TabPager.tsx'),motion=read('src/lib/menu-motion.ts');
 assert.ok(app.includes("createMenuMotion('home',noteFluencyMovement)"));assert.ok(pager.includes('onScroll={motion.onScroll}'));assert.ok(motion.includes('useNativeDriver:true,listener:onMovement'));
 for(const name of ['Workspace','Home','Agenda','Profile','Chat'])assert.ok(read('src/screens/'+name+'.tsx').includes('onScroll={noteFluencyMovement} scrollEventThrottle={100}'),name+' scroll must renew idle window');
 assert.ok(read('src/screens/Pages.tsx').includes('noteFluencyMovement();onScrollY(e.nativeEvent.contentOffset.y)'));
 assert.ok(read('src/screens/Chat.tsx').includes('noteFluencyMovement();chatScroll.onScroll(e);'));
 assert.ok(read('src/components/PageTreeList.tsx').includes('onScroll={noteFluencyMovement} scrollEventThrottle={100}'));
 const f=read('src/lib/fluency.ts');assert.ok(f.includes('noteFluencyMovement(){if(newFluency())idleWork.noteInput();}'));
});
