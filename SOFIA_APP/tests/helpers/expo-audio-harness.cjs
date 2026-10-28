// Faithful harness for expo-audio under React 19.2 Activity.
// The lifecycle hooks are the REAL ones from the installed packages (transpiled),
// not reimplementations: useReleasingSharedObject (expo-modules-core) and useEvent (expo).
// Only the native player is fake, and it fails the way the device log shows:
// "Cannot use shared object that was already released".
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const React=require('react');
const root=path.join(__dirname,'..','..');
const nm=p=>path.join(root,'node_modules',p);
function transpile(file,deps){
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:n=>{if(/(^|\/)palette$/.test(n))return {PALETTE:new Proxy({},{get:()=>'#FFFFFF'})};if(!(n in deps))throw Error('Unexpected '+n+' in '+path.basename(file));return deps[n];},console,Promise,Map,Set,Object,Error},{filename:file});return exports;
}
const lifecycle=transpile(nm('expo-modules-core/src/hooks/useReleasingSharedObjectWithLifecycle.ts'),{react:React});
const releasing=transpile(nm('expo-modules-core/src/hooks/useReleasingSharedObject.ts'),{react:React,'./useReleasingSharedObjectWithLifecycle':lifecycle});
const events=transpile(nm('expo/src/hooks/useEvent.ts'),{react:React});

/** strict: every call on a released player throws, including listener add/remove.
 *  native: only calls that pass the object to native code throw (pause/play/replace/seekTo/currentStatus). */
function makeNative(profile='strict'){
 let counter=0;const players=[];
 class FakePlayer{
  constructor(){this.id=++counter;this.released=false;this._status={isLoaded:false,playing:false,currentTime:0,duration:0,didJustFinish:false};this.listeners=new Set();this.log=[];players.push(this);}
  _use(op,nativeOnly){if(this.released&&(profile==='strict'||nativeOnly)){const e=new Error('The 1st argument cannot be cast to type class expo.modules.audio.AudioPlayer (received class java.lang.Integer)\n→ Caused by: Cannot use shared object that was already released');e.code='ERR_RELEASED';throw e;}this.log.push(op);}
  get currentStatus(){this._use('currentStatus',true);return this._status;}
  addListener(name,cb){this._use('addListener',false);const l={name,cb};this.listeners.add(l);return {remove:()=>{this._use('remove',false);this.listeners.delete(l);}};}
  pause(){this._use('pause',true);this._status={...this._status,playing:false};this._emit();}
  play(){this._use('play',true);this._status={...this._status,playing:true};this._emit();}
  replace(){this._use('replace',true);}
  seekTo(){this._use('seekTo',true);return Promise.resolve();}
  release(){this.released=true;}
  _emit(){for(const l of [...this.listeners])l.cb(this._status);}
  load(extra={}){this._status={...this._status,isLoaded:true,duration:5,...extra};this._emit();}
 }
 return {FakePlayer,players};
}
/** useAudioPlayer / useAudioPlayerStatus exactly as in expo-audio/build/ExpoAudio.js (57.0.5). */
function expoAudio(profile){
 const {FakePlayer,players}=makeNative(profile);
 const {useMemo}=React;
 const resolveSource=s=>s;
 function useAudioPlayer(source=null,options={}){
  const {updateInterval=500,keepAudioSessionActive=false,preferredForwardBufferDuration=0}=options;
  const initialSource=useMemo(()=>resolveSource(source),[JSON.stringify(source)]);
  return releasing.useReleasingSharedObject(()=>new FakePlayer(initialSource,updateInterval,keepAudioSessionActive,preferredForwardBufferDuration),[JSON.stringify(initialSource),updateInterval,keepAudioSessionActive,preferredForwardBufferDuration]);
 }
 function useAudioPlayerStatus(player){const currentStatus=useMemo(()=>player.currentStatus,[player.id]);return events.useEvent(player,'playbackStatusUpdate',currentStatus);}
 function createAudioPlayer(source=null){return new FakePlayer(source);}
 return {useAudioPlayer,useAudioPlayerStatus,createAudioPlayer,setAudioModeAsync:async()=>{},players};
}
module.exports={expoAudio,makeNative};
