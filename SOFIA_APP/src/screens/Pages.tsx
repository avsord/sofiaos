import React,{useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,ScrollView,TextInput,Pressable,Switch,Alert,RefreshControl,BackHandler,AppState,Keyboard,Image,Animated,PanResponder} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SofiaApi,SITE} from '../lib/api';
import type {Entity} from '../lib/types';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {PageEditorStore,newBlock,expandedIds,toggleExpanded} from '../lib/page-editor';
import type {PageBlock,PageDraft} from '../lib/page-editor';
import {pageBodyIsEmpty,pageBlockHint} from '../lib/page-hints';
import {Empty,ErrorBanner,IconButton} from '../components/UI';
import {Icon} from '../components/Icon';
import {PageCover,PageAppearance,PAGE_COVERS} from '../components/PageAppearance';
import {PageTreeList} from '../components/PageTreeList';
import {canReparentPage,reparentPatch,reparentedPage} from '../lib/page-hierarchy';
import {PageCreateMenu} from '../components/PageTemplatePicker';
import {NativeCollectionBlock} from '../components/NativeCollectionBlock';
import {freshTemplate} from '../lib/page-templates';
import type {PageTemplate} from '../lib/page-templates';
const safeJson=(raw:string|null,fallback:unknown)=>{try{return JSON.parse(raw||'null')??fallback;}catch{return fallback;}};

export function Pages({api,active,storageScope,onDepthChange}:{api:SofiaApi;active:boolean;storageScope:string;onDepthChange?:(open:boolean)=>void}){
 const c=useTheme(),[pages,setPages]=useState<Entity[]>([]),[selectedId,setSelectedId]=useState<string|null>(null),[tick,setTick]=useState(0),[expanded,setExpanded]=useState(new Set<string>());
 const [refreshing,setRefreshing]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[focus,setFocus]=useState<string|null>(null),[appearance,setAppearance]=useState<'icon'|'cover'|null>(null),[movingId,setMovingId]=useState<string|null>(null),[createParent,setCreateParent]=useState<Entity|null|undefined>(undefined);
 const history=useRef<string[]>([]),mounted=useRef(true),expandDisk=useRef(Promise.resolve()),inputRefs=useRef(new Map<string,TextInput>());
 const backX=useRef(new Animated.Value(0)).current,selectedRef=useRef<string|null>(null),paneWidth=useRef(0),backAction=useRef<()=>void>(()=>{});
 selectedRef.current=selectedId;
 const pageBackResponder=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_e,g)=>!!selectedRef.current&&g.dx>8&&Math.abs(g.dx)>Math.abs(g.dy)*1.15,
  onMoveShouldSetPanResponderCapture:(_e,g)=>!!selectedRef.current&&g.dx>8&&Math.abs(g.dx)>Math.abs(g.dy)*1.15,
  onPanResponderGrant:()=>backX.stopAnimation(),
  onPanResponderMove:(_e,g)=>backX.setValue(Math.max(0,Math.min(paneWidth.current||420,g.dx))),
  onPanResponderRelease:(_e,g)=>{
   const width=paneWidth.current||420,leave=g.dx>width*.28||g.vx>.65;
   if(leave)Animated.timing(backX,{toValue:width,duration:150,useNativeDriver:true}).start(({finished})=>{if(finished){backAction.current();backX.setValue(0);}});
   else Animated.spring(backX,{toValue:0,useNativeDriver:true,speed:28,bounciness:3}).start();
  },
  onPanResponderTerminate:()=>Animated.spring(backX,{toValue:0,useNativeDriver:true,speed:28,bounciness:3}).start(),
  onPanResponderTerminationRequest:()=>false,
  onShouldBlockNativeResponder:()=>true
 }),[backX]);
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
 useEffect(()=>{onDepthChange?.(!!selectedId);if(!selectedId)backX.setValue(0);},[selectedId,onDepthChange,backX]);
 useEffect(()=>()=>onDepthChange?.(false),[onDepthChange]);
 const displayPages=useMemo(()=>pages.map(p=>{const e=store.get(p.id);return e?{...p,title:e.draft.title.trim()||'Sem título',data:{...p.data,...e.draft.appearance}}:p;}),[pages,store,tick]);
 const byId=useMemo(()=>new Map(displayPages.map(p=>[p.id,p])),[displayPages]);
 const children=useMemo(()=>{const m=new Map<string,Entity[]>();for(const p of displayPages){const parent=String(p.data?.parent_id||'');if(!m.has(parent))m.set(parent,[]);m.get(parent)!.push(p);}for(const list of m.values())list.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));return m;},[displayPages]);
 const entry=selectedId?store.get(selectedId):undefined;
 const emptyBody=entry?pageBodyIsEmpty(entry.draft.blocks):true;
 const hasSubpageContent=!!(selectedId&&(children.get(selectedId)||[]).length);
 const showBodyGuide=emptyBody&&!hasSubpageContent;
 const placeholderColor=c.muted+'80';
 useEffect(()=>{if(active&&focus&&focus!=='title')inputRefs.current.get(focus)?.focus();},[focus,selectedId,active]);
 function toggle(id:string){setExpanded(old=>{const next=toggleExpanded(old,id),value=JSON.stringify([...next]);expandDisk.current=expandDisk.current.catch(()=>{}).then(()=>AsyncStorage.setItem(key+':expanded',value)).catch(()=>{if(mounted.current)setError('Não foi possível guardar a abertura das subpáginas neste aparelho.');});return next;});}
 function canParent(pageId:string,parentId:string){return canReparentPage(displayPages,pageId,parentId);}
 async function movePage(page:Entity,parentId:string){
  if(movingId||String(page.data?.parent_id||'')===parentId)return;
  if(!canParent(page.id,parentId)){setError('Essa página não pode ser colocada dentro dela mesma ou de uma subpágina dela.');return;}
  const before=pages;
  setMovingId(page.id);setError('');
  setPages(old=>old.map(item=>item.id===page.id?reparentedPage(item,parentId):item));
  if(parentId)setExpanded(old=>{const next=new Set(old);next.add(parentId);const value=JSON.stringify([...next]);expandDisk.current=expandDisk.current.catch(()=>{}).then(()=>AsyncStorage.setItem(key+':expanded',value)).catch(()=>{});return next;});
  try{
   await store.flush(page.id);
   const base=store.get(page.id)?.base||pages.find(item=>item.id===page.id);
   if(!base)throw new Error('Página não encontrada.');
   const saved=await api.saveEntity(reparentPatch(base,parentId));store.open(saved);
   if(mounted.current)setPages(old=>old.map(item=>item.id===saved.id?saved:item));
  }catch(e){if(mounted.current){setPages(before);setError(errorText(e));}}
  finally{if(mounted.current)setMovingId(null);}
 }
 function open(page:Entity,push=true){if(selectedId){void store.flush(selectedId);if(push&&selectedId!==page.id)history.current.push(selectedId);}store.open(pages.find(p=>p.id===page.id)||page);setSelectedId(page.id);setFocus(null);setAppearance(null);setError('');}
 function back(){if(selectedId)void store.flush(selectedId);setFocus(null);setAppearance(null);let id=history.current.pop();while(id&&!byId.has(id))id=history.current.pop();if(id)open(byId.get(id)!,false);else setSelectedId(null);} backAction.current=back;
 useEffect(()=>{if(!active)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(!selectedId)return false;back();return true;});return()=>sub.remove();},[active,selectedId,byId,store]);
 function edit(change:(draft:PageDraft)=>PageDraft,group=''){if(selectedId)store.edit(selectedId,change,group);}
 async function create(parent?:Entity,template?:PageTemplate){try{
  const preset=template?freshTemplate(template):null;
  const saved=await api.saveEntity({kind:'user_page',title:'Sem título',content:'',area:parent?.area||'Pessoal',privacy:'private',state:'active',tags:[],data:{
   icon:'',icon_mode:'default',cover_type:'preset',cover_value:PAGE_COVERS[0][1],cover_attachment_id:'',
   purpose:'',layout:'notes',suggested:false,parent_id:parent?.id||'',node_type:parent?'page':'space',blocks_json:preset?JSON.stringify(preset.blocks):'[]'
  }});
  if(!mounted.current)return;setPages(old=>[...old,saved]);open(saved);
 }catch(e){setError(errorText(e));}}
 function applyTemplate(template:PageTemplate){if(!selectedId)return;const preset=freshTemplate(template);store.edit(selectedId,d=>({...d,blocks:preset.blocks}),'template');setFocus(null);setCreateParent(undefined);void store.flush(selectedId);}
 function updateBlock(block:PageBlock,patch:Partial<PageBlock>,group=''){edit(d=>({...d,blocks:d.blocks.map(b=>b.id===block.id?{...b,...patch}:b)}),group);}
 function removeBlock(id:string){edit(d=>{const blocks=d.blocks.filter(b=>b.id!==id);return {...d,blocks:blocks.length?blocks:[newBlock()]};});setFocus(null);}
 function addBlock(){const block=newBlock();edit(d=>{const blocks=[...d.blocks],i=blocks.findIndex(b=>b.id===focus);blocks.splice(i>=0?i+1:blocks.length,0,block);return {...d,blocks};});setFocus(block.id);}
 function formatBlock(type:string){if(!entry)return;const id=focus&&focus!=='title'?focus:entry.draft.blocks.at(-1)?.id;if(!id)return;edit(d=>({...d,blocks:d.blocks.map(b=>b.id===id?{...b,type,...(b.text==='/'?{text:'',html:''}:{})}:b)}));}
 function resolveConflict(){if(!selectedId)return;const id=selectedId;Alert.alert('A página mudou no site','Seu rascunho local foi preservado. Qual versão deve continuar?',[
  {text:'Cancelar',style:'cancel'},{text:'Usar versão do site',onPress:()=>void store.resolve(id,false)},{text:'Manter minhas alterações',onPress:()=>void store.resolve(id,true)}]);}
 function confirmDeletePage(page:Entity){const id=page.id;Alert.alert('Excluir página?','A página e suas subpáginas serão removidas também do site.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{void(async()=>{
  const ids=new Set<string>();const collect=(key:string)=>{if(ids.has(key))return;ids.add(key);for(const p of children.get(key)||[])collect(p.id);};collect(id);
  await Promise.all([...ids].map(key=>store.flush(key)));await api.deleteEntity(id);for(const key of ids)store.forget(key);
  if(mounted.current){history.current=history.current.filter(key=>!ids.has(key));setPages(old=>old.filter(p=>!ids.has(p.id)));if(ids.has(selectedId||''))setSelectedId(null);setFocus(null);}
 })().catch(e=>setError(errorText(e)));}}]);}
 function removePage(){if(entry)confirmDeletePage(entry.base);}
 function blockView(b:PageBlock,i:number){
  if(b.type==='divider')return <Pressable key={b.id} accessibilityLabel="Divisor" onLongPress={()=>removeBlock(b.id)} style={{paddingVertical:14}}><View style={{height:1,backgroundColor:c.line}}/></Pressable>;
  if(b.type==='image'&&b.data?.attachment_id)return <View key={b.id} style={{marginVertical:8}}><Image source={api.attachmentSource(String(b.data.attachment_id))} style={{width:'100%',height:210,borderRadius:8}} resizeMode="contain"/>{b.data.caption?<Text style={{color:c.muted,fontSize:12}}>{String(b.data.caption)}</Text>:null}</View>;
  if(b.type==='collection')return <NativeCollectionBlock key={b.id} block={b} onChange={(data,group)=>updateBlock(b,{data},group)}/>;
  if(['image','file','table','bookmark'].includes(b.type))return <View key={b.id} style={{padding:12,borderRadius:8,backgroundColor:c.input,marginVertical:5}}><Text style={{color:c.text,fontSize:13}}>{b.text||({table:'Tabela',image:'Imagem',file:'Arquivo',bookmark:'Link'} as Record<string,string>)[b.type]}</Text><Text style={{color:c.muted,fontSize:11,marginTop:4}}>Bloco preservado; edição completa no site.</Text></View>;
  const heading=b.type==='heading1'?30:b.type==='heading2'?24:b.type==='heading3'?20:16;
  const prefix=b.type==='bullet'?'• ':b.type==='number'?String(i+1)+'. ':b.type==='quote'?'│ ':b.type==='callout'?'💡 ':'';
  return <View key={b.id} style={{flexDirection:'row',alignItems:'flex-start',gap:b.type==='todo'?7:0}}>
   {b.type==='todo'?<Switch accessibilityLabel="Concluir tarefa" value={!!b.checked} onValueChange={checked=>updateBlock(b,{checked})}/>:prefix?<Text style={{fontSize:heading,lineHeight:heading+9,color:c.muted,paddingTop:4}}>{prefix}</Text>:null}
   <TextInput ref={node=>{if(node)inputRefs.current.set(b.id,node);else inputRefs.current.delete(b.id);}} accessibilityLabel={'Conteúdo do bloco '+(i+1)} value={b.text||''} onChangeText={text=>updateBlock(b,{text,html:''},'text:'+b.id)}
    onFocus={()=>setFocus(b.id)} onBlur={()=>{if(selectedId)void store.flush(selectedId);}} multiline placeholder={pageBlockHint(b,i,showBodyGuide,focus===b.id)} placeholderTextColor={placeholderColor}
    style={{flex:1,minHeight:(!b.text&&!b.html&&!pageBlockHint(b,i,showBodyGuide,focus===b.id)&&focus!==b.id)?0:42,height:(!b.text&&!b.html&&!pageBlockHint(b,i,showBodyGuide,focus===b.id)&&focus!==b.id)?0:undefined,color:c.text,fontSize:heading,lineHeight:heading+9,fontWeight:b.type.startsWith('heading')?'700':'400',paddingVertical:(!b.text&&!b.html&&!pageBlockHint(b,i,showBodyGuide,focus===b.id)&&focus!==b.id)?0:4,fontFamily:b.type==='code'?'monospace':undefined,backgroundColor:b.type==='code'?c.input:'transparent',borderRadius:8,paddingHorizontal:b.type==='code'?10:0}}/>
  </View>;
 }
 const listView=<ScrollView style={{flex:1,backgroundColor:c.bg}} contentContainerStyle={{paddingBottom:34}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={c.accent}/>}>
  <View style={{paddingHorizontal:20,paddingTop:18,paddingBottom:12,flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text,fontSize:30,fontWeight:'800',letterSpacing:-1}}>Páginas</Text><IconButton name="plus" label="Criar página" filled disabled={!ready} onPress={()=>setCreateParent(null)}/></View>
  {error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}
  <View style={{paddingHorizontal:10}}><PageTreeList roots={children.get('')||[]} children={children} expanded={expanded} toggle={toggle} onOpen={open} onMove={movePage} canParent={canParent} onDelete={confirmDeletePage}/></View>
  {ready&&!pages.length?<Empty icon="book" title="Sua primeira página" body="Toque em + para criar uma página."/>:null}
 </ScrollView>;
 const createPicker=<PageCreateMenu visible={createParent!==undefined} parentTitle={createParent?.title} onClose={()=>setCreateParent(undefined)}
  onBlank={()=>void create(createParent||undefined)} onTemplate={template=>selectedId?applyTemplate(template):void create(undefined,template)}/>;
 if(!entry)return <View style={{flex:1}} onLayout={e=>{paneWidth.current=e.nativeEvent.layout.width;}}>{listView}{createPicker}</View>;
 const draft=entry.draft,selected={...entry.base,data:{...entry.base.data,...draft.appearance}},subpages=children.get(selected.id)||[];
 const path:Entity[]=[];let cur:Entity|undefined=selected;const seen=new Set<string>();while(cur&&!seen.has(cur.id)&&path.length<40){seen.add(cur.id);path.unshift(cur);cur=byId.get(String(cur.data?.parent_id||''));}
 const status=entry.state==='saving'?'Salvando…':entry.state==='pending'?'Sincronizando…':entry.state==='error'?'Não salvo':entry.state==='conflict'?'Conflito':selected.privacy==='private'?'Particular':selected.area;
 const hasCover=!!draft.appearance.cover_type;
 const editor=<View style={{flex:1,backgroundColor:c.bg}}>
  <View style={{minHeight:54,flexDirection:'row',alignItems:'center',paddingHorizontal:4,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}>
   <IconButton name="back" label="Voltar" size={34} onPress={back}/>
   <View style={{flex:1,minWidth:0,paddingHorizontal:5}}><Text numberOfLines={1} style={{color:c.text,fontSize:15,fontWeight:'700'}}>{selected.title}</Text><Text accessibilityLiveRegion="polite" style={{color:entry.state==='error'||entry.state==='conflict'?c.danger:c.muted,fontSize:9,marginTop:3}}>{status}</Text></View>
   <View testID="page-tools-right" style={{flexDirection:'row',alignItems:'center',flexShrink:0}}>
    <IconButton name="undo" label="Desfazer" size={34} disabled={!entry.past.length} onPress={()=>store.undo(selected.id)}/>
    <IconButton name="redo" label="Refazer" size={34} disabled={!entry.future.length} onPress={()=>store.redo(selected.id)}/>
    <IconButton name="plus" label="Criar página ou usar template" size={34} onPress={()=>setCreateParent(selected)}/>
    <IconButton name="trash" label="Excluir página" size={34} onPress={removePage}/>
   </View>
  </View>
  {error?<ErrorBanner text={error}/>:null}{entry.error?<ErrorBanner text={entry.error} onRetry={entry.state==='conflict'?resolveConflict:()=>void store.flush(selected.id)}/>:null}
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:60}}>
   <Pressable accessibilityRole="button" accessibilityLabel={hasCover?'Alterar capa':'Adicionar capa'} onPress={()=>setAppearance('cover')} style={{height:hasCover?190:28,overflow:'hidden',backgroundColor:hasCover?c.accentSoft:'transparent'}}>
    {hasCover?<PageCover data={draft.appearance} api={api}/>:<View style={{alignSelf:'flex-end',padding:12,opacity:.55}}><Icon name="image" size={20} color={c.muted}/></View>}
   </Pressable>
   <View style={{paddingHorizontal:30,marginTop:hasCover?-44:0}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Alterar ícone da página" onPress={()=>setAppearance('icon')} style={{width:78,height:78,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:58,color:c.text}}>{String(draft.appearance.icon||'📄')}</Text></Pressable>
    <TextInput accessibilityLabel="Título da página" value={draft.title==='Sem título'?'':draft.title} onChangeText={title=>edit(d=>({...d,title}),'title')} onFocus={()=>setFocus('title')} onBlur={()=>void store.flush(selected.id)} multiline placeholder="Título" placeholderTextColor={placeholderColor} style={{minHeight:60,fontSize:38,lineHeight:44,fontWeight:'800',letterSpacing:-1.2,color:c.text,paddingTop:8,paddingBottom:6}}/>
    {String(selected.data.purpose||'').trim()?<Text style={{fontSize:13,lineHeight:20,color:c.muted,marginBottom:12}}>{String(selected.data.purpose)}</Text>:null}
    <View style={{gap:2}}>{draft.blocks.map(blockView)}</View>
    {focus&&focus!=='title'?<View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,paddingVertical:8}}>
     <IconButton name="plus" label="Adicionar bloco" size={34} onPress={addBlock}/>
     {([['text','Texto'],['heading2','Título'],['bullet','Lista'],['todo','Tarefa'],['divider','Divisor']] as const).map(([type,label])=><Pressable key={type} accessibilityRole="button" onPress={()=>formatBlock(type)} style={{paddingHorizontal:9,paddingVertical:9,borderRadius:8,backgroundColor:c.input}}><Text style={{fontSize:11,color:c.muted}}>{label}</Text></Pressable>)}
     <IconButton name="trash" label="Remover bloco selecionado" size={34} onPress={()=>removeBlock(focus)}/>
    </View>:null}
    <Pressable accessibilityLabel="Continuar escrevendo" onPress={()=>{const last=draft.blocks.at(-1);if(last&&['text','heading1','heading2','heading3','bullet','todo','number','quote','code','callout'].includes(last.type)){setFocus(last.id);inputRefs.current.get(last.id)?.focus();}else addBlock();}} style={{minHeight:18}}/>
    {subpages.length?<View style={{marginTop:2}}>
      <PageTreeList roots={subpages} children={children} expanded={expanded} toggle={toggle} onOpen={open} onMove={movePage} canParent={canParent} onDelete={confirmDeletePage} compact/>
    </View>:null}
   </View>
  </ScrollView>
  {appearance?<PageAppearance key={selected.id+appearance} api={api} pageId={selected.id} kind={appearance} onClose={()=>setAppearance(null)} onApply={patch=>{store.edit(selected.id,d=>({...d,appearance:{...d.appearance,...patch}}));void store.flush(selected.id);}}/>:null}
 </View>;
 return <View style={{flex:1,backgroundColor:c.bg}} onLayout={e=>{paneWidth.current=e.nativeEvent.layout.width;}}>
  {listView}
  <Animated.View {...pageBackResponder.panHandlers} style={{position:'absolute',left:0,right:0,top:0,bottom:0,backgroundColor:c.bg,transform:[{translateX:backX}]}}>
   {editor}
  </Animated.View>
  {createPicker}
 </View>;
}
