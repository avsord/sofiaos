import {useCallback,useEffect,useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {VALUES_MASK_PATH} from './startup-snapshot';
/** 0.3.255: olho dos valores, igual no Inicio e em Financas. Fica do jeito que a pessoa deixou da ultima vez.
 * Leitura sincrona no primeiro quadro (pacote de abertura) e copia no AsyncStorage, que nao expira. */
type Store={cached<T>(path:string):T|undefined|null;rememberLocal(path:string,value:unknown):void;persistLaunchProjection?:()=>Promise<void>};
const DISK_KEY='sofia.values-mask.v1';
const known=new WeakMap<object,boolean>(),listeners=new Set<(owner:object,hidden:boolean)=>void>();
export function readValuesHidden(api:Store):boolean{
 const mem=known.get(api);if(mem!==undefined)return mem;
 const raw:any=api.cached(VALUES_MASK_PATH);return !!raw&&raw.v===1&&raw.hidden===true;
}
export function setValuesHidden(api:Store,hidden:boolean){
 known.set(api,hidden);api.rememberLocal(VALUES_MASK_PATH,{v:1,hidden});
 void api.persistLaunchProjection?.().catch(()=>{});
 void AsyncStorage.setItem(DISK_KEY,hidden?'1':'0').catch(()=>{});
 listeners.forEach(f=>f(api,hidden));
}
export const maskMoney=(hidden:boolean,text:string)=>hidden?'R$ •••••':text;
export function useValuesHidden(api:Store):[boolean,(hidden:boolean)=>void]{
 const [hidden,setHidden]=useState(()=>readValuesHidden(api));
 useEffect(()=>{
  let live=true;const f=(owner:object,v:boolean)=>{if(owner===api)setHidden(v);};listeners.add(f);
  setHidden(readValuesHidden(api));
  if(!known.has(api))AsyncStorage.getItem(DISK_KEY).then(v=>{if(!live||known.has(api)||(v!=='1'&&v!=='0'))return;const h=v==='1';known.set(api,h);setHidden(h);const raw:any=api.cached(VALUES_MASK_PATH);if(!raw||raw.hidden!==h)api.rememberLocal(VALUES_MASK_PATH,{v:1,hidden:h});}).catch(()=>{});
  return()=>{live=false;listeners.delete(f);};
 },[api]);
 const change=useCallback((v:boolean)=>setValuesHidden(api,v),[api]);
 return [hidden,change];
}
