import React,{useEffect,useRef,useState} from 'react';
import {Pressable,Text,Vibration,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Sheet} from './Sheet';
import {ReorderList} from './ReorderList';

/** 0.3.221: segurar qualquer widget do Inicio abre o seletor "Organizar Inicio": lista com puxador (≡) para
 * arrastar, tirar e adicionar widgets. Na tela inicial nada se arrasta - a rolagem fica livre. */
type Item={id:string;title:string;content:React.ReactNode};
const HOLD=450;
export function SortableWidgets({items,order,onSave,onLock,fixed=[],noHold=[]}:{items:Item[];order:string[];onSave:(order:string[])=>Promise<void>;onLock:(locked:boolean)=>void;fixed?:string[];noHold?:string[]}){
 const c=useTheme(),[open,setOpen]=useState(false),[draft,setDraft]=useState(order);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),start=useRef({x:0,y:0});
 useEffect(()=>{if(!open)setDraft(order);},[order,open]);
 const cancel=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 useEffect(()=>()=>{cancel();onLock(false);},[]);
 function hold(x:number,y:number){cancel();start.current={x,y};timer.current=setTimeout(()=>{timer.current=null;try{Vibration.vibrate(12);}catch{/* sem vibracao */}setDraft(order);setOpen(true);},HOLD);}
 function moved(x:number,y:number){if(timer.current&&Math.abs(x-start.current.x)+Math.abs(y-start.current.y)>8)cancel();}
 const save=(next:string[])=>{setDraft(next);void onSave(next).catch(()=>setDraft(order));};
 const visible=draft.filter(id=>items.some(i=>i.id===id)),hidden=items.filter(i=>!visible.includes(i.id));
 return <View style={{gap:18}}>
  {order.map(id=>{const item=items.find(i=>i.id===id);if(!item)return null;
   // widget que ja usa o segurar para outra coisa (agenda: segurar um dia cria compromisso) nao abre o seletor
   if(noHold.includes(id))return <View key={id}>{item.content}</View>;
   return <View key={id} collapsable={false} onTouchStart={e=>hold(e.nativeEvent.pageX,e.nativeEvent.pageY)} onTouchMove={e=>moved(e.nativeEvent.pageX,e.nativeEvent.pageY)} onTouchEnd={cancel} onTouchCancel={cancel}>{item.content}</View>;})}
  <Sheet visible={open} onClose={()=>setOpen(false)} label="Fechar organizar a tela inicial">
   <View style={{gap:14,paddingBottom:12}}>
    <View style={{flexDirection:'row',alignItems:'center'}}>
     <Text style={{flex:1,fontSize:20,fontWeight:'800',color:c.text}}>Organizar Início</Text>
     <Pressable accessibilityRole="button" onPress={()=>setOpen(false)} style={{paddingHorizontal:14,paddingVertical:8,borderRadius:99,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontWeight:'700',fontSize:13}}>Pronto</Text></Pressable>
    </View>
    <Text style={{color:c.muted,fontSize:12}}>Arraste pelo ≡ para mudar a ordem.</Text>
    <ReorderList rows={visible.map(id=>({id,title:items.find(i=>i.id===id)!.title,removable:!fixed.includes(id)}))} onChange={save} onRemove={id=>save(visible.filter(x=>x!==id))}/>
    {hidden.length?<View style={{gap:6}}>
     <Text style={{color:c.muted,fontSize:12,fontWeight:'700'}}>Adicionar</Text>
     {hidden.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Adicionar '+item.title} onPress={()=>save([...visible,item.id])} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,paddingHorizontal:14,borderRadius:14,borderWidth:1,borderColor:c.line,backgroundColor:c.surface}}>
      <View style={{width:22,height:22,borderRadius:11,backgroundColor:c.accent,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.onAccent,fontWeight:'800',fontSize:15,lineHeight:17}}>+</Text></View>
      <Text style={{color:c.text,fontSize:15,fontWeight:'600'}}>{item.title}</Text>
     </Pressable>)}
    </View>:null}
   </View>
  </Sheet>
 </View>;
}
