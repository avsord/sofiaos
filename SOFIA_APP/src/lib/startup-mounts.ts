import {useMemo} from 'react';
import type {Tab} from './types';
const MENU_TABS:Tab[]=['home','chat','pages','agenda','apps','profile'];
/** Permanent tabs mount together behind the launch handoff, after disk/data
 * preparation. No delayed initialization while the user is already navigating. */
export function useStartupMounts(enabled:boolean,active:Tab){
 return useMemo(()=>new Set<Tab>(enabled?MENU_TABS:['home',...(MENU_TABS.includes(active)?[active]:[])]),[enabled,active]);
}
