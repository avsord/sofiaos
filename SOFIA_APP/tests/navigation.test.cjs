'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
const pager=fs.readFileSync(path.join(root,'src/components/TabPager.tsx'),'utf8');
const js=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/tab-navigation.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exported={};vm.runInNewContext(js,{exports:exported});
const {TAB_ORDER,tabAtOffset,createPagerSelection}=exported;

test('production starts on Início for saved sessions and immediately after login',()=>{
  assert.ok(source.includes("[tab,setTab]=useState<Tab>('home')"));
  assert.ok(source.includes("createMenuMotion('home')"));
  assert.ok(source.includes("switchTab('home');setError('');"));
  assert.ok(!source.includes("[tab,setTab]=useState<Tab>('chat')"));
});
test('native menu jump happens synchronously before the selected tab renders',()=>{
  const match=source.match(/const switchTab=useCallback\(\(next:Tab\)=>\{([^}]*)\},\[\]\)/);
  assert.ok(match);
  const calls=[],navigation={current:{tab:'chat'}},pager={current:{goTo:next=>calls.push(['native',next])}};
  const fn=vm.runInNewContext('(next)=>{'+match[1]+'}',{navigation,pager,setTab:next=>calls.push(['react',next])});
  for(let i=0;i<100;i++) {const next=TAB_ORDER[i%TAB_ORDER.length];fn(next);assert.equal(navigation.current.tab,next);assert.deepEqual(calls.slice(-2),[['native',next],['react',next]]);}
});
test('rapid taps use the latest selection, not a stale render closure',()=>{
  const match=source.match(/const navigate=useCallback\(\(next:Tab\)=>\{([\s\S]*?)\},\[switchTab\]\)/);assert.ok(match);
  const calls=[],navigation={current:{tab:'chat',locked:false}},tabHistory={current:[]};
  const fn=vm.runInNewContext('(next)=>{'+match[1]+'}',{navigation,tabHistory,pager:{current:{goTo:()=>{}}},Alert:{alert:()=>calls.push('blocked')},switchTab:next=>{navigation.current.tab=next;calls.push(next);}});
  fn('pages');fn('agenda');fn('home');assert.deepEqual(calls,['pages','agenda','home']);assert.deepEqual(Array.from(tabHistory.current),['chat','pages','agenda']);
  fn('home');assert.equal(calls.length,3);navigation.current.locked=true;fn('profile');assert.equal(calls.at(-1),'blocked');assert.equal(navigation.current.tab,'home');
});
test('tap selection has no timer, vertical translation, fade or animated jump',()=>{
  for(const token of ['PanResponder','Animated','Easing','transitioning','translateY','requestAnimationFrame','setTimeout'])assert.ok(!source.includes(token),token);
  assert.ok(!pager.includes('animated:true'));assert.ok(pager.includes('animated:false'));assert.ok(!pager.includes('setTimeout'));
});
test('gestures use the native horizontal pager and do not steal vertical scrolls with JS responders',()=>{
  assert.match(pager,/horizontal pagingEnabled/);assert.ok(pager.includes('directionalLockEnabled nestedScrollEnabled'));
  assert.ok(pager.includes('onMomentumScrollEnd={finish}'));assert.ok(pager.includes('onScrollBeginDrag={begin}'));
  assert.ok(pager.includes('velocity !== undefined && Math.abs(velocity) < 0.01'));
  assert.ok(source.includes("enabled={!locked&&!keyboard&&tab!=='notifications'&&!(tab==='pages'&&pagesDepth)&&!(tab==='apps'&&workspaceDepth)}"));
});
test('all six menus stay mounted in a fixed horizontal order',()=>{
  assert.deepEqual(Array.from(TAB_ORDER),['home','chat','pages','agenda','apps','profile']);
  const body=source.slice(source.indexOf('<TabPager'),source.indexOf('</TabPager>'));
  let previous=-1;for(const name of ['Home','Chat','Pages','Agenda','Workspace','Profile']){const index=body.indexOf('<'+name+' ');assert.ok(index>previous,name);previous=index;}
  assert.ok(!source.includes('display:'));assert.ok(pager.includes('removeClippedSubviews={false}'));assert.ok(!source.includes('setBootstrap(null);setTab('));
});
test('unchanged screen trees and callback props are memoized, preserving drafts and scroll positions',()=>{
  for(const name of ['Home','Chat','Pages','Agenda','Workspace','Profile','Notifications'])assert.ok(source.includes(name+'=React.memo('+name+'Screen)'),name);
  for(const name of ['navigate','goBack','changePrefs','logout','profile','manualUpdate','clearChat','notificationBack'])assert.ok(source.includes('const '+name+'=useCallback('),name);
  assert.ok(source.includes("key={'chat-'+chatEpoch}"));assert.ok(!source.includes('key={tab}'));
});
test('notification overlay cannot capture touches or accessibility focus while hidden',()=>{
  assert.ok(source.includes("pointerEvents={tab==='notifications'?'auto':'none'}"));
  assert.ok(source.includes("importantForAccessibility={tab==='notifications'?'auto':'no-hide-descendants'}"));
  assert.ok(pager.includes("activeTab === TAB_ORDER[index] ? 'auto' : 'no-hide-descendants'"));
});
test('both swipe directions map to the adjacent menu and clamp at the ends',()=>{
  assert.equal(tabAtOffset(0,400),'home');assert.equal(tabAtOffset(400,400),'chat');assert.equal(tabAtOffset(800,400),'pages');
  assert.equal(tabAtOffset(-500,400),'home');assert.equal(tabAtOffset(10000,400),'profile');
  const state=createPagerSelection('chat');state.beginDrag();assert.equal(state.finishDrag(800,400),'pages');state.beginDrag();assert.equal(state.finishDrag(400,400),'chat');
});
test('invalid or unmeasured layouts never choose a menu',()=>{
  for(const [x,w] of [[0,0],[20,-1],[NaN,400],[Infinity,400],[500,NaN],[500,Infinity]])assert.equal(tabAtOffset(x,w),null);
});
test('interrupted or cancelled gestures do not override a newer menu tap',()=>{
  const state=createPagerSelection();state.beginDrag();state.select('profile');assert.equal(state.finishDrag(800,400),null);assert.equal(state.current(),'profile');
  state.beginDrag();state.cancelDrag();assert.equal(state.finishDrag(400,400),null);assert.equal(state.current(),'profile');
});
test('repeated fast menu taps win over stale native momentum events',()=>{
  const state=createPagerSelection();
  for(let i=0;i<100;i++){state.beginDrag();const next=TAB_ORDER[i%TAB_ORDER.length];state.select(next);assert.equal(state.finishDrag(2000,400),null);assert.equal(state.current(),next);}
});
test('short drag returning to its starting page does not add navigation history',()=>{
  const state=createPagerSelection('chat');state.beginDrag();assert.equal(state.finishDrag(401,400),null);assert.equal(state.current(),'chat');
});
test('notifications are outside the swipe sequence without losing the underlying page',()=>{
  const state=createPagerSelection('pages');state.beginDrag();state.select('notifications');assert.equal(state.current(),'pages');assert.equal(state.finishDrag(1200,400),null);
});
test('Android identity, discovery prefix and version stay compatible',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'app.json'))).expo,pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  const update=fs.readFileSync(path.join(root,'src/lib/update.ts'),'utf8');
  assert.equal(config.android.package,'com.avsord.sofiaapp');assert.equal(config.android.versionCode,30);
  assert.equal(config.version,'0.3.25');assert.equal(pkg.version,config.version);assert.ok(update.includes("APP_VERSION = '"+pkg.version+"'"));assert.ok(update.includes("RELEASE_PREFIX = 'sofia-android-v'"));
});
test('Pages opens a preloaded entity synchronously without a network wait',()=>{
 const pages=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');
 assert.ok(pages.includes('items.forEach(page=>store.open(page))'));
 const fn=pages.match(/function open\(page:Entity,push=true\)\{([^\n]*)/)[1];
 assert.ok(fn.includes('setSelectedId(page.id)'));assert.ok(!fn.includes('await '));assert.ok(!fn.includes('api.entity('));
});

test('an open page owns horizontal back gesture before the main menu pager',()=>{
 assert.ok(source.includes("[pagesDepth,setPagesDepth]=useState(false)"));
 assert.ok(source.includes("tab==='pages'&&pagesDepth"));
 assert.ok(source.includes('onDepthChange={setPagesDepth}'));
 const pages=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');
 assert.ok(pages.includes('PanResponder.create'));
 assert.ok(pages.includes('translateX:backX'));
 assert.ok(pages.includes('g.dx>8&&Math.abs(g.dx)>Math.abs(g.dy)*1.15'));
});
