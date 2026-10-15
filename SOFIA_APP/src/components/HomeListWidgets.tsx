import React,{useEffect} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import type {SofiaApi} from '../lib/api';
import {useWorkspaceRecords} from '../lib/workspace-records';
import {Empty,ErrorBanner} from './UI';
import {Icon} from './Icon';
import {remindLabel,splitReminders} from '../screens/Reminders';
import {CARRIER_LABEL,splitPackages,whenLabel} from '../screens/Packages';

// 0.3.144: widgets do Inicio para Lembretes e Encomendas, no mesmo visual do widget de Capsulas.
// Carregam so quando o Inicio esta visivel e o widget foi adicionado (nao pesam na abertura).
function Header({title,count,icon,label,onOpen}:{title:string;count:number;icon:any;label:string;onOpen:()=>void}){
 const c=useTheme();
 return <View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={{flex:1,color:c.text,fontSize:20,fontWeight:'600'}}>{title}</Text><Text accessibilityLabel={'Total de '+title.toLowerCase()} style={{color:c.muted}}>{count}</Text><Pressable accessibilityLabel={label} onPress={onOpen} style={{padding:8}}><Icon name={icon} color={c.accent}/></Pressable></View>;
}

export function RemindersWidget({api,active,onOpen}:{api:SofiaApi;active:boolean;onOpen:()=>void}){
 const c=useTheme(),records=useWorkspaceRecords(api,'reminder','',true);
 useEffect(()=>{if(active)void records.load();},[active,api]);
 const g=splitReminders(records.items),list=[...g.late,...g.upcoming].slice(0,4),lateIds=new Set(g.late.map(i=>i.id));
 return <View style={{gap:16}}>
  <Header title="Lembretes" count={g.late.length+g.upcoming.length} icon="bell" label="Abrir app Lembretes" onOpen={onOpen}/>
  {records.error?<ErrorBanner text={records.error} onRetry={()=>void records.load()}/>:null}
  {!records.loaded&&!records.error?<Text style={{color:c.muted}}>Carregando lembretes…</Text>:list.length?<View style={{backgroundColor:c.surface,borderRadius:18,paddingHorizontal:14,borderWidth:1,borderColor:c.line}}>
   {list.map((item,i)=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Lembrete '+item.title} onPress={onOpen} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:13,borderBottomWidth:i<list.length-1?1:0,borderColor:c.line}}>
    <Icon name="bell" size={18} color={lateIds.has(item.id)?c.danger:c.accent}/>
    <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={{color:c.text,fontSize:15}}>{item.title}</Text><Text style={{color:lateIds.has(item.id)?c.danger:c.muted,fontSize:12}}>{remindLabel(item.data?.remind_at)}</Text></View>
   </Pressable>)}
  </View>:<Empty icon="bell" title="Nenhum lembrete pendente" body="Os próximos lembretes aparecem aqui."/>}
 </View>;
}

export function PackagesWidget({api,active,onOpen}:{api:SofiaApi;active:boolean;onOpen:()=>void}){
 const c=useTheme(),records=useWorkspaceRecords(api,'package','',true);
 useEffect(()=>{if(active)void records.load();},[active,api]);
 const g=splitPackages(records.items.filter(i=>i.state!=='archived')),list=g.active.slice(0,4);
 return <View style={{gap:16}}>
  <Header title="Encomendas" count={g.active.length} icon="box" label="Abrir app Encomendas" onOpen={onOpen}/>
  {records.error?<ErrorBanner text={records.error} onRetry={()=>void records.load()}/>:null}
  {!records.loaded&&!records.error?<Text style={{color:c.muted}}>Carregando encomendas…</Text>:list.length?<View style={{backgroundColor:c.surface,borderRadius:18,paddingHorizontal:14,borderWidth:1,borderColor:c.line}}>
   {list.map((item,i)=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Encomenda '+item.title} onPress={onOpen} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:13,borderBottomWidth:i<list.length-1?1:0,borderColor:c.line}}>
    <Text style={{fontSize:18}}>📦</Text>
    <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={{color:c.text,fontSize:15}}>{item.title}</Text><Text numberOfLines={1} style={{color:c.muted,fontSize:12}}>{String(item.data?.status||'Aguardando a primeira consulta')}</Text><Text style={{color:c.muted,fontSize:10}}>{CARRIER_LABEL[String(item.data?.carrier)]||'Transportadora'}{item.data?.last_event_at?' · '+whenLabel(String(item.data.last_event_at)):''}</Text></View>
   </Pressable>)}
  </View>:<Empty icon="list" title={g.delivered.length?'Tudo entregue':'Nenhuma encomenda a caminho'} body="As encomendas a caminho aparecem aqui."/>}
 </View>;
}
