import {startTransition,useEffect,useLayoutEffect,useState} from 'react';
import type {Tab} from './types';
import {queueOptional,type FluencyMode} from './fluency';
import {useLegacyStartupMounts} from './startup-mounts-legacy';
const MENU_TABS:Tab[]=['home','chat','pages','agenda','apps','profile'];
/** Real-device reports (0.3.112, 0.3.113): pre-mounting Chat/Agenda/Apps costs 385/248/247 ms in one blocking pass.
 * A plain setState renders in one pass; inside startTransition React renders in ~5 ms slices and yields to input.
 * LESSON (0.3.113): a fixed wait before pre-mounting made things worse. In that report all five tabs were mounted by the
 * user's own taps and swipes (each swipe mounts the neighbours synchronously) before the wait could even end, so every
 * first mount landed inside a gesture. Pre-mount starts as early as the queue allows and the wait does not exist. */
/** Hidden Activity trees pre-render via the shared input-aware queue. */
export function useStartupMounts(enabled:boolean,active:Tab,authenticated=true,mode:FluencyMode|'pending'='old',preview:readonly Tab[]=[]){
 const old=useLegacyStartupMounts(enabled&&mode==='old',active,authenticated);
 const [warmed,setWarmed]=useState<Set<Tab>>(()=>new Set(['home']));
// Tapping a tab that is not mounted yet used to mount its whole screen inside the tap (Chat 161-331 ms, Agenda 222-362 ms on the
 // owner's phone). Now the urgent render shows a skeleton and the screen is rendered in a transition, which yields to input.
 useLayoutEffect(()=>{if(authenticated&&MENU_TABS.includes(active))startTransition(()=>setWarmed(p=>p.has(active)?p:new Set([...p,active])));},[active,authenticated]);
 useEffect(()=>{if(!authenticated){setWarmed(new Set(['home']));return;}
  if(!enabled||mode!=='new')return;
  const cancel=MENU_TABS.filter(t=>t!=='home'&&t!==active&&!warmed.has(t)).map(tab=>queueOptional('prerender:'+tab,()=>startTransition(()=>setWarmed(p=>p.has(tab)?p:new Set([...p,tab]))),4));
  return()=>cancel.forEach(fn=>fn());
 },[enabled,mode,authenticated,active]);
// Old mode keeps the legacy behaviour untouched. New mode: a tab is mounted only once warmed (transition) or previewed by a swipe;
 // until then the pager shows its skeleton, so the tap itself never pays for a screen.
 return mode==='new'?new Set<Tab>(['home',...warmed,...preview]):old;
}
