import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Modal, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import type { Bootstrap, Conversation, Message, VoiceDraft, ChatResult } from '../lib/types';
import { SofiaApi } from '../lib/api';
import { dayKey, errorText, mergeMessages, statusLabel } from '../lib/chat-model';
import { useTheme } from '../lib/theme';
import { silenceVoices } from '../lib/audio-focus';
import { Brand, Empty, ErrorBanner, IconButton } from '../components/UI';
import { Composer, deleteVoice } from '../components/Composer';
import { VoicePlayer } from '../components/VoicePlayer';
function Bubble({message,previous,api,onRetry,onDelete}:{message:Message;previous?:Message;api:SofiaApi;onRetry:(m:Message)=>void;onDelete:(m:Message)=>void}) {
 const c=useTheme(),mine=message.role==='user',isNewDay=!previous||dayKey(previous.created_at)!==dayKey(message.created_at);
 return <View style={{marginBottom:10}}>{isNewDay?<View style={{alignItems:'center',padding:16}}><Text style={{color:c.muted,fontSize:11,fontWeight:'500'}}>{new Date(message.created_at).toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}</Text></View>:null}
 <View style={{flexDirection:'row',justifyContent:mine?'flex-end':'flex-start',alignItems:'flex-end',gap:7}}>{!mine?<Brand size={25}/>:null}
 <Pressable onLongPress={()=>Alert.alert('Mensagem',mine?'Você':'Sofia',[{text:'Copiar texto',onPress:()=>void Clipboard.setStringAsync(message.content)},{text:'Excluir mensagem',style:'destructive',onPress:()=>onDelete(message)},{text:'Cancelar',style:'cancel'}])} delayLongPress={450} style={{maxWidth:'85%',minWidth:90,backgroundColor:mine?c.bubble:c.surface,borderWidth:mine?0:1,borderColor:c.line,borderRadius:19,borderBottomRightRadius:mine?5:19,borderBottomLeftRadius:mine?19:5,paddingHorizontal:14,paddingTop:12,paddingBottom:9,gap:8}}>
 {message.voice?<VoicePlayer source={api.audioSource(message.voice.audio_url)} duration={message.voice.duration_ms}/>:message.localVoice?<VoicePlayer source={{uri:message.localVoice.uri}} duration={message.localVoice.duration}/>:null}
 {message.content?<Text style={{fontSize:15.5,lineHeight:23,color:c.text}}>{message.content}</Text>:null}{message.error?<Text style={{color:c.danger,fontSize:12,lineHeight:18}}>{message.error}</Text>:null}
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:8}}><Text style={{color:c.muted,fontSize:10}}>{new Date(message.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}{mine?' · '+statusLabel(message.status):''}</Text></View></Pressable></View>
 {mine&&message.status==='failed'?<Pressable accessibilityRole="button" onPress={()=>onRetry(message)} style={{alignSelf:'flex-end',padding:10,minHeight:40}}><Text style={{color:c.danger,fontSize:12,fontWeight:'600'}}>Tentar novamente</Text></Pressable>:null}</View>;
}
export function Chat({api,bootstrap,enterToSend,autoSendVoice,onLock,active,onRefreshBootstrap}:{api:SofiaApi;bootstrap:Bootstrap;enterToSend:boolean;autoSendVoice:boolean;onLock:(v:boolean)=>void;active:boolean;onRefreshBootstrap:()=>Promise<void>|void}) {
 const c=useTheme(),list=useRef<FlatList<Message>>(null);
 const [conversation,setConversation]=useState<Conversation|null>(null),[messages,setMessages]=useState<Message[]>([]),[hasMore,setHasMore]=useState(false);
 const [loading,setLoading]=useState(true),[sending,setSending]=useState(false),[refreshing,setRefreshing]=useState(false),[dirty,setDirty]=useState(false),[recordingLock,setRecordingLock]=useState(false),[error,setError]=useState('');
 const [history,setHistory]=useState(false),[items,setItems]=useState<Conversation[]>([]),[historyMore,setHistoryMore]=useState(false),[query,setQuery]=useState('');
 const [clarification,setClarification]=useState<ChatResult['clarification']>(null);
 const mounted=useRef(true),sendLock=useRef(false),scrollEnd=useRef(true),voices=useRef(new Set<string>()),currentId=useRef('');
 const inputActivity=useCallback((v:boolean)=>setDirty(v),[]);
 useEffect(()=>{onLock(sending||recordingLock);},[sending,recordingLock,onLock]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;onLock(false);void silenceVoices();voices.current.forEach(deleteVoice);};},[onLock]);
 useEffect(()=>{if(!active)void silenceVoices();},[active]);
 async function select(item:Conversation){
  if(sendLock.current)return;setLoading(true);setError('');setHistory(false);setClarification(null);scrollEnd.current=true;currentId.current=item.id;
  try{const page=await api.history(item.id);if(!mounted.current||currentId.current!==item.id)return;setConversation(item);setMessages(page.messages);setHasMore(page.has_more);}catch(e){if(mounted.current)setError(errorText(e));}finally{if(mounted.current)setLoading(false);}
 }
 async function initialize(){
  setLoading(true);setError('');try{const h=await api.conversations();if(!mounted.current)return;setItems(h.items);setHistoryMore(h.has_more);
   const recent=h.items[0];const target=recent||(await api.newConversation()).conversation;await select(target);
  }catch(e){if(mounted.current){setError(errorText(e));setLoading(false);}}
 }
 useEffect(()=>{void initialize();},[api]);
 async function refresh(silent=false){
  if(!conversation||sendLock.current)return;const id=conversation.id;if(!silent)setRefreshing(true);
  try{const page=await api.history(id);if(!mounted.current||currentId.current!==id)return;setMessages(prev=>mergeMessages(prev,page.messages));if(!silent)setError('');}
  catch(e){if(!silent&&mounted.current)setError(errorText(e));}finally{if(!silent&&mounted.current)setRefreshing(false);}
 }
 useEffect(()=>{if(!active||!conversation)return;const sub=AppState.addEventListener('change',s=>{if(s==='active')void refresh(true);});const t=setInterval(()=>{if(AppState.currentState==='active')void refresh(true);},8000);return()=>{clearInterval(t);sub.remove();};},[active,conversation,api]);
 async function older(){if(!conversation||!hasMore||refreshing)return;const before=messages.find(m=>m.sequence)?.sequence;if(!before)return;setRefreshing(true);scrollEnd.current=false;
  try{const page=await api.history(conversation.id,before);setMessages(prev=>mergeMessages(page.messages,prev));setHasMore(page.has_more);}catch(e){setError(errorText(e));}finally{setRefreshing(false);}}
 async function newChat(){if(dirty||sending)return;try{await select((await api.newConversation()).conversation);}catch(e){setError(errorText(e));}}
 async function openHistory(){if(dirty||sending)return;setHistory(true);setQuery('');try{const h=await api.conversations();setItems(h.items);setHistoryMore(h.has_more);}catch(e){setError(errorText(e));}}
 async function moreHistory(){try{const h=await api.conversations(items.length);setItems(prev=>[...prev,...h.items]);setHistoryMore(h.has_more);}catch(e){setError(errorText(e));}}
 async function send(message:Message,retry=false){
  if(sendLock.current||!conversation)return;sendLock.current=true;setSending(true);setError('');scrollEnd.current=true;
  setMessages(prev=>mergeMessages(prev,[{...message,status:'sending',error:undefined}]));
  const data={conversation_id:conversation.id,client_message_id:message.client_id,retry,...(clarification?.id?{clarification_id:clarification.id}:{})};
  try{let result:ChatResult;
   if(message.localVoice){const file=new File(message.localVoice.uri);if(!file.exists)throw new Error('O áudio não está mais no celular. Grave novamente.');if(file.size>bootstrap.limits.audio_bytes)throw new Error('Este áudio ultrapassou 10 MB. Grave uma mensagem mais curta.');const base64=await file.base64();result=await api.audio({...data,audio_base64:base64,mime:'audio/mp4',duration_ms:message.localVoice.duration});}
   else result=await api.chat({...data,message:message.content});
   if(!mounted.current)return;setMessages(prev=>mergeMessages(prev,result.messages));setClarification(result.clarification);
   if(message.localVoice){deleteVoice(message.localVoice.uri);voices.current.delete(message.localVoice.uri);}
  }catch(e){if(!mounted.current)return;const explanation=errorText(e);setError(explanation);setMessages(prev=>mergeMessages(prev,[{...message,status:'failed',error:explanation}]));try{const page=await api.history(conversation.id);if(mounted.current)setMessages(prev=>mergeMessages(prev,page.messages));}catch{}}
  finally{sendLock.current=false;if(mounted.current)setSending(false);}
 }
 function text(content:string){const id=Crypto.randomUUID();void send({id,client_id:id,conversation_id:conversation?.id,role:'user',content,created_at:new Date().toISOString(),status:'sending'});}
 function audio(draft:VoiceDraft){voices.current.add(draft.uri);const id=Crypto.randomUUID();void send({id,client_id:id,conversation_id:conversation?.id,role:'user',content:'',created_at:new Date().toISOString(),status:'sending',localVoice:draft});}
 async function deleteMessage(message:Message){if(sending)return;Alert.alert('Excluir mensagem?','Ela será removida do histórico do app e da web.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{api.deleteMessage(message.id).then(()=>{setMessages(prev=>prev.filter(m=>m.id!==message.id));setError('');}).catch(e=>{if(message.status==='failed')setMessages(prev=>prev.filter(m=>m.id!==message.id));else setError(errorText(e));});}}]);}
 return <KeyboardAvoidingView style={{flex:1,backgroundColor:c.bg}} behavior={Platform.OS==='ios'?'padding':undefined}>
 <View style={{paddingHorizontal:16,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface}}><Brand/><View style={{flex:1}}><Text style={{color:c.text,fontSize:19,fontWeight:'700'}}>Sofia</Text><Text numberOfLines={1} style={{color:c.muted,fontSize:11,marginTop:3}}>Sua assistente · mesma memória</Text></View><IconButton name="history" label="Histórico de conversas" onPress={()=>void openHistory()} disabled={dirty||sending||recordingLock}/><IconButton name="plus" label="Nova conversa" onPress={()=>void newChat()} disabled={dirty||sending||recordingLock}/></View>
 {!bootstrap.ai.ready?<ErrorBanner text={bootstrap.ai.reason||'O Filtro Privado está sendo sincronizado com o servidor.'} onRetry={()=>void onRefreshBootstrap()}/>:null}{error?<ErrorBanner text={error} onRetry={()=>void (conversation?refresh():initialize())}/>:null}
 {loading?<View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:<FlatList ref={list} data={messages} keyExtractor={m=>m.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:22,flexGrow:1}} refreshing={refreshing} onRefresh={()=>void refresh()} onScroll={e=>{const n=e.nativeEvent;scrollEnd.current=n.contentSize.height-n.contentOffset.y-n.layoutMeasurement.height<100;}} scrollEventThrottle={100} onContentSizeChange={()=>{if(scrollEnd.current)list.current?.scrollToEnd({animated:false});}}
 ListHeaderComponent={hasMore?<Pressable onPress={()=>void older()} style={{alignItems:'center',padding:12,minHeight:44}}><Text style={{color:c.accent,fontSize:12}}>Carregar mensagens anteriores</Text></Pressable>:null}
 ListEmptyComponent={<View style={{flex:1,justifyContent:'center'}}><Empty title="Vamos conversar?" body="Escreva ou envie uma mensagem de voz. A mesma Sofia, o contexto e a memória da sua conta."/><Text style={{color:c.muted,textAlign:'center',fontSize:11,paddingHorizontal:30,lineHeight:17}}>Suas mensagens são processadas no servidor da Sofia e pelo provedor de IA configurado.</Text></View>}
 renderItem={({item,index})=><Bubble message={item} previous={messages[index-1]} api={api} onRetry={m=>{if(!sending)void send(m,true);}} onDelete={m=>void deleteMessage(m)}/>}
 ListFooterComponent={sending?<View style={{flexDirection:'row',gap:9,alignItems:'center',padding:10}}><ActivityIndicator size="small" color={c.accent}/><Text style={{color:c.muted,fontSize:12}}>Aguardando a Sofia…</Text></View>:null}/>}
 {conversation?<Composer key={conversation.id} disabled={loading||sending||!bootstrap.ai.ready} enterToSend={enterToSend} autoSendVoice={autoSendVoice} maxChars={bootstrap.limits.text_chars} onText={text} onVoice={audio} onActivity={setRecordingLock} onDraft={inputActivity}/>:null}
 <Modal visible={history} transparent animationType="slide" onRequestClose={()=>setHistory(false)}><Pressable onPress={()=>setHistory(false)} style={{flex:1,backgroundColor:'#00000060',justifyContent:'flex-end'}}><Pressable onPress={()=>{}} style={{maxHeight:'80%',padding:22,borderTopLeftRadius:28,borderTopRightRadius:28,backgroundColor:c.surface}}>
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}><Text style={{fontSize:23,fontWeight:'700',color:c.text}}>Conversas</Text><IconButton name="close" label="Fechar histórico" onPress={()=>setHistory(false)}/></View><TextInput placeholder="Buscar pelo título" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} style={{backgroundColor:c.input,borderRadius:14,padding:14,color:c.text,marginBottom:14}}/>
 <ScrollView keyboardShouldPersistTaps="handled">{items.filter(i=>i.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item=><Pressable key={item.id} onPress={()=>void select(item)} style={{padding:14,borderBottomWidth:1,borderColor:c.line,gap:5}}><Text numberOfLines={2} style={{color:c.text,fontSize:15,fontWeight:'600'}}>{item.title}</Text><Text style={{color:c.muted,fontSize:11}}>{item.channel==='mobile'?'App':item.channel==='whatsapp'?'WhatsApp':'Site'} · {new Date(item.updated_at).toLocaleDateString('pt-BR')}</Text></Pressable>)}{historyMore?<Pressable onPress={()=>void moreHistory()} style={{padding:18}}><Text style={{color:c.accent}}>Carregar mais</Text></Pressable>:null}</ScrollView></Pressable></Pressable></Modal>
 </KeyboardAvoidingView>;
}
