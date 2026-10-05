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
export function useMotionPresence(visible:boolean){
 const reduced=useReducedMotion(),progress=useRef(new Animated.Value(0)).current,epoch=useRef(0);
 const [mounted,setMounted]=useState(visible);
 useEffect(()=>{
  const token=++epoch.current;progress.stopAnimation();
  if(visible)setMounted(true);
  const animation=Animated.timing(progress,{toValue:visible?1:0,duration:reduced?0:visible?280:220,easing:MOTION_EASE,useNativeDriver:true,isInteraction:false});
  animation.start(({finished})=>{if(finished&&!visible&&token===epoch.current)setMounted(false);});
  return()=>{++epoch.current;animation.stop();};
 },[visible,reduced,progress]);
 return {mounted,progress,reduced};
}
