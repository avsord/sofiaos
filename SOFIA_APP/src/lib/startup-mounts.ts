import {useEffect,useState} from 'react';
import type {Tab} from './types';
const MENU_TABS:Tab[]=['home','chat','agenda','pages','apps','profile'];
/** Network/data prefetch is independent. Hidden view trees warm one idle slice
 * at a time, and selecting any tab mounts it immediately without waiting. */
export function useStartupMounts(enabled:boolean,active:Tab){
 const [warmed,setWarmed]=useState<Set<Tab>>(()=>new Set(['home']));
 useEffect(()=>{
  if(!enabled){setWarmed(new Set(['home']));return;}
  let stopped=false,index=1,frame=0,idle=0;
  const schedule=()=>{
   if(stopped||index>=MENU_TABS.length)return;
   const run=()=>{if(stopped)return;const next=MENU_TABS[index++];setWarmed(prev=>new Set([...prev,next]));schedule();};
   if(typeof requestIdleCallback==='function')idle=requestIdleCallback(run);
   else frame=requestAnimationFrame(run);
  };
  // Leave the first real Home frame to Android before warming hidden trees.
  frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(schedule);});
  return()=>{stopped=true;cancelAnimationFrame(frame);if(idle&&typeof cancelIdleCallback==='function')cancelIdleCallback(idle);};
 },[enabled]);
 useEffect(()=>{if(enabled&&MENU_TABS.includes(active))setWarmed(prev=>prev.has(active)?prev:new Set([...prev,active]));},[enabled,active]);
 return new Set<Tab>(['home',...(enabled?warmed:[]),...(MENU_TABS.includes(active)?[active]:[])]);
}
