// 0.3.231: Historico por mes no lugar do Extrato do banco; mes que passou fecha (nada entra nem muda).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const s=fs.readFileSync(path.join(__dirname,'..','src/screens/Finance.tsx'),'utf8');
test('a aba Extrato do banco virou Historico (meses fechados pelo nome; abrir mostra o mes)',()=>{
  assert.ok(s.includes("options={[{value: 'app' as const, label: 'Lançamentos'}, {value: 'months' as const, label: 'Histórico'}]}"));
  assert.ok(!s.includes("label: 'Extrato do banco'"),'sem a aba antiga');
  assert.ok(!s.includes('label="Importar extrato (OFX ou CSV)"'),'sem importar para um lugar que nao aparece mais');
  assert.ok(s.includes("onPress={() => setOpenMonth(open ? '' : m)}")&&s.includes('{monthLabel(m)}'),'mes pelo nome, abre e fecha');
  assert.ok(s.includes("onPress={() => appAlert('Mês fechado', CLOSED_MSG)}"),'no Historico, so consulta');
});
test('regra do mes fechado: so o que ja passou fecha; o mes atual e os seguintes ficam abertos',()=>{
  const fn=s.match(/function isClosedMonth\(m: string\) \{[^}]*\}/)[0];
  const ctx={todayISO:()=>'2026-10-25',monthOf:d=>String(d).slice(0,7)};vm.createContext(ctx);vm.runInContext(fn.replace(': string',''),ctx);
  assert.equal(ctx.isClosedMonth('2026-09'),true);assert.equal(ctx.isClosedMonth('2025-12'),true);
  assert.equal(ctx.isClosedMonth('2026-10'),false,'mes atual aberto');assert.equal(ctx.isClosedMonth('2026-11'),false,'proximo aberto');
  assert.equal(ctx.isClosedMonth(''),false);
});
test('nada entra nem muda em mes fechado: criar, mudar a data para la, editar, apagar, editar na lista',()=>{
  assert.ok(s.includes("if (isClosedMonth(monthOf(date)) || (tx.entity && !tx.virtual && tx.date && isClosedMonth(monthOf(tx.date)))) { setError(CLOSED_MSG); return; }"),'editor: criar/mover/editar');
  assert.ok(s.includes("if (tx.date && !tx.virtual && isClosedMonth(monthOf(tx.date))) { setError(CLOSED_MSG); return; }"),'editor: apagar');
  assert.ok(s.includes("if (isClosedMonth(monthOf(t.date))) { appAlert('Mês fechado', CLOSED_MSG); return; }"),'lista de Receitas/Despesas');
  assert.ok(s.includes("if(repeat!=='monthly'&&!(tx&&(tx.virtual||tx.seriesId||tx.recurrence==='monthly'))&&isClosedMonth(monthOf(date))){setError(CLOSED_MSG);return;}"),'Contas: avulsa nova em mes fechado');
  assert.ok(s.includes('já fechou — só consulta'),'aviso em Lancamentos quando o mes escolhido ja fechou');
});
