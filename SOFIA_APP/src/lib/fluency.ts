import {idleWork} from './idle-work';
import {perfEvent,perfInput,perfNow,perfSetMode,perfStart} from './fluency-metrics';
export type FluencyMode='new'|'old';
export const FLUENCY_MODE_KEY='sofia.fluency.mode.v1';
let selected:FluencyMode='old',initialized=false,sequence=0;
export const newFluency=()=>initialized&&selected==='new';
export const fluencyReady=()=>initialized;
export const fluencyMode=()=>selected;
/** Resolve only AFTER native reveal. The selection is fixed for this process. */
export function startFluency(mode:FluencyMode){if(initialized)return;initialized=true;selected=mode;perfSetMode(mode);if(mode==='new')idleWork.start();}
export function revealFluency(){perfStart();}
export function noteFluencyInput(){perfInput();if(newFluency())idleWork.noteInput();}
/** Continuous scroll/momentum: update only the idle clock, not React or tap logs. */
export function noteFluencyMovement(){if(newFluency())idleWork.noteInput();}
/** Only callers owning non-urgent work use this. Foreground writes never queue. */
export function queueOptional(name:string,run:()=>void|Promise<void>,priority=6,deadlineMs?:number):()=>void{
 let live=true;const key=name+':'+(++sequence);
 const execute=()=>{if(!live)return;const started=perfNow();try {const result=run();if(result&&typeof result.then==='function')return result.finally(()=>perfEvent(name,started));perfEvent(name,started);}catch(error){perfEvent(name,started);throw error;}};
 if(newFluency()){idleWork.enqueue({name:key,priority,deadlineMs,run:execute});return()=>{live=false;idleWork.cancel(key);};}
 try{const result=execute();if(result)void result.catch(()=>{});}catch{}return()=>{live=false;};
}
/** Current screen reads: wait 350ms; an Activity hide cancels the pending start. */
export function afterVisible(run:()=>void,delay=350){
 if(!newFluency()){run();return()=>{};}
 const timer=setTimeout(run,delay);return()=>clearTimeout(timer);
}

/** True when no touch/drag was noted recently (same window the idle queue uses). */
export function userIsIdle(){return !newFluency()||idleWork.isIdle();}
