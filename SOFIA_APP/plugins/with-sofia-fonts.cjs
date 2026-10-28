// 0.3.259: copia a fonte da Sofia (assets/fonts/SofiaSans-*.ttf) para android/app/src/main/assets/fonts,
// onde o React Native acha cada arquivo pelo nome (fontFamily: 'SofiaSans-Bold'). Sem dependencia nova.
const {withDangerousMod}=require('expo/config-plugins');
const fs=require('fs'),path=require('path');
module.exports=function withSofiaFonts(config){
  return withDangerousMod(config,['android',async cfg=>{
    const from=path.join(cfg.modRequest.projectRoot,'assets','fonts');
    const to=path.join(cfg.modRequest.platformProjectRoot,'app','src','main','assets','fonts');
    fs.mkdirSync(to,{recursive:true});
    for(const f of fs.readdirSync(from).filter(n=>/^SofiaSans-.*\.ttf$/.test(n)))fs.copyFileSync(path.join(from,f),path.join(to,f));
    return cfg;
  }]);
};
