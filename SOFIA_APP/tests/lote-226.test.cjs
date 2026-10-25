// 0.3.226: editar/apagar itens dentro de Receitas e Despesas atualiza na hora (item, total, Historico); Contas grava por
// tras; ajustar o valor guardado dentro de Editar meta (sem mexer no Saldo), sem a edicao duplicada fora.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','src/screens/Finance.tsx'),'utf8');
test('0.3.226: itens de Receitas/Despesas editam e apagam ali dentro, na hora',()=>{
  assert.ok(s.includes('Keyboard.dismiss(); onPatch(t.id, {amount: v}); setRowEdit(null);'),'valor muda na hora');
  assert.ok(s.includes("onPress: () => { Keyboard.dismiss(); onRemove(t.id); setRowEdit(null);"),'apagar some na hora');
  assert.ok(s.includes('<HomeTab onPatchTx={patchTx} onRemoveTx={removeTx}')&&s.includes('onPatch={onPatchTx} onRemove={onRemoveTx}'),'chega na lista');
  assert.ok(s.includes('const removeTx = useCallback((id: string) => setData(prev => prev ? {...prev, txs: prev.txs.filter(x => x.id !== id)} : prev), []);'),'total e Historico saem do mesmo dado');
});
test('0.3.226: editor completo apaga na hora; Contas grava por tras',()=>{
  assert.ok(s.includes('onOptimistic={patchTx} onOptimisticRemove={removeTx}'));
  assert.ok(s.includes("onOptimistic={(t, replaceId) => { setData(prev => prev ? {...prev, txs: replaceId ? prev.txs.map(x => x.id === replaceId ? t : x) : [...prev.txs, t]} : prev);"),'Contas na hora');
});
test('0.3.226: Valor guardado hoje dentro de Editar meta, sem mexer no Saldo',()=>{
  assert.ok(s.includes("input('Valor guardado hoje', savedNow, setSavedNow, 'Ex.: 19.000')"));
  assert.ok(s.includes('if (Math.abs(want - split.saved) >= 0.005) savedBase = {saved: Math.round((want - net) * 100) / 100};'),'base nova = valor - movimentos');
  assert.ok(!s.includes('0.3.225: aporte do mes ja feito'),'sem o cartao duplicado fora');
});
