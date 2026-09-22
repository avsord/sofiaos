'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v79+: seção de aplicativos usa nome curto e versão pública consistente',()=>{
  const H=read('public/index.html'),cfg=read('src/config/sofia.js'),pkg=JSON.parse(read('package.json'));
  assert.match(H,/>\s*(?:CENTRAL|APPS)<\/span>/);assert.doesNotMatch(H,/CENTRAL DE APLICATIVOS/);
  const version=Number((cfg.match(/VERSION = '(\d+)\.0\.0'/)||[])[1]);assert.ok(version>=79);assert.match(H,new RegExp('Sofia OS · v'+version));assert.match(H,new RegExp('style\\.css\\?v='+version));assert.match(H,new RegExp('app\\.js\\?v='+version));assert.match(H,new RegExp('Core v'+version));assert.ok(Number(pkg.version.split('.')[1])>=30);
});

test('v79: exclusões normais não disparam toast global de sucesso',()=>{
  const A=read('public/app.js');
  assert.doesNotMatch(A,/notify\('Registro excluído\.'/);assert.doesNotMatch(A,/notify\('Tarefa excluída\.'/);assert.doesNotMatch(A,/Página excluída\.\'\)/);
});

test('v79: Resumo preserva viewport quando conversa acima muda',()=>{
  const A=read('public/app.js');
  assert.match(A,/function captureStartViewportAnchor\(\)/);assert.match(A,/function restoreStartViewportAnchor\(anchor/);assert.match(A,/const anchor=captureStartViewportAnchor\(\)/);assert.match(A,/restoreStartViewportAnchor\(anchor\)/);
});

test('v79: página é mais larga e tabelas mantêm scroll horizontal local',()=>{
  const C=read('public/style.css');
  assert.match(C,/width:min\(1080px,calc\(100% - 64px\)\)!important/);
  assert.match(C,/\.collection-block\{[\s\S]*?overflow:hidden!important/);
  assert.match(C,/\.collection-body\{[\s\S]*?overflow-x:auto!important/);
  assert.match(C,/scrollbar-gutter:stable both-edges!important/);
});

test('v79: drag acumulado continua travando scroll e aceita vizinhos',()=>{
  const A=read('public/app.js');
  assert.match(A,/function lockHomeWidgetDrag\(\)/);assert.match(A,/function keepHomeWidgetDragScroll\(\)/);assert.match(A,/const after=placeAfter===null\?from<to:Boolean\(placeAfter\)/);
});
