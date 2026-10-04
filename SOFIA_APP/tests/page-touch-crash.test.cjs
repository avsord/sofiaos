'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const load=require('./load-ts.cjs');
const {PageRefreshGuard}=load('src/lib/page-gesture.ts');
const source=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
function callback(code){
 const file=ts.createSourceFile('Pages.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='changePageInteraction')found=n;ts.forEachChild(n,visit);}visit(file);assert.ok(found);
 const js=ts.transpileModule(found.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 let now=1000;const calls=[],guard=new PageRefreshGuard(()=>now),ref={current:false};
 const context={pageInteractionRef:ref,refreshGuard:{current:guard},refreshControl:{current:{}},selectedRef:{current:null},setPageInteraction:v=>calls.push(['interaction',v]),onDepthChange:v=>calls.push(['depth',v])};
 const change=vm.runInNewContext(js+';changePageInteraction',context);
 return {change,calls,guard,ref,context,advance:n=>now+=n};
}
test('page DOWN and hold use actual Pages callback with composite RefreshControl, no native method required',()=>{
 const r=callback(source);assert.doesNotThrow(()=>r.change(true));assert.equal(r.ref.current,true);assert.equal(r.guard.canRefresh(),false);assert.deepEqual(r.calls,[['interaction',true],['depth',true]]);
 r.advance(400);r.change(true);assert.equal(r.guard.canRefresh(),false);
 r.change(false);assert.equal(r.ref.current,false);assert.equal(r.guard.canRefresh(),false);r.advance(300);assert.equal(r.guard.canRefresh(),true);
 r.context.selectedRef.current='parent';r.change(true);r.change(false);assert.deepEqual(r.calls.at(-1),['depth',true]);
});
test('harness reproduces 024 exception before state and pager lock update',()=>{
 const old=source.replace('  setPageInteraction(value);', '  if(value)refreshControl.current?.setNativeProps({enabled:false});\n  setPageInteraction(value);');
 const r=callback(old);assert.throws(()=>r.change(true),/setNativeProps.*not a function/);assert.deepEqual(r.calls,[]);
});
test('locked React Native runtime really does not define the method on RefreshControl',()=>{
 const rn=fs.readFileSync(require.resolve('react-native/Libraries/Components/RefreshControl/RefreshControl.js'),'utf8');
 assert.match(rn,/class RefreshControl extends React.Component/);assert.doesNotMatch(rn,/\bsetNativeProps\b/);
});
