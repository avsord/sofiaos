import React,{useEffect,useState} from 'react';
import {View,Text,TextInput} from 'react-native';
import type {Prefs} from '../lib/types';
import {themeTimes,validThemeTime} from '../lib/theme-schedule';
import {useTheme} from '../lib/theme';
import {Button,forms} from './UI';
export function ThemeScheduleSettings({prefs,onSave}:{prefs:Prefs;onSave:(p:Prefs)=>Promise<void>}){
 const c=useTheme(),times=themeTimes(prefs),[lightAt,setLight]=useState(times.lightAt),[darkAt,setDark]=useState(times.darkAt);
 useEffect(()=>{setLight(times.lightAt);setDark(times.darkAt);},[times.lightAt,times.darkAt]);
 const valid=validThemeTime(lightAt)&&validThemeTime(darkAt)&&lightAt!==darkAt;
 return <View style={{gap:12,marginTop:16}}><Text style={{color:c.muted,fontSize:12}}>Horário local do celular · formato 24 horas</Text><View style={{flexDirection:'row',gap:12}}>{[{label:'Claro a partir de',value:lightAt,set:setLight},{label:'Escuro a partir de',value:darkAt,set:setDark}].map(f=><View key={f.label} style={{flex:1,gap:6}}><Text style={{color:c.text,fontSize:12}}>{f.label}</Text><TextInput accessibilityLabel={f.label} value={f.value} onChangeText={f.set} maxLength={5} placeholder="HH:MM" keyboardType="numbers-and-punctuation" style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input}]}/></View>)}</View>{!valid?<Text style={{color:c.danger,fontSize:12}}>Informe dois horários diferentes, como 05:00 e 19:00.</Text>:null}<Button secondary title="Salvar horários" disabled={!valid||(lightAt===times.lightAt&&darkAt===times.darkAt)} onPress={()=>void onSave({...prefs,lightAt,darkAt})}/></View>;
}
