'use strict';
// 0.3.201: lote de ajustes juntados pelo Pedro no WhatsApp.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('apagar regra de e-mail nao mostra mais "Cannot read property map of undefined"',()=>{
  const s=read('src/screens/Mail.tsx');
  assert.ok(s.includes('const failed = (r?.errors || []).map(e =>'));
  assert.ok(!/const failed = r\.errors\.map/.test(s));
});

test('editor de paginas e de notas: Enter nao faz o texto pular (campos crescem, so a pagina rola)',()=>{
  for(const f of ['src/screens/Pages.tsx','src/components/LeafEditor.tsx']){
    const s=read(f);const tags=[...s.matchAll(/<TextInput\b[^]*?\/>/g)].map(m=>m[0]).filter(t=>t.includes('multiline'));
    assert.ok(tags.length>0,f);for(const t of tags)assert.ok(t.includes('scrollEnabled={false}'),f+': '+t.slice(0,80));
  }
});
test('titulo do bloco criado por template (Kanban, Formulario, Notas) e editavel',()=>{
  const s=read('src/components/NativeCollectionBlock.tsx');
  assert.ok(s.includes('function BlockTitle(')&&s.includes("accessibilityLabel=\"Título do bloco\""));
  assert.ok(s.includes("commit(next,'collection-title:'+block.id)"));
});

test('arrastar paginas: so redesenha quando o destino muda (com folga na divisa) e a pagina desliza ate o lugar ao soltar',()=>{
  const s=read('src/components/PageTreeList.tsx');
  assert.ok(s.includes('if(same||(!next&&!prev))return;'),'sem redesenho a cada milimetro');
  assert.ok(s.includes('if(prev&&Math.abs(y-d.switchY)<8&&now-d.switchAt<90)return;'),'folga contra o pisca-pisca');
  assert.ok(s.includes('Animated.timing(pan,{toValue:{x:target.kind===\'inside\'?PAGE_INDENT:0,y:toY},duration:140'),'assenta suave');
  assert.ok(s.includes('const commit=()=>{void latest.current.onMove(d.page,target.parentId,target);finish();};'),'nova ordem e fim do arrastar no mesmo quadro');
});

test('notificacoes da agenda como no Google: varias, legado remind_minutes, rotulos e limite de 5',()=>{
  const r=require('./load-ts.cjs')('src/lib/agenda-reminders.ts');
  assert.equal(r.reminderOffsets({reminders_json:'[1440,10,10,120]'}).join(','),'10,120,1440','sem repetidos, em ordem');
  assert.equal(r.reminderOffsets({remind_minutes:30}).join(','),'30','compromisso antigo continua avisando');
  assert.equal(r.reminderOffsets({remind_minutes:''}).length,0);
  const f=r.reminderFields([2880,5,60,5,10080,1,3]);assert.equal(f.reminders_json,'[1,3,5,60,2880]','ate 5');assert.equal(f.remind_minutes,1,'o menor vai para o campo antigo');
  assert.equal(r.reminderFields([]).remind_minutes,'');
  assert.equal(r.reminderLabel(0),'No horário');assert.equal(r.reminderLabel(5),'5 minutos antes');assert.equal(r.reminderLabel(120),'2 horas antes');
  assert.equal(r.reminderLabel(1440),'1 dia antes');assert.equal(r.reminderLabel(5760),'4 dias antes');assert.equal(r.reminderLabel(10080),'1 semana antes');assert.equal(r.reminderLabel(90),'90 minutos antes');
  const n=read('src/lib/agenda-notifications.ts');assert.ok(n.includes("for(const minutes of (offsets.length?offsets:[0])){"),'um aviso por antecedencia');
  const w=read('src/screens/Workspace.tsx');assert.ok(w.includes("item.kind==='commitment'&&f.key==='remind_minutes'?<RemindersField"));
  const h=read('src/components/HomeCommitmentEditor.tsx');assert.ok(h.includes('<RemindersField data={reminders} onChange={setReminders}/>'));
});

test('busca de tarefas acha mesmo com letra errada (Inicio e app de Tarefas)',()=>{
  const fz=require('./load-ts.cjs')('src/lib/fuzzy.ts');
  const items=['Tomar duda','Dentista sexta','Comprar remédio','Ligar para a Carol','Limpeza de pele','Cabelo','Pagar DAS'];
  const q=s=>fz.fuzzyFilter(items,s,x=>x).join('|');
  assert.equal(q('duda'),'Tomar duda');assert.equal(q('dentsta'),'Dentista sexta');assert.equal(q('remedio'),'Comprar remédio');
  assert.equal(q('limpesa pele'),'Limpeza de pele');assert.equal(q('cabeo'),'Cabelo');assert.equal(q('pgar das'),'Pagar DAS');
  assert.equal(q('carro'),'','palavra diferente nao confunde');assert.equal(q(''),items.join('|'));
  const home=read('src/screens/Home.tsx');assert.ok(home.includes('placeholder="🔍 Buscar tarefa"'));assert.ok(home.includes('fuzzyFilter([...tasks]'));
  assert.ok(read('src/lib/task-filters.ts').includes("return fuzzyFilter(base,filter.query"));
});
test('tocar na tarefa programa dia, hora, lembrete e importancia (Inicio, app de Tarefas e Agenda)',()=>{
  const q=read('src/components/TaskQuickSchedule.tsx');
  for(const s of ['Hoje','Amanhã','Sem data','Escolher o dia','Sem horário','Lembrete','Importância','Ver detalhes','Tirar a data'])assert.ok(q.includes(s),s);
  assert.ok(q.includes("notifications:at&&reminder>=0?[String(reminder)]:[]"));
  assert.ok(read('src/screens/Home.tsx').includes('onPress={()=>setQuick(task)}'));
  assert.ok(read('src/screens/Workspace.tsx').includes("onPress={()=>{setError('');setQuick(t);}}"));
  const ag=read('src/screens/Agenda.tsx');assert.ok(ag.includes("if(item.kind==='task')"));assert.ok(ag.includes("item.kind==='task'?'Tarefa'"));
  assert.ok(read('src/components/HomeCommitmentEditor.tsx').includes('[google,setGoogle]=useState(true)'),'compromisso novo ja vai para o Google');
});

test('apps mudam de posicao: ordem guardada, apps novos no fim, setas nos limites nao quebram',()=>{
  const o=require('./load-ts.cjs')('src/lib/app-order.ts');
  const apps=[{id:'capsules'},{id:'tasks'},{id:'finance'},{id:'mail'}];
  assert.equal(o.orderApps(apps,[]).map(a=>a.id).join(','),'capsules,tasks,finance,mail','sem ordem: a padrao');
  assert.equal(o.orderApps(apps,['finance','capsules']).map(a=>a.id).join(','),'finance,capsules,tasks,mail','escolhidos primeiro, novos no fim');
  assert.equal(o.moveApp(['a','b','c'],'b',-1).join(','),'b,a,c');assert.equal(o.moveApp(['a','b','c'],'c',1).join(','),'a,b,c','no limite nao muda');
  const w=read('src/screens/Workspace.tsx');assert.ok(w.includes("onLongPress={()=>setOrganizing(true)}"));assert.ok(w.includes("AsyncStorage.setItem(APP_ORDER_KEY"));assert.ok(w.includes("{organizing?'Concluir':'Organizar'}"));
});

test('lembrete com alarme: tipo de aviso, canal de alarme, repeticao ate desligar, Desligar e Adiar',()=>{
  const n=read('src/lib/agenda-notifications.ts');
  assert.ok(n.includes("usage:Notifications.AndroidAudioUsage.ALARM")&&n.includes('bypassDnd:true'),'volume de alarme, passa pelo Nao perturbe');
  assert.ok(n.includes("const times=event.alarm==='ring'?ALARM_REPEATS:1;")&&n.includes('ALARM_REPEATS=10'),'ate desligar: repete por ate 10 minutos');
  assert.ok(n.includes("identifier:'desligar',buttonTitle:'Desligar'")&&n.includes("identifier:'adiar',buttonTitle:'Adiar 5 min'"));
  assert.ok(n.includes("if(dismissed.has(group))continue;"),'desligado nao volta a ser agendado');
  assert.ok(n.includes("response.actionIdentifier==='adiar'?5:0"));
  const r=read('src/components/RemindersField.tsx');assert.ok(r.includes("label:'Alarme até desligar'")&&r.includes("label:'Som de alarme'"));
  const app=JSON.parse(read('app.json'));const pl=app.expo.plugins.find(x=>Array.isArray(x)&&x[0]==='expo-notifications');assert.deepEqual(pl[1].sounds,['./assets/sounds/sofia_alarm.wav']);
  assert.ok(require('node:fs').statSync(require('node:path').join(__dirname,'..','assets/sounds/sofia_alarm.wav')).size>50000,'som de alarme no app');
});

test('Notas reestruturadas: pastas em cartoes, previa e data da nota, busca, acoes da pasta; dados antigos continuam',()=>{
  const nb=require('./load-ts.cjs')('src/components/NotebookBlock.tsx',{'./MotionModal':{},'../lib/leaf-document':{applyLeafPatch:(p,x)=>({...p,...x})},'./KeyboardViewport':{},'./LeafEditor':{},'react':{useMemo:()=>{},useRef:()=>{},useState:()=>[]},'react-native':{},'react-native-safe-area-context':{},'../lib/theme':{},'./UI':{},'./Sheet':{},'../lib/app-alert':{},'../lib/fuzzy':{fuzzyScore:()=>1},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null,Fragment:'F'}});
  assert.equal(nb.leafPreview({id:'1',title:'',content:'texto   antigo\nlinha'}),'texto antigo linha','nota antiga (so content)');
  assert.equal(nb.leafPreview({id:'2',title:'',content:'',blocks:[{id:'a',text:'Comprar pão',type:'todo',marks:[],checked:true},{id:'b',text:'Ligar',type:'todo',marks:[]}]}),'✓ Comprar pão · ☐ Ligar');
  const hoje=new Date().toISOString();assert.match(nb.leafStamp({id:'3',title:'',content:'',updated_at:hoje}),/^hoje, \d\d:\d\d$/);
  assert.equal(nb.leafStamp({id:'4',title:'',content:''}),'');
  const s=read('src/components/NotebookBlock.tsx');
  for(const t of ['＋ Pasta','＋ Nota','🔍 Buscar nas notas','Trocar ícone','Excluir pasta','Mover para outra pasta','Pasta vazia. Toque para criar a primeira nota.'])assert.ok(s.includes(t),t);
  assert.ok(s.includes("Array.isArray(data.notebooks)?data.notebooks:(data.rows||[])"),'le o formato antigo');
  assert.ok(s.includes("(p as Dated).updated_at=new Date().toISOString()"),'registra a ultima edicao');
});
