import {useVisibleLoad} from '../lib/visible-load';
import * as WebBrowser from 'expo-web-browser';
import React,{useState} from 'react';
import {View,Text,AppState,Alert,Pressable} from 'react-native';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Button,ErrorBanner,forms} from './UI';
import type {StoreConnection,StoreConnectionsState} from '../lib/store-connections-types';
import {appAlert} from '../lib/app-alert';

const LOGOS:Record<string,{letter:string;bg:string;fg:string}>={mercadolivre:{letter:'M',bg:'#ffe600',fg:'#2d3277'},aliexpress:{letter:'A',bg:'#ff4747',fg:'#fff'}};
const ABOUT:Record<string,string>={
 mercadolivre:'Entre com a sua conta do Mercado Livre uma vez. A Sofia passa a ler o preco dos seus produtos pelo caminho oficial do Mercado Livre, sem abrir pagina nem pedir verificacao. Nenhuma compra ou dado da conta e alterado.',
 aliexpress:'O AliExpress e lido pelo caminho oficial com a chave do Sofia. Voce nao precisa entrar com a sua conta.',
};

/** Lojas do Price Tracker: conectar e uma vez, igual a Conta Google. */
export function StoreConnections({api}:{api:SofiaApi}){
 const c=useTheme(),[state,setState]=useState<StoreConnectionsState|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 async function load(){try{setState(await api.storeConnections());setError('');}catch(e){setError(errorText(e));}}
 useVisibleLoad(()=>{void load();const s=AppState.addEventListener('change',v=>{if(v==='active')void load();});return()=>s.remove();},[api]);
 async function act(provider:string,task:()=>Promise<unknown>){if(busy)return;setBusy(provider);try{await task();await load();}catch(e){setError(errorText(e));}finally{setBusy('');}}
 function connect(store:StoreConnection){
  appAlert('Conectar '+store.name,ABOUT[store.provider]||'Conectar a sua conta uma vez.',[{text:'Agora nao',style:'cancel'},{text:'Conectar',onPress:()=>void act(store.provider,async()=>{
   const {url}=await api.storeConnect(store.provider);
   // Janela da loja dentro do app: entra na conta, autoriza e volta sozinho para a Sofia.
   const session=await WebBrowser.openAuthSessionAsync(url,'sofiaapp://stores');
   if(session.type==='success'){const back=new URL(session.url.replace('sofiaapp://','https://x/'));if(back.searchParams.get('ok')!=='1')throw Error(back.searchParams.get('message')||store.name+' nao concluiu a conexao.');}
  })}]);
 }
 function disconnect(store:StoreConnection){
  appAlert('Desconectar '+store.name,'As leituras voltam a depender da pagina da loja, que pode pedir verificacao.',[{text:'Cancelar',style:'cancel'},{text:'Desconectar',style:'destructive',onPress:()=>void act(store.provider,()=>api.storeDisconnect(store.provider))}]);
 }
 return <View style={[forms.card,{backgroundColor:c.surface,borderWidth:1,borderColor:c.line,gap:12}]}>
  <Text style={{fontSize:18,fontWeight:'500',color:c.text}}>Lojas do Price Tracker</Text>
  <Text style={{fontSize:12,lineHeight:19,color:c.muted}}>Conecte uma vez e a leitura de precos passa a usar o caminho oficial de cada loja: sem abrir paginas, sem "nao sou um robo".</Text>
  {error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}
  {!state?<Text style={{color:c.muted}}>Verificando conexoes…</Text>:state.stores.map(store=>{
   const logo=LOGOS[store.provider]||{letter:store.name[0],bg:c.line,fg:c.text};
   const status=!store.configured?(store.mode==='login'?'Aguardando configuracao no servidor':'Sem chave no servidor'):store.connected?'Conectado'+(store.account?' · '+store.account:''):'Nao conectado';
   const good=store.configured&&store.connected;
   return <View key={store.provider} accessibilityLabel={store.name+': '+status} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8,borderTopWidth:1,borderColor:c.line}}>
    <View style={{width:40,height:40,borderRadius:12,backgroundColor:logo.bg,alignItems:'center',justifyContent:'center'}}><Text style={{color:logo.fg,fontWeight:'700',fontSize:18}}>{logo.letter}</Text></View>
    <View style={{flex:1}}>
     <Text style={{color:c.text,fontWeight:'500',fontSize:16}}>{store.name}</Text>
     <Text style={{color:good?c.good:c.muted,fontSize:12}}>{status}</Text>
     {store.error?<Text style={{color:'#ff6b7a',fontSize:12}}>{store.error}</Text>:null}
     {!store.configured&&store.mode==='login'?<Text style={{color:c.muted,fontSize:11,lineHeight:16}}>Falta o aplicativo da loja no servidor (ML_APP_ID / ML_APP_SECRET). Endereco de retorno: {store.redirect_uri||'—'}</Text>:null}
    </View>
    {store.mode==='login'&&store.configured?(store.connected
      ?<Pressable accessibilityRole="button" disabled={!!busy} onPress={()=>disconnect(store)} style={{paddingHorizontal:12,paddingVertical:8}}><Text style={{color:c.muted,fontWeight:'500'}}>Desconectar</Text></Pressable>
      :<View style={{minWidth:120}}><Button title="Conectar" loading={busy===store.provider} onPress={()=>connect(store)}/></View>):null}
   </View>;
  })}
 </View>;
}
