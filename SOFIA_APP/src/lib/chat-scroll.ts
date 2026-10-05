import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';
import {Keyboard} from 'react-native';
import type {FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent} from 'react-native';
import type {Message} from './types';

export function hasChatArrival(previous:readonly Message[],next:readonly Message[]){
 const last=next.at(-1);if(!last)return false;
 if(!previous.length)return true;
 const old=new Map(previous.map(m=>[m.id,m]));
 // The server can replace an optimistic user ID when it acknowledges a send.
 // A new tail still is an arrival, even if the old tail ID no longer exists.
 if(!old.has(last.id))return true;
 return next.some(m=>old.has(m.id)&&old.get(m.id)!.content!==m.content);
}

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
 const target=useRef(-1);
 function jump(){
  if(intent.contentHeight>0&&intent.viewportHeight>0){
   const offset=intent.endOffset;
   if(Math.abs(target.current-offset)<1)return;
   target.current=offset;list.current?.scrollToOffset({offset,animated:true});
  } else list.current?.scrollToEnd({animated:true});
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
 function position(e:NativeSyntheticEvent<NativeScrollEvent>){const n=e.nativeEvent;
  // A scroll callback queued before the latest layout must not shrink the
  // measured reply or pull an in-flight animation back to its previous end.
  intent.position(n.contentOffset.y,intent.contentHeight||n.contentSize.height,intent.viewportHeight||n.layoutMeasurement.height);
  // Android may restore the old scroll offset after its keyboard/focus resize.
  // Reconcile that native geometry only while following, never during a user drag.
  if(intent.following&&!intent.interacting&&intent.endOffset-n.contentOffset.y>2&&Math.abs(target.current-intent.endOffset)>1)settle();
 }
 useLayoutEffect(()=>{settle();return cancel;},[active]);
 useEffect(()=>{const show=Keyboard.addListener('keyboardDidShow',settle),hide=Keyboard.addListener('keyboardDidHide',settle);return()=>{show.remove();hide.remove();};},[]);
 return {
  follow:()=>{lastDrag.current=0;target.current=-1;intent.follow();settle();},
  pause:()=>{lastDrag.current=0;cancel();intent.pause();},
  onContentSizeChange:(_width:number,height:number)=>{intent.contentHeight=height;settle();},
  onLayout:(e:LayoutChangeEvent)=>{target.current=-1;intent.viewportHeight=e.nativeEvent.layout.height;settle();},
  onScroll:position,
  onScrollBeginDrag:()=>{lastDrag.current=Date.now();target.current=-1;cancel();intent.begin();},
  onScrollEndDrag:(e:NativeSyntheticEvent<NativeScrollEvent>)=>{lastDrag.current=Date.now();position(e);intent.end();settle();},
  onMomentumScrollBegin:()=>{if(lastDrag.current&&Date.now()-lastDrag.current<500){cancel();intent.begin();}},
  onMomentumScrollEnd:(e:NativeSyntheticEvent<NativeScrollEvent>)=>{position(e);lastDrag.current=0;intent.end();settle();},
 };
}
