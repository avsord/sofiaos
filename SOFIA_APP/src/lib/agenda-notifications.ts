import {useEffect,useRef} from 'react';
import {AppState} from 'react-native';
import * as Notifications from 'expo-notifications';
import {occurrences,eventStart,readRepeat} from './agenda-recurrence';
import {subscribeAgenda} from './agenda-events';
import {localDateKey} from './dashboard';
import type {SofiaApi} from './api';
import type {AgendaItem} from './types';
const CHANNEL='sofia-agenda',PREFIX='sofia-agenda:';
const permissionListeners=new Set<()=>void>();
let queue=Promise.resolve(),generation=0;
export let notificationWarning='';
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
export async function requestAgendaPermission(){await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Agenda da Sofia',importance:Notifications.AndroidImportance.HIGH,sound:'default'});let p=await Notifications.getPermissionsAsync();if(!p.granted&&p.canAskAgain)p=await Notifications.requestPermissionsAsync();permissionListeners.forEach(f=>f());return p.granted;}
export function notificationPlan(items:AgendaItem[],now=new Date()){
 const end=new Date(now.getFullYear()+2,now.getMonth(),now.getDate()),planned: {id:string;title:string;body:string;date:Date;day:string;entityId:string}[]=[];
 for(const item of items){if(item.tags?.includes('sofia-notify-v1:off'))continue;const ahead=Math.max(0,Math.min(525600,Number(item.data.remind_minutes)||0))*60000;const from=new Date(now.getTime()+ahead),to=readRepeat(item).frequency==='none'?new Date(8640000000000000):new Date(end.getTime()+ahead);
  for(const event of occurrences(item,from,to)){const start=eventStart(event),date=new Date((start.length===10?new Date(start+'T09:00:00').getTime():Date.parse(start))-ahead);if(date<=now)continue;planned.push({id:item.id+':'+date.getTime(),entityId:item.id,title:item.title,body:event.data.location||'Seu compromisso na agenda da Sofia.',date,day:localDateKey(start)});}
 }return planned.sort((a,b)=>a.date.getTime()-b.date.getTime());
}
function scopeId(scope:string){let hash=2166136261;for(const c of scope)hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0).toString(36);}
async function reconcile(items:AgendaItem[],scope:string,epoch:number){
 if(epoch!==generation)return;await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Agenda da Sofia',importance:Notifications.AndroidImportance.HIGH,sound:'default'});if(!(await Notifications.getPermissionsAsync()).granted)return;
 const all=notificationPlan(items),plan=all.slice(0,256),requests=await Notifications.getAllScheduledNotificationsAsync(),existing=new Map(requests.filter(n=>n.identifier.startsWith(PREFIX)).map(n=>[n.identifier,n]));
 const wanted=new Set<string>();
 for(const event of plan){if(epoch!==generation)return;const id=PREFIX+scopeId(scope)+':'+event.id;wanted.add(id);const signature=JSON.stringify([event.title,event.body,event.day]),old=existing.get(id);if(old?.content.data?.signature===signature)continue;
  await Notifications.scheduleNotificationAsync({identifier:id,content:{title:event.title,body:event.body,sound:'default',data:{sofiaAgenda:true,scope:scopeId(scope),entityId:event.entityId,day:event.day,signature}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:event.date,channelId:CHANNEL}});
 }
 if(epoch!==generation)return;for(const id of existing.keys())if(!wanted.has(id))await Notifications.cancelScheduledNotificationAsync(id);
 notificationWarning=all.length>256?'Há mais de 256 lembretes futuros. Os próximos estão agendados; a Sofia atualiza a lista ao abrir.':'';
}
export function useAgendaNotifications(api:SofiaApi,scope:string,enabled:boolean|null,onOpen:(day:string,id?:string)=>void){
 const latest=useRef(onOpen);latest.current=onOpen;
 useEffect(()=>{
  if(enabled===null)return;
  const epoch=++generation;let stopped=false,inFlight=false,rerun=false;
  const refresh=async()=>{if(stopped||!enabled)return;if(inFlight){rerun=true;return;}inFlight=true;try{const result=await api.agenda();if(stopped)return;queue=queue.catch(()=>{}).then(()=>reconcile(result.items,scope,epoch));await queue;}catch{notificationWarning='Não foi possível atualizar os lembretes. Os já programados foram mantidos.';}finally{inFlight=false;if(rerun&&!stopped){rerun=false;void refresh();}}};
  const open=(response:Notifications.NotificationResponse)=>{const d=response.notification.request.content.data;if(enabled&&d?.sofiaAgenda&&d.scope===scopeId(scope)&&typeof d.day==='string'&&typeof d.entityId==='string'){latest.current(d.day,d.entityId);void Notifications.clearLastNotificationResponseAsync();}};
  const response=Notifications.addNotificationResponseReceivedListener(open),state=AppState.addEventListener('change',s=>{if(s==='active')void refresh();}),unsub=subscribeAgenda(owner=>{if(owner===api)void refresh();}),permission=()=>void refresh();permissionListeners.add(permission);
  if(enabled){void refresh();void Notifications.getLastNotificationResponseAsync().then(r=>{if(r&&!stopped)open(r);});}
  else queue=queue.catch(()=>{}).then(async()=>{for(const n of await Notifications.getAllScheduledNotificationsAsync())if(n.identifier.startsWith(PREFIX))await Notifications.cancelScheduledNotificationAsync(n.identifier);await Notifications.dismissAllNotificationsAsync();});
  const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},60000);
  return()=>{stopped=true;generation++;clearInterval(timer);response.remove();state.remove();unsub();permissionListeners.delete(permission);};
 },[api,scope,enabled]);
}
