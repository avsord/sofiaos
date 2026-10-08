import {TASK_PRIORITIES,taskPriority} from './task-filters';
import type {AgendaItem} from './types';
export function agendaPriority(item:Pick<AgendaItem,'data'>){return taskPriority({priority_level:item.data.priority_level||'none'});}
export function dayPriorityColors(items:readonly Pick<AgendaItem,'data'>[],accent:string){const levels=new Set(items.map(i=>agendaPriority(i).value));return TASK_PRIORITIES.filter(p=>levels.has(p.value)).map(p=>p.color||accent);}

export function priorityColorsByDay(items:readonly {date:string;priority_level?:string}[],accent:string){const grouped=new Map<string,Pick<AgendaItem,'data'>[]>();for(const item of items){const group=grouped.get(item.date)||[];group.push({data:{priority_level:item.priority_level}});grouped.set(item.date,group);}return new Map([...grouped].map(([date,items])=>[date,dayPriorityColors(items,accent)]));}
