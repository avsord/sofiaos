const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
// Não compara versão: o CI reescreve app.json (delivery.cjs prepare) antes dos testes.
test('AGENTS.md aponta para o MASTER único e exige aprovação para publicar',()=>{
 const agents=read('AGENTS.md');
 assert.ok(agents.includes('docs/SOFIA_MASTER.md'));
 assert.ok(agents.includes('[approved-apk]'));
 assert.ok(agents.includes('Manter o MASTER vivo'));
 assert.ok(!agents.includes('implemente, valide e publique a atualização aplicável no mesmo trabalho'),'regra antiga de publicar sem aprovação voltou');
});
test('MASTER mantém as seções que outros agentes dependem',()=>{
 const master=read('docs/SOFIA_MASTER.md');
 for(const s of ['## 3. Estado vivo','## 7. Decisões fechadas','## 8. Regras','## 9. Pendências','## 10. Diário de rodadas'])assert.ok(master.includes(s),'falta seção: '+s);
 const diary=master.slice(master.indexOf('## 10. Diário de rodadas'));
 assert.ok((diary.match(/^\| \d{4}-\d{2}-\d{2} \|/gm)||[]).length>=1,'diário sem nenhuma linha datada');
});
test('o MASTER não grava HEAD fixo, que ficaria velho',()=>{
 const live=read('docs/SOFIA_MASTER.md').split('## 3. Estado vivo')[1].split('## 4.')[0];
 assert.ok(!/HEAD[^\n]*`[0-9a-f]{7,40}`/.test(live));
});
