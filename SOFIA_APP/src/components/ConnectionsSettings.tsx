import React,{useState} from 'react';
import {View,Text,Pressable,Linking} from 'react-native';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Button,ErrorBanner,forms} from './UI';
import {Icon} from './Icon';
export function ConnectionsSettings({api}:{api:SofiaApi}){
 const c=useTheme(),[open,setOpen]=useState(false),[items,setItems]=useState<Awaited<ReturnType<SofiaApi['integrations']>>['items']>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 async function load(){try{setItems((await api.integrations()).items);setLoaded(true);setError('');}catch(e){setError(errorText(e));}}
 return <View style={[forms.card,{backgroundColor:c.surface,borderWidth:1,borderColor:c.line}]}><Pressable accessibilityRole="button" accessibilityLabel="Conexões" accessibilityState={{expanded:open}} onPress={()=>{setOpen(v=>!v);if(!open)void load();}} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:48}}><Icon name="grid" color={c.accent}/><View style={{flex:1,gap:4}}><Text style={{color:c.text,fontWeight:'600',fontSize:18}}>Conexões</Text><Text style={{color:c.muted,fontSize:12}}>Serviços e WhatsApp</Text></View><View style={{transform:[{rotate:open?'90deg':'0deg'}]}}><Icon name="chevron" color={c.muted}/></View></Pressable>{open?<>{error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}{!loaded&&!error?<Text style={{color:c.muted}}>Carregando conexões…</Text>:null}{loaded&&!items.length?<Text style={{color:c.muted}}>Nenhuma conexão disponível.</Text>:null}{items.map(i=><View key={i.key} style={{gap:10,paddingTop:14,borderTopWidth:1,borderColor:c.line}}><Text style={{color:c.text,fontSize:16,fontWeight:'600'}}>{i.name}</Text><Text style={{color:c.accent,fontSize:12}}>{i.status}</Text><Text style={{color:c.muted,fontSize:13,lineHeight:20}}>{i.description}</Text>{i.connect_url?<Button title="Abrir conexão oficial" secondary onPress={()=>void Linking.openURL(i.connect_url!).catch(e=>setError(errorText(e)))}/>:null}</View>)}</>:null}</View>;
}
