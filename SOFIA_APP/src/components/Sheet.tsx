import {useMotionPresence} from '../lib/motion';
import React,{useEffect,useRef,useState} from 'react';
import {Animated,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,StyleSheet,useWindowDimensions,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../lib/theme';
export function Sheet({visible,onClose,children,label='Fechar painel'}:{visible:boolean;onClose:()=>void;children:React.ReactNode;label?:string}){
 const c=useTheme(),insets=useSafeAreaInsets(),{height:windowHeight}=useWindowDimensions(),[shown,setShown]=useState(false),[height,setHeight]=useState(0);
 // 0.3.167: no Android o teclado cobria os campos das folhas (o Modal translucido nao redimensiona
 // a janela, entao o KeyboardAvoidingView nao tinha efeito). Medimos o teclado e afastamos o painel.
 // 0.3.187: alguns aparelhos ja encolhem a janela quando o teclado abre, outros nao. Em vez de
 // empurrar sempre a altura inteira do teclado (o que deixava a folha cortada e flutuando com um vao),
 // medimos quanto o teclado REALMENTE cobre a area da folha e afastamos so isso.
 const rootRef=useRef<View>(null),kbTop=useRef(0);
 const [keyboard,setKeyboard]=useState(0),[kbOpen,setKbOpen]=useState(false),[rootH,setRootH]=useState(0);
 const measure=()=>{if(!kbTop.current){setKeyboard(0);return;}rootRef.current?.measureInWindow((_x,y,_w,h)=>setKeyboard(Math.max(0,Math.round(y+h-kbTop.current))));};
 useEffect(()=>{
  if(Platform.OS==='ios')return;
  const show=Keyboard.addListener('keyboardDidShow',e=>{kbTop.current=e.endCoordinates?.screenY||0;setKbOpen(true);measure();});
  const hide=Keyboard.addListener('keyboardDidHide',()=>{kbTop.current=0;setKbOpen(false);setKeyboard(0);});
  return()=>{show.remove();hide.remove();};
 },[]);
 const {mounted,progress,reduced}=useMotionPresence(visible,{enterReady:shown&&height>0,enterDuration:220,exitDuration:180}),last=useRef(children);
 useEffect(()=>{if(!mounted){setShown(false);setHeight(0);}},[mounted]);
 if(visible)last.current=children;
 return <Modal visible={mounted} onShow={()=>setShown(true)} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={()=>{if(visible)onClose();}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
 <Animated.View testID="sheet-backdrop" style={[StyleSheet.absoluteFill,{backgroundColor:'#00000066',opacity:progress}]}><Pressable accessibilityLabel={label} style={{flex:1}} onPress={onClose}/></Animated.View>
 <View ref={rootRef} onLayout={e=>{setRootH(e.nativeEvent.layout.height);if(kbTop.current)measure();}} pointerEvents={visible?'box-none':'none'} style={{flex:1,justifyContent:'flex-end',paddingTop:insets.top+16}}><Animated.View testID="sheet-panel" onLayout={event=>setHeight(event.nativeEvent.layout.height)} accessibilityViewIsModal style={{maxHeight:Math.max(220,(rootH||windowHeight)-keyboard-insets.top-24),backgroundColor:c.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,marginBottom:keyboard,paddingBottom:kbOpen?16:Math.max(20,insets.bottom+12),opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[reduced?0:height+insets.bottom,0]})}]}}>{visible?children:last.current}</Animated.View></View>
 </KeyboardAvoidingView></Modal>;
}
