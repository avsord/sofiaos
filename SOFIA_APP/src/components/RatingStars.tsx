import React from 'react';
import {View,Text,Pressable} from 'react-native';
import {useTheme} from '../lib/theme';
export function RatingStars({value,onChange,label='Sua avaliação'}:{value:number;onChange?:(value:number)=>void;label?:string}){
 const c=useTheme();
 if(!onChange)return <Text accessibilityLabel={value?'Avaliação: '+value+' de 5 estrelas':'Sem avaliação'} style={{color:value?c.accent:c.muted,fontSize:16,letterSpacing:2}}>{'★'.repeat(value)+'☆'.repeat(5-value)}</Text>;
 return <View style={{gap:8}}><Text style={{color:c.muted,fontSize:12}}>{label}</Text><View style={{flexDirection:'row'}}>{[1,2,3,4,5].map(star=><Pressable key={star} accessibilityRole="radio" accessibilityState={{checked:value===star}} accessibilityLabel={'Dar '+star+(star===1?' estrela':' estrelas')} onPress={()=>onChange(star)} style={{minWidth:44,minHeight:48,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:32,color:star<=value?c.accent:c.muted}}>{star<=value?'★':'☆'}</Text></Pressable>)}</View><Text style={{color:c.muted,fontSize:12}}>{value?value+' de 5 estrelas':'Sem avaliação'}</Text>{value?<Pressable accessibilityRole="button" onPress={()=>onChange(0)} style={{paddingVertical:8}}><Text style={{color:c.accent}}>Remover avaliação</Text></Pressable>:null}</View>;
}
