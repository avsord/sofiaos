const path=require('path');
const {getDefaultConfig}=require('expo/metro-config');
const config=getDefaultConfig(__dirname);
config.transformer.getTransformOptions=async()=>({transform:{experimentalImportSupport:false,inlineRequires:true}});
// Web: modulos que so existem no celular ganham substitutos de navegador (as telas nao mudam).
const WEB_SHIMS={
 'expo-notifications':'expo-notifications.ts',
 'expo-secure-store':'expo-secure-store.ts',
 'react-native-webview':'react-native-webview.tsx',
 'expo-task-manager':'expo-task-manager.ts',
 'expo-background-task':'expo-background-task.ts',
};
const original=config.resolver.resolveRequest;
config.resolver.resolveRequest=(context,moduleName,platform)=>{
 if(platform==='web'&&WEB_SHIMS[moduleName])return {type:'sourceFile',filePath:path.join(__dirname,'src/web/shims',WEB_SHIMS[moduleName])};
 return original?original(context,moduleName,platform):context.resolveRequest(context,moduleName,platform);
};
module.exports=config;
