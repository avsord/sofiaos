import {noteFluencyMovement} from '../lib/fluency';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useFinanceGoal} from './Finance';
import {GoalProgressCard} from '../components/GoalProgress';
import {TaskQuickSchedule} from '../components/TaskQuickSchedule';
import {fuzzyFilter} from '../lib/fuzzy';
import {useReturnToTop} from '../lib/return-to-top';
import {useRenderCost} from '../lib/render-cost';
import {readHomeRows} from '../lib/home-rows';
import {scheduleIdleTask} from '../lib/idle-task';
import {ProfileAvatar} from '../components/ProfileAvatar';
import {DeferredScreen,loadHomeCommitmentEditor,loadHomeTaskDetails} from '../lib/screen-loader';
import type {Catalog} from '../lib/types';
import {CapsuleWidget} from '../components/CapsuleWidget';
import {PackagesWidget,RemindersWidget} from '../components/HomeListWidgets';
import {useAgendaMonth} from '../lib/use-agenda-month';

import {TASK_PRIORITIES,taskPriority} from '../lib/task-filters';
import {Sheet} from '../components/Sheet';
import {TaskPriority} from '../components/TaskPriority';
import {SortableWidgets} from '../components/SortableWidgets';
import React,{startTransition,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Alert,AppState,Pressable,RefreshControl,ScrollView,Text,View,TextInput} from 'react-native';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import type {AgendaItem,Bootstrap,Entity,HomeData,Tab,Task} from '../lib/types';
import {dayRecords,observationPoints,stableProductColor,localDateKey} from '../lib/dashboard';
import type {DayRecord,PriceSeries} from '../lib/dashboard';
import {Brand,Empty,ErrorBanner,ScreenTitle} from '../components/UI';
import {Icon} from '../components/Icon';
import {NotificationBell} from '../components/NotificationCenter';
import {subscribeSystemChanged} from '../lib/system-events';
import {MiniAgenda} from '../components/DashboardWidgets';
import {MonitorWidget} from '../components/MonitorWidget';
import {productsFrom,onCollector,collectorState} from '../lib/monitor-collector';
import {widgetRows,validWidgetRows,type MonitorWidgetRow} from '../lib/monitoring';
import {MONITOR_WIDGET_PATH} from '../lib/startup-snapshot';
import {readGoalWidget, writeGoalWidget} from '../lib/goal-widget';
import {appAlert} from '../lib/app-alert';
import {dashboardColumns,useDesktop} from '../lib/desktop';
export const HOME_WIDGET_IDS=['goal','monitoring','tasks','capsules','reminders','packages'];
/** 0.3.227: todos os widgets podem sair (a meta tambem). Listas antigas sem a meta recebem a meta no topo, a menos que a
 * pessoa tenha tirado (guardado no celular). A agenda e fixa, fora da lista. */
export const HOME_FIXED_WIDGETS:string[]=[];
export const GOAL_HIDDEN_KEY='sofia.home.goal.hidden.v1';
export function withFixedWidgets(order:string[],goalHidden=false):string[]{return goalHidden||order.includes('goal')?order:['goal',...order];}
export function Home({api,bootstrap,navigate,onOpenAgenda,active=true,launchVisible=true,onGestureLock,onOpenCapsules,onOpenMonitoring,onOpenTasks,onOpenModule,onDiscussTask,homeTopKey=0,homeTopSmooth=false}:{homeTopKey?:number;homeTopSmooth?:boolean;onOpenModule?:(id:string)=>void;onDiscussTask?:(task:Task)=>void;onOpenCapsules?:()=>void;onOpenMonitoring?:()=>void;onOpenTasks?:()=>void;onGestureLock?:(locked:boolean)=>void;api:SofiaApi;bootstrap:Bootstrap;navigate:(tab:Tab)=>void;onOpenAgenda?:(date:string,id?:string,create?:boolean)=>void;active?:boolean;launchVisible?:boolean}){useRenderCost('home');
 const [agendaDraft,setAgendaDraft]=useState<Partial<Entity>|null>(null),[agendaCatalog,setAgendaCatalog]=useState<Catalog|null>(()=>api.cached<Catalog>('/workspace/catalog')||null);
 // Catalog metadata is optional on launch. Keep cached areas synchronously,
 // then refresh after native Home is actually visible and the JS thread yields.
 useEffect(()=>{
  if(!active||!launchVisible||agendaCatalog)return;
  let alive=true;
  const cancel=scheduleIdleTask(()=>{void api.catalog().then(cat=>{if(alive)startTransition(()=>setAgendaCatalog(cat));}).catch(()=>{});});
  return()=>{alive=false;cancel();};
 },[api,active,launchVisible,agendaCatalog]);
 // 0.3.145: volta ao topo ainda escondido, depois de 10 s seguidos fora (ver return-to-top.ts).
 const homeScroll=useReturnToTop(active);
 // 0.3.223: tocar em Inicio na barra leva ao topo (suave se ja estava no Inicio)
 const topSeen=useRef(homeTopKey);useEffect(()=>{if(homeTopKey===topSeen.current)return;topSeen.current=homeTopKey;homeScroll.current?.scrollTo({y:0,animated:homeTopSmooth});},[homeTopKey,homeTopSmooth]);
 function createHomeCommitment(day:string){setAgendaDraft({kind:'commitment',title:'',data:{home_day:day}});}
 const [detail,setDetail]=useState<Task|null>(null),[detailOpen,setDetailOpen]=useState(false);
 const [detailEdit,setDetailEdit]=useState(false);
 const openTask=(task:Task)=>{setDetail(task);setDetailEdit(false);setDetailOpen(true);};
 const openTaskEditing=(task:Task)=>{setDetail(task);setDetailEdit(true);setDetailOpen(true);};
 const [priority,setPriority]=useState(''),[areaFilter,setAreaFilter]=useState(''),[filterOpen,setFilterOpen]=useState(false),[areaFilterOpen,setAreaFilterOpen]=useState(false);
 const [widgets,setWidgets]=useState(()=>(()=>{const w=api.cached<{widgets:string[]|null}>('/md/dashboard')?.widgets;return Array.isArray(w)?w.filter(x=>HOME_WIDGET_IDS.includes(x)):null;})()||['monitoring','tasks']),[dragging,setDragging]=useState(false);
 const c=useTheme(),[data,setData]=useState<HomeData|null>(()=>api.cached<HomeData>('/home')||null),[tasks,setTasks]=useState<Task[]>(()=>api.cached<{items:Task[]}>('/tasks')?.items||[]),[tasksReady,setTasksReady]=useState(()=>!!api.cached('/tasks')),[series,setSeries]=useState<MonitorWidgetRow[]|null>(()=>validWidgetRows(api.cached(MONITOR_WIDGET_PATH))),[seriesFailed,setSeriesFailed]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(''),[refreshEpoch,setRefreshEpoch]=useState(0);
 useEffect(()=>subscribeSystemChanged(owner=>{if(owner===api)setRefreshEpoch(x=>x+1);}),[api]);
 useEffect(()=>{if(!refreshEpoch)return;let alive=true;void api.catalog().then(value=>{if(alive)setAgendaCatalog(value);}).catch(()=>{});return()=>{alive=false;};},[api,refreshEpoch]);
 const homeActive=useRef(active);homeActive.current=active;
 useEffect(()=>{let alive=true;async function load(){
 // Tasks may already be local while /home is slow or failing. Publish each
 // independent result immediately rather than holding both behind Promise.all.
 const results=await readHomeRows(api,home=>{if(alive)setData(home);},rows=>{if(alive){setTasks(rows);setTasksReady(true);}});
 if(!alive)return;
 const failure=results.find((r):r is PromiseRejectedResult=>r.status==='rejected');
 setRefreshing(false);setError(failure?errorText(failure.reason):'');if(failure)return;
 }void load();const timer=setInterval(()=>{if(homeActive.current&&AppState.currentState==='active')void load();},60000);const foreground=AppState.addEventListener('change',state=>{if(state==='active'&&homeActive.current)void load();});return()=>{alive=false;clearInterval(timer);foreground.remove();};},[api,refreshEpoch]);
 // Widget order comes from the encrypted launch snapshot. Refreshing its
 // metadata must not compete with Home tasks and the current Agenda month.
 useEffect(()=>{
  if(!launchVisible||!active)return;
  let alive=true;
  const cancel=scheduleIdleTask(()=>{void api.dashboardWidgets().then(r=>{if(alive)startTransition(()=>setWidgets(prev=>{const next=(Array.isArray(r.widgets)?r.widgets:['monitoring','tasks']).filter(x=>HOME_WIDGET_IDS.includes(x));return prev.length===next.length&&prev.every((x,i)=>x===next[i])?prev:next;}));}).catch(()=>{});});
  return()=>{alive=false;cancel();};
 },[api,refreshEpoch,launchVisible,active]);
 // Monitoring may involve many reads; it must not compete with the first usable frame.
 useEffect(()=>{if(!launchVisible)return;let alive=true;async function load(){try{const monitors:Entity[]=[];for(let offset=0;;offset+=100){const r=await api.entities('monitor','',offset);monitors.push(...r.items);if(r.items.length<100)break;}const result=await productsFrom(api,monitors);/* One broken monitor must not turn the whole Home into an error. */if(alive){setSeriesFailed(false);const rows=widgetRows(result);api.rememberLocal(MONITOR_WIDGET_PATH,rows);startTransition(()=>setSeries(rows));}}catch{/* Monitoring is secondary; Home, Agenda and Tasks stay usable. */if(alive)setSeriesFailed(true);}}const cancel=scheduleIdleTask(()=>{void load();});const timer=setInterval(()=>{if(homeActive.current&&AppState.currentState==='active')void load();},60000);const foreground=AppState.addEventListener('change',state=>{if(state==='active'&&homeActive.current)void load();});const stop=onCollector(()=>{if(!collectorState().running&&homeActive.current)void load();});return()=>{alive=false;cancel();clearInterval(timer);foreground.remove();stop();};},[api,refreshEpoch,launchVisible]);
 const [calendarDate,setCalendarDate]=useState(()=>new Date());
 const calendar=useAgendaMonth(api,calendarDate,active,launchVisible),events=calendar.items;
 const calendarMonth=useCallback((month:Date)=>setCalendarDate(month),[]);
 useEffect(()=>{if(refreshEpoch)void calendar.refresh();},[refreshEpoch]);
 async function toggle(task:Task){if(saving)return;setSaving(task.id);try{await api.taskState(task,task.state==='done'?'todo':'done');setTasks((await api.tasks()).items);}catch(e){setError(errorText(e));}finally{setSaving('');}}
 const openAgenda=(day:string,id?:string)=>{if(onOpenAgenda)onOpenAgenda(day,id);else navigate('agenda');};
 function itemDetails(item:DayRecord){if(!item.isTask){openAgenda(localDateKey(item.date),item.original.id);return;}openTask(item.original as Task);}
 const calendarRecords=useMemo(()=>dayRecords(events,tasks),[events,tasks]);
 const areaOptions=useMemo(()=>[...new Set(['Pessoal',...(agendaCatalog?.areas||[]),...tasks.map(t=>t.area?.trim()||'Pessoal'),...events.map(e=>(e as AgendaItem & {area?:string}).area?.trim()||'').filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'pt-BR')),[agendaCatalog,events,tasks]);
 const [taskQuery,setTaskQuery]=useState(''),[quick,setQuick]=useState<Task|null>(null);
 const first=bootstrap.profile.name.split(' ')[0],todo=useMemo(()=>fuzzyFilter([...tasks].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).filter(t=>!['done','cancelled'].includes(t.state)&&(!priority||taskPriority(t).value===priority)&&(!areaFilter||(t.area?.trim()||'Pessoal')===areaFilter)),taskQuery,t=>t.title+' '+(t.description||'')),[tasks,priority,areaFilter,taskQuery]);
 async function saveWidgets(next:string[]){const old=widgets;setWidgets(next);try{await api.saveDashboardWidgets(next);setError('');}catch(e){setWidgets(old);setError(errorText(e));throw e;}}
 // 0.3.240: "Meta escondida" tambem vem do ultimo estado (antes nascia false e a ordem mudava no meio); AsyncStorage fica so para quem ja tinha escondido antes
 const [goalHidden,setGoalHidden]=useState(()=>readGoalWidget(api).hidden);
 useEffect(()=>{AsyncStorage.getItem(GOAL_HIDDEN_KEY).then(v=>{const h=v==='1';setGoalHidden(h);writeGoalWidget(api,{hidden:h});}).catch(()=>{});},[api]);
 const saveHomeOrder=async(next:string[])=>{const hidden=!next.includes('goal');setGoalHidden(hidden);writeGoalWidget(api,{hidden});void AsyncStorage.setItem(GOAL_HIDDEN_KEY,hidden?'1':'0').catch(()=>{});await saveWidgets(next);};
 const goal=useFinanceGoal(api,active&&launchVisible);
 const lockWidgets=(locked:boolean)=>{setDragging(locked);onGestureLock?.(locked);};
 // 0.3.250 (computador): painel em colunas pela largura; sino e perfil ficam na barra de cima; Organizar por botao
 const desktop=useDesktop(),[homeWidth,setHomeWidth]=useState(0),[organizeKey,setOrganizeKey]=useState(0);
 const columns=desktop?dashboardColumns(homeWidth):1;
 return <><ScrollView ref={homeScroll} onScroll={noteFluencyMovement} scrollEventThrottle={100} nestedScrollEnabled={false} keyboardShouldPersistTaps="always" testID="home-scroll" nativeID="sofia-home-scroll" scrollEnabled={!dragging} contentContainerStyle={{paddingBottom:28}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{console.info('SOFIA_HOME_PULL_REFRESH');setRefreshing(true);setRefreshEpoch(x=>x+1);}} tintColor={c.accent}/>}><ScreenTitle tight title={`Olá, ${first}.`} eyebrow={new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}).toUpperCase()} right={desktop?<Pressable accessibilityRole="button" accessibilityLabel="Organizar Início" onPress={()=>setOrganizeKey(k=>k+1)} style={{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:c.line}}><Icon name="grid" size={16} color={c.muted}/><Text style={{color:c.muted,fontSize:13}}>Organizar</Text></Pressable>:<View style={{flexDirection:'row',alignItems:'center',gap:8}}><NotificationBell onViewAll={()=>navigate('notifications')}/><Pressable accessibilityLabel="Abrir configurações" onPress={()=>navigate('profile')}><ProfileAvatar scope={bootstrap.profile.email} name={bootstrap.profile.name}/></Pressable></View>}/>{error||calendar.error?<View nativeID={!tasksReady||!calendar.loadedAt?'sofia-launch-error':undefined} collapsable={false}><ErrorBanner text={error||(calendar.error?errorText(calendar.error):'')} onRetry={()=>{setRefreshing(true);setRefreshEpoch(x=>x+1);}}/></View>:null}<View onLayout={e=>{const w=e.nativeEvent.layout.width;if(Math.abs(w-homeWidth)>4)setHomeWidth(w);}} style={{paddingHorizontal:22,gap:18}}>{tasksReady&&calendar.loadedAt>0?<View nativeID="sofia-home-data-ready" collapsable={false} style={{width:1,height:1}}/>:null}<MiniAgenda onCreate={day=>void createHomeCommitment(day)} loading={calendar.loading} pending={calendar.pending} onMonthChange={calendarMonth} active={active} viewOwner={api} onGestureLock={onGestureLock} items={calendarRecords} onOpen={openAgenda} onItem={itemDetails}/><SortableWidgets fixed={HOME_FIXED_WIDGETS} items={[...(goal?[{id:'goal',title:'Meta',content:<GoalProgressCard g={goal} compact onPress={()=>onOpenModule?onOpenModule('finance'):navigate('apps')}/>}]:[]),{id:'capsules',title:'Cápsulas',content:<CapsuleWidget api={api} active={active} onOpen={()=>onOpenCapsules?onOpenCapsules():navigate('apps')}/>},{id:'reminders',title:'Lembretes',content:<RemindersWidget api={api} active={active} onOpen={()=>onOpenModule?onOpenModule('reminders'):navigate('apps')}/>},{id:'packages',title:'Encomendas',content:<PackagesWidget api={api} active={active} onOpen={()=>onOpenModule?onOpenModule('packages'):navigate('apps')}/>},{id:'monitoring',title:'Price Tracker',content:<MonitorWidget rows={series} failed={seriesFailed} onOpen={()=>onOpenMonitoring?onOpenMonitoring():navigate('apps')}/>},{id:'tasks',title:'Tarefas',content:<><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:0,marginBottom:12}}><Text style={{fontSize:20,fontWeight:'600',color:c.text}}>Tarefas</Text><View style={{flexDirection:'row',alignItems:'center',gap:6}}><Pressable accessibilityRole="button" accessibilityLabel="Filtrar áreas das tarefas do Início" onPress={()=>setAreaFilterOpen(true)} style={{paddingHorizontal:9,paddingVertical:7,borderRadius:14,backgroundColor:c.accentSoft}}><Text numberOfLines={1} style={{fontSize:11,color:c.accent,maxWidth:90}}>{areaFilter||'Áreas'} ▾</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Filtrar níveis das tarefas do Início" onPress={()=>setFilterOpen(true)} style={{paddingHorizontal:10,paddingVertical:7,borderRadius:14,backgroundColor:c.accentSoft}}><Text style={{fontSize:11,color:c.accent}}>{TASK_PRIORITIES.find(p=>p.value===priority)?.label||'Todas'} ▾</Text></Pressable><Text accessibilityLabel="Total de tarefas no Início" style={{color:c.muted}}>{todo.length}</Text></View></View>{!tasksReady?<Text accessibilityRole="progressbar" style={{color:c.muted,padding:16,fontSize:13}}>Sincronizando tarefas…</Text>:todo.length||(tasks.length>2||taskQuery)?<View style={{backgroundColor:c.surface,borderRadius:18,paddingHorizontal:14,borderWidth:1,borderColor:c.line}}>{(tasks.length>2||taskQuery)?<TextInput accessibilityLabel="Buscar tarefa no Início" value={taskQuery} onChangeText={setTaskQuery} placeholder="🔍 Buscar tarefa" placeholderTextColor={c.muted} returnKeyType="search" style={{color:c.text,backgroundColor:c.input,borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontSize:14,marginTop:14,marginBottom:6}}/>:null}{!todo.length?<Text style={{color:c.muted,fontSize:13,paddingVertical:16}}>Nenhuma tarefa com essa busca.</Text>:null}{todo.slice(0,8).map((task,i)=><View key={task.id} style={{flexDirection:'row',gap:12,alignItems:'center',paddingVertical:14,borderBottomWidth:i<Math.min(todo.length,8)-1?1:0,borderColor:c.line}}><Pressable disabled={!!saving} accessibilityRole="checkbox" accessibilityLabel={'Concluir '+task.title} accessibilityState={{checked:task.state==='done'}} onPress={()=>void toggle(task)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><View style={{width:22,height:22,borderWidth:1.5,borderColor:c.accent,borderRadius:7}}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={'Abrir tarefa '+task.title} onLongPress={()=>onDiscussTask&&appAlert(task.title,'Opções da tarefa',[{text:'Levar para conversa',onPress:()=>onDiscussTask(task)},{text:'Abrir detalhes',onPress:()=>openTask(task)},{text:'Cancelar',style:'cancel'}])} onPress={()=>openTask(task)} style={{flex:1,gap:4,paddingVertical:6}}><Text style={{color:c.text,fontSize:14}}>{task.title}</Text><TaskPriority task={task}/>{task.due_at?<Text style={{color:c.muted,fontSize:11}}>{new Date(task.due_at).toLocaleString('pt-BR')}</Text>:null}</Pressable></View>)}{todo.length>8?<Pressable accessibilityRole="button" accessibilityLabel={'Ver todas as '+todo.length+' tarefas'} onPress={()=>onOpenTasks?onOpenTasks():navigate('apps')} style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:14,borderTopWidth:1,borderColor:c.line}}><Text style={{color:c.accent,fontWeight:'700',fontSize:14}}>Ver mais</Text><Icon name="chevron" size={16} color={c.accent}/></Pressable>:null}</View>:<Empty icon="check" title={priority||areaFilter?'Nenhuma tarefa neste filtro':'Tudo em dia por aqui'} body={priority||areaFilter?'Escolha outra área ou prioridade.':'Suas próximas tarefas aparecem neste espaço.'}/>}</>}]} order={withFixedWidgets(widgets,goalHidden)} onSave={saveHomeOrder} onLock={lockWidgets} columns={columns} openKey={organizeKey}/><Pressable accessibilityLabel="Abrir apps" onPress={()=>navigate('apps')} style={{flexDirection:'row',alignItems:'center',gap:10,padding:14}}><Icon name="grid" color={c.accent}/><Text style={{color:c.accent,fontSize:14}}>Todos os seus espaços</Text></Pressable>{!bootstrap.ai.ready?<Text style={{fontSize:12,color:c.danger}}>{bootstrap.ai.reason}</Text>:null}</View><Sheet visible={filterOpen} onClose={()=>setFilterOpen(false)} label="Fechar filtro de tarefas"><Text style={{fontSize:20,color:c.text,fontWeight:'600'}}>Nível das tarefas</Text>{[{value:'',label:'Todas'},...TASK_PRIORITIES].map(p=><Pressable key={p.value} accessibilityRole="radio" accessibilityState={{checked:priority===p.value}} accessibilityLabel={p.label} onPress={()=>{setPriority(p.value);setFilterOpen(false);}} style={{paddingVertical:16,borderBottomWidth:1,borderColor:c.line}}><Text style={{color:priority===p.value?c.accent:c.text}}>{p.label}</Text></Pressable>)}</Sheet><Sheet visible={areaFilterOpen} onClose={()=>setAreaFilterOpen(false)} label="Fechar filtro por área"><Text style={{fontSize:20,color:c.text,fontWeight:'600'}}>Áreas das tarefas</Text>{[{value:'',label:'Todas as áreas'},...areaOptions.map(value=>({value,label:value}))].map(area=><Pressable key={area.value} accessibilityRole="radio" accessibilityState={{checked:areaFilter===area.value}} onPress={()=>{setAreaFilter(area.value);setAreaFilterOpen(false);}} style={{paddingVertical:16,borderBottomWidth:1,borderColor:c.line}}><Text style={{color:areaFilter===area.value?c.accent:c.text}}>{area.label}</Text></Pressable>)}</Sheet>{detail&&detailOpen?<DeferredScreen key={detail.id+(detailEdit?':editar':'')} load={loadHomeTaskDetails} screenProps={{areas:areaOptions,onDiscuss:onDiscussTask,onEdit:(t:Task)=>setQuick(t),startEditing:detailEdit,task:detail,visible:detailOpen,api,onClose:()=>setDetailOpen(false),onSaved:(item:Task)=>{setTasks(previous=>previous.map(t=>t.id===item.id?item:t));setDetail(item);}}}/>:null}</ScrollView>{agendaDraft?<DeferredScreen load={loadHomeCommitmentEditor} screenProps={{api,day:String(agendaDraft.data?.home_day||''),areas:areaOptions,onClose:()=>setAgendaDraft(null),onSaved:()=>{setAgendaDraft(null);void calendar.refresh();void api.catalog().then(setAgendaCatalog).catch(()=>{});}}}/>:null}{quick?<TaskQuickSchedule api={api} task={quick} onClose={()=>setQuick(null)} onSaved={t=>{setTasks(prev=>prev.map(x=>x.id===t.id?t:x));setQuick(null);}} onDetails={()=>{const t=quick;setQuick(null);openTaskEditing(t);}} detailsLabel="Editar título e descrição" onRemoved={id=>{setTasks(prev=>prev.filter(x=>x.id!==id));setQuick(null);}}/>:null}</>;
}
