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
function pager(){
 const h=hooks(),commands=[],selected=[],ref={current:null};
 const native={scrollTo:command=>commands.push({...command})};
 const {TabPager}=load('src/components/TabPager.tsx',{'react':h.React,'react/jsx-runtime':jsx,'react-native':{Animated:animated.Animated,ScrollView:'ScrollView',View:'View',StyleSheet:{create:s=>s}},'../lib/tab-navigation':model});
 let props={motion:createMenuMotion(),activeTab:'chat',enabled:true,onSelect:tab=>{selected.push(tab);ref.current.goTo(tab);},children:Array.from(model.TAB_ORDER,x=>({type:'Screen',props:{id:x}}))};
 function render(patch={}){props={...props,...patch};const outer=h.render(()=>TabPager(props,ref));const scroll=outer.props.children;scroll.props.ref.current=native;h.flush();return {outer:outer.props,scroll:scroll.props};}
 let rendered=render();rendered.outer.onLayout({nativeEvent:{layout:{width:400}}});rendered=render();commands.length=0;
 return {commands,selected,ref,render,scroll:rendered.scroll};
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
 const p=pager();p.scroll.onScrollBeginDrag(end(400));p.scroll.onMomentumScrollEnd(end(800));p.render({activeTab:'pages'});p.scroll.onScrollBeginDrag(end(400));p.scroll.onMomentumScrollEnd(end(400));assert.deepEqual(p.selected,['pages','chat']);assert.ok(p.commands.every(c=>c.animated===false));
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
