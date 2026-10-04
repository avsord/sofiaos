import React,{useEffect,useState} from 'react';
import {View,Text,AppState,Alert,Linking} from 'react-native';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Button,ErrorBanner,forms} from './UI';
import {Choice} from '../screens/Workspace';
export function GoogleCalendarSettings({api}:{api:SofiaApi}){
 const c=useTheme(),[status,setStatus]=useState<Awaited<ReturnType<SofiaApi['calendarStatus']>>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){try{setStatus(await api.calendarStatus());setError('');}catch(e){setError(errorText(e));}}
 useEffect(()=>{void load();const s=AppState.addEventListener('change',v=>{if(v==='active')void load();});return()=>s.remove();},[api]);
 async function act(task:()=>Promise<unknown>){if(busy)return;setBusy(true);try{await task();await load();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 function connect(){Alert.alert('Conectar Google Agenda','Os compromissos e lembretes da Sofia serão sincronizados com o calendário escolhido. Criações, edições e exclusões serão refletidas nos dois lados. Registros marcados como somente local não serão enviados.',[{text:'Cancelar',style:'cancel'},{text:'Conectar',onPress:()=>void act(async()=>{const result=await api.calendarConnect();const url=new URL(result.url);if(url.protocol!=='https:')throw Error('Endereço de autorização inválido.');await Linking.openURL(url.toString());})}]);}
 return <View style={[forms.card,{backgroundColor:c.surface,borderWidth:1,borderColor:c.line}]}><Text style={{fontSize:18,fontWeight:'600',color:c.text}}>Google Agenda</Text>
 <Text accessibilityLiveRegion="polite" style={{color:c.accent}}>{status?.connected?'Conectado':status?.configured?'Não conectado':status?'Aguardando configuração no servidor':'Verificando conexão…'}</Text>
 <Text style={{fontSize:12,lineHeight:19,color:c.muted}}>Conecte a conta Google uma vez. A Sofia mantém os eventos sincronizados automaticamente, sem copiar códigos ou senhas.</Text>
 {error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}{status?.error?<ErrorBanner text={status.error}/>:null}{status?.warnings?.map(w=><Text key={w} style={{fontSize:12,lineHeight:18,color:c.muted}}>{w}</Text>)}{status?.conflicts?.length?<ErrorBanner text={status.conflicts.length+' evento(s) têm mudanças nos dois lados. Nada foi sobrescrito automaticamente. Revise o evento antes de sincronizar.'}/>:null}
 {!status?.configured&&status?<Text style={{fontSize:12,lineHeight:19,color:c.muted}}>A integração aguarda a atualização segura do servidor e a configuração da autorização Google. Nenhuma conta foi conectada.</Text>:null}
 {status?.connected?<><Text style={{color:c.text,fontSize:13}}>Calendário: {status.calendar_name||'Principal'}</Text>{status.calendars?.length?<Choice label="Calendário sincronizado" value={String((status as any).calendar_id||'primary')} options={status.calendars.filter(k=>['owner','writer'].includes(k.accessRole)).map(k=>({value:k.id,label:k.summary}))} onChange={id=>void act(()=>api.calendarSelect(id))}/>:null}
 <Text style={{color:c.muted,fontSize:11}}>{status.last_sync?'Última sincronização: '+new Date(status.last_sync).toLocaleString('pt-BR'):'Primeira sincronização pendente'}</Text>
 <Button title="Sincronizar agora" secondary loading={busy} onPress={()=>void act(()=>api.calendarSync())}/><Button title="Desconectar" secondary disabled={busy} onPress={()=>Alert.alert('Desconectar Google Agenda?','A sincronização será interrompida. Nenhum evento será apagado.',[{text:'Cancelar',style:'cancel'},{text:'Desconectar',onPress:()=>void act(()=>api.calendarDisconnect())}])}/></>:<Button title="Conectar Google Agenda" loading={busy} disabled={!status?.configured} onPress={connect}/>}</View>;
}
