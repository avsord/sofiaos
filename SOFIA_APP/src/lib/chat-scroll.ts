import {useLayoutEffect, useRef, type RefObject} from 'react';
import type {FlatList, NativeScrollEvent, NativeSyntheticEvent} from 'react-native';

// Content growth and keyboard resize also produce native scroll events. Only
// a deliberate drag/momentum may opt out of following the conversation.
export class ChatScrollIntent {
 following=true;
 interacting=false;
 follow(){this.following=true;this.interacting=false;}
 begin(){this.interacting=true;}
 position(offset:number,content:number,viewport:number){
  if(this.interacting)this.following=content-offset-viewport<100;
 }
 end(){this.interacting=false;}
 pause(){this.following=false;this.interacting=false;}
}

export function useChatAutoscroll(list:RefObject<FlatList<any>|null>,active:boolean){
 const intent=useRef(new ChatScrollIntent()).current,frame=useRef<number|null>(null),enabled=useRef(active);
 enabled.current=active;
 function cancel(){if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}}
 function settle(){
  cancel();
  if(!enabled.current||!intent.following||intent.interacting)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;
   if(!enabled.current||!intent.following||intent.interacting)return;
   list.current?.scrollToEnd({animated:false});
   // FlatList measures variable-height reply bubbles after the layout frame.
   frame.current=requestAnimationFrame(()=>{frame.current=null;if(enabled.current&&intent.following&&!intent.interacting)list.current?.scrollToEnd({animated:false});});
  });
 }
 function position(e:NativeSyntheticEvent<NativeScrollEvent>){const n=e.nativeEvent;intent.position(n.contentOffset.y,n.contentSize.height,n.layoutMeasurement.height);}
 useLayoutEffect(()=>{settle();return cancel;},[active]);
 return {
  follow:()=>{intent.follow();settle();},
  pause:()=>{cancel();intent.pause();},
  onContentSizeChange:settle,
  onLayout:settle,
  onScroll:position,
  onScrollBeginDrag:()=>{cancel();intent.begin();},
  onScrollEndDrag:(e:NativeSyntheticEvent<NativeScrollEvent>)=>{position(e);intent.end();settle();},
  onMomentumScrollBegin:()=>{cancel();intent.begin();},
  onMomentumScrollEnd:(e:NativeSyntheticEvent<NativeScrollEvent>)=>{position(e);intent.end();settle();},
 };
}
