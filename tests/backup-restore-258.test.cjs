'use strict';
// 0.3.258: ensaio de restauracao completo - backup criptografado de um servidor, restaurado em outro, separado.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');const {openBackup}=require('../src/services/backup');
test('backup completo volta inteiro num servidor separado (inclusive doses das Capsulas, widgets e eventos apagados do Google)',async t=>{
 const a=fixture(t);a.config.loginPassword='integration-test-password-only';a.config.loginEmail='owner@example.com';
 const ra=createRuntime(a.config,{store:a.store,provider:a.provider,secureDir:path.join(a.dir,'secure')});
 const w=ra.core.workspace;
 const page=w.save({kind:'user_page',title:'Roteiro',state:'active',data:{}});
 const acc=w.save({kind:'fin_account',title:'Conta',state:'active',data:{account_type:'corrente',initial_balance:'100'}});
 const tx=w.save({kind:'fin_tx',title:'Mercado',state:'active',data:{kind:'expense',amount:123.45,date:'2026-10-20',category:'Mercado',paid:true,account_id:acc.id}});
 const task=a.store.saveTask({title:'Ligar pro banco',state:'scheduled',due_at:'2026-10-29T12:00:00.000Z'});
 const db=a.store.db;
 db.prepare("INSERT INTO mobile_capsule_doses (owner,capsule_id,day,time,taken_at,title,dose_text) VALUES (?,?,?,?,?,?,?)").run('owner','cap1','2026-10-27','08:00','2026-10-27T11:00:00Z','Vitamina D','1 cápsula');
 ra.google.kvSet('dashboard_widgets',['agenda','goal']);
 db.prepare('INSERT INTO google_tombstones VALUES(?,?,?)').run('primary','evt-apagado',new Date().toISOString());
 const made=ra.backups.create('ensaio');
 const bytes=fs.readFileSync(path.join(ra.backups.directory,made.name));
 const snapshot=openBackup(bytes,{key:ra.backups.keyStore.get()});
 // servidor novo, vazio, em outra pasta
 const b=fixture(t);b.config.loginPassword='integration-test-password-only';b.config.loginEmail='owner@example.com';
 const rb=createRuntime(b.config,{store:b.store,provider:b.provider,secureDir:path.join(b.dir,'secure')});
 b.store.importSnapshot(snapshot);
 assert.equal(rb.core.workspace.get(page.id).title,'Roteiro');
 assert.equal(rb.core.workspace.get(tx.id).data.amount,123.45);
 assert.ok(b.store.tasks().some(x=>x.id===(task.id||task.item?.id)||x.title==='Ligar pro banco'));
 assert.equal(b.store.db.prepare('SELECT COUNT(*) n FROM mobile_capsule_doses').get().n,1,'historico de doses volta');
 assert.deepEqual(rb.google.kvGet('dashboard_widgets'),['agenda','goal'],'ordem dos widgets volta');
 assert.equal(b.store.db.prepare("SELECT COUNT(*) n FROM google_tombstones WHERE event_id='evt-apagado'").get().n,1,'evento apagado do Google nao ressuscita');
 // senhas e sessoes continuam fora de proposito
 assert.ok(!('google_link' in (snapshot.extra||{}))&&!('mobile_sessions' in (snapshot.extra||{})));
});
