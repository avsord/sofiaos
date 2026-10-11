import React from 'react';
import {ScrollView,Text,View} from 'react-native';
import type {Profile} from '../lib/types';
import {useTheme} from '../lib/theme';

/** A tiny first-frame surface. It contains no data fetches and no heavy feature imports. */
export function StartupHome({profile}:{profile?:Profile|null}){
 const c=useTheme(),first=profile?.name?.trim().split(/\s+/)[0]||'Sofia';
 const date=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
 const line=(width:string)=><View style={{height:12,width:width as any,borderRadius:7,backgroundColor:c.input}}/>;
 return <ScrollView pointerEvents="none" contentContainerStyle={{paddingBottom:28}}>
  <View style={{paddingHorizontal:22,paddingTop:18,gap:7}}><Text style={{fontSize:11,color:c.muted,letterSpacing:.5}}>{date}</Text><Text style={{fontSize:29,fontWeight:'700',color:c.text}}>Olá, {first}.</Text></View>
  <View style={{padding:22,gap:18}}>
   <View style={{height:286,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,padding:18,gap:15}}>{line('38%')}<View style={{flexDirection:'row',justifyContent:'space-between'}}>{Array.from({length:7},(_,i)=><View key={i} style={{width:30,height:30,borderRadius:15,backgroundColor:c.input}}/>)}</View><View style={{flex:1,borderRadius:16,backgroundColor:c.input,opacity:.55}}/></View>
   <View style={{height:132,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,padding:18,gap:13}}>{line('32%')}{line('78%')}{line('58%')}</View>
   <View style={{height:170,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,padding:18,gap:13}}>{line('28%')}{line('88%')}{line('72%')}{line('62%')}</View>
  </View>
 </ScrollView>;
}
