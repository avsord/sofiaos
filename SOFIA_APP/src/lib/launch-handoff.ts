import {NativeModules} from 'react-native';

let hidden=false;
/** Remove the native cold-start cover only after React has committed the
 * correctly-themed destination. Two frames avoid exposing an incomplete tree.
 */
export function finishLaunchHandoff(){
 if(hidden)return;
 let second=0;
 const first=requestAnimationFrame(()=>{
  second=requestAnimationFrame(()=>{
   hidden=true;
   try{void NativeModules.SofiaLaunch?.hide?.().catch?.(()=>{});}catch{}
  });
 });
 return()=>{cancelAnimationFrame(first);if(second)cancelAnimationFrame(second);};
}
