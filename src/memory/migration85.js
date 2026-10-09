'use strict';
const fs=require('node:fs');
function hasColumn(db,table,column){return db.prepare(`PRAGMA table_info(${table})`).all().some(x=>x.name===column);}
function migrate85(db,filename,version){
  if(version>=7)return;
  if(version===6&&filename!==':memory:'&&fs.existsSync(filename)){
    const dest=filename+'.before-v85';
    if(!fs.existsSync(dest)){db.exec('PRAGMA wal_checkpoint(FULL);');fs.copyFileSync(filename,dest,fs.constants.COPYFILE_EXCL);try{fs.chmodSync(dest,0o600);}catch{}}
  }
  db.exec('BEGIN IMMEDIATE');
  try{
    if(!hasColumn(db,'task_details','priority_level'))db.exec("ALTER TABLE task_details ADD COLUMN priority_level TEXT NOT NULL DEFAULT 'none'");
    db.exec("UPDATE task_details SET priority_level='important' WHERE priority_level='none' AND task_id IN (SELECT id FROM tasks WHERE priority=1)");
    db.exec('PRAGMA user_version=7; COMMIT;');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={migrate85};
