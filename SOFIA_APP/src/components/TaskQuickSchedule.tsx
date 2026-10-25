import React,{useState} from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import type {SofiaApi} from '../lib/api';
import type {Task} from '../lib/types';
import {useTheme} from '../lib/theme';
import {Sheet} from './Sheet';
import {DateTimeField} from './DateTimeField';
import {Button} from './UI';
import {TASK_PRIORITIES,taskPriority} from '../lib/task-filters';
import {errorText} from '../lib/chat-model';
import {appAlert} from '../lib/app-alert';
import {requestAgendaPermission} from '../lib/agenda-notifications';

const pad=(n:number)=>String(n).padStart(2,'0');
const dayKey=(d:Date)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const REMINDERS=[{value:-1,label:'Sem lembrete'},{value:0,label:'No horário'},{value:10,label:'10 min antes'},{value:60,label:'1 hora antes'},{value:1440,label:'1 dia antes'}];

/** 0.3.201: tocar numa tarefa e programar em segundos - dia, hora, lembrete e importancia. Com data, ela
 * aparece na Agenda e o lembrete avisa no celular. */
export function TaskQuickSchedule({api,task,onClose,onSaved,onDetails,detailsLabel,onRemoved}:{api:SofiaApi;task:Task;onClose:()=>void;onSaved:(t:Task)=>void;onDetails?:()=>void;detailsLabel?:string;onRemoved?:(id:string)=>void}){
 const c=useTheme();
 const due=task.due_at?new Date(task.due_at):null;
 const [date,setDate]=useState(due?dayKey(due):''),[time,setTime]=useState(due&&!(due.getHours()===9&&due.getMinutes()===0&&!task.notifications?.length)?pad(due.getHours())+':'+pad(due.getMinutes()):'');
 const [reminder,setReminder]=useState<number>(task.notifications?.length?Number(task.notifications[0]):-1),[priority,setPriority]=useState<string>(taskPriority(task).value),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const today=new Date(),tomorrow=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
 const chip=(on:boolean)=>({paddingHorizontal:14,paddingVertical:9,borderRadius:99,backgroundColor:on?c.accent:c.input});
 const chipText=(on:boolean)=>({color:on?c.onAccent:c.text,fontWeight:'600' as const,fontSize:13});
 async function save(clear=false){
  if(saving)return;setSaving(true);setError('');
  try{
   const at=clear||!date?'':new Date(date+'T'+(time||'09:00')+':00').toISOString();
   const endAt=task.end_at&&at&&Date.parse(task.end_at)<=Date.parse(at)?'':(task.end_at||'');
   const r=await api.saveTask({...task,due_at:at,start_at:at,end_at:at?endAt:'',priority_level:priority,notifications:at&&reminder>=0?[String(reminder)]:[]});
   if(at&&reminder>=0)void requestAgendaPermission().catch(()=>false);
   onSaved(r.item);
  }catch(e){setError(errorText(e));}finally{setSaving(false);}
 }
 return <Sheet visible onClose={onClose} label="Fechar programação da tarefa">
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:14,paddingBottom:18}}>
   <Text numberOfLines={2} style={{fontSize:20,fontWeight:'800',color:c.text}}>{task.title}</Text>
   <Text style={{color:c.muted,fontSize:12}}>Quando fazer</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
    <Pressable onPress={()=>setDate(dayKey(today))} style={chip(date===dayKey(today))}><Text style={chipText(date===dayKey(today))}>Hoje</Text></Pressable>
    <Pressable onPress={()=>setDate(dayKey(tomorrow))} style={chip(date===dayKey(tomorrow))}><Text style={chipText(date===dayKey(tomorrow))}>Amanhã</Text></Pressable>
    <Pressable onPress={()=>setDate('')} style={chip(!date)}><Text style={chipText(!date)}>Sem data</Text></Pressable>
   </View>
   <DateTimeField label="Escolher o dia" dateOnly value={date} onChange={v=>setDate(v?String(v).slice(0,10):'')}/>
   {date?<>
    <Text style={{color:c.muted,fontSize:12}}>Horário</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['','09:00','14:00','19:00'].map(t=><Pressable key={t||'none'} onPress={()=>setTime(t)} style={chip(time===t)}><Text style={chipText(time===t)}>{t||'Sem horário'}</Text></Pressable>)}</View>
    <DateTimeField label="Outro horário" timeOnly value={time} onChange={v=>setTime(v?String(v).slice(0,5):'')}/>
    <Text style={{color:c.muted,fontSize:12}}>Lembrete</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{REMINDERS.map(r=><Pressable key={r.value} onPress={()=>setReminder(r.value)} style={chip(reminder===r.value)}><Text style={chipText(reminder===r.value)}>{r.label}</Text></Pressable>)}</View>
   </>:null}
   <Text style={{color:c.muted,fontSize:12}}>Importância</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{TASK_PRIORITIES.map(p=><Pressable key={p.value} onPress={()=>setPriority(p.value)} style={chip(priority===p.value)}><Text style={chipText(priority===p.value)}>{p.symbol!=='—'?p.symbol+' ':''}{p.label}</Text></Pressable>)}</View>
   {date?<Text style={{color:c.muted,fontSize:11,lineHeight:16}}>Com data, a tarefa aparece na Agenda{reminder>=0?' e o lembrete avisa no celular':''}.{!time?' Sem horário, ela fica às 9h.':''}</Text>:null}
   {error?<Text style={{color:c.danger,fontSize:13}}>{error}</Text>:null}
   <Button title={date?'Programar':'Salvar'} loading={saving} onPress={()=>void save()}/>
   <View style={{flexDirection:'row',justifyContent:'space-between'}}>
    {onDetails?<Pressable accessibilityRole="button" onPress={onDetails} style={{paddingVertical:10}}><Text style={{color:c.accent,fontWeight:'700'}}>{detailsLabel||'Ver detalhes'}</Text></Pressable>:<View/>}
    {task.due_at?<Pressable accessibilityRole="button" onPress={()=>void save(true)} style={{paddingVertical:10}}><Text style={{color:c.muted}}>Tirar a data</Text></Pressable>:null}
   </View>
   {/* 0.3.225: remover a tarefa direto daqui */}
   {onRemoved&&task.id?<Pressable accessibilityRole="button" accessibilityLabel="Remover tarefa" disabled={saving} onPress={()=>appAlert('Remover tarefa?','A tarefa "'+(task.title||'')+'" sai da lista e do site.',[
    {text:'Cancelar',style:'cancel'},
    {text:'Remover',style:'destructive',onPress:()=>{void(async()=>{setSaving(true);setError('');try{await api.deleteTask(task.id);onRemoved(task.id);}catch(e){setError(errorText(e));}finally{setSaving(false);}})();}}
   ])} style={{paddingVertical:10,alignItems:'center'}}><Text style={{color:c.danger,fontWeight:'700'}}>Remover tarefa</Text></Pressable>:null}
  </ScrollView>
 </Sheet>;
}
