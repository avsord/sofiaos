import {useEffect,useState} from 'react';
import {scheduleIdleTask} from './idle-task';
import type {Tab} from './types';

const MENU_TABS:Tab[]=['home','chat','agenda','pages','apps','profile'];

/** The Home renders alone under Android's splash. In 0.3.73 mounting five
 * heavyweight hidden screens on the first frame prolonged the S significantly.
 * Begin mounting saved secondary screens only AFTER the splash is gone, one
 * idle window at a time; keep already mounted tabs alive and immediately mount
 * whichever tab was actually selected. No network dependency for navigation. */
export function useStartupMounts(enabled:boolean,active:Tab){
 const [warmed,setWarmed]=useState<Set<Tab>>(()=>new Set(['home']));
 useEffect(()=>{
  if(!enabled){
   setWarmed(previous=>previous.size===1&&previous.has('home')?previous:new Set(['home']));
   return;
  }
  let cancelled=false,cancelIdle=()=>{};
  const pending=MENU_TABS.filter(tab=>tab!=='home');
  let index=0;
  const next=()=>{
   if(cancelled||index>=pending.length)return;
   cancelIdle=scheduleIdleTask(()=>{
    if(cancelled)return;
    const tab=pending[index++];
    setWarmed(previous=>previous.has(tab)?previous:new Set([...previous,tab]));
    next();
   });
  };
  next();
  return()=>{cancelled=true;cancelIdle();};
 },[enabled]);
 return new Set<Tab>(['home',...warmed,...(MENU_TABS.includes(active)?[active]:[])]);
}
