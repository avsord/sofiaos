'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
function fixture(){
 const slots=[],frames=[],timers=[];let cursor=0,layout=[],effects=[],nextId=0,now=0;
 const useState=initial=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];};
 const useRef=initial=>{const i=cursor++;return slots[i]||(slots[i]={current:initial});};
 const effect=(queue)=>(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){old?.cleanup?.();slots[i]={deps};queue.push(()=>{slots[i].cleanup=fn();});}};
 const react={useRef,useState,useLayoutEffect:(...args)=>effect(layout)(...args),useEffect:(...args)=>effect(effects)(...args)};
 const raf={requestAnimationFrame:run=>{const task={id:++nextId,run,cancelled:false};frames.push(task);return task.id;},cancelAnimationFrame:id=>{const task=frames.find(x=>x.id===id);if(task)task.cancelled=true;},
  setTimeout:(run,delay)=>{const task={id:++nextId,run,at:now+delay,cancelled:false};timers.push(task);return task.id;},
  clearTimeout:id=>{const task=timers.find(x=>x.id===id);if(task)task.cancelled=true;}};
 const {useStartupMounts}=load('src/lib/startup-mounts.ts',{react},raf);
 return {frames,timers,flush(){const task=frames.find(x=>!x.done&&!x.cancelled);if(!task)return false;task.done=true;task.run();return true;},
  advance(ms){now+=ms;for(const t of timers.filter(x=>!x.done&&!x.cancelled&&x.at<=now)){t.done=true;t.run();}},
  render(active,enabled=true,authenticated=true){cursor=0;layout=[];effects=[];const tabs=useStartupMounts(enabled,active,authenticated);layout.forEach(fn=>fn());effects.forEach(fn=>fn());return tabs;}};
}
test('a menu selected before warmup stays mounted when leaving and returning',()=>{
 const f=fixture();assert.deepEqual([...f.render('home')],['home']);
 assert.ok(f.render('pages').has('pages'));
 assert.ok(f.render('chat').has('pages'),'visited Pages must not be unmounted');
 for(let i=0;i<50;i++)for(const tab of ['profile','agenda','pages','apps','chat'])assert.ok(f.render(tab).has('pages'));
 assert.equal(f.render('home').size,6);
});
test('Home mounts without hidden tabs and logout clears archived account trees',()=>{
 const f=fixture();assert.equal(f.render('home',false).size,1);
 f.render('pages',false);assert.equal(f.render('home',false).size,2,'Visited Pages must survive hydration gate');
 f.render('home',false,false);assert.equal(f.render('home',false,false).size,1);
 assert.equal(f.frames.filter(x=>!x.cancelled&&!x.done).length,0);
});
test('warmup starts only after hydration and mounts one tab per frame',()=>{
 const f=fixture();assert.deepEqual([...f.render('home',false)],['home']);
 assert.equal(f.frames.length,0);
 assert.deepEqual([...f.render('home',true)],['home']);assert.equal(f.frames.length,1);
 f.flush();assert.deepEqual([...f.render('home',true)],['home']);
 const expected=['chat','pages','agenda','apps','profile'];
 for(let i=0;i<expected.length;i++){assert.ok(f.flush());assert.deepEqual([...f.render('home',true)],['home',...expected.slice(0,i+1)]);}
 assert.equal(f.flush(),false);
});
test('user touches cancel queued warming immediately and resume only 500ms after last tab change',()=>{
 const f=fixture();f.render('home',true);f.flush(); // initial free Home frame
 assert.equal(f.render('pages',true).has('pages'),true); // prioritized actual touch
 assert.ok(f.frames.some(x=>x.cancelled),'original warm frame must cancel');
 f.advance(499);assert.equal(f.frames.filter(x=>!x.done&&!x.cancelled).length,0);
 assert.ok(f.render('chat',true).has('pages')); // rapid second touch resets idle window
 f.advance(499);assert.equal(f.frames.filter(x=>!x.done&&!x.cancelled).length,0);
 f.advance(1);assert.ok(f.frames.some(x=>!x.done&&!x.cancelled));
 assert.ok(f.flush());assert.ok(f.flush()); // free first frame then warm one tab
 assert.ok(f.render('chat',true).has('pages'),'prioritized Pages stays mounted');
});
test('logout cancels pending frame and timers; stale callbacks cannot resurrect any account screen',()=>{
 const f=fixture();f.render('home',true);f.render('pages',true);
 f.render('home',false,false);assert.deepEqual([...f.render('home',false,false)],['home']);
 for(const task of f.frames.filter(x=>!x.done))task.run();
 for(const task of f.timers.filter(x=>!x.done))task.run();
 assert.deepEqual([...f.render('home',false,false)],['home']);
});
