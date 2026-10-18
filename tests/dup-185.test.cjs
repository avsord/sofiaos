'use strict';
// 0.3.185: confirmar o salario do mes duas vezes nao pode somar duas vezes.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('segunda copia da mesma ocorrencia (serie + mes) vira atualizacao, nao um registro novo',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const conta=w.save({kind:'fin_account',title:'Conta',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true}});
 const sal=w.save({kind:'fin_tx',title:'Salário',area:'Pessoal',data:{kind:'income',amount:7821,date:'2026-09-25',account_id:conta.id,paid:true,category:'Salário',recurrence:'monthly',import_id:'sofia-pendencia:s'}});
 const copia={kind:'fin_tx',title:'Salário',area:'Pessoal',data:{kind:'income',amount:7821,date:'2026-10-25',account_id:conta.id,paid:true,category:'Salário',recurrence:'none',series_id:sal.id,import_id:'sofia-pendencia:'+sal.id+':2026-10-25'}};
 const a=w.save(copia);const b=w.save(copia);
 assert.equal(a.id,b.id,'mesma ocorrencia, mesmo registro');
 const outubro=w.list({kind:'fin_tx',limit:50}).filter(e=>String(e.data.date).startsWith('2026-10'));
 assert.equal(outubro.length,1);
 // um mes diferente continua criando o seu
 const nov=w.save({...copia,data:{...copia.data,date:'2026-11-25'}});assert.notEqual(nov.id,a.id);
});

test('0.3.186: copias repetidas que ja existiam sao corrigidas sozinhas; fica uma por mes',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const conta=w.save({kind:'fin_account',title:'Conta',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true}});
 const sal=w.save({kind:'fin_tx',title:'Salário',area:'Pessoal',data:{kind:'income',amount:7821,date:'2026-09-25',account_id:conta.id,paid:true,category:'Salário',recurrence:'monthly',import_id:'sofia-pendencia:s'}});
 // simula versoes antigas: copias criadas direto no banco, sem passar pela protecao
 const raw=(date,paid)=>{const e=w.save({kind:'fin_tx',title:'Salário',area:'Pessoal',data:{kind:'income',amount:7821,date:'2026-12-01',account_id:conta.id,paid,category:'Salário',recurrence:'none'}});
   w.db.prepare("UPDATE entities SET data=json_set(data,'$.series_id',?,'$.date',?) WHERE id=?").run(sal.id,date,e.id);return e.id;};
 raw('2026-09-25',true);raw('2026-10-25',true);raw('2026-10-25',true);
 const r=w.repairFinanceDuplicates();
 assert.equal(r.removed,2,'a copia de setembro (o original fica) e uma das duas de outubro');
 const left=w.list({kind:'fin_tx',limit:50});
 assert.equal(left.filter(e=>String(e.data.date).startsWith('2026-09')).length,1);
 assert.equal(left.filter(e=>String(e.data.date).startsWith('2026-10')).length,1);
 assert.ok(w.get(sal.id),'o original da serie nunca sai');
 assert.equal(w.repairFinanceDuplicates().removed,0,'rodar de novo nao mexe em nada');
});
