import {startTransition,useEffect,useState} from 'react';
import type {Tab} from './types';
import {scheduleIdleTask} from './idle-task';
const MENU_TABS:Tab[]=['home','chat','agenda','pages','apps','profile'];
/** Network/data prefetch is independent. Hidden view trees warm one idle slice
 * at a time, and selecting any tab mounts it immediately without waiting. */
export function useStartupMounts(enabled:boolean,active:Tab){
 const [warmed,setWarmed]=useState<Set<Tab>>(()=>new Set(['home']));
 useEffect(()=>{
  if(!enabled){setWarmed(prev=>prev.size===1&&prev.has('home')?prev:new Set(['home']));return;}
  // Navigation takes priority over hidden-screen mounting.
  if(active!=='home')return;
  const next=MENU_TABS.find(tab=>!warmed.has(tab));
  if(!next)return;
  // Yield after each committed tree. Hidden mounts have lower priority than
  // menu presses instead of enqueueing all screens in the same idle interval.
  return scheduleIdleTask(()=>startTransition(()=>setWarmed(prev=>prev.has(next)?prev:new Set([...prev,next]))));
 },[enabled,warmed,active]);
 useEffect(()=>{if(enabled&&MENU_TABS.includes(active))setWarmed(prev=>prev.has(active)?prev:new Set([...prev,active]));},[enabled,active]);
 return new Set<Tab>(['home',...(enabled?warmed:[]),...(MENU_TABS.includes(active)?[active]:[])]);
}
