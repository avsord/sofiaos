import {NativeModules} from 'react-native';
/** Called from the committed, correctly themed React effect. Do not add frames,
 * a global success latch, or a logo timer. Android owns the only splash screen. */
export function finishLaunchHandoff(){
 try{void NativeModules.SofiaLaunch?.hide?.().catch?.(()=>{});}catch{}
}
