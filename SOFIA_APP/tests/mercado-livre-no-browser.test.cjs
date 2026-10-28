'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
const load=require('./load-ts.cjs'),provider=load('src/lib/price-provider.ts');
const LINK='https://www.mercadolivre.com.br/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523';
const React={useEffect:()=>{},useState:v=>[v,()=>{}],useRef:v=>({current:v}),useMemo:f=>f(),useCallback:f=>f};
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
test('real page-reader entry points refuse ML before host check, queue or WebView creation',async()=>{
 const module=load('src/lib/price-reader.tsx',{'./price-provider':provider,react:React,'react/jsx-runtime':jsx,'react-native':{View:'View'},'./price-extractor':{},'./monitoring':{}});
 for(const u of [LINK,'https://mercadolivre.com/sec/1AbC23x','meli://item?id=MLB5296520523']){
  assert.equal((await module.readPrice(u)).ok,false);assert.equal((await module.readLinks(u,'mercadolivre.com.br','','fone')).ok,false);
 }
 assert.equal(module.readerDiagnostics().queue,0);assert.equal(module.readerDiagnostics().busy,null);assert.equal(module.readerDiagnostics().totals.noHost,0);
});
test('real PageViewer branch mounts server preview for ML, never requires native WebView or external opening',()=>{
 const file=path.join(__dirname,'../src/screens/monitoring/Stores.tsx'); let nativeWebview=0,externalOpen=0; // 0.3.263: o PageViewer mora nesta parte do Price Tracker
 const out={};const code=ts.transpileModule(fs.readFileSync(file,'utf8').replace(/from '\.\.\/\.\.\//g,"from '../")+'\nexport {PageViewer as __testPageViewer};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const deps={'../lib/palette':{PALETTE:new Proxy({},{get:()=>'#FFFFFF'})},react:React,'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text',Platform:{OS:'android'},Linking:{openURL:()=>externalOpen++}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'../lib/theme':{useTheme:()=>({})},'../lib/price-direct':{...provider},'../lib/monitoring':{PRODUCT_COLORS:[],WINDOWS:[],DROP_CHOICES:[],INTERVALS:[]},'../components/MotionModal':{MotionModal:'Modal'},'../components/UI':{Button:'Button'}};
 vm.runInNewContext(code,{exports:out,require:n=>{if(n==='react-native-webview'){nativeWebview++;throw Error('WebView forbidden');}return deps[n]||{};},URL,Date,AbortController,setTimeout,clearTimeout});
 const props={api:{},monitor:{data:{}},store:{url:LINK},onClose:()=>{},onSaved:async()=>{}};
 const screen=out.__testPageViewer(props);assert.equal(typeof screen.type,'function');
 const tree=screen.type(screen.props);assert.ok(tree);assert.equal(nativeWebview,0);assert.equal(externalOpen,0);
});
test('SofiaApi ML read is POST read, not a cache-mutating request; signal passed separately',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/lib/api.ts'),'utf8');
 const part=src.slice(src.indexOf('  async readMercadoLivre('),src.indexOf('  monitorObservations('));
 assert.ok(part.includes("'/price-tracker/mercadolivre/read'"));assert.ok(part.includes('this.fetchRequest<'));assert.ok(!part.includes('this.request<'));assert.ok(part.includes('const {signal,fetchUrl,...params}=options'));
});

const providerForCollection=load('src/lib/price-provider.ts');
const directForCollection=load('src/lib/price-direct.ts',{'./price-provider':providerForCollection},{AbortController});
const monitored=load('src/lib/monitoring.ts');
function collectionHarness(answer){
 let browser=0;const saved=[];
 const reader={readPrice:async()=>{browser++;return {ok:false,error:'browser must not run'};},readerDiagnostics:()=>({})};
 const collector=load('src/lib/monitor-collector.ts',{'./monitoring':monitored,'./price-reader':reader,'./price-direct':directForCollection,'./bell-inbox':{notificationScope:()=>''},'expo-notifications':{getPermissionsAsync:async()=>({granted:false})}},{AbortController});
 const mon={id:'ml-test',kind:'monitor',title:'Product',state:'active',data:{method:'product',variant:'Preto',currency:'BRL',preferred_url:LINK,source_urls:'',interval_minutes:360,new_low:false,drop_percent:'',target_price:''}};
 const api={owner:'test',entities:async()=>({items:[mon]}),observations:async()=>({items:[]}),observe:async(id,data)=>{saved.push(data);return {};},readMercadoLivre:answer};
 return {collector,api,saved,getBrowser:()=>browser};
}
test('real collector uses real ML dispatch: a refused HTTP reading never opens WebView or records a point',async()=>{
 const h=collectionHarness(async()=>({ok:false,code:'BLOCKED',message:'Acesso recusado.',keepLastPrice:true}));
 await h.collector.runCollection(h.api);assert.equal(h.getBrowser(),0);assert.equal(h.saved.length,0);
 assert.equal(h.collector.collectorState().issues['ml-test|'+LINK].code,'BLOCKED');
});
test('real collector cancels in-flight ML read on pause and discards a late result',async()=>{
 let release,entered;const ready=new Promise(ok=>entered=ok);let signal;
 const h=collectionHarness(async(u,options)=>{signal=options.signal;entered();return new Promise(ok=>release=ok);});
 const task=h.collector.runCollection(h.api);await ready;h.collector.cancelCollection(h.api,'ml-test');
 assert.equal(signal.aborted,true);release({ok:false,code:'CANCELLED',message:'cancelled',keepLastPrice:true});await task;
 assert.equal(h.getBrowser(),0);assert.equal(h.saved.length,0);assert.equal(h.collector.collectorState().running,false);
});
test('tapping an unnamed store row opens its menu, not an external application',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/Monitoring.tsx'),'utf8');
 assert.ok(source.includes('expanded ? setStoreFocus(f => f === s.url ? null : s.url) : setMenu(s)'));
});
