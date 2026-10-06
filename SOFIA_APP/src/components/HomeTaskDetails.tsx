import {TaskDescription,TaskDescriptionEditor} from './TaskDescription';
import React,{useState} from 'react';
import {ScrollView,Text,TextInput,View} from 'react-native';
import {Sheet} from './Sheet';
import {Button,ErrorBanner,IconButton,forms} from './UI';
import {Choice} from './Choice';
import {DateTimeField} from './DateTimeField';
import {TaskPriority} from './TaskPriority';
import {useTheme} from '../lib/theme';
import {TASK_PRIORITIES,taskPriority} from '../lib/task-filters';
import {intervalValid} from '../lib/date-time';
import {errorText} from '../lib/chat-model';
import type {SofiaApi} from '../lib/api';
import type {Task} from '../lib/types';

export function HomeTaskDetails({task,visible,api,onClose,onSaved,onDiscuss}:{task:Task;visible:boolean;api:SofiaApi;onClose:()=>void;onSaved:(task:Task)=>void;onDiscuss?:(task:Task)=>void}){
 const c=useTheme(),[editing,setEditing]=useState(false),[draft,setDraft]=useState(task),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const close=()=>{if(!saving){setEditing(false);setError('');onClose();}};
 async function save(){
  if(saving||!draft.title.trim())return;setSaving(true);setError('');
  try{
   if(!intervalValid(draft.start_at||draft.due_at,draft.end_at))throw Error('O fim precisa ser depois do início.');
   const result=await api.saveTask({...draft,title:draft.title.trim(),area:draft.area?.trim()||'Pessoal'});
   onSaved(result.item);setDraft(result.item);setEditing(false);
  }catch(e){setError(errorText(e));}finally{setSaving(false);}
 }
 function field(label:string,key:'title'|'description'|'area',multiline=false){return <View><Text style={[forms.label,{color:c.muted}]}>{label}</Text><TextInput accessibilityLabel={label} value={draft[key]||''} onChangeText={value=>setDraft(t=>({...t,[key]:value}))} editable={!saving} multiline={multiline} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input,paddingVertical:12,minHeight:multiline?110:52,textAlignVertical:'top'}]}/></View>;}
 return <Sheet visible={visible} onClose={close} label="Fechar detalhes da tarefa"><View style={{flexDirection:'row',alignItems:'center',marginBottom:14}}><Text style={{flex:1,color:c.text,fontSize:20,fontWeight:'700'}}>{editing?'Editar tarefa':'Detalhes da tarefa'}</Text><IconButton name="close" label="Fechar detalhes da tarefa" disabled={saving} onPress={close}/></View><ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{gap:18,paddingBottom:12}}>{error?<ErrorBanner text={error}/>:null}{editing?<>{field('Título','title')}<TaskDescriptionEditor disabled={saving} text={draft.description||''} document={draft.description_document} onChange={(description,description_document)=>setDraft(t=>({...t,description,description_document}))}/>{field('Área','area')}<Choice label="Prioridade" value={taskPriority(draft).value} onChange={priority_level=>setDraft(t=>({...t,priority_level}))} options={TASK_PRIORITIES.map(p=>({value:p.value,label:p.label}))}/><DateTimeField label="Início" value={draft.start_at||draft.due_at||''} onChange={value=>setDraft(t=>({...t,start_at:value,due_at:value}))}/><DateTimeField label="Fim" value={draft.end_at||''} onChange={end_at=>setDraft(t=>({...t,end_at}))}/><Button title="Salvar tarefa" loading={saving} disabled={!draft.title.trim()} onPress={()=>void save()}/><Button title="Cancelar edição" secondary disabled={saving} onPress={()=>{setDraft(task);setEditing(false);setError('');}}/></>:<><Text selectable style={{fontSize:23,fontWeight:'700',color:c.text}}>{task.title}</Text><TaskDescription text={task.description||''} document={task.description_document}/><Text style={{color:c.muted}}>{task.area||'Pessoal'}</Text><TaskPriority task={task}/>{task.due_at?<Text style={{color:c.muted}}>{new Date(task.due_at).toLocaleString('pt-BR')}</Text>:null}<Button title="Levar para conversa" secondary onPress={()=>{close();onDiscuss?.(task);}}/><Button title="Editar tarefa" onPress={()=>{setDraft(task);setEditing(true);}}/></>}</ScrollView></Sheet>;
}
