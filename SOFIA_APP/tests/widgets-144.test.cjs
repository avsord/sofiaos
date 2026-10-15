'use strict';
// 0.3.144: widgets do Inicio para Lembretes e Encomendas.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('0.3.144: Lembretes e Encomendas viram widgets do Inicio, aceitos pelo app e pelo servidor',()=>{
  const home=read('src/screens/Home.tsx'),api=read('src/lib/api.ts'),server=fs.readFileSync(path.join(root,'..','src/channels/mobile.js'),'utf8');
  assert.ok(home.includes("export const HOME_WIDGET_IDS=['monitoring','tasks','capsules','reminders','packages'];"));
  assert.ok(!home.includes("['monitoring','tasks','capsules'].includes(x)"),'os filtros antigos nao descartam os widgets novos');
  assert.ok(home.includes("{id:'reminders',title:'Lembretes',content:<RemindersWidget"));
  assert.ok(home.includes("{id:'packages',title:'Encomendas',content:<PackagesWidget"));
  assert.ok(api.includes("['monitoring','tasks','capsules','reminders','packages'].includes(w)"));
  assert.ok(server.includes("const allowedWidgets = ['monitoring', 'tasks', 'capsules', 'reminders', 'packages'];"));
});
test('0.3.144: widgets abrem o app certo e so carregam quando o Inicio esta visivel',()=>{
  const w=read('src/components/HomeListWidgets.tsx'),ws=read('src/screens/Workspace.tsx'),home=read('src/screens/Home.tsx');
  assert.ok(w.includes("useEffect(()=>{if(active)void records.load();},[active,api]);"));
  assert.ok(home.includes("onOpenModule?onOpenModule('reminders'):navigate('apps')"));
  assert.ok(home.includes("onOpenModule?onOpenModule('packages'):navigate('apps')"));
  assert.ok(ws.includes("['reminders','packages'].includes(openModuleId)"));
});
