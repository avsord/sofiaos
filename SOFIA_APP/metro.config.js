const {getDefaultConfig}=require('expo/metro-config');
const config=getDefaultConfig(__dirname);
const previous=config.transformer.getTransformOptions;
config.transformer.getTransformOptions=async(...args)=>{
 const options=previous?await previous(...args):{};
 return {...options,transform:{...options.transform,inlineRequires:true}};
};
module.exports=config;
