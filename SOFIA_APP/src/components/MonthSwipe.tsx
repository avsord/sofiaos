import React,{useMemo,useRef} from 'react';
import {PanResponder,View} from 'react-native';
export function MonthSwipe({children,onMonth,onLock}:{children:React.ReactNode;onMonth:(delta:number)=>void;onLock?:(locked:boolean)=>void}){
 const latest=useRef({onMonth,onLock});latest.current={onMonth,onLock};
 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.4,
  onMoveShouldSetPanResponderCapture:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.4,
  onPanResponderRelease:(_,g)=>{if(Math.abs(g.dx)>35)latest.current.onMonth(g.dx<0?1:-1);latest.current.onLock?.(false);},
  onPanResponderTerminate:()=>latest.current.onLock?.(false),onPanResponderTerminationRequest:()=>false
 }),[]);
 return <View {...pan.panHandlers} onTouchStart={()=>onLock?.(true)} onTouchEnd={()=>onLock?.(false)} onTouchCancel={()=>onLock?.(false)}>{children}</View>;
}
