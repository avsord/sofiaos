import React, { useEffect, useRef, useState, useId } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { durationLabel } from '../lib/chat-model';
import { registerVoice, silenceVoices } from '../lib/audio-focus';
import { useTheme } from '../lib/theme';
import { IconButton } from './UI';
export function VoicePlayer({source,duration}:{source:{uri:string;headers?:Record<string,string>};duration:number}) {
 const c=useTheme(),id=useId(),player=useAudioPlayer(null,{updateInterval:250}),status=useAudioPlayerStatus(player);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');const autoplay=useRef(false);
 const audioError=(status as {error?:string}).error;
 useEffect(()=>registerVoice(id,()=>{autoplay.current=false;player.pause();}),[id,player]);
 useEffect(()=>{if(status.isLoaded&&autoplay.current){autoplay.current=false;setLoading(false);player.play();}},[status.isLoaded,player]);
 useEffect(()=>{if(!loading)return;const t=setTimeout(()=>{autoplay.current=false;setLoading(false);setError('Não foi possível carregar o áudio. Toque para tentar de novo.');},15000);return()=>clearTimeout(t);},[loading]);
 useEffect(()=>{if(audioError){autoplay.current=false;setLoading(false);setError('Não foi possível reproduzir este áudio.');}},[audioError]);
 async function play(){
  try {setError('');await silenceVoices(id);await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true,shouldPlayInBackground:false});
   if(status.playing){player.pause();return;}
   if(!status.isLoaded||error){autoplay.current=true;setLoading(true);player.replace(source);return;}
   if(status.didJustFinish||status.currentTime>=status.duration-.1)await player.seekTo(0);
   player.play();
  }catch{setLoading(false);setError('O áudio não está disponível agora.');}
 }
 const length=status.duration||duration/1000,progress=length?Math.min(1,status.currentTime/length):0;
 return <View style={{minWidth:155,gap:5}}><View style={{flexDirection:'row',alignItems:'center',gap:6}}>{loading?<View style={{width:44,height:44,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:<IconButton name={status.playing?'pause':'play'} label={status.playing?'Pausar mensagem de voz':'Reproduzir mensagem de voz'} onPress={()=>void play()}/>}<View style={{flex:1,gap:8}}><View style={{height:4,borderRadius:3,backgroundColor:c.line,overflow:'hidden'}}><View style={{height:4,width:`${progress*100}%`,backgroundColor:c.accent}}/></View><Text style={{color:c.muted,fontSize:11}}>{durationLabel(status.currentTime*1000)} / {durationLabel(length*1000)}</Text></View></View>{error?<Text style={{color:c.danger,fontSize:11,lineHeight:16}}>{error}</Text>:null}</View>;
}
