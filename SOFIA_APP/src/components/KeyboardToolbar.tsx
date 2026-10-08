import React from 'react';
import {Animated,View} from 'react-native';
import {useMotionPresence} from '../lib/motion';
/** Overlay above the IME: animates without resizing the document on each frame. */
export function KeyboardToolbar({visible,children,testID}:{visible:boolean;children:React.ReactNode;testID:string}){
 const {mounted,progress,reduced}=useMotionPresence(visible);
 if(!mounted)return null;
 return <Animated.View testID={testID} pointerEvents={visible?'auto':'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible?'auto':'no-hide-descendants'} style={{position:'absolute',bottom:0,left:0,right:0,zIndex:20,opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[reduced?0:14,0]})}]}}><View>{children}</View></Animated.View>;
}
