import React,{useEffect,useMemo,useState} from 'react';
import {Pressable,Switch,Text,TextInput,View} from 'react-native';
import type {SofiaApi} from '../lib/api';
import type {Task} from '../lib/types';
import {useTheme} from '../lib/theme';
import {forms} from './UI';
/** 0.3.256: no criar e no editar de um evento da Agenda - "Tornar tarefa" (ganha check; sem ticar passa sozinho para o dia
 * seguinte a meia-noite) e "Buscar tarefa": usar uma tarefa que ja existe ou criar uma nova ali mesmo. */
export type TaskLink={asTask:boolean;task:Task|null};
const norm=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function searchTasks(tasks:Task[],query:string,limit=5):Task[]{
 const q=norm(query);if(!q)return [];
 return tasks.filter(t=>!['done','cancelled'].includes(t.state)&&norm(t.title).includes(q)).sort((a,b)=>Number(norm(b.title).startsWith(q))-Number(norm(a.title).startsWith(q))||a.title.localeCompare(b.title,'pt-BR')).slice(0,limit);
}
export function TaskLinkPanel({api,value,onChange,onPick}:{api:SofiaApi;value:TaskLink;onChange:(v:TaskLink)=>void;onPick:(title:string,task:Task|null)=>void}){
 const c=useTheme(),[query,setQuery]=useState(''),[tasks,setTasks]=useState<Task[]>(()=>((api.cached('/tasks') as {items?:Task[]}|undefined)?.items)||[]);
 useEffect(()=>{let alive=true;api.tasks().then(r=>{if(alive)setTasks(r.items||[]);}).catch(()=>{});return()=>{alive=false;};},[api]);
 const found=useMemo(()=>searchTasks(tasks.filter(t=>t.id!==value.task?.id),query),[tasks,query,value.task]);
 return <View testID="task-link-panel" style={{gap:10,padding:12,borderRadius:16,borderWidth:1,borderColor:value.asTask?c.accent:c.line,backgroundColor:value.asTask?c.accentSoft:'transparent'}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
   <View style={{flex:1}}><Text style={{color:c.text,fontWeight:'600'}}>Tornar tarefa</Text><Text style={{color:c.muted,fontSize:11,lineHeight:15}}>Ganha check na agenda. Ticada fica riscada; sem ticar, passa sozinha para o dia seguinte à meia-noite.</Text></View>
   <Switch testID="task-link-switch" accessibilityLabel="Tornar tarefa" value={value.asTask} onValueChange={v=>onChange({asTask:v,task:v?value.task:null})}/>
  </View>
  {value.task?<View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{flex:1,color:c.text,fontSize:13}} numberOfLines={2}>Tarefa: <Text style={{fontWeight:'600'}}>{value.task.title}</Text></Text><Pressable accessibilityRole="button" accessibilityLabel="Desvincular tarefa" hitSlop={8} onPress={()=>onChange({...value,task:null})}><Text style={{color:c.muted,fontSize:16}}>✕</Text></Pressable></View>:null}
  <TextInput testID="task-link-search" accessibilityLabel="Buscar tarefa" value={query} onChangeText={setQuery} placeholder="Buscar tarefa (ou digitar uma nova)" placeholderTextColor={c.muted} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input}]}/>
  {query.trim()?<View style={{gap:4}}>
   {found.map(t=><Pressable key={t.id} accessibilityRole="button" accessibilityLabel={'Usar a tarefa '+t.title} onPress={()=>{onChange({asTask:true,task:t});onPick(t.title,t);setQuery('');}} style={{paddingVertical:9,paddingHorizontal:10,borderRadius:10,backgroundColor:c.surface}}><Text style={{color:c.text}} numberOfLines={2}>{t.title}</Text>{t.due_at&&t.state==='scheduled'?<Text style={{color:c.muted,fontSize:11}}>já está na agenda · vai mudar para este evento</Text>:null}</Pressable>)}
   <Pressable testID="task-link-create" accessibilityRole="button" accessibilityLabel={'Criar tarefa nova '+query.trim()} onPress={()=>{onChange({asTask:true,task:null});onPick(query.trim(),null);setQuery('');}} style={{paddingVertical:9,paddingHorizontal:10,borderRadius:10,borderWidth:1,borderStyle:'dashed',borderColor:c.accent}}><Text style={{color:c.accent,fontWeight:'600'}} numberOfLines={2}>+ Criar tarefa nova: “{query.trim()}”</Text></Pressable>
  </View>:null}
 </View>;
}
/** Grava o evento como tarefa da agenda (estado "scheduled"): usa a tarefa escolhida ou cria uma nova. */
export async function saveEventAsTask(api:SofiaApi,{title,startIso,description,priority,area,task}:{title:string;startIso:string;description:string;priority:string;area:string;task:Task|null}):Promise<Task>{
 const body:Partial<Task>={...(task||{}),title:title.trim(),state:'scheduled',due_at:startIso,start_at:startIso,end_at:'',priority_level:priority||task?.priority_level||'none',description:description||task?.description||'',area:task?.area||area||'Pessoal'};
 return (await api.saveTask(body)).item;
}
