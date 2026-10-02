import React,{memo,useRef} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {Tab} from '../lib/types';
import {useTheme} from '../lib/theme';
import {createImmediateMenuPress} from '../lib/tab-navigation';
import {Icon} from './Icon';
import type {IconName} from './Icon';

type Props={item:{id:Tab;label:string;icon:IconName};selected:boolean;onSelect:(tab:Tab)=>void};

/** Fixed menu buttons react on touch-down, not after the finger is released. */
export const MenuTab=memo(function MenuTab({item,selected,onSelect}:Props){
 const c=useTheme();
 const latest=useRef({item,onSelect});latest.current={item,onSelect};
 const input=useRef(createImmediateMenuPress(()=>latest.current.onSelect(latest.current.item.id))).current;
 return <Pressable onPressIn={input.pressIn} onPress={input.press} onTouchCancel={input.cancel}
  unstable_pressDelay={0} onAccessibilityTap={input.accessibilityActivate}
  accessibilityActions={[{name:'activate'}]}
  onAccessibilityAction={event=>{if(event.nativeEvent.actionName==='activate')input.accessibilityActivate();}}
  accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected}}
  testID={'menu-'+item.id}
  style={{flex:1,alignItems:'center',justifyContent:'center',minHeight:57,gap:4}}>
  <View style={{height:32,minWidth:48,borderRadius:999,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:selected?c.accentSoft:'transparent'}}><Icon name={item.icon} color={selected?c.accent:c.muted}/></View>
  <Text style={{fontSize:9.5,fontWeight:selected?'700':'500',color:selected?c.accent:c.muted}}>{item.label}</Text>
 </Pressable>;
});
