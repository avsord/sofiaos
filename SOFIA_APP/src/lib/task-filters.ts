import type {Task} from './types';
export const TASK_PRIORITIES=[
 {value:'important',label:'Importante',symbol:'!!!',color:'#D94B57'},
 {value:'medium',label:'Média',symbol:'!!',color:'#B77713'},
 {value:'light',label:'Leve',symbol:'!',color:'#378E78'},
 {value:'none',label:'Sem prioridade',symbol:'—',color:null},
] as const;
export function taskPriority(task:Partial<Task>){return TASK_PRIORITIES.find(p=>p.value===task.priority_level)||TASK_PRIORITIES[task.priority?0:3];}
export function filterTasks(items:Task[],filter:{query:string;area:string;priority:string}){
 const q=filter.query.trim().toLocaleLowerCase('pt-BR');
 return items.filter(t=>(!filter.area||(t.area?.trim()||'Pessoal')===filter.area)&&(!filter.priority||taskPriority(t).value===filter.priority)&&(!q||(t.title+' '+(t.description||'')).toLocaleLowerCase('pt-BR').includes(q)));
}
