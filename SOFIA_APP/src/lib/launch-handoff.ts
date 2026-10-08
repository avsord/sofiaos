import {NativeModules} from 'react-native';
/** The native layout listener is primary. This idempotent backup runs for each
 * mounted shell; no process-global flag can strand a recreated Activity. */
export function finishLaunchHandoff(){
 const frame=requestAnimationFrame(()=>{
  try{void NativeModules.SofiaLaunch?.hide?.().catch?.(()=>{});}catch{}
 });
 return()=>cancelAnimationFrame(frame);
}
