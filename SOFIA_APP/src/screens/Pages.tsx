import React,{useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,ScrollView,TextInput,Pressable,Switch,Alert,RefreshControl,BackHandler,AppState,Keyboard,Image} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SofiaApi,SITE} from '../lib/api';
import type {Entity} from '../lib/types';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {PageEditorStore,newBlock,expandedIds,toggleExpanded} from '../lib/page-editor';
import type {PageBlock,PageDraft} from '../lib/page-editor';
import {Empty,ErrorBanner,IconButton} from '../components/UI';
import {Icon} from '../components/Icon';
import {PageCover,PageAppearance,PAGE_COVERS} from '../components/PageAppearance';
const iconFor=(page:Entity)=>String(page.data?.icon||'').trim()||'📄';
const safeJson=(raw:string|null,fallback:unknown)=>{try{return JSON.parse(raw||'null')??fallback;}catch{return fallback;}};

export function Pages({api,active,storageScope}:{api:SofiaApi;active:boolean;storageScope:string}){
 const c=useTheme(),[pages,setPages]=useState<Entity[]>([]),[selectedId,setSelectedId]=useState<string|null>(null),[tick,setTick]=useState(0),[expanded,setExpanded]=useState(new Set<string>());
 const [refreshing,setRefreshing]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[focus,setFocus]=useState<string|null>(null),[appearance,setAppearance]=useState<'icon'|'cover'|null>(null);
 const history=useRef<string[]>([]),mounted=useRef(true),expandDisk=useRef(Promise.resolve()),inputRefs=useRef(new Map<string,TextInput>());
 const key='sofia.native.pages.v1:'+encodeURIComponent(SITE+'|'+storageScope);
 const store=useMemo(()=>new PageEditorStore({save:patch=>api.saveEntity(patch),read:id=>api.entity(id),
  persist:items=>items.length?AsyncStorage.setItem(key+':drafts',JSON.stringify(items)):AsyncStorage.removeItem(key+':drafts'),
  onSaved:saved=>{if(mounted.current)setPages(prev=>prev.map(p=>p.id===saved.id?saved:p));}
 }),[api,key]);
 useEffect(()=>store.subscribe(()=>setTick(v=>v+1)),[store]);
 async function load(manual=false){if(manual)setRefreshing(true);try{
  const items:Entity[]=[];for(let offset=0;offset<10000;offset+=100){const r=await api.entities('user_page','',offset);items.push(...r.items.filter(x=>x.state!=='archived'));if(r.items.length<100)break;}
  if(mounted.current){items.forEach(page=>store.open(page));setPages(items);setError('');}
 }catch(e){if(mounted.current)setError(errorText(e));}finally{if(manual&&mounted.current)setRefreshing(false);}}
 useEffect(()=>{
  mounted.current=true;let alive=true;setReady(false);
  void Promise.all([AsyncStorage.getItem(key+':drafts'),AsyncStorage.getItem(key+':expanded')]).then(async([drafts,branches])=>{
   if(!alive)return;store.restore(safeJson(drafts,[]));setExpanded(expandedIds(safeJson(branches,[])));await load();if(alive){setReady(true);store.resume();}
  }).catch(e=>{if(alive){setError(errorText(e));setReady(true);void load();}});
  const state=AppState.addEventListener('change',()=>{void store.flushAll();});
  const keyboard=Keyboard.addListener('keyboardDidHide',()=>setFocus(null));
  return()=>{alive=false;mounted.current=false;state.remove();keyboard.remove();void store.flushAll().finally(()=>store.dispose());};
 },[store,key]);
 useEffect(()=>{if(!active){setFocus(null);void store.flushAll();}},[active,store]);
 const displayPages=useMemo(()=>pages.map(p=>{const e=store.get(p.id);return e?{...p,title:e.draft.title.trim()||'Sem título',data:{...p.data,...e.draft.appearance}}:p;}),[pages,store,tick]);
 const byId=useMemo(()=>new Map(displayPages.map(p=>[p.id,p])),[displayPages]);
 const children=useMemo(()=>{const m=new Map<string,Entity[]>();for(const p of displayPages){const parent=String(p.data?.parent_id||'');if(!m.has(parent))m.set(parent,[]);m.get(parent)!.push(p);}for(const list of m.values())list.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));return m;},[displayPages]);
 const entry=selectedId?store.get(selectedId):undefined;
 useEffect(()=>{if(active&&focus&&focus!=='title')inputRefs.current.get(focus)?.focus();},[focus,selectedId,active]);
 function toggle(id:string){setExpanded(old=>{const next=toggleExpanded(old,id),value=JSON.stringify([...next]);expandDisk.current=expandDisk.current.catch(()=>{}).then(()=>AsyncStorage.setItem(key+':expanded',value)).catch(()=>{if(mounted.current)setError('Não foi possível guardar a abertura das subpáginas neste aparelho.');});return next;});}
 function open(page:Entity,push=true){if(selectedId){void store.flush(selectedId);if(push&&selectedId!==page.id)history.current.push(selectedId);}store.open(pages.find(p=>p.id===page.id)||page);setSelectedId(page.id);setFocus(null);setAppearance(null);setError('');}
 function back(){if(selectedId)void store.flush(selectedId);setFocus(null);setAppearance(null);let id=history.current.pop();while(id&&!byId.has(id))id=history.current.pop();if(id)open(byId.get(id)!,false);else setSelectedId(null);}
 useEffect(()=>{if(!active)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(!selectedId)return false;back();return true;});return()=>sub.remove();},[active,selectedId,byId,store]);
 function edit(change:(draft:PageDraft)=>PageDraft,group=''){if(selectedId)store.edit(selectedId,change,group);}
 async function create(parent?:Entity){try{const saved=await api.saveEntity({kind:'user_page',title:'Sem título',content:'',area:parent?.area||'Pessoal',privacy:'private',state:'active',tags:[],data:{icon:'',icon_mode:'default',cover_type:'preset',cover_value:PAGE_COVERS[0][1],cover_attachment_id:'',purpose:'',layout:'notes',suggested:false,parent_id:parent?.id||'',node_type:parent?'page':'space',blocks_json:'[]'}});if(!mounted.current)return;setPages(old=>[...old,saved]);open(saved);}catch(e){setError(errorText(e));}}
 function updateBlock(block:PageBlock,patch:Partial<PageBlock>,group=''){edit(d=>({...d,blocks:d.blocks.map(b=>b.id===block.id?{...b,...patch}:b)}),group);}
 function removeBlock(id:string){edit(d=>{const blocks=d.blocks.filter(b=>b.id!==id);return {...d,blocks:blocks.length?blocks:[newBlock()]};});setFocus(null);}
 function addBlock(){const block=newBlock();edit(d=>{const blocks=[...d.blocks],i=blocks.findIndex(b=>b.id===focus);blocks.splice(i>=0?i+1:blocks.length,0,block);return {...d,blocks};});setFocus(block.id);}
 function formatBlock(type:string){if(!entry)return;const id=focus&&focus!=='title'?focus:entry.draft.blocks.at(-1)?.id;if(!id)return;edit(d=>({...d,blocks:d.blocks.map(b=>b.id===id?{...b,type,...(b.text==='/'?{text:'',html:''}:{})}:b)}));}
 function resolveConflict(){if(!selectedId)return;const id=selectedId;Alert.alert('A página mudou no site','Seu rascunho local foi preservado. Qual versão deve continuar?',[
  {text:'Cancelar',style:'cancel'},{text:'Usar versão do site',onPress:()=>void store.resolve(id,false)},{text:'Manter minhas alterações',onPress:()=>void store.resolve(id,true)}]);}
 function removePage(){if(!entry)return;const id=entry.base.id;Alert.alert('Excluir página?','A página e suas subpáginas serão removidas também do site.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{void(async()=>{
  const ids=new Set<string>();const collect=(key:string)=>{if(ids.has(key))return;ids.add(key);for(const p of children.get(key)||[])collect(p.id);};collect(id);
  await Promise.all([...ids].map(key=>store.flush(key)));await api.deleteEntity(id);for(const key of ids)store.forget(key);
  if(mounted.current){history.current=history.current.filter(key=>!ids.has(key));setPages(old=>old.filter(p=>!ids.has(p.id)));setSelectedId(null);setFocus(null);}
 })().catch(e=>setError(errorText(e)));}}]);}
 function blockView(b:PageBlock,i:number){
  if(b.type==='divider')return <Pressable key={b.id} accessibilityLabel="Divisor" onLongPress={()=>removeBlock(b.id)} style={{paddingVertical:14}}><View style={{height:1,backgroundColor:c.line}}/></Pressable>;
  if(b.type==='image'&&b.data?.attachment_id)return <View key={b.id} style={{marginVertical:8}}><Image source={api.attachmentSource(String(b.data.attachment_id))} style={{width:'100%',height:210,borderRadius:8}} resizeMode="contain"/>{b.data.caption?<Text style={{color:c.muted,fontSize:12}}>{String(b.data.caption)}</Text>:null}</View>;
  if(['image','file','table','collection','bookmark'].includes(b.type))return <View key={b.id} style={{padding:12,borderRadius:8,backgroundColor:c.input,marginVertical:5}}><Text style={{color:c.text,fontSize:13}}>{b.text||({table:'Tabela',collection:'Banco de dados',image:'Imagem',file:'Arquivo',bookmark:'Link'} as Record<string,string>)[b.type]}</Text><Text style={{color:c.muted,fontSize:11,marginTop:4}}>Bloco preservado; edição completa no site.</Text></View>;
  const heading=b.type==='heading1'?30:b.type==='heading2'?24:b.type==='heading3'?20:16;
  const prefix=b.type==='bullet'?'• ':b.type==='number'?String(i+1)+'. ':b.type==='quote'?'│ ':b.type==='callout'?'💡 ':'';
  return <View key={b.id} style={{flexDirection:'row',alignItems:'flex-start',gap:b.type==='todo'?7:0}}>
   {b.type==='todo'?<Switch accessibilityLabel="Concluir tarefa" value={!!b.checked} onValueChange={checked=>updateBlock(b,{checked})}/>:prefix?<Text style={{fontSize:heading,lineHeight:heading+9,color:c.muted,paddingTop:4}}>{prefix}</Text>:null}
   <TextInput ref={node=>{if(node)inputRefs.current.set(b.id,node);else inputRefs.current.delete(b.id);}} accessibilityLabel={'Conteúdo do bloco '+(i+1)} value={b.text||''} onChangeText={text=>updateBlock(b,{text,html:''},'text:'+b.id)}
    onFocus={()=>setFocus(b.id)} onBlur={()=>{if(selectedId)void store.flush(selectedId);}} multiline placeholder={focus===b.id?'Digite / para opções':''} placeholderTextColor={c.muted}
    style={{flex:1,minHeight:42,color:c.text,fontSize:heading,lineHeight:heading+9,fontWeight:b.type.startsWith('heading')?'700':'400',paddingVertical:4,fontFamily:b.type==='code'?'monospace':undefined,backgroundColor:b.type==='code'?c.input:'transparent',borderRadius:8,paddingHorizontal:b.type==='code'?10:0}}/>
  </View>;
 }
 if(!entry)return <ScrollView style={{flex:1,backgroundColor:c.bg}} contentContainerStyle={{paddingBottom:34}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={c.accent}/>}>
  <View style={{paddingHorizontal:20,paddingTop:18,paddingBottom:12,flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text,fontSize:30,fontWeight:'800',letterSpacing:-1}}>Páginas</Text><IconButton name="plus" label="Nova página" filled disabled={!ready} onPress={()=>void create()}/></View>
  {error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}
  <View style={{paddingHorizontal:10}}>{(children.get('')||[]).map(root=><PageTree key={root.id} page={root} children={children} expanded={expanded} toggle={toggle} onOpen={open}/>)}</View>
  {ready&&!pages.length?<Empty icon="book" title="Sua primeira página" body="Toque em + para criar uma página."/>:null}
 </ScrollView>;
 const draft=entry.draft,selected={...entry.base,data:{...entry.base.data,...draft.appearance}},subpages=children.get(selected.id)||[];
 const path:Entity[]=[];let cur:Entity|undefined=selected;const seen=new Set<string>();while(cur&&!seen.has(cur.id)&&path.length<40){seen.add(cur.id);path.unshift(cur);cur=byId.get(String(cur.data?.parent_id||''));}
 const status=entry.state==='saving'?'Salvando…':entry.state==='pending'?'Sincronizando…':entry.state==='error'?'Não salvo':entry.state==='conflict'?'Conflito':'Salvo';
 const hasCover=!!draft.appearance.cover_type;
 return <View style={{flex:1,backgroundColor:c.bg}}>
  <View style={{minHeight:54,flexDirection:'row',alignItems:'center',paddingHorizontal:4,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}>
   <IconButton name="back" label="Voltar" size={34} onPress={back}/><IconButton name="undo" label="Desfazer" size={34} disabled={!entry.past.length} onPress={()=>store.undo(selected.id)}/><IconButton name="redo" label="Refazer" size={34} disabled={!entry.future.length} onPress={()=>store.redo(selected.id)}/>
   <View style={{flex:1,paddingHorizontal:5}}><Text numberOfLines={1} style={{color:c.muted,fontSize:11}}>{path.map(p=>p.title).join(' › ')}</Text><Text accessibilityLiveRegion="polite" style={{color:entry.state==='error'||entry.state==='conflict'?c.danger:c.muted,fontSize:9,marginTop:3}}>{status}</Text></View>
   <IconButton name="plus" label="Criar subpágina" size={34} onPress={()=>void create(selected)}/><IconButton name="trash" label="Excluir página" size={34} onPress={removePage}/>
  </View>
  {error?<ErrorBanner text={error}/>:null}{entry.error?<ErrorBanner text={entry.error} onRetry={entry.state==='conflict'?resolveConflict:()=>void store.flush(selected.id)}/>:null}
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:60}}>
   <Pressable accessibilityRole="button" accessibilityLabel={hasCover?'Alterar capa':'Adicionar capa'} onPress={()=>setAppearance('cover')} style={{height:hasCover?132:44,overflow:'hidden',backgroundColor:hasCover?c.accentSoft:'transparent'}}>
    {hasCover?<PageCover data={draft.appearance} api={api}/>:<View style={{alignSelf:'flex-end',padding:12,opacity:.55}}><Icon name="image" size={20} color={c.muted}/></View>}
   </Pressable>
   <View style={{paddingHorizontal:24,marginTop:hasCover?-28:0}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Alterar ícone da página" onPress={()=>setAppearance('icon')} style={{width:60,height:60,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.line}}><Text style={{fontSize:34,color:c.text}}>{String(draft.appearance.icon||'📄')}</Text></Pressable>
    <TextInput accessibilityLabel="Título da página" value={draft.title==='Sem título'?'':draft.title} onChangeText={title=>edit(d=>({...d,title}),'title')} onFocus={()=>setFocus('title')} onBlur={()=>void store.flush(selected.id)} multiline placeholder={focus==='title'?'Sem título':''} placeholderTextColor={c.muted} style={{minHeight:65,fontSize:34,lineHeight:42,fontWeight:'800',letterSpacing:-1,color:c.text,paddingVertical:14}}/>
    {String(selected.data.purpose||'').trim()?<Text style={{fontSize:13,lineHeight:20,color:c.muted,marginBottom:12}}>{String(selected.data.purpose)}</Text>:null}
    <View style={{gap:6}}>{draft.blocks.map(blockView)}</View>
    {focus&&focus!=='title'?<View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,paddingVertical:8}}>
     <IconButton name="plus" label="Adicionar bloco" size={34} onPress={addBlock}/>
     {([['text','Texto'],['heading2','Título'],['bullet','Lista'],['todo','Tarefa'],['divider','Divisor']] as const).map(([type,label])=><Pressable key={type} accessibilityRole="button" onPress={()=>formatBlock(type)} style={{paddingHorizontal:9,paddingVertical:9,borderRadius:8,backgroundColor:c.input}}><Text style={{fontSize:11,color:c.muted}}>{label}</Text></Pressable>)}
     <IconButton name="trash" label="Remover bloco selecionado" size={34} onPress={()=>removeBlock(focus)}/>
    </View>:null}
    <Pressable accessibilityLabel="Continuar escrevendo" onPress={()=>{const last=draft.blocks.at(-1);if(last&&['text','heading1','heading2','heading3','bullet','todo','number','quote','code','callout'].includes(last.type)){setFocus(last.id);inputRefs.current.get(last.id)?.focus();}else addBlock();}} style={{minHeight:80}}/>
    {subpages.length?<View style={{marginTop:4}}><Pressable accessibilityRole="button" accessibilityLabel="Subpáginas" accessibilityState={{expanded:expanded.has(selected.id)}} onPress={()=>toggle(selected.id)} style={{flexDirection:'row',gap:8,alignItems:'center',minHeight:44}}><View style={{transform:[{rotate:expanded.has(selected.id)?'90deg':'0deg'}]}}><Icon name="chevron" color={c.muted} size={16}/></View><Text style={{color:c.muted,fontSize:12,fontWeight:'600'}}>Subpáginas · {subpages.length}</Text></Pressable>
     {expanded.has(selected.id)?subpages.map(page=><PageTree key={page.id} page={page} children={children} expanded={expanded} toggle={toggle} onOpen={open}/>):null}
    </View>:null}
   </View>
  </ScrollView>
  {appearance?<PageAppearance key={selected.id+appearance} api={api} pageId={selected.id} kind={appearance} onClose={()=>setAppearance(null)} onApply={patch=>{store.edit(selected.id,d=>({...d,appearance:{...d.appearance,...patch}}));void store.flush(selected.id);}}/>:null}
 </View>;
}
function PageTree({page,children,expanded,toggle,onOpen,ancestors=[]}:{page:Entity;children:Map<string,Entity[]>;expanded:Set<string>;toggle:(id:string)=>void;onOpen:(p:Entity)=>void;ancestors?:string[]}){
 const c=useTheme();if(ancestors.includes(page.id)||ancestors.length>40)return null;const kids=children.get(page.id)||[],open=expanded.has(page.id);
 return <View><View style={{flexDirection:'row',alignItems:'center',paddingLeft:Math.min(ancestors.length,5)*14}}>
  {kids.length?<Pressable accessibilityRole="button" accessibilityLabel={open?'Recolher subpáginas de '+page.title:'Expandir subpáginas de '+page.title} accessibilityState={{expanded:open}} onPress={()=>toggle(page.id)} style={{width:32,minHeight:52,justifyContent:'center',alignItems:'center'}}><View style={{transform:[{rotate:open?'90deg':'0deg'}]}}><Icon name="chevron" size={15} color={c.muted}/></View></Pressable>:<View style={{width:32}}/>}
  <Pressable onPress={()=>onOpen(page)} style={({pressed})=>({flex:1,minHeight:52,flexDirection:'row',alignItems:'center',gap:10,paddingRight:10,borderRadius:10,backgroundColor:pressed?c.input:'transparent'})}><Text style={{fontSize:22,color:c.text}}>{iconFor(page)}</Text><Text numberOfLines={1} style={{flex:1,fontSize:15,color:c.text,fontWeight:ancestors.length?'400':'600'}}>{page.title}</Text></Pressable>
 </View>{open?kids.map(child=><PageTree key={child.id} page={child} children={children} expanded={expanded} toggle={toggle} onOpen={onOpen} ancestors={[...ancestors,page.id]}/>):null}</View>;
}
