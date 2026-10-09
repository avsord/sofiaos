import {useCallback,useEffect,useState} from 'react';
import {AppState} from 'react-native';
import type {SofiaApi} from './api';
import {createAgendaCache,monthKey,type AgendaResponse} from './agenda-cache';
import {subscribeAgenda} from './agenda-events';
import {subscribeSystemChanged} from './system-events';
const stores=new WeakMap<SofiaApi,ReturnType<typeof createAgendaCache>>();
export function cacheFor(api:SofiaApi){let cache=stores.get(api);if(!cache){cache=createAgendaCache(month=>api.agenda(month));stores.set(api,cache);}const current=new Date();for(const delta of [-1,0,1]){const key=monthKey(new Date(current.getFullYear(),current.getMonth()+delta,1)),saved=api.cached<AgendaResponse>('/agenda?month='+key);if(saved)cache.seed(key,saved);}return cache;}
export async function preloadAgenda(api:SofiaApi){const cache=cacheFor(api),key=monthKey(new Date());await cache.load(key);const result=cache.snapshot(key);if(result.error&&!result.loadedAt)throw result.error;void cache.warm(key);return result;}
export function useAgendaMonth(api:SofiaApi,month:Date,active=true,warmAdjacent=true){
 const key=monthKey(month),cache=cacheFor(api),[,render]=useState(0);
 const refresh=useCallback(()=>warmAdjacent?cache.warm(key,true):cache.load(key,true),[cache,key,warmAdjacent]);
 useEffect(()=>{const unsubscribe=cache.subscribe(key,()=>render(n=>n+1));void (warmAdjacent?cache.warm(key):cache.load(key));const system=subscribeSystemChanged(owner=>{if(owner===api){cache.invalidate();if(active)void refresh();}});if(!active)return()=>{unsubscribe();system();};const changed=subscribeAgenda(owner=>{if(owner===api){cache.invalidate();void refresh();}});const app=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>{unsubscribe();changed();system();app.remove();};},[api,cache,key,active,refresh,warmAdjacent]);
 return {...cache.snapshot(key),refresh};
}
