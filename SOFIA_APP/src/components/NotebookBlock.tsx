import {MotionModal} from './MotionModal';
import {tap,useDesktop} from '../lib/desktop';
import {applyLeafPatch} from '../lib/leaf-document';
import {KeyboardViewport} from './KeyboardViewport';
import {LeafEditor} from './LeafEditor';
import type {Leaf} from '../lib/leaf-document';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Animated,PanResponder,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../lib/theme';
import {Button,IconButton} from './UI';
import {Sheet} from './Sheet';
import {appAlert} from '../lib/app-alert';
import {fuzzyScore} from '../lib/fuzzy';

/** 0.3.201: Notas reestruturadas - pastas em cartoes, notas com previa e data, busca que acha com letra
 * errada, e acoes claras. Os dados continuam no mesmo formato (nenhuma nota antiga se perde). */
/** 0.3.228: parent = pasta-mae (pastas dentro de pastas); root = notas fora de pastas (nao aparece como pasta). */
type Book={id:string;name:string;emoji:string;expanded:boolean;pages:Leaf[];parent?:string;root?:boolean};
type DragItem={kind:'note'|'folder';id:string;from:string;label:string};
const ROOT_BOOK='__fora_de_pastas__';
type Dated=Leaf&{updated_at?:string};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
function parentOfIn(all:Book[],b:Book){return b.parent&&all.some(x=>x.id===b.parent&&!x.root)?b.parent:'';}
const EMOJIS=['📁','📒','📓','📝','💼','🏠','💡','🎬','📸','✈️','💰','❤️','📚','🎵'];
export function leafPreview(p:Leaf):string{
 const fromBlocks=(p.blocks||[]).map(b=>(b.checked===true?'✓ ':b.type==='todo'||b.type==='check'?'☐ ':'')+String(b.text||'')).filter(Boolean).join(' · ');
 return (fromBlocks||String(p.content||'')).replace(/\s+/g,' ').trim();
}
export function leafStamp(p:Dated):string{
 const at=p.updated_at||p.created_at;if(!at)return '';
 const d=new Date(at),now=new Date();if(!Number.isFinite(d.getTime()))return '';
 const same=d.toDateString()===now.toDateString(),yest=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1).toDateString()===d.toDateString();
 return same?'hoje, '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):yest?'ontem':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
}
const stampOf=(p:Leaf)=>String((p as Dated).updated_at||p.created_at||'');
const lastEdited=(b:Book)=>[...b.pages].sort((x,y)=>stampOf(y).localeCompare(stampOf(x)))[0];

export function NotebookBlock({data,onChange,onDelete,onInteractionChange}:{data:Record<string,any>;onChange:(data:Record<string,any>,group?:string)=>void;onDelete?:()=>void;onInteractionChange?:(active:boolean)=>void}){
 const leafTitle=useRef<TextInput>(null);
 const c=useTheme(),books:Book[]=Array.isArray(data.notebooks)?data.notebooks:(data.rows||[]).map((r:any)=>({id:r.id,name:String(r.values?.name||''),emoji:'',expanded:false,pages:r.page_content?[{id:r.id+'-leaf',title:'',content:r.page_content}]:[]}));
 const [openBook,setOpenBook]=useState<string|null>(null),[query,setQuery]=useState(''),[title,setTitle]=useState(String(data.title||'Notas'));
 const [editingBook,setEditingBook]=useState<string|null>(null),[bookId,setBookId]=useState<string|null>(null),[leafId,setLeafId]=useState<string|null>(null),[newName,setNewName]=useState(''),[create,setCreate]=useState(false),[emojiBook,setEmojiBook]=useState<string|null>(null),[emoji,setEmoji]=useState(''),[moving,setMoving]=useState(false),[menu,setMenu]=useState(false),[folderMenu,setFolderMenu]=useState<string|null>(null),[blockMenu,setBlockMenu]=useState(false);
 const book=books.find(b=>b.id===bookId),leaf=book?.pages.find(p=>p.id===leafId),opened=books.find(b=>b.id===openBook)||null;
 const total=books.reduce((s,b)=>s+b.pages.length,0);
 // 0.3.228: pastas dentro de pastas e arrastar notas/pastas para dentro ou para fora
 const exists=(id?:string)=>!!id&&books.some(b=>b.id===id&&!b.root);
 const parentOf=(b:Book)=>exists(b.parent)?b.parent!:'';
 const foldersIn=(pid:string)=>books.filter(b=>!b.root&&parentOf(b)===pid);
 const rootNotes=books.find(b=>b.id===ROOT_BOOK)?.pages||[];
 const isInside=(id:string,ancestor:string):boolean=>{let cur=books.find(b=>b.id===id),guard=0;while(cur&&guard++<50){if(cur.id===ancestor)return true;cur=books.find(b=>b.id===parentOf(cur!));}return false;};
 const booksRef=useRef(books);booksRef.current=books;const openedRef=useRef(opened);openedRef.current=opened;
 const dragRef=useRef<DragItem|null>(null),[drag,setDrag]=useState<DragItem|null>(null),[hover,setHover]=useState<string|null>(null),hoverRef=useRef<string|null>(null);
 const ghost=useRef(new Animated.ValueXY({x:0,y:0})).current,rootRef=useRef<View>(null),rootPos=useRef({x:0,y:0}),targets=useRef<Record<string,View|null>>({}),rects=useRef<{id:string;x:number;y:number;w:number;h:number}[]>([]),moved=useRef(false),captured=useRef(false),startPt=useRef({x:0,y:0});
 function hit(x:number,y:number){const d=dragRef.current;for(const r of rects.current){if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){if(d&&d.kind==='folder'&&(r.id===d.id))continue;return r.id;}}return null;}
 function startDrag(item:DragItem,e:{nativeEvent:{pageX:number;pageY:number}}){
  dragRef.current=item;moved.current=false;captured.current=false;startPt.current={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};hoverRef.current=null;setHover(null);setDrag(item);onInteractionChange?.(true);
  rects.current=[];rootRef.current?.measureInWindow((x,y)=>{rootPos.current={x,y};ghost.setValue({x:startPt.current.x-x-60,y:startPt.current.y-y-22});});
 }
 // mede as pastas-alvo DEPOIS que a tela se redesenhou com o item levantado (nao por tempo fixo)
 useEffect(()=>{if(!drag)return;rects.current=[];Object.entries(targets.current).forEach(([id,v])=>v?.measureInWindow((x,y,w,h)=>{rects.current.push({id,x,y,w,h});}));},[drag]);
 function endDrag(drop:boolean){
  const item=dragRef.current,target=hoverRef.current,didMove=moved.current;dragRef.current=null;hoverRef.current=null;setDrag(null);setHover(null);onInteractionChange?.(false);
  if(drop&&item&&target&&didMove)moveItem(item,target);
 }
 function moveItem(item:DragItem,target:string){
  const all=booksRef.current,op=openedRef.current;
  if(item.kind==='folder'){
   const newParent=target==='__up__'?(op?parentOfIn(all,op):''):target;
   if(newParent&&(newParent===item.id||isInside(newParent,item.id))){appAlert('Não dá para mover','Uma pasta não pode ir para dentro dela mesma.');return;}
   update(next=>{const f=next.find(b=>b.id===item.id);if(f){if(newParent)f.parent=newParent;else delete f.parent;}},'notebook-move');return;
  }
  const dest=target==='__up__'?(op?(parentOfIn(all,op)||ROOT_BOOK):ROOT_BOOK):target;
  if(dest===item.from)return;
  update(next=>{const src=next.find(b=>b.id===item.from);const p=src?.pages.find(x=>x.id===item.id);if(!src||!p)return;src.pages=src.pages.filter(x=>x.id!==item.id);
   let d=next.find(b=>b.id===dest);if(!d){d={id:ROOT_BOOK,name:'Fora de pastas',emoji:'📝',expanded:true,pages:[],root:true};next.push(d);}d.pages.unshift(p);},'notebook-move');
 }
 // o detector e criado uma vez: chama SEMPRE a versao atual (com as pastas e notas de agora), nunca uma copia antiga
 const endRef=useRef(endDrag);endRef.current=endDrag;
 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>false,
  onMoveShouldSetPanResponderCapture:()=>{if(dragRef.current){captured.current=true;return true;}return false;},
  onMoveShouldSetPanResponder:()=>!!dragRef.current,
  onPanResponderTerminationRequest:()=>false,
  onPanResponderMove:e=>{const {pageX,pageY}=e.nativeEvent;if(Math.abs(pageX-startPt.current.x)+Math.abs(pageY-startPt.current.y)>8)moved.current=true;
   ghost.setValue({x:pageX-rootPos.current.x-60,y:pageY-rootPos.current.y-22});const t=hit(pageX,pageY);if(t!==hoverRef.current){hoverRef.current=t;setHover(t);}},
  onPanResponderRelease:()=>endRef.current(true),
  onPanResponderTerminate:()=>endRef.current(false),
 }),[]);// eslint-disable-line react-hooks/exhaustive-deps
 /** 0.3.229: soltou sem arrastar -> so cancela (sem menu). Quando o arrastar pega o dedo, o Android avisa o cartao que
  * ele perdeu o toque; antes isso era lido como "soltou" e cancelava o arrastar abrindo Renomear. */
 function pressOut(){if(dragRef.current&&!captured.current&&!moved.current)endDrag(false);}
 function update(fn:(next:Book[])=>void,group='notebooks'){const next=clone(books);fn(next);onChange({...data,mode:'notebooks',notebooks:next},group);}
 function addLeaf(id?:string){
  let target=id||openBook||books[0]?.id;const p={id:uid(),title:'',content:'',created_at:new Date().toISOString()};
  update(next=>{let b=next.find(x=>x.id===target);if(!b){b={id:uid(),name:'Geral',emoji:'📝',expanded:true,pages:[]};next.push(b);target=b.id;}b.pages.unshift(p);b.expanded=true;});
  setBookId(target||null);setLeafId(p.id);
 }
 function changeLeaf(patch:Partial<Leaf>){if(!book||!leaf)return;update(next=>{const p=next.find(b=>b.id===book.id)?.pages.find(p=>p.id===leaf.id);if(p){Object.assign(p,applyLeafPatch(p,patch));(p as Dated).updated_at=new Date().toISOString();}},'leaf:'+leaf.id+':'+Object.keys(patch).join(','));}
 function removeLeaf(){if(!book||!leaf)return;appAlert('Excluir nota?',`“${leaf.title||'Sem título'}” será removida desta pasta.`,[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{update(next=>{const b=next.find(b=>b.id===book.id)!;b.pages=b.pages.filter(p=>p.id!==leaf.id);});setLeafId(null);setBookId(null);setMenu(false);}}]);}
 function removeBook(id:string){const b=books.find(x=>x.id===id);if(!b)return;setFolderMenu(null);
  appAlert('Excluir pasta?',b.pages.length?`“${b.name||'Sem título'}” e as ${b.pages.length} nota(s) dentro dela serão removidas.`:`“${b.name||'Sem título'}” será removida.`,[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{const up=parentOf(b);update(next=>{for(const k of next)if(k.parent===id){if(up)k.parent=up;else delete k.parent;}const i=next.findIndex(x=>x.id===id);if(i>=0)next.splice(i,1);});if(openBook===id)setOpenBook(up||null);}}]);}
 const commitTitle=()=>{const t=title.trim()||'Notas';setTitle(t);if(t!==String(data.title||'Notas'))onChange({...data,mode:'notebooks',title:t,notebooks:books},'notebook-title');};
 // 0.3.251 (computador): pastas em cartoes de tamanho fixo, quantos couberem na linha (no celular, 2 por linha)
 const desktop=useDesktop();
 const results=useMemo(()=>query.trim()?books.flatMap(b=>b.pages.map(p=>({b,p,score:fuzzyScore((p.title||'')+' '+leafPreview(p),query)}))).filter(x=>x.score>0).sort((a,b)=>b.score-a.score):[],[books,query]);
 const open=(b:Book,p:Leaf)=>{setBookId(b.id);setLeafId(p.id);};

 const folderTile=(b:Book)=>{const last=lastEdited(b),subs=foldersIn(b.id).length,over=hover===b.id,lifted=drag?.kind==='folder'&&drag.id===b.id;
  return <View key={b.id} ref={r=>{targets.current[b.id]=r;}} collapsable={false} style={{width:desktop?224:'48%'}}>
   <Pressable accessibilityRole="button" accessibilityLabel={'Abrir pasta '+(b.name||'Sem título')} accessibilityHint="Segure e arraste para mover" onPress={()=>{if(!dragRef.current)setOpenBook(b.id);}} delayLongPress={300}
    onLongPress={e=>startDrag({kind:'folder',id:b.id,from:parentOf(b),label:(b.emoji||'📁')+' '+(b.name||'Sem título')},e)} onPressOut={()=>pressOut()}
    style={({pressed})=>({minHeight:118,backgroundColor:over?c.accentSoft:c.surface,borderRadius:18,borderWidth:over?2:1,borderColor:over?c.accent:c.line,padding:14,gap:6,opacity:lifted?0.35:pressed?0.75:1})}>
    <Text style={{fontSize:28}}>{b.emoji||'📁'}</Text>
    <Text numberOfLines={1} style={{color:c.text,fontSize:15,fontWeight:'700'}}>{b.name||'Sem título'}</Text>
    <Text style={{color:c.muted,fontSize:12}}>{b.pages.length+(b.pages.length===1?' nota':' notas')+(subs?' · '+subs+(subs===1?' pasta':' pastas'):'')}</Text>
    {last?<Text numberOfLines={1} style={{color:c.muted,fontSize:11}}>{'Última: '+(last.title||'Sem título')}</Text>:null}
   </Pressable>
  </View>;};
 const noteCard=(b:Book,p:Leaf,showFolder=false)=>{const prev=leafPreview(p),stamp=leafStamp(p as Dated),lifted=drag?.kind==='note'&&drag.id===p.id;
  return <Pressable key={b.id+':'+p.id} accessibilityRole="button" accessibilityLabel={'Abrir nota '+(p.title||'Sem título')} onPress={()=>{if(!dragRef.current)open(b,p);}}
   delayLongPress={300} onLongPress={showFolder?undefined:e=>startDrag({kind:'note',id:p.id,from:b.id,label:'📝 '+(p.title||'Sem título')},e)} onPressOut={showFolder?undefined:()=>pressOut()}
   style={({pressed})=>({backgroundColor:c.surface,borderRadius:16,borderWidth:1,borderColor:c.line,padding:14,gap:5,opacity:lifted?0.35:pressed?0.75:1})}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
    <Text numberOfLines={1} style={{flex:1,color:c.text,fontSize:15,fontWeight:'700'}}>{p.title||'Sem título'}</Text>
    {stamp?<Text style={{color:c.muted,fontSize:11}}>{stamp}</Text>:null}
   </View>
   {prev?<Text numberOfLines={2} style={{color:c.muted,fontSize:13,lineHeight:18}}>{prev}</Text>:<Text style={{color:c.muted,fontSize:12,fontStyle:'italic'}}>Nota vazia</Text>}
   {showFolder?<Text style={{color:c.accent,fontSize:11,fontWeight:'600'}}>{b.root?'📝 Fora de pastas':(b.emoji||'📁')+' '+(b.name||'Sem título')}</Text>:null}
  </Pressable>;};

 return <View ref={rootRef} collapsable={false} {...pan.panHandlers} style={{gap:12}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   {opened?<Pressable accessibilityRole="button" accessibilityLabel="Voltar às pastas" onPress={()=>setOpenBook(opened&&!opened.root?(parentOf(opened)||null):null)} hitSlop={10} style={{paddingRight:4}}><Text style={{color:c.accent,fontSize:26,fontWeight:'300'}}>‹</Text></Pressable>:null}
   <View style={{flex:1}}>
    {opened?<Text numberOfLines={1} style={{fontSize:22,fontWeight:'800',color:c.text}}>{(opened.emoji||'📁')+' '+(opened.name||'Sem título')}</Text>
     :<TextInput accessibilityLabel="Título do bloco de notas" value={title} onChangeText={setTitle} onEndEditing={commitTitle} onBlur={commitTitle} blurOnSubmit returnKeyType="done" style={{fontSize:22,fontWeight:'800',color:c.text,paddingVertical:0}}/>}
    <Text style={{color:c.muted,fontSize:12}}>{opened?opened.pages.length+(opened.pages.length===1?' nota':' notas'):foldersIn('').length+(foldersIn('').length===1?' pasta':' pastas')+' · '+total+(total===1?' nota':' notas')}</Text>
   </View>
   {!opened&&onDelete?<Pressable accessibilityRole="button" accessibilityLabel="Opções do bloco de notas" onPress={()=>setBlockMenu(true)} hitSlop={8} style={{paddingHorizontal:10,paddingVertical:6,borderRadius:99,backgroundColor:c.input}}><Text style={{color:c.text,fontWeight:'800',fontSize:16,lineHeight:18}}>⋯</Text></Pressable>:null}
   {opened&&!opened.root?<Pressable accessibilityRole="button" accessibilityLabel="Opções da pasta" onPress={()=>setFolderMenu(opened.id)} hitSlop={8} style={{paddingHorizontal:10,paddingVertical:6,borderRadius:99,backgroundColor:c.input}}><Text style={{color:c.text,fontWeight:'800',fontSize:16,lineHeight:18}}>⋯</Text></Pressable>:null}
   {!opened||!opened.root?<Pressable accessibilityRole="button" accessibilityLabel={opened?'Nova pasta dentro desta':'Nova pasta'} onPress={()=>{setEditingBook(null);setNewName('');setCreate(true);}} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:99,backgroundColor:c.input}}><Text style={{color:c.text,fontWeight:'700',fontSize:12}}>＋ Pasta</Text></Pressable>:null}
   <Pressable accessibilityRole="button" accessibilityLabel="Nova nota" onPress={()=>addLeaf()} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:99,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontWeight:'700',fontSize:12}}>＋ Nota</Text></Pressable>
  </View>
  {total>0?<TextInput accessibilityLabel="Buscar nas notas" value={query} onChangeText={setQuery} placeholder="🔍 Buscar nas notas" placeholderTextColor={c.muted} returnKeyType="search" style={{color:c.text,backgroundColor:c.input,borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontSize:14}}/>:null}

  {query.trim()?<View style={{gap:10}}>
   {results.length?results.slice(0,30).map(r=>noteCard(r.b,r.p,true)):<Text style={{color:c.muted,fontSize:13,paddingVertical:8}}>Nenhuma nota encontrada para “{query.trim()}”.</Text>}
  </View>:opened?<View style={{gap:10}}>
   {drag?<View ref={r=>{targets.current['__up__']=r;}} collapsable={false} style={{borderRadius:14,borderWidth:2,borderStyle:'dashed',borderColor:hover==='__up__'?c.accent:c.line,backgroundColor:hover==='__up__'?c.accentSoft:'transparent',paddingVertical:14,alignItems:'center'}}>
    <Text style={{color:hover==='__up__'?c.accent:c.muted,fontWeight:'700'}}>{'↑ Tirar desta pasta'+(parentOf(opened)?'':' (fica fora de pastas)')}</Text>
   </View>:null}
   {foldersIn(opened.id).length?<View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{foldersIn(opened.id).map(folderTile)}</View>:null}
   {opened.pages.length?[...opened.pages].sort((x,y)=>stampOf(y).localeCompare(stampOf(x))).map(p=>noteCard(opened,p)):
    <Pressable onPress={()=>addLeaf(opened.id)} style={{borderRadius:16,borderWidth:1,borderStyle:'dashed',borderColor:c.line,padding:22,alignItems:'center',gap:4}}><Text style={{fontSize:24}}>📝</Text><Text style={{color:c.muted,fontSize:13}}>{tap('Pasta vazia. Toque para criar a primeira nota.')}</Text></Pressable>}
  </View>:<View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
   {foldersIn('').map(folderTile)}
   {rootNotes.length?<View style={{width:'100%',gap:10,marginTop:4}}><Text style={{color:c.muted,fontSize:12,fontWeight:'700'}}>Fora de pastas</Text>{rootNotes.map(p=>noteCard(books.find(b=>b.id===ROOT_BOOK)!,p))}</View>:null}
   {!books.length?<Pressable onPress={()=>{setEditingBook(null);setNewName('');setCreate(true);}} style={{flex:1,borderRadius:18,borderWidth:1,borderStyle:'dashed',borderColor:c.line,padding:22,alignItems:'center',gap:4}}><Text style={{fontSize:26}}>📁</Text><Text style={{color:c.muted,fontSize:13,textAlign:'center'}}>Crie a primeira pasta para organizar suas notas.</Text></Pressable>:null}
  </View>}
  {total>0&&!query.trim()?<Text style={{color:c.muted,fontSize:11}}>{tap('Segure uma nota ou pasta e arraste para dentro de outra pasta.')}</Text>:null}
  {drag?<Animated.View pointerEvents="none" style={{position:'absolute',left:0,top:0,zIndex:50,elevation:8,transform:ghost.getTranslateTransform(),backgroundColor:c.surface,borderRadius:14,borderWidth:1,borderColor:c.accent,paddingHorizontal:14,paddingVertical:10,maxWidth:240}}>
   <Text numberOfLines={1} style={{color:c.text,fontWeight:'700'}}>{drag.label}</Text>
  </Animated.View>:null}
  {/* 0.3.230: remover o bloco fica no ⋯ do topo do bloco (antes: segure aqui) */}

  <Sheet visible={create} onClose={()=>setCreate(false)}><Text style={{fontSize:21,fontWeight:'700',color:c.text}}>{editingBook?'Renomear pasta':'Nova pasta'}</Text><TextInput accessibilityLabel="Nome da pasta" autoFocus value={newName} onChangeText={setNewName} placeholder="Ex.: Trabalho, Ideias, Receitas" placeholderTextColor={c.muted} style={{color:c.text,backgroundColor:c.input,borderRadius:10,padding:14,marginVertical:15}}/><Button title={editingBook?'Salvar pasta':'Criar pasta'} disabled={!newName.trim()} onPress={()=>{update(next=>{if(editingBook){next.find(b=>b.id===editingBook)!.name=newName.trim();}else next.push({id:uid(),name:newName.trim(),emoji:'📁',expanded:true,pages:[],...(opened&&!opened.root?{parent:opened.id}:{})});});setCreate(false);}}/></Sheet>
  <Sheet visible={blockMenu} onClose={()=>setBlockMenu(false)}><Text style={{fontSize:20,fontWeight:'700',color:c.text,marginBottom:12}}>{title||'Notas'}</Text>
   <Pressable accessibilityRole="button" onPress={()=>{setBlockMenu(false);setTimeout(()=>onDelete?.(),120);}} style={{paddingVertical:18}}><Text style={{color:c.danger,fontWeight:'700'}}>Remover bloco de notas</Text></Pressable></Sheet>
  <Sheet visible={!!folderMenu} onClose={()=>setFolderMenu(null)}>
   <Text style={{fontSize:20,fontWeight:'700',color:c.text,marginBottom:12}}>{(()=>{const b=books.find(x=>x.id===folderMenu);return b?(b.emoji||'📁')+' '+(b.name||'Sem título'):'Pasta';})()}</Text>
   <Button title="Renomear" secondary onPress={()=>{const b=books.find(x=>x.id===folderMenu);setFolderMenu(null);if(b){setEditingBook(b.id);setNewName(b.name);setCreate(true);}}}/><View style={{height:8}}/>
   <Button title="Trocar ícone" secondary onPress={()=>{const b=books.find(x=>x.id===folderMenu);setFolderMenu(null);if(b){setEmojiBook(b.id);setEmoji(b.emoji||'');}}}/>
   <Pressable onPress={()=>{if(folderMenu)removeBook(folderMenu);}} style={{paddingVertical:20}}><Text style={{color:c.danger}}>Excluir pasta</Text></Pressable>
  </Sheet>
  <Sheet visible={!!emojiBook} onClose={()=>setEmojiBook(null)}><Text style={{fontSize:21,fontWeight:'700',color:c.text}}>Ícone da pasta</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginVertical:14}}>{EMOJIS.map(e=><Pressable key={e} onPress={()=>setEmoji(e)} style={{padding:10,borderRadius:12,backgroundColor:emoji===e?c.accentSoft:c.input}}><Text style={{fontSize:26}}>{e}</Text></Pressable>)}</View><TextInput accessibilityLabel="Emoji da pasta" value={emoji} onChangeText={setEmoji} maxLength={16} placeholder="Ou digite um emoji" placeholderTextColor={c.muted} style={{color:c.text,padding:12,fontSize:24}}/><Button title="Salvar ícone" onPress={()=>{update(next=>{next.find(b=>b.id===emojiBook)!.emoji=emoji;});setEmojiBook(null);}}/></Sheet>
  <MotionModal visible={!!leaf} animationType="slide" onRequestClose={()=>{setLeafId(null);setBookId(null);}}><SafeAreaView style={{flex:1,backgroundColor:c.bg}}><KeyboardViewport><View testID="notebook-top-bar" style={{zIndex:10,elevation:10,backgroundColor:c.surface,minHeight:56,flexDirection:'row',alignItems:'center',paddingHorizontal:8,borderBottomWidth:1,borderColor:c.line}}><IconButton name="back" label="Voltar às notas" onPress={()=>{setLeafId(null);setBookId(null);}}/><View style={{flex:1}}><Text numberOfLines={1} style={{color:c.text,fontSize:15,fontWeight:'600'}}>{leaf?.title||'Sem título'}</Text>{book?<Text numberOfLines={1} style={{color:c.muted,fontSize:11}}>{(book.emoji||'📁')+' '+(book.name||'Sem título')}</Text>:null}</View><IconButton name="more" label="Ações da nota" onPress={()=>setMenu(true)}/></View>{leaf?<LeafEditor key={leaf.id} leaf={leaf} onChange={changeLeaf} titleRef={leafTitle}/>:null}</KeyboardViewport></SafeAreaView></MotionModal>
  <Sheet visible={menu} onClose={()=>setMenu(false)}><Button title="Renomear" secondary onPress={()=>{setMenu(false);setTimeout(()=>leafTitle.current?.focus(),240);}}/><View style={{height:8}}/><Button title="Duplicar" secondary onPress={()=>{if(book&&leaf){const copy={...clone(leaf),id:uid(),created_at:new Date().toISOString(),title:(leaf.title||'Sem título')+' cópia'};update(next=>next.find(b=>b.id===book.id)!.pages.unshift(copy));setLeafId(copy.id);}setMenu(false);}}/><View style={{height:8}}/><Button title="Mover para outra pasta" secondary onPress={()=>{setMenu(false);setMoving(true);}}/><Pressable onPress={removeLeaf} style={{paddingVertical:22}}><Text style={{color:c.danger}}>Excluir nota</Text></Pressable></Sheet>
  <Sheet visible={moving} onClose={()=>setMoving(false)}><Text style={{color:c.text,fontSize:20,fontWeight:'700',marginBottom:12}}>Mover para pasta</Text><ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:360}}>{books.filter(b=>b.id!==bookId).map(target=><Pressable key={target.id} onPress={()=>{if(book&&leaf){update(next=>{next.find(b=>b.id===book.id)!.pages=next.find(b=>b.id===book.id)!.pages.filter(p=>p.id!==leaf.id);next.find(b=>b.id===target.id)!.pages.unshift(leaf);});setBookId(target.id);}setMoving(false);}} style={{padding:14,flexDirection:'row',gap:10}}><Text style={{fontSize:18}}>{target.emoji||'📁'}</Text><Text style={{color:c.text,fontSize:15}}>{target.name||'Sem título'}</Text></Pressable>)}</ScrollView>{books.length<2?<Text style={{color:c.muted,fontSize:13}}>Crie outra pasta para poder mover a nota.</Text>:null}</Sheet>
 </View>;
}
