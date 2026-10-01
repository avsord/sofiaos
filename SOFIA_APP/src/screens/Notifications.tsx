import React,{useEffect,useState} from 'react';
import {ScrollView,View,Text,Pressable,RefreshControl} from 'react-native';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Notice} from '../lib/types';
import {ScreenTitle,Empty,ErrorBanner,IconButton} from '../components/UI';
export function Notifications({api,onBack}:{api:SofiaApi;onBack?:()=>void}){
 const c=useTheme(),[items,setItems]=useState<Notice[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 async function load(){setLoading(true);try{setItems((await api.notifications()).items);setError('');}catch(e){setError(errorText(e));}finally{setLoading(false);}}
 useEffect(()=>{void load();},[api]);
 async function read(n:Notice){try{await api.markRead(n.id);await load();}catch(e){setError(errorText(e));}}
 return <ScrollView contentContainerStyle={{paddingBottom:24}} refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>void load()}/>}><ScreenTitle title="Notificações" right={onBack?<IconButton name="back" label="Voltar" onPress={onBack}/>:undefined}/>{error?<ErrorBanner text={error}/>:null}<View style={{paddingHorizontal:22,gap:12}}>{items.map(n=><Pressable key={n.id} onPress={()=>void read(n)} style={{padding:19,borderRadius:20,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,gap:8}}><Text style={{color:c.text,fontSize:16,fontWeight:'600'}}>{n.title}</Text><Text style={{color:c.muted,fontSize:14,lineHeight:21}}>{n.body}</Text><Text style={{color:c.accent,fontSize:11}}>Toque para marcar como lida</Text></Pressable>)}</View>{!items.length&&!loading?<Empty icon="bell" title="Sem notificações" body="Os avisos da sua Sofia aparecerão aqui."/>:null}<Text style={{color:c.muted,fontSize:11,lineHeight:17,padding:24,textAlign:'center'}}>Esta versão atualiza os avisos dentro do app. Notificações com o app fechado ainda não estão ativadas.</Text></ScrollView>;
}
