import React from 'react';
import {PALETTE} from '../lib/palette';
import {Pressable,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';

/** 0.3.208: progresso da meta do guardado - de 0 ate a meta, com marcos, quanto falta e quando chega. */
export type GoalNumbers={name:string;saved:number;target:number;monthly:number;deadline:string;today:string};
const brlRaw=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brl=brlRaw;
const monthName=(ym:string)=>{const [y,m]=ym.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'short',year:'numeric'}).replace('.','').replace(' de ','/');};
const monthsBetween=(a:string,b:string)=>(Number(b.slice(0,4))-Number(a.slice(0,4)))*12+(Number(b.slice(5,7))-Number(a.slice(5,7)));
const addMonthsYm=(ym:string,n:number)=>{const [y,m]=ym.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+n,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');};
export function goalStats(g:GoalNumbers){
 const pct=g.target>0?Math.max(0,Math.min(1,g.saved/g.target)):0,missing=Math.max(0,g.target-g.saved);
 const marks=[0.25,0.5,0.75,1],next=marks.find(m=>pct<m)??null,nextValue=next!==null?g.target*next:g.target;
 const reach=missing<=0?g.today.slice(0,7):g.monthly>0?addMonthsYm(g.today.slice(0,7),Math.ceil(missing/g.monthly)):'';
 const deadlineYm=/^\d{4}-\d{2}/.test(g.deadline)?g.deadline.slice(0,7):'';
 const monthsLeft=deadlineYm?Math.max(0,monthsBetween(g.today.slice(0,7),deadlineYm)):0;
 const needed=deadlineYm&&monthsLeft>0?missing/monthsLeft:missing;
 const diff=reach&&deadlineYm?monthsBetween(reach,deadlineYm):0;
 const message=pct>=1?'Meta batida! 🎉 Hora de comemorar e, quem sabe, sonhar a próxima.':pct>=0.75?'Reta final: falta pouco para chegar lá.':pct>=0.5?'Mais da metade do caminho. Continue no ritmo!':pct>=0.25?'Um quarto do caminho já foi. Cada aporte conta.':'Começo firme: o mais difícil é começar, e você já começou.';
 return {pct,missing,next,nextValue,nextMissing:Math.max(0,nextValue-g.saved),reach,deadlineYm,monthsLeft,needed,diff,message};
}
export function GoalProgressCard({g,compact=false,onPress,flat=false,masked=false,onToggleMask}:{g:GoalNumbers;compact?:boolean;onPress?:()=>void;flat?:boolean;masked?:boolean;onToggleMask?:()=>void}){
 const c=useTheme(),st=goalStats(g),GOOD=PALETTE.greenDeep,GUARD=PALETTE.greenDeep;
 // 0.3.255: olho dos valores (o mesmo de Financas)
 const brl=(v:number)=>masked?'R$ •••••':brlRaw(v);
 // flat: dentro de uma secao dos Relatorios (sem a moldura de cartao, para nao ficar caixa dentro de caixa)
 const body=<View style={flat?{gap:10}:{backgroundColor:c.surface,borderRadius:20,padding:16,gap:10,borderWidth:1,borderColor:c.line}}>
  <View style={{flexDirection:'row',alignItems:'baseline',gap:8}}>
   <View style={{flex:1,flexDirection:'row',alignItems:'center',gap:8}}><Icon name="guardado" size={18} color={c.accent}/><Text numberOfLines={1} style={{flex:1,color:c.text,fontWeight:'600',fontSize:16}}>{g.name||'Sua meta'}</Text></View>
   {st.deadlineYm?<Text style={{color:c.muted,fontSize:11}}>até {monthName(st.deadlineYm)}</Text>:null}
   {onToggleMask?<Pressable testID="goal-values-eye" accessibilityRole="button" accessibilityLabel={masked?'Mostrar valores':'Esconder valores'} hitSlop={10} onPress={onToggleMask} style={{paddingLeft:6}}><Icon name={masked?'eyeOff':'eye'} size={17} color={c.muted}/></Pressable>:null}
  </View>
  <View style={{flexDirection:'row',alignItems:'baseline',gap:6}}>
   <Text style={{color:c.text,fontWeight:'700',fontSize:28}}>{brl(g.saved)}</Text>
   <Text style={{color:c.muted,fontSize:12}}>de {brl(g.target)}</Text>
   <View style={{flex:1}}/>
   <Text style={{color:GOOD,fontWeight:'700',fontSize:13}}>{Math.round(st.pct*100)}%</Text>
  </View>
  <View style={{height:12,borderRadius:6,backgroundColor:c.line,overflow:'hidden',justifyContent:'center'}}>
   <View style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.round(st.pct*100)}%` as `${number}%`,borderRadius:6,backgroundColor:GUARD}}/>
   {[0.25,0.5,0.75].map(m=><View key={m} style={{position:'absolute',left:`${m*100}%` as `${number}%`,top:2,bottom:2,width:2,borderRadius:1,backgroundColor:st.pct>=m?PALETTE.white+'aa':c.muted+'66'}}/>)}
  </View>
  <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{color:c.muted,fontSize:10}}>R$ 0</Text><Text style={{color:c.muted,fontSize:10}}>{brl(g.target)}</Text></View>
  {st.pct<1?<Text style={{color:c.text,fontSize:13,fontWeight:'500'}}>Faltam {brl(st.missing)}{st.next&&st.next<1?' · próximo marco: '+Math.round(st.next*100)+'% (faltam '+brl(st.nextMissing)+')':''}</Text>:null}
  {!compact&&st.pct<1?<Text style={{color:c.muted,fontSize:12,lineHeight:18}}>{g.monthly>0&&st.reach?'No ritmo de '+brl(g.monthly)+' por mês, você chega lá em '+monthName(st.reach)+(st.deadlineYm?(st.diff>0?' — '+st.diff+(st.diff===1?' mês':' meses')+' antes do prazo.':st.diff<0?' — '+(-st.diff)+(st.diff===-1?' mês':' meses')+' depois do prazo. Para chegar a tempo: '+brl(st.needed)+' por mês.':' — bem no prazo.'):'.'):st.deadlineYm?'Para chegar até '+monthName(st.deadlineYm)+': '+brl(st.needed)+' por mês.':'Defina um aporte mensal para ver quando você chega lá.'}</Text>:null}
  <Text style={{color:GOOD,fontSize:12,fontWeight:'500'}}>{st.message}</Text>
 </View>;
 return onPress?<Pressable accessibilityRole="button" accessibilityLabel={'Abrir a meta '+(g.name||'')} onPress={onPress}>{body}</Pressable>:body;
}
