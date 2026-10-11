import {useCallback,useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {AppState} from 'react-native';
import type {FlatList,NativeSyntheticEvent,NativeScrollEvent} from 'react-native';
/** Native offset zero is the latest message. No growing-content end estimation. */
export function newestFirst<T>(messages:readonly T[]):T[]{return [...messages].reverse();}
export class ChatTailIntent {
 following=true;interacting=false;
 begin(){this.interacting=true;}
 position(offset:number){if(this.interacting)this.following=offset<80;return !this.following&&offset>80;}
 end(){this.interacting=false;}
 follow(){this.following=true;this.interacting=false;}
 pause(){this.following=false;this.interacting=false;}
}
export function useChatTail(list:RefObject<FlatList<any>|null>,active:boolean){
 const lastGesture=useRef(0),intent=useRef(new ChatTailIntent()).current,[showJump,setShowJump]=useState(false);
 const follow=useCallback(()=>{intent.follow();setShowJump(false);list.current?.scrollToOffset({offset:0,animated:false});},[intent,list]);
 const keep=useCallback(()=>{if(intent.following&&!intent.interacting)list.current?.scrollToOffset({offset:0,animated:false});},[intent,list]);
 // Reset while hidden as well as on entry: the first visible frame is already at zero.
 useLayoutEffect(()=>{follow();},[active,follow]);
 useEffect(()=>{const s=AppState.addEventListener('change',state=>{if(state==='active')follow();});return()=>s.remove();},[follow]);
 const position=(e:NativeSyntheticEvent<NativeScrollEvent>)=>setShowJump(intent.position(Math.max(0,e.nativeEvent.contentOffset.y)));
 return {showJump,follow,pause:()=>intent.pause(),onContentSizeChange:keep,onLayout:keep,
  onScroll:position,onScrollBeginDrag:()=>{lastGesture.current=Date.now();intent.begin();},onScrollEndDrag:(e:NativeSyntheticEvent<NativeScrollEvent>)=>{position(e);intent.end();},
  onMomentumScrollBegin:()=>{if(lastGesture.current&&Date.now()-lastGesture.current<600)intent.begin();},onMomentumScrollEnd:(e:NativeSyntheticEvent<NativeScrollEvent>)=>{position(e);intent.end();keep();}};
}
