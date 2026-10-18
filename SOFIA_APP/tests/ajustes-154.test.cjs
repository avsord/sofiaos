'use strict';
// 0.3.154: capsulas que nao ficam vermelhas para sempre, "tomei" pelo segundo arrastar, fila no chat, janelas em coluna.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const load=require('./load-ts.cjs');
test('capsulas: dose some da vermelhidao depois de 6 h; sino so mostra o dia de hoje; id do aviso vira a dose',()=>{
  const m=load('src/lib/capsule-model.ts');
  const plan={id:'p1',kind:'capsule',title:'Dipirona',state:'active',data:{times_json:'["09:00"]',repeat_type:'daily',start_date:'2026-10-01'}};
  const dose=hour=>m.capsuleDoses([plan],[],'2026-10-16',new Date('2026-10-16T'+hour+':00'))[0];
  assert.equal(dose('09:30').due,true);assert.equal(dose('09:30').missed,false,'ainda "Hora de tomar"');
  assert.equal(dose('16:00').missed,true,'passou da janela: nao tomada, nao vermelha');
  assert.equal(JSON.stringify(m.capsuleDoseOfNotice('local:capsule:p1:2026-10-16:09:00')),JSON.stringify({planId:'p1',day:'2026-10-16',time:'09:00'}));
  assert.equal(JSON.stringify(m.capsuleDoseOfNotice('local:capsule:abc-123:2026-10-16:21:30:early')),JSON.stringify({planId:'abc-123',day:'2026-10-16',time:'21:30'}));
  assert.equal(m.capsuleDoseOfNotice('local:routine:x'),null);
  const bell=read('src/lib/bell-inbox.ts');
  assert.ok(bell.includes('i===0?capsuleDoses(plans,history,day,now):[]'));assert.ok(bell.includes("n.category==='capsule'&&(Date.parse(n.created_at)<dayStart"));
});
test('notificacoes: 1o arrastar = lida; arrastar de novo em aviso de capsula = tomei',()=>{
  const n=read('src/components/NotificationCenter.tsx');
  assert.ok(n.includes("onRead={unread?()=>void notices.read(item):dose?()=>void takeDose():undefined}"));
  assert.ok(n.includes("readLabel={unread?'✓ Lida':'💊 Tomei'}"));
  assert.ok(n.includes('capsuleStore(notices.api).take(dose.planId,dose.day,dose.time,true)'));
});
test('chat: varias mensagens enquanto a Sofia responde (fila em ordem), sem perder a conversa',()=>{
  const c=read('src/screens/Chat.tsx');
  assert.ok(c.includes("if(sendLock.current){if(sendQueue.current.length>=8)"));
  assert.ok(c.includes("const next=sendQueue.current.shift();if(next&&mounted.current)void sendRef.current(next.message,next.retry);"));
  assert.ok(c.includes("let targetId=conversation?.id||currentId.current||'';"));
});
test('janelas: 3 ou mais botoes viram lista em coluna com Cancelar separado',()=>{
  const a=read('src/lib/app-alert.tsx');
  assert.ok(a.includes("stacked=buttons.length>2||buttons.some(b=>(b.text||'').length>14)"));
  assert.ok(a.includes('{others.map((b,i)=>action(b,i,false,false))}'));
});

test('0.3.189: dose de um dia que ja passou sai sozinha da bandeja do Android, do sino e do Inicio',()=>{
  const n=read('src/lib/capsule-notifications.ts'),b=read('src/lib/bell-inbox.ts');
  assert.ok(n.includes("const data=n.request.content.data||{},past=String(data.day||'')<today;"),'bandeja: dia passado');
  assert.ok(n.includes('if(past||taken)await Notifications.dismissNotificationAsync('),'tirada ou tomada');
  assert.ok(b.includes("if(d.sofiaCapsule&&String(d.day||'')<capsuleDay(new Date(date)))return null;"),'nao volta ao reabrir o app');
  assert.ok(b.includes("String(capsuleDoseOfNotice(n.id)?.day||'9999')<capsuleDay(new Date(this.now()))"),'as que ja estavam guardadas saem pelo dia da dose');
});
