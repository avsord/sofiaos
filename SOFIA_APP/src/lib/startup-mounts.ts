import {useEffect,useMemo,useState} from 'react';
import type {Tab} from './types';
const MENU_TABS:Tab[]=['home','chat','pages','agenda','apps','profile'];
/** Data is prefetched independently at login. Hidden view trees are warmed one
 * per frame after Home paints, instead of blocking its first frame together.
 * A tapped page is always included synchronously, never queued behind warming. */
export function useStartupMounts(enabled:boolean,active:Tab){
 const [warmed,setWarmed]=useState<Tab[]>(['home']);
 useEffect(()=>{
  if(!enabled){setWarmed(['home']);return;}
  let live=true,frame=0,index=1;
  const next=()=>{if(!live||index>=MENU_TABS.length)return;const tab=MENU_TABS[index++];setWarmed(previous=>previous.includes(tab)?previous:[...previous,tab]);frame=requestAnimationFrame(next);};
  // Give Home a drawable frame before the first hidden tree is evaluated.
  frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(next);});
  return()=>{live=false;cancelAnimationFrame(frame);};
 },[enabled]);
 return useMemo(()=>new Set<Tab>(['home',...(enabled?warmed:[]),...(MENU_TABS.includes(active)?[active]:[])]),[enabled,warmed,active]);
}
