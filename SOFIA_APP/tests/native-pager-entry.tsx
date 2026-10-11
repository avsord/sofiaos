// CI-only entry. index.ts never imports this file in the published APK.
// Real navigation/editor components, synthetic in-memory data, no login or production API calls.
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,Pressable,ScrollView,TextInput,StyleSheet,Keyboard,useWindowDimensions} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {registerRootComponent} from 'expo';
import {TabPager} from '../src/components/TabPager';
import type {TabPagerHandle} from '../src/components/TabPager';
import {MenuTab} from '../src/components/MenuTab';
import {createMenuMotion} from '../src/lib/menu-motion';
import {TAB_ORDER} from '../src/lib/tab-navigation';
import {ThemeContext,light} from '../src/lib/theme';
import {Pages} from '../src/screens/Pages';
import type {SofiaApi} from '../src/lib/api';
import type {Entity,Tab} from '../src/lib/types';
import type {IconName} from '../src/components/Icon';
const tabs:{id:Tab;label:string;icon:IconName}[]=[{id:'home',label:'Início',icon:'home'},{id:'chat',label:'Conversa',icon:'chat'},{id:'pages',label:'Páginas',icon:'book'},{id:'agenda',label:'Agenda',icon:'calendar'},{id:'apps',label:'Apps',icon:'grid'},{id:'profile',label:'Perfil',icon:'user'}];
function Fixture(){
 const [tab,setTab]=useState<Tab>('home'),[epoch,setEpoch]=useState(0),[compact,setCompact]=useState(false),[many,setMany]=useState(false),[keyboard,setKeyboard]=useState(false),[pagesDepth,setPagesDepth]=useState(false);
 const pager=useRef<TabPagerHandle>(null),motion=useMemo(()=>createMenuMotion('home'),[]),win=useWindowDimensions();
 useEffect(()=>{const timer=setTimeout(()=>setMany(true),700);const a=Keyboard.addListener('keyboardDidShow',()=>setKeyboard(true)),b=Keyboard.addListener('keyboardDidHide',()=>setKeyboard(false));return()=>{clearTimeout(timer);a.remove();b.remove();motion.dispose();};},[motion]);
 const api=useMemo(()=>{
  let sequence=2;
  const make=(id:string,title:string,parent_id=''):Entity=>({id,kind:'user_page',title,content:'',area:'Pessoal',state:'active',privacy:'private',tags:[],revision:1,data:{icon:title==='Alpha'?'🅰️':'🅱️',icon_mode:'emoji',cover_type:'',cover_value:'',cover_attachment_id:'',purpose:'',layout:'notes',suggested:false,parent_id,node_type:parent_id?'page':'space',blocks_json:'[]'}});
  const rows=new Map<string,Entity>([['qa-alpha',make('qa-alpha','Alpha')],['qa-beta',make('qa-beta','Beta')]]);
  return {
   entities:async()=>({items:[...rows.values()]}),
   entity:async(id:string)=>{const row=rows.get(id);if(!row)throw Error('No synthetic page');return row;},
   saveEntity:async(patch:Partial<Entity>)=>{const id=patch.id||'qa-'+(++sequence);const base=rows.get(id);const row:Entity={id,kind:'user_page',title:'Sem título',content:'',area:'Pessoal',state:'active',privacy:'private',tags:[],...base,...patch,data:{...base?.data,...patch.data},revision:(base?.revision||0)+1};rows.set(id,row);return row;},
   deleteEntity:async(id:string)=>{rows.delete(id);},
   attachmentSource:()=>({uri:''})
  } as unknown as SofiaApi;
 },[]);
 const select=(next:Tab)=>{pager.current?.goTo(next);setTab(next);};
 return <ThemeContext.Provider value={light}><SafeAreaView style={styles.root}>
  <Text style={styles.status}>SOFIA_NATIVE_PAGER_FIXTURE_ONLY</Text>
  <View style={{flex:1,width:Math.min(760,win.width)*(compact?.85:1),alignSelf:'center'}}>
   <TabPager key={epoch} ref={pager} activeTab={tab} enabled={!keyboard&&!(tab==='pages'&&pagesDepth)} onSelect={select} motion={motion}>
    {TAB_ORDER.map(id=><View key={id} style={{flex:1}}>
     <Text testID={'qa-surface-'+id} style={styles.marker}>{'VISIBLE PAGE '+id}</Text>
     {id==='pages'?<Pages api={api} active={tab==='pages'} storageScope="ci-synthetic-only" onDepthChange={setPagesDepth}/>:
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20}}>
       <Pressable accessibilityLabel={'qa-first-'+id}><Text>{id+' first control'}</Text></Pressable>
       <TextInput accessibilityLabel={'qa-input-'+id} placeholder="Synthetic input" style={{minHeight:44}}/>
       {Array.from({length:many?20:1},(_,i)=><Text key={i} style={{padding:10}}>{id+' content '+i}</Text>)}
      </ScrollView>}
    </View>)}
   </TabPager>
   {!keyboard?<View style={styles.tabs}>{tabs.map(item=><MenuTab key={item.id} item={item} selected={tab===item.id} onSelect={select} motion={motion}/>)}</View>:null}
  </View>
  {!keyboard?<View style={styles.controls}>
   <Pressable accessibilityLabel="qa-remount" onPress={()=>{setTab('home');setEpoch(v=>v+1);}}><Text>Remount</Text></Pressable>
   <Pressable accessibilityLabel="qa-resize" onPress={()=>setCompact(v=>!v)}><Text>Resize</Text></Pressable>
  </View>:null}
 </SafeAreaView></ThemeContext.Provider>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:light.bg},status:{fontSize:10,textAlign:'center'},marker:{fontSize:16,textAlign:'center',padding:10,color:light.text},tabs:{flexDirection:'row',paddingHorizontal:8,paddingTop:7,paddingBottom:4,backgroundColor:light.surface},controls:{flexDirection:'row',justifyContent:'space-around',padding:12}});
registerRootComponent(()=> <SafeAreaProvider><Fixture/></SafeAreaProvider>);
