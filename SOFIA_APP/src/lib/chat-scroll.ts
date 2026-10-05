import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';
import {Keyboard} from 'react-native';
import type {FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent} from 'react-native';

// Content growth and keyboard resize also produce native scroll events. Only
// a deliberate drag/momentum may opt out of following the conversation.
export class ChatScrollIntent {
 following=true;
 interacting=false;
 contentHeight=0;
 viewportHeight=0;
 get endOffset(){return Math.max(0,this.contentHeight-this.viewportHeight);}
 follow(){this.following=true;this.interacting=false;}
 begin(){this.interacting=true;}
 position(offset:number,content:number,viewport:number){
  this.contentHeight=content;this.viewportHeight=viewport;
  if(this.interacting)this.following=content-offset-viewport<100;
 }
 end(){this.interacting=false;}
 pause(){this.following=false;this.interacting=false;}
}

export function useChatAutoscroll(list:RefObject<FlatList<any>|null>,active:boolean){
 const lastDrag=useRef(0);
 const intent=useRef(new ChatScrollIntent()).current,frame=useRef<number|null>(null),enabled=useRef(active);
 enabled.current=active;
 function cancel(){if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}}
 function jump(){
  if(intent.contentHeight>0&&intent.viewportHeight>0)list.current?.scrollToOffset({offset:intent.endOffset,animated:false});
  else list.current?.scrollToEnd({animated:false});
 }
 function settle(){
  cancel();
  if(!enabled.current||!intent.following||intent.interacting)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;
   if(!enabled.current||!intent.following||intent.interacting)return;
   jump();
   // FlatList measures variable-height reply bubbles after the layout frame.
   frame.current=requestAnimationFrame(()=>{frame.current=null;if(enabled.current&&intent.following&&!intent.interacting)jump();});
  });
 }
 function position(e:NativeSyntheticEvent<NativeScrollEvent>){const n=e.nativeEvent;intent.position(n.contentOffset.y,n.contentSize.height,n.layoutMeasurement.height);
  // Android may restore the old scroll offset after its keyboard/focus resize.
  // Reconcile that native geometry only while following, never during a user drag.
  if(intent.following&&!intent.interacting&&intent.endOffset-n.contentOffset.y>2)settle();
 }
 useLayoutEffect(()=>{settle();return cancel;},[active]);
 useEffect(()=>{const show=Keyboard.addListener('keyboardDidShow',settle),hide=Keyboard.addListener('keyboardDidHide',settle);return()=>{show.remove();hide.remove();};},[]);
 return {
  follow:()=>{lastDrag.current=0;intent.follow();settle();},
  pause:()=>{lastDrag.current=0;cancel();intent.pause();},
  onContentSizeChange:(_width:number,height:number)=>{intent.contentHeight=height;settle();},
  onLayout:(e:LayoutChangeEvent)=>{intent.viewportHeight=e.nativeEvent.layout.height;settle();},
  onScroll:position,
  onScrollBeginDrag:()=>{lastDrag.current=Date.now();cancel();intent.begin();},
  onScrollEndDrag:(e:NativeSyntheticEvent<NativeScrollEvent>)=>{lastDrag.current=Date.now();position(e);intent.end();settle();},
  onMomentumScrollBegin:()=>{if(lastDrag.current&&Date.now()-lastDrag.current<500){cancel();intent.begin();}},
  onMomentumScrollEnd:(e:NativeSyntheticEvent<NativeScrollEvent>)=>{position(e);lastDrag.current=0;intent.end();settle();},
 };
}
