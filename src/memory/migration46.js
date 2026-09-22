'use strict';
const fs=require('node:fs');
const EXTRA_TABLES_46=['route_decisions','privacy_rules','vault_meta'];
const SQL=`
CREATE TABLE IF NOT EXISTS route_decisions(
 id TEXT PRIMARY KEY,message_id TEXT,requested_mode TEXT NOT NULL,route TEXT NOT NULL,
 reason TEXT NOT NULL,context_used INTEGER NOT NULL DEFAULT 0,context_refs TEXT NOT NULL DEFAULT '[]',
 protected INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS route_decisions_message ON route_decisions(message_id,created_at);
CREATE TABLE IF NOT EXISTS privacy_rules(
 id TEXT PRIMARY KEY,scope TEXT NOT NULL,value TEXT NOT NULL,route TEXT NOT NULL,
 source TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(scope,value)
) STRICT;
CREATE TABLE IF NOT EXISTS vault_meta(
 entry_id TEXT PRIMARY KEY,category TEXT NOT NULL DEFAULT 'Diário Pessoal',
 role TEXT NOT NULL DEFAULT 'entry',session_id TEXT,labels TEXT NOT NULL DEFAULT '[]',source_channel TEXT NOT NULL DEFAULT 'local'
) STRICT;
`;
function migrate46(db,filename,version){
 if(version>=3)return;
 // Preserve an exact v45 database image before the one-way schema migration.
 if(version===2&&filename!==':memory:'&&fs.existsSync(filename)){
   const dest=filename+'.before-v46';
   if(!fs.existsSync(dest)){db.exec('PRAGMA wal_checkpoint(FULL);');fs.copyFileSync(filename,dest,fs.constants.COPYFILE_EXCL);try{fs.chmodSync(dest,0o600);}catch{}}
 }
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(SQL);
  db.exec("UPDATE entities SET privacy='shared' WHERE privacy='public';");
  db.exec("UPDATE annotations SET privacy='shared' WHERE privacy='public';");
  db.exec("UPDATE entities SET privacy='shared' WHERE privacy='private' AND kind IN ('course','lesson','study_progress','recipe','music','film','video','reading','source','asset','purchase','monitor');");
  db.exec("INSERT OR IGNORE INTO vault_meta(entry_id,category,role,session_id,labels,source_channel) SELECT id,'Diário Pessoal','entry',NULL,'[]','local' FROM vault_entries;");
  db.exec('PRAGMA user_version=3; COMMIT;');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={EXTRA_TABLES_46,migrate46};
