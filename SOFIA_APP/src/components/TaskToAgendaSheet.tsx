import React,{useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import type {SofiaApi} from '../lib/api';
import type {Task} from '../lib/types';
import {useTheme} from '../lib/theme';
import {Sheet} from './Sheet';
import {DateTimeField} from './DateTimeField';
import {RevealScrollView} from './RevealScroll';
import {Button,forms} from './UI';
import {TASK_PRIORITIES,taskPriority} from '../lib/task-filters';
import {errorText} from '../lib/chat-model';
import {localDateKey} from '../lib/dashboard';
/** 0.3.255: levar uma tarefa para a agenda (ou criar uma tarefa direto na agenda). Antes de subir, escolhe dia, horario,
 * prioridade e uma observacao. Na agenda ela ganha check: ticada fica riscada; sem ticar, passa para o dia seguinte. */
export function TaskToAgendaSheet({api,task,day,onClose,onSaved}:{api:SofiaApi;task?:Task|null;day?:string;onClose:()=>void;onSaved:(t:Task)=>void}){
 const c=useTheme(),creating=!task;
 const [title,setTitle]=useState(task?.title||''),[date,setDate]=useState(day||localDateKey(new Date())),[time,setTime]=useState('09:00');
 const [priority,setPriority]=useState(task?taskPriority(task).value:'none'),[note,setNote]=useState(task?.description||''),[saving,setSaving]=useState(false),[error,setError]=useState('');
 async function save(){
  if(saving)return;if(!title.trim()){setError('Dê um nome para a tarefa.');return;}if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){setError('Escolha o dia.');return;}
  setSaving(true);setError('');
  try{
   const at=new Date(date+'T'+(time||'09:00')+':00');if(!Number.isFinite(at.getTime()))throw Error('Escolha um horário válido.');
   const iso=at.toISOString();
   const body:Partial<Task>={...(task||{}),title:title.trim(),state:'scheduled',due_at:iso,start_at:iso,end_at:'',priority_level:priority,description:note,area:task?.area||'Pessoal'};
   const r=await api.saveTask(body);onSaved(r.item);
  }catch(e){setError(errorText(e));}finally{setSaving(false);}
 }
 return <Sheet visible onClose={()=>{if(!saving)onClose();}} label="Fechar levar para a agenda">
  <RevealScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:14,paddingBottom:12}}>
   <Text style={{color:c.text,fontSize:20,fontWeight:'800'}}>{creating?'Nova tarefa na agenda':'Levar para a agenda'}</Text>
   {creating?<TextInput testID="task-agenda-title" autoFocus accessibilityLabel="Nome da tarefa" value={title} onChangeText={setTitle} placeholder="Nome da tarefa" placeholderTextColor={c.muted} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input}]}/>:<Text style={{color:c.text,fontSize:15,fontWeight:'600'}} numberOfLines={3}>{task!.title}</Text>}
   <DateTimeField label="Dia" value={date} onChange={setDate} dateOnly allowClear={false}/>
   <DateTimeField label="Horário" value={time} onChange={setTime} timeOnly allowClear={false}/>
   <View style={{gap:8}}><Text style={[forms.label,{color:c.muted}]}>Prioridade</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{TASK_PRIORITIES.map(p=><Pressable key={p.value} accessibilityRole="radio" accessibilityState={{checked:priority===p.value}} onPress={()=>setPriority(p.value)} style={{paddingHorizontal:14,paddingVertical:9,borderRadius:99,backgroundColor:priority===p.value?c.accent:c.input}}><Text style={{color:priority===p.value?c.onAccent:c.text,fontWeight:'600',fontSize:13}}>{p.label}</Text></Pressable>)}</View></View>
   <View><Text style={[forms.label,{color:c.muted}]}>Observação</Text><TextInput accessibilityLabel="Observação da tarefa" multiline value={note} onChangeText={setNote} placeholder="Detalhes, o que levar, links…" placeholderTextColor={c.muted} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input,minHeight:88,textAlignVertical:'top'}]}/></View>
   {error?<Text style={{color:c.danger,fontSize:13}}>{error}</Text>:null}
   <Button title={creating?'Criar na agenda':'Levar para a agenda'} loading={saving} onPress={()=>void save()}/>
   <Text style={{color:c.muted,fontSize:11,lineHeight:16}}>Na agenda ela ganha um check. Ticada fica riscada no dia; sem ticar, passa sozinha para o dia seguinte à meia-noite.</Text>
  </RevealScrollView>
 </Sheet>;
}
