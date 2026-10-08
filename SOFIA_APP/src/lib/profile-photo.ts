import AsyncStorage from '@react-native-async-storage/async-storage';
import {File,Paths} from 'expo-file-system';

const KEY='sofia.native.profile-photo.v1:';
const EXTENSIONS=['jpg','png','webp'] as const;
const hashScope=(scope:string)=>{let h=2166136261;for(const c of scope.trim().toLowerCase())h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(36);};
const storageKey=(scope:string)=>KEY+hashScope(scope);
const extension=(mime?:string|null)=>mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
const target=(scope:string,ext:string)=>new File(Paths.document,'sofia-profile-'+hashScope(scope)+'.'+ext);

export async function readProfilePhoto(scope:string){
 try{const uri=await AsyncStorage.getItem(storageKey(scope));if(!uri)return '';const file=new File(uri);if(file.exists&&file.size>0)return uri;await AsyncStorage.removeItem(storageKey(scope));}catch{}return '';
}
export async function saveProfilePhoto(scope:string,sourceUri:string,mime?:string|null){
 const source=new File(sourceUri);if(!source.exists||source.size<1)throw new Error('A foto escolhida não está mais disponível.');
 const ext=extension(mime),destination=target(scope,ext);
 for(const known of EXTENSIONS){const old=target(scope,known);if(old.exists)try{old.delete();}catch{}}
 source.copy(destination);if(!destination.exists||destination.size<1)throw new Error('Não foi possível guardar a foto do perfil.');
 await AsyncStorage.setItem(storageKey(scope),destination.uri);return destination.uri;
}
export async function removeProfilePhoto(scope:string){
 for(const ext of EXTENSIONS){const file=target(scope,ext);if(file.exists)try{file.delete();}catch{}}
 await AsyncStorage.removeItem(storageKey(scope));
}
