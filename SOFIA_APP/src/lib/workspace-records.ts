import {useEffect,useMemo,useReducer} from 'react';
import type {Entity} from './types';
import type {SofiaApi} from './api';
import {errorText} from './chat-model';
export const LIBRARY_ALL='@library';
export const LISTS_ALL='@lists';
export const LIST_KINDS=['list_collection','list_item','shopping_item','purchase_group','purchase'];
type Entry={items:Entity[];loaded:boolean;hasMore:boolean;loading:boolean;refreshing:boolean;error:string;request:number};
/** A category keeps its last confirmed snapshot during refresh and navigation. */
export class WorkspaceRecords {
 private entries=new Map<string,Entry>();
 private key(kind:string,query:string){return JSON.stringify([kind,query]);}
 view(kind:string,query:string):Entry {
  const key=this.key(kind,query);let entry=this.entries.get(key);
  if(!entry){entry={items:[],loaded:!kind,hasMore:false,loading:false,refreshing:false,error:'',request:0};this.entries.set(key,entry);}
  return entry;
 }
 upsert(kind:string,query:string,record:Entity){const entry=this.view(kind,query);entry.request++;entry.loading=false;entry.refreshing=false;entry.items=entry.items.some(row=>row.id===record.id)?entry.items.map(row=>row.id===record.id?record:row):[record,...entry.items];}
 async load(api:Pick<SofiaApi,'entities'|'library'>,kind:string,query:string,changed:()=>void,more=false,manual=false,complete=false){
  if(!kind)return;const entry=this.view(kind,query),request=++entry.request;
  entry.loading=true;entry.refreshing=manual;changed();
  try{if(kind===LISTS_ALL){const groups=await Promise.all(LIST_KINDS.map(async type=>{const rows:Entity[]=[];let offset=0;while(true){const page=await api.entities(type,query,offset);if(page.items.length&&page.items.every(item=>rows.some(row=>row.id===item.id)))throw Error('Não foi possível completar as listas. Tente novamente.');rows.push(...page.items);if(page.items.length<100)break;offset+=page.items.length;}return rows;}));if(request!==entry.request)return;entry.items=[...new Map(groups.flat().map(row=>[row.id,row])).values()];entry.loaded=true;entry.hasMore=false;entry.error='';return;}const offset=more?entry.items.length:0;let result=await (kind===LIBRARY_ALL?api.library(query,offset):api.entities(kind,query,offset));if(request!==entry.request)return;
   // Library filters must cover the whole category, including later API pages.
   if((complete||kind==='film')&&!more){const all=new Map(result.items.map(row=>[row.id,row]));let page=result.items,nextOffset=page.length;
    while(page.length===100){const next=await (kind===LIBRARY_ALL?api.library(query,nextOffset):api.entities(kind,query,nextOffset));if(request!==entry.request)return;page=next.items;nextOffset+=page.length;const before=all.size;page.forEach(row=>all.set(row.id,row));if(page.length&&all.size===before)throw Error('Não foi possível completar a lista desta categoria. Tente novamente.');}
    result={items:[...all.values()]};
   }
   entry.items=more?[...new Map([...entry.items,...result.items].map(row=>[row.id,row])).values()]:result.items;
   entry.loaded=true;entry.hasMore=!complete&&kind!=='film'&&result.items.length===100;entry.error='';
  }catch(error){if(request===entry.request)entry.error=errorText(error);}
  finally{if(request===entry.request){entry.loading=false;entry.refreshing=false;changed();}}
 }
}
export function useWorkspaceRecords(api:SofiaApi,kind:string,query:string,complete=false){
 const cache=useMemo(()=>new WorkspaceRecords(),[api]),[,changed]=useReducer(n=>n+1,0);
 const load=(more=false,manual=false)=>cache.load(api,kind,query,changed,more,manual,complete);
 useEffect(()=>{if(!kind)return;const timer=setTimeout(()=>void load(),query?250:0);return()=>clearTimeout(timer);},[api,kind,query,cache,complete]);
 return {...cache.view(kind,query),load,merge:(record:Entity)=>{cache.upsert(kind,query,record);changed();}};
}
