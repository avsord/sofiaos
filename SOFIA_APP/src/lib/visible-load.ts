import {useEffect} from 'react';
import type {DependencyList,EffectCallback} from 'react';
import {afterVisible} from './fluency';
/** Effects requiring visible-screen I/O; Activity tears them down on hide. */
export function useVisibleLoad(effect:EffectCallback,deps:DependencyList){useEffect(()=>{
 let cleanup:ReturnType<EffectCallback>;const cancel=afterVisible(()=>{cleanup=effect();});
 return()=>{cancel();if(typeof cleanup==='function')cleanup();};
},deps);}
