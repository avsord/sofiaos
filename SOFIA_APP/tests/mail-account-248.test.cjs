'use strict';
// 0.3.248: no modo "Conta Google" a tela avisa quando o e-mail digitado nao e o da Conta Google conectada.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const m=fs.readFileSync(path.join(__dirname,'..','src/screens/Mail.tsx'),'utf8');
test('e-mail diferente da Conta Google do Perfil: mostra o caminho certo (0.3.257: Entrar com Google nesta conta)',()=>{
  assert.ok(m.includes("const needsOwnLogin = viaGoogle && google !== null && !!typed && !ownGoogle?.linked && !profileReads;"));
  assert.ok(m.includes('Entre com o Google de {typed}')&&m.includes("title={needsOwnLogin ? 'Entrar com Google'"));
});
