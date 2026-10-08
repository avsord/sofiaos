'use strict';
const {withMainActivity,withDangerousMod}=require('expo/config-plugins');
const fs=require('fs'),path=require('path');

module.exports=config=>{
  config=withMainActivity(config,c=>{
    if(c.modResults.language!=='kt')throw Error('Sofia launch handoff requires Kotlin');
    if(!c.modResults.contents.includes('SofiaLaunchOverlay.install(this)')){
      const candidates=['super.onCreate(null)','super.onCreate(savedInstanceState)'];
      const marker=candidates.find(value=>c.modResults.contents.includes(value));
      if(!marker)throw Error('MainActivity onCreate insertion point changed');
      c.modResults.contents=c.modResults.contents.replace(marker,'SofiaLaunchOverlay.start(this)\n    '+marker+'\n    SofiaLaunchOverlay.install(this)');
    }
    return c;
  });
  return withDangerousMod(config,['android',async c=>{
    const target=path.join(c.modRequest.platformProjectRoot,'app/src/main/java/com/avsord/sofiaapp/SofiaLaunchOverlay.kt');
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(path.join(__dirname,'native/SofiaLaunchOverlay.kt'),target);
    return c;
  }]);
};
