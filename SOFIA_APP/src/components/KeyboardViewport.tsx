import React,{useEffect,useRef,useState} from 'react';
import {Keyboard,View} from 'react-native';
/** Measure in window coordinates, so nested headers and Android resize cannot double-count IME space. */
export function KeyboardViewport({children}:{children:React.ReactNode}){
 const host=useRef<View>(null),top=useRef<number|null>(null),[overlap,setOverlap]=useState(0);
 const measure=()=>host.current?.measureInWindow((_x,y,_w,h)=>{const k=top.current;setOverlap(k==null?0:Math.max(0,Math.min(h,y+h-k)));});
 useEffect(()=>{const show=Keyboard.addListener('keyboardDidShow',e=>{top.current=e.endCoordinates.screenY;requestAnimationFrame(measure);});const change=Keyboard.addListener('keyboardWillChangeFrame',e=>{top.current=e.endCoordinates.screenY;requestAnimationFrame(measure);});const hide=Keyboard.addListener('keyboardDidHide',()=>{top.current=null;setOverlap(0);});return()=>{show.remove();change.remove();hide.remove();};},[]);
 return <View ref={host} collapsable={false} onLayout={()=>requestAnimationFrame(measure)} style={{flex:1}}><View style={{flex:1,paddingBottom:overlap}}>{children}</View></View>;
}
