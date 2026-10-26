'use strict';
// 0.3.240: a Meta da Inicio ja vem desenhada no PRIMEIRO quadro (antes nascia vazia, entrava no topo e empurrava a tela).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=require('./load-ts.cjs');const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const GW=load('src/lib/goal-widget.ts',{react:React,'./startup-snapshot':{GOAL_WIDGET_PATH:'/local/goal-widget'}});
const P='/local/goal-widget';
const fakeApi=(initial)=>{const store=new Map(initial?[[P,initial]]:[]);const writes=[];return {writes,store,cached:p=>store.get(p),rememberLocal:(p,v)=>{writes.push(JSON.parse(JSON.stringify(v)));store.set(p,v);}};};
const G={name:'Reserva',saved:19000,target:30000,monthly:900,deadline:'2027-06-30'};

test('pacote de abertura: a Meta entra no pacote pequeno e no cache, sem competir com dados reais',()=>{
  const m={};vm.runInNewContext(ts.transpileModule(read('src/lib/startup-snapshot.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:m,require:()=>({}),URL,Date,Math,JSON,Number,String,Set,Map,Array,Object,Infinity,encodeURIComponent,isFinite});
  assert.equal(m.GOAL_WIDGET_PATH,'/local/goal-widget');assert.equal(m.cacheableRead(m.GOAL_WIDGET_PATH),true);assert.equal(m.launchRead(m.GOAL_WIDGET_PATH),true);
  assert.equal(m.startupPriority(m.GOAL_WIDGET_PATH),m.startupPriority('/alguma/pagina/qualquer'),'nivel padrao');assert.ok(m.startupPriority(m.GOAL_WIDGET_PATH)>m.startupPriority('/tasks'));
});
test('leitura: nunca gravado -> desconhecido; "sem meta" gravado -> conhecido e vazio; lixo/formato antigo -> desconhecido',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(GW.readGoalWidget(fakeApi(null),'2026-10-26'))),{known:false,goal:null,hidden:false});
  const none=GW.readGoalWidget(fakeApi({v:1,goal:null,hidden:false}),'2026-10-26');assert.equal(none.known,true);assert.equal(none.goal,null);
  for(const bad of [{v:2,goal:G,hidden:false},{v:1,goal:{name:'x'},hidden:false},{v:1,goal:{...G,target:0},hidden:false},{v:1,goal:{...G,saved:'19000'},hidden:false},'texto'])
    assert.equal(GW.readGoalWidget(fakeApi(bad),'2026-10-26').known,false);
});
test('leitura: devolve os numeros com o DIA DE HOJE (o dia gravado nao vale amanha) e o "escondida"',()=>{
  const r=GW.readGoalWidget(fakeApi({v:1,goal:G,hidden:true}),'2026-10-26');
  assert.equal(r.goal.today,'2026-10-26');assert.equal(r.goal.saved,19000);assert.equal(r.hidden,true);
});
test('gravacao: junta goal e hidden sem apagar um ao gravar o outro; nunca grava o dia; igual nao regrava',()=>{
  const api=fakeApi(null);
  GW.writeGoalWidget(api,{hidden:true});GW.writeGoalWidget(api,{goal:{...G,today:'2026-10-26'}});
  assert.deepEqual(api.writes.at(-1),{v:1,goal:G,hidden:true},'goal e hidden convivem; sem "today"');
  const n=api.writes.length;GW.writeGoalWidget(api,{goal:{...G,today:'2027-01-01'}});GW.writeGoalWidget(api,{hidden:true});
  assert.equal(api.writes.length,n,'mesmos numeros (so o dia mudou) nao regravam');
  GW.writeGoalWidget(api,{goal:null});assert.deepEqual(api.writes.at(-1),{v:1,goal:null,hidden:true},'sem meta vira "conhecido e vazio"');
  const m=api.writes.length;GW.writeGoalWidget(api,{goal:{name:'x'}});assert.equal(api.writes.length,m,'valor invalido e ignorado');
});
test('PRIMEIRO QUADRO: com a Meta gravada, o primeiro render ja traz a Meta (nada de entrar depois)',()=>{
  const frames=[];function Probe({api}){const [g]=GW.useCachedGoal(api,'2026-10-26');frames.push(g);return null;}
  // frames[0] e o valor do PRIMEIRO render, o que o primeiro quadro desenha (nenhum efeito ou leitura assincrona entra antes dele)
  act(()=>{create(React.createElement(Probe,{api:fakeApi({v:1,goal:G,hidden:false})}));});
  assert.ok(frames[0],'a Meta esta no primeiro render');assert.equal(frames[0].saved,19000);assert.equal(frames[0].name,'Reserva');assert.equal(frames[0].today,'2026-10-26');
  const none=[];function Probe2({api}){const [g]=GW.useCachedGoal(api,'2026-10-26');none.push(g);return null;}
  act(()=>{create(React.createElement(Probe2,{api:fakeApi({v:1,goal:null,hidden:false})}));});assert.equal(none[0],null,'quem nao tem meta nao ganha nada no primeiro quadro');
});
test('leitura nova IGUAL nao redesenha (nem pisca); leitura diferente atualiza no lugar',async()=>{
  let renders=0,setG;function Probe({api}){const [g,s]=GW.useCachedGoal(api,'2026-10-26');setG=s;renders++;return null;}
  await act(async()=>{create(React.createElement(Probe,{api:fakeApi({v:1,goal:G,hidden:false})}));});
  const base=renders;
  await act(async()=>{setG(prev=>GW.keepIfSame(prev,{...G,today:'2026-10-27'}));});
  assert.equal(renders,base,'mesmos numeros: o React nem redesenha');
  await act(async()=>{setG(prev=>GW.keepIfSame(prev,{...G,today:'2026-10-26',saved:19500}));});
  assert.equal(renders,base+1,'numeros novos: uma atualizacao so');
});
test('Inicio e Financas: usam o ultimo estado, a leitura espera como as outras, e a ordem nao se mexe a toa',()=>{
  const h=read('src/screens/Home.tsx'),f=read('src/screens/Finance.tsx'),sw=read('src/components/SortableWidgets.tsx');
  assert.ok(h.includes('useState(()=>readGoalWidget(api).hidden)'),'"Meta escondida" nasce do ultimo estado, nao de false');
  assert.ok(h.includes('writeGoalWidget(api,{hidden})')&&h.includes('writeGoalWidget(api,{hidden:h})'),'grava ao mudar e migra quem ja tinha escondido');
  assert.ok(h.includes('useFinanceGoal(api,active&&launchVisible)'),'leitura de Financas so depois do primeiro quadro, como as outras');
  assert.ok(h.includes('prev.length===next.length&&prev.every((x,i)=>x===next[i])?prev:next'),'ordem igual vinda do servidor nao reordena');
  assert.ok(f.includes('useCachedGoal(api, todayISO())')&&f.includes('setG(prev => keepIfSame(prev, next)); writeGoalWidget(api, {goal: next});'));
  assert.ok(f.includes('scheduleIdleTask(() => { void loadAll(api, financeWindow(monthOf(todayISO()), \'home\'))'));
  assert.ok(!f.includes('useState<GoalNumbers | null>(null);\n  useEffect(() => { let live = true;'),'nao nasce mais vazio');
  assert.ok(sw.includes('setDraft(prev=>prev.length===order.length&&prev.every((x,i)=>x===order[i])?prev:order)'),'lista igual nao redesenha');
});
