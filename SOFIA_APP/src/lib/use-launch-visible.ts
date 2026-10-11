import {useEffect,useState} from 'react';
import {NativeModules} from 'react-native';
/** Unlike whenInteractive (layout/network permission), this fence resolves only
 * after the original splash has left the ready app. Never hold essential reads
 * behind it: first login and cache misses must make progress under the splash. */
export function useLaunchVisible(enabled:boolean){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  setVisible(false);if(!enabled)return;
  let live=true,first=0,second=0;
  const done=()=>{if(live)setVisible(true);};
  const fallback=()=>{if(live)first=requestAnimationFrame(()=>{if(live)second=requestAnimationFrame(done);});};
  const native=NativeModules.SofiaLaunch;
  if(native?.whenRevealed)void native.whenRevealed().then((ok:boolean)=>{if(ok)done();}).catch(fallback);
  else fallback();
  return()=>{live=false;cancelAnimationFrame(first);cancelAnimationFrame(second);};
 },[enabled]);
 return enabled&&visible;
}
