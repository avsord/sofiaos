import {useCallback,useEffect,useState} from 'react';
import {AppState} from 'react-native';
import type {SofiaApi} from './api';
import {createAgendaCache,monthKey} from './agenda-cache';
import {subscribeAgenda} from './agenda-events';
const stores=new WeakMap<SofiaApi,ReturnType<typeof createAgendaCache>>();
function cacheFor(api:SofiaApi){let cache=stores.get(api);if(!cache){cache=createAgendaCache(month=>api.agenda(month));stores.set(api,cache);}return cache;}
export function useAgendaMonth(api:SofiaApi,month:Date,active=true){
 const key=monthKey(month),cache=cacheFor(api),[,render]=useState(0);
 const refresh=useCallback(()=>cache.warm(key,true),[cache,key]);
 useEffect(()=>{if(!active)return;const unsubscribe=cache.subscribe(key,()=>render(n=>n+1));void cache.warm(key);const changed=subscribeAgenda(owner=>{if(owner===api){cache.invalidate();void refresh();}});const app=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>{unsubscribe();changed();app.remove();};},[api,cache,key,active,refresh]);
 return {...cache.snapshot(key),refresh};
}
