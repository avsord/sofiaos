import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {Tab} from './types';

const MENU_TABS:Tab[]=['home','chat','pages','agenda','apps','profile'];

/** The Home alone mounts beneath the splash. Only after native reveal AND
 * encrypted archive hydration do we begin optional per-frame screen mounts.
 * Any foreground menu change cancels pending warm work, retains visited tabs,
 * and resumes only after 500ms without another tab change. */
export function useStartupMounts(enabled:boolean,active:Tab,authenticated=true){
 const [warmed,setWarmed]=useState<Set<Tab>>(()=>new Set(['home']));
 const lastTab=useRef(active);
 const cancelPending=useRef<()=>void>(()=>{});
 useLayoutEffect(()=>{
  if(lastTab.current!==active)cancelPending.current();
  if(MENU_TABS.includes(active))setWarmed(previous=>previous.has(active)?previous:new Set([...previous,active]));
 },[active]);
 useEffect(()=>{
  if(!authenticated){
   lastTab.current=active;
   setWarmed(previous=>previous.size===1&&previous.has('home')?previous:new Set(['home']));
   return;
  }
  // Hydration may still be running while the user can already tap a tab.
  // Keep that visit mounted instead of erasing it before warmup is enabled.
  if(!enabled){lastTab.current=active;return;}
  let cancelled=false,frame=0,timer:ReturnType<typeof setTimeout>|null=null,index=0;
  const pending=MENU_TABS.filter(tab=>tab!=='home'&&!warmed.has(tab));
  const advance=()=>{
   if(cancelled||index>=pending.length)return;
   const tab=pending[index++];
   setWarmed(previous=>previous.has(tab)?previous:new Set([...previous,tab]));
   if(index<pending.length)frame=requestAnimationFrame(advance);
  };
  const start=()=>{
   if(cancelled||!pending.length)return;
   // Leave the first committed frame free for foreground interactions.
   frame=requestAnimationFrame(()=>{if(!cancelled)frame=requestAnimationFrame(advance);});
  };
  const switched=lastTab.current!==active;
  lastTab.current=active;
  if(switched)timer=setTimeout(start,500);
  else start();
  const cancel=()=>{
   cancelled=true;
   cancelAnimationFrame(frame);
   if(timer!==null)clearTimeout(timer);
  };
  cancelPending.current=cancel;
  return cancel;
 },[enabled,active,authenticated]);
 return new Set<Tab>(['home',...warmed,...(MENU_TABS.includes(active)?[active]:[])]);
}
