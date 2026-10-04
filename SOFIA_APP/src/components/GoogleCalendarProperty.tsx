import React,{useEffect,useState} from 'react';
import {AppState,Linking,Switch,Text,View} from 'react-native';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
export function GoogleCalendarProperty({api,value,onChange}:{api:SofiaApi;value:boolean;onChange:(v:boolean)=>void}){
 const c=useTheme(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[waiting,setWaiting]=useState(false);
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state==='active'&&waiting)api.calendarStatus().then(s=>{if(s.connected){onChange(true);setWaiting(false);setError('');}}).catch(e=>setError(errorText(e)));});return()=>sub.remove();},[api,waiting,onChange]);
 async function toggle(next:boolean){if(!next){onChange(false);return;}setBusy(true);setError('');try{const status=await api.calendarStatus();if(status.connected){onChange(true);return;}if(!status.configured)throw Error('A conexão Google ainda precisa ser configurada no servidor.');const ticket=await api.calendarConnect();const url=new URL(ticket.url);if(url.protocol!=='https:')throw Error('Endereço de autorização inválido.');setWaiting(true);await Linking.openURL(url.toString());}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 return <View style={{gap:6}}><View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text,fontSize:15}}>Google Agenda</Text><Switch accessibilityLabel="Sincronizar com Google Agenda" value={value} disabled={busy} onValueChange={v=>void toggle(v)}/></View>{error?<Text style={{color:c.danger,fontSize:12,lineHeight:18}}>{error}</Text>:null}</View>;
}
