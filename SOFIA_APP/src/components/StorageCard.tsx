import React,{useState} from 'react';
import {View,Text,Pressable,AppState} from 'react-native';
import {SofiaApi,DriveStorage} from '../lib/api';
import {useTheme} from '../lib/theme';
import {useVisibleLoad} from '../lib/visible-load';
import {errorText} from '../lib/chat-model';
import {fileSize,storageParts,StoragePart} from '../lib/drive-files';
import {forms,Button} from './UI';
import {ShimmerGroup,ShimmerBlock} from './Loading';
import {loadSofiaFiles,DeferredScreen} from '../lib/screen-loader';

// 0.3.245: espaço da Conta Google como o Drive mostra (usado, livre e total), com o que é da Sofia em destaque.
// Cores fixas para as fatias que não são da Sofia: legíveis no tema claro e no escuro.
const OTHER:Record<Exclude<StoragePart['key'],'sofia'>,string>={drive:'#4F8CFF',mail:'#F2A93B',trash:'#9B95AA'};
let last:DriveStorage|null=null; // a segunda abertura do Perfil já mostra o último número, sem esqueleto

export function StorageCard({api}:{api:SofiaApi}){
 const c=useTheme(),[data,setData]=useState<DriveStorage|null>(last),[state,setState]=useState<'loading'|'ready'|'off'|'error'>(last?'ready':'loading'),[error,setError]=useState(''),[filesOpen,setFilesOpen]=useState(false);
 async function load(){
  try{const r=await api.driveStorage();last=r;setData(r);setState('ready');setError('');}
  catch(e){const status=(e as {status?:number}).status;if(status===409||status===404){last=null;setData(null);setState('off');}else{setError(errorText(e));setState(s=>s==='ready'?'ready':'error');}}
 }
 useVisibleLoad(()=>{void load();const s=AppState.addEventListener('change',v=>{if(v==='active')void load();});return()=>s.remove();},[api]);
 const color=(k:StoragePart['key'])=>k==='sofia'?c.accent:OTHER[k];
 const view=data?.quota?storageParts(data.quota,data.sofia_bytes):null;
 return <View style={[forms.card,{backgroundColor:c.surface,borderWidth:1,borderColor:c.line}]}>
  {filesOpen?<DeferredScreen load={loadSofiaFiles} screenProps={{api,visible:true,onClose:()=>{setFilesOpen(false);void load();}}}/>:null}
  <Text style={{fontSize:18,fontWeight:'500',color:c.text}}>Armazenamento</Text>
  {state==='loading'?<ShimmerGroup><View style={{gap:12}}><ShimmerBlock width="62%" height={20}/><ShimmerBlock width="100%" height={10} radius={5}/><ShimmerBlock width="45%" height={12}/><ShimmerBlock width="55%" height={12}/></View></ShimmerGroup>:null}
  {state==='off'?<Text style={{color:c.muted,fontSize:13,lineHeight:19}}>Conecte a Conta Google (logo abaixo) para ver o espaço do seu Drive e o que a Sofia está usando.</Text>:null}
  {state==='error'?<><Text style={{color:c.danger,fontSize:13,lineHeight:19}}>Não consegui ler o espaço do Drive: {error}</Text><Button title="Tentar de novo" secondary onPress={()=>{setState('loading');void load();}}/></>:null}
  {state==='ready'&&data&&!view?<Text style={{color:c.muted,fontSize:13,lineHeight:19}}>A Sofia está usando {fileSize(data.sofia_bytes)} no seu Drive. O Google não informou o espaço total desta conta agora.</Text>:null}
  {state==='ready'&&data&&view?<>
   <View style={{gap:2}}>
    <Text accessibilityRole="header" style={{color:c.text,fontSize:24,fontWeight:'600',letterSpacing:-0.3}}>{fileSize(view.used)}{view.total?<Text style={{color:c.muted,fontSize:16,fontWeight:'500'}}> de {fileSize(view.total)} usados</Text>:<Text style={{color:c.muted,fontSize:16,fontWeight:'500'}}> usados · plano sem limite</Text>}</Text>
    {view.free!==null?<Text style={{color:c.muted,fontSize:13}}>{fileSize(view.free)} livres · {Math.round(view.percent)}% ocupado</Text>:null}
   </View>
   <View accessibilityRole="progressbar" accessibilityLabel={view.total?Math.round(view.percent)+'% do espaço ocupado':'Espaço usado'} style={{flexDirection:'row',height:10,borderRadius:5,backgroundColor:c.line,overflow:'hidden'}}>
    {view.parts.filter(p=>p.bytes>0).map(p=><View key={p.key} style={{width:`${Math.max(0.6,(p.bytes/(view.total||view.used||1))*100)}%`,backgroundColor:color(p.key)}}/>)}
   </View>
   <View style={{gap:8}}>
    {view.parts.map(p=><View key={p.key} style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:10,height:10,borderRadius:5,backgroundColor:color(p.key)}}/><Text style={{flex:1,color:c.text,fontSize:13}}>{p.label}</Text><Text style={{color:c.muted,fontSize:13}}>{fileSize(p.bytes)}</Text></View>)}
    {view.free!==null?<View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:10,height:10,borderRadius:5,borderWidth:1,borderColor:c.muted}}/><Text style={{flex:1,color:c.text,fontSize:13}}>Livre</Text><Text style={{color:c.muted,fontSize:13}}>{fileSize(view.free)}</Text></View>:null}
   </View>
   {data.categories.some(k=>k.bytes>0)?<Text style={{color:c.muted,fontSize:12,lineHeight:18}}>Na Sofia: {data.categories.filter(k=>k.bytes>0).sort((a,b)=>b.bytes-a.bytes).map(k=>k.label+' '+fileSize(k.bytes)).join(' · ')}</Text>:null}
   {error?<Text style={{color:c.muted,fontSize:11}}>Mostrando a última leitura. {error}</Text>:null}
   <Pressable accessibilityRole="button" onPress={()=>setFilesOpen(true)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.accent,fontWeight:'600',fontSize:14}}>Ver arquivos da Sofia</Text></Pressable>
  </>:null}
 </View>;
}
