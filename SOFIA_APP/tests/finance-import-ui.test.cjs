'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Lançamentos tem "Importar extrato": conta/cartão, arquivo, prévia marcável (duplicados desmarcados), confirmar e recarregar',()=>{
 const s=read('src/screens/Finance.tsx');
 for(const t of ['accessibilityLabel="Importar extrato"','function ImportSheet(',"DocumentPicker.getDocumentAsync({type: ['*/*']","api.financeImportPreview(file.text, target.type, target.id)","setChosen(new Set(r.items.filter(i => !i.duplicate && !i.skip).map(i => i.import_id)))","api.financeImportCommit(preview.filter(i => chosen.has(i.import_id)), target.type, target.id)","setImporting(false); await reload();"])assert.ok(s.includes(t),t);
 const api=read('src/lib/api.ts');assert.ok(api.includes("'/md/finance/import'")&&api.includes("'/md/finance/import/commit'"));
});
