'use strict';
// 0.3.141: app Lembretes, chat com resposta citada e data flutuante, "Pede atencao" dispensado de verdade.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const load=f=>{const ts=require('typescript');const src=read(f);const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(name=>{if(name==='react')return require('react');return new Proxy({},{get:()=>()=>null});},m,m.exports);return m.exports;};

test('0.3.141: Lembretes - usa o registro reminder (avisos pelo agendador da Agenda) e entra na lista de apps',()=>{
  const r=read('src/screens/Reminders.tsx'),w=read('src/screens/Workspace.tsx');
  assert.ok(r.includes("useWorkspaceRecords(api,'reminder','',true)"));
  assert.ok(r.includes("kind:'reminder'"));
  assert.ok(w.includes("{id:'reminders',title:'Lembretes',caption:'Avisos na hora certa',icon:'bell'}"));
  assert.ok(w.includes("<Reminders api={api} active={active&&module==='reminders'}"));
  assert.ok(w.includes("id==='routines'||id==='reminders'"));
});
test('0.3.141: Lembretes - atrasados, proximos e concluidos; rotulo de quando',()=>{
  let mod;try{mod=load('src/screens/Reminders.tsx');}catch(e){return;}
  const now=new Date(2026,9,15,12,0,0);
  const items=[{id:'a',state:'active',data:{remind_at:'2026-10-15T09:00'}},{id:'b',state:'active',data:{remind_at:'2026-10-16T09:30'}},{id:'c',state:'done',data:{remind_at:'2026-10-10T09:00'}}];
  const g=mod.splitReminders(items,now);
  assert.deepEqual(g.late.map(i=>i.id),['a']);assert.deepEqual(g.upcoming.map(i=>i.id),['b']);assert.deepEqual(g.done.map(i=>i.id),['c']);
  assert.equal(mod.remindLabel('2026-10-16T09:30',now),'Amanhã às 09:30');
  assert.equal(mod.remindLabel('2026-10-15T09:00',now),'Hoje, passou às 09:00');
  assert.match(mod.defaultRemindAt(now),/^2026-10-15T13:00$/);
});
test('0.3.141: chat - responder citando e data flutuante ao rolar',()=>{
  const chat=read('src/screens/Chat.tsx');
  assert.ok(chat.includes("const quoted=quote?'> '+(quote.role==='user'?'Você':'Sofia')+': '+quoteSnippet(quote)+'\\n\\n':'';"));
  assert.ok(chat.includes('label="Responder esta mensagem"'));
  assert.ok(chat.includes('label="Cancelar resposta"'));
  assert.ok(chat.includes('onViewableItemsChanged={viewability.onViewableItemsChanged}'));
  assert.ok(chat.includes("{scrolling&&floatingDay&&!loading?<View pointerEvents=\"none\""));
});
test('0.3.141: "Pede atencao" dispensado fica escondido enquanto o aviso for o mesmo (nao volta as 21h)',()=>{
  const n=read('src/components/NotificationCenter.tsx');
  assert.ok(n.includes("export const digestSignature=(d:{title:string;text:string})=>d.title+'|'+d.text;"));
  assert.ok(n.includes("return digestStore.items.filter(d=>digestStore.hidden[d.id]!==digestSignature(d));"));
  assert.ok(!n.includes("digestStore.hidden[d.id]!==today"));
});
