'use strict';
// 0.3.159: aporte do mes com dia, horas e lembretes; retirada a recompor x planejada; mes nao acumula.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function fixture(){
  const f=load('src/lib/finance.ts');
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:20000,include_total:true}});
  const reserve=f.toGoal({id:'g1',kind:'fin_goal',title:'Dinheiro guardado',state:'active',
    data:{role:'reserve',saved:15000,monthly_plan:4000,plan_day:5,remind_before_days:2,remind_time:'09:00',remind_repeat_days:3}});
  const mv=(id,dir,amount,date,planned=false)=>f.toReserveMove({id,kind:'fin_reserve_move',title:id,state:'active',data:{goal_id:'g1',direction:dir,amount,date,planned}});
  const split=(moves,today='2026-10-16')=>f.moneySplit(reserve,moves,[acc],[],[], '2026-10',today,[]);
  return {f,mv,split};
}
test('retirada a recompor soma ao que falta no mes; a planejada nao',()=>{
  const {f,mv,split}=fixture();
  let s=split([]);assert.equal(s.monthTarget,4000);assert.equal(s.missing,4000);assert.equal(s.closed,false);
  s=split([mv('m1','out',1000,'2026-10-10')]);
  assert.equal(s.takenBack,1000);assert.equal(s.monthTarget,5000);assert.equal(s.missing,5000);assert.equal(s.saved,14000);
  s=split([mv('m2','out',10000,'2026-10-10',true)]);
  assert.equal(s.takenBack,0);assert.equal(s.monthTarget,4000);assert.equal(s.missing,4000);assert.equal(s.saved,5000,'o dinheiro sai de verdade');
  s=split([mv('m3','in',4000,'2026-10-05'),mv('m4','out',1000,'2026-10-10')]);
  assert.equal(s.realized,4000);assert.equal(s.missing,1000);
  s=split([mv('m5','in',5000,'2026-10-05'),mv('m6','out',1000,'2026-10-10')]);
  assert.equal(s.missing,0);assert.equal(s.closed,true);
});
test('o mes nao acumula: novembro recomeca no valor do aporte',()=>{
  const {f,mv}=fixture();
  const acc=f.toAccount({id:'a1',kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:20000,include_total:true}});
  const reserve=f.toGoal({id:'g1',kind:'fin_goal',title:'R',state:'active',data:{role:'reserve',saved:15000,monthly_plan:4000,plan_day:5}});
  const s=f.moneySplit(reserve,[mv('m1','out',1000,'2026-10-10')],[acc],[],[], '2026-11','2026-11-02',[]);
  assert.equal(s.monthTarget,4000);assert.equal(s.takenBack,0);
});
test('resumo curto da faixa muda conforme o mes',()=>{
  const {f,mv,split}=fixture();
  assert.equal(f.reserveBadge(split([]),'2026-10-02'),'R$ 4.000,00 · dia 5');
  assert.equal(f.reserveBadge(split([]),'2026-10-16'),'faltam R$ 4.000,00');
  assert.equal(f.reserveBadge(split([mv('m1','in',2500,'2026-10-05')]),'2026-10-16'),'+R$ 2.500,00 de R$ 4.000,00');
  assert.equal(f.reserveBadge(split([mv('m2','in',4000,'2026-10-05')]),'2026-10-16'),'✓ em dia');
});
test('lembretes do aporte: antes, no dia e repetindo ate fechar',()=>{
  const n=load('src/lib/finance-notifications.ts',{'@react-native-async-storage/async-storage':{default:{getItem:async()=>null,setItem:async()=>{}}},'./finance':require('./load-ts.cjs')('src/lib/finance.ts'),'expo-notifications':{SchedulableTriggerInputTypes:{DATE:'date'}},'./system-notification-permission':{ensureSystemNotificationPermission:async()=>true},'./notification-scheduler':{enqueueNotifications:async()=>'',reconcileNotificationRequests:async()=>({}),notificationFailure:()=>'',NOTIFICATION_SIGNATURE_VERSION:1}});
  const {split}=fixture();
  const alarms=n.reservePlanAlarms(split([]),'Guardado',new Date(2026,9,1,8,0,0));
  const ids=alarms.map(a=>a.id);
  assert.ok(ids.includes('before')&&ids.includes('day'),'antes e no dia');
  assert.ok(ids.filter(x=>x.startsWith('again-')).length>=2,'repete ate aportar');
  const day=alarms.find(a=>a.id==='day');assert.equal(day.date.getDate(),5);assert.equal(day.date.getHours(),9,'uma hora so: a do aviso');
  const before=alarms.find(a=>a.id==='before');assert.equal(before.date.getDate(),3);assert.equal(before.date.getHours(),9);
});
test('tela: faixa com numero branco e resumo curto; secao de aportes e escolha na retirada',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("color: '#fff', fontWeight: '700', fontSize: 18"));assert.ok(!s.includes("'#0d2f1f'"));
  assert.ok(s.includes('Aportes de {monthLabel(month)}'));assert.ok(!s.includes('Guardar agora'),'sem botoes duplicados na secao de aportes');assert.ok(s.includes("['Editar aportes', 'plan']"));assert.ok(s.includes("['Histórico da reserva', 'history']"));
  assert.ok(s.includes("[true, 'Retirada planejada'"));assert.ok(s.includes("[false, 'Recompor este mês'"));
  assert.ok(s.includes("label: 'A cada 3 dias até aportar'"));assert.ok(s.includes("input('Todo dia (1 a 28)'"));assert.ok(s.includes('<DateTimeField label="Avisar às" value={remindTime}'),'0.3.172: hora pelo seletor');assert.ok(!s.includes('Hora do lembrete'));assert.ok(!s.includes('plan_time'));
  assert.ok(s.includes('Parar os aportes'));
});

test('historico da reserva: por mes, mais recente primeiro, com entradas, saidas e rotulo de cada retirada',()=>{
  const {f,mv}=fixture();
  const moves=[mv('a','in',4000,'2026-09-05'),mv('b','in',2500,'2026-10-05'),mv('c','out',1000,'2026-10-10'),mv('d','out',10000,'2026-10-12',true),mv('e','in',500,'2026-10-20')];
  const h=f.reserveHistory(moves,'g1');
  assert.equal(h.length,2);assert.equal(h[0].month,'2026-10');assert.equal(h[1].month,'2026-09');
  assert.equal(h[0].in,3000);assert.equal(h[0].out,11000);assert.equal(h[0].net,-8000);
  assert.equal(h[0].items.map(i=>i.id).join(','),'e,d,c,b','mais recente primeiro dentro do mes');
  assert.equal(f.reserveMoveLabel(moves[0]),'Aporte');assert.equal(f.reserveMoveLabel(moves[2]),'Retirada a recompor');assert.equal(f.reserveMoveLabel(moves[3]),'Retirada planejada');
  assert.equal(f.reserveHistory(moves,'outra').length,0);
});
