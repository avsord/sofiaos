import React,{useMemo,useRef,useState} from 'react';
import {Animated,Pressable,Text,View} from 'react-native';
import type {Entity} from '../lib/types';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';

type Rect={x:number;y:number;width:number;height:number};
type Props={
  roots:Entity[];
  children:Map<string,Entity[]>;
  expanded:Set<string>;
  toggle:(id:string)=>void;
  onOpen:(page:Entity)=>void;
  onMove:(page:Entity,parentId:string)=>Promise<void>|void;
  canParent:(pageId:string,parentId:string)=>boolean;
  compact?:boolean;
  onInteractionChange?:(active:boolean)=>void;
};
const iconFor=(page:Entity)=>String(page.data?.icon||'').trim()||'📄';
const hit=(rect:Rect|null,x:number,y:number)=>!!rect&&x>=rect.x&&x<=rect.x+rect.width&&y>=rect.y&&y<=rect.y+rect.height;

export function PageTreeList({roots,children,expanded,toggle,onOpen,onMove,canParent,compact=false,onInteractionChange}:Props){
  const rows=useRef(new Map<string,View>()),rects=useRef(new Map<string,Rect>()),listRef=useRef<View|null>(null),listRect=useRef<Rect|null>(null),dragId=useRef('');
  const [dragging,setDragging]=useState<Entity|null>(null),[target,setTarget]=useState<string|null>(null);
  const measureRow=(id:string)=>{
    const node=rows.current.get(id);
    node?.measureInWindow((x,y,width,height)=>{if(width>0&&height>0)rects.current.set(id,{x,y,width,height});});
  };
  const measureAll=()=>{
    rows.current.forEach((_node,id)=>measureRow(id));
    listRef.current?.measureInWindow((x,y,width,height)=>{listRect.current=width>0&&height>0?{x,y,width,height}:null;});
  };
  const targetAt=(page:Entity,x:number,y:number)=>{
    for(const [id,rect] of rects.current)if(id!==page.id&&hit(rect,x,y)&&canParent(page.id,id))return id;
    return null;
  };
  const start=(page:Entity)=>{dragId.current=page.id;measureAll();setDragging(page);setTarget(null);onInteractionChange?.(true);};
  const move=(page:Entity,x:number,y:number)=>{
    if(dragId.current!==page.id)return;
    setTarget(targetAt(page,x,y));
  };
  const fallbackTarget=(page:Entity,dy:number)=>{
    if(Math.abs(dy)<18)return null;
    const measured=[...rects.current.entries()].sort((a,b)=>a[1].y-b[1].y).map(([id])=>id);
    const ids=measured.length>1?measured:[...rows.current.keys()];
    const from=ids.indexOf(page.id);if(from<0)return null;
    const step=Math.max(1,Math.round(Math.abs(dy)/(compact?40:46))),index=Math.max(0,Math.min(ids.length-1,from+(dy>0?step:-step)));
    const candidate=ids[index];
    return candidate&&candidate!==page.id&&canParent(page.id,candidate)?candidate:null;
  };
  const finish=(page:Entity,x:number,y:number,dx:number,dy:number)=>{
    if(dragId.current!==page.id)return;
    const direct=targetAt(page,x,y),next=direct??fallbackTarget(page,dy),wasChild=!!String(page.data?.parent_id||'');
    // Notion-like outdent: dragging a child left/outside removes its parent.
    const outdented=wasChild&&(dx<-30||!hit(listRect.current,x,y));
    dragId.current='';setDragging(null);setTarget(null);onInteractionChange?.(false);
    if(next!==null&&canParent(page.id,next))void onMove(page,next);
    else if(outdented&&canParent(page.id,''))void onMove(page,'');
  };
  return <View ref={node=>{listRef.current=node;}} collapsable={false} style={{position:'relative'}}>
    {roots.map(page=><TreeRow key={page.id} page={page} children={children} expanded={expanded} toggle={toggle} onOpen={onOpen}
      ancestors={[]} compact={compact} draggingId={dragging?.id||''} targetId={target||''} register={(id,node)=>{if(node){rows.current.set(id,node);requestAnimationFrame(()=>measureRow(id));}else{rows.current.delete(id);rects.current.delete(id);}}} measure={measureRow}
      onStart={start} onMove={move} onEnd={finish} onInteractionChange={onInteractionChange}/>)}
  </View>;
}

function TreeRow({page,children,expanded,toggle,onOpen,ancestors,compact,draggingId,targetId,register,measure,onStart,onMove,onEnd,onInteractionChange}:{
  page:Entity;children:Map<string,Entity[]>;expanded:Set<string>;toggle:(id:string)=>void;onOpen:(page:Entity)=>void;ancestors:string[];compact:boolean;
  draggingId:string;targetId:string;register:(id:string,node:View|null)=>void;measure:(id:string)=>void;onStart:(page:Entity)=>void;onMove:(page:Entity,x:number,y:number)=>void;
  onEnd:(page:Entity,x:number,y:number,dx:number,dy:number)=>void;onInteractionChange?:(active:boolean)=>void;
}){
  const c=useTheme(),pan=useRef(new Animated.ValueXY()).current,touch=useRef({x:0,y:0}),draggingRef=useRef(false);
  if(ancestors.includes(page.id)||ancestors.length>40)return null;
  const kids=children.get(page.id)||[],open=compact?true:expanded.has(page.id),isTarget=targetId===page.id,isDragging=draggingId===page.id;
  const pageLabel=String(page.data?.parent_id||'')?'Abrir subpágina '+page.title:'Abrir página principal '+page.title;
  const reset=()=>Animated.spring(pan,{toValue:{x:0,y:0},useNativeDriver:true,speed:28,bounciness:4}).start();
  return <View>
    <View ref={node=>register(page.id,node)} collapsable={false} onLayout={()=>measure(page.id)}
      accessible accessibilityRole="button" accessibilityLabel={pageLabel} accessibilityHint={'Arraste para reorganizar '+page.title}
      onStartShouldSetResponderCapture={e=>!(kids.length&&!compact&&e.nativeEvent.locationX<32)}
      onStartShouldSetResponder={e=>!(kids.length&&!compact&&e.nativeEvent.locationX<32)}
      onResponderGrant={e=>{touch.current={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};draggingRef.current=false;pan.stopAnimation();pan.setValue({x:0,y:0});}}
      onResponderMove={e=>{
        const dx=e.nativeEvent.pageX-touch.current.x,dy=e.nativeEvent.pageY-touch.current.y;
        if(!draggingRef.current&&Math.abs(dx)+Math.abs(dy)>7){draggingRef.current=true;onStart(page);}
        if(draggingRef.current){pan.setValue({x:dx,y:dy});onMove(page,e.nativeEvent.pageX,e.nativeEvent.pageY);}
      }}
      onResponderRelease={e=>{
        const dx=e.nativeEvent.pageX-touch.current.x,dy=e.nativeEvent.pageY-touch.current.y;
        if(draggingRef.current)onEnd(page,e.nativeEvent.pageX,e.nativeEvent.pageY,dx,dy);
        else if(Math.abs(dx)+Math.abs(dy)<7)onOpen(page);
        draggingRef.current=false;reset();
      }}
      onResponderTerminate={e=>{
        const dx=e.nativeEvent.pageX-touch.current.x,dy=e.nativeEvent.pageY-touch.current.y;
        if(draggingRef.current)onEnd(page,e.nativeEvent.pageX,e.nativeEvent.pageY,dx,dy);
        draggingRef.current=false;reset();
      }}
      onResponderTerminationRequest={()=>false}
      style={{paddingLeft:Math.min(ancestors.length,6)*(compact?14:16),borderRadius:9,backgroundColor:isTarget?c.accentSoft:'transparent'}}>
      <Animated.View pointerEvents="box-none" style={{flexDirection:'row',alignItems:'center',opacity:isDragging?.55:1,zIndex:isDragging?50:1,elevation:isDragging?16:0,
        transform:[...pan.getTranslateTransform(),{scale:isDragging?1.04:1}]}}>
      {!compact&&kids.length?<Pressable accessibilityRole="button" accessibilityLabel={open?'Recolher subpáginas de '+page.title:'Expandir subpáginas de '+page.title}
        accessibilityState={{expanded:open}} onPress={()=>toggle(page.id)} style={{width:28,minHeight:46,justifyContent:'center',alignItems:'center'}}>
        <View style={{transform:[{rotate:open?'90deg':'0deg'}]}}><Icon name="chevron" size={14} color={c.muted}/></View>
      </Pressable>:!compact?<View style={{width:28}}/>:null}
      <Text pointerEvents="none" style={{fontSize:22,color:c.text,width:34,textAlign:'center'}}>{iconFor(page)}</Text>
      <View pointerEvents="none" style={{flex:1,minHeight:compact?40:46,justifyContent:'center',paddingRight:10,paddingLeft:6}}>
        <Text numberOfLines={1} style={{fontSize:16,color:c.text,fontWeight:ancestors.length?'400':'600'}}>{page.title}</Text>
      </View>
      </Animated.View>
    </View>
    {open?kids.map(child=><TreeRow key={child.id} page={child} children={children} expanded={expanded} toggle={toggle} onOpen={onOpen}
      ancestors={[...ancestors,page.id]} compact={compact} draggingId={draggingId} targetId={targetId} register={register} measure={measure}
      onStart={onStart} onMove={onMove} onEnd={onEnd} onInteractionChange={onInteractionChange}/>):null}
  </View>;
}
