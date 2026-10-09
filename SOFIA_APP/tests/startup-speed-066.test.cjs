'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const load=require('./load-ts.cjs'),root=path.resolve(__dirname,'..');
const model=load('src/lib/tab-navigation.ts'),animated=require('./animated-stub.cjs')();
const {createMenuMotion}=load('src/lib/menu-motion.ts',{'react-native':{Animated:animated.Animated},'./tab-navigation':model});
function hooks(){
 const slots=[];let cursor=0,effects=[];
 const memo=(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||!deps||deps.some((x,n)=>x!==old.deps[n]))slots[i]={value:fn(),deps};return slots[i].value;};
 const React={__esModule:true,forwardRef:fn=>fn,Children:{map:(kids,fn)=>kids.map(fn)},useRef:value=>{const i=cursor++;return slots[i]||(slots[i]={current:value});},useState:value=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof value==='function'?value():value};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useLayoutEffect:(fn,deps)=>memo(()=>{effects.push(fn);},deps),useImperativeHandle:(ref,fn,deps)=>memo(()=>{effects.push(()=>{ref.current=fn();});},deps)};React.default=React;
 return {React,render:fn=>{cursor=0;const value=fn();const list=effects;effects=[];list.forEach(f=>f());return value;}};
}
function pager(metrics){
 const h=hooks(),commands=[],ref={current:null},native={scrollTo:command=>commands.push({...command})};
 const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 const {TabPager}=load('src/components/TabPager.tsx',{'react':h.React,'react/jsx-runtime':jsx,'react-native':{Platform:{OS:'android'},Animated:animated.Animated,View:'View',StyleSheet:{create:s=>s}},'react-native-safe-area-context':{initialWindowMetrics:metrics},'../lib/tab-navigation':model});
 let props={motion:createMenuMotion(),activeTab:'home',enabled:true,onSelect(){},children:model.TAB_ORDER.map(id=>({id}))},outer,scroll;
 function render(patch={}){props={...props,...patch};outer=h.render(()=>TabPager(props,ref)).props;scroll=outer.children?.props;if(scroll)scroll.ref.current=native;}
 render();return {commands,ref,render,get outer(){return outer;},get scroll(){return scroll;}};
}
const metrics=(width,left=0,right=0)=>({frame:{width},insets:{left,right}});
test('066 native frame mounts Home immediately but requires both real geometry callbacks',()=>{
 for(const reverse of [false,true]){
  const p=pager(metrics(400));assert.ok(p.scroll);assert.equal(p.scroll.children.length,6);assert.equal(p.scroll.contentOffset.x,0);assert.equal(p.scroll.scrollEnabled,false);assert.equal(p.scroll.style[1].opacity,0);
  const viewport=()=>p.scroll.onLayout({nativeEvent:{layout:{width:400}}}),content=()=>p.scroll.onContentSizeChange(2400,700);
  (reverse?content:viewport)();p.render();assert.equal(p.scroll.scrollEnabled,false);assert.equal(p.commands.length,0);
  (reverse?viewport:content)();p.render();assert.equal(p.scroll.scrollEnabled,true);assert.equal(p.scroll.style[1].opacity,1);assert.equal(p.commands.at(-1).x,0);
 }
});
test('066 stale frame recovers from actual layout without replaying Home over a new menu tap',()=>{
 const p=pager(metrics(400));p.ref.current.goTo('profile');p.render({activeTab:'profile'});
 p.outer.onLayout({nativeEvent:{layout:{width:360}}});p.render();
 p.scroll.onLayout({nativeEvent:{layout:{width:400}}});p.scroll.onContentSizeChange(2400,700);assert.equal(p.commands.length,0);
 p.scroll.onContentSizeChange(2160,700);p.scroll.onLayout({nativeEvent:{layout:{width:360}}});p.render();assert.equal(p.scroll.scrollEnabled,true);assert.equal(p.commands.at(-1).x,1800);
});
test('066 native frame respects side insets and the existing 760dp shell bound',()=>{
 assert.equal(pager(metrics(440,20,20)).scroll.snapToInterval,400);assert.equal(pager(metrics(1200)).scroll.snapToInterval,760);
});
test('066 absent or invalid metrics preserve measured fallback rather than zero-width Home',()=>{
 for(const m of [null,metrics(0),metrics(-1),metrics(NaN),metrics(Infinity)]){
  const p=pager(m);assert.equal(p.scroll,undefined);p.outer.onLayout({nativeEvent:{layout:{width:360}}});p.render();p.scroll.onLayout({nativeEvent:{layout:{width:360}}});p.scroll.onContentSizeChange(2160,700);p.render();assert.equal(p.scroll.scrollEnabled,true);
 }
});
test('066 hidden panels never schedule native zero-to-zero startup animations',()=>{
 const effects=[],requests=[],stops=[];class Value{stopAnimation(){stops.push(true);}setValue(){}}
 const {useMotionPresence}=load('src/lib/motion.ts',{'react':{useRef:v=>({current:v}),useState:v=>[v,()=>{}],useEffect:f=>effects.push(f)},'react-native':{AccessibilityInfo:{isReduceMotionEnabled:async()=>false,addEventListener:()=>({remove(){}})},Keyboard:{},Easing:{bezier:()=>null},Animated:{Value,timing:(_v,o)=>{requests.push(o);return {start(){},stop(){}};}}}});
 assert.equal(useMotionPresence(false).mounted,false);effects.splice(0).forEach(f=>f());assert.equal(requests.length,0);assert.equal(stops.length,0);
});
test('066 native startup queues key preparation once in Application before React startup',()=>{
 const code=fs.readFileSync(path.join(root,'plugins/with-sofia-alarms.cjs'),'utf8'),module={exports:{}};
 vm.runInNewContext(code,{module,require:name=>name==='expo/config-plugins'?{withMainApplication:(config,fn)=>fn(config),withDangerousMod:config=>config}:require(name),__dirname:path.join(root,'plugins')});
 const original='PackageList(this).packages.apply {\n}\noverride fun onCreate() {\n super.onCreate()\n loadReactNative(this)\n}';
 const apply=contents=>module.exports({modResults:{language:'kt',contents}}).modResults.contents;
 const once=apply(original);assert.equal(apply(once),once);assert.ok(once.indexOf('SofiaSnapshotIO.prepareLaunch()')<once.indexOf('loadReactNative(this)'));assert.equal((once.match(/SofiaSnapshotIO.prepareLaunch\(\)/g)||[]).length,1);
 assert.throws(()=>apply('PackageList(this).packages.apply {'),/onCreate insertion point/);
});
test('066 native prewarm keeps existing encrypted storage and a single serialized worker',()=>{
 const code=fs.readFileSync(path.join(root,'plugins/native/SofiaAlarmPackage.kt'),'utf8');
 assert.equal((code.match(/newSingleThreadExecutor/g)||[]).length,1);
 for(const marker of ['private val io = SofiaSnapshotIO.worker','@Synchronized fun prepareLaunch()','if (prepared) return','"sofia.cache.aes.v1"','app.noBackupFilesDir','cipher.updateAAD(scope.toByteArray(Charsets.UTF_8))','GCMParameterSpec(128','f.finishWrite(stream)'])assert.ok(code.includes(marker),marker);
 const prewarm=code.slice(code.indexOf('object SofiaSnapshotIO'),code.indexOf('  // Called only on worker.'));
 for(const forbidden of ['.get()', '.join()', 'runBlocking', 'Thread.sleep', 'delete(', 'promise.resolve'])assert.ok(!prewarm.includes(forbidden),forbidden);
});

test('067 cached Home and Agenda remain primary; catalog, widgets and monitors start only after reveal and idle',()=>{
 const home=fs.readFileSync(path.join(root,'src/screens/Home.tsx'),'utf8');
 assert.ok(home.includes('readHomeRows(api,'),'primary Home/Tasks loader must remain');
 assert.ok(home.includes('useAgendaMonth(api,calendarDate,active,launchVisible)'),'current Agenda month remains essential');
 assert.ok(home.includes("api.cached<HomeData>('/home')"),'retained Home projection must remain');
 assert.ok(home.includes("api.cached<{items:Task[]}>('/tasks')"),'retained Tasks must remain');
 const catalog=home.indexOf('void api.catalog().then(cat=>');
 const widgets=home.indexOf('void api.dashboardWidgets().then(r=>');
 const monitors=home.indexOf("api.entities('monitor'");
 assert.ok(catalog>=0&&widgets>=0&&monitors>=0);
 assert.ok(home.slice(catalog-100,catalog).includes('scheduleIdleTask('),'catalog startup deferred');
 assert.ok(home.slice(widgets-100,widgets).includes('scheduleIdleTask('),'widget refresh deferred');
 assert.ok(home.slice(monitors,monitors+1400).includes('scheduleIdleTask(()=>{void load();})'),'monitors startup deferred');
 assert.ok(home.includes('if(!active||!launchVisible||agendaCatalog)return'),'catalog waits for real Home');
 assert.ok(home.includes('if(!launchVisible||!active)return'),'widgets wait for real Home');
});


test('068 S animation never extends the existing native Home handoff',()=>{
 const logo=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 assert.ok(logo.includes('sofia_letter_motion.xml'));
 assert.ok(logo.includes('sofia_launch_mark_animated'));
 assert.ok(logo.includes('sofiaLetterMotion'));
 assert.ok(logo.includes('android:propertyName="rotation"'));
 assert.ok(logo.includes('android:propertyName="scaleX"'));
 assert.ok(logo.includes('android:propertyName="scaleY"'));
 assert.ok(logo.includes('android:duration="180"'));
 assert.ok(logo.includes('android:windowSplashScreenAnimationDuration'));
 const launch=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 assert.ok(!launch.includes('sofia_letter_reveal'),'Splash dismissal must not wait for animation');
});
test('068 photo preloads without blocking Home; menu prewarm yields to navigation',()=>{
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 const local=fs.readFileSync(path.join(root,'src/lib/local-launch.ts'),'utf8');
 const mounts=fs.readFileSync(path.join(root,'src/lib/startup-mounts.ts'),'utf8');
 assert.ok(local.includes("void photoReady;\n  await snapshot.hydrateLaunch()"));
 assert.ok(app.includes('useStartupMounts(visible&&!!auth,tab)'));
 assert.ok(mounts.includes('scheduleIdleTask('));
 assert.ok(fs.readFileSync(path.join(root,'src/components/ProfileAvatar.tsx'),'utf8').includes('primeProfilePhoto(scope,readProfilePhoto)'));
});
test('068 bell actions share one horizontal row and capsule reads remain server-backed',()=>{
 const bell=fs.readFileSync(path.join(root,'src/components/NotificationCenter.tsx'),'utf8');
 const code=bell.slice(bell.indexOf('    {n.items.length?<View style='),bell.indexOf('    <Button title="Ver todas as notificações"'));
 assert.ok(code.includes("flexDirection:'row'"));
 assert.ok(code.includes('Marcar tudo como lido')&&code.includes('Limpar todas'));
 const api=fs.readFileSync(path.join(root,'src/lib/api.ts'),'utf8');
 assert.ok(api.includes("'/md/capsules/doses"));
 const server=fs.readFileSync(path.join(root,'../src/channels/mobile.js'),'utf8');
 assert.ok(server.includes("p === '/api/mobile/md/capsules/doses'"));
 assert.ok(server.includes("mobile_capsule_doses"));
});

test('069 unread bell actions use identical neutral color, one no-wrap row',()=>{
 const bell=fs.readFileSync(path.join(root,'src/components/NotificationCenter.tsx'),'utf8');
 const section=bell.slice(bell.indexOf('    {n.items.length?<View style='),bell.indexOf('    <Button title="Ver todas as notificações"'));
 assert.ok(section.includes("flexDirection:'row'"));
 assert.ok(!section.includes("flexWrap:'wrap'"));
 const mark=section.slice(section.indexOf('Marcar todas as notificações como lidas'),section.indexOf('Limpar todas as notificações'));
 const clean=section.slice(section.indexOf('Limpar todas as notificações'));
 assert.ok(mark.includes('color:c.muted')&&clean.includes('color:c.muted'));
 assert.ok(mark.includes('numberOfLines={1}')&&clean.includes('numberOfLines={1}'));
});
test('069 startup restores photo and cached Home together; menus mount only when visited',()=>{
 const launch=fs.readFileSync(path.join(root,'src/lib/local-launch.ts'),'utf8');
 const mounts=fs.readFileSync(path.join(root,'src/lib/startup-mounts.ts'),'utf8');
 assert.ok(launch.includes('void photoReady;\n  await snapshot.hydrateLaunch()'));
 assert.ok(!launch.includes('fetch('),'No server calls in initial photo/Home restore');
 assert.ok(mounts.includes('scheduleIdleTask('),'Do not mount offscreen screen trees on idle');
 assert.ok(mounts.includes('setWarmed(previous=>previous.has(tab)'));
});

test('070 startup S moves as an actual vector group, never just an opacity fade',()=>{
 const code=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 assert.ok(code.includes('android:name="sofiaLetterMotion"'));
 assert.ok(code.includes('android:pivotX="48" android:pivotY="48"'));
 assert.ok(!code.includes('sofia_letter_reveal'));
 assert.ok(code.includes('@animator/sofia_letter_motion'));
 const bg=fs.readFileSync(path.join(root,'src/components/BackgroundServices.tsx'),'utf8');
 assert.ok(bg.includes('if(!enabled||!preloadWhenIdle'));
 assert.ok(bg.includes('scheduleIdleTask('));
 assert.ok(bg.includes('3400'));
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 assert.ok(!app.includes('timer=setTimeout(next,800)'));
 assert.ok(app.includes('useStartupMounts(visible&&!!auth,tab)'));
 assert.ok(app.includes("preloadWhenIdle:screenTab==='home'"));
});



test('074 Android splash exits as a single surface with no icon-only overlay',()=>{
 const overlay=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 const loader=fs.readFileSync(path.join(root,'src/lib/screen-loader.tsx'),'utf8');
 assert.ok(overlay.includes('splash.animate().alpha(0f).setDuration(110L)'));
 assert.ok(overlay.includes('splash.postDelayed({ finalizeSplash() }, 160L)'));
 assert.ok(!overlay.includes('icon.postDelayed('));
 assert.ok(!overlay.includes('setDuration(240L)'));
 assert.ok(!app.includes('<LaunchSAnimation'));
 assert.ok(loader.includes('export const DeferredScreen=React.memo('));
 assert.ok(loader.includes('keys.every(key=>Object.is(left[key],right[key]))'));
});

test('074 Home may reveal with local layout rather than holding on pending remote data',()=>{
 const overlay=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 const code=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 assert.ok(overlay.includes('if (login || home) {'));
 assert.ok(!overlay.includes('if (login || (home && (signals and 8) != 0))'));
 assert.ok(overlay.includes('splash.animate().alpha(0f)'));
 assert.ok(overlay.includes('withEndAction { finalizeSplash() }'));
 assert.ok(code.includes('android:windowSplashScreenAnimationDuration'));
 assert.ok(code.includes('android:duration="180"'));
});
test('074 hidden tabs mount one idle slice at a time after original splash exits',()=>{
 const mounts=fs.readFileSync(path.join(root,'src/lib/startup-mounts.ts'),'utf8');
 const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
 const pages=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');
 const apps=fs.readFileSync(path.join(root,'src/screens/Workspace.tsx'),'utf8');
 assert.ok(mounts.includes("if(!enabled){"));
 assert.ok(mounts.includes("cancelIdle=scheduleIdleTask("));
 assert.ok(mounts.includes("setWarmed(previous=>previous.has(tab)?previous:new Set([...previous,tab]))"));
 assert.ok(app.includes('useStartupMounts(visible&&!!auth,tab)'));
 assert.ok(!app.includes('MENU_PRELOADERS'));
 assert.ok(pages.includes("api.cached<{items:Entity[]}>('/workspace/entities?limit=100&kind=user_page&q=&offset=0')"));
 assert.ok(apps.includes("api.cached<Catalog>('/workspace/catalog')"));
});

test('075 no persistent duplicate S under Android 12 splash',()=>{
 const theme=fs.readFileSync(path.join(root,'plugins/with-sofia-logo.cjs'),'utf8');
 const native=fs.readFileSync(path.join(root,'plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 assert.ok(theme.includes('<item name="android:windowBackground">@color/sofiaLaunchBackground</item>'));
 assert.ok(!theme.includes('<item name="android:windowBackground">@drawable/splashscreen_logo</item>'));
 assert.ok(theme.includes('<item name="android:windowSplashScreenAnimatedIcon">@drawable/sofia_launch_mark_animated</item>'));
 assert.ok(native.includes('splash.animate().alpha(0f).setDuration(110L)'));
 assert.ok(native.includes('splash.remove()'));
 assert.ok(!native.includes('icon.postDelayed('));
 assert.ok(native.includes('SOFIA_LAUNCH_SYSTEM_CALLBACK_PROCESS_MS='));
});
test('075 launch does not block on optional photo decode or full archive rollover',()=>{
 const launch=fs.readFileSync(path.join(root,'src/lib/local-launch.ts'),'utf8');
 const snapshot=fs.readFileSync(path.join(root,'src/lib/startup-snapshot.ts'),'utf8');
 assert.ok(launch.includes('void photoReady;'));
 assert.ok(launch.includes('await snapshot.hydrateLaunch()'));
 assert.ok(!launch.includes('await Promise.all([snapshot.hydrateLaunch(),photoReady])'));
 assert.ok(snapshot.includes("if(this.entries.has('/home')||this.entries.has('/tasks'))"));
 assert.ok(snapshot.includes('void this.hydrate().then(()=>this.flushLaunch()).catch(()=>{})'));
 assert.ok(snapshot.includes('await this.hydrate();void this.flushLaunch()'),'No-cache sessions can still recover the entire archive');
});
