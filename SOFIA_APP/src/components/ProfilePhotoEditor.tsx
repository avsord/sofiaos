import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Image,Pressable,View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Brand} from './UI';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {readProfilePhoto,removeProfilePhoto,saveProfilePhoto} from '../lib/profile-photo';

export function ProfilePhotoEditor({scope,name}:{scope:string;name:string}){
 const c=useTheme(),[uri,setUri]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;void readProfilePhoto(scope).then(value=>{if(alive)setUri(value);});return()=>{alive=false;};},[scope]);
 async function pick(camera=false){
  if(busy)return;setBusy(true);
  try{
   if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Permita o uso da câmera para tirar a foto do perfil.');}
   const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.8}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.8});
   if(result.canceled||!result.assets[0])return;
   const saved=await saveProfilePhoto(scope,result.assets[0].uri,result.assets[0].mimeType);setUri(saved);
  }catch(e){Alert.alert('Foto do perfil',errorText(e));}finally{setBusy(false);}
 }
 function menu(){Alert.alert('Foto do perfil','Escolha como deseja alterar a foto.',[
  {text:'Escolher da galeria',onPress:()=>void pick(false)},
  {text:'Tirar foto',onPress:()=>void pick(true)},
  ...(uri?[{text:'Remover foto',style:'destructive' as const,onPress:()=>{setBusy(true);void removeProfilePhoto(scope).then(()=>setUri('')).catch(e=>Alert.alert('Foto do perfil',errorText(e))).finally(()=>setBusy(false));}}]:[]),
  {text:'Cancelar',style:'cancel'}
 ]);}
 return <Pressable accessibilityRole="button" accessibilityLabel="Alterar foto do perfil" accessibilityHint="Escolha uma foto, ajuste o enquadramento e salve" onPress={menu} disabled={busy} style={{width:82,height:82,borderRadius:41,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:c.input,borderWidth:2,borderColor:c.line}}>
  {uri?<Image source={{uri}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>:<Brand size={72} label={name}/>} 
  {busy?<View style={{position:'absolute',inset:0,backgroundColor:'#00000055',alignItems:'center',justifyContent:'center'}}><ActivityIndicator color="#fff"/></View>:null}
 </Pressable>;
}
