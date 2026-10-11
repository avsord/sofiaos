import {startTransition,useEffect,useLayoutEffect,useState} from 'react';
import type {Tab} from './types';
import {queueOptional,type FluencyMode} from './fluency';
import {useLegacyStartupMounts} from './startup-mounts-legacy';
const MENU_TABS:Tab[]=['home','chat','pages','agenda','apps','profile'];
/** Real-device report (0.3.112): pre-mounting Chat/Agenda/Apps cost 385/248/247 ms and the stalls around them reached ~900 ms
 * while the user was already tapping. A plain setState renders in one blocking pass; inside startTransition React renders in
 * ~5 ms slices and yields to input between them. The pre-mount also waits until the user has stopped changing tabs for
 * this long (any tab change restarts the wait), so a burst of taps never competes with background work. */
export const PRERENDER_QUIET_MS=2500;
/** Hidden Activity trees pre-render via the shared input-aware queue. */
export function useStartupMounts(enabled:boolean,active:Tab,authenticated=true,mode:FluencyMode|'pending'='old',preview:readonly Tab[]=[]){
 const old=useLegacyStartupMounts(enabled&&mode==='old',active,authenticated);
 const [warmed,setWarmed]=useState<Set<Tab>>(()=>new Set(['home']));
 useLayoutEffect(()=>{if(authenticated&&MENU_TABS.includes(active))setWarmed(p=>p.has(active)?p:new Set([...p,active]));},[active,authenticated]);
 useEffect(()=>{if(!authenticated){setWarmed(new Set(['home']));return;}
  if(!enabled||mode!=='new')return;
  let cancel:Array<()=>void>=[];
  const wait=setTimeout(()=>{
   cancel=MENU_TABS.filter(t=>t!=='home'&&t!==active&&!warmed.has(t)).map(tab=>queueOptional('prerender:'+tab,()=>startTransition(()=>setWarmed(p=>p.has(tab)?p:new Set([...p,tab]))),4));
  },PRERENDER_QUIET_MS);
  return()=>{clearTimeout(wait);cancel.forEach(fn=>fn());};
 },[enabled,mode,authenticated,active]);
 return mode==='new'?new Set<Tab>(['home',...warmed,...(MENU_TABS.includes(active)?[active]:[]),...preview]):old;
}
