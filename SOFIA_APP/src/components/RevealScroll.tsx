import React,{forwardRef,useCallback,useContext,useImperativeHandle,useRef} from 'react';
import {ScrollView,type NativeScrollEvent,type NativeSyntheticEvent,type ScrollViewProps,type View} from 'react-native';

/** 0.3.255: o calendario (e outros paineis que abrem dentro de um formulario) ficava cortado no fim da tela e a
 * pessoa tinha que rolar na mao. Um formulario com RevealScrollView rola sozinho ate o painel aberto caber inteiro. */
export type Reveal=(target:View|null)=>void;
export const RevealContext=React.createContext<Reveal|null>(null);
export const useReveal=()=>useContext(RevealContext);

type Box={y:number;h:number};
/** Quanto rolar para a caixa caber no visor (positivo desce). Se ela for maior que o visor, alinha o topo. */
export function revealDelta(view:Box,target:Box,margin=16):number{
 if(!(view.h>0)||!(target.h>0))return 0;
 const top=view.y+margin,bottom=view.y+view.h-margin;
 if(target.h>bottom-top)return target.y-top;
 if(target.y+target.h>bottom)return target.y+target.h-bottom;
 if(target.y<top)return target.y-top;
 return 0;
}

export const RevealScrollView=forwardRef<ScrollView,ScrollViewProps>(function RevealScrollView(props,ref){
 const inner=useRef<ScrollView>(null),offset=useRef(0),parent=useContext(RevealContext);
 useImperativeHandle(ref,()=>inner.current as ScrollView,[]);
 const {onScroll,horizontal}=props;
 const scroll=useCallback((e:NativeSyntheticEvent<NativeScrollEvent>)=>{offset.current=e.nativeEvent.contentOffset.y;onScroll?.(e);},[onScroll]);
 const reveal=useCallback<Reveal>(target=>{
  const sv=inner.current as any;if(!target||!sv)return;
  const own=typeof sv.measureInWindow==='function'?sv:sv.getNativeScrollRef?.();
  if(!own?.measureInWindow||!(target as any).measureInWindow)return;
  own.measureInWindow((_x:number,y:number,_w:number,h:number)=>{(target as any).measureInWindow((_tx:number,ty:number,_tw:number,th:number)=>{
   const delta=revealDelta({y,h},{y:ty,h:th});
   if(delta)sv.scrollTo?.({y:Math.max(0,offset.current+delta),animated:true});
  });});
 },[]);
 return <RevealContext.Provider value={horizontal?parent:reveal}><ScrollView {...props} keyboardShouldPersistTaps={props.keyboardShouldPersistTaps} ref={inner} onScroll={scroll} scrollEventThrottle={props.scrollEventThrottle??32}/></RevealContext.Provider>;
});
/** Mesmo tipo do ScrollView (para `useRef<ScrollView>` continuar valendo onde ele substitui o do react-native). */
export type RevealScrollView=ScrollView;
