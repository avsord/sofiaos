import {useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Keyboard} from 'react-native';

export const MOTION_EASE=Easing.bezier(.2,.8,.2,1);
export function useReducedMotion(){
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{let alive=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setReduced(value);});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{alive=false;sub.remove();};},[]);
 return reduced;
}
export function useKeyboardVisible(){
 const [visible,setVisible]=useState(()=>Keyboard.isVisible());
 useEffect(()=>{const show=Keyboard.addListener('keyboardDidShow',()=>setVisible(true)),hide=Keyboard.addListener('keyboardDidHide',()=>setVisible(false));return()=>{show.remove();hide.remove();};},[]);
 return visible;
}
/** Retain the exiting surface. Interruptions continue from its current position. */
export function useMotionPresence(visible:boolean,{enterReady=true,enterDuration=280,exitDuration=220}:{enterReady?:boolean;enterDuration?:number;exitDuration?:number}={}){
 const reduced=useReducedMotion(),progress=useRef(new Animated.Value(0)).current,epoch=useRef(0);
 const [mounted,setMounted]=useState(visible);
 useEffect(()=>{
  // A closed panel has no native surface to animate. Previously every hidden
  // sheet started a zero-to-zero animation during the first Home commit.
  if(!visible&&!mounted)return;
  const token=++epoch.current;progress.stopAnimation();
  if(visible)setMounted(true);
  // A native Modal may attach after React's visibility effect. Keep it at the
  // entrance position until onShow/layout, rather than spending the animation
  // while its window is still invisible.
  if(visible&&!enterReady){progress.setValue(0);return;}
  const animation=Animated.timing(progress,{toValue:visible?1:0,duration:reduced?0:visible?enterDuration:exitDuration,easing:MOTION_EASE,useNativeDriver:true,isInteraction:false});
  animation.start(({finished})=>{if(finished&&!visible&&token===epoch.current)setMounted(false);});
  return()=>{++epoch.current;animation.stop();};
 },[visible,reduced,progress,enterReady,enterDuration,exitDuration]);
 return {mounted,progress,reduced};
}
