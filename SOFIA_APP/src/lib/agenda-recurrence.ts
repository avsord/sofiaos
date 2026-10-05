import type {AgendaItem} from './types';
export const REPEATS=[{value:'none',label:'Não repetir'},{value:'weekly',label:'Toda semana'},{value:'monthly',label:'Todo mês'},{value:'yearly',label:'Todo ano'}] as const;
export type Repeat=typeof REPEATS[number]['value'];
const prefix='sofia-repeat-v1:';
export const isAgendaMeta=(tag:string)=>tag.startsWith(prefix)||tag==='sofia-notify-v1:off';
// A Google import can contain hundreds of ordinary events. Resolve the device
// zone once and validate each distinct recurrence tag once, rather than create
// two Intl formatters per event on every render and notification refresh.
const deviceTimeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const repeatRules=new Map<string,{frequency:Repeat;timeZone:string}>();
export function readRepeat(item:{tags?:string[]}){
 const tag=item.tags?.find(t=>t.startsWith(prefix))||'',cached=repeatRules.get(tag);if(cached)return cached;
 const [frequency,zone]=tag.slice(prefix.length).split(':');let timeZone=zone||deviceTimeZone;
 if(zone)try{new Intl.DateTimeFormat('en',{timeZone});}catch{timeZone='UTC';}
 const rule={frequency:(REPEATS.some(p=>p.value===frequency)?frequency:'none') as Repeat,timeZone};
 if(repeatRules.size>=64)repeatRules.delete(repeatRules.keys().next().value!);repeatRules.set(tag,rule);return rule;
}
export function agendaTags(tags:string[],frequency:Repeat,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,notify=true){return [...tags.filter(t=>!isAgendaMeta(t)),...(frequency==='none'?[]:[prefix+frequency+':'+timeZone]),...(notify?[]:['sofia-notify-v1:off'])];}
export function eventStart(item:AgendaItem){return item.data.calendar_all_day?item.data.calendar_date_start||'':item.data.start_at||item.data.remind_at||item.data.due_at||'';}
const formatters=new Map<string,Intl.DateTimeFormat>();
function parts(stamp:Date,zone:string){let formatter=formatters.get(zone);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});formatters.set(zone,formatter);}const p=formatter.formatToParts(stamp);const get=(key:string)=>Number(p.find(x=>x.type===key)?.value||0);return {y:get('year'),m:get('month'),d:get('day'),h:get('hour'),i:get('minute'),s:get('second')};}
function zoned(y:number,m:number,d:number,h:number,i:number,s:number,zone:string){const wall=Date.UTC(y,m-1,d,h,i,s);let stamp=wall;for(let n=0;n<3;n++){const p=parts(new Date(stamp),zone),delta=wall-Date.UTC(p.y,p.m-1,p.d,p.h,p.i,p.s);stamp+=delta;if(!delta)break;}return new Date(stamp);}
/** Recurrence stays on one server record. Versioned tags are supported by the existing API. */
export function occurrences(item:AgendaItem,from:Date,to:Date):AgendaItem[]{
 if(['done','cancelled','completed','archived'].includes(item.state))return [];
 const start=eventStart(item),base=new Date(start.length===10?start+'T09:00:00':start);if(!start||!Number.isFinite(base.getTime()))return [];
 const rule=readRepeat(item);if(rule.frequency==='none')return base>=from&&base<to?[item]:[];
 const a=item.data.calendar_all_day?{y:Number(start.slice(0,4)),m:Number(start.slice(5,7)),d:Number(start.slice(8,10)),h:9,i:0,s:0}:parts(base,rule.timeZone);
 const lo=parts(from,rule.timeZone),hi=parts(to,rule.timeZone),anchor=Date.UTC(a.y,a.m-1,a.d),first=Date.UTC(lo.y,lo.m-1,lo.d)-86400000,last=Date.UTC(hi.y,hi.m-1,hi.d)+86400000,out:AgendaItem[]=[];
 for(let stamp=Math.max(anchor,first);stamp<=last;stamp+=86400000){const d=new Date(stamp),y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate(),elapsed=Math.round((stamp-anchor)/86400000);const match=rule.frequency==='weekly'?elapsed%7===0:rule.frequency==='monthly'?day===a.d:m===a.m&&day===a.d;if(!match)continue;
  const date=zoned(y,m,day,a.h,a.i,a.s,rule.timeZone);if(date<base||date<from||date>=to)continue;const iso=date.toISOString(),key=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`,data={...item.data};
  if(data.calendar_all_day){const duration=Math.max(1,Math.round((Date.parse(data.calendar_date_end||start)-Date.parse(start))/86400000));data.calendar_date_start=key;data.calendar_date_end=new Date(Date.parse(key+'T12:00:00Z')+duration*86400000).toISOString().slice(0,10);}else {if(data.start_at)data.start_at=iso;else if(data.remind_at)data.remind_at=iso;else data.due_at=iso;if(data.end_at)data.end_at=new Date(date.getTime()+Date.parse(item.data.end_at!)-base.getTime()).toISOString();}
  out.push({...item,data});
 }return out;
}
export function expandAgenda(items:AgendaItem[],month:Date){const from=new Date(month.getFullYear(),month.getMonth(),1),to=new Date(month.getFullYear(),month.getMonth()+1,1);return items.flatMap(i=>occurrences(i,from,to));}
