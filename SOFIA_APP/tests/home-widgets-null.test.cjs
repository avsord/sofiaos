'use strict';
// Regressão da tela quebrada "Cannot read property 'filter' of null em Home":
// a lista de widgets em cache pode ser nula (servidor antigo/cache antigo) e a
// Início nunca pode chamar .filter sem conferir que é uma lista.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const home=fs.readFileSync(path.join(__dirname,'../src/screens/Home.tsx'),'utf8');
test('Início não chama .filter direto na lista de widgets',()=>{
 assert.ok(!/\?\.widgets\.filter\(/.test(home),'cache nulo derrubava a Início');
 assert.ok(!/\br\.widgets\.filter\(/.test(home),'resposta nula derrubava a Início');
 assert.ok((home.match(/Array\.isArray\(/g)||[]).length>=2);
});
test('o mesmo cálculo do estado inicial sobrevive a cache nulo, vazio, sem campo e válido',()=>{
 const init=cached=>(()=>{const w=cached?.widgets;return Array.isArray(w)?w.filter(x=>['monitoring','tasks','capsules'].includes(x)):null;})()||['monitoring','tasks'];
 assert.deepEqual(init({widgets:null}),['monitoring','tasks']);
 assert.deepEqual(init(undefined),['monitoring','tasks']);
 assert.deepEqual(init({}),['monitoring','tasks']);
 assert.deepEqual(init({widgets:['capsules','x']}),['capsules']);
 assert.ok(home.includes("(()=>{const w=api.cached<{widgets:string[]|null}>('/md/dashboard')?.widgets;return Array.isArray(w)?w.filter(x=>['monitoring','tasks','capsules'].includes(x)):null;})()||"),'o teste espelha o código real');
});
