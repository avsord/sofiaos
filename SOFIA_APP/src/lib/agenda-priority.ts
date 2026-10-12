import {TASK_PRIORITIES,taskPriority} from './task-filters';
import type {AgendaItem} from './types';
export const HOLIDAY_COLOR='#2fc58b';
/** Calendários de feriados do Google (ex.: pt-br.brazilian#holiday@group.v.calendar.google.com). */
export function isHoliday(item:{data?:{calendar_id?:string}}){return /#holiday@group\.v\.calendar\.google\.com$|holiday@group\.v\.calendar/i.test(String(item?.data?.calendar_id||''));}
export function agendaPriority(item:Pick<AgendaItem,'data'>){if(isHoliday(item))return {value:'holiday',label:'Feriado',color:HOLIDAY_COLOR} as any;return taskPriority({priority_level:item.data.priority_level||'none'});}
export function dayPriorityColors(items:readonly Pick<AgendaItem,'data'>[],accent:string){const levels=new Set(items.map(i=>agendaPriority(i).value));return [...(levels.has('holiday')?[HOLIDAY_COLOR]:[]),...TASK_PRIORITIES.filter(p=>levels.has(p.value)).map(p=>p.color||accent)];}

export function priorityColorsByDay(items:readonly {date:string;priority_level?:string;calendar_id?:string}[],accent:string){const grouped=new Map<string,Pick<AgendaItem,'data'>[]>();for(const item of items){const group=grouped.get(item.date)||[];group.push({data:{priority_level:item.priority_level,calendar_id:item.calendar_id} as any});grouped.set(item.date,group);}return new Map([...grouped].map(([date,items])=>[date,dayPriorityColors(items,accent)]));}
