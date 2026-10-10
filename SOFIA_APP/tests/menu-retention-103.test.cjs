'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
function fixture(){
 const slots=[],frames=[];let cursor=0,layout=[],effects=[],nextId=0;
 const useState=initial=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];};
 const effect=(queue)=>(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){old?.cleanup?.();slots[i]={deps};queue.push(()=>{slots[i].cleanup=fn();});}};
 const react={useState,useLayoutEffect:(...args)=>effect(layout)(...args),useEffect:(...args)=>effect(effects)(...args)};
 const raf={requestAnimationFrame:run=>{const task={id:++nextId,run,cancelled:false};frames.push(task);return task.id;},cancelAnimationFrame:id=>{const task=frames.find(x=>x.id===id);if(task)task.cancelled=true;}};
 const {useStartupMounts}=load('src/lib/startup-mounts.ts',{react},raf);
 return {frames,flush(){const step=frames.find(x=>!x.done&&!x.cancelled);if(!step)return false;step.done=true;step.run();return true;},render(active,enabled=true){cursor=0;layout=[];effects=[];const tabs=useStartupMounts(enabled,active);layout.forEach(fn=>fn());effects.forEach(fn=>fn());return tabs;}};
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
 assert.ok(f.frames[0].cancelled);
});

test('warmup starts only after visibility and prepares all five tabs in six frames',()=>{
 const f=fixture();
 assert.deepEqual([...f.render('home',false)],['home']);
 assert.equal(f.frames.length,0,'no prewarm while the system splash is visible');
 assert.deepEqual([...f.render('home',true)],['home']);
 assert.equal(f.frames.length,1);
 f.flush();assert.deepEqual([...f.render('home',true)],['home'],'first visible frame is reserved for Home');
 const expected=['chat','agenda','pages','apps','profile'];
 for(let i=0;i<expected.length;i++){
  assert.ok(f.flush(),'warm frame missing for '+expected[i]);
  assert.deepEqual([...f.render('home',true)],['home',...expected.slice(0,i+1)]);
 }
 assert.equal(f.frames.filter(x=>x.done).length,6);
 assert.equal(f.flush(),false,'no repeated idle delay or unbounded warmup');
});

test('selected screen mounts instantly ahead of warmup and is retained',()=>{
 const f=fixture();f.render('home',true);
 assert.ok(f.render('profile',true).has('profile'));
 f.flush();f.render('profile',true);f.flush();
 assert.ok(f.render('home',true).has('profile'),'an early selected tab survives subsequent warm ticks');
 for(let i=0;i<10;i++)if(f.flush())f.render('home',true);
 assert.equal(f.render('home',true).size,6);
});

test('logout cancels pending frames without remounting hidden account screens',()=>{
 const f=fixture();f.render('home',true);f.flush();f.render('home',true);
 f.flush();assert.ok(f.render('home',true).has('chat'));
 f.render('home',false);
 assert.deepEqual([...f.render('home',false)],['home']);
 const unrun=f.frames.filter(x=>!x.done);
 assert.ok(unrun.every(x=>x.cancelled));
 for(const task of unrun)task.run();
 assert.deepEqual([...f.render('home',false)],['home'],'cancelled callbacks cannot resurrect prior account tabs');
});
