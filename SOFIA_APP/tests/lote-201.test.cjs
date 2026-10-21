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

test('0.3.202: foto do chat abre baixando pelo caminho do "Salvar" (autorizacao garantida) e mostra o motivo se falhar',()=>{
  const s=read('src/screens/Chat.tsx');
  assert.ok(s.includes("temp=await File.downloadFileAsync(source.uri,target,{headers:source.headers,idempotent:true});"));
  assert.ok(s.includes("Não consegui abrir a foto: {error}"),'motivo exato');
  assert.ok(s.includes("return()=>{alive=false;if(temp){try{temp.delete();}"),'ao fechar, a copia sai do celular');
  assert.ok(!/<Image source=\{api\.attachmentSource\(id\)\}/.test(s),'nao depende mais do cabecalho de autorizacao na Image');
});

test('0.3.207: depois de salvar uma conta, vai ao mes e ao lado (A pagar/A receber) dela, confirma onde ficou e avisa se o servidor nao devolveu',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("onSaved({id:saved.id,kind:flow,date:finalDate,title:name.trim()});"));
  assert.ok(s.includes("setMonth(monthOf(saved.date));setPendingSide(saved.kind==='income'?'receber':'pagar');navigateFinance('bills');"));
  assert.ok(s.includes("salvo em '+(saved.kind==='income'?'A receber':'A pagar')"));
  assert.ok(s.includes('mas o servidor ainda não devolveu a conta'),'diagnostico se nao voltar');
  assert.ok(s.includes("side={pendingSide} onSide={setPendingSide}"),'o lado escolhido nao volta sozinho para A pagar');
});

test('0.3.208: meta com progresso de 0 ate a meta, marcos e projecao (Relatorios e Inicio)',()=>{
  const g=require('./load-ts.cjs')('src/components/GoalProgress.tsx',{react:{},'react-native':{},'../lib/theme':{},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null}});
  const st=g.goalStats({name:'Reserva',saved:15000,target:40000,monthly:4000,deadline:'2027-06-30',today:'2026-10-20'});
  assert.equal(Math.round(st.pct*100),38);assert.equal(st.missing,25000);assert.equal(st.next,0.5);assert.equal(st.nextMissing,5000);
  assert.equal(st.reach,'2027-05','4 mil por mes: chega em maio');assert.equal(st.diff,1,'1 mes antes do prazo');
  assert.match(st.message,/Um quarto do caminho/);
  assert.match(g.goalStats({name:'',saved:40000,target:40000,monthly:0,deadline:'',today:'2026-10-20'}).message,/Meta batida/);
  const atras=g.goalStats({name:'',saved:1000,target:40000,monthly:500,deadline:'2027-06-30',today:'2026-10-20'});assert.ok(atras.diff<0&&atras.needed>4000,'atrasado: mostra quanto por mes precisa');
  const f=read('src/screens/Finance.tsx'),h=read('src/screens/Home.tsx');
  assert.ok(f.includes('{goal ? <GoalProgressCard g={goal} /> : null}'),'Relatorios');
  assert.ok(h.includes("<FinanceGoalHome api={api} onOpen={()=>onOpenModule?onOpenModule('finance'):navigate('apps')}/>"),'Inicio');
});

test('0.3.210: importar extrato - lista com altura maxima (rola por dentro) e botao Importar sempre visivel',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("<View style={{maxHeight: Math.round(Dimensions.get('window').height * 0.42)"),'a lista nao empurra o botao para fora da tela');
  assert.ok(s.includes('>Marcar todos</Text>')&&s.includes('>Desmarcar todos</Text>'));
  const i=s.indexOf("maxHeight: Math.round(Dimensions.get('window').height * 0.42)"),b=s.indexOf("<Button title={chosenItems.length ? 'Lançar ' + chosenItems.length",i);assert.ok(b>i,'botao logo depois da lista');
});

test('0.3.211: desfazer importacao na engrenagem e conferencia do Saldo item por item',()=>{
  const s=read('src/screens/Finance.tsx'),a=read('src/lib/api.ts');
  assert.ok(a.includes("financeImportUndo(targetId: string)"));
  assert.ok(s.includes('Desfazer importação de extrato</Text>')&&s.includes("api.financeImportUndo(acc ? acc.id : '')"));
  assert.ok(s.includes("'Extrato do saldo'")&&s.includes("run = Math.round((run + r.delta) * 100) / 100"),'saldo depois de cada item');
});

test('0.3.213: Financas reestruturadas - abas, Lancamentos com Extrato do banco (conciliacao), "+" com cinco entradas',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("[{value: 'home' as Tab, label: 'Resumo'}, {value: 'bills' as Tab, label: 'Contas'}, {value: 'cards' as Tab, label: 'Cartões'}, {value: 'reports' as Tab, label: 'Relatórios'}]"),'abas; historico de volta no Resumo');
  assert.ok(s.includes('function BankStatements(')&&s.includes("'falta no app'")&&s.includes('Acertar Saldo</Text>')&&s.includes("'lançado pelo extrato'"),'conciliacao');
  assert.ok(s.includes("api.financeStatement(file.text, target.id)"),'importar guarda o extrato a parte');
  assert.ok(s.includes("[['expense', '⏰ Conta a pagar', c.text], ['income', '⏰ Conta a receber', c.text]]"),'+ com conta a pagar e a receber');
  assert.ok(s.includes("statements: g('fin_statement')"));
});

test('0.3.214: Controle de gastos e o Saldo; 100% e o que havia no mes antes de comecar a gastar; historico no Resumo',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const tx=(id,amount,date)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind:'expense',amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none'}});
  const r=f.spendControl([tx('a',2529.58,'2026-10-11')],[],'',{start:'2026-10-01',end:'2026-10-31'},'a1',353.13);
  assert.equal(r.left,353.13,'o valor e o Saldo');assert.equal(r.available,2882.71,'saldo + tudo o que saiu no mes');assert.equal(Math.round(r.pct*100),12);
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("monthControl(d.txs, d.moves || [], reserve?.id || '', month, accountId, controlSaldo, manualStart)"));
  assert.ok(s.includes('<TxTab d={d} month={month} accountFilter="" setAccountFilter={() => undefined} onTx={onTx} api={api} reload={reload} />'),'historico de volta no Resumo');
  assert.ok(!s.includes("label: 'Lançamentos'}, {value: 'cards'"),'sem aba Lancamentos repetida');
});


test('0.3.214: Ajustar saldo com inicio do mes e atual; Controle compara so os dois (receita do mes fica so no atual)',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const tx=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none',...extra}});
  const r=f.monthControl([tx('g','expense',1596.02,'2026-10-11')],[],'','2026-10','a1',353.13,1949.15);
  assert.equal(r.available,1949.15,'100% = inicio do mes informado');assert.equal(r.left,353.13,'atual = Saldo');assert.equal(Math.round(r.pct*100),18);assert.equal(r.spent,1596.02);
  const sal=f.monthControl([tx('s','income',7821,'2026-10-25',{recurrence:'monthly'})],[],'','2026-10','a1',8174.13,1949.15);
  assert.equal(sal.available,1949.15,'salario (programada) NAO entra no inicio do mes');assert.equal(sal.left,8174.13,'entra so no atual');assert.ok(sal.pct>1,'passa de 100%');
  assert.equal(f.parseMonthStarts('{"2026-10":1949.15,"x":1}')['2026-10'],1949.15);
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('<Button title="Ajustar saldo" secondary')&&!s.includes('Ajustar saldo ao valor do banco'),'nome do botao');
  assert.ok(s.includes('accessibilityLabel="Saldo no início do mês"')&&s.includes('accessibilityLabel="Saldo atual"'),'dois valores');
  assert.ok(s.includes('month_starts_json: JSON.stringify(starts)'),'guarda o inicio do mes');
  assert.ok(s.includes('monthControl(d.txs, d.moves || [], reserve?.id || \'\', month, accountId, controlSaldo, manualStart)'),'controle usa o inicio do mes');
});

test('0.3.214: virada do mes - salario nao mexe no inicio; novembro comeca no saldo daquele momento; mes passado usa o saldo do ultimo dia dele',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const mk=(id,kind,amount,date)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none'}});
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:'1949.15',include_total:true}});
  const saldo=(t,upTo)=>f.totalBalance([acc],t,upTo),ctl=(t,m,s,man=null)=>f.monthControl(t,[],'',m,'a1',s,man);
  let t=[mk('a','expense',200,'2026-10-05'),mk('b','expense',500,'2026-10-12'),mk('sal','income',7821,'2026-10-25'),mk('c','expense',300,'2026-10-28')];
  assert.equal(ctl(t,'2026-10',saldo(t)).start,1949.15,'salario nao mexe no inicio do mes');
  const nov=ctl(t,'2026-11',saldo(t));assert.equal(nov.start,saldo(t),'novembro comeca no saldo daquele momento');assert.equal(Math.round(nov.pct*100),100);
  const t2=[...t,mk('d','expense',150,'2026-11-03')];
  assert.equal(ctl(t2,'2026-11',saldo(t2)).start,saldo(t),'gastar em novembro nao muda o inicio');
  const fim=f.balanceAsOf([acc],t2,[],'','2026-10-31');assert.equal(fim,saldo(t),'saldo no ultimo dia de outubro');
  const out=ctl(t2,'2026-10',fim);assert.equal(out.start,1949.15,'outubro visto depois: inicio certo');assert.equal(out.left,8770.15,'e o agora e o saldo de 31/10, nao o de hoje');
  assert.ok(read('src/screens/Finance.tsx').includes("month < monthOf(today) ? balanceAsOf("));
});

test('0.3.215: receita avulsa divide entre saldo e guardado; programada (salario) nao; a parte do saldo soma ao inicio do Controle',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const mk=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none',...extra}});
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:'1949.15',include_total:true}});
  const mv=(amount,date)=>({id:'m'+amount,goalId:'g1',direction:'in',amount,date,entity:{state:'active'}});
  const usable=(t,m)=>f.totalBalance([acc],t)-m.reduce((s,x)=>s+x.amount,0);
  const ctl=(t,m)=>f.monthControl(t,m,'g1','2026-10','a1',usable(t,m),null);
  let txs=[mk('g','expense',1000,'2026-10-11')],moves=[];
  const base=ctl(txs,moves);assert.equal(base.available,1949.15);assert.equal(base.spent,1000);
  txs=[...txs,mk('freela','income',1000,'2026-10-21',{reserve_part:300})];moves=[mv(300,'2026-10-21')];
  const fr=ctl(txs,moves);assert.equal(fr.extra,700,'so o que ficou no saldo');assert.equal(fr.available,2649.15,'soma ao valor inicial');assert.equal(fr.left,1649.15);assert.equal(fr.spent,1000,'o gasto nao muda');
  txs=[...txs,mk('salario','income',7821,'2026-10-25',{recurrence:'monthly'})];
  const sal=ctl(txs,moves);assert.equal(sal.available,2649.15,'salario (programada) NAO soma na base do mes');assert.equal(sal.left,9470.15,'entra no saldo');
  const venda=ctl([...txs,mk('venda','income',500,'2026-10-26')],moves);assert.equal(venda.extra,1200,'venda sem guardado: tudo no saldo');
  assert.equal(f.isOneOffIncome(mk('x','income',1,'2026-10-01')),true);assert.equal(f.isOneOffIncome(mk('x','income',1,'2026-10-01',{recurrence:'monthly'})),false);assert.equal(f.isOneOffIncome(mk('x','income',1,'2026-10-01',{series_id:'s'})),false);
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('Desta receita, quanto vai para o guardado? (R$)')&&s.includes('syncIncomeReserve(api, d, saved.id, goalForSplit.id, split, true, date, title)'),'lancamento de receita');
  assert.ok(s.includes("somou ' + show(b.extra) + ' de receita avulsa'"),'texto do Controle');
  assert.ok(f.balanceAsOf,'balanceAsOf continua existindo');
});

test('0.3.216: salario e aluguel (programadas) tambem dividem entre saldo e guardado, com o padrao do cadastro e a pergunta no Recebi',()=>{
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const mk=(id,kind,amount,date,extra={})=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'X',recurrence:'none',...extra}});
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:'1949.15',include_total:true}});
  const mv=(amount,date)=>({id:'m'+amount,goalId:'g1',direction:'in',amount,date,entity:{state:'active'}});
  const usable=(t,m)=>f.totalBalance([acc],t)-m.reduce((s,x)=>s+x.amount,0);
  const txs=[mk('gasto','expense',1000,'2026-10-11'),mk('salario','income',7821,'2026-10-25',{recurrence:'monthly',reserve_part:4000})],moves=[mv(4000,'2026-10-25')];
  const r=f.monthControl(txs,moves,'g1','2026-10','a1',usable(txs,moves),null);
  assert.equal(r.left,4770.15,'o saldo recebe so o que nao foi para o guardado (7821 - 4000)');
  assert.equal(r.available,1949.15,'a base do mes continua parada (programada so entra na virada)');
  assert.equal(r.extra,0);assert.equal(mk('s','income',100,'2026-10-01',{recurrence:'monthly',reserve_part:40}).reservePart,40,'o padrao fica na receita');
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('Desta receita, quanto vai para o guardado todo mês? (R$)')&&s.includes('Quanto vai para o guardado todo mês'),'cadastro todo mes');
  assert.ok(s.includes('reserve_part:reserveAmt>0?reserveAmt:\'\''),'padrao gravado na receita programada');
});

test('0.3.217: Recebi manda sozinho a parte do guardado (sem pergunta); editar o item atualiza o aporte; vale para avulsa e programada',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(!s.includes('Quanto desse valor vai para o guardado?')&&!s.includes('setSplitOpen'),'sem pergunta no Recebi');
  assert.ok(s.includes('async function receiveTx(')&&s.includes('void receiveTx(api, d, due.tx)')&&s.includes('void receiveTx(api, d, t)'),'Recebi (Contas e Historico) usa a parte ja cadastrada');
  assert.ok(s.includes('async function syncIncomeReserve(')&&s.includes('await api.deleteEntity(linked.entity.id)'),'aporte ligado acompanha: cria, ajusta, apaga');
  assert.ok(s.includes("syncIncomeReserve(api, d, savedTx.id, goalForSplit.id, editSplit, paid && !isCard, date, title)"),'editar a receita atualiza o aporte');
  assert.ok(s.includes("syncIncomeReserve(api,finance,saved.id,g.id,reserveAmt,!!data.paid,finalDate,name.trim())"),'editar a conta a receber atualiza o aporte');
  assert.ok(s.includes("syncIncomeReserve(api, d, tx.entity!.id, g.id, 0, false, tx.date || '', tx.desc || '')"),'desfazer o recebimento tira o aporte');
  assert.ok(s.includes("Desta receita, quanto vai para o guardado{repeat==='monthly'?' todo mês':''}? (R$)"),'campo para qualquer receita');
  const f=require('./load-ts.cjs')('src/lib/finance.ts');
  const t=f.toTx({id:'t',kind:'fin_tx',title:'Salário',state:'active',data:{kind:'income',amount:7821,date:'2026-09-25',account_id:'a1',paid:true,category:'Salário',recurrence:'monthly',reserve_part:4000}});
  const v=f.expandRecurring([t],'2026-10')[0];assert.equal(v.reservePart,4000,'a ocorrencia do mes herda a parte do guardado');
});

test('0.3.217: apagar ou desfazer uma receita que mandou parte para o guardado avisa o que acontece com o aporte',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("' que foi para o guardado também é apagada do guardado (só esse aporte; os seus outros aportes não mudam).'"),'apagar lancamento');
  assert.ok(s.includes("' que foi para o guardado também sai de lá até você receber de novo.'"),'desfazer recebimento');
  assert.ok(s.includes("' que foi para o guardado neste recebimento também é apagado.'"),'apagar conta a receber ja recebida');
});
