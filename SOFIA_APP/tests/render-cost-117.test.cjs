// 0.3.117: every render of a screen is measured and attributed to JS stalls as 'render:<name>'.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=require('./load-ts.cjs');const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('perfRender conta cada commit, soma o tempo e registra um evento atribuível',()=>{
 let t=0;const m=load('src/lib/fluency-metrics.ts',{'./idle-work':{idleWork:{records:()=>[]}}},{performance:{now:()=>t},setInterval:()=>0,clearInterval(){}});
 t=1000;m.perfStart();
 t=1100;m.perfRender('chat',1020);t=1500;m.perfRender('chat',1300);
 const r=m.perfReport().renders;
 assert.equal(r.chat.count,2);assert.equal(r.chat.totalMs,280);assert.equal(r.chat.maxMs,200);
});

test('useRenderCost mede todo render do componente, não só o primeiro (React real)',async()=>{
 const seen=[];
 const code=ts.transpileModule(read('src/lib/render-cost.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:n=>({react:React,'./fluency-metrics':{perfNow:()=>Date.now(),perfRender:(name,start)=>seen.push(name)}})[n]},{});
 let setN;function Screen(){exports.useRenderCost('pages');const [n,set]=React.useState(0);setN=set;return React.createElement('Text',null,String(n));}
 let tree;await act(async()=>{tree=create(React.createElement(Screen));});
 await act(async()=>{setN(1);});await act(async()=>{setN(2);});
 assert.deepEqual(seen,['pages','pages','pages'],'três renders, três medições');
});

test('todas as telas e o pager estão instrumentados; a leitura nativa da hidratação é medida',()=>{
 for(const [f,label] of [['App.tsx','app'],['src/components/TabPager.tsx','pager'],['src/screens/Home.tsx','home'],['src/screens/Chat.tsx','chat'],['src/screens/Pages.tsx','pages'],['src/screens/Agenda.tsx','agenda'],['src/screens/Workspace.tsx','apps'],['src/screens/Profile.tsx','profile'],['src/components/DashboardWidgets.tsx','home:mini-agenda'],['src/components/BackgroundServices.tsx','background-services']])
  assert.ok(read(f).includes(`useRenderCost('${label}')`),f+' -> '+label);
 assert.ok(read('src/lib/startup-snapshot.ts').includes("perfEvent('hidratar:read',t)"));
});
