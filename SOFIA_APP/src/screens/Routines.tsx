import React,{useEffect,useState} from 'react';
import {Alert,Pressable,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {useWorkspaceRecords} from '../lib/workspace-records';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Choice} from '../components/Choice';
import {DateTimeField} from '../components/DateTimeField';
import {Sheet} from '../components/Sheet';
import {Button,Empty,ErrorBanner,IconButton,ScreenTitle,forms} from '../components/UI';
import {Icon} from '../components/Icon';

const WEEKDAYS=[{value:'0',label:'Domingo'},{value:'1',label:'Segunda'},{value:'2',label:'Terça'},{value:'3',label:'Quarta'},{value:'4',label:'Quinta'},{value:'5',label:'Sexta'},{value:'6',label:'Sábado'}];
const today=()=>new Date().toISOString().slice(0,10);
function schedule(item:Partial<Entity>){
 const d=item.data||{},time=String(d.time||'--:--');
 if(d.frequency==='weekly')return (WEEKDAYS.find(x=>x.value===String(d.weekday))?.label||'Semanal')+' · '+time;
 if(d.frequency==='monthly')return 'Todo dia '+String(d.monthday||1)+' · '+time;
 return 'Todos os dias · '+time;
}
function field(c:any,label:string,value:string,onChange:(v:string)=>void,multiline=false){
 return <View style={{gap:6}}><Text style={{color:c.muted,fontSize:12}}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline} placeholderTextColor={c.muted} style={[forms.input,{color:c.text,backgroundColor:c.input,borderColor:c.line,minHeight:multiline?88:48,textAlignVertical:multiline?'top':'center'}]}/></View>;
}

export function Routines({api,active,onBack}:{api:SofiaApi;active:boolean;onBack:()=>void}){
 const c=useTheme(),records=useWorkspaceRecords(api,'routine','',true),[editing,setEditing]=useState<Partial<Entity>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(active)void records.load();else setEditing(null);},[active,api]);
 const items=records.items.filter(item=>item.state!=='archived').sort((a,b)=>(a.state==='active'?0:1)-(b.state==='active'?0:1)||String(a.data?.time||'').localeCompare(String(b.data?.time||'')));
 function open(item:Partial<Entity>={}){const now=new Date();setError('');setEditing(item.id?item:{kind:'routine',title:'',content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data:{frequency:'daily',time:'08:00',weekday:now.getDay(),monthday:now.getDate(),starts_on:today(),ends_on:'',delivery:'task',instruction:''}});}
 function patchData(patch:Record<string,any>){setEditing(old=>old?{...old,data:{...(old.data||{}),...patch}}:old);}
 async function save(){
  if(!editing?.title?.trim()||busy)return;setBusy(true);setError('');
  try{
   const d={...(editing.data||{})},frequency=String(d.frequency||'daily');d.frequency=frequency;d.delivery='task';d.time=String(d.time||'08:00');d.starts_on=String(d.starts_on||today());d.ends_on=String(d.ends_on||'');d.instruction=String(d.instruction||'');d.weekday=Number(d.weekday??new Date().getDay());d.monthday=Number(d.monthday??new Date().getDate());
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))throw Error('Escolha um horário válido.');
   if(frequency==='weekly'&&(d.weekday<0||d.weekday>6))throw Error('Escolha o dia da semana.');
   if(frequency==='monthly'&&(d.monthday<1||d.monthday>31))throw Error('Escolha um dia do mês entre 1 e 31.');
   if(d.ends_on&&d.ends_on<d.starts_on)throw Error('O término não pode vir antes do início.');
   const saved=await api.saveEntity({...editing,kind:'routine',title:editing.title.trim(),content:String(editing.content||''),area:editing.area||'Pessoal',privacy:'private',state:editing.state==='paused'?'paused':'active',tags:editing.tags||[],data:d});
   records.merge(saved);setEditing(null);
  }catch(e){setError(errorText(e));}finally{setBusy(false);}
 }
 async function toggle(item:Entity){if(busy)return;setBusy(true);setError('');try{records.merge(await api.saveEntity({...item,state:item.state==='active'?'paused':'active',revision:item.revision}));}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 function archive(item:Entity){Alert.alert('Arquivar rotina?',`“${item.title}” deixa de gerar novas ocorrências, mas continua salva no histórico do sistema.`,[{text:'Cancelar'},{text:'Arquivar',style:'destructive',onPress:()=>{setBusy(true);api.saveEntity({...item,state:'archived',revision:item.revision}).then(saved=>{records.merge(saved);setEditing(null);void records.load();}).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}]);}
 return <View style={{flex:1}}>
  <ScreenTitle title="Rotinas" eyebrow="HÁBITOS · CUIDADOS" right={<View style={{flexDirection:'row'}}><IconButton name="back" label="Voltar aos apps" onPress={onBack}/><IconButton name="plus" label="Nova rotina" onPress={()=>open()}/></View>}/>
  {error||records.error?<ErrorBanner text={error||records.error} onRetry={()=>void records.load()}/>:null}
  <ScrollView contentContainerStyle={{padding:22,paddingTop:4,gap:12}}>
   {items.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Editar rotina '+item.title} onPress={()=>open(item)} style={({pressed})=>({minHeight:82,borderRadius:34,paddingHorizontal:16,paddingVertical:13,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:item.state==='active'?c.accentSoft:c.surface,borderWidth:1,borderColor:item.state==='active'?c.accent:c.line,opacity:pressed?0.82:1})}>
    <View style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:c.surface}}><Icon name="refresh" color={item.state==='active'?c.accent:c.muted}/></View>
    <View style={{flex:1,minWidth:0,gap:4}}><Text numberOfLines={1} style={{fontSize:15,fontWeight:'700',color:c.text}}>{item.title}</Text><Text style={{fontSize:11,color:c.muted}}>{schedule(item)}</Text>{item.data?.instruction?<Text numberOfLines={1} style={{fontSize:10,color:c.muted}}>{String(item.data.instruction)}</Text>:null}</View>
    <Pressable accessibilityRole="switch" accessibilityState={{checked:item.state==='active'}} accessibilityLabel={(item.state==='active'?'Pausar ':'Ativar ')+item.title} onPress={e=>{e.stopPropagation();void toggle(item);}} style={{padding:8}}><View style={{width:40,height:24,borderRadius:13,padding:3,backgroundColor:item.state==='active'?c.accent:c.line,alignItems:item.state==='active'?'flex-end':'flex-start'}}><View style={{width:18,height:18,borderRadius:9,backgroundColor:c.surface}}/></View></Pressable>
   </Pressable>)}
   {!records.loaded&&!records.error?<Text style={{color:c.muted,padding:18}}>Carregando rotinas…</Text>:null}
   {records.loaded&&!items.length?<Empty icon="refresh" title="Sua primeira rotina" body="Ex.: passar minoxidil, clarear os dentes, skincare ou outro cuidado que se repete."/>:null}
   <Text style={{color:c.muted,fontSize:11,lineHeight:18,paddingHorizontal:4}}>Cada ocorrência ativa vira uma tarefa no horário definido. A configuração da rotina permanece separada para você pausar ou editar sem recriar tudo.</Text>
  </ScrollView>
  <Sheet visible={!!editing} onClose={()=>{if(!busy)setEditing(null);}} label="Fechar rotina">
   <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text,fontSize:22,fontWeight:'700'}}>{editing?.id?'Editar rotina':'Nova rotina'}</Text><IconButton name="close" label="Fechar rotina" disabled={busy} onPress={()=>setEditing(null)}/></View>
   <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:16,paddingBottom:18}}>
    {error?<ErrorBanner text={error}/>:null}
    {field(c,'Nome',editing?.title||'',title=>setEditing(old=>old?{...old,title}:old))}
    <Choice label="Frequência" value={String(editing?.data?.frequency||'daily')} onChange={frequency=>patchData({frequency})} options={[{value:'daily',label:'Todos os dias'},{value:'weekly',label:'Semanal'},{value:'monthly',label:'Mensal'}]}/>
    {editing?.data?.frequency==='weekly'?<Choice label="Dia da semana" value={String(editing.data?.weekday??new Date().getDay())} onChange={weekday=>patchData({weekday:Number(weekday)})} options={WEEKDAYS}/>:null}
    {editing?.data?.frequency==='monthly'?<Choice label="Dia do mês" value={String(editing.data?.monthday||1)} onChange={monthday=>patchData({monthday:Number(monthday)})} options={Array.from({length:31},(_,i)=>({value:String(i+1),label:'Dia '+(i+1)}))}/>:null}
    <DateTimeField timeOnly allowClear={false} label="Horário" value={String(editing?.data?.time||'08:00')} onChange={time=>patchData({time})}/>
    <DateTimeField dateOnly allowClear={false} label="Primeiro dia" value={String(editing?.data?.starts_on||today())} onChange={starts_on=>patchData({starts_on})}/>
    <DateTimeField dateOnly label="Último dia (opcional)" value={String(editing?.data?.ends_on||'')} onChange={ends_on=>patchData({ends_on})}/>
    {field(c,'Lembrete / instrução',String(editing?.data?.instruction||''),instruction=>patchData({instruction}),true)}
    <View style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'600'}}>Rotina ativa</Text><Text style={{color:c.muted,fontSize:11,marginTop:3}}>Pausar mantém a configuração sem gerar novas ocorrências.</Text></View><Switch accessibilityLabel="Rotina ativa" value={editing?.state!=='paused'} onValueChange={enabled=>setEditing(old=>old?{...old,state:enabled?'active':'paused'}:old)}/></View>
    <Button title="Salvar rotina" loading={busy} disabled={!editing?.title?.trim()} onPress={()=>void save()}/>
    {editing?.id?<Button title="Arquivar rotina" secondary disabled={busy} onPress={()=>archive(editing as Entity)}/>:null}
   </ScrollView>
  </Sheet>
 </View>;
}
