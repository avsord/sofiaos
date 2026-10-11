import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Animated,AppState,Easing,View} from 'react-native';
import Svg,{G,Path} from 'react-native-svg';

/** Visible, non-blocking logo handoff after the Android system splash.
 * The framework may omit AnimatedVectorDrawable playback on some handsets,
 * and hot resumes do not display a system splash at all. This native-driver
 * animation is guaranteed to be scheduled on the actual visible React view.
 * The Home is already interactive underneath; it never waits for completion. */
const S_PATH="M1227 1446V1130Q1104 1185 987.0 1213.0Q870 1241 766 1241Q628 1241 562.0 1203.0Q496 1165 496 1085Q496 1025 540.5 991.5Q585 958 702 934L866 901Q1115 851 1220.0 749.0Q1325 647 1325 459Q1325 212 1178.5 91.5Q1032 -29 731 -29Q589 -29 446.0 -2.0Q303 25 160 78V403Q303 327 436.5 288.5Q570 250 694 250Q820 250 887.0 292.0Q954 334 954 412Q954 482 908.5 520.0Q863 558 727 588L578 621Q354 669 250.5 774.0Q147 879 147 1057Q147 1280 291.0 1400.0Q435 1520 705 1520Q828 1520 958.0 1501.5Q1088 1483 1227 1446Z";
export function LaunchSAnimation({visible}:{visible:boolean}){
 const [show,setShow]=useState(false);
 const progress=useRef(new Animated.Value(0)).current;
 const animation=useRef<Animated.CompositeAnimation|null>(null);
 const pendingFrame=useRef(0);
 const lastState=useRef(AppState.currentState);
 const ready=useRef(false);
 const play=useCallback(()=>{
  if(!ready.current)return;
  if(pendingFrame.current)cancelAnimationFrame(pendingFrame.current);
  animation.current?.stop();
  progress.setValue(0);
  setShow(true);
  // Start on the next frame so the SVG image is attached before native driver.
  pendingFrame.current=requestAnimationFrame(()=>{
   pendingFrame.current=0;
   animation.current=Animated.timing(progress,{toValue:1,duration:620,easing:Easing.out(Easing.cubic),useNativeDriver:true,isInteraction:false});
   animation.current.start(({finished})=>{if(finished)setShow(false);});
  });
 },[progress]);
 useEffect(()=>{
  ready.current=visible;
  if(visible)play();else {animation.current?.stop();setShow(false);}
  return()=>{ready.current=false;if(pendingFrame.current)cancelAnimationFrame(pendingFrame.current);animation.current?.stop();};
 },[visible,play]);
 useEffect(()=>{
  const sub=AppState.addEventListener('change',next=>{
   const previous=lastState.current;lastState.current=next;
   if(next==='active'&&previous!=='active'&&ready.current)play();
  });
  return()=>sub.remove();
 },[play]);
 const opacity=progress.interpolate({inputRange:[0,.60,.95,1],outputRange:[1,1,.06,0]});
 const rotate=progress.interpolate({inputRange:[0,.7,1],outputRange:['-34deg','6deg','0deg']});
 const scale=progress.interpolate({inputRange:[0,.65,1],outputRange:[.64,1.14,1]});
 if(!visible||!show)return null;
 return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
   testID="sofia-visible-logo-animation"
   style={{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center',zIndex:1000,elevation:1000}}>
  <Animated.View style={{width:116,height:116,borderRadius:58,backgroundColor:'#7258E8',alignItems:'center',justifyContent:'center',opacity,elevation:4}}>
   <Animated.View style={{width:106,height:106,alignItems:'center',justifyContent:'center',transform:[{rotate},{scale}]}}>
    <Svg width={106} height={106} viewBox="0 0 96 96">
     <G transform="matrix(0.0256689159 0 0 -0.025675773 29.02543638 64.14633546)">
      <Path fill="#FFFFFF" d={S_PATH}/>
     </G>
    </Svg>
   </Animated.View>
  </Animated.View>
 </View>;
}
