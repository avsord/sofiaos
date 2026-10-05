'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,deps={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in deps,'Unexpected dependency: '+name);return deps[name];},setTimeout:()=>assert.fail('Navigation must not defer to a timer'),requestAnimationFrame:()=>assert.fail('Navigation must not wait for another frame'),fetch:()=>assert.fail('Navigation must not await the server')});return exports;
}
const model=load('src/lib/tab-navigation.ts');
const animated=require('./animated-stub.cjs')();
const {createMenuMotion}=load('src/lib/menu-motion.ts',{'react-native':{Animated:animated.Animated},'./tab-navigation':model});
// Hook/native-view stubs exercise the actual component event handlers. This is not
// an Android renderer, pixel-latency measurement, or a substitute for device QA.
function hooks(){
 const slots=[];let cursor=0,effects=[];
 const memo=(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||!deps||deps.some((x,n)=>x!==old.deps[n]))slots[i]={value:fn(),deps};return slots[i].value;};
 const React={__esModule:true,memo:fn=>fn,forwardRef:fn=>fn,Children:{map:(kids,fn)=>kids.map(fn)},useRef:initial=>{const i=cursor++;return slots[i]||(slots[i]={current:initial});},useState:initial=>{const i=cursor++;if(!slots[i])slots[i]={value:initial};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useCallback:(fn,deps)=>memo(()=>fn,deps),useMemo:memo,useLayoutEffect:(fn,deps)=>memo(()=>{effects.push(fn);return null;},deps),useImperativeHandle:(ref,fn,deps)=>memo(()=>{effects.push(()=>{ref.current=fn();});return null;},deps)};React.default=React;
 return {React,render:fn=>{cursor=0;return fn();},flush:()=>{const list=effects;effects=[];list.forEach(fn=>fn());}};
}
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
function button(onSelect){
 const h=hooks(),theme={accent:'accent',muted:'muted',accentSoft:'soft'};
 const {MenuTab}=load('src/components/MenuTab.tsx',{'react':h.React,'react/jsx-runtime':jsx,'react-native':{Animated:animated.Animated,StyleSheet:{create:s=>s},Pressable:'Pressable',Text:'Text',View:'View'},'../lib/theme':{useTheme:()=>theme},'../lib/tab-navigation':model,'./Icon':{Icon:'Icon'}});
 const props={item:{id:'pages',label:'Páginas',icon:'book'},selected:false,onSelect,motion:createMenuMotion()};
 return {render:patch=>h.render(()=>MenuTab({...props,...patch})).props};
}
function pager(options={}){
 const h=hooks(),commands=[],selected=[],ref={current:null};
 const native={scrollTo:command=>commands.push({...command})};
 const {TabPager}=load('src/components/TabPager.tsx',{'react':h.React,'react/jsx-runtime':jsx,'react-native':{Animated:animated.Animated,ScrollView:'ScrollView',View:'View',StyleSheet:{create:s=>s}},'../lib/tab-navigation':model});
 let props={motion:options.motion||createMenuMotion(),activeTab:options.initial||'chat',enabled:true,onSelect:tab=>{selected.push(tab);ref.current.goTo(tab);},children:Array.from(model.TAB_ORDER,x=>({type:'Screen',props:{id:x}}))};
 let rendered;
 function render(patch={}){props={...props,...patch};const outer=h.render(()=>TabPager(props,ref));const scroll=outer.props.children;if(scroll)scroll.props.ref.current=native;h.flush();rendered={outer:outer.props,scroll:scroll?.props};return rendered;}
 render();
 function measure(width=400,contentFirst=false){
  rendered.outer.onLayout({nativeEvent:{layout:{width}}});render();
  const viewport=()=>rendered.scroll.onLayout({nativeEvent:{layout:{width}}});
  const content=()=>rendered.scroll.onContentSizeChange(width*6,700);
  if(contentFirst){content();viewport();}else{viewport();content();}
  render();
 }
 if(options.measure!==false){measure();commands.length=0;}
 return {commands,selected,ref,render,measure,get outer(){return rendered.outer;},get scroll(){return rendered.scroll;}};
}
const end=(x,velocity=0)=>({nativeEvent:{contentOffset:{x,y:0},velocity:{x:velocity,y:0}}});

test('rendered tab dispatches before finger-up, with no timer or network dependency',()=>{
 const calls=[],view=button(tab=>calls.push(tab)).render();view.onPressIn();assert.deepEqual(calls,['pages']);view.onPress();assert.deepEqual(calls,['pages']);assert.equal(view.unstable_pressDelay,0);
});
test('releasing an older tab cannot undo a later tab touch',()=>{
 const calls=[],a=model.createImmediateMenuPress(()=>calls.push('home')),b=model.createImmediateMenuPress(()=>calls.push('pages'));
 a.pressIn();b.pressIn();a.press();b.press();assert.deepEqual(calls,['home','pages']);
});
test('rendered tab uses current callback after re-render',()=>{
 const calls=[],component=button(()=>calls.push('old'));component.render();const current=component.render({onSelect:()=>calls.push('new')});current.onPressIn();current.onPress();assert.deepEqual(calls,['new']);
});
test('cancelled presses do not disable future navigation',()=>{
 const calls=[],view=button(tab=>calls.push(tab)).render();view.onPressIn();view.onTouchCancel();view.onPressIn();view.onPress();assert.deepEqual(calls,['pages','pages']);
});
test('keyboard and accessibility can activate tabs without a pointer press',()=>{
 const calls=[],view=button(tab=>calls.push(tab)).render();view.onPress();view.onAccessibilityTap();view.onAccessibilityAction({nativeEvent:{actionName:'activate'}});assert.deepEqual(calls,['pages','pages','pages']);
});
test('100 consecutive complete taps activate once each, immediately',()=>{
 const calls=[],press=model.createImmediateMenuPress(()=>calls.push(calls.length));for(let i=0;i<100;i++){press.pressIn();assert.equal(calls.length,i+1);press.press();assert.equal(calls.length,i+1);}
});
test('rendered pager uses native horizontal movement with full-width neighboring surfaces',()=>{
 const p=pager();assert.equal(p.scroll.horizontal,true);assert.equal(p.scroll.pagingEnabled,true);assert.equal(p.scroll.scrollEnabled,true);assert.equal(p.scroll.onScroll.nativeDriver,true);assert.equal(p.scroll.scrollEventThrottle,16);assert.equal(p.scroll.children.length,6);
 for(const child of p.scroll.children){assert.equal(child.props.style[1].width,400);assert.equal(child.props.style[0].flexShrink,0);}
});
test('content changes during a drag never command a snap back under the finger',()=>{
 const p=pager();p.scroll.onScrollBeginDrag(end(400));for(let i=0;i<20;i++)p.scroll.onContentSizeChange(2400,700+i);assert.equal(p.commands.length,0);assert.equal(p.selected.length,0);
});
test('momentum remains native after release; content changes still cannot interrupt',()=>{
 const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag(end(680,0.5));p.scroll.onContentSizeChange(2400,740);assert.equal(p.commands.length,0);assert.equal(p.selected.length,0);p.scroll.onMomentumScrollEnd(end(800));assert.deepEqual(p.selected,['pages']);
});
test('a menu tap interrupts a drag immediately and stale momentum cannot revert it',()=>{
 const p=pager();p.scroll.onScrollBeginDrag(end(400));p.ref.current.goTo('profile');assert.deepEqual(p.commands,[{x:2000,y:0,animated:false}]);p.scroll.onMomentumScrollEnd(end(800));assert.equal(p.selected.length,0);
});
test('settled swipe in either direction updates selection without an extra animation',()=>{
 const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag(end(700,.5));p.scroll.onMomentumScrollEnd(end(800));p.render({activeTab:'pages'});p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag(end(410,.5));p.scroll.onMomentumScrollEnd(end(400));assert.deepEqual(p.selected,['pages','chat']);assert.ok(p.commands.every(c=>c.animated===false));
});
test('stationary release on a page works even without a later momentum event',()=>{
 const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag(end(800));assert.deepEqual(p.selected,['pages']);
});
test('recording or keyboard lock disables the native gesture and cancels a pending swipe',()=>{
 const p=pager();p.scroll.onScrollBeginDrag(end(400));const locked=p.render({enabled:false});assert.equal(locked.scroll.scrollEnabled,false);locked.scroll.onMomentumScrollEnd(end(800));assert.equal(p.selected.length,0);
});
test('page-body JSON is cached before navigation, while scrollable rows stay release-activated',()=>{
 const source=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');assert.ok(source.includes('items.forEach(page=>store.open(page))'));assert.ok(source.includes('store.open(pages.find(p=>p.id===page.id)||page)'));
 assert.ok(!source.includes('onPressIn={()=>open('));assert.ok(!source.includes('onPressIn={()=>onOpen('));
});


test('cold startup does not mount zero-width pages before measuring the viewport',()=>{
 const p=pager({measure:false});assert.equal(p.scroll,undefined);assert.equal(p.commands.length,0);
 p.outer.onLayout({nativeEvent:{layout:{width:400}}});p.render();
 assert.equal(p.scroll.contentOffset.x,400);assert.equal(p.scroll.scrollEnabled,false);
 assert.equal(p.scroll.style[1].opacity,0);assert.equal(p.commands.length,0);
});
test('initial selection is applied after both native dimensions, in either callback order',()=>{
 for(const contentFirst of [false,true]){const p=pager({measure:false});p.measure(400,contentFirst);
  assert.deepEqual(p.commands,[{x:400,y:0,animated:false}]);assert.equal(p.scroll.style[1].opacity,1);assert.equal(p.scroll.scrollEnabled,true);}
});
test('partial content cannot clamp initial Conversa to Home',()=>{
 const p=pager({measure:false});p.outer.onLayout({nativeEvent:{layout:{width:400}}});p.render();
 p.scroll.onLayout({nativeEvent:{layout:{width:400}}});
 for(const w of [0,400,800,2000])p.scroll.onContentSizeChange(w,700);
 assert.equal(p.commands.length,0);p.scroll.onContentSizeChange(2400,700);
 assert.deepEqual(p.commands,[{x:400,y:0,animated:false}]);
});
test('native focus is not allowed to move the outer pager to an offscreen input',()=>{
 const p=pager();assert.equal(p.scroll.scrollsChildToFocus,false);assert.equal(p.scroll.contentContainerStyle[1].width,2400);
});
test('the starting native offset stays stable across React selection changes',()=>{
 const p=pager(),offset=p.scroll.contentOffset;p.ref.current.goTo('pages');p.render({activeTab:'pages'});
 assert.equal(p.scroll.contentOffset,offset);assert.equal(p.scroll.contentOffset.x,400);
});
test('a tap before native layout is ready selects the page shown when it becomes ready',()=>{
 const p=pager({measure:false});p.ref.current.goTo('profile');p.measure();assert.equal(p.scroll.contentOffset.x,2000);
 assert.equal(p.commands.at(-1).x,2000);
});
test('remounting with a reused motion resets the highlight without changing spring timing',()=>{
 const motion=createMenuMotion();motion.resize(400,'chat');motion.select('profile');animated.advance(1);
 const p=pager({motion});assert.equal(animated.read(motion.weights[1]),1);assert.equal(animated.read(motion.weights[5]),0);assert.equal(p.scroll.contentOffset.x,400);
});
test('resizing waits for matching geometry and preserves the selected page',()=>{
 const p=pager();p.ref.current.goTo('pages');p.render({activeTab:'pages'});p.commands.length=0;
 p.outer.onLayout({nativeEvent:{layout:{width:600}}});p.render();assert.equal(p.scroll.scrollEnabled,false);
 p.scroll.onLayout({nativeEvent:{layout:{width:400}}});p.scroll.onContentSizeChange(2400,700);assert.equal(p.commands.length,0);
 p.scroll.onLayout({nativeEvent:{layout:{width:600}}});p.scroll.onContentSizeChange(3600,700);p.render();
 assert.equal(p.commands.at(-1).x,1200);assert.equal(p.scroll.scrollEnabled,true);assert.equal(p.scroll.contentOffset.x,1200);
});
test('late stale content callbacks cannot break subsequent direct menu taps',()=>{
 const p=pager();p.scroll.onContentSizeChange(0,0);p.scroll.onLayout({nativeEvent:{layout:{width:0}}});p.ref.current.goTo('apps');assert.equal(p.commands.at(-1).x,1600);
});
test('native interval snapping selects the neighboring menu even with a short fling',()=>{
 const p=pager();assert.equal(p.scroll.decelerationRate,'fast');assert.equal(p.scroll.pagingEnabled,true);assert.equal(p.scroll.snapToInterval,400);assert.equal(p.scroll.disableIntervalMomentum,true);
 p.ref.current.goTo('home');assert.equal(p.commands.at(-1).animated,false);
});

test('old momentum cannot end a new touch or pull it back',()=>{const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag({...end(680,.8),timeStamp:20});p.scroll.onScrollBeginDrag({...end(650),timeStamp:30});p.scroll.onMomentumScrollEnd({...end(800),timeStamp:25});assert.equal(p.selected.length,0);assert.equal(p.commands.length,0);p.scroll.onScrollEndDrag({...end(430,-.8),timeStamp:40});p.scroll.onMomentumScrollEnd({...end(800),timeStamp:25});assert.equal(p.selected.length,0);p.scroll.onMomentumScrollEnd({...end(0),timeStamp:50});assert.deepEqual(p.selected,['home']);});

test('settling a native swipe and subsequent layout callbacks do not issue a second scroll command',()=>{const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag(end(680,.5));p.scroll.onMomentumScrollEnd(end(800));assert.deepEqual(p.selected,['pages']);assert.equal(p.commands.length,0);p.render({activeTab:'pages'});p.scroll.onContentSizeChange(2400,700);p.scroll.onLayout({nativeEvent:{layout:{width:400}}});assert.equal(p.commands.length,0);p.ref.current.goTo('profile');assert.deepEqual(p.commands,[{x:2000,y:0,animated:false}]);});

test('short slow horizontal drags settle one neighbor with native animation, in both directions',()=>{const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag(end(470,.05));assert.deepEqual(p.commands,[{x:800,y:0,animated:true}]);p.scroll.onMomentumScrollEnd(end(800));assert.deepEqual(p.selected,['pages']);const q=pager();q.scroll.onScrollBeginDrag(end(400));q.scroll.onScrollEndDrag(end(330,-.05));assert.deepEqual(q.commands,[{x:0,y:0,animated:true}]);q.scroll.onMomentumScrollEnd(end(0));assert.deepEqual(q.selected,['home']);});

test('a 30dp slow drag changes menu but a fling never starts competing JS momentum',()=>{const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag(end(430,.03));assert.deepEqual(p.commands,[{x:800,y:0,animated:true}]);const q=pager();q.scroll.onScrollBeginDrag(end(400));q.scroll.onScrollEndDrag(end(430,.8));assert.equal(q.commands.length,0);q.scroll.onMomentumScrollEnd(end(800));assert.deepEqual(q.selected,['pages']);});


test('20dp slow drag is enough in both directions, while tiny drift does not switch menu',()=>{for(const d of [-20,20]){const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag(end(400+d,0));assert.deepEqual(p.commands,[{x:d>0?800:0,y:0,animated:true}]);}for(const d of [-8,8]){const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onScrollEndDrag(end(400+d,0));assert.equal(p.commands.length,0);}});
test('snap interval follows viewport resize rather than retaining a stale pixel distance',()=>{const p=pager();p.measure(600);assert.equal(p.scroll.snapToInterval,600);});
