'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
function fixture(){
 const slots=[],idle=[];let cursor=0,layout=[],effects=[];
 const useState=initial=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];};
 const effect=(queue)=>(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){old?.cleanup?.();slots[i]={deps};queue.push(()=>{slots[i].cleanup=fn();});}};
 const react={useState,useLayoutEffect:(...args)=>effect(layout)(...args),useEffect:(...args)=>effect(effects)(...args)};
 const {useStartupMounts}=load('src/lib/startup-mounts.ts',{react,'./idle-task':{scheduleIdleTask:run=>{const task={run,cancelled:false};idle.push(task);return()=>{task.cancelled=true;};}}});
 return {idle,render(active,enabled=true){cursor=0;layout=[];effects=[];const tabs=useStartupMounts(enabled,active);layout.forEach(fn=>fn());effects.forEach(fn=>fn());return tabs;}};
}
test('a menu selected before idle warmup stays mounted when leaving and returning',()=>{
 const f=fixture();assert.deepEqual([...f.render('home')],['home']);
 assert.ok(f.render('pages').has('pages'));
 assert.ok(f.render('chat').has('pages'),'visited Pages must not be unmounted');
 for(let i=0;i<50;i++)for(const tab of ['profile','agenda','pages','apps','chat'])assert.ok(f.render(tab).has('pages'));
 assert.equal(f.render('home').size,6);
});
test('home does not synchronously mount unvisited screens and logout resets their trees',()=>{
 const f=fixture();assert.equal(f.render('home').size,1);
 f.render('chat');assert.equal(f.render('home').size,2);
 f.render('home',false);assert.equal(f.render('home',false).size,1);
 assert.ok(f.idle[0].cancelled);
});
