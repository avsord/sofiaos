import React,{useEffect,useRef} from 'react';
import {scheduleIdleTask} from '../lib/idle-task';
import type {SofiaApi} from '../lib/api';
import {preloadAgenda} from '../lib/use-agenda-month';
import {useCapsuleNotifications} from '../lib/capsule-notifications';
import {useAgendaNotifications} from '../lib/agenda-notifications';
export function BackgroundServices({api,scope,enabled,preloadWhenIdle=true,onCapsules,onAgenda}:{api:SofiaApi;scope:string;enabled:boolean|null;preloadWhenIdle?:boolean;onCapsules:()=>void;onAgenda:(date:string,id?:string,create?:boolean)=>void}){
 const started=useRef<SofiaApi|null>(null);
 // Large background catalog/chat/network refreshes used to race the first
 // menu taps. Leave Home instantly usable from saved data; begin optional
 // read-ahead only after Home remains active and the JS thread is idle.
 useEffect(()=>{
  if(!enabled||!preloadWhenIdle||started.current===api)return;
  let cancel=()=>{};
  const timer=setTimeout(()=>{cancel=scheduleIdleTask(()=>{
   if(started.current===api)return;
   started.current=api;
   void api.preload(()=>preloadAgenda(api)).catch(()=>{});
  });},3400);
  return()=>{clearTimeout(timer);cancel();};
 },[api,enabled,preloadWhenIdle]);
 useCapsuleNotifications(api,scope,enabled,onCapsules);
 useAgendaNotifications(api,scope,enabled,onAgenda);
 return null;
}
