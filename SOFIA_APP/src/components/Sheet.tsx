import React,{useEffect,useRef} from 'react';
import {Animated,KeyboardAvoidingView,Modal,Platform,Pressable,StyleSheet,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../lib/theme';
export function Sheet({visible,onClose,children,label='Fechar painel'}:{visible:boolean;onClose:()=>void;children:React.ReactNode;label?:string}){
 const c=useTheme(),insets=useSafeAreaInsets(),opacity=useRef(new Animated.Value(0)).current,slide=useRef(new Animated.Value(24)).current;
 useEffect(()=>{if(visible){opacity.setValue(0);slide.setValue(24);Animated.parallel([Animated.timing(opacity,{toValue:1,duration:160,useNativeDriver:true}),Animated.spring(slide,{toValue:0,damping:25,stiffness:300,useNativeDriver:true})]).start();}},[visible,opacity,slide]);
 return <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
 <Animated.View testID="sheet-backdrop" style={[StyleSheet.absoluteFill,{backgroundColor:'#00000066',opacity}]}><Pressable accessibilityLabel={label} style={{flex:1}} onPress={onClose}/></Animated.View>
 <View pointerEvents="box-none" style={{flex:1,justifyContent:'flex-end',paddingTop:insets.top+16}}><Animated.View testID="sheet-panel" accessibilityViewIsModal style={{maxHeight:'95%',backgroundColor:c.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,paddingBottom:Math.max(20,insets.bottom+12),opacity,transform:[{translateY:slide}]}}>{children}</Animated.View></View>
 </KeyboardAvoidingView></Modal>;
}
