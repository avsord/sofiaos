import React,{useMemo,useRef,useState} from 'react';
import {Animated,PanResponder,Pressable,Text,View} from 'react-native';
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
  const measureAll=()=>{
    rows.current.forEach((node,id)=>node.measureInWindow((x,y,width,height)=>{if(width>0&&height>0)rects.current.set(id,{x,y,width,height});}));
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
  const finish=(page:Entity,x:number,y:number,dx:number)=>{
    if(dragId.current!==page.id)return;
    const next=targetAt(page,x,y),wasChild=!!String(page.data?.parent_id||'');
    // Notion-like outdent: dragging a child left/outside removes its parent.
    const outdented=wasChild&&(dx<-30||!hit(listRect.current,x,y));
    dragId.current='';setDragging(null);setTarget(null);onInteractionChange?.(false);
    if(next!==null&&canParent(page.id,next))void onMove(page,next);
    else if(outdented&&canParent(page.id,''))void onMove(page,'');
  };
  return <View ref={node=>{listRef.current=node;}} collapsable={false} style={{position:'relative'}}>
    {roots.map(page=><TreeRow key={page.id} page={page} children={children} expanded={expanded} toggle={toggle} onOpen={onOpen}
      ancestors={[]} compact={compact} draggingId={dragging?.id||''} targetId={target||''} register={(id,node)=>{if(node)rows.current.set(id,node);else rows.current.delete(id);}}
      onStart={start} onMove={move} onEnd={finish} onInteractionChange={onInteractionChange}/>)}
  </View>;
}

function TreeRow({page,children,expanded,toggle,onOpen,ancestors,compact,draggingId,targetId,register,onStart,onMove,onEnd,onInteractionChange}:{
  page:Entity;children:Map<string,Entity[]>;expanded:Set<string>;toggle:(id:string)=>void;onOpen:(page:Entity)=>void;ancestors:string[];compact:boolean;
  draggingId:string;targetId:string;register:(id:string,node:View|null)=>void;onStart:(page:Entity)=>void;onMove:(page:Entity,x:number,y:number)=>void;
  onEnd:(page:Entity,x:number,y:number,dx:number)=>void;onInteractionChange?:(active:boolean)=>void;
}){
  const c=useTheme(),pan=useRef(new Animated.ValueXY()).current;
  if(ancestors.includes(page.id)||ancestors.length>40)return null;
  const kids=children.get(page.id)||[],open=compact?true:expanded.has(page.id),isTarget=targetId===page.id,isDragging=draggingId===page.id;
  const pageLabel=String(page.data?.parent_id||'')?'Abrir subpágina '+page.title:'Abrir página principal '+page.title;
  const handlers=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_e,g)=>Math.abs(g.dx)+Math.abs(g.dy)>7,
    onMoveShouldSetPanResponderCapture:(_e,g)=>Math.abs(g.dx)+Math.abs(g.dy)>7,
    onPanResponderGrant:()=>{pan.stopAnimation();pan.setValue({x:0,y:0});onStart(page);},
    onPanResponderMove:(_e,g)=>{pan.setValue({x:g.dx,y:g.dy});onMove(page,g.moveX,g.moveY);},
    onPanResponderRelease:(_e,g)=>{onEnd(page,g.moveX,g.moveY,g.dx);Animated.spring(pan,{toValue:{x:0,y:0},useNativeDriver:true,speed:28,bounciness:4}).start();},
    onPanResponderTerminate:(_e,g)=>{onEnd(page,g.moveX,g.moveY,g.dx);Animated.spring(pan,{toValue:{x:0,y:0},useNativeDriver:true,speed:28,bounciness:4}).start();},
    onPanResponderTerminationRequest:()=>false,
    onShouldBlockNativeResponder:()=>true
  }),[page,onStart,onMove,onEnd,pan]);
  return <View>
    <Animated.View {...handlers.panHandlers} ref={node=>register(page.id,node)} collapsable={false}
      onTouchStart={()=>onInteractionChange?.(true)} onTouchEnd={()=>{if(!isDragging)onInteractionChange?.(false);}} onTouchCancel={()=>onInteractionChange?.(false)}
      accessibilityLabel={'Arrastar página '+page.title}
      style={{flexDirection:'row',alignItems:'center',paddingLeft:Math.min(ancestors.length,6)*(compact?14:16),borderRadius:9,
        backgroundColor:isTarget?c.accentSoft:'transparent',opacity:isDragging?.55:1,zIndex:isDragging?50:1,elevation:isDragging?16:0,
        transform:[...pan.getTranslateTransform(),{scale:isDragging?1.04:1}]}}>
      {!compact&&kids.length?<Pressable accessibilityRole="button" accessibilityLabel={open?'Recolher subpáginas de '+page.title:'Expandir subpáginas de '+page.title}
        accessibilityState={{expanded:open}} onPress={()=>toggle(page.id)} style={{width:28,minHeight:46,justifyContent:'center',alignItems:'center'}}>
        <View style={{transform:[{rotate:open?'90deg':'0deg'}]}}><Icon name="chevron" size={14} color={c.muted}/></View>
      </Pressable>:!compact?<View style={{width:28}}/>:null}
      <Text pointerEvents="none" style={{fontSize:compact?22:22,color:c.text,width:34,textAlign:'center'}}>{iconFor(page)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={pageLabel} onPress={()=>onOpen(page)}
        style={({pressed})=>({flex:1,minHeight:compact?40:46,justifyContent:'center',paddingRight:10,paddingLeft:6,borderRadius:8,backgroundColor:pressed&&!isTarget?c.input:'transparent'})}>
        <Text numberOfLines={1} style={{fontSize:compact?16:16,color:c.text,fontWeight:ancestors.length?'400':'600'}}>{page.title}</Text>
      </Pressable>
    </Animated.View>
    {open?kids.map(child=><TreeRow key={child.id} page={child} children={children} expanded={expanded} toggle={toggle} onOpen={onOpen}
      ancestors={[...ancestors,page.id]} compact={compact} draggingId={draggingId} targetId={targetId} register={register}
      onStart={onStart} onMove={onMove} onEnd={onEnd} onInteractionChange={onInteractionChange}/>):null}
  </View>;
}
