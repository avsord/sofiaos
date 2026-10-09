import {useEffect,useState} from 'react';
import type {Tab} from './types';
const MENU_TABS:Tab[]=['home','chat','agenda','pages','apps','profile'];
/** Only screens the owner has selected are mounted. Importing a module during
 * an idle slice is cheap; mounting five hidden screens, running hooks and
 * starting network reads while Home is visible steals time from real taps.
 * Previously visited screens stay mounted to preserve their drafts/scroll. */
export function useStartupMounts(enabled:boolean,active:Tab){
 const [warmed,setWarmed]=useState<Set<Tab>>(()=>new Set(['home']));
 useEffect(()=>{
  if(!enabled){
   setWarmed(previous=>previous.size===1&&previous.has('home')?previous:new Set(['home']));
   return;
  }
  if(MENU_TABS.includes(active))setWarmed(previous=>previous.has(active)?previous:new Set([...previous,active]));
 },[enabled,active]);
 return new Set<Tab>(['home',...(enabled?warmed:[]),...(MENU_TABS.includes(active)?[active]:[])]);
}
