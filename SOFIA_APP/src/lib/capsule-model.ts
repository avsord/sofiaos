import type {Entity} from './types';
export const capsuleDay=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function capsuleOccurs(data:any,day:string):boolean{
 const start=data.start_date;if(!start||day<start||(data.end_date&&day>data.end_date))return false;
 const date=new Date(day+'T12:00:00Z'),anchor=new Date(start+'T12:00:00Z');if(!Number.isFinite(date.getTime())||!Number.isFinite(anchor.getTime()))return false;
 const mode=data.repeat_type||'daily';
 if(mode==='once')return day===start;
 if(mode==='weekdays'){try{return JSON.parse(data.weekdays_json||'[]').includes(date.getUTCDay());}catch{return false;}}
 if(mode==='interval')return Math.round((date.getTime()-anchor.getTime())/86400000)%Math.max(1,Number(data.interval_days)||1)===0;
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 if(mode==='monthly')return date.getUTCDate()===Math.min(anchor.getUTCDate(),last);
 if(mode==='yearly')return date.getUTCMonth()===anchor.getUTCMonth()&&date.getUTCDate()===Math.min(anchor.getUTCDate(),last);
 return mode==='daily';
}
export type CapsuleDose={key:string;plan:Entity;day:string;time:string;date:Date;taken?:Entity;due:boolean};
export function capsuleTimes(plan:Entity):string[]{try{const times=JSON.parse(plan.data.times_json);return Array.isArray(times)?[...new Set(times.filter((t:unknown):t is string=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort():[];}catch{return [];}}
export function capsuleKey(id:string,day:string,time:string){return `${id}:${day}:${time}`;}
export function capsuleDoses(plans:Entity[],history:Entity[],day=capsuleDay(new Date()),now=new Date()):CapsuleDose[]{const done=new Map(history.map(r=>[capsuleKey(r.data.capsule_id,r.data.day,r.data.time),r]));return plans.filter(p=>p.state==='active'&&capsuleOccurs(p.data,day)).flatMap(plan=>capsuleTimes(plan).map(time=>{const date=new Date(day+'T'+time+':00'),key=capsuleKey(plan.id,day,time);return {key,plan,day,time,date,taken:done.get(key),due:date.getTime()<=now.getTime()};})).sort((a,b)=>a.date.getTime()-b.date.getTime()||a.plan.title.localeCompare(b.plan.title));}
export function capsuleNotificationPlan(plans:Entity[],history:Entity[],now=new Date(),days=366){const notices:{id:string;title:string;body:string;date:Date;day:string;planId:string;time:string;early:boolean}[]=[];for(let i=0;i<=days;i++){const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i,12);for(const dose of capsuleDoses(plans,history,capsuleDay(date),now)){if(dose.taken||!dose.plan.data.notifications)continue;const ahead=Math.max(0,Math.min(1440,Number(dose.plan.data.remind_minutes)||0));for(const minutes of ahead?[ahead,0]:[0]){const at=new Date(dose.date.getTime()-minutes*60000);if(at<=now)continue;notices.push({id:dose.key+':'+minutes,title:dose.plan.title,body:minutes?`Dose às ${dose.time} · aviso ${minutes} min antes${dose.plan.data.dose_text?' · '+dose.plan.data.dose_text:''}`:`Está no horário da dose: ${dose.time}${dose.plan.data.dose_text?' · '+dose.plan.data.dose_text:''}`,date:at,day:dose.day,planId:dose.plan.id,time:dose.time,early:minutes>0});}}}return notices.sort((a,b)=>a.date.getTime()-b.date.getTime());}

export function capsuleRepeatLabel(data:any){const mode=data.repeat_type||'daily';if(mode==='once')return 'Uma única vez';if(mode==='weekdays'){let days:number[]=[];try{days=JSON.parse(data.weekdays_json||'[]');}catch{}return days.map(d=>['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d]).join(' · ');}if(mode==='interval')return 'A cada '+data.interval_days+' dias';if(mode==='monthly')return 'Todo mês no dia '+Number(String(data.start_date).slice(8,10));if(mode==='yearly')return 'Todo ano em '+String(data.start_date).slice(5).split('-').reverse().join('/');return 'Todos os dias';}

export function capsuleNotificationLimit<T extends {planId:string;day:string;time:string;early:boolean}>(notices:T[],limit=256):T[]{const chosen=notices.slice(0,limit),due=new Set(chosen.filter(n=>!n.early).map(n=>capsuleKey(n.planId,n.day,n.time)));return chosen.filter(n=>!n.early||due.has(capsuleKey(n.planId,n.day,n.time)));}
