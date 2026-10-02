import React,{memo,useMemo,useRef} from 'react';
import {Animated,Pressable,StyleSheet,Text,View} from 'react-native';
import type {Tab} from '../lib/types';
import type {MenuMotion} from '../lib/menu-motion';
import {useTheme} from '../lib/theme';
import {createImmediateMenuPress,tabIndex} from '../lib/tab-navigation';
import {Icon} from './Icon';
import type {IconName} from './Icon';

type Props={item:{id:Tab;label:string;icon:IconName};selected:boolean;onSelect:(tab:Tab)=>void;motion:MenuMotion};

/** Touch-down navigation is independent of the native, continuous purple-label motion. */
export const MenuTab=memo(function MenuTab({item,selected,onSelect,motion}:Props){
 const c=useTheme();
 const latest=useRef({item,onSelect});latest.current={item,onSelect};
 const input=useRef(createImmediateMenuPress(()=>latest.current.onSelect(latest.current.item.id))).current;
 const visual=useMemo(()=>{
  const focus=motion.weights[tabIndex(item.id)];
  const opacity=focus.interpolate({inputRange:[0,1],outputRange:[0,1],extrapolate:'clamp'});
  const scale=(from:number,to:number)=>Animated.add(1,Animated.multiply(motion.motionAmount,
   Animated.subtract(focus.interpolate({inputRange:[0,1,1.08],outputRange:[from,to,to+0.025],extrapolate:'clamp'}),1)));
  return {opacity,inactive:Animated.subtract(1,opacity),pillX:scale(0.35,1),pillY:scale(0.55,1),
   icon:scale(0.96,1.04),caption:scale(0.97,1)};
 },[item.id,motion]);
 return <Pressable onPressIn={input.pressIn} onPress={input.press} onTouchCancel={input.cancel}
  unstable_pressDelay={0} onAccessibilityTap={input.accessibilityActivate}
  accessibilityActions={[{name:'activate'}]}
  onAccessibilityAction={event=>{if(event.nativeEvent.actionName==='activate')input.accessibilityActivate();}}
  accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected}}
  testID={'menu-'+item.id}
  style={styles.button}>
  <View style={styles.iconSlot} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
   <Animated.View testID={'menu-pill-'+item.id} style={[styles.pill,{backgroundColor:c.accentSoft,
    opacity:visual.opacity,transform:[{scaleX:visual.pillX},{scaleY:visual.pillY}]}]}/>
   <Animated.View style={[styles.icon,{opacity:visual.inactive,transform:[{scale:visual.icon}]}]}><Icon name={item.icon} color={c.muted}/></Animated.View>
   <Animated.View testID={'menu-symbol-'+item.id} style={[styles.icon,{opacity:visual.opacity,transform:[{scale:visual.icon}]}]}><Icon name={item.icon} color={c.accent}/></Animated.View>
  </View>
  <Animated.View style={[styles.caption,{transform:[{scale:visual.caption}]}]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
   <Animated.Text numberOfLines={1} style={[styles.text,{fontWeight:'500',color:c.muted,opacity:visual.inactive}]}>{item.label}</Animated.Text>
   <Animated.Text numberOfLines={1} style={[styles.text,styles.overlay,{fontWeight:'700',color:c.accent,opacity:visual.opacity}]}>{item.label}</Animated.Text>
  </Animated.View>
 </Pressable>;
});
const styles=StyleSheet.create({
 button:{flex:1,alignItems:'center',justifyContent:'center',minHeight:57,gap:4},
 iconSlot:{height:32,width:48,alignItems:'center',justifyContent:'center'},
 pill:{position:'absolute',top:0,left:0,right:0,bottom:0,borderRadius:999},
 icon:{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center'},
 caption:{width:'100%',alignItems:'center',justifyContent:'center'},
 text:{fontSize:9.5,textAlign:'center',width:'100%'},
 overlay:{position:'absolute',top:0,left:0,right:0,bottom:0}
});
