// 0.3.225: previsto pela regra do Pedro, voltar ao topo, data do pagamento, editar aporte, salvar sem tela cortada,
// edicao na hora, controle sem esqueleto eterno, remover tarefa, widget direto no modulo.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('0.3.225: previsto = salario + receitas - despesas (pagas ou nao) - faturas - aporte do ciclo, sem o Saldo',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('const f = simpleForecast(d.txs, d.cards, r, accountId, today, aporteInCycle(r));'));
  assert.ok(s.includes('return Math.round(Math.max(due, done) * 100) / 100;'),'aporte do ciclo conta como feito');
  assert.ok(!s.includes("['Saldo agora', forecastP.saldo"),'nao usa o Saldo');
});
test('0.3.225: simpleForecast nao soma o saldo e conta pagas e nao pagas',()=>{
  const lib=read('src/lib/finance.ts');
  assert.ok(lib.includes("left: round2(income - expense - card - ap)"));
});
test('0.3.225: voltar ao topo; data do pagamento; editar aporte; salvar fecha antes de recarregar; edicao na hora; controle',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("setTimeout(() => mainScroll.current?.scrollTo({y: 0, animated: false}), 0);return;}"),'voltar no topo');
  assert.ok(s.includes('paid_at: todayISO()')&&s.includes("const histDate = (t: Tx) => t.paid && t.paidAt ? t.paidAt : t.date;"),'historico no dia do pagamento');
  assert.ok(!s.includes("onPress={() => { setAporteEdit(monthAporte); setReserveHistoryOpen(true); }}"),'0.3.226: sem edicao duplicada fora da meta');
  assert.ok(s.includes('Keyboard.dismiss(); setAdjusting(false); onClose(); afterSheet(() => { void reload?.(); });'),'fecha e depois recarrega');
  assert.ok(s.includes('onOptimistic(tx.id, {kind, amount: value, desc: title, date,'),'valor e totais na hora');
  assert.ok(s.includes('{!fresh && !future && !failed ? <ShimmerGroup>'),'sem esqueleto eterno');
});
test('0.3.225: remover tarefa na folha de edicao; widget abre direto no modulo',()=>{
  const q=read('src/components/TaskQuickSchedule.tsx'),w=read('src/screens/Workspace.tsx'),h=read('src/screens/Home.tsx');
  assert.ok(q.includes('Remover tarefa')&&q.includes('await api.deleteTask(task.id);onRemoved(task.id);'));
  assert.ok(h.includes('onRemoved={id=>{setTasks(prev=>prev.filter(x=>x.id!==id));setQuick(null);}}'));
  assert.ok(w.includes("[module,setModule]=useState(()=>openModuleKey&&"),'nasce no modulo');
});
