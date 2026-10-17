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

test('0.3.154: compromisso aceita prioridade pelo update_record (Importante), como a tarefa',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const c=w.save({kind:'commitment',title:'Levar encomendas do Mercado Livre',area:'Pessoal',data:{start_at:'2026-10-20T13:00:00.000Z'}});
 const saved=w.save({...c,data:{...c.data,priority_level:'important'}},c.id);
 assert.equal(saved.data.priority_level,'important');
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','src/core/sofia-core.js'),'utf8');
 assert.ok(src.includes("(field==='priority_level'||field==='priority')&&def.fields.some(f=>f.key==='priority_level')"));
 assert.ok(require('node:fs').readFileSync(require('node:path').join(__dirname,'..','src/services/intent-engine.js'),'utf8').includes('COMPROMISSOS DA AGENDA também têm prioridade'));
});
