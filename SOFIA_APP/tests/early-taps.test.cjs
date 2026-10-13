'use strict';
// Menus lentos só nos primeiros segundos: dados que chegam no começo
// (agenda, preços, widgets) redesenhavam a Início inteira por cima do toque.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const home=fs.readFileSync(path.join(__dirname,'../src/screens/Home.tsx'),'utf8');
const bell=fs.readFileSync(path.join(__dirname,'../src/components/NotificationCenter.tsx'),'utf8');
test('o que chega no começo atualiza a Início em transição, cedendo ao toque',()=>{
 for(const s of ['startTransition(()=>setAgendaCatalog(cat))','startTransition(()=>setSeries(rows))','startTransition(()=>setWidgets('])assert.ok(home.includes(s),s);
});
test('o resumo do sino não é forçado no meio dos toques do começo (sem prazo)',()=>{
 assert.ok(bell.includes("queueOptional('notifications:digest',()=>{void refreshDigest(api);},7);"));
});
