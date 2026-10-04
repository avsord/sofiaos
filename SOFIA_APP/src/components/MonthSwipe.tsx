import React,{useMemo,useRef} from 'react';
import {PanResponder,Platform,View} from 'react-native';
export function MonthSwipe({children,onMonth,onLock}:{children:React.ReactNode;onMonth:(delta:number)=>void;onLock?:(locked:boolean)=>void}){
 const latest=useRef({onMonth,onLock});latest.current={onMonth,onLock};
 // Android reserves the outer native pager at ACTION_DOWN, before JS can race it.
 // Other platforms retain the responder lock. Day taps and vertical scrolling stay native.
 const lock=(value:boolean)=>{if(Platform.OS!=='android')latest.current.onLock?.(value);};
 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.4,
  onMoveShouldSetPanResponderCapture:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.4,
  onPanResponderRelease:(_,g)=>{if(Math.abs(g.dx)>35)latest.current.onMonth(g.dx<0?1:-1);lock(false);},
  onPanResponderTerminate:()=>lock(false),onPanResponderTerminationRequest:()=>false
 }),[]);
 return <View testID="calendar-month-swipe" nativeID="sofia-calendar-gesture" collapsable={false} {...pan.panHandlers} onTouchStart={()=>lock(true)} onTouchEnd={()=>lock(false)} onTouchCancel={()=>lock(false)}>{children}</View>;
}
