import {fuzzyFilter} from './fuzzy';
import type {Task} from './types';
export const TASK_PRIORITIES=[
 {value:'important',label:'Importante',symbol:'!!!',color:'#D94B57'},
 {value:'medium',label:'Média',symbol:'!!',color:'#B77713'},
 {value:'light',label:'Baixa',symbol:'!',color:'#378E78'},
 {value:'none',label:'Sem prioridade',symbol:'—',color:null},
] as const;
export function taskPriority(task:Partial<Task>){return TASK_PRIORITIES.find(p=>p.value===task.priority_level)||TASK_PRIORITIES[task.priority?0:3];}
export function filterTasks(items:Task[],filter:{query:string;area:string;priority:string}){
 // 0.3.201: a busca acha mesmo com letra errada (as mais parecidas primeiro)
 const base=items.filter(t=>(!filter.area||(t.area?.trim()||'Pessoal')===filter.area)&&(!filter.priority||taskPriority(t).value===filter.priority));
 return fuzzyFilter(base,filter.query,t=>t.title+' '+(t.description||''));
}
