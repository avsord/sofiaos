'use strict';
// 0.3.248: no modo "Conta Google" a tela avisa quando o e-mail digitado nao e o da Conta Google conectada.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const m=fs.readFileSync(path.join(__dirname,'..','src/screens/Mail.tsx'),'utf8');
test('aviso: "Este modo não lê <e-mail>" quando o e-mail difere da Conta Google conectada, com o caminho certo',()=>{
  assert.ok(m.includes("viaGoogle && google?.email && address.trim() && address.trim().toLowerCase() !== String(google.email).toLowerCase()"));
  assert.ok(m.includes('Este modo não lê {address.trim()}')&&m.includes('escolha "Gmail (senha de app)" ou "Outro (IMAP)"'));
});
