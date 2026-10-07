import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,Modal,ScrollView,TextInput,Image,StyleSheet,ActivityIndicator} from 'react-native';
import Svg,{Defs,LinearGradient,Stop,Rect} from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {Button,ErrorBanner,IconButton} from './UI';
import {Icon} from './Icon';
export const PAGE_COVERS=[
 ['Lavanda','linear-gradient(135deg,#d9d2ff,#b8aaff)'],['Areia','linear-gradient(135deg,#efe9df,#d8cfc2)'],
 ['Azul','linear-gradient(135deg,#b9d7ff,#7da8ea)'],['Verde','linear-gradient(135deg,#cde8d8,#8fc9aa)'],
 ['Pêssego','linear-gradient(135deg,#f4d5c3,#e7ad8b)'],['Grafite','linear-gradient(135deg,#6d6c69,#3f3f3c)'],
 ['Aurora','linear-gradient(135deg,#cebaf7 0%,#9ed5e8 48%,#f1c5d9 100%)'],['Noite','linear-gradient(135deg,#1f2a44,#394c77)']
];
const EMOJIS='😀 😊 😎 🤔 🤖 ❤️ 💜 💙 💚 💡 🔥 ✨ ⭐ 🌙 🌈 🌱 🌿 🌊 🧪 🧠 🎯 🧭 🚀 🚲 🏠 💼 🛠️ ⚙️ 💻 📱 📷 🎥 🎬 🎨 ✏️ 📝 📌 📅 ⏰ 📚 📖 📁 📂 📦 📊 💰 🛒 🎁 💊 ☕ 🎵 🎧 🎮 🏋️ 🧘 🏆 🎓 🔗 🔎 🔐 ✅ ⚠️ 💬 🧩 💎'.split(' ');
const SYMBOLS='♡ ♥ ☆ ★ ○ ● ◉ ◇ ◆ □ ■ △ ▲ ✓ ✔ ✕ × + − ≡ ∞ ⌂ ⌘ ⏱ ⚑ ⚙ ⚡ ☀ ☾ ☁ ☰ ▦ ⊞ ⊕ ↖ ↑ ↗ ← → ↙ ↓ ↘ ↔ ↕ ↳ ↪ ⇄ ✎ ✦ ✧ ❖ ☑ ☐ ♫ ♪ ✉ ☎ ⌚ ⚖ ◐ ◑'.split(' ');
const PENDING_COVER_KEY='sofia.native.pending-page-cover.v1';
export function PageCover({data,api}:{data:Record<string,any>;api:SofiaApi}){
 const c=useTheme(),[failed,setFailed]=useState(false);const attachment=String(data.cover_attachment_id||'');
 useEffect(()=>setFailed(false),[attachment]);
 if(data.cover_type==='attachment'&&attachment)return failed?<View style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',backgroundColor:c.input}]}><Icon name="image" color={c.muted}/></View>:<Image source={api.attachmentSource(attachment)} resizeMode="cover" style={StyleSheet.absoluteFill} onError={()=>setFailed(true)}/>;
 const colors=String(data.cover_value||'').match(/#[0-9a-fA-F]{6}\b/g)||[c.accentSoft,c.accentSoft];
 return <Svg width="100%" height="100%"><Defs><LinearGradient id="cover" x1="0" y1="0" x2="1" y2="1">{colors.map((color,i)=><Stop key={i} offset={colors.length===1?0:i/(colors.length-1)} stopColor={color}/>)}</LinearGradient></Defs><Rect width="100%" height="100%" fill="url(#cover)"/></Svg>;
}
export function PageAppearance({kind,pageId,api,onApply,onClose}:{kind:'icon'|'cover';pageId:string;api:SofiaApi;onApply:(patch:Record<string,any>)=>void;onClose:()=>void}){
 const c=useTheme(),[mode,setMode]=useState<'emoji'|'icon'>('emoji'),[custom,setCustom]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),alive=useRef(true),recovering=useRef(false);
 function choose(patch:Record<string,any>){onApply(patch);onClose();}
 async function clearPending(){try{await AsyncStorage.removeItem(PENDING_COVER_KEY);}catch{}}
 async function finishPick(result:any){
  if(!result)return false;
  if(result.code)throw new Error(String(result.message||'O Android não conseguiu devolver a foto selecionada.'));
  if(result.canceled){await clearPending();return false;}
  const asset=result.assets?.[0],base64=asset?.base64;
  if(!base64)throw new Error('Não foi possível preparar a imagem. Escolha outra foto.');
  if(base64.length>Math.ceil(10*1024*1024/3)*4)throw new Error('A capa deve ter até 10 MB. Recorte a imagem ou escolha uma menor.');
  const attachment=await api.uploadAttachment(pageId,{name:'capa.jpg',mime:'image/jpeg',base64});
  await clearPending();
  if(alive.current)choose({cover_type:'attachment',cover_value:'',cover_attachment_id:attachment.id});
  return true;
 }
 useEffect(()=>{
  alive.current=true;
  if(kind==='cover'&&!recovering.current){recovering.current=true;void(async()=>{try{
    const pendingPage=await AsyncStorage.getItem(PENDING_COVER_KEY);
    if(pendingPage!==pageId||!alive.current)return;
    const pending=await ImagePicker.getPendingResultAsync();
    if(pending&&alive.current){setBusy(true);setError('');await finishPick(pending);}
   }catch(e){await clearPending();if(alive.current)setError(e instanceof Error?e.message:'Não foi possível recuperar a capa escolhida.');}
   finally{recovering.current=false;if(alive.current)setBusy(false);}})();}
  return()=>{alive.current=false;};
 },[]);
 async function upload(){if(busy)return;setBusy(true);setError('');try{
  await AsyncStorage.setItem(PENDING_COVER_KEY,pageId);
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[3,1],quality:0.72,base64:true});
  if(!alive.current)return;
  await finishPick(result);
 }catch(e){await clearPending();if(alive.current)setError(e instanceof Error?e.message:'Não foi possível trocar a capa.');}finally{if(alive.current)setBusy(false);}}
 return <Modal visible transparent animationType="fade" onRequestClose={()=>{if(!busy)onClose();}}>
  <Pressable onPress={()=>{if(!busy)onClose();}} style={{flex:1,backgroundColor:'#00000055',justifyContent:'flex-end'}}>
   <Pressable onPress={()=>{}} style={{maxHeight:'82%',borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:c.surface,padding:20,paddingBottom:30}}>
    <View style={{flexDirection:'row',alignItems:'center',marginBottom:14}}><Text style={{flex:1,fontSize:22,fontWeight:'700',color:c.text}}>{kind==='icon'?'Ícone da página':'Capa da página'}</Text><IconButton name="close" label="Fechar" disabled={busy} onPress={onClose}/></View>
    {error?<ErrorBanner text={error}/>:null}
    {kind==='icon'?<>
     <View style={{flexDirection:'row',gap:8,marginBottom:14}}>{(['emoji','icon'] as const).map(value=><Pressable key={value} onPress={()=>setMode(value)} style={{paddingVertical:10,paddingHorizontal:18,borderRadius:12,backgroundColor:mode===value?c.accentSoft:c.input}}><Text style={{color:mode===value?c.accent:c.muted}}>{value==='emoji'?'Emojis':'Símbolos'}</Text></Pressable>)}</View>
     <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:270}}><View style={{flexDirection:'row',flexWrap:'wrap'}}>{(mode==='emoji'?EMOJIS:SYMBOLS).map(icon=><Pressable key={icon} accessibilityLabel={'Usar '+icon} onPress={()=>choose({icon,icon_mode:mode})} style={{width:'14.28%',height:48,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:27,color:c.text}}>{icon}</Text></Pressable>)}</View></ScrollView>
     <View style={{flexDirection:'row',gap:8,alignItems:'center',marginVertical:14}}><TextInput value={custom} onChangeText={setCustom} maxLength={32} placeholder="Outro emoji ou símbolo" placeholderTextColor={c.muted} accessibilityLabel="Emoji personalizado" style={{flex:1,minHeight:46,borderRadius:12,backgroundColor:c.input,color:c.text,paddingHorizontal:12}}/><IconButton name="check" label="Aplicar ícone" filled disabled={!custom.trim()} onPress={()=>choose({icon:custom.trim(),icon_mode:mode})}/></View>
     <Button title="Usar ícone padrão" secondary onPress={()=>choose({icon:'',icon_mode:'default'})}/>
    </>:<>
     <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:18}}>{PAGE_COVERS.map(([name,value])=><Pressable key={name} disabled={busy} accessibilityLabel={'Capa '+name} onPress={()=>choose({cover_type:'preset',cover_value:value,cover_attachment_id:''})} style={{width:'47%',height:65,borderRadius:12,overflow:'hidden'}}><PageCover api={api} data={{cover_type:'preset',cover_value:value}}/></Pressable>)}</View>
     {busy?<View style={{padding:18,alignItems:'center',gap:8}}><ActivityIndicator color={c.accent}/><Text style={{color:c.muted}}>Enviando capa…</Text></View>:<View style={{gap:10}}><Button title="Escolher foto do aparelho" onPress={()=>void upload()}/><Button title="Remover capa" secondary onPress={()=>choose({cover_type:'',cover_value:'',cover_attachment_id:''})}/></View>}
    </>}
   </Pressable>
  </Pressable>
 </Modal>;
}
