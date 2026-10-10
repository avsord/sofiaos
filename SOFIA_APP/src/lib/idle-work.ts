/** O toque sempre vence.
 *
 * Fila única para TODO trabalho que não é urgente depois da abertura: leitura
 * do histórico, pré-busca para o cache, montagem antecipada de abas, gravação
 * do cache, inventário de notificações e futuras coletas (ex.: monitoramento de
 * preços). Regras:
 *  - nada roda antes de start() (chamado no reveal) + startDelayMs;
 *  - uma tarefa por vez, com folga gapMs entre elas;
 *  - se houve toque/arrasto há menos de quietMs, a tarefa espera;
 *  - deadlineMs opcional: a tarefa roda mesmo com o usuário ativo depois desse
 *    prazo (ex.: hidratação nunca pode ficar para sempre);
 *  - cada tarefa deve ser pequena; trabalho grande se divide em várias tarefas.
 * A fila não interrompe uma tarefa em andamento: por isso tarefas são curtas.
 */
export type IdleTask={name:string;run:()=>void|Promise<void>;priority?:number;deadlineMs?:number};
export type IdleRecord={name:string;startedAtMs:number;durationMs:number;forcedByDeadline:boolean;error?:string};
type Timer=unknown;
export type IdleWorkOptions={
 now?:()=>number;
 setTimer?:(fn:()=>void,ms:number)=>Timer;
 clearTimer?:(id:Timer)=>void;
 quietMs?:number;
 gapMs?:number;
 startDelayMs?:number;
 maxRecords?:number;
};
type Entry=IdleTask&{seq:number;enqueuedAt:number};

export function createIdleWork(options:IdleWorkOptions={}){
 const now=options.now??(()=>((globalThis as any).performance?.now?.()??Date.now()));
 const setTimer=options.setTimer??((fn,ms)=>setTimeout(fn,ms));
 const clearTimer=options.clearTimer??(id=>clearTimeout(id as ReturnType<typeof setTimeout>));
 const quietMs=options.quietMs??800,gapMs=options.gapMs??50,startDelayMs=options.startDelayMs??0,maxRecords=options.maxRecords??100;
 const queue:Entry[]=[];const records:IdleRecord[]=[];
 let started=false,startedAt=0,lastInput=-Infinity,timer:Timer|null=null,running=false,disposed=false,seq=0,nextAllowedAt=0;

 const sort=()=>queue.sort((a,b)=>(a.priority??5)-(b.priority??5)||a.seq-b.seq);
 const arm=(ms:number)=>{if(disposed)return;if(timer!==null)clearTimer(timer);timer=setTimer(()=>{timer=null;void pump();},Math.max(0,ms));};

 async function pump(){
  if(disposed||running||!started||!queue.length)return;
  const t=now();
  // A newly enqueued task may re-arm the timer at zero. The gap is a hard
  // time fence, not just the delay used for the previously armed timer.
  const notBefore=Math.max(startedAt+startDelayMs,nextAllowedAt)-t;
  if(notBefore>0){arm(notBefore);return;}
  sort();
  // Deadlines belong to every entry, not just the first priority group.
  // Choose the earliest overdue deadline; otherwise retain priority/FIFO.
  let index=0,earliest=Infinity;
  for(let i=0;i<queue.length;i++){
   const q=queue[i],due=q.deadlineMs===undefined?Infinity:q.enqueuedAt+q.deadlineMs;
   if(due<=t&&due<earliest){earliest=due;index=i;}
  }
  const head=queue[index];
  const quietLeft=lastInput+quietMs-t;
  const overdue=head.deadlineMs!==undefined&&t-head.enqueuedAt>=head.deadlineMs;
  if(quietLeft>0&&!overdue){
   const nextDeadline=queue.reduce((due,q)=>Math.min(due,q.deadlineMs===undefined?Infinity:q.enqueuedAt+q.deadlineMs),Infinity);
   arm(Math.min(quietLeft,nextDeadline-t));return;
  }
  queue.splice(index,1);running=true;
  const begin=now();let error:string|undefined;
  try{await head.run();}catch(e){error=e instanceof Error?e.message:String(e);}
  records.push({name:head.name,startedAtMs:begin-startedAt,durationMs:Math.max(0,now()-begin),forcedByDeadline:quietLeft>0&&overdue,error});
  if(records.length>maxRecords)records.splice(0,records.length-maxRecords);
  nextAllowedAt=now()+gapMs;
  running=false;
  if(queue.length)arm(gapMs);
 }

 return {
  /** Chamar uma vez quando a Home ficar visível (fim do fade). */
  start(){if(started||disposed)return;started=true;startedAt=now();arm(startDelayMs);},
  /** Chamar em todo toque e início de arrasto. Não faz setState. */
  noteInput(){lastInput=now();},
  enqueue(task:IdleTask){
   if(disposed)return;
   const i=queue.findIndex(q=>q.name===task.name);
   if(i>=0)queue.splice(i,1); // mesmo nome = substitui (ex.: reagendar pré-busca)
   queue.push({...task,seq:seq++,enqueuedAt:now()});
   if(started&&!running)arm(0);
  },
  cancel(name:string){const i=queue.findIndex(q=>q.name===name);if(i>=0)queue.splice(i,1);},
  pending(){sort();return queue.map(q=>q.name);},
  isIdle(){return now()-lastInput>=quietMs;},
  records(){return records.slice();},
  dispose(){disposed=true;queue.length=0;if(timer!==null)clearTimer(timer);timer=null;},
 };
}

/** Instância única do app. Testes criam a sua com createIdleWork(). */
export const idleWork=createIdleWork({quietMs:800,gapMs:50,startDelayMs:300});
