import React,{useEffect,useMemo,useRef,useState} from 'react';
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
};
const iconFor=(page:Entity)=>String(page.data?.icon||'').trim()||'📄';
const hit=(rect:Rect|null,x:number,y:number)=>!!rect&&x>=rect.x&&x<=rect.x+rect.width&&y>=rect.y&&y<=rect.y+rect.height;

export function PageTreeList({roots,children,expanded,toggle,onOpen,onMove,canParent,compact=false}:Props){
  const c=useTheme(),rows=useRef(new Map<string,View>()),rects=useRef(new Map<string,Rect>()),rootRef=useRef<View|null>(null),rootRect=useRef<Rect|null>(null);
  const [dragging,setDragging]=useState<Entity|null>(null),[target,setTarget]=useState<string|null>(null),[overRoot,setOverRoot]=useState(false);
  const measureAll=()=>{
    rows.current.forEach((node,id)=>node.measureInWindow((x,y,width,height)=>{if(width>0&&height>0)rects.current.set(id,{x,y,width,height});}));
    rootRef.current?.measureInWindow((x,y,width,height)=>{rootRect.current=width>0&&height>0?{x,y,width,height}:null;});
  };
  useEffect(()=>{if(dragging)measureAll();else{rootRect.current=null;setTarget(null);setOverRoot(false);}},[dragging]);
  const start=(page:Entity)=>{setDragging(page);setTarget(null);setOverRoot(false);};
  const move=(page:Entity,x:number,y:number)=>{
    if(!dragging||dragging.id!==page.id)return;
    const root=hit(rootRect.current,x,y);setOverRoot(root);
    if(root){setTarget(null);return;}
    let next:string|null=null;
    for(const [id,rect] of rects.current){if(id!==page.id&&hit(rect,x,y)&&canParent(page.id,id)){next=id;break;}}
    setTarget(next);
  };
  const finish=(page:Entity,x:number,y:number)=>{
    const root=hit(rootRect.current,x,y),next=root?'':target;
    setDragging(null);setTarget(null);setOverRoot(false);
    if(next!==null&&canParent(page.id,next))void onMove(page,next);
  };
  return <View>
    {dragging?<View ref={node=>{rootRef.current=node;}} collapsable={false} accessibilityLabel="Soltar como página principal"
      style={{minHeight:44,marginHorizontal:compact?0:8,marginBottom:4,borderRadius:10,borderWidth:1,borderColor:overRoot?c.accent:c.line,backgroundColor:overRoot?c.accentSoft:c.surface,alignItems:'center',justifyContent:'center'}}>
      <Text style={{fontSize:12,fontWeight:'700',color:overRoot?c.accent:c.muted}}>Solte aqui para página principal</Text>
    </View>:null}
    {roots.map(page=><TreeRow key={page.id} page={page} children={children} expanded={expanded} toggle={toggle} onOpen={onOpen}
      ancestors={[]} compact={compact} draggingId={dragging?.id||''} targetId={target||''} register={(id,node)=>{if(node)rows.current.set(id,node);else rows.current.delete(id);}}
      onStart={start} onMove={move} onEnd={finish}/>)}
  </View>;
}

function TreeRow({page,children,expanded,toggle,onOpen,ancestors,compact,draggingId,targetId,register,onStart,onMove,onEnd}:{
  page:Entity;children:Map<string,Entity[]>;expanded:Set<string>;toggle:(id:string)=>void;onOpen:(page:Entity)=>void;ancestors:string[];compact:boolean;
  draggingId:string;targetId:string;register:(id:string,node:View|null)=>void;onStart:(page:Entity)=>void;onMove:(page:Entity,x:number,y:number)=>void;onEnd:(page:Entity,x:number,y:number)=>void;
}){
  const c=useTheme();
  if(ancestors.includes(page.id)||ancestors.length>40)return null;
  const kids=children.get(page.id)||[],open=expanded.has(page.id),isTarget=targetId===page.id,isDragging=draggingId===page.id;
  return <View>
    <View ref={node=>register(page.id,node)} collapsable={false} onLayout={()=>{}} style={{flexDirection:'row',alignItems:'center',paddingLeft:Math.min(ancestors.length,6)*(compact?12:14),borderRadius:10,backgroundColor:isTarget?c.accentSoft:'transparent',opacity:isDragging?.55:1}}>
      {kids.length?<Pressable accessibilityRole="button" accessibilityLabel={open?'Recolher subpáginas de '+page.title:'Expandir subpáginas de '+page.title} accessibilityState={{expanded:open}}
        onPress={()=>toggle(page.id)} style={{width:30,minHeight:compact?42:48,justifyContent:'center',alignItems:'center'}}>
        <View style={{transform:[{rotate:open?'90deg':'0deg'}]}}><Icon name="chevron" size={14} color={c.muted}/></View>
      </Pressable>:<View style={{width:30}}/>}
      <DragIcon page={page} active={isDragging} onStart={onStart} onMove={onMove} onEnd={onEnd}/>
      <Pressable accessibilityRole="button" accessibilityLabel={'Abrir página '+page.title} onPress={()=>onOpen(page)}
        style={({pressed})=>({flex:1,minHeight:compact?42:48,justifyContent:'center',paddingRight:10,paddingLeft:8,borderRadius:9,backgroundColor:pressed&&!isTarget?c.input:'transparent'})}>
        <Text numberOfLines={1} style={{fontSize:compact?15:16,color:c.text,fontWeight:ancestors.length?'400':'600'}}>{page.title}</Text>
      </Pressable>
    </View>
    {open?kids.map(child=><TreeRow key={child.id} page={child} children={children} expanded={expanded} toggle={toggle} onOpen={onOpen}
      ancestors={[...ancestors,page.id]} compact={compact} draggingId={draggingId} targetId={targetId} register={register} onStart={onStart} onMove={onMove} onEnd={onEnd}/>):null}
  </View>;
}

function DragIcon({page,active,onStart,onMove,onEnd}:{page:Entity;active:boolean;onStart:(page:Entity)=>void;onMove:(page:Entity,x:number,y:number)=>void;onEnd:(page:Entity,x:number,y:number)=>void}){
  const c=useTheme(),pan=useRef(new Animated.ValueXY()).current;
  const handlers=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_e,g)=>Math.abs(g.dx)+Math.abs(g.dy)>6,
    onMoveShouldSetPanResponderCapture:(_e,g)=>Math.abs(g.dx)+Math.abs(g.dy)>8,
    onPanResponderGrant:()=>{pan.stopAnimation();pan.setValue({x:0,y:0});onStart(page);},
    onPanResponderMove:(_e,g)=>{pan.setValue({x:g.dx,y:g.dy});onMove(page,g.moveX,g.moveY);},
    onPanResponderRelease:(_e,g)=>{onEnd(page,g.moveX,g.moveY);Animated.spring(pan,{toValue:{x:0,y:0},useNativeDriver:true,speed:28,bounciness:4}).start();},
    onPanResponderTerminate:(_e,g)=>{onEnd(page,g.moveX,g.moveY);Animated.spring(pan,{toValue:{x:0,y:0},useNativeDriver:true,speed:28,bounciness:4}).start();},
    onPanResponderTerminationRequest:()=>false
  }),[page,onStart,onMove,onEnd,pan]);
  return <Animated.View {...handlers.panHandlers} accessibilityLabel={'Arrastar página '+page.title}
    style={{width:34,height:40,alignItems:'center',justifyContent:'center',zIndex:active?20:1,elevation:active?8:0,transform:[...pan.getTranslateTransform(),{scale:active?1.12:1}]}}>
    <Text style={{fontSize:22,color:c.text}}>{iconFor(page)}</Text>
  </Animated.View>;
}
