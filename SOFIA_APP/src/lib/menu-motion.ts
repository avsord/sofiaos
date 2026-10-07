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
/** One native scroll signal drives the pill, icon and caption, without React frames. */
export function createMenuMotion(initial:Tab='chat') {
  let selected=initial,width=1,lastOffset=Math.max(0,tabIndex(initial));
  let dragging=false;
  const scrollX=new Animated.Value(lastOffset),viewport=new Animated.Value(width);
  const live=new Animated.Value(0),motionAmount=new Animated.Value(1);
  const taps=TAB_ORDER.map(tab=>new Animated.Value(tab===initial?1:0));
  const position=Animated.divide(scrollX,viewport);
  const notLive=Animated.subtract(1,live);
  const weights=taps.map((tap,index)=>Animated.add(
    Animated.multiply(live,position.interpolate(menuWeightRange(index))),
    Animated.multiply(notLive,tap)
  ).interpolate({inputRange:[0,1],outputRange:[0,1],extrapolate:'extend'}));
  const onScroll=Animated.event([{nativeEvent:{contentOffset:{x:scrollX}}}],{
    useNativeDriver:true,
    // Only an interruption snapshot. Visual frames never depend on this listener.
    listener:(event:NativeSyntheticEvent<NativeScrollEvent>)=>{lastOffset=event.nativeEvent.contentOffset.x;}
  });
  function select(next:Tab) {
    if(next===selected&&!dragging)return;
    selected=next;dragging=false;live.setValue(0);
    const index=tabIndex(next);
    // Touch-down feedback is exact and immediate. Swipes still use the live native position.
    taps.forEach((tap,i)=>tap.setValue(i===index?1:0));
  }
  return {
    scrollX,onScroll,weights,motionAmount,select,
    reset(tab:Tab) {
      // Layout/session alignment is not a decorative transition. Preserve all spring settings.
      selected=tab;dragging=false;live.setValue(0);
      lastOffset=Math.max(0,tabIndex(tab))*width;scrollX.setValue(lastOffset);
      taps.forEach((tap,i)=>tap.setValue(TAB_ORDER[i]===tab?1:0));
    },
    resize(nextWidth:number,tab:Tab) {
      if(!Number.isFinite(nextWidth)||nextWidth<=0||nextWidth===width)return;
      width=nextWidth;lastOffset=Math.max(0,tabIndex(tab))*width;
      viewport.setValue(width);scrollX.setValue(lastOffset);
    },
    beginDrag(offset:number) {
      lastOffset=offset;scrollX.setValue(offset);
      dragging=true;live.setValue(1);
    },
    settle(tab:Tab,offset:number) {
      // The purple label has already followed the native scroll to this point.
      // Keep the same graph; do not start a second, delayed selection animation.
      selected=tab;lastOffset=offset;dragging=false;live.setValue(0);
      const index=tabIndex(tab);taps.forEach((tap,i)=>tap.setValue(i===index?1:0));
    },
    setReducedMotion(enabled:boolean) {
      motionAmount.setValue(enabled?0:1);
      if(enabled)taps.forEach((tap,i)=>tap.setValue(TAB_ORDER[i]===selected?1:0));
    },
    dispose() {}
  };
}
export type MenuMotion=ReturnType<typeof createMenuMotion>;
