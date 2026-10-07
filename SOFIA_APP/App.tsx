import {useAfterFirstPaint} from './src/lib/use-after-first-paint';
import {preloadAgenda} from './src/lib/use-agenda-month';
import {useCapsuleNotifications} from './src/lib/capsule-notifications';
import {useAgendaNotifications} from './src/lib/agenda-notifications';
import React,{Component,ErrorInfo,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,StatusBar,ActivityIndicator,AccessibilityInfo,useColorScheme,AppState,Alert,Keyboard,BackHandler,Linking,StyleSheet} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {SofiaApi,readAuth,saveAuth,forgetAuth,readPrefs,savePrefs} from './src/lib/api';
import type {Auth,Bootstrap,Prefs,Tab,Task,Profile as UserProfile} from './src/lib/types';
import {themeAppearance} from './src/lib/theme-schedule';
import {ThemeContext,light,dark} from './src/lib/theme';
import {errorText} from './src/lib/chat-model';
import {silenceVoices} from './src/lib/audio-focus';
import {Icon,IconName} from './src/components/Icon';
import {Button,ErrorBanner} from './src/components/UI';
import {TabPager} from './src/components/TabPager';
import {MenuTab} from './src/components/MenuTab';
import {NotificationProvider} from './src/components/NotificationCenter';
import {createMenuMotion} from './src/lib/menu-motion';
import type {TabPagerHandle} from './src/components/TabPager';
import {Login} from './src/screens/Login';
import {Home as HomeScreen} from './src/screens/Home';
import {Chat as ChatScreen} from './src/screens/Chat';
import {Agenda as AgendaScreen} from './src/screens/Agenda';
import {Notifications as NotificationsScreen} from './src/screens/Notifications';
import {Profile as ProfileScreen} from './src/screens/Profile';
import {Workspace as WorkspaceScreen} from './src/screens/Workspace';
import {Pages as PagesScreen} from './src/screens/Pages';
import {APP_VERSION,checkForUpdate} from './src/lib/update';

// Keep screen instances and unchanged screen trees across menu taps and swipes.
const Home=React.memo(HomeScreen),Chat=React.memo(ChatScreen),Agenda=React.memo(AgendaScreen),Notifications=React.memo(NotificationsScreen),Profile=React.memo(ProfileScreen),Workspace=React.memo(WorkspaceScreen),Pages=React.memo(PagesScreen);
const tabs:{id:Tab;label:string;icon:IconName}[]=[{id:'home',label:'Início',icon:'home'},{id:'chat',label:'Conversa',icon:'chat'},{id:'pages',label:'Páginas',icon:'book'},{id:'agenda',label:'Agenda',icon:'calendar'},{id:'apps',label:'Apps',icon:'grid'},{id:'profile',label:'Perfil',icon:'user'}];
class AppBoundary extends Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(_e:Error,_info:ErrorInfo){/* No personal data in logs. */}
 render(){return this.state.failed?<View style={{flex:1,backgroundColor:'#F7F6FA',padding:30,justifyContent:'center'}}><Text style={{fontSize:25,fontWeight:'700',color:'#272334'}}>Vamos reabrir a Sofia.</Text><Text style={{marginTop:16,lineHeight:23,color:'#7F7A8D'}}>O aplicativo encontrou um problema. Feche e abra novamente. Mensagens ainda não enviadas podem precisar ser refeitas.</Text></View>:this.props.children;}
}
function Shell(){
 const system=useColorScheme(),[ready,setReady]=useState(false),[auth,setAuth]=useState<Auth|null>(null),[bootstrap,setBootstrap]=useState<Bootstrap|null>(null),[prefs,setPrefs]=useState<Prefs>({appearance:'schedule',enterToSend:false,autoSendVoice:true,lightAt:'05:00',darkAt:'19:00'}),[error,setError]=useState(''),[tab,setTab]=useState<Tab>('home'),[locked,setLocked]=useState(false),[booting,setBooting]=useState(false),[keyboard,setKeyboard]=useState(false),[workspaceDepth,setWorkspaceDepth]=useState(false),[workspaceReset,setWorkspaceReset]=useState(0),[capsulesTarget,setCapsulesTarget]=useState(0),[gestureLocked,setGestureLocked]=useState(false),[pagesDepth,setPagesDepth]=useState(false),[chatEpoch,setChatEpoch]=useState(0);
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
 const api=useMemo(()=>new SofiaApi(auth?.token||'',expired,auth?.profile?.email||'anonymous'),[auth?.token,auth?.profile?.email,expired]);
 useEffect(()=>{if(!auth)return;let live=true;void api.hydrate().then(()=>{if(!live)return;const saved=api.cached<Bootstrap>('/bootstrap');if(saved&&saved.profile?.email?.toLowerCase()===auth.profile.email.toLowerCase()){setBootstrap(saved);console.info('SOFIA_STARTUP_CACHE_READY');}void api.preload(()=>preloadAgenda(api));});return()=>{live=false;};},[api,auth?.token]);
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
 useEffect(()=>{let active=true;Promise.all([readAuth(),readPrefs()]).then(([a,p])=>{if(active){setAuth(a);setPrefs(p);}}).catch(e=>{if(active)setError(errorText(e));}).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[]);
 useEffect(()=>{
  if(!ready)return;
  void checkUpdate(false);
  const interval=setInterval(()=>void checkUpdate(false),300000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active')void checkUpdate(false);});
  return()=>{clearInterval(interval);sub.remove();};
 },[ready,checkUpdate]);
 const boot=useCallback(async()=>{if(!auth)return;setBooting(true);try{await api.hydrate();const b=await api.liveBootstrap();setBootstrap(previous=>JSON.stringify(previous)===JSON.stringify(b)?previous:b);setError('');}catch(e){setError(errorText(e));}finally{setBooting(false);}},[api,auth]);
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
 const servicesReady=useAfterFirstPaint(!!auth&&!!bootstrap);
 useCapsuleNotifications(api,auth?.profile.email||'',!auth&&ready?false:servicesReady?true:null,openCapsules);
 useAgendaNotifications(api,auth?.profile.email||'',!auth&&ready?false:servicesReady?true:null,openAgenda);
 const goBack=useCallback(()=>{
  const current=navigation.current;
  if(current.locked){Alert.alert('Sua conversa','Pare a gravação ou aguarde a resposta.');return true;}
  while(tabHistory.current.length){const previous=tabHistory.current.pop()!;if(previous!==current.tab){switchTab(previous);return true;}}
  if(current.tab!=='home'&&auth){switchTab('home');return true;}return false;
 },[auth,switchTab]);
 // Android back gestures never traverse the main-menu visit history.
 // Inner page/workspace handlers still own their explicit hierarchy.
 useEffect(()=>{const s=BackHandler.addEventListener('hardwareBackPress',()=>(tab==='apps'&&workspaceDepth)||(tab==='pages'&&pagesDepth)?false:!!auth);return()=>s.remove();},[tab,workspaceDepth,pagesDepth,auth]);
 const login=useCallback(async(a:Auth)=>{await saveAuth(a);tabHistory.current=[];setAuth(a);switchTab('home');setError('');},[switchTab]);
 const changePrefs=useCallback(async(p:Prefs)=>{await savePrefs(p);setPrefs(p);},[]);
 const logout=useCallback(async()=>{void silenceVoices();await api.discardCache();let revokeFailed=false;try{await api.logout();}catch{revokeFailed=true;}try{await forgetAuth();}catch{Alert.alert('Armazenamento','Não foi possível apagar a cópia local da sessão. Limpe os dados do aplicativo antes de compartilhar o aparelho.');}tabHistory.current=[];setAuth(null);setBootstrap(null);setLocked(false);if(revokeFailed)Alert.alert('Você saiu deste aparelho','Não foi possível confirmar a revogação no servidor. Use “Encerrar todas as sessões” no site para invalidar o acesso.');},[api]);
 const profile=useCallback((p:UserProfile)=>setBootstrap(prev=>prev?{...prev,profile:p}:prev),[]);
 const manualUpdate=useCallback(()=>checkUpdate(true),[checkUpdate]);
 const clearChat=useCallback(()=>setChatEpoch(v=>v+1),[]);
 const notificationBack=useCallback(()=>{void goBack();},[goBack]);
 return <ThemeContext.Provider value={c}><NotificationProvider api={api} enabled={!!auth&&!!bootstrap} scope={auth?.profile.email||''}><SafeAreaView style={{flex:1,backgroundColor:c.bg}} edges={['top','left','right','bottom']}><StatusBar barStyle={c===dark?'light-content':'dark-content'} backgroundColor={c.bg}/><View style={{flex:1,width:'100%',maxWidth:760,alignSelf:'center',backgroundColor:c.bg}}>
 {!ready?<View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:!auth?<Login onLogin={login}/>:!bootstrap?<View style={{flex:1,justifyContent:'center',padding:24,gap:14}}>{booting?<ActivityIndicator color={c.accent}/>:null}<Text style={{fontSize:23,fontWeight:'600',color:c.text}}>Abrindo sua Sofia…</Text>{error?<ErrorBanner text={error}/>:null}<Button title="Tentar novamente" onPress={()=>void boot()} loading={booting}/><Button title="Voltar para o login" secondary onPress={()=>void logout()}/></View>:<><View style={{flex:1}}>
 <View style={[StyleSheet.absoluteFill,{opacity:tab==='notifications'?0:1}]} pointerEvents={tab==='notifications'?'none':'auto'} accessibilityElementsHidden={tab==='notifications'} importantForAccessibility={tab==='notifications'?'no-hide-descendants':'auto'}>
  <TabPager motion={menuMotion} ref={pager} activeTab={tab} enabled={!gestureLocked&&!locked&&!keyboard&&tab!=='notifications'&&!(tab==='pages'&&pagesDepth)&&!(tab==='apps'&&workspaceDepth)} onSelect={navigate}>
   <Home onDiscussTask={discussTask} onOpenCapsules={openCapsules} onGestureLock={setGestureLocked} api={api} bootstrap={bootstrap} navigate={navigate} onOpenAgenda={openAgenda} active={screenTab==='home'}/>
   <Chat taskContext={taskContext} onClearTaskContext={clearTaskContext} key={'chat-'+chatEpoch} api={api} bootstrap={bootstrap} enterToSend={prefs.enterToSend} autoSendVoice={prefs.autoSendVoice} onLock={setLocked} active={screenTab==='chat'} onRefreshBootstrap={boot}/>
   <Pages key={bootstrap.profile.email} api={api} active={screenTab==='pages'} storageScope={bootstrap.profile.email} onDepthChange={setPagesDepth}/>
   <Agenda onGestureLock={setGestureLocked} api={api} target={agendaTarget} active={screenTab==='agenda'}/>
   <Workspace onDiscussTask={discussTask} openCapsulesKey={capsulesTarget} resetKey={workspaceReset} api={api} navigate={navigate} onDepthChange={setWorkspaceDepth} active={screenTab==='apps'}/>
   <Profile api={api} bootstrap={bootstrap} prefs={prefs} onPrefs={changePrefs} onProfile={profile} onLogout={logout} onCheckUpdate={manualUpdate} onChatHistoryCleared={clearChat}/>
  </TabPager>
 </View>
 <View style={[StyleSheet.absoluteFill,{opacity:tab==='notifications'?1:0,backgroundColor:c.bg}]} pointerEvents={tab==='notifications'?'auto':'none'} accessibilityElementsHidden={tab!=='notifications'} importantForAccessibility={tab==='notifications'?'auto':'no-hide-descendants'}><Notifications api={api} onBack={notificationBack}/></View>
 </View>
 {!keyboard?<View nativeID="sofia-menu-bar" style={{flexDirection:'row',backgroundColor:c.surface,borderTopWidth:1,borderColor:c.line,paddingHorizontal:8,paddingTop:7,paddingBottom:4}}>{tabs.map(item=><MenuTab locked={locked} motion={menuMotion} key={item.id} item={item} selected={tab===item.id} onSelect={navigate}/>)}</View>:null}</>}
 </View></SafeAreaView></NotificationProvider></ThemeContext.Provider>;
}
export default function App(){return <AppBoundary><SafeAreaProvider><Shell/></SafeAreaProvider></AppBoundary>;}
