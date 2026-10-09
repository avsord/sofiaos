'use strict';
const fs=require('node:fs');
const EXTRA_TABLES_82=['task_details'];
const SQL=`
CREATE TABLE IF NOT EXISTS task_details(
 task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
 description TEXT NOT NULL DEFAULT '',
 location TEXT NOT NULL DEFAULT '',
 color TEXT NOT NULL DEFAULT 'default',
 notifications_json TEXT NOT NULL DEFAULT '[]'
) STRICT;
`;
function migrate82(db,filename,version){
 if(version>=6)return;
 if(version===5&&filename!==':memory:'&&fs.existsSync(filename)){
   const dest=filename+'.before-v82';
   if(!fs.existsSync(dest)){db.exec('PRAGMA wal_checkpoint(FULL);');fs.copyFileSync(filename,dest,fs.constants.COPYFILE_EXCL);try{fs.chmodSync(dest,0o600);}catch{}}
 }
 db.exec('BEGIN IMMEDIATE');
 try{db.exec(SQL);db.exec('PRAGMA user_version=6; COMMIT;');}catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={EXTRA_TABLES_82,migrate82};
