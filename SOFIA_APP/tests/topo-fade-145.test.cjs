'use strict';
// 0.3.145: Inicio, Agenda e Apps voltam ao topo depois de 10 s fora, AINDA ESCONDIDOS (sem salto visivel); fade de saida mais perceptivel.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('0.3.145: o scroll para o topo acontece no timer (tela escondida), nao ao voltar',()=>{
  const h=read('src/lib/return-to-top.ts');
  assert.ok(h.includes('export const RETURN_TO_TOP_MS=10000;'));
  assert.ok(h.includes("timer.current=setTimeout(()=>{timer.current=null;pending.current=true;ref.current?.scrollTo({y:0,animated:false});},ms);"));
  assert.ok(h.includes("if(timer.current){clearTimeout(timer.current);timer.current=null;}"),'voltar antes do prazo cancela');
});
test('0.3.145: Inicio, Agenda e Apps usam o mesmo comportamento',()=>{
  assert.ok(read('src/screens/Home.tsx').includes('const homeScroll=useReturnToTop(active);'));
  assert.ok(read('src/screens/Agenda.tsx').includes('const agendaScroll=useReturnToTop(active);'));
  assert.ok(read('src/screens/Agenda.tsx').includes('<ScrollView ref={agendaScroll}'));
  assert.ok(read('src/screens/Workspace.tsx').includes('const appsScroll=useReturnToTop(active);'));
  assert.ok(read('src/screens/Workspace.tsx').includes('<ScrollView ref={appsScroll}'));
});
test('0.3.145: fade entre a abertura e o app de 150 ms, dentro do limite do teste (<= 250 ms)',()=>{
  const k=read('plugins/native/SofiaLaunchOverlay.kt');
  assert.ok(k.includes('surface.animate().alpha(0f).setDuration(150L)'));
  assert.ok(k.includes('surface.postDelayed({ complete() }, 240L)'));
});
