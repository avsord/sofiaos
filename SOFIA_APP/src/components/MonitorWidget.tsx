import React from 'react';
import {tap} from '../lib/desktop';
import {Pressable,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import type {MonitorWidgetRow} from '../lib/monitoring';
import {money,percent} from '../lib/monitoring';
import {ShimmerBlock,ShimmerGroup} from './Loading';

/** Linhas de esqueleto no formato exato das linhas reais: nada pula quando os dados chegam. */
function SkeletonRows(){
 return <ShimmerGroup><View accessibilityRole="progressbar" accessibilityLabel="Carregando preços" style={{gap:9}}>
  {[0.72,0.58,0.66].map((w,i)=><View key={i} style={{flexDirection:'row',alignItems:'center',gap:10}}>
   <ShimmerBlock width={4} height={28} radius={2}/>
   <View style={{flex:1,gap:6}}><ShimmerBlock width={(w*100)+'%'} height={11}/><ShimmerBlock width={'34%'} height={9}/></View>
   <ShimmerBlock width={64} height={13}/>
  </View>)}
 </View></ShimmerGroup>;
}

// Widget da Home: versão compacta do Monitoramento (30 dias, em R$).
// rows === null → ainda sem nenhum dado (nem do cache): esqueleto com reflexo.
// rows === null + failed → sem cache e a leitura falhou: avisa em vez de esqueleto eterno.
// rows === []   → carregou e não há produtos: convite para adicionar.
export function MonitorWidget({rows,failed=false,onOpen}:{rows:MonitorWidgetRow[]|null;failed?:boolean;onOpen:()=>void}){const c=useTheme();
 const list=rows||[];
 // Cada produto só se compara consigo mesmo: sobe quem está no próprio menor
 // preço e, depois, quem teve leitura mais recente (ordem já vem de widgetRows).
 const top=list.slice(0,5);
 return <Pressable accessibilityRole="button" accessibilityLabel="Abrir Price Tracker" onPress={onOpen} style={{backgroundColor:c.surface,padding:16,borderRadius:22,borderWidth:1,borderColor:c.line,gap:12}}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontSize:19,fontWeight:'700',color:c.text}}>Price Tracker</Text><Text style={{fontSize:11,color:c.muted}}>{list.length?`${list.length} ${list.length===1?'produto':'produtos'}`:''}</Text></View>
  {rows===null?(failed?<Text style={{fontSize:13,lineHeight:19,color:c.muted}}>{tap('Não consegui carregar os preços agora. Toque para abrir o Price Tracker.')}</Text>:<SkeletonRows/>):!list.length?<Text style={{fontSize:13,lineHeight:19,color:c.muted}}>{tap('Acompanhe o preço do que você quer comprar. Toque para colar o link de um produto.')}</Text>:<>
   <View style={{gap:9}}>{top.map(p=><View key={p.id} style={{flexDirection:'row',alignItems:'center',gap:10}}>
    <View style={{width:4,height:28,borderRadius:2,backgroundColor:p.color}}/>
    <View style={{flex:1}}><Text numberOfLines={1} style={{fontSize:13,color:c.text}}>{p.title}</Text>{p.atLow?<Text style={{fontSize:11,color:'#2fc58b',fontWeight:'700'}}>Menor preço já visto</Text>:p.store?<Text style={{fontSize:11,color:c.muted}}>na {p.store}</Text>:<Text style={{fontSize:11,color:c.muted}}>aguardando leitura</Text>}</View>
    <View style={{alignItems:'flex-end'}}><Text style={{fontSize:14,fontWeight:'700',color:c.text}}>{p.price!==null?money(p.price,p.currency):'—'}</Text>{p.change!==null&&Math.abs(p.change)>=0.05?<Text style={{fontSize:11,fontWeight:'700',color:p.change<0?'#2fc58b':'#ff6b7a'}}>{p.change<0?'▼ ':'▲ '}{percent(p.change).replace(/^[−+]/,'')}</Text>:null}</View>
   </View>)}</View>
   {list.length?<View style={{flexDirection:'row',justifyContent:'center',paddingTop:4,borderTopWidth:1,borderColor:c.line}}><Text style={{color:c.accent,fontWeight:'700',fontSize:14,paddingTop:10}}>Ver mais</Text></View>:null}</>}
 </Pressable>;}
