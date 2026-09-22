'use strict';
const fs=require('node:fs');
const EXTRA_TABLES_49=['intent_decisions','pending_intents'];
const SQL=`
CREATE TABLE IF NOT EXISTS intent_decisions(
 id TEXT PRIMARY KEY,
 message_id TEXT NOT NULL,
 route TEXT NOT NULL,
 intent TEXT NOT NULL,
 confidence REAL NOT NULL,
 explicit_action INTEGER NOT NULL DEFAULT 0,
 needs_context INTEGER NOT NULL DEFAULT 0,
 clarification INTEGER NOT NULL DEFAULT 0,
 plan_json TEXT NOT NULL,
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS intent_decisions_message ON intent_decisions(message_id,created_at);
CREATE TABLE IF NOT EXISTS pending_intents(
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL,
 conversation_id TEXT NOT NULL,
 source_message_id TEXT NOT NULL,
 route TEXT NOT NULL,
 plan_json TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'open',
 created_at TEXT NOT NULL,
 resolved_at TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS pending_intents_conversation ON pending_intents(conversation_id,state,created_at);
`;
function migrate49(db,filename,version){
 if(version>=5)return;
 if(version===4&&filename!==':memory:'&&fs.existsSync(filename)){
   const dest=filename+'.before-v49';
   if(!fs.existsSync(dest)){db.exec('PRAGMA wal_checkpoint(FULL);');fs.copyFileSync(filename,dest,fs.constants.COPYFILE_EXCL);try{fs.chmodSync(dest,0o600);}catch{}}
 }
 db.exec('BEGIN IMMEDIATE');
 try{db.exec(SQL);db.exec('PRAGMA user_version=5; COMMIT;');}catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={EXTRA_TABLES_49,migrate49};
