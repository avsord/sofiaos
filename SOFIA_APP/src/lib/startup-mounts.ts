import {useEffect,useLayoutEffect,useState} from 'react';
import type {Tab} from './types';

// Favor the two most-used views; all five use the same post-reveal sequence.
const MENU_TABS:Tab[]=['home','chat','agenda','pages','apps','profile'];

/** Render Home alone while Android owns the splash. Only after its native fade
 * reports visible, mount one retained offscreen tab per animation frame.
 * Chaining idle callbacks caused a new two-frame + up-to-1500ms idle wait for
 * EACH tab. The first frame after reveal is left untouched, and subsequent
 * per-frame work yields between heavy mounts rather than blocking one frame
 * with every screen. A user-selected tab always mounts on demand, even if the
 * optional warmup has not reached it. */
export function useStartupMounts(enabled:boolean,active:Tab){
 const [warmed,setWarmed]=useState<Set<Tab>>(()=>new Set(['home']));
 // Persist a user visit before another tap can remove its screen tree.
 // The current tab is included in this render; the layout effect retains it.
 useLayoutEffect(()=>{
  if(MENU_TABS.includes(active))setWarmed(previous=>previous.has(active)?previous:new Set([...previous,active]));
 },[active]);
 useEffect(()=>{
  if(!enabled){
   setWarmed(previous=>previous.size===1&&previous.has('home')?previous:new Set(['home']));
   return;
  }
  let cancelled=false,frame=0,index=0;
  const pending=MENU_TABS.filter(tab=>tab!=='home');
  const next=()=>{
   if(cancelled||index>=pending.length)return;
   const tab=pending[index++];
   setWarmed(previous=>previous.has(tab)?previous:new Set([...previous,tab]));
   if(index<pending.length)frame=requestAnimationFrame(next);
  };
  // Yield the first newly visible frame to Home. Unlike a chained idle task,
  // each subsequent tab needs only a frame boundary, not another idle window.
  frame=requestAnimationFrame(()=>{if(!cancelled)frame=requestAnimationFrame(next);});
  return()=>{cancelled=true;cancelAnimationFrame(frame);};
 },[enabled]);
 return new Set<Tab>(['home',...warmed,...(MENU_TABS.includes(active)?[active]:[])]);
}
