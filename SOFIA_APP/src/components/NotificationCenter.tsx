import {queueOptional} from '../lib/fluency';
import {useBellInbox} from '../lib/use-bell-inbox';
import {mergeBellNotices} from '../lib/bell-inbox';
import {MOTION_EASE,useReducedMotion} from '../lib/motion';
import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Modal,Pressable,ScrollView,Text,View,Alert,Animated,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {notificationPopoverLayout,noticeDateGroup} from '../lib/notification-layout';
import type {BellAnchor} from '../lib/notification-layout';
import type {Notice} from '../lib/types';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {subscribeSystemChanged} from '../lib/system-events';
import {Button,ErrorBanner,IconButton} from './UI';
import {Icon} from './Icon';
export const noticeArea=(n:Notice)=>{const category=String(n.category||'').toLowerCase();if(/capsule|cápsula/.test(category))return 'Cápsulas';if(/routine|rotina/.test(category))return 'Rotinas';if(/course|curso|lesson|aula/.test(category))return 'Cursos';if(/study|estud/.test(category))return 'Estudos';if(/price|monitor|preço|compra|purchase/.test(category))return 'Monitoramento de produtos';if(/fin|fatura|bill|boleto/.test(category))return 'Finanças';if(/task|tarefa/.test(category))return 'Tarefas';if(/agenda|remind|commitment|routine|calendar|lembrete/.test(category))return 'Agenda';return 'Outros';};
type State={localOnly:boolean;items:Notice[];unread:number;loading:boolean;error:string;refresh:()=>Promise<void>;read:(n:Notice)=>Promise<void>;readAll:()=>Promise<void>;clear:(n:Notice)=>Promise<void>;clearAll:()=>Promise<void>;open:(n:Notice)=>void;api:SofiaApi};
const Context=createContext<State|null>(null);
export function NotificationProvider({api,enabled,children,scope='',onOpen}:{api:SofiaApi;enabled:boolean;children:React.ReactNode;scope?:string;onOpen?:(n:Notice)=>void}){
 const [items,setItems]=useState<Notice[]>([]),[unread,setUnread]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const local=useBellInbox(api,scope,enabled),merged=useMemo(()=>mergeBellNotices(items,local.items),[items,local.items]);
 const totalUnread=merged.filter(n=>n.state==='unread').length;
 const generation=useRef(0),request=useRef(false),queued=useRef(false);
 const refresh=useCallback(async()=>{if(!enabled)return;if(request.current){queued.current=true;return;}request.current=true;const current=generation.current;setLoading(true);try{const all:Notice[]=[];let offset:number|null=0,count=0;const seen=new Set<number>();while(offset!==null){if(seen.has(offset))throw Error('Paginação de notificações inválida.');seen.add(offset);const result=await api.allNotifications(offset);all.push(...result.items);offset=result.next_offset;count=result.unread;}if(current===generation.current){setItems([...new Map(all.map(n=>[n.id,n])).values()]);setUnread(count);setError('');}}catch(e){if(current===generation.current)setError(errorText(e));}finally{if(current===generation.current){setLoading(false);request.current=false;if(queued.current){queued.current=false;void refresh();}}}},[api,enabled]);
 useEffect(()=>{generation.current++;request.current=false;setItems([]);setUnread(0);setError('');const cancelInitial=queueOptional('notifications:inventory',()=>{void refresh();},7,8000);const system=subscribeSystemChanged(owner=>{if(owner===api)void refresh();});const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},30000),subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>{cancelInitial();generation.current++;request.current=false;system();clearInterval(timer);subscription.remove();};},[api,refresh]);
 async function read(n:Notice){if(n.id.startsWith('local:')){local.read(n.id);return;}try{await api.markRead(n.id);setItems(old=>old.map(x=>x.id===n.id?{...x,state:'read'}:x));if(n.state==='unread')setUnread(v=>Math.max(0,v-1));await refresh();}catch(e){setError(errorText(e));}}
 async function readAll(){
  local.readAll();const pending=items.filter(n=>n.state==='unread');
  if(!pending.length){setUnread(0);return;}
  setItems(old=>old.map(n=>n.state==='unread'?{...n,state:'read'}:n));setUnread(0);setError('');
  try{for(let i=0;i<pending.length;i+=8)await Promise.all(pending.slice(i,i+8).map(n=>api.markRead(n.id)));await refresh();}
  catch(e){setError(errorText(e));await refresh();}
 }
 async function clear(n:Notice){if(n.id.startsWith('local:')){local.dismiss(n.id);return;}try{await api.clearNotification(n.id);setItems(old=>old.filter(x=>x.id!==n.id));if(n.state==='unread')setUnread(v=>Math.max(0,v-1));await refresh();}catch(e){setError(errorText(e));}}
 async function clearAll(){local.clear();try{await api.clearNotification('all');setItems([]);setUnread(0);await refresh();}catch(e){setError(errorText(e));}}
 // Tocar num aviso marca como lido e leva direto ao lugar dele (produto, cápsula, agenda, finanças).
 function open(n:Notice){if(n.state==='unread'&&!n.id.startsWith('digest:'))void read(n);onOpen?.(n);}
 return <Context.Provider value={{localOnly:api.mdLocalOnly,items:merged,unread:totalUnread,loading,error,refresh,read,readAll,clear,clearAll,open,api}}>{children}</Context.Provider>;
}
export function useNotifications(){const value=useContext(Context);if(!value)throw Error('Centro de notificações não montado.');return value;}
export const AREA_STYLE:Record<string,{icon:string;color:string}>={'Agenda':{icon:'📅',color:'#4fa3ff'},'Cápsulas':{icon:'💊',color:'#ef7bd0'},'Rotinas':{icon:'🔁',color:'#3fd0d4'},'Monitoramento de produtos':{icon:'📉',color:'#2fc58b'},'Finanças':{icon:'💳',color:'#7258e8'},'Tarefas':{icon:'✅',color:'#ffb547'},'Cursos':{icon:'🎓',color:'#a98bff'},'Estudos':{icon:'📚',color:'#a98bff'},'Outros':{icon:'🔔',color:'#8a84a0'}};
const AREA_SHORT:Record<string,string>={'Monitoramento de produtos':'Preços'};
export function relativeTime(iso:string,now=Date.now()){const t=Date.parse(iso);if(!Number.isFinite(t))return '';const m=Math.round((now-t)/60000);if(m<1)return 'agora';if(m<60)return 'há '+m+' min';const h=Math.round(m/60);if(h<24)return 'há '+h+' h';const d=Math.round(h/24);return d===1?'ontem':d<7?'há '+d+' dias':new Date(t).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','');}
export function NoticeRow({item}:{item:Notice}){const c=useTheme(),notices=useNotifications(),area=noticeArea(item),st=AREA_STYLE[area]||AREA_STYLE.Outros,unread=item.state==='unread';
 return <Pressable accessibilityRole="button" accessibilityLabel={'Abrir: '+item.title} onPress={()=>notices.open(item)} style={{flexDirection:'row',gap:12,paddingVertical:12,paddingHorizontal:10,borderRadius:16,backgroundColor:unread?st.color+'12':'transparent',marginBottom:4}}>
  <View style={{width:38,height:38,borderRadius:19,backgroundColor:st.color+'26',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:18}}>{st.icon}</Text></View>
  <View style={{flex:1,gap:3}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:6}}>{unread?<View style={{width:8,height:8,borderRadius:4,backgroundColor:st.color}}/>:null}<Text numberOfLines={2} style={{flex:1,color:c.text,fontSize:14,fontWeight:unread?'700':'500'}}>{item.title}</Text></View>
   {item.body?<Text numberOfLines={3} style={{color:c.muted,fontSize:12,lineHeight:18}}>{item.body}</Text>:null}
   <Text style={{color:c.muted,fontSize:10}}>{AREA_SHORT[area]||area} · {relativeTime(item.created_at)}</Text>
  </View>
  <View style={{gap:2}}>
   {unread?<Pressable accessibilityLabel={'Marcar como lida: '+item.title} onPress={()=>void notices.read(item)} style={{padding:6}}><Icon name="check" size={16} color={c.muted}/></Pressable>:null}
   <Pressable accessibilityLabel={'Limpar notificação: '+item.title} onPress={()=>void notices.clear(item)} style={{padding:6}}><Icon name="close" size={16} color={c.muted}/></Pressable>
  </View>
 </Pressable>;}
// "Pra agora": o sino olha as outras funções e resume o que pede atenção,
// mesmo que nenhum aviso tenha chegado (contas vencendo, produto no menor preço).
type Digest={id:string;icon:string;color:string;title:string;text:string;category:string;entity_id?:string};
let digestCache:{at:number;items:Digest[]}|null=null;
async function buildDigest(api:SofiaApi):Promise<Digest[]>{
 if(digestCache&&Date.now()-digestCache.at<120000)return digestCache.items;
 const out:Digest[]=[];
 try{
  const fin=require('../lib/finance') as typeof import('../lib/finance');const {money}=require('../lib/monitoring') as typeof import('../lib/monitoring');
  const list=async(kind:string)=>{const all:any[]=[];for(let o=0;;o+=100){const r=await api.entities(kind,'',o);all.push(...r.items);if(r.items.length<100)break;}return all;};
  const [txs,cards]=await Promise.all([list('fin_tx'),list('fin_card')]);
  if(txs.length||cards.length){const dues=fin.upcoming(txs.filter((e:any)=>e.state!=='archived').map(fin.toTx),cards.map(fin.toCard),fin.todayISO(),3);
   const late=dues.filter(d=>d.late&&d.kind!=='receber'),soon=dues.filter(d=>!d.late&&d.kind!=='receber');
   if(late.length)out.push({id:'digest:fin-late',icon:'⚠️',color:'#ff6b7a',title:late.length===1?late[0].title+' está atrasada':late.length+' contas atrasadas',text:money(late.reduce((s,d)=>s+d.amount,0))+' em aberto',category:'finance'});
   if(soon.length)out.push({id:'digest:fin-soon',icon:'💳',color:'#7258e8',title:soon.length===1?soon[0].title+' vence '+(soon[0].date===fin.todayISO()?'hoje':'em breve'):soon.length+' contas vencem em 3 dias',text:money(soon.reduce((s,d)=>s+d.amount,0))+' no total',category:'finance'});}
 }catch{/* Finanças é opcional no resumo */}
 try{
  const {productsFrom}=require('../lib/monitor-collector') as typeof import('../lib/monitor-collector');const {money}=require('../lib/monitoring') as typeof import('../lib/monitoring');
  const mons:any[]=[];for(let o=0;;o+=100){const r=await api.entities('monitor','',o);mons.push(...r.items);if(r.items.length<100)break;}
  if(mons.length){const low=(await productsFrom(api,mons)).filter(p=>p.atLow&&p.now);
   for(const p of low.slice(0,2))out.push({id:'digest:low-'+p.monitor.id,icon:'🏆',color:'#2fc58b',title:p.monitor.title,text:'No menor preço já visto: '+money(p.now!.price,p.currency)+' na '+p.now!.store.name,category:'price',entity_id:p.monitor.id});}
 }catch{/* Monitoramento é opcional no resumo */}
 digestCache={at:Date.now(),items:out};return out;
}
function BellDigest(){const c=useTheme(),n=useNotifications(),[items,setItems]=useState<Digest[]>(digestCache?.items||[]);
 useEffect(()=>{let live=true;const cancel=queueOptional('notifications:digest',()=>{void buildDigest(n.api).then(v=>{if(live)setItems(v);}).catch(()=>{});},6,4000);return()=>{live=false;cancel();};},[n.api]);
 if(!items.length)return null;
 return <View style={{gap:8,marginBottom:6}}><Text style={{fontSize:12,color:c.muted,fontWeight:'700',letterSpacing:.8}}>PEDE ATENÇÃO AGORA</Text>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10}}>{items.map(d=><Pressable key={d.id} accessibilityRole="button" accessibilityLabel={d.title} onPress={()=>n.open({id:d.id,title:d.title,body:d.text,state:'read',created_at:new Date().toISOString(),category:d.category,entity_id:d.entity_id})}
   style={{width:220,padding:12,borderRadius:16,backgroundColor:d.color+'1c',borderWidth:1,borderColor:d.color+'55',gap:4}}><Text style={{fontSize:18}}>{d.icon}</Text><Text numberOfLines={2} style={{color:c.text,fontWeight:'700',fontSize:13}}>{d.title}</Text><Text numberOfLines={2} style={{color:c.muted,fontSize:11}}>{d.text}</Text></Pressable>)}</ScrollView></View>;}
export function NotificationList({grouped=false}:{grouped?:boolean}){const n=useNotifications(),c=useTheme(),[filter,setFilter]=useState('all'),[limits,setLimits]=useState<Record<string,number>>({});
 const areas=useMemo(()=>{const m=new Map<string,number>();for(const i of n.items){const a=noticeArea(i);m.set(a,(m.get(a)||0)+1);}return [...m.entries()].sort((a,b)=>b[1]-a[1]);},[n.items]);
 const shown=useMemo(()=>n.items.filter(i=>filter==='all'||(filter==='unread'?i.state==='unread':noticeArea(i)===filter)),[n.items,filter]);
 const groups=useMemo(()=>{const result=new Map<string,Notice[]>();for(const item of shown){const key=noticeDateGroup(item.created_at);if(!result.has(key))result.set(key,[]);result.get(key)!.push(item);}return result;},[shown]);
 const chip=(value:string,label:string,count?:number)=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:filter===value}} onPress={()=>setFilter(value)} style={{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:11,paddingVertical:6,borderRadius:99,backgroundColor:filter===value?c.accent:c.input}}><Text style={{color:filter===value?'#fff':c.text,fontSize:12,fontWeight:'600'}}>{label}</Text>{count?<Text style={{color:filter===value?'#ffffffcc':c.muted,fontSize:11}}>{count}</Text>:null}</Pressable>;
 return <View style={{gap:10}}>
  <BellDigest/>
  {n.localOnly?<Text style={{color:c.muted,fontSize:11,lineHeight:17}}>Servidor atual: até 300 avisos recentes. A limpeza global aguarda a atualização do servidor; marcar como lida é sincronizado.</Text>:null}
  {n.error?<ErrorBanner text={n.error} onRetry={()=>void n.refresh()}/>:null}
  {n.items.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{chip('all','Todas',n.items.length)}{n.unread?chip('unread','Não lidas',n.unread):null}{areas.map(([a,count])=>chip(a,(AREA_STYLE[a]||AREA_STYLE.Outros).icon+' '+(AREA_SHORT[a]||a),count))}</ScrollView>:null}
  {!shown.length?<View style={{alignItems:'center',paddingVertical:24,gap:6}}><Text style={{fontSize:28}}>{n.loading?'⏳':'✨'}</Text><Text style={{color:c.muted}}>{n.loading?'Carregando…':filter==='all'?'Tudo em dia. Sem notificações.':'Nada aqui neste filtro.'}</Text></View>:null}
  {[...groups].map(([group,items])=>{const limit=limits[group]||(grouped?20:12);return <View key={group} style={{gap:2}}><Text style={{fontSize:13,color:c.muted,fontWeight:'700',paddingTop:6,paddingBottom:4}}>{group}</Text>{items.slice(0,limit).map(item=><NoticeRow key={item.id} item={item}/>)}{items.length>limit?<Button title={'Ver mais ('+(items.length-limit)+')'} secondary onPress={()=>setLimits(old=>({...old,[group]:limit+20}))}/>:null}</View>;})}
 </View>;}
export function NotificationBell({onViewAll}:{onViewAll:()=>void}){
 const c=useTheme(),n=useNotifications(),screen=useWindowDimensions(),insets=useSafeAreaInsets();
 const [open,setOpen]=useState(false),[anchor,setAnchor]=useState<BellAnchor>({x:screen.width-66,y:insets.top+20,width:44,height:44});
 const reduced=useReducedMotion();
 const bell=useRef<View|null>(null),motion=useRef(new Animated.Value(0)).current,closing=useRef(false),opening=useRef(false);
 const layout=notificationPopoverLayout(anchor,screen,insets);
 function reveal(){closing.current=false;motion.stopAnimation();motion.setValue(0);setOpen(true);void n.refresh();}
 function show(){if(opening.current)return;opening.current=true;if(bell.current)bell.current.measureInWindow((x,y,width,height)=>{setAnchor({x,y,width,height});reveal();});else reveal();}
 function close(after?:()=>void){if(closing.current)return;closing.current=true;motion.stopAnimation();Animated.timing(motion,{toValue:0,duration:reduced?0:220,easing:MOTION_EASE,useNativeDriver:true}).start(({finished})=>{if(finished){setOpen(false);closing.current=false;opening.current=false;after?.();}});}
 function animateShown(){if(closing.current)return;Animated.timing(motion,{toValue:1,duration:reduced?0:280,easing:MOTION_EASE,useNativeDriver:true}).start();}
 useEffect(()=>()=>motion.stopAnimation(),[motion]);
 useEffect(()=>{if(open)bell.current?.measureInWindow((x,y,width,height)=>setAnchor({x,y,width,height}));},[screen.width,screen.height,open]);
 return <><View ref={bell} collapsable={false}>
  <Pressable testID="notification-bell" accessibilityRole="button" accessibilityLabel={'Notificações: '+n.unread+' não lidas'} onPress={show} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="bell" color={c.text}/>{n.unread>0?<View style={{position:'absolute',right:0,top:0,minWidth:18,height:18,borderRadius:9,backgroundColor:c.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:3}}><Text style={{color:'#fff',fontSize:10,fontWeight:'700'}}>{n.unread>99?'99+':n.unread}</Text></View>:null}</Pressable>
 </View><Modal visible={open} transparent hardwareAccelerated statusBarTranslucent navigationBarTranslucent animationType="none" onShow={animateShown} onRequestClose={()=>close()}>
  <View style={{flex:1}}>
   {/* Keep one stable dim layer for the whole native window lifetime. Only the card animates. */}
   <Animated.View testID="notification-backdrop" style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'#00000044',opacity:motion}}><Pressable accessibilityLabel="Fechar notificações" onPress={()=>close()} style={{flex:1}}/></Animated.View>
   <Animated.View testID="notification-popover" accessibilityViewIsModal style={{position:'absolute',...layout,backgroundColor:c.bg,borderWidth:1,borderColor:c.line,borderRadius:20,padding:14,gap:10,elevation:14,shadowColor:'#000',shadowOffset:{width:0,height:5},shadowOpacity:.18,shadowRadius:16,opacity:motion,transform:[{translateX:motion.interpolate({inputRange:[0,1],outputRange:[(anchor.x+anchor.width/2-(layout.left+layout.width/2))*.14,0]})},{translateY:motion.interpolate({inputRange:[0,1],outputRange:[-(layout.height/2)*.14,0]})},{scale:motion.interpolate({inputRange:[0,1],outputRange:[.86,1]})}]}}>
    <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,fontSize:20,fontWeight:'700',color:c.text}}>Notificações</Text><IconButton name="close" label="Fechar notificações" onPress={()=>close()}/></View>
    <ScrollView nestedScrollEnabled style={{flex:1}} contentContainerStyle={{paddingBottom:10}}><NotificationList/></ScrollView>
    {n.items.length?<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4}}>
     {n.unread>0?<Pressable accessibilityRole="button" accessibilityLabel="Marcar todas as notificações como lidas" onPress={()=>void n.readAll()} style={{minHeight:44,justifyContent:'center',flexShrink:1,minWidth:0}}><Text numberOfLines={1} adjustsFontSizeToFit style={{color:c.muted,fontSize:12,fontWeight:'400',paddingHorizontal:6}}>Marcar tudo como lido</Text></Pressable>:null}
     <Pressable accessibilityRole="button" accessibilityLabel="Limpar todas as notificações" onPress={()=>Alert.alert('Limpar notificações?','Somente os avisos serão removidos. Seus eventos e registros permanecem.',[{text:'Cancelar',style:'cancel'},{text:'Limpar',onPress:()=>void n.clearAll()}])} style={{minHeight:44,justifyContent:'center',flexShrink:0}}><Text numberOfLines={1} style={{color:c.muted,fontSize:12,padding:6}}>Limpar todas</Text></Pressable>
    </View>:null}
    <Button title="Ver todas as notificações" onPress={()=>close(onViewAll)}/>
   </Animated.View>
  </View>
 </Modal></>;
}
