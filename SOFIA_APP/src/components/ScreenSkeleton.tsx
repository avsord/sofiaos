import React from 'react';
import {Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
/** What a tab shows the instant it is tapped for the first time, while its screen renders in a transition.
 * Principle: the gesture always gets a frame now; content follows. Deliberately tiny (a few views, no data). */
const TITLES:Record<string,string>={home:'Início',chat:'Conversa',pages:'Páginas',agenda:'Agenda',apps:'Apps',profile:'Perfil'};
export function ScreenSkeleton({tab}:{tab:string}){
 const c=useTheme();
 return <View testID={'screen-skeleton-'+tab} style={{flex:1,backgroundColor:c.bg,paddingHorizontal:20,paddingTop:48,gap:14}}>
  <Text style={{color:c.text,fontSize:26,fontWeight:'700'}}>{TITLES[tab]||''}</Text>
  <View style={{height:14,width:'62%',borderRadius:7,backgroundColor:c.line}}/>
  <View style={{height:14,width:'44%',borderRadius:7,backgroundColor:c.line}}/>
  <View style={{height:120,borderRadius:18,backgroundColor:c.surface,borderWidth:1,borderColor:c.line}}/>
 </View>;
}
