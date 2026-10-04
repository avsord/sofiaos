import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {Sheet} from './Sheet';
import {attachmentMime,attachmentTypes} from '../lib/chat-attachments';
import type {AttachmentDraft} from '../lib/types';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, AppState, Alert, Keyboard, Pressable, ScrollView, Image } from 'react-native';
import { AudioModule, useAudioRecorder, useAudioRecorderState, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import { File } from 'expo-file-system';
import { useTheme } from '../lib/theme';
import { silenceVoices } from '../lib/audio-focus';
import { durationLabel, errorText } from '../lib/chat-model';
import { VoiceDraft } from '../lib/types';
import { IconButton } from './UI';
import { VoicePlayer } from './VoicePlayer';
export function deleteVoice(uri:string){try{const file=new File(uri);if(file.exists)file.delete();}catch{}}
export function Composer({disabled,enterToSend,autoSendVoice,maxChars,onText,onVoice,onAttachments,onActivity,onDraft}:{disabled:boolean;enterToSend:boolean;autoSendVoice:boolean;maxChars:number;onText:(text:string)=>void;onAttachments:(files:AttachmentDraft[],text:string)=>void;onVoice:(draft:VoiceDraft)=>void;onActivity:(active:boolean)=>void;onDraft:(active:boolean)=>void}) {
 const c=useTheme(),recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,numberOfChannels:1,bitRate:96000,isMeteringEnabled:true});
 const [files,setFiles]=useState<AttachmentDraft[]>([]),[attachments,setAttachments]=useState(false);
 const rs=useAudioRecorderState(recorder,120);const [text,setText]=useState(''),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[draft,setDraft]=useState<VoiceDraft|null>(null);
 const recordingRef=useRef(false),busyRef=useRef(false),draftRef=useRef<VoiceDraft|null>(null),mounted=useRef(true);
 const stopRef=useRef<(discard?:boolean,sendImmediately?:boolean)=>Promise<void>>(async()=>{});
 useEffect(()=>{draftRef.current=draft;},[draft]);
 useEffect(()=>{onActivity(recording||busy);},[recording,busy,onActivity]);
 useEffect(()=>{onDraft(!!draft||text.length>0||files.length>0);},[draft,text,files,onDraft]);
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>{if(s!=='active'&&recordingRef.current)void stopRef.current(false,false);});return()=>sub.remove();},[]);
 useEffect(()=>{if(recording&&rs.durationMillis>=300000)void stopRef.current(false,autoSendVoice);},[recording,rs.durationMillis,autoSendVoice]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(recordingRef.current)void recorder.stop().catch(()=>{});if(draftRef.current)deleteVoice(draftRef.current.uri);void setAudioModeAsync({allowsRecording:false}).catch(()=>{});};},[recorder]);
 async function start(){
  if(disabled||busyRef.current||recordingRef.current||draft)return;busyRef.current=true;setBusy(true);
  try{Keyboard.dismiss();await silenceVoices();const permission=await AudioModule.requestRecordingPermissionsAsync();if(!permission.granted)throw new Error('Permita o microfone nas configurações do celular para gravar áudio.');
   await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldPlayInBackground:false});await recorder.prepareToRecordAsync();
   if(!mounted.current||AppState.currentState!=='active'){await setAudioModeAsync({allowsRecording:false});return;}
   recorder.record();recordingRef.current=true;setRecording(true);
  }catch(e){if(mounted.current)Alert.alert('Microfone',errorText(e));}finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 async function stop(discard=false,sendImmediately=autoSendVoice){
  if(!recordingRef.current||busyRef.current)return;busyRef.current=true;setBusy(true);const duration=recorder.getStatus().durationMillis;
  try{await recorder.stop();recordingRef.current=false;if(mounted.current)setRecording(false);await setAudioModeAsync({allowsRecording:false});
   const uri=recorder.uri;if(!uri)throw new Error('O áudio não foi salvo. Grave novamente.');
   if(discard||!mounted.current||duration<350){deleteVoice(uri);return;}
   const next={uri,duration:Math.min(300000,Math.max(1,Math.round(duration)))};if(sendImmediately){draftRef.current=null;setDraft(null);void silenceVoices();onVoice(next);}else{draftRef.current=next;setDraft(next);}
  }catch(e){recordingRef.current=false;if(mounted.current){setRecording(false);Alert.alert('Gravação',errorText(e));}}
  finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 stopRef.current=stop;
 function discard(){if(draft)deleteVoice(draft.uri);draftRef.current=null;setDraft(null);}
 function sendText(){if(disabled||(!text.trim()&&!files.length)||recording||busy)return;const content=text.trim();setText('');if(files.length){const chosen=files;setFiles([]);onAttachments(chosen,content);}else onText(content);}
 function sendVoice(){if(!draft||disabled||busy)return;const sent=draft;draftRef.current=null;setDraft(null);void silenceVoices();onVoice(sent);}
 async function pick(kind:'images'|'camera'|'documents'){
  setAttachments(false);Keyboard.dismiss();setBusy(true);
  try{let chosen:AttachmentDraft[]=[];
   if(kind==='documents'){const result=await DocumentPicker.getDocumentAsync({type:attachmentTypes,copyToCacheDirectory:true,multiple:true});if(result.canceled)return;chosen=result.assets.map(a=>({uri:a.uri,name:a.name,mime:attachmentMime(a.name,a.mimeType),size:a.size||new File(a.uri).size}));}
   else{if(kind==='camera'){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Permita a câmera para tirar uma foto.');}
    const result=kind==='camera'?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.85}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:3,quality:.85});if(result.canceled)return;
    chosen=result.assets.map(a=>({uri:a.uri,name:a.fileName||'Imagem-'+Date.now()+'.jpg',mime:attachmentMime(a.fileName||'imagem.jpg',a.mimeType),size:a.fileSize||new File(a.uri).size}));}
   if(files.length+chosen.length>3)throw Error('Envie até 3 arquivos por mensagem.');if(chosen.some(f=>!f.size||f.size>10*1024*1024))throw Error('Cada arquivo deve ter até 10 MB.');setFiles(old=>[...old,...chosen]);
  }catch(e){Alert.alert('Anexo',errorText(e));}finally{setBusy(false);}
 }
 return <View testID="chat-composer" style={{padding:12,paddingTop:10,borderTopWidth:1,borderColor:c.line,backgroundColor:c.surface,gap:6}}>
 {files.length?<ScrollView horizontal keyboardShouldPersistTaps="always" style={{maxHeight:96}}>{files.map((f,i)=><View key={f.uri+String(i)} style={{maxWidth:180,marginRight:8,padding:8,backgroundColor:c.input,borderRadius:12}}>{f.mime.startsWith('image/')?<Image source={{uri:f.uri}} style={{width:60,height:42,borderRadius:6}}/>:null}<Text numberOfLines={1} style={{color:c.text,fontSize:12}}>{f.name}</Text><Pressable accessibilityLabel={'Remover anexo '+f.name} onPress={()=>setFiles(old=>old.filter((_,n)=>n!==i))}><Text style={{color:c.muted,paddingTop:4}}>Remover</Text></Pressable></View>)}</ScrollView>:null}
 {draft?<View style={{flexDirection:'row',alignItems:'center',gap:4}}><IconButton name="trash" label="Descartar áudio" onPress={discard}/><View style={{flex:1}}><VoicePlayer source={{uri:draft.uri}} duration={draft.duration}/></View><IconButton name="send" label="Enviar mensagem de voz" filled disabled={disabled} onPress={sendVoice}/></View>:
 recording?<View style={{flexDirection:'row',alignItems:'center',gap:10,minHeight:52}}><IconButton name="trash" label="Cancelar gravação" onPress={()=>void stop(true)}/><View style={{width:8,height:8,borderRadius:4,backgroundColor:c.danger}}/><View style={{flex:1,gap:5}}><Text style={{color:c.text,fontWeight:'600'}}>Gravando · {durationLabel(rs.durationMillis)}</Text><View style={{height:3,width:'90%',backgroundColor:c.line}}><View style={{height:3,width:`${Math.max(5,Math.min(100,((rs.metering??-60)+60)/60*100))}%`,backgroundColor:c.accent}}/></View></View><IconButton name="stop" label={autoSendVoice?"Parar e enviar":"Parar e ouvir antes de enviar"} filled onPress={()=>void stop(false,autoSendVoice)} disabled={busy}/></View>:
 <View style={{flexDirection:'row',alignItems:'flex-end',gap:9}}><View style={{flex:1,borderRadius:24,paddingLeft:14,paddingRight:4,paddingVertical:5,flexDirection:'row',alignItems:'flex-end',backgroundColor:c.input,minHeight:48,justifyContent:'center'}}><TextInput accessibilityLabel="Mensagem para a Sofia" value={text} onChangeText={setText} editable={!disabled&&!busy} placeholder="Mensagem para a Sofia…" placeholderTextColor={c.muted} multiline maxLength={maxChars} style={{flex:1,color:c.text,paddingTop:8,paddingBottom:8,fontSize:16,lineHeight:22,maxHeight:130,paddingVertical:0}} submitBehavior={enterToSend?'submit':'newline'} onSubmitEditing={enterToSend?sendText:undefined}/><IconButton name="clip" label="Anexar arquivo" size={36} disabled={disabled||busy} onPress={()=>{Keyboard.dismiss();setAttachments(true);}}/><IconButton name="camera" label="Tirar foto" size={36} disabled={disabled||busy} onPress={()=>void pick('camera')}/></View>{busy?<View style={{width:48,height:48,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:<IconButton name={text.trim()||files.length?'send':'mic'} label={text.trim()||files.length?'Enviar mensagem':'Gravar mensagem de voz'} filled size={48} disabled={disabled} onPress={text.trim()||files.length?sendText:()=>void start()}/>}</View>}
 {recording||draft?<Text style={{fontSize:11,textAlign:'center',color:c.muted}}>{recording?(autoSendVoice?'Até 5 minutos · ao parar, o áudio será enviado':'Até 5 minutos · pare para ouvir antes de enviar'):'Ouça, descarte ou envie o seu áudio'}</Text>:null}<Sheet visible={attachments} onClose={()=>setAttachments(false)}><Text style={{color:c.text,fontWeight:'700',fontSize:22,marginBottom:18}}>Anexar</Text><View style={{flexDirection:'row',justifyContent:'space-around'}}>{[['images','image','Imagens'],['documents','book','Documentos'],['camera','camera','Câmera']].map(([kind,icon,label])=><View key={kind} style={{alignItems:'center',gap:8}}><IconButton name={icon as 'image'|'book'|'camera'} label={label} filled size={52} onPress={()=>void pick(kind as 'images'|'documents'|'camera')}/><Text style={{color:c.text}}>{label}</Text></View>)}</View></Sheet></View>;
}
