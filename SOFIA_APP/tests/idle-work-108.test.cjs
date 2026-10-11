const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const {createIdleWork}=load('src/lib/idle-work.ts');

/** Relógio e timers falsos: avançar o tempo dispara os timers vencidos em ordem. */
function fakeClock(){
 let t=0,id=0;const timers=new Map();
 return {
  now:()=>t,
  setTimer:(fn,ms)=>{const k=++id;timers.set(k,{at:t+ms,fn});return k;},
  clearTimer:k=>timers.delete(k),
  tick(ms){t+=ms;}, // avança o relógio sem disparar timers (trabalho síncrono dentro de uma tarefa)
  async advance(ms){
   const end=t+ms;
   for(let i=0;i<20;i++)await Promise.resolve(); // deixa promessas pendentes terminarem antes
   for(;;){
    let next=null;for(const [k,v] of timers)if(v.at<=end&&(!next||v.at<next[1].at))next=[k,v];
    if(!next)break;
    timers.delete(next[0]);t=next[1].at;next[1].fn();
    for(let i=0;i<20;i++)await Promise.resolve();
   }
   t=end;for(let i=0;i<20;i++)await Promise.resolve();
  },
 };
}
const make=(c,o={})=>createIdleWork({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer,quietMs:800,gapMs:50,startDelayMs:300,...o});

test('nada roda antes do start() nem antes do atraso inicial',async()=>{
 const c=fakeClock(),w=make(c),ran=[];
 w.enqueue({name:'a',run:()=>ran.push('a')});
 await c.advance(5000);assert.deepEqual(ran,[],'antes do reveal');
 w.start();await c.advance(299);assert.deepEqual(ran,[],'antes de startDelayMs');
 await c.advance(1);assert.deepEqual(ran,['a']);
});

test('toque recente adia a tarefa até 800 ms de silêncio',async()=>{
 const c=fakeClock(),w=make(c,{startDelayMs:0}),ran=[];
 w.start();w.noteInput();
 w.enqueue({name:'hidratar',run:()=>ran.push(c.now())});
 await c.advance(500);w.noteInput(); // usuário continua tocando
 await c.advance(799);assert.deepEqual(ran,[]);
 await c.advance(1);assert.deepEqual(ran,[1300],'roda exatamente 800 ms após o último toque');
});

test('uma tarefa por vez, com folga entre elas, por prioridade e depois ordem',async()=>{
 const c=fakeClock(),w=make(c,{startDelayMs:0}),ran=[];
 w.enqueue({name:'baixa',priority:9,run:()=>ran.push(['baixa',c.now()])});
 w.enqueue({name:'alta1',priority:1,run:()=>ran.push(['alta1',c.now()])});
 w.enqueue({name:'alta2',priority:1,run:()=>ran.push(['alta2',c.now()])});
 w.start();await c.advance(1000);
 assert.deepEqual(ran,[['alta1',0],['alta2',50],['baixa',100]]);
});

test('toque no meio da fila pausa o restante',async()=>{
 const c=fakeClock(),w=make(c,{startDelayMs:0}),ran=[];
 for(const n of ['a','b','c'])w.enqueue({name:n,run:()=>ran.push([n,c.now()])});
 w.start();await c.advance(10);
 assert.deepEqual(ran,[['a',0]]);
 w.noteInput(); // toque aos 10 ms
 await c.advance(2000);
 assert.deepEqual(ran.map(r=>r[0]),['a','b','c']);
 assert.equal(ran[1][1],810,'b só depois de 800 ms do toque');
});

test('prazo: tarefa roda mesmo com usuário ativo depois do deadline',async()=>{
 const c=fakeClock(),w=make(c,{startDelayMs:0}),ran=[];
 w.start();
 w.enqueue({name:'hidratar',deadlineMs:3000,run:()=>ran.push(c.now())});
 for(let i=0;i<40;i++){w.noteInput();await c.advance(100);} // toques sem parar por 4 s
 assert.deepEqual(ran,[3000]);
 assert.equal(w.records()[0].forcedByDeadline,true);
});

test('tarefa assíncrona: a próxima espera ela terminar',async()=>{
 const c=fakeClock(),w=make(c,{startDelayMs:0}),log=[];
 let release;const gate=new Promise(r=>{release=r;});
 w.enqueue({name:'lenta',run:async()=>{log.push('lenta-inicio');await gate;log.push('lenta-fim');}});
 w.enqueue({name:'proxima',run:()=>log.push('proxima')});
 w.start();await c.advance(500);
 assert.deepEqual(log,['lenta-inicio']);
 release();await c.advance(100);
 assert.deepEqual(log,['lenta-inicio','lenta-fim','proxima']);
});

test('erro numa tarefa não derruba a fila e fica registrado',async()=>{
 const c=fakeClock(),w=make(c,{startDelayMs:0}),ran=[];
 w.enqueue({name:'quebra',run:()=>{throw new Error('falhou');}});
 w.enqueue({name:'segue',run:()=>ran.push('segue')});
 w.start();await c.advance(500);
 assert.deepEqual(ran,['segue']);
 assert.equal(w.records()[0].error,'falhou');
});

test('mesmo nome substitui a tarefa pendente; cancel e dispose',async()=>{
 const c=fakeClock(),w=make(c,{startDelayMs:0}),ran=[];
 w.enqueue({name:'pre-busca',run:()=>ran.push('v1')});
 w.enqueue({name:'pre-busca',run:()=>ran.push('v2')});
 w.enqueue({name:'cancelada',run:()=>ran.push('x')});
 w.cancel('cancelada');
 assert.deepEqual(Array.from(w.pending()),['pre-busca']);
 w.start();await c.advance(500);
 assert.deepEqual(ran,['v2']);
 w.enqueue({name:'depois',run:()=>ran.push('depois')});w.dispose();
 await c.advance(5000);assert.deepEqual(ran,['v2'],'nada roda depois de dispose');
});

test('registros medem a duração de cada tarefa (para o painel)',async()=>{
 const c=fakeClock(),w=make(c,{startDelayMs:0});
 w.enqueue({name:'parse',run:()=>{c.tick(40);}}); // simula 40 ms de trabalho síncrono
 w.start();await c.advance(10);
 const r=w.records()[0];
 assert.equal(r.name,'parse');assert.equal(r.durationMs,40);assert.equal(r.forcedByDeadline,false);
});
