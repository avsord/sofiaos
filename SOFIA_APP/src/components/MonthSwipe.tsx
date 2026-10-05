import React,{useEffect,useMemo,useRef} from 'react';
import {PanResponder,Platform,View} from 'react-native';
export function MonthSwipe({children,onMonth,onLock}:{children:React.ReactNode;onMonth:(delta:number)=>void;onLock?:(locked:boolean)=>void}){
 const latest=useRef({onMonth,onLock});latest.current={onMonth,onLock};
 const locked=useRef(false),claimed=useRef(false);
 // Android reserves the native pager before dispatch. A second asynchronous
 // JS lock can restore a stale disabled state after a day tap, so only iOS uses it.
 const lock=(value:boolean)=>{if(locked.current!==value){locked.current=value;if(Platform.OS!=='android')latest.current.onLock?.(value);}};
 useEffect(()=>()=>lock(false),[]);
 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponderCapture:()=>{lock(true);return false;},
  onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.4,
  onMoveShouldSetPanResponderCapture:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.4,
  onPanResponderGrant:()=>{claimed.current=true;lock(true);},
  onPanResponderRelease:(_,g)=>{if(Math.abs(g.dx)>35)latest.current.onMonth(g.dx<0?1:-1);claimed.current=false;lock(false);},
  onPanResponderTerminate:()=>{claimed.current=false;lock(false);},onPanResponderTerminationRequest:()=>false
 }),[]);
 return <View testID="calendar-month-swipe" nativeID="sofia-calendar-gesture" collapsable={false} {...pan.panHandlers} onTouchStart={()=>lock(true)} onTouchEnd={event=>{if(!event.nativeEvent.touches.length&&!claimed.current)lock(false);}} onTouchCancel={()=>{if(!claimed.current)lock(false);}}>{children}</View>;
}
