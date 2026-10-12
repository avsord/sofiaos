import {registerRootComponent} from 'expo';
import {AUTH_STORAGE_KEY,PREFS_STORAGE_KEY,primeStartupReads} from './src/lib/startup-read-ahead';
// Start native I/O before evaluating App, its screens and providers. Do not await
// here: React and disk work can proceed together under the original native S.
primeStartupReads(
 ()=>require('expo-secure-store').getItemAsync(AUTH_STORAGE_KEY),
 ()=>require('@react-native-async-storage/async-storage').default.getItem(PREFS_STORAGE_KEY)
);
// Warm only the existing Keystore handle on the native I/O worker. No secrets
// are exported, and a missing/corrupt key still follows normal cache recovery.
try{require('react-native').NativeModules.SofiaSnapshot?.prepareLaunch?.();}catch{}
// Se o carregamento de ./App falhar (erro de JavaScript ao montar as telas),
// mostra o erro de verdade em vez de deixar o nativo cair no aviso genérico
// de 15 segundos sem pista nenhuma do que houve.
try{
 const entry=require('./App');
 entry.prepareStartup?.();
 registerRootComponent(entry.default);
 // Avisos com o app fechado: a tarefa precisa estar declarada no carregamento.
 try{require('./src/lib/background-notify');}catch{}
}catch(startupError){
 const React=require('react'),{View,Text,ScrollView}=require('react-native');
 const message=startupError instanceof Error?(startupError.stack||startupError.message):String(startupError);
 console.error('SOFIA_STARTUP_FATAL',message);
 registerRootComponent(()=>React.createElement(View,{nativeID:'sofia-login-ready',style:{flex:1,backgroundColor:'#F7F6FA',paddingTop:60,paddingHorizontal:20}},
  React.createElement(Text,{style:{fontSize:18,fontWeight:'600',color:'#272334',marginBottom:12}},'Não foi possível abrir a Sofia'),
  React.createElement(ScrollView,null,React.createElement(Text,{selectable:true,style:{fontSize:12,color:'#5a5568'}},message))));
}
