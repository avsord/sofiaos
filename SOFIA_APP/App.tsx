import React,{Component,ErrorInfo,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,Pressable,StatusBar,ActivityIndicator,useColorScheme,AppState,Alert,Keyboard,BackHandler,Linking,StyleSheet} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {SofiaApi,readAuth,saveAuth,forgetAuth,readPrefs,savePrefs} from './src/lib/api';
import type {Auth,Bootstrap,Prefs,Tab,Profile as UserProfile} from './src/lib/types';
import {ThemeContext,light,dark} from './src/lib/theme';
import {errorText} from './src/lib/chat-model';
import {silenceVoices} from './src/lib/audio-focus';
import {Icon,IconName} from './src/components/Icon';
import {Button,ErrorBanner} from './src/components/UI';
import {TabPager} from './src/components/TabPager';
import type {TabPagerHandle} from './src/components/TabPager';
import {Login} from './src/screens/Login';
import {Home as HomeScreen} from './src/screens/Home';
import {Chat as ChatScreen} from './src/screens/Chat';
import {Agenda as AgendaScreen} from './src/screens/Agenda';
import {Notifications as NotificationsScreen} from './src/screens/Notifications';
import {Profile as ProfileScreen} from './src/screens/Profile';
import {Workspace as WorkspaceScreen} from './src/screens/Workspace';
import {Pages as PagesScreen} from './src/screens/Pages';
import {checkForUpdate} from './src/lib/update';

// Keep screen instances and unchanged screen trees across menu taps and swipes.
const Home=React.memo(HomeScreen),Chat=React.memo(ChatScreen),Agenda=React.memo(AgendaScreen),Notifications=React.memo(NotificationsScreen),Profile=React.memo(ProfileScreen),Workspace=React.memo(WorkspaceScreen),Pages=React.memo(PagesScreen);
const tabs:{id:Tab;label:string;icon:IconName}[]=[{id:'home',label:'Início',icon:'home'},{id:'chat',label:'Conversa',icon:'chat'},{id:'pages',label:'Páginas',icon:'book'},{id:'agenda',label:'Agenda',icon:'calendar'},{id:'apps',label:'Apps',icon:'grid'},{id:'profile',label:'Perfil',icon:'user'}];
class AppBoundary extends Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(_e:Error,_info:ErrorInfo){/* No personal data in logs. */}
 render(){return this.state.failed?<View style={{flex:1,backgroundColor:'#F7F6FA',padding:30,justifyContent:'center'}}><Text style={{fontSize:25,fontWeight:'700',color:'#272334'}}>Vamos reabrir a Sofia.</Text><Text style={{marginTop:16,lineHeight:23,color:'#7F7A8D'}}>O aplicativo encontrou um problema. Feche e abra novamente. Mensagens ainda não enviadas podem precisar ser refeitas.</Text></View>:this.props.children;}
}
function Shell(){
 const system=useColorScheme(),[ready,setReady]=useState(false),[auth,setAuth]=useState<Auth|null>(null),[bootstrap,setBootstrap]=useState<Bootstrap|null>(null),[prefs,setPrefs]=useState<Prefs>({appearance:'system',enterToSend:false,autoSendVoice:true}),[error,setError]=useState(''),[tab,setTab]=useState<Tab>('chat'),[locked,setLocked]=useState(false),[booting,setBooting]=useState(false),[keyboard,setKeyboard]=useState(false),[workspaceDepth,setWorkspaceDepth]=useState(false),[chatEpoch,setChatEpoch]=useState(0);
 const tabHistory=useRef<Tab[]>([]),pager=useRef<TabPagerHandle>(null),navigation=useRef({tab,locked});
 navigation.current={tab,locked};
 const c=prefs.appearance==='dark'||(prefs.appearance==='system'&&system==='dark')?dark:light;
 const expired=useCallback(()=>{tabHistory.current=[];setAuth(null);setBootstrap(null);setLocked(false);void forgetAuth().catch(()=>{});},[]);
 const api=useMemo(()=>new SofiaApi(auth?.token||'',expired),[auth?.token,expired]);
 const checkUpdate=useCallback(async(manual=false)=>{try{const update=await checkForUpdate();if(!update){if(manual)Alert.alert('Sofia OS','Você já está na versão mais recente.');return;}Alert.alert('Atualização disponível',`Sofia OS ${update.version} está disponível. O Android pedirá sua confirmação para instalar.`,[{text:'Depois',style:'cancel'},{text:'Atualizar',onPress:()=>{void Linking.openURL(update.url);}}]);}catch{if(manual)Alert.alert('Atualizações','Não foi possível verificar atualizações agora.');}},[]);
 useEffect(()=>{const a=Keyboard.addListener('keyboardDidShow',()=>setKeyboard(true)),b=Keyboard.addListener('keyboardDidHide',()=>setKeyboard(false));return()=>{a.remove();b.remove();};},[]);
 useEffect(()=>{let active=true;Promise.all([readAuth(),readPrefs()]).then(([a,p])=>{if(active){setAuth(a);setPrefs(p);}}).catch(e=>{if(active)setError(errorText(e));}).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[]);
 useEffect(()=>{if(ready)void checkUpdate(false);},[ready,checkUpdate]);
 const boot=useCallback(async()=>{if(!auth)return;setBooting(true);try{const b=await api.bootstrap();setBootstrap(b);setError('');}catch(e){setError(errorText(e));}finally{setBooting(false);}},[api,auth]);
 useEffect(()=>{if(auth)void boot();},[api]);
 useEffect(()=>{if(!auth)return;const sub=AppState.addEventListener('change',state=>{if(state==='active'&&!locked)void boot();else if(state!=='active')void silenceVoices();});return()=>sub.remove();},[auth,locked,boot]);
 // Issue the native, non-animated jump before React updates the selected menu.
 const switchTab=useCallback((next:Tab)=>{navigation.current.tab=next;pager.current?.goTo(next);setTab(next);},[]);
 const navigate=useCallback((next:Tab)=>{
  const current=navigation.current;
  if(next===current.tab)return;
  if(current.locked){pager.current?.goTo(current.tab);Alert.alert('Sua conversa','Pare a gravação ou aguarde a resposta antes de trocar de aba.');return;}
  tabHistory.current=[...tabHistory.current,current.tab].slice(-30);switchTab(next);
 },[switchTab]);
 const goBack=useCallback(()=>{
  const current=navigation.current;
  if(current.locked){Alert.alert('Sua conversa','Pare a gravação ou aguarde a resposta.');return true;}
  while(tabHistory.current.length){const previous=tabHistory.current.pop()!;if(previous!==current.tab){switchTab(previous);return true;}}
  if(current.tab!=='home'&&auth){switchTab('home');return true;}return false;
 },[auth,switchTab]);
 useEffect(()=>{const s=BackHandler.addEventListener('hardwareBackPress',()=>tab==='apps'&&workspaceDepth?false:goBack());return()=>s.remove();},[tab,workspaceDepth,goBack]);
 const login=useCallback(async(a:Auth)=>{await saveAuth(a);tabHistory.current=[];setAuth(a);switchTab('chat');setError('');},[switchTab]);
 const changePrefs=useCallback(async(p:Prefs)=>{await savePrefs(p);setPrefs(p);},[]);
 const logout=useCallback(async()=>{void silenceVoices();let revokeFailed=false;try{await api.logout();}catch{revokeFailed=true;}try{await forgetAuth();}catch{Alert.alert('Armazenamento','Não foi possível apagar a cópia local da sessão. Limpe os dados do aplicativo antes de compartilhar o aparelho.');}tabHistory.current=[];setAuth(null);setBootstrap(null);setLocked(false);if(revokeFailed)Alert.alert('Você saiu deste aparelho','Não foi possível confirmar a revogação no servidor. Use “Encerrar todas as sessões” no site para invalidá-la antes da expiração.');},[api]);
 const profile=useCallback((p:UserProfile)=>setBootstrap(prev=>prev?{...prev,profile:p}:prev),[]);
 const manualUpdate=useCallback(()=>checkUpdate(true),[checkUpdate]);
 const clearChat=useCallback(()=>setChatEpoch(v=>v+1),[]);
 const notificationBack=useCallback(()=>{void goBack();},[goBack]);
 return <ThemeContext.Provider value={c}><SafeAreaView style={{flex:1,backgroundColor:c.bg}} edges={['top','left','right','bottom']}><StatusBar barStyle={c===dark?'light-content':'dark-content'} backgroundColor={c.bg}/><View style={{flex:1,width:'100%',maxWidth:760,alignSelf:'center',backgroundColor:c.bg}}>
 {!ready?<View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:!auth?<Login onLogin={login}/>:!bootstrap?<View style={{flex:1,justifyContent:'center',padding:24,gap:14}}>{booting?<ActivityIndicator color={c.accent}/>:null}<Text style={{fontSize:23,fontWeight:'600',color:c.text}}>Abrindo sua Sofia…</Text>{error?<ErrorBanner text={error}/>:null}<Button title="Tentar novamente" onPress={()=>void boot()} loading={booting}/><Button title="Voltar para o login" secondary onPress={()=>void logout()}/></View>:<><View style={{flex:1}}>
 <View style={[StyleSheet.absoluteFill,{opacity:tab==='notifications'?0:1}]} pointerEvents={tab==='notifications'?'none':'auto'} accessibilityElementsHidden={tab==='notifications'} importantForAccessibility={tab==='notifications'?'no-hide-descendants':'auto'}>
  <TabPager ref={pager} activeTab={tab} enabled={!locked&&!keyboard&&tab!=='notifications'} onSelect={navigate}>
   <Home api={api} bootstrap={bootstrap} navigate={navigate}/>
   <Chat key={'chat-'+chatEpoch} api={api} bootstrap={bootstrap} enterToSend={prefs.enterToSend} autoSendVoice={prefs.autoSendVoice} onLock={setLocked} active={tab==='chat'} onRefreshBootstrap={boot}/>
   <Pages api={api} active={tab==='pages'}/>
   <Agenda api={api}/>
   <Workspace api={api} navigate={navigate} onDepthChange={setWorkspaceDepth} active={tab==='apps'}/>
   <Profile api={api} bootstrap={bootstrap} prefs={prefs} onPrefs={changePrefs} onProfile={profile} onLogout={logout} onCheckUpdate={manualUpdate} onChatHistoryCleared={clearChat}/>
  </TabPager>
 </View>
 <View style={[StyleSheet.absoluteFill,{opacity:tab==='notifications'?1:0,backgroundColor:c.bg}]} pointerEvents={tab==='notifications'?'auto':'none'} accessibilityElementsHidden={tab!=='notifications'} importantForAccessibility={tab==='notifications'?'auto':'no-hide-descendants'}><Notifications api={api} onBack={notificationBack}/></View>
 </View>
 {!keyboard?<View style={{flexDirection:'row',backgroundColor:c.surface,borderTopWidth:1,borderColor:c.line,paddingHorizontal:8,paddingTop:7,paddingBottom:4}}>{tabs.map(item=><Pressable key={item.id} onPress={()=>navigate(item.id)} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:tab===item.id}} style={{flex:1,alignItems:'center',justifyContent:'center',minHeight:57,gap:4}}><View style={{height:32,minWidth:48,borderRadius:999,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:tab===item.id?c.accentSoft:'transparent'}}><Icon name={item.icon} color={tab===item.id?c.accent:c.muted}/></View><Text style={{fontSize:9.5,fontWeight:tab===item.id?'700':'500',color:tab===item.id?c.accent:c.muted}}>{item.label}</Text></Pressable>)}</View>:null}</>}
 </View></SafeAreaView></ThemeContext.Provider>;
}
export default function App(){return <AppBoundary><SafeAreaProvider><Shell/></SafeAreaProvider></AppBoundary>;}
