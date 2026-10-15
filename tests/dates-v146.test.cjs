'use strict';
// 0.3.146: horario sem fuso e lido no fuso da Sofia; com fuso continua igual; texto invalido segue recusado.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('lembrete "hoje as 10h" sem fuso vira 10h de Sao Paulo (13h UTC); com fuso nao muda',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const a=w.save({kind:'reminder',title:'A',area:'Pessoal',data:{remind_at:'2026-10-15T10:00',message:'',location:''}});
 assert.equal(a.data.remind_at,'2026-10-15T13:00:00.000Z');
 const b=w.save({kind:'reminder',title:'B',area:'Pessoal',data:{remind_at:'2026-10-15T10:00:00-03:00',message:'',location:''}});
 assert.equal(b.data.remind_at,'2026-10-15T13:00:00.000Z');
 const c=w.save({kind:'reminder',title:'C',area:'Pessoal',data:{remind_at:'2026-01-10 09:30',message:'',location:''}});
 assert.equal(c.data.remind_at,'2026-01-10T12:30:00.000Z');
 assert.throws(()=>w.save({kind:'reminder',title:'D',area:'Pessoal',data:{remind_at:'amanha',message:'',location:''}}),/data e hora/);
});
