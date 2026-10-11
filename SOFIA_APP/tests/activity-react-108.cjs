// Actual React 19.2 Activity lifecycle, run with temporary test-renderer tools.
// Not a substitute for the Android swipe/audio test.
const test=require('node:test'),assert=require('node:assert/strict');
const tools=process.env.SOFIA_REACT_TEST_TOOLS;
const React=require(tools?tools+'/react':'react'),{act,create}=require(tools?tools+'/react-test-renderer':'react-test-renderer');
const load=require('./load-ts.cjs');global.IS_REACT_ACT_ENVIRONMENT=true;
const {PageEditorStore}=load('src/lib/page-editor.ts');
const {pageStoreSession}=load('src/lib/page-store-session.ts');
test('real Activity hide/show preserves React text and live PageEditorStore despite a late hide flush',async()=>{
 let disk=[],disposeCalls=0,heldResolve,hold=false;
 const page={id:'page',title:'Original',kind:'user_page',revision:1,data:{blocks_json:'[]'}};
 const store=new PageEditorStore({persist:async rows=>{disk=rows;},save:async()=>{if(hold)await new Promise(r=>heldResolve=r);throw Error('offline fixture');},read:async()=>page,delay:300000,maxWait:300000});store.open(page);
 const originalDispose=store.dispose.bind(store);store.dispose=()=>{disposeCalls++;originalDispose();};
 const session=pageStoreSession(store);let setText,mounted=0,cleaned=0,tree;
 function Editor(){const [value,set]=React.useState('Original');setText=value=>{set(value);store.edit('page',d=>({...d,title:value}));};React.useEffect(()=>{mounted++;const leave=session.enter();return()=>{cleaned++;leave();};},[]);return React.createElement('input',{value});}
 const view=mode=>React.createElement(React.Activity,{mode},React.createElement(Editor));
 await act(async()=>{tree=create(view('visible'));});
 await act(async()=>{setText('Rascunho preservado');});hold=true;
 await act(async()=>{tree.update(view('hidden'));});assert.equal(cleaned,1);assert.equal(mounted,1);
 await act(async()=>{tree.update(view('visible'));});assert.equal(mounted,2);
 await act(async()=>{heldResolve();await new Promise(r=>setImmediate(r));});
 assert.equal(disposeCalls,0,'old asynchronous cleanup must not dispose the reactivated store');
 assert.equal(tree.root.findByType('input').props.value,'Rascunho preservado');
 assert.equal(store.get('page').draft.title,'Rascunho preservado');
 await act(async()=>{setText('Rascunho preservado editado');});
 assert.equal(store.get('page').draft.title,'Rascunho preservado editado');hold=false;
 // R8 policy: leaving persists drafts and never disposes (hide and unmount are indistinguishable under Activity).
 await act(async()=>{tree.unmount();});await store.flushAll();assert.equal(disposeCalls,0);assert.equal(disk[0].draft.title,'Rascunho preservado editado');store.dispose();
});
test('actual hidden Activity creates no effects; subscriptions resume once after showing',async()=>{
 let starts=0,ends=0,value=0,set,tree;
 function Screen(){const [n,s]=React.useState(0);set=s;value=n;React.useEffect(()=>{starts++;return()=>{ends++;};},[]);return React.createElement('span',{},String(n));}
 const view=mode=>React.createElement(React.Activity,{mode},React.createElement(Screen));
 await act(async()=>{tree=create(view('hidden'));});assert.equal(starts,0);
 await act(async()=>{tree.update(view('visible'));});assert.equal(starts,1);
 await act(async()=>{set(42);});await act(async()=>{tree.update(view('hidden'));});assert.equal(ends,1);
 await act(async()=>{tree.update(view('visible'));});assert.equal(starts,2);assert.equal(value,42);
 await act(async()=>{tree.unmount();});assert.equal(ends,2);
});

test('R8: flush that COMPLETES while hidden never disposes; 20 hide/show cycles keep editor and listeners alive',async()=>{
 let disposeCalls=0,notified=0,tree,setText;
 const page={id:'page',title:'Original',kind:'user_page',revision:1,data:{blocks_json:'[]'}};
 const store=new PageEditorStore({persist:async()=>{},save:async()=>{throw Error('offline fixture');},read:async()=>page,delay:300000,maxWait:300000});store.open(page);
 const originalDispose=store.dispose.bind(store);store.dispose=()=>{disposeCalls++;originalDispose();};
 const session=pageStoreSession(store);
 function Editor(){const [value,set]=React.useState('Original');setText=v=>{set(v);store.edit('page',d=>({...d,title:v}));};
  React.useEffect(()=>store.subscribe(()=>{notified++;}),[]);
  React.useEffect(()=>session.enter(),[]);return React.createElement('input',{value});}
 const view=mode=>React.createElement(React.Activity,{mode},React.createElement(Editor));
 await act(async()=>{tree=create(view('visible'));});
 for(let i=0;i<20;i++){
  await act(async()=>{setText('Rascunho '+i);});
  await act(async()=>{tree.update(view('hidden'));});
  await act(async()=>{await store.flushAll();await new Promise(r=>setImmediate(r));}); // flush termina COM a aba escondida
  await act(async()=>{tree.update(view('visible'));});
 }
 assert.equal(disposeCalls,0,'hiding must never dispose the store');
 const before=notified;await act(async()=>{setText('Depois de 20 ciclos');});
 assert.ok(notified>before,'store listeners must still fire after 20 hide/show cycles');
 assert.equal(store.get('page').draft.title,'Depois de 20 ciclos');
 assert.equal(tree.root.findByType('input').props.value,'Depois de 20 ciclos');
 await act(async()=>{tree.unmount();});store.dispose();
});
