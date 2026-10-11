import React,{useMemo,useRef} from 'react';
import {PanResponder,View} from 'react-native';
/** Only the screen edge owns navigation; horizontal controls in the content stay usable. */
export function InternalBackGesture({enabled,onBack,children}:{enabled:boolean;onBack:()=>void;children:React.ReactNode}){
 const root=useRef<View|null>(null),origin=useRef(0),latest=useRef({enabled,onBack});latest.current={enabled,onBack};
 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponderCapture:(_e,g)=>latest.current.enabled&&g.x0>=origin.current&&g.x0<origin.current+28&&g.dx>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.4,
  onPanResponderRelease:(_e,g)=>{if(g.dx>64||g.dx>20&&g.vx>.7)latest.current.onBack();},
  onPanResponderTerminationRequest:()=>false
 }),[]);
 return <View ref={root} collapsable={false} onLayout={()=>root.current?.measureInWindow(x=>{origin.current=x;})} {...pan.panHandlers} style={{flex:1}}>{children}</View>;
}
