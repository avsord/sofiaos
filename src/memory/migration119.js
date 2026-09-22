'use strict';
const fs=require('node:fs');
function hasColumn(db,table,column){return db.prepare(`PRAGMA table_info(${table})`).all().some(x=>x.name===column);}
function migrate119(db,filename,version){
  if(version>=8)return;
  if(version===7&&filename!==':memory:'&&fs.existsSync(filename)){
    const dest=filename+'.before-v119';
    if(!fs.existsSync(dest)){db.exec('PRAGMA wal_checkpoint(FULL);');fs.copyFileSync(filename,dest,fs.constants.COPYFILE_EXCL);try{fs.chmodSync(dest,0o600);}catch{}}
  }
  db.exec('BEGIN IMMEDIATE');
  try{
    if(!hasColumn(db,'task_details','calendar_provider'))db.exec("ALTER TABLE task_details ADD COLUMN calendar_provider TEXT NOT NULL DEFAULT 'local'");
    if(!hasColumn(db,'task_details','external_calendar_id'))db.exec("ALTER TABLE task_details ADD COLUMN external_calendar_id TEXT NOT NULL DEFAULT ''");
    if(!hasColumn(db,'task_details','external_event_id'))db.exec("ALTER TABLE task_details ADD COLUMN external_event_id TEXT NOT NULL DEFAULT ''");
    if(!hasColumn(db,'task_details','sync_state'))db.exec("ALTER TABLE task_details ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'local'");
    db.exec('PRAGMA user_version=8; COMMIT;');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={migrate119};
