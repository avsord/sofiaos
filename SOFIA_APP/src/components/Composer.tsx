import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, AppState, Alert, Keyboard } from 'react-native';
import { AudioModule, useAudioRecorder, useAudioRecorderState, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import { File } from 'expo-file-system';
import { useTheme } from '../lib/theme';
import { silenceVoices } from '../lib/audio-focus';
import { durationLabel, errorText } from '../lib/chat-model';
import { VoiceDraft } from '../lib/types';
import { IconButton } from './UI';
import { VoicePlayer } from './VoicePlayer';
export function deleteVoice(uri:string){try{const file=new File(uri);if(file.exists)file.delete();}catch{}}
export function Composer({disabled,enterToSend,maxChars,onText,onVoice,onActivity,onDraft}:{disabled:boolean;enterToSend:boolean;maxChars:number;onText:(text:string)=>void;onVoice:(draft:VoiceDraft)=>void;onActivity:(active:boolean)=>void;onDraft:(active:boolean)=>void}) {
 const c=useTheme(),recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,numberOfChannels:1,bitRate:96000,isMeteringEnabled:true});
 const rs=useAudioRecorderState(recorder,120);const [text,setText]=useState(''),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[draft,setDraft]=useState<VoiceDraft|null>(null);
 const recordingRef=useRef(false),busyRef=useRef(false),draftRef=useRef<VoiceDraft|null>(null),mounted=useRef(true);
 const stopRef=useRef<(discard?:boolean)=>Promise<void>>(async()=>{});
 useEffect(()=>{draftRef.current=draft;},[draft]);
 useEffect(()=>{onActivity(recording||busy);},[recording,busy,onActivity]);
 useEffect(()=>{onDraft(!!draft||text.length>0);},[draft,text,onDraft]);
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>{if(s!=='active'&&recordingRef.current)void stopRef.current(false);});return()=>sub.remove();},[]);
 useEffect(()=>{if(recording&&rs.durationMillis>=300000)void stopRef.current(false);},[recording,rs.durationMillis]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(recordingRef.current)void recorder.stop().catch(()=>{});if(draftRef.current)deleteVoice(draftRef.current.uri);void setAudioModeAsync({allowsRecording:false}).catch(()=>{});};},[recorder]);
 async function start(){
  if(disabled||busyRef.current||recordingRef.current||draft)return;busyRef.current=true;setBusy(true);
  try{Keyboard.dismiss();await silenceVoices();const permission=await AudioModule.requestRecordingPermissionsAsync();if(!permission.granted)throw new Error('Permita o microfone nas configurações do celular para gravar áudio.');
   await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldPlayInBackground:false});await recorder.prepareToRecordAsync();
   if(!mounted.current||AppState.currentState!=='active'){await setAudioModeAsync({allowsRecording:false});return;}
   recorder.record();recordingRef.current=true;setRecording(true);
  }catch(e){if(mounted.current)Alert.alert('Microfone',errorText(e));}finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 async function stop(discard=false){
  if(!recordingRef.current||busyRef.current)return;busyRef.current=true;setBusy(true);const duration=recorder.getStatus().durationMillis;
  try{await recorder.stop();recordingRef.current=false;if(mounted.current)setRecording(false);await setAudioModeAsync({allowsRecording:false});
   const uri=recorder.uri;if(!uri)throw new Error('O áudio não foi salvo. Grave novamente.');
   if(discard||!mounted.current||duration<350){deleteVoice(uri);return;}
   const next={uri,duration:Math.min(300000,Math.max(1,Math.round(duration)))};draftRef.current=next;setDraft(next);
  }catch(e){recordingRef.current=false;if(mounted.current){setRecording(false);Alert.alert('Gravação',errorText(e));}}
  finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 stopRef.current=stop;
 function discard(){if(draft)deleteVoice(draft.uri);draftRef.current=null;setDraft(null);}
 function sendText(){if(disabled||!text.trim()||recording||busy)return;const content=text.trim();setText('');onText(content);}
 function sendVoice(){if(!draft||disabled||busy)return;const sent=draft;draftRef.current=null;setDraft(null);void silenceVoices();onVoice(sent);}
 return <View style={{padding:12,paddingTop:10,borderTopWidth:1,borderColor:c.line,backgroundColor:c.surface,gap:6}}>
 {draft?<View style={{flexDirection:'row',alignItems:'center',gap:4}}><IconButton name="trash" label="Descartar áudio" onPress={discard}/><View style={{flex:1}}><VoicePlayer source={{uri:draft.uri}} duration={draft.duration}/></View><IconButton name="send" label="Enviar mensagem de voz" filled disabled={disabled} onPress={sendVoice}/></View>:
 recording?<View style={{flexDirection:'row',alignItems:'center',gap:10,minHeight:52}}><IconButton name="trash" label="Cancelar gravação" onPress={()=>void stop(true)}/><View style={{width:8,height:8,borderRadius:4,backgroundColor:c.danger}}/><View style={{flex:1,gap:5}}><Text style={{color:c.text,fontWeight:'600'}}>Gravando · {durationLabel(rs.durationMillis)}</Text><View style={{height:3,width:'90%',backgroundColor:c.line}}><View style={{height:3,width:`${Math.max(5,Math.min(100,((rs.metering??-60)+60)/60*100))}%`,backgroundColor:c.accent}}/></View></View><IconButton name="stop" label="Parar e ouvir antes de enviar" filled onPress={()=>void stop(false)} disabled={busy}/></View>:
 <View style={{flexDirection:'row',alignItems:'flex-end',gap:9}}><View style={{flex:1,borderRadius:24,paddingHorizontal:17,paddingVertical:13,backgroundColor:c.input,minHeight:48,justifyContent:'center'}}><TextInput accessibilityLabel="Mensagem para a Sofia" value={text} onChangeText={setText} editable={!disabled&&!busy} placeholder="Mensagem para a Sofia…" placeholderTextColor={c.muted} multiline maxLength={maxChars} style={{color:c.text,fontSize:16,lineHeight:22,maxHeight:130,paddingVertical:0}} submitBehavior={enterToSend?'submit':'newline'} onSubmitEditing={enterToSend?sendText:undefined}/></View>{busy?<View style={{width:48,height:48,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:<IconButton name={text.trim()?'send':'mic'} label={text.trim()?'Enviar mensagem':'Gravar mensagem de voz'} filled size={48} disabled={disabled} onPress={text.trim()?sendText:()=>void start()}/>}</View>}
 {recording||draft?<Text style={{fontSize:11,textAlign:'center',color:c.muted}}>{recording?'Até 5 minutos · pare para ouvir antes de enviar':'Ouça, descarte ou envie o seu áudio'}</Text>:null}</View>;
}
