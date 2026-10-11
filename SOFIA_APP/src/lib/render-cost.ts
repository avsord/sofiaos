import {useLayoutEffect} from 'react';
import {perfNow,perfRender} from './fluency-metrics';
/** Call first thing in a component body. Measures every render of it (render start to layout commit) and reports it
 * as 'render:<name>' so JS stalls can be attributed to React work. Cost: one timestamp per render. */
export function useRenderCost(name:string){const start=perfNow();useLayoutEffect(()=>{perfRender(name,start);});}
