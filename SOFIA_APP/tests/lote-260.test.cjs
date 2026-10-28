'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');const j=x=>JSON.parse(JSON.stringify(x));
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.260: endereco por tela no site (ida e volta) e titulo da aba',()=>{
  const r=load('src/lib/web-route.ts');
  assert.equal(r.routeToPath({tab:'apps',module:'finance'}),'/apps/financas');assert.equal(r.routeToPath({tab:'agenda',module:''}),'/agenda');
  assert.deepEqual(j(r.pathToRoute('/apps/emails')),{tab:'apps',module:'mail'});assert.deepEqual(j(r.pathToRoute('/perfil/')),{tab:'profile',module:''});assert.equal(r.pathToRoute('/xyz'),null);
  assert.equal(r.routeTitle({tab:'apps',module:'finance'},3),'(3) Finanças · Sofia');
  const a=read('App.tsx');assert.ok(a.includes("window.addEventListener('popstate',onPop)")&&a.includes('document.title=routeTitle(route)'));
  const h=read('../src/core/http-handler.js');assert.ok(h.includes('const SPA_ROUTE=/^\\/(inicio|conversa|paginas|agenda|apps|avisos|perfil)'));
});
test('0.3.260: pagina base em portugues, previa de link e instalavel',()=>{
  const i=read('public/index.html');assert.ok(i.includes('<html lang="pt-BR">')&&i.includes('og:image')&&i.includes('rel="manifest"')&&i.includes('ative o JavaScript'));
  const m=JSON.parse(read('public/manifest.webmanifest'));assert.equal(m.lang,'pt-BR');assert.equal(m.start_url,'/inicio');
});
test('0.3.260: teclado e impressao de site, clique direito no lugar de segurar, tamanho de computador a partir de 900',()=>{
  const w=read('src/lib/web-page.ts');assert.ok(w.includes("PageDown: 0.85")&&w.includes('@media print'));
  assert.ok(read('src/components/DashboardWidgets.tsx').includes('{...rightClick(()=>{setSelected(key);onCreate?.(key);})}'));
  assert.ok(read('src/screens/Agenda.tsx').includes('{...rightClick(()=>{setSelected(day);if(catalog)create(day);})}'));
  assert.ok(read('src/lib/desktop.ts').includes('export const DESKTOP_MIN=900;'));
  assert.ok(read('src/lib/desktop.ts').includes("'Clique com o botão direito em'"));
});
