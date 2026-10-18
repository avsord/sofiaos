'use strict';
// 0.3.156: respiro padronizado em Financas - 20 nas margens, 16 entre blocos, 18/14 dentro do cartao.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'..','src/screens/Finance.tsx'),'utf8');
test('margens e espaco entre blocos iguais no cabecalho, abas e lista',()=>{
  assert.ok(s.includes("contentContainerStyle={{paddingHorizontal: 20, paddingTop: 2, paddingBottom: insets.bottom + 110, gap: 16}}"));
  assert.ok(s.includes("<View style={{paddingHorizontal: 20, paddingBottom: 14}}>"),'abas com a mesma margem e respiro antes do conteudo');
  assert.ok(s.includes("alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, gap: 8}}"),'linha conta/mes alinhada com o resto');
});
test('cartoes e linhas com respiro interno coerente',()=>{
  assert.ok(s.includes("borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 18, gap: 14}"),'cartao padrao');
  assert.ok(s.includes("backgroundColor: c.accent, borderRadius: 24, padding: 20, gap: 16, elevation: 2"),'cartao do saldo');
  assert.ok(s.includes("borderRadius: 16, padding: 12, gap: 2}}><Text style={{color: c.onAccent + 'cc', fontSize: 11}}>↑ Receitas"),'caixas de receitas/despesas');
  assert.ok(s.includes("gap: 12, paddingVertical: 12, paddingHorizontal: 6, borderTopWidth: first ? 0 : 1"),'linha do extrato');
  assert.ok(s.includes("gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: color + '1a', opacity: pressed ? 0.7 : 1})}>"),'linha de vencimento (tinta da cor do estado, toda tocavel)');
});
