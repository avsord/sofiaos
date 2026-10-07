import {useEffect,useMemo,useReducer} from 'react';
import {AppState} from 'react-native';
import * as Notifications from 'expo-notifications';
import type {SofiaApi} from './api';
import type {Entity,Task} from './types';
import {SITE} from './api';
import {capsuleStore} from './capsule-store';
import {subscribeSystemChanged} from './system-events';
import {BellInbox,dueNotices,presentedNotice} from './bell-inbox';
import {encryptedStorage} from './encrypted-storage';
export function useBellInbox(api:SofiaApi,scope:string,enabled:boolean){
 const inbox=useMemo(()=>new BellInbox(encryptedStorage,SITE+'|'+scope.toLowerCase()+'|bell-v1'),[api,scope]),[,render]=useReducer(x=>x+1,0);
 useEffect(()=>{if(!enabled||!scope)return;let stopped=false,routines:Entity[]=[],tasks:Task[]=[],loading=false,pending=false;const capsules=capsuleStore(api);
  const notify=()=>render();inbox.listeners.add(notify);
  const derive=()=>{if(!stopped&&AppState.currentState==='active')inbox.ingest(dueNotices(capsules.snapshot.plans,capsules.snapshot.history,routines,tasks));};
  const refresh=async()=>{if(stopped)return;if(loading){pending=true;return;}loading=true;try{const [r,t]=await Promise.all([(async()=>{const rows:Entity[]=[];for(let offset=0;offset<10000;offset+=100){const page=await api.entities('routine','',offset);rows.push(...page.items);if(page.items.length<100)return rows;}return rows;})(),api.tasks()]);if(!stopped){routines=r;tasks=t.items;derive();}}catch{}finally{loading=false;if(pending&&!stopped){pending=false;void refresh();}}};
  const delivered=(notification:Notifications.Notification)=>{const n=presentedNotice(notification.request,scope,notification.date);if(n&&!stopped)inbox.ingest([n]);};
  const presented=()=>void Notifications.getPresentedNotificationsAsync().then(list=>{if(!stopped)list.forEach(delivered);}).catch(()=>{});
  void inbox.hydrate().then(()=>{if(!stopped){derive();presented();}});void refresh();
  capsules.listeners.add(derive);const system=subscribeSystemChanged(owner=>{if(owner===api)void refresh();});
  const received=Notifications.addNotificationReceivedListener(delivered),response=Notifications.addNotificationResponseReceivedListener(r=>delivered(r.notification));
  const app=AppState.addEventListener('change',state=>{if(state==='active'){derive();void refresh();presented();}});
  // Align to wall-clock minute boundaries (not to app launch), so 09:00 is 09:00.
  let minute:ReturnType<typeof setTimeout>;const tick=()=>{derive();minute=setTimeout(tick,60000-Date.now()%60000+15);};tick();
  const remote=setInterval(()=>{if(AppState.currentState==='active')void refresh();},60000);
  return()=>{stopped=true;clearTimeout(minute);clearInterval(remote);capsules.listeners.delete(derive);inbox.listeners.delete(notify);system();received.remove();response.remove();app.remove();};
 },[api,scope,enabled,inbox]);
 return inbox;
}
