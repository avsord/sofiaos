import type {Tab} from './types';
const MENU_TABS:Tab[]=['home','chat','agenda','pages','apps','profile'];
/** Warm all six screen trees beneath the native splash, using account-owned
 * cached state. Never create the first component tree only when tapped: doing
 * that made the native pager show empty white slots during lazy import/mount.
 * Once mounted, tabs remain alive and preserve their local drafts and scroll.
 * Server-only data still synchronizes in the background; never fake it. */
export function useStartupMounts(enabled:boolean,active:Tab){
 return new Set<Tab>(['home',...(enabled?MENU_TABS:[]),...(MENU_TABS.includes(active)?[active]:[])]);
}
