'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Listas, Biblioteca e Estudos carregam no mesmo estilo das telas novas (anel + linhas)',()=>{
 const s=read('src/screens/Workspace.tsx');assert.ok(!s.includes('Carregando registros…</Text>'));assert.ok(s.includes('<Spinner size={16} stroke={1.8}/><Text style={{color:c.muted,fontSize:13}}>Carregando registros</Text>'));assert.ok(s.includes('<LoadingLines rows={4}/>'));
});
test('mensagem de erro da conta de e-mail usa a cor do tema (certa em claro e escuro), não um vermelho fixo',()=>{
 assert.ok(!read('src/screens/Mail.tsx').includes("color: '#ff6b7a', fontSize: 12"));assert.ok(read('src/screens/Mail.tsx').includes('color: c.danger, fontSize: 12'));
});
