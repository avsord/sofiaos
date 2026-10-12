'use strict';
// "Senhas de app" não existe em várias contas Google: o Gmail agora entra pela Conta Google, sem senha.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const mail=fs.readFileSync(path.join(__dirname,'../src/screens/Mail.tsx'),'utf8');
test('Gmail pela Conta Google é a primeira opção e não pede senha',()=>{
 const first=mail.slice(mail.indexOf('const PROVIDERS'),mail.indexOf('];',mail.indexOf('const PROVIDERS')));
 assert.ok(first.indexOf("value: 'gmail_google'")<first.indexOf("value: 'gmail'"),'aparece antes da senha de app');
 assert.ok(mail.includes("useState(String(account?.data.provider || 'gmail_google'))"),'já vem escolhida');
 assert.ok(mail.includes('{viaGoogle ? (')&&mail.includes(') : <Field label={account?.data.secret_set'),'sem campo de senha');
});
test('explica o que fazer quando a Conta Google não está conectada ou não tem o Gmail',()=>{
 assert.ok(mail.includes("Conecte primeiro a Conta Google em Perfil → Conta Google"));
 assert.ok(mail.includes('desconecte e conecte de novo para liberar o Gmail'));
});
