'use strict';
const {withMainApplication,withDangerousMod}=require('expo/config-plugins');
const fs=require('fs'),path=require('path');
module.exports=config=>{
 config=withMainApplication(config,c=>{
  if(c.modResults.language!=='kt')throw Error('Sofia alarms require Kotlin');
  const marker='PackageList(this).packages.apply {';
  if(!c.modResults.contents.includes('add(SofiaAlarmPackage())')){
   if(!c.modResults.contents.includes(marker))throw Error('MainApplication package insertion point changed');
   c.modResults.contents=c.modResults.contents.replace(marker,marker+'\n          add(SofiaAlarmPackage())');
  }
  // Queue Keystore preparation while Android initializes React/Hermes, not
  // after JS has loaded Expo, secure storage and the application modules.
  if(!c.modResults.contents.includes('SofiaSnapshotIO.prepareLaunch()')){
   const marker='super.onCreate()';
   if(!c.modResults.contents.includes(marker))throw Error('MainApplication onCreate insertion point changed');
   c.modResults.contents=c.modResults.contents.replace(marker,marker+'\n    SofiaSnapshotIO.prepareLaunch()');
  }
  return c;
 });
 return withDangerousMod(config,['android',async c=>{const target=path.join(c.modRequest.platformProjectRoot,'app/src/main/java/com/avsord/sofiaapp/SofiaAlarmPackage.kt');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(__dirname,'native/SofiaAlarmPackage.kt'),target);return c;}]);
};
