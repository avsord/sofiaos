import AsyncStorage from '@react-native-async-storage/async-storage';
export const LAST_ERROR_KEY='sofia.last-error.v1';
/** What was recorded about a failure: error type, the engine message for engine
 * errors only (TypeError and friends describe code, never user content), and
 * component names. Persisted so the cause survives closing and reopening the app. */
export type StoredError={scope:string;name:string;detail:string;components:string[];atMs:number;savedAt:number;version?:string};
export function rememberError(row:Omit<StoredError,'savedAt'>,now:()=>number=Date.now){
 try{void AsyncStorage.setItem(LAST_ERROR_KEY,JSON.stringify({...row,savedAt:now()})).catch(()=>{});}catch{}
}
export async function readLastError():Promise<StoredError|null>{
 try{const raw=await AsyncStorage.getItem(LAST_ERROR_KEY);return raw?JSON.parse(raw) as StoredError:null;}catch{return null;}
}
export async function clearLastError(){try{await AsyncStorage.removeItem(LAST_ERROR_KEY);}catch{}}
/** One readable line, for the fallback screens and the report. */
export function errorLine(row:Pick<StoredError,'scope'|'name'|'detail'|'components'>|null|undefined){
 if(!row)return '';
 const parts=[row.name+(row.detail?': '+row.detail:''),row.components.length?'em '+row.components.join(' > '):''];
 return parts.filter(Boolean).join(' ');
}
