'use strict';
const fs=require('node:fs');
const EXTRA_TABLES=['entities','entity_versions','relations','events','observations','notifications','jobs','attachments','vault_entries','vault_state','routing_log','route_reservations','annotations'];
const SQL=`
CREATE TABLE IF NOT EXISTS entities (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
 content TEXT NOT NULL DEFAULT '', area TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
 privacy TEXT NOT NULL DEFAULT 'private', state TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
 source_id TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS entity_kind ON entities(kind,state,updated_at);
CREATE TABLE IF NOT EXISTS entity_versions(id TEXT PRIMARY KEY,entity_id TEXT NOT NULL REFERENCES entities(id),revision INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(entity_id,revision)) STRICT;
CREATE TABLE IF NOT EXISTS relations(id TEXT PRIMARY KEY,from_type TEXT NOT NULL,from_id TEXT NOT NULL,to_type TEXT NOT NULL,to_id TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(from_type,from_id,to_type,to_id,kind)) STRICT;
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,event TEXT NOT NULL,area TEXT NOT NULL,summary TEXT NOT NULL,created_at TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,monitor_id TEXT NOT NULL REFERENCES entities(id),price_cents INTEGER NOT NULL,shipping_cents INTEGER NOT NULL,total_cents INTEGER NOT NULL,currency TEXT NOT NULL,variant TEXT NOT NULL,source TEXT NOT NULL,observed_at TEXT NOT NULL,recorded_at TEXT NOT NULL,source_key TEXT,UNIQUE(monitor_id,source_key)) STRICT;
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,category TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,entity_id TEXT,importance TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'unread',dedup TEXT UNIQUE,created_at TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,entity_id TEXT NOT NULL REFERENCES entities(id),kind TEXT NOT NULL,state TEXT NOT NULL,next_at TEXT,last_at TEXT,last_error TEXT,interval_minutes INTEGER NOT NULL,run_count INTEGER NOT NULL DEFAULT 0,UNIQUE(entity_id,kind)) STRICT;
CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,entity_id TEXT NOT NULL REFERENCES entities(id),name TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,blob BLOB NOT NULL,created_at TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS vault_entries(id TEXT PRIMARY KEY,owner TEXT NOT NULL,iv TEXT NOT NULL,tag TEXT NOT NULL,ciphertext TEXT NOT NULL,revision INTEGER NOT NULL,previous_id TEXT,created_at TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS vault_state(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS routing_log(id TEXT PRIMARY KEY,message_id TEXT,route TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS route_reservations(id TEXT PRIMARY KEY,attempt_id TEXT,route TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,input_bound INTEGER NOT NULL,output_bound INTEGER NOT NULL,reserved_microusd INTEGER NOT NULL,charged_microusd INTEGER NOT NULL,input_tokens INTEGER,output_tokens INTEGER,created_at TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS annotations(entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,tags TEXT NOT NULL,privacy TEXT NOT NULL DEFAULT 'private',PRIMARY KEY(entity_type,entity_id)) STRICT;
`;
function migrate45(db,filename,version) {
  // A physical, locally protected pre-migration copy is kept; it may contain plaintext v44 data.
  if(version===1&&filename!==':memory:'&&fs.existsSync(filename)) {
    const dest=filename+'.before-v45';
    if(!fs.existsSync(dest)) { db.exec('PRAGMA wal_checkpoint(FULL);');fs.copyFileSync(filename,dest,fs.constants.COPYFILE_EXCL);try{fs.chmodSync(dest,0o600);}catch{} }
  }
  db.exec('BEGIN IMMEDIATE');
  try{db.exec(SQL);db.exec('PRAGMA user_version=2; COMMIT;');}catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={EXTRA_TABLES,migrate45};
