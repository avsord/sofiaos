'use strict';
// 0.3.182: um registro de Financas apagado por engano pode ser recuperado dos backups diarios.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {BackupService,KeyStore}=require('../src/services/backup.js');
test('apagado depois do backup aparece como recuperavel e volta com os mesmos dados',t=>{
 const {core,store}=fixture(t);const w=core.workspace;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-bkp-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const backups=new BackupService(store||core.store,dir,new KeyStore(dir));
 const conta=w.save({kind:'fin_account',title:'Conta',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true}});
 const ed=w.save({kind:'fin_tx',title:'Edivaldo',area:'Pessoal',data:{kind:'expense',amount:350,date:'2026-10-20',account_id:conta.id,paid:false,category:'Contas',recurrence:'monthly',import_id:'sofia-pendencia:x'}});
 backups.create('daily');
 w.deleteEntity(ed.id);
 const exists=id=>{try{w.get(id);return true;}catch{return false;}};
 const list=backups.recoverable(['fin_tx'],exists);
 assert.equal(list.length,1);assert.equal(list[0].title,'Edivaldo');assert.equal(list[0].data.amount,350);
 const back=w.save({kind:list[0].kind,title:list[0].title,area:list[0].area,privacy:list[0].privacy,state:'active',tags:list[0].tags,data:list[0].data});
 assert.equal(back.title,'Edivaldo');assert.equal(back.data.recurrence,'monthly');assert.equal(back.data.amount,350);
 assert.equal(backups.recoverable(['fin_tx'],id=>id===back.id||exists(id)).length,1,'o original apagado continua listado ate a pessoa restaurar (id antigo)');
});

test('0.3.183: conta oculta (arquivada) tambem aparece e volta a ficar ativa',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const conta=w.save({kind:'fin_account',title:'Conta',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true}});
 const vivo=w.save({kind:'fin_tx',title:'Vivo',area:'Pessoal',data:{kind:'expense',amount:47,date:'2026-10-17',account_id:conta.id,paid:false,category:'Contas',recurrence:'monthly',import_id:'sofia-pendencia:v'}});
 const arch=w.save({...vivo,state:'archived'},vivo.id);
 assert.equal(arch.state,'archived');
 const listed=w.list({kind:'fin_tx',limit:50}).filter(e=>e.state==='archived');
 assert.equal(listed.length,1,'a lista de ocultas enxerga a arquivada');
 const back=w.save({...arch,state:'active'},arch.id);assert.equal(back.state,'active');
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','src/channels/mobile.js'),'utf8');
 assert.ok(src.includes("if (e.state === 'archived') hidden.push("));
 assert.ok(src.includes("if (cur && cur.state === 'archived') return send(workspace.save({...cur, state: 'active'}, cur.id));"));
});
