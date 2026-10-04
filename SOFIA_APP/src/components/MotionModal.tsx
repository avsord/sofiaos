import React,{useRef} from 'react';
import {Animated,Modal} from 'react-native';
import type {ModalProps} from 'react-native';
import {useMotionPresence} from '../lib/motion';
import {useTheme} from '../lib/theme';
export function MotionModal({visible=true,children,transparent=false,animationType:_animationType,...props}:ModalProps){
 const c=useTheme(),{mounted,progress,reduced}=useMotionPresence(!!visible),last=useRef(children);
 if(visible)last.current=children;
 return <Modal {...props} visible={mounted} transparent animationType="none"><Animated.View pointerEvents={visible?'auto':'none'} style={{flex:1,backgroundColor:transparent?'transparent':c.bg,opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[reduced?0:20,0]})}]}}>{visible?children:last.current}</Animated.View></Modal>;
}
