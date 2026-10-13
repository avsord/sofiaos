import AsyncStorage from '@react-native-async-storage/async-storage';
import {useRenderCost} from './src/lib/render-cost';
import {startFluency,revealFluency,noteFluencyInput,noteFluencyMovement,queueOptional,newFluency,FLUENCY_MODE_KEY,type FluencyMode} from './src/lib/fluency';
import {perfActive,perfNow,perfTap} from './src/lib/fluency-metrics';
import {AppBoundary} from './src/components/AppBoundary';
import {ScreenSkeleton} from './src/components/ScreenSkeleton';
import {scheduleIdleTask} from './src/lib/idle-task';
import {prepareLocalLaunch,createLaunchPreparation} from './src/lib/local-launch';
import type {LocalLaunch} from './src/lib/local-launch';
import {prepareInitialData} from './src/lib/startup-preparation';
import {useAfterFirstPaint} from './src/lib/use-after-first-paint';
import {useLaunchVisible} from './src/lib/use-launch-visible';
import {monthKey} from './src/lib/agenda-cache';
import {preloadAgenda} from './src/lib/use-agenda-month';
import React,{Component,ErrorInfo,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,StatusBar,ActivityIndicator,AccessibilityInfo,useColorScheme,AppState,Alert,Keyboard,BackHandler,Linking,StyleSheet} from 'react-native';
import {SafeAreaProvider,SafeAreaView,initialWindowMetrics} from 'react-native-safe-area-context';
import {SofiaApi,readAuth,saveAuth,forgetAuth,readPrefs,savePrefs,startupSnapshotFor} from './src/lib/api';
import type {Auth,Bootstrap,Prefs,Tab,Task,Profile as UserProfile,Notice} from './src/lib/types';
import {fastBootstrap,authWithBootstrap} from './src/lib/fast-bootstrap';
import {themeAppearance} from './src/lib/theme-schedule';
import {ThemeContext,light,dark} from './src/lib/theme';
import {errorText} from './src/lib/chat-model';
import {silenceVoices} from './src/lib/audio-focus';
import {Icon,IconName} from './src/components/Icon';
import {Button,ErrorBanner} from './src/components/UI';
import {StartupHome} from './src/components/StartupHome';
import {TabPager} from './src/components/TabPager';
import {MenuTab} from './src/components/MenuTab';
import {NotificationProvider,noticeArea} from './src/components/NotificationCenter';
import {Spinner,FadeSwap} from './src/components/Loading';
import {createMenuMotion} from './src/lib/menu-motion';
import type {TabPagerHandle} from './src/components/TabPager';
import {useStartupMounts} from './src/lib/startup-mounts';
import {DeferredScreen,loadAgenda,loadChat,loadHome,loadNotifications,loadPages,loadProfile,loadWorkspace,loadBackgroundServices} from './src/lib/screen-loader';
import {Login} from './src/screens/Login';

import {APP_VERSION,checkForUpdate} from './src/lib/update';
import {finishLaunchHandoff} from './src/lib/launch-handoff';

const tabs:{id:Tab;label:string;icon:IconName}[]=[{id:'home',label:'Início',icon:'home'},{id:'chat',label:'Conversa',icon:'chat'},{id:'pages',label:'Páginas',icon:'book'},{id:'agenda',label:'Agenda',icon:'calendar'},{id:'apps',label:'Apps',icon:'grid'},{id:'profile',label:'Perfil',icon:'user'}];
function Shell({startup}:{startup:LocalLaunch}){useRenderCost('app');
 const system=useColorScheme(),[ready]=useState(true),[auth,setAuth]=useState<Auth|null>(startup.auth),[bootstrap,setBootstrap]=useState<Bootstrap|null>(()=>startup.auth?fastBootstrap(startup.auth):null),[prefs,setPrefs]=useState<Prefs>(startup.prefs||{appearance:'schedule',enterToSend:false,autoSendVoice:true,lightAt:'05:00',darkAt:'19:00'}),[error,setError]=useState(''),[tab,setTab]=useState<Tab>('home'),[locked,setLocked]=useState(false),[booting,setBooting]=useState(false),[keyboard,setKeyboard]=useState(false),[workspaceDepth,setWorkspaceDepth]=useState(false),[workspaceReset,setWorkspaceReset]=useState(0),[capsulesTarget,setCapsulesTarget]=useState(0),[gestureLocked,setGestureLocked]=useState(false),[pagesDepth,setPagesDepth]=useState(false),[chatEpoch,setChatEpoch]=useState(0);
 const [agendaTarget,setAgendaTarget]=useState<{date:string;id?:string;create?:boolean;nonce:number}>({date:'',nonce:0});
 const tabHistory=useRef<Tab[]>([]),pager=useRef<TabPagerHandle>(null),navigation=useRef({tab,locked});
 const tabTap=useRef<{tab:Tab;at:number;early:boolean}|null>(null);
 const nativeRevealAt=useRef(0);
 const [fluency,setFluency]=useState<FluencyMode|'pending'>('pending');
 const [previewTabs,setPreviewTabs]=useState<readonly Tab[]>([]);
 const [backgroundReady,setBackgroundReady]=useState(false);
 navigation.current={tab,locked};
 const screenTab=tab;
 const menuMotion=useMemo(()=>createMenuMotion('home',noteFluencyMovement),[]);
 useEffect(()=>{let mounted=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(mounted)menuMotion.setReducedMotion(value);}).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>menuMotion.setReducedMotion(value));return()=>{mounted=false;sub.remove();menuMotion.dispose();};},[menuMotion]);
 const [themeClock,setThemeClock]=useState(()=>new Date());
 useEffect(()=>{const update=()=>setThemeClock(previous=>{const now=new Date();return now.getHours()!==previous.getHours()||now.getMinutes()!==previous.getMinutes()?now:previous;}),timer=setInterval(update,1000),sub=AppState.addEventListener('change',state=>{if(state==='active')update();});return()=>{clearInterval(timer);sub.remove();};},[]);
 const c=themeAppearance(prefs,system,themeClock)==='dark'?dark:light;
 const expired=useCallback(()=>{tabHistory.current=[];setAuth(null);setBootstrap(null);setLocked(false);void forgetAuth().catch(()=>{});},[]);
 const api=useMemo(()=>new SofiaApi(auth?.token||'',expired,auth?.profile?.email||'anonymous',auth?.token===startup.auth?.token?startup.snapshot||undefined:undefined).deferNetworkUntilPaint(),[auth?.token,auth?.profile?.email,expired]);
 const [prepared,setPrepared]=useState<SofiaApi|null>(()=>startup.auth&&startup.snapshot?api:null),[preparationError,setPreparationError]=useState(''),[prepareAttempt,setPrepareAttempt]=useState(0);
 const initialDataReady=prepared===api;
 // Layout releases essential network reads; only the completed visual handoff
 // releases hidden screens, notification inventory and optional prefetch.
 // A cached Home needs only the final visibility fence. A second first-paint
 // state update rerenders the entire Shell during the native alpha animation.
 const cachedOpening=!!(api.cached('/home')&&api.cached('/tasks')&&api.cached('/agenda?month='+monthKey(new Date())));
 const painted=useAfterFirstPaint(ready&&!cachedOpening),visible=useLaunchVisible(ready),servicesReady=visible&&!!auth&&!!bootstrap&&initialDataReady;
 // Archive loading remains post-reveal, but is not a prerequisite for lazy tabs.
 // No hydration-completion setState: re-rendering the entire Shell would
 // compete with the user's first menu interaction.
 useEffect(()=>{
  if(!visible)return;
  if(!nativeRevealAt.current){nativeRevealAt.current=Date.now();revealFluency();}
  let live=true;
  void AsyncStorage.getItem(FLUENCY_MODE_KEY).then(saved=>{if(live){const mode=saved==='old'?'old':'new';startFluency(mode);setFluency(mode);}}).catch(()=>{if(live){startFluency('new');setFluency('new');}});
  // Ordinary cache writes are now spaced out; persist what is pending when the app leaves the foreground.
  const sub=AppState.addEventListener('change',state=>{perfActive(state==='active');if(state==='background'&&newFluency())void api.persistLaunch().catch(()=>{});});
  return()=>{live=false;sub.remove();};
 },[visible]);
 // Tap-to-next-React-frame is a JS-side estimate, not a physical GPU latency.
 // Explicitly label 0-3s vs. later; the Android native hop can be faster.
 useEffect(()=>{
  if(!tabTap.current||tabTap.current.tab!==tab)return;
  const frame=requestAnimationFrame(()=>{
   const tap=tabTap.current;
   if(!tap||tap.tab!==tab||navigation.current.tab!==tab)return;
   console.info('SOFIA_TAB_TAP_TO_FRAME_MS tab='+tab+' ms='+Math.max(0,Date.now()-tap.at)+' window='+(tap.early?'first_3s':'after_3s'));
   perfTap(tab,perfNow()-Math.max(0,Date.now()-tap.at));
   tabTap.current=null;
  });
  return()=>cancelAnimationFrame(frame);
 },[tab]);
 // The full encrypted archive may include years of Page/chat history. Never
 // parse it during the native splash: prepare it only after the final fade.
 useEffect(()=>{
  if(!visible||!auth||!initialDataReady||fluency==='pending')return;
  let live=true;const started=Date.now();
  const cancel=queueOptional('hidratar',()=>api.hydrate().then(()=>{
   if(live)console.info('SOFIA_HYDRATE_MS='+Math.max(0,Date.now()-started));
  }).catch(error=>{
   // Cached history is optional; network reads and manual navigation must
   // remain available when the encrypted archive is temporarily unreadable.
   if(live)console.warn('SOFIA_HYDRATE_FAILED',errorText(error));
  }),2,8000);
  return()=>{live=false;cancel();};
 },[visible,auth,initialDataReady,api,fluency]);
 // Warm code/screens after the native fade, concurrently with archive I/O;
 // Pages owns its loading/empty-state gate and never fabricates a page list.
 const mountedTabs=useStartupMounts(visible&&!!auth,tab,!!auth,fluency,previewTabs);
 useEffect(()=>{if(!visible||fluency==='pending')return;if(fluency==='old'){setBackgroundReady(true);return;}return queueOptional('background-services:mount',()=>setBackgroundReady(true),7,5000);},[visible,fluency]);
 useEffect(()=>{if(!auth||initialDataReady)return;let live=true;setPreparationError('');void prepareInitialData(api,()=>preloadAgenda(api)).then(()=>{if(live){setPrepared(api);console.info('SOFIA_STARTUP_CACHE_READY');}}).catch(e=>{if(live)setPreparationError(errorText(e));});return()=>{live=false;};},[api,prepareAttempt]);
 // Do not start network completion renders over the native splash fade
 // when there is already a cached Home to present. In 0.3.76, React work
 // starved the UI-thread ValueAnimator for 600-770ms despite its 95ms
 // duration. With no cached Home, essential requests retain first-paint
 // permission so login and a first run cannot get stuck.
 useEffect(()=>{if(cachedOpening?visible:painted)api.releaseNetwork();},[painted,visible,cachedOpening,api]);
 // Home waits for essential local data; secondary screens remain mounted after
 // their first visit and warm independently without extending the splash.
 const launchReady=ready&&(!auth||(!!bootstrap&&servicesReady));
 useEffect(()=>{if(!launchReady)return;return finishLaunchHandoff();},[launchReady,c.bg]);
 const checkingUpdate=useRef(false),lastUpdateCheck=useRef(0),lastUpdatePrompt=useRef('');
 const checkUpdate=useCallback(async(manual=false)=>{
  if(checkingUpdate.current)return;
  if(!manual&&(AppState.currentState!=='active'||navigation.current.locked||Date.now()-lastUpdateCheck.current<300000))return;
  checkingUpdate.current=true;lastUpdateCheck.current=Date.now();
  try{
   const update=await checkForUpdate();
   if(!update){if(manual)Alert.alert('Sofia OS '+APP_VERSION,'Você já está na versão mais recente.');return;}
   if(!manual&&(AppState.currentState!=='active'||navigation.current.locked||lastUpdatePrompt.current===update.version))return;
   lastUpdatePrompt.current=update.version;
   Alert.alert('Atualização disponível',`Instalada: ${APP_VERSION}\nDisponível: ${update.version}\nO Android pedirá sua confirmação para instalar.`,[{text:'Depois',style:'cancel'},{text:'Atualizar',onPress:()=>{void Linking.openURL(update.url).catch(()=>Alert.alert('Atualizações','Não foi possível abrir o instalador. Tente novamente em Ajustes.'));}}]);
  }catch(e){if(manual)Alert.alert('Atualizações',errorText(e));}
  finally{checkingUpdate.current=false;}
 },[]);
 useEffect(()=>{const a=Keyboard.addListener('keyboardDidShow',()=>setKeyboard(true)),b=Keyboard.addListener('keyboardDidHide',()=>setKeyboard(false));return()=>{a.remove();b.remove();};},[]);

 useEffect(()=>{
  if(!servicesReady||fluency==='pending')return;
  const cancel=fluency==='new'?queueOptional('atualizador',()=>void checkUpdate(false),8):scheduleIdleTask(()=>void checkUpdate(false));
  const interval=setInterval(()=>void checkUpdate(false),300000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active')void checkUpdate(false);});
  return()=>{cancel();clearInterval(interval);sub.remove();};
 },[servicesReady,checkUpdate,fluency]);
 const boot=useCallback(async()=>{if(!auth)return;setBooting(true);try{const b=await api.liveBootstrap();setBootstrap(previous=>JSON.stringify(previous)===JSON.stringify(b)?previous:b);const next=authWithBootstrap(auth,b);setAuth(next);if(JSON.stringify(auth.startup)!==JSON.stringify(next.startup))void saveAuth(next).catch(()=>{});setError('');}catch(e){setError(errorText(e));}finally{setBooting(false);}},[api,auth]);
 useEffect(()=>{if(auth&&visible&&fluency!=='pending')return queueOptional('bootstrap',()=>{void boot();},7);},[api,visible,fluency]);
 useEffect(()=>{if(!auth)return;const sub=AppState.addEventListener('change',state=>{if(state!=='active')void api.persistLaunch().catch(()=>{});});return()=>sub.remove();},[api,auth]);
 useEffect(()=>{if(!auth)return;const sub=AppState.addEventListener('change',state=>{if(state==='active'&&!locked&&visible)void boot();else if(state!=='active')void silenceVoices();});return()=>sub.remove();},[auth,locked,visible,boot]);
 // Commit the selected screen before TabPager dispatches the native jump.
 // Otherwise the first tap can expose a still-empty lazy slot for one frame.
 const switchTab=useCallback((next:Tab)=>{menuMotion.select(next);navigation.current.tab=next;setTab(next);},[]);
 const navigate=useCallback((next:Tab)=>{
  const current=navigation.current;
  if(next===current.tab){if(next==='apps'&&!current.locked){setWorkspaceReset(v=>v+1);setWorkspaceDepth(false);}return;}
  if(current.locked){pager.current?.goTo(current.tab);Alert.alert('Sua conversa','Pare a gravação ou aguarde a resposta antes de trocar de aba.');return;}
  tabHistory.current=[...tabHistory.current,current.tab].slice(-30);
  tabTap.current={tab:next,at:Date.now(),early:!!nativeRevealAt.current&&Date.now()-nativeRevealAt.current<=3000};
  switchTab(next);
  if(next==='apps'){setWorkspaceReset(v=>v+1);setWorkspaceDepth(false);}
 },[switchTab]);
 const [taskContext,setTaskContext]=useState<Task|null>(null);
 const clearTaskContext=useCallback(()=>setTaskContext(null),[]);
 useEffect(()=>setTaskContext(null),[api]);
 const discussTask=useCallback((task:Task)=>{setTaskContext(task);navigate('chat');},[navigate]);
 const openAgenda=useCallback((date:string,id?:string,create=false)=>{setAgendaTarget({date,id,create,nonce:Date.now()});navigate('agenda');},[navigate]);
 const openCapsules=useCallback(()=>{navigate('apps');setCapsulesTarget(v=>v+1);},[navigate]);
 const [monitoringTarget,setMonitoringTarget]=useState({n:0,id:''});const openMonitoring=useCallback((id?:string)=>{navigate('apps');setMonitoringTarget(v=>({n:v.n+1,id:id||''}));},[navigate]);
 const [tasksTarget,setTasksTarget]=useState(0);const openTasks=useCallback(()=>{navigate('apps');setTasksTarget(v=>v+1);},[navigate]);
 const [mailTarget,setMailTarget]=useState(0);const openMail=useCallback(()=>{navigate('apps');setMailTarget(v=>v+1);},[navigate]);
 const openMonitoringFromHome=useCallback(()=>openMonitoring(),[openMonitoring]);
 const [financeTarget,setFinanceTarget]=useState(0);const openFinance=useCallback(()=>{navigate('apps');setFinanceTarget(v=>v+1);},[navigate]);
 // Tocar num aviso leva ao lugar dele.
 const openNotice=useCallback((n:Notice)=>{const area=noticeArea(n);if(area==='Monitoramento de produtos')openMonitoring(n.entity_id);else if(area==='Finanças')openFinance();else if(area==='E-mails')openMail();else if(area==='Cápsulas')openCapsules();else if(area==='Agenda'||area==='Rotinas')navigate('agenda');else if(area==='Tarefas')navigate('home');},[openMonitoring,openFinance,openMail,openCapsules,navigate]);

 const goBack=useCallback(()=>{
  const current=navigation.current;
  if(current.locked){Alert.alert('Sua conversa','Pare a gravação ou aguarde a resposta.');return true;}
  while(tabHistory.current.length){const previous=tabHistory.current.pop()!;if(previous!==current.tab){switchTab(previous);return true;}}
  if(current.tab!=='home'&&auth){switchTab('home');return true;}return false;
 },[auth,switchTab]);
 // Android back gestures never traverse the main-menu visit history.
 // Inner page/workspace handlers still own their explicit hierarchy.
 useEffect(()=>{const s=BackHandler.addEventListener('hardwareBackPress',()=>(tab==='apps'&&workspaceDepth)||(tab==='pages'&&pagesDepth)?false:!!auth);return()=>s.remove();},[tab,workspaceDepth,pagesDepth,auth]);
 const login=useCallback(async(a:Auth)=>{await saveAuth(a);tabHistory.current=[];setAuth(a);setBootstrap(fastBootstrap(a));switchTab('home');setError('');},[switchTab]);
 const changePrefs=useCallback(async(p:Prefs)=>{await savePrefs(p);setPrefs(p);},[]);
 const logout=useCallback(async()=>{void silenceVoices();await api.discardCache();let revokeFailed=false;try{await api.logout();}catch{revokeFailed=true;}try{await forgetAuth();}catch{Alert.alert('Armazenamento','Não foi possível apagar a cópia local da sessão. Limpe os dados do aplicativo antes de compartilhar o aparelho.');}tabHistory.current=[];setAuth(null);setBootstrap(null);setLocked(false);if(revokeFailed)Alert.alert('Você saiu deste aparelho','Não foi possível confirmar a revogação no servidor. Use “Encerrar todas as sessões” no site para invalidar o acesso.');},[api]);
 const profile=useCallback((p:UserProfile)=>setBootstrap(prev=>prev?{...prev,profile:p}:prev),[]);
 const manualUpdate=useCallback(()=>checkUpdate(true),[checkUpdate]);
 const clearChat=useCallback(()=>setChatEpoch(v=>v+1),[]);
 const notificationBack=useCallback(()=>{void goBack();},[goBack]);
 return <ThemeContext.Provider value={c}><NotificationProvider api={api} onOpen={openNotice} enabled={!!auth&&!!bootstrap&&servicesReady&&fluency!=='pending'} scope={auth?.profile.email||''}><SafeAreaView style={{flex:1,backgroundColor:c.bg}} edges={['top','left','right','bottom']}><StatusBar barStyle={c===dark?'light-content':'dark-content'} backgroundColor={c.bg}/><View onStartShouldSetResponderCapture={()=>{noteFluencyInput();return false;}} onTouchStart={noteFluencyInput} onTouchMove={noteFluencyInput} style={{flex:1,width:'100%',maxWidth:760,alignSelf:'center',backgroundColor:c.bg}}>
 {!ready?<StartupHome/>:!auth?<Login onLogin={login}/>:!bootstrap?<View style={{flex:1,justifyContent:'center',padding:24,gap:14}}>{booting?<Spinner size={26}/>:null}<Text style={{fontSize:23,fontWeight:'600',color:c.text}}>Abrindo sua Sofia…</Text>{error?<ErrorBanner text={error}/>:null}<Button title="Tentar novamente" onPress={()=>void boot()} loading={booting}/><Button title="Voltar para o login" secondary onPress={()=>void logout()}/></View>:!initialDataReady?<View style={{flex:1}}><StartupHome profile={bootstrap.profile}/>{preparationError?<View style={{padding:24,gap:12}}><ErrorBanner text={preparationError}/><Button title="Tentar novamente" onPress={()=>setPrepareAttempt(n=>n+1)}/></View>:null}</View>:<><View style={{flex:1}}>
 <View style={[StyleSheet.absoluteFill,{opacity:tab==='notifications'?0:1}]} pointerEvents={tab==='notifications'?'none':'auto'} accessibilityElementsHidden={tab==='notifications'} importantForAccessibility={tab==='notifications'?'no-hide-descendants':'auto'}>
  <TabPager motion={menuMotion} ref={pager} activeTab={tab} readyTabs={mountedTabs} fluencyMode={fluency==='new'?'new':'old'} onPreviewTabs={setPreviewTabs} enabled={!gestureLocked&&!locked&&!keyboard&&tab!=='notifications'&&!(tab==='pages'&&pagesDepth)&&!(tab==='apps'&&workspaceDepth)} onSelect={navigate}>
   {initialDataReady?<DeferredScreen load={loadHome} screenProps={{launchVisible:visible,onDiscussTask:discussTask,onOpenCapsules:openCapsules,onOpenMonitoring:openMonitoringFromHome,onOpenTasks:openTasks,onGestureLock:setGestureLocked,api,bootstrap,navigate,onOpenAgenda:openAgenda,active:screenTab==='home'}}/>:<StartupHome profile={bootstrap.profile}/>}
   {<FadeSwap ready={mountedTabs.has('chat')} fallback={<ScreenSkeleton tab='chat'/>}><DeferredScreen key={'chat-'+chatEpoch} load={loadChat} screenProps={{taskContext,onClearTaskContext:clearTaskContext,api,bootstrap,enterToSend:prefs.enterToSend,autoSendVoice:prefs.autoSendVoice,onLock:setLocked,active:screenTab==='chat',onRefreshBootstrap:boot}}/></FadeSwap>}
   {<FadeSwap ready={mountedTabs.has('pages')} fallback={<ScreenSkeleton tab='pages'/>}><DeferredScreen key={bootstrap.profile.email} load={loadPages} screenProps={{api,active:screenTab==='pages',storageScope:bootstrap.profile.email,onDepthChange:setPagesDepth}}/></FadeSwap>}
   {<FadeSwap ready={mountedTabs.has('agenda')} fallback={<ScreenSkeleton tab='agenda'/>}><DeferredScreen load={loadAgenda} screenProps={{onGestureLock:setGestureLocked,api,target:agendaTarget,active:screenTab==='agenda'}}/></FadeSwap>}
   {<FadeSwap ready={mountedTabs.has('apps')} fallback={<ScreenSkeleton tab='apps'/>}><DeferredScreen load={loadWorkspace} screenProps={{onDiscussTask:discussTask,openCapsulesKey:capsulesTarget,openMonitoringKey:monitoringTarget.n,openMonitoringId:monitoringTarget.id,openFinanceKey:financeTarget,openTasksKey:tasksTarget,openMailKey:mailTarget,resetKey:workspaceReset,api,navigate,onDepthChange:setWorkspaceDepth,active:screenTab==='apps'}}/></FadeSwap>}
   {<FadeSwap ready={mountedTabs.has('profile')} fallback={<ScreenSkeleton tab='profile'/>}><DeferredScreen load={loadProfile} screenProps={{api,bootstrap,prefs,onPrefs:changePrefs,onProfile:profile,onLogout:logout,onCheckUpdate:manualUpdate,onChatHistoryCleared:clearChat}}/></FadeSwap>}
  </TabPager>
 </View>
 <View style={[StyleSheet.absoluteFill,{opacity:tab==='notifications'?1:0,backgroundColor:c.bg}]} pointerEvents={tab==='notifications'?'auto':'none'} accessibilityElementsHidden={tab!=='notifications'} importantForAccessibility={tab==='notifications'?'auto':'no-hide-descendants'}>{tab==='notifications'?<DeferredScreen load={loadNotifications} screenProps={{api,onBack:notificationBack}}/>:null}</View>
 </View>
 {!keyboard?<View nativeID="sofia-menu-bar" style={{flexDirection:'row',backgroundColor:c.surface,borderTopWidth:1,borderColor:c.line,paddingHorizontal:8,paddingTop:7,paddingBottom:4}}>{tabs.map(item=><MenuTab locked={locked} motion={menuMotion} key={item.id} item={item} selected={tab===item.id} onSelect={navigate}/>)}</View>:null}</>}
 {visible&&backgroundReady?<DeferredScreen load={loadBackgroundServices} screenProps={{api,scope:auth?.profile.email||'',enabled:!auth?false:servicesReady?true:null,preloadWhenIdle:screenTab==='home',onCapsules:openCapsules,onAgenda:openAgenda}}/>:null}</View></SafeAreaView></NotificationProvider></ThemeContext.Provider>;
}
const launchPreparation=createLaunchPreparation(()=>prepareLocalLaunch(readAuth,readPrefs,startupSnapshotFor));
export function prepareStartup(){launchPreparation.prime();}
function LocalLaunchGate(){
 const [startup,setStartup]=useState<LocalLaunch|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;setError('');void launchPreparation.take().then(value=>{if(live)setStartup(value);}).catch(e=>{if(live)setError(errorText(e));});return()=>{live=false;};},[attempt]);
 // Do not display a wrongly-themed/empty dashboard before local reads resolve.
 if(!startup)return error?<View nativeID="sofia-launch-error" style={{flex:1,padding:24,justifyContent:'center',backgroundColor:'#F7F6FA'}}><ErrorBanner text={error}/><Button title="Tentar novamente" onPress={()=>setAttempt(n=>n+1)}/></View>:null;
 return <Shell startup={startup}/>;
}
export default function App(){return <AppBoundary><SafeAreaProvider initialMetrics={initialWindowMetrics}><LocalLaunchGate/></SafeAreaProvider></AppBoundary>;}
