import {useMotionPresence} from '../lib/motion';
import React,{useEffect,useRef,useState} from 'react';
import {Animated,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,StyleSheet,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../lib/theme';
export function Sheet({visible,onClose,children,label='Fechar painel'}:{visible:boolean;onClose:()=>void;children:React.ReactNode;label?:string}){
 const c=useTheme(),insets=useSafeAreaInsets(),[shown,setShown]=useState(false),[height,setHeight]=useState(0);
 // 0.3.167: no Android o teclado cobria os campos das folhas (o Modal translucido nao redimensiona
 // a janela, entao o KeyboardAvoidingView nao tinha efeito). Medimos o teclado e afastamos o painel.
 const [keyboard,setKeyboard]=useState(0);
 useEffect(()=>{
  if(Platform.OS==='ios')return;
  const show=Keyboard.addListener('keyboardDidShow',e=>setKeyboard(e.endCoordinates?.height||0));
  const hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboard(0));
  return()=>{show.remove();hide.remove();};
 },[]);
 const {mounted,progress,reduced}=useMotionPresence(visible,{enterReady:shown&&height>0,enterDuration:220,exitDuration:180}),last=useRef(children);
 useEffect(()=>{if(!mounted){setShown(false);setHeight(0);}},[mounted]);
 if(visible)last.current=children;
 return <Modal visible={mounted} onShow={()=>setShown(true)} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={()=>{if(visible)onClose();}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
 <Animated.View testID="sheet-backdrop" style={[StyleSheet.absoluteFill,{backgroundColor:'#00000066',opacity:progress}]}><Pressable accessibilityLabel={label} style={{flex:1}} onPress={onClose}/></Animated.View>
 <View pointerEvents={visible?'box-none':'none'} style={{flex:1,justifyContent:'flex-end',paddingTop:insets.top+16}}><Animated.View testID="sheet-panel" onLayout={event=>setHeight(event.nativeEvent.layout.height)} accessibilityViewIsModal style={{maxHeight:'95%',backgroundColor:c.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,marginBottom:keyboard?Math.max(0,keyboard-insets.bottom):0,paddingBottom:Math.max(20,insets.bottom+12),opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[reduced?0:height+insets.bottom,0]})}]}}>{visible?children:last.current}</Animated.View></View>
 </KeyboardAvoidingView></Modal>;
}
