'use strict';
// Finanças demorava para abrir: agora 1 pedido só, abre na hora com a última
// versão guardada (criptografada) e as contas pesadas só recalculam quando os dados mudam.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const fin=fs.readFileSync(path.join(__dirname,'../src/screens/Finance.tsx'),'utf8'),api=fs.readFileSync(path.join(__dirname,'../src/lib/api.ts'),'utf8');
test('um pedido só ao servidor, com volta para o modo antigo se o servidor não tiver a rota',()=>{
 assert.ok(api.includes("financeBundle() { return this.request<"));assert.ok(fin.includes('await api.financeBundle()'));
 assert.ok(fin.includes("(e as any)?.status !== 404"),'só cai no modo antigo em 404, não esconde outros erros');
});
test('abre com o guardado e atualiza por trás; guarda só no armazenamento criptografado',()=>{
 assert.ok(fin.includes('setData(d => d || toData(all))'),'o guardado não sobrescreve dado mais novo');
 assert.ok(fin.includes('encryptedStorage.read(')&&fin.includes('encryptedStorage.write('));
 assert.ok(!/AsyncStorage/.test(fin),'dinheiro nunca em armazenamento sem criptografia');
});
test('contas pesadas do Resumo e dos Relatórios só recalculam quando dados ou mês mudam',()=>{
 assert.ok(fin.includes('const {s, total, forecast, dues, budgets} = useMemo('));
 assert.ok(fin.includes('const {t6, s, prev, bal} = useMemo('));
});
