import React,{useEffect,useState} from 'react';
import {View,Text,Modal,ScrollView,Pressable,Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import {useTheme} from '../lib/theme';
import {fluencyMode,FLUENCY_MODE_KEY,type FluencyMode} from '../lib/fluency';
import {perfReport} from '../lib/fluency-metrics';
import {idleWork} from '../lib/idle-work';
import {APP_VERSION} from '../lib/update';
import {readLastError,clearLastError,errorLine,type StoredError} from '../lib/last-error';
export function FluencyPanel({onClose}:{onClose:()=>void}){
 const c=useTheme(),[next,setNext]=useState<FluencyMode>(fluencyMode()),[report,setReport]=useState(()=>({...perfReport(),pending:idleWork.pending()}));
 const [lastError,setLastError]=useState<StoredError|null>(null);
 useEffect(()=>{let live=true;void readLastError().then(v=>{if(live)setLastError(v);});return()=>{live=false;};},[]);
 useEffect(()=>{let live=true;void AsyncStorage.getItem(FLUENCY_MODE_KEY).then(v=>{if(live)setNext(v==='old'?'old':'new');});return()=>{live=false;};},[]);
 async function choose(value:FluencyMode){try{await AsyncStorage.setItem(FLUENCY_MODE_KEY,value);setNext(value);}catch{Alert.alert('Diagnóstico','Não foi possível salvar o modo.');}}
 function refresh(){setReport({...perfReport(),pending:idleWork.pending()});}
 async function copy(){try{await Clipboard.setStringAsync(JSON.stringify({version:APP_VERSION,nextMode:next,lastError,...report},null,2));Alert.alert('Relatório copiado','Contém apenas tempos e contagens de cache, sem mensagens, páginas ou credenciais.');}catch{Alert.alert('Diagnóstico','Falha ao copiar.');}}
 const button=(label:string,onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{padding:14,backgroundColor:c.surface,borderRadius:12}}><Text style={{color:c.text}}>{label}</Text></Pressable>;
 return <Modal visible animationType="none" onRequestClose={onClose}><ScrollView style={{flex:1,backgroundColor:c.bg}} contentContainerStyle={{padding:24,paddingTop:48,gap:14}}>
  <Text style={{fontSize:23,color:c.text,fontWeight:'700'}}>Diagnóstico de fluidez</Text>
  <Text style={{color:c.muted}}>Atual: {fluencyMode()==='new'?'Novo':'Antigo'}. Próxima abertura fria: {next==='new'?'Novo':'Antigo'}. Feche o app por completo para trocar. Antigo conserva a política da 0.3.107, com instrumentação idêntica.</Text>
  {button('Modo Novo',()=>void choose('new'))}{button('Modo Antigo',()=>void choose('old'))}
  {button('Atualizar medidas',refresh)}{button('Copiar relatório',()=>void copy())}{button('Fechar diagnóstico',onClose)}
  <Text selectable testID="last-error" style={{color:c.text,fontSize:12,fontWeight:'600'}}>{lastError?'Último erro guardado ('+new Date(lastError.savedAt).toLocaleString('pt-BR')+'): '+errorLine(lastError):'Nenhum erro guardado.'}</Text>
  {lastError?button('Apagar erro guardado',()=>void clearLastError().then(()=>setLastError(null))):null}
  <Text selectable style={{color:c.text,fontSize:12}}>{JSON.stringify(report,null,2)}</Text>
 </ScrollView></Modal>;
}
