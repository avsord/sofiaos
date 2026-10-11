import React, { useEffect, useRef, useState, useId } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { durationLabel } from '../lib/chat-model';
import { registerVoice, silenceVoices } from '../lib/audio-focus';
import { useTheme } from '../lib/theme';
import { IconButton } from './UI';

/** Activity-safe and lazy.
 * The old version used useAudioPlayer + useAudioPlayerStatus. Those hooks release the
 * native player in an effect cleanup that React also runs when a tab is HIDDEN, and the
 * listener removal that follows touched a released object: "Cannot use shared object that
 * was already released" (seen in the device log, thrown from VoicePlayer inside Activity).
 * They also built one native player per voice bubble when the Chat tab mounted.
 * Here the native player exists only after the first tap, is created and torn down by ONE
 * effect lifecycle of our own, and every native call is guarded. Hiding the tab just stops
 * playback; showing it again starts from a clean idle state. */
type Status={isLoaded:boolean;playing:boolean;didJustFinish:boolean;currentTime:number;duration:number;error?:string};
const IDLE:Status={isLoaded:false,playing:false,didJustFinish:false,currentTime:0,duration:0};
type Native={pause():void;play():void;replace(source:unknown):void;seekTo(seconds:number):Promise<void>;release():void;addListener(name:string,listener:(status:Status)=>void):{remove():void}};
function safe<T>(run:()=>T):T|undefined{try{return run();}catch{return undefined;}}
export function VoicePlayer({source,duration}:{source:{uri:string;headers?:Record<string,string>};duration:number}) {
 const c=useTheme(),id=useId(),playerRef=useRef<Native|null>(null),subscriptionRef=useRef<{remove():void}|null>(null);
 const [status,setStatus]=useState<Status>(IDLE),[loading,setLoading]=useState(false),[error,setError]=useState('');const autoplay=useRef(false);
 const audioError=status.error;
 function dispose(){
  const player=playerRef.current,subscription=subscriptionRef.current;playerRef.current=null;subscriptionRef.current=null;autoplay.current=false;
  safe(()=>subscription?.remove());safe(()=>player?.pause());safe(()=>player?.release());
 }
 function ensurePlayer():Native{
  if(playerRef.current)return playerRef.current;
  const player=createAudioPlayer(null,{updateInterval:250}) as unknown as Native;
  playerRef.current=player;
  subscriptionRef.current=player.addListener('playbackStatusUpdate',next=>{if(playerRef.current===player)setStatus(next);});
  return player;
 }
 // Runs again after a tab is hidden and shown: start idle, never reuse a player that was disposed.
 useEffect(()=>{setStatus(IDLE);setLoading(false);return dispose;},[]);
 useEffect(()=>registerVoice(id,()=>{autoplay.current=false;safe(()=>playerRef.current?.pause());}),[id]);
 useEffect(()=>{if(status.isLoaded&&autoplay.current){autoplay.current=false;setLoading(false);safe(()=>playerRef.current?.play());}},[status.isLoaded]);
 useEffect(()=>{if(!loading)return;const t=setTimeout(()=>{autoplay.current=false;setLoading(false);setError('Não foi possível carregar o áudio. Toque para tentar de novo.');},15000);return()=>clearTimeout(t);},[loading]);
 useEffect(()=>{if(audioError){autoplay.current=false;setLoading(false);setError('Não foi possível reproduzir este áudio.');}},[audioError]);
 async function play(){
  try {setError('');await silenceVoices(id);await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true,shouldPlayInBackground:false});
   const player=ensurePlayer();
   if(status.playing){player.pause();return;}
   if(!status.isLoaded||error){autoplay.current=true;setLoading(true);player.replace(source);return;}
   if(status.didJustFinish||status.currentTime>=status.duration-.1)await player.seekTo(0);
   player.play();
  }catch{setLoading(false);setError('O áudio não está disponível agora.');}
 }
 const length=status.duration||duration/1000,progress=length?Math.min(1,status.currentTime/length):0;
 return <View style={{minWidth:155,gap:5}}><View style={{flexDirection:'row',alignItems:'center',gap:6}}>{loading?<View style={{width:44,height:44,justifyContent:'center'}}><ActivityIndicator color={c.accent}/></View>:<IconButton name={status.playing?'pause':'play'} label={status.playing?'Pausar mensagem de voz':'Reproduzir mensagem de voz'} onPress={()=>void play()}/>}<View style={{flex:1,gap:8}}><View style={{height:4,borderRadius:3,backgroundColor:c.line,overflow:'hidden'}}><View style={{height:4,width:`${progress*100}%`,backgroundColor:c.accent}}/></View><Text style={{color:c.muted,fontSize:11}}>{durationLabel(status.currentTime*1000)} / {durationLabel(length*1000)}</Text></View></View>{error?<Text style={{color:c.danger,fontSize:11,lineHeight:16}}>{error}</Text>:null}</View>;
}
