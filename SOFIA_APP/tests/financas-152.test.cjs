'use strict';
// 0.3.152: Resumo de Financas organizado - cartoes empilhados, historico logo abaixo, um botao +.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'..','src/screens/Finance.tsx'),'utf8');
test('Resumo: historico vem logo depois dos cartoes; cartoes de credito e vencimentos completos saem do Resumo',()=>{
  const home=s.slice(s.indexOf('function HomeTab('),s.indexOf('function DueRow('));
  assert.ok(!home.includes('<Title text="Próximos vencimentos"'));assert.ok(!home.includes('<Title text="Cartões"'));
  assert.ok(home.includes('<TxTab d={d}'));
  assert.ok(s.includes('>Histórico</Text>'));assert.ok(s.includes("(tools || activeCat || kind !== 'all' || status !== 'all') ?"),'filtros recolhidos');
});
test('topo compacto e um botao + com as opcoes de lancamento',()=>{
  assert.ok(!s.includes('SEU DINHEIRO, SEM SUSTO'));
  assert.ok(s.includes('accessibilityLabel="Novo lançamento"'));assert.ok(!s.includes('accessibilityLabel="Nova receita"'));
  assert.ok(s.includes("['transfer', '⇄ Transferência entre contas', c.accent]"));
});
