'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createIdleWork}=require('./load-ts.cjs')('src/lib/idle-work.ts');
function clock(){
 let time=0,sequence=0;const timers=new Map();
 return {now:()=>time,setTimer:(fn,ms)=>{const id=++sequence;timers.set(id,{at:time+ms,fn});return id;},clearTimer:id=>timers.delete(id),
  async advance(ms){
   const until=time+ms;for(let i=0;i<20;i++)await Promise.resolve();
   let guard=0;
   while(true){let next;for(const pair of timers)if(pair[1].at<=until&&(!next||pair[1].at<next[1].at))next=pair;
    if(!next)break;if(++guard>10000)throw Error('Non-terminating timer loop');
    timers.delete(next[0]);time=next[1].at;next[1].fn();for(let i=0;i<20;i++)await Promise.resolve();
   }time=until;for(let i=0;i<20;i++)await Promise.resolve();
  }};
}
const make=c=>createIdleWork({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer,quietMs:800,gapMs:50,startDelayMs:0});
test('R7 extra: enqueue durante a folga nao adianta o proximo trabalho',async()=>{
 const c=clock(),w=make(c),calls=[];
 w.enqueue({name:'a',run:()=>{calls.push(['a',c.now()]);}});
 w.enqueue({name:'b',run:()=>{calls.push(['b',c.now()]);}});w.start();await c.advance(10);
 w.enqueue({name:'c',run:()=>{calls.push(['c',c.now()]);}});
 await c.advance(200);assert.deepEqual(calls,[['a',0],['b',50],['c',100]]);
});
test('R7 extra: a folga permanece mesmo quando a fila ficou vazia',async()=>{
 const c=clock(),w=make(c),calls=[];w.start();
 w.enqueue({name:'a',run:()=>{calls.push(c.now());}});await c.advance(10);
 w.enqueue({name:'b',run:()=>{calls.push(c.now());}});await c.advance(100);
 assert.deepEqual(calls,[0,50]);
});
test('R7 extra: um prazo vencido nao elimina o intervalo minimo de folga',async()=>{
 const c=clock(),w=make(c),calls=[];w.start();
 w.enqueue({name:'a',run:()=>{calls.push(c.now());}});await c.advance(10);w.noteInput();
 w.enqueue({name:'b',deadlineMs:0,run:()=>{calls.push(c.now());}});await c.advance(100);
 assert.deepEqual(calls,[0,50]);assert.equal(w.records()[1].forcedByDeadline,true);
});
test('R7 extra: deadline de tarefa menos prioritaria nao fica bloqueado pela cabeca da fila',async()=>{
 const c=clock(),w=make(c),calls=[];w.start();w.noteInput();
 w.enqueue({name:'sem-prazo',priority:1,run:()=>{calls.push(['sem-prazo',c.now()]);}});
 w.enqueue({name:'com-prazo',priority:9,deadlineMs:100,run:()=>{calls.push(['com-prazo',c.now()]);}});
 await c.advance(150);assert.deepEqual(calls,[['com-prazo',100]]);
 assert.equal(w.records()[0].forcedByDeadline,true);
});
test('R7 extra: enqueue apos completar promise respeita a folga desde o termino',async()=>{
 const c=clock(),w=make(c),calls=[];let release;
 w.enqueue({name:'io',run:()=>new Promise(r=>{release=r;})});w.start();await c.advance(200);
 release();await c.advance(10);w.enqueue({name:'a',run:()=>{calls.push(c.now());}});
 await c.advance(100);assert.deepEqual(calls,[250]);
});
test('R7 extra: deadline nunca antecipa startDelayMs',async()=>{
 const c=clock(),calls=[],w=createIdleWork({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer,startDelayMs:300});
 w.enqueue({name:'t',deadlineMs:0,run:()=>{calls.push(c.now());}});w.start();w.noteInput();
 await c.advance(299);assert.deepEqual(calls,[]);await c.advance(1);assert.deepEqual(calls,[300]);
});
test('R7 extra: novo start nao reinicia o relogio do agendador',async()=>{
 const c=clock(),w=make(c),calls=[];w.start();await c.advance(1000);w.start();
 w.enqueue({name:'t',run:()=>{calls.push(c.now());}});await c.advance(0);
 assert.deepEqual(calls,[1000]);assert.equal(w.records()[0].startedAtMs,1000);
});
test('R7 extra: tarefas lancadas por uma tarefa nao sao executadas no mesmo instante',async()=>{
 const c=clock(),w=make(c),calls=[];
 w.enqueue({name:'a',run:()=>{calls.push(c.now());w.enqueue({name:'b',run:()=>{calls.push(c.now());}});}});
 w.start();await c.advance(100);assert.deepEqual(calls,[0,50]);
});
