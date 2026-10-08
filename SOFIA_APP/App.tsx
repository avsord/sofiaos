import {prepareLocalLaunch} from './src/lib/local-launch';
import type {LocalLaunch} from './src/lib/local-launch';
import {prepareInitialData} from './src/lib/startup-preparation';
import {useAfterFirstPaint} from './src/lib/use-after-first-paint';
import {preloadAgenda} from './src/lib/use-agenda-month';
import React,{Component,ErrorInfo,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,StatusBar,ActivityIndicator,AccessibilityInfo,useColorScheme,AppState,Alert,Keyboard,BackHandler,Linking,StyleSheet} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {SofiaApi,readAuth,saveAuth,forgetAuth,readPrefs,savePrefs,startupSnapshotFor} from './src/lib/api';
import type {Auth,Bootstrap,Prefs,Tab,Task,Profile as UserProfile} from './src/lib/types';
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
import {NotificationProvider} from './src/components/NotificationCenter';
import {createMenuMotion} from './src/lib/menu-motion';
import type {TabPagerHandle} from './src/components/TabPager';
import {useStartupMounts} from './src/lib/startup-mounts';
import {DeferredScreen,loadAgenda,loadChat,loadHome,loadNotifications,loadPages,loadProfile,loadWorkspace,loadBackgroundServices} from './src/lib/screen-loader';
import {Login} from './src/screens/Login';
import {APP_VERSION,checkForUpdate} from './src/lib/update';
import {finishLaunchHandoff} from './src/lib/launch-handoff';

const tabs:{id:Tab;label:string;icon:IconName}[]=[{id:'home',label:'Início',icon:'home'},{id:'chat',label:'Conversa',icon:'chat'},{id:'pages',label:'Páginas',icon:'book'},{id:'agenda',label:'Agenda',icon:'calendar'},{id:'apps',label:'Apps',icon:'grid'},{id:'profile',label:'Perfil',icon:'user'}];
class AppBoundary extends Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(_e:Error,_info:ErrorInfo){/* No personal data in logs. */}
 render(){return this.state.failed?<View nativeID="sofia-launch-error" style={{flex:1,backgroundColor:'#F7F6FA',padding:30,justifyContent:'center'}}><Text style={{fontSize:25,fontWeight:'700',color:'#272334'}}>Vamos reabrir a Sofia.</Text><Text style={{marginTop:16,lineHeight:23,color:'#7F7A8D'}}>O aplicativo encontrou um problema. Feche e abra novamente. Mensagens ainda não enviadas podem precisar ser refeitas.</Text></View>:this.props.children;}
}
function Shell({startup}:{startup:LocalLaunch}){
 const system=useColorScheme(),[ready]=useState(true),[auth,setAuth]=useState<Auth|null>(startup.auth),[bootstrap,setBootstrap]=useState<Bootstrap|null>(()=>startup.auth?fastBootstrap(startup.auth):null),[prefs,setPrefs]=useState<Prefs>(startup.prefs||{appearance:'schedule',enterToSend:false,autoSendVoice:true,lightAt:'05:00',darkAt:'19:00'}),[error,setError]=useState(''),[tab,setTab]=useState<Tab>('home'),[locked,setLocked]=useState(false),[booting,setBooting]=useState(false),[keyboard,setKeyboard]=useState(false),[workspaceDepth,setWorkspaceDepth]=useState(false),[workspaceReset,setWorkspaceReset]=useState(0),[capsulesTarget,setCapsulesTarget]=useState(0),[gestureLocked,setGestureLocked]=useState(false),[pagesDepth,setPagesDepth]=useState(false),[chatEpoch,setChatEpoch]=useState(0);
 const [agendaTarget,setAgendaTarget]=useState<{date:string;id?:string;create?:boolean;nonce:number}>({date:'',nonce:0});
 const tabHistory=useRef<Tab[]>([]),pager=useRef<TabPagerHandle>(null),navigation=useRef({tab,locked});
 navigation.current={tab,locked};
 const screenTab=tab;
 const menuMotion=useMemo(()=>createMenuMotion('home'),[]);
 useEffect(()=>{let mounted=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(mounted)menuMotion.setReducedMotion(value);}).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>menuMotion.setReducedMotion(value));return()=>{mounted=false;sub.remove();menuMotion.dispose();};},[menuMotion]);
 const [themeClock,setThemeClock]=useState(()=>new Date());
 useEffect(()=>{const update=()=>setThemeClock(previous=>{const now=new Date();return now.getHours()!==previous.getHours()||now.getMinutes()!==previous.getMinutes()?now:previous;}),timer=setInterval(update,1000),sub=AppState.addEventListener('change',state=>{if(state==='active')update();});return()=>{clearInterval(timer);sub.remove();};},[]);
 const c=themeAppearance(prefs,system,themeClock)==='dark'?dark:light;
 const expired=useCallback(()=>{tabHistory.current=[];setAuth(null);setBootstrap(null);setLocked(false);void forgetAuth().catch(()=>{});},[]);
 const api=useMemo(()=>new SofiaApi(auth?.token||'',expired,auth?.profile?.email||'anonymous',auth?.token===startup.auth?.token?startup.snapshot||undefined:undefined).deferNetworkUntilPaint(),[auth?.token,auth?.profile?.email,expired]);
 const [prepared,setPrepared]=useState<SofiaApi|null>(()=>startup.auth&&startup.snapshot?api:null),[preparationError,setPreparationError]=useState(''),[prepareAttempt,setPrepareAttempt]=useState(0);
 const initialDataReady=prepared===api;
 const painted=useAfterFirstPaint(ready),servicesReady=painted&&!!auth&&!!bootstrap&&initialDataReady,mountedTabs=useStartupMounts(servicesReady,tab);
 useEffect(()=>{if(!auth||initialDataReady)return;let live=true;setPreparationError('');void prepareInitialData(api,()=>preloadAgenda(api)).then(()=>{if(live){setPrepared(api);console.info('SOFIA_STARTUP_CACHE_READY');}}).catch(e=>{if(live)setPreparationError(errorText(e));});return()=>{live=false;};},[api,prepareAttempt]);
 useEffect(()=>{if(painted)api.releaseNetwork();},[painted,api]);
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
  if(!servicesReady)return;
  void checkUpdate(false);
  const interval=setInterval(()=>void checkUpdate(false),300000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active')void checkUpdate(false);});
  return()=>{clearInterval(interval);sub.remove();};
 },[servicesReady,checkUpdate]);
 const boot=useCallback(async()=>{if(!auth)return;setBooting(true);try{const b=await api.liveBootstrap();setBootstrap(previous=>JSON.stringify(previous)===JSON.stringify(b)?previous:b);const next=authWithBootstrap(auth,b);setAuth(next);if(JSON.stringify(auth.startup)!==JSON.stringify(next.startup))void saveAuth(next).catch(()=>{});setError('');}catch(e){setError(errorText(e));}finally{setBooting(false);}},[api,auth]);
 useEffect(()=>{if(auth)void boot();},[api]);
 useEffect(()=>{if(!auth)return;const sub=AppState.addEventListener('change',state=>{if(state==='active'&&!locked)void boot();else if(state!=='active')void silenceVoices();});return()=>sub.remove();},[auth,locked,boot]);
 // Issue the native, non-animated jump before React updates the selected menu.
 const switchTab=useCallback((next:Tab)=>{navigation.current.tab=next;pager.current?.goTo(next);setTab(next);},[]);
 const navigate=useCallback((next:Tab)=>{
  const current=navigation.current;
  if(next===current.tab){if(next==='apps'&&!current.locked){setWorkspaceReset(v=>v+1);setWorkspaceDepth(false);}return;}
  if(current.locked){pager.current?.goTo(current.tab);Alert.alert('Sua conversa','Pare a gravação ou aguarde a resposta antes de trocar de aba.');return;}
  tabHistory.current=[...tabHistory.current,current.tab].slice(-30);switchTab(next);
  if(next==='apps'){setWorkspaceReset(v=>v+1);setWorkspaceDepth(false);}
 },[switchTab]);
 const [taskContext,setTaskContext]=useState<Task|null>(null);
 const clearTaskContext=useCallback(()=>setTaskContext(null),[]);
 useEffect(()=>setTaskContext(null),[api]);
 const discussTask=useCallback((task:Task)=>{setTaskContext(task);navigate('chat');},[navigate]);
 const openAgenda=useCallback((date:string,id?:string,create=false)=>{setAgendaTarget({date,id,create,nonce:Date.now()});navigate('agenda');},[navigate]);
 const openCapsules=useCallback(()=>{navigate('apps');setCapsulesTarget(v=>v+1);},[navigate]);

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
 return <ThemeContext.Provider value={c}><NotificationProvider api={api} enabled={!!auth&&!!bootstrap&&servicesReady} scope={auth?.profile.email||''}><SafeAreaView style={{flex:1,backgroundColor:c.bg}} edges={['top','left','right','bottom']}><StatusBar barStyle={c===dark?'light-content':'dark-content'} backgroundColor={c.bg}/><View style={{flex:1,width:'100%',maxWidth:760,alignSelf:'center',backgroundColor:c.bg}}>
 {!ready?<StartupHome/>:!auth?<Login onLogin={login}/>:!bootstrap?<View style={{flex:1,justifyContent:'center',padding:24,gap:14}}>{booting?<ActivityIndicator color={c.accent}/>:null}<Text style={{fontSize:23,fontWeight:'600',color:c.text}}>Abrindo sua Sofia…</Text>{error?<ErrorBanner text={error}/>:null}<Button title="Tentar novamente" onPress={()=>void boot()} loading={booting}/><Button title="Voltar para o login" secondary onPress={()=>void logout()}/></View>:!initialDataReady?<View style={{flex:1}}><StartupHome profile={bootstrap.profile}/>{preparationError?<View style={{padding:24,gap:12}}><ErrorBanner text={preparationError}/><Button title="Tentar novamente" onPress={()=>setPrepareAttempt(n=>n+1)}/></View>:null}</View>:<><View style={{flex:1}}>
 <View style={[StyleSheet.absoluteFill,{opacity:tab==='notifications'?0:1}]} pointerEvents={tab==='notifications'?'none':'auto'} accessibilityElementsHidden={tab==='notifications'} importantForAccessibility={tab==='notifications'?'no-hide-descendants':'auto'}>
  <TabPager motion={menuMotion} ref={pager} activeTab={tab} enabled={!gestureLocked&&!locked&&!keyboard&&tab!=='notifications'&&!(tab==='pages'&&pagesDepth)&&!(tab==='apps'&&workspaceDepth)} onSelect={navigate}>
   {initialDataReady?<DeferredScreen load={loadHome} screenProps={{onDiscussTask:discussTask,onOpenCapsules:openCapsules,onGestureLock:setGestureLocked,api,bootstrap,navigate,onOpenAgenda:openAgenda,active:screenTab==='home'}}/>:<StartupHome profile={bootstrap.profile}/>}
   {mountedTabs.has('chat')?<DeferredScreen key={'chat-'+chatEpoch} load={loadChat} screenProps={{taskContext,onClearTaskContext:clearTaskContext,api,bootstrap,enterToSend:prefs.enterToSend,autoSendVoice:prefs.autoSendVoice,onLock:setLocked,active:screenTab==='chat',onRefreshBootstrap:boot}}/>:<View style={{flex:1}}/>}
   {mountedTabs.has('pages')?<DeferredScreen key={bootstrap.profile.email} load={loadPages} screenProps={{api,active:screenTab==='pages',storageScope:bootstrap.profile.email,onDepthChange:setPagesDepth}}/>:<View style={{flex:1}}/>}
   {mountedTabs.has('agenda')?<DeferredScreen load={loadAgenda} screenProps={{onGestureLock:setGestureLocked,api,target:agendaTarget,active:screenTab==='agenda'}}/>:<View style={{flex:1}}/>}
   {mountedTabs.has('apps')?<DeferredScreen load={loadWorkspace} screenProps={{onDiscussTask:discussTask,openCapsulesKey:capsulesTarget,resetKey:workspaceReset,api,navigate,onDepthChange:setWorkspaceDepth,active:screenTab==='apps'}}/>:<View style={{flex:1}}/>}
   {mountedTabs.has('profile')?<DeferredScreen load={loadProfile} screenProps={{api,bootstrap,prefs,onPrefs:changePrefs,onProfile:profile,onLogout:logout,onCheckUpdate:manualUpdate,onChatHistoryCleared:clearChat}}/>:<View style={{flex:1}}/>}
  </TabPager>
 </View>
 <View style={[StyleSheet.absoluteFill,{opacity:tab==='notifications'?1:0,backgroundColor:c.bg}]} pointerEvents={tab==='notifications'?'auto':'none'} accessibilityElementsHidden={tab!=='notifications'} importantForAccessibility={tab==='notifications'?'auto':'no-hide-descendants'}>{tab==='notifications'?<DeferredScreen load={loadNotifications} screenProps={{api,onBack:notificationBack}}/>:null}</View>
 </View>
 {!keyboard?<View nativeID="sofia-menu-bar" style={{flexDirection:'row',backgroundColor:c.surface,borderTopWidth:1,borderColor:c.line,paddingHorizontal:8,paddingTop:7,paddingBottom:4}}>{tabs.map(item=><MenuTab locked={locked} motion={menuMotion} key={item.id} item={item} selected={tab===item.id} onSelect={navigate}/>)}</View>:null}</>}
 {painted?<DeferredScreen load={loadBackgroundServices} screenProps={{api,scope:auth?.profile.email||'',enabled:!auth?false:servicesReady?true:null,onCapsules:openCapsules,onAgenda:openAgenda}}/>:null}</View></SafeAreaView></NotificationProvider></ThemeContext.Provider>;
}
function LocalLaunchGate(){
 const [startup,setStartup]=useState<LocalLaunch|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;setError('');void prepareLocalLaunch(readAuth,readPrefs,startupSnapshotFor).then(value=>{if(live)setStartup(value);}).catch(e=>{if(live)setError(errorText(e));});return()=>{live=false;};},[attempt]);
 // Do not display a wrongly-themed/empty dashboard before local reads resolve.
 if(!startup)return error?<View nativeID="sofia-launch-error" style={{flex:1,padding:24,justifyContent:'center',backgroundColor:'#F7F6FA'}}><ErrorBanner text={error}/><Button title="Tentar novamente" onPress={()=>setAttempt(n=>n+1)}/></View>:null;
 return <Shell startup={startup}/>;
}
export default function App(){return <AppBoundary><SafeAreaProvider><LocalLaunchGate/></SafeAreaProvider></AppBoundary>;}
