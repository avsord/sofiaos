import React,{Component,ErrorInfo,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,Pressable,StatusBar,ActivityIndicator,useColorScheme,AppState,Alert,Keyboard,BackHandler,Linking,Animated,Easing} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {SofiaApi,readAuth,saveAuth,forgetAuth,readPrefs,savePrefs} from './src/lib/api';
import type {Auth,Bootstrap,Prefs,Tab,Profile as UserProfile} from './src/lib/types';
import {ThemeContext,light,dark} from './src/lib/theme';
import {errorText} from './src/lib/chat-model';
import {silenceVoices} from './src/lib/audio-focus';
import {Icon,IconName} from './src/components/Icon';
import {Button,ErrorBanner} from './src/components/UI';
import {Login} from './src/screens/Login';
import {Home} from './src/screens/Home';
import {Chat} from './src/screens/Chat';
import {Agenda} from './src/screens/Agenda';
import {Notifications} from './src/screens/Notifications';
import {Profile} from './src/screens/Profile';
import {Workspace} from './src/screens/Workspace';
import {Pages} from './src/screens/Pages';
import {checkForUpdate} from './src/lib/update';
class AppBoundary extends Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(_e:Error,_info:ErrorInfo){/* No personal data in logs. */}
 render(){return this.state.failed?<View style={{flex:1,backgroundColor:'#F7F6FA',padding:30,justifyContent:'center'}}><Text style={{fontSize:25,fontWeight:'700',color:'#272334'}}>Vamos reabrir a Sofia.</Text><Text style={{marginTop:16,lineHeight:23,color:'#7F7A8D'}}>O aplicativo encontrou um problema. Feche e abra novamente. Mensagens ainda não enviadas podem precisar ser refeitas.</Text></View>:this.props.children;}
}
function Shell(){
 const system=useColorScheme(),[ready,setReady]=useState(false),[auth,setAuth]=useState<Auth|null>(null),[bootstrap,setBootstrap]=useState<Bootstrap|null>(null),[prefs,setPrefs]=useState<Prefs>({appearance:'system',enterToSend:false,autoSendVoice:true}),[error,setError]=useState(''),[tab,setTab]=useState<Tab>('chat'),[locked,setLocked]=useState(false),[booting,setBooting]=useState(false),[keyboard,setKeyboard]=useState(false),[workspaceDepth,setWorkspaceDepth]=useState(false),[chatEpoch,setChatEpoch]=useState(0);
 const tabHistory=useRef<Tab[]>([]),transition=useRef(new Animated.Value(1)).current,transitionY=useRef(new Animated.Value(0)).current,transitioning=useRef(false);
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
 const switchTab=useCallback((next:Tab)=>{if(next===tab||transitioning.current)return;transitioning.current=true;transition.setValue(.96);transitionY.setValue(3);setTab(next);requestAnimationFrame(()=>Animated.parallel([Animated.timing(transition,{toValue:1,duration:95,easing:Easing.out(Easing.cubic),useNativeDriver:true}),Animated.timing(transitionY,{toValue:0,duration:95,easing:Easing.out(Easing.cubic),useNativeDriver:true})]).start(()=>{transitioning.current=false;}));},[tab,transition,transitionY]);
 const goBack=useCallback(()=>{if(locked){Alert.alert('Sua conversa','Pare a gravação ou aguarde a resposta.');return true;}if(transitioning.current)return true;while(tabHistory.current.length){const previous=tabHistory.current.pop()!;if(previous!==tab){switchTab(previous);return true;}}if(tab!=='home'&&auth){switchTab('home');return true;}return false;},[locked,tab,auth,switchTab]);
 useEffect(()=>{const s=BackHandler.addEventListener('hardwareBackPress',()=>tab==='apps'&&workspaceDepth?false:goBack());return()=>s.remove();},[tab,workspaceDepth,goBack]);
 async function login(a:Auth){await saveAuth(a);tabHistory.current=[];setAuth(a);setTab('chat');setError('');}
 async function changePrefs(p:Prefs){await savePrefs(p);setPrefs(p);}
 async function logout(){void silenceVoices();let revokeFailed=false;try{await api.logout();}catch{revokeFailed=true;}try{await forgetAuth();}catch{Alert.alert('Armazenamento','Não foi possível apagar a cópia local da sessão. Limpe os dados do aplicativo antes de compartilhar o aparelho.');}tabHistory.current=[];setAuth(null);setBootstrap(null);setLocked(false);if(revokeFailed)Alert.alert('Você saiu deste aparelho','Não foi possível confirmar a revogação no servidor. Use “Encerrar todas as sessões” no site para invalidá-la antes da expiração.');}
 function navigate(next:Tab){if(next===tab||transitioning.current)return;if(locked){Alert.alert('Sua conversa','Pare a gravação ou aguarde a resposta antes de trocar de aba.');return;}tabHistory.current=[...tabHistory.current,tab].slice(-30);switchTab(next);}
 const profile=(p:UserProfile)=>setBootstrap(prev=>prev?{...prev,profile:p}:prev);
 const tabs:{id:Tab;label:string;icon:IconName}[]=[{id:'home',label:'Início',icon:'home'},{id:'chat',label:'Conversa',icon:'chat'},{id:'pages',label:'Páginas',icon:'book'},{id:'agenda',label:'Agenda',icon:'calendar'},{id:'apps',label:'Apps',icon:'grid'},{id:'profile',label:'Perfil',icon:'user'}];
 return <ThemeContext.Provider value={c}><SafeAreaView style={{flex:1,backgroundColor:c.bg}} edges={['top','left','right','bottom']}><StatusBar barStyle={c===dark?'light-content':'dark-content'} backgroundColor={c.bg}/><View style={{flex:1,width:'100%',maxWidth:760,alignSelf:'center',backgroundColor:c.bg}}>
 {!ready?<View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:!auth?<Login onLogin={login}/>:!bootstrap?<View style={{flex:1,justifyContent:'center',padding:24,gap:14}}>{booting?<ActivityIndicator color={c.accent}/>:null}<Text style={{fontSize:23,fontWeight:'600',color:c.text}}>Abrindo sua Sofia…</Text>{error?<ErrorBanner text={error}/>:null}<Button title="Tentar novamente" onPress={()=>void boot()} loading={booting}/><Button title="Voltar para o login" secondary onPress={()=>void logout()}/></View>:<><Animated.View style={{flex:1,opacity:transition,transform:[{translateY:transitionY}]}}>
 <View style={{flex:1,display:tab==='chat'?'flex':'none'}}><Chat key={'chat-'+chatEpoch} api={api} bootstrap={bootstrap} enterToSend={prefs.enterToSend} autoSendVoice={prefs.autoSendVoice} onLock={setLocked} active={tab==='chat'} onRefreshBootstrap={boot}/></View>
 <View style={{flex:1,display:tab==='home'?'flex':'none'}}><Home api={api} bootstrap={bootstrap} navigate={navigate}/></View>
 <View style={{flex:1,display:tab==='pages'?'flex':'none'}}><Pages api={api}/></View>
 <View style={{flex:1,display:tab==='agenda'?'flex':'none'}}><Agenda api={api}/></View>
 <View style={{flex:1,display:tab==='apps'?'flex':'none'}}><Workspace api={api} navigate={navigate} onDepthChange={setWorkspaceDepth}/></View>
 <View style={{flex:1,display:tab==='notifications'?'flex':'none'}}><Notifications api={api} onBack={()=>{void goBack();}}/></View>
 <View style={{flex:1,display:tab==='profile'?'flex':'none'}}><Profile api={api} bootstrap={bootstrap} prefs={prefs} onPrefs={changePrefs} onProfile={profile} onLogout={logout} onCheckUpdate={()=>checkUpdate(true)} onChatHistoryCleared={()=>setChatEpoch(v=>v+1)}/></View>
 </Animated.View>
 {!keyboard?<View style={{flexDirection:'row',backgroundColor:c.surface,borderTopWidth:1,borderColor:c.line,paddingHorizontal:8,paddingTop:7,paddingBottom:4}}>{tabs.map(item=><Pressable key={item.id} onPress={()=>navigate(item.id)} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:tab===item.id}} style={{flex:1,alignItems:'center',justifyContent:'center',minHeight:57,gap:4}}><View style={{height:32,minWidth:48,borderRadius:999,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:tab===item.id?c.accentSoft:'transparent'}}><Icon name={item.icon} color={tab===item.id?c.accent:c.muted}/></View><Text style={{fontSize:9.5,fontWeight:tab===item.id?'700':'500',color:tab===item.id?c.accent:c.muted}}>{item.label}</Text></Pressable>)}</View>:null}</>}
 </View></SafeAreaView></ThemeContext.Provider>;
}
export default function App(){return <AppBoundary><SafeAreaProvider><Shell/></SafeAreaProvider></AppBoundary>;}
