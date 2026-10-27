import React,{useState} from 'react';
import {tap} from '../lib/desktop';
import {Pressable,Text,TextInput,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {REMINDER_PRESETS,REMINDER_UNITS,reminderFields,reminderLabel,reminderOffsets} from '../lib/agenda-reminders';

/** 0.3.201: notificacoes do compromisso como no Google Agenda - varias, com opcoes prontas e personalizado. */
export function RemindersField({data,onChange}:{data:Record<string,unknown>;onChange:(patch:{reminders_json:string;remind_minutes:number|''})=>void}){
 const c=useTheme(),list=reminderOffsets(data),[adding,setAdding]=useState(false),[custom,setCustom]=useState(false),[amount,setAmount]=useState('30'),[unit,setUnit]=useState<number>(1);
 const set=(next:number[])=>onChange(reminderFields(next));
 const add=(m:number)=>{set([...list,m]);setAdding(false);setCustom(false);};
 const row={flexDirection:'row' as const,alignItems:'center' as const,gap:12,paddingVertical:12};
 return <View style={{gap:4,marginBottom:12}}>
  <Text style={{color:c.muted,fontSize:12}}>Notificações</Text>
  {list.map(m=><View key={m} style={[row,{borderBottomWidth:1,borderColor:c.line}]}>
   <Text style={{fontSize:16}}>🔔</Text><Text style={{flex:1,color:c.text,fontSize:15}}>{reminderLabel(m)}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={'Remover notificação '+reminderLabel(m)} hitSlop={10} onPress={()=>set(list.filter(x=>x!==m))}><Text style={{color:c.muted,fontSize:18}}>✕</Text></Pressable>
  </View>)}
  {list.length>=5?<Text style={{color:c.muted,fontSize:12,paddingVertical:8}}>Até 5 notificações por compromisso.</Text>
   :<Pressable accessibilityRole="button" onPress={()=>{setAdding(a=>!a);setCustom(false);}} style={row}><Text style={{fontSize:16,opacity:0}}>🔔</Text><Text style={{color:c.accent,fontSize:15,fontWeight:'600'}}>Adicionar notificação</Text></Pressable>}
  {adding?<View style={{backgroundColor:c.input,borderRadius:14,paddingHorizontal:14,paddingVertical:4}}>
   {[0,...REMINDER_PRESETS].filter(m=>!list.includes(m)).map(m=><Pressable key={m} accessibilityRole="button" onPress={()=>add(m)} style={row}>
    <View style={{width:20,height:20,borderRadius:10,borderWidth:2,borderColor:c.muted}}/><Text style={{color:c.text,fontSize:15}}>{reminderLabel(m)}</Text></Pressable>)}
   <Pressable accessibilityRole="button" onPress={()=>setCustom(v=>!v)} style={row}><View style={{width:20,height:20,borderRadius:10,borderWidth:2,borderColor:custom?c.accent:c.muted,backgroundColor:custom?c.accent:'transparent'}}/><Text style={{color:c.text,fontSize:15}}>Personalizado…</Text></Pressable>
   {custom?<View style={{gap:10,paddingBottom:12}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
     <TextInput accessibilityLabel="Quanto antes" value={amount} onChangeText={t=>setAmount(t.replace(/\D/g,'').slice(0,3))} keyboardType="number-pad" style={{width:70,color:c.text,backgroundColor:c.surface,borderRadius:10,paddingHorizontal:12,paddingVertical:8,fontSize:16,textAlign:'center'}}/>
     <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,flex:1}}>{REMINDER_UNITS.map(u=><Pressable key={u.value} onPress={()=>setUnit(u.value)} style={{paddingHorizontal:10,paddingVertical:7,borderRadius:99,backgroundColor:unit===u.value?c.accent:c.surface}}><Text style={{color:unit===u.value?c.onAccent:c.text,fontSize:12,fontWeight:'600'}}>{u.label}</Text></Pressable>)}</View>
    </View>
    <Pressable accessibilityRole="button" disabled={!(Number(amount)>0)} onPress={()=>add(Number(amount)*unit)} style={{alignSelf:'flex-start',paddingHorizontal:16,paddingVertical:10,borderRadius:12,backgroundColor:Number(amount)>0?c.accent:c.line}}><Text style={{color:c.onAccent,fontWeight:'700'}}>Adicionar {Number(amount)>0?reminderLabel(Number(amount)*unit).toLowerCase():''}</Text></Pressable>
   </View>:null}
  </View>:null}
 </View>;
}

/** 0.3.201: lembrete com alarme - notificacao normal, som de alarme uma vez, ou alarme que toca ate desligar. */
export const ALARM_MODES=[
 {value:'none',label:'Notificação normal',hint:'Aviso comum, com o som de notificação.'},
 {value:'once',label:'Som de alarme',hint:'Toca o som de alarme uma vez, mesmo no "Não perturbe".'},
 {value:'ring',label:'Alarme até desligar',hint:tap('Toca de novo a cada minuto, por até 10 minutos, até você tocar em Desligar ou Adiar.')},
] as const;
export function AlarmModeField({value,onChange}:{value:string;onChange:(v:string)=>void}){
 const c=useTheme(),current=ALARM_MODES.find(m=>m.value===value)||ALARM_MODES[0];
 return <View style={{gap:8,marginBottom:12}}>
  <Text style={{color:c.muted,fontSize:12}}>Tipo de aviso</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{ALARM_MODES.map(m=><Pressable key={m.value} accessibilityRole="radio" accessibilityState={{checked:current.value===m.value}} onPress={()=>onChange(m.value)} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:99,backgroundColor:current.value===m.value?c.accent:c.input}}>
   <Text style={{color:current.value===m.value?c.onAccent:c.text,fontWeight:'600',fontSize:13}}>{m.value==='none'?'🔔 ':'⏰ '}{m.label}</Text></Pressable>)}</View>
  <Text style={{color:c.muted,fontSize:11,lineHeight:16}}>{current.hint}</Text>
 </View>;
}
