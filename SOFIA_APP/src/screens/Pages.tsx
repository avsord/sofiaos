import React,{useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,ScrollView,TextInput,Pressable,Switch,Alert,RefreshControl,BackHandler} from 'react-native';
import {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Button,Empty,ErrorBanner,IconButton} from '../components/UI';
import {Icon} from '../components/Icon';

type PageBlock={id:string;type:string;text?:string;html?:string;checked?:boolean;data?:Record<string,any>};
const emptyBlock=():PageBlock=>({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),type:'text',text:''});
const pdata=(p:Entity)=>p.data||{};
function parseBlocks(p:Entity):PageBlock[]{try{const b=JSON.parse(String(pdata(p).blocks_json||'[]'));return Array.isArray(b)&&b.length?b:[emptyBlock()];}catch{return [emptyBlock()];}}
function iconFor(p:Entity){const value=String(pdata(p).icon||'').trim();return value||'📄';}
function coverFor(p:Entity,fallback:string){const value=String(pdata(p).cover_value||'');const hex=value.match(/#[0-9a-fA-F]{6}/)?.[0];return hex||fallback;}

export function Pages({api,active}:{api:SofiaApi;active:boolean}){
 const c=useTheme(),[pages,setPages]=useState<Entity[]>([]),[selected,setSelected]=useState<Entity|null>(null),[title,setTitle]=useState(''),[blocks,setBlocks]=useState<PageBlock[]>([]),[refreshing,setRefreshing]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),history=useRef<string[]>([]);
 async function load(manual=false){if(manual)setRefreshing(true);try{const r=await api.entities('user_page');const items=r.items.filter(x=>x.state!=='archived');setPages(items);if(selected){const fresh=items.find(x=>x.id===selected.id);if(fresh)setSelected(fresh);}setError('');}catch(e){setError(errorText(e));}finally{if(manual)setRefreshing(false);}}
 useEffect(()=>{void load();},[api]);
 const byId=useMemo(()=>new Map(pages.map(p=>[p.id,p])),[pages]);
 const children=useMemo(()=>{const m=new Map<string,Entity[]>();for(const p of pages){const parent=String(pdata(p).parent_id||'');if(!m.has(parent))m.set(parent,[]);m.get(parent)!.push(p);}for(const list of m.values())list.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));return m;},[pages]);
 function pathFor(p:Entity){const out:Entity[]=[];let cur:Entity|undefined=p,guard=0;while(cur&&guard++<30){out.unshift(cur);const parentId:string=String(pdata(cur).parent_id||'');cur=parentId?byId.get(parentId):undefined;}return out;}
 function open(page:Entity,push=true){if(push&&selected)history.current.push(selected.id);setSelected(page);setTitle(page.title);setBlocks(parseBlocks(page));setError('');}
 function back(){const id=history.current.pop();if(id){const p=byId.get(id);if(p){open(p,false);return;}}setSelected(null);}
 useEffect(()=>{if(!active)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(!selected)return false;back();return true;});return()=>sub.remove();},[active,selected,byId]);
 async function save(){if(!selected||saving||!title.trim())return;setSaving(true);try{const saved=await api.saveEntity({...selected,title:title.trim(),data:{...pdata(selected),blocks_json:JSON.stringify(blocks)}});setSelected(saved);setPages(old=>old.map(p=>p.id===saved.id?saved:p));setError('');}catch(e){setError(errorText(e));}finally{setSaving(false);}}
 async function create(parent?:Entity){try{const saved=await api.saveEntity({kind:'user_page',title:'Sem título',content:'',area:parent?.area||'Pessoal',privacy:'private',state:'active',data:{icon:'',icon_mode:'default',cover_type:'preset',cover_value:'',cover_attachment_id:'',purpose:'',layout:'notes',suggested:false,parent_id:parent?.id||'',node_type:parent?'page':'space',blocks_json:JSON.stringify([emptyBlock()])}});await load();open(saved);}catch(e){setError(errorText(e));}}
 function updateBlock(i:number,patch:Partial<PageBlock>){setBlocks(old=>old.map((b,n)=>n===i?{...b,...patch}:b));}
 function removeBlock(i:number){setBlocks(old=>{const next=old.filter((_,n)=>n!==i);return next.length?next:[emptyBlock()];});}
 async function removePage(){if(!selected)return;Alert.alert('Excluir página?','A página e as subpáginas dentro dela serão removidas também da web.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{api.deleteEntity(selected.id).then(async()=>{setSelected(null);history.current=[];await load();}).catch(e=>setError(errorText(e)));}}]);}
 function blockView(b:PageBlock,i:number){if(b.type==='divider')return <Pressable key={b.id} onLongPress={()=>removeBlock(i)} style={{paddingVertical:13}}><View style={{height:1,backgroundColor:c.line}}/></Pressable>;
  if(b.type==='todo')return <View key={b.id} style={{flexDirection:'row',gap:11,alignItems:'flex-start',paddingVertical:4}}><Switch value={!!b.checked} onValueChange={v=>updateBlock(i,{checked:v})}/><TextInput value={b.text||''} onChangeText={text=>updateBlock(i,{text})} onBlur={()=>void save()} multiline placeholder="Tarefa" placeholderTextColor={c.muted} style={{flex:1,color:c.text,fontSize:16,lineHeight:24,paddingTop:7}}/></View>;
  if(['image','file','table','collection','bookmark'].includes(b.type))return <View key={b.id} style={{marginVertical:5,padding:15,borderRadius:12,backgroundColor:c.input,borderWidth:1,borderColor:c.line}}><Text style={{color:c.text,fontWeight:'600'}}>{b.type==='image'?'Imagem':b.type==='table'?'Tabela':b.type==='collection'?'Banco de dados':b.type==='file'?'Arquivo':'Link'}</Text><Text style={{color:c.muted,fontSize:12,marginTop:5}}>Este bloco é preservado e continua editável na Sofia web.</Text></View>;
  const heading=b.type==='heading1'?30:b.type==='heading2'?24:b.type==='heading3'?20:16;
  const prefix=b.type==='bullet'?'• ':b.type==='number'?String(i+1)+'. ':b.type==='quote'?'│ ':b.type==='callout'?'💡 ':'';
  return <View key={b.id} style={{flexDirection:'row',alignItems:'flex-start'}}>{prefix?<Text style={{fontSize:heading,lineHeight:heading+9,color:b.type==='quote'?c.muted:c.text}}>{prefix}</Text>:null}<TextInput value={b.text||''} onChangeText={text=>updateBlock(i,{text,html:''})} onBlur={()=>void save()} multiline placeholder={i===0?'Digite algo…':'Digite / para adicionar um bloco'} placeholderTextColor={c.muted} style={{flex:1,color:c.text,fontSize:heading,lineHeight:heading+9,fontWeight:b.type.startsWith('heading')?'700':'400',paddingVertical:4,fontFamily:b.type==='code'?'monospace':undefined,backgroundColor:b.type==='code'?c.input:'transparent',borderRadius:8,paddingHorizontal:b.type==='code'?10:0}}/></View>;
 }
 if(!selected)return <ScrollView style={{flex:1,backgroundColor:c.bg}} contentContainerStyle={{paddingBottom:34}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={c.accent}/>}>
  <View style={{paddingHorizontal:20,paddingTop:18,paddingBottom:12,flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}><Text style={{color:c.text,fontSize:30,fontWeight:'800',letterSpacing:-1}}>Páginas</Text><Text style={{color:c.muted,fontSize:13,marginTop:5}}>Seus espaços e subpáginas, sincronizados com a web.</Text></View><IconButton name="plus" label="Nova página" filled onPress={()=>void create()}/></View>
  {error?<ErrorBanner text={error}/>:null}<View style={{paddingHorizontal:10}}>
  {(children.get('')||[]).map(root=><PageTree key={root.id} page={root} depth={0} children={children} c={c} onOpen={open}/>)}
  {!pages.length?<Empty icon="book" title="Sua primeira página" body="Crie uma página como no Notion. Depois você pode colocar subpáginas dentro dela."/>:null}
  </View></ScrollView>;
 const path=pathFor(selected),subpages=children.get(selected.id)||[];
 return <View style={{flex:1,backgroundColor:c.bg}}>
  <View style={{height:54,flexDirection:'row',alignItems:'center',paddingHorizontal:8,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}><IconButton name="back" label="Voltar" onPress={back}/><Text numberOfLines={1} style={{flex:1,color:c.muted,fontSize:12}}>{path.map(p=>p.title).join('  ›  ')}</Text><Text style={{fontSize:11,color:saving?c.accent:c.muted,marginRight:4}}>{saving?'Salvando…':'Salvo'}</Text><IconButton name="plus" label="Criar subpágina" onPress={()=>void create(selected)}/><IconButton name="trash" label="Excluir página" onPress={()=>void removePage()}/></View>
  {error?<ErrorBanner text={error}/>:null}
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:60}}>
   <View style={{height:132,backgroundColor:coverFor(selected,c.accentSoft),overflow:'hidden'}}><View style={{position:'absolute',width:190,height:190,borderRadius:95,backgroundColor:'#FFFFFF22',right:-40,top:-70}}/><View style={{position:'absolute',width:110,height:110,borderRadius:55,backgroundColor:'#FFFFFF18',left:18,bottom:-55}}/></View>
   <View style={{paddingHorizontal:24,marginTop:-28}}>
    <View style={{width:60,height:60,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.line}}><Text style={{fontSize:34}}>{iconFor(selected)}</Text></View>
    <TextInput value={title} onChangeText={setTitle} onBlur={()=>void save()} multiline placeholder="Sem título" placeholderTextColor={c.muted} style={{fontSize:34,lineHeight:42,fontWeight:'800',letterSpacing:-1,color:c.text,paddingVertical:14}}/>
    {String(pdata(selected).purpose||'').trim()?<Text style={{fontSize:13,lineHeight:20,color:c.muted,marginBottom:12}}>{String(pdata(selected).purpose)}</Text>:null}
    <View style={{gap:6}}>{blocks.map(blockView)}</View>
    <View style={{flexDirection:'row',gap:8,flexWrap:'wrap',paddingVertical:18}}>{[['text','Texto'],['heading2','Título'],['bullet','Lista'],['todo','Tarefa'],['divider','Divisor']].map(([type,label])=><Pressable key={type} onPress={()=>setBlocks(old=>[...old,{...emptyBlock(),type}])} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:9,backgroundColor:c.input}}><Text style={{fontSize:12,color:c.muted}}>＋ {label}</Text></Pressable>)}</View>
    {subpages.length?<View style={{marginTop:5,borderTopWidth:1,borderColor:c.line,paddingTop:17,gap:5}}><Text style={{fontSize:12,fontWeight:'700',color:c.muted,marginBottom:4}}>SUBPÁGINAS</Text>{subpages.map(p=><Pressable key={p.id} onPress={()=>open(p)} style={({pressed})=>({minHeight:50,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:8,borderRadius:10,backgroundColor:pressed?c.input:'transparent'})}><Text style={{fontSize:22}}>{iconFor(p)}</Text><Text style={{flex:1,fontSize:15,color:c.text}}>{p.title}</Text><Icon name="chevron" size={16} color={c.muted}/></Pressable>)}</View>:null}
    <Pressable onPress={()=>void create(selected)} style={{minHeight:48,justifyContent:'center',marginTop:8}}><Text style={{color:c.muted,fontSize:14}}>＋ Nova subpágina</Text></Pressable>
    <Button title="Salvar agora" secondary loading={saving} onPress={()=>void save()}/>
   </View>
  </ScrollView>
 </View>;
}

function PageTree({page,depth,children,c,onOpen}:{page:Entity;depth:number;children:Map<string,Entity[]>;c:any;onOpen:(p:Entity)=>void}){
 const kids=children.get(page.id)||[];
 return <View><Pressable onPress={()=>onOpen(page)} style={({pressed})=>({minHeight:54,flexDirection:'row',alignItems:'center',gap:11,paddingLeft:14+depth*18,paddingRight:12,borderRadius:10,backgroundColor:pressed?c.input:'transparent'})}><Text style={{fontSize:22}}>{iconFor(page)}</Text><View style={{flex:1}}><Text numberOfLines={1} style={{fontSize:15,color:c.text,fontWeight:depth===0?'600':'400'}}>{page.title}</Text>{depth===0&&kids.length?<Text style={{fontSize:11,color:c.muted,marginTop:2}}>{kids.length} subpágina{kids.length===1?'':'s'}</Text>:null}</View><Icon name="chevron" size={16} color={c.muted}/></Pressable>{kids.map(p=><PageTree key={p.id} page={p} depth={Math.min(depth+1,4)} children={children} c={c} onOpen={onOpen}/>)}</View>;
}
