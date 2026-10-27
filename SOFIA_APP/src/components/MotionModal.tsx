import React,{useRef} from 'react';
import {Animated,Modal,Pressable,View} from 'react-native';
import {DialogContext,useDesktop} from '../lib/desktop';
import type {ModalProps} from 'react-native';
import {useMotionPresence} from '../lib/motion';
import {useTheme} from '../lib/theme';
export function MotionModal({visible=true,children,transparent=false,...props}:ModalProps){
 const desktop=useDesktop();
 // 0.3.251 (computador): tela cheia do celular vira painel lateral (side peek, como no Notion): a tela de
 // tras continua visivel; clicar fora ou Esc fecha pelo mesmo caminho do voltar do Android.
 if(!transparent&&desktop)return <SidePeek {...props} visible={visible}>{children}</SidePeek>;
 if(!transparent)return <Modal {...props} visible={visible} animationType="none">{children}</Modal>;
 return <AnimatedTransparentModal {...props} visible={visible}>{children}</AnimatedTransparentModal>;
}
function AnimatedTransparentModal({visible=true,children,animationType:_animationType,...props}:ModalProps){
 const c=useTheme(),{mounted,progress,reduced}=useMotionPresence(!!visible),last=useRef(children);
 if(visible)last.current=children;
 return <Modal {...props} visible={mounted} transparent animationType="none"><Animated.View pointerEvents={visible?'auto':'none'} style={{flex:1,backgroundColor:'transparent',opacity:progress}}>{visible?children:last.current}</Animated.View></Modal>;
}

function SidePeek({visible=true,children,onRequestClose}:ModalProps){
 const c=useTheme(),{mounted,progress}=useMotionPresence(!!visible),last=useRef(children);
 if(visible)last.current=children;
 return <Modal visible={mounted} transparent animationType="none" onRequestClose={onRequestClose}>
  <View testID="side-peek" style={{flex:1,flexDirection:'row'}} pointerEvents={visible?'auto':'none'}>
   <Animated.View style={{flex:1,opacity:progress}}><Pressable accessibilityLabel="Fechar painel" onPress={()=>onRequestClose?.({} as any)} style={{flex:1,backgroundColor:'#00000059'}}/></Animated.View>
   <Animated.View testID="side-peek-panel" style={{width:'60%',minWidth:560,maxWidth:860,height:'100%',backgroundColor:c.bg,borderLeftWidth:1,borderColor:c.line,shadowColor:'#000',shadowOpacity:0.35,shadowRadius:30,shadowOffset:{width:-8,height:0},opacity:progress,transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[40,0]})}]}}>
    <DialogContext.Provider value={true}>{visible?children:last.current}</DialogContext.Provider>
   </Animated.View>
  </View>
 </Modal>;
}
