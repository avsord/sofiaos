import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import type {ProductSeries} from '../lib/monitoring';
import {money,percent} from '../lib/monitoring';

// Widget da Home: versão compacta do Monitoramento (30 dias, em R$).
export function MonitorWidget({products,onOpen}:{products:ProductSeries[]|null;onOpen:()=>void}){const c=useTheme();
 const list=products||[];
 // Cada produto só se compara consigo mesmo: sobe quem está no próprio menor
 // preço e, depois, quem teve leitura mais recente.
 const top=[...list].sort((a,b)=>Number(b.atLow)-Number(a.atLow)||(b.lastAt??0)-(a.lastAt??0)).slice(0,5);
 return <Pressable accessibilityRole="button" accessibilityLabel="Abrir Price Tracker" onPress={onOpen} style={{backgroundColor:c.surface,padding:16,borderRadius:22,borderWidth:1,borderColor:c.line,gap:12}}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontSize:19,fontWeight:'700',color:c.text}}>Price Tracker</Text><Text style={{fontSize:11,color:c.muted}}>{list.length?`${list.length} ${list.length===1?'produto':'produtos'}`:''}</Text></View>
  {!list.length?<Text style={{fontSize:13,lineHeight:19,color:c.muted}}>Acompanhe o preço do que você quer comprar. Toque para colar o link de um produto.</Text>:<>
   <View style={{gap:9}}>{top.map(p=><View key={p.monitor.id} style={{flexDirection:'row',alignItems:'center',gap:10}}>
    <View style={{width:4,height:28,borderRadius:2,backgroundColor:p.color}}/>
    <View style={{flex:1}}><Text numberOfLines={1} style={{fontSize:13,color:c.text}}>{p.monitor.title}</Text>{p.atLow?<Text style={{fontSize:11,color:'#2fc58b',fontWeight:'700'}}>Menor preço já visto</Text>:p.now?<Text style={{fontSize:11,color:c.muted}}>na {p.now.store.name}</Text>:<Text style={{fontSize:11,color:c.muted}}>aguardando leitura</Text>}</View>
    <View style={{alignItems:'flex-end'}}><Text style={{fontSize:14,fontWeight:'700',color:c.text}}>{p.now?money(p.now.price,p.currency):'—'}</Text>{p.change!==null&&Math.abs(p.change)>=0.05?<Text style={{fontSize:11,fontWeight:'700',color:p.change<0?'#2fc58b':'#ff6b7a'}}>{p.change<0?'▼ ':'▲ '}{percent(p.change).replace(/^[−+]/,'')}</Text>:null}</View>
   </View>)}</View>
   {list.length?<View style={{flexDirection:'row',justifyContent:'center',paddingTop:4,borderTopWidth:1,borderColor:c.line}}><Text style={{color:c.accent,fontWeight:'700',fontSize:14,paddingTop:10}}>Ver mais</Text></View>:null}</>}
 </Pressable>;}
