import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Modal,Pressable,ScrollView,Text,View,Alert,Animated,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {notificationPopoverLayout,noticeDateGroup} from '../lib/notification-layout';
import type {BellAnchor} from '../lib/notification-layout';
import type {Notice} from '../lib/types';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Button,ErrorBanner,IconButton} from './UI';
import {Icon} from './Icon';
export const noticeArea=(n:Notice)=>{const category=String(n.category||'').toLowerCase();if(/course|curso|lesson|aula/.test(category))return 'Cursos';if(/study|estud/.test(category))return 'Estudos';if(/price|monitor|preço|compra|purchase/.test(category))return 'Monitoramento de produtos';if(/task|tarefa/.test(category))return 'Tarefas';if(/agenda|remind|commitment|routine|calendar|lembrete/.test(category))return 'Agenda';return 'Outros';};
type State={localOnly:boolean;items:Notice[];unread:number;loading:boolean;error:string;refresh:()=>Promise<void>;read:(n:Notice)=>Promise<void>;clear:(n:Notice)=>Promise<void>;clearAll:()=>Promise<void>};
const Context=createContext<State|null>(null);
export function NotificationProvider({api,enabled,children}:{api:SofiaApi;enabled:boolean;children:React.ReactNode}){
 const [items,setItems]=useState<Notice[]>([]),[unread,setUnread]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),request=useRef(false);
 const refresh=useCallback(async()=>{if(!enabled||request.current)return;request.current=true;const current=generation.current;setLoading(true);try{const all:Notice[]=[];let offset:number|null=0,count=0;const seen=new Set<number>();while(offset!==null){if(seen.has(offset))throw Error('Paginação de notificações inválida.');seen.add(offset);const result=await api.allNotifications(offset);all.push(...result.items);offset=result.next_offset;count=result.unread;}if(current===generation.current){setItems([...new Map(all.map(n=>[n.id,n])).values()]);setUnread(count);setError('');}}catch(e){if(current===generation.current)setError(errorText(e));}finally{if(current===generation.current){setLoading(false);request.current=false;}}},[api,enabled]);
 useEffect(()=>{generation.current++;request.current=false;setItems([]);setUnread(0);setError('');void refresh();const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},30000),subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>{generation.current++;request.current=false;clearInterval(timer);subscription.remove();};},[refresh]);
 async function read(n:Notice){try{await api.markRead(n.id);setItems(old=>old.map(x=>x.id===n.id?{...x,state:'read'}:x));if(n.state==='unread')setUnread(v=>Math.max(0,v-1));await refresh();}catch(e){setError(errorText(e));}}
 async function clear(n:Notice){try{await api.clearNotification(n.id);setItems(old=>old.filter(x=>x.id!==n.id));if(n.state==='unread')setUnread(v=>Math.max(0,v-1));await refresh();}catch(e){setError(errorText(e));}}
 async function clearAll(){try{await api.clearNotification('all');setItems([]);setUnread(0);await refresh();}catch(e){setError(errorText(e));}}
 return <Context.Provider value={{localOnly:api.mdLocalOnly,items,unread,loading,error,refresh,read,clear,clearAll}}>{children}</Context.Provider>;
}
export function useNotifications(){const value=useContext(Context);if(!value)throw Error('Centro de notificações não montado.');return value;}
export function NoticeRow({item}:{item:Notice}){const c=useTheme(),notices=useNotifications();return <View style={{paddingVertical:12,paddingHorizontal:2,borderBottomWidth:1,borderColor:c.line,gap:6}}><Text style={{color:c.text,fontSize:15,fontWeight:item.state==='unread'?'700':'500'}}>{item.title}</Text><Text style={{color:c.muted,fontSize:12,lineHeight:19}}>{item.body}</Text><Text style={{color:c.muted,fontSize:10}}>{new Date(item.created_at).toLocaleString('pt-BR')}</Text><View style={{flexDirection:'row',gap:10}}>{item.state==='unread'?<Pressable accessibilityLabel={'Marcar como lida: '+item.title} onPress={()=>void notices.read(item)} style={{paddingVertical:10}}><Text style={{color:c.accent,fontSize:12}}>Marcar como lida</Text></Pressable>:<Text style={{paddingVertical:10,color:c.muted,fontSize:12}}>Lida</Text>}<Pressable accessibilityLabel={'Limpar notificação: '+item.title} onPress={()=>void notices.clear(item)} style={{padding:10}}><Text style={{color:c.muted,fontSize:12}}>Limpar</Text></Pressable></View></View>;}
export function NotificationList({grouped=false}:{grouped?:boolean}){const n=useNotifications(),c=useTheme(),[limits,setLimits]=useState<Record<string,number>>({});const groups=useMemo(()=>{const result=new Map<string,Notice[]>();for(const item of n.items){const key=grouped?noticeArea(item):noticeDateGroup(item.created_at);if(!result.has(key))result.set(key,[]);result.get(key)!.push(item);}return result;},[n.items,grouped]);return <View style={{gap:12}}>{n.localOnly?<Text style={{color:c.muted,fontSize:11,lineHeight:17}}>Servidor atual: até 300 avisos recentes. Limpar oculta os avisos somente neste aparelho; marcar como lida é sincronizado.</Text>:null}{n.error?<ErrorBanner text={n.error} onRetry={()=>void n.refresh()}/>:null}{!n.items.length?<Text style={{color:c.muted,paddingVertical:16}}>{n.loading?'Carregando…':'Sem notificações.'}</Text>:null}{[...groups].map(([area,items])=>{const limit=grouped?(limits[area]||5):items.length;return <View key={area} style={{gap:8}}><Text style={{fontSize:16,color:c.text,fontWeight:'700',paddingTop:8}}>{area}{grouped?' · '+items.length:''}</Text>{items.slice(0,limit).map(item=><NoticeRow key={item.id} item={item}/>)}{items.length>limit?<Button title={'Ver mais em '+area} secondary onPress={()=>setLimits(old=>({...old,[area]:limit+10}))}/>:null}</View>;})}</View>;}
export function NotificationBell({onViewAll}:{onViewAll:()=>void}){
 const c=useTheme(),n=useNotifications(),screen=useWindowDimensions(),insets=useSafeAreaInsets();
 const [open,setOpen]=useState(false),[anchor,setAnchor]=useState<BellAnchor>({x:screen.width-66,y:insets.top+20,width:44,height:44});
 const bell=useRef<View|null>(null),motion=useRef(new Animated.Value(0)).current,closing=useRef(false);
 const layout=notificationPopoverLayout(anchor,screen,insets);
 function reveal(){closing.current=false;motion.setValue(0);setOpen(true);void n.refresh();}
 function show(){if(bell.current)bell.current.measureInWindow((x,y,width,height)=>{setAnchor({x,y,width,height});reveal();});else reveal();}
 function close(after?:()=>void){if(closing.current)return;closing.current=true;Animated.timing(motion,{toValue:0,duration:130,useNativeDriver:true}).start(()=>{setOpen(false);closing.current=false;after?.();});}
 useEffect(()=>{if(open)Animated.spring(motion,{toValue:1,useNativeDriver:true,damping:24,stiffness:280,mass:.8}).start();},[open,motion]);
 useEffect(()=>{if(open)bell.current?.measureInWindow((x,y,width,height)=>setAnchor({x,y,width,height}));},[screen.width,screen.height,open]);
 return <><View ref={bell} collapsable={false}>
  <Pressable testID="notification-bell" accessibilityRole="button" accessibilityLabel={'Notificações: '+n.unread+' não lidas'} onPress={show} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="bell" color={c.text}/>{n.unread>0?<View style={{position:'absolute',right:0,top:0,minWidth:18,height:18,borderRadius:9,backgroundColor:c.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:3}}><Text style={{color:'#fff',fontSize:10,fontWeight:'700'}}>{n.unread>99?'99+':n.unread}</Text></View>:null}</Pressable>
 </View><Modal visible={open} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={()=>close()}>
  <View style={{flex:1}}>
   <Animated.View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'#00000044',opacity:motion}}><Pressable accessibilityLabel="Fechar notificações" onPress={()=>close()} style={{flex:1}}/></Animated.View>
   <Animated.View testID="notification-popover" accessibilityViewIsModal style={{position:'absolute',...layout,backgroundColor:c.bg,borderWidth:1,borderColor:c.line,borderRadius:20,padding:14,gap:10,elevation:14,shadowColor:'#000',shadowOffset:{width:0,height:5},shadowOpacity:.18,shadowRadius:16,opacity:motion,transform:[{translateY:motion.interpolate({inputRange:[0,1],outputRange:[-18,0]})}]}}>
    <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,fontSize:20,fontWeight:'700',color:c.text}}>Notificações</Text><IconButton name="close" label="Fechar notificações" onPress={()=>close()}/></View>
    <ScrollView nestedScrollEnabled style={{flex:1}} contentContainerStyle={{paddingBottom:10}}><NotificationList/></ScrollView>
    {n.items.length?<Pressable onPress={()=>Alert.alert('Limpar notificações?','Somente os avisos serão removidos. Seus eventos e registros permanecem.',[{text:'Cancelar',style:'cancel'},{text:'Limpar',onPress:()=>void n.clearAll()}])}><Text style={{color:c.muted,fontSize:12,padding:6}}>Limpar todas</Text></Pressable>:null}
    <Button title="Ver todas as notificações" onPress={()=>close(onViewAll)}/>
   </Animated.View>
  </View>
 </Modal></>;
}
