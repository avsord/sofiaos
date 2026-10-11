// R8 (0.3.110): regression tests for the post-launch fixes. Pure + real React 19.2.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const load=require('./load-ts.cjs');global.IS_REACT_ACT_ENVIRONMENT=true;
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const {PageEditorStore}=load('src/lib/page-editor.ts');
const {pageStoreSession}=load('src/lib/page-store-session.ts');

test('store de Páginas: 20 ciclos sair/voltar com gravação concluída nunca descartam e ouvintes continuam vivos',async()=>{
 const page={id:'p',title:'T',kind:'user_page',revision:1,data:{blocks_json:'[]'}};
 const store=new PageEditorStore({persist:async()=>{},save:async()=>{throw Error('offline');},read:async()=>page,delay:300000,maxWait:300000});store.open(page);
 let disposed=0,heard=0;const real=store.dispose.bind(store);store.dispose=()=>{disposed++;real();};
 store.subscribe(()=>{heard++;});
 const session=pageStoreSession(store);
 for(let i=0;i<20;i++){const leave=session.enter();leave();await store.flushAll();}
 session.enter();const before=heard;store.edit('p',d=>({...d,title:'depois'}));
 assert.equal(disposed,0);assert.ok(heard>before,'ouvinte precisa disparar depois dos ciclos');assert.equal(store.get('p').draft.title,'depois');
 real();
});

test('registro de erro: tipo e componentes sim; texto de erro não-motor nunca',()=>{
 const m=load('src/lib/fluency-metrics.ts',{'./idle-work':{idleWork:{records:()=>[]}}});
 const stack='\n    in PageEditor (at Pages.tsx:10)\n    in Pages\n    in ScreenBoundary\n';
 m.perfError('screen:pages',new TypeError("Cannot read property 'draft' of undefined"),stack);
 m.perfError('screen:pages',new Error('Página secreta do Pedro não encontrada'),stack);
 const [a,b]=m.perfReport().errors;
 assert.equal(a.name,'TypeError');assert.match(a.detail,/Cannot read property 'draft'/);assert.deepEqual([...a.components],['PageEditor','Pages','ScreenBoundary']);
 assert.equal(b.name,'Error');assert.equal(b.detail,'','texto de erro comum pode conter conteúdo do usuário');
});

test('proteção por tela: erro numa tela mostra "Recarregar esta tela" e recarregar remonta só ela',async()=>{
 const code=ts.transpileModule(read('src/components/ScreenBoundary.tsx'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const errors=[];const exports={};
 const deps={'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':{View:'View',Text:'Text',Pressable:'Pressable'},'../lib/theme':{useTheme:()=>({bg:'#fff',text:'#000',muted:'#777',accent:'#70f'})},'../lib/fluency-metrics':{perfError:(scope,e)=>errors.push([scope,e.name])}};
 vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in deps,'Unexpected '+n);return deps[n];},console});
 let explode=true,mounts=0;
 function Pages(){React.useEffect(()=>{mounts++;},[]);if(explode)throw new TypeError('boom');return React.createElement('Text',null,'ok');}
 const quiet=console.error;console.error=()=>{};let tree;
 try{await act(async()=>{tree=create(React.createElement('View',null,React.createElement(exports.ScreenBoundary,{name:'pages'},React.createElement(Pages)),React.createElement('Text',null,'menu')));});}finally{console.error=quiet;}
 const labels=tree.root.findAll(n=>n.props&&n.props.accessibilityLabel==='Recarregar esta tela');
 assert.equal(labels.length>0,true,'botão de recarregar aparece');assert.deepEqual(errors[0],['screen:pages','TypeError']);
 assert.ok(tree.root.findAll(n=>n.type==='Text'&&n.props.children==='menu').length,'o resto do app continua de pé');
 explode=false;await act(async()=>{labels[0].props.onPress();});
 assert.ok(tree.root.findAll(n=>n.type==='Text'&&n.props.children==='ok').length,'a tela remontou');assert.equal(mounts,1);
});

test('árvore de Páginas: 600 linhas desenham 30 na hora e o resto em blocos, por quadro',async()=>{
 const code=ts.transpileModule(read('src/components/PageTreeList.tsx'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const frames=[];let queued=[];const exports={};
 class Value{constructor(v){this.v=v;}setValue(v){this.v=v;}stopAnimation(){}getTranslateTransform(){return [];}}
 const native={View:'View',Text:'Text',Pressable:'Pressable',Animated:{Value,ValueXY:class extends Value{},View:'AnimatedView',timing:()=>({start(){},stop(){}})}};
 const deps={'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':native,'../lib/theme':{useTheme:()=>({text:'t',muted:'m',accent:'a',accentSoft:'s',surface:'f',input:'i',danger:'d'})},'./Icon':{Icon:'Icon'},'../lib/motion':{MOTION_EASE:null,useReducedMotion:()=>false},'../lib/page-order':{PAGE_INDENT:16,dropLineY:()=>null,projectPageDrop:()=>null},'../lib/fluency':{queueOptional:(name,run)=>{queued.push(name);return()=>{};}}};
 vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in deps,'Unexpected '+n);return deps[n];},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame:()=>{},setTimeout,clearTimeout,Map,Set,Math,console});
 const roots=Array.from({length:600},(_,i)=>({id:'p'+i,title:'Página QA '+String(i).padStart(4,'0'),data:{}}));
 const props={roots,children:new Map(),expanded:new Set(),toggle(){},onOpen(){},onMove(){},canParent:()=>true};
 const rows=t=>t.root.findAll(n=>typeof n.props?.accessibilityLabel==='string'&&n.props.accessibilityLabel.startsWith('Abrir página principal')&&n.type==='View').length;
 let tree;await act(async()=>{tree=create(React.createElement(exports.PageTreeList,props));});
 assert.equal(rows(tree),exports.INITIAL_ROWS,'primeiro desenho limitado');
 assert.ok(queued.includes('pages:measure'),'medição completa vai para a fila, fora da janela crítica');
 let steps=0;while(frames.length&&steps<100){const f=frames.shift();await act(async()=>{f();});steps++;}
 assert.equal(rows(tree),600,'todas as linhas chegam');
 assert.equal(steps,Math.ceil((600-exports.INITIAL_ROWS)/exports.ROWS_PER_FRAME),'um bloco por quadro');
});

test('contagem do histórico sai da abertura e vai para a fila',()=>{
 const s=read('src/lib/startup-snapshot.ts');
 assert.ok(s.includes("queueOptional('count:history'"));assert.ok(!s.includes("if(!onlyLaunch)perfSync('count:history'"));
});
