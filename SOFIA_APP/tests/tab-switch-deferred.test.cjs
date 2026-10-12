'use strict';
// Menus de baixo com atraso: a tela que entra/sai redesenhava inteira com o
// novo `active` ANTES do salto do paginador (100–230 ms por toque).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../src/lib/screen-loader.tsx'),'utf8');
const body=s.slice(s.indexOf('function DeferredBody('),s.indexOf('export const DeferredScreen'));
test('o active da tela é adiado: o commit do toque reaproveita a tela memorizada',()=>{
 assert.ok(body.includes('React.useDeferredValue(active)'));
 assert.ok(body.includes('{...screenProps,active:deferredActive}'));
 assert.ok(s.includes('React.memo(Bounded)'),'a tela memorizada é o que torna o primeiro commit leve');
});
test('mesma regra de props: só o active é adiado, o resto passa igual',()=>{
 const pick=(screenProps,deferredActive)=>{const active=screenProps.active;return active===undefined||Object.is(deferredActive,active)?screenProps:{...screenProps,active:deferredActive};};
 const api={},p={api,active:true,x:1};
 assert.equal(pick(p,true),p,'sem mudança: mesmo objeto');
 const d=pick(p,false);assert.equal(d.active,false);assert.equal(d.api,api);assert.equal(d.x,1);
 const noActive={api};assert.equal(pick(noActive,undefined),noActive,'telas sem active não mudam');
});
