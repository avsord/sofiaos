import type {Task} from './types';
import {localDateKey} from './dashboard';
/** 0.3.255: tarefa que subiu para a agenda (estado "scheduled") e nao foi ticada passa sozinha para o dia seguinte
 * a meia-noite, no mesmo horario. Ticada (concluida) fica riscada no dia dela e nao anda. */
export type Rollover={task:Task;due:string;end:string};
export function overdueScheduled(tasks:Task[],now=new Date()):Rollover[]{
 const today=localDateKey(now),out:Rollover[]=[];
 for(const t of tasks){
  if(t.state!=='scheduled'||!t.due_at)continue;
  const d=new Date(t.due_at);if(!Number.isFinite(d.getTime())||localDateKey(d)>=today)continue;
  const next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),d.getHours(),d.getMinutes(),0,0);
  const endMs=t.end_at?Date.parse(t.end_at):NaN,end=Number.isFinite(endMs)&&endMs>d.getTime()?new Date(next.getTime()+(endMs-d.getTime())).toISOString():'';
  out.push({task:t,due:next.toISOString(),end});
 }
 return out;
}
/** Milissegundos ate a proxima meia-noite local (+1 s de folga). */
export function msToMidnight(now=new Date()):number{return new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,1).getTime()-now.getTime();}
