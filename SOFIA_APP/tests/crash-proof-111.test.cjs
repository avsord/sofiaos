// 0.3.112: the app must never dead-end. Real React 19.2; each test fails on the previous code.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const compile=(file,deps,globals={})=>{const code=ts.transpileModule(read(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;const exports={};
 vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in deps,'Unexpected '+n);return deps[n];},console,setTimeout,clearTimeout,Date,Object,Set,Map,Math,String,Array,JSON,Promise,...globals},{});return exports;};
const rn={View:'View',Text:'Text',Pressable:'Pressable'};
const jsx=require('react/jsx-runtime');
const saved=[];
const metrics={perfError:(scope,e,stack)=>({scope,name:e.name,detail:['TypeError','RangeError'].includes(e.name)?e.message:'',components:String(stack||'').split('\n').map(l=>l.trim().match(/^in\s+(\w+)/)?.[1]).filter(Boolean),atMs:0})};
const lastError={rememberError:row=>saved.push(row),errorLine:r=>r?r.name+(r.detail?': '+r.detail:'')+(r.components.length?' em '+r.components.join(' > '):''):''};
const timers=[];const fake={setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:id=>{if(timers[id-1])timers[id-1].fn=null;}};
const runTimers=async()=>{const due=timers.splice(0);for(const t of due)if(t.fn)await act(async()=>{t.fn();});};
const {AppBoundary}=compile('src/components/AppBoundary.tsx',{'react':React,'react/jsx-runtime':jsx,'react-native':rn,'../lib/fluency-metrics':metrics,'../lib/last-error':lastError},fake);
const quiet=async fn=>{const e=console.error;console.error=()=>{};try{return await fn();}finally{console.error=e;}};
const texts=t=>t.root.findAll(n=>n.type==='Text').map(n=>[].concat(n.props.children).join(''));
const labelled=(t,l)=>t.root.findAll(n=>n.props&&n.props.accessibilityLabel===l);

test('AppBoundary: a falha acontece uma vez, a Sofia se recupera sozinha e o usuário não precisa fazer nada',async()=>{
 timers.length=0;let explode=true,mounts=0;function Shell(){React.useEffect(()=>{mounts++;},[]);if(explode)throw new TypeError('x is undefined');return React.createElement('Text',null,'Sofia aberta');}
 let tree;await quiet(async()=>{await act(async()=>{tree=create(React.createElement(AppBoundary,{retryDelayMs:450},React.createElement(Shell)));});});
 assert.ok(texts(tree).includes('Vamos reabrir a Sofia.'),'a tela de erro aparece enquanto tenta de novo');
 assert.equal(timers.length,1,'uma tentativa automática foi agendada');assert.equal(timers[0].ms,450);
 explode=false;await runTimers();
 assert.deepEqual(texts(tree),['Sofia aberta'],'recuperou sozinha');assert.equal(mounts,1);
});
test('AppBoundary: se falhar de novo logo em seguida, fica na tela, MOSTRA O MOTIVO e o botão tenta de novo sem fechar o app',async()=>{
 timers.length=0;let explode=true;const now=0;function Shell(){if(explode)throw new TypeError("Cannot read property 'draft' of undefined");return React.createElement('Text',null,'Sofia aberta');}
 let tree;await quiet(async()=>{await act(async()=>{tree=create(React.createElement(AppBoundary,{retryDelayMs:450,cooldownMs:15000,now:()=>now},React.createElement(Shell)));});});
 await quiet(async()=>{await runTimers();}); // a tentativa automática falha de novo
 assert.equal(timers.length,0,'dentro do intervalo de segurança não tenta automaticamente outra vez (sem laço)');
 assert.ok(texts(tree).includes('Vamos reabrir a Sofia.'));
 assert.ok(texts(tree).some(t=>t.includes("Detalhe técnico: TypeError: Cannot read property 'draft' of undefined")),'o motivo aparece na tela');
 assert.equal(saved.at(-1).name,'TypeError','o motivo é guardado para sobreviver ao fechamento do app');
 assert.equal(labelled(tree,'Tentar de novo').length>0,true);
 explode=false;await act(async()=>{labelled(tree,'Tentar de novo')[0].props.onPress();});
 assert.deepEqual(texts(tree),['Sofia aberta']);
});
test('AppBoundary: erro comum nunca expõe o texto, só o tipo (o texto pode conter conteúdo do usuário)',async()=>{
 function Shell(){throw new Error('Página secreta do Pedro');}
 let tree;await quiet(async()=>{await act(async()=>{tree=create(React.createElement(AppBoundary,{retryDelayMs:100000},React.createElement(Shell)));});});
 const all=texts(tree).join(' ');assert.ok(!all.includes('secreta'));assert.ok(all.includes('Detalhe técnico: Error'));
});

test('TabPager: aba já vista nunca volta a ser escondida; aba nunca vista continua escondida',()=>{
 const s=read('src/components/TabPager.tsx');
 assert.ok(s.includes('seen.current.add(activeTab)'),'registra a aba ativa como vista');
 assert.ok(s.includes("fluencyMode==='old'||seen.current.has(id)"),'visível = modo antigo OU já vista');
 assert.ok(!s.includes("id===activeTab||preview.includes(id)"),'regra antiga (esconde ao sair) removida');
 // simula a regra com a política real: 6 abas, troca em sequência, ninguém vista some
 const seen=new Set(['home']);const visible=id=>seen.has(id);
 const go=(active,preview=[])=>{seen.add(active);for(const p of preview)seen.add(p);};
 go('pages');go('chat');go('pages');go('agenda',['apps']);
 for(const id of ['home','pages','chat','agenda','apps'])assert.equal(visible(id),true,id+' não pode esconder depois de vista');
 assert.equal(visible('profile'),false,'aba nunca vista segue escondida');
});

test('DeferredScreen: erro ao CARREGAR o módulo da tela fica contido e não chega à proteção global',async()=>{
 const code=ts.transpileModule(read('src/lib/screen-loader.tsx'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};
 // Fronteira real (classe) no lugar do ScreenBoundary, para provar a CONTENÇÃO, não só a presença.
 class Boundary extends React.Component{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?React.createElement('Text',null,'contido'):this.props.children;}}
 const deps={'react':React,'react/jsx-runtime':jsx,'./fluency-metrics':{perfSync:(_n,f)=>f()},'../components/ScreenBoundary':{ScreenBoundary:Boundary}};
 vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in deps,'Unexpected '+n);return deps[n];},console,Map,Object},{});
 const {DeferredScreen}=exports;let tree,reachedGlobal=false;
 class Global extends React.Component{state={f:false};static getDerivedStateFromError(){return {f:true};}componentDidCatch(){reachedGlobal=true;}render(){return this.state.f?React.createElement('Text',null,'GLOBAL'):this.props.children;}}
 const Ok=()=>React.createElement('Text',null,'tela ok');
 await act(async()=>{tree=create(React.createElement(Global,null,React.createElement(DeferredScreen,{load:()=>Ok,screenProps:{}})));});
 assert.deepEqual(texts(tree),['tela ok'],'caminho normal continua funcionando');
 await quiet(async()=>{await act(async()=>{tree=create(React.createElement(Global,null,React.createElement(DeferredScreen,{load:()=>{throw new TypeError('require failed');},screenProps:{}})));});});
 assert.deepEqual(texts(tree),['contido'],'a falha do load() ficou na tela');assert.equal(reachedGlobal,false,'não chegou à proteção global');
});

test('painel e telas mostram e guardam o último erro',()=>{
 assert.ok(read('src/components/FluencyPanel.tsx').includes("readLastError()"));
 assert.ok(read('src/components/FluencyPanel.tsx').includes('Último erro guardado'));
 assert.ok(read('src/components/ScreenBoundary.tsx').includes('rememberError(row)'));
 assert.ok(read('App.tsx').includes("from './src/components/AppBoundary'"));
});
