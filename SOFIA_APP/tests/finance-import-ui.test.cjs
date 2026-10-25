'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('importacao de extrato continua no codigo (botao saiu na 0.3.231): conta/cartão, arquivo, prévia marcável (duplicados desmarcados), confirmar e recarregar',()=>{
 const s=read('src/screens/Finance.tsx');
 // 0.3.231: o extrato do banco virou o Historico por mes; o botao de importar saiu da tela (a importacao continua no codigo)
 assert.ok(!s.includes('label="Importar extrato (OFX ou CSV)"'));
 for(const t of ['function ImportSheet(',"DocumentPicker.getDocumentAsync({type: ['*/*']","api.financeImportPreview(file.text, target.type, target.id)","setChosen(new Set(r.items.filter(i => i.checked !== false && !i.duplicate && !i.skip).map(i => i.import_id)))","api.financeImportCommit(preview.filter(i => chosen.has(i.import_id)), target.type, target.id)","setImporting(false); await reload();"])assert.ok(s.includes(t),t);
 const api=read('src/lib/api.ts');assert.ok(api.includes("'/md/finance/import'")&&api.includes("'/md/finance/import/commit'"));
});
