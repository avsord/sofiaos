/** One-use native disk reads issued before loading the application tree.
 * Values never leave memory. Same storage keys, validation and encryption;
 * a write/logout discards the prefetched value before changing persistence. */
export const AUTH_STORAGE_KEY='sofia.native.session.v1';
export const PREFS_STORAGE_KEY='sofia.native.preferences.v1';
type Read=()=>Promise<string|null>;
let auth:Promise<string|null>|null=null,prefs:Promise<string|null>|null=null;
function begin(read:Read):Promise<string|null>{
 let result:Promise<string|null>;
 try{result=read();}catch(error){result=Promise.reject(error);}
 // The UI subscribes later. Keep the original rejection for its retry screen,
 // but never emit an unhandled rejection between entrypoint and mount.
 void result.catch(()=>{});return result;
}
export function primeStartupReads(readAuth:Read,readPrefs:Read){
 if(!auth)auth=begin(readAuth);
 if(!prefs)prefs=begin(readPrefs);
}
export function takeStartupAuth(read:Read){const pending=auth;auth=null;return pending||read();}
export function takeStartupPrefs(read:Read){const pending=prefs;prefs=null;return pending||read();}
export function invalidateStartupAuth(){auth=null;}
export function invalidateStartupPrefs(){prefs=null;}
