import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Animated,Keyboard,PanResponder,Pressable,ScrollView,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {columnAt,edgeSpeed} from '../lib/kanban';
import type {ColumnRect,KanbanRow} from '../lib/kanban';
import {statusColorHex} from '../lib/page-templates';
type Drag={id:string;column:string;startX:number;startY:number;x:number;y:number;left:number;top:number;width:number;title:string};
type Props={rows:KanbanRow[];columns:string[];colors?:Record<string,string>;groupKey:string;nameKey:string;onMove:(id:string,column:string,beforeId?:string)=>void;onEdit:(id:string)=>void;onAdd:(column:string)=>void;onColumn:(column:string|null)=>void;onInteractionChange?:(active:boolean)=>void};
export function KanbanBoard(props:Props){
 const c=useTheme(),latest=useRef(props);latest.current=props;
 const board=useRef<View>(null),scroll=useRef<ScrollView>(null),viewport=useRef({x:0,y:0,width:1}),offset=useRef(0),contentWidth=useRef(0);
 const rects=useRef(new Map<string,ColumnRect>()),cards=useRef(new Map<string,{view:View|null;y:number;height:number;column:string}>());
 const [drag,setDrag]=useState<Drag|null>(null),dragRef=useRef<Drag|null>(null),frame=useRef<number|null>(null),translation=useRef(new Animated.ValueXY()).current;
 const [target,setTarget]=useState<string|null>(null),targetRef=useRef<string|null>(null);
 function stopFrame(){if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}}
 function targetAt(){const d=dragRef.current;if(!d)return;const next=columnAt([...rects.current.values()],d.x-viewport.current.x+offset.current);if(next!==targetRef.current){targetRef.current=next;setTarget(next);}}
 function edge(){frame.current=null;const d=dragRef.current;if(!d)return;const speed=edgeSpeed(d.x-viewport.current.x,viewport.current.width);const next=Math.max(0,Math.min(Math.max(0,contentWidth.current-viewport.current.width),offset.current+speed));if(next!==offset.current){offset.current=next;scroll.current?.scrollTo({x:next,y:0,animated:false});targetAt();}frame.current=requestAnimationFrame(edge);}
 function finish(cancel=false){const d=dragRef.current,column=targetRef.current;stopFrame();dragRef.current=null;setDrag(null);setTarget(null);targetRef.current=null;latest.current.onInteractionChange?.(false);if(cancel||!d||column===null)return;
  const y=d.y-viewport.current.y;const before=latest.current.rows.find(row=>row.id!==d.id&&String(row.values[latest.current.groupKey]||'')===column&&y<(cards.current.get(row.id)?.y??Infinity)+(cards.current.get(row.id)?.height??0)/2);
  latest.current.onMove(d.id,column,before?.id);
 }
 function move(x:number,y:number){const d=dragRef.current;if(!d)return;d.x=x;d.y=y;translation.setValue({x:x-d.startX,y:y-d.startY});targetAt();}
 const responder=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>false,onMoveShouldSetPanResponderCapture:()=>dragRef.current!==null,
  onPanResponderMove:(_e,g)=>move(g.moveX,g.moveY),onPanResponderRelease:(_e,g)=>{move(g.moveX,g.moveY);finish();},
  onPanResponderTerminate:()=>finish(true),onPanResponderTerminationRequest:()=>dragRef.current===null,onShouldBlockNativeResponder:()=>dragRef.current!==null
 }),[]);
 useEffect(()=>()=>{stopFrame();latest.current.onInteractionChange?.(false);},[]);
 function start(row:KanbanRow,column:string,pageX:number,pageY:number){
  Keyboard.dismiss();const card=cards.current.get(row.id)?.view;if(!card)return;
  // Measure the actual card and viewport. Different widths, scrolling and tablet layouts are supported.
  board.current?.measureInWindow((bx,by,width)=>{viewport.current={x:bx,y:by,width};card.measureInWindow((x,y,w)=>{
   const d={id:row.id,column,startX:pageX,startY:pageY,x:pageX,y:pageY,left:x-bx,top:y-by,width:w,title:String(row.values[latest.current.nameKey]||'Sem título')};
   translation.setValue({x:0,y:0});dragRef.current=d;setDrag(d);targetRef.current=column;setTarget(column);latest.current.onInteractionChange?.(true);stopFrame();frame.current=requestAnimationFrame(edge);
  });});
 }
 return <View ref={board} collapsable={false} nativeID="sofia-kanban" {...responder.panHandlers} onTouchEnd={()=>{if(dragRef.current)finish();}} onLayout={()=>board.current?.measureInWindow((x,y,width)=>{viewport.current={x,y,width};})}>
  <ScrollView ref={scroll} horizontal nestedScrollEnabled directionalLockEnabled scrollEnabled={!drag} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
   onScroll={e=>{offset.current=e.nativeEvent.contentOffset.x;}} onContentSizeChange={width=>{contentWidth.current=width;}} contentContainerStyle={{gap:12,paddingVertical:8,paddingRight:12,alignItems:'flex-start'}}>
   {props.columns.map(column=>{const rows=props.rows.filter(row=>String(row.values[props.groupKey]||'')===column),color=statusColorHex(props.colors?.[column]||'gray');return <View key={column} onLayout={e=>{rects.current.set(column,{value:column,x:e.nativeEvent.layout.x,width:e.nativeEvent.layout.width});}} style={{width:246,minHeight:150,borderRadius:14,padding:10,gap:8,backgroundColor:c.input,borderWidth:1,borderColor:target===column?c.accent:'transparent'}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:6}}><View style={{width:7,height:7,borderRadius:4,backgroundColor:color}}/><Pressable accessibilityLabel={'Configurar coluna '+column} onPress={()=>props.onColumn(column)} style={{flex:1,paddingVertical:8}}><Text numberOfLines={1} style={{color:c.text,fontWeight:'600',fontSize:13}}>{column||'Sem coluna'} <Text style={{color:c.muted,fontWeight:'400'}}> {rows.length}</Text></Text></Pressable><Pressable accessibilityLabel={'Nova tarefa em '+column} onPress={()=>props.onAdd(column)} style={{padding:8}}><Text style={{color:c.muted,fontSize:20}}>＋</Text></Pressable></View>
    {rows.map(row=><View key={row.id} collapsable={false} ref={view=>{const old=cards.current.get(row.id);cards.current.set(row.id,{view,y:old?.y||0,height:old?.height||0,column});}} onLayout={e=>{const old=cards.current.get(row.id);if(old)cards.current.set(row.id,{...old,y:e.nativeEvent.layout.y,height:e.nativeEvent.layout.height});}}>
     <Pressable delayLongPress={180} accessibilityRole="button" accessibilityLabel={'Cartão '+String(row.values[props.nameKey]||'Sem título')} accessibilityHint="Toque para editar. Segure e arraste para mover; a coluna também pode ser escolhida no editor."
      onPress={()=>{if(!dragRef.current)props.onEdit(row.id);}} onLongPress={e=>start(row,column,e.nativeEvent.pageX,e.nativeEvent.pageY)}
      style={({pressed})=>({padding:13,gap:7,borderRadius:10,borderWidth:1,borderColor:drag?.id===row.id?c.accent:c.line,backgroundColor:c.surface,opacity:drag?.id===row.id?0.28:pressed?0.8:1})}>
      <Text style={{color:c.text,fontWeight:'500',fontSize:14,lineHeight:20}}>{String(row.values[props.nameKey]||'Sem título')}</Text>
      {String(row.values.description||row.page_content||'')?<Text numberOfLines={2} style={{color:c.muted,fontSize:12,lineHeight:17}}>{String(row.values.description||row.page_content||'')}</Text>:null}
     </Pressable></View>)}
    <Pressable accessibilityLabel={'Adicionar cartão em '+column} onPress={()=>props.onAdd(column)} style={{padding:10}}><Text style={{fontSize:12,color:c.muted}}>＋ Novo cartão</Text></Pressable>
   </View>;})}
   <Pressable accessibilityLabel="Adicionar coluna" onPress={()=>props.onColumn(null)} style={{padding:16,minWidth:140}}><Text style={{color:c.muted,fontSize:13}}>＋ Coluna</Text></Pressable>
  </ScrollView>
  {drag?<Animated.View pointerEvents="none" style={{position:'absolute',left:drag.left,top:drag.top,width:drag.width,zIndex:30,elevation:12,padding:14,borderRadius:10,backgroundColor:c.surface,borderWidth:1,borderColor:c.accent,transform:[...translation.getTranslateTransform(),{scale:1.025}]}}><Text style={{color:c.text,fontSize:14,fontWeight:'600'}}>{drag.title}</Text><Text style={{color:c.accent,fontSize:11,marginTop:6}}>Solte em {target||drag.column}</Text></Animated.View>:null}
 </View>;
}
