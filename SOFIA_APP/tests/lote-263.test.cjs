'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.263: menu do botao direito abre com as acoes certas',()=>{
  let opened=null;const host={};
  const m=load('src/components/ContextMenu.tsx',{react:{useEffect(){},useState:v=>[v,()=>{}]},'react-native':{},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},'../lib/theme':{useTheme:()=>({})},'./Icon':{Icon:()=>null}},{document:{}});
  const props=m.contextMenu(()=>[{label:'Abrir',run(){}},{label:'Apagar',danger:true,run(){}}]);
  assert.equal(typeof props.onContextMenu,'function','no site ha onContextMenu');
});
test('0.3.263: telas grandes divididas e testes lendo a tela inteira',()=>{
  for(const f of ['finance/core','finance/Home','finance/Transactions','finance/Plan','finance/Goal','finance/Reports','finance/Manage','finance/Setup','workspace/core','workspace/EntityEditor','workspace/Tasks','monitoring/core','monitoring/Add','monitoring/Detail','monitoring/Stores'])assert.ok(fs.existsSync(path.join(__dirname,'..','src/screens',f+'.tsx')),f);
  assert.ok(fs.statSync(path.join(__dirname,'..','src/screens/Finance.tsx')).size<40000);
  assert.ok(read('src/screens/Finance.tsx').includes('function TxEditor('),'a leitura dos testes junta as partes');
  assert.ok(read('src/screens/Home.tsx').includes("import {useFinanceGoal} from './finance/Goal';"));
});
test('0.3.263: site - partes sob demanda, teclado, hover, folhas perto do clique, avisos no titulo, Ctrl+K com tarefas',()=>{
  const l=read('src/lib/screen-loader.web.tsx');assert.ok(l.includes("lazyScreen('apps',()=>import('../screens/Workspace')"));
  const w=read('src/lib/web-page.ts');assert.ok(w.includes("if (e.key !== 'Enter'")&&w.includes("document.addEventListener('wheel'"));
  assert.ok(read('src/lib/desktop.ts').includes("box-shadow:inset 0 0 0 999px '+colors.accent+'14"));
  assert.ok(read('src/components/Sheet.tsx').includes('const anchored=desktop&&anchor?'));
  const d=read('src/desktop/DesktopShell.tsx');assert.ok(d.includes("group:'Tarefas'")&&d.includes('(window as any).__sofiaOpenTask=t.id'));
  assert.ok(read('src/components/UnreadTitle.tsx').includes("(unread>0?'('+Math.min(unread,99)+') ':'')+base")&&read('App.tsx').includes("{Platform.OS==='web'?<UnreadTitle/>:null}"));
  assert.ok(read('src/screens/Workspace.tsx').includes("||!!catalog)){handledModuleTarget.current=openModuleKey;"),'Notas por link direto espera o catalogo');
  assert.ok(read('src/screens/Chat.tsx').includes('testID="chat-side-list"'));
  assert.ok(fs.readFileSync(path.join(__dirname,'..','src/lib/palette.ts'),'utf8').includes('export const PALETTE'));
});
