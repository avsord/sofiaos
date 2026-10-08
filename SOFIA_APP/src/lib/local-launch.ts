import type {Auth,Prefs} from './types';
import type {StartupSnapshot} from './startup-snapshot';
export type LocalLaunch={auth:Auth|null;prefs:Prefs;snapshot:StartupSnapshot|null};
/** Disk-only launch lane: authentication, theme and existing encrypted records.
 * No requests, timers, notification inventory or offscreen view work here. */
export async function prepareLocalLaunch(
 readAuth:()=>Promise<Auth|null>,readPrefs:()=>Promise<Prefs>,
 snapshotFor:(scope:string)=>StartupSnapshot
):Promise<LocalLaunch>{
 const account=readAuth();
 const restored=account.then(async auth=>{
  if(!auth)return {auth,snapshot:null};
  const snapshot=snapshotFor(auth.profile.email);
  await snapshot.hydrate();
  console.info('SOFIA_STARTUP_CACHE_READY');
  return {auth,snapshot};
 });
 const [saved,prefs]=await Promise.all([restored,readPrefs()]);
 return {...saved,prefs};
}
