'use strict';
// 0.3.146: reserva sem meta final; movimento da reserva valida valor e sentido.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('reserva (Dinheiro guardado) salva sem meta final; objetivo comum continua exigindo valor',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const r=w.save({kind:'fin_goal',title:'Dinheiro guardado',area:'Pessoal',data:{role:'reserve',saved:15000,monthly_plan:4000,target:''}});
 assert.equal(r.data.role,'reserve');assert.equal(r.data.saved,15000);assert.equal(r.data.monthly_plan,4000);
 assert.throws(()=>w.save({kind:'fin_goal',title:'Viagem',area:'Pessoal',data:{target:''}}),/valor do objetivo/);
 const mv=w.save({kind:'fin_reserve_move',title:'Aporte',area:'Pessoal',data:{goal_id:r.id,direction:'in',amount:4000,date:'2026-10-15',note:''}});
 assert.equal(mv.data.amount,4000);
 assert.throws(()=>w.save({kind:'fin_reserve_move',title:'X',area:'Pessoal',data:{goal_id:r.id,direction:'in',amount:0,date:'2026-10-15',note:''}}),/valor/);
});
