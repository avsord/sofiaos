'use strict';
// Regressão da lentidão nos menus: uma função criada na hora dentro de
// screenProps faz o DeferredScreen achar que as props mudaram e a Início
// (com a mini agenda) redesenhava a cada toque no menu (90–230 ms cada).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');
test('nenhuma tela recebe função ou objeto criados na hora em screenProps',()=>{
 const blocks=[...app.matchAll(/screenProps=\{\{([^}]*)\}\}/g)].map(m=>m[1]);
 assert.ok(blocks.length>=5,'achou as telas');
 for(const b of blocks){
  assert.ok(!/:\s*\([^)]*\)\s*=>/.test(b),'função criada na hora: '+b.slice(0,120));
  assert.ok(!/:\s*\{/.test(b),'objeto criado na hora: '+b.slice(0,120));
 }
});
test('a Início usa o atalho estável do Monitoramento',()=>{assert.ok(app.includes('onOpenMonitoring:openMonitoringFromHome'));});
