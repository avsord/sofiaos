import {enqueueNotifications,reconcileNotificationRequests,NOTIFICATION_CHANNEL_LIMIT,NOTIFICATION_SIGNATURE_VERSION,notificationFailure} from './notification-scheduler';
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
let generation=0;
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
 const all=notificationPlan(items),plan=all.slice(0,NOTIFICATION_CHANNEL_LIMIT);
 const desired:Notifications.NotificationRequestInput[]=[];
 for(const event of plan){if(epoch!==generation)return;const id=PREFIX+scopeId(scope)+':'+event.id;const signature=JSON.stringify([NOTIFICATION_SIGNATURE_VERSION,event.title,event.body,event.day]);
  desired.push({identifier:id,content:{title:event.title,body:event.body,sound:'default',data:{sofiaAgenda:true,scope:scopeId(scope),entityId:event.entityId,day:event.day,signature}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:event.date,channelId:CHANNEL}});
 }
 if(epoch!==generation)return;await reconcileNotificationRequests(Notifications,PREFIX,desired,()=>epoch===generation);
 notificationWarning=all.length>NOTIFICATION_CHANNEL_LIMIT?'Há mais de 128 lembretes futuros. Os próximos estão agendados; a Sofia atualiza a lista ao abrir.':'';
}
export function useAgendaNotifications(api:SofiaApi,scope:string,enabled:boolean|null,onOpen:(day:string,id?:string)=>void){
 const latest=useRef(onOpen);latest.current=onOpen;
 useEffect(()=>{
  if(enabled===null)return;
  const epoch=++generation;let stopped=false,inFlight=false,rerun=false;
  const refresh=async()=>{if(stopped||!enabled)return;if(inFlight){rerun=true;return;}inFlight=true;try{const result=await api.agenda();if(stopped)return;await enqueueNotifications(()=>reconcile(result.items,scope,epoch));}catch(error){if(!stopped)notificationWarning=notificationFailure(error);}finally{inFlight=false;if(rerun&&!stopped){rerun=false;void refresh();}}};
  const open=(response:Notifications.NotificationResponse)=>{const d=response.notification.request.content.data;if(enabled&&d?.sofiaAgenda&&d.scope===scopeId(scope)&&typeof d.day==='string'&&typeof d.entityId==='string'){latest.current(d.day,d.entityId);void Notifications.clearLastNotificationResponseAsync();}};
  const response=Notifications.addNotificationResponseReceivedListener(open),state=AppState.addEventListener('change',s=>{if(s==='active')void refresh();}),unsub=subscribeAgenda(owner=>{if(owner===api)void refresh();}),permission=()=>void refresh();permissionListeners.add(permission);
  if(enabled){void refresh();void Notifications.getLastNotificationResponseAsync().then(r=>{if(r&&!stopped)open(r);});}
  else void enqueueNotifications(async()=>{for(const n of await Notifications.getAllScheduledNotificationsAsync())if(n.identifier.startsWith(PREFIX))await Notifications.cancelScheduledNotificationAsync(n.identifier);}).catch(()=>{});
  const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},60000);
  return()=>{stopped=true;generation++;clearInterval(timer);response.remove();state.remove();unsub();permissionListeners.delete(permission);};
 },[api,scope,enabled]);
}
