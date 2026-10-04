'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');const {fixture}=require('./helpers.cjs');
const {snapshot}=require('../tools/snapshot-server.cjs'),{verify}=require('../tools/verify-snapshot.cjs');
test('full snapshot restores SQLite tables omitted by portable export, auth files and keys; detects tampering',t=>{
 const f=fixture(t),root=f.dir;
 fs.mkdirSync(path.join(root,'src/config'),{recursive:true});fs.writeFileSync(path.join(root,'src/config/runtime.js'),"module.exports.makeConfig=({root})=>({dataDir:require('path').join(root,'data')})");
 const secure=path.join(root,'secure');fs.mkdirSync(secure);fs.writeFileSync(path.join(secure,'backup-master-v1.key'),Buffer.alloc(32,7));fs.writeFileSync(path.join(root,'data/owner-auth.json'),JSON.stringify({password_hash:'synthetic-test'}));
 f.store.db.exec("CREATE TABLE custom_live_table(id TEXT, value BLOB);INSERT INTO custom_live_table VALUES('test',x'010203');");f.store.saveTask({title:'Backup real de teste'});
 const pack=snapshot(root,{secureDir:secure}),unpacked=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-restore-check-'));t.after(()=>{fs.rmSync(unpacked,{recursive:true,force:true});fs.rmSync(pack.archive.slice(0,-7),{recursive:true,force:true});fs.rmSync(pack.archive,{force:true});});
 execFileSync('tar',['-xzf',pack.archive,'-C',unpacked]);assert.equal(verify(unpacked).verified,true);const manifest=JSON.parse(fs.readFileSync(path.join(unpacked,'manifest.json')));assert.equal(manifest.databases[0].tables.custom_live_table,1);assert.equal(fs.readFileSync(path.join(unpacked,'secure/backup-master-v1.key')).length,32);assert.equal(JSON.parse(fs.readFileSync(path.join(unpacked,'data/owner-auth.json'))).password_hash,'synthetic-test');
 fs.appendFileSync(path.join(unpacked,'data/owner-auth.json'),'tampered');assert.throws(()=>verify(unpacked),/mismatch/);
});
