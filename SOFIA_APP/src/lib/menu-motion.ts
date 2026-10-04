import {Animated} from 'react-native';
import type {NativeScrollEvent,NativeSyntheticEvent} from 'react-native';
import type {Tab} from './types';
import {TAB_ORDER,tabIndex} from './tab-navigation';

/** Smooth spatial hand-off: reversible, with zero slope at either end. */
export function menuWeight(position:number,index:number):number {
  const t=Math.max(0,Math.min(1,1-Math.abs(position-index)));
  return t*t*(3-2*t);
}
export function menuWeightRange(index:number) {
  const inputRange=Array.from({length:65},(_,i)=>index-1+i/32);
  return {inputRange,outputRange:inputRange.map(p=>menuWeight(p,index)),extrapolate:'clamp' as const};
}
export const MENU_SPRING={stiffness:300,damping:30,mass:0.85,overshootClamping:true,
  restDisplacementThreshold:0.001,restSpeedThreshold:0.001,useNativeDriver:true,isInteraction:false} as const;

/** One native scroll signal drives the pill, icon and caption, without React frames. */
export function createMenuMotion(initial:Tab='chat') {
  let selected=initial,width=1,lastOffset=Math.max(0,tabIndex(initial));
  let tracking=false,dragging=false,reduced=false;
  const scrollX=new Animated.Value(lastOffset),viewport=new Animated.Value(width);
  const live=new Animated.Value(0),motionAmount=new Animated.Value(1);
  const taps=TAB_ORDER.map(tab=>new Animated.Value(tab===initial?1:0));
  const position=Animated.divide(scrollX,viewport);
  const notLive=Animated.subtract(1,live);
  const weights=taps.map((tap,index)=>Animated.add(
    Animated.multiply(live,position.interpolate(menuWeightRange(index))),
    Animated.multiply(notLive,tap)
  ).interpolate({inputRange:[0,1],outputRange:[0,1],extrapolate:'extend'}));
  let springs:Animated.CompositeAnimation[]=[];
  const stop=()=>{springs.forEach(s=>s.stop());springs=[];};
  const onScroll=Animated.event([{nativeEvent:{contentOffset:{x:scrollX}}}],{
    useNativeDriver:true,
    // Only an interruption snapshot. Visual frames never depend on this listener.
    listener:(event:NativeSyntheticEvent<NativeScrollEvent>)=>{lastOffset=event.nativeEvent.contentOffset.x;}
  });
  function select(next:Tab) {
    if(next===selected&&!dragging)return; // A React commit must not restart the motion.
    stop();
    if(tracking)taps.forEach((tap,i)=>tap.setValue(menuWeight(lastOffset/width,i)));
    live.setValue(0);tracking=false;dragging=false;selected=next;
    const index=tabIndex(next);
    if(reduced){taps.forEach((tap,i)=>tap.setValue(i===index?1:0));return;}
    // Animate only the old/new weights, never sweep through intermediate menus.
    springs=taps.map((tap,i)=>Animated.spring(tap,{...MENU_SPRING,toValue:i===index?1:0}));
    springs.forEach(s=>s.start()); // No completion callback gates page navigation.
  }
  return {
    scrollX,onScroll,weights,motionAmount,select,
    reset(tab:Tab) {
      // Layout/session alignment is not a decorative transition. Preserve all spring settings.
      stop();selected=tab;dragging=false;tracking=false;live.setValue(0);
      lastOffset=Math.max(0,tabIndex(tab))*width;scrollX.setValue(lastOffset);
      taps.forEach((tap,i)=>tap.setValue(TAB_ORDER[i]===tab?1:0));
    },
    resize(nextWidth:number,tab:Tab) {
      if(!Number.isFinite(nextWidth)||nextWidth<=0||nextWidth===width)return;
      width=nextWidth;lastOffset=Math.max(0,tabIndex(tab))*width;
      viewport.setValue(width);scrollX.setValue(lastOffset);
    },
    beginDrag(offset:number) {
      stop();lastOffset=offset;scrollX.setValue(offset);
      dragging=true;tracking=true;live.setValue(1);
    },
    settle(tab:Tab,offset:number) {
      // The purple label has already followed the native scroll to this point.
      // Keep the same graph; do not start a second, delayed selection animation.
      selected=tab;lastOffset=offset;dragging=false;tracking=false;
      taps.forEach((tap,i)=>tap.setValue(TAB_ORDER[i]===tab?1:0));live.setValue(0);
    },
    setReducedMotion(enabled:boolean) {
      reduced=enabled;motionAmount.setValue(enabled?0:1);
      if(enabled){stop();taps.forEach((tap,i)=>tap.setValue(TAB_ORDER[i]===selected?1:0));}
    },
    dispose:stop
  };
}
export type MenuMotion=ReturnType<typeof createMenuMotion>;
