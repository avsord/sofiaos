import AsyncStorage from '@react-native-async-storage/async-storage';
import {File,Paths} from 'expo-file-system';

const KEY='sofia.native.profile-photo.v1:';
const EXTENSIONS=['jpg','png','webp'] as const;
const hashScope=(scope:string)=>{let h=2166136261;for(const c of scope.trim().toLowerCase())h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(36);};
const storageKey=(scope:string)=>KEY+hashScope(scope);
const extension=(mime?:string|null)=>mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
const target=(scope:string,ext:string)=>new File(Paths.document,'sofia-profile-'+hashScope(scope)+'.'+ext);
let serial=0;
const valid=(uri:string)=>{try{const file=new File(uri);return file.exists&&file.size>0;}catch{return false;}};
const owned=(scope:string,uri:string)=>uri.startsWith(Paths.document.uri+'sofia-profile-'+hashScope(scope))&&!uri.slice(Paths.document.uri.length).includes('/');
async function erase(scope:string,uri:string){if(!owned(scope,uri))return;try{const f=new File(uri);if(f.exists)await f.delete();}catch{/* An unused photo is safer than losing the active one. */}}
export async function readProfilePhoto(scope:string){
 try{
  const uri=await AsyncStorage.getItem(storageKey(scope));if(uri&&valid(uri))return uri;
  // 0.3.53 could finish its asynchronous copy after reporting failure. Recover
  // that existing file instead of discarding the only reference to the photo.
  for(const ext of EXTENSIONS){const file=target(scope,ext);if(valid(file.uri)){await AsyncStorage.setItem(storageKey(scope),file.uri);return file.uri;}}
 }catch{/* A temporary storage failure must not erase the saved pointer. */}
 return '';
}
export async function saveProfilePhoto(scope:string,sourceUri:string,mime?:string|null){
 const source=new File(sourceUri);if(!valid(sourceUri))throw new Error('A foto escolhida não está mais disponível.');
 const previous=await AsyncStorage.getItem(storageKey(scope));
 const destination=new File(Paths.document,'sofia-profile-'+hashScope(scope)+'-'+Date.now().toString(36)+'-'+(++serial)+'.'+extension(mime));
 try{
  // SDK 57 copies asynchronously. Await before verifying; never overwrite the
  // source/current photo, and only commit the pointer after a complete copy.
  await source.copy(destination);
  if(!valid(destination.uri))throw new Error('Não foi possível guardar a foto do perfil.');
  await AsyncStorage.setItem(storageKey(scope),destination.uri);
 }catch(error){await erase(scope,destination.uri);throw error;}
 if(previous&&previous!==destination.uri)await erase(scope,previous);
 return destination.uri;
}
export async function removeProfilePhoto(scope:string){
 const previous=await AsyncStorage.getItem(storageKey(scope));
 // Keep the pointer when its explicit removal fails, so the action can retry.
 await AsyncStorage.removeItem(storageKey(scope));
 if(previous)await erase(scope,previous);
 for(const ext of EXTENSIONS)await erase(scope,target(scope,ext).uri);
}
