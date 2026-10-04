import {useEffect,useMemo,useReducer} from 'react';
import type {Entity} from './types';
import type {SofiaApi} from './api';
import {errorText} from './chat-model';
export const LIBRARY_ALL='@library';
type Entry={items:Entity[];loaded:boolean;loading:boolean;refreshing:boolean;error:string;request:number};
/** A category keeps its last confirmed snapshot during refresh and navigation. */
export class WorkspaceRecords {
 private entries=new Map<string,Entry>();
 private key(kind:string,query:string){return JSON.stringify([kind,query]);}
 view(kind:string,query:string):Entry {
  const key=this.key(kind,query);let entry=this.entries.get(key);
  if(!entry){entry={items:[],loaded:!kind,loading:false,refreshing:false,error:'',request:0};this.entries.set(key,entry);}
  return entry;
 }
 async load(api:Pick<SofiaApi,'entities'|'library'>,kind:string,query:string,changed:()=>void,more=false,manual=false){
  if(!kind)return;const entry=this.view(kind,query),request=++entry.request;
  entry.loading=true;entry.refreshing=manual;changed();
  try{const offset=more?entry.items.length:0;const result=await (kind===LIBRARY_ALL?api.library(query,offset):api.entities(kind,query,offset));if(request!==entry.request)return;
   entry.items=more?[...new Map([...entry.items,...result.items].map(row=>[row.id,row])).values()]:result.items;
   entry.loaded=true;entry.error='';
  }catch(error){if(request===entry.request)entry.error=errorText(error);}
  finally{if(request===entry.request){entry.loading=false;entry.refreshing=false;changed();}}
 }
}
export function useWorkspaceRecords(api:SofiaApi,kind:string,query:string){
 const cache=useMemo(()=>new WorkspaceRecords(),[api]),[,changed]=useReducer(n=>n+1,0);
 const load=(more=false,manual=false)=>cache.load(api,kind,query,changed,more,manual);
 useEffect(()=>{if(!kind)return;const timer=setTimeout(()=>void load(),query?250:0);return()=>clearTimeout(timer);},[api,kind,query,cache]);
 return {...cache.view(kind,query),load};
}
