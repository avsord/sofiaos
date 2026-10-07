import {KeyboardViewport} from '../components/KeyboardViewport';
import {KeyboardToolbar} from '../components/KeyboardToolbar';
import {MOTION_EASE,useKeyboardVisible,useReducedMotion} from '../lib/motion';
import {legacyMovePlan} from '../lib/legacy-md';
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {View,Text,ScrollView,TextInput,Pressable,Switch,Alert,RefreshControl,BackHandler,AppState,Keyboard,Image,Animated,PanResponder,Dimensions} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SofiaApi,SITE} from '../lib/api';
import type {Entity} from '../lib/types';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {PageEditorStore,newBlock,expandedIds,toggleExpanded} from '../lib/page-editor';
import type {PageBlock,PageDraft} from '../lib/page-editor';
import {pageBodyIsEmpty,pageBlockHint,pageTitleHint} from '../lib/page-hints';
import {Empty,ErrorBanner,IconButton,ScreenTitle} from '../components/UI';
import {PageRefreshGuard} from '../lib/page-gesture';
import {mergeRemotePages} from '../lib/page-sync';
import {entryBackTarget,shouldBeginPageBack} from '../lib/page-navigation';
import {Icon} from '../components/Icon';
import {PageCover,PageAppearance,PAGE_COVERS} from '../components/PageAppearance';
import {PageTreeList} from '../components/PageTreeList';
import {canReparentPage,reparentPatch,reparentedPage} from '../lib/page-hierarchy';
import {comparePageOrder} from '../lib/page-order';
import type {PageDrop} from '../lib/page-order';
import {PageCreateMenu} from '../components/PageTemplatePicker';
import {NativeCollectionBlock} from '../components/NativeCollectionBlock';
import {freshTemplate,insertTemplateBlocks} from '../lib/page-templates';
import {subscribeSystemChanged} from '../lib/system-events';
import type {PageTemplate} from '../lib/page-templates';
const safeJson=(raw:string|null,fallback:unknown)=>{try{return JSON.parse(raw||'null')??fallback;}catch{return fallback;}};

export function Pages({api,active,storageScope,onDepthChange}:{api:SofiaApi;active:boolean;storageScope:string;onDepthChange?:(open:boolean)=>void}){
 const keyboardVisible=useKeyboardVisible(),reduced=useReducedMotion(),reducedRef=useRef(reduced);reducedRef.current=reduced;
 const backCommitted=useRef(false),scrollPositions=useRef(new Map<string,number>());
 const c=useTheme(),[pages,setPages]=useState<Entity[]>([]),[selectedId,setSelectedId]=useState<string|null>(null),[tick,setTick]=useState(0),[expanded,setExpanded]=useState(new Set<string>()),[pageInteraction,setPageInteraction]=useState(false),[pageDragging,setPageDragging]=useState(false);
 const [refreshing,setRefreshing]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[focus,setFocus]=useState<string|null>(null),[appearance,setAppearance]=useState<'icon'|'cover'|null>(null),[movingId,setMovingId]=useState<string|null>(null),[createParent,setCreateParent]=useState<Entity|null|undefined>(undefined);
 const refreshFlight=useRef(false),mutationEpoch=useRef(0),moveBusy=useRef(false),pendingPosition=useRef(new Map<string,Record<string,any>>());
 const history=useRef<string[]>([]),mounted=useRef(true),expandDisk=useRef(Promise.resolve()),inputRefs=useRef(new Map<string,TextInput>());
 const backX=useRef(new Animated.Value(0)).current,selectedRef=useRef<string|null>(null),paneWidth=useRef(0),backAction=useRef<()=>void>(()=>{});
 const pageInteractionRef=useRef(false),refreshGuard=useRef(new PageRefreshGuard());
 function changePageInteraction(value:boolean){
  pageInteractionRef.current=value;refreshGuard.current.setActive(value);
  // RefreshControl is a composite component: its ref has no setNativeProps.
  // The synchronous guard rejects queued refresh callbacks; enabled controls native UI.
  setPageInteraction(value);onDepthChange?.(!!selectedRef.current||value);
 }
 function endPageTouch(){if(!pageInteractionRef.current)return;changePageInteraction(false);setPageDragging(false);}
 function refreshPages(){if(refreshGuard.current.canRefresh()&&!selectedRef.current)void load(true);}
 selectedRef.current=selectedId;
 const editingRef=useRef(false);editingRef.current=!!focus;
 const pageBackResponder=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_e,g)=>!!selectedRef.current&&!backCommitted.current&&shouldBeginPageBack(g,paneWidth.current||Dimensions.get('window').width,Dimensions.get('window').width,editingRef.current,pageInteractionRef.current),
  onMoveShouldSetPanResponderCapture:(_e,g)=>!!selectedRef.current&&!backCommitted.current&&shouldBeginPageBack(g,paneWidth.current||Dimensions.get('window').width,Dimensions.get('window').width,editingRef.current,pageInteractionRef.current),
  onPanResponderGrant:()=>backX.stopAnimation(),
  onPanResponderMove:(_e,g)=>backX.setValue(Math.max(0,Math.min(paneWidth.current||420,g.dx))),
  onPanResponderRelease:(_e,g)=>{
   const width=paneWidth.current||420,leave=g.dx>width*.28||g.vx>.65;
   if(leave){backCommitted.current=true;Animated.timing(backX,{toValue:width,duration:reducedRef.current?0:200,easing:MOTION_EASE,useNativeDriver:true}).start(({finished})=>{if(finished)backAction.current();else backCommitted.current=false;});}
   else Animated.spring(backX,{toValue:0,useNativeDriver:true,stiffness:300,damping:32,mass:.9,overshootClamping:true}).start();
  },
  onPanResponderTerminate:()=>Animated.spring(backX,{toValue:0,useNativeDriver:true,stiffness:300,damping:32,mass:.9,overshootClamping:true}).start(),
  onPanResponderTerminationRequest:()=>false,
  onShouldBlockNativeResponder:()=>true
 }),[backX]);
 const key='sofia.native.pages.v1:'+encodeURIComponent(SITE+'|'+storageScope);
 const store=useMemo(()=>new PageEditorStore({save:patch=>api.saveEntity(patch),read:id=>api.entity(id),
  persist:items=>items.length?AsyncStorage.setItem(key+':drafts',JSON.stringify(items)):AsyncStorage.removeItem(key+':drafts'),
  onSaved:saved=>{mutationEpoch.current++;if(mounted.current)setPages(prev=>prev.map(p=>p.id===saved.id?{...saved,data:{...saved.data,...pendingPosition.current.get(saved.id)}}:p));}
 }),[api,key]);
 useEffect(()=>store.subscribe(()=>setTick(v=>v+1)),[store]);
 useEffect(()=>subscribeSystemChanged(owner=>{if(owner===api)void load();}),[api,store]);
 async function load(manual=false){
  if(refreshFlight.current||moveBusy.current||(!manual&&pageInteractionRef.current))return;
  refreshFlight.current=true;const epoch=mutationEpoch.current;
  if(manual)setRefreshing(true);
  try{
   const items:Entity[]=[];
   for(let offset=0;offset<10000;offset+=100){const r=await api.entities('user_page','',offset);items.push(...r.items.filter(x=>x.state!=='archived'));if(r.items.length<100)break;if(offset===9900)throw Error('Há mais páginas do que esta sincronização consegue carregar. Nenhuma página foi removida.');}
   if(mounted.current&&!moveBusy.current&&epoch===mutationEpoch.current){
    items.forEach(page=>store.open(page));
    setPages(prev=>mergeRemotePages(prev,items.map(p=>{const e=store.get(p.id);return e&&e.base.revision>p.revision?e.base:p;}),id=>{const e=store.get(id);return !!e&&e.state!=='saved';}));setError('');
   }
  }catch(e){if(mounted.current)setError(errorText(e));}
  finally{refreshFlight.current=false;if(manual&&mounted.current)setRefreshing(false);}
 }
 const refreshLatest=useRef(load);refreshLatest.current=load;
 useEffect(()=>{
  if(!active||!ready)return;
  const refresh=()=>{if(AppState.currentState==='active'&&!pageInteractionRef.current)void refreshLatest.current();};
  refresh();const timer=setInterval(refresh,5000),subscription=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
  return()=>{clearInterval(timer);subscription.remove();};
 },[active,ready,store]);
 useEffect(()=>{
  mounted.current=true;let alive=true;setReady(false);
  void Promise.all([AsyncStorage.getItem(key+':drafts'),AsyncStorage.getItem(key+':expanded')]).then(async([drafts,branches])=>{
   if(!alive)return;store.restore(safeJson(drafts,[]));setExpanded(expandedIds(safeJson(branches,[])));await load();if(alive){setReady(true);store.resume();}
  }).catch(e=>{if(alive){setError(errorText(e));setReady(true);void load();}});
  const state=AppState.addEventListener('change',()=>{void store.flushAll();});
  const keyboard=Keyboard.addListener('keyboardDidHide',()=>setFocus(null));
  return()=>{alive=false;mounted.current=false;state.remove();keyboard.remove();void store.flushAll().finally(()=>store.dispose());};
 },[store,key]);
 useEffect(()=>{if(!active){endPageTouch();setFocus(null);void store.flushAll();}},[active,store]);
 useLayoutEffect(()=>{backX.stopAnimation();backX.setValue(0);backCommitted.current=false;},[selectedId,backX]);
 useEffect(()=>{onDepthChange?.(!!selectedId||pageInteraction);},[selectedId,pageInteraction,onDepthChange,backX]);
 useEffect(()=>()=>onDepthChange?.(false),[onDepthChange]);
 const displayPages=useMemo(()=>pages.map(p=>{const e=store.get(p.id);return e?{...p,title:e.draft.title.trim()||'Sem título',data:{...p.data,...e.draft.appearance}}:p;}),[pages,store,tick]);
 const byId=useMemo(()=>new Map(displayPages.map(p=>[p.id,p])),[displayPages]);
 const children=useMemo(()=>{const m=new Map<string,Entity[]>();for(const p of displayPages){const parent=String(p.data?.parent_id||'');if(!m.has(parent))m.set(parent,[]);m.get(parent)!.push(p);}for(const list of m.values())list.sort(comparePageOrder);return m;},[displayPages]);
 const entry=selectedId?store.get(selectedId):undefined;
 useEffect(()=>{if(ready&&selectedId&&!byId.has(selectedId)&&store.get(selectedId)?.state==='saved'){history.current=history.current.filter(id=>byId.has(id));setSelectedId(null);setFocus(null);}},[ready,selectedId,byId,store]);
 const emptyBody=entry?pageBodyIsEmpty(entry.draft.blocks):true;
 const hasSubpageContent=!!(selectedId&&(children.get(selectedId)||[]).length);
 const showBodyGuide=emptyBody&&!hasSubpageContent;
 const placeholderColor=c.muted+'80';
 useEffect(()=>{if(active&&focus&&focus!=='title')inputRefs.current.get(focus)?.focus();},[focus,selectedId,active]);
 function toggle(id:string){setExpanded(old=>{const next=toggleExpanded(old,id),value=JSON.stringify([...next]);expandDisk.current=expandDisk.current.catch(()=>{}).then(()=>AsyncStorage.setItem(key+':expanded',value)).catch(()=>{if(mounted.current)setError('Não foi possível guardar a abertura das subpáginas neste aparelho.');});return next;});}
 function canParent(pageId:string,parentId:string){return canReparentPage(displayPages,pageId,parentId);}
 async function movePage(page:Entity,parentId:string,drop?:PageDrop){
  if(moveBusy.current||(!drop&&String(page.data?.parent_id||'')===parentId))return;
  if(!canParent(page.id,parentId)){setError('Essa página não pode ser colocada dentro dela mesma ou de uma subpágina dela.');return;}
  const before=pages;
  moveBusy.current=true;mutationEpoch.current++;setMovingId(page.id);setError('');
  try{
  const plan=drop?legacyMovePlan(displayPages,{id:page.id,revision:page.revision,parentId,kind:drop.kind,anchorId:drop.anchorId}):null;
  pendingPosition.current=new Map((plan?.siblings||[page]).map((item,i)=>[item.id,{...(item.id===page.id?{parent_id:parentId,node_type:parentId?'page':'space'}:{}),sort_order:(i+1)*1024}]));
  setPages(old=>old.map(item=>{const rank=plan?.siblings.findIndex(p=>p.id===item.id)??-1;const value=item.id===page.id?reparentedPage(item,parentId):item;return rank>=0?{...value,data:{...value.data,sort_order:(rank+1)*1024}}:value;}));
  if(parentId)setExpanded(old=>{const next=new Set(old);next.add(parentId);const value=JSON.stringify([...next]);expandDisk.current=expandDisk.current.catch(()=>{}).then(()=>AsyncStorage.setItem(key+':expanded',value)).catch(()=>{});return next;});
   await store.flush(page.id);
   const base=store.get(page.id)?.base||pages.find(item=>item.id===page.id);
   if(!base)throw new Error('Página não encontrada.');
   const result=await api.movePage({id:base.id,revision:base.revision,parentId,kind:drop?.kind||'inside',anchorId:drop?.anchorId||parentId});
   mutationEpoch.current++;const savedPages=result.items; savedPages.forEach(saved=>store.open(saved));
   if(mounted.current)setPages(old=>old.map(item=>savedPages.find(p=>p.id===item.id)||item));
  }catch(e){if(mounted.current){setPages(before);setError(errorText(e));}}
  finally{pendingPosition.current.clear();moveBusy.current=false;mutationEpoch.current++;if(mounted.current)setMovingId(null);}
 }
 function open(page:Entity,push=true){if(selectedId){void store.flush(selectedId);if(push&&selectedId!==page.id)history.current.push(selectedId);}store.open(pages.find(p=>p.id===page.id)||page);setSelectedId(page.id);setFocus(null);setAppearance(null);setError('');}
 function back(){if(selectedId)void store.flush(selectedId);setFocus(null);setAppearance(null);const parent=entryBackTarget(byId,selectedId,history.current);if(parent)history.current.splice(history.current.lastIndexOf(parent));else history.current=[];if(parent&&parent!==selectedId&&byId.has(parent))open(byId.get(parent)!,false);else setSelectedId(null);} backAction.current=back;
 useEffect(()=>{if(!active)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(pageInteractionRef.current)return true;if(!selectedId)return false;back();return true;});return()=>sub.remove();},[active,selectedId,byId,store]);
 function edit(change:(draft:PageDraft)=>PageDraft,group=''){if(selectedId)store.edit(selectedId,change,group);}
 async function create(parent?:Entity,template?:PageTemplate){mutationEpoch.current++;try{
  const preset=template?freshTemplate(template):null;
  const saved=await api.saveEntity({kind:'user_page',title:'Sem título',content:'',area:parent?.area||'Pessoal',privacy:'private',state:'active',tags:[],data:{
   icon:'',icon_mode:'default',cover_type:'preset',cover_value:PAGE_COVERS[0][1],cover_attachment_id:'',
   purpose:'',layout:'notes',suggested:false,parent_id:parent?.id||'',node_type:parent?'page':'space',blocks_json:preset?JSON.stringify(preset.blocks):'[]'
  }});
  if(!mounted.current)return;mutationEpoch.current++;setPages(old=>[...old,saved]);open(saved);
 }catch(e){setError(errorText(e));}}
 function applyTemplate(template:PageTemplate){if(!selectedId)return;const preset=freshTemplate(template);store.edit(selectedId,d=>({...d,blocks:insertTemplateBlocks(d.blocks,preset.blocks)}),'template');setFocus(null);setCreateParent(undefined);void store.flush(selectedId);}
 function updateBlock(block:PageBlock,patch:Partial<PageBlock>,group=''){edit(d=>({...d,blocks:d.blocks.map(b=>b.id===block.id?{...b,...patch}:b)}),group);}
 function confirmRemoveBlock(b:PageBlock){Alert.alert('Excluir bloco?','Somente este bloco e seu conteúdo serão removidos desta página. O template continua disponível.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>removeBlock(b.id)}]);}
 function removeBlock(id:string){edit(d=>{const blocks=d.blocks.filter(b=>b.id!==id);return {...d,blocks:blocks.length?blocks:[newBlock()]};});setFocus(null);}
 function addBlock(){const block=newBlock();edit(d=>{const blocks=[...d.blocks],i=blocks.findIndex(b=>b.id===focus);blocks.splice(i>=0?i+1:blocks.length,0,block);return {...d,blocks};});setFocus(block.id);}
 function formatBlock(type:string){if(!entry)return;const id=focus&&focus!=='title'?focus:entry.draft.blocks.at(-1)?.id;if(!id)return;edit(d=>({...d,blocks:d.blocks.map(b=>b.id===id?{...b,type,...(b.text==='/'?{text:'',html:''}:{})}:b)}));}
 function resolveConflict(){if(!selectedId)return;const id=selectedId;Alert.alert('A página mudou no site','Seu rascunho local foi preservado. Qual versão deve continuar?',[
  {text:'Cancelar',style:'cancel'},{text:'Usar versão do site',onPress:()=>void store.resolve(id,false)},{text:'Manter minhas alterações',onPress:()=>void store.resolve(id,true)}]);}
 function confirmDeletePage(page:Entity){const id=page.id;Alert.alert('Excluir página?','Excluir “'+page.title+'” e suas subpáginas também do site?',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{void(async()=>{
  const ids=new Set<string>();const collect=(key:string)=>{if(ids.has(key))return;ids.add(key);for(const p of children.get(key)||[])collect(p.id);};collect(id);
  await Promise.all([...ids].map(key=>store.flush(key)));await api.deleteEntity(id);mutationEpoch.current++;for(const key of ids)store.forget(key);
  if(mounted.current){history.current=history.current.filter(key=>!ids.has(key));setPages(old=>old.filter(p=>!ids.has(p.id)));if(ids.has(selectedId||''))setSelectedId(null);setFocus(null);}
 })().catch(e=>setError(errorText(e)));}}]);}
 function removePage(){if(entry)confirmDeletePage(entry.base);}
 function blockView(b:PageBlock,i:number,preview=false,bodyGuide=showBodyGuide,blockFocus=focus){
  if(b.type==='divider')return <Pressable key={b.id} accessibilityLabel="Divisor" onLongPress={()=>confirmRemoveBlock(b)} style={{paddingVertical:14}}><View style={{height:1,backgroundColor:c.line}}/></Pressable>;
  if(b.type==='image'&&b.data?.attachment_id)return <Pressable key={b.id} accessible={false} onLongPress={()=>confirmRemoveBlock(b)} style={{marginVertical:8}}><Image source={api.attachmentSource(String(b.data.attachment_id))} style={{width:'100%',height:210,borderRadius:8}} resizeMode="contain"/>{b.data.caption?<Text style={{color:c.muted,fontSize:12}}>{String(b.data.caption)}</Text>:null}</Pressable>;
  if(b.type==='collection')return <NativeCollectionBlock key={b.id} block={b} onChange={(data,group)=>updateBlock(b,{data},group)} onDelete={()=>confirmRemoveBlock(b)}/>;
  if(['image','file','table','bookmark'].includes(b.type))return <Pressable key={b.id} accessible={false} onLongPress={()=>confirmRemoveBlock(b)} style={{padding:12,borderRadius:8,backgroundColor:c.input,marginVertical:5}}><Text style={{color:c.text,fontSize:13}}>{b.text||({table:'Tabela',image:'Imagem',file:'Arquivo',bookmark:'Link'} as Record<string,string>)[b.type]}</Text><Text style={{color:c.muted,fontSize:11,marginTop:4}}>Bloco preservado; edição completa no site.</Text></Pressable>;
  const heading=b.type==='heading1'?30:b.type==='heading2'?24:b.type==='heading3'?20:16;
  const prefix=b.type==='bullet'?'• ':b.type==='number'?String(i+1)+'. ':b.type==='quote'?'│ ':b.type==='callout'?'💡 ':'';
  return <Pressable key={b.id} accessible={false} onLongPress={()=>confirmRemoveBlock(b)} style={{flexDirection:'row',alignItems:'flex-start',gap:b.type==='todo'?7:0}}>
   {b.type==='todo'?<Switch accessibilityLabel="Concluir tarefa" value={!!b.checked} onValueChange={checked=>updateBlock(b,{checked})}/>:prefix?<Text style={{fontSize:heading,lineHeight:heading+9,color:c.muted,paddingTop:4}}>{prefix}</Text>:null}
   <TextInput editable={!preview} ref={node=>{if(preview)return;if(node)inputRefs.current.set(b.id,node);else inputRefs.current.delete(b.id);}} accessibilityLabel={'Conteúdo do bloco '+(i+1)} value={b.text||''} onChangeText={text=>updateBlock(b,{text,html:''},'text:'+b.id)}
    onFocus={()=>setFocus(b.id)} onBlur={()=>{if(!preview&&selectedId)void store.flush(selectedId);}} multiline placeholder={pageBlockHint(b,i,bodyGuide,blockFocus===b.id)} placeholderTextColor={placeholderColor}
    style={{flex:1,minHeight:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:42,height:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:undefined,color:c.text,fontSize:heading,lineHeight:heading+9,fontWeight:b.type.startsWith('heading')?'700':'400',paddingVertical:(!b.text&&!b.html&&!pageBlockHint(b,i,bodyGuide,blockFocus===b.id)&&blockFocus!==b.id)?0:4,fontFamily:b.type==='code'?'monospace':undefined,backgroundColor:b.type==='code'?c.input:'transparent',borderRadius:8,paddingHorizontal:b.type==='code'?10:0}}/>
  </Pressable>;
 }
 function documentContent(selected:Entity,draft:PageDraft,preview=false){
  const hasCover=!!draft.appearance.cover_type,subpages=children.get(selected.id)||[];
  const emptyBody=pageBodyIsEmpty(draft.blocks),hasSubpageContent=!!subpages.length;
  return <PageDocumentScroll key={selected.id} pageId={selected.id} preview={preview} enabled={!pageDragging} initialY={scrollPositions.current.get(selected.id)||0} onScrollY={y=>scrollPositions.current.set(selected.id,y)}>
   <Pressable accessibilityRole="button" accessibilityLabel={hasCover?'Alterar capa':'Adicionar capa'} onPress={()=>setAppearance('cover')} style={{height:hasCover?190:28,overflow:'hidden',backgroundColor:hasCover?c.accentSoft:'transparent'}}>
    {hasCover?<PageCover data={draft.appearance} api={api}/>:<View style={{alignSelf:'flex-end',padding:12,opacity:.55}}><Icon name="image" size={20} color={c.muted}/></View>}
   </Pressable>
   <View style={{paddingHorizontal:30,marginTop:hasCover?-44:0}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Alterar ícone da página" onPress={()=>setAppearance('icon')} style={{width:78,height:78,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:58,color:c.text}}>{String(draft.appearance.icon||'📄')}</Text></Pressable>
    <TextInput editable={!preview} accessibilityLabel="Título da página" value={draft.title==='Sem título'?'':draft.title} onChangeText={title=>edit(d=>({...d,title}),'title')} onFocus={()=>setFocus('title')} onBlur={()=>{if(!preview)void store.flush(selected.id);}} multiline placeholder={pageTitleHint(emptyBody,hasSubpageContent,!preview&&focus==='title')} placeholderTextColor={placeholderColor} style={{minHeight:60,fontSize:38,lineHeight:44,fontWeight:'800',letterSpacing:-1.2,color:c.text,paddingTop:8,paddingBottom:6}}/>
    {String(selected.data.purpose||'').trim()?<Text style={{fontSize:13,lineHeight:20,color:c.muted,marginBottom:12}}>{String(selected.data.purpose)}</Text>:null}
    <View style={{gap:2}}>{draft.blocks.map((block,index)=>blockView(block,index,preview,emptyBody&&!hasSubpageContent,preview?null:focus))}</View>
    <Pressable accessibilityLabel="Continuar escrevendo" onPress={()=>{const last=draft.blocks.at(-1);if(last&&['text','heading1','heading2','heading3','bullet','todo','number','quote','code','callout'].includes(last.type)){setFocus(last.id);inputRefs.current.get(last.id)?.focus();}else addBlock();}} style={{minHeight:18}}/>
    {subpages.length?<View style={{marginTop:2}}>
      <PageTreeList roots={subpages} children={children} expanded={expanded} toggle={toggle} onOpen={open} onMove={movePage} canParent={canParent} onDelete={confirmDeletePage} onInteractionChange={preview?undefined:changePageInteraction} onDragChange={preview?undefined:setPageDragging} compact/>
    </View>:null}
   </View>
  </PageDocumentScroll>;
 }
 const listView=<ScrollView scrollEnabled={!pageDragging} style={{flex:1,backgroundColor:c.bg}} contentContainerStyle={{paddingBottom:34}} refreshControl={<RefreshControl enabled={!pageInteraction&&!selectedId} refreshing={refreshing} onRefresh={refreshPages} tintColor={c.accent}/>}>
  <ScreenTitle title="Páginas" eyebrow="IDEIAS · NOTAS · SEUS ESPAÇOS" right={<IconButton name="plus" label="Criar página" filled disabled={!ready} onPress={()=>setCreateParent(null)}/>}/>
  {api.mdLocalOnly?<Text style={{paddingHorizontal:20,paddingBottom:8,color:c.muted,fontSize:10}}>Ordem salva neste aparelho. A hierarquia e o conteúdo continuam sincronizados.</Text>:null}
  {error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}
  <View style={{paddingHorizontal:10}}><PageTreeList roots={children.get('')||[]} children={children} expanded={expanded} toggle={toggle} onOpen={open} onMove={movePage} canParent={canParent} onDelete={confirmDeletePage} onInteractionChange={changePageInteraction} onDragChange={setPageDragging}/></View>
  {ready&&!pages.length?<Empty icon="book" title="Sua primeira página" body="Toque em + para criar uma página."/>:null}
 </ScrollView>;
 const createPicker=<PageCreateMenu visible={createParent!==undefined} parentTitle={createParent?.title} onClose={()=>setCreateParent(undefined)}
  onBlank={()=>void create(createParent||undefined)} onTemplate={template=>selectedId?applyTemplate(template):void create(undefined,template)}/>;
 if(!entry)return <View style={{flex:1}} onTouchEnd={e=>{if(e.nativeEvent.touches.length===0)endPageTouch();}} onTouchCancel={endPageTouch} onLayout={e=>{paneWidth.current=e.nativeEvent.layout.width;}}>{listView}{createPicker}</View>;
 const draft=entry.draft,selected={...entry.base,data:{...entry.base.data,...draft.appearance}},subpages=children.get(selected.id)||[];
 const previousId=entryBackTarget(byId,selected.id,history.current);
 const previousEntry=previousId?store.get(previousId):undefined;
 const previousPage=previousId?byId.get(previousId):undefined;
 const path:Entity[]=[];let cur:Entity|undefined=selected;const seen=new Set<string>();while(cur&&!seen.has(cur.id)&&path.length<40){seen.add(cur.id);path.unshift(cur);cur=byId.get(String(cur.data?.parent_id||''));}
 const status=entry.state==='saving'?'Salvando…':entry.state==='pending'?'Sincronizando…':entry.state==='error'?'Não salvo':entry.state==='conflict'?'Conflito':selected.privacy==='private'?'Particular':selected.area;
 const hasCover=!!draft.appearance.cover_type;
 const previousBackdrop=previousEntry&&previousPage?(()=>{
  const pd=previousEntry.draft,pp={...previousPage,data:{...previousPage.data,...pd.appearance}};
  return <View pointerEvents="none" style={{flex:1,backgroundColor:c.bg}}>
   <View style={{zIndex:20,elevation:5,minHeight:54,flexDirection:'row',alignItems:'center',paddingHorizontal:4,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}>
    <IconButton name="back" label="Voltar" size={34} disabled onPress={()=>{}}/>
    <View style={{flex:1,minWidth:0,paddingHorizontal:5}}><Text numberOfLines={1} style={{color:c.text,fontSize:15,fontWeight:'700'}}>{pp.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{pp.privacy==='private'?'Particular':pp.area}</Text></View>
   </View>
   {documentContent(pp,pd,true)}
  </View>;
 })():listView;
 const editor=<View style={{flex:1,backgroundColor:c.bg,overflow:'hidden'}}>
  <View style={{zIndex:20,elevation:5,minHeight:54,flexDirection:'row',alignItems:'center',paddingHorizontal:4,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}>
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
  {documentContent(selected,draft)}
  <KeyboardToolbar visible={keyboardVisible&&!!focus&&focus!=='title'} testID="page-format-toolbar"><View style={{backgroundColor:c.surface,borderTopWidth:1,borderColor:c.line}}><ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}>    <View style={{flexDirection:'row',alignItems:'center',flexWrap:'nowrap',gap:4,paddingVertical:8}}>
     <IconButton name="plus" label="Adicionar bloco" size={34} onPress={addBlock}/>
     {([['text','Texto'],['heading2','Título'],['bullet','Lista'],['todo','Tarefa'],['divider','Divisor']] as const).map(([type,label])=><Pressable key={type} accessibilityRole="button" onPress={()=>formatBlock(type)} style={{paddingHorizontal:9,paddingVertical:9,borderRadius:8,backgroundColor:c.input}}><Text style={{fontSize:11,color:c.muted}}>{label}</Text></Pressable>)}
     <IconButton name="trash" label="Remover bloco selecionado" size={34} onPress={()=>{const b=entry.draft.blocks.find(b=>b.id===focus);if(b)confirmRemoveBlock(b);}}/>
    </View>
</ScrollView></View></KeyboardToolbar>
  {appearance?<PageAppearance key={selected.id+appearance} api={api} pageId={selected.id} kind={appearance} onClose={()=>setAppearance(null)} onApply={patch=>{store.edit(selected.id,d=>({...d,appearance:{...d.appearance,...patch}}));void store.flush(selected.id);}}/>:null}
 </View>;
 return <View style={{flex:1,backgroundColor:c.bg}} onTouchEnd={e=>{if(e.nativeEvent.touches.length===0)endPageTouch();}} onTouchCancel={endPageTouch} onLayout={e=>{paneWidth.current=e.nativeEvent.layout.width;}}>
  <View style={{flex:1}} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{previousBackdrop}</View>
  <Animated.View {...pageBackResponder.panHandlers} style={{position:'absolute',left:0,right:0,top:0,bottom:0,backgroundColor:c.bg,transform:[{translateX:backX}]}}>
   <KeyboardViewport>{editor}</KeyboardViewport>
  </Animated.View>
  {createPicker}
 </View>;
}

/** Preserve each page's viewport, and keep preview/editor native text metrics identical. */
function PageDocumentScroll({pageId,preview,enabled,initialY,onScrollY,children}:{pageId:string;preview:boolean;enabled:boolean;initialY:number;onScrollY:(y:number)=>void;children:React.ReactNode}){
 const initialOffset=useRef({x:0,y:initialY}).current;
 return <ScrollView testID={(preview?'page-preview-':'page-document-')+pageId} scrollEnabled={!preview&&enabled} contentOffset={initialOffset} onScroll={preview?undefined:e=>onScrollY(e.nativeEvent.contentOffset.y)} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:60}}>{children}</ScrollView>;
}
