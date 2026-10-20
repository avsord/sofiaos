'use strict';
// 0.3.160: evolucao do guardado nos Relatorios, filtros por categorias ja usadas, sem o cartao de analise.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function base(){
  const f=load('src/lib/finance.ts');
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:0,include_total:true}});
  const tx=(id,kind,amount,date)=>f.toTx({id,kind:'fin_tx',title:id,state:'active',data:{kind,amount,date,account_id:'a1',paid:true,category:'Outros',recurrence:'none'}});
  const reserve=f.toGoal({id:'g1',kind:'fin_goal',title:'Guardado',state:'active',data:{role:'reserve',saved:15000}});
  const mv=(id,dir,amount,date)=>f.toReserveMove({id,kind:'fin_reserve_move',title:id,state:'active',data:{goal_id:'g1',direction:dir,amount,date}});
  return {f,acc,tx,reserve,mv};
}
test('evolucao do guardado: valor inicial + aportes - retiradas ate cada dia',()=>{
  const {f,reserve,mv}=base();
  const s=f.reserveSeries(reserve,[mv('a','in',4000,'2026-10-05'),mv('b','out',1000,'2026-10-10')],'2026-10','2026-10-12');
  const at=d=>s[d-1].v;
  assert.equal(s.length,12);assert.equal(at(1),15000);assert.equal(at(5),19000);assert.equal(at(9),19000);assert.equal(at(10),18000);assert.equal(at(12),18000);
});
test('saldo do mes desconta o que ja foi guardado, igual ao Saldo geral do Resumo',()=>{
  const {f,acc,tx,mv}=base();
  const txs=[tx('r','income',6000,'2026-10-01')];
  const sem=f.balanceSeries([acc],txs,'2026-10');
  const com=f.balanceSeries([acc],txs,'2026-10',{goalId:'g1',moves:[mv('a','in',4000,'2026-10-05')]});
  const hoje=(arr)=>arr[arr.length-1].v;
  assert.equal(sem[0].v,6000);assert.equal(com[0].v,6000,'antes do aporte nada muda');
  if(com.length>=6){assert.equal(com[5].v,2000,'depois de guardar 4.000 o saldo geral cai');}
  assert.ok(hoje(com)<=hoje(sem));
});
test('relatorios: guardado ao lado do saldo e sem o cartao de analise da Sofia',()=>{
  const s=read('src/screens/Finance.tsx');
  const rep=s.slice(s.indexOf('function ReportsTab('),s.indexOf('// ============================ CONTAS E CARTÕES'));
  assert.ok(rep.includes('Evolução do guardado no mês'));assert.ok(rep.includes('Evolução do saldo no mês'));
  assert.ok(!rep.includes('Análise da Sofia'),'cartao saiu');assert.ok(!rep.includes('financeInsights'));
});
test('filtro do historico: categorias que realmente existem, sem campo de digitar',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(!s.includes('placeholder="Buscar por descrição ou categoria"'));assert.ok(!s.includes('accessibilityLabel="Buscar lançamento"'));
  assert.ok(s.includes('const catPresets = useMemo('));assert.ok(s.includes("{catPresets.length ? <Chips scroll value={activeCat}"));
  assert.ok(s.includes("{value: '', label: 'Todas as categorias'}"));assert.ok(s.includes('{hasAnyTx ? <IconButton name="filter"'));
  // presets vem so do que foi usado: nenhuma lista fixa de nomes
  const block=s.slice(s.indexOf('const catPresets = useMemo('),s.indexOf('const activeCat'));
  assert.ok(block.includes('for (const t of d.txs)'));assert.ok(!/Alimenta|Mercado|Transporte|Lazer/.test(block));
});
test('0.3.194: relatorios recomecam a partir de hoje sem apagar nada; graficos de saldo seguem com o valor real',()=>{
  const {f,acc,tx}=base();
  const a=f.toAccount({...acc.entity,data:{...acc.entity.data,report_start:'2026-10-19'}});
  const txs=[tx('antes','expense',500,'2026-10-02'),tx('depois','expense',80,'2026-10-20')];
  const since=f.sinceReportStart([a],txs);
  assert.deepEqual(since.map(t=>t.id),['depois'],'so o que veio depois do ponto de partida entra nos relatorios');
  assert.equal(f.sinceReportStart([acc],txs).length,2,'sem ponto de partida: todo o historico');
  const s=read('src/screens/Finance.tsx');
  assert.ok(!s.includes('Recomeçar de hoje</Text>'),'0.3.212: o recomecar saiu');
  assert.ok(s.includes('Nada é apagado: os lançamentos de antes continuam no Histórico e no Saldo'));
  assert.ok(s.includes('bal: fromStart(balanceSeries(full.accounts, full.txs, month'),'saldo do grafico com o historico inteiro');
});
