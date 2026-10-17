import React,{useEffect,useState} from 'react';
import {Alert,Modal,Pressable,Text,View} from 'react-native';
import {useTheme} from './theme';

// 0.3.153: confirmacoes no visual da Sofia (antes: caixa cinza nativa do Android, que quebrava a imersao).
// Mesma assinatura do Alert.alert; se a janela ainda nao estiver montada, cai no nativo.
export type AppAlertButton={text?:string;style?:'default'|'cancel'|'destructive';onPress?:()=>void};
type Pending={title:string;message?:string;buttons:AppAlertButton[]};
let show:((a:Pending)=>void)|null=null;
const queue:Pending[]=[];
export function appAlert(title:string,message?:string,buttons?:AppAlertButton[],_options?:unknown){
 const item={title,message,buttons:buttons&&buttons.length?buttons:[{text:'OK'}]};
 if(show)show(item);else Alert.alert(title,message,item.buttons as any);
}
export function AppAlertHost(){
 const c=useTheme(),[current,setCurrent]=useState<Pending|null>(null);
 useEffect(()=>{show=item=>{setCurrent(cur=>{if(cur){queue.push(item);return cur;}return item;});};return()=>{show=null;};},[]);
 function close(btn?:AppAlertButton){setCurrent(queue.shift()||null);if(btn?.onPress)setTimeout(btn.onPress,0);}
 const cancel=current?.buttons.find(b=>b.style==='cancel')||(current&&current.buttons.length>1?current.buttons[0]:undefined);
 return <Modal visible={!!current} transparent animationType="fade" statusBarTranslucent onRequestClose={()=>close(cancel)}>
  <Pressable accessibilityLabel="Fechar" onPress={()=>close(cancel)} style={{flex:1,backgroundColor:'#0008',alignItems:'center',justifyContent:'center',padding:28}}>
   <Pressable accessibilityRole="alert" onPress={()=>undefined} style={{width:'100%',maxWidth:420,backgroundColor:c.surface,borderRadius:24,padding:22,gap:10,borderWidth:1,borderColor:c.line}}>
    <Text style={{color:c.text,fontSize:19,fontWeight:'800'}}>{current?.title}</Text>
    {current?.message?<Text style={{color:c.muted,fontSize:14,lineHeight:21}}>{current.message}</Text>:null}
    <View style={{flexDirection:'row',justifyContent:'flex-end',flexWrap:'wrap',gap:10,marginTop:10}}>
     {current?.buttons.map((b,i)=>{const strong=b.style!=='cancel'&&i===current.buttons.length-1;const danger=b.style==='destructive';
      return <Pressable key={i} accessibilityRole="button" onPress={()=>close(b)} style={({pressed})=>({paddingHorizontal:18,paddingVertical:11,borderRadius:14,backgroundColor:strong?(danger?c.danger:c.accent):c.accentSoft,opacity:pressed?0.8:1})}>
       <Text style={{color:strong?'#fff':(danger?c.danger:c.accent),fontWeight:'700',fontSize:14}}>{b.text||'OK'}</Text>
      </Pressable>;})}
    </View>
   </Pressable>
  </Pressable>
 </Modal>;
}
