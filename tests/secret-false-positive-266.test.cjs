'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {rejectSecrets}=require('../src/core/util');
test('credencial: frases normais com "senha" passam; segredo de verdade continua bloqueado',()=>{
 for(const ok of ['Amanhã eu preciso comprar bag e inalador, e fazer sistema de diário com senha e conteúdo criptografado','preciso trocar a senha do banco amanhã','a senha é forte','senha: trocar amanhã','vou pintar a parede','PIN do cartão chegou pelo correio'])assert.doesNotThrow(()=>rejectSecrets(ok),ok);
 for(const bad of ['minha senha é Abc12345','senha: 123456','password=hunter2!','pin: 4417','sk-abcdefghijklmnopqrstuvwxyz123456'])assert.throws(()=>rejectSecrets(bad),/credencial/,bad);
});
