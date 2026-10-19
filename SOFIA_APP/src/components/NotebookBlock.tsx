import {MotionModal} from './MotionModal';
import {applyLeafPatch} from '../lib/leaf-document';
import {KeyboardViewport} from './KeyboardViewport';
import {LeafEditor} from './LeafEditor';
import type {Leaf} from '../lib/leaf-document';
import React,{useMemo,useRef,useState} from 'react';
import {Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../lib/theme';
import {Button,IconButton} from './UI';
import {Sheet} from './Sheet';
import {appAlert} from '../lib/app-alert';
import {fuzzyScore} from '../lib/fuzzy';

/** 0.3.201: Notas reestruturadas - pastas em cartoes, notas com previa e data, busca que acha com letra
 * errada, e acoes claras. Os dados continuam no mesmo formato (nenhuma nota antiga se perde). */
type Book={id:string;name:string;emoji:string;expanded:boolean;pages:Leaf[]};
type Dated=Leaf&{updated_at?:string};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
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

export function NotebookBlock({data,onChange,onDelete}:{data:Record<string,any>;onChange:(data:Record<string,any>,group?:string)=>void;onDelete?:()=>void}){
 const leafTitle=useRef<TextInput>(null);
 const c=useTheme(),books:Book[]=Array.isArray(data.notebooks)?data.notebooks:(data.rows||[]).map((r:any)=>({id:r.id,name:String(r.values?.name||''),emoji:'',expanded:false,pages:r.page_content?[{id:r.id+'-leaf',title:'',content:r.page_content}]:[]}));
 const [openBook,setOpenBook]=useState<string|null>(null),[query,setQuery]=useState(''),[title,setTitle]=useState(String(data.title||'Notas'));
 const [editingBook,setEditingBook]=useState<string|null>(null),[bookId,setBookId]=useState<string|null>(null),[leafId,setLeafId]=useState<string|null>(null),[newName,setNewName]=useState(''),[create,setCreate]=useState(false),[emojiBook,setEmojiBook]=useState<string|null>(null),[emoji,setEmoji]=useState(''),[moving,setMoving]=useState(false),[menu,setMenu]=useState(false),[folderMenu,setFolderMenu]=useState<string|null>(null);
 const book=books.find(b=>b.id===bookId),leaf=book?.pages.find(p=>p.id===leafId),opened=books.find(b=>b.id===openBook)||null;
 const total=books.reduce((s,b)=>s+b.pages.length,0);
 function update(fn:(next:Book[])=>void,group='notebooks'){const next=clone(books);fn(next);onChange({...data,mode:'notebooks',notebooks:next},group);}
 function addLeaf(id?:string){
  let target=id||openBook||books[0]?.id;const p={id:uid(),title:'',content:'',created_at:new Date().toISOString()};
  update(next=>{let b=next.find(x=>x.id===target);if(!b){b={id:uid(),name:'Geral',emoji:'📝',expanded:true,pages:[]};next.push(b);target=b.id;}b.pages.unshift(p);b.expanded=true;});
  setBookId(target||null);setLeafId(p.id);
 }
 function changeLeaf(patch:Partial<Leaf>){if(!book||!leaf)return;update(next=>{const p=next.find(b=>b.id===book.id)?.pages.find(p=>p.id===leaf.id);if(p){Object.assign(p,applyLeafPatch(p,patch));(p as Dated).updated_at=new Date().toISOString();}},'leaf:'+leaf.id+':'+Object.keys(patch).join(','));}
 function removeLeaf(){if(!book||!leaf)return;appAlert('Excluir nota?',`“${leaf.title||'Sem título'}” será removida desta pasta.`,[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{update(next=>{const b=next.find(b=>b.id===book.id)!;b.pages=b.pages.filter(p=>p.id!==leaf.id);});setLeafId(null);setBookId(null);setMenu(false);}}]);}
 function removeBook(id:string){const b=books.find(x=>x.id===id);if(!b)return;setFolderMenu(null);
  appAlert('Excluir pasta?',b.pages.length?`“${b.name||'Sem título'}” e as ${b.pages.length} nota(s) dentro dela serão removidas.`:`“${b.name||'Sem título'}” será removida.`,[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{update(next=>{const i=next.findIndex(x=>x.id===id);if(i>=0)next.splice(i,1);});if(openBook===id)setOpenBook(null);}}]);}
 const commitTitle=()=>{const t=title.trim()||'Notas';setTitle(t);if(t!==String(data.title||'Notas'))onChange({...data,mode:'notebooks',title:t,notebooks:books},'notebook-title');};
 const results=useMemo(()=>query.trim()?books.flatMap(b=>b.pages.map(p=>({b,p,score:fuzzyScore((p.title||'')+' '+leafPreview(p),query)}))).filter(x=>x.score>0).sort((a,b)=>b.score-a.score):[],[books,query]);
 const open=(b:Book,p:Leaf)=>{setBookId(b.id);setLeafId(p.id);};

 const noteCard=(b:Book,p:Leaf,showFolder=false)=>{const prev=leafPreview(p),stamp=leafStamp(p as Dated);
  return <Pressable key={b.id+':'+p.id} accessibilityRole="button" accessibilityLabel={'Abrir nota '+(p.title||'Sem título')} onPress={()=>open(b,p)}
   style={({pressed})=>({backgroundColor:c.surface,borderRadius:16,borderWidth:1,borderColor:c.line,padding:14,gap:5,opacity:pressed?0.75:1})}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
    <Text numberOfLines={1} style={{flex:1,color:c.text,fontSize:15,fontWeight:'700'}}>{p.title||'Sem título'}</Text>
    {stamp?<Text style={{color:c.muted,fontSize:11}}>{stamp}</Text>:null}
   </View>
   {prev?<Text numberOfLines={2} style={{color:c.muted,fontSize:13,lineHeight:18}}>{prev}</Text>:<Text style={{color:c.muted,fontSize:12,fontStyle:'italic'}}>Nota vazia</Text>}
   {showFolder?<Text style={{color:c.accent,fontSize:11,fontWeight:'600'}}>{(b.emoji||'📁')+' '+(b.name||'Sem título')}</Text>:null}
  </Pressable>;};

 return <View style={{gap:12}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   {opened?<Pressable accessibilityRole="button" accessibilityLabel="Voltar às pastas" onPress={()=>setOpenBook(null)} hitSlop={10} style={{paddingRight:4}}><Text style={{color:c.accent,fontSize:26,fontWeight:'300'}}>‹</Text></Pressable>:null}
   <View style={{flex:1}}>
    {opened?<Pressable onLongPress={()=>setFolderMenu(opened.id)}><Text numberOfLines={1} style={{fontSize:22,fontWeight:'800',color:c.text}}>{(opened.emoji||'📁')+' '+(opened.name||'Sem título')}</Text></Pressable>
     :<TextInput accessibilityLabel="Título do bloco de notas" value={title} onChangeText={setTitle} onEndEditing={commitTitle} onBlur={commitTitle} blurOnSubmit returnKeyType="done" style={{fontSize:22,fontWeight:'800',color:c.text,paddingVertical:0}}/>}
    <Text style={{color:c.muted,fontSize:12}}>{opened?opened.pages.length+(opened.pages.length===1?' nota':' notas'):books.length+(books.length===1?' pasta':' pastas')+' · '+total+(total===1?' nota':' notas')}</Text>
   </View>
   {!opened?<Pressable accessibilityRole="button" accessibilityLabel="Nova pasta" onPress={()=>{setEditingBook(null);setNewName('');setCreate(true);}} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:99,backgroundColor:c.input}}><Text style={{color:c.text,fontWeight:'700',fontSize:12}}>＋ Pasta</Text></Pressable>:null}
   <Pressable accessibilityRole="button" accessibilityLabel="Nova nota" onPress={()=>addLeaf()} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:99,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontWeight:'700',fontSize:12}}>＋ Nota</Text></Pressable>
  </View>
  {total>0?<TextInput accessibilityLabel="Buscar nas notas" value={query} onChangeText={setQuery} placeholder="🔍 Buscar nas notas" placeholderTextColor={c.muted} returnKeyType="search" style={{color:c.text,backgroundColor:c.input,borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontSize:14}}/>:null}

  {query.trim()?<View style={{gap:10}}>
   {results.length?results.slice(0,30).map(r=>noteCard(r.b,r.p,true)):<Text style={{color:c.muted,fontSize:13,paddingVertical:8}}>Nenhuma nota encontrada para “{query.trim()}”.</Text>}
  </View>:opened?<View style={{gap:10}}>
   {opened.pages.length?[...opened.pages].sort((x,y)=>stampOf(y).localeCompare(stampOf(x))).map(p=>noteCard(opened,p)):
    <Pressable onPress={()=>addLeaf(opened.id)} style={{borderRadius:16,borderWidth:1,borderStyle:'dashed',borderColor:c.line,padding:22,alignItems:'center',gap:4}}><Text style={{fontSize:24}}>📝</Text><Text style={{color:c.muted,fontSize:13}}>Pasta vazia. Toque para criar a primeira nota.</Text></Pressable>}
  </View>:<View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
   {books.map(b=>{const last=lastEdited(b);return <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={'Abrir pasta '+(b.name||'Sem título')} onPress={()=>setOpenBook(b.id)} onLongPress={()=>setFolderMenu(b.id)}
    style={({pressed})=>({width:'48%',minHeight:118,backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.line,padding:14,gap:6,opacity:pressed?0.75:1})}>
    <Text style={{fontSize:28}}>{b.emoji||'📁'}</Text>
    <Text numberOfLines={1} style={{color:c.text,fontSize:15,fontWeight:'700'}}>{b.name||'Sem título'}</Text>
    <Text style={{color:c.muted,fontSize:12}}>{b.pages.length+(b.pages.length===1?' nota':' notas')}</Text>
    {last?<Text numberOfLines={1} style={{color:c.muted,fontSize:11}}>{'Última: '+(last.title||'Sem título')}</Text>:null}
   </Pressable>;})}
   {!books.length?<Pressable onPress={()=>{setEditingBook(null);setNewName('');setCreate(true);}} style={{flex:1,borderRadius:18,borderWidth:1,borderStyle:'dashed',borderColor:c.line,padding:22,alignItems:'center',gap:4}}><Text style={{fontSize:26}}>📁</Text><Text style={{color:c.muted,fontSize:13,textAlign:'center'}}>Crie a primeira pasta para organizar suas notas.</Text></Pressable>:null}
  </View>}
  {onDelete&&!opened&&!query.trim()?<Pressable onLongPress={onDelete} style={{alignSelf:'flex-start',paddingVertical:4}}><Text style={{color:c.muted,fontSize:11}}>Segure aqui para remover o bloco de notas</Text></Pressable>:null}

  <Sheet visible={create} onClose={()=>setCreate(false)}><Text style={{fontSize:21,fontWeight:'700',color:c.text}}>{editingBook?'Renomear pasta':'Nova pasta'}</Text><TextInput accessibilityLabel="Nome da pasta" autoFocus value={newName} onChangeText={setNewName} placeholder="Ex.: Trabalho, Ideias, Receitas" placeholderTextColor={c.muted} style={{color:c.text,backgroundColor:c.input,borderRadius:10,padding:14,marginVertical:15}}/><Button title={editingBook?'Salvar pasta':'Criar pasta'} disabled={!newName.trim()} onPress={()=>{update(next=>{if(editingBook){next.find(b=>b.id===editingBook)!.name=newName.trim();}else next.push({id:uid(),name:newName.trim(),emoji:'📁',expanded:true,pages:[]});});setCreate(false);}}/></Sheet>
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
