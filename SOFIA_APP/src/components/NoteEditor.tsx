import React,{useRef,useState} from 'react';
import {Alert,View,Text,TextInput,KeyboardAvoidingView,Platform,ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {Definition,Entity} from '../lib/types';
import type {SofiaApi} from '../lib/api';
import type {Leaf} from '../lib/leaf-document';
import {applyLeafPatch} from '../lib/leaf-document';
import {noteLeaf,notePayload} from '../lib/note-document';
import {errorText} from '../lib/chat-model';
import {useTheme} from '../lib/theme';
import {LeafEditor} from './LeafEditor';
import {MotionModal} from './MotionModal';
import {Sheet} from './Sheet';
import {Choice} from './Choice';
import {Button,ErrorBanner,IconButton,forms} from './UI';
import {appAlert} from '../lib/app-alert';
import {Pressable} from 'react-native';
import {TagPicker} from './TagPicker';
import type {TagOption} from '../lib/library-tags';
import {joinTags,splitTags,toggleTag} from '../lib/library-tags';
import {noteCategories,withNoteCategories} from '../lib/note-categories';
export function NoteEditor({api,item,definition,onClose,onSaved,categoryOptions=[]}:{api:SofiaApi;item:Partial<Entity>;definition:Definition;onClose:()=>void;onSaved:()=>void;categoryOptions?:TagOption[]}){
 const c=useTheme(),titleRef=useRef<TextInput>(null),[initial]=useState(()=>{try{return {leaf:noteLeaf(item),error:''};}catch(e){return {leaf:{id:item.id||'new-note',title:item.title||'',content:item.content||''} as Leaf,error:errorText(e)};}}),[leaf,setLeaf]=useState(initial.leaf),[record,setRecord]=useState(item),[dirty,setDirty]=useState(false),[settings,setSettings]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(initial.error);
 function close(){if(busy)return;if(dirty)appAlert('Salvar a nota?','Você tem alterações nesta nota.',[{text:'Continuar escrevendo',style:'cancel'},{text:'Descartar alterações',style:'destructive',onPress:onClose},{text:'Salvar',onPress:()=>void save()}]);else onClose();}
 async function save(){if(busy||initial.error)return;setBusy(true);try{await api.saveEntity(notePayload(record,leaf));setDirty(false);onSaved();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 function update(patch:Partial<Entity>){setRecord(old=>({...old,...patch}));setDirty(true);}
 // 0.3.255: categorias que a pessoa ja criou aparecem para tocar; "+ Categoria" cria outra. Varias por nota.
 const [catSheet,setCatSheet]=useState(false),cats=noteCategories(record),setCats=(next:string[])=>update({tags:withNoteCategories(record.tags,next)});
 const catChips=[...categoryOptions.map(o=>o.label),...cats.filter(x=>!categoryOptions.some(o=>o.label.localeCompare(x,'pt-BR',{sensitivity:'base'})===0))];
 const isOn=(l:string)=>cats.some(x=>x.localeCompare(l,'pt-BR',{sensitivity:'base'})===0);
 const catRow=<ScrollView testID="note-category-row" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{flexGrow:0}} contentContainerStyle={{gap:8,paddingHorizontal:16,paddingBottom:8,alignItems:'center'}}>
  {catChips.map(l=>{const on=isOn(l);return <Pressable key={l} accessibilityRole="button" accessibilityState={{selected:on}} accessibilityLabel={(on?'Tirar categoria ':'Pôr categoria ')+l} onPress={()=>setCats(toggleTag(cats,l))} style={{paddingHorizontal:12,paddingVertical:6,borderRadius:99,borderWidth:1,borderColor:on?c.accent:c.line,backgroundColor:on?c.accentSoft:c.surface}}><Text style={{color:on?c.accent:c.text,fontWeight:on?'700':'500',fontSize:12}}>{(on?'✓ ':'')+l}</Text></Pressable>;})}
  <Pressable accessibilityRole="button" accessibilityLabel="Nova categoria" onPress={()=>setCatSheet(true)} style={{paddingHorizontal:12,paddingVertical:6,borderRadius:99,borderWidth:1,borderStyle:'dashed',borderColor:c.accent}}><Text style={{color:c.accent,fontWeight:'600',fontSize:12}}>{catChips.length?'+ Categoria':'+ Adicionar categoria'}</Text></Pressable>
 </ScrollView>;
 return <MotionModal visible animationType="none" onRequestClose={close}><SafeAreaView style={{flex:1,backgroundColor:c.bg}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:8}}><IconButton name="back" label="Voltar das notas" onPress={close} disabled={busy}/><Text style={{flex:1,color:c.muted}}>📄 {definition.label}</Text><IconButton name="more" label="Opções da nota" onPress={()=>setSettings(true)} disabled={busy}/><Button title="Salvar" onPress={()=>void save()} loading={busy} disabled={!!initial.error}/></View>{catRow}{error?<ErrorBanner text={error}/>:null}<LeafEditor leaf={leaf} titleRef={titleRef} onChange={patch=>{if(initial.error)return;setLeaf(old=>applyLeafPatch(old,patch));setDirty(true);}}/></KeyboardAvoidingView><Sheet visible={catSheet} onClose={()=>setCatSheet(false)} label="Fechar categorias da nota"><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:14,paddingBottom:8}}><Text style={{color:c.text,fontWeight:'500',fontSize:20}}>Categorias da nota</Text><TagPicker label="Toque para pôr ou tirar. Digite para criar uma nova." value={joinTags(cats)} options={categoryOptions} placeholder="Ex.: Ideia" onChange={v=>setCats(splitTags(v))}/><Button title="Pronto" onPress={()=>setCatSheet(false)}/></ScrollView></Sheet><Sheet visible={settings} onClose={()=>setSettings(false)}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:14}}><Text style={{color:c.text,fontWeight:'500',fontSize:20}}>Opções da nota</Text><TextInput accessibilityLabel="Área da nota" value={record.area||''} placeholder="Área" placeholderTextColor={c.muted} onChangeText={area=>update({area})} style={[forms.input,{color:c.text,borderColor:c.line}]}/><Choice label="Estado da nota" value={record.state||definition.states[0]} options={definition.states.map(value=>({value,label:value==='saved'?'Salva':value==='archived'?'Arquivada':value==='idea'?'Ideia':value}))} onChange={state=>update({state})}/><Choice label="Privacidade da nota" value={record.privacy||'private'} options={[{value:'private',label:'Privada'},{value:'local',label:'Somente local'},{value:'shared',label:'Compartilhada'}]} onChange={privacy=>update({privacy})}/>{definition.fields.filter(f=>!f.developerOnly&&f.key!=='leaf_document').map(f=><View key={f.key}><Text style={{color:c.muted}}>{f.label}</Text><TextInput accessibilityLabel={f.label} value={String(record.data?.[f.key]||'')} onChangeText={value=>update({data:{...record.data,[f.key]:value}})} style={[forms.input,{color:c.text,borderColor:c.line}]}/></View>)}{item.id?<Button secondary title="Excluir nota" onPress={()=>appAlert('Excluir nota?','A nota será excluída do aplicativo e do site.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{setBusy(true);api.deleteEntity(item.id!).then(onSaved).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}])}/>:null}</ScrollView></Sheet></SafeAreaView></MotionModal>;
}
