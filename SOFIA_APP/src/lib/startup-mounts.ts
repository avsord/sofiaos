import {useEffect,useLayoutEffect,useState} from 'react';
import type {Tab} from './types';
import {queueOptional,type FluencyMode} from './fluency';
import {useLegacyStartupMounts} from './startup-mounts-legacy';
const MENU_TABS:Tab[]=['home','chat','pages','agenda','apps','profile'];
/** Hidden Activity trees pre-render via the shared input-aware queue. */
export function useStartupMounts(enabled:boolean,active:Tab,authenticated=true,mode:FluencyMode|'pending'='old',preview:readonly Tab[]=[]){
 const old=useLegacyStartupMounts(enabled&&mode==='old',active,authenticated);
 const [warmed,setWarmed]=useState<Set<Tab>>(()=>new Set(['home']));
 useLayoutEffect(()=>{if(authenticated&&MENU_TABS.includes(active))setWarmed(p=>p.has(active)?p:new Set([...p,active]));},[active,authenticated]);
 useEffect(()=>{if(!authenticated){setWarmed(new Set(['home']));return;}
  if(!enabled||mode!=='new')return;
  const cancel=MENU_TABS.filter(t=>t!=='home'&&!warmed.has(t)).map(tab=>queueOptional('prerender:'+tab,()=>setWarmed(p=>p.has(tab)?p:new Set([...p,tab])),4));
  return()=>cancel.forEach(fn=>fn());
 },[enabled,mode,authenticated,active]);
 return mode==='new'?new Set<Tab>(['home',...warmed,...(MENU_TABS.includes(active)?[active]:[]),...preview]):old;
}
