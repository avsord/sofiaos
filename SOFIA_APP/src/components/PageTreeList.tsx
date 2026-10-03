import React,{useRef,useState} from 'react';
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
  onDelete?:(page:Entity)=>void;
  compact?:boolean;
  onInteractionChange?:(active:boolean)=>void;
};
const iconFor=(page:Entity)=>String(page.data?.icon||'').trim()||'📄';
const hit=(rect:Rect|null,x:number,y:number)=>!!rect&&x>=rect.x&&x<=rect.x+rect.width&&y>=rect.y&&y<=rect.y+rect.height;

export function PageTreeList({roots,children,expanded,toggle,onOpen,onMove,canParent,onDelete,compact=false,onInteractionChange}:Props){
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
  const pageById=(id:string)=>{
    for(const p of roots)if(p.id===id)return p;
    for(const list of children.values())for(const p of list)if(p.id===id)return p;
    return undefined;
  };
  const finish=(page:Entity,x:number,y:number,dx:number,dy:number)=>{
    if(dragId.current!==page.id)return;
    const direct=targetAt(page,x,y),parentId=String(page.data?.parent_id||''),wasChild=!!parentId,rect=listRect.current;
    // Vertical drag out of a nested group only climbs one hierarchy level.
    // Becoming a root page requires an explicit horizontal drag outside the hierarchy.
    const outsideHorizontal=!!rect&&(x<rect.x-12||x>rect.x+rect.width+12);
    const parent=wasChild?pageById(parentId):undefined;
    const previousLevel=parent?String(parent.data?.parent_id||''):'';
    dragId.current='';setDragging(null);setTarget(null);onInteractionChange?.(false);
    if(direct!==null&&canParent(page.id,direct))void onMove(page,direct);
    else if(wasChild&&outsideHorizontal&&canParent(page.id,''))void onMove(page,'');
    else if(wasChild&&dy>18&&previousLevel!==parentId&&canParent(page.id,previousLevel))void onMove(page,previousLevel);
  };
  return <View ref={node=>{listRef.current=node;}} collapsable={false} style={{position:'relative'}}>
    {roots.map(page=><TreeRow key={page.id} page={page} children={children} expanded={expanded} toggle={toggle} onOpen={onOpen}
      ancestors={[]} compact={compact} draggingId={dragging?.id||''} targetId={target||''} register={(id,node)=>{if(node){rows.current.set(id,node);requestAnimationFrame(()=>measureRow(id));}else{rows.current.delete(id);rects.current.delete(id);}}} measure={measureRow}
      onStart={start} onMove={move} onEnd={finish} onDelete={onDelete} onInteractionChange={onInteractionChange}/>)}
  </View>;
}

function TreeRow({page,children,expanded,toggle,onOpen,ancestors,compact,draggingId,targetId,register,measure,onStart,onMove,onEnd,onDelete,onInteractionChange}:{
  page:Entity;children:Map<string,Entity[]>;expanded:Set<string>;toggle:(id:string)=>void;onOpen:(page:Entity)=>void;ancestors:string[];compact:boolean;
  draggingId:string;targetId:string;register:(id:string,node:View|null)=>void;measure:(id:string)=>void;onStart:(page:Entity)=>void;onMove:(page:Entity,x:number,y:number)=>void;
  onEnd:(page:Entity,x:number,y:number,dx:number,dy:number)=>void;onDelete?:(page:Entity)=>void;onInteractionChange?:(active:boolean)=>void;
}){
  const c=useTheme(),pan=useRef(new Animated.ValueXY()).current,startPoint=useRef({x:0,y:0}),lastPoint=useRef({x:0,y:0}),draggingRef=useRef(false),suppressPress=useRef(false),[showDelete,setShowDelete]=useState(false);
  if(ancestors.includes(page.id)||ancestors.length>40)return null;
  const kids=children.get(page.id)||[],open=compact?true:expanded.has(page.id),isTarget=targetId===page.id,isDragging=draggingId===page.id;
  const pageLabel=String(page.data?.parent_id||'')?'Abrir subpágina '+page.title:'Abrir página principal '+page.title;
  const reset=()=>Animated.spring(pan,{toValue:{x:0,y:0},useNativeDriver:true,speed:28,bounciness:4}).start();
  const finishDrag=(x:number,y:number)=>{
    if(!draggingRef.current)return;
    const dx=x-startPoint.current.x,dy=y-startPoint.current.y;
    onEnd(page,x,y,dx,dy);draggingRef.current=false;onInteractionChange?.(false);reset();
  };
  return <View>
    <View ref={node=>register(page.id,node)} collapsable={false} onLayout={()=>measure(page.id)}
      style={{paddingLeft:Math.min(ancestors.length,6)*(compact?14:16),borderRadius:9,backgroundColor:isTarget?c.accentSoft:'transparent'}}>
      <Pressable accessible accessibilityRole="button" accessibilityLabel={pageLabel} accessibilityHint={'Segure para opções ou arraste para reorganizar '+page.title}
        delayLongPress={140} pressRetentionOffset={{top:700,right:700,bottom:700,left:700}}
        onPressIn={e=>{const p={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};startPoint.current=p;lastPoint.current=p;}}
        onLongPress={()=>{suppressPress.current=true;setShowDelete(!!onDelete);draggingRef.current=true;pan.stopAnimation();pan.setValue({x:0,y:0});onStart(page);onInteractionChange?.(true);}}
        onTouchMove={e=>{const x=e.nativeEvent.pageX,y=e.nativeEvent.pageY;lastPoint.current={x,y};if(draggingRef.current){const dx=x-startPoint.current.x,dy=y-startPoint.current.y;if(Math.abs(dx)>5||Math.abs(dy)>5)setShowDelete(false);pan.setValue({x:dx,y:dy});onMove(page,x,y);}}}
        onPressOut={e=>{const x=e.nativeEvent.pageX||lastPoint.current.x,y=e.nativeEvent.pageY||lastPoint.current.y;finishDrag(x,y);}}
        onPress={()=>{if(suppressPress.current){suppressPress.current=false;return;}onOpen(page);}}
        style={{flexDirection:'row',alignItems:'center',borderRadius:9}}>
        <Animated.View pointerEvents="box-none" style={{flex:1,flexDirection:'row',alignItems:'center',opacity:isDragging?.55:1,zIndex:isDragging?50:1,elevation:isDragging?16:0,
          transform:[...pan.getTranslateTransform(),{scale:isDragging?1.04:1}]}}>
          {!compact&&kids.length?<Pressable accessibilityRole="button" accessibilityLabel={open?'Recolher subpáginas de '+page.title:'Expandir subpáginas de '+page.title}
            accessibilityState={{expanded:open}} onPress={e=>{e.stopPropagation();toggle(page.id);}} style={{width:28,minHeight:46,justifyContent:'center',alignItems:'center'}}>
            <View style={{transform:[{rotate:open?'90deg':'0deg'}]}}><Icon name="chevron" size={14} color={c.muted}/></View>
          </Pressable>:!compact?<View style={{width:28}}/>:null}
          <Text pointerEvents="none" style={{fontSize:22,color:c.text,width:34,textAlign:'center'}}>{iconFor(page)}</Text>
          <View pointerEvents="none" style={{flex:1,minHeight:compact?40:46,justifyContent:'center',paddingRight:10,paddingLeft:6}}>
            <Text numberOfLines={1} style={{fontSize:16,color:c.text,fontWeight:ancestors.length?'400':'600'}}>{page.title}</Text>
          </View>
        </Animated.View>
      </Pressable>
      {showDelete&&onDelete?<Pressable accessibilityRole="button" accessibilityLabel={'Excluir página '+page.title} onPress={()=>{setShowDelete(false);onDelete(page);}}
        style={{alignSelf:'flex-end',marginRight:10,marginBottom:6,paddingHorizontal:12,paddingVertical:7,borderRadius:9,backgroundColor:c.input}}>
        <Text style={{fontSize:12,fontWeight:'700',color:c.danger}}>Excluir</Text>
      </Pressable>:null}
    </View>
    {open?kids.map(child=><TreeRow key={child.id} page={child} children={children} expanded={expanded} toggle={toggle} onOpen={onOpen}
      ancestors={[...ancestors,page.id]} compact={compact} draggingId={draggingId} targetId={targetId} register={register} measure={measure}
      onStart={onStart} onMove={onMove} onEnd={onEnd} onDelete={onDelete} onInteractionChange={onInteractionChange}/>):null}
  </View>;
}
