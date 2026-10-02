import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Modal, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, AppState, BackHandler } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import type { Bootstrap, Conversation, Message, VoiceDraft, ChatResult } from '../lib/types';
import { SofiaApi } from '../lib/api';
import { dayKey, errorText, mergeMessages, statusLabel } from '../lib/chat-model';
import {reconcileMessages,toggleMessageSelection,retainMessageSelection} from '../lib/chat-sync';
import {Icon} from '../components/Icon';
import { useTheme } from '../lib/theme';
import { silenceVoices } from '../lib/audio-focus';
import { Brand, Empty, ErrorBanner, IconButton } from '../components/UI';
import { Composer, deleteVoice } from '../components/Composer';
import { VoicePlayer } from '../components/VoicePlayer';
function Bubble({message,previous,api,onRetry,selecting,selected,onSelect}:{message:Message;previous?:Message;api:SofiaApi;onRetry:(m:Message)=>void;selecting:boolean;selected:boolean;onSelect:(m:Message)=>void}) {
 const c=useTheme(),mine=message.role==='user',isNewDay=!previous||dayKey(previous.created_at)!==dayKey(message.created_at);
 return <View style={{marginBottom:10}}>{isNewDay?<View style={{alignItems:'center',padding:16}}><Text style={{color:c.muted,fontSize:11,fontWeight:'500'}}>{new Date(message.created_at).toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}</Text></View>:null}
 <View style={{flexDirection:'row',justifyContent:mine?'flex-end':'flex-start',alignItems:'flex-end',gap:7,paddingVertical:3,borderRadius:10,backgroundColor:selected?c.accentSoft:'transparent'}}>
 {selecting?<View style={{width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center',alignSelf:'center',borderWidth:1,borderColor:selected?c.accent:c.line,backgroundColor:selected?c.accent:'transparent'}}>{selected?<Icon name="check" color="#FFFFFF" size={16}/>:null}</View>:!mine?<Brand size={25}/>:null}
 <Pressable onLongPress={()=>onSelect(message)} onPress={()=>{if(selecting)onSelect(message);}} delayLongPress={350}
  accessibilityRole={selecting?'checkbox':'button'} accessibilityState={{checked:selected}} accessibilityLabel={(mine?'Você: ':'Sofia: ')+(message.content||'Mensagem de voz')}
  accessibilityHint={selecting?'Toque para alternar a seleção':'Segure para selecionar mensagens'}
  style={{maxWidth:'85%',minWidth:90,backgroundColor:mine?c.bubble:c.surface,borderWidth:mine?0:1,borderColor:selected?c.accent:c.line,borderRadius:19,borderBottomRightRadius:mine?5:19,borderBottomLeftRadius:mine?19:5,paddingHorizontal:14,paddingTop:12,paddingBottom:9,gap:8}}>
 <View pointerEvents={selecting?'none':'auto'}>{message.voice?<VoicePlayer source={api.audioSource(message.voice.audio_url)} duration={message.voice.duration_ms}/>:message.localVoice?<VoicePlayer source={{uri:message.localVoice.uri}} duration={message.localVoice.duration}/>:null}</View>
 {message.content?<Text style={{fontSize:15.5,lineHeight:23,color:c.text}}>{message.content}</Text>:null}{message.error?<Text style={{color:c.danger,fontSize:12,lineHeight:18}}>{message.error}</Text>:null}
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:8}}><Text style={{color:c.muted,fontSize:10}}>{new Date(message.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}{mine?' · '+statusLabel(message.status):''}</Text></View></Pressable></View>
 {mine&&message.status==='failed'&&!selecting?<Pressable accessibilityRole="button" onPress={()=>onRetry(message)} style={{alignSelf:'flex-end',padding:10,minHeight:40}}><Text style={{color:c.danger,fontSize:12,fontWeight:'600'}}>Tentar novamente</Text></Pressable>:null}</View>;
}
export function Chat({api,bootstrap,enterToSend,autoSendVoice,onLock,active,onRefreshBootstrap}:{api:SofiaApi;bootstrap:Bootstrap;enterToSend:boolean;autoSendVoice:boolean;onLock:(v:boolean)=>void;active:boolean;onRefreshBootstrap:()=>Promise<void>|void}) {
 const c=useTheme(),list=useRef<FlatList<Message>>(null);
 const [conversation,setConversation]=useState<Conversation|null>(null),[messages,setMessages]=useState<Message[]>([]),[hasMore,setHasMore]=useState(false);
 const [loading,setLoading]=useState(true),[sending,setSending]=useState(false),[refreshing,setRefreshing]=useState(false),[dirty,setDirty]=useState(false),[recordingLock,setRecordingLock]=useState(false),[error,setError]=useState('');
 const [history,setHistory]=useState(false),[items,setItems]=useState<Conversation[]>([]),[historyMore,setHistoryMore]=useState(false),[query,setQuery]=useState('');
 const [selectedIds,setSelectedIds]=useState(new Set<string>()),[deleting,setDeleting]=useState(false);
 const syncEpoch=useRef(0),syncBusy=useRef(false),latest=useRef({dirty,history,recordingLock,selectedIds,deleting});latest.current={dirty,history,recordingLock,selectedIds,deleting};
 const [clarification,setClarification]=useState<ChatResult['clarification']>(null);
 const mounted=useRef(true),sendLock=useRef(false),scrollEnd=useRef(true),voices=useRef(new Set<string>()),currentId=useRef('');
 const inputActivity=useCallback((v:boolean)=>setDirty(v),[]);
 useEffect(()=>{onLock(sending||recordingLock||deleting);},[sending,recordingLock,deleting,onLock]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;onLock(false);void silenceVoices();voices.current.forEach(deleteVoice);};},[onLock]);
 useEffect(()=>{if(!active){void silenceVoices();setSelectedIds(new Set());}},[active]);
 useEffect(()=>{if(!active||!selectedIds.size)return;const s=BackHandler.addEventListener('hardwareBackPress',()=>{if(!deleting)setSelectedIds(new Set());return true;});return()=>s.remove();},[active,selectedIds.size,deleting]);
 async function select(item:Conversation,publish=true){
  if(sendLock.current||latest.current.deleting)return;const epoch=++syncEpoch.current;setLoading(true);setError('');setHistory(false);setSelectedIds(new Set());setClarification(null);scrollEnd.current=true;currentId.current=item.id;
  try{const page=publish&&['web','mobile'].includes(item.channel)?await api.selectChat(item.id):await api.history(item.id);if(!mounted.current||epoch!==syncEpoch.current||currentId.current!==item.id)return;setConversation(item);setMessages(page.messages);setHasMore(page.has_more);}catch(e){if(mounted.current)setError(errorText(e));}finally{if(mounted.current&&epoch===syncEpoch.current)setLoading(false);}
 }
 async function initialize(){
  const epoch=++syncEpoch.current;setLoading(true);setError('');try{const page=await api.ensureChat();if(!mounted.current||epoch!==syncEpoch.current||!page.conversation)return;
   currentId.current=page.conversation.id;setConversation(page.conversation);setMessages(page.messages);setHasMore(page.has_more);setSelectedIds(new Set());
  }catch(e){if(mounted.current)setError(errorText(e));}finally{if(mounted.current&&epoch===syncEpoch.current)setLoading(false);}
 }
 useEffect(()=>{void initialize();},[api]);
 async function refresh(silent=false){
  if(!conversation||sendLock.current||syncBusy.current||latest.current.deleting)return;const id=conversation.id,epoch=syncEpoch.current;syncBusy.current=true;if(!silent)setRefreshing(true);
  try{const mode=latest.current,personal=['web','mobile'].includes(conversation.channel),hold=mode.dirty||mode.recordingLock||mode.history||mode.selectedIds.size>0;
   const page=personal?await api.syncChat(hold?id:undefined):await api.history(id);
   if(!mounted.current||epoch!==syncEpoch.current||currentId.current!==id||sendLock.current)return;
   if('conversation' in page&&!page.conversation){if(!latest.current.dirty){setMessages([]);await initialize();}return;}
   if(page.conversation&&page.conversation.id!==id){if(latest.current.dirty||latest.current.recordingLock||latest.current.selectedIds.size)return;++syncEpoch.current;currentId.current=page.conversation.id;setConversation(page.conversation);setMessages(page.messages);setHasMore(page.has_more);setSelectedIds(new Set());setClarification(null);return;}
   setMessages(prev=>{const next=reconcileMessages(prev,page);return next;});setHasMore(page.has_more);
   if('deleted_ids' in page){const removed=new Set(page.deleted_ids as string[]);setSelectedIds(prev=>{const next=new Set([...prev].filter(key=>!removed.has(key)));return next.size===prev.size?prev:next;});}
   if(!silent)setError('');
  }catch(e:any){if(e?.status===404&&!latest.current.dirty&&!latest.current.selectedIds.size){await initialize();}else if(!silent&&mounted.current)setError(errorText(e));}
  finally{syncBusy.current=false;if(!silent&&mounted.current)setRefreshing(false);}
 }
 useEffect(()=>{if(!active||!conversation)return;void refresh(true);const sub=AppState.addEventListener('change',state=>{if(state==='active')void refresh(true);});const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh(true);},2000);return()=>{clearInterval(timer);sub.remove();};},[active,conversation,api]);
 async function older(){if(!conversation||!hasMore||refreshing||deleting)return;const id=conversation.id,epoch=++syncEpoch.current;const before=messages.find(m=>m.sequence)?.sequence;if(!before)return;setRefreshing(true);scrollEnd.current=false;
  try{const page=await api.history(id,before);if(!mounted.current||currentId.current!==id||syncEpoch.current!==epoch)return;setMessages(prev=>mergeMessages(page.messages,prev));setHasMore(page.has_more);}catch(e){setError(errorText(e));}finally{setRefreshing(false);}}
 async function newChat(){if(dirty||sending)return;try{await select((await api.newConversation()).conversation);}catch(e){setError(errorText(e));}}
 async function openHistory(){if(dirty||sending)return;setHistory(true);setQuery('');try{const h=await api.conversations();setItems(h.items);setHistoryMore(h.has_more);}catch(e){setError(errorText(e));}}
 async function moreHistory(){try{const h=await api.conversations(items.length);setItems(prev=>[...prev,...h.items]);setHistoryMore(h.has_more);}catch(e){setError(errorText(e));}}
 async function send(message:Message,retry=false){
  if(sendLock.current||!conversation||deleting)return;++syncEpoch.current;sendLock.current=true;setSending(true);setError('');scrollEnd.current=true;
  setMessages(prev=>mergeMessages(prev,[{...message,status:'sending',error:undefined}]));
  let targetId=conversation.id;
  const data={conversation_id:targetId,client_message_id:message.client_id,retry,...(clarification?.id?{clarification_id:clarification.id}:{})};
  try{let result:ChatResult;
   // A send is explicit: preserve a draft in its thread instead of following a
   // remote cursor mid-composition. Publish that thread to the other client.
   if(['web','mobile'].includes(conversation.channel)){
    try{await api.selectChat(targetId);}catch(e:any){if(e?.status!==404)throw e;
     const page=await api.ensureChat();if(!page.conversation)throw new Error('Não foi possível reabrir a conversa.');
     targetId=page.conversation.id;data.conversation_id=targetId;currentId.current=targetId;
     if(mounted.current){setConversation(page.conversation);setMessages(mergeMessages(page.messages,[{...message,conversation_id:targetId,status:'sending'}]));}
    }
   }
   if(message.localVoice){const file=new File(message.localVoice.uri);if(!file.exists)throw new Error('O áudio não está mais no celular. Grave novamente.');if(file.size>bootstrap.limits.audio_bytes)throw new Error('Este áudio ultrapassou 10 MB. Grave uma mensagem mais curta.');const base64=await file.base64();result=await api.audio({...data,audio_base64:base64,mime:'audio/mp4',duration_ms:message.localVoice.duration});}
   else result=await api.chat({...data,message:message.content});
   if(!mounted.current)return;setMessages(prev=>mergeMessages(prev,result.messages));setClarification(result.clarification);
   if(message.localVoice){deleteVoice(message.localVoice.uri);voices.current.delete(message.localVoice.uri);}
  }catch(e){if(!mounted.current)return;const explanation=errorText(e);setError(explanation);setMessages(prev=>mergeMessages(prev,[{...message,status:'failed',error:explanation}]));try{const page=await api.history(targetId);if(mounted.current&&currentId.current===targetId)setMessages(prev=>mergeMessages(prev,page.messages));}catch{}}
  finally{sendLock.current=false;if(mounted.current)setSending(false);}
 }
 function text(content:string){const id=Crypto.randomUUID();void send({id,client_id:id,conversation_id:conversation?.id,role:'user',content,created_at:new Date().toISOString(),status:'sending'});}
 function audio(draft:VoiceDraft){voices.current.add(draft.uri);const id=Crypto.randomUUID();void send({id,client_id:id,conversation_id:conversation?.id,role:'user',content:'',created_at:new Date().toISOString(),status:'sending',localVoice:draft});}
 function selectMessage(message:Message){if(sending||recordingLock||deleting)return;setSelectedIds(prev=>toggleMessageSelection(prev,message.id));}
 function deleteSelected(){
  if(!conversation||!selectedIds.size||deleting||sending)return;
  const chosen=messages.filter(m=>selectedIds.has(m.id)),id=conversation.id;
  Alert.alert('Excluir '+chosen.length+' mensagem'+(chosen.length===1?'?':'s?'),'As mensagens selecionadas serão excluídas do histórico do app e do site.',[
   {text:'Cancelar',style:'cancel'},
   {text:'Excluir',style:'destructive',onPress:()=>{void(async()=>{
    ++syncEpoch.current;setDeleting(true);setError('');
    const local=chosen.filter(m=>!m.sequence&&m.status==='failed'),remote=chosen.filter(m=>!local.includes(m));
    let removed=local.map(m=>m.id);
    try{await silenceVoices();if(remote.length){const result=await api.deleteChatMessages(id,remote.map(m=>m.id));removed.push(...result.deleted_ids);if(result.failed.length)setError('Algumas mensagens não foram excluídas. Elas continuam selecionadas para tentar novamente.');}
     const done=new Set(removed);local.forEach(m=>{if(m.localVoice){deleteVoice(m.localVoice.uri);voices.current.delete(m.localVoice.uri);}});
     if(mounted.current&&currentId.current===id){setMessages(prev=>prev.filter(m=>!done.has(m.id)));setSelectedIds(prev=>new Set([...prev].filter(key=>!done.has(key))));}
    }catch(e){if(mounted.current)setError(errorText(e));}finally{if(mounted.current)setDeleting(false);}
   })();}}
  ]);
 }
 function copySelected(){const content=messages.filter(m=>selectedIds.has(m.id)).map(m=>m.content).filter(Boolean).join('\n\n');if(content)void Clipboard.setStringAsync(content);}
 return <KeyboardAvoidingView style={{flex:1,backgroundColor:c.bg}} behavior={Platform.OS==='ios'?'padding':undefined}>
 {selectedIds.size>0?<View style={{paddingHorizontal:10,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}><IconButton name="back" label="Sair da seleção" disabled={deleting} onPress={()=>setSelectedIds(new Set())}/><Text style={{flex:1,color:c.text,fontSize:18,fontWeight:'600'}}>{selectedIds.size} selecionada{selectedIds.size===1?'':'s'}</Text><IconButton name="copy" label="Copiar mensagens selecionadas" disabled={deleting} onPress={copySelected}/>{deleting?<ActivityIndicator color={c.accent}/>:<IconButton name="trash" label="Excluir mensagens selecionadas" onPress={deleteSelected}/>}</View>:<View style={{paddingHorizontal:16,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}><Brand/><View style={{flex:1}}><Text style={{color:c.text,fontSize:19,fontWeight:'700'}}>Sofia</Text><Text numberOfLines={1} style={{color:c.muted,fontSize:11,marginTop:3}}>Sua assistente · mesma memória</Text></View><IconButton name="history" label="Histórico de conversas" onPress={()=>void openHistory()} disabled={dirty||sending||recordingLock}/><IconButton name="plus" label="Nova conversa" onPress={()=>void newChat()} disabled={dirty||sending||recordingLock}/></View>}
 {!bootstrap.ai.ready?<ErrorBanner text={bootstrap.ai.reason||'O Filtro Privado está sendo sincronizado com o servidor.'} onRetry={()=>void onRefreshBootstrap()}/>:null}{error?<ErrorBanner text={error} onRetry={()=>void (conversation?refresh():initialize())}/>:null}
 {loading?<View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:<FlatList ref={list} data={messages} extraData={selectedIds} keyExtractor={m=>m.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:22,flexGrow:1}} refreshing={refreshing} onRefresh={()=>void refresh()} onScroll={e=>{const n=e.nativeEvent;scrollEnd.current=n.contentSize.height-n.contentOffset.y-n.layoutMeasurement.height<100;}} scrollEventThrottle={100} onContentSizeChange={()=>{if(scrollEnd.current)list.current?.scrollToEnd({animated:false});}}
 ListHeaderComponent={hasMore?<Pressable onPress={()=>void older()} style={{alignItems:'center',padding:12,minHeight:44}}><Text style={{color:c.accent,fontSize:12}}>Carregar mensagens anteriores</Text></Pressable>:null}
 ListEmptyComponent={<View style={{flex:1,justifyContent:'center'}}><Empty title="Vamos conversar?" body="Escreva ou envie uma mensagem de voz. A mesma Sofia, o contexto e a memória da sua conta."/><Text style={{color:c.muted,textAlign:'center',fontSize:11,paddingHorizontal:30,lineHeight:17}}>Suas mensagens são processadas no servidor da Sofia e pelo provedor de IA configurado.</Text></View>}
 renderItem={({item,index})=><Bubble message={item} previous={messages[index-1]} api={api} onRetry={m=>{if(!sending)void send(m,true);}} selecting={selectedIds.size>0} selected={selectedIds.has(item.id)} onSelect={selectMessage}/>}
 ListFooterComponent={sending?<View style={{flexDirection:'row',gap:9,alignItems:'center',padding:10}}><ActivityIndicator size="small" color={c.accent}/><Text style={{color:c.muted,fontSize:12}}>Aguardando a Sofia…</Text></View>:null}/>}
 {conversation?<Composer key={conversation.id} disabled={loading||sending||deleting||selectedIds.size>0||!bootstrap.ai.ready} enterToSend={enterToSend} autoSendVoice={autoSendVoice} maxChars={bootstrap.limits.text_chars} onText={text} onVoice={audio} onActivity={setRecordingLock} onDraft={inputActivity}/>:null}
 <Modal visible={history} transparent animationType="slide" onRequestClose={()=>setHistory(false)}><Pressable onPress={()=>setHistory(false)} style={{flex:1,backgroundColor:'#00000060',justifyContent:'flex-end'}}><Pressable onPress={()=>{}} style={{maxHeight:'80%',padding:22,borderTopLeftRadius:28,borderTopRightRadius:28,backgroundColor:c.surface}}>
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}><Text style={{fontSize:23,fontWeight:'700',color:c.text}}>Conversas</Text><IconButton name="close" label="Fechar histórico" onPress={()=>setHistory(false)}/></View><TextInput placeholder="Buscar pelo título" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} style={{backgroundColor:c.input,borderRadius:14,padding:14,color:c.text,marginBottom:14}}/>
 <ScrollView keyboardShouldPersistTaps="handled">{items.filter(i=>i.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item=><Pressable key={item.id} onPress={()=>void select(item)} style={{padding:14,borderBottomWidth:1,borderColor:c.line,gap:5}}><Text numberOfLines={2} style={{color:c.text,fontSize:15,fontWeight:'600'}}>{item.title}</Text><Text style={{color:c.muted,fontSize:11}}>{item.channel==='mobile'?'App':item.channel==='whatsapp'?'WhatsApp':'Site'} · {new Date(item.updated_at).toLocaleDateString('pt-BR')}</Text></Pressable>)}{historyMore?<Pressable onPress={()=>void moreHistory()} style={{padding:18}}><Text style={{color:c.accent}}>Carregar mais</Text></Pressable>:null}</ScrollView></Pressable></Pressable></Modal>
 </KeyboardAvoidingView>;
}
