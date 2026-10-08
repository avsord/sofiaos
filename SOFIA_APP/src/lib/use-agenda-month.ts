import {useCallback,useEffect,useState} from 'react';
import {AppState} from 'react-native';
import type {SofiaApi} from './api';
import {createAgendaCache,monthKey} from './agenda-cache';
import {subscribeAgenda} from './agenda-events';
import {subscribeSystemChanged} from './system-events';
const stores=new WeakMap<SofiaApi,ReturnType<typeof createAgendaCache>>();
export function cacheFor(api:SofiaApi){let cache=stores.get(api);if(!cache){cache=createAgendaCache(month=>api.agenda(month));stores.set(api,cache);}return cache;}
export function preloadAgenda(api:SofiaApi){return cacheFor(api).warm(monthKey(new Date()));}
export function useAgendaMonth(api:SofiaApi,month:Date,active=true){
 const key=monthKey(month),cache=cacheFor(api),[,render]=useState(0);
 const refresh=useCallback(()=>cache.warm(key,true),[cache,key]);
 useEffect(()=>{const unsubscribe=cache.subscribe(key,()=>render(n=>n+1));void cache.warm(key);const system=subscribeSystemChanged(owner=>{if(owner===api){cache.invalidate();if(active)void refresh();}});if(!active)return()=>{unsubscribe();system();};const changed=subscribeAgenda(owner=>{if(owner===api){cache.invalidate();void refresh();}});const app=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>{unsubscribe();changed();system();app.remove();};},[api,cache,key,active,refresh]);
 return {...cache.snapshot(key),refresh};
}
