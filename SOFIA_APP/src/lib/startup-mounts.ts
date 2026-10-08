import {useEffect,useState} from 'react';
import {InteractionManager} from 'react-native';
import type {Tab} from './types';

const MENU_TABS:Tab[]=['home','chat','pages','agenda','apps','profile'];
const add=(current:Set<Tab>,tabs:Tab[])=>{let changed=false;const next=new Set(current);for(const tab of tabs)if(MENU_TABS.includes(tab)&&!next.has(tab)){next.add(tab);changed=true;}return changed?next:current;};

/** Keep the first native frame small, then progressively mount permanent tab trees.
 * Once a tab mounts it is never unmounted, preserving drafts and scroll position.
 * A tab selected before its warm-up slot mounts immediately.
 */
export function useStartupMounts(enabled:boolean,active:Tab){
 const [mounted,setMounted]=useState<Set<Tab>>(()=>new Set<Tab>(['home']));
 useEffect(()=>{if(MENU_TABS.includes(active))setMounted(current=>add(current,[active]));},[active]);
 useEffect(()=>{
  if(!enabled){setMounted(new Set<Tab>(['home']));return;}
  let cancelled=false;const timers:ReturnType<typeof setTimeout>[]=[];
  const task=InteractionManager.runAfterInteractions(()=>{
   if(cancelled)return;
   // Conversation + Agenda are the most likely adjacent destinations.
   timers.push(setTimeout(()=>{if(!cancelled)setMounted(current=>add(current,['chat','agenda']));},90));
   // Pages/Profile are lighter than the Apps workspace.
   timers.push(setTimeout(()=>{if(!cancelled)setMounted(current=>add(current,['pages','profile']));},280));
   // Apps mounts last because its catalog/editors have the largest React tree.
   timers.push(setTimeout(()=>{if(!cancelled)setMounted(current=>add(current,['apps']));},520));
  });
  return()=>{cancelled=true;task.cancel();for(const timer of timers)clearTimeout(timer);};
 },[enabled]);
 return MENU_TABS.includes(active)?add(mounted,[active]):mounted;
}
