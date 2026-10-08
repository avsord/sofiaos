import type {Entity,Notice,Task} from './types';
import type {SnapshotStorage} from './startup-snapshot';
import {capsuleDay,capsuleDoses} from './capsule-model';
export type BellNotice=Notice&{entity_id?:string;dedup?:string;local?:boolean};
export function notificationScope(scope:string){let hash=2166136261;for(const c of scope)hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0).toString(36);}
export function routineOccurs(plan:Entity,day:string){const d=plan.data||{},date=new Date(day+'T12:00:00');if(plan.state!=='active'||!d.starts_on||day<d.starts_on||d.ends_on&&day>d.ends_on||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.time)))return false;if(d.frequency==='weekly')return date.getDay()===Number(d.weekday);if(d.frequency==='monthly')return date.getDate()===Math.min(Number(d.monthday),new Date(date.getFullYear(),date.getMonth()+1,0).getDate());return d.frequency==='daily';}
export function dueNotices(plans:Entity[],history:Entity[],routines:Entity[],tasks:Task[],now=new Date()):BellNotice[]{
 const result:BellNotice[]=[];
 for(let i=0;i<30;i++){const day=capsuleDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()-i,12));
  for(const dose of capsuleDoses(plans,history,day,now)){if(!dose.due||dose.taken)continue;result.push({id:'local:capsule:'+dose.key,title:dose.plan.title,body:`${dose.day.split('-').reverse().join('/')} às ${dose.time} · ${dose.plan.data.dose_text||'Cápsula no horário'}`,state:'unread',category:'capsule',created_at:dose.date.toISOString(),entity_id:dose.plan.id,dedup:'capsule:'+dose.key,local:true});}
  for(const plan of routines){if(!routineOccurs(plan,day))continue;const at=new Date(day+'T'+plan.data.time+':00');if(at>now)continue;const dedup=plan.id+':'+day+':'+plan.data.time;if(tasks.some(t=>t.title===plan.title&&t.state==='done'&&t.due_at&&Math.abs(Date.parse(t.due_at)-at.getTime())<60000))continue;result.push({id:'local:routine:'+dedup,title:plan.title,body:plan.data.instruction||'Chegou o horário da rotina. Conclusão ainda não confirmada.',state:'unread',category:'routine',created_at:at.toISOString(),entity_id:plan.id,dedup,local:true});}
 }
 for(const task of tasks){const stamp=Date.parse(task.due_at||task.start_at||'');if(!Number.isFinite(stamp)||stamp>now.getTime()||stamp<now.getTime()-30*86400000||['done','cancelled','archived'].includes(task.state))continue;if(result.some(n=>n.category==='routine'&&n.title===task.title&&Math.abs(Date.parse(n.created_at)-stamp)<60000))continue;result.push({id:'local:task:'+task.id+':'+stamp,title:task.title,body:'A tarefa chegou ao horário e ainda está pendente.',state:'unread',category:'task',created_at:new Date(stamp).toISOString(),entity_id:task.id,local:true});}
 return result;
}
export function presentedNotice(request:{identifier:string;content:{title?:string|null;body?:string|null;data?:Record<string,any>}},scope:string,date=Date.now()):BellNotice|null{
 const d=request.content.data||{};if(d.scope!==notificationScope(scope)||!(d.sofiaCapsule||d.sofiaAgenda||d.sofiaRoutine||d.sofiaMonitor))return null;
 const id=d.sofiaCapsule?'local:capsule:'+d.planId+':'+d.day+':'+d.time+(d.early?':early':''):'local:delivered:'+request.identifier;
 return {id,title:request.content.title||'Sofia',body:request.content.body||'',state:'unread',category:d.sofiaCapsule?'capsule':d.sofiaRoutine?'routine':d.sofiaMonitor?'monitor':'agenda',created_at:new Date(date).toISOString(),entity_id:d.planId||d.entityId,local:true};
}
export function mergeBellNotices(remote:BellNotice[],local:BellNotice[]){const remoteKeys=new Set(remote.map(n=>n.dedup).filter(Boolean));return [...remote,...local.filter(n=>!n.dedup||!remoteKeys.has(n.dedup))].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));}
/** Local delivered/due reminders augment, never overwrite, server notifications. */
export class BellInbox {
 private records=new Map<string,BellNotice>();private hidden=new Map<string,number>();listeners=new Set<()=>void>();items:BellNotice[]=[];
 constructor(private storage:SnapshotStorage,private scope:string,private now=Date.now){}
 async hydrate(){try{const raw=await this.storage.read(this.scope);if(raw){const data=JSON.parse(raw);if(data.schema===1){for(const [id,at] of data.hidden||[])if(typeof id==='string'&&Number.isFinite(at))this.hidden.set(id,at);for(const notice of data.items||[])if(notice?.local===true&&String(notice.id).startsWith('local:')&&!this.records.has(notice.id))this.records.set(notice.id,notice);}}}catch{}this.publish();}
 ingest(notices:BellNotice[]){let changed=false;for(const n of notices){if(this.hidden.has(n.id)||this.records.has(n.id))continue;this.records.set(n.id,n);changed=true;}if(changed)this.publish();}
 read(id:string){const n=this.records.get(id);if(n&&n.state!=='read'){this.records.set(id,{...n,state:'read'});this.publish();}}
 dismiss(id:string){this.records.delete(id);this.hidden.set(id,this.now());this.publish();}
 clear(){for(const n of this.records.values())this.hidden.set(n.id,this.now());this.records.clear();this.publish();}
 private publish(){const cutoff=this.now()-30*86400000;for(const [id,n] of this.records)if(this.hidden.has(id)||!Number.isFinite(Date.parse(n.created_at))||Date.parse(n.created_at)<cutoff)this.records.delete(id);for(const [id,at] of this.hidden)if(at<cutoff)this.hidden.delete(id);this.items=[...this.records.values()].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,1500);this.listeners.forEach(f=>f());void this.storage.write(this.scope,JSON.stringify({schema:1,items:this.items,hidden:[...this.hidden].slice(-3000)})).catch(()=>{});}
}
