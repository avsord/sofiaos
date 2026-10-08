'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {Store}=require('../src/memory/store'),{BackupService,KeyStore}=require('../src/services/backup'),{verifyHistoryBackup}=require('../src/services/history-safety');
test('056 history preflight round-trips encrypted data without modifying messages, tasks or pages',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-history-056-')),s=new Store(path.join(dir,'data.sqlite'));t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true});});
 const c=s.createConversation('Preserved','mobile');s.userMessage({conversationId:c.id,clientId:crypto.randomUUID(),message:'Saved unchanged'});
 const before=JSON.stringify(s.export().tables.messages),b=new BackupService(s,path.join(dir,'backups'),new KeyStore(path.join(dir,'secure')));
 const first=verifyHistoryBackup(s,b);assert.equal(first.backup_verified,true);assert.equal(first.states[0].messages,1);assert.equal(b.list().length,1);assert.equal(JSON.stringify(s.export().tables.messages),before);
 verifyHistoryBackup(s,b);assert.equal(b.list().length,1);
});
test('056 a failed backup prevents the verification marker and never erases history',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-history-fail-')),s=new Store(path.join(dir,'data.sqlite'));t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true});});
 const c=s.createConversation('Kept','mobile');assert.throws(()=>verifyHistoryBackup(s,{create(){throw Error('disk failure');}}),/disk failure/);assert.equal(s.conversation(c.id).title,'Kept');assert.equal(s.db.prepare('SELECT value FROM settings WHERE key=?').get('historyVisibility056BackupVerified'),undefined);
});
